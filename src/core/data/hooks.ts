'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { DEFAULT_PREFS, useApp, type Prefs } from '@/core/app';
import { OPTION_SETS, collection as collectionDef, type FieldDef } from '@/core/collections';
import { MODULES, type ModuleDef } from '@/core/registry';
import { getDb, hasDb, type Rec } from './db';
import { GLOBAL_COLLECTIONS, upsert } from './store';
import { syncState, type SyncState } from './syncClient';

const EMPTY: Rec[] = [];

/** Live records of a collection in the active workspace (deleted records excluded unless asked for). */
export function useRecords(collection: string, opts: { includeDeleted?: boolean; allWorkspaces?: boolean; onlyDeleted?: boolean } = {}): Rec[] {
  const ws = useApp((s) => s.ws);
  const ready = useApp((s) => s.ready);
  const rows = useLiveQuery(() => (ready && hasDb() ? getDb().records.where('_c').equals(collection).toArray() : Promise.resolve(EMPTY)), [collection, ready]);
  return useMemo(() => {
    if (!rows) return EMPTY;
    const scoped = !GLOBAL_COLLECTIONS.has(collection) && !opts.allWorkspaces;
    return rows.filter((r) => (opts.onlyDeleted ? !!r.deletedAt : opts.includeDeleted || !r.deletedAt) && (!scoped || !r.ws || r.ws === ws));
  }, [rows, ws, collection, opts.includeDeleted, opts.allWorkspaces, opts.onlyDeleted]);
}

/** True until the first read of a collection has completed. */
export function useLoaded(collection: string): boolean {
  const ready = useApp((s) => s.ready);
  const n = useLiveQuery(() => (ready && hasDb() ? getDb().records.where('_c').equals(collection).count() : Promise.resolve(-1)), [collection, ready]);
  return n !== undefined && n >= 0;
}

export function useById(collection: string): Map<string, Rec> {
  const rows = useRecords(collection);
  return useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
}

export function useRecord(id: string | undefined | null): Rec | undefined {
  const ready = useApp((s) => s.ready);
  return useLiveQuery(async () => (id && ready && hasDb() ? getDb().records.get(id) : undefined), [id, ready]);
}

/** A synced setting stored as its own record (`setting:<key>`). */
export function useSetting<T>(key: string, fallback: T): [T, (value: T) => void, boolean] {
  const rec = useRecord(`setting:${key}`);
  const ready = useApp((s) => s.ready);
  const loaded = useLiveQuery(() => (ready && hasDb() ? getDb().records.get(`setting:${key}`).then(() => true) : Promise.resolve(false)), [key, ready]);
  const value = rec && !rec.deletedAt && rec.value !== undefined && rec.value !== null ? (rec.value as T) : fallback;
  const set = useCallback((next: T) => void upsert('settings', `setting:${key}`, { value: next as unknown }), [key]);
  return [value, set, !!loaded];
}

/** User preferences merged over defaults, plus a patch function. */
export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void, boolean] {
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
  const ready = useApp((s) => s.ready);
  const pending = useLiveQuery(() => (ready && hasDb() ? getDb().records.where('_dirty').equals(1).count() : Promise.resolve(0)), [ready]) ?? 0;
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
