'use client';

import { useMemo, useState } from 'react';
import { navigate } from '@/core/app';
import { setModule, useModules, usePrefs, type ModuleState } from '@/core/data/hooks';
import { timeAgo } from '@/core/lib/dates';
import { MODULES, STATUS_LABEL, featureCounts, moduleDef, type FeatureStatus, type ModuleDef } from '@/core/registry';
import { Page, type ModuleProps } from '@/shell/Page';
import { Icon } from '@/ui/icons';
import { Button, Empty, IconButton, Section, Sheet, Switch, cx } from '@/ui/kit';
import { confirmDialog, toast } from '@/ui/overlays';

const STATUS_COLOR: Record<FeatureStatus, string> = { implemented: 'var(--good)', partial: 'var(--warn)', integration: 'var(--violet)', planned: 'var(--faint)' };
const CATEGORIES = ['All', 'Productivity', 'Knowledge', 'Money', 'Wellbeing', 'Lifestyle', 'System'] as const;

export function StatusBadge({ status }: { status: FeatureStatus }) {
  return <span className="chip flex-none" style={{ color: STATUS_COLOR[status], borderColor: `color-mix(in oklab, ${STATUS_COLOR[status]} 35%, transparent)` }}><span className="size-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />{STATUS_LABEL[status]}</span>;
}

/** Switch a module on (with what it builds on) or off (warning about modules that build on it). */
export async function toggleModule(def: ModuleDef, enable: boolean, all: ModuleState[]): Promise<void> {
  if (enable) {
    const missing = (def.deps ?? []).filter((d) => !all.find((m) => m.def.id === d)?.enabled);
    for (const d of missing) await setModule(d, { enabled: true });
    await setModule(def.id, { enabled: true });
    toast(`${def.name} activated${missing.length ? ` together with ${missing.map((d) => moduleDef(d)?.name).join(', ')}` : ''}`, { tone: 'good', action: { label: 'Open', run: () => navigate(`/${def.id}`) } });
  } else {
    const dependants = all.filter((m) => m.enabled && m.def.deps?.includes(def.id));
    if (dependants.length && !(await confirmDialog({ title: `Switch off ${def.name}?`, body: `${dependants.map((m) => m.def.name).join(', ')} build${dependants.length === 1 ? 's' : ''} on it and will lose some functions. Your data is kept either way.`, confirmLabel: 'Switch off' }))) return;
    await setModule(def.id, { enabled: false });
    toast(`${def.name} switched off. Your data is kept.`, { action: { label: 'Undo', run: () => void setModule(def.id, { enabled: true }) } });
  }
}

function ModuleCard({ m, all, onDetails, matches }: { m: ModuleState; all: ModuleState[]; onDetails: () => void; matches?: string[] }) {
  const counts = m.def.features.reduce<Record<string, number>>((a, f) => ({ ...a, [f.status]: (a[f.status] ?? 0) + 1 }), {});
  return (
    <div className={cx('card flex flex-col', m.enabled && 'border-line-strong')}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 flex-none place-items-center rounded-[14px]" style={{ background: `oklch(0.75 0.14 ${m.def.hue} / 0.15)`, color: `oklch(0.8 0.13 ${m.def.hue})` }}><Icon name={m.def.icon} size={21} /></span>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onDetails}>
          <span className="block truncate font-semibold">{m.def.name}</span>
          <span className="block truncate text-sm text-muted">{m.def.tagline}</span>
        </button>
        {!m.def.core && <IconButton icon="star" label={m.favorite ? `Remove ${m.def.name} from favourites` : `Add ${m.def.name} to favourites`} className={cx('!size-8', m.favorite && '!text-warn [&_svg]:fill-warn')} onClick={() => void setModule(m.def.id, { favorite: !m.favorite })} />}
      </div>
      {matches && matches.length > 0 && <p className="mt-2 line-clamp-2 text-xs text-accent">Matches: {matches.slice(0, 4).join(' · ')}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{m.def.features.length} capabilities</span>
        {(['implemented', 'partial', 'integration', 'planned'] as FeatureStatus[]).filter((s) => counts[s]).map((s) => <span key={s} className="inline-flex items-center gap-1" title={STATUS_LABEL[s]}><span className="size-1.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />{counts[s]}<span className="sr-only"> {STATUS_LABEL[s]}</span></span>)}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <Button size="sm" variant="ghost" onClick={onDetails}>Details</Button>
        <span className="flex-1" />
        {m.def.core ? <span className="chip">Always on</span> : (
          <label className="flex items-center gap-2 text-sm"><span className={m.enabled ? 'text-good' : 'text-faint'}>{m.enabled ? 'Active' : 'Off'}</span><Switch checked={m.enabled} onChange={(v) => void toggleModule(m.def, v, all)} label={`${m.enabled ? 'Deactivate' : 'Activate'} ${m.def.name}`} /></label>
        )}
        {m.enabled && <Button size="sm" icon="arrowRight" onClick={() => navigate(m.def.id === 'home' ? '/' : `/${m.def.id}`)}>Open</Button>}
      </div>
    </div>
  );
}

export default function Marketplace(_: ModuleProps) {
  const modules = useModules();
  const [prefs] = usePrefs();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [state, setState] = useState<'all' | 'installed' | 'available'>('all');
  const [status, setStatus] = useState<FeatureStatus | 'all'>('all');
  const [detail, setDetail] = useState<string | null>(null);
  const counts = featureCounts();
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => modules.map((m) => {
    const matches = q ? m.def.features.filter((f) => `${f.name} ${f.description}`.toLowerCase().includes(q)).map((f) => f.name) : [];
    const self = !q || `${m.def.name} ${m.def.tagline} ${m.def.category}`.toLowerCase().includes(q);
    return { m, matches, show: (self || matches.length > 0) && (category === 'All' || m.def.category === category) && (state === 'all' || (state === 'installed') === m.enabled) && (status === 'all' || m.def.features.some((f) => f.status === status)) };
  }).filter((x) => x.show), [modules, q, category, state, status]);

  const browsing = !q && category === 'All' && state === 'all' && status === 'all';
  const recommended = modules.filter((m) => !m.enabled && !m.def.core && (m.def.interests?.some((i) => prefs.interests.includes(i)) || m.def.deps?.every((d) => modules.find((x) => x.def.id === d)?.enabled))).slice(0, 4);
  const recent = modules.filter((m) => m.enabled && m.lastUsedAt && !m.def.core).sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt))).slice(0, 6);
  const favourites = modules.filter((m) => m.favorite);
  const open = modules.find((m) => m.def.id === detail);

  return (
    <Page module="marketplace" wide>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="card !py-3"><div className="num text-2xl font-semibold">{MODULES.length}</div><div className="text-xs text-muted">Modules · {modules.filter((m) => m.enabled).length} active</div></div>
        {(['implemented', 'partial', 'integration', 'planned'] as FeatureStatus[]).map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(status === s ? 'all' : s)} className={cx('card card-hover !py-3 text-left', status === s && '!border-accent')}>
            <div className="num text-2xl font-semibold" style={{ color: STATUS_COLOR[s] }}>{counts[s]}</div><div className="text-xs text-muted">{STATUS_LABEL[s]}</div>
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input className="input !pl-9" type="search" placeholder={`Search ${counts.total} capabilities…`} aria-label="Search the feature catalog" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="input !w-auto" aria-label="Installed state" value={state} onChange={(e) => setState(e.target.value as typeof state)}><option value="all">All modules</option><option value="installed">Installed</option><option value="available">Not installed</option></select>
      </div>
      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar" role="radiogroup" aria-label="Category">
        {CATEGORIES.map((c) => <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)} className={cx('chip h-9 flex-none px-3.5 text-sm', category === c && 'chip-accent')}>{c}</button>)}
      </div>

      {browsing && recommended.length > 0 && (
        <Section title="Recommended for you" icon="sparkles" className="mb-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-3">{recommended.map((m) => <ModuleCard key={m.def.id} m={m} all={modules} onDetails={() => setDetail(m.def.id)} />)}</div>
        </Section>
      )}
      {browsing && (recent.length > 0 || favourites.length > 0) && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {recent.length > 0 && <Section title="Recently used" icon="history"><div className="flex flex-wrap gap-2">{recent.map((m) => <button key={m.def.id} type="button" className="chip h-9 px-3 text-sm hover:border-accent" onClick={() => navigate(`/${m.def.id}`)}><Icon name={m.def.icon} size={14} />{m.def.name}<span className="text-faint">{timeAgo(new Date(m.lastUsedAt!).getTime())}</span></button>)}</div></Section>}
          {favourites.length > 0 && <Section title="Favourites" icon="star"><div className="flex flex-wrap gap-2">{favourites.map((m) => <button key={m.def.id} type="button" className="chip h-9 px-3 text-sm hover:border-accent" onClick={() => navigate(`/${m.def.id}`)}><Icon name={m.def.icon} size={14} />{m.def.name}</button>)}</div></Section>}
        </div>
      )}

      <Section title={browsing ? 'All modules' : `${filtered.length} result${filtered.length === 1 ? '' : 's'}`} icon="store">
        {filtered.length === 0 ? <Empty icon="search" title="Nothing matches" hint="Try another word, or clear the filters." action={<Button onClick={() => { setQuery(''); setCategory('All'); setState('all'); setStatus('all'); }}>Clear filters</Button>} /> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-3">{filtered.map(({ m, matches }) => <ModuleCard key={m.def.id} m={m} all={modules} matches={matches} onDetails={() => setDetail(m.def.id)} />)}</div>
        )}
      </Section>
      <p className="mt-6 text-xs text-faint">Statuses are maintained in one registry file in the source code and shown as-is: nothing planned or integration-dependent is presented as working.</p>

      <Sheet
        open={!!open} onClose={() => setDetail(null)} side width={520} title={open?.def.name}
        footer={open && !open.def.core && <><span className="mr-auto text-sm text-muted">{open.enabled ? 'Active' : 'Not active'}</span><Button variant={open.enabled ? 'default' : 'primary'} onClick={() => void toggleModule(open.def, !open.enabled, modules)}>{open.enabled ? 'Deactivate' : 'Activate'}</Button>{open.enabled && <Button variant="primary" onClick={() => navigate(`/${open.def.id}`)}>Open</Button>}</>}
      >
        {open && (
          <>
            <p className="text-muted">{open.def.tagline}.</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs"><span className="chip">{open.def.category}</span>{open.def.deps?.map((d) => <span key={d} className="chip">Builds on {moduleDef(d)?.name}</span>)}{open.def.core && <span className="chip">Part of the platform</span>}</div>
            <h3 className="eyebrow mb-2 mt-5">{open.def.features.length} capabilities</h3>
            <ul className="space-y-3">
              {open.def.features.map((f) => (
                <li key={f.id} className="flex items-start gap-3">
                  <span className="mt-1.5 size-2 flex-none rounded-full" style={{ background: STATUS_COLOR[f.status] }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-medium">{f.name}</span>{f.status !== 'implemented' && <StatusBadge status={f.status} />}</div>
                    <p className="text-sm text-muted">{f.description}</p>
                    {f.note && <p className="mt-0.5 text-xs text-faint">{f.note}</p>}
                    {f.deps && <p className="mt-0.5 text-xs text-faint">Needs {f.deps.map((d) => moduleDef(d)?.name ?? d).join(', ')}</p>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-faint">Feature ids: {open.def.features[0]?.id.split('.')[0]}.*</p>
          </>
        )}
      </Sheet>
    </Page>
  );
}
