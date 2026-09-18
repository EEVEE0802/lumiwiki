// scripts/lib/run.mjs
// 命令执行工具，跨多个 auto-update / update-game-data 脚本共享
//
// 提供：
//   - findBash(): 定时任务环境下 PATH 可能不含 bash，预先查找完整路径
//   - runCommand(cmd, args): 同步执行命令，出错时 throw；stdout / stderr 都会转发到控制台

import fs from 'fs'
import { spawnSync } from 'node:child_process'

export function findBash() {
  if (process.platform !== 'win32') return 'bash'
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ]
  return candidates.find(p => fs.existsSync(p)) || 'bash'
}

/**
 * 同步执行命令。stdout 和 stderr 都会打印（尾 2000 字符），便于排查错误
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} opts - { cwd? } 默认 cwd 为 process.cwd()
 * @returns {string} stdout（成功时）
 * @throws Error 命令启动失败或 exit != 0
 */
export function runCommand(cmd, args = [], opts = {}) {
  const cwd = opts.cwd || process.cwd()
  if (cmd === 'bash' && process.platform === 'win32') {
    cmd = findBash()
  }
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  })
  if (result.stdout) console.log(result.stdout.slice(-2000))
  if (result.stderr) console.log(result.stderr.slice(-2000))
  if (result.error) {
    throw new Error(`命令启动失败: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`命令失败 (exit ${result.status}): ${cmd} ${args.join(' ')}`)
  }
  return result.stdout || ''
}
