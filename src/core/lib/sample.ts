import { getDb } from '@/core/data/db';
import { remove } from '@/core/data/store';
import { sampleBackup } from '@/core/sample-data.mjs';
import { applyImport, planImport, type BackupFile } from './backup';

/**
 * Example data for exploring LIFEOS: a realistic week of projects, tasks, events, habits, money, notes and people,
 * dated around today. Every record carries `sample: true`, so it can be removed in one step later without touching
 * anything the person created themselves.
 */
export async function loadSampleData(now = new Date()): Promise<number> {
  const file = sampleBackup(now) as unknown as BackupFile;
  const marked: BackupFile = { ...file, records: file.records.map((r) => ({ ...r, data: { ...r.data, sample: true } })) };
  const plan = await planImport(marked);
  const result = await applyImport(plan, 'keep');
  return result.added;
}

/** How many example records are still on this device. */
export async function countSampleData(): Promise<number> {
  return getDb().records.filter((r) => r.sample === true && !r.deletedAt).count();
}

/** Delete every example record (soft delete, so it syncs and can be undone from the trash). */
export async function removeSampleData(): Promise<number> {
  const rows = await getDb().records.filter((r) => r.sample === true && !r.deletedAt).toArray();
  for (const r of rows) await remove(r.id, { silent: true });
  return rows.length;
}
