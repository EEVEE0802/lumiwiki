<template>
  <div class="adventure-drop">
    <div class="page-header">
      <h1>🗺️ 冒险掉落</h1>
      <p class="subtitle">各地图噜咪出现概率查询</p>
      <p class="update-time">数据更新时间: {{ formatTime(data.updateTime) }}</p>
    </div>

    <!-- 地图选择 -->
    <div class="map-selector">
      <div class="map-tabs">
        <button
          :class="['map-tab', { active: selectedMapType === 'mainline' }]"
          @click="selectMapType('mainline')"
        >
          📖 主线地图
        </button>
        <button
          :class="['map-tab', { active: selectedMapType === 'season' }]"
          @click="selectMapType('season')"
        >
          ⭐ 赛季地图
        </button>
      </div>

      <div class="map-list" v-if="selectedMapType === 'mainline' && mainLineMaps.length > 0">
        <button
          v-for="map in mainLineMaps"
          :key="map.mapId"
          :class="['map-item', { active: selectedMap && selectedMap.mapId === map.mapId }]"
          @click="selectMap(map)"
        >
          {{ map.mapName }}
        </button>
      </div>

      <div class="map-list" v-if="selectedMapType === 'season' && seasonMaps.length > 0">
        <button
          v-for="map in seasonMaps"
          :key="map.mapId"
          :class="['map-item', { active: selectedMap && selectedMap.mapId === map.mapId }]"
          @click="selectMap(map)"
        >
          {{ map.mapName }}
        </button>
      </div>
    </div>

    <!-- 概率类型切换 -->
    <div class="color-toggle" v-if="selectedMap">
      <button
        :class="['toggle-btn', { active: !showColor }]"
        @click="showColor = false"
      >
        📊 普通概率
      </button>
      <button
        :class="['toggle-btn', { active: showColor }]"
        @click="showColor = true"
      >
        🌈 彩色概率
      </button>
    </div>

    <!-- 主线地图阶段选择 -->
    <div class="stage-selector" v-if="selectedMap && selectedMap.type === 'mainline' && !showColor">
      <div class="stage-tabs">
        <button
          v-for="stage in selectedMap.stages"
          :key="`${stage.stage}-${stage.status}`"
          :class="['stage-tab', { active: selectedStage && selectedStage.stage === stage.stage && selectedStage.status === stage.status }]"
          @click="selectStage(stage)"
        >
          {{ stage.label }}
        </button>
      </div>
    </div>

    <!-- 噜咪列表 -->
    <div class="lumi-list" v-if="(showColor && currentColorLumis.length > 0) || (!showColor && currentLumis.length > 0)">
      <div class="list-header">
        <span class="total-weight">总权重: {{ currentTotalWeight }}</span>
      </div>

      <div class="lumi-grid">
        <div
          v-for="lumi in showColor ? currentColorLumis : currentLumis"
          :key="lumi.id"
          class="lumi-card"
          @click="goToLumi(lumi.id)"
        >
          <div class="lumi-avatar-wrapper">
            <img
              :src="getLumiAvatar(lumi.id)"
              :alt="lumi.name"
              class="lumi-avatar"
              @error="handleImageError"
            />
            <span v-if="lumi.pool" class="pool-badge" :class="lumi.pool">
              {{ lumi.pool === 'season' ? '赛季' : '常驻' }}
            </span>
            <span v-if="showColor" class="color-badge">彩色</span>
          </div>
          <div class="lumi-info">
            <div class="lumi-name">{{ lumi.name }}</div>
            <div class="lumi-details">
              <span class="weight">权重: {{ lumi.weight }}</span>
              <span class="probability" :class="getProbabilityClass(lumi.probability)">
                {{ lumi.probability }}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="no-data" v-else-if="!selectedMap">
      <p>👈 请选择一个地图</p>
    </div>

    <div class="no-data" v-else-if="showColor && currentColorLumis.length === 0">
      <p>该地图暂无彩色噜咪数据</p>
    </div>

    <div class="no-data" v-else-if="!showColor && currentLumis.length === 0">
      <p>该地图暂无噜咪数据</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const data = ref({
  updateTime: '',
  mainLineMaps: [],
  seasonMaps: []
})

const selectedMapType = ref('mainline')
const selectedMap = ref(null)
const selectedStage = ref(null)
const showColor = ref(false) // 是否显示彩色概率

// 主线地图列表
const mainLineMaps = computed(() => data.value.mainLineMaps || [])

// 赛季地图列表
const seasonMaps = computed(() => data.value.seasonMaps || [])

// 当前显示的噜咪列表
const currentLumis = computed(() => {
  if (!selectedMap.value) return []

  if (selectedMap.value.type === 'mainline') {
    if (!selectedStage.value) return []
    return selectedStage.value.lumis || []
  } else {
    return selectedMap.value.lumis || []
  }
})

// 当前总权重
const currentTotalWeight = computed(() => {
  if (!selectedMap.value) return 0

  if (showColor.value) {
    const colorLumis = selectedMap.value.colorLumis || []
    return colorLumis.reduce((sum, l) => sum + l.weight, 0)
  }

  if (selectedMap.value.type === 'mainline') {
    if (!selectedStage.value) return 0
    return selectedStage.value.totalWeight || 0
  } else {
    return selectedMap.value.totalWeight || 0
  }
})

// 当前彩色噜咪列表
// 当前彩色噜咪列表
const currentColorLumis = computed(() => {
  if (!selectedMap.value || !showColor.value) return []
  return selectedMap.value.colorLumis || []
})

// 选择地图类型
function selectMapType(type) {
  selectedMapType.value = type
  selectedMap.value = null
  selectedStage.value = null

  // 默认选择第一个地图
  const maps = type === 'mainline' ? mainLineMaps.value : seasonMaps.value
  if (maps.length > 0) {
    selectMap(maps[0])
  }
}

// 选择地图
function selectMap(map) {
  selectedMap.value = map
  selectedStage.value = null

  // 如果是主线地图，默认选择第一个阶段
  if (map.type === 'mainline' && map.stages && map.stages.length > 0) {
    selectStage(map.stages[0])
  }
}

// 选择阶段
function selectStage(stage) {
  selectedStage.value = stage
}

// 格式化时间
function formatTime(isoString) {
  if (!isoString) return '未知'
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 获取噜咪头像
function getLumiAvatar(lumiId) {
  return `/images/avatars/CA_${lumiId}.png`
}

// 处理图片加载失败
function handleImageError(e) {
  e.target.src = '/images/avatars/unknown.png'
}

// 跳转到噜咪详情
function goToLumi(lumiId) {
  router.push(`/lumi/${lumiId}`)
}

// 获取概率样式类
function getProbabilityClass(probability) {
  const rate = parseFloat(probability)
  if (rate >= 20) return 'very-high'
  if (rate >= 10) return 'high'
  if (rate >= 5) return 'medium'
  return 'low'
}

// 加载数据
async function loadData() {
  try {
    const response = await fetch('/data/adventure/drop-rates.json')
    const json = await response.json()
    data.value = json

    // 默认选择第一个主线地图
    if (json.mainLineMaps && json.mainLineMaps.length > 0) {
      selectMap(json.mainLineMaps[0])
    }
  } catch (error) {
    console.error('加载数据失败:', error)
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.adventure-drop {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  text-align: center;
  margin-bottom: 30px;
}

.page-header h1 {
  font-size: 2.5rem;
  margin-bottom: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  font-size: 1.1rem;
  color: #666;
  margin-bottom: 5px;
}

.update-time {
  font-size: 0.9rem;
  color: #999;
}

/* 地图选择 */
.map-selector {
  margin-bottom: 20px;
}

.map-tabs {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-bottom: 20px;
}

.map-tab {
  padding: 12px 30px;
  border: none;
  background: #f5f5f5;
  color: #666;
  font-size: 1rem;
  font-weight: bold;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.map-tab:hover {
  background: #e0e0e0;
}

.map-tab.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
}

.map-list {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.map-item {
  padding: 10px 20px;
  border: 2px solid #ddd;
  background: white;
  color: #666;
  font-size: 0.95rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.map-item:hover {
  border-color: #667eea;
  transform: translateY(-2px);
}

.map-item.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

/* 彩色概率切换 */
.color-toggle {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-bottom: 20px;
}

.toggle-btn {
  padding: 10px 25px;
  border: 2px solid #ddd;
  background: white;
  color: #666;
  font-size: 0.95rem;
  font-weight: bold;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.toggle-btn:hover {
  border-color: #667eea;
}

.toggle-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
}

/* 阶段选择 */
.stage-selector {
  margin-bottom: 20px;
}

.stage-tabs {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.stage-tab {
  padding: 8px 16px;
  border: 2px solid #ddd;
  background: white;
  color: #666;
  font-size: 0.9rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
}

.stage-tab:hover {
  border-color: #667eea;
}

.stage-tab.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

/* 噜咪列表 */
.lumi-list {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.list-header {
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 2px solid #f0f0f0;
}

.total-weight {
  font-size: 1rem;
  color: #666;
  font-weight: bold;
}

.lumi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 15px;
}

.lumi-card {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  border: 2px solid #f0f0f0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
}

.lumi-card:hover {
  border-color: #667eea;
  background: #f8f9ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.2);
}

.lumi-avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.lumi-avatar {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  object-fit: cover;
  border: 2px solid #e0e0e0;
}

.pool-badge {
  position: absolute;
  bottom: -5px;
  right: -5px;
  padding: 2px 6px;
  font-size: 0.7rem;
  font-weight: bold;
  border-radius: 4px;
  color: white;
}

.pool-badge.normal {
  background: #999;
}

.pool-badge.season {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.color-badge {
  position: absolute;
  top: -5px;
  left: -5px;
  padding: 2px 6px;
  font-size: 0.7rem;
  font-weight: bold;
  border-radius: 4px;
  background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(255, 170, 0, 0.3);
}

.lumi-info {
  flex: 1;
  min-width: 0;
}

.lumi-name {
  font-weight: bold;
  color: #333;
  margin-bottom: 5px;
  font-size: 1rem;
}

.lumi-details {
  display: flex;
  gap: 10px;
  font-size: 0.85rem;
}

.weight {
  color: #999;
}

.probability {
  font-weight: bold;
}

.probability.very-high {
  color: #4caf50;
}

.probability.high {
  color: #8bc34a;
}

.probability.medium {
  color: #ff9800;
}

.probability.low {
  color: #f44336;
}

.no-data {
  text-align: center;
  padding: 40px;
  color: #999;
  font-size: 1.1rem;
}

/* 响应式 */
@media (max-width: 768px) {
  .page-header h1 {
    font-size: 1.8rem;
  }

  .map-tabs {
    flex-direction: column;
  }

  .stage-tabs {
    flex-direction: column;
  }

  .lumi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
