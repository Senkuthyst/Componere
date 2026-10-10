import type { PaymentRequest } from '@componere/policy-engine'
export type Mandate = { keyId: string; expiry: number; revoked: boolean }
export type Settlement = { txHash: `0x${string}`; recipient: `0x${string}`; amountBaseUnits: bigint; memo: `0x${string}`; confirmed: boolean }
export type TempoAdapter = { authorize(request: PaymentRequest, decisionHash: `0x${string}`): Promise<Mandate>; transfer(mandate: Mandate, request: PaymentRequest, decisionHash: `0x${string}`): Promise<Settlement>; revoke(mandate: Mandate): Promise<void>; attack(mandate: Mandate, request: PaymentRequest, decisionHash: `0x${string}`): Promise<Record<string, { rejected: boolean; error?: string }>> }
export class MockTempoAdapter implements TempoAdapter {
  private sequence = 0
  async authorize(_: PaymentRequest, __: `0x${string}`): Promise<Mandate> { return { keyId: `mock-key-${++this.sequence}`, expiry: Math.floor(Date.now() / 1000) + 86400, revoked: false } }
  async transfer(mandate: Mandate, request: PaymentRequest, decisionHash: `0x${string}`): Promise<Settlement> { if (mandate.revoked) throw new Error('TEMPO_ACCESSKEY_REVOKED'); return { txHash: `0x${this.sequence.toString(16).padStart(64, '0')}`, recipient: request.vendorAddress, amountBaseUnits: request.amountBaseUnits, memo: decisionHash, confirmed: true } }
  async revoke(mandate: Mandate): Promise<void> { mandate.revoked = true }
  async attack(_: Mandate, __: PaymentRequest, ___: `0x${string}`): Promise<Record<string, { rejected: boolean; error?: string }>> { return { wrongRecipient: { rejected: true, error: 'TEMPO_ACCESSKEY_SCOPE_VIOLATION' }, overBudget: { rejected: true, error: 'TEMPO_ACCESSKEY_BUDGET_EXCEEDED' }, afterRevoke: { rejected: true, error: 'TEMPO_ACCESSKEY_ALLOWANCE_EXHAUSTED' } } }
}