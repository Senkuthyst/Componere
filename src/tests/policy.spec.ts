import { describe, expect, it } from 'vitest'
import { canonicalInvoiceJson, decisionHash } from '../core/canonical-hash'
import { evaluatePolicy } from '../core/policy-engine'
import { DEFAULT_BUDGET_BASE_UNITS, DEFAULT_RECIPIENT, type Invoice } from '../core/types'
const invoice: Invoice = { invoiceId: 'INV-2042', vendorAddress: DEFAULT_RECIPIENT, tokenAddress: '0x0000000000000000000000000000000000000001', amountBaseUnits: 4_500_000_000n, currency: 'USD', dueDate: '2026-10-20T00:00:00.000Z', lineItems: [{ description: 'Settlement', quantity: 1, unitAmountBaseUnits: DEFAULT_BUDGET_BASE_UNITS }], policyQuorum: { required: 2, approved: 2 } }
describe('deterministic policy engine', () => {
  it('hashes identical canonical payloads regardless of key insertion order', () => { expect(decisionHash(invoice)).toBe(decisionHash({ ...invoice, policyQuorum: { approved: 2, required: 2 } })); expect(canonicalInvoiceJson(invoice)).not.toContain('undefined') })
  it('approves an exact in-scope quorum', () => { expect(evaluatePolicy(invoice, { now: 1 }).approved).toBe(true) })
  it('rejects quorum, amount, and recipient violations', () => { expect(evaluatePolicy({ ...invoice, policyQuorum: { required: 3, approved: 2 } }, { now: 1 }).reason).toBe('QUORUM_NOT_MET'); expect(evaluatePolicy({ ...invoice, amountBaseUnits: DEFAULT_BUDGET_BASE_UNITS + 1n }, { now: 1 }).reason).toBe('AMOUNT_EXCEEDS_LIMIT'); expect(evaluatePolicy({ ...invoice, vendorAddress: '0x0000000000000000000000000000000000000002' }, { now: 1 }).reason).toBe('RECIPIENT_SCOPE_MISMATCH') })
})