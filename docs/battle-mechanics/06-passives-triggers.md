# 06 · 被动技能与触发时机

> 🎯 **本章的核心澄清**：LumiGO 的被动系统**不是一个独立的触发引擎**，而是 **buff 系统的初始化包装器**。真正的触发时机全部由挂上去的 buff 承担，见 [[05-buffs-debuffs]] 的 17 种 `BuffTriggerType`。
>
> 这一点非常重要 —— 如果你抱着"每种被动有独立触发时机、独立执行入口"的预期读代码，会找不到你想找的东西（因为不存在）。所有被动的触发时机都是**它挂的 buff 的 `TriggerCondition`**。

---

## 一句话概念图

```
被动 (BattlePassive)
   │
   │ 就是一个配置包装：
   │
   ├─ 元数据 (Id / name / icon / Des)      ← 表现层
   ├─ Priority                            ← 决定被动之间的应用顺序（初始化时用）
   └─ BuffList[]                          ← 战斗开始时给谁挂哪些 buff
        │
        │ 每条 = { BuffId, BuffLv, Duration, Target }
        │
        └─→ 真正的触发时机在这些 buff 的 TriggerCondition 里
             ├─ 0 (Always)     → 常驻数值修改（属性 buff）
             ├─ 1 (Tick)       → 定时触发（HOT/DOT）
             └─ 3~17 (事件型)  → BeforeAttack / AfterAttack / Die / SwitchUp / ...
```

**结论**：想知道"被动 X 什么时候触发"，等价于问"被动 X 挂的 Buff Y 的 TriggerCondition 是什么"。

**代码证据**：`PassiveSkill.cs::Update` 是空的 —— `return true`，**没有任何 tick 逻辑**。被动系统的生命周期在 `Start()` 时一次性完成初始化，之后所有行为完全交给 buff 系统。

---

## 被动的两个通道 + 一个全局通用

战斗开始时（`PassiveSkill.Start()`），场上每只 Lumi 会被注入以下被动：

| 来源 | 挂在哪 | 表 | 门槛 |
|---|---|---|---|
| **全局通用被动** | 每只 Lumi 都挂一遍 | `TbGlobalConst.BattleCommonPassive[]`（配 `{BuffId, BuffLv, Duration}` 数组）| 无门槛，永远生效 |
| **常规战斗被动**（`PassiveId[]`）| 该 Lumi | `Lumi.json.PassiveId[]` → `TbBattlePassive.GetOrDefault(passiveId)` → `BuffList` | **需达到养成度门槛**（等级/突破/星级/进化等，由业务服判定）|
| **天生战斗被动**（`InbornBattlePassive`）| 该 Lumi | `Lumi.json.InbornBattlePassive`（大部分是 0）| **无视养成，只要拥有该 Lumi 就始终解锁** |

### 两种被动的关键区别（策划 2026-09-11 确认）

- **常规被动 = 养成解锁**：新号刚抓到一只 Lumi 时，可能 `PassiveId[]` 里的被动**一个都没解锁**；等级/突破/星级达到某档才逐个开放。业务服在拼装 `lumiData.PassiveId` 时过滤未解锁的
- **天生被动 = 出生就有**：`InbornBattlePassive != 0` 的 Lumi，业务服**无条件**把它追加进 `PassiveId[]`。策划刻意给某些 Lumi 的"特权"，让它们在低养成度阶段就已经有战斗身份
- **`InbornBattlePassive = 0` 的绝大多数 Lumi**：不是"没配完"，是**没有"无视养成"的先天被动**这一设计意图 —— 都走常规被动路线

### 战斗服的角色

**代码**：`BattleLumiAttributeElem.cs::29` `lumi.PassiveId.AddRange(lumiData.PassiveId)`

战斗服**只是忠实执行**上游给的 `PassiveId[]`，不参与养成度判定 / Inborn 追加。也就是说：
- battle 服代码 grep 不到 `InbornBattlePassive` 字段（**该字段在战斗服外封装处理**，策划确认）
- 同一只 Lumi 在不同战斗中 `PassiveId[]` 可能不同（玩家养成度提升 → 新被动解锁 → 下一场战斗才生效）

### 分析视角

- **玩家胜率分桶分析**：同一只 Lumi 不同养成度玩家胜率会有明显差异 —— 因为解锁的被动数量不同
- **wiki 图鉴展示建议**：展示某只 Lumi 的完整被动池时，如果有 `InbornBattlePassive` 应该标"天生（无门槛）"，其他标"需 XX 养成解锁"
- **未上线 Lumi 强度评估**：如果一只 Lumi 有 `InbornBattlePassive != 0`，说明策划给了它"低养成度也能战斗"的设计意图，通常代表它是**新号引导池 / 抽卡低星保底位** 的候选

---

## 应用流程与优先级（Priority）

**代码**：`PassiveSkill.cs::ApplyPassiveSkills()`（83~109）

```csharp
// SortedDictionary 用反向比较器：Priority 大的排前面
passiveSkillDict = new SortedDictionary<int, Dictionary<ulong, List<Addbuff>>>(
    Comparer<int>.Create((a, b) => b.CompareTo(a))
);
```

初始化流程：

```
Step 1  InitTeamPassiveSkill(team1) + InitTeamPassiveSkill(team2)
          → 每只 Lumi 的 PassiveId 转成 (Priority, LumiUid, BuffList) 塞进 passiveSkillDict

Step 2  Start() 里：
        AddGlobalBattleCommonPassive()        ← 先给所有 Lumi 挂全局通用被动
        ApplyPassiveSkills()                  ← 再按 Priority 高→低 遍历应用
          外层遍历：Priority 从大到小
            中层遍历：该 Priority 下的所有 (lumiUid → BuffList)
              内层遍历：BuffList 里每个 Addbuff → ApplyOneBuff(lumiEntity, addbuff)
```

**Priority 语义**：
- 数值越大越先应用
- 应用顺序 = 战斗开始时挂 buff 到目标的顺序
- **不是**触发时的执行顺序（触发顺序由 buff 系统内 `m_triggerHandlers[type]` 的插入顺序决定，这个顺序间接由 Priority 决定，因为高 Priority 先加进去）

**线上 Priority 分布**（`BattlePassive.json` 244 条）：
- Priority=1 → 239 条（98%）
- Priority=0 / 2 / 3 → 各 1~2 条（少数用于特殊排序需求）

**实践含义**：绝大多数被动是同优先级，谁先谁后主要由**遍历顺序**决定（`InitTeamPassiveSkill` 遍历 team → player → children_lumi），同一场战斗每次跑结果稳定，但**不同战斗的固定队友哪只先加不能反过来推**。

**同优先级下的字典遍历顺序**：`Dictionary<ulong, List<Addbuff>>` 的 .NET 遍历顺序未严格保证。**同一场战斗内**稳定，跨战斗可能因对象哈希不同而变。

**这是问题吗？** ❌ 不是（策划 2026-09-11 确认）："**设计上属于无所谓的，都 OK，所以没有限定程序做法**" —— **策划规范里不会配依赖同 Priority 顺序的被动**，业务层面上谁先谁后等价。所以 Dictionary 不保证遍历顺序 = **by design 的自由度**，不是隐患。

**给分析者的启示**：如果观测到"同一队伍跨战斗表现波动"，**不要**归咎于被动应用顺序 —— 策划规范保证了这不是波动源。真正的波动源应该去查 buff 触发时机的 RNG（如 `AttackResult.CalculatesDamage` 里的 crit 判定）。

---

## Target 类型 7 种

**代码**：`PassiveSkill.ApplyOneBuff()`（138~187）

`BattlePassive.BuffList[i].Target` 决定 buff 挂到谁身上：

| 值 | 名称 | 挂给谁 | 2v2 差异 |
|---|---|---|---|
| 1 | `Self` | 本 Lumi 自己 | 无差异 |
| 2 | `Enemy` | 当前主目标（`GetAttackIngTargetMaster()` 返回的那只）| 主目标即敌方对位玩家的场上 Lumi |
| 3 | `SelfTeam` | 本玩家名下所有 Lumi（`playerEntity.m_children_lumi`）| 只挂自己名下 3 只，**队友的 Lumi 不吃** |
| 4 | `EnemyTeam` | 敌方对位玩家名下所有 Lumi | 只挂敌方对位那 1 个玩家名下 3 只，敌方队友的 Lumi 不吃 |
| 5 | `SelfAll` | 整个 Team 全部玩家全部 Lumi（`TeamAllAddBuff`）| 2v2 时**队友的 Lumi 也吃** |
| 6 | `EnemyAll` | 敌方 Team 全部玩家全部 Lumi | 2v2 时敌方队友的 Lumi 也吃 |
| 7 | `EnemyFriend` | 敌方对位玩家的**队友**名下所有 Lumi（`TeamFriendAllAddBuff` 排除对位自己）| 仅 2v2 有意义；1v1 敌方 Team 只有 1 个 player 会走空遍历 |

**关键区分**：
- `SelfTeam` (3) vs `SelfAll` (5)：前者是"单个玩家名下"，后者是"整个 Team"。1v1 时两者等价（Team 就一个玩家）；**2v2 时差异 = 有没有影响队友的 Lumi**
- 类型 3/4/5/6 都会遍历"目标玩家名下所有 Lumi" —— **包括场下的 Lumi**！这是**贯穿式挂 buff**（但没有 IsBattling 过滤）。跟 [[battle-piercing-overflow]] 里贯穿的机制类似
- `Enemy` (2) 依赖 `GetAttackIngTargetMaster()` —— **战斗开始时刚初始化，targetMaster 应该已经就绪**；但如果发生"上场瞬间对方无目标"，可能取到 null

**⚠️ 需要注意的 case**：`EnemyFriend` 只在 2v2 有意义。1v1 的敌方 Team 只有 1 个玩家（对位自己），`TeamFriendAllAddBuff` 排除对位后为空遍历 —— 相当于**这条被动 1v1 时不生效**。策划配这类被动时要留意。

---

## 被动的实际触发时机（跳转 05 章）

被动挂完之后，"什么时候触发效果"完全由 buff 的 `TriggerCondition` 决定。**06 章不重复列表**，直接看 [[05-buffs-debuffs]] §触发时机对照表：

- **Always（常驻）**：不"触发"，每次伤害计算时自动生效（战斗开始就一直挂着的属性 buff）
- **Tick**：每 `TickTime` 毫秒触发一次
- **事件型**（3~17）：对应 17 种战斗事件

**分析路径**：拿到一个被动（例如"必暴 X"），流程是：

```
BattlePassive.Id → BuffList[]           （被动挂哪些 buff）
    → 每个 Buff.TriggerCondition        （每个 buff 的触发时机）
        → 对应 05 章某种 BuffTriggerType
            → 对应 02 章伤害流程的某段
                → 由此可预判平衡影响
```

**具体案例**：木棍人被动（Lumi 119801）在 `buff-system.md §7` 已完整解读 —— 三个 buff 分别是 AfterAttack 触发 / End 触发 / Always 数值修改，这就是被动通过 buff 系统实现"复杂时序机制"的样本。

---

## 家园被动完全不进战斗（代码验证）

**证据 1：battle 服代码完全不引用 HomePassive**

```bash
grep -rn "HomePassive\|TbHomePassive" F:/G36Branch/LumiServer/battle/
```

结果：**只在 `battle/Config/Data/Lumi.json` 里作为 Lumi 元数据字段出现**（`"HomePassive": 2100101` 等），**没有任何 C# 代码引用**。battle 服完全把 HomePassive 视为"上游透传字段"，不解析、不应用。

**证据 2：HomePassive.json 结构里完全没有战斗字段**

```json
{
  "Id": 2100101,
  "icon": "WorkType_Wishing",
  "name": "H_Skill_2100101",
  "Des": "H_SkillText_2100101",
  "BuffLv": 1,
  "WorkTypeBuff": [{"WorkType": 4, "Param": 3000}],  ← 工作类型加成（工作值 buff）
  "ArchBuff": [],                                     ← 建筑加成
  "RecipeBuff": [],                                   ← 食谱加成
  "HungryBuff": 0,                                    ← 饱食度加成
  "ExtraItem": [],                                    ← 额外物品掉落
  "TravelRewardBuff": [],                             ← 旅行奖励
  "TravelLocalRewardBuff": 0                          ← 旅行本地奖励
}
```

**跟 BattlePassive 完全不同的字段集**，全部是家园/工作系统的字段，没有 `BuffList` / `Priority`，也没有指向 `BattleBuff` 表的引用。

**结论**：HomePassive 是**家园工作系统的被动**，跟战斗系统的被动是**两套独立系统**，只是共用"被动"这个词。战斗数据分析永远不需要考虑 HomePassive；反过来家园数据分析也不需要考虑 BattlePassive。

---

## 递归触发防护（防死循环）

**问题**：如果被动 A 挂的 buff 是"当有 buff 被添加到我身上时反弹一个 buff"（`Addbuff` 触发），而反弹的 buff 又触发对方"当我给别人加 buff 时怎样"（`AddbuffTo` 触发），会不会无限递归？

**答**：**服务端有多处防护**（策划 2026-09-11 补充："从技能设计上不会出现闭环"是第一道防护；代码另有兜底）。共 **4 处** 分层防护：

### 第 1 层：全局事件派发深度上限（**通用兜底**）

**代码**：`BattleEventContext.cs::13` + `BuffTriggers.cs::176`

```csharp
public const int MaxDispatchDepth = 16;   // 通用安全上限

public bool EnterDispatch() { m_dispatchDepth++; return m_dispatchDepth <= MaxDispatchDepth; }
```

一次 `DispatchBattleEvent` 内 buff 层 + 陷阱层各占一次深度，`16` 约对应 **8 层逻辑事件**（正常战斗最深约 4 层，留了 4× 余量）。超限时：

```csharp
if (!within)
{
    _logger.Error(...$"[REENTRY] buff event dispatch depth exceeded, triggerType:{triggerType}, owner:{self.Id}");
    return; // 失控自递归：丢弃本次派发（今天等价于栈溢出，跳过更安全）
}
```

**这就是 `AfterAttack → 反击 → 再 AfterAttack` 类闭环的最终兜底 —— 打到 16 层就丢弃派发**。观测方法：搜服务端 error log 里的 `[REENTRY]` 关键字，能定位到线上是否触发过深度超限（意味着有配表 bug）。

### 第 2 层：陷阱链专属深度上限

**代码**：`BattleEventContext.cs::14`

```csharp
public const int MaxTrapChainDepth = 8;   // Addbuff/RemoveBuff → 陷阱 → 加/减 buff → 再触发陷阱
```

专门约束 "buff 变更触发陷阱、陷阱效果又变更 buff" 这条链路，**最多 9 层嵌套**（初次 + 8 层）。跟第 1 层独立计数。

### 第 3 层：全场 AddbuffToAny 广播重入抑制

**代码**：`BattleGameSystem.cs::BroadcastAddbuffToAny`（477~511）

```csharp
private bool m_isBroadcastingAddbuffToAny = false;

public void BroadcastAddbuffToAny(int buffId)
{
    if (m_isBroadcastingAddbuffToAny) return;      ← 重入抑制
    m_isBroadcastingAddbuffToAny = true;
    ...
}
```

一次源头 AddBuff 触发的全场 `AddbuffToAny` 广播过程中，即使广播里嵌套产生新 AddBuff，也不再二次广播 `AddbuffToAny`（但 `Addbuff` / `AddbuffTo` 本身照常触发）。

### 第 4 层：RemoveBuffByType 重入守卫

**代码**：`BuffComponent.cs::69-71 / 881-886`

`RemoveBuffByType` 按类型批量移除时，若下方派发的 `RemoveBuff` 触发点效果又调用同类型 `RemoveBuffByType`，第二次调用会**跳过并打 warn log**，避免无限递归 / 重复移除。

### 分层防护总结

| 层 | 场景 | 上限 | 触发时 |
|---|---|---|---|
| 1 | 通用 buff 事件递归 | Depth 16 | 打 `[REENTRY]` error，丢弃本次派发 |
| 2 | buff ↔ 陷阱互相触发链 | Depth 9 | 拦第 10 层触发 |
| 3 | 全场 AddbuffToAny 二次广播 | 1 次 | 静默跳过 |
| 4 | RemoveBuffByType 同类型重入 | 1 次 | 打 warn log 跳过 |

### 分析视角

- **第一道防护是技能设计**：策划 confirm "**从技能设计上不会出现闭环**"，闭环触发是**配表 bug**，不是玩法特性
- 如果实测某场战斗卡帧/超时，先查 `battle_end` 里的技能触发次数分布，异常高的时机（比如 AfterAttack 触发 100+ 次）就是死循环嫌疑
- 或者查服务端 error log 里的 `[REENTRY] buff event dispatch depth exceeded` —— 有这条就是触发到第 1 层防护了，需要报 bug
- 最坏情况：**代码有 depth=16 兜底，不会真的栈溢出崩服务端**，只会丢弃这次派发（可能造成 buff/技能少触发一次）

---

## 被动能否被免疫/沉默

**免疫**：可以。走 [[05-buffs-debuffs]] §免疫机制的 3 层过滤 —— 被动挂的 buff 在 `CanAddBuff` 入口被 `IsImmuBuff` 拦住则不生效。

**"沉默"（沉默某只 Lumi 的所有被动）**：**服务端没有这种效果类型**。想实现沉默要通过：
1. **主动 RemoveBuff / RemoveBuffType**：把被动挂上去的 buff 强制移除（但被动本身还在 `passiveSkillDict` 里）
2. **`OffBattle` 效果**：把 Lumi 换下场；`SwitchRemove=true` 的 buff 会自动移除

**注意**：被动被移除 buff **不等于**被动被"卸载"。被动的 `passiveSkillDict` 记录是永久的，是**已应用**的初始化数据，不会重挂。所以如果一个被动的 buff 被移除，除非有其他机制（如 `SwitchUp` 触发重挂），否则**不会重新出现**。

---

## 与其他章节的关系速查

| 想搞清 | 去看 |
|---|---|
| 一个 buff 什么时候触发 | [[05-buffs-debuffs]] §触发时机对照表 |
| 被动挂的 buff 数值怎么影响伤害 | [[02-damage-formula]] + [[05-buffs-debuffs]] §属性字段交叉表 |
| 战斗流程期间有哪些阻塞态阻止被动触发 | [[01-battle-tick]] §BattleGameRunType 阻塞态矩阵 |
| 家园系统怎么用 HomePassive | ⚠️ 不在本知识库范围，看家园侧代码/文档 |
| 训练师技能算被动吗 | 不算，是玩家级一次性资源；见未来 `04-skills` §训练师技能 |
| 陷阱算被动吗 | 不算，陷阱是战场级（挂 BattleWorldEntity）；见 `battle/docs/battle-trap-*.md` |

---

## Unknowns（新增）

1. 🟢 **P2**：**同 Priority、不同 Lumi 的被动应用顺序**是否严格稳定？.NET Dictionary 遍历顺序未强保证，但同一进程内、同一 Dictionary 实例的遍历是稳定的。是否会因 GC / 重建产生跨战斗差异？
2. 🟡 **P1**：**没有全局死循环防护是否会被恶意配表利用？** 目前只有 `AddbuffToAny` 一处 —— 如果某只未来 lumi 配了 "反击 → 触发反击" 类结构会怎样？（理论上会一直死循环到栈溢出）
3. 🟢 **P2**：**`InbornBattlePassive` 什么时候被上游服注入到 `PassiveId[]`**？（可能跟"进化前的先天被动保留"设计有关，但 battle 服看不到）

---

> 最后验证于 commit `8d59ed518`（分支 OB-dev），日期 2026-09-11
> 关键代码：`PassiveSkill.cs`（整个文件，被动系统仅 210 行）· `BattleGameSystem.BroadcastAddbuffToAny`（477~511）· `BattleLumiAttributeElem.cs::29`（PassiveId 从上游透传）
> 表：`BattlePassive.json`（244 条）· `HomePassive.json`（家园侧，battle 服不读）· `Lumi.json.PassiveId[]` / `InbornBattlePassive`（上游侧使用）
