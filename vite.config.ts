import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths let the static build be opened from any host or subfolder.
  base: './',
  // React, the router, Dexie and FSRS total ~170 KB gzipped — fine for a local study app.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
})
