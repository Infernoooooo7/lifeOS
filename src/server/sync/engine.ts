import { applyPatch, type Fields } from '@/core/sync/merge';
import {
  COLLECTION_NAME, MAX_RECORD_BYTES, type Change, type SyncResponse, type WireConflict, type WireRecord,
} from '@/core/sync/protocol';
import { db } from '../db';
import { MODEL_ORDER, MODELS, fromRow, modelFor, toRow, type ModelName, type RowLike } from './models';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tx = any;
const delegate = (tx: Tx, model: ModelName) => tx[model];

function wire(model: ModelName, row: RowLike): WireRecord {
  const { c, data } = fromRow(model, row);
  return { id: row.id, c, seq: Number(row.seq), ca: row.createdAt.getTime(), ua: row.updatedAt.getTime(), data };
}

const ID = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/;

/** Parents before children for self-referential tables. */
function parentsFirst(model: ModelName, changes: Change[]): Change[] {
  const selfRefs = Object.entries(MODELS[model].cols)
    .filter(([, def]) => typeof def !== 'string' && def.ref === model)
    .map(([col]) => col);
  if (!selfRefs.length || changes.length < 2) return changes;
  const pending = new Map(changes.map((c) => [c.id, c]));
  const out: Change[] = [];
  let progressed = true;
  while (pending.size && progressed) {
    progressed = false;
    for (const [id, change] of pending) {
      const waits = selfRefs.some((col) => {
        const parent = change.patch[col];
        return typeof parent === 'string' && parent !== id && pending.has(parent);
      });
      if (!waits) {
        out.push(change);
        pending.delete(id);
        progressed = true;
      }
    }
  }
  return [...out, ...pending.values()]; // cycles: order no longer matters, refs get parked
}

/**
 * Apply device changes and return what other devices changed since `cursor`.
 * The whole push runs in one transaction that holds the user's row lock, so each user's change
 * counter is strictly ordered and a pull can never skip a concurrently committed change.
 */
export async function sync(userId: string, cursor: number, changes: Change[], pullLimit = 500): Promise<SyncResponse> {
  const applied: WireRecord[] = [];
  const conflicts: WireConflict[] = [];
  const rejected: SyncResponse['rejected'] = [];

  // ── validate & group ─────────────────────────────────────────────────────────────────────────────
  const groups = new Map<ModelName, Change[]>();
  const seen = new Set<string>();
  for (const change of changes) {
    const bad = (reason: string) => rejected.push({ id: String(change?.id), c: String(change?.c), reason });
    if (!change || typeof change.id !== 'string' || !ID.test(change.id)) { bad('invalid id'); continue; }
    if (typeof change.c !== 'string' || !COLLECTION_NAME.test(change.c)) { bad('invalid collection'); continue; }
    if (!change.patch || typeof change.patch !== 'object' || Array.isArray(change.patch)) { bad('invalid patch'); continue; }
    if (JSON.stringify(change.patch).length > MAX_RECORD_BYTES) { bad('record too large'); continue; }
    if (seen.has(change.id)) { bad('duplicate id in batch'); continue; }
    seen.add(change.id);
    const model = modelFor(change.c);
    if (!groups.has(model)) groups.set(model, []);
    groups.get(model)!.push(change);
  }

  if (groups.size) {
    await db().$transaction(
      async (tx: Tx) => {
        const locked: { syncSeq: bigint }[] = await tx.$queryRaw`SELECT "syncSeq" FROM users WHERE id = ${userId} FOR UPDATE`;
        if (!locked.length) throw new Error('user not found');
        let seq = locked[0].syncSeq;
        const now = Date.now();

        // Which referenced rows exist? One query per referenced table, plus rows written in this batch.
        const known = new Map<ModelName, Set<string>>();
        const wanted = new Map<ModelName, Set<string>>();
        for (const [model, list] of groups) {
          for (const [col, def] of Object.entries(MODELS[model].cols)) {
            if (typeof def === 'string') continue;
            for (const change of list) {
              const v = change.patch[col];
              if (typeof v === 'string' && v) {
                if (!wanted.has(def.ref)) wanted.set(def.ref, new Set());
                wanted.get(def.ref)!.add(v);
              }
            }
          }
        }
        for (const [model, ids] of wanted) {
          const rows: { id: string }[] = await delegate(tx, model).findMany({ where: { userId, id: { in: [...ids] } }, select: { id: true } });
          known.set(model, new Set(rows.map((r) => r.id)));
        }
        const refExists = (model: ModelName, id: string) => known.get(model)?.has(id) ?? false;

        for (const model of MODEL_ORDER) {
          const list = groups.get(model);
          if (!list) continue;
          const existingRows: RowLike[] = await delegate(tx, model).findMany({ where: { userId, id: { in: list.map((c) => c.id) } } });
          const existing = new Map(existingRows.map((r) => [r.id, r]));
          if (!known.has(model)) known.set(model, new Set());
          for (const row of existingRows) known.get(model)!.add(row.id);
          // References already stored on these rows are valid by foreign key; parked ones may have arrived since.
          for (const [col, def] of Object.entries(MODELS[model].cols)) {
            if (typeof def === 'string') continue;
            if (!known.has(def.ref)) known.set(def.ref, new Set());
            const parked = new Set<string>();
            for (const row of existingRows) {
              if (typeof row[col] === 'string') known.get(def.ref)!.add(row[col] as string);
              const p = ((row.extra as Fields)?._ref as Fields | undefined)?.[col];
              if (typeof p === 'string' && !refExists(def.ref, p)) parked.add(p);
            }
            if (parked.size) {
              const found: { id: string }[] = await delegate(tx, def.ref).findMany({ where: { userId, id: { in: [...parked] } }, select: { id: true } });
              for (const f of found) known.get(def.ref)!.add(f.id);
            }
          }

          for (const change of parentsFirst(model, list)) {
            const row = existing.get(change.id);
            const ua = Math.min(Number(change.ua) || now, now);
            const ca = Math.min(Number(change.ca) || ua, ua);
            if (row) {
              const current = fromRow(model, row);
              if (current.c !== change.c) {
                rejected.push({ id: change.id, c: change.c, reason: 'id belongs to another collection' });
                continue;
              }
              const result = applyPatch(current.data, change.base, change.patch, ua, row.updatedAt.getTime());
              for (const conflict of result.conflicts) conflicts.push({ ...conflict, id: change.id, c: change.c });
              // Editing a record another device deleted: keep both facts and tell the user.
              if (current.data.deletedAt && !('deletedAt' in change.patch) && result.changed) {
                conflicts.push({ id: change.id, c: change.c, field: 'deletedAt', kept: current.data.deletedAt, discarded: null, loser: 'patch' });
              }
              if (!result.changed) {
                applied.push(wire(model, row));
                continue;
              }
              if (JSON.stringify(result.next).length > MAX_RECORD_BYTES) {
                rejected.push({ id: change.id, c: change.c, reason: 'record too large' });
                continue;
              }
              seq += BigInt(1);
              const data = { ...toRow(model, change.c, result.next, refExists), seq, updatedAt: new Date(Math.max(ua, row.updatedAt.getTime())) };
              const saved: RowLike = await delegate(tx, model).update({ where: { userId_id: { userId, id: change.id } }, data });
              applied.push(wire(model, saved));
            } else {
              seq += BigInt(1);
              const data = {
                ...toRow(model, change.c, change.patch as Fields, refExists),
                id: change.id, userId, seq, createdAt: new Date(ca), updatedAt: new Date(ua),
              };
              const saved: RowLike = await delegate(tx, model).create({ data });
              known.get(model)!.add(change.id);
              applied.push(wire(model, saved));
            }
          }
        }
        if (seq !== locked[0].syncSeq) await tx.user.update({ where: { id: userId }, data: { syncSeq: seq } });
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  const pulled = await pull(userId, cursor, pullLimit, new Set(applied.map((r) => r.id)));
  return { applied, conflicts, rejected, ...pulled };
}

/** Changes with seq > cursor, oldest first. `skip` omits rows the caller just received as `applied`. */
export async function pull(
  userId: string,
  cursor: number,
  limit = 500,
  skip: Set<string> = new Set(),
): Promise<Pick<SyncResponse, 'records' | 'cursor' | 'more'>> {
  const user = await db().user.findUnique({ where: { id: userId }, select: { syncSeq: true } });
  const head = Number(user?.syncSeq ?? 0);
  if (!user || head <= cursor) return { records: [], cursor: Math.max(0, Math.min(cursor, head)), more: false };

  const client = db() as Tx;
  const batches = await Promise.all(
    MODEL_ORDER.map(async (model) => {
      const rows: RowLike[] = await delegate(client, model).findMany({
        where: { userId, seq: { gt: BigInt(Math.max(0, Math.floor(cursor))) } },
        orderBy: { seq: 'asc' },
        take: limit,
      });
      return { model, rows };
    }),
  );
  // If any table hit the page limit, only rows up to the smallest such boundary are complete.
  let bound = head;
  for (const { rows } of batches) if (rows.length === limit) bound = Math.min(bound, Number(rows[rows.length - 1].seq));
  const records: WireRecord[] = [];
  for (const { model, rows } of batches) {
    for (const row of rows) if (Number(row.seq) <= bound && !skip.has(row.id)) records.push(wire(model, row));
  }
  records.sort((a, b) => a.seq - b.seq);
  return { records, cursor: bound, more: bound < head };
}

/** Everything the server holds for a user — used by account export. */
export async function exportAll(userId: string): Promise<WireRecord[]> {
  const out: WireRecord[] = [];
  let cursor = 0;
  for (;;) {
    const page = await pull(userId, cursor, 2000);
    out.push(...page.records);
    cursor = page.cursor;
    if (!page.more) break;
  }
  return out;
}
