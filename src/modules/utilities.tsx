'use client';

import { useEffect, useMemo, useState } from 'react';
import { navigate, openEditor } from '@/core/app';
import { useNow, usePrefs, useRecords, useSetting } from '@/core/data/hooks';
import { create, remove, uid, update } from '@/core/data/store';
import { addDays, addMonths, diffDays, fmtDate, parseDate, timeAgo, ymd } from '@/core/lib/dates';
import { describeRecurrence, occurrences, type Recurrence } from '@/core/lib/recurrence';
import { COMMON_ZONES, UNITS, convertUnit, evaluate, fmtNumber, percentChange, percentOf, timeInZone, whatPercent, zonedTimeToInstant } from '@/core/lib/utilities';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { ChecklistInput, RecurrenceInput, type ChecklistItem } from '@/ui/fields';
import { Icon } from '@/ui/icons';
import { Button, Empty, IconButton, Progress, cx } from '@/ui/kit';
import { toast } from '@/ui/overlays';

const TABS = [
  { value: 'converter', label: 'Converter', icon: 'refresh' as const }, { value: 'calculator', label: 'Calculator', icon: 'calculator' as const }, { value: 'percent', label: 'Percent', icon: 'gauge' as const },
  { value: 'dates', label: 'Dates', icon: 'calendarDays' as const }, { value: 'zones', label: 'Time zones', icon: 'globe' as const }, { value: 'repeat', label: 'Recurring', icon: 'repeat' as const },
  { value: 'timers', label: 'Timers', icon: 'timer' as const }, { value: 'checklists', label: 'Checklists', icon: 'checklist' as const }, { value: 'countdowns', label: 'Countdowns', icon: 'alarm' as const }, { value: 'notes', label: 'Quick notes', icon: 'sticky' as const },
];
const Num = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => <input className="input" type="number" inputMode="decimal" step="any" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />;
const Result = ({ children }: { children: React.ReactNode }) => <div className="num rounded-xl bg-accent-soft px-4 py-3 text-xl font-semibold" role="status">{children}</div>;

function Converter() {
  const [category, setCategory] = useState('length');
  const units = Object.keys(UNITS[category].units);
  const [from, setFrom] = useState('km');
  const [to, setTo] = useState('mi');
  const [value, setValue] = useState('1');
  useEffect(() => { const u = Object.keys(UNITS[category].units); setFrom(u[0]); setTo(u[1] ?? u[0]); }, [category]);
  const result = convertUnit(Number(value), from, to, category);
  return (
    <div className="card max-w-xl space-y-3">
      <div className="flex flex-wrap gap-1.5">{Object.entries(UNITS).map(([k, c]) => <button key={k} type="button" aria-pressed={category === k} onClick={() => setCategory(k)} className={cx('chip h-8 px-3 pointer-coarse:h-10', category === k && 'chip-accent')}>{c.label}</button>)}</div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
        <label><span className="label">From</span><select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>{units.map((u) => <option key={u}>{u}</option>)}</select></label>
        <IconButton icon="refresh" label="Swap units" onClick={() => { setFrom(to); setTo(from); }} />
        <label><span className="label">To</span><select className="input" value={to} onChange={(e) => setTo(e.target.value)}>{units.map((u) => <option key={u}>{u}</option>)}</select></label>
      </div>
      <Num value={value} onChange={setValue} label="Value to convert" />
      <Result>{value === '' ? '—' : `${fmtNumber(Number(value))} ${from} = ${fmtNumber(result)} ${to}`}</Result>
    </div>
  );
}

function Calculator() {
  const [expr, setExpr] = useState('');
  const [history, setHistory] = useSetting<{ e: string; r: string }[]>('calcHistory', []);
  const live = useMemo(() => { if (!expr.trim()) return null; try { return { ok: true as const, value: evaluate(expr) }; } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'Invalid' }; } }, [expr]);
  const commit = () => { if (live?.ok) { setHistory([{ e: expr, r: fmtNumber(live.value) }, ...history].slice(0, 20)); setExpr(fmtNumber(live.value)); } };
  const keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '(', ')', '^', '%', 'sqrt(', '+'];
  return (
    <div className="grid max-w-3xl gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
      <div className="card space-y-3">
        <input className="input num text-right text-xl" placeholder="e.g. (1200 + 350) * 1.18" aria-label="Expression" value={expr} onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commit()} autoFocus />
        <Result>{!live ? '0' : live.ok ? `= ${fmtNumber(live.value)}` : <span className="text-base font-normal text-muted">{live.error}</span>}</Result>
        <div className="grid grid-cols-4 gap-1.5">
          {keys.map((k) => <button key={k} type="button" className="btn !min-h-11 num" onClick={() => setExpr(expr + k)}>{k === '*' ? '×' : k === '/' ? '÷' : k}</button>)}
          <button type="button" className="btn !min-h-11" onClick={() => setExpr('')}>Clear</button>
          <button type="button" className="btn !min-h-11" onClick={() => setExpr(expr.slice(0, -1))} aria-label="Backspace">⌫</button>
          <button type="button" className="btn btn-primary col-span-2 !min-h-11" onClick={commit}>=</button>
        </div>
      </div>
      <div className="card">
        <div className="mb-2 flex items-center"><h3 className="flex-1 font-sans text-sm font-semibold tracking-normal">History</h3>{history.length > 0 && <button type="button" className="text-xs text-accent" onClick={() => setHistory([])}>Clear</button>}</div>
        {history.length === 0 ? <p className="text-sm text-faint">Results you confirm with = appear here.</p> : history.map((h, i) => <button key={i} type="button" className="block w-full rounded-lg px-2 py-1.5 text-right hover:bg-surface-2" onClick={() => setExpr(h.e)}><span className="block truncate text-xs text-faint">{h.e}</span><span className="num">{h.r}</span></button>)}
      </div>
    </div>
  );
}

function Percent() {
  const [a, setA] = useState('15');
  const [b, setB] = useState('2400');
  const [c, setC] = useState('1800');
  const [d, setD] = useState('2100');
  const [bill, setBill] = useState('1250');
  const [pct, setPct] = useState('10');
  const n = (s: string) => Number(s) || 0;
  return (
    <div className="grid max-w-4xl gap-3 md:grid-cols-2">
      <div className="card space-y-2"><h3 className="font-sans font-semibold tracking-normal">Percent of</h3><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><Num value={a} onChange={setA} label="Percent" /><span className="text-muted">% of</span><Num value={b} onChange={setB} label="Amount" /></div><Result>{fmtNumber(percentOf(n(a), n(b)))}</Result><p className="text-sm text-muted">{fmtNumber(n(b))} is {fmtNumber(whatPercent(n(a), n(b)))}% … and {fmtNumber(n(a))} is {fmtNumber(whatPercent(n(a), n(b)))}% of {fmtNumber(n(b))}.</p></div>
      <div className="card space-y-2"><h3 className="font-sans font-semibold tracking-normal">Percent change</h3><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><Num value={c} onChange={setC} label="From" /><span className="text-muted">→</span><Num value={d} onChange={setD} label="To" /></div><Result>{Number.isFinite(percentChange(n(c), n(d))) ? `${percentChange(n(c), n(d)) >= 0 ? '+' : ''}${fmtNumber(percentChange(n(c), n(d)))}%` : '—'}</Result><p className="text-sm text-muted">A difference of {fmtNumber(n(d) - n(c))}.</p></div>
      <div className="card space-y-2 md:col-span-2"><h3 className="font-sans font-semibold tracking-normal">Discount or tip</h3><div className="grid grid-cols-2 gap-2"><label><span className="label">Amount</span><Num value={bill} onChange={setBill} label="Amount" /></label><label><span className="label">Percent</span><Num value={pct} onChange={setPct} label="Discount or tip percent" /></label></div><div className="grid grid-cols-2 gap-2"><Result><span className="block text-xs font-normal text-muted">After {pct}% discount</span>{fmtNumber(n(bill) - percentOf(n(pct), n(bill)))}</Result><Result><span className="block text-xs font-normal text-muted">With {pct}% tip</span>{fmtNumber(n(bill) + percentOf(n(pct), n(bill)))}</Result></div></div>
    </div>
  );
}

function DateCalc() {
  const [from, setFrom] = useState(ymd());
  const [to, setTo] = useState(ymd(addDays(new Date(), 30)));
  const [base, setBase] = useState(ymd());
  const [amount, setAmount] = useState('90');
  const [unit, setUnit] = useState<'days' | 'weeks' | 'months'>('days');
  const a = parseDate(from);
  const b = parseDate(to);
  const days = a && b ? diffDays(a, b) : null;
  const start = parseDate(base);
  const n = Number(amount) || 0;
  const result = start ? (unit === 'months' ? addMonths(start, n) : addDays(start, unit === 'weeks' ? n * 7 : n)) : null;
  return (
    <div className="grid max-w-4xl gap-3 md:grid-cols-2">
      <div className="card space-y-2"><h3 className="font-sans font-semibold tracking-normal">Between two dates</h3><div className="grid grid-cols-2 gap-2"><label><span className="label">From</span><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label><span className="label">To</span><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
        <Result>{days === null ? '—' : `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`}</Result>{days !== null && <p className="text-sm text-muted">{Math.floor(Math.abs(days) / 7)} weeks and {Math.abs(days) % 7} days · about {(Math.abs(days) / 30.44).toFixed(1)} months{days < 0 ? ' (the second date is earlier)' : ''}</p>}</div>
      <div className="card space-y-2"><h3 className="font-sans font-semibold tracking-normal">Add or subtract</h3><label><span className="label">Start date</span><input type="date" className="input" value={base} onChange={(e) => setBase(e.target.value)} /></label><div className="grid grid-cols-2 gap-2"><label><span className="label">Amount (negative to go back)</span><Num value={amount} onChange={setAmount} label="Amount" /></label><label><span className="label">Unit</span><select className="input" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option></select></label></div>
        <Result>{result ? result.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</Result></div>
    </div>
  );
}

function Zones() {
  const [prefs] = usePrefs();
  const now = useNow(15_000);
  const [zones, setZones] = useSetting<string[]>('zones', ['Asia/Kolkata', 'Europe/London', 'America/New_York']);
  const [date, setDate] = useState(ymd());
  const [time, setTime] = useState('09:00');
  const [source, setSource] = useState(zones[0] ?? 'UTC');
  const [live, setLive] = useState(true);
  const instant = live ? now : zonedTimeToInstant(date, time, source);
  const all = useMemo(() => { try { return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? COMMON_ZONES; } catch { return COMMON_ZONES; } }, []);
  return (
    <div className="max-w-3xl space-y-3">
      <div className="card">
        <div className="mb-3 flex flex-wrap items-center gap-2"><button type="button" aria-pressed={live} onClick={() => setLive(true)} className={cx('chip h-8 px-3', live && 'chip-accent')}>World clock (now)</button><button type="button" aria-pressed={!live} onClick={() => setLive(false)} className={cx('chip h-8 px-3', !live && 'chip-accent')}>Convert a time</button></div>
        {!live && <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><input type="date" className="input" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} /><input type="time" className="input" aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} /><select className="input max-sm:col-span-2" aria-label="Time zone of that time" value={source} onChange={(e) => setSource(e.target.value)}>{[...new Set([...zones, ...COMMON_ZONES])].map((z) => <option key={z}>{z}</option>)}</select></div>}
        <ul className="divide-y divide-line">
          {zones.map((z) => { const t = timeInZone(instant, z, prefs.hour12); return (
            <li key={z} className="flex items-center gap-3 py-2.5"><span className="min-w-0 flex-1"><span className="block truncate font-medium">{z.split('/').pop()!.replace(/_/g, ' ')}</span><span className="block text-xs text-faint">{z} · {t.offset}</span></span><span className="text-right"><span className="num block text-xl font-semibold">{t.time}</span><span className="block text-xs text-muted">{t.day}</span></span><IconButton icon="x" label={`Remove ${z}`} className="!size-8" onClick={() => setZones(zones.filter((x) => x !== z))} /></li>
          ); })}
        </ul>
        <select className="input mt-3" aria-label="Add a time zone" value="" onChange={(e) => e.target.value && !zones.includes(e.target.value) && setZones([...zones, e.target.value])}><option value="">Add a time zone…</option>{all.filter((z) => !zones.includes(z)).map((z) => <option key={z}>{z}</option>)}</select>
      </div>
    </div>
  );
}

function Recurring() {
  const [start, setStart] = useState(ymd());
  const [rule, setRule] = useState<Recurrence | null>({ freq: 'monthly', interval: 1 });
  const s = parseDate(start);
  const list = s && rule ? occurrences(s, rule, s, addDays(s, 365 * 6), 12) : [];
  return (
    <div className="card max-w-xl space-y-3">
      <label className="block"><span className="label">Starting on</span><input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <div><span className="label">Repeats</span><RecurrenceInput value={rule} onChange={(v) => setRule(v as Recurrence | null)} /></div>
      {rule ? <><p className="text-sm text-muted">{describeRecurrence(rule)} — next {list.length} dates:</p><ol className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">{list.map((d, i) => <li key={i} className="flex gap-2"><span className="num w-5 text-faint">{i + 1}.</span>{d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</li>)}</ol>
        <Button size="sm" icon="calendar" onClick={() => openEditor('events', undefined, { startAt: new Date(s!.getFullYear(), s!.getMonth(), s!.getDate(), 9).toISOString(), recurrence: rule, allDay: true })}>Create a repeating event from this</Button></> : <p className="text-sm text-faint">Choose how it repeats to list the upcoming dates.</p>}
    </div>
  );
}

interface TimerItem { id: string; name: string; minutes: number; endsAt: number | null; left: number | null }
const TIMERS_KEY = 'lifeos.timers';
const clock = (ms: number) => { const t = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(t / 3600); return `${h ? `${h}:` : ''}${String(Math.floor((t % 3600) / 60)).padStart(h ? 2 : 1, '0')}:${String(t % 60).padStart(2, '0')}`; };

function Timers() {
  const now = useNow(250).getTime();
  const [timers, setTimers] = useState<TimerItem[]>(() => { try { return JSON.parse(localStorage.getItem(TIMERS_KEY) ?? '[]'); } catch { return []; } });
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('10');
  const [sw, setSw] = useState<{ startedAt: number | null; elapsed: number; laps: number[] }>({ startedAt: null, elapsed: 0, laps: [] });
  useEffect(() => { try { localStorage.setItem(TIMERS_KEY, JSON.stringify(timers)); } catch { /* ignore */ } }, [timers]);
  useEffect(() => {
    const done = timers.filter((t) => t.endsAt && t.endsAt <= now);
    if (!done.length) return;
    for (const t of done) toast(`Timer “${t.name}” finished`, { icon: 'alarm', duration: 10_000 });
    setTimers((list) => list.map((t) => (t.endsAt && t.endsAt <= now ? { ...t, endsAt: null, left: 0 } : t)));
  }, [now, timers]);
  const patch = (id: string, p: Partial<TimerItem>) => setTimers((list) => list.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const swTime = sw.elapsed + (sw.startedAt ? now - sw.startedAt : 0);
  return (
    <div className="grid max-w-4xl gap-3 md:grid-cols-2">
      <div className="card space-y-3">
        <h3 className="font-sans font-semibold tracking-normal">Timers</h3>
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] gap-2"><input className="input" placeholder="Name (e.g. Tea)" aria-label="Timer name" value={name} onChange={(e) => setName(e.target.value)} /><input className="input" type="number" min={1} aria-label="Minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} /><Button variant="primary" icon="plus" onClick={() => { const m = Math.max(1, Number(minutes) || 1); setTimers([...timers, { id: uid().slice(0, 8), name: name.trim() || `${m} min`, minutes: m, endsAt: Date.now() + m * 60_000, left: null }]); setName(''); }}>Start</Button></div>
        {timers.length === 0 && <p className="text-sm text-faint">Run several named timers at once. They keep going if you leave this page.</p>}
        {timers.map((t) => { const left = t.endsAt ? t.endsAt - now : (t.left ?? t.minutes * 60_000); return (
          <div key={t.id} className="rounded-xl border border-line p-3">
            <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium">{t.name}</span><span className={cx('num text-xl font-semibold', left <= 0 && 'text-good')}>{left <= 0 ? 'Done' : clock(left)}</span>
              {left > 0 && (t.endsAt ? <IconButton icon="pause" label="Pause timer" onClick={() => patch(t.id, { endsAt: null, left })} /> : <IconButton icon="play" label="Resume timer" onClick={() => patch(t.id, { endsAt: Date.now() + left, left: null })} />)}
              <IconButton icon="undo" label="Restart timer" onClick={() => patch(t.id, { endsAt: Date.now() + t.minutes * 60_000, left: null })} /><IconButton icon="x" label="Remove timer" onClick={() => setTimers(timers.filter((x) => x.id !== t.id))} /></div>
            <Progress value={1 - Math.max(0, left) / (t.minutes * 60_000)} className="mt-2" label={`${t.name} progress`} />
          </div>
        ); })}
      </div>
      <div className="card space-y-3">
        <h3 className="font-sans font-semibold tracking-normal">Stopwatch</h3>
        <div className="num text-center text-4xl font-semibold" data-testid="stopwatch">{clock(swTime)}<span className="text-xl text-muted">.{String(Math.floor((swTime % 1000) / 100))}</span></div>
        <div className="flex justify-center gap-2">
          {sw.startedAt ? <Button variant="primary" icon="pause" onClick={() => setSw({ ...sw, startedAt: null, elapsed: swTime })}>Stop</Button> : <Button variant="primary" icon="play" onClick={() => setSw({ ...sw, startedAt: Date.now() })}>{sw.elapsed ? 'Resume' : 'Start'}</Button>}
          <Button icon="flag" disabled={!sw.startedAt} onClick={() => setSw({ ...sw, laps: [swTime, ...sw.laps] })}>Lap</Button>
          <Button icon="undo" disabled={!swTime} onClick={() => setSw({ startedAt: null, elapsed: 0, laps: [] })}>Reset</Button>
        </div>
        {sw.laps.length > 0 && <ol className="max-h-48 space-y-1 overflow-y-auto text-sm">{sw.laps.map((l, i) => <li key={i} className="flex justify-between"><span className="text-muted">Lap {sw.laps.length - i}</span><span className="num">{clock(l)} <span className="text-faint">(+{clock(l - (sw.laps[i + 1] ?? 0))})</span></span></li>)}</ol>}
      </div>
    </div>
  );
}

function Checklists() {
  const lists = useRecords('checklists');
  return lists.length === 0 ? <Empty icon="checklist" title="No checklists yet" hint="Reusable lists for anything you do more than once." action={<Button variant="primary" icon="plus" onClick={() => openEditor('checklists')}>New checklist</Button>} /> : (
    <>
      <div className="mb-3 flex justify-end"><Button variant="primary" size="sm" icon="plus" onClick={() => openEditor('checklists')}>New checklist</Button></div>
      <div className="grid gap-3 md:grid-cols-2">
        {lists.map((l) => { const items = (l.items as ChecklistItem[] | undefined) ?? []; return (
          <div key={l.id} className="card">
            <div className="mb-2 flex items-center gap-2"><button type="button" className="min-w-0 flex-1 truncate text-left font-semibold" onClick={() => openEditor('checklists', l.id)}>{l.title}</button><span className="num text-xs text-muted">{items.filter((i) => i.done).length}/{items.length}</span>
              {items.some((i) => i.done) && <IconButton icon="undo" label="Untick all" className="!size-8" onClick={() => void update(l.id, { items: items.map((i) => ({ ...i, done: false })) }, { silent: true })} />}</div>
            <ChecklistInput value={items} onChange={(v) => void update(l.id, { items: v }, { silent: true })} />
          </div>
        ); })}
      </div>
    </>
  );
}

function Countdowns() {
  const list = useRecords('countdowns');
  const now = useNow(30_000);
  const sorted = [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return sorted.length === 0 ? <Empty icon="alarm" title="No countdowns yet" hint="Count down to a trip, a launch, a birthday — anything with a date." action={<Button variant="primary" icon="plus" onClick={() => openEditor('countdowns')}>New countdown</Button>} /> : (
    <>
      <div className="mb-3 flex justify-end"><Button variant="primary" size="sm" icon="plus" onClick={() => openEditor('countdowns')}>New countdown</Button></div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3">
        {sorted.map((c) => { const d = parseDate(c.date); const ms = d ? d.getTime() - now.getTime() : 0; const days = d ? diffDays(now, d) : 0; const timed = String(c.date).length > 10; return (
          <button key={c.id} type="button" className="card card-hover relative overflow-hidden text-left" onClick={() => openEditor('countdowns', c.id)}>
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: (c.color as string) ?? 'var(--accent)' }} />
            <div className="num text-[2.4rem] font-semibold leading-none" style={{ color: (c.color as string) ?? 'var(--accent)' }}>{ms < 0 && days < 0 ? Math.abs(days) : timed && ms > 0 && ms < 86_400_000 ? Math.ceil(ms / 3_600_000) : Math.max(0, days)}<span className="ml-1.5 text-sm font-normal text-muted">{timed && ms > 0 && ms < 86_400_000 ? 'hours' : `day${Math.abs(days) === 1 ? '' : 's'}`}{days < 0 ? ' ago' : ''}</span></div>
            <div className="mt-2 truncate font-medium">{c.title}</div><div className="text-xs text-faint">{d ? fmtDate(d, { year: true, weekday: true }) : 'No date'}</div>
          </button>
        ); })}
      </div>
    </>
  );
}

function QuickNotes() {
  const notes = useRecords('notes').filter((n) => ((n.tags as string[] | undefined) ?? []).includes('quick') && !n.archived).sort((a, b) => b._ca - a._ca);
  const [text, setText] = useState('');
  const add = async () => { if (!text.trim()) return; await create('notes', { title: text.trim().split('\n')[0].slice(0, 60), content: text.trim(), kind: 'note', tags: ['quick'] }, { silent: true }); setText(''); };
  return (
    <div className="max-w-2xl">
      <div className="card mb-3"><textarea className="input min-h-24" placeholder="Jot something down…" aria-label="Quick note" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && void add()} /><div className="mt-2 flex items-center justify-between"><span className="text-xs text-faint">Also appears in Notes with the #quick tag.</span><Button variant="primary" size="sm" onClick={() => void add()}>Save</Button></div></div>
      {notes.map((n) => <div key={n.id} className="row items-start"><button type="button" className="min-w-0 flex-1 whitespace-pre-wrap break-words py-1 text-left text-sm" onClick={() => navigate(`/notes/${n.id}`)}>{String(n.content ?? n.title)}<span className="block text-xs text-faint">{timeAgo(n._ca)}</span></button><IconButton icon="trash" label="Delete note" className="!size-8" onClick={() => void remove(n.id, { silent: true })} /></div>)}
      {notes.length === 0 && <p className="text-sm text-faint">No quick notes yet.</p>}
    </div>
  );
}

export default function Utilities({ sub }: ModuleProps) {
  const tab = tabFrom(sub, TABS);
  return (
    <Page module="utilities" tabs={TABS} tab={tab}>
      {tab === 'converter' && <Converter />}
      {tab === 'calculator' && <Calculator />}
      {tab === 'percent' && <Percent />}
      {tab === 'dates' && <DateCalc />}
      {tab === 'zones' && <Zones />}
      {tab === 'repeat' && <Recurring />}
      {tab === 'timers' && <Timers />}
      {tab === 'checklists' && <Checklists />}
      {tab === 'countdowns' && <Countdowns />}
      {tab === 'notes' && <QuickNotes />}
    </Page>
  );
}
