<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { loadData, TYPE_NAMES, TYPE_COLORS } from '../data'
import LumiSelector from '../components/LumiSelector.vue'

// 主要数据
const allLumis = ref([])
const allSkills = ref([])
const locMap = ref({})
const typeCounters = ref([])
const loading = ref(true)

// 左侧设置
const leftLumi = ref(null)
const leftLevel = ref(50)
const leftBreakLevel = ref(5)
const leftSkill = ref(null)
const leftAtkBuff = ref(0)
const leftDefBuff = ref(0)
const leftBonusCoeffs = ref([]) // 增伤系数
const leftReductionCoeffs = ref([]) // 减伤系数

// 右侧设置
const rightLumi = ref(null)
const rightLevel = ref(50)
const rightBreakLevel = ref(5)
const rightSkill = ref(null)
const rightAtkBuff = ref(0)
const rightDefBuff = ref(0)
const rightBonusCoeffs = ref([]) // 增伤系数
const rightReductionCoeffs = ref([]) // 减伤系数

// 计算结果
const showResults = ref(false)
const calculationResults = ref({
  leftToRight: { normalAttack: 0, skill: 0 },
  rightToLeft: { normalAttack: 0, skill: 0 },
  calculationLog: []
})

// 左侧可用技能列表
const leftSkills = computed(() => {
  if (!leftLumi.value) return []
  const lumi = leftLumi.value
  const skills = []

  if (lumi.ActiveSkill) {
    const skill = allSkills.value.find(s => s.Id === lumi.ActiveSkill)
    if (skill) {
      skill.category = 'exclusive'
      skills.push(skill)
    }
  }

  const skillPoolIds = [
    ...(lumi.SkillPool1 || []),
    ...(lumi.SkillPool2 || []),
    ...(lumi.SkillPool3 || [])
  ]

  for (const id of skillPoolIds) {
    const skill = allSkills.value.find(s => s.Id === id)
    if (skill) {
      skill.category = 'pool'
      skills.push(skill)
    }
  }

  return skills
})

// 右侧可用技能列表
const rightSkills = computed(() => {
  if (!rightLumi.value) return []
  const lumi = rightLumi.value
  const skills = []

  if (lumi.ActiveSkill) {
    const skill = allSkills.value.find(s => s.Id === lumi.ActiveSkill)
    if (skill) {
      skill.category = 'exclusive'
      skills.push(skill)
    }
  }

  const skillPoolIds = [
    ...(lumi.SkillPool1 || []),
    ...(lumi.SkillPool2 || []),
    ...(lumi.SkillPool3 || [])
  ]

  for (const id of skillPoolIds) {
    const skill = allSkills.value.find(s => s.Id === id)
    if (skill) {
      skill.category = 'pool'
      skills.push(skill)
    }
  }

  return skills
})

// 是否可以计算
const canCalculate = computed(() => {
  return leftLumi.value && rightLumi.value
})

// 获取 Lumi 显示名称
const getLumiName = (lumi) => {
  if (!lumi) return '-'
  return locMap.value[lumi.Name] || `噜咪 #${lumi.Id}`
}

// 获取技能名称
const getSkillName = (skill) => {
  if (!skill) return '-'
  return locMap.value[skill.name] || skill.name || `技能#${skill.Id}`
}

// 数据加载
onMounted(async () => {
  const [lumis, skills, loc, counters] = await Promise.all([
    loadData('Lumi'),
    loadData('ActiveSkill'),
    loadData('localization'),
    loadData('LumiTypeCounter')
  ])
  allLumis.value = lumis
  allSkills.value = skills
  locMap.value = loc
  typeCounters.value = counters
  loading.value = false
})

// 设置左侧 Lumi 的函数（自动选择专属技能）
function setLeftLumi(lumi) {
  leftLumi.value = lumi
  if (lumi && lumi.ActiveSkill && allSkills.value.length > 0) {
    const skill = allSkills.value.find(s => s.Id === lumi.ActiveSkill)
    if (skill) {
      leftSkill.value = skill
    } else {
      leftSkill.value = null
    }
  } else {
    leftSkill.value = null
  }
}

// 设置右侧 Lumi 的函数（自动选择专属技能）
function setRightLumi(lumi) {
  rightLumi.value = lumi
  if (lumi && lumi.ActiveSkill && allSkills.value.length > 0) {
    const skill = allSkills.value.find(s => s.Id === lumi.ActiveSkill)
    if (skill) {
      rightSkill.value = skill
    } else {
      rightSkill.value = null
    }
  } else {
    rightSkill.value = null
  }
}

// 计算实际战斗资质
function calcBattleStats(lumi, level, breakLevel) {
  if (!lumi) return { hp: 0, atk: 0, def: 0 }

  const power = Math.pow(1.1, breakLevel)
  const base = 4 * (level + 10) * power

  const hp = Math.floor(lumi.MaxHpState * base / 5)
  const atk = Math.floor(lumi.MaxAtkState * base / 50)
  const def = Math.floor(lumi.MaxDefState * base / 50)

  return { hp, atk, def }
}

// 左侧实际战斗资质
const leftBattleStats = computed(() => {
  return calcBattleStats(leftLumi.value, leftLevel.value, leftBreakLevel.value)
})

// 右侧实际战斗资质
const rightBattleStats = computed(() => {
  return calcBattleStats(rightLumi.value, rightLevel.value, rightBreakLevel.value)
})

// 获取技能威力总和
function getSkillPower(skill) {
  if (!skill || !skill.SkillPowerList || !skill.SkillPowerList.length) return 100
  return skill.SkillPowerList.reduce((a, b) => a + b, 0)
}

// 替换技能描述中的占位符
function formatSkillDes(skill) {
  if (!skill || !skill.Des) return ''
  let text = locMap.value[skill.Des] || ''

  // 替换 [xxx] 格式的多语言引用
  text = text.replace(/\[([^\]]+)\]/g, (match, key) => {
    return locMap.value[key] || key
  })

  // 替换 {0}, {1} 等参数
  if (skill.DesParam && skill.DesParam.length) {
    text = text.replace(/\{(\d+)\}/g, (match, index) => {
      const paramIndex = parseInt(index)
      return skill.DesParam[paramIndex] !== undefined ? skill.DesParam[paramIndex] : match
    })
  }

  // 移除剩余的标签
  text = text.replace(/<[^>]+>/gi, '')

  return text
}

// 左侧选中技能详情
const leftSkillInfo = computed(() => {
  if (!leftSkill.value) return null
  const skill = leftSkill.value
  return {
    cost: Math.floor(skill.SkillCost / 10),
    des: formatSkillDes(skill),
    power: getSkillPower(skill)
  }
})

// 右侧选中技能详情
const rightSkillInfo = computed(() => {
  if (!rightSkill.value) return null
  const skill = rightSkill.value
  return {
    cost: Math.floor(skill.SkillCost / 10),
    des: formatSkillDes(skill),
    power: getSkillPower(skill)
  }
})

// 获取普攻信息
function getNormalAttackInfo(lumi) {
  if (!lumi || !lumi.NormalAttack) return null
  const normalAttack = allSkills.value.find(s => s.Id === lumi.NormalAttack)
  if (!normalAttack) return null
  return {
    power: getSkillPower(normalAttack),
    energy: (normalAttack.AddEnergy || 0) / 10,
    interval: (normalAttack.AttackInterval || 0) / 1000 // 转换为秒
  }
}

// 左侧普攻信息
const leftNormalAttackInfo = computed(() => {
  return getNormalAttackInfo(leftLumi.value)
})

// 右侧普攻信息
const rightNormalAttackInfo = computed(() => {
  return getNormalAttackInfo(rightLumi.value)
})

// F(Lv) 函数
function calcF(level, breakLevel) {
  return 400 * ((level + 10) * Math.pow(1.1, breakLevel)) / 1875
}

// 属性一致加成
function calcTypeBonus(atkType, defType1, defType2) {
  if (atkType === defType1 || atkType === defType2) return 1.25
  return 1
}

// 属性克制系数
function calcTypeCounter(atkType, defType1, defType2, counters) {
  // 查找攻击属性的数据
  const atkData = counters.find(t => t.LumiType === atkType)
  if (!atkData) return 1

  // 属性键名映射
  const TYPE_KEYS = [
    'Neutral', 'Water', 'Fire', 'Grass', 'Lighting', 'Earth',
    'Fly', 'Ice', 'Dragon', 'Bright', 'Dark', 'Fight', 'Psychic',
    'Fairy', 'Steel', 'King', 'God'
  ]

  // 计算克制倍率
  let multiplier = 10000

  // 对第一个属性的效果
  if (defType1) {
    const defKey1 = TYPE_KEYS[defType1 - 1]
    if (defKey1 && atkData[defKey1] !== undefined) {
      multiplier = (multiplier * atkData[defKey1]) / 10000
    }
  }

  // 对第二个属性的效果（如果有）
  if (defType2) {
    const defKey2 = TYPE_KEYS[defType2 - 1]
    if (defKey2 && atkData[defKey2] !== undefined) {
      multiplier = (multiplier * atkData[defKey2]) / 10000
    }
  }

  // 转换为系数（10000 = 1.0）
  return multiplier / 10000
}

// 攻防等级加成
function calcBuffBonus(atkBuff, defBuff) {
  // 计算攻击系数：正数时分子增加，负数时分母增加
  let atkCoefficient
  if (atkBuff >= 0) {
    atkCoefficient = (5 + atkBuff) / 5
  } else {
    atkCoefficient = 5 / (5 + Math.abs(atkBuff))
  }

  // 计算防御系数：正数时分母增加（减伤），负数时分母减少（增伤）
  let defCoefficient
  if (defBuff >= 0) {
    defCoefficient = 5 / (5 + defBuff)
  } else {
    defCoefficient = (5 + Math.abs(defBuff)) / 5
  }

  return atkCoefficient * defCoefficient
}

// 应用攻防等级到属性值
function applyBuffsToStats(baseAtk, baseDef, atkBuff, defBuff) {
  // 计算应用攻防等级后的攻击和防御值
  let adjustedAtk
  if (atkBuff >= 0) {
    adjustedAtk = baseAtk * (5 + atkBuff) / 5
  } else {
    adjustedAtk = baseAtk * 5 / (5 + Math.abs(atkBuff))
  }

  let adjustedDef
  if (defBuff >= 0) {
    adjustedDef = baseDef * (5 + defBuff) / 5
  } else {
    adjustedDef = baseDef * 5 / (5 + Math.abs(defBuff))
  }

  return { adjustedAtk, adjustedDef }
}

// 单次伤害计算
function calcSingleDamage(params) {
  const { attacker, defender, skill, isCrit, bonusCoeffs, reductionCoeffs } = params

  // F(Lv)
  const fLv = calcF(attacker.level, attacker.breakLevel)

  // 先应用攻防等级到属性值
  const { adjustedAtk, adjustedDef } = applyBuffsToStats(
    attacker.atk,
    defender.def,
    attacker.atkBuff,
    defender.defBuff
  )

  // 暴击穿防：如果调整后的攻击 < 调整后的防御，则穿防（攻击 = 防御）
  let finalAtk = adjustedAtk
  if (isCrit && adjustedAtk < adjustedDef) {
    finalAtk = adjustedDef
  }

  // 攻防比（使用穿防后的攻击）
  const atkDefRatio = finalAtk / adjustedDef

  // 技能威力
  const skillPower = getSkillPower(skill)

  // 属性一致加成
  const typeBonus = calcTypeBonus(attacker.type1, defender.type1, defender.type2)

  // 属性克制系数
  const typeCounter = calcTypeCounter(attacker.type1, defender.type1, defender.type2, typeCounters.value)

  // 基础伤害
  let baseDamage = fLv * atkDefRatio * skillPower * typeBonus * typeCounter

  // 暴击倍率
  if (isCrit) {
    baseDamage = baseDamage * 1.5
  }

  // 只有技能（SkillCost > 0）才应用增减伤系数，普攻不应用
  const isSkill = skill.SkillCost > 0

  if (isSkill) {
    // 应用增伤系数（多个乘算）
    if (bonusCoeffs && bonusCoeffs.length > 0) {
      const bonusMultiplier = bonusCoeffs.reduce((acc, coeff) => acc * coeff, 1)
      baseDamage = baseDamage * bonusMultiplier
    }

    // 应用减伤系数（多个乘算）
    if (reductionCoeffs && reductionCoeffs.length > 0) {
      const reductionMultiplier = reductionCoeffs.reduce((acc, coeff) => acc * coeff, 1)
      baseDamage = baseDamage * reductionMultiplier
    }
  }

  return Math.floor(baseDamage)
}

// 伤害计算函数
async function calculateDamage() {
  if (!canCalculate.value) return

  const leftStats = leftBattleStats.value
  const rightStats = rightBattleStats.value

  const leftParams = {
    lumi: leftLumi.value,
    level: leftLevel.value,
    breakLevel: leftBreakLevel.value,
    skill: leftSkill.value,
    atkBuff: leftAtkBuff.value,
    defBuff: leftDefBuff.value,
    atk: leftStats.atk,
    def: leftStats.def,
    type1: leftLumi.value.Type1,
    type2: leftLumi.value.Type2
  }

  const rightParams = {
    lumi: rightLumi.value,
    level: rightLevel.value,
    breakLevel: rightBreakLevel.value,
    skill: rightSkill.value,
    atkBuff: rightAtkBuff.value,
    defBuff: rightDefBuff.value,
    atk: rightStats.atk,
    def: rightStats.def,
    type1: rightLumi.value.Type1,
    type2: rightLumi.value.Type2
  }

  // 获取普攻技能威力
  const leftNormalSkill = allSkills.value.find(s => s.Id === leftLumi.value.NormalAttack)
  const rightNormalSkill = allSkills.value.find(s => s.Id === rightLumi.value.NormalAttack)

  const leftNormalPower = getSkillPower(leftNormalSkill)
  const rightNormalPower = getSkillPower(rightNormalSkill)

  // 左对右普攻
  const leftToRightNormal = calcSingleDamage({
    attacker: { ...leftParams, type1: leftLumi.value.Type1, type2: leftLumi.value.Type2 },
    defender: { type1: rightLumi.value.Type1, type2: rightLumi.value.Type2, def: rightStats.def, defBuff: rightDefBuff.value, hp: rightStats.hp },
    skill: { SkillPowerList: [leftNormalPower] },
    isCrit: false,
    bonusCoeffs: leftBonusCoeffs.value,
    reductionCoeffs: rightReductionCoeffs.value
  })

  // 左对右技能（暴击）
  const leftToRightSkill = calcSingleDamage({
    attacker: { ...leftParams, type1: leftLumi.value.Type1, type2: leftLumi.value.Type2 },
    defender: { type1: rightLumi.value.Type1, type2: rightLumi.value.Type2, def: rightStats.def, defBuff: rightDefBuff.value, hp: rightStats.hp },
    skill: leftSkill.value,
    isCrit: true,
    bonusCoeffs: leftBonusCoeffs.value,
    reductionCoeffs: rightReductionCoeffs.value
  })

  // 右对左普攻
  const rightToLeftNormal = calcSingleDamage({
    attacker: { ...rightParams, type1: rightLumi.value.Type1, type2: rightLumi.value.Type2 },
    defender: { type1: leftLumi.value.Type1, type2: leftLumi.value.Type2, def: leftStats.def, defBuff: leftDefBuff.value, hp: leftStats.hp },
    skill: { SkillPowerList: [rightNormalPower] },
    isCrit: false,
    bonusCoeffs: rightBonusCoeffs.value,
    reductionCoeffs: leftReductionCoeffs.value
  })

  // 右对左技能（暴击）
  const rightToLeftSkill = calcSingleDamage({
    attacker: { ...rightParams, type1: rightLumi.value.Type1, type2: rightLumi.value.Type2 },
    defender: { type1: leftLumi.value.Type1, type2: leftLumi.value.Type2, def: leftStats.def, defBuff: leftDefBuff.value, hp: leftStats.hp },
    skill: rightSkill.value,
    isCrit: true,
    bonusCoeffs: rightBonusCoeffs.value,
    reductionCoeffs: leftReductionCoeffs.value
  })

  // 普攻暴击伤害
  const leftToRightNormalCrit = calcSingleDamage({
    attacker: { ...leftParams, type1: leftLumi.value.Type1, type2: leftLumi.value.Type2 },
    defender: { type1: rightLumi.value.Type1, type2: rightLumi.value.Type2, def: rightStats.def, defBuff: rightDefBuff.value, hp: rightStats.hp },
    skill: { SkillPowerList: [leftNormalPower] },
    isCrit: true,
    bonusCoeffs: leftBonusCoeffs.value,
    reductionCoeffs: rightReductionCoeffs.value
  })

  const rightToLeftNormalCrit = calcSingleDamage({
    attacker: { ...rightParams, type1: rightLumi.value.Type1, type2: rightLumi.value.Type2 },
    defender: { type1: leftLumi.value.Type1, type2: leftLumi.value.Type2, def: leftStats.def, defBuff: leftDefBuff.value, hp: leftStats.hp },
    skill: { SkillPowerList: [rightNormalPower] },
    isCrit: true,
    bonusCoeffs: rightBonusCoeffs.value,
    reductionCoeffs: leftReductionCoeffs.value
  })

  // 技能正常伤害
  const leftToRightSkillNormal = calcSingleDamage({
    attacker: { ...leftParams, type1: leftLumi.value.Type1, type2: leftLumi.value.Type2 },
    defender: { type1: rightLumi.value.Type1, type2: rightLumi.value.Type2, def: rightStats.def, defBuff: rightDefBuff.value, hp: rightStats.hp },
    skill: leftSkill.value,
    isCrit: false,
    bonusCoeffs: leftBonusCoeffs.value,
    reductionCoeffs: rightReductionCoeffs.value
  })

  const rightToLeftSkillNormal = calcSingleDamage({
    attacker: { ...rightParams, type1: rightLumi.value.Type1, type2: rightLumi.value.Type2 },
    defender: { type1: leftLumi.value.Type1, type2: leftLumi.value.Type2, def: leftStats.def, defBuff: leftDefBuff.value, hp: leftStats.hp },
    skill: rightSkill.value,
    isCrit: false,
    bonusCoeffs: rightBonusCoeffs.value,
    reductionCoeffs: leftReductionCoeffs.value
  })

  // 计算百分比
  const leftToRightNormalPercent = ((leftToRightNormal / rightStats.hp) * 100).toFixed(1)
  const leftToRightNormalCritPercent = ((leftToRightNormalCrit / rightStats.hp) * 100).toFixed(1)
  const leftToRightSkillNormalPercent = ((leftToRightSkillNormal / rightStats.hp) * 100).toFixed(1)
  const leftToRightSkillPercent = ((leftToRightSkill / rightStats.hp) * 100).toFixed(1)

  const rightToLeftNormalPercent = ((rightToLeftNormal / leftStats.hp) * 100).toFixed(1)
  const rightToLeftNormalCritPercent = ((rightToLeftNormalCrit / leftStats.hp) * 100).toFixed(1)
  const rightToLeftSkillNormalPercent = ((rightToLeftSkillNormal / leftStats.hp) * 100).toFixed(1)
  const rightToLeftSkillPercent = ((rightToLeftSkill / leftStats.hp) * 100).toFixed(1)

  calculationResults.value = {
    leftToRight: {
      normalAttack: leftToRightNormalPercent,
      normalAttackCrit: leftToRightNormalCritPercent,
      skill: leftToRightSkillNormalPercent,
      skillCrit: leftToRightSkillPercent
    },
    rightToLeft: {
      normalAttack: rightToLeftNormalPercent,
      normalAttackCrit: rightToLeftNormalCritPercent,
      skill: rightToLeftSkillNormalPercent,
      skillCrit: rightToLeftSkillPercent
    },
    calculationLog: [
      `=== 左侧 ===`,
      `噜咪: ${getLumiName(leftLumi.value)}`,
      `等级: ${leftLevel}, 突破: +${leftBreakLevel}`,
      `战斗资质 - HP: ${leftStats.hp}, 攻击: ${leftStats.atk}, 防御: ${leftStats.def}`,
      `攻击等级: ${leftAtkBuff >= 0 ? '+' : ''}${leftAtkBuff}, 防御等级: ${leftDefBuff >= 0 ? '+' : ''}${leftDefBuff}`,
      ``,
      `=== 右侧 ===`,
      `噜咪: ${getLumiName(rightLumi.value)}`,
      `等级: ${rightLevel}, 突破: +${rightBreakLevel}`,
      `战斗资质 - HP: ${rightStats.hp}, 攻击: ${rightStats.atk}, 防御: ${rightStats.def}`,
      `攻击等级: ${rightAtkBuff >= 0 ? '+' : ''}${rightAtkBuff}, 防御等级: ${rightDefBuff >= 0 ? '+' : ''}${rightDefBuff}`,
      ``,
      `=== 计算结果 ===`,
      `左侧→右侧:`,
      `  普攻: ${leftToRightNormal} (${leftToRightNormalPercent}%)`,
      `  普攻暴: ${leftToRightNormalCrit} (${leftToRightNormalCritPercent}%)`,
      `  技能: ${leftToRightSkillNormal} (${leftToRightSkillNormalPercent}%)`,
      `  技能暴: ${leftToRightSkill} (${leftToRightSkillPercent}%)`,
      ``,
      `右侧→左侧:`,
      `  普攻: ${rightToLeftNormal} (${rightToLeftNormalPercent}%)`,
      `  普攻暴: ${rightToLeftNormalCrit} (${rightToLeftNormalCritPercent}%)`,
      `  技能: ${rightToLeftSkillNormal} (${rightToLeftSkillNormalPercent}%)`,
      `  技能暴: ${rightToLeftSkill} (${rightToLeftSkillPercent}%)`
    ]
  }

  showResults.value = true
}

// 重置计算结果
watch([
  leftLumi, rightLumi, leftLevel, rightLevel,
  leftBreakLevel, rightBreakLevel, leftSkill, rightSkill,
  leftAtkBuff, rightAtkBuff, leftDefBuff, rightDefBuff
], () => {
  if (showResults.value) {
    showResults.value = false
  }
})
</script>

<template>
  <div v-if="loading" class="loading">加载中...</div>
  <div v-else class="damage-calculator">
    <!-- 页面标题 -->
    <div class="page-header">
      <h1 class="page-title">⚔️ 伤害计算器</h1>
      <p class="page-desc">计算两只噜咪之间的相互伤害</p>
    </div>

    <!-- 计算表单 -->
    <div class="calculator-form">
      <!-- 左侧设置 -->
      <div class="form-section left-section">
        <h2 class="section-title">左侧</h2>

        <div class="input-group">
          <label class="input-label">选择噜咪</label>
          <LumiSelector
            :model-value="leftLumi"
            :lumis="allLumis"
            :loc-map="locMap"
            placeholder="选择噜咪"
            @update:model-value="setLeftLumi"
          />
        </div>

        <div v-if="leftLumi" class="lumi-preview">
          <img
            v-if="leftLumi.CA"
            :src="`/images/avatars/${leftLumi.CA}.png`"
            class="preview-avatar"
            @error="($event.target).style.display='none'"
          />
          <div class="preview-info">
            <div class="preview-name">{{ getLumiName(leftLumi) }}</div>
            <div class="preview-types">
              <span class="type-tag" :style="{ background: TYPE_COLORS[leftLumi.Type1] }">
                {{ TYPE_NAMES[leftLumi.Type1] }}
              </span>
              <span v-if="leftLumi.Type2" class="type-tag" :style="{ background: TYPE_COLORS[leftLumi.Type2] }">
                {{ TYPE_NAMES[leftLumi.Type2] }}
              </span>
            </div>
          </div>
        </div>

        <div class="input-row">
          <div class="input-group half">
            <label class="input-label">等级 (1-50)</label>
            <input v-model.number="leftLevel" type="number" min="1" max="50" class="form-input" />
          </div>
          <div class="input-group half">
            <label class="input-label">突破 (0-5)</label>
            <input v-model.number="leftBreakLevel" type="number" min="0" max="5" class="form-input" />
          </div>
        </div>

        <div class="input-group" v-if="leftLumi">
          <label class="input-label">战斗资质 (等级{{ leftLevel }} 突破+{{ leftBreakLevel }})</label>
          <div class="stats-display">
            <div class="stat-item-inline">
              <span class="stat-label">HP</span>
              <span class="stat-value-inline">{{ leftBattleStats.hp }}</span>
            </div>
            <div class="stat-item-inline">
              <span class="stat-label">攻击</span>
              <span class="stat-value-inline">{{ leftBattleStats.atk }}</span>
            </div>
            <div class="stat-item-inline">
              <span class="stat-label">防御</span>
              <span class="stat-value-inline">{{ leftBattleStats.def }}</span>
            </div>
          </div>
        </div>

        <!-- 普攻信息 -->
        <div v-if="leftNormalAttackInfo" class="normal-attack-card">
          <div class="normal-attack-title">🗡️ 普攻信息</div>
          <div class="normal-attack-stats">
            <div class="na-stat">
              <span class="na-label">威力</span>
              <span class="na-value">{{ leftNormalAttackInfo.power }}</span>
            </div>
            <div class="na-stat">
              <span class="na-label">回能</span>
              <span class="na-value">+{{ leftNormalAttackInfo.energy.toFixed(1) }}</span>
            </div>
            <div class="na-stat">
              <span class="na-label">间隔</span>
              <span class="na-value">{{ leftNormalAttackInfo.interval.toFixed(2) }}s</span>
            </div>
          </div>
        </div>

        <div class="input-group">
          <label class="input-label">技能</label>
          <select v-model="leftSkill" class="form-select">
            <option :value="null">选择技能</option>
            <optgroup v-if="leftSkills.filter(s => s.category === 'exclusive').length" label="专属技能">
              <option v-for="skill in leftSkills.filter(s => s.category === 'exclusive')" :key="skill.Id" :value="skill">
                {{ getSkillName(skill) }}
              </option>
            </optgroup>
            <optgroup v-if="leftSkills.filter(s => s.category === 'pool').length" label="技能池">
              <option v-for="skill in leftSkills.filter(s => s.category === 'pool')" :key="skill.Id" :value="skill">
                {{ getSkillName(skill) }}
              </option>
            </optgroup>
          </select>
        </div>

        <!-- 技能详情 -->
        <div v-if="leftSkillInfo" class="skill-info-card">
          <div class="skill-info-row">
            <span class="skill-info-label">消耗</span>
            <span class="skill-info-value">{{ leftSkillInfo.cost }}</span>
          </div>
          <div class="skill-info-row">
            <span class="skill-info-label">威力</span>
            <span class="skill-info-value">{{ leftSkillInfo.power }}</span>
          </div>
          <div class="skill-info-desc">
            {{ leftSkillInfo.des }}
          </div>
        </div>

        <div class="input-row">
          <div class="input-group half">
            <label class="input-label">攻击等级</label>
            <select v-model.number="leftAtkBuff" class="form-select">
              <option v-for="i in 11" :key="i-6" :value="i-6">{{ i-6 >= 0 ? '+' : '' }}{{ i-6 }}</option>
            </select>
          </div>
          <div class="input-group half">
            <label class="input-label">防御等级</label>
            <select v-model.number="leftDefBuff" class="form-select">
              <option v-for="i in 11" :key="i-6" :value="i-6">{{ i-6 >= 0 ? '+' : '' }}{{ i-6 }}</option>
            </select>
          </div>
        </div>

        <!-- 增伤系数 -->
        <div class="input-group">
          <label class="input-label">
            增伤系数
            <span class="coeff-summary" v-if="leftBonusCoeffs.length > 0">
              (总计: {{ (leftBonusCoeffs.reduce((a, b) => a * b, 1) * 100).toFixed(0) }}%)
            </span>
          </label>
          <div class="coeffs-list">
            <div v-for="(coeff, index) in leftBonusCoeffs" :key="'bonus-' + index" class="coeff-item">
              <input v-model.number="leftBonusCoeffs[index]" type="number" step="0.01" min="0" class="form-input coeff-input" />
              <button @click="leftBonusCoeffs.splice(index, 1)" class="coeff-remove">✕</button>
            </div>
            <button @click="leftBonusCoeffs.push(1.0)" class="coeff-add">+ 添加增伤系数</button>
          </div>
        </div>

        <!-- 减伤系数 -->
        <div class="input-group">
          <label class="input-label">
            减伤系数
            <span class="coeff-summary" v-if="leftReductionCoeffs.length > 0">
              (总计: {{ (leftReductionCoeffs.reduce((a, b) => a * b, 1) * 100).toFixed(0) }}%)
            </span>
          </label>
          <div class="coeffs-list">
            <div v-for="(coeff, index) in leftReductionCoeffs" :key="'reduction-' + index" class="coeff-item">
              <input v-model.number="leftReductionCoeffs[index]" type="number" step="0.01" min="0" max="2" class="form-input coeff-input" />
              <button @click="leftReductionCoeffs.splice(index, 1)" class="coeff-remove">✕</button>
            </div>
            <button @click="leftReductionCoeffs.push(1.0)" class="coeff-add">+ 添加减伤系数</button>
          </div>
        </div>
      </div>

      <!-- 中间：VS 分隔 -->
      <div class="vs-divider">
        <span class="vs-text">VS</span>
      </div>

      <!-- 右侧设置 -->
      <div class="form-section right-section">
        <h2 class="section-title">右侧</h2>

        <div class="input-group">
          <label class="input-label">选择噜咪</label>
          <LumiSelector
            :model-value="rightLumi"
            :lumis="allLumis"
            :loc-map="locMap"
            placeholder="选择噜咪"
            @update:model-value="setRightLumi"
          />
        </div>

        <div v-if="rightLumi" class="lumi-preview">
          <img
            v-if="rightLumi.CA"
            :src="`/images/avatars/${rightLumi.CA}.png`"
            class="preview-avatar"
            @error="($event.target).style.display='none'"
          />
          <div class="preview-info">
            <div class="preview-name">{{ getLumiName(rightLumi) }}</div>
            <div class="preview-types">
              <span class="type-tag" :style="{ background: TYPE_COLORS[rightLumi.Type1] }">
                {{ TYPE_NAMES[rightLumi.Type1] }}
              </span>
              <span v-if="rightLumi.Type2" class="type-tag" :style="{ background: TYPE_COLORS[rightLumi.Type2] }">
                {{ TYPE_NAMES[rightLumi.Type2] }}
              </span>
            </div>
          </div>
        </div>

        <div class="input-row">
          <div class="input-group half">
            <label class="input-label">等级 (1-50)</label>
            <input v-model.number="rightLevel" type="number" min="1" max="50" class="form-input" />
          </div>
          <div class="input-group half">
            <label class="input-label">突破 (0-5)</label>
            <input v-model.number="rightBreakLevel" type="number" min="0" max="5" class="form-input" />
          </div>
        </div>

        <div class="input-group" v-if="rightLumi">
          <label class="input-label">战斗资质 (等级{{ rightLevel }} 突破+{{ rightBreakLevel }})</label>
          <div class="stats-display">
            <div class="stat-item-inline">
              <span class="stat-label">HP</span>
              <span class="stat-value-inline">{{ rightBattleStats.hp }}</span>
            </div>
            <div class="stat-item-inline">
              <span class="stat-label">攻击</span>
              <span class="stat-value-inline">{{ rightBattleStats.atk }}</span>
            </div>
            <div class="stat-item-inline">
              <span class="stat-label">防御</span>
              <span class="stat-value-inline">{{ rightBattleStats.def }}</span>
            </div>
          </div>
        </div>

        <!-- 普攻信息 -->
        <div v-if="rightNormalAttackInfo" class="normal-attack-card">
          <div class="normal-attack-title">🗡️ 普攻信息</div>
          <div class="normal-attack-stats">
            <div class="na-stat">
              <span class="na-label">威力</span>
              <span class="na-value">{{ rightNormalAttackInfo.power }}</span>
            </div>
            <div class="na-stat">
              <span class="na-label">回能</span>
              <span class="na-value">+{{ rightNormalAttackInfo.energy.toFixed(1) }}</span>
            </div>
            <div class="na-stat">
              <span class="na-label">间隔</span>
              <span class="na-value">{{ rightNormalAttackInfo.interval.toFixed(2) }}s</span>
            </div>
          </div>
        </div>

        <div class="input-group">
          <label class="input-label">技能</label>
          <select v-model="rightSkill" class="form-select">
            <option :value="null">选择技能</option>
            <optgroup v-if="rightSkills.filter(s => s.category === 'exclusive').length" label="专属技能">
              <option v-for="skill in rightSkills.filter(s => s.category === 'exclusive')" :key="skill.Id" :value="skill">
                {{ getSkillName(skill) }}
              </option>
            </optgroup>
            <optgroup v-if="rightSkills.filter(s => s.category === 'pool').length" label="技能池">
              <option v-for="skill in rightSkills.filter(s => s.category === 'pool')" :key="skill.Id" :value="skill">
                {{ getSkillName(skill) }}
              </option>
            </optgroup>
          </select>
        </div>

        <!-- 技能详情 -->
        <div v-if="rightSkillInfo" class="skill-info-card">
          <div class="skill-info-row">
            <span class="skill-info-label">消耗</span>
            <span class="skill-info-value">{{ rightSkillInfo.cost }}</span>
          </div>
          <div class="skill-info-row">
            <span class="skill-info-label">威力</span>
            <span class="skill-info-value">{{ rightSkillInfo.power }}</span>
          </div>
          <div class="skill-info-desc">
            {{ rightSkillInfo.des }}
          </div>
        </div>

        <div class="input-row">
          <div class="input-group half">
            <label class="input-label">攻击等级</label>
            <select v-model.number="rightAtkBuff" class="form-select">
              <option v-for="i in 11" :key="i-6" :value="i-6">{{ i-6 >= 0 ? '+' : '' }}{{ i-6 }}</option>
            </select>
          </div>
          <div class="input-group half">
            <label class="input-label">防御等级</label>
            <select v-model.number="rightDefBuff" class="form-select">
              <option v-for="i in 11" :key="i-6" :value="i-6">{{ i-6 >= 0 ? '+' : '' }}{{ i-6 }}</option>
            </select>
          </div>
        </div>

        <!-- 增伤系数 -->
        <div class="input-group">
          <label class="input-label">
            增伤系数
            <span class="coeff-summary" v-if="rightBonusCoeffs.length > 0">
              (总计: {{ (rightBonusCoeffs.reduce((a, b) => a * b, 1) * 100).toFixed(0) }}%)
            </span>
          </label>
          <div class="coeffs-list">
            <div v-for="(coeff, index) in rightBonusCoeffs" :key="'bonus-' + index" class="coeff-item">
              <input v-model.number="rightBonusCoeffs[index]" type="number" step="0.01" min="0" class="form-input coeff-input" />
              <button @click="rightBonusCoeffs.splice(index, 1)" class="coeff-remove">✕</button>
            </div>
            <button @click="rightBonusCoeffs.push(1.0)" class="coeff-add">+ 添加增伤系数</button>
          </div>
        </div>

        <!-- 减伤系数 -->
        <div class="input-group">
          <label class="input-label">
            减伤系数
            <span class="coeff-summary" v-if="rightReductionCoeffs.length > 0">
              (总计: {{ (rightReductionCoeffs.reduce((a, b) => a * b, 1) * 100).toFixed(0) }}%)
            </span>
          </label>
          <div class="coeffs-list">
            <div v-for="(coeff, index) in rightReductionCoeffs" :key="'reduction-' + index" class="coeff-item">
              <input v-model.number="rightReductionCoeffs[index]" type="number" step="0.01" min="0" max="2" class="form-input coeff-input" />
              <button @click="rightReductionCoeffs.splice(index, 1)" class="coeff-remove">✕</button>
            </div>
            <button @click="rightReductionCoeffs.push(1.0)" class="coeff-add">+ 添加减伤系数</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 计算按钮 -->
    <div class="action-buttons">
      <button @click="calculateDamage" :disabled="!canCalculate" class="calculate-btn">
        计算相互伤害
      </button>
    </div>

    <!-- 结果显示 -->
    <div v-if="showResults" class="results-section">
      <h2 class="results-title">计算结果</h2>

      <!-- 左对右伤害 -->
      <div class="result-group">
        <h3 class="result-group-title">👈 左侧对右侧的伤害</h3>
        <div class="result-cards-4">
          <div class="result-card">
            <div class="result-icon">⚔️</div>
            <h4 class="result-label">普攻</h4>
            <div class="result-value">{{ calculationResults.leftToRight.normalAttack }}%</div>
            <div class="result-desc">非暴击</div>
          </div>
          <div class="result-card">
            <div class="result-icon">💥</div>
            <h4 class="result-label">普攻</h4>
            <div class="result-value">{{ calculationResults.leftToRight.normalAttackCrit }}%</div>
            <div class="result-desc">暴击</div>
          </div>
          <div class="result-card">
            <div class="result-icon">✨</div>
            <h4 class="result-label">技能</h4>
            <div class="result-value">{{ calculationResults.leftToRight.skill }}%</div>
            <div class="result-desc">非暴击</div>
          </div>
          <div class="result-card">
            <div class="result-icon">💫</div>
            <h4 class="result-label">技能</h4>
            <div class="result-value">{{ calculationResults.leftToRight.skillCrit }}%</div>
            <div class="result-desc">暴击</div>
          </div>
        </div>
      </div>

      <!-- 右对左伤害 -->
      <div class="result-group">
        <h3 class="result-group-title">右侧对左侧的伤害 👉</h3>
        <div class="result-cards-4">
          <div class="result-card">
            <div class="result-icon">⚔️</div>
            <h4 class="result-label">普攻</h4>
            <div class="result-value">{{ calculationResults.rightToLeft.normalAttack }}%</div>
            <div class="result-desc">非暴击</div>
          </div>
          <div class="result-card">
            <div class="result-icon">💥</div>
            <h4 class="result-label">普攻</h4>
            <div class="result-value">{{ calculationResults.rightToLeft.normalAttackCrit }}%</div>
            <div class="result-desc">暴击</div>
          </div>
          <div class="result-card">
            <div class="result-icon">✨</div>
            <h4 class="result-label">技能</h4>
            <div class="result-value">{{ calculationResults.rightToLeft.skill }}%</div>
            <div class="result-desc">非暴击</div>
          </div>
          <div class="result-card">
            <div class="result-icon">💫</div>
            <h4 class="result-label">技能</h4>
            <div class="result-value">{{ calculationResults.rightToLeft.skillCrit }}%</div>
            <div class="result-desc">暴击</div>
          </div>
        </div>
      </div>

      <!-- 计算详情 -->
      <details class="calculation-details">
        <summary>查看计算详情</summary>
        <div class="calculation-log">
          <div v-for="(log, index) in calculationResults.calculationLog" :key="index" class="log-item">
            {{ log }}
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.damage-calculator {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  text-align: center;
  margin-bottom: 32px;
}

.page-title {
  font-size: 2.2em;
  color: var(--accent);
  margin-bottom: 8px;
}

.page-desc {
  color: var(--text-dim);
  font-size: 0.95em;
}

.calculator-form {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 20px;
  margin-bottom: 24px;
}

.form-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
}

.section-title {
  color: var(--accent);
  margin-bottom: 16px;
  font-size: 1.3em;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}

.input-group {
  margin-bottom: 14px;
}

.input-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.input-label {
  display: block;
  margin-bottom: 5px;
  color: var(--text);
  font-size: 0.85em;
  font-weight: 500;
}

.form-input,
.form-select {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text);
  outline: none;
  transition: border-color 0.2s;
  font-size: 0.9em;
}

.form-input:focus,
.form-select:focus {
  border-color: var(--accent);
}

.form-input.readonly {
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-dim);
  cursor: not-allowed;
}

.stats-display {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 10px;
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.stat-item-inline {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}

.stat-label {
  color: var(--text-dim);
  font-size: 0.75em;
}

.stat-value-inline {
  color: var(--text);
  font-weight: 600;
  font-size: 1em;
}

.lumi-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: var(--bg);
  border-radius: 8px;
  margin-bottom: 14px;
}

.preview-avatar {
  width: 45px;
  height: 56px;
  object-fit: contain;
}

.preview-info {
  flex: 1;
}

.preview-name {
  color: var(--text);
  font-weight: 600;
  margin-bottom: 4px;
  font-size: 0.9em;
}

.preview-types {
  display: flex;
  gap: 4px;
}

.type-tag {
  color: #fff;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 0.7em;
  font-weight: 600;
}

/* 技能信息卡片 */
.skill-info-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 14px;
}

.skill-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.skill-info-row:last-of-type {
  border-bottom: none;
}

.skill-info-label {
  color: var(--text-dim);
  font-size: 0.8em;
}

.skill-info-value {
  color: var(--accent);
  font-weight: 600;
  font-size: 0.9em;
}

.skill-info-desc {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text);
  font-size: 0.85em;
  line-height: 1.5;
}

/* 普攻信息卡片 */
.normal-attack-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 14px;
}

.normal-attack-title {
  color: var(--accent-light);
  font-size: 0.85em;
  font-weight: 600;
  margin-bottom: 8px;
}

.normal-attack-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.na-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}

.na-label {
  color: var(--text-dim);
  font-size: 0.75em;
}

.na-value {
  color: var(--text);
  font-weight: 600;
  font-size: 0.95em;
}

.vs-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
}

.vs-text {
  font-size: 1.8em;
  font-weight: bold;
  color: var(--accent);
  text-shadow: 0 0 20px rgba(233, 69, 96, 0.5);
}

.stat-label {
  color: var(--text-dim);
  font-size: 0.75em;
}

/* 增减伤系数样式 */
.coeffs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.coeff-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.coeff-input {
  flex: 1;
  min-width: 0;
}

.coeff-remove {
  background: rgba(233, 69, 96, 0.1);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--accent);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.coeff-remove:hover {
  background: rgba(233, 69, 96, 0.2);
  border-color: var(--accent);
}

.coeff-add {
  background: rgba(233, 69, 96, 0.1);
  border: 1px dashed var(--border);
  border-radius: 6px;
  color: var(--accent);
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.85em;
}

.coeff-add:hover {
  background: rgba(233, 69, 96, 0.2);
  border-color: var(--accent);
}

.coeff-summary {
  color: var(--text-dim);
  font-size: 0.8em;
  margin-left: 8px;
  font-weight: normal;
}

.action-buttons {
  text-align: center;
  margin-bottom: 32px;
}

.calculate-btn {
  background: linear-gradient(135deg, var(--accent), var(--accent-light));
  color: white;
  border: none;
  border-radius: var(--radius);
  padding: 14px 48px;
  font-size: 1.1em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(233, 69, 96, 0.3);
}

.calculate-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(233, 69, 96, 0.4);
}

.calculate-btn:disabled {
  background: #444;
  cursor: not-allowed;
  box-shadow: none;
}

.results-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
}

.results-title {
  color: var(--text);
  margin-bottom: 20px;
  font-size: 1.4em;
}

.result-group {
  margin-bottom: 24px;
}

.result-group:last-of-type {
  margin-bottom: 20px;
}

.result-group-title {
  color: var(--accent);
  margin-bottom: 12px;
  font-size: 1.1em;
}

.result-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.result-cards-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.result-card {
  background: linear-gradient(135deg, var(--bg), rgba(233, 69, 96, 0.08));
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  transition: transform 0.2s;
}

.result-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
}

.result-icon {
  font-size: 1.5em;
  margin-bottom: 4px;
}

.result-label {
  color: var(--text);
  margin-bottom: 6px;
  font-size: 0.8em;
}

.result-value {
  font-size: 1.6em;
  font-weight: bold;
  color: var(--accent);
  margin-bottom: 2px;
}

.result-desc {
  color: var(--text-dim);
  font-size: 0.7em;
}

.calculation-details {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-top: 16px;
}

.calculation-details summary {
  padding: 12px 16px;
  cursor: pointer;
  font-weight: bold;
  color: var(--text);
  transition: background 0.2s;
}

.calculation-details summary:hover {
  background: rgba(233, 69, 96, 0.1);
}

.calculation-log {
  padding: 16px;
  color: var(--text-dim);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.85em;
  line-height: 1.6;
  white-space: pre-wrap;
}

.log-item {
  margin-bottom: 4px;
}

@media (max-width: 900px) {
  .calculator-form {
    grid-template-columns: 1fr;
  }

  .vs-divider {
    display: none;
  }

  .result-cards {
    grid-template-columns: 1fr;
  }

  .result-cards-4 {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 480px) {
    .result-cards-4 {
      grid-template-columns: 1fr;
    }
  }
}
</style>
