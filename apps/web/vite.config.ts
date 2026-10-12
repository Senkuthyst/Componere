import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'

const root = dirname(fileURLToPath(import.meta.url))
const apiProxy = {
  target: 'http://127.0.0.1:4000',
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/api/, '')
}

function backendServerPlugin(): Plugin {
  let proc: ChildProcess | null = null
  const ensureBackend = async () => {
    if (process.env.COMPONERE_DEV_RUNNER === 'true') return
    const isListening = await new Promise<boolean>((res) => {
      const sock = net.connect({ port: 4000, host: '127.0.0.1' }, () => {
        sock.destroy()
        res(true)
      })
      sock.on('error', () => res(false))
    })

    if (!isListening && !proc) {
      const workspaceRoot = resolve(root, '../../')
      const tsxCli = resolve(workspaceRoot, 'node_modules/tsx/dist/cli.mjs')
      const serverFile = resolve(workspaceRoot, 'apps/api/src/server.ts')
      proc = spawn(process.execPath, [tsxCli, serverFile], {
        cwd: workspaceRoot,
        stdio: 'inherit',
        env: { ...process.env, PORT: process.env.PORT ?? '4000' }
      })
      proc.on('error', (err) => console.error('Failed to spawn API server from Vite:', err))
    }
  }

  const stopBackend = () => {
    if (proc) {
      try { proc.kill() } catch {}
      proc = null
    }
  }

  return {
    name: 'backend-api-starter',
    configureServer(server) {
      void ensureBackend()
      server.httpServer?.on('close', stopBackend)
      process.on('SIGINT', stopBackend)
      process.on('SIGTERM', stopBackend)
      process.on('exit', stopBackend)
    },
    configurePreviewServer(server) {
      void ensureBackend()
      server.httpServer?.on('close', stopBackend)
      process.on('SIGINT', stopBackend)
      process.on('SIGTERM', stopBackend)
      process.on('exit', stopBackend)
    }
  }
}

export default defineConfig({
  root,
  envDir: resolve(root, '../../'),
  plugins: [react(), backendServerPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': apiProxy }
  },
  preview: {
    port: 4173,
    proxy: { '/api': apiProxy }
  },
  build: {
    outDir: resolve(root, '../../dist/web')
  }
})