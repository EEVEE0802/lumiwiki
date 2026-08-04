import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'
import { fetchCsv } from './ta-fetch.mjs'
import { ensureValidToken } from './ta-auth.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.join(__dirname, '..')

// 解析 --week 参数
const args = process.argv.slice(2)
const weekIdx = args.indexOf('--week')
const week = weekIdx !== -1 ? parseInt(args[weekIdx + 1]) : null

if (isNaN(week) || week < 1) {
  console.error('用法: node fetch-participation-trend.mjs --week N')
  process.exit(1)
}

// 读取 baseFriday（从 ta-config.json）
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'ta-config.json'), 'utf-8'))
const baseFriday = new Date(config.baseFriday + 'T03:00:00+08:00')

// 计算周时间范围
const startTime = new Date(baseFriday)
startTime.setDate(startTime.getDate() + (week - 1) * 7)
const endTime = new Date(startTime)
endTime.setDate(endTime.getDate() + 7)

const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 03:00:00`
const startTimeStr = fmt(startTime)
const endTimeStr = fmt(endTime)

console.log(`\n===== 参与走势拉取 Week ${week} =====`)
console.log(`时间范围: ${startTimeStr} ~ ${endTimeStr}`)

// 拉 player_login CSV
// --skip-fetch 参数：跳过拉取（用于本地测试已有 CSV 时）
const skipFetch = args.includes('--skip-fetch')
const loginCsvPath = path.join(PROJECT_ROOT, `data/archive/week${week}/login_week${week}.csv`)
if (skipFetch && fs.existsSync(loginCsvPath)) {
  console.log(`✓ --skip-fetch 且 login CSV 已存在，跳过拉取`)
} else {
  console.log(`\n📤 拉取 player_login 数据...`)
  await ensureValidToken()
  await fetchCsv('login', startTimeStr, endTimeStr, loginCsvPath)
}

const ladderCsvPath = path.join(PROJECT_ROOT, `data/archive/week${week}/ladder_week${week}.csv`)
const tournamentCsvPath = path.join(PROJECT_ROOT, `data/archive/week${week}/tournament_week${week}.csv`)

// CSV 解析（处理引号 + 双引号转义）
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  let i = 0
  while (i < line.length) {
    const char = line[i]
    if (char === '"') {
      if (i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i += 2
      } else {
        inQuotes = !inQuotes
        i++
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
      i++
    } else {
      current += char
      i++
    }
  }
  result.push(current)
  return result
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

// 判定玩家在某天是否算"留存玩家"（创号满 7 天）
// date / createDay 均为 "YYYY-MM-DD"
function isRetention(date, createDay) {
  const diff = (new Date(date) - new Date(createDay.slice(0, 10))) / ONE_DAY_MS
  return diff >= 7
}

// 从 login CSV 建立 b_role_id -> 创号日期(YYYY-MM-DD) 的映射
// （login CSV 带 b_create_time_str 列；天梯/周赛 CSV 复用此映射判定留存）
async function buildCreateTimeMap(csvPath) {
  const map = new Map()
  if (!fs.existsSync(csvPath)) return map
  const fileStream = fs.createReadStream(csvPath)
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let headers = null
  let bRoleIdIdx = -1
  let createTimeIdx = -1
  for await (const line of rl) {
    if (!line.trim()) continue
    const values = parseCSVLine(line)
    if (!headers) {
      headers = values.map(h => h.replace(/^﻿/, '').trim())
      bRoleIdIdx = headers.indexOf('b_role_id')
      createTimeIdx = headers.indexOf('b_create_time_str')
      if (bRoleIdIdx === -1 || createTimeIdx === -1) {
        console.warn(`⚠️ login CSV 缺少 b_role_id / b_create_time_str 列，留存统计不可用`)
        return map
      }
      continue
    }
    const bRoleId = values[bRoleIdIdx]
    const createTimeStr = values[createTimeIdx]
    if (bRoleId && createTimeStr) {
      // b_create_time_str 形如 "2026-07-15 10:23:00"，取日期部分
      map.set(bRoleId, createTimeStr.slice(0, 10))
    }
  }
  console.log(`  创号时间映射: ${map.size} 个玩家`)
  return map
}

// 按日 distinct b_role_id 同时累加场次，可附带留存统计
// createTimeMap: b_role_id -> 创号日期（来自 login CSV，可选；无则不统计留存）
// 返回: { uv, retentionUv, battles, retentionBattles }（各为 date -> 数值）
async function dailyDistinct(csvPath, createTimeMap) {
  const empty = { uv: {}, retentionUv: {}, battles: {}, retentionBattles: {} }
  if (!fs.existsSync(csvPath)) return empty
  const fileStream = fs.createReadStream(csvPath)
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let headers = null
  let dateCols = []  // [{idx, date}]
  let bRoleIdIdx = -1
  const dailySets = {}          // date -> Set<b_role_id>（全量）
  const retentionSets = {}      // date -> Set<b_role_id>（留存）
  const dailyBattles = {}       // date -> 场次累加（全量）
  const retentionBattles = {}   // date -> 场次累加（留存）

  for await (const line of rl) {
    if (!line.trim()) continue
    const values = parseCSVLine(line)
    if (!headers) {
      headers = values.map(h => h.replace(/^﻿/, '').trim())
      dateCols = headers
        .map((h, i) => /^\d{4}-\d{2}-\d{2}$/.test(h) ? { idx: i, date: h } : null)
        .filter(Boolean)
      bRoleIdIdx = headers.indexOf('b_role_id')
      if (bRoleIdIdx === -1) {
        console.error(`❌ CSV 未找到 b_role_id 列: ${csvPath}`)
        return empty
      }
      dateCols.forEach(({ date }) => {
        dailySets[date] = new Set()
        retentionSets[date] = new Set()
        dailyBattles[date] = 0
        retentionBattles[date] = 0
      })
      continue
    }
    const bRoleId = values[bRoleIdIdx]
    if (!bRoleId) continue
    const createDay = createTimeMap ? createTimeMap.get(bRoleId) : null
    for (const { idx, date } of dateCols) {
      const count = parseInt(values[idx])
      if (count > 0) {
        dailySets[date].add(bRoleId)
        dailyBattles[date] += count
        if (createDay && isRetention(date, createDay)) {
          retentionSets[date].add(bRoleId)
          retentionBattles[date] += count
        }
      }
    }
  }

  const uv = {}
  const retentionUv = {}
  for (const [date, set] of Object.entries(dailySets)) {
    uv[date] = set.size
    retentionUv[date] = retentionSets[date].size
  }
  return { uv, retentionUv, battles: dailyBattles, retentionBattles }
}

console.log(`\n建立创号时间映射（login CSV）...`)
const createTimeMap = await buildCreateTimeMap(loginCsvPath)

console.log(`\n处理 ladder CSV...`)
const ladderResult = await dailyDistinct(ladderCsvPath, createTimeMap)
console.log(`  天梯每日 UV:`, ladderResult.uv)
console.log(`  天梯每日留存 UV:`, ladderResult.retentionUv)

console.log(`处理 tournament CSV...`)
const tournamentResult = await dailyDistinct(tournamentCsvPath, createTimeMap)
console.log(`  周赛每日 UV:`, tournamentResult.uv)
console.log(`  周赛每日留存 UV:`, tournamentResult.retentionUv)

console.log(`处理 login CSV...`)
const loginResult = await dailyDistinct(loginCsvPath, createTimeMap)
console.log(`  登录每日 UV:`, loginResult.uv)
console.log(`  登录每日留存 UV:`, loginResult.retentionUv)

// 合并所有日期，计算比例 + 场均（全量 + 留存）
const allDates = [...new Set([
  ...Object.keys(ladderResult.uv),
  ...Object.keys(tournamentResult.uv),
  ...Object.keys(loginResult.uv)
])].sort()

// 取某个 result 在某天的指标（全量 uv/battles + 留存 retUv/retBattles）
const dayMetrics = (res, date) => ({
  uv: res.uv[date] || 0,
  battles: res.battles[date] || 0,
  retUv: res.retentionUv[date] || 0,
  retBattles: res.retentionBattles[date] || 0,
})

const result = allDates.map(date => {
  const L = dayMetrics(ladderResult, date)
  const T = dayMetrics(tournamentResult, date)
  const G = dayMetrics(loginResult, date)
  return {
    date,
    ladder: L.uv,
    tournament: T.uv,
    login: G.uv,
    ladderRate: G.uv > 0 ? +(L.uv / G.uv * 100).toFixed(2) : 0,
    tournamentRate: G.uv > 0 ? +(T.uv / G.uv * 100).toFixed(2) : 0,
    // 平均每个参与玩家当天场次（UV=0 时为 0，避免除零）
    ladderBattlesPerUser: L.uv > 0 ? +(L.battles / L.uv).toFixed(2) : 0,
    tournamentBattlesPerUser: T.uv > 0 ? +(T.battles / T.uv).toFixed(2) : 0,
    // 留存玩家（创号满 7 天）维度
    retention: {
      login: G.retUv,
      ladder: L.retUv,
      tournament: T.retUv,
      ladderRate: G.retUv > 0 ? +(L.retUv / G.retUv * 100).toFixed(2) : 0,
      tournamentRate: G.retUv > 0 ? +(T.retUv / G.retUv * 100).toFixed(2) : 0,
      ladderBattlesPerUser: L.retUv > 0 ? +(L.retBattles / L.retUv).toFixed(2) : 0,
      tournamentBattlesPerUser: T.retUv > 0 ? +(T.retBattles / T.retUv).toFixed(2) : 0,
    },
  }
})

const output = {
  updateTime: new Date().toISOString(),
  week,
  startTime: startTimeStr,
  endTime: endTimeStr,
  dates: result
}

const outputPath = path.join(PROJECT_ROOT, `public/data/online/weekly/participation-week${week}.json`)
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')
console.log(`\n✓ 输出: ${outputPath}`)
console.log(`  共 ${result.length} 天`)
result.forEach(r => {
  const ret = r.retention
  console.log(`  ${r.date}: 天梯=${r.ladder}(留存${ret.ladder}) 周赛=${r.tournament}(留存${ret.tournament}) 登录=${r.login}(留存${ret.login})`)
})
