# 01 · 战斗节奏（Tick 心跳 / 普攻 CD / 技能释放 / 换宠 / 阻塞态）

> ⚠️ **不是回合制**。LumiGO 是**半即时制**：服务端权威，按 `Tick=60` 次/秒推进；两边同时打；玩家操作面只有 **释放技能 / 换宠 / BanPick**。宝可梦回合制那套"轮到我 → 轮到你 / 换宠免费一击 / 速度决定顺序"在这里都不成立。

---

## 一图流：一个 Tick 里发生了什么

```
BattleWorker.BattleLoop  ── 每 Worker 独立单调时钟，每 tick(60ms) 触发一次
   │
   ├─ 1. WorkerMonotonicTimer.Update()            推进本 Worker 时钟
   ├─ 2. 排空消息队列 (drain m_messageQueue)      玩家下行 action / 上游消息
   ├─ 3. notifyStopBattle()                        已结束战斗收尾
   ├─ 4. m_supportMgr.UpdateSupport()             人机/掉线支援 AI 决策 → 转成 Attack/Skill action 入队
   └─ 5. foreach battle on this Worker:
        │
        ├─ BattleGameSystem.Update(deltaTime)
        │    ├─ m_battleWorldEntity.Update()
        │    │    ├─ 判胜负 (Isover)
        │    │    ├─ ProcessPendingSwitches()           异步换人排队
        │    │    ├─ WaitChangeLumi 计时           BattleSwitchTime=1000ms 后放行
        │    │    ├─ ProcessPendingReleaseSkills()      待释放技能排队
        │    │    ├─ DieChangeLumi/BuffChangeLumi 计时  DieLumiChangeTime≈4500ms 到期 OverTimeChangeLumi
        │    │    ├─ UseSkill 计时                UseingSkillTime=1000ms 到期 → UseSkillOver + 派发 EventSkillQTEOver
        │    │    ├─ MagicEnvir/BanPick 组件 Update
        │    │    └─ EffectHandler.TickDelayEffects()   延迟效果调度
        │    ├─ foreach team → team.Update(deltaTime)
        │    │    └─ foreach player → PlayerEntity.Update
        │    │         ├─ PlayerLogicUpdate()           消费 CachedAction（缓存过的 Attack/Skill）
        │    │         ├─ m_battle_child.Update()       Buff/Skill 组件 tick、Timeline 事件调度
        │    │         └─ 后备 Lumi 也 Update
        │    └─ m_tiredScheduler.Update()               疲劳阶段追帧扣血
        │
        ├─ m_clientSingletonMgr.OnUpdate()              可运行状态才跑
        ├─ 检查总时长超时 → NotifyBattleOverLogic
        └─ serverFrameTime > m_last_sync_tick + 50ms
             └─ SyncBattleData(...) → NotifyBattleStateSnapshot 广播差分快照
```

关键代码：
- `battle/BattleCore/BattleSystem/BattleGameSystem.cs::Update`
- `battle/BattleCore/Entity/BattleWorldEntity.cs::Update`（824~905）
- `battle/BattleCore/Entity/PlayerEntity.cs::Update`（1066~1085）
- `battle/BattleCore/Entity/LumiEntity.cs::Update`（1425~1454）
- `battle/ARCHITECTURE.md § 4.1`

---

## 常量参考（BattleDefine.cs）

| 常量 | 值（默认）| 来源 | 说明 |
|---|---|---|---|
| `Tick` | 60（硬编码默认，可被 BattleGServer 覆盖）| 硬编码 | 每秒 tick 次数；帧长 ≈ 16.7ms（旧注释 60ms 已过时）。**客户端渲染是 30 帧**，服务端 tick 实际频率待 debug log 反推（可能 30/60）|
| `SyncTime` | 50 ms | 硬编码 | 快照下发节流：每 50ms 最多推一次 |
| `MinAttackIntervalMs` | 150 ms | 硬编码 | **普攻绝对下限**：即使 buff 无限拉攻速也不能低于 |
| `MaxGameTotalTime` | 5 × 60 × 1000 = 300000 ms | 硬编码 | 总时长上限；关卡表可覆盖为 `TbGuanQiaData.BattleTime` |
| `DieLumiChangeTime` | 3500 + `BattleDeathTime`(≈1000) ≈ 4500 ms | 常量+表 | 死亡切换等待时间（死亡表演 + 玩家选切换） |
| `BattleSwitchTime` | **1000 ms** ⚠️（代码兜底 3000）| `BattleSwitchTime` | 换人动画封锁时长（**线上 1s，不是 3s**）|
| `UseingSkillTime` | **1000 ms** ⚠️（代码兜底 3000）| `BattleQTETime` | 主动技能表演窗口（服务端整个战场阻塞态；**线上 1s，不是 3s**）|
| `GameReadyWiatTime` | 15000 ms | 硬编码 | 战斗准备阶段超时 |
| `ChangeLumiCd` | **20000 ms（20s）** ⚠️😱（代码兜底 3000）| `BattleSwitchCD` × 1000 | 主动换宠冷却（每玩家独立）——**线上 20s，不是 3s！战略级重成本** |
| `ChangeLumiMana` | **0**（代码兜底 30）| `BattleSwitchMana` | 主动换宠**不扣蓝**（配表填 0，历史遗留 [[battle-design-evolution]]）|
| `BattleTiredTime` | **120000 ms（2min）**（代码兜底 0=禁用）| `BattleTiredTime` | 疲劳阶段开始时刻 |
| `BattleTiredIntervial` | **500 ms** | `BattleTiredIntervial` | 疲劳扣血间隔 |
| `BattleTiredDamage` | **250**（**万分比 = 2.5% MaxHP**）| `BattleTiredDamage` | 每次扣血 = `MaxHealth × 250 / 10000`；变量名 `m_damagePerMyriad`；每秒 5% MaxHP，满血 Lumi 约 20s 见底（夹底 1HP 不致死）|
| `BattleHaveQte` | **false**（关闭）| `BattleHaveQte` | 是否启用 QTE 音游玩法（当前关闭）|
| `PvpBanTime` / `PvpSelectTime` / `PvpShowTime` | 10000 ms 各 | 同名字段 | BanPick 三阶段各 10s |
| `ManaMax` | 100 | `BattleMaxMana` | 玩家能量上限（**能量是玩家级**，不是 Lumi 级） |
| `BuffDefaultTime` | 30000 ms | 硬编码 | Buff 默认持续时间 |
| `SlotNum` | 2 | 硬编码 | 每 Team 玩家槽位（1v1=1 Team×1 Slot；2v2=1 Team×2 Slot） |

⚠️ 注意：Tick 是**运行时可被 BattleGServer 按 worker 配置覆盖**的（见 `BattleDefine.cs` 头部注释），线上实际值可能不是 60。可以通过日志里 `deltaTime` 的间隔反推。

🚨 **重要提醒：代码兜底值 ≠ 线上值**！代码里 `ConfigMgr.tables != null ? tbl.X : 兜底` 这种模式，兜底只在读表失败时用。上表**"线上值"是从 `GlobalConst.json` 实际配表读的**，是权威。之前 01 章多个常量误抄兜底值，本次已修正。教训见 [[battle-config-vs-code-default]] memory。

**换宠 20s CD 的战略意义**（策划确认）：换宠是**战略级重成本** —— 每 20 秒才能换一次！几乎意味着**主动换宠一场战斗最多 1-2 次**。这跟宝可梦"随时换宠"的直觉完全不同。真正的换宠机会主要来自**死亡切换**（免费）。

---

## 战斗大流程状态（BattleGameRunType）

一场战斗从 `Init` 到 `Over` 会经过一系列 `BattleGameRunType`。这个状态记在 `BattleGameSystem.m_mGameRunType`，**决定当前 tick 里普攻/技能/换宠是否能执行**：

| 值 | 名称 | 含义 | 普攻能跑吗 | 技能能下吗 | 换宠能下吗 |
|---|---|---|---|---|---|
| 0 | `None` | 初始 | ❌ | ❌ | ❌ |
| 1 | `Ready` | 战斗准备（`GameReadyWiatTime=15000ms` 内等玩家 readyGo）| ❌ | ❌ | ❌ |
| 2 | `Battiling` | **正常战斗中** | ✅ | ✅ | ✅ |
| 3 | `DieChangeLumi` | 某玩家死亡等待切换 | ❌（全场停）| ❌ | 只该玩家 DieLumiChange |
| 4 | `BuffChangeLumi` | Buff 强制换宠触发（如 OffBattle）| ❌（全场停）| ❌ | 强制 |
| 5 | `WaitChangeLumi` | 换宠动画封锁窗口（BattleSwitchTime=1000ms 内）| ❌ | ❌ | ❌ |
| 6 | `WatiDieChangeLumi` | 死亡切换等待中的中间态 | ❌ | ❌ | ❌ |
| 7 | `UseSkill` | 某玩家释放技能表演中（UseingSkillTime=1000ms 内）| ❌（全场停）| ❌（同时只允许一个）| ❌ |
| 8 | `UseSkillOver` | 技能表演结束帧 | ❌ | ❌（同 tick 会切回 Battling）| ❌ |
| 11~13 | BanPick 三阶段 | 周赛 ban / select / show | ❌ | ❌ | ❌ |
| Over | `Over` | 战斗结束 | ❌ | ❌ | ❌ |

**关键设计**：技能释放期间**全场普攻停摆** —— 一方玩家按技能时对方也不能打，等 QTE / 表演结束才恢复。这跟"MOBA/ARPG 的 GCD"是两种不同的模型：LumiGO 里技能=中断双方的展演时间，输赢完全看展演本身的效果结算。

阻塞态判定的两处代码：
- `CombatComponent.Attack`：直接检查 `gameRunType == DieChangeLumi / BuffChangeLumi / UseSkill / UseSkillOver / WaitChangeLumi` 就 return 不打
- `PlayerEntity.CanExecuteCached`：CachedAction 排队时同一份门禁

---

## Lumi 状态机（LumiIdle / LumiAttack / LumiSkill / LumiHit / LumiDie）

每只 Lumi 有自己的 FSM，独立跑（见 `battle/BattleCore/Fsm/` + `StateGraphs/LumiState/`）：

```
LumiIdle ─── ChangeState(LumiAttack) ── OnEnter 安排两个 timeline 事件
   ▲                                       │  hitTime  → combat.Attack()：伤害判定
   │                                       │  attackTime → ChangeState(LumiIdle)
   │                                       ▼
   └───────────────────────────────────  LumiAttack

LumiIdle ─── ChangeState(LumiSkill) ── OnEnter 安排多段 timeline 事件
   ▲                                       │  每个 HitTimeList[i] → UseSkillPer + DoUseSkill
   │                                       │  attackTime → 结算 UseSkillOverState + ChangeState(LumiIdle)
   └───────────────────────────────────  LumiSkill
```

关键理解：
- **LumiAttack 里的 `attackTime` 就是普攻的整个周期**（前摇 + 后摇）：hitTime 前摇触发伤害，attackTime 后回到 Idle
- 所以 `CombatComponent.CanAttack` 的判定「距离上次 `StartAttack` 时间 > AttackTime」自然跟 LumiAttack → LumiIdle 的时序对齐
- **多段普攻**（`ActiveSkillConfig.HitTimeList` 有多个）目前 `LumiAttack` 只用 `HitTimeList[0]` 单段；只有 `LumiSkill` 走完整多段
- **一个 Lumi 同一时刻只能在一个状态**：Attack 中不能再 Attack（也不能 Skill）；技能中同样

关键代码：
- `battle/BattleCore/StateGraphs/LumiState/LumiAttack.cs`
- `battle/BattleCore/StateGraphs/LumiState/LumiSkill.cs`
- `battle/BattleCore/Component/Combat/CombatComponent.cs::CanAttack`

---

## 普攻的完整链路（谁触发？）

⚠️ **反直觉但重要**：服务端 tick **不自动帮玩家打普攻**。普攻需要**外部下发 `ActionType.Attack`**，服务端只负责校验 + 执行。链路：

📜 **历史原因**（策划 2026-09-11 确认）：最早设计像宝可梦 GO 一样**需要玩家手动点普攻**，后来改成自动普攻。**底层协议还是"手发"的形式，只是程序（客户端 UI / Bot AI）会自动帮玩家发**。这就是"看起来自动、实际上是每帧 action 下发"的由来 —— 不是奇怪设计，是设计演进留下的分层结构。见 [[battle-design-evolution]] memory。

### 真人玩家

```
客户端 UI ── 每帧检测「攻击 CD 到了」→ 发 CS Message(ActionType.Attack, LumiUid, TargetsUid)
    ↓  (走 BizBridge → NATS → Worker 队列)
BattleWorker.BattleLoop  drain 队列 → BattleWorldEntity.MessagePlayerAction
    ↓
 校验 mMGameRunType == Battiling（阻塞态时返回 BattleActionError）
    ↓
 PlayerEntity.PlayerMessageAction → ActionLumiAttack
    ↓
 m_battle_child.Attack(enemys, frameTime)
    ↓
 CanAttack → CombatComponent.CanAttack   ← 这里判 CD (frameTime - LastTimestamp > actualInterval)
    │  失败：可能被 SetCachedAction 缓存下来（客户端不用重发，服务端会在 tick 里重试）
    ↓
 ChangeState(typeof(LumiAttack)) → OnEnter → Timeline 挂 hitTime & attackTime 事件
    ↓
 (下一次 tick 到 hitTime) → combatComponent.Attack() 造成伤害
    ↓
 (到 attackTime) → 回 LumiIdle，下次 Attack action 可通过
```

### 人机 / 离线支援（PlayerType=2/3）

```
BattleLoop.step 4：m_supportMgr.UpdateSupport(...)
    ↓
 PlayerSupportLogic / AiUtils 决策：这个 Lumi 该打普攻还是放技能
    ↓
 直接调 battleGame.m_battleWorldEntity.MessagePlayerAction(uid, ActionType.Attack, actionData, tick)
    ↓
 后续跟真人链路一致
```

关键代码：
- `battle/BattleCore/Entity/BattleWorldEntity.cs::MessagePlayerAction`（407~550）
- `battle/BattleCore/Entity/PlayerEntity.cs::ActionLumiAttack`（787~790）
- `battle/BattleCore/Entity/LumiEntity.cs::Attack`（1315~1347）
- `battle/GamePlay/Battle/BattleSupport/PlayerSupportLogic.cs`（AI 支援出招）
- `battle/GamePlay/Battle/BattleSupport/AiUtils.cs::207`（Bot 出招）

### CachedAction 兜底机制

真人操作有 `BattleCacheTime` 缓存：如果玩家下 Attack 时被阻塞态（如对方正释放技能）挡下，action 会缓存进 `PlayerEntity.m_cachedAction`，每 tick 由 `TryConsumeCachedAction` 尝试重放，直到成功或超时清空。这就是"技能表演结束瞬间双方连续攻击"的服务端表现来源。

关键代码：`PlayerEntity.cs::TryConsumeCachedAction`（952~990）+ `CanExecuteCached`（993~1020）

---

## 普攻 CD 精确公式

在 `CombatComponent.CanAttack`：

```csharp
long actualInterval = Math.Max(GetAttackTime(), BattleDefine.MinAttackIntervalMs);
if (frameTime - LastTimestamp > actualInterval)
    return ErrorCode.ErrorOk;   // 可以再打
return ErrorCode.BattleSkillInCd;
```

- `GetAttackTime()` = `BuffComponent.ModifyAttackSpeed(m_combatConfig.AttackTime)` —— buff 会改的**是普攻整周期**
- **下限 150ms** —— 攻速再猛也压不下去
- **上限**没有——原始 AttackTime 由 `ActiveSkill.json` 表配

**攻速 buff 公式**（详见 [[05-buffs-debuffs]] §ModifyAttackSpeed）：

```
newAttackTime = sourceTime / (1 + Σ AttackSpeedEnhance_i / 10000)
```

- **多个攻速 buff 加法叠加**（不是相乘）
- 只有 **Constant 型** 的 buff 生效；Trigger 型即使填了 `AttackSpeedEnhance` 也不进累加
- 带 `ConditonIndex` 的 buff 要过条件才计入

数值示例（`m_combatConfig.AttackTime = 2000ms`）：
- 无 buff：2000ms 打一次
- 单个 +50% 攻速 buff（`AttackSpeedEnhance=5000`）：`2000 / 1.5 ≈ 1333ms`
- 两个 +50% 攻速 buff 叠加（加法：+100%）：`2000 / 2 = 1000ms`（不是 `2000 × 0.5 × 0.5 = 500`！）
- +100% 攻速 + -30% 减速：`2000 / (1 + 7000/10000) ≈ 1176ms`
- 极端叠满攻速：**触底 150ms 打一次**

---

## Mana 系统（玩家能量）

**关键设计**：能量是**玩家维度**，不是 Lumi 维度。同一玩家换宠后能量不重置。

### 数值边界

- `ManaMax = 100`（表 `BattleMaxMana`）
- 上下限硬 clamp：`PlayerEntity.AddMana` 里 `>= 100 clamp 100`，`<= 0 clamp 0`

### 涨能量的来源

| 时机 | 数值 | 代码 |
|---|---|---|
| **普攻命中后** | `+ ActiveSkillConfig.AddEnergy`（该 Lumi 普攻技能的表配 AddEnergy）| `LumiEntity.AfterAttack` |
| **主动技能命中后** | `+ 该主动技能表配的 AddEnergy` | `LumiEntity.AfterUseSkill` |
| **BuffEffect ChangeEnergy** | 效果参数配 | `EffectHandlerComponent.cs::1158/1166` |

从服务端语义看：**回能靠打**（命中 → 涨蓝）。挨打不回能（未看到相关代码）。

### 消耗能量的来源

| 时机 | 数值 | 代码 |
|---|---|---|
| **主动技能释放** | `SkillCost = BaseSkillCost + ExtraSkillCost + NextSkillExtraSkillCost`（clamp 到 [0, 100]） | `ConfigCombat.SkillCost` + `ManaSkill.ConsumeResource` |
| **主动换宠** | **0**（不扣蓝，只吃 CD）| 见下方 📜 历史原因 |
| **Buff Effect ChangeEnergy(负值)** | 效果参数配 | 同上 |

📜 **换宠为啥有个"扣蓝"入口却不扣蓝**（策划 2026-09-11 确认）：**最早设计换宠是消耗能量的**，后来改成"CD 而非能量"，**底层没改，只是把配表 `BattleSwitchMana` 填成 0**（`GlobalConst.json:411`），同时 `PlayerEntity.ActionLumiChange` 里 `AddMana(-BattleDefine.ChangeLumiMana)` 那行也被注释掉。所以：
- `BattleDefine.ChangeLumiMana` 常量 `= 30` 只是"表读不到时的兜底默认"（`ConfigMgr.tables != null ? tbl.BattleSwitchMana : 30`），线上实际从表读到 0
- 相当于双重保险：即使表被误改回非 0，`AddMana` 那行注释掉也不会真扣

见 [[battle-design-evolution]] memory 记录的通用模式：LumiGO 战斗系统里"设计改了但底层结构保留"是常见套路，遇到这种"看着有实际不用"的常量/调用点先查历史再当 bug。

---

## 换宠三种路径

| 触发 | 门禁 | 消耗 | 阻塞态 |
|---|---|---|---|
| **主动换宠**（`ActionType.LumiChange`）| 距上次换宠 ≥ `ChangeLumiCd=20000ms`；且换的是当前 `m_battle_child` | **20s CD**，不扣蓝（设计演进遗留，见 Mana 段）| 进 `WaitChangeLumi` → `BattleSwitchTime=1000ms` 阻塞后自动回 `Battiling` |
| **死亡切换**（`ActionType.DieLumiChange`）| 当前 Lumi 已死 | 无 CD 无 Mana | 进 `DieChangeLumi` → 超时（`DieLumiChangeTime≈4500ms`）自动 `OverTimeChangeLumi` 选血最高的 |
| **Buff 强制换**（OffBattle 效果）| Buff 触发 | 无 | 进 `BuffChangeLumi`，模式 0=玩家选、模式 1=服务端选血最高、模式 2=选血最低 |

关键代码：
- `PlayerEntity.CanChangeLumi`（708~720） —— 主动换宠 CD 校验
- `PlayerEntity.ActionLumiChange`（797~830）
- `PlayerEntity.OverTimeChangeLumi`（669~）
- `BattleDefine.ValidateOffBattleParam` —— OffBattle 效果三个 mode

---

## 战斗超时判定

**总时长上限**：`ResolvedBattleTotalTime`（关卡表 `BattleTime` > 全局 > `MaxGameTotalTime=300000ms`）。

判定入口在 `BattleWorker.BattleLoop` step 5：`battleGame.Update` 之后检查是否超时，走 `NotifyBattleOverLogic`。

超时后的胜负判定策略跟表配相关（关卡类型不同规则不同），本章不细化，见 07-battle-modes。

**疲劳阶段**（线上参数已确认）：
- 战斗打到 **2 分钟**（`BattleTiredTime=120000ms`）进入疲劳
- 每 **500ms**（`BattleTiredIntervial`）扣一次血
- 每次扣 **MaxHealth × 2.5%**（`BattleTiredDamage=250` 万分比，代码里 `dmg = MaxHealth × 250 / 10000`）
- **每秒 5% MaxHP**，满血 Lumi 从疲劳开始约 **20 秒** 见底（1HP 兜底不致死）
- 追帧单 tick 上限 `TiredMaxCatchUpPerTick=8` 次防雪崩
- **不触发**任何 buff / 事件（`ApplyTiredDamage` 是纯写 Health 字段的隔离通道，见 `HealthComponent.cs::175`）

**平衡启示**：进疲劳后**双方都在快速掉血**，谁血多谁赢，但如果双方都健康，20 秒内会有一方先见底（其他 Lumi 也在同步掉血）—— 疲劳节奏之凶，实际很少能拖过 3 分钟。

关键代码：`BattleGameSystem.Init`（605~651）+ `TiredScheduler.cs`。

---

## 边界与坑

| 场景 | 行为 | 出处 |
|---|---|---|
| **hitTime ≥ attackTime**（配表错） | `LumiAttack.OnEnter` 兜底 `attackTime = hitTime + 150`；`LumiSkill.OnEnter` 兜底 `+200`。会打 error log | LumiAttack.cs::48-52 |
| **buff Vertigo（眩晕）** | `CanAttack` 直接返回 `BattleLumiInVertigo`，普攻停 | CombatComponent.cs::162 |
| **AttackTime 被 buff 乘到极小** | `MinAttackIntervalMs=150ms` 兜底 | CombatComponent.cs::170 |
| **技能中试图再点技能** | `CanUseSkill` 检查 `CurrentState == LumiSkill` 返回 `BattleInSkillIng` | LumiEntity.cs::1250 |
| **QTE 期间对方点技能** | `MessagePlayerAction` 门禁：`Skill` 也要求 `Battiling` 才通过 | BattleWorldEntity.cs::472 |
| **换宠 CD 里再点换宠** | `CanChangeLumi` 返回 `BattleChangeLumiInCd` | PlayerEntity.cs::713 |
| **死亡切换超时未选** | `OverTimeChangeLumi` 自动选血最高的存活 Lumi | BattleWorldEntity.cs::875 |
| **战斗准备超时**（15s 内没 readyGo） | Worker 主循环走超时结束 | ARCHITECTURE.md §4.1 |
| **同一 tick 内先 Attack 后 Attack** | 第二次 CanAttack 会挂 CD（`LastTimestamp = frameTime`），不重入 | CombatComponent.cs::210 |
| **Bot / 支援 AI**（PlayerSupport） | 每 tick step 4 走 `m_supportMgr.UpdateSupport`；`SupportStartTimeOut=500ms` 延时启动，避免开局刚创建就打 | BattleDefine.cs::62 |

---

## 与常见误解澄清

| 误解 | 实际 |
|---|---|
| "回合制，速度决定谁先" | ❌ 半即时制，各自独立 CD，同时打；无"速度属性" |
| "换宠免费第一击"（宝可梦规则） | ❌ 换宠只有 CD/Mana 约束，敌方对该玩家的普攻不因你换宠而停 |
| "服务端 tick 会自动帮玩家打普攻" | ❌ 需要客户端发 `ActionType.Attack`；服务端只在收到 action 时才让你打。**Bot 玩家由 `PlayerSupportLogic` 代发**（历史遗留：最早是手动普攻，后来自动化但底层协议保留手发结构）|
| "技能是玩家操作，普攻是自动的" | 半对：普攻的**下发**也是"操作"（客户端每帧检测发 action）；只是 UI 上表现为自动 |
| "能量是每只 Lumi 独立的" | ❌ **能量是玩家维度**，换宠继承 |
| "普攻越快能量越多" | 对：`AfterAttack` 每次命中 += `AddEnergy`；攻速快 → 单位时间命中多 → 蓝涨得快 |
| "主动换宠要 30 蓝" | ❌ **早期设计**要 30 蓝，现在改成只吃 20s CD 不扣蓝（表 `BattleSwitchMana=0`；`AddMana(-30)` 那行也注释掉了）|
| "主动换宠 CD 3 秒" | ❌ **是 20 秒！** 代码里 `? tbl.BattleSwitchCD * 1000 : 3 * 1000` 的 `: 3` 是兜底，线上表值是 20。教训见 [[battle-config-vs-code-default]] |
| "两个玩家的技能可以同时释放" | ❌ 全场同时只有一个 `UseSkill` 状态；一方释放期间对方 action 被门禁挡下并 cache |

---

## 未解答（待记 unknowns）

1. 🟢 **P2**：Tick 60 是**运行时可覆盖**的（BattleGServer worker 配置），线上实际 tick 频率是多少？国内 vs 海外 vs GVG 是否不同？—— 可以通过战斗日志的 deltaTime 反推。

已解答（见 unknowns 已解决区）：
- 🔴 P0"主动换宠是否扣蓝" → 策划确认历史遗留（[[battle-design-evolution]]）
- 🟡 P1"ModifyAttackSpeed 具体实现" → 自查代码解答（[[05-buffs-debuffs]]）
- 🟡 P1"疲劳阶段参数" → 自查 GlobalConst.json 解答（2min / 500ms / 2.5% MaxHP）
- 🟡 P1"多个常量线上值 vs 代码兜底" → 自查 GlobalConst.json 解答（换宠 CD 20s / QTE 1s / SwitchTime 1s，教训见 [[battle-config-vs-code-default]] memory）

---

> 最后验证于 commit `8d59ed518`（分支 OB-dev），日期 2026-09-11
> 关键代码：`BattleGameSystem.Update` · `BattleWorldEntity.Update` · `CombatComponent.CanAttack` · `LumiAttack.OnEnter` · `LumiSkill.OnEnter` · `PlayerEntity.AddMana` / `ActionLumiChange` / `TryConsumeCachedAction` · `BattleDefine.cs`（所有常量）
