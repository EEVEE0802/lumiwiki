// 路由配置
import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'Home', component: () => import('../views/Home.vue') },
  { path: '/lumi', name: 'LumiList', component: () => import('../views/LumiList.vue') },
  { path: '/lumi/:id', name: 'LumiDetail', component: () => import('../views/LumiDetail.vue') },
  { path: '/skill', name: 'SkillList', component: () => import('../views/SkillList.vue') },
  { path: '/battle-buff', name: 'BattleBuffList', component: () => import('../views/BattleBuffList.vue') },
  { path: '/item', name: 'ItemList', component: () => import('../views/ItemList.vue') },
  { path: '/type-chart', name: 'TypeChart', component: () => import('../views/TypeChart.vue') },
  { path: '/damage-calculator', name: 'DamageCalculator', component: () => import('../views/DamageCalculator.vue') },
  { path: '/online-data', name: 'OnlineData', component: () => import('../views/OnlineData.vue') },
  { path: '/adventure-drop', name: 'AdventureDrop', component: () => import('../views/AdventureDrop.vue') },
  { path: '/egg-drop', name: 'EggDrop', component: () => import('../views/EggDrop.vue') },
  { path: '/robot-team', name: 'RobotTeam', component: () => import('../views/RobotTeam.vue') },
  { path: '/star-exchange', name: 'StarExchange', component: () => import('../views/StarExchange.vue') },
  { path: '/claude-code-guide', name: 'ClaudeCodeGuide', component: () => import('../views/ClaudeCodeGuide.vue') },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
