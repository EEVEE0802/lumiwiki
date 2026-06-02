<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { loadData, t, TYPE_NAMES, TYPE_COLORS, LUMI_TAG_NAMES, WORK_TYPE_NAMES } from '../data'

const route = useRoute()
const lumis = ref([])
const locMap = ref({})
const marketPrices = ref({})
const loading = ref(true)

// 筛选条件
const searchQuery = ref('')
const filterType = ref(0)
const filterTag = ref(0)
const filterMinScore = ref('')
const filterMaxScore = ref('')
const filterWorkType = ref(0)
const sortBy = ref('id')

onMounted(async () => {
  const [data, loc, market] = await Promise.all([
    loadData('Lumi'),
    loadData('localization'),
    loadData('MarketPrice').catch(() => []),
  ])
  lumis.value = data
  locMap.value = loc
  marketPrices.value = Array.isArray(market) ? market : []
  loading.value = false

  // 从 URL 参数读取搜索词
  if (route.query.search) {
    searchQuery.value = route.query.search
  }
})

// 获取噜咪显示名
function getName(lumi) {
  return locMap.value[lumi.Name] || `噜咪 #${lumi.Id}`
}

// 获取属性名
function getTypeName(typeId) {
  return TYPE_NAMES[typeId] || '无'
}

// 获取金色基础价格
function getGoldPrice(lumiId) {
  const priceData = marketPrices.value.find(p => p.id === lumiId)
  return priceData?.priceDefault ?? null
}

// 属性筛选选项
const typeOptions = computed(() => {
  const opts = [{ value: 0, label: '全部属性' }]
  for (const [k, v] of Object.entries(TYPE_NAMES)) {
    opts.push({ value: Number(k), label: v })
  }
  return opts
})

// 赛季筛选选项
const tagOptions = computed(() => {
  const opts = [{ value: 0, label: '全部赛季' }]
  for (const [k, v] of Object.entries(LUMI_TAG_NAMES)) {
    opts.push({ value: Number(k), label: v })
  }
  return opts
})

// 打工类型筛选选项
const workTypeOptions = computed(() => {
  const opts = [{ value: 0, label: '全部打工' }]
  for (const [k, v] of Object.entries(WORK_TYPE_NAMES)) {
    opts.push({ value: Number(k), label: v })
  }
  return opts
})

// 筛选 + 排序
const filtered = computed(() => {
  let list = lumis.value

  // 搜索
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(l =>
      getName(l).toLowerCase().includes(q) ||
      String(l.Id).includes(q) ||
      String(l.PokedexId).includes(q)
    )
  }

  // 属性筛选
  if (filterType.value) {
    list = list.filter(l => l.Type1 === filterType.value || l.Type2 === filterType.value)
  }

  // 赛季筛选
  if (filterTag.value) {
    list = list.filter(l => l.LumiTag === filterTag.value)
  }

  // 资质范围筛选（都针对 MaxScore）
  if (filterMinScore.value !== '') {
    const minVal = parseInt(filterMinScore.value)
    if (!isNaN(minVal)) {
      list = list.filter(l => l.MaxScore >= minVal)
    }
  }
  if (filterMaxScore.value !== '') {
    const maxVal = parseInt(filterMaxScore.value)
    if (!isNaN(maxVal)) {
      list = list.filter(l => l.MaxScore <= maxVal)
    }
  }

  // 打工能力筛选
  if (filterWorkType.value) {
    list = list.filter(l =>
      l.WorkAbility && l.WorkAbility.some(w => w.Type === filterWorkType.value)
    )
  }

  // 排序（默认按 PokedexId 升序）
  list = [...list].sort((a, b) => {
    if (sortBy.value === 'id') return a.PokedexId - b.PokedexId
    if (sortBy.value === 'name') return getName(a).localeCompare(getName(b))
    if (sortBy.value === 'priceAsc') {
      const priceA = getGoldPrice(a.Id)
      const priceB = getGoldPrice(b.Id)
      if (priceA === null && priceB === null) return 0
      if (priceA === null) return 1
      if (priceB === null) return -1
      if (priceA !== priceB) return priceA - priceB
      return a.PokedexId - b.PokedexId
    }
    if (sortBy.value === 'priceDesc') {
      const priceA = getGoldPrice(a.Id)
      const priceB = getGoldPrice(b.Id)
      if (priceA === null && priceB === null) return 0
      if (priceA === null) return 1
      if (priceB === null) return -1
      if (priceA !== priceB) return priceB - priceA
      return a.PokedexId - b.PokedexId
    }
    return 0
  })

  return list
})
</script>

<template>
  <div v-if="loading" class="loading">加载中...</div>
  <div v-else>
    <h1 class="page-title">🐾 噜咪图鉴</h1>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <input v-model="searchQuery" placeholder="搜索名称或 ID..." />
      <select v-model="filterType">
        <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <select v-model="filterTag">
        <option v-for="opt in tagOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <input v-model="filterMinScore" placeholder="最小资质" type="number" style="width: 100px" />
      <input v-model="filterMaxScore" placeholder="最大资质" type="number" style="width: 100px" />
      <select v-model="filterWorkType">
        <option v-for="opt in workTypeOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <select v-model="sortBy">
        <option value="id">按 ID 排序</option>
        <option value="name">按名称排序</option>
        <option value="priceAsc">按价格升序</option>
        <option value="priceDesc">按价格降序</option>
      </select>
      <span class="result-count">共 {{ filtered.length }} 只</span>
    </div>

    <!-- 噜咪卡片列表 -->
    <div class="grid grid-5" v-if="filtered.length">
      <router-link
        v-for="lumi in filtered"
        :key="lumi.Id"
        :to="`/lumi/${lumi.Id}`"
        class="card lumi-card"
      >
        <div class="lumi-avatar">
          <div class="lumi-id">#{{ lumi.PokedexId }}</div>
          <img
            :src="`/images/avatars/${lumi.CA}.png`"
            :alt="getName(lumi)"
            class="lumi-img"
            @error="($event.target).style.display='none';($event.target).nextElementSibling.style.display='block'"
          />
          <div class="lumi-icon-fallback" style="display:none">🐾</div>
        </div>
        <div class="lumi-name">{{ getName(lumi) }}</div>
        <div class="lumi-types">
          <span
            class="type-tag"
            :style="{ background: TYPE_COLORS[lumi.Type1] || '#666' }"
          >{{ getTypeName(lumi.Type1) }}</span>
          <span
            v-if="lumi.Type2"
            class="type-tag"
            :style="{ background: TYPE_COLORS[lumi.Type2] || '#666' }"
          >{{ getTypeName(lumi.Type2) }}</span>
        </div>
        <div class="lumi-score">
          <span class="score-range">{{ lumi.MaxScore }}</span>
        </div>
      </router-link>
    </div>

    <div v-else class="empty">没有找到匹配的噜咪</div>
  </div>
</template>

<style scoped>
.result-count {
  color: var(--text-dim);
  display: flex;
  align-items: center;
  font-size: 0.9em;
}
.lumi-card {
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  padding: 14px 10px;
}
.lumi-card:hover { text-decoration: none; }
.lumi-avatar {
  position: relative;
  margin-bottom: 8px;
}
.lumi-id {
  font-size: 0.75em;
  color: var(--text-dim);
}
.lumi-img {
  width: 80px;
  height: 100px;
  object-fit: contain;
  margin: 4px auto;
  display: block;
}
.lumi-icon-fallback {
  font-size: 2.5em;
  margin: 4px 0;
}
.lumi-name {
  font-weight: 600;
  color: #fff;
  margin-bottom: 6px;
  font-size: 0.95em;
}
.lumi-types {
  display: flex;
  gap: 4px;
  justify-content: center;
  margin-bottom: 6px;
}
.lumi-score {
  margin-top: 4px;
  font-size: 0.8em;
  color: var(--text-dim);
}
</style>
