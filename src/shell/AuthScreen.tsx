'use client';

import { useEffect, useState } from 'react';
import { LifeDB, fieldsOf, searchText } from '@/core/data/db';
import { ApiError, accountIdentity, api, writeIdentity, type AccountUser, type Identity } from '@/core/data/session';
import { Icon } from '@/ui/icons';
import { Button, Field, Tabs } from '@/ui/kit';

type Mode = 'signin' | 'register' | 'reset';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="0.55" stopColor="#60a5fa" /><stop offset="1" stopColor="#a78bfa" /></linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0d1017" />
      <circle cx="32" cy="32" r="17" fill="none" stroke="url(#lg-a)" strokeWidth="4.5" strokeDasharray="78 29" strokeLinecap="round" transform="rotate(-50 32 32)" />
      <circle cx="32" cy="32" r="6.5" fill="url(#lg-a)" />
      <circle cx="47.5" cy="20" r="3.2" fill="#a78bfa" />
    </svg>
  );
}

/** Copy records created in local-only mode into a freshly signed-in account's database. */
export async function localItemCount(): Promise<number> {
  try {
    if (!(await LifeDB.exists('lifeos-local'))) return 0;
    const db = new LifeDB('lifeos-local');
    const n = await db.records.count();
    db.close();
    return n;
  } catch {
    return 0;
  }
}
export async function adoptLocalData(userId: string): Promise<number> {
  const local = new LifeDB('lifeos-local');
  const target = new LifeDB(`lifeos-${userId}`);
  const rows = await local.records.toArray();
  const now = Date.now();
  await target.records.bulkPut(rows.map((r) => ({ ...r, _dirty: 1 as const, _base: null, _seq: undefined, _ua: now, _s: searchText(fieldsOf(r)) })));
  const blobs = await local.blobs.toArray();
  if (blobs.length) await target.blobs.bulkPut(blobs);
  await local.records.clear();
  await local.blobs.clear();
  local.close();
  target.close();
  return rows.length;
}

export function AuthScreen({ initialMode = 'signin', onDone }: { initialMode?: Mode; onDone: (identity: Identity) => void }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ code: string; user?: AccountUser } | null>(null);
  const [localCount, setLocalCount] = useState(0);
  const [bring, setBring] = useState(true);
  const [emailReset, setEmailReset] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    if (t) {
      setToken(t);
      setMode('reset');
    }
    void localItemCount().then(setLocalCount);
    void api<{ email: boolean }>('health').then((h) => setEmailReset(!!h.email)).catch(() => undefined);
  }, []);

  const finish = async (user: AccountUser) => {
    if (bring && localCount > 0) await adoptLocalData(user.id).catch(() => undefined);
    const identity = accountIdentity(user);
    writeIdentity(identity);
    if (window.location.pathname.startsWith('/reset')) window.location.href = '/app';
    else onDone(identity);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        const res = await api<{ user: AccountUser }>('auth/login', { body: { email, password } });
        await finish(res.user);
      } else if (mode === 'register') {
        const res = await api<{ user: AccountUser; recoveryCode: string }>('auth/register', { body: { email, password, name } });
        setIssued({ code: res.recoveryCode, user: res.user });
      } else if (token) {
        await api('auth/reset/confirm', { body: { token, password } });
        setInfo('Password changed. You can sign in now.');
        setToken(null);
        setMode('signin');
        setPassword('');
      } else if (code) {
        const res = await api<{ recoveryCode: string }>('auth/reset/confirm', { body: { email, recoveryCode: code, password } });
        setIssued({ code: res.recoveryCode });
      } else {
        const res = await api<{ emailDelivery: boolean }>('auth/reset/request', { body: { email } });
        setInfo(res.emailDelivery ? 'If that address has an account, a reset link is on its way.' : 'This deployment has no e-mail delivery. Use your recovery code instead.');
      }
    } catch (e) {
      setError(e instanceof ApiError ? (e.offline ? 'You are offline. You can still use LIFEOS on this device without an account.' : e.message) : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const local = () => {
    const identity: Identity = { mode: 'local' };
    writeIdentity(identity);
    onDone(identity);
  };

  return (
    <main className="app-canvas grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={44} />
          <div>
            <div className="font-display text-2xl font-semibold tracking-tight">LIFEOS</div>
            <div className="text-sm text-muted">Everything in your life. One intelligent workspace.</div>
          </div>
        </div>

        {issued ? (
          <div className="glass p-5">
            <h1 className="text-lg font-semibold">Save your recovery code</h1>
            <p className="mt-1 text-sm text-muted">This is the only way to reset your password without e-mail. It is shown once — store it in your password manager.</p>
            <div className="num my-4 select-all rounded-xl border border-line-strong bg-surface-2 px-3 py-3 text-center text-lg tracking-wider" data-testid="recovery-code">{issued.code}</div>
            <div className="flex gap-2">
              <Button icon="copy" className="flex-1" onClick={() => void navigator.clipboard?.writeText(issued.code)}>Copy</Button>
              <Button variant="primary" className="flex-1" onClick={() => (issued.user ? void finish(issued.user) : (setIssued(null), setMode('signin'), setCode(''), setPassword(''), setInfo('Password changed. Sign in with your new password.')))}>I have saved it</Button>
            </div>
          </div>
        ) : (
          <div className="glass p-5">
            <Tabs
              className="mb-4" value={mode} onChange={(m) => { setMode(m); setError(null); setInfo(null); }}
              tabs={[{ value: 'signin', label: 'Sign in' }, { value: 'register', label: 'Create account' }, { value: 'reset', label: 'Reset' }]}
            />
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              {mode === 'register' && <Field label="Name"><input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" /></Field>}
              {!(mode === 'reset' && token) && <Field label="E-mail"><input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>}
              {mode === 'reset' && !token && <Field label="Recovery code" hint={emailReset ? 'Leave empty to get a reset link by e-mail instead.' : 'The code you saved when you created the account.'}><input className="input num uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autoComplete="off" /></Field>}
              {(mode !== 'reset' || token || code) && (
                <Field label={mode === 'reset' ? 'New password' : 'Password'} hint={mode !== 'signin' ? 'At least 10 characters.' : undefined}>
                  <input className="input" type="password" required minLength={mode === 'signin' ? 1 : 10} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
              )}
              {mode !== 'reset' && localCount > 0 && (
                <label className="flex items-start gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                  <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={bring} onChange={(e) => setBring(e.target.checked)} />
                  <span>Bring the {localCount} item{localCount === 1 ? '' : 's'} saved on this device into my account</span>
                </label>
              )}
              {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad"><Icon name="warning" size={16} className="mt-0.5 flex-none" />{error}</p>}
              {info && <p role="status" className="rounded-xl bg-accent-soft px-3 py-2 text-sm">{info}</p>}
              <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'register' ? 'Create account' : token || code ? 'Set new password' : 'Send reset link'}
              </Button>
            </form>
            <div className="my-4 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
            <Button className="w-full" icon="drive" onClick={local}>Use on this device without an account</Button>
            <p className="mt-2 text-center text-xs text-faint">Local mode keeps everything in this browser. You can create an account later and bring your data along.</p>
          </div>
        )}
      </div>
    </main>
  );
}
