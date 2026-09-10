import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The playground consumes the packages from source so edits hot-reload without
// a rebuild. A real host app installs the published packages instead.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ai-modules/core': resolve(__dirname, '../packages/core/src'),
      '@ai-modules/chat': resolve(__dirname, '../packages/module-chat/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
