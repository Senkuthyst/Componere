import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from './app.js'

const body = { id: 'req-1', requesterId: 'alice', vendorAddress: `0x${'11'.repeat(20)}`, vendorId: 'vendor-demo', amountBaseUnits: '100', tokenAddress: '0x20c0000000000000000000000000000000000001', network: 'tempo-moderato', invoiceNumber: 'INV-1', invoiceDate: '2026-10-10', poNumber: 'PO-1', poAmountBaseUnits: '100', evidence: [{ kind: 'invoice', hash: `0x${'aa'.repeat(32)}` }] }
describe('API state machine', () => {
  it('prevents requester approval and settles idempotently', async () => { const { app } = createApp(); const created = await request(app).post('/requests').set('x-actor-id', 'alice').send(body); expect(created.status).toBe(201); expect(created.body.state).toBe('awaiting_approval'); expect((await request(app).post('/requests/req-1/approve').set('x-actor-id', 'alice').set('x-actor-role', 'finance')).status).toBe(403); expect((await request(app).post('/requests/req-1/approve').set('x-actor-id', 'bob').set('x-actor-role', 'finance')).body.state).toBe('approved'); const settled = await request(app).post('/requests/req-1/settle').set('x-actor-id', 'bob'); expect(settled.status).toBe(200); expect(settled.body.state).toBe('key_revoked'); expect((await request(app).post('/requests/req-1/settle')).body.state).toBe('key_revoked') })
  it('returns 502 and never settles on chain failure', async () => { const adapter = { authorize: async () => ({ keyId: 'k', expiry: 1, revoked: false }), transfer: async () => { throw new Error('reverted') }, revoke: async () => undefined, attack: async () => ({}) }; const { app } = createApp(undefined, adapter); await request(app).post('/requests').set('x-actor-id', 'alice').send(body); await request(app).post('/requests/req-1/approve').set('x-actor-id', 'bob').set('x-actor-role', 'finance'); const result = await request(app).post('/requests/req-1/settle'); expect(result.status).toBe(502); expect(result.body.item.state).toBe('key_revoked') })
  it('persists agreement acceptance and blocks provider self-approval', async () => { const { app } = createApp(); const agreement = { id: 'AGR-LIFE-1', clientId: 'alice', providerId: 'vendor', terms: { title: 'Demo' }, milestones: [{ id: 'm1', amountBaseUnits: '100', criteria: 'written approval' }] }; expect((await request(app).post('/agreements').set('x-actor-id', 'alice').send(agreement)).status).toBe(201); expect((await request(app).post('/agreements/AGR-LIFE-1/review').set('x-actor-id', 'alice')).body.state).toBe('awaiting_acceptance'); await request(app).post('/agreements/AGR-LIFE-1/accept').set('x-actor-id', 'alice').send({ role: 'client', version: 1 }); const accepted = await request(app).post('/agreements/AGR-LIFE-1/accept').set('x-actor-id', 'vendor').send({ role: 'provider', version: 1 }); expect(accepted.body.state).toBe('awaiting_funding'); expect((await request(app).post('/agreements/AGR-LIFE-1/fund').set('x-actor-id', 'alice').send({ mode: 'demo' })).body.state).toBe('in_progress'); expect((await request(app).post('/agreements/AGR-LIFE-1/submit').set('x-actor-id', 'vendor').send({ milestoneId: 'm1' })).body.state).toBe('milestone_submitted'); expect((await request(app).post('/agreements/AGR-LIFE-1/approve-milestone').set('x-actor-id', 'vendor').send({ milestoneId: 'm1' })).status).toBe(403) })
  it('provisions authenticated demo accounts and protects seeded agreement access', async () => {
    const previous = process.env.DEMO_MODE
    process.env.DEMO_MODE = 'true'
    try {
      const { app } = createApp()
      expect((await request(app).get('/agreements/DEMO-WEBSITE-001')).status).toBe(401)
      const client = await request(app).post('/auth/demo-login').send({ role: 'client' })
      const freelancer = await request(app).post('/auth/demo-login').send({ role: 'freelancer' })
      expect(client.status).toBe(200)
      expect(client.body.user.role).toBe('client')
      expect((await request(app).get('/agreements/DEMO-WEBSITE-001').set('authorization', `Bearer ${client.body.token}`)).status).toBe(200)
      expect((await request(app).post('/agreements/DEMO-WEBSITE-001/approve-milestone').set('authorization', `Bearer ${freelancer.body.token}`).send({ milestoneId: 'ui-design' })).status).toBe(403)
    } finally {
      if (previous === undefined) delete process.env.DEMO_MODE
      else process.env.DEMO_MODE = previous
    }
  })
  it('registers role accounts, persists sessions, and enforces agreement ownership', async () => {
    const { app } = createApp()
    const client = await request(app).post('/auth/register').send({ email: 'client@example.com', password: 'correct horse battery staple', displayName: 'Client User', role: 'client', organizationId: 'org-shared' })
    const freelancer = await request(app).post('/auth/register').send({ email: 'freelancer@example.com', password: 'correct horse battery staple', displayName: 'Freelancer User', role: 'freelancer', organizationId: 'org-shared' })
    expect(client.status).toBe(201)
    expect(freelancer.status).toBe(201)
    expect((await request(app).get('/auth/me').set('authorization', `Bearer ${client.body.token}`)).body.user.id).toBe(client.body.user.id)
    const agreement = await request(app).post('/agreements').set('authorization', `Bearer ${client.body.token}`).send({ id: 'AGR-AUTH-1', clientId: client.body.user.id, providerId: freelancer.body.user.id, terms: { title: 'Persisted work' }, milestones: [{ id: 'm1', amountBaseUnits: '100', criteria: 'written approval' }] })
    expect(agreement.status).toBe(201)
    expect((await request(app).get('/agreements/AGR-AUTH-1').set('authorization', `Bearer ${freelancer.body.token}`)).status).toBe(200)
    expect((await request(app).post('/agreements/AGR-AUTH-1/approve-milestone').set('authorization', `Bearer ${freelancer.body.token}`).send({ milestoneId: 'm1' })).status).toBe(403)
    expect((await request(app).post('/auth/logout').set('authorization', `Bearer ${client.body.token}`)).status).toBe(204)
    expect((await request(app).get('/auth/me').set('authorization', `Bearer ${client.body.token}`)).body.user).toBeNull()
  })
})