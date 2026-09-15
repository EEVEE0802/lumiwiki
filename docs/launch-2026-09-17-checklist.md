# 9/17 正式服上线数据清理清单

**执行时机**：**9/17 服务器正式对外开放之前**（当天凌晨或上午都行，只要保证清空后没有旧数据混入即可）

**⚠️ 前提**：定时任务已在 9/15 提前暂停，避免 9/16 凌晨跑测试服最后一次数据后被清掉浪费时间。

---

## Step 1 · 清测试服 CSV（原始事件流）

```bash
cd D:/lumiwiki

# 国内 archive（所有 daily/ + recharge.csv 全部删掉）
rm -rf data/domestic/archive/

# 海外 archive
rm -rf data/overseas/archive/
```

## Step 2 · 清测试服周聚合 JSON + weeks 索引

```bash
# weeks.json（周次索引，前端切周用）
rm -f public/data/online/domestic/weeks.json
rm -f public/data/online/overseas/weeks.json
rm -f public/data/online/domestic/weekly/weeks.json
rm -f public/data/online/overseas/weekly/weeks.json

# weekly 目录（ladder-weekN / tournament-weekN / participation-weekN）
rm -rf public/data/online/domestic/weekly
rm -rf public/data/online/overseas/weekly

# 当前周快照（battle-stats.json / infinity-gym.json / tournament.json 等）
rm -f public/data/online/domestic/battle-stats.json
rm -f public/data/online/overseas/battle-stats.json
rm -f public/data/online/domestic/infinity-gym.json
rm -f public/data/online/overseas/infinity-gym.json
rm -f public/data/online/domestic/tournament.json
rm -f public/data/online/overseas/tournament.json
```

## Step 3 · 清测试服推荐配队（部分噜咪替换了会是坏数据）

```bash
rm -f public/data/domestic/lumi-teams.json
rm -f public/data/overseas/lumi-teams.json
rm -f public/data/internal/domestic/lumi-teams.json
rm -f public/data/internal/overseas/lumi-teams.json
```

> ✅ **保留**：`public/data/lumi-teams.json`（旧路径，兼容用）—— 如果这个文件存在也一起删掉

## Step 4 · Publish + 提交

```bash
cd D:/lumiwiki
bash publish.sh
git add -A
git commit -m "清空测试服线上数据，为 9/17 正式服上线做准备"
git push
```

## Step 5 · 恢复定时任务

```bash
MSYS_NO_PATHCONV=1 schtasks /change /tn "LumiWiki_Online_Daily" /enable
MSYS_NO_PATHCONV=1 schtasks /change /tn "LumiWiki_Daily" /enable

# 校验
MSYS_NO_PATHCONV=1 schtasks /query /tn LumiWiki_Online_Daily /fo LIST | head -6
MSYS_NO_PATHCONV=1 schtasks /query /tn LumiWiki_Daily /fo LIST | head -6
```

## Step 6 · 手动触发一次线上任务验证（可选）

```bash
# 9/17 正式服开服后跑一次，确认拉取正常（此时 tournament / guild-war 会被 MODE_OPEN_DATE 跳过）
node scripts/auto-update.mjs
```

---

## 预期结果

- Week 1 数据从 9/17 开始逐天积累，9/18 04:30 首次 auto-update 会生成 `ladder-week1.json`（含 9/17 一天数据）
- 9/25 正好是 Week 2 起点，04:30 auto-update 会同时生成 Week 1 完整版 + Week 2 首日
- 周赛（tournament）在 9/25 前一直被 `MODE_OPEN_DATE.tournament=2026-09-25` 跳过，日志会打 `⏭ [xxx/tournament] 尚未开放`
- 公会战（guild-war）在 9/30 前一直被跳过

## 排查

**Q: 万一 9/17 上线后有人访问前端，看到空白怎么办？**
A: `OnlineData.vue` 里 fetch 404 会显示"该周暂无数据"占位，`LumiDetail.vue` 推荐配队区域缺失时不会崩。首次 auto-update 跑完后正常显示。

**Q: `MODE_OPEN_DATE` 里日期填错了咋改？**
A: 直接改 `scripts/auto-update.mjs` 顶部的 MODE_OPEN_DATE 常量，push 就生效（定时任务下次跑用新代码）。

**Q: Week 1 真的是 8 天吗？**
A: 是的。`scripts/week-utils.mjs` 里 `getWeekDates(1)` 返回 9/17~9/24 的 8 个日期，Week 2 起恢复 7 天。
