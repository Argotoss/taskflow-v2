import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = dirname(fileURLToPath(import.meta.url));
const resolveFromRoot = (relativePath: string): string => resolve(rootDir, relativePath);

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts'
    ]
  },
  resolve: {
    alias: {
      '@taskflow/config': resolveFromRoot('../../packages/config/src/index.ts'),
      '@taskflow/db': resolveFromRoot('../../packages/db/src/index.ts'),
      '@taskflow/types': resolveFromRoot('../../packages/types/src/index.ts')
    }
  }
});
