/**
 * 目标相关纯业务计算（无 UI / 无 store 依赖，方便单元测试）
 * 原则：进度、排序、剩余天数一律代码计算，不依赖任何 AI 或人工输入。
 */

import type { Goal, Priority, Task } from '@/types/models';
import { diffDays, todayStr } from '@/utils/date';

/** 目标进度统计结果 */
export interface GoalProgress {
  /** 任务总数（未删除） */
  totalTasks: number;
  /** 已完成任务数（含已归档：归档是完成后的收藏动作） */
  doneTasks: number;
  /** 全部任务预估总时长（分钟） */
  totalEstimateMinutes: number;
  /** 已完成任务预估总时长（分钟） */
  doneEstimateMinutes: number;
  /** 完成率 0-100（按任务数计算；无任务时为 0） */
  percent: number;
}

/** 根据任务列表计算目标进度（V5.22：已归档的任务仍计入进度历史，归档不让进度倒退） */
export function calcGoalProgress(tasks: Task[]): GoalProgress {
  const valid = tasks.filter((t) => !t.deletedAt);
  const done = valid.filter((t) => t.status === 'done' || t.status === 'archived');
  return {
    totalTasks: valid.length,
    doneTasks: done.length,
    totalEstimateMinutes: valid.reduce((sum, t) => sum + t.estimateMinutes, 0),
    doneEstimateMinutes: done.reduce((sum, t) => sum + t.estimateMinutes, 0),
    percent: valid.length === 0 ? 0 : Math.round((done.length / valid.length) * 100),
  };
}

/** 目标状态排序权重：进行中 → 已完成 → 已归档 */
const GOAL_STATUS_WEIGHT: Record<Goal['status'], number> = {
  active: 0,
  completed: 1,
  archived: 2,
};

/** 优先级排序权重：高 → 中 → 低 */
const PRIORITY_WEIGHT: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** 无截止日期时的排序占位符（排在所有真实日期之后） */
const NO_DEADLINE_SORT_KEY = '9999-12-31';

/**
 * 目标列表排序（不修改原数组）：
 * 1. 状态：进行中 → 已完成 → 已归档
 * 2. 截止日期近 → 远（未设置截止排最后）
 * 3. 优先级 高 → 低
 * 4. 最后按更新时间 新 → 旧
 */
export function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    if (a.status !== b.status) {
      return GOAL_STATUS_WEIGHT[a.status] - GOAL_STATUS_WEIGHT[b.status];
    }
    // yyyy-MM-dd 字符串的字典序即时间序，可直接比较
    const da = a.deadline || NO_DEADLINE_SORT_KEY;
    const db = b.deadline || NO_DEADLINE_SORT_KEY;
    if (da !== db) {
      return da < db ? -1 : 1;
    }
    if (a.priority !== b.priority) {
      return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    }
    return b.updatedAt - a.updatedAt;
  });
}

/**
 * 学习步骤（任务）列表排序（不修改原数组）：
 * 未完成在前，再按创建时间升序（先加的在上）——目标详情页与目标列表展开区共用
 */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const da = a.status === 'done' ? 1 : 0;
    const db = b.status === 'done' ? 1 : 0;
    if (da !== db) {
      return da - db;
    }
    return a.createdAt - b.createdAt;
  });
}

/** 截止日期人话文案：剩 N 天 / 今天截止 / 已逾期 N 天 / 未设置 */
export function deadlineText(deadline: string): string {
  if (!deadline) {
    return '未设置截止';
  }
  const rest = diffDays(todayStr(), deadline);
  if (rest > 0) {
    return `剩 ${rest} 天`;
  }
  if (rest === 0) {
    return '今天截止';
  }
  return `已逾期 ${-rest} 天`;
}

/** 是否已逾期（有截止日期且早于今天） */
export function isOverdue(deadline: string): boolean {
  return !!deadline && diffDays(todayStr(), deadline) < 0;
}

/**
 * 目标完成状态随步骤同步（V5.32：完成只发生在今日，目标页只负责呈现）：
 * 步骤全部完成（含已归档的）→ 'completed'；还有没做完的 → 'active'；
 * 一条步骤都没有 → 没有可同步的信息，保持原状态（不擅自把已完成的目标改回进行中）。
 */
export function goalStatusFromTasks(
  tasks: Task[],
  current: 'active' | 'completed' = 'active',
): 'active' | 'completed' {
  const valid = tasks.filter((t) => !t.deletedAt);
  if (valid.length === 0) {
    return current;
  }
  return valid.every((t) => t.status === 'done' || t.status === 'archived') ? 'completed' : 'active';
}

/**
 * 「目标本身就是一步」候选（V5.31；V5.37：只分目标与步骤——带步骤的目标由步骤出面，
 * 不带步骤的目标整体算一步）
 * 进行中、一条未删除步骤都没有的目标。排期引擎与今日「手动挑选」共用同一判定。
 * 传入顺序即输出顺序（调用方需要「录入序」时自行反向遍历 store 数组）。
 */
export function steplessUnitGoals(goals: Goal[], tasks: Task[]): Goal[] {
  const visible = goals.filter((g) => !g.deletedAt);
  const liveTasks = tasks.filter((t) => !t.deletedAt);
  return visible.filter(
    (g) => g.status === 'active' && !liveTasks.some((t) => t.goalId === g.id),
  );
}
