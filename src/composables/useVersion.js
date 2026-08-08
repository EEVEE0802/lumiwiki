import { ref, computed } from 'vue'
import { clearLanguageCache } from '../data'

// 数据版本：对外（G36 稳定分支）/ 对内（G36Branch 开发分支）
export const VERSIONS = {
  external: { label: '对外版', icon: '🌐' },
  internal: { label: '对内版', icon: '🔒' },
}

const STORAGE_KEY = 'lumiwiki-version'
const saved = localStorage.getItem(STORAGE_KEY)
const currentVersion = ref(VERSIONS[saved] ? saved : 'external')

export function setVersion(v) {
  if (!VERSIONS[v]) return
  if (v === currentVersion.value) return
  currentVersion.value = v
  localStorage.setItem(STORAGE_KEY, v)
  clearLanguageCache()
  window.location.reload()
}

export function useVersion() {
  return {
    currentVersion: computed(() => currentVersion.value),
    versions: VERSIONS,
    setVersion,
    isInternal: computed(() => currentVersion.value === 'internal'),
  }
}

// 同步 helper（供 loadData / imageUrl 等非 Vue 环境用）
export function getVersionSync() {
  return localStorage.getItem(STORAGE_KEY) === 'internal' ? 'internal' : 'external'
}

export function dataPrefix() {
  return getVersionSync() === 'internal' ? '/data/internal' : '/data'
}

export function imagePrefix() {
  return getVersionSync() === 'internal' ? '/images/internal' : '/images'
}
