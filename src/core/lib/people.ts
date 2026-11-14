import { addDays, diffDays, nextAnnual, parseDate, startOfDay } from './dates';

/**
 * Personal relationships: who is due a catch-up, and whose birthday is coming. Pure functions over records,
 * so the overview, the home widget and the reminder engine all agree.
 */

export const CADENCES = [
  { value: 0, label: 'No reminder' },
  { value: 7, label: 'Every week' },
  { value: 14, label: 'Every 2 weeks' },
  { value: 30, label: 'Every month' },
  { value: 90, label: 'Every 3 months' },
  { value: 182, label: 'Every 6 months' },
  { value: 365, label: 'Every year' },
] as const;

export const INTERACTION_KINDS = ['call', 'message', 'meet', 'video', 'email', 'gift', 'other'] as const;

interface PersonLike {
  [key: string]: unknown;
  id: string;
  cadenceDays?: unknown;
  lastContactAt?: unknown;
  birthday?: unknown;
  _ca?: number;
  deletedAt?: unknown;
  archived?: unknown;
}
interface InteractionLike {
  [key: string]: unknown;
  personId?: unknown;
  date?: unknown;
  deletedAt?: unknown;
}

/** Most recent contact per person: the latest logged interaction, or a date entered on the person. */
export function lastContacts(people: PersonLike[], interactions: InteractionLike[]): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const p of people) {
    const d = parseDate(p.lastContactAt);
    if (d) out.set(p.id, d);
  }
  for (const i of interactions) {
    if (i.deletedAt || typeof i.personId !== 'string') continue;
    const d = parseDate(i.date);
    if (!d) continue;
    const prev = out.get(i.personId);
    if (!prev || d > prev) out.set(i.personId, d);
  }
  return out;
}

export type ContactState = 'none' | 'ok' | 'soon' | 'due' | 'overdue';

export interface ContactStatus {
  state: ContactState;
  /** when the next catch-up is due (null without a cadence) */
  dueAt: Date | null;
  /** days until due; negative when overdue */
  daysLeft: number | null;
  /** days since the last contact (null if never logged) */
  sinceDays: number | null;
}

/**
 * Keep-in-touch status. Without any logged contact the clock starts when the person was added, so a new
 * contact is not instantly "overdue".
 */
export function contactStatus(person: PersonLike, last: Date | undefined | null, now: Date): ContactStatus {
  const cadence = Number(person.cadenceDays) || 0;
  const sinceDays = last ? Math.max(0, diffDays(last, now)) : null;
  if (cadence <= 0) return { state: 'none', dueAt: null, daysLeft: null, sinceDays };
  const start = last ?? (person._ca ? new Date(person._ca) : now);
  const dueAt = startOfDay(addDays(start, cadence));
  const daysLeft = diffDays(now, dueAt);
  const soonWindow = Math.max(2, Math.round(cadence * 0.15));
  const state: ContactState = daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'due' : daysLeft <= soonWindow ? 'soon' : 'ok';
  return { state, dueAt, daysLeft, sinceDays };
}

/** People with a cadence that are due, overdue or nearly due — most overdue first. */
export function reconnectQueue<P extends PersonLike>(people: P[], last: Map<string, Date>, now: Date, include: ContactState[] = ['overdue', 'due', 'soon']) {
  return people
    .filter((p) => !p.deletedAt && !p.archived)
    .map((person) => ({ person, status: contactStatus(person, last.get(person.id), now) }))
    .filter((x) => include.includes(x.status.state))
    .sort((a, b) => (a.status.daysLeft ?? 0) - (b.status.daysLeft ?? 0));
}

export interface UpcomingBirthday<P> {
  person: P;
  date: Date;
  daysLeft: number;
  /** age on that birthday, when the birth year is known (a year before 1900 means "year unknown") */
  turning: number | null;
}

/** Birthdays in the next `days` days (today included), soonest first. 29 February is celebrated on 28 February in other years. */
export function upcomingBirthdays<P extends PersonLike>(people: P[], now: Date, days = 30): UpcomingBirthday<P>[] {
  const out: UpcomingBirthday<P>[] = [];
  for (const person of people) {
    if (person.deletedAt || person.archived) continue;
    const born = parseDate(person.birthday);
    if (!born) continue;
    const next = nextBirthday(born, now);
    const daysLeft = diffDays(now, next);
    if (daysLeft < 0 || daysLeft > days) continue;
    const turning = born.getFullYear() >= 1900 ? next.getFullYear() - born.getFullYear() : null;
    out.push({ person, date: next, daysLeft, turning: turning !== null && turning > 0 ? turning : null });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function nextBirthday(born: Date, now: Date): Date {
  return nextAnnual(born, now)!;
}
