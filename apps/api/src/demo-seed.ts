import type { Agreement } from '../../../packages/agreement-core/src/index.js'
import { AgreementStore } from './agreement-store.js'

const demoAgreement: Agreement = {
  id: 'DEMO-WEBSITE-001',
  organizationId: 'org-demo',
  clientId: 'demo-client',
  providerId: 'demo-freelancer',
  state: 'awaiting_funding',
  currentVersion: 1,
  revisions: [{
    version: 1,
    canonicalHash: `0x${'de'.repeat(32)}`,
    createdBy: 'demo-client',
    createdAt: '2026-10-01T00:00:00.000Z',
    terms: { title: 'Website Development', label: 'DEMO DATA', description: 'A simulated website build for the Componere guided demo.' },
  }],
  acceptances: [
    { version: 1, actorId: 'demo-client', role: 'client', acceptedAt: '2026-10-01T00:00:00.000Z' },
    { version: 1, actorId: 'demo-freelancer', role: 'provider', acceptedAt: '2026-10-01T00:05:00.000Z' },
  ],
  milestones: [
    { id: 'ui-design', amountBaseUnits: 150_000_000n, status: 'upcoming', evidence: ['Approved Figma screens and responsive states'] },
    { id: 'frontend-development', amountBaseUnits: 200_000_000n, status: 'upcoming', evidence: ['Working frontend implementation and test URL'] },
    { id: 'final-delivery', amountBaseUnits: 150_000_000n, status: 'upcoming', evidence: ['Production handoff, source archive, and QA notes'] },
  ],
}

export function seedDemoAgreement(store: AgreementStore) {
  if (!store.get(demoAgreement.id, demoAgreement.organizationId)) {
    store.save(demoAgreement)
    store.event(demoAgreement, 'seeded:DEMO_DATA', 'system')
  }
}
