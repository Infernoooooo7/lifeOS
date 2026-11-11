'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ACCENTS, navigate, useApp, type Prefs } from '@/core/app';
import { COLLECTIONS, OPTION_SETS, collection as collectionDef } from '@/core/collections';
import { getDb } from '@/core/data/db';
import { useConflicts, useModules, usePrefs, useRecords, useSetting, useSync } from '@/core/data/hooks';
import { ApiError, api, writeIdentity, type AccountUser } from '@/core/data/session';
import { create, getRec, remove, restore, update } from '@/core/data/store';
import { syncNow } from '@/core/data/syncClient';
import { applyImport, downloadFile, exportBackup, parseBackup, planImport, type BackupFile, type ConflictMode, type ImportPlan } from '@/core/lib/backup';
import { fmtDateTime, timeAgo, ymd } from '@/core/lib/dates';
import { CURRENCIES } from '@/core/lib/money';
import { isIos, promptInstall, useInstall } from '@/core/install';
import { MODULES, featureCounts } from '@/core/registry';
import { switchWorkspace } from '@/shell/AppRoot';
import { requestNotificationPermission } from '@/shell/engines';
import { openHit } from '@/shell/Palette';
import { Page, type ModuleProps } from '@/shell/Page';
import { useNavModules } from '@/shell/Shell';
import { exportCsv } from '@/ui/CollectionView';
import { recordTitle } from '@/ui/fields';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Empty, Field, IconButton, Segmented, Switch, cx } from '@/ui/kit';
import { confirmDialog, promptDialog, toast } from '@/ui/overlays';

const SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: 'general', label: 'Profile', icon: 'user' }, { id: 'appearance', label: 'Appearance', icon: 'palette' }, { id: 'navigation', label: 'Navigation', icon: 'menu' },
  { id: 'formats', label: 'Formats', icon: 'calendarDays' }, { id: 'notifications', label: 'Notifications', icon: 'bell' }, { id: 'workspaces', label: 'Workspaces', icon: 'layers' },
  { id: 'categories', label: 'Categories', icon: 'tag' }, { id: 'data', label: 'Backup & data', icon: 'download' }, { id: 'sync', label: 'Sync', icon: 'cloud' },
  { id: 'account', label: 'Account & security', icon: 'shield' }, { id: 'about', label: 'About & install', icon: 'info' },
];

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-0">
      <div className="min-w-0 flex-1 basis-48"><div className="font-medium">{title}</div>{hint && <div className="text-sm text-muted">{hint}</div>}</div>
      <div className="flex max-w-full flex-none flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
const Card = ({ title, children, tone }: { title?: string; children: ReactNode; tone?: 'danger' }) => <section className={cx('card mb-4', tone === 'danger' && '!border-bad/30')}>{title && <h2 className="mb-1 font-sans text-[1.02rem] font-semibold tracking-normal">{title}</h2>}{children}</section>;

// ── sections ─────────────────────────────────────────────────────────────────────────────────────

function Profile() {
  const identity = useApp((s) => s.identity);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [name, setName] = useState('');
  useEffect(() => {
    if (identity?.mode === 'account') void api<{ user: AccountUser }>('auth/me').then((r) => { setUser(r.user); setName(r.user.displayName); }).catch(() => undefined);
  }, [identity]);
  if (identity?.mode !== 'account') {
    return (
      <Card title="You are using LIFEOS on this device only">
        <p className="mt-1 text-muted">Everything is stored in this browser. Create an account to sync between your phone, tablet and PC — your existing data comes with you.</p>
        <Button variant="primary" className="mt-3" icon="user" onClick={() => { writeIdentity(null); window.location.href = '/app'; }}>Create account or sign in</Button>
      </Card>
    );
  }
  const save = async () => {
    try {
      const res = await api<{ user: AccountUser }>('auth/me', { method: 'PATCH', body: { displayName: name } });
      setUser(res.user);
      writeIdentity({ mode: 'account', userId: res.user.id, email: res.user.email, displayName: res.user.displayName });
      useApp.setState({ identity: { mode: 'account', userId: res.user.id, email: res.user.email, displayName: res.user.displayName } });
      toast('Profile saved', { tone: 'good' });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save', { tone: 'bad' });
    }
  };
  return (
    <Card title="Profile">
      <Row title="E-mail" hint="Used to sign in.">{identity.email}</Row>
      <Row title="Display name" hint="Shown in greetings."><input className="input !w-56" aria-label="Display name" value={name} onChange={(e) => setName(e.target.value)} /><Button variant="primary" disabled={!user || name === user.displayName} onClick={() => void save()}>Save</Button></Row>
      {user && <Row title="Member since">{new Date(user.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</Row>}
    </Card>
  );
}

function Appearance({ prefs, set }: { prefs: Prefs; set: (p: Partial<Prefs>) => void }) {
  return (
    <Card title="Appearance">
      <Row title="Theme"><Segmented label="Theme" value={prefs.theme} onChange={(theme) => set({ theme })} options={[{ value: 'dark', label: 'Dark', icon: 'moon' }, { value: 'light', label: 'Light', icon: 'sun' }, { value: 'system', label: 'System', icon: 'monitor' }]} /></Row>
      <Row title="Accent colour" hint="Tints buttons, highlights and charts.">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">{ACCENTS.map((a) => <button key={a.hue} type="button" role="radio" aria-checked={prefs.accentHue === a.hue} aria-label={a.name} title={a.name} onClick={() => set({ accentHue: a.hue })} className={cx('size-9 rounded-full border-2', prefs.accentHue === a.hue ? 'border-text' : 'border-transparent')} style={{ background: `oklch(0.75 0.15 ${a.hue})` }} />)}</div>
      </Row>
      <Row title="Custom hue" hint="Any hue from 0 to 360."><input type="range" min={0} max={360} step={5} value={prefs.accentHue} aria-label="Accent hue" onChange={(e) => set({ accentHue: Number(e.target.value) })} className="h-9 w-48 accent-[var(--accent)]" /></Row>
      <Row title="Density" hint="How tightly rows and cards are spaced."><Segmented label="Interface density" value={prefs.density} onChange={(density) => set({ density })} options={[{ value: 'compact', label: 'Compact' }, { value: 'default', label: 'Default' }, { value: 'comfortable', label: 'Comfortable' }]} /></Row>
      <Row title="Widget style"><Segmented label="Widget style" value={prefs.widgetStyle} onChange={(widgetStyle) => set({ widgetStyle })} options={[{ value: 'glass', label: 'Glass' }, { value: 'solid', label: 'Solid' }, { value: 'outline', label: 'Outline' }]} /></Row>
      <Row title="Reduce motion" hint="Turns off transitions and 3D animation. Your system setting is always respected."><Switch checked={prefs.motion === 'reduced'} onChange={(v) => set({ motion: v ? 'reduced' : 'full' })} label="Reduce motion" /></Row>
      <Row title="Spatial quality" hint="Auto adapts resolution and detail to the device."><Segmented label="Spatial quality" value={prefs.spatialQuality} onChange={(spatialQuality) => set({ spatialQuality })} options={[{ value: 'auto', label: 'Auto' }, { value: 'low', label: 'Low' }, { value: 'high', label: 'High' }]} /></Row>
    </Card>
  );
}

const QUICK_KINDS: [string, string][] = [['task', 'Task'], ['note', 'Note'], ['event', 'Event'], ['expense', 'Expense'], ['idea', 'Idea'], ['reminder', 'Reminder'], ['link', 'Link'], ['goal', 'Goal'], ['journal', 'Journal']];

function Navigation({ prefs, set }: { prefs: Prefs; set: (p: Partial<Prefs>) => void }) {
  const nav = useNavModules();
  const order = nav.map((m) => m.def.id);
  const move = (id: string, dir: -1 | 1) => { const i = order.indexOf(id); const j = i + dir; if (j < 0 || j >= order.length) return; const next = [...order]; [next[i], next[j]] = [next[j], next[i]]; set({ sidebar: next }); };
  return (
    <>
      <Card title="Sidebar order">
        <p className="mb-2 text-sm text-muted">Reorder your active modules. Favourites (starred in the Marketplace) always stay on top.</p>
        <ul>{nav.map((m, i) => (
          <li key={m.def.id} className="row"><Icon name={m.def.icon} size={17} className="text-muted" /><span className="min-w-0 flex-1 truncate">{m.def.name}</span>{m.favorite && <Icon name="star" size={14} className="fill-warn text-warn" />}
            <IconButton icon="arrowUp" label={`Move ${m.def.name} up`} disabled={i === 0} onClick={() => move(m.def.id, -1)} /><IconButton icon="arrowDown" label={`Move ${m.def.name} down`} disabled={i === nav.length - 1} onClick={() => move(m.def.id, 1)} /></li>
        ))}</ul>
        <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" icon="undo" disabled={!prefs.sidebar.length} onClick={() => set({ sidebar: [] })}>Reset order</Button><Button size="sm" icon="store" onClick={() => navigate('/marketplace')}>Activate or deactivate modules</Button></div>
      </Card>
      <Card title="Phone tab bar">
        <p className="mb-2 text-sm text-muted">Home, Capture and More are fixed. Choose the two modules beside them.</p>
        <div className="grid grid-cols-2 gap-2">{[0, 1].map((slot) => <select key={slot} className="input" aria-label={`Tab ${slot + 1}`} value={prefs.mobileTabs[slot] ?? ''} onChange={(e) => { const next = [...prefs.mobileTabs]; next[slot] = e.target.value; set({ mobileTabs: next }); }}>{nav.map((m) => <option key={m.def.id} value={m.def.id}>{m.def.name}</option>)}</select>)}</div>
      </Card>
      <Card title="Quick actions">
        <p className="mb-2 text-sm text-muted">Shown in the context panel on wide screens.</p>
        <div className="flex flex-wrap gap-1.5">{QUICK_KINDS.map(([id, label]) => { const on = prefs.quickActions.includes(id); return <button key={id} type="button" aria-pressed={on} onClick={() => set({ quickActions: on ? prefs.quickActions.filter((x) => x !== id) : [...prefs.quickActions, id] })} className={cx('chip h-9 px-3 text-sm', on && 'chip-accent')}>{label}</button>; })}</div>
      </Card>
      <Card title="Start screen">
        <Row title="Open Home as" hint="Spatial shows the 3D workspace when you open LIFEOS."><Segmented label="Start mode" value={prefs.mode} onChange={(mode) => set({ mode })} options={[{ value: 'standard', label: 'Standard', icon: 'dashboard' }, { value: 'spatial', label: 'Spatial', icon: 'orbit' }]} /></Row>
        <Row title="Context panel" hint="Upcoming events, priorities and reminders beside every module (wide screens)."><Switch checked={prefs.rightPanel} onChange={(v) => set({ rightPanel: v })} label="Show context panel" /></Row>
      </Card>
    </>
  );
}

function Formats({ prefs, set }: { prefs: Prefs; set: (p: Partial<Prefs>) => void }) {
  return (
    <Card title="Dates, time and money">
      <Row title="Date format" hint={`Example: ${prefs.dateStyle === 'ymd' ? ymd() : new Date().toLocaleDateString(prefs.dateStyle === 'mdy' ? 'en-US' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}><Segmented label="Date format" value={prefs.dateStyle} onChange={(dateStyle) => set({ dateStyle })} options={[{ value: 'dmy', label: 'Day Month' }, { value: 'mdy', label: 'Month Day' }, { value: 'ymd', label: 'YYYY-MM-DD' }]} /></Row>
      <Row title="Time format"><Segmented label="Time format" value={prefs.hour12 ? '12' : '24'} onChange={(v) => set({ hour12: v === '12' })} options={[{ value: '12', label: '12-hour' }, { value: '24', label: '24-hour' }]} /></Row>
      <Row title="Week starts on"><Segmented label="Week start" value={String(prefs.weekStart)} onChange={(v) => set({ weekStart: Number(v) as 0 | 1 })} options={[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]} /></Row>
      <Row title="Default currency" hint="Used for new transactions and for totals."><select className="input !w-32" aria-label="Default currency" value={prefs.currency} onChange={(e) => set({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Row>
      <Row title="Working hours" hint="Used by the availability finder and time blocking."><input type="time" className="input !w-32" aria-label="Work starts" value={prefs.workHours.from} onChange={(e) => set({ workHours: { ...prefs.workHours, from: e.target.value } })} /><span className="text-muted">to</span><input type="time" className="input !w-32" aria-label="Work ends" value={prefs.workHours.to} onChange={(e) => set({ workHours: { ...prefs.workHours, to: e.target.value } })} /></Row>
      <Row title="Daily water target"><input type="number" min={500} max={6000} step={250} className="input !w-28" aria-label="Water target in millilitres" value={prefs.waterTarget} onChange={(e) => set({ waterTarget: Math.max(250, Number(e.target.value) || 2000) })} /><span className="text-muted">ml</span></Row>
    </Card>
  );
}

function Notifications({ prefs, set }: { prefs: Prefs; set: (p: Partial<Prefs>) => void }) {
  const n = prefs.notify;
  const patch = (p: Partial<Prefs['notify']>) => set({ notify: { ...n, ...p } });
  const supported = typeof Notification !== 'undefined';
  const permission = supported ? Notification.permission : 'unsupported';
  const kinds: [keyof Prefs['notify'], string, string][] = [['tasks', 'Tasks', 'Due today, due soon and overdue'], ['events', 'Events', 'Before an event starts'], ['habits', 'Habits', 'At a habit’s reminder time, if not done yet'], ['renewals', 'Renewals and expiries', 'Subscriptions, licences, documents and maintenance'], ['dates', 'Important dates', 'Birthdays, anniversaries and other dates']];
  return (
    <>
      <Card title="What to be reminded about">{kinds.map(([k, title, hint]) => <Row key={k} title={title} hint={hint}><Switch checked={!!n[k]} onChange={(v) => patch({ [k]: v })} label={`${title} reminders`} /></Row>)}
        <Row title="Event lead time" hint="When an event has no reminders of its own."><select className="input !w-32" aria-label="Event lead time" value={n.eventLead} onChange={(e) => patch({ eventLead: Number(e.target.value) })}>{[0, 5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m === 0 ? 'At start' : `${m} min before`}</option>)}</select></Row>
        <Row title="Days ahead" hint="For renewals and important dates without their own setting."><input type="number" min={0} max={60} className="input !w-24" aria-label="Days ahead" value={n.leadDays} onChange={(e) => patch({ leadDays: Math.max(0, Number(e.target.value) || 0) })} /></Row>
      </Card>
      <Card title="System notifications">
        <p className="mb-1 text-sm text-muted">Reminders always arrive in the in-app inbox. System notifications additionally appear outside the window while LIFEOS is open in the background. Notifications while the app is fully closed are not available yet.</p>
        <Row title="Show system notifications" hint={permission === 'denied' ? 'Blocked in your browser settings for this site — allow notifications there first.' : permission === 'unsupported' ? 'This browser does not support notifications.' : 'You are asked for permission once, only when you switch this on.'}>
          <Switch checked={n.browser && permission === 'granted'} disabled={permission === 'denied' || permission === 'unsupported'} label="System notifications" onChange={async (v) => { if (!v) return patch({ browser: false }); const result = await requestNotificationPermission(); patch({ browser: result === 'granted', asked: true }); if (result !== 'granted') toast('Permission was not granted.'); }} />
        </Row>
      </Card>
      <Card title="Quiet hours">
        <Row title="Pause pop-ups" hint="Reminders still collect in the inbox; nothing pops up during these hours."><Switch checked={prefs.quiet.enabled} onChange={(v) => set({ quiet: { ...prefs.quiet, enabled: v } })} label="Quiet hours" /></Row>
        {prefs.quiet.enabled && <Row title="From / to"><input type="time" className="input !w-32" aria-label="Quiet from" value={prefs.quiet.from} onChange={(e) => set({ quiet: { ...prefs.quiet, from: e.target.value } })} /><span className="text-muted">to</span><input type="time" className="input !w-32" aria-label="Quiet until" value={prefs.quiet.to} onChange={(e) => set({ quiet: { ...prefs.quiet, to: e.target.value } })} /></Row>}
      </Card>
    </>
  );
}

function Workspaces() {
  const workspaces = useRecords('workspaces');
  const current = useApp((s) => s.ws);
  const removeWorkspace = async (id: string, name: string) => {
    const records = await getDb().records.filter((r) => r.ws === id && !r.deletedAt).toArray();
    const ok = await confirmDialog({ title: `Delete workspace “${name}”?`, body: records.length ? `Its ${records.length} item${records.length === 1 ? '' : 's'} will be moved to Personal so nothing is lost.` : 'It is empty.', danger: true, confirmLabel: records.length ? 'Move items and delete' : 'Delete' });
    if (!ok) return;
    for (const r of records) await update(r.id, { ws: 'personal' }, { silent: true });
    if (current === id) switchWorkspace('personal');
    await remove(id, { silent: true });
    toast('Workspace deleted');
  };
  return (
    <Card title="Workspaces">
      <p className="mb-2 text-sm text-muted">A workspace is a separate space with its own tasks, notes, projects and other records — for example Personal and Work. Settings and modules are shared.</p>
      <div className="row"><span className="grid size-7 place-items-center rounded-md bg-accent text-xs font-bold text-accent-ink">P</span><span className="flex-1 font-medium">Personal</span>{current === 'personal' ? <span className="chip chip-accent">Current</span> : <Button size="sm" onClick={() => switchWorkspace('personal')}>Switch</Button>}</div>
      {workspaces.map((w) => (
        <div key={w.id} className="row"><span className="grid size-7 place-items-center rounded-md text-xs font-bold text-accent-ink" style={{ background: (w.color as string) ?? 'var(--violet)' }}>{String(w.name).slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
          {current === w.id ? <span className="chip chip-accent">Current</span> : <Button size="sm" onClick={() => switchWorkspace(w.id)}>Switch</Button>}
          <IconButton icon="pencil" label={`Rename ${w.name}`} onClick={async () => { const n = await promptDialog({ title: 'Rename workspace', initial: String(w.name) }); if (n?.trim()) await update(w.id, { name: n.trim() }, { silent: true }); }} />
          <IconButton icon="trash" label={`Delete ${w.name}`} onClick={() => void removeWorkspace(w.id, String(w.name))} /></div>
      ))}
      <Button className="mt-2" icon="plus" onClick={async () => { const n = await promptDialog({ title: 'New workspace', placeholder: 'e.g. Work', confirmLabel: 'Create' }); if (n?.trim()) switchWorkspace((await create('workspaces', { name: n.trim() })).id); }}>New workspace</Button>
    </Card>
  );
}

const SET_LABELS: Record<string, string> = { expenseCategories: 'Expense categories', incomeCategories: 'Income categories', eventCategories: 'Event categories', habitCategories: 'Habit categories', lifeAreas: 'Life areas', fileCategories: 'Document categories', shoppingCategories: 'Shopping aisles', inventoryLocations: 'Inventory locations', muscles: 'Muscle groups', bookmarkFolders: 'Bookmark folders', accountCategories: 'Online account categories' };

function Categories() {
  const [custom, setCustom] = useSetting<Record<string, string[]>>('options', {});
  const [fields] = useSetting<Record<string, { k: string; label: string; t: string }[]>>('customFields', {});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const add = (key: string) => { const v = (drafts[key] ?? '').trim(); if (!v || OPTION_SETS[key].includes(v) || custom[key]?.includes(v)) return; setCustom({ ...custom, [key]: [...(custom[key] ?? []), v] }); setDrafts({ ...drafts, [key]: '' }); };
  return (
    <>
      <Card title="Personal categories">
        <p className="mb-3 text-sm text-muted">Add your own values to any list. Built-in values stay; yours can be removed (records that already use them keep their value).</p>
        <div className="space-y-4">
          {Object.keys(OPTION_SETS).map((key) => (
            <div key={key}>
              <h3 className="label">{SET_LABELS[key] ?? key}</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {OPTION_SETS[key].map((v) => <span key={v} className="chip">{v}</span>)}
                {(custom[key] ?? []).map((v) => <span key={v} className="chip chip-accent">{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => setCustom({ ...custom, [key]: custom[key].filter((x) => x !== v) })}><Icon name="x" size={12} /></button></span>)}
                <input className="input !min-h-8 !w-36 !py-0.5 text-sm" placeholder="Add…" aria-label={`Add to ${SET_LABELS[key] ?? key}`} value={drafts[key] ?? ''} onChange={(e) => setDrafts({ ...drafts, [key]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add(key)} onBlur={() => add(key)} />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Custom fields">
        <p className="text-sm text-muted">Add your own fields to any collection from that collection’s ⋯ menu → “Custom fields…”.</p>
        {Object.entries(fields).filter(([, list]) => list.length).map(([c, list]) => <p key={c} className="mt-2 text-sm"><span className="font-medium">{collectionDef(c).label}:</span> {list.map((f) => f.label).join(', ')}</p>)}
      </Card>
    </>
  );
}

function DataSection() {
  const identity = useApp((s) => s.identity);
  const activity = useRecords('activity');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [file, setFile] = useState<BackupFile | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ConflictMode>('keep');
  const [trash, setTrash] = useState<{ id: string; _c: string; _ua: number; title: string }[] | null>(null);

  useEffect(() => {
    void getDb().records.toArray().then((all) => { const c: Record<string, number> = {}; for (const r of all) if (!r.deletedAt) c[r._c] = (c[r._c] ?? 0) + 1; setCounts(c); });
  }, [activity.length]);
  const loadTrash = async () => setTrash((await getDb().records.filter((r) => !!r.deletedAt && !['notifications', 'activity', 'noteVersions'].includes(r._c)).toArray()).sort((a, b) => b._ua - a._ua).slice(0, 200).map((r) => ({ id: r.id, _c: r._c, _ua: r._ua, title: recordTitle(r._c, r) })));
  const names = Object.keys(counts).sort((a, b) => collectionDef(a).label.localeCompare(collectionDef(b).label));

  const exportAll = async () => { const data = await exportBackup(); downloadFile(`lifeos-backup-${ymd()}.json`, JSON.stringify(data, null, 1)); toast(`Backup created with ${data.records.length} records`, { tone: 'good' }); };
  const exportSelected = async () => { const data = await exportBackup({ collections: [...selected] }); downloadFile(`lifeos-export-${ymd()}.json`, JSON.stringify(data, null, 1)); };
  const exportSelectedCsv = async () => { for (const c of selected) { const rows = await getDb().records.where('_c').equals(c).filter((r) => !r.deletedAt).toArray(); if (rows.length && COLLECTIONS[c]?.fields.length) exportCsv(c, COLLECTIONS[c].fields, rows); } };
  const openFile = async (f: File) => {
    const parsed = parseBackup(await f.text());
    if (!parsed.ok) return toast(parsed.error, { tone: 'bad' });
    const p = await planImport(parsed.file);
    setFile(parsed.file);
    setPlan(p);
    setChosen(new Set(Object.keys(p.perCollection)));
    if (parsed.skipped) toast(`${parsed.skipped} malformed records in the file were skipped.`);
  };
  const run = async () => {
    if (!file) return;
    const scoped = await planImport(file, [...chosen]);
    const result = await applyImport(scoped, mode);
    toast(`Restore complete: ${result.added} added${result.replaced ? `, ${result.replaced} replaced` : ''}${result.copied ? `, ${result.copied} copied` : ''}.`, { tone: 'good', duration: 7000 });
    setFile(null);
    setPlan(null);
  };
  const changedCount = plan ? Object.entries(plan.perCollection).filter(([c]) => chosen.has(c)).reduce((a, [, v]) => a + v.changed, 0) : 0;
  const addedCount = plan ? Object.entries(plan.perCollection).filter(([c]) => chosen.has(c)).reduce((a, [, v]) => a + v.added, 0) : 0;

  return (
    <>
      <Card title="Backup">
        <p className="mt-1 text-sm text-muted">A backup is one open JSON file with every record on this device. It is yours — readable without LIFEOS.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" icon="download" onClick={() => void exportAll()}>Download complete backup</Button>
          {identity?.mode === 'account' && <Button icon="cloud" onClick={async () => { try { downloadFile(`lifeos-account-export-${ymd()}.json`, JSON.stringify(await api('export'), null, 1)); } catch (e) { toast(e instanceof ApiError ? e.message : 'Export failed', { tone: 'bad' }); } }}>Download server copy</Button>}
        </div>
      </Card>
      <Card title="Selective export">
        <p className="mb-2 text-sm text-muted">Choose what to export, then pick a format.</p>
        <div className="flex flex-wrap gap-1.5">{names.map((c) => <button key={c} type="button" aria-pressed={selected.has(c)} onClick={() => { const n = new Set(selected); if (n.has(c)) n.delete(c); else n.add(c); setSelected(n); }} className={cx('chip h-8 px-2.5', selected.has(c) && 'chip-accent')}>{collectionDef(c).label}<span className="text-faint">{counts[c]}</span></button>)}</div>
        {names.length === 0 && <p className="text-sm text-faint">Nothing to export yet.</p>}
        <div className="mt-3 flex flex-wrap gap-2"><Button icon="download" disabled={!selected.size} onClick={() => void exportSelected()}>Export as JSON</Button><Button icon="table" disabled={!selected.size} onClick={() => void exportSelectedCsv()}>Export as CSV (one file each)</Button></div>
      </Card>
      <Card title="Restore or import">
        {!plan ? (
          <>
            <p className="mb-2 text-sm text-muted">Choose a LIFEOS backup. You will see exactly what it would add or change, and choose what happens, before anything is written.</p>
            <input type="file" accept=".json,application/json" className="input" aria-label="Backup file" onChange={(e) => e.target.files?.[0] && void openFile(e.target.files[0])} />
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Backup from {file?.exportedAt ? fmtDateTime(file.exportedAt) : 'an unknown date'} · {file?.records.length} records. Tick what to restore:</p>
            <div className="scroll-x mt-2 rounded-xl border border-line">
              <table className="w-full min-w-96 text-sm">
                <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-3 py-1.5 font-medium">Collection</th><th className="px-2 py-1.5 text-right font-medium">New</th><th className="px-2 py-1.5 text-right font-medium">Different</th><th className="px-3 py-1.5 text-right font-medium">Identical</th></tr></thead>
                <tbody>{Object.entries(plan.perCollection).map(([c, v]) => (
                  <tr key={c} className="border-b border-line/60 last:border-0"><td className="px-3 py-1.5"><label className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--accent)]" checked={chosen.has(c)} onChange={() => { const n = new Set(chosen); if (n.has(c)) n.delete(c); else n.add(c); setChosen(n); }} />{collectionDef(c).label}</label></td><td className="num px-2 py-1.5 text-right text-good">{v.added || '—'}</td><td className="num px-2 py-1.5 text-right text-warn">{v.changed || '—'}</td><td className="num px-3 py-1.5 text-right text-faint">{v.unchanged || '—'}</td></tr>
                ))}</tbody>
              </table>
            </div>
            {changedCount > 0 && (
              <fieldset className="mt-3 space-y-1.5">
                <legend className="label">{changedCount} record{changedCount === 1 ? '' : 's'} exist here with different content. What should happen to them?</legend>
                {([['keep', 'Keep my current versions', 'Nothing existing is touched (safest).'], ['replace', 'Replace with the backup’s versions', 'Current content of those records is overwritten by the backup.'], ['copy', 'Import the backup’s versions as copies', 'Both versions exist afterwards.']] as [ConflictMode, string, string][]).map(([v, title, hint]) => (
                  <label key={v} className={cx('flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2', mode === v ? 'border-accent bg-accent-soft' : 'border-line')}><input type="radio" name="conflict-mode" className="mt-1 accent-[var(--accent)]" checked={mode === v} onChange={() => setMode(v)} /><span><span className="block font-medium">{title}</span><span className="block text-sm text-muted">{hint}</span></span></label>
                ))}
              </fieldset>
            )}
            <p className="mt-3 text-sm"><b>This will add {addedCount} record{addedCount === 1 ? '' : 's'}</b>{changedCount ? mode === 'keep' ? `, and leave ${changedCount} existing record${changedCount === 1 ? '' : 's'} as they are` : mode === 'replace' ? `, and replace ${changedCount} existing record${changedCount === 1 ? '' : 's'}` : `, and add ${changedCount} cop${changedCount === 1 ? 'y' : 'ies'}` : ''}.</p>
            <div className="mt-3 flex gap-2"><Button variant="ghost" onClick={() => { setPlan(null); setFile(null); }}>Cancel</Button><Button variant={mode === 'replace' && changedCount ? 'danger' : 'primary'} disabled={!chosen.size || (addedCount === 0 && (mode === 'keep' || changedCount === 0))} onClick={() => void run()}>Restore</Button></div>
          </>
        )}
      </Card>
      <Card title="Trash">
        <p className="text-sm text-muted">Deleted items from every module. Restore brings an item back exactly as it was.</p>
        {trash === null ? <Button className="mt-2" icon="trash" onClick={() => void loadTrash()}>Show deleted items</Button> : trash.length === 0 ? <p className="mt-2 text-sm text-faint">Nothing in the trash.</p> : (
          <ul className="mt-2 max-h-80 overflow-y-auto">{trash.map((r) => <li key={r.id} className="row"><Icon name={collectionDef(r._c).icon} size={15} className="text-muted" /><span className="min-w-0 flex-1"><span className="block truncate">{r.title}</span><span className="text-xs text-faint">{collectionDef(r._c).one} · deleted {timeAgo(r._ua)}</span></span><Button size="sm" icon="undo" onClick={() => void restore(r.id).then(loadTrash)}>Restore</Button></li>)}</ul>
        )}
      </Card>
      <Card title="Activity history">
        {activity.length === 0 ? <p className="text-sm text-faint">What you create, complete, delete and restore is logged here.</p> : (
          <ul className="max-h-72 overflow-y-auto text-sm">{[...activity].sort((a, b) => b._ca - a._ca).slice(0, 100).map((a) => <li key={a.id} className="flex items-center gap-2 border-b border-line/60 py-1.5 last:border-0"><span className="w-20 flex-none capitalize text-muted">{a.action}</span><button type="button" className="min-w-0 flex-1 truncate text-left hover:text-accent" onClick={async () => { const rec = a.recordId ? await getRec(String(a.recordId)) : null; if (rec && !rec.deletedAt) openHit(rec); else toast('That item no longer exists.'); }}>{a.summary}</button><span className="flex-none text-xs text-faint">{timeAgo(a._ca)}</span></li>)}</ul>
        )}
      </Card>
    </>
  );
}

function SyncSection() {
  const identity = useApp((s) => s.identity);
  const sync = useSync();
  const conflicts = useConflicts();
  const [rejected, setRejected] = useState<{ id: string; _c: string; title: string; reason: string }[]>([]);
  useEffect(() => {
    void getDb().records.filter((r) => !!r._rejected).toArray().then((rows) => setRejected(rows.map((r) => ({ id: r.id, _c: r._c, title: recordTitle(r._c, r), reason: String(r._rejected) }))));
  }, [sync.lastSyncAt]);
  const open = conflicts.filter((c) => !c.resolved);
  const show = (v: unknown) => (v == null || v === '' ? '(empty)' : typeof v === 'object' ? JSON.stringify(v).slice(0, 160) : String(v).slice(0, 160));
  if (identity?.mode !== 'account') return <Card title="Sync is off"><p className="mt-1 text-muted">You are in local-only mode. Sign in to keep your devices in sync; data created here is uploaded when you do.</p><Button className="mt-3" variant="primary" onClick={() => { writeIdentity(null); window.location.href = '/app'; }}>Sign in or create an account</Button></Card>;
  return (
    <>
      <Card title="Synchronisation">
        <Row title="Status" hint={sync.error ?? (sync.lastSyncAt ? `Last synced ${timeAgo(sync.lastSyncAt)}` : 'Not synced yet in this session')}><span className={cx('chip capitalize', sync.status === 'idle' && '!text-good', (sync.status === 'error' || sync.status === 'signed-out') && '!text-bad', sync.status === 'offline' && '!text-warn')} data-testid="sync-status">{sync.status === 'idle' ? 'Up to date' : sync.status.replace('-', ' ')}</span></Row>
        <Row title="Waiting to upload" hint="Changes made on this device that the server has not confirmed yet. They are never discarded."><span className="num text-lg font-semibold" data-testid="sync-pending">{sync.pending}</span></Row>
        <Row title="Sync now"><Button icon="refresh" disabled={sync.status === 'syncing'} onClick={() => void syncNow().then(() => toast('Sync finished'))}>Sync now</Button></Row>
        <p className="mt-2 text-sm text-muted">LIFEOS merges changes field by field. If the same field of the same item was changed on two devices, the most recent change wins and the other value is kept below so you can switch back.</p>
      </Card>
      <Card title={`Conflicts${open.length ? ` · ${open.length} to review` : ''}`}>
        {conflicts.length === 0 ? <p className="text-sm text-faint">No conflicts. When two devices change the same field, both values show up here.</p> : (
          <ul className="space-y-2">
            {conflicts.slice(0, 50).map((c) => (
              <li key={c.key} className={cx('rounded-xl border border-line p-3', c.resolved && 'opacity-55')}>
                <div className="flex flex-wrap items-center gap-2 text-sm"><span className="chip">{collectionDef(c.c).one}</span><span className="font-medium">{c.field}</span><span className="flex-1" /><span className="text-xs text-faint">{timeAgo(c.at)}</span></div>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-lg bg-good/10 p-2"><div className="eyebrow !text-good">Kept ({c.loser === 'local' ? 'other device' : 'this device'})</div><div className="mt-0.5 break-words">{show(c.kept)}</div></div>
                  <div className="rounded-lg bg-surface-2 p-2"><div className="eyebrow">Replaced ({c.loser === 'local' ? 'this device' : 'other device'})</div><div className="mt-0.5 break-words">{show(c.discarded)}</div></div>
                </div>
                {!c.resolved && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" icon="undo" onClick={async () => { const rec = await getRec(c.id); if (!rec) return toast('That item no longer exists.'); await update(c.id, { [c.field]: c.discarded ?? null }, { silent: true }); await getDb().conflicts.update(c.key!, { resolved: 1 }); toast('Switched to the other value', { tone: 'good' }); }}>Use the replaced value instead</Button>
                    <Button size="sm" variant="ghost" icon="check" onClick={() => void getDb().conflicts.update(c.key!, { resolved: 1 })}>Keep as is</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { const rec = await getRec(c.id); if (rec) openHit(rec); }}>Open item</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {conflicts.some((c) => c.resolved) && <Button className="mt-2" size="sm" variant="ghost" onClick={() => void getDb().conflicts.filter((c) => !!c.resolved).delete()}>Clear reviewed</Button>}
      </Card>
      {rejected.length > 0 && <Card title="Items the server could not accept" tone="danger"><ul className="text-sm">{rejected.map((r) => <li key={r.id} className="flex justify-between gap-2 py-1"><span className="truncate">{collectionDef(r._c).one}: {r.title}</span><span className="text-bad">{r.reason}</span></li>)}</ul><p className="mt-2 text-xs text-faint">They stay on this device. Editing an item sends it again.</p></Card>}
    </>
  );
}

function Account() {
  const identity = useApp((s) => s.identity);
  const [sessions, setSessions] = useState<{ id: string; deviceName: string; lastSeenAt: string; createdAt: string; current: boolean }[] | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const load = () => void api<{ sessions: NonNullable<typeof sessions> }>('auth/sessions').then((r) => setSessions(r.sessions)).catch(() => setSessions([]));
  useEffect(() => { if (identity?.mode === 'account') load(); }, [identity]);
  const guard = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { toast(e instanceof ApiError ? e.message : 'Something went wrong', { tone: 'bad' }); } };
  const eraseLocal = async () => {
    if (!(await confirmDialog({ title: 'Erase everything on this device?', body: 'All LIFEOS data stored in this browser will be deleted. Download a backup first if you want to keep it. This cannot be undone.', danger: true, confirmLabel: 'Erase' }))) return;
    await getDb().delete();
    writeIdentity(null);
    window.location.href = '/app';
  };
  if (identity?.mode !== 'account') return <Card title="Local data" tone="danger"><p className="mt-1 text-sm text-muted">There is no account on this device, so there is nothing on a server. You can erase the data stored in this browser.</p><Button className="mt-3" variant="danger" icon="trash" onClick={() => void eraseLocal()}>Erase local data</Button></Card>;
  return (
    <>
      <Card title="Signed-in devices">
        {!sessions ? <p className="text-sm text-faint">Loading…</p> : sessions.map((s) => (
          <div key={s.id} className="row"><Icon name={/Android|iOS/.test(s.deviceName) ? 'phone' : 'monitor'} size={17} className="text-muted" /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.deviceName || 'Unknown device'}</span><span className="text-xs text-faint">Active {timeAgo(new Date(s.lastSeenAt).getTime())} · signed in {new Date(s.createdAt).toLocaleDateString()}</span></span>
            {s.current ? <span className="chip chip-accent">This device</span> : <Button size="sm" onClick={() => void guard(async () => { await api('auth/sessions/revoke', { body: { id: s.id } }); load(); toast('Device signed out'); })}>Sign out</Button>}</div>
        ))}
        {sessions && sessions.length > 1 && <Button className="mt-2" size="sm" icon="logout" onClick={() => void guard(async () => { await api('auth/sessions/revoke', { body: { others: true } }); load(); toast('All other devices signed out'); })}>Sign out all other devices</Button>}
      </Card>
      <Card title="Change password">
        <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); void guard(async () => { await api('auth/password', { body: { current, next } }); setCurrent(''); setNext(''); toast('Password changed. Other devices were signed out.', { tone: 'good' }); load(); }); }}>
          <Field label="Current password"><input className="input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
          <Field label="New password (10+ characters)"><input className="input" type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <Button type="submit" variant="primary" className="self-end">Change</Button>
        </form>
      </Card>
      <Card title="Recovery code">
        <p className="text-sm text-muted">The recovery code resets your password without e-mail. Generating a new one invalidates the old one.</p>
        {code ? <div className="mt-2"><div className="num select-all rounded-xl border border-line-strong bg-surface-2 px-3 py-3 text-center text-lg tracking-wider">{code}</div><p className="mt-1 text-xs text-faint">Shown once. Store it in your password manager.</p></div> : (
          <Button className="mt-2" icon="key" onClick={async () => { const password = await promptDialog({ title: 'Confirm your password', body: 'Enter your password to generate a new recovery code.', confirmLabel: 'Generate' }); if (password) await guard(async () => setCode((await api<{ recoveryCode: string }>('auth/recovery-code', { body: { password } })).recoveryCode)); }}>Generate a new recovery code</Button>
        )}
      </Card>
      <Card title="Delete account" tone="danger">
        <p className="text-sm text-muted">Deletes your account and every record on the server, then erases the data on this device. Download a backup first if you want to keep anything. This cannot be undone.</p>
        <Button className="mt-2" variant="danger" icon="trash" onClick={async () => { const password = await promptDialog({ title: 'Delete your account?', body: 'Type your password to permanently delete your account and all of its data.', confirmLabel: 'Delete account' }); if (!password) return; await guard(async () => { await api('auth/delete-account', { body: { password } }); await getDb().delete(); writeIdentity(null); window.location.href = '/app'; }); }}>Delete my account</Button>
      </Card>
    </>
  );
}

function About() {
  const counts = featureCounts();
  const install = useInstall();
  const modules = useModules();
  return (
    <>
      <Card title="Install LIFEOS">
        {install.installed ? <p className="mt-1 text-good">LIFEOS is installed on this device.</p> : (
          <>
            <p className="mt-1 text-sm text-muted">Installed, LIFEOS opens in its own window, starts offline and feels like a native app.</p>
            {install.available ? <Button className="mt-3" variant="primary" icon="download" onClick={() => void promptInstall().then((r) => r === 'accepted' && toast('LIFEOS installed', { tone: 'good' }))}>Install app</Button> : (
              <ul className="mt-3 space-y-1.5 text-sm text-muted">
                {isIos() ? <li><b className="text-text">iPhone / iPad:</b> in Safari tap Share, then “Add to Home Screen”.</li> : <><li><b className="text-text">Android (Chrome):</b> open the ⋮ menu → “Install app” or “Add to Home screen”.</li><li><b className="text-text">Windows / macOS / ChromeOS (Chrome, Edge):</b> use the install icon in the address bar, or the browser menu → “Install LIFEOS”.</li><li><b className="text-text">iPhone / iPad:</b> in Safari tap Share → “Add to Home Screen”.</li></>}
              </ul>
            )}
          </>
        )}
      </Card>
      <Card title="About">
        <Row title="LIFEOS" hint="The personal operating system">v0.1.0</Row>
        <Row title="Modules" hint={`${modules.filter((m) => m.enabled).length} active`}>{MODULES.length}</Row>
        <Row title="Capabilities" hint={`${counts.partial} partial · ${counts.integration} need an integration · ${counts.planned} planned`}>{counts.implemented} implemented of {counts.total}</Row>
        <Row title="Keyboard shortcuts"><Button size="sm" icon="command" onClick={() => useApp.setState({ shortcuts: true })}>Show shortcuts</Button></Row>
        <Row title="Feature catalog"><Button size="sm" icon="store" onClick={() => navigate('/marketplace')}>Open Marketplace</Button></Row>
      </Card>
      <Card title="Privacy">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Your data is stored in this browser first. With an account it is also stored on the LIFEOS server so your devices can sync.</li>
          <li>Passwords are stored only as salted scrypt hashes; sessions use an httpOnly cookie.</li>
          <li>LIFEOS never stores passwords for other services and makes no requests to third parties.</li>
          <li>You can export everything and delete your account at any time.</li>
        </ul>
        <p className="mt-2 text-xs text-faint">Open-source components and their licences are listed in docs/LICENSES.md in the repository.</p>
      </Card>
    </>
  );
}

export default function Settings({ sub }: ModuleProps) {
  const [prefs, set] = usePrefs();
  const section = SECTIONS.find((s) => s.id === sub[0])?.id ?? 'general';
  return (
    <Page module="settings">
      <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto pb-1 no-scrollbar lg:flex-col lg:overflow-visible">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" aria-current={section === s.id ? 'page' : undefined} onClick={() => navigate(`/settings${s.id === 'general' ? '' : `/${s.id}`}`)} className={cx('flex h-10 flex-none items-center gap-2.5 rounded-[10px] px-3 text-left text-[0.92rem]', section === s.id ? 'bg-accent-soft font-medium' : 'text-muted hover:bg-surface-2 hover:text-text')}>
              <Icon name={s.icon} size={16} className={section === s.id ? 'text-accent' : ''} />{s.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {section === 'general' && <Profile />}
          {section === 'appearance' && <Appearance prefs={prefs} set={set} />}
          {section === 'navigation' && <Navigation prefs={prefs} set={set} />}
          {section === 'formats' && <Formats prefs={prefs} set={set} />}
          {section === 'notifications' && <Notifications prefs={prefs} set={set} />}
          {section === 'workspaces' && <Workspaces />}
          {section === 'categories' && <Categories />}
          {section === 'data' && <DataSection />}
          {section === 'sync' && <SyncSection />}
          {section === 'account' && <Account />}
          {section === 'about' && <About />}
          {section === 'general' && <Empty icon="settings" title="Looking for something?" hint="Appearance, navigation, notifications, backups and your account are in the sections on this page." />}
        </div>
      </div>
    </Page>
  );
}
