import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ESM: __dirname doesn't exist, derive it from import.meta.url. Without this
// vitest couldn't load any test that transitively imported from
// @goldos/shared/* — the alias `resolve` calls were returning broken paths,
// silently failing 3 of 4 test files with ERR_MODULE_NOT_FOUND.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(here, 'src'),
      '@goldos/shared/schemas': resolve(here, '../shared/schemas.ts'),
      '@goldos/shared/constants': resolve(here, '../shared/constants.ts'),
      '@goldos/shared/types': resolve(here, '../shared/types.ts'),
      '@goldos/shared/defaults': resolve(here, '../shared/defaults.ts'),
      '@goldos/shared': resolve(here, '../shared/index.ts'),
    },
  },
});
