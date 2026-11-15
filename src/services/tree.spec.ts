/**
 * services/tree.ts 单元测试
 * 覆盖：学习时长 → 果子数（阈值 / 零头 / 封顶 / 非法输入）
 */

import { describe, expect, it } from 'vitest';
import { FRUIT_MINUTES, MAX_FRUITS, fruitCount } from '@/services/tree';

describe('fruitCount', () => {
  it('未学习 / 非法输入 = 0 颗', () => {
    expect(fruitCount(0)).toBe(0);
    expect(fruitCount(-12)).toBe(0);
    expect(fruitCount(Number.NaN)).toBe(0);
    expect(fruitCount(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('不足一颗的零头不计', () => {
    expect(fruitCount(1)).toBe(0);
    expect(fruitCount(FRUIT_MINUTES - 1)).toBe(0);
    expect(fruitCount(FRUIT_MINUTES * 2 - 1)).toBe(1);
  });

  it('每满一个阈值结一颗', () => {
    expect(fruitCount(FRUIT_MINUTES)).toBe(1);
    expect(fruitCount(FRUIT_MINUTES * 2)).toBe(2);
    expect(fruitCount(FRUIT_MINUTES * 3 + 12)).toBe(3);
  });

  it('封顶后不再增加', () => {
    expect(fruitCount(FRUIT_MINUTES * MAX_FRUITS)).toBe(MAX_FRUITS);
    expect(fruitCount(FRUIT_MINUTES * MAX_FRUITS + 300)).toBe(MAX_FRUITS);
  });
});
