<template>
  <!-- 状态圆点（V5.8 笨拙手账）：未完成 = 手绘小圈；已完成 = 手绘小勾（完成瞬间弹跳一下）；
       按住（长按判定中）= 暖色微光 + 放大一档，给「按住有反应」的手感 -->
  <view class="dot" :class="{ 'dot--holding': holding, 'dot--pop': pop }">
    <DoodleIcon class="dot-svg" :name="done ? 'check' : 'dot'" :size="22" />
  </view>
</template>

<script setup lang="ts">
/**
 * StatusDot —— 手绘状态圆点（V5.8 起为蜡笔涂鸦：歪圈 / 歪勾）
 * ============================================================
 * - 未完成：一笔画成的歪圈（dot.svg）；已完成：一笔写成的歪勾（check.svg，陶土暖橙）；
 * - 完成瞬间（done 由 false → true）小勾弹跳一下（pop，仅监听变化，页面加载时不重播）；
 * - holding：长按判定进行中（今日页圆点长按 = 直接完成），亮暖 + 放大作为「已按住」的回执；
 * - 用作列表项 / 时间轴节点前的状态前缀，替代图标与色块；
 * - 圈 / 勾颜色经 --doodle-stroke / --doodle-pink CSS 变量取色（暗色覆盖见 dark.scss）。
 */
import { nextTick, onUnmounted, ref, watch } from 'vue';
import DoodleIcon from '@/components/DoodleIcon.vue';

const props = defineProps<{ done: boolean; holding?: boolean }>();

/** 完成弹跳：只在 done 翻转成 true 的那一次播放 */
const pop = ref(false);
let popTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.done,
  (now, prev) => {
    if (!now || prev) return;
    pop.value = false;
    nextTick(() => {
      pop.value = true;
      if (popTimer) clearTimeout(popTimer);
      popTimer = setTimeout(() => {
        pop.value = false;
      }, 640);
    });
  },
);

onUnmounted(() => {
  if (popTimer) clearTimeout(popTimer);
});
</script>

<style scoped>
.dot {
  width: 22rpx;
  height: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
  transition:
    transform 150ms ease,
    background-color 150ms ease;
}

/* 按住：暖光底 + 放大一档（松开自动弹回，纯 CSS 过渡） */
.dot--holding {
  background-color: rgba(245, 213, 184, 0.55);
  transform: scale(1.5);
}

/* 完成弹跳：小勾「啪」地按上来——先缩后弹、带一点歪 */
.dot--pop .dot-svg {
  animation: dot-pop 560ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dot-pop {
  0% {
    transform: scale(0.2) rotate(-40deg);
    opacity: 0;
  }
  55% {
    transform: scale(1.3) rotate(9deg);
    opacity: 1;
  }
  78% {
    transform: scale(0.9) rotate(-4deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}
</style>
