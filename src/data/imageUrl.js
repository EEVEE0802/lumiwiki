// 图片 URL helper：集中处理版本前缀（对外 /images/... vs 对内 /images/internal/...）
// 属性图标（types）是通用的，不切换
import { imagePrefix } from '../composables/useVersion'

// 兼容两种入参：数字 lumiId 或已带 CA_ 前缀的完整字符串
export function avatarUrl(idOrCA) {
  if (idOrCA == null || idOrCA === '') {
    return `${imagePrefix()}/avatars/unknown.png`
  }
  const s = String(idOrCA)
  const fileName = s.startsWith('CA_') ? s : `CA_${s}`
  return `${imagePrefix()}/avatars/${fileName}.png`
}

export function buffIconUrl(icon) {
  if (!icon) return `${imagePrefix()}/buffs/unknown.png`
  return `${imagePrefix()}/buffs/${icon}.png`
}

export function itemIconUrl(icon) {
  if (!icon) return `${imagePrefix()}/items/unknown.png`
  return `${imagePrefix()}/items/${icon}.png`
}

export function skillIconUrl(icon) {
  if (!icon) return `${imagePrefix()}/skills/unknown.png`
  return `${imagePrefix()}/skills/${icon}.png`
}

// 属性图标（通用，不切换）
export function typeIconUrl(icon) {
  return `/images/types/${icon}.png`
}

// 统一 onerror handler，兜底到 unknown.png（避免死循环）
export function handleAvatarError(e) {
  e.target.onerror = null
  e.target.src = `${imagePrefix()}/avatars/unknown.png`
}
