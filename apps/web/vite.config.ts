import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(fileURLToPath(import.meta.url))
const apiProxy = { target: 'http://localhost:4000', changeOrigin: true, rewrite: (path: string) => path.replace(/^\/api/, '') }
export default defineConfig({ root, plugins: [react()], server: { proxy: { '/api': apiProxy } }, preview: { proxy: { '/api': apiProxy } }, build: { outDir: resolve(root, '../../dist/web') } })