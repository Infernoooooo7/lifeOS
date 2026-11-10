/** Date helpers. Calendar days are handled as local `YYYY-MM-DD` strings so they never shift across time zones. */

export const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

export const ymd = (d: Date = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ym = (d: Date = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/** Parse a `YYYY-MM-DD` (local midnight) or ISO timestamp. Returns null for empty or invalid input. */
export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const isDateOnly = (value: unknown): boolean => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const endOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
export const addMonths = (d: Date, n: number): Date => {
  const day = d.getDate();
  const out = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes(), d.getSeconds());
  const last = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, last));
  return out;
};
export const startOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
/** weekStart: 0 = Sunday, 1 = Monday */
export const startOfWeek = (d: Date, weekStart = 1): Date => addDays(startOfDay(d), -((d.getDay() - weekStart + 7) % 7));

/** Whole calendar days from a to b (b - a). */
export const diffDays = (a: Date, b: Date): number => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);

export const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** The 6-week grid (42 days) shown by a month calendar. */
export function monthGrid(month: Date, weekStart = 1): Date[] {
  const first = startOfWeek(startOfMonth(month), weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export interface DateFormatPrefs {
  locale?: string;
  hour12?: boolean;
  dateStyle?: 'dmy' | 'mdy' | 'ymd';
}
export const formatPrefs: DateFormatPrefs = { locale: undefined, hour12: true, dateStyle: 'dmy' };

export function fmtDate(value: unknown, opts: { year?: boolean; weekday?: boolean } = {}): string {
  const d = parseDate(value);
  if (!d) return '';
  if (formatPrefs.dateStyle === 'ymd') return ymd(d);
  const locale = formatPrefs.dateStyle === 'mdy' ? 'en-US' : formatPrefs.locale || 'en-GB';
  const showYear = opts.year ?? d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: showYear ? 'numeric' : undefined, weekday: opts.weekday ? 'short' : undefined });
}

export function fmtTime(value: unknown): string {
  const d = parseDate(value);
  if (!d) return '';
  return d.toLocaleTimeString(formatPrefs.locale || 'en-GB', { hour: 'numeric', minute: '2-digit', hour12: formatPrefs.hour12 });
}

export const fmtDateTime = (value: unknown): string => (isDateOnly(value) ? fmtDate(value) : `${fmtDate(value)}, ${fmtTime(value)}`);

/** "Today", "Tomorrow", "Yesterday", "in 3 days", "5 days ago", or a date. */
export function relativeDay(value: unknown, now: Date = new Date()): string {
  const d = parseDate(value);
  if (!d) return '';
  const n = diffDays(now, d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return d.toLocaleDateString(formatPrefs.locale || 'en-GB', { weekday: 'long' });
  if (n < -1 && n > -7) return `${-n} days ago`;
  return fmtDate(d);
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.round(s / 86_400)} d ago`;
  return fmtDate(new Date(ms));
}

export function fmtDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** Value for <input type="datetime-local"> from an ISO string, and back. */
export const toLocalInput = (value: unknown): string => {
  const d = parseDate(value);
  return d ? `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
};
export const fromLocalInput = (value: string): string | null => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
};

/** Next occurrence (today or later) of a yearly date such as a birthday. */
export function nextAnnual(value: unknown, now: Date = new Date()): Date | null {
  const d = parseDate(value);
  if (!d) return null;
  const today = startOfDay(now);
  let next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
  return next;
}

export const greeting = (now: Date = new Date()): string => {
  const h = now.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
