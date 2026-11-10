import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Both load native binaries from node_modules at runtime, so they must
      // not be bundled into main.cjs.
      external: ['@anthropic-ai/claude-agent-sdk', 'node-pty'],
    },
  },
});
