import { create as createStore } from 'zustand';
import type { Fields } from '@/core/sync/merge';
import { fieldsOf, type Rec } from './db';
import { ctx, onChange, remove, restore, titleOf, update, type ChangeEvent, type ChangeKind } from './store';

/**
 * Undo and redo for everything the person changes, in any module (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z).
 *
 * Every change made through the store is recorded with the values it replaced. Changes that happen together (a bulk
 * action, or completing a repeating task, which also schedules the next one) form one step; a burst of saves to the
 * same fields of one record (typing with autosave) collapses into one step. Undo writes the old values back as an
 * ordinary change, so it syncs like any other edit. The history lives in memory: it covers this session on this
 * device, up to 100 steps.
 *
 * Not recorded: bookkeeping collections, changes made by the background engines (wrapped in `withoutUndo`), changes
 * arriving from sync (they do not go through the store), and encrypted journal entries (their text cannot be written
 * back without the key).
 */

const SKIP = new Set(['activity', 'notifications', 'conflicts', 'settings', 'modulePrefs', 'noteVersions', 'workspaces']);
const GROUP_MS = 350; // changes closer together than this belong to one action
const COALESCE_MS = 5000; // repeated saves of the same fields of one record within this window are one step
const MAX_STEPS = 100;
const MAX_CHANGES = 500; // an operation larger than this (a big import) clears the history instead of flooding it

interface Change {
  id: string;
  collection: string;
  kind: ChangeKind;
  before: Fields;
  after: Fields;
  title: string;
}
export interface UndoStep {
  changes: Change[];
  at: number;
}

let undoStack: UndoStep[] = [];
let redoStack: UndoStep[] = [];
let applying = false;
let paused = 0;
let clock = () => Date.now();
/** Test hook: control time. */
export const _setClock = (fn: () => number) => void (clock = fn);

export const useUndo = createStore<{ undo: string | null; redo: string | null }>(() => ({ undo: null, redo: null }));
const VERB: Record<ChangeKind, string> = { create: 'added', update: 'edited', delete: 'deleted', restore: 'restored' };
export function describeStep(step: UndoStep | undefined): string | null {
  if (!step) return null;
  const c = step.changes[0];
  const first = `${ctx.label(c.collection)} “${c.title}” ${VERB[c.kind]}`;
  return step.changes.length > 1 ? `${first} and ${step.changes.length - 1} more` : first;
}
const publish = () => useUndo.setState({ undo: describeStep(undoStack.at(-1)), redo: describeStep(redoStack.at(-1)) });

function diff(prev: Rec | undefined, rec: Rec): { before: Fields; after: Fields } {
  const a = prev ? fieldsOf(prev) : {};
  const b = fieldsOf(rec);
  const before: Fields = {}, after: Fields = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null)) continue;
    before[k] = a[k] ?? null;
    after[k] = b[k] ?? null;
  }
  return { before, after };
}

function record(e: ChangeEvent) {
  if (applying || paused || SKIP.has(e.rec._c) || e.rec.sealed || e.prev?.sealed) return;
  const { before, after } = e.kind === 'create' ? { before: {}, after: {} } : diff(e.prev, e.rec);
  if (e.kind === 'update' && !Object.keys(after).length) return;
  const change: Change = { id: e.rec.id, collection: e.rec._c, kind: e.kind, before, after, title: titleOf(e.kind === 'delete' && e.prev ? e.prev : e.rec) };
  const now = clock();
  const last = undoStack.at(-1);
  redoStack = [];
  if (last && now - last.at < GROUP_MS) {
    // Part of the same action. Two changes to one record inside it fold into one (first "before", last "after").
    const same = last.changes.find((c) => c.id === change.id && c.kind === 'update' && change.kind === 'update');
    if (same) {
      for (const k of Object.keys(change.after)) if (!(k in same.before)) same.before[k] = change.before[k];
      Object.assign(same.after, change.after);
    } else last.changes.push(change);
    last.at = now;
    if (last.changes.length > MAX_CHANGES) undoStack = [];
  } else if (last && change.kind === 'update' && last.changes.length === 1 && last.changes[0].kind === 'update' && last.changes[0].id === change.id && now - last.at < COALESCE_MS && Object.keys(change.after).every((k) => k in last.changes[0].after)) {
    Object.assign(last.changes[0].after, change.after); // autosave while typing: keep the oldest "before"
    last.at = now;
  } else {
    undoStack.push({ changes: [change], at: now });
    if (undoStack.length > MAX_STEPS) undoStack.shift();
  }
  publish();
}

let stop: (() => void) | null = null;
/** Start recording (idempotent). Returns a function that stops and clears the history. */
export function startUndo(): () => void {
  stop ??= onChange(record);
  return () => {
    stop?.();
    stop = null;
    clearUndo();
  };
}
export function clearUndo() {
  undoStack = [];
  redoStack = [];
  publish();
}

/** Run background work (engines, automation ticks) whose changes are not the person's own and must not be undoable. */
export async function withoutUndo<T>(fn: () => Promise<T>): Promise<T> {
  paused++;
  try {
    return await fn();
  } finally {
    paused--;
  }
}

async function apply(step: UndoStep, direction: 'undo' | 'redo') {
  applying = true;
  try {
    // Undo in reverse order, redo in the original order.
    for (const c of direction === 'undo' ? [...step.changes].reverse() : step.changes) {
      const backwards = direction === 'undo';
      if (c.kind === 'create') await (backwards ? remove(c.id, { silent: true }) : restore(c.id, { silent: true }));
      else if (c.kind === 'delete') await (backwards ? restore(c.id, { silent: true }) : remove(c.id, { silent: true }));
      else if (c.kind === 'restore') await (backwards ? remove(c.id, { silent: true }) : restore(c.id, { silent: true }));
      else await update(c.id, backwards ? c.before : c.after, { silent: true });
    }
  } finally {
    applying = false;
  }
}

/** Undo the latest step. Returns its description, or null when there is nothing to undo. */
export async function undo(): Promise<string | null> {
  const step = undoStack.pop();
  if (!step) return null;
  await apply(step, 'undo');
  redoStack.push(step);
  const top = undoStack.at(-1);
  if (top) top.at = 0; // a change made right after an undo starts its own step
  publish();
  return describeStep(step);
}

export async function redo(): Promise<string | null> {
  const step = redoStack.pop();
  if (!step) return null;
  await apply(step, 'redo');
  step.at = 0; // a later change must start a new step, not join this one
  undoStack.push(step);
  publish();
  return describeStep(step);
}
