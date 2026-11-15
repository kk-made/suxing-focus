<template>
  <view class="stats" :class="{ 'theme-dark': darkActive }">
    <text class="stats-date">{{ dateText }}</text>

    <!-- 成就收藏集入口（V5.44）：一本收着完成目标的小书，步骤跟着目标一起进，轻点翻一翻 -->
    <view class="book-entry" hover-class="book-entry--pressed" @click="openBook">
      <DoodleIcon name="book" :size="84" />
      <view class="book-entry-texts">
        <text class="book-entry-title">成就收藏集</text>
        <text class="book-entry-sub">{{ bookEntrySub }}</text>
      </view>
      <text class="book-entry-act">翻一翻</text>
    </view>

    <!-- 顶部手绘插画：一根弯曲的柱状图（统计页专属） -->
    <view class="stats-deco">
      <DoodleIcon name="chart" :size="160" />
    </view>

    <!-- 主数字：今日分钟（V3.0：80rpx 大数字与标签底部对齐） -->
    <view class="hero">
      <text class="hero-num">{{ shown.today }}</text>
      <text class="hero-unit">分钟</text>
    </view>

    <!-- 三项小指标（V5.40：与柱状图同一次入场，数字从 0 滚到目标值） -->
    <view class="metrics">
      <view class="metric">
        <text class="metric-value">{{ shown.week }}</text>
        <text class="metric-label">本周（分钟）</text>
      </view>
      <view class="metric">
        <text class="metric-value">{{ shown.streak }}</text>
        <text class="metric-label">连续学习（天）</text>
      </view>
      <view class="metric">
        <text class="metric-value">{{ shown.total }}</text>
        <text class="metric-label">累计（分钟）</text>
      </view>
    </view>

    <!-- 近 7 天趋势：1px 深灰细线为柱，底部一条基准线 -->
    <view class="section">
      <text class="section-title">近 7 天</text>
      <view class="chart">
        <view v-for="(point, index) in series" :key="point.date" class="chart-col">
          <view class="chart-plot">
            <text class="chart-value">{{ point.minutes > 0 ? point.minutes : '' }}</text>
            <view
              class="chart-bar"
              :class="{ 'chart-bar--today': point.date === today }"
              :style="barStyle(point.minutes, index)"
            />
          </view>
        </view>
      </view>
      <view class="chart-labels">
        <view v-for="point in series" :key="point.date" class="chart-col">
          <text class="chart-label" :class="{ 'chart-label--today': point.date === today }">
            {{ dayLabel(point.date) }}
          </text>
        </view>
      </view>
    </view>

    <!-- 复习只留一行入口（V5.55）：统计页看数据，操作回今日 -->
    <view
      v-if="dueReviewCount > 0"
      class="review-link"
      hover-class="review-link--pressed"
      @click="goReview"
    >
      <text class="review-link-text">今日待复习 {{ dueReviewCount }} 项</text>
      <text class="review-link-act">去今日 →</text>
    </view>

    <!-- 目标投入分布 -->
    <view v-if="distribution.length > 0" class="section">
      <text class="section-title">目标投入分布</text>
      <view v-for="slice in distribution" :key="slice.goalId || 'free'" class="dist">
        <view class="dist-head">
          <text class="dist-title">{{ slice.title }}</text>
          <text class="dist-value">{{ formatDurationText(slice.minutes) }} · {{ Math.round(slice.ratio * 100) }}%</text>
        </view>
        <ProgressLine class="stat-line" :percent="Math.max(4, Math.round(slice.ratio * 100))" />
      </view>
    </view>

    <!-- 最近记录（移除为两字内联确认，不弹窗） -->
    <view v-if="logCount > 0" class="section">
      <view class="section-head">
        <text class="section-title">最近记录</text>
        <text class="section-note">共 {{ logCount }} 条</text>
      </view>
      <view
        v-for="(log, idx) in recentLogs"
        :key="log.id"
        class="log-row"
        :class="{ 'log-row--divided': idx > 0 }"
      >
        <HandLine v-if="idx > 0" class="log-row-line" />

        <view class="log-main">
          <text class="log-title">{{ logTitle(log) }}</text>
          <text class="log-sub">{{ friendlyDate(log.date) }} · {{ log.durationMinutes }} 分钟</text>
        </view>
        <view class="log-actions">
          <template v-if="removingLogId === log.id">
            <text class="act act--strong" @click="confirmRemoveLog(log.id)">确认移除</text>
            <text class="act" @click="removingLogId = null">取消</text>
          </template>
          <text v-else class="act" @click="removingLogId = log.id">移除</text>
        </view>
      </view>
    </view>

    <!-- 空态（V5.56）：一本空白手账 + 斜放的笔 + 手写体小句（不再复用今日页的小树） -->
    <view v-if="logCount === 0" class="empty">
      <view class="empty-row">
        <DoodleIcon name="notebook" :size="160" />
        <view class="empty-texts">
          <text class="empty-title">还没有学习记录</text>
          <text class="empty-sub hand">第一笔还没落下 · 去「今日」页开始吧</text>
        </view>
      </view>
    </view>

    <!-- 自绘底部 Tab（V5.77）：原生栏隐藏，选中图标可回弹 -->
    <TabBar active="stats" :pulse="tabPulse" />
  </view>
</template>

<script setup lang="ts">
/**
 * 学习统计页
 * 全部数字来自学习记录与复习项 store，由服务的纯函数计算（有单测），AI 不参与。
 * 视觉：纸白背景、80rpx 大数字、1px 细线图表，无卡片/无彩色/无大面积色块（V3.0）。
 */
import { computed, onUnmounted, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import DoodleIcon from '@/components/DoodleIcon.vue';
import HandLine from '@/components/HandLine.vue';
import TabBar from '@/components/TabBar.vue';
import ProgressLine from '@/components/ProgressLine.vue';
import type { StudyLog } from '@/types/models';
import { useGoalStore } from '@/stores/goal';
import { useReviewStore } from '@/stores/review';
import { useStudyLogStore } from '@/stores/studyLog';
import { useTaskStore } from '@/stores/task';
import { bookLeaves } from '@/services/collection';
import {
  distributionByGoal,
  formatDurationText,
  lastNDaysSeries,
  minutesInRange,
  minutesOnDate,
  streakDays,
  totalMinutes as sumMinutes,
} from '@/services/stats';
import {
  addDays,
  friendlyDate,
  fullDateText,
  startOfWeek,
  todayStr,
  WEEKDAY_CN,
  weekdayOf,
} from '@/utils/date';
import { darkActive, syncNavBar } from '@/utils/theme';

const logStore = useStudyLogStore();
const goalStore = useGoalStore();
const taskStore = useTaskStore();
const reviewStore = useReviewStore();

const today = ref(todayStr());

/** 自绘 TabBar 的回弹计数：每次 onShow +1 */
const tabPulse = ref(0);

/* App 的逻辑层没有 window / rAF 时退回 setTimeout，统计页两端都能跑 */
function nextFrame(cb: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(cb);
  }
  return setTimeout(() => cb(Date.now()), 16) as unknown as number;
}

function cancelFrame(id: number): void {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(id);
    return;
  }
  clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
}

/* 柱状图入场：每次进入统计页，柱子从 0 依次长到对应高度 */
const chartReady = ref(false);
let chartTimer: ReturnType<typeof setTimeout> | null = null;

/* 数字入场：大数字与三项指标从 0 滚到目标值（与柱状图同一次入场） */
const shown = ref({ today: 0, week: 0, streak: 0, total: 0 });
let numberFrame: number | null = null;

/**
 * 每条数字的入场节奏（V5.42）：以重叠为主、错峰为辅。
 * 数值越大滚得越久，小数字（连续天数）先落定，避免四个数字排着队跳。
 */
const NUMBER_MOTION = {
  today: { delay: 0, duration: 900 },
  week: { delay: 40, duration: 940 },
  streak: { delay: 70, duration: 760 },
  total: { delay: 100, duration: 1040 },
} as const;

/** 两端速度为 0 的平滑起落：轻轻起步、慢慢停稳，不再猛冲后急刹 */
function easeSmoothstep(p: number): number {
  return p * p * (3 - 2 * p);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function scheduleChartGrowth(): void {
  if (chartTimer) {
    clearTimeout(chartTimer);
  }
  chartReady.value = false;
  // 等页面先画出 0 高度的一帧，再触发高度过渡
  chartTimer = setTimeout(() => {
    chartReady.value = true;
    chartTimer = null;
  }, 60);
}

function stopNumberRoll(): void {
  if (numberFrame !== null) {
    cancelFrame(numberFrame);
    numberFrame = null;
  }
  shown.value = { today: 0, week: 0, streak: 0, total: 0 };
}

onShow(() => {
  tabPulse.value += 1;
  today.value = todayStr();
  syncNavBar();
  scheduleChartGrowth();
  animateNumbers();
});

onHide(() => {
  // 在页外先收回 0 高度 / 0 数字，下次进入时才能重新生长（不会闪一下满格）
  if (chartTimer) {
    clearTimeout(chartTimer);
    chartTimer = null;
  }
  chartReady.value = false;
  stopNumberRoll();
});

onUnmounted(() => {
  if (chartTimer) {
    clearTimeout(chartTimer);
  }
  stopNumberRoll();
});

/** 本页导航栏配色随主题同步（utils/theme.ts · syncNavBar） */

const dateText = computed(() => fullDateText(today.value));

/* ---------- 成就收藏集（V5.22） ---------- */

/**
 * 收藏集里的回忆条数（V5.33：与书里的页数同口径——一页 = 一段旅程，
 * 收进来的目标自己占一页、它的步骤列在这页上，不一条一页）。
 */
const archivedCount = computed(
  () => bookLeaves(goalStore.goals, taskStore.tasks).length,
);

/** 入口小注：还没收藏过时给一句引导 */
const bookEntrySub = computed(() =>
  archivedCount.value > 0
    ? `已收藏 ${archivedCount.value} 个目标`
    : '完成的目标，会连同步骤收进这本册子',
);

function openBook(): void {
  uni.navigateTo({ url: '/pages/achieve/index' });
}

/** 今日 / 本周（周一起）/ 累计 学习分钟数 */
const todayMinutes = computed(() => minutesOnDate(logStore.logs, today.value));
const weekMinutes = computed(() => {
  const from = startOfWeek(today.value);
  return minutesInRange(logStore.logs, from, addDays(from, 6));
});
const totalMinutes = computed(() => sumMinutes(logStore.logs));

/** 连续学习天数 */
const streak = computed(() => streakDays(logStore.logs, today.value));

/** 数字滚动：hero 先动，三项指标依次跟上；减速停在目标值 */
function animateNumbers(): void {
  if (numberFrame !== null) {
    cancelFrame(numberFrame);
    numberFrame = null;
  }
  const targets = {
    today: todayMinutes.value,
    week: weekMinutes.value,
    streak: streak.value,
    total: totalMinutes.value,
  };
  if (prefersReducedMotion()) {
    shown.value = targets;
    return;
  }
  const start = Date.now();
  const tick = (now: number): void => {
    let running = false;
    const next = { ...targets };
    (Object.keys(targets) as (keyof typeof targets)[]).forEach((key) => {
      const motion = NUMBER_MOTION[key];
      const p = Math.min(1, Math.max(0, (now - start - motion.delay) / motion.duration));
      next[key] = Math.round(targets[key] * easeSmoothstep(p));
      if (p < 1) {
        running = true;
      }
    });
    shown.value = next;
    numberFrame = running ? nextFrame(tick) : null;
  };
  numberFrame = nextFrame(tick);
}

/** 有效学习记录条数 */
const logCount = computed(() => logStore.logs.filter((log) => !log.deletedAt).length);

/* ---------- 近 7 天趋势 ---------- */

const series = computed(() => lastNDaysSeries(logStore.logs, today.value, 7));
const seriesMax = computed(() =>
  series.value.reduce((max, point) => Math.max(max, point.minutes), 0),
);

/** 柱高：按近 7 天最大值等比缩放到 170rpx；全为 0 时只留基准刻度 */
function barHeight(minutes: number): string {
  if (seriesMax.value === 0) {
    return '6rpx';
  }
  return `${Math.max(6, Math.round((minutes / seriesMax.value) * 170))}rpx`;
}

/** 柱子样式：未就绪时 0 高；就绪后按列依次延迟生长 */
function barStyle(minutes: number, index: number): Record<string, string> {
  return {
    height: chartReady.value ? barHeight(minutes) : '0rpx',
    transitionDelay: chartReady.value ? `${index * 55}ms` : '0ms',
  };
}

/** 图表横轴标签：今天 / 周一…周日 */
function dayLabel(date: string): string {
  return date === today.value ? '今天' : `周${WEEKDAY_CN[weekdayOf(date)]}`;
}

/* ---------- 今日待复习（只作入口，不展开流程） ---------- */

/** 到期复习数：nextReviewAt <= 现在（含逾期），统计页只读一行 */
const dueReviewCount = computed(() => {
  void today.value; // 回到页面（可能跨天）时重算到期数
  return reviewStore.listDue(Date.now()).length;
});

function goReview(): void {
  uni.switchTab({ url: '/pages/index/index' });
}

/* ---------- 目标投入分布 ---------- */

const distribution = computed(() => distributionByGoal(logStore.logs, goalStore.goals));

/* ---------- 最近记录 ---------- */

const recentLogs = computed(() => logStore.logs.filter((log) => !log.deletedAt).slice(0, 8));

/** 记录标题（任务被删除时给出占位文案） */
function logTitle(log: StudyLog): string {
  if (!log.taskId) {
    return '自由学习';
  }
  return taskStore.getById(log.taskId)?.title ?? '（步骤已删除）';
}

/** 行内两段式移除：先点「移除」再点「确认移除」 */
const removingLogId = ref<string | null>(null);

function confirmRemoveLog(id: string): void {
  logStore.removeLog(id);
  removingLogId.value = null;
  uni.showToast({ title: '已移除', icon: 'none' });
}
</script>

<style lang="scss" scoped>
.stats {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 80rpx 32rpx 140rpx; /* V4.0：左右安全边距 32rpx；底部 140rpx 给 Tab 栏让位 */
  background-color: #ffffff;
  color: #000000;
}

.stats-date {
  font-size: 24rpx;
  letter-spacing: 2rpx;
  color: #888888;
}

/* ==================== 成就收藏集入口（V5.22） ==================== */

.book-entry {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 26rpx;
  margin-left: -4rpx;
  padding: 16rpx 4rpx;
}

/* 暖色按压反馈（与 .act 同源） */
.book-entry--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

.book-entry-texts {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-left: 20rpx;
}

.book-entry-title {
  font-size: 28rpx;
  line-height: 1.4;
  color: #000000;
}

.book-entry-sub {
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.4;
  color: #888888;
}

.book-entry-act {
  padding: 12rpx 0 12rpx 24rpx;
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
}

/* ==================== 顶部插画（弯曲的柱状图） ==================== */

.stats-deco {
  display: flex;
  flex-direction: row;
  justify-content: center;
  margin-top: 24rpx;
}

/* ==================== 主数字 ==================== */

.hero {
  display: flex;
  flex-direction: row;
  align-items: flex-end; /* V3.0：大数字与标签底部对齐 */
  margin-top: 48rpx;
}

.hero-num {
  font-size: 80rpx; /* V3.0：大数字 80rpx */
  font-weight: 300;
  line-height: 1;
  letter-spacing: 4rpx;
  color: #000000;
  font-variant-numeric: tabular-nums;
}

.hero-unit {
  margin-left: 12rpx;
  margin-bottom: 6rpx; /* 底部对齐的视觉微调 */
  font-size: 24rpx;
  letter-spacing: 4rpx;
  color: #888888;
}

/* ==================== 三项小指标 ==================== */

.metrics {
  display: flex;
  flex-direction: row;
  margin-top: 96rpx;
}

.metric {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.metric-value {
  font-size: 48rpx;
  font-weight: 300;
  line-height: 1.2;
  color: #000000;
  font-variant-numeric: tabular-nums;
}

.metric-label {
  margin-top: 12rpx;
  font-size: 24rpx; /* V3.0：标签 24rpx */
  color: #888888;
}

/* ==================== 通用分区 ==================== */

.section {
  margin-top: 112rpx;
}

.section-head {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
}

.section-title {
  font-size: 26rpx;
  letter-spacing: 6rpx;
  color: #000000;
}

.section-note {
  font-size: 24rpx;
  color: #888888;
  font-variant-numeric: tabular-nums;
}

/* ==================== 近 7 天（1px 细线柱状图） ==================== */

.chart {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  margin-top: 48rpx;
  border-bottom: 1px solid #3A3A3A; /* V3.0 线条主色 */
}

.chart-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.chart-plot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 220rpx;
}

.chart-value {
  height: 32rpx;
  font-size: 22rpx;
  line-height: 1.2;
  color: #888888;
  font-variant-numeric: tabular-nums;
}

.chart-bar {
  width: 4rpx;
  background-color: #3A3A3A; /* V3.0 线条主色 */
  /* V5.40：每次进入统计页，从 0 向上长到对应高度（延迟由行内 transitionDelay 分行错开） */
  transition: height 680ms cubic-bezier(0.22, 0.8, 0.28, 1);
  will-change: height;
}

/* 今天：线略粗一档，仍是线条不是色块 */
.chart-bar--today {
  width: 8rpx;
}

@media (prefers-reduced-motion: reduce) {
  .chart-bar {
    transition: none;
  }
}

.chart-labels {
  display: flex;
  flex-direction: row;
  margin-top: 20rpx;
}

.chart-label {
  font-size: 22rpx;
  color: #888888;
}

.chart-label--today {
  color: #000000;
}

/* ==================== 进度虚线（目标投入，1px 虚线） ==================== */

.stat-line {
  margin-top: 40rpx;
}

/* ==================== 复习入口（V5.55：只留一行，不再展开流程） ==================== */

.review-link {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-top: 32rpx;
  padding: 16rpx 0;
}

.review-link--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

.review-link-text {
  font-size: 24rpx;
  line-height: 1.4;
  letter-spacing: 0.05em;
  color: #888888;
}

.review-link-act {
  flex-shrink: 0;
  margin-left: 24rpx;
  font-size: 24rpx;
  line-height: 1.4;
  color: #000000;
}

/* ==================== 目标投入分布 ==================== */

.dist {
  margin-top: 48rpx;
}

.dist-head {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
}

.dist-title {
  font-size: 28rpx;
  color: #000000;
}

.dist-value {
  font-size: 24rpx;
  color: #888888;
  font-variant-numeric: tabular-nums;
}

.dist .stat-line {
  margin-top: 20rpx;
}

/* ==================== 最近记录 ==================== */

.log-row {
  position: relative; /* 手绘波浪分割线的定位坐标系（V5.8） */
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  margin-top: 44rpx;
}

/* 记录行间分割线：手绘波浪虚线（V5.8 延伸），由行内 HandLine 贴在行顶 */
.log-row--divided {
  margin-top: 24rpx;
  padding-top: 24rpx;
}

.log-row-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.log-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.log-title {
  font-size: 28rpx;
  line-height: 1.4;
  color: #000000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-sub {
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
  font-variant-numeric: tabular-nums;
}

.log-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  margin-left: 12rpx;
  margin-top: -8rpx;
  margin-right: -28rpx;
}

/* 通用纯文字动作（隐形热区） */
.act {
  padding: 12rpx 28rpx;
  font-size: 28rpx;
  line-height: 1.4;
  color: #888888;
}

/* V4.1 暖色按压反馈：浅暖橘底 */
.act:active {
  background-color: rgba(245, 213, 184, 0.3);
}

.act--strong {
  color: #000000;
}

/* ==================== 空态（V5.8 延伸：小树苗 + 手写体小句） ==================== */

.empty {
  margin-top: 120rpx;
}

.empty-row {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.empty-texts {
  margin-left: 24rpx;
}

.empty-title {
  display: block;
  font-size: 28rpx;
  line-height: 1.4;
  color: #000000;
}

.empty-sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
}

/* 空态的手写体小句（V5.8）：日记口气，字体栈走系统楷体（见 App.vue 的 .hand） */
.empty-sub.hand {
  font-size: 26rpx;
}
</style>
