# 数据更新操作指南

本文档提供每周数据更新的快速操作步骤。

---

## 📋 每周数据更新步骤

### 第一步：归档上周数据（第2周及以后需要）

```bash
# 归档天梯数据
mv D:/LumiWiki/data/battle_end.csv D:/LumiWiki/data/archive/week{N-1}/ladder_week{N-1}.csv
```

**示例（第2周）**：
```bash
mv D:/LumiWiki/data/battle_end.csv D:/LumiWiki/data/archive/week1/ladder_week1.csv
```

### 第二步：放入本周数据

将新的数据文件按命名规范放到对应目录：

| 数据类型 | 文件命名 | 目标目录 |
|---------|---------|---------|
| 天梯 | `ladder_week{N}.csv` | `D:/LumiWiki/data/archive/week{N}/` |
| 周赛 | `tournament_week{N}.csv` | `D:/LumiWiki/data/archive/week{N}/` |

**示例（第2周）**：
- 天梯：`D:/LumiWiki/data/archive/week2/ladder_week2.csv`
- 周赛：`D:/LumiWiki/data/archive/week2/tournament_week2.csv`

### 第三步：运行数据处理

```bash
cd D:/LumiWiki

# 处理天梯数据
npm run process-data:week {N}

# 处理周赛数据（如果有）
npm run process-tournament:week {N}
```

**示例（第2周）**：
```bash
npm run process-data:week 2
npm run process-tournament:week 2
```

### 第四步：验证输出

检查生成的文件：

```bash
ls D:/LumiWiki/public/data/online/weekly/
```

应该看到：
- `ladder-week{N}.json` - 天梯数据
- `tournament-week{N}.json` - 周赛数据

### 第五步：刷新浏览器

访问 http://localhost:3005/#/online-data 查看更新后的数据。

---

## 📂 目录结构说明

```
D:/LumiWiki/
├── data/
│   ├── battle_end.csv               # 当前工作文件（天梯最新）
│   └── archive/                     # 历史数据归档
│       ├── week1/
│       │   ├── ladder_week1.csv     # 天梯第1周
│       │   └── tournament_week1.csv # 周赛第1周
│       ├── week2/
│       └── week3/                   # 预留给下周
│
└── public/data/online/
    └── weekly/                     # 周数据输出
        ├── weeks.json               # 周列表配置
        ├── ladder-week1.json        # 天梯第1周
        ├── ladder-week2.json        # 天梯第2周
        └── tournament-week1.json    # 周赛第1周
```

---

## 🎮 玩法说明

### 天梯模式
- 持续开放的1v1对战
- 包含真人和人机
- 6个段位：青铜、白银、黄金、钻石、星耀、传说
- 可筛选是否包含人机

### 周赛模式
- 每周开放一次的高端对战
- 仅限真人（无人机）
- 不区分段位
- 3负出局，最高15胜

---

## 🔧 常用命令

```bash
# 处理天梯数据
npm run process-data           # 处理最新数据
npm run process-data:week N    # 处理第N周数据

# 处理周赛数据
npm run process-tournament:week N    # 处理第N周周赛数据

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

---

## ⚠️ 注意事项

1. **文件命名必须严格按照规范**，否则脚本无法找到文件
2. **天梯和周赛数据需要分别处理**，两者是独立的
3. **周数据文件会自动从归档目录读取**，不需要复制到工作目录
4. **处理完成后记得刷新浏览器**查看效果

---

## 📞 遇到问题？

如果遇到数据加载失败或显示异常：
1. 检查文件名是否正确
2. 检查文件是否放在正确的目录
3. 查看控制台是否有错误信息
4. 参考 `DATA_UPDATE_GUIDE.md` 获取详细信息
