<script setup>
import { ref, onMounted, computed } from 'vue'
import { loadData, TYPE_NAMES } from '../data'

const groups = ref([])
const locMap = ref({})
const lumiMap = ref(new Map())
const itemMap = ref(new Map())
const condMap = ref(new Map())
const loading = ref(true)
const filterStatus = ref('all') // all | upcoming | ongoing | ended

const QUALITY_NAMES = { 1: '白', 2: '绿', 3: '蓝', 4: '紫', 5: '金', 6: '彩' }
const SEASON_NAMES = { 1: '主线', 2: 'S1', 3: 'S2', 4: 'S3', 5: 'S4' }

onMounted(async () => {
  const [req, cond, lumi, item, loc] = await Promise.all([
    loadData('Request'),
    loadData('LumiCondition'),
    loadData('Lumi'),
    loadData('Item'),
    loadData('localization')
  ])
  locMap.value = loc

  const lumiArr = Array.isArray(lumi) ? lumi : (lumi.data || Object.values(lumi))
  lumiMap.value = new Map(lumiArr.map(x => [x.Id, x]))
  const itemArr = Array.isArray(item) ? item : (item.data || Object.values(item))
  itemMap.value = new Map(itemArr.map(x => [x.key1, x]))
  const condArr = Array.isArray(cond) ? cond : (cond.data || Object.values(cond))
  condMap.value = new Map(condArr.map(x => [x.LumiCondtionID, x]))

  // 仅正式配置（有 StartTime + EndTime），按 StartTime 升序
  const reqArr = Array.isArray(req) ? req : (req.data || Object.values(req))
  groups.value = reqArr
    .filter(g => g.StartTime && g.EndTime)
    .map(g => ({
      ...g,
      start: parseTime(g.StartTime),
      end: parseTime(g.EndTime),
      nameKey: g.RequestGroupName,
      requestData: (g.RequestData || []).map(r => ({
        desKey: r.RequestDes,
        requirements: (r.RequestConditions1 || []).map(c => ({
          condition: condMap.value.get(c.X),
          count: c.Y,
          z: c.Z
        })),
        rewards: (r.Rewards || []).filter(rw => rw.Type === 2 || rw.Type === 8)
      }))
    }))
    .sort((a, b) => a.start - b.start)

  loading.value = false
})

function parseTime(s) {
  // "2026/7/10 5:00:00" → Date
  return new Date(s.replace(/\//g, '-'))
}

function getName(key) {
  if (!key) return ''
  return locMap.value[key] || key
}

function getLumiName(id) {
  const l = lumiMap.value.get(id)
  return l ? (locMap.value[l.Name] || l.Name) : `Lumi#${id}`
}

function getLumiAvatar(id) {
  const l = lumiMap.value.get(id)
  return l?.CA ? `/images/avatars/${l.CA}.png` : ''
}

function getItemInfo(id) {
  const it = itemMap.value.get(id)
  if (!it) return { name: `Item#${id}`, icon: '' }
  return {
    name: locMap.value[it.name] || it.name,
    icon: it.icon ? `/images/items/${it.icon}.png` : ''
  }
}

function getRewardInfo(reward) {
  if (reward.Type === 2) {
    // 物品
    const info = getItemInfo(reward.Id)
    return { ...info, kind: 'item' }
  }
  if (reward.Type === 8) {
    // 噜咪（Id 前 6 位是 Lumi.Id，末位是等级）
    const idStr = String(reward.Id)
    const lumiId = parseInt(idStr.slice(0, 6))
    const level = parseInt(idStr.slice(6)) || 0
    return {
      name: getLumiName(lumiId) + (level ? ` +${level}` : ''),
      icon: getLumiAvatar(lumiId),
      kind: 'lumi'
    }
  }
  return { name: `Type${reward.Type}#${reward.Id}`, icon: '', kind: 'unknown' }
}

// 根据 LumiConditionType 渲染友好描述（覆盖全部 29 种类型）
function renderCondition(req) {
  const cond = req.condition
  if (!cond) return `条件 #${req.count}`
  const t = cond.LumiConditionType
  const p1 = cond.Param1 || []
  const p2 = cond.Param2 || []
  const countSuffix = ` ×${req.count}`

  const attrNames = ids => (ids || []).map(id => TYPE_NAMES[id] || `属性${id}`).join('/')
  const qualName = q => QUALITY_NAMES[q] || `品质${q}`
  const quals = ids => (ids || []).map(qualName).join('/')
  const lumiNames = ids => (ids || []).map(id => getLumiName(id)).join('/')
  // 区间格式：min==max 显示单值，否则显示 min~max
  const range = (arr, unit = '') => {
    if (!arr.length) return ''
    if (arr.length === 1 || arr[0] === arr[1]) return `${arr[0]}${unit}`
    return `${arr[0]}~${arr[1]}${unit}`
  }

  let base = ''
  switch (t) {
    case 1: base = p1.length ? `${p1[0]} 只` : '数量要求'; break
    case 2: base = `${p1[0] || '?'} 种不同属性`; break
    case 3: base = `${p1[0] || '?'} 种不同品质`; break
    case 4: base = `指定 ${lumiNames(p1)}`; break
    case 5: base = `评分 ${range(p1)}`; break
    case 6: base = `包含 ${attrNames(p1)} 属性`; break
    case 7: base = `不包含 ${attrNames(p1)} 属性`; break
    case 8: base = `共 ${p1[0] || '?'} 种不同属性`; break
    case 9: base = `品质 ${range(p1.map(qualName))}`; break
    case 10: base = `${quals(p1)} 品质的 ${lumiNames(p2)}`; break
    case 11: base = `${quals(p1)} 品质，评分 ${p2[0] || '?'}`; break
    case 12: base = `列表里任选: ${lumiNames(p1)}`; break
    case 13: base = `每只都要: ${lumiNames(p1)}`; break
    case 14: base = `来自地图 ${p1.join('/')}`; break
    case 15: base = `指定图册 ${p1.join('/')}`; break
    case 16: base = '属性互不相同'; break
    case 17: base = '同一进化链'; break
    case 18: base = p1.length ? `总计 ${p1[0]} 种品质` : '总计品质数量'; break
    case 19: base = p1.length ? `总计 ${p1[0]} 种属性` : '总计属性数量'; break
    case 20: base = `身高 ${range(p1, ' cm')}`; break
    case 21: base = `体重 ${range(p1, ' kg')}`; break
    case 22: base = `队伍均分 ${range(p1)}`; break
    case 23: base = `${p2.map(s => SEASON_NAMES[s] || `赛季${s}`).join('/')} ${quals(p1)}`; break
    case 24: base = `主技能耗能 ${range(p1)}`; break
    case 25: base = `通用技能数 ${range(p1)}`; break
    case 26: base = `指定赛季图册 ${p1.join('/')}`; break
    case 27: base = p2.length ? `初训噜咪为 ${lumiNames(p2)}` : '初训噜咪要求'; break
    case 28: base = '提交互不重复'; break
    case 29: base = '指定星彩品质'; break
    default: base = `条件类型${t} P1=${JSON.stringify(p1)} P2=${JSON.stringify(p2)}`
  }
  return base + countSuffix
}

function formatTime(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getStatus(g) {
  const now = Date.now()
  if (now < g.start.getTime()) return 'upcoming'
  if (now > g.end.getTime()) return 'ended'
  return 'ongoing'
}

const statusLabels = {
  upcoming: { label: '未开始', color: '#888' },
  ongoing: { label: '进行中', color: '#4caf50' },
  ended: { label: '已结束', color: '#e94560' }
}

const filteredGroups = computed(() => {
  if (filterStatus.value === 'all') return groups.value
  return groups.value.filter(g => getStatus(g) === filterStatus.value)
})

function handleImageError(e) {
  e.target.style.visibility = 'hidden'
}
</script>

<template>
  <div class="star-exchange">
    <div class="page-header">
      <h1>🌟 归星预览</h1>
      <p class="subtitle">按时间展示所有归星兑换活动（提交噜咪换取奖励）</p>
    </div>

    <div class="filters">
      <button
        v-for="(cfg, key) in { all: '全部', upcoming: '未开始', ongoing: '进行中', ended: '已结束' }"
        :key="key"
        :class="['filter-btn', { active: filterStatus === key }]"
        @click="filterStatus = key"
      >{{ cfg }}</button>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="filteredGroups.length === 0" class="no-data">无匹配的归星活动</div>
    <div v-else class="timeline">
      <div v-for="g in filteredGroups" :key="g.RequestGroupID" :class="['timeline-item', getStatus(g)]">
        <div class="timeline-dot"></div>
        <div class="item-header">
          <h2 class="group-name">{{ getName(g.nameKey) || `归星 #${g.RequestGroupID}` }}</h2>
          <span class="status-badge" :style="{ color: statusLabels[getStatus(g)].color, borderColor: statusLabels[getStatus(g)].color }">
            {{ statusLabels[getStatus(g)].label }}
          </span>
        </div>
        <div class="time-range">
          📅 {{ formatTime(g.start) }} ~ {{ formatTime(g.end) }}
        </div>

        <div v-for="(rd, i) in g.requestData" :key="i" class="exchange-card">
          <div class="requirements">
            <div class="section-label">需求噜咪</div>
            <div v-for="(req, j) in rd.requirements" :key="j" class="requirement">
              · {{ renderCondition(req) }}
            </div>
          </div>
          <div class="arrow">→</div>
          <div class="rewards">
            <div class="section-label">奖励</div>
            <div class="reward-list">
              <div v-for="(rw, k) in rd.rewards" :key="k" :class="['reward-item', rw.kind]">
                <img v-if="getRewardInfo(rw).icon" :src="getRewardInfo(rw).icon" :alt="getRewardInfo(rw).name" class="reward-icon" @error="handleImageError">
                <span class="reward-name">{{ getRewardInfo(rw).name }}</span>
                <span class="reward-count">×{{ rw.Count }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.star-exchange {
  max-width: 1100px;
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
}

.filters {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 24px;
}

.filter-btn {
  padding: 6px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  color: #ccc;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.filter-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.filter-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.loading, .no-data {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-dim);
}

.timeline {
  position: relative;
  padding-left: 32px;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: linear-gradient(to bottom, transparent, rgba(233, 69, 96, 0.4) 10%, rgba(233, 69, 96, 0.4) 90%, transparent);
}

.timeline-item {
  position: relative;
  margin-bottom: 24px;
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  transition: all 0.2s;
}

.timeline-item:hover {
  background: rgba(255, 255, 255, 0.06);
  transform: translateX(2px);
}

.timeline-item.ended {
  opacity: 0.55;
}

.timeline-dot {
  position: absolute;
  left: -32px;
  top: 24px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  border: 3px solid #1a1a2e;
  box-shadow: 0 0 0 2px var(--accent);
}

.timeline-item.ongoing .timeline-dot {
  background: #4caf50;
  box-shadow: 0 0 0 2px #4caf50, 0 0 12px rgba(76, 175, 80, 0.6);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 2px #4caf50, 0 0 12px rgba(76, 175, 80, 0.6); }
  50% { box-shadow: 0 0 0 2px #4caf50, 0 0 20px rgba(76, 175, 80, 0.9); }
}

.timeline-item.upcoming .timeline-dot {
  background: #888;
  box-shadow: 0 0 0 2px #888;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.group-name {
  color: #fff;
  font-size: 1.15em;
  margin: 0;
}

.status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid;
  border-radius: 10px;
  white-space: nowrap;
}

.time-range {
  color: var(--text-dim);
  font-size: 13px;
  margin-bottom: 14px;
}

.exchange-card {
  display: flex;
  gap: 16px;
  align-items: stretch;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  padding: 12px;
  margin-top: 8px;
}

.requirements {
  flex: 1;
}

.arrow {
  display: flex;
  align-items: center;
  font-size: 1.5em;
  color: var(--accent);
  font-weight: bold;
}

.rewards {
  flex: 1;
}

.section-label {
  color: var(--text-dim);
  font-size: 11px;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.requirement {
  color: #e0e0e0;
  font-size: 13px;
  line-height: 1.6;
}

.reward-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.reward-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
}

.reward-item.lumi {
  background: rgba(233, 69, 96, 0.08);
}

.reward-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.reward-name {
  color: #fff;
  font-size: 13px;
  flex: 1;
}

.reward-count {
  color: var(--accent);
  font-weight: 600;
  font-size: 13px;
}
</style>
