// LumiWiki API 数据存储 —— SQLite 后端（better-sqlite3，同步 API）
// 首次启动若发现遗留的 data/db.json，会自动迁移到 SQLite 并把 db.json 重命名为 db.json.migrated
//
// 数据模型：
//   users            (username PK, role, isAdmin, createdAt, lastActiveAt)
//   user_permissions (username, permission)  ── 复合主键
//   marks            (lumiId, field, markedBy, markedAt, comment) ── 复合主键
//   audit            (id AUTOINC, username, action, target, at)
//   production_orders / production_stages / production_activity ── Phase B 加

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const DB_PATH = path.join(DATA_DIR, 'lumiwiki.db')
const LEGACY_JSON = path.join(DATA_DIR, 'db.json')

// 声明当前系统里所有可授权的权限（管理面板据此渲染 checkbox 组）
// 未来加权限直接往这个数组加即可，不用改表结构
export const ALL_PERMISSIONS = [
  { key: 'review.mark', label: '审查标记', description: '在噜咪图鉴审查模式中标记「设计上无初见/订单/故事」' },
  // ── Phase B 生产看板权限（跟 TAPD 子单对齐的 7 个环节）──
  { key: 'production.readAll', label: '生产·查看全部', description: '查看所有噜咪的生产管线状态' },
  { key: 'production.pm', label: '生产·PM', description: 'PM 权限：排期调整、跨环节修改、创建生产总单' },
  { key: 'production.stage.combat.write', label: '生产·策划设计', description: '策划设计（战设）环节提交/编辑' },
  { key: 'production.stage.concept.write', label: '生产·原画', description: '原画环节提交/编辑' },
  { key: 'production.stage.model.write', label: '生产·模型', description: '模型环节提交/编辑' },
  { key: 'production.stage.anim.write', label: '生产·动作', description: '动作环节（含绑定）提交/编辑' },
  { key: 'production.stage.vfx.write', label: '生产·特效', description: '特效环节提交/编辑' },
  { key: 'production.stage.gui.write', label: '生产·GUI/立绘', description: 'GUI/立绘环节（含音效）提交/编辑' },
  { key: 'production.stage.config.write', label: '生产·配置', description: '策划配置环节提交/编辑' },
]

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

ensureDir()

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ==================== 表结构 ====================

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  isAdmin INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  lastActiveAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_permissions (
  username TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (username, permission),
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS marks (
  lumiId INTEGER NOT NULL,
  field TEXT NOT NULL,
  markedBy TEXT NOT NULL,
  markedAt TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (lumiId, field)
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS production_orders (
  lumiId INTEGER PRIMARY KEY,
  model TEXT,
  level TEXT,
  name TEXT,
  type1 INTEGER,
  type2 INTEGER,
  maxScore INTEGER,
  workType TEXT,
  combatStrength TEXT,
  workBuilding TEXT,
  tapdStoryId TEXT,
  tapdStoryUrl TEXT,
  milestone TEXT,
  releaseStatus TEXT,
  progressStage TEXT,
  designer TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ganttRaw TEXT
);

CREATE TABLE IF NOT EXISTS production_stages (
  lumiId INTEGER NOT NULL,
  stageType TEXT NOT NULL,
  assignee TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  plannedStart TEXT,
  plannedEnd TEXT,
  actualStart TEXT,
  actualEnd TEXT,
  iterationCount INTEGER NOT NULL DEFAULT 0,
  tapdSubStoryId TEXT,
  tapdIterationId TEXT,
  tapdRawStatus TEXT,
  tapdSyncedAt TEXT,
  deliverables TEXT,
  updatedAt TEXT NOT NULL,
  updatedBy TEXT,
  PRIMARY KEY (lumiId, stageType),
  FOREIGN KEY (lumiId) REFERENCES production_orders(lumiId) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tapd_iterations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  startdate TEXT,
  enddate TEXT,
  milestone TEXT,
  status TEXT,
  syncedAt TEXT
);

CREATE TABLE IF NOT EXISTS production_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lumiId INTEGER NOT NULL,
  stageType TEXT,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  at TEXT NOT NULL
);
`)

// 增量 migration：给已存在的表补新增列（SQLite CREATE TABLE IF NOT EXISTS 不会改现有 schema）
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
    console.log(`[migrate] ${table} 加列 ${column}`)
  }
}
ensureColumn('production_stages', 'tapdIterationId', 'tapdIterationId TEXT')
ensureColumn('production_stages', 'tapdRawStatus', 'tapdRawStatus TEXT')
ensureColumn('production_stages', 'tapdSyncedAt', 'tapdSyncedAt TEXT')
// P2 决定：图鉴号（pokedexId）从 UI 里移除，改用 model（模型名）作为标识展示；level（表现级别，
// 对应图鉴 CardBack：普通/异色/王/3D/全景，"霸主"归到普通）新增到 order。
// pokedexId 列保留以防旧数据兼容 —— SQLite 不支持删列且业务上没有必要清除历史。
ensureColumn('production_orders', 'model', 'model TEXT')
ensureColumn('production_orders', 'level', 'level TEXT')

// 环节从 9 → 7：删掉旧数据里的 rigging / audio
// （P1 决定：rigging 合入 anim，audio 合入 gui，跟 TAPD 子单对齐）
{
  const del = db.prepare(`DELETE FROM production_stages WHERE stageType IN ('rigging', 'audio')`)
  const r = del.run()
  if (r.changes > 0) console.log(`[migrate] 删除废弃环节 rigging / audio 记录 ${r.changes} 条`)
}

// ==================== 一次性迁移：db.json → SQLite ====================

function migrateFromJson() {
  if (!fs.existsSync(LEGACY_JSON)) return
  const alreadyHas = db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0
  if (alreadyHas) {
    // 已有数据了但 legacy json 还在，直接改名归档
    fs.renameSync(LEGACY_JSON, LEGACY_JSON + '.migrated')
    return
  }
  console.log('[migrate] 检测到遗留 db.json，一次性迁移到 SQLite...')
  const raw = JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf-8'))
  const tx = db.transaction(() => {
    // users
    const insU = db.prepare('INSERT INTO users(username, role, isAdmin, createdAt, lastActiveAt) VALUES (?, ?, ?, ?, ?)')
    for (const u of Object.values(raw.users || {})) {
      insU.run(u.username, u.role, u.isAdmin ? 1 : 0, u.createdAt, u.lastActiveAt)
    }
    // permissions
    const insP = db.prepare('INSERT INTO user_permissions(username, permission) VALUES (?, ?)')
    for (const [username, perms] of Object.entries(raw.permissions || {})) {
      for (const p of perms || []) insP.run(username, p)
    }
    // marks
    const insM = db.prepare('INSERT INTO marks(lumiId, field, markedBy, markedAt, comment) VALUES (?, ?, ?, ?, ?)')
    for (const m of Object.values(raw.marks || {})) {
      insM.run(Number(m.lumiId), m.field, m.markedBy, m.markedAt, m.comment || '')
    }
    // audit
    const insA = db.prepare('INSERT INTO audit(id, username, action, target, at) VALUES (?, ?, ?, ?, ?)')
    for (const a of raw.audit || []) {
      insA.run(a.id, a.username, a.action, a.target || '', a.at)
    }
  })
  tx()
  fs.renameSync(LEGACY_JSON, LEGACY_JSON + '.migrated')
  console.log(`[migrate] 完成：users=${Object.keys(raw.users || {}).length} marks=${Object.keys(raw.marks || {}).length} audit=${(raw.audit || []).length}`)
}

migrateFromJson()

// ==================== users ====================

const stmtGetUser = db.prepare('SELECT username, role, isAdmin, createdAt, lastActiveAt FROM users WHERE username = ?')
const stmtListUsers = db.prepare('SELECT username, role, isAdmin, createdAt, lastActiveAt FROM users ORDER BY createdAt')
const stmtInsUser = db.prepare('INSERT INTO users(username, role, isAdmin, createdAt, lastActiveAt) VALUES (?, ?, ?, ?, ?)')
const stmtTouchUser = db.prepare('UPDATE users SET lastActiveAt = ? WHERE username = ?')
const stmtUpdRole = db.prepare('UPDATE users SET role = ? WHERE username = ?')

function rowToUser(r) {
  if (!r) return null
  return { ...r, isAdmin: !!r.isAdmin }
}

export function getUser(username) {
  return rowToUser(stmtGetUser.get(username))
}

export function listUsers() {
  return stmtListUsers.all().map(rowToUser)
}

export function createUser({ username, role, isAdmin = false }) {
  const now = new Date().toISOString()
  try {
    stmtInsUser.run(username, role, isAdmin ? 1 : 0, now, now)
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new Error('用户名已存在')
    throw e
  }
  return getUser(username)
}

export function touchUser(username) {
  stmtTouchUser.run(new Date().toISOString(), username)
}

export function updateUserRole(username, role) {
  const r = stmtUpdRole.run(role, username)
  if (r.changes === 0) throw new Error('用户不存在')
  return getUser(username)
}

// ==================== permissions ====================

const stmtGetPerms = db.prepare('SELECT permission FROM user_permissions WHERE username = ?')
const stmtDelAllPerms = db.prepare('DELETE FROM user_permissions WHERE username = ?')
const stmtInsPerm = db.prepare('INSERT OR IGNORE INTO user_permissions(username, permission) VALUES (?, ?)')

export function getUserPermissions(username) {
  return stmtGetPerms.all(username).map(r => r.permission)
}

export function hasPermission(username, permission) {
  const user = getUser(username)
  if (!user) return false
  if (user.isAdmin) return true
  return getUserPermissions(username).includes(permission)
}

const setPermsTx = db.transaction((username, permissions) => {
  stmtDelAllPerms.run(username)
  for (const p of permissions) stmtInsPerm.run(username, p)
})

export function setUserPermissions(username, permissions) {
  if (!getUser(username)) throw new Error('用户不存在')
  const valid = new Set(ALL_PERMISSIONS.map(p => p.key))
  const filtered = [...new Set((permissions || []).filter(p => valid.has(p)))]
  setPermsTx(username, filtered)
  return filtered
}

// ==================== marks ====================

const stmtListMarks = db.prepare('SELECT lumiId, field, markedBy, markedAt, comment FROM marks')
const stmtUpsertMark = db.prepare(`
  INSERT INTO marks(lumiId, field, markedBy, markedAt, comment)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(lumiId, field) DO UPDATE SET markedBy=excluded.markedBy, markedAt=excluded.markedAt, comment=excluded.comment
`)
const stmtDelMark = db.prepare('DELETE FROM marks WHERE lumiId = ? AND field = ?')

export function listMarks() {
  return stmtListMarks.all()
}

export function upsertMark({ lumiId, field, markedBy, comment }) {
  const now = new Date().toISOString()
  stmtUpsertMark.run(Number(lumiId), field, markedBy, now, comment || '')
  return { lumiId: Number(lumiId), field, markedBy, markedAt: now, comment: comment || '' }
}

export function deleteMark({ lumiId, field }) {
  const r = stmtDelMark.run(Number(lumiId), field)
  return r.changes > 0
}

// ==================== audit ====================

const stmtInsAudit = db.prepare('INSERT INTO audit(username, action, target, at) VALUES (?, ?, ?, ?)')
const stmtCountAudit = db.prepare('SELECT COUNT(*) AS c FROM audit')
const stmtListAudit = db.prepare('SELECT id, username, action, target, at FROM audit ORDER BY id DESC LIMIT ? OFFSET ?')

export function appendAudit({ username, action, target }) {
  stmtInsAudit.run(username, action, target || '', new Date().toISOString())
}

export function listAudit({ limit = 100, offset = 0 } = {}) {
  const total = stmtCountAudit.get().c
  const items = stmtListAudit.all(limit, offset)
  return { items, total }
}

// ==================== 初始化：确保管理员 EEVEE 存在 ====================

export function ensureBootstrap() {
  if (!getUser('EEVEE')) {
    console.log('[bootstrap] 创建管理员账号 EEVEE / 策划')
    createUser({ username: 'EEVEE', role: '策划', isAdmin: true })
    setUserPermissions('EEVEE', ALL_PERMISSIONS.map(p => p.key))
    appendAudit({ username: 'system', action: 'bootstrap', target: 'EEVEE' })
  }
}

// ==================== 导出底层 db 给 Phase B 生产模块用 ====================
export { db as sqliteDb }
