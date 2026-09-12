# 各章骨架大纲

> 未开始写的章节先把骨架集中放这里，等真的动笔某章再拆成独立 md 文件。避免建一堆空 md 污染目录。

---

<!-- 01 已单独成文，见 01-battle-tick.md -->

---

## 02 · 伤害公式

**关键代码**：`battle/BattleCore/Component/Combat/`, `battle/BattleCore/Component/Health/`, `battle/BattleCore/BattleRandom/`

**表数据**：`BattleConst.json`, `LumiLevel.json`, `LumiBreak.json`, `LumiStarUp.json`, `LumiTypeCounter.json`

**需要覆盖的问题**：
- 基础伤害公式（可能类似宝可梦 `Damage = ((2*Lv/5+2) * Power * Atk/Def) / 50 + 2`）
- 属性克制怎么乘（LumiTypeCounter 里的 5000/10000/15000/20000 数值实际怎么参与运算）
- 暴击倍率 & 判定
- 闪避 & 命中率
- 伤害浮动范围（RNG）
- 会心 / 反击等特殊判定
- STAB（same-type-attack-bonus，同属性攻击加成）是否存在
- 多目标 / AoE 是否有伤害衰减
- 护甲、护盾如何减伤（Armor 组件）
- 反射伤害机制（如果有）

**验证方法**：写完公式后，抓几场 battle_end 里带完整伤害数字的样本，手算对比 → 完全对上才算解读成功。

---

## 03 · 属性体系

**关键代码**：`battle/BattleCore/BattleSystem/BattleLumiAttributeElem.cs`, `BattleConst.cs`

**表数据**：`Lumi.json`(BaseState 系列), `BattleConst.json`, `LumiLevel.json`, `LumiBreak.json`, `LumiStarUp.json`

**需要覆盖的问题**：
- 6 大属性（HP/攻/防/速/工作值/？）到底哪几个进入战斗计算？（工作值是家园用的还是战斗用？）
- Lumi.json 的 BaseState 数值 → 战斗实际数值的换算公式
- 等级 / 突破 / 星级 各自贡献多少？是加成还是乘算？
- 稀有度对面板值的影响（普通 vs 神话相差几倍？）
- Fv 是什么？速度还是别的？
- 「个体值 / 努力值」这种宝可梦式概念存不存在

---

<!-- 04 已单独成文，见 04-skills.md -->

---

<!-- 05 已单独成文，见 05-buffs-debuffs.md -->

---

<!-- 06 已单独成文，见 06-passives-triggers.md -->

---

<!-- 07 已单独成文，见 07-battle-modes.md -->

---

<!-- 08 已单独成文，见 08-ai-behavior.md -->

---

## 附录候选

- **附录 A**：`BattleCreateArgs` 协议全字段解读（上游给战斗服的输入）
- **附录 B**：`BattleStartElem` 里 Lumi 战斗初始状态字段
- **附录 C**：`battle_end` 事件字段解读（跟 daily CSV 对上）
- **附录 D**：伪随机同步细节（种子生成、调用顺序约束）
