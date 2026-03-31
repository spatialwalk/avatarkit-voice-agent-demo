import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { avatarkitVitePlugin } from '@spatialwalk/avatarkit/vite'

export default defineConfig({
  plugins: [react(), avatarkitVitePlugin()],
  server: {
    port: 3003,
    proxy: {
      '/token': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
})
