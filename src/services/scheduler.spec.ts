/**
 * 排期引擎单元测试
 * 用户要求「排期必须用代码计算」——本文件是该承诺的技术保障：
 * 所有规则（额度、可学习日、优先级、去重）都必须被测试覆盖。
 *
 * 固定基准日：2026-10-15（周四），避免测试结果随运行日期漂移。
 */
import { describe, expect, it } from 'vitest';
import type { Goal, PlanItem, Task } from '@/types/models';
import { buildSchedule } from './scheduler';

const START = '2026-10-15'; // 周四
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** 构造目标（默认进行中、无截止、中优先级） */
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

/** 构造任务（默认 25 分钟、中优先级、未完成） */
function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    goalId: 'g1',
    title: '测试任务',
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

/** 构造计划条目（默认手动、待完成） */
function makePlanItem(over: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'p1',
    date: START,
    taskId: 't1',
    goalId: 'g1',
    plannedMinutes: 30,
    order: 0,
    source: 'manual',
    status: 'pending',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...over,
  };
}

/** 通用输入 */
function input(over: Partial<Parameters<typeof buildSchedule>[0]> = {}) {
  return {
    tasks: [] as Task[],
    goals: [makeGoal()],
    dailyAvailableMinutes: 120,
    studyDaysOfWeek: ALL_DAYS,
    existingPlan: [] as PlanItem[],
    startDate: START,
    windowDays: 14,
    ...over,
  };
}

describe('buildSchedule 规则引擎', () => {
  it('基础排期：额度充足时全部排在起始日', () => {
    const plan = buildSchedule(
      input({ tasks: [makeTask({ id: 't1', estimateMinutes: 25 }), makeTask({ id: 't2', estimateMinutes: 60 })] }),
    );
    expect(plan.items).toHaveLength(2);
    expect(plan.items.every((i) => i.date === START)).toBe(true);
    expect(plan.totalPlannedMinutes).toBe(85);
  });

  it('额度约束：单日装满后顺延到下一个可学习日', () => {
    const plan = buildSchedule(
      input({
        dailyAvailableMinutes: 120,
        tasks: [
          makeTask({ id: 't1', estimateMinutes: 60 }),
          makeTask({ id: 't2', estimateMinutes: 60 }),
          makeTask({ id: 't3', estimateMinutes: 60 }),
        ],
      }),
    );
    // 今天排 2 个（120 满），第 3 个顺延到明天 2026-10-16
    expect(plan.items.map((i) => `${i.taskId}@${i.date}`)).toEqual([
      't1@2026-10-15',
      't2@2026-10-15',
      't3@2026-10-16',
    ]);
  });

  it('可学习日约束：非可学习日不被排入', () => {
    // 只允许周五（START 是周四）→ 唯一可排日是 2026-10-16
    const plan = buildSchedule(
      input({ studyDaysOfWeek: [5], tasks: [makeTask({ id: 't1', estimateMinutes: 30 })] }),
    );
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].date).toBe('2026-10-16');
  });

  it('优先级排序：目标优先级高 → 低（高优先级先于截止日更近的；V5.30e）', () => {
    const goals = [
      makeGoal({ id: 'gUrgent', deadline: '2026-10-16', priority: 'medium' }),
      makeGoal({ id: 'gHigh', deadline: '2026-11-30', priority: 'high' }),
    ];
    const plan = buildSchedule(
      input({
        goals,
        dailyAvailableMinutes: 30, // 只够放一个 25 分钟任务
        tasks: [
          makeTask({ id: 'tUrgent', goalId: 'gUrgent', priority: 'high', estimateMinutes: 25 }),
          makeTask({ id: 'tHigh', goalId: 'gHigh', priority: 'low', estimateMinutes: 25 }),
        ],
      }),
    );
    // 先看目标优先级：高优先级的 tHigh 先占今天（步骤优先级不越级）；tUrgent 顺延到明天
    expect(plan.items[0].taskId).toBe('tHigh');
    expect(plan.items[0].date).toBe(START);
    expect(plan.items[1].taskId).toBe('tUrgent');
    expect(plan.items[1].date).toBe('2026-10-16');
  });

  it('紧急度排序：同优先级下，目标截止日近的先占额度', () => {
    const goals = [
      makeGoal({ id: 'gSoon', deadline: '2026-10-16' }),
      makeGoal({ id: 'gLate', deadline: '2026-11-30' }),
    ];
    const plan = buildSchedule(
      input({
        goals,
        dailyAvailableMinutes: 30, // 只够放一个 25 分钟任务
        tasks: [
          makeTask({ id: 'tLate', goalId: 'gLate', priority: 'medium', estimateMinutes: 25 }),
          makeTask({ id: 'tSoon', goalId: 'gSoon', priority: 'medium', estimateMinutes: 25 }),
        ],
      }),
    );
    // 同为中优先级 → 截止近的 tSoon 今天排
    expect(plan.items[0].taskId).toBe('tSoon');
    expect(plan.items[0].date).toBe(START);
    expect(plan.items[1].taskId).toBe('tLate');
  });

  it('紧急度排序：截止时间相近时，步骤优先级高的先占额度', () => {
    const goals = [makeGoal({ id: 'g1', deadline: '2026-10-20' })];
    const plan = buildSchedule(
      input({
        goals,
        dailyAvailableMinutes: 30, // 只够放一个 25 分钟任务
        tasks: [
          makeTask({ id: 'tLow', goalId: 'g1', priority: 'low', estimateMinutes: 25 }),
          makeTask({ id: 'tHigh', goalId: 'g1', priority: 'high', estimateMinutes: 25 }),
        ],
      }),
    );
    // 同一截止日 → 高优先级的 tHigh 今天排；tLow 顺延到明天
    expect(plan.items[0].taskId).toBe('tHigh');
    expect(plan.items[0].date).toBe(START);
    expect(plan.items[1].taskId).toBe('tLow');
    expect(plan.items[1].date).toBe('2026-10-16');
  });

  it('复习预留：当日到期复习先占额度，装不下则顺延', () => {
    const plan = buildSchedule(
      input({
        dailyAvailableMinutes: 30,
        tasks: [makeTask({ id: 't1', estimateMinutes: 25 })],
        reviewMinutesByDate: { [START]: 10 }, // 今天有 1 条到期复习，预留 10 分钟
      }),
    );
    // 30 - 10（复习）= 20 < 25 → 今天装不下，顺延到明天
    expect(plan.items[0].date).toBe('2026-10-16');
    const today = plan.dailyLoad.find((d) => d.date === START)!;
    expect(today.reviewMinutes).toBe(10);
    expect(today.occupiedMinutes).toBe(0);
    expect(today.totalMinutes).toBe(10);
  });

  it('已完成任务与被删除任务不参与排期', () => {
    const plan = buildSchedule(
      input({
        tasks: [
          makeTask({ id: 'tDone', status: 'done' }),
          makeTask({ id: 'tDeleted', deletedAt: 123 }),
          makeTask({ id: 'tTodo' }),
        ],
      }),
    );
    expect(plan.items.map((i) => i.taskId)).toEqual(['tTodo']);
  });

  it('已归档（收入成就收藏集）的任务不参与排期（V5.22）', () => {
    const plan = buildSchedule(
      input({
        tasks: [
          makeTask({ id: 'tArchived', status: 'archived', doneAt: 1 }),
          makeTask({ id: 'tTodo' }),
        ],
      }),
    );
    expect(plan.items.map((i) => i.taskId)).toEqual(['tTodo']);
  });

  it('已完成/已归档目标下的任务不参与排期', () => {
    const goals = [makeGoal({ id: 'gDone', status: 'completed' }), makeGoal({ id: 'gActive' })];
    const plan = buildSchedule(
      input({
        goals,
        tasks: [makeTask({ id: 'tA', goalId: 'gDone' }), makeTask({ id: 'tB', goalId: 'gActive' })],
      }),
    );
    expect(plan.items.map((i) => i.taskId)).toEqual(['tB']);
  });

  it('未来已有未完成计划的任务不重复排期（手动安排优先）', () => {
    const plan = buildSchedule(
      input({
        tasks: [makeTask({ id: 't1' }), makeTask({ id: 't2' })],
        existingPlan: [makePlanItem({ taskId: 't1', date: '2026-10-15' })],
      }),
    );
    expect(plan.items.map((i) => i.taskId)).toEqual(['t2']);
  });

  it('幂等重建：待完成的自动条目不阻塞候选、不占额度（重复生成结果一致）', () => {
    const plan = buildSchedule(
      input({
        tasks: [makeTask({ id: 't1', estimateMinutes: 60 }), makeTask({ id: 't2', estimateMinutes: 90 })],
        // 模拟上一轮生成：t1 排今天 60 分钟；t2（90 分钟当天装不下）顺延明天
        existingPlan: [
          makePlanItem({ id: 'p1', taskId: 't1', date: START, plannedMinutes: 60, source: 'auto' }),
          makePlanItem({ id: 'p2', taskId: 't2', date: '2026-10-16', plannedMinutes: 90, source: 'auto' }),
        ],
      }),
    );
    expect(plan.items.map((i) => `${i.taskId}@${i.date}`)).toEqual([
      't1@2026-10-15',
      't2@2026-10-16',
    ]);
  });

  it('单日重排（rebuildStartDateOnly）：重建今天的自动条目，未来自动条目视为承诺', () => {
    const plan = buildSchedule(
      input({
        windowDays: 1,
        rebuildStartDateOnly: true,
        dailyAvailableMinutes: 120,
        tasks: [makeTask({ id: 't1', estimateMinutes: 25 }), makeTask({ id: 't2', estimateMinutes: 25 })],
        existingPlan: [
          // 今天旧的自动条目：单日重排会重建 → 不阻塞、不占额度
          makePlanItem({ id: 'p1', taskId: 't1', date: START, plannedMinutes: 25, source: 'auto' }),
          // 明天已有的自动条目：视为未来承诺 → t2 不重复排入今天
          makePlanItem({ id: 'p2', taskId: 't2', date: '2026-10-16', plannedMinutes: 25, source: 'auto' }),
        ],
      }),
    );
    expect(plan.items.map((i) => `${i.taskId}@${i.date}`)).toEqual(['t1@2026-10-15']);
  });

  it('单日重排对比：未开启时未来自动条目同样被重建（同一任务可再排入今天）', () => {
    const plan = buildSchedule(
      input({
        windowDays: 1,
        dailyAvailableMinutes: 120,
        tasks: [makeTask({ id: 't1', estimateMinutes: 25 }), makeTask({ id: 't2', estimateMinutes: 25 })],
        existingPlan: [
          makePlanItem({ id: 'p1', taskId: 't1', date: START, plannedMinutes: 25, source: 'auto' }),
          makePlanItem({ id: 'p2', taskId: 't2', date: '2026-10-16', plannedMinutes: 25, source: 'auto' }),
        ],
      }),
    );
    expect(plan.items.map((i) => `${i.taskId}@${i.date}`)).toEqual([
      't1@2026-10-15',
      't2@2026-10-15',
    ]);
  });

  it('已完成的自动条目保护学习历史：阻塞对应任务并占用额度', () => {
    const plan = buildSchedule(
      input({
        tasks: [makeTask({ id: 't1', estimateMinutes: 60 }), makeTask({ id: 't2', estimateMinutes: 60 })],
        existingPlan: [
          makePlanItem({ id: 'p1', taskId: 't1', date: START, plannedMinutes: 60, source: 'auto', status: 'done' }),
        ],
      }),
    );
    // t1 已有完成记录 → 不再排；t2 使用当天剩余 60 分钟额度排在今天
    expect(plan.items.map((i) => i.taskId)).toEqual(['t2']);
    expect(plan.items[0].date).toBe(START);
    expect(plan.dailyLoad.find((d) => d.date === START)!.occupiedMinutes).toBe(60);
  });

  it('手动安排占用当日额度', () => {
    const plan = buildSchedule(
      input({
        dailyAvailableMinutes: 120,
        // 今天手动安排已占 90 分钟，剩 30：60 分钟任务放不下 → 顺延
        tasks: [makeTask({ id: 't1', estimateMinutes: 60 })],
        existingPlan: [makePlanItem({ taskId: 't9', date: START, plannedMinutes: 90 })],
      }),
    );
    expect(plan.items[0].date).toBe('2026-10-16');
  });

  it('目标每日学习时长：当日排入量达到预算后，同目标的后续步骤顺延（V5.30e）', () => {
    const goals = [makeGoal({ id: 'g1', dailyMinutes: 40 })];
    const plan = buildSchedule(
      input({
        goals,
        tasks: [
          makeTask({ id: 't1', estimateMinutes: 25, createdAt: 1 }),
          makeTask({ id: 't2', estimateMinutes: 25, createdAt: 2 }),
        ],
      }),
    );
    // 今天：25 + 25 = 50 > 40 → 第二条顺延到明天
    expect(plan.items.map((i) => `${i.taskId}@${i.date}`)).toEqual([
      't1@2026-10-15',
      't2@2026-10-16',
    ]);
  });

  it('目标每日学习时长：当天第一条不受预算约束（超大步骤不留死结）', () => {
    const goals = [makeGoal({ id: 'g1', dailyMinutes: 15 })];
    const plan = buildSchedule(
      input({ goals, tasks: [makeTask({ id: 't1', estimateMinutes: 30 })] }),
    );
    expect(plan.items[0].taskId).toBe('t1');
    expect(plan.items[0].date).toBe(START);
  });

  it('目标每日学习时长：手动安排同样占用当日预算', () => {
    const goals = [makeGoal({ id: 'g1', dailyMinutes: 40 })];
    const plan = buildSchedule(
      input({
        goals,
        // 今天手动安排过 g1 的 30 分钟 → 自动再排 25 会超预算 → 顺延
        tasks: [makeTask({ id: 't1', estimateMinutes: 25 })],
        existingPlan: [makePlanItem({ taskId: 't9', goalId: 'g1', date: START, plannedMinutes: 30 })],
      }),
    );
    expect(plan.items[0].date).toBe('2026-10-16');
  });

  it('整块目标：没有步骤的进行中目标整块参与排期（taskId 为空 + goalUnit 标记；V5.31）', () => {
    const goals = [makeGoal({ id: 'gUnit' })];
    const plan = buildSchedule(input({ goals }));
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toEqual({
      date: START,
      taskId: '',
      goalId: 'gUnit',
      plannedMinutes: 30,
      goalUnit: true,
    });
  });

  it('整块目标：时长取目标每日学习时长（未设默认 30 分钟）', () => {
    const goals = [makeGoal({ id: 'gUnit', dailyMinutes: 45 })];
    const plan = buildSchedule(input({ goals }));
    expect(plan.items[0].plannedMinutes).toBe(45);
  });

  it('整块目标与步骤同场：目标优先级先行（高优先级整块先占额度）', () => {
    const goals = [
      makeGoal({ id: 'gHigh', priority: 'high' }),
      makeGoal({ id: 'gMid', priority: 'medium' }),
    ];
    const plan = buildSchedule(
      input({
        goals,
        dailyAvailableMinutes: 30, // 只够一条
        tasks: [makeTask({ id: 'tMid', goalId: 'gMid', estimateMinutes: 25 })],
      }),
    );
    expect(plan.items.map((i) => `${i.goalUnit ? 'unit:' : 'task:'}${i.goalId}@${i.date}`)).toEqual([
      'unit:gHigh@2026-10-15',
      'task:gMid@2026-10-16',
    ]);
  });

  it('整块目标：有步骤的目标不再整块出候选（不重复安排）', () => {
    const goals = [makeGoal({ id: 'g1' })];
    const plan = buildSchedule(input({ goals, tasks: [makeTask({ id: 't1', goalId: 'g1' })] }));
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].taskId).toBe('t1');
    expect(plan.items[0].goalUnit).toBeUndefined();
  });

  it('整块目标：已完成 / 已归档目标不出候选', () => {
    const goals = [
      makeGoal({ id: 'gDone', status: 'completed' }),
      makeGoal({ id: 'gArchived', status: 'archived' }),
    ];
    const plan = buildSchedule(input({ goals }));
    expect(plan.items).toHaveLength(0);
    expect(plan.unscheduled).toHaveLength(0);
  });

  it('整块目标：没有可学习日 → 进 unscheduled 且带 goalId（任务 id 为空）', () => {
    const goals = [makeGoal({ id: 'gUnit' })];
    const plan = buildSchedule(input({ goals, studyDaysOfWeek: [] }));
    expect(plan.items).toHaveLength(0);
    expect(plan.unscheduled).toHaveLength(1);
    expect(plan.unscheduled[0]).toMatchObject({ taskId: '', goalId: 'gUnit', title: '测试目标' });
    expect(plan.unscheduled[0].reason).toContain('可学习');
  });

  it('skipped 状态的旧安排不占额度', () => {
    const plan = buildSchedule(
      input({
        dailyAvailableMinutes: 30,
        tasks: [makeTask({ id: 't1', estimateMinutes: 25 })],
        existingPlan: [makePlanItem({ taskId: 't9', date: START, plannedMinutes: 30, status: 'skipped' })],
      }),
    );
    expect(plan.items[0].date).toBe(START);
  });

  it('窗口内排不下 → 进入 unscheduled 并附原因', () => {
    const plan = buildSchedule(
      input({ dailyAvailableMinutes: 10, tasks: [makeTask({ id: 't1', estimateMinutes: 25 })] }),
    );
    expect(plan.items).toHaveLength(0);
    expect(plan.unscheduled).toHaveLength(1);
    expect(plan.unscheduled[0].taskId).toBe('t1');
    expect(plan.unscheduled[0].reason).toContain('装不下');
  });

  it('无任何可学习日 → 全部进入 unscheduled', () => {
    const plan = buildSchedule(
      input({ studyDaysOfWeek: [], tasks: [makeTask({ id: 't1' })] }),
    );
    expect(plan.items).toHaveLength(0);
    expect(plan.unscheduled[0].reason).toContain('可学习');
    expect(plan.dailyLoad).toHaveLength(0);
  });

  it('每日负载统计正确（占用 + 新增 = 合计）', () => {
    const plan = buildSchedule(
      input({
        dailyAvailableMinutes: 120,
        tasks: [makeTask({ id: 't1', estimateMinutes: 45 })],
        existingPlan: [makePlanItem({ taskId: 't9', date: START, plannedMinutes: 30 })],
      }),
    );
    const today = plan.dailyLoad.find((d) => d.date === START);
    expect(today).toBeDefined();
    expect(today!.occupiedMinutes).toBe(30);
    expect(today!.reviewMinutes).toBe(0);
    expect(today!.plannedMinutes).toBe(45);
    expect(today!.totalMinutes).toBe(75);
    expect(today!.capacityMinutes).toBe(120);
  });

  it('幂等性：相同输入两次调用结果完全一致（预览可重复打开）', () => {
    const args = input({ tasks: [makeTask({ id: 't1' }), makeTask({ id: 't2' })] });
    expect(JSON.stringify(buildSchedule(args))).toBe(JSON.stringify(buildSchedule(args)));
  });
});
