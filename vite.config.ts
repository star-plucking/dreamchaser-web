import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  // 如果仓库名是 dreamchaser-web，base 应该是 '/dreamchaser-web/'
  // 如果部署到自定义域名，base 应该是 '/'
  base: process.env.NODE_ENV === 'production' ? '/dreamchaser-web/' : '/',
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
