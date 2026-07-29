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

// 按每个 lumiId 收集含它的队伍
const lumiToTeams = new Map()
for (const team of mergedTeams.values()) {
  // 先把每只 lumi 的 secondSkills Map 转成 top 1
  const lumisWithTop = team.lumis.map(l => {
    const sorted = Array.from(l.secondSkills.entries())
      .map(([skillId, count]) => ({ skillId, count }))
      .sort((a, b) => b.count - a.count)
    return {
      lumiId: l.lumiId,
      lumiName: l.lumiName,
      topSkill: sorted[0] || null
    }
  })
  // 给每只 lumi 注册该队伍
  for (const lumi of lumisWithTop) {
    if (!lumiToTeams.has(lumi.lumiId)) {
      lumiToTeams.set(lumi.lumiId, [])
    }
    lumiToTeams.get(lumi.lumiId).push({
      teamLumiIds: team.teamLumiIds,
      lumis: lumisWithTop,
      battles: team.battles,
      wins: team.wins,
      winRate: team.battles > 0 ? ((team.wins / team.battles) * 100).toFixed(2) : '0'
    })
  }
}

// 每只 lumiId 取 top 3（按 battles 降序）
const result = {}
let totalEntries = 0
for (const [lumiId, teams] of lumiToTeams) {
  teams.sort((a, b) => b.battles - a.battles)
  result[lumiId] = teams.slice(0, 3)
  totalEntries += result[lumiId].length
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
console.log(`  文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`)
