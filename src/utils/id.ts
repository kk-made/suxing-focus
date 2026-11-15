/**
 * 本地 ID 生成器
 *
 * 为什么不使用 crypto.randomUUID：
 * - 小程序 / 部分 Android WebView 中不可用；
 * - 离线优先架构下 ID 由本地生成，云端只做去重校验，不做重新分配。
 *
 * 方案：时间戳（36 进制）+ 随机段，单机产生冲突的概率可忽略。
 */

/**
 * 生成一个本地唯一 ID
 * @param prefix 可选前缀，便于人工排查（如 'g_' 表示 goal）
 */
export function genId(prefix = ''): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}${ts}${rand}`;
}
