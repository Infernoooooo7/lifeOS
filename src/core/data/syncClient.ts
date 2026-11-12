import { createStore } from 'zustand/vanilla';
import { applyPatch, diff, same } from '@/core/sync/merge';
import { MAX_CHANGES_PER_PUSH, type Change, type SyncResponse, type WireRecord } from '@/core/sync/protocol';
import { fieldsOf, getDb, hasDb, searchText, type LifeDB, type Rec } from './db';
import { ApiError, api } from './session';
import { onChange } from './store';

export type SyncStatus = 'local' | 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: number | null;
  error: string | null;
}

export const syncState = createStore<SyncState>(() => ({ status: 'local', lastSyncAt: null, error: null }));

let enabled = false;
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

type Transport = (body: { cursor: number; changes: Change[] }) => Promise<SyncResponse>;
let transport: Transport = (body) => api<SyncResponse>('sync', { body });
/** Tests substitute the network. */
export const setTransport = (t: Transport) => (transport = t);

export function fromWire(rec: WireRecord): Rec {
  const out: Rec = { ...rec.data, id: rec.id, _c: rec.c, _ca: rec.ca, _ua: rec.ua, _seq: rec.seq };
  out._s = searchText(rec.data);
  return out;
}

function toChange(rec: Rec): Change {
  const { patch, base } = diff(rec._base ?? null, fieldsOf(rec));
  return { id: rec.id, c: rec._c, base: rec._base === null || rec._base === undefined ? null : base, patch, ca: rec._ca, ua: rec._ua };
}

/** Apply a record that came from the server, merging with unsynced local edits. */
async function applyRemote(db: LifeDB, remote: WireRecord): Promise<void> {
  const local = await db.records.get(remote.id);
  if (!local || !local._dirty) {
    if (local && (local._seq ?? 0) >= remote.seq) return; // already have this version or newer
    await db.records.put(fromWire(remote));
    return;
  }
  const mine = diff(local._base ?? null, fieldsOf(local)).patch;
  const result = applyPatch(remote.data, local._base ?? null, mine, local._ua, remote.ua);
  // A conflict found while merging on this device is recorded as a synced notice (the server does the same
  // for conflicts it finds), so it shows up in the sync centre of every device.
  const now = Date.now();
  for (const c of result.conflicts) {
    await db.records.put({ id: `cf:${crypto.randomUUID()}`, _c: 'conflicts', _ca: now, _ua: now, _dirty: 1, _base: null, recordId: remote.id, c: remote.c, field: c.field, kept: c.kept ?? null, discarded: c.discarded ?? null, at: new Date(now).toISOString() });
  }
  const merged = fromWire({ ...remote, data: result.next });
  if (!same(result.next, remote.data)) {
    merged._dirty = 1;
    merged._base = remote.data;
    merged._ua = Math.max(local._ua, remote.ua);
  }
  await db.records.put(merged);
}

async function cycle(db: LifeDB): Promise<boolean> {
  const cursor = Number((await db.meta.get('cursor'))?.value ?? 0);
  const dirty = await db.records.where('_dirty').equals(1).limit(MAX_CHANGES_PER_PUSH).toArray();
  const sent = new Map(dirty.map((r) => [r.id, r._ua]));
  const res = await transport({ cursor, changes: dirty.map(toChange) });

  await db.transaction('rw', db.records, db.meta, async () => {
    for (const applied of res.applied) {
      const local = await db.records.get(applied.id);
      if (!local || local._ua === sent.get(applied.id)) {
        await db.records.put(fromWire(applied));
      } else {
        // Edited again while the request was in flight: the acknowledged version becomes the new base.
        await db.records.put({ ...local, _base: applied.data, _seq: applied.seq });
      }
    }
    for (const rejected of res.rejected) {
      const local = await db.records.get(rejected.id);
      if (local && local._ua === sent.get(rejected.id)) {
        const { _dirty: _, ...rest } = local;
        await db.records.put({ ...rest, _rejected: rejected.reason } as Rec);
      }
    }
    for (const remote of res.records) await applyRemote(db, remote);
    await db.meta.put({ key: 'cursor', value: res.cursor });
  });

  // Go again while the server has more pages, or while pushes are still being acknowledged.
  const moreDirty = (await db.records.where('_dirty').equals(1).count()) > 0;
  return res.more || (moreDirty && res.applied.length > 0);
}

/** One push/pull round against a specific database (used by tests and by the background loop). */
export const syncOnce = cycle;

async function run(): Promise<void> {
  if (!enabled || !hasDb()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    syncState.setState({ status: 'offline' });
    return;
  }
  const db = getDb();
  syncState.setState({ status: 'syncing', error: null });
  try {
    const work = async () => {
      for (let i = 0; i < 200; i++) if (!(await cycle(db))) break;
    };
    // One tab syncs at a time; the others see the result through IndexedDB.
    if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request(`lifeos-sync-${db.name}`, work);
    else await work();
    failures = 0;
    syncState.setState({ status: 'idle', lastSyncAt: Date.now(), error: null });
  } catch (e) {
    failures++;
    if (e instanceof ApiError && e.status === 401) {
      enabled = false;
      syncState.setState({ status: 'signed-out', error: 'Signed out — sign in again to resume syncing.' });
    } else if (e instanceof ApiError && e.offline) {
      syncState.setState({ status: 'offline' });
    } else {
      syncState.setState({ status: 'error', error: e instanceof Error ? e.message : 'Sync failed' });
    }
    if (enabled) schedule(Math.min(60_000, 2000 * 2 ** Math.min(failures, 5)));
  }
}

/** Run a sync now (coalesces concurrent calls). Resolves when the local database is up to date. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = run().finally(() => {
    running = null;
    if (again) {
      again = false;
      schedule(50);
    }
  });
  return running;
}

export function schedule(delay = 1200): void {
  if (!enabled) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delay);
}

let wired = false;
/** Start background sync for a signed-in identity. Safe to call more than once. */
export function startSync(): void {
  enabled = true;
  syncState.setState({ status: 'idle' });
  if (!wired && typeof window !== 'undefined') {
    wired = true;
    onChange(() => schedule());
    window.addEventListener('online', () => schedule(100));
    window.addEventListener('offline', () => syncState.setState({ status: 'offline' }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') schedule(200);
    });
    setInterval(() => {
      if (document.visibilityState === 'visible' && enabled) schedule(0);
    }, 30_000);
  }
  schedule(0);
}

export function stopSync(status: SyncStatus = 'local'): void {
  enabled = false;
  if (timer) clearTimeout(timer);
  syncState.setState({ status });
}

export const syncEnabled = () => enabled;
