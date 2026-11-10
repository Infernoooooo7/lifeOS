'use client';

import { useMemo, useState } from 'react';
import { logHabit, tapHabit } from '@/core/actions';
import { openEditor } from '@/core/app';
import type { Rec } from '@/core/data/db';
import { useNow, useRecords } from '@/core/data/hooks';
import { create, upsert } from '@/core/data/store';
import { addDays, parseDate, relativeDay, startOfWeek, ymd } from '@/core/lib/dates';
import { byDate, consistency, isDue, periodProgress, streaks } from '@/core/lib/habits';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { Bars, Heatmap } from '@/ui/charts';
import { CollectionView } from '@/ui/CollectionView';
import type { ChecklistItem } from '@/ui/fields';
import { Icon } from '@/ui/icons';
import { Button, Empty, IconButton, Progress, Ring, Section, Sheet, Stat, cx } from '@/ui/kit';
import { toast } from '@/ui/overlays';

const TABS = [{ value: 'today', label: 'Today', icon: 'sun' as const }, { value: 'all', label: 'All habits', icon: 'list' as const }, { value: 'routines', label: 'Routines', icon: 'checklist' as const }, { value: 'stats', label: 'Statistics', icon: 'chart' as const }];

const HABIT_TEMPLATES = [
  { name: 'Drink 8 glasses of water', cadence: 'daily', target: 8, unit: 'glasses', category: 'Health', color: '#38bdf8' },
  { name: 'Read 20 pages', cadence: 'daily', target: 20, unit: 'pages', category: 'Learning', color: '#a78bfa' },
  { name: 'Meditate', cadence: 'daily', target: 1, category: 'Mind', color: '#34d399' },
  { name: 'Move for 30 minutes', cadence: 'daily', target: 1, category: 'Health', color: '#fb923c' },
  { name: 'Workout', cadence: 'weekly', target: 3, category: 'Health', color: '#fb7185' },
  { name: 'Call family', cadence: 'weekly', target: 1, category: 'Relationships', color: '#f472b6' },
  { name: 'Review budget', cadence: 'monthly', target: 2, category: 'Finance', color: '#fbbf24' },
  { name: 'No screens after 10pm', cadence: 'daily', target: 1, category: 'Mind', color: '#818cf8' },
];
const ROUTINE_TEMPLATES = [
  { name: 'Morning routine', kind: 'morning', steps: ['Make the bed', 'Glass of water', 'Stretch for 5 minutes', 'Plan the top 3 tasks'] },
  { name: 'Evening wind-down', kind: 'evening', steps: ['Tidy the desk', 'Review today', 'Lay out tomorrow', 'Read for 15 minutes'] },
  { name: 'Weekly reset', kind: 'custom', steps: ['Clear inboxes', 'Review calendar', 'Plan the week', 'Review finances'] },
];
const step = (text: string, i: number): ChecklistItem => ({ id: `s${i}`, text });

function HabitCard({ habit, logs, day, expanded, onToggle }: { habit: Rec; logs: Map<string, number>; day: Date; expanded: boolean; onToggle: () => void }) {
  const p = periodProgress(habit, logs, day);
  const s = streaks(habit, logs, new Date());
  const date = ymd(day);
  const value = logs.get(date) ?? 0;
  const counted = habit.cadence === 'daily' && Number(habit.target) > 1;
  const color = (habit.color as string) ?? 'var(--accent)';
  const target = Number(habit.target) > 0 ? Number(habit.target) : 1;
  const heat = useMemo(() => new Map([...logs].map(([d, v]) => [d, habit.cadence === 'daily' ? Math.min(1, v / target) : v > 0 ? 1 : 0])), [logs, habit.cadence, target]);
  const weekly = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const start = addDays(startOfWeek(new Date()), (i - 7) * 7);
    let done = 0;
    for (let d = 0; d < 7; d++) if ((logs.get(ymd(addDays(start, d))) ?? 0) >= (habit.cadence === 'daily' ? target : 1)) done++;
    return { label: start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), done };
  }), [logs, habit.cadence, target]);
  return (
    <div className={cx('card !p-0', p.met && 'border-transparent bg-accent-soft/50')}>
      <div className="flex items-center gap-3 p-3">
        <button type="button" onClick={() => void tapHabit(habit, date)} aria-label={`Check in ${habit.name}`} aria-pressed={habit.cadence === 'daily' ? p.met : value > 0} className="flex-none rounded-full active:scale-95">
          <Ring value={habit.cadence === 'daily' ? p.done / p.target : value > 0 ? 1 : 0} size={50} stroke={5} color={color} label={`${p.done} of ${p.target}`}>
            {(habit.cadence === 'daily' ? p.met : value > 0) ? <Icon name="check" size={20} strokeWidth={3} className="text-text" /> : counted ? <span className="num text-xs font-semibold">{value}</span> : <Icon name="plus" size={16} className="text-faint" />}
          </Ring>
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onToggle} aria-expanded={expanded}>
          <span className="block truncate font-medium">{habit.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs text-muted">
            <span>{habit.cadence === 'daily' ? `${Math.min(value, 99999)}/${target}${habit.unit ? ` ${habit.unit}` : ''}` : `${p.done}/${p.target} this ${habit.cadence === 'weekly' ? 'week' : 'month'}`}</span>
            {s.current > 0 && <span className="inline-flex items-center gap-0.5 text-warn"><Icon name="flame" size={12} />{s.current}</span>}
            {habit.category && <span>{habit.category}</span>}
          </span>
        </button>
        {counted && (
          <div className="flex flex-none items-center">
            <IconButton icon="minus" label={`Remove one from ${habit.name}`} onClick={() => void logHabit(habit.id, date, value - 1)} disabled={value <= 0} />
            <IconButton icon="plus" label={`Add one to ${habit.name}`} onClick={() => void logHabit(habit.id, date, value + 1)} />
          </div>
        )}
        <IconButton icon={expanded ? 'chevronUp' : 'chevronDown'} label={expanded ? 'Hide details' : 'Show details'} onClick={onToggle} />
      </div>
      {expanded && (
        <div className="space-y-3 border-t border-line p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Current streak" value={s.current} icon="flame" tone="warn" />
            <Stat label="Longest streak" value={s.longest} icon="trophy" />
            <Stat label="30-day consistency" value={`${Math.round(consistency(habit, logs) * 100)}%`} icon="trending" />
            <Stat label="Total check-ins" value={[...logs.values()].filter((v) => v > 0).length} icon="check" />
          </div>
          <div>
            <p className="eyebrow mb-1.5">Habit calendar — tap a day to change it</p>
            <Heatmap values={heat} color={color} label={`Check-in history for ${habit.name}`} onPick={(d) => void tapHabit(habit, d)} />
          </div>
          <div>
            <p className="eyebrow mb-1">Days completed per week</p>
            <Bars data={weekly} series={[{ key: 'done', name: 'Days', color }]} height={130} label={`Weekly completions for ${habit.name}`} />
          </div>
          <div className="flex justify-end"><Button size="sm" icon="pencil" onClick={() => openEditor('habits', habit.id)}>Edit habit</Button></div>
        </div>
      )}
    </div>
  );
}

function RoutineCard({ routine, logs, today }: { routine: Rec; logs: Rec[]; today: string }) {
  const steps = ((routine.steps as ChecklistItem[]) ?? []).filter((s) => s.text);
  const id = `rl:${routine.id}:${today}`;
  const done = new Set(((logs.find((l) => l.id === id)?.done as string[]) ?? []));
  const toggle = (stepId: string) => {
    const next = new Set(done);
    if (next.has(stepId)) next.delete(stepId); else next.add(stepId);
    void upsert('routineLogs', id, { routineId: routine.id, date: today, done: [...next] });
  };
  const count = steps.filter((s) => done.has(s.id)).length;
  return (
    <div className="card">
      <div className="mb-2 flex items-center gap-2">
        <Icon name={routine.kind === 'evening' ? 'moon' : routine.kind === 'morning' ? 'sun' : 'checklist'} size={17} className="text-accent" />
        <h3 className="min-w-0 flex-1 truncate font-sans font-semibold tracking-normal">{routine.name}</h3>
        <span className="num text-xs text-muted">{count}/{steps.length}</span>
        <IconButton icon="pencil" label={`Edit ${routine.name}`} className="!size-8" onClick={() => openEditor('routines', routine.id)} />
      </div>
      <Progress value={steps.length ? count / steps.length : 0} label={`${routine.name} progress`} />
      <ul className="mt-2">
        {steps.map((s) => (
          <li key={s.id}>
            <button type="button" role="checkbox" aria-checked={done.has(s.id)} onClick={() => toggle(s.id)} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-1 text-left hover:bg-surface-2">
              <span className={cx('grid size-5 flex-none place-items-center rounded-md border-2', done.has(s.id) ? 'border-transparent bg-accent text-accent-ink' : 'border-line-strong')}>{done.has(s.id) && <Icon name="check" size={13} strokeWidth={3} />}</span>
              <span className={cx('min-w-0 flex-1', done.has(s.id) && 'text-faint line-through')}>{s.text}</span>
            </button>
          </li>
        ))}
      </ul>
      {steps.length === 0 && <p className="mt-2 text-sm text-faint">No steps yet — edit the routine to add some.</p>}
    </div>
  );
}

export default function Habits({ sub }: ModuleProps) {
  const tab = tabFrom(sub, TABS);
  const habits = useRecords('habits');
  const logs = useRecords('habitLogs');
  const routines = useRecords('routines');
  const routineLogs = useRecords('routineLogs');
  const now = useNow();
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [templates, setTemplates] = useState<'habits' | 'routines' | null>(null);
  const day = addDays(now, offset);
  const active = useMemo(() => habits.filter((h) => !h.archived), [habits]);
  const maps = useMemo(() => new Map(active.map((h) => [h.id, byDate(logs, h.id)])), [active, logs]);
  const due = active.filter((h) => isDue(h, day));
  const met = due.filter((h) => periodProgress(h, maps.get(h.id)!, day).met).length;

  const weekly = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const start = addDays(startOfWeek(now), (i - 7) * 7);
    let total = 0;
    let done = 0;
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, d);
      if (date > now) break;
      for (const h of active.filter((x) => x.cadence === 'daily' && isDue(x, date) && x._ca <= date.getTime() + 86_400_000)) {
        total++;
        if ((maps.get(h.id)!.get(ymd(date)) ?? 0) >= (Number(h.target) || 1)) done++;
      }
    }
    return { label: start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), rate: total ? Math.round((done / total) * 100) : 0 };
  }), [active, maps, now]);

  return (
    <Page
      module="habits" tabs={TABS} tab={tab}
      actions={<><Button size="sm" icon="layers" onClick={() => setTemplates(tab === 'routines' ? 'routines' : 'habits')}>Templates</Button><Button variant="primary" size="sm" icon="plus" onClick={() => openEditor(tab === 'routines' ? 'routines' : 'habits')}>{tab === 'routines' ? 'Routine' : 'Habit'}</Button></>}
    >
      {tab === 'today' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Ring value={due.length ? met / due.length : 0} size={64} stroke={6} label={`${met} of ${due.length} habits done`}><span className="num text-sm font-semibold">{met}/{due.length}</span></Ring>
            <div className="min-w-0 flex-1">
              <div className="font-display text-lg font-semibold">{offset === 0 ? 'Today' : relativeDay(day)}</div>
              <div className="text-sm text-muted">{day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            </div>
            <div className="flex items-center">
              <IconButton icon="chevronLeft" label="Previous day" onClick={() => setOffset(offset - 1)} />
              <button type="button" className="btn btn-sm btn-ghost" disabled={offset === 0} onClick={() => setOffset(0)}>Today</button>
              <IconButton icon="chevronRight" label="Next day" disabled={offset >= 0} onClick={() => setOffset(offset + 1)} />
            </div>
          </div>
          {active.length === 0 ? (
            <Empty icon="repeat" title="Build your first habit" hint="Start small: one habit you can do in two minutes." action={<div className="flex gap-2"><Button variant="primary" icon="plus" onClick={() => openEditor('habits')}>New habit</Button><Button icon="layers" onClick={() => setTemplates('habits')}>Use a template</Button></div>} />
          ) : due.length === 0 ? (
            <Empty icon="smile" title="No habits scheduled for this day" />
          ) : (
            <div className="space-y-2">{due.map((h) => <HabitCard key={h.id} habit={h} logs={maps.get(h.id)!} day={day} expanded={open === h.id} onToggle={() => setOpen(open === h.id ? null : h.id)} />)}</div>
          )}
        </>
      )}
      {tab === 'all' && <CollectionView collection="habits" emptyHint="Daily habits, or weekly / monthly targets." />}
      {tab === 'routines' && (
        routines.length === 0 ? (
          <Empty icon="checklist" title="No routines yet" hint="A routine is an ordered list of steps that starts fresh every day." action={<div className="flex gap-2"><Button variant="primary" icon="plus" onClick={() => openEditor('routines')}>Build a routine</Button><Button icon="layers" onClick={() => setTemplates('routines')}>Use a template</Button></div>} />
        ) : <div className="grid gap-3 md:grid-cols-2">{routines.map((r) => <RoutineCard key={r.id} routine={r} logs={routineLogs} today={ymd(now)} />)}</div>
      )}
      {tab === 'stats' && (
        active.length === 0 ? <Empty icon="chart" title="No habits to analyse yet" /> : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat label="Active habits" value={active.length} icon="repeat" />
              <Stat label="Done today" value={`${met}/${due.length}`} icon="checkCircle" tone="good" />
              <Stat label="Best current streak" value={Math.max(0, ...active.map((h) => streaks(h, maps.get(h.id)!, now).current))} icon="flame" tone="warn" />
              <Stat label="Average 30-day consistency" value={`${Math.round((active.reduce((a, h) => a + consistency(h, maps.get(h.id)!, 30, now), 0) / active.length) * 100)}%`} icon="trending" />
            </div>
            <Section title="Daily habits completed per week (%)" icon="chart"><div className="card"><Bars data={weekly} series={[{ key: 'rate', name: 'Completion %' }]} fmt={(v) => `${v}%`} label="Share of daily habits completed each week" /></div></Section>
            <Section title="Consistency by habit (last 30 days)" icon="gauge">
              <div className="card space-y-3">
                {[...active].sort((a, b) => consistency(b, maps.get(b.id)!, 30, now) - consistency(a, maps.get(a.id)!, 30, now)).map((h) => {
                  const c = consistency(h, maps.get(h.id)!, 30, now);
                  const first = [...maps.get(h.id)!.keys()].sort()[0];
                  return (
                    <div key={h.id}>
                      <div className="mb-1 flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{h.name}</span>{first && <span className="text-xs text-faint">since {parseDate(first)!.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>}<span className="num w-10 text-right font-medium">{Math.round(c * 100)}%</span></div>
                      <Progress value={c} color={h.color} label={`${h.name} consistency`} />
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
        )
      )}
      <Sheet open={templates !== null} onClose={() => setTemplates(null)} title={templates === 'routines' ? 'Routine templates' : 'Habit templates'} width={480}>
        <p className="mb-3 text-sm text-muted">Tap to add. You can edit everything afterwards.</p>
        {templates === 'habits' && HABIT_TEMPLATES.map((t) => (
          <button key={t.name} type="button" className="row w-full text-left" disabled={habits.some((h) => h.name === t.name)} onClick={() => void create('habits', t).then(() => toast(`“${t.name}” added`, { tone: 'good' }))}>
            <span className="size-3 flex-none rounded-full" style={{ background: t.color }} /><span className="min-w-0 flex-1 truncate">{t.name}</span><span className="text-xs text-faint">{t.cadence === 'daily' ? 'Daily' : `${t.target}× ${t.cadence}`}</span><Icon name={habits.some((h) => h.name === t.name) ? 'check' : 'plus'} size={16} className="text-accent" />
          </button>
        ))}
        {templates === 'routines' && ROUTINE_TEMPLATES.map((t) => (
          <button key={t.name} type="button" className="row w-full items-start text-left" disabled={routines.some((r) => r.name === t.name)} onClick={() => void create('routines', { name: t.name, kind: t.kind, steps: t.steps.map(step) }).then(() => toast(`“${t.name}” added`, { tone: 'good' }))}>
            <Icon name={t.kind === 'evening' ? 'moon' : 'sun'} size={16} className="mt-1 flex-none text-accent" /><span className="min-w-0 flex-1"><span className="block font-medium">{t.name}</span><span className="block text-xs text-muted">{t.steps.join(' · ')}</span></span><Icon name={routines.some((r) => r.name === t.name) ? 'check' : 'plus'} size={16} className="mt-1 text-accent" />
          </button>
        ))}
      </Sheet>
    </Page>
  );
}
