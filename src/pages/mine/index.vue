<template>
  <view class="mine" :class="{ 'theme-dark': darkActive }">
    <!-- ① 每天可学习时长（学习工具最重要的设置，放最上方）：转轮选择 -->
    <view class="card">
      <view class="card-head">
        <DoodleIcon name="hourglass" />
        <text class="card-title">每天可学习时长</text>
      </view>
      <picker-view
        class="wheel"
        :value="wheelValue"
        :indicator-style="WHEEL_INDICATOR_STYLE"
        @change="onWheelChange"
        @pickstart="onWheelGestureStart"
        @pickend="onWheelGestureEnd"
        @touchstart="onWheelGestureStart"
        @touchend="onWheelGestureEnd"
        @touchcancel="onWheelGestureEnd"
        @mousedown="onWheelGestureStart"
        @mouseup="onWheelGestureEnd"
        @mouseleave="onWheelGestureEnd"
      >
        <picker-view-column>
          <view v-for="(minute, idx) in WHEEL_MINUTES" :key="minute" class="wheel-item">
            <text
              class="wheel-item-text"
              :class="{ 'wheel-item-text--sel': idx === wheelIndex }"
              :style="wheelItemStyle(idx)"
            >{{ minute }} 分钟</text>
          </view>
        </picker-view-column>
      </picker-view>
      <text class="card-hint">自动排期按它估算每天能安排的学习量</text>
    </view>

    <!-- ② 每周可学习日：64rpx 圆角方块，选中 = 浅马卡龙底 -->
    <view class="card">
      <view class="card-head">
        <DoodleIcon name="calendar" />
        <text class="card-title">每周可学习日</text>
      </view>
      <view class="week">
        <view
          v-for="(label, idx) in WEEKDAY_CN"
          :key="idx"
          class="week-item"
          :class="{ 'week-item--active': userStore.settings.studyDaysOfWeek.includes(idx) }"
          hover-class="week-item--pressed"
          @click="userStore.toggleStudyDay(idx)"
        >{{ label }}</view>
      </view>
      <text class="card-hint">只在选中的日子安排学习</text>
    </view>

    <!-- ③ 外观：浅色 / 深色 / 跟随系统 -->
    <view class="card">
      <view class="card-head">
        <DoodleIcon name="contrast" />
        <text class="card-title">外观</text>
      </view>
      <view class="opts">
        <view
          v-for="opt in THEME_OPTIONS"
          :key="opt.value"
          class="opt"
          :class="{ 'opt--active': userStore.settings.themeMode === opt.value }"
          hover-class="opt--pressed"
          @click="userStore.setThemeMode(opt.value)"
        >{{ opt.label }}</view>
      </view>
    </view>

    <!-- ④ 使用指南：整卡即入口（V5.7）——完整交互手册，今日页指路小注的永久去处 -->
    <view class="card" hover-class="guide-entry--pressed" @click="openGuide">
      <view class="card-head">
        <DoodleIcon name="compass" />
        <text class="card-title">使用指南</text>
      </view>
      <text class="card-hint">全站手势与入口，一分钟读完。</text>
    </view>

    <!-- ⑤ 数据管理：行内两段式确认（不弹窗） -->
    <view class="card">
      <view class="card-head">
        <DoodleIcon name="cabinet" />
        <text class="card-title">数据管理</text>
      </view>
      <text class="card-hint">所有数据仅保存在本设备。</text>

      <!-- 卡内分隔：手绘波浪虚线（V5.8 延伸） -->
      <HandLine class="card-divider" />

      <template v-if="!confirmingClear">
        <view class="clear-btn" hover-class="clear-btn--pressed" @click="confirmingClear = true">
          清空本地数据
        </view>
      </template>
      <template v-else>
        <text class="danger-note">将删除本机全部目标、学习步骤、计划、复习与学习记录（设置保留），且不可恢复。</text>
        <view class="confirm-acts">
          <text class="act act--strong" @click="confirmClear">确认清空</text>
          <text class="act" @click="confirmingClear = false">取消</text>
        </view>
      </template>
    </view>

    <!-- 自绘底部 Tab（V5.77）：原生栏隐藏，选中图标可回弹 -->
    <TabBar active="mine" :pulse="tabPulse" />
  </view>
</template>

<script setup lang="ts">
/**
 * 我的页 —— 紧凑卡片风（DESIGN.md V4.2）
 * ============================================================
 * 模块顺序（按学习工具优先级）：① 每天可学习时长（转轮）→ ② 每周可学习日 → ③ 外观 → ④ 使用指南 → ⑤ 数据管理。
 * 卡片：内边距 24rpx、模块间距 16rpx；标题 28rpx 深灰 #3A3A3A，左侧 80rpx 小插画（标点，不铺底色）。
 * 转轮：picker-view，15 ~ 480 分钟步长 5；滚动过程中每经过一档轻震一次（50ms 节流）。
 * 交互：全站暖色按压反馈（浅暖橘 30%，松开 200ms 渐隐）。
 */
import { computed, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import DoodleIcon from '@/components/DoodleIcon.vue';
import HandLine from '@/components/HandLine.vue';
import TabBar from '@/components/TabBar.vue';
import { canHaptic, wheelIndexFromOffset } from '@/services/wheelHaptics';
import type { ThemeMode } from '@/types/models';
import { useUserStore } from '@/stores/user';
import { useGoalStore } from '@/stores/goal';
import { useTaskStore } from '@/stores/task';
import { usePlanStore } from '@/stores/plan';
import { useReviewStore } from '@/stores/review';
import { useStudyLogStore } from '@/stores/studyLog';
import { useTimerStore } from '@/stores/timer';
import { WEEKDAY_CN } from '@/utils/date';
import { darkActive, syncNavBar } from '@/utils/theme';

const userStore = useUserStore();
const goalStore = useGoalStore();
const taskStore = useTaskStore();
const planStore = usePlanStore();
const logStore = useStudyLogStore();
const reviewStore = useReviewStore();
const timerStore = useTimerStore();

/** 自绘 TabBar 的回弹计数：每次 onShow +1 */
const tabPulse = ref(0);

onShow(() => {
  tabPulse.value += 1;
  syncNavBar();
});

onHide(() => {
  stopWheelHaptics();
});

/* ==================== ① 每天可学习时长：转轮（picker-view） ==================== */

/** 转轮范围与步长：15 ~ 480 分钟、步长 5（共 94 档） */
const WHEEL_MIN = 15;
const WHEEL_MAX = 480;
const WHEEL_STEP = 5;

const WHEEL_MINUTES: number[] = [];
for (let minute = WHEEL_MIN; minute <= WHEEL_MAX; minute += WHEEL_STEP) {
  WHEEL_MINUTES.push(minute);
}

/** 单项高度 75rpx：300rpx 视窗内可见 4 项（要求 3~5 项）；与 .wheel-item 的 height 保持一致 */
const WHEEL_ITEM_RPX = 75;

/** 选中框：选中项上下各一条 1px 浅灰横线 */
const WHEEL_INDICATOR_STYLE = `height: ${WHEEL_ITEM_RPX}rpx; border-top: 1px solid #eeeeee; border-bottom: 1px solid #eeeeee;`;

/** 下标限幅 */
function clampWheelIndex(index: number): number {
  return Math.min(WHEEL_MINUTES.length - 1, Math.max(0, index));
}

/** 当前选中下标：把已保存的分钟数换算到最近的档位 */
const wheelIndex = ref(
  clampWheelIndex(Math.round((userStore.settings.dailyAvailableMinutes - WHEEL_MIN) / WHEEL_STEP)),
);

const wheelValue = computed(() => [wheelIndex.value]);

/** 选项样式：中选 48rpx、上下 28rpx、透明度随距离递减；文字颜色交给类名（浅/深色各自覆盖） */
function wheelItemStyle(idx: number): Record<string, string> {
  const distance = Math.abs(idx - wheelIndex.value);
  return {
    fontSize: distance === 0 ? '48rpx' : '28rpx',
    lineHeight: '1',
    opacity: distance === 0 ? '1' : String(Math.max(0.5, 1 - distance * 0.2)),
  };
}

/** 转轮滚动到新选项（@change 触发，停稳后）：更新下标并写入设置 */
function onWheelChange(e: { detail: { value: number[] } }): void {
  const idx = clampWheelIndex(Number(e.detail.value[0]));
  stopWheelHaptics(idx);
  if (idx === wheelIndex.value) {
    return;
  }
  wheelIndex.value = idx;
  userStore.setDailyAvailableMinutes(WHEEL_MINUTES[idx]);
}

/* ---------- 滚动过程中的逐档震动（V5.78） ----------
 * picker-view 的 @change 只在停稳后触发，拿不到中间档位；
 * 手势期间每 30ms 读一次内部内容的相对位移，换算当前档位，
 * 档位一变就轻震一次，并用 50ms 节流兜住快速甩动。 */

/** 采样间隔：足够跟上逐档滚动，又不会给逻辑层造成压力 */
const WHEEL_SAMPLE_MS = 30;
/** 单次手势最长监听时间：防止 pickend 丢失时轮询常驻 */
const WHEEL_HAPTIC_MAX_MS = 8000;
/** 松手后的宽限期：等最后一帧采样和 @change 落定 */
const WHEEL_HAPTIC_GRACE_MS = 70;

let hapticActive = false;
let hapticSampleTimer: ReturnType<typeof setTimeout> | null = null;
let hapticStopTimer: ReturnType<typeof setTimeout> | null = null;
let hapticMaxTimer: ReturnType<typeof setTimeout> | null = null;
/** 标定后的单档高度 / 内容基准位移 */
let hapticItemHeight = 0;
let hapticOriginRel = 0;
/** 手势内当前档位 / 起始档位 */
let hapticLiveIndex = wheelIndex.value;
let hapticStartIndex = wheelIndex.value;
/** 上一次震动的时刻（0 = 本次手势还没震动过） */
let hapticLastAt = 0;
/** 本次手势实际震动次数（用于极快甩动的兜底） */
let hapticBurst = 0;

function clearHapticTimers(): void {
  if (hapticSampleTimer !== null) {
    clearTimeout(hapticSampleTimer);
    hapticSampleTimer = null;
  }
  if (hapticStopTimer !== null) {
    clearTimeout(hapticStopTimer);
    hapticStopTimer = null;
  }
  if (hapticMaxTimer !== null) {
    clearTimeout(hapticMaxTimer);
    hapticMaxTimer = null;
  }
}

/** 开始手势（pickstart / touchstart / mousedown 任一先到都行） */
function onWheelGestureStart(): void {
  if (hapticStopTimer !== null) {
    clearTimeout(hapticStopTimer);
    hapticStopTimer = null;
  }
  if (hapticActive) {
    // 连续手势：沿用已标定的几何，只重置本次手势的起点
    hapticStartIndex = wheelIndex.value;
    hapticLiveIndex = wheelIndex.value;
    hapticBurst = 0;
    return;
  }
  hapticActive = true;
  hapticStartIndex = wheelIndex.value;
  hapticLiveIndex = wheelIndex.value;
  hapticLastAt = 0;
  hapticBurst = 0;
  hapticMaxTimer = setTimeout(() => stopWheelHaptics(), WHEEL_HAPTIC_MAX_MS);
  calibrateWheelHaptics();
}

/** 松手：留一小段宽限期，让最后一帧采样与 @change 先落定 */
function onWheelGestureEnd(): void {
  if (!hapticActive || hapticStopTimer !== null) {
    return;
  }
  hapticStopTimer = setTimeout(() => {
    hapticStopTimer = null;
    stopWheelHaptics();
  }, WHEEL_HAPTIC_GRACE_MS);
}

/** 量一次 picker / 内容 / 单档高度，标定「位移 → 档位」的基准 */
function calibrateWheelHaptics(): void {
  uni
    .createSelectorQuery()
    .select('.wheel')
    .boundingClientRect()
    .select('.uni-picker-view-content')
    .boundingClientRect()
    .selectAll('.wheel-item')
    .boundingClientRect()
    .exec((res) => {
      if (!hapticActive) {
        return;
      }
      const [picker, content, items] = res as [
        { top: number } | null,
        { top: number } | null,
        { top: number }[] | null,
      ];
      const itemHeight =
        items && items.length >= 2
          ? Math.abs(items[1].top - items[0].top)
          : uni.upx2px(WHEEL_ITEM_RPX);
      if (!picker || !content || !(itemHeight > 0)) {
        // 拿不到内部节点（组件实现变化）：静默放弃，不影响选值
        stopWheelHaptics();
        return;
      }
      hapticItemHeight = itemHeight;
      hapticOriginRel = content.top - picker.top + wheelIndex.value * itemHeight;
      scheduleWheelSample();
    });
}

/** 递归采样（等上一次查询完成再排下一次，避免查询堆积） */
function scheduleWheelSample(): void {
  if (!hapticActive) {
    return;
  }
  hapticSampleTimer = setTimeout(() => {
    hapticSampleTimer = null;
    if (!hapticActive) {
      return;
    }
    uni
      .createSelectorQuery()
      .select('.wheel')
      .boundingClientRect()
      .select('.uni-picker-view-content')
      .boundingClientRect()
      .exec((res) => {
        if (!hapticActive) {
          return;
        }
        const [picker, content] = res as [
          { top: number } | null,
          { top: number } | null,
        ];
        if (picker && content) {
          const rel = content.top - picker.top;
          const idx = wheelIndexFromOffset(
            hapticOriginRel,
            rel,
            hapticItemHeight,
            WHEEL_MINUTES.length - 1,
          );
          if (idx !== hapticLiveIndex) {
            hapticLiveIndex = idx;
            hapticIfAllowed();
          }
        }
        scheduleWheelSample();
      });
  }, WHEEL_SAMPLE_MS);
}

/** 50ms 节流：拨得再快，每秒最多 20 次 */
function hapticIfAllowed(): void {
  const now = Date.now();
  if (!canHaptic(now, hapticLastAt)) {
    return;
  }
  hapticLastAt = now;
  hapticBurst += 1;
  vibrateLight();
}

/** 结束监听；极快甩动如果一帧都没采样到，按最终档位补一次 */
function stopWheelHaptics(finalIndex?: number): void {
  if (!hapticActive) {
    clearHapticTimers();
    return;
  }
  hapticActive = false;
  clearHapticTimers();
  if (hapticBurst === 0) {
    const target = typeof finalIndex === 'number' ? finalIndex : hapticLiveIndex;
    if (target !== hapticStartIndex) {
      vibrateLight();
    }
  }
}

/** 轻震动：仅 light（不打扰）；H5 等不支持的环境静默忽略，绝不报错 */
function vibrateLight(): void {
  try {
    uni.vibrateShort({
      type: 'light',
      fail: () => {
        // 静默忽略：部分端（如桌面浏览器）不支持震动
      },
    });
  } catch {
    // 静默忽略
  }
}

/* ==================== ③ 外观：主题三态 ==================== */

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
  { label: '跟随系统', value: 'system' },
];

/* ==================== ④ 使用指南 ==================== */

/** 打开使用指南页（完整交互手册） */
function openGuide(): void {
  uni.navigateTo({ url: '/pages/mine/guide' });
}

/* ==================== ⑤ 数据管理 ==================== */

/** 清空本地数据：行内两段式确认 */
const confirmingClear = ref(false);

function confirmClear(): void {
  goalStore.clearAll();
  taskStore.clearAll();
  planStore.clearAll();
  reviewStore.clearAll();
  logStore.clearAll();
  // 清空数据时同步放弃进行中的计时
  timerStore.discard();
  confirmingClear.value = false;
  uni.showToast({ title: '已清空', icon: 'none' });
}
</script>

<style lang="scss" scoped>
/**
 * 我的页样式：紧凑卡片风（DESIGN.md V4.2）
 * - 面：白底 #FFFFFF + 1px #EEEEEE 描边 + 圆角 16rpx + 内边距 24rpx，卡片间距 16rpx；
 * - 卡片标题左侧 80rpx 小插画（标点，不铺底色）；
 * - 转轮：高 300rpx、单项 75rpx；选中 48rpx #3A3A3A，上下 28rpx #CCCCCC 透明度递减；
 * - 暖色按压：浅暖橘 rgba(245,213,184,0.3)，边框微暖 #B89B5E（过渡在 common.scss 统一声明）；
 * - 安全区：根容器 padding-bottom 140rpx，为底部 Tab 栏让位。
 */

.mine {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 32rpx 32rpx 140rpx; /* 顶部 32 / 左右 32 / 底部 140 给 Tab 栏让位 */
  background-color: #ffffff;
  color: #000000;
}

/* ==================== 面 · 紧凑卡片 ==================== */

.card {
  background-color: #ffffff;
  border: 1px solid #eeeeee;
  border-radius: 16rpx;
  padding: 24rpx;
}

/* 模块之间固定 16rpx 间距 */
.card + .card {
  margin-top: 16rpx;
}

/* 卡片标题行：左侧 80rpx 小插画锚点 + 标题 */
.card-head {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.card-head .card-title {
  margin-left: 20rpx;
}

.card-title {
  display: block;
  font-size: 28rpx;
  font-weight: 500;
  line-height: 1.4;
  color: #3a3a3a;
}

.card-hint {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  letter-spacing: 0.05em;
  line-height: 1.6;
  color: #888888;
}

/* 卡内分隔：手绘波浪虚线（V5.8 延伸，替代 1px 直分割线） */
.card-divider {
  margin: 24rpx 0;
}

/* ==================== ① 每天可学习时长：转轮 ==================== */

.wheel {
  margin-top: 20rpx;
  width: 100%;
  height: 300rpx; /* 视窗高 300rpx：300 / 75 = 可见 4 项 */
  /* 上下边缘软收：被裁切的 110 / 130 淡出，不再出现硬切口
     （uni 自带的白雾遮罩已全局关掉，相邻值因此可读，见 common.scss） */
  -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0, #000 14%, #000 86%, rgba(0, 0, 0, 0) 100%);
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0, #000 14%, #000 86%, rgba(0, 0, 0, 0) 100%);
}

.wheel-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 75rpx; /* 与脚本常量 WHEEL_ITEM_RPX 保持一致 */
}

/* 转轮文字：上下为浅灰、中选为深灰（颜色走类名，暗夜模式在 dark.scss 覆盖） */
.wheel-item-text {
  font-variant-numeric: tabular-nums;
  color: #999999;
}

.wheel-item-text--sel {
  color: #3a3a3a;
}

/* ==================== ② 每周可学习日：64rpx 圆角方块 ==================== */

.week {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin-top: 20rpx;
}

.week-item {
  width: 64rpx;
  height: 64rpx;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #eeeeee;
  border-radius: 12rpx;
  background-color: #ffffff;
  font-size: 26rpx;
  line-height: 1;
  color: #888888;
}

/* 选中：浅马卡龙底（#A2D9CE 30%）+ 马卡龙描边，绝无下划线 */
.week-item--active {
  background-color: rgba(162, 217, 206, 0.3);
  border-color: #a2d9ce;
  color: #000000;
}

/* 暖色按压反馈（V4.1） */
.week-item--pressed {
  background-color: rgba(245, 213, 184, 0.3);
  border-color: #b89b5e;
}

/* ==================== ③ 外观：浅底小 chip（选中 = 马卡龙薄荷 30% 底） ==================== */

.opts {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 20rpx;
}

.opt {
  padding: 12rpx 24rpx;
  border: 1px solid #eeeeee;
  border-radius: 12rpx;
  background-color: #ffffff;
  font-size: 26rpx;
  line-height: 1.4;
  color: #888888;
}

.opt--active {
  background-color: rgba(162, 217, 206, 0.3);
  border-color: #a2d9ce;
  color: #000000;
}

/* 暖色按压反馈（V4.1） */
.opt--pressed {
  background-color: rgba(245, 213, 184, 0.3);
  border-color: #b89b5e;
}

/* ==================== ④ 使用指南：整卡入口 ==================== */

/* 暖色按压反馈（整卡点亮，与目标卡一致） */
.guide-entry--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

/* ==================== ⑤ 数据管理 ==================== */

/* 矩形按钮：无圆角、1px solid #3A3A3A 边框、文字居中 */
.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20rpx 0;
  border: 1px solid #3a3a3a;
  border-radius: 0;
  background-color: #ffffff;
  color: #000000;
  font-size: 28rpx;
  line-height: 1.4;
}

/* 暖色按压反馈（V4.1）：浅暖橘底 + 边框微暖 */
.clear-btn--pressed {
  background-color: rgba(245, 213, 184, 0.3);
  border-color: #b89b5e;
}

.danger-note {
  display: block;
  font-size: 28rpx;
  letter-spacing: 0.05em;
  line-height: 1.8;
  color: #888888;
}

.confirm-acts {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 16rpx;
  margin-left: -28rpx;
}

/* 通用纯文字动作（暖色按压反馈） */
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

</style>
