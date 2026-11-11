import { create } from 'zustand';

/** Captures the browser's install prompt so the app can offer "Install" at a moment the user chooses. */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
export const useInstall = create<{ available: boolean; installed: boolean }>(() => ({ available: false, installed: false }));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    useInstall.setState({ available: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    useInstall.setState({ available: false, installed: true });
  });
  if (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone) useInstall.setState({ installed: true });
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  useInstall.setState({ available: false });
  return outcome;
}

export const isIos = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
