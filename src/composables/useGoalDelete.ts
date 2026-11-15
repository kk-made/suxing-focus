/**
 * 目标删除的级联清理（V5.30，页面层共用的多步编排；V5.37：只有目标与步骤两层）
 * ============================================================
 * 一个目标被删除时：
 * 1. 它的计划条目 / 复习计划 / 未归档步骤 → 按各 store 口径清理（软删除 / 物理删除）；
 * 2. 目标本身 → 软删除。
 *
 * 已归档的步骤不随删除而抹去（收入囊中的回忆留在成就收藏集）。
 * 编辑页「删除目标」、详情页「确认删除」、列表页「删除」共用本函数，避免三处级联口径漂移。
 */

import { useGoalStore } from '@/stores/goal';
import { usePlanStore } from '@/stores/plan';
import { useReviewStore } from '@/stores/review';
import { useTaskStore } from '@/stores/task';

export function useGoalDelete() {
  const goalStore = useGoalStore();
  const taskStore = useTaskStore();
  const planStore = usePlanStore();
  const reviewStore = useReviewStore();

  /** 删除目标及其计划 / 复习 / 步骤 */
  function deleteGoalCascade(goalId: string): void {
    planStore.removePendingByGoal(goalId);
    reviewStore.removeByGoal(goalId);
    taskStore.removeByGoal(goalId);
    goalStore.removeGoal(goalId);
  }

  return { deleteGoalCascade };
}
