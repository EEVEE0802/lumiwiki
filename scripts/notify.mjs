import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadConfig() {
  const configPath = path.join(__dirname, 'ta-config.json')
  if (!fs.existsSync(configPath)) {
    throw new Error('ta-config.json 不存在，请复制 ta-config.example.json 为 ta-config.json 并填入配置')
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
}

const LEVEL_EMOJI = {
  success: '✅',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌'
}

// 根据 Webhook URL 判断平台，构造对应的消息体
function buildPayload(webhook, content) {
  if (webhook.includes('qyapi.weixin.qq.com')) {
    // 企业微信
    return { msgtype: 'text', text: { content } }
  }
  // 飞书（默认）
  return { msg_type: 'text', content: { text: content } }
}

// 判断推送是否成功（不同平台字段不同）
function isPushSuccess(webhook, data) {
  if (webhook.includes('qyapi.weixin.qq.com')) {
    return data.errcode === 0
  }
  // 飞书：StatusCode 或 code 为 0 表示成功
  return data.StatusCode === 0 || data.code === 0
}

export async function notify(message, level = 'info') {
  const config = loadConfig()
  const webhook = config.notifyWebhook

  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const emoji = LEVEL_EMOJI[level] || 'ℹ️'
  const content = `${emoji} LumiWiki 自动更新\n${timestamp}\n\n${message}`

  console.log(`[notify:${level}] ${message}`)

  if (!webhook) {
    console.log('[notify] 未配置 notifyWebhook，仅控制台输出')
    return
  }

  try {
    const resp = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(webhook, content))
    })
    const data = await resp.json()
    if (!isPushSuccess(webhook, data)) {
      console.error('[notify] 推送返回错误:', data)
    }
  } catch (e) {
    console.error('[notify] 推送失败:', e.message)
  }
}
