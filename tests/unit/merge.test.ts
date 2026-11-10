import { describe, expect, it } from 'vitest';
import { applyPatch, diff, same } from '@/core/sync/merge';

describe('merge', () => {
  it('treats null, undefined and empty string as the same unset value', () => {
    expect(same(null, undefined)).toBe(true);
    expect(same('', null)).toBe(true);
    expect(same(0, null)).toBe(false);
    expect(same(false, null)).toBe(false);
    expect(same({ a: [1, { b: null }] }, { a: [1, {}] })).toBe(true);
    expect(same([1, 2], [2, 1])).toBe(false);
  });

  it('diffs only the fields that changed and keeps their base values', () => {
    const d = diff({ title: 'a', tags: ['x'], done: false }, { title: 'b', tags: ['x'], done: false, note: 'n' });
    expect(d.patch).toEqual({ title: 'b', note: 'n' });
    expect(d.base).toEqual({ title: 'a', note: null });
    expect(diff(null, { title: 'a' })).toEqual({ patch: { title: 'a' }, base: null });
  });

  it('applies non-overlapping changes without conflict', () => {
    const r = applyPatch({ title: 'server', status: 'todo' }, { status: 'todo' }, { status: 'done' }, 1, 2);
    expect(r.next).toEqual({ title: 'server', status: 'done' });
    expect(r.conflicts).toEqual([]);
    expect(r.changed).toBe(true);
  });

  it('is a no-op when both sides made the same change', () => {
    const r = applyPatch({ status: 'done' }, { status: 'todo' }, { status: 'done' }, 1, 2);
    expect(r.changed).toBe(false);
    expect(r.conflicts).toEqual([]);
  });

  it('resolves a true conflict by time and always reports the discarded value', () => {
    const newer = applyPatch({ t: 'theirs' }, { t: 'base' }, { t: 'mine' }, 10, 5);
    expect(newer.next.t).toBe('mine');
    expect(newer.conflicts).toEqual([{ field: 't', kept: 'mine', discarded: 'theirs', loser: 'current' }]);
    const older = applyPatch({ t: 'theirs' }, { t: 'base' }, { t: 'mine' }, 5, 10);
    expect(older.next.t).toBe('theirs');
    expect(older.conflicts).toEqual([{ field: 't', kept: 'theirs', discarded: 'mine', loser: 'patch' }]);
  });

  it('merges two independently created copies of the same id', () => {
    const r = applyPatch({ habitId: 'h', date: '2026-01-01', value: 1 }, null, { habitId: 'h', date: '2026-01-01', value: 3, note: 'x' }, 10, 5);
    expect(r.next).toEqual({ habitId: 'h', date: '2026-01-01', value: 3, note: 'x' });
    expect(r.conflicts.map((c) => c.field)).toEqual(['value']);
  });
});
