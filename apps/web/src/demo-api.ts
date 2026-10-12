import { randomBytes } from 'node:crypto'

export type DemoRole = 'client' | 'freelancer'
export type DemoSession = {
  token: string
  user: { id: string; email: string; displayName: string; role: DemoRole; organizationId: string }
}

type DemoUser = DemoSession['user']
type DemoAgreement = {
  id: string
  organizationId: string
  clientId: string
  providerId: string
  state: string
  currentVersion: number
  revisions: { version: number; canonicalHash: string; createdBy: string; createdAt: string; terms: { title?: string; label?: string; description?: string } }[]
  acceptances: { version: number; actorId: string; role: 'client' | 'provider'; acceptedAt: string }[]
  milestones: { id: string; amountBaseUnits: string; status: 'upcoming' | 'submitted' | 'approved' | 'released' | 'rejected'; submittedBy?: string; evidence?: string[] }[]
  events?: Array<{ id: string; actorId: string; type: string; at: string; note?: string }>
}

const USERS_KEY = 'componere-demo-users'
const AGREEMENTS_KEY = 'componere-demo-agreements'
const SESSION_KEY = 'componere-session'
const demoPassword = 'ComponereDemo2026!'

const defaultUsers: DemoUser[] = [
  { id: 'demo-client', email: 'client.demo@example.com', displayName: 'Demo Client', role: 'client', organizationId: 'org-demo' },
  { id: 'demo-freelancer', email: 'freelancer.demo@example.com', displayName: 'Demo Freelancer', role: 'freelancer', organizationId: 'org-demo' },
]

const defaultAgreement: DemoAgreement = {
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
    { id: 'ui-design', amountBaseUnits: '150000000', status: 'upcoming', evidence: ['Approved Figma screens and responsive states'] },
    { id: 'frontend-development', amountBaseUnits: '200000000', status: 'upcoming', evidence: ['Working frontend implementation and test URL'] },
    { id: 'final-delivery', amountBaseUnits: '150000000', status: 'upcoming', evidence: ['Production handoff, source archive, and QA notes'] },
  ],
  events: [{ id: 'seed-01', actorId: 'system', type: 'seeded:DEMO_DATA', at: '2026-10-01T00:00:00.000Z', note: 'Demo seed created' }],
}

function safeRead<T>(key: string, fallback: T): T {
  const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null
  try {
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function persistUsers(users: DemoUser[]) {
  if (typeof window !== 'undefined') localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function persistAgreements(agreements: DemoAgreement[]) {
  if (typeof window !== 'undefined') localStorage.setItem(AGREEMENTS_KEY, JSON.stringify(agreements))
}

function ensureDemoState() {
  if (typeof window === 'undefined') return

  const users = safeRead<DemoUser[]>(USERS_KEY, defaultUsers)
  if (!users.length) persistUsers(defaultUsers)
  else if (!users.some(user => user.email === 'client.demo@example.com')) persistUsers([...defaultUsers, ...users])

  const agreements = safeRead<DemoAgreement[]>(AGREEMENTS_KEY, [defaultAgreement])
  if (!agreements.length) persistAgreements([defaultAgreement])
}

export function readSession(): DemoSession | null {
  try {
    const value = typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null
    return value ? (JSON.parse(value) as DemoSession | null) : null
  } catch {
    return null
  }
}

function writeSession(session: DemoSession | null) {
  if (typeof window !== 'undefined') {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  }
}

function getUsers(): DemoUser[] {
  ensureDemoState()
  return safeRead<DemoUser[]>(USERS_KEY, defaultUsers)
}

function getAgreements(): DemoAgreement[] {
  ensureDemoState()
  return safeRead<DemoAgreement[]>(AGREEMENTS_KEY, [defaultAgreement])
}

function findUserByEmail(email: string) {
  return getUsers().find(user => user.email.toLowerCase() === email.trim().toLowerCase())
}

function createToken() {
  return `demo-${randomBytes(16).toString('hex')}`
}

function cloneAgreement(agreement: DemoAgreement): DemoAgreement {
  return JSON.parse(JSON.stringify(agreement)) as DemoAgreement
}

function getAuthenticatedUser(request: RequestInit): DemoUser | undefined {
  const auth = request.headers && 'Authorization' in request.headers ? String((request.headers as Record<string, unknown>).Authorization ?? '') : ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return undefined
  const session = readSession()
  return session && session.token === token ? session.user : undefined
}

function upsertAgreement(updated: DemoAgreement) {
  const agreements = getAgreements()
  const index = agreements.findIndex(item => item.id === updated.id)
  if (index >= 0) agreements[index] = updated
  else agreements.push(updated)
  persistAgreements(agreements)
  return updated
}

export async function demoApiRequest<T>(path: string, init: RequestInit = {}, session = readSession()): Promise<T> {
  ensureDemoState()

  const method = (init.method ?? 'GET').toUpperCase()
  const body = init.body ? JSON.parse(String(init.body)) : undefined

  if (path === '/auth/demo-login') {
    const role = body?.role as DemoRole
    if (role !== 'client' && role !== 'freelancer') throw new Error('Choose a valid demo role.')
    const user = getUsers().find(item => item.role === role)
    if (!user) throw new Error('Demo account is unavailable.')
    const token = createToken()
    const nextSession: DemoSession = { token, user }
    writeSession(nextSession)
    return { user, token } as T
  }

  if (path === '/auth/register') {
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    const displayName = String(body?.displayName ?? '').trim()
    const role = body?.role as DemoRole
    if (!email.includes('@') || password.length < 12 || displayName.length < 2 || (role !== 'client' && role !== 'freelancer')) {
      throw new Error('Email, display name, and a password of at least 12 characters are required.')
    }
    const existing = findUserByEmail(email)
    if (existing) throw new Error('Account already exists.')
    const user = { id: `user-${randomBytes(12).toString('hex')}`, email, displayName, role, organizationId: `org-${Math.random().toString(36).slice(2, 9)}` }
    const users = getUsers()
    users.push(user)
    persistUsers(users)
    const token = createToken()
    const nextSession: DemoSession = { token, user }
    writeSession(nextSession)
    return { user, token } as T
  }

  if (path === '/auth/login') {
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    const user = findUserByEmail(email)
    if (!user || password !== demoPassword) {
      throw new Error('Invalid email or password.')
    }
    const token = createToken()
    const nextSession: DemoSession = { token, user }
    writeSession(nextSession)
    return { user, token } as T
  }

  if (path === '/auth/logout') {
    writeSession(null)
    return undefined as T
  }

  if (path === '/auth/me') {
    return { user: session?.user ?? null, demoMode: true } as T
  }

  if (path === '/auth/users') {
    const requester = session?.user ?? readSession()?.user
    if (!requester) throw new Error('Authentication required.')
    const users = getUsers().filter(user => user.organizationId === requester.organizationId)
    return { users } as T
  }

  if (path === '/agreements' && method === 'GET') {
    return getAgreements() as T
  }

  if (path === '/agreements' && method === 'POST') {
    const requester = session?.user ?? readSession()?.user
    if (!requester) throw new Error('Authentication required.')
    const payload = (body ?? {}) as { id?: string; clientId?: string; providerId?: string; title?: string; description?: string }
    const id = String(payload.id ?? `AGR-${Date.now()}`)
    const agreement: DemoAgreement = {
      id,
      organizationId: requester.organizationId,
      clientId: payload.clientId ?? requester.id,
      providerId: payload.providerId ?? 'demo-freelancer',
      state: 'draft',
      currentVersion: 1,
      revisions: [{
        version: 1,
        canonicalHash: `0x${'ee'.repeat(32)}`,
        createdBy: requester.id,
        createdAt: new Date().toISOString(),
        terms: { title: payload.title ?? 'New agreement', label: 'DRAFT', description: payload.description ?? 'Draft agreement created in demo mode.' },
      }],
      acceptances: [],
      milestones: [{ id: 'm1', amountBaseUnits: '100000000', status: 'upcoming', evidence: [] }],
      events: [{ id: `event-${Date.now()}`, actorId: requester.id, type: 'created', at: new Date().toISOString(), note: 'Created in demo mode' }],
    }
    upsertAgreement(agreement)
    return agreement as T
  }

  if (path.startsWith('/agreements/') && method === 'GET') {
    const agreementId = path.split('/').slice(2).join('/')
    const item = getAgreements().find(item => item.id === agreementId)
    if (!item) throw new Error('not found')
    return { ...item, events: item.events ?? [] } as T
  }

  if (path.startsWith('/agreements/') && method === 'POST') {
    const agreementId = path.split('/')[2]
    const action = path.split('/')[3]
    const agreements = getAgreements()
    const index = agreements.findIndex(item => item.id === agreementId)
    if (index < 0) throw new Error('not found')

    const agreement = cloneAgreement(agreements[index])
    if (action === 'review') {
      agreement.state = 'accepted'
      agreement.events = [{ id: `event-${Date.now()}`, actorId: 'system', type: 'reviewed', at: new Date().toISOString() }, ...(agreement.events ?? [])]
    }
    if (action === 'accept') {
      agreement.state = 'awaiting_funding'
      agreement.acceptances.push({ version: agreement.currentVersion, actorId: String((body ?? {}).actorId ?? session?.user?.id ?? 'demo-client'), role: (body ?? {}).role === 'provider' ? 'provider' : 'client', acceptedAt: new Date().toISOString() })
    }
    if (action === 'fund') {
      agreement.state = 'funded'
    }
    if (action === 'submit') {
      agreement.state = 'in_progress'
      const milestoneId = String((body ?? {}).milestoneId ?? agreement.milestones[0]?.id ?? 'm1')
      agreement.milestones = agreement.milestones.map(item => item.id === milestoneId ? { ...item, status: 'submitted', submittedBy: session?.user?.id ?? 'demo-freelancer' } : item)
    }
    if (action === 'approve-milestone') {
      agreement.state = 'awaiting_approval'
      const milestoneId = String((body ?? {}).milestoneId ?? agreement.milestones[0]?.id ?? 'm1')
      agreement.milestones = agreement.milestones.map(item => item.id === milestoneId ? { ...item, status: 'approved' } : item)
    }
    if (action === 'release-milestone') {
      agreement.state = 'completed'
      const milestoneId = String((body ?? {}).milestoneId ?? agreement.milestones[0]?.id ?? 'm1')
      agreement.milestones = agreement.milestones.map(item => item.id === milestoneId ? { ...item, status: 'released' } : item)
    }

    agreements[index] = agreement
    persistAgreements(agreements)
    return agreement as T
  }

  if (path === '/requests' && method === 'GET') {
    return [] as T
  }

  if (path === '/auth/demo-login' && method === 'POST') {
    return { user: session?.user, token: session?.token ?? createToken() } as T
  }

  return {} as T
}

export function isDemoModeEnabled() {
  if (typeof window === 'undefined') return false
  return String(import.meta.env.VITE_DEMO_MODE ?? '').toLowerCase() === 'true' || !String(import.meta.env.VITE_API_URL ?? '')
}

export function getDemoPassword() {
  return demoPassword
}

export function listDemoUsers() {
  return getUsers()
}

export function createDemoAgreementSeed() {
  ensureDemoState()
  return getAgreements()[0] ?? defaultAgreement
}
