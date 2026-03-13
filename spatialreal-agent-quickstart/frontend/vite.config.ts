import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { avatarkitVitePlugin } from '@spatialwalk/avatarkit/vite'

export default defineConfig({
  plugins: [react(), tailwindcss(), avatarkitVitePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
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
