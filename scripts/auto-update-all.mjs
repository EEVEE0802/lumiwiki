import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { updateGameData } from './update-game-data.mjs'
import { notify } from './notify.mjs'
import { runCommand as runCmdRaw } from './lib/run.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

// runCommand / findBash 已抽到 scripts/lib/run.mjs
// 本文件内所有 runCommand(cmd, args) 都以 PROJECT_ROOT 作为 cwd（跟原实现一致）
const runCommand = (cmd, args = []) => runCmdRaw(cmd, args, { cwd: PROJECT_ROOT })

async function main() {
  console.log('\n========== LumiWiki 每日游戏数据更新 ==========')
  console.log('（线上战斗数据由每小时任务负责，此任务只跑游戏配置 + 立绘 + 衍生）')

  console.log('\n[1/3] 更新游戏数据（对外，svn + 复制 + 衍生 + 立绘）...')
  await updateGameData({ branch: 'external' })

  console.log('\n[2/3] 更新游戏数据（对内，svn + 复制 + 衍生 + 立绘）...')
  await updateGameData({ branch: 'internal' })

  console.log('\n[3/3] 统一发布...')
  runCommand('bash', ['publish.sh'])

  console.log('\n──── 提交 git（代码同步，失败不影响发布）────')
  // 2026-09-18 起策略：数据不进 git，git 只装代码。git 失败不阻塞发布 —— 前面 publish.sh 已经把数据推到 dist 生效
  try {
    const status = runCommand('git', ['status', '--porcelain'])
    if (status.trim()) {
      const date = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
      const message = `自动更新数据（游戏数据对外+对内 + 衍生 + 立绘，${date}）`
      runCommand('git', ['add', '-A'])
      runCommand('git', ['commit', '-m', message])
      runCommand('git', ['push'])
      console.log('  ✓ 数据已提交并推送')
    } else {
      console.log('  无代码改动，跳过 commit')
    }
  } catch (e) {
    console.error(`⚠️  git 同步失败（不影响发布，本地数据已经 publish 生效）: ${e.message}`)
    try {
      await notify(`⚠️ 每日游戏数据 git 同步失败（数据已本地发布，不影响 wiki 访问）\n错误: ${e.message.slice(0, 300)}`, 'warning')
    } catch { /* notify 失败也不阻塞 */ }
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
