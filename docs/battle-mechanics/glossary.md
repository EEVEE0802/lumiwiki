# 战斗关键字词典

> 记录游戏里出现的战斗关键字（BattleKeywordDes 里的那些），映射到服务端实现，方便看到技能描述时能秒定位到具体代码逻辑。
>
> **状态**：占位，等我通读 `BattleKeywordDes.json` + `battle/BattleCore/Component/` 后逐条填充。

## 结构模板

每个关键字按这个格式写：

```
### 攻击（Battle_Keyword_Attack，示例）

- **游戏内描述**：<从 BattleKeywordDes.json 取>
- **数值含义**：<面板显示的攻击是哪个属性？受什么影响？>
- **服务端实现**：<文件路径>::<函数/类>
- **典型场景**：<举 1-2 个含此关键字的技能名字>
- **常见误解**：<玩家/新策划容易搞错的地方>
```

## 待填清单

从 `public/data/BattleKeywordDes.json` 拉一遍全量关键字，按拼音/字母序编入。

例：

- [ ] 攻击（Attack）
- [ ] 防御（Defense）
- [ ] 生命（HP）
- [ ] 速度（Speed / Fv）
- [ ] 工作值（WorkState）
- [ ] 暴击 / 会心
- [ ] 闪避 / 命中
- [ ] 属性克制
- [ ] 灼烧 / 中毒 / 麻痹（各种异常状态）
- [ ] 减攻 / 减防
- [ ] 护盾 / 护甲
- [ ] 陷阱
- [ ] 术式领域
- [ ] ...

---

> 最后验证于：**未开始**
> 关键代码：`public/data/BattleKeywordDes.json`（游戏侧）+ `battle/BattleCore/Component/`（服务端）
