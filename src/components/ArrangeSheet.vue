<template>
  <view v-if="show" class="sheet-root">
    <view class="sheet-mask" @click="emit('close')" />

    <view class="sheet-panel">
      <view class="sheet-bar" />

      <!-- 菜单（V5.21）：只有两个动作——今日不凭空建任务，只从目标任务池里「排」 -->
      <template v-if="mode === 'menu'">
        <view class="sheet-item" hover-class="sheet-item--pressed" @click="openAuto">
          <DoodleIcon name="star" :size="80" />
          <view class="sheet-item-texts">
            <text class="sheet-item-title">自动排期</text>
            <text class="sheet-item-sub">按优先级与截止日挑今天</text>
          </view>
        </view>
        <HandLine class="sheet-divider" />
        <view class="sheet-item" hover-class="sheet-item--pressed" @click="openManual">
          <DoodleIcon name="pen" :size="80" />
          <view class="sheet-item-texts">
            <text class="sheet-item-title">手动挑选</text>
            <text class="sheet-item-sub">从目标里挑今天要做的</text>
          </view>
        </view>
      </template>

      <!-- 自动排期：规则引擎预览 → 确认安排（只重建今天的自动条目） -->
      <template v-else-if="mode === 'auto'">
        <text class="sheet-back" @click="mode = 'menu'">‹ 返回</text>
        <text class="sheet-title">自动排期</text>

        <template v-if="autoSuggestions.length > 0">
          <view class="cand-list">
            <view
              v-for="(item, idx) in autoSuggestions"
              :key="item.taskId || 'unit-' + item.goalId"
              class="cand-row"
            >
              <HandLine v-if="idx > 0" class="cand-row-line" />
              <view class="cand-main cand-main--auto">
                <text class="cand-title">{{ item.title }}</text>
                <text class="cand-meta">
                  {{ item.goalUnit ? '本身就是一步 · ' + item.minutes + ' 分钟' : item.goalTitle + ' · ' + item.minutes + ' 分钟' }}
                </text>
              </view>
            </view>
          </view>
          <text v-if="autoReviewMinutes > 0" class="sheet-note">
            复习已预留 {{ autoReviewMinutes }} 分钟
          </text>
          <text v-if="autoUnscheduledCount > 0" class="sheet-note sheet-note--alert">
            {{ autoOverflowText }}
          </text>
          <text class="sheet-note">确认后替换今天的自动安排</text>
          <view class="sheet-cta" hover-class="sheet-cta--pressed" @click="submitAuto">
            <HandFrame />
            确认安排
          </view>
        </template>
        <view v-else class="sheet-empty">
          <text class="sheet-empty-text">{{ autoEmptyState.text }}</text>
          <text class="act act--strong" @click="onAutoEmptyAction">{{ autoEmptyState.action }}</text>
        </view>
      </template>

      <!-- 手动挑选：勾选任务池里的待办步骤 → 加入今日（N） -->
      <template v-else>
        <text class="sheet-back" @click="mode = 'menu'">‹ 返回</text>
        <text class="sheet-title">手动挑选</text>

        <view v-if="candidateGroups.length > 0" class="cand-list">
          <!-- 独立目标：没拆步骤，直接选目标本身 -->
          <view v-if="goalOnlyGroups.length > 0" class="cand-section">
            <text class="cand-section-title">独立目标</text>
            <view
              v-for="(group, gIdx) in goalOnlyGroups"
              :key="group.goal.id"
              class="cand-group"
              :class="{ 'cand-group--divided': gIdx > 0 }"
            >
              <HandLine v-if="gIdx > 0" class="cand-group-line" />
              <view
                class="cand-row"
                hover-class="cand-row--pressed"
                @click="toggleSelect(group.candidates[0]?.id ?? '')"
              >
                <StatusDot :done="selected.has(group.candidates[0]?.id ?? '')" />
                <view class="cand-main">
                  <text class="cand-title">{{ group.goal.title }}</text>
                  <text class="cand-meta">{{ group.candidates[0]?.minutes }} 分钟</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 目标下的步骤：先目标、后步骤 -->
          <view v-if="stepGroups.length > 0" class="cand-section">
            <text class="cand-section-title">目标下的步骤</text>
            <view
              v-for="(group, gIdx) in stepGroups"
              :key="group.goal.id"
              class="cand-group"
              :class="{ 'cand-group--divided': gIdx > 0 }"
            >
              <HandLine v-if="gIdx > 0" class="cand-group-line" />
              <view class="cand-group-head">
                <text class="cand-group-title">{{ group.goal.title }}</text>
                <text class="cand-group-count">{{ group.candidates.length }} 项</text>
              </view>
              <view
                v-for="(cand, idx) in group.candidates"
                :key="cand.id"
                class="cand-row"
                hover-class="cand-row--pressed"
                @click="toggleSelect(cand.id)"
              >
                <HandLine v-if="idx > 0" class="cand-row-line" />
                <StatusDot :done="selected.has(cand.id)" />
                <view class="cand-main">
                  <text class="cand-title">{{ cand.kind === 'task' ? cand.title : cand.goal.title }}</text>
                  <text class="cand-meta">{{ cand.minutes }} 分钟</text>
                </view>
              </view>
            </view>
          </view>
        </view>
        <view v-else class="sheet-empty">
          <text class="sheet-empty-text">{{ manualEmptyText }}</text>
          <text class="act act--strong" @click="goGoalList">去目标页</text>
        </view>

        <view
          v-if="candidates.length > 0"
          class="sheet-cta"
          :class="{ 'sheet-cta--off': selectedCount === 0 }"
          hover-class="sheet-cta--pressed"
          @click="submitManual"
        >
          <HandFrame />
          加入今日（{{ selectedCount }}）
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 安排面板（Bottom Sheet，V5.21）
 * ============================================================
 * 今日页唯一入口「+ 安排今日学习」的弹出面板，只有两个动作（今日不凭空建任务）：
 * - 自动排期：本地规则引擎（services/scheduler.ts）按「目标优先级 → 截止日
 *   → 步骤优先级」
 *   从既有目标的任务池里挑出今天的安排（到期复习先占额度），预览确认后重建今天的自动安排；
 * - 手动挑选：抽屉列出目标里尚未完成、今天未排入的待办步骤（与引擎同一套排序）；
 *   没拆步骤的进行中目标（V5.31：目标本身就是一步）同样列出——
 *   勾选加入时按目标名记下它的第一条步骤；勾选多个 → 「加入今日（N）」→
 *   planStore.addTasksToDate 批量流入（时长取任务预计时长）。
 *   自动排期同样把「整块目标」当作一条安排（确认时与手动挑选用同一套记步）。
 *
 * 数据观（同一套数据的三种状态）：目标（Task）= 总仓库，今日（PlanItem）= 流水线；
 * 待办（未排）→ 已加入今日（今天已有计划条目）→ 已完成（任务 done，联动遗忘曲线复习）。
 */
import { computed, ref, watch } from 'vue';
import DoodleIcon from '@/components/DoodleIcon.vue';
import HandFrame from '@/components/HandFrame.vue';
import HandLine from '@/components/HandLine.vue';
import StatusDot from '@/components/StatusDot.vue';
import type { Task } from '@/types/models';
import { useGoalStore } from '@/stores/goal';
import { usePlanStore } from '@/stores/plan';
import { useReviewStore } from '@/stores/review';
import { useTaskStore } from '@/stores/task';
import { useUserStore } from '@/stores/user';
import { GOAL_UNIT_DEFAULT_MINUTES } from '@/services/constants';
import {
  groupManualCandidates,
  manualCandidates,
  type ManualCandidateGroup,
} from '@/services/manualCandidates';
import { reviewMinutesByDate } from '@/services/review';
import { buildSchedule } from '@/services/scheduler';
import { todayStr } from '@/utils/date';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const goalStore = useGoalStore();
const planStore = usePlanStore();
const reviewStore = useReviewStore();
const taskStore = useTaskStore();
const userStore = useUserStore();

/** 面板状态：menu = 两个动作；auto = 自动排期预览；manual = 手动挑选 */
type SheetMode = 'menu' | 'auto' | 'manual';
const mode = ref<SheetMode>('menu');

/** 打开时回到菜单并清空上次勾选（每次打开都是一次新会话） */
watch(
  () => props.show,
  (visible) => {
    if (visible) {
      mode.value = 'menu';
      selected.value = new Set();
    }
  },
);

function goGoalList(): void {
  emit('close');
  uni.switchTab({ url: '/pages/goal/list' });
}

/* ---- 自动排期：规则引擎预览 → 确认安排 ---- */

interface AutoSuggestion {
  taskId: string;
  goalId: string;
  /** true = 整块目标：没有步骤、目标本身就是一步（V5.31；taskId 为空） */
  goalUnit: boolean;
  title: string;
  goalTitle: string;
  minutes: number;
}

/** 自动排期预览（打开时快照一次，确认前不落库） */
const autoSuggestions = ref<AutoSuggestion[]>([]);
const autoUnscheduledCount = ref(0);
const autoIsRestDay = ref(false);
const autoReviewMinutes = ref(0);
/** 今天已排的待完成条目数（空态诊断用，打开时快照） */
const autoTodayPlanCount = ref(0);
/** 仍待办、但已经排在之后日子的步骤数（空态诊断用，打开时快照） */
const autoFuturePlanCount = ref(0);
/** 今天的总额度 / 已排分钟 / 是否排满（提醒文案用） */
const autoDayCapacityMinutes = ref(0);
const autoDayTotalMinutes = ref(0);
const autoDayFull = ref(false);

type AutoEmptyKind = 'settings' | 'today' | 'future' | 'goals';

/** 空态给具体原因与去处：休息日 / 额度 / 今天已有 / 已排在之后 / 真的没内容 */
const autoEmptyState = computed<{ text: string; action: string; kind: AutoEmptyKind }>(() => {
  if (autoIsRestDay.value) {
    return { text: '今天是休息日', action: '去「我的」调整', kind: 'settings' };
  }
  if (autoUnscheduledCount.value > 0) {
    if (autoTodayPlanCount.value > 0) {
      return {
        text: `今天已有 ${autoTodayPlanCount.value} 项，排不下了`,
        action: '回到今日',
        kind: 'today',
      };
    }
    return { text: '今天排不下了', action: '去「我的」调整', kind: 'settings' };
  }
  if (autoTodayPlanCount.value > 0) {
    return {
      text: `今天已有 ${autoTodayPlanCount.value} 项安排`,
      action: '回到今日',
      kind: 'today',
    };
  }
  if (autoFuturePlanCount.value > 0) {
    return { text: '步骤已排在之后的日子', action: '去调整排期', kind: 'future' };
  }
  return { text: '没有可安排的', action: '去目标页看看', kind: 'goals' };
});

/** 有建议但仍有装不下的：把今日额度与未排数量说清楚 */
const autoOverflowText = computed(() =>
  autoDayFull.value
    ? `今日学习时长已满（${autoDayTotalMinutes.value} / ${autoDayCapacityMinutes.value} 分钟）· 还有 ${autoUnscheduledCount.value} 项未排`
    : `今日已排 ${autoDayTotalMinutes.value} / ${autoDayCapacityMinutes.value} 分钟 · 还有 ${autoUnscheduledCount.value} 项未排`,
);

function onAutoEmptyAction(): void {
  const kind = autoEmptyState.value.kind;
  if (kind === 'settings') {
    emit('close');
    uni.switchTab({ url: '/pages/mine/index' });
    return;
  }
  if (kind === 'today') {
    emit('close');
    return;
  }
  if (kind === 'future') {
    emit('close');
    uni.navigateTo({ url: '/pages/plan/schedule' });
    return;
  }
  goGoalList();
}

/** 打开自动排期：单日重排（只重建今天的自动条目，未来几天的自动安排保持不动） */
function openAuto(): void {
  const today = todayStr();
  autoTodayPlanCount.value = planStore
    .listByDate(today)
    .filter((i) => i.status === 'pending').length;
  const openGoalTaskIds = new Set(
    taskStore.openTasks
      .filter((t) => {
        const goal = goalStore.getById(t.goalId);
        return !!goal && goal.status === 'active';
      })
      .map((t) => t.id),
  );
  const futureIds = new Set<string>();
  for (const item of planStore.items) {
    if (
      !item.deletedAt &&
      item.status === 'pending' &&
      item.date > today &&
      openGoalTaskIds.has(item.taskId)
    ) {
      futureIds.add(item.taskId);
    }
  }
  autoFuturePlanCount.value = futureIds.size;

  // 遗忘曲线复习节点先占额度（每条按固定时长预留）
  const reviewMap = reviewMinutesByDate(reviewStore.activeItems, today, 1);
  const result = buildSchedule({
    tasks: taskStore.tasks,
    goals: goalStore.goals,
    dailyAvailableMinutes: userStore.settings.dailyAvailableMinutes,
    studyDaysOfWeek: userStore.settings.studyDaysOfWeek,
    existingPlan: planStore.items,
    startDate: today,
    windowDays: 1,
    rebuildStartDateOnly: true,
    reviewMinutesByDate: reviewMap,
  });
  autoSuggestions.value = result.items.map((i) => {
    const goal = goalStore.getById(i.goalId);
    const goalUnit = i.goalUnit === true;
    return {
      taskId: i.taskId,
      goalId: i.goalId,
      goalUnit,
      title: goalUnit
        ? (goal?.title ?? '未命名目标')
        : (taskStore.getById(i.taskId)?.title ?? '未命名步骤'),
      goalTitle: goal?.title ?? '未命名目标',
      minutes: i.plannedMinutes,
    };
  });
  const day = result.dailyLoad.find((d) => d.date === today);
  autoUnscheduledCount.value = result.unscheduled.length;
  autoIsRestDay.value = result.dailyLoad.length === 0;
  autoReviewMinutes.value = reviewMap[today] ?? 0;
  autoDayCapacityMinutes.value = day?.capacityMinutes ?? userStore.settings.dailyAvailableMinutes;
  autoDayTotalMinutes.value = day?.totalMinutes ?? 0;
  autoDayFull.value = day ? day.totalMinutes >= day.capacityMinutes : false;
  mode.value = 'auto';
}

/**
 * 确认安排：重建今天的自动条目 + 写入建议（手动安排与未来几天保持不动）。
 * 整块目标（V5.31）：按目标名记下一条步骤（与手动挑选同一套），计划条目引用它。
 */
function submitAuto(): void {
  if (autoSuggestions.value.length === 0) {
    return;
  }
  const today = todayStr();
  planStore.removeAutoOn(today);
  let added = 0;
  let fresh = 0;
  for (const item of autoSuggestions.value) {
    let taskId = item.taskId;
    if (item.goalUnit) {
      const goal = goalStore.getById(item.goalId);
      if (!goal) {
        continue;
      }
      // 预估 = 目标每日学习时长（未设按 30 分钟）、优先级继承目标
      taskId = taskStore.addTask({
        goalId: goal.id,
        title: goal.title,
        estimateMinutes: item.minutes,
        priority: goal.priority,
      }).id;
      fresh += 1;
    }
    planStore.addItem({
      date: today,
      taskId,
      goalId: item.goalId,
      plannedMinutes: item.minutes,
      source: 'auto',
    });
    added += 1;
  }
  emit('close');
  uni.showToast({
    title: `已排入今日 ${added} 项${fresh > 0 ? ` · 新记步骤 ${fresh} 条` : ''}`,
    icon: 'none',
  });
}

/* ---- 手动挑选：候选池 = 待办步骤 + 没拆步骤的进行中目标（与调整排期页共用）---- */

const candidates = computed(() =>
  manualCandidates(
    goalStore.goals,
    taskStore.tasks,
    new Set(planStore.listByDate(todayStr()).map((i) => i.taskId)),
  ),
);

/** 目标 + 步骤的分组视图（与目标页同一套层级） */
const candidateGroups = computed(() => groupManualCandidates(candidates.value));

/** 没拆步骤的目标：单独成区，不再和「目标下的步骤」混排 */
const goalOnlyGroups = computed(() =>
  candidateGroups.value.filter(
    (group: ManualCandidateGroup) =>
      group.candidates.length === 1 && group.candidates[0]?.kind === 'goal',
  ),
);
const stepGroups = computed(() =>
  candidateGroups.value.filter(
    (group: ManualCandidateGroup) =>
      !(group.candidates.length === 1 && group.candidates[0]?.kind === 'goal'),
  ),
);

/** 手动挑选空态：有目标（哪怕已完成）= 都排好了；一个都没有 = 引导去设立 */
const manualEmptyText = computed(() =>
  goalStore.goals.some((g) => !g.deletedAt) ? '没有可加入的了。' : '还没有目标。',
);

/** 勾选集合（空心圆 → 实心勾） */
const selected = ref(new Set<string>());
const selectedCount = computed(() => selected.value.size);

function toggleSelect(id: string): void {
  if (selected.value.has(id)) {
    selected.value.delete(id);
  } else {
    selected.value.add(id);
  }
}

function openManual(): void {
  selected.value = new Set();
  mode.value = 'manual';
}

/**
 * 加入今日（N）：批量流入；没拆步骤的目标，加入时按目标名记下第一条（V5.30b / V5.31）
 * （预估时长 = 每日学习时长，未设按 30 分钟；优先级继承目标）
 */
function submitManual(): void {
  if (selected.value.size === 0) {
    uni.showToast({ title: '先勾选要加入的步骤', icon: 'none' });
    return;
  }
  const tasks: Task[] = [];
  let fresh = 0;
  for (const cand of candidates.value) {
    if (!selected.value.has(cand.id)) {
      continue;
    }
    if (cand.kind === 'task') {
      tasks.push(cand.task);
      continue;
    }
    tasks.push(
      taskStore.addTask({
        goalId: cand.goal.id,
        title: cand.goal.title,
        estimateMinutes: (cand.goal.dailyMinutes ?? 0) > 0 ? cand.goal.dailyMinutes : GOAL_UNIT_DEFAULT_MINUTES,
        priority: cand.goal.priority,
      }),
    );
    fresh += 1;
  }
  const added = planStore.addTasksToDate(todayStr(), tasks);
  emit('close');
  uni.showToast({
    title: fresh > 0 ? `已加入今日 ${added} 项 · 新记步骤 ${fresh} 条` : `已加入今日 ${added} 项`,
    icon: 'none',
  });
}
</script>

<style lang="scss" scoped>
/**
 * 安排面板样式（从今日页 V5.20 面板迁移，V5.21 手动挑选改多选）
 * - 遮罩 0.3 + 纯白面板 + 4rpx 灰色拖拽条；面板从底部滑入；
 * - 暖色按压：浅暖橘 rgba(245,213,184,0.3)，松开 200ms 渐隐（common.scss 统一过渡）。
 */

.sheet-root {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 1200;
}

/* 遮罩：半透明黑 0.3 */
.sheet-mask {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  animation: sheet-mask-in 200ms ease-out;
}

/* 面板：纯白、顶部圆角 16rpx、从底部滑入；flex 纵向布局 + 高度上限，
   内容超高时由内部列表滚动（保证拖拽条与按钮永远可见） */
.sheet-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 16rpx 16rpx 0 0;
  padding: 0 32rpx calc(32rpx + env(safe-area-inset-bottom));
  animation: sheet-up 240ms ease-out;
}

/* 顶部拖拽条：4rpx 灰色 */
.sheet-bar {
  width: 72rpx;
  height: 4rpx;
  border-radius: 4rpx;
  background-color: #d9d9d9;
  margin: 16rpx auto 24rpx;
}

.sheet-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 24rpx 0;
}

/* 选项文字列（标题 + 说明） */
.sheet-item-texts {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.sheet-item--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

.sheet-item-title {
  display: block;
  font-size: 32rpx;
  line-height: 1.4;
  color: #000000;
}

.sheet-item-sub {
  display: block;
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
}

/* 菜单两选项之间的手绘波浪虚线（V5.8，颜色随 .hand-line） */
.sheet-divider {
  margin: 2rpx 0;
}

/* ---- 面板内的返回/标题 ---- */

.sheet-back {
  display: block;
  padding: 12rpx 0;
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
}

.sheet-back:active {
  background-color: rgba(245, 213, 184, 0.3);
}

.sheet-title {
  display: block;
  margin-top: 12rpx;
  font-size: 32rpx;
  line-height: 1.4;
  color: #000000;
}

/* ---- 候选步骤列表（自动预览 / 手动勾选共用） ---- */

.cand-list {
  margin-top: 24rpx;
  flex: 1 1 auto;
  min-height: 0;
  max-height: 420rpx;
  overflow-y: auto;
}

.cand-section + .cand-section {
  margin-top: 24rpx;
}

.cand-section-title {
  display: block;
  margin-bottom: 8rpx;
  font-size: 22rpx;
  line-height: 1.4;
  letter-spacing: 4rpx;
  color: #888888;
}

.cand-group--divided {
  margin-top: 28rpx;
}

.cand-group-line {
  display: block;
  margin-bottom: 10rpx;
}

.cand-group-head {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 10rpx;
  border-bottom: 1px solid #eeeeee;
}

.cand-group-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 26rpx;
  line-height: 1.4;
  color: #000000;
}

.cand-group-count {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: 22rpx;
  line-height: 1.4;
  color: #888888;
}

.cand-row {
  position: relative; /* 手绘波浪分割线的定位坐标系（V5.8） */
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 20rpx 0;
}

.cand-row-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.cand-row--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

.cand-main {
  flex: 1;
  min-width: 0;
  margin-left: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

/* 自动排期预览行：无选中圆点，标题不缩进 */
.cand-main--auto {
  margin-left: 0;
}

.cand-title {
  font-size: 28rpx;
  line-height: 1.4;
  color: #000000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cand-meta {
  font-size: 22rpx;
  line-height: 1.4;
  color: #888888;
}

/* ---- 空状态 ---- */

.sheet-empty {
  margin-top: 24rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.sheet-empty-text {
  flex: 1;
  font-size: 28rpx;
  line-height: 1.4;
  color: #888888;
}

/* ---- 面板内纯文字动作（空状态的动作链接） ---- */

.act {
  padding: 16rpx 28rpx;
  font-size: 28rpx;
  line-height: 1.4;
  color: #888888;
}

.act:active {
  background-color: rgba(245, 213, 184, 0.3);
}

.act--strong {
  color: #000000;
}

/* ---- 说明小注 ---- */

.sheet-note {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #888888;
}

/* 超出今日学习时长的提醒：正文墨色，比普通小注更醒目 */
.sheet-note--alert {
  color: #000000;
}

/* ---- 面板主按钮 ---- */

.sheet-cta {
  position: relative;
  margin-top: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24rpx 0;
  border-radius: 10rpx;
  background-color: #ffffff;
  color: #000000;
  font-size: 28rpx;
  line-height: 1.4;
}

.sheet-cta .hand-frame {
  color: #3a3a3a;
  transition: color 150ms ease;
}

.sheet-cta--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

.sheet-cta--pressed .hand-frame {
  color: #b89b5e;
}

/* 未勾选任何步骤：按钮降噪（点了会给一句提示，不做静默） */
.sheet-cta--off {
  color: #888888;
}

.sheet-cta--off .hand-frame {
  color: #cfcfcf;
}

/* ==================== 动画 ==================== */

@keyframes sheet-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes sheet-mask-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
