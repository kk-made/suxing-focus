/**
 * 把 focusMusic.ts 里的五首编曲离线渲染成 WAV（44100Hz / 立体声 / 16bit）
 * ============================================================
 * 为什么需要这一步：
 *   App 的逻辑层跑在 JS 引擎里（没有 window / Web Audio），
 *   所以「驻足」和「启动封面」的音乐必须由 uni.createInnerAudioContext 播真实音频文件。
 *   这里用纯 JS 复刻 focusMusic.ts 里的合成参数（垫音 / 低音 / 心跳 / 钟琴），
 *   渲染成一圈无缝循环的 WAV，H5 与 App 共用同一份文件，两端听起来完全一致。
 *
 * 用法：node scripts/render-focus-audio.cjs
 * 产物：src/static/audio/{stardust,splash,tide,night,papermoon}.wav
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src/services/focusScores.ts');
const OUT_DIR = path.join(ROOT, 'src/static/audio');
const SR = 44100;
const TAIL = 3.4; // 最长尾音（钟琴 3.2s）

/* ---------- 1. 从源码里取出 SCORES 数据（保持与页面上完全同一份编曲） ---------- */
function loadScores() {
  const text = fs.readFileSync(SRC, 'utf8');
  const start = text.indexOf('const FOCUS_SCORES');
  if (start < 0) throw new Error('SCORES not found');
  const braceStart = text.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = nl < 0 ? text.length : nl;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close < 0 ? text.length : close + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') i += 1;
        i += 1;
      }
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error('SCORES literal not closed');
  const literal = text.slice(braceStart, end);
  // eslint-disable-next-line no-new-func
  return new Function('return ' + literal)();
}

/* ---------- 2. 基础波形 ---------- */
const TAU = Math.PI * 2;
const midiToHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const sine = (phase) => Math.sin(TAU * phase);
const triangle = (phase) => {
  const p = phase - Math.floor(phase);
  return 4 * Math.abs(p - 0.5) - 1;
};

function panGains(pan = 0) {
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

/* ---------- 3. 各类声部（参数与 focusMusic.ts 一一对应） ---------- */
function addPad(buf, midi, at, dur, peak, attack, release, tri) {
  const f = midiToHz(midi);
  const fDetuned = f * Math.pow(2, 6 / 1200);
  const a = Math.min(attack, dur * 0.45);
  const r = Math.min(release, dur * 0.5);
  const holdStart = a;
  const holdEnd = Math.max(a, dur - r);
  const endSample = Math.min(buf.frames - 1, Math.floor((at + dur) * SR));
  const startSample = Math.max(0, Math.floor(at * SR));
  for (let i = startSample; i <= endSample; i += 1) {
    const t = i / SR - at;
    let env;
    if (t < a) env = peak * (t / Math.max(a, 1e-6));
    else if (t < holdEnd) env = peak;
    else env = peak * Math.max(0, 1 - (t - holdEnd) / Math.max(dur - holdEnd, 1e-6));
    if (env <= 0) continue;
    const v = sine(f * t) + tri * triangle(fDetuned * t);
    buf.l[i] += v * env;
    buf.r[i] += v * env;
  }
}

function addTone(buf, midi, at, opts) {
  const f = midiToHz(midi);
  const segEnd = Math.min(buf.frames - 1, Math.floor((at + opts.decay) * SR));
  const start = Math.max(0, Math.floor(at * SR));
  const [gl, gr] = panGains(opts.pan);
  for (let i = start; i <= segEnd; i += 1) {
    const t = i / SR - at;
    let env;
    if (t < opts.attack) env = opts.gain * (t / Math.max(opts.attack, 1e-6));
    else {
      // exponentialRampToValueAtTime：从当前值指数滑到 1e-4
      const k = Math.max(0, (t - opts.attack) / Math.max(opts.decay - opts.attack, 1e-6));
      env = opts.gain * Math.pow(1e-4 / opts.gain, k);
    }
    if (env <= 1e-5) continue;
    let v = opts.wave(f * t);
    if (opts.harmonic) v += opts.harmonicGain * sine(f * opts.harmonic * t);
    buf.l[i] += v * env * gl;
    buf.r[i] += v * env * gr;
  }
}

function addBass(buf, midi, at, dur, gain) {
  const f = midiToHz(midi);
  const segEnd = Math.min(buf.frames - 1, Math.floor((at + dur) * SR));
  const start = Math.max(0, Math.floor(at * SR));
  const decayStart = Math.max(0.12, dur - 0.9);
  for (let i = start; i <= segEnd; i += 1) {
    const t = i / SR - at;
    let env;
    if (t < 0.08) env = gain * (t / 0.08);
    else if (t < decayStart) env = gain;
    else env = gain * Math.pow(1e-4 / gain, (t - decayStart) / Math.max(dur - decayStart, 1e-6));
    if (env <= 1e-5) continue;
    const v = triangle(f * t);
    buf.l[i] += v * env;
    buf.r[i] += v * env;
  }
}

function addPulse(buf, midi, at, gain) {
  const f = midiToHz(midi);
  const segEnd = Math.min(buf.frames - 1, Math.floor((at + 0.6) * SR));
  const start = Math.max(0, Math.floor(at * SR));
  let phase = 0;
  for (let i = start; i <= segEnd; i += 1) {
    const t = i / SR - at;
    let env;
    if (t < 0.015) env = gain * (t / 0.015);
    else env = gain * Math.pow(1e-4 / gain, (t - 0.015) / 0.535);
    if (env <= 1e-5) continue;
    const freq = t < 0.09 ? f * 1.6 * Math.pow(1 / 1.6, t / 0.09) : f;
    phase += freq / SR;
    const v = sine(phase);
    buf.l[i] += v * env;
    buf.r[i] += v * env;
  }
}

/* ---------- 4. 总线：低通 → 压缩 → 电平 → 无缝循环 ---------- */
function lowpass(buf, freq, q) {
  const w0 = (TAU * freq) / SR;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = (1 - cos) / 2;
  const b1 = 1 - cos;
  const b2 = (1 - cos) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;
  for (const ch of [buf.l, buf.r]) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < ch.length; i += 1) {
      const x = ch[i];
      const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      ch[i] = y;
    }
  }
}

function compress(buf, thresholdDb, ratio) {
  const t = Math.pow(10, thresholdDb / 20);
  for (const ch of [buf.l, buf.r]) {
    for (let i = 0; i < ch.length; i += 1) {
      const x = ch[i];
      const a = Math.abs(x);
      if (a > t) {
        const y = t + (a - t) / ratio;
        ch[i] = Math.sign(x) * y;
      }
    }
  }
}

/** 把超出循环长度的尾音折回开头，得到真正无缝的一圈 */
function foldLoop(buf, loopSamples) {
  for (let i = loopSamples; i < buf.frames; i += 1) {
    const j = i - loopSamples;
    buf.l[j] += buf.l[i];
    buf.r[j] += buf.r[i];
  }
  buf.frames = loopSamples;
}

function writeWav(file, buf) {
  const dataSize = buf.frames * 4;
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + dataSize, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(2, 22); // 立体声
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(dataSize, 40);
  const data = Buffer.alloc(dataSize);
  for (let i = 0; i < buf.frames; i += 1) {
    const l = Math.max(-1, Math.min(1, buf.l[i]));
    const r = Math.max(-1, Math.min(1, buf.r[i]));
    data.writeInt16LE(Math.round(l * 32767), i * 4);
    data.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
  }
  fs.writeFileSync(file, Buffer.concat([head, data]));
}

/* ---------- 5. 渲染一首 ---------- */
function renderScore(score, name) {
  const loop = score.bar * score.chords.length;
  const frames = Math.ceil((loop + TAIL) * SR);
  const buf = { frames, l: new Float32Array(frames), r: new Float32Array(frames) };

  for (let i = 0; i < score.chords.length; i += 1) {
    const at = i * score.bar;
    const dur = score.bar + (score.padTail ?? 1.6);
    for (const midi of score.chords[i]) {
      addPad(buf, midi, at, dur, 0.034 * score.padGain, score.padAttack, score.padRelease, score.padTriangle ?? 0.35);
    }
    if (score.bass && typeof score.bass[i] === 'number') {
      addBass(buf, score.bass[i], at, score.bassDecay ?? score.bar, score.bassGain ?? 0.038);
    }
    if (score.pulse) {
      for (const off of score.pulse.offsets) {
        addPulse(buf, score.pulse.midi, at + off, score.pulse.gain);
      }
    }
  }

  for (const note of score.notes) {
    if (note.kind === 'bell') {
      addTone(buf, note.midi, note.at, {
        gain: note.gain, pan: note.pan, attack: 0.012, decay: 3.2,
        wave: sine, harmonic: 2.01, harmonicGain: 0.18,
      });
    } else if (note.kind === 'soft') {
      addTone(buf, note.midi, note.at, {
        gain: note.gain, pan: note.pan, attack: 0.09, decay: 2.6,
        wave: sine, harmonic: 2, harmonicGain: 0.1,
      });
    } else {
      addTone(buf, note.midi, note.at, {
        gain: note.gain, pan: note.pan, attack: 0.006, decay: 1.6,
        wave: triangle, harmonic: 2.005, harmonicGain: 0.22,
      });
    }
  }

  // 总线：低通（Q=0.4）→ 压缩（-18dB / 3:1）→ 电平淡入
  let rawPeak = 0;
  let rawAt = 0;
  for (let i = 0; i < buf.frames; i += 1) {
    const v = Math.max(Math.abs(buf.l[i]), Math.abs(buf.r[i]));
    if (v > rawPeak) {
      rawPeak = v;
      rawAt = i / SR;
    }
  }
  console.log('  raw peak', rawPeak.toFixed(4), '@', rawAt.toFixed(2) + 's');
  lowpass(buf, score.filter, 0.4);
  compress(buf, -18, 3);
  const level = score.level;
  const fadeIn = Math.floor(1.6 * SR);
  for (let i = 0; i < buf.frames; i += 1) {
    const g = i >= fadeIn ? level : level * (i / fadeIn);
    buf.l[i] *= g;
    buf.r[i] *= g;
  }

  const loopSamples = Math.round(loop * SR);
  foldLoop(buf, loopSamples);

  // 统一响度：峰值 0.62，留出余量
  let peak = 0;
  for (let i = 0; i < buf.frames; i += 1) {
    peak = Math.max(peak, Math.abs(buf.l[i]), Math.abs(buf.r[i]));
  }
  if (peak > 0) {
    const k = 0.62 / peak;
    for (let i = 0; i < buf.frames; i += 1) {
      buf.l[i] *= k;
      buf.r[i] *= k;
    }
  }

  const file = path.join(OUT_DIR, `${name}.wav`);
  writeWav(file, buf);
  const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(2);
  console.log(`${name.padEnd(10)} loop ${loop.toFixed(1)}s  ${mb} MB  peak ${peak.toFixed(3)}`);
}

const scores = loadScores();
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, score] of Object.entries(scores)) {
  renderScore(score, name);
}
console.log('done ->', OUT_DIR);
