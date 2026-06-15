# LumiWiki 线上数据页面使用说明

## 📊 功能概述

线上数据页面展示天梯1v1的实时统计数据，包括：
- 📈 **天梯1v1出场率榜** - 显示每个噜咪的出场次数和出场率
- 🏆 **天梯1v1胜率榜** - 显示每个噜咪的战斗场次、胜场数和胜率

## 🔄 数据更新流程

### 准备数据文件
将以下文件放置在 `D:\LumiWiki\data\` 目录：
- `battle_start.csv` - 战斗开始数据
- `battle_end.csv` - 战斗结束数据

### 运行转换脚本
```bash
cd D:\LumiWiki
node scripts/convert-battle-data.mjs
```

脚本会：
1. 读取 `battle_start.csv` 和 `battle_end.csv`
2. 关联两个文件的数据（通过 game_id）
3. 生成优化后的 JSON 文件到 `public/data/online/battle-stats.json`

### 清理缓存
```bash
rm -f D:/LumiWiki/public/data/*.encoded
```

或者删除浏览器缓存，然后刷新页面查看最新数据。

## 📋 数据说明

### 数据来源
- **battle_start.csv**: 战斗开始时房主发送的数据
  - `game_id`: 游戏ID
  - `real_player_num`: 真实玩家数量（1=人机对战，2=真人对战）

- **battle_end.csv**: 战斗结束后各玩家发送的数据
  - `game_id_str`: 游戏ID（与 battle_start 的 game_id 对应）
  - `player_type`: 玩家类型（1=真人，3=机器人）
  - `player_rank`: 战斗后的段位
  - `player_lumis`: 使用的噜咪队伍（JSON数组）
  - `battle_result`: 战斗结果（1=胜利，2=失败）

### 统计规则

#### 出场率计算
1. **只统计 player_type = 1 的记录**（真人玩家）
2. **分母** = 筛选条件下的总记录数（player_type=1 的条数）
3. **分子** = 该噜咪在这些记录中出现的次数
4. **出场率** = (出场次数 / 总记录数) × 100%
5. **升段局处理**：
   - 151段的人机对战 → 计入150段（升段局）
   - 91段的人机对战 → 计入90段（升段局）

#### 胜率计算
1. **胜场** = 该噜咪出场且获胜的次数
2. **总场次** = 该噜咪的总出场次数（胜场 + 负场）
3. **胜率** = (胜场 / 总场次) × 100%

#### 筛选条件
- **含人机**: 统计所有 player_type=1 的记录（包括 real_num=1 和 2）
- **不含人机**: 只统计 real_num=2 的游戏对应的记录

## 📊 数据结构

生成的 `battle-stats.json` 包含以下维度：

| 维度键 | 显示名称 | 段位范围 | 是否含人机 |
|--------|----------|----------|------------|
| all-with-bot | 全段位（含人机） | 1-151 | 是 |
| all-no-bot | 全段位（不含人机） | 1-151 | 否 |
| low-with-bot | 低级阶段（含人机） | 1-90 | 是 |
| low-no-bot | 低级阶段（不含人机） | 1-90 | 否 |
| mid-with-bot | 中级阶段（含人机） | 91-150 | 是 |
| mid-no-bot | 中级阶段（不含人机） | 91-150 | 否 |
| high-with-bot | 高级阶段（含人机） | 151 | 是 |
| high-no-bot | 高级阶段（不含人机） | 151 | 否 |

每个维度包含：
- `totalBattles`: 游戏场数（显示在页面上）
- `appearance`: 出场率榜数据
- `winRate`: 胜率榜数据

## 🖥️ 页面访问

- **开发环境**: http://localhost:3005/#/online-data
- **内网访问**: http://10.27.17.136:3005/#/online-data

## 📁 相关文件

### 数据文件
- `D:\LumiWiki\data\battle_start.csv` - 战斗开始原始数据
- `D:\LumiWiki\data\battle_end.csv` - 战斗结束原始数据
- `D:\LumiWiki\public\data\online\battle-stats.json` - 转换后的统计数据

### 脚本文件
- `D:\LumiWiki\scripts\convert-battle-data.mjs` - 数据转换脚本

### 页面文件
- `D:\LumiWiki\src\views\OnlineData.vue` - 线上数据页面组件
- `D:\LumiWiki\src\components\NavBar.vue` - 导航栏（已添加"线上数据"入口）
- `D:\LumiWiki\src\router\index.js` - 路由配置

## ⚠️ 注意事项

1. **端口固定**: 开发服务器必须使用 3005 端口
2. **数据同步**: 更新数据后必须清理缓存（.encoded 文件）
3. **升段局**: 151段/91段的人机对战会被归入前一个段位
4. **异常战斗**: 会被自动排除（没有对应 battle_end 的 battle_start）

## 🔄 快速更新命令

```bash
# 1. 将新的 CSV 文件复制到 data 目录
cp /path/to/new/battle_*.csv D:/LumiWiki/data/

# 2. 运行转换脚本
cd D:\LumiWiki && node scripts/convert-battle-data.mjs

# 3. 清理缓存
rm -f D:/LumiWiki/public/data/*.encoded

# 4. 刷新浏览器查看
```
