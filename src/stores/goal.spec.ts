/**
 * 目标收藏（V5.44）：收藏单位是目标，步骤随目标一起归档
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useGoalStore } from '@/stores/goal';
import { useTaskStore } from '@/stores/task';

describe('archiveGoal 收藏目标', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('已完成的目标连同步骤一起归档', () => {
    const goalStore = useGoalStore();
    const taskStore = useTaskStore();
    const goal = goalStore.addGoal({ title: '英语目标' });
    const t1 = taskStore.addTask({ goalId: goal.id, title: '背单词' });
    const t2 = taskStore.addTask({ goalId: goal.id, title: '做阅读' });
    taskStore.markDone(t1.id);
    taskStore.markDone(t2.id);

    expect(goalStore.getById(goal.id)?.status).toBe('completed');
    expect(goalStore.archiveGoal(goal.id)).toBe(2);

    expect(goalStore.getById(goal.id)?.status).toBe('archived');
    expect(taskStore.getById(t1.id)?.status).toBe('archived');
    expect(taskStore.getById(t2.id)?.status).toBe('archived');
  });

  it('已归档过的步骤也计入这一页，且不会重复操作', () => {
    const goalStore = useGoalStore();
    const taskStore = useTaskStore();
    const goal = goalStore.addGoal({ title: '英语目标' });
    const t1 = taskStore.addTask({ goalId: goal.id, title: '背单词' });
    const t2 = taskStore.addTask({ goalId: goal.id, title: '做阅读' });
    taskStore.markDone(t1.id);
    taskStore.markDone(t2.id);
    taskStore.archiveTask(t1.id);

    expect(goalStore.archiveGoal(goal.id)).toBe(2);
    expect(taskStore.getById(t1.id)?.status).toBe('archived');
    expect(taskStore.getById(t2.id)?.status).toBe('archived');
  });

  it('还有没做完的步骤时，目标不能收藏', () => {
    const goalStore = useGoalStore();
    const taskStore = useTaskStore();
    const goal = goalStore.addGoal({ title: '英语目标' });
    const t1 = taskStore.addTask({ goalId: goal.id, title: '背单词' });
    const t2 = taskStore.addTask({ goalId: goal.id, title: '做阅读' });
    taskStore.markDone(t1.id);

    expect(goalStore.archiveGoal(goal.id)).toBe(0);
    expect(goalStore.getById(goal.id)?.status).toBe('active');
    expect(taskStore.getById(t2.id)?.status).toBe('todo');
  });
});
