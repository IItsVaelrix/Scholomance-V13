/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      drafts: {
        customMedia: true,
      },
    },
  },
  // Exclude Node.js-only packages from browser bundle
  optimizeDeps: {
    exclude: ['cmudict', 'better-sqlite3', 'bcrypt'],
  },
  build: {
    cssMinify: 'lightningcss',
    rollupOptions: {
      external: ['cmudict', 'better-sqlite3', 'bcrypt'],
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '^/auth/.*': { target: 'http://localhost:8080' },
      '^/collab/.*': { target: 'http://localhost:8080' },
      '/audio': 'http://localhost:8080',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    include: ['tests/**/*.{test,spec}.{js,jsx,ts,tsx}', '*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['**/tests/visual/**', '**/node_modules/**', 'tests/qa/e2e/**', 'tests/qa/immunity.*.test.js', 'debug_*.test.js', 'phoneme.accuracy.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**'],
      exclude: ['tests/**'],
    },
  },
})
