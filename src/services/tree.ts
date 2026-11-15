/**
 * 今日页「大树结果」的纯业务规则（无 UI / 无 store 依赖，方便单元测试）
 * ============================================================
 * 规则：学习时长 → 树上的果子数
 * - 只认「真实学习记录」聚合出来的分钟数（services/stats.minutesOnDate），不认计划时长；
 * - 每专注 FRUIT_MINUTES 分钟结一颗，满 MAX_FRUITS 颗封顶（树不会被压垮）；
 * - 撤销记录导致分钟数下降时，果子数同步减少（不做补偿）。
 */

/** 结一颗果子所需的专注分钟数 */
export const FRUIT_MINUTES = 30;

/** 树上最多挂几颗果子（5 颗 = 150 分钟封顶；再多树冠就挂不下了） */
export const MAX_FRUITS = 5;

/**
 * 今日已专注分钟 → 树上的果子数
 * 不足一颗的零头不计；非法输入（NaN / 负数）一律按 0 处理。
 */
export function fruitCount(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 0;
  }
  return Math.min(MAX_FRUITS, Math.floor(minutes / FRUIT_MINUTES));
}
