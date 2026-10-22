/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, `npm run dev:server` runs the room server on port 8787.
const server = 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
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
