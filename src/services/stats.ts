/**
 * 学习统计与计时数学的纯业务计算（无 UI / 无 store 依赖，方便单元测试）
 * 原则：所有时长、聚合、连续天数均由代码计算；AI 与人工输入一律不参与。
 */

import type { Goal, StudyLog } from '@/types/models';
import { MIN_VALID_LOG_MINUTES } from '@/services/constants';
import { addDays, pad2 } from '@/utils/date';

/* ==================== 计时数学 ==================== */

/** 计时会话中参与计算的最小字段集（TimerSession 天然兼容） */
export interface TimerStateLike {
  /** 已累计学习毫秒（不含当前运行段） */
  accumulatedMs: number;
  running: boolean;
  /** 当前运行段起始时间戳；暂停中为 null */
  lastResumeAt: number | null;
}

/**
 * 计算会话当前已累计的学习毫秒数
 * 运行中 = 已累计 + (now - 当前运行段起点)；暂停中 = 已累计
 * 时钟回拨时做防御，保证结果不为负。
 */
export function calcElapsedMs(session: TimerStateLike, now: number): number {
  if (!session.running || session.lastResumeAt === null) {
    return Math.max(0, session.accumulatedMs);
  }
  return Math.max(0, session.accumulatedMs + Math.max(0, now - session.lastResumeAt));
}

/** 学习毫秒数 → 记录分钟数（四舍五入，不低于最小有效时长） */
export function calcLogMinutes(elapsedMs: number): number {
  return Math.max(MIN_VALID_LOG_MINUTES, Math.round(elapsedMs / 60000));
}

/** 时长是否达到最小有效值（不足则由调用方丢弃本次计时，不写入记录） */
export function isDurationValid(elapsedMs: number): boolean {
  return elapsedMs >= MIN_VALID_LOG_MINUTES * 60000;
}

/** 计时时钟文本：mm:ss（超过 1 小时为 h:mm:ss） */
export function formatClock(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${pad2(minutes)}:${pad2(seconds)}`
    : `${pad2(minutes)}:${pad2(seconds)}`;
}

/** 分钟数的人话文案：45 分钟 / 1 小时 / 1 小时 25 分钟 */
export function formatDurationText(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) {
    return `${total} 分钟`;
  }
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
}

/* ==================== 学习记录聚合 ==================== */

/** 过滤掉软删除后的学习记录 */
export function activeLogs(logs: StudyLog[]): StudyLog[] {
  return logs.filter((log) => !log.deletedAt);
}

/** 累计学习分钟数 */
export function totalMinutes(logs: StudyLog[]): number {
  return activeLogs(logs).reduce((sum, log) => sum + log.durationMinutes, 0);
}

/** 某天的学习分钟数 */
export function minutesOnDate(logs: StudyLog[], date: string): number {
  return activeLogs(logs).reduce(
    (sum, log) => (log.date === date ? sum + log.durationMinutes : sum),
    0,
  );
}

/** [from, to] 闭区间内的学习分钟数（yyyy-MM-dd 直接按字典序比较即可） */
export function minutesInRange(logs: StudyLog[], from: string, to: string): number {
  return activeLogs(logs).reduce(
    (sum, log) => (log.date >= from && log.date <= to ? sum + log.durationMinutes : sum),
    0,
  );
}

/** 趋势图的单日数据点 */
export interface DayPoint {
  date: string;
  minutes: number;
}

/** 截至 endDate（含）的近 N 天每日分钟数（从旧到新排列） */
export function lastNDaysSeries(logs: StudyLog[], endDate: string, days = 7): DayPoint[] {
  const points: DayPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(endDate, -offset);
    points.push({ date, minutes: minutesOnDate(logs, date) });
  }
  return points;
}

/**
 * 连续学习天数：
 * - 今天已有记录：从今天起向前数连续有记录的天数；
 * - 今天还没学：从昨天起向前数（今天尚未学习不打断连续）；
 * - 今天和昨天都没有：0。
 */
export function streakDays(logs: StudyLog[], today: string): number {
  const studiedDates = new Set(activeLogs(logs).map((log) => log.date));
  let cursor = studiedDates.has(today) ? today : addDays(today, -1);
  if (!studiedDates.has(cursor)) {
    return 0;
  }
  let count = 0;
  while (studiedDates.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/** 目标维度的投入占比切片 */
export interface GoalSlice {
  goalId: string;
  title: string;
  minutes: number;
  /** 占总学习时长的比例 0-1 */
  ratio: number;
}

/** 按目标聚合学习时长（降序）；自由学习（goalId 为空串）单独成组 */
export function distributionByGoal(logs: StudyLog[], goals: Goal[]): GoalSlice[] {
  const sums = new Map<string, number>();
  for (const log of activeLogs(logs)) {
    sums.set(log.goalId, (sums.get(log.goalId) ?? 0) + log.durationMinutes);
  }
  const total = Array.from(sums.values()).reduce((sum, minutes) => sum + minutes, 0);
  const slices: GoalSlice[] = [];
  sums.forEach((minutes, goalId) => {
    let title = '未知目标';
    if (goalId === '') {
      title = '自由学习';
    } else {
      const goal = goals.find((g) => g.id === goalId);
      if (goal) {
        title = goal.title;
      }
    }
    slices.push({ goalId, title, minutes, ratio: total === 0 ? 0 : minutes / total });
  });
  return slices.sort((a, b) => b.minutes - a.minutes);
}
