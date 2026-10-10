import { Account, P256, createClient } from 'viem/tempo'
import { tempoModerato } from 'viem/chains'
import { getAddress } from 'viem'
import { MandateSchema, TRANSFER_WITH_MEMO_SELECTOR, type Mandate } from '../core/types'
export function buildMandate(input: Omit<Mandate, 'expiry' | 'period' | 'selector'> & { expiry?: number }): Mandate { return MandateSchema.parse({ ...input, expiry: input.expiry ?? Math.floor(Date.now() / 1000) + 300, period: 0, selector: TRANSFER_WITH_MEMO_SELECTOR }) }
type TempoAccount = NonNullable<NonNullable<Parameters<typeof createClient>[0]>['account']>
type AuthorizeParameters = { accessKey: TempoAccount; expiry: number; limits: { token: `0x${string}`; limit: bigint; period: 0 }[]; scopes: { address: `0x${string}`; selector: typeof TRANSFER_WITH_MEMO_SELECTOR; recipients: `0x${string}`[] }[] }

export async function authorizeEphemeralMandate(approverAccount: TempoAccount, vendorAddress: string, tokenAddress: string, amountBaseUnits: bigint, decisionHash: `0x${string}`) {
  const client = createClient({ account: approverAccount, chain: tempoModerato })
  const ephemeralWorker = Account.fromP256(P256.randomPrivateKey(), { access: approverAccount })
  const authorizeSync = client.accessKey.authorizeSync as unknown as (parameters: AuthorizeParameters) => Promise<unknown>
  const authTx = await authorizeSync({ accessKey: ephemeralWorker, expiry: Math.floor(Date.now() / 1000) + 300, limits: [{ token: tokenAddress as `0x${string}`, limit: amountBaseUnits, period: 0 }], scopes: [{ address: tokenAddress as `0x${string}`, selector: TRANSFER_WITH_MEMO_SELECTOR, recipients: [getAddress(vendorAddress)] }] })
  return { ephemeralWorker, authTx, vendorAddress: getAddress(vendorAddress), decisionHash }
}