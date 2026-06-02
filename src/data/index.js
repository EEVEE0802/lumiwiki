// 全局数据加载与工具函数
import { ref } from 'vue'

const cache = {}

// 获取当前语言
function getCurrentLanguage() {
  return localStorage.getItem('lumiwiki-lang') || 'zh-CN'
}

// 通用数据加载器（带缓存）
async function loadData(name) {
  // 如果请求的是 localization，使用当前语言
  const dataName = name === 'localization' ? getCurrentLanguage() : name
  const cacheKey = `${getCurrentLanguage()}_${name}`
  if (cache[cacheKey]) return cache[cacheKey]

  // 先尝试加载加密版本 (.encoded)
  let data
  try {
    const encodedResp = await fetch(`/data/${dataName}.json.encoded`)
    if (encodedResp.ok) {
      const encoded = await encodedResp.text()
      // 解密：Base64 解码 → Gzip 解压 → JSON 解析
      const compressed = atob(encoded)
      const jsonString = await decompress(compressed)
      data = JSON.parse(jsonString)
    } else {
      throw new Error('Encoded version not found')
    }
  } catch {
    // 加密版本不存在或失败，加载原始 JSON
    const resp = await fetch(`/data/${dataName}.json`)
    data = await resp.json()
  }

  cache[cacheKey] = data
  return data
}

/**
 * 解压缩数据（使用浏览器原生 Compression API）
 */
async function decompress(compressedData) {
  // 将 Base64 解码后的字节数组转换为 Uint8Array
  const charCodes = compressedData.split('').map(c => c.charCodeAt(0))
  const uint8Array = new Uint8Array(charCodes)

  // 使用 Compression Stream API 解压
  const stream = new Response(uint8Array).body
    .pipeThrough(new DecompressionStream('gzip'))

  const decompressedArray = await streamToArrayBuffer(stream)
  const textDecoder = new TextDecoder()
  return textDecoder.decode(decompressedArray)
}

/**
 * 将 Stream 转换为 ArrayBuffer
 */
function streamToArrayBuffer(stream) {
  return new Response(stream).arrayBuffer()
}

// 属性名称映射
const TYPE_NAMES = {
  1: '无属性', 2: '水', 3: '火', 4: '草', 5: '电',
  6: '土', 7: '飞', 8: '冰', 9: '龙', 10: '光',
  11: '暗', 12: '格斗', 13: '超能', 14: '精灵', 15: '钢',
  16: '王', 17: '神',
}

// 属性对应颜色
const TYPE_COLORS = {
  1: '#A8A878', 2: '#6890F0', 3: '#F08030', 4: '#78C850', 5: '#F8D030',
  6: '#C0A060', 7: '#A890F0', 8: '#98D8D8', 9: '#7038F8', 10: '#FFD700',
  11: '#705848', 12: '#C03028', 13: '#F85888', 14: '#EE99AC', 15: '#B8B8D0',
  16: '#FF6347', 17: '#E0C050',
}

// 稀有度名称
const RARITY_MAP = { 1: '普通', 2: '稀有', 3: '史诗', 4: '传说', 5: '神话' }
const RARITY_COLORS = { 1: '#9e9e9e', 2: '#4caf50', 3: '#2196f3', 4: '#ff9800', 5: '#e91e63' }

// 赛季名称映射（来自 Table.LumiTag 枚举）
const LUMI_TAG_NAMES = { 0: '未投放', 1: '主线', 2: 'S1', 3: 'S2', 4: 'S3', 5: 'S4' }

// 打工能力类型映射（Luban 枚举 WorkType）
const WORK_TYPE_NAMES = {
  0: '无', 1: '手工', 2: '伐木', 3: '种植', 4: '祈愿',
  5: '生火', 6: '探险', 7: '牧场', 8: '发电', 9: '采矿',
  10: '制冷', 11: '种苹果', 12: '养鱼', 13: '牧场2', 14: '产花蜜',
  15: '水产养殖',
}

// 多语言映射
let locMap = null
let currentLanguage = null

async function getLoc() {
  const lang = getCurrentLanguage()
  console.log('[i18n] Loading language:', lang, 'current cached:', currentLanguage)

  // 如果语言没变，返回缓存
  if (locMap && currentLanguage === lang) {
    console.log('[i18n] Using cached data for:', lang)
    return locMap
  }

  // 加载对应语言文件
  console.log('[i18n] Fetching data for:', lang)
  const data = await loadData(lang)
  locMap = data
  currentLanguage = lang
  console.log('[i18n] Loaded data keys:', Object.keys(data).slice(0, 5), '...')
  return locMap
}

// 清除语言缓存（用于切换语言时）
export function clearLanguageCache() {
  locMap = null
  currentLanguage = null
  // 清除所有缓存
  for (const key in cache) {
    delete cache[key]
  }
}

// 获取本地化名称，找不到则返回 key 本身
export async function t(key) {
  const loc = await getLoc()
  return loc[key] || key || '???'
}

// 同步版本（需确保已加载过）
export function tSync(key) {
  return locMap?.[key] || key || '???'
}

// 关键字释义映射
let keywordMap = null

async function getKeywordMap() {
  if (keywordMap) return keywordMap
  const data = await loadData('BattleKeywordDes')
  keywordMap = data
  return keywordMap
}

// 同步版本（需确保已加载过）
function keywordSync(id) {
  return keywordMap?.find(k => k.Id === id) || null
}

export {
  loadData, TYPE_NAMES, TYPE_COLORS, RARITY_MAP, RARITY_COLORS,
  WORK_TYPE_NAMES, LUMI_TAG_NAMES, getKeywordMap, keywordSync,
}
