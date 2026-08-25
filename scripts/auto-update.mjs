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

// 计算当前游戏周编号和时间范围（新架构：按自然日归属周）
// 游戏周：周五 00:00 ~ 下周四 23:59（自然日归属周，配合按天分片方案）
// 首周从 config.baseFriday 00:00 开始
// 国内 / 海外全球通服，共用同一套 baseFriday
export function computeWeekInfo(baseFriday) {
  const now = new Date()
  const base = new Date(baseFriday + 'T00:00:00')
  const week = Math.floor((now - base) / (7 * 24 * 60 * 60 * 1000)) + 1

  const weekStart = new Date(base)
  weekStart.setDate(weekStart.getDate() + (week - 1) * 7)

  return {
    week,
    startDate: formatDate(weekStart),  // 'YYYY-MM-DD'
    endDate: formatDate(now)
  }
}

// 每天固定拉取所有模式（含周赛），因此不再需要 isTournamentActive / shouldFetchTournament 判断窗口
// 周赛在非开放日拉出来是空 CSV，process 脚本能处理，不影响任何东西

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
 * 新架构：每次只拉 [昨天, 今天] 2 天到 daily/{mode}/{date}.csv
 * process 脚本根据 --week 读该周 7 天 daily 分片汇总
 *
 * @param {'domestic'|'overseas'} region
 * @param {'ladder'|'tournament'} mode
 * @param {object} weekInfo { week, startDate, endDate }
 */
export async function updateRegionMode(region, mode, weekInfo) {
  const { week } = weekInfo
  const pad = n => String(n).padStart(2, '0')
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const now = new Date()
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const dates = [fmt(yesterday), fmt(now)]

  // 单天失败不阻塞其他天（fetchCsv 内部有 3 次重试；空结果 SQL 已能秒返回）
  const failures = []
  for (const date of dates) {
    const outPath = path.join(PROJECT_ROOT, 'data', region, 'archive', 'daily', mode, `${date}.csv`)
    try {
      await fetchCsv(region, mode, date, date, outPath)
    } catch (e) {
      console.error(`⚠️  [${region}/${mode}/${date}] 拉取失败（不阻塞其他天）: ${e.message}`)
      failures.push({ date, error: e.message })
    }
  }

  // 就算今天失败了，process 也可以基于「昨天成功 + 本周之前已有 daily」聚合出一份"到昨天为止"的 JSON，
  // 比彻底没数据强。除非两天都失败才跳过 process
  if (failures.length === dates.length) {
    console.error(`⚠️  [${region}] ${mode} 所有 ${dates.length} 天全失败，跳过 process`)
    return
  }

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
 * 拉取参与走势相关的原始事件流（login/guild-war）+ recharge，然后跑聚合脚本
 * login/guild-war 也走 daily 分片，每次拉昨天+今天覆盖
 */
export async function updateRegionParticipation(region, week, baseFriday) {
  try {
    const pad = n => String(n).padStart(2, '0')
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const now = new Date()
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
    const dates = [fmt(yesterday), fmt(now)]

    // login daily 分片（每天创号+登录事件），单天失败不阻塞
    for (const date of dates) {
      const outPath = path.join(PROJECT_ROOT, 'data', region, 'archive', 'daily', 'login', `${date}.csv`)
      try {
        await fetchCsv(region, 'login', date, date, outPath)
      } catch (e) {
        console.error(`⚠️  [${region}/login/${date}] 拉取失败: ${e.message}`)
      }
    }
    // guild-war daily 分片（异步 PVP 事件），单天失败不阻塞
    for (const date of dates) {
      const outPath = path.join(PROJECT_ROOT, 'data', region, 'archive', 'daily', 'guild-war', `${date}.csv`)
      try {
        await fetchCsv(region, 'guild-war', date, date, outPath)
      } catch (e) {
        console.error(`⚠️  [${region}/guild-war/${date}] 拉取失败: ${e.message}`)
      }
    }
    // recharge：累计全量（不按天分片，每人历史最大 recharge_total）
    try {
      const rechargeCsvPath = path.join(PROJECT_ROOT, 'data', region, 'archive', 'recharge.csv')
      await fetchCsv(region, 'recharge', baseFriday, fmt(now), rechargeCsvPath)
    } catch (e) {
      console.error(`⚠️  [${region}] recharge 拉取失败（不阻塞参与走势）: ${e.message}`)
    }
    // 注意：这里故意不传 --publish，因为 auto-update 末尾统一 publish 一次即可；
    // --publish 是给「手动补跑」用的，让操作者不用另外记着 bash publish.sh（详见 CLAUDE.md「数据分离机制」）
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
 * 无限道馆数据：改成按天分片，每次只拉 [昨天, 今天] 2 天覆盖对应 daily 文件
 * 输出: data/{region}/archive/daily/infinity-gym/{YYYY-MM-DD}.csv (& daily/assist/...)
 *
 * 昨天 = 补齐上次任务运行到今日凌晨这段时间新增的战斗（跨零点部分）
 * 今天 = 当天累积到目前为止的数据（覆盖式覆盖今日文件）
 *
 * 历史数据由 backfill-daily.mjs 一次性回填，后续每天只增量拉这 2 天。
 * process-infinity-gym.mjs 会读整个 daily 目录累计聚合。
 */
export async function updateRegionInfinityGym(region /* baseFriday 不再使用 */) {
  const pad = n => String(n).padStart(2, '0')
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const now = new Date()
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const dates = [fmt(yesterday), fmt(now)]

  // 单模式/单天失败不阻塞其他，process 阶段还能基于历史 daily 数据聚合出结果
  for (const date of dates) {
    const gymPath = path.join(PROJECT_ROOT, 'data', region, 'archive', 'daily', 'infinity-gym', `${date}.csv`)
    const assistPath = path.join(PROJECT_ROOT, 'data', region, 'archive', 'daily', 'assist', `${date}.csv`)
    try {
      await fetchCsv(region, 'infinity-gym', date, date, gymPath)
    } catch (e) {
      console.error(`⚠️  [${region}/infinity-gym/${date}] 拉取失败: ${e.message}`)
    }
    try {
      await fetchCsv(region, 'assist', date, date, assistPath)
    } catch (e) {
      console.error(`⚠️  [${region}/assist/${date}] 拉取失败: ${e.message}`)
    }
  }

  // process 遍历所有 daily CSV 聚合；heap 大一点兜底跨天累计后的中间数据结构
  // 即使这次两天全失败，历史 daily 还在，process 也能给出"到上次成功为止"的结果
  runCommand(process.execPath, ['--max-old-space-size=4096', 'scripts/process-infinity-gym.mjs', '--region', region])
}

// updateRegionGuildWar 已并入 updateRegionParticipation（公会战 daily CSV 跟 login 一起拉）

async function main() {
  const args = process.argv.slice(2)
  const onlyMode = args.find(a => a === '--tournament' || a === '--ladder')?.slice(2) || null
  const config = loadConfig()
  const weekInfo = computeWeekInfo(config.baseFriday)

  console.log(`\n===== LumiWiki 线上数据自动更新 =====`)
  console.log(`游戏周: Week ${weekInfo.week} (${weekInfo.startDate} ~ ${weekInfo.endDate})`)
  console.log(`区域: ${REGIONS.join(', ')}`)
  console.log(`架构: 每天拉一次，按 daily 分片`)

  const modeFilter = onlyMode // 'ladder' / 'tournament' / null
  const modeSummary = []

  for (const region of REGIONS) {
    console.log(`\n──── [${region}] ────`)

    // 1. 天梯（每次都拉）
    if (!modeFilter || modeFilter === 'ladder') {
      try {
        await updateRegionMode(region, 'ladder', weekInfo)
        modeSummary.push(`${region}: 天梯`)
      } catch (e) {
        console.error(`⚠️  [${region}] 天梯更新失败（不阻塞其他）: ${e.message}`)
      }
    }

    // 2. 周赛（非首周直接拉；开放窗口外拉出来是空 CSV，无害）
    if ((!modeFilter || modeFilter === 'tournament') && weekInfo.week > 1) {
      try {
        await updateRegionMode(region, 'tournament', weekInfo)
        modeSummary.push(`${region}: 周赛`)
      } catch (e) {
        console.error(`⚠️  [${region}] 周赛更新失败（不阻塞其他）: ${e.message}`)
      }
    }

    // 3. 无限道馆（每次拉昨天+今天两天到 daily 分片，process 遍历所有 daily 汇总）
    //    只在没有 --tournament 显式 filter 时跑（跟 ladder 一起）
    if (!modeFilter || modeFilter === 'ladder') {
      try {
        await updateRegionInfinityGym(region)
        modeSummary.push(`${region}: 无限道馆`)
      } catch (e) {
        console.error(`⚠️  [${region}] 无限道馆更新失败（不阻塞其他）: ${e.message}`)
      }
    }

    // 3.5 公会战数据由 updateRegionParticipation 统一拉取到 daily/guild-war/{date}.csv

    // 4. 参与走势（跟着 ladder 一起，失败不阻塞；同时拉 login/guild-war/recharge，然后调聚合脚本）
    if (!modeFilter || modeFilter === 'ladder') {
      // updateRegionParticipation 内部已经完全 try/catch 包裹了；这里再套一层防御
      try {
        await updateRegionParticipation(region, weekInfo.week, config.baseFriday)
        modeSummary.push(`${region}: 参与走势`)
      } catch (e) {
        console.error(`⚠️  [${region}] 参与走势更新失败（不阻塞其他）: ${e.message}`)
      }
    }

    // 5. 推荐配队（跟着最新的 ladder/tournament 数据重算，失败不阻塞发布）
    try {
      updateRegionLumiTeams(region)
    } catch (e) {
      console.error(`⚠️  [${region}] 推荐配队更新失败（不阻塞其他）: ${e.message}`)
    }
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
