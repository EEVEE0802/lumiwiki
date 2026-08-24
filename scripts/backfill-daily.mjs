// 按天回填历史数据到 daily 分片目录
// 用法:
//   node scripts/backfill-daily.mjs --region domestic --modes infinity-gym,assist --start 2026-07-10 --end 2026-08-23
//
// 输出路径: data/{region}/archive/daily/{mode}/{YYYY-MM-DD}.csv
// 默认幂等：已存在的文件跳过；加 --force 强制覆盖
//
// 常见用例:
//   补齐国内 gym: node scripts/backfill-daily.mjs --region domestic --modes infinity-gym,assist --start 2026-07-10 --end 2026-08-23
//   补齐海外 gym: node scripts/backfill-daily.mjs --region overseas --modes infinity-gym,assist --start 2026-07-10 --end 2026-08-23

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchCsv } from './ta-fetch.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')

const args = process.argv.slice(2)
const getArg = name => {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : null
}
const region = getArg('--region')
const modesArg = getArg('--modes')
const startDate = getArg('--start')
const endDate = getArg('--end')
const force = args.includes('--force')

if (!region || !modesArg || !startDate || !endDate) {
  console.error('用法: node scripts/backfill-daily.mjs --region <domestic|overseas> --modes m1,m2 --start YYYY-MM-DD --end YYYY-MM-DD [--force]')
  process.exit(1)
}
if (!['domestic', 'overseas'].includes(region)) {
  console.error(`未知 --region: ${region}`)
  process.exit(1)
}
const modes = modesArg.split(',').map(s => s.trim()).filter(Boolean)
const VALID_MODES = new Set(['ladder', 'tournament', 'login', 'infinity-gym', 'guild-war', 'assist'])
for (const m of modes) {
  if (!VALID_MODES.has(m)) {
    console.error(`未知 mode: ${m}（支持: ${[...VALID_MODES].join(', ')}）`)
    process.exit(1)
  }
}

// 生成 [startDate, endDate] 之间所有日期（含首尾）
function* eachDay(start, end) {
  const s = new Date(start + 'T00:00:00+08:00')
  const e = new Date(end + 'T00:00:00+08:00')
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    yield `${y}-${m}-${day}`
  }
}

const allDates = [...eachDay(startDate, endDate)]
console.log(`\n===== 按天回填 (region=${region}) =====`)
console.log(`日期范围: ${startDate} ~ ${endDate}（共 ${allDates.length} 天）`)
console.log(`模式: ${modes.join(', ')}`)
console.log(`总任务数: ${allDates.length * modes.length}`)
console.log(`是否强制覆盖: ${force ? '是' : '否（已存在文件跳过）'}\n`)

let done = 0, skipped = 0, failed = 0
const failedTasks = []

// 按模式外层、日期内层遍历：同一 mode 连续跑，方便观察进度
for (const mode of modes) {
  console.log(`\n──── [${region}/${mode}] ────`)
  for (const date of allDates) {
    const outPath = path.join(PROJECT_ROOT, `data/${region}/archive/daily/${mode}/${date}.csv`)

    if (!force && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
      skipped++
      continue
    }

    // fetchCsv 里的 fetchWithRetry 只在网络层重试；SQL 任务提交/CSV 分页大文件下载过程中
    // 若 undici socket 中途挂掉（"terminated" 错误），下载已经写了一半，脚本会 throw。
    // 这里在整个 fetchCsv 层再加一层重试，重试时会重新 submit-sql 走全新任务
    let ok = false, lastErr
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        if (attempt > 0) console.log(`  🔁 [${region}/${mode}/${date}] 第 ${attempt + 1} 次尝试...`)
        await fetchCsv(region, mode, date, date, outPath)
        ok = true
      } catch (e) {
        lastErr = e
        console.warn(`  ⚠️  [${region}/${mode}/${date}] 第 ${attempt + 1} 次失败: ${e.message}`)
        // 大响应网络中断经常出现，等一会儿让服务端和 undici socket pool 都清干净再重试
        await new Promise(r => setTimeout(r, 3000 * (attempt + 1)))
      }
    }
    if (ok) {
      done++
    } else {
      failed++
      failedTasks.push({ region, mode, date, error: lastErr?.message || 'unknown' })
      console.error(`❌ ${region}/${mode}/${date} 三次尝试均失败: ${lastErr?.message}`)
    }
  }
}

console.log(`\n===== 回填完成 =====`)
console.log(`✅ 成功: ${done}`)
console.log(`⏭️  跳过（已存在）: ${skipped}`)
console.log(`❌ 失败: ${failed}`)
if (failedTasks.length) {
  console.log(`\n失败任务:`)
  failedTasks.forEach(t => console.log(`  ${t.region}/${t.mode}/${t.date}: ${t.error}`))
  process.exit(1)
}
