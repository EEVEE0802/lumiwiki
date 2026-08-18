// 共享工具：解析 --branch=external|internal 参数，导出各路径常量
// 由 update-game-data.mjs 和衍生脚本（process-robot-teams / convert-adventure-drop / process-egg-drop 等）复用
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

// 对外 / 对内两套数据源
// 注意路径不对称：对外多一层 LumiGoDesigner，对内直接 Designer
const CFG = {
  external: {
    LUBAN_DATA_DIR: 'F:/G36/LumiGoDesigner/Config/Luban/Datas',
    CLIENT_ROOT:    'F:/G36/LumiGoProgram/Client/Assets/UIResource',
    DATA_SUBDIR:    '',
    IMAGE_SUBDIR:   '',
  },
  internal: {
    LUBAN_DATA_DIR: 'F:/G36Branch/Designer/Config/Luban/Datas',
    CLIENT_ROOT:    'F:/G36Branch/LumiGoProgram/Client/Assets/UIResource',
    DATA_SUBDIR:    'internal',
    IMAGE_SUBDIR:   'internal',
  },
}

export function parseBranch(argv = process.argv.slice(2)) {
  const arg = argv.find(a => a.startsWith('--branch='))
  const branch = arg ? arg.split('=')[1] : 'external'
  if (!CFG[branch]) {
    throw new Error(`未知 --branch 值: ${branch}（仅支持 external / internal）`)
  }
  const cfg = CFG[branch]
  const isInternal = branch === 'internal'

  return {
    branch,
    isInternal,
    // 源：Luban 导表 + 客户端资源
    // 2026-08-11 起 Luban 导出路径调整：客户端表和服务端表统一放在 check/data 下（原 Table/data + server/data）
    // TABLE_DATA_DIR / SERVER_DATA_DIR 保留字段名不变，两个都指向 check/data
    LUBAN_DATA_DIR: cfg.LUBAN_DATA_DIR,
    TABLE_DATA_DIR: path.join(cfg.LUBAN_DATA_DIR, 'check/data'),
    SERVER_DATA_DIR: path.join(cfg.LUBAN_DATA_DIR, 'check/data'),
    CLIENT_ROOT: cfg.CLIENT_ROOT,
    AVATAR_SRC_DIR: path.join(cfg.CLIENT_ROOT, 'Textures/Lumi'),
    BUFF_ICON_SRC_DIR: path.join(cfg.CLIENT_ROOT, 'Atlas/IconSkill'),
    SKILL_ICON_SRC_DIR: path.join(cfg.CLIENT_ROOT, 'Atlas/IconSkill'),
    ITEM_ICON_BASE_DIR: path.join(cfg.CLIENT_ROOT, 'Atlas'),
    // 目标：public/data 与 public/images
    DATA_DST_DIR: path.join(PROJECT_ROOT, 'public/data', cfg.DATA_SUBDIR),
    AVATAR_DST_DIR: path.join(PROJECT_ROOT, 'public/images', cfg.IMAGE_SUBDIR, 'avatars'),
    BUFF_ICON_DST_DIR: path.join(PROJECT_ROOT, 'public/images', cfg.IMAGE_SUBDIR, 'buffs'),
    SKILL_ICON_DST_DIR: path.join(PROJECT_ROOT, 'public/images', cfg.IMAGE_SUBDIR, 'skills'),
    ITEM_ICON_DST_DIR: path.join(PROJECT_ROOT, 'public/images', cfg.IMAGE_SUBDIR, 'items'),
    PROJECT_ROOT,
  }
}

// CJS 兼容版本（供 prepare-i18n-data.cjs 用；懒得引 ESM）
// 使用方法：见 prepare-i18n-data.cjs 里的 inline 版本
