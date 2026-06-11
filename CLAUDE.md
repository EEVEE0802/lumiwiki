# LumiWiki 项目开发文档

## 技术栈

- Vue 3 + Vite、Vue Router 4（Hash 模式）
- 静态 JSON 数据 + CSS Variables
- 端口 **3005**（固定，严禁修改）
- 内网地址：`http://10.27.17.179:3005`

## 项目结构

```
LumiWiki/
├── public/
│   ├── data/                        # JSON 数据文件
│   │   ├── online/                  # 线上战斗数据
│   │   │   ├── battle-stats.json    # 最新天梯数据（兼容性保留）
│   │   │   └── weekly/              # 周数据
│   │   │       ├── weeks.json       # 周列表配置
│   │   │       ├── ladder-weekN.json
│   │   │       └── tournament-weekN.json
│   │   ├── extra.json               # 社区维护扩展数据
│   │   ├── zh-CN.json 等            # 多语言文件
│   │   └── ...                      # 游戏核心数据
│   └── images/                      # 图片资源
├── data/
│   ├── battle_end.csv               # 当前天梯工作文件
│   └── archive/                     # 历史数据归档
│       └── weekN/
│           ├── ladder_weekN.csv
│           └── tournament_weekN.csv
├── scripts/
│   ├── process-battle-data.js       # 天梯数据处理
│   └── process-tournament-data.js   # 周赛数据处理
├── src/
│   ├── components/                  # Vue 组件
│   ├── composables/useLanguage.js   # 多语言状态
│   ├── data/index.js                # 数据加载、枚举映射
│   ├── views/
│   │   ├── OnlineData.vue           # 线上数据页面
│   │   ├── LumiDetail.vue           # 噜咪详情
│   │   ├── SkillList.vue            # 技能图鉴
│   │   └── TypeChart.vue            # 属性克制表
│   └── router/
├── prepare-i18n-data.cjs            # 多语言数据转换
├── sync-extra-data.cjs              # 扩展数据同步
└── publish.sh                       # 发布脚本
```

---

## 数据源

**游戏原始数据**：`D:\G36\LumiGoProgram\LumiGoDesigner\Config\Luban\Datas\Table\data`
**枚举定义**：`D:\G36\LumiGoProgram\LumiGoDesigner\Config\Luban\Datas\__enums__.xlsx`
**项目数据**：`D:\LumiWiki\public\data\`

### 核心数据文件

| Wiki 文件               | 原始文件名                 | 说明         |
| --------------------- | --------------------- | ---------- |
| ActiveSkill.json      | ActiveSkill.json      | 主动技能       |
| BattlePassive.json    | BattlePassive.json    | 战斗被动技能     |
| HomePassive.json      | HomePassive.json      | 家园被动技能     |
| Item.json             | Item.json             | 物品         |
| Lumi.json             | Lumi.json             | 噜咪基础数据     |
| LumiEvolution.json    | LumiEvolution.json    | 进化链        |
| LumiTypeCounter.json  | LumiTypeCounter.json  | 属性克制       |
| BattleKeywordDes.json | BattleKeywordDes.json | 战斗关键字描述    |
| localization.json     | MultilingualCN.json   | 多语言（需转换格式） |

---

## 游戏数据更新

从游戏原始数据目录更新核心数据文件：

```bash
# 1. 复制核心数据文件
SRC="D:/G36/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/Table/data"
DST="D:/LumiWiki/public/data"
cp "$SRC/ActiveSkill.json" "$SRC/BattlePassive.json" "$SRC/HomePassive.json" "$DST/"
cp "$SRC/Lumi.json" "$SRC/LumiEvolution.json" "$SRC/LumiTypeCounter.json" "$DST/"
cp "$SRC/Item.json" "$SRC/BattleKeywordDes.json" "$DST/"

# 2. 必须运行：转换多语言数据
cd D:/LumiWiki && node prepare-i18n-data.cjs

# 3. 删除 .encoded 缓存文件（否则浏览器显示旧数据）
rm -f public/data/*.encoded
```

**注意**：前端使用 `zh-CN.json` 等多语言文件，不是 `localization.json`，所以第 2 步是必须的。

---

## 线上战斗数据更新

### 玩法说明

- **天梯**：持续开放的 1v1 对战，含真人和人机，分 6 个段位（青铜→传说），可筛选是否含人机
- **周赛**：每周开放的高端对战，仅真人，不区分段位，3 负出局最高 15 胜

### 段位分组

| 段位  | key     | rank 范围 |
| --- | ------- | ------- |
| 青铜  | bronze  | 1-30    |
| 白银  | silver  | 31-60   |
| 黄金  | gold    | 61-90   |
| 钻石  | diamond | 91-120  |
| 星耀  | star    | 121-150 |
| 传说  | legend  | 151     |

### 每周数据更新步骤

```bash
cd D:/LumiWiki

# 1. 归档上周天梯数据（第 2 周及以后）
mv data/battle_end.csv data/archive/week{N-1}/ladder_week{N-1}.csv

# 2. 放入本周数据到 data/archive/week{N}/
#    - ladder_week{N}.csv（天梯）
#    - tournament_week{N}.csv（周赛）

# 3. 处理天梯数据
npm run process-data:week {N}

# 4. 处理周赛数据
npm run process-tournament:week {N}

# 5. 更新 battle-stats.json 为最新周
cp public/data/online/weekly/ladder-week{N}.json public/data/online/battle-stats.json

# 6. 更新 weeks.json（添加新周条目）

# 7. 同步到 dist
cp public/data/online/weekly/ladder-week{N}.json dist/data/online/weekly/
cp public/data/online/weekly/tournament-week{N}.json dist/data/online/weekly/
cp public/data/online/battle-stats.json dist/data/online/
cp public/data/online/weekly/weeks.json dist/data/online/weekly/
```

### 常用命令

```bash
npm run process-data              # 处理最新天梯数据
npm run process-data:week N       # 处理第 N 周天梯
npm run process-tournament:week N # 处理第 N 周周赛
npm run dev                       # 启动开发服务器
npm run build                     # 构建生产版本
bash publish.sh                   # 一键发布（构建+停旧服务+启新服务）
```

### 数据处理注意事项

- CSV 文件有 UTF-8 BOM，解析时需去除
- CSV 中 JSON 字段用 `""` 转义双引号，解析前需替换
- 使用流式处理避免内存溢出
- `rank=151` 且有人机的战斗归到星耀段位
- 传说段位（151）的 with-bot 和 no-bot 数据应相同
- 玩家段位取每个 `b_role_id` 的 `rank` 最大值

---

## 协作编辑

同事通过腾讯文档维护噜咪扩展信息（体型、活动地图、关键特质、行为习惯）。

```bash
# 导出 CSV → 重命名为 extra-data.csv → 放项目根目录
node sync-extra-data.cjs   # 同步到 public/data/extra.json
```

CSV 表头：`噜咪ID,体型,活动地图,关键特质,行为习惯`

---

## 枚举映射

### LumiTag - 赛季

| 值   | 名称  |     | 值   | 名称  |
| --- | --- | --- | --- | --- |
| 0   | 未投放 |     | 3   | S2  |
| 1   | 主线  |     | 4   | S3  |
| 2   | S1  |     | 5   | S4  |

### LumiType - 属性

| 值   | 名称  | 颜色      |     | 值     | 名称  | 颜色              |
| --- | --- | ------- | --- | ----- | --- | --------------- |
| 1   | 无   | #A8A878 |     | 9     | 龙   | #7038F8         |
| 2   | 水   | #6890F0 |     | 10    | 光   | #FFD700         |
| 3   | 火   | #F08030 |     | 11    | 暗   | #705848         |
| 4   | 草   | #78C850 |     | 12    | 格斗  | #C03028         |
| 5   | 电   | #F8D030 |     | 13    | 超能  | #F85888         |
| 6   | 地   | #C0A060 |     | 14    | 妖精  | #EE99AC         |
| 7   | 飞   | #A890F0 |     | 15    | 钢   | #B8B8D0         |
| 8   | 冰   | #98D8D8 |     | 16/17 | 王/神 | #FF6347/#E0C050 |

### Rarity - 稀有度

| 值   | 名称  | 颜色      |     | 值   | 名称  | 颜色      |
| --- | --- | ------- | --- | --- | --- | ------- |
| 1   | 普通  | #9e9e9e |     | 4   | 传说  | #ff9800 |
| 2   | 稀有  | #4caf50 |     | 5   | 神话  | #e91e63 |
| 3   | 史诗  | #2196f3 |     |     |     |         |

### WorkType - 工作能力

0:无 1:手工 2:伐木 3:种植 4:祈愿 5:生火 6:探险 7:牧场 8:发电 9:采矿 10:制冷 11:种苹果 12:养鱼 13:牧场2 14:产花蜜 15:水产养殖

### SkillType - 技能类型

0:普攻 1:主动技能 2:特殊技能

### Quality - 品质

0:无 1:白 2:绿 3:蓝 4:紫 5:金 6:彩

---

## 技能描述格式

- 多语言引用：`[Battle_Target_Enemy]` → 从 localization.json 查找
- 参数替换：`{0}`, `{1}` → 从 DesParam 数组获取
- 颜色标签：`<color=red>文字</color>`
- 关键字链接：`<link=8><color=red>攻击</color></link>` → 点击弹窗

## 属性克制显示

| 伤害倍率          | 显示  | 颜色  |
| ------------- | --- | --- |
| ≥20000 (2.0x) | ↑↑  | 红色  |
| 15000-19999   | ↑   | 红色  |
| 5000-9999     | ↓   | 绿色  |
| ≤5000 (0.5x)  | ↓↓  | 绿色  |

---

## 多语言支持

支持 5 种语言（zh-CN、zh-TW、en、ja、ko），切换后 localStorage 持久化，未翻译内容 fallback 到简中。

## 内网发布

```bash
bash publish.sh   # 自动：构建 → 停旧服务 → 启新服务（端口 3005）
```

手动发布：`npm run build` → 杀掉 3005 端口 → `cd dist && python -m http.server 3005`

---

## 待办

- 全局搜索功能
- 噜咪对比工具
- 队伍搭配建议
- 技能效果模拟器
- 用户收藏功能
- 移动端适配优化
