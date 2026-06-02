#!/usr/bin/env node
/**
 * LumiWiki 多语言数据准备脚本
 *
 * 用途：将原始多语言数据（数组格式）转换为对象格式并复制到 public/data
 *
 * 使用方法：
 * node prepare-i18n-data.js
 */

const fs = require('fs')
const path = require('path')

// 源数据目录
const SRC_DIR = 'D:/G36Branch/LumiGoProgram/LumiGoDesigner/Config/Luban/Datas/Table/data'
// 目标目录
const DST_DIR = path.join(__dirname, 'public/data')

// 语言配置
const LANGUAGES = {
  'zh-CN': { file: 'MultilingualCN.json', name: '简体中文' },
  'zh-TW': { file: 'MultilingualTR.json', name: '繁體中文' },
  'en': { file: 'MultilingualEN.json', name: 'English' },
  'ja': { file: 'MultilingualJP.json', name: '日本語' },
  'ko': { file: 'MultilingualKR.json', name: '한국어' },
}

console.log('======================================')
console.log('   LumiWiki 多语言数据准备工具')
console.log('======================================')
console.log('')

// 确保目标目录存在
if (!fs.existsSync(DST_DIR)) {
  fs.mkdirSync(DST_DIR, { recursive: true })
}

let totalProcessed = 0

// 处理每种语言
for (const [langCode, config] of Object.entries(LANGUAGES)) {
  const srcFile = path.join(SRC_DIR, config.file)
  const dstFile = path.join(DST_DIR, `${langCode}.json`)

  console.log(`📂 处理 ${config.name} (${langCode})...`)

  // 检查源文件是否存在
  if (!fs.existsSync(srcFile)) {
    console.log(`   ⚠️  源文件不存在，跳过: ${srcFile}`)
    console.log('')
    continue
  }

  try {
    // 读取原始数据（数组格式）
    const rawData = fs.readFileSync(srcFile, 'utf-8')
    const dataArray = JSON.parse(rawData)

    // 转换为对象格式
    const dataObject = {}
    for (const item of dataArray) {
      if (item.Id && item.Data !== undefined) {
        dataObject[item.Id] = item.Data
      }
    }

    // 写入目标文件
    fs.writeFileSync(dstFile, JSON.stringify(dataObject, null, 2), 'utf-8')

    const count = Object.keys(dataObject).length
    totalProcessed += count
    console.log(`   ✅ 成功处理 ${count} 条数据`)
    console.log(`   📄 输出: ${dstFile}`)
    console.log('')

  } catch (error) {
    console.error(`   ❌ 处理失败: ${error.message}`)
    console.log('')
  }
}

console.log('======================================')
console.log('✅ 处理完成！')
console.log('======================================')
console.log('')
console.log('📊 统计：')
console.log(`   - 总处理条目: ${totalProcessed}`)
console.log(`   - 输出目录: ${DST_DIR}`)
console.log('')
console.log('💡 提示：')
console.log('   - 多语言数据已准备就绪')
console.log('   - 运行 npm run dev 重新启动开发服务器')
console.log('')
