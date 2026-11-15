<template>
  <!-- 自绘底部 Tab（V5.77）：替代原生 tabBar，让选中图标在两端都能果冻回弹。
       原生 tabBar 在 App 端是原生控件，挂不上 CSS 动画；这里隐藏原生栏，用同一套 PNG 图标自绘。 -->
  <view class="tabbar" :class="{ 'tabbar--dark': darkActive }">
    <view
      v-for="item in TABS"
      :key="item.key"
      class="tabbar__item"
      :class="{ 'tabbar__item--active': active === item.key }"
      hover-class="tabbar__item--pressed"
      @click="onTap(item)"
    >
      <view
        :key="active === item.key ? `on-${jellySeq}` : `off-${item.key}`"
        class="tabbar__icon"
        :class="{ 'tabbar__icon--jelly': jellySeq > 0 && active === item.key }"
      >
        <image
          class="tabbar__img"
          :src="active === item.key ? item.on : item.off"
          mode="aspectFit"
        />
      </view>
      <text class="tabbar__label">{{ item.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * TabBar —— 自绘底部栏（V5.77）
 * ============================================================
 * 为什么不用原生 tabBar：
 * - App（app-vue）的 tabBar 是原生控件，H5 那套 `.tab-jelly` CSS 挂不上去，
 *   切页时选中图标不会回弹；原生栏也不认 SVG 图标。
 * - 这里保留 pages.json 的 tabBar 配置用于 switchTab，但用 uni.hideTabBar 隐藏原生栏，
 *   在页面里自绘同样的图标 / 文案，动画与 H5 完全一致。
 *
 * 动画：每次页面 onShow 由父页面把 pulse +1，或轻点当前项时，
 * 给选中图标换一个 key 重新挂载并播放 520ms 果冻回弹。
 * 安全区：栏高 100rpx + env(safe-area-inset-bottom)，与原生栏一致。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { darkActive } from '@/utils/theme';

export type TabKey = 'today' | 'goal' | 'stats' | 'mine';

const props = withDefaults(
  defineProps<{
    /** 当前页面对应的 Tab */
    active: TabKey;
    /** 页面 onShow 计数：每次 +1 重播选中图标的回弹 */
    pulse?: number;
  }>(),
  { pulse: 0 },
);

const TABS: { key: TabKey; label: string; path: string; on: string; off: string }[] = [
  { key: 'today', label: '今日', path: '/pages/index/index', on: '/static/tab/day-on.png', off: '/static/tab/day.png' },
  { key: 'goal', label: '目标', path: '/pages/goal/list', on: '/static/tab/goal-on.png', off: '/static/tab/goal.png' },
  { key: 'stats', label: '统计', path: '/pages/stats/index', on: '/static/tab/stats-on.png', off: '/static/tab/stats.png' },
  { key: 'mine', label: '我的', path: '/pages/mine/index', on: '/static/tab/me-on.png', off: '/static/tab/me.png' },
];

const jellySeq = ref(0);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** 隐藏原生 Tab；个别端 tabBar 尚未挂载时晚一拍再试一次 */
function hideNative(): void {
  try {
    uni.hideTabBar({ animation: false, fail: () => {} });
  } catch {
    // 不支持的端静默忽略
  }
}

function playJelly(): void {
  jellySeq.value += 1;
}

function onTap(item: (typeof TABS)[number]): void {
  if (item.key === props.active) {
    playJelly();
    return;
  }
  uni.switchTab({ url: item.path });
}

onMounted(() => {
  hideNative();
  hideTimer = setTimeout(hideNative, 80);
  playJelly();
});

watch(
  () => props.pulse,
  () => {
    hideNative();
    playJelly();
  },
);

watch(
  () => props.active,
  () => playJelly(),
);

onUnmounted(() => {
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
});
</script>

<style lang="scss" scoped>
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 850;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  box-sizing: content-box;
  height: 100rpx;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
  background-color: #ffffff;
  border-top: 1px solid #eeeeee;
}

.tabbar--dark {
  background-color: #1a1a18;
  border-top-color: rgba(255, 255, 255, 0.08);
}

.tabbar__item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: background-color 200ms ease;
}

.tabbar__item--pressed {
  background-color: rgba(245, 213, 184, 0.2);
}

.tabbar__icon {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: 50% 70%;
}

.tabbar__img {
  display: block;
  width: 48rpx;
  height: 48rpx;
}

.tabbar__icon--jelly {
  animation: tab-jelly 520ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tabbar__label {
  margin-top: 2rpx;
  font-size: 20rpx;
  line-height: 1.4;
  color: #8c8c86;
}

.tabbar__item--active .tabbar__label {
  color: #b87b5a;
}

@keyframes tab-jelly {
  0% {
    transform: scale(1, 1);
  }
  35% {
    transform: scale(0.84, 0.72) translateY(3px);
  }
  62% {
    transform: scale(1.14, 1.2) translateY(-2px);
  }
  82% {
    transform: scale(0.95, 0.92) translateY(1px);
  }
  100% {
    transform: scale(1, 1);
  }
}
</style>
