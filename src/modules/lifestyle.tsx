'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { navigate, openEditor } from '@/core/app';
import { TRIP_STATUSES } from '@/core/collections';
import { getDb, type Rec } from '@/core/data/db';
import { useNow, usePrefs, useRecord, useRecords } from '@/core/data/hooks';
import { create, remove, titleOf, update } from '@/core/data/store';
import { addDays, diffDays, fmtDate, fmtDateTime, nextAnnual, parseDate, ymd } from '@/core/lib/dates';
import { DEFAULT_RATES, convert, fmtMoney, monthlyCost } from '@/core/lib/money';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { CollectionView } from '@/ui/CollectionView';
import { ChecklistInput, type ChecklistItem } from '@/ui/fields';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Empty, IconButton, Menu, Progress, Section, Segmented, Stat, Tabs, cx } from '@/ui/kit';
import { Markdown } from '@/ui/Markdown';
import { confirmDialog, promptDialog, toast } from '@/ui/overlays';

// ── shared pieces ────────────────────────────────────────────────────────────────────────────────

interface DatedItem {
  id: string;
  c: string;
  title: string;
  sub: string;
  date: Date;
  icon: IconName;
}

/** List of dated things with a days-left chip — used for renewals, warranties, expiries and birthdays. */
function DatedList({ items, empty, pastLabel = 'ago' }: { items: DatedItem[]; empty: string; pastLabel?: string }) {
  const now = useNow();
  if (!items.length) return <p className="py-3 text-sm text-faint">{empty}</p>;
  return (
    <div className="-mx-2">
      {items.map((it) => {
        const days = diffDays(now, it.date);
        return (
          <button key={`${it.c}:${it.id}`} type="button" className="row w-full text-left" onClick={() => openEditor(it.c, it.id)}>
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-surface-2 text-muted"><Icon name={it.icon} size={16} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{it.title}</span><span className="block truncate text-xs text-muted">{it.sub} · {fmtDate(it.date, { year: true })}</span></span>
            <span className={cx('chip', days < 0 && '!border-bad/40 !text-bad', days >= 0 && days <= 14 && '!border-warn/40 !text-warn')}>{days < 0 ? `${-days}d ${pastLabel}` : days === 0 ? 'Today' : `${days}d`}</span>
          </button>
        );
      })}
    </div>
  );
}

function useWarranties(): DatedItem[] {
  const purchases = useRecords('purchases');
  const inventory = useRecords('inventory');
  const devices = useRecords('devices');
  return useMemo(() => [
    ...purchases.map((r) => ({ r, c: 'purchases', sub: 'Purchase', icon: 'package' as IconName })),
    ...inventory.map((r) => ({ r, c: 'inventory', sub: 'Inventory', icon: 'boxes' as IconName })),
    ...devices.map((r) => ({ r, c: 'devices', sub: 'Device', icon: 'phone' as IconName })),
  ].filter((x) => parseDate(x.r.warrantyUntil)).map((x) => ({ id: x.r.id, c: x.c, title: titleOf(x.r), sub: `${x.sub} warranty`, date: parseDate(x.r.warrantyUntil)!, icon: x.icon })).sort((a, b) => a.date.getTime() - b.date.getTime()), [purchases, inventory, devices]);
}

/** A checklist stored on a record field, editable in place. */
function InlineChecklist({ rec, field, placeholder, starter }: { rec: Rec; field: string; placeholder?: string; starter?: string[] }) {
  const items = (rec[field] as ChecklistItem[] | undefined) ?? [];
  const done = items.filter((i) => i.done).length;
  return (
    <div>
      {items.length > 0 && <div className="mb-2 flex items-center gap-2"><Progress value={done / items.length} label="Checklist progress" /><span className="num text-xs text-muted">{done}/{items.length}</span></div>}
      <ChecklistInput value={items} onChange={(v) => void update(rec.id, { [field]: v }, { silent: true })} placeholder={placeholder} />
      <div className="mt-2 flex flex-wrap gap-2">
        {starter && items.length === 0 && <Button size="sm" icon="layers" onClick={() => void update(rec.id, { [field]: starter.map((text, i) => ({ id: `t${i}`, text, done: false })) }, { silent: true })}>Start from a template</Button>}
        {done > 0 && <Button size="sm" variant="ghost" icon="undo" onClick={() => void update(rec.id, { [field]: items.map((i) => ({ ...i, done: false })) }, { silent: true })}>Untick all</Button>}
      </div>
    </div>
  );
}

// ── Shopping ─────────────────────────────────────────────────────────────────────────────────────

const SHOP_TABS = [{ value: 'lists', label: 'Lists', icon: 'cart' as const }, { value: 'wishlist', label: 'Wishlist', icon: 'star' as const }, { value: 'inventory', label: 'Inventory', icon: 'boxes' as const }, { value: 'purchases', label: 'Purchases', icon: 'package' as const }, { value: 'warranties', label: 'Warranties', icon: 'shield' as const }];

export function Shopping({ sub }: ModuleProps) {
  const tab = tabFrom(sub, SHOP_TABS);
  const [prefs, setPrefs] = usePrefs();
  const lists = useRecords('shoppingLists');
  const items = useRecords('shoppingItems');
  const inventory = useRecords('inventory');
  const purchases = useRecords('purchases');
  const warranties = useWarranties();
  const now = useNow();
  const [draft, setDraft] = useState('');
  const current = lists.find((l) => l.id === prefs.views.shoppingList) ?? lists[0];
  const mine = items.filter((i) => current && i.listId === current.id);
  const bought = mine.filter((i) => i.done);
  const estimate = mine.reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
  const low = inventory.filter((i) => Number(i.minQty) > 0 && Number(i.qty ?? 0) < Number(i.minQty));
  const restock = low.filter((i) => !mine.some((m) => !m.done && String(m.title).toLowerCase() === String(i.name).toLowerCase()));
  const newList = async () => { const name = await promptDialog({ title: 'New shopping list', placeholder: 'e.g. Weekly groceries', confirmLabel: 'Create' }); if (name?.trim()) setPrefs({ views: { ...prefs.views, shoppingList: (await create('shoppingLists', { name: name.trim(), kind: 'groceries' })).id } }); };
  const add = async () => { if (!draft.trim() || !current) return; for (const line of draft.split(',').map((x) => x.trim()).filter(Boolean)) await create('shoppingItems', { title: line, listId: current.id, qty: 1, done: false }, { silent: true }); setDraft(''); };
  const monthSpend = purchases.filter((p) => String(p.date ?? '').slice(0, 7) === ymd(now).slice(0, 7)).reduce((a, p) => a + (Number(p.price) || 0), 0);

  return (
    <Page module="shopping" tabs={SHOP_TABS} tab={tab}>
      {tab === 'lists' && (
        lists.length === 0 ? <Empty icon="cart" title="No shopping lists yet" hint="Make a list, add items, tick them off in the shop." action={<Button variant="primary" icon="plus" onClick={() => void newList()}>New list</Button>} /> : (
          <>
            <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {lists.map((l) => <button key={l.id} type="button" aria-pressed={current?.id === l.id} onClick={() => setPrefs({ views: { ...prefs.views, shoppingList: l.id } })} className={cx('chip h-9 flex-none px-3 text-sm', current?.id === l.id && 'chip-accent')}>{l.name}<span className="text-faint">{items.filter((i) => i.listId === l.id && !i.done).length}</span></button>)}
              <IconButton icon="plus" label="New list" onClick={() => void newList()} />
              {current && <IconButton icon="pencil" label="Edit this list" onClick={() => openEditor('shoppingLists', current.id)} />}
            </div>
            {current && (
              <>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <Stat label="To buy" value={mine.length - bought.length} icon="cart" />
                  <Stat label="Estimated total" value={fmtMoney(estimate, prefs.currency)} sub="From item prices" />
                  <Stat label="Budget" value={Number(current.budget) > 0 ? fmtMoney(Number(current.budget), prefs.currency) : '—'} tone={Number(current.budget) > 0 && estimate > Number(current.budget) ? 'bad' : undefined} sub={Number(current.budget) > 0 ? (estimate > Number(current.budget) ? `${fmtMoney(estimate - Number(current.budget), prefs.currency)} over` : `${fmtMoney(Number(current.budget) - estimate, prefs.currency)} left`) : 'Set one on the list'} />
                </div>
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3">
                  <Icon name="plus" size={18} className="text-accent" />
                  <input className="min-w-0 flex-1 bg-transparent py-3 outline-none placeholder:text-faint" placeholder="Add items — separate several with commas" aria-label="Add shopping items" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
                </div>
                {restock.length > 0 && (
                  <div className="mb-3 rounded-xl border border-warn/30 bg-warn/10 p-3">
                    <p className="mb-2 text-sm font-medium">Running low at home</p>
                    <div className="flex flex-wrap gap-1.5">{restock.map((i) => <button key={i.id} type="button" className="chip h-8 hover:border-accent" onClick={() => void create('shoppingItems', { title: String(i.name), listId: current.id, qty: Math.max(1, Number(i.minQty) - Number(i.qty ?? 0)), unit: i.unit ?? null, done: false }, { silent: true })}><Icon name="plus" size={12} />{i.name} <span className="text-faint">({Number(i.qty ?? 0)} left)</span></button>)}</div>
                  </div>
                )}
                <CollectionView
                  collection="shoppingItems" views={['list']} viewKey="shopping-items" filter={(r) => r.listId === current.id} defaults={{ listId: current.id }}
                  groupBy={(records) => { const map = new Map<string, Rec[]>(); for (const r of records) (map.get(r.done ? '✓ Bought' : String(r.category ?? 'Other')) ?? map.set(r.done ? '✓ Bought' : String(r.category ?? 'Other'), []).get(r.done ? '✓ Bought' : String(r.category ?? 'Other'))!).push(r); return [...map.entries()].sort((a, b) => Number(a[0].startsWith('✓')) - Number(b[0].startsWith('✓')) || a[0].localeCompare(b[0])).map(([key, list]) => ({ key, label: key, items: list })); }}
                  rowExtra={(r) => (Number(r.qty) > 1 || r.unit ? <span className="chip">{Number(r.qty) || 1}{r.unit ? ` ${r.unit}` : '×'}</span> : null)}
                  toolbar={bought.length > 0 && <Button size="sm" icon="trash" onClick={async () => { for (const b of bought) await remove(b.id, { silent: true }); toast(`${bought.length} bought items cleared`); }}>Clear bought</Button>}
                  emptyHint="Type items above. Give each an aisle to walk the shop once."
                />
              </>
            )}
          </>
        )
      )}
      {tab === 'wishlist' && <CollectionView collection="wishlist" emptyHint="Things you want, with price, link and price notes." />}
      {tab === 'inventory' && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2"><Stat label="Items" value={inventory.length} icon="boxes" /><Stat label="Running low" value={low.length} icon="warning" tone={low.length ? 'warn' : undefined} /><Stat label="Total value" value={fmtMoney(inventory.reduce((a, i) => a + (Number(i.value) || 0), 0), prefs.currency, { compact: true })} /></div>
          <CollectionView collection="inventory" rowExtra={(r) => (Number(r.minQty) > 0 && Number(r.qty ?? 0) < Number(r.minQty) ? <span className="chip !border-warn/40 !text-warn">Restock</span> : null)} emptyHint="What you own, where it is and how many. Set “Restock below” to get shopping suggestions." />
        </>
      )}
      {tab === 'purchases' && (<><div className="mb-3 grid grid-cols-2 gap-2"><Stat label="Spent this month" value={fmtMoney(monthSpend, prefs.currency)} icon="package" /><Stat label="Purchases recorded" value={purchases.length} /></div><CollectionView collection="purchases" /></>)}
      {tab === 'warranties' && <Section title="Warranties by end date" icon="shield"><DatedList items={warranties} empty="Add a “Warranty until” date to a purchase, inventory item or device and it appears here." pastLabel="expired" /></Section>}
    </Page>
  );
}

// ── Travel ───────────────────────────────────────────────────────────────────────────────────────

const PACKING = ['Passport / ID', 'Tickets', 'Phone charger', 'Power bank', 'Medication', 'Toiletries', 'Underwear & socks', 'Sleepwear', 'Comfortable shoes', 'Rain jacket', 'Headphones', 'Reusable water bottle'];
const TRAVEL_DOCS = ['Passport (valid 6+ months)', 'Visa', 'Travel insurance', 'Flight tickets', 'Hotel confirmations', 'Driving licence', 'Emergency contacts', 'Copies of documents'];
const BEFORE = ['Check in online', 'Download offline maps', 'Tell the bank you are travelling', 'Arrange airport transfer', 'Water the plants', 'Empty the fridge', 'Set out-of-office'];
const TRIP_TABS = [{ value: 'overview', label: 'Overview' }, { value: 'itinerary', label: 'Itinerary' }, { value: 'reservations', label: 'Reservations' }, { value: 'packing', label: 'Packing' }, { value: 'documents', label: 'Documents' }, { value: 'expenses', label: 'Expenses' }, { value: 'places', label: 'Places' }, { value: 'notes', label: 'Notes' }] as const;
type TripTab = (typeof TRIP_TABS)[number]['value'];

function TripDetail({ id, tab }: { id: string; tab: TripTab }) {
  const trip = useRecord(id);
  const [prefs] = usePrefs();
  const itinerary = useRecords('itinerary');
  const reservations = useRecords('reservations');
  const txns = useRecords('transactions');
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState('');
  if (trip === undefined) return <Page module="travel" title="Trip">Loading…</Page>;
  if (!trip || trip.deletedAt) return <Page module="travel" title="Trip"><Empty icon="plane" title="Trip not found" action={<Button onClick={() => navigate('/travel')}>All trips</Button>} /></Page>;
  const cur = (trip.currency as string) || prefs.currency;
  const rates = { ...DEFAULT_RATES, ...prefs.rates };
  const scope = (r: Rec) => r.tripId === id;
  const plan = [...itinerary.filter(scope).map((r) => ({ r, c: 'itinerary', at: parseDate(r.date), cost: Number(r.cost) || 0 })), ...reservations.filter(scope).map((r) => ({ r, c: 'reservations', at: parseDate(r.startAt), cost: Number(r.cost) || 0 }))];
  const planned = plan.reduce((a, p) => a + p.cost, 0);
  const spent = txns.filter((t) => scope(t) && t.type === 'expense').reduce((a, t) => a + convert(Number(t.amount) || 0, (t.currency as string) || cur, cur, rates), 0);
  const budget = Number(trip.budget) || 0;
  const start = parseDate(trip.startDate);
  const end = parseDate(trip.endDate);
  const daysTo = start ? diffDays(now, start) : null;
  const timeline = plan.filter((p) => p.at).sort((a, b) => a.at!.getTime() - b.at!.getTime());
  const check = (f: string) => { const list = (trip[f] as ChecklistItem[] | undefined) ?? []; return list.length ? `${list.filter((i) => i.done).length}/${list.length}` : '—'; };
  return (
    <Page
      module="travel" title={String(trip.name)}
      subtitle={<span><button type="button" className="text-accent" onClick={() => navigate('/travel')}>Trips</button> · {trip.destination || 'No destination yet'}{start ? ` · ${fmtDate(start, { year: true })}${end ? ` – ${fmtDate(end, { year: true })}` : ''}` : ''}</span>}
      actions={<><Button size="sm" icon="pencil" onClick={() => openEditor('trips', id)}>Edit</Button><Menu label="Trip actions" items={[{ label: trip.archived ? 'Unarchive' : 'Move to archive', icon: 'archive', onClick: () => void update(id, { archived: !trip.archived }) }, { label: 'Delete trip', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog({ title: `Delete “${trip.name}”?`, danger: true, confirmLabel: 'Delete' })) { await remove(id); navigate('/travel'); } } }]} trigger={(p) => <IconButton icon="more" label="Trip actions" {...p} />} /></>}
    >
      <Tabs className="mb-4" tabs={[...TRIP_TABS]} value={tab} onChange={(v) => navigate(`/travel/${id}${v === 'overview' ? '' : `/${v}`}`)} />
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label={daysTo !== null && daysTo < 0 ? 'Started' : 'Starts in'} value={daysTo === null ? '—' : daysTo < 0 ? `${-daysTo}d ago` : daysTo === 0 ? 'Today' : `${daysTo} days`} icon="plane" tone="accent" sub={start && end ? `${diffDays(start, end) + 1} days long` : undefined} />
            <Stat label="Budget" value={budget ? fmtMoney(budget, cur, { compact: true }) : '—'} icon="wallet" />
            <Stat label="Planned costs" value={fmtMoney(planned, cur, { compact: true })} sub="Itinerary + reservations" tone={budget && planned > budget ? 'bad' : undefined} />
            <Stat label="Spent so far" value={fmtMoney(spent, cur, { compact: true })} sub={budget ? `${Math.round((spent / budget) * 100)}% of budget` : 'Finance transactions'} tone={budget && spent > budget ? 'bad' : undefined} />
          </div>
          {budget > 0 && <Progress value={Math.max(spent, planned) / budget} color={Math.max(spent, planned) > budget ? 'var(--bad)' : undefined} className="!h-2" label="Budget used" />}
          <div className="grid grid-cols-3 gap-2"><Stat label="Packing" value={check('packing')} icon="package" onClick={() => navigate(`/travel/${id}/packing`)} /><Stat label="Documents" value={check('documents')} icon="file" onClick={() => navigate(`/travel/${id}/documents`)} /><Stat label="Before you go" value={check('checklist')} icon="checklist" /></div>
          <Section title="Before you go" icon="checklist"><InlineChecklist rec={trip} field="checklist" starter={BEFORE} placeholder="Add a to-do before the trip…" /></Section>
          <Section title="Travel timeline" icon="clock">
            {timeline.length === 0 ? <p className="text-sm text-faint">Add itinerary items and reservations to see them in time order.</p> : (
              <ol className="relative ml-2 border-l border-line pl-5">
                {timeline.map((p) => <li key={p.r.id} className="relative pb-3"><span className="absolute -left-[26px] top-1.5 size-2.5 rounded-full" style={{ background: p.c === 'reservations' ? 'var(--violet)' : 'var(--accent)' }} /><button type="button" className="text-left" onClick={() => openEditor(p.c, p.r.id)}><span className="block font-medium">{titleOf(p.r)}</span><span className="text-xs text-muted">{fmtDateTime(p.at)} · {String(p.r.kind ?? '')}{p.r.confirmation ? ` · ${p.r.confirmation}` : ''}{p.r.location ? ` · ${p.r.location}` : ''}</span></button></li>)}
              </ol>
            )}
          </Section>
        </div>
      )}
      {tab === 'itinerary' && <CollectionView collection="itinerary" filter={scope} defaults={{ tripId: id, date: start ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), 10).toISOString() : undefined }} viewKey="trip-itinerary" emptyHint="Plan each day: activities, transport, stays and meals." />}
      {tab === 'reservations' && <CollectionView collection="reservations" filter={scope} defaults={{ tripId: id }} viewKey="trip-reservations" emptyHint="Flights, stays and tickets with their confirmation numbers." />}
      {tab === 'packing' && <InlineChecklist rec={trip} field="packing" starter={PACKING} placeholder="Add something to pack…" />}
      {tab === 'documents' && (<div className="space-y-5"><InlineChecklist rec={trip} field="documents" starter={TRAVEL_DOCS} placeholder="Add a document to bring…" /><Section title="Linked documents" icon="file"><CollectionView collection="files" views={['list']} filter={scope} defaults={{ tripId: id }} hideToolbar emptyHint="Link passports, visas and insurance from Documents to this trip." /><Button className="mt-2" size="sm" icon="plus" onClick={() => openEditor('files', undefined, { tripId: id })}>Link a document</Button></Section></div>)}
      {tab === 'expenses' && (<><p className="mb-3 text-sm text-muted">Trip spending is recorded in Finance and tagged to this trip, so it also counts in your budgets and reports.</p><CollectionView collection="transactions" filter={scope} defaults={{ tripId: id, type: 'expense', category: 'Travel' }} viewKey="trip-expenses" addLabel="Add expense" emptyHint="Log what you spend on the trip." /></>)}
      {tab === 'places' && <CollectionView collection="places" filter={scope} defaults={{ tripId: id }} viewKey="trip-places" emptyHint="Sights, restaurants and spots you want to visit." />}
      {tab === 'notes' && (editing ? (
        <div><textarea className="input min-h-72 font-mono text-[0.9rem]" aria-label="Destination notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Markdown supported" autoFocus /><div className="mt-2 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button variant="primary" onClick={() => void update(id, { notes }).then(() => setEditing(false))}>Save notes</Button></div></div>
      ) : (
        <div><div className="mb-2 flex justify-end"><Button size="sm" icon="pencil" onClick={() => { setNotes(String(trip.notes ?? '')); setEditing(true); }}>Edit notes</Button></div>{trip.notes ? <div className="card"><Markdown text={String(trip.notes)} /></div> : <Empty icon="notes" title="No destination notes yet" hint="Language tips, neighbourhoods, things friends recommended." />}</div>
      ))}
    </Page>
  );
}

const TRAVEL_TABS = [{ value: 'trips', label: 'Trips', icon: 'plane' as const }, { value: 'places', label: 'Saved places', icon: 'pin' as const }, { value: 'archive', label: 'Archive', icon: 'archive' as const }];

export function Travel({ sub }: ModuleProps) {
  const trips = useRecords('trips');
  const now = useNow();
  const [prefs] = usePrefs();
  const isList = !sub[0] || TRAVEL_TABS.some((t) => t.value === sub[0]);
  if (!isList) return <TripDetail id={sub[0]} tab={(TRIP_TABS.find((t) => t.value === sub[1])?.value ?? 'overview') as TripTab} />;
  const tab = tabFrom(sub, TRAVEL_TABS);
  const past = (t: Rec) => !!t.archived || t.status === 'completed';
  const list = trips.filter((t) => (tab === 'archive' ? past(t) : !past(t))).sort((a, b) => String(a.startDate ?? '9').localeCompare(String(b.startDate ?? '9')) * (tab === 'archive' ? -1 : 1));
  return (
    <Page module="travel" tabs={TRAVEL_TABS} tab={tab} actions={<Button variant="primary" size="sm" icon="plus" onClick={async () => { const name = await promptDialog({ title: 'New trip', placeholder: 'e.g. Goa in December', confirmLabel: 'Create' }); if (name?.trim()) navigate(`/travel/${(await create('trips', { name: name.trim(), status: 'idea', currency: prefs.currency })).id}`); }}>Trip</Button>}>
      {tab === 'places' ? <CollectionView collection="places" emptyHint="Places you want to go — attach them to a trip later." /> : list.length === 0 ? (
        <Empty icon="plane" title={tab === 'archive' ? 'No past trips yet' : 'No trips planned'} hint={tab === 'archive' ? 'Completed and archived trips are kept here.' : 'Plan the itinerary, packing, documents and budget in one place.'} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3">
          {list.map((t) => { const start = parseDate(t.startDate); const days = start ? diffDays(now, start) : null; const status = TRIP_STATUSES.find((s) => s.value === t.status); return (
            <button key={t.id} type="button" className="card card-hover text-left" onClick={() => navigate(`/travel/${t.id}`)}>
              <div className="flex items-start gap-2"><h3 className="min-w-0 flex-1 truncate font-sans text-[1.02rem] font-semibold tracking-normal">{t.name}</h3>{status && <span className="chip" style={{ color: status.color }}>{status.label}</span>}</div>
              <p className="mt-0.5 truncate text-sm text-muted">{t.destination || 'Destination to be decided'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                {start && <span className="inline-flex items-center gap-1"><Icon name="calendar" size={12} />{fmtDate(start, { year: true })}</span>}
                {days !== null && days >= 0 && <span className="text-accent">{days === 0 ? 'Starts today' : `in ${days} days`}</span>}
                {Number(t.budget) > 0 && <span className="inline-flex items-center gap-1"><Icon name="wallet" size={12} />{fmtMoney(Number(t.budget), (t.currency as string) || prefs.currency, { compact: true })}</span>}
              </div>
            </button>
          ); })}
        </div>
      )}
    </Page>
  );
}

// ── Documents ────────────────────────────────────────────────────────────────────────────────────

const DOC_TABS = [{ value: 'all', label: 'All documents', icon: 'file' as const }, { value: 'expiring', label: 'Expiring', icon: 'alarm' as const }, { value: 'storage', label: 'Storage', icon: 'drive' as const }];
const mb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(0, Math.round(n / 1024))} KB`);

export function Documents({ sub }: ModuleProps) {
  const tab = tabFrom(sub, DOC_TABS);
  const files = useRecords('files');
  const now = useNow();
  const [usage, setUsage] = useState<{ used: number; quota: number; records: number; blobs: number; blobBytes: number } | null>(null);
  useEffect(() => {
    if (tab !== 'storage') return;
    void (async () => {
      const est = (await navigator.storage?.estimate?.()) ?? {};
      const db = getDb();
      const blobs = await db.blobs.toArray();
      setUsage({ used: est.usage ?? 0, quota: est.quota ?? 0, records: await db.records.count(), blobs: blobs.length, blobBytes: blobs.reduce((a, b) => a + b.size, 0) });
    })();
  }, [tab, files.length]);
  const expiring: DatedItem[] = files.filter((f) => parseDate(f.expiresAt) && diffDays(now, parseDate(f.expiresAt)!) <= 90).map((f) => ({ id: f.id, c: 'files', title: titleOf(f), sub: String(f.category ?? 'Document'), date: parseDate(f.expiresAt)!, icon: 'file' as IconName })).sort((a, b) => a.date.getTime() - b.date.getTime());
  return (
    <Page module="files" tabs={DOC_TABS.map((t) => (t.value === 'expiring' ? { ...t, count: expiring.length } : t))} tab={tab}>
      {tab === 'all' && <CollectionView collection="files" rowExtra={(r) => (r.attachment ? <span className="chip"><Icon name="link" size={12} />Attached</span> : null)} emptyHint="Index your important documents: what they are, where they are kept and when they expire." />}
      {tab === 'expiring' && <Section title="Expired or expiring within 90 days" icon="alarm"><DatedList items={expiring} empty="Nothing is close to expiring. Add expiry dates to documents to be reminded in time." pastLabel="expired" /></Section>}
      {tab === 'storage' && (
        <div className="space-y-4">
          {!usage ? <p className="text-sm text-faint">Measuring…</p> : (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4"><Stat label="Used on this device" value={mb(usage.used)} icon="drive" /><Stat label="Available to LIFEOS" value={usage.quota ? `${(usage.quota / 1024 / 1024 / 1024).toFixed(1)} GB` : 'Unknown'} /><Stat label="Records" value={usage.records.toLocaleString()} icon="layers" /><Stat label="Attachments" value={`${usage.blobs} · ${mb(usage.blobBytes)}`} icon="file" /></div>
              {usage.quota > 0 && <Progress value={usage.used / usage.quota} className="!h-2" label="Storage used" />}
            </>
          )}
          <p className="text-sm text-muted">Records sync to your account when you are signed in. Attachments are stored in this browser only: they are not uploaded, and they are not included in synced data. Keep the original files somewhere safe.</p>
          <Button icon="shield" onClick={async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? 'This browser will keep LIFEOS data even when storage is low.' : 'The browser did not grant persistent storage. Installing the app usually enables it.', { tone: ok ? 'good' : 'default' }); }}>Ask the browser to protect this data</Button>
        </div>
      )}
    </Page>
  );
}

// ── Entertainment ────────────────────────────────────────────────────────────────────────────────

const ENT_TABS = [{ value: 'library', label: 'Library', icon: 'film' as const }, { value: 'backlog', label: 'Backlog', icon: 'columns' as const }, { value: 'completed', label: 'Completed', icon: 'checkCircle' as const }, { value: 'next', label: 'What next?', icon: 'sparkles' as const }];
const KINDS = [{ value: 'all', label: 'All' }, { value: 'movie', label: 'Movies' }, { value: 'series', label: 'Series' }, { value: 'book', label: 'Books' }, { value: 'game', label: 'Games' }, { value: 'podcast', label: 'Podcasts' }];

/** Rank the backlog by how well each title's genres match what the user has rated highly. */
export function recommend(media: Rec[]): { rec: Rec; score: number; reason: string }[] {
  const liking = new Map<string, number>();
  for (const m of media) if (Number(m.rating) >= 4) for (const g of (m.genre as string[] | undefined) ?? []) liking.set(g.toLowerCase(), (liking.get(g.toLowerCase()) ?? 0) + (Number(m.rating) - 3));
  return media.filter((m) => m.status === 'backlog').map((m) => {
    const matched = ((m.genre as string[] | undefined) ?? []).filter((g) => liking.has(g.toLowerCase()));
    const score = matched.reduce((a, g) => a + liking.get(g.toLowerCase())!, 0) + (m.recommendedBy ? 1.5 : 0) + (m.favorite ? 1 : 0);
    const reason = matched.length ? `You rate ${matched.slice(0, 2).join(' and ')} highly` : m.recommendedBy ? `Recommended by ${m.recommendedBy}` : 'Waiting in your backlog';
    return { rec: m, score, reason: matched.length && m.recommendedBy ? `${reason} · recommended by ${m.recommendedBy}` : reason };
  }).sort((a, b) => b.score - a.score || a.rec._ca - b.rec._ca);
}

export function Entertainment({ sub }: ModuleProps) {
  const tab = tabFrom(sub, ENT_TABS);
  const media = useRecords('media');
  const [kind, setKind] = useState('all');
  const byKind = (r: Rec) => kind === 'all' || r.kind === kind;
  const done = media.filter((m) => m.status === 'completed' && byKind(m));
  const years = [...new Set(done.map((m) => String(m.finishedAt ?? '').slice(0, 4) || 'Undated'))].sort().reverse();
  const picks = recommend(media.filter(byKind)).slice(0, 8);
  const defaults = kind === 'all' ? undefined : { kind };
  return (
    <Page module="entertainment" tabs={ENT_TABS} tab={tab} wide={tab === 'backlog'} actions={<Button variant="primary" size="sm" icon="plus" onClick={() => openEditor('media', undefined, defaults)}>Title</Button>}>
      <div className="mb-3"><Segmented size="sm" label="Media type" value={kind} onChange={setKind} options={KINDS} /></div>
      {tab === 'library' && <CollectionView collection="media" views={['gallery', 'table', 'list']} viewKey="media-library" filter={byKind} defaults={defaults} emptyHint="Everything you watch, read and play — with status, progress, rating and review." />}
      {tab === 'backlog' && <CollectionView collection="media" views={['board']} viewKey="media-board" filter={byKind} defaults={defaults} />}
      {tab === 'completed' && (
        done.length === 0 ? <Empty icon="checkCircle" title="Nothing completed yet" hint="Titles you mark as completed are collected here by year." /> : (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2"><Stat label="Completed" value={done.length} icon="checkCircle" tone="good" /><Stat label="Average rating" value={done.filter((m) => m.rating).length ? `${(done.reduce((a, m) => a + (Number(m.rating) || 0), 0) / done.filter((m) => m.rating).length).toFixed(1)} ★` : '—'} /><Stat label="Reviews written" value={done.filter((m) => String(m.review ?? '').trim()).length} /></div>
            {years.map((y) => (
              <Section key={y} title={y}>
                <div className="-mx-2">{done.filter((m) => (String(m.finishedAt ?? '').slice(0, 4) || 'Undated') === y).map((m) => (
                  <button key={m.id} type="button" className="row w-full text-left" onClick={() => openEditor('media', m.id)}>
                    <Icon name={m.kind === 'book' ? 'book' : m.kind === 'game' ? 'puzzle' : 'film'} size={16} className="flex-none text-muted" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{m.title}</span>{m.review && <span className="line-clamp-1 text-xs text-muted">{m.review}</span>}</span>
                    {m.rating && <span className="flex-none text-sm text-warn">{'★'.repeat(Number(m.rating))}</span>}
                  </button>
                ))}</div>
              </Section>
            ))}
          </div>
        )
      )}
      {tab === 'next' && (
        picks.length === 0 ? <Empty icon="sparkles" title="Nothing in your backlog" hint="Add titles you want to get to. Suggestions come from your own library: genres you rated 4★ or higher, and who recommended what." /> : (
          <>
            <p className="mb-3 text-sm text-muted">Suggestions from your own backlog, ordered by how well they match what you have rated highly. No external catalogue is used.</p>
            <div className="grid gap-3 md:grid-cols-2">
              {picks.map((p, i) => (
                <div key={p.rec.id} className="card flex items-center gap-3">
                  <span className="num grid size-9 flex-none place-items-center rounded-full bg-accent-soft font-semibold text-accent">{i + 1}</span>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEditor('media', p.rec.id)}><span className="block truncate font-medium">{p.rec.title}</span><span className="block truncate text-xs text-muted">{p.reason}</span></button>
                  <Button size="sm" icon="play" onClick={() => void update(p.rec.id, { status: 'in-progress' }).then(() => toast(`Started “${p.rec.title}”`, { tone: 'good' }))}>Start</Button>
                </div>
              ))}
            </div>
          </>
        )
      )}
    </Page>
  );
}

// ── Digital life ─────────────────────────────────────────────────────────────────────────────────

const DIGITAL_TABS = [{ value: 'bookmarks', label: 'Bookmarks', icon: 'bookmark' as const }, { value: 'apps', label: 'Apps', icon: 'grid' as const }, { value: 'devices', label: 'Devices', icon: 'phone' as const }, { value: 'licenses', label: 'Licences', icon: 'key' as const }, { value: 'accounts', label: 'Accounts', icon: 'user' as const }, { value: 'subscriptions', label: 'Subscriptions', icon: 'repeat' as const }, { value: 'cleanup', label: 'Cleanup', icon: 'sparkles' as const }];
const CLEANUPS: Record<string, string[]> = {
  'Inbox zero': ['Unsubscribe from 5 newsletters', 'Archive everything older than 30 days', 'Create filters for receipts', 'Reply to or delegate flagged mail'],
  'Photo library': ['Delete duplicates and blurry shots', 'Remove old screenshots', 'Create albums for this year', 'Confirm the backup is running'],
  'Account security audit': ['Turn on two-factor for e-mail', 'Turn on two-factor for banking', 'Replace reused passwords', 'Remove unused connected apps', 'Check recovery e-mail and phone'],
  'Files and downloads': ['Empty the downloads folder', 'Clear the desktop', 'Empty the trash', 'Move documents into folders', 'Check free disk space'],
  'Phone tidy-up': ['Delete apps not used in 3 months', 'Review notification permissions', 'Review location permissions', 'Clear offline downloads'],
};

function Cleanup() {
  const lists = useRecords('checklists').filter((c) => ((c.tags as string[] | undefined) ?? []).includes('digital-cleanup'));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{Object.entries(CLEANUPS).map(([name, steps]) => <Button key={name} size="sm" icon="plus" disabled={lists.some((l) => l.title === name)} onClick={() => void create('checklists', { title: name, tags: ['digital-cleanup'], items: steps.map((text, i) => ({ id: `c${i}`, text, done: false })) })}>{name}</Button>)}</div>
      {lists.length === 0 ? <Empty icon="sparkles" title="Pick a cleanup to start" hint="Each one is a checklist you can run again whenever things pile up." /> : (
        <div className="grid gap-3 md:grid-cols-2">{lists.map((l) => <div key={l.id} className="card"><div className="mb-2 flex items-center gap-2"><h3 className="min-w-0 flex-1 truncate font-sans font-semibold tracking-normal">{l.title}</h3><IconButton icon="trash" label={`Delete ${l.title}`} className="!size-8" onClick={() => void remove(l.id)} /></div><InlineChecklist rec={l} field="items" /></div>)}</div>
      )}
    </div>
  );
}

export function Digital({ sub }: ModuleProps) {
  const tab = tabFrom(sub, DIGITAL_TABS);
  const [prefs] = usePrefs();
  const subs = useRecords('subscriptions').filter((s) => s.status !== 'cancelled');
  const NEW: Record<string, string> = { bookmarks: 'bookmarks', apps: 'apps', devices: 'devices', licenses: 'licenses', accounts: 'digitalAccounts', subscriptions: 'subscriptions' };
  const monthly = subs.reduce((a, s) => a + convert(monthlyCost(Number(s.amount) || 0, String(s.cycle)), (s.currency as string) || prefs.currency, prefs.currency, { ...DEFAULT_RATES, ...prefs.rates }), 0);
  return (
    <Page module="digital" tabs={DIGITAL_TABS} tab={tab} actions={NEW[tab] && <Button variant="primary" size="sm" icon="plus" onClick={() => openEditor(NEW[tab])}>Add</Button>}>
      {tab === 'bookmarks' && <CollectionView collection="bookmarks" rowExtra={(r) => <a className="chip hover:border-accent" href={String(r.url)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><Icon name="link" size={12} />Open</a>} emptyHint="Save links into folders. Capture → Link adds one from anywhere." />}
      {tab === 'apps' && <CollectionView collection="apps" emptyHint="The software you rely on, with notes on settings and how-tos." />}
      {tab === 'devices' && <CollectionView collection="devices" emptyHint="Serial numbers and warranty dates, for the day you need them." />}
      {tab === 'licenses' && <CollectionView collection="licenses" emptyHint="Software licences and their renewal dates. Note where the key lives — never the key itself." />}
      {tab === 'accounts' && (<><p className="mb-3 flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted"><Icon name="shield" size={16} className="mt-0.5 flex-none text-good" />This is an index of where you have accounts. LIFEOS has no password field by design — keep passwords in a password manager and paste its item link here.</p><CollectionView collection="digitalAccounts" rowExtra={(r) => (r.managerLink ? <a className="chip hover:border-accent" href={String(r.managerLink)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><Icon name="key" size={12} />Password manager</a> : null)} /></>)}
      {tab === 'subscriptions' && (<><div className="mb-3 grid grid-cols-2 gap-2"><Stat label="Active subscriptions" value={subs.length} icon="repeat" /><Stat label="Monthly cost" value={fmtMoney(monthly, prefs.currency)} sub="Shared with Finance" /></div><CollectionView collection="subscriptions" viewKey="digital-subs" /></>)}
      {tab === 'cleanup' && <Cleanup />}
    </Page>
  );
}

// ── Life admin ───────────────────────────────────────────────────────────────────────────────────

const ADMIN_TABS = [{ value: 'dates', label: 'Dates', icon: 'calendarDays' as const }, { value: 'renewals', label: 'Renewals', icon: 'refresh' as const }, { value: 'warranties', label: 'Warranties', icon: 'shield' as const }, { value: 'maintenance', label: 'Maintenance', icon: 'wrench' as const }, { value: 'contacts', label: 'Contacts', icon: 'users' as const }, { value: 'appointments', label: 'Appointments', icon: 'calendar' as const }];

export function Admin({ sub }: ModuleProps) {
  const tab = tabFrom(sub, ADMIN_TABS);
  const now = useNow();
  const dates = useRecords('dates');
  const subscriptions = useRecords('subscriptions');
  const licenses = useRecords('licenses');
  const files = useRecords('files');
  const maintenance = useRecords('maintenance');
  const contacts = useRecords('contacts');
  const warranties = useWarranties();
  const [kind, setKind] = useState('all');

  const upcomingDates: (DatedItem & { extra: ReactNode })[] = dates.map((d) => {
    const base = parseDate(d.date);
    const next = d.repeatYearly === false ? base : nextAnnual(d.date, now);
    if (!base || !next) return null;
    const turning = d.kind === 'birthday' || d.kind === 'anniversary' ? next.getFullYear() - base.getFullYear() : 0;
    return { id: d.id, c: 'dates', title: titleOf(d), sub: `${String(d.kind ?? 'date').replace(/^./, (c) => c.toUpperCase())}${turning > 0 ? (d.kind === 'birthday' ? ` · turns ${turning}` : ` · ${turning} years`) : ''}`, date: next, icon: (d.kind === 'birthday' ? 'heart' : 'calendarDays') as IconName, extra: null };
  }).filter((x): x is NonNullable<typeof x> => !!x && (x.date >= addDays(now, -1))).sort((a, b) => a.date.getTime() - b.date.getTime());

  const renewals: DatedItem[] = [
    ...subscriptions.filter((s) => s.status !== 'cancelled' && parseDate(s.nextBillingDate)).map((s) => ({ id: s.id, c: 'subscriptions', title: titleOf(s), sub: 'Subscription renewal', date: parseDate(s.nextBillingDate)!, icon: 'repeat' as IconName })),
    ...licenses.filter((l) => parseDate(l.renewalDate)).map((l) => ({ id: l.id, c: 'licenses', title: titleOf(l), sub: 'Licence renewal', date: parseDate(l.renewalDate)!, icon: 'key' as IconName })),
    ...files.filter((f) => parseDate(f.expiresAt)).map((f) => ({ id: f.id, c: 'files', title: titleOf(f), sub: 'Document expiry', date: parseDate(f.expiresAt)!, icon: 'file' as IconName })),
    ...maintenance.filter((m) => parseDate(m.nextDue)).map((m) => ({ id: m.id, c: 'maintenance', title: titleOf(m), sub: `${String(m.kind ?? 'Maintenance').replace(/^./, (c) => c.toUpperCase())} maintenance`, date: parseDate(m.nextDue)!, icon: 'wrench' as IconName })),
    ...dates.filter((d) => d.kind === 'renewal' && parseDate(d.date)).map((d) => ({ id: d.id, c: 'dates', title: titleOf(d), sub: 'Renewal', date: (d.repeatYearly === false ? parseDate(d.date) : nextAnnual(d.date, now))!, icon: 'refresh' as IconName })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const markDone = async (m: Rec) => {
    const interval = Number(m.intervalDays) || 0;
    await update(m.id, { lastDone: ymd(now), nextDue: interval > 0 ? ymd(addDays(now, interval)) : null });
    toast(interval > 0 ? `Done. Next due ${fmtDate(addDays(now, interval), { year: true })}.` : 'Marked as done.', { tone: 'good' });
  };
  const emergency = contacts.filter((c) => c.emergency);
  const NEW: Record<string, [string, Record<string, unknown> | undefined]> = { dates: ['dates', undefined], renewals: ['dates', { kind: 'renewal' }], warranties: ['purchases', undefined], maintenance: ['maintenance', kind === 'all' ? undefined : { kind }], contacts: ['contacts', undefined], appointments: ['events', { category: 'Appointment' }] };

  return (
    <Page module="admin" tabs={ADMIN_TABS} tab={tab} actions={<Button variant="primary" size="sm" icon="plus" onClick={() => openEditor(NEW[tab][0], undefined, NEW[tab][1])}>Add</Button>}>
      {tab === 'dates' && (<div className="space-y-5"><Section title="Coming up" icon="calendarDays"><DatedList items={upcomingDates.slice(0, 12)} empty="Add birthdays, anniversaries and other dates you never want to miss." /></Section><Section title="All dates" icon="list"><CollectionView collection="dates" viewKey="admin-dates" /></Section></div>)}
      {tab === 'renewals' && <Section title="Every renewal and expiry, in date order" icon="refresh"><DatedList items={renewals} empty="Renewals from subscriptions, licences, documents and maintenance are gathered here automatically." pastLabel="overdue" /></Section>}
      {tab === 'warranties' && <Section title="Warranties by end date" icon="shield"><DatedList items={warranties} empty="Add a “Warranty until” date to a purchase, inventory item or device." pastLabel="expired" /></Section>}
      {tab === 'maintenance' && (
        <>
          <div className="mb-3"><Segmented size="sm" label="Maintenance type" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'vehicle', label: 'Vehicle' }, { value: 'household', label: 'Household' }, { value: 'other', label: 'Other' }]} /></div>
          <CollectionView collection="maintenance" viewKey="admin-maintenance" filter={(r) => kind === 'all' || r.kind === kind} defaults={kind === 'all' ? undefined : { kind }} rowExtra={(r) => <button type="button" className="chip hover:border-accent" onClick={(e) => { e.stopPropagation(); void markDone(r); }}><Icon name="check" size={12} />Mark done</button>} emptyHint="Car services, filter changes, annual checks — set an interval and the next date is worked out when you mark it done." />
        </>
      )}
      {tab === 'contacts' && (
        <>
          {emergency.length > 0 && (
            <Section title="Emergency contacts" icon="warning" className="mb-4">
              <div className="grid gap-2 sm:grid-cols-2">{emergency.map((c) => (
                <div key={c.id} className="card flex items-center gap-3 !border-bad/30">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEditor('contacts', c.id)}><span className="block truncate font-semibold">{c.name}</span><span className="block truncate text-sm capitalize text-muted">{String(c.relation ?? '')}{c.phone ? ` · ${c.phone}` : ''}</span></button>
                  {c.phone && <a className="btn btn-sm btn-primary" href={`tel:${String(c.phone).replace(/[^+\d]/g, '')}`}>Call</a>}
                </div>
              ))}</div>
            </Section>
          )}
          <CollectionView collection="contacts" emptyHint="Important people and the notes you want at hand. Mark emergency contacts to pin them here." />
        </>
      )}
      {tab === 'appointments' && <CollectionView collection="events" views={['list', 'calendar']} viewKey="admin-appointments" filter={(r) => r.category === 'Appointment'} defaults={{ category: 'Appointment' }} addLabel="New appointment" emptyHint="Appointments are calendar events in the Appointment category, so they also show in Calendar with reminders." />}
    </Page>
  );
}
