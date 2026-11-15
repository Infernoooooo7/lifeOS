import { addDays, addMonths, parseDate, startOfDay, ym, ymd } from './dates';
import { DEFAULT_RATES, convert, inMonth, type Txn } from './money';

/**
 * Money that runs itself: subscriptions that record their own payments, and plain-language insights about how this
 * month's spending compares with the usual. Pure, so every device computes the same thing.
 */

interface SubLike {
  [key: string]: unknown;
  id: string;
  name?: unknown;
  amount?: unknown;
  currency?: unknown;
  cycle?: unknown;
  status?: unknown;
  nextBillingDate?: unknown;
  /** opt-in: log each payment as an expense automatically */
  autoLog?: unknown;
  /** the day of the month a monthly/quarterly/yearly bill falls on, so short months do not make it drift */
  billingDay?: unknown;
  category?: unknown;
  accountId?: unknown;
  deletedAt?: unknown;
}

/** The billing date after `d` for a cycle, keeping the original day of the month (31 Jan → 28 Feb → 31 Mar). */
export function nextBilling(d: Date, cycle: string, anchorDay = d.getDate()): Date {
  if (cycle === 'weekly') return addDays(d, 7);
  const months = cycle === 'yearly' ? 12 : cycle === 'quarterly' ? 3 : 1;
  const first = addMonths(new Date(d.getFullYear(), d.getMonth(), 1), months);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(anchorDay, last));
}

export interface SubscriptionCharge {
  /** deterministic: one charge per subscription per billing date, whichever device logs it */
  id: string;
  subscriptionId: string;
  data: Record<string, unknown>;
}

/**
 * Payments that are due for subscriptions with automatic logging: every billing date up to today (catching up at
 * most `maxCatchUp` missed cycles), and the next billing date after them.
 */
export function dueSubscriptionCharges(subs: SubLike[], today: Date, maxCatchUp = 12): { charges: SubscriptionCharge[]; advance: { id: string; nextBillingDate: string; billingDay: number }[] } {
  const charges: SubscriptionCharge[] = [];
  const advance: { id: string; nextBillingDate: string; billingDay: number }[] = [];
  const end = startOfDay(today);
  for (const s of subs) {
    if (s.deletedAt || s.autoLog !== true || (s.status ?? 'active') !== 'active') continue;
    let due = parseDate(s.nextBillingDate);
    const amount = Number(s.amount);
    if (!due || !(amount > 0)) continue;
    const anchor = Number(s.billingDay) > 0 ? Number(s.billingDay) : due.getDate();
    let n = 0;
    while (startOfDay(due) <= end && n < maxCatchUp) {
      const date = ymd(due);
      charges.push({
        id: `tx:sub:${s.id}:${date}`, subscriptionId: s.id,
        data: { type: 'expense', amount, ...(s.currency ? { currency: s.currency } : {}), date, payee: String(s.name ?? 'Subscription'), category: (s.category as string) || 'Subscriptions', ...(s.accountId ? { accountId: s.accountId } : {}), tags: ['subscription'], subscriptionId: s.id },
      });
      due = nextBilling(due, String(s.cycle ?? 'monthly'), anchor);
      n++;
    }
    // Skipped catch-up beyond the cap: move straight to the next date in the future without logging.
    while (startOfDay(due) <= end) due = nextBilling(due, String(s.cycle ?? 'monthly'), anchor);
    if (n > 0 || ymd(due) !== String(s.nextBillingDate).slice(0, 10)) advance.push({ id: s.id, nextBillingDate: ymd(due), billingDay: anchor });
  }
  return { charges, advance };
}

export interface Insight {
  kind: 'projection' | 'up' | 'down' | 'new';
  text: string;
  category?: string;
  amount: number;
  /** change against the usual month, e.g. 0.45 = 45% more */
  change?: number;
}

/**
 * How this month is going: a projection for the month and the categories running well above or below the average
 * of the previous three months. Categories paid about once a month (rent, bills) are projected at their usual amount
 * rather than by pace, so a rent payment on the 3rd does not read as "double the usual". Small amounts are ignored.
 */
export function spendingInsights(txns: Txn[], now: Date, currency = 'INR', rates = DEFAULT_RATES, fmt: (n: number) => string = (n) => String(Math.round(n))): Insight[] {
  const out: Insight[] = [];
  const day = now.getDate();
  if (day < 5) return out;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const pace = daysInMonth / day;
  const expense = (list: Txn[]) => list.filter((t) => t.type === 'expense');
  const current = expense(inMonth(txns, ym(now)));
  if (!current.length) return out;
  const months = [1, 2, 3].map((k) => expense(inMonth(txns, ym(new Date(now.getFullYear(), now.getMonth() - k, 1))))).filter((m) => m.length);

  const amount = (t: Txn) => convert(Math.abs(Number(t.amount) || 0), t.currency || currency, currency, rates);
  const cat = (t: Txn) => t.category || 'Other';
  const spent = new Map<string, number>();
  for (const t of current) spent.set(cat(t), (spent.get(cat(t)) ?? 0) + amount(t));
  const total = new Map<string, number>();
  const count = new Map<string, number>();
  const seenIn = new Map<string, number>();
  for (const m of months) {
    const here = new Set<string>();
    for (const t of m) {
      total.set(cat(t), (total.get(cat(t)) ?? 0) + amount(t));
      count.set(cat(t), (count.get(cat(t)) ?? 0) + 1);
      here.add(cat(t));
    }
    for (const c of here) seenIn.set(c, (seenIn.get(c) ?? 0) + 1);
  }
  // A category paid about once in the months it appears is a bill (rent, insurance): its usual amount is what it
  // costs when it is paid. Everything else is averaged over all recent months, including months without it.
  const fixed = (c: string) => (seenIn.get(c) ?? 0) > 0 && (count.get(c) ?? 0) / (seenIn.get(c) ?? 1) <= 1.5;
  const base = new Map([...total].map(([c, sum]) => [c, sum / (fixed(c) ? seenIn.get(c)! : months.length)]));
  const project = (c: string) => {
    const s = spent.get(c) ?? 0;
    return fixed(c) ? Math.max(s, base.get(c) ?? 0) : s * pace;
  };
  const categories = new Set([...spent.keys(), ...base.keys()]);
  const projected = [...categories].reduce((sum, c) => sum + project(c), 0);
  const usual = [...base.values()].reduce((a, b) => a + b, 0);
  const vs = usual > 0 ? projected / usual - 1 : null;
  out.push({
    kind: 'projection', amount: projected, change: vs ?? undefined,
    text: `On track to spend about ${fmt(projected)} this month${vs !== null && Math.abs(vs) >= 0.05 ? ` — ${Math.round(Math.abs(vs) * 100)}% ${vs > 0 ? 'more' : 'less'} than usual` : vs !== null ? ', about the same as usual' : ''}.`,
  });
  if (!months.length) return out;

  const floor = Math.max(usual * 0.04, convert(300, 'INR', currency, rates));
  const moves: Insight[] = [];
  for (const c of categories) {
    const b = base.get(c) ?? 0;
    const p = project(c);
    const s = spent.get(c) ?? 0;
    if (b === 0) {
      if (p >= floor * 1.5) moves.push({ kind: 'new', category: c, amount: s, text: `${c} is new this month: ${fmt(s)} so far.` });
      continue;
    }
    const change = p / b - 1;
    if (change >= 0.3 && p - b >= floor) {
      moves.push({ kind: 'up', category: c, amount: p - b, change, text: fixed(c) ? `${c} is ${Math.round(change * 100)}% higher than your usual ${fmt(b)}.` : `${c} is running ${Math.round(change * 100)}% above your usual ${fmt(b)} a month.` });
    } else if (!fixed(c) && day >= 15 && change <= -0.3 && b - p >= floor) {
      moves.push({ kind: 'down', category: c, amount: b - p, change, text: s === 0 ? `No ${c.toLowerCase()} spending yet this month — usually about ${fmt(b)}.` : `${c} is ${Math.round(-change * 100)}% below your usual — about ${fmt(b - p)} less.` });
    }
  }
  return [...out, ...moves.sort((a, b) => b.amount - a.amount).slice(0, 4)];
}
