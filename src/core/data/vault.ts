import { useSyncExternalStore } from 'react';
import * as V from '@/core/lib/vault';
import type { Fields } from '@/core/sync/merge';
import type { Rec } from './db';
import { getDb } from './db';
import { addWriteHook, update, upsert } from './store';

/**
 * Journal lock state. The key lives only in this module's memory: it is gone on reload, after 15 idle minutes, or
 * when the user locks. While a lock is configured, a store write hook seals the text of private journal entries,
 * so every place that writes the journal (today's page, the editor, quick capture) is covered without knowing.
 */

export const VAULT_ID = 'setting:journalLock';
const IDLE_MS = 15 * 60_000;

export interface VaultState {
  config: V.VaultConfig | null;
  unlocked: boolean;
}

let state: VaultState = { config: null, unlocked: false };
let key: CryptoKey | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;
let removeHook: (() => void) | null = null;
const listeners = new Set<() => void>();

function setState(patch: Partial<VaultState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
export const vaultState = () => state;
export const useVault = (): VaultState => useSyncExternalStore(subscribe, vaultState, vaultState);

export class VaultLockedError extends Error {
  constructor() {
    super('Unlock your journal to save private entries.');
    this.name = 'VaultLockedError';
  }
}

function touch() {
  clearTimeout(idle);
  idle = setTimeout(lockVault, IDLE_MS);
}

export function lockVault(): void {
  key = null;
  clearTimeout(idle);
  if (state.unlocked) setState({ unlocked: false });
}

const isConfig = (v: unknown): v is V.VaultConfig => !!v && typeof v === 'object' && (v as V.VaultConfig).v === 1 && typeof (v as V.VaultConfig).salt === 'string' && V.isSealed((v as V.VaultConfig).check);

/** Called whenever the synced lock settings change (another device may have turned it on, off, or changed it). */
export function applyVaultConfig(raw: unknown): void {
  const config = isConfig(raw) ? raw : null;
  if (!config) {
    removeHook?.();
    removeHook = null;
    lockVault();
  } else if (!removeHook) removeHook = addWriteHook(sealHook);
  if (state.config && config && state.config.salt !== config.salt) lockVault();
  if (config?.salt !== state.config?.salt || !config !== !state.config) setState({ config });
}

/** Seals the text of private journal entries on the way into the database; unseals it when an entry stops being private. */
export async function sealHook(collection: string, patch: Fields, prev: Rec | undefined): Promise<Fields> {
  if (collection !== 'journal' || !state.config) return patch;
  const id = String(prev?.id ?? patch.id ?? '');
  const isPrivate = 'private' in patch ? !!patch.private : !!prev?.private;
  const wasSealed = V.isSealed(prev?.sealed);
  const hasContent = typeof patch.content === 'string';
  const out: Fields = { ...patch };
  if (isPrivate) {
    let text: string | null = null;
    if (hasContent) text = patch.content as string;
    else if (prev && !wasSealed && typeof prev.content === 'string' && prev.content) text = prev.content; // just made private
    if (text === null) return out;
    if (!text) {
      if (wasSealed) {
        if (!key) delete out.content; // a locked screen never clears what it cannot see
        else out.sealed = null;
      }
      return out;
    }
    if (!key) throw new VaultLockedError();
    out.sealed = await V.seal(key, text, id);
    out.content = '';
    touch();
    return out;
  }
  if (wasSealed) {
    if (!key) throw new VaultLockedError();
    if (!hasContent) out.content = await V.open(key, prev!.sealed as V.Sealed, id);
    out.sealed = null;
    touch();
  }
  return out;
}

export async function unlockVault(passphrase: string): Promise<boolean> {
  if (!state.config) return false;
  const k = await V.unlockVault(state.config, passphrase);
  if (!k) return false;
  key = k;
  touch();
  setState({ unlocked: true });
  return true;
}

/** Read a sealed entry's text; null when locked or when it cannot be opened. */
export async function openSealed(rec: { id: string; sealed?: unknown }): Promise<string | null> {
  if (!key || !V.isSealed(rec.sealed)) return null;
  try {
    const text = await V.open(key, rec.sealed, rec.id);
    touch();
    return text;
  } catch {
    return null;
  }
}

async function journal(): Promise<Rec[]> {
  return (await getDb().records.where('_c').equals('journal').toArray()).filter((r) => !r.deletedAt);
}

/** Rewrites many entries in one transaction, without the hook (the values are already final). */
async function rewrite(rows: { id: string; patch: Fields }[], config: V.VaultConfig | null): Promise<void> {
  const db = getDb();
  const hook = removeHook;
  hook?.();
  removeHook = null;
  try {
    await db.transaction('rw', db.records, async () => {
      for (const r of rows) await update(r.id, r.patch, { silent: true });
      if (config) await upsert('settings', VAULT_ID, { value: config as unknown as Fields });
      else await update(VAULT_ID, { deletedAt: new Date().toISOString() }, { silent: true });
    });
  } finally {
    if (state.config && !removeHook) removeHook = addWriteHook(sealHook);
  }
}

/** Turn the lock on and seal every private entry that is still plain text. Returns how many were sealed. */
export async function setupVault(passphrase: string, iterations?: number): Promise<number> {
  const { config, key: k } = await V.createVault(passphrase, iterations);
  const rows: { id: string; patch: Fields }[] = [];
  for (const r of await journal()) if (r.private && typeof r.content === 'string' && r.content && !V.isSealed(r.sealed)) rows.push({ id: r.id, patch: { sealed: await V.seal(k, r.content, r.id), content: '' } });
  await rewrite(rows, config);
  key = k;
  touch();
  applyVaultConfig(config);
  setState({ unlocked: true });
  return rows.length;
}

/** Re-encrypt every sealed entry under a new passphrase, all or nothing. */
export async function changePassphrase(next: string, iterations?: number): Promise<number> {
  if (!key) throw new VaultLockedError();
  const { config, key: k } = await V.createVault(next, iterations);
  const rows: { id: string; patch: Fields }[] = [];
  for (const r of await journal()) {
    if (!V.isSealed(r.sealed)) continue;
    const text = await V.open(key, r.sealed, r.id);
    rows.push({ id: r.id, patch: { sealed: await V.seal(k, text, r.id) } });
  }
  await rewrite(rows, config);
  key = k;
  touch();
  applyVaultConfig(config);
  return rows.length;
}

/** Turn the lock off: private entries go back to plain text (still hidden behind a tap). */
export async function disableVault(): Promise<number> {
  if (!key) throw new VaultLockedError();
  const rows: { id: string; patch: Fields }[] = [];
  for (const r of await journal()) if (V.isSealed(r.sealed)) rows.push({ id: r.id, patch: { content: await V.open(key, r.sealed, r.id), sealed: null } });
  applyVaultConfig(null);
  await rewrite(rows, null);
  return rows.length;
}
