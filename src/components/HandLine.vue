<template>
  <!-- 手绘波浪虚线（V5.8）：文字 / 条目之间的分隔，代替死板的 1px 直分割线。
       SVG 必须经 v-html 注入：app-vue 会吃掉模板里的静态 <svg>。 -->
  <view class="hand-line" v-html="svg" />
</template>

<script setup lang="ts">
/**
 * HandLine —— 手绘波浪虚线（V5.8「笨拙手账」）
 * ============================================================
 * 用于文字 / 条目之间的分隔线：一条微微起伏的虚线，替代死板的 1px 直线；
 * 颜色随 currentColor（浅色 #EEEEEE / 暗色 #333330，dark.scss 覆盖 color）；
 * non-scaling-stroke 保证任何宽度下都是 1px 发丝线（与全站 1px 体系一致）。
 *
 * V5.76：真机修复——静态 <svg> 在 app-vue 不渲染，改为 virtual:doodle 源码 + v-html。
 */
import svg from 'virtual:doodle/hand-line';
</script>

<style scoped>
.hand-line {
  width: 100%;
  height: 4px;
  color: #eeeeee;
}

.hand-line :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
</style>
