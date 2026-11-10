import { addDays, parseDate, startOfWeek, ymd } from './dates';

export interface HabitLike {
  id: string;
  cadence?: 'daily' | 'weekly' | 'monthly' | string;
  /** amount needed per period for the period to count (daily: per day; weekly/monthly: check-ins per period) */
  target?: number;
  /** daily habits only: weekdays the habit is scheduled (0 = Sunday); empty = every day */
  days?: number[];
}
export interface LogLike {
  id?: string;
  habitId?: string;
  date?: string;
  value?: number;
}

export const logId = (habitId: string, date: string) => `hl:${habitId}:${date}`;

const target = (h: HabitLike) => (h.target && h.target > 0 ? h.target : 1);
const scheduled = (h: HabitLike, d: Date) => !h.days?.length || h.days.includes(d.getDay());

/** date → total value logged that day */
export function byDate(logs: LogLike[], habitId: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of logs) if (l.habitId === habitId && l.date) map.set(l.date, (map.get(l.date) ?? 0) + (l.value ?? 1));
  return map;
}

const periodKey = (h: HabitLike, d: Date) => (h.cadence === 'weekly' ? ymd(startOfWeek(d)) : h.cadence === 'monthly' ? ymd(d).slice(0, 7) : ymd(d));

/** Number of completed check-ins in the period containing `day`, and whether the period's target is met. */
export function periodProgress(h: HabitLike, logs: Map<string, number>, day: Date = new Date()): { done: number; target: number; met: boolean } {
  if (h.cadence !== 'weekly' && h.cadence !== 'monthly') {
    const done = logs.get(ymd(day)) ?? 0;
    return { done, target: target(h), met: done >= target(h) };
  }
  const key = periodKey(h, day);
  let done = 0;
  for (const [date, value] of logs) {
    const d = parseDate(date);
    if (d && value > 0 && periodKey(h, d) === key) done++;
  }
  return { done, target: target(h), met: done >= target(h) };
}

/**
 * Current and longest streak, counted in periods (days, weeks or months) in which the target was met.
 * The current period does not break a streak while it is still in progress.
 */
export function streaks(h: HabitLike, logs: Map<string, number>, today: Date = new Date()): { current: number; longest: number } {
  if (!logs.size) return { current: 0, longest: 0 };
  const dates = [...logs.keys()].sort();
  const first = parseDate(dates[0])!;
  const step = (d: Date) => (h.cadence === 'weekly' ? addDays(d, -7) : h.cadence === 'monthly' ? new Date(d.getFullYear(), d.getMonth() - 1, 1) : addDays(d, -1));
  const firstKey = periodKey(h, first);

  let current = 0;
  let longest = 0;
  let run = 0;
  let countingCurrent = true;
  let cursor = h.cadence === 'monthly' ? new Date(today.getFullYear(), today.getMonth(), 1) : today;
  let isFirstPeriod = true;
  for (let guard = 0; guard < 5000; guard++) {
    const isDaily = h.cadence !== 'weekly' && h.cadence !== 'monthly';
    if (isDaily && !scheduled(h, cursor)) {
      // unscheduled days neither extend nor break a streak
    } else {
      const met = periodProgress(h, logs, cursor).met;
      if (met) {
        run++;
        if (countingCurrent) current = run;
        longest = Math.max(longest, run);
      } else if (!isFirstPeriod) {
        countingCurrent = false;
        run = 0;
      }
      isFirstPeriod = false;
    }
    if (periodKey(h, cursor) <= firstKey) break;
    cursor = step(cursor);
  }
  return { current, longest };
}

/** Share of scheduled periods in the last `days` days in which the target was met (0–1). */
export function consistency(h: HabitLike, logs: Map<string, number>, days = 30, today: Date = new Date()): number {
  if (h.cadence === 'weekly' || h.cadence === 'monthly') {
    const periods = new Set<string>();
    const met = new Set<string>();
    for (let i = 0; i < days; i++) {
      const d = addDays(today, -i);
      const key = periodKey(h, d);
      periods.add(key);
      if (periodProgress(h, logs, d).met) met.add(key);
    }
    return periods.size ? met.size / periods.size : 0;
  }
  let total = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i);
    if (!scheduled(h, d)) continue;
    total++;
    if ((logs.get(ymd(d)) ?? 0) >= target(h)) done++;
  }
  return total ? done / total : 0;
}

/** Whether a daily habit is due on `day`. */
export const isDue = (h: HabitLike, day: Date = new Date()) => (h.cadence === 'weekly' || h.cadence === 'monthly' ? true : scheduled(h, day));
