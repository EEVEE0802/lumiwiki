// 从「特效资源记录表-战斗特效.csv」导入 vfxNormal / vfxSkill 到 production_orders
// 用法: node scripts/import-vfx-csv.mjs [--csv <path>] [--dry-run] [--overwrite]
//
// 默认 CSV: D:/lumiwiki/docs/特效资源记录表-战斗特效.csv
//
// 匹配规则：
//   1. 用 production_orders 表里的 name → lumiId 做匹配（比 wiki 覆盖率高很多，
//      因为很多在排期里还没上 wiki 的噜咪就是在这里）
//   2. CSV 里的「角色名」(列 0) 精确匹配 orders.name
//   3. prefab 名（列 4）按命名 token 分类：
//      - 含 'Attack' → 普攻 (vfxNormal)
//      - 含 'Skill'  → 技能 (vfxSkill)
//      - 都没有：跳过（写报告）
//      - 含 'Act' → 动作 · 含 'Hit' → 受击 · 含 'Fly' → 子弹
//   4. 挂点（列 6）清洗：'sZeroPoint'/'s ZeroPoint' 统一成 's_ZeroPoint'，
//      'd HitPoint' → 'd_HitPoint'
//
// 合并策略：
//   - 默认 append：库里已有的 vfxNormal / vfxSkill 保留人工填的，追加 CSV 里的新条目（按 name 去重）
//   - --overwrite：CSV 全量覆盖库里的 vfx 字段（慎用）
//
// 输出：
//   docs/vfx-import-report.md —— 匹配统计 + 未匹配噜咪 + 无法分类的 prefab 列表

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(PROJECT_ROOT, 'api/data/lumiwiki.db')

const args = process.argv.slice(2)
const csvArgIdx = args.indexOf('--csv')
const csvPath = csvArgIdx !== -1 ? args[csvArgIdx + 1] : path.join(PROJECT_ROOT, 'docs/特效资源记录表-战斗特效.csv')
const dryRun = args.includes('--dry-run')
const overwrite = args.includes('--overwrite')

const require = createRequire(path.join(PROJECT_ROOT, 'api/package.json'))
const Database = require('better-sqlite3')

function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuote) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++ } else inQuote = false }
      else field += c
    } else {
      if (c === '"') inQuote = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else field += c
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

// 挂点清洗
function normalizeHook(raw) {
  const s = (raw || '').trim()
  if (!s) return ''
  // 常见拼写变体归一
  if (/^s[\s_]?ZeroPoint/i.test(s) && !s.includes('（')) return 's_ZeroPoint'
  if (/^d[\s_]?HitPoint/i.test(s)) return 'd_HitPoint'
  return s
}

// prefab → { group: 'normal'|'skill'|null, type: '动作'|'子弹'|'受击'|null }
function classifyPrefab(prefab) {
  const s = (prefab || '')
  const lower = s.toLowerCase()
  let group = null
  if (/attack/i.test(lower)) group = 'normal'
  else if (/skill/i.test(lower)) group = 'skill'
  let type = null
  // 顺序：Fly 优先（子弹通常也带 Act 词根的假子集），再 Hit，再 Act
  if (/(_|^)fly/i.test(lower)) type = '子弹'
  else if (/(_|^)hit/i.test(lower)) type = '受击'
  else if (/(_|^)act/i.test(lower)) type = '动作'
  return { group, type }
}

function loadNameToLumiIdMap(db) {
  // 从 production_orders 表拿 name → lumiId 映射（比 wiki 数据覆盖率高）
  const rows = db.prepare(`SELECT lumiId, name, model FROM production_orders WHERE name IS NOT NULL AND name != ''`).all()
  const nameToId = new Map()
  const modelToId = new Map()
  for (const r of rows) {
    const n = (r.name || '').trim()
    if (n) {
      if (!nameToId.has(n)) nameToId.set(n, [])
      nameToId.get(n).push(r.lumiId)
    }
    const m = (r.model || '').trim()
    if (m) {
      if (!modelToId.has(m)) modelToId.set(m, [])
      modelToId.get(m).push(r.lumiId)
    }
  }
  return { nameToId, modelToId, totalOrders: rows.length }
}

// 从 prefab 名抽 model 段 —— 精确匹配 FX_Lumi_<Model>_(Attack|Skill|...)
// 拿不到就返回 null
function extractModelFromPrefab(prefab) {
  if (!prefab) return null
  const m = prefab.match(/^FX_Lumi_(.+?)_(Attack|Skill|Active|Ability|Common|Home|General|Idle|Enter|BreakSkin)/i)
  return m ? m[1] : null
}

// 读 docs/vfx-alias.md 里的人工别名映射（表格：CSV 角色名 → 正确命名）
// 只保留有正确命名的行；正确命名以最后一列的 `xxx` 形式表示（反引号），
// 也支持没反引号的裸文本。空字符串 / "—" / "废弃" 等一律视为「未映射」
function loadAliasMap() {
  const p = path.join(PROJECT_ROOT, 'docs/vfx-alias.md')
  if (!fs.existsSync(p)) return new Map()
  const text = fs.readFileSync(p, 'utf-8')
  const alias = new Map()
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    // 表格行：以 | 开头
    if (!raw.startsWith('|')) continue
    const cells = raw.split('|').slice(1, -1).map(c => c.trim())
    if (cells.length < 2) continue
    // 跳表头 / 分隔符行
    if (/^-+$/.test(cells[0].replace(/[`\s]/g, ''))) continue
    if (cells[0] === 'CSV 角色名') continue
    const csvNameRaw = cells[0].replace(/^`|`$/g, '').trim()
    const correctRaw = cells[cells.length - 1].replace(/^`|`$/g, '').trim()
    if (!csvNameRaw || !correctRaw) continue
    if (['—', '-', '废弃', '未填写', 'TODO', 'todo'].includes(correctRaw)) continue
    alias.set(csvNameRaw, correctRaw)
  }
  return alias
}

// 读 docs/vfx-conflict.md 里的冲突决策
// 表格：lumiId | orders.name | 冲突的 CSV 名 | 处置
//   处置列可以是：
//     - 留空 / all      → 全部保留（默认）
//     - keep=名A,名B    → 只保留这些 CSV 名的行
//     - drop=名A,名B    → 排除这些 CSV 名的行，其他保留
// 返回 Map<lumiId, {mode: 'keep'|'drop', names: Set<string>}>
function loadConflictDecisions() {
  const p = path.join(PROJECT_ROOT, 'docs/vfx-conflict.md')
  if (!fs.existsSync(p)) return new Map()
  const text = fs.readFileSync(p, 'utf-8')
  const decisions = new Map()
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.startsWith('|')) continue
    const cells = raw.split('|').slice(1, -1).map(c => c.trim())
    if (cells.length < 4) continue
    if (/^-+$/.test(cells[0].replace(/[`\s]/g, ''))) continue
    if (cells[0] === 'lumiId') continue
    const lidRaw = cells[0].replace(/^`|`$/g, '').trim()
    const lid = Number(lidRaw)
    if (!Number.isFinite(lid)) continue
    const disposition = cells[3].trim()
    if (!disposition || disposition === 'all' || disposition === '—' || disposition === '-') continue
    const m = disposition.match(/^(keep|drop)\s*=\s*(.+)$/i)
    if (!m) continue
    const mode = m[1].toLowerCase()
    const names = new Set(m[2].split(/[,、，]/).map(s => s.trim().replace(/^`|`$/g, '')).filter(Boolean))
    if (names.size) decisions.set(lid, { mode, names })
  }
  return decisions
}

function mergeVfx(existing, incoming) {
  // 按 name 唯一：库里已有的 name 保留（人工可能改过 type/hook），CSV 里的新 name 追加
  const arr = Array.isArray(existing) ? [...existing] : []
  const existingNames = new Set(arr.map(x => (x.name || '').toLowerCase()))
  for (const v of incoming) {
    const key = (v.name || '').toLowerCase()
    if (!key || existingNames.has(key)) continue
    arr.push(v)
    existingNames.add(key)
  }
  return arr
}

function main() {
  console.log(`\n📖 CSV: ${csvPath}`)
  if (!fs.existsSync(csvPath)) throw new Error(`CSV 不存在: ${csvPath}`)
  const raw = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '')
  const rows = parseCsv(raw)
  console.log(`   共 ${rows.length - 1} 行`)

  const db = dryRun ? null : new Database(DB_PATH)
  if (db) db.pragma('foreign_keys = ON')

  // dry-run 也需要连库来查 orders 表做匹配
  const readDb = db || new Database(DB_PATH, { readonly: true })
  const { nameToId, modelToId, totalOrders } = loadNameToLumiIdMap(readDb)
  console.log(`\n🗂️ production_orders 里有 ${totalOrders} 条 order，${nameToId.size} 个唯一 name、${modelToId.size} 个唯一 model 可用于匹配`)

  // 加载人工别名（docs/vfx-alias.md）—— CSV 名 → 正式命名
  const aliasMap = loadAliasMap()
  const aliasHits = new Map()  // csvName -> resolvedName
  const modelHits = new Map()  // csvName -> model  (通过 prefab model 匹配到的)
  if (aliasMap.size) console.log(`📎 vfx-alias.md 提供 ${aliasMap.size} 条别名映射`)

  // 加载冲突决策（docs/vfx-conflict.md）—— lumiId → { mode, names }
  const conflictDecisions = loadConflictDecisions()
  if (conflictDecisions.size) console.log(`⚖️ vfx-conflict.md 提供 ${conflictDecisions.size} 条冲突决策`)

  const stmtGet = db?.prepare('SELECT lumiId, vfxNormal, vfxSkill FROM production_orders WHERE lumiId = ?')
  const stmtUpd = db?.prepare(`
    UPDATE production_orders SET
      vfxNormal = @vfxNormal,
      vfxSkill  = @vfxSkill,
      updatedAt = @updatedAt
    WHERE lumiId = @lumiId
  `)

  // 收集: lumiId -> { normal: [], skill: [] }
  const byLumi = new Map()

  const unmatchedNames = new Map()  // csvName -> [csv 行号...]
  const ambiguousNames = new Map()  // key(name/model) -> [lumiId...]
  const aliasBadTarget = new Map()  // csvName -> alias 指向的名字（但 orders 里也没有）
  const noClassPrefabs = []          // {name, prefab, note}
  let totalRecords = 0

  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri]
    if (!r || r.length < 7) continue
    const csvName = (r[0] || '').trim()
    const prefab = (r[4] || '').trim()
    const desc = (r[5] || '').trim()
    const hook = normalizeHook(r[6])
    if (!csvName || !prefab) continue

    // 三级精确匹配：CSV 名 → prefab 抽出的 model → alias 表
    let ids = nameToId.get(csvName)
    let resolvedKey = csvName
    let matchWay = 'name'

    if (!ids || !ids.length) {
      const model = extractModelFromPrefab(prefab)
      if (model && modelToId.has(model)) {
        ids = modelToId.get(model)
        resolvedKey = model
        matchWay = 'model'
        modelHits.set(csvName, model)
      }
    }
    if (!ids || !ids.length) {
      if (aliasMap.has(csvName)) {
        const correct = aliasMap.get(csvName)
        const aliasIds = nameToId.get(correct)
        if (aliasIds && aliasIds.length) {
          ids = aliasIds
          resolvedKey = correct
          matchWay = 'alias'
          aliasHits.set(csvName, correct)
        } else {
          aliasBadTarget.set(csvName, correct)
        }
      }
    }
    if (!ids || !ids.length) {
      if (!unmatchedNames.has(csvName)) unmatchedNames.set(csvName, [])
      unmatchedNames.get(csvName).push(ri + 1)
      continue
    }
    if (ids.length > 1) {
      ambiguousNames.set(`${resolvedKey} [${matchWay}]`, ids)
      continue
    }
    const lumiId = ids[0]

    const { group, type } = classifyPrefab(prefab)
    if (!group || !type) {
      noClassPrefabs.push({ csvName, prefab, desc, reason: !group ? '无 Attack/Skill' : '无 Act/Hit/Fly' })
      continue
    }

    if (!byLumi.has(lumiId)) byLumi.set(lumiId, { normal: [], skill: [] })
    const bucket = byLumi.get(lumiId)
    bucket[group].push({ name: prefab, type, hook, _src: csvName })
    totalRecords++
  }

  // 检测冲突：同一 lumiId 被多个不同 csvName 命中
  // 记录到 conflictScenes，用于报告和决策骨架
  const conflictScenes = []  // [{ lumiId, csvNames: [{name, prefabs:[]}] }]
  for (const [lumiId, buckets] of byLumi) {
    const bySrc = new Map()
    for (const g of ['normal', 'skill']) {
      for (const item of buckets[g]) {
        if (!bySrc.has(item._src)) bySrc.set(item._src, [])
        bySrc.get(item._src).push(item.name)
      }
    }
    if (bySrc.size > 1) {
      conflictScenes.push({
        lumiId,
        csvNames: [...bySrc.entries()].map(([n, prefabs]) => ({ name: n, prefabs })),
      })
    }
  }

  // 按 conflictDecisions 过滤 byLumi 里的行
  let conflictFilteredRecords = 0
  for (const [lumiId, buckets] of byLumi) {
    const decision = conflictDecisions.get(lumiId)
    if (!decision) continue
    for (const g of ['normal', 'skill']) {
      const before = buckets[g].length
      if (decision.mode === 'keep') {
        buckets[g] = buckets[g].filter(x => decision.names.has(x._src))
      } else if (decision.mode === 'drop') {
        buckets[g] = buckets[g].filter(x => !decision.names.has(x._src))
      }
      conflictFilteredRecords += (before - buckets[g].length)
    }
  }
  // 剥掉 _src（不写库）
  for (const buckets of byLumi.values()) {
    for (const g of ['normal', 'skill']) {
      buckets[g] = buckets[g].map(({ _src, ...rest }) => rest)
    }
  }

  // 写库
  let updated = 0
  if (db) {
    const tx = db.transaction(() => {
      const now = new Date().toISOString()
      for (const [lumiId, buckets] of byLumi) {
        const row = stmtGet.get(lumiId)
        if (!row) continue  // 名字匹配走 orders 表本身，理论上不会走到这里

        let existingNormal = []
        let existingSkill = []
        if (!overwrite) {
          try { existingNormal = row.vfxNormal ? JSON.parse(row.vfxNormal) : [] } catch {}
          try { existingSkill = row.vfxSkill ? JSON.parse(row.vfxSkill) : [] } catch {}
        }
        const mergedN = mergeVfx(existingNormal, buckets.normal)
        const mergedS = mergeVfx(existingSkill, buckets.skill)
        stmtUpd.run({
          lumiId,
          vfxNormal: mergedN.length ? JSON.stringify(mergedN) : null,
          vfxSkill:  mergedS.length ? JSON.stringify(mergedS) : null,
          updatedAt: now,
        })
        updated++
      }
    })
    tx()
    // 注意：不在这里关 db，后面生成 conflict 骨架时还要用它查 orders.name/model
  } else {
    for (const lumiId of byLumi.keys()) updated++
  }

  // 报告
  const lines = []
  lines.push(`# 特效 CSV 导入报告`)
  lines.push('')
  lines.push(`- 生成时间: ${new Date().toLocaleString('zh-CN')}`)
  lines.push(`- CSV: \`${csvPath}\``)
  lines.push(`- 模式: ${dryRun ? 'dry-run' : (overwrite ? 'overwrite' : 'append/merge')}`)
  lines.push('')
  lines.push(`## 统计`)
  lines.push('')
  lines.push(`| 项 | 数量 |`)
  lines.push(`|---|---|`)
  lines.push(`| CSV 数据行 | ${rows.length - 1} |`)
  lines.push(`| 有效特效记录（有 group + type + 名字匹配） | ${totalRecords} |`)
  lines.push(`| ✅ 更新的 order 数 | ${updated} |`)
  lines.push(`| 🧬 通过 prefab 里的 model 名命中的 CSV 名 | ${modelHits.size} |`)
  lines.push(`| 📎 通过 alias 命中的 CSV 名 | ${aliasHits.size} |`)
  lines.push(`| ⚖️ 冲突场景（一 lumiId 多 CSV 名） | ${conflictScenes.length} |`)
  lines.push(`| 🗑️ 被冲突决策过滤掉的记录 | ${conflictFilteredRecords} |`)
  lines.push(`| ❌ CSV 名字未匹配（orders 里没有这只噜咪） | ${unmatchedNames.size} |`)
  lines.push(`| ⚠️ 名字歧义（同名多 lumiId） | ${ambiguousNames.size} |`)
  lines.push(`| ⚠️ alias 指向的正式名在 orders 里也不存在 | ${aliasBadTarget.size} |`)
  lines.push(`| ❌ prefab 无法分类 | ${noClassPrefabs.length} |`)
  lines.push('')

  if (modelHits.size) {
    lines.push(`## 🧬 通过 prefab 里的 model 名命中`)
    lines.push('')
    lines.push(`CSV 里的中文名跟 orders.name 对不上，但 prefab 里 \`FX_Lumi_<Model>_...\` 抽出来的 model 段跟 orders.model 精确一致。`)
    lines.push('')
    lines.push(`| CSV 角色名 | 抽到的 model |`)
    lines.push(`|---|---|`)
    for (const [csvN, model] of modelHits) lines.push(`| \`${csvN}\` | \`${model}\` |`)
    lines.push('')
  }

  if (conflictScenes.length) {
    lines.push(`## ⚖️ 冲突场景（一 lumiId 被多个 CSV 名命中）`)
    lines.push('')
    lines.push(`这些噜咪在 CSV 里有多条来源（旧版/新版/皮肤变体/别称）。默认全部合并入库。`)
    lines.push(`如需只留一部分，编辑 \`docs/vfx-conflict.md\` 在处置列填 \`keep=名A,名B\` 或 \`drop=名A,名B\`。`)
    lines.push('')
    for (const s of conflictScenes) {
      const orderRow = readDb.prepare('SELECT name, model FROM production_orders WHERE lumiId = ?').get(s.lumiId)
      lines.push(`### #${s.lumiId} — \`${orderRow?.name || '?'}\`（model: \`${orderRow?.model || '?'}\`）`)
      lines.push('')
      for (const c of s.csvNames) {
        lines.push(`- **${c.name}**`)
        for (const p of c.prefabs) lines.push(`  - \`${p}\``)
      }
      lines.push('')
    }
  }

  if (aliasHits.size) {
    lines.push(`## 📎 alias 命中（来自 docs/vfx-alias.md）`)
    lines.push('')
    lines.push(`| CSV 角色名 | → 正式命名 |`)
    lines.push(`|---|---|`)
    for (const [csvN, correct] of aliasHits) lines.push(`| \`${csvN}\` | \`${correct}\` |`)
    lines.push('')
  }

  if (aliasBadTarget.size) {
    lines.push(`## ⚠️ alias 指向的正式名在 orders 里找不到`)
    lines.push('')
    lines.push('这些是你在 `docs/vfx-alias.md` 里填了正式命名，但 orders 表里没有对应 name 的。请复核 alias 拼写。')
    lines.push('')
    lines.push(`| CSV 角色名 | 填的正式命名 |`)
    lines.push(`|---|---|`)
    for (const [csvN, correct] of aliasBadTarget) lines.push(`| \`${csvN}\` | \`${correct}\` |`)
    lines.push('')
  }

  if (ambiguousNames.size) {
    lines.push(`## ⚠️ 同一角色名对应多个 lumiId（需人工判定）`)
    lines.push('')
    for (const [n, ids] of ambiguousNames) lines.push(`- ${n} → ${ids.join(', ')}`)
    lines.push('')
  }

  if (unmatchedNames.size) {
    lines.push(`## ❌ CSV 角色名在 production_orders 里找不到`)
    lines.push('')
    lines.push('请在 `docs/vfx-alias.md` 里填正式命名。留空 / 填 `废弃` 视作放弃匹配（脚本忽略）。')
    lines.push('')
    const sorted = [...unmatchedNames.entries()].sort((a, b) => b[1].length - a[1].length)
    lines.push(`| CSV 角色名 | 出现行数 |`)
    lines.push(`|---|---|`)
    for (const [n, lines_at] of sorted) lines.push(`| \`${n}\` | ${lines_at.length} |`)
    lines.push('')
  }

  if (noClassPrefabs.length) {
    lines.push(`## ❌ 无法分类的 prefab（命名不含 Attack/Skill 或 Act/Hit/Fly）`)
    lines.push('')
    lines.push(`| 角色 | prefab | 说明 | 原因 |`)
    lines.push(`|---|---|---|---|`)
    for (const it of noClassPrefabs) lines.push(`| ${it.csvName} | \`${it.prefab}\` | ${it.desc.slice(0, 40)} | ${it.reason} |`)
    lines.push('')
  }

  const reportPath = path.join(PROJECT_ROOT, 'docs/vfx-import-report.md')
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8')

  // 生成/更新 docs/vfx-conflict.md 骨架（保留人已填的决策，追加新增冲突）
  writeConflictSkeleton(conflictScenes, readDb)

  // 关闭 DB（readDb === db 在写模式下）
  readDb.close()

  console.log(`\n✅ 完成${dryRun ? '（dry-run，未写库）' : ''}`)
  console.log(`   有效记录: ${totalRecords}`)
  console.log(`   更新 order: ${updated}`)
  console.log(`   报告: ${reportPath}`)
}

function writeConflictSkeleton(conflictScenes, readDb) {
  const conflictPath = path.join(PROJECT_ROOT, 'docs/vfx-conflict.md')
  // 读现有决策（保留人已填的处置列）
  const existingDispositions = new Map()
  if (fs.existsSync(conflictPath)) {
    const text = fs.readFileSync(conflictPath, 'utf-8')
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.startsWith('|')) continue
      const cells = raw.split('|').slice(1, -1).map(c => c.trim())
      if (cells.length < 4) continue
      if (/^-+$/.test(cells[0].replace(/[`\s]/g, ''))) continue
      if (cells[0] === 'lumiId') continue
      const lid = Number(cells[0].replace(/^`|`$/g, '').trim())
      if (!Number.isFinite(lid)) continue
      const disposition = cells[3].trim()
      if (disposition) existingDispositions.set(lid, disposition)
    }
  }

  const out = []
  out.push('# vfx 冲突决策表')
  out.push('')
  out.push('同一 lumiId 被 CSV 里多个不同角色名命中的场景。可能是旧版/新版、皮肤变体、别称、错填等。')
  out.push('')
  out.push('**处置列填法**：')
  out.push('- 留空 / `all` —— 全部保留（默认）')
  out.push('- `keep=名A,名B` —— 只保留这些 CSV 名对应的行')
  out.push('- `drop=名A,名B` —— 排除这些 CSV 名对应的行')
  out.push('')
  out.push('冲突详情（每个 CSV 名下面挂哪些 prefab）见 `docs/vfx-import-report.md`。')
  out.push('')
  out.push('| lumiId | orders.name | 冲突的 CSV 名 | 处置 |')
  out.push('|---|---|---|---|')

  const sorted = [...conflictScenes].sort((a, b) => a.lumiId - b.lumiId)
  for (const s of sorted) {
    const r = readDb.prepare('SELECT name, model FROM production_orders WHERE lumiId = ?').get(s.lumiId)
    const csvList = s.csvNames.map(c => `\`${c.name}\``).join(' · ')
    const disp = existingDispositions.get(s.lumiId) || ''
    out.push(`| ${s.lumiId} | \`${r?.name || '?'}\` | ${csvList} | ${disp} |`)
  }
  fs.writeFileSync(conflictPath, out.join('\n') + '\n', 'utf-8')
  console.log(`   冲突决策骨架: ${conflictPath} (${sorted.length} 条)`)
}

main()
