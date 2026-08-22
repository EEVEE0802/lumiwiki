// 导出单只噜咪的「详情页」为单文件自包含 HTML，用于给别人做参考示意
// 用法:
//   node scripts/export-lumi-detail-html.mjs                        # 默认小叶鼠 108501
//   node scripts/export-lumi-detail-html.mjs --id 108501
//   node scripts/export-lumi-detail-html.mjs --name 小叶鼠
//   node scripts/export-lumi-detail-html.mjs --internal             # 对内分支数据
//   node scripts/export-lumi-detail-html.mjs --out <path>
//
// 涵盖：头部 · 基础信息 · 推荐配队 · 关键特质/行为习惯 · 初见/订单/故事 ·
//       属性克制 · 属性值 · 特性(战斗/家园被动) · 普攻 · 专属技能 · 技能池 · 进化链
// 所有立绘/技能图标 base64 内联，无附件夹依赖。关键字点击弹窗查看描述。

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const isInternal = args.includes('--internal')
function getArg(name) {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : null
}
const argId = getArg('--id')
const argName = getArg('--name') || (argId ? null : '小叶鼠')  // 默认小叶鼠
const outArg = getArg('--out')

const DATA_DIR = isInternal
  ? path.join(PROJECT_ROOT, 'public/data/internal')
  : path.join(PROJECT_ROOT, 'public/data')
const IMG_ROOT = isInternal
  ? path.join(PROJECT_ROOT, 'public/images/internal')
  : path.join(PROJECT_ROOT, 'public/images')
// 属性图标是通用的（跨版本），始终从对外目录取
const TYPE_ICON_ROOT = path.join(PROJECT_ROOT, 'public/images/types')

const TYPE_NAMES = {
  1: '无', 2: '水', 3: '火', 4: '草', 5: '电', 6: '土', 7: '飞', 8: '冰',
  9: '龙', 10: '光', 11: '暗', 12: '格斗', 13: '超能', 14: '精灵', 15: '钢',
  16: '王', 17: '神',
}
const TYPE_COLORS = {
  1: '#A8A878', 2: '#6890F0', 3: '#F08030', 4: '#78C850', 5: '#F8D030',
  6: '#C0A060', 7: '#A890F0', 8: '#98D8D8', 9: '#7038F8', 10: '#FFD700',
  11: '#705848', 12: '#C03028', 13: '#F85888', 14: '#EE99AC', 15: '#B8B8D0',
  16: '#FF6347', 17: '#E0C050',
}
const LUMI_TAG_NAMES = { 0: '未投放', 1: '主线', 2: 'S1', 3: 'S2', 4: 'S3', 5: 'S4' }
const LUMI_CARD_TYPE = { 0: '普通', 50: '异色', 80: '王', 98: '3D', 99: '全景' }
const LUMI_CARD_TYPE_COLORS = { 0: '#9e9e9e', 50: '#e91e63', 80: '#FFD700', 98: '#2196f3', 99: '#9c27b0' }
const WORK_TYPE_NAMES = {
  0: '无', 1: '手工', 2: '伐木', 3: '种植', 4: '祈愿', 5: '生火', 6: '探险',
  7: '牧场', 8: '发电', 9: '采矿', 10: '制冷', 11: '种苹果', 12: '养鱼',
  13: '牧场2', 14: '产花蜜', 15: '水产养殖',
}
const TYPE_KEYS = [
  'Neutral', 'Water', 'Fire', 'Grass', 'Lighting', 'Earth', 'Fly', 'Ice',
  'Dragon', 'Bright', 'Dark', 'Fight', 'Psychic', 'Fairy', 'Steel', 'King', 'God',
]
const TAG_LABEL = {
  'most-used': '使用最多',
  'highest-winrate': '胜率最高',
  'other': '其他推荐',
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')) }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

console.log(`\n📖 读取数据 (${isInternal ? '对内' : '对外'} 分支)...`)
const lumis = readJson(path.join(DATA_DIR, 'Lumi.json'))
const loc = readJson(path.join(DATA_DIR, 'zh-CN.json'))
const activeSkills = readJson(path.join(DATA_DIR, 'ActiveSkill.json'))
const battlePassives = readJson(path.join(DATA_DIR, 'BattlePassive.json'))
const homePassives = readJson(path.join(DATA_DIR, 'HomePassive.json'))
const evolutions = readJson(path.join(DATA_DIR, 'LumiEvolution.json'))
const typeCounters = readJson(path.join(DATA_DIR, 'LumiTypeCounter.json'))
const keywords = readJson(path.join(DATA_DIR, 'BattleKeywordDes.json'))
const trainerSkills = safeReadJson(path.join(DATA_DIR, 'TrainerSkill.json')) || []
const avgData = safeReadJson(path.join(DATA_DIR, 'Avg.json')) || []
const extraData = safeReadJson(path.join(DATA_DIR, 'extra.json')) || {}
const orderNpcData = safeReadJson(path.join(DATA_DIR, 'OrderNPC.json')) || []
// lumi-teams：先看 domestic 子目录，回退到根
const teamsPathDomestic = path.join(DATA_DIR, 'domestic/lumi-teams.json')
const teamsPathRoot = path.join(DATA_DIR, 'lumi-teams.json')
const lumiTeamsData = fs.existsSync(teamsPathDomestic)
  ? readJson(teamsPathDomestic)
  : (fs.existsSync(teamsPathRoot) ? readJson(teamsPathRoot) : null)

function safeReadJson(p) {
  try { return readJson(p) } catch { return null }
}

// 定位目标噜咪
let lumi = null
if (argId) {
  const idNum = Number(argId)
  lumi = lumis.find(l => l.Id === idNum)
  if (!lumi) throw new Error(`找不到 Id=${argId} 的噜咪`)
} else {
  lumi = lumis.find(l => loc[l.Name] === argName)
  if (!lumi) throw new Error(`找不到名为「${argName}」的噜咪`)
}
console.log(`   目标：#${lumi.PokedexId} ${loc[lumi.Name]} (Id=${lumi.Id})`)

// 立绘 + 技能图标 base64 缓存
const imgCache = new Map()
function b64(absPath) {
  if (!absPath) return null
  if (imgCache.has(absPath)) return imgCache.get(absPath)
  if (!fs.existsSync(absPath)) {
    imgCache.set(absPath, null)
    return null
  }
  const ext = path.extname(absPath).slice(1).toLowerCase() || 'png'
  const data = `data:image/${ext};base64,${fs.readFileSync(absPath).toString('base64')}`
  imgCache.set(absPath, data)
  return data
}
function avatarB64(ca) {
  if (!ca) return null
  const s = String(ca)
  const file = s.startsWith('CA_') ? `${s}.png` : `CA_${s}.png`
  return b64(path.join(IMG_ROOT, 'avatars', file))
}
function skillIconB64(icon) {
  if (!icon) return null
  return b64(path.join(IMG_ROOT, 'skills', `${icon}.png`))
}

function getName(key) { return loc[key] || key || '???' }
function getLumiName(id) {
  const l = lumis.find(x => x.Id === id)
  return l ? (loc[l.Name] || `#${id}`) : `#${id}`
}
function hasValidContent(key) {
  const v = loc[key]
  return v && v !== '无' && v.trim() !== ''
}

// 描述文本占位符替换（跟 LumiDetail.vue::replacePlaceholders 一致）
function replacePlaceholders(text, desParam = []) {
  if (!text) return ''
  let r = text
  r = r.replace(/\[([^\]]+)\]/g, (_, k) => loc[k] || k)
  if (desParam && desParam.length) {
    r = r.replace(/\{(\d+)\}/g, (_, i) => {
      const v = desParam[Number(i)]
      return v !== undefined ? v : `{${i}}`
    })
  }
  // 关键字链接（点击弹窗）
  r = r.replace(/<link=(\d+)><color=([^>]+)>([^<]+)<\/color><\/link>/gi,
    (_, id, color, content) =>
      `<span class="keyword-link" style="color:${esc(color)};text-decoration:underline;cursor:pointer" data-kw="${id}">${esc(content)}</span>`)
  // 独立 color 标签
  r = r.replace(/<color=([^>]+)>/gi, '<span style="color:$1">').replace(/<\/color>/gi, '</span>')
  r = r.replace(/<\/?link=\d+>/gi, '')
  return r
}

// 技能消耗解析（对齐 parseSkillCost 逻辑）
function parseSkillCost(raw) {
  if (raw == null) return null
  // 纯数字（对外旧格式）：等价于 [1, N]
  if (typeof raw === 'number') {
    return raw === 0 ? { mode: 0 } : { mode: 1, energy: (raw / 10).toFixed(1) }
  }
  if (Array.isArray(raw)) {
    if (raw[0] === 0) return { mode: 0 }
    if (raw[0] === 1) return { mode: 1, energy: (raw[1] / 10).toFixed(1) }
    if (raw[0] === 2) return { mode: 2, hpPct: raw[1], cd: raw[2] }
  }
  return null
}

// 技能对象
function buildSkill(id) {
  const s = activeSkills.find(x => x.Id === id)
  if (!s) return null
  return {
    id: s.Id,
    name: loc[s.name] || s.name,
    iconB64: skillIconB64(s.icon),
    des: replacePlaceholders(loc[s.Des] || '', s.DesParam || []),
    type: s.LumiTpye,
    cost: parseSkillCost(s.SkillCost),
    power: (s.SkillPowerList && s.SkillPowerList.length) ? s.SkillPowerList.reduce((a, b) => a + b, 0) : '-',
    attackInterval: s.AttackInterval,
    addEnergy: s.AddEnergy,
    skillPowerList: s.SkillPowerList || [],
  }
}

// 属性克制
function computeWeaknesses(l) {
  const results = []
  for (let atk = 1; atk <= 17; atk++) {
    const row = typeCounters.find(t => t.LumiType === atk)
    if (!row) continue
    let mult = 10000
    if (l.Type1) {
      const k = TYPE_KEYS[l.Type1 - 1]
      if (k && row[k] !== undefined) mult = (mult * row[k]) / 10000
    }
    if (l.Type2) {
      const k = TYPE_KEYS[l.Type2 - 1]
      if (k && row[k] !== undefined) mult = (mult * row[k]) / 10000
    }
    let effect = '', cls = 'normal'
    if (mult === 0) { effect = '0'; cls = 'immune' }
    else if (mult < 5000) { effect = '↓↓'; cls = 'double-weak' }
    else if (mult < 10000) { effect = '↓'; cls = 'weak' }
    else if (mult === 10000) { effect = ''; cls = 'normal' }
    else if (mult <= 20000) { effect = '↑'; cls = 'strong' }
    else { effect = '↑↑'; cls = 'double-strong' }
    results.push({ typeId: atk, typeName: TYPE_NAMES[atk], typeColor: TYPE_COLORS[atk], effect, cls })
  }
  return results
}

// 全局属性最大值（用来算属性条百分比）
function computeGlobalMax() {
  let hp = 0, atk = 0, def = 0, work = 0
  for (const l of lumis) {
    hp = Math.max(hp, l.MaxHpState || 0)
    atk = Math.max(atk, l.MaxAtkState || 0)
    def = Math.max(def, l.MaxDefState || 0)
    work = Math.max(work, l.MaxWorkState || 0)
  }
  return { HP: hp, 攻击: atk, 防御: def, 工作: work }
}

// 进化链（复刻 LumiDetail.vue 的 findPrev/findNext）
function computeEvoChain(l) {
  const prev = []
  const next = []
  function findPrev(id, visited = new Set()) {
    if (visited.has(id)) return
    visited.add(id)
    const prevEvos = evolutions.filter(e => e.evoLumiID === id && e.EvoType !== 3)
    for (const p of prevEvos) {
      const pl = lumis.find(x => x.Id === p.Lumi)
      if (pl) { findPrev(p.Lumi, visited); prev.push({ lumi: pl, level: p.evoLevel }) }
    }
    const prevGE = evolutions.filter(e =>
      e.EvoType !== 3 && e.GenderEvo && e.GenderEvo.some(g => g[1] === id))
    for (const p of prevGE) {
      const pl = lumis.find(x => x.Id === p.Lumi)
      if (pl) {
        const g = p.GenderEvo.find(x => x[1] === id)
        findPrev(p.Lumi, visited)
        prev.push({ lumi: pl, level: p.evoLevel, gender: g[0] })
      }
    }
  }
  function findNext(id, visited = new Set()) {
    if (visited.has(id)) return
    visited.add(id)
    const nextEvos = evolutions.filter(e => e.Lumi === id && e.EvoType !== 3)
    for (const n of nextEvos) {
      if (n.evoLumiID) {
        const nl = lumis.find(x => x.Id === n.evoLumiID)
        if (nl) { next.push({ lumi: nl, level: n.evoLevel }); findNext(n.evoLumiID, visited) }
      }
      if (n.GenderEvo && n.GenderEvo.length) {
        for (const [gender, target] of n.GenderEvo) {
          const gl = lumis.find(x => x.Id === target)
          if (gl) { next.push({ lumi: gl, level: n.evoLevel, gender }); findNext(target, visited) }
        }
      }
    }
  }
  findPrev(l.Id)
  findNext(l.Id)
  const directPrev = evolutions.filter(e => e.EvoType !== 3 && e.evoLumiID === l.Id).length
    + evolutions.filter(e => e.EvoType !== 3 && e.GenderEvo && e.GenderEvo.some(g => g[1] === l.Id)).length
  const directNext = evolutions.filter(e => e.EvoType !== 3 && e.Lumi === l.Id).length
  const totalBranches = Math.max(directPrev, directNext)
  return { prev, next, totalBranches }
}

// 组装数据
const genderRatio = (() => {
  if (!lumi.GenderWeight?.length) return null
  const total = lumi.GenderWeight.reduce((s, x) => s + x[1], 0)
  if (!total) return null
  const map = { 1: '♂ 雄性', 2: '♀ 雌性', 3: '无性别' }
  const out = []
  for (const [t, w] of lumi.GenderWeight) {
    if (w > 0) out.push({ name: map[t] || t, pct: Math.round(w / total * 100) })
  }
  return out.length ? out : null
})()
const lumiAttribute = (() => {
  if (!lumi.LumiAttribute?.length) return null
  const fmt = v => {
    if (Array.isArray(v)) {
      if (v.length === 1) return String(v[0])
      return v[0] === v[1] ? String(v[0]) : `${v[0]}~${v[1]}`
    }
    return String(v)
  }
  const r = {}
  for (const [t, v] of lumi.LumiAttribute) {
    if (t === 1) r.height = fmt(v)
    else if (t === 2) r.weight = fmt(v)
  }
  return (r.height || r.weight) ? r : null
})()
const firstMeetKey = (() => {
  if (!avgData.length) return null
  for (const a of avgData.filter(x => x.CharacterID === lumi.Id)) {
    if (a.Content && a.Content.length > 0) return a.Content[0]
  }
  return null
})()
function getFirstMeetText(key) {
  if (!key) return ''
  const raw = loc[key] || ''
  const parts = raw.split('\\n')
  const text = parts.length > 1 ? parts[1] : raw
  return text.replace(/<[^>]+>/g, '').trim()
}
const orderDialogueKey = (() => {
  const e = orderNpcData.find(n => n.NPCid === lumi.Id)
  return e?.NPCdialogue || null
})()
const currentExtra = extraData[lumi.Id] || null
const recommendTeams = lumiTeamsData?.lumiTeams?.[String(lumi.Id)] || []
const recommendWeeks = lumiTeamsData?.weeks || []

const normalAttack = buildSkill(lumi.NormalAttack)
const inherentSkill = buildSkill(lumi.ActiveSkill)
const skillPool = [
  ...(lumi.SkillPool1 || []), ...(lumi.SkillPool2 || []), ...(lumi.SkillPool3 || [])
].map(buildSkill).filter(Boolean)

function getPassiveInfo(id) {
  if (!id) return null
  const bp = battlePassives.find(x => x.Id === id)
  if (bp) return { name: loc[bp.name] || bp.name, des: replacePlaceholders(loc[bp.Des] || '', bp.DesParam || []), kind: 'battle' }
  const hp = homePassives.find(x => x.Id === id)
  if (hp) return { name: loc[hp.name] || hp.name, des: replacePlaceholders(loc[hp.Des] || '', hp.DesParam || []), kind: 'home' }
  return null
}
const battlePassive = getPassiveInfo(lumi.BattlePassive)
const homePassive = getPassiveInfo(lumi.HomePassive)

const weaknesses = computeWeaknesses(lumi)
const globalMax = computeGlobalMax()
const evo = computeEvoChain(lumi)

console.log(`🖼️  内联图片（base64）...`)
// 提前 warm cache：所有推荐队伍里出现的其它噜咪 + 训练家技能图标
for (const t of recommendTeams) {
  for (const l of t.lumis) avatarB64(l.lumiId)
  const trId = t.topTrainerSkill?.trainerId
  if (trId) {
    const tr = trainerSkills.find(x => x.Id === trId)
    if (tr) skillIconB64(tr.icon)
  }
}
for (const e of [...evo.prev, ...evo.next]) avatarB64(e.lumi.CA)
avatarB64(lumi.CA)
console.log(`   缓存 ${imgCache.size} 张图（有效 ${[...imgCache.values()].filter(Boolean).length}）`)

// 关键字数据（点击弹窗用）
const keywordMap = {}
for (const k of keywords) {
  keywordMap[k.Id] = { name: loc[k.Name] || k.Name, des: loc[k.Des] || '' }
}

// ==================== 渲染 HTML ====================
function costTag(cost) {
  if (!cost) return ''
  if (cost.mode === 1) return `<span class="skill-stat-tag">消耗: ${cost.energy}</span>`
  if (cost.mode === 2) return `<span class="skill-stat-tag tag-erosion">蚀命: ${cost.hpPct}% · CD ${cost.cd} 普攻</span>`
  return ''
}
function typeTag(t) {
  if (!t) return ''
  return `<span class="type-tag" style="background:${TYPE_COLORS[t] || '#666'}">${TYPE_NAMES[t] || t}</span>`
}
function renderSkillItem(s, opts = {}) {
  const icon = s.iconB64 ? `<img src="${s.iconB64}" class="skill-icon-img">` : ''
  const power = (s.power !== '-') ? `<span class="skill-stat-tag">威力: ${s.power}</span>` : ''
  return `<div class="skill-item">
    ${icon}
    <div class="skill-info">
      <span class="skill-name">${esc(s.name)}</span>
      ${s.des ? `<span class="skill-des">${s.des}</span>` : ''}
    </div>
    <div class="skill-stats">${typeTag(s.type)}${costTag(s.cost)}${power}</div>
    <span class="skill-id">ID: ${s.id}</span>
  </div>`
}

// 头部
const headerHtml = `<div class="detail-header">
  <div class="detail-icon">
    ${avatarB64(lumi.CA) ? `<img src="${avatarB64(lumi.CA)}" class="detail-avatar-img" alt="${esc(loc[lumi.Name])}">` : '<span>🐾</span>'}
  </div>
  <div class="detail-info">
    <div class="detail-id">#${lumi.PokedexId}</div>
    <h1 class="detail-name">${esc(loc[lumi.Name])}</h1>
    <div class="detail-types">${typeTag(lumi.Type1)}${lumi.Type2 ? typeTag(lumi.Type2) : ''}</div>
  </div>
</div>`

// 基础信息
const basicInfoHtml = `<div class="section">
  <h2>基础信息</h2>
  <div class="info-grid">
    <div class="info-item"><div class="label">模型</div><div class="value">${esc(lumi.Model)}</div></div>
    <div class="info-item"><div class="label">评分范围</div><div class="value">${lumi.MinScore} ~ ${lumi.MaxScore}</div></div>
    <div class="info-item"><div class="label">内部 ID</div><div class="value">${lumi.Id}</div></div>
    <div class="info-item"><div class="label">赛季</div><div class="value">${LUMI_TAG_NAMES[lumi.LumiTag] || '-'}</div></div>
    <div class="info-item"><div class="label">个体类型</div><div class="value">${
      lumi.CardBack
        ? `<span style="color:${LUMI_CARD_TYPE_COLORS[lumi.CardBack] || '#ff9800'};font-weight:600">⭐ ${LUMI_CARD_TYPE[lumi.CardBack] || '特殊个体'}</span>`
        : '<span style="color:var(--text-dim)">普通</span>'
    }</div></div>
    <div class="info-item"><div class="label">性别比例</div><div class="value">${
      genderRatio ? genderRatio.map(g => `<span class="gender-tag">${g.name} ${g.pct}%</span>`).join('') : '-'
    }</div></div>
    ${lumiAttribute ? `<div class="info-item"><div class="label">身高体重</div><div class="value">
      ${lumiAttribute.height ? `<div>身高 ${lumiAttribute.height} cm</div>` : ''}
      ${lumiAttribute.weight ? `<div>体重 ${lumiAttribute.weight} kg</div>` : ''}
    </div></div>` : ''}
    <div class="info-item"><div class="label">工作能力</div><div class="value">${
      (lumi.WorkAbility && lumi.WorkAbility.length)
        ? lumi.WorkAbility.map(w => `<span class="work-tag">${WORK_TYPE_NAMES[w.Type] || w.Type}</span>`).join('')
        : '无'
    }</div></div>
    ${currentExtra?.bodyType ? `<div class="info-item"><div class="label">体型</div><div class="value">${esc(currentExtra.bodyType)}</div></div>` : ''}
    ${currentExtra?.activeMap ? `<div class="info-item"><div class="label">活动地图</div><div class="value">${esc(currentExtra.activeMap)}</div></div>` : ''}
  </div>
</div>`

// 推荐配队
function renderTeam(team) {
  const tags = (team.tags && team.tags.length ? team.tags : ['other'])
    .map(t => `<span class="recommend-team-tag tag-${t}">${TAG_LABEL[t]}</span>`).join('')
  const lumisHtml = team.lumis.map(l => {
    const isCurrent = String(l.lumiId) === String(lumi.Id)
    const av = avatarB64(l.lumiId)
    const skillId = l.topSkill?.skillId
    let skillHtml = ''
    if (l.topSkill) {
      if (skillId === 0) {
        skillHtml = `<span class="recommend-lumi-skill"><span class="recommend-skill-name is-none">未携带</span></span>`
      } else {
        const s = activeSkills.find(x => x.Id === skillId)
        const icon = s ? skillIconB64(s.icon) : null
        const name = s ? (loc[s.name] || s.name) : `技能#${skillId}`
        skillHtml = `<span class="recommend-lumi-skill">
          ${icon ? `<img src="${icon}" class="recommend-skill-icon">` : ''}
          <span class="recommend-skill-name">${esc(name)}</span>
        </span>`
      }
    }
    return `<div class="recommend-lumi${isCurrent ? ' is-current' : ''}">
      ${av ? `<img src="${av}" class="recommend-lumi-avatar">` : ''}
      <div class="recommend-lumi-info">
        <span class="recommend-lumi-name">${esc(l.lumiName)}</span>
        ${skillHtml}
      </div>
    </div>`
  }).join('')
  const trId = team.topTrainerSkill?.trainerId
  let trainerHtml = ''
  if (trId !== undefined) {
    if (trId === 0) {
      trainerHtml = `<div class="recommend-team-trainer">
        <span class="trainer-label">训练家</span>
        <span class="trainer-skill"><span class="trainer-icon-placeholder">—</span>
        <span class="trainer-name is-none">未携带</span></span>
      </div>`
    } else {
      const tr = trainerSkills.find(x => x.Id === trId)
      const icon = tr ? skillIconB64(tr.icon) : null
      const name = tr ? (loc[tr.name] || tr.name) : `训练家#${trId}`
      trainerHtml = `<div class="recommend-team-trainer">
        <span class="trainer-label">训练家</span>
        <span class="trainer-skill">
          ${icon ? `<img src="${icon}" class="trainer-icon">` : ''}
          <span class="trainer-name">${esc(name)}</span>
        </span>
      </div>`
    }
  }
  const winClass = (() => {
    const r = parseFloat(team.winRate)
    if (r >= 60) return 'high'
    if (r >= 50) return 'medium'
    return 'low'
  })()
  return `<div class="recommend-team-card">
    <div class="recommend-team-tags">${tags}</div>
    <div class="recommend-team-body">
      <div class="recommend-team-lumis">${lumisHtml}</div>
      ${trainerHtml}
      <div class="recommend-team-stats">
        <span class="recommend-stat">📊 ${team.battles.toLocaleString()} 场</span>
        <span class="recommend-stat ${winClass}">🏆 ${team.winRate}%</span>
      </div>
    </div>
  </div>`
}
const recommendHtml = recommendTeams.length
  ? `<div class="section"><h2>推荐配队 <span class="section-subtitle">基于 Week ${recommendWeeks.join('-')} 天梯（不含人机）+ 周赛</span></h2>
       <div class="recommend-teams">${recommendTeams.map(renderTeam).join('')}</div>
     </div>`
  : ''

// 关键特质 / 行为习惯 / 初见 / 订单 / 故事
function storySection(title, content) {
  if (!content) return ''
  return `<div class="section"><h2>${title}</h2><div class="story-content">${esc(content)}</div></div>`
}
const traitsHtml = storySection('关键特质', currentExtra?.keyTraits)
const behaviorHtml = storySection('行为习惯', currentExtra?.behavior)
const firstMeetHtml = firstMeetKey ? storySection('初见', getFirstMeetText(firstMeetKey)) : ''
const orderHtml = (orderDialogueKey && hasValidContent(orderDialogueKey)) ? storySection('订单', loc[orderDialogueKey]) : ''
const storyHtml = hasValidContent(lumi.Story) ? storySection('故事', loc[lumi.Story]) : ''

// 属性克制
const weaknessHtml = weaknesses.length ? `<div class="section">
  <h2>属性克制</h2>
  <p class="section-desc">被各属性攻击时的伤害效果</p>
  <div class="weakness-grid">
    ${weaknesses.map(w => `<div class="weakness-item ${w.cls}">
      <span class="weakness-type" style="background:${w.typeColor}">${w.typeName}</span>
      <span class="weakness-effect">${w.effect}</span>
    </div>`).join('')}
  </div>
</div>` : ''

// 属性值
const statsHtml = `<div class="section">
  <h2>属性值</h2>
  <div class="stat-bars">
    ${[
      ['HP', lumi.MinHpState, lumi.MaxHpState, globalMax.HP],
      ['攻击', lumi.MinAtkState, lumi.MaxAtkState, globalMax.攻击],
      ['防御', lumi.MinDefState, lumi.MaxDefState, globalMax.防御],
      ['工作', lumi.MinWorkState, lumi.MaxWorkState, globalMax.工作],
    ].map(([k, min, max, gmax]) => `<div class="stat-row">
      <span class="stat-label">${k}</span>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(max / gmax * 100).toFixed(1)}%"></div></div>
      <span class="stat-value">${min} ~ ${max}</span>
    </div>`).join('')}
  </div>
</div>`

// 特性（战斗/家园被动）
const passiveHtml = (battlePassive || homePassive) ? `<div class="section">
  <h2>特性</h2>
  ${battlePassive ? `<div class="skill-item">
    <span class="skill-type-badge battle">战斗被动</span>
    <div class="skill-info">
      <span class="skill-name">${esc(battlePassive.name)}</span>
      ${battlePassive.des ? `<span class="skill-des">${battlePassive.des}</span>` : ''}
    </div>
    <span class="skill-id">ID: ${lumi.BattlePassive}</span>
  </div>` : ''}
  ${homePassive ? `<div class="skill-item">
    <span class="skill-type-badge home">家园被动</span>
    <div class="skill-info">
      <span class="skill-name">${esc(homePassive.name)}</span>
      ${homePassive.des ? `<span class="skill-des">${homePassive.des}</span>` : ''}
    </div>
    <span class="skill-id">ID: ${lumi.HomePassive}</span>
  </div>` : ''}
</div>` : ''

// 普攻
const normalAttackHtml = normalAttack ? `<div class="section">
  <h2>普攻</h2>
  <div class="skill-item na-item">
    ${normalAttack.iconB64 ? `<img src="${normalAttack.iconB64}" class="skill-icon-img">` : ''}
    <div class="skill-info">
      <span class="skill-name">${esc(normalAttack.name)}</span>
      ${normalAttack.des ? `<span class="skill-des">${normalAttack.des}</span>` : ''}
    </div>
    <div class="na-stats">
      <div class="na-stat"><span class="na-label">攻击间隔</span><span class="na-val">${(normalAttack.attackInterval / 1000).toFixed(1)}s</span></div>
      <div class="na-stat"><span class="na-label">回能</span><span class="na-val">${(normalAttack.addEnergy / 10).toFixed(1)}</span></div>
      <div class="na-stat"><span class="na-label">技能威力</span><span class="na-val">${normalAttack.skillPowerList.join(' / ')}</span></div>
    </div>
  </div>
</div>` : ''

// 专属技能
const inherentHtml = inherentSkill ? `<div class="section">
  <h2>专属技能</h2>
  ${renderSkillItem(inherentSkill)}
</div>` : ''

// 技能池
const poolHtml = skillPool.length ? `<div class="section">
  <h2>技能池</h2>
  <div class="skill-list">${skillPool.map(renderSkillItem).join('')}</div>
</div>` : ''

// 进化链
function evoCard(item, kind) {
  const av = avatarB64(item.lumi.CA)
  const badges = kind === 'current'
    ? `<div class="evo-current-badge">当前</div>`
    : `<div class="evo-chain-req">
        ${item.gender ? `<span class="evo-gender-badge">${item.gender === 1 ? '♂' : '♀'}</span>` : ''}
        <span class="evo-level-badge">Lv.${item.level}</span>
      </div>`
  return `<div class="evo-chain-card${kind === 'current' ? ' evo-current-card' : ''}">
    ${av ? `<img src="${av}" class="evo-chain-img">` : ''}
    <div class="evo-chain-info">
      <div class="evo-chain-name">${esc(getLumiName(item.lumi.Id))}</div>
      <div class="evo-chain-id">#${item.lumi.PokedexId}</div>
      ${badges}
    </div>
  </div>`
}
let evoHtml = ''
if (evo.prev.length || evo.next.length) {
  if (evo.totalBranches <= 1) {
    // 线性
    const chain = [...evo.prev, { lumi, stage: 'current' }, ...evo.next]
    evoHtml = `<div class="section"><h2>进化链</h2>
      <div class="evo-chain-linear">
        ${chain.map((item, i) => `${i > 0 ? '<div class="evo-arrow">→</div>' : ''}${evoCard(item, item.stage === 'current' ? 'current' : 'linear')}`).join('')}
      </div>
    </div>`
  } else {
    // 多分支
    evoHtml = `<div class="section"><h2>进化链</h2>
      <div class="evo-chain-branch">
        ${evo.prev.length ? `<div class="evo-branch-section evo-prev">
          <div class="evo-branch-label">前置进化</div>
          <div class="evo-branch-items">${evo.prev.map(item => `<div>${evoCard(item, 'prev')}<div class="evo-arrow-down">↓</div></div>`).join('')}</div>
        </div>` : ''}
        <div class="evo-current-wrapper">${evoCard({ lumi }, 'current')}</div>
        ${evo.next.length ? `<div class="evo-branch-section evo-next">
          <div class="evo-branch-label">后续进化 (${evo.next.length}种)</div>
          <div class="evo-branch-items">${evo.next.map(item => `<div><div class="evo-arrow-up">↑</div>${evoCard(item, 'next')}</div>`).join('')}</div>
        </div>` : ''}
      </div>
    </div>`
  }
}

// 页脚 + 顶部横幅
const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
const branch = isInternal ? '对内开发分支' : '对外稳定分支'

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(loc[lumi.Name])} · 详情 · LumiWiki 快照</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
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
  display: flex; align-items: baseline; justify-content: space-between;
  flex-wrap: wrap; gap: 12px; padding-bottom: 16px; margin-bottom: 20px;
  border-bottom: 2px solid var(--accent);
}
.snapshot-title { font-size: 1.4em; font-weight: 700; color: #fff; }
.snapshot-meta { color: var(--text-dim); font-size: 0.85em; }
.snapshot-meta strong { color: var(--accent-light); }

/* ==== 详情页样式（抄 LumiDetail.vue） ==== */
.detail-header {
  display: flex; align-items: center; gap: 24px; margin-bottom: 32px;
  padding: 24px; background: var(--bg-card); border-radius: var(--radius); border: 1px solid var(--border);
}
.detail-icon { font-size: 4em; flex-shrink: 0; }
.detail-avatar-img { width: 180px; height: 240px; object-fit: contain; }
.detail-id { color: var(--text-dim); font-size: 0.9em; }
.detail-name { color: #fff; font-size: 1.8em; margin: 4px 0; }
.detail-types { display: flex; align-items: center; gap: 8px; }
.type-tag {
  color:#fff; padding:3px 10px; border-radius:10px; font-size:0.8em; font-weight:600;
  display:inline-block;
}
.section { margin-bottom: 28px; }
.section h2 {
  color:#fff; font-size:1.2em; margin-bottom:12px; padding-bottom:8px;
  border-bottom: 1px solid var(--border);
}
.section-subtitle { font-size:0.75em; color:var(--text-dim); font-weight:normal; margin-left:8px; }
.info-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:12px; }
.info-item { background: var(--bg-card); border-radius:8px; padding:12px; }
.info-item .label { font-size:0.8em; color:var(--text-dim); margin-bottom:4px; }
.info-item .value { font-size:1.1em; font-weight:600; color:#fff; }

/* 推荐配队 */
.recommend-teams { display:flex; flex-direction:column; gap:12px; }
.recommend-team-card {
  display:flex; gap:14px; background:rgba(255,255,255,0.03);
  border:1px solid var(--border); border-radius:10px; padding:14px;
}
.recommend-team-tags { display:flex; flex-direction:column; gap:4px; min-width:68px; }
.recommend-team-tag {
  font-size:0.78em; font-weight:bold; padding:3px 8px; border-radius:6px;
  border:1px solid transparent; white-space:nowrap; line-height:1.4;
}
.recommend-team-tag.tag-most-used { color:#a78bfa; background:rgba(167,139,250,0.12); border-color:rgba(167,139,250,0.35); }
.recommend-team-tag.tag-highest-winrate { color:#4ade80; background:rgba(74,222,128,0.12); border-color:rgba(74,222,128,0.35); }
.recommend-team-tag.tag-other { color:#94a3b8; background:rgba(148,163,184,0.12); border-color:rgba(148,163,184,0.3); }
.recommend-team-body { flex:1; display:flex; flex-direction:column; gap:10px; }
.recommend-team-lumis { display:flex; gap:10px; flex-wrap:wrap; }
.recommend-lumi {
  display:flex; align-items:center; gap:10px; padding:8px 12px;
  background:rgba(255,255,255,0.04); border:1px solid var(--border);
  border-radius:8px; min-width:160px;
}
.recommend-lumi.is-current {
  border-color: var(--accent); background: rgba(102, 126, 234, 0.12);
}
.recommend-lumi-avatar { width:44px; height:44px; border-radius:8px; border:2px solid var(--border); flex-shrink:0; }
.recommend-lumi-info { display:flex; flex-direction:column; gap:3px; min-width:0; }
.recommend-lumi-name { font-weight:bold; color:#fff; font-size:0.95em; }
.recommend-lumi-skill { display:flex; align-items:center; gap:5px; font-size:0.78em; }
.recommend-skill-icon { width:18px; height:18px; border-radius:3px; }
.recommend-skill-name { color:var(--text-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.recommend-skill-name.is-none { color:#888; font-style:italic; }
.recommend-team-stats { display:flex; gap:16px; font-size:0.85em; color:var(--text-dim); }
.recommend-team-trainer { display:flex; align-items:center; gap:10px; font-size:0.85em; }
.recommend-team-trainer .trainer-label { color:var(--accent); font-weight:bold; }
.recommend-team-trainer .trainer-skill { display:flex; align-items:center; gap:6px; }
.recommend-team-trainer .trainer-icon { width:20px; height:20px; border-radius:3px; }
.recommend-team-trainer .trainer-icon-placeholder {
  width:20px; height:20px; display:inline-flex; align-items:center;
  justify-content:center; color:#888;
}
.recommend-team-trainer .trainer-name { color:var(--text-dim); }
.recommend-team-trainer .trainer-name.is-none { color:#888; font-style:italic; }
.recommend-stat.high { color:#4caf50; font-weight:bold; }
.recommend-stat.medium { color:#ff9800; font-weight:bold; }
.recommend-stat.low { color:#f44336; font-weight:bold; }

.story-content {
  color: var(--text-dim); line-height:1.8; font-size:0.95em; white-space:pre-wrap;
  background: rgba(255,255,255,0.03); padding:16px; border-radius:8px;
  border-left: 3px solid var(--accent);
}

/* 属性条 */
.stat-bars { display:flex; flex-direction:column; gap:10px; }
.stat-row { display:flex; align-items:center; gap:12px; }
.stat-label { width:50px; text-align:right; color:var(--text-dim); font-size:0.9em; }
.stat-bar-track { flex:1; height:22px; background:var(--bg-card); border-radius:11px; overflow:hidden; }
.stat-bar-fill { height:100%; background:linear-gradient(90deg, var(--accent), var(--accent-light)); border-radius:11px; }
.stat-value { width:100px; color:var(--text-dim); font-size:0.85em; }

/* 技能 */
.skill-list { display:flex; flex-direction:column; gap:8px; }
.skill-item {
  display:flex; align-items:center; gap:12px; padding:10px 14px;
  background:var(--bg-card); border-radius:8px;
}
.skill-icon-img { width:36px; height:36px; object-fit:contain; image-rendering:pixelated; flex-shrink:0; }
.skill-type-badge {
  background:var(--accent); color:#fff; padding:2px 10px; border-radius:10px; font-size:0.8em;
}
.skill-type-badge.battle { background:#e94560; }
.skill-type-badge.home { background:#4caf50; }
.skill-info { flex:1; display:flex; flex-direction:column; gap:4px; }
.skill-name { font-weight:600; }
.skill-des { font-size:0.85em; color:var(--text-dim); line-height:1.4; }
.skill-id { color:var(--text-dim); font-size:0.85em; }
.skill-stats { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.skill-stat-tag {
  background:rgba(255,255,255,0.1); color:var(--text-dim);
  padding:3px 10px; border-radius:10px; font-size:0.8em;
}
.skill-stat-tag.tag-erosion { background: rgba(220,53,69,0.18); color:#ff8b95; font-weight:600; }

/* 普攻 */
.na-item { flex-wrap:wrap; }
.na-stats {
  display:flex; gap:20px; width:100%; margin-top:8px; padding-top:8px;
  border-top: 1px solid var(--border);
}
.na-stat { display:flex; flex-direction:column; gap:2px; }
.na-label { font-size:0.8em; color:var(--text-dim); }
.na-val { font-weight:600; color:#fff; }
.work-tag {
  display:inline-block; background:rgba(233,69,96,0.15); color:var(--accent-light);
  padding:2px 10px; border-radius:10px; font-size:0.85em; margin:2px 4px 2px 0;
}
.gender-tag {
  display:inline-block; background:rgba(103,126,234,0.15); color:#9faf;
  padding:2px 10px; border-radius:10px; font-size:0.85em; margin:2px 4px 2px 0;
}

/* 进化链 */
.evo-chain-linear { display:flex; flex-wrap:wrap; align-items:center; gap:8px; justify-content:center; }
.evo-chain-branch { display:flex; flex-direction:column; gap:24px; align-items:center; }
.evo-branch-section { width:100%; display:flex; flex-direction:column; align-items:center; }
.evo-branch-label { font-size:0.85em; color:var(--text-dim); margin-bottom:12px; text-align:center; }
.evo-branch-items { display:flex; flex-wrap:wrap; gap:12px; justify-content:center; max-width:800px; }
.evo-current-wrapper { display:flex; justify-content:center; padding:16px; }
.evo-chain-card {
  display:flex; align-items:center; gap:12px; padding:10px 14px;
  background:var(--bg-card); border-radius:10px; border:2px solid var(--border);
}
.evo-current-card {
  background: linear-gradient(135deg, var(--bg-card), rgba(233,69,96,0.15));
  border: 3px solid var(--accent); border-radius:12px; padding:14px 18px;
  box-shadow: 0 4px 20px rgba(233,69,96,0.3);
}
.evo-chain-img { width:50px; height:67px; object-fit:contain; flex-shrink:0; }
.evo-chain-info { display:flex; flex-direction:column; gap:4px; }
.evo-chain-name { color:var(--text); font-weight:600; font-size:0.9em; }
.evo-chain-id { color:var(--text-dim); font-size:0.75em; }
.evo-chain-req { display:flex; gap:4px; margin-top:2px; }
.evo-gender-badge { padding:1px 6px; border-radius:3px; font-size:0.7em; background:#ff69b4; color:#fff; }
.evo-level-badge { padding:1px 6px; border-radius:3px; font-size:0.7em; background:var(--accent); color:#fff; }
.evo-current-badge {
  padding:1px 6px; border-radius:3px; font-size:0.7em;
  background:var(--accent); color:#fff; align-self:flex-start;
}
.evo-arrow { font-size:1.3em; color:var(--text-dim); font-weight:bold; }
.evo-arrow-up, .evo-arrow-down { text-align:center; font-size:1.5em; color:var(--accent); font-weight:bold; margin:4px 0; }
.evo-prev .evo-arrow-down { color: var(--text-dim); }

/* 属性克制 */
.section-desc { color:var(--text-dim); font-size:0.9em; margin-bottom:12px; }
.weakness-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap:10px; }
.weakness-item {
  display:flex; flex-direction:column; align-items:center; gap:6px;
  padding:12px 8px; background:var(--bg-card); border:1px solid var(--border); border-radius:8px;
}
.weakness-type { color:#fff; padding:4px 12px; border-radius:12px; font-size:0.85em; font-weight:600; }
.weakness-effect { font-size:1.8em; font-weight:700; }
.weakness-item.double-strong .weakness-effect { color:#c62828; }
.weakness-item.strong .weakness-effect { color:#e57373; }
.weakness-item.normal .weakness-effect { color:var(--text-dim); }
.weakness-item.weak .weakness-effect { color:#66bb6a; }
.weakness-item.double-weak .weakness-effect { color:#1b5e20; }
.weakness-item.immune .weakness-effect { color:#666; }

/* 关键字弹窗 */
.tooltip-overlay {
  position:fixed; top:0; left:0; right:0; bottom:0;
  background:rgba(0,0,0,0.7);
  display:flex; align-items:center; justify-content:center; z-index:9999;
}
.tooltip-overlay[hidden] { display:none; }
.tooltip-card {
  background:#1a1a2e; border:2px solid #e94560; border-radius:12px;
  padding:20px; max-width:400px; width:90%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.tooltip-header {
  display:flex; justify-content:space-between; align-items:center;
  margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #e94560;
}
.tooltip-header h3 { color:#e94560; font-size:1.3em; margin:0; }
.tooltip-close {
  background:none; border:none; color:#888; font-size:1.5em; cursor:pointer;
  width:32px; height:32px; display:flex; align-items:center; justify-content:center;
}
.tooltip-close:hover { color:#e94560; }
.tooltip-body { color:#e0e0e0; line-height:1.6; font-size:0.95em; }
.keyword-link:hover { opacity:0.8; }

.footer-note {
  margin-top:40px; padding:16px; text-align:center;
  color:var(--text-dim); font-size:0.8em; border-top:1px solid var(--border);
}

@media (max-width: 640px) {
  .detail-header { flex-direction:column; text-align:center; }
  .detail-types { justify-content:center; }
  .weakness-grid { grid-template-columns: repeat(auto-fill, minmax(85px, 1fr)); }
}
</style>
</head>
<body>
<div class="wrap">
  <div class="snapshot-header">
    <div>
      <div class="snapshot-title">🐾 ${esc(loc[lumi.Name])} · 详情快照</div>
      <div class="snapshot-meta">LumiWiki · <strong>${branch}</strong> · 生成于 ${now}</div>
    </div>
    <div class="snapshot-meta">#${lumi.PokedexId} · Id ${lumi.Id}</div>
  </div>

  ${headerHtml}
  ${basicInfoHtml}
  ${recommendHtml}
  ${traitsHtml}
  ${behaviorHtml}
  ${firstMeetHtml}
  ${orderHtml}
  ${storyHtml}
  ${weaknessHtml}
  ${statsHtml}
  ${passiveHtml}
  ${normalAttackHtml}
  ${inherentHtml}
  ${poolHtml}
  ${evoHtml}

  <div class="footer-note">
    LumiWiki 静态快照 · 所有图片 base64 内联 · 点击带颜色的关键字查看描述
  </div>
</div>

<div class="tooltip-overlay" id="tooltip" hidden>
  <div class="tooltip-card">
    <div class="tooltip-header">
      <h3 id="tooltipTitle"></h3>
      <button class="tooltip-close" id="tooltipClose">✕</button>
    </div>
    <div class="tooltip-body" id="tooltipBody"></div>
  </div>
</div>

<script>
const KEYWORDS = ${JSON.stringify(keywordMap)};
const tooltip = document.getElementById('tooltip')
const tooltipTitle = document.getElementById('tooltipTitle')
const tooltipBody = document.getElementById('tooltipBody')
document.getElementById('tooltipClose').addEventListener('click', () => tooltip.hidden = true)
tooltip.addEventListener('click', e => { if (e.target === tooltip) tooltip.hidden = true })
document.addEventListener('click', e => {
  const kw = e.target.closest('.keyword-link')
  if (!kw) return
  const id = kw.dataset.kw
  const k = KEYWORDS[id]
  if (!k) return
  tooltipTitle.textContent = k.name
  tooltipBody.textContent = k.des
  tooltip.hidden = false
})
</script>
</body>
</html>
`

const outPath = outArg
  ? path.resolve(outArg)
  : path.join(PROJECT_ROOT, 'snapshot', `lumi-detail-${lumi.Id}-${loc[lumi.Name]}.html`)
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, html, 'utf-8')
const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1)
console.log(`\n✅ 已导出: ${outPath}`)
console.log(`   文件大小: ${sizeKB} KB`)
console.log(`   直接双击打开即可离线浏览\n`)
