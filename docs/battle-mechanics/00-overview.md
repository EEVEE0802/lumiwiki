# 00 · 战斗架构总览

> 从"一场战斗在服务端到底是啥"出发，先建立整体图景，后面各章再深入。

## 一句话概括

LumiGO 是**服务端权威**的**半即时制**战斗（形态接近宝可梦 GO，但普攻不需要玩家点屏幕）：服务端按固定 tick 实时推进，**普攻由 `AttackTime` / `HitTimeList` 驱动自动触发**，技能由玩家在魔法值(Mana)满 + QTE 时机主动释放。客户端只做表现和输入，**所有逻辑都在服务端跑**，服务端按 tick 把权威状态快照广播给客户端。分析平衡时不用担心客户端行为，只看服务端就是事实。

> ⚠️ **不是回合制**：没有"轮到我 / 轮到你"的概念，每只在场 Lumi 各自有独立的普攻冷却计时（`CombatComponent.CanAttack` 检查 `frameTime - LastTimestamp > AttackTime`），只要不在 QTE / 换宠 / 释放技能等阻塞状态里就一直按自己节奏打。玩家的操作面是"能量满释放技能"和"死亡切换 / BanPick"。

## 关键设计决策（这几点决定了后续所有分析怎么做）

### D1 · 服务端权威 + 状态同步

- 客户端发意图（"我要用技能 X 打目标 Y"），服务端**执行、判定、广播结果**
- 客户端不允许本地推演关键逻辑（伤害、命中、暴击都在服务端算）
- **对我们的意义**：battle_end 数据里的胜负、伤害数字都是**服务端最终判定**，可以完全信任

### D2 · 伪随机同步（双端一致）

见 `battle/BattleCore/README.MD`：客户端和服务端**共享同一份 PRNG + 同一个种子 + 同一个调用顺序**，双端算出来的暴击/命中/闪避完全一致。服务端仍是最终仲裁。

- **对我们的意义**：分析里的"胜率"是**逻辑决定论**的产物 —— 同队伍同种子 100% 复现。差异来自玩家选择（换宠、技能选择、BanPick），不是随机波动
- 未来做模拟器时，**只要抽出 PRNG + 战斗核心组件，就能完美复现真实战斗**

### D3 · 组件化实体（ECS 风格）

- 战斗里的一切都是 `Entity`（World / Team / Player / Lumi）
- Lumi 身上挂各种 `Component`（Health / Combat / Skill / Buff / PassiveSkill / Armor / Trap …）
- Component 通过 `Update` 接口被驱动
- 组件间通过 `EventMgr.Subscribe / SendEvent` 通讯（**局部于本场战斗**）

### D4 · 状态机驱动战斗阶段

- `BattleCore/Fsm/` + `StateGraphs/` 定义战斗**阶段状态**（Ready / BanPick / 战斗中 / 死亡切换 / Buff 换宠 / 释放技能 / 结束 等，见 `BattleGameRunType`）
- BanPick 阶段是独立状态（`RunType` 11~13）
- 阶段状态之间**不是回合切换**，而是"打断/切换战斗推进的顶层玩法状态"（如死亡切换时全场普攻停摆等待玩家/AI 换宠）
- **对我们的意义**：想复现某种局面，得先搞清楚 FSM 允许哪些状态转换，避免建模出"不可能的"战斗状态

### D5 · 分片并行（战场间无耦合）

- `BattleShardEngine` 按 `hash(battleId) % workerCount` 把不同战斗分给不同 Worker 线程
- **单场战斗内串行，战场间并行** —— 一场战斗永远只被一个线程跑
- **对我们的意义**：单场战斗内部逻辑是**严格顺序**的，没有并发陷阱要考虑

## 战斗对象层级

```
BattleGameSystem                          一场战斗
├── BattleWorldEntity                     战场根实体
│   ├── EventMgr                          事件总线（本场战斗独立）
│   ├── FsmMgr                            状态机管理
│   ├── ClientSingletonMgr                战斗内单例（如全局效果场？待验证）
│   └── EntityManager                     实体管理
│       ├── TeamEntity × N                队伍（含玩家）
│       │   ├── PlayerEntity              玩家（真人或 AI/机器人）
│       │   │   └── LumiEntity × M        出战的噜咪
│       │   │       ├── HealthComponent   血量
│       │   │       ├── CombatComponent   战斗组件
│       │   │       ├── SkillComponent    技能
│       │   │       ├── BuffComponent     buff/debuff
│       │   │       ├── PassiveSkill...   被动
│       │   │       ├── ArmorComponent    护甲
│       │   │       ├── DeathComponent    死亡处理
│       │   │       ├── TrapComponent     陷阱
│       │   │       ├── ConditionComponent 条件判定
│       │   │       ├── ActionCache       行动缓存
│       │   │       ├── EffectHandler     效果处理
│       │   │       ├── PlayerCDCompoent  技能 CD（注意 typo：Compoent）
│       │   │       ├── TrainerSkill      训练师技能
│       │   │       ├── MagicEnvir        魔法环境（术式领域？）
│       │   │       └── BanPickComponent  BanPick 阶段用
```

> 具体每种组件的职责、字段和 Update 逻辑，见后续各章节。

## 事件系统（局部于本场战斗）

`EventMgr.Subscribe<T> / SendEvent<T>` 模式，**不是全局事件总线**，是每场战斗**独立**的：

```csharp
// 订阅（战斗初始化时）
battleGameSystem.m_eventMgr.Subscribe<LumiEntity, AttackResult>(
    BattleDefine.EventUpdateAttackResult,
    EventServerLumiHealth);

// 触发（组件内）
m_eventMgr.SendEvent(BattleDefine.EventUpdateAttackResult, lumiEntity, result);
```

**关键事件枚举**（初步观察，待深读 `BattleDefine.cs`）：

| 事件常量 | 触发场景 |
|---|---|
| `EventUpdateAttackResult` | 攻击结算完毕 |
| `EventHealthUpdate` | 血量变化 |
| `EventDeath` | 噜咪死亡 |
| `EventForwardBattleStateSnapshot` | 广播快照 |
| `EventNotifyBanPickPlayerChange` | BanPick 阶段玩家切换 |

## Tick 与同步节奏

这个 tick 就是战斗的**心跳** —— 驱动所有 Lumi 独立的普攻冷却、技能释放、buff 结算、能量恢复。每个 tick 遍历所有组件跑 `Update(frameTime)`。

`BattleDefine`：

- `Tick = 60`（毫秒间隔，约 16.7Hz —— 注意注释说"当前实现按毫秒间隔"）
- `SyncTime = 50ms`（快照推送间隔）
- `MinAttackIntervalMs = 150`（普攻最小硬 CD，即使 AttackTime 更小也不能低于这个）
- `MaxGameTotalTime = 5 * 60 * 1000`（战斗最长 5 分钟）
- `DieLumiChangeTime = 3.5s + BattleDeathTime`（噜咪死亡后换宠倒计时）
- `UseingSkillTime = BattleQTETime`（QTE 释放技能时间窗口）
- `ChangeLumiMana = BattleSwitchMana`（换宠消耗的魔法值，默认 30）
- `ManaMax = BattleMaxMana`（玩家魔法值上限，默认 100）
- `GameReadyWiatTime = 15秒`（准备阶段超时）

> ⚠️ 注释里写"如果目标是 60Hz 需要改约 16-17ms"，说明现在的 60ms 是**当前实现值**。所有时长（AttackTime / HitTimeList / DieLumiChangeTime 等）都以毫秒为单位，直接跟服务器 frame time 比较。

## 服务端不直接访问 DB

- 战斗服**不直连 MySQL/Redis**
- 玩家战斗数据由上游业务侧通过 `BattleCreateArgs` 协议下发
- **对我们的意义**：想知道玩家"进入战斗时的属性"，得看 `BattleStartElem` 里的字段 + `BattleLifecycleHandler.HandleCreateBattle` 怎么构造 `LumiEntity`

## 现有官方文档（先读，别复述）

`battle/docs/` 已有一批策划向文档，我打算**引用+补充**而不是重写：

| 官方文档 | 我这边对应章节 | 计划做的 |
|---|---|---|
| `buff-system.md` | 05-buffs-debuffs.md | 摘录核心规则 + 补充平衡分析视角的解读 |
| `battle-effect-system.md` | 04-skills.md 附录 | 效果系统怎么串技能 |
| `battle-trap-for-designers.md` | 05-buffs-debuffs.md / 04-skills.md | 陷阱作为一种效果的规则 |
| `ilumi-condition-api-for-designers.md` | 04-skills.md / 06-passives-triggers.md | 条件表达式怎么写 |
| `spell-field-system.md` | 05-buffs-debuffs.md / 战场效果 | 术式领域的持续效果 |
| `trainer-skill-logic.md` | 04-skills.md 附录 | 训练师技能 |
| `catch-lumi-fight-flow.md` | 07-battle-modes.md | 捕获战流程（跟对战不同） |
| `banpick-create-battle-flow.md` `create-battle-flow.md` | 01-turn-flow.md 附录 | 战斗创建流程 |
| `superpowers/` | 04-skills.md 附录 | 超能力 |
| `gm/` | 附录 | GM 相关（分析用不到） |

## 后续章节要回答的问题

每章要能干净利落回答一组问题，这些也是**未来分析的输入项**：

- **01 战斗节奏**：普攻怎么自动触发（`AttackTime` / `HitTimeList` / `MinAttackIntervalMs`）？技能什么时候能释放（Mana 门槛 / QTE 窗口）？换宠 / 死亡切换的时机和阻塞？
- **02 伤害公式**：伤害 = f(atk, def, type, rarity, level, break, star, skill_mult, ...) 的确切形式？暴击 / 会心 / 闪避 / 未命中的公式？
- **03 属性**：面板值 → 战斗值的换算？各稀有度基础值差多少？突破/星级/等级各贡献多少？
- **04 技能**：主动/被动/普攻的分类？技能的"效果链"是怎么组合的？多目标/AoE/持续伤害的差别？
- **05 buff/debuff**：叠加规则？消散时机？谁能盖谁？免疫怎么算？
- **06 被动触发**：哪些时机会触发被动？同一时机多个被动的顺序？
- **07 战斗模式**：不同玩法的胜负判定、超时处理、AI 强度差别？
- **08 AI**：机器人选技能/选目标的规则？段位越高 AI 越聪明吗？

---

> 最后验证于 commit **fbb25c313**，日期 2026-09-11
> 关键代码：`battle/ARCHITECTURE.md`, `battle/BattleCore/README.MD`, `battle/BattleCore/BattleSystem/BattleGameSystem.cs`, `battle/战斗集群上下文.txt`
