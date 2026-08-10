import { ref, computed } from 'vue'

// 线上数据区域：国内 / 海外（游戏服务器地域）
// 只影响 online/* 数据和 lumi-teams（推荐配队），不影响游戏配置本身
export const REGIONS = {
  domestic: { label: '国内服', icon: '🇨🇳' },
  overseas: { label: '海外服', icon: '🌏' },
}

const STORAGE_KEY = 'lumiwiki-region'
const saved = localStorage.getItem(STORAGE_KEY)
const currentRegion = ref(REGIONS[saved] ? saved : 'domestic')

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
  return localStorage.getItem(STORAGE_KEY) === 'overseas' ? 'overseas' : 'domestic'
}
