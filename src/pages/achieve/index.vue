<template>
  <AchievementBook />
</template>

<script setup lang="ts">
/**
 * 成就收藏集页（V5.22）——只做外壳：注册导航栏主题；
 * 书本、翻页与数据全部住在 AchievementBook 组件里。
 */
import { onShow } from '@dcloudio/uni-app';
import AchievementBook from '@/components/AchievementBook.vue';
import { syncNavBar } from '@/utils/theme';

onShow(() => {
  syncNavBar();
});
</script>
