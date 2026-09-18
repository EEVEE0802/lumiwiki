import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0', // 局域网可访问
    port: 3005, // ⚠️⚠️⚠️ 固定端口：3005，绝对不能改！！！⚠️⚠️⚠️
    strictPort: true, // ⚠️ 端口被占用时报错，而不是自动换端口
    allowedHosts: ['.bilibili.local'], // 允许 *.bilibili.local 内网域名访问（子域通配）
  },
  build: {
    rollupOptions: {
      output: {
        // 长期缓存策略：把不常变的第三方库拆出来，业务代码变更时它们的 hash 不失效
        // - vendor: Vue 生态（几乎不变）
        // - chart: chart.js 只有 OnlineData 用，独立成 chunk 让其他页面不加载（-60KB gzip）
        // rolldown（Vite 8+）要求 manualChunks 用函数形式而非对象
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('chart.js')) return 'chart'
            if (id.includes('vue') || id.includes('@vue')) return 'vendor'
          }
        },
      },
    },
  },
})
