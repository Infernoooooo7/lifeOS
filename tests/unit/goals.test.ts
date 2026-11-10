import { describe, expect, it } from 'vitest';
import { goalProgress, progressSource } from '@/core/lib/goals';

describe('goal progress', () => {
  const goals = [
    { id: 'o', kind: 'objective' },
    { id: 'kr1', kind: 'keyResult', parentId: 'o', targetValue: 10, currentValue: 5 },
    { id: 'kr2', kind: 'keyResult', parentId: 'o', targetValue: 4, currentValue: 4 },
    { id: 'kr3', kind: 'keyResult', parentId: 'o', status: 'dropped' },
    { id: 'm', progress: 0.9 },
    { id: 't' },
    { id: 'manual', progress: 0.3 },
    { id: 'done', status: 'achieved', progress: 0.1 },
  ];
  it('averages key results for an objective, ignoring dropped ones', () => {
    expect(goalProgress(goals[0], goals)).toBe(0.75);
    expect(progressSource(goals[0], goals)).toBe('2 key results');
  });
  it('prefers milestones, then linked tasks, then the manual slider', () => {
    expect(goalProgress(goals[4], goals, [{ goalId: 'm', done: true }, { goalId: 'm', done: false }])).toBe(0.5);
    expect(goalProgress(goals[5], goals, [], [{ goalId: 't', status: 'done' }, { goalId: 't' }, { goalId: 't' }, { goalId: 't' }])).toBe(0.25);
    expect(goalProgress(goals[6], goals)).toBe(0.3);
    expect(progressSource(goals[6], goals)).toBe('Manual');
  });
  it('treats achieved goals as complete and clamps measured values', () => {
    expect(goalProgress(goals[7], goals)).toBe(1);
    expect(goalProgress({ id: 'x', targetValue: 10, currentValue: 25 }, [])).toBe(1);
  });
});
