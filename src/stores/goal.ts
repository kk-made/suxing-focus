/**
 * 学习目标 store
 * ============================================================
 * 职责：目标的增删改查（软删除）。
 * - 阶段2：目标 CRUD 页面接入本 store；
 * - 阶段3：规则引擎读取「进行中目标」的截止日期与优先级参与排期；
 * - 所有数据只保存在本机，不涉及账号或云端。
 */

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Goal, GoalDraft } from '@/types/models';
import { useTaskStore } from '@/stores/task';
import { genId } from '@/utils/id';

export const useGoalStore = defineStore(
  'goal',
  () => {
    /** 全量目标（含软删除，用于本地历史与恢复） */
    const goals = ref<Goal[]>([]);

    /** 未删除的目标（页面展示用） */
    const activeGoals = computed(() => goals.value.filter((g) => !g.deletedAt));

    /** 进行中的目标（规则引擎与首页统计用） */
    const runningGoals = computed(() => activeGoals.value.filter((g) => g.status === 'active'));

    /** 已完成的目标（V5.23：成就收藏集「收集完成的目标」的待收池） */
    const completedGoals = computed(() =>
      activeGoals.value.filter((g) => g.status === 'completed'),
    );

    /** 已归档的目标（V5.23「收入囊中」：目标本身也住进成就收藏集） */
    const archivedGoals = computed(() => activeGoals.value.filter((g) => g.status === 'archived'));

    /** 按 id 查找未删除的目标 */
    function getById(id: string): Goal | undefined {
      return goals.value.find((g) => g.id === id && !g.deletedAt);
    }

    /** 新建目标（新目标置顶） */
    function addGoal(draft: GoalDraft): Goal {
      const now = Date.now();
      const goal: Goal = {
        id: genId('g_'),
        title: draft.title.trim(),
        description: draft.description ?? '',
        category: draft.category ?? '',
        deadline: draft.deadline ?? '',
        totalMinutes: draft.totalMinutes ?? 0,
        dailyMinutes: draft.dailyMinutes ?? 0,
        priority: draft.priority ?? 'medium',
        status: 'active',
        completedAt: null,
        color: draft.color ?? '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      goals.value.unshift(goal);
      return goal;
    }

    /** 更新目标（字段增量合并，id/createdAt 不可改） */
    function updateGoal(id: string, patch: Partial<Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>>): void {
      const idx = goals.value.findIndex((g) => g.id === id);
      if (idx < 0) {
        return;
      }
      goals.value[idx] = { ...goals.value[idx], ...patch, updatedAt: Date.now() };
    }

    /** 软删除（保留历史，避免误删后无法回溯） */
    function removeGoal(id: string): void {
      const idx = goals.value.findIndex((g) => g.id === id);
      if (idx < 0) {
        return;
      }
      const now = Date.now();
      goals.value[idx] = { ...goals.value[idx], deletedAt: now, updatedAt: now };
    }

    /**
     * 切换目标状态：进行中 ⇄ 已完成（V5.23）。
     * 标记完成时记下完成时间（收藏集里目标页的日期），重新激活时清空。
     */
    function setGoalStatus(id: string, status: 'active' | 'completed'): void {
      const idx = goals.value.findIndex((g) => g.id === id && !g.deletedAt);
      if (idx < 0) {
        return;
      }
      const current = goals.value[idx];
      const now = Date.now();
      goals.value[idx] = {
        ...current,
        status,
        completedAt: status === 'completed' ? (current.completedAt ?? now) : null,
        updatedAt: now,
      };
    }

    /**
     * 收入囊中（V5.23；V5.37：目标与它的步骤，只有这两层）：
     * 把已完成的目标收进成就收藏集。
     * - 目标 status → 'archived'（保留完成时间），从目标列表消失；
     * - 同行：该目标下所有已完成 / 已归档的步骤都算这段旅程
     *   （整段落进册子，书里是同一页），未完成的步骤保持原样；
     * @returns 这一页上带的步骤数（供提示文案使用）
     */
    function archiveGoal(id: string): number {
      const idx = goals.value.findIndex((g) => g.id === id && !g.deletedAt);
      if (idx < 0) {
        return 0;
      }
      const current = goals.value[idx];
      if (current.status !== 'completed') {
        return 0;
      }
      const now = Date.now();
      goals.value[idx] = {
        ...current,
        status: 'archived',
        completedAt: current.completedAt ?? now,
        updatedAt: now,
      };
      const taskStore = useTaskStore();
      let count = 0;
      // 整段旅程的步骤（未完成的留在原地，随目标一起隐去）
      for (const t of taskStore.listByGoal(id)) {
        if (t.status === 'archived') {
          count += 1;
        } else if (t.status === 'done') {
          taskStore.archiveTask(t.id);
          count += 1;
        }
      }
      return count;
    }

    /** 清空全部目标（自检/重置场景，本地物理清空） */
    function clearAll(): void {
      goals.value = [];
    }

    return {
      goals,
      activeGoals,
      runningGoals,
      completedGoals,
      archivedGoals,
      getById,
      addGoal,
      updateGoal,
      removeGoal,
      setGoalStatus,
      archiveGoal,
      clearAll,
    };
  },
  { persist: true },
);
