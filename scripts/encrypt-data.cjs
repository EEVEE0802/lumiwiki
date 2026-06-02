#!/usr/bin/env node
/**
 * LumiWiki 数据加密脚本
 * 将 JSON 数据压缩并 Base64 编码，保护敏感数据
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '../public/data');
const OUTPUT_DIR = path.join(__dirname, '../public/data-encoded');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('========================================');
console.log('   LumiWiki 数据加密工具');
console.log('========================================');
console.log('');
console.log(`输入目录: ${DATA_DIR}`);
console.log(`输出目录: ${OUTPUT_DIR}`);
console.log('');

/**
 * 压缩并 Base64 编码
 */
function encodeData(data) {
  // 1. 转为 JSON 字符串
  const jsonString = JSON.stringify(data);

  // 2. Gzip 压缩
  const compressed = zlib.gzipSync(jsonString);

  // 3. Base64 编码
  const base64 = compressed.toString('base64');

  return base64;
}

/**
 * 处理单个数据文件
 */
function processFile(filename) {
  const inputPath = path.join(DATA_DIR, filename);
  const outputPath = path.join(OUTPUT_DIR, filename + '.encoded');

  if (!fs.existsSync(inputPath)) {
    console.log(`⊘ ${filename} (不存在，跳过)`);
    return;
  }

  try {
    // 读取数据
    const content = fs.readFileSync(inputPath, 'utf8');
    const data = JSON.parse(content);

    // 加密
    const encoded = encodeData(data);

    // 写入编码后的数据
    fs.writeFileSync(outputPath, encoded);

    const originalSize = content.length;
    const encodedSize = encoded.length;
    const ratio = ((encodedSize / originalSize) * 100).toFixed(1);

    console.log(`✓ ${filename}: ${originalSize}B → ${encodedSize}B (${ratio}% 压缩率)`);
  } catch (err) {
    console.log(`✗ ${filename}: 处理失败 - ${err.message}`);
  }
}

/**
 * 主程序
 */
function main() {
  // 要加密的数据文件
  const files = [
    'Lumi.json',
    'ActiveSkill.json',
    'BattlePassive.json',
    'HomePassive.json',
    'Item.json',
    'MarketPrice.json',
    'LumiEvolution.json',
    'LumiTypeCounter.json',
    'Avg.json',
    'extra.json',
    'localization.json',
  ];

  console.log('开始加密数据文件...');
  console.log('────────────────────────────────────────');

  let success = 0;
  let failed = 0;

  for (const file of files) {
    processFile(file);
    const inputExists = fs.existsSync(path.join(DATA_DIR, file));
    if (inputExists) success++;
    else failed++;
  }

  console.log('────────────────────────────────────────');
  console.log('');
  console.log(`完成! 成功: ${success}, 跳过: ${failed}`);
  console.log('');
  console.log(`编码后的文件保存在: ${OUTPUT_DIR}`);
  console.log('');
  console.log('提示：将 data-encoded 目录改名为 data 即可使用加密版本');
}

// 运行
main();
