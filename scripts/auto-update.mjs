import fs from 'fs'
import path from 'path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import { fetchCsv } from './ta-fetch.mjs'
import { notify } from './notify.mjs'
import { computeWeekInfo, weeksToProcess, formatDate } from './week-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

// 6 个正式服 region（9/17 上线后拆分）：cn=国内，其余 5 个是海外各独立服
// - cn = 1890
// - sp = 2890 南美
// - va = 2891 北美
// - jp = 2892 日本
// - sg = 2893 新加坡
// - fra = 2894 法兰克福
const REGIONS = ['cn', 'sp', 'va', 'jp', 'sg', 'fra']

// 推荐配队仅用国内数据生成（海外初期玩家少，样本不足；且前端所有 region 都读同一份 cn 数据）
const LUMI_TEAMS_REGION = 'cn'

// 玩法首次开放日期（YYYY-MM-DD）。今天 < 开放日 直接跳过对应模式，避免拉空 CSV / 报错
// 正式服玩法节奏：
// - 上线首周（9/17）：仅天梯 + 无限道馆
// - Week 2 开始（9/25 周五）：周赛开放
// - 9/30 起：公会战开放
const MODE_OPEN_DATE = {
  ladder: '2026-09-17',
  'infinity-gym': '2026-09-17',
  assist: '2026-09-17',
  login: '2026-09-17',
  recharge: '2026-09-17',
  tournament: '2026-09-25',
  'guild-war': '2026-09-30'
}

function isModeOpen(mode, now = new Date()) {
  const openISO = MODE_OPEN_DATE[mode]
  if (!openISO) return true // 未配置视为始终开放
  const open = new Date(openISO + 'T00:00:00+08:00')
  return now >= open
}

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

function formatDateShort(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// computeWeekInfo / weeksToProcess 已迁移到 scripts/week-utils.mjs（含 Week 1 特殊 8 天逻辑）

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
 * 跨周日会传两个 week（昨天所属周 + 今天所属周），拉数据只做一次，process 循环所有 week
 *
 * @param {'cn'|'sp'|'va'|'jp'|'sg'|'fra'} region
 * @param {'ladder'|'tournament'} mode
 * @param {number[]} weeks 升序，末尾是当前周（用于更新 battle-stats.json）
 */
export async function updateRegionMode(region, mode, weeks) {
  if (!isModeOpen(mode)) {
    console.log(`  ⏭  [${region}/${mode}] 尚未开放（${MODE_OPEN_DATE[mode]} 起），跳过`)
    return
  }
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
  const currentWeek = weeks[weeks.length - 1]
  for (const week of weeks) {
    runCommand(process.execPath, [scriptFile, '--week', String(week), '--region', region])
    if (mode === 'ladder') ensureWeekInJson(region, week)
  }

  // battle-stats.json 是当前周的镜像（前端默认视图），只用最新那个周覆盖
  if (mode === 'ladder') {
    const src = path.join(PROJECT_ROOT, `public/data/online/${region}/weekly/ladder-week${currentWeek}.json`)
    const dst = path.join(PROJECT_ROOT, `public/data/online/${region}/battle-stats.json`)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst)
      console.log(`  ✓ [${region}] battle-stats.json 已更新（Week ${currentWeek}）`)
    }
  }
}

/**
 * 拉取参与走势相关的原始事件流（login/guild-war）+ recharge，然后跑聚合脚本
 * login/guild-war 也走 daily 分片，每次拉昨天+今天覆盖
 *
 * 跨周日会传两个 week，拉数据只做一次，聚合循环所有 week
 *
 * @param {number[]} weeks 升序，通常 1 项；跨周日 2 项
 */
export async function updateRegionParticipation(region, weeks, baseFriday) {
  try {
    const pad = n => String(n).padStart(2, '0')
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const now = new Date()
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
    const dates = [fmt(yesterday), fmt(now)]

    // login daily 分片（每天创号+登录事件），单天失败不阻塞
    if (isModeOpen('login')) {
      for (const date of dates) {
        const outPath = path.join(PROJECT_ROOT, 'data', region, 'archive', 'daily', 'login', `${date}.csv`)
        try {
          await fetchCsv(region, 'login', date, date, outPath)
        } catch (e) {
          console.error(`⚠️  [${region}/login/${date}] 拉取失败: ${e.message}`)
        }
      }
    } else {
      console.log(`  ⏭  [${region}/login] 尚未开放（${MODE_OPEN_DATE.login} 起），跳过`)
    }
    // guild-war daily 分片（异步 PVP 事件），单天失败不阻塞
    if (isModeOpen('guild-war')) {
      for (const date of dates) {
        const outPath = path.join(PROJECT_ROOT, 'data', region, 'archive', 'daily', 'guild-war', `${date}.csv`)
        try {
          await fetchCsv(region, 'guild-war', date, date, outPath)
        } catch (e) {
          console.error(`⚠️  [${region}/guild-war/${date}] 拉取失败: ${e.message}`)
        }
      }
    } else {
      console.log(`  ⏭  [${region}/guild-war] 尚未开放（${MODE_OPEN_DATE['guild-war']} 起），跳过`)
    }
    // recharge：累计全量（不按天分片，每人历史最大 recharge_total）
    // 起点用玩法开放日（2026-09-17，覆盖 Week 1 首日），不用 baseFriday（是 Week 2 起点）
    if (isModeOpen('recharge')) {
      try {
        const rechargeCsvPath = path.join(PROJECT_ROOT, 'data', region, 'archive', 'recharge.csv')
        await fetchCsv(region, 'recharge', MODE_OPEN_DATE.recharge, fmt(now), rechargeCsvPath)
      } catch (e) {
        console.error(`⚠️  [${region}] recharge 拉取失败（不阻塞参与走势）: ${e.message}`)
      }
    } else {
      console.log(`  ⏭  [${region}/recharge] 尚未开放（${MODE_OPEN_DATE.recharge} 起），跳过`)
    }
    // 注意：这里故意不传 --publish，因为 auto-update 末尾统一 publish 一次即可；
    // --publish 是给「手动补跑」用的，让操作者不用另外记着 bash publish.sh（详见 CLAUDE.md「数据分离机制」）
    for (const week of weeks) {
      runCommand(process.execPath, ['scripts/fetch-participation-trend.mjs', '--week', String(week), '--region', region])
    }
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
  if (!isModeOpen('infinity-gym')) {
    console.log(`  ⏭  [${region}/infinity-gym] 尚未开放（${MODE_OPEN_DATE['infinity-gym']} 起），跳过`)
    return
  }
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
    if (isModeOpen('assist')) {
      try {
        await fetchCsv(region, 'assist', date, date, assistPath)
      } catch (e) {
        console.error(`⚠️  [${region}/assist/${date}] 拉取失败: ${e.message}`)
      }
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
  // 跨周日（如周五凌晨跑）weeks 会是 [上一周, 本周]；平时是 [本周] 一项
  // 目的：跨周边界前一周周四的 daily CSV 是完整的但 JSON 是残缺的，需要重新聚合
  const weeks = weeksToProcess(config.baseFriday)

  console.log(`\n===== LumiWiki 线上数据自动更新 =====`)
  console.log(`游戏周: Week ${weekInfo.week} (${weekInfo.startDate} ~ ${weekInfo.endDate})`)
  console.log(`本次 process 周: ${weeks.map(w => `Week ${w}`).join(', ')}`)
  console.log(`区域: ${REGIONS.join(', ')}`)
  console.log(`架构: 每天拉一次，按 daily 分片`)

  const modeFilter = onlyMode // 'ladder' / 'tournament' / null
  const modeSummary = []

  // 周赛过滤掉 week=1（首周无周赛，process-tournament 也会跳过）
  const tournamentWeeks = weeks.filter(w => w > 1)

  for (const region of REGIONS) {
    console.log(`\n──── [${region}] ────`)

    // 1. 天梯（每次都拉）
    if (!modeFilter || modeFilter === 'ladder') {
      try {
        await updateRegionMode(region, 'ladder', weeks)
        modeSummary.push(`${region}: 天梯`)
      } catch (e) {
        console.error(`⚠️  [${region}] 天梯更新失败（不阻塞其他）: ${e.message}`)
      }
    }

    // 2. 周赛（非首周直接拉；开放窗口外拉出来是空 CSV，无害）
    if ((!modeFilter || modeFilter === 'tournament') && tournamentWeeks.length > 0) {
      try {
        await updateRegionMode(region, 'tournament', tournamentWeeks)
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
        await updateRegionParticipation(region, weeks, config.baseFriday)
        modeSummary.push(`${region}: 参与走势`)
      } catch (e) {
        console.error(`⚠️  [${region}] 参与走势更新失败（不阻塞其他）: ${e.message}`)
      }
    }

  }

  // 5. 推荐配队：仅用国内（cn）数据生成一份，海外服前端也读这份（loadData 里 lumi-teams 硬编码走 cn）
  //    海外初期玩家少，各服独立算样本不足；用 cn 作为参考数据对所有服玩家都有价值
  if (!modeFilter || modeFilter === 'ladder') {
    try {
      updateRegionLumiTeams(LUMI_TEAMS_REGION)
    } catch (e) {
      console.error(`⚠️  [${LUMI_TEAMS_REGION}] 推荐配队更新失败（不阻塞其他）: ${e.message}`)
    }
  }

  // 6. 镜像 lumi-teams 到 internal 分支（对内版复用对外的推荐配队数据）
  //    只镜像 cn 一份，internal 对外/对内共用同一份配队数据
  {
    const src = path.join(PROJECT_ROOT, `public/data/${LUMI_TEAMS_REGION}/lumi-teams.json`)
    const dst = path.join(PROJECT_ROOT, `public/data/internal/${LUMI_TEAMS_REGION}/lumi-teams.json`)
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.copyFileSync(src, dst)
      console.log(`  ✓ [${LUMI_TEAMS_REGION}] 镜像 lumi-teams.json 到 internal`)
    }
  }

  // 6. 一次发布（build + 静态服务重启）
  console.log('\n──── 统一发布 ────')
  runCommand('bash', ['publish.sh'])

  // 7. git commit + push（只处理代码变更；数据/图片已在 .gitignore 里排除）
  //    2026-09-18 起策略：数据不进 git，git 只装代码。git 失败不阻塞发布 —— 前面 publish.sh 已经把数据推到 dist 生效
  console.log('\n──── 提交 git（代码同步，失败不影响发布）────')
  try {
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
      console.log('  无代码改动，跳过 commit')
    }
  } catch (e) {
    console.error(`⚠️  git 同步失败（不影响发布，本地数据已经 publish 生效）: ${e.message}`)
    // 独立发一条飞书告警，方便手动排查
    try {
      await notify(`⚠️ 线上数据 git 同步失败（数据已本地发布，不影响 wiki 访问）\n错误: ${e.message.slice(0, 300)}`, 'warning')
    } catch { /* notify 失败也不阻塞 */ }
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
