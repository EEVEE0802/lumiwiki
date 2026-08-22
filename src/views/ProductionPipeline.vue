<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiFetch } from '../data/api'
import { useAuth } from '../composables/useAuth'
import { TYPE_NAMES, TYPE_COLORS } from '../data'
import { avatarUrl } from '../data/imageUrl'
import ProductionStageEditor from '../components/ProductionStageEditor.vue'
import ProductionOrderEditor from '../components/ProductionOrderEditor.vue'

const { currentUser, hasPermission } = useAuth()
const canPm = computed(() => hasPermission('production.pm'))

const users = ref([])

const STAGE_META = [
  { key: 'combat',  label: '战设', color: '#e74c3c', icon: '⚔️' },
  { key: 'concept', label: '原画', color: '#f39c12', icon: '🎨' },
  { key: 'model',   label: '模型', color: '#e67e22', icon: '🧱' },
  { key: 'rigging', label: '绑定', color: '#d35400', icon: '🔗' },
  { key: 'anim',    label: '动作', color: '#c0392b', icon: '🎬' },
  { key: 'vfx',     label: '特效', color: '#9b59b6', icon: '✨' },
  { key: 'gui',     label: 'GUI',  color: '#3498db', icon: '🖼️' },
  { key: 'audio',   label: '音效', color: '#1abc9c', icon: '🎵' },
  { key: 'config',  label: '配置', color: '#16a085', icon: '⚙️' },
]

const STATUS_META = {
  'todo':           { label: '待办',   color: '#666' },
  'in-progress':    { label: '进行中', color: '#3498db' },
  'pending-review': { label: '待验收', color: '#f39c12' },
  'done':           { label: '完成',   color: '#27ae60' },
  'rejected':       { label: '打回',   color: '#e74c3c' },
}

const MILESTONE_OPTIONS = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5']
const RELEASE_OPTIONS = ['未排期', '主线', '完全体', 'S1', 'S2', 'S3', 'S4', 'S5']

const loading = ref(true)
const error = ref('')
const orders = ref([])

// 筛选
const searchQuery = ref('')
const filterMilestone = ref('')
const filterRelease = ref('')
const filterStageStatus = ref('')    // 某个环节的状态
const filterStageStatusStage = ref('') // 配合上面：过滤哪个环节
const filterDesigner = ref('')
const filterProgress = ref('')
const activeTab = ref('all')  // all / mine / active-week

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await apiFetch('/api/production/orders')
    orders.value = data.orders
    // 拉可指派用户列表（失败不阻塞主流程）
    try {
      const u = await apiFetch('/api/production/users')
      users.value = u.users || []
    } catch { /* ignore */ }
  } catch (e) {
    error.value = e.message
    if (e.status === 403) error.value = '没有生产管线查看权限（production.readAll），请联系管理员'
    if (e.status === 401) error.value = '请先登录再访问生产管线'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const uniqueDesigners = computed(() => {
  const set = new Set()
  for (const o of orders.value) if (o.designer) set.add(o.designer)
  return [...set].sort()
})

const uniqueProgress = computed(() => {
  const set = new Set()
  for (const o of orders.value) if (o.progressStage) set.add(o.progressStage)
  return [...set].sort()
})

// 是否本周活跃（planned 覆盖今天，或 status = in-progress / pending-review）
function isActiveThisWeek(order) {
  const today = new Date().toISOString().slice(0, 10)
  for (const st of Object.values(order.stages || {})) {
    if (st.status === 'in-progress' || st.status === 'pending-review') return true
    if (st.plannedStart && st.plannedEnd && st.plannedStart <= today && today <= st.plannedEnd) return true
  }
  return false
}

// 是否跟当前登录用户相关（负责策划 / 环节 assignee = 用户名）
function isRelatedToMe(order) {
  const u = currentUser.value?.username
  if (!u) return false
  if (order.designer && order.designer.includes(u)) return true
  for (const st of Object.values(order.stages || {})) {
    if (st.assignee === u) return true
  }
  return false
}

const filtered = computed(() => {
  let list = orders.value
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(o =>
      String(o.lumiId).includes(q) ||
      (o.name || '').toLowerCase().includes(q) ||
      (o.pokedexId != null && String(o.pokedexId).includes(q))
    )
  }
  if (filterMilestone.value) list = list.filter(o => o.milestone === filterMilestone.value)
  if (filterRelease.value) list = list.filter(o => o.releaseStatus === filterRelease.value)
  if (filterDesigner.value) list = list.filter(o => o.designer === filterDesigner.value)
  if (filterProgress.value) list = list.filter(o => o.progressStage === filterProgress.value)
  if (filterStageStatusStage.value && filterStageStatus.value) {
    list = list.filter(o => o.stages?.[filterStageStatusStage.value]?.status === filterStageStatus.value)
  } else if (filterStageStatus.value) {
    list = list.filter(o => Object.values(o.stages || {}).some(s => s.status === filterStageStatus.value))
  }
  if (activeTab.value === 'mine') list = list.filter(isRelatedToMe)
  if (activeTab.value === 'active-week') list = list.filter(isActiveThisWeek)
  return list
})

const counts = computed(() => ({
  all: orders.value.length,
  mine: orders.value.filter(isRelatedToMe).length,
  activeWeek: orders.value.filter(isActiveThisWeek).length,
  filtered: filtered.value.length,
}))

// 编辑弹窗
const editing = ref(null)  // { lumiId, stageType } | null
function openStageEditor(order, stage) {
  editing.value = { order, stageType: stage.key }
}
function onStageSaved() {
  editing.value = null
  load()
}

// Order 编辑器（新增 / 编辑元数据）
const orderEditor = ref(null)  // null | { mode, order }
function openCreateOrder() {
  orderEditor.value = { mode: 'create', order: null }
}
function openEditOrder(order) {
  orderEditor.value = { mode: 'edit', order }
}
function onOrderSaved() {
  orderEditor.value = null
  load()
}
function onOrderDeleted() {
  orderEditor.value = null
  load()
}

function typeName(id) { return TYPE_NAMES[id] || '' }
function typeColor(id) { return TYPE_COLORS[id] || '#666' }

function goToTapd(order) {
  if (order.tapdStoryUrl) window.open(order.tapdStoryUrl, '_blank')
}

function clearFilters() {
  searchQuery.value = ''
  filterMilestone.value = ''
  filterRelease.value = ''
  filterStageStatus.value = ''
  filterStageStatusStage.value = ''
  filterDesigner.value = ''
  filterProgress.value = ''
}
</script>

<template>
  <div class="prod-page">
    <div class="prod-header">
      <div>
        <h1 class="page-title">📋 生产管线</h1>
        <p class="prod-subtitle">噜咪生产全流程管理 · PM / 各环节协作 · 从腾讯文档导入</p>
      </div>
      <div class="prod-header-right">
        <button v-if="canPm" class="btn-create" @click="openCreateOrder">➕ 新增噜咪</button>
        <span v-if="currentUser" class="prod-user">👤 {{ currentUser.username }} · {{ currentUser.role }}</span>
      </div>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error-box">
      ⚠️ {{ error }}
    </div>
    <div v-else>
      <!-- Tabs -->
      <div class="tabs">
        <button
          :class="['tab', { active: activeTab === 'all' }]"
          @click="activeTab = 'all'"
        >
          全部 <span class="tab-count">{{ counts.all }}</span>
        </button>
        <button
          v-if="currentUser"
          :class="['tab', { active: activeTab === 'mine' }]"
          @click="activeTab = 'mine'"
        >
          我相关的 <span class="tab-count">{{ counts.mine }}</span>
        </button>
        <button
          :class="['tab', { active: activeTab === 'active-week' }]"
          @click="activeTab = 'active-week'"
        >
          本周活跃 <span class="tab-count">{{ counts.activeWeek }}</span>
        </button>
        <span class="filtered-count">当前筛选: {{ counts.filtered }} 条</span>
      </div>

      <!-- 筛选栏 -->
      <div class="filter-bar">
        <input v-model="searchQuery" placeholder="搜索名称 / ID / 图鉴号" />
        <select v-model="filterMilestone">
          <option value="">全部里程碑</option>
          <option v-for="m in MILESTONE_OPTIONS" :key="m" :value="m">{{ m }}</option>
        </select>
        <select v-model="filterRelease">
          <option value="">全部投放</option>
          <option v-for="r in RELEASE_OPTIONS" :key="r" :value="r">{{ r }}</option>
        </select>
        <select v-model="filterProgress">
          <option value="">全部进度</option>
          <option v-for="p in uniqueProgress" :key="p" :value="p">{{ p }}</option>
        </select>
        <select v-model="filterDesigner">
          <option value="">全部策划</option>
          <option v-for="d in uniqueDesigners" :key="d" :value="d">{{ d }}</option>
        </select>
        <select v-model="filterStageStatusStage">
          <option value="">全部环节</option>
          <option v-for="s in STAGE_META" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>
        <select v-model="filterStageStatus">
          <option value="">全部环节状态</option>
          <option v-for="(m, k) in STATUS_META" :key="k" :value="k">{{ m.label }}</option>
        </select>
        <button class="chip-clear" @click="clearFilters">清空筛选</button>
      </div>

      <!-- 图例 -->
      <div class="legend">
        <span class="legend-title">状态图例：</span>
        <span
          v-for="(m, k) in STATUS_META"
          :key="k"
          class="legend-item"
        >
          <span class="legend-dot" :style="{ background: m.color }"></span>{{ m.label }}
        </span>
      </div>

      <!-- 表格 -->
      <div class="prod-table-wrap">
        <table class="prod-table">
          <thead>
            <tr>
              <th class="col-meta">噜咪</th>
              <th class="col-narrow">里程碑</th>
              <th class="col-narrow">投放</th>
              <th class="col-narrow">进度</th>
              <th class="col-designer">策划</th>
              <th
                v-for="s in STAGE_META"
                :key="s.key"
                class="col-stage"
                :style="{ borderTopColor: s.color }"
                :title="s.label"
              >
                <span :style="{ color: s.color }">{{ s.icon }}</span> {{ s.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in filtered" :key="order.lumiId" class="prod-row">
              <td class="cell-lumi" @click="openEditOrder(order)">
                <img
                  v-if="order.pokedexId != null"
                  :src="avatarUrl(order.lumiId)"
                  class="cell-avatar"
                  loading="lazy"
                  @error="$event.target.style.display='none'"
                />
                <div class="cell-lumi-info">
                  <div class="cell-lumi-name">
                    <span v-if="order.pokedexId != null" class="cell-pokedex">#{{ order.pokedexId }}</span>
                    <span>{{ order.name || `#${order.lumiId}` }}</span>
                    <span v-if="canPm" class="cell-edit-hint" title="点击编辑元数据">✏️</span>
                  </div>
                  <div class="cell-lumi-sub">
                    <span
                      v-if="order.type1"
                      class="cell-type"
                      :style="{ background: typeColor(order.type1) }"
                    >{{ typeName(order.type1) }}</span>
                    <span v-if="order.tapdStoryUrl" class="cell-tapd" @click.stop="goToTapd(order)">TAPD</span>
                    <span class="cell-id">{{ order.lumiId }}</span>
                  </div>
                </div>
              </td>
              <td class="col-narrow">
                <span v-if="order.milestone" class="milestone-tag">{{ order.milestone }}</span>
              </td>
              <td class="col-narrow">
                <span v-if="order.releaseStatus" :class="['release-tag', `release-${order.releaseStatus}`]">
                  {{ order.releaseStatus }}
                </span>
              </td>
              <td class="col-narrow">
                <span v-if="order.progressStage" class="progress-tag">{{ order.progressStage }}</span>
              </td>
              <td class="col-designer">{{ order.designer || '-' }}</td>
              <td
                v-for="s in STAGE_META"
                :key="s.key"
                class="col-stage stage-cell"
                :class="{ 'has-data': order.stages[s.key] }"
                @click="openStageEditor(order, s)"
              >
                <template v-if="order.stages[s.key]">
                  <span
                    class="stage-dot"
                    :style="{ background: STATUS_META[order.stages[s.key].status]?.color || '#666' }"
                    :title="STATUS_META[order.stages[s.key].status]?.label"
                  ></span>
                  <span
                    v-if="order.stages[s.key].iterationCount"
                    class="stage-iter"
                    title="迭代次数"
                  >×{{ order.stages[s.key].iterationCount + 1 }}</span>
                  <div
                    v-if="order.stages[s.key].assignee"
                    class="stage-assignee"
                    :title="order.stages[s.key].assignee"
                  >{{ order.stages[s.key].assignee.slice(0, 6) }}</div>
                </template>
                <span v-else class="stage-empty">—</span>
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td :colspan="STAGE_META.length + 5" class="empty">
                没有匹配的噜咪
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ProductionStageEditor
      v-if="editing"
      :order="editing.order"
      :stage-type="editing.stageType"
      :stage-meta="STAGE_META"
      :status-meta="STATUS_META"
      :users="users"
      @close="editing = null"
      @saved="onStageSaved"
    />

    <ProductionOrderEditor
      v-if="orderEditor"
      :mode="orderEditor.mode"
      :order="orderEditor.order"
      :progress-options="uniqueProgress"
      :designer-options="uniqueDesigners"
      @close="orderEditor = null"
      @saved="onOrderSaved"
      @deleted="onOrderDeleted"
    />
  </div>
</template>

<style scoped>
.prod-page { padding-bottom: 40px; }
.prod-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}
.prod-subtitle {
  color: var(--text-dim);
  font-size: 0.9em;
  margin-top: 4px;
}
.prod-user {
  color: var(--text-dim);
  font-size: 0.9em;
}
.prod-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.btn-create {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9em;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.35);
}
.btn-create:hover { filter: brightness(1.1); }
.cell-lumi { cursor: pointer; }
.cell-edit-hint {
  opacity: 0;
  color: var(--text-dim);
  font-size: 0.75em;
  margin-left: 2px;
  transition: opacity 0.15s;
}
.cell-lumi:hover .cell-edit-hint { opacity: 0.7; }
.error-box {
  padding: 16px;
  background: rgba(233, 69, 96, 0.1);
  border: 1px solid rgba(233, 69, 96, 0.3);
  border-radius: 8px;
  color: #ff8b95;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  align-items: baseline;
  flex-wrap: wrap;
}
.tab {
  padding: 8px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px 8px 0 0;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.15s;
}
.tab:hover { color: var(--text); }
.tab.active {
  background: rgba(233, 69, 96, 0.12);
  color: var(--accent-light);
  border-color: var(--accent);
  border-bottom-color: transparent;
}
.tab-count {
  display: inline-block;
  background: rgba(255,255,255,0.08);
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 0.85em;
  margin-left: 4px;
}
.filtered-count {
  color: var(--text-dim);
  font-size: 0.85em;
  margin-left: auto;
}

/* 筛选栏 */
.filter-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.filter-bar input, .filter-bar select {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--text);
  font-family: inherit;
  font-size: 0.9em;
  outline: none;
}
.filter-bar input:focus, .filter-bar select:focus { border-color: var(--accent); }
.chip-clear {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--text-dim);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85em;
}
.chip-clear:hover { border-color: var(--accent); color: var(--accent); }

/* 图例 */
.legend {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 10px 14px;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 0.85em;
  flex-wrap: wrap;
}
.legend-title { color: var(--text-dim); }
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-dim);
}
.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

/* 表格 */
.prod-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
}
.prod-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85em;
  min-width: 1400px;
}
.prod-table thead th {
  background: rgba(0,0,0,0.2);
  color: var(--accent-light);
  padding: 10px 8px;
  text-align: left;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 5;
  border-bottom: 2px solid var(--border);
  border-top: 3px solid transparent;
  white-space: nowrap;
}
.col-meta { min-width: 200px; }
.col-narrow { width: 70px; text-align: center; }
.col-designer { min-width: 130px; }
.col-stage {
  min-width: 70px;
  text-align: center;
}
.prod-row td {
  padding: 8px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.prod-row:hover td { background: rgba(233, 69, 96, 0.04); }

/* 噜咪单元格 */
.cell-lumi { display: flex; gap: 10px; align-items: center; }
.cell-avatar {
  width: 40px; height: 40px;
  border-radius: 6px;
  object-fit: contain;
  background: rgba(0,0,0,0.15);
  flex-shrink: 0;
}
.cell-lumi-info { min-width: 0; }
.cell-lumi-name {
  color: #fff;
  font-weight: 600;
  display: flex;
  gap: 6px;
  align-items: baseline;
}
.cell-pokedex { color: var(--text-dim); font-size: 0.85em; }
.cell-lumi-sub {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 2px;
  font-size: 0.8em;
}
.cell-type {
  color: #fff;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 0.8em;
}
.cell-tapd {
  color: var(--accent-light);
  padding: 1px 6px;
  background: rgba(233,69,96,0.15);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8em;
}
.cell-tapd:hover { background: rgba(233,69,96,0.3); }
.cell-id { color: var(--text-dim); font-size: 0.8em; }

/* 里程碑 / 投放 / 进度 tag */
.milestone-tag, .progress-tag, .release-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8em;
  font-weight: 600;
}
.milestone-tag {
  background: rgba(52, 152, 219, 0.15);
  color: #5dade2;
}
.progress-tag {
  background: rgba(46, 204, 113, 0.15);
  color: #4ade80;
}
.release-tag {
  background: rgba(155, 89, 182, 0.15);
  color: #bb8fce;
}
.release-tag.release-未排期 {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
}
.release-tag.release-完全体 {
  background: rgba(241, 196, 15, 0.15);
  color: #f1c40f;
}
.release-tag.release-主线 {
  background: rgba(46, 204, 113, 0.15);
  color: #4ade80;
}

/* Stage cell */
.stage-cell {
  cursor: pointer;
  position: relative;
  min-height: 40px;
  padding: 4px 6px;
  border-left: 1px solid var(--border);
  transition: background 0.15s;
}
.stage-cell:hover { background: rgba(233,69,96,0.1); }
.stage-cell.has-data { background: rgba(255,255,255,0.02); }
.stage-dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(0,0,0,0.3);
}
.stage-iter {
  display: inline-block;
  color: #f39c12;
  font-size: 0.75em;
  margin-left: 4px;
  font-weight: 600;
}
.stage-assignee {
  color: var(--text-dim);
  font-size: 0.75em;
  margin-top: 2px;
}
.stage-empty { color: rgba(255,255,255,0.15); }
</style>
