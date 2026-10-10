import { createPublicClient, http } from 'viem'
import { tempoModerato } from 'viem/chains'
export const tempoRpcUrl = process.env.NEXT_PUBLIC_TEMPO_RPC_URL ?? 'https://rpc.moderato.tempo.xyz'
export const tempoPublicClient = createPublicClient({ chain: tempoModerato, transport: http(tempoRpcUrl) })