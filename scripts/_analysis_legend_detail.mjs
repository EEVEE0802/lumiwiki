// 传说段位脚本可疑账号深度分析（近 7 天）
// - 修了 player_lumis 的 regex（parseCSVLine 已解转义，lumi_id 是单引号形式）
// - 加对手/受益账号分析（谁频繁从可疑账号拿胜场）
// - 加小时时间分布（24h 均匀 ≈ 脚本 / 作息模式 ≈ 真人）
// - 加队伍指纹（唯一队伍数、每队使用占比）
// 用完请删除
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { processCSVStream } from './lib/csv.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATES = [
  '2026-09-25','2026-09-26','2026-09-27','2026-09-28',
  '2026-09-29','2026-09-30','2026-10-01',
]
const REGIONS = ['cn', 'overseas']

// —— 可疑账号筛选门槛
const SUSPECT_MIN_BATTLES = 30
const SUSPECT_MAX_WIN_RATE = 0.30

// 从 player_lumis 字符串快速提 lumi_id（parseCSVLine 已解转义，这里用单引号形式）
function extractLumiIdsFast(s) {
  if (!s) return ''
  const ids = []
  const re = /"lumi_id":"(\d+)"/g
  let m
  while ((m = re.exec(s))) ids.push(m[1])
  ids.sort()
  return ids.join(',')
}

// 从 game_id_str 粗略推 hour（没有直接的 timestamp，但 game_id_str 单调递增，我们改用 part_date + 游戏内分布估算？）
// —— game_id_str 没时间戳含义。放弃小时级，退化为按 part_date 分布
function parseHourFromRow(row) {
  // 当前 schema 没拉时间戳列，返回 null
  return null
}

async function analyzeRegion(region) {
  const paths = DATES.map(d =>
    path.join(__dirname, `../data/${region}/archive/daily/ladder/${d}.csv`)
  )

  // 玩家聚合：b_role_id -> { battles, wins, teamCount:Map<fp,int>, dateCount:Map<date,int>, trainerSide:{1:n,2:n} }
  const players = new Map()
  // 每场战斗参与者：game_id_str -> Set<b_role_id>（仅传说真人）
  const gameParticipants = new Map()
  // 每场胜方：game_id_str -> role_id（赢家）
  const gameWinner = new Map()

  await processCSVStream(paths, (row) => {
    const playerType = parseInt(row.player_type)
    if (playerType !== 1) return
    const rank = parseInt(row.player_rank)
    if (rank !== 151) return

    const roleId = row.b_role_id
    const result = parseInt(row.battle_result)
    const gid = row.game_id_str
    const date = row.part_date
    const trainer = parseInt(row.trainer_id)
    const fp = extractLumiIdsFast(row.player_lumis)

    let p = players.get(roleId)
    if (!p) {
      p = {
        battles: 0,
        wins: 0,
        teamCount: new Map(),
        dateCount: new Map(),
        trainerSide: { 1: 0, 2: 0 },
      }
      players.set(roleId, p)
    }
    p.battles++
    if (result === 1) p.wins++
    if (fp) p.teamCount.set(fp, (p.teamCount.get(fp) || 0) + 1)
    p.dateCount.set(date, (p.dateCount.get(date) || 0) + 1)
    if (trainer === 1 || trainer === 2) p.trainerSide[trainer]++

    if (!gameParticipants.has(gid)) gameParticipants.set(gid, new Set())
    gameParticipants.get(gid).add(roleId)
    if (result === 1) gameWinner.set(gid, roleId)
  })

  return { region, players, gameParticipants, gameWinner }
}

function pickSuspects(players) {
  const list = []
  for (const [roleId, p] of players.entries()) {
    if (p.battles < SUSPECT_MIN_BATTLES) continue
    const wr = p.wins / p.battles
    if (wr > SUSPECT_MAX_WIN_RATE) continue
    list.push({ roleId, ...p, winRate: wr })
  }
  list.sort((a, b) => b.battles - a.battles)
  return list
}

function analyzeOpponents(suspects, players, gameParticipants, gameWinner) {
  // 每个可疑账号 -> 对手分布
  const details = []
  for (const s of suspects) {
    const opponentCount = new Map()        // roleId -> games_vs
    const beneficiaryCount = new Map()     // roleId -> 从该可疑账号拿胜场的次数
    let gamesSeen = 0
    for (const [gid, participants] of gameParticipants) {
      if (!participants.has(s.roleId)) continue
      if (participants.size < 2) continue
      gamesSeen++
      for (const oppId of participants) {
        if (oppId === s.roleId) continue
        opponentCount.set(oppId, (opponentCount.get(oppId) || 0) + 1)
        // 该场谁赢
        if (gameWinner.get(gid) === oppId) {
          beneficiaryCount.set(oppId, (beneficiaryCount.get(oppId) || 0) + 1)
        }
      }
    }
    const topOpp = [...opponentCount].sort((a,b)=>b[1]-a[1]).slice(0, 10)
    const topBen = [...beneficiaryCount].sort((a,b)=>b[1]-a[1]).slice(0, 10)
    const totalBeneficiaries = [...beneficiaryCount.values()].reduce((a,b)=>a+b, 0)
    const uniqueOpp = opponentCount.size
    const uniqueBen = beneficiaryCount.size
    details.push({
      suspect: s,
      gamesSeen,
      uniqueOpp,
      uniqueBen,
      topOpp,
      topBen,
      totalBeneficiaries,
      // top1 受益者占比（越高越说明定向喂）
      top1BeneficiaryShare: topBen[0] ? topBen[0][1] / Math.max(1, totalBeneficiaries) : 0,
      // top5 受益者占比
      top5BeneficiaryShare: topBen.slice(0,5).reduce((a,[,n])=>a+n, 0) / Math.max(1, totalBeneficiaries),
    })
  }
  return details
}

// —— 识别受益者集群（受益者可能是同一个脚本运作的多个号）
function analyzeBeneficiaryClusters(details) {
  // 哪些 role_id 从多个可疑账号拿胜场
  const beneficiaryHits = new Map()  // roleId -> { fromSuspects:Set, totalWins }
  for (const d of details) {
    for (const [oppId, wins] of d.topBen) {
      let b = beneficiaryHits.get(oppId)
      if (!b) {
        b = { fromSuspects: new Set(), totalWins: 0 }
        beneficiaryHits.set(oppId, b)
      }
      b.fromSuspects.add(d.suspect.roleId)
      b.totalWins += wins
    }
  }
  const multi = [...beneficiaryHits.entries()]
    .filter(([, b]) => b.fromSuspects.size >= 2)
    .sort((a,b) => b[1].totalWins - a[1].totalWins)
  return multi
}

function fmtPct(x, w=5) { return (x*100).toFixed(1).padStart(w) + '%' }

function printSuspectDetail(label, details) {
  console.log(`\n╔═══ 可疑账号深度 [${label}] ═══╗`)
  console.log(`共 ${details.length} 个可疑账号`)
  for (const d of details) {
    const s = d.suspect
    const topTeams = [...s.teamCount].sort((a,b)=>b[1]-a[1]).slice(0, 3)
    const top1Share = topTeams[0] ? topTeams[0][1] / s.battles : 0
    const dateBuckets = [...s.dateCount].sort()
    const dateMax = Math.max(...dateBuckets.map(([,n])=>n))
    const dateMin = Math.min(...dateBuckets.map(([,n])=>n))
    const dateStr = dateBuckets.map(([d,n]) => `${d.slice(5)}:${n}`).join('  ')

    console.log(`\n─ role_id=${s.roleId}  场次=${s.battles}  胜率=${fmtPct(s.winRate)}  不同队伍=${s.teamCount.size}  主队占比=${fmtPct(top1Share)}`)
    console.log(`  日分布: ${dateStr}  [max=${dateMax}, min=${dateMin}]`)
    console.log(`  trainer side: 1=${s.trainerSide[1]}  2=${s.trainerSide[2]} (两边均衡度 ${((Math.min(s.trainerSide[1],s.trainerSide[2])/Math.max(1,Math.max(s.trainerSide[1],s.trainerSide[2])))*100).toFixed(0)}%)`)
    console.log(`  Top 队伍:`)
    for (const [fp, n] of topTeams) {
      console.log(`    [${n}场 ${fmtPct(n/s.battles)}] ${fp}`)
    }
    console.log(`  不同对手数=${d.uniqueOpp}  不同受益者=${d.uniqueBen}  对手复用度=${(s.battles/Math.max(1,d.uniqueOpp)).toFixed(2)}场/对手  Top1受益占比=${fmtPct(d.top1BeneficiaryShare)}  Top5=${fmtPct(d.top5BeneficiaryShare)}`)
    console.log(`  Top 受益者（从该账号拿胜场最多）:`)
    for (const [oppId, wins] of d.topBen.slice(0, 5)) {
      console.log(`    拿 ${wins} 胜：role_id=${oppId}`)
    }
  }
}

function printBeneficiaryClusters(label, clusters) {
  console.log(`\n╔═══ 跨可疑账号的"重复受益者" [${label}] ═══╗`)
  console.log(`共 ${clusters.length} 个 role_id 从 ≥2 个可疑账号拿过胜场`)
  console.log('role_id              受益可疑账号数  总获胜场次')
  for (const [rid, b] of clusters.slice(0, 30)) {
    console.log(`  ${String(rid).padEnd(20)} ${String(b.fromSuspects.size).padStart(14)}  ${String(b.totalWins).padStart(8)}`)
  }
}

// —— 主流程
const t0 = Date.now()
const allReports = []
for (const region of REGIONS) {
  console.log(`\n>>> 扫描 ${region} ...`)
  const r = await analyzeRegion(region)
  console.log(`  传说真人玩家: ${r.players.size}  传说场次: ${r.gameParticipants.size}`)
  const suspects = pickSuspects(r.players)
  console.log(`  可疑账号数: ${suspects.length}`)
  const details = analyzeOpponents(suspects, r.players, r.gameParticipants, r.gameWinner)
  const clusters = analyzeBeneficiaryClusters(details)
  allReports.push({ region: r.region, suspects, details, clusters })
}

for (const rep of allReports) {
  printSuspectDetail(rep.region, rep.details)
  printBeneficiaryClusters(rep.region, rep.clusters)
}

console.log(`\n耗时 ${((Date.now()-t0)/1000).toFixed(1)}s`)

// 同时写一份 markdown 报告到项目根下（不进 git，用完删）
const md = []
md.push(`# 传说段位脚本账号详情（${DATES[0]} ~ ${DATES[DATES.length-1]}）`)
md.push(``)
md.push(`筛选门槛: 场次 ≥ ${SUSPECT_MIN_BATTLES} 且 胜率 ≤ ${SUSPECT_MAX_WIN_RATE*100}%`)
md.push(``)
for (const rep of allReports) {
  md.push(`\n## ${rep.region}（共 ${rep.suspects.length} 个可疑账号）`)
  md.push('')
  md.push('| role_id | 场次 | 胜场 | 胜率 | 不同队伍 | 主队占比 | 不同对手 | Top1受益占比 |')
  md.push('|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const d of rep.details) {
    const s = d.suspect
    const topTeams = [...s.teamCount].sort((a,b)=>b[1]-a[1])
    const top1Share = topTeams[0] ? topTeams[0][1]/s.battles : 0
    md.push(`| ${s.roleId} | ${s.battles} | ${s.wins} | ${(s.winRate*100).toFixed(1)}% | ${s.teamCount.size} | ${(top1Share*100).toFixed(1)}% | ${d.uniqueOpp} | ${(d.top1BeneficiaryShare*100).toFixed(1)}% |`)
  }

  md.push(`\n### 跨可疑账号的"重复受益者"\n`)
  md.push(`从 ≥2 个可疑账号拿过胜场的 role_id（Top 20）：\n`)
  md.push('| role_id | 受益可疑账号数 | 总获胜场次 |')
  md.push('|---|---:|---:|')
  for (const [rid, b] of rep.clusters.slice(0, 20)) {
    md.push(`| ${rid} | ${b.fromSuspects.size} | ${b.totalWins} |`)
  }
}
fs.writeFileSync(path.join(__dirname, '../_legend_suspect_report.md'), md.join('\n'))
console.log(`\n已写出 _legend_suspect_report.md`)
