/**
 * 转轮震动反馈的纯规则（无 UI / 无 uni 依赖，方便单测）
 * ============================================================
 * picker-view 的 @change 只在停稳后触发，拿不到滚动过程中的档位；
 * 页面在 pickstart~pickend 之间轮询内容位移，这里负责：
 * - 由「内容相对位移」换算当前档位（四舍五入到最近一档，越界夹紧）；
 * - 50ms 节流：拨得再快，马达每秒最多响应 20 次。
 */

/** 两次震动之间的最短间隔（毫秒） */
export const WHEEL_HAPTIC_THROTTLE_MS = 50;

/**
 * 根据内容位移计算当前档位
 * @param originRel 手势开始时标定的基准（内容相对 picker 的 top + 起始档位 × 项高）
 * @param rel       当前内容相对 picker 的 top
 * @param itemHeight 单档高度（px，从实际 DOM 量取）
 * @param maxIndex  最大档位下标
 */
export function wheelIndexFromOffset(
  originRel: number,
  rel: number,
  itemHeight: number,
  maxIndex: number,
): number {
  if (!Number.isFinite(itemHeight) || itemHeight <= 0) {
    return 0;
  }
  const raw = Math.round((originRel - rel) / itemHeight);
  return Math.min(maxIndex, Math.max(0, raw));
}

/** 节流判定：lastAt = 0 表示本次手势还没震动过 */
export function canHaptic(
  now: number,
  lastAt: number,
  throttle = WHEEL_HAPTIC_THROTTLE_MS,
): boolean {
  return lastAt === 0 || now - lastAt >= throttle;
}
