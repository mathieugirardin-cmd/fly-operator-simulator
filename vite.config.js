import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? `/${(process.env.GITHUB_REPOSITORY || 'owner/fly-operator-simulator').split('/')[1]}/` : './',
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
  test: { include: ['src/tests/**/*.test.js'], environment: 'node' },
});
