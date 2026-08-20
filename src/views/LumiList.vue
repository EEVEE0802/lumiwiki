<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { loadData, t, TYPE_NAMES, TYPE_COLORS, LUMI_TAG_NAMES, WORK_TYPE_NAMES } from '../data'
import { avatarUrl } from '../data/imageUrl'
import MultiSelect from '../components/MultiSelect.vue'

const route = useRoute()
const lumis = ref([])
const locMap = ref({})
const marketPrices = ref({})
const avgData = ref([])
const orderNpcData = ref([])
const loading = ref(true)

// 审查模式：外显每只噜咪的详细信息（立绘/名字/赛季/性别比例/身高体重/初见/订单/故事）
// 用 localStorage 记忆，切页也不掉；默认关闭
const REVIEW_KEY = 'lumiwiki-review-mode'
const reviewMode = ref(localStorage.getItem(REVIEW_KEY) === '1')
function toggleReview() {
  reviewMode.value = !reviewMode.value
  localStorage.setItem(REVIEW_KEY, reviewMode.value ? '1' : '0')
}

// 筛选条件
const searchQuery = ref('')
const filterType = ref([])
const filterTag = ref([])
const filterMinScore = ref('')
const filterMaxScore = ref('')
const filterWorkType = ref([])
const filterCardBack = ref('all') // 卡背类型筛选：all 全部 / 0普通 50异色 80王 98 3D 99全景
const sortBy = ref('id')

onMounted(async () => {
  const [data, loc, market, avg, orderNpc] = await Promise.all([
    loadData('Lumi'),
    loadData('localization'),
    loadData('MarketPrice').catch(() => []),
    loadData('Avg').catch(() => []),
    loadData('OrderNPC').catch(() => []),
  ])
  lumis.value = data
  locMap.value = loc
  marketPrices.value = Array.isArray(market) ? market : []
  avgData.value = Array.isArray(avg) ? avg : []
  orderNpcData.value = Array.isArray(orderNpc) ? orderNpc : []
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

// 通用 locMap 查询（订单/故事直接是 key）
function getLoc(key) {
  return key ? (locMap.value[key] || '') : ''
}
function hasValidContent(key) {
  const val = key ? locMap.value[key] : ''
  return val && val !== '无' && val.trim() !== ''
}

// 获取属性名
function getTypeName(typeId) {
  return TYPE_NAMES[typeId] || '无'
}

// 赛季名
function getTagName(tagId) {
  return LUMI_TAG_NAMES[tagId] || ''
}

// 获取金色基础价格
function getGoldPrice(lumiId) {
  const priceData = marketPrices.value.find(p => p.id === lumiId)
  return priceData?.priceDefault ?? null
}

// 性别比例（跟 LumiDetail 一致）
function getGenderRatio(lumi) {
  if (!lumi.GenderWeight?.length) return null
  const total = lumi.GenderWeight.reduce((s, x) => s + x[1], 0)
  if (total === 0) return null
  const map = { 1: '♂ 雄性', 2: '♀ 雌性', 3: '无性别' }
  const out = []
  for (const [type, weight] of lumi.GenderWeight) {
    if (weight > 0) out.push({ name: map[type] || type, percent: Math.round(weight / total * 100) })
  }
  return out.length ? out : null
}

// 身高体重（跟 LumiDetail 一致）
function getLumiAttribute(lumi) {
  if (!lumi.LumiAttribute?.length) return null
  const fmt = v => {
    if (Array.isArray(v)) {
      if (v.length === 1) return String(v[0])
      return v[0] === v[1] ? String(v[0]) : v[0] + '~' + v[1]
    }
    return String(v)
  }
  const r = {}
  for (const [type, val] of lumi.LumiAttribute) {
    if (type === 1) r.height = fmt(val)
    else if (type === 2) r.weight = fmt(val)
  }
  return (r.height || r.weight) ? r : null
}

// 初见文本 key（Avg 表按 CharacterID 查第一条有 Content 的）
function getFirstMeetKey(lumiId) {
  if (!avgData.value.length) return null
  const list = avgData.value.filter(a => a.CharacterID === lumiId)
  for (const a of list) {
    if (a.Content && a.Content.length > 0) return a.Content[0]
  }
  return null
}

// 初见文本渲染（去 \n 前面部分、去富文本标签，跟 LumiDetail 一致）
function getFirstMeetText(lumiId) {
  const key = getFirstMeetKey(lumiId)
  if (!key) return ''
  const raw = locMap.value[key] || ''
  if (!raw) return ''
  const parts = raw.split('\\n')
  let text = parts.length > 1 ? parts[1] : raw
  return text.replace(/<[^>]+>/g, '').trim()
}

// 订单文本 key（OrderNPC.NPCid 映射到 lumi.Id）
function getOrderKey(lumiId) {
  const entry = orderNpcData.value.find(n => n.NPCid === lumiId)
  return entry?.NPCdialogue || null
}

// 属性筛选选项
const typeOptions = computed(() => {
  const opts = []
  for (const [k, v] of Object.entries(TYPE_NAMES)) {
    opts.push({ value: Number(k), label: v })
  }
  return opts
})

// 赛季筛选选项
const tagOptions = computed(() => {
  const opts = []
  for (const [k, v] of Object.entries(LUMI_TAG_NAMES)) {
    opts.push({ value: Number(k), label: v })
  }
  return opts
})

// 打工类型筛选选项
const workTypeOptions = computed(() => {
  const opts = []
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

  // 属性筛选（多选 OR）
  if (filterType.value.length) {
    list = list.filter(l => filterType.value.includes(l.Type1) || filterType.value.includes(l.Type2))
  }

  // 赛季筛选（多选 OR）
  if (filterTag.value.length) {
    list = list.filter(l => filterTag.value.includes(l.LumiTag))
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

  // 打工能力筛选（多选 OR）
  if (filterWorkType.value.length) {
    list = list.filter(l =>
      l.WorkAbility && l.WorkAbility.some(w => filterWorkType.value.includes(w.Type))
    )
  }

  // 卡背类型筛选（LumiCardType: 0普通/50异色/80王/98 3D/99全景）
  if (filterCardBack.value !== 'all') {
    const v = Number(filterCardBack.value)
    list = list.filter(l => (l.CardBack || 0) === v)
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
    <div class="page-header">
      <h1 class="page-title">🐾 噜咪图鉴</h1>
      <button
        class="review-toggle"
        :class="{ active: reviewMode }"
        @click="toggleReview"
        :title="reviewMode ? '当前：审查模式（直接展示详情）' : '当前：正常模式（网格卡片）'"
      >
        {{ reviewMode ? '🔍 审查模式' : '📇 正常模式' }}
      </button>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <input v-model="searchQuery" placeholder="搜索名称或 ID..." />
      <MultiSelect
        v-model="filterType"
        :options="typeOptions"
        placeholder="全部属性"
        :colors="TYPE_COLORS"
        searchable
      />
      <MultiSelect
        v-model="filterTag"
        :options="tagOptions"
        placeholder="全部赛季"
      />
      <input v-model="filterMinScore" placeholder="最小资质" type="number" style="width: 100px" />
      <input v-model="filterMaxScore" placeholder="最大资质" type="number" style="width: 100px" />
      <MultiSelect
        v-model="filterWorkType"
        :options="workTypeOptions"
        placeholder="全部打工"
        searchable
      />
      <select v-model="filterCardBack">
        <option value="all">全部个体</option>
        <option value="0">普通</option>
        <option value="50">异色</option>
        <option value="80">王</option>
        <option value="98">3D</option>
        <option value="99">全景</option>
      </select>
      <select v-model="sortBy">
        <option value="id">按 ID 排序</option>
        <option value="name">按名称排序</option>
        <option value="priceAsc">按价格升序</option>
        <option value="priceDesc">按价格降序</option>
      </select>
      <span class="result-count">共 {{ filtered.length }} 只</span>
    </div>

    <!-- 正常模式：噜咪卡片网格 -->
    <div v-if="!reviewMode && filtered.length" class="grid grid-5">
      <router-link
        v-for="lumi in filtered"
        :key="lumi.Id"
        :to="`/lumi/${lumi.Id}`"
        class="card lumi-card"
        target="_blank"
      >
        <div class="lumi-avatar">
          <div class="lumi-id">#{{ lumi.PokedexId }}</div>
          <img
            :src="avatarUrl(lumi.CA)"
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

    <!-- 审查模式：外显每只噜咪的详细信息（不做跳转） -->
    <div v-else-if="reviewMode && filtered.length" class="review-list">
      <div v-for="lumi in filtered" :key="lumi.Id" class="review-card">
        <div class="review-avatar">
          <div class="review-id">#{{ lumi.PokedexId }}</div>
          <img
            :src="avatarUrl(lumi.CA)"
            :alt="getName(lumi)"
            class="review-img"
            @error="($event.target).style.display='none';($event.target).nextElementSibling.style.display='block'"
          />
          <div class="review-icon-fallback" style="display:none">🐾</div>
        </div>
        <div class="review-body">
          <div class="review-header">
            <span class="review-name">{{ getName(lumi) }}</span>
            <span v-if="lumi.LumiTag" class="review-tag">{{ getTagName(lumi.LumiTag) }}</span>
          </div>

          <div class="review-meta">
            <div v-if="getGenderRatio(lumi)" class="review-meta-item">
              <span class="review-label">性别比例</span>
              <span class="review-value">
                <span v-for="g in getGenderRatio(lumi)" :key="g.name" class="review-gender">
                  {{ g.name }} {{ g.percent }}%
                </span>
              </span>
            </div>
            <div v-if="getLumiAttribute(lumi)" class="review-meta-item">
              <span class="review-label">身高体重</span>
              <span class="review-value">
                <span v-if="getLumiAttribute(lumi).height">身高 {{ getLumiAttribute(lumi).height }} cm</span>
                <span v-if="getLumiAttribute(lumi).weight">体重 {{ getLumiAttribute(lumi).weight }} kg</span>
              </span>
            </div>
          </div>

          <div v-if="getFirstMeetText(lumi.Id)" class="review-section">
            <div class="review-section-title">初见</div>
            <div class="review-section-body">{{ getFirstMeetText(lumi.Id) }}</div>
          </div>
          <div v-if="hasValidContent(getOrderKey(lumi.Id))" class="review-section">
            <div class="review-section-title">订单</div>
            <div class="review-section-body">{{ getLoc(getOrderKey(lumi.Id)) }}</div>
          </div>
          <div v-if="hasValidContent(lumi.Story)" class="review-section">
            <div class="review-section-title">故事</div>
            <div class="review-section-body">{{ getLoc(lumi.Story) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty">没有找到匹配的噜咪</div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.review-toggle {
  padding: 8px 16px;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  background: rgba(255,255,255,0.05);
  color: var(--text);
  font-size: 0.9em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.review-toggle:hover {
  background: rgba(255,255,255,0.1);
  border-color: rgba(255,255,255,0.25);
}
.review-toggle.active {
  background: linear-gradient(135deg, #a493e0 0%, #764ba2 100%);
  border-color: #a493e0;
  color: #fff;
}
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

/* ============ 审查模式 ============ */
.review-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.review-card {
  display: flex;
  gap: 20px;
  padding: 18px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
}
.review-avatar {
  flex-shrink: 0;
  width: 140px;
  text-align: center;
}
.review-id {
  font-size: 0.8em;
  color: var(--text-dim);
  margin-bottom: 6px;
}
.review-img {
  width: 140px;
  height: 180px;
  object-fit: contain;
  display: block;
}
.review-icon-fallback {
  font-size: 4em;
  padding: 40px 0;
}
.review-body {
  flex: 1;
  min-width: 0;
}
.review-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.review-name {
  font-size: 1.4em;
  font-weight: 700;
  color: #fff;
}
.review-tag {
  padding: 2px 10px;
  background: rgba(164, 147, 224, 0.2);
  color: #a493e0;
  border-radius: 10px;
  font-size: 0.8em;
  font-weight: 600;
}
.review-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 14px;
  font-size: 0.9em;
}
.review-meta-item {
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.review-label {
  color: var(--text-dim);
  font-size: 0.85em;
}
.review-value {
  color: var(--text);
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.review-gender + .review-gender::before {
  content: '·';
  margin-right: 8px;
  color: var(--text-dim);
}
.review-section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(255,255,255,0.08);
}
.review-section-title {
  color: #a493e0;
  font-size: 0.85em;
  font-weight: 600;
  margin-bottom: 4px;
}
.review-section-body {
  color: var(--text);
  font-size: 0.9em;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
