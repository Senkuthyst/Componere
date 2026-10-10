export type AgreementState = 'draft' | 'ai_reviewed' | 'awaiting_acceptance' | 'accepted' | 'awaiting_funding' | 'funded' | 'in_progress' | 'milestone_submitted' | 'awaiting_approval' | 'partially_settled' | 'completed' | 'rejected' | 'cancelled' | 'expired' | 'disputed' | 'refunded' | 'transaction_failed'
export type AgreementRole = 'owner' | 'admin' | 'approver' | 'member' | 'client' | 'provider'
export type AgreementRevision = { version: number; canonicalHash: `0x${string}`; createdBy: string; createdAt: string; terms: unknown }
export type Acceptance = { version: number; actorId: string; role: 'client' | 'provider'; acceptedAt: string }
export type AgreementMilestone = { id: string; amountBaseUnits: bigint; status: 'upcoming' | 'submitted' | 'approved' | 'released' | 'rejected'; submittedBy?: string; evidence?: string[] }
export type Agreement = { id: string; organizationId: string; clientId: string; providerId: string; state: AgreementState; currentVersion: number; revisions: AgreementRevision[]; acceptances: Acceptance[]; milestones: AgreementMilestone[] }

const transitions: Record<AgreementState, AgreementState[]> = {
  draft: ['ai_reviewed', 'cancelled'], ai_reviewed: ['awaiting_acceptance', 'draft', 'cancelled'], awaiting_acceptance: ['accepted', 'rejected', 'cancelled'], accepted: ['awaiting_funding', 'rejected', 'cancelled'], awaiting_funding: ['funded', 'expired', 'cancelled'], funded: ['in_progress', 'transaction_failed', 'disputed'], in_progress: ['milestone_submitted', 'disputed', 'expired'], milestone_submitted: ['awaiting_approval', 'rejected', 'disputed'], awaiting_approval: ['partially_settled', 'completed', 'rejected', 'disputed', 'transaction_failed'], partially_settled: ['milestone_submitted', 'completed', 'disputed', 'transaction_failed'], completed: [], rejected: [], cancelled: [], expired: ['refunded'], disputed: ['refunded', 'partially_settled', 'completed'], refunded: [], transaction_failed: ['awaiting_funding', 'cancelled']
}

export function canTransition(from: AgreementState, to: AgreementState): boolean { return transitions[from].includes(to) }
export function transition(from: AgreementState, to: AgreementState): AgreementState { if (!canTransition(from, to)) throw new Error(`Illegal agreement transition: ${from} -> ${to}`); return to }
export function assertOrganizationAccess(agreement: Agreement, organizationId: string): void { if (agreement.organizationId !== organizationId) throw new Error('Agreement is outside the active organization') }
export function acceptRevision(agreement: Agreement, actorId: string, role: 'client' | 'provider', version: number, acceptedAt = new Date().toISOString()): Agreement {
  if (version !== agreement.currentVersion) throw new Error('Acceptance must target the current agreement version')
  if (agreement.state !== 'awaiting_acceptance') throw new Error(`Cannot accept agreement from ${agreement.state}`)
  if (role === 'client' && actorId !== agreement.clientId) throw new Error('Only the agreement client can accept as client')
  if (role === 'provider' && actorId !== agreement.providerId) throw new Error('Only the counterparty can accept as provider')
  if (agreement.acceptances.some(item => item.version === version && item.role === role)) throw new Error('This party already accepted the current revision')
  const next = { ...agreement, acceptances: [...agreement.acceptances, { version, actorId, role, acceptedAt }] }
  if (next.acceptances.filter(item => item.version === version).length === 2) next.state = transition(agreement.state, 'accepted')
  return next
}
export function submitMilestone(agreement: Agreement, milestoneId: string, actorId: string, evidence: string[] = []): Agreement {
  if (actorId !== agreement.providerId) throw new Error('Only the service provider can submit a milestone')
  if (agreement.state !== 'in_progress' && agreement.state !== 'partially_settled') throw new Error(`Cannot submit milestone from ${agreement.state}`)
  const milestones = agreement.milestones.map(milestone => milestone.id === milestoneId ? { ...milestone, status: 'submitted' as const, submittedBy: actorId, evidence } : milestone)
  if (!milestones.some(milestone => milestone.id === milestoneId)) throw new Error('Milestone not found')
  return { ...agreement, milestones, state: transition(agreement.state, 'milestone_submitted') }
}
export function approveMilestone(agreement: Agreement, milestoneId: string, actorId: string): Agreement {
  if (actorId !== agreement.clientId) throw new Error('Only the client can approve a milestone')
  const milestone = agreement.milestones.find(item => item.id === milestoneId)
  if (!milestone || milestone.status !== 'submitted') throw new Error('Only a submitted milestone can be approved')
  const milestones = agreement.milestones.map(item => item.id === milestoneId ? { ...item, status: 'approved' as const } : item)
  return { ...agreement, milestones, state: transition(agreement.state, 'awaiting_approval') }
}
export function releaseMilestone(agreement: Agreement, milestoneId: string, actorId: string): Agreement {
  if (actorId !== agreement.clientId) throw new Error('Only the client can authorize a release')
  const milestone = agreement.milestones.find(item => item.id === milestoneId)
  if (!milestone || milestone.status !== 'approved') throw new Error('Only an approved milestone can be released')
  const milestones = agreement.milestones.map(item => item.id === milestoneId ? { ...item, status: 'released' as const } : item)
  const allReleased = milestones.every(item => item.status === 'released')
  return { ...agreement, milestones, state: transition(agreement.state, allReleased ? 'completed' : 'partially_settled') }
}