import { describe, expect, it } from 'vitest'
import { canonicalize, decisionHash, evaluate, finalizeDecision, ruleDuplicateInvoice, rulePerPaymentCap, rulePerPeriodCap, rulePoMatch, ruleRequiredEvidence, ruleSeparationOfDuties, ruleTokenAndNetwork, ruleVendorAllowlist, type PaymentRequest, type Policy } from './index'

const token = '0x0000000000000000000000000000000000000001' as `0x${string}`
const evidence = [{ kind: 'invoice' as const, hash: `0x${'aa'.repeat(32)}` as `0x${string}` }]
const request: PaymentRequest = { id: 'req-1', requesterId: 'alice', vendorAddress: `0x${'11'.repeat(20)}`, vendorId: 'vendor-1', amountBaseUnits: 100n, tokenAddress: token, network: 'tempo-moderato', invoiceNumber: 'INV-1', invoiceDate: '2026-10-10', poNumber: 'PO-1', poAmountBaseUnits: 100n, evidence }
const policy: Policy = { version: 'policy-1', allowedVendors: ['vendor-1'], tokenAllowlist: [token], networkAllowlist: ['tempo-moderato'], perPaymentCapBaseUnits: 100n, perPeriodCapBaseUnits: 200n, periodSeconds: 86400, requiredEvidence: ['invoice'], poToleranceBaseUnits: 0n, approvalThresholds: [], minimumApprovals: 0 }
const context = { periodSpendBaseUnits: 0n, duplicateRequests: [], approvals: [] }

describe('policy rules', () => {
  it('handles payment cap boundaries', () => { expect(rulePerPaymentCap(request, policy)).toBeNull(); expect(rulePerPaymentCap({ ...request, amountBaseUnits: 101n }, policy)).not.toBeNull() })
  it('handles period cap boundaries', () => { expect(rulePerPeriodCap(request, policy, { ...context, periodSpendBaseUnits: 100n })).toBeNull(); expect(rulePerPeriodCap(request, policy, { ...context, periodSpendBaseUnits: 101n })).not.toBeNull() })
  it('checks vendor, evidence, PO, token and network allowlists', () => { expect(ruleVendorAllowlist({ ...request, vendorId: 'other' }, policy)).not.toBeNull(); expect(ruleRequiredEvidence({ ...request, evidence: [] }, policy)).not.toBeNull(); expect(rulePoMatch({ ...request, poAmountBaseUnits: 101n }, policy)).not.toBeNull(); expect(ruleTokenAndNetwork({ ...request, tokenAddress: `0x${'22'.repeat(20)}` }, policy)).not.toBeNull() })
  it('blocks duplicates and requester self-approval', () => { expect(ruleDuplicateInvoice(request, { ...context, duplicateRequests: [request] })).not.toBeNull(); expect(ruleSeparationOfDuties(request, { ...context, approvals: [{ approverId: 'alice', role: 'manager' }] })).not.toBeNull() })
  it('returns a deterministic decision and hash', () => { const evaluated = evaluate(request, policy, context); const decision = finalizeDecision(evaluated); expect(decision.outcome).toBe('allow'); expect(decisionHash(evaluated)).toBe(decision.decisionHash); expect(decisionHash(evaluate(request, policy, context))).toBe(decision.decisionHash) })
  it('canonicalizes reordered object keys identically', () => { expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 })); expect(canonicalize({ amount: 2n })).toBe('{"amount":"2"}') })
})