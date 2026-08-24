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
│   │   ├── online/                  # 线上战斗数据（按区域分区）
│   │   │   ├── domestic/            # 国内服
│   │   │   │   ├── battle-stats.json
│   │   │   │   └── weekly/          # ladder-weekN / tournament-weekN / participation-weekN / weeks.json
│   │   │   └── overseas/            # 海外服（同结构）
│   │   ├── domestic/lumi-teams.json # 推荐配队（国内，依赖 online 数据生成）
│   │   ├── overseas/lumi-teams.json # 推荐配队（海外）
│   │   ├── internal/                # 对内游戏配置分支（版本切换）
│   │   │   ├── domestic/lumi-teams.json
│   │   │   └── overseas/lumi-teams.json
│   │   ├── extra.json               # 社区维护扩展数据
│   │   ├── robot-teams.json         # 机器人阵容（道馆/天梯/家园，由脚本生成）
│   │   ├── adventure/               # 冒险掉落
│   │   │   └── drop-rates.json      # 各地图噜咪出现概率（由脚本生成）
│   │   ├── egg-drop.json            # 蛋掉落（各蛋开出噜咪概率，由脚本生成）
│   ├── lumi-teams.json 已迁移到 domestic/overseas 子目录（前端 loadData 自动注入 region 前缀）
│   │   ├── zh-CN.json 等            # 多语言文件
│   │   └── ...                      # 游戏核心数据
│   └── images/                      # 图片资源
├── data/                            # 中间产物（CSV 不进 git）
│   ├── domestic/archive/             # 国内 CSV 归档
│   │   ├── daily/                    # 按天分片（所有事件流）
│   │   │   ├── ladder/{YYYY-MM-DD}.csv
│   │   │   ├── tournament/{YYYY-MM-DD}.csv
│   │   │   ├── login/{YYYY-MM-DD}.csv
│   │   │   ├── infinity-gym/{YYYY-MM-DD}.csv
│   │   │   ├── assist/{YYYY-MM-DD}.csv
│   │   │   └── guild-war/{YYYY-MM-DD}.csv
│   │   └── recharge.csv              # 累计全量（每 role_id 历史最大充值，不按天分片）
│   └── overseas/archive/             # 海外 CSV 归档（同结构）
├── scripts/
│   ├── process-battle-data.js       # 天梯数据处理（读本周 7 天 daily/ladder）
│   ├── process-tournament-data.js   # 周赛数据处理（读本周 7 天 daily/tournament）
│   ├── process-robot-teams.js       # 机器人阵容数据处理
│   ├── convert-adventure-drop.mjs   # 冒险掉落数据处理
│   ├── process-egg-drop.mjs         # 蛋掉落数据处理
│   ├── process-lumi-teams.mjs       # 噜咪推荐配队数据处理
│   ├── fetch-participation-trend.mjs # 参与走势聚合（读 daily/{login,ladder,tournament,gym,guild-war}）
│   ├── ta-fetch.mjs                 # 数数开放 API 拉取（流式写入，支持大响应）
│   ├── notify.mjs                   # 飞书/企业微信通知
│   ├── auto-update.mjs              # 每天线上数据总控（拉昨天+今天 daily 分片 + 处理 + 发布）
│   ├── auto-update-all.mjs          # 每日游戏数据总控（对外+对内 + 立绘 + 衍生）
│   ├── backfill-daily.mjs           # 按天回填历史 daily CSV（一次性用）
│   ├── auto-update.bat              # 每日线上任务 wrapper
│   ├── auto-update-all.bat          # 每日游戏任务 wrapper
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

游戏原始数据（Luban 导表）**从 2026-08-11 起客户端/服务端表统一放在一个目录**：
- **对外**：`F:\G36\LumiGoDesigner\Config\Luban\Datas\check\data\` —— 展示/配置类 + 匹配/逻辑类 全部在这里（Lumi、技能、物品、属性克制、Gym、MonsterGroup、Monster、RobotData、RobotLvMatching、LumiDrop、LumiDropData 等）
- **对内**：`F:\G36Branch\Designer\Config\Luban\Datas\check\data\`

> ⚠️ 之前分 `Table/data`（客户端）和 `server/data`（服务端）两套，现已合并到 `check/data` 一套。旧目录 svn 里可能还在，但新数据只导到 `check/data`。

**枚举定义**：`F:\G36\LumiGoDesigner\Config\Luban\Datas\__enums__.xlsx`
**项目数据**：`D:\LumiWiki\public\data\`（对外）/ `D:\LumiWiki\public\data\internal\`（对内）

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
# 1. 复制核心数据文件（2026-08-11 起统一放在 check/data）
SRC="F:/G36/LumiGoDesigner/Config/Luban/Datas/check/data"
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

### 每周数据更新（已由 auto-update.mjs 自动完成，手动仅供故障恢复）

日常无需手动更新。定时任务 `LumiWiki_Online_Daily` 每天 04:30 自动拉取昨天+今天到 daily 分片、聚合、发布、push。

**手动补跑某周**（例如某天定时任务没跑成功）：
```bash
cd D:/LumiWiki

# 补拉某天的原始事件（按需选模式）
node scripts/backfill-daily.mjs --region domestic --modes ladder,tournament,login,guild-war,infinity-gym,assist --start 2026-08-21 --end 2026-08-21 --force

# 重新处理该周（--week N 会读该周 7 天 daily CSV 聚合）
node scripts/process-battle-data.js --week N --region domestic
node scripts/process-tournament-data.js --week N --region domestic
node scripts/process-infinity-gym.mjs --region domestic
node scripts/fetch-participation-trend.mjs --week N --region domestic --publish
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

## 自动化数据更新

**两个定时任务**：
- **每天 04:30**（LumiWiki_Online_Daily）跑线上数据：拉双区（国内+海外）昨天+今天数据到 daily 分片（ladder / tournament / infinity-gym / assist / login / guild-war），处理后 build + push
- **每天 03:00**（LumiWiki_Daily）跑游戏数据：svn update → 复制 JSON → 多语言 → 衍生脚本（robot-teams / adventure-drop / egg-drop）→ 立绘同步 → build + push

失败时通过飞书机器人通知。

### 数据分片架构（面向 10x 数据设计）

线上数据全部**按天分片**，每次拉取只写「昨天 + 今天」，历史数据用 `backfill-daily.mjs` 一次性回填。

**目录结构**：
```
data/{region}/archive/
  daily/
    ladder/{YYYY-MM-DD}.csv          ← 每天一个文件，永远只增不改（除了当天覆盖）
    tournament/{YYYY-MM-DD}.csv
    infinity-gym/{YYYY-MM-DD}.csv
    assist/{YYYY-MM-DD}.csv
    login/{YYYY-MM-DD}.csv
    guild-war/{YYYY-MM-DD}.csv
  recharge.csv                        ← 累计全量（每 role_id 历史最大充值，特殊模式）
```

**关键设计**：
- **每小时改每天**：原每小时全量重拉 → 每天只拉昨天+今天两天（避免累积 CSV 无限增长）
- **周聚合**：process 脚本按 `--week N` 读该周 7 天 daily CSV 汇总
- **周编号规则**：周五 00:00 ~ 下周四 23:59 = 一周（自然日归属周，跟 daily 分片对齐）
- **流式写入**：`ta-fetch.mjs` 用 `for await (const chunk of resp.body)` 逐 chunk 写盘，避免 2GB Buffer 上限（老代码在国内 gym 累积到 8/21 撞过这个坑）

### 前置要求

- **svn 命令行**：TortoiseSVN 安装时必须勾选「Command line client tools」（默认不勾）。验证：`svn --version` 能输出版本号
- **数数开放 API**：每个 region 一个长期 token（不需要续期！），配在 `ta-config.json` 的 `regions.{domestic,overseas}` 下
- **飞书群机器人**：webhook URL 配在 `ta-config.json`（自定义关键词 `LumiWiki`）

### 数数开放 API（关键改造）

老方案（浏览器 Bearer Token + 事件模型 qp JSON + 每 7 小时刷新）已废弃。现在用**数数官方开放 API**：

```
POST  {baseUrl}/open/submit-sql       (form-urlencoded: token, projectId, sql, format)
GET   {baseUrl}/open/sql-result-page?token=&projectId=&taskId=&pageId=N
```

**几个关键坑**（改造中踩过）：

| 坑 | 现象 | 解决 |
|---|---|---|
| **表名要跟 projectId 对齐** | `ta.v_event_29` 国内 / `ta.v_event_83` 海外 | `ta.v_event_${projectId}` |
| **元数据列用 `#` 前缀** | 老 API 用 `$event_name` 报"cannot be resolved" | 改成 `"#event_name"`；`$part_date` 保持 `$` |
| **SQL 标识符用双引号** | 反引号不支持 | `"$part_date"` `"#event_name"` |
| **format 只支持 `json / csv / tsv / json_object`** | `csv_header` 会报错 | 用 `csv`，脚本自己补表头 |
| **pageId 从 0 开始** | 文档写 pageId=1 是错的，`pageId=1` 会返回 -1008 | 用 `pageId=0`；后续页 -1008 才表示"到末尾" |
| **pageId=0 立即返回 -1008** | 任务还没跑完时的正常表现 | pageId=0 的 -1008 视作 running，继续等；后续页才判定为完成 |
| **b_zone_id 类型双区不同** | 国内 varchar（'1888'），海外 double（2888.0） | 用 `TRY_CAST(b_zone_id AS bigint) IN (...)` 统一转 bigint 兼容 |
| **返回 CSV 不含表头** | 无论 format 怎么设都不带 | 脚本按 SELECT 列顺序手动写 header 行到 CSV |

### 脚本结构

| 脚本 | 职责 |
|---|---|
| `scripts/ta-fetch.mjs` | 数数开放 API 拉取：submit-sql → 分页 sql-result-page → **流式写入 CSV**（绕过 Buffer 2GB 上限）。参数：`--region domestic\|overseas --mode ladder\|tournament\|login\|infinity-gym\|assist\|guild-war\|recharge --start YYYY-MM-DD --end YYYY-MM-DD --out` |
| `scripts/backfill-daily.mjs` | **按天回填历史数据**（一次性用）。参数：`--region --modes m1,m2 --start --end [--force]`。已存在的文件默认跳过 |
| `scripts/fetch-participation-trend.mjs` | 参与走势聚合（读 daily/{ladder,tournament,login,infinity-gym,guild-war} × 本周 7 天）。参数：`--week N --region [--publish]` |
| `scripts/process-infinity-gym.mjs` | 无限道馆数据处理（遍历 daily/infinity-gym/*.csv 累计聚合） |
| `scripts/notify.mjs` | 飞书/企业微信通知（根据 webhook URL 自动判断平台） |
| `scripts/update-game-data.mjs` | 游戏数据更新：svn update → 复制 JSON → 多语言 → 衍生脚本 → 立绘同步 |
| `scripts/auto-update.mjs` | **每日线上数据总控**：双区拉昨天+今天各模式 daily → process → 参与走势 → 推荐配队 → build + push |
| `scripts/auto-update-all.mjs` | **每日游戏数据总控**：对外+对内游戏数据 + 立绘 + 衍生 → build + push |
| `scripts/auto-update.bat` | 每日线上任务 wrapper |
| `scripts/auto-update-all.bat` | 每日游戏任务 wrapper |
| `scripts/ta-config.json` | 配置（regions.{domestic,overseas}.{token,projectId,bZoneIds,baseUrl} + webhook，**不进 git**） |
| `scripts/ta-config.example.json` | 配置模板（进 git） |

### 定时任务（Windows 任务计划程序）

| 任务名 | 频率 | 时间 | 模式 |
|---|---|---|---|
| `LumiWiki_Online_Daily` | 每天 | 04:30 | 双区线上数据（ladder / tournament / infinity-gym / assist / login / guild-war + 参与走势） |
| `LumiWiki_Daily` | 每天 | 03:00 | 游戏配置 + 立绘 + 衍生（对外+对内 svn） |

注册命令（Git Bash 里执行，需 `MSYS_NO_PATHCONV=1` 防止 `/create` 等参数被误转成路径）：

```bash
# 删除老任务
MSYS_NO_PATHCONV=1 schtasks /delete /tn "LumiWiki_Online" /f

# 新架构：每天 04:30 拉线上数据
MSYS_NO_PATHCONV=1 schtasks /create /tn "LumiWiki_Online_Daily" /tr "D:\lumiwiki\scripts\auto-update.bat" /sc DAILY /st 04:30 /f
MSYS_NO_PATHCONV=1 schtasks /create /tn "LumiWiki_Daily"  /tr "D:\lumiwiki\scripts\auto-update-all.bat" /sc DAILY /st 03:00 /f
```

### 游戏周期

- **游戏周**：周五 00:00 ~ 下周四 23:59（自然日归属周，跟 daily 分片对齐）
- **首周（Week 1）**：2026-07-10 00:00 开始，**无周赛**
- **国内 + 海外全球通服**，共用同一套 baseFriday
- **数据范围**：每次拉取"昨天 + 今天"两天到对应 daily 分片；老数据永久保留
- **周编号算法**：`week = floor((现在 - 2026-07-10 00:00) / 7天) + 1`
- **每周独立**：process 脚本按 `--week N` 读该周 7 天 daily CSV 汇总

### 周赛策略

**周赛开放时间**：国内时间**周五 19:00 ~ 周一 07:00**（全球通服共用国内时间）

- 每天固定拉，非开放日 SQL 返回空 CSV（无害）
- 首周（Week 1）跳过

### 前端区域切换

- `useRegion` composable（`domestic` / `overseas`），localStorage 持久化
- `OnlineData.vue` 顶部按钮切换
- `loadData('lumi-teams')` 和 `loadData('online/...')` 自动注入 region 前缀
- 版本切换（对外/对内）× 区域切换（国内/海外）正交存在

### 通知（飞书机器人）

- webhook URL 配在 `ta-config.json` 的 `notifyWebhook`
- `notify.mjs` 根据 URL 自动判断平台（`qyapi.weixin.qq.com` → 企业微信格式，`open.feishu.cn` → 飞书格式）
- 飞书机器人安全策略：自定义关键词 `LumiWiki`（脚本每条消息都带这个前缀）

### 常用命令

```bash
# 手动触发一次每日线上任务（双区）
node scripts/auto-update.mjs

# 只拉某个模式
node scripts/auto-update.mjs --ladder
node scripts/auto-update.mjs --tournament

# 单独跑数数拉取（调试用，按天）
node scripts/ta-fetch.mjs --region overseas --mode ladder --start 2026-08-08 --end 2026-08-08 --out data/overseas/archive/daily/ladder/2026-08-08.csv

# 按天回填历史（一次性用）—— 换机器 / 首次部署时跑
node scripts/backfill-daily.mjs --region domestic --modes ladder,tournament,login,guild-war,infinity-gym,assist --start 2026-07-10 --end 2026-08-23

# 手动触发每日游戏任务
node scripts/auto-update-all.mjs

# 查看运行日志
cat auto-update.log

# 手动触发定时任务
MSYS_NO_PATHCONV=1 schtasks /run /tn LumiWiki_Online_Daily
MSYS_NO_PATHCONV=1 schtasks /run /tn LumiWiki_Daily

# 查看任务状态/下次运行时间
MSYS_NO_PATHCONV=1 schtasks /query /tn LumiWiki_Online_Daily
MSYS_NO_PATHCONV=1 schtasks /query /tn LumiWiki_Daily
```

### 维护指引

**token 失效**（飞书收到 token 失效告警）：
- 数数开放 API token 是**长期**的，一般不会失效
- 万一失效：找 PM 或数据同事重新申请 token，更新 `scripts/ta-config.json` 的 `regions.{domestic|overseas}.token`

**接口失败排查**：
- 看 `auto-update.log` 的错误信息
- 网络问题：脚本推送失败通知到飞书，下次定时任务自动重试
- SQL 错误：报错信息里有 SQL 定位（`line X:Y: Column 'xxx' cannot be resolved`）

### 数据流（完整链路）

```
[每日 04:30 触发：auto-update.bat → auto-update.mjs]

  computeWeekInfo() 算游戏周编号（自然日归属周）
  今天/昨天日期 = 每次拉取的目标日期

  for region in [domestic, overseas]:
    1. 天梯 (updateRegionMode('ladder')):
       → ta-fetch.mjs: 拉昨天 + 今天 2 天，各写入
         data/{region}/archive/daily/ladder/{date}.csv
       → process-battle-data.js --week N --region {region}
         读该周 7 天 daily 分片 → 输出 public/data/online/{region}/weekly/ladder-weekN.json
       → cp 到 battle-stats.json，更新 weeks.json

    2. 周赛 (updateRegionMode('tournament')，非首周):
       → 类似流程，写 daily/tournament/{date}.csv，process 读本周 7 天聚合

    3. 无限道馆 + 助战 (updateRegionInfinityGym):
       → 拉昨天 + 今天写 daily/infinity-gym/{date}.csv & daily/assist/{date}.csv
       → process-infinity-gym.mjs 遍历整个 daily 目录累计聚合
         → 输出 public/data/online/{region}/infinity-gym.json

    4. 参与走势 (updateRegionParticipation):
       → 拉昨天 + 今天写 daily/login/{date}.csv & daily/guild-war/{date}.csv
       → 拉 recharge 累计全量 → data/{region}/archive/recharge.csv
       → fetch-participation-trend.mjs --week N --region 读本周 7 天各 daily CSV
         → 输出 public/data/online/{region}/weekly/participation-weekN.json

    5. 推荐配队 (process-lumi-teams.mjs --region):
       → 读所有周 ladder no-bot + tournament，按 lumi 聚合 top 3 队伍
       → 输出 public/data/{region}/lumi-teams.json

  6. 镜像 lumi-teams 到 internal 分支（对内版复用对外的推荐配队）

  7. 统一 publish (bash publish.sh)

  8. git add -A && commit && push

  9. 飞书通知


[每日 03:00 触发：auto-update-all.bat → auto-update-all.mjs]

  1. updateGameData(external)   ── 对外游戏配置 + 立绘 + 衍生
  2. updateGameData(internal)   ── 对内游戏配置 + 立绘 + 衍生
  3. bash publish.sh
  4. git add -A && commit && push
  5. 飞书通知
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

- **表位置**：天梯等级匹配表 `RobotLvMatching.json` 跟其他表一样在 `Datas\check\data`（2026-08-11 起客户端/服务端表统一目录），见上方「数据源」。
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

- **表位置**：`AdventureMap` 和 `LumiDropData` 现都在 `check\data`（2026-08-11 起客户端/服务端表统一目录，见「数据源」）。
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

## 参与走势更新

线上数据页「📈 参与走势」tab 展示每周每日 UV 走势（登录 / 天梯 / 周赛 / 无限道馆 / 公会战），数据由 `scripts/fetch-participation-trend.mjs` 生成到 `public/data/online/{region}/weekly/participation-weekN.json`。

### 数据链路

```
data/{region}/archive/daily/{login,ladder,tournament,infinity-gym,guild-war}/{YYYY-MM-DD}.csv
  → 读本周 7 天各 daily CSV，按 part_date distinct b_role_id
  → 汇总每日各玩法 UV / 场均 / 重合率 / 付费档
```

每个 daily CSV 是长表（每行一场事件），脚本按 `part_date` 分组，每天开 `Set<b_role_id>` 收集独立玩家。

### 常用命令

```bash
# 参与走势聚合（依赖 daily CSV 已被 auto-update 或 backfill 提前拉好）
node scripts/fetch-participation-trend.mjs --week N --region domestic

# --publish：跑完自动 bash publish.sh，把结果推到 dist + 重启 3005 服务
# 手动补跑时强烈建议加，否则浏览器看到的还是老数据（见「数据分离机制」小节）
node scripts/fetch-participation-trend.mjs --week 6 --region domestic --publish
```

### 集成位置

- `auto-update.mjs` 的 `updateRegionParticipation` 里调用：先拉 login/guild-war/recharge 到 daily，再跑聚合
- 每天 04:30 自动流程内跟 ladder 一起触发
- 参与走势失败**不阻塞发布**（`try/catch` 包裹），仅日志报错

### 注意事项

- **参与走势脚本本身不再拉数据**：所有 daily CSV 由 `auto-update.mjs` 或 `backfill-daily.mjs` 提前拉好，脚本只做聚合
- **输出结构**：`{ updateTime, week, region, startTime, endTime, dates: [{date, ladder, tournament, infinityGym, guildWar, login, ...Rate, ...BattlesPerUser, overlap, retention, byTier}], weekLoginBase, weekOverlap, weekByTier }`
- **前端**：`OnlineData.vue` 的「📈 参与走势」tab，用 Chart.js 画折线图（UV 走势 + 占比走势）；切换周次自动重新 fetch，缺失时显示"该周暂无参与走势数据"占位
- **首周（Week 1）**：无周赛，`daily/tournament/` 里没有该周日期文件，脚本自动跳过

---

## 推荐配队更新

噜咪详情页「推荐配队」section 展示每只噜咪 top 3 配队，数据由 `scripts/process-lumi-teams.mjs` 生成到 `public/data/lumi-teams.json`。

### 数据链路

```
ladder-weekN.json (stats['all-no-bot'].teams)  ┐
                                                ├→ 按 teamLumiIds 聚合 → 按 lumiId 索引
tournament-weekN.json (popularTeams)            ┘   → 每只 lumiId 取 battles top 3 队伍
                                                    → 队伍中每只噜咪输出 top 1 携带技能
```

### 常用命令

```bash
npm run process-lumi-teams             # 默认用"上一周"（maxWeek - 1）
npm run process-lumi-teams -- --week 2 # 指定周次
```

### 集成位置

- `auto-update.mjs` 的 `updateMode()` 末尾自动跑：天梯或周赛数据落盘后、publish 前调用
- 全量任务（每天 03:00）和周赛任务（每周一 08:00）都会触发

### 注意事项

- **数据源**：ladder `all-no-bot`（不含人机）+ tournament `popularTeams`，按 `teamLumiIds` 排序聚合
- **默认周次**：`weeks.json` 最新周 - 1（"上一周"），因为本周数据不完整（只到当天累积）
- **secondSkills 合并**：跨 ladder/tournament 同一队伍的同类技能计数累加
- **输出大小**：约 400 KB（183 噜咪 × 平均 3 队伍），前端通过 `loadData('lumi-teams')` 加载
- **当前噜咪高亮**：前端在配队卡片中给当前查看的噜咪加 `.is-current` 样式（紫色边框）

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

## 数据分离机制（重要！）

项目里同一份数据 JSON 存在**两个位置**，前端访问只看后者：

| 位置 | 谁写 | 谁读 |
|---|---|---|
| `public/data/**` | 所有 processor 脚本、`prepare-i18n-data.cjs`、`sync-extra-data.cjs`、手动同步 | Vite dev server（`npm run dev`）+ 构建时被打包进 dist |
| `dist/data/**` | `npm run build` 从 `public/` 复制过来 | **`python http.server 3005` 实际服务的目录** |

**含义**：任何时候你**直接改了 `public/data/**` 下的 JSON**（哪怕只是手动补跑了一个 processor 脚本），端口 3005 上的用户**看不到新数据**，除非你跑一次 `bash publish.sh` 把它构建到 dist 并重启服务。

### 常见踩坑场景

- ✅ **自动流程没事**：`auto-update.mjs` / `auto-update-all.mjs` / `update-game-data.mjs` 末尾都自带 `bash publish.sh`，跑完就上线
- ❌ **手动补跑必踩**：例如 `node scripts/fetch-participation-trend.mjs --week 6 --region domestic --skip-fetch` 只写 `public/`，不 publish → 浏览器硬刷也是老数据
- ❌ **手动跑 processor 也踩**：`npm run process-adventure` / `npm run process-egg-drop` / `npm run process-lumi-teams` 都只写 `public/`

### 手动补跑的正确姿势

**优先**：给 processor 脚本传 `--publish`（如果它支持）
```bash
# 参与走势已支持
node scripts/fetch-participation-trend.mjs --week 6 --region domestic --skip-fetch --publish
```

**兜底**：跑完 processor 后手动 `bash publish.sh`
```bash
node scripts/process-infinity-gym.mjs --region domestic
node scripts/process-lumi-teams.mjs --region domestic
bash publish.sh   # ← 关键！
```

**排查**：怀疑浏览器看到的不对时，先 `curl -s http://localhost:3005/data/xxx.json` 看服务器返回，跟 `public/data/xxx.json` 对比，mtime 不一致就是需要 publish。

---

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
