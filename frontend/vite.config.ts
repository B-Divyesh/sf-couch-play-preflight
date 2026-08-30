import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  publicDir: resolve(__dirname, 'public'),
  define: {
    __BUILD_SHA__: JSON.stringify(process.env.BUILD_SHA || process.env.GIT_SHA || process.env.SOURCE_COMMIT || 'development'),
  },
  build: {
    outDir: resolve(__dirname, '../dist'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    proxy: { '/api': 'http://localhost:8080', '/health': 'http://localhost:8080' },
  },
  test: {
    include: [resolve(__dirname, 'src/**/*.test.ts')],
  },
});
