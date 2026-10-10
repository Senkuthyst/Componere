import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
const VENDOR = '0x1111111111111111111111111111111111111111'
const TOKEN = '0x20c0000000000000000000000000000000000001'

type Screen = 'request' | 'review' | 'receipt'
type AuditEntry = { from_state: string | null; to_state: string; actor: string; timestamp: string }
type Item = {
  request: { id: string; amountBaseUnits: string; vendorAddress: string; invoiceNumber?: string }
  decision: { decisionHash: string; outcome: string; reasons: { rule: string; message: string }[] }
  state: string
  approvals?: { approverId: string; role: string }[]
  audit?: AuditEntry[]
  settlement?: { txHash: string; recipient: string; amountBaseUnits: string; memo: string; confirmed: boolean }
  mandate?: { expiry: number; revoked: boolean }
}
type AttackResult = { rejected: boolean; error?: string }

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, { headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }, ...init })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

function formatUnits(value: string | bigint) {
  const raw = String(value).replace(/n$/, '').padStart(7, '0')
  const whole = raw.slice(0, -6).replace(/^0+(?=\d)/, '') || '0'
  const fraction = raw.slice(-6).replace(/0+$/, '')
  return `$${whole}${fraction ? `.${fraction}` : ''}`
}

function shortHash(value = '') { return value ? `${value.slice(0, 10)}...${value.slice(-8)}` : 'Awaiting hash' }
function timeLeft(expiry?: number, now = Math.floor(Date.now() / 1000)) { if (!expiry) return '--:--:--'; const seconds = Math.max(0, expiry - now); return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }

function StatusPill({ state }: { state: string }) {
  const positive = ['settled', 'key_revoked', 'approved'].includes(state)
  const waiting = ['requested', 'evaluated', 'awaiting_approval', 'key_authorized', 'settling'].includes(state)
  return <span className={`status-pill ${positive ? 'status-positive' : waiting ? 'status-waiting' : 'status-negative'}`}><span className="status-dot" />{state.replaceAll('_', ' ')}</span>
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('request')
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState<Item | null>(null)
  const [txHash, setTxHash] = useState('')
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null)
  const [attack, setAttack] = useState<Record<string, AttackResult> | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  const refresh = async () => { try { setItems(await api('/requests')) } catch (error) { setMessage((error as Error).message) } }
  useEffect(() => { void refresh(); const poll = window.setInterval(() => void refresh(), 10000); return () => window.clearInterval(poll) }, [])
  useEffect(() => { const clock = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => window.clearInterval(clock) }, [])

  const openItem = async (item: Item) => { try { setSelected(await api(`/requests/${item.request.id}`)); setScreen('review'); setMessage('') } catch (error) { setMessage((error as Error).message) } }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage('')
    const data = new FormData(event.currentTarget)
    try { const item = await api('/requests', { method: 'POST', headers: { 'x-actor-id': 'alice' }, body: JSON.stringify({ id: `req-${Date.now()}`, requesterId: 'alice', vendorAddress: VENDOR, vendorId: 'vendor-demo', amountBaseUnits: data.get('amountBaseUnits'), tokenAddress: TOKEN, network: 'tempo-moderato', invoiceNumber: data.get('invoiceNumber'), invoiceDate: new Date().toISOString().slice(0, 10), poNumber: data.get('poNumber'), poAmountBaseUnits: data.get('amountBaseUnits'), evidence: [{ kind: 'invoice', hash: `0x${'aa'.repeat(32)}` }] }) }); setSelected(item); setScreen('review'); await refresh() } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  const mutateSelected = async (path: string, init: RequestInit, nextScreen?: Screen) => { if (!selected) return; setBusy(true); setMessage(''); try { const item = await api(path, init); setSelected(item); if (nextScreen) setScreen(nextScreen); await refresh() } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) } }
  const approve = () => mutateSelected(`/requests/${selected?.request.id}/approve`, { method: 'POST', headers: { 'x-actor-id': 'bob', 'x-actor-role': 'finance' } })
  const settle = async () => { if (!selected) return; setBusy(true); try { const item = await api(`/requests/${selected.request.id}/settle`, { method: 'POST', headers: { 'x-actor-id': 'bob' } }); setSelected(item); setTxHash(item.settlement?.txHash ?? ''); setScreen('receipt'); await refresh() } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) } }
  const verify = async (event: FormEvent) => { event.preventDefault(); setBusy(true); try { setReceipt(await api(`/receipts/${txHash}`)); setMessage('Receipt confirmed on Tempo testnet.') } catch (error) { setReceipt(null); setMessage((error as Error).message) } finally { setBusy(false) } }
  const runAttack = async () => { if (!selected) return; setBusy(true); try { setAttack(await api('/demo/attack', { method: 'POST', body: JSON.stringify({ id: selected.request.id }) })) } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) } }
  const download = () => { if (!receipt) return; const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' })); link.download = `${txHash || 'componere-receipt'}.json`; link.click(); URL.revokeObjectURL(link.href) }
  const stats = useMemo(() => ({ total: items.length, pending: items.filter(item => ['awaiting_approval', 'approved', 'settling'].includes(item.state)).length, settled: items.filter(item => ['settled', 'key_revoked'].includes(item.state)).length }), [items])

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">C</div><div><p className="eyebrow">COM PONERE / TEMPO TRACK</p><h1>Settlement studio</h1></div></div><div className="topbar-actions"><span className="network-badge"><span className="live-dot" /> Moderato testnet</span><span className="actor-chip"><span className="avatar">A</span> Alice / requester</span></div></header>
    <div className="layout">
      <aside className="sidebar"><div className="sidebar-label">Workspace</div><nav>{([['request', '01', 'New request'], ['review', '02', 'Review queue'], ['receipt', '03', 'Verify receipt']] as [Screen, string, string][]).map(([value, number, label]) => <button className={`nav-item ${screen === value ? 'nav-active' : ''}`} key={value} onClick={() => setScreen(value)}><span className="nav-number">{number}</span><span>{label}</span>{value === 'review' && stats.pending > 0 && <b className="nav-count">{stats.pending}</b>}</button>)}</nav><div className="sidebar-footer"><div className="guardrail-mini"><span className="mini-shield">+</span><div><b>Bounded blast radius</b><small>Policy guardrails active</small></div></div><p className="sidebar-footnote">v2.0.0 · Testnet build</p></div></aside>
      <main className="workspace">
        <div className="workspace-head"><div><p className="eyebrow">{screen === 'request' ? 'Payment intake' : screen === 'review' ? 'Approval control' : 'Public verification'}</p><h2>{screen === 'request' ? 'Create a settlement mandate' : screen === 'review' ? 'Review & authorize' : 'Verify a receipt'}</h2></div><div className="sync-state"><span className="sync-dot" /> Live sync</div></div>
        {message && <div className={`toast ${message.includes('confirmed') ? 'toast-good' : ''}`}><span>{message.includes('confirmed') ? '✓' : '!'}</span>{message}</div>}
        {screen === 'request' && <RequestView submit={submit} busy={busy} />}
        {screen === 'review' && <ReviewView selected={selected} now={now} busy={busy} approve={approve} settle={settle} runAttack={runAttack} attack={attack} />}
        {screen === 'receipt' && <ReceiptView txHash={txHash} setTxHash={setTxHash} verify={verify} receipt={receipt} download={download} busy={busy} />}
      </main>
      <aside className="right-rail"><div className="rail-section"><div className="rail-title"><span>Activity</span><button onClick={() => void refresh()}>↻</button></div><div className="metric-grid"><div><strong>{stats.total}</strong><small>Total</small></div><div><strong>{stats.pending}</strong><small>Pending</small></div><div><strong>{stats.settled}</strong><small>Settled</small></div></div><div className="activity-list">{items.length ? items.slice().reverse().map(item => <button className="activity-item" key={item.request.id} onClick={() => void openItem(item)}><span className="activity-icon">{item.state === 'key_revoked' ? '✓' : '↗'}</span><span className="activity-copy"><b>{item.request.invoiceNumber || item.request.id}</b><small>{item.request.id} · {formatUnits(item.request.amountBaseUnits)}</small></span><StatusPill state={item.state} /></button>) : <div className="empty-activity"><span>◌</span><p>No requests yet</p><small>Your settlement activity will appear here.</small></div>}</div></div><div className="rail-section guardrail-panel"><div className="rail-title"><span>Mandate guardrails</span></div><div className="guardrail-row"><span>Recipient lock</span><b>{VENDOR.slice(0, 7)}...{VENDOR.slice(-5)}</b></div><div className="guardrail-row"><span>Budget mode</span><b>One-time · 4,500 USD max</b></div><div className="guardrail-row"><span>Function scope</span><b>transferWithMemo</b></div><div className="guardrail-row"><span>Key expiry</span><b>24 hours</b></div></div></aside>
    </div>
  </div>
}

function RequestView({ submit, busy }: { submit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  return <div className="request-grid"><section className="intro-copy"><span className="section-index">01 / REQUEST</span><h3>Turn an invoice into a permission.</h3><p>The policy engine evaluates evidence and quorum before a single-use Tempo access key can exist.</p><div className="intro-stat"><strong>01</strong><span>approval becomes<br /><b>chain-enforced</b></span></div></section><form onSubmit={submit} className="form-panel"><div className="panel-heading"><div><span className="panel-kicker">Payment details</span><h3>New request</h3></div><span className="draft-pill">Draft</span></div><label><span className="field-label">Invoice reference</span><input name="invoiceNumber" defaultValue="INV-DEMO-001" required /><span className="field-help">The invoice number becomes part of the decision hash.</span></label><div className="field-row"><label><span className="field-label">Purchase order</span><input name="poNumber" defaultValue="PO-DEMO-001" required /></label><label><span className="field-label">Amount · base units</span><input name="amountBaseUnits" inputMode="numeric" defaultValue="1000000" required /></label></div><div className="scope-card"><div className="scope-card-head"><span className="scope-icon">⌁</span><span><b>Pre-scoped payment</b><small>Recipient and token are policy controlled</small></span><span className="verified">Verified</span></div><div className="scope-detail"><span>Vendor wallet</span><b>{VENDOR.slice(0, 10)}...{VENDOR.slice(-8)}</b></div><div className="scope-detail"><span>Token</span><b>AlphaUSD <em>6 decimals</em></b></div></div><button className="primary-action" disabled={busy}>{busy ? 'Evaluating policy...' : 'Evaluate request'}<span>→</span></button></form></div>
}

function ReviewView({ selected, now, busy, approve, settle, runAttack, attack }: { selected: Item | null; now: number; busy: boolean; approve: () => void; settle: () => void; runAttack: () => void; attack: Record<string, AttackResult> | null }) {
  if (!selected) return <div className="blank-state"><span>02</span><h3>Select a request to review</h3><p>Submit a payment request or choose one from activity.</p></div>
  const checks = [['Vendor allowlist', 'Vendor wallet matches policy scope'], ['Per-payment cap', `${formatUnits(selected.request.amountBaseUnits)} is within the 4,500 USD limit`], ['Evidence attached', 'Invoice evidence hash present'], ['Separation of duties', 'Requester and approver are different identities']]
  return <div className="review-view"><div className="review-summary"><div><span className="section-index">02 / REVIEW QUEUE</span><h3>{selected.request.invoiceNumber || selected.request.id}</h3><p>{selected.request.id} · requested by Alice · {formatUnits(selected.request.amountBaseUnits)}</p></div><StatusPill state={selected.state} /></div><div className="decision-banner"><span className="decision-check">✓</span><div><b>{selected.decision.outcome === 'block' ? 'Policy blocked' : selected.state === 'approved' || selected.state === 'key_revoked' ? 'Approved decision' : 'Approval required'}</b><p>{selected.decision.reasons.length ? selected.decision.reasons.map(reason => reason.message).join(' ') : 'All policy checks passed. One finance approval is required.'}</p></div></div><div className="review-columns"><div className="check-list"><div className="subheading">Policy checks <span>4 / 4 passed</span></div>{checks.map(([name, detail]) => <div className="check-row" key={name}><span className="check-icon">✓</span><span><b>{name}</b><small>{detail}</small></span></div>)}<div className="hash-block"><span>Canonical decision hash</span><b title={selected.decision.decisionHash}>{shortHash(selected.decision.decisionHash)}</b><button onClick={() => navigator.clipboard?.writeText(selected.decision.decisionHash)}>Copy</button></div></div><div className="control-card"><div className="subheading">Approval control</div><div className="approval-person"><span className="avatar avatar-bob">B</span><span><b>Bob Chen</b><small>Finance approver · required</small></span><span className={selected.approvals?.length ? 'approval-done' : 'approval-pending'}>{selected.approvals?.length ? 'Approved' : 'Pending'}</span></div><div className="expiry-box"><span>Ephemeral key window</span><strong>{timeLeft(selected.mandate?.expiry, now)}</strong><small>24h after authorization · non-replenishing</small></div><div className="control-actions">{selected.state === 'awaiting_approval' && <button className="primary-action" onClick={approve} disabled={busy}>{busy ? 'Approving...' : 'Approve mandate'}<span>→</span></button>}{selected.state === 'approved' && <button className="primary-action" onClick={settle} disabled={busy}>{busy ? 'Settling...' : 'Authorize & settle'}<span>→</span></button>}{selected.mandate && <button className="secondary-action" onClick={runAttack} disabled={busy}>Run attack scene <span>↗</span></button>}</div></div></div>{attack && <div className="attack-panel"><div className="subheading">Attack scene <span>All attempts rejected</span></div><div className="attack-grid">{Object.entries(attack).map(([name, result]) => <div className="attack-result" key={name}><span className="attack-x">×</span><div><b>{name.replace(/([A-Z])/g, ' $1')}</b><small>{result.error || 'Rejected by Tempo'}</small></div></div>)}</div></div>}<div className="audit-line"><span>Audit timeline</span><b>{selected.audit?.length ?? 0} transitions recorded</b></div></div>
}

function ReceiptView({ txHash, setTxHash, verify, receipt, download, busy }: { txHash: string; setTxHash: (value: string) => void; verify: (event: FormEvent) => void; receipt: Record<string, unknown> | null; download: () => void; busy: boolean }) {
  return <div className="receipt-view"><div className="receipt-intro"><span className="section-index">03 / VERIFIER</span><h3>Proof, not a promise.</h3><p>Anyone can verify a Componere settlement against its on-chain receipt bundle.</p></div><form onSubmit={verify} className="verify-form"><span className="field-label">Tempo transaction hash</span><div className="verify-input"><input value={txHash} onChange={event => setTxHash(event.target.value)} placeholder="0x..." required /><button disabled={busy}>{busy ? 'Checking' : 'Verify'} <span>↗</span></button></div></form>{receipt ? <div className="receipt-card"><div className="receipt-card-head"><div className="success-seal">✓</div><div><span className="section-index">VERIFIED ON TEMPO</span><h4>Settlement confirmed</h4></div><button className="download-button" onClick={download}>Download JSON</button></div><div className="receipt-grid"><div><span>Recipient</span><b>{shortHash(String(receipt.recipient))}</b></div><div><span>Amount</span><b>{formatUnits(String(receipt.amountBaseUnits))}</b></div><div><span>Decision memo</span><b>{shortHash(String(receipt.memo))}</b></div><div><span>Confirmation</span><b className="text-green">Successful</b></div></div></div> : <div className="receipt-empty"><span>⌁</span><b>Waiting for a transaction hash</b><small>Paste a confirmed Tempo transaction above to inspect its recipient, amount, and decision memo.</small></div>}</div>
}
