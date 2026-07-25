import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@ultigrid/core': new URL('./src/core/index.ts', import.meta.url).pathname,
      '@ultigrid/insight': new URL('./src/bi/index.ts', import.meta.url).pathname,
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  test: {
    exclude: ['tests/e2e/**', '**/node_modules/**', '**/dist/**'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
