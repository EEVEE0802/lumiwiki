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
          tier: tierMap.get(r) || 'nonPayer',
          firstLoginDate: partDate,
          lastLoginDate: partDate,
          loginDays: new Set([partDate]),
          modes: Object.fromEntries(MODES.map(m => [m, {
            battles: 0,
            firstDay: null,
            daily: new Int32Array(ALL_DATES.length), // 每日场次（按 ALL_DATES 索引）
          }])),
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

  // === 4. 流失玩家流失前日均场次（L-0 ~ L-6）===
  //   分母 = 该偏移天 >= firstLoginDate 的流失玩家数（避免"还没入场"的日子被当 0）
  //   分子 = 该偏移天四玩法总场次
  const OFFSETS = ['L-0', 'L-1', 'L-2', 'L-3', 'L-4', 'L-5', 'L-6']
  const churnBehavior = {}
  for (const c of COHORTS) {
    churnBehavior[c] = {}
    for (const t of TIERS) {
      const subset = valid.filter(p => p.cohort === c && p.tier === t && p.isChurn)
      if (!subset.length) { churnBehavior[c][t] = null; continue }

      const sumBattles = Object.fromEntries(OFFSETS.map(k => [k, 0]))
      const sumByMode = Object.fromEntries(OFFSETS.map(k => [k, Object.fromEntries(MODES.map(m => [m, 0]))]))
      const observable = Object.fromEntries(OFFSETS.map(k => [k, 0]))

      for (const p of subset) {
        const lastIdx = DATE_TO_IDX.get(p.lastLoginDate)
        if (lastIdx === undefined) continue
        for (let i = 0; i <= 6; i++) {
          const d = addDays(p.lastLoginDate, -i)
          if (d < p.firstLoginDate || d < LAUNCH) continue
          const idx = lastIdx - i
          if (idx < 0) continue
          observable[`L-${i}`]++
          let dayTotal = 0
          for (const m of MODES) {
            const n = p.modes[m].daily[idx]
            dayTotal += n
            sumByMode[`L-${i}`][m] += n
          }
          sumBattles[`L-${i}`] += dayTotal
        }
      }

      churnBehavior[c][t] = {
        count: subset.length,
        avgBattlesByOffset: Object.fromEntries(
          OFFSETS.map(k => [k, observable[k] ? sumBattles[k] / observable[k] : null])
        ),
        avgBattlesByOffsetByMode: Object.fromEntries(
          OFFSETS.map(k => [k, Object.fromEntries(
            MODES.map(m => [m, observable[k] ? sumByMode[k][m] / observable[k] : null])
          )])
        ),
      }
    }
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

  return { cohortTierCount, retention, participation, churnBehavior, churnDateDist, events }
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

  // === 5. 流失前每日场次 ===
  push(`## 5. 流失前每日场次（流失玩家末登日前 N 天的平均日场次，四玩法合计）`)
  push('')
  push(`> 分母 = 该偏移天 ≥ 首登日 的流失玩家数（避免"还没入场"的日子被当 0 稀释）；L-0 = 末登日`)
  push('')
  const OFFSETS_R = ['L-0', 'L-1', 'L-2', 'L-3', 'L-4', 'L-5', 'L-6']
  for (const c of COHORTS) {
    push(`### Cohort ${c} — 日均总场次`)
    push('')
    push(`| Tier | 流失人数 | ${OFFSETS_R.join(' | ')} |`)
    push(`|---|---|${OFFSETS_R.map(() => '---').join('|')}|`)
    for (const t of TIERS) {
      const b = metrics.churnBehavior[c][t]
      if (!b) { push(`| ${TIER_LABEL[t]} | 0 | ${OFFSETS_R.map(() => '-').join(' | ')} |`); continue }
      const vals = OFFSETS_R.map(k => {
        const v = b.avgBattlesByOffset[k]
        return v == null ? '-' : v.toFixed(1)
      })
      push(`| ${TIER_LABEL[t]} | ${b.count.toLocaleString()} | ${vals.join(' | ')} |`)
    }
    push('')
  }

  // 流失前按玩法拆分（全开 Cohort × Tier × 玩法）
  push(`### 5.1 流失前日均场次 — 按玩法拆分（全部 Cohort × Tier）`)
  push('')
  push(`> 每张小表 = 1 个 (Cohort, Tier) 组合；行 = 4 个玩法；列 = L-0 ~ L-6`)
  push('')
  for (const c of COHORTS) {
    for (const t of TIERS) {
      const b = metrics.churnBehavior[c][t]
      if (!b) { push(`#### Cohort ${c} / ${TIER_LABEL[t]} — 流失 0 人（无数据）`); push(''); continue }
      push(`#### Cohort ${c} / ${TIER_LABEL[t]} — 流失 ${b.count.toLocaleString()} 人`)
      push('')
      push(`| 玩法 | ${OFFSETS_R.join(' | ')} |`)
      push(`|---|${OFFSETS_R.map(() => '---').join('|')}|`)
      for (const m of MODES) {
        const row = [MODE_LABEL[m]]
        for (const k of OFFSETS_R) {
          const v = b.avgBattlesByOffsetByMode[k][m]
          row.push(v == null ? '-' : v.toFixed(1))
        }
        push(`| ${row.join(' | ')} |`)
      }
      push('')
    }
  }

  // 5.2 按玩法拆的占比
  push(`### 5.2 流失前日均场次 — 按玩法占比（%）`)
  push('')
  push(`> 占比 = 该玩法场次 / 当天四玩法总场次 × 100%；突出结构性变化（例如"末日公会战占比飙升"）`)
  push('')
  for (const c of COHORTS) {
    for (const t of TIERS) {
      const b = metrics.churnBehavior[c][t]
      if (!b) continue
      push(`#### Cohort ${c} / ${TIER_LABEL[t]}`)
      push('')
      push(`| 玩法 | ${OFFSETS_R.join(' | ')} |`)
      push(`|---|${OFFSETS_R.map(() => '---').join('|')}|`)
      // 先算每个偏移天的总和
      const dayTotal = {}
      for (const k of OFFSETS_R) {
        dayTotal[k] = MODES.reduce((s, m) => s + (b.avgBattlesByOffsetByMode[k][m] || 0), 0)
      }
      for (const m of MODES) {
        const row = [MODE_LABEL[m]]
        for (const k of OFFSETS_R) {
          const v = b.avgBattlesByOffsetByMode[k][m]
          if (v == null || dayTotal[k] === 0) { row.push('-'); continue }
          row.push((v / dayTotal[k] * 100).toFixed(1) + '%')
        }
        push(`| ${row.join(' | ')} |`)
      }
      push('')
    }
  }

  // 5.3 末登日分布
  push(`### 5.3 流失玩家末登日分布（流失发生在哪天）`)
  push('')
  push(`> 看流失是否集中在某些关键日（如公会战首开 9/30、周赛日等）`)
  push('')
  const allDatesForChurn = ALL_DATES.filter(d => d <= CUTOFF)
  for (const c of COHORTS) {
    push(`#### Cohort ${c}`)
    push('')
    push(`| 末登日 | ${TIERS.map(t => TIER_LABEL[t]).join(' | ')} | 合计 |`)
    push(`|---|${TIERS.map(() => '---').join('|')}|---|`)
    for (const d of allDatesForChurn) {
      const cells = TIERS.map(t => {
        const dist = metrics.churnDateDist[c][t]
        return (dist.byDate[d] || 0).toLocaleString()
      })
      const sum = TIERS.reduce((s, t) => s + (metrics.churnDateDist[c][t].byDate[d] || 0), 0)
      if (sum === 0) continue // 跳过零行
      push(`| ${d} | ${cells.join(' | ')} | **${sum.toLocaleString()}** |`)
    }
    const totals = TIERS.map(t => metrics.churnDateDist[c][t].count)
    push(`| **合计** | ${totals.map(n => `**${n.toLocaleString()}**`).join(' | ')} | **${totals.reduce((a, b) => a + b, 0).toLocaleString()}** |`)
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
