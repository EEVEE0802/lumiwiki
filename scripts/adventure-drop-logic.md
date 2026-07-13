# 冒险掉落算法说明（convert-adventure-drop.mjs）

> 本文档记录「冒险玩法中遇到噜咪」的**服务端真实逻辑** + wiki 脚本的**实现/简化**，供后续游戏改逻辑时快速对照修正。
> 脚本：`scripts/convert-adventure-drop.mjs` → 输出 `public/data/adventure/drop-rates.json`

---

## 1. 服务端关键代码（权威来源）

| 文件 | 作用 |
|---|---|
| `F:/G36/LumiServer/server/feature/cfg/code/AdventureMap.h` | AdventureMap 表结构定义 |
| `F:/G36/LumiServer/server/feature/cfg/code/LumiDrop.h` | 彩色掉落池表（LumiDrop） |
| `F:/G36/LumiServer/server/feature/cfg/code/LumiDropData.h` | 噜咪候选池表（LumiDropData） |
| `F:/G36/LumiServer/server/feature/cfg/code/AdventureOdds.h` | 品质权重表（QualityRate） |
| `F:/G36/LumiServer/server/feature/service/server/game/modules_ex/cacheRoleAdventure.cpp` | **冒险主逻辑** |
| `F:/G36/LumiServer/server/feature/service/server/game/modules_ex/cacheBag.cpp` | 彩色噜咪抽取 `getLumiRandIdByLumiDrop` |

**核心函数锚点**（`cacheRoleAdventure.cpp`）：
- `getUnlockedLumiByCurMap()` L6386-6509 — 构造「已解锁噜咪权重池」（**改逻辑首查这里**）
- `_randomLumiByOdds()` L10471-10785 — 按 AdventureOdds 品质权重 + 解锁池抽噜咪
- `_tryGenerateLumiList()` L11062-11384 — 多优先级生成（含彩色保底）
- `_tryRandomGachaLumiDrop()` L10006-10087 — 彩色保底判定
- `_tryRandomGachaColorLumi()` L10089-10210 — 选具体彩色 LumiDropId
- `isCatchAllNormalLumiByCurMap()` L6280-6308 — 霸主解锁条件

> 客户端（`F:/G36/LumiGoProgram`）**完全不算概率**：`Cmd_Adventure_Move_Req` 是空消息体，所有概率 100% 服务端算。客户端展示的概率文字是 `TbInstructions` 手填字符串，**不是真实概率**。

---

## 2. 数据表清单

| 表 | 位置 | 关键字段 |
|---|---|---|
| `AdventureMap` | 客户端 `Table/data` | `Order[mapId,stage]`, `IsUp`, `NormalLumi[]`, `SpecialLumi`, `LumiWeight[]`, `LumiWeight2[]`, `SeasonPool[]`, `SeasonLumiWeight[]`, `SeasonPoolGuranteeTimes` |
| `AdventureOdds` | 客户端 `Table/data` | `Id`(=倍率), `QualityRate[[品质,权重]]`, `LumiNumber`(一次出几只) |
| `LumiDrop` | **服务端** `server/data` | `Id`, `QualityToWeight`, `LumiDropPool`, `WeightPool`, `MapOwner`, `LumiType[]`, `Score` |
| `LumiDropData` | **服务端** `server/data` | `Id`(=噜咪Id), `LumiDropPool[]`, `weight[[key,value]]` |
| `GachaParameter` | **服务端** `server/data` | `miniProbId/middleProbId/grandProbId/seasonmiddleProbId/seasongrandProbId`（都指向 LumiDrop.Id，实测=99） |

---

## 3. AdventureMap 权重字段含义（易错点）

| 字段 | 含义 |
|---|---|
| `Order` | `[mapId, stage]`。同 `mapId` 多 `stage` = 多阶段地图（如雨林 1/2/3） |
| `IsUp` | 是否赛季/UP 地图。`true` 走赛季池分支 |
| `NormalLumi` | 普通噜咪 ID 列表 |
| `SpecialLumi` | 霸主噜咪 ID。**赛季地图 = 0** |
| `LumiWeight` | **霸主出现前权重**。下标对应 `NormalLumi[i]`，**最后一个元素是霸主自己**（长度 = NormalLumi.length + 1） |
| `LumiWeight2` | **霸主被捕获后权重**。结构同 LumiWeight。**赛季地图为空 `[]`** |
| `SeasonPool` | 赛季子池噜咪（仅赛季地图） |
| `SeasonLumiWeight` | 赛季子池权重，下标对应 `SeasonPool[i]` |

**数据实例**（mapId=1 雨林 stage1）：
```
NormalLumi(4)  LumiWeight=[1000,1000,1000,1000,500]   ← 末尾 500 是霸主
              LumiWeight2=[1000,1000,1000,1000,1000]  ← 霸主被抓后变 1000
```

---

## 4. 霸主状态矩阵（核心！脚本必须区分）

权重选择（`getUnlockedLumiByCurMap` L6489-6506）：

| 普通全抓完? | 霸主已抓? | 普通噜咪权重 | 霸主是否在池 | 霸主权重 |
|---|---|---|---|---|
| 否 | — | `LumiWeight[i]` | **不在池** | — |
| 是 | 否 | `LumiWeight[i]` | 在池 | `LumiWeight.last` |
| 是 | 是 | **`LumiWeight2[i]`** | 在池 | `LumiWeight2.last` |

> ⚠️ 切到 `LumiWeight2` 的条件是**「霸主已被捕获」**，不是「霸主已解锁」。这两个是不同状态。

---

## 5. 多阶段累积逻辑（覆盖，非相加）

`getUnlockedLumiByCurMap`：遍历所有**同 mapId 且 stage ≤ 当前 stage** 的已解锁地图：
- `NormalLumi[i]` → 权重取 `LumiWeight[i]` 或 `LumiWeight2[i]`（看霸主状态）
- **同 ID 噜咪 → 后遍历的【覆盖】前者权重**（直接赋值 `mUnlockedLumiList[id] = w`，不是相加）
- 霸主 → 权重来自**当前遍历地图自己**的 `LumiWeight/LumiWeight2` 最后一个元素

---

## 6. 彩色噜咪逻辑（走独立保底，非地图池）

彩色不走 `NormalLumi/SeasonPool`，走保底机制：

```
1. GachaParameter.middleProbId.Id → LumiDropId（实测 = 99）
2. LumiDrop[99]:
     LumiDropPool=1, WeightPool=2, MapOwner=1, Score=70
3. 遍历 LumiDropData 过滤候选:
     - LumiDropPool 须包含 drop.LumiDropPool(=1)
     - MapOwner=1 时限定为该地图解锁池中的噜咪
     - lumi.MaxScore ≥ drop.Score(=70)
     - 按 drop.WeightPool(=2) 从 weight[[key,value]] 取对应 key 的值
       例: weight=[[1,1500],[2,1000]] → WeightPool=2 取 1000（不是 1500！）
4. 按权重抽具体彩色噜咪
```

**保底触发条件**（`_tryRandomGachaLumiDrop`）：
- 倍率 1/2/5 **不出彩**
- 次数保底（GachaCount 表）或概率保底（FloorGachaWeight 表）

---

## 7. 脚本当前实现（v2）

脚本 `convert-adventure-drop.mjs` 的处理：

### 普通概率（主线）
- 按 `mapId` 分组，stage 升序
- 每个 stage 构造两个池：
  - **霸主出现前**（`status:'before'`）：`buildPool(stage≤当前, 'LumiWeight', includeOverlord=false)` — 不含霸主
  - **霸主已抓**（`status:'after'`）：`buildPool(stage≤当前, 'LumiWeight2', includeOverlord=true)` — 含霸主（末尾权重）
- `buildPool`：遍历 records，`NormalLumi[i]` → `weights[i]`（Map.set 覆盖），霸主 → `weights[最后]`
- 概率 = `权重 / 总权重 × 100%`

### 普通概率（赛季）
- 合并 `NormalLumi+LumiWeight` 与 `SeasonPool+SeasonLumiWeight`，算占比

### 彩色概率
- `calcColorLumis(mapLumiIds)`：按上面第 6 节流程，用 `WeightPool` 取权

### ⚠️ 输出字段契约（前端依赖，勿改！）

`AdventureDrop.vue` 用 `lumi.id`（不是 `lumiId`）做 v-for `:key`、`getLumiAvatar(lumi.id)`、`goToLumi(lumi.id)`。**脚本输出的噜咪对象必须用 `id` 字段**：

```js
{ id, name, weight, probability }   // ✅ 正确
{ lumiId, name, weight, probability } // ❌ 会触发 img onerror 死循环闪烁
```

> 教训：曾把 `id` 改成 `lumiId`（想跟 robot-teams 统一），导致 `lumi.id=undefined` → 头像 URL 变 `CA_undefined.png` 加载失败 → `handleImageError` 设不存在的 `unknown.png` → img 无限重试 → 页面闪烁。重写脚本务必保留原有输出字段名。

---

## 8. ⚠️ 已知简化点（动态逻辑，静态无法精确）

脚本输出 JSON 的 `note` 字段已标注。后续若要更精确，需处理：

1. **彩色保底是动态的**：依赖玩家游玩次数（次数/概率保底），静态只能算「保底触发时的池内分布」，**算不出整体彩率**。
2. **赛季不放回抽取**（`SamplingWithoutReplacement`）：抽过的赛季噜咪不再出，分布会随游玩变化。脚本只算首次遇到分布。
3. **赛季保底触发**（`SeasonPoolTriggerCount`）：某品质连续 N 次出主线后强制下一次出赛季噜咪。未建模。
4. **品质两步加权**：服务端是「先按 `AdventureOdds.QualityRate` 抽品质 → 再在该品质下抽噜咪（带 `MinScore/MaxScore` 过滤）」。脚本用「解锁池权重占比」近似综合出现率，未做品质两步加权。
   - 品质过滤规则：`MinScore≥70` 的噜咪无蓝色(≤Blue)形态；`MaxScore≤80` 的无金色形态。
5. **霸主中间态省略**：脚本只展示「霸主出现前（不含霸主）」+「霸主已抓（LumiWeight2）」，省略了「普通全抓霸主未抓（含霸主 LumiWeight.last）」中间态。

---

## 9. 🔧 后续修改指引（游戏改逻辑时）

1. **先查服务端 `cacheRoleAdventure.cpp` 的 `getUnlockedLumiByCurMap`**（L6386）—— 这是池构造的核心，逻辑变更大概率在这里。
2. 用 `git log -- server/.../cacheRoleAdventure.cpp` 看最近 commit，定位改了啥。
3. 对照本文档第 3-6 节的字段/状态/流程，确认哪些变了。
4. 改 `convert-adventure-drop.mjs` 对应函数：
   - 池构造变了 → 改 `buildPool`
   - 霸主状态变了 → 改 `processMainLineMaps` 的 before/after 构造
   - 彩色变了 → 改 `calcColorLumis`（查 `LumiDrop` 表字段是否新增/改名）
5. 跑 `npm run process-adventure` + 抽查某地图的概率（对比服务端逻辑预期）。
6. 若新增数据表/字段，同步更新本文档第 2 节。

**验证抽查模板**（mapId=1 雨林）：
- stage1 霸主出现前：4 只普通各 25%（总权重 4000）
- stage1 霸主已抓：5 只（+霸主）各 20%（总权重 5000，霸主用 LumiWeight2）
- 彩色池：该地图 `MaxScore≥70` 的噜咪，权重按 `WeightPool=2` 取
