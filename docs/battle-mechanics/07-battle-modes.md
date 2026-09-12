# 07 · 战斗模式差异

> 本章聚焦：**同一套战斗内核**（前 6 章讲的 tick / 伤害 / 属性 / 技能 / buff / 被动）在不同**战斗模式**下的差异。差异主要来自：外壳（BanPick / 阵容规则 / 胜负条件 / AI 接管），不改内核。

---

## EBattleType 完整枚举

**协议定义**：`server/feature/service/proto/ProtoBase.proto::119` `enum EBattleType`
**运行时映射**：`BattleDefine.BattleRunTypeMap`（决定进 Pvp 还是 Pve 分支）

| 值 | 名称 | 含义 | PkType | BanPick 潜在 | 阵容 |
|---|---|---|---|---|---|
| 0 | `None` | 未指定（异常）| Pve | ❌ | — |
| 1 | `GmTest` | GM 测试战斗 | Pve | ❌ | 1v1 |
| 2 | `AdventurePve` | 冒险 - 遇到野怪 | Pve | ❌ | 1v1 |
| 3 | `AdventureCatchLumi` | 冒险 - 抓宠 | Pve | ❌ | 1v1（对手是野生 Lumi）|
| 4 | `HomeBlock` | 家园 block 解锁挑战 | Pve | ❌ | 1v1 |
| 5 | `MatchPvp` | 匹配 pvp | **Pvp** | ✅ | 1v1 |
| 6 | `AdvPk` | 匹配野外战斗（离线 pve）| Pve | ❌ | 1v1 |
| 7 | `MatchPvpTest` | 测试 pvp | **Pvp** | ✅ | 1v1 |
| 8 | `MatchPvp2V2` | 匹配 pvp 2v2 | **Pvp** | ✅ | **2v2** |
| 9 | `AdventureCatchLumi2V2` | 冒险抓宠 2v2 | **Pvp**（历史遗留）| ❌ 未上线 | ⚠️ **该玩法实际不存在**（策划 2026-09-11 确认历史遗留）|
| 10 | `AdvPk2V2` | 野外 PK 2v2 | **Pvp** | ⚠️ | 2v2 |
| 11 | `Pk` | 切磋（好友对战）| **Pvp** | ✅ | 1v1 |
| 12 | `MatchPvp2V2Single` | 单人 2v2（一个真人 + 一个 AI 队友）| **Pvp** | ✅ | 2v2 |
| 13 | `MatchPvpWeekContest` | 周赛 1v1 | **Pvp** | ✅（周赛核心 gameplay）| 1v1 |
| 14 | `MatchPvpMonthContest` | 月赛 1v1 | **Pvp** | ✅ | 1v1 |
| 15 | `MatchPvpWeekContest2V2` | 周赛 2v2 | **Pvp** | ✅ | 2v2 |
| 16 | `MatchPvpMonthContest2V2` | 月赛 2v2 | **Pvp** | ✅ | 2v2 |
| 17 | `GymPve` | 道馆赛 · **含无限道馆（线上当前版本）**| Pve | ❌ | 1v1 |
| 18 | `GvgPve` | 公会战 pve | Pve | ❌ | 1v1（对手是公会占领的 NPC 队伍）|
| 19 | `NfcPk` | NFC 对决 | **Pvp**（预留）| ❌ 未启用 | 1v1 · **预留字段，目前未上线**（策划 2026-09-11 确认）|
| 20 | `TowerPve` | 爬塔 · **无限道馆（开发中版本，未上线）**| Pve | ❌ | 1v1 |

**PkType 映射的意义**：`BattleGameSystem.IsBanPickBattleType()` 直接返回 `m_battleType == Pvp` —— 所以**BanPick 是否启用的前置条件就是 PkType=Pvp**。但**实际是否走 BanPick 还取决于上游传入的 `EBattleBanPickType`**（`UpdateBattleBanPickType`），不同 Pvp 模式可以配不同 BanPick 规则或关闭。

---

## Pve vs Pvp：分派点

**代码位置**：`BattleDefine.BattleRunTypeMap`（`BattleDefine.cs::313~336`）

```csharp
BattleDefine.BattleRunTypeMap.TryGetValue(battleType, out m_battleType);
```

`m_battleType` 只有两个值：**Pvp** 或 **Pve**。这个字段影响的行为：

| 分支 | Pvp | Pve |
|---|---|---|
| `IsBanPickBattleType()` | true | false |
| `BanPickComponent.Update` | 走 BanPick 流程 | 跳过 |
| 玩家 `IsBot` 认定 | `!IsReallyPlayer && Pvp` = false | `!IsReallyPlayer && Pve` = true → 标 Bot |
| Ready 阶段 | 双方真人都要发 `readyGo` 才开局 | 非真人玩家自动 Ready |
| MMR 结算 | 上游按 pvp 结果调分 | 无（Pve 不调分）|
| CanMessageNotify | `IsReallyPlayer && Pvp` → true | false（Pve 不发聊天）|

**PvE 中的 "对手"**：仍然是一个 `PlayerEntity`（`m_children_lumi` 挂敌方 Lumi），只是这个 Player 的 `IsReallyPlayer=false`、`IsBot=true`，由 `PlayerSupportLogic` 接管出招 —— 这就是**战斗内核完全一致**的原因：客户端 Bot、离线支援、Pve 敌人在服务端都是同一套"AI 接管的 PlayerEntity"。

---

## 阵容规则

**代码位置**：`BattleGameSystem.Init`（605~659）+ `BattleDefine.SlotNum = 2`

```csharp
int estimatedPlayers = teamNum * BattleDefine.SlotNum;
int estimatedLumis   = estimatedPlayers * 3;   // 每人最多携带 3 只 Lumi
```

**核心配置**：
- **一场战斗最多 2 个 Team**（1v1 / 2v2 都是 2 队）
- **`SlotNum = 2`**：每 Team 最多 2 个玩家槽位（1v1 时用 1 个）
- **每玩家 3 只 Lumi**（`m_children_lumi.Count`，硬限制）

**换宠上限**：
- **主动换宠 CD** = **20s**（见 [[01-battle-tick]]；线上 `BattleSwitchCD=20`，代码兜底 3；战略级重成本）
- **死亡切换**无 CD 但有 4.5s 等待时间
- **可换宠数**：只要还有存活的 Lumi 就能换 —— 3 只全死 → team 全灭 → `TeamAllDeadId > 0` → 战斗结束

**2v2 的槽位分布**：

```
Team 0                              Team 1
├─ Player A (真人1)                   ├─ Player C (真人3)
│   ├─ Lumi 0 (m_battle_child)        │   ├─ Lumi 0
│   ├─ Lumi 1                         │   ├─ Lumi 1
│   └─ Lumi 2                         │   └─ Lumi 2
└─ Player B (真人2)                   └─ Player D (真人4)
    ├─ Lumi 0                             ├─ Lumi 0
    ├─ Lumi 1                             ├─ Lumi 1
    └─ Lumi 2                             └─ Lumi 2
```

- 2v2 对位：`Player A ↔ Player C`，`Player B ↔ Player D`（不能跨对位）
- 只有各玩家的 `m_battle_child`（当前场上 Lumi）参与"当前普攻回合"
- 12 只 Lumi 总数、每玩家独立换宠 CD、Mana 独立
- 属性一致加成 / 被动 / buff 在**队伍级别** 是可以互相波及队友的（`SelfAll` / `EnemyAll` / `EnemyFriend` Target）

**MatchPvp2V2Single（单人 2v2）**：一个真人 + 一个 AI 队友。AI 队友是 **Player 层** Bot，出招走 `PlayerSupportLogic`（Top 级 AI）。

---

## 胜负判定

**代码位置**：`BattleWorldEntity.Isover`（799~822）

```csharp
public bool Isover(TeamEntity teamEntity)
{
    if (Over) return true;
    if (BanPick 期间) return false;   // BanPick 阶段不判死亡

    if (TeamAllDeadId > 0 && GameRunType != UseSkill && != UseSkillOver)
    {
        // 等技能表演完成才判负
        SendEvent(EventOverGame, GetTeam(TeamAllDeadId));
        return true;
    }
    return false;
}
```

**核心逻辑**：**某个 Team 全部 Lumi 都死 → 该 Team 判负**。**无回合数上限**，只有 [[01-battle-tick]] 的 5min 总时长兜底（`MaxGameTotalTime` 或关卡表 `BattleTime`）。

**几个反直觉细节**：
1. **技能表演期间不结算**：`UseSkill / UseSkillOver` 期间即使 team 全灭也等技能演完，`Isover` 才返回 true
2. **BanPick 期间不判死亡**：`BattleIsInBanPickIng` 期间 Lumi 不会真死（BanPick 阶段本来也没打）
3. **判负粒度是 Team 不是 Player**：2v2 时**一个 team 里的一个玩家全灭不算负**，要**整个 Team 4 只 Lumi × 2 玩家 = 6 只全死才算负**

**超时判胜**：走 `BattleWorker.BattleLoop` 的超时分支 `NotifyBattleOverLogic`。超时后的胜负规则不在战斗内核里，是上游业务侧决定的：
- 天梯 / 匹配：算平局或按总剩余血量比较（具体规则见业务服）
- 周赛：三负出局最高 15 胜 —— 单场超时按业务规则算，通常剩血多者胜
- 道馆：达成条件（例如打过 boss）就算胜，超时通常算失败

**疲劳判胜**：`TiredScheduler` 在 `ResolvedBattleTiredTime` 后每 interval ms 给双方每只 Lumi 扣血。持续到某一方全灭 → 走标准 `TeamAllDeadId` 判负流程。

---

## BanPick 流程（Pvp 专属）

**组件**：`BanPickComponent`（`battle/BattleCore/Component/BanPickComponent/BanPickComponent.cs`）
**详细分析**：官方文档 `battle/docs/banpick-create-battle-flow.md`

**三个 RunType 阶段**（`BattleGameRunType` 11~13）：
1. `BanBanFormation` (11)：ban 阶段，双方各禁选对方阵容里的 Lumi
2. `BanSelectFormation` (12)：select 阶段，双方从剩余可用池中选自己出战阵容
3. `BanPickReadyToFight` (13)：展示阶段，公布双方最终阵容

**每阶段时长**（从 `BattleDefine`）：
- `PvpBanTime` = `TbGlobalConst.PvPBanTime`（默认 10000ms）—— ban 阶段
- `PvpSelectTime` = `TbGlobalConst.PvPSelectTime`（默认 10000ms）—— select 阶段
- `PvpShowTime` = `TbGlobalConst.PvPShowTime`（默认 10000ms）—— show 阶段
- **总共 30 秒** BanPick 流程

**BanPick 与阵容规则的关系**：
- 玩家进入 BanPick 时携带的可选 Lumi 池由上游服决定（不是"玩家所有 Lumi 都能选"，而是**这场战斗允许的候选池**）
- BanPick 结束后确定的出战阵容才注入 `player.m_children_lumi`

**关闭 BanPick**：上游服创建战斗时传 `EBattleBanPickType.None`，跳过 BanPick 直接进 `Ready` → `Battiling`。也就是说**并非所有 Pvp 战斗都跑 BanPick**（例如"切磋"可能配置为不 BanPick）。

**BanPick 期间的死亡判定**：跳过 `Isover`（见上），因为 BanPick 阶段 Lumi 还没上场也不会死。

---

## AI 支援 / 助战机制

**代码入口**：`SupportMgr.UpdateSupport`（每 tick step 4 在 `BattleWorker.BattleLoop` 里跑）→ `PlayerSupport.UpdatePlayerSupport` / `SimpleBattleAi.UpdateTickAI`

**核心机制**：**所有** `PlayerEntity` 都可能挂 AI 载体（`PlayerSupport` 或 `SimpleBattleAi`）。触发条件：
- `IsReallyPlayer == true`（真人）→ 挂 `PlayerSupport`，玩家可以自己控制启用/禁用（掉线时接管）
- `IsReallyPlayer == false`（Bot / 镜像 / Pve 敌人）→ 挂 `SimpleBattleAi`

**AI 等级**（**随段位/关卡变化，见 [[08-ai-behavior]] §五 完整映射**）：
- **PlayerSupport（真人挂机）**：固定 `BattleAILevel.Top`
- **SimpleBattleAi（非真人）**：走 `SupportMgr.GetInitAiLevel(battleType, rank, stageId)`
  - PVE 类：按 `BattleAiLevelMap` 静态表（`GymPve` → High，`HomeBlock` / `AdvPk` → Middle，冒险 → Low）；关卡表 `TbGuanQiaData.AILevel` 可覆盖
  - PVP 类：按 `TbLadderRank.AILevel` 查 rank → **Rank 1-89 = High，Rank 90+ = Top**

**每只 Lumi 独立选 AI**（**决策粒度是 Lumi，不是玩家**，见 [[08-ai-behavior]] §二）：
```csharp
foreach (var lumi in player.m_children_lumi)
{
    var logic = lumi.m_ai > 0 
        ? TryCreateCommonLogic(lumi.m_ai)      // NodeAct 特化脚本（CommonAiLogic）
        : CreateLevelLogic(defaultLevel);       // 4 级等级 AI
    m_lumiLogicMap[lumi.Id] = logic;
}
```

`lumi.m_ai` 来源于 `BattleStartLumiElem.UseAi`（由上游服创建战斗时注入；机器人/野怪表 `Monster.json` → 见 wiki `robot-teams` 页数据链路）。**普通玩家 Lumi `m_ai = 0`**，走等级 AI。

**决策管线**（`BaseAiLogic.UpdateAI` 五段）：
1. **环境检测 + 索敌**（`TargetSelect.GetPlayerSingleTargetMaster` 拿当前主目标）
2. **BanPick 判定**：仅 BanPick 三阶段跑（贪心策略：ban 对方总等级最高、选自己总等级最高）
3. **换宠管线**：Cond → Act，含死亡切换 + High/Top 属性克制主动换
4. **技能管线**：Cond → Act，`TryUseSkill1` / `TryUseSkill2`
5. **训练师技能管线**：Cond → Act（仅 Top / NodeAct 有配的会用）
6. **普攻兜底**：以上都不触发时 `AiUtils.TryAttack`

**启动延迟**：`SupportStartTimeOut = 500ms` —— 战斗刚开始 500ms 内 AI 不出招，避免"开局瞬间秒杀"（也给真人玩家一个反应时间）。

**分析价值**：
- **玩家胜率分析**去人机干扰：判定 `playerType == 1` 就是真人；`2` 是离线镜像（AI 接管）；`3` 是机器人。见 [[01-battle-tick]] 里"人机对局筛选"逻辑
- **未上线 Lumi 强度评估**：如果配了 `m_ai != 0` 的专属脚本，AI 会**精准触发被动最佳时机**（比木棍人被动 3 次积满 → 队友群攻蹭必暴），线上出场时表现会跟"完全随机 AI"差异巨大 —— 详见 [[08-ai-behavior]] §六

---

## 各模式的差异速查表

| 模式 | 玩法核心 | 阵容 | BanPick | 特殊 |
|---|---|---|---|---|
| **天梯 MatchPvp** | 匹配 1v1 | 1v1 × 3 lumi | 通常开 | MMR 上分；`playerType=1` 真人，`=2` 离线镜像 |
| **天梯 2v2 MatchPvp2V2** | 匹配 2v2 | 2v2 × 3 lumi | 通常开 | 2v2 内玩家协同出招 |
| **周赛 WeekContest** | 每周开放 3 负出局 | 通常 1v1 | ✅ 核心机制 | 仅真人（`player_type=1`），无镜像；胜利上限 15 |
| **月赛 MonthContest** | 每月 | 1v1 / 2v2 | ✅ | 与周赛类似 |
| **切磋 Pk** | 好友对战 | 1v1 | 可选 | 无 MMR，无奖励 |
| **道馆 GymPve** | Pve 关卡 | 1v1 | ❌ | 敌方是 NPC 队伍（Monster.json），可能配特殊 AI |
| **家园 HomeBlock** | 家园解锁 | 1v1 | ❌ | 特殊胜利条件由关卡配 |
| **公会战 GvgPve** | 公会 vs NPC | 1v1 | ❌ | 关卡 stageId 决定敌方队伍 |
| **无限道馆 InfinityGym** | 挑战无限楼层 | 1v1 | ❌ | ⚠️ **版本迁移中**：**线上当前版本走 `GymPve=17`（跟普通道馆共用 EBattleType）**，靠 stageId 区分；**开发中版本改为独立 `TowerPve=20`** |
| **冒险 AdventurePve / CatchLumi** | 探图遇怪 | 1v1 | ❌ | CatchLumi 有捕获逻辑，见 `catch-lumi-fight-flow.md` |
| **AdvPK（野外 PK）** | 匹配野外遇到玩家 | 1v1 / 2v2 | 可选 | 类似天梯的简化版 |
| **NFC PK** | 线下扫码对战？| 1v1 | ⚠️ 不确定 | 少见模式 |

**"无限道馆"跟 EBattleType 的对应关系**（策划 2026-09-11 确认）：**版本迁移中**！
- **线上当前版本**：无限道馆**复用 `GymPve = 17`**，跟"普通道馆赛"共用 EBattleType，靠**上游服的 stageId** 区分。这就是为什么 wiki 侧参与走势的 `daily/infinity-gym/*.csv` 需要**上游服基于关卡 id 打分片**，不能直接按 EBattleType 拿
- **开发中版本**：无限道馆改为**独立 `TowerPve = 20`**，未来上线后 CSV 数据源可以直接按 EBattleType 分流

**数据分析警示**：
- 当前分析线上数据时，**不能只看 EBattleType=17 就判定为"普通道馆"** —— 里面混着"无限道馆"
- 需要跟 `TbGuanQiaData.LevelType` 或 `stageId` 范围联合判定
- 未来版本上线后，CSV 拉取脚本要**升级** SQL —— 从"按 stageId 判定"改为"按 EBattleType 直接分"，否则会漏数据

**"助战"**：更多是**玩法机制**（玩家能触发助战 AI 帮忙 / 好友借将），不是独立的战斗类型。

---

## 疲劳（Tired）机制

**开启条件**：`BattleGameSystem.TiredFunction = true`（由 `BattleManager.CreateNewGame` 注入）

**参数**（`GlobalConst.json` 线上值已确认）：
- `BattleTiredTime` = **120000ms（2min）** —— 战斗打到 2 分钟进入疲劳（关卡表 `BattleTire` 可覆盖）
- `BattleTiredIntervial` = **500ms** —— 每 0.5 秒扣一次
- `BattleTiredDamage` = **250 万分比 = 2.5% MaxHP/次** —— **不是固定血量**！代码 `dmg = MaxHealth × 250 / 10000`

**行为**：疲劳阶段每 500ms 双方每只 Lumi 扣 2.5% MaxHP → **每秒 5% MaxHP** → 满血 Lumi 约 **20 秒** 见底。1HP 兜底不致死，需要普攻/技能真正击杀。走 `HealthComponent.ApplyTiredDamage`（纯写字段，不触发 buff/事件）。

**追帧上限**：`TiredMaxCatchUpPerTick = 8`（防卡帧后一次性追补太多 tick 雪崩）

**哪些模式启用**：由上游服的 `BattleManager.CreateNewGame` 调用决定；一般 **PvP 类型**都会开（否则天梯拖时长毫无意义），**PvE 类型** 通常关或者按关卡配。

**同步字段**：`m_syncBattleWorldElem.IsTired`（客户端 UI 提示进入疲劳阶段）

---

## Unknowns（新增）

1. 🟡 **P1**：`E_BATTLE_TYPE_AdventureCatchLumi_2v2 = 9` 映射到 Pvp（`BattleRunTypeMap`），但"抓宠"本质是 Pve —— 是不是纯为了走 2v2 阵容代码复用？如果是，Pvp 分支的 MMR/CanMessageNotify 行为在这里会不会漏出问题？
2. ~~🟡 **P1**：疲劳阶段的**具体默认参数**~~ ✅ 已自查 GlobalConst.json 解答（2min / 500ms / 2.5% MaxHP）
3. ~~🟢 **P2**：`NfcPk = 19` 在线上有实际用例吗？~~ ✅ 已确认：预留字段，目前未启用（策划）
4. 🟢 **P2**：**"无限道馆"** 具体走哪个 EBattleType？`InfinityGym` 没有直接对应枚举，可能是 `GymPve(17)` 或 `TowerPve(20)`。参与走势里我们看到 `daily/infinity-gym/{date}.csv` 有独立事件流，说明上游服区分了这个玩法 —— 但战斗服层面用的是哪个类型？

---

> 最后验证于 commit `8d59ed518`（分支 OB-dev），日期 2026-09-11
> 关键代码：`BattleDefine.BattleRunTypeMap`（Pvp/Pve 分派）· `BattleGameSystem.IsBanPickBattleType`（185~188）· `BattleGameSystem.Init`（605~659 阵容/超时/疲劳）· `BattleWorldEntity.Isover`（799~822）· `PlayerSupportLogic.cs` / `BaseAiLogic.cs`（AI 支援 5 段管线，详见 [[08-ai-behavior]]）
> 协议：`server/feature/service/proto/ProtoBase.proto::119` `enum EBattleType`
