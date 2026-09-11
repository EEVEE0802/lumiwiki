# 04 · 技能系统

> 📌 **本章导航**：技能是战斗中最复杂的一块，涉及分类、资源、生命周期、效果链、目标选择、训练师技能六大子系统。建议按顺序读，或直接跳到你要的小节。
>
> **不复述**的官方文档：
> - `battle/docs/battle-effect-system.md` — 28 种 `BattleEffectType`（技能最终执行的原子动作）
> - `battle/docs/trainer-skill-logic.md` — 训练师技能详细流程
> - `battle/docs/ilumi-condition-api-for-designers.md` — 条件系统 API

---

## 一、SkillType 分类

`ActiveSkill.json` 里每条技能有 `SkillType` 字段，954 条技能中：
- **`SkillType=1`（主动技能）**：581 条 —— 主动释放，消耗 Mana 或 HP。**每只 Lumi 战斗中有 2 个主动技能位**（Skill1 固定 + Skill2 玩家自选，见 §八）；581 条既包含每只 Lumi 的固定 Skill1，也包含所有可选 Skill2 候选池
- **`SkillType=0`（普攻）**：373 条 —— 每只 Lumi 一个普攻（固定），服务端表现为特殊的 "AttackTime + HitTimeList[0]" 技能，由 `CombatComponent.Attack()` 走 `LumiAttack` 状态机自动触发
- **`SkillType=2`（特殊技能）**：**0 条 —— 历史遗留字段，实际没在使用**（策划 2026-09-11 确认）。CLAUDE.md 里的枚举说明是过时信息。分析噜咪技能池时可以**完全忽略** SkillType=2。归 [[battle-design-evolution]] memory 的典型例证：字段留在枚举里但配表清空，跟"换宠 Mana 消耗填 0"同一套路数

⚠️ 常见误解：`SkillType=0/1/2` 跟 `SkillCost[0]=0/1/其他`（Mana/Life 形态）**是两个独立维度**：
- SkillType 是"这个技能怎么触发"（普攻 / 主动）
- SkillCost[0] 是"这个技能消耗什么资源"（Mana / Life）

---

## 二、SkillCost 三元数组解析

`ActiveSkill.SkillCost[]` 是**决定技能资源形态**的关键字段：

```
SkillCost = [ CostType, Value1, Value2 ]
              │           │         │
              │           │         └─ Life 时：所需普攻次数 N（例：5）
              │           └─────────── Mana 时：蓝耗值（例：30/50）
              │                         Life 时：HP 百分比（%，例：25 → 25%）
              └─── 0 或 1 → Mana 技能（消耗玩家蓝）
                   其他值 → Life 技能（蚀命：普攻充能 + 释放扣 HP%）
```

**代码入口**：`SkillBase.ResolveSkillKind(int skillId)`（61~78）

```csharp
var skillKind = skillConfig.SkillCost.ElementAtOrDefault(0);
return skillKind switch {
    0 => SkillKind.Mana,
    1 => SkillKind.Mana,
    _ => SkillKind.Life,
};
```

**工厂**：`SkillBase.Create(...)` 根据 `SkillKind` 返回 `ManaSkill` 或 `LifeSkill` 实例。

### 2.1 Mana 技能（默认，占绝大多数）

- **资源**：玩家 Mana（[[01-battle-tick]] 有完整 Mana 收支）
- **判定**：`ManaSkill.CanConsumeResource` 检查 `player.GetMana() >= Config.SkillCost`
- **消耗**：`ManaSkill.ConsumeResource` 里 `player.AddMana(-useMana)`（GM 免费模式除外）
- **动态调整**：`Config.SkillCost = Base + Extra + NextSkillExtra`，可被 `SkillValueChange` 或 buff 的 `SkillCostChange` 字段实时改（见 §五）
- **触底 clamp**：`Math.Clamp(cost, 0, ManaMax=100)`

### 2.2 Life 技能（蚀命型）

- **资源**：当前 Lumi 自身的 HP × HealthCostPercent%
- **充能**：`OnLumiAttackSuccess` 里 `m_currentAttackCount++`；累计到 `m_requiredAttackCount` 就可用
- **判定**：`LifeSkill.CanConsumeResource` 检查 `m_currentAttackCount >= m_requiredAttackCount`
- **消耗**：
  ```
  cost = MaxHealth × HealthCostPercent / 10000
  health.ApplyTiredDamage(cost)   ← 纯扣血，不走伤害流程，无伤害触发器
  ```
  注意用的是 `ApplyTiredDamage`（同疲劳扣血通道），**不会触发 `AfterOnHit` / `Die` 等 buff 触发器**。有底线保护 `Health >= 1`（扣不死）。
- **计数重置**：`ConsumeResource` 里 `m_currentAttackCount = 0`

**⚠️ 隐藏坑**：当 `TryLoadRuntimeParams` 因为 `cfg.SkillCost.Count < 3` 报错时（没配全参数），会 fallback 到类内魔法值 `N=5 M=25%`，等于策划配了个残缺 Life 技能会得到"半默认"行为。

---

## 三、技能生命周期六步

一次主动技能释放的完整流程（`SkillBase` 的虚方法各自 override 增强）：

```
玩家提交 UseSkill action
   ↓
BattleWorldEntity.MessagePlayerAction
   ↓ 校验 GameRunType = Battiling
LumiEntity.UseSkill(skillElem, enemys, frameTime)
   ↓ CanUseSkill 三层校验：
   ↓   ├─ 死亡 / 非在场 / skillId 非法
   ↓   ├─ CanConsumeResource（Mana / Life 派生检查）
   ↓   ├─ SkillBase.CanUse（含 Vertigo 眩晕 + CastCondition 条件）
   ↓   └─ 当前不在 LumiSkill 状态
   ↓
skillComponent.EnterUseSkill(...)   ← 记录 UseIngSkillId、切换到 UseSkill 状态
   ↓
ConsumeResource(...)                 ← 派生：扣蓝 或 重置 Life 充能
   ↓ 派发 CastSkill 事件
   ↓ 广播 EventEnterSkill（客户端播动画）
   
✨ 全场进入 UseSkill 阻塞态，表演窗口 **1s**（线上 `UseingSkillTime=1000ms`，代码兜底 3000）

   ↓ (下一个 tick，服务端等 UseingSkillTime=1000ms)
BattleWorldEntity.Update 检测超时
   ↓ 切到 UseSkillOver + 派发 EventSkillQTEOver
LumiEntity.EventSkillQteOver
   ↓ ChangeState(LumiSkill)
   ↓
LumiSkill.OnEnter                    ← 六步的开始
   ├─ Step 1: 挂 timeline 事件
   │    每个 HitTimeList[i] → 到时触发 UseSkillPer + DoUseSkill
   │    attackTime → 触发 UseSkillOverState + 回 Idle
   │
   ├─ Step 2: hitTime[i] 触发 → skillComponent.UseSkillPer(target)
   │           ↓
   │         SkillBase.OnHit(caster, target, random)
   │           ├─ 护盾处理
   │           ├─ SkillTriggerType.BeforeFirstHit（首波段）/ BeforeHit
   │           ├─ BuffTriggerType.BeforeAttack (攻) + BeforeOnHit (防)
   │           ├─ AllConstantBuffUpdate 双方
   │           ├─ CalculatesDamage → 出 AttackResult
   │           ├─ SkillTriggerType.AfterFirstHit / AfterHit
   │           └─ 若 m_attack_result_channel=0 → AfterUseSkill（回蓝钩子）
   │
   ├─ Step 3: skillComponent.DoUseSkill(target)
   │           ↓
   │         SkillBase.OnDoDamage(caster, target)
   │           ├─ myCombatComponent.DoAttack(target)  ← 应用伤害到 HealthComponent
   │           ├─ target.ChangeState(LumiHit)         ← 受击动画
   │           └─ Config.AddSkillChannelAndPower()    ← 推进到下一波段
   │
   ├─ Step 4: skillComponent.UseSkillOverState(target)
   │           ↓
   │         SkillBase.OnExit(caster, target)
   │           ├─ 主目标才触发 BuffTriggerType.EndSkill + SkillTriggerType.End
   │           └─ 清波段 (Config.ResetSkillChannel / SkillChannel=0)
   │
   └─ Step 5: skillComponent.FinalUseSkillOverState()
              ↓
            SkillBase.OnFinalExit(caster)
              ├─ 再清一次波段（多目标场景兜底）
              └─ 销毁临时 Condit 技能
   
   ↓
ChangeState(LumiIdle)                ← 回 Idle
   ↓ 全场退出 UseSkill 阻塞态，恢复 Battiling
```

关键代码：
- `LumiEntity.CanUseSkill / UseSkill / EventSkillQteOver`
- `SkillBase.OnEnter / OnHit / OnDoDamage / OnExit / OnFinalExit`
- `LumiSkill.cs::OnEnter`（timeline 事件挂钩）

**跟普攻的六步对比**：
- 普攻不消耗资源、无 QTE 阻塞、单个 hitTime、直接进 LumiAttack（[[01-battle-tick]]）
- 主动技能有 QTE 阻塞 + 多波段 hitTime + Timeline 事件

---

## 四、SkillEffect 效果触发（跟 buff 系统的桥）

**表结构**：`ActiveSkill.SkillEffect[]` 每项 = `{TriggerType, TriggerCondition, TriggerEffect}`：

| 字段 | 类型 | 含义 |
|---|---|---|
| `TriggerType` | `SkillTriggerType` 枚举 | 什么时机触发（Start / BeforeHit / BeforeFirstHit / AfterHit / AfterFirstHit / End 等）|
| `TriggerCondition` | int | 条件表 ID（走 `ConditionSystem.CheckConditions`）；0=无条件 |
| `TriggerEffect` | int | 满足条件后要执行的 `BattleEffect.EffectId` |

**在生命周期哪里触发**（跟上面六步对应）：

| SkillTriggerType | 触发点 | 代码 |
|---|---|---|
| `Start` | `SkillBase.OnEnter`（QTE 之前，玩家点技能瞬间）| `SkillBase.cs::182` |
| `BeforeFirstHit` | `OnHit` 里首波段之前（`Config.SkillChannel == 0`）| SkillBase.cs::231 |
| `BeforeHit` | `OnHit` 里每一波段之前 | SkillBase.cs::233 |
| `AfterFirstHit` | `OnHit` 里首波段之后（`IsFirstChannel()`）| SkillBase.cs::237 |
| `AfterHit` | `OnHit` 里每一波段之后 | SkillBase.cs::249 |
| `End` | `OnExit`（主目标才触发）| SkillBase.cs::294 |

**执行链**：满足 `TriggerCondition` → 通过 `LumiCombatSkillEffect` → 走 `EffectHandlerComponent.ApplyEffect` → 分发到 28 种 `BattleEffectType`（`AddBuff` / `ChangeHp` / `JumpToSkill` / …），见官方 `battle-effect-system.md`。

**典型套路**（看 `ActiveSkill_1003` 案例）：
```json
"SkillEffect": [
  {"TriggerType": 6, "TriggerCondition": 801, "TriggerEffect": 51},
  {"TriggerType": 6, "TriggerCondition": 802, "TriggerEffect": 52},
  ...
]
```
= "命中后（TriggerType=6 AfterHit），根据敌方属性（Conditions[801..805 = 火/水/草/电/…]）触发不同 buff 效果" —— 这就是 wiki 里"打不同属性有不同 buff"这类描述的服务端实现。

---

## 五、CastCondition 释放条件 + SkillValueChange 动态成本

### 5.1 CastCondition

**表字段**：`ActiveSkill.CastCondition[]` 是一个 int 数组

**判定**（`SkillBase.CanUse`）：

```csharp
foreach (var condition in Config.ActiveSkillConfig.CastCondition)
{
    if (condition == 0) continue;              // 无效项跳过
    else if (condition == -1)                  // ⚠️ 特殊值
    {
        if (lastUsedSkillId == SkillId)        // 不能连续释放同一技能
            return BattleBattleNotUseContinue;
        continue;
    }
    // 正数：查条件表
    if (!ConditionSystem.CheckConditions(condition, myCondit, enemyCondit, myCondit))
        return BattleBattleNotUseSkillCondit;
}
```

**含义**：
- `0` = 无效项（跳过）
- `-1` = **特殊值："不能连续释放同一个 skillId"**（策划配组合技时用）
- `> 0` = `Conditions[N]` 条件必须满足（走标准 ConditionSystem）

**多个条件**：AND 关系（**任一不满足就拒绝释放**）。跟 buff 的 5 组条件是 OR 关系不同！

### 5.2 SkillValueChange 动态数值修正

**表字段**：`ActiveSkill.SkillValueChange[]` 每项 = `{ValueType, TriggerCondition, ModifyType, Num}`

**7 种 ValueType 全部有代码实现**（策划 2026-09-11 确认 + 自查代码印证）：

| ValueType | 枚举值 | 修改的 ConfigCombat 字段 | 支持的 ModifyType | 影响 02 章公式哪一步 |
|---|---|---|---|---|
| `Power` | 1 | `ExtraSkillPower` | Fixed / **Percent（× BaseSkillPower）** | Step 8 技能威力 |
| `Cost` | 2 | `ExtraSkillCost` | Fixed / **Percent（× BaseSkillPower）**⚠️ | 释放消耗（非伤害）|
| `Crit` | 3 | `ExtraCrit` | Fixed / **Percent（× BaseCrit）** | Step 6 暴击率 |
| `HealthSteal` | 4 | `ExtraHealthSteal` | Fixed / **Percent（× BaseHealthSteal）** | Step 15 后吸血消费 |
| `Piercing` | 5 | `ExtraPierce` | Fixed / **Percent（× BasePierce）** | Step 15 后贯穿消费 |
| `CritMultiplier` | 6 | `CritChange` | **只支持 Fixed**（没有 Percent 分支）| Step 6 暴击伤害倍率 |
| `CounterMultiplier` | 7 | `CounterRateChange` | **只支持 Fixed** | Step 2 属性克制倍率修正 |

**处理位置分工**（同一个 SkillValueChange 有两个处理入口）：

1. **`SkillBase.UpdateSkillCost`（每帧跑）** —— 只处理 `Cost`；因为 Cost 需要每帧刷新给客户端显示"当前技能几蓝"
   - `SkillComponent.Update` → `SkillBase.Update` → `UpdateSkillCost`
2. **`LumiEntity.cs::379~431`（施法/攻击时跑）** —— 处理所有 7 种；在伤害计算前应用到 `ConfigCombat`
   - 通过 `SkillEffectByCondition` / `LumiCombatSkillEffect` 触发

**关键坑：Cost 的 Percent 基数是 `BaseSkillPower`，不是 `BaseSkillCost`**
```csharp
// SkillBase.UpdateSkillCost（第 5.2 节最初的示例代码）
Config.ExtraSkillCost += Config.BaseSkillPower * elem.Num / 10000;
```
这看起来是设计意图（Cost 变化跟 Power 成比例），但字面直觉是"跟 Cost 成比例"。策划配 Cost Percent 类型时要**用 SkillPower 的百分比**思考，不是当前 Cost 的百分比。

**典型用途**：
- "满怒（99+ 蓝）时技能只要 20 蓝" → `{Cost, Cond=SelfMana>99, Fixed, -30}`（原本 50 蓝，减 30 变 20）
- "对火系伤害额外 +30%" → `{Power, Cond=EnemyType=Fire, Percent, 3000}`
- "对手血量低于 30% 时必暴击" → `{Crit, Cond=EnemyHpPercent<30, Fixed, 10000}`
- "施法时暴击伤害提升 20%" → `{CritMultiplier, Cond=Always, Fixed, 2000}`
- "该技能对火系克制额外 +50%" → `{CounterMultiplier, Cond=EnemyType=Fire, Fixed, 5000}`

**跟 buff 的 `FirstSkillChange` 字段的关系**：`BuffComponent.cs::32~39` 有个 `SkillValueType` 处理表（Action 数组），是给 buff 的 `FirstSkillChange` 字段用的 —— **buff 也能触发 SkillValueChange 的效果**（只是通过 buff 表字段而不是 ActiveSkill 表字段）。分派逻辑一致。

---

## 六、目标选择（TargetType 三种）

**代码**：`TargetSelect.GetPlayerTargetsBySkill`

**`ActiveSkill.TargetType` 枚举**：
| 值 | 名称 | 行为 |
|---|---|---|
| 1 | `Main` | 主目标 = **对位** 玩家的场上 Lumi（同 slot） |
| 2 | `Secend` | 副目标 = **对面 slot** 的另一个玩家（仅 2v2 有意义）|
| 3+ | `All`（其他值都走）| 敌方 Team 所有玩家的场上 Lumi |

**2v2 索敌规则**：

```
Team A                Team B
Player A0 (slot=0) ──→ Player B0 (slot=0)   Main
Player A1 (slot=1) ──→ Player B1 (slot=1)   Main
                    ┌→ Player B0 (slot=0)   Secend（如果 slot=1 释放）
                    └→ Player B1 (slot=1)   Secend（如果 slot=0 释放）
```

**降级规则**：
- Main 时 slot 对位空 → 找另一个 slot 顶替
- Secend 时另一 slot 空 → 回退到 Main
- 两个都空 → 返回 null / false

**注**：`GetPlayerSingleTargetMaster` 是**普攻/单体索敌**用的（不看 TargetType，永远选对位），跟 `GetPlayerTargetsBySkill`（按技能 TargetType 决定）不同。

---

## 七、训练师技能（TrainerSkill）

**核心概念**：玩家级一次性资源，跟 Lumi 无关。每场战斗每玩家配一个（`Cmd_HeadInfo.trainerSkillId`），可用次数由技能表决定。

**4 种类型**（`TrainerSkillType` 枚举）：

| 值 | 名称 | 效果 |
|---|---|---|
| 1 | `AddHealth` | 当前战斗 Lumi 回 30% Max HP |
| 2 | `Shield` | 给当前战斗 Lumi 上护盾 buff（`BattleDefine.ShieldBuffId=100`）—— **可挡下一次伤害** |
| 3 | `Attack` | 下一个技能造成的伤害 +100%（**切换 Lumi 后失效**）|
| 4 | `Cleanse` | 净化 Lumi 身上负面 buff |

**充能机制**（表 `TrainerSkill.json` 已确认）：
- **InitNum = 1**：开局自带 1 次可用
- **ChargeNum = 300**（4 种训练师技能统一都是 300）：**累积 Mana 变化量到 300** 才 +1 次
- **玩家 Mana 变化时累积**（`TrainerSkillComponent.PlayerManaEvent` 订阅 `EventManaUpdate`）
- **`countsForTrainerCharge=true`** 的 Mana 变化才计入（`AddMana` 的第二个参数）
  - 命中回蓝、扣蓝释放技能 → 都算
  - Buff `ChangeEnergy` 效果 → **不算**（`countsForTrainerCharge=false`）

**实战量级**：ManaMax=100，一次能量条打满 → 累积 100 变化 → 需要**打满 3 次能量条**才能充满一次训练师技能。一场普通战斗玩家能积攒 2~4 次充能 + 初始 1 次 = 一场约 **3~5 次** 训练师技能触发。

**Condition 字段**：`TrainerSkill.json` 里还有个 `Condition` 字段（50006 / 90009），走 `ConditionSystem.CheckConditions` 判断"能否释放"—— 例如某些训练师技能只在残血时才能用，具体走 [[05-buffs-debuffs]] 的 ConditionSystem 路径。

**使用**：
- 玩家主动点训练师技能按钮 → 走 `ActionType.TrainerSkill`（协议层，本知识库未展开）
- 触发 `TrainerSkillComponent.UseTrainerSkill(type)` → 按 type 分发到 `AddHealth / Shield / Attack / Cleanse` 各自的 handler
- 消耗 1 次可用次数（`ReduceNum`）

**特殊：护盾**（`SkillBase.OnHit` 里的护盾处理）：
- Lumi 身上如果有 `BuffId=100`（Shield buff），受伤前会调 `TrainerSkillComponent.UseTrainerSkill(Shield)` 消耗 1 次训练师护盾
- shield buff 的 Level 每挡一次 -1，到 0 就 pending remove
- **注意**：训练师护盾技能次数与身上 Shield buff 是两个数值，服务端会同步减

---

## 八、一只 Lumi 的 3 个技能位（普攻 + 主动1 + 主动2）

⚠️ **重要澄清**（策划 2026-09-11 确认，之前 04 章写错）：一只 Lumi 战斗中有 **3 个技能槽位**，不是"1 普攻 + 1 主动"：

| 槽位 | 字段名 | 来源 | 是否可选 | 处理组件 |
|---|---|---|---|---|
| **普攻** | `AttackId` | `Lumi.json.NormalAttack` | ❌ 固定 | `CombatComponent`（走 LumiAttack 状态机自动触发）|
| **主动技能 1** | `Skill1Id` | `Lumi.json.ActiveSkill` | ❌ 固定 | `SkillComponent.m_skill1` |
| **主动技能 2** | `Skill2Id` | `lumiData.Skill2Id`（上游传） | ✅ **玩家自选** | `SkillComponent.m_skill2` |

**代码印证**：
```csharp
// BattleLumiAttributeElem.cs::34~36
lumi.AttackId = lumiConfig.NormalAttack;    // 普攻，从 Lumi 表直接读
lumi.Skill1Id = lumiConfig.ActiveSkill;      // 主动技能 1，从 Lumi 表直接读
lumi.Skill2Id = lumiData.Skill2Id;            // 主动技能 2，上游传

// LumiEntity.cs::301+306
combatComponent.Initialize(...(uint)lumiStartElem.AttackId, ...);  // 普攻给 CombatComponent
skillComponent.Initialize(m_lumiId, lumiStartElem.Skill1Id, lumiStartElem.Skill2Id, ...);
//                                       ↑ 主动1 (固定)         ↑ 主动2 (玩家自选)
```

### 主动技能 2 的玩家自选机制

- **每只 Lumi 有一个"技能池"**（可选主动技能候选集），玩家在**该 Lumi 的图鉴页**从池中选一个作为 Skill2
- Wiki 的图鉴页展示"技能池"，玩家可以查看所有候选并选择
- **选择存在玩家账号里**（业务服存），战斗时上游服把当前选中的 skillId 传给战斗服的 `lumiData.Skill2Id`
- 同一只 Lumi 在不同玩家账号可能有**不同的 Skill2Id** —— 这就是"上游注入差异"的答案

### SkillComponent 的三份配置

**注意**：SkillComponent 只管**主动技能**，普攻不在这里。

| 字段 | 来源 | 用途 |
|---|---|---|
| `m_skill1` | `Skill1Id`（固定主动技能）| SkillComponent 的第一格主动技能 |
| `m_skill2` | `Skill2Id`（玩家自选主动技能）| SkillComponent 的第二格主动技能 |
| `TempActiveSkillConfig` | 运行时构造 | `JumpToSkill` / `ReleaseSkill` 效果动态注入的临时技能 |

**"当前用哪个"路由**：`UseIngSkillId` 记录当前正在使用的 skillId，`GetUseSkillConfig(skillId)` 按 id 路由到三份中的对应一份。

### 三个技能位的分工

- **普攻**：由 `LumiEntity.Attack` 走 `CombatComponent`（用 `m_combatConfig`）。自动触发，无 QTE 阻塞，[[01-battle-tick]] 有完整链路
- **主动 1 / 主动 2**：由 `LumiEntity.UseSkill(skillElem, ...)` 走 `SkillComponent`。玩家主动点击释放，进入 UseSkill 阻塞态（1s 表演），走六步生命周期
- **玩家 UI 上的两个技能按钮**：分别对应 Skill1 和 Skill2（Skill2 的图标/名字随玩家在图鉴选的技能变）

### 分析价值

- **同一只 Lumi 强度分析必须按 Skill2Id 分桶** —— 不同 Skill2 组合可能强度差异巨大
- **技能池覆盖度**：Wiki 分析时可以给每只 Lumi 列出"技能池所有候选" + "线上玩家选择分布"（哪个选项被最多人用），能给策划平衡参考
- **图鉴设计一致性**：Wiki 图鉴页应该展示 Skill1（固定，突出）+ Skill2 技能池（列表，可选）三种技能的完整数值
- **954 条 ActiveSkill 分布**（回看 §一）：373 条 SkillType=0 都是普攻；581 条 SkillType=1 里既包含每只 Lumi 的**固定 Skill1**，也包含**所有可选 Skill2 候选池**（所以 581 远大于"200 只噜咪 × 2"的量，是因为每只噜咪的 Skill2 池平均有 2~3 个候选）

---

## 九、跟 buff / 被动 的关系

- 技能 = **触发时机 + 效果链**（跟 buff 一样都是"触发+效果"结构，只是入口不同）
- 技能的效果最终跑到 `EffectHandlerComponent.ApplyEffect`，跟 buff 的效果走同一套 28 种 `BattleEffectType`
- **常见模式**：
  - 技能命中后（AfterHit）挂 buff → 走 `AddBuff` 效果
  - 技能命中后强制换宠 → 走 `OffBattle` 效果
  - 技能重置换宠 CD → 走 `ResetChangeCD` 效果
  - 技能给场地加术式领域 → 走 `AddBattleField` 效果

跟 [[05-buffs-debuffs]] 一起读就能全景理解"技能命中导致什么后果"。

**跟被动的关系**：被动 = 战斗开始时挂上去的 buff（[[06-passives-triggers]]）；主动技能命中时触发的效果也可以是 "AddBuff"。所以**被动和主动技能的实际效果**可以是同一批 BattleEffect，区别只在**触发时机**：
- 被动挂的 buff → 各种 BuffTriggerType 时机触发
- 主动技能 → 六步生命周期的 SkillTriggerType 时机触发

---

## 十、跟计算器的对应

wiki 侧的 `DamageCalculator.vue`（伤害计算器）覆盖了：
- SkillPower（威力）→ 直接读表
- SkillPowerList（多波次）→ 求和（近似）
- Crit / SkillCost / DefCalculate / HealthSteal / Piercing / AttackDamageLock —— 表字段一一对应

**计算器不建模的部分**（=平衡分析时手工补）：
- `SkillEffect[]` 的所有触发效果（挂 buff / 改血 / 场地等等）
- `SkillValueChange[]` 的动态成本修正
- `CastCondition` 的释放条件（假设"能释放"）
- `SkillChannel` 波段间的属性变化

这些都是 wiki 用户看不到的"上下文相关加成"，是量化伤害分析时需要用**服务端 debug log** 补齐的部分。

---

## Unknowns（新增）

1. 🟡 **P1**：**`SkillType=2` 特殊技能是否上线过？** 954 条数据 0 条命中，是废弃的字段还是留给未来"合体技/大招"设计的预留？
2. 🟡 **P1**：**`SkillValueChange` 除 Cost 外的 ValueType 是否有实现？** 目前 `UpdateSkillCost` 只处理 `Cost`。如果策划配了 `Damage / Crit` 类型是**默默失效**还是有别处兜底处理？
3. ~~🟡 **P1**：`Skill2Id` 的来源~~ ✅ 已确认：**每只 Lumi 有 Skill2 技能池，玩家在图鉴里从池中选一个，选择存在业务服**（策划 2026-09-11 确认）
4. 🟢 **P2**：**训练师技能充能阈值** —— `PlayerManaEvent` 累计 Mana 到多少算充满？TbTrainerSkill 里配的具体阈值是多少？

---

> 最后验证于 commit `8d59ed518`（分支 OB-dev），日期 2026-09-11
> 关键代码：`SkillBase.cs`（生命周期六步、CastCondition、SkillValueChange）· `ManaSkill.cs` / `LifeSkill.cs`（两种资源形态）· `SkillComponent.cs`（Skill1/2/Temp 路由）· `TargetSelect.cs`（三种 TargetType 索敌）· `TrainerSkillComponent.cs`（4 种训练师技能 + Shield buff 联动）
> 表：`ActiveSkill.json`（954 条：主动 581 / 普攻 373 / 特殊 0）
> 官方文档交叉引用：`battle-effect-system.md`（28 种 EffectType）· `trainer-skill-logic.md` · `ilumi-condition-api-for-designers.md`
