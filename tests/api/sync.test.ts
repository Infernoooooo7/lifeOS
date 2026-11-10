import { beforeAll, describe, expect, it } from 'vitest';
import type { Change, SyncResponse } from '@/core/sync/protocol';
import { Client, prepareDatabase, signUp } from './setup';

beforeAll(() => prepareDatabase());

const sync = async (client: Client, cursor: number, changes: Change[] = []) => {
  const res = await client.post('sync', { cursor, changes });
  if (res.status !== 200) throw new Error(JSON.stringify(res.data));
  return res.data as SyncResponse;
};
const create = (c: string, id: string, patch: Record<string, unknown>, ua = Date.now() - 1000): Change => ({ id, c, base: null, patch, ca: ua, ua });

describe('sync', () => {
  it('stores a record and returns it to another device of the same account', async () => {
    const { client, email, password } = await signUp();
    const pushed = await sync(client, 0, [create('tasks', 'task-1', { title: 'Buy milk', status: 'todo', priority: 2, tags: ['home'], dueAt: '2026-11-12', ws: 'w1' })]);
    expect(pushed.applied).toHaveLength(1);
    expect(pushed.applied[0].seq).toBe(1);
    expect(pushed.records).toHaveLength(0); // own change is not echoed back

    const phone = new Client();
    await phone.post('auth/login', { email, password });
    const pulled = await sync(phone, 0);
    expect(pulled.records).toHaveLength(1);
    // date-only strings and unknown fields round-trip exactly
    expect(pulled.records[0].data).toMatchObject({ title: 'Buy milk', status: 'todo', priority: 2, tags: ['home'], dueAt: '2026-11-12', ws: 'w1' });
    expect(pulled.cursor).toBe(1);
    expect((await sync(phone, pulled.cursor)).records).toHaveLength(0);
  });

  it('round-trips every kind of collection without losing fields', async () => {
    const { client } = await signUp();
    const samples: Change[] = [
      create('workspaces', 'w1', { name: 'Personal', color: '#22d3ee', position: 1 }),
      create('settings', 'prefs', { value: { theme: 'dark', accent: 190 } }),
      create('modulePrefs', 'mp-tasks', { moduleId: 'tasks', enabled: true, favorite: true }),
      create('projects', 'p1', { name: 'Home reno', status: 'active', customField: { nested: [1, 2] } }),
      create('goals', 'g1', { title: 'Run 10k', kind: 'short', progress: 0.25, targetDate: '2027-01-01T00:00:00.000Z' }),
      create('events', 'e1', { title: 'Dentist', startAt: '2026-11-12T09:00:00.000Z', endAt: '2026-11-12T10:00:00.000Z', allDay: false, recurrence: { freq: 'weekly', interval: 2 } }),
      create('habits', 'h1', { name: 'Read', cadence: 'daily', target: 20, unit: 'pages' }),
      create('habitLogs', 'h1:2026-11-10', { habitId: 'h1', date: '2026-11-10', value: 25 }),
      create('notes', 'n1', { title: 'Idea', content: '# Hello\n[[Other]]', tags: ['x'], pinned: true }),
      create('transactions', 'tx1', { type: 'expense', amount: 1499.5, currency: 'INR', category: 'Groceries', date: '2026-11-09' }),
      create('budgets', 'b1', { category: 'Groceries', period: 'monthly', amount: 12000 }),
      create('flashcards', 'f1', { title: 'Capital of France?', back: 'Paris', fsrs: { due: '2026-11-11', stability: 2.1 } }),
      create('workouts', 'wo1', { title: 'Leg day', date: '2026-11-10', sets: [{ exercise: 'Squat', reps: 5, weight: 80 }] }),
      create('files', 'file1', { name: 'passport.pdf', size: 12345, expiresAt: '2030-01-01' }),
      create('automations', 'a1', { name: 'Rule', enabled: true, trigger: { type: 'created', collection: 'tasks' }, conditions: [], actions: [{ type: 'notify' }] }),
      create('templates', 'tpl1', { kind: 'task', name: 'Weekly review', payload: { title: 'Review' } }),
      create('activity', 'act1', { action: 'create', collection: 'tasks', recordId: 'task-1', summary: 'Created', at: '2026-11-10T08:00:00.000Z' }),
      create('notifications', 'nt1', { title: 'Due soon', kind: 'task', dueAt: '2026-11-10T08:00:00.000Z' }),
      create('trips', 'trip1', { name: 'Goa', startDate: '2026-12-20', budget: 40000, checklist: [{ text: 'Passport', done: false }] }),
      create('myCustomCollection', 'c1', { anything: true }),
    ];
    const res = await sync(client, 0, samples);
    expect(res.rejected).toEqual([]);
    expect(res.applied).toHaveLength(samples.length);
    const fresh = await sync(client, 0);
    const byId = new Map(fresh.records.map((r) => [r.id, r]));
    for (const sample of samples) {
      const got = byId.get(sample.id);
      expect(got, sample.c).toBeDefined();
      expect(got!.c).toBe(sample.c);
      expect(got!.data, sample.c).toEqual(sample.patch);
    }
  });

  it('merges edits to different fields made on two devices', async () => {
    const { client } = await signUp();
    const t0 = Date.now() - 10_000;
    await sync(client, 0, [create('tasks', 't', { title: 'Draft', status: 'todo', priority: 1 }, t0)]);
    // device A changes the title, device B (still on the original version) changes the status
    await sync(client, 1, [{ id: 't', c: 'tasks', base: { title: 'Draft' }, patch: { title: 'Final' }, ca: t0, ua: t0 + 1000 }]);
    const b = await sync(client, 1, [{ id: 't', c: 'tasks', base: { status: 'todo' }, patch: { status: 'done' }, ca: t0, ua: t0 + 2000 }]);
    expect(b.conflicts).toEqual([]);
    expect(b.applied[0].data).toMatchObject({ title: 'Final', status: 'done', priority: 1 });
  });

  it('reports a conflict instead of silently overwriting when both devices change the same field', async () => {
    const { client } = await signUp();
    const t0 = Date.now() - 10_000;
    await sync(client, 0, [create('notes', 'n', { title: 'Note', content: 'original' }, t0)]);
    await sync(client, 1, [{ id: 'n', c: 'notes', base: { content: 'original' }, patch: { content: 'edited on laptop' }, ca: t0, ua: t0 + 5000 }]);
    // the phone edited earlier, offline, and syncs later
    const phone = await sync(client, 1, [{ id: 'n', c: 'notes', base: { content: 'original' }, patch: { content: 'edited on phone' }, ca: t0, ua: t0 + 2000 }]);
    expect(phone.conflicts).toEqual([{ id: 'n', c: 'notes', field: 'content', kept: 'edited on laptop', discarded: 'edited on phone', loser: 'patch' }]);
    expect(phone.applied[0].data.content).toBe('edited on laptop');
    // a later edit wins, and the overwritten value is reported too
    const later = await sync(client, 2, [{ id: 'n', c: 'notes', base: { content: 'original' }, patch: { content: 'newest' }, ca: t0, ua: t0 + 9000 }]);
    expect(later.conflicts[0]).toMatchObject({ kept: 'newest', discarded: 'edited on laptop', loser: 'current' });
  });

  it('replicates deletions as tombstones and flags edits to deleted records', async () => {
    const { client } = await signUp();
    const t0 = Date.now() - 10_000;
    await sync(client, 0, [create('tasks', 'd', { title: 'Temp' }, t0)]);
    const del = await sync(client, 1, [{ id: 'd', c: 'tasks', base: { deletedAt: null }, patch: { deletedAt: '2026-11-10T00:00:00.000Z' }, ca: t0, ua: t0 + 1000 }]);
    expect(del.applied[0].data.deletedAt).toBe('2026-11-10T00:00:00.000Z');
    const edit = await sync(client, 1, [{ id: 'd', c: 'tasks', base: { title: 'Temp' }, patch: { title: 'Edited after delete' }, ca: t0, ua: t0 + 2000 }]);
    expect(edit.conflicts.some((c) => c.field === 'deletedAt')).toBe(true);
    expect(edit.applied[0].data.title).toBe('Edited after delete');
  });

  it('keeps references intact even when a child arrives before its parent', async () => {
    const { client } = await signUp();
    const first = await sync(client, 0, [create('tasks', 'child', { title: 'Sub', parentId: 'parent', projectId: 'proj' })]);
    expect(first.rejected).toEqual([]);
    expect(first.applied[0].data).toMatchObject({ parentId: 'parent', projectId: 'proj' });
    await sync(client, 1, [create('tasks', 'parent', { title: 'Parent' }), create('projects', 'proj', { name: 'P' })]);
    // touching the child re-attaches the real foreign keys; the client-visible value never changed
    const touched = await sync(client, 3, [{ id: 'child', c: 'tasks', base: { title: 'Sub' }, patch: { title: 'Sub 2' }, ca: 1, ua: Date.now() }]);
    expect(touched.applied[0].data).toMatchObject({ title: 'Sub 2', parentId: 'parent', projectId: 'proj' });
    // parent and child in the same batch, child listed first
    const batch = await sync(client, 4, [create('tasks', 'c2', { title: 'c', parentId: 'p2' }), create('tasks', 'p2', { title: 'p' })]);
    expect(batch.rejected).toEqual([]);
  });

  it('paginates large pulls without skipping records', async () => {
    const { client } = await signUp();
    const changes = Array.from({ length: 150 }, (_, i) => create(i % 2 ? 'tasks' : 'shoppingItems', `r${i}`, { title: `Item ${i}` }));
    await sync(client, 0, changes);
    const seen = new Set<string>();
    let cursor = 0;
    for (let guard = 0; guard < 20; guard++) {
      const res = await client.post('sync', { cursor, changes: [] });
      // exercise pagination through the engine directly with a small page size
      const { pull } = await import('@/server/sync/engine');
      const me = await client.get('auth/me');
      const page = await pull(me.data.user.id, cursor, 40);
      for (const r of page.records) seen.add(r.id);
      cursor = page.cursor;
      expect(res.status).toBe(200);
      if (!page.more) break;
    }
    expect(seen.size).toBe(150);
  });

  it('rejects malformed changes without failing the whole batch', async () => {
    const { client } = await signUp();
    const res = await sync(client, 0, [
      create('tasks', 'ok', { title: 'fine' }),
      create('Bad Collection!', 'x', { a: 1 }),
      create('tasks', '../../etc/passwd', { a: 1 }),
      create('notes', 'huge', { content: 'x'.repeat(600 * 1024) }),
    ]);
    expect(res.applied.map((r) => r.id)).toEqual(['ok']);
    expect(res.rejected).toHaveLength(3);
  });
});

describe('data isolation', () => {
  it("never returns or modifies another user's records, even with the same record id", async () => {
    const alice = await signUp();
    const bob = await signUp();
    await sync(alice.client, 0, [create('notes', 'shared-id', { title: 'Alice private', content: 'secret' })]);
    // Bob pulls everything: nothing of Alice's
    const bobPull = await sync(bob.client, 0);
    expect(bobPull.records).toHaveLength(0);
    // Bob writes the same id: creates his own row, Alice's is untouched
    const bobPush = await sync(bob.client, 0, [create('notes', 'shared-id', { title: 'Bob', content: 'mine' })]);
    expect(bobPush.conflicts).toEqual([]);
    expect(bobPush.applied[0].data.content).toBe('mine');
    const alicePull = await sync(alice.client, 0);
    expect(alicePull.records).toHaveLength(1);
    expect(alicePull.records[0].data.content).toBe('secret');
    // Bob cannot attach his task to Alice's project
    await sync(alice.client, 1, [create('projects', 'alice-project', { name: 'Private' })]);
    await sync(bob.client, 1, [create('tasks', 'bt', { title: 't', projectId: 'alice-project' })]);
    const exported = await bob.client.get('export');
    expect(JSON.stringify(exported.data)).not.toContain('Private');
    expect(JSON.stringify(exported.data)).not.toContain('secret');
  });

  it('exports the complete account', async () => {
    const { client, email } = await signUp();
    await sync(client, 0, [create('tasks', 'a', { title: 'A' }), create('trips', 'b', { name: 'B' })]);
    const res = await client.get('export');
    expect(res.status).toBe(200);
    expect(res.data.account.email).toBe(email);
    expect(res.data.records).toHaveLength(2);
    expect(JSON.stringify(res.data)).not.toMatch(/passwordHash|tokenHash|recoveryHash/);
  });
});
