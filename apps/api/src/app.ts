import express, { type Request } from 'express'
import { evaluate, finalizeDecision, type PaymentRequest, type Policy } from '../../../packages/policy-engine/src/index.js'
import { transition as requestTransition, type RequestState } from './state.js'
import { MockTempoAdapter, type TempoAdapter } from './tempo-adapter.js'
import { LiveTempoAdapter } from './live-tempo-adapter.js'
import { Store, type StoredRequest } from './store.js'
import { AgreementStore } from './agreement-store.js'
import { seedDemoAgreement } from './demo-seed.js'
import { acceptRevision, approveMilestone, releaseMilestone, submitMilestone, transition as agreementTransition, type Agreement, type AgreementMilestone } from '../../../packages/agreement-core/src/index.js'

const actor = (request: Request) => ({
  id: String(request.header('x-actor-id') ?? ''),
  role: String(request.header('x-actor-role') ?? '')
})

const defaultUsers = [
  { id: 'demo-client', email: 'client.demo@example.com', displayName: 'Demo Client', role: 'client', organizationId: 'org-demo' },
  { id: 'demo-freelancer', email: 'freelancer.demo@example.com', displayName: 'Demo Freelancer', role: 'freelancer', organizationId: 'org-demo' },
]

export const defaultPolicy: Policy = { version: 'policy-1', allowedVendors: ['vendor-demo'], tokenAllowlist: ['0x20c0000000000000000000000000000000000001'], networkAllowlist: ['tempo-moderato'], perPaymentCapBaseUnits: 4_500_000_000n, perPeriodCapBaseUnits: 4_500_000_000n, periodSeconds: 86400, requiredEvidence: ['invoice'], poToleranceBaseUnits: 0n, approvalThresholds: [{ role: 'finance', minBaseUnits: 0n }], minimumApprovals: 1 }

function move(store: Store, stored: StoredRequest, next: RequestState, actorId: string) { const previous = stored.state; requestTransition(previous, next); stored.state = next; store.save(stored); store.audit(stored.request.id, previous, next, actorId, stored.decision.policyVersion, stored.decision.decisionHash) }
function parsePaymentRequest(input: Record<string, unknown>): PaymentRequest { return { ...input, amountBaseUnits: BigInt(String(input.amountBaseUnits)), poAmountBaseUnits: input.poAmountBaseUnits === undefined ? undefined : BigInt(String(input.poAmountBaseUnits)) } as PaymentRequest }

export function createApp(store = new Store(), adapter: TempoAdapter = (process.env.TEMPO_ROOT_PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(process.env.TEMPO_ROOT_PRIVATE_KEY)) ? new LiveTempoAdapter() : new MockTempoAdapter(), policy: Policy = defaultPolicy) {
  const agreementStore = new AgreementStore(store.db)
  const demoMode = process.env.DEMO_MODE === 'true'
  if (demoMode) seedDemoAgreement(agreementStore)

  const app = express()
  app.set('json replacer', (_: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value)

  const allowedOrigins = new Set<string>([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:4000',
    'http://127.0.0.1:4000',
  ])
  if (process.env.WEB_ORIGIN) {
    process.env.WEB_ORIGIN.split(',').forEach(o => {
      const trimmed = o.trim().replace(/\/+$/, '')
      if (trimmed) allowedOrigins.add(trimmed)
    })
  }

  const isOriginAllowed = (origin?: string): boolean => {
    if (!origin) return true
    const normalized = origin.trim().replace(/\/+$/, '')
    if (allowedOrigins.has(normalized)) return true
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) return true
    return false
  }

  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && isOriginAllowed(origin)) {
      res.header('Access-Control-Allow-Origin', origin)
      res.header('Vary', 'Origin')
      res.header('Access-Control-Allow-Credentials', 'true')
      res.header('Access-Control-Allow-Headers', 'authorization, content-type, x-actor-id, x-actor-role, x-organization-id, accept, origin, x-requested-with')
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
      res.header('Access-Control-Max-Age', '86400')
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.use(express.json())

  const apiRouter = express.Router()

  const organization = (req: Request) => String(req.header('x-organization-id') ?? 'org-demo')
  const agreementActor = (req: Request) => String(req.header('x-actor-id') ?? req.body?.actorId ?? '')
  const agreement = (req: Request): Agreement | undefined => {
    return agreementStore.getById(req.params.id)
  }

  apiRouter.get('/users', (_req, res) => {
    return res.json({ users: defaultUsers })
  })

  apiRouter.post('/agreements', (req, res) => {
    try {
      const input = req.body as { id: string; organizationId?: string; clientId: string; providerId: string; terms: unknown; milestones: { id: string; amountBaseUnits: string; criteria: string }[] }
      if (!input?.id || !input?.clientId || !input?.providerId) {
        return res.status(400).json({ error: 'Missing required agreement fields' })
      }
      const org = input.organizationId ?? organization(req)
      const actorId = agreementActor(req) || input.clientId
      const created: Agreement = {
        id: input.id,
        organizationId: org,
        clientId: input.clientId,
        providerId: input.providerId,
        state: 'draft',
        currentVersion: 1,
        revisions: [{ version: 1, canonicalHash: `0x${'00'.repeat(32)}`, createdBy: actorId, createdAt: new Date().toISOString(), terms: input.terms }],
        acceptances: [],
        milestones: (input.milestones ?? []).map((milestone: { id: string; amountBaseUnits: string; criteria: string }): AgreementMilestone => ({ id: milestone.id, amountBaseUnits: BigInt(milestone.amountBaseUnits), status: 'upcoming', evidence: [milestone.criteria] }))
      }
      agreementStore.save(created)
      agreementStore.event(created, 'created', actorId || 'system')
      return res.status(201).json(created)
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  apiRouter.get('/agreements', (req, res) => {
    const org = organization(req)
    const actorId = req.header('x-actor-id') ? String(req.header('x-actor-id')) : undefined
    const items = agreementStore.allForUser(org, actorId)
    return res.json(items)
  })

  apiRouter.get('/agreements/:id', (req, res) => {
    const item = agreement(req)
    return item ? res.json({ ...item, events: agreementStore.events(item.id) }) : res.status(404).json({ error: 'not found' })
  })

  apiRouter.post('/agreements/:id/review', (req, res) => {
    const item = agreement(req)
    if (!item) return res.status(404).json({ error: 'not found' })
    try {
      item.state = agreementTransition(item.state, 'ai_reviewed')
      item.state = agreementTransition(item.state, 'awaiting_acceptance')
      agreementStore.save(item)
      agreementStore.event(item, 'ai_reviewed', agreementActor(req) || 'system')
      return res.json(item)
    } catch (error) {
      return res.status(409).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  apiRouter.post('/agreements/:id/accept', (req, res) => {
    const item = agreement(req)
    if (!item) return res.status(404).json({ error: 'not found' })
    try {
      let role = req.body?.role as 'client' | 'provider' | 'freelancer'
      if (role === 'freelancer') role = 'provider'
      const actorId = agreementActor(req) || (role === 'provider' ? item.providerId : item.clientId)
      if (!role) {
        role = actorId === item.clientId ? 'client' : 'provider'
      }
      const version = Number(req.body?.version ?? item.currentVersion)
      const next = acceptRevision(item, actorId, role, version)
      if (next.state === 'accepted') next.state = agreementTransition(next.state, 'awaiting_funding')
      agreementStore.save(next)
      agreementStore.event(next, `accepted:${role}`, actorId)
      return res.json(next)
    } catch (error) {
      return res.status(403).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  apiRouter.post('/agreements/:id/fund', (req, res) => {
    const item = agreement(req)
    if (!item) return res.status(404).json({ error: 'not found' })
    if (req.body?.mode !== 'demo') return res.status(409).json({ error: 'Live escrow funding requires a verified deployed contract and wallet adapter' })
    const currentActor = agreementActor(req) || item.clientId
    if (currentActor !== item.clientId) return res.status(403).json({ error: 'Only the client can fund an agreement' })
    try {
      item.state = agreementTransition(item.state, 'funded')
      item.state = agreementTransition(item.state, 'in_progress')
      agreementStore.save(item)
      agreementStore.event(item, 'funded:demo-unverified', currentActor)
      return res.json({ ...item, funding: { mode: 'demo', verifiedOnChain: false } })
    } catch (error) {
      return res.status(409).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  apiRouter.post('/agreements/:id/submit', (req, res) => {
    const item = agreement(req)
    if (!item) return res.status(404).json({ error: 'not found' })
    try {
      const currentActor = agreementActor(req) || item.providerId
      const next = submitMilestone(item, String(req.body?.milestoneId ?? ''), currentActor, Array.isArray(req.body?.evidence) ? req.body.evidence : [])
      agreementStore.save(next)
      agreementStore.event(next, 'milestone_submitted', currentActor)
      return res.json(next)
    } catch (error) {
      return res.status(403).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  apiRouter.post('/agreements/:id/approve-milestone', (req, res) => {
    const item = agreement(req)
    if (!item) return res.status(404).json({ error: 'not found' })
    try {
      const currentActor = agreementActor(req) || item.clientId
      const next = approveMilestone(item, String(req.body?.milestoneId ?? ''), currentActor)
      agreementStore.save(next)
      agreementStore.event(next, 'milestone_approved', currentActor)
      return res.json(next)
    } catch (error) {
      return res.status(403).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  apiRouter.post('/agreements/:id/release-milestone', (req, res) => {
    const item = agreement(req)
    if (!item) return res.status(404).json({ error: 'not found' })
    try {
      const currentActor = agreementActor(req) || item.clientId
      const next = releaseMilestone(item, String(req.body?.milestoneId ?? ''), currentActor)
      agreementStore.save(next)
      agreementStore.event(next, 'milestone_release_authorized', currentActor)
      return res.json(next)
    } catch (error) {
      return res.status(403).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  apiRouter.post('/requests', (req, res) => {
    try {
      const request = parsePaymentRequest(req.body as Record<string, unknown>)
      const evaluated = finalizeDecision(evaluate(request, policy, { periodSpendBaseUnits: 0n, duplicateRequests: store.all().map(item => item.request), approvals: [] }))
      const stored: StoredRequest = { request, decision: evaluated, state: 'requested', approvals: [] }
      store.save(stored)
      move(store, stored, 'evaluated', actor(req).id || 'system')
      move(store, stored, evaluated.outcome === 'block' ? 'blocked' : evaluated.outcome === 'needs_approval' ? 'awaiting_approval' : 'approved', actor(req).id || 'system')
      res.status(201).json(stored)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  apiRouter.get('/requests', (_, res) => res.json(store.all()))
  apiRouter.get('/requests/:id', (req, res) => { const item = store.get(req.params.id); item ? res.json({ ...item, audit: store.auditFor(req.params.id) }) : res.status(404).json({ error: 'not found' }) })
  apiRouter.post('/requests/:id/approve', (req, res) => { const item = store.get(req.params.id); const current = actor(req); if (!item) return res.status(404).json({ error: 'not found' }); if (current.id === item.request.requesterId) return res.status(403).json({ error: 'requester cannot approve own request' }); const required = item.decision.requiredApprovals.map(value => value.role); if (!required.includes(current.role as never)) return res.status(403).json({ error: 'approver role is not required' }); if (item.approvals.some(value => value.approverId === current.id)) return res.status(409).json({ error: 'approver already approved' }); item.approvals.push({ approverId: current.id, role: current.role }); if (item.state === 'awaiting_approval' && item.approvals.length >= Math.max(1, item.decision.requiredApprovals.length)) move(store, item, 'approved', current.id); else store.save(item); return res.json(item) })
  apiRouter.post('/requests/:id/reject', (req, res) => { const item = store.get(req.params.id); if (!item) return res.status(404).json({ error: 'not found' }); const current = actor(req); if (current.id === item.request.requesterId) return res.status(403).json({ error: 'requester cannot reject own request' }); move(store, item, 'blocked', current.id || 'unknown'); return res.json(item) })
  apiRouter.post('/requests/:id/settle', async (req, res) => { const item = store.get(req.params.id); if (!item) return res.status(404).json({ error: 'not found' }); if (item.state === 'settled' || item.state === 'key_revoked') return res.json(item); if (item.state !== 'approved') return res.status(409).json({ error: `cannot settle from ${item.state}` }); const current = actor(req); try { item.mandate = await adapter.authorize(item.request, item.decision.decisionHash); move(store, item, 'key_authorized', current.id || 'system'); move(store, item, 'settling', current.id || 'system'); item.settlement = await adapter.transfer(item.mandate, item.request, item.decision.decisionHash); if (!item.settlement.confirmed) throw new Error('transaction was not confirmed successful'); move(store, item, 'settled', current.id || 'system'); store.saveReceipt(item.settlement.txHash, item.request.id, item.settlement); await adapter.revoke(item.mandate); move(store, item, 'key_revoked', current.id || 'system'); return res.json(item) } catch (error) { if (item.state === 'settling') move(store, item, 'failed', current.id || 'system'); if (item.mandate && !item.mandate.revoked) await adapter.revoke(item.mandate); if (item.state === 'failed') move(store, item, 'key_revoked', current.id || 'system'); return res.status(502).json({ error: error instanceof Error ? error.message : String(error), item }) } })
  apiRouter.get('/receipts/:txHash', (req, res) => { const receipt = store.receipt(req.params.txHash); receipt ? res.json(receipt) : res.status(404).json({ error: 'not found' }) })
  apiRouter.post('/demo/attack', async (req, res) => { const item = store.get(String(req.body?.id ?? '')); if (!item?.mandate) return res.status(409).json({ error: 'request has no authorized key' }); res.json(await adapter.attack(item.mandate, item.request, item.decision.decisionHash)) })

  app.use('/api', apiRouter)
  app.use('/', apiRouter)

  app.use((err: unknown, req: Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err)
    const status = typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
      ? (err as { status: number }).status
      : 500
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(status).json({ error: status === 500 ? 'Internal server error' : message })
  })

  app.use((req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` })
  })

  return { app, store }
}