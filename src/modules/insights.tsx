'use client';

import { useMemo, useState } from 'react';
import type { Rec } from '@/core/data/db';
import { useEnabledModules, useNow, usePrefs, useRecords } from '@/core/data/hooks';
import { titleOf } from '@/core/data/store';
import { addDays, addMonths, fmtDate, fmtDuration, parseDate, startOfMonth, startOfWeek, ym, ymd } from '@/core/lib/dates';
import { goalProgress } from '@/core/lib/goals';
import { byDate, consistency } from '@/core/lib/habits';
import { DEFAULT_RATES, byCategory, cashflow, fmtMoney, totals, type Txn } from '@/core/lib/money';
import { completionTrend, isOverdue, type TaskLike } from '@/core/lib/tasks';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { Bars, Donut, Lines } from '@/ui/charts';
import { Icon, type IconName } from '@/ui/icons';
import { Empty, Progress, Section, Segmented, Stat, cx } from '@/ui/kit';
import { projectStats } from './projects';

const TABS = [{ value: 'report', label: 'Report', icon: 'file' as const }, { value: 'productivity', label: 'Productivity', icon: 'tasks' as const }, { value: 'wellbeing', label: 'Wellbeing', icon: 'heart' as const }, { value: 'money', label: 'Money', icon: 'wallet' as const }, { value: 'goals', label: 'Goals', icon: 'target' as const }];

const sum = (list: Rec[], key = 'minutes') => list.reduce((a, r) => a + (Number(r[key]) || 0), 0);
const within = (value: unknown, from: Date, to: Date) => { const d = parseDate(value); return !!d && d >= from && d < to; };
const delta = (now: number, before: number): string => (before === 0 ? (now > 0 ? 'new' : '—') : `${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 100)}%`);

/** Everything on this page is computed from the user's own records — there are no sample numbers. */
export default function Insights({ sub }: ModuleProps) {
  const tab = tabFrom(sub, TABS);
  const enabled = useEnabledModules();
  const [prefs] = usePrefs();
  const now = useNow();
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const tasks = useRecords('tasks');
  const habits = useRecords('habits');
  const logs = useRecords('habitLogs');
  const focus = useRecords('focusSessions');
  const study = useRecords('studySessions');
  const subjects = useRecords('subjects');
  const projects = useRecords('projects');
  const milestones = useRecords('milestones');
  const txns = useRecords('transactions') as (Rec & Txn)[];
  const savings = useRecords('savingsGoals');
  const workouts = useRecords('workouts');
  const bodyLogs = useRecords('bodyLogs');
  const sleep = useRecords('sleepLogs');
  const goals = useRecords('goals');
  const notes = useRecords('notes');
  const journal = useRecords('journal');
  const cur = prefs.currency;
  const rates = useMemo(() => ({ ...DEFAULT_RATES, ...prefs.rates }), [prefs.rates]);

  const [from, to, prevFrom] = useMemo(() => {
    if (period === 'week') { const f = startOfWeek(now, prefs.weekStart); return [f, addDays(f, 7), addDays(f, -7)]; }
    const f = startOfMonth(now);
    return [f, addMonths(f, 1), addMonths(f, -1)];
  }, [period, now, prefs.weekStart]);

  const report = useMemo(() => {
    const count = (list: Rec[], field: string, a: Date, b: Date) => list.filter((r) => within(r[field], a, b)).length;
    const created = (list: Rec[], a: Date, b: Date) => list.filter((r) => r._ca >= a.getTime() && r._ca < b.getTime()).length;
    const mins = (list: Rec[], field: string, a: Date, b: Date) => sum(list.filter((r) => within(r[field], a, b)));
    const spend = (a: Date, b: Date) => totals(txns.filter((t) => within(t.date, a, b)), cur, rates);
    const active = habits.filter((h) => !h.archived);
    const days = Math.max(1, Math.round((Math.min(now.getTime(), to.getTime()) - from.getTime()) / 86_400_000) + (period === 'week' ? 0 : 0));
    const habitRate = active.length ? active.reduce((a, h) => a + consistency(h, byDate(logs, h.id), Math.min(days || 1, period === 'week' ? 7 : 31), now), 0) / active.length : 0;
    const s = spend(from, to);
    const sPrev = spend(prevFrom, from);
    const rows: { icon: IconName; label: string; value: string; change?: string; module: string }[] = [
      { icon: 'checkCircle', label: 'Tasks completed', value: String(count(tasks, 'completedAt', from, to)), change: delta(count(tasks, 'completedAt', from, to), count(tasks, 'completedAt', prevFrom, from)), module: 'tasks' },
      { icon: 'plus', label: 'Tasks added', value: String(created(tasks, from, to)), module: 'tasks' },
      { icon: 'repeat', label: 'Habit consistency', value: `${Math.round(habitRate * 100)}%`, module: 'habits' },
      { icon: 'timer', label: 'Focus time', value: fmtDuration(mins(focus.filter((f) => f.kind !== 'break'), 'startedAt', from, to)), change: delta(mins(focus.filter((f) => f.kind !== 'break'), 'startedAt', from, to), mins(focus.filter((f) => f.kind !== 'break'), 'startedAt', prevFrom, from)), module: 'focus' },
      { icon: 'learning', label: 'Study time', value: fmtDuration(mins(study, 'date', from, to)), change: delta(mins(study, 'date', from, to), mins(study, 'date', prevFrom, from)), module: 'learning' },
      { icon: 'arrowUp', label: 'Spent', value: fmtMoney(s.expense, cur, { compact: true }), change: delta(s.expense, sPrev.expense), module: 'finance' },
      { icon: 'piggy', label: 'Savings rate', value: `${Math.round(s.savingsRate * 100)}%`, module: 'finance' },
      { icon: 'dumbbell', label: 'Workouts', value: String(workouts.filter((w) => w.type !== 'rest' && within(w.date, from, to)).length), change: delta(workouts.filter((w) => w.type !== 'rest' && within(w.date, from, to)).length, workouts.filter((w) => w.type !== 'rest' && within(w.date, prevFrom, from)).length), module: 'health' },
      { icon: 'notes', label: 'Notes written', value: String(created(notes, from, to)), module: 'notes' },
      { icon: 'journal', label: 'Journal entries', value: String(count(journal, 'date', from, to)), module: 'journal' },
    ];
    const done = count(tasks, 'completedAt', from, to);
    const overdue = tasks.filter((t) => isOverdue(t as TaskLike, now)).length;
    const top = byCategory(txns.filter((t) => within(t.date, from, to)), 'expense', cur, rates)[0];
    const sentences = [
      enabled.has('tasks') && `You completed ${done} task${done === 1 ? '' : 's'}${overdue ? ` and have ${overdue} overdue` : ' with nothing overdue'}.`,
      enabled.has('habits') && active.length > 0 && `Habits were on track ${Math.round(habitRate * 100)}% of the time.`,
      enabled.has('focus') && mins(focus, 'startedAt', from, to) > 0 && `You focused for ${fmtDuration(mins(focus.filter((f) => f.kind !== 'break'), 'startedAt', from, to))}.`,
      enabled.has('finance') && s.expense > 0 && `You spent ${fmtMoney(s.expense, cur)}${top ? `, most of it on ${top.category} (${fmtMoney(top.amount, cur)})` : ''}.`,
      enabled.has('health') && workouts.some((w) => within(w.date, from, to)) && `You logged ${workouts.filter((w) => w.type !== 'rest' && within(w.date, from, to)).length} workout(s).`,
    ].filter(Boolean) as string[];
    return { rows: rows.filter((r) => enabled.has(r.module)), sentences };
  }, [tasks, habits, logs, focus, study, txns, workouts, notes, journal, from, to, prevFrom, now, period, cur, rates, enabled]);

  const trend = useMemo(() => completionTrend(tasks as TaskLike[], 14, now).map((d) => ({ label: fmtDate(d.date), done: d.done, created: d.created })), [tasks, now]);
  const perDay = (list: Rec[], field: string) => Array.from({ length: 14 }, (_, i) => { const d = addDays(now, i - 13); return { label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), minutes: sum(list.filter((r) => r[field] && ymd(new Date(r[field])) === ymd(d))) }; });
  const activeHabits = habits.filter((h) => !h.archived);
  const activeProjects = projects.filter((p) => !p.archived && p.status !== 'done');
  const flow = useMemo(() => cashflow(txns, 6, now, cur, rates).map((f) => ({ label: parseDate(`${f.month}-01`)!.toLocaleDateString(undefined, { month: 'short' }), expense: Math.round(f.expense), income: Math.round(f.income), rate: Math.round(f.savingsRate * 100) })), [txns, now, cur, rates]);
  const liveGoals = goals.filter((g) => !g.archived && g.kind !== 'keyResult');
  const need = (module: string, node: React.ReactNode) => (enabled.has(module) ? node : null);

  return (
    <Page module="insights" tabs={TABS} tab={tab}>
      {tab === 'report' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><Segmented label="Report period" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }]} /><span className="text-sm text-muted">{fmtDate(from, { year: true })} – {fmtDate(addDays(to, -1), { year: true })}</span></div>
          <div className="card">
            <h2 className="text-lg font-semibold">{period === 'week' ? 'Weekly' : 'Monthly'} report</h2>
            {report.sentences.length ? <p className="mt-2 leading-relaxed text-muted">{report.sentences.join(' ')}</p> : <p className="mt-2 text-sm text-faint">Nothing recorded in this period yet. As you use LIFEOS, this report writes itself from your data.</p>}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-5">
            {report.rows.map((r) => <Stat key={r.label} label={r.label} value={r.value} icon={r.icon} sub={r.change && r.change !== '—' ? `${r.change} vs previous ${period}` : undefined} />)}
          </div>
        </div>
      )}

      {tab === 'productivity' && (
        <div className="space-y-5">
          {need('tasks', <Section title="Task trends — created vs completed (14 days)" icon="tasks"><div className="card"><Bars data={trend} series={[{ key: 'created', name: 'Created', color: 'var(--faint)' }, { key: 'done', name: 'Completed', color: 'var(--good)' }]} label="Tasks created and completed per day" /></div></Section>)}
          <div className="grid gap-3 lg:grid-cols-2">
            {need('focus', <Section title="Focus time per day" icon="timer"><div className="card"><Bars data={perDay(focus.filter((f) => f.kind !== 'break'), 'startedAt')} series={[{ key: 'minutes', name: 'Focus' }]} fmt={(v) => fmtDuration(v)} height={180} label="Focus minutes per day" /></div></Section>)}
            {need('learning', <Section title="Study time by subject" icon="learning"><div className="card"><Donut data={[...subjects.map((s) => ({ name: titleOf(s), value: sum(study.filter((x) => x.parentId === s.id)), color: s.color as string | undefined })), { name: 'Other', value: sum(study.filter((x) => !subjects.some((s) => s.id === x.parentId))) }]} fmt={(v) => fmtDuration(v)} height={170} label="Study minutes per subject" /></div></Section>)}
          </div>
          {need('projects', (
            <Section title="Project progress" icon="projects">
              {activeProjects.length === 0 ? <p className="text-sm text-faint">No active projects.</p> : <div className="card space-y-3">{activeProjects.map((p) => { const s = projectStats(p, tasks, milestones, now); return <div key={p.id}><div className="mb-1 flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>{s.overdue > 0 && <span className="text-xs text-bad">{s.overdue} overdue</span>}<span className="num text-muted">{Math.round(s.progress * 100)}%</span></div><Progress value={s.progress} color={p.color as string} label={`${p.name} progress`} /></div>; })}</div>}
            </Section>
          ))}
        </div>
      )}

      {tab === 'wellbeing' && (
        <div className="space-y-5">
          {need('habits', (
            <Section title="Habit consistency (30 days)" icon="repeat">
              {activeHabits.length === 0 ? <p className="text-sm text-faint">No habits yet.</p> : <div className="card"><Bars data={activeHabits.map((h) => ({ label: String(h.name).slice(0, 14), rate: Math.round(consistency(h, byDate(logs, h.id), 30, now) * 100) }))} series={[{ key: 'rate', name: 'Consistency %', color: 'var(--good)' }]} fmt={(v) => `${v}%`} label="30-day consistency per habit" /></div>}
            </Section>
          ))}
          {need('health', (
            <div className="grid gap-3 lg:grid-cols-2">
              <Section title="Workouts per week" icon="dumbbell"><div className="card"><Bars data={Array.from({ length: 8 }, (_, i) => { const s = addDays(startOfWeek(now), (i - 7) * 7); return { label: s.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), workouts: workouts.filter((w) => w.type !== 'rest' && within(w.date, s, addDays(s, 7))).length }; })} series={[{ key: 'workouts', name: 'Workouts', color: 'var(--bad)' }]} height={170} label="Workouts per week" /></div></Section>
              <Section title="Weight" icon="gauge"><div className="card"><Lines data={bodyLogs.filter((b) => b.kind === 'weight' && b.date).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-30).map((b) => ({ label: fmtDate(b.date), value: Number(b.value) }))} series={[{ key: 'value', name: 'Weight' }]} fmt={(v) => String(v)} height={170} label="Weight trend" /></div></Section>
              <Section title="Sleep" icon="moon" className="lg:col-span-2"><div className="card"><Bars data={[...sleep].filter((s) => s.date).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-14).map((s) => ({ label: fmtDate(s.date), hours: Number(s.value) || 0 }))} series={[{ key: 'hours', name: 'Hours', color: 'var(--violet)' }]} fmt={(v) => `${v}h`} height={160} label="Hours slept" /></div></Section>
            </div>
          ))}
          {need('journal', <Section title="Mood" icon="smile"><div className="card"><Lines data={journal.filter((e) => e.mood && e.date).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-30).map((e) => ({ label: fmtDate(e.date), mood: Number(e.mood) }))} series={[{ key: 'mood', name: 'Mood (1–5)', color: 'var(--good)' }]} fmt={(v) => String(v)} height={160} label="Mood trend" /></div></Section>)}
          {!enabled.has('habits') && !enabled.has('health') && !enabled.has('journal') && <Empty icon="heart" title="Wellbeing modules are off" hint="Switch on Habits, Health or Journal in the Marketplace to see these insights." />}
        </div>
      )}

      {tab === 'money' && (
        !enabled.has('finance') ? <Empty icon="wallet" title="Finance is switched off" hint="Activate Finance in the Marketplace to see spending and savings insights." /> : (
          <div className="space-y-5">
            <div className="grid gap-3 lg:grid-cols-2">
              <Section title="Spending trend (6 months)" icon="trending"><div className="card"><Bars data={flow} series={[{ key: 'expense', name: 'Spent', color: 'var(--bad)' }, { key: 'income', name: 'Income', color: 'var(--good)' }]} fmt={(v) => fmtMoney(v, cur, { compact: true })} label="Monthly income and spending" /></div></Section>
              <Section title="Savings rate (%)" icon="piggy"><div className="card"><Lines data={flow} series={[{ key: 'rate', name: 'Savings rate', color: 'var(--good)' }]} fmt={(v) => `${v}%`} label="Monthly savings rate" /></div></Section>
            </div>
            <Section title={`Category mix · ${now.toLocaleDateString(undefined, { month: 'long' })}`} icon="chart"><div className="card"><Donut data={byCategory(txns.filter((t) => String(t.date ?? '').startsWith(ym(now))), 'expense', cur, rates).map((c) => ({ name: c.category, value: Math.round(c.amount) }))} fmt={(v) => fmtMoney(v, cur, { compact: true })} label="Spending by category this month" /></div></Section>
            <Section title="Savings goals" icon="target">
              {savings.length === 0 ? <p className="text-sm text-faint">No savings goals yet.</p> : <div className="card space-y-3">{savings.map((g) => { const p = Number(g.target) > 0 ? (Number(g.saved) || 0) / Number(g.target) : 0; return <div key={g.id}><div className="mb-1 flex text-sm"><span className="min-w-0 flex-1 truncate font-medium">{g.name}</span><span className="num text-muted">{fmtMoney(Number(g.saved) || 0, (g.currency as string) || cur, { compact: true })} / {fmtMoney(Number(g.target) || 0, (g.currency as string) || cur, { compact: true })}</span></div><Progress value={p} color={(g.color as string) ?? 'var(--good)'} label={`${g.name} progress`} /></div>; })}</div>}
            </Section>
          </div>
        )
      )}

      {tab === 'goals' && (
        !enabled.has('goals') ? <Empty icon="target" title="Goals is switched off" /> : liveGoals.length === 0 ? <Empty icon="target" title="No goals yet" hint="Set goals to see completion and progress here." /> : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat label="Active" value={liveGoals.filter((g) => g.status === 'active').length} icon="target" />
              <Stat label="Achieved" value={liveGoals.filter((g) => g.status === 'achieved').length} icon="trophy" tone="good" />
              <Stat label="Completion rate" value={`${Math.round((liveGoals.filter((g) => g.status === 'achieved').length / liveGoals.length) * 100)}%`} sub="Achieved ÷ all goals" />
              <Stat label="Average progress" value={`${Math.round((liveGoals.filter((g) => g.status === 'active').reduce((a, g) => a + goalProgress(g, goals, milestones, tasks), 0) / Math.max(1, liveGoals.filter((g) => g.status === 'active').length)) * 100)}%`} sub="Active goals" tone="accent" />
            </div>
            <Section title="Progress by life area" icon="chart">
              <div className="card"><Bars data={[...new Set(liveGoals.map((g) => String(g.area ?? 'No area')))].map((area) => { const list = liveGoals.filter((g) => String(g.area ?? 'No area') === area && g.status !== 'dropped'); return { label: area.slice(0, 14), progress: Math.round((list.reduce((a, g) => a + goalProgress(g, goals, milestones, tasks), 0) / Math.max(1, list.length)) * 100) }; })} series={[{ key: 'progress', name: 'Average progress %', color: 'var(--warn)' }]} fmt={(v) => `${v}%`} label="Average goal progress by life area" /></div>
            </Section>
            <Section title="Active goals" icon="list"><div className="card space-y-3">{liveGoals.filter((g) => g.status === 'active').map((g) => { const p = goalProgress(g, goals, milestones, tasks); return <div key={g.id}><div className="mb-1 flex text-sm"><span className="min-w-0 flex-1 truncate font-medium">{g.title}</span><span className={cx('num', p >= 0.75 ? 'text-good' : 'text-muted')}>{Math.round(p * 100)}%</span></div><Progress value={p} label={`${g.title} progress`} /></div>; })}</div></Section>
          </div>
        )
      )}
      <p className="mt-6 flex items-center gap-1.5 text-xs text-faint"><Icon name="shield" size={12} />Calculated on this device from your own records. Nothing here is sample data.</p>
    </Page>
  );
}
