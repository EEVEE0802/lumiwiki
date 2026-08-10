// 处理无限道馆 CSV → JSON
// 输入: data/{region}/archive/gym_infinity.csv (累计，覆盖更新)
// 输出: public/data/online/{region}/infinity-gym.json
//
// 每行 CSV = 一场道馆战斗（已合并 player_type=1/4 两条埋点）:
//   part_date | game_id_str | b_role_id | gym_uid | player_lumis | battle_result | trainer_id
//
// gym_uid = MonsterGroupID = 128100000 + 层数
// battle_result: 1=胜 2=负

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
if (!['domestic', 'overseas'].includes(region)) {
  console.error(`未知 --region: ${region}（仅支持 domestic / overseas）`)
  process.exit(1)
}

const INPUT_CSV = path.join(PROJECT_ROOT, `data/${region}/archive/gym_infinity.csv`)
const OUTPUT_JSON = path.join(PROJECT_ROOT, `public/data/online/${region}/infinity-gym.json`)

// 无限道馆 gym_uid 范围
const GYM_UID_BASE = 128100000
const GYM_UID_MIN = 128100001
const GYM_UID_MAX = 128101000
const uidToFloor = uid => uid - GYM_UID_BASE

// 每层玩家阵容 top N 输出（前端展示 top 3，多存一些留余量）
const TEAM_TOP_N = 20
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
// 主处理
// ==========================================
async function main() {
  console.log(`\n===== 无限道馆数据处理 (${region}) =====`)
  console.log(`输入: ${INPUT_CSV}`)

  // 每层聚合器
  // floor -> { totalBattles, wins, loses, uniqueChallengers:Set, uniqueClearers:Set, teamsWon:Map<teamKey, teamStats> }
  const floors = new Map()
  const uniqueChallengersGlobal = new Set()
  const playerMaxFloor = new Map()          // b_role_id -> max floor
  const globalLumiCount = new Map()         // lumiId -> 出场场次
  let totalBattlesAllFloors = 0

  const { total: rowCount } = await processCsvStream(INPUT_CSV, (row) => {
    const gymUid = parseInt(row.gym_uid)
    if (!Number.isFinite(gymUid) || gymUid < GYM_UID_MIN || gymUid > GYM_UID_MAX) return

    const floor = uidToFloor(gymUid)
    const roleId = row.b_role_id
    const isWin = parseInt(row.battle_result) === 1

    if (!floors.has(floor)) {
      floors.set(floor, {
        totalBattles: 0,
        wins: 0,
        loses: 0,
        uniqueClearers: new Set(),
        uniqueChallengers: new Set(),
        teamsWon: new Map(),   // 只统计胜利场次（口径 1）
      })
    }
    const f = floors.get(floor)
    f.totalBattles++
    f.uniqueChallengers.add(roleId)
    if (isWin) {
      f.wins++
      f.uniqueClearers.add(roleId)
    } else {
      f.loses++
    }

    uniqueChallengersGlobal.add(roleId)
    totalBattlesAllFloors++

    // 玩家最高层（"能打到"就算 —— 挑战即算，不管胜负）
    // 你说的口径：玩家最高层分布应该反映"卡到多少层" —— 用挑战记录合理
    const cur = playerMaxFloor.get(roleId) || 0
    if (floor > cur) playerMaxFloor.set(roleId, floor)

    // 解析 player_lumis（战斗中玩家阵容）
    let lumis = []
    try {
      lumis = JSON.parse(row.player_lumis.replace(/""/g, '"'))
    } catch {
      continue
    }
    if (lumis.length === 0) continue
    lumis.sort((a, b) => String(a.lumi_id).localeCompare(String(b.lumi_id)))

    // 全局噜咪出场率（所有场次都算，不限胜负）
    lumis.forEach(l => {
      const id = String(l.lumi_id)
      globalLumiCount.set(id, (globalLumiCount.get(id) || 0) + 1)
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
      })
    }
    const team = f.teamsWon.get(teamKey)
    team.battles++
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
  })

  console.log(`  总场次: ${totalBattlesAllFloors}`)
  console.log(`  独立玩家数: ${uniqueChallengersGlobal.size}`)
  console.log(`  覆盖层数: ${floors.size}`)
  console.log(`  CSV 行数: ${rowCount}`)

  // 构建 floors 输出（按 floor 升序）
  const floorsOutput = [...floors.entries()]
    .sort(([a], [b]) => a - b)
    .map(([floor, f]) => {
      // 平均通过尝试次数：总场次 / 通过独立玩家数
      const uniqueClearers = f.uniqueClearers.size
      const avgAttempts = uniqueClearers > 0 ? +(f.totalBattles / uniqueClearers).toFixed(2) : 0

      // top teams（按 battles 降序）
      const teams = [...f.teamsWon.values()]
        .sort((a, b) => b.battles - a.battles)
        .slice(0, TEAM_TOP_N)
        .map(t => ({
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
        }))

      return {
        floor,
        totalBattles: f.totalBattles,
        wins: f.wins,
        loses: f.loses,
        winRate: f.totalBattles > 0 ? +(f.wins / f.totalBattles * 100).toFixed(2) : 0,
        uniqueChallengers: f.uniqueChallengers.size,
        uniqueClearers,
        avgAttempts,
        npcTeam: buildNpcTeam(floor),
        topTeams: teams,
      }
    })

  // 最高层数分布
  const maxFloorDist = {}
  for (const [, maxFloor] of playerMaxFloor) {
    maxFloorDist[maxFloor] = (maxFloorDist[maxFloor] || 0) + 1
  }

  // 全局噜咪出场率
  const totalLumiSlots = totalBattlesAllFloors * 3   // 每场 3 只
  const globalLumiUsage = [...globalLumiCount.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, GLOBAL_LUMI_TOP_N)
    .map(([lumiId, count]) => ({
      lumiId,
      lumiName: lumiNameOf(Number(lumiId)),
      battles: count,
      appearanceRate: totalBattlesAllFloors > 0 ? +(count / totalBattlesAllFloors * 100).toFixed(2) : 0
    }))

  const output = {
    updateTime: new Date().toISOString(),
    region,
    totalChallengers: uniqueChallengersGlobal.size,
    totalBattles: totalBattlesAllFloors,
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
