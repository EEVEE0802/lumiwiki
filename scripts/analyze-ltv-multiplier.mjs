#!/usr/bin/env node
/**
 * D1~D15 LTV 倍率分析（按入场日 cohort 拆分 + 加权汇总，全体玩家含 0 氪）
 *
 * 用法:
 *   # 先拉数据
 *   node scripts/ta-fetch.mjs --region cn --mode recharge-daily --start 2026-09-17 --end 2026-10-02 --out data/cn/archive/recharge-daily.csv
 *
 *   # 再分析
 *   node scripts/analyze-ltv-multiplier.mjs --region cn --cutoff 2026-10-02 [--max-n 15]
 *
 * 口径:
 *   - D(N) = 首登日当天开始算，首登日 = D1
 *   - cohort(d0) = 首登日 = d0 的玩家
 *   - LTV(N, d0) = Σ_cohort(d0) [累计充值 at d0+N-1 / 100] / |cohort(d0)|   （元）
 *   - 倍率(N, d0) = LTV(N, d0) / LTV(1, d0)   ← 同一批人
 *   - 加权倍率(N):
 *       - 按金额 = Σ_d0 S_N(d0) / Σ_d0 S_1(d0)
 *       - 按人数 = Σ_d0 [|cohort(d0)| × 倍率(N,d0)] / Σ_d0 |cohort(d0)|
 *     分母只纳入能观测到 D(N) 的 cohort（d0 + N - 1 ≤ cutoff）
 *
 * 输出:
 *   docs/retention-analysis/ltv-multiplier-{region}.md
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { processCSVStream } from './lib/csv.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..')

const args = process.argv.slice(2)
const arg = (name, def) => {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : def
}
const region = arg('--region', 'cn')
const CUTOFF = arg('--cutoff', '2026-10-02')
const LAUNCH = '2026-09-17'
const MAX_N = parseInt(arg('--max-n', '15'), 10)
const PREDICT_UNTIL = parseInt(arg('--predict-until', '0'), 10) || 0
const FIT_FROM = parseInt(arg('--fit-from', '7'), 10) // 从 D(FIT_FROM) 开始拟合（避开首充峰值）
const MIN_FIT_POINTS = parseInt(arg('--min-fit-points', '3'), 10)

if (!['cn', 'overseas'].includes(region)) {
  console.error('--region 仅支持 cn / overseas')
  process.exit(1)
}

const ONE_DAY_MS = 86400000
function toUTC(d) {
  const [y, m, dd] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, dd)
}
function fromUTC(ms) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
function addDays(d, n) { return fromUTC(toUTC(d) + n * ONE_DAY_MS) }
function dateRange(start, end) {
  const out = []
  const stop = toUTC(end)
  for (let t = toUTC(start); t <= stop; t += ONE_DAY_MS) out.push(fromUTC(t))
  return out
}

const ALL_DATES = dateRange(LAUNCH, CUTOFF)

console.log(`===== D1~D${MAX_N} LTV 倍率分析（按入场日 cohort） (${region}, 截止 ${CUTOFF}) =====`)
console.log(`分析窗口: ${LAUNCH} ~ ${CUTOFF} (${ALL_DATES.length} 天)\n`)

// ---------- 1. 建每玩家首登日 ----------
async function buildFirstLogin() {
  const map = new Map()
  for (const date of ALL_DATES) {
    const csv = path.join(PROJECT_ROOT, `data/${region}/archive/daily/login/${date}.csv`)
    if (!fs.existsSync(csv)) continue
    let lines = 0
    await processCSVStream(csv, (row) => {
      lines++
      const r = row.b_role_id
      const d = (row.part_date || '').slice(0, 10)
      if (!r || !d || d < LAUNCH || d > CUTOFF) return
      const cur = map.get(r)
      if (!cur || d < cur) map.set(r, d)
    })
    console.log(`  login ${date}: ${lines.toLocaleString()} 行 → 累计 ${map.size.toLocaleString()} 玩家`)
  }
  return map
}

// ---------- 2. 读 recharge-daily CSV ----------
async function buildRecharge() {
  const csv = path.join(PROJECT_ROOT, `data/${region}/archive/recharge-daily.csv`)
  if (!fs.existsSync(csv)) {
    throw new Error(`recharge-daily.csv 不存在，请先跑: \n  node scripts/ta-fetch.mjs --region ${region} --mode recharge-daily --start ${LAUNCH} --end ${CUTOFF} --out data/${region}/archive/recharge-daily.csv`)
  }
  const map = new Map() // b_role_id -> Array<[date, cumulative_cents]>（按日期升序）
  let lines = 0
  await processCSVStream(csv, (row) => {
    lines++
    const r = row.b_role_id
    const d = (row.part_date || '').slice(0, 10)
    const amt = parseFloat(row.daily_max_recharge)
    if (!r || !d || !Number.isFinite(amt)) return
    let arr = map.get(r)
    if (!arr) { arr = []; map.set(r, arr) }
    arr.push([d, amt])
  })
  for (const arr of map.values()) {
    arr.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
  }
  console.log(`\n充值数据: ${lines.toLocaleString()} 行 → ${map.size.toLocaleString()} 付费玩家`)
  return map
}

// 对指定玩家，返回 firstLogin + N - 1 这天结束时的累计充值（分，没充过视 0）
function cumulativeAtDay(firstLogin, N, records) {
  if (!records) return 0
  const limit = addDays(firstLogin, N - 1)
  let best = 0
  for (const [d, amt] of records) {
    if (d > limit) break
    if (amt > best) best = amt
  }
  return best
}

async function main() {
  const firstLogin = await buildFirstLogin()
  const recharge = await buildRecharge()

  let registeredPayers = 0
  for (const rid of recharge.keys()) if (firstLogin.has(rid)) registeredPayers++
  console.log(`注册玩家总数: ${firstLogin.size.toLocaleString()}`)
  console.log(`其中有过充值: ${registeredPayers.toLocaleString()}（${(registeredPayers / firstLogin.size * 100).toFixed(2)}%）\n`)

  // ---------- 按首登日分 cohort ----------
  const cohortsMap = new Map() // d0 -> rid[]
  for (const [rid, fl] of firstLogin) {
    if (!cohortsMap.has(fl)) cohortsMap.set(fl, [])
    cohortsMap.get(fl).push(rid)
  }
  const cohortDates = [...cohortsMap.keys()].sort()

  // ---------- 对每 cohort 算 D1~D(MAX_N) 的总充值 ----------
  // byCohort[d0] = { size, cents: [S1, S2, ..., S_MAX_N], maxObservableN }
  const byCohort = {}
  for (const d0 of cohortDates) {
    const rids = cohortsMap.get(d0)
    const cents = new Array(MAX_N).fill(0)
    const maxObservableN = Math.min(MAX_N, 1 + Math.floor((toUTC(CUTOFF) - toUTC(d0)) / ONE_DAY_MS))
    for (const rid of rids) {
      const rec = recharge.get(rid)
      if (!rec) continue
      for (let N = 1; N <= maxObservableN; N++) {
        cents[N - 1] += cumulativeAtDay(d0, N, rec)
      }
    }
    byCohort[d0] = { size: rids.length, cents, maxObservableN }
  }

  // ---------- 加权总倍率 ----------
  const weighted = []
  for (let N = 1; N <= MAX_N; N++) {
    let sumSN = 0, sumS1 = 0
    let sumSizeTimesRatio = 0, sumSize = 0
    let eligibleCohorts = 0, eligiblePlayers = 0
    for (const d0 of cohortDates) {
      const c = byCohort[d0]
      if (c.maxObservableN < N) continue
      eligibleCohorts++
      eligiblePlayers += c.size
      sumSN += c.cents[N - 1]
      sumS1 += c.cents[0]
      sumSize += c.size
      const ltv1 = c.cents[0] / c.size
      const ltvN = c.cents[N - 1] / c.size
      if (ltv1 > 0) sumSizeTimesRatio += c.size * (ltvN / ltv1)
    }
    weighted.push({
      N,
      eligibleCohorts,
      eligiblePlayers,
      ltv1Yuan: sumSize ? sumS1 / 100 / sumSize : 0,
      ltvNYuan: sumSize ? sumSN / 100 / sumSize : 0,
      byAmount: sumS1 ? sumSN / sumS1 : null,
      byPlayer: sumSize ? sumSizeTimesRatio / sumSize : null,
    })
  }

  // ---------- Markdown 报告 ----------
  const L = []
  L.push(`# ${region.toUpperCase()} 服 D1~D${MAX_N} LTV 倍率（按入场日 cohort）`)
  L.push('')
  L.push(`- **截止日期**: ${CUTOFF}`)
  L.push(`- **上线日**: ${LAUNCH}（Week 1 起点）`)
  L.push(`- **分析窗口**: ${LAUNCH} ~ ${CUTOFF}（${ALL_DATES.length} 天）`)
  L.push(`- **样本**: 注册玩家 ${firstLogin.size.toLocaleString()} 人（含 0 氪，不区分付费档）`)
  L.push(`- **D1 定义**: 首登日当天（含）= D1`)
  L.push(`- **cohort(d0)** = 首登日 = d0 的玩家；LTV(N, d0) = cohort 在 d0+N-1 结束时累计充值均值`)
  L.push('')

  // === 1. 加权总倍率（最重要的汇总） ===
  L.push(`## 1. 加权 LTV 倍率（汇总）`)
  L.push('')
  L.push(`> **只纳入能观测到 D(N) 的 cohort**（即 d0 + N - 1 ≤ cutoff）。随 N 增大，纳入 cohort 减少、样本偏向早期入场玩家。`)
  L.push(`>`)
  L.push(`> **两种加权口径**（都是同一批玩家 D1→D(N) 的放大倍数）：`)
  L.push(`> - **按金额加权** = Σ 该批 D(N) 总充值 / Σ 该批 D1 总充值；大 cohort 对结果贡献大，反映"钱多的 cohort 的放大系数"`)
  L.push(`> - **按人数加权** = Σ |cohort| × 该 cohort 自己的倍率 / Σ |cohort|；各 cohort 按人数等权，更贴近"典型 cohort 的放大系数"`)
  L.push('')
  L.push(`| N | 纳入 cohort 数 | 纳入玩家数 | 该批 LTV(1) 元 | 该批 LTV(N) 元 | **按金额加权倍率** | **按人数加权倍率** |`)
  L.push(`|---|---:|---:|---:|---:|---:|---:|`)
  for (const w of weighted) {
    L.push(`| D${w.N} | ${w.eligibleCohorts} | ${w.eligiblePlayers.toLocaleString()} | ${w.ltv1Yuan.toFixed(2)} | ${w.ltvNYuan.toFixed(2)} | **${w.byAmount != null ? w.byAmount.toFixed(3) + '×' : '-'}** | **${w.byPlayer != null ? w.byPlayer.toFixed(3) + '×' : '-'}** |`)
  }
  L.push('')

  // === 2. 各入场日 cohort LTV（元/人） ===
  L.push(`## 2. 各入场日 cohort LTV（元/人）`)
  L.push('')
  L.push(`> 每行一个入场日 d0。空白 = 该 N 还没到观测期（d0 + N - 1 > ${CUTOFF}）`)
  L.push('')
  const nHeaders = Array.from({ length: MAX_N }, (_, i) => `D${i + 1}`)
  L.push(`| 首登日 | cohort 规模 | ${nHeaders.join(' | ')} |`)
  L.push(`|---|---:|${nHeaders.map(() => '---:').join('|')}|`)
  for (const d0 of cohortDates) {
    const c = byCohort[d0]
    const row = [d0, c.size.toLocaleString()]
    for (let N = 1; N <= MAX_N; N++) {
      if (N > c.maxObservableN) {
        row.push('-')
      } else {
        row.push((c.cents[N - 1] / 100 / c.size).toFixed(2))
      }
    }
    L.push(`| ${row.join(' | ')} |`)
  }
  L.push('')

  // === 3. 各入场日 cohort LTV 倍率（LTV(N) / LTV(1)） ===
  L.push(`## 3. 各入场日 cohort LTV 倍率（LTV(N) / LTV(1)）`)
  L.push('')
  L.push(`> 每行一个入场日 d0。D1 恒等于 1.000×。空白 = 该 N 还没到观测期；"-" = 该 cohort D1 为 0（无法计算倍率）。`)
  L.push('')
  L.push(`| 首登日 | cohort 规模 | ${nHeaders.join(' | ')} |`)
  L.push(`|---|---:|${nHeaders.map(() => '---:').join('|')}|`)
  for (const d0 of cohortDates) {
    const c = byCohort[d0]
    const row = [d0, c.size.toLocaleString()]
    const ltv1 = c.cents[0]
    for (let N = 1; N <= MAX_N; N++) {
      if (N > c.maxObservableN) {
        row.push('-')
      } else if (ltv1 === 0) {
        row.push('-')
      } else {
        row.push((c.cents[N - 1] / ltv1).toFixed(3) + '×')
      }
    }
    L.push(`| ${row.join(' | ')} |`)
  }
  L.push('')

  // === 4. 预估 D(PREDICT_UNTIL)：每 cohort 独立拟合 + 加权汇总 ===
  let predictionSection = null
  if (PREDICT_UNTIL > MAX_N) {
    // 对每 cohort 用 D(FIT_FROM)+ 做对数 + 幂律两种拟合
    const preds = []
    for (const d0 of cohortDates) {
      const c = byCohort[d0]
      const ltv1 = c.cents[0] / c.size // 分
      if (ltv1 === 0) continue
      // 构建拟合点：N -> 倍率
      const points = []
      for (let N = FIT_FROM; N <= c.maxObservableN; N++) {
        points.push([N, c.cents[N - 1] / c.cents[0]])
      }
      if (points.length < MIN_FIT_POINTS) continue
      // 对数拟合 y = a + b * ln(x)
      const logFit = (() => {
        const n = points.length
        const xs = points.map(p => Math.log(p[0]))
        const ys = points.map(p => p[1])
        const xBar = xs.reduce((s, v) => s + v, 0) / n
        const yBar = ys.reduce((s, v) => s + v, 0) / n
        let num = 0, den = 0
        for (let i = 0; i < n; i++) {
          num += (xs[i] - xBar) * (ys[i] - yBar)
          den += (xs[i] - xBar) ** 2
        }
        const b = num / den
        const a = yBar - b * xBar
        return { a, b, fn: x => a + b * Math.log(x) }
      })()
      // 幂律拟合 y = a * x^b
      const powFit = (() => {
        const n = points.length
        const xs = points.map(p => Math.log(p[0]))
        const ys = points.map(p => Math.log(p[1]))
        const xBar = xs.reduce((s, v) => s + v, 0) / n
        const yBar = ys.reduce((s, v) => s + v, 0) / n
        let num = 0, den = 0
        for (let i = 0; i < n; i++) {
          num += (xs[i] - xBar) * (ys[i] - yBar)
          den += (xs[i] - xBar) ** 2
        }
        const b = num / den
        const a = Math.exp(yBar - b * xBar)
        return { a, b, fn: x => a * Math.pow(x, b) }
      })()
      preds.push({
        d0, size: c.size, ltv1Yuan: ltv1 / 100,
        numPoints: points.length, maxObservedN: c.maxObservableN,
        logFit, powFit,
        logD30: logFit.fn(PREDICT_UNTIL),
        powD30: powFit.fn(PREDICT_UNTIL),
      })
    }
    // 加权汇总（按 cohort 人数）
    const totalSize = preds.reduce((s, p) => s + p.size, 0)
    const wLog = preds.reduce((s, p) => s + p.size * p.logD30, 0) / totalSize
    const wPow = preds.reduce((s, p) => s + p.size * p.powD30, 0) / totalSize
    const wLtv1 = preds.reduce((s, p) => s + p.size * p.ltv1Yuan, 0) / totalSize
    predictionSection = { preds, totalSize, wLog, wPow, wLtv1 }
  }

  if (predictionSection) {
    const { preds, totalSize, wLog, wPow, wLtv1 } = predictionSection
    L.push(`## 4. D${PREDICT_UNTIL} 预估：每 cohort 独立拟合外推`)
    L.push('')
    L.push(`> **方法**：对每个 cohort 用它自己 D${FIT_FROM}~D(实测) 的倍率数据做曲线拟合（至少 ${MIN_FIT_POINTS} 个点），然后外推到 D${PREDICT_UNTIL}。`)
    L.push(`>`)
    L.push(`> **两种模型**：`)
    L.push(`> - **对数模型** y = a + b×ln(N) — 增速按 1/N 衰减，偏保守`)
    L.push(`> - **幂律模型** y = a×N^b — 增速按 N^(b-1) 衰减，中性`)
    L.push(`>`)
    L.push(`> **纳入 cohort**：${preds.length} 个（${totalSize.toLocaleString()} 人，占全体注册 ${(totalSize / firstLogin.size * 100).toFixed(1)}%），需至少有 ${MIN_FIT_POINTS} 个 D${FIT_FROM}+ 实测点`)
    L.push('')
    L.push(`### 各 cohort 预估`)
    L.push('')
    L.push(`| 首登日 | cohort 规模 | 拟合点数 | 实测截止 | D1 LTV (元) | **对数 D${PREDICT_UNTIL} 倍率** | **幂律 D${PREDICT_UNTIL} 倍率** | 对数 D${PREDICT_UNTIL} LTV (元) | 幂律 D${PREDICT_UNTIL} LTV (元) |`)
    L.push(`|---|---:|---:|---:|---:|---:|---:|---:|---:|`)
    for (const p of preds) {
      L.push(`| ${p.d0} | ${p.size.toLocaleString()} | ${p.numPoints} | D${p.maxObservedN} | ${p.ltv1Yuan.toFixed(2)} | **${p.logD30.toFixed(3)}×** | **${p.powD30.toFixed(3)}×** | ${(p.logD30 * p.ltv1Yuan).toFixed(2)} | ${(p.powD30 * p.ltv1Yuan).toFixed(2)} |`)
    }
    L.push('')
    L.push(`### 加权汇总预估（按人数加权）`)
    L.push('')
    L.push(`| 模型 | 预估 D${PREDICT_UNTIL} 倍率 | 预估 D${PREDICT_UNTIL} LTV (元) |`)
    L.push(`|---|---:|---:|`)
    L.push(`| **对数模型（保守）** | **${wLog.toFixed(3)}×** | **${(wLog * wLtv1).toFixed(2)}** |`)
    L.push(`| **幂律模型（中性）** | **${wPow.toFixed(3)}×** | **${(wPow * wLtv1).toFixed(2)}** |`)
    L.push(`| **区间中枢** | **${((wLog + wPow) / 2).toFixed(3)}×** | **${(((wLog + wPow) / 2) * wLtv1).toFixed(2)}** |`)
    L.push('')
    L.push(`> ⚠️ **预估的向上风险**：公会战/月卡/节日活动等周期性付费点，模型按单调衰减外推，可能低估`)
    L.push(`> **向下风险**：9/17 cohort 是硬核首发玩家，权重大但不代表后续入场的普通玩家，可能高估`)
    L.push('')
  }

  L.push(`## 口径说明`)
  L.push('')
  L.push(`- **分 cohort 看倍率**才真正可比：同一批玩家从 D1 到 D(N) 的 LTV 放大系数，口径一致`)
  L.push(`- **汇总加权**消除单日入场数差异：按金额加权 vs 按人数加权，两种都有意义`)
  L.push(`- **D${MAX_N} 只能靠最早的 cohort 支撑**（${weighted[MAX_N - 1].eligibleCohorts} 个入场日），样本偏向开服当天入场玩家，解读谨慎`)
  if (PREDICT_UNTIL > MAX_N) {
    L.push(`- **预估部分**只用了有 ${MIN_FIT_POINTS}+ 个 D${FIT_FROM}+ 实测点的 cohort（≈ 开服前 ${MAX_N - FIT_FROM - MIN_FIT_POINTS + 2} 天入场的玩家），对后续 cohort 的 D${PREDICT_UNTIL} 预估需要积累更多数据后迭代`)
  }
  L.push('')
  L.push(`_生成于 ${new Date().toLocaleString('zh-CN')}_`)

  const outDir = path.join(PROJECT_ROOT, 'docs/retention-analysis')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `ltv-multiplier-${region}.md`)
  fs.writeFileSync(outPath, L.join('\n'))
  console.log(`\n报告写入: ${outPath}`)

  console.log('\n预览·加权总倍率:')
  console.log(`N\t纳入cohort\tLTV(1)元\tLTV(N)元\t金额加权\t人数加权`)
  for (const w of weighted) {
    console.log(`D${w.N}\t${w.eligibleCohorts}\t\t${w.ltv1Yuan.toFixed(2)}\t\t${w.ltvNYuan.toFixed(2)}\t\t${w.byAmount?.toFixed(3)}\t\t${w.byPlayer?.toFixed(3)}`)
  }

  if (predictionSection) {
    const { preds, totalSize, wLog, wPow, wLtv1 } = predictionSection
    console.log(`\n预览·D${PREDICT_UNTIL} 预估（每 cohort 独立拟合 D${FIT_FROM}+，加权汇总）:`)
    console.log(`入场日\t\tsize\t点数\tD1LTV\t对数D30\t幂律D30`)
    for (const p of preds) {
      console.log(`${p.d0}\t${p.size}\t${p.numPoints}\t${p.ltv1Yuan.toFixed(2)}\t${p.logD30.toFixed(3)}\t${p.powD30.toFixed(3)}`)
    }
    console.log(`\n加权汇总 (总样本 ${totalSize.toLocaleString()} 人, 平均 D1 LTV ${wLtv1.toFixed(2)} 元):`)
    console.log(`  对数模型 D${PREDICT_UNTIL} = ${wLog.toFixed(3)}× (${(wLog * wLtv1).toFixed(2)} 元)`)
    console.log(`  幂律模型 D${PREDICT_UNTIL} = ${wPow.toFixed(3)}× (${(wPow * wLtv1).toFixed(2)} 元)`)
    console.log(`  中枢      D${PREDICT_UNTIL} = ${((wLog + wPow) / 2).toFixed(3)}× (${(((wLog + wPow) / 2) * wLtv1).toFixed(2)} 元)`)
  }
}

main().catch(e => {
  console.error('❌ 失败:', e)
  process.exit(1)
})
