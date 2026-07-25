import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from "./router";
import {
  Activity, AlertOctagon, ArrowRight, BadgeCheck, Ban, Blocks, Bot, Braces, CalendarDays, Check, ChevronDown, CircleDollarSign,
  CircleStop, Clock3, Database, ExternalLink, FileCheck2, FileText, Fingerprint, GitBranch, History, KeyRound, LayoutDashboard,
  Link2, LockKeyhole, Menu, MessageSquareWarning, Network, Play, Plus, Radar, RefreshCw, Route as RouteIcon, Scale, Search,
  Send, ShieldCheck, Sparkles, Target, TimerReset, UserRound, UsersRound, X, Zap,
} from "lucide-react";
import { api, formatDate, formatMoney } from "./api";
import type {
  ApprovalRequest, Conflict, CreateMissionInput, ExecutionTask, MissionDetail, MissionSummary, Outcome, PlanVersion, SourceInput,
} from "@shared/domain";

type DashboardResponse = {
  missions: MissionSummary[];
  metrics: { active: number; blocked: number; awaitingDecisions: number; awaitingApprovals: number; successfulThisWeek: number };
};

const navigation = [
  { label: "Overview", href: "/app", icon: LayoutDashboard },
  { label: "Missions", href: "/app", icon: Radar },
  { label: "Conflict inbox", href: "/app?focus=conflicts", icon: MessageSquareWarning },
  { label: "Approvals", href: "/app?focus=approvals", icon: ShieldCheck },
];

const sourceColors: Record<string, string> = {
  Slack: "violet", Email: "coral", Gmail: "coral", Notion: "stone", "Google Drive": "blue", Calendar: "amber",
  "Google Calendar": "amber", CRM: "teal", Ads: "pink", Manual: "lime", "Meeting note": "blue",
};

function Logo({ compact = false }: { compact?: boolean }) {
  return <Link to="/" className={`logo ${compact ? "logo-compact" : ""}`} aria-label="Relay home"><span className="logo-mark"><span /><span /><span /></span><span>relay</span></Link>;
}

function PublicHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="public-header">
      <Logo />
      <nav className={open ? "public-nav open" : "public-nav"}>
        <a href="#how-it-works">How it works</a><a href="#control-plane">Control plane</a><a href="#security">Security</a>
        <Link to="/app" className="text-link">Open workspace</Link>
        <Link to="/missions/new" className="button button-small button-dark">Find conflicts <ArrowRight size={15} /></Link>
      </nav>
      <button className="icon-button mobile-menu" onClick={() => setOpen((value) => !value)} aria-label="Toggle menu"><Menu size={20} /></button>
    </header>
  );
}

function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="landing">
      <PublicHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="pulse-dot" /> Intent control for human + AI teams</div>
            <h1>AI agents don’t fail because they can’t reason.</h1>
            <h2>They fail because teams can’t agree what they should do.</h2>
            <p>Relay finds contradictions hidden across your team’s messages and documents, turns them into a versioned execution contract, and safely coordinates humans and AI agents to deliver the outcome.</p>
            <div className="hero-actions">
              <button className="button button-primary button-large" onClick={() => navigate("/missions/new")}>Find conflicts in my mission <ArrowRight size={18} /></button>
              <a className="button button-ghost button-large" href="#demo"><Play size={17} fill="currentColor" /> Watch the 90-second flow</a>
            </div>
            <div className="trust-line"><ShieldCheck size={17} /><span>No blanket access</span><span>•</span><span>Exact approvals</span><span>•</span><span>Complete lineage</span></div>
          </div>
          <div className="compiler-visual" id="demo">
            <div className="compiler-topbar"><span>Mission compiler</span><span className="live-label"><span /> ANALYZING</span></div>
            <div className="source-stack">
              <div className="source-chip violet"><MessageSquareWarning size={15} /><span><b>Slack</b> Launch Jul 29</span></div>
              <div className="source-chip coral"><Send size={15} /><span><b>Email</b> Brand approval required</span></div>
              <div className="source-chip amber"><CalendarDays size={15} /><span><b>Calendar</b> Review Jul 30</span></div>
              <div className="source-chip stone"><FileText size={15} /><span><b>Notion</b> Budget NT$20k</span></div>
              <div className="source-chip teal"><UsersRound size={15} /><span><b>CRM</b> Existing members included</span></div>
            </div>
            <div className="compiler-line"><span /><Zap size={18} /><span /></div>
            <div className="conflict-output">
              <div className="output-head"><AlertOctagon size={20} /><div><span>BLOCKING CONFLICT</span><b>Launch is scheduled before approval</b></div><span className="severity-pill">Critical</span></div>
              <p>Jul 29 launch cannot satisfy a Jul 30 mandatory review. The current approval is invalid for this plan.</p>
              <div className="impact-grid"><div><TimerReset size={15} /><span>Deadline at risk</span></div><div><LockKeyhole size={15} /><span>Approval missing</span></div><div><CircleDollarSign size={15} /><span>2 budget versions</span></div></div>
              <button className="resolution-preview"><Check size={16} /> Move review before launch and bind approval to exact payload <ArrowRight size={16} /></button>
            </div>
          </div>
        </section>

        <section className="proof-strip"><span>From contradictory input</span><ArrowRight size={18} /><b>to one executable truth</b><div className="proof-items"><span><GitBranch size={15} /> Versioned</span><span><KeyRound size={15} /> Permissioned</span><span><FileCheck2 size={15} /> Auditable</span><span><TimerReset size={15} /> Reversible</span></div></section>

        <section className="section how" id="how-it-works">
          <div className="section-heading"><span className="section-index">01 / INTENT COMPILER</span><h2>Before agents execute,<br />make the mission executable.</h2><p>Relay turns scattered goals, limits and decisions into an evidence-backed contract every person and agent can inspect.</p></div>
          <div className="steps-grid">
            {[
              [Network, "Collect intent", "Attach messages, documents, records and human corrections. Every assertion keeps its source, author, timestamp and authority."],
              [Scale, "Resolve conflict", "Find hard, policy, resource, authority, version and dependency conflicts before they become expensive mistakes."],
              [Braces, "Compile the contract", "Produce tasks with owners, dependencies, capabilities, risk, budget, approvals, stop conditions and rollback."],
              [Activity, "Execute with control", "Run preflight checks, stop unsafe actions, invalidate stale approvals and retain evidence through the outcome."],
            ].map(([Icon, title, copy], index) => <article className="step-card" key={String(title)}><span className="step-number">0{index + 1}</span><Icon size={25} /><h3>{String(title)}</h3><p>{String(copy)}</p></article>)}
          </div>
        </section>

        <section className="section contract-section" id="control-plane">
          <div className="contract-panel">
            <div className="contract-meta"><span>EXECUTION CONTRACT</span><span>PLAN v4 · ACTIVE</span></div>
            <h3>Launch Kaohsiung campaign</h3>
            <div className="contract-row"><span>GOAL</span><p>Acquire 24 paid registrations by Jul 29</p><BadgeCheck size={18} /></div>
            <div className="contract-row"><span>CONSTRAINT</span><p>Exclude existing members · Max NT$30,000</p><BadgeCheck size={18} /></div>
            <div className="contract-row"><span>APPROVAL</span><p>Jennifer · exact payload · expires in 18h</p><BadgeCheck size={18} /></div>
            <div className="contract-row"><span>STOP</span><p>Pause if CPA &gt; NT$1,250 after 10 conversions</p><CircleStop size={18} /></div>
            <div className="contract-hash"><Fingerprint size={16} /> sha256:8b1f…c04d <span>payload locked</span></div>
          </div>
          <div className="contract-copy"><span className="section-index">02 / CONTROL PLANE</span><h2>Approval is not a button.<br />It’s a precise contract.</h2><p>Every high-impact action is bound to one plan version, exact audience, payload, budget, approver, expiration and rollback strategy. Change the payload and the approval disappears.</p><ul className="feature-list"><li><Check /> Version-aware execution</li><li><Check /> Task-level capability grants</li><li><Check /> Exact, expiring approvals</li><li><Check /> End-to-end evidence lineage</li></ul></div>
        </section>

        <section className="section security-section" id="security"><div><span className="section-index">03 / TRUST BY DESIGN</span><h2>Agents request capabilities.<br />They never hold credentials.</h2></div><div className="security-grid">{[
          [KeyRound, "Mission-scoped access", "Only the providers, resources and actions required by the active plan."],
          [LockKeyhole, "Credential isolation", "OAuth tokens stay in the gateway—never in model or agent context."],
          [History, "Immutable lineage", "Every assertion, decision, action, version and outcome remains explainable."],
          [ShieldCheck, "Fail-closed execution", "Missing permission, stale versions and payload changes stop execution with a clear next action."],
        ].map(([Icon, title, copy]) => <article key={String(title)}><Icon size={22} /><h3>{String(title)}</h3><p>{String(copy)}</p></article>)}</div></section>

        <section className="final-cta"><span>ONE TEAM. ONE ACTIVE INTENT.</span><h2>Give your AI workforce<br />something safe to execute.</h2><Link to="/missions/new" className="button button-primary button-large">Find conflicts in my mission <ArrowRight /></Link></section>
      </main>
      <footer><Logo /><p>Git for organizational intent—and the control plane for AI execution.</p><span>© 2026 Relay</span></footer>
    </div>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [sidebar, setSidebar] = useState(false);
  return (
    <div className="app-shell">
      <aside className={sidebar ? "sidebar open" : "sidebar"}>
        <div className="sidebar-head"><Logo compact /><button className="icon-button sidebar-close" onClick={() => setSidebar(false)}><X size={18} /></button></div>
        <div className="workspace-switch"><span className="workspace-avatar">RL</span><div><b>Relay Labs</b><small>Design partner workspace</small></div><ChevronDown size={16} /></div>
        <nav>{navigation.map(({ label, href, icon: Icon }) => <NavLink to={href} key={label} className={({ isActive }) => isActive && label === "Overview" ? "active" : ""} onClick={() => setSidebar(false)}><Icon size={18} />{label}</NavLink>)}</nav>
        <div className="sidebar-spacer" />
        <div className="control-status"><span className="status-orb"><ShieldCheck size={15} /></span><div><b>Control plane online</b><small>All actions governed</small></div></div>
        <div className="user-card"><span className="user-avatar">JE</span><div><b>Jennifer</b><small>Workspace owner</small></div><button className="icon-button"><ChevronDown size={15} /></button></div>
      </aside>
      <div className="app-main"><header className="app-header"><button className="icon-button app-menu" onClick={() => setSidebar(true)}><Menu size={20} /></button><div className="app-search"><Search size={17} /><span>Search missions, evidence, decisions…</span><kbd>⌘ K</kbd></div><div className="header-actions"><span className="environment"><span /> LIVE CONTROL</span><Link to="/missions/new" className="button button-primary button-small"><Plus size={16} /> New mission</Link></div></header>{children}</div>
      {sidebar && <button className="sidebar-scrim" onClick={() => setSidebar(false)} aria-label="Close navigation" />}
    </div>
  );
}

function StatCard({ label, value, accent, icon: Icon, helper }: { label: string; value: number; accent?: string; icon: typeof Radar; helper: string }) {
  return <article className={`stat-card ${accent ?? ""}`}><div className="stat-top"><span>{label}</span><Icon size={18} /></div><strong>{String(value).padStart(2, "0")}</strong><small>{helper}</small></article>;
}

function LoadingBlock({ label = "Loading execution state…" }: { label?: string }) { return <div className="loading-block"><span className="loader" /><p>{label}</p></div>; }
function ErrorBlock({ error, retry }: { error: string; retry?: () => void }) { return <div className="error-block"><AlertOctagon /><div><b>Relay could not load this view</b><p>{error}</p></div>{retry && <button className="button button-ghost" onClick={retry}>Retry</button>}</div>; }

function DashboardPage() {
  const [data, setData] = useState<DashboardResponse>();
  const [error, setError] = useState("");
  const [params] = useSearchParams();
  const load = () => { setError(""); api<DashboardResponse>("/api/dashboard").then(setData).catch((err) => setError(err.message)); };
  useEffect(load, []);
  if (error) return <AppShell><main className="page"><ErrorBlock error={error} retry={load} /></main></AppShell>;
  if (!data) return <AppShell><main className="page"><LoadingBlock /></main></AppShell>;
  const focus = params.get("focus");
  const missions = focus === "conflicts" ? data.missions.filter((mission) => mission.openConflicts) : focus === "approvals" ? data.missions.filter((mission) => mission.pendingApprovals) : data.missions;
  return (
    <AppShell><main className="page dashboard-page">
      <div className="page-title"><div><span className="page-kicker">WORKSPACE CONTROL CENTER</span><h1>Good morning, Jennifer.</h1><p>Here’s what needs human judgment before your agents can move.</p></div><Link to="/missions/new" className="button button-dark"><Plus size={17} /> Create mission</Link></div>
      <section className="stats-grid"><StatCard label="Active missions" value={data.metrics.active} icon={Radar} helper="under valid contracts" /><StatCard label="Blocked" value={data.metrics.blocked} icon={CircleStop} helper="execution safely stopped" accent="danger" /><StatCard label="Awaiting decisions" value={data.metrics.awaitingDecisions} icon={Scale} helper="conflicts need owners" accent="amber" /><StatCard label="Awaiting approvals" value={data.metrics.awaitingApprovals} icon={ShieldCheck} helper="exact payload review" accent="violet" /><StatCard label="Successful" value={data.metrics.successfulThisWeek} icon={Target} helper="outcomes verified" accent="teal" /></section>
      <section className="dashboard-grid">
        <div className="panel missions-panel"><div className="panel-heading"><div><span>MISSIONS</span><h2>{focus ? `${focus[0].toUpperCase()}${focus.slice(1)}` : "Execution portfolio"}</h2></div><span className="count-chip">{missions.length}</span></div>
          <div className="mission-table"><div className="mission-row mission-table-head"><span>Mission</span><span>State</span><span>Contract</span><span>Human gates</span><span>Progress</span><span /></div>
            {missions.map((mission) => <Link className="mission-row" to={`/missions/${mission.id}`} key={mission.id}><div className="mission-name"><span className={`mission-icon ${mission.blockingConflicts ? "blocked" : ""}`}>{mission.blockingConflicts ? <CircleStop size={18} /> : <Radar size={18} />}</span><div><b>{mission.title}</b><small>Updated {formatDate(mission.updatedAt, true)}</small></div></div><span><StatusPill value={mission.blockingConflicts ? "blocked" : mission.status} /></span><span className="mono">Plan v{mission.currentPlanVersion || "—"}</span><span className="human-gates">{mission.openConflicts ? <><Scale size={15} />{mission.openConflicts} decisions</> : mission.pendingApprovals ? <><ShieldCheck size={15} />{mission.pendingApprovals} approval</> : <><Check size={15} />Clear</>}</span><span><Progress value={mission.completedTasks} total={mission.totalTasks} /></span><ArrowRight size={17} /></Link>)}
          </div>
        </div>
        <aside className="panel attention-panel"><div className="panel-heading"><div><span>ATTENTION QUEUE</span><h2>What changed</h2></div></div>{data.missions.flatMap((mission) => [mission.blockingConflicts ? { mission, type: "Blocking conflict", count: mission.blockingConflicts, icon: AlertOctagon } : null, mission.pendingApprovals ? { mission, type: "Exact approval", count: mission.pendingApprovals, icon: ShieldCheck } : null]).filter(Boolean).slice(0, 5).map((item) => { const value = item!; const Icon = value.icon; return <Link to={`/missions/${value.mission.id}`} key={`${value.mission.id}-${value.type}`} className="attention-item"><span className="attention-icon"><Icon size={17} /></span><div><b>{value.type}</b><p>{value.mission.title}</p><small>{value.count} item{value.count > 1 ? "s" : ""} waiting</small></div><ArrowRight size={16} /></Link>; })}{!data.metrics.blocked && !data.metrics.awaitingApprovals && <div className="empty-state"><BadgeCheck size={25} /><b>No urgent human gates</b><p>Relay will surface decisions here.</p></div>}</aside>
      </section>
    </main></AppShell>
  );
}

function StatusPill({ value }: { value: string }) { return <span className={`status-pill status-${value.replaceAll("_", "-")}`}><span />{value.replaceAll("_", " ")}</span>; }
function Progress({ value, total }: { value: number; total: number }) { const percent = total ? Math.round((value / total) * 100) : 0; return <div className="progress-wrap"><div className="progress-track"><span style={{ width: `${percent}%` }} /></div><small>{value}/{total}</small></div>; }

const exampleSources: SourceInput[] = [
  { type: "Slack", title: "#kaohsiung-launch", author: "Growth lead", content: "We must launch on 7月29日. Target is 24 paid registrations. Do not promote to existing members.", authorityLevel: 4 },
  { type: "Email", title: "Client brand review", author: "Client", content: "All creative requires client brand approval before public release.", authorityLevel: 5 },
  { type: "Calendar", title: "Brand review", author: "Operations", content: "Brand approval review is scheduled for 7月30日.", authorityLevel: 4 },
  { type: "Notion", title: "Campaign brief v1", author: "Marketing", content: "Campaign budget limit: NT$20,000.", authorityLevel: 2 },
  { type: "Manual", title: "Executive update", author: "Mission owner", content: "The approved budget is NT$30,000 maximum. Nothing can be published without my approval.", authorityLevel: 5 },
  { type: "CRM", title: "Kaohsiung audience", author: "CRM system", content: "Current campaign audience contains existing members and new leads.", authorityLevel: 4 },
  { type: "Ads", title: "Meta Ads account", author: "Ads platform", content: "A payment method is missing; campaign publishing is unavailable.", authorityLevel: 5 },
];

function MissionIntakePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<CreateMissionInput>({ title: "", objective: "", successMetric: "", createdBy: "Jennifer", sources: [{ type: "Slack", title: "", author: "", content: "", authorityLevel: 3 }, { type: "Email", title: "", author: "", content: "", authorityLevel: 3 }] });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [stage, setStage] = useState("");
  const updateSource = (index: number, patch: Partial<SourceInput>) => setForm((current) => ({ ...current, sources: current.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, ...patch } : source) }));
  const loadExample = () => setForm({ title: "Launch Kaohsiung campaign", objective: "Launch the Kaohsiung event campaign by July 29 with a maximum approved budget and no promotion to existing members.", successMetric: "Acquire 24 paid registrations while keeping CPA at or below NT$1,250.", createdBy: "Jennifer", sources: exampleSources });
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(""); try { setStage("Securing source evidence…"); const created = await api<{ mission: MissionDetail }>("/api/missions", { method: "POST", body: JSON.stringify(form) }); setStage("Compiling intent and testing contradictions…"); await api(`/api/missions/${created.mission.id}/compile`, { method: "POST" }); navigate(`/missions/${created.mission.id}?view=conflicts&new=1`); } catch (err) { setError((err as Error).message); setBusy(false); setStage(""); } };
  return <AppShell><main className="page intake-page"><div className="page-title intake-title"><div><Link to="/app" className="back-link">← Workspace</Link><span className="page-kicker">MISSION INTAKE</span><h1>Give Relay the messy truth.</h1><p>Paste contradictory instructions as they exist. Relay will preserve the source, extract intent and stop unsafe execution.</p></div><button className="button button-ghost" onClick={loadExample}><Sparkles size={16} /> Load conflict-rich example</button></div>
    <form onSubmit={submit} className="intake-layout"><div className="intake-main"><section className="form-section"><div className="form-section-title"><span>01</span><div><h2>Define the outcome</h2><p>What must be true when this mission succeeds?</p></div></div><label>Mission name<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Launch Kaohsiung campaign" required minLength={3} /></label><label>Objective<textarea value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder="Launch by… within… while never…" required minLength={10} rows={4} /></label><label>Success contract<input value={form.successMetric} onChange={(event) => setForm({ ...form, successMetric: event.target.value })} placeholder="24 paid registrations at CPA ≤ NT$1,250" required /></label></section>
      <section className="form-section"><div className="form-section-title"><span>02</span><div><h2>Attach sources</h2><p>Add at least two messages, documents or system records.</p></div></div><div className="source-editor-list">{form.sources.map((source, index) => <article className="source-editor" key={index}><div className="source-editor-head"><span className={`source-number ${sourceColors[source.type] ?? "lime"}`}>{index + 1}</span><select value={source.type} onChange={(event) => updateSource(index, { type: event.target.value as SourceInput["type"] })}>{["Slack", "Email", "Notion", "Google Drive", "Calendar", "CRM", "Ads", "Meeting note", "Manual"].map((type) => <option key={type}>{type}</option>)}</select>{form.sources.length > 2 && <button type="button" className="icon-button" onClick={() => setForm({ ...form, sources: form.sources.filter((_, itemIndex) => itemIndex !== index) })}><X size={17} /></button>}</div><div className="form-grid"><label>Source title<input value={source.title} onChange={(event) => updateSource(index, { title: event.target.value })} placeholder="#launch or client thread" required /></label><label>Author / system<input value={source.author} onChange={(event) => updateSource(index, { author: event.target.value })} placeholder="Growth lead" required /></label></div><label>Exact content<textarea value={source.content} onChange={(event) => updateSource(index, { content: event.target.value })} placeholder="Paste the original instruction—do not clean it up." rows={4} required /></label><div className="authority-row"><span>Authority</span><input type="range" min="1" max="5" value={source.authorityLevel} onChange={(event) => updateSource(index, { authorityLevel: Number(event.target.value) })} /><b>{source.authorityLevel}/5</b></div></article>)}</div><button type="button" className="button button-ghost add-source" onClick={() => setForm({ ...form, sources: [...form.sources, { type: "Manual", title: "", author: "", content: "", authorityLevel: 3 }] })}><Plus size={17} /> Add another source</button></section></div>
      <aside className="compile-sidebar"><div className="compile-card"><div className="compile-icon"><Network /></div><span>WHAT RELAY WILL PRODUCE</span><h3>Versioned Execution Contract</h3><ul><li><Check /> Evidence-backed assertions</li><li><Check /> Blocking conflict inbox</li><li><Check /> Resolution alternatives</li><li><Check /> Governed task plan</li><li><Check /> Access blueprint</li><li><Check /> Exact approval requests</li></ul><div className="compile-notice"><ShieldCheck size={17} /><p>No external system will be changed. This step only analyzes the evidence you provide.</p></div>{error && <p className="form-error">{error}</p>}<button className="button button-primary button-full button-large" disabled={busy}>{busy ? <><span className="loader small" /> {stage}</> : <>Find conflicts in my mission <ArrowRight size={18} /></>}</button><small className="form-assurance">Source text is stored with its mission lineage.</small></div></aside>
    </form></main></AppShell>;
}

const missionTabs = [
  ["room", "Mission room", Activity], ["conflicts", "Conflicts", MessageSquareWarning], ["plan", "Plan", RouteIcon], ["access", "Access", KeyRound],
  ["approvals", "Approvals", ShieldCheck], ["evidence", "Evidence", FileCheck2], ["outcome", "Outcome", Target],
] as const;

function MissionPage() {
  const { id = "" } = useParams(); const [params, setParams] = useSearchParams(); const view = params.get("view") || "room";
  const [mission, setMission] = useState<MissionDetail>(); const [error, setError] = useState(""); const [busy, setBusy] = useState(""); const [notice, setNotice] = useState("");
  const load = () => { setError(""); api<{ mission: MissionDetail }>(`/api/missions/${id}`).then((response) => setMission(response.mission)).catch((err) => setError(err.message)); };
  useEffect(load, [id]);
  const action: MissionAction = async (key, request, message) => { setBusy(key); setNotice(""); setError(""); try { const response = await request as { mission: MissionDetail }; setMission(response.mission); if (message) setNotice(message); return response; } catch (err) { setError((err as Error).message); } finally { setBusy(""); } };
  if (error && !mission) return <AppShell><main className="page"><ErrorBlock error={error} retry={load} /></main></AppShell>;
  if (!mission) return <AppShell><main className="page"><LoadingBlock label="Loading mission contract…" /></main></AppShell>;
  const plan = mission.currentPlan; const isStale = plan?.status === "superseded";
  return <AppShell><main className="mission-page"><header className="mission-header"><div className="mission-breadcrumb"><Link to="/app">Missions</Link><span>/</span><b>{mission.title}</b></div><div className="mission-title-row"><div><div className="mission-title-meta"><StatusPill value={mission.blockingConflicts ? "blocked" : mission.status} /><span className="mono">Plan v{mission.currentPlanVersion}</span><span>Updated {formatDate(mission.updatedAt, true)}</span></div><h1>{mission.title}</h1><p>{mission.objective}</p></div><div className="mission-actions"><button className="button button-ghost" onClick={load}><RefreshCw size={16} /> Refresh</button>{mission.status === "planning" && <button className="button button-primary" disabled={busy === "plan"} onClick={() => action("plan", api<{ mission: MissionDetail }>(`/api/missions/${mission.id}/plan`, { method: "POST", body: JSON.stringify({ actor: "Jennifer" }) }), "A new active contract was created. Previous approvals were invalidated.")}><GitBranch size={16} /> Compile next version</button>}</div></div><nav className="mission-tabs">{missionTabs.map(([key, label, Icon]) => <button className={view === key ? "active" : ""} key={key} onClick={() => setParams({ view: key })}><Icon size={16} />{label}{key === "conflicts" && mission.openConflicts > 0 && <span>{mission.openConflicts}</span>}{key === "approvals" && mission.pendingApprovals > 0 && <span>{mission.pendingApprovals}</span>}</button>)}</nav></header>
    {(notice || error) && <div className={`toast-banner ${error ? "error" : ""}`}>{error ? <AlertOctagon size={17} /> : <BadgeCheck size={17} />}<span>{error || notice}</span><button className="icon-button" onClick={() => { setError(""); setNotice(""); }}><X size={15} /></button></div>}
    <div className="mission-content">{view === "room" && <MissionRoom mission={mission} action={action} busy={busy} setView={(next) => setParams({ view: next })} />}{view === "conflicts" && <ConflictInbox mission={mission} action={action} busy={busy} />}{view === "plan" && <PlanView mission={mission} action={action} busy={busy} />}{view === "access" && <AccessView mission={mission} />}{view === "approvals" && <ApprovalCenter mission={mission} action={action} busy={busy} isStale={isStale} />}{view === "evidence" && <EvidenceLedger mission={mission} />}{view === "outcome" && <OutcomeView mission={mission} action={action} busy={busy} />}</div>
  </main></AppShell>;
}

type MissionAction = (key: string, request: Promise<unknown>, message?: string) => Promise<{ mission: MissionDetail } | undefined>;

function MissionRoom({ mission, action, busy, setView }: { mission: MissionDetail; action: MissionAction; busy: string; setView: (view: string) => void }) {
  const [correction, setCorrection] = useState(""); const primaryConflict = mission.conflicts.find((conflict) => conflict.status === "open" && conflict.blocking);
  const plan = mission.currentPlan;
  return <div className="mission-grid"><section className="mission-primary"><div className={`control-banner ${primaryConflict ? "blocked" : "clear"}`}><div className="control-banner-icon">{primaryConflict ? <CircleStop /> : <ShieldCheck />}</div><div><span>{primaryConflict ? "EXECUTION PAUSED" : "CONTRACT CONTROLLED"}</span><h2>{primaryConflict ? `${mission.blockingConflicts} blocking conflict${mission.blockingConflicts > 1 ? "s" : ""} stop affected tasks` : `Plan v${mission.currentPlanVersion} is the active execution contract`}</h2><p>{primaryConflict ? "Relay will not let agents act on mutually incompatible instructions." : "Every task runs through version, capability, approval and rollback checks."}</p></div>{primaryConflict && <button className="button button-light" onClick={() => setView("conflicts")}>Resolve conflicts <ArrowRight size={16} /></button>}</div>
    {primaryConflict && <article className="aha-card"><div className="aha-label"><Zap size={15} /> FIRST MATERIAL CONFLICT</div><div className="aha-body"><div><h3>{primaryConflict.title}</h3><p>{primaryConflict.summary}</p></div><span className={`severity-tag ${primaryConflict.severity}`}>{primaryConflict.severity}</span></div><div className="aha-footer"><span><Scale size={15} /> Decision: {primaryConflict.decisionOwner}</span><span><Ban size={15} /> If ignored: {primaryConflict.consequences}</span></div></article>}
    <section className="panel room-section"><div className="panel-heading"><div><span>LIVE EXECUTION</span><h2>Task activity</h2></div><button className="text-button" onClick={() => setView("plan")}>Open full plan <ArrowRight size={15} /></button></div><div className="task-mini-list">{plan?.tasks.slice(0, 5).map((task) => <div className="task-mini" key={task.id}><span className={`task-state ${task.status}`}>{task.status === "completed" ? <Check size={15} /> : task.status === "blocked" ? <CircleStop size={15} /> : <span />}</span><div><b>{task.key} · {task.title}</b><small>{task.ownerType === "agent" ? <Bot size={13} /> : <UserRound size={13} />}{task.ownerName}</small></div><RiskBadge level={task.riskLevel} /><StatusPill value={task.status} /></div>)}</div></section>
    <section className="panel correction-panel"><div className="panel-heading"><div><span>HUMAN CORRECTION</span><h2>Changed assumption?</h2></div></div><p>A correction is not a chat message. Relay converts it into an assertion, impact analysis, plan invalidation and audit event.</p><textarea value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder="Example: The launch budget is now NT$18,000 and all paid media is paused." rows={3} /><button className="button button-dark" disabled={correction.length < 5 || busy === "correction"} onClick={() => action("correction", api<{ mission: MissionDetail }>(`/api/missions/${mission.id}/corrections`, { method: "POST", body: JSON.stringify({ statement: correction, assertionType: "Constraint", author: "Jennifer" }) }), "Correction recorded. The active contract and prior approvals were invalidated.").then(() => setCorrection(""))}><GitBranch size={16} /> Add correction & replan</button></section>
    </section><aside className="mission-secondary"><section className="panel contract-health"><div className="panel-heading"><div><span>CONTRACT HEALTH</span><h2>Plan v{mission.currentPlanVersion}</h2></div><span className={`health-score ${mission.blockingConflicts ? "bad" : ""}`}>{mission.blockingConflicts ? "42" : "92"}</span></div><div className="health-row"><span>Source coverage</span><b>{mission.assertions.filter((a) => a.sourceId).length}/{mission.assertions.length}</b></div><div className="health-row"><span>Blocking conflicts</span><b className={mission.blockingConflicts ? "danger-text" : ""}>{mission.blockingConflicts}</b></div><div className="health-row"><span>Verified access</span><b>{plan?.accessBlueprint.filter((item) => item.status === "verified").length ?? 0}/{plan?.accessBlueprint.length ?? 0}</b></div><div className="health-row"><span>Valid approvals</span><b>{plan?.approvals.filter((item) => item.status === "approved").length ?? 0}/{plan?.approvals.length ?? 0}</b></div></section>
      <section className="panel outcome-preview"><div className="panel-heading"><div><span>OUTCOME CONTRACT</span><h2>{mission.outcome?.status.replaceAll("_", " ")}</h2></div><Target size={20} /></div><b>{mission.successMetric}</b><Progress value={mission.completedTasks} total={mission.totalTasks} /><button className="text-button" onClick={() => setView("outcome")}>Update result <ArrowRight size={15} /></button></section>
      <section className="panel presence-panel"><div className="panel-heading"><div><span>MISSION ROOM</span><h2>Human + agent team</h2></div><span className="presence-live"><span /> LIVE</span></div><div className="presence-stack"><span className="avatar lime">JE</span><span className="avatar violet">GA</span><span className="avatar blue">OA</span><span className="avatar dark">+2</span></div><p>Jennifer, Planning Agent and Operations Agent can inspect this same contract.</p></section>
    </aside></div>;
}

function ConflictInbox({ mission, action, busy }: { mission: MissionDetail; action: MissionAction; busy: string }) {
  const [selected, setSelected] = useState<Record<string, string>>({}); const [reasons, setReasons] = useState<Record<string, string>>({});
  const open = mission.conflicts.filter((conflict) => conflict.status === "open"); const resolved = mission.conflicts.filter((conflict) => conflict.status === "resolved");
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">CONFLICT COMPILER</span><h2>{open.length ? `${open.length} contradictions need a decision` : "Organizational intent is resolved"}</h2><p>Blocking conflicts stop only the affected execution path. Every resolution becomes part of the next contract.</p></div><div className="conflict-summary"><span><AlertOctagon />{mission.blockingConflicts} blocking</span><span><Scale />{open.length} open</span><span><Check />{resolved.length} resolved</span></div></div>
    {open.map((conflict, index) => <article className={`conflict-card ${conflict.blocking ? "blocking" : ""}`} key={conflict.id}><div className="conflict-number">C-{String(index + 1).padStart(2, "0")}</div><div className="conflict-card-main"><div className="conflict-head"><div><div className="conflict-tags"><span className={`severity-tag ${conflict.severity}`}>{conflict.severity}</span><span>{conflict.type}</span>{conflict.blocking && <span className="blocking-tag"><CircleStop size={13} /> Blocks execution</span>}</div><h3>{conflict.title}</h3><p>{conflict.summary}</p></div><div className="decision-owner"><span>DECISION OWNER</span><b><UserRound size={15} />{conflict.decisionOwner}</b>{conflict.decisionDueAt && <small>Due {conflict.decisionDueAt}</small>}</div></div><div className="consequence"><Ban size={17} /><div><span>IF UNRESOLVED</span><p>{conflict.consequences}</p></div></div><div className="resolution-options">{conflict.options.map((option) => <label className={`resolution-option ${selected[conflict.id] === option.id ? "selected" : ""} ${option.recommended ? "recommended" : ""}`} key={option.id}><input type="radio" name={conflict.id} value={option.id} checked={selected[conflict.id] === option.id} onChange={() => setSelected({ ...selected, [conflict.id]: option.id })} /><div className="option-top"><b>{option.label}</b>{option.recommended && <span><Sparkles size={13} /> Relay recommends</span>}</div><p>{option.description}</p><div className="option-impact"><span><Clock3 />{option.timeImpact}</span><span><CircleDollarSign />{option.budgetImpact}</span><span><ShieldCheck />{option.risk}</span></div></label>)}</div>{selected[conflict.id] && <div className="resolution-submit"><textarea placeholder="Why is this the right decision? This becomes permanent evidence." value={reasons[conflict.id] ?? ""} onChange={(event) => setReasons({ ...reasons, [conflict.id]: event.target.value })} rows={2} /><button className="button button-primary" disabled={(reasons[conflict.id]?.length ?? 0) < 3 || busy === conflict.id} onClick={() => action(conflict.id, api<{ mission: MissionDetail }>(`/api/conflicts/${conflict.id}/resolve`, { method: "POST", body: JSON.stringify({ optionId: selected[conflict.id], reason: reasons[conflict.id], decidedBy: "Jennifer" }) }), "Decision recorded. Resolve remaining blockers, then compile the next plan version.")}><Check size={16} /> Record decision</button></div>}</div></article>)}
    {!open.length && <div className="resolved-celebration"><BadgeCheck /><div><h3>All conflicts have an explicit decision.</h3><p>Compile the next plan version to convert those decisions into task constraints, invalidate stale approvals and activate execution.</p></div>{mission.status === "planning" && <button className="button button-primary" disabled={busy === "plan"} onClick={() => action("plan", api<{ mission: MissionDetail }>(`/api/missions/${mission.id}/plan`, { method: "POST", body: JSON.stringify({ actor: "Jennifer" }) }), "Plan activated.")}><GitBranch size={17} /> Compile Plan v{mission.currentPlanVersion + 1}</button>}</div>}
    {resolved.length > 0 && <section className="resolved-list"><div className="panel-heading"><div><span>DECISION HISTORY</span><h2>Resolved conflicts</h2></div></div>{resolved.map((conflict) => <div className="resolved-item" key={conflict.id}><Check size={17} /><div><b>{conflict.title}</b><p>{conflict.resolution?.decision}</p><small>{conflict.resolution?.decidedBy} · {formatDate(conflict.resolution?.createdAt, true)}</small></div></div>)}</section>}
  </div>;
}

function RiskBadge({ level }: { level: number }) { const labels = ["Read", "Draft", "Internal write", "External", "High impact"]; return <span className={`risk-badge risk-${level}`}>L{level} · {labels[level]}</span>; }

function PlanView({ mission, action, busy }: { mission: MissionDetail; action: MissionAction; busy: string }) {
  const [selectedVersion, setSelectedVersion] = useState(mission.currentPlanVersion); const [openTask, setOpenTask] = useState("");
  const plan = mission.planVersions.find((item) => item.version === selectedVersion) ?? mission.currentPlan;
  if (!plan) return <div className="empty-state large"><RouteIcon /><h3>No execution plan yet</h3><p>Compile mission intent first.</p></div>;
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">VERSIONED EXECUTION CONTRACT</span><h2>Plan v{plan.version} · {plan.status}</h2><p>{plan.changeSummary}</p></div><div className="version-picker"><span>Version</span><select value={selectedVersion} onChange={(event) => setSelectedVersion(Number(event.target.value))}>{[...mission.planVersions].reverse().map((item) => <option key={item.id} value={item.version}>Plan v{item.version} · {item.status}</option>)}</select></div></div>
    <section className="contract-invariants"><div><Fingerprint /><span>CONTRACT INVARIANTS</span></div>{plan.contract.invariants.map((item) => <p key={item}><LockKeyhole size={14} />{item}</p>)}</section>
    {plan.diff.length > 0 && <section className="panel diff-panel"><div className="panel-heading"><div><span>VERSION DIFF</span><h2>What changed</h2></div><GitBranch size={20} /></div><div className="diff-list">{plan.diff.map((item, index) => <div className={`diff-item ${item.kind}`} key={index}><span>{item.kind === "added" ? "+" : item.kind === "invalidated" ? "×" : "~"}</span><div><b>{item.label}</b><p>{item.detail}</p></div></div>)}</div></section>}
    <section className="task-graph"><div className="task-graph-head"><span>TASK GRAPH</span><div><span><Bot size={14} /> Agent owner</span><span><UserRound size={14} /> Human owner</span></div></div>{plan.tasks.map((task) => <article className={`task-card ${openTask === task.id ? "open" : ""}`} key={task.id}><button className="task-summary" onClick={() => setOpenTask(openTask === task.id ? "" : task.id)}><span className={`task-state large ${task.status}`}>{task.status === "completed" ? <Check size={17} /> : task.status === "blocked" ? <CircleStop size={17} /> : task.status === "running" ? <Activity size={17} /> : <span />}</span><div className="task-key"><b>{task.key}</b><small>{task.dependencies.length ? `after ${task.dependencies.join(", ")}` : "root task"}</small></div><div className="task-title"><b>{task.title}</b><small>{task.goal}</small></div><span className="task-owner">{task.ownerType === "agent" ? <Bot size={15} /> : <UserRound size={15} />}{task.ownerName}</span><RiskBadge level={task.riskLevel} /><StatusPill value={task.status} /><ChevronDown size={18} /></button>{openTask === task.id && <div className="task-details"><div className="task-detail-grid"><TaskDetail label="Definition of done" value={task.definitionOfDone} icon={BadgeCheck} /><TaskDetail label="Approval policy" value={task.approvalPolicy} icon={ShieldCheck} /><TaskDetail label="Stop condition" value={task.stopCondition} icon={CircleStop} /><TaskDetail label="Rollback" value={task.rollbackStrategy} icon={TimerReset} /></div><div className="task-lists"><div><span>REQUIRED CAPABILITIES</span>{task.requiredCapabilities.length ? task.requiredCapabilities.map((item) => <p key={item}><KeyRound />{item}</p>) : <p><Check />No external capability</p>}</div><div><span>FORBIDDEN ACTIONS</span>{task.forbiddenActions.map((item) => <p key={item}><Ban />{item}</p>)}</div><div><span>REQUIRED EVIDENCE</span>{task.requiredEvidence.map((item) => <p key={item}><FileCheck2 />{item}</p>)}</div></div>{task.preflight && <PreflightPanel result={task.preflight} />}{plan.version === mission.currentPlanVersion && !["completed", "failed"].includes(task.status) && task.key !== "T-06" && <div className="task-run"><div><b>Run preflight before execution</b><p>Relay will return a precise blocker and next action if this task cannot run.</p></div><button className="button button-dark" disabled={busy === task.id} onClick={() => action(task.id, api<{ mission: MissionDetail }>(`/api/tasks/${task.id}/run`, { method: "POST", body: JSON.stringify({ actor: task.ownerName }) }), task.riskLevel <= 1 ? "Task completed under a passing execution contract." : undefined)}><Play size={16} /> Preflight & run</button></div>}</div>}</article>)}</section>
  </div>;
}

function TaskDetail({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Check }) { return <div className="task-detail"><Icon size={17} /><div><span>{label}</span><p>{value}</p></div></div>; }
function PreflightPanel({ result }: { result: NonNullable<ExecutionTask["preflight"]> }) { return <div className={`preflight-panel ${result.canRun ? "pass" : "fail"}`}><div className="preflight-head">{result.canRun ? <BadgeCheck /> : <CircleStop />}<div><span>PREFLIGHT {result.canRun ? "PASSED" : "BLOCKED"}</span><b>{result.canRun ? "All execution conditions are valid" : "Relay stopped this task safely"}</b></div><small>{formatDate(result.checkedAt, true)}</small></div><div className="check-list">{result.checks.map((check) => <div className={check.passed ? "passed" : "failed"} key={check.name}>{check.passed ? <Check /> : <X />}<div><b>{check.name}</b><p>{check.detail}</p>{check.nextAction && <small>Next: {check.nextAction}</small>}</div></div>)}</div></div>; }

function AccessView({ mission }: { mission: MissionDetail }) {
  const plan = mission.currentPlan; const [ceremony, setCeremony] = useState(false);
  if (!plan) return null;
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">ONE MISSION · ONE ACCESS BLUEPRINT</span><h2>Connect only what this plan needs.</h2><p>Relay derived these capabilities from task requirements. No provider is called “connected” until a real resource-level verification passes.</p></div><button className="button button-primary" onClick={() => setCeremony(true)}><Link2 size={17} /> Connect this mission</button></div>
    <div className="access-summary"><div><Network /><span>{plan.accessBlueprint.length}</span><small>providers required</small></div><div><KeyRound /><span>{plan.accessBlueprint.reduce((sum, item) => sum + item.capabilities.length, 0)}</span><small>scoped capabilities</small></div><div><BadgeCheck /><span>{plan.accessBlueprint.filter((item) => item.status === "verified").length}</span><small>verified grants</small></div><div><Clock3 /><span>v{plan.version}</span><small>manifest version</small></div></div>
    <div className="access-grid">{plan.accessBlueprint.map((access) => <article className="access-card" key={access.id}><div className="access-head"><span className={`provider-icon ${sourceColors[access.provider] ?? "lime"}`}>{access.provider.slice(0, 2).toUpperCase()}</span><div><h3>{access.provider}</h3><StatusPill value={access.status} /></div><span className={`access-level level-${access.accessLevel}`}>{access.accessLevel}</span></div><div className="access-why"><span>WHY NEEDED</span><p>{access.whyNeeded}</p></div><div className="capability-list">{access.capabilities.map((item) => <p key={item}><Check />{item}</p>)}</div><div className="scope-box"><LockKeyhole size={16} /><div><span>RESOURCE SCOPE</span><p>{access.resourceScope}</p></div></div><div className="access-footer"><span>Tasks: {access.taskKeys.join(", ")}</span><span>{access.expiration ? `Expires ${formatDate(access.expiration)}` : "No grant issued"}</span></div></article>)}</div>
    <section className="truth-banner"><ShieldCheck /><div><b>Truthful connector state</b><p>This MVP has not issued OAuth grants. These cards are a compiled Access Blueprint—not simulated provider connections. Production OAuth verification will be added provider by provider.</p></div></section>
    {ceremony && <div className="modal-scrim" onClick={() => setCeremony(false)}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" onClick={() => setCeremony(false)}><X /></button><div className="modal-icon"><KeyRound /></div><span className="page-kicker">CONNECTION CEREMONY</span><h2>Access queue compiled.</h2><p>Relay will request each provider independently, verify the exact resource scope, then create an immutable Access Manifest for Plan v{plan.version}.</p><div className="ceremony-list">{plan.accessBlueprint.map((item, index) => <div key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><b>{item.provider}</b><small>{item.accessLevel} · {item.status.replaceAll("_", " ")}</small></div>)}</div><div className="modal-warning"><AlertOctagon /><p>OAuth is intentionally not simulated. Provider authorization remains unavailable until its real callback, vault storage and verification check are configured.</p></div><button className="button button-dark button-full" onClick={() => setCeremony(false)}>Return to access blueprint</button></div></div>}
  </div>;
}

function ApprovalCenter({ mission, action, busy, isStale }: { mission: MissionDetail; action: MissionAction; busy: string; isStale: boolean }) {
  const plan = mission.currentPlan; if (!plan) return null;
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">EXACT APPROVAL CENTER</span><h2>Approve the action—not the idea.</h2><p>Every decision is locked to one plan version, exact payload, audience, budget, stop condition and expiration.</p></div><div className="approval-stats"><span>{plan.approvals.filter((item) => item.status === "pending").length} pending</span><span>{plan.approvals.filter((item) => item.status === "approved").length} approved</span></div></div>
    {plan.approvals.map((approval) => <article className={`approval-card ${approval.status}`} key={approval.id}><div className="approval-top"><div className="approval-icon"><ShieldCheck /></div><div><div className="approval-label"><span>RISK LEVEL 3 · EXTERNAL ACTION</span><StatusPill value={approval.status} /></div><h3>{approval.action}</h3><p>Requested by {approval.requester} · Plan v{plan.version}</p></div><div className="approval-expiry"><Clock3 /><span>EXPIRES</span><b>{formatDate(approval.expiresAt, true)}</b></div></div><div className="payload-grid">{Object.entries(approval.exactPayload).map(([key, value]) => <div key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><b>{typeof value === "number" && key.toLowerCase().includes("budget") ? formatMoney(value) : String(value)}</b></div>)}</div><div className="payload-hash"><Fingerprint /><div><span>PAYLOAD HASH</span><code>{approval.payloadHash}</code></div><LockKeyhole size={16} /></div><div className="approval-guard"><CircleStop /><div><b>Automatic stop condition</b><p>{approval.stopCondition}</p></div></div>{approval.reason && <div className="decision-reason"><b>Decision evidence</b><p>{approval.reason}</p><small>{approval.approver} · {formatDate(approval.decidedAt, true)}</small></div>}{approval.status === "pending" && <div className="approval-actions"><div>{isStale || mission.blockingConflicts ? <p className="danger-text"><Ban size={15} /> Approval disabled: {isStale ? "plan is superseded" : "blocking conflicts remain"}.</p> : <p><BadgeCheck size={15} /> This payload matches the active contract.</p>}</div><button className="button button-ghost" disabled={busy === approval.id || isStale} onClick={() => action(approval.id, api(`/api/approvals/${approval.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "rejected", decidedBy: "Jennifer", reason: "Rejected after exact payload review." }) }), "Approval rejected and evidence recorded.")}><X size={16} /> Reject</button><button className="button button-primary" disabled={busy === approval.id || isStale || mission.blockingConflicts > 0} onClick={() => action(approval.id, api(`/api/approvals/${approval.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "approved", decidedBy: "Jennifer", reason: "Exact payload, audience, budget and stop condition reviewed and approved." }) }), "Exact approval recorded for this plan version and payload hash.")}><ShieldCheck size={16} /> Approve exact payload</button></div>}</article>)}
  </div>;
}

function EvidenceLedger({ mission }: { mission: MissionDetail }) {
  const [mode, setMode] = useState<"events" | "sources" | "assertions">("events");
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">IMMUTABLE LINEAGE</span><h2>Evidence ledger</h2><p>Answer why an agent acted, which version governed it, who approved it and what result followed.</p></div><div className="segmented">{(["events", "sources", "assertions"] as const).map((item) => <button className={mode === item ? "active" : ""} onClick={() => setMode(item)} key={item}>{item}</button>)}</div></div>
    {mode === "events" && <section className="ledger"><div className="ledger-head"><span>Timestamp</span><span>Actor</span><span>Event</span><span>Evidence summary</span><span>Version</span></div>{mission.auditEvents.map((event) => <div className="ledger-row" key={event.id}><span className="mono">{formatDate(event.createdAt, true)}</span><span className="ledger-actor">{event.actorType === "human" ? <UserRound /> : event.actorType === "agent" ? <Bot /> : <Blocks />}{event.actorName}</span><code>{event.eventType}</code><div><b>{event.summary}</b><small>{event.entityType}{event.entityId ? ` · ${event.entityId.slice(0, 8)}` : ""}</small></div><span className="mono">{event.planVersion ? `v${event.planVersion}` : "—"}</span></div>)}</section>}
    {mode === "sources" && <div className="evidence-grid">{mission.sources.map((source) => <article className="evidence-card" key={source.id}><div className="evidence-source"><span className={`provider-icon ${sourceColors[source.type] ?? "lime"}`}>{source.type.slice(0, 2).toUpperCase()}</span><div><b>{source.title}</b><small>{source.type} · {source.author}</small></div><span>Authority {source.authorityLevel}/5</span></div><blockquote>{source.content}</blockquote><div className="evidence-meta"><span><Clock3 />{formatDate(source.occurredAt || source.createdAt, true)}</span><code>{source.id.slice(0, 8)}</code></div></article>)}</div>}
    {mode === "assertions" && <div className="assertion-table"><div className="assertion-head"><span>Type</span><span>Statement</span><span>Source</span><span>Confidence</span><span>Authority</span></div>{mission.assertions.map((assertion) => <div className="assertion-row" key={assertion.id}><span className="assertion-type">{assertion.type}</span><b>{assertion.statement}</b><code>{assertion.sourceId?.slice(0, 8) || "mission"}</code><span>{Math.round(assertion.confidence * 100)}%</span><span>{assertion.authorityLevel}/5</span></div>)}</div>}
  </div>;
}

function OutcomeView({ mission, action, busy }: { mission: MissionDetail; action: MissionAction; busy: string }) {
  const initial: Omit<Outcome, "id" | "blockers" | "updatedAt"> = mission.outcome ?? { metricName: mission.successMetric, targetValue: mission.successMetric, actualValue: "", status: "not_started", cost: 0, durationMinutes: 0, humanInterventions: 0, recommendation: "" };
  const [form, setForm] = useState(initial);
  return <div className="outcome-layout"><section className="outcome-main"><div className="view-heading"><div><span className="page-kicker">INTENT → OUTCOME</span><h2>Did the mission actually work?</h2><p>Task completion is not success. Close the loop with the agreed metric, cost, time and interventions.</p></div></div><div className="outcome-contract"><span>ORIGINAL SUCCESS CONTRACT</span><h3>{mission.successMetric}</h3><div><Target /><span>Plan v{mission.currentPlanVersion}</span><span>•</span><span>Created by {mission.createdBy}</span></div></div><form className="outcome-form" onSubmit={(event) => { event.preventDefault(); action("outcome", api(`/api/missions/${mission.id}/outcome`, { method: "PUT", body: JSON.stringify(form) }), "Outcome and mission learning recorded."); }}><div className="form-grid"><label>Metric name<input value={form.metricName} onChange={(event) => setForm({ ...form, metricName: event.target.value })} /></label><label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Outcome["status"] })}><option value="not_started">Not started</option><option value="on_track">On track</option><option value="at_risk">At risk</option><option value="achieved">Achieved</option><option value="missed">Missed</option></select></label></div><label>Target<input value={form.targetValue} onChange={(event) => setForm({ ...form, targetValue: event.target.value })} /></label><label>Actual result<input value={form.actualValue} onChange={(event) => setForm({ ...form, actualValue: event.target.value })} placeholder="Example: 26 paid registrations at NT$1,110 CPA" /></label><div className="form-grid three"><label>Total cost (TWD)<input type="number" min="0" value={form.cost} onChange={(event) => setForm({ ...form, cost: Number(event.target.value) })} /></label><label>Duration (minutes)<input type="number" min="0" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} /></label><label>Human interventions<input type="number" min="0" value={form.humanInterventions} onChange={(event) => setForm({ ...form, humanInterventions: Number(event.target.value) })} /></label></div><label>Next-mission recommendation<textarea rows={4} value={form.recommendation} onChange={(event) => setForm({ ...form, recommendation: event.target.value })} placeholder="What should Relay change next time?" /></label><button className="button button-primary" disabled={busy === "outcome"}><Target size={17} /> Save verified outcome</button></form></section><aside className="outcome-side"><section className="panel outcome-score"><span>MISSION RESULT</span><div className={`outcome-ring ${form.status}`}><strong>{form.status === "achieved" ? "100" : form.status === "on_track" ? "72" : form.status === "at_risk" ? "48" : form.status === "missed" ? "18" : "—"}</strong><small>{form.status.replaceAll("_", " ")}</small></div><div className="health-row"><span>Cost</span><b>{formatMoney(form.cost)}</b></div><div className="health-row"><span>Human interventions</span><b>{form.humanInterventions}</b></div><div className="health-row"><span>Open blockers</span><b>{mission.openConflicts}</b></div></section><section className="panel moat-card"><Network /><span>INTENT-TO-OUTCOME DATA</span><h3>This is Relay’s compounding asset.</h3><p>Every result connects the original intent, decisions, plan, permissions, execution and human corrections.</p></section></aside></div>;
}

function NotFound() { return <div className="not-found"><Logo /><h1>That contract doesn’t exist.</h1><p>Return to the Relay control center.</p><Link className="button button-primary" to="/app">Open workspace</Link></div>; }

export default function App() {
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  if (location.pathname === "/") return <LandingPage />;
  if (location.pathname === "/app") return <DashboardPage />;
  if (location.pathname === "/missions/new") return <MissionIntakePage />;
  if (/^\/missions\/[^/]+$/.test(location.pathname)) return <MissionPage />;
  return <NotFound />;
}
