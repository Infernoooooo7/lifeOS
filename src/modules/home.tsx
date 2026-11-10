'use client';

import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState, type ReactNode } from 'react';
import { tapHabit } from '@/core/actions';
import { navigate, openCapture, openEditor, useApp } from '@/core/app';
import { useEnabledModules, useNow, usePrefs, useRecords } from '@/core/data/hooks';
import { create, remove, titleOf, uid, update } from '@/core/data/store';
import { addDays, diffDays, fmtDuration, fmtTime, greeting, parseDate, relativeDay, startOfDay, timeAgo, ym, ymd } from '@/core/lib/dates';
import { byDate, isDue, periodProgress, streaks } from '@/core/lib/habits';
import { DEFAULT_RATES, fmtMoney, inMonth, totals, type Txn } from '@/core/lib/money';
import { parseQuickTask } from '@/core/lib/quickadd';
import { compareTasks, isDone, isDueToday, isOpen, isOverdue, type TaskLike } from '@/core/lib/tasks';
import { Page, type ModuleProps } from '@/shell/Page';
import { useUpcomingEvents } from '@/shell/Shell';
import { Bars } from '@/ui/charts';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Checkbox, IconButton, Menu, Progress, Ring, Sheet, cx } from '@/ui/kit';
import { confirmDialog, promptDialog, toast } from '@/ui/overlays';
import { toggleTask } from '@/ui/RecordEditor';

type Size = 's' | 'm' | 'l' | 'xl';
interface WidgetInstance {
  id: string;
  type: string;
  size: Size;
}
interface WidgetDef {
  name: string;
  description: string;
  icon: IconName;
  module: string;
  size: Size;
  link?: string;
  render: () => ReactNode;
}

const SIZE_CLASS: Record<Size, string> = {
  s: 'col-span-1 md:col-span-2 xl:col-span-3',
  m: 'col-span-2 md:col-span-3 xl:col-span-4',
  l: 'col-span-2 md:col-span-6 xl:col-span-6',
  xl: 'col-span-2 md:col-span-6 xl:col-span-12',
};
const SIZE_LABEL: Record<Size, string> = { s: 'Small', m: 'Medium', l: 'Large', xl: 'Full width' };

const Faint = ({ children }: { children: ReactNode }) => <p className="py-2 text-sm text-faint">{children}</p>;

// ── data helpers shared by several widgets ───────────────────────────────────────────────────────

function useToday() {
  const now = useNow();
  const tasks = useRecords('tasks');
  const habits = useRecords('habits');
  const logs = useRecords('habitLogs');
  const sessions = useRecords('focusSessions');
  const events = useUpcomingEvents(1, 20);
  return useMemo(() => {
    const today = ymd(now);
    const open = tasks.filter((t) => isOpen(t as TaskLike) && !t.parentId);
    const dueToday = tasks.filter((t) => !t.archived && !t.parentId && (isDueToday(t as TaskLike, now) || (isOverdue(t as TaskLike, now) && !isDone(t as TaskLike))));
    const doneToday = tasks.filter((t) => t.completedAt && ymd(new Date(t.completedAt)) === today);
    const dueHabits = habits.filter((h) => !h.archived && isDue(h, now));
    const habitsDone = dueHabits.filter((h) => periodProgress(h, byDate(logs, h.id), now).met);
    const focusMin = sessions.filter((s) => s.kind !== 'break' && s.startedAt && ymd(new Date(s.startedAt)) === today).reduce((a, s) => a + (Number(s.minutes) || 0), 0);
    const todayEvents = events.filter((e) => ymd(e.at) === today);
    const planned = dueToday.filter((t) => !isDone(t as TaskLike)).length + doneToday.length;
    return { now, today, open, dueToday, doneToday, dueHabits, habitsDone, focusMin, todayEvents, planned };
  }, [now, tasks, habits, logs, sessions, events]);
}

// ── widgets ──────────────────────────────────────────────────────────────────────────────────────

function DailyOverview() {
  const t = useToday();
  const [prefs] = usePrefs();
  const enabled = useEnabledModules();
  const ratio = t.planned ? t.doneToday.length / t.planned : 0;
  const cells: [string, string, IconName, string, boolean][] = [
    ['Tasks left', String(t.dueToday.filter((x) => !isDone(x as TaskLike)).length), 'tasks', '/tasks', enabled.has('tasks')],
    ['Events', String(t.todayEvents.length), 'calendar', '/calendar', enabled.has('calendar')],
    ['Habits', `${t.habitsDone.length}/${t.dueHabits.length}`, 'repeat', '/habits', enabled.has('habits')],
    ['Focus', fmtDuration(t.focusMin), 'timer', '/focus', enabled.has('focus')],
  ];
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Ring value={ratio} size={84} stroke={7} label={`${t.doneToday.length} of ${t.planned} tasks done today`}>
        <div><div className="num text-xl font-semibold leading-none">{t.doneToday.length}</div><div className="text-[0.65rem] text-faint">of {t.planned}</div></div>
      </Ring>
      <div className="grid min-w-0 flex-1 basis-48 grid-cols-2 gap-2">
        {cells.filter((c) => c[4]).map(([label, value, icon, to]) => (
          <button key={label} type="button" onClick={() => navigate(to)} className="rounded-xl border border-line bg-surface px-3 py-2 text-left hover:bg-surface-2">
            <div className="flex items-center gap-1.5 text-xs text-muted"><Icon name={icon} size={13} />{label}</div>
            <div className="num text-lg font-semibold">{value}</div>
          </button>
        ))}
      </div>
      {enabled.has('focus') && prefs.focus.goal > 0 && <Progress value={t.focusMin / prefs.focus.goal} className="basis-full" label="Focus goal" />}
    </div>
  );
}

function WeeklyOverview() {
  const tasks = useRecords('tasks');
  const logs = useRecords('habitLogs');
  const now = useNow();
  const data = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(now, i - 6);
    const key = ymd(d);
    return {
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      tasks: tasks.filter((t) => t.completedAt && ymd(new Date(t.completedAt)) === key).length,
      habits: logs.filter((l) => l.date === key && Number(l.value ?? 1) > 0).length,
    };
  }), [tasks, logs, now]);
  return <Bars data={data} series={[{ key: 'tasks', name: 'Tasks done' }, { key: 'habits', name: 'Habit check-ins', color: 'var(--violet)' }]} height={170} label="Tasks completed and habit check-ins over the last seven days" />;
}

function TodayTasks() {
  const t = useToday();
  const [draft, setDraft] = useState('');
  const list = [...t.dueToday].sort(compareTasks).slice(0, 8);
  const add = async () => {
    const parsed = parseQuickTask(draft);
    if (!parsed.title) return;
    await create('tasks', { title: parsed.title, status: 'todo', priority: parsed.priority ?? 0, dueAt: parsed.dueAt ?? t.today, tags: parsed.tags ?? [] });
    setDraft('');
  };
  return (
    <div>
      {list.length === 0 && <Faint>Nothing due today. Add something or enjoy the space.</Faint>}
      <div className="-mx-2">
        {list.map((task) => (
          <div key={task.id} className="row !min-h-10">
            <Checkbox checked={isDone(task as TaskLike)} onChange={() => void toggleTask(task)} label={`Complete ${task.title}`} />
            <button type="button" className={cx('min-w-0 flex-1 truncate text-left', isDone(task as TaskLike) && 'text-faint line-through')} onClick={() => openEditor('tasks', task.id)}>{task.title}</button>
            {isOverdue(task as TaskLike) && <span className="chip !border-bad/40 !text-bad">{relativeDay(task.dueAt)}</span>}
            {(task.priority ?? 0) >= 3 && <Icon name="flag" size={14} className="flex-none text-bad" />}
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-line px-2.5">
        <Icon name="plus" size={16} className="text-faint" />
        <input className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-faint" placeholder="Add a task for today…" aria-label="Add a task for today" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
      </div>
    </div>
  );
}

function UpcomingEvents() {
  const events = useUpcomingEvents(14, 6);
  if (!events.length) return <Faint>No events in the next two weeks.</Faint>;
  return (
    <div className="-mx-2">
      {events.map((e) => (
        <button key={e.id} type="button" className="row w-full text-left" onClick={() => openEditor('events', e.rec.id)}>
          <span className="w-11 flex-none text-center"><span className="block text-[0.62rem] uppercase text-faint">{e.at.toLocaleDateString(undefined, { month: 'short' })}</span><span className="num block text-lg font-semibold leading-none">{e.at.getDate()}</span></span>
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{e.rec.title}</span><span className="block truncate text-xs text-faint">{relativeDay(e.at)}{e.rec.allDay ? ' · all day' : ` · ${fmtTime(e.at)}`}{e.rec.location ? ` · ${e.rec.location}` : ''}</span></span>
        </button>
      ))}
    </div>
  );
}

function Deadlines() {
  const tasks = useRecords('tasks');
  const milestones = useRecords('milestones');
  const assignments = useRecords('assignments');
  const exams = useRecords('exams');
  const projects = useRecords('projects');
  const enabled = useEnabledModules();
  const now = useNow();
  const items = useMemo(() => {
    const horizon = addDays(now, 14);
    const pick = (list: typeof tasks, c: string, field: string, done: (r: (typeof tasks)[number]) => boolean, icon: IconName) =>
      list.filter((r) => !done(r) && !r.archived && parseDate(r[field]) && parseDate(r[field])! <= horizon).map((r) => ({ id: r.id, c, title: titleOf(r), date: parseDate(r[field])!, icon }));
    return [
      ...(enabled.has('tasks') ? pick(tasks.filter((t) => (t.priority ?? 0) >= 2 || isOverdue(t as TaskLike, now)), 'tasks', 'dueAt', (r) => r.status === 'done', 'tasks') : []),
      ...(enabled.has('projects') ? pick(milestones, 'milestones', 'dueAt', (r) => !!r.done, 'flag') : []),
      ...(enabled.has('projects') ? pick(projects, 'projects', 'dueAt', (r) => r.status === 'done', 'projects') : []),
      ...(enabled.has('learning') ? pick(assignments, 'assignments', 'dueAt', (r) => r.status === 'submitted' || r.status === 'graded', 'file') : []),
      ...(enabled.has('learning') ? pick(exams, 'exams', 'dueAt', (r) => parseDate(r.dueAt)! < startOfDay(now), 'alarm') : []),
    ].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 7);
  }, [tasks, milestones, assignments, exams, projects, enabled, now]);
  if (!items.length) return <Faint>No important deadlines in the next two weeks.</Faint>;
  return (
    <div className="-mx-2">
      {items.map((it) => {
        const days = diffDays(now, it.date);
        return (
          <button key={it.id} type="button" className="row w-full text-left" onClick={() => openEditor(it.c, it.id)}>
            <Icon name={it.icon} size={16} className="flex-none text-muted" />
            <span className="min-w-0 flex-1 truncate">{it.title}</span>
            <span className={cx('chip', days < 0 && '!border-bad/40 !text-bad', days >= 0 && days <= 2 && '!border-warn/40 !text-warn')}>{days < 0 ? `${-days}d late` : days === 0 ? 'Today' : `${days}d`}</span>
          </button>
        );
      })}
    </div>
  );
}

function ProjectStatus() {
  const projects = useRecords('projects');
  const tasks = useRecords('tasks');
  const active = projects.filter((p) => !p.archived && p.status !== 'done').slice(0, 5);
  if (!active.length) return <Faint>No active projects. <button type="button" className="text-accent" onClick={() => openEditor('projects')}>Start one</button></Faint>;
  return (
    <div className="space-y-3">
      {active.map((p) => {
        const mine = tasks.filter((t) => t.projectId === p.id && !t.archived);
        const done = mine.filter((t) => t.status === 'done').length;
        return (
          <button key={p.id} type="button" className="block w-full text-left" onClick={() => navigate(`/projects/${p.id}`)}>
            <div className="mb-1 flex items-center gap-2 text-sm">
              <span className="size-2 flex-none rounded-full" style={{ background: p.color ?? 'var(--accent)' }} />
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="num text-xs text-faint">{done}/{mine.length}</span>
            </div>
            <Progress value={mine.length ? done / mine.length : 0} color={p.color} label={`${p.name} progress`} />
          </button>
        );
      })}
    </div>
  );
}

function HabitProgress() {
  const habits = useRecords('habits');
  const logs = useRecords('habitLogs');
  const now = useNow();
  const due = habits.filter((h) => !h.archived && isDue(h, now)).slice(0, 8);
  if (!due.length) return <Faint>No habits yet. <button type="button" className="text-accent" onClick={() => openEditor('habits')}>Create one</button></Faint>;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
      {due.map((h) => {
        const map = byDate(logs, h.id);
        const p = periodProgress(h, map, now);
        const s = streaks(h, map, now);
        return (
          <button key={h.id} type="button" aria-pressed={p.met} aria-label={`${h.name}: ${p.done} of ${p.target}. Tap to check in`} onClick={() => void tapHabit(h)} className={cx('flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors', p.met ? 'border-transparent bg-accent-soft' : 'border-line hover:bg-surface-2')}>
            <Ring value={p.done / p.target} size={34} stroke={4} color={h.color}>{p.met && <Icon name="check" size={14} className="text-accent" strokeWidth={3} />}</Ring>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{h.name}</span><span className="block text-xs text-faint">{s.current > 0 ? `${s.current} streak` : `${p.done}/${p.target}`}</span></span>
          </button>
        );
      })}
    </div>
  );
}

function FocusTime() {
  const t = useToday();
  const [prefs] = usePrefs();
  return (
    <div className="flex items-center gap-4">
      <Ring value={prefs.focus.goal ? t.focusMin / prefs.focus.goal : 0} size={72} stroke={6} label="Focus goal progress"><Icon name="timer" size={20} className="text-accent" /></Ring>
      <div className="min-w-0 flex-1">
        <div className="num text-2xl font-semibold">{fmtDuration(t.focusMin)}</div>
        <div className="text-xs text-faint">of {fmtDuration(prefs.focus.goal)} goal today</div>
        <Button size="sm" icon="play" className="mt-2" onClick={() => navigate('/focus')}>Start focus</Button>
      </div>
    </div>
  );
}

function FinanceOverview() {
  const txns = useRecords('transactions');
  const [prefs] = usePrefs();
  const now = useNow();
  const month = totals(inMonth(txns as Txn[], ym(now)), prefs.currency, { ...DEFAULT_RATES, ...prefs.rates });
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Income', month.income, 'text-good'], ['Spent', month.expense, 'text-bad'], ['Net', month.net, month.net >= 0 ? 'text-text' : 'text-bad']].map(([label, value, tone]) => (
          <div key={label as string} className="rounded-xl border border-line px-1 py-2">
            <div className="text-xs text-muted">{label}</div>
            <div className={cx('num truncate text-[1.02rem] font-semibold', tone as string)}>{fmtMoney(value as number, prefs.currency, { compact: true })}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-faint">
        <span>{now.toLocaleDateString(undefined, { month: 'long' })} · savings rate {Math.round(month.savingsRate * 100)}%</span>
        <button type="button" className="text-accent" onClick={() => openCapture('expense')}>Log expense</button>
      </div>
    </div>
  );
}

function RecentNotes() {
  const notes = useRecords('notes');
  const list = [...notes].filter((n) => !n.archived).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b._ua - a._ua).slice(0, 5);
  if (!list.length) return <Faint>No notes yet. <button type="button" className="text-accent" onClick={() => openCapture('note')}>Write one</button></Faint>;
  return (
    <div className="-mx-2">
      {list.map((n) => (
        <button key={n.id} type="button" className="row w-full text-left" onClick={() => navigate(`/notes/${n.id}`)}>
          <Icon name={n.pinned ? 'pinned' : 'notes'} size={15} className={n.pinned ? 'flex-none text-accent' : 'flex-none text-muted'} />
          <span className="min-w-0 flex-1 truncate">{n.title || 'Untitled'}</span>
          <span className="flex-none text-xs text-faint">{timeAgo(n._ua)}</span>
        </button>
      ))}
    </div>
  );
}

export function goalProgress(goal: { id: string; progress?: number; targetValue?: number; currentValue?: number; status?: string }, all: { parentId?: string; id: string; progress?: number; targetValue?: number; currentValue?: number; status?: string; kind?: string }[], milestones: { id?: string; goalId?: string; done?: boolean }[], tasks: { id?: string; goalId?: string; status?: string }[] = [], depth = 0): number {
  if (goal.status === 'achieved') return 1;
  const children = all.filter((g) => g.parentId === goal.id && g.status !== 'dropped');
  if (children.length && depth < 4) return children.reduce((a, c) => a + goalProgress(c, all, milestones, tasks, depth + 1), 0) / children.length;
  if (Number(goal.targetValue) > 0) return Math.max(0, Math.min(1, Number(goal.currentValue ?? 0) / Number(goal.targetValue)));
  const ms = milestones.filter((m) => m.goalId === goal.id);
  if (ms.length) return ms.filter((m) => m.done).length / ms.length;
  const linked = tasks.filter((t) => t.goalId === goal.id);
  if (linked.length) return linked.filter((t) => t.status === 'done').length / linked.length;
  return Math.max(0, Math.min(1, Number(goal.progress ?? 0)));
}

function GoalsWidget() {
  const goals = useRecords('goals');
  const milestones = useRecords('milestones');
  const tasks = useRecords('tasks');
  const active = goals.filter((g) => g.status === 'active' && !g.archived && g.kind !== 'keyResult').slice(0, 4);
  if (!active.length) return <Faint>No active goals. <button type="button" className="text-accent" onClick={() => openCapture('goal')}>Set one</button></Faint>;
  return (
    <div className="space-y-3">
      {active.map((g) => {
        const p = goalProgress(g, goals, milestones, tasks);
        return (
          <button key={g.id} type="button" className="block w-full text-left" onClick={() => openEditor('goals', g.id)}>
            <div className="mb-1 flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate font-medium">{g.title}</span><span className="num text-xs text-muted">{Math.round(p * 100)}%</span></div>
            <Progress value={p} label={`${g.title} progress`} />
          </button>
        );
      })}
    </div>
  );
}

function RemindersWidget() {
  const notifications = useRecords('notifications');
  const unread = notifications.filter((n) => !n.readAt).sort((a, b) => b._ca - a._ca).slice(0, 5);
  if (!unread.length) return <Faint>You are all caught up.</Faint>;
  return (
    <div className="-mx-2">
      {unread.map((n) => (
        <div key={n.id} className="row">
          <Icon name="bell" size={15} className="flex-none text-accent" />
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => useApp.setState({ notifications: true })}><span className="block truncate text-sm">{n.body || n.title}</span><span className="block text-xs text-faint">{n.title}</span></button>
          <IconButton icon="check" label="Mark as read" className="!size-8" onClick={() => void update(n.id, { readAt: new Date().toISOString() }, { silent: true })} />
        </div>
      ))}
    </div>
  );
}

function CaptureWidget() {
  const enabled = useEnabledModules();
  const kinds: [string, string, IconName, string][] = [['task', 'Task', 'tasks', 'tasks'], ['note', 'Note', 'notes', 'notes'], ['event', 'Event', 'calendar', 'calendar'], ['expense', 'Expense', 'wallet', 'finance'], ['idea', 'Idea', 'idea', 'notes'], ['journal', 'Journal', 'journal', 'journal']];
  return (
    <div className="grid grid-cols-3 gap-2">
      {kinds.filter((k) => enabled.has(k[3])).map(([id, label, icon]) => (
        <button key={id} type="button" onClick={() => openCapture(id)} className="flex flex-col items-center gap-1.5 rounded-xl border border-line py-3 text-xs font-medium hover:bg-surface-2">
          <Icon name={icon} size={18} className="text-accent" />{label}
        </button>
      ))}
    </div>
  );
}

function PersonalStats() {
  const tasks = useRecords('tasks');
  const notes = useRecords('notes');
  const habits = useRecords('habits');
  const logs = useRecords('habitLogs');
  const sessions = useRecords('focusSessions');
  const now = useNow();
  const best = Math.max(0, ...habits.map((h) => streaks(h, byDate(logs, h.id), now).current));
  const focus = sessions.filter((s) => s.kind !== 'break').reduce((a, s) => a + (Number(s.minutes) || 0), 0);
  const stats: [string, string][] = [['Tasks completed', String(tasks.filter((t) => t.status === 'done').length)], ['Best current streak', `${best} d`], ['Notes written', String(notes.length)], ['Focus time', fmtDuration(focus)]];
  return (
    <dl className="grid grid-cols-2 gap-2">
      {stats.map(([label, value]) => <div key={label} className="rounded-xl border border-line px-3 py-2"><dt className="text-xs text-muted">{label}</dt><dd className="num text-lg font-semibold">{value}</dd></div>)}
    </dl>
  );
}

function RecentActivity() {
  const activity = useRecords('activity');
  const list = [...activity].sort((a, b) => b._ca - a._ca).slice(0, 7);
  if (!list.length) return <Faint>Your recent activity will appear here.</Faint>;
  const icon: Record<string, IconName> = { created: 'plus', completed: 'checkCircle', deleted: 'trash', restored: 'undo' };
  return (
    <ul className="space-y-1.5">
      {list.map((a) => (
        <li key={a.id} className="flex items-center gap-2 text-sm">
          <Icon name={icon[a.action as string] ?? 'activity'} size={14} className={a.action === 'completed' ? 'flex-none text-good' : 'flex-none text-muted'} />
          <span className="min-w-0 flex-1 truncate"><span className="capitalize text-muted">{a.action}</span> {a.summary}</span>
          <span className="flex-none text-xs text-faint">{timeAgo(a._ca)}</span>
        </li>
      ))}
    </ul>
  );
}

const WIDGETS: Record<string, WidgetDef> = {
  today: { name: 'Daily overview', description: "Today's tasks, events, habits and focus", icon: 'sun', module: 'home', size: 'l', render: () => <DailyOverview /> },
  week: { name: 'Weekly overview', description: 'Completed tasks and habit check-ins, last 7 days', icon: 'chart', module: 'home', size: 'l', render: () => <WeeklyOverview /> },
  tasks: { name: "Today's tasks", description: 'Due today and overdue, with quick add', icon: 'tasks', module: 'tasks', size: 'l', link: '/tasks', render: () => <TodayTasks /> },
  events: { name: 'Upcoming events', description: 'The next two weeks', icon: 'calendar', module: 'calendar', size: 'm', link: '/calendar', render: () => <UpcomingEvents /> },
  deadlines: { name: 'Important deadlines', description: 'Tasks, milestones, assignments and exams', icon: 'flag', module: 'tasks', size: 'm', render: () => <Deadlines /> },
  projects: { name: 'Project status', description: 'Progress of active projects', icon: 'projects', module: 'projects', size: 'm', link: '/projects', render: () => <ProjectStatus /> },
  habits: { name: 'Habit progress', description: 'Check in on today’s habits', icon: 'repeat', module: 'habits', size: 'l', link: '/habits', render: () => <HabitProgress /> },
  focus: { name: 'Focus time', description: 'Minutes focused today against your goal', icon: 'timer', module: 'focus', size: 'm', link: '/focus', render: () => <FocusTime /> },
  finance: { name: 'Financial overview', description: 'This month’s income, spending and net', icon: 'wallet', module: 'finance', size: 'm', link: '/finance', render: () => <FinanceOverview /> },
  notes: { name: 'Recent notes', description: 'Pinned and recently edited', icon: 'notes', module: 'notes', size: 'm', link: '/notes', render: () => <RecentNotes /> },
  goals: { name: 'Goals', description: 'Progress on active goals', icon: 'target', module: 'goals', size: 'm', link: '/goals', render: () => <GoalsWidget /> },
  reminders: { name: 'Reminders', description: 'Unread notifications', icon: 'bell', module: 'home', size: 'm', render: () => <RemindersWidget /> },
  capture: { name: 'Quick capture', description: 'One-tap capture buttons', icon: 'plus', module: 'home', size: 'm', render: () => <CaptureWidget /> },
  stats: { name: 'Personal statistics', description: 'Totals computed from your data', icon: 'trending', module: 'home', size: 'm', render: () => <PersonalStats /> },
  activity: { name: 'Recent activity', description: 'What you created and completed', icon: 'activity', module: 'home', size: 'm', render: () => <RecentActivity /> },
};

const TEMPLATES: Record<string, { name: string; description: string; widgets: [string, Size][] }> = {
  default: { name: 'Everyday', description: 'A balanced start page', widgets: [['today', 'l'], ['tasks', 'l'], ['events', 'm'], ['habits', 'l'], ['deadlines', 'm'], ['goals', 'm'], ['notes', 'm'], ['finance', 'm'], ['activity', 'm']] },
  focus: { name: 'Focus', description: 'Only what needs doing now', widgets: [['tasks', 'xl'], ['focus', 'm'], ['deadlines', 'm'], ['habits', 'm']] },
  planner: { name: 'Planner', description: 'Week, deadlines and projects', widgets: [['week', 'l'], ['events', 'l'], ['deadlines', 'm'], ['projects', 'm'], ['goals', 'm'], ['tasks', 'xl']] },
  money: { name: 'Money', description: 'Finance first', widgets: [['finance', 'l'], ['reminders', 'l'], ['goals', 'm'], ['deadlines', 'm'], ['capture', 'm']] },
  wellbeing: { name: 'Wellbeing', description: 'Habits, focus and reflection', widgets: [['habits', 'xl'], ['focus', 'm'], ['today', 'l'], ['stats', 'm'], ['notes', 'm']] },
};
const fromTemplate = (key: string): WidgetInstance[] => TEMPLATES[key].widgets.map(([type, size]) => ({ id: uid().slice(0, 8), type, size }));

function WidgetFrame({ w, def, editing, onSize, onRemove, onMove }: { w: WidgetInstance; def: WidgetDef; editing: boolean; onSize: (s: Size) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id, disabled: !editing });
  return (
    <section ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx('widget', SIZE_CLASS[w.size], editing && 'ring-1 ring-dashed ring-line-strong', isDragging && 'z-20 opacity-80 shadow-2xl')} aria-label={def.name}>
      <header className="mb-2.5 flex min-h-7 items-center gap-2">
        {editing && <button type="button" className="-ml-1 grid size-8 cursor-grab touch-none place-items-center rounded-lg text-faint hover:bg-surface-2" aria-label={`Drag ${def.name}`} {...attributes} {...listeners}><Icon name="grip" size={16} /></button>}
        <Icon name={def.icon} size={15} className="text-muted" />
        <h2 className="min-w-0 flex-1 truncate font-sans text-[0.86rem] font-semibold tracking-normal">{def.name}</h2>
        {editing ? (
          <>
            <IconButton icon="arrowLeft" label="Move earlier" className="!size-8" onClick={() => onMove(-1)} />
            <IconButton icon="arrowRight" label="Move later" className="!size-8" onClick={() => onMove(1)} />
            <Menu label="Widget size" items={(Object.keys(SIZE_LABEL) as Size[]).map((s) => ({ label: SIZE_LABEL[s], checked: w.size === s, onClick: () => onSize(s) }))} trigger={(p) => <IconButton icon="maximize" label="Resize widget" className="!size-8" {...p} />} />
            <IconButton icon="x" label={`Remove ${def.name}`} className="!size-8" onClick={onRemove} />
          </>
        ) : def.link ? (
          <IconButton icon="arrowRight" label={`Open ${def.name}`} className="!size-7" size={15} onClick={() => navigate(def.link!)} />
        ) : null}
      </header>
      <div className={cx(editing && 'pointer-events-none opacity-70')}>{def.render()}</div>
    </section>
  );
}

export default function Home(_: ModuleProps) {
  const identity = useApp((s) => s.identity);
  const enabled = useEnabledModules();
  const dashboards = useRecords('dashboards');
  const [prefs, setPrefs] = usePrefs();
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const sorted = useMemo(() => [...dashboards].sort((a, b) => a._ca - b._ca), [dashboards]);
  const current = sorted.find((d) => d.id === prefs.views.dashboard) ?? sorted[0];
  const widgets: WidgetInstance[] = useMemo(() => ((current?.widgets as WidgetInstance[]) ?? fromTemplate('default')).filter((w) => WIDGETS[w.type]), [current]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = widgets.filter((w) => WIDGETS[w.type].module === 'home' || enabled.has(WIDGETS[w.type].module));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }));

  /** Persist a layout change; the built-in default becomes a real dashboard the first time it is edited. */
  const save = async (next: WidgetInstance[]) => {
    if (current) await update(current.id, { widgets: next }, { silent: true });
    else setPrefs({ views: { ...prefs.views, dashboard: (await create('dashboards', { name: 'Home', widgets: next }, { silent: true })).id } });
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = widgets.findIndex((w) => w.id === e.active.id);
    const to = widgets.findIndex((w) => w.id === e.over!.id);
    if (from >= 0 && to >= 0) void save(arrayMove(widgets, from, to));
  };
  const newDashboard = async (templateKey: string) => {
    const name = await promptDialog({ title: 'New dashboard', initial: TEMPLATES[templateKey].name, confirmLabel: 'Create' });
    if (!name?.trim()) return;
    const rec = await create('dashboards', { name: name.trim(), widgets: fromTemplate(templateKey) }, { silent: true });
    setPrefs({ views: { ...prefs.views, dashboard: rec.id } });
  };
  const name = identity?.mode === 'account' ? identity.displayName.split(' ')[0] : '';
  const available = Object.entries(WIDGETS).filter(([, d]) => d.module === 'home' || enabled.has(d.module));

  return (
    <Page
      module="home" wide title={`${greeting(now)}${name ? `, ${name}` : ''}`} subtitle={now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      actions={
        <>
          <Menu
            label="Dashboards"
            items={[
              ...(sorted.length ? sorted.map((d) => ({ label: String(d.name), checked: d.id === current?.id, onClick: () => setPrefs({ views: { ...prefs.views, dashboard: d.id } }) })) : [{ label: 'Home', checked: true }]),
              { separator: true, label: '' },
              ...Object.entries(TEMPLATES).map(([key, t]) => ({ label: `New from “${t.name}” template`, icon: 'plus' as const, onClick: () => void newDashboard(key) })),
              ...(current ? [
                { separator: true, label: '' },
                { label: 'Rename dashboard', icon: 'pencil' as const, onClick: async () => { const n = await promptDialog({ title: 'Rename dashboard', initial: String(current.name) }); if (n?.trim()) await update(current.id, { name: n.trim() }, { silent: true }); } },
                { label: 'Delete dashboard', icon: 'trash' as const, danger: true, onClick: async () => { if (await confirmDialog({ title: `Delete “${current.name}”?`, body: 'Only the layout is removed. Your data is not affected.', danger: true, confirmLabel: 'Delete' })) { await remove(current.id, { silent: true }); toast('Dashboard deleted'); } } },
              ] : []),
            ]}
            trigger={(p) => <Button size="sm" icon="dashboard" {...p}><span className="max-w-28 truncate">{current ? String(current.name) : 'Home'}</span><Icon name="chevronDown" size={14} /></Button>}
          />
          {editing && <Button size="sm" icon="plus" onClick={() => setAdding(true)}>Add widget</Button>}
          <Button size="sm" variant={editing ? 'primary' : 'default'} icon={editing ? 'check' : 'sliders'} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Customize'}</Button>
        </>
      }
    >
      {visible.length === 0 ? (
        <div className="widget py-10 text-center"><p className="font-medium">This dashboard is empty</p><p className="mt-1 text-sm text-muted">Add widgets to build your home screen.</p><Button className="mt-3" variant="primary" icon="plus" onClick={() => { setEditing(true); setAdding(true); }}>Add widget</Button></div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map((w) => w.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6 xl:grid-cols-12">
              {visible.map((w) => (
                <WidgetFrame
                  key={w.id} w={w} def={WIDGETS[w.type]} editing={editing}
                  onSize={(size) => void save(widgets.map((x) => (x.id === w.id ? { ...x, size } : x)))}
                  onRemove={() => void save(widgets.filter((x) => x.id !== w.id))}
                  onMove={(dir) => { const i = widgets.findIndex((x) => x.id === w.id); const j = i + dir; if (j >= 0 && j < widgets.length) void save(arrayMove(widgets, i, j)); }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a widget" width={520}>
        <div className="grid gap-2 sm:grid-cols-2">
          {available.map(([type, def]) => {
            const count = widgets.filter((w) => w.type === type).length;
            return (
              <button key={type} type="button" className="flex items-start gap-3 rounded-xl border border-line p-3 text-left hover:bg-surface-2" onClick={() => { void save([...widgets, { id: uid().slice(0, 8), type, size: def.size }]); toast(`${def.name} added`, { tone: 'good' }); }}>
                <span className="grid size-9 flex-none place-items-center rounded-lg bg-accent-soft text-accent"><Icon name={def.icon} size={17} /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{def.name}{count > 0 && <span className="ml-1.5 text-xs text-faint">added</span>}</span><span className="block text-xs text-muted">{def.description}</span></span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </Page>
  );
}
