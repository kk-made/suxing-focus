<template>
  <!-- 1px 虚线进度线：已完成段为马卡龙薄荷虚线，未完成段为 #EEEEEE 浅灰虚线 -->
  <view class="pline">
    <view class="pline__fill" :style="fillStyle" />
  </view>
</template>

<script setup lang="ts">
/**
 * ProgressLine —— 1px 虚线进度线（点线面设计规范 · 2. 线）
 * ============================================================
 * - 贯彻「绝不用色块进度条」：全程 1px 虚线（4px 线段 + 4px 间隙，
 *   等效 SVG stroke-dasharray="4,4"）；
 * - 已完成段马卡龙虚线（默认 #A2D9CE、可传 color 覆盖；暗色模式用 CSS 变量
 *   --pline-fill 整体换陶土暖橙）、未完成段 #EEEEEE 虚线，两段同一相位、无缝衔接；
 * - percent：0–100，超出范围自动夹紧。
 */
import { computed } from 'vue';

const props = defineProps<{
  percent: number;
  /** 已完成段颜色：默认马卡龙薄荷 #A2D9CE（暗色由 --pline-fill 覆盖为陶土暖橙） */
  color?: string;
}>();

/** 夹紧到 0–100，避免异常数据撑破布局 */
const width = computed(() => `${Math.min(100, Math.max(0, props.percent))}%`);

/** 已完成段样式：宽度 + 同相位虚线（颜色可被页面覆盖；暗色由 --pline-fill 接管） */
const fillStyle = computed(() => {
  const c = props.color ?? 'var(--pline-fill, #A2D9CE)';
  return {
    width: width.value,
    backgroundImage: `repeating-linear-gradient(to right, ${c} 0, ${c} 4px, transparent 4px, transparent 8px)`,
  };
});
</script>

<style scoped>
/* 未完成段：1px 极浅灰虚线 */
.pline {
  position: relative;
  height: 1px;
  background-image: repeating-linear-gradient(
    to right,
    #eeeeee 0,
    #eeeeee 4px,
    transparent 4px,
    transparent 8px
  );
}

/* 已完成段：白色底遮盖浅灰虚线，再叠马卡龙虚线（同起点、同相位；颜色由 color prop 控制） */
.pline__fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 1px;
  background-color: #ffffff;
}
</style>
