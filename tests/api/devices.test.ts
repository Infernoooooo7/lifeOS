import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { LifeDB, setDb } from '@/core/data/db';
import { create, getRec, remove, update } from '@/core/data/store';
import { setTransport, syncOnce } from '@/core/data/syncClient';
import { sync as serverSync } from '@/server/sync/engine';
import { prepareDatabase, signUp } from './setup';

/**
 * End-to-end replication: two Dexie databases stand in for a phone and a PC of the same account,
 * and the real server engine (PostgreSQL) sits between them.
 */

let userId = '';
let online = true;
let gate: Promise<void> | null = null;
beforeAll(async () => {
  prepareDatabase();
  const account = await signUp();
  userId = account.user.id;
  setTransport(async (body) => {
    if (!online) throw new Error('offline');
    const res = await serverSync(userId, body.cursor, body.changes);
    if (gate) await gate; // lets a test hold the response while the user keeps editing
    return res;
  });
});

const phone = new LifeDB(`phone-${Date.now()}`);
const pc = new LifeDB(`pc-${Date.now()}`);
const on = async <T>(db: LifeDB, fn: () => Promise<T>) => {
  setDb(db);
  return fn();
};
const syncDevice = async (db: LifeDB) => {
  for (let i = 0; i < 10; i++) if (!(await syncOnce(db))) break;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('cross-device synchronisation', () => {
  it('a task created on the phone appears on the PC', async () => {
    const task = await on(phone, () => create('tasks', { title: 'Book train tickets', status: 'todo' }));
    await syncDevice(phone);
    await syncDevice(pc);
    const onPc = await pc.records.get(task.id);
    expect(onPc).toMatchObject({ title: 'Book train tickets', status: 'todo', _c: 'tasks' });
    expect(onPc!._dirty).toBeUndefined();
    expect((await phone.records.get(task.id))!._dirty).toBeUndefined();
  });

  it('a project modified on the PC updates on the phone', async () => {
    const project = await on(pc, () => create('projects', { name: 'Home renovation', status: 'active' }));
    await syncDevice(pc);
    await syncDevice(phone);
    await on(pc, () => update(project.id, { status: 'paused', description: 'Waiting for quotes' }));
    await syncDevice(pc);
    await syncDevice(phone);
    expect(await phone.records.get(project.id)).toMatchObject({ name: 'Home renovation', status: 'paused', description: 'Waiting for quotes' });
  });

  it('a note edited offline synchronises after reconnecting, merging with remote edits to other fields', async () => {
    const note = await on(pc, () => create('notes', { title: 'Trip ideas', content: 'Goa', pinned: false }));
    await syncDevice(pc);
    await syncDevice(phone);

    online = false;
    await on(phone, () => update(note.id, { content: 'Goa, Hampi, Coorg' }));
    await expect(syncOnce(phone)).rejects.toThrow('offline');
    expect((await phone.records.get(note.id))!._dirty).toBe(1); // queued, not lost
    online = true;

    await on(pc, () => update(note.id, { pinned: true }));
    await syncDevice(pc);
    await syncDevice(phone);
    await syncDevice(pc);
    for (const db of [phone, pc]) {
      expect(await db.records.get(note.id)).toMatchObject({ title: 'Trip ideas', content: 'Goa, Hampi, Coorg', pinned: true });
    }
    expect(await phone.conflicts.count()).toBe(0);
  });

  it('records a visible conflict when both devices change the same field, and both converge', async () => {
    const note = await on(pc, () => create('notes', { title: 'Shared', content: 'v1' }));
    await syncDevice(pc);
    await syncDevice(phone);
    await on(phone, () => update(note.id, { content: 'phone version' }));
    await wait(15);
    await on(pc, () => update(note.id, { content: 'pc version' }));
    await syncDevice(pc);
    await syncDevice(phone); // phone pushes an older edit of the same field
    await syncDevice(pc);
    expect((await pc.records.get(note.id))!.content).toBe('pc version');
    expect((await phone.records.get(note.id))!.content).toBe('pc version');
    const conflicts = await phone.conflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ id: note.id, field: 'content', kept: 'pc version', discarded: 'phone version', loser: 'local' });
  });

  it('replicates deletions and keeps edits made while a push was in flight', async () => {
    const task = await on(phone, () => create('tasks', { title: 'Temp' }));
    await syncDevice(phone);
    await syncDevice(pc);
    await on(pc, () => remove(task.id));
    await syncDevice(pc);
    await syncDevice(phone);
    expect((await phone.records.get(task.id))!.deletedAt).toBeTruthy();

    const racing = await on(phone, () => create('tasks', { title: 'First' }));
    setDb(phone);
    let release = () => {};
    gate = new Promise<void>((r) => (release = r));
    const inFlight = syncOnce(phone);
    await wait(150); // the push (title "First") has reached the server; its response is held
    await update(racing.id, { title: 'Second' });
    release();
    gate = null;
    await inFlight;
    expect((await getRec(racing.id))!._dirty).toBe(1);
    await syncDevice(phone);
    await syncDevice(pc);
    expect((await pc.records.get(racing.id))!.title).toBe('Second');
  });
});
