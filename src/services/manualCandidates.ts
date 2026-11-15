/**
 * 手动挑选候选（V5.46）
 * ============================================================
 * 「今日安排面板」与「调整排期」页共用：
 * ① 待办步骤——未完成、所选日期还没排入、所属目标进行中；
 * ② 没拆步骤的进行中目标——目标本身就是一步，加入时按目标名记下一条步骤。
 * 排序与自动排期引擎同一套：目标优先级 → 有效截止日 → 步骤优先级 → 创建序。
 */

import type { Goal, Priority, Task } from '@/types/models';
import { GOAL_UNIT_DEFAULT_MINUTES } from './constants';
import { steplessUnitGoals } from './goal';

const PRIORITY_WEIGHT: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
/** 无截止日的排序占位（排在所有真实日期之后，与规则引擎一致） */
const NO_DEADLINE = '9999-12-31';

interface CandidateSort {
  sortDeadline: string;
  sortWeight: number;
  sortGoalWeight: number;
  sortCreatedAt: number;
}

/** 待办步骤候选 */
export interface ManualTaskCandidate extends CandidateSort {
  kind: 'task';
  id: string;
  title: string;
  /** 本次要投入的分钟数 */
  minutes: number;
  task: Task;
  goal: Goal;
}

/** 没拆步骤的进行中目标候选（加入时按目标名记下第一条步骤） */
export interface ManualGoalCandidate extends CandidateSort {
  kind: 'goal';
  id: string;
  title: string;
  /** 本次要投入的分钟数 */
  minutes: number;
  goal: Goal;
}

export type ManualCandidate = ManualTaskCandidate | ManualGoalCandidate;

/** 一个目标下的可挑选项：目标 + 它的步骤，像目标页一样展开 */
export interface ManualCandidateGroup {
  goal: Goal;
  candidates: ManualCandidate[];
}

/**
 * 组装候选池。
 * @param goals 全部目标（含已删除，函数内过滤）
 * @param tasks 全部步骤（含已删除，函数内过滤）
 * @param plannedTaskIds 目标日期上已经排入的步骤 id（不重复挑）
 */
export function manualCandidates(
  goals: Goal[],
  tasks: Task[],
  plannedTaskIds: ReadonlySet<string>,
): ManualCandidate[] {
  const steps: ManualTaskCandidate[] = tasks
    .filter(
      (t) =>
        !t.deletedAt &&
        (t.status === 'todo' || t.status === 'doing') &&
        !plannedTaskIds.has(t.id),
    )
    .map((t) => ({ task: t, goal: goals.find((g) => g.id === t.goalId && !g.deletedAt) }))
    .filter(
      (x): x is { task: Task; goal: Goal } =>
        !!x.goal && x.goal.status === 'active',
    )
    .map(({ task: t, goal }) => {
      const deadline = goal.deadline || '';
      return {
        kind: 'task' as const,
        id: t.id,
        title: t.title,
        minutes: t.estimateMinutes,
        task: t,
        goal,
        sortDeadline: deadline || NO_DEADLINE,
        sortWeight: PRIORITY_WEIGHT[t.priority],
        sortGoalWeight: PRIORITY_WEIGHT[goal.priority],
        sortCreatedAt: t.createdAt,
      };
    });

  // 反向遍历（新的在前）：同一毫秒批量创建的目标也保持录入顺序
  const steplessGoals: ManualGoalCandidate[] = steplessUnitGoals(
    [...goals].reverse(),
    tasks,
  ).map((g) => {
    const deadline = g.deadline || '';
    const minutes = (g.dailyMinutes ?? 0) > 0 ? g.dailyMinutes : GOAL_UNIT_DEFAULT_MINUTES;
    return {
      kind: 'goal' as const,
      id: `goal:${g.id}`,
      title: g.title,
      minutes,
      goal: g,
      sortDeadline: deadline || NO_DEADLINE,
      sortWeight: PRIORITY_WEIGHT[g.priority],
      sortGoalWeight: PRIORITY_WEIGHT[g.priority],
      sortCreatedAt: g.createdAt,
    };
  });

  return [...steps, ...steplessGoals].sort(
    (a, b) =>
      a.sortGoalWeight - b.sortGoalWeight ||
      (a.sortDeadline < b.sortDeadline ? -1 : a.sortDeadline > b.sortDeadline ? 1 : 0) ||
      a.sortWeight - b.sortWeight ||
      a.sortCreatedAt - b.sortCreatedAt,
  );
}

/** 把扁平的候选按所属目标分组，组内保持原排序（步骤优先级 → 创建序） */
export function groupManualCandidates(candidates: ManualCandidate[]): ManualCandidateGroup[] {
  const groups = new Map<string, ManualCandidateGroup>();
  for (const cand of candidates) {
    let group = groups.get(cand.goal.id);
    if (!group) {
      group = { goal: cand.goal, candidates: [] };
      groups.set(cand.goal.id, group);
    }
    group.candidates.push(cand);
  }
  return [...groups.values()];
}
