import { ref, computed } from 'vue'

// 线上数据区域：9/17 正式服起国内 + 海外 5 个独立服（游戏服务器地域）
// 只影响 online/* 数据；lumi-teams（推荐配队）所有 region 都读同一份 cn 数据（loadData 里硬编码）
export const REGIONS = {
  cn:  { label: '国内',     icon: '🇨🇳', zone: 1890 },
  sp:  { label: '南美',     icon: '🇧🇷', zone: 2890 },
  va:  { label: '北美',     icon: '🇺🇸', zone: 2891 },
  jp:  { label: '日本',     icon: '🇯🇵', zone: 2892 },
  sg:  { label: '新加坡',   icon: '🇸🇬', zone: 2893 },
  fra: { label: '法兰克福', icon: '🇪🇺', zone: 2894 },
}

const STORAGE_KEY = 'lumiwiki-region'
// 兼容旧值：测试期存的是 'domestic' / 'overseas'，正式服拆分后统一 fallback 到 cn
const saved = localStorage.getItem(STORAGE_KEY)
const currentRegion = ref(REGIONS[saved] ? saved : 'cn')

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
  return REGIONS[v] ? v : 'cn'
}
