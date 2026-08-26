// TAPD 全量同步脚本
// 用法: node scripts/tapd-full-sync.mjs
//
// 逻辑：
//   1. 拉所有 iterations 到 tapd_iterations 表
//   2. 遍历本地 production_orders 里带 tapdStoryId 的每一只噜咪
//   3. 拉总单 → 拿 children_id
//   4. 拉子单详情 → 按子单名后缀映射到 stageType
//   5. 子单 iteration_id → 关联的周版本 startdate/enddate = plannedStart/End
//   6. 子单 status → 映射到本地 status
//   7. 子单变更历史 → 数出 iterationCount
//   8. upsert 到 production_stages
//
// 限流：TAPD API 每秒不超过 5 req，脚本每次调用等 250ms

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(PROJECT_ROOT, 'api/data/lumiwiki.db')
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'tapd-config.json'), 'utf-8')).tapd

const require = createRequire(path.join(PROJECT_ROOT, 'api/package.json'))
const Database = require('better-sqlite3')

const { baseUrl, accessToken, workspaceId } = CONFIG

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const onlyLumiIdIdx = args.indexOf('--lumi')
const onlyLumiId = onlyLumiIdIdx !== -1 ? Number(args[onlyLumiIdIdx + 1]) : null
const skipIterationsSync = args.includes('--skip-iterations')

// 子单后缀 → stageType 映射（跟 TAPD 里的子单命名约定对齐）
// 允许模糊匹配：只要含关键词就映射
const STAGE_SUFFIX_MAP = [
  { pattern: /策划设计|战设/, stageType: 'combat' },
  { pattern: /原画/, stageType: 'concept' },
  { pattern: /模型/, stageType: 'model' },
  { pattern: /动作|绑定/, stageType: 'anim' },   // 动作 + 绑定合并
  { pattern: /特效/, stageType: 'vfx' },
  { pattern: /立绘|GUI|音效/, stageType: 'gui' }, // 立绘 + 音效合并到 gui
  { pattern: /配置/, stageType: 'config' },
]

// TAPD status → 本地 status
const STATUS_MAP = {
  'planning': 'todo',
  'developing': 'in-progress',
  'status_10': 'in-progress',
  'status_8': 'in-progress',
  'status_14': 'pending-review',
  'status_3': 'pending-review',
  'status_15': 'pending-review',
  'status_5': 'pending-review',
  'status_19': 'done',
  'status_6': 'done',
  'status_11': 'done',
  'status_12': 'done',
  'status_9': 'done',
  'rejected': 'rejected',
  'status_21': 'rejected',
}
function mapStatus(tapdStatus) {
  return STATUS_MAP[tapdStatus] || 'todo'
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function tapd(endpoint) {
  await sleep(220)  // 简单限流
  const url = `${baseUrl}${endpoint}`
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`TAPD ${endpoint}: HTTP ${resp.status} · ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

function unwrap(dataItem, key) {
  // TAPD 返回是 {Story: {...}} / {Iteration: {...}} 这样的双层，兼容单层
  if (dataItem && typeof dataItem === 'object') {
    return dataItem[key] || dataItem
  }
  return dataItem
}

function parseChildrenIds(childrenRaw) {
  if (!childrenRaw) return []
  return String(childrenRaw).split('|').map(s => s.trim()).filter(Boolean)
}

// 拉所有 iterations，写入本地
async function syncIterations(db) {
  console.log('\n📅 同步 iterations...')
  let page = 1
  const pageSize = 200
  let total = 0
  const upsert = db.prepare(`
    INSERT INTO tapd_iterations(id, name, startdate, enddate, milestone, status, syncedAt)
    VALUES (@id, @name, @startdate, @enddate, @milestone, @status, @syncedAt)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, startdate=excluded.startdate, enddate=excluded.enddate,
      milestone=excluded.milestone, status=excluded.status, syncedAt=excluded.syncedAt
  `)
  while (true) {
    const r = await tapd(`/iterations?workspace_id=${workspaceId}&limit=${pageSize}&page=${page}`)
    const items = r.data || []
    if (!items.length) break
    for (const item of items) {
      const it = unwrap(item, 'Iteration')
      const milestone = (it.name.match(/【(M\d+)】/) || [])[1] || null
      upsert.run({
        id: String(it.id),
        name: it.name,
        startdate: it.startdate || null,
        enddate: it.enddate || null,
        milestone,
        status: it.status || null,
        syncedAt: new Date().toISOString(),
      })
      total++
    }
    console.log(`  page ${page}: ${items.length} 条（累计 ${total}）`)
    if (items.length < pageSize) break
    page++
  }
  console.log(`  ✓ iterations 同步完成，共 ${total} 条`)
  return total
}

async function fetchStory(storyId) {
  const r = await tapd(`/stories?workspace_id=${workspaceId}&id=${storyId}`)
  const items = r.data || []
  if (!items.length) return null
  return unwrap(items[0], 'Story')
}

async function fetchStoriesByIds(ids) {
  if (!ids.length) return []
  // TAPD 支持逗号分隔多 id 批量拉，一次最多 30 个
  const chunks = []
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))
  const out = []
  for (const chunk of chunks) {
    const r = await tapd(`/stories?workspace_id=${workspaceId}&id=${chunk.join(',')}&limit=30`)
    for (const item of r.data || []) out.push(unwrap(item, 'Story'))
  }
  return out
}

// 反查：拉所有 parent_id 指向本单的子单
// 用途：兜底 story.children_id 字段可能缺项（TAPD 有单向坏链现象，
// 子单的 parent_id 指对了，但父单的 children_id 没列出该子单，导致同步漏 stage）
async function fetchChildrenByParentId(parentId) {
  const out = []
  let page = 1
  const pageSize = 50
  while (true) {
    const r = await tapd(`/stories?workspace_id=${workspaceId}&parent_id=${parentId}&limit=${pageSize}&page=${page}`)
    const items = r.data || []
    for (const item of items) out.push(unwrap(item, 'Story'))
    if (items.length < pageSize) break
    page++
  }
  return out
}

// 数子单的"状态变更次数"作为 iterationCount
// iterationCount = 0 表示直通没返工；每次 status 从 pending-review/done → 回退到 in-progress/todo 视为一次返工
async function countIterations(storyId) {
  try {
    const r = await tapd(`/story_changes?workspace_id=${workspaceId}&story_id=${storyId}&limit=200`)
    let iter = 0
    for (const c of r.data || []) {
      const ch = unwrap(c, 'StoryChange') || c
      const fields = String(ch.change_fields || '')
      // 只有 status 变更并且是"倒退"才算返工，简化：直接数 status 字段变更次数除以 2（大约进→回=2 次变更算 1 次迭代）
      if (fields.includes('status')) iter++
    }
    // 简化算法：status 变更次数 / 2 - 1（去掉 todo→developing→done 这条主链）
    return Math.max(0, Math.floor((iter - 2) / 2))
  } catch (e) {
    return 0
  }
}

async function syncOneLumi(db, order, stmts) {
  const lumiId = order.lumiId
  const tapdStoryId = order.tapdStoryId
  if (!tapdStoryId) return { skip: 'no tapd id' }

  const story = await fetchStory(tapdStoryId)
  if (!story) return { skip: 'story not found' }

  // 双源拉子单：
  //   1. parent_id 反查（主源，最可靠 —— TAPD 里 children 都有 parent_id 反向指针）
  //   2. story.children_id 字段（兜底，有单向坏链风险，见 fetchChildrenByParentId 注释）
  let reverseChildren = []
  try {
    reverseChildren = await fetchChildrenByParentId(tapdStoryId)
  } catch (e) {
    console.log(`  ⚠ parent_id 反查失败（${String(e.message).slice(0, 80)}），fallback children_id`)
  }
  const reverseIds = new Set(reverseChildren.map(s => String(s.id)))

  const forwardIds = parseChildrenIds(story.children_id)
  const missingForwardIds = forwardIds.filter(id => !reverseIds.has(id))
  const missingChildren = missingForwardIds.length ? await fetchStoriesByIds(missingForwardIds) : []

  // 记录不一致情况（帮 PM 感知 TAPD 数据质量问题）
  const reverseOnlyCount = reverseChildren.filter(s => !forwardIds.includes(String(s.id))).length
  if (reverseOnlyCount) {
    console.log(`  ⚠ [${lumiId}] children_id 缺 ${reverseOnlyCount} 条子单（父单单向坏链），已通过 parent_id 反查补齐`)
  }

  const children = [...reverseChildren, ...missingChildren]
  if (!children.length) return { skip: 'no children' }

  const now = new Date().toISOString()
  let stagesUpdated = 0
  const usedStages = new Set()

  for (const child of children) {
    if (!child?.name) continue
    // 排除文案类子单：TAPD 里策划环节可能拆成"文案包装/文案配置/表现设计/表现配置"，
    // 我们只跟"表现"这条线（对应本地 combat/config），"文案"直接忽略
    if (/文案/.test(child.name)) continue
    // 匹配 stageType
    let matched = null
    for (const m of STAGE_SUFFIX_MAP) {
      if (m.pattern.test(child.name)) { matched = m.stageType; break }
    }
    if (!matched) continue
    if (usedStages.has(matched)) continue  // 同一 stageType 只处理一次（如果有多个子单命中）
    usedStages.add(matched)

    // 通过 iteration_id 拿周版本时间
    let plannedStart = null, plannedEnd = null
    if (child.iteration_id && child.iteration_id !== '0') {
      const it = db.prepare('SELECT startdate, enddate FROM tapd_iterations WHERE id = ?').get(String(child.iteration_id))
      if (it) { plannedStart = it.startdate; plannedEnd = it.enddate }
    }

    const status = mapStatus(child.status)
    const iterationCount = await countIterations(child.id)

    stmts.upsertStage.run({
      lumiId,
      stageType: matched,
      assignee: child.owner ? String(child.owner).split(';')[0] : null,
      status,
      plannedStart,
      plannedEnd,
      actualStart: null,
      actualEnd: status === 'done' ? child.completed || null : null,
      iterationCount,
      tapdSubStoryId: String(child.id),
      tapdIterationId: child.iteration_id ? String(child.iteration_id) : null,
      tapdRawStatus: child.status || null,
      tapdSyncedAt: now,
      deliverables: null,
      updatedAt: now,
      updatedBy: 'tapd-sync',
    })
    stagesUpdated++
  }
  return { stagesUpdated, childrenCount: children.length }
}

async function main() {
  console.log(`\n===== TAPD 全量同步 =====`)
  console.log(`baseUrl: ${baseUrl}`)
  console.log(`workspaceId: ${workspaceId}`)
  console.log(`dryRun: ${dryRun}`)
  console.log(`onlyLumiId: ${onlyLumiId || '(全量)'}`)

  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Step 1: iterations
  if (!skipIterationsSync) {
    await syncIterations(db)
  } else {
    console.log('\n📅 跳过 iterations 同步（--skip-iterations）')
  }

  // Step 2: 遍历本地噜咪
  const orders = onlyLumiId
    ? db.prepare('SELECT * FROM production_orders WHERE lumiId = ? AND tapdStoryId IS NOT NULL').all(onlyLumiId)
    : db.prepare('SELECT * FROM production_orders WHERE tapdStoryId IS NOT NULL').all()

  console.log(`\n📦 待同步 ${orders.length} 只噜咪`)

  const stmts = {
    upsertStage: db.prepare(`
      INSERT INTO production_stages(
        lumiId, stageType, assignee, status, plannedStart, plannedEnd, actualStart, actualEnd,
        iterationCount, tapdSubStoryId, tapdIterationId, tapdRawStatus, tapdSyncedAt, deliverables,
        updatedAt, updatedBy
      ) VALUES (
        @lumiId, @stageType, @assignee, @status, @plannedStart, @plannedEnd, @actualStart, @actualEnd,
        @iterationCount, @tapdSubStoryId, @tapdIterationId, @tapdRawStatus, @tapdSyncedAt, @deliverables,
        @updatedAt, @updatedBy
      )
      ON CONFLICT(lumiId, stageType) DO UPDATE SET
        assignee=excluded.assignee,
        status=excluded.status,
        plannedStart=excluded.plannedStart,
        plannedEnd=excluded.plannedEnd,
        actualEnd=COALESCE(excluded.actualEnd, actualEnd),
        iterationCount=excluded.iterationCount,
        tapdSubStoryId=excluded.tapdSubStoryId,
        tapdIterationId=excluded.tapdIterationId,
        tapdRawStatus=excluded.tapdRawStatus,
        tapdSyncedAt=excluded.tapdSyncedAt,
        updatedAt=excluded.updatedAt,
        updatedBy=excluded.updatedBy
    `),
  }

  const summary = { total: orders.length, synced: 0, skipped: 0, stagesUpdated: 0, errors: [] }

  for (let i = 0; i < orders.length; i++) {
    const o = orders[i]
    try {
      const r = await syncOneLumi(db, o, stmts)
      if (r.skip) {
        summary.skipped++
        if (onlyLumiId) console.log(`  跳过 ${o.lumiId} (${o.name}): ${r.skip}`)
      } else {
        summary.synced++
        summary.stagesUpdated += r.stagesUpdated
        if (i % 20 === 0 || onlyLumiId) console.log(`  [${i + 1}/${orders.length}] ${o.name}: ${r.stagesUpdated} 环节`)
      }
    } catch (e) {
      summary.errors.push({ lumiId: o.lumiId, name: o.name, error: e.message })
      console.error(`  [${i + 1}/${orders.length}] ❌ ${o.name}: ${e.message}`)
    }
  }

  db.close()

  console.log(`\n✅ 完成`)
  console.log(`   总数：${summary.total}`)
  console.log(`   已同步：${summary.synced}`)
  console.log(`   跳过（无 TAPD ID 或无子单）：${summary.skipped}`)
  console.log(`   环节更新：${summary.stagesUpdated}`)
  console.log(`   错误：${summary.errors.length}`)
  if (summary.errors.length) {
    console.log(`\n   前 5 个错误：`)
    for (const e of summary.errors.slice(0, 5)) console.log(`     ${e.lumiId} ${e.name}: ${e.error}`)
  }
}

main().catch(e => {
  console.error('\n❌', e.message, e.stack)
  process.exit(1)
})
