'use client';

import { Component, Suspense, lazy, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { ACCENTS, navigate, openCapture, openEditor, useApp, useSegments, type Prefs } from '@/core/app';
import { useEnabledModules, useModules, usePrefs, useRecords, useSync, setModule, type ModuleState } from '@/core/data/hooks';
import { writeIdentity, api } from '@/core/data/session';
import { create } from '@/core/data/store';
import { syncNow, syncState } from '@/core/data/syncClient';
import { fmtTime, formatPrefs, parseDate, relativeDay, timeAgo } from '@/core/lib/dates';
import { occurrences, type Recurrence } from '@/core/lib/recurrence';
import { compareTasks, isOpen, isOverdue, type TaskLike } from '@/core/lib/tasks';
import { INTERESTS, MODULES, moduleDef, recommendedFor } from '@/core/registry';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Checkbox, Empty, IconButton, Menu, Sheet, Spinner, cx, useMediaQuery } from '@/ui/kit';
import { OverlayHost, promptDialog, toast } from '@/ui/overlays';
import { RecordEditor, toggleTask } from '@/ui/RecordEditor';
import { switchWorkspace } from './AppRoot';
import { Logo } from './AuthScreen';
import { Capture } from './Capture';
import { setEnginePrefs } from './engines';
import { LOADERS, warmModules } from './modules';
import { NotificationCenter } from './Notifications';
import type { ModuleProps } from './Page';
import { Palette } from './Palette';

// ── Preferences → document ───────────────────────────────────────────────────────────────────────

function useApplyPrefs(prefs: Prefs, loaded: boolean) {
  const systemLight = useMediaQuery('(prefers-color-scheme: light)');
  useEffect(() => {
    if (!loaded) return;
    const el = document.documentElement;
    const theme = prefs.theme === 'system' ? (systemLight ? 'light' : 'dark') : prefs.theme;
    el.dataset.theme = theme;
    el.dataset.density = prefs.density;
    el.dataset.motion = prefs.motion;
    el.dataset.widget = prefs.widgetStyle;
    el.style.setProperty('--accent-h', String(prefs.accentHue));
    formatPrefs.hour12 = prefs.hour12;
    formatPrefs.dateStyle = prefs.dateStyle;
    setEnginePrefs(prefs);
    try {
      localStorage.setItem('lifeos.look', JSON.stringify({ theme: prefs.theme, hue: prefs.accentHue, density: prefs.density }));
    } catch {
      /* ignore */
    }
  }, [prefs, loaded, systemLight]);
}

// ── Navigation model ─────────────────────────────────────────────────────────────────────────────

/** Active, non-system-slot modules in the user's order (favourites first). */
export function useNavModules(): ModuleState[] {
  const modules = useModules();
  const [prefs] = usePrefs();
  return useMemo(() => {
    const rank = new Map(prefs.sidebar.map((id, i) => [id, i]));
    const base = new Map(MODULES.map((m, i) => [m.id, i]));
    return modules
      .filter((m) => m.enabled && !['home', 'marketplace', 'settings'].includes(m.def.id))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (rank.get(a.def.id) ?? 1000 + base.get(a.def.id)!) - (rank.get(b.def.id) ?? 1000 + base.get(b.def.id)!));
  }, [modules, prefs.sidebar]);
}

function NavItem({ id, name, icon, active, collapsed, badge }: { id: string; name: string; icon: string; active: boolean; collapsed?: boolean; badge?: number }) {
  return (
    <a
      href={`/app${id === 'home' ? '' : `/${id}`}`} aria-current={active ? 'page' : undefined} title={collapsed ? name : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        navigate(id === 'home' ? '/' : `/${id}`);
      }}
      className={cx('group relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-[0.92rem] transition-colors', collapsed && 'justify-center px-0', active ? 'bg-accent-soft font-medium text-text' : 'text-muted hover:bg-surface-2 hover:text-text')}
    >
      {active && <span className="absolute -left-2 top-2 h-6 w-1 rounded-full bg-accent" />}
      <Icon name={icon} size={18} className={active ? 'text-accent' : ''} />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{name}</span>}
      {!collapsed && badge ? <span className="chip h-5 px-1.5 text-[0.68rem]">{badge}</span> : null}
    </a>
  );
}

function WorkspaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const ws = useApp((s) => s.ws);
  const workspaces = useRecords('workspaces');
  const all = useMemo(() => [{ id: 'personal', name: 'Personal', color: undefined as string | undefined }, ...workspaces.map((w) => ({ id: w.id, name: String(w.name), color: w.color as string | undefined }))], [workspaces]);
  const current = all.find((w) => w.id === ws) ?? all[0];
  return (
    <Menu
      align="start" label="Workspaces"
      items={[
        ...all.map((w) => ({ label: w.name, checked: w.id === current.id, onClick: () => switchWorkspace(w.id) })),
        { separator: true, label: '' },
        {
          label: 'New workspace…', icon: 'plus' as const,
          onClick: async () => {
            const name = await promptDialog({ title: 'New workspace', body: 'A workspace has its own tasks, notes, projects and other data.', placeholder: 'e.g. Work', confirmLabel: 'Create' });
            if (name?.trim()) switchWorkspace((await create('workspaces', { name: name.trim() })).id);
          },
        },
        { label: 'Manage workspaces', icon: 'settings' as const, onClick: () => navigate('/settings/workspaces') },
      ]}
      trigger={(p) => (
        <button type="button" {...p} className={cx('flex h-10 w-full items-center gap-2.5 rounded-[10px] border border-line bg-surface px-2.5 text-left text-sm hover:bg-surface-2', collapsed && 'justify-center px-0')} aria-label={`Workspace: ${current.name}`}>
          <span className="grid size-6 flex-none place-items-center rounded-md text-[0.7rem] font-bold text-accent-ink" style={{ background: current.color ?? 'var(--accent)' }}>{current.name.slice(0, 1).toUpperCase()}</span>
          {!collapsed && <><span className="min-w-0 flex-1 truncate font-medium">{current.name}</span><Icon name="chevronDown" size={14} className="text-faint" /></>}
        </button>
      )}
    />
  );
}

function Sidebar() {
  const [prefs, setPrefs] = usePrefs();
  const nav = useNavModules();
  const active = useSegments()[0] ?? 'home';
  const collapsed = prefs.sidebarCollapsed;
  return (
    <aside className={cx('no-print sticky top-0 hidden h-dvh flex-none flex-col border-r border-line bg-raised/60 backdrop-blur-xl transition-[width] md:flex', collapsed ? 'w-[68px]' : 'w-[244px]')} aria-label="Primary">
      <div className={cx('flex h-14 flex-none items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
        <Logo size={30} />
        {!collapsed && <span className="font-display text-[1.05rem] font-semibold tracking-wide">LIFEOS</span>}
      </div>
      <div className="px-3 pb-2"><WorkspaceSwitcher collapsed={collapsed} /></div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
        <NavItem id="home" name="Home" icon="home" active={active === 'home'} collapsed={collapsed} />
        {nav.map((m) => <NavItem key={m.def.id} id={m.def.id} name={m.def.name} icon={m.def.icon} active={active === m.def.id} collapsed={collapsed} />)}
      </nav>
      <div className="space-y-0.5 border-t border-line p-3">
        <NavItem id="marketplace" name="Marketplace" icon="store" active={active === 'marketplace'} collapsed={collapsed} />
        <NavItem id="settings" name="Settings" icon="settings" active={active === 'settings'} collapsed={collapsed} />
        <button type="button" onClick={() => setPrefs({ sidebarCollapsed: !collapsed })} className={cx('flex h-9 w-full items-center gap-3 rounded-[10px] px-3 text-sm text-faint hover:bg-surface-2 hover:text-text', collapsed && 'justify-center px-0')} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}

// ── Status & top bar ─────────────────────────────────────────────────────────────────────────────

export function SyncBadge({ compact }: { compact?: boolean }) {
  const sync = useSync();
  const online = useApp((s) => s.online);
  const map: Record<string, { icon: IconName; label: string; tone: string }> = {
    local: { icon: 'drive', label: 'On this device', tone: 'text-muted' },
    idle: { icon: 'cloud', label: sync.pending ? `${sync.pending} to sync` : 'Synced', tone: 'text-good' },
    syncing: { icon: 'refresh', label: 'Syncing…', tone: 'text-accent' },
    offline: { icon: 'cloudOff', label: sync.pending ? `Offline · ${sync.pending} queued` : 'Offline', tone: 'text-warn' },
    error: { icon: 'warning', label: 'Sync problem', tone: 'text-bad' },
    'signed-out': { icon: 'lock', label: 'Signed out', tone: 'text-bad' },
  };
  const state = !online && sync.status !== 'local' ? 'offline' : sync.status;
  const s = sync.conflicts > 0 && state === 'idle' ? { icon: 'warning' as IconName, label: `${sync.conflicts} conflict${sync.conflicts === 1 ? '' : 's'}`, tone: 'text-warn' } : map[state];
  const label = !online && sync.status === 'local' ? 'Offline · on this device' : s.label;
  return (
    <button type="button" onClick={() => navigate('/settings/sync')} title={`${label}${sync.lastSyncAt ? ` · last sync ${timeAgo(sync.lastSyncAt)}` : ''}`} aria-label={`Sync status: ${label}`} data-sync={state} data-pending={sync.pending} className={cx('inline-flex h-9 flex-none items-center gap-1.5 rounded-[10px] px-2 text-[0.8rem] hover:bg-surface-2', s.tone)}>
      <Icon name={s.icon} size={16} className={state === 'syncing' ? 'animate-[spin_1.2s_linear_infinite]' : ''} />
      {!compact && <span className="max-lg:hidden">{label}</span>}
    </button>
  );
}

function useUnread(): number {
  const notifications = useRecords('notifications');
  return useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications]);
}

function ProfileMenu() {
  const identity = useApp((s) => s.identity);
  const name = identity?.mode === 'account' ? identity.displayName || identity.email : 'This device';
  const signOut = async () => {
    const { pending } = { pending: await import('@/core/data/db').then((m) => m.getDb().records.where('_dirty').equals(1).count()) };
    if (pending > 0 && navigator.onLine) await syncNow().catch(() => undefined);
    await api('auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    writeIdentity(null);
    window.location.href = '/app';
  };
  return (
    <Menu
      label="Account"
      items={[
        { label: identity?.mode === 'account' ? identity.email : 'Local mode — not signed in', disabled: true },
        { separator: true, label: '' },
        { label: 'Settings', icon: 'settings', onClick: () => navigate('/settings') },
        { label: 'Appearance', icon: 'palette', onClick: () => navigate('/settings/appearance') },
        { label: 'Keyboard shortcuts', icon: 'command', hint: '?', onClick: () => useApp.setState({ shortcuts: true }) },
        { label: 'Backup & data', icon: 'download', onClick: () => navigate('/settings/data') },
        { separator: true, label: '' },
        identity?.mode === 'account'
          ? { label: 'Sign out', icon: 'logout', onClick: () => void signOut() }
          : { label: 'Create account or sign in', icon: 'user', onClick: () => { writeIdentity(null); window.location.href = '/app'; } },
      ]}
      trigger={(p) => (
        <button type="button" {...p} aria-label={`Account menu for ${name}`} className="grid size-9 flex-none place-items-center rounded-full bg-gradient-to-br from-cyan to-violet text-sm font-bold text-[#0b0d12]">
          {name.slice(0, 1).toUpperCase()}
        </button>
      )}
    />
  );
}

function TopBar({ title }: { title: string }) {
  const [prefs, setPrefs] = usePrefs();
  const unread = useUnread();
  const active = useSegments()[0] ?? 'home';
  const spatialOn = useEnabledModules().has('spatial');
  return (
    <header className="no-print safe-top sticky top-0 z-30 flex-none border-b border-line bg-bg/75 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-1.5 px-3 md:px-5">
        <span className="md:hidden"><Logo size={28} /></span>
        <h2 className="min-w-0 flex-1 truncate pl-1 font-display text-[1.02rem] font-semibold md:hidden">{title}</h2>
        <button type="button" onClick={() => useApp.setState({ palette: true })} className="hidden h-9 min-w-40 max-w-md flex-[4] items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-left text-sm text-faint hover:border-line-strong md:flex" aria-label="Search or run a command">
          <Icon name="search" size={16} />
          <span className="flex-1 truncate">Search or jump to…</span>
          <kbd className="kbd">Ctrl K</kbd>
        </button>
        <span className="hidden flex-1 md:block" />
        <Button variant="primary" size="sm" icon="plus" className="max-md:hidden" onClick={() => openCapture()}>Capture</Button>
        {spatialOn && (
          <div className="hidden items-center gap-0.5 rounded-[10px] border border-line p-0.5 lg:flex" role="group" aria-label="Interface mode">
            {(['standard', 'spatial'] as const).map((mode) => {
              const on = mode === 'spatial' ? active === 'spatial' : active !== 'spatial';
              return (
                <button key={mode} type="button" aria-pressed={on} onClick={() => { setPrefs({ mode }); navigate(mode === 'spatial' ? '/spatial' : '/'); }} className={cx('inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium', on ? 'bg-surface-3 text-text' : 'text-muted hover:text-text')}>
                  <Icon name={mode === 'spatial' ? 'orbit' : 'dashboard'} size={14} />{mode === 'spatial' ? 'Spatial' : 'Standard'}
                </button>
              );
            })}
          </div>
        )}
        <IconButton icon="search" label="Search" className="md:hidden" onClick={() => useApp.setState({ palette: true })} />
        <SyncBadge />
        <span className="relative">
          <IconButton icon="bell" label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => useApp.setState({ notifications: true })} />
          {unread > 0 && <span className="pointer-events-none absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.62rem] font-bold text-accent-ink">{unread > 9 ? '9+' : unread}</span>}
        </span>
        <IconButton icon="panelRight" label="Toggle context panel" active={prefs.rightPanel} className="max-xl:hidden" onClick={() => setPrefs({ rightPanel: !prefs.rightPanel })} />
        <ProfileMenu />
      </div>
    </header>
  );
}

// ── Context panel (desktop) ──────────────────────────────────────────────────────────────────────

export function useUpcomingEvents(days = 7, limit = 6) {
  const events = useRecords('events');
  return useMemo(() => {
    const now = new Date();
    const to = new Date(now.getTime() + days * 86_400_000);
    const out: { id: string; rec: (typeof events)[number]; at: Date }[] = [];
    for (const e of events) {
      const start = parseDate(e.startAt);
      if (!start) continue;
      for (const at of occurrences(start, e.recurrence as Recurrence | null, new Date(now.getTime() - 3_600_000), to, 5)) out.push({ id: `${e.id}:${at.getTime()}`, rec: e, at });
    }
    return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, limit);
  }, [events, days, limit]);
}

function PanelSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between"><h3 className="eyebrow">{title}</h3>{action}</div>
      {children}
    </section>
  );
}

const QUICK: Record<string, { label: string; icon: IconName }> = {
  task: { label: 'Task', icon: 'tasks' }, note: { label: 'Note', icon: 'notes' }, event: { label: 'Event', icon: 'calendar' }, expense: { label: 'Expense', icon: 'wallet' },
  idea: { label: 'Idea', icon: 'idea' }, reminder: { label: 'Reminder', icon: 'bell' }, link: { label: 'Link', icon: 'link' }, goal: { label: 'Goal', icon: 'target' }, journal: { label: 'Journal', icon: 'journal' },
};

function ContextPanel() {
  const [prefs] = usePrefs();
  const enabled = useEnabledModules();
  const tasks = useRecords('tasks');
  const notifications = useRecords('notifications');
  const upcoming = useUpcomingEvents();
  const priorities = useMemo(() => tasks.filter((t) => isOpen(t as TaskLike) && !t.parentId && (isOverdue(t as TaskLike) || (t.priority ?? 0) >= 2 || (t.dueAt && parseDate(t.dueAt)! <= new Date(Date.now() + 86_400_000)))).sort(compareTasks).slice(0, 6), [tasks]);
  const reminders = useMemo(() => notifications.filter((n) => !n.readAt).sort((a, b) => b._ca - a._ca).slice(0, 4), [notifications]);
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-[300px] flex-none flex-col gap-5 overflow-y-auto border-l border-line bg-raised/40 px-4 pb-6 pt-[72px] xl:flex" aria-label="Context">
      <PanelSection title="Quick actions">
        <div className="grid grid-cols-2 gap-1.5">
          {prefs.quickActions.filter((k) => QUICK[k]).map((k) => <button key={k} type="button" className="btn btn-sm justify-start" onClick={() => openCapture(k)}><Icon name={QUICK[k].icon} size={15} className="text-accent" />{QUICK[k].label}</button>)}
        </div>
      </PanelSection>
      {enabled.has('calendar') && (
        <PanelSection title="Upcoming" action={<button type="button" className="text-xs text-accent" onClick={() => navigate('/calendar')}>Calendar</button>}>
          {upcoming.length === 0 ? <p className="text-sm text-faint">No events in the next week.</p> : upcoming.map((u) => (
            <button key={u.id} type="button" className="row w-full !px-1.5 text-left" onClick={() => openEditor('events', u.rec.id)}>
              <span className="h-8 w-1 flex-none rounded-full bg-blue" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{u.rec.title}</span><span className="block text-xs text-faint">{relativeDay(u.at)}{u.rec.allDay ? '' : ` · ${fmtTime(u.at)}`}</span></span>
            </button>
          ))}
        </PanelSection>
      )}
      {enabled.has('tasks') && (
        <PanelSection title="Priorities" action={<button type="button" className="text-xs text-accent" onClick={() => navigate('/tasks')}>All tasks</button>}>
          {priorities.length === 0 ? <p className="text-sm text-faint">Nothing urgent. Enjoy the calm.</p> : priorities.map((t) => (
            <div key={t.id} className="row !px-1.5">
              <Checkbox checked={false} onChange={() => void toggleTask(t)} label={`Complete ${t.title}`} />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEditor('tasks', t.id)}>
                <span className="block truncate text-sm">{t.title}</span>
                {t.dueAt && <span className={cx('block text-xs', isOverdue(t as TaskLike) ? 'text-bad' : 'text-faint')}>{relativeDay(t.dueAt)}</span>}
              </button>
            </div>
          ))}
        </PanelSection>
      )}
      <PanelSection title="Reminders" action={reminders.length > 0 && <button type="button" className="text-xs text-accent" onClick={() => useApp.setState({ notifications: true })}>Open inbox</button>}>
        {reminders.length === 0 ? <p className="text-sm text-faint">You are all caught up.</p> : reminders.map((n) => (
          <button key={n.id} type="button" className="row w-full !px-1.5 text-left" onClick={() => useApp.setState({ notifications: true })}>
            <Icon name="bell" size={15} className="flex-none text-accent" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm">{n.body || n.title}</span><span className="block text-xs text-faint">{n.title}</span></span>
          </button>
        ))}
      </PanelSection>
    </aside>
  );
}

// ── Mobile navigation ────────────────────────────────────────────────────────────────────────────

function MobileNav() {
  const [prefs] = usePrefs();
  const enabled = useEnabledModules();
  const active = useSegments()[0] ?? 'home';
  const launcher = useApp((s) => s.launcher);
  const tabs = prefs.mobileTabs.filter((id) => enabled.has(id) && moduleDef(id)).slice(0, 2);
  const item = (id: string, name: string, icon: string, on: boolean, onClick: () => void) => (
    <button key={id} type="button" onClick={onClick} aria-current={on ? 'page' : undefined} aria-label={name} className={cx('flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[0.66rem] font-medium', on ? 'text-accent' : 'text-muted')}>
      <Icon name={icon} size={21} strokeWidth={on ? 2.3 : 1.9} />
      <span className="max-w-full truncate px-1">{name}</span>
    </button>
  );
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 backdrop-blur-xl md:hidden" aria-label="Primary">
      <div className="safe-bottom">
        <div className="flex h-[62px] items-stretch px-1">
          {item('home', 'Home', 'home', active === 'home' && !launcher, () => navigate('/'))}
          {tabs[0] && item(tabs[0], moduleDef(tabs[0])!.name, moduleDef(tabs[0])!.icon, active === tabs[0] && !launcher, () => navigate(`/${tabs[0]}`))}
          <div className="flex flex-1 items-center justify-center">
            <button type="button" onClick={() => openCapture()} aria-label="Quick capture" className="grid size-[52px] -translate-y-3 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_8px_24px_-6px_var(--accent)] active:scale-95">
              <Icon name="plus" size={26} strokeWidth={2.4} />
            </button>
          </div>
          {tabs[1] && item(tabs[1], moduleDef(tabs[1])!.name, moduleDef(tabs[1])!.icon, active === tabs[1] && !launcher, () => navigate(`/${tabs[1]}`))}
          {item('more', 'More', 'grid', launcher, () => useApp.setState({ launcher: true }))}
        </div>
      </div>
    </nav>
  );
}

/** Mobile "More": searchable launcher for every active module. */
function Launcher() {
  const open = useApp((s) => s.launcher);
  const nav = useNavModules();
  const [prefs, setPrefs] = usePrefs();
  const [q, setQ] = useState('');
  useEffect(() => setQ(''), [open]);
  const list = [...nav.map((m) => m.def), moduleDef('marketplace')!, moduleDef('settings')!].filter((d) => !q || `${d.name} ${d.tagline}`.toLowerCase().includes(q.toLowerCase()));
  const spatial = nav.some((m) => m.def.id === 'spatial');
  return (
    <Sheet open={open} onClose={() => useApp.setState({ launcher: false })} title="All modules">
      <div className="relative mb-3">
        <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input className="input !pl-9" type="search" placeholder="Find a module…" aria-label="Find a module" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-2 xs:grid-cols-4">
        {list.map((d) => (
          <button key={d.id} type="button" onClick={() => navigate(`/${d.id}`)} className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface px-1 py-3 active:bg-surface-2">
            <span className="grid size-11 place-items-center rounded-[14px]" style={{ background: `oklch(0.75 0.14 ${d.hue} / 0.15)`, color: `oklch(0.8 0.13 ${d.hue})` }}><Icon name={d.icon} size={21} /></span>
            <span className="max-w-full truncate px-1 text-[0.74rem] font-medium">{d.name}</span>
          </button>
        ))}
      </div>
      {list.length === 0 && <Empty icon="search" title="No module matches" hint="Switch more modules on in the Marketplace." />}
      {spatial && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-line px-3 py-2.5">
          <span className="text-sm"><span className="block font-medium">Spatial mode</span><span className="text-xs text-faint">Open Home as the 3D workspace</span></span>
          <Button size="sm" icon="orbit" onClick={() => { setPrefs({ mode: 'spatial' }); navigate('/spatial'); }}>{prefs.mode === 'spatial' ? 'Open' : 'Try it'}</Button>
        </div>
      )}
    </Sheet>
  );
}

// ── Module host ──────────────────────────────────────────────────────────────────────────────────

class Boundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /chunk|import|fetch|load/i.test(this.state.error.message);
    return (
      <div className="p-6">
        <Empty
          icon={chunk ? 'cloudOff' : 'warning'} title={chunk ? 'This module is not available offline yet' : 'This module ran into a problem'}
          hint={chunk ? 'Open it once while online and it will be cached for next time. Your data is safe on this device.' : `${this.state.error.message}. Your data is safe — try again.`}
          action={<Button onClick={() => this.setState({ error: null })}>Try again</Button>}
        />
      </div>
    );
  }
}

const lazyCache = new Map<string, ComponentType<ModuleProps>>();
function moduleComponent(id: string): ComponentType<ModuleProps> | null {
  if (!LOADERS[id]) return null;
  if (!lazyCache.has(id)) lazyCache.set(id, lazy(LOADERS[id]));
  return lazyCache.get(id)!;
}

function ModuleHost() {
  const segments = useSegments();
  const [prefs] = usePrefs();
  const enabled = useEnabledModules();
  const id = segments[0] ?? 'home';
  const def = moduleDef(id);
  const Cmp = def ? moduleComponent(id) : null;

  useEffect(() => {
    if (def && !def.core && enabled.has(id)) void setModule(id, { lastUsedAt: new Date().toISOString() });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Home opens the 3D workspace when Spatial is the preferred mode.
  useEffect(() => {
    if (segments.length === 0 && prefs.mode === 'spatial' && enabled.has('spatial') && sessionStorage.getItem('lifeos.homeRedirect') !== '1') {
      sessionStorage.setItem('lifeos.homeRedirect', '1');
      navigate('/spatial', { replace: true });
    }
  }, [segments.length, prefs.mode, enabled]);

  if (!def || !Cmp) return <div className="p-6"><Empty icon="search" title="Page not found" hint="That address does not match any module." action={<Button onClick={() => navigate('/')}>Go home</Button>} /></div>;
  if (!enabled.has(id)) {
    return (
      <div className="p-6">
        <Empty icon={def.icon as IconName} title={`${def.name} is switched off`} hint={`${def.tagline}. Your data is kept while a module is off.`} action={<Button variant="primary" onClick={() => void setModule(id, { enabled: true })}>Activate {def.name}</Button>} />
      </div>
    );
  }
  return (
    <Boundary resetKey={id}>
      <Suspense fallback={<div className="grid h-64 place-items-center"><Spinner size={22} /></div>}>
        <Cmp sub={segments.slice(1)} />
      </Suspense>
    </Boundary>
  );
}

// ── Onboarding ───────────────────────────────────────────────────────────────────────────────────

function Onboarding({ onDone }: { onDone: () => void }) {
  const [prefs, setPrefs] = usePrefs();
  const identity = useApp((s) => s.identity);
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const recommended = useMemo(() => new Set(recommendedFor(interests)), [interests]);
  const selection = chosen ?? recommended;
  const optional = MODULES.filter((m) => !m.core);
  const finish = async () => {
    for (const m of optional) await setModule(m.id, { enabled: selection.has(m.id) });
    setPrefs({ onboarded: true, interests });
    onDone();
    toast('Welcome to LIFEOS. Press the + button any time to capture something.', { tone: 'good', duration: 6000 });
  };
  return (
    <div className="app-canvas fixed inset-0 z-[70] overflow-y-auto">
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-8">
        <div className="mb-8 flex items-center gap-3">
          <Logo size={40} />
          <div className="flex-1"><div className="font-display text-xl font-semibold">Welcome{identity?.mode === 'account' && identity.displayName ? `, ${identity.displayName}` : ''}</div><div className="text-sm text-muted">Three quick choices — everything can be changed later.</div></div>
          <span className="text-sm text-faint">{step + 1} / 3</span>
        </div>
        {step === 0 && (
          <section className="fade-up">
            <h1 className="text-2xl font-semibold">What do you want LIFEOS to help with?</h1>
            <p className="mt-1 text-muted">Pick as many as you like. We will switch on only the modules that fit.</p>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {INTERESTS.map((i) => (
                <button key={i} type="button" aria-pressed={interests.includes(i)} onClick={() => { setChosen(null); setInterests(interests.includes(i) ? interests.filter((x) => x !== i) : [...interests, i]); }} className={cx('rounded-2xl border px-3 py-4 text-left font-medium transition-colors', interests.includes(i) ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong')}>
                  {i}
                </button>
              ))}
            </div>
          </section>
        )}
        {step === 1 && (
          <section className="fade-up">
            <h1 className="text-2xl font-semibold">Your modules</h1>
            <p className="mt-1 text-muted">{selection.size} selected. Others stay one tap away in the Marketplace.</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {optional.map((m) => {
                const on = selection.has(m.id);
                return (
                  <button key={m.id} type="button" role="switch" aria-checked={on} onClick={() => { const n = new Set(selection); if (on) n.delete(m.id); else n.add(m.id); setChosen(n); }} className={cx('flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors', on ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}>
                    <span className="grid size-10 flex-none place-items-center rounded-xl" style={{ background: `oklch(0.75 0.14 ${m.hue} / 0.15)`, color: `oklch(0.8 0.13 ${m.hue})` }}><Icon name={m.icon} size={19} /></span>
                    <span className="min-w-0 flex-1"><span className="block font-medium">{m.name}</span><span className="block truncate text-xs text-muted">{m.tagline}</span></span>
                    <Icon name={on ? 'checkCircle' : 'circle'} size={20} className={on ? 'text-accent' : 'text-faint'} />
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {step === 2 && (
          <section className="fade-up">
            <h1 className="text-2xl font-semibold">Make it yours</h1>
            <p className="mt-1 text-muted">Choose a theme and an accent colour.</p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button key={t} type="button" aria-pressed={prefs.theme === t} onClick={() => setPrefs({ theme: t })} className={cx('flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 font-medium capitalize', prefs.theme === t ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}>
                  <Icon name={t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'monitor'} size={22} />{t}
                </button>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {ACCENTS.map((a) => (
                <button key={a.hue} type="button" aria-label={`${a.name} accent`} aria-pressed={prefs.accentHue === a.hue} onClick={() => setPrefs({ accentHue: a.hue })} className={cx('size-11 rounded-full border-2', prefs.accentHue === a.hue ? 'border-text' : 'border-transparent')} style={{ background: `oklch(0.75 0.15 ${a.hue})` }} />
              ))}
            </div>
          </section>
        )}
        <div className="mt-auto flex items-center gap-2 pt-8">
          {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
          <span className="flex-1" />
          <Button variant="primary" onClick={() => (step < 2 ? setStep(step + 1) : void finish())}>{step < 2 ? 'Continue' : 'Start using LIFEOS'}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Shortcuts ────────────────────────────────────────────────────────────────────────────────────

const SHORTCUTS: [string, string][] = [
  ['Ctrl / ⌘ + K', 'Search and command palette'], ['/', 'Search'], ['C', 'Quick capture'], ['N', 'New task'], ['G then H', 'Go to Home'], ['G then T', 'Go to Tasks'], ['G then C', 'Go to Calendar'],
  ['G then P', 'Go to Projects'], ['G then N', 'Go to Notes'], ['G then S', 'Go to Settings'], ['G then M', 'Go to Marketplace'], ['Ctrl / ⌘ + Enter', 'Save the open form'], ['Esc', 'Close dialogs'], ['?', 'Show this list'],
];
const GOTO: Record<string, string> = { h: '/', t: '/tasks', c: '/calendar', p: '/projects', n: '/notes', s: '/settings', m: '/marketplace', f: '/finance', i: '/insights' };

function useGlobalShortcuts() {
  const enabled = useEnabledModules();
  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useApp.setState((s) => ({ palette: !s.palette }));
        return;
      }
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || !t || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || document.querySelector('dialog[open]')) return;
      const k = e.key.toLowerCase();
      if (pendingG && Date.now() - pendingG < 1200 && GOTO[k]) {
        pendingG = 0;
        const target = GOTO[k];
        if (target === '/' || enabled.has(target.slice(1))) navigate(target);
        return;
      }
      pendingG = 0;
      if (k === 'g') pendingG = Date.now();
      else if (k === '/') { e.preventDefault(); useApp.setState({ palette: true }); }
      else if (k === 'c') { e.preventDefault(); openCapture(); }
      else if (k === 'n') { e.preventDefault(); openCapture('task'); }
      else if (e.key === '?') useApp.setState({ shortcuts: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

function useServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let reg: ServiceWorkerRegistration | undefined;
    const announce = (worker: ServiceWorker) =>
      toast('A new version of LIFEOS is ready.', { duration: 60_000, icon: 'sparkles', action: { label: 'Update', run: () => worker.postMessage({ type: 'SKIP_WAITING' }) } });
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((r) => {
      reg = r;
      if (r.waiting && navigator.serviceWorker.controller) announce(r.waiting);
      r.addEventListener('updatefound', () => {
        const w = r.installing;
        w?.addEventListener('statechange', () => w.state === 'installed' && navigator.serviceWorker.controller && (useApp.setState({ updateReady: true }), announce(w)));
      });
      if (navigator.onLine) navigator.serviceWorker.ready.then(() => warmModules());
    }).catch((e) => console.warn('service worker registration failed', e));
    let reloaded = false;
    const onChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    const hadController = !!navigator.serviceWorker.controller;
    if (hadController) navigator.serviceWorker.addEventListener('controllerchange', onChange);
    const check = setInterval(() => void reg?.update().catch(() => undefined), 60 * 60_000);
    return () => {
      clearInterval(check);
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
    };
  }, []);
}

// ── Shell ────────────────────────────────────────────────────────────────────────────────────────

export function Shell() {
  const [prefs, , loaded] = usePrefs();
  const identity = useApp((s) => s.identity);
  const shortcuts = useApp((s) => s.shortcuts);
  const segments = useSegments();
  const sync = useSync();
  const [skipOnboarding, setSkipOnboarding] = useState(false);
  useApplyPrefs(prefs, loaded);
  useGlobalShortcuts();
  useServiceWorker();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('capture')) {
      openCapture();
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const active = segments[0] ?? 'home';
  const title = moduleDef(active)?.name ?? 'LIFEOS';
  useEffect(() => {
    document.title = `${title} · LIFEOS`;
  }, [title]);

  // A signed-in device waits for its first sync before offering onboarding, so an existing
  // account's preferences are never overwritten by a fresh device.
  const firstSyncSettled = identity?.mode !== 'account' || sync.lastSyncAt !== null || ['offline', 'error', 'signed-out'].includes(sync.status) || syncState.getState().lastSyncAt !== null;
  const needsOnboarding = loaded && !prefs.onboarded && firstSyncSettled && !skipOnboarding;
  const immersive = active === 'spatial';

  return (
    <div className="app-canvas flex min-h-dvh">
      <a href="#main-scroll" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-solid focus:px-3 focus:py-2">Skip to content</a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} />
        {sync.status === 'signed-out' && (
          <div role="alert" className="flex flex-wrap items-center justify-center gap-2 border-b border-bad/30 bg-bad/10 px-4 py-2 text-sm">
            <Icon name="lock" size={15} className="text-bad" />Your session has ended. Changes are kept on this device and will sync after you sign in again.
            <Button size="sm" onClick={() => { writeIdentity(null); window.location.href = '/app'; }}>Sign in</Button>
          </div>
        )}
        <main id="main-scroll" tabIndex={-1} className={cx('min-w-0 flex-1 outline-none', immersive && 'relative')}>
          <ModuleHost />
        </main>
      </div>
      {prefs.rightPanel && !immersive && <ContextPanel />}
      <MobileNav />
      <Launcher />
      <Palette />
      <Capture />
      <NotificationCenter />
      <RecordEditor />
      <Sheet open={shortcuts} onClose={() => useApp.setState({ shortcuts: false })} title="Keyboard shortcuts" width={460}>
        <dl className="divide-y divide-line">
          {SHORTCUTS.map(([keys, what]) => <div key={keys} className="flex items-center justify-between gap-3 py-2 text-sm"><dt className="text-muted">{what}</dt><dd><kbd className="kbd">{keys}</kbd></dd></div>)}
        </dl>
      </Sheet>
      {needsOnboarding && <Onboarding onDone={() => setSkipOnboarding(true)} />}
      <OverlayHost />
    </div>
  );
}
