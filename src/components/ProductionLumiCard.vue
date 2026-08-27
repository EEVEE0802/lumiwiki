<script setup>
// 排期总览页专用的噜咪卡片（含 7 段环节进度带）
// 抽出来避免 flat/timeline 两种视图下的模板重复

import { TYPE_COLORS, TYPE_NAMES } from '../data'
import { internalAvatarUrl } from '../data/imageUrl'

const props = defineProps({
  order: { type: Object, required: true },
  stageMeta: { type: Array, required: true },
  statusMeta: { type: Object, required: true },
  iterationMap: { type: Object, required: true },
})
const emit = defineEmits(['edit', 'schedule', 'tapd'])

function typeColor(id) { return TYPE_COLORS[id] || '#666' }
function typeName(id) { return TYPE_NAMES[id] || '' }
function stageEntry(k) { return props.order.stages?.[k] }
// "不适用" = 无 stage 行，或 stage 行有但 tapdSubStoryId 为空（import-script 早期占位）
function stageMissing(k) {
  const s = stageEntry(k)
  return !s || !s.tapdSubStoryId
}
function stageColor(k) {
  if (stageMissing(k)) return 'transparent'
  const s = stageEntry(k)
  return props.statusMeta[s.status || 'todo']?.color || '#666'
}
function stageTip(k) {
  const meta = props.stageMeta.find(x => x.key === k)
  const s = stageEntry(k)
  if (stageMissing(k)) return `${meta.label}：无此环节（TAPD 未建子单）`
  const st = s.status || 'todo'
  const itId = s.tapdIterationId
  const itName = itId ? (props.iterationMap.get(itId)?.name || '') : ''
  return `${meta.label}：${props.statusMeta[st].label}${itName ? ` · ${itName}` : ''}`
}
</script>

<template>
  <div class="lumi-card">
    <div class="card-head">
      <img
        v-if="order.pokedexId != null"
        :src="internalAvatarUrl(order.lumiId)"
        class="card-avatar"
        loading="lazy"
        @error="$event.target.style.display='none'"
      />
      <div v-else class="card-avatar card-avatar-empty">?</div>
      <div class="card-title">
        <div class="card-name">
          <span v-if="order.pokedexId != null" class="card-pokedex">#{{ order.pokedexId }}</span>
          {{ order.name || `#${order.lumiId}` }}
        </div>
        <div class="card-meta">
          <span
            v-if="order.type1"
            class="card-type"
            :style="{ background: typeColor(order.type1) }"
          >{{ typeName(order.type1) }}</span>
          <span
            v-if="order.type2"
            class="card-type"
            :style="{ background: typeColor(order.type2) }"
          >{{ typeName(order.type2) }}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="act-btn" @click="emit('edit', order)" title="编辑元数据">✏️</button>
        <button class="act-btn" @click="emit('schedule', order)" title="调整排期">📅</button>
      </div>
    </div>
    <div class="stage-progress">
      <div
        v-for="s in stageMeta"
        :key="s.key"
        class="stage-seg"
        :class="{ 'stage-missing': stageMissing(s.key) }"
        :style="{ background: stageColor(s.key) }"
        :title="stageTip(s.key)"
      >{{ stageMissing(s.key) ? '—' : s.icon }}</div>
    </div>
    <div class="card-footer">
      <span v-if="order.designer" class="card-designer">👤 {{ order.designer }}</span>
      <span
        v-if="order.releaseStatus"
        :class="['card-release', `rel-${order.releaseStatus}`]"
      >{{ order.releaseStatus }}</span>
      <span
        v-if="order.tapdStoryUrl"
        class="card-tapd"
        @click="emit('tapd', order.tapdStoryUrl)"
      >TAPD</span>
    </div>
  </div>
</template>

<style scoped>
.lumi-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: all 0.15s;
}
.lumi-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(233, 69, 96, 0.12);
}
.card-head { display: flex; gap: 6px; align-items: flex-start; }
.card-avatar {
  width: 28px; height: 28px;
  border-radius: 4px;
  background: rgba(0,0,0,0.2);
  object-fit: contain;
  flex-shrink: 0;
}
.card-avatar-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
  font-size: 1.1em;
}
.card-title { flex: 1; min-width: 0; }
.card-name {
  color: #fff;
  font-weight: 600;
  font-size: 0.9em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-pokedex { color: var(--text-dim); font-size: 0.85em; margin-right: 4px; }
.card-meta {
  display: flex;
  gap: 3px;
  margin-top: 3px;
  font-size: 0.7em;
  flex-wrap: wrap;
}
.card-type { color: #fff; padding: 1px 5px; border-radius: 4px; }
.card-actions { display: flex; gap: 2px; flex-shrink: 0; }
.act-btn {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 5px;
  color: var(--text);
  cursor: pointer;
  font-size: 0.85em;
}
.act-btn:hover {
  border-color: #a493e0;
  background: rgba(164,147,224,0.15);
}

.stage-progress {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.stage-seg {
  height: 16px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65em;
  color: #fff;
  cursor: help;
  opacity: 0.9;
}
.stage-seg.stage-missing {
  border: 1px dashed rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.25);
  font-size: 0.8em;
  opacity: 1;
}

.card-footer {
  display: flex;
  gap: 6px;
  align-items: center;
  padding-top: 4px;
  border-top: 1px solid rgba(255,255,255,0.05);
  font-size: 0.72em;
  flex-wrap: wrap;
}
.card-designer { color: var(--text-dim); }
.card-release {
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(155,89,182,0.15);
  color: #bb8fce;
}
.card-release.rel-未排期 { background: rgba(148,163,184,0.15); color: #94a3b8; }
.card-release.rel-完全体 { background: rgba(241,196,15,0.15); color: #f1c40f; }
.card-release.rel-主线 { background: rgba(46,204,113,0.15); color: #4ade80; }

.card-tapd {
  color: var(--accent-light);
  cursor: pointer;
  padding: 1px 6px;
  background: rgba(233,69,96,0.1);
  border-radius: 3px;
}
.card-tapd:hover { background: rgba(233,69,96,0.25); }
</style>
