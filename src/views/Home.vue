<script setup>
import { ref, onMounted } from 'vue'
import { loadData, t, TYPE_NAMES, TYPE_COLORS } from '../data'

const stats = ref({})
const loading = ref(true)
const exporting = ref(false)

onMounted(async () => {
  const lumis = await loadData('Lumi')
  const skills = await loadData('ActiveSkill')
  const items = await loadData('Item')
  const types = await loadData('LumiTypeCounter')

  // 统计属性分布
  const typeDist = {}
  lumis.forEach(l => {
    const t1 = TYPE_NAMES[l.Type1] || '未知'
    typeDist[t1] = (typeDist[t1] || 0) + 1
  })

  stats.value = {
    lumiCount: lumis.length,
    skillCount: skills.length,
    itemCount: items.length,
    typeCount: types.length,
    typeDist,
  }
  loading.value = false
})

// 导出所有推荐阵容为 CSV
async function exportRecommendTeams() {
  if (exporting.value) return
  exporting.value = true
  try {
    const data = await loadData('lumi-teams')
    if (!data || !data.lumiTeams) {
      alert('暂无推荐配队数据')
      return
    }

    const header = ['内部ID', '阵容序号', '一号位噜咪ID', '一号位技能ID', '二号位噜咪ID', '二号位技能ID', '三号位噜咪ID', '三号位技能ID']
    const rows = []
    const sortedIds = Object.keys(data.lumiTeams).sort((a, b) => Number(a) - Number(b))
    for (const lumiId of sortedIds) {
      data.lumiTeams[lumiId].forEach((team, idx) => {
        const row = [lumiId, idx + 1]
        for (let i = 0; i < 3; i++) {
          const l = team.lumis[i]
          if (l) {
            row.push(l.lumiId, l.topSkill?.skillId ?? '')
          } else {
            row.push('', '')
          }
        }
        rows.push(row)
      })
    }

    const escape = v => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [header.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recommend-teams-week${data.week}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('导出失败:', e)
    alert('导出失败: ' + e.message)
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div v-if="loading" class="loading">加载中...</div>
  <div v-else>
    <!-- 头部横幅 -->
    <div class="hero">
      <h1>🌟 LumiWiki</h1>
      <p class="hero-desc">噜咪（Lumi）图鉴百科 · 本地局域网 Wiki</p>
    </div>

    <!-- 数据导出工具 -->
    <div class="export-toolbar">
      <button class="export-btn" :disabled="exporting" @click="exportRecommendTeams">
        {{ exporting ? '⏳ 导出中...' : '📥 导出所有推荐阵容（CSV）' }}
      </button>
    </div>

    <!-- 数据统计卡片 -->
    <div class="grid grid-4 stat-cards">
      <router-link to="/lumi" class="card stat-card">
        <div class="stat-num">{{ stats.lumiCount }}</div>
        <div class="stat-label">噜咪总数</div>
      </router-link>
      <router-link to="/skill" class="card stat-card">
        <div class="stat-num">{{ stats.skillCount }}</div>
        <div class="stat-label">技能总数</div>
      </router-link>
      <router-link to="/item" class="card stat-card">
        <div class="stat-num">{{ stats.itemCount }}</div>
        <div class="stat-label">物品总数</div>
      </router-link>
      <router-link to="/type-chart" class="card stat-card">
        <div class="stat-num">{{ stats.typeCount }}</div>
        <div class="stat-label">属性种类</div>
      </router-link>
    </div>

    <!-- 属性分布 -->
    <div class="section">
      <h2>属性分布</h2>
      <div class="type-bars">
        <div v-for="(count, name) in stats.typeDist" :key="name" class="type-bar-row">
          <span class="type-bar-label">{{ name }}</span>
          <div class="type-bar-track">
            <div
              class="type-bar-fill"
              :style="{
                width: (count / stats.lumiCount * 100 * 2) + '%',
              }"
            ></div>
          </div>
          <span class="type-bar-count">{{ count }}</span>
        </div>
      </div>
    </div>

    <!-- 快速入口 -->
    <div class="section">
      <h2>快速导航</h2>
      <div class="grid grid-4">
        <router-link to="/lumi" class="card nav-card">
          <div class="nav-card-icon">🐾</div>
          <div class="nav-card-title">噜咪图鉴</div>
          <div class="nav-card-desc">浏览所有噜咪的属性、技能和进化信息</div>
        </router-link>
        <router-link to="/skill" class="card nav-card">
          <div class="nav-card-icon">⚡</div>
          <div class="nav-card-title">技能图鉴</div>
          <div class="nav-card-desc">查看所有主动技能和被动技能</div>
        </router-link>
        <router-link to="/battle-buff" class="card nav-card">
          <div class="nav-card-icon">✨</div>
          <div class="nav-card-title">Buff 图鉴</div>
          <div class="nav-card-desc">战斗中显示的所有状态效果</div>
        </router-link>
        <router-link to="/type-chart" class="card nav-card">
          <div class="nav-card-icon">🔥</div>
          <div class="nav-card-title">属性克制表</div>
          <div class="nav-card-desc">查看属性之间的克制关系</div>
        </router-link>
        <router-link to="/online-data" class="card nav-card">
          <div class="nav-card-icon">📊</div>
          <div class="nav-card-title">线上数据</div>
          <div class="nav-card-desc">天梯1v1出场率和胜率排行榜</div>
        </router-link>
        <router-link to="/claude-code-guide" class="card nav-card">
          <div class="nav-card-icon">🤖</div>
          <div class="nav-card-title">Claude Code 教程</div>
          <div class="nav-card-desc">AI 编程助手快速上手指南</div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero {
  text-align: center;
  padding: 40px 0 30px;
}
.hero h1 {
  font-size: 2.5em;
  color: #fff;
  margin-bottom: 8px;
}
.hero-desc {
  color: var(--text-dim);
  font-size: 1.1em;
}

/* 数据导出工具 */
.export-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 24px;
}
.export-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.95em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);
}
.export-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}
.export-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.stat-cards {
  margin-bottom: 32px;
}
.stat-card {
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}
.stat-card:hover { text-decoration: none; }
.stat-num {
  font-size: 2em;
  font-weight: 700;
  color: var(--accent);
}
.stat-label {
  color: var(--text-dim);
  margin-top: 4px;
}
.section {
  margin-bottom: 32px;
}
.section h2 {
  color: #fff;
  margin-bottom: 16px;
  font-size: 1.3em;
}
.type-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.type-bar-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.type-bar-label {
  width: 60px;
  text-align: right;
  font-size: 0.9em;
  color: var(--text-dim);
}
.type-bar-track {
  flex: 1;
  height: 20px;
  background: var(--bg-card);
  border-radius: 10px;
  overflow: hidden;
}
.type-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-light));
  border-radius: 10px;
  transition: width 0.5s ease;
}
.type-bar-count {
  width: 30px;
  font-size: 0.9em;
  color: var(--text-dim);
}
.nav-card {
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}
.nav-card:hover { text-decoration: none; }
.nav-card-icon {
  font-size: 2.5em;
  margin-bottom: 8px;
}
.nav-card-title {
  font-weight: 600;
  color: #fff;
  font-size: 1.1em;
  margin-bottom: 6px;
}
.nav-card-desc {
  color: var(--text-dim);
  font-size: 0.9em;
}
</style>
