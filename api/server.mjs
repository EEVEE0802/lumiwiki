// LumiWiki API 服务
// 端口 3006，前端 3005 静态服务通过 CORS 调用
//
// 权限模型:
//   - 无密码, 用户名即身份 (内网信任, 详见 CLAUDE.md)
//   - 首次填「用户名 + 职能」注册 -> 默认无任何权限
//   - 管理员 (is_admin=1) 天然拥有所有权限
//   - 其他用户按 user_permissions 白名单授权 (review.mark 等)
//
// 环境变量:
//   PORT       默认 3006
//   JWT_SECRET 生产环境务必替换 (默认值仅用于内网单机)

import Fastify from 'fastify'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import {
  ALL_PERMISSIONS,
  ensureBootstrap,
  getUser,
  listUsers,
  createUser,
  touchUser,
  updateUserRole,
  getUserPermissions,
  hasPermission,
  setUserPermissions,
  listMarks,
  upsertMark,
  deleteMark,
  appendAudit,
  listAudit,
} from './store.mjs'
import {
  STAGE_TYPES,
  getOrder,
  listOrders,
  upsertOrder,
  patchOrder,
  deleteOrder,
  initStagesForOrder,
  getStage,
  listStages,
  upsertStage,
  patchStage,
  logProductionActivity,
  listProductionActivity,
  listOrdersWithStages,
  getOrderWithStages,
  listIterations,
  listBoardCards,
} from './production-store.mjs'

const PORT = Number(process.env.PORT || 3006)
const JWT_SECRET = process.env.JWT_SECRET || 'lumiwiki-internal-dev-secret-change-me'

// TAPD 配置：从 scripts/tapd-config.json 读，push 用
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TAPD_CONFIG_PATH = path.join(__dirname, '../scripts/tapd-config.json')
let TAPD = null
try {
  TAPD = JSON.parse(fs.readFileSync(TAPD_CONFIG_PATH, 'utf-8')).tapd
} catch (e) {
  console.warn('[tapd] 未找到 scripts/tapd-config.json，push TAPD 功能将不可用')
}

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: true,           // 内网信任, 反射任意来源 (等价于回显 Origin 而非 * -- 允许 credentials)
  credentials: false,
})

await app.register(jwt, { secret: JWT_SECRET })

// 全局初始化: EEVEE 管理员账号
ensureBootstrap()

// -------- 中间件: 从 Bearer token 解出用户 --------

async function requireAuth(request, reply) {
  try {
    await request.jwtVerify()
  } catch (e) {
    return reply.code(401).send({ error: '未登录或 token 已过期' })
  }
  const user = getUser(request.user.username)
  if (!user) return reply.code(401).send({ error: '用户已被删除' })
  touchUser(user.username)
  request.currentUser = user
}

function requirePermission(permission) {
  return async (request, reply) => {
    await requireAuth(request, reply)
    if (reply.sent) return
    if (!hasPermission(request.currentUser.username, permission)) {
      return reply.code(403).send({ error: `缺少权限: ${permission}` })
    }
  }
}

async function requireAdmin(request, reply) {
  await requireAuth(request, reply)
  if (reply.sent) return
  if (!request.currentUser.isAdmin) {
    return reply.code(403).send({ error: '需要管理员权限' })
  }
}

// -------- 认证 --------

// 首次登录: 填用户名 + 职能, 直接创建账号 (无密码, 内网信任)
const ROLES = ['策划', 'UE', '美术', 'QA', '程序', '发行', 'PM', '普通用户']

app.post('/api/auth/register', async (request, reply) => {
  const { username, role } = request.body || {}
  if (!username || typeof username !== 'string' || username.length < 1 || username.length > 32) {
    return reply.code(400).send({ error: '用户名必填，长度 1-32' })
  }
  if (!ROLES.includes(role)) {
    return reply.code(400).send({ error: `职能必须是: ${ROLES.join(' / ')}` })
  }
  if (getUser(username)) {
    return reply.code(409).send({ error: '用户名已存在，请直接登录' })
  }
  const user = createUser({ username, role, isAdmin: false })
  appendAudit({ username, action: 'register', target: role })
  const token = app.jwt.sign({ username: user.username }, { expiresIn: '30d' })
  return { token, user, permissions: [] }
})

// 已注册用户登录: 只填用户名 (校验存在即发 token)
app.post('/api/auth/login', async (request, reply) => {
  const { username } = request.body || {}
  if (!username) return reply.code(400).send({ error: '用户名必填' })
  const user = getUser(username)
  if (!user) return reply.code(404).send({ error: '用户不存在，请先注册' })
  touchUser(username)
  const token = app.jwt.sign({ username: user.username }, { expiresIn: '30d' })
  return { token, user, permissions: getUserPermissions(user.username) }
})

// 拿当前登录信息
app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
  const user = request.currentUser
  return {
    user,
    permissions: user.isAdmin ? ALL_PERMISSIONS.map(p => p.key) : getUserPermissions(user.username),
    isAdmin: !!user.isAdmin,
  }
})

// 可选职能列表
app.get('/api/auth/roles', async () => ({ roles: ROLES }))

// -------- 标记 (匿名可读, 需 review.mark 权限才能写) --------

app.get('/api/marks', async () => ({ marks: listMarks() }))

app.post('/api/marks', { preHandler: requirePermission('review.mark') }, async (request, reply) => {
  const { lumiId, field, comment } = request.body || {}
  const lid = Number(lumiId)
  if (!Number.isFinite(lid) || lid <= 0) return reply.code(400).send({ error: 'lumiId 无效' })
  if (!['firstMeet', 'order', 'story'].includes(field)) {
    return reply.code(400).send({ error: 'field 必须是 firstMeet/order/story' })
  }
  const username = request.currentUser.username
  const mark = upsertMark({ lumiId: lid, field, markedBy: username, comment })
  appendAudit({ username, action: 'mark', target: `${lid}:${field}` })
  return { mark }
})

app.delete('/api/marks/:lumiId/:field', { preHandler: requirePermission('review.mark') }, async (request, reply) => {
  const lid = Number(request.params.lumiId)
  const { field } = request.params
  const existed = deleteMark({ lumiId: lid, field })
  if (!existed) return reply.code(404).send({ error: '标记不存在' })
  appendAudit({ username: request.currentUser.username, action: 'unmark', target: `${lid}:${field}` })
  return { ok: true }
})

// -------- 管理员: 用户 / 权限 / 审计 --------

app.get('/api/admin/permissions', { preHandler: requireAdmin }, async () => ({ permissions: ALL_PERMISSIONS }))

app.get('/api/admin/users', { preHandler: requireAdmin }, async () => {
  const users = listUsers().map(u => ({
    ...u,
    permissions: getUserPermissions(u.username),
  }))
  return { users }
})

// 全量替换某用户的权限白名单
app.put('/api/admin/users/:username/permissions', { preHandler: requireAdmin }, async (request, reply) => {
  const { username } = request.params
  const { permissions } = request.body || {}
  if (!Array.isArray(permissions)) return reply.code(400).send({ error: 'permissions 必须是数组' })
  if (!getUser(username)) return reply.code(404).send({ error: '用户不存在' })
  const before = getUserPermissions(username)
  const after = setUserPermissions(username, permissions)
  const admin = request.currentUser.username
  const added = after.filter(p => !before.includes(p))
  const removed = before.filter(p => !after.includes(p))
  for (const p of added) appendAudit({ username: admin, action: 'grant', target: `${username}:${p}` })
  for (const p of removed) appendAudit({ username: admin, action: 'revoke', target: `${username}:${p}` })
  return { permissions: after }
})

// 改用户职能
app.patch('/api/admin/users/:username', { preHandler: requireAdmin }, async (request, reply) => {
  const { username } = request.params
  const { role } = request.body || {}
  if (role && !ROLES.includes(role)) return reply.code(400).send({ error: '职能非法' })
  if (!getUser(username)) return reply.code(404).send({ error: '用户不存在' })
  const user = updateUserRole(username, role)
  appendAudit({ username: request.currentUser.username, action: 'update_role', target: `${username}:${role}` })
  return { user }
})

app.get('/api/admin/audit', { preHandler: requireAdmin }, async (request) => {
  const limit = Math.min(Number(request.query.limit) || 100, 500)
  const offset = Math.max(Number(request.query.offset) || 0, 0)
  return listAudit({ limit, offset })
})

// -------- 健康检查 --------

app.get('/api/health', async () => ({ ok: true, ts: new Date().toISOString() }))

// -------- 生产管线 --------
//
// 权限：
//   GET  /api/production/orders           需 production.readAll
//   GET  /api/production/orders/:lumiId   需 production.readAll
//   POST /api/production/orders           需 production.pm（创建/覆盖 order 元数据）
//   PATCH /api/production/orders/:lumiId  需 production.pm
//   PATCH /api/production/stages/:lumiId/:stageType
//     - 有对应 production.stage.{X}.write 权限的人可以改自己那个环节
//     - production.pm 可以改任意环节
//   GET  /api/production/activity         需 production.readAll

function requireStageWrite(stageType) {
  return async (request, reply) => {
    await requireAuth(request, reply)
    if (reply.sent) return
    const uname = request.currentUser.username
    if (hasPermission(uname, 'production.pm')) return
    if (hasPermission(uname, `production.stage.${stageType}.write`)) return
    return reply.code(403).send({ error: `缺少权限: production.stage.${stageType}.write 或 production.pm` })
  }
}

// 一次拿全表，前端 PM 视图用
app.get('/api/production/orders', { preHandler: requirePermission('production.readAll') }, async () => ({
  stages: STAGE_TYPES,
  orders: listOrdersWithStages(),
}))

app.get('/api/production/orders/:lumiId', { preHandler: requirePermission('production.readAll') }, async (request, reply) => {
  const lid = Number(request.params.lumiId)
  if (!Number.isFinite(lid)) return reply.code(400).send({ error: 'lumiId 无效' })
  const o = getOrderWithStages(lid)
  if (!o) return reply.code(404).send({ error: 'order 不存在' })
  return { order: o, stages: STAGE_TYPES }
})

// 创建/覆盖 order（仅 PM）
// 新建时同步初始化 9 个 stage 记录（都是 todo 空态），让 PM 立刻可以在 cell 里排期
app.post('/api/production/orders', { preHandler: requirePermission('production.pm') }, async (request, reply) => {
  const body = request.body || {}
  const lid = Number(body.lumiId)
  if (!Number.isFinite(lid) || lid <= 0) return reply.code(400).send({ error: 'lumiId 无效' })
  const existed = getOrder(lid)
  const order = upsertOrder(body)
  if (!existed) initStagesForOrder(lid)
  logProductionActivity({
    lumiId: lid,
    username: request.currentUser.username,
    action: existed ? 'upsert_order' : 'create_order',
    detail: JSON.stringify({ status: order.status, initStages: !existed }),
  })
  return { order, created: !existed }
})

app.patch('/api/production/orders/:lumiId', { preHandler: requirePermission('production.pm') }, async (request, reply) => {
  const lid = Number(request.params.lumiId)
  if (!Number.isFinite(lid) || lid <= 0) return reply.code(400).send({ error: 'lumiId 无效' })
  if (!getOrder(lid)) return reply.code(404).send({ error: 'order 不存在' })
  const patched = patchOrder(lid, request.body || {})
  logProductionActivity({ lumiId: lid, username: request.currentUser.username, action: 'patch_order' })
  return { order: patched }
})

// 删除 order + 级联所有 stages / activity（仅管理员）
app.delete('/api/production/orders/:lumiId', { preHandler: requireAdmin }, async (request, reply) => {
  const lid = Number(request.params.lumiId)
  if (!Number.isFinite(lid) || lid <= 0) return reply.code(400).send({ error: 'lumiId 无效' })
  if (!getOrder(lid)) return reply.code(404).send({ error: 'order 不存在' })
  deleteOrder(lid)
  // 删完再记 audit（不进 production_activity，因为整条都没了）
  appendAudit({ username: request.currentUser.username, action: 'delete_production_order', target: String(lid) })
  return { ok: true, lumiId: lid }
})

// 改 stage（对应角色 or PM）
app.patch('/api/production/stages/:lumiId/:stageType', async (request, reply) => {
  const stageType = request.params.stageType
  if (!STAGE_TYPES.includes(stageType)) return reply.code(400).send({ error: `stageType 必须是 ${STAGE_TYPES.join('/')}` })
  await requireStageWrite(stageType)(request, reply)
  if (reply.sent) return
  const lid = Number(request.params.lumiId)
  if (!Number.isFinite(lid) || lid <= 0) return reply.code(400).send({ error: 'lumiId 无效' })
  if (!getOrder(lid)) return reply.code(404).send({ error: 'order 不存在' })
  // 允许改的字段白名单（避免误传别的字段）
  const allowed = ['assignee', 'status', 'plannedStart', 'plannedEnd', 'actualStart', 'actualEnd', 'iterationCount', 'tapdSubStoryId', 'deliverables']
  const patch = {}
  for (const k of allowed) if (k in (request.body || {})) patch[k] = request.body[k]
  // 有 stage 就 patch，没就 upsert（保证从未初始化的环节也能改）
  let updated
  if (getStage(lid, stageType)) {
    updated = patchStage(lid, stageType, patch, request.currentUser.username)
  } else {
    updated = upsertStage({ lumiId: lid, stageType, ...patch, updatedBy: request.currentUser.username })
  }
  logProductionActivity({
    lumiId: lid, stageType,
    username: request.currentUser.username,
    action: 'patch_stage',
    detail: JSON.stringify(patch),
  })
  return { stage: updated }
})

app.get('/api/production/activity', { preHandler: requirePermission('production.readAll') }, async (request) => {
  const lid = request.query.lumiId ? Number(request.query.lumiId) : null
  const limit = Math.min(Number(request.query.limit) || 100, 500)
  const offset = Math.max(Number(request.query.offset) || 0, 0)
  const items = listProductionActivity({ lumiId: lid, limit, offset })
  return { items }
})

// 可指派人员列表（复用 admin/users 的字段但去掉 lastActiveAt 之类）
// 供环节 assignee 下拉、order.designer 下拉使用
// 任何有 production.readAll 权限的人都能拿（PM 排期需要，各角色查看时也可能想知道队友）
app.get('/api/production/users', { preHandler: requirePermission('production.readAll') }, async () => {
  const users = listUsers().map(u => ({
    username: u.username,
    role: u.role,
    isAdmin: !!u.isAdmin,
  }))
  return { users }
})

// -------- 生产看板专用 --------

// 拿所有 TAPD iterations（周版本），前端下拉切周用
app.get('/api/production/iterations', { preHandler: requirePermission('production.readAll') }, async () => ({
  iterations: listIterations(),
}))

// 拿看板卡片：按 iteration + stageType + status 过滤
// query 参数：
//   iterationId=<id> | 'all'      默认 'all'
//   stageType=<key>  | 'all'      默认 'all'
//   status=todo,in-progress,...   逗号分隔多状态
//   assignee=<username>           只看某人的任务
app.get('/api/production/board', { preHandler: requirePermission('production.readAll') }, async (request) => {
  const { iterationId, stageType, status, assignee } = request.query || {}
  const cards = listBoardCards({
    iterationId,
    stageType,
    statusIn: status ? status.split(',').map(s => s.trim()).filter(Boolean) : null,
    assignee,
  })
  return { cards, stages: STAGE_TYPES }
})

// 把本地 stage 变更 push 到 TAPD 子单
// 只 push 3 个字段：iteration_id / status / owner
// 需要 tapdSubStoryId 已关联；无 TAPD config 会 503
async function pushStageToTapd(stage) {
  if (!TAPD) throw new Error('TAPD 未配置，无法 push')
  if (!stage.tapdSubStoryId) throw new Error('该环节未关联 TAPD 子单')

  // 本地 status → TAPD status（跟同步脚本反向映射）
  const STATUS_TO_TAPD = {
    'todo': 'planning',
    'in-progress': 'developing',
    'pending-review': 'status_14',
    'done': 'status_19',
    'rejected': 'rejected',
  }
  const body = {
    workspace_id: TAPD.workspaceId,
    id: stage.tapdSubStoryId,
  }
  if (stage.tapdIterationId) body.iteration_id = stage.tapdIterationId
  if (stage.status && STATUS_TO_TAPD[stage.status]) body.status = STATUS_TO_TAPD[stage.status]
  if (stage.assignee) body.owner = stage.assignee

  const resp = await fetch(`${TAPD.baseUrl}/stories`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TAPD.accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`TAPD HTTP ${resp.status}: ${text.slice(0, 200)}`)
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`TAPD 返回非 JSON: ${text.slice(0, 200)}`) }
  if (data.status !== 1) throw new Error(`TAPD 返回错误: ${data.info || JSON.stringify(data).slice(0, 200)}`)
  return data.data
}

app.post('/api/production/stages/:lumiId/:stageType/push-tapd', async (request, reply) => {
  const stageType = request.params.stageType
  if (!STAGE_TYPES.includes(stageType)) return reply.code(400).send({ error: '无效 stageType' })
  await requireStageWrite(stageType)(request, reply)
  if (reply.sent) return
  const lid = Number(request.params.lumiId)
  const stage = getStage(lid, stageType)
  if (!stage) return reply.code(404).send({ error: 'stage 不存在' })
  try {
    const result = await pushStageToTapd(stage)
    logProductionActivity({
      lumiId: lid, stageType,
      username: request.currentUser.username,
      action: 'push_tapd',
      detail: JSON.stringify({ iterationId: stage.tapdIterationId, status: stage.status, assignee: stage.assignee }),
    })
    return { ok: true, result }
  } catch (e) {
    return reply.code(502).send({ error: e.message })
  }
})

// -------- 启动 --------

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`\n✅ LumiWiki API listening on http://0.0.0.0:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
