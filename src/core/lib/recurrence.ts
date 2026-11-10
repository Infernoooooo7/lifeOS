import { addDays, addMonths, startOfDay } from './dates';

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

  if (rule.freq === 'weekly' && rule.byDay?.length) {
    const days = [...new Set(rule.byDay)].sort((a, b) => a - b);
    let weekStart = addDays(start, -start.getDay());
    for (let guard = 0; guard < HARD_LIMIT; guard++) {
      for (const day of days) {
        const d = addDays(weekStart, day);
        if (d < start) continue;
        if (!emit(d)) return;
        produced++;
        yield d;
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
    yield d;
  }
}

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
  if (rule.count) text += `, ${rule.count} times`;
  if (rule.until) text += `, until ${rule.until.slice(0, 10)}`;
  return text;
}

export function toRRule(rule: Recurrence): string {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === 'weekly' && rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.map((d) => DAY_CODES[d]).join(',')}`);
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
