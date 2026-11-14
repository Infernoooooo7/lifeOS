import { describe, expect, it } from 'vitest';
import { freeSlots, planCandidates, planDay } from '@/core/lib/planner';

const at = (hm: string, d = '2026-11-16') => new Date(`${d}T${hm}:00`);
const hours = { from: '09:00', to: '13:00' };
const fmt = (d: Date) => d.toTimeString().slice(0, 5);

describe('free time', () => {
  it('finds the gaps between commitments inside working hours', () => {
    const slots = freeSlots(at('00:00'), [{ start: at('10:00'), end: at('11:00') }, { start: at('10:30'), end: at('11:30') }], '09:00', '13:00', 30);
    expect(slots.map((s) => `${fmt(s.start)}-${fmt(s.end)}`)).toEqual(['09:00-10:00', '11:30-13:00']);
  });
});

describe('planning a day', () => {
  const morning = at('07:00');
  it('fits tasks in order into the first slot that holds them, with a buffer after each', () => {
    const plan = planDay(
      [{ id: 'a', title: 'Write report', estimateMin: 50 }, { id: 'b', title: 'Emails' }, { id: 'c', title: 'Review', estimateMin: 60 }],
      [{ start: at('10:00'), end: at('11:00') }], at('00:00'), hours, morning,
    );
    // "Emails" (30 min, no estimate) no longer fits the 5 minutes left before 10:00, so it opens the next slot.
    expect(plan.blocks.map((b) => [b.taskId, fmt(b.start), fmt(b.end)])).toEqual([['a', '09:00', '09:50'], ['b', '11:00', '11:30'], ['c', '11:35', '12:35']]);
    expect(plan.unplaced).toEqual([]);
    expect(plan.freeMinutes).toBe(180);
    expect(plan.plannedMinutes).toBe(140);
  });

  it('splits a long task across slots in worthwhile pieces and reports what did not fit', () => {
    const plan = planDay([{ id: 'big', title: 'Deep work', estimateMin: 200 }], [{ start: at('10:00'), end: at('11:00') }], at('00:00'), hours, morning);
    expect(plan.blocks.map((b) => [fmt(b.start), fmt(b.end), `${b.part}/${b.parts}`])).toEqual([['09:00', '10:00', '1/2'], ['11:00', '13:00', '2/2']]);
    expect(plan.unplaced).toEqual([{ taskId: 'big', title: 'Deep work', minutes: 20 }]);
  });

  it('never plans in the past when planning today', () => {
    const plan = planDay([{ id: 'a', title: 'Now-ish', estimateMin: 30 }], [], at('00:00'), hours, at('10:07'));
    expect(fmt(plan.blocks[0].start)).toBe('10:15');
  });
});

describe('choosing what to plan', () => {
  it('takes overdue, due-that-day and undated high-priority tasks, skipping blocked and waiting ones', () => {
    const now = at('08:00');
    const tasks = [
      { id: 'later', title: 'Later', dueAt: '2026-11-20', priority: 3 },
      { id: 'today', title: 'Today', dueAt: '2026-11-16', priority: 1 },
      { id: 'late', title: 'Late', dueAt: '2026-11-14', priority: 0 },
      { id: 'urgent', title: 'Urgent, no date', priority: 3 },
      { id: 'meh', title: 'No date', priority: 1 },
      { id: 'done', title: 'Done', dueAt: '2026-11-16', status: 'done' },
      { id: 'blocked', title: 'Already blocked', dueAt: '2026-11-16' },
      { id: 'wait', title: 'Waiting', dueAt: '2026-11-16', status: 'waiting' },
      { id: 'sub', title: 'Sub', dueAt: '2026-11-16', parentId: 'today' },
    ];
    // Overdue first, then the usual task order (a date today beats an undated high priority).
    expect(planCandidates(tasks, at('00:00'), now, new Set(['blocked'])).map((t) => t.id)).toEqual(['late', 'today', 'urgent']);
  });
});
