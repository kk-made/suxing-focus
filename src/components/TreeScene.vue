<template>
  <!-- 今日页主插画：一棵大树 + 树冠上随学习时长结出的果子（V5.9）
       果子层只做定位与动画，不吃点击；颜色全部走 --doodle-* 变量，暗色自动换色 -->
  <view class="tree-scene" :class="{ 'tree-scene--nudge': nudging }">
    <DoodleIcon class="tree-scene__tree" name="tree-hero" width="60vw" />

    <view class="tree-scene__fruits">
      <view
        v-for="fruit in fruits"
        :key="fruit.index"
        class="fruit"
        :class="{ 'fruit--fresh': fruit.index >= freshFrom }"
        :style="fruitStyle(fruit)"
      >
        <!-- 两层分工：外层轻摆（一直摆），内层弹跳长出（只在新结出时播一次） -->
        <view class="fruit__swing">
          <DoodleIcon class="fruit__svg" name="fruit" width="100%" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * TreeScene —— 今日页「大树结果」场景（V5.9）
 * ============================================================
 * 结构：
 * - 底层：tree-hero 大树（60vw，纯白底、不铺卡片，与 V5.8.4 一致）；
 * - 上层：按树冠坐标挂果子（fruit 插画，暖黄果身 + 墨绿柄叶），数量由学习时长决定。
 *
 * 动画（全部纯 CSS，尊重 prefers-reduced-motion）：
 * - 新结出：880ms 弹跳长出（scale 0 → 1.16 → 0.94 → 1，带一点歪），多颗错拍 160ms；
 * - 常驻：每颗以 5–6s 的不同节奏极轻摆动（±3.2deg），像挂在枝头；
 * - 结新果时整棵树轻晃 1s（±0.7deg），把「树知道结果了」这件事交给画面。
 *
 * 播放纪律：首次加载 / 撤销完成 / 页面隐藏期间的变化都不播动画，
 * 只有「在前台看到果子变多」才播（freshFrom 由页面按前后数量差给出）。
 */
import { computed } from 'vue';
import DoodleIcon from '@/components/DoodleIcon.vue';
import { fruitCount } from '@/services/tree';

/** 一颗果子在树冠上的落点（x / y = 相对插画宽高的百分比中心点；size = 宽度占插画宽度的百分比） */
interface FruitSlot {
  x: number;
  y: number;
  size: number;
}

/**
 * 树冠落点表（按「结出的先后」排列，越靠前越先长出来）：
 * 坐标对齐 tree-hero 的 640×200 视窗——1 / 3 落在左（粉）树冠，2 / 4 / 5 落在右（绿）树冠，
 * 果心两两间距 ≥ 30 个视窗单位（果子宽度约 31），既不叠在一起、也不越出树冠边缘。
 */
const FRUIT_SLOTS: FruitSlot[] = [
  { x: 43.1, y: 29, size: 5.2 },
  { x: 53.1, y: 41, size: 4.8 },
  { x: 46.6, y: 42, size: 5.0 },
  { x: 49.7, y: 54, size: 4.8 },
  { x: 55, y: 54, size: 5.2 },
];

const props = withDefaults(
  defineProps<{
    /** 今日已专注分钟数（真实学习记录聚合值） */
    minutes: number;
    /** 从第几颗开始播放「新结出」动画；Infinity = 全部静态（首次加载 / 不庆祝） */
    freshFrom?: number;
  }>(),
  { freshFrom: Number.POSITIVE_INFINITY },
);

/** 当前该有几颗果子 */
const count = computed(() => fruitCount(props.minutes));

const fruits = computed(() =>
  FRUIT_SLOTS.slice(0, count.value).map((slot, index) => ({ ...slot, index })),
);

/** 有新果子正在长出来 → 整棵树跟着轻晃一下 */
const nudging = computed(() => props.freshFrom !== Number.POSITIVE_INFINITY);

/** 单颗果子的定位与节奏（错拍靠 CSS 变量传下去，避免逐颗写死动画时长） */
function fruitStyle(fruit: FruitSlot & { index: number }): Record<string, string> {
  return {
    left: `${fruit.x}%`,
    top: `${fruit.y}%`,
    width: `${fruit.size}%`,
    // 轻摆：每颗不同节奏 + 不同起点，六颗不会像列队一样同步
    '--sway-delay': `${(fruit.index * 0.9).toFixed(2)}s`,
    '--sway-duration': `${(5 + (fruit.index % 3) * 0.7).toFixed(2)}s`,
    // 长出：同一批新果子按顺序错拍 160ms
    '--pop-delay': `${Math.max(0, fruit.index - props.freshFrom) * 0.16}s`,
  };
}
</script>

<style lang="scss" scoped>
/* 场景容器：宽度 = 大树宽度，果子按百分比落点（高度由树的 viewBox 比例决定） */
.tree-scene {
  position: relative;
  width: 60vw;
  line-height: 0;
  transform-origin: 50% 100%;
}

/* 果子层：整层不吃点击，果子只是「标点」 */
.tree-scene__fruits {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

/* 单颗果子：以落点为中心（left/top 是果心，不是左上角） */
.fruit {
  position: absolute;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
}

/* 常驻轻摆：挂在枝头的小幅摇摆，交替往返 */
.fruit__swing {
  width: 100%;
  height: 100%;
  transform-origin: 50% 6%;
  animation: fruit-sway var(--sway-duration, 5.4s) ease-in-out infinite alternate;
  animation-delay: var(--sway-delay, 0s);
}

.fruit__svg {
  width: 100%;
}

/* 新结出：弹跳长出（只在 fresh 那一次挂上，播完随 freshFrom 复位一起摘掉） */
.fruit--fresh .fruit__svg {
  transform-origin: 50% 6%;
  animation: fruit-pop 880ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: var(--pop-delay, 0s);
}

/* 结新果：整棵树极轻地晃一下（像被果子坠了一下） */
.tree-scene--nudge .tree-scene__tree {
  animation: tree-nudge 1000ms ease-out;
}

@keyframes fruit-pop {
  0% {
    opacity: 0;
    transform: scale(0.08) rotate(-20deg);
  }
  55% {
    opacity: 1;
    transform: scale(1.16) rotate(6deg);
  }
  78% {
    transform: scale(0.94) rotate(-3deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

@keyframes fruit-sway {
  from {
    transform: rotate(-3.2deg);
  }
  to {
    transform: rotate(3.2deg);
  }
}

@keyframes tree-nudge {
  0% {
    transform: rotate(0deg);
  }
  22% {
    transform: rotate(-0.7deg);
  }
  48% {
    transform: rotate(0.5deg);
  }
  72% {
    transform: rotate(-0.25deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

/* 系统开启「减弱动态效果」：果子直接出现，不再摇摆 / 弹跳 / 晃树 */
@media (prefers-reduced-motion: reduce) {
  .fruit__swing,
  .fruit--fresh .fruit__svg,
  .tree-scene--nudge .tree-scene__tree {
    animation: none;
  }
}
</style>
