/**
 * services/review.ts 单元测试
 * 基准：doneAt = 2026-10-15 10:30（周四）完成任务
 */

import { describe, expect, it } from 'vitest';
import type { ReviewItem } from '@/types/models';
import { REVIEW_INTERVALS_DAYS } from '@/services/constants';
import {
  advanceReview,
  isReviewDue,
  isReviewFinished,
  reviewDueAt,
  reviewDueText,
  reviewStats,
} from '@/services/review';

/** 2026-10-15 10:30 的时间戳 */
const DONE_AT = new Date(2026, 9, 15, 10, 30).getTime();

/** 构造复习项（首次复习时间默认按 DONE_AT 计算） */
function makeItem(over: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'r_test',
    taskId: 't_test',
    goalId: 'g_test',
    stage: 0,
    nextReviewAt: reviewDueAt(DONE_AT, 0),
    lastReviewedAt: null,
    reviewCount: 0,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...over,
  };
}

describe('reviewDueAt 复习日计算', () => {
  it('第 1 次复习 = 完成日 + 1 天的 00:00', () => {
    const due = new Date(reviewDueAt(DONE_AT, 0));
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth() + 1).toBe(10);
    expect(due.getDate()).toBe(16);
    expect(due.getHours()).toBe(0);
  });

  it('跨月正确进位', () => {
    const at = new Date(2026, 9, 31, 23, 0).getTime(); // 10-31 深夜
    const due = new Date(reviewDueAt(at, 0));
    expect(due.getMonth() + 1).toBe(11);
    expect(due.getDate()).toBe(1);
  });
});

describe('isReviewDue 到期判定', () => {
  it('复习日 00:00 起到期，前一天不到期', () => {
    const item = makeItem();
    expect(isReviewDue(item, item.nextReviewAt - 1)).toBe(false);
    expect(isReviewDue(item, item.nextReviewAt)).toBe(true);
  });

  it('软删除或已全部完成的项不再到期', () => {
    const finished = makeItem({ stage: REVIEW_INTERVALS_DAYS.length, nextReviewAt: 0 });
    expect(isReviewDue(finished, Date.now())).toBe(false);
    const deleted = makeItem({ deletedAt: 1 });
    expect(isReviewDue(deleted, Date.now())).toBe(false);
  });
});

describe('advanceReview 推进阶段', () => {
  it('完成第 1 次复习后，下一次 = 本次完成日 + 下一个间隔（相对排程）', () => {
    const item = makeItem();
    const first = advanceReview(item, item.nextReviewAt); // 在复习日当天完成
    expect(first.stage).toBe(1);
    expect(first.reviewCount).toBe(1);
    expect(first.finished).toBe(false);
    // 第 2 次复习 = 10-16 + 2 天 = 10-18
    const due = new Date(first.nextReviewAt);
    expect(due.getMonth() + 1).toBe(10);
    expect(due.getDate()).toBe(18);
  });

  it('走完整个间隔表后标记完成，nextReviewAt 归零', () => {
    let item = makeItem();
    for (let i = 0; i < REVIEW_INTERVALS_DAYS.length; i += 1) {
      const advance = advanceReview(item, item.nextReviewAt);
      item = {
        ...item,
        stage: advance.stage,
        nextReviewAt: advance.nextReviewAt,
        lastReviewedAt: advance.lastReviewedAt,
        reviewCount: advance.reviewCount,
      };
    }
    expect(item.stage).toBe(REVIEW_INTERVALS_DAYS.length);
    expect(item.nextReviewAt).toBe(0);
    expect(item.reviewCount).toBe(REVIEW_INTERVALS_DAYS.length);
    expect(isReviewFinished(item)).toBe(true);
  });

  it('不修改入参（纯函数）', () => {
    const item = makeItem();
    advanceReview(item, item.nextReviewAt);
    expect(item.stage).toBe(0);
    expect(item.reviewCount).toBe(0);
    expect(item.nextReviewAt).toBe(reviewDueAt(DONE_AT, 0));
  });
});

describe('reviewStats 复习进度统计', () => {
  it('统计总数 / 到期 / 进行中 / 已完成与完成率', () => {
    const now = makeItem().nextReviewAt; // 第 1 个复习日
    const items = [
      makeItem({ id: 'r1' }), // 到期
      makeItem({ id: 'r2', nextReviewAt: now + 86400000 }), // 未到期
      makeItem({ id: 'r3', stage: REVIEW_INTERVALS_DAYS.length, nextReviewAt: 0 }), // 已全部完成
      makeItem({ id: 'r4', deletedAt: 1 }), // 软删除不参与
    ];
    const stats = reviewStats(items, now);
    expect(stats.total).toBe(3);
    expect(stats.dueNow).toBe(1);
    expect(stats.pending).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.percent).toBe(33);
    expect(stats.stagesDone).toBe(REVIEW_INTERVALS_DAYS.length);
    expect(stats.stagesTotal).toBe(REVIEW_INTERVALS_DAYS.length * 3);
    expect(stats.stagePercent).toBe(33);
  });

  it('复习进度按次数计：走完 6 / 7 次也算进度，不等到整项完成', () => {
    const now = Date.now();
    const almost = makeItem({
      stage: REVIEW_INTERVALS_DAYS.length - 1,
      nextReviewAt: now + 86400000,
    });
    const stats = reviewStats([almost], now);
    expect(stats.percent).toBe(0);
    expect(stats.stagePercent).toBe(
      Math.round(((REVIEW_INTERVALS_DAYS.length - 1) / REVIEW_INTERVALS_DAYS.length) * 100),
    );
  });

  it('空数据完成率与复习进度都为 0', () => {
    expect(reviewStats([], Date.now())).toEqual({
      total: 0,
      pending: 0,
      dueNow: 0,
      completed: 0,
      percent: 0,
      stagesDone: 0,
      stagesTotal: 0,
      stagePercent: 0,
    });
  });
});

describe('reviewDueText 文案', () => {
  const now = new Date(2026, 9, 15, 12, 0).getTime(); // 10-15 中午

  it('今天 / 逾期 / 未来', () => {
    expect(reviewDueText(new Date(2026, 9, 15, 0, 0).getTime(), now)).toBe('今天');
    expect(reviewDueText(new Date(2026, 9, 12, 0, 0).getTime(), now)).toBe('已逾期 3 天');
    expect(reviewDueText(new Date(2026, 9, 17, 0, 0).getTime(), now)).toBe('2 天后');
  });
});
