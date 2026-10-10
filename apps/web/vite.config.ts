import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(fileURLToPath(import.meta.url))
export default defineConfig({ root, plugins: [react()], build: { outDir: resolve(root, '../../dist/web') } })