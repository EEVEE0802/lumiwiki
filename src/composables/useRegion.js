import { ref, computed } from 'vue'

// 线上数据区域：9/17 正式服起国内 + 海外合并（5 服合并统计）
// 只影响 online/* 数据；lumi-teams（推荐配队）所有 region 都读同一份 cn 数据（loadData 里硬编码）
export const REGIONS = {
  cn:       { label: '国内',     icon: '🇨🇳' },
  overseas: { label: '海外',     icon: '🌏' },
}

const STORAGE_KEY = 'lumiwiki-region'
// 兼容旧值：
// - 测试期存的是 'domestic' / 'overseas' → domestic 转 cn
// - 短暂拆分期存的是 'sp' / 'va' / 'jp' / 'sg' / 'fra' → 转 overseas
// - 未知值兜底 cn
const saved = localStorage.getItem(STORAGE_KEY)
const OVERSEAS_LEGACY = new Set(['sp', 'va', 'jp', 'sg', 'fra'])
const initialRegion = REGIONS[saved]
  ? saved
  : OVERSEAS_LEGACY.has(saved)
    ? 'overseas'
    : 'cn'
const currentRegion = ref(initialRegion)

export function setRegion(v) {
  if (!REGIONS[v]) return
  if (v === currentRegion.value) return
  currentRegion.value = v
  localStorage.setItem(STORAGE_KEY, v)
}

export function useRegion() {
  return {
    currentRegion: computed(() => currentRegion.value),
    regions: REGIONS,
    setRegion,
  }
}

// 同步 helper（供 loadData / 非 Vue 环境用）
export function getRegionSync() {
  const v = localStorage.getItem(STORAGE_KEY)
  if (REGIONS[v]) return v
  if (OVERSEAS_LEGACY.has(v)) return 'overseas'
  return 'cn'
}
