/**
 * services/manualCandidates.ts 单元测试（V5.46）
 * 今日「手动挑选」与「调整排期」共用同一候选池。
 */

import { describe, expect, it } from 'vitest';
import type { Goal, Task } from '@/types/models';
import { groupManualCandidates, manualCandidates } from '@/services/manualCandidates';

function makeGoal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
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

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    goalId: 'g1',
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

describe('manualCandidates 手动挑选候选', () => {
  it('只收所属目标进行中的待办步骤，排除所选日期已排 / 已完成 / 已删除', () => {
    const goals = [makeGoal({ id: 'g1' })];
    const tasks = [
      makeTask({ id: 'todo' }),
      makeTask({ id: 'doing', status: 'doing' }),
      makeTask({ id: 'planned' }),
      makeTask({ id: 'done', status: 'done' }),
      makeTask({ id: 'deleted', deletedAt: 1 }),
    ];

    const ids = manualCandidates(goals, tasks, new Set(['planned'])).map((c) => c.id);

    expect(ids).toEqual(['todo', 'doing']);
  });

  it('没拆步骤的进行中目标作为整块候选，已有步骤的目标不重复出现', () => {
    const goals = [
      makeGoal({ id: 'gUnit', title: '整块目标' }),
      makeGoal({ id: 'gWithSteps' }),
      makeGoal({ id: 'gDone', status: 'completed' }),
    ];
    const tasks = [makeTask({ id: 't1', goalId: 'gWithSteps' })];

    const result = manualCandidates(goals, tasks, new Set());

    expect(result.map((c) => c.id)).toEqual(['t1', 'goal:gUnit']);
    expect(result.find((c) => c.id === 'goal:gUnit')?.kind).toBe('goal');
  });

  it('按目标分组：步骤收在目标下面，没拆步骤的目标也作为一个目标组', () => {
    const goals = [
      makeGoal({ id: 'g1', title: '英语' }),
      makeGoal({ id: 'g2', title: '数学' }),
      makeGoal({ id: 'gUnit', title: '整块目标' }),
    ];
    const tasks = [
      makeTask({ id: 't1', goalId: 'g1', createdAt: 1 }),
      makeTask({ id: 't2', goalId: 'g1', createdAt: 2 }),
      makeTask({ id: 't3', goalId: 'g2', createdAt: 3 }),
    ];

    const groups = groupManualCandidates(manualCandidates(goals, tasks, new Set()));

    expect(groups.map((g) => g.goal.id)).toEqual(['gUnit', 'g1', 'g2']);
    expect(groups.find((g) => g.goal.id === 'g1')?.candidates.map((c) => c.id)).toEqual(['t1', 't2']);
    expect(groups.find((g) => g.goal.id === 'gUnit')?.candidates[0]?.kind).toBe('goal');
  });

  it('排序沿用目标优先级 → 截止日 → 步骤优先级', () => {
    const goals = [
      makeGoal({ id: 'gLow', title: '低优先目标', priority: 'low' }),
      makeGoal({ id: 'gHigh', title: '高优先目标', priority: 'high' }),
    ];
    const tasks = [
      makeTask({ id: 'tMedium', goalId: 'gLow' }),
      makeTask({ id: 'tHigh', goalId: 'gHigh', priority: 'high' }),
    ];

    expect(manualCandidates(goals, tasks, new Set()).map((c) => c.id)).toEqual([
      'tHigh',
      'tMedium',
    ]);
  });
});
