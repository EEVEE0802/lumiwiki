/**
 * 冒险掉落数据转换脚本
 * 从 AdventureMap.json 生成各地图噜咪出现概率数据
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = 'D:/G36/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/Table/data'
const SERVER_DATA_DIR = 'D:/G36/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/server/data'
const OUTPUT_DIR = path.resolve('D:/LumiWiki/public/data/adventure')
const PUBLIC_DATA_DIR = path.resolve('D:/LumiWiki/public/data')

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

// 读取源数据
function loadSourceData() {
  console.log('📖 读取源数据...')

  const adventureMapPath = path.join(SOURCE_DIR, 'AdventureMap.json')
  const lumisPath = path.join(PUBLIC_DATA_DIR, 'Lumi.json')
  const localizationPath = path.join(PUBLIC_DATA_DIR, 'zh-CN.json')
  const lumiDropDataPath = path.join(SERVER_DATA_DIR, 'LumiDropData.json')

  const adventureMap = JSON.parse(fs.readFileSync(adventureMapPath, 'utf-8'))
  const lumis = JSON.parse(fs.readFileSync(lumisPath, 'utf-8'))
  const localization = JSON.parse(fs.readFileSync(localizationPath, 'utf-8'))
  const lumiDropData = JSON.parse(fs.readFileSync(lumiDropDataPath, 'utf-8'))

  console.log(`   - AdventureMap: ${adventureMap.length} 条记录`)
  console.log(`   - Lumi: ${lumis.length} 条记录`)
  console.log(`   - LumiDropData: ${lumiDropData.length} 条记录`)

  return { adventureMap, lumis, localization, lumiDropData }
}

// 获取地图名称
function getMapName(mapNameKey, localization) {
  return localization[mapNameKey] || mapNameKey
}

// 获取噜咪名称
function getLumiName(lumiId, lumis) {
  const lumi = lumis.find(l => l.Id === lumiId)
  return lumi ? lumi.Name : `Lumi_${lumiId}`
}

// 获取噜咪详细信息
function getLumiInfo(lumiId, lumis, localization) {
  const lumi = lumis.find(l => l.Id === lumiId)
  if (!lumi) return null

  const nameKey = lumi.Name
  const name = localization[nameKey] || nameKey

  return {
    id: lumiId,
    name: name,
    nameKey: nameKey
  }
}

// 计算概率
function calculateProbability(weight, totalWeight) {
  if (totalWeight === 0) return 0
  return ((weight / totalWeight) * 100).toFixed(2)
}

// 获取噜咪的彩色权重（weight数组的第二个数值，第一个参数忽略）
function getColorWeight(lumiId, lumiDropData) {
  const dropData = lumiDropData.find(d => d.Id === lumiId)
  if (!dropData || !dropData.weight || dropData.weight.length === 0) return 0

  // 直接取第一个weight项的第二个数值作为权重
  // weight格式: [[参数1, 权重值], ...]，参数1忽略，只用权重值
  return dropData.weight[0][1] || 0
}

// 计算彩色噜咪概率
function calculateColorProbabilities(lumiIds, lumis, localization, lumiDropData) {
  const lumiList = []

  lumiIds.forEach(lumiId => {
    const lumiInfo = getLumiInfo(lumiId, lumis, localization)
    if (!lumiInfo) return

    const weight = getColorWeight(lumiId, lumiDropData)
    if (weight > 0) {
      lumiList.push({
        ...lumiInfo,
        weight
      })
    }
  })

  const totalWeight = lumiList.reduce((sum, l) => sum + l.weight, 0)

  return lumiList.map(l => ({
    ...l,
    probability: calculateProbability(l.weight, totalWeight)
  })).sort((a, b) => b.weight - a.weight)
}

// 处理主线地图数据
function processMainLineMaps(adventureMap, lumis, localization, lumiDropData) {
  console.log('\n📊 处理主线地图...')

  // 按地图分组
  const mapGroups = new Map()

  adventureMap.forEach(record => {
    // 跳过赛季地图（SpecialLumi 为 0 或 null）
    if (!record.SpecialLumi || record.SpecialLumi === 0) {
      return
    }

    // Order 格式: [地图ID, 阶段]
    const [mapId, stage] = record.Order
    const key = mapId

    if (!mapGroups.has(key)) {
      mapGroups.set(key, {
        mapId,
        mapNameKey: record.MapName,
        stages: new Map()
      })
    }

    const group = mapGroups.get(key)
    group.stages.set(stage, record)
  })

  // 构建主线地图数据
  const mainLineMaps = []

  mapGroups.forEach((group, mapId) => {
    const stages = []
    let stage = 1

    // 获取所有阶段
    while (group.stages.has(stage)) {
      stages.push(group.stages.get(stage))
      stage++
    }

    if (stages.length === 0) return

    // 计算每个阶段的概率分布
    const stageData = []

    // 累积的噜咪和权重（用于后续阶段）
    let cumulativeLumis = [] // { lumiId, weightBefore, weightAfter }
    let cumulativeWeightBefore = 0
    let cumulativeWeightAfter = 0

    stages.forEach((stageRecord, index) => {
      const stageNum = index + 1
      const normalLumis = stageRecord.NormalLumi || []
      const specialLumi = stageRecord.SpecialLumi
      const weightsBefore = stageRecord.LumiWeight || []
      const weightsAfter = stageRecord.LumiWeight2 || []

      // 阶段1 霸主解锁前
      if (stageNum === 1) {
        const lumiList = normalLumis.map(lumiId => {
          const lumiInfo = getLumiInfo(lumiId, lumis, localization)
          const idx = normalLumis.indexOf(lumiId)
          return {
            ...lumiInfo,
            weight: weightsBefore[idx] || 0
          }
        })

        const totalWeight = lumiList.reduce((sum, l) => sum + l.weight, 0)

        stageData.push({
          stage: stageNum,
          status: 'before',
          label: `阶段${stageNum} - 霸主解锁前`,
          lumis: lumiList.map(l => ({
            ...l,
            probability: calculateProbability(l.weight, totalWeight)
          })),
          totalWeight
        })

        // 阶段1 霸主解锁后
        const lumiListAfter = [...normalLumis, specialLumi].map(lumiId => {
          const lumiInfo = getLumiInfo(lumiId, lumis, localization)
          const idx = [...normalLumis, specialLumi].indexOf(lumiId)
          return {
            ...lumiInfo,
            weight: weightsAfter[idx] || 0
          }
        })

        const totalWeightAfter = lumiListAfter.reduce((sum, l) => sum + l.weight, 0)

        stageData.push({
          stage: stageNum,
          status: 'after',
          label: `阶段${stageNum} - 霸主解锁后`,
          lumis: lumiListAfter.map(l => ({
            ...l,
            probability: calculateProbability(l.weight, totalWeightAfter)
          })),
          totalWeight: totalWeightAfter
        })

        // 设置累积数据
        cumulativeLumis = lumiListAfter.map(l => ({
          lumiId: l.id,
          weightBefore: l.weight,
          weightAfter: l.weight
        }))
        cumulativeWeightBefore = totalWeightAfter
        cumulativeWeightAfter = totalWeightAfter
      } else {
        // 阶段2及以后

        // 霸主解锁前 = 前一阶段霸主解锁后 + 当前阶段NormalLumi
        const newLumis = normalLumis.map(lumiId => {
          const lumiInfo = getLumiInfo(lumiId, lumis, localization)
          const idx = normalLumis.indexOf(lumiId)
          return {
            lumiId: lumiId,
            ...lumiInfo,
            weightBefore: weightsBefore[idx] || 0,
            weightAfter: weightsAfter[idx] || 0
          }
        })

        // 合并累积数据
        const mergedBefore = [...cumulativeLumis]
        newLumis.forEach(newLumi => {
          const existing = mergedBefore.find(l => l.lumiId === newLumi.lumiId)
          if (existing) {
            existing.weightBefore += newLumi.weightBefore
          } else {
            mergedBefore.push({
              lumiId: newLumi.lumiId,
              ...newLumi,
              weightBefore: newLumi.weightBefore,
              weightAfter: newLumi.weightAfter
            })
          }
        })

        const totalWeightBefore = mergedBefore.reduce((sum, l) => sum + l.weightBefore, 0)

        stageData.push({
          stage: stageNum,
          status: 'before',
          label: `阶段${stageNum} - 霸主解锁前`,
          lumis: mergedBefore.map(l => {
            const lumiInfo = getLumiInfo(l.lumiId, lumis, localization)
            return {
              ...lumiInfo,
              weight: l.weightBefore,
              probability: calculateProbability(l.weightBefore, totalWeightBefore)
            }
          }),
          totalWeight: totalWeightBefore
        })

        // 霸主解锁后 = 霸主解锁前 + 更新权重 + 添加当前阶段的SpecialLumi
        const mergedAfter = mergedBefore.map(l => {
          const newLumi = newLumis.find(n => n.lumiId === l.lumiId)
          return {
            ...l,
            weightAfter: newLumi ? newLumi.weightAfter : l.weightAfter
          }
        })

        // 添加当前阶段的SpecialLumi
        const specialLumiInfo = getLumiInfo(specialLumi, lumis, localization)
        const specialWeightIndex = normalLumis.length // SpecialLumi的权重在LumiWeight2数组的最后
        mergedAfter.push({
          lumiId: specialLumi,
          ...specialLumiInfo,
          weightBefore: 0,
          weightAfter: weightsAfter[specialWeightIndex] || 0
        })

        const totalWeightAfter = mergedAfter.reduce((sum, l) => sum + l.weightAfter, 0)

        stageData.push({
          stage: stageNum,
          status: 'after',
          label: `阶段${stageNum} - 霸主解锁后`,
          lumis: mergedAfter.map(l => {
            const lumiInfo = getLumiInfo(l.lumiId, lumis, localization)
            return {
              ...lumiInfo,
              weight: l.weightAfter,
              probability: calculateProbability(l.weightAfter, totalWeightAfter)
            }
          }),
          totalWeight: totalWeightAfter
        })

        // 更新累积数据
        cumulativeLumis = mergedAfter.map(l => ({
          lumiId: l.lumiId,
          weightBefore: l.weightAfter,
          weightAfter: l.weightAfter
        }))
        cumulativeWeightBefore = totalWeightAfter
        cumulativeWeightAfter = totalWeightAfter
      }
    })

    // 计算彩色概率（基于地图中所有出现过的噜咪）
    const allLumiIdsInMap = new Set()
    stages.forEach(stageRecord => {
      const normalLumis = stageRecord.NormalLumi || []
      const specialLumi = stageRecord.SpecialLumi
      normalLumis.forEach(id => allLumiIdsInMap.add(id))
      if (specialLumi) allLumiIdsInMap.add(specialLumi)
    })

    const colorLumis = calculateColorProbabilities(
      Array.from(allLumiIdsInMap),
      lumis,
      localization,
      lumiDropData
    )

    mainLineMaps.push({
      mapId: group.mapId,
      mapName: getMapName(group.mapNameKey, localization),
      mapNameKey: group.mapNameKey,
      type: 'mainline',
      stages: stageData,
      colorLumis
    })
  })

  // 按地图ID排序
  return mainLineMaps.sort((a, b) => a.mapId - b.mapId)
}

// 处理赛季地图数据
function processSeasonMaps(adventureMap, lumis, localization, lumiDropData) {
  console.log('\n📊 处理赛季地图...')

  const seasonMaps = []

  adventureMap.forEach(record => {
    // 只处理赛季地图（SpecialLumi 为 0 或 null）
    if (record.SpecialLumi && record.SpecialLumi !== 0) {
      return
    }

    // Order 格式: [地图ID, 阶段] - 赛季地图通常是 [1000+, 1]
    const [mapId, stage] = record.Order

    const normalLumis = record.NormalLumi || []
    const seasonPool = record.SeasonPool || []
    const lumiWeights = record.LumiWeight || []
    const seasonLumiWeights = record.SeasonLumiWeight || []

    // 合并所有噜咪
    const allLumis = []

    // NormalLumi + 对应权重
    normalLumis.forEach((lumiId, idx) => {
      const lumiInfo = getLumiInfo(lumiId, lumis, localization)
      allLumis.push({
        ...lumiInfo,
        weight: lumiWeights[idx] || 0,
        pool: 'normal'
      })
    })

    // SeasonPool + 对应权重
    seasonPool.forEach((lumiId, idx) => {
      const lumiInfo = getLumiInfo(lumiId, lumis, localization)
      allLumis.push({
        ...lumiInfo,
        weight: seasonLumiWeights[idx] || 0,
        pool: 'season'
      })
    })

    const totalWeight = allLumis.reduce((sum, l) => sum + l.weight, 0)

    // 计算彩色概率
    const allLumiIds = [...normalLumis, ...seasonPool]
    const colorLumis = calculateColorProbabilities(
      allLumiIds,
      lumis,
      localization,
      lumiDropData
    )

    seasonMaps.push({
      mapId: record.Id,
      mapName: getMapName(record.MapName, localization),
      mapNameKey: record.MapName,
      type: 'season',
      lumis: allLumis.map(l => ({
        ...l,
        probability: calculateProbability(l.weight, totalWeight)
      })),
      totalWeight,
      colorLumis
    })
  })

  // 按地图ID排序
  return seasonMaps.sort((a, b) => a.mapId - b.mapId)
}

// 主函数
async function main() {
  console.log('🔄 开始转换冒险掉落数据...\n')

  // 读取源数据
  const { adventureMap, lumis, localization, lumiDropData } = loadSourceData()

  // 处理主线地图
  const mainLineMaps = processMainLineMaps(adventureMap, lumis, localization, lumiDropData)

  // 处理赛季地图
  const seasonMaps = processSeasonMaps(adventureMap, lumis, localization, lumiDropData)

  // 构建输出数据
  const outputData = {
    updateTime: new Date().toISOString(),
    mainLineMaps,
    seasonMaps
  }

  // 写入文件
  const outputPath = path.join(OUTPUT_DIR, 'drop-rates.json')
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8')

  console.log('\n✅ 转换完成！')
  console.log(`📁 输出文件: ${outputPath}`)
  console.log(`📊 文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`)

  // 输出统计摘要
  console.log('\n📈 数据摘要:')
  console.log(`   - 主线地图数量: ${mainLineMaps.length}`)
  console.log(`   - 赛季地图数量: ${seasonMaps.length}`)

  mainLineMaps.forEach(map => {
    console.log(`   - ${map.mapName}(${map.mapId}): ${map.stages.length} 个阶段状态, ${map.colorLumis?.length || 0} 只彩色噜咪`)
  })

  seasonMaps.forEach(map => {
    console.log(`   - ${map.mapName}(${map.mapId}): ${map.lumis.length} 只噜咪`)
  })
}

main().catch(err => {
  console.error('❌ 错误:', err)
  process.exit(1)
})
