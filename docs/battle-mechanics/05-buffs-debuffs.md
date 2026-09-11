# 05 · Buff / Debuff 系统

> 📌 **本章约定**：官方策划文档 `battle/docs/buff-system.md` 已经把 buff 的三种触发类型、17 种 BuffTriggerType、5 组条件-效果链、生命周期、木棍人 case study 讲得非常完整。**本章不复述**，聚焦以下四件事：
>
> 1. **决策地图**：拿到一个"我要做的效果"如何选类型（Constant / Tick / 事件型）
> 2. **属性字段 ↔ 伤害公式**：`buff-system.md` §3 的属性字段表 × [[02-damage-formula]] 15 步公式，每个字段影响哪一步
> 3. **代码验证**：几个具体行为的服务端实现（叠加规则 / 免疫过滤 / 攻速公式 —— 回答 [[01-battle-tick]] 的 unknown）
> 4. **子系统边界**：Trap / MagicEnvir / Armor / TrainerSkill 跟主 buff 系统的关系
>
> 官方文档链接（必读）：`F:\G36Branch\LumiServer\battle\docs\buff-system.md`

---

## 决策地图：我要做的效果该用哪种 buff 类型？

从"想实现什么"倒推"用哪种 TriggerCondition"：

```
┌─────────────────────────────────────────────────────────────────┐
│  想做的效果                                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  "打人时/受击时多打 20%"                                          │
│  "身上有 X 状态就多打 30%"                                        │
│  "眩晕、禁足"                                                     │
│  "免疫某类 debuff"                                                │
│       ↓                                                          │
│  ✅ Constant（Always）— 修改 ConfigCombat.Extra* 或用 Vertigo/    │
│      ImmuBuffType 特殊字段。不走 EffectId，仅用 ConditonIndex     │
│      第一组做条件判断。                                           │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  "每 5 秒回 10% 血"（HOT）                                        │
│  "每 3 秒扣 500 血"（DOT / 毒 / 灼烧）                            │
│  "每回合刷新一个层数"                                             │
│       ↓                                                          │
│  ✅ Tick — TriggerCondition=1，配 TickTime；走 EffectId → 5 组     │
│      条件-效果链；不修改 ConfigCombat。                            │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  "打人后触发 X"（AfterAttack）                                    │
│  "受击后反击"（AfterOnHit）                                       │
│  "切换上场时上盾"（SwitchUp）                                     │
│  "释放技能后清 debuff"（EndSkill）                                │
│  "被治疗时触发"（AfterbeTreated）                                 │
│       ↓                                                          │
│  ✅ 事件型 — TriggerCondition=3~17，见官方文档 §一.1.2；走         │
│      EffectId → 5 组条件-效果链。                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**判断优先级**：先问「效果是**改数值**还是**做动作**？」

- **改数值**（伤害、暴击、抗性、攻速、蓝耗…）→ 除非需要精确时机，**默认用 Constant**。修改 `ConfigCombat.Extra*`，参与伤害公式，自然生效
- **做动作**（加 buff、扣血、传送、释放技能…）→ 走 Effect 链，看动作触发时机是"到点"还是"响应事件"
  - 到点 → **Tick**（也可用于强制 HOT/DOT 数值）
  - 响应事件 → **事件型**（对应事件枚举）

木棍人 case（官方文档 §7）是这个决策的经典例子：需要"必定暴击"必须是 Constant（`CritOnHitRateEnhance=-10000`），需要"命中累积计数"必须是事件型（`AfterAttack` → 升级 buff 层）。**Trigger 类型改数值字段是不生效的**（`AllConstantBuffUpdate` 只处理 Constant）。

---

## 属性字段 ↔ 伤害公式 交叉表

`buff-system.md` §3 列了完整字段，这里把每个字段**对应到 [[02-damage-formula]] 15 步公式的哪一步**（写平衡建议时能快速定位差点在哪）：

| Buff 字段（万分比） | 修改的 ConfigCombat.Extra 字段 | 影响 02 章公式哪一步 | 常见用途 |
|---|---|---|---|
| `AttackEnhance` | `ExtraMAttack += BaseMAttack × X/10000` | **Step 3** 攻击面板 | +% 攻击 buff |
| `DefenceEnhance` | `ExtraMDef` | **Step 4** 防御面板 | +% 防御 buff |
| `CritRateEnhance` | `ExtraCrit`（加算，不是万分比）| **Step 6** 暴击判定的暴击率 | +% 暴击率 |
| `CritOnHitRateEnhance` | `ExtraResist`（**负值 = 更容易被暴击**）| Step 6 分母侧的"抗暴击" | 木棍人被动的核心机制 |
| `TotalDamageEnhance` | `ExtraTotalDamage` | **Step 12** 全局伤害增幅 | 增伤总系数 |
| `SkillDamageEnhance` | 技能 config 的 `ExtraSkillPower += BaseSkillPower × X/10000` | Step 8 技能威力 | 加技能伤 |
| `NormalDamageEnhance` | 普攻 config 的同上 | Step 8 普攻威力 | 加普攻伤 |
| `TypeDamageEnhance[LumiType]` | 对特定属性攻击时叠加 | Step 12 前后（属性维度）| "对火系伤害 +50%" |
| `TotalOnHitEnhance` | 承伤方的 `ExtraTotalOnHit` | **Step 13** 承伤增强/减免 | 承伤总系数 |
| `TypeOnHitEnhance[LumiType]` | 对特定属性受击时叠加 | Step 13 前后 | "被火系伤害 -30%" |
| `AttackSpeedEnhance` | 不改 ConfigCombat.Extra，改 `AttackTime` 计算 | 不影响单次伤害，改 DPS | 攻速 buff（详见下节）|
| `SkillCostChange` | `ExtraSkillCost` | Skill 消耗 Mana，非 02 章 | 减蓝技能 |
| `HealthSteal` | `ExtraHealthSteal` | **Step 15** 后 AfterAttack 时消费 | 吸血（[[battle-piercing-overflow]] 的姊妹机制）|
| `Piercing` | `ExtraPierce` | Step 15 后 LumiHealthEvent 时消费 | **队内溢出**（不是穿防御，见 memory）|
| `SkillPowerChange` | `ExtraOnHit`（**给"下次挨的一击"**）| Step 13 特殊修正 | 反直觉：这是**给受击方**的 buff |
| `AttackDamageLock` | `ExtraOnHitAtkFlow` | Step 14 普攻伤害锁 | 普攻最低伤害保底 |
| `FirstSkillChange[ValueType, Num]` | 第一技能各字段（威力/暴击/等）| 因 ValueType 而异 | "首个技能加成" |

**读法**：拿到一个 buff 配表，先看它填了哪几个 `*Enhance` 字段，直接跳到 02 章对应 Step 就知道它数学上怎么进入伤害公式。

---

## ModifyAttackSpeed 精确公式（解答 01 章 unknown）

**代码位置**：`BuffComponent.cs::134` `ModifyAttackSpeed(long sourceTime)`

```
newAttackTime = sourceTime / (1 + Σ AttackSpeedEnhance_i / 10000)
```

**关键规则**：
1. 只有 `ConstantType == Constant` 的 buff 参与（**Trigger 型的 `AttackSpeedEnhance` 不生效**！——这是坑）
2. **多个 buff 是加法叠加**（`totalEnhance += ...`，不是相乘）
3. 带 `ConditonIndex != 0` 的 buff 要过 `ConditionSystem.CheckConditions` 才计入
4. **触底**：结果送进 `CombatComponent.CanAttack` 会跟 `MinAttackIntervalMs=150` 取 `Max` 兜底
5. `speedOffset` 会被写进 `LumiEntity.SetSpeedOffset` 供客户端做动画速度修正

**数值示例**：
- 单个 +50% 攻速 buff（`AttackSpeedEnhance=5000`）：`newTime = 2000 / 1.5 = 1333ms`
- 两个 +50% 攻速 buff（`AttackSpeedEnhance=5000` 各一）：`newTime = 2000 / (1 + 10000/10000) = 2000 / 2 = 1000ms`（加法叠加，不是 `2000 × 0.5 × 0.5 = 500`）
- +100% 攻速（`AttackSpeedEnhance=10000`）叠加 -30%（`= -3000`）：`newTime = 2000 / (1 + 7000/10000) = 2000 / 1.7 ≈ 1176ms`

**边界防护**：如果 `totalEnhance <= -10000`（例如策划配了 -12000 或多个减速叠满），分母 `1 + totalEnhance/10000 <= 0` 会导致除以 0 或负数攻击间隔。**代码没做防护 by design**，靠**策划规范**约束（策划 2026-09-11 确认："有约定不能配到 -10000"）—— 单条 + 累加都不能触到 -10000。即使万一越界，后置 `Math.Max(GetAttackTime(), 150)` 会兜底夹到 150ms，功能不崩但语义丑；这条兜底**不该依赖**，配表规范才是第一道防护。

**回填给 01 章**：01 的 unknowns 里 🟡 P1「ModifyAttackSpeed 具体实现」→ **加法累加、`sourceTime / (1 + total/10000)` 公式、只 Constant 型生效**。可以标已解决。

---

## 叠加规则（同 ID 覆盖升级，不同 ID 独立并存）

**代码路径**：`BuffComponent.CanAddBuff`（595~618）+ `AddBuff`（621~）

判定逻辑：

```
CanAddBuff(buffId, buffLv):
  if m_activeBuffs.ContainsKey(buffId):   ← 已有同 buffId
    return OnlyLevelChange                ← 走升级路径（IncreaseLevel）
  else:
    if IsImmuBuff(buff):
      return false（免疫拦截）
    return Normal                         ← 走新建路径
```

**关键结论**：

| 场景 | 服务端行为 |
|---|---|
| **同 buffId 再次添加** | 走"**等级相加、时长覆盖**"（策划 2026-09-11 确认 + 代码印证）—— 见下方 §叠加规则详解 |
| **不同 buffId 添加** | 独立并存，各自在 `m_activeBuffs` 里占一个槽位 |
| **升级到 Lv=0 或负** | `IncreaseLevel` 内部会触发移除（`Buff.cs::108` 的 `if (Level == 0) entity.RemoveBuff`）|
| **免疫命中新添加** | `IsImmuBuff` 返回 true → `AddBuff` 直接放弃（原有 buff 不受影响）|

### 叠加规则详解（等级相加 + 时长覆盖）

**代码印证**（`BuffComponent.cs::567~568`，注释直接是策划设计原文）：

```csharp
existingBuff.IncreaseLevel(...,buffLv,frameTime);   //buff升级       ← Level += levelIncrease
existingBuff.ExtendDuration(duration,frameTime);    //buff时间覆盖    ← Duration 刷新
```

**规则拆解**：

1. **Level 是"增量"，不是"目标等级"** ⚠️（大坑！）
   - `IncreaseLevel` 内部是 `Level += levelIncrease`（`BuffBase.cs::95`）
   - 配 `AddBuff` 时传入的 `BuffLv=1` 意思是 **"再加 1 层"**，不是"设置到 Lv1"
   - 例：身上是 Lv2，AddBuff 传 `BuffLv=1` → 变成 Lv3（不是回到 Lv1）
   - 策划为**每层都需要单独配 BattleBuff 条目**（Lv1/Lv2/Lv3 各自一行 `TbBattleBuff.Get(buffId, Level)`），因为升级后要用累计 Level 查表拿新配置
   - 有 `BuffIdMax` / `BuffIdMin` 做 clamp，越界夹到边界

2. **Duration 是"覆盖"**（`ExtendDuration`）
   - 每次升级后 `Duration = 新配置的 duration + 当前 frameTime`
   - 相当于"从现在起再持续 duration ms"，**原来还剩多久都作废**
   - 效果：反复挂同 buffId 不会掉层
   - 即使不涉及升级（`BuffLv=0`? 待验证），策划期望的语义是 duration 重置

3. **升级触发的行为**：
   - `MBuffConfig` 换成 `TbBattleBuff.Get(buffId, 新累计 Level)` 的新配置
   - 触发 `OnEnter`（跟首次添加一样）
   - 触发 `Addbuff` / `AddbuffTo` 事件
   - 若新等级 RemoveCondition 从 0 → 非 0，**补注册**触发点（老代码没这个 case 就跳过）
   - Level 变 0 → 直接 RemoveBuff（可用于"扣层数移除"，例如 `BuffLv=-1` 就是减层）

**没有的机制**：
- ❌ 没有"独立叠层"（同 buffId 多份并存互不干扰）—— 需要靠**多个不同 buffId** 或 **BuffLv 升级**表达
- ❌ 没有"续时不刷新"选项 —— 想做"叠层不刷新"要用不同 buffId 组合

**设计启示**：
- 想要"3 层 debuff 才必暴击"（木棍人 case）：用 `BuffLv` 表达层数，升级到 Lv3 触发 RemoveCondition 消耗
- 想要"debuff 挂上就不会掉"（例如 boss 持续处于中毒态）：只要**攻击方期间反复挂**，每次 duration 都会刷新
- 想要"计数 buff 长期保留但不刷新时长"：用两个 buffId（一个纯计数固定 duration，一个每次挂时长归零）

---

## 免疫机制（3 层过滤）

**代码位置**：`BuffComponent.IsImmuBuff`（771~807）

添加 buff 时的免疫检查链：

```
CanAddBuff → IsImmuBuff(newBuff)：
  遍历自身所有 activeBuff：
    ① cfg.ImmuBuffType.Contains(newBuff.BuffType)   ← 类型免疫
    ② cfg.ImmuBuffId == newBuff.BuffId              ← ID 免疫
    ③ 上面命中后，若免疫 buff 有 ConditonIndex → 再过条件
  → 任意一个 activeBuff 命中且过条件 → 免疫成功，放弃添加
```

**几个反直觉的点**：
1. **免疫是"防新加"，不是"清除已有"**：只在 `AddBuff` 入口拦截；已在身上的 buff 不受新加的免疫 buff 影响
2. **免疫可以带条件**：`ConditonIndex != 0` 的免疫 buff 只在条件满足时生效（例：低血量时免疫控制）
3. **免疫依赖攻击目标**：`IsImmuBuff` 内部要拿 `GetAttackIngTargetMaster()`，**target 为空时直接返回 false**（不免疫）—— 濒死换宠瞬间无目标可能穿透免疫，官方文档 §八已标为已知限制
4. **BuffSync 效果绕过免疫**：策划用 `BuffSync` 效果做强同步时故意不走 CanAddBuff（BuffComponent.cs::700 注释）

**分析视角**：给某个 boss 配"控制免疫"时，如果这个 boss 有替补 / 会换宠 / 会濒死，考虑加个 `TriggerCondition=SwitchUp` 的 Constant buff 而不是"预设" —— 因为免疫依赖有目标。

---

## 触发时机对照表（跟 02 章伤害流程的时序）

从**分析者**视角看，`buff-system.md` §5 的表可以重排成"一次攻击链路里 buff 依次触发"的顺序，跟 02 章 15 步公式对齐：

```
攻击方 A 对防御方 B 造成一次普攻/技能伤害

┌─ ①  BuffTrigger.BeforeAttack   在 A 上触发   （对应 02 章 Step 1~7 之前）
├─ ②  BuffTrigger.BeforeOnHit    在 B 上触发   （B 的"受击前"响应）
│
├─ ③  AllConstantBuffUpdate      双方全部 Constant 生效
│       ↓
│       ConfigCombat.Extra* 全部就绪
│
├─ ④  CalculatesDamage           02 章 15 步公式跑完，得 AttackResult
│
├─ ⑤  TakeDamage (含 SetFinalRealChangeHp)     执行伤害
│
├─ ⑥  BuffTrigger.AfterAttack    在 A 上触发   （吸血在这里消费 —— 见 [[02-damage-formula]] Step 15 后）
├─ ⑦  BuffTrigger.AfterOnHit     在 B 上触发
│       ↓
│       B 若因此死亡 → BuffTrigger.Die 在 B 上触发
│       A 若因此击杀 → BuffTrigger.Defeat 在 A 上触发
│
└─ ⑧  EventHealthUpdate 事件 → BattleWorldEntityEvent.LumiHealthEvent
        贯穿在这里消费（[[battle-piercing-overflow]] 已详述）
```

**跨章交叉引用价值**：写 06-passives-triggers 时可以直接把这个顺序当作被动技能的触发点定义。写 04-skills 时用于回答"技能命中的哪一段触发什么"。

**⚠️ AfterAttack 早于 AfterOnHit**（官方文档 §八已强调）：这是配 RemoveCondition 时最容易踩的时序陷阱。

---

## 子系统边界：Trap / MagicEnvir / Armor / TrainerSkill

这些是**跟主 buff 系统并列的独立组件**，不是 buff 的子类，但都通过 `BattleEffect` 系统跟 buff 互操作：

| 系统 | 代码位置 | 关系 | 触发方式 |
|---|---|---|---|
| **主 Buff** | `Component/Buff/` | 主角 —— 挂在 LumiEntity 上 | 事件 / Tick / Always |
| **陷阱 Trap** | `Component/Trap/` | 挂在 **BattleWorldEntity**（战场级），不属于任何 lumi | 进场触发（TrapComponent.OnEnter/TrapTargetMatcher）；配置格式独立于 buff 表 |
| **场地 MagicEnvir** | `Component/MagicEnvir/` | 挂在 BattleWorldEntity（战场级）；层级 1~3 | 特定条件下持续影响双方（如全场加伤） |
| **护盾 Armor** | `Component/Armor/` | 挂在 LumiEntity | `CombatComponent.CanHitDamage` 里查，护盾没破就 `attack.m_FinalRealDamage = 0` |
| **训练师技能 TrainerSkill** | `Component/TrainerSkill/` | 玩家级，一场战斗一次性资源 | 通过 `EventManaUpdate` 累积能量 |

**它们与主 buff 的互操作**：
- 陷阱触发时通过 `EffectHandlerComponent.ApplyEffect` 走同一套 `BattleEffect` 分发链（`AddBuff` / `ChangeHp` 等）
- 场地效果也走同一套 Effect
- **官方文档专章**：陷阱 = `battle-trap-*.md`（3 篇），场地 = `spell-field-system.md`，训练师技能 = `trainer-skill-logic.md`

**分析者提醒**：分析某个 lumi"打对面 -30% 血"这类效果时，别只看 buff 配表 —— 可能是被动挂的陷阱 / 场地推的 Effect / 训练师技能触发，链路完全不同。查代码时先看效果来源的 `ActiveSkill`→`ActiveSkillConfig.ExtraEffectList`→`BattleEffect.EffectType`，然后再决定去哪个系统查具体行为。

---

## 木棍人 case 的补充解读（分析视角）

官方文档 §7 已经把机制讲完了。从**平衡分析**视角额外看：

**触发条件与瓶颈**：
- 需要**普攻命中 3 次**才积满一层 → 攻速快的 lumi（AttackTime 短）**触发频率高**，配这类被动的强度上限被攻速决定
- 每次积满仅**下一次**任何来源的攻击必暴击 → **前排群体输出可以蹭这个必暴**（不局限于木棍人自己打出）
- **RemoveCondition 是 AfterOnHit**：只要 B 挨一下就消耗；如果 B 没被攻击就一直保留

**理论 DPS 提升粗算**：假设木棍人 5v5 目标，普攻 AttackTime=2000ms，暴击伤害 = 1.5× 基础（服务端默认见 [[02-damage-formula]] Step 6），则每 6s 给敌方一次必暴机会：
- 若这 6s 内敌方吃到 2 次攻击（1 次必暴 + 1 次正常），暴击增益贡献约 (0.5 × 1) / 2 = **25% 额外伤害**（保守）
- 若这段时间团队打 4 次以上，必暴增益被稀释到 **~12%**

**平衡观测建议**：木棍人应该出现在**低攻速队伍 / 单挑目标场**的胜率显著高于**攻速堆叠队 / 群攻场**的对局。可用 battle_end 日志按"队伍属性组合"×"是否包含木棍人"分桶做胜率对比。

---

## Unknowns（新增）

1. 🟡 **P1**：**`IncreaseLevel` 是否重置 `Duration`？** 官方文档只说"MBuffConfig 更新为新等级配置"，代码 `BuffBase.OnEnter` 会不会重跑 `Duration = configDuration + frameTime`？影响"续时/覆盖"策略。
2. 🟡 **P1**：**`AttackSpeedEnhance` 累加下界**：策划配 `-12000` 或多个减速叠满会崩吗？代码没有防护，只有 `Math.Max(150)` 后置兜底 —— 是否需要在 `ModifyAttackSpeed` 里加 `clamp(totalEnhance, -9999, +inf)`？
3. 🟢 **P2**：**免疫的"清除已有"版本**：目前只拦新加；有没有需求做"清扫已有同类型 buff"？（要看具体设计意图；服务端 `RemoveBuffType` 效果可以做到，只是不是免疫路径）

---

> 最后验证于 commit `8d59ed518`（分支 OB-dev），日期 2026-09-11
> 关键代码：`BuffComponent.ModifyAttackSpeed`（134~191）· `CanAddBuff`（595~618）· `IsImmuBuff`（771~807）· `AllConstantBuffUpdate`（跟随 02 章）
> 核心策划文档：`battle/docs/buff-system.md`（本章的信息主源，本章是分析视角的补充+跨章交叉引用）
