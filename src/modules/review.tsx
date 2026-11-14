'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { navigate, openEditor } from '@/core/app';
import type { Rec } from '@/core/data/db';
import { useEnabledModules, useNow, usePrefs, useRecord, useRecords } from '@/core/data/hooks';
import { titleOf, update, upsert } from '@/core/data/store';
import { fmtDate, fmtDuration, relativeDay, ymd } from '@/core/lib/dates';
import { goalProgress } from '@/core/lib/goals';
import { rescheduleTargets, reviewEntryId, reviewStreak, reviewSummary, reviewWeek } from '@/core/lib/review';
import { compareTasks, isOpen, type TaskLike } from '@/core/lib/tasks';
import { useUpcomingEvents } from '@/shell/Shell';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Checkbox, Progress, Stat, cx } from '@/ui/kit';
import { toast } from '@/ui/overlays';
import { deleteWithUndo, toggleTask } from '@/ui/RecordEditor';

const STEPS: { id: string; label: string; icon: IconName; title: string; hint: string }[] = [
  { id: 'wins', label: 'Wins', icon: 'trophy', title: 'Look back at the week', hint: 'Notice what moved. Progress you do not see is progress you do not feel.' },
  { id: 'overdue', label: 'Overdue', icon: 'warning', title: 'Clear what slipped', hint: 'Give every overdue task a new date, finish it, or let it go.' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox', title: 'Decide on loose ends', hint: 'Tasks without a date or project. Schedule them, park them for someday, or delete them.' },
  { id: 'ahead', label: 'Week ahead', icon: 'calendar', title: 'See the week ahead', hint: 'What is already booked and due in the next seven days.' },
  { id: 'goals', label: 'Goals', icon: 'target', title: 'Check in on your goals', hint: 'Is each goal still moving? Open one to update its progress.' },
  { id: 'reflect', label: 'Reflect', icon: 'journal', title: 'Reflect and choose your focus', hint: 'A few lines now make next week clearer. Saved to your journal.' },
];

function Row({ children, title, sub }: { children?: ReactNode; title: string; sub?: ReactNode }) {
  return (
    <div className="row flex-wrap !py-2">
      <span className="min-w-0 flex-1 basis-48"><span className="block truncate text-sm font-medium">{title}</span>{sub && <span className="block truncate text-xs text-faint">{sub}</span>}</span>
      {children && <span className="flex flex-wrap items-center gap-1">{children}</span>}
    </div>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-6 text-sm text-muted"><Icon name="checkCircle" size={18} className="flex-none text-good" />{children}</p>;
}

export function WeeklyReview() {
  const now = useNow();
  const [prefs] = usePrefs();
  const enabled = useEnabledModules();
  const weekStart = prefs.weekStart ?? 1;
  const week = useMemo(() => reviewWeek(now, weekStart), [now, weekStart]);
  const tasks = useRecords('tasks');
  const habits = useRecords('habits');
  const habitLogs = useRecords('habitLogs');
  const focusSessions = useRecords('focusSessions');
  const interactions = useRecords('interactions');
  const goals = useRecords('goals');
  const milestones = useRecords('milestones');
  const journal = useRecords('journal');
  const saved = useRecord(reviewEntryId(week.key));
  const events = useUpcomingEvents(7, 12);
  const s = useMemo(() => reviewSummary({ tasks: tasks as never, habits, habitLogs, focusSessions, interactions }, now, week), [tasks, habits, habitLogs, focusSessions, interactions, now, week]);
  const streak = reviewStreak(journal, now, weekStart);
  const targets = rescheduleTargets(now, weekStart);

  const [step, setStep] = useState(0);
  const [wins, setWins] = useState('');
  const [lessons, setLessons] = useState('');
  const [focus, setFocus] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    if (!saved || saved.deletedAt) return;
    setWins(String(saved.wins ?? ''));
    setLessons(String(saved.lessons ?? ''));
    setFocus(String(saved.focus ?? ''));
    setPicked(Array.isArray(saved.priorities) ? (saved.priorities as string[]) : []);
  }, [saved?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeGoals = goals.filter((g) => g.status === 'active' && !g.archived && g.kind !== 'keyResult');
  const candidates = useMemo(() => tasks.filter((t) => isOpen(t as TaskLike) && !t.parentId).sort((a, b) => compareTasks(a as TaskLike, b as TaskLike)).slice(0, 12), [tasks]);
  const weekLabel = `${fmtDate(week.start)} – ${fmtDate(new Date(week.end.getTime() - 1))}`;
  const reviewed = !!saved && !saved.deletedAt;

  const move = (t: Rec, dueAt: string, label: string) => void update(t.id, { dueAt }).then(() => toast(`“${titleOf(t)}” moved to ${label}`, { tone: 'good' }));
  const save = async () => {
    const chosen = candidates.filter((t) => picked.includes(t.id));
    const lines = [
      `## Week of ${weekLabel}`,
      `Completed ${s.completed.length} task${s.completed.length === 1 ? '' : 's'}${s.focusMinutes ? `, focused ${fmtDuration(s.focusMinutes)}` : ''}${s.habitConsistency !== null ? `, habits ${Math.round(s.habitConsistency * 100)}%` : ''}.`,
      wins.trim() && `**What went well**\n${wins.trim()}`,
      lessons.trim() && `**What I learned**\n${lessons.trim()}`,
      focus.trim() && `**Focus for next week**\n${focus.trim()}`,
      chosen.length ? `**Priorities**\n${chosen.map((t) => `- ${titleOf(t)}`).join('\n')}` : '',
    ].filter(Boolean);
    await upsert('journal', reviewEntryId(week.key), {
      date: ymd(now), kind: 'weekly', week: week.key, title: `Weekly review · ${weekLabel}`, content: lines.join('\n\n'),
      wins, lessons, focus, priorities: picked, completedCount: s.completed.length,
    });
    for (const t of chosen) if ((Number(t.priority) || 0) < 3) await update(t.id, { priority: 3 });
    toast(reviewed ? 'Weekly review updated' : 'Weekly review saved to your journal', { tone: 'good', icon: 'checkCircle' });
    setStep(0);
  };

  const current = STEPS[step];
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <span className="tile size-11"><Icon name="checklist" size={20} /></span>
        <div className="min-w-0 flex-1 basis-56">
          <div className="font-semibold">Weekly review · {weekLabel}</div>
          <div className="text-sm text-muted">{reviewed ? `Done ${relativeDay(saved!.date, now).toLowerCase() === 'today' ? 'today' : `on ${fmtDate(saved!.date, { weekday: true })}`} — open any step to adjust it.` : 'About ten minutes. Step through it in order, or jump to any step.'}</div>
        </div>
        {streak > 0 && <span className="chip chip-accent"><Icon name="flame" size={13} />{streak} week{streak === 1 ? '' : 's'} in a row</span>}
      </div>

      <nav aria-label="Review steps" className="scroll-edges no-scrollbar flex gap-1.5 overflow-x-auto">
        {STEPS.map((st, i) => (
          <button
            key={st.id} type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}
            className={cx('chip !h-9 flex-none gap-1.5 !px-3 !text-[0.82rem]', i === step ? 'chip-accent' : i < step ? '!text-text' : '')}
          >
            <span className={cx('grid size-5 place-items-center rounded-full text-[0.68rem] font-bold', i === step ? 'bg-accent text-accent-ink' : i < step ? 'bg-good/25 text-good' : 'bg-surface-3')}>{i < step ? '✓' : i + 1}</span>
            {st.label}
          </button>
        ))}
      </nav>

      <section className="card space-y-4" aria-labelledby="review-step-title">
        <div>
          <h2 id="review-step-title" className="flex items-center gap-2 text-lg font-semibold"><Icon name={current.icon} size={19} className="text-accent" />{current.title}</h2>
          <p className="text-sm text-muted">{current.hint}</p>
        </div>

        {current.id === 'wins' && (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Tasks completed" value={s.completed.length} icon="checkCircle" tone="good" sub={`${s.created} added this week`} />
              {enabled.has('focus') && <Stat label="Focus time" value={fmtDuration(s.focusMinutes)} icon="timer" />}
              {enabled.has('habits') && <Stat label="Habit consistency" value={s.habitConsistency === null ? '—' : `${Math.round(s.habitConsistency * 100)}%`} icon="repeat" />}
              {enabled.has('people') && <Stat label="Catch-ups" value={s.catchUps} icon="heart" />}
            </div>
            {s.completed.length > 0 ? (
              <ul className="grid gap-1 sm:grid-cols-2">{s.completed.slice(0, 12).map((t) => <li key={t.id} className="flex items-center gap-2 text-sm"><Icon name="check" size={14} className="flex-none text-good" /><span className="truncate">{titleOf(t as Rec)}</span></li>)}</ul>
            ) : <p className="text-sm text-faint">No tasks completed in this week. That happens — the next steps make next week easier.</p>}
          </>
        )}

        {current.id === 'overdue' && (s.overdue.length === 0 ? <Quiet>Nothing overdue. Nicely done.</Quiet> : (
          <div className="-mx-2">
            {s.overdue.map((t) => (
              <Row key={t.id} title={titleOf(t as Rec)} sub={`Was due ${relativeDay(t.dueAt, now).toLowerCase()}`}>
                <Button size="sm" onClick={() => move(t as Rec, targets.tomorrow, 'tomorrow')}>Tomorrow</Button>
                <Button size="sm" onClick={() => move(t as Rec, targets.nextWeek, 'next week')}>Next week</Button>
                <Button size="sm" icon="check" onClick={() => void toggleTask(t as Rec)}>Done</Button>
                <Button size="sm" variant="ghost" icon="trash" aria-label={`Delete ${titleOf(t as Rec)}`} onClick={() => void deleteWithUndo(t as Rec)} />
              </Row>
            ))}
          </div>
        ))}

        {current.id === 'inbox' && (s.inbox.length === 0 ? <Quiet>Every task has a date, a project or a “someday” tag.</Quiet> : (
          <div className="-mx-2">
            {s.inbox.slice(0, 25).map((t) => (
              <Row key={t.id} title={titleOf(t as Rec)} sub={`Added ${relativeDay(new Date(t._ca ?? Date.now()), now).toLowerCase()}`}>
                <Button size="sm" onClick={() => move(t as Rec, targets.tomorrow, 'tomorrow')}>Tomorrow</Button>
                <Button size="sm" onClick={() => move(t as Rec, targets.nextWeek, 'next week')}>Next week</Button>
                <Button size="sm" onClick={() => void update(t.id, { tags: [...new Set([...(t.tags ?? []), 'someday'])] }).then(() => toast('Parked for someday'))}>Someday</Button>
                <Button size="sm" variant="ghost" icon="pencil" aria-label={`Edit ${titleOf(t as Rec)}`} onClick={() => openEditor('tasks', t.id)} />
                <Button size="sm" variant="ghost" icon="trash" aria-label={`Delete ${titleOf(t as Rec)}`} onClick={() => void deleteWithUndo(t as Rec)} />
              </Row>
            ))}
            {s.inbox.length > 25 && <p className="px-2 pt-2 text-xs text-faint">{s.inbox.length - 25} more in Tasks.</p>}
          </div>
        ))}

        {current.id === 'ahead' && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="eyebrow mb-1.5">Due in the next 7 days</h3>
              {s.upcoming.length === 0 ? <p className="text-sm text-faint">Nothing due yet.</p> : s.upcoming.slice(0, 12).map((t) => <Row key={t.id} title={titleOf(t as Rec)} sub={relativeDay(t.dueAt, now)} />)}
            </div>
            {enabled.has('calendar') && (
              <div>
                <h3 className="eyebrow mb-1.5">On the calendar</h3>
                {events.length === 0 ? <p className="text-sm text-faint">No events in the next 7 days.</p> : events.map((e) => <Row key={e.id} title={titleOf(e.rec)} sub={`${relativeDay(e.at, now)}${e.rec.allDay ? '' : ` · ${e.at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}`} />)}
              </div>
            )}
          </div>
        )}

        {current.id === 'goals' && (activeGoals.length === 0 ? <Quiet>No active goals. Set one in Goals when you are ready.</Quiet> : (
          <div className="space-y-2">
            {activeGoals.slice(0, 10).map((g) => {
              const p = goalProgress(g as never, goals as never, milestones as never, tasks as never);
              return (
                <button key={g.id} type="button" className="row w-full text-left" onClick={() => openEditor('goals', g.id)}>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{titleOf(g)}</span><Progress value={p} className="mt-1.5" label={`${titleOf(g)} progress`} /></span>
                  <span className="num w-12 flex-none text-right text-sm">{Math.round(p * 100)}%</span>
                </button>
              );
            })}
          </div>
        ))}

        {current.id === 'reflect' && (
          <div className="space-y-4">
            <label className="block"><span className="label">What went well?</span><textarea className="input min-h-20" value={wins} onChange={(e) => setWins(e.target.value)} placeholder="Small wins count." /></label>
            <label className="block"><span className="label">What did you learn, or would you do differently?</span><textarea className="input min-h-20" value={lessons} onChange={(e) => setLessons(e.target.value)} /></label>
            <label className="block"><span className="label">What matters most next week?</span><textarea className="input min-h-16" value={focus} onChange={(e) => setFocus(e.target.value)} /></label>
            {candidates.length > 0 && (
              <fieldset>
                <legend className="label">Pick up to three priorities ({picked.length}/3) — they are marked high priority</legend>
                <div className="-mx-2">
                  {candidates.map((t) => {
                    const on = picked.includes(t.id);
                    return (
                      <div key={t.id} className="row !py-1.5">
                        <Checkbox checked={on} label={`Priority: ${titleOf(t)}`} onChange={() => setPicked(on ? picked.filter((x) => x !== t.id) : picked.length < 3 ? [...picked, t.id] : picked)} />
                        <span className={cx('min-w-0 flex-1 truncate text-sm', !on && picked.length >= 3 && 'text-faint')}>{titleOf(t)}</span>
                        {t.dueAt && <span className="flex-none text-xs text-faint">{relativeDay(t.dueAt, now)}</span>}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-line pt-3">
          {step > 0 && <Button variant="ghost" icon="arrowLeft" onClick={() => setStep(step - 1)}>Back</Button>}
          <span className="flex-1" />
          {step < STEPS.length - 1
            ? <Button variant="primary" onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1].label}</Button>
            : <Button variant="primary" icon="check" onClick={() => void save()}>{reviewed ? 'Update review' : 'Finish review'}</Button>}
        </div>
      </section>
      {reviewed && enabled.has('journal') && <button type="button" className="text-sm text-accent" onClick={() => navigate('/journal/entries')}>See past reviews in your journal</button>}
    </div>
  );
}
