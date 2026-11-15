#!/usr/bin/env node
/**
 * 生成 preview/wordmark-check.html（目验页）。
 *
 * 用法：node scripts/wordmark/gen-check.cjs
 * 笔画自动同步自 preview/splash.html 中当前字标 SVG（细笔手写体）。
 * 三联：大图 / 封面实际宽度（460rpx ≈ 230px） / 暗色。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SPLASH = path.join(ROOT, 'preview', 'splash.html');
const OUT = path.join(ROOT, 'preview', 'wordmark-check.html');

const splashSrc = fs.readFileSync(SPLASH, 'utf8');
const svgStart = splashSrc.indexOf('<svg class="wordmark"');
const svgEnd = splashSrc.indexOf('</svg>', svgStart) + 6;
if (svgStart < 0) throw new Error('preview/splash.html 中找不到字标 SVG');
const svg = splashSrc.slice(svgStart, svgEnd);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>溯星 · 字标校验</title>
<style>
  :root { --ink:#3A3A3A; --bg:#f4f2ee; --paper:#fffdf9; }
  * { box-sizing:border-box; margin:0; }
  body { font-family:"PingFang SC","Microsoft YaHei",sans-serif; background:var(--bg); padding:36px; }
  h1 { font-size:20px; color:#5a5046; font-weight:600; margin-bottom:6px; }
  p.sub { color:#8a8076; font-size:13px; margin-bottom:24px; line-height:1.7; }
  .card { background:var(--paper); border-radius:14px; padding:28px; box-shadow:0 8px 28px rgba(90,80,66,.09); margin-bottom:28px; }
  .card h2 { font-size:14px; font-weight:600; color:#7a7268; margin-bottom:14px; }
  .wordmark { color:var(--ink); display:block; max-width:100%; height:auto; overflow:visible; }
  .wm-big { width:760px; }
  .wm-cover { width:230px; margin:0 auto; }
  .wm-big .wordmark, .wm-cover .wordmark { width:100%; }
  .frame { background:#f8f6f2; border-radius:20px; padding:34px 18px; box-shadow:inset 0 0 0 2px rgba(90,80,66,.07); }
  .note { color:#8a8076; font-size:12px; margin-top:10px; text-align:center; }
  .dark { background:#221e1a; }
  .dark .wordmark { color:#edede8; }
</style>
</head>
<body>
  <h1>「溯星」字标校验（细笔手写体）</h1>
  <p class="sub">笔画自动同步自 preview/splash.html；规则校验用 node scripts/wordmark/audit.cjs。</p>

  <div class="card">
    <h2>1 · 大图</h2>
    <div class="wm-big"><div class="wordmark">${svg}</div></div>
  </div>

  <div class="card">
    <h2>2 · 封面实际宽度（460rpx ≈ 230px）</h2>
    <div class="frame"><div style="text-align:center"><div style="display:inline-block" class="wm-cover">${svg}</div></div></div>
    <div class="note">这是封面里字标的真实大小——确认小尺寸下笔画仍清晰、圆圈仍是圆圈。</div>
  </div>

  <div class="card dark">
    <h2>3 · 暗色</h2>
    <div class="wm-big"><div class="wordmark">${svg}</div></div>
  </div>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log('written', html.length, 'bytes ->', path.relative(ROOT, OUT));
