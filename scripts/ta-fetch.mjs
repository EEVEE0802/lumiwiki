import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadConfig() {
  const configPath = path.join(__dirname, 'ta-config.json')
  if (!fs.existsSync(configPath)) {
    throw new Error('ta-config.json 不存在，请复制 ta-config.example.json 为 ta-config.json 并填入配置')
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// 构建 groupBy 字段定义
function buildField(columnName, columnType, selectType, clusterDatePolicy) {
  return {
    columnDesc: columnName,
    columnName,
    columnType,
    selectType,
    propertyRange: '',
    propertyRangeType: selectType === 'number' ? '0' : '',
    tableType: '0',
    subTableType: '',
    timeTypeColumnFormart: '',
    arrayGroupType: '',
    clusterDatePolicy: clusterDatePolicy || null,
    clusterDatePolicyConfigurable: false,
    specifiedClusterDate: '',
    dimRelateName: columnName
  }
}

function buildGroupBy(mode) {
  const fields = [
    buildField('game_id_str', 'varchar', 'string', null),
    buildField('b_role_id', 'varchar', 'string', null),
    buildField('player_rank', 'double', 'number', 'LATEST'),
    buildField('player_type', 'double', 'number', 'LATEST'),
    buildField('player_lumis', 'varchar', 'string', null),
    buildField('battle_result', 'double', 'number', 'LATEST')
  ]
  if (mode === 'tournament') {
    fields.push(buildField('player_week_win', 'double', 'number', 'LATEST'))
  }
  return fields
}

function buildFilts(bZoneId, gameType, todayStr) {
  const make = (columnName, value) => ({
    calcuSymbol: 'C00',
    columnDesc: columnName,
    columnName,
    columnType: 'varchar',
    ftv: [value],
    selectType: 'string',
    tableType: '0',
    subTableType: '',
    timeRelative: '',
    timeUnit: '',
    clusterDatePolicy: null,
    clusterDatePolicyConfigurable: false,
    specifiedClusterDate: todayStr
  })
  return [make('b_zone_id', bZoneId), make('game_type', gameType)]
}

function buildQueryParams(mode, startTime, endTime, bZoneId) {
  const gameType = mode === 'tournament' ? 'Week1v1' : 'PVP1V1'
  const todayStr = new Date().toISOString().slice(0, 10)
  const stageInfo = [{ eventUuid: 'saN0CpyP', stage: 'sum' }]
  const visualInfo = [{ name: 'battle_end.   ', type: 'line', show: false, isSplit: false, eventUuid: 'saN0CpyP' }]

  return {
    events: [{
      analysis: 'A100',
      analysisDesc: '   ',
      eventUuid: 'saN0CpyP',
      analysisParams: '',
      customEvent: '',
      customFilters: [],
      quotaEntities: null,
      eventName: 'battle_end',
      eventDesc: 'battle_end',
      metricName: null,
      metric: null,
      eventType: 'event',
      eventNameDisplay: 'battle_end.   ',
      eventSplitIndexes: null,
      filts: [],
      quota: '',
      quotaDesc: '',
      subTableType: '',
      relation: 1,
      type: 0,
      bubbleInfo: {
        bubbleType: 'super_event',
        dataStatus: 'normal',
        desc: '',
        displayName: '',
        hasConnected: true,
        id: 13321,
        name: 'battle_end',
        sourceType: 'report'
      }
    }],
    eventView: {
      startTime,
      timeParticleSize: 'T1',
      endTime,
      graphShape: 'L0',
      recentDay: '0-5',
      groupBy: buildGroupBy(mode),
      rowSpanType: 'fold',
      stageInfo,
      stageFlag: true,
      visualInfo,
      retentionType: null,
      retentionDisplaySet: null,
      retentionCollectSet: null,
      startToNow: -1,
      startToYesterday: -1,
      comparedTimeList: [],
      markLineInfo: [],
      byType: 'date',
      uiCommonConfig: JSON.stringify({
        tableSorts: [],
        chartSort: 'num-desc',
        stageInfo,
        visualInfo,
        markLineInfo: [],
        stageFlag: true,
        showChartLabel: false,
        showChartPercent: true,
        topNOptions: 10,
        pieNums: 2,
        byType: 'date',
        comparedTimeStage: null,
        comparedTimeStages: [],
        layerExpandedIndex: '',
        startToNow: -1,
        startToYesterday: -1
      }),
      filts: buildFilts(bZoneId, gameType, todayStr),
      relation: 1,
      comparedByTime: false,
      eventSplit: null
    },
    origin: 1
  }
}

async function submitTask(config, qp) {
  const formData = new FormData()
  formData.append('projectId', String(config.projectId))
  formData.append('eventModel', '0')
  formData.append('qp', JSON.stringify(qp))
  formData.append('format', 'BY_DATE')
  formData.append('periodAverage', 'false')
  formData.append('stageConfigOnTime', JSON.stringify({
    stageFlag: true,
    stageInfo: [{ eventUuid: 'saN0CpyP', stage: 'sum' }],
    byType: 'date',
    columnSortType: ''
  }))

  const resp = await fetch(`${config.baseUrl}/v1/ta/event/eventSearchDownloadAsync`, {
    method: 'POST',
    headers: { Authorization: `bearer ${config.token}` },
    body: formData
  })

  if (resp.status === 401) {
    throw new Error('TOKEN 失效（HTTP 401）—— 请重新登录数数平台，更新 ta-config.json 里的 token')
  }

  const data = await resp.json()
  if (data.return_code !== 0) {
    const msg = data.return_message || ''
    if (msg.includes('token') || msg.includes('auth') || msg.includes('login')) {
      throw new Error(`TOKEN 失效: ${msg} —— 请更新 ta-config.json 里的 token`)
    }
    throw new Error(`发起任务失败: ${msg}`)
  }
  return data.data.taskId
}

async function pollTask(config, taskId, { maxWait = 300000, interval = 3000 } = {}) {
  const start = Date.now()
  let lastProgress = -1
  while (Date.now() - start < maxWait) {
    await sleep(interval)
    const url = `${config.baseUrl}/v1/ta/auth/manage/task/asyncTaskProgress?@t=${Date.now()}&projectId=${config.projectId}&taskIds=${taskId}`
    const resp = await fetch(url, {
      headers: { Authorization: `bearer ${config.token}` }
    })
    const data = await resp.json()
    if (data.return_code !== 0) {
      throw new Error(`查询任务状态失败: ${data.return_message}`)
    }
    const task = data.data[0]
    if (task.asyncTaskStatus === 'async_ok') {
      console.log(`  任务 ${taskId} 完成 (100%)`)
      return
    }
    if (task.progress !== lastProgress) {
      console.log(`  任务 ${taskId} 进度: ${task.progress}% (${task.asyncTaskStatus})`)
      lastProgress = task.progress
    }
  }
  throw new Error(`任务 ${taskId} 超时（>${maxWait / 1000}s）`)
}

async function downloadCsv(config, taskId) {
  const url = `${config.baseUrl}/v1/ta/auth/manage/task/taskFileDownload?access_token=${config.token}&projectId=${config.projectId}&taskId=${taskId}`
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`下载失败: HTTP ${resp.status}`)
  }
  return await resp.text()
}

export async function fetchCsv(mode, startTime, endTime, outputPath) {
  const config = loadConfig()
  console.log(`\n📤 发起 ${mode} 导出任务`)
  console.log(`   时间范围: ${startTime} ~ ${endTime}`)
  console.log(`   区服: ${config.bZoneId}, 玩法: ${mode === 'tournament' ? 'Week1v1' : 'PVP1V1'}`)

  const qp = buildQueryParams(mode, startTime, endTime, config.bZoneId)
  const taskId = await submitTask(config, qp)
  console.log(`   任务 ID: ${taskId}`)

  console.log(`⏳ 轮询任务状态...`)
  await pollTask(config, taskId)

  console.log(`📥 下载 CSV...`)
  const csv = await downloadCsv(config, taskId)

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, csv, 'utf-8')
  console.log(`💾 已保存: ${outputPath} (${(csv.length / 1024 / 1024).toFixed(2)} MB)`)

  return { taskId, outputPath, size: csv.length }
}

// 命令行直接运行
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2)
  const getArg = name => {
    const i = args.indexOf(name)
    return i !== -1 ? args[i + 1] : null
  }
  const mode = getArg('--mode') || 'ladder'
  const start = getArg('--start')
  const end = getArg('--end')
  const out = getArg('--out')

  if (!start || !end || !out) {
    console.log('用法: node ta-fetch.mjs --mode ladder --start "2026-07-10 00:00:00" --end "2026-07-15 23:59:59" --out data/archive/week1/ladder_week1.csv')
    process.exit(1)
  }

  fetchCsv(mode, start, end, out).catch(e => {
    console.error(`\n❌ ${e.message}`)
    process.exit(1)
  })
}
