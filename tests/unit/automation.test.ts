import { describe, expect, it } from 'vitest';
import { effects, fill, lastDue, matches, runOnEvent, runOnTick, triggered, type Rule } from '@/core/lib/automation';
import { dueNotifications, inQuietHours } from '@/core/lib/reminders';
import { review, isDue, preview } from '@/core/lib/srs';

const now = new Date(2026, 10, 10, 10, 0);

describe('automation rules', () => {
  it('evaluates conditions', () => {
    const rec = { priority: 3, tags: ['work', 'urgent'], title: 'Pay Rent', note: '' };
    expect(matches([{ field: 'priority', op: 'gt', value: 2 }, { field: 'tags', op: 'contains', value: 'urgent' }], rec)).toBe(true);
    expect(matches([{ field: 'title', op: 'contains', value: 'rent' }, { field: 'note', op: 'empty' }], rec)).toBe(true);
    expect(matches([{ field: 'priority', op: 'eq', value: 1 }], rec)).toBe(false);
    expect(matches(undefined, rec)).toBe(true);
  });

  it('fires triggers for the right change', () => {
    const ev = { kind: 'update' as const, collection: 'tasks', rec: { id: 't', status: 'done' }, prev: { status: 'todo' } };
    expect(triggered({ type: 'status', collection: 'tasks', to: 'done' }, ev)).toBe(true);
    expect(triggered({ type: 'status', collection: 'tasks', to: 'done' }, { ...ev, prev: { status: 'done' } })).toBe(false);
    expect(triggered({ type: 'created', collection: 'tasks' }, ev)).toBe(false);
    expect(triggered({ type: 'updated', collection: 'tasks', field: 'title' }, ev)).toBe(false);
    expect(triggered({ type: 'created', collection: 'notes' }, { kind: 'create', collection: 'tasks', rec: { id: 'x' } })).toBe(false);
  });

  it('fills placeholders and produces effects', () => {
    expect(fill('Follow up: {{title}} by {{today+2}}', { title: 'Call' }, now)).toBe('Follow up: Call by 2026-11-12');
    const rule: Rule = { id: 'r', trigger: { type: 'status', collection: 'tasks', to: 'done' }, actions: [
      { type: 'create', collection: 'tasks', data: { title: 'Review {{title}}', dueAt: '{{today+1}}' } },
      { type: 'addTag', tag: 'shipped' },
      { type: 'notify', title: 'Done: {{title}}' },
      { type: 'webhook', url: 'https://example.com/hook' },
    ] };
    const fx = effects(rule, { id: 't', title: 'Spec', tags: ['a'] }, now, 'tasks');
    expect(fx).toEqual([
      { type: 'create', collection: 'tasks', data: { title: 'Review Spec', dueAt: '2026-11-11' } },
      { type: 'update', id: 't', patch: { tags: ['a', 'shipped'] } },
      { type: 'notify', title: 'Done: Spec', body: '', source: 'tasks', sourceId: 't' },
    ]); // the webhook is not authorised, so it does not run
  });

  it('skips disabled rules and rules whose conditions fail', () => {
    const base: Rule = { id: 'r', trigger: { type: 'created', collection: 'tasks' }, actions: [{ type: 'notify', title: 'x' }] };
    const ev = { kind: 'create' as const, collection: 'tasks', rec: { id: 't', priority: 1 } };
    expect(runOnEvent([base], ev, now)).toHaveLength(1);
    expect(runOnEvent([{ ...base, enabled: false }], ev, now)).toHaveLength(0);
    expect(runOnEvent([{ ...base, conditions: [{ field: 'priority', op: 'gt', value: 2 }] }], ev, now)).toHaveLength(0);
  });

  it('runs schedules once per slot and date rules once per record', () => {
    expect(lastDue({ type: 'schedule', every: 'day', at: '09:00' }, now).getHours()).toBe(9);
    expect(lastDue({ type: 'schedule', every: 'day', at: '18:00' }, now).getDate()).toBe(9);
    expect(lastDue({ type: 'schedule', every: 'week', weekday: 1, at: '09:00' }, now).getDate()).toBe(9);
    const daily: Rule = { id: 'd', trigger: { type: 'schedule', every: 'day', at: '09:00' }, actions: [{ type: 'notify', title: 'Plan your day' }] };
    expect(runOnTick([daily], now, () => [], new Set())).toHaveLength(1);
    expect(runOnTick([{ ...daily, lastRunAt: new Date(2026, 10, 10, 9, 1).toISOString() }], now, () => [], new Set())).toHaveLength(0);
    expect(runOnTick([{ ...daily, lastRunAt: new Date(2026, 10, 8, 9, 1).toISOString() }], now, () => [], new Set())).toHaveLength(1);

    const dated: Rule = { id: 'w', trigger: { type: 'dateField', collection: 'inventory', field: 'warrantyUntil', offsetDays: 7 }, actions: [{ type: 'notify', title: 'Warranty ends soon: {{name}}' }] };
    const items = [{ id: 'i1', name: 'Laptop', warrantyUntil: '2026-11-17' }, { id: 'i2', name: 'Phone', warrantyUntil: '2027-01-01' }];
    const fired = new Set<string>();
    const first = runOnTick([dated], now, () => items, fired);
    expect(first).toHaveLength(1);
    expect(first[0].effects[0]).toMatchObject({ title: 'Warranty ends soon: Laptop' });
    fired.add(first[0].key!);
    expect(runOnTick([dated], now, () => items, fired)).toHaveLength(0);
  });
});

describe('reminders', () => {
  it('creates deterministic notifications for due items only', () => {
    const list = dueNotifications({
      tasks: [{ id: 't1', title: 'Overdue', dueAt: '2026-11-08' }, { id: 't2', title: 'Today', dueAt: '2026-11-10' }, { id: 't3', title: 'Done', dueAt: '2026-11-08', status: 'done' }, { id: 't4', title: 'Later', dueAt: '2026-11-20' }],
      events: [{ id: 'e1', title: 'Call', startAt: new Date(2026, 10, 10, 10, 10).toISOString() }, { id: 'e2', title: 'Far', startAt: new Date(2026, 10, 10, 15, 0).toISOString() }],
      habits: [{ id: 'h1', name: 'Meditate', reminderAt: '07:00' }, { id: 'h2', name: 'Read', reminderAt: '21:00' }, { id: 'h3', name: 'Run', reminderAt: '06:00' }],
      habitLogs: [{ id: 'l', habitId: 'h3', date: '2026-11-10', value: 1 }],
      subscriptions: [{ id: 's1', name: 'Music', nextBillingDate: '2026-11-12' }, { id: 's2', name: 'Cancelled', nextBillingDate: '2026-11-12', status: 'cancelled' }],
      dates: [{ id: 'd1', name: 'Asha', kind: 'birthday', date: '1990-11-11' }],
    }, now);
    expect(list.map((n) => n.id).sort()).toEqual([
      'nt:dates:d1:2026-11-11', `nt:event:e1:${new Date(2026, 10, 10, 10, 10).getTime()}:15`, 'nt:habit:h1:2026-11-10',
      'nt:subscriptions:s1:2026-11-12', 'nt:task:t1:overdue:2026-11-08', 'nt:task:t2:due:2026-11-10',
    ]);
    expect(list.find((n) => n.source === 'dates')!.title).toBe('Birthday tomorrow');
    // same input, same ids → no duplicates across runs or devices
    expect(dueNotifications({ tasks: [{ id: 't1', dueAt: '2026-11-08' }] }, now)[0].id).toBe('nt:task:t1:overdue:2026-11-08');
  });

  it('respects quiet hours, including windows that span midnight', () => {
    const q = { enabled: true, from: '22:00', to: '07:00' };
    expect(inQuietHours(new Date(2026, 0, 1, 23, 0), q)).toBe(true);
    expect(inQuietHours(new Date(2026, 0, 1, 6, 59), q)).toBe(true);
    expect(inQuietHours(new Date(2026, 0, 1, 12, 0), q)).toBe(false);
    expect(inQuietHours(new Date(2026, 0, 1, 23, 0), { ...q, enabled: false })).toBe(false);
  });
});

describe('spaced repetition (FSRS)', () => {
  it('schedules new cards and grows intervals with successful reviews', () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    expect(isDue(null, t0)).toBe(true);
    const p = preview(null, t0);
    expect(p.easy.getTime()).toBeGreaterThan(p.good.getTime());
    expect(p.good.getTime()).toBeGreaterThanOrEqual(p.again.getTime());
    let s = review(null, 'easy', t0);
    const first = new Date(s.due).getTime() - t0.getTime();
    expect(isDue(s, t0)).toBe(false);
    const t1 = new Date(s.due);
    s = review(s, 'good', t1);
    expect(new Date(s.due).getTime() - t1.getTime()).toBeGreaterThan(first);
    expect(s.reps).toBe(2);
    const lapsed = review(s, 'again', new Date(s.due));
    expect(lapsed.lapses).toBe(1);
  });
});
