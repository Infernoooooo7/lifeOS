import { useApp, type Prefs } from '@/core/app';
import { getDb, hasDb, type Rec } from '@/core/data/db';
import { create, getRec, list, onChange, update, type ChangeEvent } from '@/core/data/store';
import { runOnEvent, runOnTick, lastDue, type Effect, type Rule } from '@/core/lib/automation';
import { ymd } from '@/core/lib/dates';
import { dueNotifications, inQuietHours, type DueNotification } from '@/core/lib/reminders';
import { toast } from '@/ui/overlays';

/**
 * Background engines that run while the app is open: reminders and automation rules.
 * Nothing here claims to run while LIFEOS is closed — missed work is caught up on the next start.
 */

let prefs: Prefs | null = null;
export const setEnginePrefs = (p: Prefs) => (prefs = p);

async function showSystemNotification(title: string, body: string, tag: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png' });
    else new Notification(title, { body, tag, icon: '/icons/icon-192.png' });
    return true;
  } catch {
    return false;
  }
}

/** Show a notification now: a system notification when the app is in the background and allowed, otherwise a toast. */
export async function deliver(n: { id: string; title: string; body: string }, budget: { left: number } = { left: 1 }) {
  if (!prefs || inQuietHours(new Date(), prefs.quiet) || budget.left <= 0) return;
  budget.left--;
  const shown = prefs.notify.browser && document.visibilityState !== 'visible' ? await showSystemNotification(n.title, n.body, n.id) : false;
  if (!shown) toast(`${n.title}${n.body ? `: ${n.body}` : ''}`, { icon: 'bell' });
}

/** Create inbox entries for everything that has become due. Ids are deterministic, so this is idempotent. */
export async function runReminders(): Promise<void> {
  if (!hasDb() || !prefs || !prefs.onboarded) return;
  const [tasks, events, habits, habitLogs, subscriptions, dates, files, licenses, maintenance] = await Promise.all(
    ['tasks', 'events', 'habits', 'habitLogs', 'subscriptions', 'dates', 'files', 'licenses', 'maintenance'].map((c) => list(c)),
  );
  const due = dueNotifications({ tasks, events, habits, habitLogs, subscriptions, dates, files, licenses, maintenance }, new Date(), prefs.notify);
  const budget = { left: 3 }; // never flood: at most three pop-ups per pass, the rest wait in the inbox
  for (const n of due) {
    if (await getRec(n.id)) continue;
    await create('notifications', { title: n.title, body: n.body, kind: n.kind, source: n.source, sourceId: n.sourceId, dueAt: n.dueAt } satisfies Omit<DueNotification, 'id'>, { id: n.id, silent: true });
    await deliver(n, budget);
  }
}

async function apply(effects: Effect[], idPrefix: string | null): Promise<void> {
  let i = 0;
  for (const fx of effects) {
    const id = idPrefix ? `${idPrefix}:${i++}` : undefined;
    if (id && (await getRec(id))) continue; // already produced (possibly by another device)
    if (fx.type === 'create') await create(fx.collection, fx.data, { silent: true, id });
    else if (fx.type === 'update') await update(fx.id, fx.patch, { silent: true });
    else if (fx.type === 'notify') {
      const rec = await create('notifications', { title: fx.title, body: fx.body, kind: 'automation', source: fx.source ?? null, sourceId: fx.sourceId ?? null, dueAt: new Date().toISOString() }, { silent: true, id });
      await deliver({ id: rec.id, title: fx.title, body: fx.body }, { left: 1 });
    }
  }
}

const asRule = (r: Rec): Rule => ({ id: r.id, name: r.name, enabled: r.enabled !== false, trigger: r.trigger, conditions: r.conditions ?? [], actions: r.actions ?? [], lastRunAt: r.lastRunAt });

async function markRun(rule: Rule, summary: string) {
  const rec = await getRec(rule.id);
  if (!rec) return;
  const log = [{ at: new Date().toISOString(), summary }, ...((rec.log as { at: string; summary: string }[]) ?? [])].slice(0, 15);
  await update(rule.id, { lastRunAt: new Date().toISOString(), runCount: (rec.runCount ?? 0) + 1, log }, { silent: true });
}

async function onRecordChange(event: ChangeEvent) {
  // Changes made by rules and imports are silent, which also prevents rules from triggering each other in a loop.
  if (event.silent || !hasDb()) return;
  if (['automations', 'notifications', 'activity', 'settings', 'modulePrefs'].includes(event.rec._c)) return;
  const rules = (await list('automations')).map(asRule);
  if (!rules.length) return;
  for (const { rule, effects } of runOnEvent(rules, { kind: event.kind, collection: event.rec._c, rec: event.rec, prev: event.prev })) {
    await apply(effects, null);
    await markRun(rule, `Ran for “${String(event.rec.title ?? event.rec.name ?? event.rec._c)}”`);
  }
}

export async function runAutomationTick(): Promise<void> {
  if (!hasDb() || !prefs?.onboarded) return;
  const rules = (await list('automations')).map(asRule);
  if (!rules.length) return;
  const db = getDb();
  const now = new Date();
  const firedRow = (await db.meta.get('autoFired'))?.value as Record<string, string> | undefined;
  const firedMap = firedRow ?? {};
  const today = ymd(now);
  const collections = [...new Set(rules.map((r) => (r.trigger.type === 'dateField' ? r.trigger.collection : null)).filter((c): c is string => !!c))];
  const data = new Map(await Promise.all(collections.map(async (c) => [c, await list(c)] as const)));
  const runs = runOnTick(rules, now, (c) => data.get(c) ?? [], new Set(Object.keys(firedMap)));
  for (const run of runs) {
    const slot = run.rule.trigger.type === 'schedule' ? lastDue(run.rule.trigger, now).toISOString() : null;
    await apply(run.effects, `auto:${run.key ?? `${run.rule.id}:${slot}`}`);
    if (run.key) firedMap[run.key] = today;
    await markRun(run.rule, run.key ? 'Ran for a dated record' : 'Scheduled run');
  }
  if (runs.length) {
    for (const [k, day] of Object.entries(firedMap)) if (day < ymd(new Date(now.getTime() - 14 * 86_400_000))) delete firedMap[k];
    await db.meta.put({ key: 'autoFired', value: firedMap });
  }
}

let started = false;
export function startEngines(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  onChange((e) => void onRecordChange(e).catch((err) => console.error('automation failed', err)));
  const tick = () => {
    if (!useApp.getState().ready) return;
    void runReminders().catch((e) => console.error('reminders failed', e));
    void runAutomationTick().catch((e) => console.error('automation tick failed', e));
  };
  setTimeout(tick, 4000);
  setInterval(tick, 60_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());
}

/** Ask for notification permission — only ever called from an explicit user action. */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}
