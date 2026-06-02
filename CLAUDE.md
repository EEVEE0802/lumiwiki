# LumiWiki 项目开发文档

## 数据源位置

**原始数据位置**：`D:\G36Branch\LumiGoProgram\LumiGoDesigner\Config\Luban\Datas\Table\data`

**枚举定义文件**：`D:\G36Branch\LumiGoProgram\LumiGoDesigner\Config\Luban\Datas\__enums__.xlsx`

**项目数据位置**：`D:\LumiWiki\public\data\`

### 数据更新命令

当用户说「更新数据」或「刷新数据」时，需要：

1. 从 `D:\G36Branch\LumiGoProgram\LumiGoDesigner\Config\Luban\Datas\Table\data` 拷贝最新数据
2. 覆盖到 `D:\LumiWiki\public\data\` 对应文件
3. 从 `__enums__.xlsx` 中提取最新的枚举映射关系

### 主要数据文件映射

| Wiki 中的文件 | 原始文件名 | 说明 |
|--------------|-----------|------|
| ActiveSkill.json | ActiveSkill.json | 主动技能数据 |
| BattlePassive.json | BattlePassive.json | 战斗被动技能 |
| HomePassive.json | HomePassive.json | 家园被动技能 |
| Item.json | Item.json | 物品数据 |
| Lumi.json | Lumi.json | 噜咪数据 |
| localization.json | localization.json | 多语言文本（重要，经常更新） |
| LumiTypeCounter.json | LumiTypeCounter.json | 属性克制关系 |
| LumiEvolution.json | LumiEvolution.json | 进化数据 |
| BattleKeywordDes.json | BattleKeywordDes.json | 战斗关键字描述 |

## 枚举映射关系

### Table.LumiTag - 赛季

| 值 | 英文名 | 中文名 |
|----|-------|-------|
| 0 | None | 未投放 |
| 1 | Normal | 主线 |
| 2 | Season1 | S1 |
| 3 | Season2 | S2 |
| 4 | Season3 | S3 |
| 5 | Season4 | S4 |

### Table.LumiType - 属性

| 值 | 英文名 | 中文名 | 颜色 |
|----|-------|-------|------|
| 0 | None | 无属性 | #A8A878 |
| 1 | Neutral | 无 | #A8A878 |
| 2 | Water | 水 | #6890F0 |
| 3 | Fire | 火 | #F08030 |
| 4 | Grass | 草 | #78C850 |
| 5 | Lighting | 电 | #F8D030 |
| 6 | Earth | 地 | #C0A060 |
| 7 | Fly | 飞 | #A890F0 |
| 8 | Ice | 冰 | #98D8D8 |
| 9 | Dragon | 龙 | #7038F8 |
| 10 | Bright | 光 | #FFD700 |
| 11 | Dark | 暗 | #705848 |
| 12 | Fight | 格斗 | #C03028 |
| 13 | Psychic | 超能 | #F85888 |
| 14 | Fairy | 妖精 | #EE99AC |
| 15 | Steel | 钢 | #B8B8D0 |
| 16 | King | 王 | #FF6347 |
| 17 | God | 神 | #E0C050 |

### Table.WorkType - 工作能力

| 值 | 英文名 | 中文名 |
|----|-------|-------|
| 0 | Null | 无 |
| 1 | HandWorking | 手工 |
| 2 | Logging | 伐木 |
| 3 | Planting | 种植 |
| 4 | Wishing | 许愿 |
| 5 | Firing | 烧菜 |
| 6 | Exploring | 探索 |
| 7 | Feeding | 饲养 |
| 8 | Powering | 发电 |
| 9 | Mining | 采矿 |
| 10 | Freezing | 制冷 |
| 11 | ApplePlanting | 苹果园 |
| 12 | FishFeeding | 养鱼 |
| 13 | Feeding2 | 饲养2 |
| 14 | NectarSecreting | 酿蜜 |
| 15 | FishFarming | 水产养殖 |

### Table.Rarity - 稀有度

| 值 | 英文名 | 中文名 | 颜色 |
|----|-------|-------|------|
| 1 | White | 普通 | #9e9e9e |
| 2 | Green | 稀有 | #4caf50 |
| 3 | Blue | 史诗 | #2196f3 |
| 4 | Purple | 传说 | #ff9800 |
| 5 | Gold | 神话 | #e91e63 |

### Table.Quality - 品质

| 值 | 英文名 | 中文名 |
|----|-------|-------|
| 0 | Null | 无 |
| 1 | White | 白 |
| 2 | Green | 绿 |
| 3 | Blue | 蓝 |
| 4 | Purple | 紫 |
| 5 | Gold | 金 |
| 6 | Color | 彩 |

### Table.SkillType - 技能类型

| 值 | 英文名 | 中文名 |
|----|-------|-------|
| 0 | Nornal | 普攻 |
| 1 | Attack | 主动技能 |
| 2 | Special | 特殊技能 |

### Table.SkillTargetType - 技能目标类型

| 值 | 英文名 | 中文名 |
|----|-------|-------|
| 1 | Main | 主目标 |
| 2 | Secend | 副目标 |
| 3 | All | 全部 |

## 开发注意事项

### ⚠️⚠️⚠️ 端口配置（绝对重要！！！）

# 🚨🚨🚨 端口必须是 3005！绝对不能改！！！ 🚨🚨🚨

- **固定端口：3005**
- **本机访问：http://localhost:3005**
- **局域网访问：http://10.27.17.179:3005**

### 重要规则（违反必究！）
1. ❌ **严禁**使用其他端口（如 3006、5173 等）
2. ❌ **严禁**修改 vite.config.js 中的 port 配置
3. ❌ **严禁**让 Vite 自动选择"可用端口"
4. ✅ **必须**确保端口 3005 被此项目占用
5. ✅ **如果 3005 被占用** → 先杀掉占用进程，再启动

### 杀掉占用端口的命令
```bash
# 查找占用 3005 的进程
netstat -ano | findstr ":3005"

# 杀掉进程（替换 <PID>）
taskkill /F /PID <PID>
```

### 技能描述格式

技能描述中可能包含以下特殊格式：

1. **多语言引用**：`[Battle_Target_Enemy]` → 从 localization.json 查找对应文本
2. **参数替换**：`{0}`, `{1}` → 从 DesParam 数组获取参数值
3. **颜色标签**：`<color=red>文字</color>` → 文字显示为红色
4. **关键字链接**：`<link=8><color=red>攻击</color></link>` → 点击显示关键字描述

### 属性克制显示

伤害倍率显示规则：
- ≥20000 (2.0x): 双箭头 ↑↑
- 15000-19999 (1.5x-1.99x): 单箭头 ↑
- 5000-9999 (0.5x-0.99x): 单箭头 ↓
- ≤5000 (0.5x): 双箭头 ↓↓
- 其他: 无箭头

箭头颜色：
- 上升（克制）：红色 ↑
- 下降（抵抗）：绿色 ↓

## 项目结构

```
LumiWiki/
├── public/
│   ├── data/           # JSON 数据文件
│   └── images/         # 图片资源
│       ├── avatars/    # 噜咪头像
│       └── skills/     # 技能图标
├── src/
│   ├── components/     # Vue 组件
│   ├── data/          # 数据加载和工具函数
│   │   └── index.js   # 数据加载、枚举映射
│   └── views/         # 页面视图
│       ├── LumiDetail.vue   # 噜咪详情页
│       ├── SkillList.vue    # 技能图鉴页
│       └── TypeChart.vue    # 属性克制表
└── CLAUDE.md          # 本文档
```
