'use client';

import { useMemo, useState } from 'react';
import { openEditor } from '@/core/app';
import type { Rec } from '@/core/data/db';
import { useNow, useRecords } from '@/core/data/hooks';
import { titleOf, update } from '@/core/data/store';
import { addDays, diffDays, fmtDate, fmtDuration, parseDate, startOfWeek, ymd } from '@/core/lib/dates';
import { goalProgress } from '@/core/lib/goals';
import { fmtInterval, isDue, isNew, preview, review, stageLabel, type Grade, type SrsState } from '@/core/lib/srs';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { Bars } from '@/ui/charts';
import { CollectionView } from '@/ui/CollectionView';
import type { ChecklistItem } from '@/ui/fields';
import { Graph, type GraphEdge, type GraphNode } from '@/ui/Graph';
import { Icon } from '@/ui/icons';
import { Button, Empty, Progress, Section, Segmented, Sheet, Stat, cx } from '@/ui/kit';
import { Markdown } from '@/ui/Markdown';
import { toast } from '@/ui/overlays';

const TABS = [
  { value: 'planner', label: 'Planner', icon: 'calendarDays' as const }, { value: 'subjects', label: 'Subjects', icon: 'book' as const }, { value: 'courses', label: 'Courses', icon: 'learning' as const },
  { value: 'flashcards', label: 'Flashcards', icon: 'layers' as const }, { value: 'assignments', label: 'Assignments', icon: 'file' as const }, { value: 'exams', label: 'Exams', icon: 'alarm' as const },
  { value: 'reading', label: 'Reading', icon: 'bookmark' as const }, { value: 'practice', label: 'Practice', icon: 'idea' as const }, { value: 'stats', label: 'Statistics', icon: 'chart' as const },
];
const coverage = (items: unknown) => { const list = (Array.isArray(items) ? items : []) as ChecklistItem[]; return list.length ? list.filter((i) => i.done).length / list.length : null; };

/** Flashcard review session: show the front, reveal, grade — FSRS decides when the card returns. */
function ReviewSession({ cards, onClose }: { cards: Rec[]; onClose: () => void }) {
  const [queue, setQueue] = useState(() => [...cards].sort((a, b) => Number(isNew(a.srs)) - Number(isNew(b.srs))));
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const card = queue[0];
  const grade = async (g: Grade) => {
    const next = review(card.srs as SrsState | null, g);
    await update(card.id, { srs: next, reviews: (Number(card.reviews) || 0) + 1, correct: (Number(card.correct) || 0) + (g === 'again' ? 0 : 1) }, { silent: true });
    // "Again" cards come back in this session; the rest leave the queue.
    setQueue((q) => (g === 'again' ? [...q.slice(1), { ...card, srs: next }] : q.slice(1)));
    setDone((n) => n + 1);
    setShown(false);
  };
  const due = card ? preview(card.srs as SrsState | null) : null;
  const GRADES: [Grade, string, string][] = [['again', 'Again', 'var(--bad)'], ['hard', 'Hard', 'var(--warn)'], ['good', 'Good', 'var(--good)'], ['easy', 'Easy', 'var(--accent)']];
  return (
    <Sheet open onClose={onClose} title={card ? `Review · ${queue.length} left` : 'Review complete'} width={620} full>
      {!card ? (
        <Empty icon="checkCircle" title="All caught up" hint={`You reviewed ${done} card${done === 1 ? '' : 's'}. FSRS has scheduled each one for when you are about to forget it.`} action={<Button variant="primary" onClick={onClose}>Done</Button>} />
      ) : (
        <div className="flex min-h-[50dvh] flex-col">
          <div className="mb-2 flex items-center gap-2 text-xs text-faint"><span className="chip">{stageLabel(card.srs)}</span><span className="flex-1" /><span>{done} reviewed</span></div>
          <div className="card flex-1 !p-5"><p className="eyebrow mb-2">Front</p><div className="text-[1.1rem]"><Markdown text={String(card.title ?? '')} /></div>
            {shown && <><hr className="my-4 border-line" /><p className="eyebrow mb-2">Back</p><div className="text-[1.05rem]"><Markdown text={String(card.back ?? '')} /></div></>}
          </div>
          <div className="mt-4">
            {!shown ? <Button variant="primary" className="w-full !min-h-12" onClick={() => setShown(true)}>Show answer</Button> : (
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map(([g, label, color]) => (
                  <button key={g} type="button" onClick={() => void grade(g)} className="flex min-h-14 flex-col items-center justify-center rounded-xl border font-medium active:scale-95" style={{ borderColor: `color-mix(in oklab, ${color} 45%, transparent)`, background: `color-mix(in oklab, ${color} 12%, transparent)` }}>
                    <span>{label}</span><span className="text-xs text-muted">{due ? fmtInterval(due[g]) : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Self-test: reveal the answer, then mark yourself right or wrong. */
function PracticeSession({ questions, onClose }: { questions: Rec[]; onClose: () => void }) {
  const [order] = useState(() => [...questions].sort(() => Math.random() - 0.5));
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [score, setScore] = useState(0);
  const q = order[i];
  const answer = async (right: boolean) => {
    await update(q.id, { attempts: (Number(q.attempts) || 0) + 1, correct: (Number(q.correct) || 0) + (right ? 1 : 0), lastResult: right ? 'correct' : 'wrong', lastAt: new Date().toISOString() }, { silent: true });
    if (right) setScore((s) => s + 1);
    setShown(false);
    setI(i + 1);
  };
  return (
    <Sheet open onClose={onClose} title={q ? `Question ${i + 1} of ${order.length}` : 'Practice complete'} width={620} full>
      {!q ? <Empty icon="trophy" title={`${score} of ${order.length} correct`} hint="Your results are saved on each question so you can focus on the ones you miss." action={<Button variant="primary" onClick={onClose}>Done</Button>} /> : (
        <div className="flex min-h-[46dvh] flex-col">
          <Progress value={i / order.length} label="Practice progress" />
          <div className="card mt-3 flex-1 !p-5"><div className="text-[1.1rem]"><Markdown text={String(q.title ?? '')} /></div>{shown && <><hr className="my-4 border-line" /><Markdown text={String(q.answer ?? '')} /></>}</div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {!shown ? <Button variant="primary" className="col-span-2 !min-h-12" onClick={() => setShown(true)}>Reveal answer</Button> : <><Button variant="danger" className="!min-h-12" icon="x" onClick={() => void answer(false)}>I got it wrong</Button><Button className="!min-h-12" icon="check" onClick={() => void answer(true)}>I got it right</Button></>}
          </div>
        </div>
      )}
    </Sheet>
  );
}

export default function Learning({ sub }: ModuleProps) {
  const tab = tabFrom(sub, TABS);
  const now = useNow();
  const subjects = useRecords('subjects');
  const courses = useRecords('courses');
  const decks = useRecords('decks');
  const cards = useRecords('flashcards');
  const assignments = useRecords('assignments');
  const exams = useRecords('exams');
  const sessions = useRecords('studySessions');
  const questions = useRecords('questions');
  const goals = useRecords('goals');
  const milestones = useRecords('milestones');
  const tasks = useRecords('tasks');
  const [reviewing, setReviewing] = useState<Rec[] | null>(null);
  const [practising, setPractising] = useState<Rec[] | null>(null);
  const [pane, setPane] = useState<'cards' | 'map' | 'courses' | 'lectures' | 'decks' | 'manage'>('cards');
  const subjectName = (id: unknown) => { const s = subjects.find((x) => x.id === id); return s ? titleOf(s) : ''; };
  const subjectColor = (id: unknown) => (subjects.find((x) => x.id === id)?.color as string) ?? 'var(--violet)';

  const dueCards = useMemo(() => cards.filter((c) => isDue(c.srs as SrsState | null, now)), [cards, now]);
  const upcoming = useMemo(() => [
    ...assignments.filter((a) => a.status !== 'submitted' && a.status !== 'graded' && a.dueAt).map((a) => ({ rec: a, c: 'assignments', kind: 'Assignment', date: parseDate(a.dueAt)! })),
    ...exams.filter((e) => e.dueAt && diffDays(now, parseDate(e.dueAt)!) >= 0).map((e) => ({ rec: e, c: 'exams', kind: 'Exam', date: parseDate(e.dueAt)! })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime()), [assignments, exams, now]);
  const forecast = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const day = addDays(now, i);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
    return { label: i === 0 ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short' }), due: cards.filter((c) => { if (!c.srs) return i === 0; const d = new Date((c.srs as SrsState).due); return i === 0 ? d <= end : ymd(d) === ymd(day); }).length };
  }), [cards, now]);
  const learningGoals = goals.filter((g) => g.area === 'Learning' && g.status === 'active' && !g.archived);
  const weekMinutes = sessions.filter((s) => parseDate(s.date) && parseDate(s.date)! >= startOfWeek(now)).reduce((a, s) => a + (Number(s.minutes) || 0), 0);

  const map = useMemo(() => {
    const nodes: GraphNode[] = subjects.map((s) => ({ id: s.id, label: titleOf(s), color: (s.color as string) ?? 'var(--violet)', weight: 4 }));
    const edges: GraphEdge[] = [];
    const add = (list: Rec[], prefix: string, color: string, parentKey = 'parentId') => { for (const r of list) { nodes.push({ id: r.id, label: `${prefix}${titleOf(r)}`, color, weight: 1 }); if (subjects.some((s) => s.id === r[parentKey])) edges.push({ from: r.id, to: r[parentKey] }); } };
    add(courses, '', 'var(--accent)');
    add(decks, '▤ ', 'var(--good)');
    add(exams, '⏰ ', 'var(--bad)');
    return { nodes, edges };
  }, [subjects, courses, decks, exams]);

  const logStudy = () => openEditor('studySessions', undefined, { date: ymd(), minutes: 30 });
  const NEW: Record<string, [string, string]> = { subjects: ['subjects', 'Subject'], courses: ['courses', 'Course'], flashcards: ['flashcards', 'Card'], assignments: ['assignments', 'Assignment'], exams: ['exams', 'Exam'], reading: ['readings', 'Reading'], practice: ['questions', 'Question'], planner: ['assignments', 'Assignment'], stats: ['studySessions', 'Session'] };

  return (
    <Page module="learning" tabs={TABS} tab={tab} actions={<><Button size="sm" icon="timer" onClick={logStudy}>Log study</Button><Button variant="primary" size="sm" icon="plus" onClick={() => openEditor(NEW[tab][0])}>{NEW[tab][1]}</Button></>}>
      {tab === 'planner' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label="Cards due" value={dueCards.length} icon="layers" tone={dueCards.length ? 'accent' : undefined} onClick={dueCards.length ? () => setReviewing(dueCards) : undefined} sub={dueCards.length ? 'Tap to review' : 'Nothing to review'} />
            <Stat label="Open assignments" value={assignments.filter((a) => a.status !== 'submitted' && a.status !== 'graded').length} icon="file" />
            <Stat label="Next exam" value={upcoming.find((u) => u.c === 'exams') ? `${diffDays(now, upcoming.find((u) => u.c === 'exams')!.date)}d` : '—'} icon="alarm" sub={upcoming.find((u) => u.c === 'exams') ? titleOf(upcoming.find((u) => u.c === 'exams')!.rec) : 'No exams scheduled'} />
            <Stat label="Studied this week" value={fmtDuration(weekMinutes)} icon="timer" />
          </div>
          <Section title="Coming up" icon="calendarDays">
            {upcoming.length === 0 ? <p className="text-sm text-faint">No assignments or exams ahead. Add them and they appear here in date order.</p> : (
              <div className="-mx-2">
                {upcoming.slice(0, 12).map((u) => { const days = diffDays(now, u.date); return (
                  <button key={u.rec.id} type="button" className="row w-full text-left" onClick={() => openEditor(u.c, u.rec.id)}>
                    <span className="h-8 w-1 flex-none rounded-full" style={{ background: subjectColor(u.rec.parentId) }} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{titleOf(u.rec)}</span><span className="block text-xs text-muted">{u.kind}{subjectName(u.rec.parentId) ? ` · ${subjectName(u.rec.parentId)}` : ''} · {fmtDate(u.date)}</span></span>
                    <span className={cx('chip', days < 0 && '!border-bad/40 !text-bad', days >= 0 && days <= 3 && '!border-warn/40 !text-warn')}>{days < 0 ? `${-days}d late` : days === 0 ? 'Today' : `${days}d`}</span>
                  </button>
                ); })}
              </div>
            )}
          </Section>
          <Section title="Revision schedule" icon="repeat"><div className="card"><Bars data={forecast} series={[{ key: 'due', name: 'Cards due' }]} height={150} label="Flashcards due over the next seven days" /></div></Section>
          <Section title="Learning goals" icon="target" action={<Button size="sm" icon="plus" onClick={() => openEditor('goals', undefined, { area: 'Learning', kind: 'short' })}>Goal</Button>}>
            {learningGoals.length === 0 ? <p className="text-sm text-faint">Goals in the Learning area appear here.</p> : <div className="card space-y-3">{learningGoals.map((g) => { const p = goalProgress(g, goals, milestones, tasks); return <button key={g.id} type="button" className="block w-full text-left" onClick={() => openEditor('goals', g.id)}><div className="mb-1 flex text-sm"><span className="min-w-0 flex-1 truncate font-medium">{g.title}</span><span className="num text-muted">{Math.round(p * 100)}%</span></div><Progress value={p} label={`${g.title} progress`} /></button>; })}</div>}
          </Section>
        </div>
      )}

      {tab === 'subjects' && (
        <>
          <div className="mb-3"><Segmented size="sm" label="Subjects view" value={pane === 'map' ? 'map' : 'cards'} onChange={(v) => setPane(v)} options={[{ value: 'cards', label: 'Subjects' }, { value: 'map', label: 'Knowledge map' }]} /></div>
          {pane === 'map' ? <Graph nodes={map.nodes} edges={map.edges} onOpen={(id) => { const c = subjects.some((s) => s.id === id) ? 'subjects' : courses.some((s) => s.id === id) ? 'courses' : decks.some((s) => s.id === id) ? 'decks' : 'exams'; openEditor(c, id); }} emptyTitle="No subjects to map yet" emptyHint="Subjects connect to their courses, decks and exams." /> : subjects.length === 0 ? (
            <Empty icon="book" title="No subjects yet" hint="Subjects organise your courses, flashcards, assignments and exams." action={<Button variant="primary" icon="plus" onClick={() => openEditor('subjects')}>New subject</Button>} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3">
              {subjects.map((s) => { const cov = coverage(s.syllabus); const minutes = sessions.filter((x) => x.parentId === s.id).reduce((a, x) => a + (Number(x.minutes) || 0), 0); return (
                <button key={s.id} type="button" className="card card-hover relative overflow-hidden text-left" onClick={() => openEditor('subjects', s.id)}>
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background: (s.color as string) ?? 'var(--violet)' }} />
                  <h3 className="truncate font-sans font-semibold tracking-normal">{titleOf(s)}</h3>
                  <p className="mt-0.5 text-xs text-muted">{courses.filter((c) => c.parentId === s.id).length} courses · {decks.filter((d) => d.parentId === s.id).length} decks · {fmtDuration(minutes)} studied</p>
                  {cov !== null ? <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-muted"><span>Syllabus covered</span><span className="num">{Math.round(cov * 100)}%</span></div><Progress value={cov} color={s.color as string} label="Syllabus coverage" /></div> : <p className="mt-3 text-xs text-faint">Add syllabus topics to track coverage.</p>}
                </button>
              ); })}
            </div>
          )}
        </>
      )}

      {tab === 'courses' && (
        <>
          <div className="mb-3"><Segmented size="sm" label="Courses or lectures" value={pane === 'lectures' ? 'lectures' : 'courses'} onChange={(v) => setPane(v)} options={[{ value: 'courses', label: 'Courses' }, { value: 'lectures', label: 'Lectures & notes' }]} /></div>
          {pane === 'lectures' ? <CollectionView collection="lectures" emptyHint="Add lectures to a course and keep your notes with each one." /> : <CollectionView collection="courses" />}
        </>
      )}

      {tab === 'flashcards' && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Due now" value={dueCards.length} icon="layers" tone="accent" />
            <Stat label="New" value={cards.filter((c) => isNew(c.srs)).length} />
            <Stat label="Total cards" value={cards.length} />
            <Stat label="Recall" value={cards.reduce((a, c) => a + (Number(c.reviews) || 0), 0) ? `${Math.round((cards.reduce((a, c) => a + (Number(c.correct) || 0), 0) / cards.reduce((a, c) => a + (Number(c.reviews) || 0), 0)) * 100)}%` : '—'} sub="Reviews not graded “Again”" />
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" icon="play" disabled={!dueCards.length} onClick={() => setReviewing(dueCards)}>Review {dueCards.length || ''} due</Button>
            <Segmented size="sm" label="Flashcards view" value={pane === 'manage' ? 'manage' : 'decks'} onChange={(v) => setPane(v)} options={[{ value: 'decks', label: 'Decks' }, { value: 'manage', label: 'All cards' }]} />
            <Button size="sm" icon="plus" onClick={() => openEditor('decks')}>Deck</Button>
          </div>
          {pane === 'manage' ? <CollectionView collection="flashcards" rowExtra={(r) => <span className="chip">{stageLabel(r.srs)}{r.srs && !isDue(r.srs) ? ` · ${fmtInterval(new Date((r.srs as SrsState).due))}` : ''}</span>} /> : decks.length === 0 && cards.length === 0 ? (
            <Empty icon="layers" title="No flashcards yet" hint="Create a deck, add cards, and review a few minutes a day. Scheduling uses the FSRS algorithm." action={<Button variant="primary" icon="plus" onClick={() => openEditor('decks')}>New deck</Button>} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {[...decks, ...(cards.some((c) => !decks.some((d) => d.id === c.parentId)) ? [{ id: '', title: 'Loose cards' } as unknown as Rec] : [])].map((d) => {
                const mine = cards.filter((c) => (d.id ? c.parentId === d.id : !decks.some((x) => x.id === c.parentId)));
                const due = mine.filter((c) => isDue(c.srs as SrsState | null, now));
                return (
                  <div key={d.id || 'loose'} className="card">
                    <div className="flex items-center gap-2"><button type="button" className="min-w-0 flex-1 truncate text-left font-semibold" onClick={() => d.id && openEditor('decks', d.id)}>{titleOf(d)}</button>{subjectName(d.parentId) && <span className="chip">{subjectName(d.parentId)}</span>}</div>
                    <p className="mt-0.5 text-sm text-muted">{mine.length} cards · {due.length} due</p>
                    <div className="mt-3 flex gap-2"><Button size="sm" variant="primary" icon="play" disabled={!due.length} onClick={() => setReviewing(due)}>Review</Button><Button size="sm" icon="plus" onClick={() => openEditor('flashcards', undefined, d.id ? { parentId: d.id } : undefined)}>Add card</Button></div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'assignments' && <CollectionView collection="assignments" />}

      {tab === 'exams' && (
        <>
          {exams.filter((e) => parseDate(e.dueAt) && diffDays(now, parseDate(e.dueAt)!) >= 0).length > 0 && (
            <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3">
              {exams.filter((e) => parseDate(e.dueAt) && diffDays(now, parseDate(e.dueAt)!) >= 0).sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt))).map((e) => { const days = diffDays(now, parseDate(e.dueAt)!); const cov = coverage(e.syllabus); return (
                <button key={e.id} type="button" className="card card-hover text-left" onClick={() => openEditor('exams', e.id)}>
                  <div className="num text-[2.2rem] font-semibold leading-none" style={{ color: days <= 7 ? 'var(--bad)' : days <= 21 ? 'var(--warn)' : 'var(--accent)' }}>{days}<span className="ml-1 text-sm font-normal text-muted">day{days === 1 ? '' : 's'}</span></div>
                  <div className="mt-1.5 truncate font-medium">{titleOf(e)}</div>
                  <div className="text-xs text-muted">{fmtDate(e.dueAt, { year: true, weekday: true })}{subjectName(e.parentId) ? ` · ${subjectName(e.parentId)}` : ''}</div>
                  {cov !== null && <div className="mt-2"><Progress value={cov} label="Syllabus revised" /><div className="mt-1 text-xs text-faint">{Math.round(cov * 100)}% of syllabus revised</div></div>}
                </button>
              ); })}
            </div>
          )}
          <CollectionView collection="exams" views={['list', 'calendar']} emptyHint="Add an exam to get a countdown and a syllabus checklist." />
        </>
      )}

      {tab === 'reading' && <CollectionView collection="readings" emptyHint="Books, papers and articles — set pages to track progress." />}

      {tab === 'practice' && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" icon="play" disabled={!questions.length} onClick={() => setPractising(questions)}>Practise all ({questions.length})</Button>
            <Button icon="refresh" disabled={!questions.some((q) => q.lastResult === 'wrong')} onClick={() => setPractising(questions.filter((q) => q.lastResult === 'wrong'))}>Retry missed ({questions.filter((q) => q.lastResult === 'wrong').length})</Button>
          </div>
          <CollectionView collection="questions" rowExtra={(r) => (Number(r.attempts) > 0 ? <span className={cx('chip', r.lastResult === 'wrong' && '!border-bad/40 !text-bad')}>{Number(r.correct) || 0}/{Number(r.attempts)} correct</span> : <span className="chip">Not attempted</span>)} emptyHint="Write questions with answers, then test yourself." />
        </>
      )}

      {tab === 'stats' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label="Total study time" value={fmtDuration(sessions.reduce((a, s) => a + (Number(s.minutes) || 0), 0))} icon="timer" />
            <Stat label="This week" value={fmtDuration(weekMinutes)} />
            <Stat label="Card reviews" value={cards.reduce((a, c) => a + (Number(c.reviews) || 0), 0)} icon="layers" />
            <Stat label="Practice accuracy" value={questions.reduce((a, q) => a + (Number(q.attempts) || 0), 0) ? `${Math.round((questions.reduce((a, q) => a + (Number(q.correct) || 0), 0) / questions.reduce((a, q) => a + (Number(q.attempts) || 0), 0)) * 100)}%` : '—'} icon="idea" />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="Study time by subject" icon="book"><div className="card"><Bars data={[...subjects.map((s) => ({ label: titleOf(s).slice(0, 12), minutes: sessions.filter((x) => x.parentId === s.id).reduce((a, x) => a + (Number(x.minutes) || 0), 0) })), { label: 'Other', minutes: sessions.filter((x) => !subjects.some((s) => s.id === x.parentId)).reduce((a, x) => a + (Number(x.minutes) || 0), 0) }].filter((d) => d.minutes > 0)} series={[{ key: 'minutes', name: 'Minutes', color: 'var(--violet)' }]} fmt={(v) => fmtDuration(v)} label="Study minutes per subject" /></div></Section>
            <Section title="Study time per week" icon="trending"><div className="card"><Bars data={Array.from({ length: 8 }, (_, i) => { const start = addDays(startOfWeek(now), (i - 7) * 7); const end = addDays(start, 7); return { label: start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), minutes: sessions.filter((s) => parseDate(s.date) && parseDate(s.date)! >= start && parseDate(s.date)! < end).reduce((a, s) => a + (Number(s.minutes) || 0), 0) }; })} series={[{ key: 'minutes', name: 'Minutes' }]} fmt={(v) => fmtDuration(v)} label="Study minutes per week" /></div></Section>
          </div>
          <Section title="Study history" icon="history"><CollectionView collection="studySessions" views={['table', 'list']} addLabel="Log study session" /></Section>
        </div>
      )}
      {reviewing && <ReviewSession cards={reviewing} onClose={() => { setReviewing(null); toast('Review saved', { tone: 'good' }); }} />}
      {practising && <PracticeSession questions={practising} onClose={() => setPractising(null)} />}
    </Page>
  );
}
