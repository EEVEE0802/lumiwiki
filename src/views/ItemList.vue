<script setup>
import { ref, onMounted, computed } from 'vue'
import { loadData } from '../data'
import MultiSelect from '../components/MultiSelect.vue'

const items = ref([])
const locMap = ref({})
const loading = ref(true)
const searchQuery = ref('')
const filterType = ref([])

onMounted(async () => {
  const [data, loc] = await Promise.all([
    loadData('Item'),
    loadData('localization'),
  ])
  items.value = data
  locMap.value = loc
  loading.value = false
})

function getName(key) { return locMap.value[key] || key || '???' }

const QUALITY_MAP = { 1: '白', 2: '绿', 3: '蓝', 4: '紫', 5: '金', 6: '彩' }
const QUALITY_COLORS = {
  1: '#E0E0E0',  // 白色
  2: '#4CAF50',  // 绿色
  3: '#2196F3',  // 蓝色
  4: '#9C27B0',  // 紫色
  5: '#FFD700',  // 金色
  6: 'linear-gradient(135deg, #FF4081, #E040FB, #7C4DFF)',  // 彩色渐变
}

const typeOptions = computed(() => [
  { value: 2, label: '消耗品' },
  { value: 3, label: '材料' },
  { value: 4, label: '装备' },
])

const filtered = computed(() => {
  let list = items.value
  // 过滤掉 name 为空的物品（特殊不外显）
  list = list.filter(i => i.name && i.name.trim() !== '')
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(i =>
      getName(i.name).toLowerCase().includes(q) ||
      String(i.key1).includes(q)
    )
  }
  if (filterType.value.length) {
    list = list.filter(i => filterType.value.includes(i.type))
  }
  return list
})
</script>

<template>
  <div v-if="loading" class="loading">加载中...</div>
  <div v-else>
    <h1 class="page-title">🎒 物品图鉴</h1>

    <div class="filter-bar">
      <input v-model="searchQuery" placeholder="搜索物品名称或 ID..." />
      <MultiSelect
        v-model="filterType"
        :options="typeOptions"
        placeholder="全部类型"
      />
      <span class="result-count">共 {{ filtered.length }} 件</span>
    </div>

    <div class="table-wrap">
      <table class="data-table" v-if="filtered.length">
        <thead>
          <tr>
            <th>图标</th>
            <th>ID</th>
            <th>名称</th>
            <th>品质</th>
            <th>类型</th>
            <th>最大堆叠</th>
            <th>描述</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filtered" :key="item.key1">
            <td>
              <img
                v-if="item.icon"
                :src="`/images/items/${item.icon}.png`"
                class="table-item-icon"
                @error="($event.target).style.display='none'"
              />
            </td>
            <td>{{ item.key1 }}</td>
            <td class="font-bold">{{ getName(item.name) }}</td>
            <td>
              <span
                class="rarity-tag"
                :class="{ 'mythic-quality': item.quality === 6 }"
                :style="{ background: QUALITY_COLORS[item.quality] || '#666' }"
              >
                {{ QUALITY_MAP[item.quality] || item.quality }}
              </span>
            </td>
            <td>{{ item.type }}</td>
            <td>{{ item.maxStack }}</td>
            <td class="text-dim">{{ getName(item.des) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">没有找到匹配的物品</div>
    </div>
  </div>
</template>

<style scoped>
.result-count {
  color: var(--text-dim);
  display: flex;
  align-items: center;
  font-size: 0.9em;
}
.table-wrap { overflow-x: auto; }
.table-item-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  image-rendering: pixelated;
}
.font-bold { font-weight: 600; }
.text-dim { color: var(--text-dim); font-size: 0.9em; }
.rarity-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 0.85em;
  color: white;
}
.mythic-quality {
  animation: rainbow 3s ease infinite;
  background-size: 200% 200% !important;
}
@keyframes rainbow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
</style>
