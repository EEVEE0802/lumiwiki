<script setup>
// 生产看板 · 一维: 周版本(iteration) 一维: 生产职能(stage)
// - 普通职能成员: 默认看「本周 × 自己那一列」
// - PM/管理员: 顶部多个"职能筛选"，能切换看谁的
// - Tab: 未完成 / 已完成
// - 每张卡 = 一个 stage 记录 + 噜咪元数据（图鉴/属性/负责人/TAPD 链接）
//
// 数据源: /api/production/board（后端 join production_stages + production_orders + tapd_iterations）

import { ref, computed, onMounted, watch } from 'vue'
import { apiFetch } from '../data/api'
import { useAuth } from '../composables/useAuth'
import { TYPE_COLORS, TYPE_NAMES } from '../data'
import { avatarUrl } from '../data/imageUrl'

const { currentUser, hasPermission } = useAuth()
const canPm = computed(() => hasPermission('production.pm'))

// 环节映射
const STAGE_META = [
  { key: 'combat',  label: '策划设计', color: '#e74c3c', icon: '⚔️' },
  { key: 'concept', label: '原画',     color: '#f39c12', icon: '🎨' },
  { key: 'model',   label: '模型',     color: '#e67e22', icon: '🧱' },
  { key: 'anim',    label: '动作',     color: '#c0392b', icon: '🎬' },
  { key: 'vfx',     label: '特效',     color: '#9b59b6', icon: '✨' },
  { key: 'gui',     label: 'GUI',      color: '#3498db', icon: '🖼️' },
  { key: 'config',  label: '策划配置', color: '#16a085', icon: '⚙️' },
]
const STATUS_META = {
  'todo':           { label: '待办',   color: '#666' },
  'in-progress':    { label: '进行中', color: '#3498db' },
  'pending-review': { label: '待验收', color: '#f39c12' },
  'done':           { label: '完成',   color: '#27ae60' },
  'rejected':       { label: '打回',   color: '#e74c3c' },
}
const UNFINISHED_STATUSES = ['todo', 'in-progress', 'pending-review', 'rejected']

const loading = ref(true)
const error = ref('')
const iterations = ref([])
const cards = ref([])

const selectedIteration = ref(null)         // 当前选中的 iterationId
const selectedStage = ref('')                // 选中的 stageType；空 = 全部（PM 才有）
const activeTab = ref('unfinished')          // unfinished | done
const filterAssignee = ref('')

async function loadIterations() {
  try {
    const { iterations: its } = await apiFetch('/api/production/iterations')
    iterations.value = its || []
    // 默认选当前周（今天在 startdate ~ enddate 内的那个）
    const today = new Date().toISOString().slice(0, 10)
    let current = its.find(it => it.startdate && it.enddate && it.startdate <= today && today <= it.enddate)
    // 找不到就选最近未来的一个
    if (!current) current = its.find(it => it.startdate && it.startdate >= today)
    if (!current && its.length) current = its[0]
    selectedIteration.value = current?.id || null
  } catch (e) {
    console.warn('拉 iterations 失败:', e.message)
  }
}

async function loadBoard() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (selectedIteration.value) params.set('iterationId', selectedIteration.value)
    if (selectedStage.value) params.set('stageType', selectedStage.value)
    if (filterAssignee.value) params.set('assignee', filterAssignee.value)
    const url = `/api/production/board${params.toString() ? '?' + params : ''}`
    const data = await apiFetch(url)
    cards.value = data.cards || []
  } catch (e) {
    error.value = e.message
    if (e.status === 403) error.value = '没有生产看板查看权限（production.readAll），请联系管理员'
    if (e.status === 401) error.value = '请先登录再访问生产看板'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadIterations()
  await loadBoard()
})

watch([selectedIteration, selectedStage, filterAssignee], loadBoard)

// 卡片按 stageType 分栏（columns）
const displayedCards = computed(() => {
  const filterStatus = activeTab.value === 'done' ? ['done'] : UNFINISHED_STATUSES
  return cards.value.filter(c => filterStatus.includes(c.status))
})

const columns = computed(() => {
  // 如果选了单个 stage，就只显示那一列；否则显示全部
  const stages = selectedStage.value
    ? STAGE_META.filter(s => s.key === selectedStage.value)
    : STAGE_META
  const grouped = {}
  for (const s of stages) grouped[s.key] = []
  for (const c of displayedCards.value) {
    if (grouped[c.stageType]) grouped[c.stageType].push(c)
  }
  return stages.map(s => ({ ...s, cards: grouped[s.key] || [] }))
})

const totalUnfinished = computed(() => cards.value.filter(c => UNFINISHED_STATUSES.includes(c.status)).length)
const totalDone = computed(() => cards.value.filter(c => c.status === 'done').length)

// 周版本切换
const currentIterationName = computed(() => {
  const it = iterations.value.find(i => i.id === selectedIteration.value)
  return it?.name || '未选中'
})
function prevIteration() {
  const idx = iterations.value.findIndex(i => i.id === selectedIteration.value)
  if (idx >= 0 && idx < iterations.value.length - 1) selectedIteration.value = iterations.value[idx + 1].id
}
function nextIteration() {
  const idx = iterations.value.findIndex(i => i.id === selectedIteration.value)
  if (idx > 0) selectedIteration.value = iterations.value[idx - 1].id
}

function typeColor(id) { return TYPE_COLORS[id] || '#666' }
function typeName(id) { return TYPE_NAMES[id] || '' }
function goToTapd(url) { if (url) window.open(url, '_blank') }

// 我相关的：designer 是我 或 stage.assignee 是我
function isMineCard(c) {
  const u = currentUser.value?.username
  if (!u) return false
  return c.assignee === u || (c.designer && c.designer.includes(u))
}
</script>

<template>
  <div class="kanban-page">
    <div class="kanban-header">
      <div>
        <h1 class="page-title">📋 生产看板</h1>
        <p class="kanban-subtitle">按周版本 × 生产职能查看任务 · 数据源 TAPD</p>
      </div>
      <div class="kanban-user" v-if="currentUser">
        👤 {{ currentUser.username }} · {{ currentUser.role }}
      </div>
    </div>

    <div v-if="error" class="error-box">⚠️ {{ error }}</div>

    <div v-else>
      <!-- 周版本切换 -->
      <div class="iteration-bar">
        <button class="nav-arrow" @click="prevIteration" title="上一周">◀</button>
        <select v-model="selectedIteration" class="iteration-select">
          <option v-for="it in iterations" :key="it.id" :value="it.id">
            {{ it.name }} ({{ it.startdate }} ~ {{ it.enddate }})
          </option>
        </select>
        <button class="nav-arrow" @click="nextIteration" title="下一周">▶</button>
        <span class="iteration-tag" v-if="currentIterationName">{{ currentIterationName }}</span>
      </div>

      <!-- 职能筛选 -->
      <div class="stage-bar">
        <span class="bar-label">职能：</span>
        <button
          :class="['stage-chip', { active: selectedStage === '' }]"
          @click="selectedStage = ''"
        >全部</button>
        <button
          v-for="s in STAGE_META"
          :key="s.key"
          :class="['stage-chip', { active: selectedStage === s.key }]"
          :style="selectedStage === s.key ? { borderColor: s.color, color: s.color } : {}"
          @click="selectedStage = s.key"
        >
          <span :style="{ color: s.color }">{{ s.icon }}</span> {{ s.label }}
        </button>
        <span class="filter-assignee" v-if="canPm">
          <input v-model="filterAssignee" placeholder="🔍 筛负责人" />
        </span>
      </div>

      <!-- Tab -->
      <div class="tabs">
        <button
          :class="['tab', { active: activeTab === 'unfinished' }]"
          @click="activeTab = 'unfinished'"
        >未完成 <span class="tab-count">{{ totalUnfinished }}</span></button>
        <button
          :class="['tab', { active: activeTab === 'done' }]"
          @click="activeTab = 'done'"
        >✅ 已完成 <span class="tab-count">{{ totalDone }}</span></button>
      </div>

      <div v-if="loading" class="loading">加载中...</div>

      <!-- 主视图：分栏卡片 -->
      <div v-else class="kanban-columns" :class="{ 'single-col': columns.length === 1 }">
        <div v-for="col in columns" :key="col.key" class="kanban-col">
          <div class="kanban-col-header" :style="{ borderTopColor: col.color }">
            <span :style="{ color: col.color }">{{ col.icon }}</span>
            {{ col.label }}
            <span class="col-count">{{ col.cards.length }}</span>
          </div>
          <div class="kanban-col-body">
            <div v-if="!col.cards.length" class="col-empty">— 无任务 —</div>
            <div
              v-for="c in col.cards"
              :key="c.lumiId + ':' + c.stageType"
              class="kanban-card"
              :class="{ 'is-mine': isMineCard(c) }"
            >
              <div class="card-head">
                <img
                  v-if="c.pokedexId != null"
                  :src="avatarUrl(c.lumiId)"
                  class="card-avatar"
                  loading="lazy"
                  @error="$event.target.style.display='none'"
                />
                <div class="card-title">
                  <div class="card-name">
                    <span v-if="c.pokedexId != null" class="card-pokedex">#{{ c.pokedexId }}</span>
                    {{ c.orderName || `#${c.lumiId}` }}
                  </div>
                  <div class="card-meta">
                    <span
                      v-if="c.type1"
                      class="card-type"
                      :style="{ background: typeColor(c.type1) }"
                    >{{ typeName(c.type1) }}</span>
                    <span v-if="c.milestone" class="card-milestone">{{ c.milestone }}</span>
                  </div>
                </div>
              </div>
              <div class="card-status-row">
                <span
                  class="card-status"
                  :style="{ background: STATUS_META[c.status]?.color }"
                >{{ STATUS_META[c.status]?.label }}</span>
                <span v-if="c.iterationCount > 0" class="card-iter" title="返工次数">🔁 ×{{ c.iterationCount }}</span>
                <span v-if="c.assignee" class="card-assignee" :title="`负责人：${c.assignee}`">👤 {{ c.assignee }}</span>
              </div>
              <div v-if="c.plannedStart" class="card-planned">
                📅 {{ c.plannedStart }} ~ {{ c.plannedEnd }}
              </div>
              <div class="card-footer">
                <span
                  v-if="c.tapdStoryUrl"
                  class="card-tapd"
                  @click="goToTapd(c.tapdStoryUrl)"
                >TAPD 总单</span>
                <span
                  v-if="c.tapdSubStoryId"
                  class="card-tapd"
                  @click="goToTapd(`https://www.tapd.cn/${46491618}/prong/stories/view/${c.tapdSubStoryId}`)"
                >TAPD 子单</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kanban-page { padding-bottom: 40px; }
.kanban-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.kanban-subtitle {
  color: var(--text-dim);
  font-size: 0.9em;
  margin-top: 4px;
}
.kanban-user { color: var(--text-dim); font-size: 0.9em; }
.error-box {
  padding: 16px;
  background: rgba(233, 69, 96, 0.1);
  border: 1px solid rgba(233, 69, 96, 0.3);
  border-radius: 8px;
  color: #ff8b95;
}

/* 周版本切换 */
.iteration-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.iteration-select {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--text);
  min-width: 320px;
  font-family: inherit;
}
.nav-arrow {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--text);
  cursor: pointer;
  font-size: 0.85em;
}
.nav-arrow:hover { border-color: var(--accent); color: var(--accent); }
.iteration-tag {
  background: rgba(233, 69, 96, 0.15);
  color: var(--accent-light);
  padding: 4px 10px;
  border-radius: 10px;
  font-size: 0.85em;
  font-weight: 600;
}

/* 职能筛选 */
.stage-bar {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.bar-label { color: var(--text-dim); font-size: 0.85em; }
.stage-chip {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 4px 12px;
  color: var(--text);
  font-size: 0.85em;
  cursor: pointer;
  font-family: inherit;
}
.stage-chip:hover { border-color: var(--accent); }
.stage-chip.active {
  background: rgba(233, 69, 96, 0.15);
  border-color: var(--accent);
  color: var(--accent-light);
  font-weight: 600;
}
.filter-assignee input {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 12px;
  color: var(--text);
  font-family: inherit;
  font-size: 0.85em;
}

/* Tab */
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.tab {
  padding: 6px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.9em;
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

/* 分栏卡片视图 */
.kanban-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
  align-items: start;
}
.kanban-columns.single-col { grid-template-columns: 1fr; max-width: 700px; margin: 0 auto; }

.kanban-col {
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.kanban-col-header {
  padding: 10px 14px;
  border-top: 3px solid transparent;
  border-bottom: 1px solid var(--border);
  background: rgba(0,0,0,0.2);
  color: #fff;
  font-weight: 600;
  font-size: 0.95em;
  display: flex;
  gap: 6px;
  align-items: center;
}
.col-count {
  margin-left: auto;
  background: rgba(255,255,255,0.08);
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 0.85em;
  font-weight: normal;
}
.kanban-col-body {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 120px;
}
.col-empty {
  text-align: center;
  padding: 40px 10px;
  color: var(--text-dim);
  font-size: 0.85em;
}

.kanban-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.15s;
}
.kanban-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(233, 69, 96, 0.1);
}
.kanban-card.is-mine {
  border-left: 3px solid var(--accent);
}

.card-head { display: flex; gap: 10px; align-items: center; }
.card-avatar {
  width: 40px; height: 40px; border-radius: 6px;
  background: rgba(0,0,0,0.2);
  object-fit: contain;
  flex-shrink: 0;
}
.card-title { flex: 1; min-width: 0; }
.card-name {
  color: #fff;
  font-weight: 600;
  font-size: 0.95em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-pokedex { color: var(--text-dim); font-size: 0.85em; margin-right: 6px; }
.card-meta { display: flex; gap: 4px; margin-top: 3px; font-size: 0.75em; }
.card-type { color: #fff; padding: 1px 6px; border-radius: 4px; }
.card-milestone {
  background: rgba(52,152,219,0.15);
  color: #5dade2;
  padding: 1px 6px;
  border-radius: 4px;
}

.card-status-row {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 0.8em;
  flex-wrap: wrap;
}
.card-status {
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8em;
}
.card-iter { color: #f39c12; font-weight: 600; }
.card-assignee {
  color: var(--text-dim);
  background: rgba(255,255,255,0.04);
  padding: 1px 8px;
  border-radius: 6px;
}
.card-planned {
  color: var(--text-dim);
  font-size: 0.75em;
}
.card-footer {
  display: flex;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.05);
  font-size: 0.75em;
}
.card-tapd {
  color: var(--accent-light);
  cursor: pointer;
  padding: 2px 8px;
  background: rgba(233,69,96,0.1);
  border-radius: 4px;
}
.card-tapd:hover { background: rgba(233,69,96,0.25); }
</style>
