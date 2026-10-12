import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Request } from 'express'

export type DemoRole = 'client' | 'freelancer'
export type AuthUser = { id: string; email: string; displayName: string; role: DemoRole; organizationId: string }

const demoPassword = process.env.DEMO_PASSWORD ?? 'ComponereDemo2026!'
const users: AuthUser[] = [
  { id: 'demo-client', email: 'client.demo@example.com', displayName: 'Demo Client', role: 'client', organizationId: 'org-demo' },
  { id: 'demo-freelancer', email: 'freelancer.demo@example.com', displayName: 'Demo Freelancer', role: 'freelancer', organizationId: 'org-demo' },
]

const hashPassword = (password: string, salt: Buffer) => scryptSync(password, salt, 32)
const toUser = (row: { id: string; email: string; display_name: string; role: string; organization_id: string }): AuthUser | undefined =>
  row.role === 'client' || row.role === 'freelancer'
    ? { id: row.id, email: row.email, displayName: row.display_name, role: row.role, organizationId: row.organization_id }
    : undefined
const sessionToken = (db: Database.Database, userId: string) => {
  const token = randomBytes(32).toString('hex')
  const tokenHash = scryptSync(token, 'componere-session', 32).toString('hex')
  db.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString())
  return token
}

export class AuthStore {
  constructor(private readonly db: Database.Database) {
    this.db.exec('CREATE TABLE IF NOT EXISTS auth_users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL, organization_id TEXT NOT NULL, password_salt BLOB NOT NULL, password_hash BLOB NOT NULL); CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)')
  }

  provisionDemoUsers() {
    const salt = Buffer.from('componere-demo-salt-v1')
    const passwordHash = hashPassword(demoPassword, salt)
    const statement = this.db.prepare('INSERT OR IGNORE INTO auth_users (id, email, display_name, role, organization_id, password_salt, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const user of users) statement.run(user.id, user.email, user.displayName, user.role, user.organizationId, salt, passwordHash)
  }

  register(input: { email: string; password: string; displayName: string; role: DemoRole; organizationId?: string }): { user: AuthUser; token: string } {
    const email = input.email.trim().toLowerCase()
    if (!email.includes('@') || input.password.length < 12 || input.displayName.trim().length < 2) throw new Error('Email, display name, and a password of at least 12 characters are required.')
    const id = `user-${randomBytes(12).toString('hex')}`
    const salt = randomBytes(16)
    const passwordHash = hashPassword(input.password, salt)
    const demoMode = process.env.DEMO_MODE === 'true'
    const orgId = input.organizationId ?? (demoMode ? 'org-demo' : `org-${id}`)
    this.db.prepare('INSERT INTO auth_users (id, email, display_name, role, organization_id, password_salt, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, email, input.displayName.trim(), input.role, orgId, salt, passwordHash)
    const user = { id, email, display_name: input.displayName.trim(), role: input.role, organization_id: orgId }
    const mapped = toUser(user)
    if (!mapped) throw new Error('Unable to create the requested account role.')
    return { user: mapped, token: sessionToken(this.db, id) }
  }

  login(email: string, password: string): { user: AuthUser; token: string } | undefined {
    const row = this.db.prepare('SELECT id, email, display_name, role, organization_id, password_salt, password_hash FROM auth_users WHERE email = ?').get(email.trim().toLowerCase()) as ({ password_salt: Buffer; password_hash: Buffer; id: string; email: string; display_name: string; role: string; organization_id: string }) | undefined
    if (!row) return undefined
    const actual = hashPassword(password, row.password_salt)
    if (actual.length !== row.password_hash.length || !timingSafeEqual(actual, row.password_hash)) return undefined
    const user = toUser(row)
    return user ? { user, token: sessionToken(this.db, user.id) } : undefined
  }

  loginDemo(role: DemoRole, password = demoPassword): { user: AuthUser; token: string } | undefined {
    const user = users.find(item => item.role === role)
    return user ? this.login(user.email, password) : undefined
  }

  logout(request: Request) {
    const value = request.header('authorization')
    const match = value?.match(/^Bearer\s+(.+)$/i)
    if (match?.[1]) {
      const tokenHash = scryptSync(match[1].trim(), 'componere-session', 32).toString('hex')
      this.db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash)
    }
  }

  usersInOrganization(organizationId: string, role: DemoRole) {
    const inOrg = (this.db.prepare('SELECT id, email, display_name, role, organization_id FROM auth_users WHERE organization_id = ? AND role = ? ORDER BY display_name').all(organizationId, role) as { id: string; email: string; display_name: string; role: string; organization_id: string }[]).map(toUser).filter((user): user is AuthUser => Boolean(user))
    if (inOrg.length > 0) return inOrg
    return (this.db.prepare('SELECT id, email, display_name, role, organization_id FROM auth_users WHERE role = ? ORDER BY display_name').all(role) as { id: string; email: string; display_name: string; role: string; organization_id: string }[]).map(toUser).filter((user): user is AuthUser => Boolean(user))
  }

  userFromRequest(request: Request): AuthUser | undefined {
    const value = request.header('authorization')
    const match = value?.match(/^Bearer\s+(.+)$/i)
    if (!match?.[1]) return undefined
    const tokenHash = scryptSync(match[1].trim(), 'componere-session', 32).toString('hex')
    const row = this.db.prepare('SELECT auth_users.id, auth_users.email, auth_users.display_name, auth_users.role, auth_users.organization_id FROM auth_sessions JOIN auth_users ON auth_users.id = auth_sessions.user_id WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > ?').get(tokenHash, new Date().toISOString()) as { id: string; email: string; display_name: string; role: string; organization_id: string } | undefined
    return row ? toUser(row) : undefined
  }
}

export const demoUsers = users.map(({ id, email, displayName, role, organizationId }) => ({ id, email, displayName, role, organizationId }))
