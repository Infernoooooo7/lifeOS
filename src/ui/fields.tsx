'use client';

import { useMemo, useState } from 'react';
import { collection as collectionDef, titleField, type FieldDef, type Opt } from '@/core/collections';
import { getDb, type Rec } from '@/core/data/db';
import { useById, useOptions, useRecords } from '@/core/data/hooks';
import { titleOf, uid } from '@/core/data/store';
import { fmtDate, fmtDateTime, fromLocalInput, isDateOnly, parseDate, relativeDay, toLocalInput, ymd } from '@/core/lib/dates';
import { fmtMoney } from '@/core/lib/money';
import { describeRecurrence, type Recurrence } from '@/core/lib/recurrence';
import { Icon } from './icons';
import { IconButton, Switch, cx } from './kit';
import { promptDialog, toast } from './overlays';

export const SWATCHES = ['#38bdf8', '#22d3ee', '#34d399', '#a3e635', '#fbbf24', '#fb923c', '#fb7185', '#f472b6', '#a78bfa', '#818cf8', '#94a3b8'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface ChecklistItem {
  id: string;
  text: string;
  done?: boolean;
}
export interface SetRow {
  exercise: string;
  sets?: number;
  reps?: number;
  weight?: number;
}

type Change = (value: unknown) => void;

/** Options for a select field: fixed options, or a user-extendable set. */
export function useFieldOptions(def: FieldDef, rec?: Record<string, unknown>): { opts: Opt[]; add?: (v: string) => void } {
  const key = def.optsKeyWhen && rec ? (def.optsKeyWhen.map[String(rec[def.optsKeyWhen.k])] ?? def.optsKey) : def.optsKey;
  const [dynamic, add] = useOptions(key);
  return useMemo(() => (def.opts ? { opts: [...def.opts] } : { opts: dynamic.map((v) => ({ value: v, label: v })), add }), [def.opts, dynamic, add]);
}

function SelectInput({ def, value, onChange, rec }: { def: FieldDef; value: unknown; onChange: Change; rec?: Record<string, unknown> }) {
  const { opts, add } = useFieldOptions(def, rec);
  const numeric = opts.some((o) => typeof o.value === 'number');
  return (
    <select
      className="input" aria-label={def.label} value={value == null ? '' : String(value)}
      onChange={async (e) => {
        const v = e.target.value;
        if (v === '__add') {
          const name = await promptDialog({ title: `New ${def.label.toLowerCase()}`, placeholder: 'Name' });
          if (name?.trim()) {
            add?.(name.trim());
            onChange(name.trim());
          }
          return;
        }
        onChange(v === '' ? null : numeric ? Number(v) : v);
      }}
    >
      {!def.req && <option value="">—</option>}
      {opts.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      {value != null && value !== '' && !opts.some((o) => String(o.value) === String(value)) && <option value={String(value)}>{String(value)}</option>}
      {add && <option value="__add">+ Add new…</option>}
    </select>
  );
}

function RelationInput({ def, value, onChange, exclude }: { def: FieldDef; value: unknown; onChange: Change; exclude?: string }) {
  const rows = useRecords(def.rel!);
  const options = useMemo(() => rows.filter((r) => r.id !== exclude && !r.archived).map((r) => ({ id: r.id, label: titleOf(r) })).sort((a, b) => a.label.localeCompare(b.label)), [rows, exclude]);
  return (
    <select className="input" aria-label={def.label} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">None</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

function RelationsInput({ def, value, onChange, exclude }: { def: FieldDef; value: unknown; onChange: Change; exclude?: string }) {
  const rows = useRecords(def.rel!);
  const ids = Array.isArray(value) ? (value as string[]) : [];
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const available = rows.filter((r) => r.id !== exclude && !ids.includes(r.id) && !r.archived && r.status !== 'done');
  return (
    <div>
      {ids.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <span key={id} className="chip h-7">
              <span className="max-w-48 truncate">{byId.get(id) ? titleOf(byId.get(id)!) : 'Missing item'}</span>
              <button type="button" aria-label="Remove" onClick={() => onChange(ids.filter((x) => x !== id))}><Icon name="x" size={13} /></button>
            </span>
          ))}
        </div>
      )}
      <select className="input" aria-label={`Add to ${def.label}`} value="" onChange={(e) => e.target.value && onChange([...ids, e.target.value])}>
        <option value="">Add…</option>
        {available.map((r) => <option key={r.id} value={r.id}>{titleOf(r)}</option>)}
      </select>
    </div>
  );
}

function TagsInput({ value, onChange, placeholder }: { value: unknown; onChange: Change; placeholder?: string }) {
  const tags = Array.isArray(value) ? (value as string[]) : [];
  const [draft, setDraft] = useState('');
  const commit = () => {
    const next = draft.split(',').map((t) => t.trim().replace(/^#/, '')).filter((t) => t && !tags.includes(t));
    if (next.length) onChange([...tags, ...next]);
    setDraft('');
  };
  return (
    <div className="input flex h-auto flex-wrap items-center gap-1.5 py-1.5">
      {tags.map((t) => (
        <span key={t} className="chip chip-accent">
          #{t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}><Icon name="x" size={12} /></button>
        </span>
      ))}
      <input
        className="min-w-24 flex-1 bg-transparent outline-none" value={draft} placeholder={tags.length ? '' : (placeholder ?? 'Add tags…')} aria-label="Add tag"
        onChange={(e) => (e.target.value.endsWith(',') ? (setDraft(e.target.value), setTimeout(commit)) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={commit}
      />
    </div>
  );
}

export function ChecklistInput({ value, onChange, placeholder }: { value: unknown; onChange: Change; placeholder?: string }) {
  const items = Array.isArray(value) ? (value as ChecklistItem[]) : [];
  const [draft, setDraft] = useState('');
  const add = () => {
    const lines = draft.split('\n').map((s) => s.trim()).filter(Boolean);
    if (lines.length) onChange([...items, ...lines.map((text) => ({ id: uid().slice(0, 8), text, done: false }))]);
    setDraft('');
  };
  const done = items.filter((i) => i.done).length;
  return (
    <div className="rounded-xl border border-line-strong">
      {items.length > 0 && (
        <ul className="divide-y divide-line">
          {items.map((item, i) => (
            <li key={item.id ?? i} className="flex items-center gap-2 px-2.5 py-1">
              <button type="button" role="checkbox" aria-checked={!!item.done} aria-label={item.text} onClick={() => onChange(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} className={cx('grid size-5 flex-none place-items-center rounded-md border-2', item.done ? 'border-transparent bg-accent text-accent-ink' : 'border-line-strong')}>
                {item.done && <Icon name="check" size={13} strokeWidth={3} />}
              </button>
              <input className={cx('min-w-0 flex-1 bg-transparent py-1.5 outline-none', item.done && 'text-faint line-through')} value={item.text} aria-label="Item" onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              <IconButton icon="x" label="Remove item" size={15} className="!size-8" onClick={() => onChange(items.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2 px-2.5 py-1">
        <Icon name="plus" size={16} className="text-faint" />
        <input className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-faint" value={draft} placeholder={placeholder ?? 'Add item…'} aria-label="New item" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} onBlur={add} onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t.includes('\n')) { e.preventDefault(); setDraft(t); setTimeout(add); } }} />
        {items.length > 0 && <span className="text-xs text-faint">{done}/{items.length}</span>}
      </div>
    </div>
  );
}

function WeekdaysInput({ value, onChange }: { value: unknown; onChange: Change }) {
  const days = Array.isArray(value) ? (value as number[]) : [];
  return (
    <div className="flex gap-1.5">
      {DAYS.map((d, i) => (
        <button key={i} type="button" aria-pressed={days.includes(i)} aria-label={DAY_NAMES[i]} onClick={() => onChange(days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())} className={cx('size-9 flex-none rounded-full border text-sm font-medium pointer-coarse:size-10', days.includes(i) ? 'border-transparent bg-accent text-accent-ink' : 'border-line-strong text-muted')}>
          {d}
        </button>
      ))}
    </div>
  );
}

export function RecurrenceInput({ value, onChange }: { value: unknown; onChange: Change }) {
  const rule = (value as Recurrence | null) ?? null;
  const set = (patch: Partial<Recurrence>) => onChange({ ...(rule ?? { freq: 'weekly' }), ...patch });
  const ends = rule?.count ? 'count' : rule?.until ? 'until' : 'never';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input !w-auto" aria-label="Repeat" value={rule?.freq ?? ''} onChange={(e) => (e.target.value ? onChange({ ...(rule ?? {}), freq: e.target.value }) : onChange(null))}>
          <option value="">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
        {rule && (
          <label className="flex items-center gap-2 text-sm text-muted">
            every
            <input type="number" min={1} max={99} className="input !w-18" aria-label="Interval" value={rule.interval ?? 1} onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })} />
            {{ daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)' }[rule.freq]}
          </label>
        )}
      </div>
      {rule?.freq === 'weekly' && <WeekdaysInput value={rule.byDay ?? []} onChange={(v) => set({ byDay: v as number[] })} />}
      {rule && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <select className="input !w-auto" aria-label="Ends" value={ends} onChange={(e) => set(e.target.value === 'never' ? { until: null, count: null } : e.target.value === 'count' ? { count: 10, until: null } : { until: ymd(new Date(Date.now() + 90 * 86_400_000)), count: null })}>
            <option value="never">Never ends</option>
            <option value="until">Until a date</option>
            <option value="count">After a number of times</option>
          </select>
          {ends === 'until' && <input type="date" className="input !w-auto" aria-label="End date" value={(rule.until ?? '').slice(0, 10)} onChange={(e) => set({ until: e.target.value || null })} />}
          {ends === 'count' && <input type="number" min={1} className="input !w-20" aria-label="Occurrences" value={rule.count ?? 1} onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })} />}
        </div>
      )}
      {rule && <p className="text-xs text-faint">{describeRecurrence(rule)}</p>}
    </div>
  );
}

function SetsInput({ value, onChange }: { value: unknown; onChange: Change }) {
  const rows = Array.isArray(value) ? (value as SetRow[]) : [];
  const exercises = useRecords('exercises');
  const patch = (i: number, p: Partial<SetRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const n = (v: string) => (v === '' ? undefined : Number(v));
  return (
    <div className="space-y-2">
      <datalist id="exercise-names">{exercises.map((e) => <option key={e.id} value={e.title} />)}</datalist>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border border-line p-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5.5rem_auto] sm:border-0 sm:p-0">
          <input className="input" list="exercise-names" placeholder="Exercise" aria-label="Exercise" value={row.exercise ?? ''} onChange={(e) => patch(i, { exercise: e.target.value })} />
          <IconButton icon="x" label="Remove exercise" className="sm:order-last" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
          <div className="col-span-2 grid grid-cols-3 gap-2 sm:contents">
            <input className="input" type="number" min={0} inputMode="numeric" placeholder="Sets" aria-label="Sets" value={row.sets ?? ''} onChange={(e) => patch(i, { sets: n(e.target.value) })} />
            <input className="input" type="number" min={0} inputMode="numeric" placeholder="Reps" aria-label="Reps" value={row.reps ?? ''} onChange={(e) => patch(i, { reps: n(e.target.value) })} />
            <input className="input" type="number" min={0} step="0.5" inputMode="decimal" placeholder="kg" aria-label="Weight in kg" value={row.weight ?? ''} onChange={(e) => patch(i, { weight: n(e.target.value) })} />
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => onChange([...rows, { exercise: '', sets: 3, reps: 10 }])}><Icon name="plus" size={15} />Add exercise</button>
    </div>
  );
}

const MAX_ATTACHMENT = 15 * 1024 * 1024;
export interface Attachment {
  blobId: string;
  name: string;
  size: number;
  type: string;
}
export async function openAttachment(att: Attachment) {
  const row = await getDb().blobs.get(att.blobId);
  if (!row) return toast('This attachment was added on another device and is not stored here.', { tone: 'bad' });
  const url = URL.createObjectURL(row.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = att.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function FileInput({ value, onChange }: { value: unknown; onChange: Change }) {
  const att = value as Attachment | null;
  if (att?.blobId) {
    return (
      <div className="input flex items-center gap-2">
        <Icon name="file" size={16} className="text-muted" />
        <button type="button" className="min-w-0 flex-1 truncate text-left underline-offset-2 hover:underline" onClick={() => openAttachment(att)}>{att.name}</button>
        <span className="text-xs text-faint">{(att.size / 1024).toFixed(0)} KB</span>
        <IconButton icon="x" label="Remove attachment" className="!size-8" onClick={() => { void getDb().blobs.delete(att.blobId); onChange(null); }} />
      </div>
    );
  }
  return (
    <input
      type="file" className="input file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-2.5 file:py-1 file:text-sm file:text-text" aria-label="Attach a file"
      onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.size > MAX_ATTACHMENT) return toast('Attachments are limited to 15 MB.', { tone: 'bad' });
        const blobId = uid();
        await getDb().blobs.put({ id: blobId, blob: f, name: f.name, type: f.type, size: f.size });
        onChange({ blobId, name: f.name, size: f.size, type: f.type });
      }}
    />
  );
}

/** Editor control for one field. */
export function FieldInput({ def, value, onChange, rec, autoFocus }: { def: FieldDef; value: unknown; onChange: Change; rec?: Rec | Record<string, unknown>; autoFocus?: boolean }) {
  const common = { 'aria-label': def.label, placeholder: def.ph, autoFocus };
  switch (def.t) {
    case 'text':
      return <input className="input" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} {...common} />;
    case 'url':
      return <input className="input" type="url" inputMode="url" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} {...common} placeholder={def.ph ?? 'https://'} />;
    case 'textarea':
      return <textarea className="input min-h-24 resize-y" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} {...common} />;
    case 'markdown':
      return <textarea className="input min-h-40 resize-y font-mono text-[0.88rem]" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} {...common} placeholder={def.ph ?? 'Markdown supported'} />;
    case 'number':
    case 'money':
      return (
        <div className="relative">
          <input className={cx('input', def.unit && 'pr-16')} type="number" inputMode="decimal" step="any" min={def.min} max={def.max} value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} {...common} />
          {def.unit && <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs text-faint">{def.unit}</span>}
        </div>
      );
    case 'date': {
      if (!def.timeOptional) return <input className="input" type="date" value={typeof value === 'string' ? value.slice(0, 10) : ''} onChange={(e) => onChange(e.target.value || null)} {...common} />;
      const d = parseDate(value);
      const hasTime = !!d && !isDateOnly(value);
      const datePart = d ? ymd(d) : '';
      const timePart = hasTime ? toLocalInput(value).slice(11) : '';
      return (
        <div className="flex gap-2">
          <input className="input min-w-0 flex-1" type="date" value={datePart} onChange={(e) => onChange(!e.target.value ? null : timePart ? fromLocalInput(`${e.target.value}T${timePart}`) : e.target.value)} {...common} />
          <input className="input !w-28 flex-none" type="time" aria-label={`${def.label} time (optional)`} value={timePart} disabled={!datePart} onChange={(e) => onChange(e.target.value ? fromLocalInput(`${datePart}T${e.target.value}`) : datePart)} />
        </div>
      );
    }
    case 'datetime':
      if (rec?.allDay) return <input className="input" type="date" value={parseDate(value) ? ymd(parseDate(value)!) : ''} onChange={(e) => onChange(e.target.value ? parseDate(e.target.value)!.toISOString() : null)} {...common} />;
      return <input className="input" type="datetime-local" value={toLocalInput(value)} onChange={(e) => onChange(fromLocalInput(e.target.value))} {...common} />;
    case 'time':
      return <input className="input" type="time" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)} {...common} />;
    case 'select':
      return <SelectInput def={def} value={value} onChange={onChange} rec={rec} />;
    case 'multi': {
      const selected = Array.isArray(value) ? (value as (string | number)[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {(def.opts ?? []).map((o) => (
            <button key={String(o.value)} type="button" aria-pressed={selected.includes(o.value)} onClick={() => onChange(selected.includes(o.value) ? selected.filter((x) => x !== o.value) : [...selected, o.value])} className={cx('chip h-8 px-3 pointer-coarse:h-10', selected.includes(o.value) && 'chip-accent')}>
              {o.label}
            </button>
          ))}
        </div>
      );
    }
    case 'tags':
      return <TagsInput value={value} onChange={onChange} placeholder={def.ph} />;
    case 'bool':
      return <Switch checked={!!value} onChange={onChange} label={def.label} />;
    case 'rating':
      return (
        <div className="flex gap-0.5" role="radiogroup" aria-label={def.label}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of 5`} onClick={() => onChange(value === n ? null : n)} className="grid size-9 place-items-center pointer-coarse:size-11">
              <Icon name="star" size={22} className={Number(value) >= n ? 'fill-warn text-warn' : 'text-faint'} />
            </button>
          ))}
        </div>
      );
    case 'relation':
      return <RelationInput def={def} value={value} onChange={onChange} exclude={rec?.id as string} />;
    case 'relations':
      return <RelationsInput def={def} value={value} onChange={onChange} exclude={rec?.id as string} />;
    case 'color':
      return (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={def.label}>
          {SWATCHES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={`Colour ${c}`} onClick={() => onChange(value === c ? null : c)} className={cx('size-8 rounded-full border-2 transition-transform pointer-coarse:size-9', value === c ? 'scale-110 border-text' : 'border-transparent')} style={{ background: c }} />
          ))}
        </div>
      );
    case 'checklist':
      return <ChecklistInput value={value} onChange={onChange} placeholder={def.ph} />;
    case 'progress': {
      const pct = Math.round((Number(value) || 0) * 100);
      return (
        <div className="flex items-center gap-3">
          <input type="range" min={0} max={100} step={5} value={pct} aria-label={def.label} onChange={(e) => onChange(Number(e.target.value) / 100)} className="h-9 min-w-0 flex-1 accent-[var(--accent)]" />
          <span className="num w-11 text-right text-sm">{pct}%</span>
        </div>
      );
    }
    case 'recurrence':
      return <RecurrenceInput value={value} onChange={onChange} />;
    case 'weekdays':
      return <WeekdaysInput value={value} onChange={onChange} />;
    case 'sets':
      return <SetsInput value={value} onChange={onChange} />;
    case 'file':
      return <FileInput value={value} onChange={onChange} />;
  }
}

export function RelName({ collection, id }: { collection: string; id: unknown }) {
  const map = useById(collection);
  const rec = typeof id === 'string' ? map.get(id) : undefined;
  return rec ? <>{titleOf(rec)}</> : null;
}

export function optionOf(def: FieldDef, value: unknown): Opt | undefined {
  return def.opts?.find((o) => String(o.value) === String(value));
}

/** Compact read-only rendering of a field value for lists and tables. Returns null when empty. */
export function FieldValue({ def, value, rec, plain }: { def: FieldDef; value: unknown; rec?: Rec; plain?: boolean }) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return null;
  switch (def.t) {
    case 'select': {
      const o = optionOf(def, value);
      const label = o?.label ?? String(value);
      if (plain) return <>{label}</>;
      return <span className="chip" style={o?.color ? { color: o.color, borderColor: `color-mix(in oklab, ${o.color} 35%, transparent)`, background: `color-mix(in oklab, ${o.color} 12%, transparent)` } : undefined}>{label}</span>;
    }
    case 'date':
      return <span className={plain ? '' : 'chip'}>{!plain && <Icon name="calendar" size={12} />}{isDateOnly(value) ? relativeDay(value) : fmtDateTime(value)}</span>;
    case 'datetime':
      return <span className={plain ? '' : 'chip'}>{!plain && <Icon name="clock" size={12} />}{rec?.allDay ? fmtDate(value) : fmtDateTime(value)}</span>;
    case 'money':
      return <span className="num font-medium">{fmtMoney(Number(value), (rec?.currency as string) || undefined)}</span>;
    case 'number':
      return <span className="num">{Number(value).toLocaleString()}{def.unit ? ` ${def.unit}` : ''}</span>;
    case 'rating':
      return <span className="inline-flex items-center gap-0.5 text-warn" aria-label={`${value} of 5`}>{Array.from({ length: Number(value) }, (_, i) => <Icon key={i} name="star" size={12} className="fill-warn" />)}</span>;
    case 'bool':
      return value ? <span className="chip chip-accent"><Icon name="check" size={12} />{def.label}</span> : null;
    case 'tags':
      return <>{(value as string[]).slice(0, 4).map((t) => <span key={t} className="chip">#{t}</span>)}</>;
    case 'relation':
      return <span className={plain ? '' : 'chip'}>{!plain && <Icon name={collectionDef(def.rel!).icon} size={12} />}<span className="max-w-40 truncate"><RelName collection={def.rel!} id={value} /></span></span>;
    case 'progress':
      return <span className="num">{Math.round(Number(value) * 100)}%</span>;
    case 'checklist': {
      const items = value as ChecklistItem[];
      return <span className="chip"><Icon name="checklist" size={12} />{items.filter((i) => i.done).length}/{items.length}</span>;
    }
    case 'recurrence':
      return <span className="chip"><Icon name="repeat" size={12} />{describeRecurrence(value as Recurrence)}</span>;
    case 'url':
      return <a className="truncate text-accent underline-offset-2 hover:underline" href={String(value)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{String(value).replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>;
    case 'time':
    case 'text':
      return <span className="truncate">{String(value)}</span>;
    default:
      return null;
  }
}

export const recordTitle = (collectionId: string, rec: Rec): string => {
  const def = collectionDef(collectionId);
  const key = titleField(def);
  const v = rec[key];
  const field = def.fields.find((f) => f.k === key);
  if (field?.t === 'select') return optionOf(field, v)?.label ?? String(v ?? 'Untitled');
  if (field?.t === 'date') return fmtDate(v) || 'Untitled';
  const own = String(v ?? '').trim();
  if (own) return own;
  const fallback = titleOf(rec);
  if (fallback !== 'Untitled') return fallback;
  // Untitled records are identified by their first words or their date.
  const body = String(rec.content ?? rec.notes ?? rec.description ?? '').replace(/[#*_>`\[\]]/g, '').trim();
  if (body) return body.length > 70 ? `${body.slice(0, 70)}…` : body;
  return def.date && rec[def.date] ? fmtDate(rec[def.date], { year: true }) : 'Untitled';
};
