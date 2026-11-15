<template>
  <view class="edit" :class="{ 'theme-dark': darkActive }">
    <!-- ① 写下目标：大输入 + 1px 虚线 + 右侧铅笔（光标进来 = 书写，笔飞到底部书上） -->
    <view class="title-block">
      <input
        v-model="form.title"
        class="title-input"
        :maxlength="TITLE_MAX_LENGTH"
        placeholder="写下你的学习目标"
        @focus="onTitleFocus"
        @blur="onTitleBlur"
      />
      <view class="title-doodle" :class="{ 'is-writing': writing }" :style="pencilFlyStyle">
        <DoodleIcon name="pencil" :size="150" />
      </view>
    </view>

    <!-- ③ 属性胶囊：浅马卡龙底的贴纸，点开就地展开，同一时间只开一个 -->
    <view class="caps-row">
      <text
        class="cap cap--mint"
        :class="{ 'cap--set': !!form.deadline, 'cap--open': openPanel === 'deadline' }"
        hover-class="cap--pressed"
        @click="togglePanel('deadline')"
      >{{ capsText.deadline }}</text>
      <text
        class="cap cap--pink"
        :class="{ 'cap--set': form.priority !== 'medium', 'cap--open': openPanel === 'priority' }"
        hover-class="cap--pressed"
        @click="togglePanel('priority')"
      >{{ capsText.priority }}</text>
      <text
        class="cap cap--yellow"
        :class="{ 'cap--set': form.dailyMinutes > 0, 'cap--open': openPanel === 'daily' }"
        hover-class="cap--pressed"
        @click="togglePanel('daily')"
      >{{ capsText.daily }}</text>
      <text
        class="cap cap--blue"
        :class="{ 'cap--set': !!form.category, 'cap--open': openPanel === 'category' }"
        hover-class="cap--pressed"
        @click="togglePanel('category')"
      >{{ capsText.category }}</text>
    </view>

    <!-- 截止日选项（1/2/3/6 个月 + 自定义；再点已选中的一次 = 取消） -->
    <view v-if="openPanel === 'deadline'" class="panel">
      <view class="opts">
        <text
          v-for="d in DURATION_OPTIONS"
          :key="d.days"
          class="pill"
          :class="{ 'pill--active': presetDays === d.days }"
          hover-class="pill--pressed"
          @click="pickDuration(d.days)"
        >{{ d.label }}</text>
        <text
          class="pill"
          :class="{ 'pill--active': customOpen }"
          hover-class="pill--pressed"
          @click="pickCustom"
        >自定义</text>
      </view>
      <uni-datetime-picker
        v-if="customOpen"
        class="date-picker"
        type="date"
        :model-value="form.deadline"
        @change="onDeadlineChange"
      >
        <view class="date-trigger" :class="{ 'date-trigger--empty': !form.deadline }">
          {{ customTriggerText }}
        </view>
      </uni-datetime-picker>
      <text v-if="deadlineHint" class="panel-hint">{{ deadlineHint }}</text>
    </view>

    <!-- 优先级选项 -->
    <view v-else-if="openPanel === 'priority'" class="panel">
      <view class="opts">
        <text
          v-for="p in PRIORITY_OPTIONS"
          :key="p.value"
          class="pill"
          :class="{ 'pill--active': form.priority === p.value }"
          hover-class="pill--pressed"
          @click="pickPriority(p.value)"
        >{{ p.label }}</text>
      </view>
    </view>

    <!-- 每日学习时长（再点已选中的一次 = 取消；自定义行内输入，选完即合） -->
    <view v-else-if="openPanel === 'daily'" class="panel">
      <view class="opts">
        <text
          v-for="m in DAILY_OPTIONS"
          :key="m"
          class="pill"
          :class="{ 'pill--active': form.dailyMinutes === m }"
          hover-class="pill--pressed"
          @click="pickDaily(m)"
        >{{ m }} 分钟</text>
        <text
          class="pill"
          :class="{ 'pill--active': customDailyOpen }"
          hover-class="pill--pressed"
          @click="pickDailyCustom"
        >自定义</text>
      </view>
      <view v-if="customDailyOpen" class="daily-add">
        <input
          v-model="dailyCustomInput"
          class="daily-input"
          type="number"
          placeholder="输入分钟数"
          confirm-type="done"
          @confirm="applyDailyCustom"
        />
        <text class="daily-unit">分钟</text>
        <text
          class="daily-ok"
          :class="{ 'daily-ok--on': !!dailyCustomInput.trim() }"
          @click="applyDailyCustom"
        >确定</text>
      </view>
    </view>

    <!-- 分类选项（再点已选中的一次 = 取消） -->
    <view v-else-if="openPanel === 'category'" class="panel">
      <view class="opts">
        <text
          v-for="c in CATEGORY_PRESETS"
          :key="c"
          class="pill"
          :class="{ 'pill--active': form.category === c }"
          hover-class="pill--pressed"
          @click="pickCategory(c)"
        >{{ c }}</text>
      </view>
    </view>

    <!-- ④ 新建模式：学习步骤（可选）——写了就是大目标，不写就是小目标 -->
    <view v-if="!isEdit" class="steps">
      <text class="steps-title">学习步骤（可选）</text>
      <!-- 引导分两行轻轻地说（同一套字号与颜色，只是换行）：像便签上随手写的一句批注 -->
      <text class="steps-note">或许你需要将目标拆分成步骤</text>
      <text class="steps-note">不过，这取决于你。</text>

      <!-- 已经写下的步骤（点 × 划掉，落库前还能改） -->
      <view v-for="(t, idx) in stepDrafts" :key="`step-${idx}-${t}`" class="step-row">
        <text class="step-dot" />
        <text class="step-name">{{ t }}</text>
        <text class="step-act" @click="removeStepDraft(idx)">×</text>
      </view>

      <!-- 添加一行：一条虚线留给下面一条（点整行都聚焦，键盘自己弹起来） -->
      <view class="step-add" @click="focusStepInput">
        <input
          v-model="stepDraft"
          class="step-input"
          :maxlength="TITLE_MAX_LENGTH"
          :focus="stepFocus"
          placeholder="( ˙▿˙ )"
          confirm-type="done"
          confirm-hold
          @focus="onStepFocus"
          @blur="onStepBlur"
          @confirm="addStepDraft"
        />
        <text
          class="step-add-btn"
          :class="{ 'step-add-btn--on': !!stepDraft.trim() }"
          @click="addStepDraft"
        >加入</text>
      </view>
    </view>

    <!-- 页底插画：一本书（书写时书翻开、右页写起来；写完合上。拿笔的是标题右侧那支铅笔） -->
    <view class="page-doodle" :class="{ 'is-writing': writing }">
      <DoodleIcon name="book-write" width="192rpx" />
    </view>

    <!-- 编辑模式：删除目标（行内两段式确认，不弹窗；其下步骤一起离开） -->
    <view v-if="isEdit" class="danger-zone">
      <view v-if="!confirmingDelete" class="acts-row">
        <text class="act" @click="confirmingDelete = true">删除目标</text>
      </view>
      <template v-else>
        <text class="danger-note">{{ deleteNote }}</text>
        <view class="acts-row">
          <text class="act act--strong" @click="onDelete">确认删除</text>
          <text class="act" @click="confirmingDelete = false">取消</text>
        </view>
      </template>
    </view>

    <!-- 底部主行动：手绘抖动框（与目标页「新建学习目标」同族） -->
    <view class="cta-wrap">
      <view class="cta" hover-class="cta--pressed" @click="onSave">
        <HandFrame />
        <text class="cta-text">{{ isEdit ? '保存修改' : '创建目标' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 目标编辑页（新建 / 编辑共用）—— 一张手账便签（DESIGN.md V5.30 / V5.30b / V5.37 / V5.38）
 * ============================================================
 * 路由参数：?id=xxx 表示编辑模式，无参数为新建。
 * 页面结构：① 大输入 + 1px 虚线（右侧铅笔插画，颜色退成背景）；
 * ② 属性贴纸胶囊（截止日 / 优先级 / 每日学习时长 / 分类，点开就地展开，零弹窗）；
 * ③ 新建时的「学习步骤（可选）」区（V5.38：写了就是大目标，不写就是小目标）；
 * ④ 页底插画（一本书：光标进标题输入框，标题右侧那支铅笔就飞下去写、书翻开；失焦后笔回原位、书合上）。
 * V5.37：只有目标与步骤两层——不再有「小目标 / 大目标」与分组。
 *
 * 校验走 services/validate.ts 纯函数；落库走 goal store；
 * 删除的级联清理走 composables/useGoalDelete.ts（与详情页 / 列表页共用）。
 */
import { computed, nextTick, onUnmounted, reactive, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import type { GoalDraft, Priority } from '@/types/models';
import DoodleIcon from '@/components/DoodleIcon.vue';
import HandFrame from '@/components/HandFrame.vue';
import { useGoalDelete } from '@/composables/useGoalDelete';
import { useGoalStore } from '@/stores/goal';
import { useTaskStore } from '@/stores/task';
import { deadlineText } from '@/services/goal';
import { TITLE_MAX_LENGTH, validateGoalDraft } from '@/services/validate';
import { addDays, diffDays, friendlyDate, todayStr } from '@/utils/date';
import { darkActive, syncNavBar } from '@/utils/theme';

const goalStore = useGoalStore();
const taskStore = useTaskStore();
const { deleteGoalCascade } = useGoalDelete();

/** 编辑模式下的目标 id（'' = 新建） */
const goalId = ref('');
const isEdit = computed(() => !!goalId.value);

/** 表单模型（description / totalMinutes / color 不出现在界面上，
 *  但编辑时原样保留，避免静默丢失历史字段） */
const form = reactive({
  title: '',
  description: '',
  category: '',
  deadline: '',
  totalMinutes: 0,
  dailyMinutes: 0,
  priority: 'medium' as Priority,
  color: '',
});

/** 分类快捷选项（选填） */
const CATEGORY_PRESETS = ['英语', '数学', '编程', '考试', '阅读', '其他'];

/* ==================== 页底插画：铅笔飞下去写字 ==================== */

/**
 * 书写中：光标在标题输入框**或**步骤输入框里闪就是「在写」——哪怕还没落字。
 * 笔从标题右侧起飞、落到书页上；书在同一刻翻开。
 * 离开整张便签 = 写完了：笔飞回原位，书本晚半拍合上。
 */
const writing = ref(false);

/** 笔尖在 pencil.svg 里的位置（viewBox 200×200 的 (55,172)） */
const PENCIL_TIP_X = 0.275;
const PENCIL_TIP_Y = 0.86;
/** 书本右页的落笔点（book-write.svg 的 viewBox 44 49 148 59 里 (152,82.5) 处——右页涂鸦上） */
const BOOK_SPOT_X = (152 - 44) / 148;
const BOOK_SPOT_Y = (82.5 - 49) / 59;

/** 笔从原位到落笔点的位移（px），写进 CSS 变量交给 transform */
const flyX = ref(0);
const flyY = ref(0);

const pencilFlyStyle = computed(() => ({
  '--fly-x': `${Math.round(flyX.value)}px`,
  '--fly-y': `${Math.round(flyY.value)}px`,
}));

/** 焦点轮次：量尺和起飞是异步的，中途失焦就作废（避免笔落在旧位置上） */
let flightToken = 0;

/** 收笔的延迟：焦点常常只是从标题挪到了步骤输入框，别急着把笔叫回来 */
let stopTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 量一次两个框，把「笔尖 → 落笔点」算成位移（滚动时两者一起动，位移不受影响）。
 * 笔的位置取「布局盒」而不是渲染盒——笔正在飞的时候渲染盒是偏的，
 * 布局盒才是它回原位后该待的地方，落点才算得准。
 * 量完回调 apply()（H5 同步、其余端在查询回调里）。
 */
function measureFlight(apply: () => void): void {
  // #ifdef H5
  const pencilEl = document.querySelector('.title-doodle') as HTMLElement | null;
  const bookEl = document.querySelector('.page-doodle .doodle-icon') as HTMLElement | null;
  if (pencilEl && bookEl) {
    const base = (pencilEl.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    const homeLeft = (base ? base.left : 0) + pencilEl.offsetLeft;
    const homeTop = (base ? base.top : 0) + pencilEl.offsetTop;
    const book = bookEl.getBoundingClientRect();
    const tipX = homeLeft + pencilEl.offsetWidth * PENCIL_TIP_X;
    const tipY = homeTop + pencilEl.offsetHeight * PENCIL_TIP_Y;
    const spotX = book.left + book.width * BOOK_SPOT_X;
    const spotY = book.top + book.height * BOOK_SPOT_Y;
    flyX.value = spotX - tipX;
    flyY.value = spotY - tipY;
    apply();
    return;
  }
  // #endif
  // 其余端：退回渲染盒量尺
  uni
    .createSelectorQuery()
    .select('.title-doodle')
    .boundingClientRect()
    .select('.page-doodle .doodle-icon')
    .boundingClientRect()
    .exec((res) => {
      const [pencil, book] = res as Array<
        { left: number; top: number; width: number; height: number } | null
      >;
      if (pencil && book) {
        const tipX = pencil.left + pencil.width * PENCIL_TIP_X;
        const tipY = pencil.top + pencil.height * PENCIL_TIP_Y;
        const spotX = book.left + book.width * BOOK_SPOT_X;
        const spotY = book.top + book.height * BOOK_SPOT_Y;
        flyX.value = spotX - tipX;
        flyY.value = spotY - tipY;
      }
      apply();
    });
}

/** 开始写：量一次落点，把笔送下去（标题框 / 步骤框都算「在写」） */
function startWriting(): void {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (writing.value) {
    return; // 已经在写了：笔还在书上，别重算落点
  }
  const token = ++flightToken;
  nextTick(() => {
    if (token !== flightToken) {
      return;
    }
    measureFlight(() => {
      if (token !== flightToken) {
        return;
      }
      writing.value = true;
    });
  });
}

/** 离开输入框 = 写完了：笔回原位、书合上（晚一点收，焦点可能只是挪到了另一个框） */
function stopWriting(): void {
  if (stopTimer) {
    clearTimeout(stopTimer);
  }
  stopTimer = setTimeout(() => {
    stopTimer = null;
    flightToken += 1;
    writing.value = false;
  }, 180);
}

/** 标题输入框拿到焦点 = 开始写 */
function onTitleFocus(): void {
  startWriting();
}

/** 标题输入框失焦 */
function onTitleBlur(): void {
  stopWriting();
}

onUnmounted(() => {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
});

/** 优先级选项 */
const PRIORITY_OPTIONS: { label: string; value: Priority }[] = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
];

/** 每日学习时长快捷选项（分钟；再点已选中的一次 = 取消） */
const DAILY_OPTIONS = [15, 30, 45, 60, 90];

/* ==================== 属性胶囊展开面板 ==================== */

type PanelName = 'deadline' | 'priority' | 'daily' | 'category';

/** 当前展开的面板（'' = 全部收起；同一时间只开一个） */
const openPanel = ref<PanelName | ''>('');

function togglePanel(panel: PanelName): void {
  const opening = openPanel.value !== panel;
  openPanel.value = opening ? panel : '';
  if (!opening) {
    return;
  }
  // 面板本来就带着展开的自定义行时（回填 / 之前选过），一并滚进可见区
  if (panel === 'deadline' && customOpen.value) {
    scrollRowIntoView('.date-picker');
  }
  if (panel === 'daily' && customDailyOpen.value) {
    scrollRowIntoView('.daily-add');
  }
}

/** 行内展开自定义行后：被固定底部 CTA 挡住时轻轻滚上来（V5.30d） */
function scrollRowIntoView(selector: string): void {
  nextTick(() => {
    uni
      .createSelectorQuery()
      .select(selector)
      .boundingClientRect((res) => {
        const rect = (Array.isArray(res) ? res[0] : res) as { bottom: number } | undefined;
        if (!rect) {
          return;
        }
        // 固定 CTA（按钮 + 内边距 + 安全区）在视口下缘占用的让位余量
        const margin = uni.upx2px(260);
        const overflow = rect.bottom - (uni.getSystemInfoSync().windowHeight - margin);
        if (overflow <= 8) {
          return; // 已经看得见
        }
        uni
          .createSelectorQuery()
          .selectViewport()
          .scrollOffset((res2) => {
            const offset = (Array.isArray(res2) ? res2[0] : res2) as { scrollTop: number } | undefined;
            if (!offset) {
              return;
            }
            const target = Math.max(0, offset.scrollTop + overflow);
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

/** 胶囊上的字：未设值 = 邀请语；已设值 = 只说结果 */
const capsText = computed(() => ({
  deadline: form.deadline ? `截止 · ${deadlineText(form.deadline)}` : '设定截止日',
  priority: form.priority === 'medium' ? '设定优先级' : form.priority === 'low' ? '低优先级' : '高优先级',
  daily: form.dailyMinutes > 0 ? `每天 · ${form.dailyMinutes} 分钟` : '每日学习时长',
  category: form.category || '添加分类',
}));

/* ==================== 计划完成时间（快捷 + 自定义） ==================== */

interface DurationOption {
  label: string;
  days: number;
}

/** 快捷时长（30 天 ≈ 1 个月） */
const DURATION_OPTIONS: DurationOption[] = [
  { label: '1 个月', days: 30 },
  { label: '2 个月', days: 60 },
  { label: '3 个月', days: 90 },
  { label: '6 个月', days: 180 },
];

/** 新建默认：3 个月 */
const DEFAULT_DAYS = 90;

/** 当前高亮的快捷时长（null = 自定义或未设置） */
const presetDays = ref<number | null>(null);
/** 是否展开自定义日期（行内展开，不弹窗） */
const customOpen = ref(false);
/** 每日学习时长：自定义输入行（行内展开，选完即合；V5.30d） */
const customDailyOpen = ref(false);
/** 每日学习时长：自定义输入值 */
const dailyCustomInput = ref('');
/** 删除确认（行内两段式） */
const confirmingDelete = ref(false);

onLoad((query) => {
  const raw = query?.id;
  const id = typeof raw === 'string' ? raw : '';
  goalId.value = id;
  if (id) {
    uni.setNavigationBarTitle({ title: '编辑目标' });
    fillFormFromGoal(id);
    return;
  }
  // 新建：默认选中 3 个月，开箱即用
  presetDays.value = DEFAULT_DAYS;
  form.deadline = addDays(todayStr(), DEFAULT_DAYS);
});

onShow(() => {
  syncNavBar();
});

/** 用已有目标数据填充表单（截止 → 高亮最接近的快捷时长或自定义） */
function fillFormFromGoal(id: string): void {
  const goal = goalStore.getById(id);
  if (!goal) {
    return;
  }
  form.title = goal.title;
  form.description = goal.description;
  form.category = goal.category;
  form.deadline = goal.deadline;
  form.totalMinutes = goal.totalMinutes;
  form.dailyMinutes = goal.dailyMinutes ?? 0;
  // 自定义分钟（不在快捷选项里的值）：展开输入行并回填
  if (form.dailyMinutes > 0 && !DAILY_OPTIONS.includes(form.dailyMinutes)) {
    customDailyOpen.value = true;
    dailyCustomInput.value = String(form.dailyMinutes);
  }
  form.priority = goal.priority;
  form.color = goal.color;

  if (!goal.deadline) {
    presetDays.value = null;
    return;
  }
  const remain = diffDays(todayStr(), goal.deadline);
  const matched = DURATION_OPTIONS.find((d) => Math.abs(d.days - remain) <= 3);
  presetDays.value = matched ? matched.days : null;
  customOpen.value = !matched;
}

/** 点快捷时长：再点已选中的一次 = 取消截止日期 */
function pickDuration(days: number): void {
  openPanel.value = '';
  if (presetDays.value === days) {
    presetDays.value = null;
    customOpen.value = false;
    form.deadline = '';
    return;
  }
  presetDays.value = days;
  customOpen.value = false;
  form.deadline = addDays(todayStr(), days);
}

/** 展开自定义日期选择 */
function pickCustom(): void {
  presetDays.value = null;
  customOpen.value = true;
  scrollRowIntoView('.date-picker');
}

/** 选优先级（中 = 默认值，胶囊退回邀请语） */
function pickPriority(priority: Priority): void {
  form.priority = priority;
  openPanel.value = '';
}

/** 选每日学习时长：再点已选中的一次 = 取消 */
function pickDaily(minutes: number): void {
  form.dailyMinutes = form.dailyMinutes === minutes ? 0 : minutes;
  customDailyOpen.value = false;
  openPanel.value = '';
}

/** 展开自定义分钟输入：已有自定义值时回填，否则清空 */
function pickDailyCustom(): void {
  customDailyOpen.value = true;
  dailyCustomInput.value =
    form.dailyMinutes > 0 && !DAILY_OPTIONS.includes(form.dailyMinutes)
      ? String(form.dailyMinutes)
      : '';
  scrollRowIntoView('.daily-add');
}

/**
 * 应用自定义分钟（选完即合）：空输入 = 清除设置（与「再点已选 = 取消」对称）；
 * 需为 5–480 的整数（上限与 validate.ts 的 480 口径一致）
 */
function applyDailyCustom(): void {
  const raw = dailyCustomInput.value.trim();
  if (raw === '') {
    form.dailyMinutes = 0;
    openPanel.value = '';
    return;
  }
  const minutes = Number(raw);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) {
    uni.showToast({ title: '请输入 5–480 之间的分钟数', icon: 'none' });
    return;
  }
  form.dailyMinutes = minutes;
  openPanel.value = '';
}

/** 分类点选 / 取消 */
function pickCategory(category: string): void {
  form.category = form.category === category ? '' : category;
  openPanel.value = '';
}

/** 自定义日期触发器：只说「哪一天」（还剩多久由上方胶囊说）；未选 = 选择日期 */
const customTriggerText = computed(() => (form.deadline ? friendlyDate(form.deadline) : '选择日期'));

/** 面板下的一行说明：只在还没有截止日时出现（选填安抚）；设了就交给胶囊，不重复说 */
const deadlineHint = computed(() => (form.deadline ? '' : '未设置截止日期（选填）'));

/** 日期选择回调（uni-datetime-picker）——不同端回传 string / timestamp，统一为 yyyy-MM-dd */
function onDeadlineChange(value: string | number | string[] | undefined): void {
  openPanel.value = '';
  if (typeof value === 'number') {
    const d = new Date(value);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    form.deadline = `${d.getFullYear()}-${m}-${day}`;
    return;
  }
  if (typeof value === 'string') {
    form.deadline = value.slice(0, 10);
    return;
  }
  form.deadline = '';
}

/* ==================== 学习步骤（新建时可选；V5.38） ==================== */

/** 新建时写下的学习步骤（随「创建目标」一起落库） */
const stepDrafts = ref<string[]>([]);
/** 输入行里的那一条（没点「加入」也会在保存时收下） */
const stepDraft = ref('');
/** 步骤条数上限（一张便签写不下的，就不是「小」目标了） */
const STEP_MAX = 12;
/** 新建时步骤的默认时长（之后可在详情页逐条改） */
const DEFAULT_STEP_MINUTES = 25;

/** 步骤输入框的聚焦开关（uni 的 input 靠 focus 属性驱动：true 聚焦 / false 失焦） */
const stepFocus = ref(false);
/** 步骤输入框此刻是否已经在焦点里（避免无谓的 blur→focus 让键盘闪一下） */
const stepInputFocused = ref(false);

/**
 * 让步骤输入框拿到焦点，键盘随之弹起（和标题输入框同一套体验）：
 * uni 的 input 只认 focus 属性的「变化」，所以先置 false 再置 true，
 * 触发一次重新聚焦；H5 再补一刀原生 focus，手机端键盘更稳。
 */
function focusStepInput(): void {
  if (stepInputFocused.value) {
    return; // 已经在写了，别打断
  }
  stepFocus.value = false;
  nextTick(() => {
    stepFocus.value = true;
    // #ifdef H5
    const el = document.querySelector('.step-add .uni-input-input') as HTMLInputElement | null;
    el?.focus();
    // #endif
  });
}

/** 步骤输入框拿到焦点 = 也在写（笔同样落到书上） */
function onStepFocus(): void {
  stepInputFocused.value = true;
  startWriting();
}

/** 步骤输入框失焦 */
function onStepBlur(): void {
  stepInputFocused.value = false;
  stopWriting();
}

/** 点「加入」/ 回车：把输入行的那一条收进列表 */
function addStepDraft(): void {
  const title = stepDraft.value.trim();
  if (!title) {
    return;
  }
  if (stepDrafts.value.length >= STEP_MAX) {
    uni.showToast({ title: `步骤最多 ${STEP_MAX} 条`, icon: 'none' });
    return;
  }
  if (stepDrafts.value.includes(title)) {
    uni.showToast({ title: '已经写过这一步了', icon: 'none' });
    return;
  }
  stepDrafts.value.push(title);
  stepDraft.value = '';
  // 收下这一条就把光标还给输入框：可以接着写下一条，键盘不落
  focusStepInput();
}

/** 保存前清账：输入行里没点「加入」的那一条也一起收下 */
function flushStepDraft(): void {
  const title = stepDraft.value.trim();
  if (!title || stepDrafts.value.length >= STEP_MAX) {
    return;
  }
  if (stepDrafts.value.includes(title)) {
    return;
  }
  stepDrafts.value.push(title);
  stepDraft.value = '';
}

/** 划掉一条还没落库的步骤 */
function removeStepDraft(idx: number): void {
  stepDrafts.value.splice(idx, 1);
}

/* ==================== 保存（目标 + 可选的步骤） ==================== */

function onSave(): void {
  const draft: GoalDraft = {
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category.trim(),
    deadline: form.deadline,
    totalMinutes: form.totalMinutes,
    dailyMinutes: form.dailyMinutes,
    priority: form.priority,
    color: form.color,
  };

  const error = validateGoalDraft(draft);
  if (error) {
    uni.showToast({ title: error, icon: 'none' });
    return;
  }

  if (isEdit.value) {
    goalStore.updateGoal(goalId.value, {
      title: draft.title,
      description: draft.description,
      category: draft.category,
      deadline: draft.deadline,
      totalMinutes: draft.totalMinutes,
      dailyMinutes: draft.dailyMinutes,
      priority: draft.priority,
      color: draft.color,
    });
    uni.showToast({ title: '已保存', icon: 'none' });
    setTimeout(() => backAfterSave(), 350);
    return;
  }

  // 新建：落目标本身 + 可选的步骤（V5.38：写了就是大目标，不写就是小目标）
  flushStepDraft();
  const created = goalStore.addGoal(draft);
  for (const title of stepDrafts.value) {
    taskStore.addTask({
      goalId: created.id,
      title,
      estimateMinutes: DEFAULT_STEP_MINUTES,
      priority: form.priority,
    });
  }
  uni.showToast({
    title: stepDrafts.value.length > 0 ? `已创建 · ${stepDrafts.value.length} 个步骤` : '已创建',
    icon: 'none',
  });
  setTimeout(() => backAfterSave(), 350);
}

/**
 * 保存成功后的返回（兼容 H5 深链接 / 刷新直达本页：栈内无上一页时给一个合理落点）：
 * 编辑模式 → 重定向到该目标详情（立刻看到最新内容）；新建模式 → 切回「目标」列表。
 */
function backAfterSave(): void {
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
    return;
  }
  if (isEdit.value) {
    uni.redirectTo({ url: `/pages/goal/detail?id=${goalId.value}` });
  } else {
    uni.switchTab({ url: '/pages/goal/list' });
  }
}

/* ==================== 删除目标（行内两段式确认，级联清理） ==================== */

/** 未归档步骤数（删除确认文案用；V5.23：已归档的步骤不随删除而抹去，不计入） */
const taskCount = computed(() => {
  if (!isEdit.value) {
    return 0;
  }
  return taskStore.listByGoal(goalId.value).filter((t) => t.status !== 'archived').length;
});

/** 删除确认文案 */
const deleteNote = computed(() => {
  const parts: string[] = [];
  if (taskCount.value > 0) {
    parts.push(`${taskCount.value} 个学习步骤`);
  }
  const tail = parts.length > 0 ? `及其下 ${parts.join('、')}` : '';
  return `将删除「${form.title || '未命名目标'}」${tail}、未完成的安排与复习计划，且不可恢复。`;
});

/**
 * 删除目标（级联清理，页面层编排，useGoalDelete 与详情页共用）：
 * 1. 目标的未完成计划条目 → 软删除；
 * 2. 目标下全部复习计划 → 软删除；
 * 3. 目标下未归档的学习步骤 → 软删除（已归档的回忆留在成就收藏集里）；
 * 4. 目标本身 → 软删除。
 */
function onDelete(): void {
  const goal = goalStore.getById(goalId.value);
  if (!goal) {
    return;
  }
  deleteGoalCascade(goal.id);
  uni.showToast({ title: '已删除', icon: 'none' });
  setTimeout(() => backAfterDelete(), 350);
}

/** 删除成功后的返回（兼容深链接直达：栈内无上一页时回「目标」列表） */
function backAfterDelete(): void {
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
    return;
  }
  uni.switchTab({ url: '/pages/goal/list' });
}
</script>

<style lang="scss" scoped>
/**
 * 目标编辑页样式 —— 一张手账便签（DESIGN.md V5.30）
 * - 大输入 48rpx + 1px 虚线（#E5E5E5），右侧 150rpx 铅笔插画（退成背景，不抢焦点）；
 * - 属性 = 浅马卡龙底贴纸胶囊（24rpx，无边框），点开就地展开选项、选完即合；全程零弹窗。
 */

.edit {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 96rpx 32rpx 320rpx; /* 底部留白给固定 CTA 让位 */
  background-color: #ffffff;
  color: #000000;
}

/* ==================== ② 写下目标（大输入 + 虚线 + 铅笔） ==================== */

.title-block {
  position: relative;
  margin-top: 40rpx;
  padding-right: 150rpx; /* 给右侧铅笔留下落点，文字不越线 */
  border-bottom: 1px dashed #e5e5e5;
}

/* 输入 = 一行大字 + 1px 虚线
 * 注意：uni-input 默认 height/min-height = 1.4em 且 overflow: hidden，
 * 加上上下 padding 后内容盒被压成 10px 高、文字被裁切；
 * 这里改为高度自适应，内层输入按行高 1.4em 撑开，文字垂直居中且完整显示。 */
.title-input {
  width: 100%;
  height: auto;
  min-height: 0;
  box-sizing: border-box;
  padding: 12rpx 0 18rpx;
  font-size: 48rpx;
  color: #000000;
  background-color: transparent;

  :deep(.uni-input-wrapper) {
    height: auto;
  }

  :deep(.uni-input-input) {
    height: 1.4em;
    color: #000000;
    font-size: 48rpx;
  }

  :deep(.uni-input-placeholder) {
    color: #b9b9b9;
    font-size: 48rpx;
  }
}

/* 铅笔：贴着虚线右端，颜色随 --doodle-* 走（暗色自动压暗）
 * 书写时整支笔飞到底部书上：transform-origin = 笔尖（pencil.svg 的 (55,172)），
 * 位移由脚本按两个框的实测位置算（--fly-x / --fly-y），旋转/缩放都以笔尖为轴。 */
.title-doodle {
  position: absolute;
  right: 0;
  bottom: -6rpx;
  z-index: 2;
  transform-origin: 27.5% 86%;
  transition: transform 0.7s cubic-bezier(0.36, 1.02, 0.58, 1);
  will-change: transform;
}

.title-doodle.is-writing {
  transform: translate(var(--fly-x, 0px), var(--fly-y, 0px)) rotate(6deg) scale(0.9);
}

/* 落笔后笔尖的小抖动（叠在飞行位移之外） */
.title-doodle.is-writing :deep(.doodle-icon) {
  animation: pencil-write-bob 0.32s ease-in-out infinite alternate;
}

@keyframes pencil-write-bob {
  from {
    transform: translate(0, 0);
  }
  to {
    transform: translate(-1.2px, -0.9px);
  }
}

/* 起飞时把原来的波浪线收掉：那是它在标题旁画的，不能跟着飞去书上 */
.title-doodle :deep(.pencil-wave) {
  transition: opacity 0.24s ease;
}

.title-doodle.is-writing :deep(.pencil-wave) {
  opacity: 0;
}

/* ==================== ③ 属性胶囊（贴纸） ==================== */

.caps-row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 40rpx;
}

/* 贴纸胶囊：浅马卡龙底、无边框；未设值 = 灰字邀请语 */
.cap {
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
}

.cap--mint {
  background-color: rgba(162, 217, 206, 0.22);
}

.cap--pink {
  background-color: rgba(245, 183, 177, 0.22);
}

.cap--yellow {
  background-color: rgba(249, 231, 159, 0.3);
}

.cap--blue {
  background-color: rgba(169, 204, 227, 0.24);
}

/* 已设值 / 展开中：底色加深一档、文字转墨色 */
.cap--set,
.cap--open {
  color: #000000;
}

.cap--mint.cap--set,
.cap--mint.cap--open {
  background-color: rgba(162, 217, 206, 0.45);
}

.cap--pink.cap--set,
.cap--pink.cap--open {
  background-color: rgba(245, 183, 177, 0.45);
}

.cap--yellow.cap--set,
.cap--yellow.cap--open {
  background-color: rgba(249, 231, 159, 0.55);
}

.cap--blue.cap--set,
.cap--blue.cap--open {
  background-color: rgba(169, 204, 227, 0.45);
}

.cap.cap--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

/* 展开面板（就地，同一时间只开一个） */
.panel {
  margin-top: 24rpx;
}

.opts {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16rpx;
}

/* 面板内选项：浅灰底小胶囊，选中 = 薄荷 */
.pill {
  padding: 10rpx 26rpx;
  border-radius: 999rpx;
  background-color: #f7f7f7;
  font-size: 24rpx;
  line-height: 1.4;
  color: #888888;
}

.pill--active {
  background-color: rgba(162, 217, 206, 0.35);
  color: #000000;
}

.pill--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

/* 自定义日期（行内展开，不弹窗） */
.date-picker {
  display: block;
  margin-top: 20rpx;
}

.date-trigger {
  display: block;
  padding: 16rpx 0;
  font-size: 30rpx;
  color: #000000;
  border-bottom: 1px dashed #e5e5e5;
}

.date-trigger--empty {
  color: #888888;
}

/* 自定义每日分钟（行内输入，选完即合） */
.daily-add {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 20rpx;
  border-bottom: 1px dashed #e5e5e5;
}

.daily-input {
  flex: 1;
  min-width: 0;
  height: auto;
  min-height: 0;
  box-sizing: border-box;
  padding: 16rpx 0;
  font-size: 30rpx;
  color: #000000;
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
    color: #b9b9b9;
    font-size: 30rpx;
  }
}

.daily-unit {
  flex-shrink: 0;
  padding-left: 12rpx;
  font-size: 26rpx;
  line-height: 1.4;
  color: #888888;
}

.daily-ok {
  flex-shrink: 0;
  padding: 16rpx 4rpx 16rpx 24rpx;
  font-size: 26rpx;
  line-height: 1.4;
  color: #b9b9b9;
}

.daily-ok--on {
  color: #000000;
}

.daily-ok:active {
  background-color: rgba(245, 213, 184, 0.3);
}

/* 面板下的一行结果说明 */
.panel-hint {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  letter-spacing: 0.05em;
  line-height: 1.6;
  color: #888888;
}

/* ==================== ④ 学习步骤（新建时可选）+ 页底插画 ==================== */

.steps {
  margin-top: 56rpx;
}

.steps-title {
  display: block;
  font-size: 24rpx;
  letter-spacing: 4rpx;
  line-height: 1.4;
  color: #888888;
}

/* 引导：两行轻轻的语气——同一套字号与颜色，只换行；字距拉开，留白大一点 */
.steps-note {
  display: block;
  margin-top: 18rpx;
  font-size: 20rpx;
  line-height: 2;
  letter-spacing: 6rpx;
  color: #c0c0c0;
}

.steps-note + .steps-note {
  margin-top: 2rpx;
}

.step-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 24rpx;
}

/* 行首小圆点：纸上的一个墨点 */
.step-dot {
  flex-shrink: 0;
  width: 8rpx;
  height: 8rpx;
  margin: 0 20rpx 0 4rpx;
  border-radius: 50%;
  background-color: rgba(58, 58, 58, 0.45);
}

.step-name {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  line-height: 1.4;
  color: #000000;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-act {
  flex-shrink: 0;
  padding: 20rpx 6rpx 20rpx 28rpx;
  font-size: 26rpx;
  line-height: 1.4;
  color: #888888;
}

.step-act:active {
  background-color: rgba(245, 213, 184, 0.3);
}

/* 添加一行：输入 + 「加入」，下面一条虚线（写进一张便签）
 * 整行都是入口：点哪都把光标送进输入框（键盘随之弹起） */
.step-add {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: 24rpx;
  border-bottom: 1px dashed #e5e5e5;
}

.step-input {
  flex: 1;
  min-width: 0;
  height: auto;
  min-height: 0;
  box-sizing: border-box;
  padding: 16rpx 0;
  font-size: 28rpx;
  color: #000000;
  background-color: transparent;

  :deep(.uni-input-wrapper) {
    height: auto;
  }

  :deep(.uni-input-input) {
    height: 1.4em;
    color: #000000;
    font-size: 28rpx;
  }

  :deep(.uni-input-placeholder) {
    color: #b9b9b9;
    font-size: 28rpx;
  }
}

.step-add-btn {
  flex-shrink: 0;
  padding: 16rpx 4rpx 16rpx 24rpx;
  font-size: 26rpx;
  line-height: 1.4;
  color: #b9b9b9;
}

.step-add-btn--on {
  color: #000000;
}

.step-add-btn:active {
  background-color: rgba(245, 213, 184, 0.3);
}

/* 页底插画：一本书（V5.38f；再往下坐一截，上方留足空白）
 * 书写时（.is-writing）：合上的书淡出、摊开的书淡入，右页的涂鸦一笔一笔写出来；
 * 失焦：书晚半拍合上（先把笔让回去）。
 * 注意：SVG 经 v-html 注入，不吃 scoped 属性，动画一律用 :deep 命中。 */
.page-doodle {
  display: flex;
  flex-direction: row;
  justify-content: center;
  margin-top: 340rpx;
  margin-bottom: 24rpx;
  opacity: 0.92;
}

.page-doodle :deep(.bw-open),
.page-doodle :deep(.bw-closed) {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  transition: opacity 0.22s ease, transform 0.26s ease;
}

.page-doodle :deep(.bw-open) {
  opacity: 0;
  transform: translateY(4px) scale(0.97);
}

.page-doodle :deep(.bw-closed) {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* 收笔时书本晚半拍合上，做出「笔先回、书再合」的先后 */
.page-doodle:not(.is-writing) :deep(.bw-open),
.page-doodle:not(.is-writing) :deep(.bw-closed) {
  transition-delay: 0.5s;
}

/* 书等笔飞到半路再翻开，先看见笔起飞 */
.page-doodle.is-writing :deep(.bw-open),
.page-doodle.is-writing :deep(.bw-closed) {
  transition-delay: 0.2s;
}

.page-doodle.is-writing :deep(.bw-closed) {
  opacity: 0;
  transform: translateY(2px) scale(0.98);
}

.page-doodle.is-writing :deep(.bw-open) {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* 涂鸦：一笔一笔写出来的描边动画 */
.page-doodle :deep(.bw-scribble) {
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
}

.page-doodle.is-writing :deep(.bw-scribble) {
  animation: bw-scribble 1.3s ease-in-out infinite;
}

@keyframes bw-scribble {
  0% {
    stroke-dashoffset: 100;
  }
  62%,
  100% {
    stroke-dashoffset: 0;
  }
}

/* 尊重系统「减少动态效果」：不飞、不抖，直接把笔放到落笔点 */
@media (prefers-reduced-motion: reduce) {
  .page-doodle :deep(.bw-open),
  .page-doodle :deep(.bw-closed),
  .title-doodle {
    transition: none;
  }

  .title-doodle.is-writing :deep(.doodle-icon),
  .page-doodle.is-writing :deep(.bw-scribble) {
    animation: none;
  }

  .page-doodle.is-writing :deep(.bw-scribble) {
    stroke-dashoffset: 0;
  }
}

/* ==================== 删除区（编辑模式） ==================== */

.danger-zone {
  margin-top: 96rpx;
}

.acts-row {
  display: flex;
  flex-direction: row;
  align-items: center;
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

/* 通用纯文字动作 */
.act {
  padding: 18rpx 28rpx;
  font-size: 28rpx;
  line-height: 1.4;
  color: #888888;
}

.act:active {
  background-color: rgba(245, 213, 184, 0.3);
}

.act--strong {
  color: #000000;
}

/* ==================== 底部主行动（手绘抖动框） ==================== */

.cta-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 24rpx 32rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
  background-color: #ffffff;
}

.cta {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22rpx 0;
  border-radius: 10rpx;
  background-color: #ffffff;
  color: #000000;
}

.cta-text {
  font-size: 30rpx;
  line-height: 1.4;
  letter-spacing: 10rpx;
  padding-left: 10rpx; /* 补偿 letter-spacing 造成的视觉偏右 */
}

.cta .hand-frame {
  color: #3a3a3a;
  transition: color 150ms ease;
}

.cta--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

.cta--pressed .hand-frame {
  color: #b89b5e;
}
</style>
