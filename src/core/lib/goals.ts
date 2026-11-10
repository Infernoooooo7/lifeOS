/** Goal progress, derived from the best evidence available for each goal. */

export interface GoalLike {
  id: string;
  parentId?: string | null;
  progress?: number;
  targetValue?: number | null;
  currentValue?: number | null;
  status?: string;
  kind?: string;
}

const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/**
 * Order of precedence: achieved → 100%; child goals / key results (average); a measured value
 * against its target; milestones reached; linked tasks done; otherwise the manual slider.
 */
export function goalProgress(
  goal: GoalLike,
  all: GoalLike[],
  milestones: { id?: string; goalId?: string | null; done?: boolean }[] = [],
  tasks: { id?: string; goalId?: string | null; status?: string }[] = [],
  depth = 0,
): number {
  if (goal.status === 'achieved') return 1;
  const children = all.filter((g) => g.parentId === goal.id && g.status !== 'dropped');
  if (children.length && depth < 5) return clamp(children.reduce((a, c) => a + goalProgress(c, all, milestones, tasks, depth + 1), 0) / children.length);
  if (Number(goal.targetValue) > 0) return clamp(Number(goal.currentValue ?? 0) / Number(goal.targetValue));
  const ms = milestones.filter((m) => m.goalId === goal.id);
  if (ms.length) return ms.filter((m) => m.done).length / ms.length;
  const linked = tasks.filter((t) => t.goalId === goal.id);
  if (linked.length) return linked.filter((t) => t.status === 'done').length / linked.length;
  return clamp(Number(goal.progress ?? 0));
}

/** What the progress figure is based on, for display. */
export function progressSource(goal: GoalLike, all: GoalLike[], milestones: { id?: string; goalId?: string | null }[] = [], tasks: { id?: string; goalId?: string | null }[] = []): string {
  if (goal.status === 'achieved') return 'Achieved';
  const children = all.filter((g) => g.parentId === goal.id && g.status !== 'dropped');
  if (children.length) return `${children.length} ${children.every((c) => c.kind === 'keyResult') ? 'key result' : 'sub-goal'}${children.length === 1 ? '' : 's'}`;
  if (Number(goal.targetValue) > 0) return 'Measured value';
  const ms = milestones.filter((m) => m.goalId === goal.id).length;
  if (ms) return `${ms} milestone${ms === 1 ? '' : 's'}`;
  const t = tasks.filter((x) => x.goalId === goal.id).length;
  if (t) return `${t} linked task${t === 1 ? '' : 's'}`;
  return 'Manual';
}
