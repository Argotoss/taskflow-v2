import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const resolvePackage = (relativePath: string): string => path.resolve(dirname, relativePath);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolvePackage('src'),
      '@taskflow/config': resolvePackage('../../packages/config/src/index.ts'),
      '@taskflow/db': resolvePackage('../../packages/db/src/index.ts'),
      '@taskflow/types': resolvePackage('../../packages/types/src/index.ts')
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
