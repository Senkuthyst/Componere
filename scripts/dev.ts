import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = process.cwd()

const api = spawn(process.execPath, [resolve(root, 'node_modules/tsx/dist/cli.mjs'), 'apps/api/src/server.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.PORT ?? '4000' }
})

const web = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', '5173'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, COMPONERE_DEV_RUNNER: 'true' }
})

const handleExit = () => {
  try { api.kill() } catch {}
  try { web.kill() } catch {}
  process.exit()
}

process.on('SIGINT', handleExit)
process.on('SIGTERM', handleExit)
process.on('exit', handleExit)

api.on('exit', (code) => {
  if (code && code !== 0) console.error(`API server exited with code ${code}`)
})

web.on('exit', (code) => {
  if (code && code !== 0) console.error(`Vite dev server exited with code ${code}`)
})
