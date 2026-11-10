'use client';

import { useEffect, useMemo, useState } from 'react';
import { closeEditor, openEditor, useApp } from '@/core/app';
import { collection as collectionDef, titleField, type FieldDef } from '@/core/collections';
import type { Rec } from '@/core/data/db';
import { useFields, usePrefs, useRecord, useRecords } from '@/core/data/hooks';
import { create, getRec, remove, restore, titleOf, update, upsert } from '@/core/data/store';
import { timeAgo, ymd } from '@/core/lib/dates';
import { isDone, nextRecurringInstance, wouldCycle, type TaskLike } from '@/core/lib/tasks';
import type { Fields } from '@/core/sync/merge';
import { FieldInput } from './fields';
import { Icon } from './icons';
import { Button, Checkbox, IconButton, Menu, Sheet, cx, type MenuItem } from './kit';
import { toast } from './overlays';

/** Resolve '@today' style defaults when a new record form opens. */
export function resolveDefaults(fields: FieldDef[], currency: string, given: Fields = {}): Fields {
  const out: Fields = {};
  for (const f of fields) {
    if (f.def === undefined) continue;
    if (f.def === '@today') out[f.k] = ymd();
    else if (f.def === '@now') out[f.k] = new Date().toISOString();
    else if (f.def === '@nextHour') {
      const d = new Date();
      d.setHours(d.getHours() + 1, 0, 0, 0);
      out[f.k] = d.toISOString();
    } else if (f.def === '@currency') out[f.k] = currency;
    else out[f.k] = f.def;
  }
  return { ...out, ...given };
}

/** Complete or reopen a task; completing a recurring task schedules its next instance. */
export async function toggleTask(task: Rec): Promise<void> {
  const done = !isDone(task as TaskLike);
  await update(task.id, { status: done ? 'done' : 'todo', completedAt: done ? new Date().toISOString() : null });
  if (done) {
    const next = nextRecurringInstance(task as TaskLike);
    if (next) {
      await create('tasks', { ...next, notes: task.notes, ws: task.ws }, { silent: true });
      toast(`Next “${titleOf(task)}” scheduled for ${next.dueAt?.slice(0, 10)}`, { icon: 'repeat' });
    }
  }
}

/** Soft-delete with an Undo toast. */
export async function deleteWithUndo(rec: Rec, label?: string): Promise<void> {
  await remove(rec.id);
  toast(`${label ?? collectionDef(rec._c).one} deleted`, { action: { label: 'Undo', run: () => void restore(rec.id) } });
}

function visible(field: FieldDef, draft: Fields): boolean {
  return !field.when || field.when.in.includes(draft[field.when.k]);
}

function TaskExtras({ task }: { task: Rec }) {
  const all = useRecords('tasks');
  const activity = useRecords('activity');
  const subs = useMemo(() => all.filter((t) => t.parentId === task.id).sort((a, b) => a._ca - b._ca), [all, task.id]);
  const history = useMemo(() => activity.filter((a) => a.recordId === task.id).sort((a, b) => b._ca - a._ca).slice(0, 12), [activity, task.id]);
  const [draft, setDraft] = useState('');
  const add = async () => {
    if (!draft.trim()) return;
    await create('tasks', { title: draft.trim(), status: 'todo', priority: 0, parentId: task.id, projectId: task.projectId ?? null }, { silent: true });
    setDraft('');
  };
  return (
    <div className="mt-5 space-y-5">
      <section>
        <h3 className="label">Subtasks {subs.length > 0 && `· ${subs.filter((s) => s.status === 'done').length}/${subs.length}`}</h3>
        <div className="rounded-xl border border-line-strong">
          {subs.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-b border-line px-3 py-1">
              <Checkbox checked={s.status === 'done'} onChange={() => toggleTask(s)} label={`Complete ${s.title}`} />
              <button type="button" className={cx('min-w-0 flex-1 truncate py-2 text-left', s.status === 'done' && 'text-faint line-through')} onClick={() => openEditor('tasks', s.id)}>{s.title}</button>
            </div>
          ))}
          <div className="flex items-center gap-2 px-3 py-1">
            <Icon name="plus" size={16} className="text-faint" />
            <input className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-faint" placeholder="Add a subtask…" aria-label="New subtask" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void add())} />
          </div>
        </div>
      </section>
      {history.length > 0 && (
        <section>
          <h3 className="label">History</h3>
          <ul className="space-y-1 text-sm text-muted">
            {history.map((h) => <li key={h.id} className="flex justify-between gap-3"><span className="capitalize">{h.action}</span><span className="text-faint">{timeAgo(h._ca)}</span></li>)}
            <li className="flex justify-between gap-3"><span>Created</span><span className="text-faint">{timeAgo(task._ca)}</span></li>
          </ul>
        </section>
      )}
    </div>
  );
}

const TEMPLATABLE = new Set(['tasks', 'notes', 'projects', 'checklists', 'routines', 'workoutPlans', 'trips']);

/** The one editor used for every collection, opened with `openEditor(collection, id?)`. */
export function RecordEditor() {
  const request = useApp((s) => s.editor);
  const existing = useRecord(request?.id);
  const [prefs] = usePrefs();
  const fields = useFields(request?.collection ?? '');
  const def = collectionDef(request?.collection ?? '');
  const [draft, setDraft] = useState<Fields>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const allTasks = useRecords(request?.collection === 'tasks' ? 'tasks' : '__none');

  const key = request ? `${request.collection}:${request.id ?? 'new'}` : null;
  useEffect(() => {
    if (!request) return setLoadedFor(null);
    if (loadedFor === key) return;
    if (request.id) {
      if (!existing) return;
      setDraft({ ...existing });
    } else setDraft(resolveDefaults(fields, prefs.currency, request.defaults));
    setErrors({});
    setLoadedFor(key);
  }, [request, existing, key, loadedFor, fields, prefs.currency]);

  if (!request || loadedFor !== key) return null;
  const isNew = !request.id;
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async (): Promise<Rec | null> => {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (!f.req || !visible(f, draft)) continue;
      const v = draft[f.k];
      if (v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) errs[f.k] = `${f.label} is required`;
    }
    if (request.collection === 'tasks' && request.id && Array.isArray(draft.dependsOn)) {
      const byId = new Map(allTasks.map((t) => [t.id, t as TaskLike]));
      if ((draft.dependsOn as string[]).some((dep) => wouldCycle(request.id!, dep, byId))) errs.dependsOn = 'That would create a circular dependency';
    }
    if (request.collection === 'events' && draft.startAt && draft.endAt && new Date(draft.endAt as string) < new Date(draft.startAt as string)) errs.endAt = 'End must be after the start';
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast(Object.values(errs)[0], { tone: 'bad' });
      return null;
    }
    const data: Fields = {};
    for (const f of fields) if (f.k in draft) data[f.k] = draft[f.k];
    for (const k of Object.keys(request.defaults ?? {})) if (!(k in data)) data[k] = request.defaults![k];
    if (request.collection === 'tasks') {
      const wasDone = existing?.status === 'done';
      if (data.status === 'done' && !wasDone) data.completedAt = new Date().toISOString();
      if (data.status !== 'done') data.completedAt = null;
    }
    const saved = isNew ? await create(request.collection, data) : await update(request.id!, data);
    if (!isNew && request.collection === 'tasks' && data.status === 'done' && existing?.status !== 'done' && existing) {
      const next = nextRecurringInstance({ ...existing, ...data } as unknown as TaskLike);
      if (next) await create('tasks', { ...next, notes: data.notes, ws: existing.ws }, { silent: true });
    }
    closeEditor();
    if (isNew) toast(`${def.one} added`, { tone: 'good' });
    return saved ?? null;
  };

  const menu: MenuItem[] = [];
  if (!isNew && existing) {
    menu.push({
      label: 'Duplicate', icon: 'copy',
      onClick: async () => {
        const { id: _id, _c, _ca, _ua, _dirty, _base, _seq, _s, ...rest } = existing;
        const tf = titleField(def);
        const copy = await create(request.collection, { ...rest, [tf]: `${String(rest[tf] ?? '')} (copy)` });
        openEditor(request.collection, copy.id);
      },
    });
    if (TEMPLATABLE.has(request.collection)) {
      menu.push({
        label: 'Save as template', icon: 'layers',
        onClick: async () => {
          const { id: _id, _c, _ca, _ua, _dirty, _base, _seq, _s, ws: _ws, ...payload } = existing;
          const children = request.collection === 'tasks' ? (await Promise.all(allTasks.filter((t) => t.parentId === existing.id).map((t) => getRec(t.id)))).map((t) => ({ title: t?.title, priority: t?.priority })) : undefined;
          await upsert('templates', `tpl:${existing.id}`, { kind: request.collection, name: titleOf(existing), payload: { ...payload, _children: children } });
          toast('Saved as template', { tone: 'good' });
        },
      });
    }
    if (def.archive) menu.push({ label: existing.archived ? 'Unarchive' : 'Archive', icon: 'archive', onClick: () => void update(existing.id, { archived: !existing.archived }).then(() => (closeEditor(), toast(existing.archived ? 'Restored from archive' : 'Archived'))) });
    menu.push({ separator: true, label: '' }, { label: 'Delete', icon: 'trash', danger: true, onClick: () => void deleteWithUndo(existing).then(closeEditor) });
  }

  return (
    <Sheet
      open side width={520} onClose={closeEditor} title={`${isNew ? 'New' : 'Edit'} ${def.one.toLowerCase()}`}
      actions={menu.length > 0 && <Menu label="Record actions" items={menu} trigger={(p) => <IconButton icon="more" label="More actions" {...p} />} />}
      footer={
        <>
          {existing?._rejected && <span className="mr-auto text-xs text-bad">Not synced: {existing._rejected}</span>}
          <Button variant="ghost" onClick={closeEditor}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()}>{isNew ? `Add ${def.one.toLowerCase()}` : 'Save'}</Button>
        </>
      }
    >
      <form
        className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void save();
        }}
      >
        {def.hint && <p className="col-span-full rounded-xl bg-accent-soft px-3 py-2 text-sm text-muted">{def.hint}</p>}
        {fields.filter((f) => visible(f, draft)).map((f, i) => (
          <div key={f.k} className={cx('min-w-0', !f.half && 'sm:col-span-2', f.t === 'bool' && 'flex items-center justify-between gap-3 self-end rounded-xl border border-line px-3 py-2')}>
            {f.t === 'bool' ? (
              <>
                <span className="min-w-0"><span className="block text-sm font-medium">{f.label}</span>{f.help && <span className="block text-xs text-faint">{f.help}</span>}</span>
                <FieldInput def={f} value={draft[f.k]} onChange={(v) => set(f.k, v)} rec={draft} />
              </>
            ) : (
              <>
                <span className="label">{f.label}{f.req && <span className="text-accent"> *</span>}</span>
                <FieldInput def={f} value={draft[f.k]} onChange={(v) => set(f.k, v)} rec={draft} autoFocus={isNew && i === 0} />
                {errors[f.k] ? <span className="mt-1 block text-xs text-bad">{errors[f.k]}</span> : f.help && <span className="mt-1 block text-xs text-faint">{f.help}</span>}
              </>
            )}
          </div>
        ))}
        <button type="submit" hidden />
      </form>
      {!isNew && existing && request.collection === 'tasks' && <TaskExtras task={existing} />}
    </Sheet>
  );
}
