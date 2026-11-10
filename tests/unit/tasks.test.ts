import { describe, expect, it } from 'vitest';
import { blockers, compareTasks, groupTasks, isOverdue, nextRecurringInstance, smartGroup, subtaskProgress, wouldCycle } from '@/core/lib/tasks';

const now = new Date(2026, 10, 10, 12, 0);

describe('task logic', () => {
  it('places tasks in smart groups', () => {
    expect(smartGroup({ id: '1', dueAt: '2026-11-09' }, now)).toBe('overdue');
    expect(smartGroup({ id: '1', dueAt: '2026-11-10' }, now)).toBe('today');
    expect(smartGroup({ id: '1', dueAt: '2026-11-11' }, now)).toBe('tomorrow');
    expect(smartGroup({ id: '1', dueAt: '2026-11-15' }, now)).toBe('week');
    expect(smartGroup({ id: '1', dueAt: '2026-12-25' }, now)).toBe('later');
    expect(smartGroup({ id: '1' }, now)).toBe('someday');
    expect(smartGroup({ id: '1', dueAt: '2026-11-01', status: 'done' }, now)).toBe('done');
  });

  it('treats timed tasks as overdue after their time, date-only tasks after their day', () => {
    expect(isOverdue({ id: '1', dueAt: new Date(2026, 10, 10, 9).toISOString() }, now)).toBe(true);
    expect(isOverdue({ id: '1', dueAt: '2026-11-10' }, now)).toBe(false);
    expect(isOverdue({ id: '1', dueAt: '2026-11-01', status: 'done' }, now)).toBe(false);
  });

  it('sorts open before done, then by due date and priority', () => {
    const list = [
      { id: 'done', status: 'done', dueAt: '2026-11-01' },
      { id: 'low', dueAt: '2026-11-12', priority: 1 },
      { id: 'high', dueAt: '2026-11-12', priority: 3 },
      { id: 'soon', dueAt: '2026-11-11' },
      { id: 'none', priority: 3 },
    ].sort(compareTasks);
    expect(list.map((t) => t.id)).toEqual(['soon', 'high', 'low', 'none', 'done']);
  });

  it('groups by status, priority and tag', () => {
    const tasks = [{ id: 'a', status: 'doing', tags: ['x', 'y'], priority: 3 }, { id: 'b', status: 'todo', priority: 0 }];
    expect(groupTasks(tasks, 'status').map((g) => g.key)).toEqual(['todo', 'doing']);
    expect(groupTasks(tasks, 'priority').map((g) => g.key)).toEqual(['3', '0']);
    expect(groupTasks(tasks, 'tag').map((g) => [g.key, g.items.length])).toEqual([['x', 1], ['y', 1], ['', 1]]);
  });

  it('detects blocked tasks and refuses dependency cycles', () => {
    const map = new Map([
      ['a', { id: 'a', dependsOn: ['b'] }],
      ['b', { id: 'b', dependsOn: ['c'] }],
      ['c', { id: 'c', status: 'done' }],
    ]);
    expect(blockers(map.get('a')!, map).map((t) => t.id)).toEqual(['b']);
    expect(blockers(map.get('b')!, map)).toEqual([]);
    expect(wouldCycle('c', 'a', map)).toBe(true);
    expect(wouldCycle('a', 'c', map)).toBe(false);
  });

  it('reports subtask progress', () => {
    const all = [{ id: 'p' }, { id: 's1', parentId: 'p', status: 'done' }, { id: 's2', parentId: 'p' }];
    expect(subtaskProgress('p', all)).toEqual({ done: 1, total: 2 });
    expect(subtaskProgress('s1', all)).toBeNull();
  });

  it('creates the next instance of a recurring task and stops when the series ends', () => {
    const next = nextRecurringInstance({ id: 't', title: 'Water plants', dueAt: '2026-11-08', recurrence: { freq: 'weekly' }, tags: ['home'], priority: 2 }, now);
    expect(next).toMatchObject({ title: 'Water plants', dueAt: '2026-11-15', status: 'todo', tags: ['home'], priority: 2 });
    expect(nextRecurringInstance({ id: 't', dueAt: '2026-11-08', recurrence: { freq: 'daily', count: 1 } }, now)).toBeNull();
    expect(nextRecurringInstance({ id: 't', dueAt: '2026-11-08' }, now)).toBeNull();
  });
});
