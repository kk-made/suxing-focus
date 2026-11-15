/**
 * services/stats.ts 单元测试
 * 覆盖：计时数学 / 时长换算 / 聚合统计 / 连续天数 / 目标分布 / 展示格式化
 * 基准日：2026-10-15（周四），与 scheduler.spec.ts 保持一致
 */

import { describe, expect, it } from 'vitest';
import type { Goal, StudyLog } from '@/types/models';
import { MIN_VALID_LOG_MINUTES } from '@/services/constants';
import {
  calcElapsedMs,
  calcLogMinutes,
  distributionByGoal,
  formatClock,
  formatDurationText,
  isDurationValid,
  lastNDaysSeries,
  minutesInRange,
  minutesOnDate,
  streakDays,
  totalMinutes,
} from '@/services/stats';
import { startOfWeek } from '@/utils/date';

const TODAY = '2026-10-15'; // 周四

/** 构造学习记录（字段默认值可被覆盖） */
function makeLog(over: Partial<StudyLog> = {}): StudyLog {
  return {
    id: 'l_test',
    taskId: 't_test',
    goalId: 'g_test',
    planItemId: '',
    startAt: 0,
    endAt: 0,
    durationMinutes: 25,
    date: TODAY,
    note: '',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...over,
  };
}

/** 构造目标（分布统计只用到 id/title） */
function makeGoal(id: string, title: string): Goal {
  return {
    id,
    title,
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
  };
}

describe('calcElapsedMs 计时数学', () => {
  it('暂停中：只累计 accumulatedMs', () => {
    expect(calcElapsedMs({ accumulatedMs: 5000, running: false, lastResumeAt: null }, 999999)).toBe(5000);
  });

  it('运行中：已累计 + 当前运行段', () => {
    expect(calcElapsedMs({ accumulatedMs: 5000, running: true, lastResumeAt: 100000 }, 112000)).toBe(17000);
  });

  it('时钟回拨不产生负数（防御）', () => {
    expect(calcElapsedMs({ accumulatedMs: 3000, running: true, lastResumeAt: 100000 }, 99000)).toBe(3000);
  });
});

describe('时长换算', () => {
  it('calcLogMinutes：四舍五入，且不低于最小有效时长', () => {
    expect(calcLogMinutes(30 * 1000)).toBe(MIN_VALID_LOG_MINUTES);
    expect(calcLogMinutes(90 * 1000)).toBe(2);
    expect(calcLogMinutes(25 * 60 * 1000)).toBe(25);
  });

  it('isDurationValid：达到最小有效时长才算有效', () => {
    expect(isDurationValid(MIN_VALID_LOG_MINUTES * 60000 - 1)).toBe(false);
    expect(isDurationValid(MIN_VALID_LOG_MINUTES * 60000)).toBe(true);
  });
});

describe('聚合统计', () => {
  const logs = [
    makeLog({ id: 'l1', date: TODAY, durationMinutes: 25 }),
    makeLog({ id: 'l2', date: '2026-10-14', durationMinutes: 40 }),
    makeLog({ id: 'l3', date: '2026-10-13', durationMinutes: 30 }),
    makeLog({ id: 'l4', date: '2026-10-14', durationMinutes: 15, deletedAt: 1 }), // 软删除
  ];

  it('totalMinutes 排除软删除', () => {
    expect(totalMinutes(logs)).toBe(95);
  });

  it('minutesOnDate 只统计当日', () => {
    expect(minutesOnDate(logs, TODAY)).toBe(25);
    expect(minutesOnDate(logs, '2026-10-12')).toBe(0);
  });

  it('minutesInRange 闭区间 + 排除软删除', () => {
    expect(minutesInRange(logs, '2026-10-13', '2026-10-15')).toBe(95);
    expect(minutesInRange(logs, '2026-10-14', '2026-10-14')).toBe(40);
  });

  it('lastNDaysSeries：从旧到新、含今天、软删除不计', () => {
    const series = lastNDaysSeries(logs, TODAY, 3);
    expect(series.map((point) => point.date)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15']);
    expect(series.map((point) => point.minutes)).toEqual([30, 40, 25]);
  });
});

describe('streakDays 连续学习天数', () => {
  it('今天有记录：从今天起向前数', () => {
    const logs = [
      makeLog({ date: TODAY }),
      makeLog({ date: '2026-10-14' }),
      makeLog({ date: '2026-10-13' }),
    ];
    expect(streakDays(logs, TODAY)).toBe(3);
  });

  it('今天未学但昨天学过：不打断，从昨天起算', () => {
    const logs = [makeLog({ date: '2026-10-14' }), makeLog({ date: '2026-10-13' })];
    expect(streakDays(logs, TODAY)).toBe(2);
  });

  it('中间断档：只统计最近的连续段', () => {
    const logs = [makeLog({ date: TODAY }), makeLog({ date: '2026-10-13' })]; // 10-14 缺
    expect(streakDays(logs, TODAY)).toBe(1);
  });

  it('今天与昨天都没有：0', () => {
    expect(streakDays([makeLog({ date: '2026-10-12' })], TODAY)).toBe(0);
    expect(streakDays([], TODAY)).toBe(0);
  });
});

describe('distributionByGoal 目标投入分布', () => {
  const goals = [makeGoal('g1', '英语'), makeGoal('g2', '数学')];
  const logs = [
    makeLog({ goalId: 'g1', durationMinutes: 25 }),
    makeLog({ goalId: 'g1', durationMinutes: 15 }),
    makeLog({ goalId: 'g2', durationMinutes: 60 }),
    makeLog({ goalId: '', durationMinutes: 20 }), // 自由学习
    makeLog({ goalId: 'g_unknown', durationMinutes: 10, deletedAt: 1 }), // 软删除不参与
  ];

  it('按目标聚合、降序、占比合计为 1', () => {
    const slices = distributionByGoal(logs, goals);
    expect(slices.map((slice) => [slice.title, slice.minutes])).toEqual([
      ['数学', 60],
      ['英语', 40],
      ['自由学习', 20],
    ]);
    const ratioSum = slices.reduce((sum, slice) => sum + slice.ratio, 0);
    expect(Math.abs(ratioSum - 1)).toBeLessThan(1e-9);
  });

  it('未知目标给出占位标题', () => {
    const slices = distributionByGoal([makeLog({ goalId: 'g_gone' })], goals);
    expect(slices[0].title).toBe('未知目标');
  });
});

describe('展示格式化', () => {
  it('formatClock：mm:ss 与 h:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65 * 1000)).toBe('01:05');
    expect(formatClock(3661 * 1000)).toBe('1:01:01');
  });

  it('formatDurationText：分钟 / 小时组合', () => {
    expect(formatDurationText(0)).toBe('0 分钟');
    expect(formatDurationText(45)).toBe('45 分钟');
    expect(formatDurationText(60)).toBe('1 小时');
    expect(formatDurationText(85)).toBe('1 小时 25 分钟');
  });
});

describe('startOfWeek（date 工具）', () => {
  it('周四 → 本周一', () => {
    expect(startOfWeek('2026-10-15')).toBe('2026-10-12');
  });

  it('周一 → 自身', () => {
    expect(startOfWeek('2026-10-12')).toBe('2026-10-12');
  });

  it('周日 → 本周一（周一为一周开始）', () => {
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12');
  });
});
