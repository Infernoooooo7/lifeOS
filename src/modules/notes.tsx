'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate, openEditor } from '@/core/app';
import type { Rec } from '@/core/data/db';
import { useRecord, useRecords } from '@/core/data/hooks';
import { create, list, remove, update, upsert } from '@/core/data/store';
import { downloadFile } from '@/core/lib/backup';
import { fmtDateTime, timeAgo, ymd } from '@/core/lib/dates';
import { Page, type ModuleProps } from '@/shell/Page';
import { Graph, type GraphEdge, type GraphNode } from '@/ui/Graph';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Empty, IconButton, Menu, Segmented, Sheet, cx, useIsMobile, useWindowed } from '@/ui/kit';
import { Markdown, wikiLinks } from '@/ui/Markdown';
import { confirmDialog, toast } from '@/ui/overlays';
import { deleteWithUndo } from '@/ui/RecordEditor';

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
const VERSION_GAP = 10 * 60_000;
const MAX_VERSIONS = 25;

export async function openOrCreateByTitle(title: string): Promise<void> {
  const all = await list('notes');
  const found = all.find((n) => norm(n.title) === norm(title));
  navigate(`/notes/${(found ?? (await create('notes', { title, content: '', kind: 'note', tags: [] }))).id}`);
}

export async function openDailyNote(): Promise<void> {
  const title = ymd();
  const all = await list('notes');
  const found = all.find((n) => n.kind === 'daily' && n.title === title);
  const heading = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  navigate(`/notes/${(found ?? (await create('notes', { title, kind: 'daily', tags: ['daily'], content: `# ${heading}\n\n## Plan\n- [ ] \n\n## Notes\n\n` }))).id}`);
}

/** Snapshot the previous content before it is replaced, at most once every ten minutes per note. */
async function snapshot(note: Rec): Promise<void> {
  if (!String(note.content ?? '').trim()) return;
  const versions = (await list('noteVersions')).filter((v) => v.noteId === note.id).sort((a, b) => b._ca - a._ca);
  if (versions[0] && (Date.now() - versions[0]._ca < VERSION_GAP || versions[0].content === note.content)) return;
  await create('noteVersions', { noteId: note.id, title: note.title, content: note.content, at: new Date().toISOString() }, { silent: true });
  for (const old of versions.slice(MAX_VERSIONS - 1)) await remove(old.id, { silent: true });
}

const TOOLS: { icon: IconName; label: string; before: string; after?: string; line?: boolean }[] = [
  { icon: 'pencil', label: 'Bold', before: '**', after: '**' },
  { icon: 'journal', label: 'Italic', before: '_', after: '_' },
  { icon: 'flag', label: 'Heading', before: '## ', line: true },
  { icon: 'list', label: 'Bullet list', before: '- ', line: true },
  { icon: 'tasks', label: 'Checkbox', before: '- [ ] ', line: true },
  { icon: 'link', label: 'Link', before: '[', after: '](https://)' },
  { icon: 'network', label: 'Link to a note', before: '[[', after: ']]' },
  { icon: 'command', label: 'Code', before: '`', after: '`' },
  { icon: 'sticky', label: 'Quote', before: '> ', line: true },
];

function Editor({ id, notes, onBack }: { id: string; notes: Rec[]; onBack?: () => void }) {
  const note = useRecord(id);
  const notebooks = useRecords('notebooks');
  const versions = useRecords('noteVersions');
  const mobile = useIsMobile();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'write' | 'preview' | 'split'>('write');
  const [tagDraft, setTagDraft] = useState('');
  const [history, setHistory] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const loaded = useRef<string | null>(null);
  const dirty = useRef(false);

  // Load when switching notes; while typing, local state is the source of truth.
  useEffect(() => {
    if (note && loaded.current !== note.id) {
      loaded.current = note.id;
      dirty.current = false;
      setTitle(String(note.title ?? ''));
      setContent(String(note.content ?? ''));
      setMode(String(note.content ?? '').trim() && !mobile ? 'split' : String(note.content ?? '').trim() ? 'preview' : 'write');
    } else if (note && !dirty.current && (note.content !== content || note.title !== title)) {
      // changed elsewhere (sync or another tab) while not editing here
      setTitle(String(note.title ?? ''));
      setContent(String(note.content ?? ''));
    }
  }, [note]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced auto-save.
  useEffect(() => {
    if (!note || !dirty.current) return;
    const t = setTimeout(async () => {
      if (note.content !== content) await snapshot(note);
      await update(note.id, { title, content }, { silent: true });
      dirty.current = false;
    }, 600);
    return () => clearTimeout(t);
  }, [title, content]); // eslint-disable-line react-hooks/exhaustive-deps

  const titles = useMemo(() => new Set(notes.map((n) => norm(n.title))), [notes]);
  const backlinks = useMemo(() => (note ? notes.filter((n) => n.id !== note.id && wikiLinks(n.content).some((t) => norm(t) === norm(title))) : []), [notes, note, title]);
  const myVersions = useMemo(() => versions.filter((v) => v.noteId === id).sort((a, b) => b._ca - a._ca), [versions, id]);

  if (note === undefined) return <div className="p-6 text-sm text-faint">Loading…</div>;
  if (!note || note.deletedAt) return <Empty icon="notes" title="Note not found" hint="It may have been deleted." action={<Button onClick={() => navigate('/notes')}>All notes</Button>} />;

  const edit = (fn: () => void) => { dirty.current = true; fn(); };
  const insert = (tool: (typeof TOOLS)[number]) => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    let next: string;
    let cursor: number;
    if (tool.line) {
      const lineStart = content.lastIndexOf('\n', s - 1) + 1;
      next = content.slice(0, lineStart) + tool.before + content.slice(lineStart);
      cursor = e + tool.before.length;
    } else {
      next = content.slice(0, s) + tool.before + content.slice(s, e) + (tool.after ?? '') + content.slice(e);
      cursor = e + tool.before.length;
    }
    edit(() => setContent(next));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
  };
  const tags = (note.tags as string[] | undefined) ?? [];
  const addTag = () => { const t = tagDraft.trim().replace(/^#/, ''); if (t && !tags.includes(t)) void update(note.id, { tags: [...tags, t] }, { silent: true }); setTagDraft(''); };
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center gap-1 border-b border-line px-2 py-1.5">
        {onBack && <IconButton icon="arrowLeft" label="Back to notes" onClick={onBack} />}
        <input className="min-w-0 flex-1 bg-transparent px-2 font-display text-[1.25rem] font-semibold outline-none placeholder:text-faint" placeholder="Untitled" aria-label="Note title" value={title} onChange={(e) => edit(() => setTitle(e.target.value))} />
        <IconButton icon="pinned" label={note.pinned ? 'Unpin note' : 'Pin note'} active={!!note.pinned} onClick={() => void update(note.id, { pinned: !note.pinned }, { silent: true })} />
        <Menu
          label="Note actions"
          items={[
            { label: 'Version history', icon: 'history', hint: String(myVersions.length), onClick: () => setHistory(true) },
            { label: 'Save as template', icon: 'layers', onClick: () => void upsert('templates', `tpl:${note.id}`, { kind: 'notes', name: title || 'Untitled', payload: { title, content, tags } }).then(() => toast('Saved as template', { tone: 'good' })) },
            { label: 'Export as Markdown', icon: 'download', onClick: () => downloadFile(`${(title || 'note').replace(/[^\w -]+/g, '').slice(0, 60) || 'note'}.md`, `# ${title}\n\n${content}`, 'text/markdown') },
            { label: 'Details…', icon: 'sliders', onClick: () => openEditor('notes', note.id) },
            { label: note.archived ? 'Unarchive' : 'Archive', icon: 'archive', onClick: () => void update(note.id, { archived: !note.archived }) },
            { separator: true, label: '' },
            { label: 'Delete', icon: 'trash', danger: true, onClick: () => void deleteWithUndo(note, 'Note').then(() => navigate('/notes')) },
          ]}
          trigger={(p) => <IconButton icon="more" label="Note actions" {...p} />}
        />
      </div>
      <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5 text-sm">
        <select className="input !min-h-8 !w-auto max-w-40 !py-0.5 text-sm" aria-label="Notebook" value={(note.notebookId as string) ?? ''} onChange={(e) => void update(note.id, { notebookId: e.target.value || null }, { silent: true })}>
          <option value="">No notebook</option>
          {notebooks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        {tags.map((t) => <span key={t} className="chip chip-accent">#{t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => void update(note.id, { tags: tags.filter((x) => x !== t) }, { silent: true })}><Icon name="x" size={12} /></button></span>)}
        <input className="w-24 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-faint" placeholder="+ tag" aria-label="Add tag" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} onBlur={addTag} />
        <span className="flex-1" />
        <Segmented size="sm" label="Editor mode" value={mode} onChange={setMode} options={[{ value: 'write', label: 'Write' }, ...(mobile ? [] : [{ value: 'split' as const, label: 'Split' }]), { value: 'preview', label: 'Preview' }]} />
      </div>
      {mode !== 'preview' && (
        <div className="flex flex-none gap-0.5 overflow-x-auto border-b border-line px-2 py-1 no-scrollbar" role="toolbar" aria-label="Formatting">
          {TOOLS.map((t) => <IconButton key={t.label} icon={t.icon} label={t.label} className="!size-9" size={16} onClick={() => insert(t)} />)}
        </div>
      )}
      <div className={cx('grid min-h-0 flex-1', mode === 'split' ? 'grid-cols-2 divide-x divide-line' : 'grid-cols-1')}>
        {mode !== 'preview' && <textarea ref={area} className="h-full min-h-[40dvh] w-full resize-none bg-transparent p-4 font-mono text-[0.92rem] leading-relaxed outline-none placeholder:text-faint" placeholder="Start writing… Markdown and [[links to other notes]] are supported." aria-label="Note content" value={content} onChange={(e) => edit(() => setContent(e.target.value))} />}
        {mode !== 'write' && (
          <div className="min-h-0 overflow-y-auto p-4">
            {content.trim() ? <Markdown text={content} exists={(t) => titles.has(norm(t))} onWikiLink={(t) => void openOrCreateByTitle(t)} /> : <p className="text-sm text-faint">Nothing to preview yet.</p>}
          </div>
        )}
      </div>
      <div className="flex-none border-t border-line px-3 py-2">
        {backlinks.length > 0 && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="eyebrow">Linked from</span>
            {backlinks.map((b) => <button key={b.id} type="button" className="chip hover:border-accent" onClick={() => navigate(`/notes/${b.id}`)}><Icon name="link" size={12} />{b.title || 'Untitled'}</button>)}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-faint"><span>{words} words · edited {timeAgo(note._ua)}</span><span>{note._dirty ? 'Saved on this device' : 'Saved'}</span></div>
      </div>
      <Sheet open={history} onClose={() => setHistory(false)} title="Version history" width={520}>
        {myVersions.length === 0 ? <Empty icon="history" title="No earlier versions yet" hint="A snapshot is kept as you edit, at most every ten minutes." /> : myVersions.map((v) => (
          <div key={v.id} className="mb-2 rounded-xl border border-line p-3">
            <div className="mb-1 flex items-center gap-2"><span className="flex-1 text-sm font-medium">{fmtDateTime(v.at)}</span>
              <Button size="sm" icon="undo" onClick={async () => { if (await confirmDialog({ title: 'Restore this version?', body: 'The current text is saved as a version first, so nothing is lost.', confirmLabel: 'Restore' })) { await create('noteVersions', { noteId: note.id, title, content, at: new Date().toISOString() }, { silent: true }); await update(note.id, { title: v.title ?? title, content: v.content }, { silent: true }); loaded.current = null; setHistory(false); toast('Version restored', { tone: 'good' }); } }}>Restore</Button>
            </div>
            <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted">{String(v.content ?? '').slice(0, 300)}</p>
          </div>
        ))}
      </Sheet>
    </div>
  );
}

function NotebookTree({ notebooks, counts, selected, onSelect }: { notebooks: Rec[]; counts: Map<string, number>; selected: string; onSelect: (id: string) => void }) {
  const children = (parent: string | null, depth: number): React.ReactNode =>
    notebooks.filter((n) => (n.parentId ?? null) === parent || (parent === null && n.parentId && !notebooks.some((x) => x.id === n.parentId))).sort((a, b) => String(a.name).localeCompare(String(b.name))).map((n) => (
      <div key={n.id}>
        <div className={cx('group flex items-center rounded-lg text-sm', selected === n.id ? 'bg-accent-soft text-text' : 'text-muted hover:bg-surface-2')} style={{ paddingLeft: depth * 14 }}>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left" onClick={() => onSelect(n.id)}>
            <Icon name="folder" size={15} className="flex-none" /><span className="min-w-0 flex-1 truncate">{n.name}</span><span className="text-xs text-faint">{counts.get(n.id) ?? 0}</span>
          </button>
          <IconButton icon="pencil" label={`Edit notebook ${n.name}`} className="!size-7 opacity-0 focus:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100" size={13} onClick={() => openEditor('notebooks', n.id)} />
        </div>
        {depth < 5 && children(n.id, depth + 1)}
      </div>
    ));
  return <>{children(null, 0)}</>;
}

export default function Notes({ sub }: ModuleProps) {
  const notes = useRecords('notes');
  const notebooks = useRecords('notebooks');
  const templates = useRecords('templates').filter((t) => t.kind === 'notes');
  const mobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [notebook, setNotebook] = useState('');
  const [tag, setTag] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const selectedId = sub[0] && sub[0] !== 'graph' ? sub[0] : null;
  const graphView = sub[0] === 'graph';

  const live = useMemo(() => notes.filter((n) => showArchived || !n.archived), [notes, showArchived]);
  const allTags = useMemo(() => [...new Set(live.flatMap((n) => (n.tags as string[] | undefined) ?? []))].sort(), [live]);
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const n of live) if (n.notebookId) m.set(n.notebookId, (m.get(n.notebookId) ?? 0) + 1); return m; }, [live]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return live.filter((n) => (!q || (n._s ?? '').includes(q)) && (!notebook || n.notebookId === notebook) && (!tag || ((n.tags as string[] | undefined) ?? []).includes(tag)))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b._ua - a._ua);
  }, [live, query, notebook, tag]);
  const { visible, sentinel } = useWindowed(filtered, 60);

  const graph = useMemo(() => {
    const byTitle = new Map(live.map((n) => [norm(n.title), n]));
    const nodes: GraphNode[] = live.map((n) => ({ id: n.id, label: String(n.title || 'Untitled'), color: n.kind === 'daily' ? 'var(--violet)' : 'var(--accent)', weight: 1 }));
    const edges: GraphEdge[] = [];
    const ghosts = new Map<string, string>();
    for (const n of live) for (const t of wikiLinks(n.content)) {
      const target = byTitle.get(norm(t));
      if (target) edges.push({ from: n.id, to: target.id });
      else { if (!ghosts.has(norm(t))) { ghosts.set(norm(t), `ghost:${t}`); nodes.push({ id: `ghost:${t}`, label: t, ghost: true, color: 'var(--faint)' }); } edges.push({ from: n.id, to: ghosts.get(norm(t))!, dashed: true }); }
    }
    for (const node of nodes) node.weight = 1 + edges.filter((e) => e.from === node.id || e.to === node.id).length;
    return { nodes, edges };
  }, [live]);

  const newNote = async (fields: Record<string, unknown> = {}) => navigate(`/notes/${(await create('notes', { title: '', content: '', kind: 'note', tags: tag ? [tag] : [], notebookId: notebook || null, ...fields })).id}`);
  const exportAll = () => downloadFile(`lifeos-notes-${ymd()}.md`, live.map((n) => `# ${n.title || 'Untitled'}\n\n${n.content ?? ''}`).join('\n\n---\n\n'), 'text/markdown');

  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-none space-y-2 p-3">
        <div className="relative">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input className="input !pl-9" type="search" placeholder="Search notes…" aria-label="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div>
          <div className={cx('flex items-center rounded-lg text-sm', !notebook ? 'bg-accent-soft' : 'text-muted hover:bg-surface-2')}>
            <button type="button" className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left" onClick={() => setNotebook('')}><Icon name="notes" size={15} /><span className="flex-1">All notes</span><span className="text-xs text-faint">{live.length}</span></button>
            <IconButton icon="plus" label="New notebook" className="!size-7" size={14} onClick={() => openEditor('notebooks', undefined, notebook ? { parentId: notebook } : undefined)} />
          </div>
          <NotebookTree notebooks={notebooks} counts={counts} selected={notebook} onSelect={setNotebook} />
        </div>
        {allTags.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {allTags.map((t) => <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? '' : t)} className={cx('chip flex-none', tag === t && 'chip-accent')}>#{t}</button>)}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-1.5 py-1.5">
        {filtered.length === 0 ? <Empty icon="notes" title={query ? 'No notes match' : 'No notes yet'} hint={query ? undefined : 'Capture thoughts, link them with [[double brackets]] and watch your knowledge graph grow.'} action={!query && <Button variant="primary" icon="plus" onClick={() => void newNote()}>New note</Button>} /> : visible.map((n) => (
          <button key={n.id} type="button" onClick={() => navigate(`/notes/${n.id}`)} aria-current={selectedId === n.id ? 'true' : undefined} className={cx('mb-0.5 block w-full rounded-xl px-3 py-2 text-left', selectedId === n.id ? 'bg-accent-soft' : 'hover:bg-surface-2', n.archived && 'opacity-60')}>
            <span className="flex items-center gap-1.5">{n.pinned && <Icon name="pinned" size={13} className="flex-none text-accent" />}<span className="min-w-0 flex-1 truncate font-medium">{n.title || 'Untitled'}</span><span className="flex-none text-[0.7rem] text-faint">{timeAgo(n._ua)}</span></span>
            <span className="mt-0.5 line-clamp-2 text-xs text-muted">{String(n.content ?? '').replace(/[#*_>`\[\]-]/g, '').slice(0, 140) || 'Empty note'}</span>
          </button>
        ))}
        {sentinel}
        <label className="flex items-center gap-2 px-3 py-2 text-xs text-faint"><input type="checkbox" className="accent-[var(--accent)]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived</label>
      </div>
    </div>
  );

  return (
    <Page
      module="notes" wide
      actions={
        <>
          <Button size="sm" icon="sun" onClick={() => void openDailyNote()}>Today</Button>
          <Button size="sm" icon="network" onClick={() => navigate(graphView ? '/notes' : '/notes/graph')}>{graphView ? 'Notes' : 'Graph'}</Button>
          <Menu
            label="More"
            items={[
              ...(templates.length ? templates.map((t) => ({ label: `New from “${t.name}”`, icon: 'copy' as const, onClick: () => void newNote({ ...(t.payload as object), title: `${(t.payload as { title?: string }).title ?? t.name}` }) })) : [{ label: 'No note templates yet', disabled: true }]),
              ...(templates.map((t) => ({ label: `Delete template “${t.name}”`, icon: 'trash' as const, danger: true, onClick: () => void remove(t.id, { silent: true }) }))),
              { separator: true, label: '' },
              { label: 'Export all notes (.md)', icon: 'download' as const, disabled: !live.length, onClick: exportAll },
            ]}
            trigger={(p) => <IconButton icon="more" label="More note options" {...p} />}
          />
          <Button variant="primary" size="sm" icon="plus" onClick={() => void newNote()}>Note</Button>
        </>
      }
    >
      {graphView ? (
        <>
          <p className="mb-3 text-sm text-muted">{graph.nodes.filter((n) => !n.ghost).length} notes · {graph.edges.length} links. Dashed circles are notes you have linked to but not written yet — select one to create it.</p>
          <Graph nodes={graph.nodes} edges={graph.edges} height={560} onOpen={(id) => (id.startsWith('ghost:') ? void openOrCreateByTitle(id.slice(6)) : navigate(`/notes/${id}`))} emptyTitle="No notes to map yet" emptyHint="Write notes and link them with [[Title]]." />
        </>
      ) : mobile ? (
        selectedId ? <div className="-mx-4 -mb-20 h-[calc(100dvh-220px)] min-h-[420px] border-t border-line"><Editor id={selectedId} notes={live} onBack={() => navigate('/notes')} /></div> : <div className="-mx-4 h-[calc(100dvh-230px)] min-h-[420px]">{listPane}</div>
      ) : (
        <div className="grid h-[calc(100dvh-170px)] min-h-[460px] grid-cols-[300px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-line bg-surface/40">
          <div className="min-h-0 border-r border-line">{listPane}</div>
          <div className="min-h-0 min-w-0">{selectedId ? <Editor id={selectedId} notes={live} /> : <div className="grid h-full place-items-center"><Empty icon="notes" title="Select a note" hint="Or start a new one. Press C anywhere to capture quickly." action={<Button variant="primary" icon="plus" onClick={() => void newNote()}>New note</Button>} /></div>}</div>
        </div>
      )}
    </Page>
  );
}
