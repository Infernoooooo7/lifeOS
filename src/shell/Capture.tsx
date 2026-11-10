'use client';

import { useEffect, useRef, useState } from 'react';
import { openEditor, useApp } from '@/core/app';
import { MOODS } from '@/core/collections';
import { useEnabledModules, useOptions, usePrefs } from '@/core/data/hooks';
import { create } from '@/core/data/store';
import { fmtDateTime, fromLocalInput, relativeDay, toLocalInput, ymd } from '@/core/lib/dates';
import { parseQuickTask } from '@/core/lib/quickadd';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Sheet, cx } from '@/ui/kit';
import { toast } from '@/ui/overlays';

interface Kind {
  id: string;
  label: string;
  icon: IconName;
  module: string;
  placeholder: string;
}
const KINDS: Kind[] = [
  { id: 'task', label: 'Task', icon: 'tasks', module: 'tasks', placeholder: 'Pay rent tomorrow !high #home' },
  { id: 'note', label: 'Note', icon: 'notes', module: 'notes', placeholder: 'Title of the note' },
  { id: 'idea', label: 'Idea', icon: 'idea', module: 'notes', placeholder: 'What is the idea?' },
  { id: 'reminder', label: 'Reminder', icon: 'bell', module: 'tasks', placeholder: 'Remind me to…' },
  { id: 'expense', label: 'Expense', icon: 'wallet', module: 'finance', placeholder: 'What was it for?' },
  { id: 'event', label: 'Event', icon: 'calendar', module: 'calendar', placeholder: 'Event title' },
  { id: 'link', label: 'Link', icon: 'link', module: 'digital', placeholder: 'https://…' },
  { id: 'goal', label: 'Goal', icon: 'target', module: 'goals', placeholder: 'What do you want to achieve?' },
  { id: 'journal', label: 'Journal', icon: 'journal', module: 'journal', placeholder: 'What is on your mind?' },
];

const nextHour = () => {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d.toISOString();
};

/** Universal quick capture: one sheet, nine kinds, a couple of fields each. */
export function Capture() {
  const state = useApp((s) => s.capture);
  const enabled = useEnabledModules();
  const [prefs] = usePrefs();
  const kinds = KINDS.filter((k) => enabled.has(k.module));
  const [kind, setKind] = useState('task');
  const [text, setText] = useState('');
  const [body, setBody] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [when, setWhen] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [categories] = useOptions('expenseCategories');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.open) return;
    setKind(state.kind && kinds.some((k) => k.id === state.kind) ? state.kind : (kinds[0]?.id ?? 'task'));
    setText('');
    setBody('');
    setAmount('');
    setCategory('');
    setMood(null);
    setWhen(nextHour());
    setTimeout(() => input.current?.focus(), 60);
  }, [state.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => useApp.setState({ capture: { open: false } });
  const current = kinds.find((k) => k.id === kind) ?? kinds[0];
  const parsed = kind === 'task' ? parseQuickTask(text) : null;

  const save = async (more = false) => {
    const title = text.trim();
    if (kind === 'expense' ? !(Number(amount) > 0) : !title && !body.trim()) return toast(kind === 'expense' ? 'Enter an amount.' : 'Type something first.', { tone: 'bad' });
    let created: { id: string; _c: string } | null = null;
    if (kind === 'task' && parsed) created = await create('tasks', { title: parsed.title || title, status: 'todo', priority: parsed.priority ?? 0, dueAt: parsed.dueAt ?? null, tags: parsed.tags ?? [], notes: body });
    else if (kind === 'note') created = await create('notes', { title: title || 'Untitled', content: body, kind: 'note', tags: [] });
    else if (kind === 'idea') created = await create('notes', { title: title || 'Idea', content: body, kind: 'note', tags: ['idea'] });
    else if (kind === 'reminder') created = await create('tasks', { title, status: 'todo', priority: 0, dueAt: when, tags: ['reminder'] });
    else if (kind === 'expense') created = await create('transactions', { type: 'expense', amount: Number(amount), currency: prefs.currency, category: category || 'Other', payee: title, date: ymd() });
    else if (kind === 'event') created = await create('events', { title, startAt: when, endAt: new Date(new Date(when).getTime() + 3_600_000).toISOString(), allDay: false, description: body });
    else if (kind === 'link') created = await create('bookmarks', { title: body.trim() || title.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], url: /^https?:\/\//.test(title) ? title : `https://${title}`, folder: 'Read later', tags: [] });
    else if (kind === 'goal') created = await create('goals', { title, kind: 'short', status: 'active', progress: 0, description: body });
    else if (kind === 'journal') created = await create('journal', { date: ymd(), kind: 'daily', content: `${title}${body ? `\n\n${body}` : ''}`, mood, tags: [] });
    const rec = created;
    toast(`${current.label} saved`, { tone: 'good', action: rec ? { label: 'Open', run: () => openEditor(rec._c, rec.id) } : undefined });
    if (more) {
      setText('');
      setBody('');
      setAmount('');
      input.current?.focus();
    } else close();
  };

  if (!current) return null;
  const needsBody = ['note', 'idea', 'goal', 'journal', 'event', 'task'].includes(kind);
  return (
    <Sheet
      open={state.open} onClose={close} title="Quick capture" width={560}
      footer={<><span className="mr-auto text-xs text-faint max-sm:hidden">Enter to save · Shift+Enter to save and add another</span><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Save {current.label.toLowerCase()}</Button></>}
    >
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar" role="radiogroup" aria-label="What are you capturing?">
        {kinds.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => { setKind(k.id); input.current?.focus(); }} className={cx('chip h-9 flex-none gap-1.5 px-3 text-[0.84rem] pointer-coarse:h-10', kind === k.id && 'chip-accent')}>
            <Icon name={k.icon} size={15} />{k.label}
          </button>
        ))}
      </div>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {kind === 'expense' && (
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-faint">{prefs.currency}</span>
              <input className="input !pl-12 text-lg" type="number" inputMode="decimal" step="any" min="0" placeholder="0" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </div>
            <select className="input" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Category</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}
        <input
          ref={input} className="input text-[1.02rem]" placeholder={current.placeholder} aria-label={current.label} value={text} onChange={(e) => setText(e.target.value)} inputMode={kind === 'link' ? 'url' : undefined}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); void save(true); } }}
        />
        {parsed && (parsed.dueAt || parsed.priority || parsed.tags) && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {parsed.dueAt && <span className="chip chip-accent"><Icon name="calendar" size={12} />{parsed.dueAt.length === 10 ? relativeDay(parsed.dueAt) : fmtDateTime(parsed.dueAt)}</span>}
            {parsed.priority ? <span className="chip chip-accent"><Icon name="flag" size={12} />{['', 'Low', 'Medium', 'High'][parsed.priority]}</span> : null}
            {parsed.tags?.map((t) => <span key={t} className="chip chip-accent">#{t}</span>)}
          </div>
        )}
        {(kind === 'reminder' || kind === 'event') && <input className="input" type="datetime-local" aria-label="When" value={toLocalInput(when)} onChange={(e) => setWhen(fromLocalInput(e.target.value) ?? when)} />}
        {kind === 'journal' && (
          <div className="flex gap-1.5" role="radiogroup" aria-label="Mood">
            {MOODS.map((m) => <button key={m.value} type="button" role="radio" aria-checked={mood === m.value} aria-label={m.label} onClick={() => setMood(mood === m.value ? null : Number(m.value))} className={cx('grid size-11 place-items-center rounded-xl border text-xl', mood === m.value ? 'border-accent bg-accent-soft' : 'border-line')}>{m.label.split(' ')[0]}</button>)}
          </div>
        )}
        {kind === 'link' && <input className="input" placeholder="Title (optional)" aria-label="Title" value={body} onChange={(e) => setBody(e.target.value)} />}
        {needsBody && <textarea className="input min-h-20 resize-y" placeholder={kind === 'task' || kind === 'event' ? 'Notes (optional)' : 'Details (optional)'} aria-label="Details" value={body} onChange={(e) => setBody(e.target.value)} />}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
