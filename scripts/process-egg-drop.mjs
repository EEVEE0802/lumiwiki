/**
 * 蛋掉落数据转换脚本
 *
 * 数据链路：Item(type=6 LumiEgg) → itemUseId → ItemUse → 按 type 分支：
 *   - type=10 (LumiDrop 随机蛋) / type=12 (SelectionLumiDrop 自选先选后随)：
 *       Param1[].Id → LumiDrop → LumiDropData，按 WeightPool 取权 + Score/LumiType 过滤
 *       综合概率 = weight / 候选池总权重（跨品质近似，服务端是先品质后噜咪两步）
 *   - type=14 (SelectionLumiegg 自选多选一)：
 *       Param1[].Id 是固定 LumiRandId 列表 → 查 LumiRand 得 LumiId，每只 1/N 等概率
 *   - type=16 (LairLumiEgg 巢穴蛋)：无固定掉落，跳过
 *
 * 服务端核心函数 getLumiRandIdByLumiDrop（cacheBag.cpp:2298）与冒险掉落共用。
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = 'F:/G36/LumiGoDesigner/Config/Luban/Datas/Table/data'
const SERVER_DATA_DIR = 'F:/G36/LumiGoDesigner/Config/Luban/Datas/server/data'
const OUTPUT_DIR = path.resolve('D:/LumiWiki/public/data')
const PUBLIC_DATA_DIR = path.resolve('D:/LumiWiki/public/data')

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')) }
function loadTable(src, name) {
  const d = readJson(path.join(src, name))
  return Array.isArray(d) ? d : Object.values(d)
}
function getName(id, lumiMap, zh) {
  const l = lumiMap.get(id)
  if (!l) return `噜咪 #${id}`
  return zh[l.Name] || l.Name || `噜咪 #${id}`
}
function pct(w, total) { return total > 0 ? ((w / total) * 100).toFixed(2) : '0.00' }

// type=10/12：走 LumiDrop 概率池，返回 [{id, name, weight, probability}]
function calcDropLumis(param1, dropMap, lumiDropData, lumiMap, zh) {
  const pool = new Map() // lumiId -> weight（合并多个 ASR）
  ;(param1 || []).forEach(asr => {
    const drop = dropMap.get(asr.Id)
    if (!drop) return
    lumiDropData.forEach(ld => {
      if (!(ld.LumiDropPool || []).includes(drop.LumiDropPool)) return
      const lumi = lumiMap.get(ld.Id)
      if (!lumi) return
      if (drop.Score && lumi.MaxScore < drop.Score) return
      // 按 WeightPool 取权（key 匹配）
      const w = (ld.weight || []).find(([k]) => k === drop.WeightPool)?.[1] || 0
      if (w <= 0) return
      pool.set(ld.Id, (pool.get(ld.Id) || 0) + w)
    })
  })
  const total = [...pool.values()].reduce((s, w) => s + w, 0)
  return [...pool.entries()]
    .map(([id, weight]) => ({ id, name: getName(id, lumiMap, zh), weight, probability: pct(weight, total) }))
    .sort((a, b) => b.weight - a.weight)
}

// type=14：固定 LumiRandId 列表，每只 1/N
function calcFixedLumis(param1, randMap, lumiMap, zh) {
  const ids = (param1 || []).map(a => a.Id).filter(Boolean)
  const n = ids.length
  if (n === 0) return []
  const prob = pct(1, n)
  // RandId → LumiId（去重合并同 LumiId）
  const seen = new Map() // lumiId -> count
  ids.forEach(rid => {
    const r = randMap.get(rid)
    const lumiId = r?.LumiId ?? null
    if (lumiId == null) return
    seen.set(lumiId, (seen.get(lumiId) || 0) + 1)
  })
  return [...seen.entries()]
    .map(([id, count]) => ({ id, name: getName(id, lumiMap, zh), count, probability: pct(count, n) }))
    .sort((a, b) => b.count - a.count)
}

async function main() {
  console.log('🥚 开始转换蛋掉落数据...\n')
  const items = loadTable(SOURCE_DIR, 'Item.json').filter(i => i.type === 6)
  const itemUse = loadTable(SOURCE_DIR, 'ItemUse.json')
  const lumiDrop = loadTable(SERVER_DATA_DIR, 'LumiDrop.json')
  const lumiDropData = loadTable(SERVER_DATA_DIR, 'LumiDropData.json')
  const lumiRand = loadTable(SOURCE_DIR, 'LumiRand.json')
  const lumis = loadTable(PUBLIC_DATA_DIR, 'Lumi.json')
  const zh = readJson(path.join(PUBLIC_DATA_DIR, 'zh-CN.json'))

  const iuMap = new Map(itemUse.map(u => [u.useId, u]))
  const dropMap = new Map(lumiDrop.map(d => [d.Id, d]))
  const randMap = new Map(lumiRand.map(r => [r.Id, r]))
  const lumiMap = new Map(lumis.map(l => [l.Id, l]))

  const MODE_NAME = { 10: '随机蛋', 12: '自选蛋(先选后随)', 14: '自选蛋(多选一)' }
  const eggs = []
  let skipped = 0

  items.forEach(item => {
    const iu = iuMap.get(item.itemUseId)
    if (!iu) { skipped++; return }
    let lumisOut = null, mode = null
    if (iu.type === 10 || iu.type === 12) {
      mode = iu.type
      lumisOut = calcDropLumis(iu.Param1, dropMap, lumiDropData, lumiMap, zh)
    } else if (iu.type === 14) {
      mode = 14
      lumisOut = calcFixedLumis(iu.Param1, randMap, lumiMap, zh)
    } else {
      skipped++ // type=16 巢穴蛋等跳过
      return
    }
    eggs.push({
      eggId: item.key1,
      name: zh[item.name] || item.name,
      icon: item.icon,
      quality: item.quality,
      mode,
      modeName: MODE_NAME[mode],
      lumis: lumisOut,
    })
  })

  const output = {
    updateTime: new Date().toISOString(),
    note: '随机蛋综合概率=候选池权重占比近似（服务端先品质后噜咪，跨品质合并）；自选多选一=固定列表每只等概率；巢穴蛋无固定掉落已跳过',
    eggs,
  }
  const outPath = path.join(OUTPUT_DIR, 'egg-drop.json')
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8')

  console.log(`✅ 转换完成！蛋 ${eggs.length} 个（跳过 ${skipped}），→ ${outPath}`)
  console.log(`📊 文件大小: ${(fs.statSync(outPath).size / 1024).toFixed(2)} KB`)
  // 类型分布
  const dist = {}
  eggs.forEach(e => { dist[e.modeName] = (dist[e.modeName] || 0) + 1 })
  console.log('类型分布:', JSON.stringify(dist))
  console.log('\n样例(前3个蛋):')
  eggs.slice(0, 3).forEach(e => console.log(`  - ${e.name} [${e.modeName}]: ${e.lumis.length} 只候选`))
}

main().catch(err => { console.error('❌', err); process.exit(1) })
