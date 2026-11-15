/**
 * 专注页背景音乐（原生播放器 + 构建期渲染好的 WAV）
 * ============================================================
 * 五首同一气质、但各自独立的四小节小曲（编曲数据见 focusScores.ts）：
 * - 星屑：轻垫音 + 零星钟琴；
 * - 溯星：启动封面原曲；
 * - 潮汐：更慢的低音 + 下行分解和弦；
 * - 夜航：低音心跳 + 夜行分解和弦，更暗；
 * - 纸月：音乐盒般的五声音阶旋律。
 *
 * 为什么不再用 Web Audio：
 *   App 的逻辑层跑在独立 JS 引擎里，没有 window / AudioContext，
 *   实时合成在真机上完全静音（H5 才听得到）。现在音频由
 *   scripts/render-focus-audio.cjs 离线渲染成 static/audio/*.wav，
 *   两端统一用 uni.createInnerAudioContext 循环播放。
 *
 * 纪律：
 * - 只在专注页「驻足」且计时运行、页面可见时播放；暂停、结束、离开淡出；
 * - 切换风格时新旧两轨交叉淡化，不会突然断掉；
 * - 所有原生调用都包了 try/catch，任一平台不支持也不阻断页面。
 */

import type { FocusMusicStyle } from '@/types/models';
import { localAudioSources } from '@/utils/audioSource';
import { createLoopPlayer, type LoopPlayer } from './loopPlayer';

export interface FocusMusicOption {
  id: FocusMusicStyle;
  label: string;
  hint: string;
}

/** 底部选项顺序：星屑 → 溯星（封面原曲）→ 潮汐 → 夜航 → 纸月 */
export const FOCUS_MUSIC_OPTIONS: FocusMusicOption[] = [
  { id: 'stardust', label: '星屑', hint: '轻垫音 + 零星钟琴，封面同一种音色' },
  { id: 'splash', label: '溯星', hint: '启动封面原曲：Am9 → Fmaj7 → Cmaj7 → Gsus2' },
  { id: 'tide', label: '潮汐', hint: '慢拍低音与下行分解和弦，像潮水退去' },
  { id: 'night', label: '夜航', hint: '低音心跳 + 夜行分解和弦，更深更暗' },
  { id: 'papermoon', label: '纸月', hint: '音乐盒般的五声音阶旋律，亮而轻' },
];

/** 每首曲子的音频文件（构建期渲染，见 scripts/render-focus-audio.cjs） */
const AUDIO_FILES: Record<FocusMusicStyle, string> = {
  stardust: '/static/audio/stardust.wav',
  splash: '/static/audio/splash.wav',
  tide: '/static/audio/tide.wav',
  night: '/static/audio/night.wav',
  papermoon: '/static/audio/papermoon.wav',
};

/** 背景乐的目标音量：轻，但手机上听得见 */
const VOLUME = 0.55;

let player: LoopPlayer | null = null;
let playing = false;
let currentStyle: FocusMusicStyle = 'stardust';

/** 是否支持背景音乐（InnerAudioContext 两端都有，永远为真） */
export function focusMusicSupported(): boolean {
  return typeof uni !== 'undefined' && typeof uni.createInnerAudioContext === 'function';
}

/** H5 时代的「手势唤醒」补丁；原生播放器不需要，保留空实现兼容调用点 */
export function primeFocusMusic(): void {
  // no-op
}

/** 开始 / 继续背景音乐（重复调用不会叠音） */
export function startFocusMusic(): void {
  if (playing && player) {
    return;
  }
  playing = true;
  player = createLoopPlayer(localAudioSources(AUDIO_FILES[currentStyle]), {
    volume: VOLUME,
    fadeIn: 1600,
  });
  player.start();
}

/** 等当前曲目真正出声（用户点选声景后用于给出失败提示） */
export function waitFocusMusicStarted(ms = 1400): Promise<boolean> {
  if (!playing || !player) {
    return Promise.resolve(false);
  }
  return player.waitForPlay(ms);
}

/** 暂停背景音乐：淡出后停掉这一轨 */
export function stopFocusMusic(): void {
  if (!playing && !player) {
    return;
  }
  playing = false;
  const dying = player;
  player = null;
  dying?.stop(600);
  // 淡出结束后释放原生播放器
  setTimeout(() => dying?.destroy(), 900);
}

/** 切换曲子：正在播放时新旧两轨交叉淡化，暂停时只记住选择 */
export function setFocusMusicStyle(style: FocusMusicStyle): void {
  if (style === currentStyle) {
    return;
  }
  currentStyle = style;
  if (!playing) {
    return;
  }
  const old = player;
  player = createLoopPlayer(localAudioSources(AUDIO_FILES[style]), {
    volume: VOLUME,
    fadeIn: 1200,
  });
  player.start();
  old?.stop(800);
  setTimeout(() => old?.destroy(), 1100);
}
