<template>
  <!-- 手绘抖动边框（V5.8）：铺满父容器，替代规整 1px 描边；stroke 走 currentColor，由父级按状态指定。
       SVG 必须经 v-html 注入：app-vue 会吃掉模板里的静态 <svg>（与 DoodleIcon 同一做法）。 -->
  <view class="hand-frame" v-html="svg" />
</template>

<script setup lang="ts">
/**
 * HandFrame —— 手绘抖动边框（V5.8「笨拙手账」）
 * ============================================================
 * 替代按钮的 1px 规整描边：一条轻微起伏、四角不太圆的手绘框；
 * 绝对定位铺满父容器（父级需 position: relative，且自身 border 置 none）；
 * 颜色走 currentColor，由父级按状态设置（常态墨色 / 按下暖金；暗色见 dark.scss）。
 *
 * V5.76：真机修复——静态 <svg> 在 app-vue 不渲染，改为 virtual:doodle 源码 + v-html。
 */
import svg from 'virtual:doodle/hand-frame';
</script>

<style scoped>
.hand-frame {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* v-html 注入的节点不带 scoped 属性，用 :deep 撑满容器 */
.hand-frame :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
