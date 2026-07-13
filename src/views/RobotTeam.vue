<script setup>
import { ref, onMounted, computed } from 'vue'
import { loadData, TYPE_NAMES, TYPE_COLORS, LUMI_TAG_NAMES } from '../data'

const loading = ref(true)
const activeTab = ref('dojo')
const teams = ref({ dojo: [], ladder: [], home: [] })
const selectedLadderLevel = ref(null) // 天梯当前选中的等级档位

// 天梯等级档位列表（去重升序）
const ladderLevels = computed(() => {
  const list = teams.value.ladder || []
  return [...new Set(list.map(t => t.level))].sort((a, b) => a - b)
})

// 当前 Tab 展示的阵容（天梯按选中等级过滤）
const currentTeams = computed(() => {
  const list = teams.value[activeTab.value] || []
  if (activeTab.value === 'ladder') {
    return list.filter(t => t.level === selectedLadderLevel.value)
  }
  return list
})
const lumiMap = ref({})
const locMap = ref({})

// Tab 配置：道馆 / 天梯 / 家园
const tabs = [
  { key: 'dojo', label: '🥋 道馆' },
  { key: 'ladder', label: '🏆 天梯' },
  { key: 'home', label: '🏠 家园' },
]

// 突破最大阶数（星级显示用，超过的按满星处理）
const MAX_BREAKTHROUGH = 5

onMounted(async () => {
  const [teamData, lumis, loc] = await Promise.all([
    loadData('robot-teams'),
    loadData('Lumi'),
    loadData('localization'),
  ])
  teams.value = teamData
  locMap.value = loc
  // 建 Id → Lumi 映射，O(1) 查基础数据（头像/名字/属性/最大评分）
  const map = {}
  lumis.forEach(l => { map[l.Id] = l })
  lumiMap.value = map
  loading.value = false
  // 天梯默认选第一个等级档位
  selectedLadderLevel.value = ladderLevels.value[0] ?? null
})

// 基础数据查询工具
function getLumi(id) { return lumiMap.value[id] }
function getName(id) {
  const l = getLumi(id)
  if (!l) return `噜咪 #${id}`
  return locMap.value[l.Name] || `噜咪 #${id}`
}
function getAvatar(id) {
  const l = getLumi(id)
  return l?.CA ? `/images/avatars/${l.CA}.png` : ''
}
function getTypeName(typeId) { return TYPE_NAMES[typeId] || '无' }
function getMaxScore(id) { return getLumi(id)?.MaxScore ?? 0 }

// 赛季配色（LumiTag: 0未投放 / 1主线 / 2S1 / 3S2 / 4S3 / 5S4）
const SEASON_COLORS = {
  0: '#888', 1: '#4caf50', 2: '#2196f3', 3: '#9c27b0', 4: '#ff9800', 5: '#e91e63',
}
function getSeason(id) {
  const l = getLumi(id)
  if (!l) return null
  return {
    name: LUMI_TAG_NAMES[l.LumiTag] || '未知',
    color: SEASON_COLORS[l.LumiTag] || '#888',
  }
}

// 评分条百分比：当前评分 / 最大评分
function scorePercent(item) {
  const max = getMaxScore(item.lumiId)
  if (!max) return 0
  return Math.min(100, Math.round((item.score / max) * 100))
}

// 评分条配色：按区间分色，满分（=最大评分）用彩虹渐变
function scoreColor(score, maxScore) {
  if (maxScore > 0 && score >= maxScore) {
    // 彩色（完美资质）：彩虹渐变
    return 'linear-gradient(90deg, #ff5b5b, #ffb84d, #ffe14d, #4dd07a, #4db8ff, #c14dff)'
  }
  if (score >= 80) return '#FFD700' // 金
  if (score >= 70) return '#9c27b0' // 紫
  if (score >= 60) return '#2196f3' // 蓝
  if (score >= 50) return '#4caf50' // 绿
  return '#9e9e9e'                  // 50 以下灰
}

// 突破星级：返回长度为 MAX_BREAKTHROUGH 的布尔数组，true=实心 ★
function breakthroughStars(b) {
  const filled = Math.min(Math.max(b || 0, 0), MAX_BREAKTHROUGH)
  return Array.from({ length: MAX_BREAKTHROUGH }, (_, i) => i < filled)
}
</script>

<template>
  <div v-if="loading" class="loading">加载中...</div>
  <div v-else>
    <h1 class="page-title">🤖 机器人阵容</h1>

    <!-- Tab 切换：道馆 / 天梯 / 家园 -->
    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="['tab', { active: activeTab === tab.key }]"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 天梯等级选择器 -->
    <div v-if="activeTab === 'ladder' && ladderLevels.length" class="level-selector">
      <span class="level-label">天梯等级</span>
      <select v-model="selectedLadderLevel">
        <option v-for="lv in ladderLevels" :key="lv" :value="lv">Lv.{{ lv }}</option>
      </select>
      <span class="level-count">该档位共 {{ currentTeams.length }} 个阵容</span>
    </div>

    <!-- 阵容卡片列表 -->
    <div class="grid grid-3" v-if="currentTeams.length">
      <div v-for="team in currentTeams" :key="team.teamId" class="card team-card">
        <div class="team-header">
          <span class="team-id">阵容 #{{ team.teamId }}</span>
          <span v-if="team.name" class="team-name">{{ team.name }}</span>
        </div>

        <div class="grid grid-3 lumi-list">
          <div v-for="(item, idx) in team.lumis" :key="idx" class="lumi-block">
            <div class="lumi-avatar">
              <img
                v-if="getAvatar(item.lumiId)"
                :src="getAvatar(item.lumiId)"
                :alt="getName(item.lumiId)"
                class="lumi-img"
                @error="$event.target.style.display='none';$event.target.nextElementSibling.style.display='block'"
              />
              <div class="lumi-icon-fallback" style="display:none">🐾</div>
            </div>

            <div class="lumi-name">{{ getName(item.lumiId) }}</div>

            <!-- 属性 + 赛季 -->
            <div class="lumi-types">
              <span
                v-if="getLumi(item.lumiId)"
                class="type-tag"
                :style="{ background: TYPE_COLORS[getLumi(item.lumiId).Type1] || '#666' }"
              >{{ getTypeName(getLumi(item.lumiId).Type1) }}</span>
              <span
                v-if="getSeason(item.lumiId)"
                class="season-tag"
                :style="{ color: getSeason(item.lumiId).color, borderColor: getSeason(item.lumiId).color }"
              >{{ getSeason(item.lumiId).name }}</span>
            </div>

            <!-- 等级 -->
            <div class="lumi-stat">
              <span class="stat-key">等级</span>
              <span class="stat-val">Lv.{{ item.level }}</span>
            </div>

            <!-- 突破星级 -->
            <div class="lumi-stat">
              <span class="stat-key">突破</span>
              <span class="breakthrough-stars">
                <span
                  v-for="(filled, i) in breakthroughStars(item.breakthrough)"
                  :key="i"
                  :class="['star', { filled }]"
                >★</span>
              </span>
            </div>

            <!-- 评分条（复刻 LumiDetail 的 stat-bar） -->
            <div class="score-stat">
              <div class="score-head">
                <span class="stat-key">评分</span>
                <span class="score-val">{{ item.score }} / {{ getMaxScore(item.lumiId) }}</span>
              </div>
              <div class="stat-bar-track">
                <div class="stat-bar-fill" :style="{ width: scorePercent(item) + '%', background: scoreColor(item.score, getMaxScore(item.lumiId)) }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty">暂无{{ tabs.find(t => t.key === activeTab)?.label }}阵容数据</div>
  </div>
</template>

<style scoped>
/* Tab 切换栏（深色主题，参考 NavBar 激活态配色） */
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.tab {
  padding: 8px 22px;
  background: var(--bg-card);
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95em;
  font-weight: 600;
  transition: all 0.2s;
}
.tab:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.tab.active {
  background: rgba(233, 69, 96, 0.15);
  border-color: var(--accent);
  color: var(--accent);
}

/* 天梯等级选择器 */
.level-selector {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.level-label {
  color: var(--text-dim);
  font-size: 0.9em;
  font-weight: 600;
}
.level-selector select {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 0.95em;
  cursor: pointer;
}
.level-selector select:focus {
  outline: none;
  border-color: var(--accent);
}
.level-count {
  color: var(--text-dim);
  font-size: 0.85em;
  margin-left: auto;
}

/* 阵容卡片 */
.team-card {
  padding: 16px;
}
.team-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.team-id {
  font-size: 1.1em;
  font-weight: 700;
  color: var(--accent);
}
.team-name {
  color: var(--text-dim);
  font-size: 0.9em;
}

/* 单只噜咪块 */
.lumi-list { gap: 12px; }
.lumi-block {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 8px;
  text-align: center;
}
.lumi-avatar {
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lumi-img {
  max-height: 100px;
  max-width: 90px;
  object-fit: contain;
}
.lumi-icon-fallback {
  font-size: 2.5em;
}
.lumi-name {
  font-weight: 600;
  color: #fff;
  margin: 6px 0;
  font-size: 0.92em;
}
.lumi-types {
  display: flex;
  gap: 4px;
  justify-content: center;
  align-items: center;
  margin-bottom: 8px;
}
/* 赛季标签（边框风格，区别于实色属性 tag） */
.season-tag {
  font-size: 0.7em;
  padding: 1px 6px;
  border: 1px solid;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  white-space: nowrap;
  font-weight: 600;
}

/* 属性行（等级/突破） */
.lumi-stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  font-size: 0.85em;
}
.stat-key {
  color: var(--text-dim);
}
.stat-val {
  color: var(--text);
  font-weight: 600;
}

/* 突破星级 */
.breakthrough-stars {
  letter-spacing: 1px;
}
.star {
  color: var(--border);
  font-size: 1em;
}
.star.filled {
  color: #FFD700; /* 金色实心星 */
}

/* 评分条 */
.score-stat {
  margin-top: 8px;
}
.score-head {
  display: flex;
  justify-content: space-between;
  font-size: 0.85em;
  margin-bottom: 4px;
}
.score-val {
  color: var(--text-dim);
}
.stat-bar-track {
  height: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 7px;
  overflow: hidden;
}
.stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-light));
  border-radius: 7px;
  transition: width 0.4s ease;
}
</style>
