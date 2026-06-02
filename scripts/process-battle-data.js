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

// CSV 文件路径 - 如果指定周次，从归档目录读取
const battleEndPath = week
  ? path.join(__dirname, `../data/archive/week${week}/ladder_week${week}.csv`)
  : path.join(__dirname, '../data/battle_end.csv')

// 根据周次决定输出路径
const outputPath = week
  ? path.join(__dirname, `../public/data/online/weekly/ladder-week${week}.json`)
  : path.join(__dirname, '../public/data/online/battle-stats.json')

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
      headers = parseCSVLine(line).map(h => h.replace(/^﻿/, '').trim()) // 去除 BOM
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

// 段位分组配置
const rankGroups = [
  { key: 'bronze', start: 1, end: 30, label: '青铜' },
  { key: 'silver', start: 31, end: 60, label: '白银' },
  { key: 'gold', start: 61, end: 90, label: '黄金' },
  { key: 'diamond', start: 91, end: 120, label: '钻石' },
  { key: 'star', start: 121, end: 150, label: '星耀' },
  { key: 'legend', start: 151, end: 151, label: '传说' }
]

// 获取战斗时的段位组（考虑段位变化）
function getBattleRankGroup(rank, hasBot) {
  // 如果 rank=151 且有人机，说明战斗发生在星耀段位（150胜后升级到151）
  if (rank === 151 && hasBot) {
    return 'star'
  }
  // 否则按正常逻辑
  for (const group of rankGroups) {
    if (rank >= group.start && rank <= group.end) {
      return group.key
    }
  }
  return 'bronze'
}

// 判断是否应该同时计入 with-bot 和 no-bot
function shouldCountBoth(rank) {
  // 传说段位（151）不允许人机对战，所以 with-bot 和 no-bot 应该相同
  return rank === 151
}

// 主处理函数
async function processBattleData() {
  console.log('开始处理战斗数据...')

  // 第一遍扫描：收集每场游戏是否有人机 + 玩家最大段位
  const gameHasBotMap = new Map()
  const playerMaxRank = new Map() // b_role_id -> max_rank

  console.log('第一遍扫描：收集人机信息和玩家段位...')
  await processCSVStream(battleEndPath, (row) => {
    const game_id_str = row.game_id_str
    const b_role_id = row.b_role_id
    const playerType = parseInt(row.player_type)
    const rank = parseInt(row.player_rank)

    // 收集人机信息
    if (!gameHasBotMap.has(game_id_str)) {
      gameHasBotMap.set(game_id_str, false)
    }
    if (playerType === 3) {
      gameHasBotMap.set(game_id_str, true)
    }

    // 收集真实玩家的最大段位
    if (playerType === 1 && !isNaN(rank) && rank >= 1) {
      const currentMax = playerMaxRank.get(b_role_id) || 0
      if (rank > currentMax) {
        playerMaxRank.set(b_role_id, rank)
      }
    }
  })

  console.log(`  - 收集了 ${gameHasBotMap.size} 场游戏的人机信息`)
  console.log(`  - 收集了 ${playerMaxRank.size} 个真实玩家的段位信息`)

  // 用于存储统计信息
  const allRanks = new Set()

  // 按组合存储统计
  const lumiStatsMap = new Map()
  const teamUsage = new Map()
  const battleCountMap = new Map()

  // 初始化
  const combinations = [
    'all-with-bot', 'all-no-bot',
    'bronze-with-bot', 'bronze-no-bot',
    'silver-with-bot', 'silver-no-bot',
    'gold-with-bot', 'gold-no-bot',
    'diamond-with-bot', 'diamond-no-bot',
    'star-with-bot', 'star-no-bot',
    'legend-with-bot', 'legend-no-bot'
  ]

  combinations.forEach(key => {
    lumiStatsMap.set(key, new Map())
    battleCountMap.set(key, 0)
  })

  // 第二遍扫描：统计噜咪数据
  console.log('第二遍扫描：统计噜咪数据...')
  let successCount = 0

  await processCSVStream(battleEndPath, (row) => {
    const game_id_str = row.game_id_str
    const playerType = parseInt(row.player_type)
    const rank = parseInt(row.player_rank)

    if (playerType !== 1) return
    if (isNaN(rank) || rank < 1) return

    allRanks.add(rank)

    const hasBot = gameHasBotMap.get(game_id_str)
    // 使用战斗时的段位组（考虑段位变化）
    const rankGroup = getBattleRankGroup(rank, hasBot)

    // 解析噜咪阵容
    let lumis = []
    try {
      const jsonStr = row.player_lumis.replace(/""/g, '"')
      lumis = JSON.parse(jsonStr)
    } catch (e) {
      return
    }

    const battleResult = parseInt(row.battle_result)
    const isWin = battleResult === 1

    // 更新组合
    const updateCombos = []

    // 高级段位不允许人机对战，with-bot 和 no-bot 应该相同
    if (shouldCountBoth(rank)) {
      updateCombos.push('all-with-bot', 'all-no-bot')
      updateCombos.push(`${rankGroup}-with-bot`, `${rankGroup}-no-bot`)
    } else {
      // 其他段位按正常逻辑
      updateCombos.push(hasBot ? 'all-with-bot' : 'all-no-bot')
      updateCombos.push(hasBot ? `${rankGroup}-with-bot` : `${rankGroup}-no-bot`)
    }

    updateCombos.forEach(key => {
      battleCountMap.set(key, (battleCountMap.get(key) || 0) + 1)
    })

    // 更新噜咪统计
    lumis.forEach(lumi => {
      const lumiId = lumi.lumi_id
      const lumiName = lumi.lumi_name

      updateCombos.forEach(key => {
        const statsMap = lumiStatsMap.get(key)

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
    })

    // 高级段位队伍（只用原始 rank 判断）
    if (rank >= 151) {
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
    }

    successCount++
  })

  console.log(`处理完成！`)
  console.log(`  - battle_end: ${successCount} 场战斗`)

  // 构建统计数据
  const stats = {}

  combinations.forEach(key => {
    const statsMap = lumiStatsMap.get(key)
    const totalBattles = battleCountMap.get(key) || 1

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

    stats[key] = {
      appearance: appearanceData,
      winRate: winRateData,
      totalBattles,
      rankRange: { min: 1, max: 151 }
    }
  })

  // 构建高级段位热门队伍
  const highRankTeams = Array.from(teamUsage.values())
    .sort((a, b) => b.battles - a.battles)
    .slice(0, 50)
    .map(team => ({
      ...team,
      winRate: ((team.wins / team.battles) * 100).toFixed(2)
    }))

  // 统计玩家段位分布
  const playerRankDistribution = {
    bronze: 0,    // 1-30
    silver: 0,    // 31-60
    gold: 0,      // 61-90
    diamond: 0,   // 91-120
    star: 0,      // 121-150
    legend: 0,    // 151
    total: playerMaxRank.size
  }

  playerMaxRank.forEach(rank => {
    if (rank >= 1 && rank <= 30) {
      playerRankDistribution.bronze++
    } else if (rank >= 31 && rank <= 60) {
      playerRankDistribution.silver++
    } else if (rank >= 61 && rank <= 90) {
      playerRankDistribution.gold++
    } else if (rank >= 91 && rank <= 120) {
      playerRankDistribution.diamond++
    } else if (rank >= 121 && rank <= 150) {
      playerRankDistribution.star++
    } else if (rank === 151) {
      playerRankDistribution.legend++
    }
  })

  // 打印详细的段位分布（调试用）
  console.log('\n详细段位分布:')
  const rankCount = new Map()
  playerMaxRank.forEach(rank => {
    rankCount.set(rank, (rankCount.get(rank) || 0) + 1)
  })
  const sortedRanks = Array.from(rankCount.entries()).sort((a, b) => a[0] - b[0])
  sortedRanks.forEach(([rank, count]) => {
    if (count > 10) { // 只显示人数超过10的段位
      console.log(`  段位 ${rank}: ${count} 人`)
    }
  })

  // 构建最终输出
  const output = {
    updateTime: new Date().toISOString(),
    totalBattles: successCount,
    rankGroups,
    allRanks: Array.from(allRanks).sort((a, b) => a - b),
    stats,
    highRankTeams,
    playerRankDistribution
  }

  // 写入输出文件
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')

  console.log('\n数据处理完成！')
  console.log(`输出文件: ${outputPath}`)
  console.log(`\n各组合的战斗场次:`)
  combinations.forEach(key => {
    console.log(`  ${key}: ${battleCountMap.get(key)} 场`)
  })
  console.log(`\n噜咪数量 (all-with-bot): ${lumiStatsMap.get('all-with-bot').size}`)
  console.log(`高级段位队伍数量: ${highRankTeams.length}`)
  console.log(`\n玩家段位分布:`)
  console.log(`  青铜 (1-30): ${playerRankDistribution.bronze} 人`)
  console.log(`  白银 (31-60): ${playerRankDistribution.silver} 人`)
  console.log(`  黄金 (61-90): ${playerRankDistribution.gold} 人`)
  console.log(`  钻石 (91-120): ${playerRankDistribution.diamond} 人`)
  console.log(`  星耀 (121-150): ${playerRankDistribution.star} 人`)
  console.log(`  传说 (151): ${playerRankDistribution.legend} 人`)
  console.log(`  总计: ${playerRankDistribution.total} 人`)
}

// 运行处理
processBattleData().catch(console.error)
