import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { avatarkitVitePlugin } from '@spatialwalk/avatarkit/vite'

import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
    avatarkitVitePlugin(),
  ],
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
