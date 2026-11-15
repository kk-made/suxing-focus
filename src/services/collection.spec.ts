/**
 * services/collection.ts 单元测试
 * V5.44：一页 = 一个目标（步骤随目标一起进册子，不再一条步骤一页）
 */

import { describe, expect, it } from 'vitest';
import type { Goal, Task } from '@/types/models';
import { bookLeaves, formatDoneAt } from '@/services/collection';

/** 构造目标 */
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

describe('bookLeaves 书页序列（V5.44：一页 = 一个目标）', () => {
  it('收进来的目标自己占一页，步骤列在这页上（不再一条一页）', () => {
    const goals = [makeGoal({ id: 'g1', status: 'archived', completedAt: 100 })];
    const tasks = [
      makeTask({ id: 't1', goalId: 'g1', status: 'archived', doneAt: 90 }),
      makeTask({ id: 't2', goalId: 'g1', status: 'archived', doneAt: 95 }),
    ];
    const leaves = bookLeaves(goals, tasks);
    expect(leaves.length).toBe(1);
    expect(leaves[0].id).toBe('g1');
    expect(leaves[0].sub).toBe('共 2 个步骤');
    expect(leaves[0].steps.map((s) => s.title)).toEqual(['测试步骤', '测试步骤']);
  });

  it('旧数据里单独收的步骤，也归到所属目标的一页', () => {
    const goals = [makeGoal({ id: 'g1', title: '英语目标' })];
    const tasks = [
      makeTask({ id: 't1', goalId: 'g1', title: '背单词', status: 'archived', doneAt: 90 }),
      makeTask({ id: 't2', goalId: 'g1', title: '做阅读', status: 'archived', doneAt: 95 }),
    ];
    const leaves = bookLeaves(goals, tasks);
    expect(leaves.length).toBe(1);
    expect(leaves[0].id).toBe('g1');
    expect(leaves[0].title).toBe('英语目标');
    expect(leaves[0].sub).toBe('共 2 个步骤');
    expect(leaves[0].steps.map((s) => s.title)).toEqual(['背单词', '做阅读']);
    expect(leaves[0].at).toBe(95);
  });

  it('目标已被删除时，历史步骤仍留一页回忆', () => {
    const tasks = [makeTask({ id: 't1', goalId: 'gone', status: 'archived', doneAt: 90 })];
    const leaves = bookLeaves([], tasks);
    expect(leaves.length).toBe(1);
    expect(leaves[0].id).toBe('t1');
    expect(leaves[0].sub).toBe('来自「已离开的目标」');
  });

  it('目标已收进册子后，它的步骤不再单独占页', () => {
    const goals = [makeGoal({ id: 'g1', status: 'archived', completedAt: 100 })];
    const tasks = [makeTask({ id: 't1', goalId: 'g1', status: 'archived', doneAt: 90 })];
    expect(bookLeaves(goals, tasks).map((l) => l.id)).toEqual(['g1']);
  });

  it('页与页按完成时间升序', () => {
    const goals = [
      makeGoal({ id: 'gLate', status: 'archived', completedAt: 300 }),
      makeGoal({ id: 'gEarly', status: 'archived', completedAt: 100 }),
    ];
    expect(bookLeaves(goals, []).map((l) => l.id)).toEqual(['gEarly', 'gLate']);
  });

  it('步骤在一页内按完成时间排（旅程的先后）', () => {
    const goals = [makeGoal({ id: 'g1', status: 'archived', completedAt: 100 })];
    const tasks = [
      makeTask({ id: 't2', goalId: 'g1', title: '第二步', status: 'archived', doneAt: 95 }),
      makeTask({ id: 't1', goalId: 'g1', title: '第一步', status: 'archived', doneAt: 90 }),
    ];
    const leaves = bookLeaves(goals, tasks);
    expect(leaves[0].steps.map((s) => s.title)).toEqual(['第一步', '第二步']);
  });

  it('软删除的目标与步骤不出现', () => {
    const goals = [makeGoal({ id: 'g1', status: 'archived', completedAt: 100, deletedAt: 5 })];
    const tasks = [makeTask({ id: 't1', goalId: 'g1', status: 'archived', doneAt: 90, deletedAt: 5 })];
    expect(bookLeaves(goals, tasks).length).toBe(0);
  });

  it('还没收进册子的目标与步骤不出现', () => {
    const goals = [makeGoal({ id: 'g1' })];
    const tasks = [makeTask({ id: 't1', goalId: 'g1', status: 'done', doneAt: 90 })];
    expect(bookLeaves(goals, tasks).length).toBe(0);
  });
});

describe('formatDoneAt 完成日期', () => {
  it('空时间 = 空字符串', () => {
    expect(formatDoneAt(null)).toBe('');
    expect(formatDoneAt(undefined)).toBe('');
  });

  it('格式化为「年.月.日」（月日补零）', () => {
    const d = new Date(2026, 0, 9, 10, 0, 0).getTime();
    expect(formatDoneAt(d)).toBe('2026.01.09');
  });
});
