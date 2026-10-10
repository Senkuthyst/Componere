import { getAddress, http } from 'viem'
import { tempoModerato } from 'viem/chains'
import { Account, Actions, P256, createClient } from 'viem/tempo'
import type { PaymentRequest } from '../../../packages/policy-engine/src/index.js'
import type { Mandate, Settlement, TempoAdapter } from './tempo-adapter.js'

const alphaUsd = '0x20c0000000000000000000000000000000000001' as const
const transferSignature = 'transferWithMemo(address,uint256,bytes32)' as const
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

export class LiveTempoAdapter implements TempoAdapter {
  private readonly root: ReturnType<typeof Account.fromSecp256k1>
  private readonly rootClient: any
  constructor(privateKey = process.env.TEMPO_ROOT_PRIVATE_KEY, rpcUrl = process.env.TEMPO_RPC_URL ?? 'https://rpc.moderato.tempo.xyz') {
    if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error('TEMPO_ROOT_PRIVATE_KEY must be a funded testnet private key')
    this.root = Account.fromSecp256k1(privateKey as `0x${string}`)
    this.rootClient = createClient({ account: this.root, chain: tempoModerato, transport: http(rpcUrl), feeToken: alphaUsd }) as any
  }
  async authorize(request: PaymentRequest, decisionHash: `0x${string}`): Promise<Mandate> { const accessKey = Account.fromP256(P256.randomPrivateKey(), { access: this.root }); const authorization = await this.rootClient.accessKey.authorizeSync({ accessKey, expiry: Math.floor(Date.now() / 1000) + 86400, limits: [{ token: request.tokenAddress, limit: request.amountBaseUnits, period: 0 }], scopes: [{ address: request.tokenAddress, selector: transferSignature, recipients: [getAddress(request.vendorAddress)] }] }); return { keyId: accessKey.accessKeyAddress, expiry: Math.floor(Date.now() / 1000) + 86400, revoked: false, runtime: { accessKey, decisionHash, authorization } } }
  async transfer(mandate: Mandate, request: PaymentRequest, decisionHash: `0x${string}`): Promise<Settlement> { const accessKey = (mandate.runtime as { accessKey: any }).accessKey; const client = createClient({ account: accessKey, chain: tempoModerato, transport: http(process.env.TEMPO_RPC_URL ?? 'https://rpc.moderato.tempo.xyz'), feeToken: alphaUsd }) as any; const result = await (Actions.token.transferSync as any)(client, { token: request.tokenAddress, to: getAddress(request.vendorAddress), amount: request.amountBaseUnits, memo: decisionHash }); return { txHash: result.receipt.transactionHash, recipient: getAddress(request.vendorAddress), amountBaseUnits: request.amountBaseUnits, memo: decisionHash, confirmed: result.receipt.status === 'success' } }
  async revoke(mandate: Mandate): Promise<void> { await this.rootClient.accessKey.revokeSync({ accessKey: (mandate.runtime as { accessKey: any }).accessKey }); mandate.revoked = true }
  async attack(mandate: Mandate, request: PaymentRequest, decisionHash: `0x${string}`) { const accessKey = (mandate.runtime as { accessKey: any }).accessKey; const client = createClient({ account: accessKey, chain: tempoModerato, transport: http(process.env.TEMPO_RPC_URL ?? 'https://rpc.moderato.tempo.xyz'), feeToken: alphaUsd }) as any; const attempt = async (to: `0x${string}`, amount: bigint) => { try { await (Actions.token.transferSync as any)(client, { token: request.tokenAddress, to, amount, memo: decisionHash }); return { rejected: false } } catch (error) { return { rejected: true, error: errorText(error) } } }; const wrongRecipient = getAddress(process.env.TEMPO_WRONG_RECIPIENT ?? '0x0000000000000000000000000000000000000002'); const result = { wrongRecipient: await attempt(wrongRecipient, request.amountBaseUnits), overBudget: await attempt(getAddress(request.vendorAddress), request.amountBaseUnits + 1n), afterRevoke: { rejected: false as boolean } }; await this.revoke(mandate); result.afterRevoke = await attempt(getAddress(request.vendorAddress), request.amountBaseUnits); return result }
}