import fs from 'fs'
import path from 'path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import { updateGameData } from './update-game-data.mjs'
import { notify } from './notify.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

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

async function main() {
  console.log('\n========== LumiWiki 每日游戏数据更新 ==========')
  console.log('（线上战斗数据由每小时任务负责，此任务只跑游戏配置 + 立绘 + 衍生）')

  console.log('\n[1/3] 更新游戏数据（对外，svn + 复制 + 衍生 + 立绘）...')
  await updateGameData({ branch: 'external' })

  console.log('\n[2/3] 更新游戏数据（对内，svn + 复制 + 衍生 + 立绘）...')
  await updateGameData({ branch: 'internal' })

  console.log('\n[3/3] 统一发布...')
  runCommand('bash', ['publish.sh'])

  console.log('\n──── 提交 git ────')
  const status = runCommand('git', ['status', '--porcelain'])
  if (status.trim()) {
    const date = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
    const message = `自动更新数据（游戏数据对外+对内 + 衍生 + 立绘，${date}）`
    runCommand('git', ['add', '-A'])
    runCommand('git', ['commit', '-m', message])
    runCommand('git', ['push'])
    console.log('  ✓ 数据已提交并推送')
  } else {
    console.log('  无数据改动，跳过 commit')
  }

  await notify('每日游戏数据更新完成\n对外+对内 + 衍生 + 立绘 + git', 'success')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  main().catch(async e => {
    console.error(`\n❌ ${e.message}`)
    await notify(`每日游戏数据更新失败: ${e.message}`, 'error')
    process.exit(1)
  })
}
