import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/lib/db/__tests__/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@apps/lib': path.resolve(__dirname, 'packages/lib'),
    },
  },
});
