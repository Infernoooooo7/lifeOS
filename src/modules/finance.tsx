'use client';

import { useMemo, useState } from 'react';
import { openEditor } from '@/core/app';
import type { Rec } from '@/core/data/db';
import { useNow, useOptions, usePrefs, useRecords } from '@/core/data/hooks';
import { createMany, titleOf, update } from '@/core/data/store';
import { downloadFile } from '@/core/lib/backup';
import { parseAmount, parseCsvObjects, toCsv } from '@/core/lib/csv';
import { addMonths, diffDays, fmtDate, parseDate, ym, ymd } from '@/core/lib/dates';
import { CURRENCIES, DEFAULT_RATES, accountBalances, budgetStatus, byCategory, cashflow, convert, fmtMoney, inMonth, monthlyCost, payoffMonths, totals, type Txn } from '@/core/lib/money';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { Bars, Donut } from '@/ui/charts';
import { CollectionView } from '@/ui/CollectionView';
import { Icon } from '@/ui/icons';
import { Button, Empty, IconButton, Progress, Section, Sheet, Stat, cx } from '@/ui/kit';
import { toast } from '@/ui/overlays';

const TABS = [
  { value: 'overview', label: 'Overview', icon: 'gauge' as const }, { value: 'transactions', label: 'Transactions', icon: 'list' as const }, { value: 'budgets', label: 'Budgets', icon: 'chart' as const },
  { value: 'accounts', label: 'Accounts', icon: 'bank' as const }, { value: 'subscriptions', label: 'Subscriptions', icon: 'repeat' as const }, { value: 'debts', label: 'Debts', icon: 'card' as const },
  { value: 'savings', label: 'Savings', icon: 'piggy' as const }, { value: 'reports', label: 'Reports', icon: 'file' as const },
];

function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const d = parseDate(`${month}-01`)!;
  return (
    <div className="flex items-center gap-0.5">
      <IconButton icon="chevronLeft" label="Previous month" onClick={() => onChange(ym(addMonths(d, -1)))} />
      <span className="min-w-32 text-center font-display font-semibold">{d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
      <IconButton icon="chevronRight" label="Next month" onClick={() => onChange(ym(addMonths(d, 1)))} />
    </div>
  );
}

/** Bank-statement import: map date / description / amount (or debit + credit) columns, preview, then import. */
function BankImport({ onClose, currency }: { onClose: () => void; currency: string }) {
  const accounts = useRecords('accounts');
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [map, setMap] = useState({ date: '', payee: '', amount: '', debit: '', credit: '', category: '' });
  const [account, setAccount] = useState('');
  const headers = rows?.length ? Object.keys(rows[0]) : [];
  const guess = (hs: string[], re: RegExp) => hs.find((h) => re.test(h)) ?? '';
  const load = async (f: File) => {
    const parsed = parseCsvObjects(await f.text());
    if (!parsed.length) return toast('No rows found in that file.', { tone: 'bad' });
    const hs = Object.keys(parsed[0]);
    setMap({ date: guess(hs, /date/i), payee: guess(hs, /desc|narration|payee|particular|detail|merchant|name/i), amount: guess(hs, /^amount|amt/i), debit: guess(hs, /debit|withdraw/i), credit: guess(hs, /credit|deposit/i), category: guess(hs, /categ/i) });
    setRows(parsed);
  };
  const built = useMemo(() => (rows ?? []).map((r) => {
    const d = r[map.date] ? new Date(r[map.date].replace(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/, '$3-$2-$1')) : null;
    let signed: number | null = null;
    if (map.amount) signed = parseAmount(r[map.amount] ?? '');
    else {
      const debit = map.debit ? parseAmount(r[map.debit] ?? '') : null;
      const credit = map.credit ? parseAmount(r[map.credit] ?? '') : null;
      signed = credit ? Math.abs(credit) : debit ? -Math.abs(debit) : null;
    }
    if (!d || Number.isNaN(d.getTime()) || !signed) return null;
    return { type: signed < 0 ? 'expense' : 'income', amount: Math.abs(signed), currency, date: ymd(d), payee: (r[map.payee] ?? '').slice(0, 200), category: (map.category && r[map.category]) || (signed < 0 ? 'Other' : 'Other'), accountId: account || null };
  }).filter((x): x is NonNullable<typeof x> => !!x), [rows, map, account, currency]);
  const col = (key: keyof typeof map, label: string, optional = false) => (
    <label className="block"><span className="label">{label}</span>
      <select className="input" value={map[key]} onChange={(e) => setMap({ ...map, [key]: e.target.value })}><option value="">{optional ? 'None' : 'Choose a column'}</option>{headers.map((h) => <option key={h}>{h}</option>)}</select>
    </label>
  );
  return (
    <Sheet open onClose={onClose} title="Import bank statement (CSV)" width={620} footer={rows && <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!built.length} onClick={async () => { await createMany('transactions', built); toast(`${built.length} transactions imported`, { tone: 'good' }); onClose(); }}>Import {built.length} transactions</Button></>}>
      {!rows ? (
        <>
          <p className="mb-3 text-sm text-muted">Export a statement from your bank as CSV. You choose which columns hold the date, description and amount, and see a preview before anything is saved.</p>
          <input type="file" accept=".csv,text/csv" className="input" aria-label="Bank CSV file" onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
        </>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {col('date', 'Date')}{col('payee', 'Description')}{col('amount', 'Amount (signed)', true)}{col('category', 'Category', true)}{!map.amount && col('debit', 'Debit / withdrawal', true)}{!map.amount && col('credit', 'Credit / deposit', true)}
            <label className="block"><span className="label">Into account</span><select className="input" value={account} onChange={(e) => setAccount(e.target.value)}><option value="">No account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          </div>
          <p className="text-sm text-muted">{built.length} of {rows.length} rows can be imported. Negative amounts and debits become expenses.</p>
          <div className="scroll-x rounded-xl border border-line">
            <table className="w-full min-w-max text-sm"><tbody>
              {built.slice(0, 6).map((t, i) => <tr key={i} className="border-b border-line last:border-0"><td className="px-3 py-1.5 text-faint">{t.date}</td><td className="max-w-56 truncate px-3 py-1.5">{t.payee}</td><td className={cx('num px-3 py-1.5 text-right', t.type === 'income' ? 'text-good' : '')}>{t.type === 'income' ? '+' : '−'}{fmtMoney(t.amount, currency)}</td></tr>)}
            </tbody></table>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export default function Finance({ sub }: ModuleProps) {
  const tab = tabFrom(sub, TABS);
  const [prefs, setPrefs] = usePrefs();
  const now = useNow();
  const txns = useRecords('transactions') as (Rec & Txn)[];
  const budgets = useRecords('budgets');
  const accounts = useRecords('accounts');
  const subscriptions = useRecords('subscriptions');
  const debts = useRecords('debts');
  const savings = useRecords('savingsGoals');
  const [categories] = useOptions('expenseCategories');
  const [month, setMonth] = useState(ym(now));
  const [importing, setImporting] = useState(false);
  const cur = prefs.currency;
  const rates = useMemo(() => ({ ...DEFAULT_RATES, ...prefs.rates }), [prefs.rates]);
  const money = (n: number, compact = false) => fmtMoney(n, cur, { compact });

  const monthTx = useMemo(() => inMonth(txns, month), [txns, month]);
  const t = useMemo(() => totals(monthTx, cur, rates), [monthTx, cur, rates]);
  const prev = useMemo(() => totals(inMonth(txns, ym(addMonths(parseDate(`${month}-01`)!, -1))), cur, rates), [txns, month, cur, rates]);
  const cats = useMemo(() => byCategory(monthTx, 'expense', cur, rates), [monthTx, cur, rates]);
  const flow = useMemo(() => cashflow(txns, 6, parseDate(`${month}-15`)!, cur, rates).map((f) => ({ label: parseDate(`${f.month}-01`)!.toLocaleDateString(undefined, { month: 'short' }), income: Math.round(f.income), expense: Math.round(f.expense) })), [txns, month, cur, rates]);
  const status = useMemo(() => budgetStatus(budgets, monthTx, cur, rates), [budgets, monthTx, cur, rates]);
  const balances = useMemo(() => accountBalances(accounts.map((a) => ({ id: a.id, openingBalance: Number(a.openingBalance) || 0 })), txns), [accounts, txns]);
  const activeSubs = subscriptions.filter((s) => s.status !== 'cancelled' && s.status !== 'paused');
  const subsMonthly = activeSubs.reduce((a, s) => a + convert(monthlyCost(Number(s.amount) || 0, String(s.cycle)), (s.currency as string) || cur, cur, rates), 0);
  const change = prev.expense ? (t.expense - prev.expense) / prev.expense : null;

  return (
    <Page module="finance" tabs={TABS} tab={tab} wide={tab === 'transactions'} actions={<><Button size="sm" icon="upload" onClick={() => setImporting(true)}>Import</Button><Button variant="primary" size="sm" icon="plus" onClick={() => openEditor('transactions')}>Transaction</Button></>}>
      {(tab === 'overview' || tab === 'budgets' || tab === 'reports') && <div className="mb-4"><MonthPicker month={month} onChange={setMonth} /></div>}

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label="Income" value={money(t.income, true)} icon="arrowDown" tone="good" />
            <Stat label="Expenses" value={money(t.expense, true)} icon="arrowUp" tone="bad" sub={change === null ? undefined : `${change >= 0 ? '+' : ''}${Math.round(change * 100)}% vs last month`} />
            <Stat label="Net" value={money(t.net, true)} icon="wallet" tone={t.net < 0 ? 'bad' : undefined} />
            <Stat label="Savings rate" value={`${Math.round(t.savingsRate * 100)}%`} icon="piggy" tone="accent" />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="Spending breakdown" icon="chart"><div className="card"><Donut data={cats.map((c) => ({ name: c.category, value: Math.round(c.amount) }))} fmt={(v) => money(v, true)} label="Spending by category" center={<div><div className="text-[0.65rem] text-faint">Spent</div><div className="num text-sm font-semibold">{money(t.expense, true)}</div></div>} /></div></Section>
            <Section title="Cash flow, last 6 months" icon="trending"><div className="card"><Bars data={flow} series={[{ key: 'income', name: 'Income', color: 'var(--good)' }, { key: 'expense', name: 'Expenses', color: 'var(--bad)' }]} fmt={(v) => money(v, true)} label="Income and expenses for the last six months" /></div></Section>
          </div>
          {status.filter((s) => s.state !== 'ok').length > 0 && (
            <Section title="Budgets needing attention" icon="warning">
              <div className="card space-y-3">{status.filter((s) => s.state !== 'ok').map((s) => <BudgetRow key={s.category} s={s} money={money} />)}</div>
            </Section>
          )}
          <Section title="Upcoming renewals" icon="repeat" action={<span className="text-sm text-muted">{money(subsMonthly)} / month</span>}>
            {activeSubs.length === 0 ? <p className="text-sm text-faint">No active subscriptions tracked.</p> : (
              <div className="-mx-2">
                {[...activeSubs].sort((a, b) => String(a.nextBillingDate ?? '9').localeCompare(String(b.nextBillingDate ?? '9'))).slice(0, 5).map((s) => (
                  <button key={s.id} type="button" className="row w-full text-left" onClick={() => openEditor('subscriptions', s.id)}>
                    <Icon name="repeat" size={15} className="text-muted" /><span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {s.nextBillingDate && <span className="chip">{fmtDate(s.nextBillingDate)}</span>}<span className="num text-sm">{fmtMoney(Number(s.amount) || 0, (s.currency as string) || cur)}</span>
                  </button>
                ))}
              </div>
            )}
          </Section>
          {txns.length === 0 && <Empty icon="wallet" title="Start with one transaction" hint="Log an expense or import a bank statement — every chart here is calculated from your own entries." action={<Button variant="primary" icon="plus" onClick={() => openEditor('transactions')}>Add transaction</Button>} />}
        </div>
      )}

      {tab === 'transactions' && <CollectionView collection="transactions" emptyHint="Record income, expenses and transfers. Use Import for bank statements." />}

      {tab === 'budgets' && (
        <div className="space-y-4">
          {status.length === 0 ? <Empty icon="gauge" title="No budgets yet" hint="Set a monthly limit per category. You get a warning at 80% and an alert when you go over." action={<Button variant="primary" icon="plus" onClick={() => openEditor('budgets')}>New budget</Button>} /> : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Budgeted" value={money(status.reduce((a, s) => a + s.budget, 0), true)} />
                <Stat label="Spent" value={money(status.reduce((a, s) => a + s.spent, 0), true)} />
                <Stat label="Left" value={money(status.reduce((a, s) => a + s.remaining, 0), true)} tone={status.reduce((a, s) => a + s.remaining, 0) < 0 ? 'bad' : 'good'} />
              </div>
              <div className="card space-y-4">
                {status.map((s) => { const rec = budgets.find((b) => b.category === s.category); return <div key={s.category} role="button" tabIndex={0} className="cursor-pointer" onClick={() => rec && openEditor('budgets', rec.id)} onKeyDown={(e) => e.key === 'Enter' && rec && openEditor('budgets', rec.id)}><BudgetRow s={s} money={money} /></div>; })}
              </div>
              <Button icon="plus" onClick={() => openEditor('budgets')}>Add budget</Button>
              {categories.filter((c) => !budgets.some((b) => b.category === c) && cats.some((x) => x.category === c)).length > 0 && <p className="text-sm text-faint">Unbudgeted spending this month: {categories.filter((c) => !budgets.some((b) => b.category === c) && cats.some((x) => x.category === c)).join(', ')}.</p>}
            </>
          )}
        </div>
      )}

      {tab === 'accounts' && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Stat label="Total across accounts" value={money([...accounts].filter((a) => !a.archived).reduce((sum, a) => sum + convert(balances.get(a.id) ?? 0, (a.currency as string) || cur, cur, rates), 0))} icon="bank" />
            <span className="flex-1" />
            <Button icon="refresh" onClick={() => openEditor('transactions', undefined, { type: 'transfer' })}>Transfer</Button>
            <Button variant="primary" icon="plus" onClick={() => openEditor('accounts')}>Account</Button>
          </div>
          {accounts.length === 0 ? <Empty icon="bank" title="No accounts yet" hint="Add your bank, cash and card accounts. Balances are derived from the opening balance and your transactions." /> : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
              {accounts.filter((a) => !a.archived).map((a) => (
                <button key={a.id} type="button" className="card card-hover relative overflow-hidden text-left" onClick={() => openEditor('accounts', a.id)}>
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background: (a.color as string) ?? 'var(--good)' }} />
                  <div className="flex items-center gap-2 text-sm text-muted"><Icon name={a.type === 'cash' ? 'wallet' : a.type === 'card' ? 'card' : 'bank'} size={15} /><span className="truncate">{a.name}</span></div>
                  <div className={cx('num mt-1.5 text-[1.5rem] font-semibold', (balances.get(a.id) ?? 0) < 0 && 'text-bad')}>{fmtMoney(balances.get(a.id) ?? 0, (a.currency as string) || cur)}</div>
                  <div className="text-xs capitalize text-faint">{String(a.type ?? 'account')} · {txns.filter((x) => x.accountId === a.id || x.toAccountId === a.id).length} transactions</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'subscriptions' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><Stat label="Monthly cost" value={money(subsMonthly)} icon="repeat" /><Stat label="Yearly cost" value={money(subsMonthly * 12, true)} /><Stat label="Active" value={activeSubs.length} /></div>
          <CollectionView collection="subscriptions" emptyHint="Track recurring expenses and subscriptions. You are reminded before each renewal." />
        </>
      )}

      {tab === 'debts' && (
        <>
          {debts.length > 0 && (
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              {debts.map((d) => {
                const months = payoffMonths(Number(d.balance) || 0, Number(d.rate) || 0, Number(d.payment) || 0);
                const paid = Number(d.principal) > 0 ? 1 - (Number(d.balance) || 0) / Number(d.principal) : 0;
                return (
                  <button key={d.id} type="button" className="card card-hover text-left" onClick={() => openEditor('debts', d.id)}>
                    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-semibold">{d.name}</span><span className="chip">{d.kind === 'owed' ? 'Owed to me' : 'I owe'}</span></div>
                    <div className="num mt-1 text-xl font-semibold">{fmtMoney(Number(d.balance) || 0, (d.currency as string) || cur)}</div>
                    {Number(d.principal) > 0 && <Progress value={paid} className="mt-2" color="var(--good)" label="Share repaid" />}
                    <div className="mt-2 text-xs text-muted">{d.kind === 'owed' ? (d.person ? `From ${d.person}` : '') : months === null ? (Number(d.payment) > 0 ? 'The monthly payment does not cover the interest.' : 'Add a monthly payment to estimate the payoff date.') : months === 0 ? 'Paid off' : `About ${months} month${months === 1 ? '' : 's'} to pay off (${addMonths(now, months).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })})`}</div>
                  </button>
                );
              })}
            </div>
          )}
          <CollectionView collection="debts" views={['table']} emptyHint="Track loans and money owed. Add a rate and payment to see a payoff estimate." />
        </>
      )}

      {tab === 'savings' && (
        <>
          {savings.length > 0 && (
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              {savings.map((g) => {
                const target = Number(g.target) || 0;
                const saved = Number(g.saved) || 0;
                const due = parseDate(g.targetDate);
                const monthsLeft = due ? Math.max(1, Math.ceil(diffDays(now, due) / 30)) : null;
                return (
                  <div key={g.id} className="card">
                    <div className="flex items-center gap-2"><button type="button" className="min-w-0 flex-1 truncate text-left font-semibold" onClick={() => openEditor('savingsGoals', g.id)}>{g.name}</button><span className="num text-sm text-muted">{target ? Math.round((saved / target) * 100) : 0}%</span></div>
                    <Progress value={target ? saved / target : 0} color={(g.color as string) ?? 'var(--good)'} className="my-2 !h-2" label={`${g.name} progress`} />
                    <div className="flex flex-wrap items-center gap-2 text-sm"><span className="num">{fmtMoney(saved, (g.currency as string) || cur)} of {fmtMoney(target, (g.currency as string) || cur)}</span><span className="flex-1" />
                      {[1000, 5000].map((n) => <button key={n} type="button" className="btn btn-sm" onClick={() => void update(g.id, { saved: saved + n }, { silent: true })}>+{fmtMoney(n, (g.currency as string) || cur)}</button>)}
                    </div>
                    {monthsLeft && saved < target && <p className="mt-2 text-xs text-muted">Save {fmtMoney(Math.ceil((target - saved) / monthsLeft), (g.currency as string) || cur)} a month to reach it by {fmtDate(g.targetDate, { year: true })}.</p>}
                  </div>
                );
              })}
            </div>
          )}
          <CollectionView collection="savingsGoals" views={['list']} hideToolbar={savings.length > 0} emptyHint="Name what you are saving for and how much you need." />
          {savings.length > 0 && <Button className="mt-2" icon="plus" onClick={() => openEditor('savingsGoals')}>New savings goal</Button>}
        </>
      )}

      {tab === 'reports' && (
        <div className="space-y-5">
          <div className="card">
            <h2 className="text-lg font-semibold">Monthly report · {parseDate(`${month}-01`)!.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
            {monthTx.length === 0 ? <p className="mt-2 text-sm text-faint">No transactions recorded for this month.</p> : (
              <>
                <p className="mt-2 text-muted">You earned <b className="text-good">{money(t.income)}</b> and spent <b className="text-bad">{money(t.expense)}</b>, leaving <b className={t.net < 0 ? 'text-bad' : 'text-text'}>{money(t.net)}</b> — a savings rate of {Math.round(t.savingsRate * 100)}%.{change !== null && ` Spending was ${Math.abs(Math.round(change * 100))}% ${change >= 0 ? 'higher' : 'lower'} than the month before.`}</p>
                <div className="scroll-x mt-3">
                  <table className="w-full min-w-80 text-sm">
                    <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-1.5 font-medium">Category</th><th className="py-1.5 text-right font-medium">Spent</th><th className="py-1.5 text-right font-medium">Share</th><th className="py-1.5 text-right font-medium">Budget</th></tr></thead>
                    <tbody>{cats.map((c) => { const b = status.find((s) => s.category === c.category); return <tr key={c.category} className="border-b border-line/60"><td className="py-1.5">{c.category}</td><td className="num py-1.5 text-right">{money(c.amount)}</td><td className="num py-1.5 text-right text-muted">{Math.round(c.share * 100)}%</td><td className={cx('num py-1.5 text-right', b?.state === 'over' ? 'text-bad' : 'text-muted')}>{b ? money(b.budget) : '—'}</td></tr>; })}</tbody>
                  </table>
                </div>
                <h3 className="eyebrow mb-1 mt-4">Largest expenses</h3>
                <ul className="text-sm">{[...monthTx].filter((x) => x.type === 'expense').sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 5).map((x) => <li key={x.id} className="flex justify-between gap-3 py-1"><span className="truncate">{titleOf(x) === 'Untitled' ? x.category : titleOf(x)} <span className="text-faint">· {fmtDate(x.date)}</span></span><span className="num">{fmtMoney(Number(x.amount) || 0, x.currency || cur)}</span></li>)}</ul>
                <Button className="mt-3" size="sm" icon="download" onClick={() => downloadFile(`lifeos-finance-${month}.csv`, toCsv(monthTx.map((x) => ({ date: x.date, type: x.type, amount: x.amount, currency: x.currency, category: x.category, payee: x.payee, note: x.note })), ['date', 'type', 'amount', 'currency', 'category', 'payee', 'note']), 'text/csv')}>Export this month (CSV)</Button>
              </>
            )}
          </div>
          <Section title="Currencies" icon="globe">
            <div className="card">
              <p className="mb-3 text-sm text-muted">Amounts in other currencies are converted to {cur} with the rates below (units per 1 USD). These are reference values that you maintain — LIFEOS does not fetch live rates.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CURRENCIES.filter((c) => c !== 'USD').map((c) => (
                  <label key={c} className="block"><span className="label">{c}</span><input className="input" type="number" step="any" min="0" value={rates[c]} onChange={(e) => Number(e.target.value) > 0 && setPrefs({ rates: { ...prefs.rates, [c]: Number(e.target.value) } })} /></label>
                ))}
              </div>
              {Object.keys(prefs.rates).length > 0 && <Button className="mt-3" size="sm" icon="undo" onClick={() => setPrefs({ rates: {} })}>Reset to defaults</Button>}
            </div>
          </Section>
        </div>
      )}
      {importing && <BankImport onClose={() => setImporting(false)} currency={cur} />}
    </Page>
  );
}

function BudgetRow({ s, money }: { s: ReturnType<typeof budgetStatus>[number]; money: (n: number) => string }) {
  const color = s.state === 'over' ? 'var(--bad)' : s.state === 'warning' ? 'var(--warn)' : 'var(--good)';
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate font-medium">{s.category}</span><span className="num text-muted">{money(s.spent)} / {money(s.budget)}</span></div>
      <Progress value={Math.min(1, s.ratio)} color={color} label={`${s.category} budget used`} />
      <div className="mt-1 text-xs" style={{ color }}>{s.state === 'over' ? `${money(-s.remaining)} over budget` : s.state === 'warning' ? `${money(s.remaining)} left — ${Math.round(s.ratio * 100)}% used` : `${money(s.remaining)} left`}</div>
    </div>
  );
}
