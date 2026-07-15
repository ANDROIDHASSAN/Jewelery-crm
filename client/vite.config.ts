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
      { find: /^@goldos\/shared\/metal-rate$/, replacement: resolve(__dirname, '../shared/metal-rate.ts') },
      { find: /^@goldos\/shared\/defaults$/, replacement: resolve(__dirname, '../shared/defaults.ts') },
      { find: /^@goldos\/shared\/sale$/, replacement: resolve(__dirname, '../shared/sale.ts') },
      { find: /^@goldos\/shared\/slug$/, replacement: resolve(__dirname, '../shared/slug.ts') },
      { find: /^@goldos\/shared$/, replacement: resolve(__dirname, '../shared/index.ts') },
    ],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        // Default to the local server (port 4000) so admin development hits
        // the in-tree backend with the latest schema + routes. To preview the
        // storefront against the deployed API instead (so you don't have to
        // boot the local server for catalog browsing), set
        // API_PROXY_TARGET=https://jewelery-crm.vercel.app when starting Vite.
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
