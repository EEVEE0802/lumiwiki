# 疑问清单

> 读代码时遇到不确定的地方，**先记这里，不要瞎猜写进正文**。
> 攒一批后一次性问用户/策划/程序，得到回答后：
>
> 1. 对应正文改成"已确认"
> 2. 本文件条目移到"已解决"区
> 3. 记录回答者和确认日期，方便后续 diff

## 待确认

### [01] 🟢 Tick 值线上实际是多少

**背景**：`BattleDefine.Tick = 60` 是硬编码默认，但注释明说 **BattleGServer 按 worker 配置可覆盖**（"字段会撞静态初始化顺序（除零）并锁死过时的 Tick 值"）。

**问题**：线上（国内 / 海外 / GVG worker）服务端的实际 Tick 值是多少？各环境是否一致？

**已知**（用户 2026-09-11 补充）：**客户端渲染是 30 帧**。服务端 tick 频率未知，可能跟客户端一致（30Hz）也可能更高（60Hz）—— 客户端和服务端 tick 是两个独立概念，客户端 30 帧不代表服务端也是 30Hz。

**自查路径**：拿一场真实战斗的 `_logger.Debug` 输出，看 `BattleWorldEntity.Update` 或 `[SWITCHBUG][UpdateEnter]` 打点里 `deltaTime` 相邻两次的差值 —— 差值就是 tick 间隔（60Hz=16.7ms，30Hz=33.3ms）。

**当前猜测**：更倾向 30Hz（与客户端对齐、单 worker 负载更低），但需要 log 或程序确认。

**答案影响什么**：`01-battle-tick.md` 一图流里的时钟精度描述；后续用真实 log 校准数值时的时间基线；技能表演 1s 内实际有多少 tick 推进（30 vs 60）。

**优先级**：🟢 P2（不阻塞任何章节）

---


### 模板

```
### [章节] 问题标题

**背景**：为什么会想到这个问题（读到哪段代码/表）

**问题**：具体想问的

**当前猜测**：（我根据现有信息的推测，可能错）

**答案影响什么**：如果 A 那正文写 X，如果 B 那正文写 Y

**优先级**：🔴 P0（阻塞后续分析）/ 🟡 P1（可选） / 🟢 P2（好奇）
```

## 已解决

### ✅ [07] 无限道馆 EBattleType —— 版本迁移中（GymPve → TowerPve）

**回答者**：策划（2026-09-11）
**结论**：**版本迁移中**！
- **线上当前版本**：无限道馆**复用 `GymPve = 17`**（跟普通道馆共用 EBattleType）；靠上游服的 stageId 区分玩法
- **开发中版本**：改为独立 `TowerPve = 20`，未来上线

**这解释了为啥 CSV 分片是这么设计的**：wiki 侧 `daily/infinity-gym/*.csv` 需要上游服基于 stageId 打分片（因为战斗服层面看它俩都是 GymPve），不能直接按 EBattleType 拿。

**数据分析警示**（很重要）：
- **当前分析线上数据**：不能只看 EBattleType=17 就判定"普通道馆" —— 里面混着无限道馆；需要跟 stageId / LevelType 联合判定
- **未来版本上线后**：拉取脚本要升级 SQL —— 从"按 stageId 判定"改为"按 EBattleType 分"，否则会漏数据

**影响**：`07-battle-modes.md` §EBattleType 表 GymPve/TowerPve 两行都加"含无限道馆"标注；各模式速查表 InfinityGym 行加版本迁移警示；专门段落解释"为啥 CSV 靠 stageId 分片"。

---

### ✅ [07] NfcPk —— 预留，未启用

**回答者**：策划（2026-09-11）
**结论**："**这是预留的，目前还没用上**" —— 跟 SkillType=2 / AdventureCatchLumi_2v2 的"已废弃"不同，NfcPk 是**未来可能启用的预留**（NFC 线下扫码对战？），目前线上不出现。
**分析规则**：CSV 里不会出现 EBattleType=19，出现即异常；未来如果启用了这个玩法，需要单独 review 观测数据结构。
**影响**：`07-battle-modes.md` §EBattleType 枚举表标注"预留字段，未启用"。

---

### ✅ [07] AdventureCatchLumi_2v2 —— 历史遗留，玩法实际不存在

**回答者**：策划（2026-09-11）
**结论**："**事实上没有 AdventureCatchLumi_2v2 的玩法，这可能是一个历史遗留问题**"
**分类**：跟 SkillType=2 一样是 [[battle-design-evolution]] memory 的典型例证 —— 枚举字段保留但线上无玩法承载。EBattleType=9 归 `Pvp` 分支不会出错，因为**根本没有战斗会用 EBattleType=9 创建**。
**分析规则**：分析 CSV 数据时**不用过滤 EBattleType=9**，因为它不会出现；如果未来出现，那是配置错误或调试残留。
**影响**：`07-battle-modes.md` §EBattleType 枚举表标注"历史遗留，未上线"；`battle-design-evolution` memory 已加此案例（第 4 个）。

---

### ✅ [04] 训练师技能充能阈值 —— 300（自查 TrainerSkill.json）

**回答者**：自查 `TrainerSkill.json`（用户提醒"数值类可以自己查表"）
**结论**：
- **InitNum = 1** 开局自带 1 次
- **ChargeNum = 300**（4 种技能统一）：Mana 累计变化 300 才 +1 次
- **Condition = 50006 / 90009**：释放条件走 ConditionSystem
- **实战量级**：ManaMax=100，需**打满 3 次能量条**充满一次。一场约 3~5 次训练师技能触发（初始 1 + 累积 2-4）
**分析价值**：这个量级意味着训练师技能是**战术级"救急工具"，不是常规输出手段**。玩家能感受到"关键时刻能用一次"，而不是"大招循环"。

**影响**：`04-skills.md` §七 训练师技能补上完整参数、Condition 字段说明、实战量级分析。

**⭐ 顺带记 memory**：`feedback_numeric_lookup.md` —— 后续任何"某常量/字段线上实际值"这类问题**直接查表**（GlobalConst.json / 各表 json），不问用户。用户明确表态过。

---

### ✅ [04] Skill2Id 上游注入 —— 每只 Lumi 有 Skill2 技能池玩家自选

**回答者**：策划（2026-09-11）
**结论**：**一只 Lumi 战斗中有 3 个技能位**（我原来 04 章说"1 普攻+1 主动"是错的）：
- **普攻**（`AttackId`）：固定，从 Lumi 表 `NormalAttack` 读，走 CombatComponent
- **主动技能 1**（`Skill1Id`）：固定，从 Lumi 表 `ActiveSkill` 读，SkillComponent.m_skill1
- **主动技能 2**（`Skill2Id`）：**玩家自选**，从"该 Lumi 的技能池"里挑一个（wiki 图鉴里就有），SkillComponent.m_skill2

**关键代码修正**：`SkillComponent.Initialize(lumiId, Skill1Id, Skill2Id, ...)` —— **传的是两个主动技能 id，不是"普攻+主动"**！

**分析价值**：
- 同一只 Lumi 强度分析必须**按 Skill2Id 分桶** —— 不同选择强度差异可能巨大
- Wiki 分析可以给策划反馈"技能池选择分布"（哪个候选被最多人用）
- 图鉴设计应展示 Skill1（固定）+ Skill2 技能池 + 普攻 三种

**影响**：`04-skills.md` §八 大改（3 个技能位表 + 玩家自选机制 + SkillComponent 的三份配置 + 分析价值）；§一 SkillType 分类补充"每只 Lumi 2 个主动技能位"说明；581 条主动技能远大于"200 只 × 2"是因为每池平均 2-3 个候选。

---

### ✅ [04] SkillValueChange 全部 7 种 ValueType 都实现了

**回答者**：策划（2026-09-11）+ 自查代码印证
**结论**：**全部 7 种都有代码实现**，之前我以为只有 Cost 是错的。

**7 种 ValueType 分工**：
| ValueType | 处理位置 | 修改字段 |
|---|---|---|
| Power(1) | `LumiEntity.cs::381` | `ExtraSkillPower` |
| Cost(2) | `SkillBase.UpdateSkillCost`（每帧）+ `LumiEntity.cs` | `ExtraSkillCost` |
| Crit(3) | `LumiEntity.cs::390` | `ExtraCrit` |
| HealthSteal(4) | `LumiEntity.cs::399` | `ExtraHealthSteal` |
| Piercing(5) | `LumiEntity.cs::408` | `ExtraPierce` |
| CritMultiplier(6) | `LumiEntity.cs::417` | `CritChange`（只支持 Fixed）|
| CounterMultiplier(7) | `LumiEntity.cs::423` | `CounterRateChange`（只支持 Fixed）|

**分工规则**：`SkillBase.UpdateSkillCost` 每帧跑只处理 Cost（用于给 UI 实时显示"当前几蓝"）；其他 6 种在伤害计算时跑（`LumiEntity` 里）。

**大坑发现**：Cost 的 Percent 类型基数是 **`BaseSkillPower`**（不是 `BaseSkillCost`）—— 策划配 Cost Percent 时要用 SkillPower 的百分比思考。

**buff 系统也用同一套**：`BuffComponent.cs::32-39` 用 Action 数组存了处理表，给 buff 的 `FirstSkillChange` 字段用 —— buff 也能触发 SkillValueChange 效果。

**影响**：`04-skills.md` §5.2 SkillValueChange 全部重写（从"只 Cost 实现"改成"7 种都实现" + 完整对照表 + Cost Percent 基数是 BaseSkillPower 的大坑标注 + 各类型影响 02 章公式哪一步的交叉引用）。

---

### ✅ [04] SkillType=2 特殊技能 —— 历史遗留，实际没用

**回答者**：策划（2026-09-11）
**结论**："**确实没上线过，历史遗留问题，实际没有在使用**"。
**分类**：归 [[battle-design-evolution]] memory 的典型例证 —— 枚举字段留在代码里，但配表清空，跟"换宠 Mana 消耗填 0"、"CLAUDE.md 里 SkillType 枚举说明"同一套路数。
**分析价值**：分析噜咪技能池时**完全忽略** SkillType=2，不需要为它加特殊处理；如果未来配表出现 SkillType=2 的条目，那是配表 bug 而非新玩法启用。
**影响**：`04-skills.md` §一 SkillType 分类 已更新描述（从"可能预留"改成"确认历史遗留"）。

---

### ✅ [06] 同 Priority 下应用顺序 —— 设计上无所谓

**回答者**：策划（2026-09-11）
**结论**："**设计上属于无所谓的，都 OK，所以没有限定程序做法**"。**策划规范里不会配依赖同 Priority 顺序的被动**，Dictionary 遍历顺序不保证 = by design 的自由度，非隐患。
**分析启示**：观测到"同队伍跨战斗表现波动"时不要归咎于被动应用顺序；波动源更可能是 RNG 类（如暴击判定）。
**影响**：`06-passives-triggers.md` §应用流程与优先级的"⚠️ 依赖精确顺序不安全"改成"策划规范保证不依赖，Dictionary 不保证顺序是 by design"。

---

### ✅ [06] InbornBattlePassive 语义 —— 无视养成的天生被动

**回答者**：策划（2026-09-11）
**结论**：**常规被动 = 需养成度门槛解锁，天生被动 = 无视养成始终解锁**。
- **常规战斗被动**（`Lumi.json.PassiveId[]` 里的 id）：需要达到 **等级 / 突破 / 星级 / 进化等养成度门槛** 才生效；业务服在拼装 `lumiData.PassiveId` 时过滤未解锁的
- **天生战斗被动**（`Lumi.json.InbornBattlePassive`）：**无条件**追加进 `PassiveId[]`，只要拥有该 Lumi 就始终生效
- **战斗服完全不介入**：`InbornBattlePassive` 字段是"**战斗服外封装**"处理的，battle 服代码 grep 空结果符合设计
- **绝大多数 Lumi `InbornBattlePassive = 0` 不是"没配完"** —— 是策划刻意只给某些 Lumi 特权（低养成度就能战斗，通常是新号引导 / 保底位候选）

**影响**：`06-passives-triggers.md` §"被动的三个来源" 改名为"两个通道 + 一个全局"；重新分类为"常规（有门槛）vs 天生（无门槛）"；补充分析视角（不同养成度玩家胜率分桶、图鉴展示建议）。

---

### ✅ [06] 死循环防护 —— 有多层防护（策划 + 代码）

**回答者**：策划（2026-09-11）+ 自查代码补充
**策划答**："不确定有没有隐形防护，但从技能设计上不会出现这种情况" —— **第一道防护是配表设计**
**代码自查追加**：服务端实际有 **4 层分层防护**：

| 层 | 代码位置 | 上限 | 触发时 |
|---|---|---|---|
| 1 | `BattleEventContext.MaxDispatchDepth=16` + `BuffTriggers.cs::176` | 派发深度 16 | 打 `[REENTRY] buff event dispatch depth exceeded` error，丢弃本次派发 |
| 2 | `BattleEventContext.MaxTrapChainDepth=8` | 陷阱链嵌套 9 层 | 拦第 10 层触发 |
| 3 | `BattleGameSystem.BroadcastAddbuffToAny` `m_isBroadcastingAddbuffToAny` | 一次源头广播不二次广播 | 静默跳过 |
| 4 | `BuffComponent.cs::69/881` RemoveBuffByType 重入守卫 | 同类型不重入 | 打 warn log 跳过 |

**分析价值**：查异常战斗时，服务端 error log 里搜 `[REENTRY]` 关键字，能直接定位配表 bug；最坏情况也不会栈溢出崩服务端。
**影响**：`06-passives-triggers.md` §递归触发防护 从"只有一处防护"改成"4 层分层防护"（重写整节）；纠正原来 06 章"AfterAttack/AfterOnHit 闭环无防护"这个错误说法。

---

### ✅ [05] AttackSpeedEnhance 累加下界 —— 策划规范禁止到 -10000

**回答者**：策划（2026-09-11）
**结论**：**有约定不能配到 -10000**。单个减速 buff 上限 `-9999`，累加也不能触到 -10000。代码没做防护是 by design —— 靠**配表规范**约束，不需要在 `ModifyAttackSpeed` 里加 clamp。
**万一越界**：后置 `Math.Max(GetAttackTime(), 150)` 会把负值夹回 150ms，功能不崩但语义丑；不该依赖这个兜底。
**影响**：`05-buffs-debuffs.md` §ModifyAttackSpeed 的"边界坑"改成"边界防护 = 配表规范"（不再是待修 bug）。

---

### ✅ [05] Buff 叠加规则：等级相加 + 时长覆盖

**回答者**：策划（2026-09-11）+ 代码印证
**结论**：**同 buffId 再次添加时，等级相加、时长覆盖**。
**代码印证**（`BuffComponent.cs::567~568`）：
```csharp
existingBuff.IncreaseLevel(...,buffLv,frameTime);   //buff升级       ← Level += levelIncrease
existingBuff.ExtendDuration(duration,frameTime);    //buff时间覆盖    ← Duration 刷新
```
**注意坑点**：`BuffLv` 参数是**增量**不是"目标等级"，例如身上 Lv2 再 AddBuff Lv=1 会变 Lv3。策划为每层都要单独配 BattleBuff 条目（`TbBattleBuff.Get(buffId, 累计Level)`）。
**Level=0 特殊**：升级后如果 Level 变 0，直接 RemoveBuff（例如 `BuffLv=-1` 就是减层）。
**影响**：`05-buffs-debuffs.md` §叠加规则详解 已加完整说明；平衡设计启示（想不刷新时长要用不同 buffId 组合）。

---

### ✅ [01/07] 疲劳阶段参数 + 多个常量线上值 vs 代码兜底

**回答者**：用户提醒 "可以直接读 GlobalConst.json" 后自查（2026-09-11）
**核对来源**：`F:/G36/LumiGoDesigner/Config/Luban/Datas/check/data/GlobalConst.json`

**疲劳三参数**：
- `BattleTiredTime = 120000 ms（2min）` —— 战斗打到 2 分钟进入疲劳
- `BattleTiredIntervial = 500 ms` —— 每 0.5 秒扣一次
- `BattleTiredDamage = 250` —— **万分比！= 2.5% MaxHP/次**（用户特别更正："250 是万分比"，代码印证 `dmg = MaxHealth × m_damagePerMyriad / 10000L`；每秒 5% MaxHP，满血约 20 秒见底）

**顺便发现的重大差异（都是代码 fallback ≠ 线上值）**：

| 常量 | 代码兜底 | 线上真实值 |
|---|---|---|
| `BattleSwitchCD` → `ChangeLumiCd` | **3s** | **20s** ⚠️（战略级重成本）|
| `BattleQTETime` → `UseingSkillTime` | 3s | **1s** |
| `BattleSwitchTime` | 3s | **1s** |
| `BattleSwitchMana` → `ChangeLumiMana` | 30 | **0**（历史遗留） |
| `BattleHaveQte` | false | false（QTE 玩法未启用）|

**影响**：01 章常量表全面重写（新增"线上值 vs 代码兜底"两列）；01 章换宠三种路径的 CD 从 3s → 20s；01 章疲劳段填具体值；04 章 QTE 窗口从 3s → 1s；07 章主动换宠 CD 说明改为 20s。

**教训固化**：新建 [[battle-config-vs-code-default]] memory 记录"必须查 GlobalConst.json 才是权威"的规律，与 [[battle-design-evolution]] 姊妹条目（兜底值的历史含义）互补。

---

### ✅ [01] BuffComponent.ModifyAttackSpeed 具体实现（自查）

**回答者**：自己读代码（2026-09-11）
**代码**：`BuffComponent.cs::134` `ModifyAttackSpeed(long sourceTime)`
**结论**：`newTime = sourceTime / (1 + Σ AttackSpeedEnhance_i / 10000)`
**关键规则**：
- 多个 buff **加法叠加**（`totalEnhance += ...`），不是相乘
- **只 Constant 型生效**，`ConstantType != Constant` 的 buff 即使填了 `AttackSpeedEnhance` 也不会跑到累加分支
- 带 `ConditonIndex != 0` 的 buff 必须过 `ConditionSystem.CheckConditions` 才计入
- **触底**：结果由 `CombatComponent.CanAttack` 走 `Math.Max(result, MinAttackIntervalMs=150)` 兜底
- `speedOffset` 同步写进 `LumiEntity.SetSpeedOffset` 供客户端做动画速度修正
**边界**：`totalEnhance <= -10000` 会分母 ≤ 0，但目前无配表命中此坑（新记 P1 unknown 给策划）
**影响**：`05-buffs-debuffs.md` 有完整专节；`01-battle-tick.md` 攻速段落已回填数值示例更新

---

### ✅ [01] 主动换宠是否消耗 Mana · 历史设计遗留

**回答者**：策划（2026-09-11）
**结论**：**当前主动换宠不消耗能量，只吃 CD**（本条记录时误以为 3s，后来自查 GlobalConst.json 确认线上是 **20s**，见下方"疲劳阶段参数 + 多个常量线上值 vs 代码兜底"条）。
**历史原因**：**最早设计是消耗能量的**，后来改成"CD 而非能量"，**底层没改**（`ChangeLumiMana` 常量、`AddMana(-...)` 调用点等结构都保留），**只是把配表 `BattleSwitchMana` 填成 0**。
**核对**：`F:\G36\LumiGoDesigner\Config\Luban\Datas\check\data\GlobalConst.json:411 "BattleSwitchMana": 0`。代码里 `BattleDefine.ChangeLumiMana = ConfigMgr.tables != null ? tbl.BattleSwitchMana : 30` 的 `= 30` 只是表读不到时的兜底默认，线上实际读到 0。同时 `PlayerEntity.ActionLumiChange` 里 `AddMana(-BattleDefine.ChangeLumiMana)` 那行也被注释掉了（相当于双重保险，即使表值改回非 0 也不会扣蓝）。
**影响**：`01-battle-tick.md` Mana / 换宠段落已同步。此模式（"改设计但保留底层结构"）已提炼进 [[battle-design-evolution]] memory，避免未来遇到同类"看着有实际不用"的常量/字段又被当成新 unknown 查一遍。

---

### ✅ [02] 2v2 贯穿是否波及队友 · 我自己误报的伪 bug

**回答者**：策划 + 自己重读代码（2026-09-11）
**结论**：**不是 bug，符合设计**。我之前误以为 `m_children_lumi` 是"敌方队伍"的所有噜咪，实际它是**单个 PlayerEntity 名下**的噜咪。2v2 是"2 玩家 vs 2 玩家"，每个玩家一时刻只 1 只在场（宝可梦风格换宠），所以：
- `lumiEntity.GetOwnerParent()` 拿的是**被击方那 1 个玩家**
- 遍历 `m_children_lumi` = 遍历他名下全部噜咪 = 主目标 1 只 + 场下若干
- 队友（另一个 PlayerEntity）+ 队友的场下噜咪都**不在** `m_children_lumi` 里，代码根本遍历不到
- 完全符合策划"只攻击对面场上噜咪自己队伍的场下噜咪"的定义

**教训**：读代码时对 `m_children_lumi` 的语义（=**单玩家名下** vs =队伍全体）没弄清就下判断，差点让策划去查伪 bug。以后遇到 `m_children_*` 这种字段先 grep 定义再推理。
**影响**：`02-damage-formula.md`「主公式外的两个属性 · 贯穿」小节已改成正确说明。

---

### ✅ [02] 吸血（HealthSteal）消费点

**回答者**：自己 grep 服务端代码（2026-09-11）
**结论**：消费点在 `battle/BattleCore/Component/Buff/BuffTriggers.cs::AfterAttack` case。用 `m_FinalRealChangeHp × HealthSteal/10000` 走 `TakeHealth` 打给自己（正数=回血），会被 `MaxHealth` 截断。
**要点**：
- 用 **实际造成伤害**（`m_FinalRealChangeHp`），不是理论伤害 —— 被免伤/护盾挡住的部分不吸
- **纯效果技能不吸血**（`ShouldSkipByDamage()` 挡住，跟"buff 类技能不触发命中 trigger"同源）
- 归因给自己，会触发 `AfterbeTreated` 事件
**影响**：`02-damage-formula.md`「主公式外的两个属性」小节已加完整实现说明。

---

### ✅ [02] 贯穿（Piercing）分配规则

**回答者**：自己 grep 服务端代码（2026-09-11）
**结论**：消费点在 `battle/BattleCore/Entity/BattleWorldEntityEvent.cs::LumiHealthEvent`（订阅 `EventHealthUpdate`）。
**要点**：
- 用 **实际伤害** × `Piercing/10000` 计算贯穿伤害
- **遍历敌方玩家 `m_children_lumi` 全部噜咪**（跳过主目标），**每只独立扣同样一份**（不均分）—— 例：Piercing=20% 打主目标 3000 血，敌方还有 3 只非主目标 → 每只吃 600 伤害
- 走标准 `TakeHealth`，**会触发死亡判定 / 免死 / 事件派发**
- **`source.m_skill_id != 0` 才触发**（排除 buff/陷阱/场地类"非技能来源伤害"，防死循环）
- ⚠️ 代码未加 `IsBattling` 过滤 → 2v2 波及敌方场上另一只（作为新 unknown 记录）
**影响**：`02-damage-formula.md`「主公式外的两个属性」小节已加完整实现说明；同时衍生一条 2v2 是否波及 P1 unknown。

---

### ✅ [02] 攻/防 buff · 档位模型 vs 数值 buff（数值等价）

**回答者**：策划（2026-09-11）
**结论**：**数值层面等价**，技术实现不同：
- 服务端**走 buff 直接改数值**（`ExtraMAttack` 由 BuffComponent 累加），选这条通道是为了配置调整自由度
- **buff 数值本身在配表时按宝可梦档位公式 `(5+n)/5` 反推填**，所以 +2 档 buff = `ExtraMAttack = BaseMAttack × 0.4`
- 计算器用档位模型是 UI 抽象；输出跟服务端等价
**影响**：`02-damage-formula.md` 差异 #6 已重写（"数值等价、实现不同"）。如果发现某个具体 buff 实战数值 ≠ 计算器档位预估，说明该 buff 配表时没按 `(5+n)/5` 反推填 = 配表 drift，需具体查表核对。

---

### ✅ [02] 普攻吃不吃全局增减伤 · 服务端 vs 计算器差异

**回答者**：策划（2026-09-11）
**结论**：**设计意图是"普攻和技能都吃"**（服务端行为正确）。差异是 UI 抽象层：
- 服务端全局增减伤**通过 buff** 修改 `AttackGlobalChange / OnHitAttackGlobalChange` 字段，普攻和技能都会用到累积值
- 计算器 UI 直接把增减伤做成 `bonusCoeffs / reductionCoeffs` **列表参数**输入，代码里判定 `isSkill = cost.mode !== 0` 只对技能应用 —— 这是 UI 层简化，不是设计冲突
**影响**：`02-damage-formula.md` 差异 #17 已重写（把结论改成"UI 抽象 vs buff 实现"）。用计算器估普攻在增减伤 buff 下的伤害要手工把系数乘到普攻分支。

---

### ✅ [02] STAB (属性一致加成) = 1.25 不是 1.5

**回答者**：策划（2026-09-11）
**结论**：**STAB = 1.25**，`AttackResult.cs` 里的 "属性一致加成一直是 1.5" 是**过时注释**，字段实际初始化 `m_h = 1.25f` 是正确的。伤害计算器 `DamageCalculator.vue::calcTypeBonus` 也返回 1.25，跟代码一致。
**影响**：`02-damage-formula.md` Step 2 已同步。

---

### ✅ [02] 贯穿（Piercing）实际语义

**回答者**：策划（2026-09-11）
**结论**：**不是"穿透防御"**。贯穿的意思是"按造成伤害的百分比，对同队未上场的噜咪造成伤害"（**队内溢出伤害**）。
**影响**：`02-damage-formula.md` 已加独立小节说明；memory 已新增反直觉设计记录避免再踩坑。

---

### ✅ [02] 多波攻击 SkillChannel 语义

**回答者**：策划（2026-09-11）
**结论**：**多波次 = 多段伤害**。在 `ActiveSkill` 表里 `SkillPowerList` 列表配置了不同的段数，例如 `[50, 50, 100]` 就是三段伤害（威力分别 50 / 50 / 100）。服务端每段单独调用 `CalculatesDamage`，段的时序由 `HitTimeList[]` 控制。
**影响**：`02-damage-formula.md` Step 8 已展开。伤害计算器把 `SkillPowerList` 求和当总威力是**近似估算**。

---

### ✅ [02] SkillPower=0（buff 类技能）不触发命中前后 trigger

**回答者**：策划（2026-09-11）
**结论**：**刻意设计**。伤害为 0 的技能属于 buff 类技能，不算"造成伤害"，因此**不触发"造成伤害前/后"trigger**（如"命中即上盾"这类被动 buff 遇到 buff 类技能不会连锁）。
**影响**：`02-damage-formula.md` Step 8 已加"buff 类技能不触发命中 buff 链"段落，供 05/06 章交叉引用。

---

### ✅ [03] LumiLevel Lv1 反常值

**回答者**：策划（2026-09-11）
**结论**：**刻意设计**。规律 `levelFixed = 10 + Level` 从 Lv1 起就适用（Lv1 = 11，非传统 RPG 的"Lv1 = 1× 系数"），是为了避免新号数值过于贫弱。
**影响**：`03-stats.md` 已加设计意图说明。

---

> 最后维护日期：2026-09-11（用户逐条答；#14 无限道馆 EBattleType 版本迁移 GymPve→TowerPve；已解决 25 条；当前待确认 1 条（仅 Tick 值））
