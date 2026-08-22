<script setup>
// 生产协作站 · 排期总览页 (PM 视角)
// - 只展 order 元数据（名字/图鉴号/属性/里程碑/投放/进度/策划）
// - 顶部多维筛选
// - 每行右侧 ✏️ 编辑 · 📅 排期 · TAPD 直跳
// - 顶部 ➕ 新增噜咪
// - 展示所有噜咪：包括未上包的（图鉴里没数据的）

import { ref, computed, onMounted } from 'vue'
import { apiFetch } from '../data/api'
import { useAuth } from '../composables/useAuth'
import { TYPE_COLORS, TYPE_NAMES, LUMI_TAG_NAMES } from '../data'
import { avatarUrl } from '../data/imageUrl'
import ProductionOrderEditor from '../components/ProductionOrderEditor.vue'
import ProductionScheduleEditor from '../components/ProductionScheduleEditor.vue'

const { currentUser, hasPermission } = useAuth()
const canPm = computed(() => hasPermission('production.pm'))

const orders = ref([])
const iterations = ref([])
const loading = ref(true)
const error = ref('')

// 筛选
const searchQuery = ref('')
const filterMilestone = ref('')
const filterRelease = ref('')
const filterType = ref('')
const filterProgress = ref('')
const filterDesigner = ref('')
const filterStatus = ref('')          // order.status: planning/in-progress/pending-review/done

const MILESTONE_OPTIONS = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5']
const RELEASE_OPTIONS = ['未排期', '主线', 'S1', 'S2', 'S3', 'S4', 'S5', '完全体']
const STATUS_OPTIONS = [
  { value: 'planning', label: '规划中' },
  { value: 'in-progress', label: '进行中' },
  { value: 'pending-review', label: '待验收' },
  { value: 'done', label: '完成' },
]

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [data, its] = await Promise.all([
      apiFetch('/api/production/orders'),
      apiFetch('/api/production/iterations').catch(() => ({ iterations: [] })),
    ])
    orders.value = data.orders || []
    iterations.value = its.iterations || []
  } catch (e) {
    error.value = e.message
    if (e.status === 403) error.value = '需要 production.readAll 权限'
    if (e.status === 401) error.value = '请先登录'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const uniqueDesigners = computed(() => [...new Set(orders.value.map(o => o.designer).filter(Boolean))].sort())
const uniqueProgress = computed(() => [...new Set(orders.value.map(o => o.progressStage).filter(Boolean))].sort())

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return orders.value.filter(o => {
    if (q) {
      const hit = String(o.lumiId).includes(q)
        || (o.name || '').toLowerCase().includes(q)
        || (o.pokedexId != null && String(o.pokedexId).includes(q))
      if (!hit) return false
    }
    if (filterMilestone.value && o.milestone !== filterMilestone.value) return false
    if (filterRelease.value && o.releaseStatus !== filterRelease.value) return false
    if (filterType.value && String(o.type1) !== filterType.value && String(o.type2) !== filterType.value) return false
    if (filterProgress.value && o.progressStage !== filterProgress.value) return false
    if (filterDesigner.value && o.designer !== filterDesigner.value) return false
    if (filterStatus.value && o.status !== filterStatus.value) return false
    return true
  })
})

// 编辑弹窗
const editing = ref(null)   // { mode, order }
function openCreate() { editing.value = { mode: 'create', order: null } }
function openEdit(o) { editing.value = { mode: 'edit', order: o } }
function onSaved() { editing.value = null; load() }
function onDeleted() { editing.value = null; load() }

// 排期弹窗
const scheduling = ref(null)  // 完整 order
async function openSchedule(o) {
  // 拉这只噜咪的完整 stages
  try {
    const { order } = await apiFetch(`/api/production/orders/${o.lumiId}`)
    scheduling.value = order
  } catch (e) {
    alert('拉取排期失败: ' + e.message)
  }
}
function onScheduleSaved() { scheduling.value = null; load() }

// TAPD 快跳
function goTapd(url) { if (url) window.open(url, '_blank') }

function typeColor(id) { return TYPE_COLORS[id] || '#666' }
function typeName(id) { return TYPE_NAMES[id] || '' }

function clearFilters() {
  searchQuery.value = ''
  filterMilestone.value = ''
  filterRelease.value = ''
  filterType.value = ''
  filterProgress.value = ''
  filterDesigner.value = ''
  filterStatus.value = ''
}
</script>

<template>
  <div class="dispatch-page">
    <div class="dispatch-header">
      <div>
        <h1 class="page-title">🗂️ 排期总览</h1>
        <p class="dispatch-subtitle">PM 视角 · 按噜咪管理排期 · 不展环节，只看 order 元数据</p>
      </div>
      <div class="dispatch-actions">
        <button v-if="canPm" class="btn-create" @click="openCreate">➕ 新增噜咪</button>
      </div>
    </div>

    <div v-if="error" class="error-box">⚠️ {{ error }}</div>

    <div v-else>
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <input v-model="searchQuery" placeholder="🔍 搜索名称 / ID / 图鉴号" />
        <select v-model="filterMilestone">
          <option value="">全部里程碑</option>
          <option v-for="m in MILESTONE_OPTIONS" :key="m" :value="m">{{ m }}</option>
        </select>
        <select v-model="filterRelease">
          <option value="">全部投放</option>
          <option v-for="r in RELEASE_OPTIONS" :key="r" :value="r">{{ r }}</option>
        </select>
        <select v-model="filterType">
          <option value="">全部属性</option>
          <option v-for="(name, id) in TYPE_NAMES" :key="id" :value="id">{{ name }}</option>
        </select>
        <select v-model="filterProgress">
          <option value="">全部进度</option>
          <option v-for="p in uniqueProgress" :key="p" :value="p">{{ p }}</option>
        </select>
        <select v-model="filterDesigner">
          <option value="">全部策划</option>
          <option v-for="d in uniqueDesigners" :key="d" :value="d">{{ d }}</option>
        </select>
        <select v-model="filterStatus">
          <option value="">全部状态</option>
          <option v-for="s in STATUS_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
        <button class="chip-clear" @click="clearFilters">清空</button>
        <span class="result-count">共 {{ filtered.length }} / {{ orders.length }} 只</span>
      </div>

      <div v-if="loading" class="loading">加载中...</div>

      <div v-else class="dispatch-table-wrap">
        <table class="dispatch-table">
          <thead>
            <tr>
              <th class="col-avatar"></th>
              <th class="col-name">噜咪</th>
              <th class="col-type">属性</th>
              <th class="col-narrow">里程碑</th>
              <th class="col-narrow">投放</th>
              <th class="col-narrow">进度</th>
              <th class="col-designer">策划</th>
              <th class="col-narrow">状态</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in filtered" :key="o.lumiId" class="dispatch-row">
              <td>
                <img
                  v-if="o.pokedexId != null"
                  :src="avatarUrl(o.lumiId)"
                  class="row-avatar"
                  loading="lazy"
                  @error="$event.target.style.display='none'"
                />
                <div v-else class="row-avatar row-avatar-empty" title="尚未入包">?</div>
              </td>
              <td class="col-name">
                <div class="row-name">
                  <span v-if="o.pokedexId != null" class="row-pokedex">#{{ o.pokedexId }}</span>
                  <span>{{ o.name || `#${o.lumiId}` }}</span>
                </div>
                <div class="row-sub">
                  <span class="row-id">id {{ o.lumiId }}</span>
                  <span v-if="o.tapdStoryUrl" class="row-tapd" @click="goTapd(o.tapdStoryUrl)">TAPD</span>
                </div>
              </td>
              <td class="col-type">
                <span
                  v-if="o.type1"
                  class="type-tag"
                  :style="{ background: typeColor(o.type1) }"
                >{{ typeName(o.type1) }}</span>
                <span
                  v-if="o.type2"
                  class="type-tag"
                  :style="{ background: typeColor(o.type2) }"
                >{{ typeName(o.type2) }}</span>
              </td>
              <td class="col-narrow">
                <span v-if="o.milestone" class="milestone-tag">{{ o.milestone }}</span>
              </td>
              <td class="col-narrow">
                <span v-if="o.releaseStatus" :class="['release-tag', `release-${o.releaseStatus}`]">
                  {{ o.releaseStatus }}
                </span>
              </td>
              <td class="col-narrow">
                <span v-if="o.progressStage" class="progress-tag">{{ o.progressStage }}</span>
              </td>
              <td class="col-designer">{{ o.designer || '-' }}</td>
              <td class="col-narrow">
                <span :class="['status-tag', `st-${o.status}`]">{{ (STATUS_OPTIONS.find(s => s.value === o.status) || {}).label || o.status }}</span>
              </td>
              <td class="col-actions">
                <button class="act-btn" @click="openEdit(o)" title="编辑元数据">✏️</button>
                <button class="act-btn" @click="openSchedule(o)" title="调整排期（环节 × 周版本）">📅</button>
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="9" class="empty">没有匹配的噜咪</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ProductionOrderEditor
      v-if="editing"
      :mode="editing.mode"
      :order="editing.order"
      :progress-options="uniqueProgress"
      :designer-options="uniqueDesigners"
      @close="editing = null"
      @saved="onSaved"
      @deleted="onDeleted"
    />

    <ProductionScheduleEditor
      v-if="scheduling"
      :order="scheduling"
      :iterations="iterations"
      @close="scheduling = null"
      @saved="onScheduleSaved"
    />
  </div>
</template>

<style scoped>
.dispatch-page { padding-bottom: 40px; }
.dispatch-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.dispatch-subtitle { color: var(--text-dim); font-size: 0.9em; margin-top: 4px; }
.btn-create {
  background: linear-gradient(135deg, #a493e0 0%, #764ba2 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9em;
  box-shadow: 0 2px 8px rgba(164, 147, 224, 0.35);
}
.btn-create:hover { filter: brightness(1.1); }
.error-box {
  padding: 16px;
  background: rgba(233, 69, 96, 0.1);
  border: 1px solid rgba(233, 69, 96, 0.3);
  border-radius: 8px;
  color: #ff8b95;
}

.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  align-items: center;
}
.filter-bar input, .filter-bar select {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--text);
  font-family: inherit;
  font-size: 0.85em;
  outline: none;
}
.filter-bar input:focus, .filter-bar select:focus { border-color: #a493e0; }
.chip-clear {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.85em;
  font-family: inherit;
}
.result-count {
  color: var(--text-dim);
  font-size: 0.85em;
  margin-left: auto;
}

.dispatch-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
}
.dispatch-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
  min-width: 1100px;
}
.dispatch-table thead th {
  background: rgba(0,0,0,0.2);
  color: #a493e0;
  padding: 10px;
  text-align: left;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 5;
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
}
.col-avatar { width: 50px; }
.col-name { min-width: 180px; }
.col-type { width: 100px; }
.col-narrow { width: 90px; text-align: center; }
.col-designer { min-width: 130px; }
.col-actions { width: 100px; text-align: right; }

.dispatch-row td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.dispatch-row:hover td { background: rgba(164,147,224,0.06); }

.row-avatar {
  width: 40px; height: 40px;
  border-radius: 6px;
  background: rgba(0,0,0,0.2);
  object-fit: contain;
}
.row-avatar-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
  font-size: 1.2em;
}
.row-name {
  color: #fff;
  font-weight: 600;
  display: flex;
  gap: 6px;
  align-items: baseline;
}
.row-pokedex { color: var(--text-dim); font-size: 0.85em; }
.row-sub {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 2px;
  font-size: 0.75em;
}
.row-id { color: var(--text-dim); }
.row-tapd {
  color: #a493e0;
  padding: 1px 6px;
  background: rgba(164,147,224,0.15);
  border-radius: 4px;
  cursor: pointer;
}
.row-tapd:hover { background: rgba(164,147,224,0.3); }

.type-tag {
  color: #fff;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 0.8em;
  margin-right: 4px;
  display: inline-block;
}
.milestone-tag {
  background: rgba(52, 152, 219, 0.15);
  color: #5dade2;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8em;
  font-weight: 600;
}
.progress-tag {
  background: rgba(46, 204, 113, 0.15);
  color: #4ade80;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8em;
  font-weight: 600;
}
.release-tag {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8em;
  font-weight: 600;
  background: rgba(155, 89, 182, 0.15);
  color: #bb8fce;
  display: inline-block;
}
.release-tag.release-未排期 { background: rgba(148,163,184,0.15); color: #94a3b8; }
.release-tag.release-完全体 { background: rgba(241,196,15,0.15); color: #f1c40f; }
.release-tag.release-主线 { background: rgba(46,204,113,0.15); color: #4ade80; }

.status-tag {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8em;
  font-weight: 600;
}
.status-tag.st-planning { background: rgba(100,100,100,0.2); color: #999; }
.status-tag.st-in-progress { background: rgba(52,152,219,0.15); color: #5dade2; }
.status-tag.st-pending-review { background: rgba(243,156,18,0.15); color: #f39c12; }
.status-tag.st-done { background: rgba(46,204,113,0.15); color: #4ade80; }

.act-btn {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--text);
  cursor: pointer;
  font-size: 1em;
  margin-left: 2px;
}
.act-btn:hover { border-color: #a493e0; background: rgba(164,147,224,0.1); }

.empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-dim);
}
</style>
