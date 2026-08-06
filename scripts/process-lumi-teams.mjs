import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.join(__dirname, '..')

// 解析 --week 参数；默认 = 所有周（weeks.json 里全部可用周）
const args = process.argv.slice(2)
const weekIdx = args.indexOf('--week')
const explicitWeek = weekIdx !== -1 ? parseInt(args[weekIdx + 1]) : null

const weeksJsonPath = path.join(PROJECT_ROOT, 'public/data/online/weekly/weeks.json')
const weeksJson = JSON.parse(fs.readFileSync(weeksJsonPath, 'utf-8'))
const availableWeeks = weeksJson.map(w => w.week).filter(w => w >= 1).sort((a, b) => a - b)

let weeks
if (!isNaN(explicitWeek) && explicitWeek >= 1) {
  weeks = [explicitWeek]
  console.log(`指定周次: Week ${explicitWeek}`)
} else {
  weeks = availableWeeks
  console.log(`未指定 --week，使用全部 ${weeks.length} 周: ${weeks.map(w => 'Week ' + w).join(' + ')}`)
}

const outputPath = path.join(PROJECT_ROOT, 'public/data/lumi-teams.json')

console.log(`\n===== LumiWiki 噜咪推荐配队处理 =====`)
console.log(`数据周次: ${weeks.map(w => 'Week ' + w).join(' + ')}`)

// 合并多周 ladder no-bot + tournament 的所有队伍
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
      trainerSkills: new Map(),  // trainerId -> count
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
  // 合并训练家技能计数
  ;(team.trainerSkills || []).forEach(ts => {
    merged.trainerSkills.set(ts.trainerId, (merged.trainerSkills.get(ts.trainerId) || 0) + ts.count)
  })
}

// 遍历每周，读 ladder + tournament 合并
for (const w of weeks) {
  const ladderPath = path.join(PROJECT_ROOT, `public/data/online/weekly/ladder-week${w}.json`)
  const tournamentPath = path.join(PROJECT_ROOT, `public/data/online/weekly/tournament-week${w}.json`)

  if (fs.existsSync(ladderPath)) {
    const ladder = JSON.parse(fs.readFileSync(ladderPath, 'utf-8'))
    const ladderTeams = ladder.stats?.['all-no-bot']?.teams || []
    console.log(`[Week ${w}] 天梯 (all-no-bot) 队伍数: ${ladderTeams.length}`)
    ladderTeams.forEach(ingestTeam)
  } else {
    console.log(`[Week ${w}] ⚠️  无天梯数据: ${ladderPath}`)
  }

  if (fs.existsSync(tournamentPath)) {
    const tournament = JSON.parse(fs.readFileSync(tournamentPath, 'utf-8'))
    const tournamentTeams = tournament.popularTeams || []
    console.log(`[Week ${w}] 周赛队伍数: ${tournamentTeams.length}`)
    tournamentTeams.forEach(ingestTeam)
  }
}

console.log(`合并后独立队伍数: ${mergedTeams.size}`)

// === 加载 Lumi.json，标记打工噜咪（仅有家园被动，不参与战斗配队）===
const lumiData = JSON.parse(fs.readFileSync(
  path.join(PROJECT_ROOT, 'public/data/Lumi.json'), 'utf-8')
)
const homeLumis = new Set(
  lumiData.filter(l => l.HomePassive).map(l => String(l.Id))
)
console.log(`打工噜咪（家园被动，跳过推荐配队）: ${homeLumis.size} 只`)

// === 构建进化链（union-find）===
// 线性进化链的所有形态（基础/中间阶/顶端）视为同一组，可互相替代
// 分支进化（GenderEvo）不 union：起点和各分支末端各自独立，避免不同噜咪共用配队
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
// 预扫：按 Lumi 分组 evoLumiID 目标去重集合（判定是否为分支起点）
// - 目标集合 size > 1 → 多目标分支（如喵鲨 → 猫鲨/雨鳍猫鲨/迷梦猫鲨等）
// - GenderEvo 非空 → 性别分支（如花牌孔雀 → 发牌雀圣/粉扇雀圣）
const lumiToEvoTargets = new Map()
for (const entry of evoData) {
  if (!entry.evoLumiID) continue
  const base = String(entry.Lumi)
  if (!lumiToEvoTargets.has(base)) lumiToEvoTargets.set(base, new Set())
  lumiToEvoTargets.get(base).add(String(entry.evoLumiID))
}
const branchLumis = new Set()
for (const [id, targets] of lumiToEvoTargets) {
  if (targets.size > 1) branchLumis.add(id)
}
for (const entry of evoData) {
  if (Array.isArray(entry.GenderEvo) && entry.GenderEvo.length > 0) {
    branchLumis.add(String(entry.Lumi))
  }
}

let branchSkipCount = 0
for (const entry of evoData) {
  const base = String(entry.Lumi)
  if (branchLumis.has(base)) {
    // 分支进化起点：所有 evoLumiID + GenderEvo 边都不 union，每个分支独立计算
    if (entry.evoLumiID) branchSkipCount++
    if (Array.isArray(entry.GenderEvo)) branchSkipCount += entry.GenderEvo.length
    continue
  }
  // 线性进化：正常 union
  if (entry.evoLumiID) union(base, String(entry.evoLumiID))
  for (const [, target] of (entry.GenderEvo || [])) {
    union(base, String(target))
  }
}
if (branchLumis.size > 0) {
  console.log(`分支进化起点: ${branchLumis.size} 只，跳过 union 边: ${branchSkipCount} 条`)
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

// Map<id, count> -> top 1 {<idKey>, count}（按 count 降序）
function top1OfMap(map, idKey = 'skillId') {
  if (!map || map.size === 0) return null
  let best = null
  for (const [id, count] of map) {
    if (!best || count > best.count) best = { [idKey]: id, count }
  }
  return best
}

// === 主循环：对每只 lumi X，按进化组聚合推荐阵容 ===
const allLumiIds = new Set(lumiNameMap.keys())
const result = {}
let totalEntries = 0
let mergedGroupCount = 0  // 统计有多少 lumiId 受益于进化链合并

for (const X of allLumiIds) {
  // 跳过打工噜咪（家园被动）——不生成推荐配队
  if (homeLumis.has(X)) continue

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
        trainerSkills: new Map(),
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
    // 合并训练家技能计数
    for (const [tid, cnt] of team.trainerSkills) {
      agg.trainerSkills.set(tid, (agg.trainerSkills.get(tid) || 0) + cnt)
    }
  }

  // 按规则选 top 3：
  //   #1 使用最多（battles 最高）
  //   #2 胜率最高（winRate 最高，需 battles ≥ #1 的 10%，避免小样本极端胜率；可与 #1 重复）
  //   #3 其他推荐（排除 #1、#2 后 battles 最高）
  const allAggs = Array.from(aggregated.values())
  const byBattles = [...allAggs].sort((a, b) => b.battles - a.battles)
  const slot1 = byBattles[0] || null
  const minBattlesForWinRate = slot1 ? slot1.battles * 0.1 : 0
  const winRateOf = agg => agg.battles > 0 ? agg.wins / agg.battles : 0
  const slot2 = allAggs
    .filter(a => a.battles >= minBattlesForWinRate)
    .sort((a, b) => winRateOf(b) - winRateOf(a))[0] || null
  const slot3 = byBattles.find(a => a !== slot1 && a !== slot2) || null

  // 按 slot 顺序输出，不去重：slot1 === slot2 时前两条队伍内容相同、tags 不同
  const slots = [
    { agg: slot1, tag: 'most-used' },
    { agg: slot2, tag: 'highest-winrate' },
    { agg: slot3, tag: 'other' }
  ].filter(s => s.agg)

  const top3 = slots
    .map(({ agg, tag }) => {
      const tags = [tag]
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
        topTrainerSkill: top1OfMap(agg.trainerSkills, 'trainerId'),
        battles: agg.battles,
        wins: agg.wins,
        winRate: agg.battles > 0 ? ((agg.wins / agg.battles) * 100).toFixed(2) : '0',
        tags
      }
    })

  if (top3.length > 0) {
    result[X] = top3
    totalEntries += top3.length
  }
}

// 扫描"无推荐配队的战斗噜咪"（Lumi.json 中非打工、且未出现在 result 中）
const zhData = JSON.parse(fs.readFileSync(
  path.join(PROJECT_ROOT, 'public/data/zh-CN.json'), 'utf-8'
))
const battleLumis = lumiData.filter(l => !l.HomePassive)
const missingLumis = []
for (const l of battleLumis) {
  const idStr = String(l.Id)
  if (result[idStr]) continue
  missingLumis.push({ id: idStr, name: zhData[l.Name] || l.Name })
}
if (missingLumis.length > 0) {
  console.log(`\n⚠️  无推荐配队的战斗噜咪 (${missingLumis.length}/${battleLumis.length}):`)
  for (const m of missingLumis) {
    console.log(`   - ${m.id} ${m.name}`)
  }
}

// 输出
const output = {
  updateTime: new Date().toISOString(),
  weeks,
  lumiTeams: result
}

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')
console.log(`\n✓ 输出: ${outputPath}`)
console.log(`  覆盖噜咪数: ${Object.keys(result).length}`)
console.log(`  队伍条目总数: ${totalEntries}`)
console.log(`  其中受益于进化链合并的噜咪: ${mergedGroupCount} 只`)
console.log(`  文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`)
