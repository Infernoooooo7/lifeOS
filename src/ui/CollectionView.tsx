'use client';

import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { openEditor } from '@/core/app';
import { collection as collectionDef, titleField, type CollectionDef, type FieldDef, type ViewKind } from '@/core/collections';
import type { Rec } from '@/core/data/db';
import { useFields, usePrefs, useRecords, useSetting } from '@/core/data/hooks';
import { createMany, restore, update } from '@/core/data/store';
import { downloadFile } from '@/core/lib/backup';
import { parseAmount, parseCsvObjects, toCsv } from '@/core/lib/csv';
import { fmtDate, parseDate, timeAgo, ymd } from '@/core/lib/dates';
import type { Fields } from '@/core/sync/merge';
import { FieldValue, optionOf, recordTitle, useFieldOptions } from './fields';
import { Icon, type IconName } from './icons';
import { Button, Checkbox, Empty, IconButton, Menu, Progress, Segmented, Sheet, cx, useWindowed, type MenuItem } from './kit';
import { MonthGrid, MonthNav, type CalItem } from './MonthGrid';
import { confirmDialog, promptDialog, toast } from './overlays';
import { deleteWithUndo, toggleTask } from './RecordEditor';

const VIEW_ICON: Record<ViewKind, IconName> = { list: 'list', table: 'table', board: 'columns', calendar: 'calendar', gallery: 'grid' };
const VIEW_LABEL: Record<ViewKind, string> = { list: 'List', table: 'Table', board: 'Board', calendar: 'Calendar', gallery: 'Cards' };

export interface CollectionViewProps {
  collection: string;
  /** restrict to a subset (for example one trip's items) */
  filter?: (rec: Rec) => boolean;
  /** field values applied to records created from this view */
  defaults?: Fields;
  views?: ViewKind[];
  /** key under which the chosen view is remembered */
  viewKey?: string;
  onOpen?: (rec: Rec) => void;
  emptyHint?: string;
  addLabel?: string;
  /** extra toolbar content */
  toolbar?: ReactNode;
  hideToolbar?: boolean;
  /** split the list view into labelled groups */
  groupBy?: (records: Rec[]) => { key: string; label: string; items: Rec[] }[];
  /** extra badges for a row (list view) */
  rowExtra?: (rec: Rec) => ReactNode;
}

function isDoneRec(def: CollectionDef, rec: Rec) {
  return def.done ? rec[def.done.k] === def.done.on : false;
}
async function toggleDone(def: CollectionDef, rec: Rec) {
  if (!def.done) return;
  if (def.id === 'tasks') return toggleTask(rec);
  await update(rec.id, { [def.done.k]: isDoneRec(def, rec) ? def.done.off : def.done.on });
}

function progressOf(rec: Rec): number | null {
  if (typeof rec.progress === 'number') return rec.progress;
  if (Number(rec.total) > 0) return Number(rec.current ?? 0) / Number(rec.total);
  if (Number(rec.pages) > 0) return Number(rec.currentPage ?? 0) / Number(rec.pages);
  if (Number(rec.target) > 0 && rec.saved !== undefined) return Number(rec.saved) / Number(rec.target);
  return null;
}

function Badges({ fields, rec, skip }: { fields: FieldDef[]; rec: Rec; skip?: string }) {
  return (
    <>
      {fields.filter((f) => f.list && f.k !== skip && f.t !== 'money').map((f) => {
        const v = <FieldValue key={f.k} def={f} value={rec[f.k]} rec={rec} />;
        return rec[f.k] == null || rec[f.k] === '' ? null : v;
      })}
    </>
  );
}

function Row({ def, fields, rec, onOpen, selecting, selected, onSelect, extra }: { def: CollectionDef; fields: FieldDef[]; rec: Rec; onOpen: () => void; selecting: boolean; selected: boolean; onSelect: () => void; extra?: ReactNode }) {
  const done = isDoneRec(def, rec);
  const tf = titleField(def);
  const moneyField = fields.find((f) => f.t === 'money' && f.list);
  const overdue = def.date && !done && rec[def.date] && parseDate(rec[def.date])! < new Date(new Date().setHours(0, 0, 0, 0)) && (def.id === 'tasks' || def.id === 'assignments' || def.id === 'milestones');
  return (
    <div className={cx('row group items-start', selected && 'bg-accent-soft')}>
      {selecting ? (
        <Checkbox checked={selected} onChange={onSelect} label={`Select ${recordTitle(def.id, rec)}`} />
      ) : def.done ? (
        <Checkbox checked={done} onChange={() => void toggleDone(def, rec)} label={`Mark ${recordTitle(def.id, rec)} ${done ? 'not done' : 'done'}`} />
      ) : rec.color ? (
        <span className="mt-2 size-2.5 flex-none rounded-full" style={{ background: rec.color }} />
      ) : null}
      <button type="button" onClick={selecting ? onSelect : onOpen} className="min-w-0 flex-1 py-1 text-left">
        <span className={cx('block truncate font-medium', done && 'text-faint line-through', rec.private && 'blur-sm hover:blur-none focus:blur-none')}>{recordTitle(def.id, rec)}</span>
        <span className={cx('mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted empty:hidden', overdue && '[&_.chip:has(svg.lucide-calendar)]:!border-bad/40 [&_.chip:has(svg.lucide-calendar)]:!text-bad')}>
          <Badges fields={fields} rec={rec} skip={tf} />
          {extra}
          {rec.archived && <span className="chip">Archived</span>}
          {rec._rejected && <span className="chip !text-bad">Sync error</span>}
        </span>
      </button>
      {moneyField && rec[moneyField.k] != null && (
        <span className={cx('mt-1.5 flex-none text-sm', rec.type === 'income' && 'text-good')}>
          <FieldValue def={moneyField} value={rec[moneyField.k]} rec={rec} />
        </span>
      )}
    </div>
  );
}

function BoardCard({ def, fields, rec, onOpen, columns, boardField }: { def: CollectionDef; fields: FieldDef[]; rec: Rec; onOpen: () => void; columns: { value: string | number; label: string }[]; boardField: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: rec.id });
  const p = progressOf(rec);
  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      style={{ transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined, zIndex: isDragging ? 30 : undefined }}
      className={cx('card card-hover cursor-grab touch-manipulation !p-3 active:cursor-grabbing', isDragging && 'shadow-2xl ring-1 ring-accent')}
    >
      <div className="flex items-start gap-1">
        <button type="button" className="min-w-0 flex-1 text-left font-medium" onClick={onOpen}>
          <span className={cx('line-clamp-2', isDoneRec(def, rec) && 'text-faint line-through')}>{recordTitle(def.id, rec)}</span>
        </button>
        <Menu
          label="Move to" items={columns.map((c) => ({ label: `Move to ${c.label}`, checked: String(rec[boardField]) === String(c.value), onClick: () => void (def.id === 'tasks' && (c.value === 'done') !== (rec.status === 'done') ? toggleTask(rec) : update(rec.id, { [boardField]: c.value })) }))}
          trigger={(tp) => <IconButton icon="more" label="Move card" className="-mr-1.5 -mt-1.5 !size-8" onPointerDown={(e) => e.stopPropagation()} {...tp} />}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-muted empty:hidden"><Badges fields={fields} rec={rec} skip={boardField} /></div>
      {p !== null && <Progress value={p} className="mt-2" />}
    </div>
  );
}

function BoardColumn({ id, label, color, count, children, onAdd }: { id: string; label: string; color?: string; count: number; children: ReactNode; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cx('flex w-[78vw] max-w-80 flex-none snap-start flex-col rounded-2xl border border-line bg-surface/60 p-2 sm:w-72', isOver && 'border-accent bg-accent-soft')}>
      <div className="flex items-center gap-2 px-1.5 pb-2 pt-1">
        <span className="size-2 rounded-full" style={{ background: color ?? 'var(--faint)' }} />
        <span className="flex-1 truncate text-sm font-semibold">{label}</span>
        <span className="text-xs text-faint">{count}</span>
        <IconButton icon="plus" label={`Add to ${label}`} className="!size-8" onClick={onAdd} />
      </div>
      <div className="flex min-h-16 flex-col gap-2">{children}</div>
    </div>
  );
}

function CustomFieldsSheet({ collection, onClose }: { collection: string; onClose: () => void }) {
  const [custom, setCustom] = useSetting<Record<string, FieldDef[]>>('customFields', {});
  const list = custom[collection] ?? [];
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldDef['t']>('text');
  const [options, setOptions] = useState('');
  const add = () => {
    const name = label.trim();
    if (!name) return;
    const k = `x_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field'}`;
    if (list.some((f) => f.k === k) || collectionDef(collection).fields.some((f) => f.k === k)) return toast('A field with that name already exists.', { tone: 'bad' });
    const field: FieldDef = { k, label: name, t: type, list: true, half: type !== 'textarea', ...(type === 'select' ? { opts: options.split(',').map((o) => o.trim()).filter(Boolean).map((o) => ({ value: o, label: o })) } : {}) };
    setCustom({ ...custom, [collection]: [...list, field] });
    setLabel('');
    setOptions('');
  };
  return (
    <Sheet open onClose={onClose} title={`Custom fields · ${collectionDef(collection).label}`} width={480}>
      <p className="mb-3 text-sm text-muted">Your own fields appear in the form, in lists and in exports for every {collectionDef(collection).one.toLowerCase()}.</p>
      {list.map((f) => (
        <div key={f.k} className="row">
          <span className="flex-1 truncate font-medium">{f.label}</span>
          <span className="chip">{f.t}</span>
          <IconButton icon="trash" label={`Remove field ${f.label}`} onClick={async () => (await confirmDialog({ title: `Remove “${f.label}”?`, body: 'Values already entered are kept in your data but no longer shown.', danger: true, confirmLabel: 'Remove' })) && setCustom({ ...custom, [collection]: list.filter((x) => x.k !== f.k) })} />
        </div>
      ))}
      <div className="mt-3 grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_auto]">
        <input className="input" placeholder="Field name" aria-label="Field name" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <select className="input sm:!w-36" aria-label="Field type" value={type} onChange={(e) => setType(e.target.value as FieldDef['t'])}>
          <option value="text">Text</option><option value="textarea">Long text</option><option value="number">Number</option><option value="money">Money</option><option value="date">Date</option>
          <option value="select">Choice</option><option value="bool">Yes / no</option><option value="url">Link</option><option value="rating">Rating</option><option value="tags">Tags</option>
        </select>
        {type === 'select' && <input className="input sm:col-span-2" placeholder="Choices, separated by commas" aria-label="Choices" value={options} onChange={(e) => setOptions(e.target.value)} />}
        <Button variant="primary" icon="plus" className="sm:col-span-2" onClick={add}>Add field</Button>
      </div>
    </Sheet>
  );
}

function TrashSheet({ collection, filter, onClose }: { collection: string; filter?: (r: Rec) => boolean; onClose: () => void }) {
  const deleted = useRecords(collection, { onlyDeleted: true }).filter((r) => !filter || filter(r)).sort((a, b) => b._ua - a._ua);
  return (
    <Sheet open onClose={onClose} title={`Trash · ${collectionDef(collection).label}`} width={480}>
      {deleted.length === 0 ? <Empty icon="trash" title="Trash is empty" hint="Deleted items stay here so you can bring them back." /> : deleted.map((r) => (
        <div key={r.id} className="row">
          <span className="min-w-0 flex-1"><span className="block truncate">{recordTitle(collection, r)}</span><span className="text-xs text-faint">Deleted {timeAgo(r._ua)}</span></span>
          <Button size="sm" icon="undo" onClick={() => void restore(r.id)}>Restore</Button>
        </div>
      ))}
    </Sheet>
  );
}

function coerceCsv(field: FieldDef, raw: string): unknown {
  const v = raw.trim();
  if (!v) return undefined;
  switch (field.t) {
    case 'number': case 'money': case 'rating': return parseAmount(v) ?? undefined;
    case 'bool': return /^(1|true|yes|y|x|done)$/i.test(v);
    case 'tags': return v.split(/[;,]/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
    case 'date': { const d = parseDate(v) ?? (Number.isNaN(Date.parse(v)) ? null : new Date(v)); return d ? ymd(d) : undefined; }
    case 'datetime': { const d = new Date(v); return Number.isNaN(d.getTime()) ? undefined : d.toISOString(); }
    case 'select': { const o = field.opts?.find((x) => String(x.value).toLowerCase() === v.toLowerCase() || x.label.toLowerCase() === v.toLowerCase()); return o ? o.value : v; }
    case 'text': case 'textarea': case 'markdown': case 'url': case 'time': return v;
    default: return undefined;
  }
}

function ImportSheet({ collection, fields, defaults, onClose }: { collection: string; fields: FieldDef[]; defaults?: Fields; onClose: () => void }) {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const importable = fields.filter((f) => !['relation', 'relations', 'checklist', 'sets', 'file', 'recurrence', 'weekdays', 'multi', 'color', 'progress'].includes(f.t));
  const headers = rows?.length ? Object.keys(rows[0]) : [];
  const load = async (file: File) => {
    const parsed = parseCsvObjects(await file.text());
    if (!parsed.length) return toast('No rows found in that file.', { tone: 'bad' });
    const auto: Record<string, string> = {};
    for (const h of Object.keys(parsed[0])) {
      const n = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = importable.find((f) => f.k.toLowerCase() === n || f.label.toLowerCase().replace(/[^a-z0-9]/g, '') === n);
      if (match && !Object.values(auto).includes(match.k)) auto[h] = match.k;
    }
    setMapping(auto);
    setRows(parsed);
  };
  const build = () => (rows ?? []).map((row) => {
    const rec: Fields = { ...defaults };
    for (const [header, key] of Object.entries(mapping)) {
      const field = importable.find((f) => f.k === key);
      const value = field ? coerceCsv(field, row[header] ?? '') : undefined;
      if (value !== undefined) rec[key] = value;
    }
    return rec;
  }).filter((r) => Object.keys(r).length > Object.keys(defaults ?? {}).length);
  const records = rows ? build() : [];
  return (
    <Sheet
      open onClose={onClose} title={`Import ${collectionDef(collection).label.toLowerCase()} from CSV`} width={620}
      footer={rows && <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!records.length} onClick={async () => { await createMany(collection, records); toast(`${records.length} ${collectionDef(collection).label.toLowerCase()} imported`, { tone: 'good' }); onClose(); }}>Import {records.length} rows</Button></>}
    >
      {!rows ? (
        <>
          <p className="mb-3 text-sm text-muted">Choose a CSV file with a header row. You will see how columns map and how many rows will be added before anything is saved. Existing records are never changed.</p>
          <input type="file" accept=".csv,text/csv" className="input" aria-label="CSV file" onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">{rows.length} rows found. Match each column to a field — unmatched columns are skipped.</p>
          <div className="space-y-2">
            {headers.map((h) => (
              <div key={h} className="grid grid-cols-2 items-center gap-2">
                <span className="truncate text-sm"><span className="font-medium">{h}</span> <span className="text-faint">e.g. {rows[0][h]?.slice(0, 24) || '—'}</span></span>
                <select className="input" aria-label={`Field for column ${h}`} value={mapping[h] ?? ''} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>
                  <option value="">Skip</option>
                  {importable.map((f) => <option key={f.k} value={f.k}>{f.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

export function exportCsv(collection: string, fields: FieldDef[], records: Rec[]) {
  const cols = fields.filter((f) => f.t !== 'file').map((f) => f.k);
  const rows = records.map((r) => Object.fromEntries(fields.filter((f) => f.t !== 'file').map((f) => {
    const v = r[f.k];
    if (f.t === 'select') return [f.k, optionOf(f, v)?.label ?? v];
    if (f.t === 'checklist' && Array.isArray(v)) return [f.k, v.map((i: { text: string; done?: boolean }) => `${i.done ? '[x]' : '[ ]'} ${i.text}`)];
    return [f.k, v];
  })));
  downloadFile(`lifeos-${collection}-${ymd()}.csv`, toCsv(rows, cols), 'text/csv');
}

/**
 * Generic, definition-driven view of a collection: search, filters, sorting, five view types,
 * bulk actions, CSV import/export, custom fields and trash.
 */
export function CollectionView({ collection, filter, defaults, views: viewsProp, viewKey, onOpen, emptyHint, addLabel, toolbar, hideToolbar, groupBy, rowExtra }: CollectionViewProps) {
  const def = collectionDef(collection);
  const fields = useFields(collection);
  const all = useRecords(collection);
  const [prefs, setPrefs] = usePrefs();
  const views = viewsProp ?? def.views ?? ['list'];
  const key = viewKey ?? collection;
  const view = (views.includes(prefs.views[key] as ViewKind) ? prefs.views[key] : views[0]) as ViewKind;
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ k: string; dir: 'asc' | 'desc' } | null>(def.sort ?? null);
  const [showArchived, setShowArchived] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<'fields' | 'trash' | 'import' | null>(null);
  const [month, setMonth] = useState(new Date());
  const tf = titleField(def);
  const boardField = fields.find((f) => f.k === def.board);
  const boardOpts = useFieldOptions(boardField ?? { k: '', label: '', t: 'select' }).opts;
  const filterFields = useMemo(() => fields.filter((f) => f.t === 'select' && f.list).slice(0, 3), [fields]);

  const records = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter((r) => {
      if (filter && !filter(r)) return false;
      if (def.archive && !showArchived && r.archived) return false;
      if (q && !(r._s ?? '').includes(q)) return false;
      for (const [k, v] of Object.entries(filters)) if (v && String(r[k] ?? '') !== v) return false;
      return true;
    });
    const s = sort ?? { k: '_ca', dir: 'desc' as const };
    const dir = s.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      if (def.done && !sort) {
        const d = Number(isDoneRec(def, a)) - Number(isDoneRec(def, b));
        if (d) return d;
      }
      const av = a[s.k];
      const bv = b[s.k];
      if (av == null && bv == null) return b._ca - a._ca;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true })) * dir;
    });
  }, [all, filter, def, showArchived, query, filters, sort]);

  const { visible, sentinel } = useWindowed(records, 80);
  const open = (rec: Rec) => (onOpen ? onOpen(rec) : openEditor(collection, rec.id));
  const add = (extra?: Fields) => openEditor(collection, undefined, { ...defaults, ...extra });
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  const fileRef = useRef<HTMLInputElement>(null);

  const bulk = async (patch: Fields | 'delete') => {
    const ids = [...selected];
    if (patch === 'delete') {
      if (!(await confirmDialog({ title: `Delete ${ids.length} item${ids.length === 1 ? '' : 's'}?`, body: 'They move to the trash and can be restored.', danger: true, confirmLabel: 'Delete' }))) return;
      for (const id of ids) await update(id, { deletedAt: new Date().toISOString() }, { silent: true });
      toast(`${ids.length} deleted`, { action: { label: 'Undo', run: () => ids.forEach((id) => void restore(id, { silent: true })) } });
    } else {
      for (const id of ids) await update(id, patch, { silent: true });
      toast(`${ids.length} updated`, { tone: 'good' });
    }
    setSelected(new Set());
    setSelecting(false);
  };

  const sortable = fields.filter((f) => ['text', 'date', 'datetime', 'number', 'money', 'select', 'rating'].includes(f.t)).slice(0, 7);
  const more: MenuItem[] = [
    { label: selecting ? 'Stop selecting' : 'Select multiple', icon: 'checklist', onClick: () => { setSelecting(!selecting); setSelected(new Set()); } },
    ...(def.archive ? [{ label: 'Show archived', icon: 'archive' as const, checked: showArchived, onClick: () => setShowArchived(!showArchived) }] : []),
    { separator: true, label: '' },
    ...sortable.map((f) => ({ label: `Sort by ${f.label.toLowerCase()}`, checked: sort?.k === f.k, hint: sort?.k === f.k ? (sort.dir === 'asc' ? '↑' : '↓') : undefined, onClick: () => setSort(sort?.k === f.k ? (sort.dir === 'asc' ? { k: f.k, dir: 'desc' as const } : null) : { k: f.k, dir: 'asc' as const }) })),
    { separator: true, label: '' },
    { label: 'Import CSV…', icon: 'upload', onClick: () => setSheet('import') },
    { label: 'Export CSV', icon: 'download', disabled: !records.length, onClick: () => exportCsv(collection, fields, records) },
    { label: 'Custom fields…', icon: 'sliders', onClick: () => setSheet('fields') },
    { label: 'Trash', icon: 'trash', onClick: () => setSheet('trash') },
  ];

  const empty = (
    <Empty
      icon={def.icon as IconName} title={query || Object.values(filters).some(Boolean) ? 'Nothing matches' : `No ${def.label.toLowerCase()} yet`}
      hint={query ? 'Try a different search.' : (emptyHint ?? def.hint ?? `Add your first ${def.one.toLowerCase()} to get started.`)}
      action={!query && <Button variant="primary" icon="plus" onClick={() => add()}>{addLabel ?? `New ${def.one.toLowerCase()}`}</Button>}
    />
  );

  let body: ReactNode;
  if (view === 'calendar' && def.date) {
    const items: CalItem[] = records.filter((r) => parseDate(r[def.date!])).map((r) => ({ id: r.id, date: parseDate(r[def.date!])!, title: recordTitle(collection, r), color: r.color ?? optionOf(boardField ?? { k: '', label: '', t: 'select' }, r[def.board ?? ''])?.color, done: isDoneRec(def, r), onClick: () => open(r) }));
    body = (
      <div>
        <div className="mb-2"><MonthNav month={month} onChange={setMonth} /></div>
        <MonthGrid month={month} items={items} weekStart={prefs.weekStart} onDayClick={(day) => add({ [def.date!]: fields.find((f) => f.k === def.date)?.t === 'datetime' ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9).toISOString() : ymd(day) })} />
      </div>
    );
  } else if (!records.length) {
    body = empty;
  } else if (view === 'board' && boardField) {
    const columns = boardOpts.map((o) => ({ ...o, items: records.filter((r) => String(r[boardField.k] ?? '') === String(o.value)) }));
    const other = records.filter((r) => !boardOpts.some((o) => String(o.value) === String(r[boardField.k] ?? '')));
    const onDragEnd = (e: DragEndEvent) => {
      const rec = records.find((r) => r.id === e.active.id);
      const target = e.over?.id;
      if (!rec || target == null || String(rec[boardField.k]) === String(target)) return;
      const opt = boardOpts.find((o) => String(o.value) === String(target));
      if (!opt) return;
      if (def.id === 'tasks' && (opt.value === 'done') !== (rec.status === 'done')) void toggleTask(rec);
      else void update(rec.id, { [boardField.k]: opt.value });
    };
    body = (
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="scroll-x -mx-4 flex snap-x snap-mandatory items-start gap-3 px-4 pb-3 sm:snap-none">
          {columns.map((col) => (
            <BoardColumn key={String(col.value)} id={String(col.value)} label={col.label} color={col.color} count={col.items.length} onAdd={() => add({ [boardField.k]: col.value })}>
              {col.items.slice(0, 100).map((r) => <BoardCard key={r.id} def={def} fields={fields} rec={r} onOpen={() => open(r)} columns={boardOpts} boardField={boardField.k} />)}
            </BoardColumn>
          ))}
          {other.length > 0 && (
            <BoardColumn id="__none" label="Unsorted" count={other.length} onAdd={() => add()}>
              {other.map((r) => <BoardCard key={r.id} def={def} fields={fields} rec={r} onOpen={() => open(r)} columns={boardOpts} boardField={boardField.k} />)}
            </BoardColumn>
          )}
        </div>
      </DndContext>
    );
  } else if (view === 'table') {
    const cols = [fields.find((f) => f.k === tf), ...fields.filter((f) => f.list && f.k !== tf)].filter((f): f is FieldDef => !!f);
    body = (
      <div className="scroll-x rounded-xl border border-line">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface text-left text-xs text-muted">
              {selecting && <th className="w-10" />}
              {cols.map((c) => (
                <th key={c.k} className="px-3 py-2 font-medium">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-text" onClick={() => setSort(sort?.k === c.k && sort.dir === 'asc' ? { k: c.k, dir: 'desc' } : { k: c.k, dir: 'asc' })}>
                    {c.label}{sort?.k === c.k && <Icon name={sort.dir === 'asc' ? 'arrowUp' : 'arrowDown'} size={12} />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} tabIndex={0} onClick={() => (selecting ? toggleSelect(r.id) : open(r))} onKeyDown={(e) => e.key === 'Enter' && open(r)} className={cx('cursor-pointer border-b border-line last:border-0 hover:bg-surface-2', selected.has(r.id) && 'bg-accent-soft')}>
                {selecting && <td className="pl-3"><Checkbox checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} label="Select row" /></td>}
                {cols.map((c, i) => (
                  <td key={c.k} className={cx('max-w-72 truncate px-3 py-2.5', i === 0 && 'font-medium', isDoneRec(def, r) && i === 0 && 'text-faint line-through')}>
                    {i === 0 ? recordTitle(collection, r) : <FieldValue def={c} value={r[c.k]} rec={r} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sentinel}
      </div>
    );
  } else if (view === 'gallery') {
    body = (
      <>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
          {visible.map((r) => {
            const p = progressOf(r);
            return (
              <button key={r.id} type="button" onClick={() => (selecting ? toggleSelect(r.id) : open(r))} className={cx('card card-hover relative overflow-hidden text-left', selected.has(r.id) && 'ring-2 ring-accent')}>
                {r.color && <span className="absolute inset-x-0 top-0 h-1" style={{ background: r.color }} />}
                <div className="flex items-start gap-2">
                  {r.emoji && <span className="text-2xl leading-none">{r.emoji}</span>}
                  <span className={cx('min-w-0 flex-1 font-semibold', isDoneRec(def, r) && 'text-faint line-through')}><span className="line-clamp-2">{recordTitle(collection, r)}</span></span>
                  {r.favorite && <Icon name="star" size={15} className="flex-none fill-warn text-warn" />}
                </div>
                {(r.description || r.destination || r.creator) && <p className="mt-1 line-clamp-2 text-sm text-muted">{r.description || r.destination || r.creator}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted empty:hidden"><Badges fields={fields} rec={r} skip={tf} /></div>
                {p !== null && <div className="mt-3 flex items-center gap-2"><Progress value={p} color={r.color} /><span className="num text-xs text-muted">{Math.round(Math.min(1, p) * 100)}%</span></div>}
              </button>
            );
          })}
        </div>
        {sentinel}
      </>
    );
  } else if (groupBy) {
    body = (
      <div className="space-y-4">
        {groupBy(records).map((g) => (
          <section key={g.key}>
            {g.label && <h3 className="eyebrow mb-1 flex items-center gap-2">{g.label}<span className="font-normal normal-case tracking-normal">{g.items.length}</span></h3>}
            <div className="-mx-2">
              {g.items.slice(0, 200).map((r) => <Row key={r.id} def={def} fields={fields} rec={r} onOpen={() => open(r)} selecting={selecting} selected={selected.has(r.id)} onSelect={() => toggleSelect(r.id)} extra={rowExtra?.(r)} />)}
            </div>
          </section>
        ))}
      </div>
    );
  } else {
    body = (
      <div className="-mx-2">
        {visible.map((r) => <Row key={r.id} def={def} fields={fields} rec={r} onOpen={() => open(r)} selecting={selecting} selected={selected.has(r.id)} onSelect={() => toggleSelect(r.id)} extra={rowExtra?.(r)} />)}
        {sentinel}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {!hideToolbar && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1 basis-48">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input !pl-9" type="search" placeholder={`Search ${def.label.toLowerCase()}…`} aria-label={`Search ${def.label}`} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 max-sm:order-last max-sm:-mx-4 max-sm:basis-[calc(100%+2rem)] max-sm:overflow-x-auto max-sm:px-4 max-sm:no-scrollbar max-sm:empty:hidden sm:contents">
            {filterFields.map((f) => <FilterSelect key={f.k} field={f} value={filters[f.k] ?? ''} onChange={(v) => setFilters({ ...filters, [f.k]: v })} />)}
            {toolbar}
            {views.length > 1 && <Segmented size="sm" label="View" value={view} onChange={(v) => setPrefs({ views: { ...prefs.views, [key]: v } })} options={views.map((v) => ({ value: v, label: VIEW_LABEL[v], icon: VIEW_ICON[v] }))} />}
          </div>
          <Menu label="More options" items={more} trigger={(p) => <IconButton icon="more" label="More options" {...p} />} />
          <Button variant="primary" icon="plus" onClick={() => add()} className="max-sm:hidden">{addLabel ?? `New ${def.one.toLowerCase()}`}</Button>
          <IconButton icon="plus" label={addLabel ?? `New ${def.one.toLowerCase()}`} className="!bg-accent !text-accent-ink sm:hidden" onClick={() => add()} />
        </div>
      )}
      {body}
      {selecting && (
        <div className="glass sticky bottom-[calc(88px+env(safe-area-inset-bottom))] z-20 mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 !rounded-[20px] p-2 md:bottom-4">
          <span className="px-2 text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(selected.size === records.length ? [] : records.map((r) => r.id)))}>{selected.size === records.length ? 'None' : 'All'}</Button>
          {boardField && <Menu label="Set status" items={boardOpts.map((o) => ({ label: o.label, onClick: () => void bulk({ [boardField.k]: o.value, ...(collection === 'tasks' ? { completedAt: o.value === 'done' ? new Date().toISOString() : null } : {}) }) }))} trigger={(p) => <Button size="sm" disabled={!selected.size} {...p}>{boardField.label}</Button>} />}
          {def.date && fields.find((f) => f.k === def.date)?.t === 'date' && (
            <>
              <input ref={fileRef} type="date" className="sr-only" aria-label="New date" tabIndex={-1} onChange={(e) => e.target.value && void bulk({ [def.date!]: e.target.value })} />
              <Button size="sm" icon="calendar" disabled={!selected.size} onClick={() => (fileRef.current?.showPicker ? fileRef.current.showPicker() : fileRef.current?.click())}>Date</Button>
            </>
          )}
          {fields.some((f) => f.k === 'tags') && (
            <Button
              size="sm" icon="tag" disabled={!selected.size}
              onClick={async () => {
                const tag = (await promptDialog({ title: 'Add a tag', placeholder: 'Tag name', confirmLabel: 'Add' }))?.trim().replace(/^#/, '');
                if (!tag) return;
                for (const id of selected) {
                  const r = records.find((x) => x.id === id);
                  const tags = Array.isArray(r?.tags) ? (r!.tags as string[]) : [];
                  if (!tags.includes(tag)) await update(id, { tags: [...tags, tag] }, { silent: true });
                }
                toast(`Tagged ${selected.size}`, { tone: 'good' });
                setSelected(new Set());
                setSelecting(false);
              }}
            >
              Tag
            </Button>
          )}
          {def.archive && <Button size="sm" icon="archive" disabled={!selected.size} onClick={() => void bulk({ archived: true })}>Archive</Button>}
          <Button size="sm" variant="danger" icon="trash" disabled={!selected.size} onClick={() => void bulk('delete')}>Delete</Button>
          <IconButton icon="x" label="Done selecting" onClick={() => { setSelecting(false); setSelected(new Set()); }} />
        </div>
      )}
      {sheet === 'fields' && <CustomFieldsSheet collection={collection} onClose={() => setSheet(null)} />}
      {sheet === 'trash' && <TrashSheet collection={collection} filter={filter} onClose={() => setSheet(null)} />}
      {sheet === 'import' && <ImportSheet collection={collection} fields={fields} defaults={defaults} onClose={() => setSheet(null)} />}
    </div>
  );
}

function FilterSelect({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  const { opts } = useFieldOptions(field);
  return (
    <select className={cx('input !min-h-9 !w-auto max-w-40 flex-none !py-1 text-sm', value && '!border-accent text-accent')} aria-label={`Filter by ${field.label}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{field.label}: all</option>
      {opts.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
    </select>
  );
}

export { deleteWithUndo, fmtDate };
