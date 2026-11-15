/**
 * 跨天旧安排（V5.43）：列出候选、接到今天、放回目标
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useGoalStore } from '@/stores/goal';
import { usePlanStore } from '@/stores/plan';
import { useTaskStore } from '@/stores/task';

const TODAY = '2026-10-21';
const YESTERDAY = '2026-10-20';

describe('今日旧安排', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function setup() {
    const goal = useGoalStore().addGoal({ title: '测试目标' });
    const taskStore = useTaskStore();
    const t1 = taskStore.addTask({ goalId: goal.id, title: '旧任务一' });
    const t2 = taskStore.addTask({ goalId: goal.id, title: '旧任务二' });
    const t3 = taskStore.addTask({ goalId: goal.id, title: '今天已排' });
    const t4 = taskStore.addTask({ goalId: goal.id, title: '已经做完' });
    const planStore = usePlanStore();

    planStore.addItem({ date: YESTERDAY, taskId: t1.id, goalId: goal.id, plannedMinutes: 25 });
    planStore.addItem({ date: '2026-10-19', taskId: t1.id, goalId: goal.id, plannedMinutes: 35 });
    planStore.addItem({ date: YESTERDAY, taskId: t2.id, goalId: goal.id, plannedMinutes: 20 });
    planStore.addItem({ date: TODAY, taskId: t3.id, goalId: goal.id, plannedMinutes: 30 });
    planStore.addItem({ date: YESTERDAY, taskId: t3.id, goalId: goal.id, plannedMinutes: 30 });
    planStore.addItem({ date: YESTERDAY, taskId: t4.id, goalId: goal.id, plannedMinutes: 15 });
    taskStore.markDone(t4.id);

    return { goal, planStore, t1, t2, t3 };
  }

  it('候选只含仍待办、且今天没排过的任务，同一任务只留最近一条', () => {
    const { planStore, t1, t2 } = setup();

    const candidates = planStore.listCarryCandidates(TODAY);

    expect(candidates.map((i) => i.taskId)).toEqual([t1.id, t2.id]);
    expect(candidates.find((i) => i.taskId === t1.id)?.plannedMinutes).toBe(25);
  });

  it('接到今天：新条目落在当天末尾，旧条目收起留历史', () => {
    const { planStore, t1, t2, t3 } = setup();

    expect(planStore.carryPendingBeforeTo(TODAY)).toBe(2);

    const today = planStore.listByDate(TODAY);
    expect(today.map((i) => i.taskId)).toEqual([t3.id, t1.id, t2.id]);
    expect(today.some((i) => i.taskId === t1.id && i.plannedMinutes === 25)).toBe(true);
    expect(planStore.listCarryCandidates(TODAY)).toHaveLength(0);
    expect(planStore.items.filter((i) => i.date < TODAY && i.status === 'pending' && !i.deletedAt)).toHaveLength(0);
  });

  it('放回目标：旧安排收起，任务本体还在池子里', () => {
    const { planStore, t1 } = setup();
    const taskStore = useTaskStore();

    expect(planStore.expirePendingBefore(TODAY)).toBe(5);
    expect(planStore.listCarryCandidates(TODAY)).toHaveLength(0);
    expect(taskStore.getById(t1.id)?.status).toBe('todo');
  });
});
