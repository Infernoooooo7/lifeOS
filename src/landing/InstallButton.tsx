'use client';

import { useEffect, useState } from 'react';
import { isIos, promptInstall, useInstall } from '@/core/install';

/**
 * Registers the service worker from the landing page as well (so a first visit already prepares the offline copy)
 * and offers "Install app" as soon as the browser allows it. iPhone and iPad have no install prompt: they get the
 * Share → Add to Home Screen tip instead.
 */
export function InstallButton() {
  const { available, installed } = useInstall();
  const [ios, setIos] = useState(false);
  const [tip, setTip] = useState(false);
  useEffect(() => {
    setIos(isIos());
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  if (installed || (!available && !ios)) return null;
  return (
    <span className="relative">
      <button type="button" className="btn max-sm:!px-3" onClick={() => (available ? void promptInstall() : setTip((t) => !t))} aria-expanded={ios ? tip : undefined}>
        Install app
      </button>
      {tip && (
        <span role="status" className="absolute left-1/2 top-full z-40 mt-3 w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-[var(--glass-line)] bg-[var(--solid)] px-3.5 py-2.5 text-sm text-muted shadow-[var(--panel-shadow)]">
          In Safari, tap <b className="text-text">Share</b>, then <b className="text-text">Add to Home Screen</b>. LIFEOS then opens like an app and works offline.
        </span>
      )}
    </span>
  );
}
