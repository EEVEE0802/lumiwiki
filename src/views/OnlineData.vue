<template>
  <div class="online-data">
    <div class="page-header">
      <h1>📊 线上数据</h1>
      <p class="subtitle">{{ gameMode === 'ladder' ? '天梯1v1实时统计数据' : '周赛高端对战数据' }}</p>
      <p class="update-time">数据更新时间: {{ formatTime(data.updateTime) }}</p>
    </div>

    <!-- 玩法切换 -->
    <div class="game-mode-selector">
      <button
        :class="['mode-btn', { active: gameMode === 'ladder' }]"
        @click="switchGameMode('ladder')"
      >
        🏔️ 天梯
      </button>
      <button
        :class="['mode-btn', { active: gameMode === 'tournament' }]"
        @click="switchGameMode('tournament')"
      >
        🏆 周赛
      </button>
    </div>

    <!-- 周选择器 -->
    <div class="week-selector">
      <div class="week-tabs">
        <button
          v-for="week in availableWeeks"
          :key="week.value"
          :class="['week-tab', { active: selectedWeek === week.value }]"
          @click="selectWeek(week.value)"
        >
          {{ week.label }}
        </button>
      </div>

      <div class="compare-mode">
        <label class="compare-toggle">
          <input type="checkbox" v-model="compareMode" @change="onCompareModeChange">
          <span>对比模式</span>
        </label>

        <select v-if="compareMode" v-model="compareWeek" class="compare-select" @change="loadCompareData">
          <option v-for="week in availableWeeks" :key="'cmp-' + week.value" :value="week.value" :disabled="week.value === selectedWeek">
            对比第{{ week.value }}周
          </option>
        </select>
      </div>
    </div>

    <!-- 筛选器（仅天梯显示） -->
    <div class="filters" v-if="gameMode === 'ladder'">
      <div class="filter-group">
        <label>段位范围:</label>
        <MultiSelect
          v-model="selectedRankGroup"
          :options="rankOptions"
          placeholder="全段位"
          @update:modelValue="updateData"
        />
      </div>

      <div class="filter-group">
        <label>是否包含人机:</label>
        <select v-model="includeBot" @change="updateData">
          <option :value="true">包含人机</option>
          <option :value="false">不含人机</option>
        </select>
      </div>
    </div>

    <!-- 周赛说明 -->
    <div class="tournament-info" v-if="gameMode === 'tournament'">
      <p>🏆 周赛是每周开放一次的高端对战玩法，仅限真人玩家参与</p>
    </div>

    <!-- 统计概览 -->
    <div class="stats-overview" v-if="currentStats">
      <div class="stat-card">
        <div class="stat-label">总战斗场次</div>
        <div class="stat-value">{{ formatNumber(currentStats.totalBattles) }}</div>
        <div v-if="compareMode && compareStats" class="stat-change" :class="getChangeClass(getBattleChange())">
          {{ formatChange(getBattleChange()) }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">段位范围</div>
        <div class="stat-value">{{ currentStats.rankRange.min }}-{{ currentStats.rankRange.max }}段</div>
      </div>
      <div v-if="compareMode && compareStats" class="stat-card compare-info">
        <div class="stat-label">对比</div>
        <div class="stat-value small">第{{ compareWeek }}周</div>
      </div>
    </div>

    <!-- 排行榜切换 -->
    <div class="tabs">
      <button
        :class="['tab', { active: activeTab === 'appearance' }]"
        @click="activeTab = 'appearance'"
      >
        📈 出场率榜
      </button>
      <button
        :class="['tab', { active: activeTab === 'winRate' }]"
        @click="activeTab = 'winRate'"
      >
        🏆 胜率榜
      </button>
      <button
        :class="['tab', { active: activeTab === 'teams' }]"
        @click="activeTab = 'teams'"
      >
        👥 队伍列表
      </button>
      <button
        :class="['tab', { active: activeTab === 'chart' }]"
        @click="activeTab = 'chart'"
      >
        👤 玩家分布
      </button>
    </div>

    <!-- 排行榜内容 -->
    <div class="rankings">
      <!-- 出场率榜 -->
      <div v-if="activeTab === 'appearance'" class="ranking-list">
        <table>
          <thead>
            <tr>
              <th>排名</th>
              <th>噜咪</th>
              <th>出场次数</th>
              <th v-if="compareMode && compareStats">变化</th>
              <th>出场率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in currentAppearanceData" :key="item.lumiId" class="ranking-item" @click="goToLumi(item.lumiId)">
              <td class="rank">{{ index + 1 }}</td>
              <td class="lumi-info">
                <img :src="getLumiAvatar(item.lumiId)" :alt="item.lumiName" class="lumi-avatar" @error="handleImageError">
                <span class="lumi-name">{{ item.lumiName }}</span>
              </td>
              <td class="battles">{{ formatNumber(item.uniqueBattles) }}</td>
              <td v-if="compareMode && compareStats" class="change-cell">
                <span v-if="getAppearanceChange(item.lumiId)" class="change-badge" :class="getChangeClass(getAppearanceChange(item.lumiId))">
                  {{ formatChange(getAppearanceChange(item.lumiId)) }}
                </span>
              </td>
              <td class="rate appearance-rate">{{ item.appearanceRate }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 胜率榜 -->
      <div v-if="activeTab === 'winRate'" class="ranking-list">
        <div class="sort-options">
          <span>排序方式：</span>
          <button
            :class="['sort-btn', { active: winRateSortBy === 'winRate' }]"
            @click="winRateSortBy = 'winRate'"
          >
            按胜率
          </button>
          <button
            :class="['sort-btn', { active: winRateSortBy === 'battles' }]"
            @click="winRateSortBy = 'battles'"
          >
            按场次
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>排名</th>
              <th>噜咪</th>
              <th>战斗场次</th>
              <th>胜场</th>
              <th v-if="compareMode && compareStats">胜率变化</th>
              <th>胜率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in currentWinRateData" :key="item.lumiId" class="ranking-item" @click="goToLumi(item.lumiId)">
              <td class="rank">{{ index + 1 }}</td>
              <td class="lumi-info">
                <img :src="getLumiAvatar(item.lumiId)" :alt="item.lumiName" class="lumi-avatar" @error="handleImageError">
                <span class="lumi-name">{{ item.lumiName }}</span>
              </td>
              <td class="battles">{{ formatNumber(item.battles) }}</td>
              <td class="wins">{{ formatNumber(item.wins) }}</td>
              <td v-if="compareMode && compareStats" class="change-cell">
                <span v-if="getWinRateChange(item.lumiId) !== null" class="change-badge" :class="getChangeClass(getWinRateChange(item.lumiId))">
                  {{ formatChange(getWinRateChange(item.lumiId)) }}
                </span>
              </td>
              <td class="rate" :class="getWinRateClass(item.winRate)">{{ item.winRate }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 队伍列表 -->
      <div v-if="activeTab === 'teams'" class="teams-list">
        <div v-if="highRankTeams && highRankTeams.length > 0">
          <table>
            <thead>
              <tr>
                <th>排名</th>
                <th>队伍</th>
                <th>使用次数</th>
                <th>胜场</th>
                <th>胜率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(team, index) in highRankTeams" :key="team.teamLumiIds.join('-')" class="team-item">
                <td class="rank">{{ index + 1 }}</td>
                <td class="team-info">
                  <div class="team-lumis">
                    <div
                      v-for="lumi in team.lumis"
                      :key="lumi.lumiId"
                      class="team-lumi"
                      @click="goToLumi(lumi.lumiId)"
                    >
                      <img :src="getLumiAvatar(lumi.lumiId)" :alt="lumi.lumiName" class="team-lumi-avatar" @error="handleImageError">
                      <span class="team-lumi-name">{{ lumi.lumiName }}</span>
                    </div>
                  </div>
                </td>
                <td class="battles">{{ formatNumber(team.battles) }}</td>
                <td class="wins">{{ formatNumber(team.wins) }}</td>
                <td class="rate" :class="getWinRateClass(team.winRate)">{{ team.winRate }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="no-data">
          <p>暂无队伍数据</p>
        </div>
      </div>

      <!-- 玩家分布图 -->
      <div v-if="activeTab === 'chart'" class="chart-container">
        <!-- 天梯模式：段位分布 -->
        <template v-if="gameMode === 'ladder'">
          <div class="chart-header">
            <h3>玩家段位分布</h3>
            <p class="chart-subtitle">各段位玩家数量统计</p>
          </div>
          <div class="distribution-stats">
            <div v-for="rank in rankGroups" :key="rank.key" class="stat-card" :class="rank.key">
              <div class="stat-icon">{{ rank.icon }}</div>
              <div class="stat-info">
                <div class="stat-label">{{ rank.label }}</div>
                <div class="stat-desc">{{ rank.desc }}</div>
                <div class="stat-value">{{ formatNumber(playerDistribution[rank.key]) }}</div>
                <div class="stat-percent">{{ getDistributionPercent(rank.key) }}%</div>
                <div v-if="compareMode && comparePlayerDistribution" class="stat-change" :class="getChangeClass(getDistributionChange(rank.key))">
                  {{ formatChange(getDistributionChange(rank.key)) }}
                </div>
              </div>
            </div>
            <!-- 总人数 -->
            <div class="stat-card total-card">
              <div class="stat-icon">👥</div>
              <div class="stat-info">
                <div class="stat-label">总玩家数</div>
                <div class="stat-value">{{ formatNumber(playerDistribution.total) }}</div>
              </div>
            </div>
          </div>
        </template>

        <!-- 周赛模式：胜场分布 / 天梯段位分布 -->
        <template v-if="gameMode === 'tournament'">
          <div class="chart-header">
            <div class="chart-title-row">
              <div>
                <h3>{{ tournamentChartMode === 'wins' ? '玩家胜场分布' : '玩家天梯段位分布' }}</h3>
                <p class="chart-subtitle">{{ tournamentChartMode === 'wins' ? '各胜场玩家数量统计（3负出局，最高15胜）' : '参与周赛玩家的天梯最高段位统计' }}</p>
              </div>
              <div class="chart-mode-toggle">
                <button
                  :class="['chart-mode-btn', { active: tournamentChartMode === 'wins' }]"
                  @click="tournamentChartMode = 'wins'"
                >
                  🏆 胜场分布
                </button>
                <button
                  :class="['chart-mode-btn', { active: tournamentChartMode === 'ladder-rank' }]"
                  @click="tournamentChartMode = 'ladder-rank'"
                >
                  🏔️ 天梯段位
                </button>
              </div>
            </div>
          </div>

          <!-- 胜场分布 -->
          <div v-if="tournamentChartMode === 'wins'" class="distribution-stats tournament-stats">
            <div v-for="wins in getWinDistributionRange()" :key="wins" class="stat-card win-card" :class="getWinClass(wins)">
              <div class="stat-icon">{{ getWinIcon(wins) }}</div>
              <div class="stat-info">
                <div class="stat-label">{{ wins }}胜</div>
                <div class="stat-value">{{ formatNumber(tournamentWinDistribution[wins] || 0) }}</div>
                <div class="stat-percent">{{ getTournamentDistributionPercent(wins) }}%</div>
              </div>
            </div>
            <!-- 总人数 -->
            <div class="stat-card total-card">
              <div class="stat-icon">👥</div>
              <div class="stat-info">
                <div class="stat-label">总玩家数</div>
                <div class="stat-value">{{ formatNumber(tournamentTotalPlayers) }}</div>
              </div>
            </div>
          </div>

          <!-- 天梯段位分布 -->
          <div v-if="tournamentChartMode === 'ladder-rank'" class="distribution-stats">
            <div v-if="tournamentPlayerRankDistribution.total > 0">
              <div v-for="rank in rankGroups" :key="rank.key" class="stat-card" :class="rank.key">
                <div class="stat-icon">{{ rank.icon }}</div>
                <div class="stat-info">
                  <div class="stat-label">{{ rank.label }}</div>
                  <div class="stat-desc">{{ rank.desc }}</div>
                  <div class="stat-value">{{ formatNumber(tournamentPlayerRankDistribution[rank.key]) }}</div>
                  <div class="stat-percent">{{ getTournamentRankDistributionPercent(rank.key) }}%</div>
                </div>
              </div>
              <!-- 总人数 -->
              <div class="stat-card total-card">
                <div class="stat-icon">👥</div>
                <div class="stat-info">
                  <div class="stat-label">总玩家数</div>
                  <div class="stat-desc">有天梯段位数据</div>
                  <div class="stat-value">{{ formatNumber(tournamentPlayerRankDistribution.total) }}</div>
                </div>
              </div>
            </div>
            <div v-else class="no-data-box">
              <p>😅 暂无数据</p>
              <p class="no-data-desc">周赛数据的玩家ID与天梯数据无法匹配（科学计数法精度丢失问题）</p>
            </div>
          </div>
        </template>

        <div class="chart-wrapper" ref="chartWrapper">
          <canvas ref="chartCanvas"></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import MultiSelect from '../components/MultiSelect.vue'

const router = useRouter()

// 段位配置
const rankGroups = [
  { key: 'bronze', label: '青铜', desc: '1-30 段', icon: '🥉' },
  { key: 'silver', label: '白银', desc: '31-60 段', icon: '🥈' },
  { key: 'gold', label: '黄金', desc: '61-90 段', icon: '🥇' },
  { key: 'diamond', label: '钻石', desc: '91-120 段', icon: '💎' },
  { key: 'star', label: '星耀', desc: '121-150 段', icon: '⭐' },
  { key: 'legend', label: '传说', desc: '151 段', icon: '👑' }
]

// 段位多选选项（给 MultiSelect 用）
const rankOptions = rankGroups.map(r => ({
  value: r.key,
  label: `${r.label} (${r.desc})`
}))

// 合并多个段位的统计数据
function mergeStatsObjects(statsArray) {
  if (!statsArray.length) return null
  if (statsArray.length === 1) return statsArray[0]
  const validStats = statsArray.filter(Boolean)
  if (!validStats.length) return null
  if (validStats.length === 1) return validStats[0]

  // 合并总场次
  const totalBattles = Math.round(validStats.reduce((sum, s) => sum + (s.totalBattles || 0), 0))

  // 合并段位范围
  const rankRange = {
    min: Math.min(...validStats.map(s => s.rankRange?.min || 0)),
    max: Math.max(...validStats.map(s => s.rankRange?.max || 0))
  }

  // 合并出场率数据
  const appearanceMap = new Map()
  for (const stats of validStats) {
    for (const item of (stats.appearance || [])) {
      const existing = appearanceMap.get(item.lumiId)
      if (existing) {
        existing.uniqueBattles += item.uniqueBattles
      } else {
        appearanceMap.set(item.lumiId, { ...item })
      }
    }
  }
  const appearance = [...appearanceMap.values()]
    .map(item => ({
      ...item,
      uniqueBattles: Math.round(item.uniqueBattles),
      appearanceRate: totalBattles > 0 ? (item.uniqueBattles / totalBattles * 100).toFixed(2) : '0'
    }))
    .sort((a, b) => b.uniqueBattles - a.uniqueBattles)

  // 合并胜率数据（加权平均）
  const winRateMap = new Map()
  for (const stats of validStats) {
    for (const item of (stats.winRate || [])) {
      const existing = winRateMap.get(item.lumiId)
      if (existing) {
        existing.wins += parseFloat(item.winRate) / 100 * item.battles
        existing.battles += item.battles
      } else {
        winRateMap.set(item.lumiId, {
          ...item,
          wins: parseFloat(item.winRate) / 100 * item.battles
        })
      }
    }
  }
  const winRate = [...winRateMap.values()]
    .map(item => {
      const battles = Math.round(item.battles)
      const wins = Math.round(item.wins)
      return {
        ...item,
        battles,
        wins,
        winRate: battles > 0 ? (wins / battles * 100).toFixed(2) : '0'
      }
    })
    .sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate))

  return { totalBattles, rankRange, appearance, winRate }
}

// 数据状态
const data = ref({
  updateTime: '',
  totalBattles: 0,
  rankGroups: [],
  stats: {},
  playerRankDistribution: {
    bronze: 0,
    silver: 0,
    gold: 0,
    diamond: 0,
    star: 0,
    legend: 0,
    total: 0
  }
})

const compareData = ref(null)

// 玩法选择
const gameMode = ref('ladder') // ladder | tournament

// 周选择
const availableWeeks = ref([])
const selectedWeek = ref(1)
const compareMode = ref(false)
const compareWeek = ref(null)

// UI 状态
const selectedRankGroup = ref([])
const includeBot = ref(true)
const activeTab = ref('appearance')
const winRateSortBy = ref('winRate')
const tournamentChartMode = ref('wins') // wins | ladder-rank

// 图表相关
const chartCanvas = ref(null)
const chartWrapper = ref(null)
let chartInstance = null

// 当前统计数据（支持多段位合并）
const currentStats = computed(() => {
  const keys = getDataKeys()
  if (keys.length === 1) {
    return data.value.stats[keys[0]]
  }
  const statsArray = keys.map(k => data.value.stats[k]).filter(Boolean)
  return mergeStatsObjects(statsArray)
})

// 对比统计数据（支持多段位合并）
const compareStats = computed(() => {
  if (!compareData.value || !compareMode.value) return null
  const keys = getDataKeys()
  if (keys.length === 1) {
    return compareData.value.stats[keys[0]]
  }
  const statsArray = keys.map(k => compareData.value.stats[k]).filter(Boolean)
  return mergeStatsObjects(statsArray)
})

// 当前出场率数据
const currentAppearanceData = computed(() => {
  return currentStats.value?.appearance || []
})

// 当前胜率数据
const currentWinRateData = computed(() => {
  const data = currentStats.value?.winRate || []
  if (winRateSortBy.value === 'battles') {
    return [...data].sort((a, b) => b.battles - a.battles)
  }
  return data
})

// 队伍数据（根据选中段位和人机筛选合并，取出现次数前 50）
const highRankTeams = computed(() => {
  if (gameMode.value === 'tournament') {
    return data.value.popularTeams || []
  }
  const keys = getDataKeys()
  const merged = new Map()
  keys.forEach(key => {
    const teams = data.value.stats?.[key]?.teams || []
    teams.forEach(team => {
      const id = team.teamLumiIds.join('-')
      if (!merged.has(id)) {
        merged.set(id, {
          ...team,
          battles: 0,
          wins: 0
        })
      }
      const existing = merged.get(id)
      existing.battles += team.battles
      existing.wins += team.wins
    })
  })
  return Array.from(merged.values())
    .sort((a, b) => b.battles - a.battles)
    .slice(0, 50)
    .map(team => ({
      ...team,
      winRate: ((team.wins / team.battles) * 100).toFixed(2)
    }))
})

// 玩家段位分布
const playerDistribution = computed(() => {
  return data.value.playerRankDistribution || {
    bronze: 0,
    silver: 0,
    gold: 0,
    diamond: 0,
    star: 0,
    legend: 0,
    total: 0
  }
})

// 对比玩家分布
const comparePlayerDistribution = computed(() => {
  if (!compareData.value || !compareMode.value) return null
  return compareData.value.playerRankDistribution
})

// 周赛胜场分布
const tournamentWinDistribution = computed(() => {
  return data.value.winDistribution || {}
})

// 周赛总玩家数
const tournamentTotalPlayers = computed(() => {
  return data.value.totalPlayers || 0
})

// 周赛玩家天梯段位分布
const tournamentPlayerRankDistribution = computed(() => {
  return data.value.tournamentPlayerRankDistribution || {
    bronze: 0,
    silver: 0,
    gold: 0,
    diamond: 0,
    star: 0,
    legend: 0,
    total: 0
  }
})

// 获取数据键（支持多选段位）
function getDataKeys() {
  if (gameMode.value === 'tournament') {
    return ['all']
  }
  const botPart = includeBot.value ? 'with-bot' : 'no-bot'
  if (!selectedRankGroup.value.length) {
    return [`all-${botPart}`]
  }
  return selectedRankGroup.value.map(r => `${r}-${botPart}`)
}

// 获取单个数据键（用于兼容旧逻辑）
function getDataKey() {
  const keys = getDataKeys()
  return keys[0]
}

// 切换玩法
function switchGameMode(mode) {
  gameMode.value = mode
  // 切换玩法时重置对比模式
  compareMode.value = false
  compareData.value = null
  loadData()
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

// 格式化数字
function formatNumber(num) {
  if (num === undefined || num === null) return '-'
  return num.toLocaleString('zh-CN')
}

// 格式化变化
function formatChange(change) {
  if (change === null || change === undefined) return '-'
  if (change === 0) return '持平'
  const sign = change > 0 ? '↑' : '↓'
  return `${sign} ${Math.abs(change).toFixed(1)}%`
}

// 获取变化样式类
function getChangeClass(change) {
  if (change === null || change === undefined) return 'neutral'
  if (change > 0) return 'up'
  if (change < 0) return 'down'
  return 'neutral'
}

// 获取战斗场次变化
function getBattleChange() {
  if (!compareStats.value) return null
  const current = currentStats.value?.totalBattles || 0
  const compare = compareStats.value?.totalBattles || 0
  if (compare === 0) return null
  return ((current - compare) / compare) * 100
}

// 获取出场率变化
function getAppearanceChange(lumiId) {
  if (!compareStats.value) return null
  const current = currentStats.value?.appearance.find(i => i.lumiId === lumiId)
  const compare = compareStats.value?.appearance.find(i => i.lumiId === lumiId)
  if (!current || !compare) return null

  const currentRate = parseFloat(current.appearanceRate)
  const compareRate = parseFloat(compare.appearanceRate)
  if (compareRate === 0) return null
  return ((currentRate - compareRate) / compareRate) * 100
}

// 获取胜率变化
function getWinRateChange(lumiId) {
  if (!compareStats.value) return null
  const current = currentStats.value?.winRate.find(i => i.lumiId === lumiId)
  const compare = compareStats.value?.winRate.find(i => i.lumiId === lumiId)
  if (!current || !compare) return null

  const currentRate = parseFloat(current.winRate)
  const compareRate = parseFloat(compare.winRate)
  // 只统计有足够场次的变化（至少10场）
  if (current.battles < 10 && compare.battles < 10) return null
  return currentRate - compareRate
}

// 获取分布百分比
function getDistributionPercent(key) {
  const total = playerDistribution.value.total
  if (total === 0) return 0
  return ((playerDistribution.value[key] / total) * 100).toFixed(1)
}

// 获取分布变化
function getDistributionChange(key) {
  if (!comparePlayerDistribution.value) return null
  const current = playerDistribution.value[key] || 0
  const compare = comparePlayerDistribution.value[key] || 0
  if (compare === 0) return null
  return ((current - compare) / compare) * 100
}

// 周赛：获取胜场范围（只显示有人的胜场数）
function getWinDistributionRange() {
  const distribution = tournamentWinDistribution.value
  const wins = []
  for (let i = 0; i <= 15; i++) {
    if (distribution[i] > 0) {
      wins.push(i)
    }
  }
  return wins
}

// 周赛：获取胜场样式类
function getWinClass(wins) {
  if (wins >= 12) return 'legendary'
  if (wins >= 9) return 'excellent'
  if (wins >= 6) return 'good'
  if (wins >= 3) return 'average'
  return 'beginner'
}

// 周赛：获取胜场图标
function getWinIcon(wins) {
  if (wins >= 12) return '👑'
  if (wins >= 9) return '🏆'
  if (wins >= 6) return '⭐'
  if (wins >= 3) return '👍'
  return '🎯'
}

// 周赛：获取胜场百分比
function getTournamentDistributionPercent(wins) {
  const total = tournamentTotalPlayers.value
  if (total === 0) return 0
  return (((tournamentWinDistribution.value[wins] || 0) / total) * 100).toFixed(1)
}

// 周赛：获取天梯段位百分比
function getTournamentRankDistributionPercent(key) {
  const total = tournamentPlayerRankDistribution.value.total
  if (total === 0) return 0
  return ((tournamentPlayerRankDistribution.value[key] / total) * 100).toFixed(1)
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

// 获取胜率样式类
function getWinRateClass(winRate) {
  const rate = parseFloat(winRate)
  if (rate >= 60) return 'high'
  if (rate >= 50) return 'medium'
  return 'low'
}

// 更新数据
function updateData() {
  console.log('切换到:', getDataKeys())
}

// 选择周
function selectWeek(week) {
  selectedWeek.value = week
  if (compareMode.value && compareWeek.value === week) {
    // 如果对比周等于当前周，切换到前一周
    const prevWeek = week > 1 ? week - 1 : null
    compareWeek.value = prevWeek
    if (prevWeek) loadCompareData()
  }
  loadData()
}

// 对比模式切换
function onCompareModeChange() {
  if (compareMode.value && !compareWeek.value) {
    // 默认对比前一周
    compareWeek.value = selectedWeek.value > 1 ? selectedWeek.value - 1 : null
  }
  if (compareMode.value) {
    loadCompareData()
  }
}

// 加载对比数据
async function loadCompareData() {
  if (!compareMode.value || !compareWeek.value) {
    compareData.value = null
    return
  }
  try {
    let url
    if (gameMode.value === 'tournament') {
      url = `/data/online/weekly/tournament-week${compareWeek.value}.json`
    } else {
      url = `/data/online/weekly/ladder-week${compareWeek.value}.json`
    }
    const response = await fetch(url, { cache: 'no-cache' })
    if (response.ok) {
      compareData.value = await response.json()
    } else {
      compareData.value = null
    }
  } catch (error) {
    console.error('加载对比数据失败:', error)
    compareData.value = null
  }
}

// 初始化图表
function initChart() {
  if (!chartCanvas.value) return

  const ctx = chartCanvas.value.getContext('2d')

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['青铜', '白银', '黄金', '钻石', '星耀', '传说'],
      datasets: [{
        label: '玩家数量',
        data: [0, 0, 0, 0, 0, 0],
        backgroundColor: [
          'rgba(205, 127, 50, 0.7)',
          'rgba(192, 192, 192, 0.7)',
          'rgba(255, 215, 0, 0.7)',
          'rgba(0, 191, 255, 0.7)',
          'rgba(138, 43, 226, 0.7)',
          'rgba(255, 69, 0, 0.7)'
        ],
        borderColor: [
          'rgba(205, 127, 50, 1)',
          'rgba(192, 192, 192, 1)',
          'rgba(255, 215, 0, 1)',
          'rgba(0, 191, 255, 1)',
          'rgba(138, 43, 226, 1)',
          'rgba(255, 69, 0, 1)'
        ],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 16 / 10,
      scales: {
        x: {
          ticks: { font: { size: 14, weight: 'bold' } },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 12 },
            callback: value => value.toLocaleString('zh-CN')
          },
          title: {
            display: true,
            text: '玩家数量',
            font: { size: 14, weight: 'bold' },
            color: '#666'
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const distribution = [
                playerDistribution.value.bronze,
                playerDistribution.value.silver,
                playerDistribution.value.gold,
                playerDistribution.value.diamond,
                playerDistribution.value.star,
                playerDistribution.value.legend
              ]
              const labels = ['青铜 (1-30段)', '白银 (31-60段)', '黄金 (61-90段)', '钻石 (91-120段)', '星耀 (121-150段)', '传说 (151段)']
              const total = playerDistribution.value.total
              const percent = ((distribution[context.dataIndex] / total) * 100).toFixed(1)
              return `${labels[context.dataIndex]}: ${context.raw.toLocaleString()} 人 (${percent}%)`
            }
          }
        }
      }
    }
  })
}

// 更新图表数据
function updateChart() {
  if (!chartInstance) return

  const distribution = playerDistribution.value

  chartInstance.data.datasets[0].data = [
    distribution.bronze,
    distribution.silver,
    distribution.gold,
    distribution.diamond,
    distribution.star,
    distribution.legend
  ]

  chartInstance.update()
}

// 加载可用周列表
async function loadAvailableWeeks() {
  try {
    const response = await fetch('/data/online/weekly/weeks.json', { cache: 'no-cache' })
    if (response.ok) {
      const weeks = await response.json()
      availableWeeks.value = weeks.map(w => ({
        value: w.week,
        label: w.label || `第${w.week}周`
      }))
      if (weeks.length > 0) {
        selectedWeek.value = weeks[weeks.length - 1].week
      }
    } else {
      // 如果没有 weeks.json，手动检测
      availableWeeks.value = []
      for (let i = 1; i <= 10; i++) {
        try {
          const resp = await fetch(`/data/online/weekly/battle-stats-week${i}.json`, { method: 'HEAD', cache: 'no-cache' })
          if (resp.ok) {
            availableWeeks.value.push({
              value: i,
              label: `第${i}周`
            })
          }
        } catch (e) {
          break
        }
      }
    }
  } catch (error) {
    console.log('无法加载周列表，使用默认值')
  }
}

// 加载数据
async function loadData() {
  try {
    let url
    if (gameMode.value === 'tournament') {
      // 周赛数据
      url = `/data/online/weekly/tournament-week${selectedWeek.value}.json`
    } else {
      // 天梯数据
      url = selectedWeek.value > 0
        ? `/data/online/weekly/ladder-week${selectedWeek.value}.json`
        : '/data/online/battle-stats.json'
    }
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`)
    }
    const json = await response.json()
    data.value = json
  } catch (error) {
    console.error('加载数据失败:', error)
  }
}

onMounted(async () => {
  await loadAvailableWeeks()
  await loadData()
  nextTick(() => {
    initChart()
  })
})

// 监听标签页切换
watch(activeTab, (newTab) => {
  if (newTab === 'chart') {
    nextTick(() => {
      if (!chartInstance) {
        initChart()
      }
      updateChart()
    })
  }
})

// 监听数据变化
watch([selectedRankGroup, includeBot], () => {
  if (activeTab.value === 'chart') {
    nextTick(() => {
      updateChart()
    })
  }
})

watch(currentStats, () => {
  if (activeTab.value === 'chart' && chartInstance) {
    updateChart()
  }
})
</script>

<style scoped>
.online-data {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  text-align: center;
  margin-bottom: 20px;
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

/* 周选择器 */
.week-selector {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 20px;
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%);
  border-radius: 12px;
  flex-wrap: wrap;
  gap: 15px;
}

/* 玩法切换器 */
.game-mode-selector {
  display: flex;
  justify-content: center;
  gap: 15px;
  margin-bottom: 20px;
}

.mode-btn {
  padding: 12px 30px;
  border: 2px solid #ddd;
  background: white;
  color: #666;
  font-size: 1.1rem;
  font-weight: bold;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-btn:hover {
  border-color: #667eea;
  background: #f8f9ff;
  transform: translateY(-2px);
}

.mode-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* 周赛说明 */
.tournament-info {
  text-align: center;
  padding: 15px 20px;
  margin-bottom: 20px;
  background: linear-gradient(135deg, #fff9e6 0%, #fff3cd 100%);
  border: 2px solid #ffc107;
  border-radius: 10px;
  color: #856404;
}

.tournament-info p {
  margin: 0;
  font-weight: bold;
  font-size: 1rem;
}

.week-tabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.week-tab {
  padding: 10px 20px;
  border: 2px solid #ddd;
  background: white;
  color: #666;
  font-weight: bold;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.week-tab:hover {
  border-color: #667eea;
  background: #f8f9ff;
}

.week-tab.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
}

.compare-mode {
  display: flex;
  align-items: center;
  gap: 15px;
}

.compare-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: bold;
  color: #666;
}

.compare-toggle input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.compare-select {
  padding: 8px 15px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 0.95rem;
  cursor: pointer;
  background: white;
}

/* 筛选器 */
.filters {
  display: flex;
  gap: 20px;
  justify-content: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-group label {
  font-weight: bold;
  color: #333;
}

.filter-group select {
  padding: 8px 15px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
}

.filter-group select:hover {
  border-color: #667eea;
}

/* 统计概览 */
.stats-overview {
  display: flex;
  gap: 20px;
  justify-content: center;
  margin-bottom: 30px;
  flex-wrap: wrap;
}

.stat-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px 30px;
  border-radius: 12px;
  text-align: center;
  min-width: 150px;
  box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
  position: relative;
}

.stat-label {
  font-size: 0.9rem;
  opacity: 0.9;
  margin-bottom: 10px;
}

.stat-value {
  font-size: 1.8rem;
  font-weight: bold;
}

.stat-value.small {
  font-size: 1.2rem;
}

.stat-change {
  margin-top: 8px;
  font-size: 0.85rem;
  font-weight: bold;
}

.stat-change.up {
  color: #a8ff78;
}

.stat-change.down {
  color: #ff7878;
}

.stat-change.neutral {
  color: rgba(255, 255, 255, 0.7);
}

.compare-info {
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
}

/* 变化指示器 */
.change-cell {
  min-width: 80px;
}

.change-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: bold;
}

.change-badge.up {
  background: #d4edda;
  color: #155724;
}

.change-badge.down {
  background: #f8d7da;
  color: #721c24;
}

.change-badge.neutral {
  background: #e2e3e5;
  color: #383d41;
}

/* 标签页 */
.tabs {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-bottom: 20px;
}

.tab {
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

.tab:hover {
  background: #e0e0e0;
}

.tab.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);
}

/* 排序选项 */
.sort-options {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 15px 20px;
  background: #f8f9ff;
  border-bottom: 1px solid #e0e0e0;
  font-size: 0.9rem;
  color: #666;
}

.sort-btn {
  padding: 6px 15px;
  border: 2px solid #ddd;
  background: white;
  color: #666;
  font-size: 0.85rem;
  font-weight: bold;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
}

.sort-btn:hover {
  border-color: #667eea;
  background: #f8f9ff;
}

.sort-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

/* 排行榜 */
.ranking-list {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

th {
  padding: 15px;
  text-align: center;
  font-weight: bold;
}

tbody tr {
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
  cursor: pointer;
}

tbody tr:hover {
  background: #f8f9ff;
}

tbody tr:last-child {
  border-bottom: none;
}

td {
  padding: 15px;
  text-align: center;
}

.rank {
  font-weight: bold;
  font-size: 1.1rem;
  width: 60px;
}

.lumi-info {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-start;
  text-align: left;
  padding-left: 20px;
}

.lumi-avatar {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  object-fit: cover;
  border: 2px solid #e0e0e0;
  flex-shrink: 0;
}

.lumi-name {
  font-weight: bold;
  color: #333;
}

.battles, .wins {
  width: 100px;
  color: #666;
}

.rate {
  font-weight: bold;
  width: 80px;
}

.appearance-rate {
  color: #667eea;
}

.rate.high {
  color: #4caf50;
}

.rate.medium {
  color: #ff9800;
}

.rate.low {
  color: #f44336;
}

/* 队伍列表 */
.team-info {
  padding: 10px 20px;
}

.team-lumis {
  display: flex;
  gap: 15px;
  justify-content: center;
  flex-wrap: wrap;
}

.team-lumi {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f8f9ff;
  transition: all 0.2s;
}

.team-lumi:hover {
  background: #e9ecff;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.2);
}

.team-lumi-avatar {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  border: 2px solid #e0e0e0;
}

.team-lumi-name {
  font-size: 0.9rem;
  font-weight: bold;
  color: #333;
}

.no-data {
  text-align: center;
  padding: 40px;
  color: #999;
  font-size: 1.1rem;
}

/* 图表容器 */
.chart-container {
  background: white;
  border-radius: 12px;
  padding: 25px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.distribution-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 30px;
  padding: 20px;
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%);
  border-radius: 10px;
}

.distribution-stats .stat-card {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 20px;
  background: white;
  border-radius: 10px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  transition: all 0.3s;
}

.distribution-stats .stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.distribution-stats .stat-icon {
  font-size: 2.5rem;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  flex-shrink: 0;
}

.distribution-stats .stat-card.bronze .stat-icon {
  background: linear-gradient(135deg, #cd7f32 0%, #8b5a2b 100%);
}

.distribution-stats .stat-card.silver .stat-icon {
  background: linear-gradient(135deg, #c0c0c0 0%, #808080 100%);
}

.distribution-stats .stat-card.gold .stat-icon {
  background: linear-gradient(135deg, #ffd700 0%, #daa520 100%);
}

.distribution-stats .stat-card.diamond .stat-icon {
  background: linear-gradient(135deg, #00bfff 0%, #1e90ff 100%);
}

.distribution-stats .stat-card.star .stat-icon {
  background: linear-gradient(135deg, #8a2be2 0%, #4b0082 100%);
}

.distribution-stats .stat-card.legend .stat-icon {
  background: linear-gradient(135deg, #ff4500 0%, #8b0000 100%);
}

.distribution-stats .stat-info {
  flex: 1;
}

.distribution-stats .stat-label {
  font-size: 0.9rem;
  color: #666;
  margin-bottom: 2px;
}

.distribution-stats .stat-desc {
  font-size: 0.8rem;
  color: #999;
  margin-bottom: 5px;
}

.distribution-stats .stat-value {
  font-size: 1.8rem;
  font-weight: bold;
  color: #333;
  margin-bottom: 2px;
}

.distribution-stats .stat-percent {
  font-size: 0.85rem;
  color: #667eea;
  font-weight: bold;
}

.chart-header {
  text-align: center;
  margin-bottom: 20px;
}

.chart-header h3 {
  font-size: 1.3rem;
  color: #333;
  margin-bottom: 5px;
}

.chart-subtitle {
  font-size: 0.9rem;
  color: #999;
}

.chart-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
}

.chart-title-row > div:first-child {
  text-align: left;
}

.chart-mode-toggle {
  display: flex;
  gap: 10px;
}

.chart-mode-btn {
  padding: 8px 16px;
  border: 2px solid #ddd;
  background: white;
  color: #666;
  font-size: 0.9rem;
  font-weight: bold;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.chart-mode-btn:hover {
  border-color: #667eea;
  background: #f8f9ff;
}

.chart-mode-btn.active {
  border-color: #667eea;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);
}

.no-data-box {
  text-align: center;
  padding: 60px 20px;
  background: #f8f9fa;
  border-radius: 12px;
  border: 2px dashed #dee2e6;
}

.no-data-box p {
  margin: 10px 0;
}

.no-data-box p:first-child {
  font-size: 1.2rem;
  font-weight: bold;
  color: #666;
}

.no-data-desc {
  font-size: 0.9rem !important;
  color: #999 !important;
}

.chart-wrapper {
  position: relative;
  width: 100%;
  min-height: 400px;
}

/* 周赛胜场分布样式 */
.tournament-stats {
  grid-template-columns: repeat(5, 1fr) !important;
}

.tournament-stats .stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 15px;
  min-height: 100px;
}

.tournament-stats .stat-card.win-card {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  transition: all 0.3s;
}

.tournament-stats .stat-card.win-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.tournament-stats .stat-card.win-card.legendary {
  background: linear-gradient(135deg, #ff6b6b 0%, #ffd93d 100%);
  border-color: #ff6b6b;
}

.tournament-stats .stat-card.win-card.excellent {
  background: linear-gradient(135deg, #ffd93d 0%, #ff9f1c 100%);
  border-color: #ffd93d;
}

.tournament-stats .stat-card.win-card.good {
  background: linear-gradient(135deg, #a8e6cf 0%, #88d8b0 100%);
  border-color: #a8e6cf;
}

.tournament-stats .stat-card.win-card.average {
  background: linear-gradient(135deg, #e0e0e0 0%, #c0c0c0 100%);
  border-color: #c0c0c0;
}

.tournament-stats .stat-card.win-card.beginner {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-color: #dee2e6;
}

.tournament-stats .stat-icon {
  font-size: 2rem;
  margin-bottom: 8px;
}

.tournament-stats .stat-label {
  font-size: 0.9rem;
  font-weight: bold;
  color: #666;
  margin-bottom: 5px;
}

.tournament-stats .stat-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: #333;
  margin-bottom: 3px;
}

.tournament-stats .stat-percent {
  font-size: 0.8rem;
  color: #888;
}

/* 总人数卡片 */
.total-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: none !important;
}

.total-card .stat-icon {
  font-size: 2.5rem;
  margin-bottom: 5px;
}

.total-card .stat-label {
  color: rgba(255, 255, 255, 0.9) !important;
  font-weight: bold;
}

.total-card .stat-desc {
  color: rgba(255, 255, 255, 0.7) !important;
  font-size: 0.8rem;
}

.total-card .stat-value {
  color: white !important;
  font-size: 2rem !important;
}

/* 响应式 */
@media (max-width: 768px) {
  .page-header h1 {
    font-size: 1.8rem;
  }

  .week-selector {
    flex-direction: column;
    align-items: stretch;
  }

  .filters {
    flex-direction: column;
    align-items: center;
  }

  .stats-overview {
    flex-direction: column;
    align-items: center;
  }

  .distribution-stats {
    grid-template-columns: repeat(2, 1fr);
    gap: 15px;
  }

  table {
    font-size: 0.9rem;
  }

  .lumi-avatar {
    width: 40px;
    height: 40px;
  }
}
</style>
