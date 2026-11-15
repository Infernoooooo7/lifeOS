'use client';

import { useEffect, useState } from 'react';
import { useRecord } from '@/core/data/hooks';
import { VAULT_ID, applyVaultConfig, changePassphrase, disableVault, lockVault, openSealed, setupVault, unlockVault, useVault } from '@/core/data/vault';
import { isSealed, passphraseProblem } from '@/core/lib/vault';
import { Icon } from './icons';
import { Button } from './kit';
import { confirmDialog, promptDialog, toast } from './overlays';

/** Keeps the in-memory lock state in step with the synced lock settings (mounted once in the shell). */
export function VaultSync() {
  const rec = useRecord(VAULT_ID);
  useEffect(() => {
    if (rec === undefined) return;
    applyVaultConfig(rec && !rec.deletedAt ? rec.value : null);
  }, [rec]);
  return null;
}

/** Ask for the passphrase until it is right or the person cancels. */
export async function askUnlock(): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const p = await promptDialog({
      title: 'Unlock journal', secret: true, confirmLabel: 'Unlock', placeholder: 'Journal passphrase',
      body: attempt ? 'That passphrase did not open your journal. Try again.' : 'Private entries are encrypted on this device. Enter your journal passphrase to read and write them.',
    });
    if (p === null) return false;
    if (await unlockVault(p)) return true;
  }
  toast('Still locked. Check the passphrase and try again.', { tone: 'bad' });
  return false;
}

/** The text of an entry, decrypted when it is sealed and the journal is unlocked. */
export function useEntryText(rec: { id: string; sealed?: unknown; content?: unknown } | null | undefined): { text: string; locked: boolean; ready: boolean } {
  const { unlocked } = useVault();
  const sealed = rec && isSealed(rec.sealed) ? rec.sealed : null;
  const [opened, setOpened] = useState<{ ct: string; text: string | null } | null>(null);
  useEffect(() => {
    if (!sealed || !unlocked || !rec) return;
    let live = true;
    void openSealed(rec).then((text) => live && setOpened({ ct: sealed.ct, text }));
    return () => {
      live = false;
    };
  }, [sealed, unlocked, rec]);
  if (!rec) return { text: '', locked: false, ready: true };
  if (!sealed) return { text: String(rec.content ?? ''), locked: false, ready: true };
  if (!unlocked) return { text: '', locked: true, ready: true };
  const current = opened?.ct === sealed.ct ? opened : null;
  return { text: current?.text ?? '', locked: false, ready: !!current };
}

export function LockedEntry({ compact }: { compact?: boolean }) {
  return (
    <div className={compact ? 'flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm' : 'flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center'}>
      <Icon name="lock" size={compact ? 16 : 22} className="flex-none text-accent" />
      <span className={compact ? 'min-w-0 flex-1 text-muted' : 'max-w-sm text-sm text-muted'}>This entry is encrypted. Unlock your journal to read or change it.</span>
      <Button size="sm" variant={compact ? 'default' : 'primary'} icon="lock" onClick={() => void askUnlock()}>Unlock</Button>
    </div>
  );
}

async function askNewPassphrase(title: string): Promise<string | null> {
  for (;;) {
    const p = await promptDialog({ title, secret: true, confirmLabel: 'Next', placeholder: 'New passphrase', body: 'A few words together is easy to remember and hard to guess. It is never stored or sent anywhere — if you forget it, your private entries cannot be recovered, by you or by us.' });
    if (p === null) return null;
    const problem = passphraseProblem(p);
    if (problem) {
      toast(problem, { tone: 'bad' });
      continue;
    }
    const again = await promptDialog({ title: 'Type it once more', secret: true, confirmLabel: 'Confirm', placeholder: 'Same passphrase' });
    if (again === null) return null;
    if (again === p) return p;
    toast('The two passphrases did not match.', { tone: 'bad' });
  }
}

/** Settings card: turn the lock on, unlock, lock now, change the passphrase, or turn it off. */
export function JournalLockCard() {
  const { config, unlocked } = useVault();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong.', { tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  const turnOn = () => run(async () => {
    const p = await askNewPassphrase('Choose a journal passphrase');
    if (!p) return;
    const n = await setupVault(p);
    toast(n ? `Journal lock is on. ${n} private ${n === 1 ? 'entry' : 'entries'} encrypted.` : 'Journal lock is on. Mark an entry private to encrypt it.', { tone: 'good' });
  });
  const change = () => run(async () => {
    if (!unlocked && !(await askUnlock())) return;
    const p = await askNewPassphrase('Choose a new passphrase');
    if (!p) return;
    await changePassphrase(p);
    toast('Passphrase changed. Your other devices will ask for the new one.', { tone: 'good' });
  });
  const turnOff = () => run(async () => {
    if (!unlocked && !(await askUnlock())) return;
    if (!(await confirmDialog({ title: 'Turn off journal lock?', body: 'Private entries will be stored as plain text again — still hidden behind a tap, but readable by anyone with access to your account or this device.', confirmLabel: 'Turn off', danger: true }))) return;
    const n = await disableVault();
    toast(`Journal lock is off. ${n} ${n === 1 ? 'entry' : 'entries'} decrypted.`);
  });
  return (
    <div className="card space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid size-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent"><Icon name="lock" size={18} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-sans text-[0.95rem] font-semibold tracking-normal">Journal lock</h3>
          <p className="text-sm text-muted">
            {config
              ? unlocked ? 'On and unlocked on this device. It locks again after 15 idle minutes or when you reload.' : 'On. Private entries are encrypted; unlock to read them on this device.'
              : 'Encrypt private journal entries with a passphrase only you know. The text is encrypted on your device before it is saved or synced; dates and moods stay readable so your charts keep working.'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!config && <Button variant="primary" icon="lock" disabled={busy} onClick={() => void turnOn()}>Turn on journal lock</Button>}
        {config && !unlocked && <Button variant="primary" icon="lock" disabled={busy} onClick={() => void askUnlock()}>Unlock</Button>}
        {config && unlocked && <Button icon="lock" disabled={busy} onClick={lockVault}>Lock now</Button>}
        {config && <Button disabled={busy} onClick={() => void change()}>Change passphrase</Button>}
        {config && <Button variant="ghost" disabled={busy} onClick={() => void turnOff()}>Turn off</Button>}
      </div>
    </div>
  );
}
