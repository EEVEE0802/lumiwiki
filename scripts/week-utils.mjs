// 游戏周编号 & 周内日期计算公共工具
//
// 【周编号规则】
// 常规周：周五 00:00 ~ 下周四 23:59 = 一周（自然日归属周，跟 daily 分片对齐）
//
// 【正式服上线特殊规则】
// - 上线日：2026-09-17（周四）
// - Week 1 = 2026-09-17 (周四) ~ 2026-09-24 (下周三→下周四)，共 8 天
//   ↑ 上线首日单独并入首周，让 Week 1 有 8 天数据
// - Week 2 = 2026-09-25 (周五) ~ 2026-10-01 (下周四)，共 7 天
// - Week N (N≥2) 起严格按"周五~周四"7 天切分
//
// 【实现细节】
// baseFriday = 2026-09-25（Week 2 起点）
// Week 1 手动特判返回 [2026-09-17, 2026-09-24]
// Week N (N≥2) 按 baseFriday + (N-2)*7 算起点
//
// 国内 / 海外全球通服，共用同一套 baseFriday

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Week 1 特殊范围（正式服上线首周，8 天）
const WEEK1_START = '2026-09-17'
const WEEK1_END = '2026-09-24'

function pad(n) { return String(n).padStart(2, '0') }
export function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 读 baseFriday（Week 2 起点）
export function loadBaseFriday() {
  const cfgPath = path.join(__dirname, 'ta-config.json')
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8')).baseFriday
  } catch { return '2026-09-25' }
}

// 生成 [startISO, endISO] 之间的所有日期字符串（含 end 那天）
function dateRange(startISO, endISO) {
  const s = new Date(startISO + 'T00:00:00+08:00')
  const e = new Date(endISO + 'T00:00:00+08:00')
  const dates = []
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    dates.push(formatDate(d))
  }
  return dates
}

// 给定 week 编号，返回该周所有日期字符串（YYYY-MM-DD）
// Week 1 = 8 天（上线首周特殊）；Week N≥2 = 7 天
export function getWeekDates(weekNum, baseFriday = loadBaseFriday()) {
  if (weekNum === 1) {
    return dateRange(WEEK1_START, WEEK1_END)
  }
  // Week N (N≥2) 起点 = baseFriday + (N-2)*7
  const s = new Date(baseFriday + 'T00:00:00+08:00')
  s.setDate(s.getDate() + (weekNum - 2) * 7)
  const dates = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(s); d.setDate(d.getDate() + i)
    dates.push(formatDate(d))
  }
  return dates
}

// 给定 week 编号，返回该周起止日期（YYYY-MM-DD）
export function getWeekRange(weekNum, baseFriday = loadBaseFriday()) {
  const dates = getWeekDates(weekNum, baseFriday)
  return { startDate: dates[0], endDate: dates[dates.length - 1] }
}

// 给定日期，返回它属于哪一周
// Week 1 覆盖 2026-09-17 ~ 2026-09-24；之后按 baseFriday 计算
export function weekOfDate(date, baseFriday = loadBaseFriday()) {
  const d = date instanceof Date ? date : new Date(date + 'T00:00:00+08:00')
  const w1Start = new Date(WEEK1_START + 'T00:00:00+08:00')
  const w1End = new Date(WEEK1_END + 'T23:59:59+08:00')
  if (d >= w1Start && d <= w1End) return 1
  if (d < w1Start) return 0 // 上线前，不属于任何游戏周
  const base = new Date(baseFriday + 'T00:00:00+08:00')
  return Math.floor((d - base) / (7 * 24 * 60 * 60 * 1000)) + 2
}

// 计算当前游戏周信息（供 auto-update 用）
export function computeWeekInfo(baseFriday) {
  const now = new Date()
  const week = weekOfDate(now, baseFriday)
  if (week < 1) {
    // 上线前不应该跑，但兜底返回 Week 1
    return { week: 1, startDate: WEEK1_START, endDate: formatDate(now) }
  }
  const { startDate } = getWeekRange(week, baseFriday)
  return {
    week,
    startDate,
    endDate: formatDate(now)
  }
}

// 昨天 + 今天 所属周（去重升序），供跨周日重跑上一周聚合
export function weeksToProcess(baseFriday) {
  const now = new Date()
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const set = new Set([weekOfDate(yesterday, baseFriday), weekOfDate(now, baseFriday)])
  return [...set].filter(w => w >= 1).sort((a, b) => a - b)
}
