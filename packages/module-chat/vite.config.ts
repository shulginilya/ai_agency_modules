import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [react(), dts({ include: ['src'], rollupTypes: true })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AiModulesChat',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
      cssFileName: 'ai-modules-chat',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', '@ai-modules/core'],
    },
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Tests run against core's source so they don't need a built dist/.
    alias: { '@ai-modules/core': resolve(__dirname, '../core/src') },
  },
});
