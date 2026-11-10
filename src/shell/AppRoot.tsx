'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/core/app';
import { singular } from '@/core/collections';
import { dbNameFor, openDb } from '@/core/data/db';
import { ApiError, api, readIdentity, type Identity } from '@/core/data/session';
import { ctx } from '@/core/data/store';
import { startSync, stopSync } from '@/core/data/syncClient';
import { OverlayHost } from '@/ui/overlays';
import { AuthScreen, Logo } from './AuthScreen';
import { startEngines } from './engines';
import { Shell } from './Shell';

const wsKey = (identity: Identity) => `lifeos.ws.${dbNameFor(identity)}`;

/** Open the identity's database and start background work. Never touches the network synchronously. */
export function startSession(identity: Identity): void {
  openDb(dbNameFor(identity));
  let ws = 'personal';
  try {
    ws = localStorage.getItem(wsKey(identity)) || 'personal';
  } catch {
    /* storage unavailable */
  }
  ctx.ws = ws;
  ctx.label = singular;
  useApp.setState({ identity, ws, ready: true });
  startEngines();
  if (identity.mode === 'account') {
    startSync();
    // The cached identity lets the app open offline; the session itself is verified in the background.
    api('auth/me').catch((e) => {
      if (e instanceof ApiError && e.status === 401) stopSync('signed-out');
    });
  } else stopSync('local');
}

export function switchWorkspace(ws: string): void {
  const { identity } = useApp.getState();
  ctx.ws = ws;
  useApp.setState({ ws });
  try {
    if (identity) localStorage.setItem(wsKey(identity), ws);
  } catch {
    /* ignore */
  }
}

export function Splash() {
  return (
    <div className="app-canvas grid min-h-dvh place-items-center" aria-busy="true" aria-label="Loading LIFEOS">
      <div className="flex flex-col items-center gap-4">
        <span className="pulse-soft"><Logo size={56} /></span>
        <span className="font-display text-sm tracking-[0.3em] text-faint">LIFEOS</span>
      </div>
    </div>
  );
}

export function AppRoot({ authMode }: { authMode?: 'reset' }) {
  const identity = useApp((s) => s.identity);
  const ready = useApp((s) => s.ready);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const saved = authMode === 'reset' ? null : readIdentity();
    if (saved) startSession(saved);
    setBooted(true);
    const online = () => useApp.setState({ online: navigator.onLine });
    online();
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
    };
  }, [authMode]);

  // Server HTML and first client render are the same splash, whatever the URL — this is what lets
  // one cached document serve every /app/* route offline.
  if (!booted) return <Splash />;
  if (!identity || authMode === 'reset') {
    return (
      <>
        <AuthScreen initialMode={authMode === 'reset' ? 'reset' : 'signin'} onDone={startSession} />
        <OverlayHost />
      </>
    );
  }
  if (!ready) return <Splash />;
  return <Shell />;
}
