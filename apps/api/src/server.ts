import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(dir, '../../../')
try { process.loadEnvFile?.(resolve(root, '.env')) } catch {
  try { process.loadEnvFile?.(resolve(process.cwd(), '.env')) } catch {
    try { process.loadEnvFile?.() } catch {}
  }
}

import { createApp } from './app.js'
import { Store } from './store.js'

const port = Number(process.env.PORT ?? 4000)
const dbPath = process.env.DATABASE_FILE ?? ':memory:'
const store = new Store(dbPath)

const server = createApp(store).app.listen(port, '0.0.0.0', () => {
  console.log(`Componere API listening on http://localhost:${port} (db: ${dbPath === ':memory:' ? 'in-memory' : dbPath}, demoMode: ${process.env.DEMO_MODE === 'true'})`)
})

process.on('SIGTERM', () => server.close())
process.on('SIGINT', () => server.close())