# 附录：协议与埋点字段解读

> 本文汇总 4 个附录：**A** 战斗创建协议 · **B** 战斗启动数据 · **C** battle_end 事件字段（跟 daily CSV 对上）· **D** 伪随机同步细节。
>
> 这些字段直接决定 **wiki 侧数据分析的原始 schema**，写分析脚本前先来这里对字段。

---

## 附录 A · BattleCreateArgs（战场创建协议）

**代码位置**：`F:/G36Branch/LumiServer/server/feature/service/proto/serverBattle.proto::33`

```protobuf
message BattleCreateArgs {
  uint32 stage_id = 1;                // 关卡 id
  SNKProto.EBattleType battle_type = 2;   // 战斗类型（21 种，见 [[07-battle-modes]]）

  // 不同类型的战斗使用不同的参数
  oneof Args {
    BattleNormalArgs   normal   = 3;   // 普通战斗
    BattleBanPickArgs  ban_pick = 4;   // BanPick 战斗
  }

  optional uint64 room_id     = 5;    // 业务侧房间 id（GVG PVE 用）
  optional bytes  extra_data  = 6;    // 额外数据（GVG 结算时原样回传）
}
```

### BattleNormalArgs

```protobuf
message BattleNormalArgs {
  repeated NormalTeam team_list       = 1;    // 队伍列表（1v1 是 2 个 Team，2v2 也是 2 个 Team）
  uint32              special_logic   = 2;    // 特殊逻辑：0=正常，1=我方必胜，2=我方必输（GM 调试用）
  bool                is_fast_simulate = 3;   // 是否快速模拟（脱离 UI 表演，只算结果）
}

message NormalTeam {
  SNKProto.TeamBrief             team      = 1;
  repeated SNKProto.BattleStartElem user_data = 2;   // 每玩家一份 BattleStartElem
}
```

### BattleBanPickArgs

```protobuf
message BattleBanPickArgs {
  repeated BanPickTeam         team_list        = 1;
  SNKProto.EBattleBanPickType  battle_ban_type  = 2;   // BanPick 类型
}
```

### 战斗创建流程分派

- **普通战斗**：`BattleLifecycleHandler.HandleCreateBattle(...)`
  - 遍历 `args.normal.team_list` → 创建 `TeamEntity` / `PlayerEntity` / `LumiEntity`
- **BanPick 战斗**：`BattleBanPickHandler.HandleCreateBattleBP(...)`
  - 先构造 BanPick 数据，阶段推进后再生成正式战斗实体

### 分析价值

- **上游服创建战斗时**决定 `battle_type` + `special_logic`；分析异常数据（例如"必胜"高胜率场次）可以按 `special_logic ≠ 0` 过滤 GM 局
- **room_id / extra_data** 仅 GVG PVE 用（战场结算时原样回传给 CmdNotifyBGBattleGvgResultS2SPub）
- **is_fast_simulate = true** 的战斗 **完全跳过 UI 表演**（无 QTE 阻塞态、无死亡切换等待），跟 [[01-battle-tick]] 说的正常战斗表现不同 —— 分析长战斗时长时要区分

---

## 附录 B · BattleStartElem（玩家战斗启动数据）

**代码位置**：`F:/G36Branch/LumiServer/server/feature/service/proto/ProtoBattle.proto::252`

### BattleStartElem（玩家级）

```protobuf
message BattleStartElem {
  uint64                          role_id                 = 1;
  repeated BattleStartLumiElem    lumi_data               = 2;    // Lumi 数据（每玩家最多 3 只）
  int32                           mmr                     = 3;
  int32                           rank                    = 4;    // 段位分（对应 LadderRank.Rank）
  bool                            player_support          = 5;    // 玩家 AI 开关（PVE 开启 AI 支援）
  int32                           player_trainer_skill_id = 6;    // 训练师技能 id
  CmdRoleHeadInfo                 head_info               = 7;    // 玩家头像/称号
  bool                            is_really_human         = 8;    // 是否真实玩家（分派 SimpleBattleAi vs PlayerSupport 的开关）
  int32                           robot_id                = 9;    // 机器人 id（对应 RobotData 表）
  int32                           monster_id              = 10;   // 怪物组 id（对应 MonsterGroup 表）
  int32                           master_lumi_pos         = 11;   // 首战 lumi 位置（0=第一只）
  uint64                          opponent_id             = 12;   // 埋点用：离线镜像时填对方 role_id
}
```

### BattleStartLumiElem（Lumi 级）

```protobuf
message BattleStartLumiElem {
  uint64  lumi_uid          = 1;    // Lumi 唯一实例 id
  uint64  lumi_uid_org      = 2;    // 原始 uid
  uint32  lumi_id           = 3;    // Lumi 配置 id（对应 Lumi.json.Id）
  uint32  level             = 4;
  uint32  break_level       = 5;    // 突破等级
  int32   hp_state          = 6;    // 资质：血
  int32   attack_state      = 7;    // 资质：攻
  int32   defstate_state    = 8;    // 资质：防
  int32   attack_speed_rate = 9;    // 攻速修正
  repeated AddBuffElem add_buffs = 10;   // 初始 buff（例如战斗前效果）
  int32   skill2_id         = 11;   // Skill2（玩家自选主动技能，见 [[04-skills]] §八）
  int32   hero_qulity       = 12;   // 品质
  repeated int32 passive_id = 13;   // **被动 id 列表**（业务服已按养成度过滤）
  int32   work_state        = 14;   // 工作值（不进战斗，见 [[03-stats]]）
  int32   lumi_score        = 15;
  string  lumi_name         = 16;
  int32   type2             = 17;   // 属性 2（第二属性，可能替换）
  optional CmdShowLumiCommon show_info = 18;
  reserved 19, 20;                  // 已迁移到 show_info
  int32   use_ai            = 21;   // **AI id**（对应 TbAIAct.Id，>0 走 CommonAiLogic，见 [[08-ai-behavior]]）
  optional int32 character_id  = 22;   // 性格 id
  optional int32 gradeGrowLv   = 23;   // 升阶成长等级
  optional int32 gradeBreakLv  = 24;   // 升阶突破等级
  optional int32 starLv        = 25;   // 星级
}
```

### 关键字段跟主章节的连接

| 字段 | 决定战斗中 |
|---|---|
| `is_really_human` | AI 载体分派（true → PlayerSupport / false → SimpleBattleAi）见 [[08-ai-behavior]] §一 |
| `rank` | PVP 匹配的 AI 等级：Rank<90 → High，Rank≥90 → Top |
| `passive_id[]` | 战斗开始挂哪些常规被动（业务服已按养成度过滤，见 [[06-passives-triggers]]）|
| `skill2_id` | Skill2 玩家自选主动技能（见 [[04-skills]] §八）|
| `use_ai` | 特化 AI 脚本 id（>0 走 CommonAiLogic，见 [[08-ai-behavior]] §六）|
| `hp_state / attack_state / defstate_state` | 资质，进入 [[02-damage-formula]] Step 3-5 属性面板计算 |
| `add_buffs[]` | 战斗前预挂 buff（例如活动增益、试炼特效）|

### 关键理解

**战斗服完全"忠实执行"** —— 所有养成度过滤、进化状态、装备特训等**业务侧的判定都由业务服完成后**传进来。战斗服只看到最终生效的 `passive_id[]` / `skill2_id` / `use_ai`。这就是为什么 [[06-passives-triggers]] 说"battle 服完全不引用 InbornBattlePassive 字段"。

**分析价值**：如果发现同一只 Lumi 在不同玩家/场次的强度差异异常大，先查这几个字段是不是不同：`skill2_id`（选了不同技能）、`passive_id[]`（养成度不同解锁的被动数量不同）、`gradeGrowLv/BreakLv/starLv`（升阶/星级差异改数值）。

---

## 附录 C · battle_end 事件字段（wiki daily CSV 的字段源）

wiki 侧参与走势 / 天梯配队分析都基于 **`battle_end` 埋点**。埋点 → 数数系统 → 数数开放 API → `ta-fetch.mjs` → daily CSV → 分析脚本。

### C.1 埋点定义（服务端上报）

**代码位置**：`F:/G36Branch/LumiServer/server/feature/service/proto/ProtoBattle.proto::322`

```protobuf
message BattleEndSlog {
  uint64                     game_id       = 1;
  int32                      e_game_type   = 2;   // EBattleType 枚举值（[[07]] 21 种）
  string                     game_type     = 3;   // 战斗类型字符串（"PVP1V1" / "PVP2V2" / "Week1v1" / "GYM_PVE" 等）
  uint64                     player_uid    = 4;   // 玩家 uid
  int32                      player_type   = 5;   // 玩家类型（1=真人，2=离线镜像，3=机器人，4=NPC）
  repeated SlogLumiCommon    lumis         = 6;   // 3 只 Lumi 的战斗信息（含 secondskill / state / …）
  int32                      trainer_id    = 7;   // 训练师 id
  int32                      battle_result = 8;   // 胜负：1=赢 / 2=输 / 3=未知
}
```

### C.2 SlogLumiCommon（每只 Lumi 战斗信息）

**代码位置**：`ProtoBattle.proto::299`

```protobuf
message SlogLumiCommon {
  string  lumi_uid          = 1;
  string  lumi_id           = 2;   // Lumi 配置 id
  string  lumi_name         = 3;
  int32   lumi_score        = 4;   // 评分
  string  lumi_state        = 5;   // 战斗数值文本，如 "攻击:557,防御:548"
  string  lumi_quality      = 6;   // "white/green/blue/purple/gold/color"
  int32   lumi_level        = 7;
  int32   lumi_secondskill  = 8;   // **玩家选的 Skill2 id**（分析强度分桶用）
  repeated int32 lumi_training = 9;   // 特训信息
  int32   lumi_star         = 10;
  int32   lumi_growth_break = 11;   // 升阶突破
  int32   lumi_growth_grade = 12;   // 升阶成长
}
```

### C.3 wiki daily CSV 字段（`ta-fetch.mjs` 的 SQL 列）

**ladder 模式**（`daily/ladder/*.csv`）：

```sql
SELECT
  "$part_date" AS part_date,
  game_id_str,           -- 战斗 id
  b_role_id,             -- 玩家 role_id
  player_rank,           -- 段位分
  player_type,           -- 1/2/3
  player_lumis,          -- JSON 数组（3 只 Lumi 的 SlogLumiCommon）
  battle_result,         -- 1/2/3
  trainer_id
FROM ta.v_event_29                -- 国内表；海外是 v_event_83
WHERE "$part_date" >= 'X' AND "#event_name" = 'battle_end'
  AND TRY_CAST(b_zone_id AS bigint) IN (...)
  AND game_type = 'PVP1V1'         -- ← 用 game_type 分流具体玩法
```

**tournament 模式**（`daily/tournament/*.csv`）：额外多一列 `player_week_win`（周胜利次数）；`game_type = 'Week1v1'`

**infinity-gym 模式**（`daily/infinity-gym/*.csv`）：
- **靠 `GROUP BY game_id_str + MAX(CASE WHEN player_type = X)` 合并**（每场道馆上报 2 条 battle_end：`player_type=1` 是玩家视角，`player_type=4` 是 NPC 视角）
- **靠 gym_uid 范围过滤**：`gym_uid ∈ [128100001, 128101000]` = 无限道馆（跟普通道馆共用 EBattleType，[[07-battle-modes]] §无限道馆版本迁移）
- ⚠️ **未来版本迁移**：如果无限道馆改成独立 `TowerPve = 20`，SQL 要改成按 EBattleType 分（[[battle-config-vs-code-default]] 关联提醒）

**其他模式**：login / guild-war / assist / recharge 各自的 SQL 见 `ta-fetch.mjs::81~250`。

### C.4 wiki CSV 里字段的实战解读示例

```csv
part_date,game_id_str,b_role_id,player_rank,player_type,player_lumis,battle_result,trainer_id
"2026-09-10","27306177","178001854316749","90.0","1.0","[{...3 只 lumi 数组...}]","1.0","1.0"
```

- `player_type=1` + `player_rank=90` → 真人玩家、黄金段位后段，遇到的 AI 是 **Top 级**
- `battle_result=1` → 玩家赢了
- `player_lumis[0].lumi_secondskill=10002` → 该玩家的九色鹿选的 Skill2 是 10002 号技能
- `player_lumis[0].lumi_state="攻击:557,防御:548"` → 战斗时的最终攻防（含所有资质/等级/突破/性格 buff 加成）

### C.5 常见分析坑

| 坑 | 排查方法 |
|---|---|
| **CSV 只有 battle_end 的一方**（缺对手）| 天梯是**每玩家各上报一次**；同一 `game_id_str` 出现 1 次是"离线镜像 vs 真人"（镜像的 battle_end 上报到 opponent_id 字段但不作为独立行）；出现 2 次是"两个真人"|
| **`player_rank=0` 的记录** | 通常是机器人（`player_type=3`）或还没定段位的新号 |
| **`lumi_state` 字段格式不统一** | 文本字段 "攻击:X,防御:Y"，需要 `split(',').map(kv => kv.split(':'))` 解析；不同版本可能字段名变 |
| **CSV 里 `player_type=4`** | NPC 视角行（Pve 敌方 / 道馆 NPC），不是玩家 —— 通常聚合时需要过滤 |
| **同一 game_id_str 多次出现** | 无限道馆等模式一场战斗多条记录，走 `GROUP BY` 合并 |

---

## 附录 D · 伪随机同步（SyncRandom）

**代码位置**：`F:/G36Branch/LumiServer/battle/BattleCore/BattleRandom/SyncRandom.cs`

### D.1 实现

```csharp
public class SyncRandom
{
    public Random m_random;
    public int m_currentSeed;   // 保存当前种子

    // 生成 [min, max] 浮点
    public float Range(float min, float max)
        => (float)(m_random.NextDouble() * (max - min) + min);

    // 生成 [min, max) 整数
    public int Range(int min, int max) => m_random.Next(min, max);

    // 设置种子
    public void SetSeed(int seed)
    {
        m_random = new Random(seed);
        m_currentSeed = seed;
    }

    public int GetSeed() => m_currentSeed;
}
```

**极简**：就是 .NET `System.Random` 的封装 + `m_currentSeed` 记录。

### D.2 种子来源

**代码位置**：`BattleLifecycleHandler.cs::47` / `BattleBanPickHandler.cs::77`

```csharp
var randomSeed = TimeUtils.CurrentTimeMillisecondsInt;   // 当前毫秒时间戳（int32）
newGame.SetRandomSeed(randomSeed);
```

**特殊场景**（`BattleShareGameServer.cs::319`）：
```csharp
game.SetRandomSeed(1);   // 客户端模式/测试：固定种子 1，方便复现
```

### D.3 随机调用点

`game.random` 是 `BattleGameSystem` 的字段，所有随机相关调用都必须走它（不能用 `new Random()` / `Math.Random()`）：

| 调用点 | 用途 |
|---|---|
| `random.Range(0, 10000)` | **暴击 / 命中 / 概率触发**万分比判定（[[02-damage-formula]] Step 6 等）|
| `random.Range(0, targets.Count)` | 随机选择目标 |
| `random.Range(0, lumiList.Count)` | Bot AI 换宠随机选（`ActionChangeLumiRandomActive`）|
| `BattleDefine.SelectRandomEffectId` 里的 roll | Buff 效果随机选（万分比累加）|

### D.4 「同步」的语义

**注意**：SyncRandom 不是"客户端跟服务端同步同一个 random 序列"—— **战斗服是权威**，客户端只做表现。SyncRandom 的**"同步"**含义是：
- 同一场战斗**每次相同的 `SetSeed` 就产生完全一致的序列** —— 用于 **FastSimulate**（战斗回放 / 快速模拟）时能精确复现每一步随机
- 不用于跨端随机同步（客户端根本不参与随机判定）

### D.5 复现战斗的必要条件

如果想在 headless CLI 里精确复现一场线上战斗，需要：
1. **相同的 `random_seed`** —— 从 battle_end log 里拿（如果上报了）或从 battle 日志的 `SetRandomSeed` 打点拿
2. **相同的 `BattleCreateArgs`**（一样的 stage_id / battle_type / 玩家阵容）
3. **相同的动作序列**（每 tick 的 action 输入）
4. **相同的 tick 频率**（服务端 tick 60Hz vs 30Hz 会改变时序）

⚠️ 目前**代码里没看到把 randomSeed 输出到 battle_end**，如果要做严格复现分析，得让埋点侧加个 seed 字段。

### D.6 意外的坑

**`System.Random` 是伪随机**，但 .NET 实现细节可能跨版本变（.NET Core 3.1 vs .NET 8 的 `Random` 内部算法有过更新）。跨版本升级服务端二进制**可能会改变同一 seed 的随机序列**，此时"复现旧战斗"会失败。

如果需要严格跨版本复现，应该实现一个**固定算法**的 PRNG（比如 xorshift / PCG）而不是用 `System.Random`。

---

## 跟其他章节的关系速查

| 想查 | 去看 |
|---|---|
| CSV 里 `player_type` 数字 → 语义 | 附录 C.4；[[07-battle-modes]] |
| CSV 里 `lumi_secondskill` → 强度差异 | 附录 C.2；[[04-skills]] §八 玩家自选 |
| `use_ai > 0` 的战斗为啥 AI 决策不一样 | 附录 B；[[08-ai-behavior]] §六 |
| `passive_id[]` 为什么有的玩家多有的少 | 附录 B；[[06-passives-triggers]] §常规 vs 天生 |
| 复现战斗需要什么参数 | 附录 D.5 |

---

## Unknowns（新增）

1. 🟡 **P1**：**battle_end 埋点没上报 `random_seed`** —— 复现战斗要靠日志里的 `SetRandomSeed` debug 打点。建议未来加个字段。
2. 🟢 **P2**：**.NET Random 跨版本一致性** —— .NET 大版本升级可能变随机序列。目前是否有版本锁定的运维要求？

---

> 最后验证于 commit `1bf7b708d`（分支 OB-dev），日期 2026-09-12
> 关键代码：`SyncRandom.cs` · `BattleLifecycleHandler.cs::47` · `ProtoBattle.proto::252~331`（BattleStartElem / BattleStartLumiElem / SlogLumiCommon / BattleEndSlog）· `serverBattle.proto::33`（BattleCreateArgs）
> wiki 侧：`D:/lumiwiki/scripts/ta-fetch.mjs`（daily CSV 的 SQL 定义）
