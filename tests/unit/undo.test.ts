import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LifeDB, setDb } from '@/core/data/db';
import { create, getRec, remove, update } from '@/core/data/store';
import { _setClock, clearUndo, redo, startUndo, undo, useUndo, withoutUndo } from '@/core/data/undo';

let now = 1_000_000;
const tick = (ms: number) => void (now += ms);
let stop: () => void;

beforeEach(() => {
  setDb(new LifeDB(`undo-${Math.random()}`));
  now = 1_000_000;
  _setClock(() => now);
  stop = startUndo();
});
afterEach(() => stop());

describe('undo and redo', () => {
  it('undoes and redoes creating, editing and deleting a record', async () => {
    const t = await create('tasks', { title: 'Buy milk', status: 'todo', priority: 0 });
    tick(1000);
    await update(t.id, { title: 'Buy oat milk', priority: 2 });
    tick(1000);
    await remove(t.id);
    expect(useUndo.getState().undo).toContain('deleted');

    expect(await undo()).toContain('“Buy oat milk” deleted');
    expect((await getRec(t.id))?.deletedAt).toBeFalsy();
    await undo();
    expect(await getRec(t.id)).toMatchObject({ title: 'Buy milk', priority: 0 });
    await undo();
    expect((await getRec(t.id))?.deletedAt).toBeTruthy(); // the creation is undone: the record is in the trash
    expect(await undo()).toBeNull();

    await redo();
    await redo();
    expect(await getRec(t.id)).toMatchObject({ title: 'Buy oat milk', priority: 2, deletedAt: null });
    await redo();
    expect((await getRec(t.id))?.deletedAt).toBeTruthy();
    expect(await redo()).toBeNull();
  });

  it('treats changes made together as one step', async () => {
    const a = await create('tasks', { title: 'A', status: 'todo' });
    tick(1000);
    const b = await create('tasks', { title: 'B', status: 'todo' });
    tick(1000);
    // completing a repeating task: the task changes and its next instance appears
    await update(a.id, { status: 'done' });
    tick(20);
    const next = await create('tasks', { title: 'A', status: 'todo' }, { silent: true });
    tick(20);
    await update(b.id, { status: 'done' });
    expect(useUndo.getState().undo).toContain('and 2 more');
    await undo();
    expect((await getRec(a.id))?.status).toBe('todo');
    expect((await getRec(b.id))?.status).toBe('todo');
    expect((await getRec(next.id))?.deletedAt).toBeTruthy();
  });

  it('collapses a burst of autosaves to one field into one step, keeping the oldest value', async () => {
    const n = await create('notes', { title: 'Draft', content: '' });
    tick(1000);
    for (const text of ['H', 'He', 'Hello', 'Hello world']) {
      await update(n.id, { content: text });
      tick(700);
    }
    await undo();
    expect((await getRec(n.id))?.content).toBe('');
    await redo();
    expect((await getRec(n.id))?.content).toBe('Hello world');
    // a pause, or a different field, starts a new step
    tick(6000);
    await update(n.id, { content: 'Hello world!' });
    tick(700);
    await update(n.id, { title: 'Final' });
    await undo();
    expect(await getRec(n.id)).toMatchObject({ title: 'Draft', content: 'Hello world!' });
    await undo();
    expect((await getRec(n.id))?.content).toBe('Hello world');
  });

  it('a new change clears redo, and a change right after an undo is its own step', async () => {
    const t = await create('tasks', { title: 'One', status: 'todo' });
    tick(1000);
    await update(t.id, { title: 'Two' });
    await undo();
    expect(useUndo.getState().redo).toBeTruthy();
    tick(10);
    await update(t.id, { priority: 3 });
    expect(useUndo.getState().redo).toBeNull();
    await undo();
    const after = await getRec(t.id); // only the priority change was undone
    expect(after?.title).toBe('One');
    expect(after?.priority ?? null).toBeNull();
    expect(after?.deletedAt).toBeFalsy();
  });

  it('ignores bookkeeping, background work, no-op saves and encrypted entries', async () => {
    await create('settings', { value: { theme: 'light' } }, { id: 'setting:prefs' });
    await create('notifications', { title: 'Reminder' });
    await withoutUndo(async () => void (await create('transactions', { payee: 'Netflix', amount: 199 })));
    const j = await create('journal', { date: '2026-11-15', private: true, content: '', sealed: { v: 1, iv: 'x', ct: 'y' } });
    await update(j.id, { mood: 4 });
    expect(useUndo.getState().undo).toBeNull();
    const t = await create('tasks', { title: 'Same', status: 'todo' });
    tick(1000);
    await update(t.id, { title: 'Same' });
    expect(useUndo.getState().undo).toContain('added');
    clearUndo();
    expect(await undo()).toBeNull();
  });
});
