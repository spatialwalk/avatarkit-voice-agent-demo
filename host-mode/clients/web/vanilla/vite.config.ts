import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { defineConfig } from 'vite'
import { avatarkitVitePlugin } from '@spatialwalk/avatarkit/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    avatarkitVitePlugin(),
  ],
  root: __dirname,
  server: {
    port: 5175,
    open: true,
  },
  resolve: {
    alias: {
      '@': __dirname + '/src',
    },
  },
})
