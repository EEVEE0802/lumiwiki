import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 解析命令行参数
const args = process.argv.slice(2)
const weekIndex = args.indexOf('--week')
const week = weekIndex !== -1 ? parseInt(args[weekIndex + 1]) : null

// CSV 文件路径
const tournamentPath = week
  ? path.join(__dirname, `../data/archive/week${week}/tournament_week${week}.csv`)
  : path.join(__dirname, '../data/tournament.csv')

// 天梯数据路径（用于获取玩家段位）
const ladderPath = week
  ? path.join(__dirname, `../data/archive/week${week}/ladder_week${week}.csv`)
  : path.join(__dirname, '../data/battle_end.csv')

// 输出路径
const outputPath = week
  ? path.join(__dirname, `../public/data/online/weekly/tournament-week${week}.json`)
  : path.join(__dirname, '../public/data/online/tournament.json')

// 改进的 CSV 解析器
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]

    if (char === '"') {
      if (i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i += 2
      } else {
        inQuotes = !inQuotes
        i++
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
      i++
    } else {
      current += char
      i++
    }
  }

  result.push(current)
  return result
}

// 流式读取 CSV 文件
async function processCSVStream(filePath, processor) {
  const fileStream = fs.createReadStream(filePath)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  })

  let headers = []
  let rowIndex = 0

  for await (const line of rl) {
    if (rowIndex === 0) {
      headers = parseCSVLine(line).map(h => h.replace(/^﻿/, '').trim())
    } else {
      const values = parseCSVLine(line)
      const obj = {}
      headers.forEach((header, index) => {
        obj[header] = values[index]
      })
      await processor(obj, rowIndex)
    }
    rowIndex++
  }

  return { headers, totalRows: rowIndex - 1 }
}

// 主处理函数
async function processTournamentData() {
  console.log('开始处理周赛数据...')

  // 步骤1：读取天梯数据，获取所有玩家的最大段位
  console.log('读取天梯数据以获取玩家段位...')
  const playerMaxRank = new Map() // b_role_id -> max_rank

  try {
    await processCSVStream(ladderPath, (row) => {
      const b_role_id = row.b_role_id
      const playerType = parseInt(row.player_type)
      const rank = parseInt(row.player_rank)

      // 只统计真实玩家的最大段位
      if (playerType === 1 && !isNaN(rank) && rank >= 1) {
        const currentMax = playerMaxRank.get(b_role_id) || 0
        if (rank > currentMax) {
          playerMaxRank.set(b_role_id, rank)
        }
      }
    })
    console.log(`  - 收集了 ${playerMaxRank.size} 个真实玩家的天梯段位信息`)
  } catch (error) {
    console.log(`  - 警告: 无法读取天梯数据 (${error.message})`)
    console.log(`  - 将继续处理周赛数据，但不包含天梯段位分布`)
  }

  // 步骤2：处理周赛数据
  // 存储统计信息
  const lumiStatsMap = new Map()
  const teamUsage = new Map()
  const playerMaxWins = new Map() // 存储每个玩家的最高胜场
  const tournamentPlayers = new Set() // 参与周赛的玩家ID
  let totalBattles = 0
  const allRanks = new Set()
  const invalidWinSamples = [] // 用于调试没有胜场的玩家

  // 只有一个组合：all
  lumiStatsMap.set('all', new Map())

  console.log('扫描并统计周赛数据...')

  await processCSVStream(tournamentPath, (row) => {
    const playerType = parseInt(row.player_type)

    // 周赛只有真人，过滤掉人机
    if (playerType !== 1) return

    const bRoleId = row.b_role_id

    // 记录参与周赛的玩家
    tournamentPlayers.add(bRoleId)

    const weekWinRaw = row.player_week_win
    const weekWin = parseInt(weekWinRaw)
    const battleResult = parseInt(row.battle_result)

    // Bug修复：如果战斗胜利（battle_result=1）但胜场为0，说明是满胜（15胜）后重置
    // 这种情况下应该将胜场数视为 15
    let effectiveWeekWin = weekWin
    if (battleResult === 1 && weekWin === 0) {
      effectiveWeekWin = 15
    }

    // 统计玩家最高胜场（使用修复后的胜场数）
    if (!isNaN(effectiveWeekWin) && effectiveWeekWin >= 0) {
      const currentMax = playerMaxWins.get(bRoleId)
      if (currentMax === undefined || effectiveWeekWin > currentMax) {
        playerMaxWins.set(bRoleId, effectiveWeekWin)
      }
    }

    const rank = parseInt(row.player_rank)
    if (!isNaN(rank)) {
      allRanks.add(rank)
    }

    // 解析噜咪阵容
    let lumis = []
    try {
      const jsonStr = row.player_lumis.replace(/""/g, '"')
      lumis = JSON.parse(jsonStr)
    } catch (e) {
      return
    }

    // 跳过阵容为空的异常记录（玩家断线/上报错误）
    if (lumis.length === 0) return

    // 规范化：按 lumi_id 排序，确保同组合的队伍在任何场景下被视为相同
    lumis.sort((a, b) => String(a.lumi_id).localeCompare(String(b.lumi_id)))

    const isWin = battleResult === 1

    totalBattles++

    // 更新噜咪统计
    lumis.forEach(lumi => {
      const lumiId = lumi.lumi_id
      const lumiName = lumi.lumi_name

      const statsMap = lumiStatsMap.get('all')

      if (!statsMap.has(lumiId)) {
        statsMap.set(lumiId, {
          lumiId,
          lumiName,
          battles: 0,
          wins: 0,
          appearanceCount: 0
        })
      }

      const stats = statsMap.get(lumiId)
      stats.battles++
      if (isWin) stats.wins++
      stats.appearanceCount++
    })

    // 队伍统计（所有段位都统计）
    const teamLumiIds = lumis
      .map(l => l.lumi_id)
      .sort()
      .join('-')

    if (!teamUsage.has(teamLumiIds)) {
      teamUsage.set(teamLumiIds, {
        teamLumiIds: lumis.map(l => l.lumi_id),
        lumis: lumis.map(l => ({
          lumiId: l.lumi_id,
          lumiName: l.lumi_name
        })),
        battles: 0,
        wins: 0
      })
    }

    const team = teamUsage.get(teamLumiIds)
    team.battles++
    if (isWin) {
      team.wins++
    }
  })

  console.log(`处理完成！`)
  console.log(`  - 总战斗场次: ${totalBattles}`)

  // 构建统计数据
  const stats = {}

  const statsMap = lumiStatsMap.get('all')

  // 构建出场率数据
  const appearanceData = Array.from(statsMap.values())
    .filter(s => s.appearanceCount > 0)
    .sort((a, b) => b.appearanceCount - a.appearanceCount)
    .map(stats => ({
      lumiId: stats.lumiId,
      lumiName: stats.lumiName,
      uniqueBattles: stats.appearanceCount,
      appearanceRate: ((stats.appearanceCount / totalBattles) * 100).toFixed(2)
    }))

  // 构建胜率数据
  const winRateData = Array.from(statsMap.values())
    .filter(s => s.battles > 0)
    .map(stats => ({
      lumiId: stats.lumiId,
      lumiName: stats.lumiName,
      battles: stats.battles,
      wins: stats.wins,
      winRate: ((stats.wins / stats.battles) * 100).toFixed(2)
    }))
    .sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate))

  stats['all'] = {
    appearance: appearanceData,
    winRate: winRateData,
    totalBattles,
    rankRange: { min: 1, max: Math.max(...Array.from(allRanks)) }
  }

  // 构建全部队伍（前端按需 slice 展示 + 下载全部）
  const popularTeams = Array.from(teamUsage.values())
    .sort((a, b) => b.battles - a.battles)
    .map(team => ({
      ...team,
      winRate: ((team.wins / team.battles) * 100).toFixed(2)
    }))

  // 统计胜场分布（0-15胜）
  const winDistribution = {}
  for (let i = 0; i <= 15; i++) {
    winDistribution[i] = 0
  }

  playerMaxWins.forEach(maxWin => {
    if (maxWin >= 0 && maxWin <= 15) {
      winDistribution[maxWin]++
    }
  })

  // 统计参与周赛玩家的天梯段位分布
  const tournamentPlayerRankDistribution = {
    bronze: 0,    // 1-30
    silver: 0,    // 31-60
    gold: 0,      // 61-90
    diamond: 0,   // 91-120
    star: 0,      // 121-150
    legend: 0,    // 151
    total: 0
  }

  let playersWithLadderRank = 0
  const samplePlayers = [] // 用于调试
  tournamentPlayers.forEach(playerId => {
    // 清理 ID：去除引号，处理科学计数法
    let cleanId = playerId.toString().trim().replace(/^"|"$/g, '')

    // 尝试直接匹配
    let maxRank = playerMaxRank.get(cleanId)

    // 如果没找到，尝试作为数字匹配
    if (maxRank === undefined) {
      const numId = parseFloat(cleanId)
      // 在 Map 中查找匹配的数字 ID
      for (const [key, value] of playerMaxRank.entries()) {
        if (parseFloat(key) === numId) {
          maxRank = value
          break
        }
      }
    }

    if (maxRank !== undefined) {
      playersWithLadderRank++
      tournamentPlayerRankDistribution.total++
      if (maxRank >= 1 && maxRank <= 30) {
        tournamentPlayerRankDistribution.bronze++
      } else if (maxRank >= 31 && maxRank <= 60) {
        tournamentPlayerRankDistribution.silver++
      } else if (maxRank >= 61 && maxRank <= 90) {
        tournamentPlayerRankDistribution.gold++
      } else if (maxRank >= 91 && maxRank <= 120) {
        tournamentPlayerRankDistribution.diamond++
      } else if (maxRank >= 121 && maxRank <= 150) {
        tournamentPlayerRankDistribution.star++
      } else if (maxRank === 151) {
        tournamentPlayerRankDistribution.legend++
      }
    } else if (samplePlayers.length < 5) {
      samplePlayers.push(cleanId)
    }
  })

  console.log(`\n胜场分布:`)
  for (let i = 0; i <= 15; i++) {
    if (winDistribution[i] > 0) {
      console.log(`  ${i}胜: ${winDistribution[i]} 人`)
    }
  }

  // 构建最终输出
  const output = {
    updateTime: new Date().toISOString(),
    totalBattles,
    gameMode: 'tournament',
    stats,
    popularTeams,
    winDistribution,
    totalPlayers: playerMaxWins.size,
    tournamentPlayerRankDistribution
  }

  // 写入输出文件
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')

  console.log('\n数据处理完成！')
  console.log(`输出文件: ${outputPath}`)
  console.log(`\n统计信息:`)
  console.log(`  总战斗场次: ${totalBattles}`)
  console.log(`  天梯数据玩家总数: ${playerMaxRank.size} 人`)
  console.log(`  周赛数据玩家总数: ${tournamentPlayers.size} 人`)
  console.log(`  参与玩家: ${playerMaxWins.size} 人`)
  console.log(`  有天梯段位的玩家: ${playersWithLadderRank} 人`)
  if (playerMaxWins.size !== tournamentPlayers.size) {
    const diff = tournamentPlayers.size - playerMaxWins.size
    console.log(`  ⚠️  警告: 有 ${diff} 个玩家没有胜场记录`)
    if (invalidWinSamples.length > 0) {
      console.log(`  没有胜场的玩家样本:`)
      invalidWinSamples.forEach(s => {
        console.log(`    ID: ${s.id}, weekWin: "${s.weekWin}"`)
      })
    }
  }
  if (playersWithLadderRank === 0 && samplePlayers.length > 0) {
    console.log(`  找不到天梯段位的周赛玩家样本: ${samplePlayers.join(', ')}`)
  }
  console.log(`  噜咪数量: ${statsMap.size}`)
  console.log(`  队伍数量: ${popularTeams.length}`)

  if (playersWithLadderRank > 0) {
    console.log(`\n参与周赛玩家的天梯段位分布:`)
    console.log(`  青铜 (1-30): ${tournamentPlayerRankDistribution.bronze} 人`)
    console.log(`  白银 (31-60): ${tournamentPlayerRankDistribution.silver} 人`)
    console.log(`  黄金 (61-90): ${tournamentPlayerRankDistribution.gold} 人`)
    console.log(`  钻石 (91-120): ${tournamentPlayerRankDistribution.diamond} 人`)
    console.log(`  星耀 (121-150): ${tournamentPlayerRankDistribution.star} 人`)
    console.log(`  传说 (151): ${tournamentPlayerRankDistribution.legend} 人`)
    console.log(`  总计: ${tournamentPlayerRankDistribution.total} 人`)
  }
}

// 运行处理
processTournamentData().catch(console.error)
