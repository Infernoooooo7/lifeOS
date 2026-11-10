'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SOUNDS, playAmbient, setAmbientVolume, type Sound } from '@/core/ambient';
import { useNow, usePrefs, useRecords } from '@/core/data/hooks';
import { create, titleOf } from '@/core/data/store';
import { addDays, fmtDuration, fmtTime, ymd } from '@/core/lib/dates';
import { fmtClock, isRunning, msLeft, pause, resetCycle, resume, setFocusLabel, startBreak, startFocus, stop, useFocus } from '@/core/focusTimer';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { Bars } from '@/ui/charts';
import { CollectionView } from '@/ui/CollectionView';
import { Icon } from '@/ui/icons';
import { Button, IconButton, Ring, Section, Segmented, Stat, cx } from '@/ui/kit';
import { toast } from '@/ui/overlays';

const TABS = [{ value: 'timer', label: 'Timer', icon: 'timer' as const }, { value: 'stats', label: 'Statistics', icon: 'chart' as const }, { value: 'history', label: 'History', icon: 'history' as const }, { value: 'distractions', label: 'Distractions', icon: 'zap' as const }];
type Mode = 'pomodoro' | 'custom' | 'deep';

function TimerFace({ size, immersive }: { size: number; immersive?: boolean }) {
  const s = useFocus();
  const left = msLeft(s);
  const total = s.planned * 60_000;
  const color = s.phase === 'break' ? 'var(--good)' : s.kind === 'deep' ? 'var(--violet)' : 'var(--accent)';
  return (
    <Ring value={s.phase === 'idle' ? 0 : 1 - left / total} size={size} stroke={immersive ? 10 : 9} color={color} label={`${fmtClock(left)} remaining`}>
      <div>
        <div className="num font-semibold leading-none" style={{ fontSize: size / 4.6 }} aria-live="off" data-testid="focus-clock">{s.phase === 'idle' ? fmtClock(total) : fmtClock(left)}</div>
        <div className="mt-2 text-sm text-muted">{s.phase === 'idle' ? 'Ready' : s.phase === 'break' ? 'Break' : s.kind === 'deep' ? 'Deep work' : 'Focus'}{s.pausedLeft !== null ? ' · paused' : ''}</div>
      </div>
    </Ring>
  );
}

export default function Focus({ sub }: ModuleProps) {
  const tab = tabFrom(sub, TABS);
  const [prefs, setPrefs] = usePrefs();
  const now = useNow();
  const timer = useFocus();
  const sessions = useRecords('focusSessions');
  const tasks = useRecords('tasks');
  const distractions = useRecords('distractions');
  const [mode, setMode] = useState<Mode>('pomodoro');
  const [custom, setCustom] = useState(45);
  const [taskId, setTaskId] = useState('');
  const [sound, setSound] = useState<Sound>('off');
  const [volume, setVolume] = useState(0.5);
  const [immersive, setImmersive] = useState(false);
  const [note, setNote] = useState('');
  const overlay = useRef<HTMLDivElement>(null);

  const focusOnly = useMemo(() => sessions.filter((x) => x.kind !== 'break'), [sessions]);
  const today = ymd(now);
  const minutesOn = (day: string) => focusOnly.filter((x) => x.startedAt && ymd(new Date(x.startedAt)) === day).reduce((a, x) => a + (Number(x.minutes) || 0), 0);
  const todayMin = minutesOn(today);
  const daily = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = addDays(now, i - 13); return { label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), minutes: minutesOn(ymd(d)) }; }), [focusOnly, now]); // eslint-disable-line react-hooks/exhaustive-deps
  let streak = 0;
  for (let i = todayMin >= prefs.focus.goal ? 0 : 1; prefs.focus.goal > 0 && minutesOn(ymd(addDays(now, -i))) >= prefs.focus.goal; i++) streak++;
  const openTasks = tasks.filter((t) => t.status !== 'done' && !t.archived).slice(0, 60);
  const planned = mode === 'pomodoro' ? prefs.focus.work : mode === 'deep' ? 90 : custom;

  // Leaving the module stops the ambient sound; the timer itself keeps running.
  useEffect(() => () => playAmbient('off'), []);
  useEffect(() => {
    const onChange = () => !document.fullscreenElement && setImmersive(false);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const begin = () => {
    const task = tasks.find((t) => t.id === taskId);
    startFocus({ minutes: planned, kind: mode === 'deep' ? 'deep' : 'focus', taskId: taskId || null, label: timer.label || (task ? titleOf(task) : '') });
  };
  const enterImmersive = async () => {
    setImmersive(true);
    // Real full screen where the platform allows it (not on iPhone); the overlay covers the app either way.
    setTimeout(() => void overlay.current?.requestFullscreen?.().catch(() => undefined), 30);
  };
  const leaveImmersive = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setImmersive(false);
  };
  const logDistraction = async () => {
    if (!note.trim()) return;
    await create('distractions', { text: note.trim(), at: new Date().toISOString(), sessionId: timer.sessionId });
    setNote('');
    toast('Noted. Back to it.', { icon: 'zap' });
  };
  const pickSound = (v: Sound) => { setSound(v); playAmbient(v, volume); };
  const running = isRunning(timer);

  const controls = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {timer.phase === 'idle' ? (
        <><Button variant="primary" icon="play" className="!min-h-12 !px-6" onClick={begin}>Start {mode === 'deep' ? 'deep work' : 'focus'}</Button><Button icon="pause" onClick={() => startBreak()}>Take a break</Button></>
      ) : (
        <>
          {running ? <Button variant="primary" icon="pause" className="!min-h-12 !px-6" onClick={pause}>Pause</Button> : <Button variant="primary" icon="play" className="!min-h-12 !px-6" onClick={resume}>Resume</Button>}
          <Button icon="square" onClick={() => void stop().then(() => toast('Session stopped — time so far was recorded.'))}>Stop</Button>
        </>
      )}
    </div>
  );
  const distractionBox = (
    <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-line bg-surface px-3">
      <Icon name="zap" size={16} className="text-warn" />
      <input className="min-w-0 flex-1 bg-transparent py-2.5 outline-none placeholder:text-faint" placeholder="Distracted? Jot it down and carry on…" aria-label="Log a distraction" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void logDistraction()} />
      {note && <Button size="sm" onClick={() => void logDistraction()}>Log</Button>}
    </div>
  );

  return (
    <Page module="focus" tabs={TABS} tab={tab}>
      {tab === 'timer' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="card flex flex-col items-center gap-5 !py-7">
            <Segmented label="Session type" value={mode} onChange={setMode} options={[{ value: 'pomodoro', label: `Pomodoro ${prefs.focus.work}/${prefs.focus.short}` }, { value: 'custom', label: 'Custom' }, { value: 'deep', label: 'Deep work 90' }]} />
            <TimerFace size={230} />
            <input className="w-full max-w-md bg-transparent text-center text-lg outline-none placeholder:text-faint" placeholder="What are you focusing on?" aria-label="Focus label" value={timer.label} onChange={(e) => setFocusLabel(e.target.value)} />
            {controls}
            {timer.phase === 'focus' && distractionBox}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted">
              <span>Cycle {timer.cycle % prefs.focus.every}/{prefs.focus.every} <button type="button" className="ml-1 text-accent" onClick={resetCycle}>reset</button></span>
              <button type="button" className="inline-flex items-center gap-1.5 text-accent" onClick={() => void enterImmersive()}><Icon name="maximize" size={14} />Full-screen mode</button>
            </div>
          </div>
          <div className="space-y-3">
            <div className="card flex items-center gap-4">
              <Ring value={prefs.focus.goal ? todayMin / prefs.focus.goal : 0} size={64} stroke={6} label="Daily focus goal"><Icon name="target" size={18} className="text-accent" /></Ring>
              <div className="min-w-0 flex-1"><div className="text-sm text-muted">Today</div><div className="num text-xl font-semibold">{fmtDuration(todayMin)} <span className="text-sm font-normal text-faint">of {fmtDuration(prefs.focus.goal)}</span></div></div>
            </div>
            <div className="card space-y-3">
              {mode === 'custom' && <label className="block"><span className="label">Session length</span><div className="flex items-center gap-3"><input type="range" min={5} max={180} step={5} value={custom} onChange={(e) => setCustom(Number(e.target.value))} className="h-9 min-w-0 flex-1 accent-[var(--accent)]" aria-label="Custom session length" /><span className="num w-14 text-right text-sm">{fmtDuration(custom)}</span></div></label>}
              <label className="block"><span className="label">Focus on a task</span><select className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={timer.phase !== 'idle'}><option value="">No task</option>{openTasks.map((t) => <option key={t.id} value={t.id}>{titleOf(t)}</option>)}</select><span className="mt-1 block text-xs text-faint">Time is logged against the task when the session ends.</span></label>
              <div><span className="label">Ambient sound</span><Segmented size="sm" label="Ambient sound" value={sound} onChange={pickSound} options={SOUNDS} />
                {sound !== 'off' && <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => { setVolume(Number(e.target.value)); setAmbientVolume(Number(e.target.value)); }} className="mt-2 h-8 w-full accent-[var(--accent)]" aria-label="Volume" />}
              </div>
            </div>
            <details className="card">
              <summary className="font-medium">Timer settings</summary>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([['work', 'Focus (min)', 5, 120], ['short', 'Short break', 1, 30], ['long', 'Long break', 5, 60], ['every', 'Long break every', 2, 8], ['goal', 'Daily goal (min)', 0, 600]] as const).map(([k, label, min, max]) => (
                  <label key={k} className="block"><span className="label">{label}</span><input className="input" type="number" min={min} max={max} value={prefs.focus[k]} disabled={timer.phase !== 'idle' && k !== 'goal'} onChange={(e) => setPrefs({ focus: { ...prefs.focus, [k]: Math.max(min, Math.min(max, Number(e.target.value) || min)) } })} /></label>
                ))}
                <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--accent)]" checked={prefs.focus.auto} onChange={(e) => setPrefs({ focus: { ...prefs.focus, auto: e.target.checked } })} />Start breaks and the next session automatically</label>
              </div>
            </details>
          </div>
        </div>
      )}
      {tab === 'stats' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label="Today" value={fmtDuration(todayMin)} icon="timer" tone="accent" />
            <Stat label="Last 7 days" value={fmtDuration(daily.slice(-7).reduce((a, d) => a + d.minutes, 0))} icon="trending" />
            <Stat label="Goal streak" value={`${streak} d`} icon="flame" tone="warn" sub={`Days with ${fmtDuration(prefs.focus.goal)}+`} />
            <Stat label="Deep work" value={fmtDuration(focusOnly.filter((x) => x.kind === 'deep').reduce((a, x) => a + (Number(x.minutes) || 0), 0))} icon="brain" sub="All time" />
          </div>
          <Section title="Focus minutes per day" icon="chart"><div className="card"><Bars data={daily} series={[{ key: 'minutes', name: 'Minutes' }]} fmt={(v) => fmtDuration(v)} label="Focus minutes per day for the last 14 days" /></div></Section>
          <div className="grid grid-cols-3 gap-2"><Stat label="Sessions" value={focusOnly.length} /><Stat label="Completed in full" value={focusOnly.filter((x) => x.completed).length} /><Stat label="Average length" value={focusOnly.length ? fmtDuration(focusOnly.reduce((a, x) => a + (Number(x.minutes) || 0), 0) / focusOnly.length) : '—'} /></div>
        </div>
      )}
      {tab === 'history' && <CollectionView collection="focusSessions" views={['table', 'list']} addLabel="Add session" emptyHint="Finished and stopped sessions are recorded here automatically." />}
      {tab === 'distractions' && <CollectionView collection="distractions" views={['list', 'table']} emptyHint="Things that pulled you away during focus sessions. Patterns here show what to fix." />}

      {immersive && (
        <div ref={overlay} className="app-canvas fixed inset-0 z-[65] flex flex-col items-center justify-center gap-7 p-6" role="dialog" aria-label="Full-screen focus mode">
          <IconButton icon="x" label="Leave full-screen mode" className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))]" onClick={leaveImmersive} />
          {timer.label && <p className="max-w-xl text-center font-display text-xl text-muted">{timer.label}</p>}
          <TimerFace size={Math.min(360, typeof window === 'undefined' ? 320 : window.innerWidth - 64)} immersive />
          {controls}
          {timer.phase === 'focus' && distractionBox}
          <p className={cx('text-sm text-faint', timer.phase === 'idle' && 'invisible')}>Ends at {timer.endsAt ? fmtTime(new Date(timer.endsAt)) : '—'}</p>
        </div>
      )}
    </Page>
  );
}
