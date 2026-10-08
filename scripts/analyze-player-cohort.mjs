#!/usr/bin/env node
/**
 * 玩家行为与留存分析（预研）
 *
 * 用法: node scripts/analyze-player-cohort.mjs --region cn [--cutoff 2026-10-02]
 *
 * 输出：
 *   docs/retention-analysis/player-wide-table-{region}.csv  —— 玩家宽表
 *   docs/retention-analysis/aggregated-metrics-{region}.json —— 聚合指标
 *   docs/retention-analysis/report-{region}-{label}.md       —— Markdown 报告（label 由 --label 控制，默认"预研版"）
 *
 * cohort 划分（跟上线玩法开放节奏对齐，9/17 单独拆出以隔离内测回归）：
 *   A0: 9/17 单日   上线首日（含大量内测回归玩家，粘性天然高）
 *   A1: 9/18 ~ 9/24 相对纯净新手期（ladder + 道馆 + 助战）
 *   B:  9/25 ~ 9/29 周赛开放~公会战开放前（A + 周赛）
 *   C:  9/30 ~ cutoff 公会战开放后       （B + 公会战）
 *
 * 付费档位复用 fetch-participation-trend.mjs 口径：
 *   nonPayer=0 / s1≤6元 / s2≤36元 / s3≤200元 / s4≤500元 / mid≤5000元 / large≤20000元 / mega>20000元
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { processCSVStream } from './lib/csv.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.join(__dirname, '..')

// ---------- 参数 ----------
const args = process.argv.slice(2)
const argValue = (name, def) => {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : def
}
const region = argValue('--region', 'cn')
const CUTOFF = argValue('--cutoff', '2026-10-02')
const LABEL = argValue('--label', '预研版')
const LAUNCH = '2026-09-17'
const COHORT_A1_START = '2026-09-18' // A0=9/17 单日（含内测回归），A1=9/18+
const COHORT_B_START = '2026-09-25'
const COHORT_C_START = '2026-09-30'
const CHURN_DAYS = 1 // 末登日距 cutoff ≥ 1 天 = 流失（激进口径）

if (!['cn', 'overseas'].includes(region)) {
  console.error('--region 仅支持 cn / overseas')
  process.exit(1)
}

const COHORTS = ['A0', 'A1', 'B', 'C']
const TIERS = ['nonPayer', 's1', 's2', 's3', 's4', 'mid', 'large', 'mega']
const TIER_LABEL = {
  nonPayer: '0氪',
  s1: '首充(≤6)',
  s2: '月卡(≤36)',
  s3: '通行证(≤200)',
  s4: '小R+(≤500)',
  mid: '中R',
  large: '大R',
  mega: '超R',
}
const MODES = ['ladder', 'tournament', 'gym', 'guildWar']
const MODE_DIR = { ladder: 'ladder', tournament: 'tournament', gym: 'infinity-gym', guildWar: 'guild-war' }
const MODE_LABEL = { ladder: '天梯', tournament: '周赛', gym: '道馆', guildWar: '公会战' }

// 天梯段位映射：rank 1-30 青铜, 31-60 白银, 61-90 黄金, 91-120 钻石, 121-150 星耀, 151 传说
function rankToTier(r) {
  if (!r || r <= 0) return null
  if (r <= 30) return '青铜'
  if (r <= 60) return '白银'
  if (r <= 90) return '黄金'
  if (r <= 120) return '钻石'
  if (r <= 150) return '星耀'
  return '传说'
}
// 道馆 gym_uid 分区（主线 1-500 / 赛季 1-200）
const GYM_MAINLINE_BASE = 128100000
const GYM_SEASON_BASE   = 1281100000
function gymUidToFloor(uid) {
  if (uid >= 128100001 && uid <= 128100500) return { zone: 'mainline', floor: uid - GYM_MAINLINE_BASE }
  if (uid >= 1281100001 && uid <= 1281100200) return { zone: 'season', floor: uid - GYM_SEASON_BASE }
  return null
}

// ---------- 工具 ----------
function classifyTier(cents) {
  const v = Number(cents) || 0
  if (v <= 0) return 'nonPayer'
  if (v <= 600) return 's1'       // ≤ 6 元 = 首充
  if (v <= 3600) return 's2'      // ≤ 36 元 = 月卡
  if (v <= 20000) return 's3'     // ≤ 200 元 = 通行证
  if (v <= 50000) return 's4'     // ≤ 500 元 = 小 R+
  if (v <= 500000) return 'mid'   // ≤ 5000 元 = 中 R
  if (v <= 2000000) return 'large'// ≤ 20000 元 = 大 R
  return 'mega'
}
function classifyCohort(firstLoginDate) {
  if (firstLoginDate < LAUNCH) return null
  if (firstLoginDate >= COHORT_C_START) return 'C'
  if (firstLoginDate >= COHORT_B_START) return 'B'
  if (firstLoginDate >= COHORT_A1_START) return 'A1'
  return 'A0' // 9/17 当日入场
}
const ONE_DAY_MS = 86400000
// 日期全部用 UTC 操作（避免 local timezone + toISOString 回退一天的坑）
function dateToUTC(date) {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
function utcToDate(ms) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
function dateRange(start, end) {
  const out = []
  const stop = dateToUTC(end)
  for (let t = dateToUTC(start); t <= stop; t += ONE_DAY_MS) {
    out.push(utcToDate(t))
  }
  return out
}
function daysBetween(a, b) {
  return Math.floor((dateToUTC(b) - dateToUTC(a)) / ONE_DAY_MS)
}
function addDays(date, n) {
  return utcToDate(dateToUTC(date) + n * ONE_DAY_MS)
}

const ALL_DATES = dateRange(LAUNCH, CUTOFF)
const DATE_TO_IDX = new Map(ALL_DATES.map((d, i) => [d, i]))
console.log(`===== 玩家行为与留存分析 (${region}, 截止 ${CUTOFF}) =====`)
console.log(`分析窗口: ${LAUNCH} ~ ${CUTOFF} (${ALL_DATES.length} 天)\n`)

// ---------- 1. 付费档映射 ----------
async function buildTierMap() {
  const csvPath = path.join(PROJECT_ROOT, `data/${region}/archive/recharge.csv`)
  const map = new Map()
  if (!fs.existsSync(csvPath)) {
    console.warn(`⚠️ recharge.csv 不存在: ${csvPath}`)
    return map
  }
  await processCSVStream(csvPath, (row) => {
    const r = row.b_role_id
    if (r) map.set(r, classifyTier(parseFloat(row.max_recharge_total)))
  })
  const counts = Object.fromEntries(TIERS.map(t => [t, 0]))
  for (const t of map.values()) counts[t]++
  console.log(`付费档映射: ${TIERS.filter(t => t !== 'nonPayer').map(t => `${TIER_LABEL[t]}=${counts[t]}`).join(' ')}`)
  return map
}

// ---------- 2. 遍历 login daily CSV，建玩家基础档案 ----------
async function buildPlayerBase(tierMap) {
  const players = new Map()
  for (const date of ALL_DATES) {
    const csvPath = path.join(PROJECT_ROOT, `data/${region}/archive/daily/login/${date}.csv`)
    if (!fs.existsSync(csvPath)) continue
    let lineCount = 0
    await processCSVStream(csvPath, (row) => {
      lineCount++
      const r = row.b_role_id
      const partDate = (row.part_date || '').slice(0, 10)
      if (!r || !partDate || partDate < LAUNCH || partDate > CUTOFF) return
      let p = players.get(r)
      if (!p) {
        p = {
          roleId: r,
          tier: tierMap.get(r) || 'nonPayer',
          firstLoginDate: partDate,
          lastLoginDate: partDate,
          loginDays: new Set([partDate]),
          modes: Object.fromEntries(MODES.map(m => [m, {
            battles: 0,
            firstDay: null,
            daily: new Int32Array(ALL_DATES.length), // 每日场次（按 ALL_DATES 索引）
          }])),
          maxLadderRank: 0,          // 天梯最高 rank（1-151），0=没打天梯
          maxGymMainlineFloor: 0,    // 主线道馆最高层（1-500），0=没打
          maxGymSeasonFloor: 0,      // 赛季道馆最高层（1-200），0=没打
        }
        players.set(r, p)
      } else {
        if (partDate < p.firstLoginDate) p.firstLoginDate = partDate
        if (partDate > p.lastLoginDate) p.lastLoginDate = partDate
        p.loginDays.add(partDate)
      }
    })
    console.log(`  login ${date}: ${lineCount.toLocaleString()} 行 → 累计 ${players.size.toLocaleString()} 玩家`)
  }
  return players
}

// ---------- 3. 累加各玩法场次 ----------
async function aggregateMode(mode, players) {
  const dirName = MODE_DIR[mode]
  const needsPlayerTypeFilter = (mode === 'ladder' || mode === 'tournament')
  let totalKept = 0
  for (const date of ALL_DATES) {
    const csvPath = path.join(PROJECT_ROOT, `data/${region}/archive/daily/${dirName}/${date}.csv`)
    if (!fs.existsSync(csvPath)) continue
    let kept = 0
    await processCSVStream(csvPath, (row) => {
      if (needsPlayerTypeFilter) {
        const pt = parseFloat(row.player_type)
        if (pt !== 1) return // 只统计真人
      }
      const r = row.b_role_id
      const partDate = (row.part_date || '').slice(0, 10)
      if (!r || !partDate || partDate < LAUNCH || partDate > CUTOFF) return
      const p = players.get(r)
      if (!p) return
      const dateIdx = DATE_TO_IDX.get(partDate)
      if (dateIdx === undefined) return
      p.modes[mode].battles++
      p.modes[mode].daily[dateIdx]++
      if (!p.modes[mode].firstDay || partDate < p.modes[mode].firstDay) {
        p.modes[mode].firstDay = partDate
      }
      // 聚合最高段位 / 最高层数
      if (mode === 'ladder') {
        const rank = parseInt(row.player_rank)
        if (rank > p.maxLadderRank) p.maxLadderRank = rank
      } else if (mode === 'gym') {
        const parsed = gymUidToFloor(parseInt(row.gym_uid))
        if (parsed) {
          if (parsed.zone === 'mainline' && parsed.floor > p.maxGymMainlineFloor) p.maxGymMainlineFloor = parsed.floor
          else if (parsed.zone === 'season' && parsed.floor > p.maxGymSeasonFloor) p.maxGymSeasonFloor = parsed.floor
        }
      }
      kept++
    })
    totalKept += kept
  }
  console.log(`  ${mode}: 累计 ${totalKept.toLocaleString()} 场（已过滤机器人）`)
}

// ---------- 4. 分类与聚合 ----------
function analyze(players) {
  for (const p of players.values()) {
    p.cohort = classifyCohort(p.firstLoginDate)
    p.isChurn = daysBetween(p.lastLoginDate, CUTOFF) >= CHURN_DAYS
  }
  const valid = [...players.values()].filter(p => p.cohort)
  console.log(`\n有效玩家: ${valid.length.toLocaleString()}（过滤 ${(players.size - valid.length).toLocaleString()} 异常日期）`)

  // === 1. cohort × tier 规模 + 流失 ===
  const cohortTierCount = {}
  for (const c of COHORTS) for (const t of TIERS) cohortTierCount[`${c}-${t}`] = { total: 0, churn: 0, retain: 0 }
  for (const p of valid) {
    const k = `${p.cohort}-${p.tier}`
    cohortTierCount[k].total++
    if (p.isChurn) cohortTierCount[k].churn++
    else cohortTierCount[k].retain++
  }

  // === 2. 留存曲线（相对首登日 D1/D3/D7/D14）===
  function retentionRate(subset, N) {
    const observable = subset.filter(p => daysBetween(p.firstLoginDate, CUTOFF) >= N)
    if (observable.length === 0) return { denom: 0, numer: 0, rate: null }
    const retained = observable.filter(p => p.loginDays.has(addDays(p.firstLoginDate, N)))
    return { denom: observable.length, numer: retained.length, rate: retained.length / observable.length }
  }
  const retention = {}
  for (const c of COHORTS) {
    retention[c] = {}
    for (const t of TIERS) {
      retention[c][t] = {}
      const subset = valid.filter(p => p.cohort === c && p.tier === t)
      for (const N of [1, 3, 7, 14]) retention[c][t][`D${N}`] = retentionRate(subset, N)
    }
  }

  // === 3. 玩法参与率 + 人均场次 ===
  const participation = {}
  for (const c of COHORTS) {
    participation[c] = {}
    for (const t of TIERS) {
      participation[c][t] = {}
      const subset = valid.filter(p => p.cohort === c && p.tier === t)
      for (const m of MODES) {
        const played = subset.filter(p => p.modes[m].battles > 0)
        participation[c][t][m] = {
          total: subset.length,
          played: played.length,
          rate: subset.length ? played.length / subset.length : 0,
          avgBattlesWhenPlayed: played.length ? played.reduce((s, p) => s + p.modes[m].battles, 0) / played.length : 0,
        }
      }
    }
  }

  // === 4. 流失前玩家状态（全体流失 × 付费档，不分 cohort）===
  //   分母：天梯/道馆/周赛/公会战都只算"玩过该玩法的"流失玩家（避免 0 稀释）
  const churnStatus = {}
  for (const t of TIERS) {
    const subset = valid.filter(p => p.tier === t && p.isChurn)
    const stat = {
      count: subset.length,
      ladder: { played: 0, sumMaxRank: 0 },
      gymMainline: { played: 0, sumMaxFloor: 0 },
      gymSeason: { played: 0, sumMaxFloor: 0 },
      tournament: { played: 0, sumBattles: 0 },
      guildWar: { played: 0, sumBattles: 0 },
    }
    for (const p of subset) {
      if (p.maxLadderRank > 0) { stat.ladder.played++; stat.ladder.sumMaxRank += p.maxLadderRank }
      if (p.maxGymMainlineFloor > 0) { stat.gymMainline.played++; stat.gymMainline.sumMaxFloor += p.maxGymMainlineFloor }
      if (p.maxGymSeasonFloor > 0) { stat.gymSeason.played++; stat.gymSeason.sumMaxFloor += p.maxGymSeasonFloor }
      if (p.modes.tournament.battles > 0) { stat.tournament.played++; stat.tournament.sumBattles += p.modes.tournament.battles }
      if (p.modes.guildWar.battles > 0) { stat.guildWar.played++; stat.guildWar.sumBattles += p.modes.guildWar.battles }
    }
    churnStatus[t] = stat
  }

  // === 4.1 每付费档随机 5 个流失角色样本（固定种子，可复现）===
  const SAMPLE_N = 5
  const churnSamples = {}
  for (const t of TIERS) {
    const subset = valid.filter(p => p.tier === t && p.isChurn)
    // 用 role_id 字符串尾段 hash 排序（稳定且分散）
    const sorted = subset.slice().sort((a, b) => {
      const ha = (a.roleId || '').split('').reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 2166136261)
      const hb = (b.roleId || '').split('').reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 2166136261)
      return ha - hb
    })
    // 均匀步长抽样
    const step = Math.max(1, Math.floor(sorted.length / SAMPLE_N))
    const picked = []
    for (let i = 0; i < sorted.length && picked.length < SAMPLE_N; i += step) picked.push(sorted[i])
    churnSamples[t] = picked.map(p => ({
      roleId: p.roleId,
      cohort: p.cohort,
      firstLoginDate: p.firstLoginDate,
      lastLoginDate: p.lastLoginDate,
      maxLadderRank: p.maxLadderRank,
      maxGymMainlineFloor: p.maxGymMainlineFloor,
      maxGymSeasonFloor: p.maxGymSeasonFloor,
      tournamentBattles: p.modes.tournament.battles,
      guildWarBattles: p.modes.guildWar.battles,
      ladderBattles: p.modes.ladder.battles,
      gymBattles: p.modes.gym.battles,
    }))
  }

  // === 5. 事件效应（周期玩法开放对休眠玩家的回流冲击）===
  function eventEffect(triggerDate, label, lookbackDays = 7) {
    const prevDay = addDays(triggerDate, -1)
    const lookback = []
    for (let i = 1; i <= lookbackDays; i++) lookback.push(addDays(triggerDate, -i))
    const pool = valid.filter(p => lookback.some(d => p.loginDays.has(d)))
    const dormant = pool.filter(p => !p.loginDays.has(prevDay))
    const recalled = dormant.filter(p => p.loginDays.has(triggerDate))
    return {
      label,
      triggerDate,
      poolSize: pool.length,
      dormantSize: dormant.length,
      recalledSize: recalled.length,
      recallRate: dormant.length ? recalled.length / dormant.length : 0,
    }
  }
  const events = {
    tournamentOpen: eventEffect('2026-09-25', '📢 周赛首开（周五）'),
    guildWarOpen: eventEffect('2026-09-30', '⚔️ 公会战首开（周三）'),
    baseline0922: eventEffect('2026-09-22', '📏 对照 9/22（纯常驻周一）'),
    baseline0929: eventEffect('2026-09-29', '📏 对照 9/29（公会战开放前日）'),
  }

  // === 5.5 流失玩家末登日分布（看流失集中在哪天）===
  const churnDateDist = {}
  for (const c of COHORTS) {
    churnDateDist[c] = {}
    for (const t of TIERS) {
      const subset = valid.filter(p => p.cohort === c && p.tier === t && p.isChurn)
      const dayCount = {}
      for (const p of subset) {
        dayCount[p.lastLoginDate] = (dayCount[p.lastLoginDate] || 0) + 1
      }
      churnDateDist[c][t] = { count: subset.length, byDate: dayCount }
    }
  }

  return { cohortTierCount, retention, participation, churnStatus, churnSamples, churnDateDist, events }
}

// ---------- 5. 输出宽表 CSV ----------
function writeWideTable(players, outPath) {
  const header = 'role_id,region,tier,cohort,first_login,last_login,is_churn,login_days,ladder,tournament,gym,guild_war'
  const stream = fs.createWriteStream(outPath)
  stream.write(header + '\n')
  for (const [role_id, p] of players) {
    if (!p.cohort) continue
    stream.write([
      role_id, region, p.tier, p.cohort,
      p.firstLoginDate, p.lastLoginDate, p.isChurn ? 1 : 0,
      p.loginDays.size,
      p.modes.ladder.battles, p.modes.tournament.battles,
      p.modes.gym.battles, p.modes.guildWar.battles,
    ].join(',') + '\n')
  }
  stream.end()
  return new Promise(resolve => stream.on('finish', resolve))
}

// ---------- 6. Markdown 报告 ----------
function writeReport(metrics, outPath) {
  const L = []
  const push = (...xs) => L.push(...xs)

  push(`# 玩家行为与留存分析（${region}）— ${LABEL}`)
  push('')
  push(`- **截止日期**：${CUTOFF}`)
  push(`- **分析窗口**：${LAUNCH} ~ ${CUTOFF}（${ALL_DATES.length} 天）`)
  push(`- **流失定义**：末次登录距截止日 ≥ ${CHURN_DAYS} 天（激进口径：${CHURN_DAYS === 1 ? '10/01 前就没登 = 流失' : '可调整'}）`)
  push(`- **真人过滤**：天梯/周赛脚本层过滤 player_type=1；公会战 SQL 层已过滤（ta-fetch.mjs:179）；道馆/登录天然都是真人`)
  push('')
  push(`## Cohort 划分`)
  push(`| Cohort | 入场时期 | 当时能玩的玩法 |`)
  push(`|---|---|---|`)
  push(`| A0 | 9/17（1 天，上线首日） | 天梯 + 道馆 + 助战 （含大量内测回归玩家，粘性天然高） |`)
  push(`| A1 | 9/18 ~ 9/24（7 天） | 同上（相对纯净新手） |`)
  push(`| B | 9/25 ~ 9/29（5 天） | A1 + 周赛 |`)
  push(`| C | 9/30 ~ ${CUTOFF}（${daysBetween(COHORT_C_START, CUTOFF) + 1} 天） | B + 公会战 |`)
  push('')

  // === 1. 规模 ===
  push(`## 1. 玩家规模（cohort × 付费档）`)
  push('')
  push(`| Cohort | ${TIERS.map(t => TIER_LABEL[t]).join(' | ')} | 合计 |`)
  push(`|---|${TIERS.map(() => '---').join('|')}|---|`)
  for (const c of COHORTS) {
    const nums = TIERS.map(t => metrics.cohortTierCount[`${c}-${t}`].total)
    push(`| ${c} | ${nums.join(' | ')} | ${nums.reduce((a, b) => a + b, 0)} |`)
  }
  push('')

  // === 2. 流失率 ===
  push(`## 2. 流失率（cohort × 付费档）`)
  push('')
  push(`> ⚠️ cohort C 大部分玩家观测窗口 < ${CHURN_DAYS} 天，流失率天然偏低，看绝对值要配合规模一起解读`)
  push('')
  push(`| Cohort | ${TIERS.map(t => TIER_LABEL[t]).join(' | ')} |`)
  push(`|---|${TIERS.map(() => '---').join('|')}|`)
  for (const c of COHORTS) {
    const cells = TIERS.map(t => {
      const o = metrics.cohortTierCount[`${c}-${t}`]
      return o.total ? `${(o.churn / o.total * 100).toFixed(1)}%` : '-'
    })
    push(`| ${c} | ${cells.join(' | ')} |`)
  }
  push('')

  // === 3. 留存曲线 ===
  push(`## 3. 留存曲线（相对首登日 D1 / D3 / D7 / D14）`)
  push('')
  push(`> 分母 = 在观测窗口内能观察到 DN 的玩家（首登日 + N ≤ 截止日）；DN 不足观测期则显示 "-"`)
  push('')
  for (const N of [1, 3, 7, 14]) {
    push(`### D${N} 留存率`)
    push('')
    push(`| Cohort | ${TIERS.map(t => TIER_LABEL[t]).join(' | ')} |`)
    push(`|---|${TIERS.map(() => '---').join('|')}|`)
    for (const c of COHORTS) {
      const cells = TIERS.map(t => {
        const r = metrics.retention[c][t][`D${N}`]
        if (r.denom === 0) return '-'
        return `${(r.rate * 100).toFixed(1)}% <sub>${r.numer}/${r.denom}</sub>`
      })
      push(`| ${c} | ${cells.join(' | ')} |`)
    }
    push('')
  }

  // === 4. 玩法参与率（全体 × 付费档，不分 cohort）===
  push(`## 4. 玩法参与率 & 人均场次（全体 × 付费档）`)
  push('')
  push(`> ⚠️ **不分 cohort 合计**：不同 cohort 入场时间差异大、能玩的玩法不同、观察窗口不同，分 cohort 看玩法总量意义不大；此处合计全部玩家按付费档展示`)
  push(`> 单元格 = **参与率% / 人均场次**；参与率 = 该付费档内玩过该玩法的人数占比；人均场次 = 分母只算玩过的人`)
  push('')
  push(`| 玩法 | ${TIERS.map(t => TIER_LABEL[t]).join(' | ')} |`)
  push(`|---|${TIERS.map(() => '---').join('|')}|`)
  for (const m of MODES) {
    const cells = TIERS.map(t => {
      let totalPlayers = 0
      let playedPlayers = 0
      let totalBattles = 0
      for (const c of COHORTS) {
        const r = metrics.participation[c][t][m]
        totalPlayers += r.total
        playedPlayers += r.played
        totalBattles += r.avgBattlesWhenPlayed * r.played
      }
      if (totalPlayers === 0) return '-'
      const rate = (playedPlayers / totalPlayers * 100).toFixed(1) + '%'
      const avg = playedPlayers === 0 ? '-' : (totalBattles / playedPlayers).toFixed(1)
      return `${rate} / ${avg}`
    })
    push(`| ${MODE_LABEL[m]} | ${cells.join(' | ')} |`)
  }
  push('')

  // === 5. 流失前玩家状态（全体流失 × 付费档，不分 cohort）===
  push(`## 5. 流失前玩家状态（全体流失 × 付费档）`)
  push('')
  push(`> ⚠️ **不分 cohort 合计**：不同 cohort 入场时间、能玩玩法、观察窗口都不同，分 cohort 看玩法深度意义不大；此处聚合全体流失玩家按付费档展示`)
  push(`> **分母**：天梯/道馆/周赛/公会战都只算"玩过该玩法"的流失玩家（避免 0 稀释，反映真正达到的深度）`)
  push(`> **天梯段位映射**：rank 1-30 青铜 / 31-60 白银 / 61-90 黄金 / 91-120 钻石 / 121-150 星耀 / 151 传说`)
  push('')
  push(`| 指标 | ${TIERS.map(t => TIER_LABEL[t]).join(' | ')} |`)
  push(`|---|${TIERS.map(() => '---').join('|')}|`)
  // 流失总人数
  push(`| 流失总人数 | ${TIERS.map(t => metrics.churnStatus[t].count.toLocaleString()).join(' | ')} |`)
  // 天梯最高段位（avg rank + 段位 label）
  push(`| 天梯最高段位（avg rank / 段位） | ${TIERS.map(t => {
    const s = metrics.churnStatus[t].ladder
    if (!s.played) return '-'
    const avg = s.sumMaxRank / s.played
    return `${avg.toFixed(1)} / ${rankToTier(Math.round(avg))}`
  }).join(' | ')} |`)
  push(`| └ 玩过天梯的流失占比 | ${TIERS.map(t => {
    const s = metrics.churnStatus[t]
    return s.count ? (s.ladder.played / s.count * 100).toFixed(1) + '%' : '-'
  }).join(' | ')} |`)
  // 主线道馆最高层
  push(`| 主线道馆最高层（avg，1-500） | ${TIERS.map(t => {
    const s = metrics.churnStatus[t].gymMainline
    return s.played ? (s.sumMaxFloor / s.played).toFixed(1) : '-'
  }).join(' | ')} |`)
  push(`| └ 玩过主线道馆的流失占比 | ${TIERS.map(t => {
    const s = metrics.churnStatus[t]
    return s.count ? (s.gymMainline.played / s.count * 100).toFixed(1) + '%' : '-'
  }).join(' | ')} |`)
  // 赛季道馆最高层
  push(`| 赛季道馆最高层（avg，1-200） | ${TIERS.map(t => {
    const s = metrics.churnStatus[t].gymSeason
    return s.played ? (s.sumMaxFloor / s.played).toFixed(1) : '-'
  }).join(' | ')} |`)
  push(`| └ 玩过赛季道馆的流失占比 | ${TIERS.map(t => {
    const s = metrics.churnStatus[t]
    return s.count ? (s.gymSeason.played / s.count * 100).toFixed(1) + '%' : '-'
  }).join(' | ')} |`)
  // 周赛平均场次
  push(`| 周赛平均场次（玩过的） | ${TIERS.map(t => {
    const s = metrics.churnStatus[t].tournament
    return s.played ? (s.sumBattles / s.played).toFixed(1) : '-'
  }).join(' | ')} |`)
  push(`| └ 玩过周赛的流失占比 | ${TIERS.map(t => {
    const s = metrics.churnStatus[t]
    return s.count ? (s.tournament.played / s.count * 100).toFixed(1) + '%' : '-'
  }).join(' | ')} |`)
  // 公会战平均场次
  push(`| 公会战平均场次（玩过的） | ${TIERS.map(t => {
    const s = metrics.churnStatus[t].guildWar
    return s.played ? (s.sumBattles / s.played).toFixed(1) : '-'
  }).join(' | ')} |`)
  push(`| └ 玩过公会战的流失占比 | ${TIERS.map(t => {
    const s = metrics.churnStatus[t]
    return s.count ? (s.guildWar.played / s.count * 100).toFixed(1) + '%' : '-'
  }).join(' | ')} |`)
  push('')

  // === 5.1 每付费档随机 5 个流失角色样本 ===
  push(`### 5.1 流失角色样本（每档固定抽样 5 个，可复现）`)
  push('')
  push(`> 用 role_id hash 固定排序 + 均匀步长抽样；无玩过记录 = \`-\`；段位列: rank / 段位 label`)
  push('')
  for (const t of TIERS) {
    const samples = metrics.churnSamples[t]
    if (!samples || !samples.length) {
      push(`#### ${TIER_LABEL[t]} — 流失 ${metrics.churnStatus[t].count.toLocaleString()} 人（样本池不足）`)
      push('')
      continue
    }
    push(`#### ${TIER_LABEL[t]} — 流失 ${metrics.churnStatus[t].count.toLocaleString()} 人`)
    push('')
    push(`| role_id | 首登 | 末登 | 天梯最高段位 | 主线道馆最高层 | 赛季道馆最高层 | 周赛场次 | 公会战场次 |`)
    push(`|---|---|---|---|---|---|---|---|`)
    for (const s of samples) {
      const ladder = s.maxLadderRank > 0 ? `${s.maxLadderRank} / ${rankToTier(s.maxLadderRank)}` : '-'
      const gymM = s.maxGymMainlineFloor > 0 ? s.maxGymMainlineFloor : '-'
      const gymS = s.maxGymSeasonFloor > 0 ? s.maxGymSeasonFloor : '-'
      const tour = s.tournamentBattles > 0 ? s.tournamentBattles : '-'
      const guild = s.guildWarBattles > 0 ? s.guildWarBattles : '-'
      push(`| ${s.roleId} | ${s.firstLoginDate} | ${s.lastLoginDate} | ${ladder} | ${gymM} | ${gymS} | ${tour} | ${guild} |`)
    }
    push('')
  }

  // === 6. 事件效应 ===
  push(`## 6. 事件效应（周期玩法开放的回流冲击）`)
  push('')
  push(`> 口径：**"休眠"** = 触发日前 7 天内登录过但触发日前一天没登；**回流率** = 触发日登录数 / 休眠池`)
  push('')
  push(`| 事件 | 触发日 | 7日活跃池 | 休眠池 | 回流 | 回流率 |`)
  push(`|---|---|---|---|---|---|`)
  for (const v of Object.values(metrics.events)) {
    push(`| ${v.label} | ${v.triggerDate} | ${v.poolSize.toLocaleString()} | ${v.dormantSize.toLocaleString()} | ${v.recalledSize.toLocaleString()} | **${(v.recallRate * 100).toFixed(1)}%** |`)
  }
  push('')
  push(`---`)
  push('')
  push(`_自动生成于 ${new Date().toLocaleString('zh-CN')}_`)

  fs.writeFileSync(outPath, L.join('\n'))
  console.log(`报告写入: ${outPath}`)
}

// ---------- 主流程 ----------
;(async () => {
  const outDir = path.join(PROJECT_ROOT, 'docs/retention-analysis')

  // 快速通道：仅从现有 aggregated-metrics 重新生成报告（不重跑数据聚合）
  if (args.includes('--only-report')) {
    const metricsPath = path.join(outDir, `aggregated-metrics-${region}.json`)
    const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'))
    writeReport(metrics, path.join(outDir, `report-${region}-${LABEL}.md`))
    console.log(`\n✅ 仅重新生成报告完成`)
    process.exit(0)
  }

  const tierMap = await buildTierMap()

  console.log(`\n--- 遍历 login daily，建玩家档案 ---`)
  const players = await buildPlayerBase(tierMap)

  for (const m of MODES) {
    console.log(`\n--- 聚合 ${m} ---`)
    await aggregateMode(m, players)
  }

  console.log(`\n--- 分析 & 聚合 ---`)
  const metrics = analyze(players)

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  console.log(`\n--- 输出 ---`)
  await writeWideTable(players, path.join(outDir, `player-wide-table-${region}.csv`))
  console.log(`宽表写入: player-wide-table-${region}.csv`)

  fs.writeFileSync(
    path.join(outDir, `aggregated-metrics-${region}.json`),
    JSON.stringify(metrics, null, 2),
  )
  console.log(`聚合写入: aggregated-metrics-${region}.json`)

  writeReport(metrics, path.join(outDir, `report-${region}-${LABEL}.md`))

  console.log(`\n✅ 完成！输出目录: ${outDir}`)
})().catch(e => {
  console.error('❌ 失败:', e)
  process.exit(1)
})
