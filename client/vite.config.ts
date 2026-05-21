import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, 'src') },
      { find: /^@goldos\/shared\/schemas$/, replacement: resolve(__dirname, '../shared/schemas.ts') },
      { find: /^@goldos\/shared\/constants$/, replacement: resolve(__dirname, '../shared/constants.ts') },
      { find: /^@goldos\/shared\/types$/, replacement: resolve(__dirname, '../shared/types.ts') },
      { find: /^@goldos\/shared\/bill-math$/, replacement: resolve(__dirname, '../shared/bill-math.ts') },
      { find: /^@goldos\/shared$/, replacement: resolve(__dirname, '../shared/index.ts') },
    ],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
