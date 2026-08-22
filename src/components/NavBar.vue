<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLanguage } from '../composables/useLanguage'
import { useVersion } from '../composables/useVersion'
import { useAuth } from '../composables/useAuth'
import LoginModal from './LoginModal.vue'

const router = useRouter()
const mobileMenuOpen = ref(false)
const langMenuOpen = ref(false)
const userMenuOpen = ref(false)
const loginModalOpen = ref(false)

const { isInternal } = useVersion()
const { currentUser, isAdmin, logout } = useAuth()

// 导航链接
const navLinks = [
  { path: '/', label: '首页' },
  { path: '/lumi', label: '噜咪图鉴' },
  { path: '/skill', label: '技能图鉴' },
  { path: '/item', label: '物品图鉴' },
  { path: '/type-chart', label: '属性克制表' },
  { path: '/damage-calculator', label: '伤害计算器' },
  { path: '/online-data', label: '线上数据' },
  { path: '/adventure-drop', label: '冒险掉落' },
  { path: '/battle-buff', label: '✨ Buff 图鉴' },
  { path: '/robot-team', label: '🤖 机器人阵容' },
  { path: '/star-exchange', label: '🌟 归星预览' },
  { path: '/work-report', label: '📋 工作记录' },
  { path: '/claude-code-guide', label: '🤖 Claude 教程' },
]

// 语言切换
const { currentLang, languages, setLanguage } = useLanguage()
</script>

<template>
  <nav class="navbar">
    <div class="nav-brand" @click="router.push('/')">
      <span class="brand-icon">🌟</span>
      <span class="brand-text">LumiWiki</span>
      <span v-if="isInternal" class="internal-badge" title="当前为对内开发分支数据">🔒 对内</span>
    </div>

    <button class="mobile-toggle" @click="mobileMenuOpen = !mobileMenuOpen">
      {{ mobileMenuOpen ? '✕' : '☰' }}
    </button>

    <div class="nav-links" :class="{ open: mobileMenuOpen }">
      <router-link
        v-for="link in navLinks"
        :key="link.path"
        :to="link.path"
        class="nav-link"
        @click="mobileMenuOpen = false"
      >
        {{ link.label }}
      </router-link>
    </div>

    <div class="nav-right">
      <!-- 语言切换器 -->
      <div class="lang-switcher">
        <button class="lang-button" @click="langMenuOpen = !langMenuOpen">
          <span class="lang-flag">{{ languages[currentLang]?.flag }}</span>
          <span class="lang-name">{{ languages[currentLang]?.name }}</span>
          <span class="lang-arrow">▼</span>
        </button>
        <div class="lang-menu" :class="{ open: langMenuOpen }">
          <button
            v-for="(config, code) in languages"
            :key="code"
            class="lang-option"
            :class="{ active: code === currentLang }"
            @click="setLanguage(code); langMenuOpen = false"
          >
            <span class="lang-flag">{{ config.flag }}</span>
            <span class="lang-name">{{ config.name }}</span>
            <span v-if="code === currentLang" class="lang-check">✓</span>
          </button>
        </div>
      </div>

      <!-- 登录 / 用户菜单 -->
      <div v-if="!currentUser" class="user-area">
        <button class="login-btn" @click="loginModalOpen = true">🔑 登录</button>
      </div>
      <div v-else class="user-area">
        <button class="user-button" @click="userMenuOpen = !userMenuOpen">
          <span class="user-avatar">{{ isAdmin ? '👑' : '👤' }}</span>
          <span class="user-name">{{ currentUser.username }}</span>
          <span class="user-role">({{ currentUser.role }})</span>
          <span class="lang-arrow">▼</span>
        </button>
        <div class="user-menu" :class="{ open: userMenuOpen }">
          <div class="user-menu-info">
            <div>{{ currentUser.username }} · {{ currentUser.role }}</div>
            <div v-if="isAdmin" class="user-menu-tag">管理员</div>
          </div>
          <router-link
            v-if="isAdmin"
            to="/admin"
            class="user-menu-item"
            @click="userMenuOpen = false"
          >⚙️ 用户管理</router-link>
          <button class="user-menu-item" @click="logout(); userMenuOpen = false">🚪 退出登录</button>
        </div>
      </div>
    </div>
  </nav>

  <LoginModal v-model="loginModalOpen" />
</template>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 24px;
  height: 56px;
  background: #1a1a2e;
  border-bottom: 2px solid #e94560;
  flex-wrap: wrap;
}
.nav-brand {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  font-size: 1.2em;
  color: #e94560;
  white-space: nowrap;
}
.brand-icon { font-size: 1.4em; }
.internal-badge {
  background: linear-gradient(135deg, #f5576c 0%, #f093fb 100%);
  color: #fff;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 0.7em;
  font-weight: bold;
  margin-left: 4px;
  box-shadow: 0 2px 6px rgba(245, 87, 108, 0.4);
}
.nav-links {
  display: flex;
  gap: 4px;
  flex: 1;
}
.nav-link {
  color: #ccc;
  text-decoration: none;
  padding: 8px 14px;
  border-radius: 6px;
  transition: all 0.2s;
  font-size: 0.95em;
  white-space: nowrap;
}
.nav-link:hover, .nav-link.router-link-active {
  background: rgba(233, 69, 96, 0.15);
  color: #e94560;
}
.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 语言切换器 */
.lang-switcher {
  position: relative;
}
.lang-button {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #16213e;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 6px 12px;
  color: #eee;
  cursor: pointer;
  transition: all 0.2s;
}
.lang-button:hover {
  border-color: #e94560;
  background: rgba(233, 69, 96, 0.1);
}
.lang-flag {
  font-size: 1.1em;
}
.lang-name {
  font-size: 0.9em;
}
.lang-arrow {
  font-size: 0.7em;
  opacity: 0.6;
}
.lang-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  background: #16213e;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 8px;
  min-width: 180px;
  display: none;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  z-index: 100;
}
.lang-menu.open {
  display: flex;
}
.lang-option {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  color: #ccc;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}
.lang-option:hover {
  background: rgba(233, 69, 96, 0.15);
  color: #e94560;
}
.lang-option.active {
  background: rgba(233, 69, 96, 0.2);
  color: #e94560;
}
.lang-check {
  margin-left: auto;
  color: #e94560;
}

.mobile-toggle {
  display: none;
  background: none;
  border: none;
  color: #eee;
  font-size: 1.5em;
  cursor: pointer;
}

/* ==== 登录 / 用户菜单 ==== */
.user-area {
  position: relative;
}
.login-btn {
  background: linear-gradient(135deg, #a493e0 0%, #764ba2 100%);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9em;
}
.user-button {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #16213e;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 6px 12px;
  color: #eee;
  cursor: pointer;
  transition: all 0.2s;
}
.user-button:hover {
  border-color: #a493e0;
  background: rgba(164,147,224,0.1);
}
.user-avatar { font-size: 1.1em; }
.user-name { font-size: 0.9em; font-weight: 600; }
.user-role { font-size: 0.8em; color: #999; }

.user-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: #16213e;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 8px;
  min-width: 200px;
  display: none;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  z-index: 100;
}
.user-menu.open { display: flex; }
.user-menu-info {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  margin-bottom: 4px;
  color: #ccc;
  font-size: 0.85em;
}
.user-menu-tag {
  display: inline-block;
  margin-top: 4px;
  padding: 1px 8px;
  background: linear-gradient(135deg, #a493e0 0%, #764ba2 100%);
  color: #fff;
  border-radius: 8px;
  font-size: 0.7em;
  font-weight: 600;
}
.user-menu-item {
  display: block;
  background: none;
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  color: #ccc;
  cursor: pointer;
  text-align: left;
  text-decoration: none;
  font-size: 0.9em;
  transition: all 0.2s;
}
.user-menu-item:hover {
  background: rgba(164,147,224,0.15);
  color: #a493e0;
}
@media (max-width: 768px) {
  .navbar { padding: 0 12px; height: auto; min-height: 56px; }
  .mobile-toggle { display: block; }
  .nav-links {
    display: none;
    width: 100%;
    flex-direction: column;
    padding: 8px 0;
  }
  .nav-links.open { display: flex; }
  .nav-right {
    width: 100%;
    flex-wrap: wrap;
  }
}
</style>
