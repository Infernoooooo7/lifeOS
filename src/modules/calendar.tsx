'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { openEditor } from '@/core/app';
import type { Rec } from '@/core/data/db';
import { useEnabledModules, useNow, usePrefs, useRecords } from '@/core/data/hooks';
import { create, createMany, titleOf } from '@/core/data/store';
import { downloadFile } from '@/core/lib/backup';
import { addDays, addMonths, endOfDay, endOfMonth, fmtDuration, fmtTime, parseDate, sameDay, startOfDay, startOfMonth, startOfWeek, ymd } from '@/core/lib/dates';
import { parseIcs, toIcs, type IcsEvent } from '@/core/lib/ics';
import { occurrences, type Recurrence } from '@/core/lib/recurrence';
import { Page, type ModuleProps } from '@/shell/Page';
import { Icon } from '@/ui/icons';
import { Button, Empty, IconButton, Menu, Segmented, Sheet, cx } from '@/ui/kit';
import { MonthGrid, type CalItem } from '@/ui/MonthGrid';
import { toast } from '@/ui/overlays';

type View = 'month' | 'week' | 'day' | 'agenda';
interface Occ {
  key: string;
  rec: Rec;
  collection: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
  done?: boolean;
  conflict?: boolean;
}

const HOUR = 46;
const hhmm = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Time shown in the event's own time zone, when it has one. */
function inZone(date: Date, zone?: string): string | null {
  if (!zone) return null;
  try {
    return `${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: zone })} ${zone.split('/').pop()?.replace(/_/g, ' ')}`;
  } catch {
    return null;
  }
}

/** Expand events (with recurrence) and other dated records into occurrences inside [from, to]. */
function useOccurrences(from: Date, to: Date, hidden: Set<string>, layers: { tasks: boolean; other: boolean }): Occ[] {
  const events = useRecords('events');
  const calendars = useRecords('calendars');
  const tasks = useRecords('tasks');
  const milestones = useRecords('milestones');
  const assignments = useRecords('assignments');
  const exams = useRecords('exams');
  const dates = useRecords('dates');
  const subscriptions = useRecords('subscriptions');
  const enabled = useEnabledModules();
  return useMemo(() => {
    const colors = new Map(calendars.map((c) => [c.id, (c.color as string) ?? 'var(--blue)']));
    const out: Occ[] = [];
    for (const e of events) {
      if (e.calendarId && hidden.has(e.calendarId)) continue;
      const start = parseDate(e.startAt);
      if (!start) continue;
      const dur = Math.max(0, (parseDate(e.endAt)?.getTime() ?? start.getTime() + 3_600_000) - start.getTime());
      for (const at of occurrences(start, e.recurrence as Recurrence | null, addDays(from, -1), to, 400)) {
        const end = new Date(at.getTime() + dur);
        if (end < from) continue;
        out.push({ key: `${e.id}:${at.getTime()}`, rec: e, collection: 'events', title: String(e.title ?? 'Untitled'), start: at, end, allDay: !!e.allDay, color: (e.calendarId && colors.get(e.calendarId)) || 'var(--blue)' });
      }
    }
    const single = (list: Rec[], collection: string, field: string, color: string, done?: (r: Rec) => boolean, prefix = '') => {
      for (const r of list) {
        const d = parseDate(r[field]);
        if (!d || d < from || d > to || r.archived) continue;
        const timed = typeof r[field] === 'string' && (r[field] as string).length > 10;
        out.push({ key: `${collection}:${r.id}`, rec: r, collection, title: prefix + titleOf(r), start: d, end: timed ? new Date(d.getTime() + 30 * 60_000) : d, allDay: !timed, color, done: done?.(r) });
      }
    };
    if (layers.tasks && enabled.has('tasks')) single(tasks.filter((t) => !t.parentId), 'tasks', 'dueAt', 'var(--accent)', (r) => r.status === 'done');
    if (layers.other) {
      if (enabled.has('projects')) single(milestones, 'milestones', 'dueAt', 'var(--warn)', (r) => !!r.done, '◆ ');
      if (enabled.has('learning')) {
        single(assignments, 'assignments', 'dueAt', 'var(--violet)', (r) => r.status === 'submitted' || r.status === 'graded');
        single(exams, 'exams', 'dueAt', 'var(--bad)', undefined, 'Exam: ');
      }
      if (enabled.has('finance')) single(subscriptions.filter((s) => s.status !== 'cancelled'), 'subscriptions', 'nextBillingDate', 'var(--good)', undefined, 'Renews: ');
      if (enabled.has('admin')) {
        for (const d of dates) {
          const base = parseDate(d.date);
          if (!base) continue;
          for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
            const at = d.repeatYearly === false ? base : new Date(y, base.getMonth(), base.getDate());
            if (at >= from && at <= to) out.push({ key: `dates:${d.id}:${y}`, rec: d, collection: 'dates', title: `${d.kind === 'birthday' ? '🎂 ' : ''}${titleOf(d)}`, start: at, end: at, allDay: true, color: '#f472b6' });
            if (d.repeatYearly === false) break;
          }
        }
      }
    }
    // conflict detection between timed events
    const timed = out.filter((o) => o.collection === 'events' && !o.allDay).sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length && timed[j].start < timed[i].end; j++) timed[i].conflict = timed[j].conflict = true;
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events, calendars, tasks, milestones, assignments, exams, dates, subscriptions, enabled, from, to, hidden, layers.tasks, layers.other]);
}

/** Free slots of at least `minMinutes` within working hours on a day. */
export function freeSlots(day: Date, busy: { start: Date; end: Date }[], from: string, to: string, minMinutes: number): { start: Date; end: Date }[] {
  const d0 = startOfDay(day);
  const at = (mins: number) => new Date(d0.getTime() + mins * 60_000);
  let cursor = at(hhmm(from));
  const end = at(hhmm(to));
  const out: { start: Date; end: Date }[] = [];
  for (const b of [...busy].filter((x) => x.end > cursor && x.start < end).sort((a, b2) => a.start.getTime() - b2.start.getTime())) {
    if (b.start.getTime() - cursor.getTime() >= minMinutes * 60_000) out.push({ start: cursor, end: b.start });
    if (b.end > cursor) cursor = b.end;
  }
  if (end.getTime() - cursor.getTime() >= minMinutes * 60_000) out.push({ start: cursor, end });
  return out;
}

function TimeGrid({ days, occs, onSlot }: { days: Date[]; occs: Occ[]; onSlot: (at: Date) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const now = useNow();
  useEffect(() => {
    scroller.current?.scrollTo({ top: HOUR * 7 - 8 });
  }, []);
  const allDay = occs.filter((o) => o.allDay);
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="scroll-x">
        <div style={{ minWidth: days.length > 1 ? 56 + days.length * 104 : undefined }}>
          <div className="flex border-b border-line bg-surface">
            <div className="w-14 flex-none" />
            {days.map((d) => (
              <div key={d.getTime()} className="min-w-0 flex-1 border-l border-line px-1.5 py-1.5">
                <div className={cx('text-center text-xs', sameDay(d, now) ? 'font-semibold text-accent' : 'text-muted')}>{d.toLocaleDateString(undefined, { weekday: 'short' })} <span className="num">{d.getDate()}</span></div>
                <div className="mt-1 space-y-0.5">
                  {allDay.filter((o) => sameDay(o.start, d) || (o.start <= d && o.end >= d)).slice(0, 4).map((o) => (
                    <button key={o.key} type="button" onClick={() => openEditor(o.collection, o.rec.id)} className={cx('block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[0.72rem]', o.done && 'line-through opacity-60')} style={{ background: `color-mix(in oklab, ${o.color} 22%, transparent)` }}>{o.title}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div ref={scroller} className="max-h-[62dvh] overflow-y-auto">
            <div className="relative flex" style={{ height: HOUR * 24 }}>
              <div className="w-14 flex-none">
                {Array.from({ length: 24 }, (_, h) => <div key={h} className="num pr-2 text-right text-[0.68rem] text-faint" style={{ height: HOUR }}>{h === 0 ? '' : fmtTime(new Date(2000, 0, 1, h))}</div>)}
              </div>
              {days.map((d) => {
                const list = occs.filter((o) => !o.allDay && sameDay(o.start, d));
                // lay overlapping events out in columns
                const cols: Occ[][] = [];
                for (const o of list) {
                  const col = cols.find((c) => c[c.length - 1].end <= o.start);
                  if (col) col.push(o);
                  else cols.push([o]);
                }
                return (
                  <div key={d.getTime()} className="relative min-w-0 flex-1 border-l border-line">
                    {Array.from({ length: 24 }, (_, h) => (
                      <button key={h} type="button" aria-label={`Add event ${d.toDateString()} ${h}:00`} onClick={() => onSlot(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h))} className="block w-full border-b border-line/60 hover:bg-accent-soft" style={{ height: HOUR }} />
                    ))}
                    {sameDay(d, now) && <div className="pointer-events-none absolute inset-x-0 z-[3] h-px bg-bad" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR }}><span className="absolute -left-1 -top-1 size-2 rounded-full bg-bad" /></div>}
                    {cols.map((col, ci) => col.map((o) => {
                      const top = ((o.start.getHours() * 60 + o.start.getMinutes()) / 60) * HOUR;
                      const height = Math.max(20, ((Math.min(o.end.getTime(), endOfDay(d).getTime()) - o.start.getTime()) / 3_600_000) * HOUR - 2);
                      return (
                        <button
                          key={o.key} type="button" onClick={() => openEditor(o.collection, o.rec.id)} title={o.title}
                          className={cx('absolute z-[2] overflow-hidden rounded-lg border-l-[3px] px-1.5 py-0.5 text-left text-[0.74rem] leading-tight', o.done && 'opacity-55')}
                          style={{ top, height, left: `calc(${(ci / cols.length) * 100}% + 2px)`, width: `calc(${100 / cols.length}% - 4px)`, background: `color-mix(in oklab, ${o.color} 24%, var(--solid))`, borderColor: o.color }}
                        >
                          <span className="block truncate font-medium">{o.conflict && <Icon name="warning" size={11} className="mr-0.5 inline text-warn" />}{o.title}</span>
                          {height > 34 && <span className="block truncate text-faint">{fmtTime(o.start)}</span>}
                        </button>
                      );
                    }))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Agenda({ occs }: { occs: Occ[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Occ[]>();
    for (const o of occs) (map.get(ymd(o.start)) ?? map.set(ymd(o.start), []).get(ymd(o.start))!).push(o);
    return [...map.entries()];
  }, [occs]);
  if (!groups.length) return <Empty icon="calendar" title="Nothing scheduled" hint="Events, tasks and dated items for the next 30 days appear here." action={<Button variant="primary" icon="plus" onClick={() => openEditor('events')}>New event</Button>} />;
  return (
    <div className="space-y-4">
      {groups.map(([day, list]) => (
        <section key={day} className="flex gap-3">
          <div className="w-12 flex-none pt-1 text-center">
            <div className="text-[0.66rem] uppercase text-faint">{parseDate(day)!.toLocaleDateString(undefined, { weekday: 'short' })}</div>
            <div className={cx('num text-xl font-semibold', day === ymd() && 'text-accent')}>{parseDate(day)!.getDate()}</div>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            {list.map((o) => (
              <button key={o.key} type="button" onClick={() => openEditor(o.collection, o.rec.id)} className="card card-hover flex w-full items-center gap-3 !py-2.5 text-left">
                <span className="h-9 w-1 flex-none rounded-full" style={{ background: o.color }} />
                <span className="min-w-0 flex-1">
                  <span className={cx('block truncate font-medium', o.done && 'text-faint line-through')}>{o.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {o.allDay ? 'All day' : `${fmtTime(o.start)} – ${fmtTime(o.end)} · ${fmtDuration((o.end.getTime() - o.start.getTime()) / 60_000)}`}
                    {inZone(o.start, o.rec.timezone) && !o.allDay ? ` · ${inZone(o.start, o.rec.timezone)}` : ''}
                    {o.rec.location ? ` · ${o.rec.location}` : ''}
                  </span>
                </span>
                {o.conflict && <span className="chip !border-warn/40 !text-warn"><Icon name="warning" size={12} />Overlaps</span>}
                {o.rec.recurrence && <Icon name="repeat" size={14} className="flex-none text-faint" />}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AvailabilitySheet({ day, onClose }: { day: Date; onClose: () => void }) {
  const [prefs] = usePrefs();
  const [date, setDate] = useState(ymd(day));
  const [minutes, setMinutes] = useState(60);
  const d = parseDate(date) ?? day;
  const occs = useOccurrences(startOfDay(d), endOfDay(d), new Set(), { tasks: false, other: false });
  const slots = freeSlots(d, occs.filter((o) => !o.allDay), prefs.workHours.from, prefs.workHours.to, minutes);
  return (
    <Sheet open onClose={onClose} title="Find free time" width={460}>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <label><span className="label">Day</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label><span className="label">At least</span><select className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>{[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{fmtDuration(m)}</option>)}</select></label>
      </div>
      <p className="mb-2 text-xs text-faint">Within your working hours ({prefs.workHours.from}–{prefs.workHours.to}; change them in Settings → Formats).</p>
      {slots.length === 0 ? <Empty icon="clock" title="No free slot that long" hint="Try a shorter duration or another day." /> : slots.map((s) => (
        <button key={s.start.getTime()} type="button" className="row w-full text-left" onClick={() => { onClose(); openEditor('events', undefined, { startAt: s.start.toISOString(), endAt: new Date(s.start.getTime() + minutes * 60_000).toISOString() }); }}>
          <Icon name="clock" size={16} className="text-good" />
          <span className="flex-1">{fmtTime(s.start)} – {fmtTime(s.end)}</span>
          <span className="text-xs text-faint">{fmtDuration((s.end.getTime() - s.start.getTime()) / 60_000)} free</span>
          <Icon name="plus" size={15} className="text-accent" />
        </button>
      ))}
    </Sheet>
  );
}

function ImportSheet({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<IcsEvent[] | null>(null);
  const existing = useRecords('events');
  const known = useMemo(() => new Set(existing.map((e) => e.icsUid).filter(Boolean)), [existing]);
  const fresh = (events ?? []).filter((e) => !e.uid || !known.has(e.uid));
  return (
    <Sheet
      open onClose={onClose} title="Import calendar (.ics)" width={520}
      footer={events && <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!fresh.length} onClick={async () => { await createMany('events', fresh.map((e) => ({ title: e.title, description: e.description ?? '', location: e.location ?? '', startAt: e.startAt, endAt: e.endAt ?? null, allDay: !!e.allDay, recurrence: e.recurrence ?? null, icsUid: e.uid ?? null }))); toast(`${fresh.length} events imported`, { tone: 'good' }); onClose(); }}>Import {fresh.length} events</Button></>}
    >
      {!events ? (
        <>
          <p className="mb-3 text-sm text-muted">Choose an iCalendar file exported from Google Calendar, Outlook, Apple Calendar or any other app. You will see what would be added first.</p>
          <input type="file" accept=".ics,text/calendar" className="input" aria-label="iCalendar file" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const parsed = parseIcs(await f.text()); if (!parsed.length) return toast('No events found in that file.', { tone: 'bad' }); setEvents(parsed); }} />
        </>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">{events.length} events found{events.length - fresh.length > 0 ? `, ${events.length - fresh.length} already imported and skipped` : ''}. Nothing existing is changed.</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {fresh.slice(0, 60).map((e, i) => <li key={i} className="flex gap-2"><span className="w-28 flex-none text-faint">{new Date(e.startAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' })}</span><span className="truncate">{e.title}</span>{e.recurrence && <Icon name="repeat" size={13} className="text-faint" />}</li>)}
          </ul>
        </>
      )}
    </Sheet>
  );
}

export default function Calendar(_: ModuleProps) {
  const [prefs, setPrefs] = usePrefs();
  const view = ((prefs.views.calendar as View) ?? 'month');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [sheet, setSheet] = useState<'free' | 'import' | 'block' | null>(null);
  const calendars = useRecords('calendars');
  const tasks = useRecords('tasks');
  const events = useRecords('events');
  const hidden = useMemo(() => new Set((prefs.views.hiddenCalendars ?? '').split(',').filter(Boolean)), [prefs.views.hiddenCalendars]);
  const layers = { tasks: prefs.views.calTasks !== 'off', other: prefs.views.calOther !== 'off' };

  const [from, to] = useMemo(() => {
    if (view === 'month') return [addDays(startOfMonth(cursor), -7), addDays(endOfMonth(cursor), 7)];
    if (view === 'week') return [startOfWeek(cursor, prefs.weekStart), endOfDay(addDays(startOfWeek(cursor, prefs.weekStart), 6))];
    if (view === 'day') return [startOfDay(cursor), endOfDay(cursor)];
    return [startOfDay(new Date()), endOfDay(addDays(new Date(), 30))];
  }, [view, cursor, prefs.weekStart]);
  const occs = useOccurrences(from, to, hidden, layers);
  const conflicts = occs.filter((o) => o.conflict).length;

  const step = (dir: number) => setCursor(view === 'month' ? addMonths(cursor, dir) : addDays(cursor, dir * (view === 'week' ? 7 : 1)));
  const title = view === 'month' ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : view === 'week' ? `${from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${to.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : view === 'day' ? cursor.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Next 30 days';
  const newAt = (at: Date) => openEditor('events', undefined, { startAt: at.toISOString(), endAt: new Date(at.getTime() + 3_600_000).toISOString() });
  const items: CalItem[] = occs.map((o) => ({ id: o.key, date: o.start, title: o.title, color: o.color, done: o.done, time: o.allDay ? undefined : fmtTime(o.start), onClick: () => openEditor(o.collection, o.rec.id) }));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor, prefs.weekStart), i));
  const openTasks = tasks.filter((t) => t.status !== 'done' && !t.archived && !t.parentId).slice(0, 30);

  /** Time blocking: put a task on the calendar in the next free slot of the working day. */
  const blockFor = async (task: Rec) => {
    const minutes = Number(task.estimateMin) > 0 ? Number(task.estimateMin) : 60;
    for (let i = 0; i < 7; i++) {
      const day = addDays(new Date(), i);
      const busy = events.filter((e) => !e.allDay && parseDate(e.startAt) && sameDay(parseDate(e.startAt)!, day)).map((e) => ({ start: parseDate(e.startAt)!, end: parseDate(e.endAt) ?? new Date(parseDate(e.startAt)!.getTime() + 3_600_000) }));
      const slot = freeSlots(day, busy, prefs.workHours.from, prefs.workHours.to, minutes).map((s) => ({ ...s, start: s.start < new Date() ? new Date(Math.ceil(Date.now() / 900_000) * 900_000) : s.start })).find((s) => s.end.getTime() - s.start.getTime() >= minutes * 60_000);
      if (!slot) continue;
      await create('events', { title: `Focus: ${titleOf(task)}`, startAt: slot.start.toISOString(), endAt: new Date(slot.start.getTime() + minutes * 60_000).toISOString(), allDay: false, category: 'Work', taskId: task.id, description: 'Time block' });
      setCursor(startOfDay(slot.start));
      toast(`Blocked ${fmtDuration(minutes)} on ${slot.start.toLocaleDateString(undefined, { weekday: 'long' })} at ${fmtTime(slot.start)}`, { tone: 'good' });
      setSheet(null);
      return;
    }
    toast('No free slot in the next 7 days within your working hours.', { tone: 'bad' });
  };

  return (
    <Page
      module="calendar" wide
      actions={
        <>
          <Menu
            label="Calendars and layers"
            items={[
              ...calendars.map((c) => ({ label: String(c.name), checked: !hidden.has(c.id), onClick: () => { const n = new Set(hidden); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setPrefs({ views: { ...prefs.views, hiddenCalendars: [...n].join(',') } }); } })),
              { label: 'New calendar…', icon: 'plus' as const, onClick: () => openEditor('calendars') },
              { separator: true, label: '' },
              { label: 'Show tasks', checked: layers.tasks, onClick: () => setPrefs({ views: { ...prefs.views, calTasks: layers.tasks ? 'off' : 'on' } }) },
              { label: 'Show deadlines, renewals and dates', checked: layers.other, onClick: () => setPrefs({ views: { ...prefs.views, calOther: layers.other ? 'off' : 'on' } }) },
            ]}
            trigger={(p) => <Button size="sm" icon="layers" {...p}>Calendars</Button>}
          />
          <Menu
            label="Calendar tools"
            items={[
              { label: 'Find free time', icon: 'clock', onClick: () => setSheet('free') },
              { label: 'Block time for a task', icon: 'timer', onClick: () => setSheet('block') },
              { separator: true, label: '' },
              { label: 'Import .ics…', icon: 'upload', onClick: () => setSheet('import') },
              { label: 'Export .ics', icon: 'download', disabled: !events.length, onClick: () => downloadFile(`lifeos-calendar-${ymd()}.ics`, toIcs(events.filter((e) => e.startAt).map((e) => ({ uid: e.id, title: String(e.title ?? ''), description: e.description, location: e.location, startAt: e.startAt, endAt: e.endAt, allDay: !!e.allDay, recurrence: e.recurrence }))), 'text/calendar') },
            ]}
            trigger={(p) => <IconButton icon="more" label="Calendar tools" {...p} />}
          />
          <Button variant="primary" size="sm" icon="plus" onClick={() => openEditor('events')}>Event</Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {view !== 'agenda' && (
          <div className="flex items-center gap-0.5">
            <IconButton icon="chevronLeft" label="Previous" onClick={() => step(-1)} />
            <IconButton icon="chevronRight" label="Next" onClick={() => step(1)} />
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCursor(startOfDay(new Date()))}>Today</button>
          </div>
        )}
        <h2 className="min-w-0 flex-1 basis-40 truncate text-[1.1rem] font-semibold">{title}</h2>
        {conflicts > 0 && <span className="chip !border-warn/40 !text-warn"><Icon name="warning" size={12} />{conflicts} overlapping</span>}
        <Segmented label="Calendar view" size="sm" value={view} onChange={(v) => setPrefs({ views: { ...prefs.views, calendar: v } })} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'day', label: 'Day' }, { value: 'agenda', label: 'Agenda' }]} />
      </div>
      {view === 'month' && <MonthGrid month={cursor} items={items} weekStart={prefs.weekStart} selected={cursor} onSelect={setCursor} onDayClick={(d) => newAt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9))} />}
      {view === 'week' && <TimeGrid days={weekDays} occs={occs} onSlot={newAt} />}
      {view === 'day' && <TimeGrid days={[cursor]} occs={occs} onSlot={newAt} />}
      {view === 'agenda' && <Agenda occs={occs.filter((o) => o.end >= startOfDay(new Date()))} />}
      {sheet === 'free' && <AvailabilitySheet day={cursor < startOfDay(new Date()) ? new Date() : cursor} onClose={() => setSheet(null)} />}
      {sheet === 'import' && <ImportSheet onClose={() => setSheet(null)} />}
      <Sheet open={sheet === 'block'} onClose={() => setSheet(null)} title="Block time for a task" width={460}>
        <p className="mb-3 text-sm text-muted">Pick a task. LIFEOS places a block in your next free working-hours slot, using the task’s estimate (or one hour).</p>
        {openTasks.length === 0 ? <Empty icon="tasks" title="No open tasks" /> : openTasks.map((t) => (
          <button key={t.id} type="button" className="row w-full text-left" onClick={() => void blockFor(t)}>
            <Icon name="tasks" size={16} className="text-muted" /><span className="min-w-0 flex-1 truncate">{t.title}</span><span className="text-xs text-faint">{fmtDuration(Number(t.estimateMin) > 0 ? Number(t.estimateMin) : 60)}</span>
          </button>
        ))}
      </Sheet>
    </Page>
  );
}

