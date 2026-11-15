<template>
  <view class="guide" :class="{ 'theme-dark': darkActive }">
    <!-- 头部引子：最初的小路插画（640rpx 横幅、等比，不铺底色）+ 图下一句话 -->
    <view class="g-lead">
      <DoodleIcon name="path" :width="640" />
      <view class="g-lead-texts">
        <text class="g-lead-title">怎么走，都在这里</text>
        <text class="g-lead-sub">全站手势与入口，一分钟读完</text>
      </view>
    </view>

    <!-- 今日 -->
    <view class="card">
      <text class="card-title">今日</text>
      <view class="g-lines">
        <text class="g-line">轻点计划行进入专注；轻点正中 = 暂停 / 继续，长按 1 秒 = 结束并记录。</text>
        <text class="g-line">专注页默认播放「星屑」；底部可切换 关 / 星屑 / 溯星 / 潮汐 / 夜航 / 纸月（五首不同的曲子，其中「溯星」是启动封面原曲），暂停或离开会淡出。</text>
        <text class="g-line">离开专注不中断计时，底部按钮会变成「回到专注」。</text>
        <text class="g-line">点圆点或左划整行 = 完成；再点圆点可撤销。复习行点圆点 = 完成本次复习。</text>
        <text class="g-line">专注满 1 分钟自动画勾；完成后按遗忘曲线安排复习。</text>
        <text class="g-line">过零点后，昨天没做完的安排会在今日顶部提示：接到今天，或放回目标。</text>
      </view>
    </view>

    <!-- 目标 -->
    <view class="card">
      <text class="card-title">目标</text>
      <view class="g-lines">
        <text class="g-line">轻点卡片就地展开步骤；完成只发生在今日，步骤全做完，目标自动完成。</text>
        <text class="g-line">展开后可删除目标、修改目标或收起步骤；没步骤时直接「＋ 添加步骤」。</text>
        <text class="g-line">新建时可顺手写步骤，也可以之后补；没写步骤的目标本身就是一步。</text>
        <text class="g-line">详情页点步骤的优先级标签即可调整（低 → 中 → 高），排期随之后续生效。</text>
      </view>
    </view>

    <!-- 安排 -->
    <view class="card">
      <text class="card-title">安排</text>
      <view class="g-lines">
        <text class="g-line">卡尾「调整排期」：按天折叠查看今天及之后的安排，点开某天逐条移除；底部「＋ 挑选学习内容」选日期、挑步骤加入。</text>
        <text class="g-line">底部「+ 安排今日学习」：自动排期只挑今天还没排的步骤，排进今日额度；装不下会在确认前提示。</text>
        <text class="g-line">手动挑选按目标展开步骤，勾选后加入今日；没拆步骤的目标会整块安排。</text>
        <text class="g-line">目标截止进入 3 天倒计时，今日页会出现「临近截止」提醒。</text>
      </view>
    </view>

    <!-- 统计与数据 -->
    <view class="card">
      <text class="card-title">统计与数据</text>
      <view class="g-lines">
        <text class="g-line">专注结束自动入账，统计只看真实计时；记错了，点记录右侧「移除」。</text>
        <text class="g-line">有到期复习时，统计图表后会有一行「今日待复习 N 项 →」；点一下回到今日完成。</text>
        <text class="g-line">成就收藏集：完成的目标会连同步骤一起收进去；收藏单位是目标，不是单条步骤。</text>
        <text class="g-line">数据只存本机，不上传网络；主题、每日可学时长在「我的」里调整。</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 使用指南页（V5.7）——完整交互手册
 * ============================================================
 * 今日页「指路小注」为一次性提示，确认后永久收起；
 * 全站手势与入口的权威说明收在本页（我的 → 使用指南），随时可回看。
 * 版式：紧凑卡片（内边距 24rpx、间距 16rpx），单列左对齐同一垂直轴；
 *      顶部小路插画只当标点；零弹窗、零外链。
 */
import { onShow } from '@dcloudio/uni-app';
import DoodleIcon from '@/components/DoodleIcon.vue';
import { darkActive, syncNavBar } from '@/utils/theme';

/** 本页导航栏配色随主题同步（utils/theme.ts · syncNavBar） */
onShow(() => {
  syncNavBar();
});
</script>

<style lang="scss" scoped>
/**
 * 使用指南页样式：紧凑卡片风（与「我的」同族）
 * - 面：白底 #FFFFFF + 1px #EEEEEE 描边 + 圆角 16rpx + 内边距 24rpx，卡片间距 16rpx；
 * - 安全边距 32rpx；顶部 96rpx / 底部 160rpx 与子页面（目标详情、编辑）保持一致；
 * - 文字颜色走跨页类名（card-title / g-*），暗夜模式在 dark.scss 统一覆盖。
 */

.guide {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 96rpx 32rpx 160rpx;
  background-color: #ffffff;
  color: #000000;
}

/* 头部引子：小路横幅（标点）+ 图下一句话（640rpx 宽，保证路的形象看得清） */
.g-lead {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-bottom: 32rpx;
}

.g-lead-texts {
  margin-top: 24rpx;
}

.g-lead-title {
  display: block;
  font-size: 32rpx;
  line-height: 1.4;
  color: #000000;
}

.g-lead-sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  letter-spacing: 0.05em;
  line-height: 1.6;
  color: #888888;
}

/* ==================== 面 · 紧凑卡片 ==================== */

.card {
  background-color: #ffffff;
  border: 1px solid #eeeeee;
  border-radius: 16rpx;
  padding: 24rpx;
}

/* 模块之间固定 16rpx 间距 */
.card + .card {
  margin-top: 16rpx;
}

.card-title {
  display: block;
  font-size: 28rpx;
  font-weight: 500;
  line-height: 1.4;
  color: #3a3a3a;
}

/* 条目：一段一句，段间距 16rpx */
.g-lines {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 16rpx;
}

.g-line {
  display: block;
  font-size: 26rpx;
  letter-spacing: 0.03em;
  line-height: 1.8;
  color: #888888;
}
</style>
