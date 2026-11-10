import { ym } from './dates';

/** Finance calculations. Every figure is derived from the user's own transactions. */

export interface Txn {
  type?: 'income' | 'expense' | 'transfer' | string;
  amount?: number;
  currency?: string;
  category?: string | null;
  accountId?: string | null;
  toAccountId?: string | null;
  date?: string | null;
}

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'AED', 'CHF', 'CNY'] as const;

/**
 * Reference rates (units of currency per 1 USD) used until the user edits them in Finance → Settings.
 * They are static defaults, not live market data.
 */
export const DEFAULT_RATES: Record<string, number> = { USD: 1, INR: 84, EUR: 0.92, GBP: 0.79, JPY: 150, AUD: 1.52, CAD: 1.37, SGD: 1.34, AED: 3.67, CHF: 0.88, CNY: 7.2 };

export function convert(amount: number, from: string, to: string, rates: Record<string, number> = DEFAULT_RATES): number {
  if (from === to || !rates[from] || !rates[to]) return amount;
  return (amount / rates[from]) * rates[to];
}

export function fmtMoney(amount: number, currency = 'INR', opts: { compact?: boolean; sign?: boolean } = {}): string {
  const value = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
      style: 'currency',
      currency,
      notation: opts.compact && Math.abs(value) >= 100_000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(value) >= 1000 || Number.isInteger(value) ? 0 : 2,
      signDisplay: opts.sign ? 'exceptZero' : 'auto',
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

export interface Totals {
  income: number;
  expense: number;
  net: number;
  /** share of income that was not spent, 0–1 (0 when there is no income) */
  savingsRate: number;
}

/** Income, expenses and net for transactions, normalised to `currency`. Transfers are excluded. */
export function totals(txns: Txn[], currency = 'INR', rates = DEFAULT_RATES): Totals {
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    const value = convert(Math.abs(num(t.amount)), t.currency || currency, currency, rates);
    if (t.type === 'income') income += value;
    else if (t.type === 'expense') expense += value;
  }
  return { income, expense, net: income - expense, savingsRate: income > 0 ? Math.max(0, (income - expense) / income) : 0 };
}

export const inMonth = (txns: Txn[], month: string): Txn[] => txns.filter((t) => (t.date ?? '').slice(0, 7) === month);

/** Spending per category, largest first. */
export function byCategory(txns: Txn[], type: 'income' | 'expense' = 'expense', currency = 'INR', rates = DEFAULT_RATES): { category: string; amount: number; share: number }[] {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== type) continue;
    const key = t.category || 'Uncategorised';
    map.set(key, (map.get(key) ?? 0) + convert(Math.abs(num(t.amount)), t.currency || currency, currency, rates));
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map.entries()].map(([category, amount]) => ({ category, amount, share: total ? amount / total : 0 })).sort((a, b) => b.amount - a.amount);
}

/** Income / expense / net for each of the last `months` months (oldest first), including empty months. */
export function cashflow(txns: Txn[], months = 6, now: Date = new Date(), currency = 'INR', rates = DEFAULT_RATES): ({ month: string } & Totals)[] {
  const out: ({ month: string } & Totals)[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = ym(new Date(now.getFullYear(), now.getMonth() - i, 1));
    out.push({ month, ...totals(inMonth(txns, month), currency, rates) });
  }
  return out;
}

export interface BudgetStatus {
  category: string;
  budget: number;
  spent: number;
  remaining: number;
  /** spent / budget, uncapped */
  ratio: number;
  state: 'ok' | 'warning' | 'over';
}

export function budgetStatus(budgets: { category?: string; amount?: number; currency?: string }[], monthTxns: Txn[], currency = 'INR', rates = DEFAULT_RATES): BudgetStatus[] {
  const spent = new Map(byCategory(monthTxns, 'expense', currency, rates).map((c) => [c.category, c.amount]));
  return budgets
    .filter((b) => b.category)
    .map((b) => {
      const budget = convert(num(b.amount), b.currency || currency, currency, rates);
      const used = spent.get(b.category!) ?? 0;
      const ratio = budget > 0 ? used / budget : used > 0 ? Infinity : 0;
      return { category: b.category!, budget, spent: used, remaining: budget - used, ratio, state: ratio > 1 ? 'over' : ratio >= 0.8 ? 'warning' : 'ok' } as BudgetStatus;
    });
}

/** Balance of each account: opening balance plus income and incoming transfers, minus expenses and outgoing transfers. */
export function accountBalances(accounts: { id: string; openingBalance?: number }[], txns: Txn[]): Map<string, number> {
  const balances = new Map(accounts.map((a) => [a.id, num(a.openingBalance)]));
  for (const t of txns) {
    const amount = Math.abs(num(t.amount));
    if (t.accountId && balances.has(t.accountId)) {
      balances.set(t.accountId, balances.get(t.accountId)! + (t.type === 'income' ? amount : -amount));
    }
    if (t.type === 'transfer' && t.toAccountId && balances.has(t.toAccountId)) {
      balances.set(t.toAccountId, balances.get(t.toAccountId)! + amount);
    }
  }
  return balances;
}

/** Monthly cost of a subscription billed on another cycle. */
export function monthlyCost(amount: number, cycle: string): number {
  switch (cycle) {
    case 'weekly': return (amount * 52) / 12;
    case 'quarterly': return amount / 3;
    case 'yearly': return amount / 12;
    default: return amount;
  }
}

/** Months needed to clear a debt with a fixed monthly payment (null if the payment never covers the interest). */
export function payoffMonths(balance: number, annualRatePct: number, payment: number): number | null {
  if (balance <= 0) return 0;
  if (payment <= 0) return null;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.ceil(balance / payment);
  if (payment <= balance * r) return null;
  return Math.ceil(-Math.log(1 - (balance * r) / payment) / Math.log(1 + r));
}
