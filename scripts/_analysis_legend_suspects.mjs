// 临时分析脚本：近 7 天传说段位真人玩家参战场次分布 + 高场次低胜率可疑账号
// 用完请删除
import path from 'path'
import { fileURLToPath } from 'url'
import { processCSVStream } from './lib/csv.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATES = [
  '2026-09-25','2026-09-26','2026-09-27','2026-09-28',
  '2026-09-29','2026-09-30','2026-10-01',
]
const REGIONS = ['cn', 'overseas']

// 场次分桶
const BUCKETS = [
  { label: '1',       lo: 1,   hi: 1 },
  { label: '2-5',     lo: 2,   hi: 5 },
  { label: '6-10',    lo: 6,   hi: 10 },
  { label: '11-20',   lo: 11,  hi: 20 },
  { label: '21-50',   lo: 21,  hi: 50 },
  { label: '51-100',  lo: 51,  hi: 100 },
  { label: '101-200', lo: 101, hi: 200 },
  { label: '201-500', lo: 201, hi: 500 },
  { label: '>500',    lo: 501, hi: Infinity },
]

function bucketOf(n) {
  for (const b of BUCKETS) {
    if (n >= b.lo && n <= b.hi) return b.label
  }
  return '?'
}

// 从 player_lumis 字符串快速提 lumi_id（不走 JSON.parse，省内存）
function extractLumiIds(s) {
  if (!s) return ''
  const ids = []
  const re = /""lumi_id"":""(\d+)""/g
  let m
  while ((m = re.exec(s))) ids.push(m[1])
  ids.sort()
  return ids.join(',')
}

async function analyzeRegion(region) {
  const paths = DATES.map(d =>
    path.join(__dirname, `../data/${region}/archive/daily/ladder/${d}.csv`)
  )

  // b_role_id -> { battles, wins, teams:Set<string> }
  const players = new Map()
  let scanned = 0
  let legendRows = 0

  await processCSVStream(paths, (row) => {
    scanned++
    const playerType = parseInt(row.player_type)
    if (playerType !== 1) return
    const rank = parseInt(row.player_rank)
    if (rank !== 151) return

    legendRows++
    const roleId = row.b_role_id
    const result = parseInt(row.battle_result)
    const fp = extractLumiIds(row.player_lumis)

    let p = players.get(roleId)
    if (!p) {
      p = { battles: 0, wins: 0, teams: new Set() }
      players.set(roleId, p)
    }
    p.battles++
    if (result === 1) p.wins++
    if (fp) p.teams.add(fp)
  })

  return { region, scanned, legendRows, players }
}

function printDist(label, players) {
  const bucketCounts = new Map(BUCKETS.map(b => [b.label, 0]))
  let totalPlayers = 0
  let totalBattles = 0
  for (const p of players.values()) {
    totalPlayers++
    totalBattles += p.battles
    bucketCounts.set(bucketOf(p.battles), bucketCounts.get(bucketOf(p.battles)) + 1)
  }
  console.log(`\n== 场次分布 [${label}] ==`)
  console.log(`总传说玩家数: ${totalPlayers}  总战斗记录数: ${totalBattles}`)
  console.log('场次区间         人数     占比')
  for (const b of BUCKETS) {
    const c = bucketCounts.get(b.label)
    const pct = totalPlayers > 0 ? (c * 100 / totalPlayers).toFixed(1) : '0.0'
    console.log(`  ${b.label.padEnd(14)} ${String(c).padStart(6)}   ${pct}%`)
  }
}

function printSuspects(label, players, { minBattles = 30, maxWinRate = 0.30 } = {}) {
  const list = []
  for (const [roleId, p] of players.entries()) {
    if (p.battles < minBattles) continue
    const wr = p.wins / p.battles
    if (wr > maxWinRate) continue
    list.push({
      roleId,
      battles: p.battles,
      wins: p.wins,
      winRate: wr,
      uniqueTeams: p.teams.size,
      teamsPerBattle: p.teams.size / p.battles,
    })
  }
  list.sort((a, b) => b.battles - a.battles)
  console.log(`\n== 可疑账号 [${label}] (场次≥${minBattles} 且 胜率≤${(maxWinRate*100).toFixed(0)}%) ==`)
  console.log(`共 ${list.length} 个`)
  console.log('role_id              场次  胜场  胜率   不同队伍  队伍/场')
  for (const r of list.slice(0, 100)) {
    console.log(
      `  ${String(r.roleId).padEnd(20)} ${String(r.battles).padStart(4)}  ` +
      `${String(r.wins).padStart(4)}  ${(r.winRate*100).toFixed(1).padStart(5)}%  ` +
      `${String(r.uniqueTeams).padStart(7)}   ${r.teamsPerBattle.toFixed(3)}`
    )
  }
  if (list.length > 100) console.log(`  ...（省略 ${list.length - 100} 条）`)
  return list
}

// 额外：场次 top 20 玩家（不管胜率，看高频头部长啥样）
function printTopBattles(label, players, n = 20) {
  const arr = [...players.entries()]
    .map(([roleId, p]) => ({ roleId, ...p, teams: p.teams.size, winRate: p.wins/p.battles }))
    .sort((a, b) => b.battles - a.battles)
    .slice(0, n)
  console.log(`\n== 场次 Top ${n} [${label}] ==`)
  console.log('role_id              场次  胜场  胜率   不同队伍')
  for (const r of arr) {
    console.log(
      `  ${String(r.roleId).padEnd(20)} ${String(r.battles).padStart(4)}  ` +
      `${String(r.wins).padStart(4)}  ${(r.winRate*100).toFixed(1).padStart(5)}%  ` +
      `${String(r.teams).padStart(7)}`
    )
  }
}

const t0 = Date.now()
const results = []
for (const region of REGIONS) {
  console.log(`\n>>> 扫描 ${region} ...`)
  const r = await analyzeRegion(region)
  console.log(`  扫描行数: ${r.scanned}  传说真人记录: ${r.legendRows}  唯一玩家: ${r.players.size}`)
  results.push(r)
}

for (const r of results) {
  printDist(r.region, r.players)
  printTopBattles(r.region, r.players, 20)
  printSuspects(r.region, r.players, { minBattles: 30, maxWinRate: 0.30 })
}

// 合并视图
const merged = new Map()
for (const r of results) {
  for (const [rid, p] of r.players.entries()) {
    const key = `${r.region}:${rid}`
    merged.set(key, p)
  }
}
printDist('cn+overseas', merged)

console.log(`\n耗时 ${((Date.now()-t0)/1000).toFixed(1)}s`)
