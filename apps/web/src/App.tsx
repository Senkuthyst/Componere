import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'
import { SolanaWalletPanel } from './solana/SolanaWalletPanel'
import type { ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, BarChart3, Bell, Check, ChevronDown, CircleHelp, ClipboardCheck, Clock3, FilePlus2, FileText, Fingerprint, Globe2, LayoutDashboard, LockKeyhole, Menu, MoreHorizontal, Plus, Search, Settings as SettingsIcon, ShieldCheck, Sparkles, Users, Wallet } from 'lucide-react'
import { AnimatedMilestoneTimeline, EscrowFlowAnimation, PageTransition } from './components/Motion'
import { RenderRecovery } from './components/RenderRecovery'
import SceneFallback from './components/SceneFallback'
const EscrowHeroScene = lazy(() => import('./components/EscrowHeroScene'))

type Milestone = { id: string; title: string; amount: number; due: string; status: 'upcoming' | 'submitted' | 'released'; criteria: string }
export type Agreement = { id: string; title: string; counterparty: string; initials: string; amount: number; status: 'draft' | 'active' | 'funded' | 'completed'; updated: string; description: string; milestones: Milestone[] }
const initialAgreements: Agreement[] = [{ id: 'AGR-1048', title: 'Nimbus product design system', counterparty: 'Northstar Labs', initials: 'NL', amount: 32000, status: 'funded', updated: '2h ago', description: 'Design and document the Nimbus enterprise design system across web and mobile.', milestones: [{ id: 'm1', title: 'Discovery & direction', amount: 8000, due: 'Oct 18, 2026', status: 'released', criteria: 'Direction board accepted by the client.' }, { id: 'm2', title: 'Core component library', amount: 14000, due: 'Nov 02, 2026', status: 'submitted', criteria: 'Storybook review approved by an Approver.' }, { id: 'm3', title: 'Handoff & enablement', amount: 10000, due: 'Nov 16, 2026', status: 'upcoming', criteria: 'Source files and workshop recording delivered.' }] }, { id: 'AGR-1042', title: 'Q4 growth engineering retainer', counterparty: 'Vertex Commerce', initials: 'VC', amount: 48000, status: 'active', updated: 'Yesterday', description: 'A three-month engineering retainer for conversion and reliability work.', milestones: [{ id: 'm1', title: 'Baseline & roadmap', amount: 12000, due: 'Oct 25, 2026', status: 'upcoming', criteria: 'Roadmap reviewed in the steering meeting.' }, { id: 'm2', title: 'Conversion sprint', amount: 18000, due: 'Nov 20, 2026', status: 'upcoming', criteria: 'Experiment report shared with results.' }, { id: 'm3', title: 'Reliability sprint', amount: 18000, due: 'Dec 12, 2026', status: 'upcoming', criteria: 'Error budget and runbooks accepted.' }] }, { id: 'AGR-1039', title: 'Atlas brand refresh', counterparty: 'Atlas Health', initials: 'AH', amount: 18500, status: 'completed', updated: 'Oct 01', description: 'A focused brand refresh and launch toolkit.', milestones: [{ id: 'm1', title: 'Brand direction', amount: 6000, due: 'Sep 12, 2026', status: 'released', criteria: 'Direction accepted.' }, { id: 'm2', title: 'Launch toolkit', amount: 12500, due: 'Sep 30, 2026', status: 'released', criteria: 'Toolkit accepted.' }] }]
const chartData = [{ month: 'May', funded: 18, released: 12 }, { month: 'Jun', funded: 26, released: 17 }, { month: 'Jul', funded: 33, released: 22 }, { month: 'Aug', funded: 29, released: 25 }, { month: 'Sep', funded: 44, released: 31 }, { month: 'Oct', funded: 52, released: 38 }]
const money = (value: number) => `$${value.toLocaleString('en-US')}`
const short = (value: string) => `${value.slice(0, 7)}...${value.slice(-5)}`

function SolanaProviders({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => clusterApiUrl('devnet'), [])
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || '/api'
const apiUrl = rawApiUrl.endsWith('/') ? rawApiUrl.slice(0, -1) : rawApiUrl

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  try {
    const response = await fetch(`${apiUrl}${normalizedPath}`, {
      ...init,
      headers: {
        'x-actor-id': 'demo-client',
        'x-actor-role': 'client',
        'x-organization-id': 'org-demo',
        ...(init.headers ?? {})
      }
    })
    const isJson = response.headers.get('content-type')?.includes('application/json')
    const body = (isJson ? await response.json().catch(() => ({})) : {}) as T & { error?: string }
    if (!response.ok) throw new Error(body.error ?? `Request failed with status ${response.status}`)
    return body as T
  } catch (err) {
    if (err instanceof Error) throw err
    throw new Error('Network error or server unreachable. Please check API server.')
  }
}

type ApiMilestone = { id: string; amountBaseUnits: string; status: string; evidence?: string[]; submittedBy?: string }
type ApiAgreement = { id: string; organizationId: string; clientId: string; providerId: string; state: string; revisions: { terms: { title?: string; description?: string; label?: string } }[]; milestones: ApiMilestone[]; events?: { event: string; actor_id: string }[] }
const agreementForUi = (item: ApiAgreement): Agreement => {
  const terms = item.revisions[0]?.terms ?? {}
  const amount = item.milestones.reduce((sum, milestone) => sum + Number(milestone.amountBaseUnits) / 1_000_000, 0)
  const status: Agreement['status'] = item.state === 'completed' ? 'completed' : item.state === 'in_progress' || item.state.includes('submitted') || item.state.includes('approval') ? 'active' : item.state === 'funded' ? 'funded' : 'draft'
  const initials = (item.providerId || 'PA').slice(0, 2).toUpperCase()
  return { id: item.id, title: terms.title ?? item.id, counterparty: item.providerId, initials, amount, status, updated: 'Just now', description: terms.description ?? '', milestones: item.milestones.map(milestone => ({ id: milestone.id, title: milestone.id.replaceAll('-', ' '), amount: Number(milestone.amountBaseUnits) / 1_000_000, due: 'See agreement terms', status: milestone.status === 'released' ? 'released' : milestone.status === 'submitted' || milestone.status === 'approved' ? 'submitted' : 'upcoming', criteria: milestone.evidence?.[0] ?? 'Acceptance criteria recorded in the agreement.' })) }
}

export default function App() {
  return (
    <SolanaProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app/*" element={<ApiShell />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SolanaProviders>
  )
}

function ApiShell() {
  const [menu, setMenu] = useState(false)
  return (
    <div className="app-frame">
      <div className="demo-banner">
        <strong>TESTNET ONLY</strong>
        <span>Acme Creative Co. · Workspace</span>
      </div>
      <header className="app-topbar">
        <button className="mobile-menu" onClick={() => setMenu(!menu)}><Menu size={20} /></button>
        <Link to="/app/overview" className="wordmark app-wordmark"><span className="logo-mark">C</span> componere<span className="logo-ai">AI</span></Link>
        <div className="org-switcher">
          <span className="org-avatar">AC</span>
          <span><b>Acme Creative Co.</b><small>Workspace</small></span>
        </div>
        <div className="app-top-actions">
          <SolanaWalletPanel />
          <span className="user-avatar">AC</span>
        </div>
      </header>
      <div className={`app-content ${menu ? 'mobile-open' : ''}`}>
        <Sidebar close={() => setMenu(false)} />
        <main className="app-main">
          <Routes>
            <Route path="overview" element={<ApiOverview />} />
            <Route path="agreements" element={<ApiAgreements />} />
            <Route path="agreements/new" element={<ApiNewAgreement />} />
            <Route path="agreements/:id" element={<ApiDetails />} />
            <Route path="demo" element={<DemoWorkspace />} />
            <Route path="escrows" element={<ApiAgreementSection kind="escrows" />} />
            <Route path="transactions" element={<ApiAgreementSection kind="transactions" />} />
            <Route path="analytics" element={<ApiAgreementSection kind="analytics" />} />
            <Route path="team" element={<ApiTeam />} />
            <Route path="settings" element={<ApiSettings />} />
            <Route path="*" element={<Navigate to="overview" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function Landing() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link to="/" className="wordmark"><span className="logo-mark">C</span> componere<span className="logo-ai">AI</span></Link>
        <div className="landing-links">
          <a href="#workflow">How it works</a>
          <a href="#security">Security</a>
          <a href="#features">Features</a>
        </div>
        <Link to="/app/overview" className="landing-login">Launch app <ArrowRight size={15} /></Link>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow-pill"><Sparkles size={14} /> Intelligent agreements · verifiable payments</div>
          <h1>Agreements made intelligent.<br /><em>Payments made trustworthy.</em></h1>
          <p>Turn business agreements into secure, milestone-based payments with AI-powered contract creation and blockchain-enforced escrow.</p>
          <div className="hero-actions">
            <Link to="/app/overview" className="button button-primary">Open Workspace <ArrowRight size={16} /></Link>
            <Link to="/app/overview" className="button button-ghost">Explore dashboard</Link>
          </div>
          <div className="hero-proof">
            <span><ShieldCheck size={16} /> Permissioned by design</span>
            <span><LockKeyhole size={16} /> Funds stay in escrow</span>
            <span><Globe2 size={16} /> Built for teams</span>
          </div>
        </div>
        <Preview />
      </section>
      <section className="section" id="workflow">
        <div className="section-intro">
          <span className="eyebrow">A better way to work together</span>
          <h2>From conversation to<br /><em>confident settlement.</em></h2>
        </div>
        <div className="step-grid">
          <Step n="01" icon={<Sparkles />} title="Describe the deal" text="Start with plain language. Componere finds the structure in your agreement." />
          <Step n="02" icon={<ClipboardCheck />} title="Review the terms" text="Edit milestones, criteria and approval roles before anything moves." />
          <Step n="03" icon={<LockKeyhole />} title="Fund escrow" text="Lock the approved amount in a programmable, transparent contract." />
          <Step n="04" icon={<Check />} title="Release with proof" text="Milestones become payments only after the right person approves them." />
        </div>
      </section>
      <section className="section feature-section" id="features">
        <div className="feature-copy">
          <span className="eyebrow">The operating layer for trust</span>
          <h2>Clarity at every<br /><em>milestone.</em></h2>
          <p>One shared source of truth, from the first draft to the final transaction.</p>
          <Link to="/app/agreements/new" className="text-link">Build your first agreement <ArrowRight size={15} /></Link>
        </div>
        <div className="feature-cards">
          <Feature icon={<Sparkles />} title="AI-assisted creation" text="Structured terms from natural language, with ambiguity warnings." />
          <Feature icon={<LockKeyhole />} title="Programmable escrow" text="Payment rules live in the contract, not a spreadsheet." />
          <Feature icon={<BarChart3 />} title="Organization visibility" text="See locked funds, released payments and obligations in one view." />
        </div>
      </section>
      <section className="trust-band" id="security">
        <div>
          <span className="eyebrow">Built for accountable teams</span>
          <h2>Your agreement is the<br /><em>source of truth.</em></h2>
        </div>
        <div className="trust-points">
          <p><ShieldCheck /><span><b>Explicit authorization</b>Every release requires the right person and right state.</span></p>
          <p><Fingerprint /><span><b>Auditable by default</b>Revisions, approvals and transactions leave a clear trail.</span></p>
          <p><Globe2 /><span><b>Verify on-chain</b>Confirmed settlement is never confused with a frontend record.</span></p>
        </div>
      </section>
      <footer className="landing-footer">
        <Link to="/" className="wordmark"><span className="logo-mark">C</span> componere<span className="logo-ai">AI</span></Link>
        <span>Agreements made intelligent. Payments made trustworthy.</span>
        <span>© 2026 Componere</span>
      </footer>
    </div>
  )
}

function Preview() {
  return (
    <div className="product-preview">
      <div className="preview-chrome"><span /><span /><span /><b>Componere <i>AI</i></b><small><span className="online-dot" /> Interactive escrow core</small></div>
      <div className="hero-scene-wrap">
        <RenderRecovery fallback={<SceneFallback />}><Suspense fallback={<SceneFallback />}><EscrowHeroScene /></Suspense></RenderRecovery>
        <div className="scene-caption"><span className="scene-pulse" /> Agreement state verified locally <b>DEMO MODE</b></div>
      </div>
      <div className="preview-body">
        <div className="preview-side">
          <div className="preview-logo">C</div>
          <div className="preview-side-line active" />
          <div className="preview-side-line" />
          <div className="preview-side-line" />
          <div className="preview-side-line short" />
        </div>
        <div className="preview-main">
          <div className="preview-main-top">
            <div><small>ESCROW OVERVIEW</small><h4>Bounded by the agreement</h4></div>
            <span className="preview-avatar">AC</span>
          </div>
          <div className="preview-metrics">
            <div><small>Funds locked</small><b>$63,200</b><span className="up">Verified state</span></div>
            <div><small>Milestones</small><b>08</b><span className="muted">3 need attention</span></div>
            <div><small>Next release</small><b>$14k</b><span className="muted">In 4 days</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step({ n, icon, title, text }: { n: string; icon: ReactNode; title: string; text: string }) { return <div className="step"><span className="step-number">{n}</span><div className="step-icon">{icon}</div><h3>{title}</h3><p>{text}</p></div> }
function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="feature-card"><div className="feature-icon">{icon}</div><h3>{title}</h3><p>{text}</p></div> }

function Sidebar({ close }: { close: () => void }) {
  const location = useLocation()
  const links = [['/app/overview', 'Overview', <LayoutDashboard />], ['/app/agreements', 'Agreements', <FileText />], ['/app/escrows', 'Escrows', <LockKeyhole />], ['/app/transactions', 'Transactions', <ArrowRight />], ['/app/analytics', 'Analytics', <BarChart3 />]]
  return (
    <aside className="app-sidebar">
      <div className="sidebar-group">
        <span className="sidebar-heading">Workspace</span>
        {links.map(([to, label, icon]) => (
          <Link onClick={close} className={`sidebar-link ${location.pathname.startsWith(to as string) ? 'current' : ''}`} to={to as string} key={to as string}>
            {icon}<span>{label}</span>{label === 'Agreements' && <b className="sidebar-badge">3</b>}
          </Link>
        ))}
      </div>
      <div className="sidebar-group sidebar-bottom">
        <span className="sidebar-heading">Manage</span>
        <Link onClick={close} className="sidebar-link" to="/app/team"><Users /><span>Team</span></Link>
        <Link onClick={close} className="sidebar-link" to="/app/settings"><SettingsIcon /><span>Settings</span></Link>
        <div className="sidebar-help"><CircleHelp size={16} /><span><b>Need help?</b><small>Visit the docs</small></span><ArrowRight size={14} /></div>
        <div className="demo-label"><span className="online-dot" /> Testnet workspace</div>
      </div>
    </aside>
  )
}

function Header({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div> }
function Stat({ label, value, note, icon, tone = '' }: { label: string; value: string; note: string; icon: ReactNode; tone?: string }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><span className="stat-label">{label}</span><strong>{value}</strong><small className={note.startsWith('+') ? 'change-up' : 'stat-muted'}>{note}</small></div> }
function Badge({ status }: { status: string }) { return <span className={`status-badge ${status}`}>{status}</span> }

function Overview({ agreements }: { agreements: Agreement[] }) {
  const navigate = useNavigate()
  return (
    <div>
      <Header eyebrow="Monday, October 12, 2026" title="Welcome to Componere" description="Here is what is happening across your organization." action={<Link to="/app/agreements/new" className="button button-primary"><Plus size={16} /> New agreement</Link>} />
      <div className="stats-grid">
        <Stat label="Total escrow funded" value="$98,500" note="+18.4% from last month" icon={<LockKeyhole />} />
        <Stat label="Funds currently locked" value="$63,200" note="3 active agreements" icon={<Wallet />} tone="purple" />
        <Stat label="Payments released" value="$43,800" note="+12.8% from last month" icon={<ArrowRight />} tone="green" />
        <Stat label="Active agreements" value="08" note="2 need attention" icon={<FileText />} tone="orange" />
      </div>
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-header"><div><h2>Escrow activity</h2><p>Funds funded and released over time</p></div><select><option>Last 6 months</option></select></div>
          <div className="chart-legend"><span><i className="legend-funded" /> Funded</span><span><i className="legend-released" /> Released</span></div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs><linearGradient id="funded" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7665e8" stopOpacity={.3} /><stop offset="100%" stopColor="#7665e8" stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8690a7', fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8690a7', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#20253a', border: '1px solid #3b4260', borderRadius: 8 }} />
              <Area type="monotone" dataKey="funded" stroke="#7665e8" strokeWidth={2} fill="url(#funded)" />
              <Area type="monotone" dataKey="released" stroke="#4fc58b" strokeWidth={2} fill="none" />
            </AreaChart>
          </ResponsiveContainer>
        </section>
        <section className="panel deadline-panel">
          <div className="panel-header"><div><h2>Upcoming deadlines</h2><p>Keep agreements moving</p></div><Clock3 /></div>
          {[['Core component library', 'Nimbus product design system', 'Due in 4 days', '$14,000'], ['Baseline & roadmap', 'Q4 growth engineering', 'Due in 11 days', '$12,000'], ['Brand photography', 'Spring campaign', 'Due in 18 days', '$6,500']].map(row => (
            <div className="deadline-row" key={row[0]}>
              <span className="deadline-icon"><Clock3 size={15} /></span>
              <div><b>{row[0]}</b><small>{row[1]}</small></div>
              <span><strong>{row[3]}</strong><small>{row[2]}</small></span>
            </div>
          ))}
        </section>
      </div>
      <div className="dashboard-lower">
        <section className="panel agreement-table">
          <div className="panel-header"><div><h2>Active agreements</h2><p>Your most recent agreements</p></div><Link to="/app/agreements" className="text-link">View all <ArrowRight size={14} /></Link></div>
          {agreements.slice(0, 3).map(a => (
            <button className="agreement-row" key={a.id} onClick={() => navigate(`/app/agreements/${a.id}`)}>
              <span className="counterparty-avatar">{a.initials}</span>
              <span className="agreement-name"><b>{a.title}</b><small>{a.counterparty} · {a.id}</small></span>
              <span className="agreement-amount">{money(a.amount)}</span>
              <Badge status={a.status} />
            </button>
          ))}
        </section>
        <section className="panel activity-panel">
          <div className="panel-header"><div><h2>Recent activity</h2><p>Organization timeline</p></div><MoreHorizontal /></div>
          {[['Milestone released', 'Nimbus · Discovery & direction', '2h ago'], ['Agreement funded', 'Northstar Labs · $32,000', 'Yesterday'], ['Terms approved', 'Atlas Health · Brand refresh', 'Oct 01'], ['New member joined', 'Maya Patel · Approver', 'Sep 28']].map(row => (
            <div className="activity-row" key={row[0]}>
              <span className="activity-dot green" />
              <div><b>{row[0]}</b><small>{row[1]}</small></div>
              <time>{row[2]}</time>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

function Agreements({ agreements }: { agreements: Agreement[] }) {
  return (
    <div>
      <Header eyebrow="Workspace / agreements" title="Agreements" description="Create, review and manage every business agreement." action={<Link to="/app/agreements/new" className="button button-primary"><Plus size={16} /> New agreement</Link>} />
      <div className="toolbar">
        <div className="search-field"><Search size={16} /><input placeholder="Search agreements..." /></div>
        <select><option>All statuses</option><option>Funded</option><option>Active</option></select>
        <button className="filter-button">Filters <ChevronDown size={14} /></button>
      </div>
      <div className="panel table-panel">
        <div className="table-head"><span>Agreement</span><span>Counterparty</span><span>Amount</span><span>Milestones</span><span>Status</span><span>Updated</span></div>
        {agreements.map(a => (
          <Link to={`/app/agreements/${a.id}`} className="table-row" key={a.id}>
            <span className="table-agreement"><span className="counterparty-avatar">{a.initials}</span><b>{a.title}</b></span>
            <span>{a.counterparty}</span>
            <span className="strong-text">{money(a.amount)}</span>
            <span>{a.milestones.filter(m => m.status === 'released').length}/{a.milestones.length} released</span>
            <Badge status={a.status} />
            <span className="muted-text">{a.updated}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function ApiOverview() {
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [error, setError] = useState('')
  useEffect(() => { void apiRequest<ApiAgreement[]>('/agreements').then(items => setAgreements(items.map(agreementForUi))).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load agreements.')) }, [])
  return error ? <div className="demo-error">{error}</div> : <Overview agreements={agreements} />
}

function ApiAgreements() {
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [error, setError] = useState('')
  useEffect(() => { void apiRequest<ApiAgreement[]>('/agreements').then(items => setAgreements(items.map(agreementForUi))).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load agreements.')) }, [])
  return error ? <div className="demo-error">{error}</div> : <Agreements agreements={agreements} />
}

function ApiAgreementSection({ kind }: { kind: 'escrows' | 'transactions' | 'analytics' }) {
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [error, setError] = useState('')
  useEffect(() => { void apiRequest<ApiAgreement[]>('/agreements').then(items => setAgreements(items.map(agreementForUi))).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load agreement data.')) }, [])
  if (error) return <div className="demo-error">{error}</div>
  if (kind === 'escrows') return <Escrows agreements={agreements} />
  if (kind === 'transactions') return <Transactions agreements={agreements} />
  return <Analytics />
}

function ApiTeam() {
  const [members, setMembers] = useState<{ id: string; displayName: string; email: string; role: string }[]>([])
  const [error, setError] = useState('')
  useEffect(() => { void apiRequest<{ users: { id: string; displayName: string; email: string; role: string }[] }>('/users').then(result => setMembers(result.users)).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load team members.')) }, [])
  return (
    <div>
      <Header eyebrow="Manage / team" title="Team & roles" description="View team members who can participate in agreements." />
      {error && <div className="demo-error">{error}</div>}
      <div className="panel team-panel">
        <div className="team-head"><span>Member</span><span>Role</span><span>Email</span><span>Status</span></div>
        {members.map(member => (
          <div className="team-row" key={member.id}>
            <span className="member-name"><span className="member-avatar">{member.displayName.slice(0, 2).toUpperCase()}</span><b>{member.displayName}</b></span>
            <span><span className="role-badge">{member.role}</span></span>
            <span className="muted-text">{member.email}</span>
            <span className="member-status"><span className="online-dot" /> Active</span>
          </div>
        ))}
      </div>
      <div className="role-info"><ShieldCheck size={20} /><span><b>Permissions are enforced server-side</b><small>Clients approve milestones; assigned freelancers submit deliverables.</small></span></div>
    </div>
  )
}

function ApiSettings() {
  return (
    <div>
      <Header eyebrow="Manage / settings" title="Settings" description="Manage your connected testnet wallet and workspace preferences." />
      <div className="settings-grid">
        <nav className="settings-nav"><button className="selected">Wallet & network</button></nav>
        <section className="panel settings-panel">
          <div className="settings-section">
            <h2>Solana Devnet wallet</h2>
            <p>Wallet actions are real only when a compatible Devnet wallet is connected.</p>
            <SolanaWalletPanel />
          </div>
        </section>
      </div>
    </div>
  )
}

function ApiNewAgreement() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('SaaS landing page build')
  const [providerId, setProviderId] = useState('')
  const [providers, setProviders] = useState<{ id: string; displayName: string; email: string }[]>([])
  const [prompt, setPrompt] = useState('Build a SaaS landing page for $5,000. Release $1,000 after design, $2,000 after frontend completion, and $2,000 after final approval.')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { void apiRequest<{ users: { id: string; displayName: string; email: string }[] }>('/users').then(result => { setProviders(result.users); setProviderId(result.users[0]?.id ?? '') }).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load freelancers.')) }, [])
  const save = async () => {
    setBusy(true); setError('')
    try {
      if (!providerId) throw new Error('Select a freelancer before saving the agreement.')
      const item = await apiRequest<ApiAgreement>('/agreements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: `AGR-${Date.now()}`,
          clientId: 'demo-client',
          providerId,
          terms: { title, description: prompt, label: 'AI structured draft' },
          milestones: [
            { id: 'design-direction', amountBaseUnits: '1000000000', criteria: 'Client approves the design direction in writing.' },
            { id: 'frontend-completion', amountBaseUnits: '2000000000', criteria: 'All agreed pages pass browser review.' },
            { id: 'final-approval', amountBaseUnits: '2000000000', criteria: 'Client confirms acceptance in the workspace.' }
          ]
        })
      })
      navigate(`/app/agreements/${item.id}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save agreement.') }
    finally { setBusy(false) }
  }
  return (
    <div className="wizard-page">
      <Header eyebrow="Workspace / new agreement" title="Create an agreement" description="Describe the deal. We will help you make the terms precise." />
      <div className="wizard-steps">{['Describe', 'Structure', 'Review', 'Create'].map((label, index) => <div className={`wizard-step ${step >= index + 1 ? 'done' : ''}`} key={label}><span>{index + 1}</span>{label}</div>)}</div>
      {error && <div className="demo-error">{error}</div>}
      <div className="wizard-card">
        {step === 1 && (
          <>
            <WizardHeading icon={<Sparkles />} title="What are you working on?" text="Write naturally. Include the people, amount, milestones and what done means." />
            <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={7} />
            <button className="button button-primary wizard-next" onClick={() => setStep(2)}>Structure terms <ArrowRight size={15} /></button>
          </>
        )}
        {step === 2 && (
          <>
            <WizardHeading icon={<Check />} title="Terms extracted" text="Review the persisted agreement structure before continuing." />
            <label>Agreement title<input value={title} onChange={event => setTitle(event.target.value)} /></label>
            <label>Freelancer
              <select value={providerId} onChange={event => setProviderId(event.target.value)}>
                <option value="">Select a freelancer</option>
                {providers.map(provider => <option value={provider.id} key={provider.id}>{provider.displayName} · {provider.email}</option>)}
              </select>
            </label>
            <p>{prompt}</p>
            <div className="wizard-footer">
              <button className="button button-ghost" onClick={() => setStep(1)}>Back</button>
              <button className="button button-primary" onClick={() => setStep(3)}>Review terms <ArrowRight size={15} /></button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <WizardHeading icon={<CircleHelp />} title="Review before saving" text="This creates a draft agreement in the workspace." />
            <div className="warning-box"><b>Three milestones will be saved</b><p>Each milestone has a fixed base-unit amount and acceptance criteria enforced by the backend state machine.</p></div>
            <div className="wizard-footer">
              <button className="button button-ghost" onClick={() => setStep(2)}>Back</button>
              <button className="button button-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Create draft agreement'} <FilePlus2 size={15} /></button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ApiDetails() {
  const { id } = useParams()
  const [item, setItem] = useState<ApiAgreement | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const load = () => { if (id) void apiRequest<ApiAgreement & { events?: ApiAgreement['events'] }>(`/agreements/${id}`).then(setItem).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load agreement.')) }
  useEffect(load, [id])
  const act = async (path: string, body: Record<string, unknown> = {}) => {
    if (!id) return
    setBusy(path)
    setError('')
    try {
      const next = await apiRequest<ApiAgreement>(`/agreements/${id}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      setItem(next)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action rejected.') }
    finally { setBusy('') }
  }
  if (!item) return <div className="blank-state"><h3>{error || 'Loading agreement…'}</h3><Link to="/app/agreements" className="text-link">Back to agreements</Link></div>
  const terms = item.revisions[0]?.terms ?? {}
  const isClient = true
  const isProvider = true
  return (
    <div className="detail-page">
      <Link className="back-link" to="/app/agreements">← All agreements</Link>
      <Header eyebrow={`Agreement / ${item.id}`} title={terms.title ?? item.id} description={terms.description ?? ''} action={<Badge status={item.state} />} />
      {error && <div className="demo-error">{error}</div>}
      <div className="detail-grid">
        <section className="panel milestone-panel">
          <div className="panel-header"><div><h2>Milestone timeline</h2><p>Every action is validated and persisted by the API.</p></div></div>
          {item.milestones.map(milestone => (
            <div className="timeline-item" key={milestone.id}>
              <div className={`timeline-marker ${milestone.status}`}><span>{milestone.status === 'released' ? '✓' : '•'}</span></div>
              <div className="timeline-content">
                <div className="timeline-top">
                  <div><b>{milestone.id.replaceAll('-', ' ')}</b><small>{money(Number(milestone.amountBaseUnits) / 1_000_000)}</small></div>
                  <Badge status={milestone.status} />
                </div>
                <div className="criteria">
                  <ClipboardCheck size={14} />
                  <span><b>Acceptance criteria</b>{milestone.evidence?.[0] ?? 'No criteria recorded.'}</span>
                </div>
                {isProvider && milestone.status === 'upcoming' && (item.state === 'in_progress' || item.state === 'partially_settled') && (
                  <button className="button button-primary" disabled={Boolean(busy)} onClick={() => void act('submit', { milestoneId: milestone.id, evidence: milestone.evidence ?? [] })}>{busy === 'submit' ? 'Submitting…' : 'Submit deliverable'}</button>
                )}
                {isClient && milestone.status === 'submitted' && (
                  <button className="button button-primary" disabled={Boolean(busy)} onClick={() => void act('approve-milestone', { milestoneId: milestone.id })}>{busy === 'approve-milestone' ? 'Approving…' : 'Approve milestone'}</button>
                )}
                {isClient && milestone.status === 'approved' && (
                  <button className="button button-primary" disabled={Boolean(busy)} onClick={() => void act('release-milestone', { milestoneId: milestone.id })}>{busy === 'release-milestone' ? 'Releasing…' : 'Release payment'}</button>
                )}
              </div>
            </div>
          ))}
        </section>
        <aside className="detail-side">
          <div className="panel side-card">
            <h3>Agreement details</h3>
            <Detail label="Client" value={item.clientId} />
            <Detail label="Service provider" value={item.providerId} />
            <Detail label="State" value={item.state} />
          </div>
          {isClient && item.state === 'draft' && (
            <div className="panel side-card">
              <button className="button button-primary" disabled={Boolean(busy)} onClick={() => void act('review')}>{busy === 'review' ? 'Reviewing…' : 'Review terms with AI'}</button>
              <small className="demo-warning">Analyzes terms and transitions agreement to acceptance phase.</small>
            </div>
          )}
          {item.state === 'awaiting_acceptance' && (
            <div className="panel side-card">
              {isClient && <button className="button button-primary" disabled={Boolean(busy)} onClick={() => void act('accept', { role: 'client' })}>{busy === 'accept' ? 'Accepting…' : 'Accept terms as Client'}</button>}
              {isProvider && <button className="button button-primary" disabled={Boolean(busy)} onClick={() => void act('accept', { role: 'provider' })}>{busy === 'accept' ? 'Accepting…' : 'Accept terms as Freelancer'}</button>}
            </div>
          )}
          {isClient && item.state === 'awaiting_funding' && (
            <div className="panel side-card">
              <button className="button button-primary" disabled={Boolean(busy)} onClick={() => void act('fund', { mode: 'demo' })}>{busy === 'fund' ? 'Funding…' : 'Fund escrow · preview only'}</button>
              <small className="demo-warning">Real Devnet funding requires a deployed program and wallet signature.</small>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function WizardHeading({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="ai-heading"><span className="ai-spark">{icon}</span><div><h2>{title}</h2><p>{text}</p></div><span className="demo-chip">AI Assisted</span></div> }
function Detail({ label, value, accent }: { label: string; value: string; accent?: boolean }) { return <div className="detail-line"><span>{label}</span><b className={accent ? 'accent-text' : ''}>{value}</b></div> }

function Escrows({ agreements }: { agreements: Agreement[] }) {
  return (
    <div>
      <Header eyebrow="Workspace / escrows" title="Escrows" description="Track funds that are locked, released and returned." action={<span className="network-chip"><span className="online-dot" /> Testnet</span>} />
      <div className="stats-grid three">
        <Stat label="Total locked" value="$63,200" note="3 active escrows" icon={<LockKeyhole />} tone="purple" />
        <Stat label="Released this month" value="$18,500" note="+22.1% from September" icon={<ArrowRight />} tone="green" />
        <Stat label="Awaiting approval" value="$14,000" note="1 milestone" icon={<Clock3 />} tone="orange" />
      </div>
      <div className="panel table-panel">
        <div className="table-head escrow-head"><span>Agreement</span><span>Network</span><span>Locked</span><span>Released</span><span>Status</span></div>
        {agreements.filter(a => a.status !== 'draft').map(a => (
          <div className="table-row escrow-row" key={a.id}>
            <span className="table-agreement"><span className="counterparty-avatar">{a.initials}</span><b>{a.title}<small>{a.id}</small></b></span>
            <span><span className="network-dot" /> Tempo · testnet</span>
            <span className="strong-text">{money(a.amount - a.milestones.filter(m => m.status === 'released').reduce((sum, m) => sum + m.amount, 0))}</span>
            <span>{money(a.milestones.filter(m => m.status === 'released').reduce((sum, m) => sum + m.amount, 0))}</span>
            <Badge status={a.status} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Transactions({ agreements }: { agreements: Agreement[] }) {
  return (
    <div>
      <Header eyebrow="Workspace / transactions" title="Transactions" description="A verified history of every funding and release event." />
      <div className="toolbar">
        <div className="search-field"><Search size={16} /><input placeholder="Search transaction or agreement..." /></div>
        <select><option>All transaction types</option><option>Funding</option><option>Release</option></select>
        <select><option>All statuses</option><option>Confirmed</option><option>Pending</option></select>
      </div>
      <div className="panel table-panel">
        <div className="table-head transaction-head"><span>Transaction</span><span>Agreement</span><span>Amount</span><span>Network</span><span>Status</span><span>Date</span></div>
        {agreements.flatMap(a => a.milestones.filter(m => m.status === 'released').map(m => ({ a, m }))).map(({ a, m }) => (
          <div className="table-row transaction-row" key={`${a.id}-${m.id}`}>
            <span className="transaction-name"><span className="transaction-icon release">↗</span><b>Milestone release<small>{short(`0x${a.id.replace(/\D/g, '').padStart(64, '0')}`)}</small></b></span>
            <span>{a.title}</span>
            <span className="strong-text">{money(m.amount)}</span>
            <span><span className="network-dot" /> Tempo</span>
            <Badge status="completed" />
            <span className="muted-text">Oct 12, 2026</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Analytics() {
  return (
    <div>
      <Header eyebrow="Organization / analytics" title="Financial analytics" description="See how your organization moves money through agreements." action={<select className="date-select"><option>Last 6 months</option></select>} />
      <div className="stats-grid">
        <Stat label="Escrow volume" value="$142,300" note="+18.4% from prior period" icon={<BarChart3 />} />
        <Stat label="Average agreement" value="$17,788" note="Across 8 agreements" icon={<FileText />} tone="purple" />
        <Stat label="Release rate" value="84.6%" note="23 of 27 milestones" icon={<Check />} tone="green" />
        <Stat label="Avg. approval time" value="2.4d" note="-0.8d from prior period" icon={<Clock3 />} tone="orange" />
      </div>
      <section className="panel analytics-chart">
        <div className="panel-header"><div><h2>Payment activity</h2><p>Funded volume compared with released milestones</p></div></div>
        <ResponsiveContainer width="100%" height={310}>
          <AreaChart data={chartData}>
            <XAxis dataKey="month" axisLine={false} tickLine={false} />
            <YAxis axisLine={false} tickLine={false} />
            <Tooltip />
            <Area type="monotone" dataKey="funded" stroke="#7665e8" fill="#eeebff" />
            <Area type="monotone" dataKey="released" stroke="#4fc58b" fill="none" />
          </AreaChart>
        </ResponsiveContainer>
      </section>
    </div>
  )
}

type DemoAgreement = { id: string; state: string; clientId: string; providerId: string; revisions: { terms: { title: string; label: string; description: string } }[]; milestones: { id: string; amountBaseUnits: string; status: string; evidence?: string[]; submittedBy?: string }[]; events?: { event: string; actor_id: string }[]; funding?: { mode: string; verifiedOnChain: boolean } }

function DemoWorkspace() {
  const [agreement, setAgreement] = useState<DemoAgreement | null>(null)
  const [error, setError] = useState('')
  const [guided, setGuided] = useState(false)
  const [busy, setBusy] = useState('')
  const [step, setStep] = useState(0)
  const [role, setRole] = useState<'client' | 'freelancer'>('client')

  const load = async () => {
    try {
      const data = await apiRequest<DemoAgreement>('/agreements/DEMO-WEBSITE-001')
      setAgreement(data)
    } catch {
      setError('The demo agreement is unavailable. Start the API with DEMO_MODE=true.')
    }
  }
  useEffect(() => { void load() }, [])

  const act = async (path: string, body: Record<string, unknown>) => {
    setBusy(path)
    setError('')
    try {
      const result = await apiRequest<DemoAgreement>(`/agreements/DEMO-WEBSITE-001/${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-actor-id': role === 'client' ? 'demo-client' : 'demo-freelancer',
          'x-actor-role': role,
        },
        body: JSON.stringify(body)
      })
      setAgreement(result)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action rejected.') }
    finally { setBusy('') }
  }

  const nextStep = role === 'freelancer' ? 'Submit the UI Design deliverable.' : 'Connect your Devnet wallet, then review and approve the submitted milestone.'
  return (
    <div>
      <Header eyebrow={`Workspace / ${role}`} title="Website Development" description="Shared agreement · $500 equivalent · DEMO DATA" />
      <div className="guided-toolbar">
        <span><b>Role: {role === 'client' ? 'Client' : 'Freelancer'} view</b><small>Toggle role to test actions without login</small></span>
        <button className="button button-ghost" onClick={() => setRole(r => r === 'client' ? 'freelancer' : 'client')}>Switch to {role === 'client' ? 'Freelancer' : 'Client'} view</button>
        <button className="button button-primary" onClick={() => { setGuided(true); setStep(0) }}>Start Guided Tour</button>
      </div>
      {guided && (
        <div className="guided-card">
          <div>
            <b>Guided Tour · Step {step + 1} of 5</b>
            <p>{['View the sample agreement and milestones.', 'Review AI-generated terms and acceptance history.', 'Connect a Solana Devnet wallet. Funding remains disabled until a deployed program is configured.', 'Switch role to submit or approve the UI Design milestone.', 'Verify only real signatures; DEMO DATA never claims an on-chain transaction.'][step]}</p>
          </div>
          <button onClick={() => step < 4 ? setStep(step + 1) : setGuided(false)}>{step < 4 ? 'Next step' : 'Finish'}</button>
        </div>
      )}
      {error && <div className="demo-error">{error}</div>}
      <div className="demo-role-grid">
        <section className="panel demo-panel">
          <span className="eyebrow">Agreement status</span>
          <h2>{agreement?.revisions[0]?.terms.title ?? 'Loading demo agreement…'}</h2>
          <p>{agreement?.revisions[0]?.terms.description}</p>
          <div className="demo-status">
            <b>{agreement?.state.replaceAll('_', ' ')}</b>
            <span>DEMO DATA · not a blockchain transaction</span>
          </div>
          {agreement?.milestones.map(milestone => (
            <div className="demo-milestone" key={milestone.id}>
              <div><strong>{milestone.id.replaceAll('-', ' ')}</strong><small>{milestone.evidence?.[0]}</small></div>
              <b>${(Number(milestone.amountBaseUnits) / 1_000_000).toFixed(2)}</b>
              <span className={`milestone-pill ${milestone.status}`}>{milestone.status}</span>
              {role === 'freelancer' && milestone.status === 'upcoming' && (agreement?.state === 'in_progress' || agreement?.state === 'partially_settled') && (
                <button disabled={Boolean(busy)} onClick={() => void act('submit', { milestoneId: milestone.id, evidence: ['DEMO DATA: https://demo.example.com/deliverables/ui-design'] })}>{busy === 'submit' ? 'Submitting…' : 'Submit deliverable'}</button>
              )}
              {role === 'client' && milestone.status === 'submitted' && (
                <button disabled={Boolean(busy)} onClick={() => void act('approve-milestone', { milestoneId: milestone.id })}>{busy === 'approve-milestone' ? 'Approving…' : 'Approve milestone'}</button>
              )}
              {role === 'client' && milestone.status === 'approved' && (
                <button disabled={Boolean(busy)} onClick={() => void act('release-milestone', { milestoneId: milestone.id })}>{busy === 'release-milestone' ? 'Releasing…' : 'Release payment'}</button>
              )}
            </div>
          ))}
        </section>
        <section className="panel demo-panel">
          <span className="eyebrow">Role controls</span>
          <h2>{role === 'client' ? 'Client controls' : 'Freelancer view'}</h2>
          <p>{nextStep}</p>
          {role === 'client' ? (
            <>
              <button className="button button-primary" disabled={Boolean(busy) || agreement?.state !== 'awaiting_funding'} onClick={() => void act('fund', { mode: 'demo' })}>{busy === 'fund' ? 'Funding…' : 'Fund escrow · preview only'}</button>
              <small className="demo-warning">Preview funding is explicitly unverified. A real Devnet transfer requires a deployed program and wallet signature.</small>
            </>
          ) : (
            <div className="empty-state"><Check size={20} /><span>Milestone releases are authorized by the client.</span></div>
          )}
          <h3>Audit trail</h3>
          {agreement?.events?.map((event, index) => (
            <div className="audit-row" key={`${event.event}-${index}`}>
              <span>{event.event}</span>
              <small>{event.actor_id}</small>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
