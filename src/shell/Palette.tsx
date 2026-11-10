'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate, openCapture, openEditor, useApp } from '@/core/app';
import { collection as collectionDef } from '@/core/collections';
import { useEnabledModules, usePrefs } from '@/core/data/hooks';
import { syncNow } from '@/core/data/syncClient';
import { search, type SearchHit } from '@/core/lib/search';
import { MODULES } from '@/core/registry';
import { Icon, type IconName } from '@/ui/icons';
import { Sheet, cx } from '@/ui/kit';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: IconName | string;
  run: () => void;
  keywords?: string;
}

/** Which module owns a collection — used to hide results from modules that are switched off. */
const OWNER: Record<string, string> = {
  tasks: 'tasks', events: 'calendar', calendars: 'calendar', projects: 'projects', milestones: 'projects', timeEntries: 'projects', notes: 'notes', notebooks: 'notes',
  habits: 'habits', routines: 'habits', goals: 'goals', visionItems: 'goals', reviews: 'goals', achievements: 'goals', accounts: 'finance', transactions: 'finance', budgets: 'finance',
  subscriptions: 'finance', debts: 'finance', savingsGoals: 'finance', subjects: 'learning', courses: 'learning', lectures: 'learning', decks: 'learning', flashcards: 'learning',
  assignments: 'learning', exams: 'learning', readings: 'learning', studySessions: 'learning', questions: 'learning', workouts: 'health', exercises: 'health', workoutPlans: 'health',
  bodyLogs: 'health', sleepLogs: 'health', meals: 'health', cardio: 'health', journal: 'journal', distractions: 'focus', shoppingLists: 'shopping', shoppingItems: 'shopping',
  wishlist: 'shopping', purchases: 'shopping', inventory: 'shopping', trips: 'travel', itinerary: 'travel', reservations: 'travel', places: 'travel', files: 'files', media: 'entertainment',
  bookmarks: 'digital', apps: 'digital', devices: 'digital', licenses: 'digital', digitalAccounts: 'digital', dates: 'admin', contacts: 'admin', maintenance: 'admin',
  checklists: 'utilities', countdowns: 'utilities', automations: 'automation',
};
export const ownerModule = (collection: string): string | undefined => OWNER[collection];

/** Open a search hit in the place that makes most sense for its type. */
export function openHit(rec: { id: string; _c: string }) {
  if (rec._c === 'notes') navigate(`/notes/${rec.id}`);
  else if (rec._c === 'projects') navigate(`/projects/${rec.id}`);
  else if (rec._c === 'trips') navigate(`/travel/${rec.id}`);
  else if (rec._c === 'automations') navigate('/automation');
  else if (collectionDef(rec._c).system) navigate(`/${OWNER[rec._c] ?? ''}`);
  else openEditor(rec._c, rec.id);
}

/** Universal search and command palette (Ctrl/⌘ K). On phones it is a full-height sheet. */
export function Palette() {
  const open = useApp((s) => s.palette);
  const enabled = useEnabledModules();
  const [prefs, setPrefs] = usePrefs();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      setTimeout(() => input.current?.focus(), 40);
    }
  }, [open]);

  const allowed = useMemo(() => new Set(Object.entries(OWNER).filter(([, m]) => enabled.has(m)).map(([c]) => c)), [enabled]);
  useEffect(() => {
    if (!open || !query.trim()) return setHits([]);
    let live = true;
    const t = setTimeout(() => void search(query, { limit: 30, collections: allowed }).then((r) => live && setHits(r)), 90);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, open, allowed]);

  const commands = useMemo<Command[]>(() => {
    const close = () => useApp.setState({ palette: false });
    const cmds: Command[] = [
      { id: 'cap-task', label: 'New task', icon: 'tasks', hint: 'N', run: () => openCapture('task'), keywords: 'add create todo' },
      { id: 'cap-note', label: 'New note', icon: 'notes', run: () => openCapture('note'), keywords: 'add create write' },
      { id: 'cap-event', label: 'New event', icon: 'calendar', run: () => openCapture('event'), keywords: 'add meeting appointment' },
      { id: 'cap-expense', label: 'Log expense', icon: 'wallet', run: () => openCapture('expense'), keywords: 'add money spend' },
      { id: 'cap-journal', label: 'Write journal entry', icon: 'journal', run: () => openCapture('journal'), keywords: 'diary' },
      { id: 'cap-any', label: 'Quick capture…', icon: 'plus', hint: 'C', run: () => openCapture(), keywords: 'add new idea link reminder goal' },
      ...MODULES.filter((m) => enabled.has(m.id)).map((m) => ({ id: `go-${m.id}`, label: `Go to ${m.name}`, icon: m.icon, run: () => navigate(m.id === 'home' ? '/' : `/${m.id}`), keywords: m.tagline })),
      { id: 'theme', label: `Switch to ${prefs.theme === 'light' ? 'dark' : 'light'} theme`, icon: prefs.theme === 'light' ? 'moon' : 'sun', run: () => (setPrefs({ theme: prefs.theme === 'light' ? 'dark' : 'light' }), close()), keywords: 'appearance mode' },
      { id: 'sync', label: 'Sync now', icon: 'refresh', run: () => (void syncNow(), close()), keywords: 'refresh cloud' },
      { id: 'backup', label: 'Export a backup', icon: 'download', run: () => navigate('/settings/data'), keywords: 'download json' },
      { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'command', hint: '?', run: () => useApp.setState({ palette: false, shortcuts: true }) },
    ];
    const q = query.trim().toLowerCase();
    if (!q) return cmds.slice(0, 6).concat(cmds.filter((c) => c.id.startsWith('go-')).slice(0, 6));
    return cmds.filter((c) => `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(q)).slice(0, 6);
  }, [query, enabled, prefs.theme, setPrefs]);

  const rows = useMemo(
    () => [
      ...commands.map((c) => ({ key: c.id, run: c.run, node: { icon: c.icon, title: c.label, sub: '', hint: c.hint } })),
      ...hits.map((h) => ({ key: h.rec.id, run: () => { useApp.setState({ palette: false }); openHit(h.rec); }, node: { icon: collectionDef(h.rec._c).icon, title: h.rec.private ? 'Private entry' : h.title, sub: `${collectionDef(h.rec._c).one}${h.snippet && !h.rec.private ? ` · ${h.snippet}` : ''}`, hint: undefined as string | undefined } })),
    ],
    [commands, hits],
  );
  useEffect(() => setIndex(0), [query]);
  useEffect(() => listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }), [index]);

  return (
    <Sheet open={open} onClose={() => useApp.setState({ palette: false })} width={620} label="Search and commands" full>
      <div className="-mx-4 -mt-4 sm:-mx-5">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Icon name="search" size={18} className="text-faint" />
          <input
            ref={input} className="h-13 min-w-0 flex-1 bg-transparent py-3.5 text-[1.02rem] outline-none placeholder:text-faint" placeholder="Search everything or type a command…" aria-label="Search everything or type a command"
            role="combobox" aria-expanded="true" aria-controls="palette-list" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(rows.length - 1, i + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
              else if (e.key === 'Enter' && rows[index]) { e.preventDefault(); rows[index].run(); }
            }}
          />
          <button type="button" className="btn btn-sm btn-ghost md:hidden" onClick={() => useApp.setState({ palette: false })}>Close</button>
          <kbd className="kbd max-md:hidden">Esc</kbd>
        </div>
        <div ref={listRef} id="palette-list" role="listbox" className="max-h-[60dvh] overflow-y-auto p-2 max-md:max-h-none">
          {rows.length === 0 && <p className="px-3 py-8 text-center text-sm text-faint">No results for “{query}”.</p>}
          {rows.map((r, i) => (
            <div key={r.key}>
              {i === 0 && commands.length > 0 && <div className="eyebrow px-3 pb-1 pt-2">{query ? 'Commands' : 'Suggestions'}</div>}
              {i === commands.length && hits.length > 0 && <div className="eyebrow px-3 pb-1 pt-3">Results</div>}
              <button type="button" role="option" aria-selected={i === index} data-active={i === index} onMouseMove={() => setIndex(i)} onClick={r.run} className={cx('flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left', i === index && 'bg-surface-2')}>
                <span className="grid size-8 flex-none place-items-center rounded-lg bg-surface-2 text-muted"><Icon name={r.node.icon} size={16} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[0.94rem]">{r.node.title}</span>{r.node.sub && <span className="block truncate text-xs text-faint">{r.node.sub}</span>}</span>
                {r.node.hint && <kbd className="kbd">{r.node.hint}</kbd>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
