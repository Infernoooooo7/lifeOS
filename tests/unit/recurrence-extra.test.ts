import { describe, expect, it } from 'vitest';
import { inYear, ymd } from '@/core/lib/dates';
import { parseIcs, toIcs } from '@/core/lib/ics';
import { describeRecurrence, fromRRule, nthWeekday, occurrences, toRRule, weekdayPosition } from '@/core/lib/recurrence';

const at = (s: string) => new Date(`${s}T09:30:00`);
const days = (list: Date[]) => list.map(ymd);

describe('nth weekday of the month', () => {
  it('finds the 2nd Tuesday and the last Friday, and knows when a 4th/5th does not exist', () => {
    expect(ymd(nthWeekday(at('2026-11-01'), 2, 2)!)).toBe('2026-11-10');
    expect(ymd(nthWeekday(at('2026-11-01'), 5, -1)!)).toBe('2026-11-27');
    expect(ymd(nthWeekday(at('2026-02-01'), 0, 4)!)).toBe('2026-02-22');
    expect(nthWeekday(at('2026-02-01'), 0, 5)).toBeNull();
  });

  it('describes where a date falls', () => {
    expect(weekdayPosition(at('2026-11-14'))).toEqual({ weekday: 6, pos: 2, last: false });
    expect(weekdayPosition(at('2026-11-28'))).toEqual({ weekday: 6, pos: 4, last: true });
  });

  it('repeats monthly on the 2nd Tuesday and on the last Friday, keeping the time of day', () => {
    const second = occurrences(at('2026-11-10'), { freq: 'monthly', byDay: [2], setPos: 2 }, at('2026-11-01'), at('2027-02-28'));
    expect(days(second)).toEqual(['2026-11-10', '2026-12-08', '2027-01-12', '2027-02-09']);
    expect(second[1].getHours()).toBe(9);
    const last = occurrences(at('2026-11-27'), { freq: 'monthly', byDay: [5], setPos: -1, interval: 2 }, at('2026-11-01'), at('2027-04-30'));
    expect(days(last)).toEqual(['2026-11-27', '2027-01-29', '2027-03-26']);
    expect(describeRecurrence({ freq: 'monthly', byDay: [5], setPos: -1 })).toBe('Every month on the last Friday');
  });

  it('round-trips through RRULE, including BYSETPOS input, and refuses patterns it cannot hold', () => {
    expect(toRRule({ freq: 'monthly', byDay: [2], setPos: 2 })).toBe('FREQ=MONTHLY;BYDAY=2TU');
    expect(fromRRule('FREQ=MONTHLY;BYDAY=-1FR')).toEqual({ freq: 'monthly', byDay: [5], setPos: -1 });
    expect(fromRRule('FREQ=MONTHLY;BYDAY=TU;BYSETPOS=3')).toEqual({ freq: 'monthly', byDay: [2], setPos: 3 });
    expect(fromRRule('FREQ=MONTHLY;BYDAY=MO,WE')).toBeNull();
  });
});

describe('skipped occurrences', () => {
  it('leaves skipped dates out but still counts them towards a fixed number of times', () => {
    const rule = { freq: 'weekly' as const, count: 4, exdates: ['2026-11-17'] };
    expect(days(occurrences(at('2026-11-10'), rule, at('2026-11-01'), at('2027-01-01')))).toEqual(['2026-11-10', '2026-11-24', '2026-12-01']);
    expect(describeRecurrence(rule)).toBe('Every week, 4 times (1 skipped)');
    expect(days(occurrences(at('2026-11-10'), { freq: 'monthly', byDay: [2], setPos: 2, exdates: ['2026-12-08'] }, at('2026-11-01'), at('2027-01-31')))).toEqual(['2026-11-10', '2027-01-12']);
  });

  it('travels through .ics as EXDATE for timed and all-day events', () => {
    const ics = toIcs([
      { title: 'Standup', startAt: at('2026-11-10').toISOString(), endAt: null, allDay: false, recurrence: { freq: 'daily', exdates: ['2026-11-12', '2026-11-13'] } },
      { title: 'Bins', startAt: new Date(2026, 10, 10).toISOString(), endAt: null, allDay: true, recurrence: { freq: 'weekly', exdates: ['2026-11-17'] } },
    ]);
    expect(ics).toMatch(/EXDATE:\d{8}T\d{6}Z,\d{8}T\d{6}Z/);
    expect(ics).toContain('EXDATE;VALUE=DATE:20261117');
    const back = parseIcs(ics);
    expect(back[0].recurrence?.exdates).toEqual(['2026-11-12', '2026-11-13']);
    expect(back[1].recurrence?.exdates).toEqual(['2026-11-17']);
  });
});

describe('yearly dates on 29 February', () => {
  it('fall on 28 February in common years', () => {
    expect(ymd(inYear(new Date(2000, 1, 29), 2027))).toBe('2027-02-28');
    expect(ymd(inYear(new Date(2000, 1, 29), 2028))).toBe('2028-02-29');
  });
});
