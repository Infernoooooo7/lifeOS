'use client';

import { liveQuery } from 'dexie';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { DEFAULT_PREFS, useApp, type Prefs } from '@/core/app';
import { OPTION_SETS, collection as collectionDef, type FieldDef } from '@/core/collections';
import { MODULES, type ModuleDef } from '@/core/registry';
import { getDb, hasDb, type Rec } from './db';
import { GLOBAL_COLLECTIONS, upsert } from './store';
import { syncState, type SyncState } from './syncClient';

const EMPTY: Rec[] = [];

// ── Shared live queries ─────────────────────────────────────────────────────────────────────────────
// Many components read the same collection (and nearly every component reads preferences). Each key gets ONE
// Dexie live query shared by all its readers, so a write re-reads the data once and every reader receives the
// same array instance. A query stays subscribed for a while after its last reader leaves, so returning to a
// module shows its data at once instead of loading again.

interface Entry {
  value: unknown;
  listeners: Set<() => void>;
  sub: { unsubscribe(): void } | null;
  idle: ReturnType<typeof setTimeout> | null;
}
const live = new Map<string, Entry>();
const KEEP_ALIVE_MS = 60_000;

function subscribeLive(key: string, query: () => Promise<unknown>, onChange: () => void): () => void {
  let e = live.get(key);
  if (!e) live.set(key, (e = { value: undefined, listeners: new Set(), sub: null, idle: null }));
  const entry = e;
  entry.listeners.add(onChange);
  if (entry.idle) clearTimeout(entry.idle), (entry.idle = null);
  if (!entry.sub) {
    entry.sub = liveQuery(query).subscribe({
      next: (v) => {
        entry.value = v;
        entry.listeners.forEach((l) => l());
      },
      error: (err) => console.error('live query failed', key, err),
    });
  }
  return () => {
    entry.listeners.delete(onChange);
    if (entry.listeners.size) return;
    entry.idle = setTimeout(() => {
      if (entry.listeners.size) return;
      entry.sub?.unsubscribe();
      live.delete(key);
    }, KEEP_ALIVE_MS);
  };
}

const noop = () => () => undefined;
const none = () => undefined;

/** The current value of a shared live query; undefined until its first result (or while there is no database). */
function useLive<T>(name: string | null, query: () => Promise<T>): T | undefined {
  const ready = useApp((s) => s.ready);
  const key = name && ready && hasDb() ? `${getDb().name}|${name}` : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const subscribe = useMemo(() => (key ? (cb: () => void) => subscribeLive(key, query, cb) : noop), [key]);
  const get = useCallback(() => (key ? (live.get(key)?.value as T | undefined) : undefined), [key]);
  return useSyncExternalStore(subscribe, get, none);
}

function useCollectionRows(collection: string): Rec[] | undefined {
  return useLive(`c:${collection}`, () => getDb().records.where('_c').equals(collection).toArray());
}

/** Live records of a collection in the active workspace (deleted records excluded unless asked for). */
export function useRecords(collection: string, opts: { includeDeleted?: boolean; allWorkspaces?: boolean; onlyDeleted?: boolean } = {}): Rec[] {
  const ws = useApp((s) => s.ws);
  const rows = useCollectionRows(collection);
  return useMemo(() => {
    if (!rows) return EMPTY;
    const scoped = !GLOBAL_COLLECTIONS.has(collection) && !opts.allWorkspaces;
    return rows.filter((r) => (opts.onlyDeleted ? !!r.deletedAt : opts.includeDeleted || !r.deletedAt) && (!scoped || !r.ws || r.ws === ws));
  }, [rows, ws, collection, opts.includeDeleted, opts.allWorkspaces, opts.onlyDeleted]);
}

/** True until the first read of a collection has completed. */
export function useLoaded(collection: string): boolean {
  return useCollectionRows(collection) !== undefined;
}

export function useById(collection: string): Map<string, Rec> {
  const rows = useRecords(collection);
  return useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
}

/** A record and whether it has been read yet (`loaded` is true even when the record does not exist). */
function useRecordState(id: string | undefined | null): { rec: Rec | undefined; loaded: boolean } {
  const box = useLive(id ? `r:${id}` : null, () => getDb().records.get(id!).then((rec) => ({ rec })));
  return { rec: box?.rec, loaded: box !== undefined };
}

export function useRecord(id: string | undefined | null): Rec | undefined {
  return useRecordState(id).rec;
}

/** A synced setting stored as its own record (`setting:<key>`). */
export function useSetting<T>(key: string, fallback: T): [T, (value: T) => Promise<unknown>, boolean] {
  const { rec, loaded } = useRecordState(`setting:${key}`);
  const value = rec && !rec.deletedAt && rec.value !== undefined && rec.value !== null ? (rec.value as T) : fallback;
  // Returns the write, so a caller that must not lose it (finishing onboarding before a reload) can wait for it.
  const set = useCallback((next: T) => upsert('settings', `setting:${key}`, { value: next as unknown }), [key]);
  return [value, set, !!loaded];
}

/** User preferences merged over defaults, plus a patch function. */
export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => Promise<unknown>, boolean] {
  const [stored, setStored, loaded] = useSetting<Partial<Prefs>>('prefs', {});
  const prefs = useMemo<Prefs>(
    () => ({ ...DEFAULT_PREFS, ...stored, notify: { ...DEFAULT_PREFS.notify, ...stored.notify }, quiet: { ...DEFAULT_PREFS.quiet, ...stored.quiet }, focus: { ...DEFAULT_PREFS.focus, ...stored.focus }, workHours: { ...DEFAULT_PREFS.workHours, ...stored.workHours } }),
    [stored],
  );
  const patch = useCallback((p: Partial<Prefs>) => setStored({ ...stored, ...p }), [stored, setStored]);
  return [prefs, patch, loaded];
}

/** Options of a user-extendable set: built-ins followed by the user's own values. */
export function useOptions(key: string | undefined): [string[], (value: string) => void] {
  const [custom, setCustom] = useSetting<Record<string, string[]>>('options', {});
  const options = useMemo(() => (key ? [...new Set([...(OPTION_SETS[key] ?? []), ...(custom[key] ?? [])])] : []), [key, custom]);
  const add = useCallback(
    (value: string) => {
      const v = value.trim();
      if (key && v && !options.includes(v)) setCustom({ ...custom, [key]: [...(custom[key] ?? []), v] });
    },
    [key, options, custom, setCustom],
  );
  return [options, add];
}

/** Built-in fields of a collection followed by the user's custom fields. */
export function useFields(collection: string): FieldDef[] {
  const [custom] = useSetting<Record<string, FieldDef[]>>('customFields', {});
  return useMemo(() => [...collectionDef(collection).fields, ...(custom[collection] ?? [])], [collection, custom]);
}

export interface ModuleState {
  def: ModuleDef;
  enabled: boolean;
  favorite: boolean;
  lastUsedAt: string | null;
}

/** Every module with the user's activation state. Before any choice is stored, `defaultOn` applies. */
export function useModules(): ModuleState[] {
  const prefs = useRecords('modulePrefs');
  return useMemo(() => {
    const byModule = new Map(prefs.map((p) => [p.moduleId as string, p]));
    return MODULES.map((def) => {
      const p = byModule.get(def.id);
      return { def, enabled: def.core ? true : p ? p.enabled !== false : !!def.defaultOn, favorite: !!p?.favorite, lastUsedAt: (p?.lastUsedAt as string) ?? null };
    });
  }, [prefs]);
}

export const useEnabledModules = (): Set<string> => {
  const modules = useModules();
  return useMemo(() => new Set(modules.filter((m) => m.enabled).map((m) => m.def.id)), [modules]);
};

export const setModule = (moduleId: string, patch: { enabled?: boolean; favorite?: boolean; lastUsedAt?: string }) => upsert('modulePrefs', `mp:${moduleId}`, { moduleId, ...patch });

export function useSync(): SyncState & { pending: number; conflicts: number } {
  const state = useSyncExternalStore(syncState.subscribe, syncState.getState, syncState.getState);
  const pending = useLive('pending', () => getDb().records.where('_dirty').equals(1).count()) ?? 0;
  const conflicts = useConflicts().filter((c) => !c.resolved).length;
  return { ...state, pending, conflicts };
}

/** Conflict notices (newest first). They are ordinary synced records, so every device shows the same list. */
export function useConflicts(): Rec[] {
  const rows = useRecords('conflicts');
  return useMemo(() => [...rows].sort((a, b) => b._ca - a._ca).slice(0, 200), [rows]);
}

/** Re-render on an interval (clocks, countdowns, "x minutes ago"). */
export function useNow(intervalMs = 60_000): Date {
  const subscribe = useCallback(
    (cb: () => void) => {
      const t = setInterval(cb, intervalMs);
      return () => clearInterval(t);
    },
    [intervalMs],
  );
  const stamp = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / intervalMs), () => 0);
  return useMemo(() => new Date(), [stamp]); // eslint-disable-line react-hooks/exhaustive-deps
}
