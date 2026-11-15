import { describe, expect, it } from 'vitest';
import { ymd } from '@/core/lib/dates';
import { dueSubscriptionCharges, nextBilling, spendingInsights } from '@/core/lib/finance-insights';

const d = (s: string) => new Date(`${s}T10:00:00`);

describe('subscriptions that log themselves', () => {
  it('keeps the billing day through short months', () => {
    expect(ymd(nextBilling(d('2026-01-31'), 'monthly'))).toBe('2026-02-28');
    expect(ymd(nextBilling(d('2026-02-28'), 'monthly', 31))).toBe('2026-03-31');
    expect(ymd(nextBilling(d('2026-11-15'), 'weekly'))).toBe('2026-11-22');
    expect(ymd(nextBilling(d('2026-11-15'), 'quarterly'))).toBe('2027-02-15');
    expect(ymd(nextBilling(d('2024-02-29'), 'yearly'))).toBe('2025-02-28');
  });

  it('logs every billing date up to today, once each, and moves the next date on', () => {
    const subs = [
      { id: 'net', name: 'Netflix', amount: 649, cycle: 'monthly', nextBillingDate: '2026-09-15', autoLog: true, category: 'Subscriptions' },
      { id: 'off', name: 'Gym', amount: 1500, cycle: 'monthly', nextBillingDate: '2026-11-01' },
      { id: 'paused', name: 'Paused', amount: 99, cycle: 'monthly', nextBillingDate: '2026-11-01', autoLog: true, status: 'paused' },
    ];
    const { charges, advance } = dueSubscriptionCharges(subs, d('2026-11-15'));
    expect(charges.map((c) => c.id)).toEqual(['tx:sub:net:2026-09-15', 'tx:sub:net:2026-10-15', 'tx:sub:net:2026-11-15']);
    expect(charges[0].data).toMatchObject({ type: 'expense', amount: 649, payee: 'Netflix', category: 'Subscriptions', date: '2026-09-15' });
    expect(advance).toEqual([{ id: 'net', nextBillingDate: '2026-12-15', billingDay: 15 }]);
  });

  it('catches up at most a year, then jumps to the next future date', () => {
    const { charges, advance } = dueSubscriptionCharges([{ id: 'w', amount: 10, cycle: 'weekly', nextBillingDate: '2025-01-01', autoLog: true }], d('2026-11-15'), 12);
    expect(charges).toHaveLength(12);
    expect(advance[0].nextBillingDate > '2026-11-15').toBe(true);
  });
});

describe('spending insights', () => {
  const t = (date: string, amount: number, category: string) => ({ type: 'expense', amount, category, date, currency: 'INR' });
  // Rent: once a month. Groceries and dining: several times a month.
  const history = ['2026-08', '2026-09', '2026-10'].flatMap((m) => [
    t(`${m}-03`, 20000, 'Rent'), t(`${m}-05`, 2000, 'Groceries'), t(`${m}-15`, 2000, 'Groceries'), t(`${m}-25`, 2000, 'Groceries'),
    t(`${m}-08`, 1000, 'Dining'), t(`${m}-18`, 1000, 'Dining'), t(`${m}-28`, 1000, 'Dining'), t(`${m}-20`, 4000, 'Travel'), t(`${m}-21`, 1000, 'Travel'),
  ]);
  const now = d('2026-11-15');

  it('does not double a once-a-month payment, and flags categories running well above their pace', () => {
    const insights = spendingInsights([...history, t('2026-11-03', 20000, 'Rent'), t('2026-11-08', 3000, 'Groceries'), t('2026-11-10', 4000, 'Dining')], now);
    expect(insights[0].kind).toBe('projection');
    expect(insights.find((i) => i.category === 'Rent')).toBeUndefined(); // paid once, as usual
    const dining = insights.find((i) => i.category === 'Dining')!;
    expect(dining.kind).toBe('up');
    expect(dining.text).toMatch(/^Dining is running \d+% above your usual 3000 a month\.$/);
    expect(insights.find((i) => i.category === 'Groceries')).toBeUndefined(); // on its usual pace
    expect(insights.find((i) => i.category === 'Travel')?.text).toBe('No travel spending yet this month — usually about 5000.');
  });

  it('counts a fixed bill that has not come yet at its usual amount', () => {
    const [projection] = spendingInsights([...history, t('2026-11-08', 3000, 'Groceries'), t('2026-11-10', 1500, 'Dining')], now);
    expect(projection.amount).toBeGreaterThanOrEqual(20000 + 6000 + 3000);
  });

  it('says nothing early in the month, and only a projection without history', () => {
    expect(spendingInsights([t('2026-11-02', 500, 'Dining')], d('2026-11-03'))).toEqual([]);
    expect(spendingInsights([t('2026-11-02', 500, 'Dining')], d('2026-11-20')).map((i) => i.kind)).toEqual(['projection']);
  });
});
