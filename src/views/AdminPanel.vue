<script setup>
// 管理员页: 用户列表 + 权限授予 + 审计日志
// 需 useAuth().isAdmin, 否则显示"无权访问"

import { ref, onMounted, computed } from 'vue'
import { useAuth } from '../composables/useAuth'
import { apiFetch } from '../data/api'

const { isAdmin, currentUser } = useAuth()

const users = ref([])
const permissionsCatalog = ref([])   // [{ key, label, description }]
const audit = ref({ items: [], total: 0 })
const loading = ref(true)
const activeTab = ref('users')       // users | audit
const savingUser = ref(null)         // 正在保存的 username
const errorMsg = ref('')

async function loadAll() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [{ users: u }, { permissions: p }, a] = await Promise.all([
      apiFetch('/api/admin/users'),
      apiFetch('/api/admin/permissions'),
      apiFetch('/api/admin/audit?limit=200'),
    ])
    users.value = u
    permissionsCatalog.value = p
    audit.value = a
  } catch (e) {
    errorMsg.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (isAdmin.value) loadAll()
})

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

// 切换某用户的某权限
async function togglePermission(user, permKey) {
  const current = new Set(user.permissions || [])
  if (current.has(permKey)) current.delete(permKey)
  else current.add(permKey)
  const next = [...current]
  savingUser.value = user.username
  try {
    const { permissions } = await apiFetch(`/api/admin/users/${encodeURIComponent(user.username)}/permissions`, {
      method: 'PUT',
      body: { permissions: next },
    })
    user.permissions = permissions
    // 顺带刷一下审计（可选，改用主动 refresh 更实时）
    apiFetch('/api/admin/audit?limit=200').then(a => { audit.value = a }).catch(() => {})
  } catch (e) {
    alert('保存失败: ' + e.message)
  } finally {
    savingUser.value = null
  }
}

const auditActionMap = {
  register: '📝 注册',
  mark: '✅ 标记',
  unmark: '⛔ 取消标记',
  grant: '🔓 授权',
  revoke: '🔒 撤权',
  update_role: '🔄 改职能',
  bootstrap: '🚀 初始化',
}
</script>

<template>
  <div>
    <h1 class="page-title">⚙️ 用户管理</h1>

    <div v-if="!isAdmin" class="admin-forbidden">
      🔒 你没有管理员权限。
      <span v-if="currentUser">当前登录: {{ currentUser.username }} ({{ currentUser.role }})</span>
      <span v-else>请先在右上角登录。</span>
    </div>

    <template v-else>
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="errorMsg" class="admin-error">⚠️ {{ errorMsg }}</div>
      <template v-else>
        <div class="admin-tabs">
          <button :class="['admin-tab', { active: activeTab === 'users' }]" @click="activeTab = 'users'">
            用户 ({{ users.length }})
          </button>
          <button :class="['admin-tab', { active: activeTab === 'audit' }]" @click="activeTab = 'audit'">
            审计日志 ({{ audit.total }})
          </button>
          <button class="admin-refresh" @click="loadAll">🔄 刷新</button>
        </div>

        <!-- 用户列表 -->
        <div v-if="activeTab === 'users'" class="admin-users">
          <table class="admin-table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>职能</th>
                <th>身份</th>
                <th>注册时间</th>
                <th>最后活跃</th>
                <th v-for="p in permissionsCatalog" :key="p.key" :title="p.description">
                  {{ p.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.username">
                <td class="col-name">{{ u.username }}</td>
                <td>{{ u.role }}</td>
                <td>
                  <span v-if="u.isAdmin" class="tag-admin">👑 管理员</span>
                  <span v-else class="tag-normal">普通</span>
                </td>
                <td class="col-time">{{ fmtTime(u.createdAt) }}</td>
                <td class="col-time">{{ fmtTime(u.lastActiveAt) }}</td>
                <td v-for="p in permissionsCatalog" :key="p.key" class="col-perm">
                  <label class="perm-toggle" :class="{ disabled: u.isAdmin || savingUser === u.username }">
                    <input
                      type="checkbox"
                      :checked="u.isAdmin || (u.permissions || []).includes(p.key)"
                      :disabled="u.isAdmin || savingUser === u.username"
                      @change="togglePermission(u, p.key)"
                    />
                    <span v-if="u.isAdmin" class="perm-admin-note">自动</span>
                  </label>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="admin-hint">
            💡 管理员天然拥有所有权限；普通用户按需要授权。修改立即生效，用户下次访问受影响页面即可看到。
          </div>
        </div>

        <!-- 审计日志 -->
        <div v-if="activeTab === 'audit'" class="admin-audit">
          <table class="admin-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作者</th>
                <th>动作</th>
                <th>目标</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in audit.items" :key="item.id">
                <td class="col-time">{{ fmtTime(item.at) }}</td>
                <td>{{ item.username }}</td>
                <td>{{ auditActionMap[item.action] || item.action }}</td>
                <td class="col-target">{{ item.target }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="audit.total > audit.items.length" class="admin-hint">
            展示最近 {{ audit.items.length }} 条 / 共 {{ audit.total }} 条
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.admin-forbidden {
  padding: 20px;
  background: rgba(220,53,69,0.1);
  color: #ff8b95;
  border-radius: 8px;
  font-size: 0.95em;
}
.admin-error {
  padding: 12px 16px;
  background: rgba(220,53,69,0.15);
  color: #ff8b95;
  border-radius: 6px;
}
.admin-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  align-items: center;
}
.admin-tab {
  padding: 8px 16px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.9em;
}
.admin-tab.active {
  background: linear-gradient(135deg, #a493e0 0%, #764ba2 100%);
  border-color: #a493e0;
  color: #fff;
  font-weight: 600;
}
.admin-refresh {
  margin-left: auto;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.85em;
}
.admin-refresh:hover {
  border-color: #a493e0;
  color: #a493e0;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
}
.admin-table th, .admin-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  text-align: left;
}
.admin-table th {
  background: rgba(255,255,255,0.03);
  color: var(--text-dim);
  font-weight: 600;
  font-size: 0.85em;
}
.admin-table tr:hover td {
  background: rgba(255,255,255,0.02);
}
.col-name { font-weight: 600; color: #fff; }
.col-time { color: var(--text-dim); font-size: 0.85em; white-space: nowrap; }
.col-target { color: #a493e0; font-family: monospace; font-size: 0.85em; }
.col-perm { text-align: center; }
.tag-admin {
  padding: 2px 8px;
  background: linear-gradient(135deg, #a493e0 0%, #764ba2 100%);
  color: #fff;
  border-radius: 8px;
  font-size: 0.75em;
  font-weight: 600;
}
.tag-normal {
  padding: 2px 8px;
  background: rgba(255,255,255,0.05);
  color: var(--text-dim);
  border-radius: 8px;
  font-size: 0.75em;
}
.perm-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.perm-toggle.disabled { cursor: not-allowed; opacity: 0.7; }
.perm-toggle input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.perm-admin-note {
  color: var(--text-dim);
  font-size: 0.75em;
}
.admin-hint {
  margin-top: 12px;
  padding: 8px 12px;
  color: var(--text-dim);
  font-size: 0.85em;
  background: rgba(255,255,255,0.03);
  border-radius: 6px;
}
</style>
