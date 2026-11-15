import { describe, expect, it } from 'vitest';
import { netWorth, regularBills, safeToSpend } from '@/core/lib/finance-health';
import type { Txn } from '@/core/lib/money';

const now = new Date('2026-11-21T10:00:00'); // 10 days left in November, today included
const exp = (date: string, amount: number, category: string, extra: Partial<Txn> = {}): Txn => ({ type: 'expense', amount, category, date, currency: 'INR', ...extra });
const inc = (date: string, amount: number): Txn => ({ type: 'income', amount, category: 'Salary', date, currency: 'INR' });

const history: Txn[] = [
  inc('2026-08-01', 80000), inc('2026-09-01', 80000), inc('2026-10-01', 80000),
  exp('2026-08-03', 25000, 'Rent'), exp('2026-09-03', 25000, 'Rent'), exp('2026-10-03', 25000, 'Rent'),
  exp('2026-09-10', 1800, 'Utilities'), exp('2026-10-11', 2200, 'Utilities'),
  // groceries happen many times a month: not a bill
  ...['08', '09', '10'].flatMap((m) => [5, 12, 19, 26].map((d) => exp(`2026-${m}-${String(d).padStart(2, '0')}`, 1500, 'Groceries'))),
  exp('2026-10-20', 9000, 'Travel'), // once, in one month only: not a bill
];

describe('safe to spend', () => {
  it('finds the bills that come about once a month, in at least two of the last three months', () => {
    const bills = regularBills(history, now);
    expect([...bills.keys()].sort()).toEqual(['Rent', 'Utilities']);
    expect(bills.get('Rent')).toBe(25000);
    expect(bills.get('Utilities')).toBe(2000);
  });

  it('takes income, sets aside bills paid or still to come, and spreads the rest over the days left', () => {
    const s = safeToSpend([...history, inc('2026-11-01', 80000), exp('2026-11-03', 25000, 'Rent'), exp('2026-11-08', 3000, 'Groceries'), exp('2026-11-15', 2000, 'Dining')], now)!;
    expect(s).toMatchObject({ income: 80000, incomeExpected: false, bills: 27000, billsToCome: 2000, spent: 5000, daysLeft: 10, left: 48000, perDay: 4800 });
  });

  it('uses the usual income while this month’s has not arrived, and never suggests spending when overspent', () => {
    const early = safeToSpend([...history, exp('2026-11-03', 26000, 'Rent')], now)!; // rent went up: the higher figure counts
    expect(early).toMatchObject({ income: 80000, incomeExpected: true, bills: 28000, billsToCome: 2000, spent: 0 });
    const over = safeToSpend([...history, inc('2026-11-01', 80000), exp('2026-11-10', 90000, 'Travel')], now)!;
    expect(over.left).toBeLessThan(0);
    expect(over.perDay).toBe(0);
  });

  it('says nothing without any income on record, and converts other currencies', () => {
    expect(safeToSpend([exp('2026-11-02', 500, 'Dining')], now)).toBeNull();
    const s = safeToSpend([inc('2026-11-01', 84000), exp('2026-11-05', 100, 'Software', { currency: 'USD' })], now, 'INR', { USD: 1, INR: 84 })!;
    expect(s.spent).toBe(8400);
    expect(s.left).toBe(75600);
  });
});

describe('net worth', () => {
  const accounts = [{ id: 'bank', openingBalance: 100000, currency: 'INR' }, { id: 'card', openingBalance: 0, currency: 'INR' }, { id: 'usd', openingBalance: 100, currency: 'USD' }, { id: 'old', openingBalance: 5000, archived: true }];
  const txns: Txn[] = [
    { type: 'income', amount: 50000, accountId: 'bank', date: '2026-09-01' },
    { type: 'expense', amount: 20000, accountId: 'bank', date: '2026-10-05' },
    { type: 'expense', amount: 12000, accountId: 'card', date: '2026-11-10' },
    { type: 'transfer', amount: 10000, accountId: 'bank', toAccountId: 'card', date: '2026-11-15' },
  ];
  const debts = [{ kind: 'owe', balance: 300000, currency: 'INR' }, { kind: 'owed', balance: 5000, currency: 'INR' }];
  const rates = { USD: 1, INR: 84 };

  it('adds accounts and money owed to you, subtracts overdrawn accounts and debts', () => {
    const n = netWorth(accounts, txns, debts, now, 'INR', rates)!;
    // bank 100000 + 50000 − 20000 − 10000 = 120000; usd 100 → 8400; owed 5000; card −12000 + 10000 = −2000
    expect(n.assets).toBe(133400);
    expect(n.liabilities).toBe(302000);
    expect(n.net).toBe(-168600);
  });

  it('follows the accounts month by month, ending today', () => {
    const n = netWorth(accounts, txns, debts, now, 'INR', rates, 4)!;
    expect(n.trend.map((p) => p.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
    // August: 100000 + 8400 + 5000 − 300000; September adds 50000; October takes 20000
    expect(n.trend.map((p) => p.net)).toEqual([-186600, -136600, -156600, -168600]);
  });

  it('needs at least one account or debt', () => {
    expect(netWorth([], txns, [], now)).toBeNull();
    expect(netWorth([{ id: 'a', openingBalance: 10 }], [], [], now, 'INR')!.net).toBe(10);
  });
});
