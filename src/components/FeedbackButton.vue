<template>
  <button
    class="feedback-btn"
    :class="{ cooling: cooldownLeft > 0, sent: justSent, failed: justFailed }"
    :disabled="cooldownLeft > 0 || loading"
    @click="handleClick"
    :title="tooltip"
  >
    <span v-if="loading">⏳ 发送中</span>
    <span v-else-if="justSent">✅ 已反馈</span>
    <span v-else-if="justFailed">❌ 失败,稍后再试</span>
    <span v-else-if="cooldownLeft > 0">⏱️ {{ cooldownLeft }}min</span>
    <span v-else>📢 反馈</span>
  </button>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

// 飞书 webhook（前端直调，URL 会公开在源码里）
const FEISHU_WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/f4018b93-265e-4d5b-b066-c0400c71c48f'
const STORAGE_KEY = 'lumiwiki_feedback_last'
const COOLDOWN_MS = 60 * 60 * 1000  // 1 小时冷却

const loading = ref(false)
const justSent = ref(false)
const justFailed = ref(false)
const cooldownLeft = ref(0)
let timer = null
let resetTimer = null

const tooltip = computed(() => {
  if (loading.value) return '正在发送...'
  if (justSent.value) return '反馈已发送，谢谢！'
  if (justFailed.value) return '发送失败，请稍后再试'
  if (cooldownLeft.value > 0) return `冷却中，还剩 ${cooldownLeft.value} 分钟`
  return '发现数据有误？点击反馈给维护者'
})

function updateCooldown() {
  const last = Number(localStorage.getItem(STORAGE_KEY) || 0)
  const elapsed = Date.now() - last
  cooldownLeft.value = elapsed < COOLDOWN_MS ? Math.ceil((COOLDOWN_MS - elapsed) / 60000) : 0
}

function resetStateAfter(ms) {
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    justSent.value = false
    justFailed.value = false
  }, ms)
}

async function handleClick() {
  if (cooldownLeft.value > 0 || loading.value) return

  loading.value = true
  justSent.value = false
  justFailed.value = false

  try {
    const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    const page = window.location.hash || '#/'
    const content = `📢 LumiWiki 数据反馈\n\n有访客反馈数据需要更新\n时间：${time}\n来源页面：${page}`

    const resp = await fetch(FEISHU_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'text',
        content: { text: content }
      })
    })
    const data = await resp.json()

    if (data.StatusCode === 0 || data.code === 0) {
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
      updateCooldown()
      justSent.value = true
      resetStateAfter(3000)
    } else {
      justFailed.value = true
      resetStateAfter(5000)
    }
  } catch (e) {
    justFailed.value = true
    resetStateAfter(5000)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  updateCooldown()
  timer = setInterval(updateCooldown, 30000)
})

onUnmounted(() => {
  clearInterval(timer)
  clearTimeout(resetTimer)
})
</script>

<style scoped>
.feedback-btn {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  padding: 10px 18px;
  background: #ff9800;
  color: white;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(255, 152, 0, 0.4);
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;
  min-width: 96px;
}
.feedback-btn:hover:not(:disabled) {
  background: #f57c00;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(255, 152, 0, 0.5);
}
.feedback-btn:disabled {
  cursor: not-allowed;
}
.feedback-btn.cooling {
  background: #9e9e9e;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.feedback-btn.sent {
  background: #4caf50;
}
.feedback-btn.failed {
  background: #f44336;
}
</style>
