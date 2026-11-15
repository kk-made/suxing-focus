/**
 * 领域模型定义 —— 全局唯一数据契约
 * ============================================================
 * 本地单机应用：所有实体只写入本机 localStorage，不联网、不同步。
 * 约定（所有实体统一遵守）：
 *
 * 1. 所有实体都带 id / createdAt / updatedAt：本地数据恢复、导入导出与后续迁移的稳定标识。
 *
 * 2. deletedAt 为软删除标记（null = 未删除）：保留历史，避免误删后无法回溯。
 *
 * 3. 字符串/数字字段一律给默认值（空串 / 0），不使用 undefined：
 *    JSON 序列化对 undefined 的处理各端不一致。
 *
 * 4. 日期类字段一律使用本地时区的 yyyy-MM-dd 字符串（如 "2026-10-15"），
 *    时间戳类字段统一为毫秒数（number），全部由 utils/date.ts 统一处理。
 */

/** 优先级：低 / 中 / 高 */
export type Priority = 'low' | 'medium' | 'high';

/** 目标状态：进行中 / 已完成 / 已归档 */
export type GoalStatus = 'active' | 'completed' | 'archived';

/** 学习目标，例如「通过 CET-6」「学完线性代数」 */
export interface Goal {
  id: string;
  /** 目标标题（必填） */
  title: string;
  /** 补充说明（可为空串） */
  description: string;
  /** 分类标签，如「英语」（可为空串） */
  category: string;
  /** 截止日期 yyyy-MM-dd（空串 = 无截止日期） */
  deadline: string;
  /** 目标投入时长预算（分钟，0 = 未设置） */
  totalMinutes: number;
  /**
   * 每日学习时长（分钟，0 = 未设置；V5.30 编辑页「每日学习时长」胶囊）：
   * 目标详情元信息里给一行「每天 X 分钟」；
   * 旧数据可能缺失，读取处一律 `?? 0` 兜底
   */
  dailyMinutes: number;
  priority: Priority;
  status: GoalStatus;
  /**
   * 目标完成时间戳（V5.23：标记完成时记下，重新激活时清空；
   * 成就收藏集里「目标页」的完成日期；旧数据可能缺失，读取处一律 `?? 0` 兜底）
   */
  completedAt: number | null;
  /** 卡片主题色（空串 = 使用默认色） */
  color: string;
  createdAt: number;
  updatedAt: number;
  /** 软删除时间戳（null = 未删除） */
  deletedAt: number | null;
}

/** 任务状态：待办 / 进行中 / 已完成 / 已归档（V5.22：归档 = 完成后的「收入囊中」，收进成就收藏集） */
export type TaskStatus = 'todo' | 'doing' | 'done' | 'archived';

/** 任务是目标的拆分执行单元（全部由用户手动创建，本地保存） */
export interface Task {
  id: string;
  /** 所属目标 id */
  goalId: string;
  title: string;
  /** 预估学习时长（分钟），规则引擎排期依据 */
  estimateMinutes: number;
  priority: Priority;
  status: TaskStatus;
  /** 完成时间戳（null = 未完成）；完成是艾宾浩斯复习计划的触发点（阶段4） */
  doneAt: number | null;
  /**
   * 完成后是否排入艾宾浩斯复习（V5.41，默认 true）；
   * 一次性步骤可关掉。旧数据可能缺失，读取处一律 `!== false` 兜底
   */
  reviewEnabled: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** 计划来源：手动安排 / 规则引擎自动排期 */
export type PlanSource = 'manual' | 'auto';

/** 计划条目状态：待完成 / 已完成 / 已跳过 */
export type PlanStatus = 'pending' | 'done' | 'skipped';

/** 计划条目：某天要做的某项任务（手动排 + 自动排的产物，是「每日计划」的最小单位） */
export interface PlanItem {
  id: string;
  /** 归属日期 yyyy-MM-dd（本地时区） */
  date: string;
  taskId: string;
  goalId: string;
  /** 本次计划投入时长（分钟），规则引擎按剩余时长动态调整 */
  plannedMinutes: number;
  /** 当日排序序号（从 0 开始，升序展示） */
  order: number;
  source: PlanSource;
  status: PlanStatus;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** 学习记录：一次计时（或手动补录）的最终结果，只增不改，是统计的唯一数据源 */
export interface StudyLog {
  id: string;
  /** 关联任务 id（空串 = 自由学习，不关联任何任务） */
  taskId: string;
  goalId: string;
  planItemId: string;
  /** 会话开始时间戳（存在暂停时，endAt - startAt 不等于学习时长） */
  startAt: number;
  /** 会话结束时间戳 */
  endAt: number;
  /** 实际学习时长（分钟）：由计时器累计的真实学习毫秒计算（不含暂停），禁止手填 */
  durationMinutes: number;
  /** 归属日期 yyyy-MM-dd（以结束时间所在本地日期为准） */
  date: string;
  note: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/**
 * 学习计时会话（阶段4：本机状态，与可同步的实体区分开）
 * ============================================================
 * - 只持久化在本机（spa:store:timer），不参与任何联网同步；
 * - 计时基于时间戳而非 setInterval 计秒：页面切走、应用被系统节流也不丢时间；
 * - lastTickAt 为运行期间的心跳（每 30 秒写入一次）：应用被杀后重启时，
 *   按其截断运行时间并自动暂停，防止把离线数天的时间误算为学习时长。
 */
export interface TimerSession {
  taskId: string;
  goalId: string;
  /** 关联的计划条目 id（空串 = 无关联条目） */
  planItemId: string;
  /** 任务标题快照（任务改名/删除后，计时卡片仍能正确显示） */
  taskTitle: string;
  /** 会话开始时间戳（毫秒） */
  startedAt: number;
  /** 已累计学习毫秒（不含当前运行段） */
  accumulatedMs: number;
  /** 当前运行段的起始时间戳；暂停中为 null */
  lastResumeAt: number | null;
  /** 是否正在运行 */
  running: boolean;
  /** 运行期间的心跳时间戳（重启恢复时按此截断离线时间） */
  lastTickAt: number;
  /** 应用重启后自动暂停的标记（首页计时卡片提示用户确认） */
  pausedByRestore: boolean;
}

/**
 * 艾宾浩斯复习项：任务完成后由代码创建（阶段4），
 * 间隔与下次复习时间全部由代码按 src/services/constants.ts 的间隔表计算，AI 不参与。
 */
export interface ReviewItem {
  id: string;
  /** 来源任务 id */
  taskId: string;
  goalId: string;
  /** 当前复习阶段索引（对应 REVIEW_INTERVALS_DAYS 的下标，0 = 第 1 次复习） */
  stage: number;
  /** 下次复习时间戳 */
  nextReviewAt: number;
  /** 上次完成复习时间戳（null = 从未复习） */
  lastReviewedAt: number | null;
  /** 已完成的复习次数 */
  reviewCount: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** 主题模式：跟随系统 / 浅色 / 深色 */
export type ThemeMode = 'system' | 'light' | 'dark';

/** 专注背景音乐：星屑 / 溯星 / 潮汐 / 夜航 / 纸月（V5.68，V5.69 增补封面原曲） */
export type FocusMusicStyle = 'stardust' | 'splash' | 'tide' | 'night' | 'papermoon';

/* ============================================================
 * 输入契约（表单/调用方 → store 的入参形状，与实体区分开）
 * ============================================================ */

/** 新建目标时的输入（其余字段由 store 补默认值） */
export interface GoalDraft {
  title: string;
  description?: string;
  category?: string;
  deadline?: string;
  totalMinutes?: number;
  /** 每日学习时长（分钟，0 / 省略 = 未设置；V5.30） */
  dailyMinutes?: number;
  priority?: Priority;
  color?: string;
}

/** 新建任务时的输入 */
export interface TaskDraft {
  goalId: string;
  title: string;
  estimateMinutes?: number;
  priority?: Priority;
  /** 完成后是否排入复习（省略 = 默认开启） */
  reviewEnabled?: boolean;
}

/** 用户设置（本地单机，只存本机） */
export interface UserSettings {
  nickname: string;
  themeMode: ThemeMode;
  /** 每天可安排的学习时长（分钟），阶段3规则引擎的排期上限依据 */
  dailyAvailableMinutes: number;
  /** 每周可学习日：0=周日 … 6=周六 */
  studyDaysOfWeek: number[];
  /** 专注页是否播放背景音乐（默认开；V5.68） */
  focusMusicEnabled: boolean;
  /** 背景音乐风格（默认「星屑」；V5.68） */
  focusMusicStyle: FocusMusicStyle;
  createdAt: number;
  updatedAt: number;
}
