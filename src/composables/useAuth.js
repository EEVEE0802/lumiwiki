// 全局登录状态 (跨组件共享)
// 用户信息 + 权限白名单存 localStorage, 页面刷新后从 /api/auth/me 静默续期

import { ref, computed } from 'vue'
import { apiFetch, getToken, setToken } from '../data/api'

const USER_KEY = 'lumiwiki-auth-user'
const PERMS_KEY = 'lumiwiki-auth-perms'

// 单例 ref: 所有 useAuth() 调用共享同一份状态
const currentUser = ref(loadCachedUser())
const permissions = ref(loadCachedPerms())
const isAdmin = computed(() => !!currentUser.value?.isAdmin)
const isAuthed = computed(() => !!currentUser.value)

function loadCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function loadCachedPerms() {
  try {
    const raw = localStorage.getItem(PERMS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveUser(user, perms) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    localStorage.setItem(PERMS_KEY, JSON.stringify(perms || []))
  } else {
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(PERMS_KEY)
  }
  currentUser.value = user
  permissions.value = perms || []
}

// 页面加载时静默续期: 有 token 就调 /me 拉最新用户信息 (权限可能被管理员变更)
async function refresh() {
  if (!getToken()) return
  try {
    const data = await apiFetch('/api/auth/me')
    saveUser(data.user, data.permissions)
  } catch (e) {
    if (e.status === 401) {
      // token 失效, 清干净
      setToken('')
      saveUser(null, [])
    }
  }
}

async function register(username, role) {
  const data = await apiFetch('/api/auth/register', { method: 'POST', body: { username, role } })
  setToken(data.token)
  saveUser(data.user, data.permissions)
  return data
}

async function login(username) {
  const data = await apiFetch('/api/auth/login', { method: 'POST', body: { username } })
  setToken(data.token)
  saveUser(data.user, data.permissions)
  return data
}

function logout() {
  setToken('')
  saveUser(null, [])
}

function hasPermission(permission) {
  if (!currentUser.value) return false
  if (currentUser.value.isAdmin) return true
  return permissions.value.includes(permission)
}

// 首次导入即触发一次静默续期
refresh()

export function useAuth() {
  return {
    currentUser,
    permissions,
    isAuthed,
    isAdmin,
    register,
    login,
    logout,
    refresh,
    hasPermission,
  }
}
