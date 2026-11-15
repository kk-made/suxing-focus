<template>
  <view class="schedule" :class="{ 'theme-dark': darkActive }">
    <!-- 页面只保留一个轻标题；具体动作交给列表与底部唯一入口 -->
    <view class="intro">
      <text class="s-line">手动调整</text>
    </view>

    <!-- 已安排：今天及之后的待完成计划，按日期分组 -->
    <view class="planned">
      <view class="section-head">
        <text class="section-title">已安排</text>
      </view>

      <view v-if="groups.length === 0" class="empty">
        <text class="empty-line">还没有安排</text>
      </view>

      <view v-for="group in groups" :key="group.date" class="day">
        <view class="day-head" hover-class="day-head--pressed" @click="toggleDay(group.date)">
          <view class="day-main">
            <text class="day-date">{{ dayLabel(group.date) }}</text>
            <text class="day-count">{{ group.items.length }} 项 · {{ group.minutes }} 分钟</text>
          </view>
          <text class="day-act">{{ expandedDate === group.date ? '收起' : '展开' }}</text>
        </view>
        <HandLine class="day-line" />
        <template v-if="expandedDate === group.date">
          <view
            v-for="(item, idx) in group.items"
            :key="item.id"
            class="plan-row"
            :class="{ 'plan-row--divided': idx > 0 }"
          >
            <HandLine v-if="idx > 0" class="plan-row-line" />
            <view class="plan-main">
              <text class="plan-title">{{ item.title }}</text>
              <text class="plan-meta">{{ item.meta }}</text>
            </view>
            <template v-if="removingId === item.id">
              <text class="act act--strong" @click="removePlan(item.id)">确认移除</text>
              <text class="act" @click="removingId = ''">取消</text>
            </template>
            <text v-else class="act" @click="removingId = item.id">移除</text>
          </view>
        </template>
      </view>
    </view>

    <!-- 唯一入口：打开挑选抽屉 -->
    <view class="cta-wrap">
      <view class="cta" hover-class="cta--pressed" @click="openPicker">
        <HandFrame />
        ＋ 挑选学习内容
      </view>
    </view>

    <!-- 挑选抽屉：日期 + 候选 + 加入 -->
    <view v-if="pickerOpen" class="sheet-mask" @click="closePicker">
      <view class="sheet-panel" @click.stop>
        <view class="sheet-bar"></view>
        <view class="sheet-head">
          <text class="sheet-title">挑选学习内容</text>
          <text class="sheet-cancel" @click="closePicker">取消</text>
        </view>

        <view class="date-opts">
          <text
            v-for="opt in quickDates"
            :key="opt.date"
            class="date-opt"
            :class="{ 'date-opt--active': targetDate === opt.date }"
            @click="targetDate = opt.date"
          >{{ opt.label }}</text>
          <uni-datetime-picker class="date-picker" type="date" :model-value="targetDate" @change="onDateChange">
            <text class="date-opt" :class="{ 'date-opt--active': !isQuickDate }">{{ customDateLabel }}</text>
          </uni-datetime-picker>
        </view>

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
        <view v-else class="empty">
          <text class="empty-line">{{ emptyCandidateText }}</text>
          <text class="act act--strong empty-act" @click="goGoalList">去目标页</text>
        </view>

        <view
          v-if="candidateGroups.length > 0"
          class="sheet-cta"
          :class="{ 'sheet-cta--off': selectedCount === 0 }"
          hover-class="sheet-cta--pressed"
          @click="submitAdd"
        >
          <HandFrame />
          <text class="sheet-cta-text">加入 {{ targetLabel }}（{{ selectedCount }}）</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 调整排期页（V5.46：手动调整，不再自动生成；V5.47：抽屉式挑选 + 固定入口）
 * ============================================================
 * 页面只做两件事：
 * - 列出今天及之后仍待完成的计划，按日期分组，逐条移除（软删除，任务回到池子）；
 * - 底部唯一入口「挑选学习内容」拉起抽屉，选日期、勾选步骤 / 整块目标，加入某天。
 * 删除与加入都走行内状态，全程零弹窗。
 */
import { computed, ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import HandFrame from '@/components/HandFrame.vue';
import HandLine from '@/components/HandLine.vue';
import StatusDot from '@/components/StatusDot.vue';
import type { Task } from '@/types/models';
import { useGoalStore } from '@/stores/goal';
import { usePlanStore } from '@/stores/plan';
import { useTaskStore } from '@/stores/task';
import { GOAL_UNIT_DEFAULT_MINUTES } from '@/services/constants';
import {
  groupManualCandidates,
  manualCandidates,
  type ManualCandidateGroup,
} from '@/services/manualCandidates';
import { addDays, formatDate, friendlyDate, fullDateText, todayStr } from '@/utils/date';
import { darkActive, syncNavBar } from '@/utils/theme';

const goalStore = useGoalStore();
const planStore = usePlanStore();
const taskStore = useTaskStore();

onShow(() => {
  syncNavBar();
});

const today = todayStr();

/* ==================== 已安排：按日期分组 ==================== */

interface PlanRow {
  id: string;
  title: string;
  meta: string;
  minutes: number;
}

interface DayGroup {
  date: string;
  items: PlanRow[];
  minutes: number;
}

const groups = computed<DayGroup[]>(() => {
  const byDate = new Map<string, PlanRow[]>();
  const rows = planStore.items
    .filter((i) => !i.deletedAt && i.status === 'pending' && i.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  for (const item of rows) {
    const task = taskStore.getById(item.taskId);
    const goal = goalStore.getById(item.goalId);
    const parts: string[] = [];
    if (goal?.title) {
      parts.push(goal.title);
    }
    parts.push(`${item.plannedMinutes} 分钟`);
    const list = byDate.get(item.date) ?? [];
    list.push({
      id: item.id,
      title: task?.title ?? '（步骤已删除）',
      meta: parts.join(' · '),
      minutes: item.plannedMinutes,
    });
    byDate.set(item.date, list);
  }

  return [...byDate.entries()].map(([date, items]) => ({
    date,
    items,
    minutes: items.reduce((sum, item) => sum + item.minutes, 0),
  }));
});

/** 展开中的日期（'' = 全部收起）；任务多时先看汇总，按天展开 */
const expandedDate = ref('');

function toggleDay(date: string): void {
  expandedDate.value = expandedDate.value === date ? '' : date;
}

watch(groups, (next) => {
  if (expandedDate.value && !next.some((group) => group.date === expandedDate.value)) {
    expandedDate.value = '';
  }
});

/** 日期标题：今天 / 明天 / 后天 / 10月25日 周日 */
function dayLabel(date: string): string {
  if (date === today) {
    return '今天';
  }
  if (date === addDays(today, 1)) {
    return '明天';
  }
  if (date === addDays(today, 2)) {
    return '后天';
  }
  return fullDateText(date);
}

/** 行内确认中的计划 id（'' = 无） */
const removingId = ref('');

function removePlan(id: string): void {
  planStore.removeItem(id);
  removingId.value = '';
  uni.showToast({ title: '已移除 · 任务回到目标池', icon: 'none' });
}

/* ==================== 挑选抽屉 ==================== */

const pickerOpen = ref(false);
const targetDate = ref(today);
const quickDates = [
  { date: today, label: '今天' },
  { date: addDays(today, 1), label: '明天' },
  { date: addDays(today, 2), label: '后天' },
];

const isQuickDate = computed(() => quickDates.some((q) => q.date === targetDate.value));

/** 日期小注：今天 / 明天 / 后天 / 10月25日 周日 */
const targetLabel = computed(() => {
  const quick = quickDates.find((q) => q.date === targetDate.value);
  return quick ? quick.label : friendlyDate(targetDate.value);
});

/** 自选日期按钮：未选中自选时写「自选日期」，选中后写具体日期 */
const customDateLabel = computed(() =>
  isQuickDate.value ? '自选日期' : friendlyDate(targetDate.value),
);

function onDateChange(value: string | number | string[] | undefined): void {
  let date = '';
  if (typeof value === 'number') {
    date = formatDate(new Date(value));
  } else if (typeof value === 'string') {
    date = value.slice(0, 10);
  } else if (Array.isArray(value) && typeof value[0] === 'string') {
    date = value[0].slice(0, 10);
  }
  if (!date) {
    return;
  }
  targetDate.value = date < today ? today : date;
}

const candidates = computed(() =>
  manualCandidates(
    goalStore.goals,
    taskStore.tasks,
    new Set(planStore.listByDate(targetDate.value).map((i) => i.taskId)),
  ),
);

/** 目标 + 步骤的分组视图（与目标页同一套层级） */
const candidateGroups = computed(() => groupManualCandidates(candidates.value));

/** 独立目标与目标下的步骤分区，避免两类混排 */
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

const selected = ref(new Set<string>());
const selectedCount = computed(() => selected.value.size);

function toggleSelect(id: string): void {
  if (selected.value.has(id)) {
    selected.value.delete(id);
  } else {
    selected.value.add(id);
  }
}

// 换日期 = 换候选池，上一次勾选不能带过去
watch(targetDate, () => {
  selected.value = new Set();
});

const emptyCandidateText = computed(() =>
  goalStore.activeGoals.length > 0 ? '没有待排的步骤了。' : '还没有目标。',
);

function openPicker(): void {
  selected.value = new Set();
  pickerOpen.value = true;
}

function closePicker(): void {
  pickerOpen.value = false;
}

/** 加入所选日期：整块目标现场记一条步骤，与手动挑选面板同一套 */
function submitAdd(): void {
  if (selected.value.size === 0) {
    uni.showToast({ title: '先勾选要加入的内容', icon: 'none' });
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
        estimateMinutes:
          (cand.goal.dailyMinutes ?? 0) > 0 ? cand.goal.dailyMinutes : GOAL_UNIT_DEFAULT_MINUTES,
        priority: cand.goal.priority,
      }),
    );
    fresh += 1;
  }
  const added = planStore.addTasksToDate(targetDate.value, tasks);
  selected.value = new Set();
  pickerOpen.value = false;
  uni.showToast({
    title:
      added > 0
        ? `已加入${targetLabel.value} · ${added} 项${fresh > 0 ? ` · 新记步骤 ${fresh} 条` : ''}`
        : '这些内容已经安排过了',
    icon: 'none',
  });
}

function goGoalList(): void {
  pickerOpen.value = false;
  uni.switchTab({ url: '/pages/goal/list' });
}
</script>

<style lang="scss" scoped>
/**
 * 调整排期页样式：极简手绘风（DESIGN.md V3.0 / V5.47）
 * 纯白底 / 纯黑正文 / #888 辅助；分隔线走手绘虚线，底部唯一入口。
 */

.schedule {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 48rpx 32rpx 220rpx;
  background-color: #ffffff;
  color: #000000;
}

/* ==================== 轻标题 ==================== */

.intro {
  margin-bottom: 40rpx;
}

.s-line {
  display: block;
  font-size: 24rpx;
  line-height: 1.4;
  letter-spacing: 6rpx;
  color: #000000;
}

/* ==================== 区块标题 ==================== */

.section-head {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 14rpx;
  border-bottom: 1px solid #eeeeee;
}

.section-title {
  font-size: 26rpx;
  letter-spacing: 6rpx;
  color: #000000;
}

/* ==================== 已安排 ==================== */

.day {
  margin-top: 24rpx;
}

.day-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 14rpx 8rpx 12rpx;
  margin: 0 -8rpx;
  border-radius: 8rpx;
}

.day-head--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

.day-main {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.day-date {
  font-size: 26rpx;
  line-height: 1.4;
  color: #000000;
}

.day-count {
  font-size: 22rpx;
  line-height: 1.4;
  color: #888888;
  font-variant-numeric: tabular-nums;
}

.day-act {
  flex-shrink: 0;
  padding: 6rpx 0 6rpx 24rpx;
  font-size: 22rpx;
  line-height: 1.4;
  color: #888888;
}

.day-line {
  display: block;
}

.plan-row {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 16rpx 0;
}

.plan-row--divided {
  margin-top: 4rpx;
  padding-top: 22rpx;
}

.plan-row-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.plan-main {
  flex: 1;
  min-width: 0;
}

.plan-title {
  display: block;
  font-size: 28rpx;
  line-height: 1.4;
  color: #000000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-meta {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.4;
  color: #888888;
}

/* ==================== 空态 ==================== */

.empty {
  margin-top: 24rpx;
}

.empty-line {
  display: block;
  font-size: 26rpx;
  line-height: 1.5;
  color: #888888;
}

.empty-act {
  display: inline-block;
  margin-top: 4rpx;
  margin-left: -28rpx;
}

/* ==================== 通用纯文字动作 ==================== */

.act {
  flex-shrink: 0;
  padding: 16rpx 28rpx;
  font-size: 26rpx;
  line-height: 1.4;
  color: #888888;
}

.act:active {
  background-color: rgba(245, 213, 184, 0.3);
}

.act--strong {
  color: #000000;
}

/* ==================== 底部唯一入口（手绘抖动框） ==================== */

.cta-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  box-sizing: border-box;
  padding: 16rpx 32rpx calc(16rpx + env(safe-area-inset-bottom));
  background-color: #ffffff;
}

.cta {
  position: relative;
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

.cta .hand-frame {
  color: #3a3a3a;
  transition: color 150ms ease;
}

.cta--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

.cta--pressed .hand-frame {
  color: #b89b5e;
}

/* ==================== 挑选抽屉 ==================== */

.sheet-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  background-color: rgba(0, 0, 0, 0.3);
  animation: mask-in 200ms ease-out;
}

.sheet-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 82vh;
  box-sizing: border-box;
  padding: 0 32rpx calc(32rpx + env(safe-area-inset-bottom));
  background-color: #ffffff;
  border-radius: 16rpx 16rpx 0 0;
  animation: sheet-up 240ms ease-out;
}

.sheet-bar {
  width: 72rpx;
  height: 4rpx;
  margin: 16rpx auto 20rpx;
  border-radius: 4rpx;
  background-color: #d9d9d9;
}

.sheet-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.sheet-title {
  font-size: 30rpx;
  line-height: 1.4;
  color: #000000;
}

.sheet-cancel {
  flex-shrink: 0;
  padding: 12rpx 0 12rpx 24rpx;
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
}

.date-opts {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 32rpx;
  margin-top: 16rpx;
  border-bottom: 1px solid #eeeeee;
}

.date-picker {
  display: inline-flex;
}

.date-opt {
  display: inline-flex;
  align-items: center;
  padding: 10rpx 0 14rpx;
  margin-bottom: -1px;
  border-bottom: 2rpx solid transparent;
  font-size: 26rpx;
  line-height: 1.4;
  color: #888888;
}

.date-opt--active {
  border-bottom-color: #3a3a3a;
  color: #000000;
}

.cand-list {
  flex: 1 1 auto;
  min-height: 0;
  max-height: 44vh;
  overflow-y: auto;
  margin-top: 8rpx;
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
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 18rpx 0;
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
  gap: 6rpx;
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

/* ==================== 抽屉主按钮 ==================== */

.sheet-cta {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 24rpx;
  padding: 24rpx 0;
  border-radius: 10rpx;
  background-color: #ffffff;
  color: #000000;
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

.sheet-cta--off {
  color: #888888;
}

.sheet-cta--off .hand-frame {
  color: #cfcfcf;
}

.sheet-cta-text {
  font-size: 28rpx;
  line-height: 1.4;
}

@media (prefers-reduced-motion: reduce) {
  .sheet-mask,
  .sheet-panel {
    animation: none;
  }
}

@keyframes sheet-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes mask-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
