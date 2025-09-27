import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: '/',                // ou '/main/' se quiser /main/ em produção
  plugins: [react()],
  resolve: {
    alias: {
      '@apps/state': path.resolve(__dirname, '../packages/state'),
      '@apps/lib':   path.resolve(__dirname, '../packages/lib'),
      '@apps/ui':    path.resolve(__dirname, '../packages/ui'),
      '@apps/journal-state': path.resolve(__dirname, '../packages/journal-state/src'),
      '@apps/utils': path.resolve(__dirname, '../packages/utils'),
      '@apps': path.resolve(__dirname, 'packages'),
    }
  },
  server: {
    port: 5174
  }
})
