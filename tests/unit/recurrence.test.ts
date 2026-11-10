import { describe, expect, it } from 'vitest';
import { ymd } from '@/core/lib/dates';
import { describeRecurrence, fromRRule, nextDue, nextOccurrence, occurrences, toRRule } from '@/core/lib/recurrence';

const d = (s: string) => new Date(`${s}T09:00:00`);
const days = (list: Date[]) => list.map((x) => ymd(x));

describe('recurrence', () => {
  it('expands daily, weekly, monthly and yearly rules inside a range', () => {
    expect(days(occurrences(d('2026-01-01'), { freq: 'daily', interval: 2 }, d('2026-01-01'), d('2026-01-07')))).toEqual(['2026-01-01', '2026-01-03', '2026-01-05', '2026-01-07']);
    expect(days(occurrences(d('2026-01-05'), { freq: 'weekly' }, d('2026-01-10'), d('2026-01-31')))).toEqual(['2026-01-12', '2026-01-19', '2026-01-26']);
    expect(days(occurrences(d('2026-01-31'), { freq: 'monthly' }, d('2026-01-01'), d('2026-04-30')))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(days(occurrences(d('2024-02-29'), { freq: 'yearly' }, d('2024-01-01'), d('2026-12-31')))).toEqual(['2024-02-29', '2025-02-28', '2026-02-28']);
  });

  it('supports weekly rules on several weekdays', () => {
    // Monday 2026-01-05; Mon/Wed/Fri
    const list = occurrences(d('2026-01-05'), { freq: 'weekly', byDay: [1, 3, 5] }, d('2026-01-05'), d('2026-01-16'));
    expect(days(list)).toEqual(['2026-01-05', '2026-01-07', '2026-01-09', '2026-01-12', '2026-01-14', '2026-01-16']);
  });

  it('honours count and until', () => {
    expect(occurrences(d('2026-01-01'), { freq: 'daily', count: 3 }, d('2026-01-01'), d('2026-12-31'))).toHaveLength(3);
    expect(days(occurrences(d('2026-01-01'), { freq: 'daily', until: '2026-01-03' }, d('2026-01-01'), d('2026-12-31')))).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(nextOccurrence(d('2026-01-01'), { freq: 'daily', count: 2 }, d('2026-01-02'))).toBeNull();
  });

  it('returns a single occurrence for non-repeating items', () => {
    expect(occurrences(d('2026-03-03'), null, d('2026-03-01'), d('2026-03-31'))).toHaveLength(1);
    expect(occurrences(d('2026-03-03'), null, d('2026-04-01'), d('2026-04-30'))).toHaveLength(0);
  });

  it('schedules the next due date of a completed recurring task in the future', () => {
    const next = nextDue(d('2026-01-01'), { freq: 'weekly' }, d('2026-01-20'));
    expect(ymd(next!)).toBe('2026-01-22');
    expect(ymd(nextDue(d('2026-02-01'), { freq: 'daily' }, d('2026-01-20'))!)).toBe('2026-02-02');
  });

  it('round-trips RRULE strings and describes rules', () => {
    const rule = { freq: 'weekly' as const, interval: 2, byDay: [1, 4], count: 10 };
    expect(toRRule(rule)).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=10');
    expect(fromRRule(toRRule(rule))).toEqual(rule);
    expect(fromRRule('RRULE:FREQ=DAILY;UNTIL=20260131T000000Z')).toEqual({ freq: 'daily', until: '2026-01-31' });
    expect(fromRRule('FREQ=SECONDLY')).toBeNull();
    expect(describeRecurrence(rule)).toBe('Every 2 weeks on Mon, Thu, 10 times');
    expect(describeRecurrence(null)).toBe('Does not repeat');
  });
});
