/**
 * 用户与偏好设置 store
 * ============================================================
 * 职责：本地单机设置（主题、每日可学时长、可学习日、专注背景音乐）。
 * 所有偏好只写入本机 localStorage，不登录、不上传。
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { FocusMusicStyle, ThemeMode, UserSettings } from '@/types/models';
import { applyTheme } from '@/utils/theme';

const MUSIC_STYLES: FocusMusicStyle[] = ['stardust', 'splash', 'tide', 'night', 'papermoon'];

function isFocusMusicStyle(value: unknown): value is FocusMusicStyle {
  return typeof value === 'string' && (MUSIC_STYLES as string[]).includes(value);
}

/** 默认设置（首次启动时初始化） */
function defaultSettings(): UserSettings {
  const now = Date.now();
  return {
    nickname: '同学',
    themeMode: 'system',
    dailyAvailableMinutes: 120, // 默认每天可安排 2 小时
    studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6], // 默认每天可学习
    focusMusicEnabled: true, // 专注页默认播放背景音乐
    focusMusicStyle: 'stardust', // 默认「星屑」；「溯星」是启动封面原曲
    createdAt: now,
    updatedAt: now,
  };
}

export const useUserStore = defineStore(
  'user',
  () => {
    /** 是否已完成初始化（App onLaunch 调用 init 后为 true） */
    const initialized = ref(false);
    /** 今日页「指路小注」是否已确认（V5.7 一次性：点过「知道了」后不再出现） */
    const todayHowtoConfirmed = ref(false);
    const settings = ref<UserSettings>(defaultSettings());

    /**
     * 初始化：首次启动写入默认设置；老数据做字段级容错（版本升级后缺字段）
     * 并在初始化时按用户设置应用主题。
     */
    function init(): void {
      if (!settings.value.createdAt) {
        // 首次启动：整体写入默认设置
        settings.value = defaultSettings();
      } else {
        // 已有数据：用默认值补齐可能缺失的新字段（升级容错），保留用户已有值
        const def = defaultSettings();
        // V5.68：旧版「白噪音」偏好迁移为背景音乐；旧字段读一次后移除
        const legacy = settings.value as UserSettings & {
          focusNoiseEnabled?: boolean;
          focusNoiseType?: string;
        };
        const next: UserSettings & {
          focusNoiseEnabled?: boolean;
          focusNoiseType?: string;
        } = {
          ...def,
          ...legacy,
          // studyDaysOfWeek 若为空数组属于用户有意为之，不做补全
          focusMusicEnabled:
            typeof legacy.focusMusicEnabled === 'boolean'
              ? legacy.focusMusicEnabled
              : legacy.focusNoiseEnabled ?? def.focusMusicEnabled,
          focusMusicStyle: isFocusMusicStyle(legacy.focusMusicStyle)
            ? legacy.focusMusicStyle
            : def.focusMusicStyle,
        };
        delete next.focusNoiseEnabled;
        delete next.focusNoiseType;
        settings.value = next;
      }
      initialized.value = true;
      applyTheme(settings.value.themeMode);
    }

    /**
     * 确认今日页「指路小注」（V5.7 一次性）：确认后不再出现；
     * 完整用法收在「我的 · 使用指南」，不靠常驻小注。
     */
    function confirmTodayHowto(): void {
      todayHowtoConfirmed.value = true;
    }

    /** 切换主题模式并立即生效 */
    function setThemeMode(mode: ThemeMode): void {
      settings.value.themeMode = mode;
      settings.value.updatedAt = Date.now();
      applyTheme(mode);
    }

    /** 设置每日可学习时长（阶段3规则引擎的排期上限依据），限幅 15 分钟 ~ 12 小时 */
    function setDailyAvailableMinutes(minutes: number): void {
      settings.value.dailyAvailableMinutes = Math.min(720, Math.max(15, Math.round(minutes)));
      settings.value.updatedAt = Date.now();
    }

    /** 切换某星期是否可学习（0=周日 … 6=周六） */
    function toggleStudyDay(day: number): void {
      const set = new Set(settings.value.studyDaysOfWeek);
      if (set.has(day)) {
        set.delete(day);
      } else {
        set.add(day);
      }
      settings.value.studyDaysOfWeek = Array.from(set).sort((a, b) => a - b);
      settings.value.updatedAt = Date.now();
    }

    /** 专注页背景音乐开关与风格（V5.68） */
    function setFocusMusicEnabled(enabled: boolean): void {
      settings.value.focusMusicEnabled = enabled;
      settings.value.updatedAt = Date.now();
    }

    function setFocusMusicStyle(style: FocusMusicStyle): void {
      settings.value.focusMusicStyle = style;
      settings.value.updatedAt = Date.now();
    }

    /** 恢复默认设置（「我的-重置」等场景） */
    function resetSettings(): void {
      settings.value = defaultSettings();
      applyTheme(settings.value.themeMode);
    }

    return {
      initialized,
      todayHowtoConfirmed,
      settings,
      init,
      confirmTodayHowto,
      setThemeMode,
      setDailyAvailableMinutes,
      toggleStudyDay,
      setFocusMusicEnabled,
      setFocusMusicStyle,
      resetSettings,
    };
  },
  { persist: true },
);
