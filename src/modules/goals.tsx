'use client';

import { useMemo, useState } from 'react';
import { openEditor } from '@/core/app';
import { GOAL_STATUSES } from '@/core/collections';
import type { Rec } from '@/core/data/db';
import { useRecords } from '@/core/data/hooks';
import { create, update } from '@/core/data/store';
import { diffDays, fmtDate, parseDate, ymd } from '@/core/lib/dates';
import { goalProgress, progressSource } from '@/core/lib/goals';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { CollectionView } from '@/ui/CollectionView';
import { Icon } from '@/ui/icons';
import { Button, Empty, IconButton, Progress, Ring, Section, Segmented, Stat, cx } from '@/ui/kit';
import { toast } from '@/ui/overlays';

const TABS = [
  { value: 'goals', label: 'Goals', icon: 'target' as const }, { value: 'okrs', label: 'OKRs', icon: 'gauge' as const }, { value: 'milestones', label: 'Milestones', icon: 'flag' as const },
  { value: 'vision', label: 'Vision board', icon: 'sparkles' as const }, { value: 'reviews', label: 'Reviews', icon: 'history' as const }, { value: 'achievements', label: 'Achievements', icon: 'trophy' as const },
];
const KIND_LABEL: Record<string, string> = { long: 'Long-term', short: 'Short-term', objective: 'Objective', keyResult: 'Key result', plan: 'Improvement plan' };

/** Mark a goal achieved and offer to record the achievement. */
async function achieve(goal: Rec) {
  await update(goal.id, { status: 'achieved', progress: 1 });
  toast(`“${goal.title}” achieved 🎉`, { tone: 'good', duration: 8000, action: { label: 'Record achievement', run: () => void create('achievements', { title: String(goal.title), date: ymd(), goalId: goal.id, area: goal.area ?? null }).then((r) => openEditor('achievements', r.id)) } });
}

function GoalRow({ goal, all, milestones, tasks, depth = 0 }: { goal: Rec; all: Rec[]; milestones: Rec[]; tasks: Rec[]; depth?: number }) {
  const p = goalProgress(goal, all, milestones, tasks);
  const children = all.filter((g) => g.parentId === goal.id && !g.archived);
  const days = parseDate(goal.targetDate) ? diffDays(new Date(), parseDate(goal.targetDate)!) : null;
  const status = GOAL_STATUSES.find((s) => s.value === goal.status);
  return (
    <div style={{ marginLeft: Math.min(depth, 4) * 18 }}>
      <div className={cx('card card-hover mb-2 flex items-center gap-3 !py-3', goal.status === 'dropped' && 'opacity-55')}>
        <Ring value={p} size={46} stroke={5} color={status?.color} label={`${Math.round(p * 100)}%`}><span className="num text-[0.7rem] font-semibold">{Math.round(p * 100)}</span></Ring>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEditor('goals', goal.id)}>
          <span className="block truncate font-medium">{goal.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted">
            <span>{KIND_LABEL[goal.kind as string] ?? 'Goal'}</span>
            {goal.area && <span>{goal.area}</span>}
            <span className="text-faint">{progressSource(goal, all, milestones, tasks)}</span>
            {days !== null && goal.status === 'active' && <span className={days < 0 ? 'text-bad' : days <= 14 ? 'text-warn' : ''}>{days < 0 ? `${-days}d overdue` : `${days}d left`}</span>}
            {goal.status !== 'active' && status && <span style={{ color: status.color }}>{status.label}</span>}
          </span>
        </button>
        {goal.status === 'active' && <IconButton icon="checkCircle" label={`Mark ${goal.title} achieved`} onClick={() => void achieve(goal)} />}
        <IconButton icon="plus" label={`Add a goal that supports ${goal.title}`} onClick={() => openEditor('goals', undefined, { parentId: goal.id, area: goal.area ?? null, kind: goal.kind === 'objective' ? 'keyResult' : 'short' })} />
      </div>
      {depth < 5 && children.map((c) => <GoalRow key={c.id} goal={c} all={all} milestones={milestones} tasks={tasks} depth={depth + 1} />)}
    </div>
  );
}

function KeyResult({ kr }: { kr: Rec }) {
  const target = Number(kr.targetValue) || 0;
  const current = Number(kr.currentValue) || 0;
  const stepSize = target >= 100 ? Math.round(target / 20) : 1;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line py-2.5">
      <button type="button" className="min-w-0 flex-1 basis-40 text-left" onClick={() => openEditor('goals', kr.id)}>
        <span className={cx('block truncate text-sm', kr.status === 'achieved' && 'text-faint line-through')}>{kr.title}</span>
        <Progress value={target ? current / target : Number(kr.progress) || 0} className="mt-1.5" label={`${kr.title} progress`} />
      </button>
      {target > 0 ? (
        <div className="flex flex-none items-center gap-1">
          <IconButton icon="minus" label={`Decrease ${kr.title}`} className="!size-8" onClick={() => void update(kr.id, { currentValue: Math.max(0, current - stepSize) }, { silent: true })} />
          <span className="num w-24 text-center text-sm">{current.toLocaleString()} / {target.toLocaleString()}{kr.unit ? ` ${kr.unit}` : ''}</span>
          <IconButton icon="plus" label={`Increase ${kr.title}`} className="!size-8" onClick={() => void update(kr.id, { currentValue: current + stepSize }, { silent: true })} />
        </div>
      ) : <span className="text-xs text-faint">Set a target value to track this</span>}
    </div>
  );
}

export default function Goals({ sub }: ModuleProps) {
  const tab = tabFrom(sub, TABS);
  const goals = useRecords('goals');
  const milestones = useRecords('milestones');
  const tasks = useRecords('tasks');
  const achievementCount = useRecords('achievements').length;
  const [filter, setFilter] = useState<'active' | 'all' | 'long' | 'short' | 'plan'>('active');
  const live = useMemo(() => goals.filter((g) => !g.archived), [goals]);
  const ids = useMemo(() => new Set(live.map((g) => g.id)), [live]);
  const roots = live.filter((g) => g.kind !== 'keyResult' && g.kind !== 'objective' && (!g.parentId || !ids.has(g.parentId)))
    .filter((g) => (filter === 'all' ? true : filter === 'active' ? g.status === 'active' : g.kind === filter))
    .sort((a, b) => String(a.targetDate ?? '9').localeCompare(String(b.targetDate ?? '9')));
  const objectives = live.filter((g) => g.kind === 'objective');
  const tracked = live.filter((g) => g.kind !== 'keyResult');
  const active = tracked.filter((g) => g.status === 'active');
  const avg = active.length ? active.reduce((a, g) => a + goalProgress(g, live, milestones, tasks), 0) / active.length : 0;

  return (
    <Page module="goals" tabs={TABS} tab={tab} actions={<Button variant="primary" size="sm" icon="plus" onClick={() => openEditor(tab === 'vision' ? 'visionItems' : tab === 'reviews' ? 'reviews' : tab === 'achievements' ? 'achievements' : tab === 'milestones' ? 'milestones' : 'goals', undefined, tab === 'okrs' ? { kind: 'objective' } : undefined)}>{tab === 'okrs' ? 'Objective' : tab === 'vision' ? 'Vision card' : tab === 'reviews' ? 'Review' : tab === 'achievements' ? 'Achievement' : tab === 'milestones' ? 'Milestone' : 'Goal'}</Button>}>
      {tab === 'goals' && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Active" value={active.length} icon="target" />
            <Stat label="Average progress" value={`${Math.round(avg * 100)}%`} icon="trending" tone="accent" />
            <Stat label="Achieved" value={tracked.filter((g) => g.status === 'achieved').length} icon="trophy" tone="good" />
            <Stat label="Due in 30 days" value={active.filter((g) => parseDate(g.targetDate) && diffDays(new Date(), parseDate(g.targetDate)!) <= 30).length} icon="alarm" />
          </div>
          <div className="mb-3"><Segmented size="sm" label="Filter goals" value={filter} onChange={setFilter} options={[{ value: 'active', label: 'Active' }, { value: 'long', label: 'Long-term' }, { value: 'short', label: 'Short-term' }, { value: 'plan', label: 'Plans' }, { value: 'all', label: 'All' }]} /></div>
          {roots.length === 0 ? <Empty icon="target" title="No goals here yet" hint="Set a goal, then add milestones, linked tasks or sub-goals — progress is calculated for you." action={<Button variant="primary" icon="plus" onClick={() => openEditor('goals')}>New goal</Button>} /> : roots.map((g) => <GoalRow key={g.id} goal={g} all={live} milestones={milestones} tasks={tasks} />)}
        </>
      )}
      {tab === 'okrs' && (
        objectives.length === 0 ? <Empty icon="gauge" title="No objectives yet" hint="An objective says where you want to be. Key results are the numbers that prove you got there." action={<Button variant="primary" icon="plus" onClick={() => openEditor('goals', undefined, { kind: 'objective' })}>New objective</Button>} /> : (
          <div className="space-y-3">
            {objectives.map((o) => {
              const krs = live.filter((g) => g.parentId === o.id);
              const p = goalProgress(o, live, milestones, tasks);
              return (
                <div key={o.id} className="card">
                  <div className="flex items-center gap-3 pb-2.5">
                    <Ring value={p} size={50} stroke={5} label={`${Math.round(p * 100)}%`}><span className="num text-xs font-semibold">{Math.round(p * 100)}%</span></Ring>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEditor('goals', o.id)}><span className="block truncate text-[1.02rem] font-semibold">{o.title}</span><span className="text-xs text-muted">{krs.length} key result{krs.length === 1 ? '' : 's'}{o.targetDate ? ` · by ${fmtDate(o.targetDate, { year: true })}` : ''}</span></button>
                    <Button size="sm" icon="plus" onClick={() => openEditor('goals', undefined, { kind: 'keyResult', parentId: o.id, targetValue: 100, currentValue: 0 })}>Key result</Button>
                  </div>
                  {krs.length === 0 ? <p className="border-t border-line pt-2.5 text-sm text-faint">Add 2–4 measurable key results.</p> : krs.map((kr) => <KeyResult key={kr.id} kr={kr} />)}
                </div>
              );
            })}
          </div>
        )
      )}
      {tab === 'milestones' && <CollectionView collection="milestones" filter={(r) => !!r.goalId} emptyHint="Milestones linked to a goal drive that goal’s progress. Open a goal’s milestone and choose the goal." />}
      {tab === 'vision' && <CollectionView collection="visionItems" emptyHint="Describe the life you are building — one card per picture in your head." />}
      {tab === 'reviews' && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {(['weekly', 'monthly', 'yearly'] as const).map((period) => <Button key={period} size="sm" icon="history" onClick={() => openEditor('reviews', undefined, { period, date: ymd(), title: `${period === 'yearly' ? new Date().getFullYear() : new Date().toLocaleDateString(undefined, period === 'monthly' ? { month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' })} ${period} review` })}>Start {period} review</Button>)}
          </div>
          <CollectionView collection="reviews" emptyHint="A review captures wins, challenges, lessons and your focus for the next period." />
        </>
      )}
      {tab === 'achievements' && (
        <>
          <Section className="mb-3"><p className="text-sm text-muted"><Icon name="trophy" size={14} className="mr-1 inline text-warn" />{achievementCount} recorded. Achieving a goal offers to add it here.</p></Section>
          <CollectionView collection="achievements" />
        </>
      )}
    </Page>
  );
}
