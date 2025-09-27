import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // build-time base (important for production)
  base: '/journal/',
  plugins: [react()],
  resolve: {
    alias: {
      '@apps/state': path.resolve(__dirname, '../packages/state'),
      '@apps/lib':   path.resolve(__dirname, '../packages/lib'),
      '@apps/journal-state': path.resolve(__dirname, '../packages/journal-state/src'),
      '@apps/ui':    path.resolve(__dirname, '../packages/ui'),
      '@apps/utils': path.resolve(__dirname, '../packages/utils'),
      '@apps': path.resolve(__dirname, 'packages')
    }
  },
  server: {
    port: 5173
  }
})
