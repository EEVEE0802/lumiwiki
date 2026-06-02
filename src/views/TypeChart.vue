<script setup>
import { ref, onMounted, computed } from 'vue'
import { loadData, TYPE_COLORS } from '../data'

const typeData = ref([])
const locMap = ref({})
const loading = ref(true)

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
              <img v-if="t.icon" :src="`/images/types/${t.icon}.png`" class="type-icon-sm" @error="($event.target).style.display='none'" />
              <span>{{ t.name }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(atk, i) in typeData" :key="atk.LumiType">
            <td class="type-header-row" :style="{ background: TYPE_COLORS[atk.LumiType] }">
              <img v-if="types[i].icon" :src="`/images/types/${types[i].icon}.png`" class="type-icon-sm" @error="($event.target).style.display='none'" />
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

    <!-- 属性详情卡片 -->
    <div class="section" style="margin-top:32px">
      <h2>属性详情</h2>
      <div class="grid grid-4">
        <div v-for="t in typeData" :key="t.LumiType" class="card type-detail-card">
          <div class="type-detail-header" :style="{ borderColor: TYPE_COLORS[t.LumiType] }">
            <span class="type-dot" :style="{ background: TYPE_COLORS[t.LumiType] }"></span>
            <strong>{{ locMap[t.name] || `属性${t.LumiType}` }}</strong>
          </div>
          <div class="type-detail-body">
            <div v-for="dk in TYPE_KEYS" :key="dk" class="type-detail-row">
              <span class="tdr-name">{{ locMap[typeData.find(x => x.LumiType === TYPE_KEYS.indexOf(dk) + 1)?.name] || dk }}</span>
              <span class="tdr-val" :class="getEffectiveness(getMultiplier(t, dk))">
                {{ getCellText(getMultiplier(t, dk)) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
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
.type-detail-card {
  padding: 12px;
  max-height: 300px;
  overflow-y: auto;
}
.type-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 2px solid;
}
.type-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.type-detail-body {
  font-size: 0.85em;
}
.type-detail-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
}
.tdr-name { color: var(--text-dim); }
.tdr-val { font-weight: 600; font-size: 1.3em; }
.tdr-val.super { color: #e57373; }
.tdr-val.effective { color: #66bb6a; }
.tdr-val.resist { color: #e57373; }
.tdr-val.weak { color: #66bb6a; }
.tdr-val.immune { color: #666; }
.tdr-val.normal { color: var(--text-dim); }
</style>
