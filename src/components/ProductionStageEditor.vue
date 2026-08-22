<script setup>
import { ref, computed, watch } from 'vue'
import { apiFetch } from '../data/api'
import { useAuth } from '../composables/useAuth'

const props = defineProps({
  order: { type: Object, required: true },
  stageType: { type: String, required: true },
  stageMeta: { type: Array, required: true },
  statusMeta: { type: Object, required: true },
  users: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'saved'])

const { hasPermission } = useAuth()

const stageDef = computed(() => props.stageMeta.find(s => s.key === props.stageType))
const initialStage = computed(() => props.order.stages?.[props.stageType] || {})

// 判断当前用户能否编辑本环节
const canEdit = computed(() =>
  hasPermission('production.pm') ||
  hasPermission(`production.stage.${props.stageType}.write`)
)

// 编辑字段
const assignee = ref('')
const status = ref('todo')
const plannedStart = ref('')
const plannedEnd = ref('')
const actualStart = ref('')
const actualEnd = ref('')
const iterationCount = ref(0)
const tapdSubStoryId = ref('')
const deliverablesRaw = ref('{}')

const saving = ref(false)
const error = ref('')

function resetFromStage() {
  const s = initialStage.value
  assignee.value = s.assignee || ''
  status.value = s.status || 'todo'
  plannedStart.value = s.plannedStart || ''
  plannedEnd.value = s.plannedEnd || ''
  actualStart.value = s.actualStart || ''
  actualEnd.value = s.actualEnd || ''
  iterationCount.value = s.iterationCount || 0
  tapdSubStoryId.value = s.tapdSubStoryId || ''
  deliverablesRaw.value = s.deliverables ? JSON.stringify(s.deliverables, null, 2) : '{}'
}
resetFromStage()
watch(() => props.stageType, resetFromStage)

async function save() {
  if (!canEdit.value) return
  error.value = ''
  saving.value = true
  try {
    let deliverables = null
    if (deliverablesRaw.value.trim()) {
      try { deliverables = JSON.parse(deliverablesRaw.value) }
      catch (e) { throw new Error('deliverables JSON 格式错误：' + e.message) }
    }
    await apiFetch(`/api/production/stages/${props.order.lumiId}/${props.stageType}`, {
      method: 'PATCH',
      body: {
        assignee: assignee.value || null,
        status: status.value,
        plannedStart: plannedStart.value || null,
        plannedEnd: plannedEnd.value || null,
        actualStart: actualStart.value || null,
        actualEnd: actualEnd.value || null,
        iterationCount: Number(iterationCount.value) || 0,
        tapdSubStoryId: tapdSubStoryId.value || null,
        deliverables,
      },
    })
    emit('saved')
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="editor-overlay" @click.self="emit('close')">
    <div class="editor-card">
      <div class="editor-header">
        <div>
          <h3>
            <span class="stage-icon" :style="{ color: stageDef?.color }">{{ stageDef?.icon }}</span>
            {{ stageDef?.label }} <span class="editor-lumi">· {{ order.name || order.lumiId }}</span>
          </h3>
          <div class="editor-sub">
            #{{ order.pokedexId ?? '-' }} · id {{ order.lumiId }}
            <span v-if="order.tapdStoryUrl">
              · <a :href="order.tapdStoryUrl" target="_blank" class="tapd-link">TAPD 单</a>
            </span>
          </div>
        </div>
        <button class="editor-close" @click="emit('close')">✕</button>
      </div>

      <div v-if="!canEdit" class="editor-notice">
        🔒 只读模式：需 <code>production.pm</code> 或 <code>production.stage.{{ stageType }}.write</code> 权限才能编辑
      </div>

      <div class="editor-body">
        <div class="field-row">
          <label>状态</label>
          <select v-model="status" :disabled="!canEdit">
            <option v-for="(m, k) in statusMeta" :key="k" :value="k">
              {{ m.label }}
            </option>
          </select>
        </div>
        <div class="field-row">
          <label>负责人</label>
          <input v-model="assignee" list="assignee-users" placeholder="用户名 / TAPD ID" :disabled="!canEdit" />
          <datalist id="assignee-users">
            <option v-for="u in users" :key="u.username" :value="u.username">{{ u.role }}</option>
          </datalist>
        </div>

        <div class="field-grid">
          <div class="field-col">
            <label>计划开始</label>
            <input type="date" v-model="plannedStart" :disabled="!canEdit" />
          </div>
          <div class="field-col">
            <label>计划完成</label>
            <input type="date" v-model="plannedEnd" :disabled="!canEdit" />
          </div>
          <div class="field-col">
            <label>实际开始</label>
            <input type="date" v-model="actualStart" :disabled="!canEdit" />
          </div>
          <div class="field-col">
            <label>实际完成</label>
            <input type="date" v-model="actualEnd" :disabled="!canEdit" />
          </div>
        </div>

        <div class="field-grid">
          <div class="field-col">
            <label>迭代次数（除首次）</label>
            <input type="number" min="0" v-model="iterationCount" :disabled="!canEdit" />
          </div>
          <div class="field-col">
            <label>TAPD 子任务 ID</label>
            <input v-model="tapdSubStoryId" placeholder="选填" :disabled="!canEdit" />
          </div>
        </div>

        <div class="field-row">
          <label>交付物 (JSON)</label>
          <textarea
            v-model="deliverablesRaw"
            rows="5"
            placeholder='{"目录": "...", "挂点": [...]}'
            :disabled="!canEdit"
          ></textarea>
          <div class="field-hint">JSON 格式；后续会为各环节内置字段表单（v1 先自由填）</div>
        </div>

        <div v-if="error" class="editor-error">{{ error }}</div>
      </div>

      <div class="editor-footer">
        <button class="btn-secondary" @click="emit('close')">取消</button>
        <button v-if="canEdit" class="btn-primary" :disabled="saving" @click="save">
          {{ saving ? '保存中...' : '保存' }}
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
  max-width: 640px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0,0,0,0.6);
}
.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 18px 22px 12px;
  border-bottom: 1px solid var(--border);
}
.editor-header h3 {
  color: #fff;
  font-size: 1.2em;
  margin: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}
.stage-icon { font-size: 1.1em; }
.editor-lumi { color: var(--text-dim); font-weight: normal; font-size: 0.9em; }
.editor-sub { color: var(--text-dim); font-size: 0.85em; margin-top: 4px; }
.tapd-link { color: var(--accent-light); }
.editor-close {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.4em;
  cursor: pointer;
  padding: 0 8px;
}
.editor-close:hover { color: var(--accent); }

.editor-notice {
  margin: 12px 22px 0;
  padding: 10px 14px;
  background: rgba(255, 200, 100, 0.08);
  border: 1px solid rgba(255, 200, 100, 0.25);
  border-radius: 6px;
  color: #f39c12;
  font-size: 0.85em;
}
.editor-notice code {
  background: rgba(255,255,255,0.08);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}

.editor-body {
  padding: 16px 22px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-row label, .field-col label {
  color: var(--text-dim);
  font-size: 0.85em;
}
.field-row input, .field-row select, .field-row textarea,
.field-col input {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--text);
  font-family: inherit;
  font-size: 0.9em;
  outline: none;
}
.field-row textarea {
  font-family: 'Consolas', monospace;
  font-size: 0.85em;
  resize: vertical;
}
.field-row input:focus, .field-row select:focus, .field-row textarea:focus,
.field-col input:focus { border-color: var(--accent); }
.field-row input:disabled, .field-row select:disabled, .field-row textarea:disabled,
.field-col input:disabled { opacity: 0.6; }
.field-hint {
  color: var(--text-dim);
  font-size: 0.8em;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.field-col { display: flex; flex-direction: column; gap: 4px; }

.editor-error {
  color: #ff8b95;
  background: rgba(233, 69, 96, 0.1);
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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
.btn-secondary:hover { border-color: var(--accent); }
</style>
