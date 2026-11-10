import { describe, expect, it } from 'vitest';
import { byDate, consistency, periodProgress, streaks } from '@/core/lib/habits';

const today = new Date(2026, 10, 10); // Tue 10 Nov 2026
const logs = (dates: string[], value = 1) => new Map(dates.map((d) => [d, value]));

describe('habit tracking', () => {
  it('counts the current streak, not broken by an unfinished today', () => {
    const h = { id: 'h', cadence: 'daily' };
    expect(streaks(h, logs(['2026-11-07', '2026-11-08', '2026-11-09']), today)).toEqual({ current: 3, longest: 3 });
    expect(streaks(h, logs(['2026-11-08', '2026-11-09', '2026-11-10']), today).current).toBe(3);
    expect(streaks(h, logs(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-09']), today)).toEqual({ current: 1, longest: 4 });
    expect(streaks(h, logs(['2026-11-01']), today)).toEqual({ current: 0, longest: 1 });
    expect(streaks(h, new Map(), today)).toEqual({ current: 0, longest: 0 });
  });

  it('requires the daily target to be reached', () => {
    const h = { id: 'h', cadence: 'daily', target: 8 };
    const l = new Map([['2026-11-09', 8], ['2026-11-08', 5], ['2026-11-07', 9]]);
    expect(streaks(h, l, today)).toEqual({ current: 1, longest: 1 });
    expect(periodProgress(h, l, new Date(2026, 10, 8))).toEqual({ done: 5, target: 8, met: false });
  });

  it('skips unscheduled weekdays', () => {
    const h = { id: 'h', cadence: 'daily', days: [1, 3, 5] }; // Mon Wed Fri
    expect(streaks(h, logs(['2026-11-04', '2026-11-06', '2026-11-09']), today).current).toBe(3);
  });

  it('handles weekly targets', () => {
    const h = { id: 'h', cadence: 'weekly', target: 2 };
    const l = logs(['2026-10-27', '2026-10-29', '2026-11-03', '2026-11-05', '2026-11-09']);
    expect(periodProgress(h, l, today)).toEqual({ done: 1, target: 2, met: false });
    expect(streaks(h, l, today)).toEqual({ current: 2, longest: 2 });
  });

  it('computes consistency over a window and aggregates logs by date', () => {
    const h = { id: 'h', cadence: 'daily' };
    expect(consistency(h, logs(['2026-11-10', '2026-11-09', '2026-11-08', '2026-11-07', '2026-11-06']), 10, today)).toBe(0.5);
    const map = byDate([{ habitId: 'h', date: '2026-11-10', value: 2 }, { habitId: 'h', date: '2026-11-10', value: 3 }, { habitId: 'x', date: '2026-11-10' }], 'h');
    expect(map.get('2026-11-10')).toBe(5);
  });
});
