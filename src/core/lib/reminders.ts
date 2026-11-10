import type { Fields } from '@/core/sync/merge';
import { addDays, diffDays, nextAnnual, parseDate, ymd } from './dates';
import { occurrences, type Recurrence } from './recurrence';

/**
 * Works out which reminders are due. Pure: given data and a clock it returns notifications with
 * deterministic ids, so the same reminder is never created twice — not even by two devices.
 */

export interface DueNotification {
  id: string;
  title: string;
  body: string;
  kind: 'task' | 'event' | 'habit' | 'renewal' | 'date' | 'document' | 'budget';
  source: string;
  sourceId: string;
  dueAt: string;
}

type R = Fields & { id: string };

export interface ReminderInput {
  tasks?: R[];
  events?: R[];
  habits?: R[];
  habitLogs?: R[];
  subscriptions?: R[];
  dates?: R[];
  files?: R[];
  licenses?: R[];
  maintenance?: R[];
}

export interface ReminderPrefs {
  tasks?: boolean;
  events?: boolean;
  habits?: boolean;
  renewals?: boolean;
  dates?: boolean;
  /** minutes before an event when it has no reminders of its own */
  eventLead?: number;
  /** days before a renewal / important date */
  leadDays?: number;
}

const live = (r: R) => !r.deletedAt && !r.archived;

export function dueNotifications(input: ReminderInput, now: Date, prefs: ReminderPrefs = {}): DueNotification[] {
  const out: DueNotification[] = [];
  const today = ymd(now);
  const leadDays = prefs.leadDays ?? 3;

  if (prefs.tasks !== false) {
    for (const t of (input.tasks ?? []).filter(live)) {
      if (t.status === 'done' || !t.dueAt) continue;
      const due = parseDate(t.dueAt)!;
      const dateOnly = String(t.dueAt).length === 10;
      const days = diffDays(now, due);
      if (days < 0) out.push({ id: `nt:task:${t.id}:overdue:${ymd(due)}`, title: 'Task overdue', body: String(t.title ?? ''), kind: 'task', source: 'tasks', sourceId: t.id, dueAt: due.toISOString() });
      else if (dateOnly ? days === 0 : due.getTime() - now.getTime() <= 60 * 60_000) {
        out.push({ id: `nt:task:${t.id}:due:${ymd(due)}`, title: dateOnly ? 'Task due today' : 'Task due soon', body: String(t.title ?? ''), kind: 'task', source: 'tasks', sourceId: t.id, dueAt: due.toISOString() });
      }
    }
  }

  if (prefs.events !== false) {
    const horizon = addDays(now, 1);
    for (const e of (input.events ?? []).filter(live)) {
      const start = parseDate(e.startAt);
      if (!start) continue;
      const leads = Array.isArray(e.reminders) && e.reminders.length ? (e.reminders as number[]) : [prefs.eventLead ?? 15];
      for (const occ of occurrences(start, e.recurrence as Recurrence | null, addDays(now, -1), horizon, 10)) {
        for (const lead of leads) {
          const fireAt = occ.getTime() - lead * 60_000;
          // fire once the lead time is reached, until the event has started
          if (fireAt <= now.getTime() && occ.getTime() > now.getTime()) {
            out.push({ id: `nt:event:${e.id}:${occ.getTime()}:${lead}`, title: e.allDay ? 'Today' : `Starting ${lead >= 60 ? `in ${Math.round(lead / 60)} h` : `in ${lead} min`}`, body: String(e.title ?? ''), kind: 'event', source: 'events', sourceId: e.id, dueAt: occ.toISOString() });
          }
        }
      }
    }
  }

  if (prefs.habits !== false) {
    const doneToday = new Set((input.habitLogs ?? []).filter((l) => !l.deletedAt && l.date === today && Number(l.value ?? 1) > 0).map((l) => l.habitId));
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (const h of (input.habits ?? []).filter(live)) {
      if (!h.reminderAt || doneToday.has(h.id)) continue;
      if (String(h.reminderAt) <= hhmm) out.push({ id: `nt:habit:${h.id}:${today}`, title: 'Habit reminder', body: String(h.name ?? ''), kind: 'habit', source: 'habits', sourceId: h.id, dueAt: now.toISOString() });
    }
  }

  const upcoming = (list: R[] | undefined, field: string, source: string, kind: DueNotification['kind'], title: (r: R, days: number) => string, annual = false) => {
    for (const r of (list ?? []).filter(live)) {
      const date = annual ? nextAnnual(r[field], now) : parseDate(r[field]);
      if (!date) continue;
      const days = diffDays(now, date);
      const lead = typeof r.remindDays === 'number' ? r.remindDays : leadDays;
      if (days >= 0 && days <= lead) {
        out.push({ id: `nt:${source}:${r.id}:${ymd(date)}`, title: title(r, days), body: String(r.name ?? r.title ?? ''), kind, source, sourceId: r.id, dueAt: date.toISOString() });
      }
    }
  };
  const when = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);
  if (prefs.renewals !== false) {
    upcoming(input.subscriptions?.filter((s) => s.status !== 'cancelled'), 'nextBillingDate', 'subscriptions', 'renewal', (_, d) => `Subscription renews ${when(d)}`);
    upcoming(input.licenses, 'renewalDate', 'licenses', 'renewal', (_, d) => `License renews ${when(d)}`);
    upcoming(input.files, 'expiresAt', 'files', 'document', (_, d) => `Document expires ${when(d)}`);
    upcoming(input.maintenance, 'nextDue', 'maintenance', 'renewal', (_, d) => `Maintenance due ${when(d)}`);
  }
  if (prefs.dates !== false) {
    upcoming(input.dates?.filter((d) => d.repeatYearly !== false), 'date', 'dates', 'date', (r, d) => `${String(r.kind ?? 'Date').replace(/^./, (c) => c.toUpperCase())} ${when(d)}`, true);
    upcoming(input.dates?.filter((d) => d.repeatYearly === false), 'date', 'dates', 'date', (_, d) => `Coming up ${when(d)}`);
  }
  return out;
}

/** Is `now` inside the quiet-hours window (which may span midnight)? */
export function inQuietHours(now: Date, quiet: { enabled?: boolean; from?: string; to?: string } | undefined): boolean {
  if (!quiet?.enabled || !quiet.from || !quiet.to) return false;
  const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return quiet.from <= quiet.to ? t >= quiet.from && t < quiet.to : t >= quiet.from || t < quiet.to;
}
