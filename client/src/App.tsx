import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from "./router";
import type { Edge, MarkerType } from "@xyflow/react";
import type { MissionFlowNode } from "./ExecutionFlowCanvas";
import {
  Activity, AlertOctagon, ArrowRight, BadgeCheck, Ban, Blocks, Bot, Braces, CalendarDays, Check, ChevronDown, CircleDollarSign, Copy,
  CircleStop, Clock3, Database, ExternalLink, FileCheck2, FileText, Fingerprint, GitBranch, History, KeyRound, LayoutDashboard,
  Link2, LockKeyhole, Mail, Maximize2, Menu, MessageSquareWarning, Network, PanelRightClose, PanelRightOpen,
  Play, Plus, Radar, RefreshCw, Route as RouteIcon, Scale, Search, Send, ShieldCheck, Sparkles, Target, TimerReset,
  UserRound, UsersRound, X, Zap,
} from "lucide-react";
import { api, formatDate, formatMoney } from "./api";
import { localizeDomainText, localizeLabel, localizePayloadKey, tr, useLocale } from "./i18n";
import { parseQuickMission } from "./quickMission";
import type {
  ApprovalRequest, Conflict, CreateMissionInput, ExecutionTask, MissionDetail, MissionSummary, Outcome, PlanVersion, SourceInput,
} from "@shared/domain";

type DashboardResponse = {
  missions: MissionSummary[];
  metrics: { active: number; blocked: number; awaitingDecisions: number; awaitingApprovals: number; successfulThisWeek: number };
};

type CompilerPreview = {
  receipt: { sources: number; assertions: number; conflicts: number; blocking: number };
  conflict: Conflict | null;
  evidence: Array<{ id: string; statement: string; assertionType: string; sourceType: string; sourceTitle: string; author: string }>;
  execution: { tasks: number; agentTasks: number; blockedAgents: number; requiredProviders: number };
  saved: false;
};

const navigation = [
  { label: "Overview", labelZh: "總覽", href: "/app", icon: LayoutDashboard },
  { label: "Missions", labelZh: "任務", href: "/app", icon: Radar },
  { label: "Conflict inbox", labelZh: "衝突收件匣", href: "/app?focus=conflicts", icon: MessageSquareWarning },
  { label: "Approvals", labelZh: "核准中心", href: "/app?focus=approvals", icon: ShieldCheck },
];

const sourceColors: Record<string, string> = {
  Slack: "violet", Email: "coral", Gmail: "coral", Notion: "stone", "Google Drive": "blue", Calendar: "amber",
  "Google Calendar": "amber", CRM: "teal", Ads: "pink", Manual: "lime", "Meeting note": "blue",
};

const ExecutionFlowCanvas = lazy(() => import("./ExecutionFlowCanvas"));

function Logo({ compact = false }: { compact?: boolean }) {
  return <Link to="/" className={`logo ${compact ? "logo-compact" : ""}`} aria-label={tr("Relay home", "Relay 首頁")}><span className="logo-mark"><span /><span /><span /></span><span>relay</span></Link>;
}

function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLocale();
  return <div className={`language-switcher ${compact ? "compact" : ""}`} role="group" aria-label={tr("Language", "語言")}>
    <button className={locale === "zh-TW" ? "active" : ""} onClick={() => setLocale("zh-TW")} type="button" aria-pressed={locale === "zh-TW"}>繁中</button>
    <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")} type="button" aria-pressed={locale === "en"}>EN</button>
  </div>;
}

function PublicHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="public-header">
      <Logo />
      <nav className={open ? "public-nav open" : "public-nav"}>
        <a href="#wedge">{tr("Who it is for", "適合誰")}</a><a href="#multiplayer">{tr("Multiplayer mission", "多人 Mission")}</a><a href="#proof">{tr("What is real", "目前可用")}</a>
        <LanguageSwitcher compact />
        <Link to="/demo" className="text-link">{tr("Interactive demo", "可操作範例")}</Link>
        <Link to="/missions/new" className="button button-small button-dark">{tr("Analyze a launch", "分析 Launch")} <ArrowRight size={15} /></Link>
      </nav>
      <button className="icon-button mobile-menu" onClick={() => setOpen((value) => !value)} aria-label={tr("Toggle menu", "開關選單")}><Menu size={20} /></button>
    </header>
  );
}

function LandingMagicCompiler({ onOpenFullMission }: { onOpenFullMission: () => void }) {
  const { locale } = useLocale();
  const sampleBrief = locale === "zh-TW"
    ? `Mission：推出高雄活動行銷專案\n目標：7 月 29 日前上線，取得 24 筆付費報名\nSlack｜Growth 負責人：不得向既有會員推廣\nEmail｜客戶：所有公開素材都必須先通過品牌核准\nCalendar｜營運：品牌審查排在 7 月 30 日\nNotion｜行銷：預算上限是 NT$20,000\nManual｜Mission owner：核准預算上限是 NT$30,000，未經我核准不得發布\nCRM｜CRM system：目前受眾同時包含既有會員與新名單\nAds｜Meta Ads：缺少付款方式，目前無法發布\n成功指標：24 筆付費報名，CPA 不高於 NT$1,250`
    : `Mission: Launch the Kaohsiung campaign\nGoal: Launch by July 29 and acquire 24 paid registrations\nSlack | Growth lead: Do not promote to existing members\nEmail | Client: Every public creative requires brand approval\nCalendar | Operations: Brand review is scheduled for July 30\nNotion | Marketing: Budget limit is NT$20,000\nManual | Mission owner: Approved budget is NT$30,000 and nothing can publish without my approval\nCRM | CRM system: Current audience includes existing members and new leads\nAds | Meta Ads: Payment method is missing, so publishing is unavailable\nSuccess: 24 paid registrations at CPA no higher than NT$1,250`;
  const [brief, setBrief] = useState(sampleBrief);
  const [preview, setPreview] = useState<CompilerPreview>();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const compilePreview = useCallback(async (rawBrief: string) => {
    setBusy(true); setError("");
    try {
      const result = await api<CompilerPreview>("/api/preview-compile", { method: "POST", body: JSON.stringify(parseQuickMission(rawBrief)) });
      setPreview(result); setEditing(false);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    setBrief(sampleBrief);
    void compilePreview(sampleBrief);
  }, [locale]);

  const result = preview?.conflict;
  const recommended = result?.options.find((option) => option.recommended);
  const attachedSourceCount = brief.split("\n").filter((line) => /^(Slack|Email|Calendar|Notion|Manual|CRM|Ads)[｜|]/i.test(line)).length;
  const sourceLines = brief.split("\n").filter((line) => /^(Slack|Email|Calendar|Notion|Manual|CRM|Ads)[｜|]/i.test(line)).slice(0, 3);

  return <div className="magic-compiler" id="magic" aria-live="polite">
    <div className="magic-topbar"><span><Braces size={14} /> {tr("LIVE INTENT COMPILER", "真實意圖編譯器")}</span><span className="magic-runtime"><span /> {tr("RUNNING REAL RULES", "執行真實規則")}</span></div>
    <div className="magic-input">
      <div className="magic-input-head"><div><span>01 / {tr("MESSY BRIEF", "混亂 BRIEF")}</span><b>{tr("7 sources disagree", "7 個來源互相矛盾")}</b></div><button type="button" onClick={() => setEditing((value) => !value)}>{editing ? tr("Close editor", "收起編輯") : tr("Edit the evidence", "編輯來源")}</button></div>
      {editing ? <div className="magic-editor"><textarea aria-label={tr("Mission brief to compile", "要編譯的 Mission Brief")} value={brief} onChange={(event) => setBrief(event.target.value)} rows={10} /><button className="button button-primary button-full" type="button" disabled={busy || brief.trim().length < 10} onClick={() => { void compilePreview(brief); }}>{busy ? <><span className="loader small" /> {tr("Compiling…", "編譯中…")}</> : <><Zap size={16} /> {tr("Run the real compiler", "執行真實編譯")}</>}</button></div>
        : <div className="magic-source-list">{sourceLines.map((line) => { const [provider, ...parts] = line.split(/[：:]/); return <div key={line}><span>{provider.split(/[｜|]/)[0]}</span><p>{parts.join(":")}</p><FileCheck2 size={13} /></div>; })}<small>+{Math.max(0, attachedSourceCount - sourceLines.length)} {tr("more attached sources", "個已附來源")}</small></div>}
    </div>
    <div className="magic-compile-rail"><span /><Zap size={17} /><b>{busy ? tr("COMPILING", "編譯中") : tr("CONTRACT CHECKED", "合約已檢查")}</b><span /></div>
    {busy && !preview ? <div className="magic-loading"><span className="loader" /><p>{tr("Extracting assertions and testing execution gates…", "正在拆解主張並檢查執行關卡…")}</p></div> : error ? <div className="magic-error"><AlertOctagon /><p>{error}</p><button onClick={() => { void compilePreview(brief); }}>{tr("Try again", "再試一次")}</button></div> : result && preview ? <div className="magic-result">
      <div className="magic-receipt"><span>{tr("COMPILER RECEIPT", "編譯器憑據")}</span><div><b>{preview.receipt.sources}</b><small>{tr("sources", "來源")}</small></div><div><b>{preview.receipt.assertions}</b><small>{tr("assertions", "主張")}</small></div><div><b>{preview.receipt.conflicts}</b><small>{tr("conflicts", "衝突")}</small></div></div>
      <div className="magic-stop"><span className="magic-stop-icon"><CircleStop size={22} /></span><div><span>{tr("RELAY STOPPED EXECUTION", "RELAY 已停止執行")}</span><h3>{localizeDomainText(result.title)}</h3><p>{localizeDomainText(result.summary)}</p></div><span className="severity-pill">{localizeLabel(result.severity)}</span></div>
      <div className="magic-evidence"><span>{tr("WHY", "為什麼")}</span>{preview.evidence.slice(0, 2).map((item) => <div key={item.id}><FlowSourceIcon type={item.sourceType} /><p><b>{localizeDomainText(item.statement)}</b><small>{localizeLabel(item.sourceType)} · {localizeDomainText(item.author)}</small></p></div>)}</div>
      <div className="magic-control"><div><span><Bot size={14} /> {preview.execution.blockedAgents} {tr("agent tasks paused", "個 Agent 任務已暫停")}</span><span><LockKeyhole size={14} /> {preview.execution.requiredProviders} {tr("scoped providers", "個權限範圍")}</span></div><p><Sparkles size={15} /><span><b>{tr("NEXT SAFE ACTION", "下一步安全行動")}</b>{localizeDomainText(recommended?.description ?? result.consequences)}</span></p><button className="button button-primary button-full" type="button" onClick={onOpenFullMission}>{tr("Turn this into an execution contract", "把它變成可執行合約")} <ArrowRight size={17} /></button></div>
      <small className="magic-truth"><ShieldCheck size={13} /> {tr("This result came from the live Relay compiler. Preview text is not stored.", "這是 Relay 真實編譯器的即時結果；預覽文字不會被保存。")}</small>
    </div> : null}
  </div>;
}

function LandingPage() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  return (
    <div className="landing">
      <PublicHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="pulse-dot" /> {tr("THE EXECUTION CONTROL PLANE FOR AI-NATIVE TEAMS", "給 AI 原生團隊的執行控制層")}</div>
            <h1>{locale === "zh-TW" ? <><span className="hero-line">團隊給 AI 七個版本。</span><span className="hero-line">Relay 只讓它執行</span><span className="hero-line hero-accent-line">安全的那一個。</span></> : <><span className="hero-line">Your team gave AI seven versions.</span><span className="hero-line hero-accent-line">Relay executes only the safe one.</span></>}</h1>
            <h2>{locale === "zh-TW" ? <>貼上混亂的 Launch Brief。Relay 在 AI 寄信、花錢或發布前，<b>抓出衝突並停止錯誤行動。</b></> : <>Paste a messy launch brief. Before AI sends, spends or publishes, Relay <b>finds the conflict and stops the wrong action.</b></>}</h2>
            <p>{tr("For 5–50 person Growth, Agency and Operations teams coordinating launches across Slack, email, docs, calendars and CRM.", "給同時使用 Slack、Email、文件、行事曆與 CRM 的 5–50 人 Growth、Agency 與營運團隊。")}</p>
            <div className="hero-actions">
              <button className="button button-primary button-large" onClick={() => navigate("/missions/new")}>{tr("Find my first blocker", "找出我的第一個阻擋")} <ArrowRight size={18} /></button>
              <button className="button button-ghost button-large" onClick={() => document.getElementById("magic")?.scrollIntoView({ behavior: "smooth", block: "center" })}><Play size={17} fill="currentColor" /> {tr("See the magic moment", "看 Magic Moment")}</button>
            </div>
            <div className="trust-line"><ShieldCheck size={17} /><span>{tr("Real compiler", "真實編譯器")}</span><span>•</span><span>{tr("Source-backed", "來源可追")}</span><span>•</span><span>{tr("Unsafe actions stopped", "錯誤行動會被停止")}</span></div>
          </div>
          <LandingMagicCompiler onOpenFullMission={() => navigate("/missions/new?sample=1")} />
        </section>

        <section className="proof-strip"><span>{tr("FIRST VALUE", "首次價值")}</span><ArrowRight size={18} /><b>{tr("one paste → first blocker → next safe action", "貼上一次 → 第一個阻擋 → 下一步安全行動")}</b><div className="proof-items"><span><UsersRound size={15} /> {tr("Shared mission room", "共用 Mission Room")}</span><span><FileCheck2 size={15} /> {tr("Evidence linked", "證據可追")}</span><span><GitBranch size={15} /> {tr("Corrections versioned", "修正自動版本化")}</span></div></section>

        <section className="section wedge-section" id="wedge">
          <div className="section-heading"><span className="section-index">00 / {tr("THE WEDGE", "首個切入場景")}</span><h2>{tr("Start with the launch that cannot afford one wrong instruction.", "先解決那種一條錯誤指令就會造成返工的 Launch。")}</h2><p>{tr("Relay is initially for cross-functional campaign and launch operations—where deadlines, budgets, audiences, approvals and tool permissions change faster than the plan.", "Relay 第一階段專注跨部門活動與 Launch 營運：截止日、預算、受眾、核准與工具權限比計畫變得更快的工作。")}</p></div>
          <div className="wedge-grid">
            <article><UsersRound /><span>{tr("WHO", "給誰")}</span><h3>{tr("5–50 person Growth, Agency and Ops teams", "5–50 人 Growth、Agency 與 Ops 團隊")}</h3><p>{tr("Teams already using AI plus several SaaS tools to deliver client or company launches.", "已用 AI 與多個 SaaS 工具交付客戶或公司 Launch 的團隊。")}</p></article>
            <article><MessageSquareWarning /><span>{tr("WHEN", "什麼時候")}</span><h3>{tr("Before an agent sends, spends or publishes", "Agent 要寄出、花錢或公開發布之前")}</h3><p>{tr("When one stale brief, missing approval or wrong audience could create customer-facing damage.", "當過期規格、漏掉核准或錯誤受眾會直接造成對客錯誤時。")}</p></article>
            <article><Target /><span>{tr("WHY RETURN", "為什麼會重複使用")}</span><h3>{tr("Every launch changes; every contract must stay current", "每次 Launch 都會改變，執行合約必須跟著更新")}</h3><p>{tr("A correction creates impact analysis, a new version, invalidated approvals and a durable decision trail.", "一次修正會產生影響分析、新版本、失效核准與可追決策紀錄。")}</p></article>
          </div>
        </section>

        <section className="section multiplayer-section" id="multiplayer">
          <div className="multiplayer-copy"><span className="section-index">01 / {tr("MULTIPLAYER BY DEFAULT", "預設多人協作")}</span><h2>{tr("One mission. One shared state. Humans and agents working from the same truth.", "一個 Mission、一份共同狀態，讓人與 Agent 按同一版真相工作。")}</h2><p>{tr("A correction is not another chat message. Relay records who changed the instruction, updates the shared room, blocks affected agents and preserves the event in the execution lineage.", "人工修正不再只是另一則聊天訊息。Relay 會記錄誰改了指令、同步到共同控制室、阻擋受影響的 Agent，並把事件保留在執行脈絡中。")}</p><Link to="/demo" className="button button-dark">{tr("Open the shared mission example", "打開共用 Mission 範例")} <ArrowRight size={16} /></Link></div>
          <div className="multiplayer-proof" aria-label={tr("Shared mission proof", "共用 Mission 證明") }>
            <div className="multiplayer-proof-head"><span><UsersRound size={16} /> {tr("SHARED MISSION URL", "共用 MISSION URL")}</span><span className="sync-chip"><span /> {tr("SYNC EVERY 10S", "每 10 秒同步")}</span></div>
            <div className="multiplayer-path">
              <article><span>01</span><UserRound size={19} /><b>{tr("Human corrects intent", "人類修正意圖")}</b><small>{tr("Named, source-backed", "具名、保留來源")}</small></article>
              <ArrowRight size={17} />
              <article><span>02</span><GitBranch size={19} /><b>{tr("Contract becomes stale", "舊合約立即失效")}</b><small>{tr("Approvals invalidated", "舊核准不沿用")}</small></article>
              <ArrowRight size={17} />
              <article><span>03</span><Bot size={19} /><b>{tr("Affected agents stop", "受影響 Agent 停止")}</b><small>{tr("Clear next action", "顯示下一步")}</small></article>
            </div>
            <div className="multiplayer-event"><Activity size={17} /><div><span>{tr("RECORDED ACTIVITY", "已記錄活動")}</span><b>{tr("Jennifer changed the budget limit; Plan v4 requires replanning.", "Jennifer 修改預算上限；Plan v4 需要重新規劃。")}</b></div><small>{tr("persisted", "已保存")}</small></div>
            <p className="multiplayer-truth"><ShieldCheck size={15} /> {tr("Current public MVP uses persisted events and 10-second refresh—not simulated cursor presence or fake online agents.", "目前公開 MVP 使用已保存事件與 10 秒同步，不模擬游標共編，也不假裝 Agent 正在線上。")}</p>
          </div>
        </section>

        <section className="section how" id="how-it-works">
          <div className="section-heading"><span className="section-index">02 / {tr("INTENT COMPILER", "意圖編譯器")}</span><h2>{tr("Before agents execute,", "在 Agent 執行前，")}<br />{tr("make the mission executable.", "先讓 Mission 真正可執行。")}</h2><p>{tr("Relay turns scattered goals, limits and decisions into an evidence-backed contract every person and agent can inspect.", "Relay 把散落各處的目標、限制與決策，整理成每個人與 Agent 都能檢查、且有來源證據的執行合約。")}</p></div>
          <div className="steps-grid">
            {[
              [Network, tr("Collect intent", "收集意圖"), tr("Attach messages, documents, records and human corrections. Every assertion keeps its source, author, timestamp and authority.", "加入訊息、文件、系統紀錄與人工修正；每項主張都保留來源、作者、時間與權威等級。")],
              [Scale, tr("Resolve conflict", "解決衝突"), tr("Find hard, policy, resource, authority, version and dependency conflicts before they become expensive mistakes.", "在錯誤造成昂貴代價前，找出硬性、政策、資源、權責、版本與依賴衝突。")],
              [Braces, tr("Compile the contract", "編譯合約"), tr("Produce tasks with owners, dependencies, capabilities, risk, budget, approvals, stop conditions and rollback.", "產生含負責人、依賴、能力、風險、預算、核准、停止與回滾條件的任務。")],
              [Activity, tr("Execute with control", "受控執行"), tr("Run preflight checks, stop unsafe actions, invalidate stale approvals and retain evidence through the outcome.", "執行前檢查每個條件，停止不安全操作、使過期核准失效，並保留直到成果的完整證據。")],
            ].map(([Icon, title, copy], index) => <article className="step-card" key={String(title)}><span className="step-number">0{index + 1}</span><Icon size={25} /><h3>{String(title)}</h3><p>{String(copy)}</p></article>)}
          </div>
        </section>

        <section className="section contract-section" id="control-plane">
          <div className="contract-panel">
            <div className="contract-meta"><span>{tr("EXECUTION CONTRACT", "執行合約")}</span><span>{tr("PLAN v4 · ACTIVE", "計畫 v4 · 生效中")}</span></div>
            <h3>{tr("Launch Kaohsiung campaign", "推出高雄活動行銷專案")}</h3>
            <div className="contract-row"><span>{tr("GOAL", "目標")}</span><p>{tr("Acquire 24 paid registrations by Jul 29", "7 月 29 日前取得 24 筆付費報名")}</p><BadgeCheck size={18} /></div>
            <div className="contract-row"><span>{tr("CONSTRAINT", "限制")}</span><p>{tr("Exclude existing members · Max NT$30,000", "排除既有會員 · 上限 NT$30,000")}</p><BadgeCheck size={18} /></div>
            <div className="contract-row"><span>{tr("APPROVAL", "核准")}</span><p>{tr("Jennifer · exact payload · expires in 18h", "Jennifer · 精確內容 · 18 小時後到期")}</p><BadgeCheck size={18} /></div>
            <div className="contract-row"><span>{tr("STOP", "停止")}</span><p>{tr("Pause if CPA > NT$1,250 after 10 conversions", "10 次轉換後若 CPA > NT$1,250 就暫停")}</p><CircleStop size={18} /></div>
            <div className="contract-hash"><Fingerprint size={16} /> sha256:8b1f…c04d <span>{tr("payload locked", "內容已鎖定")}</span></div>
          </div>
          <div className="contract-copy"><span className="section-index">03 / {tr("CONTROL PLANE", "執行控制層")}</span><h2>{tr("Approval is not a button.", "核准不是一顆按鈕，")}<br />{tr("It’s a precise contract.", "而是一份精確合約。")}</h2><p>{tr("Every high-impact action is bound to one plan version, exact audience, payload, budget, approver, expiration and rollback strategy. Change the payload and the approval disappears.", "每項高影響操作都綁定一個計畫版本、精確受眾、內容、預算、核准人、到期時間與回滾策略。只要重要內容改變，核准就自動失效。")}</p><ul className="feature-list"><li><Check /> {tr("Version-aware execution", "版本感知執行")}</li><li><Check /> {tr("Task-level capability grants", "任務層級能力授權")}</li><li><Check /> {tr("Exact, expiring approvals", "精確且會到期的核准")}</li><li><Check /> {tr("End-to-end evidence lineage", "端到端證據脈絡")}</li></ul></div>
        </section>

        <section className="section security-section" id="security"><div><span className="section-index">04 / {tr("TRUST BY DESIGN", "以信任為核心設計")}</span><h2>{tr("Agents request capabilities.", "Agent 只能提出能力請求，")}<br />{tr("They never hold credentials.", "永遠不會持有憑證。")}</h2></div><div className="security-grid">{[
          [KeyRound, tr("Mission-scoped access", "Mission 範圍授權"), tr("Only the providers, resources and actions required by the active plan.", "只允許有效計畫真正需要的服務、資源與操作。")],
          [LockKeyhole, tr("Credential isolation", "憑證隔離"), tr("OAuth tokens stay in the gateway—never in model or agent context.", "OAuth Token 留在 Gateway，永不進入模型或 Agent 上下文。")],
          [History, tr("Immutable lineage", "不可變執行脈絡"), tr("Every assertion, decision, action, version and outcome remains explainable.", "每項主張、決策、操作、版本與成果都能完整說明。")],
          [ShieldCheck, tr("Fail-closed execution", "預設拒絕的不安全執行"), tr("Missing permission, stale versions and payload changes stop execution with a clear next action.", "缺少權限、版本過期或內容改變時立即停止，並提供明確下一步。")],
        ].map(([Icon, title, copy]) => <article key={String(title)}><Icon size={22} /><h3>{String(title)}</h3><p>{String(copy)}</p></article>)}</div></section>

        <section className="section reality-section" id="proof">
          <div className="reality-copy"><span className="section-index">05 / {tr("PRODUCT TRUTH", "產品真實狀態")}</span><h2>{tr("Know exactly what works today—and what does not yet.", "清楚知道今天能做什麼，以及哪些還沒有。")}</h2><p>{tr("Relay will not call a connector verified, an agent online, or an action completed unless the corresponding check actually passed.", "Relay 不會在沒有通過對應驗證時，把連接器稱為已連線、把 Agent 稱為在線，或把操作稱為已完成。")}</p></div>
          <div className="reality-board">
            <article className="available"><span>{tr("AVAILABLE NOW", "目前可用")}</span><h3>{tr("Shared intent conflict compiler", "共用意圖衝突編譯器")}</h3><ul><li><Check />{tr("One-paste mission intake", "一次貼上 Mission")}</li><li><Check />{tr("Shared Mission URL with persisted 10-second sync", "共用 Mission URL 與已保存的 10 秒同步")}</li><li><Check />{tr("Named corrections, versioned plans and approval invalidation", "具名修正、版本化計畫與核准失效")}</li><li><Check />{tr("Preflight, audit ledger and outcome record", "執行前檢查、稽核與成果紀錄")}</li></ul></article>
            <article className="rollout"><span>{tr("DESIGN PARTNER ROLLOUT", "DESIGN PARTNER 導入中")}</span><h3>{tr("Verified external execution", "已驗證的外部執行")}</h3><ul><li><Clock3 />{tr("Slack, Gmail, Notion, Drive and Calendar OAuth", "Slack、Gmail、Notion、Drive 與 Calendar OAuth")}</li><li><Clock3 />{tr("Credential vault and resource verification", "憑證保管庫與資源驗證")}</li><li><Clock3 />{tr("Tool gateway execution and rollback receipts", "Tool Gateway 執行與回滾憑據")}</li><li><Ban />{tr("No simulated connected state", "不模擬已連線狀態")}</li></ul></article>
            <div className="data-flywheel"><Network /><div><span>{tr("THE COMPOUNDING ASSET", "持續複利的資產")}</span><h3>Source → Assertion → Conflict → Decision → Plan → Approval → Outcome</h3><p>{tr("Each completed mission adds a structured intent-to-outcome chain—not another chat transcript.", "每個完成的 Mission 會增加一條結構化的意圖到成果關係，而不只是另一份對話紀錄。")}</p></div></div>
          </div>
        </section>

        <section className="final-cta"><span>{tr("ONE PASTE. ONE BLOCKER. ONE SAFE NEXT STEP.", "貼上一次，找出一個關鍵阻擋，得到一個安全下一步。")}</span><h2>{tr("Test Relay on the launch", "就用你手上那個")}<br />{tr("your team is running now.", "正在執行的 Launch 測試 Relay。")}</h2><Link to="/missions/new" className="button button-primary button-large">{tr("Analyze a launch brief", "分析一份 Launch Brief")} <ArrowRight /></Link></section>
      </main>
      <footer><Logo /><p>{tr("Git for organizational intent—and the control plane for AI execution.", "組織意圖的 Git，也是 AI 執行的控制層。")}</p><span>© 2026 Relay</span></footer>
    </div>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [sidebar, setSidebar] = useState(false);
  const location = useLocation();
  const isMissionWorkspace = /^\/missions\/[^/]+$/.test(location.pathname);
  return (
    <div className={`app-shell ${isMissionWorkspace ? "mission-shell" : ""}`}>
      {!isMissionWorkspace && <aside className={sidebar ? "sidebar open" : "sidebar"}>
        <div className="sidebar-head"><Logo compact /><button className="icon-button sidebar-close" onClick={() => setSidebar(false)}><X size={18} /></button></div>
        <div className="workspace-switch"><span className="workspace-avatar">RL</span><div><b>Relay Labs</b><small>{tr("Design partner workspace", "Design Partner 工作區")}</small></div><ChevronDown size={16} /></div>
        <nav>{navigation.map(({ label, labelZh, href, icon: Icon }) => <NavLink to={href} key={label} className={({ isActive }) => isActive && label === "Overview" ? "active" : ""} onClick={() => setSidebar(false)}><Icon size={18} />{tr(label, labelZh)}</NavLink>)}</nav>
        <div className="sidebar-spacer" />
        <div className="control-status"><span className="status-orb"><ShieldCheck size={15} /></span><div><b>{tr("Policy checks active", "合約檢查已啟用")}</b><small>{tr("External connectors not linked", "尚未連接外部 Connector")}</small></div></div>
        <div className="user-card"><span className="user-avatar">JE</span><div><b>Jennifer</b><small>{tr("Workspace owner", "工作區擁有者")}</small></div><button className="icon-button" aria-label={tr("Open user menu", "開啟使用者選單")}><ChevronDown size={15} /></button></div>
      </aside>}
      <div className="app-main">{!isMissionWorkspace && <header className="app-header"><button className="icon-button app-menu" onClick={() => setSidebar(true)} aria-label={tr("Open navigation", "開啟導覽選單")}><Menu size={20} /></button><div className="app-search"><Search size={17} /><span>{tr("Search missions, evidence, decisions…", "搜尋 Mission、證據與決策…")}</span><kbd>⌘ K</kbd></div><div className="header-actions"><LanguageSwitcher compact /><span className="environment"><span /> {tr("MVP CONTRACT CHECKS", "MVP 合約檢查")}</span><Link to="/missions/new" className="button button-primary button-small"><Plus size={16} /> {tr("New mission", "新增 Mission")}</Link></div></header>}{children}</div>
      {!isMissionWorkspace && sidebar && <button className="sidebar-scrim" onClick={() => setSidebar(false)} aria-label={tr("Close navigation", "關閉導覽選單")} />}
    </div>
  );
}

function StatCard({ label, value, accent, icon: Icon, helper }: { label: string; value: number; accent?: string; icon: typeof Radar; helper: string }) {
  return <article className={`stat-card ${accent ?? ""}`}><div className="stat-top"><span>{label}</span><Icon size={18} /></div><strong>{String(value).padStart(2, "0")}</strong><small>{helper}</small></article>;
}

function LoadingBlock({ label }: { label?: string }) { return <div className="loading-block"><span className="loader" /><p>{label ?? tr("Loading execution state…", "正在載入執行狀態…")}</p></div>; }
function ErrorBlock({ error, retry }: { error: string; retry?: () => void }) { return <div className="error-block"><AlertOctagon /><div><b>{tr("Relay could not load this view", "Relay 無法載入此畫面")}</b><p>{error}</p></div>{retry && <button className="button button-ghost" onClick={retry}>{tr("Retry", "重試")}</button>}</div>; }

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
      <div className="page-title"><div><span className="page-kicker">{tr("WORKSPACE CONTROL CENTER", "WORKSPACE 控制中心")}</span><h1>{tr("Good morning, Jennifer.", "早安，Jennifer。")}</h1><p>{tr("Here’s what needs human judgment before your agents can move.", "以下事項需要人工判斷，完成後 Agent 才能繼續執行。")}</p></div><Link to="/missions/new" className="button button-dark"><Plus size={17} /> {tr("Create mission", "建立 Mission")}</Link></div>
      <section className="stats-grid"><StatCard label={tr("Active missions", "進行中的 Mission")} value={data.metrics.active} icon={Radar} helper={tr("under valid contracts", "受有效合約治理")} /><StatCard label={tr("Blocked", "已阻擋")} value={data.metrics.blocked} icon={CircleStop} helper={tr("execution safely stopped", "已安全停止執行")} accent="danger" /><StatCard label={tr("Awaiting decisions", "等待決策")} value={data.metrics.awaitingDecisions} icon={Scale} helper={tr("conflicts need owners", "衝突需要負責人")} accent="amber" /><StatCard label={tr("Awaiting approvals", "等待核准")} value={data.metrics.awaitingApprovals} icon={ShieldCheck} helper={tr("exact payload review", "等待精確內容審查")} accent="violet" /><StatCard label={tr("Successful", "成功")} value={data.metrics.successfulThisWeek} icon={Target} helper={tr("outcomes verified", "成果已驗證")} accent="teal" /></section>
      <section className="dashboard-grid">
        <div className="panel missions-panel"><div className="panel-heading"><div><span>{tr("MISSIONS", "任務")}</span><h2>{focus ? (focus === "conflicts" ? tr("Conflicts", "衝突") : tr("Approvals", "核准")) : tr("Execution portfolio", "執行組合")}</h2></div><span className="count-chip">{missions.length}</span></div>
          <div className="mission-table"><div className="mission-row mission-table-head"><span>{tr("Mission", "任務")}</span><span>{tr("State", "狀態")}</span><span>{tr("Contract", "合約")}</span><span>{tr("Human gates", "人工關卡")}</span><span>{tr("Progress", "進度")}</span><span /></div>
            {missions.map((mission) => <Link className="mission-row" to={`/missions/${mission.id}`} key={mission.id}><div className="mission-name"><span className={`mission-icon ${mission.blockingConflicts ? "blocked" : ""}`}>{mission.blockingConflicts ? <CircleStop size={18} /> : <Radar size={18} />}</span><div><b>{localizeDomainText(mission.title)}</b><small>{tr("Updated", "更新於")} {formatDate(mission.updatedAt, true)}</small></div></div><span><StatusPill value={mission.blockingConflicts ? "blocked" : mission.status} /></span><span className="mono">{tr("Plan", "計畫")} v{mission.currentPlanVersion || "—"}</span><span className="human-gates">{mission.openConflicts ? <><Scale size={15} />{mission.openConflicts} {tr("decisions", "項決策")}</> : mission.pendingApprovals ? <><ShieldCheck size={15} />{mission.pendingApprovals} {tr("approval", "項核准")}</> : <><Check size={15} />{tr("Clear", "無待辦")}</>}</span><span><Progress value={mission.completedTasks} total={mission.totalTasks} /></span><ArrowRight size={17} /></Link>)}
          </div>
        </div>
        <aside className="panel attention-panel"><div className="panel-heading"><div><span>{tr("ATTENTION QUEUE", "待處理佇列")}</span><h2>{tr("What changed", "最新變更")}</h2></div></div>{data.missions.flatMap((mission) => [mission.blockingConflicts ? { mission, type: tr("Blocking conflict", "阻擋性衝突"), count: mission.blockingConflicts, icon: AlertOctagon } : null, mission.pendingApprovals ? { mission, type: tr("Exact approval", "精確核准"), count: mission.pendingApprovals, icon: ShieldCheck } : null]).filter(Boolean).slice(0, 5).map((item) => { const value = item!; const Icon = value.icon; return <Link to={`/missions/${value.mission.id}`} key={`${value.mission.id}-${value.type}`} className="attention-item"><span className="attention-icon"><Icon size={17} /></span><div><b>{value.type}</b><p>{localizeDomainText(value.mission.title)}</p><small>{value.count} {tr(value.count > 1 ? "items waiting" : "item waiting", "項待處理")}</small></div><ArrowRight size={16} /></Link>; })}{!data.metrics.blocked && !data.metrics.awaitingApprovals && <div className="empty-state"><BadgeCheck size={25} /><b>{tr("No urgent human gates", "沒有緊急人工關卡")}</b><p>{tr("Relay will surface decisions here.", "Relay 會在這裡顯示需要處理的決策。")}</p></div>}</aside>
      </section>
    </main></AppShell>
  );
}

function StatusPill({ value }: { value: string }) { return <span className={`status-pill status-${value.replaceAll("_", "-")}`}><span />{localizeLabel(value)}</span>; }
function Progress({ value, total }: { value: number; total: number }) { const percent = total ? Math.round((value / total) * 100) : 0; return <div className="progress-wrap"><div className="progress-track"><span style={{ width: `${percent}%` }} /></div><small>{value}/{total}</small></div>; }

function MissionIntakePage() {
  const navigate = useNavigate();
  const quickExample = tr(
    `Mission: Launch the Kaohsiung campaign\nGoal: Launch by July 29 and acquire 24 paid registrations\nSlack | Growth lead: Do not promote to existing members\nEmail | Client: Every public creative requires brand approval\nCalendar | Operations: Brand review is scheduled for July 30\nNotion | Marketing: Budget limit is NT$20,000\nManual | Mission owner: Approved budget is NT$30,000 and nothing can publish without my approval\nCRM | CRM system: Current audience includes existing members and new leads\nAds | Meta Ads: Payment method is missing, so publishing is unavailable\nSuccess: 24 paid registrations at CPA no higher than NT$1,250`,
    `Mission：推出高雄活動行銷專案\n目標：7 月 29 日前上線，取得 24 筆付費報名\nSlack｜Growth 負責人：不得向既有會員推廣\nEmail｜客戶：所有公開素材都必須先通過品牌核准\nCalendar｜營運：品牌審查排在 7 月 30 日\nNotion｜行銷：預算上限是 NT$20,000\nManual｜Mission owner：核准預算上限是 NT$30,000，未經我核准不得發布\nCRM｜CRM system：目前受眾同時包含既有會員與新名單\nAds｜Meta Ads：缺少付款方式，目前無法發布\n成功指標：24 筆付費報名，CPA 不高於 NT$1,250`,
  );
  const [mode, setMode] = useState<"quick" | "structured">("quick");
  const [rawBrief, setRawBrief] = useState(() => new URLSearchParams(window.location.search).get("sample") === "1" ? quickExample : "");
  const [form, setForm] = useState<CreateMissionInput>({ title: "", objective: "", successMetric: "", createdBy: "Jennifer", sources: [{ type: "Slack", title: "", author: "", content: "", authorityLevel: 3 }, { type: "Email", title: "", author: "", content: "", authorityLevel: 3 }] });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [stage, setStage] = useState("");
  const updateSource = (index: number, patch: Partial<SourceInput>) => setForm((current) => ({ ...current, sources: current.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, ...patch } : source) }));
  const loadExample = () => { setMode("quick"); setRawBrief(quickExample); };
  const compileInput = async (input: CreateMissionInput) => {
    setBusy(true); setError("");
    try {
      setStage(tr("Securing source evidence…", "正在保存來源證據…"));
      const created = await api<{ mission: MissionDetail }>("/api/missions", { method: "POST", body: JSON.stringify(input) });
      setStage(tr("Compiling intent and testing contradictions…", "正在編譯意圖並檢查矛盾…"));
      await api(`/api/missions/${created.mission.id}/compile`, { method: "POST" });
      navigate(`/missions/${created.mission.id}?view=conflicts&new=1`);
    } catch (err) {
      setError((err as Error).message); setBusy(false); setStage("");
    }
  };
  const submitQuick = (event: FormEvent) => {
    event.preventDefault();
    if (rawBrief.trim().length < 10) { setError(tr("Paste at least two instructions so Relay can compare them.", "請至少貼上兩項指令，Relay 才能進行比對。")); return; }
    try { void compileInput(parseQuickMission(rawBrief)); } catch (err) { setError((err as Error).message); }
  };
  const submitStructured = (event: FormEvent) => { event.preventDefault(); void compileInput(form); };
  const compileSidebar = <aside className="compile-sidebar"><div className="compile-card"><div className="compile-icon"><Network /></div><span>{tr("FIRST OUTPUT", "第一個產出")}</span><h3>{tr("A blocker you can act on", "一個能立刻處理的關鍵阻擋")}</h3><ul><li><Check /> {tr("Exact conflicting statements", "互相矛盾的原始指令")}</li><li><Check /> {tr("Source and decision owner", "來源與決策負責人")}</li><li><Check /> {tr("Impact if left unresolved", "不處理會造成的影響")}</li><li><Check /> {tr("Two or three resolution paths", "兩到三個解法")}</li><li><Check /> {tr("Versioned execution plan", "版本化執行計畫")}</li></ul><div className="compile-notice"><ShieldCheck size={17} /><p>{tr("Analysis only. Relay will not connect to or change an external system in this step.", "此步驟只做分析，不會連接或變更任何外部系統。")}</p></div><div className="public-mvp-note"><LockKeyhole size={15} /><p>{tr("Public MVP: use a redacted brief. Workspace identity and tenant isolation are still in design-partner rollout.", "公開 MVP：請先遮蔽機密與個資。Workspace 身分與租戶隔離仍在 Design Partner 導入中。")}</p></div>{error && <p className="form-error">{error}</p>}<button className="button button-primary button-full button-large" disabled={busy} type="submit">{busy ? <><span className="loader small" /> {stage}</> : <>{tr("Find the first blocker", "找出第一個關鍵阻擋")} <ArrowRight size={18} /></>}</button><small className="form-assurance">{tr("Your source text stays attached to the mission evidence chain.", "原始文字會保留在 Mission 的證據鏈中。")}</small></div></aside>;
  return <AppShell><main className="page intake-page">
    <div className="page-title intake-title"><div><Link to="/app" className="back-link">← {tr("Workspace", "工作區")}</Link><span className="page-kicker">MISSION {tr("INTAKE", "輸入")}</span><h1>{tr("Paste the launch your team is arguing about.", "貼上團隊正在爭論的 Launch。")}</h1><p>{tr("Keep the contradictions. Relay will show the first blocker, its evidence, who must decide and the next safe action.", "保留那些矛盾。Relay 會指出第一個關鍵阻擋、證據、該由誰決定，以及下一步安全行動。")}</p></div><button className="button button-ghost" onClick={loadExample}><Sparkles size={16} /> {tr("Try the Kaohsiung example", "試用高雄 Launch 範例")}</button></div>
    <div className="intake-mode-switch" role="tablist" aria-label={tr("Mission input mode", "Mission 輸入方式")}><button type="button" role="tab" aria-selected={mode === "quick"} className={mode === "quick" ? "active" : ""} onClick={() => setMode("quick")}><Sparkles size={15} /> {tr("Paste one brief", "貼上一份 Brief")}</button><button type="button" role="tab" aria-selected={mode === "structured"} className={mode === "structured" ? "active" : ""} onClick={() => setMode("structured")}><Braces size={15} /> {tr("Enter structured sources", "逐項輸入來源")}</button></div>
    {mode === "quick" ? <form onSubmit={submitQuick} className="intake-layout quick-intake-layout"><div className="intake-main"><section className="quick-brief-card"><div className="quick-brief-head"><div><span>01 / {tr("PASTE", "貼上")}</span><h2>{tr("Messages, emails, meeting notes—together.", "Slack、Email、會議紀錄，全部一起貼。")}</h2><p>{tr("Use one line per source when possible: “Slack | Growth: launch July 29”. Relay separates the evidence for you.", "可以的話，每個來源一行，例如「Slack｜Growth：7 月 29 日發布」。Relay 會替你拆開證據。")}</p></div><span className="time-to-value"><Clock3 size={15} /> {tr("First result in one flow", "一個流程看見結果")}</span></div><label className="quick-brief-label"><span>{tr("Messy mission brief", "混亂的 Mission Brief")}</span><textarea className="quick-brief-textarea" value={rawBrief} onChange={(event) => setRawBrief(event.target.value)} rows={18} placeholder={tr("Paste Slack messages, client requirements, dates, budgets, exclusions and permissions here…", "把 Slack 訊息、客戶要求、日期、預算、排除條件與權限狀態貼在這裡……")} required /></label><div className="quick-hints"><span><MessageSquareWarning /> {tr("contradictions welcome", "不用先消除矛盾")}</span><span><FileCheck2 /> {tr("sources preserved", "來源會被保留")}</span><span><ShieldCheck /> {tr("analysis only", "只分析、不執行")}</span></div></section></div>{compileSidebar}</form>
      : <form onSubmit={submitStructured} className="intake-layout"><div className="intake-main"><section className="form-section"><div className="form-section-title"><span>01</span><div><h2>{tr("Define the outcome", "定義成果")}</h2><p>{tr("What must be true when this mission succeeds?", "這個 Mission 成功時，哪些條件必須成立？")}</p></div></div><label>{tr("Mission name", "Mission 名稱")}<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={tr("Launch Kaohsiung campaign", "推出高雄活動行銷專案")} required minLength={3} /></label><label>{tr("Objective", "目標")}<textarea value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder={tr("Launch by… within… while never…", "在……前完成；限制為……；且絕不能……")} required minLength={10} rows={4} /></label><label>{tr("Success contract", "成功合約")}<input value={form.successMetric} onChange={(event) => setForm({ ...form, successMetric: event.target.value })} placeholder={tr("24 paid registrations at CPA ≤ NT$1,250", "24 筆付費報名，CPA ≤ NT$1,250")} required /></label></section>
        <section className="form-section"><div className="form-section-title"><span>02</span><div><h2>{tr("Attach sources", "加入來源")}</h2><p>{tr("Add at least two messages, documents or system records.", "至少加入兩則訊息、文件或系統紀錄。")}</p></div></div><div className="source-editor-list">{form.sources.map((source, index) => <article className="source-editor" key={index}><div className="source-editor-head"><span className={`source-number ${sourceColors[source.type] ?? "lime"}`}>{index + 1}</span><select value={source.type} onChange={(event) => updateSource(index, { type: event.target.value as SourceInput["type"] })}>{["Slack", "Email", "Notion", "Google Drive", "Calendar", "CRM", "Ads", "Meeting note", "Manual"].map((type) => <option key={type} value={type}>{localizeLabel(type)}</option>)}</select>{form.sources.length > 2 && <button type="button" className="icon-button" aria-label={tr("Remove source", "移除來源")} onClick={() => setForm({ ...form, sources: form.sources.filter((_, itemIndex) => itemIndex !== index) })}><X size={17} /></button>}</div><div className="form-grid"><label>{tr("Source title", "來源標題")}<input value={source.title} onChange={(event) => updateSource(index, { title: event.target.value })} placeholder={tr("#launch or client thread", "#launch 或客戶對話串")} required /></label><label>{tr("Author / system", "作者／系統")}<input value={source.author} onChange={(event) => updateSource(index, { author: event.target.value })} placeholder={tr("Growth lead", "Growth 負責人")} required /></label></div><label>{tr("Exact content", "原始內容")}<textarea value={source.content} onChange={(event) => updateSource(index, { content: event.target.value })} placeholder={tr("Paste the original instruction—do not clean it up.", "貼上原始指令，不要先整理或改寫。")} rows={4} required /></label><div className="authority-row"><span>{tr("Authority", "權威等級")}</span><input aria-label={tr("Source authority level", "來源權威等級")} type="range" min="1" max="5" value={source.authorityLevel} onChange={(event) => updateSource(index, { authorityLevel: Number(event.target.value) })} /><b>{source.authorityLevel}/5</b></div></article>)}</div><button type="button" className="button button-ghost add-source" onClick={() => setForm({ ...form, sources: [...form.sources, { type: "Manual", title: "", author: "", content: "", authorityLevel: 3 }] })}><Plus size={17} /> {tr("Add another source", "再加入一個來源")}</button></section></div>{compileSidebar}</form>}
  </main></AppShell>;
}

const missionTabs = [
  ["room", "Mission room", "Mission 控制室", Activity], ["conflicts", "Conflicts", "衝突", MessageSquareWarning], ["plan", "Plan", "計畫", RouteIcon], ["access", "Access", "存取權", KeyRound],
  ["approvals", "Approvals", "核准", ShieldCheck], ["evidence", "Evidence", "證據", FileCheck2], ["outcome", "Outcome", "成果", Target],
] as const;

function MissionPage() {
  const { id = "" } = useParams(); const [params, setParams] = useSearchParams(); const view = params.get("view") || "room";
  const [mission, setMission] = useState<MissionDetail>(); const [error, setError] = useState(""); const [busy, setBusy] = useState(""); const [notice, setNotice] = useState(""); const [lastSyncedAt, setLastSyncedAt] = useState("");
  const load = useCallback(async (silent = false) => {
    if (!silent) setError("");
    try {
      const response = await api<{ mission: MissionDetail }>(`/api/missions/${id}`);
      setMission(response.mission);
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      if (!silent) setError((err as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(true); }, 10_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const action: MissionAction = async (key, request, message) => { setBusy(key); setNotice(""); setError(""); try { const response = await request as { mission: MissionDetail }; setMission(response.mission); if (message) setNotice(message); return response; } catch (err) { setError((err as Error).message); } finally { setBusy(""); } };
  const copyRoomLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice(tr("Shared Mission link copied. Anyone with access to this public MVP URL can open the same saved state.", "共用 Mission 連結已複製；目前公開 MVP 中，取得網址的人可開啟同一份已保存狀態。"));
    } catch {
      setError(tr("Relay could not copy this link. Copy it from the address bar instead.", "Relay 無法自動複製連結，請改從瀏覽器網址列複製。"));
    }
  };
  if (error && !mission) return <AppShell><main className="page"><ErrorBlock error={error} retry={() => { void load(); }} /></main></AppShell>;
  if (!mission) return <AppShell><main className="page"><LoadingBlock label={tr("Loading mission contract…", "正在載入 Mission 合約…")} /></main></AppShell>;
  const plan = mission.currentPlan; const isStale = plan?.status === "superseded";
  const agentRoles = plan?.tasks.filter((task) => task.ownerType === "agent").slice(0, 3) ?? [];
  return <AppShell><main className={`mission-page view-${view}`}><header className="mission-header"><div className="mission-topbar"><Link to="/app" className="mission-brand" aria-label={tr("Back to workspace", "返回工作區")}><span>RL</span><b>Relay</b></Link><div className="mission-title-compact" title={localizeDomainText(mission.objective)}><small>MISSION</small><h1>{localizeDomainText(mission.title)}</h1></div><button className="mission-plan-control" onClick={() => setParams({ view: "plan" })}><span>{tr("Plan", "計畫")} v{mission.currentPlanVersion}</span><i className={isStale ? "stale" : ""} /> <small>{isStale ? localizeLabel("superseded") : tr("Active", "有效")}</small><ChevronDown size={14} /></button><div className="mission-header-spacer" /><div className="mission-live-presence" title={lastSyncedAt ? `${tr("Last synced", "上次同步")} ${formatDate(lastSyncedAt, true)}` : undefined}><span className="live-signal"><span />{tr("Shared room · sync 10s", "共用控制室 · 10 秒同步")}</span><div className="presence-avatars"><img src="/assets/relay-jennifer-256.png" alt="Jennifer" />{agentRoles.map((task) => <span key={task.id} title={localizeDomainText(task.ownerName)}>{task.ownerName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>)}</div><small>1 {tr("human", "位人類")} + {agentRoles.length} {tr("agent roles", "個 Agent 角色")}</small></div><LanguageSwitcher compact /><button className="button button-ghost button-small mission-share" onClick={() => { void copyRoomLink(); }}><Copy size={15} /><span>{tr("Copy room link", "複製控制室連結")}</span></button><button className="icon-button mission-refresh" onClick={() => { void load(); }} aria-label={tr("Refresh mission", "重新整理 Mission")}><RefreshCw size={17} /></button>{mission.status === "planning" && <button className="button button-primary button-small mission-compile" disabled={busy === "plan"} onClick={() => action("plan", api<{ mission: MissionDetail }>(`/api/missions/${mission.id}/plan`, { method: "POST", body: JSON.stringify({ actor: "Jennifer" }) }), tr("A new active contract was created. Previous approvals were invalidated.", "新的有效合約已建立，舊版核准已失效。"))}><GitBranch size={15} /> {tr("Compile", "編譯")} v{mission.currentPlanVersion + 1}</button>}</div><nav className="mission-tabs" aria-label={tr("Mission views", "Mission 檢視")}>{missionTabs.map(([key, label, labelZh, Icon]) => <button className={view === key ? "active" : ""} key={key} onClick={() => setParams({ view: key })} title={tr(label, labelZh)} aria-label={tr(label, labelZh)}><Icon size={18} /><span className="mission-tab-label">{tr(label, labelZh)}</span>{key === "conflicts" && mission.openConflicts > 0 && <em>{mission.openConflicts}</em>}{key === "approvals" && mission.pendingApprovals > 0 && <em>{mission.pendingApprovals}</em>}</button>)}</nav></header>
    {(notice || error) && <div className={`toast-banner ${error ? "error" : ""}`}>{error ? <AlertOctagon size={17} /> : <BadgeCheck size={17} />}<span>{error || notice}</span><button className="icon-button" onClick={() => { setError(""); setNotice(""); }}><X size={15} /></button></div>}
    <div className={`mission-content mission-content-${view}`}>{view === "room" && <MissionRoom mission={mission} action={action} busy={busy} setView={(next) => setParams({ view: next })} />}{view === "conflicts" && <ConflictInbox mission={mission} action={action} busy={busy} />}{view === "plan" && <PlanView mission={mission} action={action} busy={busy} />}{view === "access" && <AccessView mission={mission} />}{view === "approvals" && <ApprovalCenter mission={mission} action={action} busy={busy} isStale={isStale} />}{view === "evidence" && <EvidenceLedger mission={mission} />}{view === "outcome" && <OutcomeView mission={mission} action={action} busy={busy} />}</div>
  </main></AppShell>;
}

type MissionAction = (key: string, request: Promise<unknown>, message?: string) => Promise<{ mission: MissionDetail } | undefined>;

function FlowSourceIcon({ type }: { type?: string }) {
  if (type === "Calendar" || type === "Google Calendar" || type === "Deadline") return <CalendarDays size={17} />;
  if (type === "Email" || type === "Gmail") return <Mail size={17} />;
  if (type === "Slack" || type === "Meeting note") return <MessageSquareWarning size={17} />;
  if (type === "Budget") return <CircleDollarSign size={17} />;
  if (type === "Policy" || type === "Approval requirement") return <ShieldCheck size={17} />;
  return <FileText size={17} />;
}

function MissionRoom({ mission, action, busy, setView, readOnly = false }: { mission: MissionDetail; action: MissionAction; busy: string; setView: (view: string) => void; readOnly?: boolean }) {
  const openConflicts = mission.conflicts.filter((conflict) => conflict.status === "open");
  const primaryConflict = openConflicts.find((conflict) => conflict.type === "Hard conflict") ?? openConflicts.find((conflict) => conflict.blocking) ?? openConflicts[0];
  const [selectedConflictId, setSelectedConflictId] = useState(primaryConflict?.id ?? "");
  const [correction, setCorrection] = useState("");
  const [correctionAuthor, setCorrectionAuthor] = useState(mission.createdBy);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const plan = mission.currentPlan;
  const selectedConflict = openConflicts.find((conflict) => conflict.id === selectedConflictId) ?? primaryConflict;

  useEffect(() => {
    if (!openConflicts.some((conflict) => conflict.id === selectedConflictId)) setSelectedConflictId(primaryConflict?.id ?? "");
  }, [mission.updatedAt, primaryConflict?.id, selectedConflictId]);

  const conflictAssertionIds = Array.from(new Set(openConflicts.flatMap((conflict) => conflict.sourceAssertionIds)));
  const relevantAssertions = conflictAssertionIds.map((assertionId) => mission.assertions.find((assertion) => assertion.id === assertionId)).filter((assertion): assertion is MissionDetail["assertions"][number] => Boolean(assertion));
  const visibleAssertions = [...relevantAssertions, ...mission.assertions.filter((assertion) => assertion.sourceId && !conflictAssertionIds.includes(assertion.id))].slice(0, 4);
  const selectedAssertionIds = new Set(selectedConflict?.sourceAssertionIds ?? []);
  const sourceById = new Map(mission.sources.map((source) => [source.id, source]));
  const sourceEvidence = (selectedConflict?.sourceAssertionIds ?? []).map((assertionId) => mission.assertions.find((assertion) => assertion.id === assertionId)).filter((assertion): assertion is MissionDetail["assertions"][number] => Boolean(assertion));

  const actualAgentTasks = plan?.tasks.filter((task) => task.ownerType === "agent").slice(0, 3) ?? [];
  const fallbackAgents = [
    { name: "Planning Agent", title: tr("Build the execution plan", "建立專案計畫與時程"), status: "pending" },
    { name: "Operations Agent", title: tr("Prepare governed operations", "準備受治理的執行工作"), status: "blocked" },
    { name: "Evidence Agent", title: tr("Collect outcome evidence", "蒐集證據與成果指標"), status: "pending" },
  ];
  const agents = fallbackAgents.map((fallback, index) => {
    const task = actualAgentTasks[index];
    const progress = task?.status === "completed" ? 100 : task?.status === "running" ? 62 : task?.status === "ready" ? 18 : 0;
    return { id: task?.id ?? `fallback-agent-${index}`, name: task ? localizeDomainText(task.ownerName) : fallback.name, title: task ? localizeDomainText(task.title) : fallback.title, status: task?.status ?? fallback.status, progress };
  });

  const flowNodes: MissionFlowNode[] = [
    ...visibleAssertions.map((assertion, index) => {
      const source = assertion.sourceId ? sourceById.get(assertion.sourceId) : undefined;
      return {
        id: `intent-${assertion.id}`,
        type: "missionNode" as const,
        position: { x: 20, y: 90 + index * 150 },
        data: {
          variant: "intent" as const,
          title: localizeDomainText(assertion.statement),
          meta: `${source ? localizeLabel(source.type) : localizeLabel(assertion.type)} · ${localizeDomainText(source?.author ?? mission.createdBy)}`,
          sourceType: source?.type ?? assertion.type,
          status: selectedAssertionIds.has(assertion.id) ? "blocked" : "verified",
          accent: selectedAssertionIds.has(assertion.id) ? "red" as const : "lime" as const,
          conflictId: openConflicts.find((conflict) => conflict.sourceAssertionIds.includes(assertion.id))?.id,
        },
      };
    }),
    {
      id: "conflict-hub", type: "missionNode", position: { x: 310, y: 275 },
      data: { variant: "conflict", title: openConflicts.length ? tr(`${openConflicts.length} blocking conflicts`, `${openConflicts.length} 項阻擋衝突`) : tr("Intent resolved", "意圖已收斂"), meta: tr("CONFLICT / DECISION", "衝突／決策"), detail: selectedConflict ? localizeDomainText(selectedConflict.title) : tr("No incompatible instruction remains.", "目前沒有互不相容的指令。"), status: openConflicts.length ? "blocked" : "completed", accent: openConflicts.length ? "red" : "lime", conflictId: selectedConflict?.id },
    },
    {
      id: "human-owner", type: "missionNode", position: { x: 535, y: 275 },
      data: { variant: "human", title: localizeDomainText(selectedConflict?.decisionOwner ?? mission.createdBy), meta: tr("HUMAN DECISION", "人工決策"), detail: openConflicts.length ? tr("Waiting for an accountable decision", "等待具權責的人做出決策") : tr("Contract decision recorded", "合約決策已記錄"), status: openConflicts.length ? "pending" : "completed", accent: "violet" },
    },
    ...agents.map((agent, index) => ({
      id: `agent-${agent.id}`, type: "missionNode" as const, position: { x: 755, y: 85 + index * 190 },
      data: { variant: "agent" as const, title: agent.name, meta: tr("AI EXECUTION", "AI 執行"), detail: agent.title, status: openConflicts.length && agent.status !== "completed" ? "blocked" : agent.status, progress: agent.progress, accent: "blue" as const },
    })),
    {
      id: "outcome", type: "missionNode", position: { x: 995, y: 275 },
      data: { variant: "outcome", title: tr("Mission outcome", "Mission 成果"), meta: tr("VERIFIABLE RESULT", "可驗收成果"), detail: localizeDomainText(mission.successMetric), status: mission.outcome?.status ?? "not_started", accent: "lime" },
    },
  ];

  const arrowClosed = "arrowclosed" as MarkerType;
  const edgeBase = { type: "smoothstep", markerEnd: { type: arrowClosed, width: 14, height: 14 }, pathOptions: { borderRadius: 18 } };
  const flowEdges: Edge[] = [
    ...visibleAssertions.map((assertion) => ({ id: `edge-${assertion.id}-conflict`, source: `intent-${assertion.id}`, target: "conflict-hub", animated: selectedAssertionIds.has(assertion.id), style: { stroke: selectedAssertionIds.has(assertion.id) ? "#ef5b55" : "#b9bbb7", strokeWidth: selectedAssertionIds.has(assertion.id) ? 2 : 1.3 }, markerEnd: { type: arrowClosed, color: selectedAssertionIds.has(assertion.id) ? "#ef5b55" : "#b9bbb7", width: 14, height: 14 }, type: edgeBase.type, pathOptions: edgeBase.pathOptions })),
    { id: "edge-conflict-human", source: "conflict-hub", target: "human-owner", animated: Boolean(openConflicts.length), style: { stroke: openConflicts.length ? "#ef5b55" : "#82a43d", strokeWidth: 2 }, markerEnd: { type: arrowClosed, color: openConflicts.length ? "#ef5b55" : "#82a43d", width: 14, height: 14 }, type: edgeBase.type, pathOptions: edgeBase.pathOptions },
    ...agents.map((agent) => ({ id: `edge-human-${agent.id}`, source: "human-owner", target: `agent-${agent.id}`, animated: !openConflicts.length && agent.status === "running", style: { stroke: openConflicts.length ? "#c7c8c4" : "#4175d6", strokeDasharray: openConflicts.length ? "5 5" : undefined, strokeWidth: 1.5 }, markerEnd: { type: arrowClosed, color: openConflicts.length ? "#c7c8c4" : "#4175d6", width: 14, height: 14 }, type: edgeBase.type, pathOptions: edgeBase.pathOptions })),
    ...agents.map((agent) => ({ id: `edge-${agent.id}-outcome`, source: `agent-${agent.id}`, target: "outcome", style: { stroke: "#c7c8c4", strokeDasharray: "5 5", strokeWidth: 1.2 }, markerEnd: { type: arrowClosed, color: "#c7c8c4", width: 14, height: 14 }, type: edgeBase.type, pathOptions: edgeBase.pathOptions })),
  ];

  const submitCorrection = (event: FormEvent) => {
    event.preventDefault();
    if (readOnly || correction.trim().length < 5) return;
    action("correction", api<{ mission: MissionDetail }>(`/api/missions/${mission.id}/corrections`, { method: "POST", body: JSON.stringify({ statement: correction.trim(), assertionType: "Constraint", author: correctionAuthor.trim() || mission.createdBy }) }), tr("Named correction recorded. The shared room, active contract and prior approvals were updated.", "具名修正已記錄；共同控制室、目前合約與舊有核准已更新。" )).then((result) => { if (result) setCorrection(""); });
  };

  const recommendedResolution = selectedConflict?.options.find((option) => option.recommended);

  return <div className={`flow-canvas-layout ${inspectorOpen ? "" : "inspector-collapsed"}`}>
    <section className="mobile-mission-journey" aria-label={tr("Mobile mission execution story", "手機版 Mission 執行流程")}>
      <div className="mobile-room-hero">
        <div><span className="mobile-live"><span /> {tr("LIVE CONTRACT", "即時合約")}</span><small>{tr(`Plan v${mission.currentPlanVersion} · source-backed`, `Plan v${mission.currentPlanVersion} · 來源可追`)}</small></div>
        <h1>{selectedConflict ? tr("Relay stopped the wrong launch before it happened.", "Relay 在錯誤發布發生前，先停住了它。") : tr("This mission is ready for governed execution.", "這個 Mission 已可安全執行。")}</h1>
        <p>{selectedConflict ? tr(`${agents.length} agent roles are paused until one accountable human resolves the conflicting instructions below.`, `${agents.length} 個 Agent 角色已暫停，直到具權責的人解決下方矛盾。`) : tr("Every downstream agent is working from the same active contract.", "所有下游 Agent 都依同一份有效合約工作。")}</p>
        <div className="mobile-receipt"><div><b>{mission.sources.length}</b><span>{tr("sources", "來源")}</span></div><div><b>{mission.assertions.length}</b><span>{tr("assertions", "主張")}</span></div><div><b>{mission.blockingConflicts}</b><span>{tr("blockers", "阻擋")}</span></div></div>
      </div>

      {selectedConflict ? <div className="mobile-journey-stack">
        <div className="mobile-step-label"><span>01</span><p>{tr("The evidence disagrees", "來源證據互相矛盾")}</p></div>
        <div className="mobile-evidence-stack">{sourceEvidence.slice(0, 3).map((assertion) => { const source = assertion.sourceId ? sourceById.get(assertion.sourceId) : undefined; return <article key={assertion.id}><span className={`mobile-source-icon ${sourceColors[source?.type ?? ""] ?? "lime"}`}><FlowSourceIcon type={source?.type ?? assertion.type} /></span><div><small>{source ? `${localizeLabel(source.type)} · ${localizeDomainText(source.author)}` : localizeLabel(assertion.type)}</small><b>{localizeDomainText(assertion.statement)}</b></div><FileCheck2 size={15} /></article>; })}</div>
        <div className="mobile-flow-link danger"><span /><AlertOctagon size={18} /><span /></div>

        <div className="mobile-step-label"><span>02</span><p>{tr("Relay blocks execution", "Relay 阻擋錯誤執行")}</p></div>
        <article className="mobile-conflict-card">
          <div className="mobile-conflict-top"><span className={`severity-tag ${selectedConflict.severity}`}>{localizeLabel(selectedConflict.severity)}</span><span><CircleStop size={14} /> {tr("EXECUTION BLOCKED", "執行已阻擋")}</span></div>
          <h2>{localizeDomainText(selectedConflict.title)}</h2><p>{localizeDomainText(selectedConflict.summary)}</p>
          <div className="mobile-conflict-switch">{openConflicts.map((conflict, index) => <button className={conflict.id === selectedConflict.id ? "active" : ""} key={conflict.id} onClick={() => setSelectedConflictId(conflict.id)}>{String(index + 1).padStart(2, "0")}</button>)}</div>
        </article>
        <div className="mobile-agent-pause"><span>{tr("PAUSED DOWNSTREAM", "已暫停下游任務")}</span>{agents.map((agent) => <div key={agent.id}><span><Bot size={15} /></span><p><b>{agent.name}</b><small>{agent.title}</small></p><em>{tr("PAUSED", "暫停")}</em></div>)}</div>
        <div className="mobile-flow-link"><span /><UserRound size={18} /><span /></div>

        <div className="mobile-step-label"><span>03</span><p>{tr("One human decision unlocks the plan", "一個人工決策解鎖計畫")}</p></div>
        <article className="mobile-decision-card"><img src="/assets/relay-jennifer-256.png" alt="Jennifer" /><div><span>{tr("DECISION OWNER", "決策負責人")}</span><b>{localizeDomainText(selectedConflict.decisionOwner)}</b><small>{tr("Approval cannot be delegated to an agent", "核准不能交給 Agent 自行決定")}</small></div><span>{tr("Waiting", "等待中")}</span></article>
        <article className="mobile-safe-action"><span><Sparkles size={14} /> {tr("RELAY RECOMMENDS", "RELAY 建議")}</span><h2>{tr("Next safe action", "下一步安全行動")}</h2><p>{localizeDomainText(recommendedResolution?.description ?? selectedConflict.consequences)}</p>{readOnly ? <button className="button button-primary button-full" onClick={() => setView("new")}>{tr("Run this on my real launch", "分析我真正的 Launch")} <ArrowRight size={17} /></button> : <button className="button button-primary button-full" onClick={() => setView("conflicts")}><ShieldCheck size={17} /> {tr(`Resolve ${mission.blockingConflicts} conflicts`, `解決 ${mission.blockingConflicts} 項衝突`)}</button>}</article>
        {!readOnly && <form className="mobile-correction" onSubmit={submitCorrection}><label><UserRound size={14} /><input aria-label={tr("Correction author", "修正者姓名")} value={correctionAuthor} onChange={(event) => setCorrectionAuthor(event.target.value)} /></label><div><input aria-label={tr("Add a human correction", "加入人工修正")} value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder={tr("Add a correction…", "輸入新的限制或修正…")} /><button type="submit" disabled={correction.trim().length < 5 || busy === "correction"}>{busy === "correction" ? <span className="loader small" /> : <Send size={17} />}</button></div></form>}
      </div> : <div className="mobile-clear-contract"><BadgeCheck size={32} /><h2>{tr("No incompatible instruction remains.", "目前沒有互不相容的指令。")}</h2><p>{tr("Open the execution plan to review preflight checks and continue.", "開啟執行計畫，檢查執行前條件並繼續任務。")}</p><button className="button button-primary button-full" onClick={() => setView("plan")}>{tr("Open execution plan", "開啟執行計畫")} <ArrowRight size={17} /></button></div>}
    </section>
    <section className="flow-canvas" aria-label={tr("Mission execution canvas", "Mission 執行 Canvas")}>
      <div className="flow-stage-labels" aria-hidden="true"><span>{tr("Intent sources", "意圖來源")}<small>{tr("Evidence-backed inputs", "輸入與依據")}</small></span><span>{tr("Conflict / Decision", "衝突／決策")}<small>{tr("What blocks execution", "阻擋執行的關鍵")}</small></span><span>{tr("Human approval", "人工核准")}<small>{tr("Accountable judgment", "具權責的判斷")}</small></span><span>{tr("AI execution", "AI 執行")}<small>{tr("Governed agent work", "受治理的 Agent 任務")}</small></span><span>{tr("Outcome", "成果")}<small>{tr("Verifiable result", "可驗收成果")}</small></span></div>
      <Suspense fallback={<div className="flow-loading"><span className="loader" /><p>{tr("Opening execution canvas…", "正在開啟執行 Canvas…")}</p></div>}><ExecutionFlowCanvas nodes={flowNodes} edges={flowEdges} onConflictSelect={setSelectedConflictId} /></Suspense>
      <form className="flow-command" onSubmit={submitCorrection}><label className="flow-command-author"><UserRound size={14} /><input aria-label={tr("Correction author", "修正者姓名")} value={correctionAuthor} disabled={readOnly} onChange={(event) => setCorrectionAuthor(event.target.value)} /></label><Zap size={17} /><input aria-label={tr("Add a human correction", "加入人工修正")} value={correction} disabled={readOnly} onChange={(event) => setCorrection(event.target.value)} placeholder={readOnly ? tr("Read-only example · create a mission to add corrections", "唯讀範例 · 建立自己的 Mission 後即可修正") : tr("Add an instruction or correction, for example: Set the budget to NT$20,000", "輸入指令或修正，例如：將預算統一為 NT$20,000")} /><kbd>⌘ ↵</kbd><button type="submit" disabled={readOnly || correction.trim().length < 5 || correctionAuthor.trim().length < 1 || busy === "correction"} aria-label={tr("Submit correction and replan", "送出修正並重新規劃")}>{busy === "correction" ? <span className="loader small" /> : <Send size={17} />}</button></form>
      {!inspectorOpen && <button className="flow-inspector-open" onClick={() => setInspectorOpen(true)} aria-label={tr("Open conflict inspector", "開啟衝突檢視")}><PanelRightOpen size={18} /><span>{mission.blockingConflicts}</span></button>}
    </section>
    {inspectorOpen && <aside className="flow-inspector"><div className="flow-inspector-head"><div><span>{selectedConflict ? tr("SELECTED CONFLICT", "已選取衝突") : tr("CONTRACT STATE", "合約狀態")}</span><h2>{selectedConflict ? tr(`${mission.blockingConflicts} blocking conflicts`, `${mission.blockingConflicts} 項阻擋衝突`) : tr("Execution can proceed", "執行可以繼續")}</h2></div><button className="icon-button" onClick={() => setInspectorOpen(false)} aria-label={tr("Close inspector", "關閉檢視")}><PanelRightClose size={18} /></button></div>
      <div className="compiler-receipt"><span>{tr("COMPILER RECEIPT", "編譯器憑據")}</span><div><b>{mission.sources.length}</b><small>{tr("sources", "個來源")}</small></div><div><b>{mission.assertions.length}</b><small>{tr("assertions", "項主張")}</small></div><div><b>{mission.conflicts.length}</b><small>{tr("conflicts", "項衝突")}</small></div><div><b>{mission.auditEvents.length}</b><small>{tr("audit events", "筆稽核事件")}</small></div><p><FileCheck2 size={13} /> {tr("MVP ruleset · every result links to stored source text", "MVP 規則集 · 每個結果都連回已保存的來源文字")}</p></div>
      <section className="flow-activity-feed"><div className="flow-activity-title"><span>{tr("SHARED ACTIVITY", "共用活動")}</span><small><span /> {tr("persists · sync 10s", "已保存 · 10 秒同步")}</small></div>{mission.auditEvents.slice(-3).reverse().map((event) => <div className="flow-activity-event" key={event.id}><span className={`activity-actor ${event.actorType}`}>{event.actorType === "human" ? <UserRound size={13} /> : event.actorType === "agent" ? <Bot size={13} /> : <Blocks size={13} />}</span><div><b>{localizeDomainText(event.actorName)}</b><p>{localizeDomainText(event.summary)}</p></div><time>{formatDate(event.createdAt, true)}</time></div>)}{!mission.auditEvents.length && <p className="flow-activity-empty">{tr("The first human or agent event will appear here.", "第一筆人類或 Agent 活動會顯示在這裡。")}</p>}</section>
      {selectedConflict ? <>
        <div className="flow-conflict-switch">{openConflicts.map((conflict, index) => <button className={conflict.id === selectedConflict.id ? "active" : ""} key={conflict.id} onClick={() => setSelectedConflictId(conflict.id)} aria-label={`${tr("Conflict", "衝突")} ${index + 1}`}>{String(index + 1).padStart(2, "0")}</button>)}</div>
        <div className="flow-inspector-summary"><span className={`severity-tag ${selectedConflict.severity}`}>{localizeLabel(selectedConflict.severity)}</span><h3>{localizeDomainText(selectedConflict.title)}</h3><p>{localizeDomainText(selectedConflict.summary)}</p></div>
        <section className="flow-evidence"><span>{tr("SOURCE EVIDENCE", "來源依據")}</span>{sourceEvidence.map((assertion) => { const source = assertion.sourceId ? sourceById.get(assertion.sourceId) : undefined; return <button key={assertion.id} onClick={() => setSelectedConflictId(selectedConflict.id)}><FlowSourceIcon type={source?.type ?? assertion.type} /><div><b>{localizeDomainText(assertion.statement)}</b><small>{source ? `${localizeLabel(source.type)} · ${localizeDomainText(source.author)}` : localizeLabel(assertion.type)}</small></div><ArrowRight size={14} /></button>; })}</section>
        <section className="flow-impact"><span>{tr("IF UNRESOLVED", "若未解決")}</span><p>{localizeDomainText(selectedConflict.consequences)}</p></section>
        <section className="flow-owner"><span>{tr("DECISION OWNER", "決策負責人")}</span><div><img src="/assets/relay-jennifer-256.png" alt="Jennifer" /><div><b>{localizeDomainText(selectedConflict.decisionOwner)}</b><small>{tr("Mission owner · only decision maker", "Mission 負責人 · 唯一決策者")}</small></div><span>{tr("Waiting", "等待中")}</span></div></section>
        <div className="flow-safe-action"><span>{tr("NEXT SAFE ACTION", "下一步安全行動")}</span><p>{readOnly ? tr("Use this same flow on a real launch brief from your team.", "把同一套流程用在你團隊真正的 Launch Brief。") : tr("Resolve the contradiction before agents continue downstream execution.", "先解決矛盾，AI Agent 才能繼續後續執行。")}</p><button className="button button-primary button-full" onClick={() => setView(readOnly ? "new" : "conflicts")}><ShieldCheck size={17} /> {readOnly ? tr("Analyze my own launch", "分析我自己的 Launch") : tr(`Resolve ${mission.blockingConflicts} conflicts`, `解決 ${mission.blockingConflicts} 項衝突`)} <ArrowRight size={17} /></button></div>
      </> : <div className="flow-clear-state"><BadgeCheck size={32} /><h3>{tr("The active plan is internally consistent.", "目前有效計畫沒有內部衝突。")}</h3><p>{tr("Open the plan to review preflight checks and safely continue execution.", "開啟計畫檢查執行前條件，並安全繼續任務。")}</p><button className="button button-primary button-full" onClick={() => setView("plan")}><Maximize2 size={17} />{tr("Open execution plan", "開啟執行計畫")}</button></div>}
    </aside>}
  </div>;
}

function ConflictInbox({ mission, action, busy }: { mission: MissionDetail; action: MissionAction; busy: string }) {
  const [selected, setSelected] = useState<Record<string, string>>({}); const [reasons, setReasons] = useState<Record<string, string>>({});
  const open = mission.conflicts.filter((conflict) => conflict.status === "open"); const resolved = mission.conflicts.filter((conflict) => conflict.status === "resolved");
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">{tr("CONFLICT COMPILER", "衝突編譯器")}</span><h2>{open.length ? tr(`${open.length} contradictions need a decision`, `${open.length} 項矛盾需要決策`) : tr("Organizational intent is resolved", "組織意圖衝突已解決")}</h2><p>{tr("Blocking conflicts stop only the affected execution path. Every resolution becomes part of the next contract.", "阻擋性衝突只會停止受影響的執行路徑；每項解法都會成為下一版合約的一部分。")}</p></div><div className="conflict-summary"><span><AlertOctagon />{mission.blockingConflicts} {tr("blocking", "項阻擋")}</span><span><Scale />{open.length} {tr("open", "項待處理")}</span><span><Check />{resolved.length} {tr("resolved", "項已解決")}</span></div></div>
    {open.map((conflict, index) => <article className={`conflict-card ${conflict.blocking ? "blocking" : ""}`} key={conflict.id}><div className="conflict-number">C-{String(index + 1).padStart(2, "0")}</div><div className="conflict-card-main"><div className="conflict-head"><div><div className="conflict-tags"><span className={`severity-tag ${conflict.severity}`}>{localizeLabel(conflict.severity)}</span><span>{localizeLabel(conflict.type)}</span>{conflict.blocking && <span className="blocking-tag"><CircleStop size={13} /> {tr("Blocks execution", "阻擋執行")}</span>}</div><h3>{localizeDomainText(conflict.title)}</h3><p>{localizeDomainText(conflict.summary)}</p></div><div className="decision-owner"><span>{tr("DECISION OWNER", "決策負責人")}</span><b><UserRound size={15} />{localizeDomainText(conflict.decisionOwner)}</b>{conflict.decisionDueAt && <small>{tr("Due", "期限")} {conflict.decisionDueAt}</small>}</div></div><div className="consequence"><Ban size={17} /><div><span>{tr("IF UNRESOLVED", "若未解決")}</span><p>{localizeDomainText(conflict.consequences)}</p></div></div><div className="resolution-options">{conflict.options.map((option) => <label className={`resolution-option ${selected[conflict.id] === option.id ? "selected" : ""} ${option.recommended ? "recommended" : ""}`} key={option.id}><input type="radio" name={conflict.id} value={option.id} checked={selected[conflict.id] === option.id} onChange={() => setSelected({ ...selected, [conflict.id]: option.id })} /><div className="option-top"><b>{localizeDomainText(option.label)}</b>{option.recommended && <span><Sparkles size={13} /> {tr("Relay recommends", "Relay 建議")}</span>}</div><p>{localizeDomainText(option.description)}</p><div className="option-impact"><span><Clock3 />{localizeDomainText(option.timeImpact)}</span><span><CircleDollarSign />{localizeDomainText(option.budgetImpact)}</span><span><ShieldCheck />{localizeDomainText(option.risk)}</span></div></label>)}</div>{selected[conflict.id] && <div className="resolution-submit"><textarea placeholder={tr("Why is this the right decision? This becomes permanent evidence.", "為什麼這是正確決策？這段理由會成為永久證據。")} value={reasons[conflict.id] ?? ""} onChange={(event) => setReasons({ ...reasons, [conflict.id]: event.target.value })} rows={2} /><button className="button button-primary" disabled={(reasons[conflict.id]?.length ?? 0) < 3 || busy === conflict.id} onClick={() => action(conflict.id, api<{ mission: MissionDetail }>(`/api/conflicts/${conflict.id}/resolve`, { method: "POST", body: JSON.stringify({ optionId: selected[conflict.id], reason: reasons[conflict.id], decidedBy: "Jennifer" }) }), tr("Decision recorded. Resolve remaining blockers, then compile the next plan version.", "決策已記錄。請解決其餘阻擋項目，再編譯下一版計畫。"))}><Check size={16} /> {tr("Record decision", "記錄決策")}</button></div>}</div></article>)}
    {!open.length && <div className="resolved-celebration"><BadgeCheck /><div><h3>{tr("All conflicts have an explicit decision.", "所有衝突都已有明確決策。")}</h3><p>{tr("Compile the next plan version to convert those decisions into task constraints, invalidate stale approvals and activate execution.", "編譯下一版計畫，把這些決策轉為任務限制、使過期核准失效並啟用執行。")}</p></div>{mission.status === "planning" && <button className="button button-primary" disabled={busy === "plan"} onClick={() => action("plan", api<{ mission: MissionDetail }>(`/api/missions/${mission.id}/plan`, { method: "POST", body: JSON.stringify({ actor: "Jennifer" }) }), tr("Plan activated.", "計畫已啟用。"))}><GitBranch size={17} /> {tr("Compile Plan", "編譯計畫")} v{mission.currentPlanVersion + 1}</button>}</div>}
    {resolved.length > 0 && <section className="resolved-list"><div className="panel-heading"><div><span>{tr("DECISION HISTORY", "決策歷史")}</span><h2>{tr("Resolved conflicts", "已解決衝突")}</h2></div></div>{resolved.map((conflict) => <div className="resolved-item" key={conflict.id}><Check size={17} /><div><b>{localizeDomainText(conflict.title)}</b><p>{localizeDomainText(conflict.resolution?.decision)}</p><small>{conflict.resolution?.decidedBy} · {formatDate(conflict.resolution?.createdAt, true)}</small></div></div>)}</section>}
  </div>;
}

function RiskBadge({ level }: { level: number }) { const labels = [tr("Read", "讀取"), tr("Draft", "草稿"), tr("Internal write", "內部寫入"), tr("External", "對外操作"), tr("High impact", "高影響操作")]; return <span className={`risk-badge risk-${level}`}>L{level} · {labels[level]}</span>; }

function PlanView({ mission, action, busy }: { mission: MissionDetail; action: MissionAction; busy: string }) {
  const [selectedVersion, setSelectedVersion] = useState(mission.currentPlanVersion); const [openTask, setOpenTask] = useState("");
  const plan = mission.planVersions.find((item) => item.version === selectedVersion) ?? mission.currentPlan;
  if (!plan) return <div className="empty-state large"><RouteIcon /><h3>{tr("No execution plan yet", "尚未建立執行計畫")}</h3><p>{tr("Compile mission intent first.", "請先編譯 Mission 意圖。")}</p></div>;
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">{tr("VERSIONED EXECUTION CONTRACT", "版本化執行合約")}</span><h2>{tr("Plan", "計畫")} v{plan.version} · {localizeLabel(plan.status)}</h2><p>{localizeDomainText(plan.changeSummary)}</p></div><div className="version-picker"><span>{tr("Version", "版本")}</span><select value={selectedVersion} onChange={(event) => setSelectedVersion(Number(event.target.value))}>{[...mission.planVersions].reverse().map((item) => <option key={item.id} value={item.version}>{tr("Plan", "計畫")} v{item.version} · {localizeLabel(item.status)}</option>)}</select></div></div>
    <section className="contract-invariants"><div><Fingerprint /><span>{tr("CONTRACT INVARIANTS", "合約不變條件")}</span></div>{plan.contract.invariants.map((item) => <p key={item}><LockKeyhole size={14} />{localizeDomainText(item)}</p>)}</section>
    {plan.diff.length > 0 && <section className="panel diff-panel"><div className="panel-heading"><div><span>{tr("VERSION DIFF", "版本差異")}</span><h2>{tr("What changed", "變更內容")}</h2></div><GitBranch size={20} /></div><div className="diff-list">{plan.diff.map((item, index) => <div className={`diff-item ${item.kind}`} key={index}><span>{item.kind === "added" ? "+" : item.kind === "invalidated" ? "×" : "~"}</span><div><b>{localizeDomainText(item.label)}</b><p>{localizeDomainText(item.detail)}</p></div></div>)}</div></section>}
    <section className="task-graph"><div className="task-graph-head"><span>{tr("TASK GRAPH", "任務圖")}</span><div><span><Bot size={14} /> {tr("Agent owner", "Agent 負責")}</span><span><UserRound size={14} /> {tr("Human owner", "人員負責")}</span></div></div>{plan.tasks.map((task) => <article className={`task-card ${openTask === task.id ? "open" : ""}`} key={task.id}><button className="task-summary" onClick={() => setOpenTask(openTask === task.id ? "" : task.id)}><span className={`task-state large ${task.status}`}>{task.status === "completed" ? <Check size={17} /> : task.status === "blocked" ? <CircleStop size={17} /> : task.status === "running" ? <Activity size={17} /> : <span />}</span><div className="task-key"><b>{task.key}</b><small>{task.dependencies.length ? tr(`after ${task.dependencies.join(", ")}`, `接續於 ${task.dependencies.join("、")}`) : tr("root task", "起始任務")}</small></div><div className="task-title"><b>{localizeDomainText(task.title)}</b><small>{localizeDomainText(task.goal)}</small></div><span className="task-owner">{task.ownerType === "agent" ? <Bot size={15} /> : <UserRound size={15} />}{localizeDomainText(task.ownerName)}</span><RiskBadge level={task.riskLevel} /><StatusPill value={task.status} /><ChevronDown size={18} /></button>{openTask === task.id && <div className="task-details"><div className="task-detail-grid"><TaskDetail label={tr("Definition of done", "完成定義")} value={task.definitionOfDone} icon={BadgeCheck} /><TaskDetail label={tr("Approval policy", "核准政策")} value={task.approvalPolicy} icon={ShieldCheck} /><TaskDetail label={tr("Stop condition", "停止條件")} value={task.stopCondition} icon={CircleStop} /><TaskDetail label={tr("Rollback", "回滾策略")} value={task.rollbackStrategy} icon={TimerReset} /></div><div className="task-lists"><div><span>{tr("REQUIRED CAPABILITIES", "必要能力")}</span>{task.requiredCapabilities.length ? task.requiredCapabilities.map((item) => <p key={item}><KeyRound />{localizeDomainText(item)}</p>) : <p><Check />{tr("No external capability", "不需要外部能力")}</p>}</div><div><span>{tr("FORBIDDEN ACTIONS", "禁止操作")}</span>{task.forbiddenActions.map((item) => <p key={item}><Ban />{localizeDomainText(item)}</p>)}</div><div><span>{tr("REQUIRED EVIDENCE", "必要證據")}</span>{task.requiredEvidence.map((item) => <p key={item}><FileCheck2 />{localizeDomainText(item)}</p>)}</div></div>{task.preflight && <PreflightPanel result={task.preflight} />}{plan.version === mission.currentPlanVersion && !["completed", "failed"].includes(task.status) && task.key !== "T-06" && <div className="task-run"><div><b>{tr("Run preflight before execution", "執行前先進行檢查")}</b><p>{tr("Relay will return a precise blocker and next action if this task cannot run.", "若任務不能執行，Relay 會指出精確阻擋原因與下一步。")}</p></div><button className="button button-dark" disabled={busy === task.id} onClick={() => action(task.id, api<{ mission: MissionDetail }>(`/api/tasks/${task.id}/run`, { method: "POST", body: JSON.stringify({ actor: task.ownerName }) }), task.riskLevel <= 1 ? tr("Task completed under a passing execution contract.", "任務已在通過檢查的執行合約下完成。") : undefined)}><Play size={16} /> {tr("Preflight & run", "檢查並執行")}</button></div>}</div>}</article>)}</section>
  </div>;
}

function TaskDetail({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Check }) { return <div className="task-detail"><Icon size={17} /><div><span>{label}</span><p>{localizeDomainText(value)}</p></div></div>; }
function PreflightPanel({ result }: { result: NonNullable<ExecutionTask["preflight"]> }) { return <div className={`preflight-panel ${result.canRun ? "pass" : "fail"}`}><div className="preflight-head">{result.canRun ? <BadgeCheck /> : <CircleStop />}<div><span>{tr("PREFLIGHT", "執行前檢查")} {result.canRun ? tr("PASSED", "通過") : tr("BLOCKED", "已阻擋")}</span><b>{result.canRun ? tr("All execution conditions are valid", "所有執行條件皆有效") : tr("Relay stopped this task safely", "Relay 已安全停止此任務")}</b></div><small>{formatDate(result.checkedAt, true)}</small></div><div className="check-list">{result.checks.map((check) => <div className={check.passed ? "passed" : "failed"} key={check.name}>{check.passed ? <Check /> : <X />}<div><b>{localizeDomainText(check.name)}</b><p>{localizeDomainText(check.detail)}</p>{check.nextAction && <small>{tr("Next", "下一步")}：{localizeDomainText(check.nextAction)}</small>}</div></div>)}</div></div>; }

function AccessView({ mission }: { mission: MissionDetail }) {
  const plan = mission.currentPlan; const [ceremony, setCeremony] = useState(false);
  if (!plan) return null;
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">{tr("ONE MISSION · ONE ACCESS BLUEPRINT", "一個 MISSION · 一份存取藍圖")}</span><h2>{tr("Connect only what this plan needs.", "只連接這份計畫真正需要的資料。")}</h2><p>{tr("Relay derived these capabilities from task requirements. No provider is called “connected” until a real resource-level verification passes.", "Relay 依任務需求推導必要能力；在真實資源層級驗證通過前，任何服務都不會被標示為「已連線」。")}</p></div><button className="button button-primary" onClick={() => setCeremony(true)}><Link2 size={17} /> {tr("Connect this mission", "連接此 Mission")}</button></div>
    <div className="access-summary"><div><Network /><span>{plan.accessBlueprint.length}</span><small>{tr("providers required", "個必要服務")}</small></div><div><KeyRound /><span>{plan.accessBlueprint.reduce((sum, item) => sum + item.capabilities.length, 0)}</span><small>{tr("scoped capabilities", "項範圍化能力")}</small></div><div><BadgeCheck /><span>{plan.accessBlueprint.filter((item) => item.status === "verified").length}</span><small>{tr("verified grants", "項已驗證授權")}</small></div><div><Clock3 /><span>v{plan.version}</span><small>{tr("manifest version", "Manifest 版本")}</small></div></div>
    <div className="access-grid">{plan.accessBlueprint.map((access) => <article className="access-card" key={access.id}><div className="access-head"><span className={`provider-icon ${sourceColors[access.provider] ?? "lime"}`}>{access.provider.slice(0, 2).toUpperCase()}</span><div><h3>{access.provider}</h3><StatusPill value={access.status} /></div><span className={`access-level level-${access.accessLevel}`}>{localizeLabel(access.accessLevel)}</span></div><div className="access-why"><span>{tr("WHY NEEDED", "需要原因")}</span><p>{localizeDomainText(access.whyNeeded)}</p></div><div className="capability-list">{access.capabilities.map((item) => <p key={item}><Check />{localizeDomainText(item)}</p>)}</div><div className="scope-box"><LockKeyhole size={16} /><div><span>{tr("RESOURCE SCOPE", "資源範圍")}</span><p>{localizeDomainText(access.resourceScope)}</p></div></div><div className="access-footer"><span>{tr("Tasks", "任務")}：{access.taskKeys.join(", ")}</span><span>{access.expiration ? `${tr("Expires", "到期於")} ${formatDate(access.expiration)}` : tr("No grant issued", "尚未核發授權")}</span></div></article>)}</div>
    <section className="truth-banner"><ShieldCheck /><div><b>{tr("Truthful connector state", "真實連接器狀態")}</b><p>{tr("This MVP has not issued OAuth grants. These cards are a compiled Access Blueprint—not simulated provider connections. Production OAuth verification will be added provider by provider.", "此版本尚未核發 OAuth 授權。這些卡片是編譯後的存取藍圖，不是假裝已連線的服務；正式 OAuth 驗證會逐一依服務完成。")}</p></div></section>
    {ceremony && <div className="modal-scrim" onClick={() => setCeremony(false)}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" onClick={() => setCeremony(false)} aria-label={tr("Close", "關閉")}><X /></button><div className="modal-icon"><KeyRound /></div><span className="page-kicker">{tr("CONNECTION CEREMONY", "連線引導流程")}</span><h2>{tr("Access queue compiled.", "存取佇列已編譯。")}</h2><p>{tr(`Relay will request each provider independently, verify the exact resource scope, then create an immutable Access Manifest for Plan v${plan.version}.`, `Relay 會個別向每項服務要求授權、驗證精確資源範圍，再為計畫 v${plan.version} 建立不可變的 Access Manifest。`)}</p><div className="ceremony-list">{plan.accessBlueprint.map((item, index) => <div key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><b>{item.provider}</b><small>{localizeLabel(item.accessLevel)} · {localizeLabel(item.status)}</small></div>)}</div><div className="modal-warning"><AlertOctagon /><p>{tr("OAuth is intentionally not simulated. Provider authorization remains unavailable until its real callback, vault storage and verification check are configured.", "Relay 刻意不模擬 OAuth。每項服務必須完成真實 callback、加密憑證儲存與驗證檢查後，才會開放授權。")}</p></div><button className="button button-dark button-full" onClick={() => setCeremony(false)}>{tr("Return to access blueprint", "返回存取藍圖")}</button></div></div>}
  </div>;
}

function ApprovalCenter({ mission, action, busy, isStale }: { mission: MissionDetail; action: MissionAction; busy: string; isStale: boolean }) {
  const plan = mission.currentPlan; if (!plan) return null;
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">{tr("EXACT APPROVAL CENTER", "精確核准中心")}</span><h2>{tr("Approve the action—not the idea.", "核准的是精確操作，不是模糊概念。")}</h2><p>{tr("Every decision is locked to one plan version, exact payload, audience, budget, stop condition and expiration.", "每項決策都綁定一個計畫版本、精確內容、受眾、預算、停止條件與到期時間。")}</p></div><div className="approval-stats"><span>{plan.approvals.filter((item) => item.status === "pending").length} {tr("pending", "項等待中")}</span><span>{plan.approvals.filter((item) => item.status === "approved").length} {tr("approved", "項已核准")}</span></div></div>
    {plan.approvals.map((approval) => <article className={`approval-card ${approval.status}`} key={approval.id}><div className="approval-top"><div className="approval-icon"><ShieldCheck /></div><div><div className="approval-label"><span>{tr("RISK LEVEL 3 · EXTERNAL ACTION", "風險等級 3 · 對外操作")}</span><StatusPill value={approval.status} /></div><h3>{localizeDomainText(approval.action)}</h3><p>{tr("Requested by", "申請人")} {localizeDomainText(approval.requester)} · {tr("Plan", "計畫")} v{plan.version}</p></div><div className="approval-expiry"><Clock3 /><span>{tr("EXPIRES", "到期時間")}</span><b>{formatDate(approval.expiresAt, true)}</b></div></div><div className="payload-grid">{Object.entries(approval.exactPayload).map(([key, value]) => <div key={key}><span>{localizePayloadKey(key)}</span><b>{typeof value === "number" && key.toLowerCase().includes("budget") ? formatMoney(value) : localizeDomainText(String(value))}</b></div>)}</div><div className="payload-hash"><Fingerprint /><div><span>{tr("PAYLOAD HASH", "內容雜湊")}</span><code>{approval.payloadHash}</code></div><LockKeyhole size={16} /></div><div className="approval-guard"><CircleStop /><div><b>{tr("Automatic stop condition", "自動停止條件")}</b><p>{localizeDomainText(approval.stopCondition)}</p></div></div>{approval.reason && <div className="decision-reason"><b>{tr("Decision evidence", "決策證據")}</b><p>{localizeDomainText(approval.reason)}</p><small>{localizeDomainText(approval.approver)} · {formatDate(approval.decidedAt, true)}</small></div>}{approval.status === "pending" && <div className="approval-actions"><div>{isStale || mission.blockingConflicts ? <p className="danger-text"><Ban size={15} /> {tr("Approval disabled", "核准已停用")}：{isStale ? tr("plan is superseded", "計畫已被新版取代") : tr("blocking conflicts remain", "仍有阻擋性衝突")}。</p> : <p><BadgeCheck size={15} /> {tr("This payload matches the active contract.", "這份內容與目前有效合約一致。")}</p>}</div><button className="button button-ghost" disabled={busy === approval.id || isStale} onClick={() => action(approval.id, api(`/api/approvals/${approval.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "rejected", decidedBy: "Jennifer", reason: tr("Rejected after exact payload review.", "完成精確內容審查後拒絕。") }) }), tr("Approval rejected and evidence recorded.", "核准已拒絕，證據已記錄。"))}><X size={16} /> {tr("Reject", "拒絕")}</button><button className="button button-primary" disabled={busy === approval.id || isStale || mission.blockingConflicts > 0} onClick={() => action(approval.id, api(`/api/approvals/${approval.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "approved", decidedBy: "Jennifer", reason: tr("Exact payload, audience, budget and stop condition reviewed and approved.", "精確內容、受眾、預算與停止條件皆已審查並核准。") }) }), tr("Exact approval recorded for this plan version and payload hash.", "此計畫版本與內容雜湊的精確核准已記錄。"))}><ShieldCheck size={16} /> {tr("Approve exact payload", "核准精確內容")}</button></div>}</article>)}
  </div>;
}

function EvidenceLedger({ mission }: { mission: MissionDetail }) {
  const [mode, setMode] = useState<"events" | "sources" | "assertions">("events");
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">{tr("IMMUTABLE LINEAGE", "不可變執行脈絡")}</span><h2>{tr("Evidence ledger", "證據帳本")}</h2><p>{tr("Answer why an agent acted, which version governed it, who approved it and what result followed.", "完整回答 Agent 為何採取行動、受哪個版本治理、由誰核准，以及最後產生什麼成果。")}</p></div><div className="segmented">{(["events", "sources", "assertions"] as const).map((item) => <button className={mode === item ? "active" : ""} onClick={() => setMode(item)} key={item}>{localizeLabel(item)}</button>)}</div></div>
    {mode === "events" && <section className="ledger"><div className="ledger-head"><span>{tr("Timestamp", "時間")}</span><span>{tr("Actor", "執行者")}</span><span>{tr("Event", "事件")}</span><span>{tr("Evidence summary", "證據摘要")}</span><span>{tr("Version", "版本")}</span></div>{mission.auditEvents.map((event) => <div className="ledger-row" key={event.id}><span className="mono">{formatDate(event.createdAt, true)}</span><span className="ledger-actor">{event.actorType === "human" ? <UserRound /> : event.actorType === "agent" ? <Bot /> : <Blocks />}{localizeDomainText(event.actorName)}</span><code>{event.eventType}</code><div><b>{localizeDomainText(event.summary)}</b><small>{localizeLabel(event.entityType)}{event.entityId ? ` · ${event.entityId.slice(0, 8)}` : ""}</small></div><span className="mono">{event.planVersion ? `v${event.planVersion}` : "—"}</span></div>)}</section>}
    {mode === "sources" && <div className="evidence-grid">{mission.sources.map((source) => <article className="evidence-card" key={source.id}><div className="evidence-source"><span className={`provider-icon ${sourceColors[source.type] ?? "lime"}`}>{source.type.slice(0, 2).toUpperCase()}</span><div><b>{localizeDomainText(source.title)}</b><small>{localizeLabel(source.type)} · {localizeDomainText(source.author)}</small></div><span>{tr("Authority", "權威等級")} {source.authorityLevel}/5</span></div><blockquote>{localizeDomainText(source.content)}</blockquote><div className="evidence-meta"><span><Clock3 />{formatDate(source.occurredAt || source.createdAt, true)}</span><code>{source.id.slice(0, 8)}</code></div></article>)}</div>}
    {mode === "assertions" && <div className="assertion-table"><div className="assertion-head"><span>{tr("Type", "類型")}</span><span>{tr("Statement", "主張")}</span><span>{tr("Source", "來源")}</span><span>{tr("Confidence", "信心度")}</span><span>{tr("Authority", "權威等級")}</span></div>{mission.assertions.map((assertion) => <div className="assertion-row" key={assertion.id}><span className="assertion-type">{localizeLabel(assertion.type)}</span><b>{localizeDomainText(assertion.statement)}</b><code>{assertion.sourceId?.slice(0, 8) || tr("mission", "Mission")}</code><span>{Math.round(assertion.confidence * 100)}%</span><span>{assertion.authorityLevel}/5</span></div>)}</div>}
  </div>;
}

function OutcomeView({ mission, action, busy }: { mission: MissionDetail; action: MissionAction; busy: string }) {
  const storedOutcome: Omit<Outcome, "id" | "blockers" | "updatedAt"> = mission.outcome ?? { metricName: mission.successMetric, targetValue: mission.successMetric, actualValue: "", status: "not_started", cost: 0, durationMinutes: 0, humanInterventions: 0, recommendation: "" };
  const initial = { ...storedOutcome, metricName: localizeDomainText(storedOutcome.metricName), targetValue: localizeDomainText(storedOutcome.targetValue), actualValue: localizeDomainText(storedOutcome.actualValue), recommendation: localizeDomainText(storedOutcome.recommendation) };
  const [form, setForm] = useState(initial);
  return <div className="outcome-layout"><section className="outcome-main"><div className="view-heading"><div><span className="page-kicker">{tr("INTENT → OUTCOME", "意圖 → 成果")}</span><h2>{tr("Did the mission actually work?", "這個 Mission 真的成功了嗎？")}</h2><p>{tr("Task completion is not success. Close the loop with the agreed metric, cost, time and interventions.", "任務完成不等於成功。請用雙方同意的指標、成本、時間與人工介入完成成果閉環。")}</p></div></div><div className="outcome-contract"><span>{tr("ORIGINAL SUCCESS CONTRACT", "原始成功合約")}</span><h3>{localizeDomainText(mission.successMetric)}</h3><div><Target /><span>{tr("Plan", "計畫")} v{mission.currentPlanVersion}</span><span>•</span><span>{tr("Created by", "建立者")} {mission.createdBy}</span></div></div><form className="outcome-form" onSubmit={(event) => { event.preventDefault(); action("outcome", api(`/api/missions/${mission.id}/outcome`, { method: "PUT", body: JSON.stringify(form) }), tr("Outcome and mission learning recorded.", "成果與 Mission 學習已記錄。")); }}><div className="form-grid"><label>{tr("Metric name", "指標名稱")}<input value={form.metricName} onChange={(event) => setForm({ ...form, metricName: event.target.value })} /></label><label>{tr("Status", "狀態")}<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Outcome["status"] })}>{["not_started", "on_track", "at_risk", "achieved", "missed"].map((status) => <option value={status} key={status}>{localizeLabel(status)}</option>)}</select></label></div><label>{tr("Target", "目標值")}<input value={form.targetValue} onChange={(event) => setForm({ ...form, targetValue: event.target.value })} /></label><label>{tr("Actual result", "實際成果")}<input value={form.actualValue} onChange={(event) => setForm({ ...form, actualValue: event.target.value })} placeholder={tr("Example: 26 paid registrations at NT$1,110 CPA", "例如：26 筆付費報名，CPA 為 NT$1,110")} /></label><div className="form-grid three"><label>{tr("Total cost (TWD)", "總成本（TWD）")}<input type="number" min="0" value={form.cost} onChange={(event) => setForm({ ...form, cost: Number(event.target.value) })} /></label><label>{tr("Duration (minutes)", "執行時間（分鐘）")}<input type="number" min="0" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} /></label><label>{tr("Human interventions", "人工介入次數")}<input type="number" min="0" value={form.humanInterventions} onChange={(event) => setForm({ ...form, humanInterventions: Number(event.target.value) })} /></label></div><label>{tr("Next-mission recommendation", "下一次 Mission 建議")}<textarea rows={4} value={form.recommendation} onChange={(event) => setForm({ ...form, recommendation: event.target.value })} placeholder={tr("What should Relay change next time?", "Relay 下次應該改變什麼？")} /></label><button className="button button-primary" disabled={busy === "outcome"}><Target size={17} /> {tr("Save verified outcome", "儲存已驗證成果")}</button></form></section><aside className="outcome-side"><section className="panel outcome-score"><span>{tr("MISSION RESULT", "MISSION 成果")}</span><div className={`outcome-ring ${form.status}`}><strong>{form.status === "achieved" ? "100" : form.status === "on_track" ? "72" : form.status === "at_risk" ? "48" : form.status === "missed" ? "18" : "—"}</strong><small>{localizeLabel(form.status)}</small></div><div className="health-row"><span>{tr("Cost", "成本")}</span><b>{formatMoney(form.cost)}</b></div><div className="health-row"><span>{tr("Human interventions", "人工介入")}</span><b>{form.humanInterventions}</b></div><div className="health-row"><span>{tr("Open blockers", "待處理阻擋項目")}</span><b>{mission.openConflicts}</b></div></section><section className="panel moat-card"><Network /><span>{tr("INTENT-TO-OUTCOME DATA", "意圖到成果資料")}</span><h3>{tr("This is Relay’s compounding asset.", "這是 Relay 持續複利的資產。")}</h3><p>{tr("Every result connects the original intent, decisions, plan, permissions, execution and human corrections.", "每項成果都會連回原始意圖、決策、計畫、權限、執行與人工修正。")}</p></section></aside></div>;
}

function DemoPage() {
  const navigate = useNavigate();
  const [mission, setMission] = useState<MissionDetail>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ mission: MissionDetail; readOnly: true }>("/api/demo")
      .then((response) => { if (active) setMission(response.mission); })
      .catch((err) => { if (active) setError((err as Error).message); });
    return () => { active = false; };
  }, [navigate]);
  const noAction: MissionAction = async () => undefined;
  if (error) return <main className="demo-loading"><Logo /><ErrorBlock error={error} retry={() => window.location.reload()} /><Link to="/missions/new?sample=1" className="button button-primary">{tr("Analyze my launch instead", "改為分析我的 Launch")}</Link></main>;
  if (!mission) return <main className="demo-loading"><Logo /><LoadingBlock label={tr("Opening the read-only execution example…", "正在開啟唯讀執行範例…")} /></main>;
  return <main className="mission-page demo-page"><header className="mission-header"><div className="mission-topbar"><Logo compact /><span className="demo-badge"><FileCheck2 size={14} /> {tr("READ-ONLY SHARED MISSION EXAMPLE", "唯讀共用 MISSION 範例")}</span><div className="demo-actors"><UsersRound size={15} /><span>1 {tr("human", "位人類")} + 3 {tr("agent roles", "個 Agent 角色")}</span><small>{tr("recorded activity", "活動已保存")}</small></div><div className="mission-header-spacer" /><LanguageSwitcher compact /><Link to="/missions/new?sample=1" className="button button-primary button-small">{tr("Analyze my launch", "分析我的 Launch")} <ArrowRight size={15} /></Link></div></header><div className="mission-content mission-content-room"><MissionRoom mission={mission} action={noAction} busy="" readOnly setView={() => navigate("/missions/new?sample=1")} /></div></main>;
}

function NotFound() { return <div className="not-found"><Logo /><h1>{tr("That contract doesn’t exist.", "找不到這份合約。")}</h1><p>{tr("Return to the Relay control center.", "返回 Relay 控制中心。")}</p><Link className="button button-primary" to="/app">{tr("Open workspace", "開啟工作區")}</Link></div>; }

export default function App() {
  const { locale } = useLocale();
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname, locale]);
  if (location.pathname === "/") return <LandingPage />;
  if (location.pathname === "/demo") return <DemoPage />;
  if (location.pathname === "/app") return <DashboardPage />;
  if (location.pathname === "/missions/new") return <MissionIntakePage />;
  if (/^\/missions\/[^/]+$/.test(location.pathname)) return <MissionPage />;
  return <NotFound />;
}
