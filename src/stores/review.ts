/**
 * 艾宾浩斯复习项 store
 * ============================================================
 * 职责：维护「任务完成 → 到期复习 → 完成复习推进阶段」的代码计算计划。
 * - 复习间隔一律来自 constants.REVIEW_INTERVALS_DAYS（禁止 AI 计算）；
 * - 任务取消完成/被删除时，由调用方级联软删除对应复习项（保留历史）。
 */

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { ReviewItem } from '@/types/models';
import type { ReviewAdvance } from '@/services/review';
import { advanceReview, isReviewDue, isReviewFinished, reviewDueAt } from '@/services/review';
import { genId } from '@/utils/id';

export const useReviewStore = defineStore(
  'review',
  () => {
    /** 全量复习项（含软删除，用于本地历史与恢复） */
    const items = ref<ReviewItem[]>([]);

    /** 未删除的复习项 */
    const activeItems = computed(() => items.value.filter((item) => !item.deletedAt));

    /**
     * 为完成的任务创建复习计划（幂等：已有未完成项则复用，不重复创建）
     * 首次复习 = 完成日 + 第 1 个间隔（1 天）
     */
    function createForTask(taskId: string, goalId: string, doneAt: number): ReviewItem | null {
      const existing = items.value.find(
        (item) => item.taskId === taskId && !item.deletedAt && !isReviewFinished(item),
      );
      if (existing) {
        return null;
      }
      const now = Date.now();
      const item: ReviewItem = {
        id: genId('r_'),
        taskId,
        goalId,
        stage: 0,
        nextReviewAt: reviewDueAt(doneAt, 0),
        lastReviewedAt: null,
        reviewCount: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      items.value.unshift(item);
      return item;
    }

    /** 当前到期（含逾期）的复习项，按到期时间升序 */
    function listDue(now: number): ReviewItem[] {
      return activeItems.value
        .filter((item) => isReviewDue(item, now))
        .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
    }

    /** 完成一次复习：推进到下一阶段；走完全部阶段后保留记录（nextReviewAt 归零） */
    function completeReview(id: string): ReviewAdvance | null {
      const idx = items.value.findIndex((item) => item.id === id);
      if (idx < 0) {
        return null;
      }
      const advance = advanceReview(items.value[idx], Date.now());
      items.value[idx] = {
        ...items.value[idx],
        stage: advance.stage,
        nextReviewAt: advance.nextReviewAt,
        lastReviewedAt: advance.lastReviewedAt,
        reviewCount: advance.reviewCount,
        updatedAt: advance.lastReviewedAt,
      };
      return advance;
    }

    /** 软删除某任务的全部复习项（取消完成 / 删除任务时级联调用） */
    function removeByTask(taskId: string): number {
      const now = Date.now();
      let count = 0;
      items.value = items.value.map((item) => {
        if (item.taskId === taskId && !item.deletedAt) {
          count += 1;
          return { ...item, deletedAt: now, updatedAt: now };
        }
        return item;
      });
      return count;
    }

    /** 软删除某目标下的全部复习项（删除目标时级联调用） */
    function removeByGoal(goalId: string): number {
      const now = Date.now();
      let count = 0;
      items.value = items.value.map((item) => {
        if (item.goalId === goalId && !item.deletedAt) {
          count += 1;
          return { ...item, deletedAt: now, updatedAt: now };
        }
        return item;
      });
      return count;
    }

    /**
     * 物理移除某任务的全部复习项——仅用于任务被「彻底删除」（V5.22）
     * 常规删除请用 removeByTask（软删除、保留历史）。
     * @returns 被移除的复习项数量
     */
    function purgeByTask(taskId: string): number {
      const before = items.value.length;
      items.value = items.value.filter((item) => item.taskId !== taskId);
      return before - items.value.length;
    }

    /** 清空全部复习项（本地物理清空，配合「数据自检」） */
    function clearAll(): void {
      items.value = [];
    }

    return {
      items,
      activeItems,
      createForTask,
      listDue,
      completeReview,
      removeByTask,
      removeByGoal,
      purgeByTask,
      clearAll,
    };
  },
  { persist: true },
);
