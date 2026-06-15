<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '全部' },
  colors: { type: Object, default: null },
  searchable: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const searchQuery = ref('')
const dropdownRef = ref(null)

// 触发按钮显示文字
const triggerLabel = computed(() => {
  const selected = props.modelValue
  if (!selected.length) return props.placeholder
  if (selected.length === 1) {
    const opt = props.options.find(o => o.value === selected[0])
    return opt ? opt.label : props.placeholder
  }
  return `已选 ${selected.length} 项`
})

// 是否有选中项
const hasSelection = computed(() => props.modelValue.length > 0)

// 按搜索过滤后的选项
const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options
  const q = searchQuery.value.toLowerCase()
  return props.options.filter(o => o.label.toLowerCase().includes(q))
})

// 切换选项选中状态
function toggleOption(val) {
  const current = [...props.modelValue]
  const idx = current.indexOf(val)
  if (idx >= 0) {
    current.splice(idx, 1)
  } else {
    current.push(val)
  }
  emit('update:modelValue', current)
}

// 全选
function selectAll() {
  emit('update:modelValue', props.options.map(o => o.value))
}

// 清空
function clearAll() {
  emit('update:modelValue', [])
}

// 判断是否选中
function isSelected(val) {
  return props.modelValue.includes(val)
}

// 切换面板开关
function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    searchQuery.value = ''
  }
}

// 点击外部关闭
function handleClickOutside(e) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="multi-select" ref="dropdownRef">
    <!-- 触发按钮 -->
    <button
      class="ms-trigger"
      :class="{ 'ms-trigger--active': hasSelection }"
      @click="toggleDropdown"
    >
      <span class="ms-trigger-text" :class="{ 'ms-placeholder': !hasSelection }">
        {{ triggerLabel }}
      </span>
      <span class="ms-arrow" :class="{ 'ms-arrow--open': isOpen }">▾</span>
    </button>

    <!-- 下拉面板 -->
    <div v-if="isOpen" class="ms-dropdown">
      <!-- 搜索框 -->
      <input
        v-if="searchable"
        v-model="searchQuery"
        class="ms-search"
        placeholder="搜索..."
        @click.stop
      />

      <!-- 选项列表 -->
      <div class="ms-options">
        <label
          v-for="opt in filteredOptions"
          :key="opt.value"
          class="ms-option"
          @click.stop
        >
          <input
            type="checkbox"
            :checked="isSelected(opt.value)"
            @change="toggleOption(opt.value)"
            class="ms-checkbox"
          />
          <span
            class="ms-check-box"
            :class="{ 'ms-check-box--checked': isSelected(opt.value) }"
            :style="isSelected(opt.value) && colors ? { background: colors[opt.value] || 'var(--accent)' } : {}"
          >
            <span v-if="isSelected(opt.value)" class="ms-check-mark">✓</span>
          </span>
          <span
            v-if="colors && colors[opt.value]"
            class="ms-color-dot"
            :style="{ background: colors[opt.value] }"
          ></span>
          <span class="ms-option-label">{{ opt.label }}</span>
        </label>
        <div v-if="!filteredOptions.length" class="ms-empty">无匹配选项</div>
      </div>

      <!-- 底部操作 -->
      <div class="ms-actions">
        <button class="ms-action-btn" @click.stop="selectAll">全选</button>
        <button class="ms-action-btn" @click.stop="clearAll">清空</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.multi-select {
  position: relative;
  user-select: none;
}

/* 触发按钮 */
.ms-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 14px;
  color: var(--text);
  cursor: pointer;
  font-size: inherit;
  font-family: inherit;
  min-width: 120px;
  transition: border-color 0.2s;
}
.ms-trigger:hover {
  border-color: var(--accent-light);
}
.ms-trigger--active {
  border-color: var(--accent);
}
.ms-trigger-text {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ms-placeholder {
  color: var(--text-dim);
}
.ms-arrow {
  font-size: 0.8em;
  transition: transform 0.2s;
  color: var(--text-dim);
}
.ms-arrow--open {
  transform: rotate(180deg);
}

/* 下拉面板 */
.ms-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 220px;
  max-width: 320px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
  overflow: hidden;
  animation: ms-fade-in 0.15s ease;
}

@keyframes ms-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 搜索框 */
.ms-search {
  width: calc(100% - 24px);
  margin: 8px 12px 4px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.9em;
  outline: none;
}
.ms-search:focus {
  border-color: var(--accent);
}

/* 选项列表 */
.ms-options {
  max-height: 260px;
  overflow-y: auto;
  padding: 4px 0;
}
.ms-options::-webkit-scrollbar {
  width: 6px;
}
.ms-options::-webkit-scrollbar-track {
  background: transparent;
}
.ms-options::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

/* 单个选项 */
.ms-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  cursor: pointer;
  transition: background 0.15s;
}
.ms-option:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* 隐藏原生 checkbox */
.ms-checkbox {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

/* 自定义勾选框 */
.ms-check-box {
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--border);
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}
.ms-check-box--checked {
  border-color: transparent;
  background: var(--accent);
}
.ms-check-mark {
  color: #fff;
  font-size: 11px;
  line-height: 1;
}

/* 颜色小圆点 */
.ms-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 选项文字 */
.ms-option-label {
  font-size: 0.92em;
}

/* 无匹配 */
.ms-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-dim);
  font-size: 0.9em;
}

/* 底部操作栏 */
.ms-actions {
  display: flex;
  border-top: 1px solid var(--border);
}
.ms-action-btn {
  flex: 1;
  padding: 8px;
  background: none;
  border: none;
  color: var(--accent-light);
  font-size: 0.88em;
  cursor: pointer;
  transition: background 0.15s;
}
.ms-action-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}
.ms-action-btn:first-child {
  border-right: 1px solid var(--border);
}
</style>
