/**
 * 成就收藏集的书页模型（纯计算，不依赖 store，方便单元测试）
 * ============================================================
 * V5.44 的口径：**一页 = 一个目标**
 * - 收藏单位只有目标：目标收进册子时，它的步骤跟着一起进；不再有「一条步骤一页」；
 * - 旧数据里被单独收藏的步骤，也归到所属目标的那一页上；
 * - 只有「目标已被删除、回忆还在」的历史步骤，才退化为单独一页。
 * 页面按完成时间升序（第 1 页 = 最早收进来的那一条）。
 */

import type { Goal, Task } from '@/types/models';

/** 一页里的一个步骤 */
export interface BookLeafStep {
  title: string;
  /** 完成日期「2026.10.19」 */
  doneText: string;
}

/** 一页回忆 */
export interface BookLeaf {
  id: string;
  title: string;
  /** 中间行：步骤 = 来自「所属目标」；目标 = 共 N 个步骤 */
  sub: string;
  /** 落款日期 */
  doneText: string;
  /** 排序键：完成时间（毫秒） */
  at: number;
  /** 这一页上的步骤（目标是整页收进来的才有） */
  steps: BookLeafStep[];
}

/** 完成时间 → 「2026.10.19」（页面上只留日期，干净） */
export function formatDoneAt(doneAt: number | null | undefined): string {
  if (!doneAt) {
    return '';
  }
  const d = new Date(doneAt);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
}

/**
 * 书页序列：按完成时间升序。
 * @param goals 全部目标（含已删除，函数内过滤）
 * @param tasks 全部步骤（含已删除，函数内过滤）
 */
export function bookLeaves(goals: Goal[], tasks: Task[]): BookLeaf[] {
  const archivedGoals = goals.filter((g) => !g.deletedAt && g.status === 'archived');
  const archivedTasks = tasks.filter((t) => !t.deletedAt && t.status === 'archived');

  // 一页 = 一个目标：已归档目标 + 旧数据里「被单独收进来」的步骤所属目标
  const groups = new Map<string, { goal: Goal; tasks: Task[] }>();
  for (const g of archivedGoals) {
    groups.set(g.id, { goal: g, tasks: [] });
  }

  const orphanTasks: Task[] = [];
  for (const t of archivedTasks) {
    const group = groups.get(t.goalId);
    if (group) {
      group.tasks.push(t);
      continue;
    }
    const owner = goals.find((g) => g.id === t.goalId && !g.deletedAt);
    if (owner) {
      groups.set(owner.id, { goal: owner, tasks: [t] });
    } else {
      orphanTasks.push(t);
    }
  }

  const leaves: BookLeaf[] = [];
  for (const { goal, tasks: groupTasks } of groups.values()) {
    // 步骤按完成时间排（读起来就是那整段旅程的先后）
    const steps = groupTasks.sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0));
    const lastStepAt = steps.reduce((max, t) => Math.max(max, t.doneAt ?? 0), 0);
    const archived = goal.status === 'archived';
    const at = archived ? (goal.completedAt ?? goal.updatedAt) : lastStepAt;
    leaves.push({
      id: goal.id,
      title: goal.title,
      sub: steps.length > 0 ? `共 ${steps.length} 个步骤` : '完成目标',
      doneText: formatDoneAt(at),
      at,
      steps: steps.map((t) => ({ title: t.title, doneText: formatDoneAt(t.doneAt) })),
    });
  }

  // 目标已经不在（被删除）的历史步骤：仍留一页，保住那段回忆
  for (const t of orphanTasks) {
    leaves.push({
      id: t.id,
      title: t.title,
      sub: '来自「已离开的目标」',
      doneText: formatDoneAt(t.doneAt),
      at: t.doneAt ?? 0,
      steps: [],
    });
  }

  return leaves.sort((a, b) => a.at - b.at);
}
