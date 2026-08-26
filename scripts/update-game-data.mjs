import fs from 'fs'
import path from 'path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import { notify } from './notify.mjs'
import { parseBranch } from './branch-cfg.mjs'

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
  if (result.stderr) console.log(result.stderr.slice(-2000))
  if (result.error) {
    throw new Error(`命令启动失败: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`命令失败 (exit ${result.status}): ${cmd} ${args.join(' ')}`)
  }
  return result.stdout || ''
}

// 需要复制的核心 JSON（2026-08-11 起客户端/服务端表统一放在 check/data，一并列出）
// 注：Avg / LumiCatch / LumiLevel / LumiRareLevel / MarketPrice 之前遗漏，一并补齐
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
  'Request.json',
  'TrainerSkill.json',
  'Avg.json',
  'LumiCatch.json',
  'LumiLevel.json',
  'LumiRareLevel.json',
  'MarketPrice.json',
  'LumiCondition.json',
  'OrderNPC.json'
]

function svnUpdate(cfg) {
  console.log(`\n📦 svn update 游戏导表（${cfg.branch}）...`)
  runCommand('svn', ['update', cfg.LUBAN_DATA_DIR])
  console.log(`\n📦 git pull 客户端资源（${cfg.branch}）...`)
  // 策划机器无 git 提交权限，本地改动都是引擎运行产生的临时变更，直接 reset 丢弃后再 pull
  // git 出错时只警告不 throw：客户端资源仅用于新增立绘同步，缺了 syncAvatars 会自然跳过；
  // wiki 核心数据由 svn 拉，跟 git repo 无关，不能因为 git 挂就阻塞整个 wiki 数据更新
  try {
    runCommand('git', ['-C', cfg.CLIENT_ROOT, 'reset', '--hard', 'HEAD'])
    runCommand('git', ['-C', cfg.CLIENT_ROOT, 'pull', '--ff-only'])
  } catch (e) {
    console.log(`  ⚠ 客户端资源 git 拉取失败（${e.message.slice(0, 120)}）— 跳过，不影响 wiki 数据同步`)
  }
}

function copyCoreFiles(cfg) {
  console.log('\n📋 复制核心 JSON...')
  // 确保目标目录存在（internal 首次跑时不存在）
  fs.mkdirSync(cfg.DATA_DST_DIR, { recursive: true })
  for (const file of CORE_FILES) {
    const src = path.join(cfg.TABLE_DATA_DIR, file)
    if (!fs.existsSync(src)) {
      console.log(`  ⚠ 源文件不存在，跳过: ${file}`)
      continue
    }
    fs.copyFileSync(src, path.join(cfg.DATA_DST_DIR, file))
    console.log(`  ✓ ${file}`)
  }
}

function convertI18n(cfg) {
  console.log('\n🌐 转换多语言...')
  const args = ['prepare-i18n-data.cjs']
  if (cfg.isInternal) args.push('--branch=internal')
  runCommand(process.execPath, args)
}

function deleteEncodedCache(cfg) {
  console.log('\n🗑️  清理 .encoded 缓存...')
  const dataDir = cfg.DATA_DST_DIR
  if (!fs.existsSync(dataDir)) return
  let count = 0
  for (const file of fs.readdirSync(dataDir)) {
    if (file.endsWith('.encoded')) {
      fs.unlinkSync(path.join(dataDir, file))
      count++
    }
  }
  console.log(`  ✓ 清理 ${count} 个 .encoded 文件`)
}

function runDerivativeScripts(cfg) {
  console.log('\n🔧 跑衍生脚本（依赖游戏数据）...')
  const branchArg = cfg.isInternal ? ['--branch=internal'] : []
  runCommand(process.execPath, ['scripts/process-robot-teams.js', ...branchArg])
  runCommand(process.execPath, ['scripts/convert-adventure-drop.mjs', ...branchArg])
}

function syncAvatars(cfg) {
  console.log('\n🖼️  同步立绘资源（仅复制缺失文件）...')
  fs.mkdirSync(cfg.AVATAR_DST_DIR, { recursive: true })
  if (!fs.existsSync(cfg.AVATAR_SRC_DIR)) {
    console.log(`  ⚠ 立绘源目录不存在，跳过: ${cfg.AVATAR_SRC_DIR}`)
    return
  }
  const srcFiles = fs.readdirSync(cfg.AVATAR_SRC_DIR).filter(f => f.startsWith('CA_') && f.endsWith('.png'))
  const dstFiles = new Set(fs.readdirSync(cfg.AVATAR_DST_DIR).filter(f => f.startsWith('CA_')))

  let added = 0
  for (const file of srcFiles) {
    if (!dstFiles.has(file)) {
      fs.copyFileSync(path.join(cfg.AVATAR_SRC_DIR, file), path.join(cfg.AVATAR_DST_DIR, file))
      added++
    }
  }
  console.log(`  ✓ 新增 ${added} 张立绘`)

  // 兜底：确保 unknown.png / CA_lumi.png 存在（前端 helper 用做 fallback）
  ensureFallbackImages(cfg)
}

function ensureFallbackImages(cfg) {
  // 从外部图片目录复制 fallback 到 internal（如果 internal 目录里缺）
  if (!cfg.isInternal) return
  const externalDir = path.join(PROJECT_ROOT, 'public/images/avatars')
  const fallbacks = ['unknown.png', 'CA_lumi.png']
  for (const name of fallbacks) {
    const src = path.join(externalDir, name)
    const dst = path.join(cfg.AVATAR_DST_DIR, name)
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.copyFileSync(src, dst)
      console.log(`  ✓ 复制 fallback 图: ${name}`)
    }
  }
}

function syncBuffIcons(cfg) {
  console.log('\n🎨 同步 Buff 图标（数据驱动按需复制）...')
  fs.mkdirSync(cfg.BUFF_ICON_DST_DIR, { recursive: true })

  // 从 BattleBuff.json 收集所有 Icon 名（跨前缀：Buff_*, LumiType_*, TrainerSkill_* 等）
  const buffDataPath = path.join(cfg.DATA_DST_DIR, 'BattleBuff.json')
  if (!fs.existsSync(buffDataPath)) {
    console.log('  ⚠ BattleBuff.json 不存在，跳过')
    return
  }
  if (!fs.existsSync(cfg.BUFF_ICON_SRC_DIR)) {
    console.log(`  ⚠ Buff 图标源目录不存在，跳过: ${cfg.BUFF_ICON_SRC_DIR}`)
    return
  }
  const buffData = JSON.parse(fs.readFileSync(buffDataPath, 'utf-8'))
  const arr = Array.isArray(buffData) ? buffData : (buffData.data || Object.values(buffData))
  const icons = new Set()
  arr.forEach(b => {
    if (b.Icon && b.Icon[0]) icons.add(b.Icon[0])
  })

  const dstFiles = new Set(fs.readdirSync(cfg.BUFF_ICON_DST_DIR).filter(f => f.endsWith('.png')))
  let added = 0
  let missing = 0
  let invalid = 0
  for (const icon of icons) {
    const safeName = path.basename(icon)
    if (safeName !== icon) {
      console.log(`  ⚠ 跳过非法 icon 名: ${icon}`)
      invalid++
      continue
    }
    const fileName = safeName + '.png'
    if (dstFiles.has(fileName)) continue
    const src = path.join(cfg.BUFF_ICON_SRC_DIR, fileName)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(cfg.BUFF_ICON_DST_DIR, fileName))
      added++
    } else {
      console.log(`  ⚠ 缺失源文件: ${fileName}`)
      missing++
    }
  }
  if (invalid) console.log(`  ⚠ 共 ${invalid} 个非法 icon 名已跳过`)
  console.log(`  ✓ 新增 ${added} 个图标，缺失 ${missing} 个`)
}

// 同步技能图标（数据驱动：遍历 ActiveSkill.json 里所有 icon 字段引用）
// 覆盖 SkillList / LumiDetail / RobotTeam / DamageCalculator 等技能展示位
function syncSkillIcons(cfg) {
  console.log('\n⚔️  同步技能图标（数据驱动按需复制）...')
  fs.mkdirSync(cfg.SKILL_ICON_DST_DIR, { recursive: true })

  const skillPath = path.join(cfg.DATA_DST_DIR, 'ActiveSkill.json')
  if (!fs.existsSync(skillPath)) {
    console.log('  ⚠ ActiveSkill.json 不存在，跳过')
    return
  }
  if (!fs.existsSync(cfg.SKILL_ICON_SRC_DIR)) {
    console.log(`  ⚠ 技能图标源目录不存在，跳过: ${cfg.SKILL_ICON_SRC_DIR}`)
    return
  }
  const skillArr = (() => {
    const d = JSON.parse(fs.readFileSync(skillPath, 'utf-8'))
    return Array.isArray(d) ? d : (d.data || Object.values(d))
  })()

  const icons = new Set()
  for (const sk of skillArr) {
    if (sk.icon) icons.add(sk.icon)
  }

  const dstFiles = new Set(fs.readdirSync(cfg.SKILL_ICON_DST_DIR).filter(f => f.endsWith('.png')))
  let added = 0, missing = 0, invalid = 0
  for (const icon of icons) {
    const safeName = path.basename(icon)
    if (safeName !== icon) {
      console.log(`  ⚠ 跳过非法 icon 名: ${icon}`)
      invalid++
      continue
    }
    const fileName = safeName + '.png'
    if (dstFiles.has(fileName)) continue
    const src = path.join(cfg.SKILL_ICON_SRC_DIR, fileName)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(cfg.SKILL_ICON_DST_DIR, fileName))
      added++
    } else {
      missing++
    }
  }
  if (invalid) console.log(`  ⚠ 共 ${invalid} 个非法 icon 名已跳过`)
  console.log(`  ✓ 新增 ${added} 个图标，缺失源文件 ${missing} 个`)
}

// 同步物品图标（数据驱动：全量遍历 Item.json 里所有 icon 字段引用）
// 覆盖 ItemList / EggDrop / StarExchange 等页面，避免切换到 internal 后大量 404
function syncRequestItemIcons(cfg) {
  console.log('\n🎁 同步物品图标（全量：遍历 Item.json 所有 icon 引用）...')
  fs.mkdirSync(cfg.ITEM_ICON_DST_DIR, { recursive: true })
  const itemPath = path.join(cfg.DATA_DST_DIR, 'Item.json')
  if (!fs.existsSync(itemPath)) {
    console.log('  ⚠ Item.json 不存在，跳过')
    return
  }
  if (!fs.existsSync(cfg.ITEM_ICON_BASE_DIR)) {
    console.log(`  ⚠ 物品图标源目录不存在，跳过: ${cfg.ITEM_ICON_BASE_DIR}`)
    return
  }
  const itemArr = (() => {
    const d = JSON.parse(fs.readFileSync(itemPath, 'utf-8'))
    return Array.isArray(d) ? d : (d.data || Object.values(d))
  })()

  const dstFiles = new Set(fs.readdirSync(cfg.ITEM_ICON_DST_DIR).filter(f => f.endsWith('.png')))
  let added = 0, missing = 0, invalid = 0, skipped = 0
  for (const it of itemArr) {
    if (!it.icon) { skipped++; continue }
    const safeIcon = path.basename(it.icon)
    if (safeIcon !== it.icon) { invalid++; continue }
    const fileName = safeIcon + '.png'
    if (dstFiles.has(fileName)) continue
    const atlas = path.basename(it.Atlas || 'IconItem')
    const src = path.join(cfg.ITEM_ICON_BASE_DIR, atlas, fileName)
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(cfg.ITEM_ICON_DST_DIR, fileName))
      dstFiles.add(fileName)
      added++
    } else {
      missing++
    }
  }
  if (invalid) console.log(`  ⚠ 共 ${invalid} 个非法 icon 名已跳过`)
  console.log(`  ✓ 新增 ${added} 个图标，缺失源文件 ${missing} 个，无 icon 字段 ${skipped} 个`)
}

// 将对外的 extra.json 复制到 internal（社区维护的口味信息与游戏版本正交）
function mirrorExtra(cfg) {
  if (!cfg.isInternal) return
  const src = path.join(PROJECT_ROOT, 'public/data/extra.json')
  const dst = path.join(cfg.DATA_DST_DIR, 'extra.json')
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst)
    console.log('\n📋 复制 extra.json 到 internal ✓')
  }
}

export async function updateGameData(opts = {}) {
  const branch = opts.branch || 'external'
  const cfg = parseBranch([`--branch=${branch}`])
  console.log(`\n===== updateGameData: ${cfg.branch} =====`)

  svnUpdate(cfg)
  copyCoreFiles(cfg)
  convertI18n(cfg)
  deleteEncodedCache(cfg)
  runDerivativeScripts(cfg)
  syncAvatars(cfg)
  syncBuffIcons(cfg)
  syncSkillIcons(cfg)
  syncRequestItemIcons(cfg)
  mirrorExtra(cfg)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  ;(async () => {
    try {
      const cfg = parseBranch()
      console.log(`===== 游戏数据更新（${cfg.branch}） =====`)
      await updateGameData({ branch: cfg.branch })
      console.log('\n🚀 发布...')
      runCommand('bash', ['publish.sh'])
      await notify(`游戏数据已更新并发布（${cfg.branch}）`, 'success')
    } catch (e) {
      console.error(`\n❌ ${e.message}`)
      await notify(`游戏数据更新失败: ${e.message}`, 'error')
      process.exit(1)
    }
  })()
}
