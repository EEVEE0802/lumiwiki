# LumiWiki 数据更新指南

本文档记录了线上战斗数据（OnlineData）的处理流程和注意事项。

---

## 🚀 快速开始

### 每周数据更新流程

当收到新的一周数据时，按以下步骤操作：

```bash
# 1. 归档上周天梯数据（如果是第2周及以后）
mv data/battle_end.csv data/archive/week{N-1}/ladder_week{N-1}.csv

# 2. 放入本周天梯数据到 data/archive/week{N}/ladder_week{N}.csv

# 3. 运行天梯数据处理
npm run process-data:week {N}

# 4. 放入本周周赛数据到 data/archive/week{N}/tournament_week{N}.csv

# 5. 运行周赛数据处理
npm run process-tournament:week {N}

# 6. 更新周列表配置（可选）
# 编辑 public/data/online/weekly/weeks.json
```

---

## 📁 数据文件位置

### 工作文件（当前使用）
- **天梯数据**: `D:/LumiWiki/data/`
  - `battle_end.csv` - 天梯战斗结束数据（主要数据源）

### 归档文件（历史数据）
- **归档目录**: `D:/LumiWiki/data/archive/`
  - `week1/ladder_week1.csv` - 天梯第1周数据
  - `week1/tournament_week1.csv` - 周赛第1周数据
  - `week2/ladder_week2.csv` - 天梯第2周数据
  - `week2/tournament_week2.csv` - 周赛第2周数据
  - ...

### 输出数据
- **最新数据**: `D:/LumiWiki/public/data/online/battle-stats.json`
- **周数据**: `D:/LumiWiki/public/data/online/weekly/`
  - `ladder-week1.json` - 天梯第1周数据
  - `ladder-week2.json` - 天梯第2周数据
  - `tournament-week1.json` - 周赛第1周数据
  - `tournament-week2.json` - 周赛第2周数据
  - ...

## 🎮 玩法说明

### 天梯模式
- 持续开放的1v1对战玩法
- 包含真人玩家和人机
- 分6个段位：青铜、白银、黄金、钻石、星耀、传说
- 可筛选是否包含人机

### 周赛模式
- 每周开放一次的高端对战玩法
- 仅限真人玩家参与（无人机）
- 不区分段位
- 数据独立统计和展示

## 🔧 数据处理脚本

### 天梯数据
**脚本位置**: `D:/LumiWiki/scripts/process-battle-data.js`

**运行命令**:
```bash
cd D:/LumiWiki
# 处理最新数据（输出到 battle-stats.json）
npm run process-data

# 处理指定周数据（输出到 weekly/ladder-weekN.json）
npm run process-data:week N
# 例如：npm run process-data:week 2
```

### 周赛数据
**脚本位置**: `D:/LumiWiki/scripts/process-tournament-data.js`

**运行命令**:
```bash
cd D:/LumiWiki
# 处理指定周数据（输出到 weekly/tournament/tournament-weekN.json）
npm run process-tournament:week N
# 例如：npm run process-tournament:week 1
```

## ⚠️ 今天遇到的所有问题和解决方案

### 1. CSV 文件 BOM 问题

**问题**: CSV 文件开头有 UTF-8 BOM 字符（﻿），导致字段名解析失败

**解决方案**: 在解析 CSV 头部时去除 BOM
```javascript
headers = parseCSVLine(line).map(h => h.replace(/^﻿/, '').trim())
```

### 2. CSV 字段引号转义问题

**问题**: CSV 中 JSON 字段使用双引号转义（`""` 代替 `"`），导致 JSON 解析失败

**解决方案**: 解析 JSON 前先处理转义
```javascript
const jsonStr = row.player_lumis.replace(/""/g, '"')
lumis = JSON.parse(jsonStr)
```

### 3. 内存溢出问题

**问题**: 一次性加载整个 CSV 文件导致内存溢出（412717 条记录）

**解决方案**: 使用流式处理（readline）逐行读取，避免一次性加载全部数据

### 4. 人机判断逻辑错误

**问题**: 最初用 `player_type=3` 判断人机，导致段位分组数据不准确

**正确逻辑**:
- 第一遍扫描：收集每场游戏是否有人机（通过 `player_type=3` 判断）
- 第二遍扫描：根据游戏的人机信息和玩家段位更新对应的统计组合

### 5. 高级段位人机对战问题

**问题**: 高级段位（rank=151）不允许人机对战，但数据显示 `high-with-bot` 有数据

**原因**: `rank=151` 且有人机的战斗实际发生在中级段位（150胜后升级到151）

**解决方案**: 
```javascript
function getBattleRankGroup(rank, hasBot) {
  if (rank === 151 && hasBot) {
    return 'star' // 归到星耀段位
  }
  // ... 其他逻辑
}
```

**特殊处理**: 传说段位（151）的 with-bot 和 no-bot 数据应该相同
```javascript
function shouldCountBoth(rank) {
  return rank === 151
}
```

### 6. 玩家段位分布计算错误

**问题**: 最初用最后一次战斗的段位作为最终段位，数据不准确

**正确计算方法**:
- 统计每个 `role_id`（b_role_id）在 `battle_end.csv` 中所有 `player_type=1` 的记录
- 取每个 `role_id` 的 `rank` **最大值**作为最终段位
```javascript
if (playerType === 1 && !isNaN(rank) && rank >= 1) {
  const currentMax = playerMaxRank.get(b_role_id) || 0
  if (rank > currentMax) {
    playerMaxRank.set(b_role_id, rank)
  }
}
```

## 📊 段位分组定义

```javascript
const rankGroups = [
  { key: 'bronze', start: 1, end: 30, label: '青铜' },
  { key: 'silver', start: 31, end: 60, label: '白银' },
  { key: 'gold', start: 61, end: 90, label: '黄金' },
  { key: 'diamond', start: 91, end: 120, label: '钻石' },
  { key: 'star', start: 121, end: 150, label: '星耀' },
  { key: 'legend', start: 151, end: 151, label: '传说' }
]
```

## 🎯 数据处理流程

### 第一遍扫描：收集基础信息

1. 收集每场游戏是否有人机（`gameHasBotMap`）
   - 如果任何参与者的 `player_type=3`，该游戏标记为有人机

2. 收集每个玩家的最大段位（`playerMaxRankMap`）
   - 只统计 `player_type=1`（真实玩家）
   - 取每个 `b_role_id` 的 `rank` 最大值

### 第二遍扫描：统计数据

1. 只处理 `player_type=1` 的真实玩家
2. 根据游戏的人机信息和玩家段位，更新对应的统计组合
3. 特殊处理：`rank=151` 的战斗同时计入 `with-bot` 和 `no-bot`

### 输出数据结构

```json
{
  "updateTime": "2026-05-14T...",
  "totalBattles": 235705,
  "rankGroups": [...],
  "allRanks": [1, 2, 3, ..., 151],
  "stats": {
    "all-with-bot": { "appearance": [...], "winRate": [...], "totalBattles": ..., "rankRange": {...} },
    "all-no-bot": {...},
    "bronze-with-bot": {...},
    "bronze-no-bot": {...},
    // ... 其他组合
  },
  "highRankTeams": [...],
  "playerRankDistribution": {
    "bronze": 10441,
    "silver": 1799,
    "gold": 711,
    "diamond": 768,
    "star": 367,
    "legend": 85,
    "total": 14171
  }
}
```

## 🔄 数据更新步骤

当用户更新数据后：

1. **确认数据文件已更新**: 
   - 检查 `D:/LumiWiki/data/battle_end.csv` 的修改时间

2. **运行数据处理脚本**:
   ```bash
   cd D:/LumiWiki
   npm run process-data
   ```

3. **验证输出结果**:
   - 检查控制台输出的统计信息是否合理
   - 特别检查 `legend-with-bot` 和 `legend-no-bot` 是否相同

4. **刷新浏览器验证**:
   - 访问 http://localhost:3005/online-data
   - 测试不同段位和是否包含人机的筛选
   - 检查玩家分布图是否正确显示

## ❌ 常见错误和检查点

### 错误1: 段位分组数据为空
**检查**: 是否正确处理了 BOM 字符

### 错误2: all-with-bot 和 all-no-bot 数据相同
**检查**: 人机判断逻辑是否正确

### 错误3: high-with-bot 有数据但应该是 0
**检查**: 是否正确处理了 rank=151 且有人机的情况

### 错误4: 玩家分布数据不合理
**检查**: 是否取最大值作为最终段位

### 错误5: 内存溢出
**检查**: 是否使用了流式处理

## 📝 输出示例

```
数据处理完成！
输出文件: D:\LumiWiki\public\data\online\battle-stats.json

各组合的战斗场次:
  all-with-bot: 177956 场
  all-no-bot: 58780 场
  bronze-with-bot: 103740 场
  bronze-no-bot: 13593 场
  ...

玩家段位分布:
  青铜 (1-30): 10441 人
  白银 (31-60): 1799 人
  黄金 (61-90): 711 人
  钻石 (91-120): 768 人
  星耀 (121-150): 367 人
  传说 (151): 85 人
  总计: 14171 人
```

## 🎨 前端组件位置

- **组件文件**: `D:/LumiWiki/src/views/OnlineData.vue`
- **路由**: `/online-data`
- **功能标签**:
  - 📈 出场率榜
  - 🏆 胜率榜
  - 👥 队伍列表
  - 👤 玩家分布

### 新增功能（多周数据支持）

#### 周选择器
- 页面顶部显示可用的周数据
- 点击切换查看不同周的数据

#### 对比模式
- 勾选「对比模式」可开启双周对比
- 选择要对比的周次，实时显示变化趋势
- 变化指示器：
  - 🟢 `↑ 12.5%` - 上升
  - 🔴 `↓ 8.3%` - 下降
  - ⚪ `持平` - 无变化

#### 对比内容
- 总战斗场次变化
- 出场率变化（百分比）
- 胜率变化（百分点）
- 玩家段位分布变化

### 维护周列表

当添加新周数据时，需要更新 `public/data/online/weekly/weeks.json`：

```json
[
  { "week": 1, "label": "第1周", "fileName": "battle-stats-week1.json" },
  { "week": 2, "label": "第2周", "fileName": "battle-stats-week2.json" },
  { "week": 3, "label": "第3周", "fileName": "battle-stats-week3.json" }
]
```

---

## 📅 多周数据管理

### 天梯数据命名规范

原始数据文件命名格式：`ladder_week{N}.csv`

| 周次 | 文件名 |
|------|--------|
| 第1周 | `ladder_week1.csv` |
| 第2周 | `ladder_week2.csv` |
| 第3周 | `ladder_week3.csv` |

### 周赛数据命名规范

原始数据文件命名格式：`tournament_week{N}.csv`

| 周次 | 文件名 |
|------|--------|
| 第1周 | `tournament_week1.csv` |
| 第2周 | `tournament_week2.csv` |
| 第3周 | `tournament_week3.csv` |

### 每周操作流程

**第2周及以后的数据处理步骤**：

1. **归档上周天梯数据**
   ```bash
   mv data/battle_end.csv data/archive/week{N-1}/ladder_week{N-1}.csv
   ```

2. **放入本周天梯数据**
   ```bash
   # 放到 data/archive/week{N}/ 目录
   # 例如：data/archive/week2/ladder_week2.csv
   ```

3. **处理天梯数据**
   ```bash
   npm run process-data:week {N}
   ```

4. **放入本周周赛数据**
   ```bash
   # 放到 data/archive/week{N}/ 目录
   # 例如：data/archive/week2/tournament_week2.csv
   ```

5. **处理周赛数据**
   ```bash
   npm run process-tournament:week {N}
   ```

6. **验证输出**
   ```bash
   ls public/data/online/weekly/ladder-week{N}.json
   ls public/data/online/weekly/tournament-week{N}.json
   ```

7. **更新周列表**（可选）
   ```bash
   # 在 weeks.json 中添加新周信息
   ```

### 目录结构示例

```
D:/LumiWiki/
├── data/
│   ├── archive/                      ← 历史数据归档（天梯和周赛在同一层级）
│   │   ├── week1/
│   │   │   ├── ladder_week1.csv     ← 天梯数据
│   │   │   └── tournament_week1.csv ← 周赛数据
│   │   ├── week2/
│   │   │   ├── ladder_week2.csv
│   │   │   └── tournament_week2.csv
│   │   └── week3/                   ← 预留空目录
│   └── battle_end.csv               ← 当前工作文件
│
└── public/data/online/
    ├── battle-stats.json            ← 最新数据（兼容性保留）
    └── weekly/                      ← 周数据（天梯和周赛在同一层级）
        ├── weeks.json               ← 周列表配置
        ├── ladder-week1.json        ← 天梯数据
        ├── ladder-week2.json
        ├── tournament-week1.json    ← 周赛数据
        └── tournament-week2.json
```

---

**重要提醒**: 
- ✅ 不要修改数据处理脚本的核心逻辑
- ✅ 不要更改 CSV 解析函数（已处理 BOM 和转义）
- ✅ 不要修改段位分组定义
- ✅ 每次更新数据后都要验证 `legend-with-bot` 和 `legend-no-bot` 是否相同
