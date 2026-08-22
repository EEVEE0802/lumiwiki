// 生产管线数据访问层
// 表：production_orders / production_stages / production_activity（已在 store.mjs 建好）
//
// 环节 stageType 固定枚举，跟前端 STAGE_META 保持一致：
//   combat  战设      concept  原画   model  模型   rigging  绑定   anim  动作
//   vfx     特效      gui      GUI/立绘   audio  音效   config  配置
//   iteration 迭代循环（占位，不算独立环节，从 CSV 里"原画迭代" / "特效迭代"识别）
//
// stage.status: 'todo' | 'in-progress' | 'pending-review' | 'done' | 'rejected'
// order.status: 'planning' | 'in-progress' | 'pending-review' | 'done'

import { sqliteDb as db } from './store.mjs'

export const STAGE_TYPES = ['combat', 'concept', 'model', 'anim', 'vfx', 'gui', 'config']

// ==================== orders ====================

const stmtGetOrder = db.prepare('SELECT * FROM production_orders WHERE lumiId = ?')
const stmtListOrders = db.prepare('SELECT * FROM production_orders ORDER BY pokedexId, lumiId')
const stmtDeleteOrder = db.prepare('DELETE FROM production_orders WHERE lumiId = ?')
const stmtUpsertOrder = db.prepare(`
  INSERT INTO production_orders(
    lumiId, pokedexId, name, type1, type2, maxScore, workType, combatStrength, workBuilding,
    tapdStoryId, tapdStoryUrl, milestone, releaseStatus, progressStage, designer, status,
    createdAt, updatedAt, ganttRaw
  ) VALUES (
    @lumiId, @pokedexId, @name, @type1, @type2, @maxScore, @workType, @combatStrength, @workBuilding,
    @tapdStoryId, @tapdStoryUrl, @milestone, @releaseStatus, @progressStage, @designer, @status,
    @createdAt, @updatedAt, @ganttRaw
  )
  ON CONFLICT(lumiId) DO UPDATE SET
    pokedexId=excluded.pokedexId,
    name=excluded.name,
    type1=excluded.type1,
    type2=excluded.type2,
    maxScore=excluded.maxScore,
    workType=excluded.workType,
    combatStrength=excluded.combatStrength,
    workBuilding=excluded.workBuilding,
    tapdStoryId=excluded.tapdStoryId,
    tapdStoryUrl=excluded.tapdStoryUrl,
    milestone=excluded.milestone,
    releaseStatus=excluded.releaseStatus,
    progressStage=excluded.progressStage,
    designer=excluded.designer,
    updatedAt=excluded.updatedAt,
    ganttRaw=excluded.ganttRaw
`)
const stmtPatchOrder = db.prepare(`
  UPDATE production_orders SET
    pokedexId = COALESCE(@pokedexId, pokedexId),
    name = COALESCE(@name, name),
    type1 = COALESCE(@type1, type1),
    type2 = COALESCE(@type2, type2),
    maxScore = COALESCE(@maxScore, maxScore),
    workType = COALESCE(@workType, workType),
    combatStrength = COALESCE(@combatStrength, combatStrength),
    workBuilding = COALESCE(@workBuilding, workBuilding),
    tapdStoryId = COALESCE(@tapdStoryId, tapdStoryId),
    tapdStoryUrl = COALESCE(@tapdStoryUrl, tapdStoryUrl),
    milestone = COALESCE(@milestone, milestone),
    releaseStatus = COALESCE(@releaseStatus, releaseStatus),
    progressStage = COALESCE(@progressStage, progressStage),
    designer = COALESCE(@designer, designer),
    status = COALESCE(@status, status),
    updatedAt = @updatedAt
  WHERE lumiId = @lumiId
`)

export function getOrder(lumiId) {
  return stmtGetOrder.get(Number(lumiId)) || null
}

export function listOrders() {
  return stmtListOrders.all()
}

export function upsertOrder(order) {
  const now = new Date().toISOString()
  stmtUpsertOrder.run({
    lumiId: Number(order.lumiId),
    pokedexId: order.pokedexId ?? null,
    name: order.name ?? null,
    type1: order.type1 ?? null,
    type2: order.type2 ?? null,
    maxScore: order.maxScore ?? null,
    workType: order.workType ?? null,
    combatStrength: order.combatStrength ?? null,
    workBuilding: order.workBuilding ?? null,
    tapdStoryId: order.tapdStoryId ?? null,
    tapdStoryUrl: order.tapdStoryUrl ?? null,
    milestone: order.milestone ?? null,
    releaseStatus: order.releaseStatus ?? null,
    progressStage: order.progressStage ?? null,
    designer: order.designer ?? null,
    status: order.status ?? 'planning',
    createdAt: order.createdAt || now,
    updatedAt: now,
    ganttRaw: order.ganttRaw ?? null,
  })
  return getOrder(order.lumiId)
}

export function patchOrder(lumiId, patch) {
  const now = new Date().toISOString()
  stmtPatchOrder.run({
    lumiId: Number(lumiId),
    updatedAt: now,
    pokedexId: patch.pokedexId ?? null,
    name: patch.name ?? null,
    type1: patch.type1 ?? null,
    type2: patch.type2 ?? null,
    maxScore: patch.maxScore ?? null,
    workType: patch.workType ?? null,
    combatStrength: patch.combatStrength ?? null,
    workBuilding: patch.workBuilding ?? null,
    tapdStoryId: patch.tapdStoryId ?? null,
    tapdStoryUrl: patch.tapdStoryUrl ?? null,
    milestone: patch.milestone ?? null,
    releaseStatus: patch.releaseStatus ?? null,
    progressStage: patch.progressStage ?? null,
    designer: patch.designer ?? null,
    status: patch.status ?? null,
  })
  return getOrder(lumiId)
}

// 级联删除 order + 所有 stages + activity 记录（管理员用）
// stages 通过 FOREIGN KEY ON DELETE CASCADE 自动删；activity 无外键约束，手动删
const stmtDeleteActivityForOrder = db.prepare('DELETE FROM production_activity WHERE lumiId = ?')
export function deleteOrder(lumiId) {
  const lid = Number(lumiId)
  const tx = db.transaction(() => {
    stmtDeleteActivityForOrder.run(lid)
    stmtDeleteOrder.run(lid)  // stages 通过 FK CASCADE 自动删
  })
  tx()
}

// 一次性把 9 个环节都初始化为 todo（新建 order 后自动跑）
// 如果某环节已存在，不覆盖
export function initStagesForOrder(lumiId) {
  const lid = Number(lumiId)
  const existing = new Set(listStages(lid).map(s => s.stageType))
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO production_stages(
      lumiId, stageType, assignee, status, plannedStart, plannedEnd, actualStart, actualEnd,
      iterationCount, tapdSubStoryId, deliverables, updatedAt, updatedBy
    ) VALUES (?, ?, NULL, 'todo', NULL, NULL, NULL, NULL, 0, NULL, NULL, ?, ?)
  `)
  const tx = db.transaction(() => {
    for (const st of STAGE_TYPES) {
      if (existing.has(st)) continue
      stmt.run(lid, st, now, 'system')
    }
  })
  tx()
  return listStages(lid)
}

// ==================== stages ====================

const stmtGetStage = db.prepare('SELECT * FROM production_stages WHERE lumiId = ? AND stageType = ?')
const stmtListStagesForLumi = db.prepare('SELECT * FROM production_stages WHERE lumiId = ?')
const stmtListAllStages = db.prepare('SELECT * FROM production_stages')
const stmtUpsertStage = db.prepare(`
  INSERT INTO production_stages(
    lumiId, stageType, assignee, status, plannedStart, plannedEnd, actualStart, actualEnd,
    iterationCount, tapdSubStoryId, deliverables, updatedAt, updatedBy
  ) VALUES (
    @lumiId, @stageType, @assignee, @status, @plannedStart, @plannedEnd, @actualStart, @actualEnd,
    @iterationCount, @tapdSubStoryId, @deliverables, @updatedAt, @updatedBy
  )
  ON CONFLICT(lumiId, stageType) DO UPDATE SET
    assignee=excluded.assignee,
    status=excluded.status,
    plannedStart=excluded.plannedStart,
    plannedEnd=excluded.plannedEnd,
    actualStart=excluded.actualStart,
    actualEnd=excluded.actualEnd,
    iterationCount=excluded.iterationCount,
    tapdSubStoryId=excluded.tapdSubStoryId,
    deliverables=excluded.deliverables,
    updatedAt=excluded.updatedAt,
    updatedBy=excluded.updatedBy
`)
const stmtPatchStage = db.prepare(`
  UPDATE production_stages SET
    assignee = COALESCE(@assignee, assignee),
    status = COALESCE(@status, status),
    plannedStart = COALESCE(@plannedStart, plannedStart),
    plannedEnd = COALESCE(@plannedEnd, plannedEnd),
    actualStart = COALESCE(@actualStart, actualStart),
    actualEnd = COALESCE(@actualEnd, actualEnd),
    iterationCount = COALESCE(@iterationCount, iterationCount),
    tapdSubStoryId = COALESCE(@tapdSubStoryId, tapdSubStoryId),
    deliverables = COALESCE(@deliverables, deliverables),
    updatedAt = @updatedAt,
    updatedBy = @updatedBy
  WHERE lumiId = @lumiId AND stageType = @stageType
`)

export function getStage(lumiId, stageType) {
  return stmtGetStage.get(Number(lumiId), stageType) || null
}

export function listStages(lumiId) {
  return lumiId ? stmtListStagesForLumi.all(Number(lumiId)) : stmtListAllStages.all()
}

export function upsertStage(stage) {
  const now = new Date().toISOString()
  stmtUpsertStage.run({
    lumiId: Number(stage.lumiId),
    stageType: stage.stageType,
    assignee: stage.assignee ?? null,
    status: stage.status || 'todo',
    plannedStart: stage.plannedStart ?? null,
    plannedEnd: stage.plannedEnd ?? null,
    actualStart: stage.actualStart ?? null,
    actualEnd: stage.actualEnd ?? null,
    iterationCount: stage.iterationCount ?? 0,
    tapdSubStoryId: stage.tapdSubStoryId ?? null,
    deliverables: stage.deliverables ? JSON.stringify(stage.deliverables) : null,
    updatedAt: now,
    updatedBy: stage.updatedBy || null,
  })
  return getStage(stage.lumiId, stage.stageType)
}

export function patchStage(lumiId, stageType, patch, updatedBy) {
  const now = new Date().toISOString()
  stmtPatchStage.run({
    lumiId: Number(lumiId),
    stageType,
    updatedAt: now,
    updatedBy: updatedBy || null,
    assignee: patch.assignee ?? null,
    status: patch.status ?? null,
    plannedStart: patch.plannedStart ?? null,
    plannedEnd: patch.plannedEnd ?? null,
    actualStart: patch.actualStart ?? null,
    actualEnd: patch.actualEnd ?? null,
    iterationCount: patch.iterationCount ?? null,
    tapdSubStoryId: patch.tapdSubStoryId ?? null,
    deliverables: patch.deliverables ? JSON.stringify(patch.deliverables) : null,
  })
  return getStage(lumiId, stageType)
}

// ==================== activity ====================

const stmtInsAct = db.prepare(`
  INSERT INTO production_activity(lumiId, stageType, username, action, detail, at)
  VALUES (?, ?, ?, ?, ?, ?)
`)
const stmtListActLumi = db.prepare(`
  SELECT id, lumiId, stageType, username, action, detail, at FROM production_activity
  WHERE lumiId = ? ORDER BY id DESC LIMIT ?
`)
const stmtListActAll = db.prepare(`
  SELECT id, lumiId, stageType, username, action, detail, at FROM production_activity
  ORDER BY id DESC LIMIT ? OFFSET ?
`)

export function logProductionActivity({ lumiId, stageType, username, action, detail }) {
  stmtInsAct.run(Number(lumiId), stageType || null, username, action, detail || null, new Date().toISOString())
}

export function listProductionActivity({ lumiId, limit = 100, offset = 0 } = {}) {
  if (lumiId) return stmtListActLumi.all(Number(lumiId), limit)
  return stmtListActAll.all(limit, offset)
}

// ==================== 组合视图：orders + stages ====================

// 一次取全表：orders + 每只噜咪的 9 个 stage
// 返回 [{ ...order, stages: { combat: {...}, concept: {...}, ... } }]
export function listOrdersWithStages() {
  const orders = listOrders()
  const stages = listStages()
  const stagesByLumi = new Map()
  for (const s of stages) {
    if (!stagesByLumi.has(s.lumiId)) stagesByLumi.set(s.lumiId, {})
    const parsed = s.deliverables ? JSON.parse(s.deliverables) : null
    stagesByLumi.get(s.lumiId)[s.stageType] = { ...s, deliverables: parsed }
  }
  return orders.map(o => ({ ...o, stages: stagesByLumi.get(o.lumiId) || {} }))
}

// 单只噜咪的完整生产单
export function getOrderWithStages(lumiId) {
  const order = getOrder(lumiId)
  if (!order) return null
  const stages = {}
  for (const s of listStages(lumiId)) {
    const parsed = s.deliverables ? JSON.parse(s.deliverables) : null
    stages[s.stageType] = { ...s, deliverables: parsed }
  }
  return { ...order, stages }
}

// ==================== TAPD iterations ====================

const stmtListIterations = db.prepare('SELECT * FROM tapd_iterations ORDER BY startdate DESC, id DESC')
const stmtGetIteration = db.prepare('SELECT * FROM tapd_iterations WHERE id = ?')

export function listIterations() {
  return stmtListIterations.all()
}

export function getIteration(id) {
  return stmtGetIteration.get(id) || null
}

// ==================== 看板视图 ====================
//
// 按 (iterationId, stageType) 筛选出卡片
// 每张卡片 = 一个 stage + 关联的 order 元数据（噜咪名/图鉴号/TAPD 链接）
// 若 stageType='all' 则返回所有环节
// 若 iterationId='all' 则跨所有周版本（此时通常配合 status 过滤 done/未完成）

const stmtBoardCards = db.prepare(`
  SELECT
    s.lumiId, s.stageType, s.assignee, s.status, s.plannedStart, s.plannedEnd,
    s.actualStart, s.actualEnd, s.iterationCount, s.tapdSubStoryId, s.tapdIterationId,
    s.tapdRawStatus, s.tapdSyncedAt, s.deliverables, s.updatedAt, s.updatedBy,
    o.pokedexId, o.name AS orderName, o.type1, o.type2, o.milestone, o.designer,
    o.tapdStoryUrl, o.tapdStoryId,
    i.name AS iterationName, i.startdate AS iterationStart, i.enddate AS iterationEnd, i.milestone AS iterationMilestone
  FROM production_stages s
  LEFT JOIN production_orders o ON o.lumiId = s.lumiId
  LEFT JOIN tapd_iterations i ON i.id = s.tapdIterationId
`)

export function listBoardCards({ iterationId, stageType, statusIn, assignee } = {}) {
  const rows = stmtBoardCards.all()
  return rows.filter(r => {
    if (iterationId && iterationId !== 'all' && r.tapdIterationId !== iterationId) return false
    if (stageType && stageType !== 'all' && r.stageType !== stageType) return false
    if (statusIn && !statusIn.includes(r.status)) return false
    if (assignee && r.assignee !== assignee) return false
    return true
  })
}

