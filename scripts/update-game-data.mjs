import fs from 'fs'
import path from 'path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import { notify } from './notify.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

// 数据源（游戏 SVN 导表 + 客户端资源）
const LUBAN_DATA_DIR = 'F:/G36/LumiGoDesigner/Config/Luban/Datas'
const TABLE_DATA_DIR = path.join(LUBAN_DATA_DIR, 'Table/data')
const SERVER_DATA_DIR = path.join(LUBAN_DATA_DIR, 'server/data')
const AVATAR_SRC_DIR = 'F:/G36/LumiGoProgram/Client/Assets/UIResource/Textures/Lumi'
const AVATAR_DST_DIR = path.join(PROJECT_ROOT, 'public/images/avatars')
const BUFF_ICON_SRC_DIR = 'F:/G36/LumiGoProgram/Client/Assets/UIResource/Atlas/IconSkill'
const BUFF_ICON_DST_DIR = path.join(PROJECT_ROOT, 'public/images/buffs')
const ITEM_ICON_BASE_DIR = 'F:/G36/LumiGoProgram/Client/Assets/UIResource/Atlas'
const ITEM_ICON_DST_DIR = path.join(PROJECT_ROOT, 'public/images/items')

// 定时任务环境 PATH 可能不含 bash，预先查找完整路径
function findBash() {
  if (process.platform !== 'win32') return 'bash'
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
  ]
  return candidates.find(p => fs.existsSync(p)) || 'bash'
}

function runCommand(cmd, args = []) {
  if (cmd === 'bash' && process.platform === 'win32') {
    cmd = findBash()
  }
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    stdio: 'pipe'
  })
  if (result.stdout) console.log(result.stdout.slice(-2000))
  if (result.error) {
    throw new Error(`命令启动失败: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`命令失败 (exit ${result.status}): ${cmd} ${args.join(' ')}`)
  }
  return result.stdout || ''
}

const CORE_FILES = [
  'ActiveSkill.json',
  'BattlePassive.json',
  'HomePassive.json',
  'Lumi.json',
  'LumiEvolution.json',
  'LumiTypeCounter.json',
  'Item.json',
  'BattleKeywordDes.json',
  'BattleBuff.json',
  'Request.json'
]

// 服务端导表（不在 Table/data，需独立复制）
const SERVER_FILES = [
  ['LumiCondition.json', 'LumiCondition.json']
]

function svnUpdate() {
  console.log('\n📦 svn update 游戏导表...')
  runCommand('svn', ['update', LUBAN_DATA_DIR])
}

function copyCoreFiles() {
  console.log('\n📋 复制核心 JSON...')
  for (const file of CORE_FILES) {
    fs.copyFileSync(path.join(TABLE_DATA_DIR, file), path.join(PROJECT_ROOT, 'public/data', file))
    console.log(`  ✓ ${file}`)
  }
  console.log('\n📋 复制服务端 JSON...')
  for (const [src, dst] of SERVER_FILES) {
    fs.copyFileSync(path.join(SERVER_DATA_DIR, src), path.join(PROJECT_ROOT, 'public/data', dst))
    console.log(`  ✓ ${dst}`)
  }
}

function convertI18n() {
  console.log('\n🌐 转换多语言...')
  runCommand(process.execPath, ['prepare-i18n-data.cjs'])
}

function deleteEncodedCache() {
  console.log('\n🗑️  清理 .encoded 缓存...')
  const dataDir = path.join(PROJECT_ROOT, 'public/data')
  let count = 0
  for (const file of fs.readdirSync(dataDir)) {
    if (file.endsWith('.encoded')) {
      fs.unlinkSync(path.join(dataDir, file))
      count++
    }
  }
  console.log(`  ✓ 清理 ${count} 个 .encoded 文件`)
}

function runDerivativeScripts() {
  console.log('\n🔧 跑衍生脚本（依赖游戏数据）...')
  runCommand(process.execPath, ['scripts/process-robot-teams.js'])
  runCommand(process.execPath, ['scripts/convert-adventure-drop.mjs'])
  runCommand(process.execPath, ['scripts/process-egg-drop.mjs'])
}

function syncAvatars() {
  console.log('\n🖼️  同步立绘资源（仅复制缺失文件）...')
  const srcFiles = fs.readdirSync(AVATAR_SRC_DIR).filter(f => f.startsWith('CA_') && f.endsWith('.png'))
  const dstFiles = new Set(fs.readdirSync(AVATAR_DST_DIR).filter(f => f.startsWith('CA_')))

  let added = 0
  for (const file of srcFiles) {
    if (!dstFiles.has(file)) {
      fs.copyFileSync(path.join(AVATAR_SRC_DIR, file), path.join(AVATAR_DST_DIR, file))
      added++
    }
  }
  console.log(`  ✓ 新增 ${added} 张立绘`)
}

function syncBuffIcons() {
  console.log('\n🎨 同步 Buff 图标（数据驱动按需复制）...')
  fs.mkdirSync(BUFF_ICON_DST_DIR, { recursive: true })

  // 从 BattleBuff.json 收集所有 Icon 名（跨前缀：Buff_*, LumiType_*, TrainerSkill_* 等）
  const buffDataPath = path.join(PROJECT_ROOT, 'public/data/BattleBuff.json')
  if (!fs.existsSync(buffDataPath)) {
    console.log('  ⚠ BattleBuff.json 不存在，跳过')
    return
  }
  const buffData = JSON.parse(fs.readFileSync(buffDataPath, 'utf-8'))
  const arr = Array.isArray(buffData) ? buffData : (buffData.data || Object.values(buffData))
  const icons = new Set()
  arr.forEach(b => {
    if (b.Icon && b.Icon[0]) icons.add(b.Icon[0])
  })

  const dstFiles = new Set(fs.readdirSync(BUFF_ICON_DST_DIR).filter(f => f.endsWith('.png')))
  let added = 0
  let missing = 0
  let invalid = 0
  for (const icon of icons) {
    // path.basename 防御 path traversal（如 icon="../../etc/foo"）
    const safeName = path.basename(icon)
    if (safeName !== icon) {
      console.log(`  ⚠ 跳过非法 icon 名: ${icon}`)
      invalid++
      continue
    }
    const fileName = safeName + '.png'
    if (dstFiles.has(fileName)) continue
    const src = path.join(BUFF_ICON_SRC_DIR, fileName)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(BUFF_ICON_DST_DIR, fileName))
      added++
    } else {
      console.log(`  ⚠ 缺失源文件: ${fileName}`)
      missing++
    }
  }
  if (invalid) console.log(`  ⚠ 共 ${invalid} 个非法 icon 名已跳过`)
  console.log(`  ✓ 新增 ${added} 个图标，缺失 ${missing} 个`)
}

// 同步归星玩法奖励物品图标（数据驱动：按 Request.json 引用的 Item ID）
function syncRequestItemIcons() {
  console.log('\n🎁 同步归星奖励物品图标（数据驱动）...')
  const reqPath = path.join(PROJECT_ROOT, 'public/data/Request.json')
  const itemPath = path.join(PROJECT_ROOT, 'public/data/Item.json')
  if (!fs.existsSync(reqPath) || !fs.existsSync(itemPath)) {
    console.log('  ⚠ Request.json 或 Item.json 不存在，跳过')
    return
  }
  const reqArr = (() => {
    const d = JSON.parse(fs.readFileSync(reqPath, 'utf-8'))
    return Array.isArray(d) ? d : (d.data || Object.values(d))
  })()
  const itemArr = (() => {
    const d = JSON.parse(fs.readFileSync(itemPath, 'utf-8'))
    return Array.isArray(d) ? d : (d.data || Object.values(d))
  })()
  const itemMap = new Map(itemArr.map(x => [x.key1, x]))

  // 收集正式组（有 StartTime）的奖励物品 ID
  const itemIds = new Set()
  reqArr.filter(g => g.StartTime && g.EndTime).forEach(g => {
    (g.RequestData || []).forEach(r => {
      (r.Rewards || []).forEach(rw => {
        if (rw.Type === 2) itemIds.add(rw.Id)
      })
    })
  })

  const dstFiles = new Set(fs.readdirSync(ITEM_ICON_DST_DIR).filter(f => f.endsWith('.png')))
  let added = 0, missing = 0, invalid = 0
  for (const id of itemIds) {
    const it = itemMap.get(id)
    if (!it || !it.icon) continue
    // path.basename 防御 path traversal
    const safeIcon = path.basename(it.icon)
    if (safeIcon !== it.icon) { invalid++; continue }
    const fileName = safeIcon + '.png'
    if (dstFiles.has(fileName)) continue
    // 按 Atlas 字段决定源子目录
    const atlas = path.basename(it.Atlas || 'IconItem')
    const src = path.join(ITEM_ICON_BASE_DIR, atlas, fileName)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(ITEM_ICON_DST_DIR, fileName))
      added++
    } else {
      console.log(`  ⚠ 缺失源文件: ${atlas}/${fileName}`)
      missing++
    }
  }
  if (invalid) console.log(`  ⚠ 共 ${invalid} 个非法 icon 名已跳过`)
  console.log(`  ✓ 新增 ${added} 个图标，缺失 ${missing} 个`)
}

export async function updateGameData() {
  svnUpdate()
  copyCoreFiles()
  convertI18n()
  deleteEncodedCache()
  runDerivativeScripts()
  syncAvatars()
  syncBuffIcons()
  syncRequestItemIcons()
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  ;(async () => {
    try {
      console.log('===== 游戏数据更新 =====')
      await updateGameData()
      console.log('\n🚀 发布...')
      runCommand('bash', ['publish.sh'])
      await notify('游戏数据已更新并发布', 'success')
    } catch (e) {
      console.error(`\n❌ ${e.message}`)
      await notify(`游戏数据更新失败: ${e.message}`, 'error')
      process.exit(1)
    }
  })()
}
