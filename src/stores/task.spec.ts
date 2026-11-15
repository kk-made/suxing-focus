/**
 * 步骤完成 → 复习创建的门控（V5.41）
 * 只测「是否排复习」这一条链路，排期/统计规则在 services 各自的 spec 里覆盖。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Task } from '@/types/models';
import { useGoalStore } from '@/stores/goal';
import { useReviewStore } from '@/stores/review';
import { useTaskStore } from '@/stores/task';

describe('步骤复习开关 reviewEnabled', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function makeGoal(): string {
    return useGoalStore().addGoal({ title: '测试目标' }).id;
  }

  it('默认开启：完成后创建一条复习项', () => {
    const taskStore = useTaskStore();
    const reviewStore = useReviewStore();
    const task = taskStore.addTask({ goalId: makeGoal(), title: '背单词' });

    expect(task.reviewEnabled).toBe(true);

    taskStore.markDone(task.id);

    expect(reviewStore.activeItems).toHaveLength(1);
    expect(reviewStore.activeItems[0].taskId).toBe(task.id);
  });

  it('关掉后完成：不创建复习项', () => {
    const taskStore = useTaskStore();
    const reviewStore = useReviewStore();
    const task = taskStore.addTask({ goalId: makeGoal(), title: '一次性整理', reviewEnabled: false });

    expect(task.reviewEnabled).toBe(false);

    taskStore.markDone(task.id);

    expect(reviewStore.activeItems).toHaveLength(0);
  });

  it('setStatus(done) 同样遵守开关', () => {
    const taskStore = useTaskStore();
    const reviewStore = useReviewStore();
    const task = taskStore.addTask({ goalId: makeGoal(), title: '一次性整理', reviewEnabled: false });

    taskStore.setStatus(task.id, 'done');

    expect(reviewStore.activeItems).toHaveLength(0);
  });

  it('旧数据没有该字段：按开启处理', () => {
    const taskStore = useTaskStore();
    const reviewStore = useReviewStore();
    const legacy = {
      id: 't_legacy',
      goalId: makeGoal(),
      title: '旧步骤',
      estimateMinutes: 25,
      priority: 'medium',
      status: 'todo',
      doneAt: null,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    } as unknown as Task;
    taskStore.tasks.push(legacy);

    taskStore.markDone(legacy.id);

    expect(reviewStore.activeItems).toHaveLength(1);
  });

  it('取消完成：连带撤销复习项', () => {
    const taskStore = useTaskStore();
    const reviewStore = useReviewStore();
    const task = taskStore.addTask({ goalId: makeGoal(), title: '背单词' });

    taskStore.setStatus(task.id, 'done');
    expect(reviewStore.activeItems).toHaveLength(1);

    taskStore.setStatus(task.id, 'todo');
    expect(reviewStore.activeItems).toHaveLength(0);
  });
});
