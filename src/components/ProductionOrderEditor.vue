<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { apiFetch } from '../data/api'
import { useAuth } from '../composables/useAuth'
import { TYPE_NAMES, TYPE_COLORS, WORK_TYPE_NAMES } from '../data'

const props = defineProps({
  // mode: 'create' 新增 · 'edit' 编辑
  mode: { type: String, required: true },
  // edit 模式必传：完整 order 对象
  order: { type: Object, default: null },
  // 建议列表：投放 / 进度 / 策划
  releaseOptions: { type: Array, default: () => ['未排期', '主线', 'S1', 'S2', 'S3', 'S4', 'S5', '完全体'] },
  progressOptions: { type: Array, default: () => [] },
  designerOptions: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'saved', 'deleted'])

const { currentUser, hasPermission, isAdmin } = useAuth()

const canEdit = computed(() => hasPermission('production.pm'))
const canDelete = computed(() => isAdmin.value)

// 字段
const lumiId = ref('')
const model = ref('')
const level = ref('')
const name = ref('')
const type1 = ref('')
const type2 = ref('')
const maxScore = ref('')
const workType = ref('')
const combatStrength = ref('')
const workBuilding = ref('')
const tapdStoryUrl = ref('')
const releaseStatus = ref('')
const progressStage = ref('')
const designer = ref('')
// 注：order.status 不再由 UI 编辑，后端根据 stages 自动推导（见 api/production-store.mjs 的 recomputeOrderStatus）

const saving = ref(false)
const deleting = ref(false)
const error = ref('')
const showDeleteConfirm = ref(false)

function resetFromOrder() {
  const o = props.order || {}
  lumiId.value = o.lumiId ?? ''
  model.value = o.model ?? ''
  level.value = o.level ?? ''
  name.value = o.name ?? ''
  type1.value = o.type1 ?? ''
  type2.value = o.type2 ?? ''
  maxScore.value = o.maxScore ?? ''
  workType.value = o.workType ?? ''
  combatStrength.value = o.combatStrength ?? ''
  workBuilding.value = o.workBuilding ?? ''
  tapdStoryUrl.value = o.tapdStoryUrl ?? ''
  releaseStatus.value = o.releaseStatus ?? ''
  progressStage.value = o.progressStage ?? ''
  designer.value = o.designer ?? ''
}
resetFromOrder()
watch(() => props.order, resetFromOrder)

// TAPD URL 变化时自动提取 storyId
const tapdStoryId = computed(() => {
  const m = String(tapdStoryUrl.value || '').match(/stories\/view\/(\d+)/)
  return m ? m[1] : null
})

// 属性选项
const typeOptions = computed(() => [
  { value: '', label: '—' },
  ...Object.entries(TYPE_NAMES).map(([k, v]) => ({ value: Number(k), label: v })),
])
const workTypeOptions = computed(() => [
  { value: '', label: '—' },
  ...Object.entries(WORK_TYPE_NAMES).map(([k, v]) => ({ value: v, label: v })),
])
// 表现级别 / 个体类型（对应图鉴 CardBack）：
// 普通 / 霸主（图鉴上跟普通同类，但规划里独立标记）/ 异色 / 顶级 / 3D / 全景
const levelOptions = [
  { value: '', label: '—' },
  { value: '普通', label: '普通' },
  { value: '霸主', label: '霸主' },
  { value: '异色', label: '异色' },
  { value: '顶级', label: '顶级' },
  { value: '3D', label: '3D' },
  { value: '全景', label: '全景' },
]

function buildPayload() {
  const p = {
    lumiId: Number(lumiId.value),
    model: model.value.trim() || null,
    level: level.value || null,
    name: name.value.trim() || null,
    type1: type1.value !== '' ? Number(type1.value) : null,
    type2: type2.value !== '' ? Number(type2.value) : null,
    maxScore: maxScore.value !== '' ? Number(maxScore.value) : null,
    workType: workType.value || null,
    combatStrength: combatStrength.value.trim() || null,
    workBuilding: workBuilding.value.trim() || null,
    tapdStoryUrl: tapdStoryUrl.value.trim() || null,
    tapdStoryId: tapdStoryId.value,
    releaseStatus: releaseStatus.value || null,
    progressStage: progressStage.value.trim() || null,
    designer: designer.value.trim() || null,
  }
  return p
}

async function save() {
  error.value = ''
  if (!canEdit.value) return
  if (!lumiId.value || !Number.isFinite(Number(lumiId.value))) {
    error.value = 'Lumi ID 必填，且必须是数字'
    return
  }
  saving.value = true
  try {
    if (props.mode === 'create') {
      // POST 走 upsert，若已存在会覆盖，前端提前 warn
      await apiFetch('/api/production/orders', { method: 'POST', body: buildPayload() })
    } else {
      const { lumiId: _drop, ...patch } = buildPayload()
      await apiFetch(`/api/production/orders/${lumiId.value}`, { method: 'PATCH', body: patch })
    }
    emit('saved')
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function doDelete() {
  if (!canDelete.value) return
  deleting.value = true
  error.value = ''
  try {
    await apiFetch(`/api/production/orders/${lumiId.value}`, { method: 'DELETE' })
    emit('deleted', Number(lumiId.value))
  } catch (e) {
    error.value = e.message
    deleting.value = false
  }
}

const title = computed(() => props.mode === 'create' ? '➕ 新增噜咪生产单' : `✏️ 编辑 ${props.order?.name || props.order?.lumiId}`)
</script>

<template>
  <div class="editor-overlay" @click.self="emit('close')">
    <div class="editor-card">
      <div class="editor-header">
        <h3>{{ title }}</h3>
        <button class="editor-close" @click="emit('close')">✕</button>
      </div>

      <div v-if="!canEdit" class="editor-notice">
        🔒 只读模式：需 <code>production.pm</code> 权限才能编辑
      </div>

      <div class="editor-body">
        <!-- 基础信息 -->
        <div class="field-section">基础信息</div>
        <div class="field-grid">
          <div class="field-col">
            <label>Lumi ID *</label>
            <input v-model="lumiId" type="number" placeholder="如 108501" :disabled="mode === 'edit' || !canEdit" />
          </div>
          <div class="field-col">
            <label>模型名</label>
            <input v-model="model" placeholder="如 Capibara" :disabled="!canEdit" />
          </div>
          <div class="field-col">
            <label>噜咪名</label>
            <input v-model="name" :disabled="!canEdit" />
          </div>
          <div class="field-col">
            <label>最高分</label>
            <input v-model="maxScore" type="number" :disabled="!canEdit" />
          </div>
          <div class="field-col">
            <label>类型</label>
            <select v-model="level" :disabled="!canEdit">
              <option v-for="o in levelOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
          <div class="field-col">
            <label>属性 1</label>
            <select v-model="type1" :disabled="!canEdit">
              <option v-for="o in typeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
          <div class="field-col">
            <label>属性 2</label>
            <select v-model="type2" :disabled="!canEdit">
              <option v-for="o in typeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
        </div>

        <!-- TAPD -->
        <div class="field-section">TAPD</div>
        <div class="field-row">
          <label>TAPD 单 URL</label>
          <input v-model="tapdStoryUrl" placeholder="https://www.tapd.cn/46491618/prong/stories/view/xxx" :disabled="!canEdit" />
          <div v-if="tapdStoryId" class="field-hint">✓ 提取到 storyId: <code>{{ tapdStoryId }}</code></div>
        </div>

        <!-- 排期 -->
        <div class="field-section">排期</div>
        <div class="field-grid">
          <div class="field-col">
            <label>投放状态</label>
            <select v-model="releaseStatus" :disabled="!canEdit">
              <option value="">—</option>
              <option v-for="r in releaseOptions" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
          <div class="field-col">
            <label>技能设计</label>
            <input v-model="progressStage" list="progress-suggest" placeholder="如 完全体 / 技能表现完成" :disabled="!canEdit" />
            <datalist id="progress-suggest">
              <option v-for="p in progressOptions" :key="p" :value="p" />
            </datalist>
          </div>
        </div>

        <!-- 策划配置 -->
        <div class="field-section">策划配置</div>
        <div class="field-grid">
          <div class="field-col">
            <label>负责策划</label>
            <input v-model="designer" list="designer-suggest" placeholder="@xxx" :disabled="!canEdit" />
            <datalist id="designer-suggest">
              <option v-for="d in designerOptions" :key="d" :value="d" />
            </datalist>
          </div>
          <div class="field-col">
            <label>打工种类</label>
            <select v-model="workType" :disabled="!canEdit">
              <option v-for="o in workTypeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
          <div class="field-col">
            <label>战斗强度</label>
            <input v-model="combatStrength" placeholder="如 4.拉完了" :disabled="!canEdit" />
          </div>
          <div class="field-col">
            <label>专有建筑</label>
            <input v-model="workBuilding" :disabled="!canEdit" />
          </div>
        </div>

        <!-- 动特表现（内容后续再补） -->
        <div class="field-section">动特表现</div>
        <div class="field-grid">
          <div class="field-col field-placeholder">
            <span class="placeholder-hint">🚧 具体字段待定，稍后补充</span>
          </div>
        </div>

        <div v-if="error" class="editor-error">{{ error }}</div>
      </div>

      <div class="editor-footer">
        <button
          v-if="mode === 'edit' && canDelete"
          class="btn-danger"
          :disabled="deleting"
          @click="showDeleteConfirm = true"
        >
          🗑️ 删除
        </button>
        <div class="footer-spacer" />
        <button class="btn-secondary" @click="emit('close')">取消</button>
        <button v-if="canEdit" class="btn-primary" :disabled="saving" @click="save">
          {{ saving ? '保存中...' : (mode === 'create' ? '创建' : '保存') }}
        </button>
      </div>
    </div>

    <!-- 删除二次确认 -->
    <div v-if="showDeleteConfirm" class="confirm-mask" @click.self="showDeleteConfirm = false">
      <div class="confirm-box">
        <h4>⚠️ 确认删除？</h4>
        <p>将永久删除 <strong>{{ name || lumiId }}</strong> 的生产单、所有 9 个环节记录和活动日志。</p>
        <p class="confirm-warn">此操作不可撤销。</p>
        <div class="confirm-actions">
          <button class="btn-secondary" @click="showDeleteConfirm = false">取消</button>
          <button class="btn-danger" :disabled="deleting" @click="doDelete">
            {{ deleting ? '删除中...' : '确认删除' }}
          </button>
        </div>
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
  max-width: 760px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0,0,0,0.6);
}
.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border);
}
.editor-header h3 { color: #fff; margin: 0; font-size: 1.15em; }
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
}

.editor-body {
  padding: 16px 22px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field-section {
  color: var(--accent-light);
  font-size: 0.85em;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
  margin-top: 4px;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.field-col, .field-row { display: flex; flex-direction: column; gap: 4px; }
.field-col label, .field-row label {
  color: var(--text-dim);
  font-size: 0.85em;
}
.field-col input, .field-col select,
.field-row input, .field-row select {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--text);
  font-family: inherit;
  font-size: 0.9em;
  outline: none;
}
.field-col input:focus, .field-col select:focus,
.field-row input:focus, .field-row select:focus { border-color: var(--accent); }
.field-col input:disabled, .field-col select:disabled,
.field-row input:disabled, .field-row select:disabled { opacity: 0.6; cursor: not-allowed; }
.field-hint {
  color: var(--text-dim);
  font-size: 0.8em;
}
.field-hint code {
  background: rgba(46,204,113,0.15);
  color: #4ade80;
  padding: 1px 5px;
  border-radius: 3px;
}
.field-placeholder {
  padding: 8px 0;
}
.placeholder-hint {
  color: var(--text-dim);
  font-size: 0.85em;
  font-style: italic;
}
.editor-error {
  color: #ff8b95;
  background: rgba(233, 69, 96, 0.1);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.9em;
}

.editor-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 22px;
  border-top: 1px solid var(--border);
}
.footer-spacer { flex: 1; }
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
.btn-danger {
  background: rgba(233, 69, 96, 0.15);
  color: #ff8b95;
  border: 1px solid rgba(233, 69, 96, 0.4);
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 0.9em;
}
.btn-danger:hover { background: rgba(233,69,96,0.3); }
.btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }

.confirm-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
}
.confirm-box {
  background: #1a1a2e;
  border: 1px solid var(--accent);
  border-radius: 10px;
  padding: 22px 28px;
  max-width: 420px;
  width: 90%;
}
.confirm-box h4 { color: #fff; margin: 0 0 12px; font-size: 1.05em; }
.confirm-box p { color: var(--text-dim); margin: 6px 0; }
.confirm-warn { color: #ff8b95; font-size: 0.9em; }
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
</style>
