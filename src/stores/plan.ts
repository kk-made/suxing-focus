/**
 * 计划 store
 * ============================================================
 * 职责：管理「某天要做什么」的计划条目（PlanItem）。
 * - 手动安排（source='manual'）：用户把任务池里的步骤排到某天；
 * - 自动排期（source='auto'）：规则引擎生成；
 *   重新排期时只重建 auto 条目，手动条目永远保留。
 * - 完成动作（V5.2）：completePending 供专注页/今日页在「有效记录」后自动画勾。
 *
 * V5.21：目标（Task）= 总仓库、计划（PlanItem）= 执行流水线。
 * 计划条目只引用任务 id（同一套数据），今天的任务就是「待办 → 已加入今日 → 已完成」
 * 同一个任务实体的不同状态；计划完成 / 取消时由本 store 联动任务状态（markDone / setStatus），
 * 任务完成会触发艾宾浩斯复习计划。
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { PlanItem, PlanSource, PlanStatus, Task } from '@/types/models';
import { useTaskStore } from '@/stores/task';
import { genId } from '@/utils/id';

export const usePlanStore = defineStore(
  'plan',
  () => {
    /** 全量计划条目（含软删除） */
    const items = ref<PlanItem[]>([]);

    /** 某天的未删除计划（按 order 升序） */
    function listByDate(date: string): PlanItem[] {
      return items.value
        .filter((i) => !i.deletedAt && i.date === date)
        .sort((a, b) => a.order - b.order);
    }

    /** 按 id 查找未删除条目 */
    function getById(id: string): PlanItem | undefined {
      return items.value.find((i) => i.id === id && !i.deletedAt);
    }

    /**
     * 手动往某天添加一条计划（阶段2页面使用）
     * order 追加到当天末尾；同一任务同一天允许出现多条（分次学习场景）
     */
    function addItem(payload: {
      date: string;
      taskId: string;
      goalId: string;
      plannedMinutes: number;
      source?: PlanSource;
    }): PlanItem {
      const now = Date.now();
      const sameDayCount = items.value.filter((i) => !i.deletedAt && i.date === payload.date).length;
      const item: PlanItem = {
        id: genId('p_'),
        date: payload.date,
        taskId: payload.taskId,
        goalId: payload.goalId,
        plannedMinutes: Math.max(5, Math.round(payload.plannedMinutes)),
        order: sameDayCount,
        source: payload.source ?? 'manual',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      items.value.push(item);
      return item;
    }

    /** 某天仍待完成（pending）的任务 id 集合（批量加入去重用） */
    function pendingTaskIdsOn(date: string): Set<string> {
      return new Set(
        items.value
          .filter((i) => !i.deletedAt && i.date === date && i.status === 'pending')
          .map((i) => i.taskId),
      );
    }

    /**
     * 手动挑选（V5.21）：把任务池里勾选的步骤批量加入某天
     * - 时长取任务自身的预计时长；
     * - 当天已待完成的同一任务跳过（不重复加入）；已删除/已完成的任务跳过。
     * @returns 实际加入的条数
     */
    function addTasksToDate(date: string, tasks: Task[]): number {
      const pending = pendingTaskIdsOn(date);
      let added = 0;
      for (const t of tasks) {
        if (t.deletedAt || t.status === 'done' || pending.has(t.id)) {
          continue;
        }
        addItem({
          date,
          taskId: t.id,
          goalId: t.goalId,
          plannedMinutes: t.estimateMinutes,
          source: 'manual',
        });
        pending.add(t.id);
        added += 1;
      }
      return added;
    }

    /** 更新条目状态（今日页勾选完成/跳过时调用） */
    function updateStatus(id: string, status: PlanStatus): void {
      const idx = items.value.findIndex((i) => i.id === id);
      if (idx < 0) {
        return;
      }
      const current = items.value[idx];
      items.value[idx] = { ...current, status, updatedAt: Date.now() };
      // V5.21 状态联动（同一套任务数据）：今日计划完成 = 任务完成（触发复习计划）；
      // 取消勾选 = 任务回到待办（复习计划随之撤销，与目标页「还原」同语义）。
      if (status === 'done') {
        useTaskStore().markDone(current.taskId);
      } else if (status === 'pending' && current.status === 'done') {
        useTaskStore().setStatus(current.taskId, 'todo');
      }
    }

    /**
     * 把未完成的条目画上勾（专注结束、有效记录 ≥ 1 分钟时自动调用）
     * 「走过，才算完成」：只有 pending 才动，已完成/已移除的条目静默跳过。
     * @returns 是否真的画上了勾
     */
    function completePending(id: string): boolean {
      const item = getById(id);
      if (!item || item.status !== 'pending') {
        return false;
      }
      updateStatus(id, 'done');
      return true;
    }

    /** 软删除条目 */
    function removeItem(id: string): void {
      const idx = items.value.findIndex((i) => i.id === id);
      if (idx < 0) {
        return;
      }
      const now = Date.now();
      items.value[idx] = { ...items.value[idx], deletedAt: now, updatedAt: now };
    }

    /** 内部：软删除满足条件的未完成（pending）条目 */
    function softRemovePending(predicate: (item: PlanItem) => boolean): number {
      const now = Date.now();
      let count = 0;
      items.value = items.value.map((i) => {
        if (!i.deletedAt && i.status === 'pending' && predicate(i)) {
          count += 1;
          return { ...i, deletedAt: now, updatedAt: now };
        }
        return i;
      });
      return count;
    }

    /** 软删除某目标下的全部未完成条目（删除目标时由页面层编排级联调用） */
    function removePendingByGoal(goalId: string): number {
      return softRemovePending((i) => i.goalId === goalId);
    }

    /** 软删除某任务下的全部未完成条目（删除任务时由页面层编排级联调用） */
    function removePendingByTask(taskId: string): number {
      return softRemovePending((i) => i.taskId === taskId);
    }

    /**
     * 物理移除某任务的全部计划条目（含已完成历史）——仅用于任务被「彻底删除」（V5.22）
     * 常规删除请用 removePendingByTask（软删除、保留历史）；本方法让任务不再出现在任何地方。
     * @returns 被移除的条目数量
     */
    function purgeByTask(taskId: string): number {
      const before = items.value.length;
      items.value = items.value.filter((i) => i.taskId !== taskId);
      return before - items.value.length;
    }

    /**
     * 软删除某日期起（含当天）的全部「待完成」自动排期条目
     * 用途：重新生成自动排期前调用，实现「重建 auto、保留 manual」的幂等生成；
     * 已完成/已跳过的自动条目属于学习历史，不做删除。
     * @returns 被清理的条目数量
     */
    function removeAutoFrom(date: string): number {
      const now = Date.now();
      let count = 0;
      items.value = items.value.map((i) => {
        if (!i.deletedAt && i.source === 'auto' && i.status === 'pending' && i.date >= date) {
          count += 1;
          return { ...i, deletedAt: now, updatedAt: now };
        }
        return i;
      });
      return count;
    }

    /**
     * 软删除某一天当天的全部「待完成」自动排期条目（V5.20）
     * 用途：今日面板「自动排期」单日重排（未来几天的自动安排保持不动；
     * 需要整体重排时用 removeAutoFrom）。
     * @returns 被清理的条目数量
     */
    function removeAutoOn(date: string): number {
      const now = Date.now();
      let count = 0;
      items.value = items.value.map((i) => {
        if (!i.deletedAt && i.source === 'auto' && i.status === 'pending' && i.date === date) {
          count += 1;
          return { ...i, deletedAt: now, updatedAt: now };
        }
        return i;
      });
      return count;
    }

    /** 某天之前的待完成条目（跨天时用来数「昨天还有 N 项」） */
    function listPendingBefore(date: string): PlanItem[] {
      return items.value
        .filter((i) => !i.deletedAt && i.status === 'pending' && i.date < date)
        .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
    }

    /**
     * 可接到当天的旧安排（V5.43）：只认任务仍在、未完成、未归档的条目；
     * 同一任务只留日期最近的一条；当天已经排过的任务不再重复接。
     */
    function listCarryCandidates(date: string): PlanItem[] {
      const taskStore = useTaskStore();
      const pendingToday = pendingTaskIdsOn(date);
      const byTask = new Map<string, PlanItem>();
      for (const item of listPendingBefore(date)) {
        const task = taskStore.getById(item.taskId);
        if (
          !task ||
          task.status === 'done' ||
          task.status === 'archived' ||
          pendingToday.has(item.taskId)
        ) {
          continue;
        }
        byTask.set(item.taskId, item);
      }
      return [...byTask.values()];
    }

    /**
     * 把旧安排接到 `date`（V5.43）：用户点「接到今天」时调用。
     * 先按候选建当天的新条目，再把 `date` 之前的待完成条目统一收起（软删除、留历史）。
     * @returns 实际接过来的条数
     */
    function carryPendingBeforeTo(date: string): number {
      const candidates = listCarryCandidates(date);
      for (const item of candidates) {
        addItem({
          date,
          taskId: item.taskId,
          goalId: item.goalId,
          plannedMinutes: item.plannedMinutes,
          source: 'manual',
        });
      }
      expirePendingBefore(date);
      return candidates.length;
    }

    /**
     * 收起日期早于 `date` 的待完成条目（软删除、保留历史）。
     * V5.43：不再跨天自动调用——用户在今日页点「放回目标」时才收起，
     * 任务本体留在池子里可重新安排；已完成 / 已跳过的条目是学习历史，不动。
     * @returns 收起条数
     */
    function expirePendingBefore(date: string): number {
      const now = Date.now();
      let count = 0;
      items.value = items.value.map((i) => {
        if (!i.deletedAt && i.status === 'pending' && i.date < date) {
          count += 1;
          return { ...i, deletedAt: now, updatedAt: now };
        }
        return i;
      });
      return count;
    }

    /** 清空全部计划（本地物理清空，配合「数据管理」） */
    function clearAll(): void {
      items.value = [];
    }

    return {
      items,
      listByDate,
      getById,
      addItem,
      pendingTaskIdsOn,
      addTasksToDate,
      updateStatus,
      completePending,
      removeItem,
      removePendingByGoal,
      removePendingByTask,
      purgeByTask,
      removeAutoFrom,
      removeAutoOn,
      listPendingBefore,
      listCarryCandidates,
      carryPendingBeforeTo,
      expirePendingBefore,
      clearAll,
    };
  },
  { persist: true },
);
