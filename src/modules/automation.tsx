'use client';

import { useMemo, useState } from 'react';
import { COLLECTIONS, collection as collectionDef, titleField, type FieldDef } from '@/core/collections';
import type { Rec } from '@/core/data/db';
import { useRecords } from '@/core/data/hooks';
import { create, remove, update } from '@/core/data/store';
import { describeTrigger, type Action, type Condition, type Trigger } from '@/core/lib/automation';
import { timeAgo } from '@/core/lib/dates';
import { runAutomationTick } from '@/shell/engines';
import { Page, type ModuleProps } from '@/shell/Page';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Empty, IconButton, Menu, Sheet, Switch, cx } from '@/ui/kit';
import { confirmDialog, toast } from '@/ui/overlays';

interface Draft {
  id?: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
}

const TARGETS = Object.values(COLLECTIONS).filter((c) => !c.system && c.fields.length > 0).sort((a, b) => a.label.localeCompare(b.label));
const one = (c: string) => collectionDef(c).one.toLowerCase();
const fieldsOf = (c: string): FieldDef[] => collectionDef(c).fields.filter((f) => ['text', 'textarea', 'select', 'number', 'money', 'tags', 'bool', 'date', 'datetime', 'rating'].includes(f.t));
const dateFields = (c: string): FieldDef[] => collectionDef(c).fields.filter((f) => f.t === 'date' || f.t === 'datetime');
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TEMPLATES: Draft[] = [
  { name: 'Daily planning nudge', enabled: true, trigger: { type: 'schedule', every: 'day', at: '08:30' }, conditions: [], actions: [{ type: 'notify', title: 'Plan your day', body: 'Pick the three things that matter most.' }] },
  { name: 'Weekly review task', enabled: true, trigger: { type: 'schedule', every: 'week', weekday: 0, at: '18:00' }, conditions: [], actions: [{ type: 'create', collection: 'tasks', data: { title: 'Weekly review', status: 'todo', priority: 2, dueAt: '{{today}}', tags: ['review'] } }] },
  { name: 'Follow up on finished high-priority tasks', enabled: true, trigger: { type: 'status', collection: 'tasks', to: 'done' }, conditions: [{ field: 'priority', op: 'gt', value: 2 }], actions: [{ type: 'create', collection: 'tasks', data: { title: 'Follow up: {{title}}', status: 'todo', priority: 1, dueAt: '{{today+3}}' } }] },
  { name: 'Tag new tasks without a date', enabled: true, trigger: { type: 'created', collection: 'tasks' }, conditions: [{ field: 'dueAt', op: 'empty' }], actions: [{ type: 'addTag', tag: 'someday' }] },
  { name: 'Warranty ending soon', enabled: true, trigger: { type: 'dateField', collection: 'inventory', field: 'warrantyUntil', offsetDays: 14 }, conditions: [], actions: [{ type: 'notify', title: 'Warranty ends in two weeks', body: '{{name}}' }] },
  { name: 'Prepare for a trip', enabled: true, trigger: { type: 'dateField', collection: 'trips', field: 'startDate', offsetDays: 3 }, conditions: [], actions: [{ type: 'create', collection: 'tasks', data: { title: 'Pack for {{name}}', status: 'todo', priority: 2, dueAt: '{{today+2}}', tags: ['travel'] } }] },
  { name: 'Monthly budget check', enabled: true, trigger: { type: 'schedule', every: 'month', day: 1, at: '09:00' }, conditions: [], actions: [{ type: 'create', collection: 'tasks', data: { title: 'Review last month’s spending', status: 'todo', priority: 1, dueAt: '{{today+2}}', tags: ['finance'] } }] },
  { name: 'Log a note when a project is done', enabled: true, trigger: { type: 'status', collection: 'projects', to: 'done' }, conditions: [], actions: [{ type: 'create', collection: 'notes', data: { title: 'Retrospective: {{name}}', content: '## What went well\n\n## What to change next time\n', kind: 'note', tags: ['retro'] } }] },
];

function describeAction(a: Action): string {
  switch (a.type) {
    case 'create': return `Create a ${one(a.collection)}: “${String(a.data[titleField(collectionDef(a.collection))] ?? a.data.title ?? '')}”`;
    case 'update': return `Set ${Object.entries(a.patch).map(([k, v]) => `${k} to “${String(v)}”`).join(', ')}`;
    case 'addTag': return `Add the tag #${a.tag}`;
    case 'notify': return `Notify me: “${a.title}”`;
  }
}

function Block({ step, title, icon, tone, children, last }: { step: string; title: string; icon: IconName; tone: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className="relative pl-12">
      {!last && <span className="absolute bottom-[-14px] left-[19px] top-10 w-px bg-line-strong" aria-hidden />}
      <span className="absolute left-0 top-0 grid size-10 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${tone} 18%, transparent)`, color: tone }}><Icon name={icon} size={18} /></span>
      <div className="mb-3.5 rounded-2xl border border-line bg-surface p-3">
        <div className="mb-2 flex items-baseline gap-2"><span className="eyebrow" style={{ color: tone }}>{step}</span><span className="text-sm font-semibold">{title}</span></div>
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}

function CollectionSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <select className="input" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>{TARGETS.map((c) => <option key={c.id} value={c.id}>{c.one}</option>)}</select>;
}

function Builder({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const t = d.trigger;
  const subject = t.type === 'schedule' ? null : t.collection;
  const setTrigger = (trigger: Trigger) => setD({ ...d, trigger });
  const changeType = (type: Trigger['type']) => {
    const c = subject ?? 'tasks';
    setTrigger(type === 'created' ? { type, collection: c } : type === 'updated' ? { type, collection: c } : type === 'status' ? { type, collection: collectionDef(c).fields.some((f) => f.k === 'status') ? c : 'tasks', to: 'done' } : type === 'schedule' ? { type, every: 'day', at: '09:00' } : { type, collection: dateFields(c).length ? c : 'tasks', field: (dateFields(c)[0] ?? dateFields('tasks')[0]).k, offsetDays: 1 });
  };
  const setCondition = (i: number, p: Partial<Condition>) => setD({ ...d, conditions: d.conditions.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const setAction = (i: number, a: Action) => setD({ ...d, actions: d.actions.map((x, j) => (j === i ? a : x)) });
  const statusOpts = subject ? (collectionDef(subject).fields.find((f) => f.k === 'status')?.opts ?? []) : [];
  const save = async () => {
    if (!d.name.trim()) return toast('Give the automation a name.', { tone: 'bad' });
    if (!d.actions.length) return toast('Add at least one action.', { tone: 'bad' });
    const data = { name: d.name.trim(), enabled: d.enabled, trigger: d.trigger, conditions: d.conditions, actions: d.actions };
    if (d.id) await update(d.id, data);
    else await create('automations', { ...data, runCount: 0 });
    toast('Automation saved', { tone: 'good' });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} side width={600} title={d.id ? 'Edit automation' : 'New automation'} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Save automation</Button></>}>
      <label className="mb-4 block"><span className="label">Name</span><input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Follow up on finished tasks" autoFocus={!d.id} /></label>

      <Block step="When" title="Trigger" icon="zap" tone="var(--accent)">
        <select className="input" aria-label="Trigger type" value={t.type} onChange={(e) => changeType(e.target.value as Trigger['type'])}>
          <option value="created">Something is created</option><option value="updated">Something changes</option><option value="status">Something reaches a status</option><option value="schedule">On a schedule</option><option value="dateField">A date is coming up</option>
        </select>
        {t.type !== 'schedule' && <CollectionSelect label="Record type" value={t.collection} onChange={(c) => setTrigger(t.type === 'dateField' ? { ...t, collection: c, field: dateFields(c)[0]?.k ?? '' } : { ...t, collection: c })} />}
        {t.type === 'updated' && <select className="input" aria-label="Field that changes" value={t.field ?? ''} onChange={(e) => setTrigger({ ...t, field: e.target.value || undefined })}><option value="">Any field</option>{fieldsOf(t.collection).map((f) => <option key={f.k} value={f.k}>{f.label}</option>)}</select>}
        {t.type === 'status' && (statusOpts.length ? <select className="input" aria-label="Status reached" value={t.to} onChange={(e) => setTrigger({ ...t, to: e.target.value })}>{statusOpts.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}</select> : <p className="text-sm text-warn">This record type has no status field — choose another.</p>)}
        {t.type === 'schedule' && (
          <div className="grid grid-cols-2 gap-2">
            <select className="input" aria-label="How often" value={t.every} onChange={(e) => setTrigger({ ...t, every: e.target.value as 'day' | 'week' | 'month' })}><option value="day">Every day</option><option value="week">Every week</option><option value="month">Every month</option></select>
            <input type="time" className="input" aria-label="Time" value={t.at ?? '09:00'} onChange={(e) => setTrigger({ ...t, at: e.target.value })} />
            {t.every === 'week' && <select className="input col-span-2" aria-label="Weekday" value={t.weekday ?? 1} onChange={(e) => setTrigger({ ...t, weekday: Number(e.target.value) })}>{WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}</select>}
            {t.every === 'month' && <label className="col-span-2 flex items-center gap-2 text-sm text-muted">On day<input type="number" min={1} max={28} className="input !w-20" value={t.day ?? 1} onChange={(e) => setTrigger({ ...t, day: Math.max(1, Math.min(28, Number(e.target.value) || 1)) })} />of the month</label>}
          </div>
        )}
        {t.type === 'dateField' && (dateFields(t.collection).length ? (
          <div className="grid grid-cols-2 gap-2">
            <select className="input" aria-label="Date field" value={t.field} onChange={(e) => setTrigger({ ...t, field: e.target.value })}>{dateFields(t.collection).map((f) => <option key={f.k} value={f.k}>{f.label}</option>)}</select>
            <label className="flex items-center gap-2 text-sm text-muted"><input type="number" min={0} max={365} className="input !w-20" aria-label="Days before" value={t.offsetDays} onChange={(e) => setTrigger({ ...t, offsetDays: Math.max(0, Number(e.target.value) || 0) })} />days before</label>
          </div>
        ) : <p className="text-sm text-warn">This record type has no date fields — choose another.</p>)}
        <p className="text-xs text-faint">{describeTrigger(t, one)}</p>
      </Block>

      <Block step="If" title={d.conditions.length ? 'All of these are true' : 'No conditions — always continue'} icon="filter" tone="var(--warn)">
        {subject ? (
          <>
            {d.conditions.map((c, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_auto]">
                <select className="input" aria-label="Field" value={c.field} onChange={(e) => setCondition(i, { field: e.target.value })}>{fieldsOf(subject).map((f) => <option key={f.k} value={f.k}>{f.label}</option>)}</select>
                <select className="input" aria-label="Comparison" value={c.op} onChange={(e) => setCondition(i, { op: e.target.value as Condition['op'] })}><option value="eq">is</option><option value="neq">is not</option><option value="contains">contains</option><option value="gt">is greater than</option><option value="lt">is less than</option><option value="empty">is empty</option><option value="notEmpty">is not empty</option></select>
                {c.op !== 'empty' && c.op !== 'notEmpty' ? <input className="input" aria-label="Value" placeholder="Value" value={String(c.value ?? '')} onChange={(e) => setCondition(i, { value: e.target.value })} /> : <span className="max-sm:hidden" />}
                <IconButton icon="x" label="Remove condition" onClick={() => setD({ ...d, conditions: d.conditions.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <Button size="sm" icon="plus" onClick={() => setD({ ...d, conditions: [...d.conditions, { field: fieldsOf(subject)[0]?.k ?? 'title', op: 'eq', value: '' }] })}>Add condition</Button>
          </>
        ) : <p className="text-sm text-faint">Schedules run every time; conditions apply to rules that react to a record.</p>}
      </Block>

      <Block step="Then" title="Actions" icon="play" tone="var(--good)" last>
        {d.actions.map((a, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-line p-2.5">
            <div className="flex items-center gap-2">
              <select
                className="input" aria-label="Action type" value={a.type}
                onChange={(e) => { const type = e.target.value as Action['type']; setAction(i, type === 'create' ? { type, collection: 'tasks', data: { title: subject ? 'Follow up: {{title}}' : 'New task', status: 'todo', priority: 0, dueAt: '{{today+1}}' } } : type === 'update' ? { type, patch: { [fieldsOf(subject ?? 'tasks')[0]?.k ?? 'status']: '' } } : type === 'addTag' ? { type, tag: 'auto' } : { type, title: 'Reminder', body: subject ? '{{title}}' : '' }); }}
              >
                <option value="create">Create a record</option>{subject && <option value="update">Update the record</option>}{subject && collectionDef(subject).fields.some((f) => f.k === 'tags') && <option value="addTag">Add a tag</option>}<option value="notify">Send me a notification</option>
              </select>
              <IconButton icon="x" label="Remove action" onClick={() => setD({ ...d, actions: d.actions.filter((_, j) => j !== i) })} />
            </div>
            {a.type === 'create' && (
              <>
                <CollectionSelect label="Record type to create" value={a.collection} onChange={(c) => setAction(i, { ...a, collection: c, data: { [titleField(collectionDef(c))]: String(a.data[titleField(collectionDef(a.collection))] ?? a.data.title ?? ''), ...(c === 'tasks' ? { status: 'todo', priority: 0 } : {}) } })} />
                <input className="input" aria-label="Title" placeholder="Title" value={String(a.data[titleField(collectionDef(a.collection))] ?? '')} onChange={(e) => setAction(i, { ...a, data: { ...a.data, [titleField(collectionDef(a.collection))]: e.target.value } })} />
                {a.collection === 'tasks' && <label className="flex items-center gap-2 text-sm text-muted">Due in<input type="number" min={0} className="input !w-20" aria-label="Due in days" value={Number(/today\+?(\d*)/.exec(String(a.data.dueAt ?? ''))?.[1] ?? 0)} onChange={(e) => setAction(i, { ...a, data: { ...a.data, dueAt: `{{today+${Math.max(0, Number(e.target.value) || 0)}}}` } })} />days</label>}
                {a.collection === 'notes' && <textarea className="input min-h-16" aria-label="Note content" placeholder="Content (optional)" value={String(a.data.content ?? '')} onChange={(e) => setAction(i, { ...a, data: { ...a.data, content: e.target.value } })} />}
              </>
            )}
            {a.type === 'update' && subject && (
              <div className="grid grid-cols-2 gap-2">
                <select className="input" aria-label="Field to set" value={Object.keys(a.patch)[0] ?? ''} onChange={(e) => setAction(i, { ...a, patch: { [e.target.value]: Object.values(a.patch)[0] ?? '' } })}>{fieldsOf(subject).map((f) => <option key={f.k} value={f.k}>{f.label}</option>)}</select>
                <input className="input" aria-label="New value" placeholder="New value" value={String(Object.values(a.patch)[0] ?? '')} onChange={(e) => setAction(i, { ...a, patch: { [Object.keys(a.patch)[0]]: e.target.value } })} />
              </div>
            )}
            {a.type === 'addTag' && <input className="input" aria-label="Tag" placeholder="Tag" value={a.tag} onChange={(e) => setAction(i, { ...a, tag: e.target.value.replace(/^#/, '') })} />}
            {a.type === 'notify' && (<><input className="input" aria-label="Notification title" placeholder="Title" value={a.title} onChange={(e) => setAction(i, { ...a, title: e.target.value })} /><input className="input" aria-label="Notification text" placeholder="Text (optional)" value={a.body ?? ''} onChange={(e) => setAction(i, { ...a, body: e.target.value })} /></>)}
          </div>
        ))}
        <Button size="sm" icon="plus" onClick={() => setD({ ...d, actions: [...d.actions, { type: 'notify', title: 'Reminder', body: subject ? '{{title}}' : '' }] })}>Add action</Button>
        <p className="text-xs text-faint">Use {'{{field}}'} to insert a value from the record (for example {'{{title}}'}), and {'{{today}}'} or {'{{today+3}}'} for dates.</p>
      </Block>
    </Sheet>
  );
}

const BLANK: Draft = { name: '', enabled: true, trigger: { type: 'created', collection: 'tasks' }, conditions: [], actions: [{ type: 'notify', title: 'New task added', body: '{{title}}' }] };

export default function Automation(_: ModuleProps) {
  const rules = useRecords('automations');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [templates, setTemplates] = useState(false);
  const [log, setLog] = useState<Rec | null>(null);
  const sorted = useMemo(() => [...rules].sort((a, b) => a._ca - b._ca), [rules]);
  return (
    <Page module="automation" actions={<><Button size="sm" icon="layers" onClick={() => setTemplates(true)}>Templates</Button><Button variant="primary" size="sm" icon="plus" onClick={() => setEditing(BLANK)}>Automation</Button></>}>
      <p className="mb-4 flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted"><Icon name="info" size={16} className="mt-0.5 flex-none" />Automations run while LIFEOS is open on any of your devices. A schedule that was missed while the app was closed runs once the next time you open it.</p>
      {sorted.length === 0 ? (
        <Empty icon="workflow" title="No automations yet" hint="Let LIFEOS do the repetitive parts: create follow-ups, tag things, remind you before dates." action={<div className="flex gap-2"><Button variant="primary" icon="plus" onClick={() => setEditing(BLANK)}>Build one</Button><Button icon="layers" onClick={() => setTemplates(true)}>Start from a template</Button></div>} />
      ) : (
        <div className="space-y-2.5">
          {sorted.map((r) => (
            <div key={r.id} className={cx('card', r.enabled === false && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <span className="grid size-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent"><Icon name="workflow" size={18} /></span>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing({ id: r.id, name: String(r.name ?? ''), enabled: r.enabled !== false, trigger: r.trigger as Trigger, conditions: (r.conditions as Condition[]) ?? [], actions: (r.actions as Action[]) ?? [] })}>
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="chip chip-accent">{describeTrigger(r.trigger as Trigger, one)}</span>
                    {((r.conditions as Condition[]) ?? []).length > 0 && <span className="chip !text-warn">{(r.conditions as Condition[]).length} condition{(r.conditions as Condition[]).length === 1 ? '' : 's'}</span>}
                    {((r.actions as Action[]) ?? []).map((a, i) => <span key={i} className="chip max-w-full"><Icon name="arrowRight" size={11} /><span className="truncate">{describeAction(a)}</span></span>)}
                  </span>
                  <span className="mt-1.5 block text-xs text-faint">{r.lastRunAt ? `Ran ${Number(r.runCount) || 0} time${Number(r.runCount) === 1 ? '' : 's'} · last ${timeAgo(new Date(r.lastRunAt).getTime())}` : 'Has not run yet'}</span>
                </button>
                <Switch checked={r.enabled !== false} onChange={(v) => void update(r.id, { enabled: v }, { silent: true })} label={`${r.enabled !== false ? 'Pause' : 'Resume'} ${r.name}`} />
                <Menu label="Automation actions" items={[
                  { label: 'Edit', icon: 'pencil', onClick: () => setEditing({ id: r.id, name: String(r.name ?? ''), enabled: r.enabled !== false, trigger: r.trigger as Trigger, conditions: (r.conditions as Condition[]) ?? [], actions: (r.actions as Action[]) ?? [] }) },
                  { label: 'Run history', icon: 'history', onClick: () => setLog(r) },
                  ...((r.trigger as Trigger).type === 'schedule' || (r.trigger as Trigger).type === 'dateField' ? [{ label: 'Check now', icon: 'play' as const, onClick: () => void runAutomationTick().then(() => toast('Checked. Rules that were due have run.')) }] : []),
                  { label: 'Delete', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog({ title: `Delete “${r.name}”?`, danger: true, confirmLabel: 'Delete' })) await remove(r.id); } },
                ]} trigger={(p) => <IconButton icon="more" label="Automation actions" {...p} />} />
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <Builder key={editing.id ?? 'new'} initial={editing} onClose={() => setEditing(null)} />}
      <Sheet open={templates} onClose={() => setTemplates(false)} title="Workflow templates" width={560}>
        <p className="mb-3 text-sm text-muted">Pick one to open it in the builder. Nothing is created until you save.</p>
        {TEMPLATES.map((tpl) => (
          <button key={tpl.name} type="button" className="row w-full items-start text-left" onClick={() => { setTemplates(false); setEditing({ ...tpl }); }}>
            <Icon name="workflow" size={16} className="mt-1 flex-none text-accent" />
            <span className="min-w-0 flex-1"><span className="block font-medium">{tpl.name}</span><span className="block text-xs text-muted">{describeTrigger(tpl.trigger, one)} → {tpl.actions.map(describeAction).join('; ')}</span></span>
          </button>
        ))}
      </Sheet>
      <Sheet open={!!log} onClose={() => setLog(null)} title={`Run history · ${log?.name ?? ''}`} width={460}>
        {((log?.log as { at: string; summary: string }[] | undefined) ?? []).length === 0 ? <Empty icon="history" title="No runs yet" hint="Each run is recorded here with what triggered it." /> : (
          <ul className="divide-y divide-line">{(log!.log as { at: string; summary: string }[]).map((entry, i) => <li key={i} className="flex justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate">{entry.summary}</span><span className="flex-none text-faint">{timeAgo(new Date(entry.at).getTime())}</span></li>)}</ul>
        )}
      </Sheet>
    </Page>
  );
}
