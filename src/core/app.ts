import { create } from 'zustand';
import type { Identity } from './data/session';
import type { Fields } from './sync/merge';

/** UI state shared across the shell. Data lives in IndexedDB, not here. */

export const BASE = '/app';

export interface EditorRequest {
  collection: string;
  id?: string;
  defaults?: Fields;
}

interface AppState {
  identity: Identity | null;
  ready: boolean;
  /** active workspace id */
  ws: string;
  /** path inside the app, e.g. "/tasks/board" */
  path: string;
  palette: boolean;
  capture: { open: boolean; kind?: string };
  notifications: boolean;
  launcher: boolean;
  editor: EditorRequest | null;
  shortcuts: boolean;
  online: boolean;
  updateReady: boolean;
}

const initialPath = () => {
  if (typeof window === 'undefined') return '/';
  const p = window.location.pathname;
  return p.startsWith(BASE) ? p.slice(BASE.length) || '/' : '/';
};

export const useApp = create<AppState>(() => ({
  identity: null, ready: false, ws: 'personal', path: initialPath(), palette: false, capture: { open: false }, notifications: false, launcher: false,
  editor: null, shortcuts: false, online: true, updateReady: false,
}));

/**
 * Client-side navigation through the History API. The whole app is one cached document, so moving
 * between modules never needs the network.
 */
export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const clean = path.startsWith('/') ? path : `/${path}`;
  const url = BASE + (clean === '/' ? '' : clean);
  if (typeof window !== 'undefined' && window.location.pathname !== url) {
    if (opts.replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  }
  useApp.setState({ path: clean, launcher: false, palette: false });
  if (typeof window !== 'undefined') document.getElementById('main-scroll')?.scrollTo({ top: 0 });
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => useApp.setState({ path: initialPath() }));
}

export const usePath = () => useApp((s) => s.path);
/** ["tasks", "board"] for "/tasks/board" */
export const useSegments = (): string[] => {
  const path = usePath();
  return path.split('/').filter(Boolean).map(decodeURIComponent);
};

export const openEditor = (collection: string, id?: string, defaults?: Fields) => useApp.setState({ editor: { collection, id, defaults } });
export const closeEditor = () => useApp.setState({ editor: null });
export const openCapture = (kind?: string) => useApp.setState({ capture: { open: true, kind }, palette: false, launcher: false });

// ── Preferences ──────────────────────────────────────────────────────────────────────────────────

export interface Prefs {
  theme: 'dark' | 'light' | 'system';
  accentHue: number;
  density: 'compact' | 'default' | 'comfortable';
  motion: 'full' | 'reduced';
  widgetStyle: 'glass' | 'solid' | 'outline';
  weekStart: 0 | 1;
  hour12: boolean;
  dateStyle: 'dmy' | 'mdy' | 'ymd';
  currency: string;
  /** which interface opens on Home */
  mode: 'standard' | 'spatial';
  spatialQuality: 'auto' | 'low' | 'high';
  /** module ids in sidebar order; modules not listed follow in registry order */
  sidebar: string[];
  sidebarCollapsed: boolean;
  rightPanel: boolean;
  /** two module ids shown in the mobile tab bar beside Home, Capture and More */
  mobileTabs: string[];
  quickActions: string[];
  onboarded: boolean;
  interests: string[];
  notify: { tasks: boolean; events: boolean; habits: boolean; renewals: boolean; dates: boolean; browser: boolean; asked: boolean; eventLead: number; leadDays: number };
  quiet: { enabled: boolean; from: string; to: string };
  /** preferred view per module/collection */
  views: Record<string, string>;
  workHours: { from: string; to: string };
  waterTarget: number;
  focus: { work: number; short: number; long: number; every: number; goal: number; auto: boolean };
  rates: Record<string, number>;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'dark', accentHue: 215, density: 'default', motion: 'full', widgetStyle: 'glass', weekStart: 1, hour12: true, dateStyle: 'dmy', currency: 'INR',
  mode: 'standard', spatialQuality: 'auto', sidebar: [], sidebarCollapsed: false, rightPanel: true, mobileTabs: ['tasks', 'calendar'],
  quickActions: ['task', 'note', 'event', 'expense'], onboarded: false, interests: [],
  notify: { tasks: true, events: true, habits: true, renewals: true, dates: true, browser: false, asked: false, eventLead: 15, leadDays: 3 },
  quiet: { enabled: false, from: '22:00', to: '07:00' }, views: {}, workHours: { from: '09:00', to: '18:00' }, waterTarget: 2000,
  focus: { work: 25, short: 5, long: 15, every: 4, goal: 120, auto: false }, rates: {},
};

export const ACCENTS = [
  { name: 'Azure', hue: 215 }, { name: 'Cyan', hue: 200 }, { name: 'Violet', hue: 290 }, { name: 'Indigo', hue: 265 },
  { name: 'Emerald', hue: 160 }, { name: 'Amber', hue: 75 }, { name: 'Coral', hue: 25 }, { name: 'Rose', hue: 350 },
];
