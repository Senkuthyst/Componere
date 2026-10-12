try { process.loadEnvFile?.() } catch {}
import { createApp } from './app.js'
const port = Number(process.env.PORT ?? 4000)
createApp().app.listen(port, () => console.log(`Componere API listening on ${port} (Tempo testnet only)`))