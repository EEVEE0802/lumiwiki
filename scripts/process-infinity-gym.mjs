// 处理无限道馆 CSV → JSON
// 输入: data/{region}/archive/daily/infinity-gym/{YYYY-MM-DD}.csv （按天分片）
//       data/{region}/archive/daily/assist/{YYYY-MM-DD}.csv       （助战埋点，同样按天分片）
// 输出: public/data/online/{region}/infinity-gym.json               （最终展示 JSON）
// 归档: data/{region}/archive/gym-weekly/week-{N}.json              （每周聚合结果，主线+赛季合一份）
//
// 每行 CSV = 一场道馆战斗（已合并 player_type=1/4 两条埋点）:
//   part_date | game_id_str | b_role_id | gym_uid | player_lumis | battle_result | trainer_id
//
// gym_uid 分区：
//   主线 128100001~128101000 (floor = uid - 128100000)
//   赛季 1281100001~1281100200 (floor = uid - 1281100000)
// battle_result: 1=胜 2=负
//
// —— 架构（v4 按周归档）——
// 老版本（v1~v3 单一 gym-state.json）在 CN 数据量下会 OOM，因为 teamsWon 在每层无上限累积。
// v4 改为「按周归档 + 每层每周只保留 top 200 胜利队伍」：
//   - 每周独立聚合 → 存到 gym-weekly/week-N.json（单文件 < 300MB）
//   - 冻结策略：完整跑完的过去周文件不再重写；只有「本周」和「上周（如果跨零点）」每次重新聚合
//   - 每层 teamsWon 冻结时按 battles 排序取 top 200（3 支输出槽位远够用）
//   - 最终 OUTPUT_JSON 由所有周归档 merge 而来
// 助战判定：assistBattleUidsByDate 按天分桶 + TTL 14 天，扁平快照 O(1) 查询

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'
import { parseCSVLine } from './lib/csv.mjs'
import { weekOfDate } from './week-utils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.join(__dirname, '..')

// 解析参数
const args = process.argv.slice(2)
const regionIdx = args.indexOf('--region')
const region = regionIdx !== -1 ? args[regionIdx + 1] : 'cn'
const forceRebuild = args.includes('--rebuild')  // 强制全量重算（清空周归档目录重扫）
const VALID_REGIONS = ['cn', 'overseas']
if (!VALID_REGIONS.includes(region)) {
  console.error(`未知 --region: ${region}（仅支持 ${VALID_REGIONS.join(' / ')}）`)
  process.exit(1)
}

const INPUT_DIR = path.join(PROJECT_ROOT, `data/${region}/archive/daily/infinity-gym`)
const ASSIST_DIR = path.join(PROJECT_ROOT, `data/${region}/archive/daily/assist`)
const WEEKLY_DIR = path.join(PROJECT_ROOT, `data/${region}/archive/gym-weekly`)
const OUTPUT_JSON = path.join(PROJECT_ROOT, `public/data/online/${region}/infinity-gym.json`)
// 老单文件（v1~v3），首次跑 v4 时如果发现存在就清理掉（避免占磁盘）
const LEGACY_STATE_JSON = path.join(PROJECT_ROOT, `data/${region}/archive/gym-state.json`)

// 冻结阈值：只把 date < today - FREEZE_DELAY_DAYS 的日子当作"稳定的"（属于已冻结周）
// 剩下的每次重扫。取 2 天 = 给数数分区延迟留余量（同一天的战斗可能在次日凌晨才写入分区）
const FREEZE_DELAY_DAYS = 2

// assist 桶 TTL：超过该天数的桶淘汰（assist 只用来判定"本周 gym 是否用了助战"）
const ASSIST_TTL_DAYS = 14

// 每层每周保留 top N 胜利队伍（冻结时按 battles + latestGameId 排序取前 N）
// 前端 topTeams 最终只输出 3 支，200 是很宽松的边界
const MAX_TEAMS_PER_FLOOR_PER_WEEK = 200

// 全局噜咪出场率输出 top N
const GLOBAL_LUMI_TOP_N = 300

// 分区定义：主线 / 赛季
const ZONES = [
  { key: 'mainline', base: 128100000, min: 128100001, max: 128101000 },
  { key: 'season',   base: 1281100000, min: 1281100001, max: 1281100200 },
]
function zoneOfUid(uid) {
  for (const z of ZONES) if (uid >= z.min && uid <= z.max) return z
  return null
}

// ==========================================
// 加载 robot-teams / Lumi / 多语言
// ==========================================
console.log('加载 robot-teams / Lumi / 多语言...')
const robotTeamsPath = path.join(PROJECT_ROOT, 'public/data/robot-teams.json')
const robotTeams = JSON.parse(fs.readFileSync(robotTeamsPath, 'utf-8'))
const gymCfg = Array.isArray(robotTeams.infinityGym)
  ? { mainline: robotTeams.infinityGym, season: [] }
  : (robotTeams.infinityGym || { mainline: [], season: [] })
const npcTeamByZone = {
  mainline: new Map((gymCfg.mainline || []).map(t => [t.floor, t])),
  season: new Map((gymCfg.season || []).map(t => [t.floor, t])),
}
if (npcTeamByZone.mainline.size === 0 && npcTeamByZone.season.size === 0) {
  console.warn('⚠️ robot-teams.json 里未找到 infinityGym 数据；请先跑 process-robot-teams.js')
}

const lumiPath = path.join(PROJECT_ROOT, 'public/data/Lumi.json')
const lumiData = JSON.parse(fs.readFileSync(lumiPath, 'utf-8'))
const lumiById = new Map(lumiData.map(l => [l.Id, l]))

const zhPath = path.join(PROJECT_ROOT, 'public/data/zh-CN.json')
const zhMap = fs.existsSync(zhPath) ? JSON.parse(fs.readFileSync(zhPath, 'utf-8')) : {}
const lumiNameOf = lumiId => {
  const lumi = lumiById.get(Number(lumiId))
  if (!lumi) return String(lumiId)
  return zhMap[lumi.Name] || lumi.Name || String(lumiId)
}

function buildNpcTeam(zoneKey, floor) {
  const t = npcTeamByZone[zoneKey]?.get(floor)
  if (!t) return []
  return (t.lumis || []).map(l => ({
    lumiId: String(l.lumiId),
    lumiName: lumiNameOf(l.lumiId),
    level: l.level,
    breakthrough: l.breakthrough,
    score: l.score,
  }))
}

// ==========================================
// CSV 流式读取
// ==========================================
async function processCsvStream(csvPath, onRow) {
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV 不存在: ${csvPath}`)
    return { total: 0 }
  }
  const rl = readline.createInterface({ input: fs.createReadStream(csvPath), crlfDelay: Infinity })
  let headers = null
  let total = 0
  for await (const line of rl) {
    if (!line.trim()) continue
    const vals = parseCSVLine(line)
    if (!headers) {
      headers = vals.map(h => h.replace(/^﻿/, '').trim())
      continue
    }
    const obj = {}
    headers.forEach((h, i) => obj[h] = vals[i])
    onRow(obj)
    total++
    if (total % 500000 === 0) console.log(`  已处理 ${total.toLocaleString('en-US')} 行...`)
  }
  return { total }
}

// 从文件名解析日期：daily/infinity-gym/2026-08-24.csv → '2026-08-24'
function dateOfCsvPath(p) {
  const m = path.basename(p).match(/^(\d{4}-\d{2}-\d{2})\.csv$/)
  return m ? m[1] : null
}

// 列出目录里所有 CSV 按日期排序
function listDailyCsvs(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.csv$/.test(f))
    .sort()
    .map(f => path.join(dir, f))
}

// 计算"冻结截止日"（含）
function freezeCutoff() {
  const d = new Date()
  d.setDate(d.getDate() - FREEZE_DELAY_DAYS)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ==========================================
// 周状态（单周聚合）
//
// 结构：
//   {
//     week, dates: [date, ...],
//     zones: {
//       mainline/season: {
//         totalBattles, assistBattles, uniqueChallengers:Set<roleId>,
//         playerMaxFloor:Map<roleId, floor>,
//         floors: Map<floor, {
//           totalBattles, wins, loses, assistBattles,
//           uniqueClearers:Set, uniqueChallengers:Set,
//           teamsWon: Map<teamKey, teamStats>
//         }>
//       }
//     },
//     globalLumiCount: Map<lumiId, count>,   // 全区共享（跨主线赛季）
//   }
// ==========================================
function createEmptyWeek(week) {
  return {
    week,
    dates: [],
    zones: {
      mainline: createEmptyZone(),
      season: createEmptyZone(),
    },
    globalLumiCount: new Map(),
  }
}
function createEmptyZone() {
  return {
    totalBattles: 0,
    assistBattles: 0,
    uniqueChallengers: new Set(),
    playerMaxFloor: new Map(),
    floors: new Map(),
  }
}

// 累加一行 gym CSV 到某周的 state；needsAssist 是 assistBattleUidsFlat（Set）
function accumulateGymRow(weekState, row, assistBattleUidsFlat) {
  const gymUid = parseInt(row.gym_uid)
  if (!Number.isFinite(gymUid)) return
  const zone = zoneOfUid(gymUid)
  if (!zone) return

  const z = weekState.zones[zone.key]
  const floor = gymUid - zone.base
  const roleId = row.b_role_id
  const isWin = parseInt(row.battle_result) === 1
  const isAssist = assistBattleUidsFlat.has(row.game_id_str)

  if (!z.floors.has(floor)) {
    z.floors.set(floor, {
      totalBattles: 0,
      wins: 0,
      loses: 0,
      assistBattles: 0,
      uniqueClearers: new Set(),
      uniqueChallengers: new Set(),
      teamsWon: new Map(),
    })
  }
  const f = z.floors.get(floor)
  f.totalBattles++
  f.uniqueChallengers.add(roleId)
  if (isAssist) {
    f.assistBattles++
    z.assistBattles++
  }
  if (isWin) {
    f.wins++
    f.uniqueClearers.add(roleId)
  } else {
    f.loses++
  }
  z.uniqueChallengers.add(roleId)
  z.totalBattles++

  const cur = z.playerMaxFloor.get(roleId) || 0
  if (floor > cur) z.playerMaxFloor.set(roleId, floor)

  // 解析玩家阵容
  let lumis = []
  try {
    lumis = JSON.parse(row.player_lumis.replace(/""/g, '"'))
  } catch {
    return
  }
  if (lumis.length === 0) return
  lumis.sort((a, b) => String(a.lumi_id).localeCompare(String(b.lumi_id)))

  // 全局出场率（所有场次，不限胜负，全区共享）
  lumis.forEach(l => {
    const id = String(l.lumi_id)
    weekState.globalLumiCount.set(id, (weekState.globalLumiCount.get(id) || 0) + 1)
  })

  // 每层胜利队伍（口径 1：只有胜场入选）
  if (!isWin) return
  const teamKey = lumis.map(l => l.lumi_id).sort().join('-')
  if (!f.teamsWon.has(teamKey)) {
    f.teamsWon.set(teamKey, {
      teamLumiIds: lumis.map(l => l.lumi_id),
      lumis: lumis.map(l => ({
        lumiId: l.lumi_id,
        lumiName: l.lumi_name,
        level: parseInt(l.lumi_level) || 0,
        secondSkills: new Map(),
      })),
      trainerSkills: new Map(),
      battles: 0,
      latestGameId: 0n,
    })
  }
  const team = f.teamsWon.get(teamKey)
  team.battles++
  try {
    const gid = BigInt(row.game_id_str)
    if (gid > team.latestGameId) {
      team.latestGameId = gid
      lumis.forEach((l, idx) => {
        team.lumis[idx].level = parseInt(l.lumi_level) || 0
      })
    }
  } catch { /* game_id_str 非数字，跳过 */ }
  lumis.forEach((l, idx) => {
    const skillId = parseInt(l.lumi_secondskill)
    if (!Number.isNaN(skillId)) {
      const map = team.lumis[idx].secondSkills
      map.set(skillId, (map.get(skillId) || 0) + 1)
    }
  })
  const trainerId = parseInt(row.trainer_id)
  const tid = !Number.isNaN(trainerId) ? trainerId : 0
  team.trainerSkills.set(tid, (team.trainerSkills.get(tid) || 0) + 1)
}

// ==========================================
// 冻结一个周 state（把每层的 teamsWon 裁到 top N）
// 冻结完的 zone 只保留 MAX_TEAMS_PER_FLOOR_PER_WEEK 支胜利队伍，其他丢弃
// 排序：battles DESC → latestGameId DESC（最近使用的优先保）
// ==========================================
function trimWeekTopN(weekState) {
  for (const zoneKey of ['mainline', 'season']) {
    const z = weekState.zones[zoneKey]
    for (const [, f] of z.floors) {
      if (f.teamsWon.size <= MAX_TEAMS_PER_FLOOR_PER_WEEK) continue
      const arr = [...f.teamsWon]
      arr.sort((a, b) => {
        if (a[1].battles !== b[1].battles) return b[1].battles - a[1].battles
        if (a[1].latestGameId < b[1].latestGameId) return 1
        if (a[1].latestGameId > b[1].latestGameId) return -1
        return 0
      })
      f.teamsWon = new Map(arr.slice(0, MAX_TEAMS_PER_FLOOR_PER_WEEK))
    }
  }
}

// ==========================================
// 序列化周 state → JSON（流式写，避开 V8 单字符串 512MB 上限）
// ==========================================
async function saveWeekState(weekState) {
  const outPath = path.join(WEEKLY_DIR, `week-${weekState.week}.json`)
  fs.mkdirSync(WEEKLY_DIR, { recursive: true })
  const out = fs.createWriteStream(outPath, { encoding: 'utf-8' })
  const write = str => new Promise((resolve, reject) => {
    if (out.write(str)) resolve()
    else out.once('drain', resolve)
    out.once('error', reject)
  })

  await write('{')
  await write('"version":4')
  await write(`,"week":${weekState.week}`)
  await write(`,"dates":${JSON.stringify(weekState.dates)}`)
  await write(`,"globalLumiCount":${JSON.stringify([...weekState.globalLumiCount])}`)
  await write(',"zones":{')
  await writeZoneWeekly('mainline', weekState.zones.mainline, write)
  await write(',')
  await writeZoneWeekly('season', weekState.zones.season, write)
  await write('}}')
  await new Promise(res => out.end(res))
  const size = fs.statSync(outPath).size
  console.log(`  💾 week-${weekState.week}.json 已保存 (${(size / 1024 / 1024).toFixed(1)} MB)`)
}

async function writeZoneWeekly(key, z, write) {
  await write(JSON.stringify(key) + ':{')
  await write(`"totalBattles":${z.totalBattles}`)
  await write(`,"assistBattles":${z.assistBattles}`)
  await write(`,"uniqueChallengers":${JSON.stringify([...z.uniqueChallengers])}`)
  await write(`,"playerMaxFloor":${JSON.stringify([...z.playerMaxFloor])}`)
  await write(',"floors":[')
  let first = true
  for (const [floor, f] of z.floors) {
    if (!first) await write(',')
    first = false
    const floorObj = {
      totalBattles: f.totalBattles,
      wins: f.wins,
      loses: f.loses,
      assistBattles: f.assistBattles,
      uniqueClearers: [...f.uniqueClearers],
      uniqueChallengers: [...f.uniqueChallengers],
      teamsWon: [...f.teamsWon].map(([tk, t]) => [tk, {
        teamLumiIds: t.teamLumiIds,
        lumis: t.lumis.map(l => ({
          lumiId: l.lumiId,
          lumiName: l.lumiName,
          level: l.level || 0,
          secondSkills: [...l.secondSkills],
        })),
        trainerSkills: [...t.trainerSkills],
        battles: t.battles,
        latestGameId: t.latestGameId.toString(),
      }]),
    }
    await write(`[${floor},${JSON.stringify(floorObj)}]`)
  }
  await write(']}')
}

// ==========================================
// 加载周归档 → weekState（JSON.parse；单周 < 300MB 安全）
// ==========================================
function loadWeekState(week) {
  const filePath = path.join(WEEKLY_DIR, `week-${week}.json`)
  if (!fs.existsSync(filePath)) return null
  try {
    const obj = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    if ((obj.version || 1) < 4) return null
    const ws = createEmptyWeek(obj.week)
    ws.dates = obj.dates || []
    ws.globalLumiCount = new Map(obj.globalLumiCount || [])
    for (const zoneKey of ['mainline', 'season']) {
      const zObj = obj.zones?.[zoneKey] || {}
      const z = ws.zones[zoneKey]
      z.totalBattles = zObj.totalBattles || 0
      z.assistBattles = zObj.assistBattles || 0
      z.uniqueChallengers = new Set(zObj.uniqueChallengers || [])
      z.playerMaxFloor = new Map(zObj.playerMaxFloor || [])
      for (const [floor, f] of zObj.floors || []) {
        const teams = new Map()
        for (const [tk, t] of f.teamsWon || []) {
          teams.set(tk, {
            teamLumiIds: t.teamLumiIds,
            lumis: t.lumis.map(l => ({
              lumiId: l.lumiId,
              lumiName: l.lumiName,
              level: l.level || 0,
              secondSkills: new Map(l.secondSkills || []),
            })),
            trainerSkills: new Map(t.trainerSkills || []),
            battles: t.battles,
            latestGameId: BigInt(t.latestGameId || '0'),
          })
        }
        z.floors.set(floor, {
          totalBattles: f.totalBattles,
          wins: f.wins,
          loses: f.loses,
          assistBattles: f.assistBattles,
          uniqueClearers: new Set(f.uniqueClearers || []),
          uniqueChallengers: new Set(f.uniqueChallengers || []),
          teamsWon: teams,
        })
      }
    }
    return ws
  } catch (e) {
    console.warn(`⚠️ 加载 week-${week}.json 失败（将重建该周）: ${e.message}`)
    return null
  }
}

// ==========================================
// 合并所有周归档 → 最终 OUTPUT_JSON 结构
// 语义合并：
//   floors[floor].totalBattles/wins/loses/assistBattles = 各周直接相加
//   floors[floor].uniqueChallengers/uniqueClearers = 各周 Set 并集（跨周同玩家去重）
//   floors[floor].teamsWon = 跨周同 teamKey 合并 (battles 相加 / latestGameId 取 max /
//     secondSkills+trainerSkills 计数累加 / level 取最新 latestGameId 对应值)，
//     合并后按 battles 排序取 top 200
//   playerMaxFloor = 跨周同玩家取 max
//   globalLumiCount = 跨周累加
// ==========================================
function mergeWeeksIntoZone(weeks, zoneKey) {
  const merged = {
    totalBattles: 0,
    assistBattles: 0,
    uniqueChallengers: new Set(),
    playerMaxFloor: new Map(),
    floors: new Map(),
  }
  for (const ws of weeks) {
    const z = ws.zones[zoneKey]
    merged.totalBattles += z.totalBattles
    merged.assistBattles += z.assistBattles
    for (const rid of z.uniqueChallengers) merged.uniqueChallengers.add(rid)
    for (const [rid, mf] of z.playerMaxFloor) {
      const cur = merged.playerMaxFloor.get(rid) || 0
      if (mf > cur) merged.playerMaxFloor.set(rid, mf)
    }
    for (const [floor, f] of z.floors) {
      if (!merged.floors.has(floor)) {
        merged.floors.set(floor, {
          totalBattles: 0,
          wins: 0,
          loses: 0,
          assistBattles: 0,
          uniqueClearers: new Set(),
          uniqueChallengers: new Set(),
          teamsWon: new Map(),
        })
      }
      const mf = merged.floors.get(floor)
      mf.totalBattles += f.totalBattles
      mf.wins += f.wins
      mf.loses += f.loses
      mf.assistBattles += f.assistBattles
      for (const rid of f.uniqueClearers) mf.uniqueClearers.add(rid)
      for (const rid of f.uniqueChallengers) mf.uniqueChallengers.add(rid)
      for (const [tk, t] of f.teamsWon) {
        if (!mf.teamsWon.has(tk)) {
          mf.teamsWon.set(tk, {
            teamLumiIds: t.teamLumiIds,
            lumis: t.lumis.map(l => ({
              lumiId: l.lumiId,
              lumiName: l.lumiName,
              level: l.level || 0,
              secondSkills: new Map(l.secondSkills),
            })),
            trainerSkills: new Map(t.trainerSkills),
            battles: 0,
            latestGameId: 0n,
          })
        }
        const mt = mf.teamsWon.get(tk)
        mt.battles += t.battles
        // latestGameId 取 max；对应的 level 也跟着更新
        if (t.latestGameId > mt.latestGameId) {
          mt.latestGameId = t.latestGameId
          t.lumis.forEach((l, idx) => { mt.lumis[idx].level = l.level })
        }
        // secondSkills / trainerSkills 计数累加
        for (const [sid, cnt] of t.trainerSkills) {
          mt.trainerSkills.set(sid, (mt.trainerSkills.get(sid) || 0) + cnt)
        }
        t.lumis.forEach((l, idx) => {
          const target = mt.lumis[idx].secondSkills
          for (const [sid, cnt] of l.secondSkills) {
            target.set(sid, (target.get(sid) || 0) + cnt)
          }
        })
      }
    }
  }
  // 合并后每层再次裁到 top N（跨周合起来可能再次超过 200，虽然极少见）
  for (const [, f] of merged.floors) {
    if (f.teamsWon.size <= MAX_TEAMS_PER_FLOOR_PER_WEEK) continue
    const arr = [...f.teamsWon]
    arr.sort((a, b) => {
      if (a[1].battles !== b[1].battles) return b[1].battles - a[1].battles
      if (a[1].latestGameId < b[1].latestGameId) return 1
      if (a[1].latestGameId > b[1].latestGameId) return -1
      return 0
    })
    f.teamsWon = new Map(arr.slice(0, MAX_TEAMS_PER_FLOOR_PER_WEEK))
  }
  return merged
}

// ==========================================
// 主处理
// ==========================================
async function main() {
  console.log(`\n===== 无限道馆数据处理 v4 (${region}) =====`)

  // 清理老 v1~v3 单文件 state
  if (fs.existsSync(LEGACY_STATE_JSON)) {
    const legacyMB = (fs.statSync(LEGACY_STATE_JSON).size / 1024 / 1024).toFixed(1)
    fs.unlinkSync(LEGACY_STATE_JSON)
    console.log(`🧹 清理老 v1~v3 state 文件（${legacyMB} MB）`)
  }

  // --rebuild：清空周归档目录
  if (forceRebuild && fs.existsSync(WEEKLY_DIR)) {
    for (const f of fs.readdirSync(WEEKLY_DIR)) {
      if (/^week-\d+\.json$/.test(f)) fs.unlinkSync(path.join(WEEKLY_DIR, f))
    }
    console.log(`🧹 --rebuild：清空 ${WEEKLY_DIR}`)
  }

  const gymCsvs = listDailyCsvs(INPUT_DIR)
  const assistCsvs = listDailyCsvs(ASSIST_DIR)
  console.log(`输入: ${gymCsvs.length} 天 gym CSV / ${assistCsvs.length} 天 assist CSV`)
  if (gymCsvs.length === 0) {
    console.error(`❌ ${INPUT_DIR} 下未找到任何 daily CSV，退出`)
    process.exit(1)
  }

  // ---- 第 1 步：加载 assist 桶（按天分桶 + TTL） ----
  // 每次都全量重扫 assist（因为 assist 桶是短命的，14 天 TTL 内的桶都要在内存里）
  console.log('\n🔄 加载 assist 桶...')
  const assistBattleUidsByDate = new Map()  // date -> Set<uid>
  const assistBattleUidsFlat = new Set()
  const pad = n => String(n).padStart(2, '0')
  const ttlCutoff = new Date()
  ttlCutoff.setDate(ttlCutoff.getDate() - ASSIST_TTL_DAYS)
  const ttlDate = `${ttlCutoff.getFullYear()}-${pad(ttlCutoff.getMonth() + 1)}-${pad(ttlCutoff.getDate())}`
  for (const csvPath of assistCsvs) {
    const d = dateOfCsvPath(csvPath)
    if (!d || d < ttlDate) continue  // TTL 之外的 assist 不加载
    const set = new Set()
    await processCsvStream(csvPath, (row) => {
      const uid = row.battle_uid
      if (uid) { set.add(uid); assistBattleUidsFlat.add(uid) }
    })
    assistBattleUidsByDate.set(d, set)
  }
  console.log(`  已加载 ${assistBattleUidsByDate.size} 天 assist 桶 / ${assistBattleUidsFlat.size.toLocaleString('en-US')} 个独立 uid`)

  // ---- 第 2 步：按周分组 gym CSV ----
  const gymCsvsByWeek = new Map()  // week -> [csvPath, ...]
  for (const csvPath of gymCsvs) {
    const d = dateOfCsvPath(csvPath)
    if (!d) continue
    const w = weekOfDate(d)
    if (w < 1) continue  // 上线前的 CSV 跳过
    if (!gymCsvsByWeek.has(w)) gymCsvsByWeek.set(w, [])
    gymCsvsByWeek.get(w).push({ csvPath, date: d })
  }
  const weeks = [...gymCsvsByWeek.keys()].sort((a, b) => a - b)
  console.log(`\n📅 涉及周: ${weeks.join(', ')}`)

  // ---- 第 3 步：判断哪些周需要重扫，哪些直接读归档 ----
  // 冻结策略：如果 week-N.json 存在 && 该周所有天 date < freezeCutoff → 直接读归档
  // 否则重扫该周所有 daily CSV（覆盖式写归档）
  const cutoff = freezeCutoff()
  const allWeekStates = []
  for (const w of weeks) {
    const wDates = gymCsvsByWeek.get(w).map(x => x.date)
    const maxDate = wDates[wDates.length - 1]
    const archivePath = path.join(WEEKLY_DIR, `week-${w}.json`)
    const archiveExists = fs.existsSync(archivePath)

    // 该周是否"完整过去" —— 所有天都 <= cutoff → 可从归档读
    const isFullyFrozen = maxDate <= cutoff

    if (archiveExists && isFullyFrozen) {
      console.log(`\n📖 week-${w}: 读归档（${wDates.length} 天，date <= ${cutoff}，冻结）`)
      const ws = loadWeekState(w)
      if (ws) {
        allWeekStates.push(ws)
        continue
      }
      console.warn(`   归档读取失败，改重扫`)
    }

    // 重扫该周
    console.log(`\n🔄 week-${w}: 重扫 ${wDates.length} 天（${wDates[0]} ~ ${maxDate}）`)
    const ws = createEmptyWeek(w)
    ws.dates = wDates
    for (const { csvPath } of gymCsvsByWeek.get(w)) {
      await processCsvStream(csvPath, (row) => accumulateGymRow(ws, row, assistBattleUidsFlat))
    }
    // 冻结阶段裁掉每层的 top N 外队伍
    trimWeekTopN(ws)
    // 冻结的周才写盘归档（本周还在增长的不写，避免"周中断" state 上盘）
    if (isFullyFrozen) {
      await saveWeekState(ws)
    } else {
      // 当前进行周：暂存到内存，最后 merge 时也用；同时写"临时归档"允许下次跑增量读
      // 但因为随时会变，还是写盘保存一份最新（保证有中断恢复能力）
      await saveWeekState(ws)
    }
    allWeekStates.push(ws)
  }

  // ---- 第 4 步：合并所有周 → 最终输出 ----
  console.log(`\n🔗 合并 ${allWeekStates.length} 周...`)
  const mainline = mergeWeeksIntoZone(allWeekStates, 'mainline')
  const season = mergeWeeksIntoZone(allWeekStates, 'season')

  // 全局噜咪出场率（跨周累加）
  const globalLumiCount = new Map()
  for (const ws of allWeekStates) {
    for (const [id, cnt] of ws.globalLumiCount) {
      globalLumiCount.set(id, (globalLumiCount.get(id) || 0) + cnt)
    }
  }

  const totalBattlesAll = mainline.totalBattles + season.totalBattles
  const assistBattlesAll = mainline.assistBattles + season.assistBattles
  const uniqueChallengersAll = new Set([...mainline.uniqueChallengers, ...season.uniqueChallengers])
  console.log(`  总场次: ${totalBattlesAll} (主线 ${mainline.totalBattles} + 赛季 ${season.totalBattles})`)
  console.log(`  独立玩家数（跨区去重）: ${uniqueChallengersAll.size}`)
  console.log(`  覆盖层数: 主线 ${mainline.floors.size} / 赛季 ${season.floors.size}`)

  // 构造分区输出
  const buildZoneOutput = (zoneKey, merged) => {
    const floorsOutput = [...merged.floors.entries()]
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([floor, f]) => {
        const uniqueClearers = f.uniqueClearers.size
        const avgAttempts = uniqueClearers > 0 ? +(f.totalBattles / uniqueClearers).toFixed(2) : 0

        const allTeams = [...f.teamsWon.values()]
        const byBattles = [...allTeams].sort((a, b) => b.battles - a.battles)
        const byRecent = [...allTeams].sort((a, b) => {
          if (a.latestGameId < b.latestGameId) return 1
          if (a.latestGameId > b.latestGameId) return -1
          return 0
        })
        const recent = byRecent[0] || null
        const popular = byBattles[0] || null
        const other = byBattles.find(t => t !== recent && t !== popular) || popular || null

        const serializeTeam = (t, kind) => ({
          kind,
          teamLumiIds: t.teamLumiIds,
          lumis: t.lumis.map(l => ({
            lumiId: l.lumiId,
            lumiName: l.lumiName,
            level: l.level || 0,
            secondSkills: [...l.secondSkills.entries()]
              .map(([skillId, count]) => ({ skillId, count }))
              .sort((a, b) => b.count - a.count)
          })),
          trainerSkills: [...t.trainerSkills.entries()]
            .map(([trainerId, count]) => ({ trainerId, count }))
            .sort((a, b) => b.count - a.count),
          battles: t.battles,
          winRate: '100.00',
        })

        const teams = [
          { key: 'recent', team: recent },
          { key: 'popular', team: popular },
          { key: 'other', team: other },
        ].filter(s => s.team).map(s => serializeTeam(s.team, s.key))

        return {
          floor: Number(floor),
          totalBattles: f.totalBattles,
          wins: f.wins,
          loses: f.loses,
          assistBattles: f.assistBattles,
          winRate: f.totalBattles > 0 ? +(f.wins / f.totalBattles * 100).toFixed(2) : 0,
          assistRate: f.totalBattles > 0 ? +(f.assistBattles / f.totalBattles * 100).toFixed(2) : 0,
          uniqueChallengers: f.uniqueChallengers.size,
          uniqueClearers,
          avgAttempts,
          npcTeam: buildNpcTeam(zoneKey, Number(floor)),
          topTeams: teams,
        }
      })

    const maxFloorDist = {}
    for (const [, mf] of merged.playerMaxFloor) {
      maxFloorDist[mf] = (maxFloorDist[mf] || 0) + 1
    }

    return {
      totalChallengers: merged.uniqueChallengers.size,
      totalBattles: merged.totalBattles,
      assistBattles: merged.assistBattles,
      assistRate: merged.totalBattles > 0 ? +(merged.assistBattles / merged.totalBattles * 100).toFixed(2) : 0,
      maxFloorDistribution: maxFloorDist,
      floors: floorsOutput,
    }
  }

  const globalLumiUsage = [...globalLumiCount.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, GLOBAL_LUMI_TOP_N)
    .map(([lumiId, count]) => ({
      lumiId,
      lumiName: lumiNameOf(Number(lumiId)),
      battles: count,
      appearanceRate: totalBattlesAll > 0 ? +(count / totalBattlesAll * 100).toFixed(2) : 0
    }))

  const output = {
    updateTime: new Date().toISOString(),
    region,
    totalChallengers: uniqueChallengersAll.size,
    totalBattles: totalBattlesAll,
    assistBattles: assistBattlesAll,
    assistRate: totalBattlesAll > 0 ? +(assistBattlesAll / totalBattlesAll * 100).toFixed(2) : 0,
    globalLumiUsage,
    mainline: buildZoneOutput('mainline', mainline),
    season: buildZoneOutput('season', season),
  }

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true })
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2), 'utf-8')
  const size = fs.statSync(OUTPUT_JSON).size
  console.log(`\n✓ 输出: ${OUTPUT_JSON} (${(size / 1024).toFixed(1)} KB)`)
  console.log(`  主线层数: ${output.mainline.floors.length}, 赛季层数: ${output.season.floors.length}, 全局噜咪: ${globalLumiUsage.length}`)
}

main().catch(e => {
  console.error(`\n❌ ${e.message}`)
  console.error(e.stack)
  process.exit(1)
})
