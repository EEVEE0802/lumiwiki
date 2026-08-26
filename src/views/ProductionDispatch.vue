<script setup>
// 生产协作站 · 排期总览页
// 状态 3 tab：未排期（7 环节都没排周） / 未完成 / 已完成
// 里程碑单选：未安排 / M0…M5
// 视图规则：
//   · 未完成 × 具体里程碑（M0…M5） → 周版本时间轴
//   · 其他所有组合（未排期 / 已完成 / 里程碑=未安排） → 卡片流铺开
// 完成判定：7 个 stage 全部 status === 'done'

import { ref, computed, onMounted } from 'vue'
import { apiFetch } from '../data/api'
import { useAuth } from '../composables/useAuth'
import { TYPE_NAMES } from '../data'
import ProductionOrderEditor from '../components/ProductionOrderEditor.vue'
import ProductionScheduleEditor from '../components/ProductionScheduleEditor.vue'
import ProductionLumiCard from '../components/ProductionLumiCard.vue'

const { hasPermission } = useAuth()
const canPm = computed(() => hasPermission('production.pm'))

const STAGE_META = [
  { key: 'combat',  label: '策划设计', color: '#e74c3c', icon: '⚔️' },
  { key: 'concept', label: '原画',     color: '#f39c12', icon: '🎨' },
  { key: 'model',   label: '模型',     color: '#e67e22', icon: '🧱' },
  { key: 'anim',    label: '动作',     color: '#c0392b', icon: '🎬' },
  { key: 'vfx',     label: '特效',     color: '#9b59b6', icon: '✨' },
  { key: 'gui',     label: 'GUI',      color: '#3498db', icon: '🖼️' },
  { key: 'config',  label: '策划配置', color: '#16a085', icon: '⚙️' },
]
const STAGE_TYPES = STAGE_META.map(s => s.key)

const STATUS_META = {
  'todo':           { label: '待办',   color: '#666' },
  'in-progress':    { label: '进行中', color: '#3498db' },
  'pending-review': { label: '待验收', color: '#f39c12' },
  'done':           { label: '完成',   color: '#27ae60' },
  'rejected':       { label: '打回',   color: '#e74c3c' },
}

// 赛季 tab（用 releaseStatus 字段）：'未排期' 代表还没决定投放赛季的噜咪
const RELEASE_TABS = ['未排期', '主线', 'S1', 'S2', 'S3', 'S4', 'S5', '完全体']

const STATUS_TABS = [
  { key: 'unscheduled', label: '⏸ 未排期', desc: '7 环节都没排周版本' },
  { key: 'unfinished',  label: '⏳ 未完成', desc: '至少一个环节已排周，仍未全部完成' },
  { key: 'done',        label: '✅ 已完成', desc: '7 个环节全部标记为完成' },
]

const orders = ref([])
const iterations = ref([])
const loading = ref(true)
const error = ref('')

const activeRelease = ref('S1')             // 未排期 / 主线 / S1…S5 / 完全体
const anchorMode = ref('start')             // 'start' | 'end'
const activeStatus = ref('unfinished')      // 'unscheduled' | 'unfinished' | 'done'

const searchQuery = ref('')
const filterType = ref('')
const filterProgress = ref('')
const filterDesigner = ref('')

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

const iterationsAsc = computed(() => [...iterations.value].reverse())
const iterationMap = computed(() => {
  const m = new Map()
  for (const it of iterationsAsc.value) m.set(it.id, it)
  return m
})

// 拿到实际存在且"计入统计"的 stage：
// 排除 import-script 早期占位（有 stage 行但 tapdSubStoryId 为空 = TAPD 那边没这条子单，用户也没填过）
// 这样"该环节不适用"（例如异色版没特效单）就不会阻塞已完成判定
function existingStages(order) {
  return STAGE_TYPES
    .map(k => order.stages?.[k])
    .filter(s => s && s.tapdSubStoryId)
}
function hasAnySchedule(order) {
  return existingStages(order).some(s => s.tapdIterationId)
}
function isDone(order) {
  const stages = existingStages(order)
  if (!stages.length) return false   // 一个 stage 记录都没 = 还没开动，不算完成
  return stages.every(s => s.status === 'done')
}
function classifyOrder(order) {
  if (isDone(order)) return 'done'
  if (!hasAnySchedule(order)) return 'unscheduled'
  return 'unfinished'
}

function anchorIteration(order, mode) {
  const scheduled = STAGE_TYPES
    .map(k => order.stages?.[k])
    .filter(s => s && s.tapdIterationId && iterationMap.value.has(s.tapdIterationId))
  if (!scheduled.length) return null
  let best = null
  for (const s of scheduled) {
    const it = iterationMap.value.get(s.tapdIterationId)
    if (!best) { best = it; continue }
    if (mode === 'start') {
      if ((it.startdate || '') < (best.startdate || '')) best = it
    } else {
      if ((it.enddate || '') > (best.enddate || '')) best = it
    }
  }
  return best
}

// 基础筛选：搜索 / 属性 / 进度 / 策划
const baseFiltered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return orders.value.filter(o => {
    if (q) {
      const hit = String(o.lumiId).includes(q)
        || (o.name || '').toLowerCase().includes(q)
        || (o.pokedexId != null && String(o.pokedexId).includes(q))
      if (!hit) return false
    }
    if (filterType.value && String(o.type1) !== filterType.value && String(o.type2) !== filterType.value) return false
    if (filterProgress.value && o.progressStage !== filterProgress.value) return false
    if (filterDesigner.value && o.designer !== filterDesigner.value) return false
    return true
  })
})

// 赛季筛选（tab）
const releaseBase = computed(() =>
  baseFiltered.value.filter(o => o.releaseStatus === activeRelease.value)
)

// 3 分区
const statusPartitions = computed(() => {
  const unscheduled = []
  const unfinished = []
  const done = []
  for (const o of releaseBase.value) {
    const cat = classifyOrder(o)
    if (cat === 'done') done.push(o)
    else if (cat === 'unscheduled') unscheduled.push(o)
    else unfinished.push(o)
  }
  return { unscheduled, unfinished, done }
})

const displayOrders = computed(() => statusPartitions.value[activeStatus.value] || [])

// 时间轴视图条件：只在「未完成」状态下展开时间轴
const showTimeline = computed(() => activeStatus.value === 'unfinished')

const placedOrders = computed(() => {
  if (!showTimeline.value) return []
  return displayOrders.value.map(o => ({ order: o, anchor: anchorIteration(o, anchorMode.value) }))
})

// 今日周版本
const todayIterationId = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  const it = iterationsAsc.value.find(i => i.startdate && i.enddate && i.startdate <= today && today <= i.enddate)
  return it?.id || null
})

// 可见周版本列（时间轴模式）：min anchor.startdate ~ max anchor.startdate，含今日
const visibleIterations = computed(() => {
  if (!showTimeline.value) return []
  const anchorIds = new Set()
  for (const p of placedOrders.value) if (p.anchor) anchorIds.add(p.anchor.id)
  if (todayIterationId.value) anchorIds.add(todayIterationId.value)
  const anchored = iterationsAsc.value.filter(it => anchorIds.has(it.id))
  if (!anchored.length) return []
  const dates = anchored.map(it => it.startdate).filter(Boolean).sort()
  const minStart = dates[0]
  const maxStart = dates[dates.length - 1]
  return iterationsAsc.value.filter(it =>
    it.startdate && it.startdate >= minStart && it.startdate <= maxStart
  )
})

// 时间轴模式：把 placedOrders 按 iteration 分格
const timelineLayout = computed(() => {
  if (!showTimeline.value) return null
  const byIter = new Map()
  for (const p of placedOrders.value) {
    if (!p.anchor) continue   // 时间轴模式下不该出现（未完成的一定有排期），保险
    const arr = byIter.get(p.anchor.id) || []
    arr.push(p.order)
    byIter.set(p.anchor.id, arr)
  }
  return byIter
})

// 各状态数量（在当前里程碑下）
const statusCounts = computed(() => ({
  unscheduled: statusPartitions.value.unscheduled.length,
  unfinished: statusPartitions.value.unfinished.length,
  done: statusPartitions.value.done.length,
}))

// 编辑弹窗
const editing = ref(null)
function openCreate() { editing.value = { mode: 'create', order: null } }
function openEdit(o) { editing.value = { mode: 'edit', order: o } }
function onSaved() { editing.value = null; load() }
function onDeleted() { editing.value = null; load() }

// 排期弹窗
const scheduling = ref(null)
async function openSchedule(o) {
  try {
    const { order } = await apiFetch(`/api/production/orders/${o.lumiId}`)
    scheduling.value = order
  } catch (e) {
    alert('拉取排期失败: ' + e.message)
  }
}
function onScheduleSaved() { scheduling.value = null; load() }

function goTapd(url) { if (url) window.open(url, '_blank') }

function clearFilters() {
  searchQuery.value = ''
  filterType.value = ''
  filterProgress.value = ''
  filterDesigner.value = ''
}
</script>

<template>
  <div class="dispatch-page">
    <div class="dispatch-header">
      <div>
        <h1 class="page-title">🗂️ 排期总览</h1>
        <p class="dispatch-subtitle">按赛季 × 状态查看噜咪排期 · 未完成的走周版本时间轴</p>
      </div>
      <div class="dispatch-actions">
        <button v-if="canPm" class="btn-create" @click="openCreate">➕ 新增噜咪</button>
      </div>
    </div>

    <div v-if="error" class="error-box">⚠️ {{ error }}</div>

    <div v-else>
      <!-- 赛季 tab -->
      <div class="ms-tabs">
        <span class="bar-label">赛季：</span>
        <button
          v-for="r in RELEASE_TABS"
          :key="r"
          :class="['ms-tab', { active: activeRelease === r }]"
          @click="activeRelease = r"
        >{{ r }}</button>
      </div>

      <!-- 状态 tab -->
      <div class="tabs">
        <button
          v-for="s in STATUS_TABS"
          :key="s.key"
          :class="['tab', { active: activeStatus === s.key }]"
          :title="s.desc"
          @click="activeStatus = s.key"
        >{{ s.label }} <span class="tab-count">{{ statusCounts[s.key] }}</span></button>
      </div>

      <!-- 锚点模式（只在时间轴视图显示） -->
      <div v-if="showTimeline" class="anchor-bar">
        <span class="bar-label">时间轴锚点：</span>
        <button
          :class="['mode-chip', { active: anchorMode === 'start' }]"
          @click="anchorMode = 'start'"
        >📌 按开始时间</button>
        <button
          :class="['mode-chip', { active: anchorMode === 'end' }]"
          @click="anchorMode = 'end'"
        >🏁 按结束时间</button>
        <span class="mode-hint">{{ anchorMode === 'start' ? '取子单最早的那周' : '取子单最晚的那周' }}</span>
      </div>

      <!-- 筛选 -->
      <div class="filter-bar">
        <input v-model="searchQuery" placeholder="🔍 搜索名称 / ID / 图鉴号" />
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
        <button class="chip-clear" @click="clearFilters">清空</button>
        <span class="result-count">共 {{ displayOrders.length }} 只</span>
      </div>

      <div v-if="loading" class="loading">加载中...</div>

      <div v-else-if="!displayOrders.length" class="empty">— 当前条件下没有噜咪 —</div>

      <!-- 时间轴视图（未完成 tab） -->
      <div
        v-else-if="showTimeline"
        class="board-scroll"
        :style="{ '--iter-count': visibleIterations.length }"
      >
        <div class="board-row board-header">
          <div
            v-for="it in visibleIterations"
            :key="it.id"
            class="col-head"
            :class="{ 'is-today': it.id === todayIterationId }"
          >
            <div class="col-head-name">
              <span v-if="it.id === todayIterationId" class="today-tag">📍 本周</span>
              {{ it.name }}
            </div>
            <div class="col-head-date">{{ it.startdate }} ~ {{ it.enddate }}</div>
          </div>
        </div>
        <div class="board-row">
          <div
            v-for="it in visibleIterations"
            :key="it.id"
            class="cell"
            :class="{ 'is-today': it.id === todayIterationId }"
          >
            <ProductionLumiCard
              v-for="o in (timelineLayout.get(it.id) || [])"
              :key="o.lumiId"
              :order="o"
              :stage-meta="STAGE_META"
              :status-meta="STATUS_META"
              :iteration-map="iterationMap"
              @edit="openEdit"
              @schedule="openSchedule"
              @tapd="goTapd"
            />
          </div>
        </div>
      </div>

      <!-- 卡片流视图（未排期 / 已完成 / 未安排里程碑） -->
      <div v-else class="flat-grid">
        <ProductionLumiCard
          v-for="o in displayOrders"
          :key="o.lumiId"
          :order="o"
          :stage-meta="STAGE_META"
          :status-meta="STATUS_META"
          :iteration-map="iterationMap"
          @edit="openEdit"
          @schedule="openSchedule"
          @tapd="goTapd"
        />
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

/* 里程碑 tab */
.ms-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  align-items: center;
}
.ms-tab {
  padding: 6px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.9em;
  font-family: inherit;
  font-weight: 600;
}
.ms-tab:hover { border-color: #5dade2; color: #5dade2; }
.ms-tab.active {
  background: rgba(52, 152, 219, 0.15);
  color: #5dade2;
  border-color: #5dade2;
}

/* 状态 tab */
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.tab {
  padding: 6px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.9em;
  font-family: inherit;
}
.tab.active {
  background: rgba(233, 69, 96, 0.12);
  color: var(--accent-light);
  border-color: var(--accent);
}
.tab-count {
  background: rgba(255,255,255,0.08);
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 0.85em;
  margin-left: 4px;
}

/* 锚点模式 */
.anchor-bar {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.bar-label { color: var(--text-dim); font-size: 0.85em; }
.mode-chip {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 4px 12px;
  color: var(--text);
  font-size: 0.85em;
  cursor: pointer;
  font-family: inherit;
}
.mode-chip:hover { border-color: #a493e0; }
.mode-chip.active {
  background: rgba(164, 147, 224, 0.15);
  border-color: #a493e0;
  color: #d1c3f0;
  font-weight: 600;
}
.mode-hint { color: var(--text-dim); font-size: 0.8em; margin-left: 8px; }

/* 筛选 */
.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
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
.result-count { color: var(--text-dim); font-size: 0.85em; margin-left: auto; }

.loading { padding: 40px; text-align: center; color: var(--text-dim); }
.empty {
  padding: 40px;
  text-align: center;
  color: var(--text-dim);
  border: 1px dashed var(--border);
  border-radius: 8px;
}

/* 卡片流视图 */
.flat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(255,255,255,0.02);
}

/* 时间轴视图 */
.board-scroll {
  overflow-x: auto;
  overflow-y: visible;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(255,255,255,0.02);
}
.board-row {
  display: grid;
  grid-template-columns: repeat(var(--iter-count), 260px);
  align-items: stretch;
}
.board-header { position: sticky; top: 0; z-index: 4; }
.col-head {
  padding: 10px 12px;
  border-right: 1px solid var(--border);
  border-bottom: 2px solid var(--border);
  background: rgba(0,0,0,0.25);
}
.col-head:last-child { border-right: none; }
.col-head.is-today {
  background: rgba(233, 69, 96, 0.12);
  border-bottom-color: var(--accent);
}
.col-head-name {
  color: #fff;
  font-weight: 600;
  font-size: 0.9em;
  display: flex;
  align-items: center;
  gap: 4px;
}
.col-head-date { color: var(--text-dim); font-size: 0.72em; margin-top: 2px; }
.today-tag {
  background: var(--accent);
  color: #fff;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.72em;
}

.cell {
  padding: 8px;
  border-right: 1px solid var(--border);
  min-height: 120px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cell:last-child { border-right: none; }
.cell.is-today { background: rgba(233, 69, 96, 0.04); }
</style>
