import { create as createStore } from 'zustand';
import { create } from './data/store';

/**
 * Focus timer. State lives outside React and is persisted, so the timer keeps running while you
 * move between modules and survives a reload. Time is derived from timestamps, never from counting
 * ticks, so a throttled background tab cannot make it drift.
 */

export type Phase = 'idle' | 'focus' | 'break';
export interface TimerSettings {
  work: number;
  short: number;
  long: number;
  every: number;
  auto: boolean;
}

interface TimerState {
  phase: Phase;
  kind: 'focus' | 'deep';
  /** planned length of the current phase, minutes */
  planned: number;
  startedAt: number | null;
  endsAt: number | null;
  /** ms left while paused */
  pausedLeft: number | null;
  /** focus phases completed in this cycle */
  cycle: number;
  label: string;
  taskId: string | null;
  /** id of the record for the phase in progress (used by the distraction log) */
  sessionId: string | null;
  now: number;
}

const KEY = 'lifeos.focus';
const initial: TimerState = { phase: 'idle', kind: 'focus', planned: 25, startedAt: null, endsAt: null, pausedLeft: null, cycle: 0, label: '', taskId: null, sessionId: null, now: Date.now() };

function load(): TimerState {
  if (typeof localStorage === 'undefined') return initial;
  try {
    return { ...initial, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<TimerState>), now: Date.now() };
  } catch {
    return initial;
  }
}

export const useFocus = createStore<TimerState>(() => load());
const persist = () => {
  try {
    const { now: _now, ...rest } = useFocus.getState();
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* ignore */
  }
};

let settings: TimerSettings = { work: 25, short: 5, long: 15, every: 4, auto: false };
export const setTimerSettings = (s: TimerSettings) => (settings = s);
let onFinish: ((phase: Phase, minutes: number, next: Phase) => void) | null = null;
export const onTimerFinish = (fn: typeof onFinish) => (onFinish = fn);

export const msLeft = (s: TimerState): number => (s.pausedLeft !== null ? s.pausedLeft : s.endsAt ? Math.max(0, s.endsAt - s.now) : 0);
export const isRunning = (s: TimerState) => s.phase !== 'idle' && s.pausedLeft === null;

function begin(phase: Phase, minutes: number, patch: Partial<TimerState> = {}) {
  const now = Date.now();
  useFocus.setState({ phase, planned: minutes, startedAt: now, endsAt: now + minutes * 60_000, pausedLeft: null, sessionId: phase === 'focus' ? crypto.randomUUID() : null, now, ...patch });
  persist();
}

export function startFocus(opts: { minutes?: number; kind?: 'focus' | 'deep'; label?: string; taskId?: string | null } = {}) {
  begin('focus', opts.minutes ?? settings.work, { kind: opts.kind ?? 'focus', label: opts.label ?? useFocus.getState().label, taskId: opts.taskId ?? null });
}
export function startBreak(minutes?: number) {
  const s = useFocus.getState();
  begin('break', minutes ?? (s.cycle > 0 && s.cycle % settings.every === 0 ? settings.long : settings.short));
}
export function pause() {
  const s = useFocus.getState();
  if (!isRunning(s)) return;
  useFocus.setState({ pausedLeft: msLeft({ ...s, now: Date.now() }), endsAt: null });
  persist();
}
export function resume() {
  const s = useFocus.getState();
  if (s.pausedLeft === null) return;
  useFocus.setState({ endsAt: Date.now() + s.pausedLeft, pausedLeft: null, now: Date.now() });
  persist();
}

/** Record the focus time actually spent (at least one minute) against the session and its task. */
async function record(s: TimerState, minutes: number) {
  if (s.phase !== 'focus' || minutes < 1) return;
  await create('focusSessions', { label: s.label, startedAt: new Date(s.startedAt ?? Date.now()).toISOString(), minutes: Math.round(minutes), planned: s.planned, kind: s.kind, taskId: s.taskId, completed: minutes >= s.planned - 0.5 }, { id: s.sessionId ?? undefined, silent: true });
  if (s.taskId) await create('timeEntries', { title: s.label || 'Focus session', taskId: s.taskId, date: new Date().toISOString().slice(0, 10), minutes: Math.round(minutes) }, { silent: true });
}

/** Stop early: time spent so far is still recorded. */
export async function stop() {
  const s = useFocus.getState();
  const spent = s.planned - msLeft({ ...s, now: Date.now() }) / 60_000;
  useFocus.setState({ ...initial, label: s.label, cycle: s.cycle, now: Date.now() });
  persist();
  await record(s, spent);
}

async function complete() {
  const s = useFocus.getState();
  const finished = s.phase;
  const cycle = finished === 'focus' ? s.cycle + 1 : s.cycle;
  useFocus.setState({ phase: 'idle', startedAt: null, endsAt: null, pausedLeft: null, cycle, now: Date.now() });
  persist();
  await record(s, s.planned);
  const next: Phase = finished === 'focus' ? 'break' : 'focus';
  onFinish?.(finished, s.planned, next);
  if (settings.auto) {
    if (next === 'break') startBreak();
    else startFocus({ kind: s.kind, taskId: s.taskId });
  }
}

export const resetCycle = () => (useFocus.setState({ cycle: 0 }), persist());
export const setFocusLabel = (label: string) => (useFocus.setState({ label }), persist());

if (typeof window !== 'undefined') {
  setInterval(() => {
    const s = useFocus.getState();
    if (s.phase === 'idle' || s.pausedLeft !== null) return;
    const now = Date.now();
    if (s.endsAt && now >= s.endsAt) void complete();
    else useFocus.setState({ now });
  }, 500);
}

export function fmtClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  return `${String(m).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
