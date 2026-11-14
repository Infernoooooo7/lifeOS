import { addDays, addMonths, startOfDay, ymd } from './dates';

/**
 * A deliberately small recurrence model (a subset of RFC 5545 RRULE) that covers what personal
 * planning needs: every N days / weeks (on chosen weekdays) / months / years, ending never, on a
 * date, or after a count.
 */
export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  /** weekly only: 0 = Sunday … 6 = Saturday */
  byDay?: number[];
  /** inclusive end date (YYYY-MM-DD or ISO) */
  until?: string | null;
  count?: number | null;
  /** monthly only: the nth of the weekday in `byDay[0]` (1–4), or -1 for the last one — "the 2nd Tuesday" */
  setPos?: number | null;
  /** dates (YYYY-MM-DD) of occurrences that were skipped; like iCalendar EXDATE they still count towards `count` */
  exdates?: string[];
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HARD_LIMIT = 5000;

function* iterate(start: Date, rule: Recurrence): Generator<Date> {
  const interval = Math.max(1, Math.floor(rule.interval ?? 1));
  const until = rule.until ? new Date(new Date(rule.until).getTime() + (rule.until.length === 10 ? 86_399_999 : 0)) : null;
  const max = rule.count && rule.count > 0 ? rule.count : Infinity;
  let produced = 0;
  const emit = (d: Date) => !(until && d > until) && produced < max;
  const skipped = new Set(rule.exdates ?? []);
  const skip = (d: Date) => skipped.size > 0 && skipped.has(ymd(d));

  if (rule.freq === 'monthly' && rule.setPos && rule.byDay?.length) {
    const weekday = rule.byDay[0];
    const first = new Date(start.getFullYear(), start.getMonth(), 1, start.getHours(), start.getMinutes(), start.getSeconds());
    for (let i = 0; i < HARD_LIMIT; i++) {
      const d = nthWeekday(addMonths(first, i * interval), weekday, rule.setPos);
      if (!d || d < start) continue;
      if (!emit(d)) return;
      produced++;
      if (!skip(d)) yield d;
    }
    return;
  }

  if (rule.freq === 'weekly' && rule.byDay?.length) {
    const days = [...new Set(rule.byDay)].sort((a, b) => a - b);
    let weekStart = addDays(start, -start.getDay());
    for (let guard = 0; guard < HARD_LIMIT; guard++) {
      for (const day of days) {
        const d = addDays(weekStart, day);
        if (d < start) continue;
        if (!emit(d)) return;
        produced++;
        if (!skip(d)) yield d;
      }
      weekStart = addDays(weekStart, 7 * interval);
    }
    return;
  }
  for (let i = 0; i < HARD_LIMIT; i++) {
    const d =
      rule.freq === 'daily' ? addDays(start, i * interval)
      : rule.freq === 'weekly' ? addDays(start, i * 7 * interval)
      : rule.freq === 'monthly' ? addMonths(start, i * interval)
      : addMonths(start, i * 12 * interval);
    if (!emit(d)) return;
    produced++;
    if (!skip(d)) yield d;
  }
}

/** The `pos`-th `weekday` (0 = Sunday) in the month of `month` (time of day kept); -1 = the last; null if the month has no such day. */
export function nthWeekday(month: Date, weekday: number, pos: number): Date | null {
  const y = month.getFullYear();
  const m = month.getMonth();
  const at = (day: number) => new Date(y, m, day, month.getHours(), month.getMinutes(), month.getSeconds());
  const days = new Date(y, m + 1, 0).getDate();
  if (pos < 0) {
    const last = new Date(y, m, days).getDay();
    return at(days - ((last - weekday + 7) % 7));
  }
  const day = 1 + ((weekday - new Date(y, m, 1).getDay() + 7) % 7) + (pos - 1) * 7;
  return day <= days ? at(day) : null;
}

const ORDINAL = ['', 'first', 'second', 'third', 'fourth'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Which "nth weekday" a date is: e.g. 14 Nov 2026 → { weekday: 6, pos: 2, last: true/false }. */
export function weekdayPosition(d: Date): { weekday: number; pos: number; last: boolean } {
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { weekday: d.getDay(), pos: Math.ceil(d.getDate() / 7), last: d.getDate() + 7 > days };
}

export const describePosition = (pos: number, weekday: number) => `the ${pos < 0 ? 'last' : ORDINAL[pos]} ${LONG_DAYS[weekday]}`;

/** Occurrence start times within [from, to], including the first one. */
export function occurrences(start: Date, rule: Recurrence | null | undefined, from: Date, to: Date, limit = 500): Date[] {
  if (!rule) return start >= from && start <= to ? [start] : [];
  const out: Date[] = [];
  for (const d of iterate(start, rule)) {
    if (d > to) break;
    if (d >= from) out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}

/** First occurrence strictly after `after`, or null when the series has ended. */
export function nextOccurrence(start: Date, rule: Recurrence, after: Date): Date | null {
  for (const d of iterate(start, rule)) if (d > after) return d;
  return null;
}

export function describeRecurrence(rule: Recurrence | null | undefined): string {
  if (!rule) return 'Does not repeat';
  const n = Math.max(1, rule.interval ?? 1);
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.freq];
  let text = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
  if (rule.freq === 'weekly' && rule.byDay?.length) text += ` on ${[...rule.byDay].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(', ')}`;
  if (rule.freq === 'monthly' && rule.setPos && rule.byDay?.length) text += ` on ${describePosition(rule.setPos, rule.byDay[0])}`;
  if (rule.count) text += `, ${rule.count} times`;
  if (rule.until) text += `, until ${rule.until.slice(0, 10)}`;
  if (rule.exdates?.length) text += ` (${rule.exdates.length} skipped)`;
  return text;
}

export function toRRule(rule: Recurrence): string {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === 'weekly' && rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.map((d) => DAY_CODES[d]).join(',')}`);
  if (rule.freq === 'monthly' && rule.setPos && rule.byDay?.length) parts.push(`BYDAY=${rule.setPos}${DAY_CODES[rule.byDay[0]]}`);
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  if (rule.until) parts.push(`UNTIL=${rule.until.slice(0, 10).replace(/-/g, '')}T235959Z`);
  return parts.join(';');
}

/** Parse the supported subset of RRULE; returns null for rules this model cannot represent. */
export function fromRRule(text: string): Recurrence | null {
  const map = new Map(text.replace(/^RRULE:/i, '').split(';').map((p) => p.split('=') as [string, string]));
  const freq = map.get('FREQ')?.toLowerCase();
  if (freq !== 'daily' && freq !== 'weekly' && freq !== 'monthly' && freq !== 'yearly') return null;
  const rule: Recurrence = { freq };
  const interval = Number(map.get('INTERVAL'));
  if (interval > 1) rule.interval = interval;
  const byDay = map.get('BYDAY');
  if (byDay && freq === 'weekly') {
    const days = byDay.split(',').map((d) => DAY_CODES.indexOf(d.slice(-2))).filter((d) => d >= 0);
    if (days.length) rule.byDay = days;
  }
  if (byDay && freq === 'monthly') {
    // "2TU", "-1FR", or "TU" with BYSETPOS=2
    const m = /^([+-]?\d)?([A-Z]{2})$/.exec(byDay.split(',')[0]);
    const pos = Number(m?.[1] ?? map.get('BYSETPOS'));
    const day = m ? DAY_CODES.indexOf(m[2]) : -1;
    if (day >= 0 && (pos === -1 || (pos >= 1 && pos <= 4))) {
      rule.byDay = [day];
      rule.setPos = pos;
    } else return null; // other monthly patterns (several days, 5th weekday…) cannot be represented
  }
  const count = Number(map.get('COUNT'));
  if (count > 0) rule.count = count;
  const until = map.get('UNTIL');
  if (until && until.length >= 8) rule.until = `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`;
  return rule;
}

/** Next due date for a recurring task that was just completed (never earlier than tomorrow). */
export function nextDue(due: Date, rule: Recurrence, completedAt: Date = new Date()): Date | null {
  const after = due > completedAt ? due : startOfDay(completedAt);
  return nextOccurrence(due, rule, after);
}
