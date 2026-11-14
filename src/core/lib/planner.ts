import { addDays, endOfDay, parseDate, startOfDay } from './dates';
import { compareTasks, isOpen, isOverdue, type TaskLike } from './tasks';

/**
 * Day planning: free time between commitments, and fitting tasks into it. Pure and deterministic, so the plan the
 * calendar proposes is the plan the tests check.
 */

export interface Span {
  start: Date;
  end: Date;
}

const hhmm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Free slots of at least `minMinutes` within working hours on a day. */
export function freeSlots(day: Date, busy: Span[], from: string, to: string, minMinutes: number): Span[] {
  const d0 = startOfDay(day);
  const at = (mins: number) => new Date(d0.getTime() + mins * 60_000);
  let cursor = at(hhmm(from));
  const end = at(hhmm(to));
  const out: Span[] = [];
  for (const b of [...busy].filter((x) => x.end > cursor && x.start < end).sort((a, b2) => a.start.getTime() - b2.start.getTime())) {
    if (b.start.getTime() - cursor.getTime() >= minMinutes * 60_000) out.push({ start: cursor, end: b.start });
    if (b.end > cursor) cursor = b.end;
  }
  if (end.getTime() - cursor.getTime() >= minMinutes * 60_000) out.push({ start: cursor, end });
  return out;
}

export interface PlanBlock {
  taskId: string;
  title: string;
  start: Date;
  end: Date;
  /** 1-based part number when a task is split across several slots */
  part: number;
  parts: number;
}

export interface DayPlan {
  blocks: PlanBlock[];
  /** tasks (or the remaining minutes of tasks) that did not fit */
  unplaced: { taskId: string; title: string; minutes: number }[];
  freeMinutes: number;
  plannedMinutes: number;
}

export interface PlanOptions {
  /** minutes assumed for a task without an estimate */
  defaultMinutes?: number;
  /** gap left after each block */
  buffer?: number;
  /** a task is only split into pieces at least this long */
  minChunk?: number;
}

/**
 * Which tasks deserve time on `day`: open, top-level tasks that are overdue, due that day, or high priority with
 * no date — minus those already blocked on the calendar that day. Most urgent first.
 */
export function planCandidates<T extends TaskLike & { title?: string }>(tasks: T[], day: Date, now: Date, alreadyBlocked: Set<string> = new Set()): T[] {
  const end = endOfDay(day);
  return tasks
    .filter((t) => isOpen(t) && !t.parentId && !alreadyBlocked.has(t.id) && (t.status as string) !== 'waiting')
    .filter((t) => {
      const due = parseDate(t.dueAt);
      return due ? due <= end : (t.priority ?? 0) >= 3;
    })
    .sort((a, b) => Number(isOverdue(b, now)) - Number(isOverdue(a, now)) || compareTasks(a, b));
}

/**
 * Fit tasks into the free time of a day, in order. A task goes into the first slot that holds it whole; a task too
 * long for any slot is split into pieces of at least `minChunk` minutes. Today, nothing is planned in the past.
 */
export function planDay<T extends TaskLike & { title?: string }>(tasks: T[], busy: Span[], day: Date, hours: { from: string; to: string }, now: Date, opts: PlanOptions = {}): DayPlan {
  const defaultMinutes = opts.defaultMinutes ?? 30;
  const buffer = opts.buffer ?? 5;
  const minChunk = opts.minChunk ?? 25;
  const quarter = 15 * 60_000;
  const earliest = startOfDay(day).getTime() === startOfDay(now).getTime() ? new Date(Math.ceil(now.getTime() / quarter) * quarter) : null;
  const slots = freeSlots(day, busy, hours.from, hours.to, minChunk)
    .map((s) => (earliest && s.start < earliest ? { start: earliest, end: s.end } : s))
    .filter((s) => s.end.getTime() - s.start.getTime() >= minChunk * 60_000)
    .map((s) => ({ ...s }));
  const freeMinutes = slots.reduce((sum, s) => sum + (s.end.getTime() - s.start.getTime()) / 60_000, 0);
  const minutesIn = (s: Span) => (s.end.getTime() - s.start.getTime()) / 60_000;
  const blocks: PlanBlock[] = [];
  const unplaced: DayPlan['unplaced'] = [];

  for (const task of tasks) {
    const need = Math.max(5, Math.ceil((Number(task.estimateMin) > 0 ? Number(task.estimateMin) : defaultMinutes) / 5) * 5);
    const title = String(task.title ?? 'Task');
    const whole = slots.find((s) => minutesIn(s) >= need);
    if (whole) {
      blocks.push({ taskId: task.id, title, start: whole.start, end: new Date(whole.start.getTime() + need * 60_000), part: 1, parts: 1 });
      whole.start = new Date(whole.start.getTime() + (need + buffer) * 60_000);
      continue;
    }
    // Split across slots, but only into pieces worth sitting down for.
    let left = need;
    const pieces: Span[] = [];
    for (const s of slots) {
      const room = Math.floor(minutesIn(s) / 5) * 5;
      if (room < minChunk || left <= 0) continue;
      const take = Math.min(left, room);
      pieces.push({ start: s.start, end: new Date(s.start.getTime() + take * 60_000) });
      s.start = new Date(s.start.getTime() + (take + buffer) * 60_000);
      left -= take;
    }
    pieces.forEach((p, i) => blocks.push({ taskId: task.id, title, start: p.start, end: p.end, part: i + 1, parts: pieces.length }));
    if (left > 0) unplaced.push({ taskId: task.id, title, minutes: left });
  }
  blocks.sort((a, b) => a.start.getTime() - b.start.getTime());
  const plannedMinutes = blocks.reduce((sum, b) => sum + (b.end.getTime() - b.start.getTime()) / 60_000, 0);
  return { blocks, unplaced, freeMinutes, plannedMinutes };
}

/** The next working day on or after `day` that is not in the past. */
export const planningDay = (day: Date, now: Date) => (startOfDay(day) < startOfDay(now) ? startOfDay(now) : startOfDay(day));
export const tomorrowOf = (now: Date) => startOfDay(addDays(now, 1));
