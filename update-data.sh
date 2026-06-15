#!/bin/bash
# LumiWiki 数据更新脚本
# 使用方法：bash update-data.sh

echo "======================================"
echo "   LumiWiki 数据更新工具"
echo "======================================"
echo ""

# 源目录
SRC="F:/G36/LumiGoDesigner/Config/Luban/Datas/Table/data"
# 目标目录
DST="/d/LumiWiki/public/data"

# 检查源目录是否存在
if [ ! -d "$SRC" ]; then
  echo "❌ 错误：源目录不存在"
  echo "   $SRC"
  exit 1
fi

echo "📂 数据源目录：$SRC"
echo "📂 目标目录：$DST"
echo ""

# 复制文件
echo "📦 正在复制数据文件..."

cp "$SRC/ActiveSkill.json" "$DST/" && echo "  ✓ ActiveSkill.json"
cp "$SRC/BattlePassive.json" "$DST/" && echo "  ✓ BattlePassive.json"
cp "$SRC/HomePassive.json" "$DST/" && echo "  ✓ HomePassive.json"
cp "$SRC/Lumi.json" "$DST/" && echo "  ✓ Lumi.json"
cp "$SRC/LumiEvolution.json" "$DST/" && echo "  ✓ LumiEvolution.json"
cp "$SRC/LumiTypeCounter.json" "$DST/" && echo "  ✓ LumiTypeCounter.json"
cp "$SRC/Item.json" "$DST/" && echo "  ✓ Item.json"
cp "$SRC/BattleKeywordDes.json" "$DST/" && echo "  ✓ BattleKeywordDes.json"
cp "$SRC/Avg.json" "$DST/" && echo "  ✓ Avg.json"

echo ""
echo "🔄 正在转换多语言文件格式..."

# 转换多语言文件
cd /d/LumiWiki && node -e "
const fs = require('fs');
const srcPath = '$SRC/MultilingualCN.json';
const dstPath = 'public/data/localization.json';

try {
  const data = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  const result = {};
  for (const item of data) {
    result[item.Id] = item.Data;
  }
  fs.writeFileSync(dstPath, JSON.stringify(result, null, 2), 'utf8');
  console.log('  ✓ localization.json 转换完成，共 ' + Object.keys(result).length + ' 条');
} catch (e) {
  console.log('  ❌ 转换失败：' + e.message);
  process.exit(1);
}
"

echo ""
echo "======================================"
echo "✅ 数据更新完成！"
echo "======================================"
echo ""
echo "📊 更新后的文件："
ls -lh /d/LumiWiki/public/data/{ActiveSkill,BattlePassive,HomePassive,Lumi,LumiEvolution,LumiTypeCounter,Item,BattleKeywordDes,localization}.json | awk '{print "  " $9 " - " $5}'
echo ""
echo "💡 提示：请刷新浏览器查看最新数据"
echo "   如果数据未生效，请尝试硬刷新（Ctrl+F5）"
