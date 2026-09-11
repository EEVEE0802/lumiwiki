# 02 · 伤害公式

> 一次"攻击 A → 目标 B"最终扣多少 HP 的完整算法。属性 (Attack/Defstate/Fv) 从哪来见 [03-stats.md](03-stats.md)；本章聚焦"有了属性之后怎么算伤害"。

## 一句话

```
baseDamage = Fv × (attack / max(def,1)) × skillPower × h × y × z × globalMul × critMul
finalDamage = -Round(baseDamage) → 再叠 ExtraTotalOnHitEnhance / OnHitEnhance → 普攻锁定 → 保底 -1
```

7 个乘因子（**Fv / 攻防比 / 技能威力 / 属性一致 h / 属性克制 y / 其他加成 z / 全局增减伤和暴击倍率**）逐项相乘，最后叠"承伤加成"和"普攻锁定上限"，round 成整数、变负数（负 = 扣血）写入 `AttackResult.m_FinalRealDamage`。

## 计算入口

- 代码：`battle/BattleCore/Component/Combat/AttackResult.cs::CalculatesDamage`
- 调用点：`CombatComponent.AttackPer` → `AttackResult.CalculatesDamage(myConfig, targetCombat.m_combatConfig, random, atker, target, atker.ModifySkillResult)`
- 时机：每次单次命中（一波技能一次调用；多波攻击 `SkillPowerList.Count > 1` 会多次调用，每次用 `SkillPowerList[SkillChannel]`）

## 完整公式（对着代码逐段）

### Step 1 · 属性克制系数 `y`

```csharp
res.m_y = 1
foreach enemyLumiType in target.GetRuntimeTypes():   // 目标可能是双属性（Type1 + Type2）
    typeCount = BattleTypeConfig[atkSkillType][enemyLumiType]    // 万分比，来自 LumiTypeCounter.json
    if typeCount == 0: continue                                   // 该组合无配置 → 跳过
    if typeCount > 11000:                                         // 只有强克制 (>1.1x) 允许被 CounterRateChange 修改
        typeOffset = typeCount + (myConfig.CounterRateChange - enemyConfig.OnHitCounterRateChange)
        typeOffset = max(typeOffset, 10000)                       // 下限 1.0（修正不能把克制打成抵抗）
    else:
        typeOffset = typeCount
    res.m_y *= typeOffset / 10000.0

if 0.95 < res.m_y < 1.05:  res.m_y = 1                            // 死区：接近 1 时直接归 1
```

**要点**：

- **敌方双属性乘积**：目标是 Type1+Type2 时，克制系数是两个的乘积（如水对火 1.6 × 对冰 0.625 = 1.0 → 落入死区归 1）
- **CounterRateChange 只影响 "强克制" 档**（原 typeCount > 11000，即 >1.1x）；反向抵抗档不会被 buff 加强/削弱
- **死区 0.95 ~ 1.05 → 1**：小幅微调被抹平，避免 "0.98x" 这种视觉上无感的数字
- 分档展示走 `LumiCounterUtil.Classify(k)` —— `>2.0` 强克 / `<0.5` 强抗 / 死区 Normal / 两侧 Counter | Resist
- 表：`LumiTypeCounter.json`（万分比：`10000` 无效果 / `16000` 克制 / `6250` 被抗 / `20000` 强克 / `5000` 强抗）

### Step 2 · 属性一致加成 `h`（STAB）

```csharp
res.m_h = 1.25f                                       // 初始默认"一致"
bool isSameType = false
foreach lumiType in atker.GetRuntimeTypes():
    if atkSkillType == lumiType: isSameType = true; break
if !isSameType:  res.m_h = 1                          // 攻击属性不在自己身上 → 无 STAB
```

> ✅ **STAB = 1.25**（策划 2026-09-11 确认）。
> `AttackResult.cs` 文件顶注释 (L21-40) 和字段注释 (L51) 说 "属性一致加成固定 1.5" 是**过时注释**，字段实际初始化 `public float m_h = 1.25f`，且没有任何代码把它改成 1.5。伤害计算器 `DamageCalculator.vue::calcTypeBonus` 也是 `return 1.25`，跟代码一致。

### Step 3 · 攻击 / 防御 / OtherExtra 装载

```csharp
res.m_x = enemyConfig.MDef            // 记录敌方防御（后续暴击/贯穿等可能会引用）
res.m_z = myConfig.OtherExtra          // 其他加成，默认 1（ConfigCombat.BaseOtherExtra=1）

// 攻击属性 buff 累乘进 z
foreach (atkLumiType2 in myConfig.AttackType):        // AttackType 由 buff 填入
    if atkSkillType == atkLumiType2.Key:
        res.m_z *= (1 + atkLumiType2.Value / 10000.0)
```

- `OtherExtra` 是一个 base=1 的通用倍率坑位；buff 通过 `ExtraOtherExtra` 调节
- `AttackType[type]` 让 buff 做"仅当本次是 X 属性攻击时才生效"的加成

### Step 4 · 外部 `modifyResult` 钩子

```csharp
modifyResult?.Invoke(target, res, myConfig)    // 走 LumiEntity.ModifySkillResult
```

允许被动 / 特殊逻辑在此时改 `res.m_x / m_y / m_z / m_h` —— 高级效果的注入点，见 06 章（待写）。

### Step 5 · 暴击判定

```csharp
roll = random.Range(0, 10000)                                    // [0, 10000)
critThreshold = myConfig.TotalCrit - enemyConfig.TotalResist     // 万分比
if roll < critThreshold:  res.m_canCrit = true
```

- `TotalCrit = BaseCrit + ExtraCrit`（`BaseCrit` 从 `ActiveSkill.BaseCrit` 取，Extra 由 buff 累加）
- `TotalResist = BaseResist + ExtraResist`（初始 0，由 buff / 技能提供）
- 阈值可以为负（此时永不暴击）；roll 是 `SyncRandom.Range(int, int)` → `Random.Next(min, max)`，服务端和客户端共享同一种子（[00 D2](00-overview.md#d2--伪随机同步双端一致)）

### Step 6 · 暴击时的攻防替换 & 保底

```csharp
attackNum = myConfig.MAttack
defendNum = enemyConfig.MDef

if res.m_canCrit:
    if myConfig.ActiveSkillConfig.DefCalculate:       // 特殊技能：用"防御"当"攻击"打人
        attackNum = max(myConfig.MDef, myConfig.BaseMDef)
    else:
        attackNum = max(myConfig.MAttack, myConfig.BaseMAttack)
    defendNum = min(res.m_x, enemyConfig.BaseMDef)     // 暴击对防御的"击穿"：取当前 vs 基础 更小
```

三个玄妙点：

1. **DefCalculate 技能**：`ActiveSkill.DefCalculate = true` 的技能，暴击时**用防御力代替攻击力**做攻防比 —— 这是"防御向进攻"类技能的实现（例：某些王者技能）
2. **暴击时攻方保底**：即使 buff 把 `MAttack` 压到 0，暴击时也会用 `BaseMAttack` 兜底（防止减攻 debuff 把暴击打成 0 伤害）
3. **暴击时防方削弱**：拿"当前 MDef vs Base MDef"的**更小值** —— 敌方主动叠防御 buff 能挡普通伤害，但暴击时防御 buff 会被这一步"打回原形"

### Step 7 · 攻防比

```csharp
attDifDef = (double) attackNum / max(defendNum, 1)
```

**普通攻击/防御没有下限**（可以是 0）—— 攻 0 就是 0 伤害；只有分母做 `max(., 1)` 兜底避免除零。

### Step 8 · 技能威力（含承伤加成）

```csharp
skillPower = myConfig.SkillPower           // BaseSkillPower + ExtraSkillPower
if skillPower == 0:  res.m_OnlySkillEffect = true

if myConfig.ActiveSkillConfig.SkillType == SkillType.Attack:
    if skillPower > 0:
        skillPower += enemyConfig.ExtraOnHit    // 敌方 buff 提供的"承伤额外威力"
```

- `SkillPower=0` 的技能 → **只跑效果不结算伤害**（挂 flag，最终 `finalDamage` 仍会跑但通常为 0）—— 这是 **buff 类技能** 的标记
- `ExtraOnHit` 是"被打时对方额外获得的技能威力"，**只对 SkillType.Attack 的技能生效**（普攻类 Normal 不吃）
- `skillPower > 0` 的分支意味着：如果技能本身是纯效果技能（威力=0），不会因为对方 `ExtraOnHit` 突然变有伤害

**buff 类技能（`SkillPower=0`）不触发命中 buff 链**（策划 2026-09-11 确认）：
- `AttackPer` 里的 `BeforeAttack / BeforeOnHit / AfterHit / AfterFirstHit` 仍会派发
- 但 `AfterAttack / AfterOnHit` 走 `TakeDamage` 分支时，`ShouldSkipByDamage()` 用阈值 0 判断，`|damage|=0` 就跳过 —— 所以**"造成伤害后 / 受到伤害后"两条 trigger 不触发**
- 语义：buff 类技能就是纯功能技能，不算"造成伤害"，因此后续 buff 链不启动
- **平衡分析用途**：类似"命中即上盾"、"被击后加攻"的 buff，遇到 buff 类技能不会连锁触发

**多波攻击（策划 2026-09-11 确认："多波次" = 多段伤害）**：

`ActiveSkill.SkillPowerList` 是**多段伤害配置**：`[100]` 单段技能，`[50, 50, 100]` 就是三段（威力分别 50/50/100）。

调度：
- `ConfigCombat` 从 `ActiveSkill.SkillPowerList[0]` 读第一波 `BaseSkillPower`
- 每波打完后 `AddSkillChannelAndPower()` 推进 `SkillChannel`，`BaseSkillPower` 换成 `SkillPowerList[SkillChannel]`
- **每段单独调一次 `CalculatesDamage`**，段与段之间独立走 buff 触发（`BeforeHit / AfterHit`）
- 段的时间点由 `HitTimeList[]` 控制（来自 `SkillData.hitTimmers`），由 `SkillBase.Update` 按帧驱动

⚠️ **伤害计算器把 `SkillPowerList` 求和当总威力**（`getSkillPower = reduce((a,b)=>a+b)`），这是**近似估算**（假设各段间乘因子不变）—— 服务端真实是逐波结算，段间可能被 buff 打断/改属性。

### Step 9 · 基础伤害

```csharp
baseDamage = myConfig.MFv × attDifDef × skillPower × res.m_h × res.m_y × res.m_z
```

**7 项乘积**（Fv × 攻防比 × 技能威力 × STAB × 克制 × 其他 = 6，等第 10 步的全局增伤再算成 7）。

### Step 10 · 全局增减伤（两个独立乘区）

```csharp
inc1 = 1 + (myConfig.AttackGlobalChange  - enemyConfig.OnHitAttackGlobalChange ) / 10000.0
inc2 = 1 + (myConfig.AttackGlobalChange2 - enemyConfig.OnHitAttackGlobalChange2) / 10000.0
baseDamage *= inc1 * inc2
```

- **两个独立乘区**：`inc1` 和 `inc2` 是两条通道相乘 —— 策划要求 "第二乘区独立"，避免所有增伤 buff 挤一条通道后被互相稀释
- **加减法混算**：攻方 GlobalChange 加分，守方 OnHitGlobalChange 减分，同一乘区内**先做代数和再除 10000**（意味着攻方 +50% 与守方 -50% **完全抵消**，不像其它 RPG 会残留）

### Step 11 · 暴击倍率

```csharp
if res.m_canCrit:
    critRate = 1.5 + (myConfig.CritChange - enemyConfig.OnHitCritChange) / 10000.0
    critRate = max(critRate, 1.0)                    // 下限 1.0（"抗暴"不能让暴击变治疗）
    baseDamage *= critRate
```

- 基础暴击倍率 **1.5x**（写死）
- `CritChange` = 攻方爆伤加成；`OnHitCritChange` = 守方"抗暴"（削减爆伤，不是"降低暴击率"—— 那个是 `Resist`）
- **下限 1.0**：即使攻守方修正相加为负，也不会让暴击伤害小于普通伤害

### Step 12 · Round + 变号

```csharp
baseDamage = Clamp(baseDamage, 0, int.MaxValue)
res.m_FinalRealDamage = -(int) Round(baseDamage)     // 负数 = 扣血
```

**Round 用 `Math.Round`（银行家舍入 / MidpointRounding.ToEven）**，不是 floor。

### Step 13 · 承伤增强（对已 round 的伤害追加）

```csharp
if enemyConfig.ExtraTotalOnHitEnhance != 0:
    m_FinalRealDamage += (int)((long)m_FinalRealDamage * ExtraTotalOnHitEnhance / 10000.0)

foreach (deftype in enemyConfig.OnHitEnhance):
    if atkSkillType == deftype.Key:
        m_FinalRealDamage += (int)((long)m_FinalRealDamage * deftype.Value / 10000.0)
```

**在整数伤害上再乘增益，然后累加回原伤害**。注意这两处：

- **累加到已算好的伤害上**：`m_FinalRealDamage += ...`，不是替换；两条 (`ExtraTotalOnHitEnhance` + `OnHitEnhance[type]`) 都命中时**顺次叠加**（不是相乘）
- **只依赖被击方 (enemyConfig)**：这是"守方"提供的承伤增强，语义偏向"受到某类攻击时反而受到更多伤害"—— 常见于弱点标记类 buff
- **long 强转防溢出**：`(long)m_FinalRealDamage * value` 先扩展到 64bit，再除 10000 再截 int

### Step 14 · 普攻锁定（ExtraLock）

```csharp
if myConfig.ActiveSkillConfig.SkillType == SkillType.Nornal:   // ← 拼写 "Nornal" 是源码里的
    if enemyConfig.ExtraLock > 0:
        maxHealth = target.HealthComponent.MaxHealth
        lockDamage = -int(maxHealth × ExtraLock / 10000.0)      // 负数
        if m_FinalRealDamage < lockDamage:                       // 更负 = 更狠 → 拉回 lockDamage
            m_FinalRealDamage = lockDamage
```

- **只对普攻 (`Nornal`) 生效**，技能 (`Attack`) 不吃这个
- `ExtraLock`（万分比）：普攻单次上限占敌方 MaxHealth 的比例
- 用途：防止普攻打出天量数字（对高攻脆皮的护甲策略）
- ⚠️ 源码枚举拼错为 `SkillType.Nornal`，grep 时注意

### Step 15 · 最终保底

```csharp
if skillPower != 0 && m_FinalRealDamage == 0:
    m_FinalRealDamage = -1                    // 至少扣 1 血
```

**只有技能威力不为 0** 的情况下才保底；纯效果技能（威力=0）保持 0 伤害。

## 谁记入 HP

`CombatComponent.TakeDamage` → `HealthComponent.TakeHealth(damage, result)`：

```csharp
Health += damage                                          // damage 是负数
if Health > MaxHealth:  Health = MaxHealth
result.SetFinalRealChangeHp(Health - oldHealth)           // 记真实变化
SendEvent(EventHealthUpdate, ...)
if Health <= 0 && CanGoToDead(result):  isDead = true; OnDeath(result)
```

`m_FinalRealDamage` 是**理论伤害**（负数），`m_FinalRealChangeHp` 是**实际掉血**（可能被 CanHitDamage=false 挡掉、被免死救回 —— 两者可能不等）。

## 完整链一图流

```
攻击方 ConfigCombat myConfig                              防守方 ConfigCombat enemyConfig
    │                                                          │
    ▼                                                          ▼
Step 1  y = 属性克制乘积（敌方所有类型），11000+ 档才吃 CounterRateChange 修正
Step 2  h = 攻击属性在自身类型里 → 1.25 / 否则 1
Step 3  x=MDef, z=OtherExtra × (1 + Σ AttackType[type]/10000)
Step 4  外部 modifyResult 钩子（可能改 x/y/z/h）
Step 5  暴击判定：Range(0,10000) < TotalCrit - TotalResist
Step 6  暴击时：attack ← max(MAttack, BaseMAttack) 或 max(MDef,BaseMDef)(DefCalculate 时)
                def    ← min(MDef, BaseMDef)
Step 7  attDifDef = attack / max(def, 1)
Step 8  skillPower += ExtraOnHit  (仅 SkillType.Attack 且 skillPower>0)
Step 9  baseDamage = MFv × attDifDef × skillPower × h × y × z
Step 10 baseDamage ×= (1 + ΔGlobal1/10000) × (1 + ΔGlobal2/10000)     ← 两个独立乘区
Step 11 暴击: baseDamage ×= max(1.5 + ΔCrit/10000, 1)
Step 12 finalDamage = -Round(baseDamage)
Step 13 finalDamage += finalDamage × (ExtraTotalOnHitEnhance/10000)
        finalDamage += finalDamage × (OnHitEnhance[type]/10000)
Step 14 若普攻 & ExtraLock>0: finalDamage = max(finalDamage, -MaxHealth × ExtraLock/10000)
Step 15 若 skillPower≠0 且 finalDamage=0: finalDamage = -1
    │
    ▼
HealthComponent.TakeHealth(finalDamage, result)
```

## 数值示例

沿用 [03](03-stats.md#数值示例) 的 Lv50/Break3 数值：
攻方 `attack=210, def=431, hp=4472, fv=17.03`，性格 id=1，STAB 生效。

假设：
- 技能 `SkillPower = 100`（BaseSkillPower）
- 敌方 `MDef=400`，`BaseMDef=400`（无 buff）
- 属性完美克制（`y=1.6`），STAB 生效（`h=1.25`），`z=1`
- 无全局增伤 buff，`OtherExtra`/`ExtraOnHit`/`ExtraLock`/`AttackType` 都是空
- 不暴击

代入：
```
baseDamage = 17.03 × (210/400) × 100 × 1.25 × 1.6 × 1
           = 17.03 × 0.525 × 100 × 2.0
           = 1788.15
finalDamage = -1788
```

暴击（`critRate=1.5`）情况：
```
attack ← max(210, 210) = 210
def    ← min(400, 400) = 400
baseDamage = 1788.15 × 1.5 = 2682.23
finalDamage = -2682
```

验证：`CalculatesDamage` 末尾有一大串 Debug 日志（`战斗伤害: A -> Skill(X) -> B 伤害: N` 和 `MFv/MAttack/x/h/y/z/attackType/channel/FinalRealDamage`），拉一场真实战斗对上就能核准。

## 主公式外的两个属性：吸血 / 贯穿

`ConfigCombat.HealthSteal / Piercing` 是从 `ActiveSkill.HealthSteal / Piercing` 读入的字段，**不在 `CalculatesDamage` 主公式里消费**，由外部组件在伤害结算后追加处理。

### 吸血（HealthSteal）—— 攻方回血

**代码位置**：`battle/BattleCore/Component/Buff/BuffTriggers.cs::AfterAttack` case

**语义**：按**实际造成伤害**的百分比恢复攻方自己 HP。

关键实现（简化）：

```csharp
// BuffTriggerType.AfterAttack 触发时
if (result.ShouldSkipByDamage()) return false;    // ← 纯效果技能不吸血
if (lumiCombatConfig.HealthSteal > 0.0):
    addHealth = |m_FinalRealChangeHp × HealthSteal / 10000|    // 实际伤害的百分比
    // 构造一个"回血 AttackResult"打给自己
    attackResult.m_damageSource = DamageHitType.Buff
    attackResult.m_FinalRealDamage = addHealth   // 正数 → 回血
    attackResult.m_damage_lumi_id  = lumiEntity.Id     // 归因给自己
    healthComponent.TakeHealth(addHealth, attackResult)
```

**要点**：
- 用 **`m_FinalRealChangeHp`（实际伤害）** 而不是 `m_FinalRealDamage`（理论伤害）—— 被免伤 / 护盾挡住的部分不吸
- 通过 `AttackResult.m_FinalRealDamage = addHealth` 正数 + `TakeHealth` 通道回血，**会被 `MaxHealth` 截断**（不能超过上限）
- **纯效果技能（`SkillPower=0`）不吸血**（`ShouldSkipByDamage()` 挡住，跟 buff 类技能不触发命中 trigger 的逻辑同源）
- **归因给自己**（`m_damage_lumi_id = lumiEntity.Id`）——`HealthComponent.TakeHealth` 里"收到治疗"分支会触发 `AfterbeTreated`，此时"敌人"是攻方自己

### 贯穿（Piercing）—— 队内溢出伤害

> ⚠️ **反直觉设计**：不是"穿透防御"。策划 2026-09-11 亲自确认。

**代码位置**：`battle/BattleCore/Entity/BattleWorldEntityEvent.cs::LumiHealthEvent`（订阅 `EventHealthUpdate`）

**语义**：按本次实际造成伤害的百分比，对**敌方玩家名下所有其他噜咪**追加造成伤害。

关键实现（简化）：

```csharp
// EventHealthUpdate 触发，source.m_FinalRealChangeHp < 0（造成伤害）时
if (damageLumi != null && source.m_skill_id != 0):      // ← 只对"技能来源伤害"触发（含普攻的 SkillId，排除 0 的 buff 反复扣血）
    if (Piercing > 0.0):
        piercingDamage = m_FinalRealChangeHp × Piercing / 10000    // 负数
        enemyPlayer = lumiEntity.GetOwnerParent()          // 被击方所属玩家
        foreach (enemyLumi in enemyPlayer.m_children_lumi):
            if (enemyLumi.Id == lumiEntity.Id) continue    // 跳过主目标
            // 每只独立打同样一份伤害
            attackResult.m_damageSource = DamageHitType.Buff
            attackResult.m_FinalRealDamage = piercingDamage
            attackResult.m_damage_lumi_id  = damageLumi.Id
            enemyLumi.GetComponent<HealthComponent>().TakeHealth(piercingDamage, attackResult)
```

**要点 / 分配规则**：

- 用 **实际伤害** (`m_FinalRealChangeHp`)，跟吸血一样
- **遍历敌方玩家 `m_children_lumi` 全部噜咪**（不是"随机 N 个"、不是"HP 最低的 1 个"，是全体）
- **每只非主目标 lumi 独立扣同样一份**（不是均分）—— 例：Piercing=20% 打了主目标 3000，敌方还有 3 只后备，则**每只**吃 600 伤害，敌方全队共吃 3000 + 3×600 = 4800 血
- **只波及"被击方玩家自己"的场下噜咪**：`enemyPlayer = lumiEntity.GetOwnerParent()` 取的是**被击方那 1 个玩家**（不是"敌方队伍"），`m_children_lumi` 是这 1 个玩家名下的全部噜咪。每个玩家一时刻只 1 只在场（宝可梦换宠风格），所以除主目标外都是**他自己的场下噜咪**。2v2 里**不会波及队友玩家**（队友的噜咪挂在另一个 PlayerEntity 名下，代码遍历不到）—— 完全符合策划"只攻击对面场上噜咪自己队伍的场下噜咪"的定义 ✅
- 走标准 `TakeHealth` 通道 → **会触发死亡判定 / 免死 / EventHealthUpdate 事件派发** → 理论上贯穿导致的死亡也会走 OnDeath（如果免死用尽）
- **`m_skill_id != 0` 才触发**：排除 buff/陷阱/场地类"非技能来源伤害"（避免它们无限连锁自触发贯穿）

## 边界与常见坑

| 情况 | 结果 | 出处 |
|---|---|---|
| 敌方防御 = 0 | 分母 `max(defendNum, 1) = 1` → 伤害巨大但不除零 | Step 7 |
| 攻击方 MAttack = 0（buff 压死） | 非暴击：伤害为 0；暴击：用 `BaseMAttack` 兜底 | Step 6-7 |
| 敌方双属性、一克制一抵抗 | 相乘后可能落 0.95~1.05 死区 → y=1 | Step 1 |
| SkillPower = 0 | `m_OnlySkillEffect=true`，走技能效果不结伤（最终 = 0） | Step 8, 15 |
| 技能属性不在自己身上（如水系用了土系技能） | h=1，无 STAB | Step 2 |
| 暴击但攻守都进 Base 兜底 | 相当于用初始面板值算暴击（buff 全失效） | Step 6 |
| CounterRateChange 修正后 > 1.0 门槛（<10000）| 被 clamp 回 10000（1.0），不会打成抵抗 | Step 1 |
| 普攻遇到 ExtraLock | 单次上限 = MaxHealth × ExtraLock/10000 | Step 14 |
| ExtraTotalOnHitEnhance + OnHitEnhance 同时命中 | 顺次追加（不是相乘） | Step 13 |
| 全局增伤 inc1 vs inc2 | 两条独立乘区 | Step 10 |

## 与 wiki 伤害计算器的差异对比

Wiki 里有一个 `src/views/DamageCalculator.vue` 是策划**按设计逻辑**（非程序代码）写的。用来交叉验证本章公式对不对。**同点略，只列差异**：

| # | 维度 | 服务端代码 | 伤害计算器 | 结论 |
|---|---|---|---|---|
| 1 | 主结构（Fv × 攻防比 × 威力 × STAB × 克制） | ✅ | ✅ | 一致 |
| 2 | STAB 值 | 1.25 | 1.25 | 一致 |
| 3 | 属性克制死区 (0.95~1.05→1) | **有** | **没做** | 差异（计算器输出可能显示 0.98x 微差伤害） |
| 4 | 取整方式 | `Math.Round`（银行家舍入） | `Math.floor`（向下取整） | 差异（同一场景可能差 1 血）|
| 5 | Fv 精度 | `16/75 = 0.21333…`（硬编码） | `2133/10000 = 0.2133`（表值） | 差异 ~0.02%（可忽略） |
| 6 | 攻防等级模型 | `MAttack = BaseM + ExtraM`（buff 直接改数值） | `(5+n)/5` 或 `5/(5+|n|)` 分档系数 | **模型不同**（详见下） |
| 7 | 暴击时的攻防保底 | 用 `BaseMAttack / BaseMDef` 兜底 | 忽略对己不利的攻防等级（正buff → 0，负 buff → 0）| 语义上等价（都是"暴击穿掉守方增益、保住攻方基线"）|
| 8 | 暴击倍率 | `1.5 + ΔCritChange/10000`（下限 1） | `× 1.5`（写死） | 计算器不建模爆伤 buff |
| 9 | 全局增减伤 | `inc1 × inc2` 两条独立乘区 | `Π bonusCoeffs × Π reductionCoeffs` 列表 | 结构对等（服务端固定 2 通道，计算器可任意多）|
| 10 | 承伤增强（`ExtraTotalOnHitEnhance` / `OnHitEnhance[type]`） | 追加乘积到已 round 的伤害 | **不建模** | 计算器缺项 |
| 11 | 普攻锁定（`ExtraLock`） | 普攻 max 单次伤害 = MaxHP × ExtraLock/10000 | **不建模** | 计算器缺项 |
| 12 | `OtherExtra / AttackType[type]` | 累乘进 `z` | **不建模** | 计算器缺项 |
| 13 | `ExtraOnHit`（承伤额外威力） | 只对 SkillType.Attack 且 skillPower>0 生效 | **不建模** | 计算器缺项 |
| 14 | `CounterRateChange`（强克制修正） | 只对 >1.1x 档生效，下限 10000 | **不建模** | 计算器缺项 |
| 15 | 星级 | 走 buff 系统（`AddBuffs` 里附加） | `starCoeff = (attacker.bonus - defender.reduction) + 1` 全局乘积 | 计算器把星级抽象成单个系数 |
| 16 | 多波攻击 | 每波单独结算 | `SkillPowerList.reduce((a,b)=>a+b)` 求和当总威力 | 计算器是近似 |
| 17 | 增减伤系数应用范围 | 所有攻击都吃 | 只对**技能**（`SkillCost.mode !== 0`）应用，普攻不吃 | 差异 |

### 差异 #6 的注解 —— 档位模型 vs 数值 buff（数值等价）

策划设计层用的是"**攻防等级**"（±N 档，宝可梦风格），公式：

```
攻击 ×
    (5 + atkLvl) / 5     if atkLvl >= 0
    5 / (5 + |atkLvl|)   if atkLvl < 0
防御同理
```

服务端实际实现是"**属性值 buff**"：`MAttack = BaseMAttack + ExtraMAttack`，`ExtraMAttack` 由 BuffComponent 直接改数值。

**策划 2026-09-11 澄清**：走 buff 是为了**配置调整的自由度**（buff 系统本来就是通用改属性通道，不必单独做档位模型）；**buff 数值本身在配表时按宝可梦档位公式 `(5+n)/5` 反推填写**，所以：

- **数值结果等价**：+2 档 buff 在配表里就是 `ExtraMAttack = BaseMAttack × ((5+2)/5 - 1) = BaseMAttack × 0.4`
- **技术实现不同**：服务端不理解"档位"这个概念，只看当前 Extra；档位是**策划配表时的心智模型**

**给平衡分析用**：
- 用计算器估攻防 buff 收益 → 直接可信
- 如果发现某个具体 buff **实战数值 ≠ 计算器档位预估**，说明**策划配表时那条 buff 没按 `(5+n)/5` 反推填写**（配表 drift），需要具体查 `TbBuffEffect` 或相关表核对

### 差异 #17 的注解 —— 计算器 UI 抽象 vs 服务端 buff 实现

策划 2026-09-11 澄清：**设计意图是"普攻和技能都吃全局增减伤"**（服务端行为正确）。

那为什么伤害计算器只对技能应用？—— 不是设计冲突，而是 **UI 抽象层差异**：

| 维度 | 服务端 | 计算器 |
|---|---|---|
| 输入形态 | 全局增减伤**通过 buff** 修改 `AttackGlobalChange / OnHitAttackGlobalChange` 字段（累积到 `ConfigCombat`） | 用户直接输入 `bonusCoeffs / reductionCoeffs` **列表参数** |
| 命中范围 | 服务端根据战场实际 buff 计算，普攻和技能**都会用到当前累积值** | 计算器 UI 假设用户填的系数属于"技能类增减伤"，普攻不套用 |
| 结论 | 无差异（普攻吃） | UI 简化模型，如果你想估计"普攻在增减伤 buff 下的伤害"，需要**自己把系数手工套到普攻分支上** |

**给平衡分析用**：以服务端行为为准 —— 普攻在全局增减伤 buff（如"我方全体增伤 20%"）下**同样受益**，用计算器估算普攻输出时要记得手动把 buff 系数乘上去。

### 建议用法

- **平衡分析 / 数值预估**：**优先看代码公式**（本章），计算器可作为快速估算工具
- **玩家给自己配队看理论输出**：用计算器 UI 更方便，误差可接受（Round vs floor 差 1 血、单乘区差异等）
- 计算器**没建模的 buff**（`ExtraOnHit / ExtraLock / CounterRateChange` 等）在实际战斗中会导致真实伤害偏离计算器输出，如果发现"计算器算 800 实际打了 1200"，先查这几个漏项

## 关键代码索引

| 关注点 | 文件 | 实体 |
|---|---|---|
| 主公式 | `battle/BattleCore/Component/Combat/AttackResult.cs` | `CalculatesDamage` |
| 攻击调度 | `battle/BattleCore/Component/Combat/CombatComponent.cs` | `Attack / AttackPer / DoAttack / TakeDamage` |
| Config 汇总 | `battle/BattleCore/Component/Combat/ConfigCombat.cs` | `MAttack / MDef / MFv / TotalCrit / SkillPower ...` |
| HP 扣减 | `battle/BattleCore/Component/Health/HealthComponent.cs` | `TakeHealth` |
| 克制表加载 | `battle/Table/BattleTypeConfig.cs` | `BattleType[atkType][enemyType]` |
| 克制档位分类 | `battle/BattleCore/Component/Combat/LumiCounterUtil.cs` | `Classify(k)` |
| 伪随机 | `battle/BattleCore/BattleRandom/SyncRandom.cs` | `Range(0, 10000)` |

## 表数据

| 表 | 用途 |
|---|---|
| `BattleConst.json` | Fv/HP/Atk/Def 系数（见 [03](03-stats.md#2-常量系数--硬编码-in-battledefine)） |
| `LumiTypeCounter.json` | 属性克制万分比 `10000 = 1.0` |
| `ActiveSkill.json` | 技能威力列表 `SkillPowerList`、`BaseCrit`、`DefCalculate`、`SkillType`、`HealthSteal`、`Piercing` |
| `BattleKeywordDes.json` | 战斗关键字描述（给 UI，跟公式无直接绑定；本章不覆盖） |

## 待记入 unknowns / 深挖清单

- [ ] **BuffComponent.ModifyReset() 和 ResetExtraValue() 的调用顺序**：`ConfigCombat.ResetExtraValue()` 注释里说"事件驱动路径会调"，如果顺序错会短暂看到 Extra=0 的中间态（快照抓拍问题） —— 05 章深挖

---

> 最后验证于 commit **fbb25c313**，日期 2026-09-11
> 关键代码：`AttackResult.cs::CalculatesDamage`, `ConfigCombat.cs`, `CombatComponent.cs::AttackPer / TakeDamage`, `HealthComponent.cs::TakeHealth`
