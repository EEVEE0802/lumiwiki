import fs from 'fs'
import path from 'path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import { fetchCsv } from './ta-fetch.mjs'
import { ensureValidToken } from './ta-auth.mjs'
import { notify } from './notify.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'ta-config.json'), 'utf-8'))
}

function runCommand(cmd, args = []) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    stdio: 'pipe'
  })
  if (result.stdout) console.log(result.stdout.slice(-2000))
  if (result.status !== 0) {
    throw new Error(`命令失败 (exit ${result.status}): ${cmd} ${args.join(' ')}`)
  }
  return result.stdout || ''
}

function formatDateTime(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// 计算当前游戏周编号和时间范围
// 游戏周：每周五 0:00 ~ 下周四 23:59:59，首周从 config.baseFriday 开始
export function computeWeekInfo(baseFriday) {
  const now = new Date()
  const base = new Date(baseFriday + 'T00:00:00')
  const week = Math.floor((now - base) / (7 * 24 * 60 * 60 * 1000)) + 1

  const weekStart = new Date(base)
  weekStart.setDate(weekStart.getDate() + (week - 1) * 7)

  return {
    week,
    startTime: formatDateTime(weekStart),
    endTime: formatDateTime(now)
  }
}

function ensureWeekInJson(week) {
  const weeksJsonPath = path.join(PROJECT_ROOT, 'public/data/online/weekly/weeks.json')
  const weeks = JSON.parse(fs.readFileSync(weeksJsonPath, 'utf-8'))
  if (!weeks.some(w => w.week === week)) {
    weeks.push({ week, label: `第${week}周`, fileName: `ladder-week${week}.json` })
    weeks.sort((a, b) => a.week - b.week)
    fs.writeFileSync(weeksJsonPath, JSON.stringify(weeks, null, 2) + '\n', 'utf-8')
    console.log(`✓ weeks.json 已添加第 ${week} 周`)
  }
}

async function updateMode(mode, weekInfo) {
  const { week, startTime, endTime } = weekInfo
  const fileName = mode === 'tournament' ? `tournament_week${week}.csv` : `ladder_week${week}.csv`
  const outputPath = path.join(PROJECT_ROOT, 'data', 'archive', `week${week}`, fileName)

  await fetchCsv(mode, startTime, endTime, outputPath)

  const scriptFile = mode === 'tournament' ? 'scripts/process-tournament-data.js' : 'scripts/process-battle-data.js'
  runCommand(process.execPath, [scriptFile, '--week', String(week)])

  if (mode === 'ladder') {
    fs.copyFileSync(
      path.join(PROJECT_ROOT, `public/data/online/weekly/ladder-week${week}.json`),
      path.join(PROJECT_ROOT, 'public/data/online/battle-stats.json')
    )
    console.log('✓ battle-stats.json 已更新')
    ensureWeekInJson(week)
  }

  runCommand('bash', ['publish.sh'])
}

async function main() {
  const args = process.argv.slice(2)
  const mode = args.includes('--tournament') ? 'tournament' : 'ladder'
  const config = loadConfig()

  await ensureValidToken()

  const weekInfo = computeWeekInfo(config.baseFriday)
  console.log(`\n===== LumiWiki 自动更新 =====`)
  console.log(`模式: ${mode}`)
  console.log(`游戏周: Week ${weekInfo.week} (${weekInfo.startTime} ~ ${weekInfo.endTime})`)

  if (mode === 'tournament' && weekInfo.week === 1) {
    console.log('首周无周赛，跳过')
    await notify('首周（Week 1）无周赛，跳过本次拉取', 'info')
    return
  }

  await updateMode(mode, weekInfo)

  const modeLabel = mode === 'tournament' ? '周赛' : '天梯'
  await notify(`${modeLabel} Week ${weekInfo.week} 已自动更新并发布`, 'success')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  main().catch(async e => {
    console.error(`\n❌ ${e.message}`)
    await notify(`自动更新失败: ${e.message}`, 'error')
    process.exit(1)
  })
}
