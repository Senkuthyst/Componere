import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from './app.js'

const body = { id: 'req-1', requesterId: 'alice', vendorAddress: `0x${'11'.repeat(20)}`, vendorId: 'vendor-demo', amountBaseUnits: '100', tokenAddress: '0x20c0000000000000000000000000000000000001', network: 'tempo-moderato', invoiceNumber: 'INV-1', invoiceDate: '2026-10-10', poNumber: 'PO-1', poAmountBaseUnits: '100', evidence: [{ kind: 'invoice', hash: `0x${'aa'.repeat(32)}` }] }

describe('API state machine', () => {
  it('prevents requester approval and settles idempotently', async () => {
    const { app } = createApp()
    const created = await request(app).post('/requests').set('x-actor-id', 'alice').send(body)
    expect(created.status).toBe(201)
    expect(created.body.state).toBe('awaiting_approval')
    expect((await request(app).post('/requests/req-1/approve').set('x-actor-id', 'alice').set('x-actor-role', 'finance')).status).toBe(403)
    expect((await request(app).post('/requests/req-1/approve').set('x-actor-id', 'bob').set('x-actor-role', 'finance')).body.state).toBe('approved')
    const settled = await request(app).post('/requests/req-1/settle').set('x-actor-id', 'bob')
    expect(settled.status).toBe(200)
    expect(settled.body.state).toBe('key_revoked')
    expect((await request(app).post('/requests/req-1/settle')).body.state).toBe('key_revoked')
  })

  it('returns 502 and never settles on chain failure', async () => {
    const adapter = { authorize: async () => ({ keyId: 'k', expiry: 1, revoked: false }), transfer: async () => { throw new Error('reverted') }, revoke: async () => undefined, attack: async () => ({}) }
    const { app } = createApp(undefined, adapter)
    await request(app).post('/requests').set('x-actor-id', 'alice').send(body)
    await request(app).post('/requests/req-1/approve').set('x-actor-id', 'bob').set('x-actor-role', 'finance')
    const result = await request(app).post('/requests/req-1/settle')
    expect(result.status).toBe(502)
    expect(result.body.item.state).toBe('key_revoked')
  })

  it('persists agreement acceptance and blocks provider self-approval', async () => {
    const { app } = createApp()
    const agreement = { id: 'AGR-LIFE-1', clientId: 'alice', providerId: 'vendor', terms: { title: 'Demo' }, milestones: [{ id: 'm1', amountBaseUnits: '100', criteria: 'written approval' }] }
    expect((await request(app).post('/agreements').set('x-actor-id', 'alice').send(agreement)).status).toBe(201)
    expect((await request(app).post('/agreements/AGR-LIFE-1/review').set('x-actor-id', 'alice')).body.state).toBe('awaiting_acceptance')
    await request(app).post('/agreements/AGR-LIFE-1/accept').set('x-actor-id', 'alice').send({ role: 'client', version: 1 })
    const accepted = await request(app).post('/agreements/AGR-LIFE-1/accept').set('x-actor-id', 'vendor').send({ role: 'provider', version: 1 })
    expect(accepted.body.state).toBe('awaiting_funding')
    expect((await request(app).post('/agreements/AGR-LIFE-1/fund').set('x-actor-id', 'alice').send({ mode: 'demo' })).body.state).toBe('in_progress')
    expect((await request(app).post('/agreements/AGR-LIFE-1/submit').set('x-actor-id', 'vendor').send({ milestoneId: 'm1' })).body.state).toBe('milestone_submitted')
    expect((await request(app).post('/agreements/AGR-LIFE-1/approve-milestone').set('x-actor-id', 'vendor').send({ milestoneId: 'm1' })).status).toBe(403)
  })

  it('allows access to seeded agreement in demo mode without login', async () => {
    const previous = process.env.DEMO_MODE
    process.env.DEMO_MODE = 'true'
    try {
      const { app } = createApp()
      const res = await request(app).get('/agreements/DEMO-WEBSITE-001')
      expect(res.status).toBe(200)
      expect(res.body.id).toBe('DEMO-WEBSITE-001')
    } finally {
      if (previous === undefined) delete process.env.DEMO_MODE
      else process.env.DEMO_MODE = previous
    }
  })

  it('provides public user and team listing without authentication', async () => {
    const { app } = createApp()
    const res = await request(app).get('/users')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.users)).toBe(true)
    expect(res.body.users.length).toBeGreaterThan(0)
  })

  it('verifies CORS preflight and headers for 127.0.0.1:5173', async () => {
    const { app } = createApp()
    const preflight = await request(app).options('/agreements').set('Origin', 'http://127.0.0.1:5173')
    expect(preflight.status).toBe(204)
    expect(preflight.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173')
    expect(preflight.headers['access-control-allow-methods']).toContain('POST')

    const getReq = await request(app).get('/requests').set('Origin', 'http://127.0.0.1:5173')
    expect(getReq.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173')
  })

  it('verifies dual routing for /api and / routes', async () => {
    const { app } = createApp()
    const direct = await request(app).get('/requests')
    const prefixed = await request(app).get('/api/requests')
    expect(direct.status).toBe(200)
    expect(prefixed.status).toBe(200)
    expect(prefixed.body).toEqual(direct.body)
  })

  it('verifies 404 response for nonexistent endpoints', async () => {
    const { app } = createApp()
    const res = await request(app).get('/nonexistent-route')
    expect(res.status).toBe(404)
    expect(res.body.error).toContain('Not found')
  })

  it('verifies complete lifecycle without authentication: draft -> review -> accept -> fund -> submit -> approve -> release', async () => {
    const { app } = createApp()
    const clientId = 'client-direct-1'
    const freelancerId = 'provider-direct-1'
    const agreementId = 'AGR-FLOW-101'

    const created = await request(app).post('/agreements').send({
      id: agreementId,
      clientId,
      providerId: freelancerId,
      terms: { title: 'Full flow test' },
      milestones: [{ id: 'm1', amountBaseUnits: '500000', criteria: 'Review passed' }]
    })
    expect(created.status).toBe(201)
    expect(created.body.state).toBe('draft')

    // AI Review
    const reviewed = await request(app).post(`/agreements/${agreementId}/review`).set('x-actor-id', clientId)
    expect(reviewed.status).toBe(200)
    expect(reviewed.body.state).toBe('awaiting_acceptance')

    // Both parties accept
    const clientAccepted = await request(app).post(`/agreements/${agreementId}/accept`).set('x-actor-id', clientId).send({ role: 'client' })
    expect(clientAccepted.status).toBe(200)
    const providerAccepted = await request(app).post(`/agreements/${agreementId}/accept`).set('x-actor-id', freelancerId).send({ role: 'provider' })
    expect(providerAccepted.status).toBe(200)
    expect(providerAccepted.body.state).toBe('awaiting_funding')

    // Client funds demo escrow
    const funded = await request(app).post(`/agreements/${agreementId}/fund`).set('x-actor-id', clientId).send({ mode: 'demo' })
    expect(funded.status).toBe(200)
    expect(funded.body.state).toBe('in_progress')

    // Freelancer submits milestone
    const submitted = await request(app).post(`/agreements/${agreementId}/submit`).set('x-actor-id', freelancerId).send({ milestoneId: 'm1', evidence: ['Proof URL'] })
    expect(submitted.status).toBe(200)
    expect(submitted.body.state).toBe('milestone_submitted')

    // Client approves milestone
    const approved = await request(app).post(`/agreements/${agreementId}/approve-milestone`).set('x-actor-id', clientId).send({ milestoneId: 'm1' })
    expect(approved.status).toBe(200)
    expect(approved.body.state).toBe('awaiting_approval')

    // Client releases milestone
    const released = await request(app).post(`/agreements/${agreementId}/release-milestone`).set('x-actor-id', clientId).send({ milestoneId: 'm1' })
    expect(released.status).toBe(200)
    expect(released.body.state).toBe('completed')
  })
})