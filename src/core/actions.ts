import type { Rec } from './data/db';
import { create, getRec, upsert } from './data/store';
import { ymd } from './lib/dates';
import { logId } from './lib/habits';
import type { Fields } from './sync/merge';

/** Cross-module actions shared by widgets, modules and the 3D workspace. */

/** Set a habit's logged value for a day. Per-day ids make check-ins from two devices merge instead of duplicating. */
export async function logHabit(habitId: string, date: string, value: number, note?: string): Promise<void> {
  await upsert('habitLogs', logId(habitId, date), { habitId, date, value: Math.max(0, value), ...(note !== undefined ? { note } : {}) });
}

/** One-tap check-in: binary habits toggle, counted habits add one step (wrapping to zero after the target). */
export async function tapHabit(habit: Rec, date: string = ymd()): Promise<number> {
  const existing = await getRec(logId(habit.id, date));
  const current = existing && !existing.deletedAt ? Number(existing.value ?? 0) : 0;
  const target = Number(habit.target) > 0 ? Number(habit.target) : 1;
  const counted = habit.cadence === 'daily' && target > 1;
  const next = counted ? (current >= target ? 0 : current + 1) : current > 0 ? 0 : 1;
  await logHabit(habit.id, date, next);
  return next;
}

/** Add water for today (ml). */
export async function addWater(ml: number, date: string = ymd()): Promise<void> {
  const id = `wl:${date}`;
  const existing = await getRec(id);
  const current = existing && !existing.deletedAt ? Number(existing.value ?? 0) : 0;
  await upsert('waterLogs', id, { date, value: Math.max(0, current + ml), unit: 'ml' });
}

/** Instantiate a saved template. */
export async function createFromTemplate(template: Rec, overrides: Fields = {}): Promise<Rec> {
  const { _children, ...payload } = (template.payload ?? {}) as Fields & { _children?: Fields[] };
  const rec = await create(String(template.kind), { ...payload, status: payload.status === 'done' ? 'todo' : payload.status, completedAt: null, archived: false, ...overrides });
  if (template.kind === 'tasks' && Array.isArray(_children)) {
    for (const child of _children) await create('tasks', { ...child, status: 'todo', parentId: rec.id }, { silent: true });
  }
  return rec;
}
