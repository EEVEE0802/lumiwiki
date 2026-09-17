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
  const rows = db.prepare(`SELECT lumiId, name FROM production_orders WHERE name IS NOT NULL AND name != ''`).all()
  const nameToId = new Map()
  for (const r of rows) {
    const n = (r.name || '').trim()
    if (!n) continue
    if (!nameToId.has(n)) nameToId.set(n, [])
    nameToId.get(n).push(r.lumiId)
  }
  return { nameToId, totalOrders: rows.length }
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
  const { nameToId, totalOrders } = loadNameToLumiIdMap(readDb)
  console.log(`\n🗂️ production_orders 里有 ${totalOrders} 条 order，${nameToId.size} 个唯一 name 可用于匹配`)

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
  const ambiguousNames = new Map()  // csvName -> [lumiId...]
  const noClassPrefabs = []          // {name, prefab, note}
  let totalRecords = 0
  // 名字匹配不上现在等同于 orders 表里没这只噜咪，因此不再需要 noOrderInDb 单独统计

  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri]
    if (!r || r.length < 7) continue
    const csvName = (r[0] || '').trim()
    const prefab = (r[4] || '').trim()
    const desc = (r[5] || '').trim()
    const hook = normalizeHook(r[6])
    if (!csvName || !prefab) continue

    const ids = nameToId.get(csvName)
    if (!ids || !ids.length) {
      if (!unmatchedNames.has(csvName)) unmatchedNames.set(csvName, [])
      unmatchedNames.get(csvName).push(ri + 1)
      continue
    }
    if (ids.length > 1) {
      ambiguousNames.set(csvName, ids)
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
    bucket[group].push({ name: prefab, type, hook })
    totalRecords++
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
    db.close()
  } else {
    for (const lumiId of byLumi.keys()) updated++
    readDb.close()
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
  lines.push(`| ❌ CSV 名字未匹配（orders 里没有这只噜咪） | ${unmatchedNames.size} |`)
  lines.push(`| ⚠️ 名字歧义（同名多 lumiId） | ${ambiguousNames.size} |`)
  lines.push(`| ❌ prefab 无法分类 | ${noClassPrefabs.length} |`)
  lines.push('')

  if (ambiguousNames.size) {
    lines.push(`## ⚠️ 同一角色名对应多个 lumiId（需人工判定）`)
    lines.push('')
    for (const [n, ids] of ambiguousNames) lines.push(`- ${n} → ${ids.join(', ')}`)
    lines.push('')
  }

  if (unmatchedNames.size) {
    lines.push(`## ❌ CSV 角色名在 production_orders 里找不到`)
    lines.push('')
    lines.push('说明这些 CSV 里的角色目前不在生产管线里。有可能是：CSV 用了别称 / 已废弃 / 或漏建单。')
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
  console.log(`\n✅ 完成${dryRun ? '（dry-run，未写库）' : ''}`)
  console.log(`   有效记录: ${totalRecords}`)
  console.log(`   更新 order: ${updated}`)
  console.log(`   报告: ${reportPath}`)
}

main()
