# LumiWiki 项目开发文档

## 技术栈

- Vue 3 + Vite、Vue Router 4（Hash 模式）
- 静态 JSON 数据 + CSS Variables
- 端口 **3005**（固定，严禁修改）
- 内网地址：`http://10.27.17.136:3005`

## Git 偏好

- **提交后直接 push 到远程**，不需要单独询问
- commit message 用中文，多个改动点用顿号分隔，正文用列表说明细节
- 敏感配置（token、webhook URL）写进 `.gitignore` 不进 git，配套提供 `.example` 模板

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
│   │   ├── robot-teams.json         # 机器人阵容（道馆/天梯/家园，由脚本生成）
│   │   ├── adventure/               # 冒险掉落
│   │   │   └── drop-rates.json      # 各地图噜咪出现概率（由脚本生成）
│   │   ├── egg-drop.json            # 蛋掉落（各蛋开出噜咪概率，由脚本生成）
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
│   ├── process-tournament-data.js   # 周赛数据处理
│   ├── process-robot-teams.js       # 机器人阵容数据处理
│   ├── convert-adventure-drop.mjs   # 冒险掉落数据处理
│   ├── process-egg-drop.mjs         # 蛋掉落数据处理
│   ├── ta-fetch.mjs                 # 数数平台 API 拉取（自动）
│   ├── ta-auth.mjs                  # Bearer Token 自动续期
│   ├── notify.mjs                   # 飞书/企业微信通知
│   ├── auto-update.mjs              # 自动更新总控（拉取+处理+发布）
│   ├── auto-update.bat              # Windows 任务计划 wrapper
│   └── ta-config.example.json       # 配置模板（ta-config.json 含 token 不进 git）
├── src/
│   ├── components/                  # Vue 组件
│   ├── composables/useLanguage.js   # 多语言状态
│   ├── data/index.js                # 数据加载、枚举映射
│   ├── views/
│   │   ├── OnlineData.vue           # 线上数据页面
│   │   ├── LumiDetail.vue           # 噜咪详情
│   │   ├── SkillList.vue            # 技能图鉴
│   │   ├── TypeChart.vue            # 属性克制表
│   │   ├── RobotTeam.vue            # 机器人阵容
│   │   ├── AdventureDrop.vue        # 冒险掉落
│   │   └── EggDrop.vue              # 蛋掉落
│   └── router/
├── prepare-i18n-data.cjs            # 多语言数据转换
├── sync-extra-data.cjs              # 扩展数据同步
└── publish.sh                       # 发布脚本
```

---

## 数据源

游戏原始数据（Luban 导表）分两套：
- **客户端导表**：`F:\G36\LumiGoDesigner\Config\Luban\Datas\Table\data` —— 展示/配置类（Lumi、技能、物品、属性克制、道馆 Gym、MonsterGroup、Monster、RobotData 等）
- **服务端导表**：`F:\G36\LumiGoDesigner\Config\Luban\Datas\server\data` —— 逻辑/匹配类（RobotLvMatching 天梯等级匹配、MatchLadder、MatchGroup 等）

> ⚠️ 找表时先确认属于客户端还是服务端，匹配/逻辑相关的表（如 RobotLvMatching）在 server 目录，别只在 Table 下找。

**枚举定义**：`F:\G36\LumiGoDesigner\Config\Luban\Datas\__enums__.xlsx`
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
SRC="F:/G36/LumiGoDesigner/Config/Luban/Datas/Table/data"
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

### 立绘资源更新

从游戏客户端资源目录同步噜咪立绘图片：

**立绘源目录**：`F:\G36\LumiGoProgram\Client\Assets\UIResource\Textures\Lumi\`
**Wiki 目标目录**：`D:\LumiWiki\public\images\avatars\`

```bash
# 同步缺失的立绘（源文件本身就是 CA_ 前缀，无需重命名）
SRC="F:/G36/LumiGoProgram/Client/Assets/UIResource/Textures/Lumi"
DST="D:/LumiWiki/public/images/avatars"

# 对比源和 wiki，找出缺失文件
ls "$SRC"/CA_*.png | xargs -n1 basename | sort > /tmp/source_ca.txt
ls "$DST"/CA_*.png | xargs -n1 basename | sort > /tmp/wiki_ca.txt
comm -23 /tmp/source_ca.txt /tmp/wiki_ca.txt  # 查看缺失列表

# 复制缺失文件
comm -23 /tmp/source_ca.txt /tmp/wiki_ca.txt | while read f; do cp "$SRC/$f" "$DST/$f"; done
```

**⚠️ 重要注意事项**：
- 源目录中同时存在 `Avatar_*.png` 和 `CA_*.png` 两种文件，**它们是不同的图片**，绝不能用 `Avatar_` 重命名为 `CA_` 来替代
- wiki 独有的文件（如 `CA_None.png`、`CA_lumi.png`、`CA_3000*.png`）是 wiki 自定义的占位图，不需要同步
- 更新数据时应一并检查立绘是否有新增，避免图鉴页面显示缺图

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
- **player_type 字段**：`1`=真人，`2`=离线玩家镜像（性质同机器人），`3`=机器人。判断"是否含人机"用 `playerType !== 1`（含 2 和 3 都算 with-bot）
- **队伍统计**：每个段位组合（如 `bronze-with-bot`）独立统计出现次数 top 50 的队伍，输出到 `stats[key].teams`。前端根据选中段位+人机筛选合并取 top 50
- **前端缓存**：`OnlineData.vue` 的 fetch 加 `cache: 'no-cache'`，避免浏览器缓存旧 JSON（每次发条件请求，数据没变返回 304 秒回，变了才下载）

---

## 自动化数据拉取（数数平台）

天梯和周赛数据每天自动从数数平台（`game-data-ta.bilibili.co`）拉取、处理、发布，无需人工干预。失败时通过飞书机器人通知。

### 脚本结构

| 脚本 | 职责 |
|---|---|
| `scripts/ta-fetch.mjs` | 3 步异步 API 拉取：发起任务 → 轮询状态 → 下载 CSV |
| `scripts/ta-auth.mjs` | 用 refresh_token 自动续期 access_token |
| `scripts/notify.mjs` | 飞书/企业微信通知（根据 webhook URL 自动判断平台） |
| `scripts/auto-update.mjs` | 总控：续期 → 拉取 → process-data → publish |
| `scripts/auto-update.bat` | Windows 任务计划 wrapper（重定向日志到 `auto-update.log`） |
| `scripts/ta-config.json` | 配置（token/refreshToken/webhook，**不进 git**） |
| `scripts/ta-config.example.json` | 配置模板（进 git） |

### 定时任务（Windows 任务计划程序）

| 任务名 | 频率 | 时间 | 模式 |
|---|---|---|---|
| `LumiWiki_Ladder` | 每天 | 03:00 | 天梯（PVP1V1） |
| `LumiWiki_Tournament` | 每周一 | 08:00 | 周赛（Week1v1，首周 Week 1 跳过） |

注册命令（Git Bash 里执行，需 `MSYS_NO_PATHCONV=1` 防止 `/create` 等参数被误转成路径）：

```bash
MSYS_NO_PATHCONV=1 schtasks /create /tn "LumiWiki_Ladder" /tr "D:\lumiwiki\scripts\auto-update.bat" /sc DAILY /st 03:00 /f
MSYS_NO_PATHCONV=1 schtasks /create /tn "LumiWiki_Tournament" /tr "D:\lumiwiki\scripts\auto-update.bat --tournament" /sc WEEKLY /d MON /st 08:00 /f
```

### 游戏周期

- **游戏周**：周五 0:00 ~ 下周四 23:59:59
- **首周（Week 1）**：2026-07-10 开始，**无周赛**
- **数据范围**：每次拉取"本周周五 0:00 ~ 当前"，覆盖更新 `data/archive/weekN/ladder_weekN.csv`
- **周编号算法**：`week = floor((今天 - 2026-07-10) / 7天) + 1`（基准日 `baseFriday` 在 `ta-config.json` 里）

### Token 续期机制

- access_token 有效期 7 小时（对应 localStorage 的 `EXPIRE_TIME: 7`），会自动过期
- refresh_token 长期有效，**不轮换**（调续期接口后值不变），可反复用来换新 access_token
- 每次跑脚本前先调 `/v1/oauth/refreshForToken` 续期，新 token 落盘到 `ta-config.json`
- 只有 refresh_token 也失效（极少，可能几个月一次）才需要手动重新登录

### 通知（飞书机器人）

- 企业微信群机器人权限被公司关掉，改用飞书自定义机器人
- webhook URL 配在 `ta-config.json` 的 `notifyWebhook`
- `notify.mjs` 根据 URL 自动判断平台（`qyapi.weixin.qq.com` → 企业微信格式，`open.feishu.cn` → 飞书格式）
- 飞书机器人安全策略：自定义关键词 `LumiWiki`（脚本每条消息都带这个前缀）

### 常用命令

```bash
# 手动触发一次天梯更新（绕开定时任务）
node scripts/auto-update.mjs

# 手动触发一次周赛更新
node scripts/auto-update.mjs --tournament

# 查看运行日志
cat auto-update.log

# 手动触发定时任务（测试 .bat wrapper）
MSYS_NO_PATHCONV=1 schtasks /run /tn LumiWiki_Ladder

# 查看任务状态/下次运行时间
MSYS_NO_PATHCONV=1 schtasks /query /tn LumiWiki_Ladder
```

### 维护指引

**token/refresh_token 都失效时**（飞书收到 token 失效告警）：
1. 浏览器打开数数平台重新登录（企业微信一键登录）
2. F12 → Console 跑 `Object.entries(localStorage)`，找 `ACCESS_TOKEN` 和 `REFRESH_TOKEN`
3. 更新 `scripts/ta-config.json` 的 `token` 和 `refreshToken` 字段

**接口失败排查**：
- 看 `auto-update.log` 的错误信息
- token 失效：脚本会自动续期；refresh_token 也失效才需要手动更新
- 网络问题：脚本推送失败通知到飞书，下次定时任务自动重试

### 数据流（完整链路）

```
[03:00 定时任务触发]
  → auto-update.bat 调 node auto-update.mjs
  → ensureValidToken() 用 refresh_token 换新 access_token
  → computeWeekInfo() 算游戏周编号 + 时间范围
  → ta-fetch.mjs：POST eventSearchDownloadAsync → 轮询 asyncTaskProgress → 下载 CSV
  → 存到 data/archive/weekN/ladder_weekN.csv
  → process-battle-data.js --week N（生成 ladder-weekN.json）
  → cp ladder-weekN.json → battle-stats.json
  → 更新 weeks.json（追加新周）
  → bash publish.sh（build + 停旧服务 + 启新服务）
  → notify 推送成功消息到飞书
```

---

## 机器人阵容更新

机器人阵容页面（`/#/robot-team`）展示道馆 / 天梯 / 家园三类机器人阵容，数据由 `scripts/process-robot-teams.js` 从游戏导表生成到 `public/data/robot-teams.json`。

### 数据链路

```
MonsterGroup[MonsterGroupID] → MonsterIdList[].Id → Monster[MonsterId]
  → LumiId → Lumi[Id]（头像 CA / 名字 / 属性 / MaxScore）
评分 = (HpState + AtkState + DefState + WorkState) / 4，取整
等级/突破 取自 MonsterGroup.MonsterIdList 的 Lv / BreakLv
```

三类阵容的入口：

| 类型   | 链路                                                                          |
| ------ | ----------------------------------------------------------------------------- |
| 道馆   | `gym.EnemyTeam` → MonsterGroup（客户端表）                                    |
| 天梯   | `RobotLvMatching[Id=等级档位].RobotList` → `RobotData[Id].Team` → MonsterGroup（匹配表在服务端，阵容在客户端） |
| 家园   | `MonsterGroup` 中 MonsterGroupID 在 20000~29999 范围的阵容（客户端表，直接筛选） |

### 常用命令

```bash
npm run process-robot-teams   # 重新生成 robot-teams.json（道馆+天梯+家园）
```

游戏数据更新后跑一遍即可。脚本会跳过引用了不存在 MonsterGroup 的脏数据（如天梯 Lv.100 末尾几个未启用的 RobotId）并打印警告。

### 注意事项

- **服务端表**：天梯等级匹配表 `RobotLvMatching.json` 在 `Datas\server\data`（不在客户端 `Table\data`），见上方「数据源」。
- **天梯等级档位**是稀疏的（5~51 连续，56/71/100），目标等级不在档位里时由前端「匹配 ≤ 它的最大档位」处理。
- **输出结构**：`{ dojo: [{teamId, name, lumis}], ladder: [{level, teamId, lumis}], home: [{teamId, lumis}] }`。ladder 每个阵容多一个 `level` 字段供等级选择器过滤；道馆按关卡平铺、天梯用等级选择器、家园按 MonsterGroupID 平铺。
- 噜咪「最大评分」不存进 JSON，前端运行时查 `Lumi.json` 的 `MaxScore`。

---

## 冒险掉落更新

冒险掉落页面（`/#/adventure-drop`）展示各地图噜咪出现概率，数据由 `scripts/convert-adventure-drop.mjs` 从游戏导表生成到 `public/data/adventure/drop-rates.json`。

> 📌 **算法逻辑文档**：`scripts/adventure-drop-logic.md` 记录了服务端真实逻辑（`getUnlockedLumiByCurMap` 等）、各权重字段含义、霸主状态矩阵、彩色保底流程、脚本简化点、以及**改逻辑时的修正指引**。游戏更新掉落逻辑后，先看这份文档对照服务端代码再改脚本。

### 数据链路

```
AdventureMap（客户端）→ 各地图 NormalLumi / SpecialLumi / SeasonPool + LumiWeight
LumiDropData（服务端）→ 彩色噜咪权重
→ 结合 Lumi.json / zh-CN.json 计算出现概率
```

### 常用命令

```bash
npm run process-adventure   # 重新生成 drop-rates.json
```

### 注意事项

- **混用两个数据目录**：`AdventureMap` 在客户端 `Table\data`，`LumiDropData` 在服务端 `server\data`（见「数据源」）。
- **前端直接 fetch**：`AdventureDrop.vue` 用 `fetch('/data/adventure/drop-rates.json')` 读取（不走 `loadData` 的 `.encoded` 机制），更新后**无需清缓存**，刷新即可。
- 输出含主线地图（多阶段：霸主解锁前/后）和赛季地图两类。
- ⚠️ 该脚本原先硬编码了旧机器路径 `D:/G36/LumiGoProgram/...`，已修正为 `F:/G36/LumiGoDesigner/...`。换机器时记得改脚本顶部的 `SOURCE_DIR` / `SERVER_DATA_DIR`。

---

## 蛋掉落更新

蛋掉落页面（`/#/egg-drop`）展示各噜咪蛋开启时能开出的噜咪及概率，数据由 `scripts/process-egg-drop.mjs` 生成到 `public/data/egg-drop.json`。

### 数据链路

```
Item(type=6 LumiEgg) → itemUseId → ItemUse → 按 type 分支：
  type=10/12（随机蛋/自选先选后随）→ Param1[].Id → LumiDrop → LumiDropData
      （按 WeightPool 取权 + Score 过滤，复用冒险掉落的 getLumiRandIdByLumiDrop 算法）
  type=14（自选多选一）→ Param1[].Id 是固定 LumiRandId → 查 LumiRand 得 LumiId，每只 1/N
  type=16（巢穴蛋）→ 无固定掉落，跳过
```

### 常用命令

```bash
npm run process-egg-drop   # 重新生成 egg-drop.json
```

### 注意事项

- **复用冒险掉落算法**：随机蛋（type=10/12）走 `getLumiRandIdByLumiDrop`，跟冒险掉落共用，只是 `MapOwner=0`（不限地图解锁）。
- **综合概率近似**：服务端是「先品质后噜咪」两步，脚本用候选池权重占比作综合概率近似（跨品质合并），非精确品质分布。
- **4 种蛋类型**差异见数据链路；巢穴蛋（type=16）无固定掉落已跳过。
- 部分蛋引用了已废弃的 LumiDrop 池（如 Id=60000），会显示「数据缺失」。
- 前端直接 fetch `/data/egg-drop.json`，无需清缓存。

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

### LumiCardType - 卡背类型（Lumi.CardBack）

0:普通 50:异色 80:王 98:3D 99:全景（枚举定义：`LumiCardType.cs`）

> 噜咪详情页「个体类型」+ 图鉴页筛选都用此映射（`src/data/index.js` 的 `LUMI_CARD_TYPE` / `LUMI_CARD_TYPE_COLORS`）。0/空=普通，其余为特殊个体。

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

> 💡 **自定义域名访问 dev server**：`npm run dev`（Vite）默认只允许 `localhost`，用内网域名（如 `*.bilibili.local`）访问会报 `Blocked request`。需在 `vite.config.js` 的 `server.allowedHosts` 添加对应域名（已配 `.bilibili.local` 子域通配）。`publish.sh` 的静态服务（python http.server）无此限制。

---

## 待办

- 全局搜索功能
- 噜咪对比工具
- 队伍搭配建议
- 技能效果模拟器
- 用户收藏功能
- 移动端适配优化
