import type { ComponentType } from 'react';
import type { ModuleProps } from './Page';

type Loader = () => Promise<{ default: ComponentType<ModuleProps> }>;

/**
 * Lazy module loaders, keyed by registry id. Each module is its own chunk, so the first paint only
 * pays for the shell; `warmModules` later pulls every chunk into the offline cache.
 */
export const LOADERS: Record<string, Loader> = {
  home: () => import('@/modules/home'),
  tasks: () => import('@/modules/tasks'),
  calendar: () => import('@/modules/calendar'),
  projects: () => import('@/modules/projects'),
  notes: () => import('@/modules/notes'),
  habits: () => import('@/modules/habits'),
  goals: () => import('@/modules/goals'),
  finance: () => import('@/modules/finance'),
  learning: () => import('@/modules/learning'),
  health: () => import('@/modules/health'),
  journal: () => import('@/modules/journal'),
  focus: () => import('@/modules/focus'),
  shopping: () => import('@/modules/lifestyle').then((m) => ({ default: m.Shopping })),
  travel: () => import('@/modules/lifestyle').then((m) => ({ default: m.Travel })),
  files: () => import('@/modules/lifestyle').then((m) => ({ default: m.Documents })),
  entertainment: () => import('@/modules/lifestyle').then((m) => ({ default: m.Entertainment })),
  digital: () => import('@/modules/lifestyle').then((m) => ({ default: m.Digital })),
  admin: () => import('@/modules/lifestyle').then((m) => ({ default: m.Admin })),
  utilities: () => import('@/modules/utilities'),
  automation: () => import('@/modules/automation'),
  insights: () => import('@/modules/insights'),
  spatial: () => import('@/modules/spatial'),
  marketplace: () => import('@/modules/marketplace'),
  settings: () => import('@/modules/settings'),
};

/** Fetch every module chunk in the background so all modules open offline. */
export function warmModules(): void {
  const run = async () => {
    for (const load of Object.values(LOADERS)) {
      try {
        await load();
      } catch {
        return; // offline or interrupted — try again on the next start
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(() => void run());
  else setTimeout(() => void run(), 3000);
}
