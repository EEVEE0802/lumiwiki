// 批量按区间拉取 + 本地按 part_date 拆分到 daily 分片
// 用于稀疏事件（tournament / guild-war 空日期时数数扫描全表极慢）
// 一次 SQL 拉 [start, end] 全部行 → 按 part_date 分组写多个 daily CSV
//
// 用法:
//   node scripts/backfill-daily-batch.mjs --region overseas --mode tournament --start 2026-07-10 --end 2026-08-23
//
// 用途：backfill-daily.mjs 逐天太慢时用这个替代。
// 日常增量拉取仍走 backfill-daily.mjs（每次只拉 1-2 天，按天扫更快）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'
import { fetchCsv } from './ta-fetch.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')

const args = process.argv.slice(2)
const getArg = name => {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : null
}
const region = getArg('--region')
const mode = getArg('--mode')
const startDate = getArg('--start')
const endDate = getArg('--end')
const force = args.includes('--force')

if (!region || !mode || !startDate || !endDate) {
  console.error('用法: node scripts/backfill-daily-batch.mjs --region <domestic|overseas> --mode <mode> --start YYYY-MM-DD --end YYYY-MM-DD [--force]')
  process.exit(1)
}

const VALID_MODES = new Set(['ladder', 'tournament', 'login', 'infinity-gym', 'guild-war', 'assist'])
if (!VALID_MODES.has(mode)) {
  console.error(`未知 mode: ${mode}`)
  process.exit(1)
}

// 先拉整个区间到临时 CSV
const tmpPath = path.join(PROJECT_ROOT, `data/${region}/archive/_batch_tmp_${mode}_${startDate}_${endDate}.csv`)
console.log(`\n===== 批量拉取 → 按天拆分 =====`)
console.log(`区域: ${region}, 模式: ${mode}`)
console.log(`区间: ${startDate} ~ ${endDate}`)
console.log(`临时文件: ${tmpPath}\n`)

// 检查已有的 daily 文件，非 --force 模式下已存在的天跳过整个批次
if (!force) {
  const s = new Date(startDate + 'T00:00:00+08:00')
  const e = new Date(endDate + 'T00:00:00+08:00')
  let allExist = true
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
    const date = `${y}-${m}-${day}`
    const outPath = path.join(PROJECT_ROOT, `data/${region}/archive/daily/${mode}/${date}.csv`)
    if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
      allExist = false
      break
    }
  }
  if (allExist) {
    console.log(`✓ 所有天 daily CSV 已存在，跳过（--force 强制覆盖）`)
    process.exit(0)
  }
}

await fetchCsv(region, mode, startDate, endDate, tmpPath)
const tmpSize = fs.statSync(tmpPath).size
console.log(`\n批量文件大小: ${(tmpSize / 1024 / 1024).toFixed(2)} MB\n`)

// CSV 解析（简单版：只用来找 part_date 列）
function parseCSVLine(line) {
  const result = []
  let current = '', inQuotes = false, i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === '"') {
      if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i += 2 }
      else { inQuotes = !inQuotes; i++ }
    } else if (ch === ',' && !inQuotes) { result.push(current); current = ''; i++ }
    else { current += ch; i++ }
  }
  result.push(current)
  return result
}

console.log(`按 part_date 分组写入 daily CSV...`)
const rl = readline.createInterface({ input: fs.createReadStream(tmpPath), crlfDelay: Infinity })
let header = null
let partDateIdx = -1
const streamByDate = new Map()  // date -> writable stream
const countByDate = new Map()

function getOrCreateStream(date) {
  let s = streamByDate.get(date)
  if (s) return s
  const outPath = path.join(PROJECT_ROOT, `data/${region}/archive/daily/${mode}/${date}.csv`)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  s = fs.createWriteStream(outPath)
  s.write(header + '\n')
  streamByDate.set(date, s)
  countByDate.set(date, 0)
  return s
}

for await (const line of rl) {
  if (!line) continue
  if (header === null) {
    header = line
    const cols = parseCSVLine(line).map(h => h.replace(/^﻿/, '').trim())
    partDateIdx = cols.indexOf('part_date')
    if (partDateIdx === -1) {
      console.error(`❌ 表头未找到 part_date 列: ${line}`)
      process.exit(1)
    }
    continue
  }
  const values = parseCSVLine(line)
  let rawDate = (values[partDateIdx] || '').trim()
  // part_date 有时被引号包裹（'2026-08-07'），parseCSVLine 已剥离外层引号，直接用
  if (!rawDate) continue
  const s = getOrCreateStream(rawDate)
  if (!s.write(line + '\n')) {
    await new Promise(r => s.once('drain', r))
  }
  countByDate.set(rawDate, (countByDate.get(rawDate) || 0) + 1)
}

// 关闭所有流
await Promise.all([...streamByDate.values()].map(s => new Promise(r => s.end(r))))

// 打印各天行数
const dates = [...streamByDate.keys()].sort()
console.log(`\n拆分完成，共 ${dates.length} 天:`)
for (const d of dates) {
  console.log(`  ${d}: ${countByDate.get(d).toLocaleString('en-US')} 行`)
}

// 补写空日期（区间内没有事件的天，也建一个只有表头的 CSV，避免每天定时任务重复覆盖时不一致）
const s = new Date(startDate + 'T00:00:00+08:00')
const e = new Date(endDate + 'T00:00:00+08:00')
let emptyDates = 0
for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  const date = `${y}-${m}-${day}`
  if (!streamByDate.has(date)) {
    const outPath = path.join(PROJECT_ROOT, `data/${region}/archive/daily/${mode}/${date}.csv`)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, header + '\n', 'utf-8')
    emptyDates++
  }
}
if (emptyDates > 0) console.log(`  另 ${emptyDates} 天区间内无事件（仅写表头）`)

// 删除临时文件
fs.unlinkSync(tmpPath)
console.log(`\n✅ 完成，临时文件已删除`)
