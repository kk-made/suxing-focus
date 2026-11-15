/**
 * 业务常量集中定义（纯代码计算的参数都放在这里，便于审阅与调整）
 * 原则：排期、日期、数量、复习间隔一律代码计算，禁止让 AI 参与计算。
 */

/**
 * 艾宾浩斯复习间隔表（单位：天）
 * 含义：任务完成当天记为第 0 天；完成后的第 1、2、4、7、15、30、60 天各复习一次。
 * 下标即 ReviewItem.stage：stage = 0 表示等待第 1 次复习（完成日 + 1 天）。
 */
export const REVIEW_INTERVALS_DAYS: readonly number[] = [1, 2, 4, 7, 15, 30, 60];

/** 学习记录的最小有效时长（分钟）：小于该值时不计入统计（防止误触） */
export const MIN_VALID_LOG_MINUTES = 1;

/** 默认任务预估时长（分钟），约一个番茄钟 */
export const DEFAULT_TASK_ESTIMATE_MINUTES = 25;

/**
 * 未拆步骤的目标「整块」安排时的默认预估时长（分钟）
 * 目标设了「每日学习时长」则用该值（V5.31：目标本身就是一步）
 */
export const GOAL_UNIT_DEFAULT_MINUTES = 30;

/**
 * 一条到期复习的预计时长（分钟）
 * 用途：排期时把「当日到期的复习」按固定值预留进每日额度。
 * 复习节点由遗忘曲线代码计算（见 REVIEW_INTERVALS_DAYS），时长不做逐条估算，统一按此常量计入。
 */
export const REVIEW_ESTIMATE_MINUTES = 10;
