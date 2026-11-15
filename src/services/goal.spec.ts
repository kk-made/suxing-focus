/**
 * services/goal.ts 单元测试
 */

import { describe, expect, it } from 'vitest';
import type { Goal, Task } from '@/types/models';
import { calcGoalProgress, goalStatusFromTasks, sortTasks, steplessUnitGoals } from '@/services/goal';

/** 构造目标（默认进行中、中优先级） */
function makeGoal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g_test',
    title: '测试目标',
    description: '',
    category: '',
    deadline: '',
    totalMinutes: 0,
    dailyMinutes: 0,
    priority: 'medium',
    status: 'active',
    completedAt: null,
    color: '',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...over,
  };
}

/** 构造学习步骤（任务） */
function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 't_test',
    goalId: 'g_test',
    title: '测试步骤',
    estimateMinutes: 25,
    priority: 'medium',
    status: 'todo',
    doneAt: null,
    reviewEnabled: true,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...over,
  };
}

describe('sortTasks 学习步骤排序', () => {
  it('未完成在前，已完成沉底', () => {
    const a = makeTask({ id: 'a', status: 'done', createdAt: 1 });
    const b = makeTask({ id: 'b', status: 'todo', createdAt: 2 });
    expect(sortTasks([a, b]).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('同组内按创建时间升序（先加的在上）', () => {
    const a = makeTask({ id: 'a', createdAt: 30 });
    const b = makeTask({ id: 'b', createdAt: 10 });
    const c = makeTask({ id: 'c', createdAt: 20 });
    expect(sortTasks([a, b, c]).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('混合序列：未完成段与已完成段各自按时间升序', () => {
    const a = makeTask({ id: 'a', status: 'done', createdAt: 40 });
    const b = makeTask({ id: 'b', status: 'todo', createdAt: 50 });
    const c = makeTask({ id: 'c', status: 'done', createdAt: 10 });
    const d = makeTask({ id: 'd', status: 'todo', createdAt: 20 });
    expect(sortTasks([a, b, c, d]).map((t) => t.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('不修改原数组', () => {
    const list = [makeTask({ id: 'a', status: 'done' }), makeTask({ id: 'b' })];
    const copy = [...list];
    sortTasks(list);
    expect(list).toEqual(copy);
  });

  it('空数组与单元素原样返回', () => {
    expect(sortTasks([])).toEqual([]);
    const one = makeTask({ id: 'only' });
    expect(sortTasks([one]).map((t) => t.id)).toEqual(['only']);
  });
});

describe('calcGoalProgress 目标进度（V5.22：归档计入进度历史）', () => {
  it('已归档的步骤计入「已完成」（归档不让进度倒退）', () => {
    const tasks = [
      makeTask({ id: 'a', status: 'archived', doneAt: 1 }),
      makeTask({ id: 'b', status: 'done', doneAt: 2 }),
      makeTask({ id: 'c' }),
    ];
    const p = calcGoalProgress(tasks);
    expect(p.totalTasks).toBe(3);
    expect(p.doneTasks).toBe(2);
    expect(p.percent).toBe(67);
  });

  it('软删除的步骤不计入任何统计', () => {
    const tasks = [
      makeTask({ id: 'a', status: 'archived', deletedAt: 1 }),
      makeTask({ id: 'b' }),
    ];
    const p = calcGoalProgress(tasks);
    expect(p.totalTasks).toBe(1);
    expect(p.doneTasks).toBe(0);
    expect(p.percent).toBe(0);
  });
});

describe('goalStatusFromTasks 目标完成状态随步骤同步（V5.32：完成只发生在今日）', () => {
  it('步骤全部完成 → completed', () => {
    const tasks = [
      makeTask({ id: 'a', status: 'done', doneAt: 1 }),
      makeTask({ id: 'b', status: 'done', doneAt: 2 }),
    ];
    expect(goalStatusFromTasks(tasks)).toBe('completed');
  });

  it('还有没做完的步骤 → active', () => {
    const tasks = [
      makeTask({ id: 'a', status: 'done', doneAt: 1 }),
      makeTask({ id: 'b', status: 'todo' }),
    ];
    expect(goalStatusFromTasks(tasks)).toBe('active');
  });

  it('已归档的步骤也算完成（收进收藏集不让进度倒退）', () => {
    const tasks = [makeTask({ id: 'a', status: 'archived', doneAt: 1 })];
    expect(goalStatusFromTasks(tasks)).toBe('completed');
  });

  it('一条步骤都没有 → 保持原状态（不擅自把已完成的目标改回进行中）', () => {
    expect(goalStatusFromTasks([])).toBe('active');
    expect(goalStatusFromTasks([], 'completed')).toBe('completed');
  });

  it('软删除的步骤不计入（删光后回到 active）', () => {
    const tasks = [makeTask({ id: 'a', status: 'done', doneAt: 1, deletedAt: 9 })];
    expect(goalStatusFromTasks(tasks)).toBe('active');
  });
});

describe('steplessUnitGoals 整块目标（V5.31：目标本身就是一步）', () => {
  it('没有步骤的进行中目标 = 整块候选', () => {
    const g = makeGoal({ id: 'g1' });
    expect(steplessUnitGoals([g], []).map((x) => x.id)).toEqual(['g1']);
  });

  it('有步骤的目标不再是整块（已完成 / 已归档的步骤同样算数）', () => {
    const goals = [makeGoal({ id: 'gA' }), makeGoal({ id: 'gB' }), makeGoal({ id: 'gC' })];
    const tasks = [
      makeTask({ id: 't1', goalId: 'gA', status: 'todo' }),
      makeTask({ id: 't2', goalId: 'gB', status: 'done' }),
      makeTask({ id: 't3', goalId: 'gC', status: 'archived' }),
    ];
    expect(steplessUnitGoals(goals, tasks)).toEqual([]);
  });

  it('软删除的步骤不算数（删光后目标回到整块）', () => {
    const g = makeGoal({ id: 'g1' });
    const t = makeTask({ id: 't1', goalId: 'g1', deletedAt: 123 });
    expect(steplessUnitGoals([g], [t]).map((x) => x.id)).toEqual(['g1']);
  });

  it('已完成 / 已归档 / 已删除的目标不入选；保持传入顺序', () => {
    const goals = [
      makeGoal({ id: 'gDone', status: 'completed' }),
      makeGoal({ id: 'gArch', status: 'archived' }),
      makeGoal({ id: 'gDel', deletedAt: 1 }),
      makeGoal({ id: 'gOk' }),
    ];
    expect(steplessUnitGoals(goals, []).map((x) => x.id)).toEqual(['gOk']);
  });
});
