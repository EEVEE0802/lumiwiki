// API 客户端: 统一处理 baseURL / token / 错误
// baseURL 通过环境变量或运行时探测: dev 时通常 3005 前端 + 3006 API 同机

const API_BASE = (() => {
  // 优先用编译期注入
  if (import.meta.env.VITE_API_BASE) return import.meta.env.VITE_API_BASE
  // 运行时: 用当前 host + 3006
  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:3006`
  }
  return 'http://localhost:3006'
})()

const TOKEN_KEY = 'lumiwiki-auth-token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  })
  const ct = resp.headers.get('content-type') || ''
  const data = ct.includes('application/json') ? await resp.json() : await resp.text()
  if (!resp.ok) {
    const err = new Error(data?.error || `请求失败: ${resp.status}`)
    err.status = resp.status
    err.data = data
    throw err
  }
  return data
}

export { API_BASE }
