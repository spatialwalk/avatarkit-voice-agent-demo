import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { avatarkitVitePlugin } from '@spatialwalk/avatarkit/vite'

export default defineConfig({
  plugins: [react(), avatarkitVitePlugin()],
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://localhost:8100',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
