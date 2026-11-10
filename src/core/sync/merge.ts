/**
 * Three-way, field-level merge shared by the client (applying pulled changes onto unsynced local edits)
 * and the server (applying a pushed patch onto the stored row).
 *
 * Model: a record is a flat JSON object. A device that edits a record remembers the last synced
 * version (`base`). A push carries only the fields that differ from `base`, together with their base
 * values. The receiver compares against its own current value:
 *
 *   current == patch          → nothing to do
 *   current == base           → only the sender changed the field → apply
 *   current != base != patch  → both sides changed the field → CONFLICT
 *
 * Edits to different fields of the same record therefore merge without loss. A true conflict is
 * resolved last-writer-wins, and the discarded value is always reported so the UI can show it and
 * offer to restore it — user changes are never overwritten silently.
 */

export type Json = unknown;
export type Fields = Record<string, Json>;

export interface FieldConflict {
  field: string;
  /** value that was kept */
  kept: Json;
  /** value that lost and was discarded */
  discarded: Json;
  /** which side lost: the incoming patch or the receiver's current value */
  loser: 'patch' | 'current';
}

const isNil = (v: unknown) => v === null || v === undefined || v === '';

/** Deep equality where null, undefined and '' are equivalent (an unset field). */
export function same(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (isNil(a) && isNil(b)) return true;
  if (isNil(a) || isNil(b)) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  const ao = a as Fields;
  const bo = b as Fields;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!same(ao[k], bo[k])) return false;
  return true;
}

/** Fields of `current` that differ from `base`, with the corresponding base values. */
export function diff(base: Fields | null | undefined, current: Fields): { patch: Fields; base: Fields | null } {
  const patch: Fields = {};
  const baseVals: Fields = {};
  const keys = new Set([...Object.keys(base ?? {}), ...Object.keys(current)]);
  for (const k of keys) {
    if (!same(base?.[k], current[k])) {
      patch[k] = current[k] ?? null;
      if (base) baseVals[k] = base[k] ?? null;
    }
  }
  return { patch, base: base ? baseVals : null };
}

export interface ApplyResult {
  next: Fields;
  conflicts: FieldConflict[];
  /** true when `next` differs from `current` */
  changed: boolean;
}

/**
 * Apply `patch` (made against `base`) onto `current`.
 * `base === null` means the sender created the record without ever having seen the receiver's copy.
 */
export function applyPatch(
  current: Fields,
  base: Fields | null,
  patch: Fields,
  patchTime: number,
  currentTime: number,
): ApplyResult {
  const next: Fields = { ...current };
  const conflicts: FieldConflict[] = [];
  let changed = false;
  for (const field of Object.keys(patch)) {
    const incoming = patch[field];
    const existing = current[field];
    if (same(existing, incoming)) continue;
    const untouched = base === null ? isNil(existing) : same(existing, base[field]);
    if (untouched) {
      next[field] = incoming;
      changed = true;
      continue;
    }
    if (patchTime >= currentTime) {
      next[field] = incoming;
      changed = true;
      conflicts.push({ field, kept: incoming, discarded: existing ?? null, loser: 'current' });
    } else {
      conflicts.push({ field, kept: existing ?? null, discarded: incoming ?? null, loser: 'patch' });
    }
  }
  return { next, conflicts, changed };
}
