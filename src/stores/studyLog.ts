/**
 * 学习记录 store
 * ============================================================
 * 职责：记录每一次学习的最终结果（只增不改是原则，纠错走删除+重录）。
 * - durationMinutes 一律由代码计算，禁止手填（需求：数量/时间必须代码算）；
 * - 统计看板（阶段4）只以本 store 为唯一数据源。
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { StudyLog } from '@/types/models';
import { formatDate } from '@/utils/date';
import { MIN_VALID_LOG_MINUTES } from '@/services/constants';
import { genId } from '@/utils/id';

export const useStudyLogStore = defineStore(
  'studyLog',
  () => {
    /** 全量学习记录（按开始时间倒序插入，即最新在前） */
    const logs = ref<StudyLog[]>([]);

    /** 某天的学习记录（倒序） */
    function listByDate(date: string): StudyLog[] {
      return logs.value.filter((l) => !l.deletedAt && l.date === date);
    }

    /** 某天累计学习分钟数 */
    function totalMinutesByDate(date: string): number {
      return logs.value.reduce((sum, l) => (l.date === date && !l.deletedAt ? sum + l.durationMinutes : sum), 0);
    }

    /**
     * 追加一条学习记录（阶段4计时器结束时调用）
     * 时长与归属日期全部由代码计算，禁止手填：
     * - durationMinutes 按计时器累计的真实学习毫秒计算（不含暂停时间段）；
     * - date = 结束时间所在的本地日期（跨零点学习归到结束日）。
     */
    function addLog(payload: {
      startAt: number;
      endAt: number;
      /** 实际学习毫秒数（由 timer store 累计，调用方不可直接传分钟数） */
      elapsedMs: number;
      taskId?: string;
      goalId?: string;
      planItemId?: string;
      note?: string;
    }): StudyLog {
      const now = Date.now();
      const rawMinutes = Math.round(payload.elapsedMs / 60000);
      const log: StudyLog = {
        id: genId('l_'),
        taskId: payload.taskId ?? '',
        goalId: payload.goalId ?? '',
        planItemId: payload.planItemId ?? '',
        startAt: payload.startAt,
        endAt: payload.endAt,
        durationMinutes: Math.max(MIN_VALID_LOG_MINUTES, rawMinutes),
        date: formatDate(new Date(payload.endAt)),
        note: payload.note ?? '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      logs.value.unshift(log);
      return log;
    }

    /** 软删除一条记录（误记纠错场景） */
    function removeLog(id: string): void {
      const idx = logs.value.findIndex((l) => l.id === id);
      if (idx < 0) {
        return;
      }
      const now = Date.now();
      logs.value[idx] = { ...logs.value[idx], deletedAt: now, updatedAt: now };
    }

    /** 清空全部记录（本地物理清空，配合「数据自检」） */
    function clearAll(): void {
      logs.value = [];
    }

    return {
      logs,
      listByDate,
      totalMinutesByDate,
      addLog,
      removeLog,
      clearAll,
    };
  },
  { persist: true },
);
