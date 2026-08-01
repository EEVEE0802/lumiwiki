import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'
import { fetchCsv } from './ta-fetch.mjs'
import { ensureValidToken } from './ta-auth.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.join(__dirname, '..')

// 解析 --week 参数
const args = process.argv.slice(2)
const weekIdx = args.indexOf('--week')
const week = weekIdx !== -1 ? parseInt(args[weekIdx + 1]) : null

if (isNaN(week) || week < 1) {
  console.error('用法: node fetch-participation-trend.mjs --week N')
  process.exit(1)
}

// 读取 baseFriday（从 ta-config.json）
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'ta-config.json'), 'utf-8'))
const baseFriday = new Date(config.baseFriday + 'T03:00:00+08:00')

// 计算周时间范围
const startTime = new Date(baseFriday)
startTime.setDate(startTime.getDate() + (week - 1) * 7)
const endTime = new Date(startTime)
endTime.setDate(endTime.getDate() + 7)

const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 03:00:00`
const startTimeStr = fmt(startTime)
const endTimeStr = fmt(endTime)

console.log(`\n===== 参与走势拉取 Week ${week} =====`)
console.log(`时间范围: ${startTimeStr} ~ ${endTimeStr}`)

// 拉 player_login CSV
// --skip-fetch 参数：跳过拉取（用于本地测试已有 CSV 时）
const skipFetch = args.includes('--skip-fetch')
const loginCsvPath = path.join(PROJECT_ROOT, `data/archive/week${week}/login_week${week}.csv`)
if (skipFetch && fs.existsSync(loginCsvPath)) {
  console.log(`✓ --skip-fetch 且 login CSV 已存在，跳过拉取`)
} else {
  console.log(`\n📤 拉取 player_login 数据...`)
  await ensureValidToken()
  await fetchCsv('login', startTimeStr, endTimeStr, loginCsvPath)
}

const ladderCsvPath = path.join(PROJECT_ROOT, `data/archive/week${week}/ladder_week${week}.csv`)
const tournamentCsvPath = path.join(PROJECT_ROOT, `data/archive/week${week}/tournament_week${week}.csv`)

// CSV 解析（处理引号 + 双引号转义）
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

// 按日 distinct b_role_id
async function dailyDistinct(csvPath) {
  if (!fs.existsSync(csvPath)) return {}
  const fileStream = fs.createReadStream(csvPath)
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let headers = null
  let dateCols = []  // [{idx, date}]
  let bRoleIdIdx = -1
  const dailySets = {}  // date -> Set<b_role_id>

  for await (const line of rl) {
    if (!line.trim()) continue
    const values = parseCSVLine(line)
    if (!headers) {
      headers = values.map(h => h.replace(/^﻿/, '').trim())
      dateCols = headers
        .map((h, i) => /^\d{4}-\d{2}-\d{2}$/.test(h) ? { idx: i, date: h } : null)
        .filter(Boolean)
      bRoleIdIdx = headers.indexOf('b_role_id')
      if (bRoleIdIdx === -1) {
        console.error(`❌ CSV 未找到 b_role_id 列: ${csvPath}`)
        return {}
      }
      dateCols.forEach(({ date }) => dailySets[date] = new Set())
      continue
    }
    const bRoleId = values[bRoleIdIdx]
    if (!bRoleId) continue
    for (const { idx, date } of dateCols) {
      const count = parseInt(values[idx])
      if (count > 0) {
        dailySets[date].add(bRoleId)
      }
    }
  }

  const result = {}
  for (const [date, set] of Object.entries(dailySets)) {
    result[date] = set.size
  }
  return result
}

console.log(`\n处理 ladder CSV...`)
const ladderDaily = await dailyDistinct(ladderCsvPath)
console.log(`  天梯每日 distinct:`, ladderDaily)

console.log(`处理 tournament CSV...`)
const tournamentDaily = await dailyDistinct(tournamentCsvPath)
console.log(`  周赛每日 distinct:`, tournamentDaily)

console.log(`处理 login CSV...`)
const loginDaily = await dailyDistinct(loginCsvPath)
console.log(`  登录每日 distinct:`, loginDaily)

// 合并所有日期，计算比例
const allDates = [...new Set([
  ...Object.keys(ladderDaily),
  ...Object.keys(tournamentDaily),
  ...Object.keys(loginDaily)
])].sort()

const result = allDates.map(date => {
  const ladder = ladderDaily[date] || 0
  const tournament = tournamentDaily[date] || 0
  const login = loginDaily[date] || 0
  return {
    date,
    ladder,
    tournament,
    login,
    ladderRate: login > 0 ? +(ladder / login * 100).toFixed(2) : 0,
    tournamentRate: login > 0 ? +(tournament / login * 100).toFixed(2) : 0,
  }
})

const output = {
  updateTime: new Date().toISOString(),
  week,
  startTime: startTimeStr,
  endTime: endTimeStr,
  dates: result
}

const outputPath = path.join(PROJECT_ROOT, `public/data/online/weekly/participation-week${week}.json`)
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8')
console.log(`\n✓ 输出: ${outputPath}`)
console.log(`  共 ${result.length} 天`)
result.forEach(r => {
  console.log(`  ${r.date}: 天梯=${r.ladder} 周赛=${r.tournament} 登录=${r.login} (天梯占比=${r.ladderRate}% 周赛占比=${r.tournamentRate}%)`)
})
