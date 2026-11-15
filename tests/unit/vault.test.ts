import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LifeDB, setDb } from '@/core/data/db';
import { create, getRec, update, upsert } from '@/core/data/store';
import { VAULT_ID, VaultLockedError, applyVaultConfig, changePassphrase, disableVault, lockVault, openSealed, setupVault, unlockVault, vaultState } from '@/core/data/vault';
import * as V from '@/core/lib/vault';

const FAST = 1_000; // iterations: the real default is 600 000, far too slow for a test run

describe('vault crypto', () => {
  it('round-trips text and refuses a wrong passphrase, a tampered body or a body moved to another record', async () => {
    const { config, key } = await V.createVault('correct horse battery', FAST);
    const sealed = await V.seal(key, 'Dear diary — ✨ unicode too', 'jr:1');
    expect(sealed.ct).not.toContain('diary');
    expect(await V.open(key, sealed, 'jr:1')).toBe('Dear diary — ✨ unicode too');
    await expect(V.open(key, sealed, 'jr:2')).rejects.toBeTruthy();
    const flipped = { ...sealed, ct: V.toB64(V.fromB64(sealed.ct).map((b, i) => (i === 0 ? b ^ 1 : b))) };
    await expect(V.open(key, flipped, 'jr:1')).rejects.toBeTruthy();
    expect(await V.unlockVault(config, 'wrong one')).toBeNull();
    expect(await V.unlockVault(config, 'correct horse battery')).not.toBeNull();
  });

  it('uses a fresh IV for every seal', async () => {
    const { key } = await V.createVault('passphrase!', FAST);
    const a = await V.seal(key, 'same', 'x');
    const b = await V.seal(key, 'same', 'x');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('asks for a passphrase that is long enough', () => {
    expect(V.passphraseProblem('short')).toBeTruthy();
    expect(V.passphraseProblem('password123')).toBeTruthy();
    expect(V.passphraseProblem('purple mango river')).toBeNull();
  });
});

describe('journal lock in the store', () => {
  beforeEach(() => setDb(new LifeDB(`vault-${Math.random()}`)));
  afterEach(() => applyVaultConfig(null));

  it('seals existing private entries when turned on, and new ones as they are written', async () => {
    const secret = await create('journal', { date: '2026-11-15', kind: 'daily', private: true, content: 'Nobody should read this' });
    const open = await create('journal', { date: '2026-11-15', kind: 'gratitude', content: 'Coffee' });
    expect(await setupVault('purple mango river', FAST)).toBe(1);
    const sealed = await getRec(secret.id);
    expect(sealed?.content).toBe('');
    expect(V.isSealed(sealed?.sealed)).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain('Nobody');
    expect((await getRec(open.id))?.content).toBe('Coffee');
    expect(await openSealed(sealed!)).toBe('Nobody should read this');

    const fresh = await create('journal', { date: '2026-11-16', private: true, content: 'Second secret' });
    expect((await getRec(fresh.id))?.content).toBe('');
    expect(await openSealed((await getRec(fresh.id))!)).toBe('Second secret');
    expect(V.isSealed((await getRec(VAULT_ID))?.value && ((await getRec(VAULT_ID))!.value as V.VaultConfig).check)).toBe(true);
  });

  it('refuses to write private text while locked but lets other fields change', async () => {
    const rec = await create('journal', { date: '2026-11-15', private: true, content: 'x' });
    await setupVault('purple mango river', FAST);
    lockVault();
    await expect(update(rec.id, { content: 'new words' })).rejects.toBeInstanceOf(VaultLockedError);
    await expect(create('journal', { private: true, content: 'hello' })).rejects.toBeInstanceOf(VaultLockedError);
    await update(rec.id, { mood: 4 });
    expect((await getRec(rec.id))?.mood).toBe(4);
    // A locked screen sending an empty text never wipes what it could not see.
    await update(rec.id, { content: '' });
    expect(V.isSealed((await getRec(rec.id))?.sealed)).toBe(true);
    expect(await openSealed((await getRec(rec.id))!)).toBeNull();
    expect(await unlockVault('wrong')).toBe(false);
    expect(await unlockVault('purple mango river')).toBe(true);
    expect(await openSealed((await getRec(rec.id))!)).toBe('x');
  });

  it('opens an entry back up when it stops being private', async () => {
    const rec = await create('journal', { private: true, content: 'once secret' });
    await setupVault('purple mango river', FAST);
    await update(rec.id, { private: false });
    const out = await getRec(rec.id);
    expect(out?.content).toBe('once secret');
    expect(out?.sealed).toBeNull();
  });

  it('changes the passphrase for every entry at once, and turns off cleanly', async () => {
    const a = await create('journal', { private: true, content: 'alpha' });
    const b = await create('journal', { private: true, content: 'beta' });
    await setupVault('first passphrase', FAST);
    const before = (await getRec(a.id))!.sealed;
    expect(await changePassphrase('second passphrase', FAST)).toBe(2);
    expect((await getRec(a.id))!.sealed).not.toEqual(before);
    lockVault();
    expect(await unlockVault('first passphrase')).toBe(false);
    expect(await unlockVault('second passphrase')).toBe(true);
    expect(await openSealed((await getRec(b.id))!)).toBe('beta');
    expect(await disableVault()).toBe(2);
    expect(vaultState().config).toBeNull();
    expect((await getRec(a.id))?.content).toBe('alpha');
    expect((await getRec(VAULT_ID))?.deletedAt).toBeTruthy();
    // With the lock off, private entries are written as plain text again.
    const c = await create('journal', { private: true, content: 'plain' });
    expect((await getRec(c.id))?.content).toBe('plain');
  });

  it('a second device that syncs the lock settings starts locked and unlocks with the same passphrase', async () => {
    await setupVault('shared passphrase', FAST);
    const config = (await getRec(VAULT_ID))!.value;
    const entry = await create('journal', { private: true, content: 'from device one' });
    const sealed = (await getRec(entry.id))!;
    applyVaultConfig(null);
    setDb(new LifeDB(`vault-b-${Math.random()}`));
    await upsert('settings', VAULT_ID, { value: config });
    applyVaultConfig(config);
    expect(vaultState()).toMatchObject({ unlocked: false });
    expect(await unlockVault('shared passphrase')).toBe(true);
    expect(await openSealed(sealed)).toBe('from device one');
  });
});
