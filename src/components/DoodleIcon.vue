<template>
  <!-- 手绘简笔画图标：crayon 马卡龙蜡笔风；SVG 源码统一放 static/doodles/，
       经虚拟模块在构建期读入文本并内联渲染，颜色随 --doodle-* 变量走浅/暗两套；
       方形图标用 size，非方形宽图（如大树 / 小路）用 width 按 viewBox 等比渲染 -->
  <view class="doodle-icon" :style="sizeStyle" v-html="svg" />
</template>

<script lang="ts">
/**
 * 插画名称（全局唯一、语义固定、禁止复用）：
 * - tree     一棵歪歪扭扭的小树苗（旧统计空态素材；V5.56 起统计页改用 notebook）
 * - notebook 一本空白手账 + 斜放的笔（统计页·还没有学习记录，第一笔还没落下）
 * - tree-hero 一棵歪歪扭扭的大树（今日页·大数字下方，60vw 主插画）
 * - fruit    树上结的一颗果子（今日页·大树树冠，学习时长每 30 分钟结一颗）
 * - path     一条蜿蜒向前的小路（使用指南页头 / 目标页页顶）
 * - house    可爱的小房子（今日页·全部完成卡）
 * - flag     一面插在土坡上的小旗子（目标页·空状态 / 目标卡·进行中 / 底部面板·长期目标）
 * - compass  一个歪歪扭扭的指南针（我的页·使用指南入口）
 * - chart    一根弯曲的柱状图（统计页）
 * - contrast 一个半黑半白的圆（我的页·外观）
 * - hourglass 一个歪歪扭扭的沙漏（我的页·每天可学习时长）
 * - calendar 一个歪歪扭扭的日历小方块（我的页·每周可学习日）
 * - cabinet  一个极简的小柜子（我的页·数据管理）
 * - pen      一支歪歪扭扭的笔（底部面板·手动安排）
 * - pencil   一支正在画波浪线的铅笔（目标编辑页·大输入右侧）
 * - star     一个小星星（底部面板·自动排期 / 目标卡·已完成——V5.33 代替圆点）
 * - spark    一颗四角小亮星（今日页·大数字旁的小标点）
 * - dot      一笔画成的歪圈（状态圆点·未完成）
 * - check    一笔写成的歪勾（状态圆点·完成 / 收藏集书页·步骤前的勾）
 * - book     一本翻开的绘本书（统计页·成就收藏集入口）
 * - pouch    一只收口的锦囊（收藏意象素材；V5.44 起不再有步骤级收藏入口）
 * - wipe     一块斜放的橡皮擦（目标详情·抹去 / 彻底删除）
 * - stamp    一枚手绘小印章（成就收藏集·书页落款）
 * - jar      一只装满小星星的玻璃罐（成就收藏集·书下收藏罐 / 收入囊中入口）
 * - book-write 一本书（新建目标页·页底留白；合上是薄荷绿封面的厚书，翻开是纸白书页 + 淡薄荷页芯 + 薄荷绿封面底边的清爽厚书，页芯与书脊都不描内部灰线；光标进标题或步骤输入框时右页写起来，失焦后合上。笔借用标题右侧那支 pencil，V5.39 / V5.39a）
 */
export type DoodleName =
  | 'tree'
  | 'notebook'
  | 'tree-hero'
  | 'fruit'
  | 'path'
  | 'house'
  | 'flag'
  | 'compass'
  | 'chart'
  | 'contrast'
  | 'hourglass'
  | 'calendar'
  | 'cabinet'
  | 'pen'
  | 'pencil'
  | 'star'
  | 'spark'
  | 'dot'
  | 'check'
  | 'book'
  | 'pouch'
  | 'wipe'
  | 'stamp'
  | 'jar'
  | 'book-write';
</script>

<script setup lang="ts">
import { computed } from 'vue';
import tree from 'virtual:doodle/tree';
import notebook from 'virtual:doodle/notebook';
import treeHero from 'virtual:doodle/tree-hero';
import fruit from 'virtual:doodle/fruit';
import path from 'virtual:doodle/path';
import house from 'virtual:doodle/house';
import flag from 'virtual:doodle/flag';
import compass from 'virtual:doodle/compass';
import chart from 'virtual:doodle/chart';
import contrast from 'virtual:doodle/contrast';
import hourglass from 'virtual:doodle/hourglass';
import calendar from 'virtual:doodle/calendar';
import cabinet from 'virtual:doodle/cabinet';
import pen from 'virtual:doodle/pen';
import pencil from 'virtual:doodle/pencil';
import star from 'virtual:doodle/star';
import spark from 'virtual:doodle/spark';
import dot from 'virtual:doodle/dot';
import check from 'virtual:doodle/check';
import book from 'virtual:doodle/book';
import pouch from 'virtual:doodle/pouch';
import wipe from 'virtual:doodle/wipe';
import stamp from 'virtual:doodle/stamp';
import jar from 'virtual:doodle/jar';
import bookWrite from 'virtual:doodle/book-write';

const props = withDefaults(
  defineProps<{
    /** 插画名称：对应 static/doodles/<name>.svg */
    name: DoodleName;
    /** 方形显示边长（rpx）：标点图标 80，空状态 / 页顶 160，大数字旁小亮星 40；非方形插画改用 width */
    size?: number;
    /** 非方形插画宽度：rpx 数字或 CSS 长度（如 '60vw'）；高度按 SVG viewBox 比例自动等比（用绝对长度，勿用百分比） */
    width?: number | string;
  }>(),
  { size: 80 },
);

/** 插画源码表（virtual:doodle/* 由 vite.config.ts 的 spa-doodle-raw 插件在构建期读入） */
const DOODLE_SVG: Record<DoodleName, string> = {
  tree,
  notebook,
  'tree-hero': treeHero,
  fruit,
  path,
  house,
  flag,
  compass,
  chart,
  contrast,
  hourglass,
  calendar,
  cabinet,
  pen,
  pencil,
  star,
  spark,
  dot,
  check,
  book,
  pouch,
  wipe,
  stamp,
  jar,
  'book-write': bookWrite,
};

const svg = computed(() => DOODLE_SVG[props.name] ?? '');

/** SVG 的「宽 ÷ 高」比例（CSS aspect-ratio 语义）：从 svg 标签的 viewBox 解析（退回 width/height 属性，再不行按 1:1） */
const aspect = computed(() => {
  const tag = svg.value.match(/<svg[^>]*>/i)?.[0] ?? '';
  const viewBox = tag.match(/viewBox="([^"]+)"/i);
  if (viewBox) {
    const nums = viewBox[1].trim().split(/[\s,]+/).map(Number);
    if (nums.length === 4 && nums[2] > 0 && nums[3] > 0) {
      return nums[2] / nums[3];
    }
  }
  const rawWidth = Number(tag.match(/width="([\d.]+)"/i)?.[1] ?? 0);
  const rawHeight = Number(tag.match(/height="([\d.]+)"/i)?.[1] ?? 0);
  return rawWidth > 0 && rawHeight > 0 ? rawWidth / rawHeight : 1;
});

const sizeStyle = computed(() => {
  if (props.width === undefined) {
    return { width: `${props.size}rpx`, height: `${props.size}rpx` };
  }
  const width = typeof props.width === 'number' ? `${props.width}rpx` : props.width;
  // 高度交给 CSS aspect-ratio 按 SVG 原始比例推导（宽图不被方形画框压扁）
  return { width, aspectRatio: String(aspect.value) };
});
</script>

<style scoped>
.doodle-icon {
  display: block;
  flex-shrink: 0;
}

/* v-html 注入的节点不带 scoped 属性，用 :deep 命中：撑满容器、等比缩放 */
.doodle-icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
