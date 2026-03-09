import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { avatarkitVitePlugin } from '@spatialwalk/avatarkit/vite'

export default defineConfig({
  plugins: [vue(), avatarkitVitePlugin()],
  server: {
    port: 3000,
    proxy: {
      '/token': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
