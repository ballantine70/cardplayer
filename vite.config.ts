/// <reference types="vitest/config" />
import { cpSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// In development, `npm run dev:server` runs the room server on port 8787.
const server = 'http://localhost:8787';

/** Make pdf.js's fonts, character maps and decoders available under /pdfjs/. */
function pdfjsAssets(): Plugin {
  return {
    name: 'pdfjs-assets',
    buildStart() {
      for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
        cpSync(`node_modules/pdfjs-dist/${dir}`, `public/pdfjs/${dir}`, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  server: {
    proxy: {
      '/api': server,
      '/login': server,
      '/ws': { target: server, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
