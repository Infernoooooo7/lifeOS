import type { Fields } from '@/core/sync/merge';
import { fieldsOf, getDb, searchText, type Rec } from './db';

/** Collections that are not scoped to a workspace. */
export const GLOBAL_COLLECTIONS = new Set(['workspaces', 'settings', 'modulePrefs', 'notifications']);
/** Collections whose writes are bookkeeping and should not appear in the activity feed. */
const QUIET = new Set(['activity', 'notifications', 'settings', 'modulePrefs', 'noteVersions', 'habitLogs', 'waterLogs', 'focusSessions', 'workspaces']);

export type ChangeKind = 'create' | 'update' | 'delete' | 'restore';
export interface ChangeEvent {
  kind: ChangeKind;
  rec: Rec;
  prev?: Rec;
  /** true when the change came from automation or an import rather than a direct user action */
  silent?: boolean;
}
type Listener = (event: ChangeEvent) => void;

const listeners = new Set<Listener>();
export function onChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function emit(event: ChangeEvent) {
  for (const l of listeners) {
    try {
      l(event);
    } catch (e) {
      console.error('change listener failed', e);
    }
  }
}

/** Runtime context supplied by the app shell. */
export const ctx: { ws: string; label: (collection: string) => string } = { ws: 'personal', label: (c) => c };

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
        const r = (Math.random() * 16) | 0;
        return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export const titleOf = (rec: Fields): string => String(rec.title ?? rec.name ?? rec.text ?? rec.label ?? '').trim() || 'Untitled';

export interface WriteOptions {
  /** skip activity log and automation triggers */
  silent?: boolean;
  id?: string;
}

function stamp(rec: Rec): Rec {
  rec._s = searchText(fieldsOf(rec));
  return rec;
}

async function logActivity(action: string, rec: Rec) {
  if (QUIET.has(rec._c)) return;
  const now = Date.now();
  await getDb().records.put(
    stamp({
      id: uid(), _c: 'activity', _ca: now, _ua: now, _dirty: 1, _base: null, ws: rec.ws,
      action, collection: rec._c, recordId: rec.id, summary: `${ctx.label(rec._c)}: ${titleOf(rec)}`, at: new Date(now).toISOString(),
    }),
  );
}

export async function create(collection: string, data: Fields = {}, opts: WriteOptions = {}): Promise<Rec> {
  const now = Date.now();
  const rec: Rec = { ...data, id: opts.id ?? (data.id as string) ?? uid(), _c: collection, _ca: now, _ua: now, _dirty: 1, _base: null };
  if (!GLOBAL_COLLECTIONS.has(collection) && rec.ws === undefined) rec.ws = ctx.ws;
  await getDb().records.put(stamp(rec));
  if (!opts.silent) await logActivity('created', rec);
  emit({ kind: 'create', rec, silent: opts.silent });
  return rec;
}

export async function createMany(collection: string, rows: Fields[], opts: WriteOptions = { silent: true }): Promise<Rec[]> {
  const now = Date.now();
  const recs = rows.map((data, i) => {
    const rec: Rec = { ...data, id: (data.id as string) ?? uid(), _c: collection, _ca: now + i, _ua: now + i, _dirty: 1, _base: null };
    if (!GLOBAL_COLLECTIONS.has(collection) && rec.ws === undefined) rec.ws = ctx.ws;
    return stamp(rec);
  });
  await getDb().records.bulkPut(recs);
  for (const rec of recs) emit({ kind: 'create', rec, silent: opts.silent ?? true });
  return recs;
}

/** Merge `patch` into a record. Keeps the last synced version so the change can be merged field by field. */
export async function update(id: string, patch: Fields, opts: WriteOptions = {}): Promise<Rec | undefined> {
  const db = getDb();
  let prev: Rec | undefined;
  let next: Rec | undefined;
  await db.transaction('rw', db.records, async () => {
    prev = await db.records.get(id);
    if (!prev) return;
    next = { ...prev, ...patch, id: prev.id, _c: prev._c, _ca: prev._ca, _ua: Math.max(Date.now(), prev._ua + 1), _dirty: 1 };
    if (!prev._dirty) next._base = fieldsOf(prev);
    delete next._rejected;
    for (const key of Object.keys(patch)) if (patch[key] === undefined) next[key] = null;
    await db.records.put(stamp(next));
  });
  if (!prev || !next) return undefined;
  const kind: ChangeKind = patch.deletedAt ? 'delete' : prev.deletedAt && patch.deletedAt === null ? 'restore' : 'update';
  if (!opts.silent && kind !== 'update') await logActivity(kind === 'delete' ? 'deleted' : 'restored', next);
  else if (!opts.silent && 'status' in patch && patch.status !== prev.status && ['done', 'completed'].includes(String(patch.status))) await logActivity('completed', next);
  emit({ kind, rec: next, prev, silent: opts.silent });
  return next;
}

/** Soft delete: the record becomes a tombstone that syncs, and can be restored from the trash. */
export const remove = (id: string, opts: WriteOptions = {}) => update(id, { deletedAt: new Date().toISOString() }, opts);
export const restore = (id: string, opts: WriteOptions = {}) => update(id, { deletedAt: null }, opts);

export async function removeMany(ids: string[]): Promise<void> {
  for (const id of ids) await remove(id, { silent: true });
}

export const getRec = (id: string) => getDb().records.get(id);

/** Live (non-deleted) records of a collection in the active workspace. */
export async function list(collection: string, opts: { allWorkspaces?: boolean; includeDeleted?: boolean } = {}): Promise<Rec[]> {
  const rows = await getDb().records.where('_c').equals(collection).toArray();
  const scoped = !GLOBAL_COLLECTIONS.has(collection) && !opts.allWorkspaces;
  return rows.filter((r) => (opts.includeDeleted || !r.deletedAt) && (!scoped || !r.ws || r.ws === ctx.ws));
}

/** Create or update a record with a well-known id (settings, per-day logs…). */
export async function upsert(collection: string, id: string, patch: Fields, opts: WriteOptions = { silent: true }): Promise<Rec> {
  const existing = await getRec(id);
  if (existing) return (await update(id, existing.deletedAt ? { ...patch, deletedAt: null } : patch, opts))!;
  return create(collection, patch, { ...opts, id });
}
