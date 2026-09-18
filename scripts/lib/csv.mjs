// scripts/lib/csv.mjs
// CSV 解析工具，跨多个 process/backfill/fetch 脚本共享
//
// 提供：
//   - parseCSVLine(line): 手写 CSV 行解析（支持双引号转义、字段内逗号）
//   - processCSVStream(paths, processor): 流式读取多个 CSV，共用同一批表头，每行调用 processor(obj)

import fs from 'fs'
import readline from 'readline'

/**
 * 解析单行 CSV，返回字段数组
 * 支持：
 *  - 双引号包裹的字段（内含逗号）
 *  - 双引号转义（"" -> "）
 * 不处理跨行字段（数数导出的 CSV 每行都是完整记录）
 */
export function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === '"') {
      if (i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i += 2
      } else {
        inQuotes = !inQuotes
        i++
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
      i++
    } else {
      current += ch
      i++
    }
  }
  result.push(current)
  return result
}

/**
 * 流式读取一组 CSV 文件，每行按第一份文件的表头解析成对象后传给 processor
 *
 * 特点：
 * - 多个文件共用同一批表头（第一份文件的表头），要求各文件表头结构一致
 * - 跳过不存在的文件（daily 分片缺失时静默）
 * - 表头首字符 BOM 会被剥离
 *
 * @param {string | string[]} pathOrPaths - 单个路径或路径数组
 * @param {(row: object, absoluteRowIndex: number) => void | Promise<void>} processor
 * @returns {Promise<{ headers: string[], totalRows: number }>}
 */
export async function processCSVStream(pathOrPaths, processor) {
  const paths = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths]
  let totalRows = 0
  let headers = []

  for (const filePath of paths) {
    if (!fs.existsSync(filePath)) continue
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    })

    let fileRowIndex = 0
    for await (const line of rl) {
      if (fileRowIndex === 0) {
        // 每个文件都有表头，只留第一次的
        if (headers.length === 0) {
          headers = parseCSVLine(line).map(h => h.replace(/^﻿/, '').trim())
        }
      } else {
        const values = parseCSVLine(line)
        const obj = {}
        headers.forEach((header, idx) => {
          obj[header] = values[idx]
        })
        await processor(obj, totalRows + fileRowIndex)
      }
      fileRowIndex++
    }
    totalRows += Math.max(0, fileRowIndex - 1)
  }

  return { headers, totalRows }
}
