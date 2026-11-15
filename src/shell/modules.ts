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
  people: () => import('@/modules/people'),
  meals: () => import('@/modules/meals'),
  utilities: () => import('@/modules/utilities'),
  automation: () => import('@/modules/automation'),
  insights: () => import('@/modules/insights'),
  spatial: () => import('@/modules/spatial'),
  marketplace: () => import('@/modules/marketplace'),
  settings: () => import('@/modules/settings'),
};

/** The modules most needed offline are cached first (Settings shows what is waiting to sync). */
const FIRST = ['settings', 'home', 'tasks', 'calendar', 'notes', 'journal'];

/** Fetch every module chunk in the background, three at a time, so all modules open offline within seconds. */
export function warmModules(): void {
  const queue = Object.entries(LOADERS)
    .sort(([a], [b]) => (FIRST.includes(b) ? 1 : 0) - (FIRST.includes(a) ? 1 : 0) || FIRST.indexOf(a) - FIRST.indexOf(b))
    .map(([, load]) => load);
  let stopped = false;
  const worker = async () => {
    while (!stopped && queue.length) {
      try {
        await queue.shift()!();
      } catch {
        stopped = true; // offline or interrupted — try again on the next start
      }
      await new Promise((r) => setTimeout(r, 40));
    }
  };
  const run = () => void Promise.all([worker(), worker(), worker()]);
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(run, { timeout: 2000 });
  else setTimeout(run, 1500);
}
