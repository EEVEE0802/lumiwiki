# 战斗知识库构建进度

> 每次会话结束前更新，方便下次接续。**重开 shell 或新会话时先读这个文件恢复上下文**。

## 当前状态

**最近更新**：2026-09-11（第三次会话末尾，用户答完 unknowns 后收尾）
**服务端基线 commit**：`8d59ed518`（LumiServer OB-dev）
**主章节完成度**：**7/8 完成**（00/01/02/03/04/05/06/07 全部完成，只差 08-ai-behavior + glossary + 附录）
**unknowns 状态**：**已解决 25 条，待确认仅剩 1 条**（🟢 P2 Tick 服务端频率，需真实 debug log 反推）

**下一步（下次会话）**：
- (a) 🎯 **写 08-ai-behavior**（唯一剩余主章节；关键入口 `PlayerSupportLogic.cs` / `AiUtils.cs`，默认 `BattleAILevel.Top`，见 07 章 §AI 支援）
- (b) 🎯 拿真实 debug log 校准所有已写章节的数值（进 debug log 数值验证会大幅提升知识库权威性）
- (c) 填 `glossary.md` 关键字词典（`BattleKeywordDes.json`）
- (d) 写附录（`BattleCreateArgs` 协议 / `battle_end` 事件字段解读 / 伪随机同步细节）

### 💾 本次会话建立的重要 memory（下次会话务必先读）

- `feedback_numeric_lookup.md` —— **数值类问题自己查表，不问用户**（用户明确表态过）
- `battle-config-vs-code-default.md` —— **代码兜底 ≠ 线上值**（GlobalConst.json 才是权威）
- `battle-design-evolution.md` —— **改设计但底层结构保留**是常见模式（当前 4 个案例）
- `battle-piercing-overflow.md` —— 贯穿是队内溢出伤害
- `reference_lumi_server.md` —— 服务端仓库位置

### ⚠️ 本次会话发现的重要"过去写错了"点（防止下次踩坑）

1. **换宠 CD 是 20s 不是 3s**：早期章节把代码兜底 3s 当线上值，实际 GlobalConst 里是 20s
2. **QTE / SwitchTime 是 1s 不是 3s**：同上兜底误抄
3. **每只 Lumi 有 2 个主动技能位（Skill1 固定 + Skill2 玩家自选）**：早期 04 章把 Skill1 说成"普攻"是错的，普攻是独立 `AttackId`
4. **SkillValueChange 7 种全部实现**：早期 04 章说"只有 Cost 实现"是没看全代码
5. **服务端有 4 层递归防护**：早期 06 章说"只有一处"是没搜全
6. **无限道馆版本迁移**：线上 EBattleType=17（复用 Gym）→ 开发版 EBattleType=20（独立 Tower）；未来 SQL 要升级

## 已完成

- [x] 服务端代码位置定位（`F:\G36Branch\LumiServer\`，git 仓库）
- [x] 阅读 `battle/ARCHITECTURE.md` + `battle/BattleCore/README.MD` + `battle/战斗集群上下文.txt`
- [x] 建立文档骨架：
  - `README.md` — 索引 + git pull 约定 + 权威代码索引表
  - `00-overview.md` — 战斗架构总览（有实内容，D1~D5 五条关键设计决策）
  - `glossary.md` — 关键字词典占位
  - `unknowns.md` — 疑问清单空模板
  - `_stubs.md` — 01~08 章骨架大纲
- [x] memory 系统写入 `reference_lumi_server.md` 记录仓库位置
- [x] 诊断 CLAUDE.md 内存路径显示为 `Administrator` 的根因：Windows `USERPROFILE` env 变量误设 → `setx USERPROFILE "C:\Users\qiuyang01"` 已修复（注册表实际值已通过 reg export UTF-16 dump 验证正确）
- [x] **修正 00-overview.md 的错误概念**：LumiGO **不是回合制**，是**半即时制**（服务端按 Tick=60ms 实时推进，普攻自动 CD，技能玩家操作）；同步修 README.md / _stubs.md 的 01 章描述
- [x] **写 02-damage-formula.md**：完整 15 步伤害公式 + 一图流 + 数值示例 + 边界表
  - 关键代码索引齐全，STAB 值以代码为准（1.25，非注释的 1.5）
  - unknowns 记了 4 条新疑问（STAB 值确认 / HealthSteal & Piercing 消费点 / SkillChannel 调度 / OnlySkillEffect 时的 buff 触发）
- [x] **写 03-stats.md**：属性五段乘积公式 + 各因子拆解 + 数值示例
  - LumiLevel 规律 `levelFixed = 10 + Level`
  - LumiBreak 规律 `breakFixed = 1.1^BreakLv`
  - 确认 WorkState 不进战斗计算（只透传协议字段）
  - 确认 BattleConst.json 系数 vs 代码硬编码一致（Fv 精度略差以代码为准）
- [x] **写 01-battle-tick.md**：战斗节奏完整章
  - 一图流 tick 循环（BattleWorker.BattleLoop 6 步 + 内层 BattleGameSystem.Update 顺序）
  - 常量参考表（Tick=60、SyncTime=50、MinAttackIntervalMs=150、DieLumiChangeTime≈4500、UseingSkillTime=3000、ChangeLumiCd=3000、ManaMax=100 …）
  - `BattleGameRunType` 阻塞态矩阵：技能/换宠期间全场普攻停摆
  - Lumi FSM（Idle/Attack/Skill/Hit/Die）+ Timeline 事件挂钩说明
  - **反直觉结论**：服务端 tick **不主动触发普攻**，需要 `ActionType.Attack` 命令下发；真人靠客户端每帧检测发，Bot/掉线支援由 `PlayerSupportLogic` 代发
  - 普攻 CD 精确公式（`Math.Max(GetAttackTime(), 150) < frameTime - LastTimestamp`）
  - CachedAction 兜底机制：阻塞态里的 action 被 cache，tick 里重试
  - Mana 系统全景：涨（命中回蓝）/ 消耗（技能 SkillCost）/ 玩家维度（换宠不重置）
  - 换宠三种路径（主动/死亡/OffBattle Buff）+ 死亡切换 OverTimeChangeLumi 选血最高
  - 边界与坑表 + 常见误解澄清表
  - 4 条新 unknowns：🔴 换宠是否扣蓝（`AddMana(-30)` 那行被注释掉了！）/ 🟡 ModifyAttackSpeed 实现 / 🟡 疲劳阶段默认参数 / 🟢 线上 Tick 实际值

## ⚠️ 已知环境坑

**Bash 输出显示层被改写**（原因未明，2026-09-11 发现）：
- 现象：`echo "$USERPROFILE"` / `reg query` / `cmd //c "echo %USERPROFILE%"` 全部把 `qiuyang01` 显示成 `Administrator`
- 但真实字节：通过 `xxd` / 写文件 / `reg export` UTF-16 dump 检查，实际值正确
- **教训**：Windows 相关环境查询不能只看 echo，要 xxd 或写文件 dump 才靠谱
- 可能原因：某种 Bash tool 输出过滤 hook，或 winpty 兼容层的 quirk，或 prompt injection filter

## 待办（按优先级）

### 🔴 P0 · 下次会话立刻开始

- [ ] 用真实局的 `_logger.Debug` 输出（如 `[Debug] 攻击力：资质...` / `CalculatesDamage,lumiUid:...` / `LumiAttack Enter attackTime:{},hitTime:{}`）**核算 01/02/03 里的示例数值**，确认代码和文档 100% 对得上
- [ ] 找策划答 01 章 4 条 unknowns（**🔴 换宠是否扣蓝** / 🟡 攻速 buff 公式 / 🟡 疲劳参数 / 🟢 线上 Tick 实际值）

### 🟡 P1 · 之后

- [ ] `04-skills.md` — 大工程，建议拆多次做（主动/被动/普攻分类、效果链、目标选择、条件系统、CD 组件、训练师技能）
- [ ] `05-buffs-debuffs.md` — 官方文档 `buff-system.md` 已有基础；顺便回答 01 章的 ModifyAttackSpeed 疑问
- [ ] `06-passives-triggers.md`
- [ ] `07-battle-modes.md`
- [ ] `08-ai-behavior.md` —— `PlayerSupportLogic` / `AiUtils` 是重点入口
- [ ] `glossary.md` 填充关键字词典

### 🟢 P2 · 写完知识库后

- [ ] 想办法搞 headless 战斗模拟器 CLI（跟用户讨论）
- [ ] 从聚合的 battle_end 数据出第一份「已上线噜咪」平衡分析报告
- [ ] 挑 3-5 只有争议的噜咪做 MVP 验证

## 恢复上下文指南（新会话读这个）

新会话开始时按这个顺序过一遍：

1. **读 memory**：`C:\Users\qiuyang01\.claude\projects\D--lumiwiki\memory\reference_lumi_server.md`（记录了仓库位置、语言、约定）
2. **读 progress.md**：就是本文件，看进度
3. **读 README.md**：`D:\lumiwiki\docs\battle-mechanics\README.md`，了解知识库整体结构
4. **同步代码**：
   ```bash
   cd F:/G36Branch/LumiServer
   git status
   git pull
   git log --oneline --since="1 day ago" -- battle/
   ```
5. **对比基线**：如果服务端 HEAD 已经不是 `8d59ed518`（本文件记录的基线），先扫一下 diff：
   ```bash
   git log --oneline 8d59ed518..HEAD -- battle/
   ```
   看看有没有影响我要写的章节的改动，有的话调整分析。

## 会话日志

### 2026-09-11 · 第一次会话
- 讨论了做平衡分析 / 未上线噜咪配队推荐的可行性
- 用户批准建战斗知识库；建了骨架文件；诊断并修复 USERPROFILE 问题
- **未做**：`git pull` 服务端仓库（要修 USERPROFILE 重开 shell 后再做）
- 交接点：**下次会话第一件事是 git pull server 代码，然后开始写 02 + 03**

### 2026-09-11 · 第二次会话
- git pull 服务端仓库确认基线仍是 fbb25c313（分支 OB-dev）—— 本地 up-to-date，无新战斗改动
- 用户指出 **00-overview.md 把游戏描述成"回合制"是错的** → 全线修正为"半即时制"（tick 心跳 + 普攻自动 CD + 技能玩家操作 + 死亡切换阻塞态），同步修 README + _stubs
- 读完 Combat/ + Health/ + BattleLumiAttributeElem.cs + BattleDefine.cs + SyncRandom.cs + ConfigCombat.cs
- 交叉验证 BattleConst.json / LumiLevel.json / LumiBreak.json / LumiStarUp.json / LumiCharacter.json
- 写完 **02-damage-formula.md**（15 步公式 + 边界表 + 数值示例，标注 STAB=1.25 vs 注释 1.5）
- 写完 **03-stats.md**（五段乘积 + 等级 `10+Level` 规律 + 突破 `1.1^BreakLv` 规律 + WorkState 不进战斗）
- unknowns 新增 5 条待确认（STAB / HealthSteal & Piercing / SkillChannel / OnlySkillEffect / Lv1 反常）
- **策划一次性确认了全部 5 条 unknowns**：
  - STAB = 1.25（代码正确，注释是过时的）
  - 贯穿 = **队内溢出伤害**（不是"穿防御"！反直觉设计已记 memory）
  - 多波次 = 多段伤害，`SkillPowerList` 列表逐段配置
  - `SkillPower=0` 是 **buff 类技能**，刻意不触发命中前后 trigger
  - Lv1 反常值是**策划刻意**避免新号数值贫弱
- **对比 wiki 伤害计算器 `DamageCalculator.vue`**（策划按设计逻辑写的），发现 6 处代码 vs 计算器差异（Round vs Floor、克制死区、承伤增强等计算器未建模、多波求和 vs 逐波、普攻是否吃全局增减伤等），全部记入 02 章新增的「与伤害计算器差异对比」小节
- unknowns 里新登记 4 条 P0/P1（普攻吃全局增减伤 · 攻防等级 buff 模型 · 吸血消费点 · 贯穿分配规则），已解决区归档 5 条
- **接续 P0/P1 互动**：策划挨条回答后本轮全部消化：
  - 普攻**吃**全局增减伤，服务端行为正确；计算器只对技能应用是 UI 抽象（差异 #17 已重写）
  - 攻/防 buff 走 buff 系统直接改数值，**配表按 `(5+n)/5` 反推填**，所以档位模型 ↔ 数值 buff **数值等价**（差异 #6 已重写）
  - 吸血消费点 = `BuffTriggers.AfterAttack`（用 `m_FinalRealChangeHp × HealthSteal/10000` 走 `TakeHealth` 回血；纯效果技能不吸）
  - 贯穿消费点 = `BattleWorldEntityEvent.LumiHealthEvent`（遍历敌方玩家全部噜咪，每只独立扣同量；`m_skill_id != 0` 才触发）
  - **误报纠正**：我最初以为 "2v2 贯穿代码没加 `IsBattling` 过滤会波及队友" 是 bug，策划反查后指出应该没这事儿；我重读代码发现是**我误解 `m_children_lumi` 语义** —— 它是**单个 PlayerEntity 名下**的噜咪，不是整队。2v2 是 "2 玩家 vs 2 玩家"，队友挂在另一个 PlayerEntity 上，代码遍历不到。**完全符合设计，非 bug**。教训写进 unknowns 已解决区 + memory
- unknowns 已解决区累计 10 条（含 1 条自查纠正的误报）；memory 里 `battle-piercing-overflow` 已更新完整分配规则和 2v2 澄清
- 交接点：**下次会话可以：(a) 拿真实 debug log 校准 02/03 数值 (b) 开写 01-battle-tick**

### 2026-09-11 · 第三次会话

- git pull 服务端 OB-dev：基线 `fbb25c313` → `8d59ed518`。diff 只有 Trap（陷阱技能）新功能 + HealthComponent 加了几行 `[DBG-TRAPHIT]` debug 日志 → **不影响 00/02/03 已写内容**
- 读完 BattleGameSystem.cs / BattleDefine.cs / CombatComponent.cs / BattleWorldEntity.cs::Update / PlayerEntity.cs::(AddMana / Update / PlayerLogicUpdate / TryConsumeCachedAction / ActionLumi\*) / LumiEntity.cs::(Update / Attack / AfterAttack) / LumiAttack.cs / LumiIdle.cs / LumiSkill.cs
- 读完 ARCHITECTURE.md §4 tick 主循环序列
- 写完 **01-battle-tick.md**（战斗节奏完整章，共 12 大节）
- **关键新发现**（跟直觉不同）：服务端 tick **不主动帮玩家打普攻** —— 普攻依赖客户端每帧下发 `ActionType.Attack`，服务端只在 tick 里校验 + 执行 LumiAttack 状态。Bot 和掉线支援由 `PlayerSupportLogic` 代发同样的 action
- **反直觉发现**：`PlayerEntity.ActionLumiChange` 里 `AddMana(-BattleDefine.ChangeLumiMana)` 那行是**注释掉的** —— 当前主动换宠**只吃 CD 不吃蓝**，但常量 `ChangeLumiMana=30` 和 `TbGlobalConst.BattleSwitchMana=30` 都还在。已记 🔴 P0 unknown 等策划回答
- CachedAction 机制搞清楚了：客户端在阻塞态下发的 action 会缓存进 `PlayerEntity.m_cachedAction`，tick 里 `TryConsumeCachedAction` 试重播 → 这是"技能表演结束一瞬间双方续攻"的服务端表现来源
- unknowns 新增 4 条待确认：🔴 主动换宠是否扣蓝 / 🟡 ModifyAttackSpeed 实现 / 🟡 疲劳阶段默认参数 / 🟢 线上 Tick 实际值
- README 目录 01 章从「_待写_」改成实链接；更新记录新增 01 行；基线 commit 升到 `8d59ed518`
- _stubs.md 里 01 章骨架已删（注释掉指向 01-battle-tick.md）
- 交接点：**下次会话可以：(a) 拿真实 debug log 校准 01/02/03 数值 (b) 让策划答 01 的 4 条 unknowns (c) 开写 04-skills 或 05-buffs**
- **策划补答 🔴 P0 换宠是否扣蓝**（同一会话末尾）：**当前不扣蓝**，只吃 3s CD。历史原因："最早设计是消耗能量的，后来改成 CD 而非能量，底层没改，只是把能量消耗填成了 0"。核对 `F:\G36\LumiGoDesigner\Config\Luban\Datas\check\data\GlobalConst.json:411 "BattleSwitchMana": 0` —— 表值确实 0，代码 `= 30` 只是兜底默认。同时 `AddMana(-30)` 那行也被注释（双重保险）
- **策划同时确认普攻链路历史原因**：最早像宝可梦 GO 需要手动普攻，后来改自动 → **底层协议还是手发的形式，程序会自动帮玩家发**。这就完整解释了 01 章里"服务端 tick 不主动打普攻"的反直觉发现，不是奇怪设计而是设计演进的分层结构
- **新建 memory** `battle-design-evolution.md`：把"LumiGO 改设计后底层结构常保留"提炼成通用模式（普攻 + 换宠两个案例 + 3 类信号 + 问策划模板），MEMORY.md 索引已更新
- 01 章的 unknowns 段从 4 条 P0/P1 减到 3 条（🔴 P0 已解决），普攻链路 / Mana 系统 / 换宠三种路径 / 常见误解澄清表 4 处 ⚠️ 已改为 ✅ 并加历史原因说明
- unknowns.md 已解决区累计 **11 条**（新加"主动换宠 Mana"一条）

### 2026-09-11 · 第三次会话 · 后半段：写 05-buffs-debuffs

- 用户选 05（先做 buffs，同时可解答 01 攻速 unknown；比 04-skills 更聚焦）
- 读官方 `battle/docs/buff-system.md`（超全，470+ 行，含三种触发类型 / 17 个 BuffTriggerType / 5 组条件效果链 / 木棍人 case study）→ 决定 **不复述** 官方文档，聚焦"分析视角"补充
- 读代码：`BuffComponent.cs::ModifyAttackSpeed`(134~191) / `CanAddBuff`(595) / `IsImmuBuff`(771~807)
- **拿到 ModifyAttackSpeed 精确公式**：`newTime = sourceTime / (1 + Σ AttackSpeedEnhance_i / 10000)` —— 加法叠加、仅 Constant 型、`ConditonIndex` 要过条件、Trigger 型即使配 AttackSpeedEnhance 也不生效（这是坑）
- 写完 **05-buffs-debuffs.md**（8 大节 + Unknowns + 底部索引）：
  - 决策地图（想做什么 → 该用哪种 TriggerCondition）
  - 属性字段 ↔ 02 章伤害公式 15 步 交叉表（每个 `*Enhance` 字段落到哪一步）
  - ModifyAttackSpeed 精确公式 + 数值示例 + 边界坑
  - 叠加规则（同 buffId 走 IncreaseLevel，不同 buffId 独立）
  - 免疫机制 3 层过滤 + 依赖攻击目标的空 target 陷阱
  - 触发时序对齐 02 章伤害流程（AfterAttack 早于 AfterOnHit）
  - 子系统边界（Trap / MagicEnvir / Armor / TrainerSkill 跟主 buff 系统的关系）
  - 木棍人 case 的**平衡分析视角**补充：攻速快 → 触发频率高、必暴机会被稀释、写了 battle_end 分桶验证建议
- 回填 01 章：ModifyAttackSpeed 段落更新为完整公式+加法叠加示例；01 章 unknowns 段从 3 条 → 2 条，加"已解答"引用
- unknowns 消化 1 条（01 攻速）到已解决区，05 章新增 2 条 P1（IncreaseLevel 是否重置 Duration / AttackSpeedEnhance 累加下界）
- README 目录 05 章实链接化 + 更新记录 3 行；_stubs 里 05 章骨架清理
- 累计：已解决 12 条，待确认 4 条 P1/P2；已完成 4 章（00/01/02/03/05）
- 交接点：**下次会话可以：(a) 拿真实 debug log 校准 01/02/03/05 数值 (b) 开写 06-passives-triggers（跟 05 已建立的时序对照表衔接顺）或 04-skills（大工程）**

### 2026-09-11 · 第三次会话 · 最后一段：写 06-passives-triggers

- 用户选"继续推进"，按上一段推荐做 06（跟 05 触发时序表天然衔接）
- 读代码：`PassiveSkill.cs`（仅 210 行！超薄组件）+ `BattleLumiAttributeElem.cs::29` + BattlePassive.json（244 条条目）+ HomePassive.json（结构对比验证）+ 递归防护 grep
- **发现核心结论**：**被动系统 = buff 系统的初始化包装器**
  - `PassiveSkill.Update` 是**空的**（`return true`），没有任何 tick 逻辑
  - 战斗开始时一次性初始化，之后全部靠挂上的 buff 承担触发
  - "被动的触发时机" 等价于 "被动挂的 buff 的 TriggerCondition" —— 直接指向 05 章
- 写完 **06-passives-triggers.md**：
  - 核心澄清（不是独立触发引擎）+ 一句话概念图
  - 被动三个来源：全局通用（TbGlobalConst.BattleCommonPassive）+ Lumi 自身（Lumi.json.PassiveId[]）+ 进化前继承（InbornBattlePassive，由上游注入）
  - 应用流程 + Priority 分布（244 条 98% 是 Priority=1）
  - Target 7 种 + **2v2 差异**（SelfTeam vs SelfAll / EnemyFriend 1v1 空跑）
  - **家园被动完全不进战斗** 代码 grep 双重验证（battle 服零引用 + HomePassive.json 结构没战斗字段）
  - 递归防护：仅 `BroadcastAddbuffToAny` 一处；其他反击/反弹类闭环无全局防护，靠配表规范
  - 免疫/沉默：走 buff 免疫；无"沉默被动"效果类型
  - 与其他章的速查表
- unknowns 新增 3 条 P1/P2（死循环隐患 / InbornBattlePassive 注入时机 / 同 Priority 顺序稳定性）
- README 目录 06 章实链接化 + 更新记录 1 行；_stubs 里 06 章骨架清理
- 累计：已解决 12 条 unknowns；待确认 7 条 P1/P2；**已完成 5 章（00/01/02/03/05/06 —— 只差 04/07/08 + 附录）**
- 交接点：**下次会话可以：(a) 用真实 debug log 校准所有已写章节的数值 (b) 开写 04-skills（大工程；从技能类型 SkillType=0/1/2 差异 + 主动技能结算 + 训练师技能开始拆多次做）(c) 07-battle-modes（更聚焦；天梯/周赛/道馆/家园/公会战差异）**

### 2026-09-11 · 第三次会话 · 加更：07 + 04 双章节

- 用户："07、04 都要写，你先都写完，之后我一起回答你的待确认问题"
- 一次写完 **07** 和 **04**：
  - **07-battle-modes.md**：EBattleType 21 种完整枚举（Pvp 12 + Pve 9）；`BattleDefine.BattleRunTypeMap` Pvp/Pve 分派点；阵容规则 `SlotNum=2 × 3 lumi/player`；胜负 `TeamAllDeadId`；BanPick 三阶段 30s；AI 支援 6 环节默认 Top 级；疲劳；各模式差异速查表 —— 4 条新 unknowns（AdventureCatchLumi_2v2 归 Pvp 是否有 MMR 问题 / 疲劳参数 / NfcPk 实际使用 / 无限道馆 EBattleType 归属）
  - **04-skills.md**：SkillType 分布（主动 581/普攻 373/特殊 0）；`SkillCost[]` 三元数组决定 Mana/Life 形态；生命周期六步（OnEnter→OnHit→OnDoDamage→OnExit→OnFinalExit）；SkillEffect 6 种 SkillTriggerType 挂钩伤害流程；CastCondition -1 特殊值（不能连续同技能）；SkillValueChange.Cost 动态成本；TargetType 三种索敌 2v2 规则；TrainerSkill 4 种（AddHealth/Shield/Attack/Cleanse）；跟计算器的对应差异 —— 4 条新 unknowns（SkillType=2 是否上线 / SkillValueChange 除 Cost 外的 ValueType 是否实现 / Skill2Id 上游注入差异 / TrainerSkill 充能阈值）
- README 目录 04+07 实链接化，更新记录 2 行
- _stubs 里 04+07 骨架清理
- unknowns 累计 **待确认 14 条**（原 7 + 新增 07 的 4 + 04 的 4 - 疲劳这条 07 和 01 重复用同一条），用户已表态"一起回答"
- **战斗知识库主章节 8 章全部完成**：00/01/02/03/04/05/06/07；剩 08-ai-behavior + glossary + 附录
- 交接点：**下次会话：等用户一次性回答 14 条 unknowns → 一次性消化 → 写 08-ai-behavior**

### 2026-09-11 · 第三次会话 · 追加：解答 unknown #1 疲劳参数 → 意外发现 5 个常量误抄

- 用户："挨个来聊，概要我有点看不懂，你说详细点" → 我详细讲了 #1 疲劳参数问题（背景+机制+具体想问啥）
- 用户提醒："你可以直接读 GlobalConst.json" —— 一句话点醒我，直接查表
- **grep GlobalConst.json 拿到疲劳三参数 + 一堆意外差异**：
  - 疲劳：2 min / 500ms / **250 万分比 = 2.5% MaxHP/次**（用户特别更正："250 是万分比"，代码 `m_damagePerMyriad` 变量名印证）
  - 换宠 CD：代码兜底 3s，**线上 20s** ⚠️（战略级重成本！之前 01 章全错）
  - QTE 时长：代码兜底 3s，线上 **1s**
  - SwitchTime：代码兜底 3s，线上 **1s**
- **一次性重写**：
  - 01 章常量表：改成"线上值 vs 代码兜底"两列布局，18 条常量全部对齐配表
  - 01 章"阻塞态矩阵"：BattleSwitchTime/UseingSkillTime 从 3000ms 改 1000ms
  - 01 章"换宠三种路径"：主动换宠 CD 3000ms → 20000ms
  - 01 章疲劳段：补完整参数 + 数值示例（每秒 5%MaxHP，20 秒见底）
  - 01 章"常见误解澄清"表：加"主动换宠 CD 3s"这条误解
  - 04 章"QTE 窗口 3s" → 1s
  - 07 章"主动换宠 CD 3s" → 20s；疲劳参数段填具体值
- **新建 memory** `battle-config-vs-code-default.md`：把"代码兜底 ≠ 线上值 → 必须查 GlobalConst.json"的教训固化；MEMORY.md 索引已加
- unknowns 消化 1 条（疲劳参数）+ 顺带归档 4 条常量差异到已解决区
- **当前 unknowns 状态**：已解决 13 条，待确认 13 条（继续等用户答 #2）
- **未来教训**：任何看到 `ConfigMgr.tables != null ? tbl.X : Y` 模式，直接 grep GlobalConst.json 拿真值，不要复制代码里的 Y

### 2026-09-11 · 第三次会话 · 追加：unknown #2 Tick 值（部分解答）

- 用户："这个我还真答不上来，客户端是 30 帧，服务端不知道"
- 处理：**未强行归档**（保持待确认状态），补充"客户端 30 帧"这条已知信息
  - 更新 unknowns #2 条目：加"已知客户端 30 帧、服务端待查"、提供自查路径（`_logger.Debug` 里 `deltaTime` 差值反推）
  - 01 章常量表 Tick 那行加"客户端渲染 30 帧，服务端 tick 频率待反推"注释
- 优先级本身就是 🟢 P2（不阻塞任何章节），维持待确认没问题
- 未来路径：拿到一场真实局的 debug log 即可反推服务端 tick 频率

### 2026-09-11 · 第三次会话 · 追加：unknown #3 buff 叠加规则

- 用户："添加新状态时，是采用等级相加，时长覆盖的规则"
- 代码 100% 印证：`BuffComponent.cs::567~568` 注释直接就是这句话
  - `existingBuff.IncreaseLevel(..,buffLv,frameTime); //buff升级`
  - `existingBuff.ExtendDuration(duration,frameTime); //buff时间覆盖`
- **额外发现 大坑**：`AddBuff` 传入的 `BuffLv` 参数是**"增量"，不是"目标等级"**（`IncreaseLevel` 内部 `Level += levelIncrease`）—— 身上 Lv2 再挂 Lv1 会变 Lv3，不是回到 Lv1；策划配表时每层都要单独一行 BattleBuff 条目
- 更新 05 章 §叠加规则详解（重写整节）：等级相加公式 + 时长覆盖行为 + BuffLv 增量语义 + Level=0 触发移除 + 设计启示（不想刷新时长要用不同 buffId 组合）
- unknowns #3 消化到已解决区（累计 14 条已解决）

### 2026-09-11 · 第三次会话 · 追加：unknown #4 攻速下界

- 用户："有约定不能配到 -10000"
- 结论：**策划规范禁止 `AttackSpeedEnhance <= -10000`**（单条 + 累加都不允许）；代码没做 clamp 是 by design
- 后置 `Math.Max(GetAttackTime(), 150)` 是兜底但不该依赖
- 更新 05 章 §ModifyAttackSpeed 的"边界坑"改成"边界防护 = 配表规范约束"
- unknowns #4 消化到已解决区（累计 15 条已解决，待确认 11 条）

### 2026-09-11 · 第三次会话 · 追加：unknown #5 死循环防护 → 意外挖出 4 层防护

- 用户："不确定有没有隐形防护，但从技能设计上不会出现这种情况"
- 我 grep 代码时发现**服务端实际有多处隐性防护**，之前 06 章说"只有一处"是错的！
- 拿到关键代码 `BuffTriggers.cs::181` 和 `BattleEventContext.cs`，梳理出 **4 层分层防护**：
  1. **通用派发深度上限** `MaxDispatchDepth=16` —— 打 `[REENTRY]` error 丢弃派发；这是 AfterAttack/AfterOnHit 闭环的兜底
  2. **陷阱链专属上限** `MaxTrapChainDepth=8` —— 陷阱 ↔ buff 递归 9 层拦截
  3. **AddbuffToAny 广播重入抑制** —— `m_isBroadcastingAddbuffToAny`
  4. **RemoveBuffByType 重入守卫** —— 同类型不二次移除
- **重写 06 章 §递归触发防护**：从"只有一处防护、其他闭环无防护"改成"4 层分层防护详解"+分层表格；纠正原有错误说法
- 分析价值：查异常战斗时搜服务端 log 里的 `[REENTRY]` 关键字能直接定位配表 bug；最坏情况不会栈溢出崩服
- unknowns #5 消化到已解决区（累计 16 条已解决，待确认 10 条）
- **教训**：写文档时如果说"只有一处防护"这种绝对判断，先 grep 一遍 `重入|递归|depth|reentry` 类关键字确认。这次要不是用户挑起来查，06 章的错误说法就留下来了

### 2026-09-11 · 第三次会话 · 追加：unknown #6 InbornBattlePassive

- 用户："战斗被动是噜咪达成一定养成度才会解锁的，天生战斗被动则是无视养成，始终解锁，这个确实是战斗服外封装的"
- 完全推翻我的猜测（我以为是"进化后保留旧被动"）—— 正确设计是：
  - **常规被动**：走**养成度门槛**（等级/突破/星级/进化解锁），业务服过滤
  - **天生被动**：**无视养成**，只要拥有就始终生效
  - 大部分噜咪 InbornBattlePassive=0 是**设计意图**（没有低养成度就能战斗的特权），不是配漏
- 更新 06 章：
  - §"被动的三个来源" → §"被动的两个通道 + 一个全局通用"（表格重组）
  - 分类改成"常规（有门槛）vs 天生（无门槛）"
  - 补分析视角：不同养成度玩家胜率分桶必要性、wiki 图鉴展示建议、"InbornBattlePassive != 0" 常暗示这只 Lumi 是新号引导 / 保底位候选
- unknowns #6 消化到已解决区（累计 17 条已解决，待确认 9 条）

### 2026-09-11 · 第三次会话 · 追加：unknown #7 同 Priority 顺序

- 用户："设计上属于无所谓的，都 OK，所以没有限定程序做法"
- 结论：**策划规范不允许依赖同 Priority 顺序的被动** → Dictionary 遍历不保证顺序 = by design 自由度，非隐患
- 更新 06 章 §应用流程与优先级：把"依赖精确顺序不安全"警告改成"策划规范保证不依赖，是 by design 的自由度"+"跨战斗波动的排查不应归咎于此，应查 RNG 类"
- unknowns #7 消化（累计 18 条已解决，待确认 8 条）

### 2026-09-11 · 第三次会话 · 追加：unknown #8 SkillType=2

- 用户："确实没上线过，历史遗留问题，实际没有在使用"
- 结论：SkillType=2 是**历史遗留字段**，跟"换宠 Mana=0"是同一套路数（归 [[battle-design-evolution]] memory）
- 更新 04 章 §一 SkillType 分类：从"可能预留"改成"确认历史遗留，完全忽略"
- **memory 追加案例**：在 `battle-design-evolution.md` 里加入 SkillType=2 案例，跟"普攻手动→自动"、"换宠能量→CD"并列，形成 3 个"设计改了底层结构保留"的样本
- unknowns #8 消化（累计 19 条已解决，待确认 7 条）

### 2026-09-11 · 第三次会话 · 追加：unknown #9 SkillValueChange → 大 bug 修正

- 用户："都实现了，你去找一下" → 我 grep 出所有 7 种 SkillValueType 的处理点
- **发现**：全部 7 种（Power / Cost / Crit / HealthSteal / Piercing / CritMultiplier / CounterMultiplier）都有代码实现，我 04 章写"只 Cost 实现"是错的（因为只看了 `SkillBase.UpdateSkillCost`，没查 `LumiEntity.cs::379~431` 的另一入口）
- **架构理解补全**：
  - `SkillBase.UpdateSkillCost`（**每帧**跑）：只处理 Cost，用于 UI 实时刷新"当前技能几蓝"
  - `LumiEntity.cs::379~431`（**伤害计算前**跑，`SkillEffectByCondition` 触发）：处理所有 7 种
  - `BuffComponent.cs::32~39` 用 Action 数组表：给 buff 的 `FirstSkillChange` 字段用（buff 也能触发 SkillValueChange 效果）
- **意外坑**：Cost 的 Percent 基数是 `BaseSkillPower`（不是 `BaseSkillCost`）—— 策划配 Cost Percent 要用 SkillPower 的百分比思考，不直觉
- **04 章 §5.2 全部重写**：
  - 完整 7 种对照表（ValueType + 处理位置 + 修改字段 + 支持 ModifyType + 影响 02 章公式哪一步）
  - Cost Percent 基数坑标注
  - 处理位置分工说明（每帧 vs 施法时）
  - 5 个典型配表用例（火系伤害 +30%、低血必暴、暴击伤 +20% 等）
  - buff FirstSkillChange 字段共用同一套分派逻辑
- **教训**：写"某功能没实现"这种绝对判断前，要在**全代码库** grep 处理位置，不能只看一个文件（这次要不是用户让我"去找一下"，04 章的错误就留下来了）
- unknowns #9 消化（累计 20 条已解决，待确认 6 条）

### 2026-09-11 · 第三次会话 · 追加：unknown #10 Skill2Id → 又一个 04 章 bug 修正

- 用户："每只噜咪战斗中有 2 个主动技能，第一个固定，第二个可自己配置，从它的技能池选一个，图鉴里就有"
- **重大澄清**：一只 Lumi 有 **3 个技能位**（普攻 + 主动 1 + 主动 2），不是我 04 章原说的"1 普攻 + 1 主动"：
  - 普攻（`AttackId`）：固定，从 Lumi 表 `NormalAttack` 读，走 CombatComponent
  - 主动 1（`Skill1Id`）：固定，从 Lumi 表 `ActiveSkill` 读，SkillComponent.m_skill1
  - 主动 2（`Skill2Id`）：**玩家自选**（从技能池选），SkillComponent.m_skill2
- 代码 100% 印证：`SkillComponent.Initialize(m_lumiId, lumiStartElem.Skill1Id, lumiStartElem.Skill2Id, ...)` —— 传的是**两个主动技能 id**
- **04 章 §八全部重写**：从"Skill1/Skill2/Temp 三份配置（普攻+主动）"改成"一只 Lumi 的 3 个技能位（普攻 + 主动1 + 主动2）"，补 Skill2 技能池玩家自选机制、SkillComponent 只管主动、平衡分析必须按 Skill2Id 分桶、图鉴展示建议、581 条主动技能分布解释（每池平均 2-3 候选）
- **04 章 §一 补充**："每只 Lumi 战斗中有 2 个主动技能位"关键澄清
- **教训**：写"字段 X 的用途"时，必须找**代码里初始化那一行**看是怎么用的（`SkillComponent.Initialize` 传两个都是主动技能这个证据非常强，我之前没看仔细）
- unknowns #10 消化（累计 21 条已解决，待确认 5 条）

### 2026-09-11 · 第三次会话 · 追加：unknown #11 训练师充能阈值 + 用户偏好

- 用户："TrainerSkill.json，你可以自己去查，这个你记一下，后面所有这种数值你都可以直接去查"
- **第一件事：记 memory** `feedback_numeric_lookup.md`（feedback 类）—— 记录用户偏好："数值类问题（表配置值、常量、字段实际数字）直接查表，不问用户"；关联 [[battle-config-vs-code-default]]；给了常用查表命令模板；MEMORY.md 索引已加
- **第二件事：查表**（`TrainerSkill.json` 4 条数据）：
  - `InitNum = 1`（开局自带）
  - `ChargeNum = 300`（4 种技能统一）—— **需累积 Mana 变化 300 才 +1 次**
  - `Condition = 50006 / 90009`（释放条件，走 ConditionSystem）
- **分析结论**：ManaMax=100，累积 300 = 打满 3 次能量条。一场战斗约 3~5 次训练师技能触发（初始 1 + 累积 2-4）—— 定位为"战术级救急工具"，非常规输出
- 更新 04 章 §七 训练师技能：补参数 + Condition 字段说明 + 实战量级分析
- unknowns #11 消化（累计 22 条已解决，待确认 4 条）
- **重要教训固化**：以后 unknowns 里凡是"某字段/常量的具体数值"，先查表再问；只在设计意图/策划规范/历史演进这类问题上问用户

### 2026-09-11 · 第三次会话 · 追加：unknown #12 AdventureCatchLumi_2v2

- 用户："事实上没有 AdventureCatchLumi_2v2 的玩法，这可能是一个历史遗留问题"
- 结论：EBattleType=9 枚举字段保留但**线上没有玩法承载**，归 [[battle-design-evolution]] memory 的第 4 个案例
- 07 章 §EBattleType 表标注"历史遗留，未上线"
- memory 已加此案例，累计 4 个"设计遗留"样本（普攻手动→自动、换宠能量→CD、SkillType=2、AdventureCatchLumi_2v2）
- unknowns #12 消化（累计 23 条已解决，待确认 3 条）

### 2026-09-11 · 第三次会话 · 追加：unknown #13 NfcPk

- 用户："这是预留的，目前还没用上"
- 结论：**未来可能启用的预留**（跟 SkillType=2 / AdventureCatchLumi_2v2 的"已废弃"不同，NfcPk 是"还没做而已"）
- 但对分析效果相同：目前线上不出现
- 07 章 §EBattleType 表标注"预留字段，未启用"
- unknowns #13 消化（累计 24 条已解决，待确认 2 条）

### 2026-09-11 · 第三次会话 · 追加：unknown #14 无限道馆 EBattleType → 重要版本迁移点

- 用户："这里有一个问题，现在线上数 CSV 里它是复用的 Gym，在现在的开发中版本已经是自己的 TowerPve 了"
- **重要发现**：**版本迁移中**！
  - **线上当前**：无限道馆 = `GymPve=17`（跟普通道馆共用 EBattleType，靠 stageId 区分）
  - **开发中**：改为独立 `TowerPve=20`
- **这解释了 CSV 分片设计**：wiki 侧 `daily/infinity-gym/*.csv` 需要**上游服基于 stageId 打分片**（因为战斗服层面看 EBattleType=17 混着两种玩法）
- **数据分析警示**（很重要，可能未来会踩坑）：
  - 当前：分析 EBattleType=17 不能直接当"普通道馆"，需要跟 stageId 联合判定
  - **未来上线后**：`ta-fetch.mjs` 的 SQL 要升级 —— 从"按 stageId 判定"改为"按 EBattleType 分"，否则漏数据
- 07 章更新：
  - EBattleType 表 GymPve/TowerPve 两行都加"含无限道馆"标注
  - 各模式速查表 InfinityGym 行加版本迁移警示
  - 专门段落解释"为啥 CSV 靠 stageId 分片" + 未来版本升级需要改 SQL
- unknowns #14 消化（累计 25 条已解决，**待确认仅剩 1 条**（Tick 值））
