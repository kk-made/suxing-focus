/**
 * 规则引擎：自动排期（纯函数，无副作用，无 AI 参与）
 * ============================================================
 * 输入：任务、目标、用户可学设置、已有计划；输出：未来若干天的排期建议。
 *
 * 排期规则（代码硬计算，有单元测试保障）：
 * 1. 只排「可学习日」（userSettings.studyDaysOfWeek），窗口默认未来 14 个自然日；
 * 2. 每天排入总量不超过「每日可学时长」；手动安排、已完成条目与当日到期复习先占用额度；
 * 3. 任务处理顺序（V5.30e）：目标优先级高 → 低 → 截止日近 → 远
 *    → 步骤优先级高 → 低 → 创建早；
 *    目标「每日学习时长」> 0 时，其当日排入量不超过该值——
 *    当天该目标的第一条步骤不受此限（不拆分，也不留死结）；
 * 3.5 整块目标（V5.31「目标本身就是一步」）：没有步骤、本身就是一个步骤的
 *    进行中叶子目标作为整块候选，与步骤同场排序；预估时长 = 目标每日学习时长
 *    （未设按 GOAL_UNIT_DEFAULT_MINUTES）；生成时按目标名记下一条步骤；
 * 4. 不参与排期的任务：
 *    - 已完成（done）/ 已归档（archived，收入成就收藏集）的任务
 *    - 所属目标已完成/已归档/已删除的任务
 *    - 未来（今天及以后）已有手动安排或已完成条目的任务（避免重复安排；
 *      待完成的自动条目会在重新生成时被重建，不阻塞候选）
 *    - 已经有步骤的目标（不再整块出候选）；完成/归档的目标不整块出候选
 * 5. 单一任务不拆分：一条计划 = 一次完整投入；当天容不下则顺延到之后可容纳的最早一天；
 * 6. 窗口内放不下 → 进入 unscheduled 并附原因，不做静默丢弃。
 *
 * 重建范围（rebuildStartDateOnly）：
 * - 默认 false：窗口内（起始日及以后）待完成的自动条目全部视为「待重建」——
 *   整体重排（V5.46 起 UI 不再使用，保留给测试 / 未来的批量入口）；
 * - true：只有起始日当天的自动条目待重建，之后几天的自动安排视为既有承诺
 *   （不重复排期）——今日面板「自动排期」单日重排使用，未来几天的计划保持不动。
 */

import type { Goal, PlanItem, Priority, Task } from '@/types/models';
import { addDays, todayStr, weekdayOf } from '@/utils/date';
import { GOAL_UNIT_DEFAULT_MINUTES } from './constants';
import { steplessUnitGoals } from './goal';

/** 默认排期窗口（自然日天数） */
export const DEFAULT_SCHEDULE_WINDOW_DAYS = 14;

/** 排期输入 */
export interface ScheduleInput {
  /** 全量任务（内部自行过滤软删除/已完成） */
  tasks: Task[];
  /** 全量目标（内部自行过滤软删除/非进行中） */
  goals: Goal[];
  /** 每天可学分钟数 */
  dailyAvailableMinutes: number;
  /** 可学习日：0=周日 … 6=周六 */
  studyDaysOfWeek: number[];
  /** 全量已有计划（用于占用计算与去重） */
  existingPlan: PlanItem[];
  /** 每日到期复习的预留分钟（services/review.ts · reviewMinutesByDate 计算；计入当日额度） */
  reviewMinutesByDate?: Record<string, number>;
  /** 起始日期 yyyy-MM-dd，默认今天 */
  startDate?: string;
  /** 排期窗口天数（自然日），默认 14 */
  windowDays?: number;
  /**
   * 只重建起始日当天的自动条目（单日重排）：
   * true = 未来几天的待完成自动条目视为承诺（不重复排）；默认 false = 窗口内全部重建
   */
  rebuildStartDateOnly?: boolean;
}

/** 一条排期建议 */
export interface ScheduledItem {
  date: string;
  /** 步骤 id；整块目标（goalUnit）= 空串（生成时按目标名记下一条步骤） */
  taskId: string;
  goalId: string;
  plannedMinutes: number;
  /** true = 整块目标：没有步骤的目标本身就是一步（V5.31） */
  goalUnit?: boolean;
}

/** 未能排入的任务 */
export interface UnscheduledTask {
  taskId: string;
  goalId: string;
  title: string;
  reason: string;
}

/** 单日负载（预览用） */
export interface DailyLoad {
  date: string;
  /** 0=周日 … 6=周六 */
  weekday: number;
  /** 既有承诺占用：手动安排 + 已完成条目（分钟） */
  occupiedMinutes: number;
  /** 当日到期复习预留（分钟，遗忘曲线节点） */
  reviewMinutes: number;
  /** 本次建议新增（分钟） */
  plannedMinutes: number;
  /** 合计（分钟）= 占用 + 复习预留 + 新增 */
  totalMinutes: number;
  /** 当日额度（分钟） */
  capacityMinutes: number;
}

/** 排期结果 */
export interface SchedulePlan {
  items: ScheduledItem[];
  unscheduled: UnscheduledTask[];
  dailyLoad: DailyLoad[];
  /** 本次建议新增总时长（分钟） */
  totalPlannedMinutes: number;
  windowDays: number;
}

/** 优先级权重：高 → 低 */
const PRIORITY_WEIGHT: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** 无截止日的排序占位（排在所有真实日期之后） */
const NO_DEADLINE = '9999-12-31';

/** 排期工作单元：一天的剩余容量 */
interface DaySlot {
  date: string;
  weekday: number;
  capacityMinutes: number;
  occupiedMinutes: number;
  reviewMinutes: number;
  plannedMinutes: number;
  remainingMinutes: number;
}

/**
 * 生成排期建议（纯函数：相同输入必然得到相同输出，方便测试与预览）
 */
export function buildSchedule(input: ScheduleInput): SchedulePlan {
  const startDate = input.startDate ?? todayStr();
  const windowDays = input.windowDays ?? DEFAULT_SCHEDULE_WINDOW_DAYS;
  const goalById = new Map(input.goals.map((g) => [g.id, g]));

  /** 有效截止日：目标自己的截止日（空串 = 无） */
  const deadlineOf = (g: Goal): string => g.deadline || '';

  // 1) 「会被重建」的条目：
  //    - 默认：窗口内（今天及以后）待完成的自动排期。每次生成前都会整体清理并重排，
  //      因此它们既不阻塞候选任务、也不占额度，保证「重复生成结果一致」的幂等语义。
  //    - rebuildStartDateOnly = true（单日重排）：只有起始日当天的自动条目被重建，
  //      之后的自动条目走「既有承诺」分支（阻塞对应任务、不重复排期）。
  const isRebuiltItem = (i: PlanItem): boolean => {
    if (!(!i.deletedAt && i.source === 'auto' && i.status === 'pending')) {
      return false;
    }
    return input.rebuildStartDateOnly ? i.date === startDate : i.date >= startDate;
  };

  // 2) 其余窗口内条目 = 用户既有承诺（手动安排、已完成的条目）：
  //    - 对应任务不重复排期（避免重复安排）
  //    - 占用当日额度（时间已承诺或已花费）
  //    skipped 视为放弃：既不阻塞也不占额度
  const blockingItems = input.existingPlan.filter(
    (i) => !i.deletedAt && i.status !== 'skipped' && i.date >= startDate && !isRebuiltItem(i),
  );
  const scheduledTaskIds = new Set(blockingItems.map((i) => i.taskId));
  const occupiedByDate = new Map<string, number>();
  // 目标每日学习时长的当日已用量（key = `goalId|date`；手动 / 已完成条目同样计入）
  const usedByOwnerDate = new Map<string, number>();
  for (const i of blockingItems) {
    occupiedByDate.set(i.date, (occupiedByDate.get(i.date) ?? 0) + i.plannedMinutes);
    const key = `${i.goalId}|${i.date}`;
    usedByOwnerDate.set(key, (usedByOwnerDate.get(key) ?? 0) + i.plannedMinutes);
  }

  // 3) 组装排期日槽：窗口内只保留可学习日
  const studyDays = new Set(input.studyDaysOfWeek);
  const days: DaySlot[] = [];
  for (let offset = 0; offset < windowDays; offset += 1) {
    const date = addDays(startDate, offset);
    if (!studyDays.has(weekdayOf(date))) {
      continue;
    }
    const occupied = occupiedByDate.get(date) ?? 0;
    const reviewMinutes = input.reviewMinutesByDate?.[date] ?? 0;
    days.push({
      date,
      weekday: weekdayOf(date),
      capacityMinutes: input.dailyAvailableMinutes,
      occupiedMinutes: occupied,
      reviewMinutes,
      plannedMinutes: 0,
      remainingMinutes: Math.max(0, input.dailyAvailableMinutes - occupied - reviewMinutes),
    });
  }

  // 4) 候选组装 + 排序（V5.22：已归档的任务不参与排期；V5.30e：优先级先于截止日）
  //    候选 = 待办步骤 + 整块目标（没有步骤、目标本身就是一步；V5.31）
  interface Candidate {
    /** 步骤候选（整块目标没有 task） */
    task?: Task;
    goal: Goal;
    /** 标题（步骤名 / 目标名；unscheduled 展示用） */
    title: string;
    /** 本次安排的时长（步骤预估 / 整块目标：每日学习时长 || 默认） */
    estimateMinutes: number;
    /** 排序用：有效截止日（无 = 占位串排最后） */
    sortDeadline: string;
    /** 排序用：安排单元优先级（整块目标 = 目标优先级） */
    sortWeight: number;
    /** 排序用：创建序（整块目标 = 目标创建时间） */
    sortCreatedAt: number;
    /** 目标每日学习时长的预算归属 */
    owner: Goal;
    /** true = 整块目标（确认生成时按目标名记下一条步骤） */
    goalUnit: boolean;
  }

  const taskCandidates: Candidate[] = input.tasks
    .filter((t) => !t.deletedAt && t.status !== 'done' && t.status !== 'archived')
    .map((t) => ({ task: t, goal: goalById.get(t.goalId) }))
    .filter((x): x is { task: Task; goal: Goal } => {
      const g = x.goal;
      return !!g && !g.deletedAt && g.status === 'active';
    })
    .filter((x) => !scheduledTaskIds.has(x.task.id))
    .map((x) => ({
      task: x.task,
      goal: x.goal,
      title: x.task.title,
      estimateMinutes: x.task.estimateMinutes,
      sortDeadline: deadlineOf(x.goal) || NO_DEADLINE,
      sortWeight: PRIORITY_WEIGHT[x.task.priority],
      sortCreatedAt: x.task.createdAt,
      owner: x.goal,
      goalUnit: false,
    }));

  const unitCandidates: Candidate[] = steplessUnitGoals(input.goals, input.tasks).map((g) => ({
    goal: g,
    title: g.title,
    estimateMinutes: g.dailyMinutes > 0 ? g.dailyMinutes : GOAL_UNIT_DEFAULT_MINUTES,
    sortDeadline: deadlineOf(g) || NO_DEADLINE,
    sortWeight: PRIORITY_WEIGHT[g.priority],
    sortCreatedAt: g.createdAt,
    owner: g,
    goalUnit: true,
  }));

  const candidates = [...taskCandidates, ...unitCandidates].sort((a, b) => {
    // 4.1 目标优先级高 → 低（先排高优先级目标的安排）
    if (a.goal.priority !== b.goal.priority) {
      return PRIORITY_WEIGHT[a.goal.priority] - PRIORITY_WEIGHT[b.goal.priority];
    }
    // 4.2 同优先级下，截止日近 → 远（无截止排最后）
    if (a.sortDeadline !== b.sortDeadline) {
      return a.sortDeadline < b.sortDeadline ? -1 : 1;
    }
    // 4.3 截止相近时，安排单元优先级高 → 低（整块目标 = 目标优先级）
    if (a.sortWeight !== b.sortWeight) {
      return a.sortWeight - b.sortWeight;
    }
    // 4.4 创建时间早 → 晚（先建的先排）
    return a.sortCreatedAt - b.sortCreatedAt;
  });

  // 5) 贪心填充：每个候选放到「能完整容纳它的最早一天」
  //    （同时看全局额度与目标每日学习时长预算；V5.30e）
  const items: ScheduledItem[] = [];
  const unscheduled: UnscheduledTask[] = [];
  for (const cand of candidates) {
    if (days.length === 0) {
      unscheduled.push({
        taskId: cand.task?.id ?? '',
        goalId: cand.goal.id,
        title: cand.title,
        reason: '窗口内没有可学习的日子，请检查「每周可学习日」设置',
      });
      continue;
    }
    const slot = days.find((d) => {
      if (d.remainingMinutes < cand.estimateMinutes) {
        return false;
      }
      if (cand.owner.dailyMinutes <= 0) {
        return true;
      }
      // 当天该目标还没排入任何东西 → 允许整条排入；否则不超过每日学习时长
      const used = usedByOwnerDate.get(`${cand.owner.id}|${d.date}`) ?? 0;
      return used === 0 || used + cand.estimateMinutes <= cand.owner.dailyMinutes;
    });
    if (!slot) {
      unscheduled.push({
        taskId: cand.task?.id ?? '',
        goalId: cand.goal.id,
        title: cand.title,
        reason: cand.goalUnit
          ? `未来 ${windowDays} 天剩余额度装不下该目标，建议调高每日可学时长或目标的每日学习时长`
          : `未来 ${windowDays} 天剩余额度装不下该任务，建议调高每日时长或拆分任务`,
      });
      continue;
    }
    slot.remainingMinutes -= cand.estimateMinutes;
    slot.plannedMinutes += cand.estimateMinutes;
    const ownerKey = `${cand.owner.id}|${slot.date}`;
    usedByOwnerDate.set(ownerKey, (usedByOwnerDate.get(ownerKey) ?? 0) + cand.estimateMinutes);
    items.push({
      date: slot.date,
      taskId: cand.task?.id ?? '',
      goalId: cand.goal.id,
      plannedMinutes: cand.estimateMinutes,
      ...(cand.goalUnit ? { goalUnit: true } : {}),
    });
  }

  // 6) 汇总输出
  const dailyLoad: DailyLoad[] = days.map((d) => ({
    date: d.date,
    weekday: d.weekday,
    occupiedMinutes: d.occupiedMinutes,
    reviewMinutes: d.reviewMinutes,
    plannedMinutes: d.plannedMinutes,
    totalMinutes: d.occupiedMinutes + d.reviewMinutes + d.plannedMinutes,
    capacityMinutes: d.capacityMinutes,
  }));

  return {
    items,
    unscheduled,
    dailyLoad,
    totalPlannedMinutes: items.reduce((sum, i) => sum + i.plannedMinutes, 0),
    windowDays,
  };
}
