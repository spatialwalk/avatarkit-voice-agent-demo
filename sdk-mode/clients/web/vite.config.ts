import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { avatarkitVitePlugin } from '@spatialwalk/avatarkit/vite'

export default defineConfig({
  plugins: [react(), avatarkitVitePlugin()],
  server: {
    port: 3001,
    proxy: {
      '/session-token': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
      '/openai-api': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openai-api/, ''),
      },
    },
  },
})
