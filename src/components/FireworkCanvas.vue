<template>
  <!-- 完成任务时的线条烟花（V5.16 / V5.77 跨端重写）：
       2–3 组随机爆心，粒子是沿飞行方向的短线段。
       纯 CSS 位移动画，不再用 canvas / DOM，App 与 H5 都能放。 -->
  <view v-if="rendered" class="fw" :class="{ 'fw--leaving': leaving }">
    <view
      v-for="p in particles"
      :key="p.id"
      class="fw-particle"
      :style="particleStyle(p)"
    />
  </view>
</template>

<script setup lang="ts">
/**
 * FireworkCanvas —— 线条烟花（V5.16；V5.77 改为纯 CSS，两端可用）
 * ============================================================
 * 为什么重写：
 *   旧实现用 canvas.getContext('2d') + window.innerWidth + rAF，
 *   而 App（app-vue）的逻辑层没有 document/window，setupCanvas 直接返回 false，
 *   真机上完成任务的烟花一直没有出现。现在每个粒子是一个绝对定位的短线段，
 *   用 CSS keyframes 做「径向飞出 + 重力下坠 + 缩短 + 淡出」，不依赖 canvas。
 *
 * 粒子方向 = 当前速度方向（含重力），所以线段头在前、尾在后；
 * 轨迹仍近似原参数：爆炸半径 105–215px、重力 45–85、寿命 0.95–1.1s。
 * 全程 1.25s，最后 0.2s 整层淡出；到点卸载。
 */
import { onUnmounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 触发计数：每次 +1 放一轮（0 = 还没放过） */
    trigger: number;
    /** 第一组的爆心（视口坐标）；不传则随机中部 */
    origin?: { x: number; y: number } | null;
  }>(),
  { origin: null },
);

interface Particle {
  id: number;
  /** 爆心（px） */
  cx: number;
  cy: number;
  /** 飞行距离（px） */
  dist: number;
  /** 起始角 / 落地角（deg） */
  rot: number;
  rotEnd: number;
  /** 线长与线宽（px） */
  len: number;
  width: number;
  life: number;
  delay: number;
  color: string;
}

const DURATION = 1.25;
const FADE_OUT = 0.2;
const COLORS = ['#A2D9CE', '#F5B7B1', '#F9E79F'];

const rendered = ref(false);
const leaving = ref(false);
const particles = ref<Particle[]>([]);

let stopTimer: ReturnType<typeof setTimeout> | null = null;
let leaveTimer: ReturnType<typeof setTimeout> | null = null;
let seed = 0;

const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
const deg = (rad: number): number => (rad * 180) / Math.PI;

function viewport(): { w: number; h: number } {
  try {
    const info = uni.getSystemInfoSync();
    return { w: info.windowWidth || 375, h: info.windowHeight || 667 };
  } catch {
    return { w: 375, h: 667 };
  }
}

function build(): void {
  const { w: W, h: H } = viewport();
  const next: Particle[] = [];
  const groups = Math.round(rand(2, 3.4));
  for (let g = 0; g < groups; g += 1) {
    const useOrigin = g === 0 && props.origin;
    const cx = useOrigin ? clamp(props.origin!.x, W * 0.16, W * 0.84) : W * rand(0.2, 0.8);
    const cy = useOrigin ? clamp(props.origin!.y, H * 0.2, H * 0.6) : H * rand(0.2, 0.6);
    const groupDelay = g * rand(0.03, 0.06);
    const count = Math.round(rand(16, 28));
    const distBase = rand(105, 215);
    const gravity = rand(45, 85);
    const lifeBase = rand(0.95, 1.1);

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const dist = distBase * rand(0.65, 1.15);
      const life = lifeBase * rand(0.9, 1.05);
      // 末速度方向：径向分量 + 重力下坠，让线段在飞行中慢慢转向
      const vx = Math.cos(angle) * dist;
      const vy = Math.sin(angle) * dist + 0.5 * gravity * life * life;
      next.push({
        id: seed += 1,
        cx,
        cy,
        dist,
        rot: deg(angle),
        rotEnd: deg(Math.atan2(vy, vx)),
        len: clamp(dist * rand(0.07, 0.16), 8, 34),
        width: rand(1.8, 2.6),
        life,
        delay: groupDelay + rand(0, 0.03),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }
  }
  particles.value = next;
}

function clearTimers(): void {
  if (stopTimer !== null) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (leaveTimer !== null) {
    clearTimeout(leaveTimer);
    leaveTimer = null;
  }
}

function start(): void {
  clearTimers();
  rendered.value = true;
  leaving.value = false;
  build();
  leaveTimer = setTimeout(() => {
    leaving.value = true;
  }, (DURATION - FADE_OUT) * 1000);
  stopTimer = setTimeout(stop, DURATION * 1000);
}

function stop(): void {
  clearTimers();
  rendered.value = false;
  leaving.value = false;
  particles.value = [];
}

function particleStyle(p: Particle): Record<string, string> {
  return {
    left: `${p.cx}px`,
    top: `${p.cy}px`,
    width: `${p.len}px`,
    height: `${p.width}px`,
    backgroundColor: p.color,
    '--rot': `${p.rot}deg`,
    '--rot-end': `${p.rotEnd}deg`,
    '--dist': `${p.dist}px`,
    '--life': `${p.life}s`,
    '--delay': `${p.delay}s`,
  };
}

watch(
  () => props.trigger,
  (value) => {
    if (value > 0) {
      start();
    }
  },
);

onUnmounted(stop);
</script>

<style lang="scss" scoped>
/* 整屏只做一成虚化，不吃点击；1.25s 后随粒子一起卸载 */
.fw {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 900;
  overflow: hidden;
  pointer-events: none;
  background-color: rgba(26, 26, 24, 0.05);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  animation: fw-in 160ms ease-out;
  transition: opacity 200ms ease;
}

.fw--leaving {
  opacity: 0;
}

.fw-particle {
  position: absolute;
  border-radius: 2px;
  transform-origin: 0 50%;
  animation: fw-fly var(--life) cubic-bezier(0.15, 0.65, 0.35, 1) var(--delay) both;
}

@keyframes fw-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes fw-fly {
  0% {
    opacity: 0;
    transform: rotate(var(--rot)) translateX(0) scaleX(1);
  }

  2% {
    opacity: 1;
  }

  68% {
    opacity: 0.58;
  }

  100% {
    opacity: 0;
    transform: rotate(var(--rot-end)) translateX(var(--dist)) scaleX(0.45);
  }
}
</style>
