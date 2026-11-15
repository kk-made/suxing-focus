/**
 * 轻量 Pinia 持久化插件（自研，零额外依赖）
 * ============================================================
 * 用法：在 defineStore 第三个参数声明 persist：
 *   defineStore('goal', () => { ... }, { persist: true })            // 默认 key = store.$id
 *   defineStore('user', () => { ... }, { persist: { key: 'user' } }) // 自定义 key
 *
 * 为什么不用 pinia-plugin-persistedstate：
 * - 它主要面向 Web localStorage，uni-app 各端需要自定义 storage 适配；
 * - 本项目是本地单机应用，持久化逻辑保持自主可控，
 *   便于后续做本地数据迁移与导入导出，不涉及云端同步。
 */

import type { PiniaPlugin, PiniaPluginContext } from 'pinia';
import { readStorage, writeStorage } from '@/utils/storage';

/** 持久化配置 */
export interface StorePersistOption {
  /** 存储 key（默认取 store.$id），实际落盘时会加统一前缀 spa:store: */
  key?: string;
}

/** 为 defineStore 的配置参数扩展 persist 字段（类型声明合并） */
declare module 'pinia' {
  export interface DefineStoreOptionsBase<S, Store> {
    persist?: boolean | StorePersistOption;
  }
}

export function createPersistPlugin(): PiniaPlugin {
  return (context: PiniaPluginContext) => {
    const { store, options } = context;
    const persist = options.persist;
    if (!persist) {
      return;
    }

    const key = typeof persist === 'object' && persist.key ? persist.key : `store:${store.$id}`;

    // 1) 恢复：把上次落盘的状态整体写回 store
    //    （在订阅注册之前执行，不会产生回写循环）
    const saved = readStorage<Record<string, unknown> | null>(key, null);
    if (saved && typeof saved === 'object') {
      // 容错：只写回 store 上真实存在的 state 键，
      // 防止旧版本遗留字段污染 state（升级/降级场景）
      store.$patch((state) => {
        const target = state as unknown as Record<string, unknown>;
        for (const k of Object.keys(saved)) {
          if (k in target) {
            target[k] = saved[k];
          }
        }
      });
    }

    // 2) 持久：任何状态变化即写入本地
    //    detached: true —— 订阅不随组件卸载而销毁，与 store 生命周期一致
    //    说明：当前为「变化即写」，单次写是同步小 IO，性能可接受；
    //         若后续出现高频写入（如计时器每秒落盘），再引入节流。
    store.$subscribe(
      (_mutation, state) => {
        writeStorage(key, state);
      },
      { detached: true },
    );
  };
}
