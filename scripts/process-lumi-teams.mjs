import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.join(__dirname, '..')

// 解析 --week 参数；默认 = weeks.json 最新周 - 1（"上一周"）
const args = process.argv.slice(2)
const weekIdx = args.indexOf('--week')
let week = weekIdx !== -1 ? parseInt(args[weekIdx + 1]) : null

const weeksJsonPath = path.join(PROJECT_ROOT, 'public/data/online/weekly/weeks.json')
const weeksJson = JSON.parse(fs.readFileSync(weeksJsonPath, 'utf-8'))
const maxWeek = Math.max(...weeksJson.map(w => w.week))
if (isNaN(week) || week < 1) {
  week = Math.max(1, maxWeek - 1)
  console.log(`未指定 --week，使用上一周: Week ${week}`)
}

const ladderPath = path.join(PROJECT_ROOT, `public/data/online/weekly/ladder-week${week}.json`)
const tournamentPath = path.join(PROJECT_ROOT, `public/data/online/weekly/tournament-week${week}.json`)
const outputPath = path.join(PROJECT_ROOT, 'public/data/lumi-teams.json')

if (!fs.existsSync(ladderPath)) {
  console.error(`❌ 找不到天梯数据: ${ladderPath}`)
  process.exit(1)
}

console.log(`\n===== LumiWiki 噜咪推荐配队处理 =====`)
console.log(`数据周次: Week ${week}`)

// 合并 ladder no-bot + tournament 的所有队伍
// key = 排序后的 teamLumiIds join('-')；累加 battles/wins、合并 secondSkills
const mergedTeams = new Map()

function ingestTeam(team) {
  const sortedIds = [...team.teamLumiIds].sort()
  const key = sortedIds.join('-')
  if (!mergedTeams.has(key)) {
    mergedTeams.set(key, {
      teamLumiIds: sortedIds,
      lumis: team.lumis.map(l => ({
        lumiId: l.lumiId,
        lumiName: l.lumiName,
        secondSkills: new Map()  // skillId -> count
      })),
      battles: 0,
      wins: 0
    })
  }
  const merged = mergedTeams.get(key)
  merged.battles += team.battles || 0
  merged.wins += team.wins || 0
  // 按 index 对齐合并 secondSkills
  ;(team.lumis || []).forEach((l, idx) => {
    const target = merged.lumis[idx]
    if (!target) return
    ;(l.secondSkills || []).forEach(ss => {
      target.secondSkills.set(ss.skillId, (target.secondSkills.get(ss.skillId) || 0) + ss.count)
    })
  })
}

// 1. 天梯不含人机
const ladder = JSON.parse(fs.readFileSync(ladderPath, 'utf-8'))
const ladderTeams = ladder.stats?.['all-no-bot']?.teams || []
console.log(`天梯 (all-no-bot) 队伍数: ${ladderTeams.length}`)
ladderTeams.forEach(ingestTeam)

// 2. 周赛
if (fs.existsSync(tournamentPath)) {
  const tournament = JSON.parse(fs.readFileSync(tournamentPath, 'utf-8'))
  const tournamentTeams = tournament.popularTeams || []
  console.log(`周赛队伍数: ${tournamentTeams.length}`)
  tournamentTeams.forEach(ingestTeam)
} else {
  console.log(`⚠️  无周赛数据: ${tournamentPath}`)
}

console.log(`合并后独立队伍数: ${mergedTeams.size}`)

// === 构建进化链（union-find）===
// 同一进化链的所有形态（基础/中间阶/顶端/性别分支）视为同一组，可互相替代
const evoData = JSON.parse(fs.readFileSync(
  path.join(PROJECT_ROOT, 'public/data/LumiEvolution.json'), 'utf-8'
))
const parent = new Map()
function find(x) {
  if (!parent.has(x)) parent.set(x, x)
  let root = x
  while (parent.get(root) !== root) root = parent.get(root)
  while (parent.get(x) !== root) {
    const next = parent.get(x)
    parent.set(x, root)
    x = next
  }
  return root
}
function union(a, b) {
  const ra = find(a), rb = find(b)
  if (ra !== rb) parent.set(ra, rb)
}
for (const entry of evoData) {
  const base = String(entry.Lumi)
  if (entry.evoLumiID) union(base, String(entry.evoLumiID))
  for (const [gender, target] of (entry.GenderEvo || [])) {
    union(base, String(target))
  }
}
// root -> Set<lumiId>（只含实际出现在战斗数据中的形态）
const rootToLumis = new Map()
for (const team of mergedTeams.values()) {
  for (const l of team.lumis) {
    const root = find(l.lumiId)
    if (!rootToLumis.has(root)) rootToLumis.set(root, new Set())
    rootToLumis.get(root).add(l.lumiId)
  }
}

// 构建 lumiId -> 中文名 映射（来自战斗数据中的 lumiName 字段）
const lumiNameMap = new Map()
for (const team of mergedTeams.values()) {
  for (const l of team.lumis) {
    if (!lumiNameMap.has(l.lumiId)) lumiNameMap.set(l.lumiId, l.lumiName)
  }
}

// Map<skillId, count> -> top 1 {skillId, count}（按 count 降序）
function top1OfMap(map) {
  if (!map || map.size === 0) return null
  let best = null
  for (const [skillId, count] of map) {
    if (!best || count > best.count) best = { skillId, count }
  }
  return best
}

// === 主循环：对每只 lumi X，按进化组聚合推荐阵容 ===
const allLumiIds = new Set(lumiNameMap.keys())
const result = {}
let totalEntries = 0
let mergedGroupCount = 0  // 统计有多少 lumiId 受益于进化链合并

for (const X of allLumiIds) {
  const groupSet = rootToLumis.get(find(X)) || new Set([X])
  if (groupSet.size > 1) mergedGroupCount++

  // 收集含 groupSet 中任意形态的队伍，按"非进化组队友"做 key 聚合
  const aggregated = new Map()
  for (const team of mergedTeams.values()) {
    const groupIdx = team.lumis.findIndex(l => groupSet.has(l.lumiId))
    if (groupIdx === -1) continue

    const otherLumis = team.lumis.filter((_, i) => i !== groupIdx)
    const key = otherLumis.map(l => l.lumiId).sort().join('-')

    if (!aggregated.has(key)) {
      aggregated.set(key, {
        otherLumis: otherLumis.map(l => ({
          lumiId: l.lumiId,
          lumiName: l.lumiName,
          secondSkills: new Map()
        })),
        chainSecondSkills: new Map(),
        battles: 0,
        wins: 0
      })
    }
    const agg = aggregated.get(key)
    agg.battles += team.battles
    agg.wins += team.wins

    // 合并 X 位置（进化链）的技能
    const chainLumi = team.lumis[groupIdx]
    for (const [sid, cnt] of chainLumi.secondSkills) {
      agg.chainSecondSkills.set(sid, (agg.chainSecondSkills.get(sid) || 0) + cnt)
    }
    // 合并其他位置的技能
    otherLumis.forEach((l, i) => {
      for (const [sid, cnt] of l.secondSkills) {
        agg.otherLumis[i].secondSkills.set(sid, (agg.otherLumis[i].secondSkills.get(sid) || 0) + cnt)
      }
    })
  }

  // 按 battles 降序取 top 3
  const top3 = Array.from(aggregated.values())
    .sort((a, b) => b.battles - a.battles)
    .slice(0, 3)
    .map(agg => {
      const sortedOthers = [...agg.otherLumis]
        .map(l => ({
          lumiId: l.lumiId,
          lumiName: l.lumiName,
          topSkill: top1OfMap(l.secondSkills)
        }))
        .sort((a, b) => String(a.lumiId).localeCompare(String(b.lumiId)))
      return {
        teamLumiIds: [X, ...sortedOthers.map(l => l.lumiId)].sort(),
        lumis: [
          { lumiId: X, lumiName: lumiNameMap.get(X), topSkill: top1OfMap(agg.chainSecondSkills) },
          ...sortedOthers
        ],
        battles: agg.battles,
        wins: agg.wins,
        winRate: agg.battles > 0 ? ((agg.wins / agg.battles) * 100).toFixed(2) : '0'
      }
    })

  if (top3.length > 0) {
    result[X] = top3
    totalEntries += top3.length
  }
}

// 输出
const output = {
  updateTime: new Date().toISOString(),
  week,
  sources: {
    ladder: `ladder-week${week}.json (all-no-bot)`,
    tournament: fs.existsSync(tournamentPath) ? `tournament-week${week}.json` : null
  },
  lumiTeams: result
}

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')
console.log(`\n✓ 输出: ${outputPath}`)
console.log(`  覆盖噜咪数: ${Object.keys(result).length}`)
console.log(`  队伍条目总数: ${totalEntries}`)
console.log(`  其中受益于进化链合并的噜咪: ${mergedGroupCount} 只`)
console.log(`  文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`)
