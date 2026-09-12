# 08 · AI 行为系统

> 🎯 **本章的三个核心问题**：
> 1. **谁在打 AI？**（真人 / 掉线支援 / Bot / 冒险敌人 / 道馆敌人，都靠同一套 AI 底层）
> 2. **AI 强度怎么定？**（4 级枚举 + 段位映射 + 关卡表覆盖 + 每 Lumi 特化脚本）
> 3. **AI 每 tick 做什么决策？**（BanPick → 换宠 → 技能 → 训练师 → 普攻 五段管线）
>
> **AI 强度不"随机"**——线上任何 AI 局都是特定难度等级 + 特定行为规则，可以精准复现。

---

## 一、AI 系统总览

服务端 **一切非真人操作** 都走 `battle/GamePlay/Battle/BattleSupport/` 的 AI 系统，包括：

| 场景 | 谁被 AI 接管 | AI 载体类 | 触发点 |
|---|---|---|---|
| **Pve 关卡的敌方** | 敌方 PlayerEntity（`IsReallyPlayer=false`）| `SimpleBattleAi` | 每 tick step 4 |
| **天梯离线镜像**（`playerType=2`）| 镜像 PlayerEntity | `SimpleBattleAi` | 同上 |
| **玩家掉线支援 AI**（真人挂机）| 真人 PlayerEntity | `PlayerSupport` | 同上 |
| **PVE 玩家自己开 AI**（`PVEPlayerAiOnOff`）| 真人 PlayerEntity | `PlayerSupport` | 同上 |
| **BanPick 阶段 Bot 选人** | 敌方 PlayerEntity | 走 `AiUtils.TryBanPickLogic` | BanPick 三阶段 |

**统一入口**：`SupportMgr.UpdateSupport()`（每 tick 在 `BattleWorker.BattleLoop` 里跑，见 [[01-battle-tick]] step 4）
- 遍历所有 `SimpleBattleAi` → `UpdateTickAI(tick)`
- 遍历所有 `PlayerSupport` → `UpdatePlayerSupport(tick)`

**核心区别**：`SimpleBattleAi` vs `PlayerSupport`（**Lumi 分派逻辑完全相同！**）：

| 维度 | SimpleBattleAi | PlayerSupport |
|---|---|---|
| 用于 | 非真人玩家（Bot / 镜像 / Pve 敌人） | 真人玩家（掉线支援 / 主动开 AI） |
| AI 等级来源 | 上游注入 `battleAiLevel`（由 `GetInitAiLevel` 算） | **固定 `BattleAILevel.Top`** |
| 判断能否跑 | `m_battleAiEnable && m_canBattling` | `m_enable && m_attack_enable && m_canBattling` |
| tick 节流 | `> MinAttackIntervalMs × 2 = 300ms` | `> MinAttackIntervalMs = 150ms` |
| 真人玩家来抢救 | ❌ | 支持"启用/禁用"开关 |
| **BuildLumiLogics 逻辑** | **两者代码 100% 一样**（都是 `m_ai > 0 用 CommonAiLogic，否则用等级 AI`） | 同左 |

**关键代码**：
- `SupportMgr.cs::InitSupport(240~283)` —— 玩家分类入口，决定给谁挂 SimpleBattleAi 还是 PlayerSupport
- `SimpleBattleAi.cs` / `PlayerSupportLogic.cs` —— 两种载体
- `AiUtils.cs` —— 具体操作原子（TryAttack / TryUseSkill1 / TryUseSkill2 / TryUseTrainer / ActionChangeLumi 等）

---

## 二、AI 分派决策树（每只 Lumi 独立决定用哪个 AI）

⚠️ **关键澄清**：**AI 是每只 Lumi 独立选的**，不是"每玩家一个"。同一个玩家名下 3 只 Lumi 可能用 3 种不同 AI —— 换宠时 AI 自动切换到新上场 Lumi 的 logic。

**代码**：`SimpleBattleAi.BuildLumiLogics(48~58)` / `PlayerSupportLogic.BuildLumiLogics(50~60)` **完全同源**

```csharp
foreach (var lumi in player.m_children_lumi)
{
    var logic = lumi.m_ai > 0                       ← 特化 AI 判定
        ? TryCreateCommonLogic(lumi.m_ai)           ← 有 UseAi → 走 CommonAiLogic 脚本
        : CreateLevelLogic(defaultLevel);           ← 无 UseAi → 走 4 级等级 AI

    m_lumiLogicMap[lumi.Id] = logic ?? CreateLevelLogic(defaultLevel);
    //                          ↑ TryCreateCommonLogic 失败（表里查不到）也会回落到等级 AI
}
```

### 分派决策图

```
Lumi 战斗开始
   ↓
lumi.m_ai > 0？
   ├─ 否 → CreateLevelLogic(defaultLevel)
   │       └─ SimpleBattleAi：用 SupportMgr.GetInitAiLevel 算出的等级
   │       └─ PlayerSupport：固定 Top 级
   │
   └─ 是 → TryCreateCommonLogic(lumi.m_ai)
            ├─ TbAIAct.GetOrDefault(m_ai) 查得到？
            │   └─ 是 → CommonAiLogic 特化脚本
            │   └─ 否 → 回落到等级 AI（防脏配表兜底）
            └─ ✅ 走特化脚本
```

### `lumi.m_ai` 字段来源

- **字段定义**：`LumiEntity.m_ai`（`LumiEntity.cs::49` 注释："ai_id：对应 NodeAct 表 Id，> 0 时 SimpleBattleAi 会为该 lumi 创建 CommonAiLogic"）
- **初始化**：`m_ai = lumiStartElem.UseAi`（LumiEntity.cs::322）
- **协议来源**：`BattleStartLumiElem.UseAi`（proto）—— **上游业务服在创建战斗时决定给每只 Lumi 传什么 ai id**
- **典型分布**：
  - 玩家自己的 Lumi 通常 `UseAi=0` → 走等级 AI
  - 机器人 / Pve 敌人的 Lumi 由业务服从 `Monster.json` / `RobotData.json` 相关配置传入 `UseAi > 0` → 走特化脚本
  - ⚠️ **原则上**任何 Lumi 都可以配 `UseAi`，包括真人玩家的 Lumi —— PlayerSupport 的 BuildLumiLogics 一样会用（真人挂机时该 Lumi 走 CommonAiLogic 而非 Top 级）

---

## 三、AI 等级 4 级枚举

**代码**：`Config/Table/BattleAILevel.cs`

```csharp
public enum BattleAILevel
{
    Low = 1,    // 低级
    Middle = 2, // 中级
    High = 3,   // 高级
    Top = 4,    // 顶级
}
```

**4 个等级各自的 AI 类**（对应 4 个继承 `BaseAiLogic` 的子类）：

| 等级 | 类名 | 换宠 | 技能 | 训练师技能 | 普攻 |
|---|---|---|---|---|---|
| Low | `LowAiLogic` | 仅死亡切换 | **必须 100 蓝**才放 | ❌ 不会用 | ✅ |
| Middle | `MiddleAiLogic` | 仅死亡切换 | **一直尝试放** | ❌ 不会用 | ✅ |
| High | `HighAiLogic` | 死亡切换 + **属性克制主动换** | 一直尝试放 | ❌ 不会用 | ✅ |
| Top | `TopAiLogic` | 死亡切换 + 属性克制主动换 | 一直尝试放 | ✅ **会用** | ✅ |

**关键差异**：
- **Low vs Middle**：技能释放条件（Low 憋满 100 蓝才放，Middle 一直放）—— **Middle 输出效率 > Low**
- **Middle vs High**：主动换宠（High 会因属性克制主动换宠）—— **High 战术意识 > Middle**
- **High vs Top**：训练师技能（Top 会用训练师技能）—— **Top 有额外救急资源 > High**

**⚠️ 意外发现**：**Low AI 的换宠代码只到"判定应该换"就返回 true，实际没执行切换动作**（`ChangeLumiCond` 检查 `IsCounter < 10000` 后返回 true，但 `ChangeLumiAct` 中 `IsCounter` 分支的执行代码被注释掉了）。Middle/High/Top 的属性克制换宠实际有执行。**Top 和 High 的 ChangeLumi 代码 100% 一模一样** —— 差别真的只在训练师技能的使用与否。

---

## 四、AI 决策管线（每 tick 五段）

**代码**：`IBattleAiLogic.cs::BaseAiLogic.UpdateAI`（130~189）

```
每 tick 玩家 AI 触发：
   ↓
BaseAiLogic.UpdateAI(self, tick, ctx, support)
   ↓
① 环境检测
   ├─ battleGame == null → 跳过
   ├─ 战斗暂停中 → 跳过
   ├─ battleLumi == null（换人真空期）→ 跳过
   └─ logicSupport.CanBattleIng(tick) 未过 500ms 延迟 → 跳过
   ↓
② TryBanPickLogic —— BanPick 三阶段专属
   ├─ Ban 阶段：找对方"总等级最高"的阵容 ban 掉
   ├─ Select 阶段：找自己"总等级最高且未被 ban"的阵容选
   └─ Show 阶段：无操作
   └─ (如果 BanPick 期间返回 true，跳过后续)
   ↓
③ ChangeLumiCtrl —— 换宠管线（Cond → Act）
   ├─ Cond：判断"是否应该换"
   │   ├─ 死亡切换：PlayerGameType == DieLumiChanging（无条件换）
   │   └─ (High/Top) 属性克制：被克制且我有克制对方的 lumi
   └─ Act：真的执行换宠
       ├─ DieLumiChange（无 CD）
       └─ LumiChange（有 CD，见 01 章 20s）
   └─ (如果换了，本 tick 跳过后续)
   ↓
④ UseSkillCtrl —— 技能管线（Cond → Act）
   ├─ Cond：
   │   ├─ (Low) mana >= 100 才 return true
   │   └─ (Middle/High/Top) 一直 return true
   └─ Act：TryUseSkill1 —— 检查 Mana 够 + 释放条件满足才发 action
   └─ (如果技能放了，本 tick 跳过后续)
   ↓
⑤ TrainerSkillCtrl —— 训练师技能管线（仅 Top）
   ├─ Cond：Top 返回 true，Low/Middle/High 返回 false
   └─ Act：TryUseTrainer —— 4 种训练师技能各自 check + apply
   └─ (如果放了，本 tick 跳过后续)
   ↓
⑥ TryAttack —— 兜底普攻
   └─ 发 ActionType.Attack 到 battleGame（走跟真人一样的完整链路）
```

**优先级理解**：**换宠 > 技能 > 训练师技能 > 普攻**。每 tick 最多做一件"操作类"事情，其他跳过。

---

## 五、AI 等级 → 段位/关卡 映射

**代码**：`SupportMgr.GetInitAiLevel(battleType, rank, stageId)`（41~54）+ `BattleAiLevelMap`（14~24）

优先级：**关卡表 `TbGuanQiaData.AILevel` > `TbLadderRank.AILevel`（PVP）> `BattleAiLevelMap` 静态映射 > `Low` 兜底**。

### PVE 类战斗（写死映射表）

| EBattleType | AI 等级 | 备注 |
|---|---|---|
| `None` | Low | 兜底 |
| `GmTest` | Low | 测试 |
| `AdventurePve` / `AdventureCatchLumi` | Low | 冒险野怪（`catch-lumi-fight-flow.md` §201 明说）|
| `HomeBlock` / `AdvPk` | Middle | 家园解锁 / 野外 PK |
| **`GymPve`** | **High** | 道馆挑战（含无限道馆）|
| **其他**（GvgPve、TowerPve 等）| **由关卡表 AILevel 决定** | 关卡表覆盖静态映射 |

### PVP 类战斗（按 rank 段位查表）

**代码**：`SupportMgr.GetInitAiLevel` 里的 PVP 分支（58~92）

```csharp
if (battleType == EBattleType.MatchPvp)
{
    // 查 TbLadderRank 表，找 rank 最接近的档，取其 AILevel
    ...
    return ladderRank.AILevel;
}
```

**LadderRank.json 实测数据**（151 条）：

| Rank 范围 | AILevel | 段位对应 |
|---|---|---|
| **1 ~ 89** | **3 = High** | 青铜（1-30） / 白银（31-60） / 黄金（61-89 前段）|
| **90 ~ 151** | **4 = Top** | 黄金末（90）/ 钻石（91-120）/ 星耀（121-150）/ 传说（151）|

**关键结论**：**天梯从黄金后段（Rank 90+）开始 AI 就是最强的 Top 级** —— 差不多是"过了新手保护期就直接顶配"。青铜白银的 High 级只是"不用训练师技能"的差别，其他跟 Top 一样凶。这也解释了为什么天梯匹配的镜像/掉线支援这么难打。

### 关卡表覆盖（TbGuanQiaData.AILevel）

`GetInitAiLevel(battleType, rank, stageId)` 优先查 `TbGuanQiaData[stageId].AILevel`，读到就用。这意味着**每关卡可以精细调 AI 强度**（例如"新手引导关都用 Low、boss 关用 Top"）。

**PVE 关卡分析建议**：分析"某关卡通关率异常低"时，先查 `TbGuanQiaData` 的 `AILevel` 是不是配到 Top（关卡设计意图 vs 实际难度不匹配）。

---

## 六、Lumi 特化 AI 脚本（NodeAct 配表驱动）

**代码**：`CommonAiLogic.cs`（整个文件）+ `TbAIAct` / `TbAIConditionNode` 配表

### 5.1 触发条件（跟等级 AI 的分派边界）

已在 §二 §分派决策图 说明：`lumi.m_ai > 0` 时用 `CommonAiLogic(m_ai)`，否则用等级 AI。**决策粒度到 Lumi 级** —— 同一玩家的 3 只 Lumi 可能一部分走特化、一部分走等级 AI。

### 5.2 CommonAiLogic 的管线跟等级 AI 一模一样

**⚠️ 重要澄清**：CommonAiLogic 继承自 `BaseAiLogic`，跑的是**完全一样的五段管线**（BanPick → 换宠 → 技能 → 训练师技能 → 普攻兜底），只是**每段的 `Cond` / `Act` 换成了从 NodeAct 表读的策划配置**：

| 五段 | 等级 AI（LowAiLogic 等）| CommonAiLogic |
|---|---|---|
| ① BanPick | 走 `AiUtils.TryBanPickLogic`（贪心）| **同上**（继承父类兜底）|
| ② 换宠 Cond | 死亡换 + 属性克制换（High/Top）| 死亡换 `AiUtils.ShouldChangeLumi` **+** NodeAct 里 `Switch / SwitchSkill / SwitchLumi` 类 entry 的条件 |
| ② 换宠 Act | Low/Middle 走 `ActionChangeLumi(Low级)`；High/Top 走 `ActionChangeLumi(High级)` | 死亡时走 `ActionChangeLumi(**Low 级**)` ⚠️；否则跑第一个条件满足的 NodeAct entry |
| ③ 技能 Cond | Low 检查 mana=100；Middle+ 一直 true | **NodeAct 里 UseSkill 类 entry 任一条件满足即 true**；如果没配 → false |
| ③ 技能 Act | `TryUseSkill1` | 跑第一个条件满足的 NodeAct entry（可能是 `UseSkill1` / `UseSkill2` / `UseSkillAny`）|
| ④ 训练师 Cond | Top 一直 true，其他 false | **NodeAct 里 UseTrainerSkill 类 entry 任一满足即 true**；没配 → false |
| ④ 训练师 Act | `TryUseTrainer` | 跑第一个条件满足的 NodeAct entry |
| ⑤ 普攻兜底 | `AiUtils.TryAttack` | **同上**（父类兜底）|

**几个反直觉的点**：

1. **CommonAiLogic 死亡换宠强制用 Low 级** ⚠️
   ```csharp
   // CommonAiLogic.ChangeLumiAct::119
   if (AiUtils.ShouldChangeLumi(...))
   {
       AiUtils.ActionChangeLumi(..., BattleAILevel.Low, tick);   ← 硬编码 Low
       return true;
   }
   ```
   **意味着**：Lumi 死亡触发切换时，CommonAiLogic 只保底选"活着的第一个"，**不考虑属性克制**。跟 High/Top 级等级 AI（死亡换宠优先选克制目标的 lumi）相比是**退化**的。
   → 分析建议：**如果特化 AI 的 Lumi 死亡切换后接的 Lumi 属性被克制**，那是 by design 不是 bug，等级 AI 会更聪明地选。

2. **NodeAct 里没配"UseSkill 类"entry，Lumi 永远不会主动放技能** ⚠️
   - `_useSkillEntries` 是空列表 → `UseSkillCond` 恒 false → 跳过技能管线
   - 意味着：即使这只 Lumi 能量满 100 蓝，只要 NodeAct 没配 `UseSkill1/2/Any`，**永远不会放技能**
   - → 分析建议：**给某只 Lumi 配了 NodeAct 但漏了 UseSkill 类动作**，会让这只 Lumi 变成"只普攻的木桩"
   - 类似的：`TrainerSkill` 类 entry 空 → 永远不用训练师技能

3. **NodeAct 覆盖不了普攻** ✅（08 章原来的说法对）
   - `BaseAiLogic.UpdateAI` 最后一行 `return AiUtils.TryAttack(self, logicSupport.ListTargets, tick)`
   - CommonAiLogic 不 override，直接继承 → 普攻永远兜底跑
   - → 分析建议：**特化 AI 至少能保证普攻正常**，就算 NodeAct 配空也不会"完全不动"

4. **NodeAct entry 是"或"关系，按配置顺序判定**
   - `_useSkillEntries.Any(e => e.Cond(...))` —— 任一 entry Cond 满足就进 Act
   - Act 里 `foreach` 遍历，**第一个 Cond 满足且 Act 成功**的 entry 生效
   - → 分析建议：**NodeAct 配置顺序有意义** —— 排在前面的动作优先，策划配"低血用救急技能 → 常规攻击"这种优先级链要注意顺序

### 5.3 NodeAct 表结构（`AIAct.json`，共 157 条）

```json
{
  "Id": 11,
  "NodeActionList": [
    { "NodeCond": [201],      "NodeAct": 4, "ActParameter": 0 },   // 条件 201 → 用技能 1
    { "NodeCond": [301, 305], "NodeAct": 2, "ActParameter": 0 }    // 条件 301 或 305 → 技能换人
  ]
}
```

**7 种 NodeAct 动作**（`NodeActEnum.cs`）：

| 值 | 名称 | 含义 | 触发管线 |
|---|---|---|---|
| 1 | `Switch` | 换人（`ActionChangeLumiRandomActive` 随机活着的，优先克制）| ChangeLumi |
| 2 | `SwitchSkill` | 技能换人（用带 `TriggerEffect=1000` 效果的技能，达成"用技能换人"）| ChangeLumi |
| 3 | `SwitchLumi` | 换成指定 lumiId（`ActParameter` 是目标 lumiId） | ChangeLumi |
| 4 | `UseSkill1` | 用主动技能 1 | UseSkill |
| 5 | `UseSkill2` | 用主动技能 2 | UseSkill |
| 6 | `UseSkillAny` | Skill1 失败则用 Skill2 | UseSkill |
| 7 | `UseTrainerSkill` | 用训练师技能 | TrainerSkill |

### 5.4 9 种 NodeCond 条件类型

**代码**：`AiConditionFactory.cs` + `Conditions/AiConditionFactory.*.cs`

| 值 | 名称 | 含义 |
|---|---|---|
| 1 | `Counter` | 属性克制检查 |
| 2 | `ManaCheck` | Mana 阈值检查 |
| 3 | `HpCheck` | HP 阈值检查 |
| 4 | `BuffCheck` | Buff 存在检查 |
| 5 | `TrainerSkillCheck` | 训练师技能可用检查 |
| 6 | `BuffTypeCount` | Buff 类型计数检查 |
| 7 | `EnemyTrainerSkillCharge` | 敌方训练师技能充能检查 |
| 8 | `ConditionSequence` | 条件序列（组合条件）|
| 9 | `Skill2Check` | 技能 2 是否可用检查 |

**`AiConditionFactory.BuildAny`**：**多条件 OR 关系**（任一满足即触发）。这跟 buff 的 `ConditonIndex` OR 语义一致。**单个 NodeAction 的 `NodeCond[]` 数组也是 OR**（不是 AND）。想表达 AND 需要用 `ConditionSequence`（value 8）自己封装。

**表规模**：`AIConditionNode.json` 120 条条件节点，被 `AIAct.json` 157 条 NodeAct 组合使用。

### 5.5 特化 AI 的实际用途

- **道馆特殊 boss**：配"低血狂暴换宠"、"友方濒死用训练师技能"等复杂决策
- **冒险关卡 boss**：配"每 3 秒轮换技能 1 和技能 2"、"我方 Buff 满 3 层用大招"等
- **周赛/月赛机器人**（预留）：可用于打造"拟人"AI 感（下 3s 意识到自己被克制 → 换宠）
- **未上线 Lumi 的策划意图表达**：给某只 Lumi 配 NodeAct 让 AI 精准触发其被动，就能测出理论强度上限（跟"完全随机 AI"的表现差异可能 30%+）

---

## 七、AI 支援延迟与 Bot 识别

**开局延迟**：`BattleReladyTime = 500ms`（`SupportMgr.cs::32`）—— 战斗刚开始 500ms 内 AI 不动，避免"服务器一开局瞬间秒杀"（给真人反应时间）。

**Bot 玩家类型判定**：
- `playerType == 1`：**真人**
- `playerType == 2`：**离线镜像**（玩家挂机时的存档，由 AI 接管）
- `playerType == 3`：**纯机器人**（Pve 关卡的敌人）

**分析价值**：
- 分析真人玩家胜率 → 过滤 `playerType == 1`
- **观察 AI 行为规律** → 拿 `playerType == 2 / 3` 的战斗做样本
- **测试 AI 强度** → 找同 rank 段的 AI vs AI 战斗，胜率会随机分布在 40~60%（相同等级 AI 势均力敌）

---

## 八、Bot 的 BanPick 策略

**代码**：`AiUtils.TryBanLogic` + `TryChooseLogic`

**Ban 阶段**：找对面**总等级最高**（`sum(LumiElem.Level)`）的阵容 ban 掉；如果所有阵容都 0 等级，ban 第一个
**Select 阶段**：找自己**总等级最高且未被 ban**的阵容选；兜底选第一个未被 ban 的

**分析价值**：Bot 的 BanPick 策略是**贪心策略**（等级最高优先），不考虑：
- 属性克制
- 队伍协同
- 阵容变体差异

所以**真人玩家有心思配合克制阵容 vs Bot 可以稳定占优** —— 但需要玩家自己发现"我这套阵容配到 lumi 低等级但配合好，Bot 反而不 ban"。

---

## 九、AI 行为对分析的意义

### 8.1 天梯胜率分析

**筛选原则**（[[07-battle-modes]] 已有的老话）：
- **真人 vs 真人**：两边都 `playerType=1` 才算"纯竞技"胜率
- **含镜像**：`playerType=2` 出现的战斗，负方可能是被 AI 打死的 → 强度参考价值降低
- **含机器人**：`playerType=3` 出现 → 强度不可比

### 8.2 未上线 Lumi 理论强度评估

关键理解：**AI 表现下限 vs 上限**：
- **无 NodeAct 特化**（`m_ai = 0`）：走等级 AI，行为通用（Low/Middle 打个大概；High/Top 会属性换宠）
- **有 NodeAct 特化**（`m_ai > 0`）：AI 能"精准触发"被动的最佳时机 → **接近该 Lumi 的理论强度上限**

分析工作流：
1. 从 `Lumi.json` 拿到目标 Lumi 的 `m_ai`（拉表读字段）
2. 若 `m_ai > 0`：进 `AIAct.json` 看 NodeActionList → 看策划意图 → 预估强度上限
3. 若 `m_ai = 0`：走通用 AI，理论强度可能被低估 30~50%

### 8.3 关卡难度倒推

- 通关率异常低的关卡：查 `TbGuanQiaData.AILevel` 有没有配错（例如引导关配到 Top）
- Bot 特化未生效：检查 Bot 阵中 Lumi 的 `m_ai` 是否配了 `TbAIAct` 里存在的 id（不存在会 fallback 到等级 AI）

---

## 十、常见误解澄清

| 误解 | 实际 |
|---|---|
| "AI 是随机决策" | ❌ 服务端 AI **完全确定性**，同输入同输出；随机只在 `game.random.Range` 等明确调用点 |
| "AI 越难段位越低" | ❌ 反过来，段位越高 AI 越强（Rank<90 High，Rank>=90 Top）|
| "Pve 敌人都是机器人（弱）" | ❌ Pve 敌人也可能是 Top 级 AI；实际等级看 EBattleType + stageId + `TbGuanQiaData.AILevel` |
| "训练师技能是策划送的资源" | ❌ Top 级 AI 也会用训练师技能来抢救 —— 玩家碰不好会连吃暴击 |
| "属性克制换宠是 Bot 特殊技能" | ❌ 是**所有 High/Top 级 AI 的通用行为**（包括 Pve 敌方 + PVP 对手 AI + 掉线支援）|
| "换宠 CD 每个 AI 独立" | ✅ 对，跟真人一样，每个 PlayerEntity 独立 20s CD |
| "AI 会作弊无视 CD" | ❌ 完全跟真人走同一套 `MessagePlayerAction` 校验（含 Mana / CD / GameRunType）|

---

## 十一、跟其他章节的关系速查

| 想搞清 | 去看 |
|---|---|
| AI 每个 tick 具体在哪一步跑 | [[01-battle-tick]] §BattleWorker.BattleLoop step 4 |
| AI 换宠受 CD/Mana 约束吗 | [[01-battle-tick]] §换宠三种路径（跟真人一样） |
| AI 技能释放的完整链路 | [[04-skills]] §技能生命周期六步 |
| AI 攻击/技能的伤害计算 | [[02-damage-formula]]（完全跟真人一致） |
| AI 会不会触发被动 | [[06-passives-triggers]] —— 会，被动是 buff 系统自动触发的 |
| PVP 各模式是否都启用 AI 支援 | [[07-battle-modes]] §AI 支援 —— 所有 Pvp 都启用 |

---

## Unknowns（新增）

（无。本章依赖的字段/机制全部有代码印证或用户已确认。）

---

> 最后验证于 commit `1bf7b708d`（分支 OB-dev），日期 2026-09-12
> 关键代码：`SupportMgr.cs::InitSupport / GetInitAiLevel`（AI 载体分派）· `PlayerSupportLogic.cs` / `SimpleBattleAi.cs`（两种 AI 载体）· `IBattleAiLogic.cs::BaseAiLogic.UpdateAI`（五段决策管线）· `TopAiLogic.cs` / `HighAiLogic.cs` / `MiddleAiLogic.cs` / `LowAiLogic.cs`（4 级等级 AI）· `CommonAiLogic.cs`（特化 AI 脚本）· `AiUtils.cs`（TryAttack / TryUseSkill / ActionChangeLumi 等原子操作）· `AiConditionFactory.cs`（9 种条件构建）
> 表：`AIAct.json`（157 条 NodeAct）· `AIConditionNode.json`（120 条 NodeCond）· `LadderRank.json`（151 条 Rank→AILevel 映射：Rank<90=High, Rank>=90=Top）· `TbGuanQiaData.AILevel`（PVE 关卡精细调难度）
