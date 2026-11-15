<template>
  <view
    class="focus"
    :class="{ 'theme-dark': darkActive, 'focus--leaving': leaving, 'focus--paused': !running && !leaving }"
  >
    <!-- 夜航星幕（仅暗色模式显形）：会呼吸的散星 + 偶尔划过的流星 -->
    <view class="focus-sky">
      <view
        v-for="s in skyStars"
        :key="s.id"
        class="sky-star"
        :class="{ 'sky-star--bright': s.bright }"
        :style="`left: ${s.x}; top: ${s.y}; width: ${s.size}rpx; height: ${s.size}rpx; animation-duration: ${s.dur}s; animation-delay: ${s.delay}s;`"
      />
      <view class="sky-meteor sky-meteor--a" />
      <view class="sky-meteor sky-meteor--b" />
    </view>

    <!-- 顶部轻语：正在走的路（任务名），只是让心安定，不打扰 -->
    <text v-if="session && session.taskTitle" class="context">{{ session.taskTitle }}</text>

    <!-- 极简深灰线圆环：随时间沿顺时针慢慢闭合；圆环中心就是舞台 -->
    <view class="ring-wrap" :class="{ 'ring-wrap--paused': !running }">
      <!-- 虚线轨道：未来要走的路 -->
      <view class="ring-track" />
      <!-- 实线弧：已经走过的时间（内圈白洞做出粗线条） -->
      <view class="ring-arc" :style="arcStyle">
        <view class="ring-hole" />
      </view>
    </view>

    <!-- 屏幕正中的舞台（V5.1：撤销 V3.0「中心留白」）：
         词住在圆环正中，轻点 = 驻足/复行；长按 1 秒 = 松开结束 -->
    <view class="stage">
      <!-- 画满一圈的轻声祝贺：悬在词的上方，2.8 秒后自行飘散 -->
      <text v-if="justClosed" class="bless">这一圈，画满了</text>

      <view
        class="word-hit"
        :class="{ 'word-hit--armed': armed }"
        @touchstart="onTouchStart"
        @touchend="onTouchEnd"
        @touchcancel="onCancel"
        @mousedown="onMouseDown"
        @mouseup="onMouseUp"
        @mouseleave="onCancel"
      >
        <text class="word">{{ wordText }}</text>
        <!-- 一行极轻的提示：长按的用法与当下状态；armed 时仅淡出，不动布局 -->
        <text class="word-hint" :class="{ 'word-hint--hidden': armed }">{{ hintText }}</text>
      </view>
    </view>

    <!-- 专注背景音乐：关 / 星屑 / 溯星 / 潮汐 / 夜航 / 纸月（V5.68，V5.69 增补封面原曲） -->
    <view v-if="musicSupported" class="music-bar">
      <text class="music-label">音乐</text>
      <text
        v-for="opt in musicOptions"
        :key="opt.value"
        class="music-option"
        :class="{ 'music-option--active': isMusicActive(opt.value) }"
        @click.stop="chooseMusic(opt.value)"
      >{{ opt.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 全屏专注页 —— 极简手绘风（DESIGN.md V3.0 / V5.0 / V5.1）
 * ============================================================
 * 画面：浅色 = 纯白全屏 + 深灰线圆环（#3A3A3A）；暗色 = 夜空深室 + 星座底图
 * + 「夜航星幕」（会呼吸的散星与偶遇流星，仅暗色显形，样式见 dark.scss）。
 * - 圆环闭合基准 = 当前任务的计划时长（计划条目缺失时兜底 25 分钟）；
 *   弧线随时间沿顺时针生长，画满后满圆停留、继续计时；
 * - 「呼吸感」：圆环以约 4 秒一轮的极轻微起伏呼吸；驻足时呼吸静止；
 * - V5.1 中心舞台：撤销 V3.0「屏幕中央留白」，控制词住进圆环正中；
 *   画满一圈时「这一圈，画满了」悬在词的上方，2.8 秒后飘散；暗色下环心有一圈月光。
 *
 * 交互（圆环正中的舞台上只住着一个词 + 一行极轻提示）：
 * - 轻点「驻足 / 复行」：暂停 / 继续；驻足时星幕静止、圆环压暗；
 * - 驻足（计时运行）时播放合成的背景音乐，底部可切换五种声景；暂停 / 结束 / 离开淡出；
 * - 长按 1 秒：词变为「松开结束」并转暖色，松手 = 结束并记录本次学习；
 * - 结束且记录 ≥ 1 分钟：这条计划自动画上勾（「走过，才算完成」）；
 * - 离开本页（返回）不会中断计时，首页底部按钮会变为「回到专注」。
 */

import { computed, nextTick, ref, watch } from 'vue';
import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
import { darkActive } from '@/utils/theme';
import type { FocusMusicStyle } from '@/types/models';
import { usePlanStore } from '@/stores/plan';
import { useTimerStore } from '@/stores/timer';
import { useUserStore } from '@/stores/user';
import {
  FOCUS_MUSIC_OPTIONS,
  focusMusicSupported,
  setFocusMusicStyle,
  startFocusMusic,
  stopFocusMusic,
  waitFocusMusicStarted,
} from '@/services/focusMusic';
import { calcElapsedMs } from '@/services/stats';
import { MIN_VALID_LOG_MINUTES } from '@/services/constants';

/** 兜底闭合基准（分钟）：计划条目被删除/缺失时使用 */
const DEFAULT_TARGET_MINUTES = 25;
/** 长按判定时长（毫秒）：满 1 秒进入「松开结束」态 */
const HOLD_TO_END_MS = 1000;

const timerStore = useTimerStore();
const planStore = usePlanStore();
const userStore = useUserStore();

const now = ref(Date.now());
const leaving = ref(false);
const armed = ref(false);

let tickId: ReturnType<typeof setInterval> | null = null;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
/** 是否处于按住动作中（普通变量，驱动长按判定即可） */
let holding = false;
/** 触屏是否已接管（忽略移动端浏览器补发的模拟鼠标事件） */
let touchBound = false;

const session = computed(() => timerStore.session);
const running = computed(() => session.value?.running === true);

/* ==================== 背景音乐（V5.68） ==================== */

type MusicChoice = FocusMusicStyle | 'off';

const musicSupported = focusMusicSupported();
const musicEnabled = computed(() => userStore.settings.focusMusicEnabled !== false);
const musicStyle = computed<FocusMusicStyle>(
  () => userStore.settings.focusMusicStyle ?? 'stardust',
);
const musicOptions: { value: MusicChoice; label: string }[] = [
  { value: 'off', label: '关' },
  ...FOCUS_MUSIC_OPTIONS.map((opt) => ({ value: opt.id, label: opt.label })),
];
let focusVisible = false;

/** 只在专注页可见、计时运行、未在结束时播放；其余状态淡出 */
function syncMusic(): void {
  if (musicSupported && focusVisible && musicEnabled.value && running.value && !leaving.value) {
    startFocusMusic();
  } else {
    stopFocusMusic();
  }
}

function isMusicActive(choice: MusicChoice): boolean {
  if (choice === 'off') {
    return !musicEnabled.value;
  }
  return musicEnabled.value && musicStyle.value === choice;
}

/** 轻点底部选项：选声景会自动开启；选「关」关闭；偏好会记住 */
async function chooseMusic(choice: MusicChoice): Promise<void> {
  if (choice === 'off') {
    userStore.setFocusMusicEnabled(false);
  } else {
    userStore.setFocusMusicStyle(choice);
    userStore.setFocusMusicEnabled(true);
  }
  // 等样式 watcher 先换好曲目，再判断是否真的出声
  await nextTick();
  syncMusic();
  if (choice === 'off' || !running.value || !musicEnabled.value) {
    return;
  }
  const ok = await waitFocusMusicStarted(2000);
  if (!ok) {
    uni.showToast({ title: '音乐没能播放 · 试试调大媒体音量', icon: 'none' });
  }
}

watch([running, musicEnabled, leaving], syncMusic);
watch(
  musicStyle,
  (style) => {
    setFocusMusicStyle(style);
    syncMusic();
  },
  { immediate: true },
);

/* ==================== 圆环进度 ==================== */

/** 闭合基准毫秒数：优先取当前任务计划条目的 plannedMinutes，兜底 25 分钟 */
const targetMs = computed(() => {
  const current = session.value;
  const item = current && current.planItemId ? planStore.getById(current.planItemId) : undefined;
  const minutes = item && item.plannedMinutes > 0 ? item.plannedMinutes : DEFAULT_TARGET_MINUTES;
  return minutes * 60000;
});

/** 已累计的净学习毫秒（暂停时冻结，由纯函数计算） */
const elapsedMs = computed(() => (session.value ? calcElapsedMs(session.value, now.value) : 0));

/** 弧角度 0-360：随时间慢慢闭合，画满后停留 */
const arcDeg = computed(() => Math.min(360, (elapsedMs.value / targetMs.value) * 360));

/** 结束瞬间冻结的角度（避免回落成 0° 的闪烁） */
const frozenArcDeg = ref(0);

/** 圆环样式：conic-gradient 画实线弧 + 内圈白洞 = 粗线条圆环 */
const arcStyle = computed(() => {
  const deg = (leaving.value ? frozenArcDeg.value : arcDeg.value).toFixed(2);
  return {
    background: `conic-gradient(var(--focus-ink, #3A3A3A) ${deg}deg, rgba(0, 0, 0, 0) ${deg}deg)`,
  };
});

/* ==================== 唯一的一个词 ==================== */

const wordText = computed(() => {
  if (armed.value) {
    return '松开结束';
  }
  return running.value ? '驻足' : '复行';
});

/**
 * 词下的一行极轻提示：把「轻点」说成暂停 / 继续，避免把驻足误读成结束；
 * 结束只属于长按，提示始终把两者分开。
 */
const hintText = computed(() =>
  running.value ? '轻点暂停 · 长按结束' : '轻点继续 · 长按结束',
);

/* ==================== 画满一圈的轻声祝贺 ==================== */

/** 是否已画满一圈（弧线到达 360°） */
const closed = computed(() => elapsedMs.value >= targetMs.value);

/** 闭合瞬间（或带着满圈回到本页时）浮现的祝贺词 */
const justClosed = ref(false);

let blessTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  closed,
  (value) => {
    if (!value) {
      justClosed.value = false;
      return;
    }
    justClosed.value = true;
    if (blessTimer !== null) {
      clearTimeout(blessTimer);
    }
    blessTimer = setTimeout(() => {
      justClosed.value = false;
      blessTimer = null;
    }, 2800);
  },
  { immediate: true },
);

/* ==================== 夜航星幕（仅暗色显形） ==================== */

interface SkyStar {
  /** 星点编号（v-for key） */
  id: number;
  /** 水平位置（%） */
  x: string;
  /** 垂直位置（%） */
  y: string;
  /** 直径（rpx） */
  size: number;
  /** 一轮呼吸的时长（秒） */
  dur: number;
  /** 呼吸相位差（秒）：错开节奏，避免整片同步明灭 */
  delay: number;
  /** 更亮的核心星：带一点柔光 */
  bright?: boolean;
}

/** 手撒的一小把星：位置、大小、节奏全部错开 */
const skyStars: SkyStar[] = [
  { id: 1, x: '8%', y: '12%', size: 3, dur: 5.2, delay: 0 },
  { id: 2, x: '18%', y: '26%', size: 2, dur: 6.8, delay: 1.1 },
  { id: 3, x: '12%', y: '48%', size: 3, dur: 7.4, delay: 2.3, bright: true },
  { id: 4, x: '7%', y: '72%', size: 2, dur: 5.9, delay: 0.6 },
  { id: 5, x: '16%', y: '86%', size: 3, dur: 8.1, delay: 3.4 },
  { id: 6, x: '26%', y: '8%', size: 2, dur: 6.2, delay: 4.2 },
  { id: 7, x: '33%', y: '20%', size: 2, dur: 7.8, delay: 0.9 },
  { id: 8, x: '41%', y: '7%', size: 3, dur: 5.4, delay: 2.8, bright: true },
  { id: 9, x: '55%', y: '13%', size: 2, dur: 6.6, delay: 1.6 },
  { id: 10, x: '68%', y: '9%', size: 3, dur: 7.1, delay: 3.9 },
  { id: 11, x: '78%', y: '20%', size: 2, dur: 5.7, delay: 0.3 },
  { id: 12, x: '88%', y: '14%', size: 3, dur: 8.4, delay: 2.1, bright: true },
  { id: 13, x: '93%', y: '38%', size: 2, dur: 6.9, delay: 4.6 },
  { id: 14, x: '84%', y: '52%', size: 3, dur: 5.5, delay: 1.2 },
  { id: 15, x: '95%', y: '66%', size: 2, dur: 7.6, delay: 3.1 },
  { id: 16, x: '86%', y: '82%', size: 3, dur: 6.1, delay: 0.8, bright: true },
  { id: 17, x: '72%', y: '90%', size: 2, dur: 8.2, delay: 2.6 },
  { id: 18, x: '58%', y: '84%', size: 2, dur: 5.8, delay: 4.9 },
  { id: 19, x: '44%', y: '92%', size: 3, dur: 7.2, delay: 1.9 },
  { id: 20, x: '30%', y: '78%', size: 2, dur: 6.4, delay: 3.7 },
  { id: 21, x: '21%', y: '62%', size: 2, dur: 7.9, delay: 0.4 },
  { id: 22, x: '63%', y: '30%', size: 2, dur: 6.7, delay: 2.9 },
  { id: 23, x: '48%', y: '40%', size: 2, dur: 7.3, delay: 5.3 },
  { id: 24, x: '37%', y: '56%', size: 2, dur: 5.6, delay: 1.4 },
];

/* ==================== 每秒刷新（暂停时弧线自然冻结） ==================== */

function startTick(): void {
  stopTick();
  now.value = Date.now();
  tickId = setInterval(() => {
    now.value = Date.now();
  }, 1000);
}

function stopTick(): void {
  if (tickId !== null) {
    clearInterval(tickId);
    tickId = null;
  }
}

onShow(() => {
  if (!timerStore.session) {
    // 会话已被结束/不存在：直接回今日页（直接打开本页时兜底回首页）
    backToToday();
    return;
  }
  focusVisible = true;
  now.value = Date.now();
  startTick();
  syncMusic();
});
onHide(() => {
  focusVisible = false;
  stopTick();
  stopFocusMusic();
});
onUnload(() => {
  focusVisible = false;
  stopTick();
  stopFocusMusic();
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  if (blessTimer !== null) {
    clearTimeout(blessTimer);
    blessTimer = null;
  }
});

/* ==================== 轻点 = 驻足/复行 ==================== */

function togglePause(): void {
  const current = session.value;
  if (!current) {
    return;
  }
  if (current.running) {
    timerStore.pause();
  } else {
    timerStore.resume();
  }
  now.value = Date.now();
}

/* ==================== 长按 1 秒 = 松开结束 ==================== */

function beginHold(): void {
  if (!session.value || leaving.value || holdTimer !== null) {
    return;
  }
  holding = true;
  armed.value = false;
  holdTimer = setTimeout(() => {
    holdTimer = null;
    if (holding && !leaving.value) {
      armed.value = true;
    }
  }, HOLD_TO_END_MS);
}

/** 结束按住动作；返回是否已进入「松开结束」态（是则调用方执行结束） */
function releaseHold(): boolean {
  holding = false;
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  const wasArmed = armed.value;
  armed.value = false;
  return wasArmed;
}

function onTouchStart(): void {
  touchBound = true;
  beginHold();
}

function onTouchEnd(): void {
  if (releaseHold()) {
    finishSession();
    return;
  }
  togglePause();
}

/** 按住被中断（滑出/触摸取消）：只还原状态，不做任何动作 */
function onCancel(): void {
  releaseHold();
}

/** H5 桌面端鼠标支持（移动端由触屏接管，模拟鼠标事件会被忽略） */
function onMouseDown(e: { button?: number }): void {
  if (touchBound || (e.button ?? 0) !== 0) {
    return;
  }
  beginHold();
}

function onMouseUp(): void {
  if (touchBound) {
    return;
  }
  if (releaseHold()) {
    finishSession();
    return;
  }
  togglePause();
}

/* ==================== 结束并记录 ==================== */

function finishSession(): void {
  if (leaving.value) {
    return;
  }
  frozenArcDeg.value = arcDeg.value;
  // 结束前先取出计划条目 id（stopAndRecord 会清掉会话）
  const planItemId = session.value?.planItemId ?? '';
  const result = timerStore.stopAndRecord();
  leaving.value = true;
  // 有效记录（≥ 1 分钟）= 真正走过这段路：顺手把计划画上勾
  const completed = result.ok && planItemId ? planStore.completePending(planItemId) : false;
  if (result.ok) {
    uni.showToast({
      title: completed ? `已记录 ${result.minutes} 分钟 · 已完成` : `已记录 ${result.minutes} 分钟`,
      icon: 'none',
    });
  } else if (result.reason === 'too_short') {
    uni.showToast({ title: `不足 ${MIN_VALID_LOG_MINUTES} 分钟，本次未记录`, icon: 'none' });
  }
  // 让圆环先收拢淡出，再回到今日页
  setTimeout(() => {
    backToToday();
  }, 360);
}

/* ==================== 返回 ==================== */

function backToToday(): void {
  uni.navigateBack({
    fail: () => {
      uni.switchTab({ url: '/pages/index/index' });
    },
  });
}
</script>

<style lang="scss" scoped>
/**
 * 全屏专注页样式：白纸 + 一个深灰线圆环（#3A3A3A）+ 一个词
 * 无任何数字、无卡片、无填充色块、无圆角、无阴影。
 */

.focus {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
  /* 圆环墨色：弧线（conic-gradient）与虚线轨道共用；暗夜模式在 dark.scss 覆盖为月白 */
  --focus-ink: #3a3a3a;
  opacity: 0;
  animation: ink-in 320ms ease-out forwards;
}

/* 结束瞬间：画面像墨水一样淡出 */
.focus--leaving {
  animation: none;
  opacity: 0;
  pointer-events: none;
  transition: opacity 300ms ease-out;
}

/* ==================== 夜航星幕与顶部轻语 ==================== */

/* 星幕：浅色模式下不出现（纸面保持纯净），暗色由 dark.scss 显形 */
.focus-sky {
  display: none;
}

/* 顶部一行极轻的任务名：正在走的路 */
.context {
  position: absolute;
  top: 96rpx;
  left: 84rpx;
  right: 84rpx;
  display: block;
  text-align: center;
  font-size: 22rpx;
  letter-spacing: 2rpx;
  color: #c9c9c9;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* ==================== 屏幕中央的舞台 ==================== */

/* 舞台：屏幕正中的一叠内容（词 + 提示），整体垂直居中 */
.stage {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  /* 舞台本身不拦截触摸：只有词可点，其余是留白 */
  pointer-events: none;
}

/* 画满一圈的轻声祝贺：悬在词的上方，缓缓浮现再飘散 */
.bless {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  margin-bottom: 36rpx;
  text-align: center;
  font-size: 24rpx;
  letter-spacing: 6rpx;
  color: #bdbdbd;
  pointer-events: none;
  animation: bless-in 2.8s ease both;
}

/* ==================== 圆环 ==================== */

/* 呼吸感：约 4 秒一轮、幅度极轻（明暗 + 直径 ~1%） */
.ring-wrap {
  position: relative;
  width: 520rpx;
  height: 520rpx;
  /* 宽扁视口（如桌面预览）时收窄，保证圆环与底部的词不互相挤压 */
  max-width: 56vh;
  max-height: 56vh;
  animation: breath 4s ease-in-out infinite;
  transition: filter 400ms ease;
}

/* 驻足时：呼吸静止 */
.ring-wrap--paused {
  animation-play-state: paused;
}

/* 驻足时：整个环再压暗一档（时间停住的感觉） */
.focus--paused .ring-wrap {
  filter: opacity(0.6);
}

/* 虚线轨道：1px 深灰虚线圆（V3.0 线条主色） */
.ring-track {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  box-sizing: border-box;
  border: 2rpx dashed var(--focus-ink, #3A3A3A);
  border-radius: 50%;
}

/* 实线弧：由 conic-gradient 绘制，随时间生长闭合 */
.ring-arc {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  border-radius: 50%;
}

/* 内圈白洞：让圆弧成为 8rpx 粗的线条 */
.ring-hole {
  position: absolute;
  left: 8rpx;
  top: 8rpx;
  right: 8rpx;
  bottom: 8rpx;
  border-radius: 50%;
  background-color: #ffffff;
}

/* ==================== 唯一的一个词 ==================== */

.word-hit {
  /* 词与提示合成一个居中的小按钮：只有这一块可点，其余留白不打扰 */
  padding: 28rpx 48rpx;
  pointer-events: auto;
  text-align: center;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.word {
  display: block;
  text-align: center;
  /* 中心舞台的主词：比过去大一档，是整页唯一的主角 */
  font-size: 38rpx;
  letter-spacing: 12rpx;
  color: #000000;
  transition: color 200ms ease;
}

/* armed（长按满 1 秒）：词转暖色，呼应全站暖色按压语言 */
.word-hit--armed .word {
  color: #b89b5e;
}

/* 词下的一行极轻提示：armed（松开结束）时仅淡出，不改变布局 */
.word-hint {
  display: block;
  margin-top: 20rpx;
  text-align: center;
  font-size: 22rpx;
  letter-spacing: 4rpx;
  color: #c9c9c9;
  transition: opacity 200ms ease;
}

.word-hint--hidden {
  opacity: 0;
}

/* ==================== 背景音乐选项（V5.68） ==================== */

.music-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(40rpx + env(safe-area-inset-bottom));
  z-index: 20;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 20rpx;
  box-sizing: border-box;
  padding: 12rpx 24rpx;
  pointer-events: auto;
  -webkit-user-select: none;
  user-select: none;
}

.music-label {
  font-size: 20rpx;
  letter-spacing: 4rpx;
  color: #c9c9c9;
}

.music-option {
  padding: 14rpx 10rpx;
  font-size: 20rpx;
  line-height: 1.4;
  letter-spacing: 2rpx;
  color: #c9c9c9;
  pointer-events: auto;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.music-option--active {
  color: #3a3a3a;
}

/* ==================== 动效 ==================== */

@keyframes breath {
  0%,
  100% {
    opacity: 0.92;
    transform: scale(1);
  }

  50% {
    opacity: 1;
    transform: scale(1.012);
  }
}

@keyframes ink-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes bless-in {
  0% {
    opacity: 0;
    transform: translateY(10rpx);
  }

  16% {
    opacity: 1;
    transform: translateY(0);
  }

  70% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translateY(-6rpx);
  }
}

/* 系统开启「减弱动态效果」：停掉呼吸，只保留圆环进度本身 */
@media (prefers-reduced-motion: reduce) {
  .ring-wrap {
    animation: none;
  }

  .focus {
    animation-duration: 1ms;
  }
}
</style>
