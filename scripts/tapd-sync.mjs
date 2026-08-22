// TAPD 定时增量同步（每 30 分钟跑一次）
// 用法: node scripts/tapd-sync.mjs
//
// 跟 tapd-full-sync 的区别：
//   - 全量同步：遍历本地所有 order.tapdStoryId，每个都查 story + children
//   - 增量同步：只拉最近 X 小时内 modified 的 story（用 TAPD /stories?modified >= ...），
//     然后按 ancestor_id 定位所属噜咪总单，同步那只噜咪的 stages
//
// 默认拉最近 2 小时的变更（比 30 分钟粒度大一倍防漏），可以 --since=<ISO> 覆盖

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(PROJECT_ROOT, 'api/data/lumiwiki.db')
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'tapd-config.json'), 'utf-8')).tapd
const { baseUrl, accessToken, workspaceId } = CONFIG

const require = createRequire(path.join(PROJECT_ROOT, 'api/package.json'))
const Database = require('better-sqlite3')

const args = process.argv.slice(2)
const sinceArgIdx = args.indexOf('--since')
const since = sinceArgIdx !== -1
  ? args[sinceArgIdx + 1]
  : new Date(Date.now() - 2 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19)

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function tapd(endpoint) {
  await sleep(220)
  const url = `${baseUrl}${endpoint}`
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`TAPD ${endpoint}: HTTP ${resp.status} · ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

function unwrap(item, key) {
  if (item && typeof item === 'object') return item[key] || item
  return item
}

async function main() {
  console.log(`\n===== TAPD 增量同步 =====`)
  console.log(`baseUrl: ${baseUrl} · workspace: ${workspaceId}`)
  console.log(`since: ${since}`)

  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')

  // 拉最近 modified 的所有 story
  let page = 1
  const pageSize = 200
  const changedStoryIds = new Set()
  const rootMap = new Map()  // story.id → ancestor_id
  while (true) {
    const r = await tapd(`/stories?workspace_id=${workspaceId}&modified=>${encodeURIComponent(since)}&limit=${pageSize}&page=${page}&fields=id,ancestor_id`)
    const items = r.data || []
    for (const item of items) {
      const s = unwrap(item, 'Story')
      changedStoryIds.add(String(s.id))
      if (s.ancestor_id) rootMap.set(String(s.id), String(s.ancestor_id))
    }
    console.log(`  拉 story page ${page}: ${items.length} 条`)
    if (items.length < pageSize) break
    page++
    if (page > 30) { console.log('  ⚠️  达到 30 页上限，提前结束'); break }
  }
  console.log(`  ✓ 共 ${changedStoryIds.size} 条 story 变更`)

  if (!changedStoryIds.size) {
    console.log('\n✅ 无变更，退出')
    db.close()
    return
  }

  // 用 ancestor_id 定位到本地哪些 order（本地 order.tapdStoryId = ancestor_id 或 story.id 本身）
  const affectedLumis = new Set()
  const localOrderIds = new Set(
    db.prepare('SELECT tapdStoryId FROM production_orders WHERE tapdStoryId IS NOT NULL').all().map(r => r.tapdStoryId)
  )
  for (const [changedId, ancestorId] of rootMap) {
    if (localOrderIds.has(changedId)) affectedLumis.add(changedId)
    if (localOrderIds.has(ancestorId)) affectedLumis.add(ancestorId)
  }
  console.log(`  ✓ 涉及 ${affectedLumis.size} 只本地噜咪总单`)

  if (!affectedLumis.size) {
    console.log('\n✅ 变更均在本地未跟踪的单里，退出')
    db.close()
    return
  }

  // 拉本地这些噜咪的 lumiId 列表
  const placeholders = [...affectedLumis].map(() => '?').join(',')
  const lumiIds = db.prepare(`SELECT lumiId FROM production_orders WHERE tapdStoryId IN (${placeholders})`).all([...affectedLumis]).map(r => r.lumiId)

  db.close()

  // 直接调 full-sync 单个模式
  const { spawnSync } = await import('node:child_process')
  console.log(`\n📦 触发同步 ${lumiIds.length} 只噜咪:`)
  for (const lid of lumiIds) {
    console.log(`  → ${lid}`)
    const r = spawnSync(process.execPath, [
      path.join(__dirname, 'tapd-full-sync.mjs'),
      '--lumi', String(lid),
      '--skip-iterations',
    ], { stdio: 'inherit' })
    if (r.status !== 0) console.log(`  ⚠️  ${lid} 同步失败`)
  }

  console.log('\n✅ 增量同步完成')
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
