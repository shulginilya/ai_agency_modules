import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [react(), dts({ include: ['src'], rollupTypes: true })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AiModulesCore',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    // Never bundle React into a library build - it must come from the host.
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: { globals: { react: 'React', 'react-dom': 'ReactDOM' } },
    },
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
