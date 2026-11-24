import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

const target = 'http://127.0.0.1:8000'
const proxy = { '/api': { target }, '/ws': { target, ws: true } }

export default defineConfig({
  plugins: [react(), tailwind()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  build: { rollupOptions: { output: { manualChunks(id) {
    if (id.includes('node_modules') && /recharts|d3-|victory-vendor/.test(id)) return 'charts'
    if (id.includes('node_modules') && /framer-motion|motion-dom|motion-utils/.test(id)) return 'motion'
  } } } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
})
