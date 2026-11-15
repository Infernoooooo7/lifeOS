import { describe, expect, it } from 'vitest';
import { memoryAnchors, onThisDay, type MemoryRecord } from '@/core/lib/memories';

const now = new Date('2026-11-15T10:00:00');
const rec = (c: string, id: string, fields: Record<string, unknown>): MemoryRecord => ({ id, _c: c, ...fields });

describe('on this day', () => {
  it('looks back a week, one, three and six months, and every earlier year', () => {
    const anchors = memoryAnchors(now, 2);
    expect(anchors).toEqual([
      { date: '2024-11-15', ago: '2 years ago' }, { date: '2025-11-15', ago: '1 year ago' },
      { date: '2026-05-15', ago: '6 months ago' }, { date: '2026-08-15', ago: '3 months ago' }, { date: '2026-10-15', ago: '1 month ago' }, { date: '2026-11-08', ago: '1 week ago' },
    ]);
    // month ends and leap days stay on real dates
    expect(memoryAnchors(new Date('2026-03-31T09:00:00'), 1).map((a) => a.date)).toEqual(['2025-03-31', '2025-09-30', '2025-12-31', '2026-02-28', '2026-03-24']);
    expect(memoryAnchors(new Date('2024-02-29T09:00:00'), 1)[0].date).toBe('2023-02-28');
  });

  it('brings back journal entries, achievements, events and notes from those days, oldest first', () => {
    const out = onThisDay([
      rec('journal', 'j1', { date: '2025-11-15', kind: 'daily', content: '**First day** at the new job. Nervous and happy.' }),
      rec('journal', 'j2', { date: '2026-11-08', title: 'Rainy Sunday', content: 'Stayed in and read.' }),
      rec('achievements', 'a1', { date: '2024-11-15', title: 'Ran my first 10k', description: '58 minutes' }),
      rec('events', 'e1', { startAt: '2026-10-15T19:30:00', title: 'Dinner with Asha', location: 'Toit' }),
      rec('notes', 'n1', { _ca: new Date('2026-08-15T08:00:00').getTime(), title: 'Trip ideas', content: '# Coorg\n- coffee estates' }),
      rec('journal', 'other', { date: '2026-11-14', content: 'Yesterday is not a memory yet.' }),
    ], now);
    expect(out.map((m) => [m.id, m.ago])).toEqual([['a1', '2 years ago'], ['j1', '1 year ago'], ['n1', '3 months ago'], ['e1', '1 month ago'], ['j2', '1 week ago']]);
    expect(out[1]).toMatchObject({ title: 'First day at the new job. Nervous and happy.', snippet: '' });
    expect(out[4]).toMatchObject({ title: 'Rainy Sunday', snippet: 'Stayed in and read.' });
    expect(out[2].snippet).toBe('Coorg - coffee estates');
  });

  it('never surfaces private, encrypted, deleted, archived or repeating records, and respects the limit', () => {
    const hidden = [
      rec('journal', 'p', { date: '2025-11-15', private: true, content: 'secret' }),
      rec('journal', 's', { date: '2025-11-15', content: '', sealed: { v: 1, iv: 'a', ct: 'b' } }),
      rec('journal', 'd', { date: '2025-11-15', content: 'gone', deletedAt: '2026-01-01T00:00:00Z' }),
      rec('journal', 'empty', { date: '2025-11-15', content: '   ' }),
      rec('notes', 'arch', { _ca: new Date('2025-11-15T08:00:00').getTime(), title: 'Old', archived: true }),
      rec('events', 'rep', { startAt: '2025-11-15T09:30:00', title: 'Standup', recurrence: { freq: 'daily' } }),
      rec('tasks', 't', { dueAt: '2025-11-15', title: 'Not a memory source' }),
    ];
    expect(onThisDay(hidden, now)).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => rec('journal', `m${i}`, { date: '2025-11-15', content: `Entry ${i}` }));
    expect(onThisDay(many, now, 4)).toHaveLength(4);
  });
});
