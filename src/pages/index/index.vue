<template>
  <view class="today" :class="{ 'theme-dark': darkActive }">
    <!-- ① 顶部大数字排版组：80rpx 极细数字 + 右上角 40rpx 小亮星（V5.8 不经意的小标点）+
         24rpx 深灰标签 -->
    <view class="hero">
      <view class="hero-num-wrap">
        <text class="hero-num">{{ todayStudiedMinutes }}</text>
        <DoodleIcon
          class="hero-spark"
          :class="{ 'hero-spark--pulse': sparkPulse }"
          name="spark"
          :size="40"
        />
      </view>
      <text class="hero-unit">分钟</text>
    </view>

    <!-- ①.5 旧安排（V5.43）：跨天不再悄悄清掉——顶部问一句，接到今天或放回目标 -->
    <view v-if="leftoverCount > 0" class="leftover-block">
      <view class="leftover-head">
        <DoodleIcon name="path" :size="30" />
        <text class="leftover-title">{{ leftoverTitle }}</text>
      </view>
      <text class="leftover-text">{{ leftoverLead }}，要接到今天吗？</text>
      <view class="leftover-acts">
        <text class="act act--strong" @click="carryLeftovers">接到今天</text>
        <text class="act" @click="dismissLeftovers">放回目标</text>
      </view>
    </view>

    <!-- 主插画（V5.8.4 恢复最初的大树；V5.9 起树上会随学习时长结果子）：大数字下方、
         宽 60vw 居中，纯白底、不铺卡片；空状态与有任务共用同一棵树 -->
    <view class="hero-scene">
      <TreeScene :minutes="todayStudiedMinutes" :fresh-from="fruitFreshFrom" />
    </view>

    <!-- 应用重启自动暂停：一行浅灰说明 + 两个纯文字动作 -->
    <view v-if="timerPausedByRestore" class="resume-note">
      <text class="resume-text">检测到应用重启，计时已自动暂停</text>
      <view class="resume-acts">
        <text class="act act--strong" @click="resumeRestored">继续</text>
        <text class="act" @click="endRestored">结束</text>
      </view>
    </view>

    <!-- 指路小注（V5.6，V5.7 起一次性）：隐身的交互要看得见——点「知道了」后永久收起（完整教程在「我的 · 使用指南」） -->
    <view v-if="showHowto" class="howto">
      <view class="howto-lines">
        <text class="howto-line">轻点开始专注 · 专注中可暂停、继续</text>
        <text class="howto-line">轻点圆点或左划整行 · 直接完成</text>
      </view>
      <text class="act howto-ok" @click="dismissHowto">知道了</text>
    </view>

    <!-- ②.2 临近截止（V5.30e）：3 天内到期的进行中目标 → 一张便签提醒，轻点进目标详情 -->
    <view v-if="dueSoon.length > 0" class="due-block">
      <view class="due-head">
        <DoodleIcon name="hourglass" :size="30" />
        <text class="due-title">临近截止</text>
      </view>
      <view
        v-for="(item, idx) in dueSoon"
        :key="item.id"
        class="due-row"
        :class="{ 'due-row--divided': idx > 0 }"
        hover-class="due-row--pressed"
        @click="goGoalDetail(item.id)"
      >
        <HandLine v-if="idx > 0" class="due-row-line" />
        <text class="due-name">{{ item.title }}</text>
        <text class="due-rest" :class="{ 'due-rest--urgent': item.urgent }">{{ item.text }}</text>
      </view>
    </view>

    <!-- ② 全部完成状态：插画只当标点，不铺底色 -->
    <view v-if="allDone" class="done-card">
      <DoodleIcon name="house" :size="80" />
      <view class="done-texts">
        <text class="done-title">今日学习全部完成</text>
        <text class="done-sub">休息一下，明天继续</text>
      </view>
    </view>

    <!-- ②.5 今日时间轴小标题（V5.21）：今日 = 从目标任务池抽出的执行流水线 -->
    <view v-if="nodes.length > 0" class="timeline-head">
      <text class="timeline-title">今日时间轴</text>
    </view>

    <!-- ③ 今日任务（面）：计划在前、到期复习在后；行间手绘波浪虚线（V5.8） -->
    <view v-if="nodes.length > 0" class="card task-card">
      <view
        v-for="(node, idx) in nodes"
        :key="node.key"
        class="task-row"
        :class="{ 'task-row--divided': idx > 0 }"
        :style="swipe.rowStyle(node.key)"
        @touchstart="onRowTouchStart(node, $event)"
        @touchmove="swipe.move($event)"
        @touchend="swipe.end(true)"
        @touchcancel="swipe.end(false)"
        @mousedown="onRowMouseStart(node, $event)"
      >
        <HandLine v-if="idx > 0" class="task-row-line" />

        <!-- 左侧完成区：轻点 = 完成 / 取消完成；整行左划 = 直接完成（V5.29）。
             两条路径共用 completeNode，完成即放烟花，爆心就在这颗圆点上。
             .stop 阻止冒泡——绝不能让这一下顺带进入专注 -->
        <view
          :id="`dot-${node.key}`"
          class="task-dot-hit"
          @click.stop="onDotToggle(node)"
        >
          <StatusDot :done="node.done" />
        </view>

        <!-- 中间专注区：轻点 = 进入驻足（全屏专注），不改状态 -->
        <view class="task-main" hover-class="task-main--pressed" @click="onFocus(node)">
          <text class="task-title" :class="{ 'task-title--done': node.done }">{{ node.title }}</text>
          <text class="task-meta">{{ node.meta }}</text>
        </view>

        <!-- 计划节点：移除（两字内联确认，无弹窗） -->
        <view v-if="node.kind === 'plan'" class="task-acts">
          <template v-if="removingId === node.id">
            <text class="act act--strong" @click="confirmRemove(node.id)">确认移除</text>
            <text class="act" @click="removingId = null">取消</text>
          </template>
          <text v-else class="act" @click="onRemoveClick(node)">移除</text>
        </view>
      </view>

      <!-- 卡尾：调整排期入口（手绘分割线 + 一行字） -->
      <view class="task-foot" hover-class="task-foot--pressed" @click="goSchedule">
        <HandLine class="task-foot-line" />
        <text class="task-foot-text">调整排期</text>
      </view>
    </view>

    <!-- ④ 空状态：主插画（大树）已在 hero 里，这里只留文案 -->
    <view v-else class="empty-row">
      <text class="empty-title">今日无安排</text>
      <text class="empty-sub hand">今天空着呢 · 安排一点点，或发会儿呆</text>
    </view>

    <!-- ⑤ 唯一入口：大按钮（专注运行 / 驻足中 = 回到专注；否则打开安排面板）；
         描边为手绘抖动框（V5.8 HandFrame） -->
    <view class="cta-main" hover-class="cta-main--pressed" @click="onMainCta">
      <HandFrame />
      {{ mainCtaText }}
    </view>

    <!-- ⑥ 底部安排面板（V5.21）：自动排期 / 手动挑选——今日不凭空建任务，只从目标任务池抽取 -->
    <ArrangeSheet :show="sheetOpen" @close="sheetOpen = false" />

    <!-- ⑦ 烟花（V5.16）：完成一条今日任务时，2–3 组线条烟花在屏幕中部绽开 -->
    <FireworkCanvas :trigger="fwTrigger" :origin="fwOrigin" />

    <!-- 完成提示（V5.11）：自己的纸片提示，落在底部，把正中让给烟花 -->
    <view v-if="doneToast" class="done-toast">{{ doneToast }}</view>

    <!-- 自绘底部 Tab（V5.77）：原生栏隐藏，选中图标可回弹 -->
    <TabBar active="today" :pulse="tabPulse" />
  </view>
</template>

<script setup lang="ts">
/**
 * 今日页（首页）—— 结构化卡片风 + 单一入口交互（DESIGN.md V4.1）
 * ============================================================
 * 页面结构：
 * - 顶部：80rpx 极细大数字 + 右上角 40rpx 小亮星 + 底部对齐的 24rpx 标签；
 * - 主插画：大数字下方居中的「最初大树」（tree-hero，60vw），纯白底、不铺卡片；
 * - 状态：完成卡（小屋）/ 今日时间轴（面）/ 空状态（只留文案，插画不铺底色）；
 * - 底部唯一入口「+ 安排今日学习」：点开底部安排面板（ArrangeSheet 组件），
 *   面板内只有「自动排期」（规则引擎按截止时间与优先级从目标任务池挑出今天）与
 *   「手动挑选」（勾选任务池里的待办步骤 → 加入今日）。
 *   V5.21：今日不凭空建任务——目标（Task）是总仓库，今日（PlanItem）只是执行流水线。
 * 交互约定（V5.29 起两条完成路径）：
 * - 点任务主体（标题 + 时长）= 走进全屏专注；计时中点击其它任务只给轻提示，不打断当前专注；
 * - 左划任务行（≥ 48px 松手）= 直接完成；轻点左侧圆点 = 完成 / 取消完成；
 *   两种完成都放一轮烟花，爆心就在这颗圆点上；已完成行不跟手（撤销统一走圆点）；
 * - 专注结束且记录 ≥ 1 分钟 = 这条计划自动画上勾（「走过，才算完成」）；
 * - 复习圆点 / 左划复习行 = 完成本次复习。
 */

import { computed, nextTick, ref, watch } from 'vue';
import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
import ArrangeSheet from '@/components/ArrangeSheet.vue';
import DoodleIcon from '@/components/DoodleIcon.vue';
import FireworkCanvas from '@/components/FireworkCanvas.vue';
import HandFrame from '@/components/HandFrame.vue';
import HandLine from '@/components/HandLine.vue';
import StatusDot from '@/components/StatusDot.vue';
import TabBar from '@/components/TabBar.vue';
import TreeScene from '@/components/TreeScene.vue';
import { useRowSwipe, type MouseLike, type TouchLike } from '@/composables/useRowSwipe';
import type { StopTimerResult } from '@/stores/timer';
import type { Priority } from '@/types/models';
import { useGoalStore } from '@/stores/goal';
import { usePlanStore } from '@/stores/plan';
import { useReviewStore } from '@/stores/review';
import { useStudyLogStore } from '@/stores/studyLog';
import { useTaskStore } from '@/stores/task';
import { useTimerStore } from '@/stores/timer';
import { useUserStore } from '@/stores/user';
import { MIN_VALID_LOG_MINUTES } from '@/services/constants';
import { primeFocusMusic } from '@/services/focusMusic';
import { minutesOnDate } from '@/services/stats';
import { fruitCount } from '@/services/tree';
import { deadlineText } from '@/services/goal';
import { reviewDueText } from '@/services/review';
import { diffDays, todayStr } from '@/utils/date';
import { darkActive, syncNavBar } from '@/utils/theme';

const goalStore = useGoalStore();
const planStore = usePlanStore();
const taskStore = useTaskStore();
const reviewStore = useReviewStore();
const logStore = useStudyLogStore();
const timerStore = useTimerStore();
const userStore = useUserStore();

/** 当前日期（onShow 刷新；驻留过夜时由每秒心跳翻到新的一天） */
const today = ref(todayStr());

/** 自绘 TabBar 的回弹计数：每次 onShow +1，让选中图标重播果冻动画 */
const tabPulse = ref(0);

/* ==================== 每秒刷新：复习到期文案随日期滚动 ==================== */

const nowTick = ref(Date.now());
let tickId: ReturnType<typeof setInterval> | null = null;

/**
 * 跨天刷新：看板即时翻到新的一天。
 * V5.43：旧安排不再自动下线——留一条「昨天还有 N 项」的提示，
 * 由用户决定接到今天，还是放回目标池。
 */
function syncDay(): void {
  const now = todayStr();
  if (now !== today.value) {
    today.value = now;
  }
}

function startTick(): void {
  stopTick();
  nowTick.value = Date.now();
  tickId = setInterval(() => {
    nowTick.value = Date.now();
    // 驻留过夜：日期一变就地翻页（含昨天未完成安排的下线）
    if (todayStr() !== today.value) {
      syncDay();
    }
  }, 1000);
}

function stopTick(): void {
  if (tickId !== null) {
    clearInterval(tickId);
    tickId = null;
  }
}

onShow(() => {
  tabPulse.value += 1;
  syncDay(); // 覆盖应用跨零点驻留：回来即是最新的一天（旧安排留到用户决定）
  startTick();
  syncNavBar();
  // 藏在后台完成的（如从专注页归来）：重新露面时小亮星补跳一下（V5.8）
  if (lastVisibleDoneCount >= 0 && doneTodayCount.value > lastVisibleDoneCount) {
    pulseSpark();
    celebrate();
  }
  pageVisible = true;
  lastVisibleDoneCount = doneTodayCount.value;

  // 同上：在专注页学够了时长，回来时新果子才「长出来」（V5.9）
  if (lastVisibleFruitCount >= 0 && todayFruitCount.value > lastVisibleFruitCount) {
    celebrateFruits(lastVisibleFruitCount);
  }
  lastVisibleFruitCount = todayFruitCount.value;
});
onHide(() => {
  pageVisible = false;
  stopTick();
});
onUnload(() => {
  stopTick();
  if (sparkTimer !== null) {
    clearTimeout(sparkTimer);
    sparkTimer = null;
  }
  if (fruitTimer !== null) {
    clearTimeout(fruitTimer);
    fruitTimer = null;
  }
  if (doneToastTimer !== null) {
    clearTimeout(doneToastTimer);
    doneToastTimer = null;
  }
});

/* ==================== ① 主数字：今日已专注分钟数 ==================== */

const todayStudiedMinutes = computed(() => minutesOnDate(logStore.logs, today.value));

/** 应用重启后自动暂停中的会话：显示一行说明 + 继续/结束两个纯文字动作 */
const timerPausedByRestore = computed(() => timerStore.session?.pausedByRestore === true);

/* ==================== ② 今日节点（计划 + 到期复习） ==================== */

interface TodayNode {
  key: string;
  kind: 'plan' | 'review';
  /** 计划条目 id / 复习项 id */
  id: string;
  taskId: string;
  goalId: string;
  /** 所属目标名（任务已失联/无目标时为空串，meta 里省略前缀） */
  goalTitle: string;
  title: string;
  meta: string;
  /** 完成态：实心圆点 + 文字划线 */
  done: boolean;
}

/** 今日计划行（关联任务标题，任务被删除时给出占位文案） */
const todayRows = computed(() =>
  planStore.listByDate(today.value).map((item) => ({
    item,
    title: taskStore.getById(item.taskId)?.title ?? '（步骤已删除）',
    goalTitle: goalStore.getById(item.goalId)?.title ?? '',
  })),
);

/** 到期复习项（含逾期），按到期时间升序 */
const dueReviews = computed(() => reviewStore.listDue(nowTick.value));

/** 每项计划实际投入的分钟（按 planItemId 汇总）：完成态说「实际」，不再说「预计」 */
const minutesByPlanItem = computed(() => {
  const map = new Map<string, number>();
  for (const log of logStore.logs) {
    if (log.deletedAt || !log.planItemId) {
      continue;
    }
    map.set(log.planItemId, (map.get(log.planItemId) ?? 0) + log.durationMinutes);
  }
  return map;
});

/** 全部节点：计划在前，到期复习在后 */
const nodes = computed<TodayNode[]>(() => {
  const planNodes: TodayNode[] = todayRows.value.map((row) => {
    const done = row.item.status === 'done';
    const actual = minutesByPlanItem.value.get(row.item.id) ?? 0;
    const prefix = row.goalTitle ? row.goalTitle + ' · ' : '';
    return {
      key: row.item.id,
      kind: 'plan',
      id: row.item.id,
      taskId: row.item.taskId,
      goalId: row.item.goalId,
      goalTitle: row.goalTitle,
      title: row.title,
      // 完成之后「预计 30 分钟」会让人以为没做完：有记录就说实际时长
      meta:
        done && actual > 0
          ? `${prefix}实际 ${actual} 分钟`
          : `${prefix}预计 ${row.item.plannedMinutes} 分钟`,
      done,
    };
  });
  const reviewNodes: TodayNode[] = dueReviews.value.map((review) => {
    const goalTitle = goalStore.getById(review.goalId)?.title ?? '';
    return {
      key: review.id,
      kind: 'review',
      id: review.id,
      taskId: review.taskId,
      goalId: review.goalId,
      goalTitle,
      title: taskStore.getById(review.taskId)?.title ?? '（步骤已删除）',
      meta: `${goalTitle ? goalTitle + ' · ' : ''}第 ${review.stage + 1} 次复习 · ${reviewDueText(review.nextReviewAt, nowTick.value)}`,
      done: false,
    };
  });
  return [...planNodes, ...reviewNodes];
});

/* ==================== ①.5 旧安排（V5.43） ==================== */

/**
 * 过了当天还没完成的安排：不再自动清掉，在今日顶部问一句。
 * 任务仍待办、且今天还没排过，才算一条可接的旧安排。
 */
const leftoverItems = computed(() => planStore.listCarryCandidates(today.value));
const leftoverCount = computed(() => leftoverItems.value.length);
const onlyYesterday = computed(() =>
  leftoverItems.value.every((item) => diffDays(item.date, today.value) === 1),
);
const leftoverTitle = computed(() => (onlyYesterday.value ? '昨日未完成' : '旧安排未完成'));
const leftoverLead = computed(() =>
  onlyYesterday.value
    ? `还有 ${leftoverCount.value} 项没做完`
    : `还有 ${leftoverCount.value} 项安排没做完`,
);

/** 接到今天：同一任务只接一条，旧条目收起留历史 */
function carryLeftovers(): void {
  const moved = planStore.carryPendingBeforeTo(today.value);
  if (moved > 0) {
    uni.showToast({ title: `已接到今天 · ${moved} 项`, icon: 'none' });
  }
}

/** 放回目标：收起旧安排，任务本体仍在目标的任务池里 */
function dismissLeftovers(): void {
  const count = leftoverCount.value;
  planStore.expirePendingBefore(today.value);
  if (count > 0) {
    uni.showToast({ title: `已放回目标 · ${count} 项`, icon: 'none' });
  }
}

/** 全部完成（今天有安排且都已完成，也没有悬着的旧安排）→ 显示完成状态卡 */
const allDone = computed(
  () =>
    nodes.value.length > 0 &&
    nodes.value.every((n) => n.done) &&
    leftoverCount.value === 0,
);

/** 指路小注显示条件：还有未完成的计划行（只有复习行 / 全部完成时不显示） */
const hasOpenPlan = computed(() => nodes.value.some((n) => n.kind === 'plan' && !n.done));

/** 指路小注（V5.6）：还有未完成的计划行、且尚未点过「知道了」时出现（V5.7 起为一次性，
    确认标记存 user store；完整教程在「我的 · 使用指南」） */
const showHowto = computed(() => hasOpenPlan.value && !userStore.todayHowtoConfirmed);

/** 点「知道了」：确认指路小注，此后不再出现 */
function dismissHowto(): void {
  userStore.confirmTodayHowto();
}

/* ==================== ②.2 临近截止（V5.30e：3 天内的目标提醒） ==================== */

/** 提醒窗口：有效截止日距今 ≤ 3 天（含今天与已逾期） */
const DUE_SOON_DAYS = 3;

/** 优先级排序权重（高 → 低） */
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

interface DueSoonItem {
  id: string;
  title: string;
  /** 人话文案：剩 N 天 / 今天截止 / 已逾期 N 天 */
  text: string;
  /** 今天截止或已逾期：文字加深提醒（与目标列表同一口径） */
  urgent: boolean;
}

/** 轻点提醒行 → 进目标详情 */
function goGoalDetail(id: string): void {
  uni.navigateTo({ url: `/pages/goal/detail?id=${id}` });
}

/**
 * 临近截止的进行中目标：按剩余天数升序。
 * 已全部完成的不提醒；一条步骤都没有的照常提醒（还没安排）。
 */
const dueSoon = computed<DueSoonItem[]>(() => {
  const all = goalStore.goals.filter((g) => !g.deletedAt);
  const items: (DueSoonItem & { rest: number; weight: number })[] = [];
  for (const g of all) {
    if (g.status !== 'active') {
      continue;
    }
    const deadline = g.deadline;
    if (!deadline) {
      continue;
    }
    const rest = diffDays(today.value, deadline);
    if (rest > DUE_SOON_DAYS) {
      continue;
    }
    // 这个目标的步骤已经全部完成 → 不用提醒
    const tasks = taskStore.listByGoal(g.id);
    if (tasks.length > 0 && tasks.every((t) => t.status === 'done' || t.status === 'archived')) {
      continue;
    }
    items.push({
      id: g.id,
      title: g.title,
      text: deadlineText(deadline),
      urgent: rest <= 0,
      rest,
      weight: PRIORITY_RANK[g.priority],
    });
  }
  return items.sort((a, b) => a.rest - b.rest || a.weight - b.weight);
});

/* ==================== V5.8：大数字旁的小亮星 ==================== */

/** 小亮星弹跳（完成 / 打卡时「叮」一下）；只认「变多」，撤销与加载都不触发 */
const sparkPulse = ref(false);
let sparkTimer: ReturnType<typeof setTimeout> | null = null;
/** 页面是否在前台：藏在后台完成的（如从专注页归来）改为 onShow 补播动画 */
let pageVisible = true;
/** 上次在前台时的完成数快照（-1 = 尚未露过面） */
let lastVisibleDoneCount = -1;

/** 今日已完成节点数（计划勾选） */
const doneTodayCount = computed(() => nodes.value.filter((node) => node.done).length);

/** 到期复习行数（完成一次复习 = 行少一条） */
const dueReviewCount = computed(() => dueReviews.value.length);

function pulseSpark(): void {
  sparkPulse.value = false;
  nextTick(() => {
    sparkPulse.value = true;
    if (sparkTimer !== null) {
      clearTimeout(sparkTimer);
    }
    sparkTimer = setTimeout(() => {
      sparkPulse.value = false;
      sparkTimer = null;
    }, 700);
  });
}

watch([doneTodayCount, dueReviewCount], ([nowDone, nowDue], [prevDone, prevDue]) => {
  if (nowDone > prevDone || nowDue < prevDue) {
    if (pageVisible) {
      pulseSpark();
    }
  }
  if (pageVisible) {
    lastVisibleDoneCount = nowDone;
  }
});

/* ==================== V5.9：大树结果子 ==================== */

/** 今日已专注分钟 → 树上的果子数（每 30 分钟一颗，5 颗封顶） */
const todayFruitCount = computed(() => fruitCount(todayStudiedMinutes.value));

/** 新结出的果子从第几颗开始播放「长出来」动画；Infinity = 全部静态（加载 / 撤销都不重播） */
const fruitFreshFrom = ref(Number.POSITIVE_INFINITY);
let fruitTimer: ReturnType<typeof setTimeout> | null = null;

/** 上次在前台时的果子数快照（-1 = 尚未露过面） */
let lastVisibleFruitCount = -1;

/** 庆祝一下：从第 from 颗起，果子依次长出，整棵树跟着轻晃；1.8s 后复位 */
function celebrateFruits(from: number): void {
  fruitFreshFrom.value = from;
  if (fruitTimer !== null) {
    clearTimeout(fruitTimer);
  }
  fruitTimer = setTimeout(() => {
    fruitFreshFrom.value = Number.POSITIVE_INFINITY;
    fruitTimer = null;
  }, 1800);
}

// 本页内学够了（如重启恢复后收尾记录）：果子当场长出来
watch(todayFruitCount, (now, prev) => {
  if (now > prev && pageVisible) {
    celebrateFruits(prev);
  }
  if (pageVisible) {
    lastVisibleFruitCount = now;
  }
});

/* ==================== 节点交互（V5.16 重构：左侧完成区 / 中间专注区） ==================== */

/**
 * 完成类提示：落在屏幕底部。uni 的 H5 toast 写死居中且是深色药丸，
 * 和纸白调性不合——这里改用一张自己的小纸片提示，1.9s 后自动收起。
 */
const doneToast = ref('');
let doneToastTimer: ReturnType<typeof setTimeout> | null = null;

function toastDone(title: string): void {
  doneToast.value = title;
  if (doneToastTimer !== null) {
    clearTimeout(doneToastTimer);
  }
  doneToastTimer = setTimeout(() => {
    doneToast.value = '';
    doneToastTimer = null;
  }, 1900);
}

/* ---- 烟花：完成即放（V5.16） ---- */

const fwTrigger = ref(0);
const fwOrigin = ref<{ x: number; y: number } | null>(null);

/** 放一轮烟花；origin 是爆心（视口坐标），不传则随机落在屏幕中部 */
function celebrate(origin: { x: number; y: number } | null = null): void {
  fwOrigin.value = origin;
  fwTrigger.value += 1;
}

/** 取某个元素中心在视口中的位置（取不到就返回 null，让烟花自己随机） */
function centerOf(selector: string): Promise<{ x: number; y: number } | null> {
  return new Promise((resolve) => {
    uni
      .createSelectorQuery()
      .select(selector)
      .boundingClientRect((res) => {
        const rect = res as UniApp.NodeInfo | null;
        if (rect && typeof rect.left === 'number' && typeof rect.top === 'number') {
          resolve({ x: rect.left + (rect.width ?? 0) / 2, y: rect.top + (rect.height ?? 0) / 2 });
        } else {
          resolve(null);
        }
      })
      .exec();
  });
}

/* ---- 左划完成（V5.29）：与轻点圆点等价的第二条路径 ---- */

/** 可以左划完成的节点：未完成的计划行 / 复习行（已完成的行要撤销只能点圆点） */
function canCompleteBySwipe(node: TodayNode): boolean {
  return node.kind === 'review' || !node.done;
}

/** 今日行左划（≥ 48px 松手）= 直接完成；跟手与完成判定都只认左向 */
const swipe = useRowSwipe<TodayNode>({
  direction: 'left',
  onComplete: (node) => completeNode(node),
});

/** 行触屏开始：只认可完成的节点，已完成行不跟手（避免误触撤销语义） */
function onRowTouchStart(node: TodayNode, e: TouchLike): void {
  if (!canCompleteBySwipe(node)) {
    return;
  }
  swipe.start(node.key, node, e);
}

/** 行鼠标开始（桌面左键拖拽）：与触屏同语义 */
function onRowMouseStart(node: TodayNode, e: MouseLike): void {
  if (!canCompleteBySwipe(node)) {
    return;
  }
  swipe.startMouse(node.key, node, e);
}

/**
 * 完成一个节点：复习行 = 完成本次复习；未完成的计划行 = 画勾。
 * 两条路径（轻点圆点 / 左划）都走这里，完成立刻放一轮烟花，爆心就在这颗圆点上；
 * 已完成的计划行 / 无法推进的复习行静默不动作（完成 ≠ 取消）。
 */
function completeNode(node: TodayNode): void {
  if (node.kind === 'review') {
    if (finishReview(node.id)) {
      void centerOf(`#dot-${node.key}`).then((origin) => celebrate(origin));
    }
    return;
  }
  if (node.done) {
    return;
  }
  planStore.updateStatus(node.id, 'done');
  void centerOf(`#dot-${node.key}`).then((origin) => celebrate(origin));
}

/**
 * 左侧完成区：轻点 = 完成 / 取消完成（复习行 = 完成本次复习）。
 * 完成走 completeNode（放烟花）；已完成的计划行轻点 = 撤销（不放烟花）。
 * 先消费左划补发的 click，避免刚滑完又被这一下撤销。
 * 模板上已用 @click.stop，绝不会冒泡到中间的专注区。
 */
function onDotToggle(node: TodayNode): void {
  if (swipe.consumeClickGuard()) {
    return;
  }
  if (canCompleteBySwipe(node)) {
    completeNode(node);
    return;
  }
  planStore.updateStatus(node.id, 'pending');
  uni.showToast({ title: '已取消完成', icon: 'none' });
}

/** 中间专注区：只进驻足，不改状态；已完成 / 复习行不响应；左划补发的 click 一律吞掉 */
function onFocus(node: TodayNode): void {
  if (swipe.consumeClickGuard()) {
    return;
  }
  if (node.kind !== 'plan' || node.done) {
    return;
  }
  startFocusOrResume(node);
}

/** 进入（或回到）全屏专注：同任务计时中 = 回去；其它任务计时中 = 轻提示，不打断 */
function startFocusOrResume(node: TodayNode): void {
  const current = timerStore.session;
  if (current) {
    if (current.taskId === node.taskId) {
      enterFocus();
      return;
    }
    uni.showToast({ title: '正在专注中 · 点底部「回到专注」', icon: 'none' });
    return;
  }
  startFocusFor(node);
}

/** 开始为节点计时并进入全屏专注 */
function startFocusFor(node: TodayNode): void {
  timerStore.start({
    taskId: node.taskId,
    goalId: node.goalId,
    planItemId: node.id,
    taskTitle: node.title,
  });
  enterFocus();
}

/** 进入全屏专注页（无弹窗，直接切页） */
function enterFocus(): void {
  // 在点击手势里唤醒音频上下文；专注页的背景音乐随后淡入
  if (userStore.settings.focusMusicEnabled !== false) {
    primeFocusMusic();
  }
  uni.navigateTo({ url: '/pages/focus/index', animationType: 'fade-in', animationDuration: 280 });
}

/* ==================== 完成复习（推进艾宾浩斯阶段） ==================== */

function finishReview(id: string): boolean {
  const advance = reviewStore.completeReview(id);
  if (!advance) {
    return false;
  }
  toastDone(
    advance.finished ? '全部复习完成' : `已完成，下次 ${reviewDueText(advance.nextReviewAt, Date.now())}`,
  );
  return true;
}

/* ==================== 计划条目操作 ==================== */

/** 移除（两字内联确认，替代弹窗） */
const removingId = ref<string | null>(null);

/** 移除入口：先吞掉左划补发的 click，避免刚完成就弹出移除确认 */
function onRemoveClick(node: TodayNode): void {
  if (swipe.consumeClickGuard()) {
    return;
  }
  removingId.value = node.id;
}

function confirmRemove(id: string): void {
  planStore.removeItem(id);
  removingId.value = null;
  uni.showToast({ title: '已移除', icon: 'none' });
}

/* ==================== ⑤ 单一入口 + 底部安排面板（V5.21） ==================== */

/** 主按钮文案：专注进行 / 驻足中 = 回到专注（离开本页不中断计时）；否则 = 安排今日学习 */
const mainCtaText = computed(() => (timerStore.session ? '回到专注' : '+ 安排今日学习'));

/** 底部安排面板开合：面板内只有「自动排期 / 手动挑选」两个动作，今日不凭空建任务 */
const sheetOpen = ref(false);

/** 主按钮：专注运行中 = 回到专注页；否则打开安排面板 */
function onMainCta(): void {
  if (timerStore.session) {
    enterFocus();
    return;
  }
  sheetOpen.value = true;
}

/* ==================== 应用重启自动暂停的收尾动作 ==================== */

function resumeRestored(): void {
  timerStore.resume();
  enterFocus();
}

function endRestored(): void {
  const planItemId = timerStore.session?.planItemId ?? '';
  const result = timerStore.stopAndRecord();
  // 重启收尾同样是「走过」：有效记录（≥ 1 分钟）自动画上勾
  const completed = result.ok && planItemId ? planStore.completePending(planItemId) : false;
  notifyStopResult(result, completed);
}

/** 统一处理「结束并记录」的结果提示（completed = 顺手把这条计划画上了勾） */
function notifyStopResult(result: StopTimerResult, completed = false): void {
  if (result.ok) {
    toastDone(completed ? `已记录 ${result.minutes} 分钟 · 已完成` : `已记录 ${result.minutes} 分钟`);
    if (completed) {
      celebrate();
    }
  } else if (result.reason === 'too_short') {
    uni.showToast({ title: `不足 ${MIN_VALID_LOG_MINUTES} 分钟，本次未记录`, icon: 'none' });
  }
}

/* ==================== 导航 ==================== */

function goSchedule(): void {
  uni.navigateTo({ url: '/pages/plan/schedule' });
}
</script>

<style lang="scss" scoped>
/**
 * 今日页样式：结构化卡片风 + 单一入口（DESIGN.md V4.1）
 * - 面：白底 #FFFFFF + 1px #EEEEEE 描边 + 圆角 16rpx + 内边距 32rpx；
 * - 线：分割线 1px #EEEEEE；进度线为马卡龙薄荷（组件默认）；
 * - 插画：只当标点（大数字旁 40 / 卡片与面板图标 80 / 主插画 60vw 大树），不铺大面积底色；
 * - 暖色按压：浅暖橘 rgba(245,213,184,0.3)，松开 200ms 渐隐（common.scss 统一过渡）；
 * - 安全区：根容器 padding-bottom 140rpx，为底部 Tab 栏让位。
 */

.today {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 0 32rpx 140rpx; /* 左右安全边距 32rpx；底部 140rpx 给 Tab 栏让位 */
  background-color: #ffffff;
  color: #000000;
}

/* ==================== ① 顶部大数字排版组 ==================== */

.hero {
  display: flex;
  flex-direction: row;
  align-items: flex-end; /* 大数字、标签、小插画整体底部对齐 */
  padding-top: 96rpx;
}

.hero-num {
  font-size: 80rpx;
  font-weight: 300;
  line-height: 1;
  letter-spacing: 8rpx; /* 字距拉大（高级感来自字距与留白） */
  color: #000000;
  font-variant-numeric: tabular-nums;
}

/* 大数字 + 右上角小亮星：像不经意点上去的（V5.8） */
.hero-num-wrap {
  position: relative;
}

.hero-spark {
  position: absolute;
  top: -20rpx;
  right: -34rpx;
  transform: rotate(-8deg);
}

/* 完成 / 打卡时小亮星弹跳一下（class 由 JS 挂上，700ms 后摘掉） */
.hero-spark--pulse {
  animation: spark-twinkle 640ms ease-out;
}

@keyframes spark-twinkle {
  0% {
    transform: rotate(-8deg) scale(1);
  }
  30% {
    transform: rotate(12deg) scale(1.55);
  }
  60% {
    transform: rotate(-6deg) scale(0.9);
  }
  100% {
    transform: rotate(-8deg) scale(1);
  }
}

.hero-unit {
  margin-left: 12rpx;
  margin-bottom: 4rpx; /* 底部对齐的视觉微调 */
  font-size: 24rpx;
  letter-spacing: 4rpx;
  color: #888888;
}

/* ==================== 主插画（V5.8.4 恢复最初的大树；V5.9 树上结果子） ==================== */

/* 大树：整幅居中、纯白底、无卡片；宽 60vw（TreeScene 内部），上下各留 80rpx 空气。
   树下不写任何说明文字（V5.9 修订）：结果子这件事只用画面说 */
.hero-scene {
  display: flex;
  justify-content: center;
  padding: 80rpx 0;
}

/* ==================== 重启自动暂停提示 ==================== */

.resume-note {
  margin-top: 56rpx;
}

.resume-text {
  font-size: 28rpx;
  letter-spacing: 0.05em;
  line-height: 1.8;
  color: #888888;
}

.resume-acts {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 4rpx;
  margin-left: -28rpx;
}

/* ==================== 指路小注（V5.6）：把隐身的交互说清楚（V5.7 起一次性：点「知道了」永久收起） ==================== */

.howto {
  margin-top: 48rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.howto-lines {
  flex: 1;
}

.howto-line {
  display: block;
  font-size: 24rpx;
  line-height: 1.8;
  letter-spacing: 0.05em;
  color: #888888;
}

/* 「知道了」确认动作：复用 .act 的暖色按压与暗色覆盖（双类名压过 .act 的字号/内边距） */
.act.howto-ok {
  flex-shrink: 0;
  margin-left: 16rpx;
  padding: 16rpx 0 16rpx 24rpx;
  font-size: 24rpx;
}

/* ==================== ①.5 旧安排便签（V5.43） ==================== */

/* 暖色便签：与临近截止的奶油黄区分，一眼看出是「昨天的安排」 */
.leftover-block {
  margin-top: 40rpx;
  padding: 20rpx 28rpx 8rpx;
  border-radius: 20rpx;
  background-color: rgba(245, 213, 184, 0.22);
}

.leftover-head {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.leftover-title {
  margin-left: 10rpx;
  font-size: 24rpx;
  letter-spacing: 4rpx;
  color: #888888;
}

.leftover-text {
  display: block;
  margin-top: 12rpx;
  font-size: 28rpx;
  line-height: 1.5;
  color: #000000;
}

.leftover-acts {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 4rpx;
  margin-left: -28rpx;
}

/* ==================== ②.2 临近截止便签（V5.30e） ==================== */

/* 奶油黄便签：提醒的底色（与编辑页「每日学习时长」胶囊同一支黄） */
.due-block {
  margin-top: 40rpx;
  padding: 20rpx 28rpx 8rpx;
  border-radius: 20rpx;
  background-color: rgba(249, 231, 159, 0.22);
}

.due-head {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.due-title {
  margin-left: 10rpx;
  font-size: 24rpx;
  letter-spacing: 4rpx;
  color: #888888;
}

.due-row {
  position: relative; /* 手绘波浪分割线的定位坐标系 */
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 22rpx 0;
}

/* 行间分割线：与今日任务行同一条手绘波浪虚线 */
.due-row--divided {
  margin-top: 16rpx;
  padding-top: 24rpx;
}

.due-row-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.due-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 28rpx;
  line-height: 1.4;
  color: #000000;
}

.due-rest {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
}

/* 今天截止 / 已逾期：文字加深，底色不变（与目标列表同一口径） */
.due-rest--urgent {
  color: #000000;
}

.due-row--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

/* ==================== 通用纯文字动作（暖色按压反馈） ==================== */

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

/* ==================== 面 · 卡片（结构化容器） ==================== */

.card {
  background-color: #ffffff;
  border: 1px solid #eeeeee;
  border-radius: 16rpx;
  padding: 32rpx;
}

/* ==================== ② 全部完成状态卡 ==================== */

.done-card {
  margin-top: 48rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 24rpx;
  background-color: #ffffff;
  border: 1px solid #eeeeee;
  border-radius: 16rpx;
}

.done-texts {
  margin-left: 16rpx;
}

.done-title {
  display: block;
  font-size: 28rpx;
  line-height: 1.4;
  color: #000000;
}

.done-sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
}

/* ==================== ②.5 今日时间轴小标题（V5.21） ==================== */

.timeline-head {
  margin-top: 48rpx;
}

.timeline-title {
  font-size: 26rpx;
  letter-spacing: 6rpx;
  color: #888888;
}

/* ==================== ③ 今日时间轴卡片 ==================== */

.task-card {
  margin-top: 16rpx;
}

.task-row {
  position: relative; /* 手绘波浪分割线的定位坐标系（V5.8） */
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  /* 滑动完成（触屏 / 桌面左键拖拽；V5.29 起今日页只认左划）时禁掉文字选中与长按菜单 */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* 行间分割线：手绘波浪虚线（V5.8），由行内 HandLine 贴在行顶 */
.task-row--divided {
  margin-top: 24rpx;
  padding-top: 24rpx;
}

.task-row-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

/* 圆点打卡热区（与首行文字视觉居中；轻点 = 完成 / 取消完成，禁掉长按选中/系统菜单干扰） */
.task-dot-hit {
  flex-shrink: 0;
  width: 48rpx;
  height: 48rpx;
  margin-right: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.task-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 4rpx 8rpx;
  margin: -4rpx -8rpx; /* 抵消内边距：暖色按压底色只在文字周围晕开 */
  border-radius: 8rpx;
}

.task-main--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

.task-title {
  font-size: 30rpx;
  line-height: 1.4;
  color: #000000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-title--done {
  color: #888888;
  text-decoration: line-through;
}

.task-meta {
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
}

/* 行尾操作区（移除 / 内联确认） */
.task-acts {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  margin-left: 8rpx;
  margin-right: -20rpx;
}

/* 卡尾：调整排期入口（手绘波浪虚线贴顶，V5.8） */
.task-foot {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 24rpx;
  padding-top: 20rpx;
}

.task-foot-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.task-foot--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

.task-foot-text {
  font-size: 26rpx;
  line-height: 1.4;
  color: #888888;
  padding: 8rpx 0;
}

/* ==================== ④ 空状态（插画在 hero 大树，空态只留文案） ==================== */

.empty-row {
  margin-top: 40rpx;
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

/* ==================== ⑤ 唯一入口大按钮 ==================== */

/* 大按钮：手绘抖动边框（V5.8）替代 1px 规整描边——常态墨色、按下暖金 */
.cta-main {
  position: relative;
  margin-top: 48rpx;
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

.cta-main .hand-frame {
  color: #3a3a3a;
  transition: color 150ms ease;
}

.cta-main--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

.cta-main--pressed .hand-frame {
  color: #b89b5e;
}

/* ==================== ⑦ 完成提示（V5.11） ==================== */

/* 底部一张小纸片：与卡片同一套面（白底 + 1px 描边 + 16rpx 圆角），
   压在烟花之上（z 1000），保证「可撤销」这类信息永远读得到 */
.done-toast {
  position: fixed;
  left: 32rpx;
  right: 32rpx;
  bottom: 180rpx;
  z-index: 1000;
  box-sizing: border-box;
  padding: 20rpx 24rpx;
  background-color: #ffffff;
  border: 1px solid #eeeeee;
  border-radius: 16rpx;
  font-size: 24rpx;
  line-height: 1.6;
  letter-spacing: 0.05em;
  color: #3a3a3a;
  pointer-events: none;
  animation: toast-in 200ms ease-out;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(8rpx);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

</style>
