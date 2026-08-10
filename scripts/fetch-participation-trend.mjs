import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'
import { fetchCsv } from './ta-fetch.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.join(__dirname, '..')

// 解析参数
const args = process.argv.slice(2)
const weekIdx = args.indexOf('--week')
const week = weekIdx !== -1 ? parseInt(args[weekIdx + 1]) : null
const regionIdx = args.indexOf('--region')
const region = regionIdx !== -1 ? args[regionIdx + 1] : 'domestic'
const skipFetch = args.includes('--skip-fetch')

if (isNaN(week) || week < 1) {
  console.error('用法: node fetch-participation-trend.mjs --week N [--region domestic|overseas]')
  process.exit(1)
}
if (!['domestic', 'overseas'].includes(region)) {
  console.error(`未知 --region: ${region}（仅支持 domestic / overseas）`)
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

// 新 SQL 用日期粒度（YYYY-MM-DD），跟 "$part_date" 一致
const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const startDate = fmtDate(startTime)
const endDate = fmtDate(new Date(endTime - 1000)) // 结束当天算最后一天（endTime 是下周五 03:00）

console.log(`\n===== 参与走势拉取 Week ${week} (${region}) =====`)
console.log(`日期范围: ${startDate} ~ ${endDate}`)

// login CSV 路径
const loginCsvPath = path.join(PROJECT_ROOT, `data/${region}/archive/week${week}/login_week${week}.csv`)
if (skipFetch && fs.existsSync(loginCsvPath)) {
  console.log(`✓ --skip-fetch 且 login CSV 已存在，跳过拉取`)
} else {
  console.log(`\n📤 拉取 player_login 数据 (${region})...`)
  await fetchCsv(region, 'login', startDate, endDate, loginCsvPath)
}

const ladderCsvPath = path.join(PROJECT_ROOT, `data/${region}/archive/week${week}/ladder_week${week}.csv`)
const tournamentCsvPath = path.join(PROJECT_ROOT, `data/${region}/archive/week${week}/tournament_week${week}.csv`)
// 无限道馆 CSV 是累计的（不按周分），所有周共用一份；参与走势按 part_date 过滤到本周
const gymCsvPath = path.join(PROJECT_ROOT, `data/${region}/archive/gym_infinity.csv`)

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
function isRetention(date, createDay) {
  const diff = (new Date(date) - new Date(createDay.slice(0, 10))) / ONE_DAY_MS
  return diff >= 7
}

// 从 login CSV 建立 b_role_id -> 创号日期(YYYY-MM-DD) 的映射
// 新 CSV 是长表（每行一次 login），同一 b_role_id 可能出现多次，取第一次遇到即可
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
    if (bRoleId && createTimeStr && !map.has(bRoleId)) {
      // b_create_time_str 形如 "2026-07-15 10:23:00"，取日期部分
      map.set(bRoleId, createTimeStr.slice(0, 10))
    }
  }
  console.log(`  创号时间映射: ${map.size} 个玩家`)
  return map
}

// 长表 CSV：每行一场事件。按 part_date 分组，distinct b_role_id + 累加行数（=事件数）
// 返回: { uv, retentionUv, battles, retentionBattles }（各为 date -> 数值）
async function dailyDistinct(csvPath, createTimeMap) {
  const empty = { uv: {}, retentionUv: {}, battles: {}, retentionBattles: {} }
  if (!fs.existsSync(csvPath)) return empty
  const fileStream = fs.createReadStream(csvPath)
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let headers = null
  let dateIdx = -1
  let bRoleIdIdx = -1
  const dailySets = {}          // date -> Set<b_role_id>（全量）
  const retentionSets = {}      // date -> Set<b_role_id>（留存）
  const dailyBattles = {}       // date -> 事件行数累加
  const retentionBattles = {}

  for await (const line of rl) {
    if (!line.trim()) continue
    const values = parseCSVLine(line)
    if (!headers) {
      headers = values.map(h => h.replace(/^﻿/, '').trim())
      dateIdx = headers.indexOf('part_date')
      bRoleIdIdx = headers.indexOf('b_role_id')
      if (dateIdx === -1 || bRoleIdIdx === -1) {
        console.error(`❌ CSV 未找到 part_date/b_role_id 列: ${csvPath}`)
        return empty
      }
      continue
    }
    const date = values[dateIdx]
    const bRoleId = values[bRoleIdIdx]
    if (!date || !bRoleId) continue

    if (!dailySets[date]) {
      dailySets[date] = new Set()
      retentionSets[date] = new Set()
      dailyBattles[date] = 0
      retentionBattles[date] = 0
    }

    dailySets[date].add(bRoleId)
    dailyBattles[date]++
    const createDay = createTimeMap ? createTimeMap.get(bRoleId) : null
    if (createDay && isRetention(date, createDay)) {
      retentionSets[date].add(bRoleId)
      retentionBattles[date]++
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

console.log(`处理 gym_infinity CSV（累计，按本周日期过滤）...`)
const gymResultAll = await dailyDistinct(gymCsvPath, createTimeMap)
// 只保留本周的日期（gym 是累计 CSV，可能包含前几周）
const weekDates = new Set()
{
  const s = new Date(startTime), e = new Date(endTime)
  for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
    weekDates.add(fmtDate(d))
  }
}
const filterToWeek = obj => Object.fromEntries(Object.entries(obj).filter(([k]) => weekDates.has(k)))
const gymResult = {
  uv: filterToWeek(gymResultAll.uv),
  retentionUv: filterToWeek(gymResultAll.retentionUv),
  battles: filterToWeek(gymResultAll.battles),
  retentionBattles: filterToWeek(gymResultAll.retentionBattles),
}
console.log(`  无限道馆每日 UV:`, gymResult.uv)
console.log(`  无限道馆每日留存 UV:`, gymResult.retentionUv)

// 合并所有日期，计算比例 + 场均（全量 + 留存）
const allDates = [...new Set([
  ...Object.keys(ladderResult.uv),
  ...Object.keys(tournamentResult.uv),
  ...Object.keys(loginResult.uv),
  ...Object.keys(gymResult.uv),
])].sort()

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
  const M = dayMetrics(gymResult, date)     // M = infinity gyM
  return {
    date,
    ladder: L.uv,
    tournament: T.uv,
    infinityGym: M.uv,
    login: G.uv,
    ladderRate: G.uv > 0 ? +(L.uv / G.uv * 100).toFixed(2) : 0,
    tournamentRate: G.uv > 0 ? +(T.uv / G.uv * 100).toFixed(2) : 0,
    infinityGymRate: G.uv > 0 ? +(M.uv / G.uv * 100).toFixed(2) : 0,
    ladderBattlesPerUser: L.uv > 0 ? +(L.battles / L.uv).toFixed(2) : 0,
    tournamentBattlesPerUser: T.uv > 0 ? +(T.battles / T.uv).toFixed(2) : 0,
    infinityGymBattlesPerUser: M.uv > 0 ? +(M.battles / M.uv).toFixed(2) : 0,
    retention: {
      login: G.retUv,
      ladder: L.retUv,
      tournament: T.retUv,
      infinityGym: M.retUv,
      ladderRate: G.retUv > 0 ? +(L.retUv / G.retUv * 100).toFixed(2) : 0,
      tournamentRate: G.retUv > 0 ? +(T.retUv / G.retUv * 100).toFixed(2) : 0,
      infinityGymRate: G.retUv > 0 ? +(M.retUv / G.retUv * 100).toFixed(2) : 0,
      ladderBattlesPerUser: L.retUv > 0 ? +(L.retBattles / L.retUv).toFixed(2) : 0,
      tournamentBattlesPerUser: T.retUv > 0 ? +(T.retBattles / T.retUv).toFixed(2) : 0,
      infinityGymBattlesPerUser: M.retUv > 0 ? +(M.retBattles / M.retUv).toFixed(2) : 0,
    },
  }
})

const output = {
  updateTime: new Date().toISOString(),
  week,
  region,
  startTime: startDate,
  endTime: endDate,
  dates: result
}

const outputPath = path.join(PROJECT_ROOT, `public/data/online/${region}/weekly/participation-week${week}.json`)
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')
console.log(`\n✓ 输出: ${outputPath}`)
console.log(`  共 ${result.length} 天`)
result.forEach(r => {
  const ret = r.retention
  console.log(`  ${r.date}: 天梯=${r.ladder}(留存${ret.ladder}) 周赛=${r.tournament}(留存${ret.tournament}) 无限道馆=${r.infinityGym}(留存${ret.infinityGym}) 登录=${r.login}(留存${ret.login})`)
})
