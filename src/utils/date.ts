/**
 * 日期工具 —— 全项目唯一的日期计算入口
 *
 * 约定：
 * 1. 对外交互一律使用 yyyy-MM-dd 字符串（本地时区），杜绝跨时区歧义；
 * 2. 解析字符串时使用 new Date(y, m-1, d) 构造本地时间，
 *    禁止 new Date('2026-10-15')（该写法按 UTC 解析，会产生日期偏移 Bug）；
 * 3. 天差计算使用 Math.round(ms / 一天毫秒数)，天然抵消夏令时造成的 23/25 小时偏差。
 */

/** 一天的毫秒数（仅用于天差换算，禁止直接用于跨天日期累加） */
const DAY_MS = 24 * 60 * 60 * 1000;

/** 星期中文（下标 0 = 周日，与 Date.getDay() 一致） */
export const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'] as const;

/** 数字补零为两位字符串 */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Date → yyyy-MM-dd（本地时区） */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** yyyy-MM-dd → 当日 00:00 的本地 Date（非法字符串会得到 Invalid Date，调用方自行防御） */
export function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date(NaN);
  }
  return new Date(y, m - 1, d);
}

/** 今天的 yyyy-MM-dd */
export function todayStr(): string {
  return formatDate(new Date());
}

/** 日期字符串 ± N 天（内部用 Date.setDate 处理跨月/跨年） */
export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

/** 两个日期字符串相差的天数（b - a，可为负） */
export function diffDays(fromDateStr: string, toDateStr: string): number {
  const ms = parseDate(toDateStr).getTime() - parseDate(fromDateStr).getTime();
  return Math.round(ms / DAY_MS);
}

/** 星期几：0=周日 … 6=周六 */
export function weekdayOf(dateStr: string): number {
  return parseDate(dateStr).getDay();
}

/** 本周一的日期（中国习惯：周一为一周的开始） */
export function startOfWeek(dateStr: string): string {
  const weekday = parseDate(dateStr).getDay();
  const offset = (weekday + 6) % 7; // 周一 = 0 … 周日 = 6
  return addDays(dateStr, -offset);
}

/** 是否为今天 */
export function isToday(dateStr: string): boolean {
  return dateStr === todayStr();
}

/** 是否早于今天（用于「逾期」「已过期」判断） */
export function isBeforeToday(dateStr: string): boolean {
  return diffDays(todayStr(), dateStr) < 0;
}

/** 是否晚于今天 */
export function isAfterToday(dateStr: string): boolean {
  return diffDays(todayStr(), dateStr) > 0;
}

/**
 * 人性化日期文案：「今天」「明天」「昨天」，其余为「10月15日 周三」
 * 用于列表、卡片上的日期展示
 */
export function friendlyDate(dateStr: string): string {
  const delta = diffDays(todayStr(), dateStr);
  if (delta === 0) return '今天';
  if (delta === 1) return '明天';
  if (delta === -1) return '昨天';
  const d = parseDate(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAY_CN[d.getDay()]}`;
}

/** 带星期的完整展示：「10月15日 周三」 */
export function fullDateText(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAY_CN[d.getDay()]}`;
}
