/**
 * 冒险掉落数据转换脚本（v2 - 对齐服务端真实逻辑）
 *
 * 服务端真实逻辑（F:/G36/LumiServer/.../cacheRoleAdventure.cpp getUnlockedLumiByCurMap）：
 *   1. 多阶段累积：遍历同 mapId 且 stage≤当前 的地图，【同 ID 噜咪后者覆盖前者权重】（非相加）
 *   2. 霸主权重在 LumiWeight / LumiWeight2 数组的【最后一个元素】（长度 = NormalLumi.length + 1）
 *   3. LumiWeight = 霸主出现前权重；LumiWeight2 = 霸主被捕获后权重（赛季地图为空）
 *   4. 彩色噜咪走独立保底（GachaParameter → LumiDrop → LumiDropData），
 *      权重按 LumiDrop.WeightPool 从 LumiDropData.weight[[key,value]] 取对应 key 的值
 *
 * ⚠️ 简化点（动态逻辑无法静态精确）：
 *   - 彩色受保底机制影响（1/2/5 倍率不出彩、次数/概率保底），此为「保底触发时池内分布」近似
 *   - 赛季不放回抽取（SamplingWithoutReplacement）未建模，此为首次遇到分布
 *   - 普通概率用「解锁池权重占比」近似综合出现率（未按品质两步加权）
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = 'F:/G36/LumiGoDesigner/Config/Luban/Datas/Table/data'
const SERVER_DATA_DIR = 'F:/G36/LumiGoDesigner/Config/Luban/Datas/server/data'
const OUTPUT_DIR = path.resolve('D:/LumiWiki/public/data/adventure')
const PUBLIC_DATA_DIR = path.resolve('D:/LumiWiki/public/data')

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
function loadTable(src, name) {
  const d = readJson(path.join(src, name))
  return Array.isArray(d) ? d : Object.values(d)
}

function loadSourceData() {
  console.log('📖 读取源数据...')
  const adventureMap = loadTable(SOURCE_DIR, 'AdventureMap.json')
  const lumis = loadTable(PUBLIC_DATA_DIR, 'Lumi.json')
  const localization = readJson(path.join(PUBLIC_DATA_DIR, 'zh-CN.json'))
  const lumiDropData = loadTable(SERVER_DATA_DIR, 'LumiDropData.json')
  const lumiDrop = loadTable(SERVER_DATA_DIR, 'LumiDrop.json')
  const gachaParameter = loadTable(SERVER_DATA_DIR, 'GachaParameter.json')
  console.log(`   - AdventureMap: ${adventureMap.length} | Lumi: ${lumis.length} | LumiDrop: ${lumiDrop.length} | LumiDropData: ${lumiDropData.length}`)
  return { adventureMap, lumis, localization, lumiDropData, lumiDrop, gachaParameter }
}

function getLumiName(lumiId, lumis, localization) {
  const lumi = lumis.find(l => l.Id === lumiId)
  if (!lumi) return `Lumi_${lumiId}`
  return localization[lumi.Name] || lumi.Name
}
function getMapName(key, localization) {
  return localization[key] || key
}
function pct(weight, total) {
  return total > 0 ? ((weight / total) * 100).toFixed(2) : '0.00'
}

// 把 pool（Map<lumiId, weight>）转为带概率的数组
function poolToList(pool, lumis, localization) {
  const total = [...pool.values()].reduce((s, w) => s + w, 0)
  return [...pool.entries()]
    .map(([lumiId, weight]) => ({
      id: lumiId,
      name: getLumiName(lumiId, lumis, localization),
      weight,
      probability: pct(weight, total),
    }))
    .sort((a, b) => b.weight - a.weight)
}

/**
 * 构造解锁池：遍历 records（stage 升序），【同 ID 后者覆盖前者】。
 * weightField: 'LumiWeight' | 'LumiWeight2'
 * includeOverlord: 是否把霸主（数组末尾权重）加入池
 */
function buildPool(records, weightField, includeOverlord) {
  const pool = new Map()
  records.forEach(r => {
    const weights = r[weightField] || []
    const normal = r.NormalLumi || []
    normal.forEach((lumiId, i) => {
      pool.set(lumiId, weights[i] || 0) // 覆盖
    })
    // 霸主权重在数组最后一个元素（长度 = NormalLumi.length + 1）
    if (includeOverlord && r.SpecialLumi && weights.length > normal.length) {
      pool.set(r.SpecialLumi, weights[weights.length - 1])
    }
  })
  return pool
}

// 彩色噜咪池：走 GachaParameter → LumiDrop → LumiDropData，按 WeightPool 取权重
function calcColorLumis(mapLumiIds, ctx) {
  const { lumiDrop, lumiDropData, lumis, localization, gachaParameter } = ctx
  // GachaParameter 各入口都指向同一个 LumiDropId（实测 Id=99）
  const dropId = gachaParameter[0]?.middleProbId?.Id
  const drop = lumiDrop.find(d => d.Id === dropId)
  if (!drop) return []

  const mapSet = new Set(mapLumiIds)
  const lumiById = new Map(lumis.map(l => [l.Id, l]))
  const candidates = []

  lumiDropData.forEach(ld => {
    // 池子过滤：LumiDropData.LumiDropPool 须包含 drop.LumiDropPool
    if (!(ld.LumiDropPool || []).includes(drop.LumiDropPool)) return
    // MapOwner=1 时限定为该地图能遇到的噜咪
    if (drop.MapOwner === 1 && !mapSet.has(ld.Id)) return
    const lumi = lumiById.get(ld.Id)
    if (!lumi) return
    // Score 评分下限过滤（实测 70）
    if (drop.Score && lumi.MaxScore < drop.Score) return
    // 关键：按 WeightPool 从 weight[[key,value]] 取对应 key 的值
    const w = (ld.weight || []).find(([k]) => k === drop.WeightPool)?.[1] || 0
    if (w > 0) candidates.push({ lumiId: ld.Id, weight: w })
  })

  const total = candidates.reduce((s, c) => s + c.weight, 0)
  return candidates
    .map(c => ({
      id: c.lumiId,
      name: getLumiName(c.lumiId, lumis, localization),
      weight: c.weight,
      probability: pct(c.weight, total),
    }))
    .sort((a, b) => b.weight - a.weight)
}

// 主线地图：每 mapId 多 stage，每 stage 构造「霸主出现前 / 霸主已抓」两个池
function processMainLineMaps(adventureMap, lumis, localization, colorCtx) {
  console.log('\n📊 处理主线地图...')
  // 按 mapId 分组（Order[0]），跳过赛季地图（IsUp=true）
  const groups = new Map()
  adventureMap.forEach(r => {
    if (r.IsUp) return
    if (!r.SpecialLumi) return
    const [mapId] = r.Order
    if (!groups.has(mapId)) groups.set(mapId, { mapId, mapNameKey: r.MapName, records: [] })
    groups.get(mapId).records.push(r)
  })

  const result = []
  groups.forEach(group => {
    group.records.sort((a, b) => a.Order[1] - b.Order[1]) // stage 升序
    const stages = []
    // 收集该 mapId 所有噜咪（彩色 MapOwner 过滤用）
    const allLumiIds = new Set()
    group.records.forEach(r => {
      ;(r.NormalLumi || []).forEach(id => allLumiIds.add(id))
      if (r.SpecialLumi) allLumiIds.add(r.SpecialLumi)
    })

    group.records.forEach((r, idx) => {
      const stageNum = idx + 1
      const subRecords = group.records.slice(0, idx + 1) // stage≤当前（覆盖累积）
      // 霸主出现前：LumiWeight，不含霸主（玩家尚未抓齐普通）
      const beforePool = buildPool(subRecords, 'LumiWeight', false)
      // 霸主已抓：LumiWeight2，含霸主（末尾权重）
      const afterPool = buildPool(subRecords, 'LumiWeight2', true)

      const beforeTotal = [...beforePool.values()].reduce((s, w) => s + w, 0)
      const afterTotal = [...afterPool.values()].reduce((s, w) => s + w, 0)

      stages.push({
        stage: stageNum,
        status: 'before',
        label: `阶段${stageNum} · 霸主出现前`,
        lumis: poolToList(beforePool, lumis, localization),
        totalWeight: beforeTotal,
      })
      stages.push({
        stage: stageNum,
        status: 'after',
        label: `阶段${stageNum} · 霸主已抓`,
        lumis: poolToList(afterPool, lumis, localization),
        totalWeight: afterTotal,
      })
    })

    result.push({
      mapId: group.mapId,
      mapName: getMapName(group.mapNameKey, localization),
      mapNameKey: group.mapNameKey,
      type: 'mainline',
      stages,
      colorLumis: calcColorLumis([...allLumiIds], colorCtx),
    })
  })
  return result.sort((a, b) => a.mapId - b.mapId)
}

// 赛季地图：NormalLumi + LumiWeight（若有）与 SeasonPool + SeasonLumiWeight 合并
function processSeasonMaps(adventureMap, lumis, localization, colorCtx) {
  console.log('\n📊 处理赛季地图...')
  const result = []
  adventureMap.forEach(r => {
    if (!r.IsUp) return // 只处理赛季
    const pool = new Map()
    ;(r.NormalLumi || []).forEach((id, i) => pool.set(id, r.LumiWeight?.[i] || 0))
    ;(r.SeasonPool || []).forEach((id, i) => pool.set(id, r.SeasonLumiWeight?.[i] || 0))

    const allLumiIds = [...(r.NormalLumi || []), ...(r.SeasonPool || [])]
    const total = [...pool.values()].reduce((s, w) => s + w, 0)

    result.push({
      mapId: r.Id,
      mapName: getMapName(r.MapName, localization),
      mapNameKey: r.MapName,
      type: 'season',
      lumis: poolToList(pool, lumis, localization),
      totalWeight: total,
      colorLumis: calcColorLumis(allLumiIds, colorCtx),
    })
  })
  return result.sort((a, b) => a.mapId - b.mapId)
}

async function main() {
  console.log('🔄 开始转换冒险掉落数据（v2 对齐服务端逻辑）...\n')
  const { adventureMap, lumis, localization, lumiDropData, lumiDrop, gachaParameter } = loadSourceData()
  const colorCtx = { lumiDrop, lumiDropData, lumis, localization, gachaParameter }

  const mainLineMaps = processMainLineMaps(adventureMap, lumis, localization, colorCtx)
  const seasonMaps = processSeasonMaps(adventureMap, lumis, localization, colorCtx)

  const outputData = {
    updateTime: new Date().toISOString(),
    note: '普通概率=解锁池权重占比；彩色=保底触发时池内分布近似（按 LumiDrop.WeightPool 取权）',
    mainLineMaps,
    seasonMaps,
  }
  const outputPath = path.join(OUTPUT_DIR, 'drop-rates.json')
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8')

  console.log('\n✅ 转换完成！')
  console.log(`📁 ${outputPath}  (${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB)`)
  console.log(`📊 主线 ${mainLineMaps.length} / 赛季 ${seasonMaps.length}`)
  console.log('\n📈 主线样例（首个地图各 stage 霸主前后）：')
  if (mainLineMaps[0]) {
    mainLineMaps[0].stages.forEach(s => {
      console.log(`   - ${s.label}: ${s.lumis.length} 只, 总权重 ${s.totalWeight}`)
    })
    console.log(`   - 彩色池: ${mainLineMaps[0].colorLumis.length} 只`)
  }
}

main().catch(err => { console.error('❌', err); process.exit(1) })
