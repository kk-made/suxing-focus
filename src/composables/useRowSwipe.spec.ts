/**
 * composables/useRowSwipe.ts 单元测试
 * ============================================================
 * 手势层是「滑动完成」的唯一判定点：这里覆盖触屏与鼠标两条路径——
 * 阈值 / 水平意图 / 竖向让位 / 补发 click 的吞掉标记 / 触屏后忽略模拟鼠标事件 / 单向方向。
 * node 环境下自建一个极小的 window / document 事件替身
 * （组合式函数只用到了 addEventListener / removeEventListener）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRowSwipe, type MouseLike, type TouchLike } from '@/composables/useRowSwipe';

/** 极简事件目标替身：注册 + 手动触发 + 计数 */
class FakeEventTarget {
  private listeners = new Map<string, Set<(e: unknown) => void>>();

  addEventListener(type: string, fn: (e: unknown) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  fire(type: string, ev: unknown = {}): void {
    this.listeners.get(type)?.forEach((fn) => fn(ev));
  }

  count(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

let win: FakeEventTarget;
let doc: FakeEventTarget;

beforeEach(() => {
  win = new FakeEventTarget();
  doc = new FakeEventTarget();
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 触摸点事件 */
function touch(x: number, y: number): TouchLike {
  return { touches: [{ clientX: x, clientY: y }] };
}

/** 鼠标事件（默认左键） */
function mouse(x: number, y: number, button = 0): MouseLike {
  return { clientX: x, clientY: y, button };
}

/** 建一个带完成记录的实例（direction 缺省 = 'both'，与旧行为一致） */
function makeSwipe(direction: 'both' | 'left' | 'right' = 'both') {
  const done: string[] = [];
  const swipe = useRowSwipe<string>({ direction, onComplete: (key) => done.push(key) });
  return { swipe, done };
}

describe('useRowSwipe 触屏路径', () => {
  it('右划 ≥ 48px：完成一次，并置一次性的 click 吞掉标记', () => {
    const { swipe, done } = makeSwipe();
    swipe.start('a', 'a', touch(100, 100));
    swipe.move(touch(160, 102));
    swipe.end(true);
    expect(done).toEqual(['a']);
    expect(swipe.consumeClickGuard()).toBe(true);
    expect(swipe.consumeClickGuard()).toBe(false);
  });

  it('右划不足 48px：不完成，但仍吞掉补发 click（本次手势已是滑动意图）', () => {
    const { swipe, done } = makeSwipe();
    swipe.start('a', 'a', touch(100, 100));
    swipe.move(touch(130, 100));
    swipe.end(true);
    expect(done).toEqual([]);
    expect(swipe.consumeClickGuard()).toBe(true);
  });

  it('轻点（无位移）：无痕复位，不吞 click', () => {
    const { swipe, done } = makeSwipe();
    swipe.start('a', 'a', touch(100, 100));
    swipe.end(true);
    expect(done).toEqual([]);
    expect(swipe.consumeClickGuard()).toBe(false);
  });

  it('竖向为主：放弃本次滑动，不完成也不吞 click（让位给滚动）', () => {
    const { swipe, done } = makeSwipe();
    swipe.start('a', 'a', touch(100, 100));
    swipe.move(touch(103, 140));
    swipe.end(true);
    expect(done).toEqual([]);
    expect(swipe.consumeClickGuard()).toBe(false);
  });

  it('越线后 touchcancel：只回弹，不完成也不吞 click', () => {
    const { swipe, done } = makeSwipe();
    swipe.start('a', 'a', touch(100, 100));
    swipe.move(touch(170, 100));
    swipe.end(false);
    expect(done).toEqual([]);
    expect(swipe.consumeClickGuard()).toBe(false);
  });
});

describe("useRowSwipe 单向方向（direction: 'left'，今日页左划完成）", () => {
  it('左划 ≥ 48px：跟手为负位移（阻尼 0.45、封顶 -32px），松手完成', () => {
    const { swipe, done } = makeSwipe('left');
    swipe.start('a', 'a', touch(200, 100));
    swipe.move(touch(140, 100));
    expect(swipe.rowStyle('a')?.transform).toBe('translateX(-27px)');
    swipe.move(touch(100, 100));
    expect(swipe.rowStyle('a')?.transform).toBe('translateX(-32px)'); // 封顶
    swipe.end(true);
    expect(done).toEqual(['a']);
    expect(swipe.consumeClickGuard()).toBe(true);
  });

  it('右划 ≥ 48px：不跟手、不完成，但仍吞掉补发 click', () => {
    const { swipe, done } = makeSwipe('left');
    swipe.start('a', 'a', touch(100, 100));
    swipe.move(touch(170, 100));
    expect(swipe.rowStyle('a')?.transform).toBe('translateX(0px)');
    swipe.end(true);
    expect(done).toEqual([]);
    expect(swipe.consumeClickGuard()).toBe(true);
  });

  it('左划不足 48px：不完成但仍吞 click（本次手势已是滑动意图）', () => {
    const { swipe, done } = makeSwipe('left');
    swipe.start('a', 'a', touch(200, 100));
    swipe.move(touch(170, 100));
    swipe.end(true);
    expect(done).toEqual([]);
    expect(swipe.consumeClickGuard()).toBe(true);
  });

  it('鼠标路径同样只认左向：向左拖拽完成，向右拖拽不完成', () => {
    const left = makeSwipe('left');
    left.swipe.startMouse('g1', 'g1', mouse(200, 120));
    win.fire('mousemove', { clientX: 140, clientY: 120 });
    expect(left.swipe.rowStyle('g1')?.transform).toBe('translateX(-27px)');
    win.fire('mouseup');
    expect(left.done).toEqual(['g1']);

    const right = makeSwipe('left');
    right.swipe.startMouse('g2', 'g2', mouse(100, 120));
    win.fire('mousemove', { clientX: 160, clientY: 120 });
    win.fire('mouseup');
    expect(right.done).toEqual([]);
  });
});

describe('useRowSwipe 鼠标路径（H5 桌面左键拖拽）', () => {
  it('拖拽 ≥ 48px：位移跟随（阻尼 0.45、封顶 32px），松手完成并解绑 window 监听', () => {
    const { swipe, done } = makeSwipe();
    swipe.startMouse('g1', 'g1', mouse(200, 120));
    win.fire('mousemove', { clientX: 260, clientY: 121 });
    expect(swipe.rowStyle('g1')?.transform).toBe('translateX(27px)');
    win.fire('mousemove', { clientX: 320, clientY: 121 });
    expect(swipe.rowStyle('g1')?.transform).toBe('translateX(32px)'); // 封顶
    win.fire('mouseup');
    expect(done).toEqual(['g1']);
    expect(swipe.consumeClickGuard()).toBe(true);
    expect(win.count('mousemove')).toBe(0);
    expect(win.count('mouseup')).toBe(0);
    expect(doc.count('mouseleave')).toBe(0);
  });

  it('拖拽不足 48px：不完成但吞掉 mouseup 后补发的 click', () => {
    const { swipe, done } = makeSwipe();
    swipe.startMouse('g1', 'g1', mouse(200, 120));
    win.fire('mousemove', { clientX: 230, clientY: 120 });
    win.fire('mouseup');
    expect(done).toEqual([]);
    expect(swipe.consumeClickGuard()).toBe(true);
  });

  it('轻点：不拦截后续 click', () => {
    const { swipe, done } = makeSwipe();
    swipe.startMouse('g1', 'g1', mouse(200, 120));
    win.fire('mouseup');
    expect(done).toEqual([]);
    expect(swipe.consumeClickGuard()).toBe(false);
  });

  it('非左键按下：不开始跟踪', () => {
    const { swipe, done } = makeSwipe();
    swipe.startMouse('g1', 'g1', mouse(200, 120, 2));
    win.fire('mousemove', { clientX: 300, clientY: 121 });
    win.fire('mouseup');
    expect(done).toEqual([]);
    expect(swipe.rowStyle('g1')).toBeUndefined();
    expect(win.count('mousemove')).toBe(0);
  });

  it('竖向拖拽让位滚动后：mouseup 仍吞掉补发 click（桌面拖拽总会补一次 click）', () => {
    const { swipe, done } = makeSwipe();
    swipe.startMouse('g1', 'g1', mouse(200, 100));
    win.fire('mousemove', { clientX: 203, clientY: 130 });
    win.fire('mouseup');
    expect(done).toEqual([]);
    expect(swipe.consumeClickGuard()).toBe(true);
  });

  it('指针拖出窗口（document mouseleave）：只回弹，不完成也不吞 click', () => {
    const { swipe, done } = makeSwipe();
    swipe.startMouse('g1', 'g1', mouse(200, 120));
    win.fire('mousemove', { clientX: 300, clientY: 120 });
    doc.fire('mouseleave');
    expect(done).toEqual([]);
    expect(swipe.consumeClickGuard()).toBe(false);
    expect(win.count('mousemove')).toBe(0);
    expect(doc.count('mouseleave')).toBe(0);
  });

  it('触屏之后的模拟鼠标事件（800ms 内）：忽略，不产生第二次完成', () => {
    const { swipe, done } = makeSwipe();
    swipe.start('a', 'a', touch(100, 100));
    swipe.move(touch(160, 100));
    swipe.end(true);
    expect(done).toEqual(['a']);
    swipe.consumeClickGuard();
    // 移动端浏览器在 touchend 后补发 mousedown / mousemove / mouseup
    swipe.startMouse('a2', 'a2', mouse(100, 100));
    win.fire('mousemove', { clientX: 200, clientY: 100 });
    win.fire('mouseup');
    expect(done).toEqual(['a']);
    expect(win.count('mousemove')).toBe(0);
  });

  it('未开始时调用 move / end：静默无副作用', () => {
    const { swipe, done } = makeSwipe();
    swipe.move(touch(120, 100));
    swipe.end(true);
    expect(done).toEqual([]);
    expect(swipe.consumeClickGuard()).toBe(false);
  });
});
