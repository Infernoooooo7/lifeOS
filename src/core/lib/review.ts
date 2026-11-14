import { addDays, parseDate, startOfDay, startOfWeek, ymd } from './dates';
import { byDate, consistency } from './habits';
import { isDone, isOpen, isOverdue, type TaskLike } from './tasks';

/**
 * Weekly review: the numbers and lists behind the guided review. Pure, so it is tested and every screen agrees.
 * A review belongs to the week it looks back on (Monday–Sunday by default); it is saved as a "weekly" journal
 * entry with a deterministic id, so reviewing twice in a week updates the same entry on every device.
 */

type R = Record<string, unknown> & { id: string; deletedAt?: unknown };
const live = <T extends R>(rows: T[] = []) => rows.filter((r) => !r.deletedAt);

/** The week under review: the current week from Friday on, otherwise the previous week (reviews usually happen at the weekend or on Monday). */
export function reviewWeek(now: Date, weekStart = 1): { start: Date; end: Date; key: string } {
  const thisWeek = startOfWeek(now, weekStart);
  const daysIn = Math.round((startOfDay(now).getTime() - thisWeek.getTime()) / 86_400_000);
  const start = daysIn >= 4 ? thisWeek : addDays(thisWeek, -7);
  return { start, end: addDays(start, 7), key: ymd(start) };
}

export const reviewEntryId = (weekKey: string) => `jr:${weekKey}:weekly`;

export interface ReviewInput {
  tasks?: (TaskLike & R)[];
  habits?: R[];
  habitLogs?: R[];
  focusSessions?: R[];
  interactions?: R[];
  events?: R[];
}

export interface ReviewSummary {
  completed: (TaskLike & R)[];
  created: number;
  overdue: (TaskLike & R)[];
  /** open top-level tasks with no due date, no project and not parked as "someday": captured but never decided on */
  inbox: (TaskLike & R)[];
  upcoming: (TaskLike & R)[];
  habitConsistency: number | null;
  focusMinutes: number;
  catchUps: number;
}

const within = (value: unknown, start: Date, end: Date) => {
  const d = parseDate(value);
  return !!d && d >= start && d < end;
};

export function reviewSummary(input: ReviewInput, now: Date, week = reviewWeek(now)): ReviewSummary {
  const tasks = live(input.tasks);
  const completed = tasks.filter((t) => isDone(t) && within(t.completedAt, week.start, week.end));
  const created = tasks.filter((t) => typeof t._ca === 'number' && t._ca >= week.start.getTime() && t._ca < week.end.getTime()).length;
  const open = tasks.filter((t) => isOpen(t));
  const overdue = open.filter((t) => isOverdue(t, now)).sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
  const inbox = open.filter((t) => !t.dueAt && !t.projectId && !t.parentId && !t.tags?.includes('someday')).sort((a, b) => (a._ca ?? 0) - (b._ca ?? 0));
  const horizon = addDays(startOfDay(now), 8);
  const upcoming = open
    .filter((t) => { const d = parseDate(t.dueAt); return !!d && d >= startOfDay(now) && d < horizon; })
    .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));

  const habits = live(input.habits).filter((h) => !h.archived);
  const logs = live(input.habitLogs);
  const last = addDays(week.end, -1);
  const habitConsistency = habits.length
    ? habits.reduce((sum, h) => sum + consistency(h as never, byDate(logs as never, h.id), 7, last < now ? last : now), 0) / habits.length
    : null;

  const focusMinutes = live(input.focusSessions)
    .filter((s) => s.kind !== 'break' && within(s.startedAt, week.start, week.end))
    .reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
  const catchUps = live(input.interactions).filter((i) => within(i.date, week.start, week.end)).length;

  return { completed, created, overdue, inbox, upcoming, habitConsistency, focusMinutes, catchUps };
}

/** Where "Tomorrow" and "Next week" (Monday) put a rescheduled task. */
export function rescheduleTargets(now: Date, weekStart = 1): { tomorrow: string; nextWeek: string } {
  return { tomorrow: ymd(addDays(now, 1)), nextWeek: ymd(addDays(startOfWeek(now, weekStart), 7)) };
}

/** Consecutive weeks, up to the week under review, that have a saved weekly review. */
export function reviewStreak(entries: R[], now: Date, weekStart = 1): number {
  const done = new Set(live(entries).filter((e) => e.kind === 'weekly' && typeof e.week === 'string').map((e) => e.week as string));
  let streak = 0;
  let cursor = reviewWeek(now, weekStart).start;
  // This week's review may still be ahead; do not break the streak for it.
  if (!done.has(ymd(cursor))) cursor = addDays(cursor, -7);
  while (done.has(ymd(cursor))) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  return streak;
}
