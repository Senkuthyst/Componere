import { resolve } from 'node:path'
try { process.loadEnvFile?.(resolve(process.cwd(), '.env')) } catch { try { process.loadEnvFile?.() } catch {} }
import { createApp } from './app.js'
import { Store } from './store.js'

const port = Number(process.env.PORT ?? 4000)
const dbPath = process.env.DATABASE_FILE ?? ':memory:'
const store = new Store(dbPath)

createApp(store).app.listen(port, () => {
  console.log(`Componere API listening on http://localhost:${port} (db: ${dbPath === ':memory:' ? 'in-memory' : dbPath}, demoMode: ${process.env.DEMO_MODE === 'true'})`)
})