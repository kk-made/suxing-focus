#!/usr/bin/env node
/**
 * 字标规则审计（细笔手写体）。
 *
 * 用法：node scripts/wordmark/audit.cjs
 * 对 src/pages/splash/index.vue 与 preview/splash.html 的字标 SVG 逐项检查：
 *   1) 不出现 <text>（硬约束）；
 *   2) 结构挂点齐全：wm-char(+--su/--xing)、wm-stroke、wm-star、wm-crayon 滤镜定义并被引用；
 *   3) 每笔 stroke-width ∈ [2.4, 4.2]，且至少 4 档不同粗细（笔压轻微不匀）；
 *   4) <path> 笔画的 d 必须含 Q/C/A（每笔都是手写曲线，圆圈的弧也算）；<line> 笔画必须明显倾斜
 *      （|Δx|、|Δy| 都 > 2，横平竖直不许走直线）；
 *   5) 所有笔画坐标落在 viewBox (0 0 220 130) 容差范围内；
 *   6) 两面镜像的笔画序列（标签/几何/粗细）完全一致。
 * 任一检查不过 → 退出码 1。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TARGETS = [
  path.join(ROOT, 'src', 'pages', 'splash', 'index.vue'),
  path.join(ROOT, 'preview', 'splash.html'),
];

function wordmarkSvg(src) {
  const s0 = src.indexOf('<svg class="wordmark"');
  const s1 = src.indexOf('</svg>', s0) + 6;
  if (s0 < 0 || s1 < s0) throw new Error('wordmark SVG 不存在');
  return src.slice(s0, s1);
}

// 抽出全部笔画：{tag, sig(几何签名), width}
function strokesOf(svg) {
  const out = [];
  for (const m of svg.matchAll(/<(path|line)\b[^>]*class="wm-stroke"[^>]*>/g)) {
    const tag = m[1];
    const el = m[0];
    const wm = el.match(/stroke-width="([\d.]+)"/);
    const width = wm ? +wm[1] : NaN;
    let sig = '';
    if (tag === 'line') {
      const g = [...el.matchAll(/(?:x1|y1|x2|y2)="(-?[\d.]+)"/g)].map((v) => +v[1]);
      sig = `line ${g.join(' ')}`;
    } else {
      const d = el.match(/ d="([^"]+)"/)[1];
      sig = `path ${d}`;
    }
    out.push({ tag, sig, width });
  }
  return out;
}

const problems = [];
for (const target of TARGETS) {
  const rel = path.relative(ROOT, target);
  const svg = wordmarkSvg(fs.readFileSync(target, 'utf8'));

  if (/<text[\s>]/.test(svg)) problems.push(`${rel}: 出现 <text>（禁止）`);
  for (const cls of ['wm-char--su', 'wm-char--xing', 'wm-star', 'wm-crayon']) {
    if (!svg.includes(cls)) problems.push(`${rel}: 缺少挂点/滤镜 ${cls}`);
  }
  if (!/filter="url\(#wm-crayon\)"/.test(svg)) problems.push(`${rel}: 内容组未引用 wm-crayon 滤镜`);

  const strokes = strokesOf(svg);
  const suStart = svg.indexOf('class="wm-char wm-char--su"');
  const xingStart = svg.indexOf('class="wm-char wm-char--xing"');
  if (suStart < 0 || xingStart < 0 || suStart > xingStart) problems.push(`${rel}: 字符组结构错乱`);

  if (strokes.length < 20) problems.push(`${rel}: 笔画仅 ${strokes.length} 根，太少`);

  const widths = strokes.map((s) => s.width);
  if (widths.some((w) => !(w >= 2.4 && w <= 4.2))) {
    const bad = strokes.filter((s) => !(s.width >= 2.4 && s.width <= 4.2)).map((s) => s.sig.slice(0, 24));
    problems.push(`${rel}: 粗细超出 2.4-4.2：${bad.join(' | ')}`);
  }
  const distinct = new Set(widths).size;
  if (distinct < 4) problems.push(`${rel}: 只有 ${distinct} 档粗细（要求 ≥4，粗细不均）`);

  strokes.forEach((s, i) => {
    if (s.tag === 'path') {
      if (!/ [QCA]/.test(s.sig.slice(5))) problems.push(`${rel}: 第 ${i + 1} 笔没有手写曲线`);
    } else {
      const g = s.sig.split(' ').slice(1).map(Number);
      const dx = Math.abs(g[2] - g[0]);
      const dy = Math.abs(g[3] - g[1]);
      if (!(dx > 2 && dy > 2)) problems.push(`${rel}: 第 ${i + 1} 笔 <line> 近乎横平竖直`);
    }
  });

  const badPos = [];
  strokes.forEach((s) => {
    const pts = [];
    const d = s.sig.replace(/^(line|path) /, '');
    if (s.tag === 'line') {
      const g = d.split(' ').map(Number);
      pts.push([g[0], g[1]], [g[2], g[3]]);
    } else {
      // 按指令切段取坐标：A 的末两个数是终点，其余指令的数字两两成对
      for (const t of d.match(/[MLQCA][^MLQCA]*/g) || []) {
        const cmd = t[0];
        const nums = (t.slice(1).match(/-?[\d.]+/g) || []).map(Number);
        if (!nums.length) continue;
        if (cmd === 'A') pts.push([nums[nums.length - 2], nums[nums.length - 1]]);
        else for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
      }
    }
    const hi = pts.some(([x, y]) => x < -4 || x > 224 || y < -4 || y > 134);
    if (hi) badPos.push(s.sig);
  });
  if (badPos.length) problems.push(`${rel}: 有笔画越出 viewBox 容差：\n      ${badPos.join('\n      ')}`);

  console.log(`- ${rel}: 笔画 ${strokes.length} 根，粗细 ${Math.min(...widths)}-${Math.max(...widths)}（${distinct} 档）`);

  if (target === TARGETS[0]) global.__firstSig = strokes.map((s) => `${s.tag}|${s.sig}|${s.width}`).join('\n');
  else {
    const sig = strokes.map((s) => `${s.tag}|${s.sig}|${s.width}`).join('\n');
    if (sig !== global.__firstSig) problems.push('两面镜像笔画序列不一致');
  }
}

console.log(problems.length ? `\n${problems.length} 处不合规 ✗\n  - ${problems.join('\n  - ')}` : '\n全部规则通过 ✓');
process.exitCode = problems.length ? 1 : 0;
