/**
 * 本地存储封装 —— 本地单机架构的地基
 *
 * 设计要点：
 * 1. 统一 key 前缀（spa: = Study Plan Assistant），避免与平台/三方 key 冲突；
 * 2. 显式 JSON 序列化：各端对对象自动转换的行为不一致，显式处理保证跨端一致；
 * 3. 读取失败一律返回兜底值：宁可丢一次数据，也绝不让页面崩溃；
 * 4. 预留 schemaVersion：将来本地数据结构升级时在此做迁移。
 */

import { SCHEMA_VERSION } from './storage-version';

/** 存储 key 统一前缀 */
const PREFIX = 'spa:';

/** 版本号存储 key（不带业务数据，单独维护） */
const VERSION_KEY = `${PREFIX}schemaVersion`;

/**
 * 读取并反序列化
 * @param key      业务 key（不含前缀）
 * @param fallback 读取失败/无数据时的兜底值
 */
export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = uni.getStorageSync(PREFIX + key);
    // 无数据：uni 各端返回 '' 或 null 或 undefined，统一视为无数据
    if (raw === '' || raw === null || raw === undefined) {
      return fallback;
    }
    // 历史版本可能直接存了对象（uni 会自动转换），这里兼容两种形态
    if (typeof raw === 'string') {
      return JSON.parse(raw) as T;
    }
    return raw as T;
  } catch (e) {
    console.warn('[storage] 读取失败，已返回兜底值:', key, e);
    return fallback;
  }
}

/**
 * 序列化并写入
 * @param key   业务 key（不含前缀）
 * @param value 需要持久化的数据（必须可 JSON 序列化）
 */
export function writeStorage<T>(key: string, value: T): void {
  try {
    uni.setStorageSync(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    // 存储写失败（如空间满）：记录后静默，不阻断业务
    console.warn('[storage] 写入失败:', key, e);
  }
}

/** 删除单个 key */
export function removeStorage(key: string): void {
  try {
    uni.removeStorageSync(PREFIX + key);
  } catch (e) {
    console.warn('[storage] 删除失败:', key, e);
  }
}

/** 清空本应用（spa: 前缀）的全部本地数据，不影响其他 key */
export function clearAppStorage(): void {
  try {
    const info = uni.getStorageInfoSync();
    info.keys
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => uni.removeStorageSync(k));
  } catch (e) {
    console.warn('[storage] 清空失败:', e);
  }
}

/** 读取本地数据结构版本（0 = 从未初始化过） */
export function getStoredSchemaVersion(): number {
  try {
    const v = uni.getStorageSync(VERSION_KEY);
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (e) {
    return 0;
  }
}

/** 写入本地数据结构版本 */
export function setStoredSchemaVersion(version: number): void {
  try {
    uni.setStorageSync(VERSION_KEY, String(version));
  } catch (e) {
    console.warn('[storage] 写入版本号失败:', e);
  }
}

/**
 * 检查并对齐本地数据结构版本（App onLaunch 时调用一次）
 * 阶段1：只做对齐；将来 stored < SCHEMA_VERSION 时在此编写逐级迁移逻辑。
 */
export function ensureSchemaVersion(): void {
  const stored = getStoredSchemaVersion();
  if (stored === SCHEMA_VERSION) {
    return;
  }
  if (stored > 0 && stored < SCHEMA_VERSION) {
    // 本地结构升级迁移逻辑写在此处（当前 v1 为初始版本，无需迁移）
    console.warn(`[storage] 本地数据结构 v${stored} → v${SCHEMA_VERSION}，当前无迁移逻辑，直接对齐`);
  }
  setStoredSchemaVersion(SCHEMA_VERSION);
}
