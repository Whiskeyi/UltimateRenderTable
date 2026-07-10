import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
      external: ['react', 'react/jsx-runtime'],
    },
  },
})
