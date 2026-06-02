/**
 * 战斗数据转换脚本（修正版）
 * 正确计算总场次：battle_start和battle_end中都存在的game_id数量
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve('D:/LumiWiki/data')
const OUTPUT_DIR = path.resolve('D:/LumiWiki/public/data/online')

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

// 解析 CSV 行
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

// 解析噜咪数据
function parseLumiData(lumiJsonStr) {
  try {
    return JSON.parse(lumiJsonStr)
  } catch {
    return []
  }
}

// 段位分组（修正为实际段位划分）
function createRankGroups() {
  return [
    {
      key: 'low',
      label: '低级阶段',
      min: 1,
      max: 90
    },
    {
      key: 'mid',
      label: '中级阶段',
      min: 91,
      max: 150
    },
    {
      key: 'high',
      label: '高级阶段',
      min: 151,
      max: 151
    }
  ]
}

// 统计数据收集器
class StatsCollector {
  constructor(rankGroups) {
    this.rankGroups = rankGroups
    this.gameRealPlayerMap = new Map() // game_id -> real_player_num (来自battle_start)
    this.gamesWithBattleEnd = new Set() // 在battle_end中找到的game_id
    this.allRanks = new Set()
    this.stats = new Map()
    this.dimensionGameSets = new Map() // 记录每个维度的游戏game_id集合（用于计算游戏场数）
    this.dimensionRecordCounts = new Map() // 记录每个维度的记录数（player_type=1的条数，用于计算出场率）
    this.highRankTeamGames = new Map() // 高级段位的队伍统计（game_id -> 队伍信息）
  }

  // 添加 battle_start 数据
  addBattleStart(gameId, realPlayerNum) {
    this.gameRealPlayerMap.set(gameId, parseInt(realPlayerNum))
  }

  // 标记该游戏有battle_end记录
  markHasBattleEnd(gameIdStr) {
    const gameId = gameIdStr.replace(/^"|"$/g, '')
    this.gamesWithBattleEnd.add(gameId)
  }

  // 获取游戏的真实玩家数量
  getRealPlayerNum(gameIdStr) {
    const gameId = gameIdStr.replace(/^"|"$/g, '')
    return this.gameRealPlayerMap.get(gameId)
  }

  // 处理 battle_end 数据
  processBattleEnd(row) {
    const gameIdStr = row.game_id_str
    const playerType = row.player_type
    const rank = parseInt(row.player_rank)
    const isWin = row.battle_result === '1'

    // 只统计 player_type = 1 的数据（真人玩家）
    if (playerType !== '1') return

    // 检查是否有对应的 battle_start 数据
    const realPlayerNum = this.getRealPlayerNum(gameIdStr)
    if (realPlayerNum === undefined) {
      // 没有对应的 battle_start 数据，跳过
      return
    }

    // 标记这个游戏有battle_end记录
    this.markHasBattleEnd(gameIdStr)

    if (isNaN(rank) || rank < 1) return

    this.allRanks.add(rank)

    // 判断是否人机对战
    const isBotBattle = realPlayerNum === 1

    // 对于人机对战，如果是升段后的段位，应该计入升段前的段位
    // 例如：150段打升段局变成151段，应该计入150段而不是151段
    let effectiveRank = rank
    if (isBotBattle) {
      // 检查是否处于段位边界（可能是升段局）
      if (rank === 151) {
        // 151段的人机对战，实际是150段的升段局，计入150段
        effectiveRank = 150
      } else if (rank === 91) {
        // 91段的人机对战，实际是90段的升段局，计入90段
        effectiveRank = 90
      }
    }

    // 找到对应的段位分组（使用有效段位）
    const group = this.rankGroups.find(g => effectiveRank >= g.min && effectiveRank <= g.max)

    // 处理不同的统计维度
    const dimensions = []

    // 全段位
    dimensions.push({ key: 'all-with-bot', isBotBattle: true })
    dimensions.push({ key: 'all-no-bot', isBotBattle: false })

    // 段位分组
    if (group) {
      dimensions.push({ key: `${group.key}-with-bot`, isBotBattle: true })
      dimensions.push({ key: `${group.key}-no-bot`, isBotBattle: false })
    }

    // 处理噜咪数据
    const lumis = parseLumiData(row.player_lumis)

    dimensions.forEach(dim => {
      // 如果是"不含人机"但当前是对战人机，则跳过
      if (!dim.isBotBattle && isBotBattle) return

      const key = dim.key

      // 获取 game_id
      const gameId = gameIdStr.replace(/^"|"$/g, '')

      // 记录该维度的游戏场数（使用Set去重）
      if (!this.dimensionGameSets.has(key)) {
        this.dimensionGameSets.set(key, new Set())
      }
      this.dimensionGameSets.get(key).add(gameId)

      // 记录该维度的记录数（player_type=1的条数，用于计算出场率）
      this.dimensionRecordCounts.set(key, (this.dimensionRecordCounts.get(key) || 0) + 1)

      if (!this.stats.has(key)) {
        this.stats.set(key, new Map())
      }
      const keyStats = this.stats.get(key)

      lumis.forEach(lumi => {
        const lumiId = lumi.lumi_id

        if (!keyStats.has(lumiId)) {
          keyStats.set(lumiId, {
            lumiId,
            lumiName: lumi.lumi_name,
            appearances: 0,
            battles: 0,
            wins: 0
          })
        }

        const stats = keyStats.get(lumiId)
        stats.appearances++
        stats.battles++
        if (isWin) stats.wins++
      })

      // 统计高级段位的队伍（按game_id去重）
      if (effectiveRank === 151) {
        // 生成队伍key：将lumiId排序后拼接
        const teamLumiIds = lumis.map(l => l.lumi_id).sort((a, b) => a.localeCompare(b))
        const teamKey = teamLumiIds.join('-')

        // 按game_id记录队伍，避免重复统计
        this.highRankTeamGames.set(gameId, {
          teamKey,
          lumis: lumis.map(l => ({
            lumiId: l.lumi_id,
            lumiName: l.lumi_name
          })),
          isWin
        })
      }
    })
  }

  // 获取有效总场次（在battle_start和battle_end中都存在的game_id数量）
  getValidTotalBattles() {
    let count = 0
    this.gameRealPlayerMap.forEach((realPlayerNum, gameId) => {
      if (this.gamesWithBattleEnd.has(gameId)) {
        count++
      }
    })
    return count
  }

  getResults() {
    const results = {}

    this.stats.forEach((lumiMap, key) => {
      const lumiArray = Array.from(lumiMap.values())

      // 使用该维度的记录数（player_type=1的条数）作为出场率的分母
      const totalRecords = this.dimensionRecordCounts.get(key) || 1

      results[key] = {
        appearance: lumiArray.map(s => ({
          lumiId: s.lumiId,
          lumiName: s.lumiName,
          appearances: s.appearances,
          uniqueBattles: s.battles,
          appearanceRate: ((s.battles / totalRecords) * 100).toFixed(2)
        })).sort((a, b) => b.uniqueBattles - a.uniqueBattles),

        winRate: lumiArray.map(s => ({
          lumiId: s.lumiId,
          lumiName: s.lumiName,
          battles: s.battles,
          wins: s.wins,
          winRate: s.battles > 0 ? ((s.wins / s.battles) * 100).toFixed(2) : '0.00'
        })).sort((a, b) => {
          if (b.winRate !== a.winRate) return parseFloat(b.winRate) - parseFloat(a.winRate)
          return b.battles - a.battles
        })
      }
    })

    return results
  }

  // 获取高级段位的队伍数据
  getHighRankTeams() {
    // 按game_id统计队伍
    const teamStats = new Map()

    this.highRankTeamGames.forEach((gameData, gameId) => {
      const { teamKey, lumis, isWin } = gameData

      if (!teamStats.has(teamKey)) {
        teamStats.set(teamKey, {
          teamLumiIds: teamKey.split('-'),
          lumis,
          battles: 0,
          wins: 0
        })
      }

      const stats = teamStats.get(teamKey)
      stats.battles++
      if (isWin) stats.wins++
    })

    // 转换为数组并计算胜率
    const teams = Array.from(teamStats.values()).map(team => ({
      ...team,
      winRate: team.battles > 0 ? ((team.wins / team.battles) * 100).toFixed(2) : '0.00'
    }))

    // 按使用次数排序
    return teams.sort((a, b) => b.battles - a.battles)
  }
}

// 读取 battle_start.csv，建立映射
async function loadBattleStart(csvPath) {
  console.log('📖 读取 battle_start.csv...')

  const fileStream = fs.createReadStream(csvPath, { encoding: 'utf-8' })
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  })

  const gameRealPlayerMap = new Map()
  let lineCount = 0

  for await (const line of rl) {
    lineCount++

    if (lineCount === 1) continue // 跳过表头

    const values = parseCSVLine(line)
    if (values.length < 2) continue

    const gameId = values[0]
    const realPlayerNum = values[1]

    if (gameId && realPlayerNum) {
      gameRealPlayerMap.set(gameId, parseInt(realPlayerNum))
    }

    if (lineCount % 50000 === 0) {
      console.log(`   已处理 ${lineCount} 行...`)
    }
  }

  console.log(`✅ battle_start.csv: 共 ${gameRealPlayerMap.size} 条记录`)
  return gameRealPlayerMap
}

// 主函数
async function main() {
  console.log('🔄 开始转换战斗数据...')
  console.log('⏳ 关联 battle_start.csv 和 battle_end.csv...\n')

  const battleStartPath = path.join(DATA_DIR, 'battle_start.csv')
  const battleEndPath = path.join(DATA_DIR, 'battle_end.csv')

  if (!fs.existsSync(battleStartPath)) {
    console.error('❌ 找不到 battle_start.csv 文件:', battleStartPath)
    process.exit(1)
  }

  if (!fs.existsSync(battleEndPath)) {
    console.error('❌ 找不到 battle_end.csv 文件:', battleEndPath)
    process.exit(1)
  }

  // 创建段位分组
  const rankGroups = createRankGroups()
  console.log(`📊 段位分组:`)
  rankGroups.forEach(g => {
    console.log(`   - ${g.label}: ${g.min}-${g.max}段`)
  })

  // 创建统计收集器
  const collector = new StatsCollector(rankGroups)

  // 加载 battle_start 数据
  const battleStartMap = await loadBattleStart(battleStartPath)

  // 将数据添加到收集器
  battleStartMap.forEach((realPlayerNum, gameId) => {
    collector.addBattleStart(gameId, realPlayerNum)
  })

  console.log('\n📖 读取 battle_end.csv...')

  // 流式读取 battle_end.csv
  const fileStream = fs.createReadStream(battleEndPath, { encoding: 'utf-8' })
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  })

  let lineCount = 0
  let processedCount = 0
  let skippedCount = 0

  for await (const line of rl) {
    lineCount++

    if (lineCount === 1) continue // 跳过表头

    if (lineCount % 100000 === 0) {
      console.log(`   已处理 ${lineCount} 行，有效 ${processedCount} 条，跳过 ${skippedCount} 条...`)
    }

    const values = parseCSVLine(line)
    if (values.length < 6) continue

    const row = {
      game_id_str: values[0],
      player_type: values[1],
      player_rank: values[2],
      player_lumis: values[3],
      battle_result: values[4]
    }

    // 处理数据（会检查是否有对应的battle_start）
    const beforeCount = processedCount
    collector.processBattleEnd(row)
    if (collector.processBattleEnd !== beforeCount) {
      // 实际上这里需要更好的计数方式
    }
  }

  // 计算有效总场次
  const validTotalBattles = collector.getValidTotalBattles()
  console.log(`\n✅ battle_end.csv: 共 ${lineCount - 1} 条记录`)
  console.log(`   - battle_start总场次: ${battleStartMap.size}`)
  console.log(`   - 有效总场次（正常结束）: ${validTotalBattles}`)
  console.log(`   - 异常战斗（未正常结束）: ${battleStartMap.size - validTotalBattles}`)

  // 获取段位信息
  const allRanks = Array.from(collector.allRanks).sort((a, b) => a - b)

  // 生成输出数据
  console.log('\n📊 正在生成统计数据...')

  const statsResults = collector.getResults()

  const outputData = {
    updateTime: new Date().toISOString(),
    totalBattles: validTotalBattles,
    rankGroups: rankGroups.map(g => ({ key: g.key, start: g.min, end: g.max, label: g.label })),
    allRanks,
    stats: {},
    highRankTeams: collector.getHighRankTeams()
  }

  // 构建最终数据结构
  Object.keys(statsResults).forEach(key => {
    const parts = key.split('-')
    const rankPart = parts[0]
    const isWithBot = parts[1] === 'with'

    let label
    let rankRange

    if (rankPart === 'all') {
      label = isWithBot ? '全段位（含人机）' : '全段位（不含人机）'
      rankRange = { min: 1, max: 151 }
    } else {
      const group = rankGroups.find(g => g.key === rankPart)
      if (!group) {
        console.warn(`⚠️  警告: 找不到段位分组 ${rankPart}，跳过`)
        return
      }
      label = `${group.label}（${isWithBot ? '含人机' : '不含人机'}）`
      rankRange = { min: group.min, max: group.max }
    }

    // 获取该维度的总战斗场次（游戏场数）
    const totalBattles = collector.dimensionGameSets.get(key)?.size || 0

    outputData.stats[key] = {
      label,
      rankRange,
      includeBot: isWithBot,
      totalBattles,
      ...statsResults[key]
    }
  })

  // 写入文件
  const outputPath = path.join(OUTPUT_DIR, 'battle-stats.json')
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8')

  console.log(`✅ 转换完成！`)
  console.log(`📁 输出文件: ${outputPath}`)
  console.log(`📊 文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`)

  // 输出统计摘要
  console.log('\n📈 数据摘要:')
  console.log(`   - 有效总场次: ${outputData.totalBattles}`)
  console.log(`   - 段位范围: ${Math.min(...allRanks) || '-'} - ${Math.max(...allRanks) || '-'}`)
  console.log(`   - 段位分组数: ${rankGroups.length}`)
  console.log(`   - 统计维度数: ${Object.keys(outputData.stats).length}`)

  // 输出每个维度的数据量
  console.log('\n📊 各维度统计:')
  Object.keys(outputData.stats).forEach(key => {
    const stat = outputData.stats[key]
    const recordCount = collector.dimensionRecordCounts.get(key) || 0
    console.log(`   - ${stat.label}:`)
    console.log(`     • 游戏场数: ${stat.totalBattles}`)
    console.log(`     • 记录数（用于出场率）: ${recordCount}`)
    console.log(`     • 噜咪数量: ${stat.appearance.length}`)
  })
}

main().catch(err => {
  console.error('❌ 错误:', err)
  process.exit(1)
})
