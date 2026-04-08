import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { avatarkitVitePlugin } from '@spatialwalk/avatarkit/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    vue(),
    avatarkitVitePlugin(),
  ],
  root: __dirname,
  server: {
    port: 5174,
    open: true,
  },
  resolve: {
    alias: {
      '@': __dirname + '/src',
    },
  },
})
