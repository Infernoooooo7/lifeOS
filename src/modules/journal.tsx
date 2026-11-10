'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { openEditor } from '@/core/app';
import { MOODS } from '@/core/collections';
import { useNow, useRecord, useRecords } from '@/core/data/hooks';
import { create, upsert } from '@/core/data/store';
import { addDays, fmtDate, parseDate, startOfWeek, ymd } from '@/core/lib/dates';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { Heatmap, Lines } from '@/ui/charts';
import { CollectionView } from '@/ui/CollectionView';
import { Icon } from '@/ui/icons';
import { Button, Section, Stat, cx } from '@/ui/kit';
import { toast } from '@/ui/overlays';

const TABS = [{ value: 'today', label: 'Today', icon: 'journal' as const }, { value: 'entries', label: 'History', icon: 'history' as const }, { value: 'mood', label: 'Mood', icon: 'smile' as const }, { value: 'reflect', label: 'Reflect', icon: 'idea' as const }];

export const PROMPTS = [
  'What made today different from yesterday?', 'What are you avoiding, and why?', 'Describe a small moment you want to remember.', 'What did you learn about yourself this week?',
  'Who helped you recently, and how?', 'What would make tomorrow a good day?', 'What is taking more energy than it deserves?', 'What are you proud of that nobody saw?',
  'If you had one extra hour today, how would you spend it?', 'What is one thing you can let go of?', 'What felt easy today? What felt hard?', 'What does your ideal ordinary day look like?',
  'Which habit is serving you well right now?', 'What conversation do you need to have?', 'What are you looking forward to?', 'What would you tell a friend in your situation?',
];
const WEEKLY = ['What went well this week?', 'What did not go as planned?', 'What did I learn?', 'What will I focus on next week?'];
const MONTHLY = ['What were the highlights of this month?', 'What drained me, and what gave me energy?', 'How did I move toward my goals?', 'What do I want to change next month?'];
const MOOD_COLOR = ['', '#fb7185', '#fb923c', '#fbbf24', '#a3e635', '#34d399'];

function MoodPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Mood">
      {MOODS.map((m) => (
        <button key={m.value} type="button" role="radio" aria-checked={value === m.value} aria-label={m.label} title={m.label} onClick={() => onChange(value === m.value ? null : Number(m.value))} className={cx('grid size-11 place-items-center rounded-xl border text-xl transition-transform active:scale-90', value === m.value ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2')}>
          {m.label.split(' ')[0]}
        </button>
      ))}
    </div>
  );
}

/** Today's entry. One record per day and type (stable id), so writing on two devices merges into one entry. */
function TodayEntry({ date }: { date: string }) {
  const id = `jr:${date}:daily`;
  const entry = useRecord(id);
  const [text, setText] = useState('');
  const dirty = useRef(false);
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (entry === undefined) return;
    if (loaded.current !== id || !dirty.current) {
      loaded.current = id;
      setText(String(entry?.deletedAt ? '' : (entry?.content ?? '')));
    }
  }, [entry, id]);
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      void upsert('journal', id, { date, kind: 'daily', content: text });
      dirty.current = false;
    }, 700);
    return () => clearTimeout(t);
  }, [text, id, date]);
  const prompt = PROMPTS[(parseDate(date)!.getDate() + parseDate(date)!.getMonth() * 3) % PROMPTS.length];
  const live = entry && !entry.deletedAt ? entry : null;
  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><div className="font-display text-lg font-semibold">{parseDate(date)!.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div><div className="text-xs text-faint">{text.trim() ? `${text.trim().split(/\s+/).length} words · saved automatically` : 'Saved automatically as you write'}</div></div>
        <MoodPicker value={(live?.mood as number) ?? null} onChange={(mood) => void upsert('journal', id, { date, kind: 'daily', mood, content: text })} />
      </div>
      <button type="button" className="mb-2 flex w-full items-start gap-2 rounded-xl bg-accent-soft px-3 py-2 text-left text-sm" onClick={() => { dirty.current = true; setText((t) => `${t}${t.trim() ? '\n\n' : ''}**${prompt}**\n`); }}>
        <Icon name="idea" size={15} className="mt-0.5 flex-none text-accent" /><span><span className="text-faint">Prompt · </span>{prompt}<span className="ml-1 text-accent">Use it</span></span>
      </button>
      <textarea className="input min-h-56 resize-y leading-relaxed" placeholder="How was your day?" aria-label="Journal entry" value={text} onChange={(e) => { dirty.current = true; setText(e.target.value); }} />
    </div>
  );
}

function Gratitude({ date }: { date: string }) {
  const id = `jr:${date}:gratitude`;
  const entry = useRecord(id);
  const [items, setItems] = useState(['', '', '']);
  const loaded = useRef(false);
  useEffect(() => {
    if (entry === undefined || loaded.current) return;
    loaded.current = true;
    const lines = String(entry?.deletedAt ? '' : (entry?.content ?? '')).split('\n').map((l) => l.replace(/^\d\.\s*/, ''));
    setItems([lines[0] ?? '', lines[1] ?? '', lines[2] ?? '']);
  }, [entry]);
  const save = (next: string[]) => {
    setItems(next);
    if (next.some((x) => x.trim())) void upsert('journal', id, { date, kind: 'gratitude', title: 'Gratitude', content: next.map((x, i) => `${i + 1}. ${x}`).join('\n') });
  };
  return (
    <div className="card">
      <h3 className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold tracking-normal"><Icon name="heart" size={15} className="text-[#f472b6]" />Three good things</h3>
      <div className="space-y-2">{items.map((v, i) => <input key={i} className="input" placeholder={`${i + 1}. I am grateful for…`} aria-label={`Gratitude ${i + 1}`} value={v} onChange={(e) => save(items.map((x, j) => (j === i ? e.target.value : x)))} />)}</div>
    </div>
  );
}

function Guided({ kind, questions }: { kind: 'weekly' | 'monthly'; questions: string[] }) {
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ''));
  const save = async () => {
    if (!answers.some((a) => a.trim())) return toast('Answer at least one question first.', { tone: 'bad' });
    const rec = await create('journal', { date: ymd(), kind, title: `${kind === 'weekly' ? 'Weekly' : 'Monthly'} reflection`, content: questions.map((q, i) => `**${q}**\n${answers[i].trim() || '—'}`).join('\n\n'), tags: ['reflection'] });
    setAnswers(questions.map(() => ''));
    toast('Reflection saved', { tone: 'good', action: { label: 'Open', run: () => openEditor('journal', rec.id) } });
  };
  return (
    <div className="card">
      <h3 className="mb-3 font-sans font-semibold capitalize tracking-normal">{kind} reflection</h3>
      <div className="space-y-3">{questions.map((q, i) => <label key={q} className="block"><span className="label">{q}</span><textarea className="input min-h-16 resize-y" value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} /></label>)}</div>
      <Button variant="primary" className="mt-3" onClick={() => void save()}>Save reflection</Button>
    </div>
  );
}

export default function Journal({ sub }: ModuleProps) {
  const tab = tabFrom(sub, TABS);
  const now = useNow();
  const entries = useRecords('journal');
  const today = ymd(now);
  const moods = useMemo(() => entries.filter((e) => e.mood && e.date).sort((a, b) => String(a.date).localeCompare(String(b.date))), [entries]);
  const moodByDay = useMemo(() => new Map(moods.map((e) => [e.date as string, Number(e.mood) / 5])), [moods]);
  const avg = (list: typeof moods) => (list.length ? list.reduce((a, e) => a + Number(e.mood), 0) / list.length : 0);
  const week = moods.filter((e) => parseDate(e.date)! >= startOfWeek(now));
  const month = moods.filter((e) => parseDate(e.date)! >= addDays(now, -30));
  const days = new Set(entries.filter((e) => String(e.content ?? '').trim()).map((e) => e.date));
  let streak = 0;
  for (let i = days.has(today) ? 0 : 1; days.has(ymd(addDays(now, -i))); i++) streak++;
  const milestones = entries.filter((e) => e.kind === 'milestone').sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return (
    <Page module="journal" tabs={TABS} tab={tab} actions={<Button variant="primary" size="sm" icon="plus" onClick={() => openEditor('journal')}>Entry</Button>}>
      {tab === 'today' && (
        <div className="space-y-3">
          <TodayEntry key={today} date={today} />
          <Gratitude key={`g${today}`} date={today} />
          <div className="grid grid-cols-3 gap-2"><Stat label="Writing streak" value={`${streak} d`} icon="flame" tone="warn" /><Stat label="Entries" value={entries.length} icon="journal" /><Stat label="Mood this week" value={week.length ? `${avg(week).toFixed(1)} / 5` : '—'} icon="smile" /></div>
        </div>
      )}
      {tab === 'entries' && <CollectionView collection="journal" emptyHint="Daily entries, gratitude lists and reflections, searchable by text, type and mood." />}
      {tab === 'mood' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2"><Stat label="This week" value={week.length ? avg(week).toFixed(1) : '—'} icon="smile" /><Stat label="Last 30 days" value={month.length ? avg(month).toFixed(1) : '—'} /><Stat label="Days logged" value={moods.length} /></div>
          <Section title="Mood calendar" icon="calendarDays"><div className="card"><Heatmap values={moodByDay} color="var(--good)" label="Mood by day; stronger colour means a better mood" /><div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">{MOODS.map((m) => <span key={m.value} className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: MOOD_COLOR[Number(m.value)] }} />{m.label}</span>)}</div></div></Section>
          <Section title="Mood trend" icon="trending"><div className="card"><Lines data={moods.slice(-40).map((e) => ({ label: fmtDate(e.date), mood: Number(e.mood) }))} series={[{ key: 'mood', name: 'Mood', color: 'var(--good)' }]} fmt={(v) => String(v)} label="Mood over the last entries" /></div></Section>
          {moods.length === 0 && <p className="text-sm text-faint">Pick a mood on today’s entry to start your mood history.</p>}
        </div>
      )}
      {tab === 'reflect' && (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-2"><Guided kind="weekly" questions={WEEKLY} /><Guided kind="monthly" questions={MONTHLY} /></div>
          <Section title="Life milestones" icon="flag" action={<Button size="sm" icon="plus" onClick={() => openEditor('journal', undefined, { kind: 'milestone', date: today })}>Milestone</Button>}>
            {milestones.length === 0 ? <p className="text-sm text-faint">Mark the moments that matter — a move, a first, a finish line.</p> : (
              <ol className="relative ml-2 border-l border-line pl-5">
                {milestones.map((m) => <li key={m.id} className="relative pb-4"><span className="absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-accent" /><button type="button" className="text-left" onClick={() => openEditor('journal', m.id)}><span className="block font-medium">{m.title || String(m.content ?? '').slice(0, 60) || 'Milestone'}</span><span className="text-xs text-faint">{fmtDate(m.date, { year: true })}</span></button></li>)}
              </ol>
            )}
          </Section>
          <Section title="More prompts" icon="idea"><div className="flex flex-wrap gap-2">{PROMPTS.slice(0, 8).map((p) => <button key={p} type="button" className="chip h-auto whitespace-normal py-1.5 text-left hover:border-accent" onClick={() => openEditor('journal', undefined, { kind: 'reflection', prompt: p, date: today })}>{p}</button>)}</div></Section>
        </div>
      )}
    </Page>
  );
}
