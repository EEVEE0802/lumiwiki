#!/usr/bin/env node
/**
 * 把 md 文件包一层 M4 同风格 HTML 壳（marked CDN 渲染）
 * 用法: node scripts/wrap-md-report.mjs <md 文件> <输出 html> "<页面标题>"
 */
import fs from 'fs'
import path from 'path'

const [, , mdPath, htmlPath, pageTitle] = process.argv
if (!mdPath || !htmlPath || !pageTitle) {
  console.error('用法: node scripts/wrap-md-report.mjs <md 文件> <输出 html> "<页面标题>"')
  process.exit(1)
}

const md = fs.readFileSync(mdPath, 'utf-8')

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${pageTitle}</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg-1: #0f0b1e;
    --bg-2: #1a1235;
    --bg-3: #241a4a;
    --ink-1: #f5f0ff;
    --ink-2: #c9bfe8;
    --ink-3: #8879b8;
    --accent-pink: #ff6ec7;
    --accent-cyan: #4dd8ff;
    --accent-yellow: #ffd93d;
    --accent-purple: #b78dff;
    --accent-green: #6ee7a8;
  }
  html, body {
    background: var(--bg-1);
    color: var(--ink-1);
    font-family: 'PingFang SC', 'Microsoft YaHei', 'HarmonyOS Sans SC', -apple-system, sans-serif;
    line-height: 1.75;
  }
  body::before {
    content: '';
    position: fixed; inset: 0;
    background:
      radial-gradient(ellipse at 20% 30%, rgba(255,110,199,0.12) 0%, transparent 45%),
      radial-gradient(ellipse at 80% 70%, rgba(77,216,255,0.12) 0%, transparent 45%);
    pointer-events: none; z-index: 0;
  }
  .container {
    position: relative; z-index: 1;
    max-width: 1100px;
    margin: 0 auto;
    padding: 40px 32px 60px;
  }
  .back-link {
    display: inline-block;
    color: var(--accent-cyan);
    text-decoration: none;
    font-size: 0.95rem;
    margin-bottom: 20px;
    padding: 6px 14px;
    border: 1px solid rgba(77,216,255,0.3);
    border-radius: 20px;
    transition: all 0.2s;
  }
  .back-link:hover {
    background: rgba(77,216,255,0.1);
    border-color: var(--accent-cyan);
  }
  .markdown {
    background: linear-gradient(145deg, rgba(183,141,255,0.08), rgba(77,216,255,0.04));
    border: 1px solid rgba(183,141,255,0.25);
    border-radius: 14px;
    padding: 32px 40px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.3);
  }
  .markdown h1 {
    color: var(--accent-pink);
    font-size: 1.9rem;
    margin: 0 0 20px;
    padding-bottom: 12px;
    border-bottom: 2px solid rgba(255,110,199,0.3);
  }
  .markdown h2 {
    color: var(--accent-purple);
    font-size: 1.45rem;
    margin: 32px 0 14px;
    padding-top: 8px;
    border-top: 1px solid rgba(183,141,255,0.15);
    padding-top: 20px;
  }
  .markdown h3 {
    color: var(--accent-cyan);
    font-size: 1.2rem;
    margin: 24px 0 10px;
  }
  .markdown h4 {
    color: var(--accent-yellow);
    font-size: 1.05rem;
    margin: 20px 0 8px;
  }
  .markdown p { margin: 10px 0; color: var(--ink-1); }
  .markdown ul, .markdown ol { padding-left: 1.8em; margin: 10px 0; color: var(--ink-1); }
  .markdown li { margin: 4px 0; }
  .markdown strong { color: var(--accent-yellow); font-weight: 600; }
  .markdown em { color: var(--accent-cyan); font-style: normal; }
  .markdown code {
    background: rgba(77,216,255,0.1);
    color: var(--accent-cyan);
    padding: 2px 7px;
    border-radius: 4px;
    font-family: 'Fira Code', 'Consolas', monospace;
    font-size: 0.9em;
  }
  .markdown pre {
    background: rgba(15,11,30,0.8);
    border: 1px solid rgba(183,141,255,0.2);
    border-radius: 8px;
    padding: 14px 18px;
    overflow-x: auto;
    margin: 14px 0;
  }
  .markdown pre code {
    background: transparent;
    color: var(--ink-1);
    padding: 0;
  }
  .markdown blockquote {
    border-left: 3px solid var(--accent-purple);
    background: rgba(183,141,255,0.06);
    padding: 10px 18px;
    margin: 14px 0;
    color: var(--ink-2);
    border-radius: 0 6px 6px 0;
  }
  .markdown blockquote p { color: var(--ink-2); margin: 4px 0; }
  .markdown table {
    border-collapse: collapse;
    margin: 16px 0;
    width: 100%;
    font-size: 0.92rem;
    background: rgba(15,11,30,0.3);
    border-radius: 6px;
    overflow: hidden;
    display: block;
    overflow-x: auto;
  }
  .markdown thead { background: rgba(183,141,255,0.18); }
  .markdown th {
    padding: 10px 14px;
    text-align: left;
    color: var(--accent-pink);
    border-bottom: 2px solid rgba(183,141,255,0.3);
    white-space: nowrap;
  }
  .markdown td {
    padding: 8px 14px;
    border-bottom: 1px solid rgba(183,141,255,0.1);
    color: var(--ink-1);
    white-space: nowrap;
  }
  .markdown tr:hover td { background: rgba(255,110,199,0.04); }
  .markdown a {
    color: var(--accent-cyan);
    text-decoration: none;
    border-bottom: 1px dashed rgba(77,216,255,0.4);
  }
  .markdown a:hover { color: var(--accent-pink); border-color: var(--accent-pink); }
  .markdown hr {
    border: none;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(183,141,255,0.4), transparent);
    margin: 28px 0;
  }
  .markdown sub { font-size: 0.75em; color: var(--ink-3); }
  @media (max-width: 768px) {
    .container { padding: 20px 14px 40px; }
    .markdown { padding: 20px 18px; }
    .markdown h1 { font-size: 1.4rem; }
    .markdown h2 { font-size: 1.2rem; }
  }
</style>
</head>
<body>
<div class="container">
  <a href="/#/work-report" class="back-link">← 返回工作记录</a>
  <div class="markdown" id="content"></div>
</div>
<script id="md-source" type="text/markdown">${md.replace(/<\/script>/g, '<\\/script>')}</script>
<script>
  const src = document.getElementById('md-source').textContent;
  document.getElementById('content').innerHTML = marked.parse(src);
</script>
</body>
</html>
`

fs.writeFileSync(htmlPath, html)
console.log(`✅ 写入: ${htmlPath}`)
