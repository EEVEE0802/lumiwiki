# 数据更新流程

本文档记录如何从游戏原始数据目录更新 LumiWiki 的数据文件。

## 📂 数据源位置

**原始数据目录：**
```
D:\G36\LumiGoProgram\LumiGoDesigner\Config\Luban\Datas\Table\data
```

**项目数据目录：**
```
D:\LumiWiki\public\data
```

---

## 🚀 快速更新命令

### 方法一：一键复制（推荐）

```bash
# 1. 复制核心数据文件
cp "D:/G36/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/Table/data/ActiveSkill.json" /d/LumiWiki/public/data/
cp "D:/G36/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/Table/data/BattlePassive.json" /d/LumiWiki/public/data/
cp "D:/G36/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/Table/data/HomePassive.json" /d/LumiWiki/public/data/
cp "D:/G36/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/Table/data/Lumi.json" /d/LumiWiki/public/data/
cp "D:/G36/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/Table/data/LumiEvolution.json" /d/LumiWiki/public/data/
cp "D:/G36/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/Table/data/LumiTypeCounter.json" /d/LumiWiki/public/data/
cp "D:/G36/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/Table/data/Item.json" /d/LumiWiki/public/data/
cp "D:/G36/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/Table/data/BattleKeywordDes.json" /d/LumiWiki/public/data/

# 2. 🚨 必须运行：更新多语言数据文件
cd /d/LumiWiki
node prepare-i18n-data.cjs

# 3. 🚨 重要：删除旧的缓存文件
rm /d/LumiWiki/public/data/*.encoded
echo "✓ 缓存文件已清除，请硬刷新浏览器（Ctrl + F5）"
```

**⚠️ 注意事项：**
- **第 2 步是必须的**！前端使用 `zh-CN.json` 等多语言文件，不是 `localization.json`
- 如果跳过第 2 步，会导致显示错误（如噜咪名称错误、技能描述错误等）

### 方法二：使用更新脚本（可选）

创建 `update-data.sh` 脚本：
```bash
#!/bin/bash
echo "开始更新数据..."

# 源目录
SRC="D:/G36/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/Table/data"
# 目标目录
DST="/d/LumiWiki/public/data"

# 复制文件
cp "$SRC/ActiveSkill.json" "$DST/"
cp "$SRC/BattlePassive.json" "$DST/"
cp "$SRC/HomePassive.json" "$DST/"
cp "$SRC/Lumi.json" "$DST/"
cp "$SRC/LumiEvolution.json" "$DST/"
cp "$SRC/LumiTypeCounter.json" "$DST/"
cp "$SRC/Item.json" "$DST/"
cp "$SRC/BattleKeywordDes.json" "$DST/"

# 转换多语言文件
cd /d/LumiWiki && node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$SRC/MultilingualCN.json', 'utf8'));
const result = {};
for (const item of data) {
  result[item.Id] = item.Data;
}
fs.writeFileSync('public/data/localization.json', JSON.stringify(result, null, 2), 'utf8');
console.log('✓ localization.json 转换完成');
"

# 删除缓存文件
rm /d/LumiWiki/public/data/*.encoded
echo "✓ 缓存文件已清除"

echo "数据更新完成！请硬刷新浏览器（Ctrl + F5）查看效果"
```

使用方法：
```bash
bash /d/LumiWiki/update-data.sh
```

---

## 📋 需要更新的文件清单

| 文件名 | 大小约 | 说明 |
|--------|--------|------|
| `ActiveSkill.json` | 511K | 主动技能数据 |
| `BattlePassive.json` | 48K | 战斗被动技能数据 |
| `HomePassive.json` | 26K | 家园被动技能数据 |
| `Lumi.json` | 534K | 噜咪基础数据 |
| `LumiEvolution.json` | 24K | 进化链数据 |
| `LumiTypeCounter.json` | 9.3K | 属性克制数据 |
| `Item.json` | 438K | 物品数据 |
| `BattleKeywordDes.json` | 2.4K | 关键字描述数据 |
| `localization.json` | 537K | 多语言文本（需要转换） |

---

## ⚠️ 注意事项

### 1. 多语言文件格式转换

原始数据中的 `MultilingualCN.json` 是**数组格式**：
```json
[
  { "Id": "key1", "Data": "value1" },
  { "Id": "key2", "Data": "value2" }
]
```

项目需要的是**对象格式**：
```json
{
  "key1": "value1",
  "key2": "value2"
}
```

必须使用 Node.js 脚本转换格式，参考上面的命令。

### 2. 验证更新是否成功

```bash
# 查看文件更新时间
ls -lh /d/LumiWiki/public/data/*.json

# 查看 localization.json 条目数量
node -e "console.log(JSON.parse(require('fs').readFileSync('/d/LumiWiki/public/data/localization.json')).length, '条')"
```

### 3. 重启开发服务器

更新数据后需要重启服务器：
```bash
# 如果服务器正在运行，先停止（Ctrl+C）
# 然后重新启动
cd /d/LumiWiki
npm run dev
```

### 4. 🚨 重要：清除 .encoded 缓存文件

**问题**：项目会优先加载 `.json.encoded` 缓存文件，如果数据更新后不删除缓存，浏览器会显示旧数据！

**解决方案**：更新数据后必须删除所有 `.encoded` 文件

```bash
# 删除所有 .encoded 缓存文件
rm /d/LumiWiki/public/data/*.encoded

# 验证已删除
ls /d/LumiWiki/public/data/*.encoded
# 应该显示：No such file or directory
```

**为什么需要这样做**：
- 代码优先加载 `.encoded` 文件（压缩格式）
- 更新 `.json` 文件后，`.encoded` 文件还是旧的
- 导致浏览器显示缓存数据，新数据不生效

**验证数据已更新**：
1. 清除缓存后，硬刷新浏览器（`Ctrl + F5`）
2. 检查主页数据统计是否正确
3. 查看具体噜咪/技能数据是否是最新的

---

## 🚀 内网发布流程

### 🚨🚨🚨 端口规则（最高优先级！！！）

# ⚠️ 端口必须是 3005！绝对不能改！ ⚠️

**固定端口：** `3005`
- ❌ 严禁使用其他端口
- ❌ 严禁让 Vite 自动选择端口
- ✅ 端口被占用时，先杀掉占用进程再启动

### 发布地址

**内网访问地址：** `http://10.27.17.179:3005`

**路由模式：** Hash 模式（支持刷新页面不 404）

### 发布步骤

#### 方法一：使用发布脚本（推荐）

```bash
bash /d/LumiWiki/publish.sh
```

脚本会自动完成：构建 → 停止旧服务器 → 启动新服务器

#### 方法二：手动发布

1. **构建生产版本**
```bash
cd /d/LumiWiki
npm run build
```

2. **停止旧服务器（如需要）**
```bash
# 查找占用端口 3005 的进程
netstat -ano | findstr ":3005"

# 终止进程（替换 <PID>）
taskkill /F /PID <PID>
```

3. **启动生产服务器**
```bash
cd /d/LumiWiki/dist
python -m http.server 3005
```

### 服务器管理

**查看服务器状态：**
```bash
netstat -ano | findstr ":3005"
```

**停止服务器：**
```bash
# 方法1：使用进程ID
taskkill /F /PID <进程ID>

# 方法2：停止所有 Python HTTP 服务器
taskkill /F /IM python.exe
```

**重启服务器：**
```bash
# 先停止旧服务器，再启动
taskkill /F /IM python.exe
cd /d/LumiWiki/dist && python -m http.server 3005 &
```

### 注意事项

1. **路由模式**：项目使用 Hash 模式，URL 格式为 `http://10.27.17.179:3005/#/lumi/123`
2. **数据目录**：`dist` 目录包含所有需要的文件（data、images 等）
3. **端口固定**：始终使用端口 **3005**，方便团队成员记住访问地址
4. **后台运行**：服务器在后台运行，关闭终端不会停止服务

### 🚨🚨🚨 端口规则（最高优先级！！！）

# ⚠️ 端口必须是 3005！绝对不能改！ ⚠️

- ❌ **严禁**使用其他端口
- ❌ **严禁**让 Vite 自动选择端口
- ✅ 端口被占用时，先杀掉占用进程再启动

**杀掉占用端口的命令：**
```bash
# 查找占用 3005 的进程
netstat -ano | findstr ":3005"
# 杀掉进程（替换 <PID>）
taskkill /F /PID <PID>
```

### 工作能力映射关系

```javascript
// 打工能力类型映射（Luban 枚举 WorkType）
const WORK_TYPE_NAMES = {
  0: '无',       8: '发电',
  1: '手工',     9: '采矿',
  2: '伐木',     10: '制冷',
  3: '种植',     11: '种苹果',
  4: '祈愿',     12: '养鱼',
  5: '生火',     13: '牧场2',
  6: '探险',     14: '产花蜜',
  7: '牧场',     15: '水产养殖',
}
```

**更新记录：**
- 2026-04-27 晚：更新工作能力映射（许愿→祈愿、烧菜→生火、探索→探险、饲养→牧场、苹果园→种苹果、饲养2→牧场2、酿蜜→产花蜜）
- 2026-04-27 晚：路由改为 Hash 模式，支持页面刷新

## 🔧 故障排查

### 问题：找不到 MultilingualCN.json

**解决方案：** 检查原始数据目录中是否有该文件，或文件名是否变更：
```bash
ls "D:/G36Branch/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/Table/data" | grep -i multilingual
```

### 问题：localization.json 格式错误导致页面空白

**解决方案：** 检查浏览器控制台错误信息，重新运行转换脚本。

### 问题：数据更新后页面没有变化

**解决方案：**
1. 硬刷新浏览器（Ctrl+F5 或 Ctrl+Shift+R）
2. 清除浏览器缓存
3. 检查开发服务器是否正常运行

---

### 🚨 问题：多语言数据未更新导致显示错误（2026-05-26）

**现象：**
- 更新 Lumi.json 后，部分噜咪显示错误的名称或数据
- 例如：125601 显示为"柴火熊"而不是"飞刀鸵鸟"

**原因：**
- 前端使用 `zh-CN.json` 等多语言文件，**不是** `localization.json`
- 只更新 `localization.json` 不会影响前端显示

**解决方案：**
每次更新游戏数据时，必须同时运行多语言数据准备脚本：
```bash
cd D:/LumiWiki
node prepare-i18n-data.cjs
```

**脚本会更新以下文件：**
- `public/data/zh-CN.json` - 简体中文（11,012 条）
- `public/data/zh-TW.json` - 繁体中文（11,012 条）
- `public/data/en.json` - 英语（10,996 条）
- `public/data/ja.json` - 日语（11,012 条）
- `public/data/ko.json` - 韩语（11,012 条）

---

### 🚨 问题：Story 为"无"时仍显示故事区块（2026-05-26）

**现象：**
- 部分噜咪（如 125601 飞刀鸵鸟）显示"故事"区块，但内容为"无"
- 共 11 个噜咪受影响：106202, 110404, 115204, 121004, 125601, 125604, 142501, 1003701, 1003801, 1003901, 1004001

**原因：**
- 前端只检查 `lumi.Story` 字段是否存在
- 没有检查本地化后的值是否为"无"或空

**已修复：**
- 在 `src/views/LumiDetail.vue` 中添加 `hasValidContent()` 方法
- 模板条件从 `v-if="lumi.Story"` 改为 `v-if="hasValidContent(lumi.Story)"`

**代码变更：**
```javascript
// 添加验证方法
function hasValidContent(key) {
  const val = locMap.value[key]
  return val && val !== '无' && val.trim() !== ''
}
```

**注意：** 此问题已在代码中修复，未来更新数据时无需重复操作。

---

### 🚨 问题：CA 立绘图片缺失（2026-05-26）

**现象：**
- 部分噜咪（如 127501, 142501）在游戏中有立绘，但 Wiki 不显示
- 前端使用 `v-if="lumi.CA"` 判断，图片加载失败会自动隐藏

**原因：**
- CA 立绘图片需要从游戏目录手动复制到 Wiki
- 游戏数据更新时可能有新增的 CA 资源

**解决方案：**
1. 检查缺失的 CA 图片：
```bash
cd D:/LumiWiki
node -e "
const fs = require('fs');
const lumi = JSON.parse(fs.readFileSync('public/data/Lumi.json', 'utf8'));
const avatarDir = 'public/images/avatars';
const existingFiles = fs.readdirSync(avatarDir).filter(f => f.endsWith('.png')).map(f => f.replace('.png', ''));
const missing = [];
lumi.forEach(item => {
  if (item.CA && !existingFiles.includes(item.CA)) {
    missing.push({ id: item.Id, ca: item.CA });
  }
});
console.log('缺失的 CA 图片:', missing);
"
```

2. 从游戏目录复制缺失的图片：
```bash
cp "D:/G36/LumiGoProgram/LumiGoProgram/Client/Assets/UIResource/Textures/Lumi/CA_XXXXXX.png" "D:/LumiWiki/public/images/avatars/"
```

3. 验证完整性：确保所有有 CA 字段的噜咪都有对应的图片文件

---

## 📝 更新记录

| 日期 | 操作人 | 备注 |
|------|--------|------|
| 2026-04-27 | Claude | 初始版本，更新全部 9 个数据文件 |
| 2026-05-26 | Claude | 更新全部 9 个数据文件 + 5 个多语言文件；修复 Story 为"无"的显示问题；补充缺失的 CA 立绘图片（127501, 142501, 120704） |

---

*最后更新：2026-05-26*
