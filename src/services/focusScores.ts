/**
 * 五首专注背景音乐的编曲数据（纯数据，不含播放逻辑）
 * ============================================================
 * 每首是四小节一圈：垫音和弦 + 低音 / 心跳 + 钟琴、拨弦、软音。
 * - 运行时由 scripts/render-focus-audio.cjs 读取本文件，离线渲染成
 *   src/static/audio/*.wav（44100Hz 立体声），再交给 uni.createInnerAudioContext 循环播放；
 * - App 的逻辑层没有 Web Audio，所以真机上必须走这条「文件 + 原生播放器」的路线。
 */

import type { FocusMusicStyle } from '@/types/models';

type NoteKind = 'bell' | 'pluck' | 'soft';

interface Note {
  /** 相对这一轮循环起点的秒数 */
  at: number;
  midi: number;
  gain: number;
  kind: NoteKind;
  pan?: number;
}

interface Score {
  /** 垫音和弦（MIDI），每小节一个 */
  chords: number[][];
  /** 每小节秒数 */
  bar: number;
  /** 低通截止（Hz） */
  filter: number;
  /** 这一轨的目标音量 */
  level: number;
  /** 垫音相对音量 */
  padGain: number;
  padAttack: number;
  padRelease: number;
  /** 垫音里三角波的比例（越小越软，越大越有木质感） */
  padTriangle?: number;
  /** 垫音在每小节之后多留的尾音（秒，默认 1.6） */
  padTail?: number;
  /** 低音根音（MIDI），每小节一个；省略 = 没有低音层 */
  bass?: number[];
  bassGain?: number;
  bassDecay?: number;
  /** 低音心跳：每小节在这些偏移处落一下 */
  pulse?: { midi: number; offsets: number[]; gain: number };
  /** 钟琴 / 分解和弦 / 旋律，偏移是相对整轮循环的绝对值 */
  notes: Note[];
}

/** MIDI 音高 → Hz（A4 = 69 = 440Hz） */
function hz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const FOCUS_SCORES: Record<FocusMusicStyle, Score> = {
  // 星屑：封面同一种音色，但换了一首新曲子
  stardust: {
    chords: [
      [50, 57, 60, 64, 65], // Dm9
      [43, 50, 57, 62], // Gsus2
      [48, 55, 59, 64], // Cmaj7
      [45, 52, 55, 59, 60], // Am9
    ],
    bar: 4.2,
    filter: 2400,
    level: 0.34,
    padGain: 1,
    padAttack: 1.5,
    padRelease: 1.5,
    notes: [
      { at: 0.5, midi: 69, gain: 0.045, kind: 'bell' }, // A4
      { at: 2.6, midi: 76, gain: 0.045, kind: 'bell' }, // E5
      { at: 4.7, midi: 74, gain: 0.04, kind: 'bell' }, // D5
      { at: 6.8, midi: 83, gain: 0.04, kind: 'bell' }, // B5
      { at: 8.9, midi: 79, gain: 0.04, kind: 'bell' }, // G5
      { at: 11.0, midi: 86, gain: 0.038, kind: 'bell' }, // D6
      { at: 13.1, midi: 76, gain: 0.042, kind: 'bell' }, // E5
      { at: 15.2, midi: 81, gain: 0.038, kind: 'bell' }, // A5
    ],
  },
  // 溯星：启动封面原曲，和 splashMusic.ts 完全同一编曲
  splash: {
    chords: [
      [45, 52, 55, 59, 60], // Am9
      [41, 48, 52, 57], // Fmaj7
      [48, 55, 59, 64], // Cmaj7
      [43, 50, 57, 62], // Gsus2
    ],
    bar: 4,
    filter: 2300,
    level: 0.36,
    padGain: 0.8,
    padAttack: 1.5,
    padRelease: 1.5,
    padTail: 1.4,
    notes: [
      { at: 0.5, midi: 69, gain: 0.04, kind: 'bell', pan: -0.3 }, // A4
      { at: 2.3, midi: 76, gain: 0.04, kind: 'bell', pan: 0.32 }, // E5
      { at: 4.9, midi: 72, gain: 0.04, kind: 'bell', pan: -0.3 }, // C5
      { at: 6.7, midi: 79, gain: 0.04, kind: 'bell', pan: 0.32 }, // G5
      { at: 8.6, midi: 76, gain: 0.04, kind: 'bell', pan: -0.3 }, // E5
      { at: 10.5, midi: 74, gain: 0.04, kind: 'bell', pan: 0.32 }, // D5
      { at: 13.1, midi: 69, gain: 0.04, kind: 'bell', pan: -0.3 }, // A4
      { at: 14.9, midi: 72, gain: 0.04, kind: 'bell', pan: 0.32 }, // C5
    ],
  },
  // 潮汐：更慢的低音、下行分解和弦、很疏的高音
  tide: {
    chords: [
      [50, 57, 60, 64, 65], // Dm9
      [46, 53, 57, 62], // B♭maj7
      [41, 48, 52, 57], // Fmaj7
      [48, 55, 62, 67], // Csus2
    ],
    bar: 5.2,
    filter: 1750,
    level: 0.36,
    padGain: 1,
    padAttack: 2.4,
    padRelease: 2.4,
    padTriangle: 0.2,
    bass: [38, 46, 53, 48], // D2 · B♭2 · F3 · C3
    bassGain: 0.038,
    bassDecay: 4.8,
    notes: [
      { at: 0.6, midi: 69, gain: 0.03, kind: 'soft', pan: -0.22 }, // A4
      { at: 2.2, midi: 65, gain: 0.028, kind: 'soft', pan: 0.18 }, // F4
      { at: 3.8, midi: 64, gain: 0.026, kind: 'soft', pan: -0.12 }, // E4
      { at: 5.8, midi: 62, gain: 0.03, kind: 'soft', pan: 0.22 }, // D4
      { at: 7.4, midi: 58, gain: 0.028, kind: 'soft', pan: -0.18 }, // B♭3
      { at: 9.0, midi: 53, gain: 0.024, kind: 'soft', pan: 0.12 }, // F3
      { at: 11.0, midi: 60, gain: 0.03, kind: 'soft', pan: -0.22 }, // C4
      { at: 12.6, midi: 57, gain: 0.028, kind: 'soft', pan: 0.18 }, // A3
      { at: 14.2, midi: 53, gain: 0.024, kind: 'soft', pan: -0.12 }, // F3
      { at: 16.2, midi: 62, gain: 0.03, kind: 'soft', pan: 0.22 }, // D4
      { at: 17.8, midi: 60, gain: 0.028, kind: 'soft', pan: -0.18 }, // C4
      { at: 19.4, midi: 55, gain: 0.024, kind: 'soft', pan: 0.12 }, // G3
      { at: 3.4, midi: 81, gain: 0.018, kind: 'bell', pan: 0.3 }, // A5
      { at: 9.6, midi: 86, gain: 0.016, kind: 'bell', pan: -0.3 }, // D6
      { at: 14.8, midi: 84, gain: 0.016, kind: 'bell', pan: 0.28 }, // C6
      { at: 19.0, midi: 79, gain: 0.016, kind: 'bell', pan: -0.28 }, // G5
    ],
  },
  // 夜航：低音心跳 + 夜行分解和弦，低通压到 1.25kHz
  night: {
    chords: [
      [40, 47, 50, 54, 55], // Em9
      [48, 55, 59, 64], // Cmaj7
      [45, 52, 55, 59, 60], // Am9
      [47, 54, 57, 62], // Bm7
    ],
    bar: 4.8,
    filter: 1250,
    level: 0.35,
    padGain: 0.98,
    padAttack: 2.0,
    padRelease: 2.0,
    padTriangle: 0.5,
    bass: [40, 36, 45, 47], // E2 · C2 · A2 · B2
    bassGain: 0.042,
    bassDecay: 4.2,
    pulse: { midi: 40, offsets: [0, 0.5], gain: 0.05 },
    notes: [
      { at: 0.8, midi: 59, gain: 0.034, kind: 'pluck', pan: -0.2 }, // B3
      { at: 2.4, midi: 55, gain: 0.032, kind: 'pluck', pan: 0.2 }, // G3
      { at: 4.0, midi: 52, gain: 0.03, kind: 'pluck', pan: -0.1 }, // E3
      { at: 5.6, midi: 64, gain: 0.034, kind: 'pluck', pan: 0.2 }, // E4
      { at: 7.2, midi: 59, gain: 0.032, kind: 'pluck', pan: -0.2 }, // B3
      { at: 8.8, midi: 55, gain: 0.03, kind: 'pluck', pan: 0.1 }, // G3
      { at: 10.4, midi: 60, gain: 0.034, kind: 'pluck', pan: -0.2 }, // C4
      { at: 12.0, midi: 57, gain: 0.032, kind: 'pluck', pan: 0.2 }, // A3
      { at: 13.6, midi: 52, gain: 0.03, kind: 'pluck', pan: -0.1 }, // E3
      { at: 15.2, midi: 54, gain: 0.034, kind: 'pluck', pan: 0.2 }, // F♯3
      { at: 16.8, midi: 62, gain: 0.032, kind: 'pluck', pan: -0.2 }, // D4
      { at: 18.4, midi: 59, gain: 0.03, kind: 'pluck', pan: 0.1 }, // B3
      { at: 6.4, midi: 76, gain: 0.014, kind: 'bell', pan: 0.3 }, // E5
      { at: 16.0, midi: 71, gain: 0.014, kind: 'bell', pan: -0.3 }, // B4
    ],
  },
  // 纸月：音乐盒般的 F 大调五声旋律，节奏与音区都和前三首明显不同
  papermoon: {
    chords: [
      [41, 48, 52, 57], // Fmaj7
      [45, 52, 55, 60], // Am7
      [50, 57, 60, 64, 65], // Dm9
      [48, 55, 59, 64], // Cmaj7
    ],
    bar: 3.2,
    filter: 3400,
    level: 0.33,
    padGain: 0.45,
    padAttack: 0.9,
    padRelease: 0.9,
    padTriangle: 0.3,
    bass: [41, 45, 50, 48], // F2 · A2 · D3 · C3
    bassGain: 0.032,
    bassDecay: 1.8,
    notes: [
      // 第一小节：F5 A5 C6 A5 F5
      { at: 0.0, midi: 77, gain: 0.042, kind: 'pluck', pan: -0.15 },
      { at: 0.6, midi: 81, gain: 0.038, kind: 'pluck', pan: 0.15 },
      { at: 1.2, midi: 84, gain: 0.04, kind: 'pluck', pan: -0.1 },
      { at: 2.0, midi: 81, gain: 0.034, kind: 'pluck', pan: 0.1 },
      { at: 2.5, midi: 77, gain: 0.036, kind: 'pluck', pan: -0.15 },
      // 第二小节：E5 A5 C6 A5 E5
      { at: 3.2, midi: 76, gain: 0.042, kind: 'pluck', pan: 0.15 },
      { at: 3.8, midi: 81, gain: 0.038, kind: 'pluck', pan: -0.15 },
      { at: 4.4, midi: 84, gain: 0.04, kind: 'pluck', pan: 0.1 },
      { at: 5.2, midi: 81, gain: 0.034, kind: 'pluck', pan: -0.1 },
      { at: 5.7, midi: 76, gain: 0.036, kind: 'pluck', pan: 0.15 },
      // 第三小节：D5 F5 A5 C6 A5
      { at: 6.4, midi: 74, gain: 0.042, kind: 'pluck', pan: -0.15 },
      { at: 7.0, midi: 77, gain: 0.038, kind: 'pluck', pan: 0.15 },
      { at: 7.6, midi: 81, gain: 0.04, kind: 'pluck', pan: -0.1 },
      { at: 8.4, midi: 84, gain: 0.036, kind: 'pluck', pan: 0.1 },
      { at: 8.9, midi: 81, gain: 0.034, kind: 'pluck', pan: -0.15 },
      // 第四小节：G5 C6 E6 D6 C6
      { at: 9.6, midi: 79, gain: 0.042, kind: 'pluck', pan: 0.15 },
      { at: 10.2, midi: 84, gain: 0.038, kind: 'pluck', pan: -0.15 },
      { at: 10.8, midi: 88, gain: 0.04, kind: 'pluck', pan: 0.1 },
      { at: 11.6, midi: 86, gain: 0.034, kind: 'pluck', pan: -0.1 },
      { at: 12.1, midi: 84, gain: 0.036, kind: 'pluck', pan: 0.15 },
    ],
  },
};
