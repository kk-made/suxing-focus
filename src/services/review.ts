/**
 * 艾宾浩斯复习计划纯计算（无 UI / 无 store 依赖，方便单元测试）
 * ============================================================
 * 规则（全部代码计算，AI 不参与）：
 * - 任务完成当天记为第 0 天；间隔表见 constants.REVIEW_INTERVALS_DAYS；
 * - 下一次复习 = 上一次复习完成日 + 下一步间隔天数（相对排程：
 *   迟到复习只影响下一次的起点，不会打乱整个计划的节奏）；
 * - 到期判定：复习日 00:00 起即到期（nextReviewAt <= now）；
 * - stage 达到间隔表长度 = 全部复习完成。
 */

import type { ReviewItem } from '@/types/models';
import { REVIEW_ESTIMATE_MINUTES, REVIEW_INTERVALS_DAYS } from '@/services/constants';
import { addDays, diffDays, formatDate, parseDate } from '@/utils/date';

/** 从 from 时间戳起、前进第 stage 步对应间隔后的复习日 00:00 时间戳 */
export function reviewDueAt(from: number, stage: number): number {
  // 防御：下标越界时取最后一个间隔（正常流程不会触发）
  const index = Math.min(stage, REVIEW_INTERVALS_DAYS.length - 1);
  const dateStr = addDays(formatDate(new Date(from)), REVIEW_INTERVALS_DAYS[index]);
  return parseDate(dateStr).getTime();
}

/** 是否已全部复习完成（stage 达到间隔表长度） */
export function isReviewFinished(item: ReviewItem): boolean {
  return item.stage >= REVIEW_INTERVALS_DAYS.length;
}

/** 是否到期需要复习（未删除、未全部完成、已到复习日） */
export function isReviewDue(item: ReviewItem, now: number): boolean {
  return !item.deletedAt && !isReviewFinished(item) && item.nextReviewAt <= now;
}

/**
 * 统计窗口内每天到期的复习「预留分钟」（排期额度扣除用，V5.21）
 * - 未删除、未全部完成的复习项按 nextReviewAt 归属日期；逾期的统一归到起始日（今天）；
 * - 每条按 REVIEW_ESTIMATE_MINUTES 计；
 * - 返回 { 'yyyy-MM-dd': 分钟数 }，只包含窗口内有复习的日期。
 */
export function reviewMinutesByDate(
  items: ReviewItem[],
  fromDate: string,
  days: number,
): Record<string, number> {
  const map: Record<string, number> = {};
  if (days <= 0) {
    return map;
  }
  const endDate = addDays(fromDate, days - 1);
  for (const item of items) {
    if (item.deletedAt || isReviewFinished(item) || item.nextReviewAt <= 0) {
      continue;
    }
    const dueDate = formatDate(new Date(item.nextReviewAt));
    const date = dueDate < fromDate ? fromDate : dueDate; // 逾期 → 归到今天
    if (date > endDate) {
      continue;
    }
    map[date] = (map[date] ?? 0) + REVIEW_ESTIMATE_MINUTES;
  }
  return map;
}

/** 完成一次复习后的新状态（纯函数，不改入参） */
export interface ReviewAdvance {
  stage: number;
  nextReviewAt: number;
  lastReviewedAt: number;
  reviewCount: number;
  /** 本次复习后是否已全部完成 */
  finished: boolean;
}

/** 完成一次复习：推进阶段并计算下次复习时间 */
export function advanceReview(item: ReviewItem, now: number): ReviewAdvance {
  const nextStage = item.stage + 1;
  const finished = nextStage >= REVIEW_INTERVALS_DAYS.length;
  return {
    stage: nextStage,
    nextReviewAt: finished ? 0 : reviewDueAt(now, nextStage),
    lastReviewedAt: now,
    reviewCount: item.reviewCount + 1,
    finished,
  };
}

/** 复习进度统计（用于统计页） */
export interface ReviewStats {
  /** 未删除的复习项总数 */
  total: number;
  /** 仍在进行（未全部完成）的项数 */
  pending: number;
  /** 当前到期（含逾期）的项数 */
  dueNow: number;
  /** 已全部完成的项数 */
  completed: number;
  /** 完成率 0-100（按项数） */
  percent: number;
  /** 已完成的复习次数（每条按 stage 计，封顶间隔表长度） */
  stagesDone: number;
  /** 总复习次数（未删除项 × 间隔表长度） */
  stagesTotal: number;
  /** 复习进度 0-100（按次数计，统计页用） */
  stagePercent: number;
}

/** 汇总复习进度 */
export function reviewStats(items: ReviewItem[], now: number): ReviewStats {
  const active = items.filter((item) => !item.deletedAt);
  const completed = active.filter((item) => isReviewFinished(item)).length;
  const pending = active.length - completed;
  const dueNow = active.filter((item) => isReviewDue(item, now)).length;
  const stagesTotal = active.length * REVIEW_INTERVALS_DAYS.length;
  const stagesDone = active.reduce(
    (sum, item) => sum + Math.min(item.stage, REVIEW_INTERVALS_DAYS.length),
    0,
  );
  return {
    total: active.length,
    pending,
    dueNow,
    completed,
    percent: active.length === 0 ? 0 : Math.round((completed / active.length) * 100),
    stagesDone,
    stagesTotal,
    stagePercent: stagesTotal === 0 ? 0 : Math.round((stagesDone / stagesTotal) * 100),
  };
}

/** 复习到期文案：「今天」「已逾期 N 天」「N 天后」（“今天”由调用方传入 now，便于测试） */
export function reviewDueText(nextReviewAt: number, now: number): string {
  const delta = diffDays(formatDate(new Date(now)), formatDate(new Date(nextReviewAt)));
  if (delta === 0) {
    return '今天';
  }
  if (delta < 0) {
    return `已逾期 ${-delta} 天`;
  }
  return `${delta} 天后`;
}
