// LumiWiki API 数据存储 —— JSON 文件后端
// 未来若数据量大或需复杂查询可平替为 SQLite（更换本文件即可，上层 API 不变）
//
// 数据模型：
//   users:            { username, role, isAdmin, createdAt, lastActiveAt }
//   permissions:      { username -> [permission, ...] }
//   marks:            { `${lumiId}:${field}` -> { lumiId, field, markedBy, markedAt, comment } }
//   audit:            [{ id, username, action, target, at }, ...]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const DB_PATH = path.join(DATA_DIR, 'db.json')

// 声明当前系统里所有可授权的权限（管理面板据此渲染 checkbox 组）
// 未来加权限直接往这个数组加即可，不用改表结构
export const ALL_PERMISSIONS = [
  { key: 'review.mark', label: '审查标记', description: '在噜咪图鉴审查模式中标记「设计上无初见/订单/故事」' },
]

const DEFAULT_DB = {
  users: {},
  permissions: {},   // username -> [permission]
  marks: {},         // `${lumiId}:${field}` -> mark
  audit: [],
  auditSeq: 0,
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

let cache = null

function load() {
  if (cache) return cache
  ensureDir()
  if (!fs.existsSync(DB_PATH)) {
    cache = structuredClone(DEFAULT_DB)
    persist()
  } else {
    try {
      cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
      // 兼容老数据：补齐字段
      for (const k of Object.keys(DEFAULT_DB)) {
        if (!(k in cache)) cache[k] = structuredClone(DEFAULT_DB[k])
      }
    } catch (e) {
      console.error('数据库文件损坏，重置为空:', e.message)
      cache = structuredClone(DEFAULT_DB)
      persist()
    }
  }
  return cache
}

function persist() {
  ensureDir()
  fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2), 'utf-8')
}

// ==================== users ====================

export function getUser(username) {
  const db = load()
  return db.users[username] || null
}

export function listUsers() {
  const db = load()
  return Object.values(db.users).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function createUser({ username, role, isAdmin = false }) {
  const db = load()
  if (db.users[username]) throw new Error('用户名已存在')
  const now = new Date().toISOString()
  db.users[username] = { username, role, isAdmin: !!isAdmin, createdAt: now, lastActiveAt: now }
  db.permissions[username] = db.permissions[username] || []
  persist()
  return db.users[username]
}

export function touchUser(username) {
  const db = load()
  if (db.users[username]) {
    db.users[username].lastActiveAt = new Date().toISOString()
    persist()
  }
}

export function updateUserRole(username, role) {
  const db = load()
  if (!db.users[username]) throw new Error('用户不存在')
  db.users[username].role = role
  persist()
  return db.users[username]
}

// ==================== permissions ====================

export function getUserPermissions(username) {
  const db = load()
  return db.permissions[username] || []
}

// 管理员自动拥有所有权限；否则查白名单
export function hasPermission(username, permission) {
  const user = getUser(username)
  if (!user) return false
  if (user.isAdmin) return true
  return (load().permissions[username] || []).includes(permission)
}

export function setUserPermissions(username, permissions) {
  const db = load()
  if (!db.users[username]) throw new Error('用户不存在')
  // 只允许授予声明过的权限
  const valid = new Set(ALL_PERMISSIONS.map(p => p.key))
  db.permissions[username] = [...new Set(permissions.filter(p => valid.has(p)))]
  persist()
  return db.permissions[username]
}

// ==================== marks ====================

export function listMarks() {
  return Object.values(load().marks)
}

export function upsertMark({ lumiId, field, markedBy, comment }) {
  const db = load()
  const key = `${lumiId}:${field}`
  db.marks[key] = {
    lumiId: Number(lumiId),
    field,
    markedBy,
    markedAt: new Date().toISOString(),
    comment: comment || '',
  }
  persist()
  return db.marks[key]
}

export function deleteMark({ lumiId, field }) {
  const db = load()
  const key = `${lumiId}:${field}`
  const existed = !!db.marks[key]
  delete db.marks[key]
  if (existed) persist()
  return existed
}

// ==================== audit ====================

export function appendAudit({ username, action, target }) {
  const db = load()
  db.auditSeq = (db.auditSeq || 0) + 1
  db.audit.push({
    id: db.auditSeq,
    username,
    action,
    target: target || '',
    at: new Date().toISOString(),
  })
  persist()
}

export function listAudit({ limit = 100, offset = 0 } = {}) {
  const db = load()
  // 逆序（最新在前）
  const total = db.audit.length
  const items = db.audit.slice().reverse().slice(offset, offset + limit)
  return { items, total }
}

// ==================== 初始化：确保管理员 EEVEE 存在 ====================

export function ensureBootstrap() {
  const db = load()
  if (!db.users['EEVEE']) {
    console.log('[bootstrap] 创建管理员账号 EEVEE / 策划')
    createUser({ username: 'EEVEE', role: '策划', isAdmin: true })
    // 管理员天然有所有权限，但也显式授一份便于 UI 展示
    setUserPermissions('EEVEE', ALL_PERMISSIONS.map(p => p.key))
    appendAudit({ username: 'system', action: 'bootstrap', target: 'EEVEE' })
  }
}
