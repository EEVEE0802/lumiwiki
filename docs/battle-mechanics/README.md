# LumiGO 战斗机制知识库

> 服务端权威的战斗机制文档，用于支撑数据分析 / 平衡建议 / 配队推荐。
> 客户端只做表现层，**这里记录的都是服务端的真实逻辑**。

## 阅读顺序

新读者按序读，老读者按需查：

- [00-overview.md](00-overview.md) — 战斗架构总览（对象层级、组件系统、事件/FSM、代码地图）
- [01-battle-tick.md](01-battle-tick.md) — 战斗节奏（半即时制 tick 心跳 / 普攻 CD / 技能 QTE / 换宠 / 阻塞态 / Mana / 超时）
- [02-damage-formula.md](02-damage-formula.md) — 伤害计算完整公式（属性克制 / STAB / 暴击 / 全局增减伤 / 承伤增强 / 普攻锁定）
- [03-stats.md](03-stats.md) — 属性体系（资质 × 系数 × 等级 × 突破 × 性格；星级走 buff；Fv 语义；WorkState 不进战斗）
- [04-skills.md](04-skills.md) — 技能系统（SkillType 分类 · SkillCost 三元数组 · Mana/Life 形态 · 六步生命周期 · SkillEffect 效果触发 · CastCondition/SkillValueChange · TargetType · 训练师技能 4 种）
- [05-buffs-debuffs.md](05-buffs-debuffs.md) — Buff 系统（决策地图 / 属性字段 ↔ 伤害公式交叉表 / ModifyAttackSpeed 精确公式 / 免疫 3 层过滤 / 触发时序 / 子系统边界）
- [06-passives-triggers.md](06-passives-triggers.md) — 被动系统（=buff 初始化包装器 · 三个来源 · Priority 应用顺序 · Target 7 种含 2v2 差异 · 家园被动完全不进战斗验证 · 递归防护）
- [07-battle-modes.md](07-battle-modes.md) — 战斗模式差异（EBattleType 21 种枚举 · Pvp/Pve 分派 · 阵容规则 1v1/2v2 · 胜负判定 · BanPick 三阶段 · AI 支援 6 环节 · 疲劳）
- [08-ai-behavior.md](08-ai-behavior.md) — AI 行为系统（4 级 AILevel · 5 段决策管线 · Rank→AILevel 映射 · NodeAct 特化脚本 · Bot BanPick 策略）
- [glossary.md](glossary.md) — 战斗关键字词典（BattleKeywordDes ↔ 服务端实现）
- [unknowns.md](unknowns.md) — 我读代码时的疑问，等策划/程序回答
- [_stubs.md](_stubs.md) — 各章骨架大纲（写到某章时拆出去）
- [progress.md](progress.md) — **会话间接续用**：当前进度、下一步、恢复上下文指南

## 权威代码位置

**服务器仓库**：`F:\G36Branch\LumiServer\`（git，gitlab-game.bilibili.co/g10_excalibur/lumigoserver）
**当前基线 commit**：`1bf7b708d` @ 2026-09-12（OB-dev 分支；8d59ed518→1bf7b708d battle 目录零改动）

| 关注点 | 代码路径 | 说明 |
|---|---|---|
| 顶层架构文档 | `battle/ARCHITECTURE.md` | 服务器进程/线程/网络架构 |
| 战斗核心说明 | `battle/BattleCore/README.MD` | 战斗核心模块说明 |
| 战斗系统入口 | `battle/BattleCore/BattleSystem/BattleGameSystem.cs` | 一场战斗的顶层实体 |
| 战斗常量 | `battle/BattleCore/BattleSystem/BattleDefine.cs` | Tick / 同步间隔 / 事件 ID 等常量 |
| 属性元素 | `battle/BattleCore/BattleSystem/BattleLumiAttributeElem.cs` | Lumi 战斗属性数据结构 |
| 组件根目录 | `battle/BattleCore/Component/` | 血量/攻击/技能/被动/Buff 等能力组件 |
| 事件系统 | `battle/BattleCore/Event/` | EventMgr.Subscribe / SendEvent |
| 状态机 | `battle/BattleCore/Fsm/` + `StateGraphs/` | 回合流程状态机 |
| 单例管理 | `battle/BattleCore/Singleton/` | ClientSingletonMgr |
| 战斗生命周期处理 | `battle/GamePlay/` `battle/BattleCluster/` | 创建/结束/BanPick 等业务流程 |
| 表数据 | `battle/Table/` + `battle/Config/` | Luban 导表 & 战斗设置 |
| 协议 | `battle/Proto/` | S2S / C2S 协议定义 |
| 策划向文档 | `battle/docs/` | 官方策划文档，本知识库应引用不复述 |

### 表数据两处对齐

**注意区分**：
- **游戏侧表**（wiki 用）：`F:\G36\LumiGoDesigner\Config\Luban\Datas\check\data\` — Lumi.json, ActiveSkill.json, BattleConst.json 等
- **战斗服表**：`F:\G36Branch\LumiServer\battle\Table\` — 战斗服自己维护的表副本

两者由 Luban 导表工具生成，理论应一致。分析时如果发现数值对不上，先检查是否用错表。

## 工作流程约定

### 1. 读代码前先同步

```bash
cd F:/G36Branch/LumiServer
git status         # 确认没有本地脏改动
git pull           # 拿最新代码
```

**每天首次读代码时**再多跑一步，看战斗侧最近有啥变化：

```bash
git log --oneline --since="1 day ago" -- battle/
```

### 2. 写文档 = 交叉验证

每写一章都必须做到：

- **公式类**：能对上表数据（如伤害公式对上 `BattleConst.json`），对不上就是理解错了
- **代码类**：引用具体文件+函数名，不引用行号（代码会变，位置不稳）
- **规则类**：能举出至少 1 个具体例子（"X 场景下 Y 会怎样"）

### 3. 疑问先记 unknowns

读代码遇到不确定的，**立刻写进 `unknowns.md`**，不要瞎猜写进正文。攒够一批一次性问用户/策划/程序。

### 4. 每章结尾登记基线

每章末尾必须有：

```
> 最后验证于 commit <hash>，日期 YYYY-MM-DD
> 关键代码：<file path>::<function/class>
```

未来 git log 可以 diff 出这个 commit 到 HEAD 战斗代码的变化，判断文档是否要更新。

## 后续目标

这个知识库要支撑三件事：

1. **已上线噜咪的平衡分析**：结合 battle_end 数据，我能给出量化建议
2. **未上线噜咪的理论评估**：读技能表 + 走一遍伤害公式，能预判强度
3. **配队推荐**：基于角色定位聚类 + 协同规则，能给未上线噜咪配理论最优阵容

## 更新记录

| 日期 | 章节 | 变更 | commit |
|---|---|---|---|
| 2026-09-11 | 初始骨架 | 建 README + 00-overview + glossary + unknowns + _stubs | 服务端基线 fbb25c313 |
| 2026-09-11 | 00-overview | 修正错误：不是回合制，是半即时制（tick 心跳 + 普攻自动 + 技能玩家操作）；同步修 README/_stubs 里的 01 章描述 | fbb25c313 |
| 2026-09-11 | 02-damage-formula | 完整伤害公式 15 步 + 边界表 + 数值示例；纠正 STAB h=1.25（注释写错成 1.5） | fbb25c313 |
| 2026-09-11 | 03-stats | 属性五段乘积公式；LumiLevel 规律 `levelFixed = 10+Level`；LumiBreak `= 1.1^BreakLv`；确认 WorkState 不进战斗 | fbb25c313 |
| 2026-09-11 | 01-battle-tick | 一图流 tick + 常量表 + BattleGameRunType 阻塞态 + Lumi FSM + 普攻链路（CachedAction/AI 支援）+ Mana + 换宠三路径 + 疲劳超时；4 条新 unknowns | 8d59ed518 |
| 2026-09-11 | 01/换宠+普攻历史遗留 | 策划确认：普攻早期手动→自动（底层保留手发协议）、换宠早期扣蓝→CD（配表 BattleSwitchMana=0）；新建 `battle-design-evolution` memory 提炼通用模式 | 8d59ed518 |
| 2026-09-11 | 05-buffs-debuffs | 分析视角补充（不复述官方 buff-system.md）：决策地图 / 字段-伤害公式交叉表 / ModifyAttackSpeed 精确公式（`sourceTime/(1+Σ/10000)` 加法叠加，回填 01 章 unknown）/ 免疫 3 层过滤 / 触发时序 / 子系统边界 / 木棍人平衡分析 | 8d59ed518 |
| 2026-09-11 | 06-passives-triggers | 核心澄清"被动=buff 系统初始化包装器（PassiveSkill.Update 是空的）"；三个来源（全局+Lumi 自身+进化前）；Priority 分布 244 条 98% 是 1；Target 7 种 + 2v2 差异；家园被动完全不进战斗（代码 grep 验证）；递归防护仅 AddbuffToAny 一处 | 8d59ed518 |
| 2026-09-11 | 07-battle-modes | EBattleType 21 种完整枚举 + Pvp/Pve 分派点；阵容规则 1v1/2v2（SlotNum=2 每玩家 3 lumi 最多 12 只）；胜负判定 TeamAllDeadId；BanPick 三阶段 30s；AI 支援 6 环节（默认 Top 级）；疲劳机制；各模式差异速查表 | 8d59ed518 |
| 2026-09-11 | 04-skills | SkillType 分布 954 条（主动 581/普攻 373/特殊 0）；SkillCost[] 三元数组解析；Mana vs Life 两种资源形态；生命周期六步 OnEnter→OnHit→OnDoDamage→OnExit→OnFinalExit；SkillEffect+SkillTriggerType 与 buff 系统桥接；CastCondition -1 特殊值；SkillValueChange 动态成本；TargetType 三种索敌；TrainerSkill 4 种 | 8d59ed518 |
