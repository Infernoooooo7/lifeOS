import { diffDays, parseDate, startOfDay, ymd } from './dates';
import { nextDue, type Recurrence } from './recurrence';

export interface TaskLike {
  id: string;
  title?: string;
  status?: string;
  priority?: number;
  dueAt?: string | null;
  startAt?: string | null;
  completedAt?: string | null;
  projectId?: string | null;
  parentId?: string | null;
  goalId?: string | null;
  tags?: string[];
  dependsOn?: string[];
  recurrence?: Recurrence | null;
  archived?: boolean;
  position?: number;
  estimateMin?: number | null;
  _ca?: number;
}

export const TASK_STATUSES = [
  { value: 'todo', label: 'To do', color: '#94a3b8' },
  { value: 'doing', label: 'In progress', color: '#38bdf8' },
  { value: 'waiting', label: 'Waiting', color: '#fbbf24' },
  { value: 'done', label: 'Done', color: '#34d399' },
] as const;

export const PRIORITIES = [
  { value: 0, label: 'None', color: '#64748b' },
  { value: 1, label: 'Low', color: '#38bdf8' },
  { value: 2, label: 'Medium', color: '#fbbf24' },
  { value: 3, label: 'High', color: '#fb7185' },
] as const;

export const isDone = (t: TaskLike) => t.status === 'done';
export const isOpen = (t: TaskLike) => !isDone(t) && !t.archived;

export function isOverdue(t: TaskLike, now: Date = new Date()): boolean {
  const due = parseDate(t.dueAt);
  if (!due || isDone(t)) return false;
  return t.dueAt!.length === 10 ? diffDays(now, due) < 0 : due.getTime() < now.getTime();
}

export const isDueToday = (t: TaskLike, now: Date = new Date()) => {
  const due = parseDate(t.dueAt);
  return !!due && diffDays(now, due) === 0;
};

/** A task is blocked while any task it depends on is still open. */
export function blockers(t: TaskLike, byId: Map<string, TaskLike>): TaskLike[] {
  return (t.dependsOn ?? []).map((id) => byId.get(id)).filter((d): d is TaskLike => !!d && !isDone(d));
}

/** Would making `task` depend on `dependencyId` create a cycle? */
export function wouldCycle(taskId: string, dependencyId: string, byId: Map<string, TaskLike>): boolean {
  const seen = new Set<string>();
  const stack = [dependencyId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of byId.get(id)?.dependsOn ?? []) stack.push(next);
  }
  return false;
}

/** Sort: open before done, then overdue/soonest due, then priority, then manual position. */
export function compareTasks(a: TaskLike, b: TaskLike): number {
  if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
  const da = parseDate(a.dueAt)?.getTime() ?? Infinity;
  const dbb = parseDate(b.dueAt)?.getTime() ?? Infinity;
  if (da !== dbb) return da - dbb;
  if ((b.priority ?? 0) !== (a.priority ?? 0)) return (b.priority ?? 0) - (a.priority ?? 0);
  return (a.position ?? a._ca ?? 0) - (b.position ?? b._ca ?? 0);
}

export type SmartGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'someday' | 'done';
export const SMART_GROUPS: { id: SmartGroup; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: 'Next 7 days' },
  { id: 'later', label: 'Later' },
  { id: 'someday', label: 'No date' },
  { id: 'done', label: 'Completed' },
];

export function smartGroup(t: TaskLike, now: Date = new Date()): SmartGroup {
  if (isDone(t)) return 'done';
  const due = parseDate(t.dueAt);
  if (!due) return 'someday';
  const n = diffDays(now, due);
  if (n < 0 || isOverdue(t, now)) return 'overdue';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return n <= 7 ? 'week' : 'later';
}

export function groupTasks<T extends TaskLike>(tasks: T[], by: 'smart' | 'status' | 'priority' | 'project' | 'tag' | 'none', now: Date = new Date()): { key: string; items: T[] }[] {
  if (by === 'none') return [{ key: '', items: [...tasks].sort(compareTasks) }];
  const groups = new Map<string, T[]>();
  const push = (key: string, t: T) => (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  for (const t of tasks) {
    if (by === 'smart') push(smartGroup(t, now), t);
    else if (by === 'status') push(t.status || 'todo', t);
    else if (by === 'priority') push(String(t.priority ?? 0), t);
    else if (by === 'project') push(t.projectId || '', t);
    else if (t.tags?.length) for (const tag of t.tags) push(tag, t);
    else push('', t);
  }
  const order =
    by === 'smart' ? SMART_GROUPS.map((g) => g.id as string)
    : by === 'status' ? TASK_STATUSES.map((s) => s.value as string)
    : by === 'priority' ? ['3', '2', '1', '0']
    : [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  return order.filter((k) => groups.has(k)).map((key) => ({ key, items: groups.get(key)!.sort(compareTasks) }));
}

/** Completion of a parent task from its subtasks, 0–1 (null when it has none). */
export function subtaskProgress(taskId: string, all: TaskLike[]): { done: number; total: number } | null {
  const subs = all.filter((t) => t.parentId === taskId);
  return subs.length ? { done: subs.filter(isDone).length, total: subs.length } : null;
}

/**
 * Fields for the next instance of a recurring task that was just completed, or null if the series ended.
 * The completed task stays in history; the next instance is a fresh open copy.
 */
export function nextRecurringInstance(t: TaskLike, completedAt: Date = new Date()): Partial<TaskLike> | null {
  if (!t.recurrence) return null;
  const due = parseDate(t.dueAt) ?? startOfDay(completedAt);
  const next = nextDue(due, t.recurrence, completedAt);
  if (!next) return null;
  const dateOnly = !t.dueAt || t.dueAt.length === 10;
  const recurrence = t.recurrence.count ? { ...t.recurrence, count: t.recurrence.count - 1 } : t.recurrence;
  if (t.recurrence.count && t.recurrence.count <= 1) return null;
  return {
    title: t.title, priority: t.priority, projectId: t.projectId, goalId: t.goalId, tags: t.tags, estimateMin: t.estimateMin,
    recurrence, status: 'todo', completedAt: null, dueAt: dateOnly ? ymd(next) : next.toISOString(),
  };
}

/** Tasks completed per day for the last `days` days (oldest first). */
export function completionTrend(tasks: TaskLike[], days = 14, now: Date = new Date()): { date: string; done: number; created: number }[] {
  const out: { date: string; done: number; created: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = ymd(d);
    out.push({
      date: key,
      done: tasks.filter((t) => t.completedAt && ymd(new Date(t.completedAt)) === key).length,
      created: tasks.filter((t) => t._ca && ymd(new Date(t._ca)) === key).length,
    });
  }
  return out;
}
