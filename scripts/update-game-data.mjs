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
const AVATAR_SRC_DIR = 'F:/G36/LumiGoProgram/Client/Assets/UIResource/Textures/Lumi'
const AVATAR_DST_DIR = path.join(PROJECT_ROOT, 'public/images/avatars')

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
  'BattleKeywordDes.json'
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

export async function updateGameData() {
  svnUpdate()
  copyCoreFiles()
  convertI18n()
  deleteEncodedCache()
  runDerivativeScripts()
  syncAvatars()
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
