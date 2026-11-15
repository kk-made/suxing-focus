/**
 * 循环背景音乐播放器（uni.createInnerAudioContext）
 * ============================================================
 * 为什么不用 Web Audio：
 *   App 的逻辑层跑在独立 JS 引擎里，没有 window / AudioContext，
 *   实时合成的写法在真机上完全静音 —— 只有 H5 能听到。
 *   改成原生 InnerAudioContext + 构建期渲染好的 WAV（scripts/render-focus-audio.cjs），
 *   App 与 H5 走同一条路径，声音完全一致。
 *
 * 真机纪律（V5.76）：
 * - App 端本地资源可能要用 `_www/static/...`；传入候选地址，onError 时自动换下一个；
 * - App 端不从 0 音量起步，直接把音量给到位——原生播放器的音量更新在部分机型上
 *   不可靠，从 0 淡入可能一直静音；H5 仍然保留柔和的音量包络；
 * - 用 onPlay / onError 事件判断是否真的出声（不能只看 paused），
 *   启动封面据此决定是否显示「点音符开声」。
 */

export interface LoopPlayerOptions {
  /** 目标音量 0~1（默认 0.6） */
  volume?: number;
  /** 淡入时长（ms，默认 600；仅 H5 生效） */
  fadeIn?: number;
}

export interface LoopPlayer {
  /** 开始播放（已在播放则忽略） */
  start: () => void;
  /** 淡出后停止；ms = 0 表示立即停止 */
  stop: (ms?: number) => void;
  /** 静音 / 取消静音（不打断播放进度） */
  setMuted: (muted: boolean) => void;
  /** 当前是否真的在出声 */
  isPlaying: () => boolean;
  /** 等待真正收到 play 事件（超时返回 false；用于自动播放被拦时降级） */
  waitForPlay: (ms?: number) => Promise<boolean>;
  /** 释放原生播放器 */
  destroy: () => void;
}

type InnerAudio = ReturnType<typeof uni.createInnerAudioContext>;

interface Waiter {
  resolve: (ok: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** H5 有 window 才做音量淡入；App 逻辑层没有 window，音量直接给到位 */
const CAN_FADE = typeof window !== 'undefined';

export function createLoopPlayer(
  input: string | string[],
  options: LoopPlayerOptions = {},
): LoopPlayer {
  const sources = (Array.isArray(input) ? input : [input]).filter(Boolean);
  const target = Math.max(0, Math.min(1, options.volume ?? 0.6));
  const fadeIn = options.fadeIn ?? 600;

  let sourceIndex = 0;
  let audio: InnerAudio | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let volume = CAN_FADE ? 0 : target;
  let muted = false;
  let wanted = false;
  let played = false;
  let disposed = false;
  let waiters: Waiter[] = [];

  function settle(ok: boolean): void {
    const pending = waiters;
    waiters = [];
    pending.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.resolve(ok);
    });
  }

  function apply(): void {
    if (!audio) {
      return;
    }
    try {
      audio.volume = muted ? 0 : Math.max(0, Math.min(1, volume));
    } catch {
      // 个别机型/版本不支持音量：保持默认音量即可
    }
  }

  function clearTimer(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** 当前地址播放失败时换下一个候选（App 的 _www / static / 绝对路径） */
  function tryNextSource(): boolean {
    if (disposed || !wanted || sourceIndex + 1 >= sources.length) {
      return false;
    }
    sourceIndex += 1;
    const old = audio;
    audio = null;
    played = false;
    try {
      old?.stop();
      old?.destroy();
    } catch {
      // 已释放
    }
    // 重试就直接给到目标音量，避免换路径后停在 0
    volume = target;
    let next: InnerAudio;
    try {
      next = ensure();
      next.play();
    } catch (err) {
      console.warn('[loop-player] 重试 play 失败', sources[sourceIndex], err);
      return false;
    }
    apply();
    return true;
  }

  function ensure(): InnerAudio {
    if (audio) {
      return audio;
    }
    if (sourceIndex >= sources.length) {
      throw new Error('no audio source');
    }
    const src = sources[sourceIndex];
    const ctx = uni.createInnerAudioContext();
    ctx.loop = true;
    ctx.autoplay = false;
    ctx.volume = muted ? 0 : volume;
    // iOS 静音键只该静掉系统提示音，不该掐掉用户主动打开的背景乐
    try {
      ctx.obeyMuteSwitch = false;
    } catch {
      // 旧版本无此属性
    }
    // 先挂事件再赋 src：个别原生实现会在加载失败时立刻同步抛 onError
    ctx.onPlay(() => {
      played = true;
      settle(true);
    });
    // 少数机型在 src 刚赋值时 play 会被忽略，等 canplay 再补一次
    ctx.onCanplay(() => {
      if (!wanted || audio !== ctx) {
        return;
      }
      // 有些原生播放器会在加载完成后重置音量：这里补一次目标音量
      apply();
      if (ctx.paused) {
        try {
          ctx.play();
        } catch {
          // 下一次事件再试
        }
      }
    });
    ctx.onError((err) => {
      if (audio !== ctx) {
        return;
      }
      console.warn('[loop-player] 播放失败', src, err);
      if (tryNextSource()) {
        return;
      }
      settle(false);
    });
    ctx.src = src;
    audio = ctx;
    return ctx;
  }

  function fadeTo(to: number, ms: number, done?: () => void): void {
    clearTimer();
    const from = volume;
    if (ms <= 0) {
      volume = to;
      apply();
      done?.();
      return;
    }
    const startedAt = Date.now();
    timer = setInterval(() => {
      const k = Math.min(1, (Date.now() - startedAt) / ms);
      volume = from + (to - from) * k;
      apply();
      if (k >= 1) {
        clearTimer();
        done?.();
      }
    }, 40);
  }

  return {
    start(): void {
      wanted = true;
      if (!audio) {
        try {
          ensure();
        } catch {
          settle(false);
          return;
        }
      }
      const ctx = audio;
      if (!ctx) {
        return;
      }
      if (!played || ctx.paused) {
        try {
          ctx.play();
        } catch (err) {
          console.warn('[loop-player] play 失败', sources[sourceIndex], err);
        }
      }
      if (CAN_FADE) {
        volume = 0;
        apply();
        fadeTo(target, fadeIn);
      } else {
        volume = target;
        apply();
      }
    },
    stop(ms = 600): void {
      wanted = false;
      if (!audio) {
        settle(false);
        return;
      }
      const ctx = audio;
      fadeTo(0, ms, () => {
        try {
          ctx.stop();
        } catch {
          // 已停止
        }
      });
    },
    setMuted(next: boolean): void {
      muted = next;
      apply();
    },
    isPlaying(): boolean {
      return Boolean(audio && !audio.paused);
    },
    waitForPlay(ms = 1400): Promise<boolean> {
      if (played && audio && !audio.paused) {
        return Promise.resolve(true);
      }
      if (!wanted) {
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        const waiter: Waiter = {
          resolve,
          timer: setTimeout(() => {
            waiters = waiters.filter((item) => item !== waiter);
            // 少数原生播放器不派发 onPlay，但 paused 已变 false：视为已出声
            resolve(Boolean(audio && !audio.paused));
          }, ms),
        };
        waiters.push(waiter);
      });
    },
    destroy(): void {
      wanted = false;
      disposed = true;
      clearTimer();
      settle(false);
      if (audio) {
        try {
          audio.stop();
          audio.destroy();
        } catch {
          // 已释放
        }
        audio = null;
      }
    },
  };
}
