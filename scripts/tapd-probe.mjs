// TAPD API 探测脚本
// 用法: node scripts/tapd-probe.mjs
//
// 用小叶鼠 (storyId=1146491618004583339) 试几个常见 endpoint，把返回结构 dump 出来
// 目的：搞清楚
//   1. Bearer token 认证到底走不走得通
//   2. 总单 → 子单怎么关联（stories 里的 parent_id / children_id / 关联查询）
//   3. 子单上有没有"迭代次数"字段（或者要看变更历史）

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'tapd-config.json'), 'utf-8')).tapd

const { baseUrl, accessToken, workspaceId } = CONFIG
const XY_STORY_ID = '1146491618004583339'  // 小叶鼠总单 storyId

async function tapd(pathQ, { method = 'GET', body, saveAs } = {}) {
  const url = `${baseUrl}${pathQ}`
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
  console.log(`\n→ ${method} ${pathQ}`)
  const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const ct = resp.headers.get('content-type') || ''
  const text = await resp.text()
  console.log(`  HTTP ${resp.status} · body ${text.length} chars`)
  let json = null
  try { json = JSON.parse(text) } catch {}
  if (saveAs) {
    fs.writeFileSync(saveAs, JSON.stringify(json, null, 2), 'utf-8')
    console.log(`  → ${saveAs}`)
  }
  return { status: resp.status, ct, text, json }
}

async function main() {
  console.log('===== TAPD API 探测 =====')
  console.log(`baseUrl: ${baseUrl}`)
  console.log(`workspaceId: ${workspaceId}`)
  console.log(`storyId: ${XY_STORY_ID} (小叶鼠总单)`)
  console.log(`token: ${accessToken.slice(0, 8)}...`)

  // 试探 1: 拿故事详情
  await tapd(`/stories?workspace_id=${workspaceId}&id=${XY_STORY_ID}`, { saveAs: 'D:/tapd-01-story.json' })

  // 试探 2: 拿这个 workspace 的自定义字段（含"迭代次数"可能是自定义字段）
  await tapd(`/stories/custom_fields_settings?workspace_id=${workspaceId}`, { saveAs: 'D:/tapd-02-custom-fields.json' })

  // 试探 3: 拿故事关联的其他故事（父子关系）
  await tapd(`/stories?workspace_id=${workspaceId}&parent_id=${XY_STORY_ID}&limit=30`, { saveAs: 'D:/tapd-03-children.json' })

  // 试探 5: 故事变更历史
  await tapd(`/story_changes?workspace_id=${workspaceId}&story_id=${XY_STORY_ID}&limit=5`, { saveAs: 'D:/tapd-05-changes.json' })

  // 试探 6: 拿其中一个"原画设计"子单的全字段
  await tapd(`/stories?workspace_id=${workspaceId}&id=1146491618004583350`, { saveAs: 'D:/tapd-06-child-concept.json' })

  // 试探 7: 拿"特效制作"子单
  await tapd(`/stories?workspace_id=${workspaceId}&id=1146491618004583345`, { saveAs: 'D:/tapd-07-child-vfx.json' })

  // 试探 8: 拿"原画设计"子单的完整变更历史（找迭代次数信号）
  await tapd(`/story_changes?workspace_id=${workspaceId}&story_id=1146491618004583350&limit=100`, { saveAs: 'D:/tapd-08-child-changes.json' })

  // 试探 9: iteration_id 里的"迭代"是啥
  await tapd(`/iterations?workspace_id=${workspaceId}&id=1146491618001026357`, { saveAs: 'D:/tapd-09-iteration.json' })

  // 试探 10: 全部迭代列表
  await tapd(`/iterations?workspace_id=${workspaceId}&limit=5`, { saveAs: 'D:/tapd-10-iterations-list.json' })

  // 试探 11: 拿所有状态定义（找 status_19 是啥）
  await tapd(`/workflows/status_map?workspace_id=${workspaceId}&system=story`, { saveAs: 'D:/tapd-11-status-map.json' })

  // 试探 12: 拿"未完成" workspace 总单数量
  await tapd(`/stories/count?workspace_id=${workspaceId}&name=Lumi`, { saveAs: 'D:/tapd-12-story-count.json' })
}

main().catch(e => {
  console.error('\n❌', e.message)
  process.exit(1)
})
