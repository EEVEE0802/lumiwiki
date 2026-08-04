<script setup>
// 工作记录页 — 里程碑总结/汇报材料索引
// 新增记录：把 HTML 放到 public/reports/ 下，在 reports 数组里加一条

const reports = [
  {
    id: 'M4',
    title: '闪耀吧噜咪 · 噜咪生产小组 M4 里程碑总结',
    date: '2026-08-03',
    tag: 'M4',
    tagColor: '#b78dff',
    desc: 'M4 阶段噜咪生产工作复盘、数据回顾与 M5 规划',
    file: '/reports/M4-milestone.html'
  }
]

function openReport(file) {
  window.open(file, '_blank', 'noopener')
}
</script>

<template>
  <div class="page">
    <h1 class="page-title">📋 工作记录</h1>
    <p class="page-desc">里程碑总结与团队汇报材料。点击卡片在新标签页打开全屏演示。</p>

    <div class="report-grid">
      <div
        v-for="r in reports"
        :key="r.id"
        class="report-card"
        @click="openReport(r.file)"
      >
        <div class="report-tag" :style="{ background: r.tagColor }">{{ r.tag }}</div>
        <div class="report-body">
          <div class="report-title">{{ r.title }}</div>
          <div class="report-desc">{{ r.desc }}</div>
          <div class="report-meta">
            <span class="report-date">📅 {{ r.date }}</span>
            <span class="report-open">🎬 打开演示 →</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="reports.length === 0" class="empty-state">
      暂无工作记录
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
.page-title {
  color: #fff;
  font-size: 1.6em;
  margin-bottom: 8px;
}
.page-desc {
  color: var(--text-dim);
  margin-bottom: 24px;
}

.report-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}

.report-card {
  display: flex;
  gap: 16px;
  padding: 20px;
  background: linear-gradient(145deg, rgba(183,141,255,0.08), rgba(77,216,255,0.04));
  border: 1px solid rgba(183,141,255,0.25);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.25s;
  position: relative;
  overflow: hidden;
}
.report-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 100% 0%, rgba(255,110,199,0.15), transparent 50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.25s;
}
.report-card:hover {
  transform: translateY(-3px);
  border-color: rgba(183,141,255,0.5);
  box-shadow: 0 8px 30px rgba(183,141,255,0.2);
}
.report-card:hover::before {
  opacity: 1;
}

.report-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: 44px;
  border-radius: 10px;
  color: #fff;
  font-weight: bold;
  font-size: 1.1em;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.report-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.report-title {
  color: #fff;
  font-weight: bold;
  font-size: 1.05em;
  line-height: 1.4;
}

.report-desc {
  color: var(--text-dim);
  font-size: 0.9em;
  line-height: 1.5;
}

.report-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: 0.85em;
}
.report-date {
  color: var(--text-dim);
}
.report-open {
  color: #b78dff;
  font-weight: 600;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-dim);
}
</style>
