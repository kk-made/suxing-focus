/**
 * 表单校验纯函数（所有规则集中此处，页面只负责展示错误）
 * 返回值约定：null = 通过；字符串 = 给用户看的错误文案。
 */

import type { GoalDraft, TaskDraft } from '@/types/models';
import { formatDate, parseDate } from '@/utils/date';

/** 标题类字段最大长度 */
export const TITLE_MAX_LENGTH = 50;

/** 任务预估时长合法范围（分钟） */
export const TASK_ESTIMATE_MIN = 5;
export const TASK_ESTIMATE_MAX = 600;

/**
 * 校验日期字符串是否为合法的 yyyy-MM-dd
 * 除格式外还校验真实存在性（如 2026-02-30 会被 Date 归一到 03-02，回环比对即可识别）
 */
export function isValidDateStr(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const d = parseDate(dateStr);
  return !Number.isNaN(d.getTime()) && formatDate(d) === dateStr;
}

/** 校验目标表单，通过返回 null */
export function validateGoalDraft(draft: GoalDraft): string | null {
  const title = draft.title.trim();
  if (!title) {
    return '请填写目标标题';
  }
  if (title.length > TITLE_MAX_LENGTH) {
    return `目标标题最多 ${TITLE_MAX_LENGTH} 个字`;
  }
  if (draft.deadline && !isValidDateStr(draft.deadline)) {
    return '截止日期不正确';
  }
  if (draft.totalMinutes !== undefined) {
    if (Number.isNaN(draft.totalMinutes) || draft.totalMinutes < 0) {
      return '时长预算需为不小于 0 的数字';
    }
    if (draft.totalMinutes > 100000) {
      return '时长预算过大，请核对';
    }
  }
  if (draft.dailyMinutes !== undefined) {
    if (Number.isNaN(draft.dailyMinutes) || draft.dailyMinutes < 0) {
      return '每日学习时长需为不小于 0 的数字';
    }
    if (draft.dailyMinutes > 480) {
      return '每日学习时长过大，请核对';
    }
  }
  if (draft.description && draft.description.length > 200) {
    return '补充说明最多 200 个字';
  }
  if (draft.category && draft.category.length > 10) {
    return '分类最多 10 个字';
  }
  return null;
}

/** 校验任务表单，通过返回 null */
export function validateTaskDraft(draft: Pick<TaskDraft, 'title' | 'estimateMinutes'>): string | null {
  const title = draft.title.trim();
  if (!title) {
    return '请填写任务名称';
  }
  if (title.length > TITLE_MAX_LENGTH) {
    return `任务名称最多 ${TITLE_MAX_LENGTH} 个字`;
  }
  const minutes = draft.estimateMinutes;
  if (minutes !== undefined) {
    if (Number.isNaN(minutes)) {
      return '预估时长需为数字';
    }
    if (minutes < TASK_ESTIMATE_MIN) {
      return `预估时长至少 ${TASK_ESTIMATE_MIN} 分钟`;
    }
    if (minutes > TASK_ESTIMATE_MAX) {
      return `预估时长最多 ${TASK_ESTIMATE_MAX} 分钟`;
    }
  }
  return null;
}
