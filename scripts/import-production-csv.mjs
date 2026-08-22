// 从腾讯文档导出的 CSV 导入生产管线数据
// 用法: node scripts/import-production-csv.mjs [--csv <path>] [--dry-run]
//
// 默认 CSV 路径: D:\G36-Lumi资产进展表-Lumi甘特.csv
//
// 处理逻辑：
//   1. 读 CSV，跳表头（row 0）
//   2. 每一行 = 一只噜咪
//   3. 左侧 18 列 → productionOrder（TAPD/编号/名/属性/普攻/模型/擅长/战斗强度/打工/建筑/策划/里程碑）
//   4. 右侧 63 列（周甘特，列名 "0306" / "0129-" 等）解析成 9 个 stage 的 planned 日期区间
//      - 列名格式: MMDD / MMDD-（后缀 - 代表次年）
//      - 单元格值: 逗号分隔的环节名（"绑定,动作"）
//      - 中文环节名 → stageType：
//          战设 combat · 原画 concept · 模型 model · 绑定 rigging · 动作 anim
//          特效 vfx · 立绘 gui · 音效 audio · 配置 config
//          "原画迭代" / "特效迭代" → 累加 iterationCount，不新建 stage
//   5. 每个 stage 的 planned 范围 = 该环节最早出现周的周一 ~ 最晚出现周的周日
//   6. 状态推断：
//      - 全部结束 → done（如 order.进度 = 完全体 或 最晚周 < 今天 -1 周）
//      - 尚未开始 → todo
//      - 正在进行 → in-progress
//   7. ganttRaw 原样存 JSON（列名 → 值 map），便于日后回溯

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(PROJECT_ROOT, 'api/data/lumiwiki.db')
const LUMI_JSON = path.join(PROJECT_ROOT, 'public/data/Lumi.json')
const LOC_JSON = path.join(PROJECT_ROOT, 'public/data/zh-CN.json')

// 复用 api/node_modules 里的 better-sqlite3，避免根目录加依赖
const require = createRequire(path.join(PROJECT_ROOT, 'api/package.json'))
const Database = require('better-sqlite3')

// 简单 CSV 解析器（我们只需处理带引号 + 换行 + 逗号，不需要复杂 escape 规则）
// row 里如果单元格含 \n（腾讯文档导出常见于带链接的 tapd 列）会用 "..." 包住
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuote = false
      } else {
        field += c
      }
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

const args = process.argv.slice(2)
const csvArgIdx = args.indexOf('--csv')
const csvPath = csvArgIdx !== -1 ? args[csvArgIdx + 1] : 'D:/G36-Lumi资产进展表-Lumi甘特.csv'
const dryRun = args.includes('--dry-run')

// 表头列 → 索引（保持跟腾讯文档一致）
const META_COLS = {
  tapd: 0, progressStage: 1, releaseStatus: 2,
  lumiId: 3, name: 4, maxScore: 5, level: 6, type: 7, attackInterval: 8, model: 9,
  workOrCombat: 10, combatStrength: 11, workType: 12, workBuilding: 13, workConfigured: 14,
  designer: 15, image: 16, milestone: 17,
}
const GANTT_COL_START = 19  // 0 空 -> 19 起为第一个周列

// 中文环节名 → stageType
const STAGE_MAP = {
  '战设': 'combat',
  '原画': 'concept',
  '模型': 'model',
  '绑定': 'rigging',
  '动作': 'anim',
  '特效': 'vfx',
  '立绘': 'gui',
  '音效': 'audio',
  '配置': 'config',
}
const ITERATION_TOKENS = {
  '原画迭代': 'concept',
  '特效迭代': 'vfx',
  '模型迭代': 'model',
  '动作迭代': 'anim',
  '配置迭代': 'config',
}

const TYPE_ID_BY_NAME = {
  '无': 1, '水': 2, '火': 3, '草': 4, '电': 5, '土': 6, '飞': 7, '冰': 8,
  '龙': 9, '光': 10, '暗': 11, '格斗': 12, '超能': 13, '精灵': 14, '钢': 15,
  '王': 16, '神': 17,
}

// -------- 时间处理：把 "0306" / "0129-" 转成 YYYY-MM-DD --------
// baseYear: CSV 里日期跨年（0306..1225 属 2026，0108..0625- 属 2027）
// 我们用简单规则：列出现顺序即时间顺序，遇到 09/10/11/12 月的月份且后续变成 01/02/... 就跨年
function parseGanttDate(colName, yearHintPrev, yearBaseFirst) {
  // "0306" → 03-06 · "0122-" → 01-22（次年）
  const hasSuffix = colName.endsWith('-')
  const clean = hasSuffix ? colName.slice(0, -1) : colName
  if (!/^\d{4}$/.test(clean)) return null
  const mm = clean.slice(0, 2)
  const dd = clean.slice(2, 4)
  const year = hasSuffix ? yearBaseFirst + 1 : (yearHintPrev || yearBaseFirst)
  return { year, mm, dd, iso: `${year}-${mm}-${dd}` }
}

function buildGanttDateMap(headers, yearBase = 2026) {
  // 返回 { colName: iso日期 }（用 CSV 表头 0306 → 2026-03-06 这样映射）
  // 跨年规则：
  //   1) 列名带 "-" 后缀 → 强制视为次年（yearBase + 1），且此后所有列都在次年
  //   2) 前一列 MM >= 11 且本列 MM <= 3 → 说明 1225 → 0108 那种自然跨年，+1 年
  // 只跨一次年（腾讯文档不会跨两年）
  const map = {}
  let curYear = yearBase
  let prevMM = null
  for (let i = GANTT_COL_START; i < headers.length; i++) {
    const raw = headers[i]
    if (!raw) continue
    const trimmed = raw.trim()
    const hasSuffix = trimmed.endsWith('-')
    const clean = hasSuffix ? trimmed.slice(0, -1) : trimmed
    if (!/^\d{4}$/.test(clean)) continue
    const mm = Number(clean.slice(0, 2))
    const dd = clean.slice(2, 4)
    if (hasSuffix) curYear = Math.max(curYear, yearBase + 1)
    else if (prevMM !== null && prevMM >= 11 && mm <= 3) curYear = yearBase + 1
    map[raw] = `${curYear}-${clean.slice(0, 2)}-${dd}`
    prevMM = mm
  }
  return map
}

// -------- 主流程 --------

function main() {
  console.log(`\n📖 读 CSV: ${csvPath}`)
  if (!fs.existsSync(csvPath)) throw new Error(`CSV 不存在: ${csvPath}`)
  const raw = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '')
  const rows = parseCsv(raw)
  const headers = rows[0]
  console.log(`   共 ${rows.length - 1} 行数据，${headers.length} 列`)

  const ganttDates = buildGanttDateMap(headers)

  const lumis = JSON.parse(fs.readFileSync(LUMI_JSON, 'utf-8'))
  const loc = JSON.parse(fs.readFileSync(LOC_JSON, 'utf-8'))
  const lumiById = new Map(lumis.map(l => [String(l.Id), l]))

  // 打开 DB
  let db = null
  if (!dryRun) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  }

  const stats = { orders: 0, stages: 0, iterations: 0, unmatched: 0 }

  const insertOrder = db ? db.prepare(`
    INSERT INTO production_orders(
      lumiId, pokedexId, name, type1, type2, maxScore, workType, combatStrength, workBuilding,
      tapdStoryId, tapdStoryUrl, milestone, releaseStatus, progressStage, designer, status,
      createdAt, updatedAt, ganttRaw
    ) VALUES (
      @lumiId, @pokedexId, @name, @type1, @type2, @maxScore, @workType, @combatStrength, @workBuilding,
      @tapdStoryId, @tapdStoryUrl, @milestone, @releaseStatus, @progressStage, @designer, @status,
      @createdAt, @updatedAt, @ganttRaw
    )
    ON CONFLICT(lumiId) DO UPDATE SET
      pokedexId=excluded.pokedexId, name=excluded.name, type1=excluded.type1, type2=excluded.type2,
      maxScore=excluded.maxScore, workType=excluded.workType, combatStrength=excluded.combatStrength,
      workBuilding=excluded.workBuilding, tapdStoryId=excluded.tapdStoryId, tapdStoryUrl=excluded.tapdStoryUrl,
      milestone=excluded.milestone, releaseStatus=excluded.releaseStatus, progressStage=excluded.progressStage,
      designer=excluded.designer, status=excluded.status, updatedAt=excluded.updatedAt, ganttRaw=excluded.ganttRaw
  `) : null

  const insertStage = db ? db.prepare(`
    INSERT INTO production_stages(
      lumiId, stageType, assignee, status, plannedStart, plannedEnd, actualStart, actualEnd,
      iterationCount, tapdSubStoryId, deliverables, updatedAt, updatedBy
    ) VALUES (
      @lumiId, @stageType, @assignee, @status, @plannedStart, @plannedEnd, @actualStart, @actualEnd,
      @iterationCount, @tapdSubStoryId, @deliverables, @updatedAt, @updatedBy
    )
    ON CONFLICT(lumiId, stageType) DO UPDATE SET
      status=excluded.status, plannedStart=excluded.plannedStart, plannedEnd=excluded.plannedEnd,
      iterationCount=excluded.iterationCount, updatedAt=excluded.updatedAt, updatedBy=excluded.updatedBy
  `) : null

  const tx = db ? db.transaction(() => processAll()) : processAll

  function processAll() {
    const today = new Date().toISOString().slice(0, 10)
    const yearAgo = new Date(); yearAgo.setDate(yearAgo.getDate() - 365); const yearAgoIso = yearAgo.toISOString().slice(0, 10)

    for (let ri = 1; ri < rows.length; ri++) {
      const r = rows[ri]
      const lumiIdRaw = (r[META_COLS.lumiId] || '').trim()
      if (!lumiIdRaw || !/^\d+$/.test(lumiIdRaw)) continue

      const lumiId = Number(lumiIdRaw)
      const lumiInWiki = lumiById.get(lumiIdRaw)
      if (!lumiInWiki) stats.unmatched++

      // 提取 TAPD 链接
      const tapdCell = (r[META_COLS.tapd] || '').trim()
      let tapdStoryId = null, tapdStoryUrl = null
      const m = tapdCell.match(/tapd\.cn\/[^\s]*\/stories\/view\/(\d+)/)
      if (m) { tapdStoryId = m[1]; tapdStoryUrl = m[0].startsWith('http') ? m[0] : 'https://www.' + m[0] }
      const urlM = tapdCell.match(/https?:\/\/[^\s]+/)
      if (urlM) tapdStoryUrl = urlM[0]

      const attrName = (r[META_COLS.type] || '').trim()
      const type1 = TYPE_ID_BY_NAME[attrName] || (lumiInWiki?.Type1 ?? null)
      const type2 = lumiInWiki?.Type2 ?? null
      const nameCsv = (r[META_COLS.name] || '').trim()
      const displayName = nameCsv || (lumiInWiki ? loc[lumiInWiki.Name] : null)
      const maxScore = Number(r[META_COLS.maxScore]) || (lumiInWiki?.MaxScore ?? null)

      // 收集本行甘特里出现过的每个 stage 的 [minDate, maxDate]
      const stageRanges = new Map()  // stageType → { minDate, maxDate }
      const iterationsCount = new Map()  // stageType → count
      const ganttRaw = {}

      for (let ci = GANTT_COL_START; ci < r.length; ci++) {
        const colName = headers[ci]
        const cell = (r[ci] || '').trim()
        if (!colName || !cell) continue
        const iso = ganttDates[colName]
        if (!iso) continue
        ganttRaw[colName] = cell
        for (const token of cell.split(/[,\uFF0C]/).map(t => t.trim()).filter(Boolean)) {
          if (STAGE_MAP[token]) {
            const st = STAGE_MAP[token]
            const cur = stageRanges.get(st) || { minDate: iso, maxDate: iso }
            if (iso < cur.minDate) cur.minDate = iso
            if (iso > cur.maxDate) cur.maxDate = iso
            stageRanges.set(st, cur)
          } else if (ITERATION_TOKENS[token]) {
            const st = ITERATION_TOKENS[token]
            iterationsCount.set(st, (iterationsCount.get(st) || 0) + 1)
            // 迭代也算 stage 存在过
            const cur = stageRanges.get(st) || { minDate: iso, maxDate: iso }
            if (iso < cur.minDate) cur.minDate = iso
            if (iso > cur.maxDate) cur.maxDate = iso
            stageRanges.set(st, cur)
            stats.iterations++
          }
        }
      }

      // upsert order
      const now = new Date().toISOString()
      const progressStage = (r[META_COLS.progressStage] || '').trim() || null
      const isFullyDone = progressStage === '完全体'
      const orderRow = {
        lumiId,
        pokedexId: lumiInWiki?.PokedexId ?? null,
        name: displayName,
        type1, type2, maxScore,
        workType: (r[META_COLS.workType] || '').trim() || null,
        combatStrength: (r[META_COLS.combatStrength] || '').trim() || null,
        workBuilding: (r[META_COLS.workBuilding] || '').trim() || null,
        tapdStoryId, tapdStoryUrl,
        milestone: (r[META_COLS.milestone] || '').trim() || null,
        releaseStatus: (r[META_COLS.releaseStatus] || '').trim() || null,
        progressStage,
        designer: (r[META_COLS.designer] || '').trim() || null,
        status: isFullyDone ? 'done' : (stageRanges.size ? 'in-progress' : 'planning'),
        createdAt: now,
        updatedAt: now,
        ganttRaw: JSON.stringify(ganttRaw),
      }
      if (insertOrder) insertOrder.run(orderRow)
      stats.orders++

      // upsert stages
      for (const [stageType, range] of stageRanges) {
        let status = 'todo'
        if (isFullyDone || range.maxDate < today) status = 'done'
        else if (range.minDate <= today && today <= range.maxDate) status = 'in-progress'
        else if (range.minDate > today) status = 'todo'  // 未来的计划
        const stageRow = {
          lumiId,
          stageType,
          assignee: null,
          status,
          plannedStart: range.minDate,
          plannedEnd: range.maxDate,
          actualStart: null,
          actualEnd: status === 'done' ? range.maxDate : null,
          iterationCount: iterationsCount.get(stageType) || 0,
          tapdSubStoryId: null,
          deliverables: null,
          updatedAt: now,
          updatedBy: 'import-script',
        }
        if (insertStage) insertStage.run(stageRow)
        stats.stages++
      }
    }
  }

  tx()

  if (db) db.close()

  console.log(`\n✅ 导入完成${dryRun ? '（dry-run，未写库）' : ''}`)
  console.log(`   orders  = ${stats.orders}`)
  console.log(`   stages  = ${stats.stages}`)
  console.log(`   iterations 检测到 = ${stats.iterations}`)
  console.log(`   wiki 里找不到的 lumi = ${stats.unmatched}（元数据仍已导入）`)
}

main()
