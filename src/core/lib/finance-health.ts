import { ym } from './dates';
import { DEFAULT_RATES, accountBalances, convert, inMonth, totals, type Txn } from './money';

/**
 * Two plain answers people want from their money: "how much can I still spend this month?" and "what am I worth?".
 * Both are arithmetic over the person's own records, shown with the numbers they were made from; nothing is guessed
 * beyond "bills that came every month will come again".
 */

export interface SafeToSpend {
  /** what the rest of the month can absorb (negative when the month is already overspent) */
  left: number;
  /** `left` spread over the days that remain, today included; never below zero */
  perDay: number;
  daysLeft: number;
  /** income for the month: what has arrived, or the usual month's income if that is higher */
  income: number;
  /** true when `income` is the usual amount, not yet received in full */
  incomeExpected: boolean;
  /** regular bills for the month, whether already paid or still to come */
  bills: number;
  billsToCome: number;
  /** everything else spent so far this month */
  spent: number;
}

const value = (t: Txn, currency: string, rates: Record<string, number>) => convert(Math.abs(Number(t.amount) || 0), t.currency || currency, currency, rates);

/**
 * Regular bills: categories that showed up in at least two of the previous three months and about once per month
 * (rent, utilities, insurance). Returns the usual monthly amount per category.
 */
export function regularBills(txns: Txn[], now: Date, currency = 'INR', rates = DEFAULT_RATES): Map<string, number> {
  const stats = new Map<string, { months: number; count: number; total: number }>();
  for (const k of [1, 2, 3]) {
    const seen = new Map<string, { count: number; total: number }>();
    for (const t of inMonth(txns, ym(new Date(now.getFullYear(), now.getMonth() - k, 1)))) {
      if (t.type !== 'expense') continue;
      const c = t.category || 'Other';
      const s = seen.get(c) ?? { count: 0, total: 0 };
      seen.set(c, { count: s.count + 1, total: s.total + value(t, currency, rates) });
    }
    for (const [c, s] of seen) {
      const all = stats.get(c) ?? { months: 0, count: 0, total: 0 };
      stats.set(c, { months: all.months + 1, count: all.count + s.count, total: all.total + s.total });
    }
  }
  const out = new Map<string, number>();
  for (const [c, s] of stats) if (s.months >= 2 && s.count / s.months <= 1.5) out.set(c, s.total / s.months);
  return out;
}

/** What is left to spend this month, after income, regular bills (paid or still due) and what has been spent. */
export function safeToSpend(txns: Txn[], now: Date, currency = 'INR', rates = DEFAULT_RATES): SafeToSpend | null {
  const current = inMonth(txns, ym(now));
  const received = totals(current, currency, rates).income;
  const earlier = [1, 2, 3].map((k) => totals(inMonth(txns, ym(new Date(now.getFullYear(), now.getMonth() - k, 1))), currency, rates).income).filter((v) => v > 0);
  const usual = earlier.length ? earlier.reduce((a, b) => a + b, 0) / earlier.length : 0;
  const income = Math.max(received, usual);
  if (income <= 0) return null; // without any income on record there is nothing honest to say

  const usualBills = regularBills(txns, now, currency, rates);
  const paid = new Map<string, number>();
  let spent = 0;
  for (const t of current) {
    if (t.type !== 'expense') continue;
    const c = t.category || 'Other';
    if (usualBills.has(c)) paid.set(c, (paid.get(c) ?? 0) + value(t, currency, rates));
    else spent += value(t, currency, rates);
  }
  let bills = 0, billsToCome = 0;
  for (const [c, usualAmount] of usualBills) {
    const p = paid.get(c) ?? 0;
    bills += Math.max(p, usualAmount);
    billsToCome += Math.max(0, usualAmount - p);
  }
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;
  const left = income - bills - spent;
  return { left, perDay: Math.max(0, left) / daysLeft, daysLeft, income, incomeExpected: usual > received, bills, billsToCome, spent };
}

export interface NetWorth {
  assets: number;
  liabilities: number;
  net: number;
  /** month-end net worth, oldest first; the last point is today */
  trend: { month: string; net: number }[];
}
type AccountLike = { id: string } & Record<string, unknown>; // openingBalance, currency, archived
type DebtLike = Record<string, unknown>; // kind ('owe' | 'owed'), balance, currency

/**
 * Net worth: account balances plus money owed to you, minus overdrawn accounts and what you owe. Savings goals are
 * not added, because that money normally sits in one of the accounts already. The trend follows the accounts month
 * by month; debts have no history, so they are held at today's balance throughout.
 */
export function netWorth(accounts: AccountLike[], txns: Txn[], debts: DebtLike[], now: Date, currency = 'INR', rates = DEFAULT_RATES, months = 6): NetWorth | null {
  const live = accounts.filter((a) => !a.archived);
  if (!live.length && !debts.length) return null;
  const forAccounts = live.map((a) => ({ id: a.id, openingBalance: Number(a.openingBalance) || 0 }));
  const currencyOf = new Map(live.map((a) => [a.id, (a.currency as string) || currency]));
  let owed = 0, owe = 0;
  for (const d of debts) {
    const v = convert(Math.max(0, Number(d.balance) || 0), (d.currency as string) || currency, currency, rates);
    if (d.kind === 'owed') owed += v;
    else owe += v;
  }
  const at = (upTo: string | null) => {
    let assets = owed, liabilities = owe;
    const balances = accountBalances(forAccounts, upTo ? txns.filter((t) => (t.date ?? '').slice(0, 10) <= upTo) : txns);
    for (const [id, b] of balances) {
      const v = convert(b, currencyOf.get(id)!, currency, rates);
      if (v >= 0) assets += v;
      else liabilities += -v;
    }
    return { assets, liabilities, net: assets - liabilities };
  };
  const pad = (n: number) => String(n).padStart(2, '0');
  const trend: NetWorth['trend'] = [];
  for (let k = months - 1; k >= 1; k--) {
    const end = new Date(now.getFullYear(), now.getMonth() - k + 1, 0); // last day of that month
    trend.push({ month: ym(end), net: at(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`).net });
  }
  const today = at(null);
  trend.push({ month: ym(now), net: today.net });
  return { ...today, trend };
}
