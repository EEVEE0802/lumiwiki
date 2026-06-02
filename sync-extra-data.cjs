#!/usr/bin/env node
/**
 * LumiWiki 扩展数据同步脚本
 *
 * 用途：从腾讯文档导出的 CSV 文件同步扩展数据到 extra.json
 *
 * 使用方法：
 * 1. 在腾讯文档中编辑数据
 * 2. 导出为 CSV 文件（命名为 extra-data.csv）
 * 3. 将 CSV 文件放在项目根目录
 * 4. 运行此脚本：node sync-extra-data.js
 *
 * CSV 格式：
 * 噜咪ID,体型,活动地图,关键特质,行为习惯
 * 101001,小型,草原,善于奔跑,白天活动
 */

const fs = require('fs')
const path = require('path')

// 文件路径
const CSV_FILE = path.join(__dirname, 'extra-data.csv')
const OUTPUT_FILE = path.join(__dirname, 'public/data/extra.json')

console.log('======================================')
console.log('   LumiWiki 扩展数据同步工具')
console.log('======================================')
console.log('')

// 检查 CSV 文件是否存在
if (!fs.existsSync(CSV_FILE)) {
  console.error('❌ 错误：未找到 extra-data.csv 文件')
  console.log('')
  console.log('请按以下步骤操作：')
  console.log('1. 在腾讯文档中编辑数据')
  console.log('2. 导出为 CSV 文件')
  console.log('3. 将文件重命名为 extra-data.csv')
  console.log('4. 放在项目根目录（与 sync-extra-data.js 同级）')
  console.log('')
  process.exit(1)
}

// 读取并解析 CSV
console.log('📂 正在读取 CSV 文件...')
const csvContent = fs.readFileSync(CSV_FILE, 'utf-8')

// 解析 CSV（处理中文逗号和引号）
function parseCSV(csv) {
  const lines = csv.split('\n').filter(line => line.trim())
  if (lines.length < 2) {
    throw new Error('CSV 文件为空或格式错误')
  }

  // 解析表头
  const headers = parseCSVLine(lines[0])
  console.log('📋 表头：', headers.join(', '))

  // 验证必需的列
  const idIndex = headers.findIndex(h => h.includes('ID') || h.includes('噜咪'))
  if (idIndex === -1) {
    throw new Error('CSV 缺少"噜咪ID"列')
  }

  const result = {}
  let count = 0

  // 解析数据行
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === 0 || !values[idIndex]) continue

    const lumiId = values[idIndex].trim()
    if (!lumiId || lumiId === 'ID') continue

    result[lumiId] = {
      bodyType: values[idIndex + 1]?.trim() || '',
      activeMap: values[idIndex + 2]?.trim() || '',
      keyTraits: values[idIndex + 3]?.trim() || '',
      behavior: values[idIndex + 4]?.trim() || '',
      updatedAt: new Date().toISOString().split('T')[0]
    }
    count++
  }

  return { data: result, count }
}

// 解析 CSV 行（处理引号包裹的字段）
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())

  return result
}

try {
  const { data, count } = parseCSV(csvContent)

  console.log(`✓ 解析成功，共 ${count} 条数据`)
  console.log('')

  // 确保 public/data 目录存在
  const dataDir = path.join(__dirname, 'public/data')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  // 写入 JSON 文件
  console.log('💾 正在写入 extra.json...')
  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(data, null, 2),
    'utf-8'
  )

  console.log('✅ 同步完成！')
  console.log('')
  console.log('📊 同步统计：')
  console.log(`   - 处理条目：${count} 条`)
  console.log(`   - 输出文件：${OUTPUT_FILE}`)
  console.log('')
  console.log('💡 提示：')
  console.log('   - 刷新浏览器查看更新效果')
  console.log('   - 如需回滚，请备份 extra.json 文件')
  console.log('')

} catch (error) {
  console.error('❌ 同步失败：', error.message)
  console.error(error.stack)
  process.exit(1)
}
