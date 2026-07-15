<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadData, t, TYPE_NAMES, TYPE_COLORS, WORK_TYPE_NAMES, LUMI_TAG_NAMES, LUMI_CARD_TYPE, LUMI_CARD_TYPE_COLORS, getKeywordMap, keywordSync } from '../data'

const route = useRoute()
const router = useRouter()
const lumi = ref(null)
const locMap = ref({})
const activeSkills = ref([])
const battlePassives = ref([])
const homePassives = ref([])
const evolutions = ref([])
const allLumis = ref([])
const typeCounters = ref([])
const keywordMap = ref([])
const avgData = ref([])
const extraData = ref({})
const marketPrices = ref({})
const loading = ref(true)
const selectedKeyword = ref(null)
const showKeywordTooltip = ref(false)

// 加载数据的函数
async function loadLumiData() {
  loading.value = true
  const id = Number(route.params.id)
  const [data, loc, skills, bPassives, hPassives, evos, lumis, tCounters, keywords, avg, extra, market] = await Promise.all([
    loadData('Lumi'),
    loadData('localization'),
    loadData('ActiveSkill'),
    loadData('BattlePassive'),
    loadData('HomePassive'),
    loadData('LumiEvolution'),
    loadData('Lumi'),
    loadData('LumiTypeCounter'),
    getKeywordMap(),
    loadData('Avg'),
    loadData('extra').catch(() => ({})),
    loadData('MarketPrice').catch(() => []),
  ])

  lumi.value = data.find(l => l.Id === id)
  locMap.value = loc
  activeSkills.value = skills
  battlePassives.value = bPassives
  homePassives.value = hPassives
  evolutions.value = evos
  allLumis.value = lumis
  typeCounters.value = tCounters
  keywordMap.value = keywords
  avgData.value = avg
  extraData.value = extra
  marketPrices.value = Array.isArray(market) ? market : []
  loading.value = false

  // 注册 showKeyword 到 window 对象供 HTML onclick 调用
  window.showKeyword = (id) => {
    selectedKeyword.value = keywordMap.value.find(k => k.Id === parseInt(id))
    if (selectedKeyword.value) {
      showKeywordTooltip.value = true
    }
  }
}

// 监听路由变化
watch(() => route.params.id, () => {
  loadLumiData()
  // 滚动到顶部
  window.scrollTo(0, 0)
})

onMounted(() => {
  loadLumiData()
})

// 上一只 / 下一只导航（按 PokedexId 图鉴顺序）
const sortedLumis = computed(() => [...allLumis.value].sort((a, b) => a.PokedexId - b.PokedexId))
const currentIndex = computed(() => lumi.value ? sortedLumis.value.findIndex(l => l.Id === lumi.value.Id) : -1)
const prevLumi = computed(() => {
  const i = currentIndex.value
  return i > 0 ? sortedLumis.value[i - 1] : null
})
const nextLumi = computed(() => {
  const i = currentIndex.value
  const list = sortedLumis.value
  return i >= 0 && i < list.length - 1 ? list[i + 1] : null
})
function goPrev() {
  if (prevLumi.value) router.push(`/lumi/${prevLumi.value.Id}`)
}
function goNext() {
  if (nextLumi.value) router.push(`/lumi/${nextLumi.value.Id}`)
}

// 工具函数
function getName(key) { return locMap.value[key] || key || '???' }
function hasValidContent(key) {
  const val = locMap.value[key]
  return val && val !== '无' && val.trim() !== ''
}
function getTypeName(id) { return TYPE_NAMES[id] || '无' }

// 获取初见文本（处理 \\n 分隔符）
function getFirstMeetText(key) {
  if (!key) return ''
  const rawText = locMap.value[key] || ''
  if (!rawText) return ''
  // 如果包含 \\n，只显示后面的部分
  const parts = rawText.split('\\n')
  let text = parts.length > 1 ? parts[1] : rawText
  // 移除富文本标签（如 <size=...><color=...> 等）
  text = text.replace(/<[^>]+>/g, '')
  return text.trim()
}

function getLumiName(lumiId) {
  const l = allLumis.value.find(x => x.Id === lumiId)
  return l ? (locMap.value[l.Name] || `#${lumiId}`) : `#${lumiId}`
}

// 获取主动技能名称和图标
function getSkillName(skillId) {
  const s = activeSkills.value.find(x => x.Id === skillId)
  return s ? (locMap.value[s.name] || s.name) : `技能#${skillId}`
}
function getSkillIcon(skillId) {
  const s = activeSkills.value.find(x => x.Id === skillId)
  return s ? s.icon : null
}
function getSkillDes(skillId) {
  const s = activeSkills.value.find(x => x.Id === skillId)
  if (!s) return ''
  return replacePlaceholders(locMap.value[s.Des] || '', s.DesParam || [])
}

// 获取技能属性
function getSkillType(skillId) {
  const s = activeSkills.value.find(x => x.Id === skillId)
  return s ? s.LumiTpye : null
}

// 获取技能消耗
function getSkillCost(skillId) {
  const s = activeSkills.value.find(x => x.Id === skillId)
  return s ? Math.floor(s.SkillCost / 10) : null
}

// 计算技能威力总和
function getSkillPowerSum(skillId) {
  const s = activeSkills.value.find(x => x.Id === skillId)
  if (!s || !s.SkillPowerList || !s.SkillPowerList.length) return '-'
  return s.SkillPowerList.reduce((a, b) => a + b, 0)
}

// 获取被动技能名称（战斗被动 + 家园被动）
function getPassiveName(passiveId) {
  const bp = battlePassives.value.find(x => x.Id === passiveId)
  if (bp) return locMap.value[bp.name] || bp.name || `被动#${passiveId}`
  const hp = homePassives.value.find(x => x.Id === passiveId)
  if (hp) return locMap.value[hp.name] || hp.name || `被动#${passiveId}`
  return `被动#${passiveId}`
}
function getPassiveDes(passiveId) {
  const bp = battlePassives.value.find(x => x.Id === passiveId)
  if (bp && bp.Des) return replacePlaceholders(locMap.value[bp.Des] || '', bp.DesParam || [])
  const hp = homePassives.value.find(x => x.Id === passiveId)
  if (hp && hp.Des) return replacePlaceholders(locMap.value[hp.Des] || '', hp.DesParam || [])
  return ''
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

// 获取完整的进化链（递归查找）
const fullEvolutionChain = computed(() => {
  if (!lumi.value) return []

  const currentId = lumi.value.Id
  const chain = []

  // 递归查找所有前置进化
  function findPrevChain(lumiId, visited = new Set()) {
    if (visited.has(lumiId)) return []
    visited.add(lumiId)

    const result = []

    const prevEvos = evolutions.value.filter(e => e.evoLumiID === lumiId && e.EvoType !== 3)
    for (const prevEvo of prevEvos) {
      const prevLumi = allLumis.value.find(l => l.Id === prevEvo.Lumi)
      if (prevLumi) {
        const before = findPrevChain(prevEvo.Lumi, visited)
        result.push(...before)
        result.push({
          lumi: prevLumi,
          stage: 'prev',
          level: prevEvo.evoLevel,
        })
      }
    }

    const prevGenderEvos = evolutions.value.filter(e =>
      e.EvoType !== 3 && e.GenderEvo && e.GenderEvo.some(g => g[1] === lumiId)
    )
    for (const prevGE of prevGenderEvos) {
      const prevLumi = allLumis.value.find(l => l.Id === prevGE.Lumi)
      if (prevLumi) {
        const genderEntry = prevGE.GenderEvo.find(g => g[1] === lumiId)
        const before = findPrevChain(prevGE.Lumi, visited)
        result.push(...before)
        result.push({
          lumi: prevLumi,
          stage: 'prev',
          level: prevGE.evoLevel,
          gender: genderEntry[0],
        })
      }
    }

    return result
  }

  // 递归查找所有后续进化
  function findNextChain(lumiId, visited = new Set()) {
    if (visited.has(lumiId)) return []
    visited.add(lumiId)

    const result = []

    const nextEvos = evolutions.value.filter(e => e.Lumi === lumiId && e.EvoType !== 3)
    for (const nextEvo of nextEvos) {
      if (nextEvo.evoLumiID) {
        const nextLumi = allLumis.value.find(l => l.Id === nextEvo.evoLumiID)
        if (nextLumi) {
          result.push({
            lumi: nextLumi,
            stage: 'next',
            level: nextEvo.evoLevel,
          })
          const after = findNextChain(nextEvo.evoLumiID, visited)
          result.push(...after)
        }
      }
      if (nextEvo.GenderEvo && nextEvo.GenderEvo.length) {
        for (const [gender, targetId] of nextEvo.GenderEvo) {
          const genderLumi = allLumis.value.find(l => l.Id === targetId)
          if (genderLumi) {
            result.push({
              lumi: genderLumi,
              stage: 'next',
              level: nextEvo.evoLevel,
              gender: gender,
            })
            const after = findNextChain(targetId, visited)
            result.push(...after)
          }
        }
      }
    }

    return result
  }

  const prevChain = findPrevChain(currentId)
  chain.push(...prevChain)

  chain.push({
    lumi: lumi.value,
    stage: 'current',
  })

  const nextChain = findNextChain(currentId)
  chain.push(...nextChain)

  return chain
})

// 进化链数据（用于判断是线性还是多分支）
const evolutionChainData = computed(() => {
  if (!lumi.value) {
    return { prev: [], next: [], linearChain: [], totalBranches: 0 }
  }

  const prev = fullEvolutionChain.value.filter(item => item.stage === 'prev')
  const next = fullEvolutionChain.value.filter(item => item.stage === 'next')
  const current = { lumi: lumi.value, stage: 'current' }

  // 计算分支数（只计算直接相邻的，过滤掉 EvoType === 3）
  const directPrev = evolutions.value.filter(e => e.EvoType !== 3 && e.evoLumiID === lumi.value.Id).length +
    evolutions.value.filter(e => e.EvoType !== 3 && e.GenderEvo && e.GenderEvo.some(g => g[1] === lumi.value.Id)).length
  const directNext = evolutions.value.filter(e => e.EvoType !== 3 && e.Lumi === lumi.value.Id).length

  const totalBranches = Math.max(directPrev, directNext)

  // 线性链（简单情况）
  const linearChain = totalBranches <= 1 ? fullEvolutionChain.value : []

  return {
    prev,
    next,
    linearChain,
    totalBranches
  }
})

// 固有技能
const inherentSkill = computed(() => {
  if (!lumi.value || !lumi.value.ActiveSkill) return null
  const s = activeSkills.value.find(x => x.Id === lumi.value.ActiveSkill)
  if (!s) return null
  return {
    id: s.Id,
    name: getSkillName(s.Id),
    icon: s.icon,
    des: getSkillDes(s.Id),
    type: getSkillType(s.Id),
    cost: getSkillCost(s.Id),
    power: getSkillPowerSum(s.Id)
  }
})

// 技能池（合并1/2/3，不区分）
const skillPoolList = computed(() => {
  if (!lumi.value) return []
  const ids = [
    ...(lumi.value.SkillPool1 || []),
    ...(lumi.value.SkillPool2 || []),
    ...(lumi.value.SkillPool3 || []),
  ]
  return ids.map(id => ({
    id,
    name: getSkillName(id),
    icon: getSkillIcon(id),
    des: getSkillDes(id),
    type: getSkillType(id),
    cost: getSkillCost(id),
    power: getSkillPowerSum(id)
  }))
})

// 普攻详情
const normalAttack = computed(() => {
  if (!lumi.value || !lumi.value.NormalAttack) return null
  const s = activeSkills.value.find(x => x.Id === lumi.value.NormalAttack)
  if (!s) return null
  return {
    id: s.Id,
    name: getSkillName(s.Id),
    icon: s.icon,
    des: getSkillDes(s.Id),
    attackInterval: s.AttackInterval,
    addEnergy: s.AddEnergy,
    skillPowerList: s.SkillPowerList,
  }
})

// 全局属性最大值（用于进度条显示）
const globalMaxStats = computed(() => {
  if (!allLumis.value || allLumis.value.length === 0) {
    return { HP: 150, 攻击: 150, 防御: 150, 工作: 150 }
  }
  let maxHP = 0, maxAtk = 0, maxDef = 0, maxWork = 0
  for (const lumi of allLumis.value) {
    maxHP = Math.max(maxHP, lumi.MaxHpState || 0)
    maxAtk = Math.max(maxAtk, lumi.MaxAtkState || 0)
    maxDef = Math.max(maxDef, lumi.MaxDefState || 0)
    maxWork = Math.max(maxWork, lumi.MaxWorkState || 0)
  }
  return { HP: maxHP, 攻击: maxAtk, 防御: maxDef, 工作: maxWork }
})

// 基础属性值
const stats = computed(() => {
  if (!lumi.value) return {}
  return {
    HP: { min: lumi.value.MinHpState, max: lumi.value.MaxHpState },
    攻击: { min: lumi.value.MinAtkState, max: lumi.value.MaxAtkState },
    防御: { min: lumi.value.MinDefState, max: lumi.value.MaxDefState },
    工作: { min: lumi.value.MinWorkState, max: lumi.value.MaxWorkState },
  }
})

// 性别比例
const genderRatio = computed(() => {
  if (!lumi.value || !lumi.value.GenderWeight || !lumi.value.GenderWeight.length) {
    return null
  }

  const weights = lumi.value.GenderWeight
  const total = weights.reduce((sum, item) => sum + item[1], 0)

  if (total === 0) return null

  const result = []
  const genderMap = { 1: '♂ 雄性', 2: '♀ 雌性', 3: '无性别' }

  for (const [type, weight] of weights) {
    if (weight > 0) {
      const percent = Math.round((weight / total) * 100)
      result.push({ name: genderMap[type] || type, percent })
    }
  }

  return result.length > 0 ? result : null
})

// 身高体重（LumiAttribute: [[1,[h_min,h_max]], [2,[w_min,w_max]]]）
const lumiAttribute = computed(() => {
  if (!lumi.value?.LumiAttribute?.length) return null
  const result = {}
  for (const [type, range] of lumi.value.LumiAttribute) {
    if (type === 1) result.height = range
    else if (type === 2) result.weight = range
  }
  return (result.height || result.weight) ? result : null
})

// 初见内容
const firstMeet = computed(() => {
  if (!lumi.value || !avgData.value || !avgData.value.length) {
    return null
  }
  // 查找匹配的 Avg 条目
  const avgList = avgData.value.filter(a => a.CharacterID === lumi.value.Id)
  if (!avgList || avgList.length === 0) {
    return null
  }
  // 获取第一个有内容的条目的 Content
  for (const avg of avgList) {
    if (avg.Content && avg.Content.length > 0) {
      // Content 是数组，包含多语言 key，返回第一个 key
      return avg.Content[0]
    }
  }
  return null
})

// 当前噜咪的扩展数据
const currentExtra = computed(() => {
  if (!lumi.value || !extraData.value) {
    return null
  }
  return extraData.value[lumi.value.Id] || null
})

// 获取金色基础价格
const goldPrice = computed(() => {
  if (!lumi.value || !marketPrices.value.length) {
    return null
  }
  const priceData = marketPrices.value.find(p => p.id === lumi.value.Id)
  return priceData?.priceDefault ?? null
})

// 属性类型键名（用于查找克制关系）
const TYPE_KEYS = [
  'Neutral', 'Water', 'Fire', 'Grass', 'Lighting', 'Earth',
  'Fly', 'Ice', 'Dragon', 'Bright', 'Dark', 'Fight', 'Psychic',
  'Fairy', 'Steel', 'King', 'God',
]

// 计算被各属性攻击时的伤害效果
const weaknesses = computed(() => {
  if (!lumi.value || !typeCounters.value.length) return []

  const results = []

  // 遍历所有攻击属性
  for (let atkType = 1; atkType <= 17; atkType++) {
    const atkData = typeCounters.value.find(t => t.LumiType === atkType)
    if (!atkData) continue

    // 计算对该噜咪的伤害倍率
    let multiplier = 10000

    // 对第一个属性的效果
    if (lumi.value.Type1) {
      const defKey1 = TYPE_KEYS[lumi.value.Type1 - 1]
      if (defKey1 && atkData[defKey1] !== undefined) {
        multiplier = (multiplier * atkData[defKey1]) / 10000
      }
    }

    // 对第二个属性的效果（如果有）
    if (lumi.value.Type2) {
      const defKey2 = TYPE_KEYS[lumi.value.Type2 - 1]
      if (defKey2 && atkData[defKey2] !== undefined) {
        multiplier = (multiplier * atkData[defKey2]) / 10000
      }
    }

    // 判断效果等级并返回箭头
    let effect = ''
    let effectClass = ''

    if (multiplier === 0) {
      effect = '0'
      effectClass = 'immune'
    } else if (multiplier < 5000) {
      effect = '↓↓'
      effectClass = 'double-weak'
    } else if (multiplier < 10000) {
      effect = '↓'
      effectClass = 'weak'
    } else if (multiplier === 10000) {
      effect = ''
      effectClass = 'normal'
    } else if (multiplier <= 20000) {
      effect = '↑'
      effectClass = 'strong'
    } else {
      effect = '↑↑'
      effectClass = 'double-strong'
    }

    results.push({
      typeId: atkType,
      typeName: TYPE_NAMES[atkType] || `属性${atkType}`,
      typeColor: TYPE_COLORS[atkType] || '#666',
      effect,
      effectClass,
    })
  }

  return results
})
</script>

<template>
  <div v-if="loading" class="loading">加载中...</div>
  <div v-else-if="!lumi" class="empty">未找到该噜咪</div>
  <div v-else>
    <div class="detail-nav">
      <router-link to="/lumi" class="back-btn">← 返回图鉴</router-link>
      <div class="nav-buttons">
        <button class="nav-btn" :disabled="!prevLumi" @click="goPrev">← 上一只</button>
        <button class="nav-btn" :disabled="!nextLumi" @click="goNext">下一只 →</button>
      </div>
    </div>

    <!-- 头部信息 -->
    <div class="detail-header">
      <div class="detail-icon">
        <img
          v-if="lumi.CA"
          :src="`/images/avatars/${lumi.CA}.png`"
          :alt="getName(lumi.Name)"
          class="detail-avatar-img"
        />
        <span v-else>🐾</span>
      </div>
      <div class="detail-info">
        <div class="detail-id">#{{ lumi.PokedexId }}</div>
        <h1 class="detail-name">{{ getName(lumi.Name) }}</h1>
        <div class="detail-types">
          <span class="type-tag" :style="{ background: TYPE_COLORS[lumi.Type1] }">
            {{ getTypeName(lumi.Type1) }}
          </span>
          <span v-if="lumi.Type2" class="type-tag" :style="{ background: TYPE_COLORS[lumi.Type2] }">
            {{ getTypeName(lumi.Type2) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 基础信息 -->
    <div class="section">
      <h2>基础信息</h2>
      <div class="info-grid">
        <div class="info-item">
          <div class="label">模型</div>
          <div class="value">{{ lumi.Model }}</div>
        </div>
        <div class="info-item">
          <div class="label">评分范围</div>
          <div class="value">{{ lumi.MinScore }} ~ {{ lumi.MaxScore }}</div>
        </div>
        <div class="info-item">
          <div class="label">金色基础价格</div>
          <div class="value">{{ goldPrice !== null ? goldPrice : '--' }}</div>
        </div>
        <div class="info-item">
          <div class="label">赛季</div>
          <div class="value">{{ LUMI_TAG_NAMES[lumi.LumiTag] || '-' }}</div>
        </div>
        <div class="info-item">
          <div class="label">个体类型</div>
          <div class="value">
            <span v-if="lumi.CardBack" :style="{ color: LUMI_CARD_TYPE_COLORS[lumi.CardBack] || '#ff9800', fontWeight: 600 }">
              ⭐ {{ LUMI_CARD_TYPE[lumi.CardBack] || '特殊个体' }}
            </span>
            <span v-else style="color: var(--text-dim)">普通</span>
          </div>
        </div>
        <div class="info-item">
          <div class="label">性别比例</div>
          <div class="value">
            <template v-if="genderRatio">
              <span v-for="(g, i) in genderRatio" :key="i" class="gender-tag">
                {{ g.name }} {{ g.percent }}%
              </span>
            </template>
            <span v-else>-</span>
          </div>
        </div>
        <div class="info-item" v-if="lumiAttribute">
          <div class="label">身高体重</div>
          <div class="value">
            <div v-if="lumiAttribute.height">身高 {{ lumiAttribute.height[0] }}~{{ lumiAttribute.height[1] }} cm</div>
            <div v-if="lumiAttribute.weight">体重 {{ lumiAttribute.weight[0] }}~{{ lumiAttribute.weight[1] }} kg</div>
          </div>
        </div>
        <div class="info-item">
          <div class="label">工作能力</div>
          <div class="value">
            <template v-if="lumi.WorkAbility && lumi.WorkAbility.length">
              <span v-for="(w, i) in lumi.WorkAbility" :key="i" class="work-tag">
                {{ WORK_TYPE_NAMES[w.Type] || w.Type }}
              </span>
            </template>
            <span v-else>无</span>
          </div>
        </div>
        <div class="info-item" v-if="currentExtra?.bodyType">
          <div class="label">体型</div>
          <div class="value">{{ currentExtra.bodyType }}</div>
        </div>
        <div class="info-item" v-if="currentExtra?.activeMap">
          <div class="label">活动地图</div>
          <div class="value">{{ currentExtra.activeMap }}</div>
        </div>
      </div>
    </div>

    <!-- 关键特质 -->
    <div class="section" v-if="currentExtra?.keyTraits">
      <h2>关键特质</h2>
      <div class="story-content">{{ currentExtra.keyTraits }}</div>
    </div>

    <!-- 行为习惯 -->
    <div class="section" v-if="currentExtra?.behavior">
      <h2>行为习惯</h2>
      <div class="story-content">{{ currentExtra.behavior }}</div>
    </div>

    <!-- 初见 -->
    <div class="section" v-if="firstMeet">
      <h2>初见</h2>
      <div class="story-content">{{ getFirstMeetText(firstMeet) }}</div>
    </div>

    <!-- 故事 -->
    <div class="section" v-if="hasValidContent(lumi.Story)">
      <h2>故事</h2>
      <div class="story-content">{{ getName(lumi.Story) }}</div>
    </div>

    <!-- 属性克制 -->
    <div class="section" v-if="weaknesses.length">
      <h2>属性克制</h2>
      <p class="section-desc">被各属性攻击时的伤害效果</p>
      <div class="weakness-grid">
        <div
          v-for="w in weaknesses"
          :key="w.typeId"
          class="weakness-item"
          :class="w.effectClass"
        >
          <span class="weakness-type" :style="{ background: w.typeColor }">
            {{ w.typeName }}
          </span>
          <span class="weakness-effect">{{ w.effect }}</span>
        </div>
      </div>
    </div>

    <!-- 属性值 -->
    <div class="section">
      <h2>属性值</h2>
      <div class="stat-bars">
        <div v-for="(val, key) in stats" :key="key" class="stat-row">
          <span class="stat-label">{{ key }}</span>
          <div class="stat-bar-track">
            <div class="stat-bar-fill" :style="{ width: (val.max / globalMaxStats[key] * 100) + '%' }"></div>
          </div>
          <span class="stat-value">{{ val.min }} ~ {{ val.max }}</span>
        </div>
      </div>
    </div>

    <!-- 特性（战斗被动或家园被动） -->
    <div class="section" v-if="lumi.BattlePassive || lumi.HomePassive">
      <h2>特性</h2>
      <div class="skill-item" v-if="lumi.BattlePassive">
        <span class="skill-type-badge battle">战斗被动</span>
        <div class="skill-info">
          <span class="skill-name">{{ getPassiveName(lumi.BattlePassive) }}</span>
          <span class="skill-des" v-if="getPassiveDes(lumi.BattlePassive)" v-html="getPassiveDes(lumi.BattlePassive)"></span>
        </div>
        <span class="skill-id">ID: {{ lumi.BattlePassive }}</span>
      </div>
      <div class="skill-item" v-if="lumi.HomePassive">
        <span class="skill-type-badge home">家园被动</span>
        <div class="skill-info">
          <span class="skill-name">{{ getPassiveName(lumi.HomePassive) }}</span>
          <span class="skill-des" v-if="getPassiveDes(lumi.HomePassive)" v-html="getPassiveDes(lumi.HomePassive)"></span>
        </div>
        <span class="skill-id">ID: {{ lumi.HomePassive }}</span>
      </div>
    </div>

    <!-- 普攻 -->
    <div class="section" v-if="normalAttack">
      <h2>普攻</h2>
      <div class="skill-item na-item">
        <img
          v-if="normalAttack.icon"
          :src="`/images/skills/${normalAttack.icon}.png`"
          class="skill-icon-img"
          @error="($event.target).style.display='none'"
        />
        <div class="skill-info">
          <span class="skill-name">{{ normalAttack.name }}</span>
          <span class="skill-des" v-if="normalAttack.des" v-html="normalAttack.des"></span>
        </div>
        <div class="na-stats">
          <div class="na-stat">
            <span class="na-label">攻击间隔</span>
            <span class="na-val">{{ (normalAttack.attackInterval / 1000).toFixed(1) }}s</span>
          </div>
          <div class="na-stat">
            <span class="na-label">回能</span>
            <span class="na-val">{{ (normalAttack.addEnergy / 10).toFixed(1) }}</span>
          </div>
          <div class="na-stat">
            <span class="na-label">技能威力</span>
            <span class="na-val">{{ normalAttack.skillPowerList.join(' / ') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 专属技能 -->
    <div class="section" v-if="inherentSkill">
      <h2>专属技能</h2>
      <div class="skill-item">
        <img
          v-if="inherentSkill.icon"
          :src="`/images/skills/${inherentSkill.icon}.png`"
          class="skill-icon-img"
          @error="($event.target).style.display='none'"
        />
        <div class="skill-info">
          <span class="skill-name">{{ inherentSkill.name }}</span>
          <span class="skill-des" v-if="inherentSkill.des" v-html="inherentSkill.des"></span>
        </div>
        <div class="skill-stats">
          <span v-if="inherentSkill.type" class="type-tag" :style="{ background: TYPE_COLORS[inherentSkill.type] || '#666' }">
            {{ TYPE_NAMES[inherentSkill.type] || '未知' }}
          </span>
          <span v-if="inherentSkill.cost !== null" class="skill-stat-tag">
            消耗: {{ inherentSkill.cost }}
          </span>
          <span v-if="inherentSkill.power !== '-'" class="skill-stat-tag">
            威力: {{ inherentSkill.power }}
          </span>
        </div>
        <span class="skill-id">ID: {{ inherentSkill.id }}</span>
      </div>
    </div>

    <!-- 技能池 -->
    <div class="section" v-if="skillPoolList.length">
      <h2>技能池</h2>
      <div class="skill-list">
        <div v-for="sk in skillPoolList" :key="sk.id" class="skill-item">
          <img
            v-if="sk.icon"
            :src="`/images/skills/${sk.icon}.png`"
            class="skill-icon-img"
            @error="($event.target).style.display='none'"
          />
          <div class="skill-info">
            <span class="skill-name">{{ sk.name }}</span>
            <span class="skill-des" v-if="sk.des" v-html="sk.des"></span>
          </div>
          <div class="skill-stats">
            <span v-if="sk.type" class="type-tag" :style="{ background: TYPE_COLORS[sk.type] || '#666' }">
              {{ TYPE_NAMES[sk.type] || '未知' }}
            </span>
            <span v-if="sk.cost !== null" class="skill-stat-tag">
              消耗: {{ sk.cost }}
            </span>
            <span v-if="sk.power !== '-'" class="skill-stat-tag">
              威力: {{ sk.power }}
            </span>
          </div>
          <span class="skill-id">ID: {{ sk.id }}</span>
        </div>
      </div>
    </div>

    <!-- 进化链 -->
    <div class="section" v-if="evolutionChainData.prev.length || evolutionChainData.next.length">
      <h2>进化链</h2>

      <!-- 简单线性进化链 -->
      <div v-if="evolutionChainData.totalBranches <= 1" class="evo-chain-linear">
        <template v-for="(item, index) in evolutionChainData.linearChain" :key="item.lumi.Id">
          <div v-if="index > 0" class="evo-arrow">→</div>
          <component
            :is="item.stage === 'current' ? 'div' : 'router-link'"
            :to="item.stage !== 'current' ? `/lumi/${item.lumi.Id}` : null"
            class="evo-chain-item"
            :class="{ 'current': item.stage === 'current' }"
          >
            <div class="evo-chain-card">
              <img
                v-if="item.lumi.CA"
                :src="`/images/avatars/${item.lumi.CA}.png`"
                :alt="getLumiName(item.lumi.Id)"
                class="evo-chain-img"
                @error="($event.target).style.display='none'"
              />
              <div class="evo-chain-info">
                <div class="evo-chain-name">{{ getLumiName(item.lumi.Id) }}</div>
                <div class="evo-chain-id">#{{ item.lumi.PokedexId }}</div>
                <div v-if="item.stage !== 'current'" class="evo-chain-req">
                  <span v-if="item.gender" class="evo-gender-badge">
                    {{ item.gender === 1 ? '♂' : '♀' }}
                  </span>
                  <span class="evo-level-badge">Lv.{{ item.level }}</span>
                </div>
                <div v-if="item.stage === 'current'" class="evo-current-badge">当前</div>
              </div>
            </div>
          </component>
        </template>
      </div>

      <!-- 多分支进化链 -->
      <div v-else class="evo-chain-branch">
        <!-- 前置进化 -->
        <div v-if="evolutionChainData.prev.length" class="evo-branch-section evo-prev">
          <div class="evo-branch-label">前置进化</div>
          <div class="evo-branch-items">
            <component
              v-for="item in evolutionChainData.prev"
              :key="item.lumi.Id"
              :is="'router-link'"
              :to="`/lumi/${item.lumi.Id}`"
              class="evo-chain-item"
            >
              <div class="evo-chain-card">
                <img
                  v-if="item.lumi.CA"
                  :src="`/images/avatars/${item.lumi.CA}.png`"
                  :alt="getLumiName(item.lumi.Id)"
                  class="evo-chain-img"
                  @error="($event.target).style.display='none'"
                />
                <div class="evo-chain-info">
                  <div class="evo-chain-name">{{ getLumiName(item.lumi.Id) }}</div>
                  <div class="evo-chain-id">#{{ item.lumi.PokedexId }}</div>
                  <div class="evo-chain-req">
                    <span v-if="item.gender" class="evo-gender-badge">
                      {{ item.gender === 1 ? '♂' : '♀' }}
                    </span>
                    <span class="evo-level-badge">Lv.{{ item.level }}</span>
                  </div>
                </div>
              </div>
              <div class="evo-arrow-down">↓</div>
            </component>
          </div>
        </div>

        <!-- 当前噜咪 -->
        <div class="evo-current-wrapper">
          <div class="evo-current-card">
            <img
              v-if="lumi.CA"
              :src="`/images/avatars/${lumi.CA}.png`"
              :alt="getLumiName(lumi.Id)"
              class="evo-chain-img"
              @error="($event.target).style.display='none'"
            />
            <div class="evo-chain-info">
              <div class="evo-chain-name">{{ getLumiName(lumi.Id) }}</div>
              <div class="evo-chain-id">#{{ lumi.PokedexId }}</div>
              <div class="evo-current-badge">当前</div>
            </div>
          </div>
        </div>

        <!-- 后续进化 -->
        <div v-if="evolutionChainData.next.length" class="evo-branch-section evo-next">
          <div class="evo-branch-label">后续进化 ({{ evolutionChainData.next.length }}种)</div>
          <div class="evo-branch-items">
            <component
              v-for="item in evolutionChainData.next"
              :key="item.lumi.Id"
              :is="'router-link'"
              :to="`/lumi/${item.lumi.Id}`"
              class="evo-chain-item"
            >
              <div class="evo-arrow-up">↑</div>
              <div class="evo-chain-card">
                <img
                  v-if="item.lumi.CA"
                  :src="`/images/avatars/${item.lumi.CA}.png`"
                  :alt="getLumiName(item.lumi.Id)"
                  class="evo-chain-img"
                  @error="($event.target).style.display='none'"
                />
                <div class="evo-chain-info">
                  <div class="evo-chain-name">{{ getLumiName(item.lumi.Id) }}</div>
                  <div class="evo-chain-id">#{{ item.lumi.PokedexId }}</div>
                  <div class="evo-chain-req">
                    <span v-if="item.gender" class="evo-gender-badge">
                      {{ item.gender === 1 ? '♂' : '♀' }}
                    </span>
                    <span class="evo-level-badge">Lv.{{ item.level }}</span>
                  </div>
                </div>
              </div>
            </component>
          </div>
        </div>
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
.detail-header {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 32px;
  padding: 24px;
  background: var(--bg-card);
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.detail-icon {
  font-size: 4em;
  flex-shrink: 0;
}
.detail-avatar-img {
  width: 180px;
  height: 240px;
  object-fit: contain;
}
.detail-id {
  color: var(--text-dim);
  font-size: 0.9em;
}
.detail-name {
  color: #fff;
  font-size: 1.8em;
  margin: 4px 0;
}
.detail-types {
  display: flex;
  align-items: center;
  gap: 8px;
}
.section {
  margin-bottom: 28px;
}
.section h2 {
  color: #fff;
  font-size: 1.2em;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.story-content {
  color: var(--text-dim);
  line-height: 1.8;
  font-size: 0.95em;
  white-space: pre-wrap;
  background: rgba(255, 255, 255, 0.03);
  padding: 16px;
  border-radius: 8px;
  border-left: 3px solid var(--accent);
}
/* 属性条 */
.stat-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.stat-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stat-label {
  width: 50px;
  text-align: right;
  color: var(--text-dim);
  font-size: 0.9em;
}
.stat-bar-track {
  flex: 1;
  height: 22px;
  background: var(--bg-card);
  border-radius: 11px;
  overflow: hidden;
}
.stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-light));
  border-radius: 11px;
}
.stat-value {
  width: 100px;
  color: var(--text-dim);
  font-size: 0.85em;
}
/* 技能 */
.skill-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.skill-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-card);
  border-radius: 8px;
}
.skill-icon-img {
  width: 36px;
  height: 36px;
  object-fit: contain;
  image-rendering: pixelated;
  flex-shrink: 0;
}
.skill-type-badge.battle {
  background: #e94560;
}
.skill-type-badge.home {
  background: #4caf50;
}
.skill-type-badge {
  background: var(--accent);
  color: #fff;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 0.8em;
}
.skill-name {
  flex: 1;
  font-weight: 600;
}
.skill-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.skill-des {
  font-size: 0.85em;
  color: var(--text-dim);
  line-height: 1.4;
}
.skill-id {
  color: var(--text-dim);
  font-size: 0.85em;
}
.skill-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.type-tag {
  color: #fff;
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 0.8em;
  font-weight: 600;
}
.skill-stat-tag {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-dim);
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 0.8em;
}
/* 普攻详情 */
.na-item {
  flex-wrap: wrap;
}
.na-stats {
  display: flex;
  gap: 20px;
  width: 100%;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.na-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.na-label {
  font-size: 0.8em;
  color: var(--text-dim);
}
.na-val {
  font-weight: 600;
  color: #fff;
}
.work-tag {
  display: inline-block;
  background: rgba(233, 69, 96, 0.15);
  color: var(--accent-light);
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 0.85em;
  margin: 2px 4px 2px 0;
}
.gender-tag {
  display: inline-block;
  background: rgba(103, 126, 234, 0.15);
  color: #9faf;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 0.85em;
  margin: 2px 4px 2px 0;
}
/* 进化链 */
.evo-chain {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  justify-content: center;
}
.evo-chain-item {
  text-decoration: none;
  transition: transform 0.2s;
  display: inline-block;
}
.evo-chain-item:not(.current):hover {
  transform: scale(1.05);
}
.evo-chain-item.current {
  cursor: default;
}
.evo-chain-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-card);
  border-radius: 10px;
  border: 2px solid var(--border);
  transition: all 0.2s;
}
.evo-chain-item:not(.current):hover .evo-chain-card {
  border-color: var(--accent-light);
}
.evo-chain-item.current .evo-chain-card {
  border-color: var(--accent);
  background: linear-gradient(135deg, var(--bg-card), rgba(233, 69, 96, 0.15));
}
.evo-chain-img {
  width: 50px;
  height: 67px;
  object-fit: contain;
  flex-shrink: 0;
  pointer-events: none;
}
.evo-chain-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  pointer-events: none;
}
.evo-chain-name {
  color: var(--text);
  font-weight: 600;
  font-size: 0.9em;
}
.evo-chain-id {
  color: var(--text-dim);
  font-size: 0.75em;
}
.evo-chain-req {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}
.evo-gender-badge {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.7em;
  background: #ff69b4;
  color: white;
}
.evo-level-badge {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.7em;
  background: var(--accent);
  color: white;
}
.evo-current-badge {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.7em;
  background: var(--accent);
  color: white;
  align-self: flex-start;
}
.evo-arrow {
  font-size: 1.3em;
  color: var(--text-dim);
  font-weight: bold;
}

/* 多分支进化链 */
.evo-chain-linear {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.evo-chain-branch {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
}

.evo-branch-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.evo-branch-label {
  font-size: 0.85em;
  color: var(--text-dim);
  margin-bottom: 12px;
  text-align: center;
}

.evo-branch-items {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  max-width: 800px;
}

.evo-current-wrapper {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.evo-current-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: linear-gradient(135deg, var(--bg-card), rgba(233, 69, 96, 0.15));
  border: 3px solid var(--accent);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(233, 69, 96, 0.3);
}

.evo-arrow-up,
.evo-arrow-down {
  text-align: center;
  font-size: 1.5em;
  color: var(--accent);
  font-weight: bold;
  margin: 4px 0;
}

.evo-prev .evo-arrow-down {
  color: var(--text-dim);
}

.evo-next .evo-arrow-up {
  color: var(--accent);
}
/* 属性克制 */
.section-desc {
  color: var(--text-dim);
  font-size: 0.9em;
  margin-bottom: 12px;
}
.weakness-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
}
.weakness-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: transform 0.2s;
}
.weakness-item:hover {
  transform: translateY(-2px);
}
.weakness-type {
  color: #fff;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: 600;
}
.weakness-effect {
  font-size: 1.8em;
  font-weight: 700;
}
.weakness-item.double-strong .weakness-effect {
  color: #c62828;
}
.weakness-item.strong .weakness-effect {
  color: #e57373;
}
.weakness-item.normal .weakness-effect {
  color: var(--text-dim);
}
.weakness-item.weak .weakness-effect {
  color: #66bb6a;
}
.weakness-item.double-weak .weakness-effect {
  color: #1b5e20;
}
.weakness-item.immune .weakness-effect {
  color: #666;
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
@media (max-width: 640px) {
  .detail-header { flex-direction: column; text-align: center; }
  .detail-types { justify-content: center; }
  .weakness-grid { grid-template-columns: repeat(auto-fill, minmax(85px, 1fr)); }
}
/* 详情页导航条（返回 + 上一只/下一只） */
.detail-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.nav-buttons {
  display: flex;
  gap: 8px;
}
.nav-btn {
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.2s;
}
.nav-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
