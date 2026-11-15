<template>
  <view class="detail" :class="{ 'theme-dark': darkActive }">
    <template v-if="goal">
      <!-- ① 目标头部：标题 + 元信息 + 说明（纯文字，无卡片） -->
      <text class="title" :class="{ 'title--done': goal.status === 'completed' }">
        {{ goal.title }}
      </text>

      <view class="meta">
        <text
          v-for="(part, idx) in goalMeta"
          :key="idx"
          class="meta-part"
          :class="{ 'meta-part--alert': part.alert }"
        >{{ part.text }}</text>
      </view>

      <text v-if="goal.description" class="desc">{{ goal.description }}</text>

      <!-- ② 进度：文字 + 1px 虚线（黑虚线已完成段 + 灰虚线未完成段） -->
      <view class="progress">
        <text class="progress-text">{{ progressText }}</text>
        <ProgressLine class="progress-line" :percent="progress.percent" />
      </view>

      <!-- ③ 目标级操作：纯文字动作（V5.32：完成只在今日，这里没有「标记完成」；
           V5.46：进行中的目标也可以删除——立错了不用先完成它） -->
      <view class="goal-acts">
        <text class="act act--strong" @click="goEditGoal">编辑目标</text>
        <template v-if="goal.status !== 'archived'">
          <template v-if="confirmingDeleteGoal">
            <text class="act act--strong" @click="onGoalDelete">确认删除</text>
            <text class="act" @click="confirmingDeleteGoal = false">取消</text>
          </template>
          <template v-else>
            <text v-if="goal.status === 'completed'" class="act" @click="onGoalArchive">收入囊中</text>
            <text class="act" @click="confirmingDeleteGoal = true">删除</text>
          </template>
        </template>
      </view>

      <!-- 删除确认的说明行（与编辑页同一句话） -->
      <text v-if="confirmingDeleteGoal" class="danger-note">{{ deleteNote }}</text>

      <!-- ④ 学习步骤区（V5.37：只有目标与步骤，步骤直接列在目标下） -->
      <view class="sec-head">
        <text class="section-title">学习步骤（{{ tasks.length }}）</text>
        <text class="act sec-act" @click="toggleTaskForm">
          {{ formVisible && !editingTaskId ? '收起' : '＋ 添加步骤' }}
        </text>
      </view>

      <!-- 步骤列表：表单就地插入——新增 = 未完成段末尾（新步骤落点）；编辑 = 贴着被编辑步骤 -->
      <view v-if="tasks.length === 0 && !formVisible" class="empty">
        <text class="empty-line">还没有学习步骤</text>
        <text class="empty-hint">不拆也行：它就是小目标，安排到某天时本身就是一步</text>
      </view>
      <view v-if="stepItems.length > 0" class="task-list">
        <view
          v-for="item in stepItems"
          :key="item.kind === 'form' ? 'step-form' : item.task.id"
          :id="item.kind === 'form' ? 'step-form' : 'task-' + item.task.id"
          class="task-item"
          :class="{ 'task-item--flash': item.kind === 'task' && item.task.id === flashTaskId }"
        >
          <!-- 表单（新增 / 编辑就地呈现；输入 = 一行字 + 1px 底线） -->
          <view v-if="item.kind === 'form'" class="task-form">
            <text class="form-title">{{ editingTaskId ? '编辑步骤' : '新增步骤' }}</text>

            <view class="field">
              <text class="field-label">步骤名称</text>
              <input
                v-model="taskForm.title"
                class="field-input"
                :maxlength="TITLE_MAX_LENGTH"
                placeholder="例如：背 50 个六级单词"
              />
            </view>

            <view class="field">
              <text class="field-label">预估时长（分钟）</text>
              <input
                v-model="taskForm.estimateMinutes"
                class="field-input"
                type="number"
                placeholder="默认 25 分钟"
              />
            </view>

            <view class="field">
              <text class="field-label">优先级</text>
              <view class="opts">
                <text
                  v-for="p in PRIORITY_OPTIONS"
                  :key="p.value"
                  class="opt"
                  :class="{ 'opt--active': taskForm.priority === p.value }"
                  @click="taskForm.priority = p.value"
                >{{ p.label }}</text>
              </view>
            </view>

            <!-- 复习开关（V5.41）：一次性步骤可以关掉；默认开，完成后按间隔表提醒 -->
            <view
              class="field field--switch"
              @click="taskForm.reviewEnabled = !taskForm.reviewEnabled"
            >
              <view class="switch-text">
                <text class="field-label field-label--switch">完成后安排复习</text>
                <text class="field-hint">{{ reviewHintText }}</text>
              </view>
              <view class="switch" :class="{ 'switch--on': taskForm.reviewEnabled }">
                <view class="switch-knob" />
              </view>
            </view>

            <!-- 删除步骤：行内两段式确认（不弹窗）；彻底删除，不留痕迹 -->
            <template v-if="editingTaskId && confirmingDeleteTask">
              <text class="danger-note">将彻底删除该步骤（含其安排与复习计划），不留痕迹，且不可恢复。</text>
              <view class="form-acts">
                <text class="act act--strong" @click="deleteTask">确认删除</text>
                <text class="act" @click="confirmingDeleteTask = false">取消</text>
              </view>
            </template>
            <view v-else class="form-acts">
              <text class="act act--strong" @click="saveTask">{{ editingTaskId ? '保存修改' : '添加' }}</text>
              <text class="act" @click="cancelTaskForm">取消</text>
              <text v-if="editingTaskId" class="act" @click="confirmingDeleteTask = true">删除步骤</text>
            </view>
          </view>

          <!-- 步骤行：V5.33 撤掉圆点（今日页的圆点 = 点一下就完成，在这里会误导）——
               完成状态靠标题的删除线与右侧的橡皮区分 -->
          <template v-else>
            <view class="task-row">
              <view class="task-main">
                <text
                  class="task-title"
                  :class="{ 'task-title--done': item.task.status === 'done' }"
                >{{ item.task.title }}</text>
                <view class="task-meta-line">
                  <text class="task-meta">{{ item.task.estimateMinutes }} 分钟</text>
                  <text v-if="item.task.reviewEnabled === false" class="task-meta">不复习</text>
                  <!-- 优先级标签（V5.21）：轻点就地循环调整 低 → 中 → 高（排期随之后续生效） -->
                  <text class="prio-chip" @click="onPrioClick(item.task)">{{ PRIORITY_TEXT[item.task.priority] }}优先</text>
                </view>
              </view>

              <view class="task-acts">
                <!-- 已完成的步骤（V5.44）：只留橡皮——步骤随目标一起收藏，
                     不再单独收进册子；橡皮 = 抹去（彻底删除，行内确认） -->
                <template v-if="item.task.status === 'done'">
                  <template v-if="confirmingWipeTaskId === item.task.id">
                    <text class="act act--strong" @click="wipeTask(item.task)">确认抹去</text>
                    <text class="act" @click="confirmingWipeTaskId = ''">取消</text>
                  </template>
                  <template v-else>
                    <view class="act-icon" hover-class="act-icon--pressed" @click="onWipeClick(item.task)">
                      <DoodleIcon name="wipe" :size="44" />
                    </view>
                  </template>
                </template>
                <template v-else>
                  <text class="act" @click="onScheduleClick(item.task)">安排</text>
                  <text class="act" @click="onEditClick(item.task)">编辑</text>
                </template>
              </view>
            </view>

            <!-- 安排到某天（行内展开，替代 ActionSheet） -->
            <view v-if="schedulingTaskId === item.task.id" class="sched">
              <template v-if="!pickingCustomDate">
                <text class="sched-note">安排到：</text>
                <view class="sched-opts">
                  <text class="act act--strong" @click="quickSchedule(item.task, 0)">今天</text>
                  <text class="act act--strong" @click="quickSchedule(item.task, 1)">明天</text>
                  <text class="act act--strong" @click="quickSchedule(item.task, 2)">后天</text>
                  <text class="act" @click="openCustomDate">选日期</text>
                  <text class="act" @click="cancelSchedule">取消</text>
                </view>
              </template>
              <template v-else>
                <uni-datetime-picker
                  class="date-picker"
                  type="date"
                  :model-value="scheduleDate"
                  @change="onScheduleDateChange"
                >
                  <view class="date-trigger">
                    {{ scheduleDate ? friendlyDate(scheduleDate) + '（' + deadlineText(scheduleDate) + '）' : '选择日期' }}
                  </view>
                </uni-datetime-picker>
                <view class="sched-opts">
                  <text class="act act--strong" @click="confirmSchedule">确认安排</text>
                  <text class="act" @click="cancelSchedule">取消</text>
                </view>
              </template>
            </view>
          </template>
        </view>
      </view>
    </template>

    <!-- 目标不存在（如从旧入口进入或已被删除） -->
    <view v-else class="empty">
      <text class="empty-line">目标不存在或已被删除</text>
      <view class="empty-acts">
        <text class="act act--strong" @click="goBack">返回上一页</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 目标详情页 —— 喜茶极简手绘风（DESIGN.md 强制规范）
 * ============================================================
 * 功能：目标信息与进度展示、任务的增删改（内联表单）、
 *      手动把任务安排到某一天（行内展开今天/明天/后天/自选，无需弹窗）。
 *
 * V5.32：完成只发生在今日——本页只呈现完成状态，不提供完成入口
 *      （步骤圆点只作状态显示；目标完成状态随步骤自动同步）。
 *
 * 页面是「编排层」：级联清理等多步操作用例在此组合调用多个 store，
 * 数学与校验逻辑一律来自 services/ 纯函数。
 *
 * 视觉：纯白底 / 纯黑字 / 1px 线条，禁止卡片、圆角、阴影、彩色；
 *      所有操作（含删除确认、日期选择）一律行内完成，全程零弹窗。
 */
import { computed, nextTick, reactive, ref } from 'vue';
import { onLoad, onReady, onShow } from '@dcloudio/uni-app';
import DoodleIcon from '@/components/DoodleIcon.vue';
import ProgressLine from '@/components/ProgressLine.vue';
import { useGoalDelete } from '@/composables/useGoalDelete';
import type { Priority, Task } from '@/types/models';
import { useGoalStore } from '@/stores/goal';
import { usePlanStore } from '@/stores/plan';
import { useTaskStore } from '@/stores/task';
import { REVIEW_INTERVALS_DAYS } from '@/services/constants';
import { calcGoalProgress, deadlineText, sortTasks } from '@/services/goal';
import { TITLE_MAX_LENGTH, validateTaskDraft } from '@/services/validate';
import { addDays, diffDays, formatDate, friendlyDate, fullDateText, todayStr } from '@/utils/date';
import { darkActive, syncNavBar } from '@/utils/theme';

const goalStore = useGoalStore();
const taskStore = useTaskStore();
const planStore = usePlanStore();
const { deleteGoalCascade } = useGoalDelete();

/** 路由参数中的目标 id */
const goalId = ref('');
/** 从列表「＋ 添加步骤」进来：自动展开新增表单（V5.35） */
const autoAddStep = ref(false);
onLoad((query) => {
  goalId.value = query?.id ?? '';
  autoAddStep.value = query?.add === '1';
});

onReady(() => {
  if (!autoAddStep.value) {
    return;
  }
  // 表单落在未完成段末尾，滚过去让它正好在眼前
  openTaskForm();
  nextTick(() => scrollIntoViewSoft('#step-form'));
});

onShow(() => {
  syncNavBar();
  // V5.32：完成只发生在今日——进页面时兜底同步一次目标状态
  taskStore.syncAllGoalStatuses();
  // V5.30：从编辑页删掉目标后返回本页 → 目标已不存在，自动退出，不留空白页
  if (goalId.value && !goalStore.getById(goalId.value)) {
    if (getCurrentPages().length > 1) {
      uni.navigateBack();
    } else {
      uni.switchTab({ url: '/pages/goal/list' });
    }
  }
});

const goal = computed(() => goalStore.getById(goalId.value));

/** 该目标下的全部步骤（含已归档：归档计入进度历史，但不出现在列表里） */
const allTasks = computed(() => taskStore.listByGoal(goalId.value));
/** 列表展示的步骤：已归档的住进「成就收藏集」，从当前列表消失 */
const tasks = computed(() => allTasks.value.filter((t) => t.status !== 'archived'));
/** 进度（V5.22：归档不让进度倒退） */
const progress = computed(() => calcGoalProgress(allTasks.value));

/** 进度文案（模板里只做展示；没拆步骤 = 目标本身就是一步，V5.31） */
const progressText = computed(() => {
  const p = progress.value;
  return p.totalTasks === 0
    ? '本身就是一步'
    : `步骤进度 ${p.doneTasks}/${p.totalTasks} · ${p.percent}%`;
});

/** 截止提醒（今天是截止日或已逾期 → 该段文字加深为纯黑） */
const deadlineAlert = computed(() => {
  const g = goal.value;
  return !!g && g.status !== 'completed' && !!g.deadline && diffDays(todayStr(), g.deadline) <= 0;
});

/** 元信息行：分类 · 截止 · 优先级 · 预算 · 每日时长（分隔符直接拼进文本） */
const goalMeta = computed(() => {
  const g = goal.value;
  if (!g) {
    return [] as { text: string; alert: boolean }[];
  }
  const parts: { text: string; alert: boolean }[] = [];
  if (g.category) {
    parts.push({ text: g.category, alert: false });
  }
  if (g.status === 'completed') {
    parts.push({ text: '已完成', alert: false });
  } else {
    parts.push(
      g.deadline
        ? { text: `${fullDateText(g.deadline)}（${deadlineText(g.deadline)}）`, alert: deadlineAlert.value }
        : { text: '未设置截止', alert: false },
    );
    parts.push({ text: `${PRIORITY_TEXT[g.priority]}优先`, alert: false });
  }
  if (g.totalMinutes > 0) {
    parts.push({ text: `预算 ${Math.round((g.totalMinutes / 60) * 10) / 10} 小时`, alert: false });
  }
  if ((g.dailyMinutes ?? 0) > 0) {
    parts.push({ text: `每天 ${g.dailyMinutes} 分钟`, alert: false });
  }
  return parts.map((part, idx) => ({
    text: (idx > 0 ? ' · ' : '') + part.text,
    alert: part.alert,
  }));
});

/** 优先级中文 */
const PRIORITY_TEXT: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

const PRIORITY_OPTIONS: { label: string; value: Priority }[] = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
];

/** 优先级循环顺序：轻点标签 = 低 → 中 → 高 → 低（V5.21 步骤级就地调整） */
const PRIORITY_CYCLE: Priority[] = ['low', 'medium', 'high'];

/* ==================== 目标级操作 ==================== */

function goEditGoal(): void {
  uni.navigateTo({ url: `/pages/goal/edit?id=${goalId.value}` });
}

/** 「删除」的行内确认态（V5.46：进行中 / 已完成的目标都能删） */
const confirmingDeleteGoal = ref(false);

/** 删除确认文案（与编辑页同一句话） */
const deleteNote = computed(() => {
  const g = goal.value;
  if (!g) {
    return '';
  }
  const parts: string[] = [];
  const stepCount = allTasks.value.filter((t) => t.status !== 'archived').length;
  if (stepCount > 0) {
    parts.push(`${stepCount} 个学习步骤`);
  }
  const tail = parts.length > 0 ? `及其下 ${parts.join('、')}` : '';
  return `将删除「${g.title}」${tail}、未完成的安排与复习计划，且不可恢复。`;
});

/**
 * 收入囊中（V5.23）：把已完成的目标收进成就收藏集——
 * 目标连同它的已完成步骤一起落进册子，从目标列表消失。
 */
function onGoalArchive(): void {
  const g = goal.value;
  if (!g || g.status !== 'completed') {
    return;
  }
  const count = goalStore.archiveGoal(g.id);
  uni.showToast({
    title: count > 0 ? `已收入囊中 · 目标 + ${count} 个步骤` : '已收入囊中',
    icon: 'none',
  });
  // 目标已离开列表，短暂停留后回到上一页看它消失
  setTimeout(() => goBack(), 450);
}

/**
 * 删除目标（V5.46：进行中也能删；与编辑页「删除目标」同一套级联，`useGoalDelete` 共用）：
 * 计划条目 / 复习计划 / 未归档步骤 → 软删除；目标 → 软删除。
 * （已归档的步骤不在此列——收藏进册子的回忆不随目标删除而抹去。）
 */
function onGoalDelete(): void {
  const g = goal.value;
  if (!g) {
    return;
  }
  deleteGoalCascade(g.id);
  uni.showToast({ title: '已删除', icon: 'none' });
  setTimeout(() => goBack(), 450);
}

/* ==================== 任务表单（新增 / 编辑共用） ==================== */

const formVisible = ref(false);
/** 编辑中的任务 id（'' = 新增模式） */
const editingTaskId = ref('');
/** 删除任务的行内确认态 */
const confirmingDeleteTask = ref(false);
const taskForm = reactive({
  title: '',
  estimateMinutes: '',
  priority: 'medium' as Priority,
  reviewEnabled: true,
});

/** 复习间隔提示（数字取自间隔表，改排程时文案自动跟随） */
const reviewHintText = computed(
  () => `默认按 ${REVIEW_INTERVALS_DAYS.slice(0, 4).join('、')}… 天提醒回顾；一次性步骤可以关掉`,
);

function toggleTaskForm(): void {
  if (formVisible.value && !editingTaskId.value) {
    formVisible.value = false;
    return;
  }
  openTaskForm();
}

/** 打开表单：传 task 为编辑模式（贴着该步骤），不传为新增模式（未完成段末尾） */
function openTaskForm(task?: Task): void {
  formVisible.value = true;
  confirmingDeleteTask.value = false;
  if (task) {
    editingTaskId.value = task.id;
    taskForm.title = task.title;
    taskForm.estimateMinutes = String(task.estimateMinutes);
    taskForm.priority = task.priority;
    taskForm.reviewEnabled = task.reviewEnabled !== false;
    scrollIntoViewSoft(`#task-${task.id}`);
  } else {
    editingTaskId.value = '';
    taskForm.title = '';
    taskForm.estimateMinutes = '';
    taskForm.priority = 'medium';
    taskForm.reviewEnabled = true;
    scrollIntoViewSoft('#step-form');
  }
}

function cancelTaskForm(): void {
  formVisible.value = false;
  editingTaskId.value = '';
  confirmingDeleteTask.value = false;
}

/** 保存任务（校验 → 新增或更新；保存后就地落位：闪光 + 滚入视野） */
function saveTask(): void {
  const rawMinutes = taskForm.estimateMinutes.trim();
  const minutes = rawMinutes === '' ? undefined : Number(rawMinutes);

  const error = validateTaskDraft({ title: taskForm.title, estimateMinutes: minutes });
  if (error) {
    uni.showToast({ title: error, icon: 'none' });
    return;
  }

  if (editingTaskId.value) {
    const id = editingTaskId.value;
    taskStore.updateTask(id, {
      title: taskForm.title.trim(),
      priority: taskForm.priority,
      reviewEnabled: taskForm.reviewEnabled,
      // undefined 时不覆盖原预估时长
      ...(minutes !== undefined ? { estimateMinutes: Math.round(minutes) } : {}),
    });
    cancelTaskForm();
    flashRow(id);
    scrollIntoViewSoft(`#task-${id}`);
    uni.showToast({ title: '已保存', icon: 'none' });
    return;
  }

  // 新增：表单留存、输入清空——连续添加时新步骤会依次落在表单上方
  const created = taskStore.addTask({
    goalId: goalId.value,
    title: taskForm.title.trim(),
    estimateMinutes: minutes === undefined ? undefined : Math.round(minutes),
    priority: taskForm.priority,
    reviewEnabled: taskForm.reviewEnabled,
  });
  taskForm.title = '';
  taskForm.estimateMinutes = '';
  taskForm.priority = 'medium';
  taskForm.reviewEnabled = true;
  flashRow(created.id);
  scrollIntoViewSoft('#step-form');
  uni.showToast({ title: '已添加', icon: 'none' });
}

/** 删除任务（彻底删除：任务本体与其计划条目、复习项一并物理移除；确认由行内两段式状态承担） */
function deleteTask(): void {
  const task = taskStore.getById(editingTaskId.value);
  if (!task) {
    return;
  }
  taskStore.deleteTask(task.id);
  cancelTaskForm();
  uni.showToast({ title: '已删除', icon: 'none' });
}

/* ==================== 抹去（V5.44：步骤不再单独收藏） ==================== */

/** 「抹去」的行内确认态：正在确认抹去哪一个任务（'' = 无） */
const confirmingWipeTaskId = ref('');

/** 抹去：物理删除，不留痕迹（计划条目与复习项一并物理清理） */
function wipeTask(task: Task): void {
  taskStore.deleteTask(task.id);
  confirmingWipeTaskId.value = '';
  if (editingTaskId.value === task.id) {
    cancelTaskForm();
  }
  uni.showToast({ title: '已抹去', icon: 'none' });
}

/** 轻点橡皮：进入抹去确认 */
function onWipeClick(task: Task): void {
  confirmingWipeTaskId.value = task.id;
}

/* ==================== 步骤列表 + 落位反馈（V5.4） ==================== */

/** 列表渲染项：步骤行 / 就地表单 */
type StepListItem = { kind: 'task'; task: Task } | { kind: 'form' };

/** 渲染序列：表单就地插入——新增 = 未完成段末尾（新步骤的落点），编辑 = 被编辑步骤之后 */
const stepItems = computed<StepListItem[]>(() => {
  const list: StepListItem[] = sortTasks(tasks.value).map((task) => ({ kind: 'task', task }));
  if (!formVisible.value) {
    return list;
  }
  let insertAt: number;
  if (editingTaskId.value) {
    const idx = list.findIndex((it) => it.kind === 'task' && it.task.id === editingTaskId.value);
    insertAt = idx >= 0 ? idx + 1 : list.length;
  } else {
    let lastOpen = -1;
    list.forEach((it, idx) => {
      if (it.kind === 'task' && it.task.status !== 'done') {
        lastOpen = idx;
      }
    });
    insertAt = lastOpen + 1;
  }
  list.splice(insertAt, 0, { kind: 'form' });
  return list;
});

/** 刚落位的步骤 id（闪一记淡暖光） */
const flashTaskId = ref('');
let flashTimer: ReturnType<typeof setTimeout> | null = null;

function flashRow(taskId: string): void {
  flashTaskId.value = taskId;
  if (flashTimer !== null) {
    clearTimeout(flashTimer);
  }
  flashTimer = setTimeout(() => {
    flashTimer = null;
    flashTaskId.value = '';
  }, 1400);
}

/** 把元素滚进视口（统一策略：顶端对齐视口上缘下方约 80px；已接近到位则不滚） */
function scrollIntoViewSoft(selector: string): void {
  nextTick(() => {
    uni
      .createSelectorQuery()
      .select(selector)
      .boundingClientRect((res) => {
        const rect = (Array.isArray(res) ? res[0] : res) as { top: number } | undefined;
        if (!rect) {
          return;
        }
        const delta = rect.top - 80;
        if (Math.abs(delta) <= 24) {
          return;
        }
        uni
          .createSelectorQuery()
          .selectViewport()
          .scrollOffset((res2) => {
            const offset = (Array.isArray(res2) ? res2[0] : res2) as { scrollTop: number } | undefined;
            if (!offset) {
              return;
            }
            const target = Math.max(0, offset.scrollTop + delta);
            // #ifdef H5
            // H5 上 uni.pageScrollTo 不能可靠滚动文档（实测几乎不动），用原生平滑滚动
            window.scrollTo({ top: target, behavior: 'smooth' });
            // #endif
            // #ifndef H5
            uni.pageScrollTo({ scrollTop: target, duration: 220 });
            // #endif
          })
          .exec();
      })
      .exec();
  });
}

/* ==================== 步骤行的就地编辑（V5.32：完成只发生在今日，这里只编排） ==================== */

function onEditClick(task: Task): void {
  openTaskForm(task);
}

function onScheduleClick(task: Task): void {
  startSchedule(task);
}

/** 轻点优先级标签：就地循环调整（低 → 中 → 高）——任务池是唯一数据源，排期随之后续生效 */
function onPrioClick(task: Task): void {
  const next = PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(task.priority) + 1) % PRIORITY_CYCLE.length];
  taskStore.updateTask(task.id, { priority: next });
  uni.showToast({ title: `优先级：${PRIORITY_TEXT[next]}`, icon: 'none' });
}

/* ==================== 手动安排到某天（行内展开） ==================== */

/** 正在安排中的任务 id（'' = 无展开） */
const schedulingTaskId = ref('');
/** 是否处于自选日期阶段（false = 今天/明天/后天快捷选择） */
const pickingCustomDate = ref(false);
const scheduleDate = ref('');
const schedulingTask = computed(() => taskStore.getById(schedulingTaskId.value) || null);

/** 点击「安排」：展开行内选择（再点一次同一任务 = 收起） */
function startSchedule(task: Task): void {
  if (schedulingTaskId.value === task.id) {
    cancelSchedule();
    return;
  }
  schedulingTaskId.value = task.id;
  pickingCustomDate.value = false;
  scheduleDate.value = '';
}

/** 快捷安排：0 = 今天，1 = 明天，2 = 后天 */
function quickSchedule(task: Task, offset: number): void {
  doSchedule(task, addDays(todayStr(), offset));
  cancelSchedule();
}

/** 展开自选日期（默认明天） */
function openCustomDate(): void {
  pickingCustomDate.value = true;
  scheduleDate.value = addDays(todayStr(), 1);
}

function cancelSchedule(): void {
  schedulingTaskId.value = '';
  pickingCustomDate.value = false;
  scheduleDate.value = '';
}

/** 日期回调：归一为 yyyy-MM-dd（兼容 string / timestamp） */
function onScheduleDateChange(value: string | number | string[] | undefined): void {
  if (typeof value === 'number') {
    scheduleDate.value = formatDate(new Date(value));
    return;
  }
  scheduleDate.value = typeof value === 'string' ? value.slice(0, 10) : '';
}

function confirmSchedule(): void {
  const task = schedulingTask.value;
  if (!task) {
    return;
  }
  if (!scheduleDate.value) {
    uni.showToast({ title: '请选择日期', icon: 'none' });
    return;
  }
  doSchedule(task, scheduleDate.value);
  cancelSchedule();
}

/** 落库：往某天追加一条计划（同日同任务允许多条，提示为「追加」） */
function doSchedule(task: Task, date: string): void {
  const exists = planStore.listByDate(date).some((i) => i.taskId === task.id);
  planStore.addItem({
    date,
    taskId: task.id,
    goalId: goalId.value,
    plannedMinutes: task.estimateMinutes,
  });
  uni.showToast({
    title: `${exists ? '已追加到' : '已安排到'} ${friendlyDate(date)}`,
    icon: 'none',
  });
}

/** 返回上一页（兼容 H5 深链接/刷新直达本页：栈内无上一页时回「目标」列表） */
function goBack(): void {
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
    return;
  }
  uni.switchTab({ url: '/pages/goal/list' });
}
</script>

<style lang="scss" scoped>
/**
 * 目标详情页样式：极简手绘风（DESIGN.md V3.0）
 * 灰度体系：纯白底 / 纯黑正文 / #888 辅助；线条一律 1px、主色 #3A3A3A。
 */

.detail {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 96rpx 32rpx 160rpx; /* V3.0：左右安全边距 32rpx */
  background-color: #ffffff;
  color: #000000;
}

/* ==================== ① 目标头部 ==================== */

.title {
  display: block;
  font-size: 40rpx;
  line-height: 1.4;
  font-weight: 500;
  color: #000000;
}

.title--done {
  color: #888888;
  text-decoration: line-through;
}

.meta {
  margin-top: 20rpx;
  font-size: 24rpx;
  line-height: 1.5;
}

.meta-part {
  color: #888888;
}

/* 今天截止 / 已逾期：用黑色加深，不用彩色 */
.meta-part--alert {
  color: #000000;
}

.desc {
  display: block;
  margin-top: 24rpx;
  font-size: 28rpx;
  letter-spacing: 0.05em;
  line-height: 1.8;
  color: #888888;
}

/* ==================== ② 进度（1px 细线，灰轨深灰线） ==================== */

.progress {
  margin-top: 56rpx;
}

.progress-text {
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
  font-variant-numeric: tabular-nums;
}

/* 进度：1px 虚线（深灰虚线已完成段 + #EEEEEE 虚线未完成段，无填充色块） */
.progress-line {
  margin-top: 16rpx;
}

/* ==================== ③ 目标级操作 ==================== */

.goal-acts {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 48rpx;
  margin-left: -28rpx;
}

/* ==================== 通用纯文字动作（隐形热区 ≥ 44px） ==================== */

.act {
  padding: 18rpx 28rpx;
  font-size: 28rpx;
  line-height: 1.4;
  color: #888888;
}

/* V4.1 暖色按压反馈：浅暖橘底 */
.act:active {
  background-color: rgba(245, 213, 184, 0.3);
}

.act--strong {
  color: #000000;
}

/* ==================== ④ 任务区 ==================== */

.sec-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-top: 128rpx;
}

.section-title {
  font-size: 26rpx;
  letter-spacing: 6rpx;
  color: #000000;
}

.sec-act {
  margin-right: -28rpx;
}

/* ==================== 步骤列表（V5.4） ==================== */
/* 任务表单：输入 = 一行字 + 1px 底线 */
.task-form {
  margin-top: 40rpx;
}

.field {
  margin-bottom: 44rpx;
}

.field-label {
  display: block;
  margin-bottom: 8rpx;
  font-size: 24rpx;
  letter-spacing: 2rpx;
  color: #888888;
}

/* V5.41：复习开关＝一行说明 + 手绘小拨杆（整行可点，热区比拨杆大） */
.field--switch {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 44rpx;
  padding: 12rpx 0;
  border-radius: 8rpx;
}

.field--switch:active {
  background-color: rgba(245, 213, 184, 0.3);
}

.switch-text {
  flex: 1;
  min-width: 0;
  padding-right: 24rpx;
}

.field-label--switch {
  margin-bottom: 6rpx;
  font-size: 26rpx;
  letter-spacing: 0;
  color: #000000;
}

.field-hint {
  display: block;
  font-size: 22rpx;
  line-height: 1.5;
  color: #888888;
}

.switch {
  position: relative;
  flex-shrink: 0;
  width: 76rpx;
  height: 40rpx;
  box-sizing: border-box;
  border: 1px solid #3A3A3A;
  border-radius: 20rpx;
  transition: background-color 200ms ease;
}

.switch-knob {
  position: absolute;
  top: 4rpx;
  left: 4rpx;
  width: 30rpx;
  height: 30rpx;
  box-sizing: border-box;
  border-radius: 50%;
  background-color: #3A3A3A;
  transition: transform 200ms ease, background-color 200ms ease;
}

.switch--on {
  background-color: #A2D9CE;
}

.switch--on .switch-knob {
  background-color: #FFFFFF;
  transform: translateX(36rpx);
}

/* 输入 = 一行字 + 1px 底线
 * 注意：uni-input 默认 height/min-height = 1.4em 且 overflow: hidden，
 * 加上上下 padding 后内容盒被压成 10px 高、文字被裁切；
 * 这里改为高度自适应，内层输入按行高 1.4em 撑开，文字垂直居中且完整显示。
 */
.field-input {
  width: 100%;
  height: auto;
  min-height: 0;
  box-sizing: border-box;
  padding: 16rpx 0;
  font-size: 30rpx;
  color: #000000;
  border-bottom: 1px solid #3A3A3A; /* V3.0 线条主色 */
  background-color: transparent;

  :deep(.uni-input-wrapper) {
    height: auto;
  }

  :deep(.uni-input-input) {
    height: 1.4em;
    color: #000000;
    font-size: 30rpx;
  }

  :deep(.uni-input-placeholder) {
    color: #888888;
    font-size: 30rpx;
  }
}

/* 文字选项（选中 = 黑字 + 1px 下划线） */
.opts {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}

.opt {
  margin-right: 56rpx;
  padding: 10rpx 0 14rpx;
  font-size: 28rpx;
  color: #888888;
  border-bottom: 1px solid transparent;
}

/* V4.1 暖色按压反馈：浅暖橘底 */
.opt:active {
  background-color: rgba(245, 213, 184, 0.3);
}

.opt--active {
  color: #000000;
  border-bottom-color: #000000;
}

/* 表单动作行 */
.form-acts {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 8rpx;
  margin-left: -28rpx;
}

.danger-note {
  display: block;
  margin-top: 24rpx;
  font-size: 28rpx;
  letter-spacing: 0.05em;
  line-height: 1.8;
  color: #888888;
}

/* ==================== 任务列表 ==================== */

.task-list {
  margin-top: 56rpx;
}

.task-item {
  margin-bottom: 72rpx;
}

.task-item:last-child {
  margin-bottom: 0;
}

.task-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  /* 滑动完成（触屏 / 桌面左键拖拽）时禁掉文字选中与长按菜单 */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* V5.33：完成圆点已撤除（步骤行不再有圆点） */

.task-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding-top: 28rpx;
}

.task-title {
  font-size: 30rpx;
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
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
}

/* 元信息行 = 时长 + 优先级标签（V5.21） */
.task-meta-line {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
}

/* 优先级标签：chip 形态一眼可点；轻点循环 低 → 中 → 高 */
.prio-chip {
  padding: 2rpx 14rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #3a3a3a;
  border: 1px solid #eeeeee;
  border-radius: 8rpx;
  transition: background-color 200ms ease, border-color 200ms ease;
}

.prio-chip:active {
  background-color: rgba(245, 213, 184, 0.3);
  border-color: #b89b5e;
}

.task-acts {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  margin-top: 10rpx;
  margin-right: -28rpx;
}

/* 已完成步骤的动作（V5.44）：步骤随目标收藏，这里只留橡皮 = 抹去（彻底删除） */
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

/* ==================== 行内安排（替代 ActionSheet） ==================== */

.sched {
  margin: 8rpx 0 0 54rpx;
}

.sched-note {
  display: block;
  font-size: 24rpx;
  color: #888888;
}

.sched-opts {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 4rpx;
  margin-left: -28rpx;
}

.date-picker {
  display: block;
  margin-top: 4rpx;
}

.date-trigger {
  display: block;
  padding: 16rpx 0;
  font-size: 30rpx;
  color: #000000;
  border-bottom: 1px solid #3A3A3A; /* V3.0 线条主色 */
}

/* ==================== 空态 ==================== */

.empty {
  margin-top: 120rpx;
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
  margin-top: 16rpx;
  font-size: 28rpx;
  letter-spacing: 0.05em;
  line-height: 1.8;
  color: #888888;
}

.empty-acts {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 20rpx;
  margin-left: -28rpx;
}

/* ==================== V5.4：就地表单 / 落位闪光 ==================== */

/* 表单标题：明确「新增步骤 / 编辑步骤」，避免与已有步骤混淆 */
.form-title {
  display: block;
  margin-bottom: 24rpx;
  font-size: 24rpx;
  letter-spacing: 6rpx;
  color: #000000;
}

/* 表单已就地插在列表项之间，不再需要与页顶相接的上边距 */
.task-form {
  margin-top: 0;
}

/* 新增 / 编辑保存后：落位行闪一记淡暖光（纸上的一记回应） */
.task-item--flash {
  animation: step-flash 1300ms ease-out;
}

@keyframes step-flash {
  from {
    background-color: var(--step-flash, rgba(245, 213, 184, 0.32));
  }

  to {
    background-color: transparent;
  }
}
</style>
