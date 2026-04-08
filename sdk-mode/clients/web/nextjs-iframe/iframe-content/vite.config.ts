import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { avatarkitVitePlugin } from '@spatialwalk/avatarkit/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    avatarkitVitePlugin(),
  ],
  root: __dirname,
  server: {
    port: 5178,
    open: false,
    cors: true,
  },
  resolve: {
    alias: {
      '@': __dirname + '/src',
    },
  },
  build: {
    outDir: 'dist',
  },
})
