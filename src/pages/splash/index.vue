<template>
  <view
    class="splash"
    :class="{ 'theme-dark': darkActive, 'splash--leaving': leaving, 'splash--cover': phase === 'cover' }"
    @click="leave"
  >
    <!-- ① 开场：三句话，一行行亮起来 -->
    <view class="quote" :class="{ 'quote--out': phase === 'cover' }">
      <view class="quote-block quote-block--1">
        <view class="quote-line">学习是一场不可避免的循环，</view>
        <view class="quote-line">如同巨石总会滚落山脚。</view>
      </view>
      <view class="quote-block quote-block--2">
        <view class="quote-line">但每次重新折返，每次写下新的计划，</view>
        <view class="quote-line">都是一次对抗引力的溯星。</view>
      </view>
      <view class="quote-block quote-block--3">
        <view class="quote-line">所以，我们必须想象，</view>
        <view class="quote-line">我们是不会停下脚步的。</view>
      </view>
    </view>

    <!-- ② 封面：石从山脚升起，在坡顶变成星 -->
    <view class="cover">
      <view class="cover-art" v-html="coverArt" />

      <!-- 字标「溯星」：照着细笔手写底稿描出来的——骨架仍是正确的 22 笔
           （溯 13 笔＝氵 3 + 朔 10：丷 2 / 一 / 竖折 + 短竖 + 长撇 / 月 4；星 9 笔＝日 4 + 生 5），
           日的外框随手画成一个圆圈。细笔、圆头、粗细 2.6–3.4 轻轻不匀，星比溯大、底横拖得很长。
           逐笔书写：每条 path 带 pathLength="100"，stroke-dashoffset 由 100 退到 0，
           靠 style="--o:n" 按笔顺错拍（64ms/笔）。不用 <text>。
           目验页见 preview/wordmark-check.html（node scripts/wordmark/gen-check.cjs 重建；
           node scripts/wordmark/audit.cjs 做结构校验）。 -->
      <view class="wordmark" v-html="wordmark" />
    </view>

    <!-- 声音：被浏览器拦截时，点一下就能开 -->
    <view
      class="sound"
      :class="{ 'sound--off': sound !== 'on' }"
      role="button"
      :aria-label="sound === 'on' ? '关闭音乐' : '开启音乐'"
      @click.stop="onSoundTap"
    >
      <view class="sound-glyph" v-html="soundIcon" />
    </view>

    <text class="hint">{{ sound === 'blocked' ? '轻触进入 · 点音符开声' : '轻触进入' }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * 启动封面（V5.69「溯星」）
 * ============================================================
 * 开场先一行行浮出三句浅色的话（约 5 秒），随后淡出、进入封面：
 * 山脚的石沿一条连续曲线向上，最后在坡顶化成一颗星，再逐笔写出「溯星」。
 * 石升用 offset-path 平滑运动（旧浏览器回退到线性逐点位移），
 * 整段只在首尾加减速，不会在每个路点停顿。
 * 背景音乐走原生播放器（static/audio/splash.wav，构建期渲染，与专注页「溯星」同一编曲）；
 * H5 自动播放被拦时，右上角的音符按钮可手动开启。全部本地资源，颜色走当前主题。
 * 封面里的三处 SVG 用 v-html 注入：App（app-vue）会把模板里的静态 svg 标签吃掉，
 * 只有动态注入的 svg 才会真正渲染（与 DoodleIcon 同一套做法）。
 * 轻触任意处可提前进入。
 */
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { darkActive } from '@/utils/theme';
import coverArt from 'virtual:doodle/splash-cover';
import wordmark from 'virtual:doodle/splash-wordmark';
import soundIcon from 'virtual:doodle/splash-sound';
import { ref } from 'vue';
import { createSplashMusic } from '@/utils/splashMusic';

/** 开场文字停留到这一刻（ms）后切到封面 */
const QUOTE_MS = 4800;
/** 整个封面停留多久后自动进入（ms，从进入页面算起）——要留够写字的时间 */
const AUTO_LEAVE = 10500;
/** 淡出时长（ms） */
const FADE_OUT = 420;
/** H5 刷新前记住的原目标路由（由 index.html 在启动前写入） */
const NEXT_KEY = 'suxing.splashNext';
const TAB_ROUTES = ['/pages/index/index', '/pages/goal/list', '/pages/stats/index', '/pages/mine/index'];

const phase = ref<'quote' | 'cover'>('quote');
const leaving = ref(false);
// 封面音乐默认开启；浏览器拦截自动播放时降级为 blocked，由右上角音符按钮手动恢复
const sound = ref<'off' | 'on' | 'blocked'>('on');

const music = createSplashMusic();
let timers: Array<ReturnType<typeof setTimeout>> = [];
let reduced = false;

function later(fn: () => void, ms: number): void {
  timers.push(setTimeout(fn, ms));
}

function clearTimers(): void {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
}

/** 取出并清空刷新前的目标；没有则回今日 */
function takeNext(): string | null {
  try {
    const next = window.sessionStorage.getItem(NEXT_KEY);
    window.sessionStorage.removeItem(NEXT_KEY);
    return next;
  } catch {
    return null;
  }
}

function goNext(): void {
  const raw = takeNext();
  const url = raw && raw.indexOf('/pages/') === 0 ? raw : '/pages/index/index';
  const path = url.split('?')[0];
  if (TAB_ROUTES.includes(path)) {
    uni.switchTab({ url: path });
    return;
  }
  uni.reLaunch({ url });
}

/** 淡出后进入今日；点击 / 自动计时都只执行一次 */
function leave(): void {
  if (leaving.value) {
    return;
  }
  leaving.value = true;
  clearTimers();
  music.stop();
  later(goNext, reduced ? 0 : FADE_OUT);
}

async function startSound(): Promise<void> {
  const ok = await music.start();
  // 若用户在启动过程中主动静音，不要被异步结果覆盖
  if (sound.value === 'off') {
    return;
  }
  sound.value = ok ? 'on' : 'blocked';
}

async function onSoundTap(): Promise<void> {
  if (sound.value === 'on') {
    music.mute();
    sound.value = 'off';
    return;
  }
  const ok = await music.unmute();
  sound.value = ok ? 'on' : 'blocked';
}

onLoad(() => {
  reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 减弱动态：文字直接全部出现，封面直接显示，只留很短的停留
  const quoteMs = reduced ? 3600 : QUOTE_MS;
  const totalMs = reduced ? 5400 : AUTO_LEAVE;

  void startSound();
  later(() => {
    phase.value = 'cover';
  }, quoteMs);
  later(leave, totalMs);
});

onUnload(() => {
  clearTimers();
  music.stop();
});
</script>

<style lang="scss" scoped>
.splash {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 64rpx 48rpx;
  background-color: #ffffff;
  opacity: 0;
  user-select: none;
  animation: splash-in 360ms ease-out forwards;
}

.splash--leaving {
  animation: splash-out 420ms ease forwards;
  pointer-events: none;
}

.cover {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  opacity: 0;
}

.splash--cover .cover {
  animation: cover-in 560ms 100ms ease-out both;
}

.cover-art {
  width: 440rpx;
  max-width: 62vw;
  height: auto;
  overflow: visible;
}

/* ---------- 开场文字 ---------- */
.quote {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 40rpx;
  transform: translateY(-50%);
  pointer-events: none;
  transition: opacity 420ms ease, transform 420ms ease;
}

.quote--out {
  opacity: 0;
  transform: translateY(-53%);
}

.quote-block {
  margin-bottom: 44rpx;
  text-align: center;
  font-family: inherit;
  font-size: 30rpx;
  line-height: 1.9;
  letter-spacing: 1rpx;
  color: #9c9c96;
  opacity: 0;
  transform: translateY(10rpx);
}

.quote-block:last-child {
  margin-bottom: 0;
}

.quote-block--1 {
  animation: quote-line-in 740ms 200ms ease-out both;
}

.quote-block--2 {
  animation: quote-line-in 740ms 1400ms ease-out both;
}

.quote-block--3 {
  animation: quote-line-in 740ms 2600ms ease-out both;
}

/* ---------- 字标 ---------- */
.wordmark {
  width: 460rpx;
  max-width: 78vw;
  height: auto;
  margin-top: -4rpx;
  overflow: visible;
  color: #3a3a3a;
}

/* 逐笔书写：pathLength="100" 把每条笔画长度归一成 100，
   再让 stroke-dashoffset 从 100 退回 0——笔画就沿着手写方向长出来。 */
.splash :deep(.wm-stroke) {
  stroke-dasharray: 100 220;
  stroke-dashoffset: 100;
}

.splash--cover :deep(.wm-stroke) {
  animation: wm-draw 320ms cubic-bezier(0.3, 0.05, 0.3, 1) both;
  animation-delay: calc(880ms + var(--o, 0) * 64ms);
}

.splash :deep(.wm-star) {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
}

.splash--cover :deep(.wm-star) {
  animation: wm-star-in 420ms 2650ms cubic-bezier(0.2, 1.4, 0.4, 1) both;
}

/* ---------- 插画 ---------- */
.splash :deep(.slope) {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
}

.splash--cover :deep(.slope) {
  animation: art-draw 700ms 120ms ease-out both;
}

.splash :deep(.ridge),
.splash :deep(.grass),
.splash :deep(.roll) {
  opacity: 0;
}

.splash--cover :deep(.ridge) {
  animation: fade-in 620ms 520ms ease-out both;
}

.splash--cover :deep(.grass) {
  animation: fade-in 620ms 620ms ease-out both;
}

.splash--cover :deep(.roll) {
  animation: fade-in 500ms 980ms ease-out both;
}

.splash :deep(.stone-rise),
.splash :deep(.stone-spin) {
  transform-box: fill-box;
  transform-origin: center;
}

/* 旧浏览器回退：逐点位移，线性时间，避免在每个路点都停顿一下 */
.splash--cover :deep(.stone-rise) {
  animation: stone-rise 1100ms 1200ms linear both;
}

/* 现代浏览器：沿一条连续曲线上升，只在一头一尾加减速 */
@supports (offset-path: path("M 0 0 L 1 1")) {
  .splash--cover :deep(.stone-rise) {
    offset-path: path("M 84 195 C 83.17 192 80.67 185 79 177 C 77.33 169 73.5 157.67 74 147 C 74.5 136.33 73.33 123.67 82 113 C 90.67 102.33 106 91.33 126 83 C 146 74.67 180.33 67.5 202 63 C 223.67 58.5 247 54.83 256 56");
    offset-rotate: 0deg;
    offset-distance: 0%;
    animation: stone-path 1100ms 1200ms cubic-bezier(0.33, 0.02, 0.2, 1) both;
    will-change: offset-distance, opacity;
  }
  .splash--cover :deep(.stone-spin) {
    animation: stone-spin 1100ms 1200ms linear both;
    will-change: transform;
  }
}

.splash :deep(.boulder) {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: 50% 60%;
}

.splash--cover :deep(.boulder) {
  animation: boulder-in 780ms 430ms cubic-bezier(0.2, 1.15, 0.35, 1) both;
}

.splash :deep(.dust) {
  opacity: 0;
}

.splash--cover :deep(.dust) {
  animation: fade-in 420ms 1020ms ease-out both;
}

.splash :deep(.coil) {
  opacity: 0;
}

.splash--cover :deep(.coil) {
  animation: coil-in 700ms 640ms ease-out both, trail-flow 9s 2300ms linear infinite;
}

.splash :deep(.star) {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
}

.splash--cover :deep(.star) {
  animation: star-in 560ms 2200ms cubic-bezier(0.2, 1.35, 0.4, 1) both;
}

.splash :deep(.star-burst) {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
}

.splash--cover :deep(.star-burst) {
  animation: star-burst 720ms 2180ms ease-out both;
}

.splash :deep(.faint-dots) {
  opacity: 0;
}

.splash--cover :deep(.faint-dots) {
  animation: fade-in 700ms 900ms ease-out both;
}

/* ---------- 声音 / 提示 ---------- */
.sound {
  position: absolute;
  top: calc(36rpx + env(safe-area-inset-top));
  right: 36rpx;
  width: 64rpx;
  height: 64rpx;
  padding: 14rpx;
  box-sizing: border-box;
  color: #b0b0a9;
  opacity: 0.5;
  transition: opacity 200ms ease;
}

.sound--off {
  opacity: 0.4;
}

.splash :deep(.sound-slash) {
  opacity: 0;
  transition: opacity 200ms ease;
}

.sound--off :deep(.sound-slash) {
  opacity: 1;
}

.hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(52rpx + env(safe-area-inset-bottom));
  text-align: center;
  font-size: 20rpx;
  letter-spacing: 4rpx;
  color: #c9c9c9;
  opacity: 0;
  animation: hint-in 480ms 1200ms ease-out both;
}

/* ---------- keyframes ---------- */
@keyframes splash-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes splash-out {
  to {
    opacity: 0;
  }
}

@keyframes cover-in {
  from {
    opacity: 0;
    transform: translateY(10rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes quote-line-in {
  from {
    opacity: 0;
    transform: translateY(10rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes art-draw {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes boulder-in {
  from {
    opacity: 0;
    transform: translate(26rpx, -18rpx) rotate(110deg);
  }
  70% {
    opacity: 1;
    transform: translate(-1rpx, 2rpx) rotate(-7deg);
  }
  to {
    opacity: 1;
    transform: translate(0, 0) rotate(0deg);
  }
}

@keyframes stone-rise {
  0% {
    opacity: 1;
    transform: translate(0, 0) scale(1) rotate(0deg);
  }
  10% {
    opacity: 1;
    transform: translate(-5px, -18px) scale(1.02) rotate(-10deg);
  }
  28% {
    opacity: 1;
    transform: translate(-10px, -48px) scale(0.96) rotate(20deg);
  }
  48% {
    opacity: 1;
    transform: translate(-2px, -82px) scale(0.86) rotate(70deg);
  }
  68% {
    opacity: 1;
    transform: translate(42px, -112px) scale(0.68) rotate(140deg);
  }
  86% {
    opacity: 1;
    transform: translate(118px, -132px) scale(0.46) rotate(200deg);
  }
  100% {
    opacity: 0;
    transform: translate(172px, -139px) scale(0.14) rotate(240deg);
  }
}

/* 连续曲线版本：位移只走 progress，旋转与缩小交给内层 */
@keyframes stone-path {
  0% {
    offset-distance: 0%;
    opacity: 1;
  }
  86% {
    opacity: 1;
  }
  100% {
    offset-distance: 100%;
    opacity: 0;
  }
}

@keyframes stone-spin {
  0% {
    transform: scale(1) rotate(0deg);
  }
  10% {
    transform: scale(1.02) rotate(-10deg);
  }
  28% {
    transform: scale(0.96) rotate(20deg);
  }
  48% {
    transform: scale(0.86) rotate(70deg);
  }
  68% {
    transform: scale(0.68) rotate(140deg);
  }
  86% {
    transform: scale(0.46) rotate(200deg);
  }
  100% {
    transform: scale(0.14) rotate(240deg);
  }
}

@keyframes coil-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 0.62;
  }
}

@keyframes trail-flow {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -130;
  }
}

@keyframes star-in {
  from {
    opacity: 0;
    transform: scale(0.3) rotate(-24deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

@keyframes star-burst {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  20% {
    opacity: 0.75;
  }
  100% {
    opacity: 0;
    transform: scale(2.2);
  }
}

@keyframes wm-draw {
  from {
    stroke-dashoffset: 100;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes wm-star-in {
  from {
    opacity: 0;
    transform: scale(0.2) rotate(-30deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

@keyframes hint-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 减弱动态效果：不写字、不位移，只做很短的静止停留 */
@media (prefers-reduced-motion: reduce) {
  .splash {
    animation: none;
    opacity: 1;
  }
  .splash--leaving {
    animation: none;
    opacity: 0;
    transition: none;
  }
  .quote {
    transition: none;
  }
  .quote-block {
    animation: none;
    opacity: 1;
    transform: none;
  }
  .quote--out {
    opacity: 0;
  }
  .cover {
    transition: none;
  }
  .splash--cover .cover {
    animation: none;
    opacity: 1;
  }
  .splash--cover :deep(.slope),
  .splash--cover :deep(.ridge),
  .splash--cover :deep(.grass),
  .splash--cover :deep(.roll),
  .splash--cover :deep(.boulder),
  .splash--cover :deep(.dust),
  .splash--cover :deep(.coil),
  .splash--cover :deep(.star),
  .splash--cover :deep(.faint-dots),
  .splash--cover :deep(.wm-star),
  .hint {
    animation: none;
    opacity: 1;
    transform: none;
    stroke-dashoffset: 0;
  }
  .splash--cover :deep(.wm-stroke) {
    animation: none;
    stroke-dasharray: none;
    stroke-dashoffset: 0;
  }
  .splash--cover :deep(.coil) {
    opacity: 0.62;
  }
  /* 终帧：石已经变成星，不再出现在山脚 */
  .splash--cover :deep(.stone-rise) {
    animation: none;
    opacity: 0;
  }
  .splash--cover :deep(.stone-spin) {
    animation: none;
    transform: none;
  }
  .splash--cover :deep(.star-burst) {
    animation: none;
    opacity: 0;
  }
  .hint {
    opacity: 1;
  }
}

/* ---------- 动态注入的 SVG（App 端只有 v-html 注入的 svg 才会真正渲染） ---------- */
.cover-art :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.wordmark :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}

.sound-glyph {
  width: 100%;
  height: 100%;
}

.sound-glyph :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
