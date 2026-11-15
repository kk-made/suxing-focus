<template>
  <!-- 成就收藏集（V5.26 现代手绘图册 · 版式再平衡）——
       两张 8rpx 小圆角的纯白纸片微微浮着，薄荷虚线作缝；
       左页是一列「马卡龙圆点 + 任务名」，当前一条用波浪线托住；
       右页偏左排版：印章、标题、落款，右侧大片留白；
       书下大片呼吸后，星星罐沉在中下方，轻点罐身把完成的目标收进书里。 -->
  <view class="ach" :class="{ 'theme-dark': darkActive }">
    <view class="hero">
      <view
        class="stage"
        @touchstart="onTouchStart"
        @touchend="onTouchEnd"
        @touchcancel="onTouchCancel"
      >
        <view class="spread">
          <!-- 左页：目录。没有编号，只有一颗小圆点与名字 -->
          <view class="sheet sheet--index">
            <view class="idx">
              <text class="folio folio--idx">目录</text>
              <view v-if="windowRows.length > 0" class="idx-list">
                <view
                  v-for="row in windowRows"
                  :key="row.key"
                  class="idx-row"
                  :class="{ 'idx-row--now': row.now }"
                >
                  <view class="idx-dot" :class="`idx-dot--${row.tone}`"></view>
                  <view class="idx-main">
                    <text class="idx-name">{{ row.title }}</text>
                    <view
                      v-if="row.now"
                      class="idx-wave"
                      v-html="waveSvg"
                    />
                  </view>
                </view>
              </view>
            </view>
          </view>

          <!-- 右页：一张偏左排版的收藏标签（页码收在右上角） -->
          <view class="sheet sheet--leaf">
            <text v-if="rightItem" class="folio folio--leaf">{{ folioNo }}</text>
            <view v-if="rightItem" class="leaf">
              <view class="leaf-main">
                <view class="leaf-mark"><DoodleIcon name="stamp" :size="84" /></view>
                <text class="leaf-title">{{ rightItem.title }}</text>
                <text class="leaf-sub">{{ rightItem.sub }}</text>
                <!-- V5.33：收进来的目标，它的步骤列在这一页上（整段旅程一页翻完） -->
                <view v-if="rightSteps.list.length > 0" class="leaf-steps">
                  <view v-for="(s, i) in rightSteps.list" :key="i" class="leaf-step">
                    <view class="leaf-step-check"><DoodleIcon name="check" :size="24" /></view>
                    <view class="leaf-step-main">
                      <text class="leaf-step-title">{{ s.title }}</text>
                      <text class="leaf-step-date">{{ s.doneText }}</text>
                    </view>
                  </view>
                  <text v-if="rightSteps.rest > 0" class="leaf-step-more">
                    …还有 {{ rightSteps.rest }} 个步骤
                  </text>
                </view>
                <text class="leaf-date">收于 {{ rightItem.doneText }}</text>
              </view>
            </view>
            <view v-else class="leaf leaf--empty">
              <view class="leaf-main">
                <view class="leaf-mark leaf-mark--soft">
                  <DoodleIcon name="book" :size="92" />
                </view>
                <text class="leaf-title">成就收藏集</text>
              </view>
            </view>
          </view>

          <!-- 中缝：一条 1px 马卡龙薄荷虚线 -->
          <view class="seam"></view>

          <!-- 翻页时从右滑到左的极浅影子 -->
          <view
            v-if="flipping"
            class="flip-shade"
            :class="{
              'flip-shade--next': flipping === 'next',
              'flip-shade--prev': flipping === 'prev',
              'flip-shade--on': flipOn,
            }"
          ></view>

          <!-- 翻页卡片：一张轻纸绕中缝翻 180°；转过 90° 时换面（背面是左页目录） -->
          <view
            v-if="flipping"
            class="flip"
            :class="{
              'flip--next': flipping === 'next',
              'flip--prev': flipping === 'prev',
              'flip--on': flipOn,
            }"
          >
            <view class="flip-pane" :class="{ 'flip-pane--back': backSide }">
              <view v-if="backSide" class="idx">
                <text class="folio folio--idx">目录</text>
                <view v-if="windowRows.length > 0" class="idx-list">
                  <view
                    v-for="row in windowRows"
                    :key="row.key"
                    class="idx-row"
                    :class="{ 'idx-row--now': row.now }"
                  >
                    <view class="idx-dot" :class="`idx-dot--${row.tone}`"></view>
                    <view class="idx-main">
                      <text class="idx-name">{{ row.title }}</text>
                      <view
                        v-if="row.now"
                        class="idx-wave"
                        v-html="waveSvg"
                      />
                    </view>
                  </view>
                </view>
              </view>
              <text v-if="!backSide && sheetItem" class="folio folio--leaf">
                {{ sheetPageNo }}
              </text>
              <view v-if="!backSide && sheetItem" class="leaf">
                <view class="leaf-main">
                  <view class="leaf-mark"><DoodleIcon name="stamp" :size="84" /></view>
                  <text class="leaf-title">{{ sheetItem.title }}</text>
                  <text class="leaf-sub">{{ sheetItem.sub }}</text>
                  <view v-if="sheetSteps.list.length > 0" class="leaf-steps">
                    <view v-for="(s, i) in sheetSteps.list" :key="i" class="leaf-step">
                      <view class="leaf-step-check"><DoodleIcon name="check" :size="24" /></view>
                      <view class="leaf-step-main">
                        <text class="leaf-step-title">{{ s.title }}</text>
                        <text class="leaf-step-date">{{ s.doneText }}</text>
                      </view>
                    </view>
                    <text v-if="sheetSteps.rest > 0" class="leaf-step-more">
                      …还有 {{ sheetSteps.rest }} 个步骤
                    </text>
                  </view>
                  <text class="leaf-date">收于 {{ sheetItem.doneText }}</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 轻点书页边缘翻页（透明热区） -->
          <view class="tap tap--prev" @click="onTap('prev')"></view>
          <view class="tap tap--next" @click="onTap('next')"></view>
        </view>
      </view>

      <!-- 书下大片留白：一罐收集来的星星沉在中下方；轻点罐子 = 收入囊中 -->
      <view class="bottom" :class="{ 'bottom--empty': total === 0 }">
        <view
          class="jar-wrap"
          hover-class="jar-wrap--pressed"
          :hover-start-time="0"
          :hover-stay-time="160"
          @click="onJarTap"
        >
          <DoodleIcon name="jar" :size="160" />
        </view>
        <text class="jar-label">收集完成的目标，步骤一起收进来</text>
      </view>
    </view>

    <!-- 收集抽屉（V5.44：收藏单位只有目标，步骤跟着目标一起进册子） -->
    <view v-if="collectOpen" class="collect-mask" @click="collectOpen = false">
      <view class="collect-panel" @click.stop>
        <view class="collect-bar"></view>
        <text class="collect-title">收进成就收藏集</text>
        <text class="collect-sub">完成的目标会连同它的步骤一起收进册子</text>
        <scroll-view class="collect-list" scroll-y>
          <view
            v-for="item in collectable"
            :key="item.id"
            class="collect-row"
            hover-class="collect-row--pressed"
            @click="collect(item)"
          >
            <text class="collect-row-title">{{ item.title }}</text>
            <text class="collect-row-sub">{{ item.sub }}</text>
          </view>
        </scroll-view>
        <text class="collect-close" @click="collectOpen = false">取消</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * AchievementBook —— 成就收藏集（V5.26 现代手绘图册）
 * ============================================================
 * 数据：目标为收藏单位；目标连同它已归档的步骤成一页，按完成时间升序成书（V5.44）。
 * 视觉：暖灰底上两张纯白纸片（8rpx 小圆角 + 纸纹 + 极轻阴影），
 *       左页是圆点目录，右页是偏左的收藏标签；书回到上一轮的视觉高度，星星罐沉在中下方压住重心。
 * 翻页：一张轻卡从右页绕中缝翻到左页——
 *       transform-origin: left center；rotateY(-180deg)；
 *       0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 果冻缓动；
 *       翻过 90° 时换面（背面是左页目录）；纸下极浅影子随翻页从右滑到左。
 * 交互：左右滑动 / 轻点书页边缘；轻点星星罐把完成的目标收入册子；
 *       只有一页（或没有）时收起翻页。
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { darkActive } from '@/utils/theme';

/** 当前目录页的波浪线：v-html 注入，app-vue 不渲染模板里的静态 <svg> */
const waveSvg =
  '<svg viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M 2 5 C 14 2, 26 7, 40 4 S 64 6, 78 4 S 102 3, 118 5" /></svg>';
import DoodleIcon from '@/components/DoodleIcon.vue';
import type { TouchLike } from '@/composables/useRowSwipe';
import { useGoalStore } from '@/stores/goal';
import { useTaskStore } from '@/stores/task';
import { bookLeaves, formatDoneAt, type BookLeaf } from '@/services/collection';

const taskStore = useTaskStore();
const goalStore = useGoalStore();

/**
 * 全部回忆：按完成时间升序（第 1 页 = 最早收进来的那一条）。
 * V5.44：一页 = 一个目标，步骤都列在这页上；旧数据里单独收的步骤也归回目标页。
 */
const leaves = computed<BookLeaf[]>(() => bookLeaves(goalStore.goals, taskStore.tasks));

const total = computed(() => leaves.value.length);

/** 右页（当前页）下标；数据变少时把下标夹回书内 */
const index = ref(0);
watch(total, (n) => {
  if (index.value > n - 1) {
    index.value = Math.max(0, n - 1);
  }
});

const currentPageNo = computed(() => Math.min(index.value + 1, Math.max(total.value, 1)));

/** 角落页码：01 / 02 …（两位、轻字距） */
const folioNo = computed(() => String(currentPageNo.value).padStart(2, '0'));

/* ==================== 左页目录：以当前页为中心的展示窗口 ==================== */

/** 左页一屏最多排下的行数（给两行标题和呼吸留足空间） */
const WINDOW = 4;

const windowStart = computed(() => {
  const n = total.value;
  if (n <= WINDOW) {
    return 0;
  }
  return Math.max(0, Math.min(index.value - Math.floor(WINDOW / 2), n - WINDOW));
});

const windowRows = computed(() =>
  leaves.value.slice(windowStart.value, windowStart.value + WINDOW).map((leaf, i) => {
    const absolute = windowStart.value + i;
    return {
      key: leaf.id,
      title: leaf.title,
      now: absolute === index.value,
      /** 小圆点的马卡龙色序号（0–4，跟着回忆本身走，不随窗口跳动） */
      tone: absolute % 5,
    };
  }),
);

/** 右页内容：当前正在看的那一条 */
const rightItem = computed<BookLeaf | null>(() => leaves.value[index.value] ?? null);

/** 一页最多列几步（多出来的用「…还有 N 个」收尾） */
const MAX_STEPS_ON_PAGE = 4;

/** 一页上要展示的步骤 + 还剩几个 */
function stepsOnPage(leaf: BookLeaf | null): { list: BookLeaf['steps']; rest: number } {
  if (!leaf) {
    return { list: [], rest: 0 };
  }
  return {
    list: leaf.steps.slice(0, MAX_STEPS_ON_PAGE),
    rest: Math.max(0, leaf.steps.length - MAX_STEPS_ON_PAGE),
  };
}

/** 右页（右）步骤清单 */
const rightSteps = computed(() => stepsOnPage(rightItem.value));

/* ==================== 翻页状态机 ==================== */

type FlipDir = 'next' | 'prev';

/** 翻页动画时长（毫秒，与 CSS 过渡的 0.5s 保持一致） */
const FLIP_MS = 500;

const flipping = ref<FlipDir | null>(null);
/** 已挂「目标姿态」类（挂载后的下一帧才挂，让过渡真实跑起来） */
const flipOn = ref(false);
/** 遮罩纸上印着谁：往后翻印当前页（它翻去左边）；往前翻印上一页（它翻回来落在右边） */
const sheetItem = ref<BookLeaf | null>(null);

/** 翻页卡片上的步骤清单（与右页同一套：整段旅程一页列完） */
const sheetSteps = computed(() => stepsOnPage(sheetItem.value));
/** 翻页卡片上印着的页码（翻页全程不变，避免落定时跳字） */
const sheetPageNo = ref('');
let flipTimer: ReturnType<typeof setTimeout> | null = null;

/** 翻过中缝了没有（rotateY 越过 90°）：此刻纸正好侧着、看不见，是换面的唯一时机 */
const pastHalf = ref(false);
/** 现在露出的是「背面」吗——背面印左页目录，并补一次水平镜像把字正过来 */
const backSide = computed(() => {
  if (flipping.value === 'next') {
    return pastHalf.value;
  }
  if (flipping.value === 'prev') {
    return !pastHalf.value;
  }
  return false;
});
/**
 * 换面时刻：cubic-bezier(0.34, 1.56, 0.64, 1) 下，0.5s 的 13%（≈65ms）正好转过 90°，
 * 取 66ms —— 此刻纸完全侧着，换面（以及镜像补正）谁也看不见。
 */
const FLIP_HALF_MS = 66;
let halfTimer: ReturnType<typeof setTimeout> | null = null;

function clearHalfMark(): void {
  if (halfTimer !== null) {
    clearTimeout(halfTimer);
    halfTimer = null;
  }
}

function canFlip(dir: FlipDir): boolean {
  return dir === 'next' ? index.value < total.value - 1 : index.value > 0;
}

/** 下一帧（双 rAF：确保初始姿态先上屏，再触发过渡） */
function nextFrame(cb: () => void): void {
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (fn: () => void) => setTimeout(fn, 16);
  raf(() => raf(cb));
}

/** 系统开启「减弱动态效果」：不做翻页动画，直接落定 */
const reduceMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function flip(dir: FlipDir): void {
  if (flipping.value !== null || !canFlip(dir)) {
    return;
  }
  if (reduceMotion) {
    index.value += dir === 'next' ? 1 : -1;
    return;
  }
  if (dir === 'next') {
    // 遮罩上印着要离开的这一页；右页先换成下一页（被遮罩盖着，看不见跳变）
    sheetItem.value = leaves.value[index.value] ?? null;
    sheetPageNo.value = String(index.value + 1).padStart(2, '0');
    index.value += 1;
  } else {
    // 往前翻：遮罩从左侧落回右页，等落定时（动画结束）右页才换
    sheetItem.value = leaves.value[index.value - 1] ?? null;
    sheetPageNo.value = String(index.value).padStart(2, '0');
  }
  pastHalf.value = false;
  flipping.value = dir;
  flipOn.value = false;
  nextTick(() => {
    nextFrame(() => {
      flipOn.value = true;
      clearHalfMark();
      halfTimer = setTimeout(() => {
        halfTimer = null;
        if (flipping.value === dir) {
          pastHalf.value = true;
        }
      }, FLIP_HALF_MS);
    });
  });
  flipTimer = setTimeout(() => {
    flipTimer = null;
    if (dir === 'prev') {
      index.value -= 1;
    }
    clearHalfMark();
    flipping.value = null;
    flipOn.value = false;
    pastHalf.value = false;
  }, FLIP_MS + 20);
}

onUnmounted(() => {
  clearHalfMark();
  if (flipTimer !== null) {
    clearTimeout(flipTimer);
  }
});

/* ==================== 手势与轻点 ==================== */

/** 滑动翻页的最小水平位移（px） */
const SWIPE_PX = 40;

let touchStartX = 0;
let touchStartY = 0;
/** 滑动结束后短时间内吞掉浏览器补发的 click，防止「滑一次、翻两页」 */
let suppressClickUntil = 0;

/** 触摸点（与目标页滑动同一个最小形状：兼容 uni 各端事件结构） */
function firstPoint(e: TouchLike): { x: number; y: number } | null {
  const t =
    (e.touches && e.touches.length > 0 ? e.touches[0] : null) ??
    (e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0] : null);
  return t ? { x: t.clientX, y: t.clientY } : null;
}

function onTouchStart(e: TouchLike): void {
  const p = firstPoint(e);
  if (!p) {
    return;
  }
  touchStartX = p.x;
  touchStartY = p.y;
}

function onTouchEnd(e: TouchLike): void {
  const p = firstPoint(e);
  if (!p) {
    return;
  }
  const dx = p.x - touchStartX;
  const dy = p.y - touchStartY;
  if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) {
    return;
  }
  suppressClickUntil = Date.now() + 400;
  flip(dx < 0 ? 'next' : 'prev');
}

function onTouchCancel(): void {
  // 手势被打断（如页面滚动接管）：不做任何事
}

/** 轻点左右边缘热区（滑动刚结束的补发 click 一律吞掉） */
function onTap(dir: FlipDir): void {
  if (Date.now() < suppressClickUntil) {
    return;
  }
  flip(dir);
}

/* ==================== 收集完成的目标（V5.44） ==================== */

/** 待收取的目标：已完成、还没收入囊中 */
interface CollectItem {
  id: string;
  title: string;
  /** 第二行：目标带几个步骤（步骤会一起收进来） */
  sub: string;
}

/** 收集抽屉是否打开 */
const collectOpen = ref(false);

/**
 * 待收取的回忆：只有已完成的目标（整页收，步骤跟着走）。
 * 步骤不再单独出现在这里——收藏单位只有目标。
 */
const collectable = computed<CollectItem[]>(() =>
  goalStore.completedGoals.map((g) => {
    const steps = taskStore
      .listByGoal(g.id)
      .filter((t) => t.status === 'done' || t.status === 'archived').length;
    return {
      id: g.id,
      title: g.title,
      sub: steps > 0 ? `目标 · ${steps} 个步骤一起收进` : '目标',
    };
  }),
);

/** 星星罐 = 唯一入口：挑一个已完成的目标收进册子 */
function onJarTap(): void {
  if (collectable.value.length === 0) {
    uni.showToast({ title: '还没有完成的目标', icon: 'none' });
    return;
  }
  collectOpen.value = true;
}

/** 收进册子：目标连同它的已完成步骤一起收 */
function collect(item: CollectItem): void {
  collectOpen.value = false;
  const count = goalStore.archiveGoal(item.id);
  uni.showToast({
    title: count > 0 ? `已收入囊中 · 目标 + ${count} 个步骤` : '已收入囊中',
    icon: 'none',
  });
  // 翻到刚收的那一页（回忆按完成时间成书，收进来不一定在末页）
  nextTick(() => {
    const i = leaves.value.findIndex((l) => l.id === item.id);
    if (i >= 0) {
      index.value = i;
    }
  });
}
</script>

<style scoped>
/* ==================== 页面与纸张 ==================== */

/* 页面：和 App 一样的极浅暖灰；书上、罐下，中间留出大片呼吸 */
.ach {
  box-sizing: border-box;
  /* 扣掉 App 顶栏 / 底栏，让书与罐的构图正好落在手机一屏内 */
  min-height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px));
  min-height: calc(100dvh - var(--window-top, 0px) - var(--window-bottom, 0px));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 24rpx 40rpx 40rpx;
  background: var(--book-stage, #f9f9f8);
}

/* 中段：书 + 星星罐 + 标签作为一组；hero 占满剩余高度，
   让 bottom 的 margin-top:auto 有空间可吃 */
.hero {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stage {
  width: 100%;
  flex-shrink: 0;
  /* 书本不再贴顶、也不沉到腰下：14vh 的上呼吸，
     让书在「顶栏」与「星星罐」之间略偏上，重心仍落在罐子上 */
  margin-top: 14vh;
}

/* 摊开的两页：各占一半，中缝重合 */
.spread {
  position: relative;
  height: 620rpx;
  perspective: 2400px;
}

/* 一张纯白纸片：8rpx 小圆角 + 极细描边 + 极轻阴影；
   纸面带一层几乎看不见的颗粒，边缘因此有了手工纸的呼吸。
   两页之间留 16rpx 的缝，薄荷虚线正好落在缝里。 */
.sheet {
  position: absolute;
  top: 0;
  bottom: 0;
  width: calc(50% - 8rpx);
  box-sizing: border-box;
  background-color: var(--book-board, #ffffff);
  background-image:
    radial-gradient(
      circle at 18% 24%,
      var(--book-grain, rgba(58, 58, 58, 0.02)) 0 1px,
      transparent 1.5px
    ),
    radial-gradient(
      circle at 72% 66%,
      var(--book-grain, rgba(58, 58, 58, 0.02)) 0 1px,
      transparent 1.5px
    );
  background-size: 43rpx 53rpx, 71rpx 83rpx;
  border: 1px solid var(--book-hairline, rgba(43, 43, 40, 0.07));
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  overflow: hidden;
}

/* 四周都收成 8rpx；只差 1rpx 的不齐，像纸刀裁过又轻轻磨了一下 */
.sheet--index {
  left: 0;
  border-radius: 8rpx 9rpx 8rpx 7rpx;
}

.sheet--leaf {
  right: 0;
  border-radius: 9rpx 8rpx 7rpx 8rpx;
}

/* 页码 / 目录标记：角落里的极细小字 */
.folio {
  position: absolute;
  top: 32rpx;
  left: 36rpx;
  z-index: 1;
  font-size: 18rpx;
  font-weight: 300;
  line-height: 1;
  letter-spacing: 2rpx;
  color: var(--book-folio, #c6c2b9);
}

.folio--idx {
  font-size: 18rpx;
  letter-spacing: 7rpx;
}

.folio--leaf {
  left: auto;
  right: 36rpx;
  letter-spacing: 3rpx;
}

/* ==================== 左页：目录 ==================== */

.idx {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  box-sizing: border-box;
  padding: 118rpx 34rpx 28rpx;
  overflow: hidden;
}

.idx-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.idx-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  padding: 6rpx 0;
}

/* 极小的马卡龙圆点：每一条回忆一颗，颜色跟着它在书里的序号走 */
.idx-dot {
  width: 9rpx;
  height: 9rpx;
  flex-shrink: 0;
  margin-top: 15rpx;
  margin-right: 16rpx;
  border-radius: 50%;
}

/* 不是印刷机排出来的圆：隔一颗小 1rpx */
.idx-list .idx-row:nth-child(even) .idx-dot {
  width: 8rpx;
  height: 8rpx;
  margin-top: 16rpx;
}

.idx-dot--0 {
  background: var(--doodle-green, #a2d9ce);
}

.idx-dot--1 {
  background: var(--doodle-blue, #a9cce3);
}

.idx-dot--2 {
  background: var(--doodle-pink, #f5b7b1);
}

.idx-dot--3 {
  background: var(--doodle-yellow, #f9e79f);
}

.idx-dot--4 {
  background: var(--doodle-purple, #d7bde2);
}

.idx-main {
  flex: 1;
  min-width: 0;
}

.idx-name {
  min-width: 0;
  font-size: 24rpx;
  line-height: 1.55;
  letter-spacing: 0.2rpx;
  color: var(--book-mute, #a0a0a0);
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  word-break: break-word;
  text-wrap: pretty;
}

.idx-row--now .idx-name {
  font-weight: 500;
  color: var(--book-title, #3a3a3a);
}

/* 当前页：一条手绘波浪线，只托住正在看的那一条 */
.idx-wave {
  display: block;
  width: 112rpx;
  height: 8rpx;
  margin-top: -2rpx;
  margin-left: 2rpx;
  overflow: visible;
}

.idx-wave :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.idx-wave :deep(path) {
  fill: none;
  stroke: var(--book-mint-ink, #357e70);
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ==================== 右页：一张偏左的收藏标签 ==================== */

.leaf {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 96rpx 30rpx 52rpx;
  text-align: left;
}

.leaf-main {
  width: 100%;
  min-width: 0;
  /* 整组标签轻轻上移：印章落在标题上方的偏高处，底部留白更从容 */
  margin-bottom: 48rpx;
}

.leaf-mark {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-left: -18rpx;
  transform: rotate(-6deg);
  transform-origin: 20% 80%;
}

.leaf-mark--soft {
  opacity: 0.92;
  transform: rotate(-3deg);
}

.leaf-title {
  display: block;
  max-width: 100%;
  margin-top: 24rpx;
  font-size: 30rpx;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0.4rpx;
  color: var(--book-title, #3a3a3a);
  word-break: break-word;
  text-wrap: pretty;
}

.leaf-sub {
  display: block;
  max-width: 100%;
  margin-top: 20rpx;
  font-size: 20rpx;
  line-height: 1.8;
  letter-spacing: 2rpx;
  color: var(--book-mute, #a0a0a0);
}

.leaf-date {
  display: block;
  margin-top: 22rpx;
  font-size: 18rpx;
  line-height: 1.8;
  letter-spacing: 2rpx;
  color: var(--book-folio, #a8a49b);
}

/* V5.33：目标页上的步骤清单——收进来的目标的每一步都列在这一页上 */
.leaf-steps {
  width: 100%;
  margin-top: 18rpx;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}

/* 一步两行：标题在上（占满整页宽），日期在下（小一号、贴着标题左缘）。
   半页只有 130px 宽，标题与日期挤在一行会把两边都压碎。 */
.leaf-step {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 10rpx;
  padding: 10rpx 0;
  border-bottom: 1rpx solid var(--book-hairline, #eeeeee);
}

.leaf-step-check {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding-top: 4rpx;
}

.leaf-step-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.leaf-step-title {
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--book-mute, #a0a0a0);
  /* 标题折两行，不截断（页窄，截半个字反而看不懂） */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  word-break: break-word;
  text-wrap: pretty;
}

.leaf-step-date {
  margin-top: 4rpx;
  font-size: 17rpx;
  line-height: 1.6;
  letter-spacing: 1rpx;
  color: var(--book-folio, #b3afa6);
}

.leaf-step-more {
  display: block;
  padding-top: 12rpx;
  font-size: 20rpx;
  line-height: 1.5;
  color: var(--book-folio, #6f6b64);
}

.leaf--empty .leaf-main {
  margin-bottom: 0;
}

.leaf--empty .leaf-title {
  margin-top: 26rpx;
}

/* 中缝：一条 1px 马卡龙薄荷虚线（6rpx 实、10rpx 空） */
.seam {
  position: absolute;
  left: 50%;
  top: 26rpx;
  bottom: 26rpx;
  z-index: 2;
  width: 1px;
  transform: translateX(-0.5px);
  background-image: linear-gradient(
    to bottom,
    var(--book-seam, #a2d9ce) 0,
    var(--book-seam, #a2d9ce) 6rpx,
    transparent 6rpx,
    transparent 16rpx
  );
  background-size: 1px 16rpx;
  background-repeat: repeat-y;
  pointer-events: none;
}

/* 翻页时纸下的极浅影子：从右页平滑滑到左页 */
.flip-shade {
  position: absolute;
  left: 53%;
  top: 9%;
  bottom: 9%;
  width: 44%;
  z-index: 3;
  border-radius: 50%;
  background: rgba(58, 58, 58, 0.055);
  filter: blur(40rpx);
  opacity: 0;
  transform: translateX(0);
  transition:
    transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.18s ease;
  pointer-events: none;
}

.flip-shade--on {
  opacity: 0.9;
}

.flip-shade--next.flip-shade--on {
  transform: translateX(-112%);
}

.flip-shade--prev {
  transform: translateX(-112%);
}

.flip-shade--prev.flip-shade--on {
  transform: translateX(0);
}

/* ==================== 翻页卡片 ==================== */

/* 一张轻纸：盖住右页，绕中缝（两页之间那条虚线）翻转。
   左边缘贴在右页左边，旋转轴却在 8rpx 外的中缝上——落定时正好盖住左页。 */
.flip {
  position: absolute;
  left: calc(50% + 8rpx);
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 4;
  transform-origin: -8rpx center;
  transform-style: preserve-3d;
  will-change: transform;
  pointer-events: none;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 往后翻：0 → -180°，落到左页 */
.flip--next.flip--on {
  transform: rotateY(-180deg);
}

/* 往前翻：-180° → 0°，从左页翻回右页 */
.flip--prev {
  transform: rotateY(-180deg);
}

.flip--prev.flip--on {
  transform: rotateY(0deg);
}

/* 纸面：与右页严丝合缝的小圆角与描边；翻过 90° 后换印左页目录 */
.flip-pane {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  background-color: var(--book-board, #ffffff);
  background-image:
    radial-gradient(
      circle at 18% 24%,
      var(--book-grain, rgba(58, 58, 58, 0.02)) 0 1px,
      transparent 1.5px
    ),
    radial-gradient(
      circle at 72% 66%,
      var(--book-grain, rgba(58, 58, 58, 0.02)) 0 1px,
      transparent 1.5px
    );
  background-size: 43rpx 53rpx, 71rpx 83rpx;
  border: 1px solid var(--book-hairline, rgba(43, 43, 40, 0.07));
  border-radius: 9rpx 8rpx 7rpx 8rpx;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.05);
}

/* 从纸背看字是反的：补一次水平镜像，让目录端端正正落回左页。
   .idx 满铺整张纸，镜像后左边距落在纸的另一侧，与左页完全对齐。 */
.flip-pane--back .idx {
  transform: scaleX(-1);
}

/* 贴着中缝的一线极浅灰，让飞起来的纸有一点折痕的呼吸 */
.flip-pane::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 24%;
  pointer-events: none;
  background: linear-gradient(to right, rgba(43, 43, 40, 0.035), rgba(43, 43, 40, 0));
}

/* 轻点书页边缘翻页（透明热区） */
.tap {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 26%;
  z-index: 5;
}

.tap--prev {
  left: 0;
}

.tap--next {
  right: 0;
}

/* ==================== 书下：一罐小星星（唯一收藏入口） ==================== */

.bottom {
  width: 100%;
  /* 书与罐之间至少留出 15vh 的呼吸；
     余下的高度全部由 auto margin 吃掉，把罐子推到页面中下方 */
  margin-top: auto;
  padding-top: 15vh;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 星星罐 = 收藏入口：160rpx，下面垫一层几乎化开的薄荷色，像落在纸上的影子 */
.jar-wrap {
  position: relative;
  width: 160rpx;
  height: 160rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  transform: scale(1);
  transform-origin: 50% 100%;
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.jar-wrap::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 4rpx;
  width: 144rpx;
  height: 30rpx;
  transform: translateX(-50%);
  border-radius: 50%;
  background: rgba(162, 217, 206, 0.2);
  filter: blur(18rpx);
}

.jar-wrap :deep(.doodle-icon) {
  position: relative;
  z-index: 1;
  /* 画框仍是 160rpx，插画本身把留白收掉一点，托底更稳 */
  transform: scale(1.18);
  transform-origin: center;
}

/* 被手指按住：整只罐子轻轻缩一下，像实体玻璃被按下去 */
.jar-wrap--pressed,
.jar-wrap:active {
  transform: scale(0.95) rotate(-1.2deg);
}

/* 空状态：罐子还在，星星还没攒到 —— 只留空玻璃罐与木塞 */
.bottom--empty :deep(.jar-star) {
  opacity: 0;
}

.jar-label {
  margin-top: 0;
  font-size: 22rpx;
  line-height: 1.6;
  letter-spacing: 0.1em;
  text-align: center;
  color: #c0c0c0;
}

/* ==================== 收集抽屉（V5.44：挑一个完成的目标收进册子，步骤随行） ==================== */

.collect-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 1200;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: flex-end;
}

.collect-panel {
  width: 100%;
  box-sizing: border-box;
  background-color: var(--book-board, #ffffff);
  border-radius: 16rpx 16rpx 0 0;
  padding: 0 40rpx calc(40rpx + env(safe-area-inset-bottom));
  max-height: 76vh;
  display: flex;
  flex-direction: column;
  animation: collect-up 240ms ease-out;
}

@keyframes collect-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

/* 顶部拖拽条：4rpx 灰色（与安排面板同一手势语言） */
.collect-bar {
  width: 72rpx;
  height: 4rpx;
  border-radius: 4rpx;
  background-color: #d9d9d9;
  margin: 16rpx auto 24rpx;
}

.collect-title {
  display: block;
  font-size: 30rpx;
  line-height: 1.5;
  color: var(--book-title, #3a3a3a);
}

.collect-sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--book-mute, #9a9a97);
}

.collect-list {
  max-height: 46vh;
  margin-top: 12rpx;
}

.collect-row {
  padding: 22rpx 0;
  border-bottom: 1rpx solid var(--book-hairline, #eeeeee);
}

.collect-row--pressed {
  background-color: rgba(245, 213, 184, 0.3);
}

.collect-row-title {
  display: block;
  font-size: 28rpx;
  line-height: 1.5;
  color: var(--book-title, #3a3a3a);
}

.collect-row-sub {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--book-mute, #9a9a97);
}

.collect-close {
  display: block;
  margin-top: 24rpx;
  text-align: center;
  font-size: 28rpx;
  color: var(--book-mute, #9a9a97);
}

/* 系统开启「减弱动态效果」：不做翻转与影子滑动 */
@media (prefers-reduced-motion: reduce) {
  .flip,
  .flip--on,
  .flip-shade {
    transition: none;
  }

  .collect-panel {
    animation: none;
  }
}
</style>
