import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { bridgeHub, localFiles } from './mcp/dev-server.mjs';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Claude Code's MCP servers reach the open app through this hub.
    bridgeHub(),
    // STRUDEL_FLOW_LOCAL (e.g. in .env.local): a folder served at /local/.
    localFiles(loadEnv(mode, process.cwd(), '').STRUDEL_FLOW_LOCAL ?? ''),
  ],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
      // @strudel/web bundles core and webaudio; packages that import them
      // directly (@strudel/soundfonts) must share that one copy, or their
      // sounds register where playback never looks.
      { find: /^@strudel\/(core|webaudio)$/, replacement: '@strudel/web' },
    ],
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    // @strudel/web's `main` is a browser IIFE; tests need its ESM build.
    alias: { '@strudel/web': '@strudel/web/dist/index.mjs' },
  },
}));
