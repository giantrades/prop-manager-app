import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@apps/state': path.resolve(__dirname, '../packages/state'),
      '@apps/lib':   path.resolve(__dirname, '../packages/lib'),
      '@apps/ui':    path.resolve(__dirname, '../packages/ui'),
      '@apps/journal-state': path.resolve(__dirname, '../packages/journal-state/src'),
      '@apps/utils': path.resolve(__dirname, '../packages/utils'),
      '@apps/auth':  path.resolve(__dirname, '../packages/auth'),
      '@apps/sync':  path.resolve(__dirname, '../packages/sync'),
      '@apps/supabase': path.resolve(__dirname, '../packages/supabase'),
    }
  },
  server: {
    port: 5174
  },
  build: {
    // UX foundation: code-split — vendor/charts separados do chunk inicial.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          icons: ['lucide-react'],
        },
      },
    },
  },
})
