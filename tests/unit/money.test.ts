import { describe, expect, it } from 'vitest';
import { accountBalances, budgetStatus, byCategory, cashflow, convert, fmtMoney, monthlyCost, payoffMonths, totals } from '@/core/lib/money';

const txns = [
  { type: 'income', amount: 80000, currency: 'INR', category: 'Salary', date: '2026-11-01', accountId: 'bank' },
  { type: 'expense', amount: 12000, currency: 'INR', category: 'Rent', date: '2026-11-02', accountId: 'bank' },
  { type: 'expense', amount: 3000, currency: 'INR', category: 'Groceries', date: '2026-11-03', accountId: 'bank' },
  { type: 'expense', amount: 1000, currency: 'INR', category: 'Groceries', date: '2026-11-09', accountId: 'cash' },
  { type: 'transfer', amount: 5000, currency: 'INR', date: '2026-11-04', accountId: 'bank', toAccountId: 'cash' },
  { type: 'expense', amount: 2000, currency: 'INR', category: 'Rent', date: '2026-10-02', accountId: 'bank' },
];

describe('finance calculations', () => {
  it('computes income, expenses, net and savings rate, ignoring transfers', () => {
    const t = totals(txns.filter((x) => x.date.startsWith('2026-11')));
    expect(t).toEqual({ income: 80000, expense: 16000, net: 64000, savingsRate: 0.8 });
    expect(totals([]).savingsRate).toBe(0);
  });

  it('breaks spending down by category with shares', () => {
    const c = byCategory(txns.filter((x) => x.date.startsWith('2026-11')));
    expect(c.map((x) => [x.category, x.amount])).toEqual([['Rent', 12000], ['Groceries', 4000]]);
    expect(c[0].share).toBeCloseTo(0.75);
  });

  it('builds a month-by-month cash flow including empty months', () => {
    const flow = cashflow(txns, 3, new Date(2026, 10, 15));
    expect(flow.map((f) => f.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(flow.map((f) => f.expense)).toEqual([0, 2000, 16000]);
  });

  it('tracks budgets: ok, warning from 80%, over above 100%', () => {
    const month = txns.filter((x) => x.date.startsWith('2026-11'));
    const s = budgetStatus([{ category: 'Rent', amount: 12000 }, { category: 'Groceries', amount: 3500 }, { category: 'Fun', amount: 2000 }], month);
    expect(s.map((x) => x.state)).toEqual(['warning', 'over', 'ok']);
    expect(s[1].remaining).toBe(-500);
  });

  it('derives account balances from opening balance, income, expenses and transfers', () => {
    const b = accountBalances([{ id: 'bank', openingBalance: 10000 }, { id: 'cash' }], txns);
    expect(b.get('bank')).toBe(10000 + 80000 - 12000 - 3000 - 5000 - 2000);
    expect(b.get('cash')).toBe(5000 - 1000);
  });

  it('converts currencies through the rate table and formats INR by default', () => {
    expect(convert(84, 'INR', 'USD')).toBeCloseTo(1);
    expect(convert(100, 'INR', 'INR')).toBe(100);
    expect(totals([{ type: 'expense', amount: 10, currency: 'USD' }], 'INR').expense).toBeCloseTo(840);
    expect(fmtMoney(123456)).toBe('₹1,23,456');
  });

  it('normalises subscription cost and estimates debt payoff', () => {
    expect(monthlyCost(1200, 'yearly')).toBe(100);
    expect(monthlyCost(300, 'quarterly')).toBe(100);
    expect(payoffMonths(12000, 0, 1000)).toBe(12);
    expect(payoffMonths(100000, 12, 500)).toBeNull();
    expect(payoffMonths(100000, 12, 5000)).toBe(23);
  });
});
