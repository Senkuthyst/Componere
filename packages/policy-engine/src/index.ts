import { createHash } from 'node:crypto'

export type EvidenceKind = 'invoice' | 'receipt' | 'contract' | 'delivery_note' | 'po'
export type Outcome = 'allow' | 'needs_approval' | 'block'
export type Role = 'finance' | 'manager' | 'requester' | 'controller'

export type PaymentRequest = {
  id: string
  requesterId: string
  vendorAddress: `0x${string}`
  vendorId: string
  amountBaseUnits: bigint
  tokenAddress: `0x${string}`
  network: 'tempo-moderato'
  invoiceNumber: string
  invoiceDate: string
  poNumber?: string
  poAmountBaseUnits?: bigint
  evidence: { kind: EvidenceKind; hash: `0x${string}` }[]
}

export type Policy = {
  version: string
  allowedVendors: string[]
  tokenAllowlist: `0x${string}`[]
  networkAllowlist: PaymentRequest['network'][]
  perPaymentCapBaseUnits: bigint
  perPeriodCapBaseUnits: bigint
  periodSeconds: number
  requiredEvidence: EvidenceKind[]
  poToleranceBaseUnits: bigint
  approvalThresholds: { role: Role; minBaseUnits: bigint }[]
  minimumApprovals: number
}

export type Approval = { approverId: string; role: Role }
export type DecisionReason = { rule: string; message: string }
export type Decision = {
  outcome: Outcome
  reasons: DecisionReason[]
  requiredApprovals: { role: Role; min: number }[]
  policyVersion: string
  requestId: string
  decisionHash: `0x${string}`
}

export type EvaluationContext = {
  periodSpendBaseUnits: bigint
  duplicateRequests: PaymentRequest[]
  approvals: Approval[]
}

export const ruleVendorAllowlist = (request: PaymentRequest, policy: Policy): DecisionReason | null => policy.allowedVendors.includes(request.vendorId) ? null : { rule: 'vendor_allowlist', message: 'Vendor is not on the policy allowlist.' }
export const rulePerPaymentCap = (request: PaymentRequest, policy: Policy): DecisionReason | null => request.amountBaseUnits <= policy.perPaymentCapBaseUnits ? null : { rule: 'per_payment_cap', message: 'Payment exceeds the per-payment cap.' }
export const rulePerPeriodCap = (request: PaymentRequest, policy: Policy, context: EvaluationContext): DecisionReason | null => context.periodSpendBaseUnits + request.amountBaseUnits <= policy.perPeriodCapBaseUnits ? null : { rule: 'per_period_cap', message: 'Vendor period spend would exceed the cap.' }
export const ruleRequiredEvidence = (request: PaymentRequest, policy: Policy): DecisionReason | null => policy.requiredEvidence.every(kind => request.evidence.some(item => item.kind === kind)) ? null : { rule: 'required_evidence', message: 'Required evidence is missing.' }
export const rulePoMatch = (request: PaymentRequest, policy: Policy): DecisionReason | null => request.poNumber && request.poAmountBaseUnits !== undefined && abs(request.poAmountBaseUnits - request.amountBaseUnits) <= policy.poToleranceBaseUnits ? null : { rule: 'po_match', message: 'Purchase order is missing or outside tolerance.' }
export const ruleApprovalThreshold = (request: PaymentRequest, policy: Policy): DecisionReason | null => policy.approvalThresholds.every(threshold => request.amountBaseUnits < threshold.minBaseUnits || threshold.role.length > 0) ? null : { rule: 'approval_threshold', message: 'Approval threshold configuration is invalid.' }
export const ruleSeparationOfDuties = (request: PaymentRequest, context: EvaluationContext): DecisionReason | null => context.approvals.some(approval => approval.approverId === request.requesterId) ? { rule: 'separation_of_duties', message: 'Requester cannot approve their own payment.' } : null
export const ruleDuplicateInvoice = (request: PaymentRequest, context: EvaluationContext): DecisionReason | null => context.duplicateRequests.some(candidate => candidate.vendorId === request.vendorId && candidate.invoiceNumber === request.invoiceNumber && candidate.amountBaseUnits === request.amountBaseUnits) ? { rule: 'duplicate_invoice', message: 'Vendor, invoice number, and amount match an existing request.' } : null
export const ruleTokenAndNetwork = (request: PaymentRequest, policy: Policy): DecisionReason | null => policy.tokenAllowlist.includes(request.tokenAddress) && policy.networkAllowlist.includes(request.network) ? null : { rule: 'token_network_allowlist', message: 'Token or network is not allowlisted.' }

function abs(value: bigint): bigint { return value < 0n ? -value : value }

const rules = [
  (request: PaymentRequest, policy: Policy, context: EvaluationContext) => ruleVendorAllowlist(request, policy) ?? rulePerPaymentCap(request, policy) ?? rulePerPeriodCap(request, policy, context) ?? ruleRequiredEvidence(request, policy) ?? rulePoMatch(request, policy) ?? ruleApprovalThreshold(request, policy) ?? ruleSeparationOfDuties(request, context) ?? ruleDuplicateInvoice(request, context) ?? ruleTokenAndNetwork(request, policy)
]

export function evaluate(request: PaymentRequest, policy: Policy, context: EvaluationContext): Omit<Decision, 'decisionHash'> {
  const reasons = rules.flatMap(rule => { const reason = rule(request, policy, context); return reason ? [reason] : [] })
  const approvals = policy.approvalThresholds.filter(threshold => request.amountBaseUnits >= threshold.minBaseUnits).map(threshold => ({ role: threshold.role, min: 1 }))
  const needsApproval = approvals.length > 0 || policy.minimumApprovals > 0
  return { outcome: reasons.length > 0 ? 'block' : needsApproval ? 'needs_approval' : 'allow', reasons, requiredApprovals: approvals, policyVersion: policy.version, requestId: request.id }
}

type Canonical = string | number | boolean | null | Canonical[] | { [key: string]: Canonical }
function canonicalValue(value: unknown): Canonical {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonicalValue(nested)]))
  return value as Canonical
}

export function canonicalize(value: unknown): string { return JSON.stringify(canonicalValue(value)) }
export function decisionHash(decision: Omit<Decision, 'decisionHash'>): `0x${string}` { return `0x${createHash('sha256').update(canonicalize(decision)).digest('hex')}` }
export function finalizeDecision(decision: Omit<Decision, 'decisionHash'>): Decision { return { ...decision, decisionHash: decisionHash(decision) } }