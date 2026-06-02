import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0', // 局域网可访问
    port: 3005, // ⚠️⚠️⚠️ 固定端口：3005，绝对不能改！！！⚠️⚠️⚠️
    strictPort: true, // ⚠️ 端口被占用时报错，而不是自动换端口
  },
})
