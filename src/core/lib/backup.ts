import { fieldsOf, getDb, searchText, type Rec } from '@/core/data/db';
import type { Fields } from '@/core/sync/merge';
import { same } from '@/core/sync/merge';

/**
 * Export / import / restore. A backup is a plain JSON file the user owns. Importing never overwrites
 * anything silently: `planImport` first reports exactly what would happen, and the caller chooses how
 * records that already exist (and differ) are handled.
 */

export const BACKUP_FORMAT = 'lifeos-backup';
export const BACKUP_VERSION = 1;

export interface BackupRecord {
  id: string;
  c: string;
  ca: number;
  ua: number;
  data: Fields;
}
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  app: string;
  counts: Record<string, number>;
  records: BackupRecord[];
}

const toBackup = (rec: Rec): BackupRecord => ({ id: rec.id, c: rec._c, ca: rec._ca, ua: rec._ua, data: fieldsOf(rec) });

/** Export everything, or only the chosen collections. Deleted records (trash) are left out unless asked for. */
export async function exportBackup(opts: { collections?: string[]; includeDeleted?: boolean } = {}): Promise<BackupFile> {
  const all = await getDb().records.toArray();
  const wanted = opts.collections ? new Set(opts.collections) : null;
  const records = all.filter((r) => (!wanted || wanted.has(r._c)) && (opts.includeDeleted || !r.deletedAt)).map(toBackup);
  const counts: Record<string, number> = {};
  for (const r of records) counts[r.c] = (counts[r.c] ?? 0) + 1;
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), app: 'LIFEOS', counts, records };
}

const ID = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/;
const COLLECTION = /^[a-z][a-zA-Z0-9]{0,39}$/;

/** Validate untrusted file contents. Accepts LIFEOS backups and server account exports. */
export function parseBackup(text: string): { ok: true; file: BackupFile; skipped: number } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  const obj = raw as Record<string, unknown>;
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'This file is not a LIFEOS backup.' };
  if (obj.format !== BACKUP_FORMAT && obj.format !== 'lifeos-account-export') return { ok: false, error: 'This file is not a LIFEOS backup.' };
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) return { ok: false, error: 'This backup was made by a newer version of LIFEOS.' };
  if (!Array.isArray(obj.records)) return { ok: false, error: 'The backup contains no records.' };
  const records: BackupRecord[] = [];
  let skipped = 0;
  for (const r of obj.records as Record<string, unknown>[]) {
    const valid = r && typeof r.id === 'string' && ID.test(r.id) && typeof r.c === 'string' && COLLECTION.test(r.c) && r.data && typeof r.data === 'object' && !Array.isArray(r.data);
    if (!valid) {
      skipped++;
      continue;
    }
    const now = Date.now();
    records.push({ id: r.id as string, c: r.c as string, ca: Number(r.ca) || now, ua: Number(r.ua) || now, data: r.data as Fields });
  }
  const counts: Record<string, number> = {};
  for (const r of records) counts[r.c] = (counts[r.c] ?? 0) + 1;
  return { ok: true, skipped, file: { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: String(obj.exportedAt ?? ''), app: 'LIFEOS', counts, records } };
}

export interface ImportPlan {
  /** records that do not exist on this device */
  added: BackupRecord[];
  /** records that exist with different content */
  changed: BackupRecord[];
  /** records that are already identical */
  unchanged: number;
  perCollection: Record<string, { added: number; changed: number; unchanged: number }>;
}

export async function planImport(file: BackupFile, collections?: string[]): Promise<ImportPlan> {
  const wanted = collections ? new Set(collections) : null;
  const plan: ImportPlan = { added: [], changed: [], unchanged: 0, perCollection: {} };
  const existing = new Map((await getDb().records.bulkGet(file.records.map((r) => r.id))).filter((r): r is Rec => !!r).map((r) => [r.id, r]));
  for (const r of file.records) {
    if (wanted && !wanted.has(r.c)) continue;
    const bucket = (plan.perCollection[r.c] ??= { added: 0, changed: 0, unchanged: 0 });
    const local = existing.get(r.id);
    if (!local) {
      plan.added.push(r);
      bucket.added++;
    } else if (same(fieldsOf(local), r.data)) {
      plan.unchanged++;
      bucket.unchanged++;
    } else {
      plan.changed.push(r);
      bucket.changed++;
    }
  }
  return plan;
}

export type ConflictMode = 'keep' | 'replace' | 'copy';

/**
 * Apply a plan. For records that already exist with different content:
 *  - keep:    leave the current version untouched (default — nothing is overwritten)
 *  - replace: restore the backup's version (the current version stays recoverable through sync history/conflicts)
 *  - copy:    import the backup's version as a separate new record
 */
export async function applyImport(plan: ImportPlan, mode: ConflictMode = 'keep'): Promise<{ added: number; replaced: number; copied: number }> {
  const db = getDb();
  const now = Date.now();
  const result = { added: 0, replaced: 0, copied: 0 };
  const fresh = (r: BackupRecord, id = r.id): Rec => {
    const rec: Rec = { ...r.data, id, _c: r.c, _ca: r.ca, _ua: now, _dirty: 1, _base: null };
    rec._s = searchText(r.data);
    return rec;
  };
  await db.transaction('rw', db.records, async () => {
    await db.records.bulkPut(plan.added.map((r) => fresh(r)));
    result.added = plan.added.length;
    if (mode === 'replace') {
      for (const r of plan.changed) {
        const local = await db.records.get(r.id);
        if (!local) continue;
        const rec = fresh(r);
        rec._base = local._dirty ? (local._base ?? null) : fieldsOf(local);
        rec._seq = local._seq;
        // fields that exist now but not in the backup are cleared
        for (const key of Object.keys(fieldsOf(local))) if (!(key in r.data)) rec[key] = null;
        await db.records.put(rec);
        result.replaced++;
      }
    } else if (mode === 'copy') {
      for (const r of plan.changed) {
        await db.records.put(fresh(r, crypto.randomUUID()));
        result.copied++;
      }
    }
  });
  return result;
}

export function downloadFile(name: string, content: string | Blob, type = 'application/json'): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
