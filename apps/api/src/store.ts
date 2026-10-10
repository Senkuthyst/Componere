import Database from 'better-sqlite3'
import type { Decision, PaymentRequest } from '@componere/policy-engine'
import type { Mandate, Settlement } from './tempo-adapter'
import type { RequestState } from './state'
export type StoredRequest = { request: PaymentRequest; decision: Decision; state: RequestState; approvals: { approverId: string; role: string }[]; mandate?: Mandate; settlement?: Settlement }
type Row = { payload: string }
const revive = (payload: string) => JSON.parse(payload, (_, item) => typeof item === 'string' && /^-?\d+n$/.test(item) ? BigInt(item.slice(0, -1)) : item) as StoredRequest
const serialize = (value: unknown) => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? `${item}n` : item)
export class Store {
  readonly db: Database.Database
  constructor(filename = ':memory:') { this.db = new Database(filename); this.db.exec('CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL, from_state TEXT, to_state TEXT NOT NULL, actor TEXT NOT NULL, timestamp TEXT NOT NULL, policy_version TEXT NOT NULL, decision_hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipts (tx_hash TEXT PRIMARY KEY, request_id TEXT NOT NULL, payload TEXT NOT NULL)') }
  save(value: StoredRequest) { this.db.prepare('INSERT OR REPLACE INTO requests (id, payload, state) VALUES (?, ?, ?)').run(value.request.id, serialize(value), value.state) }
  get(id: string): StoredRequest | undefined { const row = this.db.prepare('SELECT payload FROM requests WHERE id = ?').get(id) as Row | undefined; return row ? revive(row.payload) : undefined }
  all(): StoredRequest[] { return (this.db.prepare('SELECT payload FROM requests ORDER BY id').all() as Row[]).map(row => revive(row.payload)) }
  audit(requestId: string, from: RequestState | null, to: RequestState, actor: string, policyVersion: string, decisionHash: string) { this.db.prepare('INSERT INTO audit_log (request_id, from_state, to_state, actor, timestamp, policy_version, decision_hash) VALUES (?, ?, ?, ?, ?, ?, ?)').run(requestId, from, to, actor, new Date().toISOString(), policyVersion, decisionHash) }
  auditFor(requestId: string) { return this.db.prepare('SELECT * FROM audit_log WHERE request_id = ? ORDER BY id').all(requestId) }
  receipt(txHash: string) { const row = this.db.prepare('SELECT payload FROM receipts WHERE tx_hash = ?').get(txHash) as Row | undefined; return row ? JSON.parse(row.payload, (_, item) => typeof item === 'string' && /^-?\d+n$/.test(item) ? BigInt(item.slice(0, -1)) : item) : undefined }
  saveReceipt(txHash: string, requestId: string, settlement: Settlement) { this.db.prepare('INSERT OR REPLACE INTO receipts (tx_hash, request_id, payload) VALUES (?, ?, ?)').run(txHash, requestId, serialize(settlement)) }
}