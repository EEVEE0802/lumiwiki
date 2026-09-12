#!/usr/bin/env node
// 未上线 lumi 分析工具：输入 lumiId 列表 → 输出完整技能/被动/Skill2 池 + 自动递归展开所有 <link> 关键字
//
// 用法:
//   node scripts/analysis/dump-lumi-skills.mjs 132501 134001 108001 136301
//   node scripts/analysis/dump-lumi-skills.mjs --all-new      # 自动 diff 对内 vs 对外，输出所有开发版新增
//   node scripts/analysis/dump-lumi-skills.mjs --tag=201      # 只 dump 指定 LumiTag
//   node scripts/analysis/dump-lumi-skills.mjs --out=xxx.md   # 写到 markdown 文件（默认 stdout）
//
// 依据 [[feedback_skill_desc_keywords]] memory 的方法论：读技能描述必须先展开 <link=N> 关键字

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

// ─────────────────────────────────────────────
// 数据源（对内 wiki 生成后的 JSON）
// ─────────────────────────────────────────────
const DATA_DIR = path.join(PROJECT_ROOT, 'public/data/internal')
const load = (name) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf-8'))

const lumis = load('Lumi.json').reduce((m, l) => (m[String(l.Id)] = l, m), {})
const skills = load('ActiveSkill.json').reduce((m, s) => (m[String(s.Id)] = s, m), {})
const passives = load('BattlePassive.json').reduce((m, p) => (m[String(p.Id)] = p, m), {})
const buffs = load('BattleBuff.json').reduce((m, b) => (m[`${b.BuffId}-${b.BuffLv ?? 1}`] = b, m), {})
const keywords = load('BattleKeywordDes.json').reduce((m, k) => (m[String(k.Id)] = k, m), {})
const zh = load('zh-CN.json')

// 属性映射（[[glossary]] LumiType 枚举）
const TYPE_NAME = {
  1: '普', 2: '水', 3: '火', 4: '草', 5: '电', 6: '地', 7: '飞', 8: '冰',
  9: '龙', 10: '光', 11: '暗', 12: '格斗', 13: '超能', 14: '妖精', 15: '钢',
  16: '王', 17: '神'
}
const typeStr = (t1, t2) => {
  const a = TYPE_NAME[t1] || `?${t1}`
  const b = t2 ? TYPE_NAME[t2] : ''
  return b ? `${a}/${b}` : a
}

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────
const tr = (k, fb = '') => {
  if (!k) return fb
  const v = zh[k]
  if (v === undefined) return `[missing:${k}]`
  if (v === '' || v === '[]') return ''
  return v
}

const strip = (s) => (s || '').replace(/<[^>]+>/g, '')

const fmtDes = (des, params) => {
  if (!des) return ''
  let result = des
  ;(params || []).forEach((p, i) => {
    result = result.replaceAll(`{${i}}`, String(p))
  })
  return result
}

/**
 * 递归展开 text 里所有 <link=N> 关键字，返回 { [id]: {name, des} }
 * 关键字详情里如果还有 <link> 继续递归（避免死循环用 seen 集合）
 */
const findKeywords = (text, seen = new Set()) => {
  const kws = {}
  if (!text) return kws
  const matches = [...text.matchAll(/<link=(\d+)>/g)]
  for (const m of matches) {
    const kid = m[1]
    if (seen.has(kid)) continue
    seen.add(kid)
    const k = keywords[kid]
    if (!k) continue
    const kname = tr(k.Name, '')
    const kdes = tr(k.Des, '')
    kws[kid] = { name: kname, des: kdes }
    // 递归展开
    Object.assign(kws, findKeywords(kdes, seen))
  }
  return kws
}

// ─────────────────────────────────────────────
// 输出格式：Markdown（方便直接贴到 analysis 报告）
// ─────────────────────────────────────────────

const printSkill = (sid, tag = '') => {
  const s = skills[String(sid)]
  if (!s) return `${tag}[技能 ${sid} 不存在]\n`
  const name = tr(s.name)
  const desRaw = fmtDes(tr(s.Des), s.DesParam)
  const desClean = strip(desRaw)
  const kws = findKeywords(desRaw)

  let out = `${tag}**[${sid}] ${name}**\n`
  out += `  - Type=${s.LumiTpye} SkillType=${s.SkillType} Target=${s.TargetType}\n`
  out += `  - P=${JSON.stringify(s.SkillPowerList)}  Cost=${JSON.stringify(s.SkillCost)}  Interval=${s.AttackInterval}ms  Crit=${s.BaseCrit}  Energy=${s.AddEnergy}\n`
  if (s.Piercing) out += `  - **Piercing=${s.Piercing}** (万分比)\n`
  if (s.HealthSteal) out += `  - **HealthSteal=${s.HealthSteal}** (万分比)\n`
  if (s.DefCalculate === false) out += `  - DefCalculate=false（跳过防御计算）\n`
  if (desClean) out += `  - 描述: ${desClean}\n`
  if (Object.keys(kws).length) {
    out += `  - 关键字展开:\n`
    for (const [kid, { name, des }] of Object.entries(kws)) {
      const desC = strip(des).replace(/\n/g, ' ')
      out += `    - ★[${kid}] ${name}: ${desC}\n`
    }
  }
  const se = s.SkillEffect || []
  if (se.length) {
    out += `  - SkillEffect: ${JSON.stringify(se)}\n`
  }
  return out
}

const printPassive = (pid, tag = '') => {
  const pv = passives[String(pid)]
  if (!pv) return `${tag}[被动 ${pid} 不存在]\n`
  const name = tr(pv.name)
  const desRaw = fmtDes(tr(pv.Des), pv.DesParam)
  const desClean = strip(desRaw)
  const kws = findKeywords(desRaw)

  let out = `${tag}**[${pid}] ${name}**  Priority=${pv.Priority}\n`
  if (desClean) out += `  - 描述: ${desClean}\n`
  if (Object.keys(kws).length) {
    out += `  - 关键字展开:\n`
    for (const [kid, { name, des }] of Object.entries(kws)) {
      const desC = strip(des).replace(/\n/g, ' ')
      out += `    - ★[${kid}] ${name}: ${desC}\n`
    }
  }
  const buffList = pv.BuffList || []
  if (buffList.length) {
    out += `  - BuffList:\n`
    for (const entry of buffList) {
      const key = `${entry.BuffId}-${entry.BuffLv ?? 1}`
      const b = buffs[key]
      if (!b) {
        out += `    - (buff ${key} 不存在)\n`
        continue
      }
      const bname = tr(b.Name)
      const bdesRaw = fmtDes(tr(b.Des), b.DesParam)
      const bdesClean = strip(bdesRaw)
      out += `    - Buff[${entry.BuffId} Lv${entry.BuffLv ?? 1}] ${bname}  TrigCond=${b.TriggerCondition}  Target=${entry.Target}  Duration=${entry.Duration}\n`
      if (bdesClean && bdesClean !== '[]') out += `      - ${bdesClean}\n`
      // buff 描述里的关键字也展开
      const bkws = findKeywords(bdesRaw)
      for (const [kid, { name, des }] of Object.entries(bkws)) {
        const desC = strip(des).replace(/\n/g, ' ')
        out += `      - ★[${kid}] ${name}: ${desC}\n`
      }
      // 属性 buff 数值
      const interest = ['AttackEnhance', 'DefenceEnhance', 'CritRateEnhance', 'CritOnHitRateEnhance',
        'TotalDamageEnhance', 'SkillDamageEnhance', 'NormalDamageEnhance', 'TotalOnHitEnhance',
        'AttackSpeedEnhance', 'SkillCostChange', 'HealthSteal', 'Piercing', 'SkillPowerChange',
        'AttackDamageLock', 'Vertigo', 'TickTime', 'SwitchRemove']
      const props = {}
      for (const k of interest) {
        const v = b[k]
        if (v && (typeof v !== 'object' || (Array.isArray(v) && v.length))) props[k] = v
      }
      if (Object.keys(props).length) out += `      - Props: ${JSON.stringify(props)}\n`
      if (b.ConditonIndex || (b.EffectId && b.EffectId.length)) {
        out += `      - ConditonIndex=${b.ConditonIndex} EffectId=${JSON.stringify(b.EffectId)}\n`
      }
    }
  }
  return out
}

const printLumi = (lid) => {
  const l = lumis[String(lid)]
  if (!l) return `# ${lid} [不存在]\n`
  const name = tr(l.Name)
  let out = `\n## ${lid} · ${name}（${typeStr(l.Type1, l.Type2)}）\n\n`
  out += `**LumiTag=${l.LumiTag}  MaxScore=${l.MaxScore}  CardBack=${l.CardBack}**\n\n`
  out += `**资质**：HP=[${l.MinHpState}, ${l.MaxHpState}]  ATK=[${l.MinAtkState}, ${l.MaxAtkState}]  DEF=[${l.MinDefState}, ${l.MaxDefState}]  Work=[${l.MinWorkState}, ${l.MaxWorkState}]\n\n`

  out += `### 普攻 NormalAttack\n\n`
  out += printSkill(l.NormalAttack)

  out += `\n### 主动技 1 (ActiveSkill · Skill1 固定)\n\n`
  out += printSkill(l.ActiveSkill)

  out += `\n### 常规被动 (BattlePassive · 需养成度门槛)\n\n`
  out += printPassive(l.BattlePassive)

  if (l.InbornBattlePassive) {
    out += `\n### 🌟 先天被动 (InbornBattlePassive · 无门槛始终解锁)\n\n`
    out += printPassive(l.InbornBattlePassive)
  }

  out += `\n### Skill2 池 (玩家自选 · [[04 章 § 八]])\n\n`
  for (const pool of ['SkillPool1', 'SkillPool2', 'SkillPool3']) {
    const sids = l[pool] || []
    if (sids.length) {
      out += `**${pool}**:\n\n`
      for (const sid of sids) {
        out += printSkill(sid)
      }
    }
  }

  out += `\n---\n`
  return out
}

// ─────────────────────────────────────────────
// 命令行参数解析
// ─────────────────────────────────────────────

const args = process.argv.slice(2)
let targetIds = []
let outFile = null
let tagFilter = null
let allNew = false

for (const a of args) {
  if (a.startsWith('--out=')) outFile = a.slice(6)
  else if (a.startsWith('--tag=')) tagFilter = parseInt(a.slice(6))
  else if (a === '--all-new') allNew = true
  else if (/^\d+$/.test(a)) targetIds.push(a)
}

if (allNew || tagFilter !== null) {
  // 对内 vs 对外 diff
  const EXT_LUMI_PATH = 'F:/G36/LumiGoDesigner/Config/Luban/Datas/check/data/Lumi.json'
  if (!fs.existsSync(EXT_LUMI_PATH)) {
    console.error(`找不到对外 Lumi 表: ${EXT_LUMI_PATH}`)
    process.exit(1)
  }
  const extIds = new Set(JSON.parse(fs.readFileSync(EXT_LUMI_PATH, 'utf-8')).map(l => String(l.Id)))
  const newIds = Object.keys(lumis).filter(id => !extIds.has(id))
  if (tagFilter !== null) {
    targetIds = newIds.filter(id => lumis[id].LumiTag === tagFilter)
  } else {
    targetIds = newIds
  }
  console.error(`筛选出 ${targetIds.length} 只 lumi（tag=${tagFilter ?? 'all-new'}）`)
}

if (targetIds.length === 0) {
  console.error('用法: node dump-lumi-skills.mjs <lumiId> [<lumiId>...] | --all-new | --tag=N | --out=file.md')
  process.exit(1)
}

// 输出
let output = ''
for (const lid of targetIds) {
  output += printLumi(lid)
}

if (outFile) {
  const outPath = path.resolve(outFile)
  fs.writeFileSync(outPath, output, 'utf-8')
  console.error(`✓ 写入 ${outPath} · ${output.split('\n').length} 行 · ${targetIds.length} 只 lumi`)
} else {
  process.stdout.write(output)
}
