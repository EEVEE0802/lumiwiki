<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Object,
    default: null
  },
  lumis: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: '选择噜咪'
  },
  locMap: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const searchTerm = ref('')

// 获取 Lumi 显示名称
const getLumiName = (lumi) => {
  if (!lumi) return props.placeholder
  return props.locMap[lumi.Name] || `噜咪 #${lumi.Id}`
}

// 当前选中的 Lumi 名称
const selectedName = computed(() => {
  if (!props.modelValue) return ''
  return getLumiName(props.modelValue)
})

// 过滤后的 Lumi 列表
const filteredLumis = computed(() => {
  const list = props.lumis
  if (!searchTerm.value) return list
  const q = searchTerm.value.toLowerCase()
  return list.filter(lumi => {
    const name = getLumiName(lumi).toLowerCase()
    return name.includes(q) || String(lumi.Id).includes(q) || String(lumi.PokedexId).includes(q)
  })
})

// 打开下拉框
function openDropdown() {
  isOpen.value = true
  searchTerm.value = ''
}

// 选择 Lumi
function selectLumi(lumi) {
  emit('update:modelValue', lumi)
  isOpen.value = false
}

// 清除选择
function clearSelection(e) {
  e.stopPropagation()
  emit('update:modelValue', null)
  isOpen.value = false
}
</script>

<template>
  <div class="lumi-selector">
    <!-- 触发按钮 -->
    <button type="button" class="selector-button" @click="openDropdown">
      <span v-if="!modelValue" class="placeholder">{{ placeholder }}</span>
      <div v-else class="selected-content">
        <img
          v-if="modelValue.CA"
          :src="`/images/avatars/${modelValue.CA}.png`"
          class="lumi-mini-avatar"
          @error="($event.target).style.display='none'"
        />
        <span class="selected-name">{{ selectedName }}</span>
        <span class="clear-btn" @click="clearSelection">✕</span>
      </div>
      <span class="dropdown-arrow">▼</span>
    </button>

    <!-- 下拉菜单 -->
    <div v-if="isOpen" class="dropdown-backdrop" @click="isOpen = false">
      <div class="dropdown-panel" @click.stop>
        <input
          type="text"
          v-model="searchTerm"
          placeholder="搜索噜咪..."
          class="search-input"
        />
        <div class="dropdown-list">
          <div
            v-for="lumi in filteredLumis"
            :key="lumi.Id"
            class="dropdown-item"
            @click="selectLumi(lumi)"
          >
            <img
              v-if="lumi.CA"
              :src="`/images/avatars/${lumi.CA}.png`"
              class="lumi-mini-avatar"
              @error="($event.target).style.display='none'"
            />
            <span class="lumi-name">{{ getLumiName(lumi) }}</span>
            <span class="lumi-id">#{{ lumi.PokedexId }}</span>
          </div>
          <div v-if="filteredLumis.length === 0" class="no-results">
            没有找到匹配的噜咪
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lumi-selector {
  position: relative;
  width: 100%;
}

.selector-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  cursor: pointer;
  transition: border-color 0.2s;
  text-align: left;
}

.selector-button:hover {
  border-color: var(--accent);
}

.placeholder {
  color: var(--text-dim);
}

.selected-content {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.lumi-mini-avatar {
  width: 28px;
  height: 35px;
  object-fit: contain;
  flex-shrink: 0;
}

.selected-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clear-btn {
  color: var(--text-dim);
  padding: 2px 8px;
  margin-left: 4px;
}

.clear-btn:hover {
  color: var(--accent);
}

.dropdown-arrow {
  color: var(--text-dim);
  font-size: 0.7em;
  flex-shrink: 0;
}

.dropdown-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.dropdown-panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 100%;
  max-width: 400px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.search-input {
  width: 100%;
  padding: 14px 16px;
  background: var(--bg);
  border: none;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  border-radius: 12px 12px 0 0;
  outline: none;
  font-size: 1em;
}

.dropdown-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.dropdown-item:hover {
  background: rgba(233, 69, 96, 0.15);
}

.lumi-name {
  flex: 1;
  color: var(--text);
  font-size: 0.95em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lumi-id {
  color: var(--text-dim);
  font-size: 0.85em;
  flex-shrink: 0;
}

.no-results {
  padding: 30px;
  text-align: center;
  color: var(--text-dim);
}

.dropdown-list::-webkit-scrollbar {
  width: 6px;
}

.dropdown-list::-webkit-scrollbar-track {
  background: transparent;
}

.dropdown-list::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.dropdown-list::-webkit-scrollbar-thumb:hover {
  background: var(--accent);
}
</style>
