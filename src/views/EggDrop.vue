<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const data = ref({ eggs: [] })
const selectedEgg = ref(null)
const loading = ref(true)

// 蛋品质配色（边框高亮）
const QUALITY_COLORS = { 1: '#9e9e9e', 2: '#4caf50', 3: '#2196f3', 4: '#9c27b0', 5: '#ff9800', 6: '#e91e63' }

onMounted(async () => {
  try {
    const res = await fetch('/data/egg-drop.json')
    data.value = await res.json()
    if (data.value.eggs?.length) selectedEgg.value = data.value.eggs[0]
  } catch (e) {
    console.error('加载蛋掉落数据失败:', e)
  }
  loading.value = false
})

function selectEgg(egg) { selectedEgg.value = egg }
function getAvatar(id) { return `/images/avatars/CA_${id}.png` }
function handleImgError(e) {
  e.target.onerror = null
  e.target.src = '/images/avatars/CA_lumi.png'
}
function goToLumi(id) { router.push(`/lumi/${id}`) }
</script>

<template>
  <div v-if="loading" class="loading">加载中...</div>
  <div v-else>
    <h1 class="page-title">🥚 蛋掉落</h1>
    <p class="page-subtitle">各类噜咪蛋开启时能开出的噜咪及概率</p>

    <!-- 蛋网格选择 -->
    <div class="egg-grid" v-if="data.eggs.length">
      <div
        v-for="egg in data.eggs"
        :key="egg.eggId"
        :class="['egg-card', { active: selectedEgg && selectedEgg.eggId === egg.eggId }]"
        :style="egg.quality ? { borderColor: QUALITY_COLORS[egg.quality] } : {}"
        @click="selectEgg(egg)"
      >
        <img
          v-if="egg.icon"
          :src="`/images/items/${egg.icon}.png`"
          :alt="egg.name"
          class="egg-icon"
          @error="handleImgError"
        />
        <div class="egg-name">{{ egg.name }}</div>
        <span class="egg-mode">{{ egg.modeName }}</span>
      </div>
    </div>

    <!-- 选中蛋的产出 -->
    <div v-if="selectedEgg" class="egg-detail">
      <div class="detail-header">
        <h2>{{ selectedEgg.name }}</h2>
        <span class="mode-tag">{{ selectedEgg.modeName }}</span>
        <span class="count-tag">共 {{ selectedEgg.lumis.length }} 种</span>
      </div>

      <div v-if="selectedEgg.lumis.length === 0" class="empty">
        ⚠️ 该蛋的掉落池数据缺失（游戏侧池子可能已调整）
      </div>

      <div v-else class="grid grid-5">
        <div
          v-for="lumi in selectedEgg.lumis"
          :key="lumi.id"
          class="card lumi-card"
          @click="goToLumi(lumi.id)"
        >
          <div class="lumi-avatar-box">
            <img
              :src="getAvatar(lumi.id)"
              :alt="lumi.name"
              class="lumi-avatar"
              @error="handleImgError"
            />
          </div>
          <div class="lumi-name">{{ lumi.name }}</div>
          <div class="lumi-prob">{{ lumi.probability }}%</div>
          <div v-if="lumi.weight != null" class="lumi-weight">权重 {{ lumi.weight }}</div>
          <div v-else-if="lumi.count != null" class="lumi-weight">{{ lumi.count }} 个候选</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-subtitle {
  color: var(--text-dim);
  margin: -8px 0 20px;
  font-size: 0.95em;
}

/* 蛋网格 */
.egg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
  margin-bottom: 24px;
}
.egg-card {
  background: var(--bg-card);
  border: 2px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 6px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}
.egg-card:hover {
  transform: translateY(-2px);
  background: var(--bg-card-hover);
}
.egg-card.active {
  box-shadow: 0 0 0 2px var(--accent);
}
.egg-icon {
  width: 60px;
  height: 60px;
  object-fit: contain;
  margin: 0 auto 6px;
  display: block;
}
.egg-name {
  color: #fff;
  font-size: 0.82em;
  font-weight: 600;
  margin-bottom: 4px;
  line-height: 1.2;
}
.egg-mode {
  font-size: 0.68em;
  color: var(--text-dim);
}

/* 选中蛋详情 */
.egg-detail {
  margin-top: 8px;
}
.detail-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.detail-header h2 {
  margin: 0;
  font-size: 1.3em;
  color: #fff;
}
.mode-tag {
  background: rgba(233, 69, 96, 0.15);
  color: var(--accent);
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 0.8em;
  font-weight: 600;
}
.count-tag {
  color: var(--text-dim);
  font-size: 0.85em;
}

/* 噜咪卡片 */
.lumi-card {
  text-align: center;
  cursor: pointer;
  padding: 12px 8px;
}
.lumi-avatar-box {
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lumi-avatar {
  max-height: 90px;
  max-width: 80px;
  object-fit: contain;
}
.lumi-name {
  color: #fff;
  font-weight: 600;
  font-size: 0.88em;
  margin: 6px 0 2px;
  line-height: 1.2;
}
.lumi-prob {
  color: var(--accent);
  font-weight: 700;
  font-size: 1em;
}
.lumi-weight {
  color: var(--text-dim);
  font-size: 0.72em;
  margin-top: 2px;
}
</style>
