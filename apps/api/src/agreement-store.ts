import Database from 'better-sqlite3'
import type { Agreement } from '../../../packages/agreement-core/src/index.js'

const encode = (value: unknown) => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? `${item}n` : item)
const decode = (value: string) => JSON.parse(value, (_, item) => typeof item === 'string' && /^-?\d+n$/.test(item) ? BigInt(item.slice(0, -1)) : item) as Agreement
type Row = { payload: string }

export class AgreementStore {
  constructor(private readonly db: Database.Database) { this.db.exec('CREATE TABLE IF NOT EXISTS agreements (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS agreement_events (id INTEGER PRIMARY KEY AUTOINCREMENT, agreement_id TEXT NOT NULL, event TEXT NOT NULL, actor_id TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL)') }
  save(agreement: Agreement) { this.db.prepare('INSERT OR REPLACE INTO agreements (id, organization_id, payload, updated_at) VALUES (?, ?, ?, ?)').run(agreement.id, agreement.organizationId, encode(agreement), new Date().toISOString()) }
  getById(id: string): Agreement | undefined { const row = this.db.prepare('SELECT payload FROM agreements WHERE id = ?').get(id) as Row | undefined; return row ? decode(row.payload) : undefined }
  get(id: string, organizationId?: string): Agreement | undefined { if (!organizationId) return this.getById(id); const row = this.db.prepare('SELECT payload FROM agreements WHERE id = ? AND organization_id = ?').get(id, organizationId) as Row | undefined; return row ? decode(row.payload) : undefined }
  all(organizationId: string): Agreement[] { return (this.db.prepare('SELECT payload FROM agreements WHERE organization_id = ? ORDER BY updated_at DESC').all(organizationId) as Row[]).map(row => decode(row.payload)) }
  allForUser(organizationId: string, userId?: string): Agreement[] { const allRows = (this.db.prepare('SELECT payload FROM agreements ORDER BY updated_at DESC').all() as Row[]).map(row => decode(row.payload)); return allRows.filter(item => item.organizationId === organizationId || (Boolean(userId) && (item.clientId === userId || item.providerId === userId))) }
  event(agreement: Agreement, event: string, actorId: string) { this.db.prepare('INSERT INTO agreement_events (agreement_id, event, actor_id, version, created_at) VALUES (?, ?, ?, ?, ?)').run(agreement.id, event, actorId, agreement.currentVersion, new Date().toISOString()) }
  events(id: string) { return this.db.prepare('SELECT * FROM agreement_events WHERE agreement_id = ? ORDER BY id').all(id) }
}