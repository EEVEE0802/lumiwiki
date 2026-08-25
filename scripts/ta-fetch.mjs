// 数数开放 API 数据拉取（新版）
// - endpoint: POST /open/submit-sql → GET /open/sql-result-page?pageId=N（从 0 开始，逐页拉直到空）
// - 认证：form 里带 token（长期有效）
// - 表名 ta.v_event_{projectId}（国内 v_event_29 / 海外 v_event_83），元数据列用 "#event_name"，业务列直接用
// - 输出 CSV，格式与老 fetch 一致（下游 process-battle-data.js 不用改）

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CONFIG_PATH = path.join(__dirname, 'ta-config.json')

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error('ta-config.json 不存在，请复制 ta-config.example.json 为 ta-config.json 并填入配置')
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
}

function getRegionConfig(region) {
  const cfg = loadConfig()
  const r = cfg.regions?.[region]
  if (!r) throw new Error(`ta-config.json 缺少 regions.${region} 配置`)
  if (!r.token || r.token.startsWith('your-')) throw new Error(`ta-config.json regions.${region}.token 未配置`)
  return r
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// undici 有个坑：紧接在大响应（>20MB）之后再发请求时，keep-alive 连接池会
// 复用一条服务端已经悄悄关掉的 socket，导致下一个 fetch 立刻 throw "fetch failed"。
// 国内公会战紧跟在 infinity-gym+assist 大响应之后，从 2026-08-21 起每次必挂。
// 对策：网络层 throw 时重试。submit-sql 是幂等 select、分页 GET 也幂等，重复安全。
async function fetchWithRetry(url, init, { retries = 2, baseDelayMs = 1000, label = 'fetch' } = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init)
    } catch (e) {
      lastErr = e
      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        console.log(`  ⚠️  ${label} 第 ${attempt + 1} 次尝试失败 (${e.message})，${delay}ms 后重试...`)
        await sleep(delay)
      }
    }
  }
  throw lastErr
}

function escapeSqlString(s) {
  return String(s).replace(/'/g, "''")
}

function inClause(values) {
  return values.map(v => `'${escapeSqlString(v)}'`).join(', ')
}

// 三种查询模式的 SELECT 列（与老 CSV 兼容，process-battle-data.js / process-tournament-data.js / fetch-participation-trend.mjs 期望的列名）
// 各模式对应的 CSV 表头（数数 open API 返回的 CSV 不含表头，我们自己按 SELECT 列顺序补上）
export const CSV_HEADERS = {
  ladder:         ['part_date', 'game_id_str', 'b_role_id', 'player_rank', 'player_type', 'player_lumis', 'battle_result', 'trainer_id'],
  tournament:     ['part_date', 'game_id_str', 'b_role_id', 'player_rank', 'player_type', 'player_lumis', 'battle_result', 'trainer_id', 'player_week_win'],
  login:          ['part_date', 'b_role_id', 'b_create_time_str'],
  'infinity-gym': ['part_date', 'game_id_str', 'b_role_id', 'gym_uid', 'player_lumis', 'battle_result', 'trainer_id'],
  'guild-war':    ['part_date', 'b_role_id'],
  assist:         ['part_date', 'battle_uid', 'b_role_id'],
  recharge:       ['b_role_id', 'max_recharge_total'],
}

function buildSql(mode, startDate, endDate, cfg) {
  const { projectId, bZoneIds } = cfg
  const tableName = `ta.v_event_${projectId}`
  // b_zone_id 在国内是 varchar（如 '1888'），在海外是 double（如 2888.0）
  // 用 TRY_CAST(... AS bigint) 统一转成整数比较，两边都能命中
  const zoneNums = bZoneIds.map(z => String(z).trim()).join(', ')
  const zoneFilter = `TRY_CAST(b_zone_id AS bigint) IN (${zoneNums})`

  if (mode === 'ladder') {
    return `
      SELECT
        "$part_date" AS part_date,
        game_id_str,
        b_role_id,
        player_rank,
        player_type,
        player_lumis,
        battle_result,
        trainer_id
      FROM ${tableName}
      WHERE "$part_date" >= '${startDate}'
        AND "$part_date" <= '${endDate}'
        AND "#event_name" = 'battle_end'
        AND ${zoneFilter}
        AND game_type = 'PVP1V1'
    `.trim().replace(/\s+/g, ' ')
  }

  if (mode === 'tournament') {
    return `
      SELECT
        "$part_date" AS part_date,
        game_id_str,
        b_role_id,
        player_rank,
        player_type,
        player_lumis,
        battle_result,
        trainer_id,
        player_week_win
      FROM ${tableName}
      WHERE "$part_date" >= '${startDate}'
        AND "$part_date" <= '${endDate}'
        AND "#event_name" = 'battle_end'
        AND ${zoneFilter}
        AND game_type = 'Week1v1'
    `.trim().replace(/\s+/g, ' ')
  }

  if (mode === 'login') {
    return `
      SELECT
        "$part_date" AS part_date,
        b_role_id,
        b_create_time_str
      FROM ${tableName}
      WHERE "$part_date" >= '${startDate}'
        AND "$part_date" <= '${endDate}'
        AND "#event_name" = 'player_login'
        AND ${zoneFilter}
    `.trim().replace(/\s+/g, ' ')
  }

  if (mode === 'infinity-gym') {
    // 无限道馆：每场道馆战斗上报两条 battle_end（同 game_id_str）
    //   player_type=1: 玩家视角（有 player_lumis / battle_result / trainer_id，player_uid_str = 玩家自己的 role_id）
    //   player_type=4: NPC 视角（player_uid_str 是道馆 NPC 编号 = MonsterGroupID）
    // 用 GROUP BY game_id_str + MAX(CASE WHEN) 把两条合并成一场
    // 只保留 gym_uid 在 128100001~128101000 范围的无限道馆记录
    return `
      SELECT
        MIN("$part_date") AS part_date,
        game_id_str,
        b_role_id,
        MAX(CASE WHEN player_type = 4 THEN TRY_CAST(player_uid_str AS bigint) END) AS gym_uid,
        MAX(CASE WHEN player_type = 1 THEN player_lumis END) AS player_lumis,
        MAX(CASE WHEN player_type = 1 THEN battle_result END) AS battle_result,
        MAX(CASE WHEN player_type = 1 THEN trainer_id END) AS trainer_id
      FROM ${tableName}
      WHERE "$part_date" >= '${startDate}'
        AND "$part_date" <= '${endDate}'
        AND "#event_name" = 'battle_end'
        AND ${zoneFilter}
        AND game_type = 'Gym1v1'
      GROUP BY game_id_str, b_role_id
      HAVING MAX(CASE WHEN player_type = 4 THEN TRY_CAST(player_uid_str AS bigint) END) BETWEEN 128100001 AND 128101000
    `.trim().replace(/\s+/g, ' ')
  }

  if (mode === 'guild-war') {
    // 公会战：异步 PVP，game_type = 'GVG1v1'
    // 每场 battle_end 会上报 2 条：player_type=1（玩家自己）+ player_type=4（NPC 镜像），共用同一个 game_id_str
    // 参与走势只需 UV / 场均，其他字段（player_lumis 每行几百字节，是 CSV 体积大头）用不到 —— 全部裁掉
    // 只 SELECT part_date + b_role_id，并 WHERE player_type=1 去掉 NPC 镜像行，让每场只算一次
    // 结果：响应体从 ~100MB 缩到 <5MB，避免 submit-sql fetch failed
    return `
      SELECT
        "$part_date" AS part_date,
        b_role_id
      FROM ${tableName}
      WHERE "$part_date" >= '${startDate}'
        AND "$part_date" <= '${endDate}'
        AND "#event_name" = 'battle_end'
        AND ${zoneFilter}
        AND game_type = 'GVG1v1'
        AND player_type = 1
    `.trim().replace(/\s+/g, ' ')
  }

  if (mode === 'assist') {
    // 助战借用：use_assist_lumi 事件在玩家借用其他玩家噜咪进入战斗时上报
    // battle_uid 等同 battle_end.game_id_str，用来把助战场次跟战斗关联
    // 累计口径（跟无限道馆一样按 baseFriday 到今天拉全量）
    return `
      SELECT
        "$part_date" AS part_date,
        battle_uid,
        b_role_id
      FROM ${tableName}
      WHERE "$part_date" >= '${startDate}'
        AND "$part_date" <= '${endDate}'
        AND "#event_name" = 'use_assist_lumi'
        AND ${zoneFilter}
    `.trim().replace(/\s+/g, ' ')
  }

  if (mode === 'recharge') {
    // 玩家累计充值：每个 role_id 取其历史所有 recharge 事件里最大的 b_recharge_total（=当前累计充值总额，单位：分）
    // 用 MAX 而不是 LAST，避免撤单/退款事件导致 recharge_total 下降后取到低值
    // ⚠️ b_recharge_total 数数里是 string 类型，直接 MAX 是字典序（'987400' > '3712000'）
    //    必须 TRY_CAST 成 bigint 再 MAX
    // 累计口径（跟无限道馆一样按 baseFriday 到今天拉全量）
    return `
      SELECT
        b_role_id,
        MAX(TRY_CAST(b_recharge_total AS bigint)) AS max_recharge_total
      FROM ${tableName}
      WHERE "$part_date" >= '${startDate}'
        AND "$part_date" <= '${endDate}'
        AND "#event_name" = 'recharge'
        AND ${zoneFilter}
      GROUP BY b_role_id
    `.trim().replace(/\s+/g, ' ')
  }

  throw new Error(`未知 mode: ${mode}`)
}

async function submitSql(cfg, sql, format = 'csv') {
  const body = new URLSearchParams({
    token: cfg.token,
    projectId: String(cfg.projectId),
    sql,
    format
  }).toString()

  const resp = await fetchWithRetry(`${cfg.baseUrl}/open/submit-sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  }, { label: 'submit-sql' })
  const data = await resp.json()
  if (data.return_code !== 0) {
    const msg = data.return_message || ''
    if (msg.includes('token') || msg.includes('auth') || msg.includes('登录')) {
      throw new Error(`TOKEN 失效: ${msg} —— 请更新 ta-config.json 里对应 region 的 token`)
    }
    throw new Error(`提交 SQL 失败: ${msg}`)
  }
  return data.data.taskId
}

// 拉取单页；同时能识别"任务还在跑"的错误码，返回 { done, running, errored, bytesWritten, msg }
//
// 数数 API 状态迁移（实测）：
//   1. 任务刚 submit：pageId=0 GET 返回 `-1 / The task is running`
//   2. 任务完成 & 有数据：pageId=0 GET 返回二进制 CSV chunk
//   3. 任务完成 & 空结果：pageId=0 GET 返回 `-1008 / the page data does not exist`
//   4. 任务完成 & 已拉完（超出末尾页）：pageId=N GET 返回 `-1008 / the page data does not exist`
//
// 关键：状态 3（空结果）跟"pageId=0 任务还在起步阶段"看起来一样，
// 需要 sawRunning 参数区分：如果之前 poll 见过 running 状态，那 pageId=0 上的 -1008 = 空结果（done）
// 从没见过 running 也没关系 —— 空结果 SQL 数数常常任务瞬间完成，直接给 -1008
//
// out 参数：CSV body 直接流式写入这个 write stream，避免整页 Buffer 化（2GB 上限）
async function fetchResultPage(cfg, taskId, pageId, out, { sawRunning = false, pollElapsedMs = 0 } = {}) {
  const url = `${cfg.baseUrl}/open/sql-result-page?token=${cfg.token}&projectId=${cfg.projectId}&taskId=${taskId}&pageId=${pageId}`
  const resp = await fetchWithRetry(url, undefined, { label: `sql-result-page pageId=${pageId}` })
  const ct = resp.headers.get('content-type') || ''

  // JSON 响应意味着错误或状态提示（成功的 CSV 是 application/octet-stream）
  if (ct.includes('application/json')) {
    const text = await resp.text()
    let data
    try { data = JSON.parse(text) } catch { return { errored: true, msg: text.slice(0, 500) } }

    // 任务还在跑：直接返回状态提示
    const msg = data.return_message || ''
    if (data.return_code === -1 && /running|processing|pending/i.test(msg)) {
      return { running: true }
    }
    // pageId=0 收到 -1008 的三种可能，逻辑：
    //   - 见过 running → 任务已完成 & 空结果（done）
    //   - 没见过 running 且已 poll 超过 30s → 任务已完成 & 空结果（done）
    //     （空结果 SQL 常常从提交就直接返回 -1008，从不经过 running 阶段）
    //   - 没见过 running 且刚 poll 不久 → 任务还在起步（running）
    if (data.return_code === -1008 || /page data does not exist/i.test(msg)) {
      if (pageId === 0 && !sawRunning && pollElapsedMs < 30000) {
        return { running: true }
      }
      return { done: true }
    }
    return { errored: true, msg }
  }

  // 二进制流 = CSV chunk，流式写入 out（backpressure 用 drain 事件等待）
  let bytesWritten = 0
  for await (const chunk of resp.body) {
    if (!out.write(chunk)) {
      await new Promise(res => out.once('drain', res))
    }
    bytesWritten += chunk.length
  }
  // 数数会把空页返回为空 body（0 字节）
  if (bytesWritten === 0) return { done: true }
  return { bytesWritten }
}

// 单个任务最多等 15 分钟（数数早高峰或跨天数据倾斜时会拖很久）
// 卡超时后 fetchCsv 会重试，重新 submit-sql 一般都能成功（新任务往往不撞高峰）
async function pollAndDownload(cfg, taskId, mode, outputPath, { maxWaitPerPollMs = 900000, pollIntervalMs = 2500 } = {}) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const out = fs.createWriteStream(outputPath)
  // 数数开放 API 返回的 CSV 不含表头，按 SELECT 列顺序手动补上
  const headerLine = CSV_HEADERS[mode].join(',') + '\n'
  out.write(headerLine)
  let totalBytes = headerLine.length
  let pageId = 0
  const start = Date.now()
  let sawRunning = false  // 是否曾见过 "The task is running" 状态

  while (true) {
    const r = await fetchResultPage(cfg, taskId, pageId, out, {
      sawRunning,
      pollElapsedMs: Date.now() - start,
    })

    if (r.running) {
      sawRunning = true
      if (Date.now() - start > maxWaitPerPollMs) {
        out.close()
        throw new Error(`任务 ${taskId} 等待超时（>${maxWaitPerPollMs / 1000}s 仍在跑）`)
      }
      if ((Date.now() - start) % 10000 < pollIntervalMs) {
        console.log(`  任务 ${taskId} 运行中... (等 ${Math.round((Date.now() - start) / 1000)}s)`)
      }
      await sleep(pollIntervalMs)
      continue
    }
    if (r.errored) {
      out.close()
      throw new Error(`拉取 pageId=${pageId} 失败: ${r.msg}`)
    }
    if (r.done) {
      // 一页数据都没拉到就已 done → 是空结果（查询区间无数据）；仍算成功
      break
    }

    // fetchResultPage 已把该页 chunk 流式写入 out，这里只累加字节数用作进度显示
    totalBytes += r.bytesWritten

    if (pageId % 5 === 0 || pageId < 3) {
      console.log(`  已下载 pageId=${pageId} (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`)
    }
    pageId++

    // 保护：万一有 bug 无限循环
    if (pageId > 100000) {
      out.close()
      throw new Error(`异常：pageId 超过 10 万，可能进入死循环`)
    }
  }

  await new Promise(res => out.end(res))
  const size = fs.statSync(outputPath).size
  console.log(`💾 已保存: ${outputPath} (${(size / 1024 / 1024).toFixed(2)} MB, 共 ${pageId} 页)`)
  return size
}

/**
 * 拉取指定区域、指定模式的数据到 CSV 文件
 * @param {'domestic'|'overseas'} region
 * @param {'ladder'|'tournament'|'login'} mode
 * @param {string} startDate 'YYYY-MM-DD'（含）
 * @param {string} endDate 'YYYY-MM-DD'（含）
 * @param {string} outputPath 输出 CSV 绝对路径
 * @param {object} opts { retries: 3 } 整体重试次数（submit-sql + 下载 一起重试；超时/网络中断都会触发）
 *
 * 单个 submit-sql 任务超过 pollAndDownload 的 maxWaitPerPollMs（20 分钟）就会 throw，
 * 通常是数数服务端早高峰/跨天数据倾斜。重新 submit-sql 走全新任务往往就能顺利跑完。
 */
export async function fetchCsv(region, mode, startDate, endDate, outputPath, { retries = 2 } = {}) {
  const cfg = getRegionConfig(region)
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`\n🔁 [${region}/${mode}/${startDate}~${endDate}] 第 ${attempt + 1} 次尝试（前次失败: ${lastErr?.message}）`)
        // 大响应网络中断/服务端超时后先等一会儿让服务端清理 socket 池
        await sleep(3000 * attempt)
      }
      console.log(`\n📤 发起 ${region}/${mode} 拉取任务`)
      console.log(`   时间范围: ${startDate} ~ ${endDate}`)
      console.log(`   projectId: ${cfg.projectId}, bZoneIds: [${cfg.bZoneIds.join(', ')}]`)

      const sql = buildSql(mode, startDate, endDate, cfg)
      console.log(`   SQL: ${sql.length > 200 ? sql.slice(0, 200) + '...' : sql}`)

      const taskId = await submitSql(cfg, sql, 'csv')
      console.log(`   任务 ID: ${taskId}`)

      console.log(`📥 分页下载...`)
      const size = await pollAndDownload(cfg, taskId, mode, outputPath)

      return { taskId, outputPath, size }
    } catch (e) {
      lastErr = e
      // TOKEN 失效不该重试（重试也是同样错误，浪费时间）
      if (e.message.includes('TOKEN 失效')) throw e
    }
  }
  throw lastErr
}

// 命令行直接运行
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2)
  const getArg = name => {
    const i = args.indexOf(name)
    return i !== -1 ? args[i + 1] : null
  }
  const region = getArg('--region') || 'domestic'
  const mode = getArg('--mode') || 'ladder'
  const start = getArg('--start')
  const end = getArg('--end')
  const out = getArg('--out')

  if (!start || !end || !out) {
    console.log('用法: node ta-fetch.mjs --region domestic --mode ladder --start 2026-08-08 --end 2026-08-08 --out data/domestic/archive/daily/ladder/2026-08-08.csv')
    process.exit(1)
  }

  fetchCsv(region, mode, start, end, out).catch(e => {
    console.error(`\n❌ ${e.message}`)
    process.exit(1)
  })
}
