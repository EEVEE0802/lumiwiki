<script setup>
import { ref, onMounted, computed } from 'vue'
import { loadData } from '../data'
import { useBattleText } from '../composables/useBattleText'

const allBuffs = ref([])
const locMap = ref({})
const loading = ref(true)
const searchQuery = ref('')

const { replacePlaceholders, selectedKeyword, showKeywordTooltip } = useBattleText(locMap)

onMounted(async () => {
  const [buffs, loc] = await Promise.all([
    loadData('BattleBuff'),
    loadData('localization')
  ])
  locMap.value = loc

  // 按 BuffId 合并（仅 Icon 非空）
  const byId = new Map()
  buffs.forEach(b => {
    if (!b.Icon || !b.Icon[0]) return
    if (!byId.has(b.BuffId)) {
      byId.set(b.BuffId, {
        id: b.BuffId,
        icon: b.Icon[0],
        levels: [],
        records: []
      })
    }
    const entry = byId.get(b.BuffId)
    entry.levels.push(b.BuffLv)
    entry.records.push(b)
  })

  // 每条取最高 Lv 作为代表（名称/描述/参数），同时收集所有 Name 变体
  allBuffs.value = Array.from(byId.values()).map(e => {
    const sorted = e.records.slice().sort((a, b) => b.BuffLv - a.BuffLv)
    const top = sorted[0]
    const nameVariants = [...new Set(e.records.map(r => r.Name[0]))]
      .map(k => loc[k] || k)
      .filter((v, i, arr) => arr.indexOf(v) === i)
    return {
      id: e.id,
      icon: e.icon,
      levelCount: e.levels.length,
      levels: e.levels,
      nameKey: top.Name[0],
      descKey: top.Des[0],
      desParam: top.DesParam || [],
      nameVariants
    }
  }).sort((a, b) => a.id - b.id)

  loading.value = false
})

function getName(b) {
  return locMap.value[b.nameKey] || b.nameKey
}

function getDesc(b) {
  const template = locMap.value[b.descKey] || ''
  return replacePlaceholders(template, b.desParam)
}

function getKeywordName(key) {
  return locMap.value[key] || key
}

function getIconUrl(icon) {
  return `/images/buffs/${icon}.png`
}

function handleImageError(e) {
  e.target.style.visibility = 'hidden'
}

function formatLevels(levels) {
  const sorted = [...levels].sort((a, b) => a - b)
  return sorted.join(', ')
}

const filteredBuffs = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return allBuffs.value
  return allBuffs.value.filter(b => {
    const name = getName(b).toLowerCase()
    return name.includes(q) || String(b.id).includes(q)
  })
})
</script>

<template>
  <div class="battle-buff-list">
    <div class="page-header">
      <h1>✨ Buff 图鉴</h1>
      <p class="subtitle">战斗中显示的所有状态效果（{{ allBuffs.length }} 种）</p>
    </div>

    <div class="search-bar">
      <input v-model="searchQuery" placeholder="按名称或 ID 搜索..." class="search-input">
      <span class="result-count" v-if="searchQuery">{{ filteredBuffs.length }} / {{ allBuffs.length }}</span>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="filteredBuffs.length === 0" class="no-result">未找到匹配的 buff</div>
    <div v-else class="buff-grid">
      <div v-for="buff in filteredBuffs" :key="buff.id" class="buff-card">
        <div class="buff-icon-wrapper">
          <img :src="getIconUrl(buff.icon)" :alt="getName(buff)" class="buff-icon" @error="handleImageError">
        </div>
        <div class="buff-info">
          <div class="buff-header">
            <span class="buff-id">#{{ buff.id }}</span>
            <span class="buff-level-count" :title="formatLevels(buff.levels)">{{ buff.levelCount }} 级</span>
          </div>
          <div class="buff-name">{{ getName(buff) }}</div>
          <div v-if="buff.nameVariants.length > 1" class="buff-variants">
            （{{ buff.nameVariants.join(' / ') }}）
          </div>
          <div class="buff-desc" v-html="getDesc(buff)"></div>
        </div>
      </div>
    </div>

    <!-- 关键字弹窗 -->
    <div v-if="showKeywordTooltip && selectedKeyword" class="tooltip-overlay" @click="showKeywordTooltip = false">
      <div class="tooltip-card" @click.stop>
        <div class="tooltip-header">
          <h3>{{ getKeywordName(selectedKeyword.Name) }}</h3>
          <button class="tooltip-close" @click="showKeywordTooltip = false">✕</button>
        </div>
        <div class="tooltip-body">
          {{ getKeywordName(selectedKeyword.Des) }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.battle-buff-list {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  text-align: center;
  margin-bottom: 24px;
}

.page-header h1 {
  color: #fff;
  font-size: 2em;
  margin-bottom: 8px;
}

.subtitle {
  color: var(--text-dim);
  font-size: 1em;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.result-count {
  color: var(--text-dim);
  font-size: 13px;
  white-space: nowrap;
}

.loading,
.no-result {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-dim);
}

.buff-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.buff-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  transition: all 0.2s;
}

.buff-card:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: var(--accent);
  transform: translateY(-2px);
}

.buff-icon-wrapper {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  overflow: hidden;
}

.buff-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.buff-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.buff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.buff-id {
  color: var(--text-dim);
  font-family: monospace;
}

.buff-level-count {
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 6px;
  border-radius: 3px;
  cursor: help;
}

.buff-name {
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.buff-variants {
  color: var(--text-dim);
  font-size: 12px;
}

.buff-desc {
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.5;
  margin-top: 2px;
}

.buff-desc :deep(.keyword-link) {
  font-weight: 500;
}

.tooltip-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.tooltip-card {
  background: var(--card-bg, #2a2a3a);
  border-radius: 8px;
  padding: 20px;
  max-width: 400px;
  width: 90%;
  max-height: 70vh;
  overflow-y: auto;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tooltip-header h3 {
  color: #fff;
  font-size: 1.1em;
  margin: 0;
}

.tooltip-close {
  background: none;
  border: none;
  color: #888;
  font-size: 1.5em;
  cursor: pointer;
  padding: 0 8px;
}

.tooltip-close:hover {
  color: #e94560;
}

.tooltip-body {
  color: #e0e0e0;
  line-height: 1.6;
  font-size: 14px;
}
</style>
