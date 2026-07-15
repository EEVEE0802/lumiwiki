import fs from 'fs'
import path from 'path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import { updateMode, computeWeekInfo } from './auto-update.mjs'
import { updateGameData } from './update-game-data.mjs'
import { ensureValidToken } from './ta-auth.mjs'
import { notify } from './notify.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'ta-config.json'), 'utf-8'))
}

function runCommand(cmd, args = []) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    stdio: 'pipe'
  })
  if (result.stdout) console.log(result.stdout.slice(-2000))
  if (result.status !== 0) {
    throw new Error(`命令失败 (exit ${result.status}): ${cmd} ${args.join(' ')}`)
  }
  return result.stdout || ''
}

async function main() {
  const config = loadConfig()

  console.log('\n========== LumiWiki 全量自动更新 ==========')

  await ensureValidToken()

  const weekInfo = computeWeekInfo(config.baseFriday)
  console.log(`游戏周: Week ${weekInfo.week} (${weekInfo.startTime} ~ ${weekInfo.endTime})`)

  console.log('\n[1/4] 更新游戏数据（svn + 复制 + 衍生 + 立绘）...')
  await updateGameData()

  console.log('\n[2/4] 更新天梯数据...')
  await updateMode('ladder', weekInfo, { skipPublish: true })

  console.log('\n[3/4] 统一发布...')
  runCommand('bash', ['publish.sh'])

  console.log('\n[4/4] 提交数据到 git...')
  const status = runCommand('git', ['status', '--porcelain'])
  if (status.trim()) {
    const date = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
    const message = `自动更新数据（游戏数据 + 天梯 Week ${weekInfo.week}，${date}）`
    runCommand('git', ['add', '-A'])
    runCommand('git', ['commit', '-m', message])
    runCommand('git', ['push'])
    console.log('  ✓ 数据已提交并推送')
  } else {
    console.log('  无数据改动，跳过 commit')
  }

  await notify(`全量更新完成（Week ${weekInfo.week}）\n游戏数据 + 天梯 + 衍生 + 立绘 + git`, 'success')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  main().catch(async e => {
    console.error(`\n❌ ${e.message}`)
    await notify(`全量更新失败: ${e.message}`, 'error')
    process.exit(1)
  })
}
