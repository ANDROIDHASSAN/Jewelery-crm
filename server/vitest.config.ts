import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@goldos/shared': resolve(__dirname, '../shared/index.ts'),
      '@goldos/shared/schemas': resolve(__dirname, '../shared/schemas.ts'),
      '@goldos/shared/constants': resolve(__dirname, '../shared/constants.ts'),
      '@goldos/shared/types': resolve(__dirname, '../shared/types.ts'),
    },
  },
});
