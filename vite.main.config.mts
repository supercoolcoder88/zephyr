import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // ESM-only, and resolves its native CLI binary from node_modules at
      // runtime, so it must not be bundled into main.cjs.
      external: ['@anthropic-ai/claude-agent-sdk'],
    },
  },
});
