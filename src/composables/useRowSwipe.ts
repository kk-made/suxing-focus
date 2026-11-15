/**
 * 行滑动（useRowSwipe）——「滑动完成任务」的通用手势层
 * ============================================================
 * 设计要点：
 * - 只做手势判定与视觉跟随（阻尼位移 + 松手回弹），「完成」动作由页面
 *   通过 onComplete 注入（今日页 = 左划直接完成计划条目；目标页 = 完成学习步骤 / 完成目标）；
 * - 方向：默认左右都算完成；页面可声明 direction: 'left' / 'right' 做单向手势
 *   （今日页 V5.29 只认左划）——单向时反方向不跟手、松手也不触发；
 * - 触屏入口 start/move/end 由页面模板的 touch 事件驱动；桌面鼠标入口 startMouse
 *   （仅左键）按下即开始跟踪，跟随与松手挂在 window 上，指针拖出窗口（document
 *   mouseleave）视为取消——只回弹、不触发完成；
 * - uni-h5 会改写 @mousedown 事件的 clientY（normalizeMouseEvent 减掉顶部栏高度），
 *   与挂在 window 上的 mousemove 原始坐标不一致：两者混用会让首帧 dy ≈ 顶部栏高度，
 *   水平拖拽被误判为「竖向」而当场放弃。因此桌面鼠标会话统一改用「原生坐标」——
 *   window 捕获相记录 mousedown 原始 clientX/clientY（registerRawMouseCapture），
 *   与 window mousemove 同源，判定与跟随全部在原始坐标系里进行；
 * - 触屏结束后的约 800ms 内忽略移动端补发的模拟鼠标事件，避免「一次触摸、两次会话」；
 * - 水平意图：|dx| > 14 且明显大于 |dy| 才算滑动；竖向为主时立即让位给页面滚动；
 * - 越线：松手时原始位移 ≥ 48px 才触发完成（视觉跟随阻尼 0.45、封顶 ±32px）；
 * - 滑动结束置一次性的 click 吞掉标记（400ms 内有效）：浏览器在 touchend /
 *   mouseup 后可能补发 click，由页面在轻点处理器里 consumeClickGuard() 消费，
 *   防止误触「进专注 / 完成切换」等动作。
 */

import { ref } from 'vue';

/** 触发完成所需的最小水平位移（px） */
const ACTION_PX = 48;
/** 视觉跟随：阻尼系数与位移上限 */
const FOLLOW_RATIO = 0.45;
const FOLLOW_MAX_PX = 32;
/** 水平意图判定阈值（px） */
const INTENT_DX = 14;
/** 竖向判定阈值（px）：超过则视为滚动，放弃本次滑动 */
const INTENT_DY = 18;
/** click 吞掉标记的有效期（毫秒）：覆盖浏览器补发 click 的时延 */
const GUARD_MS = 400;
/** 触屏结束后忽略模拟鼠标事件的时间窗（毫秒） */
const TOUCH_MOUSE_IGNORE_MS = 800;
/** 原生 mousedown 坐标的保鲜期（毫秒）：超过则认为与本次 startMouse 无关 */
const RAW_MOUSE_FRESH_MS = 1000;

/** 触摸事件的最小形状（兼容 uni 各端事件结构） */
export interface TouchLike {
  touches?: ArrayLike<{ clientX: number; clientY: number }>;
  changedTouches?: ArrayLike<{ clientX: number; clientY: number }>;
}

/** 鼠标事件的最小形状（H5 桌面端：左键按住拖拽 = 滑动） */
export interface MouseLike {
  clientX: number;
  clientY: number;
  button?: number;
}

function firstPoint(e: TouchLike): { x: number; y: number } | null {
  const t =
    (e.touches && e.touches.length > 0 ? e.touches[0] : null) ??
    (e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0] : null);
  return t ? { x: t.clientX, y: t.clientY } : null;
}

/* ==================== 原生 mousedown 坐标记录（模块级，全页共享） ==================== */

/** 最近一次原生 mousedown 的坐标与时间（window 捕获相写入） */
let lastRawMouse: { x: number; y: number; at: number } | null = null;
/** 捕获监听是否已挂上（避免多实例重复绑定） */
let rawMouseBound = false;

function onRawMouseDown(e: MouseEvent): void {
  lastRawMouse = { x: e.clientX, y: e.clientY, at: Date.now() };
}

/** 挂载捕获相监听（第一个使用手势层的页面创建时执行一次；非 H5 端自动跳过） */
function registerRawMouseCapture(): void {
  if (rawMouseBound || typeof window === 'undefined') {
    return;
  }
  rawMouseBound = true;
  window.addEventListener('mousedown', onRawMouseDown, true);
}

export interface RowSwipeOptions<T> {
  /** 越过阈值松手时执行（data = start 时传入的行数据） */
  onComplete: (data: T) => void;
  /** 判定为水平滑动时触发一次（例如：取消圆点长按判定） */
  onHorizontalIntent?: () => void;
  /**
   * 允许触发完成的方向（默认 'both' = 左右都算）：
   * - 'left' = 只有向左滑才完成（反方向不跟手、不触发；今日页左划完成）；
   * - 'right' = 只有向右滑才完成。
   * 只影响跟手与「完成」判定；竖向让位、click 吞掉标记等行为不变。
   */
  direction?: 'both' | 'left' | 'right';
}

export function useRowSwipe<T>(options: RowSwipeOptions<T>) {
  /** 正在滑动的行 key（'' = 无） */
  const swipeKey = ref('');
  /** 阻尼后的跟随位移（px） */
  const swipeDx = ref(0);
  /** 松手回弹中（此时才启用 transform 过渡） */
  const swipeSpring = ref(false);

  let active = false;
  let intent = false;
  /** 本次会话被判定为竖向（已让位给滚动）——鼠标路径用它在结束后吞掉补发 click */
  let abandoned = false;
  /** 本次会话由鼠标发起（触屏拖拽不会产生补发 click，不需要额外吞） */
  let fromMouse = false;
  let startX = 0;
  let startY = 0;
  let rawDx = 0;
  let payload: T | null = null;
  let springTimer: ReturnType<typeof setTimeout> | null = null;
  let guardUntil = 0;
  /** 最近一次触屏开始的时间戳（用于忽略触屏补发的模拟鼠标事件） */
  let lastTouchAt = 0;
  /** 鼠标跟随 / 松手是否已挂到 window 上 */
  let mouseBound = false;

  // 页面创建即挂上原生坐标记录：必须早于任何一次 mousedown 的捕获相
  registerRawMouseCapture();

  /** 允许的完成方向（默认左右都算；单向手势由页面声明，如今日页只认左划） */
  const direction = options.direction ?? 'both';

  /** 位移是否落在允许方向上（'both' 恒真；'left' 只认 dx < 0） */
  function directionHit(dx: number): boolean {
    if (direction === 'both') {
      return true;
    }
    return direction === 'left' ? dx < 0 : dx > 0;
  }

  /** 公共开局：校验并记录起点、复位上一轮的计时器（触屏与鼠标共用） */
  function begin(key: string, data: T, x: number, y: number, viaMouse: boolean): void {
    if (active) {
      return;
    }
    unbindMouse();
    if (springTimer !== null) {
      clearTimeout(springTimer);
      springTimer = null;
    }
    active = true;
    intent = false;
    abandoned = false;
    fromMouse = viaMouse;
    startX = x;
    startY = y;
    rawDx = 0;
    payload = data;
    swipeKey.value = key;
    swipeDx.value = 0;
    swipeSpring.value = false;
  }

  /** 触屏开始跟踪（页面确认该行可滑动后调用；payload 将在 onComplete 中原样带回） */
  function start(key: string, data: T, e: TouchLike): void {
    const p = firstPoint(e);
    if (!p) {
      return;
    }
    lastTouchAt = Date.now();
    begin(key, data, p.x, p.y, false);
  }

  /** 鼠标（左键）开始跟踪：H5 桌面端按住卡片 / 行右划 */
  function startMouse(key: string, data: T, e: MouseLike): void {
    if (e.button !== undefined && e.button !== 0) {
      return; // 只认左键
    }
    if (Date.now() - lastTouchAt < TOUCH_MOUSE_IGNORE_MS) {
      return; // 触屏补发的模拟鼠标事件：忽略
    }
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return; // 非 H5 端没有鼠标路径
    }
    // uni-h5 传给 @mousedown 的 clientY 被减过顶部栏高度（与 mousemove 不同源），
    // 优先采用捕获相记录的原生坐标；拿不到（如单测直接调用）才退回事件坐标。
    let x = e.clientX;
    let y = e.clientY;
    if (lastRawMouse !== null && Date.now() - lastRawMouse.at < RAW_MOUSE_FRESH_MS) {
      x = lastRawMouse.x;
      y = lastRawMouse.y;
    }
    begin(key, data, x, y, true);
    if (active) {
      bindMouse();
    }
  }

  function move(e: TouchLike): void {
    if (!active) {
      return;
    }
    const p = firstPoint(e);
    if (!p) {
      return;
    }
    const dx = p.x - startX;
    const dy = p.y - startY;
    if (!intent) {
      if (Math.abs(dx) > INTENT_DX && Math.abs(dx) > Math.abs(dy) * 1.2) {
        intent = true;
        options.onHorizontalIntent?.();
      } else if (Math.abs(dy) > INTENT_DY && Math.abs(dy) >= Math.abs(dx)) {
        // 竖向为主：让位给页面滚动，放弃本次滑动
        active = false;
        abandoned = true;
        payload = null;
        swipeKey.value = '';
        return;
      } else {
        return;
      }
    }
    rawDx = dx;
    // 单向手势：反方向不跟手（跟手位移锁在 0）
    const follow = directionHit(dx) ? dx * FOLLOW_RATIO : 0;
    swipeDx.value = Math.max(-FOLLOW_MAX_PX, Math.min(FOLLOW_MAX_PX, follow));
  }

  /** 松手（trigger = false 用于 touchcancel / 指针拖出窗口：只回弹、不触发完成） */
  function end(trigger: boolean): void {
    unbindMouse();
    if (!active) {
      // 竖向放弃的鼠标拖拽：mouseup 后浏览器仍会补发一次 click，吞掉避免误触
      if (trigger && fromMouse && abandoned) {
        guardUntil = Date.now() + GUARD_MS;
        abandoned = false;
      }
      return;
    }
    if (!intent) {
      // 只是一次轻点 / 微动：立即复位，不留任何状态
      active = false;
      payload = null;
      swipeKey.value = '';
      swipeDx.value = 0;
      return;
    }
    const hit =
      trigger && payload !== null && directionHit(rawDx) && Math.abs(rawDx) >= ACTION_PX;
    const done = payload;
    active = false;
    intent = false;
    payload = null;
    if (trigger) {
      guardUntil = Date.now() + GUARD_MS;
    }
    if (hit && done !== null) {
      options.onComplete(done);
    }
    // 视觉：回弹 240ms 后彻底清空
    swipeDx.value = 0;
    swipeSpring.value = true;
    springTimer = setTimeout(() => {
      springTimer = null;
      swipeKey.value = '';
      swipeSpring.value = false;
    }, 260);
  }

  /* ==================== 鼠标跟随：挂在 window 上 ==================== */

  function onWindowMouseMove(e: MouseEvent): void {
    move({ touches: [{ clientX: e.clientX, clientY: e.clientY }] });
  }

  function onWindowMouseUp(): void {
    end(true);
  }

  function onDocumentMouseLeave(): void {
    end(false); // 指针拖出窗口：只回弹，不触发完成
  }

  function bindMouse(): void {
    if (mouseBound || typeof window === 'undefined') {
      return;
    }
    mouseBound = true;
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    document.addEventListener('mouseleave', onDocumentMouseLeave);
  }

  function unbindMouse(): void {
    if (!mouseBound || typeof window === 'undefined') {
      return;
    }
    mouseBound = false;
    window.removeEventListener('mousemove', onWindowMouseMove);
    window.removeEventListener('mouseup', onWindowMouseUp);
    document.removeEventListener('mouseleave', onDocumentMouseLeave);
  }

  /** 行内联样式：跟随位移；松手后启用过渡回弹 */
  function rowStyle(key: string): Record<string, string> | undefined {
    if (swipeKey.value !== key) {
      return undefined;
    }
    return {
      transform: `translateX(${swipeDx.value}px)`,
      transition: swipeSpring.value ? 'transform 240ms ease' : 'none',
    };
  }

  /** 消费一次性的 click 吞掉标记（true = 本次 click 应被忽略） */
  function consumeClickGuard(): boolean {
    const active = Date.now() <= guardUntil;
    guardUntil = 0;
    return active;
  }

  return {
    swipeKey,
    swipeDx,
    swipeSpring,
    start,
    startMouse,
    move,
    end,
    rowStyle,
    consumeClickGuard,
  };
}
