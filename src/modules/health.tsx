'use client';

import { useMemo, useState } from 'react';
import { addWater } from '@/core/actions';
import { openEditor } from '@/core/app';
import type { Rec } from '@/core/data/db';
import { useNow, usePrefs, useRecords } from '@/core/data/hooks';
import { create, getRec, titleOf } from '@/core/data/store';
import { addDays, fmtDate, fmtDuration, parseDate, startOfWeek, ymd } from '@/core/lib/dates';
import { goalProgress } from '@/core/lib/goals';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { Bars, Lines } from '@/ui/charts';
import { CollectionView } from '@/ui/CollectionView';
import type { SetRow } from '@/ui/fields';
import { Icon } from '@/ui/icons';
import { Button, Progress, Ring, Section, Stat } from '@/ui/kit';
import { toast } from '@/ui/overlays';

const TABS = [
  { value: 'overview', label: 'Overview', icon: 'health' as const }, { value: 'workouts', label: 'Workouts', icon: 'dumbbell' as const }, { value: 'plans', label: 'Plans', icon: 'checklist' as const },
  { value: 'library', label: 'Exercises', icon: 'activity' as const }, { value: 'body', label: 'Body', icon: 'gauge' as const }, { value: 'sleep', label: 'Sleep', icon: 'moon' as const },
  { value: 'meals', label: 'Meals', icon: 'heart' as const }, { value: 'cardio', label: 'Walks & runs', icon: 'trending' as const },
];

const STARTER_EXERCISES: [string, string, string][] = [
  ['Squat', 'Legs', 'Barbell'], ['Deadlift', 'Back', 'Barbell'], ['Bench press', 'Chest', 'Barbell'], ['Overhead press', 'Shoulders', 'Barbell'], ['Barbell row', 'Back', 'Barbell'],
  ['Pull-up', 'Back', 'Bodyweight'], ['Push-up', 'Chest', 'Bodyweight'], ['Lunge', 'Legs', 'Dumbbells'], ['Romanian deadlift', 'Legs', 'Barbell'], ['Leg press', 'Legs', 'Machine'],
  ['Lat pulldown', 'Back', 'Machine'], ['Dumbbell curl', 'Arms', 'Dumbbells'], ['Triceps dip', 'Arms', 'Bodyweight'], ['Lateral raise', 'Shoulders', 'Dumbbells'], ['Plank', 'Core', 'Bodyweight'],
  ['Hanging leg raise', 'Core', 'Bodyweight'], ['Hip thrust', 'Legs', 'Barbell'], ['Calf raise', 'Legs', 'Bodyweight'], ['Burpee', 'Full body', 'Bodyweight'], ['Kettlebell swing', 'Full body', 'Kettlebell'],
];

export const workoutVolume = (w: Rec) => ((w.sets as SetRow[] | undefined) ?? []).reduce((a, s) => a + (Number(s.sets) || 0) * (Number(s.reps) || 0) * (Number(s.weight) || 0), 0);

async function addStarterLibrary() {
  let added = 0;
  for (const [title, muscle, equipment] of STARTER_EXERCISES) {
    const id = `seed:exercise:${title.toLowerCase().replace(/[^a-z]+/g, '-')}`; // stable ids: adding on two devices does not duplicate
    if (await getRec(id)) continue;
    await create('exercises', { title, muscle, equipment }, { id, silent: true });
    added++;
  }
  toast(added ? `${added} exercises added` : 'The starter library is already there', { tone: 'good' });
}

export default function Health({ sub }: ModuleProps) {
  const tab = tabFrom(sub, TABS);
  const now = useNow();
  const [prefs] = usePrefs();
  const workouts = useRecords('workouts');
  const plans = useRecords('workoutPlans');
  const exercises = useRecords('exercises');
  const body = useRecords('bodyLogs');
  const water = useRecords('waterLogs');
  const sleep = useRecords('sleepLogs');
  const meals = useRecords('meals');
  const cardio = useRecords('cardio');
  const goals = useRecords('goals');
  const milestones = useRecords('milestones');
  const tasks = useRecords('tasks');
  const [measure, setMeasure] = useState('weight');
  const today = ymd(now);
  const weekStart = startOfWeek(now, prefs.weekStart);
  const inWeek = (r: Rec) => parseDate(r.date) && parseDate(r.date)! >= weekStart;

  const waterToday = Number(water.find((w) => w.id === `wl:${today}`)?.value ?? 0);
  const weekWorkouts = workouts.filter((w) => inWeek(w) && w.type !== 'rest');
  const restDays = workouts.filter((w) => inWeek(w) && w.type === 'rest').length;
  const series = (kind: string) => body.filter((b) => b.kind === kind && b.date).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-40).map((b) => ({ label: fmtDate(b.date), value: Number(b.value) }));
  const weight = series('weight');
  const lastSleep = [...sleep].filter((s) => s.date).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 7);
  const avgSleep = lastSleep.length ? lastSleep.reduce((a, s) => a + (Number(s.value) || 0), 0) / lastSleep.length : 0;
  const mealsToday = meals.filter((m) => m.date === today);
  const fitnessGoals = goals.filter((g) => (g.area === 'Fitness' || g.area === 'Health') && g.status === 'active' && !g.archived);
  const weeklyWorkouts = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const start = addDays(startOfWeek(now), (i - 7) * 7);
    const end = addDays(start, 7);
    const list = workouts.filter((w) => w.type !== 'rest' && parseDate(w.date) && parseDate(w.date)! >= start && parseDate(w.date)! < end);
    return { label: start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), workouts: list.length, minutes: list.reduce((a, w) => a + (Number(w.minutes) || 0), 0) };
  }), [workouts, now]);

  const startFromPlan = async (plan: Rec) => openEditor('workouts', (await create('workouts', { title: titleOf(plan), date: today, type: 'workout', planId: plan.id, sets: plan.sets ?? [] })).id);
  const NEW: Record<string, [string, string]> = { overview: ['workouts', 'Workout'], workouts: ['workouts', 'Workout'], plans: ['workoutPlans', 'Plan'], library: ['exercises', 'Exercise'], body: ['bodyLogs', 'Measurement'], sleep: ['sleepLogs', 'Sleep'], meals: ['meals', 'Meal'], cardio: ['cardio', 'Activity'] };

  return (
    <Page module="health" tabs={TABS} tab={tab} actions={<Button variant="primary" size="sm" icon="plus" onClick={() => openEditor(NEW[tab][0], undefined, tab === 'body' ? { kind: measure, unit: measure === 'weight' ? 'kg' : measure === 'bodyFat' ? '%' : 'cm' } : undefined)}>{NEW[tab][1]}</Button>}>
      {tab === 'overview' && (
        <div className="space-y-5">
          <p className="rounded-xl border border-line bg-surface px-3 py-2 text-xs text-muted"><Icon name="info" size={13} className="mr-1 inline" />LIFEOS helps you track and organise. It does not diagnose, treat or give medical advice — talk to a professional about health decisions.</p>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <div className="card">
              <div className="flex items-center gap-4">
                <Ring value={prefs.waterTarget ? waterToday / prefs.waterTarget : 0} size={84} stroke={7} color="#38bdf8" label="Water goal progress"><Icon name="droplets" size={22} className="text-[#38bdf8]" /></Ring>
                <div className="min-w-0 flex-1"><div className="text-sm text-muted">Water today</div><div className="num text-2xl font-semibold">{(waterToday / 1000).toFixed(2)} L</div><div className="text-xs text-faint">of {(prefs.waterTarget / 1000).toFixed(1)} L · {Math.round(waterToday / 250)} glasses</div></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" icon="plus" onClick={() => void addWater(250)}>Glass (250 ml)</Button>
                <Button size="sm" icon="plus" onClick={() => void addWater(500)}>Bottle (500 ml)</Button>
                <Button size="sm" variant="ghost" icon="minus" disabled={waterToday <= 0} onClick={() => void addWater(-250)}>Undo</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Workouts this week" value={weekWorkouts.length} icon="dumbbell" sub={`${fmtDuration(weekWorkouts.reduce((a, w) => a + (Number(w.minutes) || 0), 0))} trained`} />
              <Stat label="Rest days" value={restDays} icon="moon" sub="This week" />
              <Stat label="Average sleep" value={avgSleep ? `${avgSleep.toFixed(1)} h` : '—'} icon="moon" sub="Last 7 entries" />
              <Stat label="Distance this week" value={`${cardio.filter(inWeek).reduce((a, c) => a + (Number(c.value) || 0), 0).toFixed(1)} km`} icon="trending" />
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="Workouts per week" icon="chart"><div className="card"><Bars data={weeklyWorkouts} series={[{ key: 'workouts', name: 'Workouts', color: 'var(--bad)' }]} height={170} label="Workouts per week" /></div></Section>
            <Section title="Weight trend" icon="gauge" action={<Button size="sm" icon="plus" onClick={() => openEditor('bodyLogs', undefined, { kind: 'weight', unit: 'kg' })}>Log weight</Button>}><div className="card"><Lines data={weight} series={[{ key: 'value', name: 'Weight' }]} height={170} fmt={(v) => `${v}`} label="Weight over time" /></div></Section>
          </div>
          <Section title="Fitness goals" icon="target" action={<Button size="sm" icon="plus" onClick={() => openEditor('goals', undefined, { area: 'Fitness', kind: 'short' })}>Goal</Button>}>
            {fitnessGoals.length === 0 ? <p className="text-sm text-faint">Goals in the Fitness or Health area appear here.</p> : <div className="card space-y-3">{fitnessGoals.map((g) => { const p = goalProgress(g, goals, milestones, tasks); return <button key={g.id} type="button" className="block w-full text-left" onClick={() => openEditor('goals', g.id)}><div className="mb-1 flex text-sm"><span className="min-w-0 flex-1 truncate font-medium">{g.title}</span><span className="num text-muted">{Math.round(p * 100)}%</span></div><Progress value={p} label={`${g.title} progress`} /></button>; })}</div>}
          </Section>
        </div>
      )}
      {tab === 'workouts' && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button size="sm" icon="moon" onClick={() => void create('workouts', { title: 'Rest day', date: today, type: 'rest' }).then(() => toast('Rest day logged', { tone: 'good' }))}>Log rest day</Button>
            {plans.slice(0, 3).map((p) => <Button key={p.id} size="sm" icon="play" onClick={() => void startFromPlan(p)}>Start “{titleOf(p)}”</Button>)}
          </div>
          <CollectionView collection="workouts" rowExtra={(r) => (workoutVolume(r) > 0 ? <span className="chip"><Icon name="dumbbell" size={12} />{Math.round(workoutVolume(r)).toLocaleString()} kg volume</span> : null)} emptyHint="Log a workout with its exercises, sets, reps and weight." />
        </>
      )}
      {tab === 'plans' && (
        <>
          {plans.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{plans.map((p) => <Button key={p.id} size="sm" icon="play" onClick={() => void startFromPlan(p)}>Start “{titleOf(p)}”</Button>)}</div>}
          <CollectionView collection="workoutPlans" emptyHint="Build a reusable plan, then start a workout from it in one tap." />
        </>
      )}
      {tab === 'library' && (
        <>
          {!exercises.some((e) => e.id.startsWith('seed:')) && <div className="card mb-3 flex flex-wrap items-center gap-3"><span className="min-w-0 flex-1 basis-52 text-sm text-muted">Start with a library of {STARTER_EXERCISES.length} common exercises grouped by muscle. You can edit or delete any of them.</span><Button icon="download" onClick={() => void addStarterLibrary()}>Add starter library</Button></div>}
          <CollectionView collection="exercises" emptyHint="Exercises you add here are suggested when you log a workout." />
        </>
      )}
      {tab === 'body' && (
        <>
          <div className="card mb-3">
            <div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="flex-1 font-sans text-sm font-semibold tracking-normal">Trend</h3>
              <select className="input !min-h-9 !w-auto !py-1 text-sm" aria-label="Measurement" value={measure} onChange={(e) => setMeasure(e.target.value)}>{[['weight', 'Weight'], ['bodyFat', 'Body fat'], ['waist', 'Waist'], ['chest', 'Chest'], ['hips', 'Hips'], ['arm', 'Arm'], ['thigh', 'Thigh']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </div>
            <Lines data={series(measure)} series={[{ key: 'value', name: measure }]} fmt={(v) => `${v}`} label={`${measure} over time`} />
          </div>
          <CollectionView collection="bodyLogs" defaults={{ kind: measure }} />
        </>
      )}
      {tab === 'sleep' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><Stat label="Average (7 entries)" value={avgSleep ? `${avgSleep.toFixed(1)} h` : '—'} icon="moon" /><Stat label="Entries" value={sleep.length} /><Stat label="Average quality" value={lastSleep.filter((s) => s.quality).length ? `${(lastSleep.reduce((a, s) => a + (Number(s.quality) || 0), 0) / lastSleep.filter((s) => s.quality).length).toFixed(1)} / 5` : '—'} icon="star" /></div>
          <div className="card mb-3"><Bars data={[...sleep].filter((s) => s.date).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-14).map((s) => ({ label: fmtDate(s.date), hours: Number(s.value) || 0 }))} series={[{ key: 'hours', name: 'Hours', color: 'var(--violet)' }]} height={160} fmt={(v) => `${v}h`} label="Hours slept, last 14 entries" /></div>
          <CollectionView collection="sleepLogs" />
        </>
      )}
      {tab === 'meals' && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2"><Stat label="Meals today" value={mealsToday.length} icon="heart" /><Stat label="Calories today" value={mealsToday.reduce((a, m) => a + (Number(m.calories) || 0), 0).toLocaleString()} sub="From entries with calories" /><Stat label="Protein today" value={`${mealsToday.reduce((a, m) => a + (Number(m.protein) || 0), 0)} g`} /></div>
          <CollectionView collection="meals" />
        </>
      )}
      {tab === 'cardio' && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2"><Stat label="This week" value={`${cardio.filter(inWeek).reduce((a, c) => a + (Number(c.value) || 0), 0).toFixed(1)} km`} icon="trending" /><Stat label="Time this week" value={fmtDuration(cardio.filter(inWeek).reduce((a, c) => a + (Number(c.minutes) || 0), 0))} icon="clock" /><Stat label="Steps this week" value={cardio.filter(inWeek).reduce((a, c) => a + (Number(c.steps) || 0), 0).toLocaleString()} /></div>
          <CollectionView collection="cardio" />
        </>
      )}
    </Page>
  );
}
