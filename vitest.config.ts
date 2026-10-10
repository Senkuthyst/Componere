import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { environment: 'node', include: ['src/tests/**/*.spec.ts', 'packages/**/*.spec.ts', 'apps/**/*.spec.ts'] } })