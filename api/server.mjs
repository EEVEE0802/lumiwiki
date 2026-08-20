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

const PORT = Number(process.env.PORT || 3006)
const JWT_SECRET = process.env.JWT_SECRET || 'lumiwiki-internal-dev-secret-change-me'

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

// -------- 启动 --------

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`\n✅ LumiWiki API listening on http://0.0.0.0:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
