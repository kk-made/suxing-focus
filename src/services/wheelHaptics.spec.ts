import { describe, expect, it } from 'vitest';
import { WHEEL_HAPTIC_THROTTLE_MS, canHaptic, wheelIndexFromOffset } from './wheelHaptics';

const H = 53.4896;

describe('wheelIndexFromOffset', () => {
  it('停在第 21 档时返回 21', () => {
    expect(wheelIndexFromOffset(0, -21 * H, H, 93)).toBe(21);
  });

  it('向下滚动超过半档才进到下一档', () => {
    expect(wheelIndexFromOffset(0, -21.49 * H, H, 93)).toBe(21);
    expect(wheelIndexFromOffset(0, -21.51 * H, H, 93)).toBe(22);
  });

  it('向上滚动超过半档才退到上一档', () => {
    expect(wheelIndexFromOffset(0, -20.51 * H, H, 93)).toBe(21);
    expect(wheelIndexFromOffset(0, -20.49 * H, H, 93)).toBe(20);
  });

  it('越界时夹紧到首尾档', () => {
    expect(wheelIndexFromOffset(0, 2 * H, H, 93)).toBe(0);
    expect(wheelIndexFromOffset(0, -200 * H, H, 93)).toBe(93);
  });

  it('项高非法时回到 0，不抛错', () => {
    expect(wheelIndexFromOffset(0, -100, 0, 93)).toBe(0);
    expect(wheelIndexFromOffset(0, -100, Number.NaN, 93)).toBe(0);
  });
});

describe('canHaptic', () => {
  it('本次手势第一次一定触发', () => {
    expect(canHaptic(1000, 0)).toBe(true);
  });

  it('50ms 内不重复触发', () => {
    expect(canHaptic(1049, 1000)).toBe(false);
  });

  it('满 50ms 后允许下一次', () => {
    expect(canHaptic(1050, 1000)).toBe(true);
    expect(WHEEL_HAPTIC_THROTTLE_MS).toBe(50);
  });
});
