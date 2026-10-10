import { getAddress } from 'viem'
import { canonicalInvoiceJson, decisionHash } from './canonical-hash'
import { DEFAULT_BUDGET_BASE_UNITS, DEFAULT_RECIPIENT, MANDATE_DURATION_SECONDS, type Invoice, type PolicyDecision } from './types'
export type PolicyContext = { now?: number; recipient?: string; budgetBaseUnits?: bigint }
export function evaluatePolicy(invoice: Invoice, context: PolicyContext = {}): PolicyDecision {
  const hash = decisionHash(invoice)
  if (getAddress(invoice.vendorAddress) !== getAddress(context.recipient ?? DEFAULT_RECIPIENT)) return { approved: false, reason: 'RECIPIENT_SCOPE_MISMATCH', decisionHash: hash }
  if (invoice.amountBaseUnits > (context.budgetBaseUnits ?? DEFAULT_BUDGET_BASE_UNITS)) return { approved: false, reason: 'AMOUNT_EXCEEDS_LIMIT', decisionHash: hash }
  if (invoice.policyQuorum.approved < invoice.policyQuorum.required) return { approved: false, reason: 'QUORUM_NOT_MET', decisionHash: hash }
  if ((context.now ?? Math.floor(Date.now() / 1000)) + MANDATE_DURATION_SECONDS <= 0) return { approved: false, reason: 'MANDATE_EXPIRED', decisionHash: hash }
  return { approved: true, reason: 'QUORUM_MET', decisionHash: hash }
}
export function policyInputFingerprint(invoice: Invoice): string { return canonicalInvoiceJson(invoice) }