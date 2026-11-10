'use client';

import { useMemo, useState } from 'react';
import { createFromTemplate } from '@/core/actions';
import { openEditor } from '@/core/app';
import type { Rec } from '@/core/data/db';
import { useById, useNow, usePrefs, useRecords } from '@/core/data/hooks';
import { create, remove, titleOf } from '@/core/data/store';
import { parseDate, startOfDay, startOfWeek, ymd } from '@/core/lib/dates';
import { parseQuickTask } from '@/core/lib/quickadd';
import { PRIORITIES, SMART_GROUPS, TASK_STATUSES, blockers, groupTasks, isDone, isOverdue, subtaskProgress, type TaskLike } from '@/core/lib/tasks';
import { Page, tabFrom, type ModuleProps } from '@/shell/Page';
import { CollectionView } from '@/ui/CollectionView';
import { Icon } from '@/ui/icons';
import { Button, Empty, IconButton, Menu, Sheet, Stat } from '@/ui/kit';
import { toast } from '@/ui/overlays';
import { Timeline, type TimelineItem } from '@/ui/Timeline';

const TABS = [
  { value: 'list', label: 'List', icon: 'list' as const },
  { value: 'board', label: 'Board', icon: 'columns' as const },
  { value: 'calendar', label: 'Calendar', icon: 'calendar' as const },
  { value: 'timeline', label: 'Timeline', icon: 'calendarDays' as const },
  { value: 'table', label: 'Table', icon: 'table' as const },
];
type Group = 'smart' | 'status' | 'priority' | 'project' | 'tag' | 'none';
const GROUPS: { value: Group; label: string }[] = [{ value: 'smart', label: 'Date' }, { value: 'status', label: 'Status' }, { value: 'priority', label: 'Priority' }, { value: 'project', label: 'Project' }, { value: 'tag', label: 'Tag' }, { value: 'none', label: 'No grouping' }];

/** Quick add with natural-language parsing, shown above the list. */
export function TaskQuickAdd({ defaults, placeholder }: { defaults?: Record<string, unknown>; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = async () => {
    const parsed = parseQuickTask(draft);
    if (!parsed.title) return;
    await create('tasks', { title: parsed.title, status: 'todo', priority: parsed.priority ?? 0, dueAt: parsed.dueAt ?? null, tags: parsed.tags ?? [], ...defaults });
    setDraft('');
  };
  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
      <Icon name="plus" size={18} className="text-accent" />
      <input className="min-w-0 flex-1 bg-transparent py-3 outline-none placeholder:text-faint" placeholder={placeholder ?? 'Add a task — try “Pay rent tomorrow !high #home”'} aria-label="Quick add task" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
      {draft && <Button size="sm" variant="primary" onClick={() => void add()}>Add</Button>}
    </div>
  );
}

function TemplatesMenu() {
  const templates = useRecords('templates').filter((t) => t.kind === 'tasks');
  const [manage, setManage] = useState(false);
  return (
    <>
      <Menu
        label="Task templates"
        items={[
          ...(templates.length ? templates.map((t) => ({ label: String(t.name), icon: 'copy' as const, onClick: async () => { const rec = await createFromTemplate(t); toast('Task created from template', { tone: 'good' }); openEditor('tasks', rec.id); } })) : [{ label: 'No templates yet', disabled: true }]),
          { separator: true, label: '' },
          { label: 'Manage templates…', icon: 'settings' as const, onClick: () => setManage(true) },
        ]}
        trigger={(p) => <Button size="sm" icon="layers" {...p}>Templates</Button>}
      />
      <Sheet open={manage} onClose={() => setManage(false)} title="Task templates" width={460}>
        <p className="mb-3 text-sm text-muted">Open any task and choose “Save as template” from its ⋯ menu. Subtasks are saved with it.</p>
        {templates.length === 0 ? <Empty icon="layers" title="No templates yet" /> : templates.map((t) => (
          <div key={t.id} className="row"><span className="min-w-0 flex-1 truncate">{t.name}</span><IconButton icon="trash" label={`Delete template ${t.name}`} onClick={() => void remove(t.id, { silent: true })} /></div>
        ))}
      </Sheet>
    </>
  );
}

function ProgressStats({ tasks }: { tasks: Rec[] }) {
  const now = useNow();
  const stats = useMemo(() => {
    const today = ymd(now);
    const weekStart = startOfWeek(now).getTime();
    const top = tasks.filter((t) => !t.archived);
    return {
      open: top.filter((t) => !isDone(t as TaskLike)).length,
      overdue: top.filter((t) => isOverdue(t as TaskLike, now)).length,
      today: top.filter((t) => t.completedAt && ymd(new Date(t.completedAt)) === today).length,
      week: top.filter((t) => t.completedAt && new Date(t.completedAt).getTime() >= weekStart).length,
    };
  }, [tasks, now]);
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Open" value={stats.open} icon="tasks" />
      <Stat label="Overdue" value={stats.overdue} icon="warning" tone={stats.overdue ? 'bad' : undefined} />
      <Stat label="Done today" value={stats.today} icon="checkCircle" tone="good" />
      <Stat label="Done this week" value={stats.week} icon="trending" />
    </div>
  );
}

export default function Tasks({ sub }: ModuleProps) {
  const tab = tabFrom(sub, TABS);
  const tasks = useRecords('tasks');
  const projects = useById('projects');
  const [prefs, setPrefs] = usePrefs();
  const group = (prefs.views.taskGroup as Group) ?? 'smart';
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t as TaskLike])), [tasks]);
  const topLevel = (r: Rec) => !r.parentId;

  const groupBy = (records: Rec[]) =>
    groupTasks(records as (Rec & TaskLike)[], group).map((g) => ({
      key: g.key,
      items: g.items,
      label:
        group === 'smart' ? SMART_GROUPS.find((x) => x.id === g.key)!.label
        : group === 'status' ? (TASK_STATUSES.find((s) => s.value === g.key)?.label ?? g.key)
        : group === 'priority' ? `${PRIORITIES.find((p) => String(p.value) === g.key)?.label ?? ''} priority`
        : group === 'project' ? (g.key ? (projects.get(g.key) ? titleOf(projects.get(g.key)!) : 'Unknown project') : 'No project')
        : group === 'tag' ? (g.key ? `#${g.key}` : 'Untagged')
        : '',
    }));
  const rowExtra = (r: Rec) => {
    const sp = subtaskProgress(r.id, tasks as TaskLike[]);
    const blocked = blockers(r as TaskLike, byId);
    return (
      <>
        {sp && <span className="chip"><Icon name="checklist" size={12} />{sp.done}/{sp.total}</span>}
        {blocked.length > 0 && <span className="chip !border-warn/40 !text-warn"><Icon name="lock" size={12} />Blocked by {blocked.length}</span>}
        {r.recurrence && <span className="chip"><Icon name="repeat" size={12} />Repeats</span>}
      </>
    );
  };

  const timeline: TimelineItem[] = useMemo(() => tasks.filter((t) => !t.archived && !t.parentId && (t.dueAt || t.startAt)).map((t) => {
    const end = startOfDay(parseDate(t.dueAt ?? t.startAt)!);
    const start = startOfDay(parseDate(t.startAt ?? t.dueAt)!);
    return { id: t.id, label: String(t.title), start: start <= end ? start : end, end, done: isDone(t as TaskLike), color: (t.projectId && (projects.get(t.projectId)?.color as string)) || PRIORITIES.find((p) => p.value === (t.priority ?? 0))?.color, group: t.projectId ? (projects.get(t.projectId) ? titleOf(projects.get(t.projectId)!) : '') : '', onClick: () => openEditor('tasks', t.id) };
  }), [tasks, projects]);

  return (
    <Page module="tasks" tabs={TABS} tab={tab} wide={tab !== 'list'} actions={<TemplatesMenu />}>
      {tab === 'list' && (
        <>
          <ProgressStats tasks={tasks.filter(topLevel)} />
          <TaskQuickAdd />
          <CollectionView
            collection="tasks" views={['list']} viewKey="tasks-list" filter={topLevel} groupBy={groupBy} rowExtra={rowExtra}
            toolbar={
              <select className="input !min-h-9 !w-auto flex-none !py-1 text-sm" aria-label="Group tasks by" value={group} onChange={(e) => setPrefs({ views: { ...prefs.views, taskGroup: e.target.value } })}>
                {GROUPS.map((g) => <option key={g.value} value={g.value}>Group: {g.label}</option>)}
              </select>
            }
          />
        </>
      )}
      {tab === 'board' && <CollectionView collection="tasks" views={['board']} viewKey="tasks-board" filter={topLevel} />}
      {tab === 'calendar' && <CollectionView collection="tasks" views={['calendar']} viewKey="tasks-cal" />}
      {tab === 'table' && <CollectionView collection="tasks" views={['table']} viewKey="tasks-table" />}
      {tab === 'timeline' && (
        <>
          <p className="mb-3 text-sm text-muted">Bars run from a task’s start date to its due date. Give a task both dates to see its span.</p>
          <Timeline items={timeline} emptyHint="Tasks with a start or due date appear here." />
        </>
      )}
    </Page>
  );
}
