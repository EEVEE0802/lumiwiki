# Lumi 信息汇总 Excel 导出

对内版噜咪 + 物品信息汇总到 `D:\Lumi信息汇总.xlsx`。给策划/PM 汇报或对表用。

## 📁 文件清单

| 文件 | 用途 |
|---|---|
| `scripts/generate-lumi-excel.py` | 生成 sheet 1「噜咪信息汇总」（重跑会**覆盖整个文件**） |
| `scripts/generate-item-sheet.py` | 生成 sheet 2「道具信息」（**只操作 sheet 2**，sheet 1 完全不动） |
| `D:\Lumi信息汇总.xlsx` | 输出文件（不在 git 里） |

## 🚀 运行

```bash
cd D:/lumiwiki
python scripts/generate-lumi-excel.py   # sheet 1（第一次生成 or 强制重建）
python scripts/generate-item-sheet.py   # sheet 2（可反复跑，不影响 sheet 1）
```

依赖：`openpyxl`（已安装）、`Pillow`（已安装）。

## ⚠️ 顺序 & 手动修正保护

- 用户在 sheet 1 里做了**手动修正**（比如把「主线」改成「主线噜咪」）。这些修正**不能被覆盖**。
- `generate-lumi-excel.py` 是**从零生成整个文件**的脚本，跑它会盖掉所有手动修正。**除非用户明确要求重建 sheet 1，否则不要跑这个**。
- `generate-item-sheet.py` 用 `load_workbook` 加载现有文件，只清空 sheet 2 数据行后重写，sheet 1 原样保留（openpyxl roundtrip 已验证图片和样式不丢）。
- 日常场景（物品数据更新后重新导出）只跑 `generate-item-sheet.py` 就够。

## 📊 sheet 1：噜咪信息汇总

**数据源**（对内版）：
- `D:/lumiwiki/public/data/internal/Lumi.json` — 主数据
- `D:/lumiwiki/public/data/internal/LumiEvolution.json` — 进化关系
- `D:/lumiwiki/public/data/internal/zh-CN.json` / `en.json` — 中英文名
- `D:/lumiwiki/public/images/avatars/CA_<Id>.png` — 立绘（**注意用 public/images/avatars，不是 internal/avatars**，因为立绘不区分对内对外）
- `D:/噜咪模型/Char_<Model>.png|.jpg` — 三视图（模型资源目录）

**行结构**：
- 列 A：类型（普通 / 异色卡 / 次元卡 / 王 / 幻境卡）
- 列 B：获取途径（主线 / S1 / S2 / S3 / S4，对应 `LumiTag` 1~5）
- 列 C+：每段进化 **5 列**（中文名 / 英文名 / **属性** / 立绘 / 三视图）
- 属性文本：单属性 `水`、双属性 `水/火`（`Lumi.json` 的 `Type1`/`Type2`，映射见 CLAUDE.md「枚举映射」）

**类型顺序 & 排序**：
- 5 个类型块顺序：`普通 → 异色卡 → 次元卡 → 王 → 幻境卡`（对应 `CardBack` = 0 / 50 / 98 / 80 / 99）
- 块内按 `PokedexId` 升序

**进化链合并规则**：
- 线性进化写一行：`base → evo1 → evo2 → evo3`（最深见过 4 段）
- **分支进化全塞到同一行**（分支目标经确认都是终点）：
  - 花牌孔雀（108901）：`base → 男 111001 → 女 126301`（3 列）
  - 喵鲨（110801）：`base + 8 种类型 kat`（9 列，Excel 会有 38 列宽）
- 特殊卡（异色/3D/王/幻境）没有进化链，只占 1 段列

**过滤**：
- `LumiTag=0`（未投放）的噜咪跳过（当前是朱雀 108201、冒险菇 136201）

## 📦 sheet 2：道具信息

**数据源**：
- `D:/lumiwiki/public/data/internal/Item.json`
- `D:/lumiwiki/public/data/internal/zh-CN.json`
- `D:/lumiwiki/public/images/internal/items/<icon>.png|.jpg` — 对内版图标

**过滤**：`isShow=True` 的物品（游戏内图鉴显示的 147 个）。**不用** wiki 页面的 `name != ''` 过滤（那会拉出 1141 个，含大量内部道具）。

**排序**：`type → order → key1` 升序。type 常见值：`2=消耗品 / 3=材料 / 4=装备 / 6=噜咪蛋 / 10=典藏 / 13=喵币`。

**列结构**：
- A：名字（`zh-CN.json[name]`）
- B：用途（`zh-CN.json[des]`）
- C：图标（100×100 嵌入）

**缺翻译的处理**：文本里显示为 `[缺翻译] Item_XXX` / `[缺描述] ItemD_XXX`，方便对表时定位。

## 🖼️ 图片规格

**立绘**（sheet 1）—— **原图无损嵌入**：
- 用 `openpyxl.drawing.image.Image(源文件路径)` 直接读入原文件字节，openpyxl 不 re-encode
- 源文件本身就是 256×256（游戏客户端资源规格），显示尺寸设为 100×100 保持格子紧凑
- 列宽 15（≈100px），在 Excel 里"重置图片大小"可看到 256×256 原分辨率
- ⚠️ 之前用 PIL thumbnail 缩到 100×100 是有损缩略，2026-08-20 已改为原图（用户明确要求）

**三视图**（sheet 1 独有）—— **原图无损嵌入**：
- 用 `openpyxl.drawing.image.Image(原文件路径)` 直接读入原文件字节，openpyxl 打包时按原样嵌入 xlsx（不 re-encode）
- 显示尺寸：宽度固定 500px，高度按原图比例算 = `500 * orig_h / orig_w`
- **列宽 72**（≈500px），**行高按本行三视图最大高度动态设**（`max(80pt, max_h_px * 0.75)`）
- 单张 2~10 MB，244 只噜咪嵌进去 xlsx 会到 **500 MB ~ 1 GB**（用户可接受，见 2026-08-20 决策）
- Excel 打开会慢，但支持原图分辨率查看细节（右键 → 大小和属性 → 重置图片大小可看原分辨率）

**sheet 2 物品图标**：仍是 100×100 缩略图（PIL 等比缩放 + 透明背景居中，PNG）。因为源图标本身就是 UI 图标级别小图，缩略够用。缩放临时文件放 `tempfile.gettempdir()/lumi_item_*`，脚本末尾自动清理。

**行高**：
- 表头行 24 pt
- 数据行：`max(80pt, 三视图显示高度 × 0.75)`，通常 100~130 pt 之间

## ⚠️ 已知缺失（**2026-08-20 22:34** 更新后状态）

**sheet 1**
- 缺立绘（1 个 wiki 里无 `CA_xxx.png`）：`138304`
- 缺三视图（3 个）：`Candle_Ghost`（147401 蜡烛鬼）、`Ghastling`（147501）、`Spider_Tomb`（147701 墓地蜘蛛）

**sheet 2**
- 缺翻译 12 个：`Item_60004 / Item_60129 / Item_52101 / Item_20050~20055 / Item_61107~61109`
- 缺图标 2 个：
  - `Item_60004`（key1=10021）—— 对外 `public/images/items/` 里其实有这张，可复制到 `internal/items/`
  - `Item_13002`（S2典藏喵币）—— 两个目录都缺，游戏侧还没导

跑脚本时终端会打印当前缺失清单，以那份为准。

## 🔧 三视图模型名映射

`Lumi.json.Model` 字段跟 `D:/噜咪模型/` 里的文件名有几处**不一致**，脚本里有 `manual` 特例表处理：

| Model 字段 | 实际文件 |
|---|---|
| `Chicken_Gugu` | `Chichen_Gugu`（拼写差异） |
| `Otter_SteelHelm` | `OtterSteelHelm`（少一个下划线） |
| `Deer_Solaris` | `Deer_Solarise`（拼写差异） |
| `Butterfly_Meteor_01` | `Butterfly_Meteor`（去 _01） |
| `Wolf_Frostwild_3D` | `Wolf_Frostwild`（去 _3D） |
| `Deer_Rainbow_Full` | `Deer_Rainbow_Full_D`（尾巴多个 _D） |

新增映射需求时改 `find_model_file()` 里的 `manual` 字典。

## 🔁 何时需要重跑

**sheet 2（跑 `generate-item-sheet.py`）**：
- 游戏物品新增 / 描述改动 → 每日 03:00 定时任务同步了 `Item.json` 后
- 图标资源补齐（比如从对外目录拷了缺的图标到对内）

**sheet 1（跑 `generate-lumi-excel.py`，⚠️ 会盖掉手改）**：
- 只有在**用户明确说要重建**、或者噜咪基础数据大改（比如新赛季一堆新噜咪 + 手改的字段已经过时）时才跑
- 跑前**必须先跟用户确认是否保留原文件**（建议先另存一份）

## 🐛 已知踩坑

1. **Windows GBK 控制台**：脚本里带 emoji 的 print 直接跑会 `UnicodeEncodeError`。已在文件头强制 stdout 用 utf-8：
   ```python
   sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
   ```
2. **openpyxl roundtrip**：加载后再保存文件大小会有 ~1% 波动，图片和样式保留正常，但**宏、透视表、部分图表配置**会丢——本项目不涉及所以 OK。
3. **openpyxl 图片位置**：`ws.add_image(img, 'C2')` 只锚定到单元格左上角，图片本身尺寸靠 `img.width/img.height` 指定，行高 / 列宽也要预设好。
