<script setup>
import { ref, onMounted, computed } from 'vue'
import { loadData, TYPE_NAMES, TYPE_COLORS, getKeywordMap } from '../data'

const activeSkills = ref([])
const battlePassives = ref([])
const homePassives = ref([])
const lumis = ref([])
const locMap = ref({})
const keywordMap = ref([])
const loading = ref(true)
const selectedKeyword = ref(null)
const showKeywordTooltip = ref(false)
const searchQuery = ref('')
const filterType = ref(0)
const tab = ref('active') // active | passive
const skillCategory = ref('all') // all | common | exclusive
const passiveCategory = ref('battle') // battle | home

const assSkillIds = ref(new Set())

// 被动技能到噜咪的映射
const passiveToLumiMap = ref(new Map())
// 主动技能到噜咪的映射
const activeToLumiMap = ref(new Map())
// 拥有者列表展开状态
const expandedOwners = ref(new Set())

onMounted(async () => {
  const [skills, bPassives, hPassives, lumiData, loc, keywords] = await Promise.all([
    loadData('ActiveSkill'),
    loadData('BattlePassive'),
    loadData('HomePassive'),
    loadData('Lumi'),
    loadData('localization'),
    getKeywordMap(),
  ])
  activeSkills.value = skills
  battlePassives.value = bPassives
  homePassives.value = hPassives
  lumis.value = lumiData
  locMap.value = loc
  keywordMap.value = keywords

  // 建立被动技能到噜咪的映射
  const pMap = new Map()
  for (const lumi of lumiData) {
    if (lumi.BattlePassive) {
      if (!pMap.has(lumi.BattlePassive)) pMap.set(lumi.BattlePassive, [])
      pMap.get(lumi.BattlePassive).push({ id: lumi.Id, name: lumi.Name, pokedexId: lumi.PokedexId })
    }
    if (lumi.HomePassive) {
      if (!pMap.has(lumi.HomePassive)) pMap.set(lumi.HomePassive, [])
      pMap.get(lumi.HomePassive).push({ id: lumi.Id, name: lumi.Name, pokedexId: lumi.PokedexId })
    }
  }
  passiveToLumiMap.value = pMap

  // 建立主动技能到噜咪的映射（固有技能、普攻、技能池）
  const aMap = new Map()
  for (const lumi of lumiData) {
    // 固有技能
    if (lumi.ActiveSkill) {
      if (!aMap.has(lumi.ActiveSkill)) aMap.set(lumi.ActiveSkill, [])
      aMap.get(lumi.ActiveSkill).push({ id: lumi.Id, name: lumi.Name, pokedexId: lumi.PokedexId })
    }
    // 普攻
    if (lumi.NormalAttack) {
      if (!aMap.has(lumi.NormalAttack)) aMap.set(lumi.NormalAttack, [])
      aMap.get(lumi.NormalAttack).push({ id: lumi.Id, name: lumi.Name, pokedexId: lumi.PokedexId })
    }
    // 技能池1/2/3
    for (const pool of [lumi.SkillPool1, lumi.SkillPool2, lumi.SkillPool3]) {
      if (pool && pool.length) {
        for (const skillId of pool) {
          if (!aMap.has(skillId)) aMap.set(skillId, [])
          aMap.get(skillId).push({ id: lumi.Id, name: lumi.Name, pokedexId: lumi.PokedexId })
        }
      }
    }
  }
  activeToLumiMap.value = aMap

  // 收集所有被作为 AssSkill 的技能 ID
  const assIds = new Set()
  for (const skill of skills) {
    if (skill.AssSkill && skill.AssSkill.length > 0) {
      for (const id of skill.AssSkill) {
        assIds.add(id)
      }
    }
  }
  assSkillIds.value = assIds

  loading.value = false

  // 注册 showKeyword 到 window 对象
  window.showKeyword = (id) => {
    selectedKeyword.value = keywordMap.value.find(k => k.Id === parseInt(id))
    if (selectedKeyword.value) {
      showKeywordTooltip.value = true
    }
  }
})

function getName(key) { return locMap.value[key] || key || '???' }

// 获取被动技能的拥有者噜咪列表
function getPassiveOwners(passiveId) {
  return passiveToLumiMap.value.get(passiveId) || []
}

// 获取主动技能的拥有者噜咪列表
function getActiveOwners(skillId) {
  return activeToLumiMap.value.get(skillId) || []
}

// 切换拥有者列表展开状态
function toggleOwners(skillId) {
  if (expandedOwners.value.has(skillId)) {
    expandedOwners.value.delete(skillId)
  } else {
    expandedOwners.value.add(skillId)
  }
}

// 判断是否展开
function isExpanded(skillId) {
  return expandedOwners.value.has(skillId)
}

// 拥有者显示数量阈值
const OWNER_SHOW_THRESHOLD = 5

// 计算技能威力总和
function getSkillPowerSum(skill) {
  if (!skill.SkillPowerList || !skill.SkillPowerList.length) return '-'
  const sum = skill.SkillPowerList.reduce((a, b) => a + b, 0)
  return sum
}

// 替换描述中的占位符 [xxx] 为多语言文本，{0}{1} 等为参数
// 并处理颜色标签 <color=xxx> 和链接标签 <link=xxx>
function replacePlaceholders(text, desParam = []) {
  if (!text) return ''
  let result = text
  // 先替换所有 [xxx] 格式的占位符
  result = result.replace(/\[([^\]]+)\]/g, (match, key) => {
    return locMap.value[key] || key
  })
  // 再替换 {0}, {1} 等参数
  if (desParam && desParam.length) {
    result = result.replace(/\{(\d+)\}/g, (match, index) => {
      const paramIndex = parseInt(index)
      return desParam[paramIndex] !== undefined ? desParam[paramIndex] : match
    })
  }
  // 处理 <link=数字><color=xxx>文字</color></link> 转换为可点击元素
  result = result.replace(/<link=(\d+)><color=([^>]+)>([^<]+)<\/color><\/link>/gi, (match, linkId, color, content) => {
    return `<span class="keyword-link" style="color: ${color}; text-decoration: underline; cursor: pointer;" onclick="window.showKeyword(${linkId})">${content}</span>`
  })
  // 处理独立的 <color=xxx> 标签
  result = result.replace(/<color=([^>]+)>/gi, '<span style="color: $1">')
  result = result.replace(/<\/color>/gi, '</span>')
  // 移除剩余的 link 标签
  result = result.replace(/<\/?link=\d+>/gi, '')
  return result
}

// 获取技能的完整描述（包含参数替换）
function getSkillDes(skill) {
  if (!skill || !skill.Des) return ''
  return replacePlaceholders(locMap.value[skill.Des] || '', skill.DesParam || [])
}

// 获取被动技能的完整描述
function getPassiveDes(passive) {
  if (!passive || !passive.Des) return ''
  return replacePlaceholders(locMap.value[passive.Des] || '', passive.DesParam || [])
}

const typeOptions = computed(() => {
  const opts = [{ value: 0, label: '全部属性' }]
  for (const [k, v] of Object.entries(TYPE_NAMES)) {
    opts.push({ value: Number(k), label: v })
  }
  return opts
})

const filteredActive = computed(() => {
  let list = activeSkills.value
  // 过滤掉被作为 AssSkill 的技能
  list = list.filter(s => !assSkillIds.value.has(s.Id))
  // 按技能分类过滤
  if (skillCategory.value === 'common') {
    list = list.filter(s => s.Id <= 9999999)
  } else if (skillCategory.value === 'exclusive') {
    // 专属技能：只显示专属技能（已过滤普攻）
    list = list.filter(s => s.Id >= 10000000 && !String(s.Id).endsWith('01'))
  } else {
    // 全部：显示通用技能 + 专属技能（排除专属技能中的普攻）
    list = list.filter(s => s.Id <= 9999999 || (s.Id >= 10000000 && !String(s.Id).endsWith('01')))
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(s =>
      getName(s.name).toLowerCase().includes(q) ||
      String(s.Id).includes(q)
    )
  }
  if (filterType.value) {
    list = list.filter(s => s.LumiTpye === filterType.value)
  }
  return list
})

const filteredPassive = computed(() => {
  let list = passiveCategory.value === 'battle' ? battlePassives.value : homePassives.value
  // 战斗被动过滤掉 name 为空的（特殊不外显）
  if (passiveCategory.value === 'battle') {
    list = list.filter(s => s.name && s.name.trim() !== '')
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(s =>
      getName(s.name).toLowerCase().includes(q) ||
      String(s.Id).includes(q)
    )
  }
  return list
})

// 技能分类数量统计
const skillCounts = computed(() => {
  const allSkills = activeSkills.value.filter(s => !assSkillIds.value.has(s.Id))
  const commonSkills = allSkills.filter(s => s.Id <= 9999999)
  const exclusiveSkills = allSkills.filter(s => s.Id >= 10000000 && !String(s.Id).endsWith('01'))
  // 全部 = 通用技能 + 专属技能（排除普攻）
  const allDisplaySkills = [...commonSkills, ...exclusiveSkills]
  return {
    all: allDisplaySkills.length,
    common: commonSkills.length,
    exclusive: exclusiveSkills.length,
  }
})
</script>

<template>
  <div v-if="loading" class="loading">加载中...</div>
  <div v-else>
    <h1 class="page-title">⚡ 技能图鉴</h1>

    <!-- 标签切换 -->
    <div class="tabs">
      <button :class="{ active: tab === 'active' }" @click="tab = 'active'">
        主动技能
      </button>
      <button :class="{ active: tab === 'passive' }" @click="tab = 'passive'">
        被动技能 ({{ filteredPassive.length }})
      </button>
    </div>

    <!-- 主动技能分类 -->
    <div v-if="tab === 'active'" class="skill-category-tabs">
      <button :class="{ active: skillCategory === 'all' }" @click="skillCategory = 'all'">
        全部 ({{ skillCounts.all }})
      </button>
      <button :class="{ active: skillCategory === 'common' }" @click="skillCategory = 'common'">
        通用技能 ({{ skillCounts.common }})
      </button>
      <button :class="{ active: skillCategory === 'exclusive' }" @click="skillCategory = 'exclusive'">
        专属技能 ({{ skillCounts.exclusive }})
      </button>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <input v-model="searchQuery" placeholder="搜索技能名称或 ID..." />
      <select v-if="tab === 'active'" v-model="filterType">
        <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <!-- 主动技能表格 -->
    <div v-if="tab === 'active'" class="table-wrap">
      <div class="section-title">
        <span v-if="skillCategory === 'all'">全部主动技能</span>
        <span v-else-if="skillCategory === 'common'">通用技能 (ID ≤ 9999999)</span>
        <span v-else-if="skillCategory === 'exclusive'">专属技能 (ID ≥ 10000000)</span>
        <span class="count-badge">{{ filteredActive.length }} 个</span>
      </div>
      <table class="data-table" v-if="filteredActive.length">
        <thead>
          <tr>
            <th>图标</th>
            <th>ID</th>
            <th>名称</th>
            <th>属性</th>
            <th>消耗</th>
            <th>威力</th>
            <th>描述</th>
            <th>拥有者</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="sk in filteredActive" :key="sk.Id">
            <td>
              <img
                v-if="sk.icon"
                :src="`/images/skills/${sk.icon}.png`"
                class="table-skill-icon"
                @error="($event.target).style.display='none'"
              />
            </td>
            <td>{{ sk.Id }}</td>
            <td class="font-bold">{{ getName(sk.name) }}</td>
            <td>
              <span class="type-tag" :style="{ background: TYPE_COLORS[sk.LumiTpye] || '#666' }">
                {{ TYPE_NAMES[sk.LumiTpye] || '未知' }}
              </span>
            </td>
            <td>{{ Math.floor(sk.SkillCost / 10) }}</td>
            <td>{{ getSkillPowerSum(sk) }}</td>
            <td class="text-dim" v-html="getSkillDes(sk)"></td>
            <td class="owners-cell">
              <template v-if="getActiveOwners(sk.Id).length">
                <template v-if="getActiveOwners(sk.Id).length > OWNER_SHOW_THRESHOLD && !isExpanded(sk.Id)">
                  <router-link
                    v-for="owner in getActiveOwners(sk.Id).slice(0, OWNER_SHOW_THRESHOLD)"
                    :key="owner.id"
                    :to="`/lumi/${owner.id}`"
                    class="owner-link"
                  >
                    {{ getName(owner.name) || `#${owner.pokedexId}` }}
                  </router-link>
                  <button class="expand-btn" @click="toggleOwners(sk.Id)">
                    +{{ getActiveOwners(sk.Id).length - OWNER_SHOW_THRESHOLD }}更多
                  </button>
                </template>
                <template v-else>
                  <router-link
                    v-for="owner in getActiveOwners(sk.Id)"
                    :key="owner.id"
                    :to="`/lumi/${owner.id}`"
                    class="owner-link"
                  >
                    {{ getName(owner.name) || `#${owner.pokedexId}` }}
                  </router-link>
                  <button
                    v-if="getActiveOwners(sk.Id).length > OWNER_SHOW_THRESHOLD"
                    class="expand-btn"
                    @click="toggleOwners(sk.Id)"
                  >
                    收起
                  </button>
                </template>
              </template>
              <span v-else class="text-dim">-</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">没有找到匹配的技能</div>
    </div>

    <!-- 被动技能表格 -->
    <div v-if="tab === 'passive'">
      <!-- 被动技能分类 -->
      <div class="skill-category-tabs">
        <button :class="{ active: passiveCategory === 'battle' }" @click="passiveCategory = 'battle'">
          战斗被动 ({{ battlePassives.filter(s => s.name && s.name.trim() !== '').length }})
        </button>
        <button :class="{ active: passiveCategory === 'home' }" @click="passiveCategory = 'home'">
          家园被动 ({{ homePassives.length }})
        </button>
      </div>

      <div class="table-wrap">
        <div class="section-title">
          <span v-if="passiveCategory === 'battle'">战斗被动</span>
          <span v-else>家园被动</span>
          <span class="count-badge">{{ filteredPassive.length }} 个</span>
        </div>
        <table class="data-table" v-if="filteredPassive.length">
        <thead>
          <tr>
            <th>ID</th>
            <th>名称</th>
            <th>描述</th>
            <th>拥有者</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="sk in filteredPassive" :key="sk.Id">
            <td>{{ sk.Id }}</td>
            <td class="font-bold">{{ getName(sk.name) || `被动#${sk.Id}` }}</td>
            <td class="text-dim" v-html="getSkillDes(sk)"></td>
            <td>
              <router-link
                v-for="owner in getPassiveOwners(sk.Id)"
                :key="owner.id"
                :to="`/lumi/${owner.id}`"
                class="owner-link"
              >
                {{ getName(owner.name) || `#${owner.pokedexId}` }}
              </router-link>
              <span v-if="!getPassiveOwners(sk.Id).length" class="text-dim">-</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">没有找到匹配的被动技能</div>
      </div>
    </div>
  </div>

  <!-- 关键字弹窗 -->
  <div v-if="showKeywordTooltip && selectedKeyword" class="tooltip-overlay" @click="showKeywordTooltip = false">
    <div class="tooltip-card" @click.stop>
      <div class="tooltip-header">
        <h3>{{ getName(selectedKeyword.Name) }}</h3>
        <button class="tooltip-close" @click="showKeywordTooltip = false">✕</button>
      </div>
      <div class="tooltip-body">
        {{ getName(selectedKeyword.Des) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.tabs button {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95em;
  transition: all 0.2s;
}
.tabs button.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.skill-category-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.skill-category-tabs button {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85em;
  transition: all 0.2s;
}
.skill-category-tabs button:hover {
  border-color: var(--accent-light);
}
.skill-category-tabs button.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.table-wrap {
  overflow-x: auto;
}
.section-title {
  margin-bottom: 12px;
  font-size: 1.1em;
  font-weight: 600;
  color: var(--text);
}
.count-badge {
  margin-left: 8px;
  padding: 2px 10px;
  background: var(--accent);
  color: white;
  border-radius: 12px;
  font-size: 0.8em;
}
.table-skill-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  image-rendering: pixelated;
}
.font-bold { font-weight: 600; }
.text-dim { color: var(--text-dim); font-size: 0.9em; }
.owner-link {
  display: inline-block;
  padding: 2px 8px;
  margin-right: 4px;
  margin-bottom: 2px;
  background: rgba(233, 69, 96, 0.15);
  color: var(--accent-light);
  text-decoration: none;
  border-radius: 4px;
  font-size: 0.85em;
  transition: all 0.2s;
}
.owner-link:hover {
  background: var(--accent);
  color: white;
  transform: translateY(-1px);
}
.owners-cell {
  min-width: 200px;
  max-width: 350px;
}
.expand-btn {
  display: inline-block;
  padding: 2px 6px;
  margin-left: 4px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid var(--border);
  color: var(--text-dim);
  border-radius: 4px;
  font-size: 0.8em;
  cursor: pointer;
  transition: all 0.2s;
}
.expand-btn:hover {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}
/* 关键字弹窗 */
.tooltip-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.tooltip-card {
  background: #1a1a2e;
  border: 2px solid #e94560;
  border-radius: 12px;
  padding: 20px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e94560;
}
.tooltip-header h3 {
  color: #e94560;
  font-size: 1.3em;
  margin: 0;
}
.tooltip-close {
  background: none;
  border: none;
  color: #888;
  font-size: 1.5em;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tooltip-close:hover {
  color: #e94560;
}
.tooltip-body {
  color: #e0e0e0;
  line-height: 1.6;
  font-size: 0.95em;
}
.keyword-link:hover {
  opacity: 0.8;
}
</style>
