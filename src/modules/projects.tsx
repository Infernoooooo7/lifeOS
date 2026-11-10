'use client';

import { useMemo, useState } from 'react';
import { navigate, openEditor } from '@/core/app';
import { PROJECT_STATUSES } from '@/core/collections';
import type { Rec } from '@/core/data/db';
import { useNow, useRecord, useRecords } from '@/core/data/hooks';
import { create, remove, titleOf, update, upsert } from '@/core/data/store';
import { diffDays, fmtDate, fmtDuration, parseDate, startOfDay, ymd } from '@/core/lib/dates';
import { isOverdue, type TaskLike } from '@/core/lib/tasks';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { CollectionView } from '@/ui/CollectionView';
import { Graph, type GraphEdge, type GraphNode } from '@/ui/Graph';
import { Icon } from '@/ui/icons';
import { Button, Checkbox, Empty, IconButton, Menu, Progress, Section, Stat, Tabs, cx } from '@/ui/kit';
import { Markdown } from '@/ui/Markdown';
import { confirmDialog, promptDialog, toast } from '@/ui/overlays';
import { Timeline, type TimelineItem } from '@/ui/Timeline';
import { TaskQuickAdd } from './tasks';

export type Health = 'on-track' | 'at-risk' | 'off-track' | 'done';
const HEALTH: Record<Health, { label: string; color: string }> = { 'on-track': { label: 'On track', color: 'var(--good)' }, 'at-risk': { label: 'At risk', color: 'var(--warn)' }, 'off-track': { label: 'Off track', color: 'var(--bad)' }, done: { label: 'Done', color: 'var(--good)' } };

export interface ProjectStats {
  total: number;
  done: number;
  overdue: number;
  progress: number;
  health: Health;
  daysLeft: number | null;
}

/** Progress and health from the project's own tasks and milestones. */
export function projectStats(project: Rec, tasks: Rec[], milestones: Rec[], now: Date = new Date()): ProjectStats {
  const mine = tasks.filter((t) => t.projectId === project.id && !t.archived);
  const ms = milestones.filter((m) => m.projectId === project.id);
  const total = mine.length + ms.length;
  const done = mine.filter((t) => t.status === 'done').length + ms.filter((m) => m.done).length;
  const overdue = mine.filter((t) => isOverdue(t as TaskLike, now)).length + ms.filter((m) => !m.done && parseDate(m.dueAt) && parseDate(m.dueAt)! < startOfDay(now)).length;
  const progress = total ? done / total : project.status === 'done' ? 1 : 0;
  const due = parseDate(project.dueAt);
  const daysLeft = due ? diffDays(now, due) : null;
  let health: Health = 'on-track';
  if (project.status === 'done') health = 'done';
  else if ((daysLeft !== null && daysLeft < 0) || (total > 0 && overdue / total > 0.25)) health = 'off-track';
  else if (overdue > 0 || (daysLeft !== null && daysLeft <= 7 && progress < 0.7)) health = 'at-risk';
  return { total, done, overdue, progress, health, daysLeft };
}

function HealthChip({ health }: { health: Health }) {
  const h = HEALTH[health];
  return <span className="chip" style={{ color: h.color, borderColor: `color-mix(in oklab, ${h.color} 35%, transparent)` }}><span className="size-1.5 rounded-full" style={{ background: h.color }} />{h.label}</span>;
}

async function saveAsTemplate(project: Rec, tasks: Rec[], milestones: Rec[]) {
  const pick = (r: Rec, keys: string[]) => Object.fromEntries(keys.map((k) => [k, r[k]]).filter(([, v]) => v != null));
  await upsert('templates', `tpl:${project.id}`, {
    kind: 'projects', name: titleOf(project),
    payload: {
      ...pick(project, ['name', 'description', 'color', 'notes']),
      _tasks: tasks.filter((t) => t.projectId === project.id && !t.parentId).map((t) => pick(t, ['title', 'priority', 'tags', 'estimateMin', 'notes'])),
      _milestones: milestones.filter((m) => m.projectId === project.id).map((m) => pick(m, ['title'])),
    },
  });
  toast('Project saved as a template', { tone: 'good' });
}

async function fromTemplate(tpl: Rec) {
  const { _tasks = [], _milestones = [], ...fields } = (tpl.payload ?? {}) as { _tasks?: Record<string, unknown>[]; _milestones?: Record<string, unknown>[] } & Record<string, unknown>;
  const project = await create('projects', { ...fields, status: 'planning', startAt: ymd() });
  for (const t of _tasks) await create('tasks', { ...t, status: 'todo', projectId: project.id }, { silent: true });
  for (const m of _milestones) await create('milestones', { ...m, done: false, projectId: project.id }, { silent: true });
  navigate(`/projects/${project.id}`);
}

// ── Project detail ───────────────────────────────────────────────────────────────────────────────

const DETAIL_TABS = [{ value: 'overview', label: 'Overview' }, { value: 'tasks', label: 'Tasks' }, { value: 'timeline', label: 'Timeline' }, { value: 'notes', label: 'Notes' }, { value: 'files', label: 'Files' }, { value: 'time', label: 'Time' }] as const;
type DetailTab = (typeof DETAIL_TABS)[number]['value'];

function ProjectDetail({ id, tab }: { id: string; tab: DetailTab }) {
  const project = useRecord(id);
  const tasks = useRecords('tasks');
  const milestones = useRecords('milestones');
  const entries = useRecords('timeEntries');
  const now = useNow();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  if (project === undefined) return <Page module="projects" title="Project">Loading…</Page>;
  if (!project || project.deletedAt) return <Page module="projects" title="Project"><Empty icon="projects" title="Project not found" action={<Button onClick={() => navigate('/projects')}>All projects</Button>} /></Page>;
  const stats = projectStats(project, tasks, milestones, now);
  const mine = tasks.filter((t) => t.projectId === id && !t.archived);
  const ms = milestones.filter((m) => m.projectId === id).sort((a, b) => String(a.dueAt ?? '9').localeCompare(String(b.dueAt ?? '9')));
  const time = entries.filter((e) => e.projectId === id);
  const minutes = time.reduce((a, e) => a + (Number(e.minutes) || 0), 0);
  const scope = (r: Rec) => r.projectId === id;
  const timeline: TimelineItem[] = [
    ...mine.filter((t) => t.dueAt || t.startAt).map((t) => { const end = startOfDay(parseDate(t.dueAt ?? t.startAt)!); const start = startOfDay(parseDate(t.startAt ?? t.dueAt)!); return { id: t.id, label: String(t.title), start: start <= end ? start : end, end, done: t.status === 'done', color: project.color ?? undefined, group: 'Tasks', onClick: () => openEditor('tasks', t.id) }; }),
    ...ms.filter((m) => m.dueAt).map((m) => ({ id: m.id, label: String(m.title), start: startOfDay(parseDate(m.dueAt)!), end: startOfDay(parseDate(m.dueAt)!), milestone: true, done: !!m.done, group: 'Milestones', onClick: () => openEditor('milestones', m.id) })),
  ];
  return (
    <Page
      module="projects" title={String(project.name)} wide={tab === 'tasks' || tab === 'timeline'}
      subtitle={<span className="flex flex-wrap items-center gap-1.5"><button type="button" className="text-accent" onClick={() => navigate('/projects')}>Projects</button> · {PROJECT_STATUSES.find((s) => s.value === project.status)?.label}<HealthChip health={stats.health} /></span>}
      actions={
        <>
          <Button size="sm" icon="pencil" onClick={() => openEditor('projects', id)}>Edit</Button>
          <Menu
            label="Project actions"
            items={[
              { label: 'Save as template', icon: 'layers', onClick: () => void saveAsTemplate(project, tasks, milestones) },
              { label: project.archived ? 'Unarchive' : 'Archive', icon: 'archive', onClick: () => void update(id, { archived: !project.archived }).then(() => toast(project.archived ? 'Project restored' : 'Project archived')) },
              { label: 'Delete project', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog({ title: `Delete “${project.name}”?`, body: 'The project moves to the trash. Its tasks are kept.', danger: true, confirmLabel: 'Delete' })) { await remove(id); navigate('/projects'); } } },
            ]}
            trigger={(p) => <IconButton icon="more" label="Project actions" {...p} />}
          />
        </>
      }
    >
      <Tabs className="mb-4" tabs={[...DETAIL_TABS]} value={tab} onChange={(v) => navigate(`/projects/${id}${v === 'overview' ? '' : `/${v}`}`)} />
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label="Progress" value={`${Math.round(stats.progress * 100)}%`} sub={`${stats.done} of ${stats.total} items`} icon="trending" tone="accent" />
            <Stat label="Overdue" value={stats.overdue} icon="warning" tone={stats.overdue ? 'bad' : undefined} />
            <Stat label="Deadline" value={stats.daysLeft === null ? '—' : stats.daysLeft < 0 ? `${-stats.daysLeft}d late` : `${stats.daysLeft}d left`} sub={project.dueAt ? fmtDate(project.dueAt, { year: true }) : 'No deadline set'} icon="flag" tone={stats.daysLeft !== null && stats.daysLeft < 0 ? 'bad' : undefined} />
            <Stat label="Time logged" value={fmtDuration(minutes)} icon="clock" />
          </div>
          <Progress value={stats.progress} color={project.color} label="Project progress" className="!h-2" />
          {project.description && <p className="text-muted">{project.description}</p>}
          <Section title="Milestones" icon="flag" action={<Button size="sm" icon="plus" onClick={() => openEditor('milestones', undefined, { projectId: id })}>Milestone</Button>}>
            {ms.length === 0 ? <p className="text-sm text-faint">No milestones yet. Add checkpoints to track the big steps.</p> : (
              <div className="-mx-2">
                {ms.map((m) => (
                  <div key={m.id} className="row">
                    <Checkbox checked={!!m.done} onChange={(v) => void update(m.id, { done: v })} label={`Milestone ${m.title} reached`} />
                    <button type="button" className={cx('min-w-0 flex-1 truncate text-left', m.done && 'text-faint line-through')} onClick={() => openEditor('milestones', m.id)}>{m.title}</button>
                    {m.dueAt && <span className={cx('chip', !m.done && parseDate(m.dueAt)! < startOfDay(now) && '!border-bad/40 !text-bad')}>{fmtDate(m.dueAt)}</span>}
                  </div>
                ))}
              </div>
            )}
          </Section>
          <Section title="Next up" icon="tasks" action={<button type="button" className="text-sm text-accent" onClick={() => navigate(`/projects/${id}/tasks`)}>All tasks</button>}>
            <TaskQuickAdd defaults={{ projectId: id }} placeholder="Add a task to this project…" />
            <CollectionView collection="tasks" views={['list']} filter={(r) => scope(r) && r.status !== 'done' && !r.parentId} defaults={{ projectId: id }} hideToolbar emptyHint="No open tasks in this project." />
          </Section>
        </div>
      )}
      {tab === 'tasks' && <><TaskQuickAdd defaults={{ projectId: id }} placeholder="Add a task to this project…" /><CollectionView collection="tasks" views={['board', 'list', 'table']} viewKey="project-tasks" filter={scope} defaults={{ projectId: id }} /></>}
      {tab === 'timeline' && <Timeline items={timeline} emptyHint="Tasks and milestones with dates appear here." />}
      {tab === 'notes' && (
        editingNotes ? (
          <div>
            <textarea className="input min-h-72 font-mono text-[0.9rem]" aria-label="Project notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Markdown supported" autoFocus />
            <div className="mt-2 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditingNotes(false)}>Cancel</Button><Button variant="primary" onClick={() => void update(id, { notes }).then(() => setEditingNotes(false))}>Save notes</Button></div>
          </div>
        ) : (
          <div>
            <div className="mb-2 flex justify-end"><Button size="sm" icon="pencil" onClick={() => { setNotes(String(project.notes ?? '')); setEditingNotes(true); }}>Edit notes</Button></div>
            {project.notes ? <div className="card"><Markdown text={String(project.notes)} /></div> : <Empty icon="notes" title="No project notes yet" hint="Keep decisions, links and context with the project." />}
          </div>
        )
      )}
      {tab === 'files' && <CollectionView collection="files" views={['list', 'table']} viewKey="project-files" filter={scope} defaults={{ projectId: id }} emptyHint="Attach documents to this project. Files added here also appear in Documents." addLabel="Attach document" />}
      {tab === 'time' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><Stat label="Total logged" value={fmtDuration(minutes)} icon="clock" /><Stat label="Entries" value={time.length} /><Stat label="This week" value={fmtDuration(time.filter((e) => parseDate(e.date) && diffDays(parseDate(e.date)!, now) < 7).reduce((a, e) => a + (Number(e.minutes) || 0), 0))} /></div>
          <CollectionView collection="timeEntries" views={['table', 'list']} viewKey="project-time" filter={scope} defaults={{ projectId: id }} addLabel="Log time" />
        </>
      )}
    </Page>
  );
}

// ── Project list ─────────────────────────────────────────────────────────────────────────────────

const TABS = [{ value: 'all', label: 'Projects', icon: 'grid' as const }, { value: 'board', label: 'Board', icon: 'columns' as const }, { value: 'timeline', label: 'Timeline', icon: 'calendarDays' as const }, { value: 'map', label: 'Map', icon: 'network' as const }, { value: 'time', label: 'Time', icon: 'clock' as const }];

export default function Projects({ sub }: ModuleProps) {
  const projects = useRecords('projects');
  const tasks = useRecords('tasks');
  const milestones = useRecords('milestones');
  const goals = useRecords('goals');
  const templates = useRecords('templates').filter((t) => t.kind === 'projects');
  const now = useNow();
  const [showArchived, setShowArchived] = useState(false);
  const isList = !sub[0] || TABS.some((t) => t.value === sub[0]);

  const graph = useMemo(() => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const visible = projects.filter((p) => !p.archived);
    const ids = new Set(visible.map((p) => p.id));
    for (const p of visible) {
      nodes.push({ id: p.id, label: String(p.name), color: (p.color as string) ?? 'var(--violet)', weight: 1 + tasks.filter((t) => t.projectId === p.id).length / 4 });
      if (p.parentId && ids.has(p.parentId)) edges.push({ from: p.id, to: p.parentId });
    }
    const goalIds = new Set<string>();
    const link = (projectId: unknown, goalId: unknown) => {
      if (typeof projectId !== 'string' || typeof goalId !== 'string' || !ids.has(projectId)) return;
      const g = goals.find((x) => x.id === goalId);
      if (!g) return;
      if (!goalIds.has(g.id)) { goalIds.add(g.id); nodes.push({ id: g.id, label: `◎ ${g.title}`, color: 'var(--warn)' }); }
      if (!edges.some((e) => e.from === projectId && e.to === g.id)) edges.push({ from: projectId, to: g.id });
    };
    for (const t of tasks) link(t.projectId, t.goalId);
    for (const m of milestones) link(m.projectId, m.goalId);
    // task dependencies that cross project boundaries
    const byId = new Map(tasks.map((t) => [t.id, t]));
    for (const t of tasks) for (const dep of (t.dependsOn as string[] | undefined) ?? []) {
      const other = byId.get(dep);
      if (t.projectId && other?.projectId && other.projectId !== t.projectId && ids.has(t.projectId) && ids.has(other.projectId) && !edges.some((e) => e.from === t.projectId && e.to === other.projectId && e.dashed)) edges.push({ from: t.projectId, to: other.projectId, dashed: true });
    }
    return { nodes, edges };
  }, [projects, tasks, milestones, goals]);

  if (!isList) return <ProjectDetail id={sub[0]} tab={(DETAIL_TABS.find((t) => t.value === sub[1])?.value ?? 'overview') as DetailTab} />;
  const tab = tabFrom(sub, TABS);
  const list = projects.filter((p) => showArchived || !p.archived).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || String(a.dueAt ?? '9').localeCompare(String(b.dueAt ?? '9')));
  const timeline: TimelineItem[] = projects.filter((p) => !p.archived && (p.startAt || p.dueAt)).map((p) => { const end = startOfDay(parseDate(p.dueAt ?? p.startAt)!); const start = startOfDay(parseDate(p.startAt ?? p.dueAt)!); return { id: p.id, label: String(p.name), start: start <= end ? start : end, end, color: p.color ?? 'var(--violet)', done: p.status === 'done', onClick: () => navigate(`/projects/${p.id}`) }; });

  return (
    <Page
      module="projects" tabs={TABS} tab={tab} wide={tab !== 'all'}
      actions={
        <>
          <Menu
            label="Project templates"
            items={[
              ...(templates.length ? templates.map((t) => ({ label: `New from “${t.name}”`, icon: 'copy' as const, onClick: () => void fromTemplate(t) })) : [{ label: 'No templates yet — save one from a project', disabled: true }]),
              ...(templates.length ? [{ separator: true, label: '' }, ...templates.map((t) => ({ label: `Delete template “${t.name}”`, icon: 'trash' as const, danger: true, onClick: () => void remove(t.id, { silent: true }) }))] : []),
            ]}
            trigger={(p) => <Button size="sm" icon="layers" {...p}>Templates</Button>}
          />
          <Button variant="primary" size="sm" icon="plus" onClick={async () => { const name = await promptDialog({ title: 'New project', placeholder: 'Project name', confirmLabel: 'Create' }); if (name?.trim()) navigate(`/projects/${(await create('projects', { name: name.trim(), status: 'active', startAt: ymd() })).id}`); }}>Project</Button>
        </>
      }
    >
      {tab === 'all' && (
        <>
          {list.length === 0 ? (
            <Empty icon="projects" title="No projects yet" hint="A project groups tasks, milestones, notes, files and time." action={<Button variant="primary" icon="plus" onClick={() => openEditor('projects')}>New project</Button>} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3">
              {list.map((p) => {
                const s = projectStats(p, tasks, milestones, now);
                return (
                  <button key={p.id} type="button" onClick={() => navigate(`/projects/${p.id}`)} className={cx('card card-hover relative overflow-hidden text-left', p.archived && 'opacity-60')}>
                    <span className="absolute inset-x-0 top-0 h-1" style={{ background: p.color ?? 'var(--violet)' }} />
                    <div className="flex items-start gap-2"><h3 className="min-w-0 flex-1 truncate font-sans text-[1.02rem] font-semibold tracking-normal">{p.name}</h3><HealthChip health={s.health} /></div>
                    {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}
                    <div className="mt-3 flex items-center gap-2"><Progress value={s.progress} color={p.color} label={`${p.name} progress`} /><span className="num text-xs text-muted">{Math.round(s.progress * 100)}%</span></div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                      <span className="inline-flex items-center gap-1"><Icon name="tasks" size={12} />{s.total - s.done} open</span>
                      {s.overdue > 0 && <span className="inline-flex items-center gap-1 text-bad"><Icon name="warning" size={12} />{s.overdue} overdue</span>}
                      {s.daysLeft !== null && <span className="inline-flex items-center gap-1"><Icon name="flag" size={12} />{s.daysLeft < 0 ? `${-s.daysLeft}d late` : `${s.daysLeft}d left`}</span>}
                      {p.archived && <span>Archived</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <label className="mt-4 flex w-fit items-center gap-2 text-sm text-muted"><input type="checkbox" className="accent-[var(--accent)]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived projects</label>
        </>
      )}
      {tab === 'board' && <CollectionView collection="projects" views={['board']} viewKey="projects-board" onOpen={(r) => navigate(`/projects/${r.id}`)} />}
      {tab === 'timeline' && <Timeline items={timeline} emptyHint="Projects with a start date or deadline appear here." />}
      {tab === 'map' && (
        <>
          <p className="mb-3 text-sm text-muted">Projects, their sub-projects and the goals they serve. Dashed lines are task dependencies that cross projects.</p>
          <Graph nodes={graph.nodes} edges={graph.edges} onOpen={(id) => (projects.some((p) => p.id === id) ? navigate(`/projects/${id}`) : openEditor('goals', id))} emptyTitle="No projects to map yet" emptyHint="Create projects, nest them or link their tasks to goals to see relationships." />
        </>
      )}
      {tab === 'time' && <CollectionView collection="timeEntries" views={['table', 'list']} viewKey="time-entries" addLabel="Log time" emptyHint="Log the time you spend on projects and tasks." />}
    </Page>
  );
}
