import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.join(__dirname, 'ta-config.json')

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error('ta-config.json 不存在，请复制 ta-config.example.json 为 ta-config.json 并填入配置')
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

// 调用续期接口，返回最新 access_token（同时刷新 config.token 并落盘）
export async function ensureValidToken() {
  const config = loadConfig()

  if (!config.refreshToken) {
    throw new Error('ta-config.json 缺少 refreshToken，无法自动续期')
  }

  console.log('🔄 刷新 access_token...')
  const resp = await fetch(`${config.baseUrl}/v1/oauth/refreshForToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `refreshToken=${config.refreshToken}`
  })

  const data = await resp.json()
  if (data.return_code !== 0) {
    const msg = data.return_message || ''
    throw new Error(`刷新 token 失败: ${msg}\n如果 refresh_token 也过期了，需要重新登录数数平台，更新 ta-config.json 里的 token 和 refreshToken（从 localStorage 复制 ACCESS_TOKEN 和 REFRESH_TOKEN）`)
  }

  const { accessToken, expires } = data.data.oAuthLoginInfo
  const hoursLeft = Math.round((expires / 3600) * 10) / 10

  if (accessToken !== config.token) {
    config.token = accessToken
    saveConfig(config)
    console.log(`✓ access_token 已更新并落盘（剩余 ${hoursLeft} 小时）`)
  } else {
    console.log(`✓ access_token 仍有效（剩余 ${hoursLeft} 小时）`)
  }

  return accessToken
}
