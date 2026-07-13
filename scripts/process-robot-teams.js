// 机器人阵容数据处理
//
// 数据链路（共用）：
//   MonsterGroup[MonsterGroupID] → MonsterIdList[].Id → Monster[MonsterId]
//     → LumiId → Lumi[Id]（头像 CA / 名字 / 属性 / MaxScore）
//   评分 = (HpState + AtkState + DefState + WorkState) / 4，四舍五入取整
//   等级/突破 取自 MonsterGroup.MonsterIdList 的 Lv / BreakLv
//
// 道馆（dojo）：gym.EnemyTeam → MonsterGroup
// 天梯（ladder）：RobotLvMatching[Id=等级档位].RobotList → RobotData[Id].Team → MonsterGroup
//   （目标等级不在档位里时，匹配 ≤ 它的最大档位，由前端选择器处理）
// 家园（home）：待后续接入。

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 游戏原始数据：客户端 / 服务端两套（见 CLAUDE.md「数据源」）
const SRC_CLIENT = 'F:/G36/LumiGoDesigner/Config/Luban/Datas/Table/data'
const SRC_SERVER = 'F:/G36/LumiGoDesigner/Config/Luban/Datas/server/data'
const DST = path.join(__dirname, '../public/data')

let warnCount = 0
function warn(msg) {
  console.warn(`[警告] ${msg}`)
  warnCount++
}

function loadTable(src, name) {
  const data = JSON.parse(fs.readFileSync(path.join(src, name), 'utf8'))
  return Array.isArray(data) ? data : Object.values(data)
}

function main() {
  // 客户端表
  const gym = loadTable(SRC_CLIENT, 'gym.json')
  const monsterGroups = loadTable(SRC_CLIENT, 'MonsterGroup.json')
  const monsterList = loadTable(SRC_CLIENT, 'Monster.json')
  const lumiList = loadTable(SRC_CLIENT, 'Lumi.json')
  const robotDataList = loadTable(SRC_CLIENT, 'RobotData.json')
  // 服务端表
  const robotLvMatching = loadTable(SRC_SERVER, 'RobotLvMatching.json')
  // 本地化（项目内 zh-CN.json）
  const zh = JSON.parse(fs.readFileSync(path.join(DST, 'zh-CN.json'), 'utf8'))

  // 建索引，O(1) 查找
  const mgMap = new Map(monsterGroups.map(g => [g.MonsterGroupID, g]))
  const monsterMap = new Map(monsterList.map(m => [m.MonsterId, m]))
  const lumiMap = new Map(lumiList.map(l => [l.Id, l]))
  const rdMap = new Map(robotDataList.map(r => [r.Id, r]))

  // 把 MonsterGroup 里的一只 monster 解析为输出结构（道馆/天梯共用）
  function resolveMember(item, ctx) {
    const monster = monsterMap.get(item.Id)
    if (!monster) {
      warn(`Monster Id=${item.Id} 未找到（${ctx}）`)
      return null
    }
    const score = Math.round(
      (monster.HpState + monster.AtkState + monster.DefState + monster.WorkState) / 4
    )
    if (!lumiMap.has(monster.LumiId)) {
      warn(`LumiId=${monster.LumiId} 未在 Lumi 表找到（monster=${item.Id}）`)
    }
    return {
      lumiId: monster.LumiId,
      level: item.Lv,
      breakthrough: item.BreakLv,
      score,
    }
  }

  // —— 道馆：每关一个阵容 ——
  const dojo = gym.map(g => {
    const mg = mgMap.get(g.EnemyTeam)
    if (!mg) {
      warn(`gym.Id=${g.Id} 的 EnemyTeam=${g.EnemyTeam} 未在 MonsterGroup 找到`)
      return null
    }
    const lumis = (mg.MonsterIdList || [])
      .map(m => resolveMember(m, `gym.Id=${g.Id}`))
      .filter(Boolean)
    return {
      teamId: g.Id,
      name: zh[g.MapName] || g.MapName,
      lumis,
    }
  }).filter(Boolean)

  // —— 天梯：每个等级档位的每个 RobotId 一个阵容 ——
  const ladder = []
  robotLvMatching.forEach(lvItem => {
    lvItem.RobotList.forEach(robotId => {
      const robot = rdMap.get(robotId)
      if (!robot) {
        warn(`RobotData Id=${robotId} 未找到（等级档位=${lvItem.Id}）`)
        return
      }
      const mg = mgMap.get(robot.Team)
      if (!mg) {
        warn(`MonsterGroup ${robot.Team} 未找到（RobotId=${robotId}）`)
        return
      }
      const lumis = (mg.MonsterIdList || [])
        .map(m => resolveMember(m, `RobotId=${robotId}`))
        .filter(Boolean)
      ladder.push({ level: lvItem.Id, teamId: robotId, lumis })
    })
  })
  // 按等级升序，同等级按 teamId
  ladder.sort((a, b) => a.level - b.level || a.teamId - b.teamId)

  // —— 家园：MonsterGroupID 在 20000~29999 范围的阵容 ——
  const home = monsterGroups
    .filter(g => g.MonsterGroupID >= 20000 && g.MonsterGroupID <= 29999)
    .map(g => {
      const lumis = (g.MonsterIdList || [])
        .map(m => resolveMember(m, `MonsterGroup=${g.MonsterGroupID}`))
        .filter(Boolean)
      return { teamId: g.MonsterGroupID, lumis }
    })
    .sort((a, b) => a.teamId - b.teamId)

  // 输出
  const result = { dojo, ladder, home }
  const outPath = path.join(DST, 'robot-teams.json')
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2))

  const ladderLevels = new Set(ladder.map(t => t.level)).size
  const dojoLumis = dojo.reduce((s, t) => s + t.lumis.length, 0)
  const ladderLumis = ladder.reduce((s, t) => s + t.lumis.length, 0)
  const homeLumis = home.reduce((s, t) => s + t.lumis.length, 0)
  console.log(`✅ 道馆 ${dojo.length} 个阵容（${dojoLumis} 只）/ 天梯 ${ladder.length} 个阵容（${ladderLevels} 个等级档位，${ladderLumis} 只）/ 家园 ${home.length} 个阵容（${homeLumis} 只）`)
  if (warnCount) console.log(`⚠️  共 ${warnCount} 条警告，请检查上方日志`)
  console.log(`→ ${outPath}`)
}

main()
