// 处理无限道馆 CSV → JSON
// 输入: data/{region}/archive/daily/infinity-gym/{YYYY-MM-DD}.csv (按天分片，累计遍历目录)
//       data/{region}/archive/daily/assist/{YYYY-MM-DD}.csv       (助战埋点，同样按天分片)
// 输出: public/data/online/{region}/infinity-gym.json
// 状态: data/{region}/archive/gym-state.json（增量处理用，冻结历史聚合结果）
//
// 每行 CSV = 一场道馆战斗（已合并 player_type=1/4 两条埋点）:
//   part_date | game_id_str | b_role_id | gym_uid | player_lumis | battle_result | trainer_id
//
// gym_uid = MonsterGroupID = 128100000 + 层数
// battle_result: 1=胜 2=负
//
// 增量策略：
// - state.processedDates 记录"已冻结"的日期（不会再重扫）
// - 只 freeze 「date <= today - 2」的日子：给数数按天分区留足写入延迟余量
// - 每天跑：新天数据 append 到 state；最近 2 天数据每次都从 state 基础上"临时叠加"跑一遍
// - state 缺失（如首次部署）→ 全量扫描重建

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.join(__dirname, '..')

// 解析参数
const args = process.argv.slice(2)
const regionIdx = args.indexOf('--region')
const region = regionIdx !== -1 ? args[regionIdx + 1] : 'domestic'
const forceRebuild = args.includes('--rebuild')  // 强制全量重算 state（用于回归测试或首次迁移）
if (!['domestic', 'overseas'].includes(region)) {
  console.error(`未知 --region: ${region}（仅支持 domestic / overseas）`)
  process.exit(1)
}

const INPUT_DIR = path.join(PROJECT_ROOT, `data/${region}/archive/daily/infinity-gym`)
const ASSIST_DIR = path.join(PROJECT_ROOT, `data/${region}/archive/daily/assist`)
const STATE_JSON = path.join(PROJECT_ROOT, `data/${region}/archive/gym-state.json`)
const OUTPUT_JSON = path.join(PROJECT_ROOT, `public/data/online/${region}/infinity-gym.json`)

// 冻结阈值：只把 date < today - FREEZE_DELAY_DAYS 的日子写入 state.processedDates
// 剩下的每次全量重扫。取 2 天 = 给数数分区延迟留余量（同一天的战斗可能在次日凌晨才写入分区）
const FREEZE_DELAY_DAYS = 2

// ==========================================
// 聚合状态：所有累加得到的中间结果
// - freeze 阶段的数据从 state.json 反序列化过来（历史累计）
// - 每次跑再叠加"未冻结的天"（最近 2 天 + 新增天）
// - 只有"冻结的天"部分会写回 state.json（append-only）
// ==========================================
function createEmptyState() {
  return {
    floors: new Map(),                       // floor -> { totalBattles, wins, loses, assistBattles, uniqueClearers:Set, uniqueChallengers:Set, teamsWon:Map<teamKey, teamStats> }
    uniqueChallengersGlobal: new Set(),
    playerMaxFloor: new Map(),               // b_role_id -> max floor
    globalLumiCount: new Map(),              // lumiId -> 出场场次
    assistBattleUids: new Set(),             // battle_uid（对应 gym CSV 的 game_id_str）
    totalBattlesAllFloors: 0,
    assistBattlesAllFloors: 0,
    processedDates: new Set(),               // 已冻结（写入 state）的日期（YYYY-MM-DD）
    processedAssistDates: new Set(),         // 已冻结的 assist 日期
  }
}

// 深拷贝 state 用于"临时叠加最近未冻结天"—— 保持 state.json 里的冻结状态不被污染
function cloneState(s) {
  const c = createEmptyState()
  c.totalBattlesAllFloors = s.totalBattlesAllFloors
  c.assistBattlesAllFloors = s.assistBattlesAllFloors
  c.processedDates = new Set(s.processedDates)
  c.processedAssistDates = new Set(s.processedAssistDates)
  c.uniqueChallengersGlobal = new Set(s.uniqueChallengersGlobal)
  c.playerMaxFloor = new Map(s.playerMaxFloor)
  c.globalLumiCount = new Map(s.globalLumiCount)
  c.assistBattleUids = new Set(s.assistBattleUids)
  for (const [floor, f] of s.floors) {
    const clonedTeams = new Map()
    for (const [tk, t] of f.teamsWon) {
      clonedTeams.set(tk, {
        teamLumiIds: [...t.teamLumiIds],
        lumis: t.lumis.map(l => ({
          lumiId: l.lumiId,
          lumiName: l.lumiName,
          secondSkills: new Map(l.secondSkills),
        })),
        trainerSkills: new Map(t.trainerSkills),
        battles: t.battles,
        latestGameId: t.latestGameId,
      })
    }
    c.floors.set(floor, {
      totalBattles: f.totalBattles,
      wins: f.wins,
      loses: f.loses,
      assistBattles: f.assistBattles,
      uniqueClearers: new Set(f.uniqueClearers),
      uniqueChallengers: new Set(f.uniqueChallengers),
      teamsWon: clonedTeams,
    })
  }
  return c
}

// 序列化/反序列化：JSON 不能直接存 Map/Set/BigInt，手动展开
function serializeState(s) {
  return {
    version: 1,
    totalBattlesAllFloors: s.totalBattlesAllFloors,
    assistBattlesAllFloors: s.assistBattlesAllFloors,
    processedDates: [...s.processedDates],
    processedAssistDates: [...s.processedAssistDates],
    uniqueChallengersGlobal: [...s.uniqueChallengersGlobal],
    playerMaxFloor: [...s.playerMaxFloor],           // [[b_role_id, maxFloor], ...]
    globalLumiCount: [...s.globalLumiCount],         // [[lumiId, count], ...]
    assistBattleUids: [...s.assistBattleUids],
    floors: [...s.floors].map(([floor, f]) => [floor, {
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
          secondSkills: [...l.secondSkills],   // [[skillId, count], ...]
        })),
        trainerSkills: [...t.trainerSkills],
        battles: t.battles,
        latestGameId: t.latestGameId.toString(),  // BigInt → string
      }]),
    }]),
  }
}

function deserializeState(obj) {
  const s = createEmptyState()
  s.totalBattlesAllFloors = obj.totalBattlesAllFloors || 0
  s.assistBattlesAllFloors = obj.assistBattlesAllFloors || 0
  s.processedDates = new Set(obj.processedDates || [])
  s.processedAssistDates = new Set(obj.processedAssistDates || [])
  s.uniqueChallengersGlobal = new Set(obj.uniqueChallengersGlobal || [])
  s.playerMaxFloor = new Map(obj.playerMaxFloor || [])
  s.globalLumiCount = new Map(obj.globalLumiCount || [])
  s.assistBattleUids = new Set(obj.assistBattleUids || [])
  for (const [floor, f] of obj.floors || []) {
    const teams = new Map()
    for (const [tk, t] of f.teamsWon || []) {
      teams.set(tk, {
        teamLumiIds: t.teamLumiIds,
        lumis: t.lumis.map(l => ({
          lumiId: l.lumiId,
          lumiName: l.lumiName,
          secondSkills: new Map(l.secondSkills || []),
        })),
        trainerSkills: new Map(t.trainerSkills || []),
        battles: t.battles,
        latestGameId: BigInt(t.latestGameId || '0'),
      })
    }
    s.floors.set(floor, {
      totalBattles: f.totalBattles,
      wins: f.wins,
      loses: f.loses,
      assistBattles: f.assistBattles,
      uniqueClearers: new Set(f.uniqueClearers || []),
      uniqueChallengers: new Set(f.uniqueChallengers || []),
      teamsWon: teams,
    })
  }
  return s
}

function loadState() {
  if (!fs.existsSync(STATE_JSON)) return null
  try {
    const obj = JSON.parse(fs.readFileSync(STATE_JSON, 'utf-8'))
    return deserializeState(obj)
  } catch (e) {
    console.warn(`⚠️ 加载 state 失败（将全量重建）: ${e.message}`)
    return null
  }
}

function saveState(s) {
  fs.mkdirSync(path.dirname(STATE_JSON), { recursive: true })
  fs.writeFileSync(STATE_JSON, JSON.stringify(serializeState(s)), 'utf-8')
  const size = fs.statSync(STATE_JSON).size
  console.log(`  💾 state 已保存: ${STATE_JSON} (${(size / 1024).toFixed(1)} KB)`)
}

// 从文件名解析日期：daily/infinity-gym/2026-08-24.csv → '2026-08-24'
function dateOfCsvPath(p) {
  const m = path.basename(p).match(/^(\d{4}-\d{2}-\d{2})\.csv$/)
  return m ? m[1] : null
}

// 计算"冻结截止日"（含）—— 今天 - FREEZE_DELAY_DAYS
function freezeCutoff() {
  const d = new Date()
  d.setDate(d.getDate() - FREEZE_DELAY_DAYS)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 列出 daily 目录里所有 CSV 按日期排序（文件名格式 YYYY-MM-DD.csv）
function listDailyCsvs(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.csv$/.test(f))
    .sort()
    .map(f => path.join(dir, f))
}

// 无限道馆 gym_uid 范围
const GYM_UID_BASE = 128100000
const GYM_UID_MIN = 128100001
const GYM_UID_MAX = 128101000
const uidToFloor = uid => uid - GYM_UID_BASE

// 每层通关阵容槽位：按语义分三档（最近使用 / 使用最多 / 其他），最多输出 3 支
// 全局噜咪出场率 top N（前端可能全展示）
const GLOBAL_LUMI_TOP_N = 300

// ==========================================
// 加载 robot-teams.json 拿无限道馆 NPC 阵容 + Lumi.json 拿名字
// （robot-teams.json 由 process-robot-teams.js 从 MonsterGroup + Monster + Lumi 表生成，
//   已把 MonsterGroupID → lumis 阵容解析好，我们直接复用避免重复计算）
// ==========================================
console.log('加载 robot-teams / Lumi / 多语言...')
const robotTeamsPath = path.join(PROJECT_ROOT, 'public/data/robot-teams.json')
const robotTeams = JSON.parse(fs.readFileSync(robotTeamsPath, 'utf-8'))
// floor -> { lumis: [{lumiId, level, breakthrough, score}] }
const npcTeamByFloor = new Map((robotTeams.infinityGym || []).map(t => [t.floor, t]))
if (npcTeamByFloor.size === 0) {
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

function buildNpcTeam(floor) {
  const t = npcTeamByFloor.get(floor)
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
// CSV 解析工具（与其他脚本保持一致）
// ==========================================
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === '"') {
      if (i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i += 2
      } else {
        inQuotes = !inQuotes
        i++
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''; i++
    } else {
      current += ch; i++
    }
  }
  result.push(current)
  return result
}

async function readCsv(csvPath) {
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV 不存在: ${csvPath}`)
    return { headers: [], rows: [] }
  }
  const rl = readline.createInterface({ input: fs.createReadStream(csvPath), crlfDelay: Infinity })
  let headers = null
  const rows = []
  for await (const line of rl) {
    if (!line.trim()) continue
    const vals = parseCSVLine(line)
    if (!headers) {
      headers = vals.map(h => h.replace(/^﻿/, '').trim())
      continue
    }
    const obj = {}
    headers.forEach((h, i) => obj[h] = vals[i])
    rows.push(obj)
  }
  return { headers, rows }
}

// 流式读取 CSV，每行执行 onRow(rowObj)
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

// ==========================================
// 把一行 gym CSV 累加到 state
// ==========================================
function accumulateGymRow(state, row) {
  const gymUid = parseInt(row.gym_uid)
  if (!Number.isFinite(gymUid) || gymUid < GYM_UID_MIN || gymUid > GYM_UID_MAX) return

  const floor = uidToFloor(gymUid)
  const roleId = row.b_role_id
  const isWin = parseInt(row.battle_result) === 1
  const isAssist = state.assistBattleUids.has(row.game_id_str)

  if (!state.floors.has(floor)) {
    state.floors.set(floor, {
      totalBattles: 0,
      wins: 0,
      loses: 0,
      assistBattles: 0,
      uniqueClearers: new Set(),
      uniqueChallengers: new Set(),
      teamsWon: new Map(),   // 只统计胜利场次（口径 1）
    })
  }
  const f = state.floors.get(floor)
  f.totalBattles++
  f.uniqueChallengers.add(roleId)
  if (isAssist) {
    f.assistBattles++
    state.assistBattlesAllFloors++
  }
  if (isWin) {
    f.wins++
    f.uniqueClearers.add(roleId)
  } else {
    f.loses++
  }

  state.uniqueChallengersGlobal.add(roleId)
  state.totalBattlesAllFloors++

  // 玩家最高层（"能打到"就算 —— 挑战即算，不管胜负）
  const cur = state.playerMaxFloor.get(roleId) || 0
  if (floor > cur) state.playerMaxFloor.set(roleId, floor)

  // 解析 player_lumis（战斗中玩家阵容）
  let lumis = []
  try {
    lumis = JSON.parse(row.player_lumis.replace(/""/g, '"'))
  } catch {
    return
  }
  if (lumis.length === 0) return
  lumis.sort((a, b) => String(a.lumi_id).localeCompare(String(b.lumi_id)))

  // 全局噜咪出场率（所有场次都算，不限胜负）
  lumis.forEach(l => {
    const id = String(l.lumi_id)
    state.globalLumiCount.set(id, (state.globalLumiCount.get(id) || 0) + 1)
  })

  // 每层胜利队伍 top（口径 1：只有胜利场次计入）
  if (!isWin) return
  const teamKey = lumis.map(l => l.lumi_id).sort().join('-')
  if (!f.teamsWon.has(teamKey)) {
    f.teamsWon.set(teamKey, {
      teamLumiIds: lumis.map(l => l.lumi_id),
      lumis: lumis.map(l => ({
        lumiId: l.lumi_id,
        lumiName: l.lumi_name,
        secondSkills: new Map()
      })),
      trainerSkills: new Map(),
      battles: 0,
      latestGameId: 0n,   // 该队所有胜利场次中 game_id_str 的最大值（BigInt，用于"最近使用"排序）
    })
  }
  const team = f.teamsWon.get(teamKey)
  team.battles++
  // 更新该队"最近一次胜利"的 game_id_str（BigInt 比较）
  try {
    const gid = BigInt(row.game_id_str)
    if (gid > team.latestGameId) team.latestGameId = gid
  } catch { /* game_id_str 非数字直接跳过 */ }
  // 累加各噜咪携带的第二技能
  lumis.forEach((l, idx) => {
    const skillId = parseInt(l.lumi_secondskill)
    if (!Number.isNaN(skillId)) {
      const map = team.lumis[idx].secondSkills
      map.set(skillId, (map.get(skillId) || 0) + 1)
    }
  })
  // 训练家技能（行级）
  const trainerId = parseInt(row.trainer_id)
  const tid = !Number.isNaN(trainerId) ? trainerId : 0
  team.trainerSkills.set(tid, (team.trainerSkills.get(tid) || 0) + 1)
}

// ==========================================
// 主处理
// ==========================================
async function main() {
  console.log(`\n===== 无限道馆数据处理 (${region}) =====`)
  const gymCsvs = listDailyCsvs(INPUT_DIR)
  const assistCsvs = listDailyCsvs(ASSIST_DIR)
  console.log(`输入: ${INPUT_DIR}/*.csv（${gymCsvs.length} 天）`)
  console.log(`助战: ${ASSIST_DIR}/*.csv（${assistCsvs.length} 天）`)
  if (gymCsvs.length === 0) {
    console.error(`❌ ${INPUT_DIR} 下未找到任何 daily CSV，退出`)
    process.exit(1)
  }

  // 尝试加载增量 state（存在且非 --rebuild 时用增量模式）
  const savedState = forceRebuild ? null : loadState()
  const cutoff = freezeCutoff()  // 冻结截止日（含）：date <= cutoff 就 freeze
  const state = savedState || createEmptyState()

  if (savedState) {
    console.log(`\n📦 增量模式：state 已加载`)
    console.log(`   已冻结 gym 天数: ${state.processedDates.size}, assist 天数: ${state.processedAssistDates.size}`)
    console.log(`   冻结截止日（含）: ${cutoff}`)
  } else {
    console.log(`\n🔄 全量模式：${forceRebuild ? '--rebuild 强制' : 'state 缺失'}，从头扫描所有 daily CSV`)
  }

  // ---- 第 1 步：assist CSV 累加到 state（先做，因为 gym 累加时需要 assistBattleUids） ----
  // 新的（未 freeze）assist CSV 全都要读，读完的按 cutoff 决定是否 freeze
  const freshAssistCsvs = assistCsvs.filter(p => {
    const d = dateOfCsvPath(p)
    return d && !state.processedAssistDates.has(d)
  })
  for (const csvPath of freshAssistCsvs) {
    await processCsvStream(csvPath, (row) => {
      const uid = row.battle_uid
      if (uid) state.assistBattleUids.add(uid)
    })
    const d = dateOfCsvPath(csvPath)
    if (d && d <= cutoff) state.processedAssistDates.add(d)
  }
  if (assistCsvs.length) {
    console.log(`  助战场次总数（battle_uid 独立值）: ${state.assistBattleUids.size.toLocaleString('en-US')}`)
    console.log(`  本次新增 assist 天数: ${freshAssistCsvs.length}`)
  } else {
    console.log(`  助战 CSV 不存在，跳过助战统计`)
  }

  // ---- 第 2 步：gym CSV 分两批 —— 冻结候选 vs 需要临时叠加 ----
  // 冻结候选：date <= cutoff 且不在 processedDates —— 累加到 state，加入 processedDates（下次不再读）
  // 临时叠加：date > cutoff（最近 2 天） —— 每次都从 state 基础上重新叠加（不写入 processedDates）
  const freshFreezeCsvs = []
  const overlayCsvs = []
  for (const csvPath of gymCsvs) {
    const d = dateOfCsvPath(csvPath)
    if (!d) continue
    if (d <= cutoff) {
      if (!state.processedDates.has(d)) freshFreezeCsvs.push(csvPath)
    } else {
      overlayCsvs.push(csvPath)
    }
  }

  console.log(`\n📥 需要新冻结的 gym 天数: ${freshFreezeCsvs.length}`)
  console.log(`📥 每次重叠加的 gym 天数（date > ${cutoff}）: ${overlayCsvs.length}`)

  // 先累加冻结候选到 state
  let rowCount = 0
  for (const csvPath of freshFreezeCsvs) {
    const { total } = await processCsvStream(csvPath, (row) => accumulateGymRow(state, row))
    rowCount += total
    const d = dateOfCsvPath(csvPath)
    if (d) state.processedDates.add(d)
  }

  // 现在 state 里包含"所有 date <= cutoff 的冻结数据" —— 立即写盘保存（省得后面出错丢冻结进度）
  if (freshFreezeCsvs.length > 0) {
    saveState(state)
  } else if (!savedState) {
    // 全量模式但没有冻结天要写：可能还没到 FREEZE_DELAY_DAYS 时长的部署早期，跳过 state 保存
    console.log(`  ⏭️  暂无可冻结天，跳过 state 保存`)
  }

  // 再基于 state 副本叠加 overlayCsvs（不污染 state）
  const finalState = overlayCsvs.length > 0 ? cloneState(state) : state
  for (const csvPath of overlayCsvs) {
    const { total } = await processCsvStream(csvPath, (row) => accumulateGymRow(finalState, row))
    rowCount += total
  }

  console.log(`\n  总场次: ${finalState.totalBattlesAllFloors}`)
  console.log(`  独立玩家数: ${finalState.uniqueChallengersGlobal.size}`)
  console.log(`  覆盖层数: ${finalState.floors.size}`)
  console.log(`  助战场次（gym 命中）: ${finalState.assistBattlesAllFloors}${finalState.totalBattlesAllFloors > 0 ? ` (${(finalState.assistBattlesAllFloors/finalState.totalBattlesAllFloors*100).toFixed(1)}%)` : ''}`)
  console.log(`  本次 CSV 处理行数: ${rowCount}`)

  // 构建 floors 输出（按 floor 降序 —— 高层在前，方便玩家看到"卡关点"和进度峰值）
  const floorsOutput = [...finalState.floors.entries()]
    .sort(([a], [b]) => b - a)
    .map(([floor, f]) => {
      // 平均通过尝试次数：总场次 / 通过独立玩家数
      const uniqueClearers = f.uniqueClearers.size
      const avgAttempts = uniqueClearers > 0 ? +(f.totalBattles / uniqueClearers).toFixed(2) : 0

      // top teams：三个槽位有明确语义
      //   recent  = 最近使用（该层所有胜利队伍中 latestGameId 最大的那队）
      //   popular = 使用最多（battles 最大）
      //   other   = 其他阵容（排除 recent/popular 后 battles 最大；不足时 fallback 到 popular）
      // 三个槽位每个都单独渲染一张卡，即使指向同一支队也不合并
      const allTeams = [...f.teamsWon.values()]
      const byBattles = [...allTeams].sort((a, b) => b.battles - a.battles)
      const byRecent = [...allTeams].sort((a, b) => {
        // BigInt 比较：不能用 a - b
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
          secondSkills: [...l.secondSkills.entries()]
            .map(([skillId, count]) => ({ skillId, count }))
            .sort((a, b) => b.count - a.count)
        })),
        trainerSkills: [...t.trainerSkills.entries()]
          .map(([trainerId, count]) => ({ trainerId, count }))
          .sort((a, b) => b.count - a.count),
        battles: t.battles,
        winRate: '100.00',   // 口径 1：只有胜场入选
      })

      const teams = [
        { key: 'recent', team: recent },
        { key: 'popular', team: popular },
        { key: 'other', team: other },
      ]
        .filter(s => s.team)
        .map(s => serializeTeam(s.team, s.key))

      return {
        floor,
        totalBattles: f.totalBattles,
        wins: f.wins,
        loses: f.loses,
        assistBattles: f.assistBattles,
        winRate: f.totalBattles > 0 ? +(f.wins / f.totalBattles * 100).toFixed(2) : 0,
        assistRate: f.totalBattles > 0 ? +(f.assistBattles / f.totalBattles * 100).toFixed(2) : 0,
        uniqueChallengers: f.uniqueChallengers.size,
        uniqueClearers,
        avgAttempts,
        npcTeam: buildNpcTeam(floor),
        topTeams: teams,
      }
    })

  // 最高层数分布
  const maxFloorDist = {}
  for (const [, maxFloor] of finalState.playerMaxFloor) {
    maxFloorDist[maxFloor] = (maxFloorDist[maxFloor] || 0) + 1
  }

  // 全局噜咪出场率
  const globalLumiUsage = [...finalState.globalLumiCount.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, GLOBAL_LUMI_TOP_N)
    .map(([lumiId, count]) => ({
      lumiId,
      lumiName: lumiNameOf(Number(lumiId)),
      battles: count,
      appearanceRate: finalState.totalBattlesAllFloors > 0 ? +(count / finalState.totalBattlesAllFloors * 100).toFixed(2) : 0
    }))

  const output = {
    updateTime: new Date().toISOString(),
    region,
    totalChallengers: finalState.uniqueChallengersGlobal.size,
    totalBattles: finalState.totalBattlesAllFloors,
    assistBattles: finalState.assistBattlesAllFloors,
    assistRate: finalState.totalBattlesAllFloors > 0 ? +(finalState.assistBattlesAllFloors / finalState.totalBattlesAllFloors * 100).toFixed(2) : 0,
    maxFloorDistribution: maxFloorDist,
    globalLumiUsage,
    floors: floorsOutput,
  }

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true })
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2), 'utf-8')
  const size = fs.statSync(OUTPUT_JSON).size
  console.log(`\n✓ 输出: ${OUTPUT_JSON} (${(size / 1024).toFixed(1)} KB)`)
  console.log(`  层数: ${floorsOutput.length}, 全局噜咪: ${globalLumiUsage.length}, 层分布桶: ${Object.keys(maxFloorDist).length}`)
}

main().catch(e => {
  console.error(`\n❌ ${e.message}`)
  process.exit(1)
})
