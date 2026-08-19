import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'
import { spawnSync } from 'node:child_process'
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
const shouldPublish = args.includes('--publish')

if (isNaN(week) || week < 1) {
  console.error('用法: node fetch-participation-trend.mjs --week N [--region domestic|overseas] [--skip-fetch] [--publish]')
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
// 公会战 CSV 按周分档，跟 ladder 结构类似
const guildWarCsvPath = path.join(PROJECT_ROOT, `data/${region}/archive/week${week}/guild_war_week${week}.csv`)
// 充值 CSV：累计全量（每人历史最大 recharge_total，单位：分）
const rechargeCsvPath = path.join(PROJECT_ROOT, `data/${region}/archive/recharge.csv`)

// 付费档位配置（单位：分）
// 0氪 = 0；小R = (0, 500元]；中R = (500, 5000元]；大R = (5000, 20000元]；超R = > 20000元
// 分档不重叠 + 全覆盖，前端可以直接把选中档的数字相加
const PAYMENT_TIERS = ['nonPayer', 'small', 'mid', 'large', 'mega']
function classifyTier(rechargeCents) {
  const v = Number(rechargeCents) || 0
  if (v <= 0) return 'nonPayer'
  if (v <= 50000) return 'small'       // ≤ 500 元
  if (v <= 500000) return 'mid'        // ≤ 5000 元
  if (v <= 2000000) return 'large'     // ≤ 20000 元
  return 'mega'                         // > 20000 元
}

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

// 从 recharge CSV 建立 b_role_id -> 付费档位 的映射
// CSV 每行是 role_id + 该玩家历史最大 b_recharge_total（单位：分）
// 未在 CSV 里的 role_id = 0氪玩家（tier='nonPayer'），由调用方兜底
async function buildTierMap(csvPath) {
  const map = new Map()
  if (!fs.existsSync(csvPath)) return map
  const fileStream = fs.createReadStream(csvPath)
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let headers = null
  let bRoleIdIdx = -1
  let rechargeIdx = -1
  for await (const line of rl) {
    if (!line.trim()) continue
    const values = parseCSVLine(line)
    if (!headers) {
      headers = values.map(h => h.replace(/^﻿/, '').trim())
      bRoleIdIdx = headers.indexOf('b_role_id')
      rechargeIdx = headers.indexOf('max_recharge_total')
      if (bRoleIdIdx === -1 || rechargeIdx === -1) {
        console.warn(`⚠️ recharge CSV 缺少 b_role_id / max_recharge_total 列，付费分档不可用`)
        return map
      }
      continue
    }
    const bRoleId = values[bRoleIdIdx]
    const rechargeCents = parseFloat(values[rechargeIdx]) || 0
    if (bRoleId) {
      map.set(bRoleId, classifyTier(rechargeCents))
    }
  }
  // 打印各档人数（不含 nonPayer —— CSV 里没记录的都算 nonPayer）
  const counts = { small: 0, mid: 0, large: 0, mega: 0 }
  for (const t of map.values()) counts[t] = (counts[t] || 0) + 1
  console.log(`  付费档映射（有充值记录的玩家）: 小R=${counts.small} 中R=${counts.mid} 大R=${counts.large} 超R=${counts.mega}`)
  return map
}

// 给定 role_id 返回 tier（未在 tierMap 里的默认为 nonPayer）
function tierOf(roleId, tierMap) {
  return tierMap.get(roleId) || 'nonPayer'
}

// 长表 CSV：每行一场事件。按 part_date 分组，distinct b_role_id + 累加行数（=事件数）
// 顶层字段是"全量汇总"（不分档），byTier[tier] 是每档独立的结果（用于付费档筛选）
// 一次遍历，同时输出全量 + 5 档 —— 避免多次遍历 CSV
async function dailyDistinct(csvPath, createTimeMap, tierMap) {
  const emptyBucket = () => ({ uv: {}, retentionUv: {}, battles: {}, retentionBattles: {}, sets: {}, retentionSets: {} })
  const empty = { ...emptyBucket(), byTier: Object.fromEntries(PAYMENT_TIERS.map(t => [t, emptyBucket()])) }
  if (!fs.existsSync(csvPath)) return empty
  const fileStream = fs.createReadStream(csvPath)
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let headers = null
  let dateIdx = -1
  let bRoleIdIdx = -1
  // 全量桶
  const dailySets = {}, retentionSets = {}, dailyBattles = {}, retentionBattles = {}
  // 每档桶（延迟初始化，用到才建 date key）
  const tierSets = Object.fromEntries(PAYMENT_TIERS.map(t => [t, { sets: {}, retentionSets: {}, battles: {}, retentionBattles: {} }]))

  const ensureDay = (bucket, date) => {
    if (!bucket.sets[date]) {
      bucket.sets[date] = new Set()
      bucket.retentionSets[date] = new Set()
      bucket.battles[date] = 0
      bucket.retentionBattles[date] = 0
    }
  }

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

    // 全量累加
    if (!dailySets[date]) {
      dailySets[date] = new Set()
      retentionSets[date] = new Set()
      dailyBattles[date] = 0
      retentionBattles[date] = 0
    }
    dailySets[date].add(bRoleId)
    dailyBattles[date]++
    const createDay = createTimeMap ? createTimeMap.get(bRoleId) : null
    const isRet = createDay && isRetention(date, createDay)
    if (isRet) {
      retentionSets[date].add(bRoleId)
      retentionBattles[date]++
    }

    // 按 tier 分档累加
    const tier = tierOf(bRoleId, tierMap)
    const bucket = tierSets[tier]
    ensureDay(bucket, date)
    bucket.sets[date].add(bRoleId)
    bucket.battles[date]++
    if (isRet) {
      bucket.retentionSets[date].add(bRoleId)
      bucket.retentionBattles[date]++
    }
  }

  const finalizeBucket = (b) => {
    const uv = {}, retentionUv = {}
    for (const [date, set] of Object.entries(b.sets)) {
      uv[date] = set.size
      retentionUv[date] = b.retentionSets[date].size
    }
    return { uv, retentionUv, battles: b.battles, retentionBattles: b.retentionBattles, sets: b.sets, retentionSets: b.retentionSets }
  }

  const byTier = {}
  for (const t of PAYMENT_TIERS) byTier[t] = finalizeBucket(tierSets[t])

  const uv = {}, retentionUv = {}
  for (const [date, set] of Object.entries(dailySets)) {
    uv[date] = set.size
    retentionUv[date] = retentionSets[date].size
  }
  return { uv, retentionUv, battles: dailyBattles, retentionBattles, sets: dailySets, retentionSets, byTier }
}

console.log(`\n建立创号时间映射（login CSV）...`)
const createTimeMap = await buildCreateTimeMap(loginCsvPath)

console.log(`\n建立付费档映射（recharge CSV）...`)
const tierMap = await buildTierMap(rechargeCsvPath)

console.log(`\n处理 ladder CSV...`)
const ladderResult = await dailyDistinct(ladderCsvPath, createTimeMap, tierMap)
console.log(`  天梯每日 UV:`, ladderResult.uv)
console.log(`  天梯每日留存 UV:`, ladderResult.retentionUv)

console.log(`处理 tournament CSV...`)
const tournamentResult = await dailyDistinct(tournamentCsvPath, createTimeMap, tierMap)
console.log(`  周赛每日 UV:`, tournamentResult.uv)
console.log(`  周赛每日留存 UV:`, tournamentResult.retentionUv)

console.log(`处理 login CSV...`)
const loginResult = await dailyDistinct(loginCsvPath, createTimeMap, tierMap)
console.log(`  登录每日 UV:`, loginResult.uv)
console.log(`  登录每日留存 UV:`, loginResult.retentionUv)

console.log(`处理 gym_infinity CSV（累计，按本周日期过滤）...`)
const gymResultAll = await dailyDistinct(gymCsvPath, createTimeMap, tierMap)
// 只保留本周的日期（gym 是累计 CSV，可能包含前几周）
const weekDates = new Set()
{
  const s = new Date(startTime), e = new Date(endTime)
  for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
    weekDates.add(fmtDate(d))
  }
}
const filterToWeek = obj => Object.fromEntries(Object.entries(obj).filter(([k]) => weekDates.has(k)))
const filterBucketToWeek = (b) => ({
  uv: filterToWeek(b.uv),
  retentionUv: filterToWeek(b.retentionUv),
  battles: filterToWeek(b.battles),
  retentionBattles: filterToWeek(b.retentionBattles),
  sets: filterToWeek(b.sets),
  retentionSets: filterToWeek(b.retentionSets),
})
const gymResult = {
  ...filterBucketToWeek(gymResultAll),
  byTier: Object.fromEntries(PAYMENT_TIERS.map(t => [t, filterBucketToWeek(gymResultAll.byTier[t])])),
}
console.log(`  无限道馆每日 UV:`, gymResult.uv)
console.log(`  无限道馆每日留存 UV:`, gymResult.retentionUv)

console.log(`处理 guild_war CSV...`)
const guildWarResult = await dailyDistinct(guildWarCsvPath, createTimeMap, tierMap)
console.log(`  公会战每日 UV:`, guildWarResult.uv)
console.log(`  公会战每日留存 UV:`, guildWarResult.retentionUv)

// 合并所有日期，计算比例 + 场均（全量 + 留存）
const allDates = [...new Set([
  ...Object.keys(ladderResult.uv),
  ...Object.keys(tournamentResult.uv),
  ...Object.keys(loginResult.uv),
  ...Object.keys(gymResult.uv),
  ...Object.keys(guildWarResult.uv),
])].sort()

const dayMetrics = (res, date) => ({
  uv: res.uv[date] || 0,
  battles: res.battles[date] || 0,
  retUv: res.retentionUv[date] || 0,
  retBattles: res.retentionBattles[date] || 0,
})

// 算 4 玩法（天梯 L / 周赛 T / 无限道馆 G / 公会战 W）在登录用户中的重合分布
// 4-bit 掩码 LTGW（bit3=L bit2=T bit1=G bit0=W）→ 16 种组合
// key 命名规则：只玩一个 → 'l' / 't' / 'g' / 'w'；多个 → 按 LTGW 顺序拼接如 'lt' / 'ltg' / 'ltgw'
// 特殊：全 0（登录但未参与任何战斗）→ 'login_only'；none→ 'none'（一般不会出现，兜底用）
function computeOverlap(loginSet, ladderSet, tournamentSet, gymSet, guildWarSet) {
  // 全 16 分区先置 0
  const empty = {
    login_only: 0,
    l: 0, t: 0, g: 0, w: 0,
    lt: 0, lg: 0, lw: 0, tg: 0, tw: 0, gw: 0,
    ltg: 0, ltw: 0, lgw: 0, tgw: 0,
    ltgw: 0,
  }
  if (!loginSet || !loginSet.size) return empty
  // 掩码 → key 的映射（bit3=L bit2=T bit1=G bit0=W）
  const KEY_BY_MASK = {
    0b0000: 'login_only',
    0b1000: 'l',    0b0100: 't',    0b0010: 'g',    0b0001: 'w',
    0b1100: 'lt',   0b1010: 'lg',   0b1001: 'lw',   0b0110: 'tg',   0b0101: 'tw',   0b0011: 'gw',
    0b1110: 'ltg',  0b1101: 'ltw',  0b1011: 'lgw',  0b0111: 'tgw',
    0b1111: 'ltgw',
  }
  const out = { ...empty }
  for (const uid of loginSet) {
    const l = ladderSet && ladderSet.has(uid) ? 1 : 0
    const t = tournamentSet && tournamentSet.has(uid) ? 1 : 0
    const g = gymSet && gymSet.has(uid) ? 1 : 0
    const w = guildWarSet && guildWarSet.has(uid) ? 1 : 0
    const mask = (l << 3) | (t << 2) | (g << 1) | w
    out[KEY_BY_MASK[mask]]++
  }
  return out
}

// 从 5 个玩法的 dayMetrics + overlap 生成一份"分档数据"结构
// 用于每日结果（全量视角）和每档视角，避免代码重复
function buildDayCore(L, T, G, M, W, overlapAll) {
  return {
    ladder: L.uv,
    tournament: T.uv,
    infinityGym: M.uv,
    guildWar: W.uv,
    login: G.uv,
    ladderRate: G.uv > 0 ? +(L.uv / G.uv * 100).toFixed(2) : 0,
    tournamentRate: G.uv > 0 ? +(T.uv / G.uv * 100).toFixed(2) : 0,
    infinityGymRate: G.uv > 0 ? +(M.uv / G.uv * 100).toFixed(2) : 0,
    guildWarRate: G.uv > 0 ? +(W.uv / G.uv * 100).toFixed(2) : 0,
    ladderBattlesPerUser: L.uv > 0 ? +(L.battles / L.uv).toFixed(2) : 0,
    tournamentBattlesPerUser: T.uv > 0 ? +(T.battles / T.uv).toFixed(2) : 0,
    infinityGymBattlesPerUser: M.uv > 0 ? +(M.battles / M.uv).toFixed(2) : 0,
    guildWarBattlesPerUser: W.uv > 0 ? +(W.battles / W.uv).toFixed(2) : 0,
    overlap: overlapAll,
  }
}
function buildRetentionCore(L, T, G, M, W, overlapRet) {
  return {
    login: G.retUv,
    ladder: L.retUv,
    tournament: T.retUv,
    infinityGym: M.retUv,
    guildWar: W.retUv,
    ladderRate: G.retUv > 0 ? +(L.retUv / G.retUv * 100).toFixed(2) : 0,
    tournamentRate: G.retUv > 0 ? +(T.retUv / G.retUv * 100).toFixed(2) : 0,
    infinityGymRate: G.retUv > 0 ? +(M.retUv / G.retUv * 100).toFixed(2) : 0,
    guildWarRate: G.retUv > 0 ? +(W.retUv / G.retUv * 100).toFixed(2) : 0,
    ladderBattlesPerUser: L.retUv > 0 ? +(L.retBattles / L.retUv).toFixed(2) : 0,
    tournamentBattlesPerUser: T.retUv > 0 ? +(T.retBattles / T.retUv).toFixed(2) : 0,
    infinityGymBattlesPerUser: M.retUv > 0 ? +(M.retBattles / M.retUv).toFixed(2) : 0,
    guildWarBattlesPerUser: W.retUv > 0 ? +(W.retBattles / W.retUv).toFixed(2) : 0,
    overlap: overlapRet,
  }
}

const result = allDates.map(date => {
  const L = dayMetrics(ladderResult, date)
  const T = dayMetrics(tournamentResult, date)
  const G = dayMetrics(loginResult, date)
  const M = dayMetrics(gymResult, date)     // M = infinity gyM
  const W = dayMetrics(guildWarResult, date) // W = guild War

  // 4 玩法 overlap（全量 + 留存两套）
  const overlapAll = computeOverlap(
    loginResult.sets[date] || new Set(),
    ladderResult.sets[date], tournamentResult.sets[date], gymResult.sets[date], guildWarResult.sets[date]
  )
  const overlapRet = computeOverlap(
    loginResult.retentionSets[date] || new Set(),
    ladderResult.retentionSets[date], tournamentResult.retentionSets[date], gymResult.retentionSets[date], guildWarResult.retentionSets[date]
  )

  // 按 tier 拆分每日数据（前端付费档筛选器用）
  const byTier = {}
  for (const tier of PAYMENT_TIERS) {
    const Lt = dayMetrics(ladderResult.byTier[tier], date)
    const Tt = dayMetrics(tournamentResult.byTier[tier], date)
    const Gt = dayMetrics(loginResult.byTier[tier], date)
    const Mt = dayMetrics(gymResult.byTier[tier], date)
    const Wt = dayMetrics(guildWarResult.byTier[tier], date)
    const oAll = computeOverlap(
      loginResult.byTier[tier].sets[date] || new Set(),
      ladderResult.byTier[tier].sets[date],
      tournamentResult.byTier[tier].sets[date],
      gymResult.byTier[tier].sets[date],
      guildWarResult.byTier[tier].sets[date],
    )
    const oRet = computeOverlap(
      loginResult.byTier[tier].retentionSets[date] || new Set(),
      ladderResult.byTier[tier].retentionSets[date],
      tournamentResult.byTier[tier].retentionSets[date],
      gymResult.byTier[tier].retentionSets[date],
      guildWarResult.byTier[tier].retentionSets[date],
    )
    byTier[tier] = {
      ...buildDayCore(Lt, Tt, Gt, Mt, Wt, oAll),
      retention: buildRetentionCore(Lt, Tt, Gt, Mt, Wt, oRet),
    }
  }

  return {
    date,
    ...buildDayCore(L, T, G, M, W, overlapAll),
    retention: buildRetentionCore(L, T, G, M, W, overlapRet),
    byTier,
  }
})

// 整周合并去重的 overlap：把 5 天的 Set 分别 union 成周级 Set，然后跑一次 computeOverlap
// 语义：只要本周内登录过 ≥1 次就算登录玩家；玩过某玩法 ≥1 次就算参与该玩法
function unionAllDays(setsByDate) {
  const out = new Set()
  for (const date of allDates) {
    const s = setsByDate[date]
    if (s) for (const uid of s) out.add(uid)
  }
  return out
}
const weekLoginSet     = unionAllDays(loginResult.sets)
const weekLadderSet    = unionAllDays(ladderResult.sets)
const weekTournamentSet= unionAllDays(tournamentResult.sets)
const weekGymSet       = unionAllDays(gymResult.sets)
const weekGuildWarSet  = unionAllDays(guildWarResult.sets)
const weekOverlap = computeOverlap(weekLoginSet, weekLadderSet, weekTournamentSet, weekGymSet, weekGuildWarSet)

const weekRetLoginSet     = unionAllDays(loginResult.retentionSets)
const weekRetLadderSet    = unionAllDays(ladderResult.retentionSets)
const weekRetTournamentSet= unionAllDays(tournamentResult.retentionSets)
const weekRetGymSet       = unionAllDays(gymResult.retentionSets)
const weekRetGuildWarSet  = unionAllDays(guildWarResult.retentionSets)
const retentionWeekOverlap = computeOverlap(weekRetLoginSet, weekRetLadderSet, weekRetTournamentSet, weekRetGymSet, weekRetGuildWarSet)

console.log(`\n整周合并 overlap（全量）: 登录基数 ${weekLoginSet.size}, 分区:`, weekOverlap)
console.log(`整周合并 overlap（留存）: 登录基数 ${weekRetLoginSet.size}, 分区:`, retentionWeekOverlap)

// 按 tier 拆分整周合并 overlap
const weekByTier = {}
for (const tier of PAYMENT_TIERS) {
  const wLoginSet     = unionAllDays(loginResult.byTier[tier].sets)
  const wLadderSet    = unionAllDays(ladderResult.byTier[tier].sets)
  const wTournamentSet= unionAllDays(tournamentResult.byTier[tier].sets)
  const wGymSet       = unionAllDays(gymResult.byTier[tier].sets)
  const wGuildWarSet  = unionAllDays(guildWarResult.byTier[tier].sets)
  const wOverlap = computeOverlap(wLoginSet, wLadderSet, wTournamentSet, wGymSet, wGuildWarSet)

  const wRetLoginSet     = unionAllDays(loginResult.byTier[tier].retentionSets)
  const wRetLadderSet    = unionAllDays(ladderResult.byTier[tier].retentionSets)
  const wRetTournamentSet= unionAllDays(tournamentResult.byTier[tier].retentionSets)
  const wRetGymSet       = unionAllDays(gymResult.byTier[tier].retentionSets)
  const wRetGuildWarSet  = unionAllDays(guildWarResult.byTier[tier].retentionSets)
  const wRetOverlap = computeOverlap(wRetLoginSet, wRetLadderSet, wRetTournamentSet, wRetGymSet, wRetGuildWarSet)

  weekByTier[tier] = {
    weekLoginBase: wLoginSet.size,
    weekOverlap: wOverlap,
    retentionWeekLoginBase: wRetLoginSet.size,
    retentionWeekOverlap: wRetOverlap,
  }
}

const tierLabels = { nonPayer: '0氪', small: '小R', mid: '中R', large: '大R', mega: '超R' }
const tierSummary = PAYMENT_TIERS.map(t => `${tierLabels[t]}=${weekByTier[t].weekLoginBase}`).join(' ')
console.log(`整周合并 overlap（各档登录）: ${tierSummary}`)

const output = {
  updateTime: new Date().toISOString(),
  week,
  region,
  startTime: startDate,
  endTime: endDate,
  dates: result,
  // 整周合并去重（用于「周重合率」展示）
  weekLoginBase: weekLoginSet.size,
  weekOverlap,
  retentionWeekLoginBase: weekRetLoginSet.size,
  retentionWeekOverlap,
  // 分档周汇总：{ nonPayer: { weekLoginBase, weekOverlap, retention...}, small: {...}, ... }
  weekByTier,
}

const outputPath = path.join(PROJECT_ROOT, `public/data/online/${region}/weekly/participation-week${week}.json`)
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')
console.log(`\n✓ 输出: ${outputPath}`)
console.log(`  共 ${result.length} 天`)
result.forEach(r => {
  const ret = r.retention
  console.log(`  ${r.date}: 天梯=${r.ladder}(留存${ret.ladder}) 周赛=${r.tournament}(留存${ret.tournament}) 无限道馆=${r.infinityGym}(留存${ret.infinityGym}) 公会战=${r.guildWar}(留存${ret.guildWar}) 登录=${r.login}(留存${ret.login})`)
})

// 手动补跑用：传 --publish 时自动跑 publish.sh，把 public/data 同步到 dist 并重启服务
// 自动流程（auto-update.mjs）里不要传 --publish，那边最后统一 publish 一次即可
if (shouldPublish) {
  console.log('\n🚀 --publish 触发发布...')
  const findBash = () => {
    if (process.platform !== 'win32') return 'bash'
    const candidates = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
    ]
    return candidates.find(p => fs.existsSync(p)) || 'bash'
  }
  const r = spawnSync(findBash(), ['publish.sh'], { cwd: PROJECT_ROOT, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`❌ publish 失败 (exit ${r.status})`)
    process.exit(r.status || 1)
  }
}
