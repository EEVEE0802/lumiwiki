import fs from 'fs'
import path from 'path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import { fetchCsv } from './ta-fetch.mjs'
import { notify } from './notify.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

const REGIONS = ['domestic', 'overseas']

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'ta-config.json'), 'utf-8'))
}

// 定时任务环境 PATH 可能不含 bash，预先查找完整路径
function findBash() {
  if (process.platform !== 'win32') return 'bash'
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
  ]
  return candidates.find(p => fs.existsSync(p)) || 'bash'
}

function runCommand(cmd, args = []) {
  if (cmd === 'bash' && process.platform === 'win32') {
    cmd = findBash()
  }
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    stdio: 'pipe'
  })
  if (result.stdout) console.log(result.stdout.slice(-2000))
  if (result.error) {
    throw new Error(`命令启动失败: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`命令失败 (exit ${result.status}): ${cmd} ${args.join(' ')}`)
  }
  return result.stdout || ''
}

function formatDate(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 计算当前游戏周编号和时间范围
// 游戏周：每周五 03:00 ~ 下周五 03:00
// 首周从 config.baseFriday 03:00 开始
// 国内 / 海外全球通服，共用同一套 baseFriday
export function computeWeekInfo(baseFriday) {
  const now = new Date()
  const base = new Date(baseFriday + 'T03:00:00')
  let week = Math.floor((now - base) / (7 * 24 * 60 * 60 * 1000)) + 1

  // 周五 03:00 ~ 03:59 跑的算上一周
  if (now.getDay() === 5 && now.getHours() === 3) {
    week -= 1
  }

  const weekStart = new Date(base)
  weekStart.setDate(weekStart.getDate() + (week - 1) * 7)

  return {
    week,
    startDate: formatDate(weekStart),  // 'YYYY-MM-DD'
    endDate: formatDate(now)
  }
}

// 周赛是否开放：全球通服，用国内时间的窗口
// 周五 19:00 ~ 周一 07:00
export function isTournamentActive(now = new Date()) {
  const day = now.getDay()  // 0=周日, 1=周一, ..., 5=周五
  const hour = now.getHours()
  if (day === 5 && hour >= 19) return true          // 周五 19:00+
  if (day === 6) return true                         // 周六全天
  if (day === 0) return true                         // 周日全天
  if (day === 1 && hour < 7) return true            // 周一 <07:00
  return false
}

// 是否应该拉周赛数据：窗口内 + 窗口关闭后 1 小时（周一 07:00-07:59 收尾一次，
// 抓上 06:59 前最后一场对战；否则最后一小时的数据会被漏掉）
export function shouldFetchTournament(now = new Date()) {
  if (isTournamentActive(now)) return true
  const day = now.getDay()
  const hour = now.getHours()
  if (day === 1 && hour === 7) return true          // 周一 07:00 ~ 07:59 收尾
  return false
}

function ensureWeekInJson(region, week) {
  const weeksJsonPath = path.join(PROJECT_ROOT, `public/data/online/${region}/weekly/weeks.json`)
  fs.mkdirSync(path.dirname(weeksJsonPath), { recursive: true })
  let weeks = []
  if (fs.existsSync(weeksJsonPath)) {
    weeks = JSON.parse(fs.readFileSync(weeksJsonPath, 'utf-8'))
  }
  if (!weeks.some(w => w.week === week)) {
    weeks.push({ week, label: `第${week}周`, fileName: `ladder-week${week}.json` })
    weeks.sort((a, b) => a.week - b.week)
    fs.writeFileSync(weeksJsonPath, JSON.stringify(weeks, null, 2) + '\n', 'utf-8')
    console.log(`  ✓ [${region}] weeks.json 已添加第 ${week} 周`)
  }
}

/**
 * 拉取并处理某区域某模式（ladder / tournament）的数据
 * @param {'domestic'|'overseas'} region
 * @param {'ladder'|'tournament'} mode
 * @param {object} weekInfo { week, startDate, endDate }
 */
export async function updateRegionMode(region, mode, weekInfo) {
  const { week, startDate, endDate } = weekInfo
  const fileName = mode === 'tournament' ? `tournament_week${week}.csv` : `ladder_week${week}.csv`
  const outputPath = path.join(PROJECT_ROOT, 'data', region, 'archive', `week${week}`, fileName)

  await fetchCsv(region, mode, startDate, endDate, outputPath)

  const scriptFile = mode === 'tournament' ? 'scripts/process-tournament-data.js' : 'scripts/process-battle-data.js'
  runCommand(process.execPath, [scriptFile, '--week', String(week), '--region', region])

  if (mode === 'ladder') {
    const src = path.join(PROJECT_ROOT, `public/data/online/${region}/weekly/ladder-week${week}.json`)
    const dst = path.join(PROJECT_ROOT, `public/data/online/${region}/battle-stats.json`)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst)
      console.log(`  ✓ [${region}] battle-stats.json 已更新`)
    }
    ensureWeekInJson(region, week)
  }
}

/**
 * 拉取参与走势（内部会拉 login CSV + 聚合），失败不阻塞
 */
export async function updateRegionParticipation(region, week) {
  try {
    runCommand(process.execPath, ['scripts/fetch-participation-trend.mjs', '--week', String(week), '--region', region])
  } catch (e) {
    console.error(`⚠️  [${region}] 参与走势生成失败（不阻塞发布）: ${e.message}`)
  }
}

/**
 * 重新生成某区域的推荐配队 lumi-teams.json
 * 依赖当前区域已存在的 ladder / tournament 数据
 */
export function updateRegionLumiTeams(region) {
  runCommand(process.execPath, ['scripts/process-lumi-teams.mjs', '--region', region])
}

/**
 * 无限道馆数据：CSV 累计（从 baseFriday 到今天覆盖式拉全量），处理后输出 JSON
 * 因为是一次性玩法（没有周概念），累计存到 data/{region}/archive/gym_infinity.csv
 */
export async function updateRegionInfinityGym(region, baseFriday) {
  const csvPath = path.join(PROJECT_ROOT, 'data', region, 'archive', 'gym_infinity.csv')
  // 拉从开服到今天全部无限道馆数据（无限道馆 08-07 才上线，但用 baseFriday 兜底也没事，SQL 会自然过滤为空）
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  await fetchCsv(region, 'infinity-gym', baseFriday, today, csvPath)
  runCommand(process.execPath, ['scripts/process-infinity-gym.mjs', '--region', region])
}

async function main() {
  const args = process.argv.slice(2)
  const onlyMode = args.find(a => a === '--tournament' || a === '--ladder')?.slice(2) || null
  const forceTournament = args.includes('--force-tournament')
  const config = loadConfig()
  const weekInfo = computeWeekInfo(config.baseFriday)
  const tournamentOpen = isTournamentActive()
  const shouldTournament = shouldFetchTournament() || forceTournament

  console.log(`\n===== LumiWiki 线上数据自动更新 =====`)
  console.log(`游戏周: Week ${weekInfo.week} (${weekInfo.startDate} ~ ${weekInfo.endDate})`)
  console.log(`区域: ${REGIONS.join(', ')}`)
  console.log(`周赛窗口: ${tournamentOpen ? '开放中' : '未开放'}${shouldTournament && !tournamentOpen ? '（本次为收尾拉取）' : ''}${forceTournament ? '（--force-tournament 强制拉取）' : ''}`)

  const modeFilter = onlyMode // 'ladder' / 'tournament' / null
  const modeSummary = []

  for (const region of REGIONS) {
    console.log(`\n──── [${region}] ────`)

    // 1. 天梯（每次都拉）
    if (!modeFilter || modeFilter === 'ladder') {
      await updateRegionMode(region, 'ladder', weekInfo)
      modeSummary.push(`${region}: 天梯`)
    }

    // 2. 周赛（仅在窗口期，且非首周；窗口关闭后 1 小时内再拉一次收尾，抓上 06:59 前最后一场对战）
    //    可用 --force-tournament 手动补跑（例如某次窗口内故障错过）
    if ((!modeFilter || modeFilter === 'tournament') && weekInfo.week > 1 && shouldTournament) {
      await updateRegionMode(region, 'tournament', weekInfo)
      modeSummary.push(`${region}: 周赛${tournamentOpen ? '' : '(收尾)'}`)
    }

    // 3. 无限道馆（累计口径，每次拉从 baseFriday 到今天全量）
    //    只在没有 --tournament 显式 filter 时跑（跟 ladder 一起）
    if (!modeFilter || modeFilter === 'ladder') {
      try {
        await updateRegionInfinityGym(region, config.baseFriday)
        modeSummary.push(`${region}: 无限道馆`)
      } catch (e) {
        console.error(`⚠️  [${region}] 无限道馆更新失败（不阻塞其他）: ${e.message}`)
      }
    }

    // 4. 参与走势（跟着 ladder 一起，失败不阻塞；读取 ladder/tournament/login/gym CSV 聚合）
    if (!modeFilter || modeFilter === 'ladder') {
      await updateRegionParticipation(region, weekInfo.week)
    }

    // 5. 推荐配队（跟着最新的 ladder/tournament 数据重算）
    updateRegionLumiTeams(region)
  }

  // 5. 镜像 lumi-teams 到 internal 分支（对内版复用对外的推荐配队数据）
  for (const region of REGIONS) {
    const src = path.join(PROJECT_ROOT, `public/data/${region}/lumi-teams.json`)
    const dst = path.join(PROJECT_ROOT, `public/data/internal/${region}/lumi-teams.json`)
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.copyFileSync(src, dst)
      console.log(`  ✓ [${region}] 镜像 lumi-teams.json 到 internal`)
    }
  }

  // 6. 一次发布（build + 静态服务重启）
  console.log('\n──── 统一发布 ────')
  runCommand('bash', ['publish.sh'])

  // 7. git commit + push
  console.log('\n──── 提交 git ────')
  const status = runCommand('git', ['status', '--porcelain'])
  if (status.trim()) {
    const now = new Date()
    const dateStr = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const summary = modeSummary.join(' · ') || '(无变化)'
    const message = `自动更新线上数据（Week ${weekInfo.week} · ${summary} · ${dateStr} ${timeStr}）`
    runCommand('git', ['add', '-A'])
    runCommand('git', ['commit', '-m', message])
    runCommand('git', ['push'])
    console.log('  ✓ 数据已提交并推送')
  } else {
    console.log('  无数据改动，跳过 commit')
  }

  await notify(
    `线上数据更新完成（Week ${weekInfo.week}）\n` +
    `区域: ${REGIONS.join(' + ')}\n` +
    `周赛: ${tournamentOpen ? '含' : '未开放'}\n` +
    `内容: ${modeSummary.join(' | ') || '无'}`,
    'success'
  )
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  main().catch(async e => {
    console.error(`\n❌ ${e.message}`)
    await notify(`线上数据更新失败: ${e.message}`, 'error')
    process.exit(1)
  })
}
