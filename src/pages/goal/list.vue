<template>
  <view class="goals" :class="{ 'theme-dark': darkActive }">
    <!-- 顶部手绘插画：一条蜿蜒向前的小路（仅列表有内容时展示）——目标就是一条要走的路 -->
    <view v-if="items.length > 0" class="goals-deco">
      <DoodleIcon name="path" :width="640" />
    </view>

    <!-- 空状态：一面插在土坡上的小旗子 + 左对齐文案（不给插画铺底色）；
         下句为手写体小句（V5.8 延伸：日记口气只住这一行） -->
    <view v-if="items.length === 0" class="empty-row">
      <DoodleIcon name="flag" :size="160" />
      <view class="empty-texts">
        <text class="empty-title">还没有学习目标</text>
        <text class="empty-sub hand">先立一面小旗子 · 写下第一件想学的事</text>
      </view>
    </view>

    <!-- 目标卡片列表（V5.32：完成只发生在今日——目标页只呈现，不再有完成入口；
         轻点卡片就地展开学习步骤，圆点只作状态显示） -->
    <view
      v-for="item in items"
      :key="item.goal.id"
      class="goal-card"
      :class="{ 'goal-card--done': item.done }"
    >
      <!-- 卡片头部区：轻点 = 展开 / 收起（暖色按压反馈覆盖整卡）；圆点只显示完成状态 -->
      <view
        class="goal-zone"
        hover-class="goal-card--pressed"
        @click="toggleExpand(item.goal.id)"
      >
        <!-- 第一行：目标的小旗子（进行中）/ 小星星（已完成）——
             V5.33：不再用圆点（今日页的圆点 = 点一下就完成，在这里会误导） -->
        <view class="goal-head">
          <view class="goal-mark">
            <DoodleIcon :name="item.done ? 'star' : 'flag'" :size="44" />
          </view>
          <text class="goal-title">{{ item.goal.title }}</text>
        </view>

        <!-- 第二行：标签 chips（浅底 #F5F5F5 + 圆角，禁止裸露文字） -->
        <view class="goal-tags">
          <text
            v-for="(part, idx) in item.meta"
            :key="idx"
            class="tag"
            :class="{ 'tag--alert': part.alert }"
          >{{ part.text }}</text>
        </view>

        <!-- 第三行：细线进度条（轨道 #EEEEEE、进度 #A2D9CE）+ 右侧极小进度文字 -->
        <view class="goal-progress">
          <ProgressLine class="goal-line" :percent="item.percent" />
          <text class="goal-progress-text">{{ item.progressText }}</text>
        </view>

        <!-- 收起态：展开提示（点击行为跟随卡片，只做可见的入口暗示）；
             V5.75：已完成的目标把「收入囊中」提到卡面，不再藏在展开后的动作行里 -->
        <view v-if="expandedId !== item.goal.id" class="goal-foot">
          <text class="act">{{ footText(item) }}</text>
          <text
            v-if="item.done"
            class="act act--strong goal-collect"
            @click.stop="onGoalArchive(item.goal)"
          >收入囊中</text>
        </view>
      </view>

      <!-- 展开态：步骤直接列在目标下（V5.37：只有目标与步骤两层） -->
      <template v-if="expandedId === item.goal.id">
        <view v-if="item.steps.length === 0" class="goal-empty">
          <text class="empty-line">还没有学习步骤</text>
          <!-- V5.35：空态里直接给一条路——新用户不用猜「加步骤在哪」 -->
          <text class="act empty-act" @click="onAddStep(item.goal)">＋ 添加步骤</text>
          <text class="empty-hint">不拆也行——它就是小目标，安排时本身就是一步</text>
        </view>
        <view v-else class="goal-steps">
          <view
            v-for="(task, idx) in item.steps"
            :key="task.id"
            class="task-row"
            :class="{ 'task-row--divided': idx > 0 }"
          >
            <HandLine v-if="idx > 0" class="task-row-line" />

            <!-- V5.33：步骤行不再有圆点（完成去今日做）——完成状态靠标题的删除线与右侧动作区分 -->
            <view class="task-main">
              <text
                class="task-title"
                :class="{ 'task-title--done': task.status === 'done' }"
              >{{ task.title }}</text>
              <text class="task-meta">{{ task.estimateMinutes }} 分钟 · {{ PRIORITY_TEXT[task.priority] }}</text>
            </view>

            <!-- 已完成的步骤（V5.44）：步骤随目标一起收藏，这里只留橡皮 = 抹去（行内两段确认） -->
            <view v-if="task.status === 'done'" class="task-acts">
              <template v-if="confirmingTaskId === task.id">
                <text class="act act--strong" @click="onStepWipe(task)">确认抹去</text>
                <text class="act" @click="confirmingTaskId = ''">取消</text>
              </template>
              <template v-else>
                <view class="act-icon" hover-class="act-icon--pressed" @click="onStepWipeAsk(task)">
                  <DoodleIcon name="wipe" :size="44" />
                </view>
              </template>
            </view>
          </view>
        </view>

        <!-- 展开态动作行（卡尾，手绘波浪虚线贴顶，V5.8）：
             V5.32：完成只在今日发生，这里没有「标记完成」；
             V5.46：进行中的目标也可以删除；已完成的目标另有「收入囊中」 -->
        <view class="goal-acts">
          <HandLine class="goal-acts-line" />
          <template v-if="confirmingGoalId === item.goal.id">
            <text class="act act--strong" @click="onGoalDelete(item.goal)">确认删除</text>
            <text class="act" @click="confirmingGoalId = ''">取消</text>
          </template>
          <template v-else>
            <text v-if="item.done" class="act act--strong" @click="onGoalArchive(item.goal)">收入囊中</text>
            <text class="act" @click="onGoalDeleteAsk(item.goal)">删除</text>
            <text class="act" @click="onOpenGoal(item.goal)">修改目标</text>
            <text class="act" @click="toggleExpand(item.goal.id)">收起步骤</text>
          </template>
        </view>
        <text v-if="confirmingGoalId === item.goal.id" class="danger-note">
          删除后，目标及其未完成步骤、安排和复习计划都会离开，且不可恢复。
        </text>
      </template>
    </view>

    <!-- 底部固定按钮的滚动留白补偿（按钮悬于 Tab 栏上方约 214rpx 处） -->
    <view class="bottom-space" />

    <!-- 底部固定主行动：Tab 栏上方、左右 32rpx 安全边距；
         描边为手绘抖动框（V5.8 延伸 HandFrame） -->
    <view class="cta-wrap">
      <view class="cta" hover-class="cta--pressed" @click="goCreate">
        <HandFrame />
        新建学习目标
      </view>
    </view>

    <!-- 自绘底部 Tab（V5.77）：原生栏隐藏，选中图标可回弹 -->
    <TabBar active="goal" :pulse="tabPulse" />
  </view>
</template>

<script setup lang="ts">
/**
 * 学习目标页（tab）—— 卡片即操作面（DESIGN.md V5.5）
 * ============================================================
 * 每个目标 = 一张卡片（面）：轻点卡片就地展开学习步骤（同一时间只展开一张）——
 * - 卡片头部：圆点只显示目标完成状态（完成状态随步骤自动同步）；
 * - 步骤行：圆点只显示步骤完成状态；完成去今日做，这里不再提供完成手势；
 * - 动作行：删除（任何非归档目标）· 收入囊中（已完成时）· 修改目标（改名字、加步骤、安排到某天）· 收起步骤。
 * V5.32：完成只发生在今日——目标页只呈现结果，不承担完成动作。
 * 排序、进度、截止文案全部来自 services/goal.ts 纯函数（有单测）。
 */
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import DoodleIcon from '@/components/DoodleIcon.vue';
import HandFrame from '@/components/HandFrame.vue';
import HandLine from '@/components/HandLine.vue';
import ProgressLine from '@/components/ProgressLine.vue';
import TabBar from '@/components/TabBar.vue';
import { useGoalDelete } from '@/composables/useGoalDelete';
import type { Goal, Priority, Task } from '@/types/models';
import { useGoalStore } from '@/stores/goal';
import { useTaskStore } from '@/stores/task';
import { calcGoalProgress, deadlineText, sortGoals, sortTasks } from '@/services/goal';
import { diffDays, todayStr } from '@/utils/date';
import { darkActive, syncNavBar } from '@/utils/theme';

const goalStore = useGoalStore();
const taskStore = useTaskStore();
const { deleteGoalCascade } = useGoalDelete();

/** 优先级文案（纯文字标签，不用色块） */
const PRIORITY_TEXT: Record<Priority, string> = {
  low: '低优先',
  medium: '中优先',
  high: '高优先',
};

/** 跨天重算锚点：onShow 时刷新，保证「剩 N 天/已逾期」不过期 */
const todayKey = ref(todayStr());

/** 自绘 TabBar 的回弹计数：每次 onShow +1 */
const tabPulse = ref(0);

onShow(() => {
  tabPulse.value += 1;
  todayKey.value = todayStr();
  syncNavBar();
  // V5.32：完成只发生在今日——进目标页时兜底同步一次目标状态
  // （老数据里「步骤早已做完、目标还挂在进行中」的也一并归位）
  taskStore.syncAllGoalStatuses();
});

/** 本页导航栏配色随主题同步（utils/theme.ts · syncNavBar） */

/** 列表项视图模型（模板里只做展示，逻辑都在这里算好） */
interface GoalVM {
  goal: Goal;
  done: boolean;
  percent: number;
  progressText: string;
  meta: { text: string; alert: boolean }[];
  /** 展开区渲染的学习步骤：未完成在前、按创建时间升序 */
  steps: Task[];
}

const items = computed<GoalVM[]>(() => {
  const key = todayKey.value;
  void key; // 建立依赖：跨天 / 回到页面时重算截止文案

  // V5.23：已「收入囊中」的目标住进成就收藏集，不在列表露面
  const visible = goalStore.activeGoals.filter((g) => g.status !== 'archived');
  const top = sortGoals(visible);

  return top.map((goal) => {
    // V5.22：归档的步骤仍计入进度，只是不在展开区露面
    const allTasks = taskStore.listByGoal(goal.id);
    const tasks = allTasks.filter((t) => t.status !== 'archived');
    const progress = calcGoalProgress(allTasks);
    const done = goal.status === 'completed';

    // 截止状态：今天是截止日或已逾期 → 该标签文字加深提醒（底色不变）
    const urgent =
      !done && !!goal.deadline && diffDays(todayStr(), goal.deadline) <= 0;

    const parts: { text: string; alert: boolean }[] = [];
    if (goal.category) {
      parts.push({ text: goal.category, alert: false });
    }
    if (done) {
      parts.push({ text: '已完成', alert: false });
    } else {
      if (goal.deadline) {
        parts.push({ text: deadlineText(goal.deadline), alert: urgent });
      }
      parts.push({ text: PRIORITY_TEXT[goal.priority], alert: false });
    }

    return {
      goal,
      done,
      percent: progress.percent,
      progressText:
        progress.totalTasks === 0
          ? '本身就是一步'
          : `${progress.doneTasks}/${progress.totalTasks} 个步骤 · ${progress.percent}%`,
      // 标签独立成 chip，间距由样式控制（不再拼「 · 」分隔符）
      meta: parts.map((part) => ({ text: part.text, alert: part.alert })),
      steps: sortTasks(tasks),
    };
  });
});

/* ==================== 步骤行：抹去（V5.44：步骤不再单独收藏，与详情页同语义） ==================== */

/** 「抹去」的行内确认态：正在确认抹去哪一个步骤（'' = 无） */
const confirmingTaskId = ref('');

/** 轻点橡皮 → 进入抹去确认 */
function onStepWipeAsk(task: Task): void {
  confirmingTaskId.value = task.id;
}

/** 抹去：物理删除，不留痕迹（计划条目与复习项一并物理清理） */
function onStepWipe(task: Task): void {
  confirmingTaskId.value = '';
  taskStore.deleteTask(task.id);
  uni.showToast({ title: '已抹去', icon: 'none' });
}

/* ==================== 展开 / 收起：卡片即操作面（V5.5） ==================== */

/** 展开中的目标 id（'' = 全部收起；同一时间只展开一张卡片） */
const expandedId = ref('');

/** 卡片轻点 = 就地展开 / 收起 */
function toggleExpand(goalId: string): void {
  // 收起 / 切换卡片时，放过一切未完成的确认态（删除、抹去）
  confirmingGoalId.value = '';
  confirmingTaskId.value = '';
  expandedId.value = expandedId.value === goalId ? '' : goalId;
}

/* ==================== 目标级操作 ==================== */

/** 修改目标：进详情页（改名字、加步骤、安排到某天都在那里） */
function onOpenGoal(goal: Goal): void {
  goDetail(goal.id);
}

/**
 * 空态里「＋ 添加步骤」（V5.35）：直接进详情页并把新增表单展开——
 * 新用户不用先猜「加步骤在哪」，点一下就落在输入框前。
 */
function onAddStep(goal: Goal): void {
  uni.navigateTo({ url: `/pages/goal/detail?id=${goal.id}&add=1` });
}

/** 收起态的提示语：点开能看到什么 */
function footText(item: GoalVM): string {
  return item.steps.length === 0 ? '展开 · 加一步' : '展开步骤';
}

/* ==================== 目标级：收入囊中 / 删除（V5.23，完成后的两条路） ==================== */

/** 「删除」的行内确认态：正在确认删除哪一个目标（'' = 无） */
const confirmingGoalId = ref('');

/** 收入囊中（V5.23）：已完成的目标连同它的已完成步骤，一起收回成就收藏集 */
function onGoalArchive(goal: Goal): void {
  const count = goalStore.archiveGoal(goal.id);
  uni.showToast({
    title: count > 0 ? `已收入囊中 · 目标 + ${count} 个步骤` : '已收入囊中',
    icon: 'none',
  });
}

/** 轻点「删除」→ 进入行内两段确认（零弹窗；V5.46：进行中的目标也能删） */
function onGoalDeleteAsk(goal: Goal): void {
  confirmingGoalId.value = goal.id;
}

/** 确认删除（与编辑页 / 详情页同一套级联，`useGoalDelete` 共用；目标连同它的步骤整体离开） */
function onGoalDelete(goal: Goal): void {
  confirmingGoalId.value = '';
  deleteGoalCascade(goal.id);
  uni.showToast({ title: '已删除', icon: 'none' });
}

/* ==================== 导航 ==================== */

function goCreate(): void {
  uni.navigateTo({ url: '/pages/goal/edit' });
}

function goDetail(id: string): void {
  uni.navigateTo({ url: `/pages/goal/detail?id=${id}` });
}
</script>

<style lang="scss" scoped>
/**
 * 学习目标页样式（DESIGN.md V5.5「卡片即操作面」）
 * - 面：白底 #FFFFFF + 1px #EEEEEE 描边 + 圆角 16rpx + 内边距 32rpx，卡片间距 24rpx；
 * - 头部区（goal-zone）向外扩 32rpx：按压暖光覆盖整卡，圆角由卡片 overflow 裁剪；
 * - 展开区：学习步骤行（点 + 文字 + 极小注）+ 纯文字动作行（收入囊中 / 删除 · 修改目标 · 收起步骤）；
 * - 线：进度线轨道 #EEEEEE、已完成段马卡龙薄荷 #A2D9CE（ProgressLine 默认）；
 * - V5.8 延伸：步骤行间 / 动作行卡尾换手绘波浪虚线（HandLine）、大按钮换手绘抖动框（HandFrame）、空态下句手写体；
 * - V5.32：圆点只作状态显示（完成去今日做），卡片与步骤行不再有滑动完成手势；
 * - 安全区：根容器 padding-bottom 140rpx；固定按钮 bottom: 100rpx（Tab 栏上方）。
 */

.goals {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 96rpx 32rpx 140rpx; /* 左右安全边距 32rpx；底部 140rpx 给 Tab 栏让位 */
  background-color: #ffffff;
  color: #000000;
}

/* ==================== 顶部插画（指南针 = 有目标时的方向感） ==================== */

.goals-deco {
  display: flex;
  flex-direction: row;
  justify-content: center;
  padding: 8rpx 0 24rpx;
}

/* ==================== 面 · 目标卡片 ==================== */

.goal-card {
  background-color: #ffffff;
  border: 1px solid #eeeeee;
  border-radius: 16rpx;
  padding: 32rpx;
  /* 裁剪按压暖光与滑动行的横向位移，保证卡片圆角干净 */
  overflow: hidden;
}

/* 卡片之间固定 24rpx 间距 */
.goal-card + .goal-card {
  margin-top: 24rpx;
}

/* 暖色按压反馈（V4.1）：浅暖橘底，松开 200ms 渐隐 */
.goal-card--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

/* 头部区：负外边距 + 同值内边距外扩——按压暖光覆盖整张卡片（圆角由卡片裁剪）；
   滑动完成（触屏 / 桌面左键拖拽）时禁掉文字选中与长按菜单 */
.goal-zone {
  margin: -32rpx;
  padding: 32rpx;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* 第一行：目标插画 + 标题 */
.goal-head {
  display: flex;
  flex-direction: row;
  align-items: center;
}

/* 目标插画（小旗子 / 小星星）：V5.33 起代替圆点——
   圆点在今日页 = 点一下就完成，放在目标前会让人以为可以点这里完成 */
.goal-mark {
  flex-shrink: 0;
  width: 44rpx;
  height: 44rpx;
  margin-right: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.goal-title {
  flex: 1;
  min-width: 0;
  font-size: 32rpx;
  line-height: 1.4;
  font-weight: 500;
  color: #000000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.goal-card--done .goal-title {
  color: #888888;
  text-decoration: line-through;
}

/* 第二行：标签 chips（浅底 + 圆角，禁止裸露文字） */
.goal-tags {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}

.tag {
  font-size: 22rpx;
  line-height: 1.4;
  color: #888888;
  background-color: #f5f5f5;
  border-radius: 8rpx;
  padding: 6rpx 16rpx;
}

/* 今天截止 / 已逾期：文字加深，底色不变 */
.tag--alert {
  color: #000000;
}

/* 第三行：进度线 + 右侧极小文字 */
.goal-progress {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 24rpx;
}

/* 进度：1px 虚线（轨道 #EEEEEE、已完成段 #A2D9CE，无填充色块） */
.goal-line {
  flex: 1;
  min-width: 0;
}

.goal-progress-text {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: 20rpx;
  line-height: 1.4;
  color: #888888;
  font-variant-numeric: tabular-nums;
}

/* ==================== 展开区 · 学习步骤（V5.5） ==================== */

/* 收起态：展开提示行（纯文字动作，点击行为跟随卡片） */
.goal-foot {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 24rpx;
  margin-left: -28rpx;
}

/* 收起态右端：已完成目标直接给收藏入口（左端仍是「展开步骤」） */
.goal-collect {
  margin-left: auto;
  margin-right: -28rpx;
}

.goal-steps {
  margin-top: 40rpx;
}

.task-row {
  position: relative; /* 手绘波浪分割线的定位坐标系（V5.8） */
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  /* 滑动完成（触屏 / 桌面左键拖拽）时禁掉文字选中与长按菜单 */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* 步骤行间距（同组信息内部紧凑 16rpx，圆点热区已自带上下留白） */
.task-row + .task-row {
  margin-top: 16rpx;
}

/* 行间分割线：手绘波浪虚线（V5.8 延伸），由行内 HandLine 贴在行顶 */
.task-row--divided {
  padding-top: 16rpx;
}

.task-row-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

/* V5.33：完成圆点已撤除（步骤行不再有圆点） */

.task-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding-top: 24rpx;
}

.task-title {
  font-size: 28rpx;
  line-height: 1.4;
  color: #000000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-title--done {
  color: #888888;
  text-decoration: line-through;
}

.task-meta {
  font-size: 22rpx;
  line-height: 1.4;
  color: #888888;
}

/* 已完成步骤的动作（V5.44，与详情页同一套）：步骤随目标收藏，只留橡皮 = 抹去 */
.task-acts {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  margin-top: 12rpx;
  margin-right: -28rpx;
}

.act-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  margin-left: 10rpx;
  border-radius: 6rpx;
  transition: background-color 200ms ease;
}

.act-icon:last-child {
  margin-right: 12rpx; /* 与相邻文字动作的视觉右缘对齐 */
}

.act-icon--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

/* 空步骤提示（展开一个还没拆步骤的目标时）：V5.31 补一行「不拆也行」的宽心话 */
.goal-empty {
  margin-top: 40rpx;
}

.empty-line {
  display: block;
  font-size: 28rpx;
  letter-spacing: 0.05em;
  line-height: 1.8;
  color: #888888;
}

.empty-hint {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  letter-spacing: 0.05em;
  line-height: 1.8;
  color: #888888;
}

/* V5.35：空态里的「＋ 添加步骤」——比提示语更醒目一点（这是能点的路） */
.empty-act {
  display: block;
  margin-top: 12rpx;
  font-size: 28rpx;
  line-height: 1.8;
}

/* 展开态动作行：目标级操作就地完成（左对齐挂回内容轴）；卡尾手绘波浪虚线贴顶（V5.8）；
   任何目标都有「删除」，完成的目标多出「收入囊中」，允许换行（V5.46） */
.goal-acts {
  position: relative; /* 卡尾线的定位坐标系 */
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 24rpx;
  padding-top: 20rpx;
  margin-left: -28rpx;
}

/* 删除确认的说明（V5.46：进行中的目标也能删，先把后果说清楚） */
.danger-note {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  letter-spacing: 0.05em;
  line-height: 1.7;
  color: #888888;
}

/* 卡尾线左端对齐内容轴（动作行含 -28rpx 负外边距，由 left 补回） */
.goal-acts-line {
  position: absolute;
  top: 0;
  left: 28rpx;
  right: 0;
}

/* ==================== 通用纯文字动作（隐形热区 ≥ 44px） ==================== */

.act {
  padding: 18rpx 28rpx;
  font-size: 28rpx;
  line-height: 1.4;
  color: #888888;
}

/* 暖色按压反馈（V4.1）：浅暖橘底 */
.act:active {
  background-color: rgba(245, 213, 184, 0.3);
}

.act--strong {
  color: #000000;
}

/* ==================== 空状态（细小路标插画 + 左对齐文案，不铺底色） ==================== */

.empty-row {
  margin-top: 48rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.empty-texts {
  margin-left: 24rpx;
}

.empty-title {
  display: block;
  font-size: 28rpx;
  line-height: 1.4;
  color: #000000;
}

.empty-sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
}

/* 空态的手写体小句（V5.8）：日记口气，字体栈走系统楷体（见 App.vue 的 .hand） */
.empty-sub.hand {
  font-size: 26rpx;
}

/* ==================== 底部安全区 ==================== */

/* 固定按钮高约 114rpx（bottom: 100rpx），留白补偿保证最后一张卡片可见 */
.bottom-space {
  height: 140rpx;
}

.cta-wrap {
  position: fixed;
  left: 0;
  right: 0;
  /* 悬于自绘 Tab 栏（100rpx + 安全区）上方 */
  bottom: calc(100rpx + constant(safe-area-inset-bottom));
  bottom: calc(100rpx + env(safe-area-inset-bottom));
  padding: 16rpx 32rpx; /* 左右 32rpx 安全边距 */
  background-color: #ffffff;
}

/* 矩形按钮：描边为手绘抖动框（V5.8 延伸 HandFrame）——常态墨色、按下暖金 */
.cta {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20rpx 0;
  border-radius: 10rpx;
  background-color: #ffffff;
  color: #000000;
  font-size: 28rpx;
  line-height: 1.4;
}

.cta .hand-frame {
  color: #3a3a3a;
  transition: color 150ms ease;
}

/* 暖色按压反馈（V4.1）：浅暖橘底 + 手绘框微暖 */
.cta--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

.cta--pressed .hand-frame {
  color: #b89b5e;
}
</style>
