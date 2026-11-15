/**
 * 任务 store
 * ============================================================
 * 职责：目标的拆分执行单元（全部由用户手动创建，本地保存）。
 * - 阶段3：规则引擎按 estimateMinutes / priority / 所属目标截止日 排期；
 * - 阶段4：完成任务 = 艾宾浩斯复习计划的触发点（markDone 联动创建复习项）。
 */

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Priority, Task, TaskDraft, TaskStatus } from '@/types/models';
import { DEFAULT_TASK_ESTIMATE_MINUTES } from '@/services/constants';
import { goalStatusFromTasks } from '@/services/goal';
import { useGoalStore } from '@/stores/goal';
import { usePlanStore } from '@/stores/plan';
import { useReviewStore } from '@/stores/review';
import { genId } from '@/utils/id';

export const useTaskStore = defineStore(
  'task',
  () => {
    /** 全量任务（含软删除，用于本地历史与恢复） */
    const tasks = ref<Task[]>([]);

    /** 未删除的任务 */
    const activeTasks = computed(() => tasks.value.filter((t) => !t.deletedAt));

    /** 未完成的任务（待办 + 进行中） */
    const openTasks = computed(() =>
      activeTasks.value.filter((t) => t.status === 'todo' || t.status === 'doing'),
    );

    /** 按 id 查找未删除的任务 */
    function getById(id: string): Task | undefined {
      return tasks.value.find((t) => t.id === id && !t.deletedAt);
    }

    /** 某目标下的未删除任务 */
    function listByGoal(goalId: string): Task[] {
      return activeTasks.value.filter((t) => t.goalId === goalId);
    }

    /**
     * 目标完成状态同步（V5.32：完成只发生在今日）
     * 目标页不再有「标记完成」——步骤全部完成时目标自动完成；
     * 取消其中一步（在今日取消勾选）目标回到进行中。
     */
    function syncGoalStatus(goalId: string): void {
      if (!goalId) {
        return;
      }
      const goalStore = useGoalStore();
      const goal = goalStore.getById(goalId);
      if (!goal || goal.status === 'archived') {
        return;
      }
      const steps = listByGoal(goal.id);
      const next = goalStatusFromTasks(steps, goal.status);
      if (goal.status !== next) {
        goalStore.setGoalStatus(goal.id, next);
      }
    }

    /**
     * 全量同步（进入目标页时兜底一次）：
     * 老数据里「步骤早已做完、目标还挂在进行中」的也一并归位。
     */
    function syncAllGoalStatuses(): void {
      const goalStore = useGoalStore();
      for (const g of goalStore.activeGoals) {
        syncGoalStatus(g.id);
      }
    }

    /** 新建任务 */
    function addTask(draft: TaskDraft): Task {
      const now = Date.now();
      const task: Task = {
        id: genId('t_'),
        goalId: draft.goalId,
        title: draft.title.trim(),
        estimateMinutes: Math.max(5, Math.round(draft.estimateMinutes ?? DEFAULT_TASK_ESTIMATE_MINUTES)),
        priority: draft.priority ?? 'medium',
        status: 'todo',
        doneAt: null,
        reviewEnabled: draft.reviewEnabled !== false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      tasks.value.push(task);
      // V5.32：给已完成的目标补一步，它就回到进行中（完成只发生在今日）
      syncGoalStatus(task.goalId);
      return task;
    }

    /** 更新任务（字段增量合并） */
    function updateTask(
      id: string,
      patch: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'doneAt'>>,
    ): void {
      const idx = tasks.value.findIndex((t) => t.id === id);
      if (idx < 0) {
        return;
      }
      tasks.value[idx] = { ...tasks.value[idx], ...patch, updatedAt: Date.now() };
    }

    /** 更新状态（不经过完成流程时使用，如手动改回待办） */
    function setStatus(id: string, status: TaskStatus): void {
      const idx = tasks.value.findIndex((t) => t.id === id);
      if (idx < 0) {
        return;
      }
      const current = tasks.value[idx];
      const now = Date.now();
      tasks.value[idx] = {
        ...current,
        status,
        // 非法从 done 改回时清除完成时间戳
        doneAt: status === 'done' ? (current.doneAt ?? now) : null,
        updatedAt: now,
      };
      // 阶段4：完成状态变化时同步维护艾宾浩斯复习计划
      if (status === 'done' && current.status !== 'done') {
        if (current.reviewEnabled !== false) {
          useReviewStore().createForTask(id, current.goalId, tasks.value[idx].doneAt ?? now);
        }
      } else if (status !== 'done' && current.status === 'done') {
        useReviewStore().removeByTask(id);
      }
      // V5.32：目标完成状态随步骤同步
      syncGoalStatus(current.goalId);
    }

    /**
     * 标记完成（阶段4：完成任务是艾宾浩斯复习计划的触发点）
     * 按完成时间用代码创建/复用复习项；学习记录在学习计时结束时另行写入。
     * @returns 完成任务的时间戳
     */
    function markDone(id: string): number | null {
      const idx = tasks.value.findIndex((t) => t.id === id);
      if (idx < 0) {
        return null;
      }
      const current = tasks.value[idx];
      // 幂等：已完成的任务保持原完成时间与复习计划（如「今日计划」与目标页先后触发完成）
      if (current.status === 'done' && current.doneAt !== null) {
        return current.doneAt;
      }
      const now = Date.now();
      tasks.value[idx] = { ...current, status: 'done', doneAt: now, updatedAt: now };
      // 联动创建复习计划（V5.41：步骤可以关掉复习；幂等：已有未完成项时不重复创建）
      if (current.reviewEnabled !== false) {
        useReviewStore().createForTask(id, current.goalId, now);
      }
      // V5.32：目标完成状态随步骤同步（步骤全做完 → 目标自动完成）
      syncGoalStatus(current.goalId);
      return now;
    }

    /**
     * 归档步骤（V5.44：只由目标收藏级联调用——收藏单位是目标，不是单条步骤）。
     * - status → 'archived'，保留完成时间（目标页上的完成日期）；
     * - 从目标列表 / 今日 / 排期候选中消失：未完成的计划条目与复习计划一并撤销（软删除，保留历史）；
     * - 与「彻底删除」的区分：任务本体仍在，随所属目标出现在收藏集里。
     */
    function archiveTask(id: string): void {
      const idx = tasks.value.findIndex((t) => t.id === id && !t.deletedAt);
      if (idx < 0) {
        return;
      }
      const current = tasks.value[idx];
      const now = Date.now();
      tasks.value[idx] = {
        ...current,
        status: 'archived',
        // 归档只对完成的任务有意义；容错：无完成时间时以当前时间为准
        doneAt: current.doneAt ?? now,
        updatedAt: now,
      };
      usePlanStore().removePendingByTask(id);
      useReviewStore().removeByTask(id);
      // V5.32：归档只是收藏动作，完成状态不变（同步保持幂等）
      syncGoalStatus(current.goalId);
    }

    /**
     * 彻底删除（V5.22）：从 Pinia 物理移除任务，不留任何痕迹。
     * 级联物理清理其全部计划条目与复习项（含已完成历史）；
     * 需要「留下念想」的场景一律走 archiveTask，不走这里。
     */
    function deleteTask(id: string): void {
      const idx = tasks.value.findIndex((t) => t.id === id);
      if (idx < 0) {
        return;
      }
      const goalId = tasks.value[idx].goalId;
      tasks.value.splice(idx, 1);
      usePlanStore().purgeByTask(id);
      useReviewStore().purgeByTask(id);
      // V5.32：抹去一步后目标状态重新算（可能回到进行中）
      syncGoalStatus(goalId);
    }

    /** 软删除 */
    function removeTask(id: string): void {
      const idx = tasks.value.findIndex((t) => t.id === id);
      if (idx < 0) {
        return;
      }
      const now = Date.now();
      tasks.value[idx] = { ...tasks.value[idx], deletedAt: now, updatedAt: now };
      // V5.32：目标状态重新算
      syncGoalStatus(tasks.value[idx].goalId);
    }

    /**
     * 软删除某目标下的任务（删除目标时由页面层编排级联调用）
     * V5.23：已归档的任务跳过——收藏进成就收藏集的回忆，不随目标删除而抹去
     * @returns 被软删除的任务数量
     */
    function removeByGoal(goalId: string): number {
      const now = Date.now();
      let count = 0;
      tasks.value = tasks.value.map((t) => {
        if (t.goalId === goalId && !t.deletedAt && t.status !== 'archived') {
          count += 1;
          return { ...t, deletedAt: now, updatedAt: now };
        }
        return t;
      });
      return count;
    }

    /** 清空全部任务（本地物理清空，配合「数据自检」） */
    function clearAll(): void {
      tasks.value = [];
    }

    return {
      tasks,
      activeTasks,
      openTasks,
      getById,
      listByGoal,
      addTask,
      updateTask,
      setStatus,
      markDone,
      archiveTask,
      deleteTask,
      removeTask,
      removeByGoal,
      syncGoalStatus,
      syncAllGoalStatuses,
      clearAll,
    };
  },
  { persist: true },
);
