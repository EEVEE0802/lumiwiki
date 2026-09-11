# 03 · 属性体系

> Lumi 从"图鉴面板"到"战斗数值"的完整换算，是 [02-damage-formula.md](02-damage-formula.md) 的输入。所有值以**服务端**为准（客户端只做展示）。

## 一句话

战斗 4 项数值（Hp / Attack / Defstate / Fv）由 **资质 × 常量系数 × 等级修正 × 突破修正 × 性格** 五段乘积算出；**星级和"个体值/努力值"这两套宝可梦式概念在 LumiGO 里都不存在**（星级只加 buff，不改面板；资质是玩家养成前就随机固定的一个数）。

## 计算入口

- 代码位置：`battle/BattleCore/BattleSystem/BattleLumiAttributeElem.cs::GetStartLumiAttribute`
- 时机：战斗创建时，服务端根据上游下发的 `BattleStartLumiElem` 生成一份 `SNKProto.BattleLumiAttribute`，之后战斗全程用它做**基础值**（`ConfigCombat.BaseMAttack / BaseMDef`），实时叠 buff 得 `MAttack / MDef`（见 [02](02-damage-formula.md)）

## 完整公式

```
attack = int( AtkState × atkX × (1 + Σ levelFixedAtk) × (1 + Σ breakFixedAtk) × characterAtk )
def    = int( DefState × defX × (1 + Σ levelFixedDef) × (1 + Σ breakFixedDef) × characterDef )
hp     = int( HpState  × hpX  × (1 + Σ levelFixedHp)  × (1 + Σ breakFixedHp)  × characterHp  )
fv     = float( FvX × (1 + Σ levelFixedHp) × (1 + Σ breakFixedHp) )    ← 用 HP 那一列，不参与性格
```

四个字段最终写入 `BattleLumiAttribute.Hp / Attack / Defstate / Fv`；三项用 `int()` 截断，Fv 用 `float`。

## 各因子拆解

### 1. 资质（State）—— 一次性随机固定

来源：`Lumi.json` 里每只噜咪配置一段范围，玩家孵化/捕获时在此范围内随机得到"资质"。

```
MinHpState .. MaxHpState        // 例：1000 号噜咪 [56, 80]
MinAtkState .. MaxAtkState      //                 [16, 40]
MinDefState .. MaxDefState      //                 [60, 84]
MinWorkState .. MaxWorkState    //                 [64, 120]   ← 工作值，不进战斗（见下）
```

代码里叫 `hpState / attackState / defState / workState`，`BattleStartLumiElem.HpState` 等字段直接下发。**没有再做等级/突破随机加成**（不同于宝可梦的 IV/EV）。

### 2. 常量系数 —— 硬编码 in BattleDefine

`BattleDefine.cs`：

```csharp
public static double FvX  = 16.0 / 75.0;   // ≈ 0.21333
public static double hpX  = 0.8;
public static double atkX = 0.08;
public static double defX = 0.08;
```

对应 `BattleConst.json`（Id=1，字段是"系数 × 10000"）：

| 表字段 | 表值 | 除以 10000 | 代码常量 | 是否一致 |
|---|---|---|---|---|
| HP       | 8000 | 0.8      | hpX  | ✅ |
| Attack   | 800  | 0.08     | atkX | ✅ |
| Defence  | 800  | 0.08     | defX | ✅ |
| Fv       | 2133 | 0.2133   | FvX = 16/75 = 0.21333… | ⚠️ 表值只保留了 4 位近似，**代码为准** |

`BattleDefine.cs` 里注释写 "TODO 读表，表里填了但是没有导表" —— 说明表值和代码并非"表驱动"，改表不改代码不生效，**运行时以代码常量为准**。

### 3. 等级修正 levelFixed —— LumiLevel 表

来源：`LumiLevel.json`，字段 `battleState: [atk, def, hp]`。

代码 `CalcBattleState`：

```csharp
addition[idx] = 1.0 + battleState[idx] / 10000.0
```

初始 `addition = [1.0, 1.0, 1.0]`，累加后作为等级修正因子。

实测数据规律（三项相同）：

| Level | battleState[0] | levelFixed |
|---|---|---|
| 1   | 100000    | 11.0  |
| 10  | 190000    | 20.0  |
| 20  | 290000    | 30.0  |
| 30  | 390000    | 40.0  |
| 50  | 590000    | 60.0  |
| 500 | 5090000   | 510.0 |

**规律**：`levelFixed = 10 + Level`（从 Lv1 = 11 起严格线性，每级 +1.0 到 Lv500 = 510）。

这个 `+10` 的**基数是策划刻意设计**（2026-09-11 策划确认）—— 不是传统 RPG 的"Lv1 = 1× 系数"起步，而是让 Lv1 直接从 11 倍资质开始生效，避免新号数值过于贫弱。可以理解为"体感 Lv1 = 传统 Lv10"。

每级 +1.0 意味着 Lv1→Lv2 战力提升约 `12/11 ≈ +9.1%`，Lv100→Lv101 提升约 `111/110 ≈ +0.9%`（等级越高单级增益越弱）。

三项 (`atk/def/hp`) 目前完全相同（**Fv 用 HP 那一列**，见公式）。

### 4. 突破修正 breakFixed —— LumiBreak 表

来源：`LumiBreak.json`，同样 `battleState: [atk, def, hp]`，同样 `1.0 + val/10000`。

实测：

| BreakLv | battleState[0] | breakFixed | 备注 |
|---|---|---|---|
| 0   | 0         | 1.0        | 未突破 |
| 1   | 1000      | 1.1        | |
| 2   | 2100      | 1.21       | |
| 3   | 3310      | 1.331      | |
| 4   | 4641      | 1.4641     | = 1.1⁴ |
| …   | …         | …          | |
| 100 | 137750179 | 13775.0179 | ≈ 1.1¹⁰⁰ |

**规律**：`breakFixed = 1.1 ^ BreakLv`（指数增长）。

三项 (`atk/def/hp`) 目前完全相同，Fv 复用 HP 那一列。

### 5. 性格 character —— LumiCharacter 表

来源：`LumiCharacter.json`（12 种性格），字段 `Buff` + `Debuff`，每条 `{LumiFourDimension, BuffNum}`。

`LumiFourDimension` 枚举：`1=Atk, 2=Def, 3=HP, 4=Work`。

代码：

```csharp
character[dim] = 1.0
foreach buff in Buff:    character[dim] += BuffNum / 100.0    // +10% per 10
foreach buff in Debuff:  character[dim] -= BuffNum / 100.0    // -10% per 10
```

当前配置：**12 种性格 = 4 加 × 3 减**（避开自己加自己减，所以是 4×3=12），每个 BuffNum 都是 `10`（±10%）。

举例：`id=1`：`Buff[Atk]+10, Debuff[Def]-10` → `characterAtk=1.1, characterDef=0.9, characterHp=1.0, characterWork=1.0`。

> **注意**：性格 buff 里的 `Work` 只影响工作值（家园经济），战斗计算不用；但如果 buff/debuff 命中 Atk/Def/Hp，就会实际改变战斗数值。

### 6. 星级 —— 不改面板，通过 Buff 生效

代码：

```csharp
if (lumiData.StarLv > 0) {
    var starConfig = TbLumiStarUp.Get(lumiConfig.StarUpid, lumiData.StarLv)
    foreach (buffId in starConfig.Buffid):
        lumi.AddBuffs.Add({BuffId=buffId, BuffLv=1, Duration=0, Target=1})
}
```

**星级不进四项公式**，而是往 `AddBuffs`（战前预加载 buff 列表）追加对应 buff，战斗开始后由 BuffComponent 生效。这些 buff 具体加什么见 `TbLumiStarUp[StarUpid, starlv].Buffid`。

面板显示的"星级加成"属于战斗内 buff 修正，不体现在 `BaseMAttack / BaseMDef` 里。

## 特别说明

### Fv 是什么

- 全称：**Force value**（个人推断，代码里叫 Fv、`MFv`）—— 参与伤害公式作为**乘性系数**，见 [02](02-damage-formula.md) 里的公式 `baseDamage = MFv × attDifDef × ...`
- 计算方式：`fv = FvX × levelFixedHp × breakFixedHp` —— **只吃等级和突破，不吃资质、不吃性格**
- 语义：可以理解为"随等级/突破线性放大的伤害系数"，跟传统 RPG 的"力量"或"魔力"接近

> 注意：代码里 `AttackSpeedRate` 是另一个字段（攻速倍率），**不是** Fv。

### WorkState 进不进战斗？

**不进战斗数值计算**。理由：

- `GetStartLumiAttribute` 里 `WorkState` 只做了一件事：`lumi.WorkState = lumiData.WorkState`（写入协议字段透传）
- 后续伤害公式（见 [02](02-damage-formula.md)）用的是 `MAttack / MDef / MFv`，无处引用 WorkState
- 性格 buff 可以命中 Work 维度，但那个只影响家园工作产出，跟战斗无关

结论：**WorkState 是家园/图鉴用的属性，战斗只是携带元数据**。

### AttackSpeedRate / HeroQulity 从哪来

`lumi.AttackSpeedRate = lumiData.AttackSpeedRate` —— 战前由上游下发，战斗内被 `BuffComponent.ModifyAttackSpeed` 用于修改 `AttackTime` / `HitTimeList`（见 [00 概览](00-overview.md#tick-与同步节奏)）。

`lumi.HeroQulity = lumiData.HeroQulity` —— 品质字段（0/1 白 / 2 绿 / 3 蓝 / 4 紫 / 5 金 / 6 彩，见 `BattleDefine.BattleQualityMap`），影响某些技能 / 效果的判定（如"对紫品以下噜咪造成额外伤害"），本身不改四项面板。

### 弃用字段：LumiGrade（成长/突破）

`CalcPropertyState` 使用 `LumiGradeBreak / LumiGradeGrow` 表，代码保留但主流程未调用（注释 "弃用了"）。分析时**忽略**。

## 数值示例

拿 Lumi.json `Id=1000` 举例（`MinHpState=56, MaxHpState=80, MinAtkState=16, MaxAtkState=40, MinDefState=60, MaxDefState=84`），假设玩家养到 **Lv30 / Break0 / 性格 id=1（Atk+10%, Def-10%）**：

- 假设资质随机到 `HpState=70, AtkState=30, DefState=75`
- levelFixed = `10 + 30 = 40`
- breakFixed = `1.1⁰ = 1.0`
- characterAtk=1.1, characterDef=0.9, characterHp=1.0

代入：

```
attack = int(30 × 0.08 × 40 × 1.0 × 1.1) = int(105.6)  = 105
def    = int(75 × 0.08 × 40 × 1.0 × 0.9) = int(216.0)  = 216
hp     = int(70 × 0.8  × 40 × 1.0 × 1.0) = int(2240.0) = 2240
fv     = float(16/75 × 40 × 1.0)         ≈ 8.533
```

再看 **Lv50 / Break3**（其它同上）：

- levelFixed = `10 + 50 = 60`
- breakFixed = `1.1³ = 1.331`

```
attack = int(30 × 0.08 × 60 × 1.331 × 1.1) ≈ int(210.85)  = 210
def    = int(75 × 0.08 × 60 × 1.331 × 0.9) ≈ int(431.19)  = 431
hp     = int(70 × 0.8  × 60 × 1.331 × 1.0) ≈ int(4472.16) = 4472
fv     = float(16/75 × 60 × 1.331)         ≈ 17.03
```

验证方式：`GetStartLumiAttribute` 里 `_logger.Debug` 会打印每一步中间值（"资质 X 攻击系数 Y 等级修正 Z 突破修正 W 性格 V 最终值 R"），拿真实局的日志对比即可。

## 战斗中的动态属性

上面算的是 `BaseMAttack / BaseMDef / MFv` —— 战斗内**基础值**。每帧由 `BuffComponent` 生成 `ExtraMAttack / ExtraMDef` 等修正量，`ConfigCombat` 汇总为 `MAttack = BaseMAttack + ExtraMAttack`。

`ConfigCombat.ResetExtraValue()` 每次战斗事件（受击/命中）会清零 Extra，随后 buff 重新累加。**基础值不变，Extra 走 buff 系统**。这是 [02-damage-formula.md](02-damage-formula.md) 里 `myConfig.MAttack` 的确切含义。

## 关键代码索引

| 关注点 | 文件 | 实体 |
|---|---|---|
| 属性入口 | `battle/BattleCore/BattleSystem/BattleLumiAttributeElem.cs` | `GetStartLumiAttribute` |
| 等级/突破 累加 | 同上 | `CalcBattleState` |
| 常量系数 | `battle/BattleCore/BattleSystem/BattleDefine.cs` | `hpX / atkX / defX / FvX` |
| 战斗内动态 | `battle/BattleCore/Component/Combat/ConfigCombat.cs` | `MAttack / MDef / MFv` |
| 星级 buff 装配 | `BattleLumiAttributeElem.cs` | 段末的 `if (lumiData.StarLv > 0)` 块 |

## 表数据

| 表 | 用途 |
|---|---|
| `Lumi.json` | 资质范围 `MinXState / MaxXState`；`StarUpid` 指向 LumiStarUp 组 |
| `BattleConst.json` | 系数（Id=1；已跟代码硬编码交叉验证） |
| `LumiLevel.json` | `battleState[3]` 等级修正表（Lv1~500） |
| `LumiBreak.json` | `battleState[3]` 突破修正表（BreakLv 0~100） |
| `LumiStarUp.json` | `Buffid[]` 星级带来的 buff |
| `LumiCharacter.json` | 12 种性格 Buff/Debuff |

---

> 最后验证于 commit **fbb25c313**，日期 2026-09-11
> 关键代码：`BattleLumiAttributeElem.cs::GetStartLumiAttribute`, `BattleDefine.cs::hpX/atkX/defX/FvX`
