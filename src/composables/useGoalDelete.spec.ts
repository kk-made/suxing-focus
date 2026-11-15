/**
 * 目标删除级联（V5.46）：进行中的目标也能删，已归档的回忆留下
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useGoalDelete } from '@/composables/useGoalDelete';
import { useGoalStore } from '@/stores/goal';
import { usePlanStore } from '@/stores/plan';
import { useReviewStore } from '@/stores/review';
import { useTaskStore } from '@/stores/task';

describe('deleteGoalCascade', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('进行中的目标连同步骤、待完成安排与复习一起删除', () => {
    const goalStore = useGoalStore();
    const taskStore = useTaskStore();
    const planStore = usePlanStore();
    const reviewStore = useReviewStore();
    const { deleteGoalCascade } = useGoalDelete();

    const goal = goalStore.addGoal({ title: '立错的目标' });
    const done = taskStore.addTask({ goalId: goal.id, title: '已做的步骤' });
    const todo = taskStore.addTask({ goalId: goal.id, title: '还没做的步骤' });
    taskStore.markDone(done.id);
    planStore.addItem({ date: '2026-10-21', taskId: todo.id, goalId: goal.id, plannedMinutes: 25 });

    expect(goalStore.getById(goal.id)?.status).toBe('active');
    expect(reviewStore.activeItems).toHaveLength(1);

    deleteGoalCascade(goal.id);

    expect(goalStore.getById(goal.id)).toBeUndefined();
    expect(taskStore.getById(done.id)).toBeUndefined();
    expect(taskStore.getById(todo.id)).toBeUndefined();
    expect(planStore.items.filter((i) => !i.deletedAt && i.goalId === goal.id)).toHaveLength(0);
    expect(reviewStore.activeItems).toHaveLength(0);
  });

  it('已归档的步骤不随目标删除而抹去', () => {
    const goalStore = useGoalStore();
    const taskStore = useTaskStore();
    const { deleteGoalCascade } = useGoalDelete();

    const goal = goalStore.addGoal({ title: '要删除的目标' });
    const done = taskStore.addTask({ goalId: goal.id, title: '要留下的回忆' });
    taskStore.markDone(done.id);
    taskStore.archiveTask(done.id);

    deleteGoalCascade(goal.id);

    expect(goalStore.getById(goal.id)).toBeUndefined();
    expect(taskStore.getById(done.id)?.status).toBe('archived');
  });
});
