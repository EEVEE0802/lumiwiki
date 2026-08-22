<script setup>
// 生产管线甘特图视图
// 横向按周展示，一列一周（跟腾讯文档一致），每只噜咪一行
// 每个 stage 在时间轴上是一个色块，从 plannedStart → plannedEnd
// 拖左端改开始日期、拖右端改结束日期、拖中间整体平移；点击色块打开 StageEditor
//
// 数据不依赖第三方甘特库，用纯 CSS grid + 简单 DOM 事件实现

import { ref, computed } from 'vue'
import { apiFetch } from '../data/api'
import { useAuth } from '../composables/useAuth'

const props = defineProps({
  orders: { type: Array, required: true },
  stageMeta: { type: Array, required: true },
  statusMeta: { type: Object, required: true },
})
const emit = defineEmits(['stage-click', 'refresh'])

const { hasPermission } = useAuth()
const CELL_W = 40         // 每周一列的宽度 px
const ROW_H = 44          // 每行高度
const LABEL_W = 200       // 左侧噜咪列宽度

// 一天的毫秒数
const DAY_MS = 24 * 60 * 60 * 1000

// 时间轴范围：所有 stage plannedStart/End 的 min/max，兜底为今天前后 12 周
const timeline = computed(() => {
  let minDate = null
  let maxDate = null
  for (const o of props.orders) {
    for (const st of Object.values(o.stages || {})) {
      if (st.plannedStart) {
        const d = new Date(st.plannedStart)
        if (!minDate || d < minDate) minDate = d
      }
      if (st.plannedEnd) {
        const d = new Date(st.plannedEnd)
        if (!maxDate || d > maxDate) maxDate = d
      }
    }
  }
  const now = new Date()
  if (!minDate) minDate = new Date(now.getTime() - 12 * 7 * DAY_MS)
  if (!maxDate) maxDate = new Date(now.getTime() + 12 * 7 * DAY_MS)
  // 前后各 padding 2 周
  minDate = new Date(minDate.getTime() - 2 * 7 * DAY_MS)
  maxDate = new Date(maxDate.getTime() + 2 * 7 * DAY_MS)
  // 对齐到周一
  const dayOfWeek = (d) => (d.getDay() + 6) % 7  // 周一 = 0
  minDate.setDate(minDate.getDate() - dayOfWeek(minDate))
  minDate.setHours(0, 0, 0, 0)
  maxDate.setDate(maxDate.getDate() + (6 - dayOfWeek(maxDate)))
  maxDate.setHours(0, 0, 0, 0)
  const totalDays = Math.round((maxDate - minDate) / DAY_MS) + 1
  const totalWeeks = Math.ceil(totalDays / 7)
  return { minDate, maxDate, totalDays, totalWeeks }
})

// 为每一周生成表头信息（月份切换时高亮）
const weeks = computed(() => {
  const arr = []
  const { minDate, totalWeeks } = timeline.value
  for (let i = 0; i < totalWeeks; i++) {
    const d = new Date(minDate.getTime() + i * 7 * DAY_MS)
    const mm = d.getMonth() + 1
    const dd = d.getDate()
    // 每月第一个包含 1-7 号的那周标注月份
    const showMonth = dd <= 7
    arr.push({
      idx: i,
      iso: d.toISOString().slice(0, 10),
      label: `${mm}/${dd}`,
      showMonth,
      monthLabel: `${d.getFullYear()}-${String(mm).padStart(2,'0')}`,
    })
  }
  return arr
})

const totalWidth = computed(() => LABEL_W + timeline.value.totalWeeks * CELL_W)

// 今天在时间轴上的 X 偏移（px，相对时间轴起点，不含 LABEL_W）
const todayOffset = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((today - timeline.value.minDate) / DAY_MS)
  return days * (CELL_W / 7)
})

// 计算 stage 色块 style: left / width
function stageBarStyle(stage) {
  if (!stage || !stage.plannedStart || !stage.plannedEnd) return null
  const start = new Date(stage.plannedStart)
  const end = new Date(stage.plannedEnd)
  const startDays = (start - timeline.value.minDate) / DAY_MS
  const endDays = (end - timeline.value.minDate) / DAY_MS + 1  // 包含结束日
  const leftPx = startDays * (CELL_W / 7)
  const widthPx = Math.max((endDays - startDays) * (CELL_W / 7), 8)
  return { left: leftPx + 'px', width: widthPx + 'px' }
}

function stageColor(stage) {
  const meta = props.stageMeta.find(s => s.key === stage.stageType)
  return meta?.color || '#666'
}

// 拖拽状态
const dragging = ref(null)   // { order, stage, mode: 'start' | 'end' | 'move', startX, initialStart, initialEnd }
const canDrag = computed(() => hasPermission('production.pm'))

function pxToDays(px) {
  return px / (CELL_W / 7)
}
function shiftDate(iso, deltaDays) {
  const d = new Date(iso)
  d.setDate(d.getDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function onDragStart(evt, order, stage, mode) {
  if (!canDrag.value || !stage.plannedStart || !stage.plannedEnd) return
  evt.preventDefault()
  evt.stopPropagation()
  dragging.value = {
    order, stage, mode,
    startX: evt.clientX,
    initialStart: stage.plannedStart,
    initialEnd: stage.plannedEnd,
    // 预览用
    previewStart: stage.plannedStart,
    previewEnd: stage.plannedEnd,
  }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(evt) {
  if (!dragging.value) return
  const d = dragging.value
  const deltaDays = Math.round(pxToDays(evt.clientX - d.startX))
  if (d.mode === 'start') {
    const ns = shiftDate(d.initialStart, deltaDays)
    if (ns <= d.initialEnd) d.previewStart = ns
  } else if (d.mode === 'end') {
    const ne = shiftDate(d.initialEnd, deltaDays)
    if (ne >= d.initialStart) d.previewEnd = ne
  } else {
    d.previewStart = shiftDate(d.initialStart, deltaDays)
    d.previewEnd = shiftDate(d.initialEnd, deltaDays)
  }
}
async function onDragEnd() {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  const d = dragging.value
  dragging.value = null
  if (!d) return
  const changed = d.previewStart !== d.initialStart || d.previewEnd !== d.initialEnd
  if (!changed) return
  try {
    await apiFetch(`/api/production/stages/${d.order.lumiId}/${d.stage.stageType}`, {
      method: 'PATCH',
      body: {
        plannedStart: d.previewStart,
        plannedEnd: d.previewEnd,
      },
    })
    emit('refresh')
  } catch (e) {
    alert('更新失败: ' + e.message)
    emit('refresh')  // 拉最新以复位
  }
}

// 拖拽预览：把 previewStart/End 附加到 stage 显示
function stageBarStyleWithDrag(order, stage) {
  if (dragging.value && dragging.value.stage.lumiId === stage.lumiId && dragging.value.stage.stageType === stage.stageType) {
    const preview = { ...stage, plannedStart: dragging.value.previewStart, plannedEnd: dragging.value.previewEnd }
    return stageBarStyle(preview)
  }
  return stageBarStyle(stage)
}

function onStageClick(order, stage) {
  emit('stage-click', { order, stage: props.stageMeta.find(s => s.key === stage.stageType) })
}

function typeColor(stage) {
  return props.statusMeta[stage.status]?.color || '#666'
}
</script>

<template>
  <div class="gantt-wrap" :style="{ minWidth: totalWidth + 'px' }">
    <!-- 表头（月份 + 周） -->
    <div class="gantt-header" :style="{ paddingLeft: LABEL_W + 'px' }">
      <div class="gantt-months">
        <div
          v-for="w in weeks"
          :key="'m' + w.idx"
          class="gantt-month-cell"
          :class="{ 'has-label': w.showMonth }"
          :style="{ width: CELL_W + 'px' }"
        >
          <span v-if="w.showMonth">{{ w.monthLabel }}</span>
        </div>
      </div>
      <div class="gantt-weeks">
        <div
          v-for="w in weeks"
          :key="'w' + w.idx"
          class="gantt-week-cell"
          :style="{ width: CELL_W + 'px' }"
        >
          {{ w.label }}
        </div>
      </div>
    </div>

    <!-- 内容行 -->
    <div class="gantt-body" :style="{ paddingLeft: LABEL_W + 'px' }">
      <!-- 今天参考线 -->
      <div class="gantt-today-line" :style="{ left: (LABEL_W + todayOffset) + 'px' }"></div>

      <div
        v-for="order in orders"
        :key="order.lumiId"
        class="gantt-row"
        :style="{ height: ROW_H + 'px' }"
      >
        <div class="gantt-row-label" :style="{ width: LABEL_W + 'px' }">
          <div class="gantt-lumi-name">
            <span v-if="order.pokedexId != null" class="gantt-pokedex">#{{ order.pokedexId }}</span>
            {{ order.name || `#${order.lumiId}` }}
          </div>
          <div class="gantt-lumi-sub">
            <span v-if="order.milestone" class="gantt-milestone">{{ order.milestone }}</span>
            <span v-if="order.designer" class="gantt-designer">{{ order.designer.replace(/^@/, '').slice(0, 8) }}</span>
          </div>
        </div>
        <div class="gantt-track" :style="{ width: (weeks.length * CELL_W) + 'px' }">
          <!-- 每 4 周一个 zebra -->
          <div
            v-for="w in weeks"
            :key="'g' + w.idx"
            class="gantt-track-cell"
            :class="{ zebra: w.idx % 2 === 1 }"
            :style="{ left: (w.idx * CELL_W) + 'px', width: CELL_W + 'px', height: ROW_H + 'px' }"
          ></div>

          <!-- Stage 色块 -->
          <template v-for="s in stageMeta" :key="s.key">
            <div
              v-if="order.stages[s.key] && stageBarStyleWithDrag(order, order.stages[s.key])"
              class="gantt-stage-bar"
              :style="{
                ...stageBarStyleWithDrag(order, order.stages[s.key]),
                background: s.color,
                opacity: order.stages[s.key].status === 'done' ? 0.55 : 0.95,
                borderStyle: order.stages[s.key].status === 'todo' ? 'dashed' : 'solid',
              }"
              :title="`${s.label} · ${statusMeta[order.stages[s.key].status]?.label} · ${order.stages[s.key].plannedStart} ~ ${order.stages[s.key].plannedEnd}`"
              @click="onStageClick(order, order.stages[s.key])"
              @mousedown="onDragStart($event, order, order.stages[s.key], 'move')"
            >
              <span class="gantt-stage-icon">{{ s.icon }}</span>
              <span class="gantt-stage-status-dot" :style="{ background: typeColor(order.stages[s.key]) }"></span>
              <span v-if="order.stages[s.key].iterationCount" class="gantt-stage-iter">×{{ order.stages[s.key].iterationCount + 1 }}</span>
              <div
                class="gantt-drag-handle gantt-drag-start"
                @mousedown.stop="onDragStart($event, order, order.stages[s.key], 'start')"
              ></div>
              <div
                class="gantt-drag-handle gantt-drag-end"
                @mousedown.stop="onDragStart($event, order, order.stages[s.key], 'end')"
              ></div>
            </div>
          </template>
        </div>
      </div>

      <div v-if="!orders.length" class="gantt-empty">没有匹配的噜咪</div>
    </div>
  </div>
</template>

<style scoped>
.gantt-wrap {
  overflow-x: auto;
  overflow-y: auto;
  max-height: calc(100vh - 300px);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  user-select: none;
}
.gantt-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #0e0e1e;
  border-bottom: 2px solid var(--border);
}
.gantt-months, .gantt-weeks { display: flex; height: 24px; }
.gantt-month-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 4px;
  font-size: 0.72em;
  color: var(--text-dim);
  border-left: 1px solid transparent;
  flex-shrink: 0;
}
.gantt-month-cell.has-label {
  color: var(--accent-light);
  border-left-color: var(--border);
}
.gantt-week-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7em;
  color: var(--text-dim);
  border-left: 1px solid rgba(255,255,255,0.03);
  flex-shrink: 0;
}

.gantt-body { position: relative; }
.gantt-today-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(233, 69, 96, 0.6);
  z-index: 2;
  pointer-events: none;
}
.gantt-row {
  position: relative;
  display: flex;
  border-bottom: 1px solid var(--border);
}
.gantt-row:hover { background: rgba(233, 69, 96, 0.03); }
.gantt-row-label {
  position: sticky;
  left: 0;
  z-index: 4;
  background: var(--bg-card);
  padding: 4px 12px;
  border-right: 1px solid var(--border);
  flex-shrink: 0;
}
.gantt-lumi-name {
  color: #fff;
  font-size: 0.85em;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gantt-pokedex { color: var(--text-dim); font-size: 0.85em; margin-right: 6px; }
.gantt-lumi-sub { display: flex; gap: 6px; margin-top: 2px; font-size: 0.75em; }
.gantt-milestone { background: rgba(52,152,219,0.15); color: #5dade2; padding: 0 6px; border-radius: 4px; }
.gantt-designer { color: var(--text-dim); }

.gantt-track {
  position: relative;
  flex: 1;
}
.gantt-track-cell {
  position: absolute;
  top: 0;
  border-left: 1px solid rgba(255,255,255,0.03);
}
.gantt-track-cell.zebra { background: rgba(255,255,255,0.02); }

.gantt-stage-bar {
  position: absolute;
  top: 4px;
  height: 34px;
  border-radius: 6px;
  border: 1px solid rgba(0,0,0,0.35);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  font-size: 0.85em;
  color: #fff;
  overflow: hidden;
  z-index: 3;
  transition: filter 0.15s;
}
.gantt-stage-bar:hover { filter: brightness(1.15); z-index: 5; }
.gantt-stage-icon { font-size: 0.9em; flex-shrink: 0; }
.gantt-stage-status-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.4);
}
.gantt-stage-iter {
  font-size: 0.75em;
  background: rgba(0,0,0,0.35);
  padding: 0 4px;
  border-radius: 3px;
}
.gantt-drag-handle {
  position: absolute;
  top: 0;
  width: 8px;
  height: 100%;
  cursor: ew-resize;
  opacity: 0;
}
.gantt-drag-handle:hover { opacity: 0.4; background: #fff; }
.gantt-drag-start { left: 0; }
.gantt-drag-end { right: 0; }

.gantt-empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-dim);
}
</style>
