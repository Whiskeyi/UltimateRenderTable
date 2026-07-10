import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ultigrid/core': new URL('../../src/core/index.ts', import.meta.url).pathname,
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: new URL('./dist', import.meta.url).pathname,
    emptyOutDir: true,
    lib: {
      entry: new URL('./entry.ts', import.meta.url).pathname,
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'style',
    },
    rollupOptions: {
      external: [
        '@ultigrid/core',
        'react',
        'react/jsx-runtime',
        'html-to-image',
        'lucide-react',
        'write-excel-file',
        'write-excel-file/universal',
      ],
    },
  },
})
