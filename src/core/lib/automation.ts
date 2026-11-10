import type { Fields } from '@/core/sync/merge';
import { addDays, parseDate, ymd } from './dates';

/**
 * Automation rules: WHEN a trigger fires, IF all conditions hold, THEN run actions.
 * This module is pure (no storage, no clock) so rules are testable; the runner in the app shell
 * feeds it change events and time ticks and executes the resulting effects.
 */

export type Trigger =
  | { type: 'created'; collection: string }
  | { type: 'updated'; collection: string; field?: string }
  | { type: 'status'; collection: string; to: string }
  | { type: 'schedule'; every: 'day' | 'week' | 'month'; at?: string; weekday?: number; day?: number }
  | { type: 'dateField'; collection: string; field: string; offsetDays: number };

export interface Condition {
  field: string;
  op: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'empty' | 'notEmpty';
  value?: unknown;
}

export type Action =
  | { type: 'create'; collection: string; data: Fields }
  | { type: 'update'; patch: Fields }
  | { type: 'addTag'; tag: string }
  | { type: 'notify'; title: string; body?: string };

export interface Rule {
  id: string;
  name?: string;
  enabled?: boolean;
  trigger: Trigger;
  conditions?: Condition[];
  actions: Action[];
  lastRunAt?: string | null;
}

export interface RecordEvent {
  kind: 'create' | 'update' | 'delete' | 'restore';
  collection: string;
  rec: Fields & { id: string };
  prev?: Fields;
}

export type Effect =
  | { type: 'create'; collection: string; data: Fields }
  | { type: 'update'; id: string; patch: Fields }
  | { type: 'notify'; title: string; body: string; source?: string; sourceId?: string };

const str = (v: unknown) => (v == null ? '' : Array.isArray(v) ? v.join(',') : String(v));

export function matches(conditions: Condition[] | undefined, rec: Fields): boolean {
  return (conditions ?? []).every((c) => {
    const v = rec[c.field];
    switch (c.op) {
      case 'eq': return str(v) === str(c.value);
      case 'neq': return str(v) !== str(c.value);
      case 'contains': return Array.isArray(v) ? v.map(String).includes(str(c.value)) : str(v).toLowerCase().includes(str(c.value).toLowerCase());
      case 'gt': return Number(v) > Number(c.value);
      case 'lt': return Number(v) < Number(c.value);
      case 'empty': return v == null || v === '' || (Array.isArray(v) && !v.length);
      case 'notEmpty': return !(v == null || v === '' || (Array.isArray(v) && !v.length));
    }
  });
}

/** Does a record change fire this rule's trigger? */
export function triggered(trigger: Trigger, event: RecordEvent): boolean {
  if (trigger.type === 'schedule' || trigger.type === 'dateField') return false;
  if (trigger.collection !== event.collection) return false;
  if (trigger.type === 'created') return event.kind === 'create';
  if (event.kind !== 'update') return false;
  if (trigger.type === 'updated') return trigger.field ? str(event.prev?.[trigger.field]) !== str(event.rec[trigger.field]) : true;
  return str(event.rec.status) === trigger.to && str(event.prev?.status) !== trigger.to;
}

/** `{{field}}` placeholders, plus {{today}} and {{today+N}}. */
export function fill(template: unknown, rec: Fields, now: Date): unknown {
  if (typeof template === 'string') {
    return template.replace(/\{\{\s*([\w+.-]+)\s*\}\}/g, (_, key: string) => {
      const m = /^today(?:\+(\d+))?$/.exec(key);
      if (m) return ymd(addDays(now, Number(m[1] ?? 0)));
      return str(rec[key]);
    });
  }
  if (Array.isArray(template)) return template.map((t) => fill(t, rec, now));
  if (template && typeof template === 'object') return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, fill(v, rec, now)]));
  return template;
}

/** Turn a rule's actions into effects for a given subject record. */
export function effects(rule: Rule, subject: (Fields & { id?: string }) | null, now: Date, collection?: string): Effect[] {
  const rec = subject ?? {};
  const out: Effect[] = [];
  for (const action of rule.actions) {
    switch (action.type) {
      case 'create':
        out.push({ type: 'create', collection: action.collection, data: fill(action.data, rec, now) as Fields });
        break;
      case 'update':
        if (subject?.id) out.push({ type: 'update', id: subject.id, patch: fill(action.patch, rec, now) as Fields });
        break;
      case 'addTag':
        if (subject?.id) {
          const tags = Array.isArray(rec.tags) ? (rec.tags as string[]) : [];
          if (!tags.includes(action.tag)) out.push({ type: 'update', id: subject.id, patch: { tags: [...tags, action.tag] } });
        }
        break;
      case 'notify':
        out.push({ type: 'notify', title: String(fill(action.title, rec, now)), body: String(fill(action.body ?? '', rec, now)), source: collection, sourceId: subject?.id });
        break;
    }
  }
  return out;
}

export function runOnEvent(rules: Rule[], event: RecordEvent, now: Date = new Date()): { rule: Rule; effects: Effect[] }[] {
  const out: { rule: Rule; effects: Effect[] }[] = [];
  for (const rule of rules) {
    if (rule.enabled === false || !triggered(rule.trigger, event) || !matches(rule.conditions, event.rec)) continue;
    out.push({ rule, effects: effects(rule, event.rec, now, event.collection) });
  }
  return out;
}

/** The most recent moment a schedule trigger was due at or before `now`. */
export function lastDue(trigger: Extract<Trigger, { type: 'schedule' }>, now: Date): Date {
  const [h, m] = (trigger.at ?? '09:00').split(':').map(Number);
  const at = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0);
  if (trigger.every === 'day') {
    const today = at(now);
    return today <= now ? today : at(addDays(now, -1));
  }
  if (trigger.every === 'week') {
    const weekday = trigger.weekday ?? 1;
    for (let i = 0; i < 8; i++) {
      const d = at(addDays(now, -i));
      if (d.getDay() === weekday && d <= now) return d;
    }
  }
  const day = Math.min(Math.max(trigger.day ?? 1, 1), 28);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), day, h || 0, m || 0);
  return thisMonth <= now ? thisMonth : new Date(now.getFullYear(), now.getMonth() - 1, day, h || 0, m || 0);
}

/**
 * Rules due on a time tick. Schedule rules fire once per due slot (missed slots while the app was
 * closed fire once on return, not once per missed slot). Date rules fire once per record per date.
 * `fired` holds keys of date-rule firings that already happened.
 */
export function runOnTick(
  rules: Rule[],
  now: Date,
  records: (collection: string) => (Fields & { id: string })[],
  fired: Set<string>,
): { rule: Rule; effects: Effect[]; key?: string }[] {
  const out: { rule: Rule; effects: Effect[]; key?: string }[] = [];
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    const t = rule.trigger;
    if (t.type === 'schedule') {
      const due = lastDue(t, now);
      const last = rule.lastRunAt ? new Date(rule.lastRunAt) : null;
      if (!last || last < due) out.push({ rule, effects: effects(rule, null, now) });
    } else if (t.type === 'dateField') {
      for (const rec of records(t.collection)) {
        const date = parseDate(rec[t.field]);
        if (!date || rec.deletedAt) continue;
        const fireOn = ymd(addDays(date, -t.offsetDays));
        const key = `${rule.id}:${rec.id}:${fireOn}`;
        if (fireOn === ymd(now) && !fired.has(key) && matches(rule.conditions, rec)) out.push({ rule, effects: effects(rule, rec, now, t.collection), key });
      }
    }
  }
  return out;
}

export function describeTrigger(t: Trigger, label: (c: string) => string = (c) => c): string {
  switch (t.type) {
    case 'created': return `When a ${label(t.collection)} is created`;
    case 'updated': return `When a ${label(t.collection)} changes${t.field ? ` (${t.field})` : ''}`;
    case 'status': return `When a ${label(t.collection)} becomes “${t.to}”`;
    case 'schedule': return t.every === 'day' ? `Every day at ${t.at ?? '09:00'}` : t.every === 'week' ? `Every week on ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.weekday ?? 1]} at ${t.at ?? '09:00'}` : `Every month on day ${t.day ?? 1} at ${t.at ?? '09:00'}`;
    case 'dateField': return `${t.offsetDays > 0 ? `${t.offsetDays} day${t.offsetDays > 1 ? 's' : ''} before` : 'On'} the ${t.field} of a ${label(t.collection)}`;
  }
}
