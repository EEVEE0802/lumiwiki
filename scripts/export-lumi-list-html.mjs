// 导出「噜咪图鉴」为单文件自包含 HTML，用于给别人做参考示意
// 用法:
//   node scripts/export-lumi-list-html.mjs                 # 对外 → snapshot/lumi-list.html
//   node scripts/export-lumi-list-html.mjs --internal      # 对内分支数据
//   node scripts/export-lumi-list-html.mjs --out <path>    # 自定义输出路径
//
// 特点：
//   - 立绘 base64 内联，双击 .html 就能开，没有附件夹依赖
//   - 保留搜索 / 属性/赛季筛选 / 排序（vanilla JS，无框架）
//   - CSS 直接抄 LumiList.vue + style.css 的样式，视觉跟线上一致

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const isInternal = args.includes('--internal')
const outArgIdx = args.indexOf('--out')
const outPath = outArgIdx !== -1
  ? path.resolve(args[outArgIdx + 1])
  : path.join(PROJECT_ROOT, 'snapshot', 'lumi-list.html')

const DATA_DIR = isInternal
  ? path.join(PROJECT_ROOT, 'public/data/internal')
  : path.join(PROJECT_ROOT, 'public/data')
const AVATARS_DIR = path.join(PROJECT_ROOT, 'public/images/avatars')

const TYPE_NAMES = {
  1: '无', 2: '水', 3: '火', 4: '草', 5: '电',
  6: '土', 7: '飞', 8: '冰', 9: '龙', 10: '光',
  11: '暗', 12: '格斗', 13: '超能', 14: '精灵', 15: '钢',
  16: '王', 17: '神',
}
const TYPE_COLORS = {
  1: '#A8A878', 2: '#6890F0', 3: '#F08030', 4: '#78C850', 5: '#F8D030',
  6: '#C0A060', 7: '#A890F0', 8: '#98D8D8', 9: '#7038F8', 10: '#FFD700',
  11: '#705848', 12: '#C03028', 13: '#F85888', 14: '#EE99AC', 15: '#B8B8D0',
  16: '#FF6347', 17: '#E0C050',
}
const LUMI_TAG_NAMES = { 0: '未投放', 1: '主线', 2: 'S1', 3: 'S2', 4: 'S3', 5: 'S4' }
const CARD_BACK_NAMES = { 0: '普通', 50: '异色', 80: '王', 98: '3D', 99: '全景' }

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

console.log(`\n📖 读取数据 (${isInternal ? '对内' : '对外'} 分支)...`)
const lumis = readJson(path.join(DATA_DIR, 'Lumi.json'))
const loc = readJson(path.join(DATA_DIR, 'zh-CN.json'))
console.log(`   共 ${lumis.length} 只噜咪`)

// 组装每只噜咪的最小数据集 + 立绘 base64
console.log(`🖼️  内联立绘（base64）...`)
const avatarCache = new Map()
function loadAvatar(ca) {
  if (!ca) return null
  if (avatarCache.has(ca)) return avatarCache.get(ca)
  const p = path.join(AVATARS_DIR, `${ca}.png`)
  if (!fs.existsSync(p)) {
    avatarCache.set(ca, null)
    return null
  }
  const b64 = fs.readFileSync(p).toString('base64')
  const url = `data:image/png;base64,${b64}`
  avatarCache.set(ca, url)
  return url
}

let missingAvatarCount = 0
const lumiRows = lumis.map(l => {
  const avatar = loadAvatar(l.CA)
  if (!avatar) missingAvatarCount++
  return {
    id: l.Id,
    pokedexId: l.PokedexId,
    name: loc[l.Name] || `噜咪 #${l.Id}`,
    tag: l.LumiTag ?? 0,
    type1: l.Type1 ?? 0,
    type2: l.Type2 ?? 0,
    maxScore: l.MaxScore ?? 0,
    cardBack: l.CardBack ?? 0,
    avatar,
  }
})
console.log(`   base64 缓存 ${avatarCache.size} 张立绘（其中缺图 ${missingAvatarCount} 只）`)

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

// 预渲染卡片（首屏无需 JS 也能看）
function renderCard(l) {
  const type1 = l.type1
    ? `<span class="type-tag" style="background:${TYPE_COLORS[l.type1] || '#666'}">${TYPE_NAMES[l.type1] || l.type1}</span>`
    : ''
  const type2 = l.type2
    ? `<span class="type-tag" style="background:${TYPE_COLORS[l.type2] || '#666'}">${TYPE_NAMES[l.type2] || l.type2}</span>`
    : ''
  const img = l.avatar
    ? `<img src="${l.avatar}" alt="${esc(l.name)}" class="lumi-img" loading="lazy">`
    : `<div class="lumi-icon-fallback">🐾</div>`
  return `<div class="card lumi-card" data-id="${l.id}"
    data-name="${esc(l.name.toLowerCase())}"
    data-pokedex="${l.pokedexId}"
    data-type1="${l.type1}"
    data-type2="${l.type2}"
    data-tag="${l.tag}"
    data-score="${l.maxScore}"
    data-cardback="${l.cardBack}">
    <div class="lumi-avatar">
      <div class="lumi-id">#${l.pokedexId}</div>
      ${img}
    </div>
    <div class="lumi-name">${esc(l.name)}</div>
    <div class="lumi-types">${type1}${type2}</div>
    <div class="lumi-score"><span class="score-range">${l.maxScore}</span></div>
  </div>`
}

const cardsHtml = lumiRows.map(renderCard).join('\n')

// 类型/赛季/卡背筛选按钮
const typeChips = Object.entries(TYPE_NAMES).map(([k, name]) =>
  `<button class="chip" data-filter="type" data-value="${k}" style="border-color:${TYPE_COLORS[k]}">${name}</button>`
).join('')
const tagChips = Object.entries(LUMI_TAG_NAMES).map(([k, name]) =>
  `<button class="chip" data-filter="tag" data-value="${k}">${name}</button>`
).join('')
const cardBackChips = Object.entries(CARD_BACK_NAMES).map(([k, name]) =>
  `<button class="chip" data-filter="cardback" data-value="${k}">${name}</button>`
).join('')

const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
const branch = isInternal ? '对内开发分支' : '对外稳定分支'

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>噜咪图鉴 · LumiWiki 快照</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: #0f0f23;
  --bg-card: #16213e;
  --text: #e0e0e0;
  --text-dim: #888;
  --accent: #e94560;
  --accent-light: #ff6b81;
  --border: #2a2a4a;
  --radius: 10px;
}
body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  min-height: 100vh;
}
.wrap { max-width: 1200px; margin: 0 auto; padding: 24px; }
.snapshot-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 16px;
  margin-bottom: 20px;
  border-bottom: 2px solid var(--accent);
}
.snapshot-title { font-size: 1.8em; font-weight: 700; color: #fff; }
.snapshot-meta { color: var(--text-dim); font-size: 0.85em; }
.snapshot-meta strong { color: var(--accent-light); }

/* 筛选栏 */
.filter-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  align-items: center;
}
.filter-bar input, .filter-bar select {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 14px;
  color: var(--text);
  outline: none;
  font-family: inherit;
  font-size: inherit;
}
.filter-bar input:focus, .filter-bar select:focus { border-color: var(--accent); }
.filter-bar input[type=number] { width: 100px; }

.chip-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  padding: 4px 0;
}
.chip-group-label {
  color: var(--text-dim);
  font-size: 0.85em;
  margin-right: 4px;
}
.chip {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 3px 10px;
  color: var(--text);
  font-size: 0.8em;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.chip:hover { border-color: var(--accent); }
.chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.result-count { color: var(--text-dim); font-size: 0.9em; }

/* Grid + 卡片（抄 LumiList.vue） */
.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}
@media (max-width: 1024px) { .grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 640px) { .grid { grid-template-columns: repeat(2, 1fr); } }

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 10px;
  transition: transform 0.2s, box-shadow 0.2s;
  text-align: center;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(233, 69, 96, 0.1);
}
.lumi-avatar { position: relative; margin-bottom: 8px; }
.lumi-id { font-size: 0.75em; color: var(--text-dim); }
.lumi-img { width: 80px; height: 100px; object-fit: contain; margin: 4px auto; display: block; }
.lumi-icon-fallback { font-size: 2.5em; margin: 4px 0; }
.lumi-name { font-weight: 600; color: #fff; margin-bottom: 6px; font-size: 0.95em; }
.lumi-types { display: flex; gap: 4px; justify-content: center; margin-bottom: 6px; }
.type-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 0.8em;
  font-weight: 600;
  color: #fff;
}
.lumi-score { margin-top: 4px; font-size: 0.8em; color: var(--text-dim); }

.empty { text-align: center; padding: 60px 20px; color: var(--text-dim); }
.footer-note {
  margin-top: 40px;
  padding: 16px;
  text-align: center;
  color: var(--text-dim);
  font-size: 0.8em;
  border-top: 1px solid var(--border);
}
</style>
</head>
<body>
<div class="wrap">
  <div class="snapshot-header">
    <div>
      <div class="snapshot-title">🐾 噜咪图鉴</div>
      <div class="snapshot-meta">LumiWiki 快照 · <strong>${branch}</strong> · 生成于 ${now}</div>
    </div>
    <div class="snapshot-meta"><span id="resultCount">共 ${lumiRows.length}</span> 只</div>
  </div>

  <div class="filter-bar">
    <input type="text" id="search" placeholder="搜索名称 / ID / 图鉴号">
    <input type="number" id="minScore" placeholder="最小资质">
    <input type="number" id="maxScore" placeholder="最大资质">
    <select id="sort">
      <option value="pokedex">按图鉴号</option>
      <option value="id">按 ID</option>
      <option value="name">按名称</option>
      <option value="scoreDesc">资质降序</option>
      <option value="scoreAsc">资质升序</option>
    </select>
    <button class="chip" id="clearBtn" style="margin-left:auto">清空筛选</button>
  </div>

  <div class="chip-group">
    <span class="chip-group-label">属性</span>
    ${typeChips}
  </div>
  <div class="chip-group">
    <span class="chip-group-label">赛季</span>
    ${tagChips}
  </div>
  <div class="chip-group" style="margin-bottom:16px">
    <span class="chip-group-label">个体</span>
    ${cardBackChips}
  </div>

  <div class="grid" id="grid">
    ${cardsHtml}
  </div>
  <div class="empty" id="emptyState" style="display:none">没有找到匹配的噜咪</div>

  <div class="footer-note">
    LumiWiki 静态快照 · 立绘 base64 内联 · 双击 .html 即可离线浏览
  </div>
</div>

<script>
(function () {
  const grid = document.getElementById('grid')
  const emptyState = document.getElementById('emptyState')
  const resultCount = document.getElementById('resultCount')
  const searchInput = document.getElementById('search')
  const minScoreInput = document.getElementById('minScore')
  const maxScoreInput = document.getElementById('maxScore')
  const sortSelect = document.getElementById('sort')
  const clearBtn = document.getElementById('clearBtn')

  const filters = {
    type: new Set(),
    tag: new Set(),
    cardback: new Set(),
  }

  function apply() {
    const q = searchInput.value.trim().toLowerCase()
    const minS = minScoreInput.value === '' ? -Infinity : Number(minScoreInput.value)
    const maxS = maxScoreInput.value === '' ? Infinity : Number(maxScoreInput.value)
    const cards = Array.from(grid.children)
    let visible = 0

    for (const c of cards) {
      const name = c.dataset.name
      const pokedex = c.dataset.pokedex
      const id = c.dataset.id
      const t1 = c.dataset.type1
      const t2 = c.dataset.type2
      const tag = c.dataset.tag
      const score = Number(c.dataset.score)
      const cardback = c.dataset.cardback

      let ok = true
      if (q) {
        ok = name.includes(q) || pokedex.includes(q) || id.includes(q)
      }
      if (ok && filters.type.size) {
        ok = filters.type.has(t1) || filters.type.has(t2)
      }
      if (ok && filters.tag.size) {
        ok = filters.tag.has(tag)
      }
      if (ok && filters.cardback.size) {
        ok = filters.cardback.has(cardback)
      }
      if (ok) {
        ok = score >= minS && score <= maxS
      }
      c.style.display = ok ? '' : 'none'
      if (ok) visible++
    }

    // 排序
    const mode = sortSelect.value
    const visibleCards = cards.filter(c => c.style.display !== 'none')
    visibleCards.sort((a, b) => {
      if (mode === 'pokedex') return Number(a.dataset.pokedex) - Number(b.dataset.pokedex)
      if (mode === 'id') return Number(a.dataset.id) - Number(b.dataset.id)
      if (mode === 'name') return a.dataset.name.localeCompare(b.dataset.name, 'zh-Hans-CN')
      if (mode === 'scoreDesc') return Number(b.dataset.score) - Number(a.dataset.score) || Number(a.dataset.pokedex) - Number(b.dataset.pokedex)
      if (mode === 'scoreAsc') return Number(a.dataset.score) - Number(b.dataset.score) || Number(a.dataset.pokedex) - Number(b.dataset.pokedex)
      return 0
    })
    visibleCards.forEach(c => grid.appendChild(c))

    resultCount.textContent = '共 ' + visible
    emptyState.style.display = visible === 0 ? 'block' : 'none'
    grid.style.display = visible === 0 ? 'none' : ''
  }

  // chip 点击切换筛选
  document.querySelectorAll('.chip[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.filter
      const value = btn.dataset.value
      if (filters[type].has(value)) {
        filters[type].delete(value)
        btn.classList.remove('active')
      } else {
        filters[type].add(value)
        btn.classList.add('active')
      }
      apply()
    })
  })

  searchInput.addEventListener('input', apply)
  minScoreInput.addEventListener('input', apply)
  maxScoreInput.addEventListener('input', apply)
  sortSelect.addEventListener('change', apply)

  clearBtn.addEventListener('click', () => {
    searchInput.value = ''
    minScoreInput.value = ''
    maxScoreInput.value = ''
    sortSelect.value = 'pokedex'
    for (const k of Object.keys(filters)) filters[k].clear()
    document.querySelectorAll('.chip.active').forEach(c => c.classList.remove('active'))
    apply()
  })

  apply()
})()
</script>
</body>
</html>
`

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, html, 'utf-8')
const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2)
console.log(`\n✅ 已导出: ${outPath}`)
console.log(`   文件大小: ${sizeMB} MB`)
console.log(`   直接双击打开即可离线浏览\n`)
