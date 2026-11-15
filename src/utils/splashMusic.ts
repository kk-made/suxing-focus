/**
 * 启动封面的背景音乐（原生播放器 + 构建期渲染好的 WAV）
 * ============================================================
 * 一段很轻的氛围垫：Am9 → Fmaj7 → Cmaj7 → Gsus2，每小节 4 秒，
 * 上面零星落几颗钟琴音 —— 与专注页「溯星」是同一份编曲。
 *
 * 为什么不再用 Web Audio：
 *   App 的逻辑层跑在独立 JS 引擎里，没有 window / AudioContext，
 *   实时合成在真机上完全静音。现在音频由 scripts/render-focus-audio.cjs
 *   离线渲染成 static/audio/splash.wav，用 uni.createInnerAudioContext 循环播放。
 *
 * 自动播放：H5 没有用户手势时可能被拦；App 若路径 / 解码失败也不会出声。
 * start() 统一等待原生 onPlay 事件，没等到就由界面显示斜杠音符，
 * 用户点一下再试一次（同时给出「点音符开声」提示）。
 */

import { createLoopPlayer, type LoopPlayer } from '@/services/loopPlayer';
import { localAudioSources } from '@/utils/audioSource';

export interface SplashMusic {
  /** 尝试开始 / 继续播放；被浏览器拦截时返回 false */
  start: () => Promise<boolean>;
  /** 静音（不关闭播放器，回来时能立刻续上） */
  mute: () => void;
  /** 取消静音；仍被拦截时返回 false */
  unmute: () => Promise<boolean>;
  /** 淡出并释放 */
  stop: () => void;
}

const SRC = '/static/audio/splash.wav';
const VOLUME = 0.5;
const FADE_IN = 1800;

export function createSplashMusic(): SplashMusic {
  let player: LoopPlayer | null = null;
  let muted = false;

  function ensure(): LoopPlayer {
    if (!player) {
      player = createLoopPlayer(localAudioSources(SRC), {
        volume: VOLUME,
        fadeIn: FADE_IN,
      });
    }
    return player;
  }

  return {
    async start(): Promise<boolean> {
      const p = ensure();
      p.setMuted(muted);
      p.start();
      // 两端都用原生 onPlay 事件判断是否真的出声；
      // H5 被自动播放策略拦下、App 解码/路径失败时都会超时返回 false。
      return p.waitForPlay(1800);
    },
    mute(): void {
      muted = true;
      player?.setMuted(true);
    },
    async unmute(): Promise<boolean> {
      muted = false;
      const p = ensure();
      p.setMuted(false);
      if (!p.isPlaying()) {
        p.start();
        return p.waitForPlay(1400);
      }
      return true;
    },
    stop(): void {
      const dying = player;
      player = null;
      if (!dying) {
        return;
      }
      dying.stop(700);
      setTimeout(() => dying.destroy(), 950);
    },
  };
}
