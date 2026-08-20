<script setup>
import { ref, computed } from 'vue'
import { useAuth } from '../composables/useAuth'
import { apiFetch } from '../data/api'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'success'])

const { register, login } = useAuth()

// mode: 'login' 已注册直接进 | 'register' 首次填职能
const mode = ref('login')
const username = ref('')
const role = ref('')
const availableRoles = ref([])
const loading = ref(false)
const errorMsg = ref('')

apiFetch('/api/auth/roles')
  .then(d => { availableRoles.value = d.roles })
  .catch(() => {})

function close() {
  emit('update:modelValue', false)
  errorMsg.value = ''
}

async function submit() {
  errorMsg.value = ''
  const u = username.value.trim()
  if (!u) { errorMsg.value = '请输入用户名'; return }
  if (mode.value === 'register' && !role.value) { errorMsg.value = '请选择职能'; return }
  loading.value = true
  try {
    if (mode.value === 'login') {
      try {
        await login(u)
      } catch (e) {
        // 用户不存在 -> 自动切到注册
        if (e.status === 404) {
          mode.value = 'register'
          errorMsg.value = '用户不存在, 请补充职能完成首次登录'
          loading.value = false
          return
        }
        throw e
      }
    } else {
      await register(u, role.value)
    }
    emit('success')
    close()
  } catch (e) {
    errorMsg.value = e.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div v-if="modelValue" class="login-mask" @click.self="close">
    <div class="login-modal">
      <div class="login-header">
        <h3>{{ mode === 'register' ? '首次登录' : '登录 LumiWiki' }}</h3>
        <button class="login-close" @click="close">✕</button>
      </div>

      <div class="login-body">
        <div class="login-hint">
          内网信任模型, 无需密码, 用户名即身份。<br>
          首次登录会提示选择职能; 已注册的下次只需填用户名。
        </div>

        <label class="login-field">
          <span>用户名</span>
          <input v-model="username" placeholder="例如 EEVEE" maxlength="32" @keyup.enter="submit" autofocus />
        </label>

        <label v-if="mode === 'register'" class="login-field">
          <span>职能</span>
          <select v-model="role">
            <option value="" disabled>请选择你的职能</option>
            <option v-for="r in availableRoles" :key="r" :value="r">{{ r }}</option>
          </select>
        </label>

        <div v-if="errorMsg" class="login-error">⚠️ {{ errorMsg }}</div>

        <button class="login-submit" :disabled="loading" @click="submit">
          {{ loading ? '处理中...' : (mode === 'register' ? '完成注册' : '登录') }}
        </button>

        <div class="login-switch">
          <button v-if="mode === 'login'" class="login-link" @click="mode = 'register'">
            我是新用户, 需要注册
          </button>
          <button v-else class="login-link" @click="mode = 'login'; errorMsg = ''">
            返回登录
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.login-modal {
  background: #1a1a2e;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 12px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 10px 40px rgba(0,0,0,0.5);
}
.login-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.login-header h3 {
  margin: 0;
  color: #fff;
  font-size: 1.1em;
}
.login-close {
  background: none;
  border: none;
  color: #999;
  font-size: 1.2em;
  cursor: pointer;
  padding: 4px 8px;
}
.login-close:hover { color: #e94560; }
.login-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.login-hint {
  color: #aaa;
  font-size: 0.85em;
  line-height: 1.6;
  padding: 10px 12px;
  background: rgba(255,255,255,0.04);
  border-radius: 6px;
}
.login-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.login-field span {
  font-size: 0.85em;
  color: #ccc;
  font-weight: 600;
}
.login-field input, .login-field select {
  background: #16213e;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 8px 12px;
  color: #eee;
  outline: none;
  font-size: 0.95em;
}
.login-field input:focus, .login-field select:focus {
  border-color: #e94560;
}
.login-error {
  color: #ff8b95;
  font-size: 0.85em;
  padding: 8px 12px;
  background: rgba(220,53,69,0.15);
  border-radius: 6px;
}
.login-submit {
  background: linear-gradient(135deg, #a493e0 0%, #764ba2 100%);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 10px 16px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95em;
}
.login-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.login-switch {
  text-align: center;
}
.login-link {
  background: none;
  border: none;
  color: #a493e0;
  cursor: pointer;
  font-size: 0.85em;
  text-decoration: underline;
}
</style>
