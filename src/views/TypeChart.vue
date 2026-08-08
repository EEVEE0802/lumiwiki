<script setup>
import { ref, onMounted, computed } from 'vue'
import { loadData, TYPE_COLORS } from '../data'
import { typeIconUrl } from '../data/imageUrl'

const typeData = ref([])
const locMap = ref({})
const loading = ref(true)
const selectedDefTypes = ref([])  // 选中的防御属性 id（最多 2 个）

onMounted(async () => {
  const [data, loc] = await Promise.all([
    loadData('LumiTypeCounter'),
    loadData('localization'),
  ])
  typeData.value = data
  locMap.value = loc
  loading.value = false
})

// 属性列表（用于表头）
const types = computed(() =>
  typeData.value.map(t => ({
    id: t.LumiType,
    name: locMap.value[t.name] || `属性${t.LumiType}`,
    color: TYPE_COLORS[t.LumiType] || '#666',
    icon: t.icon,
  }))
)

// 克制关系列表（攻击方 -> 防御方）
const TYPE_KEYS = [
  'Neutral', 'Water', 'Fire', 'Grass', 'Lighting', 'Earth',
  'Fly', 'Ice', 'Dragon', 'Bright', 'Dark', 'Fight', 'Psychic',
  'Fairy', 'Steel', 'King', 'God',
]

function getMultiplier(atkType, defKey) {
  return atkType[defKey] || 10000
}

function getEffectiveness(mult) {
  if (mult === 0) return 'immune'
  if (mult < 10000) return 'resist'
  if (mult === 10000) return 'normal'
  return 'effective'
}

function getCellColor(mult) {
  const eff = getEffectiveness(mult)
  switch (eff) {
    case 'immune': return '#333'
    case 'resist': return '#e57373'
    case 'normal': return '#333'
    case 'effective': return '#66bb6a'
    default: return '#333'
  }
}

function getCellText(mult) {
  const val = mult / 10000
  const eff = getEffectiveness(mult)
  switch (eff) {
    case 'immune': return '0'
    case 'resist': return '↓'
    case 'normal': return ''
    case 'effective': return '↑'
    default: return ''
  }
}

// === 双属性克制查询 ===
function toggleDefType(typeId) {
  const idx = selectedDefTypes.value.indexOf(typeId)
  if (idx !== -1) {
    selectedDefTypes.value.splice(idx, 1)
  } else if (selectedDefTypes.value.length < 2) {
    selectedDefTypes.value.push(typeId)
  } else {
    // 已选 2 个：替换掉第一个（FIFO）
    selectedDefTypes.value.shift()
    selectedDefTypes.value.push(typeId)
  }
}

function clearDefTypes() {
  selectedDefTypes.value = []
}

// 组合倍率：多个防御属性的倍率相乘（宝可梦机制），基准 10000
function getComboMultiplier(atkType, defTypeIds) {
  if (defTypeIds.length === 0) return 10000
  let result = 10000
  for (const defId of defTypeIds) {
    const defKey = TYPE_KEYS[defId - 1]
    const m = getMultiplier(atkType, defKey)
    result = Math.floor(result * m / 10000)
  }
  return result
}

// 组合克制的效果分级（含双箭头）
function getComboEffectiveness(mult) {
  if (mult === 0) return 'immune'
  if (mult < 5000) return 'resist-strong'      // <0.5x → ↓↓
  if (mult < 10000) return 'resist'            // 0.5-0.9x → ↓
  if (mult === 10000) return 'normal'          // 1.0x → —
  if (mult < 20000) return 'effective'         // 1.1-1.9x → ↑
  return 'effective-strong'                    // ≥2.0x → ↑↑
}

function getComboText(mult) {
  const eff = getComboEffectiveness(mult)
  switch (eff) {
    case 'immune': return '0'
    case 'resist-strong': return '↓↓'
    case 'resist': return '↓'
    case 'normal': return '—'
    case 'effective': return '↑'
    case 'effective-strong': return '↑↑'
    default: return '—'
  }
}

// 结果列表：17 攻击属性 × 当前防御组合
const comboResults = computed(() => {
  if (selectedDefTypes.value.length === 0) return []
  return typeData.value.map(atk => {
    const mult = getComboMultiplier(atk, selectedDefTypes.value)
    return {
      atkId: atk.LumiType,
      atkName: locMap.value[atk.name] || `属性${atk.LumiType}`,
      atkColor: TYPE_COLORS[atk.LumiType] || '#666',
      atkIcon: atk.icon,
      mult,
      eff: getComboEffectiveness(mult),
      text: getComboText(mult),
      ratio: (mult / 10000).toFixed(2)
    }
  })
})

// 已选属性的展示信息
const selectedDefInfos = computed(() =>
  selectedDefTypes.value.map(id => {
    const t = typeData.value.find(x => x.LumiType === id)
    return {
      id,
      name: t ? (locMap.value[t.name] || `属性${id}`) : `属性${id}`,
      color: TYPE_COLORS[id] || '#666',
      icon: t?.icon
    }
  })
)
</script>

<template>
  <div v-if="loading" class="loading">加载中...</div>
  <div v-else>
    <h1 class="page-title">🔥 属性克制表</h1>
    <p class="chart-desc">左侧为攻击方属性，顶部为防御方属性。</p>

    <!-- 图例 -->
    <div class="legend">
      <span class="legend-item" style="background:#66bb6a">克制</span>
      <span class="legend-item" style="background:#333">正常</span>
      <span class="legend-item" style="background:#e57373">抵抗</span>
    </div>

    <div class="chart-wrap">
      <table class="type-table">
        <thead>
          <tr>
            <th class="corner">攻 \\ 守</th>
            <th v-for="t in types" :key="t.id" class="type-header" :style="{ background: t.color }">
              <img v-if="t.icon" :src="typeIconUrl(t.icon)" class="type-icon-sm" @error="($event.target).style.display='none'" />
              <span>{{ t.name }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(atk, i) in typeData" :key="atk.LumiType">
            <td class="type-header-row" :style="{ background: TYPE_COLORS[atk.LumiType] }">
              <img v-if="types[i].icon" :src="typeIconUrl(types[i].icon)" class="type-icon-sm" @error="($event.target).style.display='none'" />
              <span>{{ types[i].name }}</span>
            </td>
            <td
              v-for="(defKey, j) in TYPE_KEYS"
              :key="defKey"
              class="type-cell"
              :style="{ background: getCellColor(getMultiplier(atk, defKey)) }"
            >
              {{ getCellText(getMultiplier(atk, defKey)) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 双属性克制查询 -->
    <div class="section" style="margin-top:32px">
      <h2>🎯 双属性克制查询</h2>
      <p class="chart-desc">选择最多 2 个属性作为「防御方」，查看其他所有属性攻击该属性组合时的克制关系（双箭头 = 双重克制/双重抵抗）。</p>

      <!-- 属性选择器 -->
      <div class="type-selector">
        <button
          v-for="t in types"
          :key="t.id"
          class="type-chip"
          :class="{ 'is-selected': selectedDefTypes.includes(t.id) }"
          :style="selectedDefTypes.includes(t.id) ? { background: t.color, borderColor: t.color } : {}"
          @click="toggleDefType(t.id)"
        >
          <img v-if="t.icon" :src="typeIconUrl(t.icon)" class="type-icon-sm" @error="($event.target).style.display='none'" />
          <span>{{ t.name }}</span>
        </button>
      </div>

      <!-- 已选防御组合 -->
      <div class="selected-info">
        <template v-if="selectedDefInfos.length > 0">
          <span class="selected-label">当前防御组合：</span>
          <span v-for="(s, i) in selectedDefInfos" :key="s.id" class="selected-type" :style="{ background: s.color }">
            <img v-if="s.icon" :src="typeIconUrl(s.icon)" class="type-icon-sm" @error="($event.target).style.display='none'" />
            <span>{{ s.name }}</span>
          </span>
          <button class="clear-btn" @click="clearDefTypes">✕ 清空</button>
        </template>
        <template v-else>
          <span class="hint">👆 点击上方属性 chip 选择（最多 2 个；已选 2 个时再点新属性会替换最早选的）</span>
        </template>
      </div>

      <!-- 结果网格 -->
      <div v-if="comboResults.length > 0" class="combo-results">
        <div v-for="r in comboResults" :key="r.atkId" class="combo-card" :class="`eff-${r.eff}`">
          <div class="combo-atk" :style="{ background: r.atkColor }">
            <img v-if="r.atkIcon" :src="typeIconUrl(r.atkIcon)" class="type-icon-sm" @error="($event.target).style.display='none'" />
            <span>{{ r.atkName }}</span>
          </div>
          <div class="combo-effect">{{ r.text }}</div>
          <div class="combo-ratio">{{ r.ratio }}x</div>
        </div>
      </div>
    </div>

    <!-- 属性详情卡片 -->
  </div>
</template>

<style scoped>
.chart-desc {
  color: var(--text-dim);
  margin-bottom: 16px;
}
.legend {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.legend-item {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.8em;
  color: #fff;
}
.chart-wrap {
  overflow-x: auto;
  padding-bottom: 8px;
}
.type-table {
  border-collapse: collapse;
  font-size: 0.85em;
}
.type-table th,
.type-table td {
  padding: 6px 8px;
  text-align: center;
  border: 1px solid #222;
  white-space: nowrap;
}
.corner {
  background: var(--bg-card);
  color: var(--text-dim);
  font-size: 0.75em;
}
.type-header {
  color: #fff;
  font-size: 0.8em;
  font-weight: 600;
  writing-mode: vertical-lr;
  min-width: 36px;
  text-align: center;
}
.type-icon-sm {
  width: 20px;
  height: 20px;
  object-fit: contain;
  writing-mode: horizontal-tb;
  display: block;
  margin: 0 auto 4px;
}
.type-header-row {
  color: #fff;
  font-weight: 600;
  font-size: 0.85em;
  white-space: nowrap;
}
.type-cell {
  color: #ddd;
  font-size: 2em;
  min-width: 36px;
}
.section h2 {
  color: #fff;
  font-size: 1.2em;
  margin-bottom: 16px;
}

/* 双属性克制查询 */
.type-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.type-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: #ddd;
  font-size: 0.9em;
  cursor: pointer;
  transition: all 0.15s;
}
.type-chip:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-1px);
}
.type-chip.is-selected {
  color: #fff;
  font-weight: bold;
}
.type-chip .type-icon-sm {
  width: 18px;
  height: 18px;
  margin: 0;
}
.selected-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 16px;
  min-height: 46px;
}
.selected-label {
  color: var(--text-dim);
  font-size: 0.9em;
}
.selected-type {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 5px;
  color: #fff;
  font-weight: bold;
  font-size: 0.9em;
}
.selected-type .type-icon-sm {
  width: 16px;
  height: 16px;
  margin: 0;
}
.clear-btn {
  margin-left: auto;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-dim);
  font-size: 0.85em;
  cursor: pointer;
}
.clear-btn:hover {
  color: #e57373;
  border-color: #e57373;
}
.hint {
  color: var(--text-dim);
  font-size: 0.9em;
}
.combo-results {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}
.combo-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-left: 4px solid var(--border);
  border-radius: 6px;
  transition: transform 0.15s;
}
.combo-card:hover {
  transform: translateY(-2px);
}
.combo-atk {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  color: #fff;
  font-size: 0.85em;
  font-weight: 600;
  white-space: nowrap;
}
.combo-atk .type-icon-sm {
  width: 16px;
  height: 16px;
  margin: 0;
}
.combo-effect {
  font-size: 1.5em;
  font-weight: bold;
  margin-left: auto;
  line-height: 1;
}
.combo-ratio {
  font-size: 0.75em;
  color: var(--text-dim);
  min-width: 42px;
  text-align: right;
}
.combo-card.eff-immune { border-left-color: #666; }
.combo-card.eff-immune .combo-effect { color: #888; font-size: 1em; }
.combo-card.eff-resist-strong { border-left-color: #c62828; }
.combo-card.eff-resist-strong .combo-effect { color: #ff5252; }
.combo-card.eff-resist { border-left-color: #ef5350; }
.combo-card.eff-resist .combo-effect { color: #e57373; }
.combo-card.eff-normal { border-left-color: var(--border); }
.combo-card.eff-normal .combo-effect { color: var(--text-dim); }
.combo-card.eff-effective { border-left-color: #66bb6a; }
.combo-card.eff-effective .combo-effect { color: #81c784; }
.combo-card.eff-effective-strong { border-left-color: #2e7d32; }
.combo-card.eff-effective-strong .combo-effect { color: #4caf50; }
</style>
