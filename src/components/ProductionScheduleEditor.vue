<script setup>
// 排期编辑器：把一只噜咪的 7 环节分别指派到某个周版本 + 负责人 + 状态
// 保存时: 每个 stage patch 到本地，若 tapdSubStoryId 存在则同时 push 到 TAPD
// 只允许 production.pm

import { ref, computed, watch } from 'vue'
import { apiFetch } from '../data/api'
import { useAuth } from '../composables/useAuth'

const props = defineProps({
  order: { type: Object, required: true },
  iterations: { type: Array, required: true },
})
const emit = defineEmits(['close', 'saved'])

const { hasPermission } = useAuth()
const canEdit = computed(() => hasPermission('production.pm'))

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

// 每个 stage 的编辑态
const rows = ref([])

function initRows() {
  rows.value = STAGE_META.map(s => {
    const st = props.order.stages?.[s.key] || {}
    return {
      ...s,
      stage: st,
      iterationId: st.tapdIterationId || '',
      status: st.status || 'todo',
      assignee: st.assignee || '',
    }
  })
}
initRows()
watch(() => props.order, initRows)

const saving = ref(false)
const error = ref('')
const pushLog = ref([])   // { stage, ok, msg }

async function save() {
  if (!canEdit.value) return
  error.value = ''
  pushLog.value = []
  saving.value = true
  try {
    for (const r of rows.value) {
      const patch = {}
      // 只处理有变更的字段（跟原状态比对）
      if (r.iterationId !== (r.stage.tapdIterationId || '')) {
        // 从新周版本查 startdate/enddate 一并更新
        patch.tapdIterationId = r.iterationId || null
        const it = props.iterations.find(i => i.id === r.iterationId)
        if (it) {
          patch.plannedStart = it.startdate
          patch.plannedEnd = it.enddate
        }
      }
      if (r.status !== (r.stage.status || 'todo')) patch.status = r.status
      if (r.assignee !== (r.stage.assignee || '')) patch.assignee = r.assignee || null
      if (Object.keys(patch).length === 0) continue

      // 本地 patch
      await apiFetch(`/api/production/stages/${props.order.lumiId}/${r.key}`, {
        method: 'PATCH', body: patch,
      })
      pushLog.value.push({ stage: r.label, ok: true, msg: '本地已更新' })

      // 如果有 tapdSubStoryId 就 push TAPD
      if (r.stage.tapdSubStoryId) {
        try {
          await apiFetch(`/api/production/stages/${props.order.lumiId}/${r.key}/push-tapd`, {
            method: 'POST',
          })
          pushLog.value.push({ stage: r.label, ok: true, msg: '✓ TAPD 已同步' })
        } catch (e) {
          pushLog.value.push({ stage: r.label, ok: false, msg: 'TAPD push 失败: ' + e.message })
        }
      }
    }
    if (!pushLog.value.length) {
      error.value = '没有变更'
    } else {
      emit('saved')
    }
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

function iterationLabel(id) {
  if (!id) return '未排期'
  const it = props.iterations.find(i => i.id === id)
  return it ? `${it.name}` : id
}
</script>

<template>
  <div class="editor-overlay" @click.self="emit('close')">
    <div class="editor-card">
      <div class="editor-header">
        <div>
          <h3>📅 调整排期 · {{ order.name || order.lumiId }}</h3>
          <div class="editor-sub">
            {{ order.model || '-' }} · id {{ order.lumiId }}
            <span v-if="order.tapdStoryUrl">· <a :href="order.tapdStoryUrl" target="_blank">TAPD 总单</a></span>
          </div>
        </div>
        <button class="editor-close" @click="emit('close')">✕</button>
      </div>

      <div v-if="!canEdit" class="editor-notice">
        🔒 只读：需 <code>production.pm</code> 权限
      </div>

      <div class="editor-body">
        <div class="grid-header">
          <div>环节</div>
          <div>周版本</div>
          <div>负责人</div>
          <div>状态</div>
          <div>TAPD 子单</div>
        </div>
        <div v-for="r in rows" :key="r.key" class="grid-row">
          <div class="cell-stage">
            <span :style="{ color: r.color }">{{ r.icon }}</span> {{ r.label }}
          </div>
          <div>
            <select v-model="r.iterationId" :disabled="!canEdit">
              <option value="">— 未排期 —</option>
              <option v-for="it in iterations" :key="it.id" :value="it.id">{{ it.name }}</option>
            </select>
          </div>
          <div>
            <input v-model="r.assignee" placeholder="—" :disabled="!canEdit" />
          </div>
          <div>
            <select v-model="r.status" :disabled="!canEdit">
              <option v-for="(m, k) in STATUS_META" :key="k" :value="k">{{ m.label }}</option>
            </select>
          </div>
          <div class="cell-sub">
            <span v-if="r.stage.tapdSubStoryId" class="sub-yes">✓</span>
            <span v-else class="sub-no">未关联</span>
          </div>
        </div>

        <div v-if="pushLog.length" class="push-log">
          <div class="push-log-title">保存日志：</div>
          <div v-for="(l, i) in pushLog" :key="i" :class="['push-log-item', { fail: !l.ok }]">
            {{ l.stage }} · {{ l.msg }}
          </div>
        </div>
        <div v-if="error" class="editor-error">{{ error }}</div>
      </div>

      <div class="editor-footer">
        <button class="btn-secondary" @click="emit('close')">关闭</button>
        <button v-if="canEdit" class="btn-primary" :disabled="saving" @click="save">
          {{ saving ? '保存中...' : '保存 + push TAPD' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.editor-card {
  background: #1a1a2e;
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 100%;
  max-width: 900px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0,0,0,0.6);
}
.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border);
}
.editor-header h3 { color: #fff; margin: 0; font-size: 1.15em; }
.editor-sub { color: var(--text-dim); font-size: 0.85em; margin-top: 4px; }
.editor-sub a { color: #a493e0; }
.editor-close {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.4em;
  cursor: pointer;
}
.editor-close:hover { color: var(--accent); }

.editor-notice {
  margin: 12px 22px 0;
  padding: 10px 14px;
  background: rgba(255,200,100,0.08);
  border: 1px solid rgba(255,200,100,0.25);
  border-radius: 6px;
  color: #f39c12;
  font-size: 0.85em;
}
.editor-notice code { background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px; }

.editor-body {
  padding: 16px 22px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.grid-header, .grid-row {
  display: grid;
  grid-template-columns: 120px 1fr 140px 130px 100px;
  gap: 10px;
  align-items: center;
}
.grid-header {
  color: var(--text-dim);
  font-size: 0.85em;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.grid-row {
  padding: 6px 0;
}
.cell-stage {
  color: #fff;
  font-weight: 600;
  font-size: 0.9em;
}
.grid-row input, .grid-row select {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 10px;
  color: var(--text);
  font-family: inherit;
  font-size: 0.85em;
  outline: none;
  width: 100%;
}
.grid-row input:focus, .grid-row select:focus { border-color: #a493e0; }
.grid-row input:disabled, .grid-row select:disabled { opacity: 0.6; }
.cell-sub { font-size: 0.85em; }
.sub-yes { color: #4ade80; }
.sub-no { color: var(--text-dim); }

.push-log {
  margin-top: 12px;
  padding: 10px 12px;
  background: rgba(255,255,255,0.03);
  border-radius: 6px;
  font-size: 0.85em;
}
.push-log-title { color: var(--text-dim); margin-bottom: 4px; }
.push-log-item { color: #4ade80; }
.push-log-item.fail { color: #ff8b95; }

.editor-error {
  color: #ff8b95;
  background: rgba(233,69,96,0.1);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.9em;
}

.editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px;
  border-top: 1px solid var(--border);
}
.btn-primary {
  background: linear-gradient(135deg, #a493e0 0%, #764ba2 100%);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 20px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9em;
}
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-secondary {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 8px 20px;
  cursor: pointer;
  font-size: 0.9em;
}
</style>
