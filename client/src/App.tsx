import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
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
  AgentRun, ApprovalRequest, CollaborationSnapshot, CompilerReceipt, Conflict, ConnectorDescriptor, CreateMissionInput, ExecutionTask, MissionDetail, MissionMember, MissionSummary, Outcome, PlanVersion, PublicMissionReport, SourceInput,
} from "@shared/domain";

type DashboardResponse = {
  missions: MissionSummary[];
  metrics: { active: number; blocked: number; awaitingDecisions: number; awaitingApprovals: number; successfulThisWeek: number };
};

type CompilerPreview = {
  receipt: { sources: number; assertions: number; conflicts: number; blocking: number; compiler: CompilerReceipt };
  conflict: Conflict | null;
  evidence: Array<{ id: string; statement: string; assertionType: string; sourceType: string; sourceTitle: string; author: string }>;
  execution: { tasks: number; agentTasks: number; blockedAgents: number; requiredProviders: number };
  saved: false;
};

type CompilerRuntime = {
  mode: "hybrid" | "policy_only";
  model?: string;
  policyEngine: string;
  truthfulFallback: boolean;
};

type SessionIdentity = {
  actorName: string;
  workspaceId: string;
  userId: string;
  workspaceRole?: "owner" | "admin" | "member" | "viewer";
  email?: string;
  title?: string;
  department?: string;
  identityVerified: boolean;
};

function useSessionIdentity() {
  const [session, setSession] = useState<SessionIdentity>();
  useEffect(() => {
    let active = true;
    void api<{ session: SessionIdentity }>("/api/session")
      .then((response) => { if (active) setSession(response.session); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return session;
}

const navigation = [
  { label: "Overview", labelZh: "總覽", href: "/app", icon: LayoutDashboard },
  { label: "Missions", labelZh: "任務", href: "/app", icon: Radar },
  { label: "Conflict inbox", labelZh: "衝突收件匣", href: "/app?focus=conflicts", icon: MessageSquareWarning },
  { label: "Approvals", labelZh: "核准中心", href: "/app?focus=approvals", icon: ShieldCheck },
];

const sourceColors: Record<string, string> = {
  Slack: "violet", Email: "coral", Gmail: "coral", Notion: "stone", "Google Drive": "blue", Calendar: "amber",
  "Google Calendar": "amber", CRM: "teal", Ads: "pink", Manual: "lime", "Meeting note": "blue",
  GitHub: "stone", Figma: "pink",
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

const relayAgentDefinitions = [
  { name: ["Evidence parser", "證據解析器"], action: ["Labels every claim with its exact source", "把每項主張綁回原始來源"], kind: ["Deterministic worker", "確定性程式"], icon: FileCheck2 },
  { name: ["Semantic challenger", "語意挑戰 Agent"], action: ["Proposes contradictions beyond keyword matches", "找出關鍵字以外的語意矛盾"], kind: ["OpenAI model", "OpenAI 模型"], icon: MessageSquareWarning },
  { name: ["Safety policy gate", "安全政策閘門"], action: ["Rejects weak evidence and blocks unsafe action", "剔除弱證據並阻擋不安全行動"], kind: ["Deterministic code", "確定性程式"], icon: ShieldCheck },
] as const;

const relayPolicyDefinitions = [
  relayAgentDefinitions[0],
  { name: ["Conflict detector", "衝突偵測器"], action: ["Tests dates, budgets, policies and dependencies", "比對日期、預算、政策與依賴條件"], kind: ["Deterministic code", "確定性程式"], icon: MessageSquareWarning },
  relayAgentDefinitions[2],
] as const;

function compilerDefinitions(modelEnabled: boolean) {
  return modelEnabled ? relayAgentDefinitions : relayPolicyDefinitions;
}

function RelayJourney({ active }: { active: 1 | 2 | 3 }) {
  const steps = [
    { label: tr("You", "你"), title: tr("Paste what everyone said", "貼上大家說過的話"), icon: FileText },
    { label: "Relay", title: tr("Find conflicts and pause risk", "找矛盾、先停風險"), icon: Bot },
    { label: tr("Your team", "你的團隊"), title: tr("Invite teammates to decide", "邀請同事一起決定"), icon: UsersRound },
  ];
  return <ol className="relay-journey" aria-label={tr("Relay three-step workflow", "Relay 三步驟使用流程")}>
    {steps.map((step, index) => { const number = index + 1; const Icon = step.icon; return <li className={number === active ? "current" : number < active ? "done" : "upcoming"} key={step.title}><span className="relay-journey-number">{number < active ? <Check size={15} /> : number}</span><span className="relay-journey-icon"><Icon size={17} /></span><span><small>{step.label}</small><b>{step.title}</b></span></li>; })}
  </ol>;
}

function PublicHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="public-header">
      <Logo />
      <nav className={open ? "public-nav open" : "public-nav"}>
        <a href="#pain">{tr("Why agents fail", "Agent 為何做錯")}</a><a href="#plain-tech">{tr("How Relay stops it", "Relay 怎麼阻擋")}</a><a href="#use-cases">{tr("Launch scenarios", "Launch 場景")}</a><a href="#proof">{tr("Verified today", "目前已驗證")}</a>
        <LanguageSwitcher compact />
        <Link to="/demo" className="text-link">{tr("Interactive demo", "可操作範例")}</Link>
        <Link to="/missions/new" className="button button-small button-dark">{tr("Paste a mission", "貼上任務")} <ArrowRight size={15} /></Link>
      </nav>
      <button className="icon-button mobile-menu" onClick={() => setOpen((value) => !value)} aria-label={tr("Toggle menu", "開關選單")}><Menu size={20} /></button>
    </header>
  );
}

function LandingMagicCompiler({ onOpenFullMission }: { onOpenFullMission: (brief: string) => void }) {
  const { locale } = useLocale();
  const sampleBrief = locale === "zh-TW"
    ? `Mission：推出高雄活動行銷專案\n目標：7 月 29 日前上線，取得 24 筆付費報名\nSlack｜Growth 負責人：不得向既有會員推廣\nEmail｜客戶：所有公開素材都必須先通過品牌核准\nCalendar｜營運：品牌審查排在 7 月 30 日\nNotion｜行銷：預算上限是 NT$20,000\nManual｜Mission owner：核准預算上限是 NT$30,000，未經我核准不得發布\nCRM｜CRM system：目前受眾同時包含既有會員與新名單\nAds｜Meta Ads：缺少付款方式，目前無法發布\n成功指標：24 筆付費報名，CPA 不高於 NT$1,250`
    : `Mission: Launch the Kaohsiung campaign\nGoal: Launch by July 29 and acquire 24 paid registrations\nSlack | Growth lead: Do not promote to existing members\nEmail | Client: Every public creative requires brand approval\nCalendar | Operations: Brand review is scheduled for July 30\nNotion | Marketing: Budget limit is NT$20,000\nManual | Mission owner: Approved budget is NT$30,000 and nothing can publish without my approval\nCRM | CRM system: Current audience includes existing members and new leads\nAds | Meta Ads: Payment method is missing, so publishing is unavailable\nSuccess: 24 paid registrations at CPA no higher than NT$1,250`;
  const [brief, setBrief] = useState("");
  const [preview, setPreview] = useState<CompilerPreview>();
  const [editing, setEditing] = useState(true);
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

  const result = preview?.conflict;
  const recommended = result?.options.find((option) => option.recommended);
  const attachedSourceCount = brief.split("\n").filter((line) => /^(Slack|Email|Calendar|Notion|Manual|CRM|Ads)[｜|]/i.test(line)).length;
  const sourceLines = brief.split("\n").filter((line) => /^(Slack|Email|Calendar|Notion|Manual|CRM|Ads)[｜|]/i.test(line)).slice(0, 3);

  return <div className="magic-compiler" id="magic" aria-live="polite">
    <div className="magic-topbar"><span><Braces size={14} /> {tr("LIVE INTENT COMPILER", "真實意圖編譯器")}</span><span className="magic-runtime"><span /> {preview?.receipt.compiler.mode === "hybrid" ? tr("MODEL + POLICY GATE", "模型 + 政策閘門") : tr("EVIDENCE-SAFE PREVIEW", "證據安全預覽")}</span></div>
    <div className="magic-input">
      <div className="magic-input-head"><div><span>01 / {tr("YOUR REAL BRIEF", "你的真實 BRIEF")}</span><b>{attachedSourceCount ? tr(`${attachedSourceCount} source lines ready`, `${attachedSourceCount} 個來源待比對`) : tr("Nothing runs until you press Run", "按下 Run 前不會自動執行")}</b></div><div className="magic-input-actions"><button type="button" onClick={() => { setBrief(sampleBrief); setPreview(undefined); setEditing(true); }}>{tr("Load example", "載入範例")}</button>{preview && <button type="button" onClick={() => setEditing((value) => !value)}>{editing ? tr("Show result", "查看結果") : tr("Edit input", "修改輸入")}</button>}</div></div>
      {editing ? <div className="magic-editor"><textarea aria-label={tr("Mission brief to compile", "要編譯的 Mission Brief")} value={brief} onChange={(event) => { setBrief(event.target.value); setPreview(undefined); }} rows={10} placeholder={tr("Paste Slack, email, calendar, budget and approval requirements here. One source per line is enough.", "把 Slack、Email、行事曆、預算與核准要求貼在這裡；每個來源一行即可。")}/><button className="button button-primary button-full" type="button" disabled={busy || brief.trim().length < 10} onClick={() => { void compilePreview(brief); }}>{busy ? <><span className="loader small" /> {tr("Agents are checking every instruction…", "AI 正在逐條檢查指令…")}</> : <><Play size={16} /> {tr("Run Relay on my brief", "Run：分析我的 Brief")}</>}</button><small className="magic-input-privacy"><LockKeyhole size={13}/>{tr("Preview input is analyzed in memory and is not saved.", "預覽內容只在記憶體中分析，不會保存。")}</small></div>
        : <div className="magic-source-list">{sourceLines.map((line) => { const [provider, ...parts] = line.split(/[：:]/); return <div key={line}><span>{provider.split(/[｜|]/)[0]}</span><p>{parts.join(":")}</p><FileCheck2 size={13} /></div>; })}<small>+{Math.max(0, attachedSourceCount - sourceLines.length)} {tr("more attached sources", "個已附來源")}</small></div>}
    </div>
    <div className="magic-compile-rail"><span /><Zap size={17} /><b>{busy ? tr("COMPILING", "編譯中") : tr("CONTRACT CHECKED", "合約已檢查")}</b><span /></div>
    {busy && !preview ? <div className="magic-loading"><span className="loader" /><p>{tr("Extracting assertions and testing execution gates…", "正在拆解主張並檢查執行關卡…")}</p></div> : error ? <div className="magic-error"><AlertOctagon /><p>{error}</p><button onClick={() => { void compilePreview(brief); }}>{tr("Try again", "再試一次")}</button></div> : result && preview ? <div className="magic-result">
      <div className="magic-receipt"><span>{tr("COMPILER RECEIPT", "編譯器憑據")}</span><div><b>{preview.receipt.sources}</b><small>{tr("sources", "來源")}</small></div><div><b>{preview.receipt.assertions}</b><small>{tr("assertions", "主張")}</small></div><div><b>{preview.receipt.conflicts}</b><small>{tr("conflicts", "衝突")}</small></div><div><b>{preview.receipt.compiler.evidenceCoverage}%</b><small>{tr("evidence linked", "證據覆蓋")}</small></div></div>
      <div className="magic-stop"><span className="magic-stop-icon"><CircleStop size={22} /></span><div><span>{tr("RELAY STOPPED EXECUTION", "RELAY 已停止執行")}</span><h3>{localizeDomainText(result.title)}</h3><p>{localizeDomainText(result.summary)}</p></div><span className="severity-pill">{localizeLabel(result.severity)}</span></div>
      <div className="magic-evidence"><span>{tr("WHY", "為什麼")}</span>{preview.evidence.slice(0, 2).map((item) => <div key={item.id}><FlowSourceIcon type={item.sourceType} /><p><b>{localizeDomainText(item.statement)}</b><small>{localizeLabel(item.sourceType)} · {localizeDomainText(item.author)}</small></p></div>)}</div>
      <div className="magic-control"><div><span><Bot size={14} /> {preview.execution.blockedAgents} {tr("agent paths held", "條 Agent 路徑已停住")}</span><span><LockKeyhole size={14} /> {preview.execution.requiredProviders} {tr("scoped providers required", "個服務需要範圍化權限")}</span></div><p><Sparkles size={15} /><span><b>{tr("NEXT SAFE ACTION", "下一步安全行動")}</b>{localizeDomainText(recommended?.description ?? result.consequences)}</span></p><button className="button button-primary button-full" type="button" onClick={() => onOpenFullMission(brief)}>{tr("Save it and open the live mission room", "保存並進入即時 Mission Room")} <ArrowRight size={17} /></button></div>
      <small className="magic-truth"><ShieldCheck size={13} /> {tr("This result came from the live Relay compiler. Preview text is not stored.", "這是 Relay 真實編譯器的即時結果；預覽文字不會被保存。")}</small>
    </div> : null}
  </div>;
}

function RelayPlainStory() {
  return <div className="relay-story" aria-label={tr("A simple Relay example", "一張圖看懂 Relay") }>
    <div className="relay-story-head"><span><Blocks size={15} /> {tr("ONE MISSION", "同一個 MISSION")}</span><span>{tr("BEFORE AI ACTS", "AI 動手之前")}</span></div>
    <div className="relay-story-prompt"><span>01</span><div><small>{tr("THE TEAM SAYS THREE THINGS", "團隊同時說了三件事")}</small><b>{tr("All three sound reasonable—until you put them together.", "每一句單獨看都合理，放在一起就撞車。")}</b></div></div>
    <div className="relay-story-messages">
      <article><MessageSquareWarning size={18} /><div><small>Slack · Growth</small><b>{tr("“We must launch July 29.”", "「7 月 29 日一定要上線。」")}</b></div></article>
      <article><Mail size={18} /><div><small>Email · Client</small><b>{tr("“Nothing publishes before approval.”", "「品牌核准前不能發布。」")}</b></div></article>
      <article><CalendarDays size={18} /><div><small>Calendar · Ops</small><b>{tr("“Brand review: July 30.”", "「品牌審查：7 月 30 日。」")}</b></div></article>
    </div>
    <div className="relay-story-collision"><span /><AlertOctagon size={18} /><b>{tr("Relay finds the collision", "Relay 找到撞車的地方")}</b><span /></div>
    <div className="relay-story-stop"><span><CircleStop size={22} /></span><div><small>{tr("CANNOT BOTH BE TRUE", "兩件事不能同時成立")}</small><h3>{tr("Launch July 29, but approve July 30?", "7 月 29 日發布，卻要 7 月 30 日才核准？")}</h3><p>{tr("Email, Ads and CRM agents pause before they touch customers, money or data.", "Email、Ads、CRM Agent 先暫停，不碰客戶、不花錢、不改資料。")}</p></div></div>
    <div className="relay-story-human"><UserRound size={19} /><div><small>{tr("ASK THE RIGHT HUMAN", "交給真正能決定的人")}</small><b>{tr("The mission owner chooses: move review to July 28.", "Mission 負責人決定：把審查提前到 7 月 28 日。")}</b></div><span>{tr("WAITING", "等待決定")}</span></div>
    <div className="relay-story-safe"><ShieldCheck size={20} /><div><small>{tr("SAFE PLAN v2", "安全計畫 v2")}</small><b>{tr("Approve first. Then let the agents continue from one shared version.", "先核准，再讓所有 Agent 按同一個版本繼續。")}</b></div><ArrowRight size={18} /></div>
  </div>;
}

function LandingPainSection() {
  const pains = [
    [MessageSquareWarning, tr("Everyone tells AI something different", "每個人都叫 AI 做不同的事"), tr("Slack says launch. Email says wait. Calendar says the review is tomorrow.", "Slack 說今天上線，Email 說先等等，行事曆卻把審查排在明天。"), tr("Relay labels who said what, which source has authority, and which two rules cannot both be true.", "Relay 標出誰說了什麼、誰有權決定，以及哪兩條規則不能同時成立。"), "Intent Graph + Conflict Compiler"],
    [GitBranch, tr("The plan changed, but an agent still has yesterday's version", "計畫改了，Agent 卻還拿著昨天的版本"), tr("The budget changed from NT$20,000 to NT$30,000 after work had already started.", "預算從 NT$20,000 改成 NT$30,000，但 Agent 已經照舊計畫開始工作。"), tr("Relay creates a new immutable plan, marks the old one stale, and pauses every affected task.", "Relay 建立新版本、讓舊版本失效，並暫停所有受影響的任務。"), "Versioned Execution Contract"],
    [Fingerprint, tr("“Approved” gets reused for something nobody approved", "一句「批准」被拿去批准另一個內容"), tr("The audience, creative or budget changes after a manager clicked approve.", "主管核准後，受眾、素材或預算又被換掉了。"), tr("Relay binds approval to the exact payload, version, budget and expiry. Change one important field and approval disappears.", "Relay 把核准綁在精確內容、版本、預算與期限上；重要欄位一改，核准立刻失效。"), "Exact Approval + Payload Hash"],
    [KeyRound, tr("An agent can access a tool, so it assumes it may use it", "Agent 有工具權限，就以為這次也可以用"), tr("A connected ads or CRM account becomes permission to spend or edit the wrong record.", "能登入廣告或 CRM，不代表這次可以花錢或修改那筆客戶資料。"), tr("Relay checks this mission, this task, this resource and this risk level before every action.", "Relay 每次動手前，都檢查這個 Mission、這個任務、這筆資源與這個風險等級。"), "Capability Gate + Preflight"],
  ] as const;
  return <section className="section pain-section" id="pain">
    <div className="section-heading"><span className="section-index">02 / {tr("THE REAL PAIN", "真正的問題")}</span><h2>{tr("AI is smart. Your company is the messy part.", "AI 很聰明。真正混亂的是公司給它的指令。")}</h2><p>{tr("These are not rare model failures. They are everyday organizational failures that become dangerous when software can send, spend, publish or edit data on its own.", "這些不是少見的模型失誤，而是團隊每天都會發生的溝通錯誤；當 AI 能寄信、花錢、發布或改資料時，它們就會變得危險。")}</p></div>
    <div className="pain-grid">{pains.map(([Icon, title, problem, answer, tech]) => <article key={title}>
      <div className="pain-title"><span><Icon size={20} /></span><h3>{title}</h3></div>
      <div className="pain-before"><small>{tr("WITHOUT RELAY", "沒有 RELAY")}</small><p>{problem}</p></div>
      <div className="pain-after"><small>{tr("RELAY STOPS IT", "RELAY 怎麼擋")}</small><p>{answer}</p></div>
      <span className="pain-tech">{tech}</span>
    </article>)}</div>
  </section>;
}

function PlainTechnicalSection() {
  const steps = [
    [FileText, tr("Collect every note", "收齊每張便條紙"), tr("Turn each sentence into a sourced statement.", "把每句人話變成一條有來源的主張。"), "Source → Intent Assertion"],
    [Scale, tr("Circle the fighting rules", "圈出互相打架的兩句"), tr("Find deadlines, budgets, policies and dependencies that cannot coexist.", "找出不能同時成立的日期、預算、政策與前置條件。"), "Conflict Graph"],
    [UserRound, tr("Ask the person who can decide", "找真正能決定的人"), tr("Route the conflict to the owner with authority—not the loudest person.", "把衝突交給有權責的人，不是聲音最大的人。"), "Authority Model"],
    [GitBranch, tr("Lock the answer as the current version", "把答案鎖成最新版"), tr("Keep old versions, but never let them quietly keep running.", "保留舊版本，但不讓它偷偷繼續執行。"), "Versioned Contract"],
    [ShieldCheck, tr("Check the traffic light before action", "動手前先看紅綠燈"), tr("Verify version, permission, approval, budget and rollback before a tool call.", "每次呼叫工具前，檢查版本、權限、核准、預算與回滾。"), "Preflight + Capability Gate"],
    [History, tr("Leave a receipt after every move", "每一步都留一張收據"), tr("Explain what happened, why, who approved it and whether it worked.", "記下做了什麼、為什麼、誰核准，以及最後有沒有成功。"), "Audit Lineage → Outcome"],
  ] as const;
  return <section className="section plain-tech-section" id="plain-tech">
    <div className="section-heading"><span className="section-index">03 / {tr("UNDER THE HOOD", "技術上怎麼做到")}</span><h2>{tr("Think of Relay as the teacher standing at the AI classroom door.", "把 Relay 想成站在 AI 教室門口的老師。")}</h2><p>{tr("It collects every note, finds the ones that disagree, asks the right adult, locks the chosen answer, checks permission, then keeps a receipt.", "它先收齊每張便條紙，找出哪兩張打架，請正確的人選答案，把答案鎖好，確認可以動手，最後留下收據。")}</p></div>
    <div className="plain-tech-grid">{steps.map(([Icon, title, copy, tech], index) => <article key={title}><span className="plain-tech-number">{String(index + 1).padStart(2, "0")}</span><Icon size={23} /><h3>{title}</h3><p>{copy}</p><small>{tech}</small></article>)}</div>
  </section>;
}

function LandingUseCases() {
  const cases = [
    [Radar, tr("Campaign or product launch", "行銷活動或產品 Launch"), tr("BEST FIRST MISSION", "最適合第一個使用"), tr("A deadline lives in Slack, approval in email, budget in Notion, audience in CRM and the real review date in Calendar.", "截止日在 Slack、核准在 Email、預算在 Notion、受眾在 CRM，真正的審查日期又在 Calendar。"), [tr("Which instruction is current?", "哪一條指令才是現在有效的？"), tr("Who must decide before launch?", "上線前一定要誰做決定？"), tr("Which agents must stop right now?", "哪些 Agent 現在必須停？")], tr("A versioned launch plan with owners, approvals and stop conditions.", "一份有負責人、核准與停止條件的版本化 Launch 計畫。")],
    [UsersRound, tr("Agency client delivery", "Agency 的客戶交付"), tr("CLIENT-FACING RISK", "會直接影響客戶"), tr("The client changes scope by email while your team updates the brief in chat and AI keeps producing work from the old promise.", "客戶在 Email 改需求、團隊在聊天室改規格，AI 卻還照舊承諾產出。"), [tr("Which client request superseded the old one?", "哪一個客戶要求已取代舊版本？"), tr("Which exact creative was approved?", "被核准的到底是哪一版素材？"), tr("What must be redone after a correction?", "需求改變後哪些工作要重做？")], tr("One client-visible contract and a complete reason for every change.", "一份客戶看得懂的有效合約，以及每次變更的完整原因。")],
    [RouteIcon, tr("Multi-location operations", "多據點與多城市營運"), tr("MANY PEOPLE · MANY SYSTEMS", "很多人、很多系統"), tr("Dates, venues, local owners, budgets and customer lists differ by city while one central team coordinates the launch.", "每個城市的日期、場地、負責人、預算與客戶名單都不同，中央團隊卻要一起協調。"), [tr("Which rule applies to this location?", "這個據點到底適用哪一條規則？"), tr("Who may approve this spend?", "這筆支出可以由誰核准？"), tr("What changes if one city slips?", "其中一個城市延誤會影響什麼？")], tr("A per-location plan with scoped ownership, access and blockers.", "每個據點都有自己的計畫、權責、存取範圍與阻擋條件。")],
  ] as const;
  return <section className="section use-cases-section" id="use-cases">
    <div className="section-heading"><span className="section-index">05 / {tr("WHEN TO USE RELAY", "什麼情況要用")}</span><h2>{tr("Do not use Relay for every AI task. Use it when a wrong next step can hurt customers, money or data.", "不是每個 AI 任務都要開 Relay。只有下一步可能傷到客戶、錢或資料時才需要。")}</h2></div>
    <div className="use-case-grid">{cases.map(([Icon, title, label, scenario, questions, result]) => <article key={title}>
      <div className="use-case-head"><span><Icon size={21} /></span><small>{label}</small></div><h3>{title}</h3><p>{scenario}</p>
      <div className="use-case-questions">{questions.map((question) => <span key={question}><Check size={14} /> {question}</span>)}</div>
      <div className="use-case-result"><ShieldCheck size={16} /><div><small>{tr("RELAY OUTPUT", "RELAY 最後交付")}</small><b>{result}</b></div></div>
    </article>)}</div>
    <p className="use-case-truth"><ShieldCheck size={15} /> {tr("The live MVP supports pasted evidence, versioned execution, realtime teammates and durable Agent runs. A provider remains unavailable until its OAuth app and vault secrets are configured and verified.", "目前版本支援貼上證據、版本化執行、即時團隊協作與可恢復 Agent Run；任何服務都必須完成 OAuth App 與 Vault Secret 設定並驗證後才會開放。")}</p>
  </section>;
}

function RuntimePromiseCard() {
  const roles = [
    ["CEO", tr("Decides budget", "決定預算")],
    [tr("Engineer", "工程師"), tr("Ships code", "交付程式")],
    [tr("Designer", "設計師"), tr("Reviews Figma", "審查 Figma")],
    [tr("Finance", "財務"), tr("Guards spend", "控管支出")],
  ];
  const agents = [["Conflict Agent", tr("found 2 blockers", "找到 2 個阻擋")], ["Launch Agent", tr("paused at approval", "停在核准關卡")], ["GitHub Agent", tr("checkpoint saved", "Checkpoint 已保存")]];
  return <aside className="runtime-promise" aria-label={tr("What the live mission room contains", "即時 Mission Room 會顯示什麼") }>
    <div className="runtime-promise-head"><span><Activity size={15}/>{tr("LIVE MISSION ROOM", "即時 MISSION ROOM")}</span><em><span/>{tr("SERVER-SENT EVENTS", "事件即時推送")}</em></div>
    <div className="runtime-team-lane"><small>{tr("VERIFIED HUMANS", "具名人類同事")}</small><div>{roles.map(([name, action]) => <article key={name}><span>{name.slice(0, 2)}</span><p><b>{name}</b><small>{action}</small></p><i/></article>)}</div></div>
    <div className="runtime-contract-pulse"><span/><GitBranch size={17}/><b>{tr("ONE ACTIVE PLAN · v4", "唯一有效計畫 · v4")}</b><span/></div>
    <div className="runtime-agent-lane"><small>{tr("DURABLE AGENT RUNS", "可恢復的 AGENT RUN")}</small>{agents.map(([name, action], index) => <article key={name}><span><Bot size={16}/></span><p><b>{name}</b><small>{action}</small></p><div className="runtime-progress"><i style={{width: `${[100, 62, 38][index]}%`}}/></div><em>{index === 0 ? tr("DONE", "完成") : index === 1 ? tr("PAUSED", "暫停") : tr("RUNNING", "執行中")}</em></article>)}</div>
    <div className="runtime-proof-row"><ShieldCheck size={16}/><p><b>{tr("Every action is real or visibly blocked.", "每個行動不是有真實憑據，就是清楚標示被阻擋。")}</b><small>{tr("No fake connection. No anonymous editor. No lost checkpoint.", "不假裝已連線、不允許匿名編輯、也不遺失執行進度。")}</small></p></div>
  </aside>;
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
            <div className="eyebrow"><span className="pulse-dot" /> {tr("LAUNCH CONTROL FOR GROWTH · AGENCY · OPERATIONS", "給 GROWTH · AGENCY · 營運團隊的 LAUNCH 控制層")}</div>
            <h1>{locale === "zh-TW" ? <><span className="hero-line">在 AI 寄信、花錢</span><span className="hero-line">或發布前，</span><span className="hero-line hero-accent-line">先抓出會讓它做錯事的指令。</span></> : <><span className="hero-line">Before AI sends, spends</span><span className="hero-line">or publishes,</span><span className="hero-line hero-accent-line">catch the instruction that makes it wrong.</span></>}</h1>
            <h2>{locale === "zh-TW" ? <>把 Slack、Email、Brief、預算與審核日期一起貼上。Relay 會在一分鐘內<b>指出互相衝突的原句、停住受影響的 Agent，並交給真正有權決定的人。</b></> : <>Paste Slack, email, briefs, budgets and review dates together. In under a minute Relay <b>shows the exact conflicting lines, pauses affected agents and routes the decision to the accountable human.</b></>}</h2>
            <p>{tr("Built first for cross-functional campaign and product launches where one wrong version can contact customers, waste budget or publish before approval.", "第一個切口就是跨部門 Campaign 與產品 Launch：一個錯誤版本就可能誤觸客戶、浪費預算，或在核准前公開發布。")}</p>
            <div className="hero-actions">
              <button className="button button-primary button-large" onClick={() => document.getElementById("magic")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{tr("Run Relay on my brief", "立刻 Run 我的 Brief")} <ArrowRight size={18} /></button>
              <button className="button button-ghost button-large" onClick={() => navigate("/demo")}><Play size={17} fill="currentColor" /> {tr("See the real workflow", "看真實操作流程")}</button>
            </div>
            <RelayJourney active={1} />
            <p className="agent-definition"><Bot size={16} /><span><b>{tr("What is an AI agent here?", "這裡的 AI Agent 是什麼？")}</b>{tr("A software role that performs one clearly named job—not a person and not an autonomous employee.", "它是只負責一種明確工作的軟體角色，不是真人，也不是會自行做主的虛擬員工。")}</span></p>
          </div>
          <RuntimePromiseCard />
        </section>

        <section className="proof-strip"><span>{tr("RELAY IS THE CHECKPOINT BEFORE ACTION", "RELAY 是 AI 動手前的檢查站")}</span><ArrowRight size={18} /><b>{tr("source-backed conflict → affected agents stop → accountable human decides → one version resumes", "有來源的衝突 → 受影響 Agent 停止 → 權責人決定 → 只讓同一版本繼續")}</b></section>

        <section className="section live-proof-section">
          <div className="live-proof-copy"><span className="section-index">01 / {tr("REAL MAGIC MOMENT", "真實 MAGIC MOMENT")}</span><h2>{tr("This is not a video. Relay is really comparing seven sources.", "這不是動畫。Relay 真的正在把 7 個來源互相比對。")}</h2><p>{tr("The compiler below extracts statements, detects a rule collision, pauses affected work and proposes one safe next step. Edit the evidence and run it again.", "下方編譯器會拆出每項主張、找出規則衝突、暫停受影響的工作，再提出一個安全下一步。你可以直接修改來源再跑一次。")}</p><div className="live-proof-legend"><span><FileCheck2 size={15} /> {tr("Input: pasted source text", "輸入：貼上的原始文字")}</span><span><CircleStop size={15} /> {tr("Output: a source-backed blocker", "輸出：有來源的阻擋原因")}</span><span><ShieldCheck size={15} /> {tr("Preview is not stored", "預覽內容不保存")}</span></div></div>
          <LandingMagicCompiler onOpenFullMission={(brief) => { sessionStorage.setItem("relay_mission_draft", brief); navigate("/missions/new?draft=1"); }} />
        </section>

        <LandingPainSection />
        <PlainTechnicalSection />
        <section className="section differentiation-section">
          <div className="section-heading"><span className="section-index">04 / {tr("WHY THIS IS A NEW LAYER", "為什麼這不是另一個 AGENT BUILDER")}</span><h2>{tr("Agent builders decide how work runs. Relay decides whether it is the right work to run.", "Agent Builder 決定工作怎麼跑；Relay 先決定這是不是現在該跑的工作。")}</h2><p>{tr("Workflows, models and project trackers start after someone has defined the task. Relay operates one layer earlier: whose instruction is authoritative, which version is current and what must stop when intent changes.", "Workflow、模型與專案工具都假設任務已經定義好；Relay 往上游多走一步：誰的指令有權威、哪個版本有效，以及意圖改變時哪些執行必須停止。")}</p></div>
          <div className="category-contrast"><article><span>{tr("AGENT / WORKFLOW LAYER", "AGENT／WORKFLOW 層")}</span><h3>{tr("“Run these steps.”", "「照這些步驟執行。」")}</h3><ul><li><Play />{tr("Orchestrates models and tools", "協調模型與工具")}</li><li><RouteIcon />{tr("Retries a defined workflow", "重試既定流程")}</li><li><Bot />{tr("Assumes the brief is valid", "假設 Brief 已經正確")}</li></ul></article><ArrowRight size={24} /><article className="relay-layer"><span>{tr("RELAY INTENT CONTROL", "RELAY 意圖控制層")}</span><h3>{tr("“Should these steps run at all?”", "「這些步驟到底該不該執行？」")}</h3><ul><li><Scale />{tr("Reconciles conflicting authority", "收斂互相衝突的權威")}</li><li><GitBranch />{tr("Binds execution to one version", "把執行綁定唯一版本")}</li><li><CircleStop />{tr("Stops stale or unauthorized action", "阻擋過期或未授權操作")}</li></ul></article></div>
          <div className="product-proof-grid"><div><b>6</b><span>{tr("conflict classes checked", "種衝突類型可檢查")}</span></div><div><b>1:1</b><span>{tr("mission-to-workspace isolation", "Mission 與 Workspace 隔離")}</span></div><div><b>0</b><span>{tr("agent completions without a receipt", "個無憑據的 Agent 完成")}</span></div><div><b>SHA-256</b><span>{tr("artifact and approval integrity", "Artifact 與核准完整性")}</span></div></div>
          <p className="product-proof-note"><ShieldCheck size={15} /> {tr("These are product invariants verified in the code and test suite—not customer traction claims.", "以上是程式與測試驗證的產品不變條件，不是客戶成長數字。")}</p>
        </section>
        <LandingUseCases />

        <section className="section multiplayer-section" id="multiplayer">
          <div className="multiplayer-copy"><span className="section-index">06 / {tr("ONE SHARED VERSION", "全隊共用一個版本")}</span><h2>{tr("When one human changes a sentence, every working agent must know.", "有人改了一句話，正在工作的 Agent 也要立刻知道。")}</h2><p>{tr("A named mission owner changes the budget. Relay does not leave that correction in chat. It records who changed it, makes the old contract and approvals stale, pauses affected agents, and creates the next plan version.", "具名的 Mission 負責人修改預算後，Relay 不會把修正留在聊天室裡。它會記下是誰改了內容、讓舊合約與舊核准失效、停住受影響的 Agent，再建立下一個計畫版本。")}</p><Link to="/demo" className="button button-dark">{tr("Watch this exact mission", "打開這個真實 Mission")} <ArrowRight size={16} /></Link></div>
          <div className="multiplayer-proof" aria-label={tr("Shared mission proof", "共用 Mission 證明") }>
            <div className="multiplayer-proof-head"><span><UsersRound size={16} /> {tr("ROLE-BOUND MISSION INVITE", "綁定身分與角色的 MISSION 邀請")}</span><span className="sync-chip"><span /> {tr("LIVE EVENT STREAM", "即時事件流")}</span></div>
            <div className="multiplayer-path">
              <article><span>01</span><UserRound size={19} /><b>{tr("The owner changes the budget", "負責人修改預算")}</b><small>{tr("Named and sourced", "記名並保留來源")}</small></article>
              <ArrowRight size={17} />
              <article><span>02</span><GitBranch size={19} /><b>{tr("Plan v3 becomes stale", "計畫 v3 立即失效")}</b><small>{tr("Old approval cannot follow", "舊核准不能沿用")}</small></article>
              <ArrowRight size={17} />
              <article><span>03</span><Bot size={19} /><b>{tr("Agents pause for Plan v4", "Agent 等待計畫 v4")}</b><small>{tr("One explicit next action", "只有一個明確下一步")}</small></article>
            </div>
            <div className="multiplayer-event"><Activity size={17} /><div><span>{tr("RECORDED ACTIVITY", "已記錄活動")}</span><b>{tr("The mission owner changed the budget limit; Plan v4 requires replanning.", "Mission 負責人修改預算上限；Plan v4 需要重新規劃。")}</b></div><small>{tr("persisted", "已保存")}</small></div>
            <p className="multiplayer-truth"><ShieldCheck size={15} /> {tr("Presence, corrections, comments, handoffs and Agent checkpoints now arrive through one persisted realtime event stream.", "Presence、修正、留言、交接與 Agent Checkpoint 現在都透過同一條可保存的即時事件流送達。")}</p>
          </div>
        </section>

        <section className="section contract-section" id="control-plane">
          <div className="contract-panel">
            <div className="contract-meta"><span>{tr("EXECUTION CONTRACT", "執行合約")}</span><span>{tr("PLAN v4 · ACTIVE", "計畫 v4 · 生效中")}</span></div>
            <h3>{tr("Launch Kaohsiung campaign", "推出高雄活動行銷專案")}</h3>
            <div className="contract-row"><span>{tr("GOAL", "目標")}</span><p>{tr("Acquire 24 paid registrations by Jul 29", "7 月 29 日前取得 24 筆付費報名")}</p><BadgeCheck size={18} /></div>
            <div className="contract-row"><span>{tr("CONSTRAINT", "限制")}</span><p>{tr("Exclude existing members · Max NT$30,000", "排除既有會員 · 上限 NT$30,000")}</p><BadgeCheck size={18} /></div>
            <div className="contract-row"><span>{tr("APPROVAL", "核准")}</span><p>{tr("Named approver · exact payload · expires in 18h", "具名核准者 · 精確內容 · 18 小時後到期")}</p><BadgeCheck size={18} /></div>
            <div className="contract-row"><span>{tr("STOP", "停止")}</span><p>{tr("Pause if CPA > NT$1,250 after 10 conversions", "10 次轉換後若 CPA > NT$1,250 就暫停")}</p><CircleStop size={18} /></div>
            <div className="contract-hash"><Fingerprint size={16} /> sha256:8b1f…c04d <span>{tr("payload locked", "內容已鎖定")}</span></div>
          </div>
          <div className="contract-copy"><span className="section-index">07 / {tr("EXACT APPROVAL", "到底批准了什麼")}</span><h2>{tr("“I approve” is not enough.", "只說「我批准」還不夠。")}<br />{tr("Relay locks the exact version.", "Relay 會鎖住你批准的那一版。")}</h2><p>{tr("The approval says: this audience, this creative, this budget, this plan version, approved by this person, until this time. If any important field changes, the agent must ask again.", "核准內容會清楚寫出：這個受眾、這份素材、這筆預算、這個計畫版本、由誰核准、何時到期。重要欄位一改，Agent 就必須重新詢問。")}</p><ul className="feature-list"><li><Check /> {tr("Knows the current plan", "知道目前有效版本")}</li><li><Check /> {tr("Limits each task's access", "限制每個任務的權限")}</li><li><Check /> {tr("Approval expires and cannot drift", "核准會到期、不能偷換內容")}</li><li><Check /> {tr("Every decision has a receipt", "每個決定都有收據")}</li></ul></div>
        </section>

        <section className="section security-section" id="security"><div><span className="section-index">08 / {tr("SAFE TOOL USE", "怎麼安全使用工具")}</span><h2>{tr("The agent may knock.", "Agent 可以敲門，")}<br />{tr("It never gets the whole keyring.", "但拿不到整串鑰匙。")}</h2><p className="security-intro">{tr("Relay sits between an agent and every tool. The agent asks for one action; Relay checks whether this exact mission allows it.", "Relay 站在 Agent 與工具中間。Agent 每次只能要求一個操作，Relay 再檢查這個 Mission 是否真的允許。")}</p></div><div className="security-grid">{[
          [KeyRound, tr("Only this mission", "只限這個 Mission"), tr("Grant only the services, folders, records and actions the current plan requires.", "只開放目前計畫需要的服務、資料夾、紀錄與操作。")],
          [LockKeyhole, tr("The model never sees the key", "模型永遠看不到鑰匙"), tr("OAuth tokens stay inside the tool gateway—not in model prompts or agent memory.", "OAuth Token 只留在 Tool Gateway，不進模型 Prompt 或 Agent 記憶。")],
          [History, tr("Every tool call has a receipt", "每次工具呼叫都有收據"), tr("Record the source, plan, approval, payload, result and person responsible.", "記錄來源、計畫、核准、內容、結果與責任人。")],
          [ShieldCheck, tr("No green light means stop", "沒有綠燈就先停"), tr("Missing permission, an old version or changed content produces a blocker and one clear next step.", "缺少權限、版本過期或內容改變時，立即阻擋並告訴你下一步。")],
        ].map(([Icon, title, copy]) => <article key={String(title)}><Icon size={22} /><h3>{String(title)}</h3><p>{String(copy)}</p></article>)}</div></section>

        <section className="section reality-section" id="proof">
          <div className="reality-copy"><span className="section-index">09 / {tr("WHAT WORKS TODAY", "今天真的能用什麼")}</span><h2>{tr("No fake agents. No fake connections. Here is the honest line.", "不假裝 Agent 在線，也不假裝工具已連線。界線寫清楚。")}</h2><p>{tr("Today Relay can take pasted source text, find conflicts, resolve decisions, version a mission, invalidate stale approvals, run verified built-in tasks and preserve artifact-backed receipts. External tool execution comes only after each real connection is verified.", "今天 Relay 可以接收貼上的原始文字、找衝突、解決決策、建立 Mission 版本、讓舊核准失效、執行已驗證的內建任務，並保存由產出物支撐的執行收據。外部工具只有在真實連線逐一驗證後才會執行。")}</p></div>
          <div className="reality-board">
            <article className="available"><span>{tr("AVAILABLE NOW", "目前可用")}</span><h3>{tr("Live multiplayer execution control", "即時多人 AI 執行控制")}</h3><ul><li><Check />{tr("User-triggered mission compiler", "由使用者親手觸發的 Mission Compiler")}</li><li><Check />{tr("Named, role-bound team invites and presence", "具名、綁定角色的團隊邀請與 Presence")}</li><li><Check />{tr("Durable Agent queue, checkpoints, pause, resume and cancel", "可恢復的 Agent Queue、Checkpoint、暫停、繼續與取消")}</li><li><Check />{tr("Mission-scoped Runtime API keys and SDK", "綁定 Mission 的 Runtime API Key 與 SDK")}</li><li><Check />{tr("Versioned approvals, artifacts, receipts and outcomes", "版本化核准、Artifact、憑據與成果")}</li></ul></article>
            <article className="rollout"><span>{tr("REAL PROVIDER GATEWAY", "真實服務 GATEWAY")}</span><h3>{tr("OAuth only becomes green after verification", "OAuth 只有驗證通過才會變綠")}</h3><ul><li><Check />{tr("Google, Slack, Notion, GitHub and Figma OAuth adapters", "Google、Slack、Notion、GitHub 與 Figma OAuth Adapter")}</li><li><Check />{tr("AES-GCM credential vault and token refresh", "AES-GCM 憑證保管庫與 Token Refresh")}</li><li><Check />{tr("Plan-bound Access Manifest and Tool Gateway receipts", "綁定 Plan 的 Access Manifest 與 Tool Gateway 憑據")}</li><li><Ban />{tr("Unconfigured providers stay visibly unavailable", "未設定的服務會誠實顯示不可用")}</li></ul></article>
            <div className="data-flywheel"><Network /><div><span>{tr("THE COMPOUNDING ASSET", "持續複利的資產")}</span><h3>Source → Assertion → Conflict → Decision → Plan → Approval → Artifact → Receipt → Outcome</h3><p>{tr("Each completed mission adds a structured intent-to-outcome chain—not another chat transcript.", "每個完成的 Mission 會增加一條結構化的意圖到成果關係，而不只是另一份對話紀錄。")}</p></div></div>
          </div>
        </section>

        <section className="final-cta"><span>{tr("PASTE THE MESS. SEE THE CONFLICT. STOP THE WRONG ACTION.", "把混亂貼進來，看到衝突，停住錯誤行動。")}</span><h2>{tr("Use the mission your team", "就拿團隊現在最亂、")}<br />{tr("is most afraid to get wrong.", "也最怕做錯的任務來測。")}</h2><Link to="/missions/new" className="button button-primary button-large">{tr("Paste my real mission", "貼上我的真實任務")} <ArrowRight /></Link></section>
      </main>
      <footer><Logo /><p>{tr("Git for organizational intent—and the control plane for AI execution.", "組織意圖的 Git，也是 AI 執行的控制層。")}</p><span>© 2026 Relay</span></footer>
    </div>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [sidebar, setSidebar] = useState(false);
  const location = useLocation();
  const session = useSessionIdentity();
  const actorName = session?.actorName || tr("Mission owner", "Mission 負責人");
  const actorRole = session?.title || localizeLabel(session?.department || "Other");
  const isMissionWorkspace = /^\/missions\/[^/]+$/.test(location.pathname);
  return (
    <div className={`app-shell ${isMissionWorkspace ? "mission-shell" : ""}`}>
      {!isMissionWorkspace && <aside className={sidebar ? "sidebar open" : "sidebar"}>
        <div className="sidebar-head"><Logo compact /><button className="icon-button sidebar-close" onClick={() => setSidebar(false)}><X size={18} /></button></div>
        <div className="workspace-switch"><span className="workspace-avatar">PW</span><div><b>{tr("Private workspace", "私人工作區")}</b><small>{tr("Your mission-scoped control plane", "只限你 Mission 的控制平面")}</small></div><ChevronDown size={16} /></div>
        <nav>{navigation.map(({ label, labelZh, href, icon: Icon }) => <NavLink to={href} key={label} className={({ isActive }) => isActive && label === "Overview" ? "active" : ""} onClick={() => setSidebar(false)}><Icon size={18} />{tr(label, labelZh)}</NavLink>)}</nav>
        <div className="sidebar-spacer" />
        <div className="control-status"><span className="status-orb"><ShieldCheck size={15} /></span><div><b>{tr("Policy checks active", "合約檢查已啟用")}</b><small>{tr("Provider status is verified per mission", "服務連線會逐一在 Mission 驗證")}</small></div></div>
        <div className="user-card"><span className="user-avatar">{initials(actorName)}</span><div><b>{actorName}</b><small>{actorRole}</small></div><button className="icon-button" aria-label={tr("Open user menu", "開啟使用者選單")}><ChevronDown size={15} /></button></div>
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
  const session = useSessionIdentity();
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
      <div className="page-title"><div><span className="page-kicker">{tr("WORKSPACE CONTROL CENTER", "WORKSPACE 控制中心")}</span><h1>{tr(`Welcome, ${session?.actorName || "Mission owner"}.`, `歡迎，${session?.actorName || "Mission 負責人"}。`)}</h1><p>{tr("Here’s what needs human judgment before your agents can move.", "以下事項需要人工判斷，完成後 Agent 才能繼續執行。")}</p></div><Link to="/missions/new" className="button button-dark"><Plus size={17} /> {tr("Create mission", "建立 Mission")}</Link></div>
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

type CompileRunSummary = {
  sources: number;
  assertions: number;
  conflicts: number;
  blocking: number;
  agentTasks: number;
  blockedAgentTasks: number;
  planVersion: number;
  compilerReceipt?: CompilerReceipt;
};

type CompileRunMomentState = {
  open: boolean;
  phase: number;
  sourceCount: number;
  summary?: CompileRunSummary;
  error?: string;
};

const waitForMoment = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function CompilerTrustReceipt({ receipt, compact = false }: { receipt: CompilerReceipt; compact?: boolean }) {
  const hybrid = receipt.mode === "hybrid" && receipt.modelUsed;
  const localizedCheck = (check: CompilerReceipt["checks"][number]) => {
    switch (check.id) {
      case "source_lineage":
        return {
          label: tr("Source lineage", "來源鏈結"),
          detail: tr(
            `${receipt.evidenceCoverage}% of accepted assertions retain source lineage.`,
            `${receipt.evidenceCoverage}% 的已接受主張保留可追溯來源。`,
          ),
        };
      case "semantic_model":
        return {
          label: tr("Semantic proposal", "語意提案"),
          detail: hybrid
            ? tr(
              `${receipt.modelName ?? "OpenAI model"} proposed meaning; it received no execution authority.`,
              `${receipt.modelName ?? "OpenAI 模型"} 只提出語意判讀，不具任何執行權。`,
            )
            : tr(
              "Deterministic safety rules completed the run without model output.",
              "本次沒有模型輸出，改由確定性安全規則完成。",
            ),
        };
      case "evidence_validation":
        return {
          label: tr("Evidence validation", "證據驗證"),
          detail: tr(
            `${receipt.rejectedCandidates} unsupported or low-confidence candidates were rejected.`,
            `有 ${receipt.rejectedCandidates} 個缺乏證據或低信心候選被剔除。`,
          ),
        };
      case "policy_gate":
        return {
          label: tr("Deterministic policy gate", "確定性政策閘門"),
          detail: hybrid
            ? tr(
              "Blocking, authority and approval rules were recomputed in code after model output.",
              "模型輸出後，阻擋、權限與核准仍由程式重新計算。",
            )
            : tr(
              "Blocking, authority and approval rules were computed by deterministic code.",
              "阻擋、權限與核准皆由確定性程式計算。",
            ),
        };
      case "execution_boundary":
        return {
          label: tr("Execution boundary", "執行邊界"),
          detail: tr(
            "This compilation made zero external writes and granted zero tool credentials.",
            "本次外部寫入為 0，工具憑證授予為 0。",
          ),
        };
    }
  };
  return <section className={`compiler-trust-receipt ${compact ? "compact" : ""} ${hybrid ? "hybrid" : "fallback"}`} aria-label={tr("Compiler trust receipt", "編譯可信收據")}>
    <div className="compiler-trust-head"><span><Network size={18} /></span><div><small>{hybrid ? tr("HYBRID INTELLIGENCE", "混合式智慧") : tr("SAFE FALLBACK", "安全降級")}</small><b>{hybrid ? tr("The model proposed. Relay's code decided.", "模型提出判讀，Relay 程式負責裁決。") : tr("Relay did not pretend a model ran.", "Relay 沒有假裝模型已執行。")}</b><p>{hybrid ? `${receipt.modelName ?? tr("OpenAI model", "OpenAI 模型")} + ${receipt.engineVersion}` : tr("Deterministic safety rules completed this run.", "本次由確定性安全規則完成分析。")}</p></div><strong>{receipt.evidenceCoverage}%<small>{tr("evidence linked", "證據覆蓋")}</small></strong></div>
    <div className="compiler-trust-metrics"><span><b>{receipt.averageConfidence}%</b><small>{tr("avg confidence", "平均信心")}</small></span><span><b>+{receipt.semanticConflictsAccepted}</b><small>{tr("semantic conflicts", "語意衝突")}</small></span><span><b>{receipt.rejectedCandidates}</b><small>{tr("claims rejected", "剔除候選")}</small></span><span><b>0</b><small>{tr("external writes", "外部寫入")}</small></span></div>
    {!compact && <details className="compiler-trust-details"><summary>{tr("See exactly what Relay checked", "查看 Relay 實際檢查了什麼")} <ChevronDown size={15} /></summary><div>{receipt.checks.map((check) => { const copy = localizedCheck(check); return <p key={check.id}><span className={check.status}>{check.status === "passed" ? <Check size={13} /> : <AlertOctagon size={13} />}</span><b>{copy.label}</b><small>{copy.detail}</small></p>; })}</div></details>}
  </section>;
}

function CompileRunMoment({ state, runtime, onClose }: { state: CompileRunMomentState; runtime: CompilerRuntime; onClose: () => void }) {
  if (!state.open) return null;
  const hybrid = state.summary?.compilerReceipt
    ? state.summary.compilerReceipt.mode === "hybrid" && state.summary.compilerReceipt.modelUsed
    : runtime.mode === "hybrid";
  const definitions = compilerDefinitions(hybrid);
  const steps = definitions.map((agent) => ({ name: tr(agent.name[0], agent.name[1]), action: tr(agent.action[0], agent.action[1]), icon: agent.icon }));
  const activeStep = Math.min(state.phase, steps.length - 1);
  return <div className="compile-run-backdrop" role="dialog" aria-modal="true" aria-labelledby="compile-run-title">
    <section className={"compile-run-moment" + (state.error ? " has-error" : "")} aria-live="polite">
      <div className="compile-run-topline"><span><span className="compile-live-dot" /> {tr("LIVE RELAY RUN", "RELAY 即時執行")}</span><small>{hybrid ? tr("Model proposes · policy engine decides", "模型提案 · 政策引擎決定") : tr("Evidence rules · policy engine", "證據規則 · 政策引擎")}</small></div>
      <div className="compile-run-heading"><span className="compile-run-mark"><Sparkles /></span><div><p>{hybrid ? tr("STEP 2 OF 3 · HYBRID COMPILER", "第 2 步（共 3 步）· 混合式編譯器") : tr("STEP 2 OF 3 · SAFE COMPILER", "第 2 步（共 3 步）· 安全編譯器")}</p><h2 id="compile-run-title">{state.error ? tr("The run stopped safely.", "這次執行已安全停止。") : hybrid ? tr("One model challenges the meaning. Two code gates keep it honest.", "一個模型挑戰語意，兩道程式閘門負責守真。") : tr("Three deterministic checks build a source-backed contract.", "三道確定性檢查，建立有來源依據的合約。")}</h2></div></div>
      {!state.error ? <>
        <div className="compile-run-canvas" aria-hidden="true">
          <div className="compile-input-summary"><Braces size={18} /><span><small>{tr("YOU GAVE RELAY", "你交給 RELAY")}</small><b>{state.sourceCount} {tr("source messages", "則來源訊息")}</b></span><ArrowRight size={17} /></div>
          <div className="compile-agent-orbit">{steps.map((step, index) => { const Icon = step.icon; const stateName = index < activeStep ? "done" : index === activeStep ? "running" : "waiting"; return <div className={"compile-agent-node " + stateName} key={step.name}><span><Icon size={17} /></span><small>{tr(definitions[index].kind[0], definitions[index].kind[1])}</small><b>{step.name}</b><em>{step.action}</em>{stateName === "done" ? <Check size={13} /> : stateName === "running" ? <span className="agent-pulse" /> : null}</div>; })}</div>
        </div>
        <div className="compile-current-step"><span>{String(activeStep + 1).padStart(2, "0")}</span><div><small>{steps[activeStep].name}</small><b>{steps[activeStep].action}</b></div><span className="loader small" /></div>
        {state.summary ? <><div className="compile-run-receipt"><span>{tr("LIVE RECEIPT", "即時憑據")}</span><div><b>{state.summary.sources}</b><small>{tr("sources", "來源")}</small></div><div><b>{state.summary.assertions}</b><small>{tr("assertions", "主張")}</small></div><div className="danger"><b>{state.summary.conflicts}</b><small>{tr("conflicts", "衝突")}</small></div><div><b>{state.summary.compilerReceipt?.evidenceCoverage ?? 0}%</b><small>{tr("evidence linked", "證據覆蓋")}</small></div></div>{state.summary.compilerReceipt && <CompilerTrustReceipt receipt={state.summary.compilerReceipt} compact />}</> : <div className="compile-run-placeholder"><span /><span /><span /></div>}
      </> : <div className="compile-run-error"><AlertOctagon size={25} /><div><b>{state.error}</b><p>{tr("Nothing was sent to an external system. Return to the brief and try again.", "沒有任何內容送往外部系統。請返回 Brief 後再試一次。")}</p></div><button className="button button-dark" type="button" onClick={onClose}>{tr("Back to brief", "返回 Brief")}</button></div>}
      <p className="compile-run-truth"><ShieldCheck size={14} /> {hybrid ? tr("The model can propose meaning, but only source-backed candidates survive code validation. No external tool runs here.", "模型可以提出語意判讀，但只有通過來源驗證的候選會留下；這一步不會執行任何外部工具。") : tr("No model output was used. Deterministic evidence and policy checks completed the run without external writes.", "本次未使用模型輸出；確定性證據與政策檢查完成分析，且沒有外部寫入。")}</p>
    </section>
  </div>;
}

function MissionIntakePage() {
  const navigate = useNavigate();
  const quickExample = tr(
    `Mission: Launch the Kaohsiung campaign\nGoal: Launch by July 29 and acquire 24 paid registrations\nSlack | Growth lead: Do not promote to existing members\nEmail | Client: Every public creative requires brand approval\nCalendar | Operations: Brand review is scheduled for July 30\nNotion | Marketing: Budget limit is NT$20,000\nManual | Mission owner: Approved budget is NT$30,000 and nothing can publish without my approval\nCRM | CRM system: Current audience includes existing members and new leads\nAds | Meta Ads: Payment method is missing, so publishing is unavailable\nSuccess: 24 paid registrations at CPA no higher than NT$1,250`,
    `Mission：推出高雄活動行銷專案\n目標：7 月 29 日前上線，取得 24 筆付費報名\nSlack｜Growth 負責人：不得向既有會員推廣\nEmail｜客戶：所有公開素材都必須先通過品牌核准\nCalendar｜營運：品牌審查排在 7 月 30 日\nNotion｜行銷：預算上限是 NT$20,000\nManual｜Mission owner：核准預算上限是 NT$30,000，未經我核准不得發布\nCRM｜CRM system：目前受眾同時包含既有會員與新名單\nAds｜Meta Ads：缺少付款方式，目前無法發布\n成功指標：24 筆付費報名，CPA 不高於 NT$1,250`,
  );
  const [mode, setMode] = useState<"quick" | "structured">("quick");
  const [rawBrief, setRawBrief] = useState(() => {
    const search = new URLSearchParams(window.location.search);
    if (search.get("draft") === "1") return sessionStorage.getItem("relay_mission_draft") || "";
    return search.get("sample") === "1" ? quickExample : "";
  });
  const [form, setForm] = useState<CreateMissionInput>({ title: "", objective: "", successMetric: "", createdBy: "Mission owner", sources: [{ type: "Slack", title: "", author: "", content: "", authorityLevel: 3 }, { type: "Email", title: "", author: "", content: "", authorityLevel: 3 }] });
  const [owner, setOwner] = useState({ name: "", email: "", title: "", department: "Product" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [stage, setStage] = useState("");
  const [runMoment, setRunMoment] = useState<CompileRunMomentState>({ open: false, phase: 0, sourceCount: 0 });
  const [compilerRuntime, setCompilerRuntime] = useState<CompilerRuntime>({ mode: "policy_only", policyEngine: "relay-safety-v2", truthfulFallback: true });
  useEffect(() => {
    void api<{ compiler: CompilerRuntime }>("/api/meta").then((meta) => setCompilerRuntime(meta.compiler)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!runMoment.open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [runMoment.open]);
  const updateSource = (index: number, patch: Partial<SourceInput>) => setForm((current) => ({ ...current, sources: current.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, ...patch } : source) }));
  const loadExample = () => { setMode("quick"); setRawBrief(quickExample); };
  const compileInput = async (input: CreateMissionInput) => {
    if (!owner.name.trim()) { setError(tr("Tell Relay your name before opening a shared mission room.", "建立共用 Mission Room 前，請先填寫你的姓名。")); return; }
    setBusy(true); setError(""); setRunMoment({ open: true, phase: 0, sourceCount: input.sources.length });
    try {
      await api("/api/session/profile", { method: "PUT", body: JSON.stringify(owner) });
      input = { ...input, createdBy: owner.name.trim() };
      setStage(tr("Securing source evidence…", "正在保存來源證據…"));
      const [created] = await Promise.all([
        api<{ mission: MissionDetail }>("/api/missions", { method: "POST", body: JSON.stringify(input) }),
        waitForMoment(520),
      ]);
      setRunMoment((current) => ({ ...current, phase: 1 }));
      setStage(tr("Compiling intent and testing contradictions…", "正在編譯意圖並檢查矛盾…"));
      const compileRequest = api<{ mission: MissionDetail }>("/api/missions/" + created.mission.id + "/compile", { method: "POST" });
      await waitForMoment(560);
      setRunMoment((current) => ({ ...current, phase: 2 }));
      const [compiled] = await Promise.all([compileRequest, waitForMoment(700)]);
      const compiledMission = compiled.mission;
      const agentTasks = compiledMission.currentPlan?.tasks.filter((task) => task.ownerType === "agent") ?? [];
      const summary: CompileRunSummary = {
        sources: compiledMission.sources.length,
        assertions: compiledMission.assertions.length,
        conflicts: compiledMission.conflicts.length,
        blocking: compiledMission.conflicts.filter((conflict) => conflict.blocking && conflict.status === "open").length,
        agentTasks: agentTasks.length,
        blockedAgentTasks: agentTasks.filter((task) => task.status === "blocked").length,
        planVersion: compiledMission.currentPlanVersion,
        compilerReceipt: compiledMission.compilerReceipt,
      };
      setRunMoment((current) => ({ ...current, phase: 3, summary }));
      setStage(tr("Holding unsafe agent actions…", "正在暫停不安全的 Agent 行動…"));
      await waitForMoment(650);
      setRunMoment((current) => ({ ...current, phase: 4, summary }));
      setStage(tr("Execution contract ready", "執行合約已完成"));
      await waitForMoment(850);
      sessionStorage.removeItem("relay_mission_draft");
      navigate("/missions/" + created.mission.id + "?view=room&new=1");
    } catch (err) {
      const message = (err as Error).message;
      setError(message); setBusy(false); setStage("");
      setRunMoment((current) => ({ ...current, error: message }));
    }
  };
  const runQuick = () => {
    if (rawBrief.trim().length < 10) { setError(tr("Paste at least two instructions so Relay can compare them.", "請至少貼上兩項指令，Relay 才能進行比對。")); return; }
    try { void compileInput(parseQuickMission(rawBrief)); } catch (err) { setError((err as Error).message); }
  };
  const submitQuick = (event: FormEvent) => { event.preventDefault(); runQuick(); };
  const submitStructured = (event: FormEvent) => { event.preventDefault(); void compileInput(form); };
  const runButtonContent = busy ? <><span className="loader small" /> {stage}</> : <><Play size={18} /> {tr("Start analysis", "開始分析")} <ArrowRight size={18} /></>;
  const activeCompilerDefinitions = compilerDefinitions(compilerRuntime.mode === "hybrid");
  const mobileRunDock = <div className="mobile-run-dock"><div><span>{tr("NEXT", "下一步")}</span><small>{compilerRuntime.mode === "hybrid" ? tr("Run the model with two safety gates", "執行模型與兩道安全閘門") : tr("Run three source-safe checks", "執行三道來源安全檢查")}</small></div>{error && <p className="form-error">{error}</p>}<button className="button button-primary run-submit" disabled={busy} type="submit" form={mode === "quick" ? "quick-mission-form" : "structured-mission-form"}>{runButtonContent}</button></div>;
  const compileSidebar = <aside className="compile-sidebar"><div className="compile-card simple-compile-card"><span>{tr("WHAT HAPPENS NEXT", "按下後會發生什麼")}</span><h3>{compilerRuntime.mode === "hybrid" ? tr("One model proposes. Two code gates decide.", "一個模型提案，兩道程式閘門裁決。") : tr("Relay runs three deterministic checks.", "Relay 執行三道確定性檢查。")}</h3><div className="sidebar-agent-list">{activeCompilerDefinitions.map((agent, index) => { const Icon = agent.icon; return <div key={agent.name[0]}><span><Icon size={16} /></span><p><small>{tr("ROLE", "角色")} {index + 1} · {tr(agent.kind[0], agent.kind[1])}</small><b>{tr(agent.name[0], agent.name[1])}</b><em>{tr(agent.action[0], agent.action[1])}</em></p></div>; })}</div><div className="compile-notice"><ShieldCheck size={17} /><p>{tr("It only analyzes what you pasted. It will not send email, publish content or change an external tool.", "這一步只分析你貼的文字，不會寄信、發布內容或修改外部工具。")}</p></div>{error && <p className="form-error">{error}</p>}<button className="button button-primary button-full button-large run-submit" disabled={busy} type="submit">{runButtonContent}</button></div></aside>;
  return <AppShell><main className="page intake-page">
    <CompileRunMoment state={runMoment} runtime={compilerRuntime} onClose={() => setRunMoment((current) => ({ ...current, open: false, error: undefined }))} />
    {mobileRunDock}
    <div className="page-title intake-title"><div><Link to="/app" className="back-link">← {tr("Workspace", "工作區")}</Link><span className="page-kicker">{tr("STEP 1 OF 3", "第 1 步（共 3 步）")}</span><h1>{tr("Paste what everyone said.", "把大家說過的話貼進來。")}</h1><p>{tr("Do not clean it up and do not decide who is right. Paste Slack messages, email requirements and meeting notes together.", "不用整理，也不用先決定誰對。把 Slack 訊息、Email 要求與會議紀錄一起貼上即可。")}</p></div><button className="button button-ghost" onClick={loadExample}><Sparkles size={16} /> {tr("Not sure? Load an example", "不知道怎麼貼？載入範例")}</button></div>
    <section className="mission-owner-profile"><div><Fingerprint size={18}/><p><b>{tr("Who is opening this Mission?", "誰正在建立這個 Mission？")}</b><small>{tr("Your teammates and Agent receipts will use this identity.", "同事與 Agent 憑據都會使用這個身分。")}</small></p></div><label>{tr("Name", "姓名")}<input required value={owner.name} onChange={(event) => setOwner({...owner, name: event.target.value})} placeholder={tr("Your real name", "你的真實姓名")}/></label><label>{tr("Work email (optional)", "工作 Email（選填）")}<input type="email" value={owner.email} onChange={(event) => setOwner({...owner, email: event.target.value})} placeholder="you@company.com"/></label><label>{tr("Title", "職稱")}<input value={owner.title} onChange={(event) => setOwner({...owner, title: event.target.value})} placeholder={tr("Product lead", "產品負責人")}/></label><label>{tr("Department", "部門")}<select value={owner.department} onChange={(event) => setOwner({...owner, department: event.target.value})}>{["Executive","Product","Engineering","Design","Finance","People","Growth","Operations","Other"].map((item) => <option value={item} key={item}>{localizeLabel(item)}</option>)}</select></label></section>
    <RelayJourney active={1} />
    <button className="advanced-input-toggle" type="button" onClick={() => setMode(mode === "quick" ? "structured" : "quick")}><Braces size={15} /> {mode === "quick" ? tr("Advanced: label every source yourself", "進階：自己逐項標記來源") : tr("Back to the simple paste box", "回到簡單貼上模式")} <ArrowRight size={14} /></button>
    {mode === "quick" ? <form id="quick-mission-form" onSubmit={submitQuick} className="intake-layout quick-intake-layout"><div className="intake-main"><section className="quick-brief-card"><div className="quick-brief-head"><div><span>{tr("PASTE HERE", "貼在這裡")}</span><h2>{tr("Put every version in one box.", "把不同版本全部放進同一格。")}</h2><p>{tr("One line per person or tool is enough. Example: “Slack | Amy: launch July 29”.", "每個人或工具一行就好，例如：「Slack｜Amy：7 月 29 日發布」。")}</p></div><span className="time-to-value"><Clock3 size={15} /> {tr("About one minute", "約 1 分鐘")}</span></div><label className="quick-brief-label"><span>{tr("Your team's messages", "團隊的原始訊息")}</span><textarea className="quick-brief-textarea" value={rawBrief} onChange={(event) => setRawBrief(event.target.value)} rows={18} placeholder={tr("Paste messages, client requirements, dates and budgets here. Contradictions are welcome.", "把訊息、客戶要求、日期與預算貼在這裡。不一致也沒關係。") } required /></label><p className="quick-analysis-note"><ShieldCheck size={14} /> {tr("Relay only analyzes this text in step 2. It will not contact anyone or change another tool.", "第 2 步只會分析這些文字，不會聯絡任何人，也不會修改其他工具。")}</p></section></div>{compileSidebar}</form>
      : <form id="structured-mission-form" onSubmit={submitStructured} className="intake-layout"><div className="intake-main"><section className="form-section"><div className="form-section-title"><span>01</span><div><h2>{tr("Define the outcome", "定義成果")}</h2><p>{tr("What must be true when this mission succeeds?", "這個 Mission 成功時，哪些條件必須成立？")}</p></div></div><label>{tr("Mission name", "Mission 名稱")}<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={tr("Launch Kaohsiung campaign", "推出高雄活動行銷專案")} required minLength={3} /></label><label>{tr("Objective", "目標")}<textarea value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder={tr("Launch by… within… while never…", "在……前完成；限制為……；且絕不能……")} required minLength={10} rows={4} /></label><label>{tr("Success contract", "成功合約")}<input value={form.successMetric} onChange={(event) => setForm({ ...form, successMetric: event.target.value })} placeholder={tr("24 paid registrations at CPA ≤ NT$1,250", "24 筆付費報名，CPA ≤ NT$1,250")} required /></label></section>
        <section className="form-section"><div className="form-section-title"><span>02</span><div><h2>{tr("Attach sources", "加入來源")}</h2><p>{tr("Add at least two messages, documents or system records.", "至少加入兩則訊息、文件或系統紀錄。")}</p></div></div><div className="source-editor-list">{form.sources.map((source, index) => <article className="source-editor" key={index}><div className="source-editor-head"><span className={`source-number ${sourceColors[source.type] ?? "lime"}`}>{index + 1}</span><select value={source.type} onChange={(event) => updateSource(index, { type: event.target.value as SourceInput["type"] })}>{["Slack", "Email", "Notion", "Google Drive", "Calendar", "CRM", "Ads", "GitHub", "Figma", "Meeting note", "Manual"].map((type) => <option key={type} value={type}>{localizeLabel(type)}</option>)}</select>{form.sources.length > 2 && <button type="button" className="icon-button" aria-label={tr("Remove source", "移除來源")} onClick={() => setForm({ ...form, sources: form.sources.filter((_, itemIndex) => itemIndex !== index) })}><X size={17} /></button>}</div><div className="form-grid"><label>{tr("Source title", "來源標題")}<input value={source.title} onChange={(event) => updateSource(index, { title: event.target.value })} placeholder={tr("#launch or client thread", "#launch 或客戶對話串")} required /></label><label>{tr("Author / system", "作者／系統")}<input value={source.author} onChange={(event) => updateSource(index, { author: event.target.value })} placeholder={tr("Growth lead", "Growth 負責人")} required /></label></div><label>{tr("Exact content", "原始內容")}<textarea value={source.content} onChange={(event) => updateSource(index, { content: event.target.value })} placeholder={tr("Paste the original instruction—do not clean it up.", "貼上原始指令，不要先整理或改寫。")} rows={4} required /></label><div className="authority-row"><span>{tr("Authority", "權威等級")}</span><input aria-label={tr("Source authority level", "來源權威等級")} type="range" min="1" max="5" value={source.authorityLevel} onChange={(event) => updateSource(index, { authorityLevel: Number(event.target.value) })} /><b>{source.authorityLevel}/5</b></div></article>)}</div><button type="button" className="button button-ghost add-source" onClick={() => setForm({ ...form, sources: [...form.sources, { type: "Manual", title: "", author: "", content: "", authorityLevel: 3 }] })}><Plus size={17} /> {tr("Add another source", "再加入一個來源")}</button></section></div>{compileSidebar}</form>}
  </main></AppShell>;
}

const missionTabs = [
  ["room", "Now", "現在", Activity], ["conflicts", "Decisions", "要決定", MessageSquareWarning], ["plan", "Plan", "計畫", RouteIcon], ["access", "Tools", "工具", KeyRound],
  ["approvals", "Approvals", "待核准", ShieldCheck], ["evidence", "History", "紀錄", FileCheck2], ["outcome", "Result", "成果", Target],
] as const;

function MissionRunReceipt({ mission, onInvite, onOpenRoom }: { mission: MissionDetail; onInvite: () => void; onOpenRoom: () => void }) {
  const tasks = mission.currentPlan?.tasks ?? [];
  const agentTasks = tasks.filter((task) => task.ownerType === "agent");
  const blockedAgentTasks = agentTasks.filter((task) => task.status === "blocked").length;
  const blockers = mission.conflicts.filter((conflict) => conflict.blocking && conflict.status === "open").length;
  const hybrid = Boolean(mission.compilerReceipt?.modelUsed && mission.compilerReceipt.mode === "hybrid");
  const executionProof = mission.executionReceipts.find((receipt) => receipt.status === "succeeded" && receipt.artifactHash);
  const [reportUrl, setReportUrl] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");
  const createReport = async () => {
    setSharing(true); setShareError("");
    try {
      const response = await api<{ report: PublicMissionReport }>(`/api/missions/${mission.id}/reports`, { method: "POST", body: JSON.stringify({}) });
      const url = `${window.location.origin}/reports/${response.report.slug}`;
      setReportUrl(url);
      if (navigator.share) await navigator.share({ title: tr("Relay stopped a risky launch", "Relay 阻擋了一次有風險的 Launch"), text: tr(`Relay found ${response.report.conflictsFound} conflicts before an AI could act.`, `Relay 在 AI 動手前找出 ${response.report.conflictsFound} 項衝突。`), url });
      else await navigator.clipboard.writeText(url);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setShareError((err as Error).message);
    } finally { setSharing(false); }
  };
  return <section className="mission-run-reveal" aria-labelledby="mission-run-reveal-title">
    <div className="mission-run-reveal-head"><span><span className="compile-live-dot" /> {tr("STEP 2 COMPLETE", "第 2 步完成")}</span><small>{tr("Saved · Plan v", "已保存 · 計畫 v")}{mission.currentPlanVersion}</small></div>
    <div className="mission-run-reveal-copy"><span className="mission-run-reveal-icon"><CircleStop /></span><div><p>{mission.compilerReceipt?.modelUsed ? tr("MODEL + SAFETY ENGINE FINISHED", "模型 + 安全引擎已完成") : tr("SAFETY COMPILER FINISHED", "安全編譯器已完成")}</p><h2 id="mission-run-reveal-title">{tr("There are ", "有 ")}{blockers}{tr(" places where a human decision is needed.", " 個地方需要人來決定。")}</h2><small>{tr("Risky work is paused. Nothing was sent, published or changed in another tool.", "有風險的工作已先暫停；尚未寄送、發布或修改任何外部工具。")}</small></div></div>
    {mission.compilerReceipt && <CompilerTrustReceipt receipt={mission.compilerReceipt} />}
    <p className="mission-agent-definition"><Bot size={15} /><span><b>{tr("What actually ran?", "剛才到底是誰在工作？")}</b>{hybrid ? tr("One semantic model challenged meaning. Deterministic workers preserved evidence and kept execution authority out of the model.", "一個語意模型挑戰句子含義；確定性程式保留證據，並把執行權留在模型之外。") : tr("No semantic model ran. Deterministic evidence, conflict and policy checks completed the compilation safely.", "本次沒有執行語意模型；確定性的證據、衝突與政策檢查安全完成編譯。")}</span></p>
    <div className="mission-run-agent-line" aria-label={tr("Relay agent work completed", "Relay Agent 協作結果")}>
      <div><span><FileCheck2 /></span><small>{tr("CODE WORKER", "程式 WORKER")}</small><b>{tr("Evidence parser", "證據解析器")}</b><em>{mission.sources.length} {tr("source messages labeled", "則來源已標記")}</em><Check /></div>
      <span className="mission-run-link"><i /></span>
      <div className="danger"><span><MessageSquareWarning /></span><small>{hybrid ? tr("OPENAI MODEL", "OPENAI 模型") : tr("DETERMINISTIC CODE", "確定性程式")}</small><b>{hybrid ? tr("Semantic challenger", "語意挑戰 Agent") : tr("Conflict detector", "衝突偵測器")}</b><em>{hybrid ? `${mission.compilerReceipt?.semanticConflictsAccepted ?? 0} ${tr("extra semantic conflicts accepted", "個額外語意衝突通過")}` : tr("Dates, budgets, policies and dependencies checked", "已比對日期、預算、政策與依賴條件")}</em><Check /></div>
      <span className="mission-run-link"><i /></span>
      <div><span><ShieldCheck /></span><small>{tr("CODE GATE", "程式 GATE")}</small><b>{tr("Safety policy gate", "安全政策閘門")}</b><em>{blockedAgentTasks} {tr("risky tasks paused", "個風險任務已暫停")}</em><Check /></div>
    </div>
    {executionProof && <div className="magic-artifact-proof"><Fingerprint size={20} /><div><span>{tr("VERIFIABLE AGENT OUTPUT", "可驗證的 AGENT 產出")}</span><b>{tr("Evidence manifest created—not merely marked complete.", "證據 Manifest 已建立，不只是把任務標成完成。")}</b><code>{executionProof.artifactHash}</code></div><BadgeCheck size={20} /></div>}
    <div className="share-magic-card"><div><span>{tr("SAFE TO SHARE · RAW EVIDENCE REMOVED", "可安全分享 · 不包含原始證據")}</span><h3>{tr(`Relay stopped ${blockedAgentTasks} risky agent actions before launch.`, `Relay 在 Launch 前阻擋了 ${blockedAgentTasks} 個高風險 Agent 行動。`)}</h3><p>{tr("Create a public proof card with conflict counts, source types and the artifact hash—never your pasted messages.", "建立一張只顯示衝突數、來源類型與 Artifact 雜湊的公開證明卡；不會公開你貼上的訊息。")}</p></div><button className="button button-dark" type="button" disabled={sharing} onClick={() => { void createReport(); }}><ExternalLink size={16} /> {sharing ? tr("Creating…", "建立中…") : tr("Share the blocker card", "分享阻擋證明卡")}</button>{reportUrl && <Link className="text-link" to={new URL(reportUrl).pathname}>{tr("Open public card", "開啟公開卡片")} <ArrowRight size={14} /></Link>}{shareError && <small className="danger-text">{shareError}</small>}</div>
    <div className="mission-run-next"><span>{tr("STEP 3", "第 3 步")}</span><div><h3>{tr("Invite the teammates who should decide.", "邀請該做決定的同事進來。")}</h3><p>{tr("They will open this same saved mission, see the evidence and resolve the five questions with you.", "同事會開啟同一份已保存的任務，看到證據，並和你一起處理這些問題。")}</p></div><button className="button button-primary" type="button" onClick={onInvite}><UsersRound size={17} /> {tr("Invite teammates", "邀請同事")}</button><button className="button button-ghost" type="button" onClick={onOpenRoom}>{tr("Review the decisions first", "先查看待決定問題")} <ArrowRight size={16} /></button></div>
  </section>;
}

function InviteTeammatesDialog({ mission, open, onClose, onInvited }: { mission: MissionDetail; open: boolean; onClose: () => void; onInvited: () => void }) {
  const [form, setForm] = useState({ email: "", name: "", title: "", department: "Engineering", workspaceRole: "member", missionRole: "contributor" });
  const [invite, setInvite] = useState<{ url: string; expiresAt: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;
  const createInvite = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await api<{ invite: { token: string; expiresAt: string } }>(`/api/missions/${mission.id}/invites`, { method: "POST", body: JSON.stringify(form) });
      setInvite({ url: `${window.location.origin}/join/${response.invite.token}`, expiresAt: response.invite.expiresAt });
      onInvited();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const copy = async () => { if (invite) await navigator.clipboard.writeText(invite.url); };
  return <div className="invite-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-dialog-title">
      <div className="invite-dialog-head"><span><UsersRound size={18} /></span><div><small>{tr("STEP 3 OF 3", "第 3 步（共 3 步）")}</small><h2 id="invite-dialog-title">{tr("Invite teammates into this mission", "邀請同事加入這個任務")}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label={tr("Close invite dialog", "關閉邀請視窗")}><X size={18} /></button></div>
      <p className="invite-dialog-intro">{tr("Create a named, role-bound invite. Anonymous editor links cannot change a mission.", "建立具名、綁定角色的邀請；匿名連結無法修改 Mission。")}</p>
      {!invite ? <form className="invite-member-form" onSubmit={createInvite}>
        <div className="form-grid"><label>{tr("Name", "姓名")}<input required value={form.name} onChange={(event) => setForm({...form, name: event.target.value})} placeholder={tr("Alex Chen", "陳小明")}/></label><label>{tr("Work email", "工作 Email")}<input required type="email" value={form.email} onChange={(event) => setForm({...form, email: event.target.value})} placeholder="alex@company.com"/></label></div>
        <div className="form-grid"><label>{tr("Title", "職稱")}<input value={form.title} onChange={(event) => setForm({...form, title: event.target.value})} placeholder={tr("Staff Engineer", "資深工程師")}/></label><label>{tr("Department", "部門")}<select value={form.department} onChange={(event) => setForm({...form, department: event.target.value})}>{["Executive","Product","Engineering","Design","Finance","People","Growth","Operations","Other"].map((item) => <option value={item} key={item}>{localizeLabel(item)}</option>)}</select></label></div>
        <label>{tr("Mission role", "Mission 角色")}<select value={form.missionRole} onChange={(event) => setForm({...form, missionRole: event.target.value})}><option value="decision_maker">{tr("Decision maker", "決策者")}</option><option value="contributor">{tr("Contributor", "協作者")}</option><option value="observer">{tr("Observer", "觀察者")}</option></select></label>
        {error && <p className="form-error">{error}</p>}
        <button className="button button-primary button-full button-large" disabled={busy}><UsersRound size={17}/>{busy ? tr("Creating secure invite…", "正在建立安全邀請…") : tr("Create role-bound invite", "建立角色邀請")}</button>
      </form> : <div className="invite-created">
        <BadgeCheck size={28}/><h3>{tr(`${form.name} now has an individual invitation.`, `${form.name} 已有專屬邀請。`)}</h3>
        <p>{tr("Possession of this single-use token creates their own verified Relay identity. It expires automatically.", "這個一次性 Token 會建立對方自己的 Relay 身分，並會自動到期。")}</p>
        <label className="invite-link-label"><span>{tr("Individual invite link", "個人邀請連結")}</span><div><Link2 size={15}/><input value={invite.url} readOnly/></div></label>
        <button className="button button-primary button-full button-large" type="button" onClick={() => { void copy(); }}><Copy size={17}/>{tr("Copy invite link", "複製邀請連結")}</button>
        <button className="text-link invite-another" type="button" onClick={() => { setInvite(undefined); setForm({...form, email: "", name: "", title: ""}); }}>{tr("Invite another teammate", "再邀請一位同事")}</button>
        <p className="invite-privacy"><ShieldCheck size={14}/>{tr(`Named identity · ${form.department} · ${form.missionRole} · expires ${formatDate(invite.expiresAt, true)}`, `具名身分 · ${form.department} · ${localizeLabel(form.missionRole)} · ${formatDate(invite.expiresAt, true)} 到期`)}</p>
      </div>}
    </section>
  </div>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function LiveMissionRuntime({ mission, collaboration, onRefresh, onInvite }: { mission: MissionDetail; collaboration?: CollaborationSnapshot; onRefresh: () => Promise<void>; onInvite: () => void }) {
  const [comment, setComment] = useState("");
  const [mention, setMention] = useState("");
  const [handoffTask, setHandoffTask] = useState("");
  const [handoffTo, setHandoffTo] = useState("");
  const [handoffReason, setHandoffReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const members = collaboration?.members ?? [];
  const agents = collaboration?.agents ?? [];
  const runs = collaboration?.runs ?? [];
  const activePresence = new Set((collaboration?.presence ?? []).map((item) => item.userId));
  const tasks = mission.currentPlan?.tasks.filter((task) => task.ownerType === "agent") ?? [];
  const latestRunForTask = (taskId: string) => runs.find((run) => run.taskId === taskId);
  const perform = async (key: string, request: Promise<unknown>) => { setBusy(key); setError(""); try { await request; await onRefresh(); return true; } catch (err) { setError((err as Error).message); return false; } finally { setBusy(""); } };
  const submitComment = (event: FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) return;
    void perform("comment", api(`/api/missions/${mission.id}/comments`, { method: "POST", body: JSON.stringify({ body: comment.trim(), mentions: mention ? [mention] : [] }) })).then((ok) => { if (ok) { setComment(""); setMention(""); } });
  };
  const submitHandoff = (event: FormEvent) => {
    event.preventDefault();
    if (!handoffTask || !handoffTo || handoffReason.trim().length < 3) return;
    void perform("handoff", api(`/api/missions/${mission.id}/handoffs`, { method: "POST", body: JSON.stringify({ taskId: handoffTask, toUserId: handoffTo, reason: handoffReason, checkpoint: { planVersion: mission.currentPlanVersion, requestedFrom: "mission_room" } }) })).then((ok) => { if (ok) setHandoffReason(""); });
  };
  return <section className="live-runtime" aria-label={tr("Live humans and agents", "人類與 AI 的即時協作") }>
    <header className="live-runtime-head"><div><span><Activity size={15}/>{tr("LIVE · PERSISTED EVENT STREAM", "LIVE · 可保存即時事件流")}</span><h2>{tr("Humans decide. Agents run. Relay keeps everyone on one version.", "人類做決定、Agent 執行；Relay 讓所有人只用同一版本。")}</h2></div><button className="button button-dark button-small" onClick={onInvite}><Plus size={15}/>{tr("Add teammate", "加入同事")}</button></header>
    <div className="authority-strip"><span><LockKeyhole size={14}/>{tr("WHO MAY DECIDE", "誰可以做決定")}</span><div>{(collaboration?.authorityGraph ?? []).map((edge) => <p key={edge.id}><b>{edge.subjectName}</b><small>{tr(`authority ${edge.authorityLevel}/5 · may approve through L${edge.canApproveRisk}`, `權威 ${edge.authorityLevel}/5 · 可核准至 L${edge.canApproveRisk}`)}</small></p>)}</div>{!(collaboration?.authorityGraph.length) && <em>{tr("No decision authority is active; governed actions stay blocked.", "尚無有效決策權；受治理操作會保持阻擋。")}</em>}</div>
    <div className="live-runtime-grid">
      <section className="live-humans"><div className="runtime-section-title"><UsersRound size={16}/><span>{tr("HUMANS", "人類同事")}</span><em>{members.length}</em></div>
        <div className="live-people-list">{members.map((member) => <article key={member.user.id}><span className="person-avatar">{initials(member.user.name)}</span><div><b>{member.user.name}{member.user.identityVerified && <BadgeCheck size={13}/>}</b><small>{member.user.department || tr("Team", "團隊")} · {localizeLabel(member.role)}</small></div><i className={activePresence.has(member.user.id) ? "online" : ""}/><em>{activePresence.has(member.user.id) ? tr("LIVE", "在線") : tr("AWAY", "離線")}</em></article>)}</div>
        {!members.length && <p className="runtime-empty">{tr("Invite the engineer, designer, finance lead or CEO who owns the next decision.", "邀請負責下一個決定的工程師、設計師、財務或 CEO。")}</p>}
        <form className="runtime-comment" onSubmit={submitComment}><select aria-label={tr("Mention teammate", "提及同事")} value={mention} onChange={(event) => setMention(event.target.value)}><option value="">{tr("No mention", "不指定人")}</option>{members.map((member) => <option value={member.user.id} key={member.user.id}>@{member.user.name}</option>)}</select><div><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder={tr("Correct, ask or add context…", "修正、提問或補充資訊…")}/><button disabled={busy === "comment" || !comment.trim()} aria-label={tr("Send comment", "送出留言")}>{busy === "comment" ? <span className="loader small"/> : <Send size={16}/>}</button></div></form>
      </section>
      <section className="live-agents"><div className="runtime-section-title"><Bot size={16}/><span>{tr("DURABLE AGENTS", "可恢復 AGENT")}</span><em>{agents.length}</em></div>
        <div className="live-agent-list">{tasks.map((task) => { const agent = agents.find((item) => item.name === task.ownerName); const run = latestRunForTask(task.id); const running = run && ["queued","running","pause_requested","paused","cancel_requested"].includes(run.status); return <article key={task.id} className={run?.status ?? task.status}><span className="agent-avatar"><Bot size={16}/></span><div className="agent-run-main"><small>{task.key} · L{task.riskLevel}</small><b>{task.ownerName}</b><p>{run ? run.phase : localizeDomainText(task.title)}</p>{run && <div className="agent-run-progress"><i style={{width: `${run.progress}%`}}/><span>{run.progress}%</span></div>}</div><div className="agent-run-actions">{!run && <button disabled={busy === task.id || task.status === "completed"} onClick={() => { void perform(task.id, api(`/api/tasks/${task.id}/agent-runs`, { method: "POST", body: JSON.stringify({ agentId: agent?.id }) })); }}><Play size={14}/>{tr("Run", "執行")}</button>}{run?.status === "running" && <button onClick={() => { void perform(run.id, api(`/api/agent-runs/${run.id}/pause`, { method: "POST", body: "{}" })); }}><CircleStop size={14}/>{tr("Pause", "暫停")}</button>}{run?.status === "paused" && <button onClick={() => { void perform(run.id, api(`/api/agent-runs/${run.id}/resume`, { method: "POST", body: "{}" })); }}><Play size={14}/>{tr("Resume", "繼續")}</button>}{running && !["cancel_requested"].includes(run.status) && <button className="danger" onClick={() => { void perform(`cancel-${run.id}`, api(`/api/agent-runs/${run.id}/cancel`, { method: "POST", body: "{}" })); }}><X size={14}/>{tr("Cancel", "取消")}</button>}{run && !running && <StatusPill value={run.status}/>}</div></article>; })}</div>
        {!tasks.length && <p className="runtime-empty">{tr("Compile the mission to create governed Agent roles.", "編譯 Mission 後就會建立受治理的 Agent 角色。")}</p>}
      </section>
      <section className="live-events"><div className="runtime-section-title"><Zap size={16}/><span>{tr("WHAT IS HAPPENING NOW", "現在正在發生什麼")}</span><em>v{collaboration?.revision ?? 1}</em></div>
        <div className="live-event-list">{(collaboration?.events ?? []).slice(-8).reverse().map((event) => <article key={event.id}><span className={event.actorType}>{event.actorType === "human" ? <UserRound size={13}/> : event.actorType === "agent" ? <Bot size={13}/> : event.actorType === "provider" ? <Link2 size={13}/> : <Blocks size={13}/>}</span><div><b>{event.actorName}</b><p>{localizeDomainText(event.summary)}</p><small>{event.eventType} · {formatDate(event.createdAt, true)}</small></div></article>)}</div>
        {!(collaboration?.events.length) && <p className="runtime-empty">{tr("The first real human, Agent or provider event will appear here.", "第一筆真實的人類、Agent 或服務事件會顯示在這裡。")}</p>}
      </section>
    </div>
    <form className="runtime-handoff" onSubmit={submitHandoff}><span><RouteIcon size={16}/>{tr("HAND OFF WITH THE CHECKPOINT", "連同 CHECKPOINT 一起交接")}</span><select aria-label={tr("Task to hand off", "要交接的任務")} value={handoffTask} onChange={(event) => setHandoffTask(event.target.value)}><option value="">{tr("Choose task", "選擇任務")}</option>{(mission.currentPlan?.tasks ?? []).map((task) => <option value={task.id} key={task.id}>{task.key} · {localizeDomainText(task.title)}</option>)}</select><select aria-label={tr("Handoff recipient", "交接對象")} value={handoffTo} onChange={(event) => setHandoffTo(event.target.value)}><option value="">{tr("Choose teammate", "選擇同事")}</option>{members.map((member) => <option value={member.user.id} key={member.user.id}>{member.user.name} · {member.user.department}</option>)}</select><input value={handoffReason} onChange={(event) => setHandoffReason(event.target.value)} placeholder={tr("Why and what should happen next?", "為什麼交接？下一步要做什麼？")}/><button disabled={busy === "handoff" || !handoffTask || !handoffTo || handoffReason.trim().length < 3}>{tr("Handoff", "交接")}<ArrowRight size={14}/></button></form>
    {error && <p className="runtime-error"><AlertOctagon size={15}/>{error}</p>}
  </section>;
}

function MissionPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "room";
  const [mission, setMission] = useState<MissionDetail>();
  const [collaboration, setCollaboration] = useState<CollaborationSnapshot>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [liveState, setLiveState] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [inviteOpen, setInviteOpen] = useState(false);
  const connectionId = useRef(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-0000-4000-8000-000000000000`);
  const loadMission = useCallback(async (silent = false) => {
    if (!silent) setError("");
    try {
      const response = await api<{ mission: MissionDetail }>(`/api/missions/${id}`);
      setMission(response.mission);
    } catch (err) {
      if (!silent) setError((err as Error).message);
    }
  }, [id]);
  const loadCollaboration = useCallback(async () => {
    const response = await api<{ collaboration: CollaborationSnapshot }>(`/api/missions/${id}/collaboration`);
    setCollaboration(response.collaboration);
  }, [id]);
  const refreshAll = useCallback(async () => { await Promise.all([loadMission(true), loadCollaboration()]); }, [loadMission, loadCollaboration]);
  useEffect(() => {
    void loadMission().then(() => loadCollaboration()).catch((err) => setError((err as Error).message));
  }, [loadMission, loadCollaboration]);
  const searchQuery = params.toString();
  useEffect(() => {
    const connectorError = params.get("connector_error");
    const connectorStatus = params.get("status");
    if (!connectorError && connectorStatus !== "connected") return;
    if (connectorError) setError(connectorError);
    else setNotice(tr("Authorization returned. Verify the live account and resource scope next.", "授權已返回；下一步請驗證真實帳號與資源範圍。"));
    setParams({ view: "access" });
    void refreshAll();
  // The serialized query is the stable trigger; setParams is recreated by the lightweight router.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, refreshAll]);
  useEffect(() => {
    if (!mission) return undefined;
    const stream = new EventSource(`/api/missions/${id}/events`);
    const receive = (message: MessageEvent) => {
      setLiveState("live");
      try {
        const event = JSON.parse(message.data) as CollaborationSnapshot["events"][number];
        setCollaboration((current) => current ? { ...current, revision: event.missionRevision, events: [...current.events.filter((item) => item.id !== event.id), event].slice(-100) } : current);
      } catch { /* a later snapshot repairs malformed client state */ }
      void refreshAll();
    };
    stream.addEventListener("relay", receive as EventListener);
    stream.onopen = () => setLiveState("live");
    stream.onerror = () => setLiveState("reconnecting");
    return () => { stream.removeEventListener("relay", receive as EventListener); stream.close(); };
  }, [id, mission?.id, refreshAll]);
  useEffect(() => {
    if (!mission) return undefined;
    const heartbeat = () => void api(`/api/missions/${id}/presence`, { method: "PUT", body: JSON.stringify({ connectionId: connectionId.current, state: document.visibilityState === "visible" ? "viewing" : "away", cursorContext: view }) }).catch(() => undefined);
    heartbeat();
    const timer = window.setInterval(heartbeat, 15_000);
    const visibility = () => heartbeat();
    document.addEventListener("visibilitychange", visibility);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [id, mission?.id, view]);
  const action: MissionAction = async (key, request, message) => {
    setBusy(key); setNotice(""); setError("");
    try {
      const response = await request as { mission: MissionDetail };
      setMission(response.mission);
      await loadCollaboration();
      if (message) setNotice(message);
      return response;
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(""); }
  };
  if (error && !mission) return <AppShell><main className="page"><ErrorBlock error={error} retry={() => { void loadMission(); }} /></main></AppShell>;
  if (!mission) return <AppShell><main className="page"><LoadingBlock label={tr("Loading mission contract…", "正在載入 Mission 合約…")} /></main></AppShell>;
  const plan = mission.currentPlan;
  const isStale = plan?.status === "superseded";
  const showRunReveal = params.get("new") === "1";
  const presentHumans = new Set(collaboration?.presence.map((item) => item.userId)).size;
  const runningAgents = collaboration?.runs.filter((run) => ["queued","running","pause_requested","cancel_requested"].includes(run.status)).length ?? 0;
  return <AppShell><main className={`mission-page view-${view}`}>
    <InviteTeammatesDialog mission={mission} open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={() => { void loadCollaboration(); }} />
    <header className="mission-header"><div className="mission-topbar">
      <Link to="/app" className="mission-brand" aria-label={tr("Back to workspace", "返回工作區")}><span>RL</span><b>Relay</b></Link>
      <div className="mission-title-compact" title={localizeDomainText(mission.objective)}><small>MISSION</small><h1>{localizeDomainText(mission.title)}</h1></div>
      <button className="mission-plan-control" onClick={() => setParams({ view: "plan" })}><span>{tr("Plan", "計畫")} v{mission.currentPlanVersion}</span><i className={isStale ? "stale" : ""}/><small>{isStale ? localizeLabel("superseded") : tr("Active", "有效")}</small><ChevronDown size={14}/></button>
      <div className="mission-header-spacer"/>
      <div className="mission-live-presence"><span className={`live-signal ${liveState}`}><span/>{liveState === "live" ? tr("LIVE EVENT STREAM", "即時事件流") : tr("RECONNECTING", "重新連線中")}</span><div className="presence-avatars">{(collaboration?.members ?? []).slice(0, 4).map((member) => <span className={collaboration?.presence.some((item) => item.userId === member.user.id) ? "online" : ""} key={member.user.id} title={`${member.user.name} · ${member.user.department}`}>{initials(member.user.name)}</span>)}</div><small>{presentHumans} {tr("human live", "位人類在線")} · {runningAgents} {tr("agents running", "個 Agent 執行中")}</small></div>
      <LanguageSwitcher compact/>
      <button className="button button-dark button-small mission-share" onClick={() => setInviteOpen(true)}><UsersRound size={15}/><span>{tr("Invite teammate", "邀請同事")}</span></button>
      <button className="icon-button mission-refresh" onClick={() => { void refreshAll(); }} aria-label={tr("Refresh mission", "重新整理 Mission")}><RefreshCw size={17}/></button>
      {mission.status === "planning" && <button className="button button-primary button-small mission-compile" disabled={busy === "plan"} onClick={() => action("plan", api<{ mission: MissionDetail }>(`/api/missions/${mission.id}/plan`, { method: "POST", body: "{}" }), tr("A new active contract was created. Previous approvals were invalidated.", "新的有效合約已建立，舊版核准已失效。"))}><GitBranch size={15}/>{tr("Compile", "編譯")} v{mission.currentPlanVersion + 1}</button>}
    </div><nav className="mission-tabs" aria-label={tr("Mission views", "Mission 檢視")}>{missionTabs.map(([key, label, labelZh, Icon]) => <button className={view === key ? "active" : ""} key={key} onClick={() => setParams({ view: key })} title={tr(label, labelZh)} aria-label={tr(label, labelZh)}><Icon size={18}/><span className="mission-tab-label">{tr(label, labelZh)}</span>{key === "conflicts" && mission.openConflicts > 0 && <em>{mission.openConflicts}</em>}{key === "approvals" && mission.pendingApprovals > 0 && <em>{mission.pendingApprovals}</em>}</button>)}</nav></header>
    {(notice || error) && <div className={`toast-banner ${error ? "error" : ""}`}>{error ? <AlertOctagon size={17} /> : <BadgeCheck size={17} />}<span>{error || notice}</span><button className="icon-button" onClick={() => { setError(""); setNotice(""); }}><X size={15} /></button></div>}
    <div className={`mission-content mission-content-${view}`}>{showRunReveal && view === "room" && <MissionRunReceipt mission={mission} onInvite={() => setInviteOpen(true)} onOpenRoom={() => setParams({ view: "room" })}/>} {view === "room" && <><LiveMissionRuntime mission={mission} collaboration={collaboration} onRefresh={refreshAll} onInvite={() => setInviteOpen(true)}/><MissionRoom mission={mission} action={action} busy={busy} setView={(next) => setParams({ view: next })}/></>}{view === "conflicts" && <ConflictInbox mission={mission} action={action} busy={busy}/>} {view === "plan" && <PlanView mission={mission} action={action} busy={busy}/>} {view === "access" && <AccessView mission={mission} onRefresh={refreshAll}/>} {view === "approvals" && <ApprovalCenter mission={mission} action={action} busy={busy} isStale={isStale}/>} {view === "evidence" && <EvidenceLedger mission={mission}/>} {view === "outcome" && <OutcomeView mission={mission} action={action} busy={busy}/>}</div>
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
  const session = useSessionIdentity();
  const openConflicts = mission.conflicts.filter((conflict) => conflict.status === "open");
  const primaryConflict = openConflicts.find((conflict) => conflict.type === "Hard conflict") ?? openConflicts.find((conflict) => conflict.blocking) ?? openConflicts[0];
  const [selectedConflictId, setSelectedConflictId] = useState(primaryConflict?.id ?? "");
  const [correction, setCorrection] = useState("");
  const [correctionAuthor, setCorrectionAuthor] = useState(mission.createdBy);
  useEffect(() => { if (session?.actorName) setCorrectionAuthor(session.actorName); }, [session?.actorName]);
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
    action("correction", api<{ mission: MissionDetail }>(`/api/missions/${mission.id}/corrections`, { method: "POST", body: JSON.stringify({ statement: correction.trim(), assertionType: "Constraint" }) }), tr("Named correction recorded. The shared room, active contract and prior approvals were updated.", "具名修正已記錄；共同控制室、目前合約與舊有核准已更新。" )).then((result) => { if (result) setCorrection(""); });
  };

  const recommendedResolution = selectedConflict?.options.find((option) => option.recommended);

  return <div className={`flow-canvas-layout ${inspectorOpen ? "" : "inspector-collapsed"}`}>
    <section className="mobile-mission-journey" aria-label={tr("Mobile mission execution story", "手機版 Mission 執行流程")}>
      <div className="mobile-room-hero">
        <div><span className="mobile-live"><span /> {tr("SAME LIVE MISSION", "同一份即時 MISSION")}</span><small>{tr(`Plan v${mission.currentPlanVersion} · events stream instantly`, `計畫 v${mission.currentPlanVersion} · 事件即時推送`)}</small></div>
        <h1>{selectedConflict ? tr("Relay paused the risky work. Now one person needs to decide.", "Relay 已先停住風險。現在只需要一個人做決定。") : tr("This mission is ready for the next safe action.", "這個任務已準備好進行下一個安全步驟。")}</h1>
        <p>{selectedConflict ? tr(`Below, see which two instructions conflict, which AI roles are waiting, and who should choose the answer.`, "往下看哪兩句互相矛盾、哪些 AI 正在等待，以及該由誰選擇答案。") : tr("Every AI role is now using the same current plan.", "每個 AI 工作角色現在都依照同一份最新計畫。")}</p>
        <div className="mobile-receipt"><div><b>{mission.sources.length}</b><span>{tr("sources", "個來源")}</span></div><div><b>{mission.assertions.length}</b><span>{tr("instructions", "條指令")}</span></div><div><b>{mission.blockingConflicts}</b><span>{tr("decisions", "項待決定")}</span></div></div>
      </div>

      {selectedConflict ? <div className="mobile-journey-stack">
        <div className="mobile-step-label"><span>01</span><p>{tr("See which two instructions disagree", "先看哪兩句互相打架")}</p></div>
        <div className="mobile-evidence-stack">{sourceEvidence.slice(0, 3).map((assertion) => { const source = assertion.sourceId ? sourceById.get(assertion.sourceId) : undefined; return <article key={assertion.id}><span className={`mobile-source-icon ${sourceColors[source?.type ?? ""] ?? "lime"}`}><FlowSourceIcon type={source?.type ?? assertion.type} /></span><div><small>{source ? `${localizeLabel(source.type)} · ${localizeDomainText(source.author)}` : localizeLabel(assertion.type)}</small><b>{localizeDomainText(assertion.statement)}</b></div><FileCheck2 size={15} /></article>; })}</div>
        <div className="mobile-flow-link danger"><span /><AlertOctagon size={18} /><span /></div>

        <div className="mobile-step-label"><span>02</span><p>{tr("Relay AI pauses instead of guessing", "Relay AI 不猜，先暫停")}</p></div>
        <article className="mobile-conflict-card">
          <div className="mobile-conflict-top"><span className={`severity-tag ${selectedConflict.severity}`}>{localizeLabel(selectedConflict.severity)}</span><span><CircleStop size={14} /> {tr("EXECUTION BLOCKED", "執行已阻擋")}</span></div>
          <h2>{localizeDomainText(selectedConflict.title)}</h2><p>{localizeDomainText(selectedConflict.summary)}</p>
          <div className="mobile-conflict-switch">{openConflicts.map((conflict, index) => <button className={conflict.id === selectedConflict.id ? "active" : ""} key={conflict.id} onClick={() => setSelectedConflictId(conflict.id)}>{String(index + 1).padStart(2, "0")}</button>)}</div>
        </article>
        <div className="mobile-agent-pause"><span>{tr("AI SOFTWARE ROLES · NOT PEOPLE", "AI 軟體工作角色 · 不是真人")}</span><p className="mobile-agent-explainer">{tr("Each role owns one plan task. None may continue until the human decision below is recorded.", "每個角色只負責計畫中的一項工作；下方的人類決策完成前，它們都不能繼續。")}</p>{agents.map((agent) => <div key={agent.id}><span><Bot size={15} /></span><p><b>{agent.name}</b><small>{agent.title}</small></p><em>{tr("WAITING", "等待")}</em></div>)}</div>
        <div className="mobile-flow-link"><span /><UserRound size={18} /><span /></div>

        <div className="mobile-step-label"><span>03</span><p>{tr("Ask the responsible person to choose", "請負責人選一個答案")}</p></div>
        <article className="mobile-decision-card"><span className="decision-avatar"><UserRound size={20}/></span><div><span>{tr("DECISION OWNER", "決策負責人")}</span><b>{localizeDomainText(selectedConflict.decisionOwner)}</b><small>{tr("Approval cannot be delegated to an agent", "核准不能交給 Agent 自行決定")}</small></div><span>{tr("Waiting", "等待中")}</span></article>
        <article className="mobile-safe-action"><span><Sparkles size={14} /> {tr("RELAY RECOMMENDS", "RELAY 建議")}</span><h2>{tr("Next safe action", "下一步安全行動")}</h2><p>{localizeDomainText(recommendedResolution?.description ?? selectedConflict.consequences)}</p>{readOnly ? <button className="button button-primary button-full" onClick={() => setView("new")}>{tr("Run this on my real launch", "分析我真正的 Launch")} <ArrowRight size={17} /></button> : <button className="button button-primary button-full" onClick={() => setView("conflicts")}><ShieldCheck size={17} /> {tr(`Resolve ${mission.blockingConflicts} conflicts`, `解決 ${mission.blockingConflicts} 項衝突`)}</button>}</article>
        {!readOnly && <form className="mobile-correction" onSubmit={submitCorrection}><label><UserRound size={14} /><input aria-label={tr("Verified correction author", "已驗證的修正者")} value={correctionAuthor} readOnly /></label><div><input aria-label={tr("Add a human correction", "加入人工修正")} value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder={tr("Add a correction…", "輸入新的限制或修正…")} /><button type="submit" disabled={correction.trim().length < 5 || busy === "correction"}>{busy === "correction" ? <span className="loader small" /> : <Send size={17} />}</button></div></form>}
      </div> : <div className="mobile-clear-contract"><BadgeCheck size={32} /><h2>{tr("No incompatible instruction remains.", "目前沒有互不相容的指令。")}</h2><p>{tr("Open the execution plan to review preflight checks and continue.", "開啟執行計畫，檢查執行前條件並繼續任務。")}</p><button className="button button-primary button-full" onClick={() => setView("plan")}>{tr("Open execution plan", "開啟執行計畫")} <ArrowRight size={17} /></button></div>}
    </section>
    <section className="flow-canvas" aria-label={tr("Mission execution canvas", "Mission 執行 Canvas")}>
      <div className="flow-stage-labels" aria-hidden="true"><span>{tr("Intent sources", "意圖來源")}<small>{tr("Evidence-backed inputs", "輸入與依據")}</small></span><span>{tr("Conflict / Decision", "衝突／決策")}<small>{tr("What blocks execution", "阻擋執行的關鍵")}</small></span><span>{tr("Human approval", "人工核准")}<small>{tr("Accountable judgment", "具權責的判斷")}</small></span><span>{tr("AI execution", "AI 執行")}<small>{tr("Governed agent work", "受治理的 Agent 任務")}</small></span><span>{tr("Outcome", "成果")}<small>{tr("Verifiable result", "可驗收成果")}</small></span></div>
      <Suspense fallback={<div className="flow-loading"><span className="loader" /><p>{tr("Opening execution canvas…", "正在開啟執行 Canvas…")}</p></div>}><ExecutionFlowCanvas nodes={flowNodes} edges={flowEdges} onConflictSelect={setSelectedConflictId} /></Suspense>
      <form className="flow-command" onSubmit={submitCorrection}><label className="flow-command-author"><UserRound size={14} /><input aria-label={tr("Verified correction author", "已驗證的修正者")} value={correctionAuthor} readOnly /></label><Zap size={17} /><input aria-label={tr("Add a human correction", "加入人工修正")} value={correction} disabled={readOnly} onChange={(event) => setCorrection(event.target.value)} placeholder={readOnly ? tr("Read-only example · create a mission to add corrections", "唯讀範例 · 建立自己的 Mission 後即可修正") : tr("Add an instruction or correction, for example: Set the budget to NT$20,000", "輸入指令或修正，例如：將預算統一為 NT$20,000")} /><kbd>⌘ ↵</kbd><button type="submit" disabled={readOnly || correction.trim().length < 5 || correctionAuthor.trim().length < 1 || busy === "correction"} aria-label={tr("Submit correction and replan", "送出修正並重新規劃")}>{busy === "correction" ? <span className="loader small" /> : <Send size={17} />}</button></form>
      {!inspectorOpen && <button className="flow-inspector-open" onClick={() => setInspectorOpen(true)} aria-label={tr("Open conflict inspector", "開啟衝突檢視")}><PanelRightOpen size={18} /><span>{mission.blockingConflicts}</span></button>}
    </section>
    {inspectorOpen && <aside className="flow-inspector"><div className="flow-inspector-head"><div><span>{selectedConflict ? tr("SELECTED CONFLICT", "已選取衝突") : tr("CONTRACT STATE", "合約狀態")}</span><h2>{selectedConflict ? tr(`${mission.blockingConflicts} blocking conflicts`, `${mission.blockingConflicts} 項阻擋衝突`) : tr("Execution can proceed", "執行可以繼續")}</h2></div><button className="icon-button" onClick={() => setInspectorOpen(false)} aria-label={tr("Close inspector", "關閉檢視")}><PanelRightClose size={18} /></button></div>
      <div className="compiler-receipt"><span>{tr("COMPILER RECEIPT", "編譯器憑據")}</span><div><b>{mission.sources.length}</b><small>{tr("sources", "個來源")}</small></div><div><b>{mission.assertions.length}</b><small>{tr("assertions", "項主張")}</small></div><div><b>{mission.conflicts.length}</b><small>{tr("conflicts", "項衝突")}</small></div><div><b>{mission.auditEvents.length}</b><small>{tr("audit events", "筆稽核事件")}</small></div><p><FileCheck2 size={13} /> {tr("MVP ruleset · every result links to stored source text", "MVP 規則集 · 每個結果都連回已保存的來源文字")}</p></div>
      <section className="flow-activity-feed"><div className="flow-activity-title"><span>{tr("AUDIT ACTIVITY", "稽核活動")}</span><small><span /> {tr("persisted lineage", "已保存的 Lineage")}</small></div>{mission.auditEvents.slice(-3).reverse().map((event) => <div className="flow-activity-event" key={event.id}><span className={`activity-actor ${event.actorType}`}>{event.actorType === "human" ? <UserRound size={13} /> : event.actorType === "agent" ? <Bot size={13} /> : <Blocks size={13} />}</span><div><b>{localizeDomainText(event.actorName)}</b><p>{localizeDomainText(event.summary)}</p></div><time>{formatDate(event.createdAt, true)}</time></div>)}{!mission.auditEvents.length && <p className="flow-activity-empty">{tr("The first human or agent event will appear here.", "第一筆人類或 Agent 活動會顯示在這裡。")}</p>}</section>
      {selectedConflict ? <>
        <div className="flow-conflict-switch">{openConflicts.map((conflict, index) => <button className={conflict.id === selectedConflict.id ? "active" : ""} key={conflict.id} onClick={() => setSelectedConflictId(conflict.id)} aria-label={`${tr("Conflict", "衝突")} ${index + 1}`}>{String(index + 1).padStart(2, "0")}</button>)}</div>
        <div className="flow-inspector-summary"><span className={`severity-tag ${selectedConflict.severity}`}>{localizeLabel(selectedConflict.severity)}</span><h3>{localizeDomainText(selectedConflict.title)}</h3><p>{localizeDomainText(selectedConflict.summary)}</p></div>
        <section className="flow-evidence"><span>{tr("SOURCE EVIDENCE", "來源依據")}</span>{sourceEvidence.map((assertion) => { const source = assertion.sourceId ? sourceById.get(assertion.sourceId) : undefined; return <button key={assertion.id} onClick={() => setSelectedConflictId(selectedConflict.id)}><FlowSourceIcon type={source?.type ?? assertion.type} /><div><b>{localizeDomainText(assertion.statement)}</b><small>{source ? `${localizeLabel(source.type)} · ${localizeDomainText(source.author)}` : localizeLabel(assertion.type)}</small></div><ArrowRight size={14} /></button>; })}</section>
        <section className="flow-impact"><span>{tr("IF UNRESOLVED", "若未解決")}</span><p>{localizeDomainText(selectedConflict.consequences)}</p></section>
        <section className="flow-owner"><span>{tr("DECISION OWNER", "決策負責人")}</span><div><span className="decision-avatar"><UserRound size={18}/></span><div><b>{localizeDomainText(selectedConflict.decisionOwner)}</b><small>{tr("Named authority · agents cannot self-approve", "具名決策權 · Agent 不可自行核准")}</small></div><span>{tr("Waiting", "等待中")}</span></div></section>
        <div className="flow-safe-action"><span>{tr("NEXT SAFE ACTION", "下一步安全行動")}</span><p>{readOnly ? tr("Use this same flow on a real launch brief from your team.", "把同一套流程用在你團隊真正的 Launch Brief。") : tr("Resolve the contradiction before agents continue downstream execution.", "先解決矛盾，AI Agent 才能繼續後續執行。")}</p><button className="button button-primary button-full" onClick={() => setView(readOnly ? "new" : "conflicts")}><ShieldCheck size={17} /> {readOnly ? tr("Analyze my own launch", "分析我自己的 Launch") : tr(`Resolve ${mission.blockingConflicts} conflicts`, `解決 ${mission.blockingConflicts} 項衝突`)} <ArrowRight size={17} /></button></div>
      </> : <div className="flow-clear-state"><BadgeCheck size={32} /><h3>{tr("The active plan is internally consistent.", "目前有效計畫沒有內部衝突。")}</h3><p>{tr("Open the plan to review preflight checks and safely continue execution.", "開啟計畫檢查執行前條件，並安全繼續任務。")}</p><button className="button button-primary button-full" onClick={() => setView("plan")}><Maximize2 size={17} />{tr("Open execution plan", "開啟執行計畫")}</button></div>}
    </aside>}
  </div>;
}

function ConflictSourceProof({ mission, conflict }: { mission: MissionDetail; conflict: Conflict }) {
  const evidence = conflict.sourceAssertionIds.map((id) => mission.assertions.find((assertion) => assertion.id === id)).filter((assertion): assertion is MissionDetail["assertions"][number] => Boolean(assertion)).slice(0, 3);
  if (!evidence.length) return null;
  return <div className="conflict-source-proof"><span>{tr("SOURCE PROOF", "來源證據")}</span><div>{evidence.map((assertion) => { const source = mission.sources.find((item) => item.id === assertion.sourceId); const quote = typeof assertion.metadata.evidenceQuote === "string" ? assertion.metadata.evidenceQuote : assertion.statement; return <article key={assertion.id}><FlowSourceIcon type={source?.type ?? "Mission"} /><p><q>{localizeDomainText(quote)}</q><small>{source ? `${localizeLabel(source.type)} · ${localizeDomainText(source.author)}` : tr("Mission intake", "Mission 建立資料")} · {Math.round(assertion.confidence * 100)}%</small></p></article>; })}</div></div>;
}

function ConflictInbox({ mission, action, busy }: { mission: MissionDetail; action: MissionAction; busy: string }) {
  const [selected, setSelected] = useState<Record<string, string>>({}); const [reasons, setReasons] = useState<Record<string, string>>({});
  const open = mission.conflicts.filter((conflict) => conflict.status === "open"); const resolved = mission.conflicts.filter((conflict) => conflict.status === "resolved");
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">{tr("CONFLICT COMPILER", "衝突編譯器")}</span><h2>{open.length ? tr(`${open.length} contradictions need a decision`, `${open.length} 項矛盾需要決策`) : tr("Organizational intent is resolved", "組織意圖衝突已解決")}</h2><p>{tr("Blocking conflicts stop only the affected execution path. Every resolution becomes part of the next contract.", "阻擋性衝突只會停止受影響的執行路徑；每項解法都會成為下一版合約的一部分。")}</p></div><div className="conflict-summary"><span><AlertOctagon />{mission.blockingConflicts} {tr("blocking", "項阻擋")}</span><span><Scale />{open.length} {tr("open", "項待處理")}</span><span><Check />{resolved.length} {tr("resolved", "項已解決")}</span></div></div>
    {open.map((conflict, index) => <article className={`conflict-card ${conflict.blocking ? "blocking" : ""}`} key={conflict.id}><div className="conflict-number">C-{String(index + 1).padStart(2, "0")}</div><div className="conflict-card-main"><div className="conflict-head"><div><div className="conflict-tags"><span className={`severity-tag ${conflict.severity}`}>{localizeLabel(conflict.severity)}</span><span>{localizeLabel(conflict.type)}</span>{conflict.blocking && <span className="blocking-tag"><CircleStop size={13} /> {tr("Blocks execution", "阻擋執行")}</span>}</div><h3>{localizeDomainText(conflict.title)}</h3><p>{localizeDomainText(conflict.summary)}</p></div><div className="decision-owner"><span>{tr("DECISION OWNER", "決策負責人")}</span><b><UserRound size={15} />{localizeDomainText(conflict.decisionOwner)}</b>{conflict.decisionDueAt && <small>{tr("Due", "期限")} {conflict.decisionDueAt}</small>}</div></div><ConflictSourceProof mission={mission} conflict={conflict} /><div className="consequence"><Ban size={17} /><div><span>{tr("IF UNRESOLVED", "若未解決")}</span><p>{localizeDomainText(conflict.consequences)}</p></div></div><div className="resolution-options">{conflict.options.map((option) => <label className={`resolution-option ${selected[conflict.id] === option.id ? "selected" : ""} ${option.recommended ? "recommended" : ""}`} key={option.id}><input type="radio" name={conflict.id} value={option.id} checked={selected[conflict.id] === option.id} onChange={() => setSelected({ ...selected, [conflict.id]: option.id })} /><div className="option-top"><b>{localizeDomainText(option.label)}</b>{option.recommended && <span><Sparkles size={13} /> {tr("Relay recommends", "Relay 建議")}</span>}</div><p>{localizeDomainText(option.description)}</p><div className="option-impact"><span><Clock3 />{localizeDomainText(option.timeImpact)}</span><span><CircleDollarSign />{localizeDomainText(option.budgetImpact)}</span><span><ShieldCheck />{localizeDomainText(option.risk)}</span></div></label>)}</div>{selected[conflict.id] && <div className="resolution-submit"><textarea placeholder={tr("Why is this the right decision? This becomes permanent evidence.", "為什麼這是正確決策？這段理由會成為永久證據。")} value={reasons[conflict.id] ?? ""} onChange={(event) => setReasons({ ...reasons, [conflict.id]: event.target.value })} rows={2} /><button className="button button-primary" disabled={(reasons[conflict.id]?.length ?? 0) < 3 || busy === conflict.id} onClick={() => action(conflict.id, api<{ mission: MissionDetail }>(`/api/conflicts/${conflict.id}/resolve`, { method: "POST", body: JSON.stringify({ optionId: selected[conflict.id], reason: reasons[conflict.id] }) }), tr("Decision recorded. Resolve remaining blockers, then compile the next plan version.", "決策已記錄。請解決其餘阻擋項目，再編譯下一版計畫。"))}><Check size={16} /> {tr("Record decision", "記錄決策")}</button></div>}</div></article>)}
    {!open.length && <div className="resolved-celebration"><BadgeCheck /><div><h3>{tr("All conflicts have an explicit decision.", "所有衝突都已有明確決策。")}</h3><p>{tr("Compile the next plan version to convert those decisions into task constraints, invalidate stale approvals and activate execution.", "編譯下一版計畫，把這些決策轉為任務限制、使過期核准失效並啟用執行。")}</p></div>{mission.status === "planning" && <button className="button button-primary" disabled={busy === "plan"} onClick={() => action("plan", api<{ mission: MissionDetail }>(`/api/missions/${mission.id}/plan`, { method: "POST", body: "{}" }), tr("Plan activated.", "計畫已啟用。"))}><GitBranch size={17} /> {tr("Compile Plan", "編譯計畫")} v{mission.currentPlanVersion + 1}</button>}</div>}
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
    <section className="task-graph"><div className="task-graph-head"><span>{tr("TASK GRAPH", "任務圖")}</span><div><span><Bot size={14} /> {tr("Agent owner", "Agent 負責")}</span><span><UserRound size={14} /> {tr("Human owner", "人員負責")}</span></div></div>{plan.tasks.map((task) => <article className={`task-card ${openTask === task.id ? "open" : ""}`} key={task.id}><button className="task-summary" onClick={() => setOpenTask(openTask === task.id ? "" : task.id)}><span className={`task-state large ${task.status}`}>{task.status === "completed" ? <Check size={17} /> : task.status === "blocked" ? <CircleStop size={17} /> : task.status === "running" ? <Activity size={17} /> : <span />}</span><div className="task-key"><b>{task.key}</b><small>{task.dependencies.length ? tr(`after ${task.dependencies.join(", ")}`, `接續於 ${task.dependencies.join("、")}`) : tr("root task", "起始任務")}</small></div><div className="task-title"><b>{localizeDomainText(task.title)}</b><small>{localizeDomainText(task.goal)}</small></div><span className="task-owner">{task.ownerType === "agent" ? <Bot size={15} /> : <UserRound size={15} />}{localizeDomainText(task.ownerName)}</span><RiskBadge level={task.riskLevel} /><StatusPill value={task.status} /><ChevronDown size={18} /></button>{openTask === task.id && <div className="task-details"><div className="task-detail-grid"><TaskDetail label={tr("Definition of done", "完成定義")} value={task.definitionOfDone} icon={BadgeCheck} /><TaskDetail label={tr("Approval policy", "核准政策")} value={task.approvalPolicy} icon={ShieldCheck} /><TaskDetail label={tr("Stop condition", "停止條件")} value={task.stopCondition} icon={CircleStop} /><TaskDetail label={tr("Rollback", "回滾策略")} value={task.rollbackStrategy} icon={TimerReset} /></div><div className="task-lists"><div><span>{tr("REQUIRED CAPABILITIES", "必要能力")}</span>{task.requiredCapabilities.length ? task.requiredCapabilities.map((item) => <p key={item}><KeyRound />{localizeDomainText(item)}</p>) : <p><Check />{tr("No external capability", "不需要外部能力")}</p>}</div><div><span>{tr("FORBIDDEN ACTIONS", "禁止操作")}</span>{task.forbiddenActions.map((item) => <p key={item}><Ban />{localizeDomainText(item)}</p>)}</div><div><span>{tr("REQUIRED EVIDENCE", "必要證據")}</span>{task.requiredEvidence.map((item) => <p key={item}><FileCheck2 />{localizeDomainText(item)}</p>)}</div></div>{task.preflight && <PreflightPanel result={task.preflight} />}{mission.executionReceipts.filter((receipt) => receipt.taskId === task.id).slice(0, 1).map((receipt) => <div className={`execution-receipt ${receipt.status}`} key={receipt.id}><Fingerprint size={17} /><div><span>{tr("EXECUTION RECEIPT", "執行憑據")} · {localizeLabel(receipt.status)}</span><b>{localizeDomainText(receipt.summary)}</b><code>{receipt.artifactHash ?? receipt.idempotencyKey}</code></div></div>)}{plan.version === mission.currentPlanVersion && task.ownerType === "agent" && !["completed", "failed"].includes(task.status) && task.key !== "T-06" && <div className="task-run"><div><b>{tr("Queue a durable Agent run", "加入 Durable Agent Queue")}</b><p>{tr("The run keeps checkpoints and can be paused, resumed or cancelled from the live room. Missing permissions stop before any side effect.", "執行會保存 Checkpoint，並可在即時 Room 暫停、繼續或取消；缺少權限時會在產生副作用前停止。")}</p></div><button className="button button-dark" disabled={busy === task.id} onClick={() => action(task.id, api(`/api/tasks/${task.id}/agent-runs`, { method: "POST", body: "{}" }).then(() => api<{ mission: MissionDetail }>(`/api/missions/${mission.id}`)), tr("Agent run queued. Open Now to watch checkpoints and control it.", "Agent Run 已進入佇列；到「現在」頁查看 Checkpoint 並控制執行。"))}><Play size={16} /> {tr("Queue Agent run", "啟動 Agent Run")}</button></div>}</div>}</article>)}</section>
  </div>;
}

function TaskDetail({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Check }) { return <div className="task-detail"><Icon size={17} /><div><span>{label}</span><p>{localizeDomainText(value)}</p></div></div>; }
function PreflightPanel({ result }: { result: NonNullable<ExecutionTask["preflight"]> }) { return <div className={`preflight-panel ${result.canRun ? "pass" : "fail"}`}><div className="preflight-head">{result.canRun ? <BadgeCheck /> : <CircleStop />}<div><span>{tr("PREFLIGHT", "執行前檢查")} {result.canRun ? tr("PASSED", "通過") : tr("BLOCKED", "已阻擋")}</span><b>{result.canRun ? tr("All execution conditions are valid", "所有執行條件皆有效") : tr("Relay stopped this task safely", "Relay 已安全停止此任務")}</b></div><small>{formatDate(result.checkedAt, true)}</small></div><div className="check-list">{result.checks.map((check) => <div className={check.passed ? "passed" : "failed"} key={check.name}>{check.passed ? <Check /> : <X />}<div><b>{localizeDomainText(check.name)}</b><p>{localizeDomainText(check.detail)}</p>{check.nextAction && <small>{tr("Next", "下一步")}：{localizeDomainText(check.nextAction)}</small>}</div></div>)}</div></div>; }

function GmailDraftAction({ mission, connectionId, onComplete }: { mission: MissionDetail; connectionId: string; onComplete: () => Promise<void> }) {
  const task = mission.currentPlan?.tasks.find((item) => item.key === "T-03" && item.requiredCapabilities.includes("Gmail: create draft"));
  const [form, setForm] = useState({ to: "", subject: `[Draft] ${mission.title}`, body: `${mission.objective}\n\nSuccess: ${mission.successMetric}` });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [receipt, setReceipt] = useState<{ id: string; resultHash: string; providerId?: string }>();
  if (!task) return null;
  const blocked = mission.blockingConflicts > 0 || task.status === "blocked" || mission.currentPlan?.status !== "active";
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const queued = await api<{ run: AgentRun }>(`/api/tasks/${task.id}/agent-runs`, { method: "POST", body: "{}" });
      const response = await api<{ toolCall: { id: string; resultHash: string; summary: { providerId?: string } } }>(`/api/missions/${mission.id}/agent-runs/${queued.run.id}/tool-calls`, { method: "POST", body: JSON.stringify({ connectionId, operation: "gmail.create_draft", resourceId: `mission:${mission.id}:drafts`, payload: form }) });
      setReceipt({ id: response.toolCall.id, resultHash: response.toolCall.resultHash, providerId: response.toolCall.summary.providerId });
      await onComplete();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return <form className="live-provider-action" onSubmit={submit}><div className="live-provider-action-head"><span><Zap size={15}/>{tr("REAL PROVIDER ACTION · DRAFT ONLY", "真實服務操作 · 只建立草稿")}</span><b>{tr("Let the Planning Agent create a real Gmail draft", "讓 Planning Agent 建立一封真實 Gmail 草稿")}</b><p>{tr("Relay sends this only to Gmail Drafts through the encrypted Tool Gateway. It cannot send the email.", "Relay 只會透過加密 Tool Gateway 寫入 Gmail 草稿匣，無法寄出信件。")}</p></div><div className="form-grid"><label>{tr("Draft recipient", "草稿收件人")}<input type="email" required value={form.to} onChange={(event) => setForm({...form, to: event.target.value})} placeholder="client@company.com"/></label><label>{tr("Subject", "主旨")}<input required value={form.subject} onChange={(event) => setForm({...form, subject: event.target.value})}/></label></div><label>{tr("Draft body", "草稿內容")}<textarea rows={4} required value={form.body} onChange={(event) => setForm({...form, body: event.target.value})}/></label>{blocked && <p className="provider-action-blocked"><CircleStop size={14}/>{tr("Resolve blocking decisions and activate the next Plan before Gmail can be touched.", "先解決阻擋決策並啟用下一版 Plan，Relay 才能碰 Gmail。")}</p>}{error && <p className="form-error">{error}</p>}{receipt ? <div className="provider-action-receipt"><BadgeCheck size={17}/><div><b>{tr("Gmail returned a real draft receipt", "Gmail 已回傳真實草稿憑據")}</b><code>{receipt.providerId || receipt.id} · {receipt.resultHash}</code></div></div> : <button className="button button-dark" disabled={busy || blocked}>{busy ? <><span className="loader small"/>{tr("Calling Gmail through Relay…", "正在透過 Relay 呼叫 Gmail…")}</> : <><Mail size={15}/>{tr("Create real Gmail draft", "建立真實 Gmail 草稿")}</>}</button>}</form>;
}

function AccessView({ mission, onRefresh }: { mission: MissionDetail; onRefresh: () => Promise<void> }) {
  const plan = mission.currentPlan;
  const [ceremony, setCeremony] = useState(false);
  const [connectors, setConnectors] = useState<ConnectorDescriptor[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const response = await api<{ connectors: ConnectorDescriptor[] }>("/api/connectors"); setConnectors(response.connectors); }
    catch (err) { setError((err as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const providerKey = (name: string) => ["Gmail","Google Drive","Google Calendar"].includes(name) ? "google" : name.toLowerCase().replaceAll(" ", "");
  const connect = async (key: string) => {
    setBusy(key); setError("");
    try {
      const response = await api<{ authorizeUrl: string }>(`/api/connectors/${key}/oauth/start`, { method: "POST", body: JSON.stringify({ missionId: mission.id, redirectAfter: `${window.location.pathname}?view=access` }) });
      window.location.assign(response.authorizeUrl);
    } catch (err) { setError((err as Error).message); setBusy(""); }
  };
  const verify = async (connectionId: string) => {
    setBusy(connectionId); setError("");
    try { await api(`/api/connectors/${connectionId}/verify`, { method: "POST", body: JSON.stringify({ missionId: mission.id }) }); await Promise.all([load(), onRefresh()]); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(""); }
  };
  if (!plan) return null;
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">{tr("ONE MISSION · ONE ACCESS BLUEPRINT", "一個 MISSION · 一份存取藍圖")}</span><h2>{tr("Connect only what this plan needs.", "只連接這份計畫真正需要的資料。")}</h2><p>{tr("Relay derived these capabilities from task requirements. No provider is called “connected” until a real resource-level verification passes.", "Relay 依任務需求推導必要能力；在真實資源層級驗證通過前，任何服務都不會被標示為「已連線」。")}</p></div><button className="button button-primary" onClick={() => setCeremony(true)}><Link2 size={17} /> {tr("Connect this mission", "連接此 Mission")}</button></div>
    <div className="access-summary"><div><Network /><span>{plan.accessBlueprint.length}</span><small>{tr("providers required", "個必要服務")}</small></div><div><KeyRound /><span>{plan.accessBlueprint.reduce((sum, item) => sum + item.capabilities.length, 0)}</span><small>{tr("scoped capabilities", "項範圍化能力")}</small></div><div><BadgeCheck /><span>{plan.accessBlueprint.filter((item) => item.status === "verified").length}</span><small>{tr("verified grants", "項已驗證授權")}</small></div><div><Clock3 /><span>v{plan.version}</span><small>{tr("manifest version", "Manifest 版本")}</small></div></div>
    <div className="access-grid">{plan.accessBlueprint.map((access) => { const descriptor = connectors.find((item) => item.provider === providerKey(access.provider)); const connection = descriptor?.connections.find((item) => item.status === "verified") ?? descriptor?.connections[0]; return <article className="access-card" key={access.id}><div className="access-head"><span className={`provider-icon ${sourceColors[access.provider] ?? "lime"}`}>{access.provider.slice(0, 2).toUpperCase()}</span><div><h3>{access.provider}</h3><StatusPill value={connection?.status ?? access.status} /></div><span className={`access-level level-${access.accessLevel}`}>{localizeLabel(access.accessLevel)}</span></div><div className="access-why"><span>{tr("WHY NEEDED", "需要原因")}</span><p>{localizeDomainText(access.whyNeeded)}</p></div><div className="capability-list">{access.capabilities.map((item) => <p key={item}><Check />{localizeDomainText(item)}</p>)}</div><div className="scope-box"><LockKeyhole size={16} /><div><span>{tr("RESOURCE SCOPE", "資源範圍")}</span><p>{localizeDomainText(access.resourceScope)}</p></div></div>{!descriptor ? <p className="connector-unavailable"><Ban size={14}/>{tr("No production adapter exists for this provider yet.", "此服務目前尚無正式 Adapter。")}</p> : !descriptor.configured ? <p className="connector-unavailable"><AlertOctagon size={14}/>{tr("OAuth app secrets are not configured on this deployment.", "此部署環境尚未設定 OAuth App Secret。")}</p> : !connection ? <button className="button button-dark button-full" disabled={busy === descriptor.provider} onClick={() => { void connect(descriptor.provider); }}><Link2 size={15}/>{busy === descriptor.provider ? tr("Opening provider…", "正在開啟服務…") : tr(`Connect ${descriptor.label}`, `連接 ${descriptor.label}`)}</button> : connection.status !== "verified" ? <button className="button button-primary button-full" disabled={busy === connection.id} onClick={() => { void verify(connection.id); }}><BadgeCheck size={15}/>{busy === connection.id ? tr("Verifying live access…", "正在驗證真實權限…") : tr("Verify identity and resources", "驗證身分與資源")}</button> : <div className="connector-verified"><BadgeCheck size={16}/><p><b>{connection.accountLabel}</b><small>{tr("Identity checked · Manifest bound to this plan", "身分已檢查 · Manifest 已綁定此 Plan")}</small></p></div>}<div className="access-footer"><span>{tr("Tasks", "任務")}：{access.taskKeys.join(", ")}</span><span>{access.expiration ? `${tr("Expires", "到期於")} ${formatDate(access.expiration)}` : tr("No grant issued", "尚未核發授權")}</span></div>{access.provider === "Gmail" && connection?.status === "verified" && <GmailDraftAction mission={mission} connectionId={connection.id} onComplete={onRefresh}/>}</article>; })}</div>
    {error && <section className="truth-banner error"><AlertOctagon/><div><b>{tr("Connection did not pass", "連線尚未通過")}</b><p>{error}</p></div></section>}
    <section className="truth-banner"><ShieldCheck /><div><b>{tr("Truthful connector state", "真實連接器狀態")}</b><p>{tr("OAuth tokens are encrypted in Relay's vault and never enter model context. Connected means authorization returned; Verified means Relay called the provider, checked the account, and issued a plan-bound Access Manifest.", "OAuth Token 會加密保存在 Relay Vault，永遠不進模型 Context。Connected 只代表完成授權；Verified 代表 Relay 已實際呼叫服務、確認帳號，並核發綁定此 Plan 的 Access Manifest。")}</p></div></section>
    {ceremony && <div className="modal-scrim" onClick={() => setCeremony(false)}><div className="modal connector-ceremony" onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" onClick={() => setCeremony(false)} aria-label={tr("Close", "關閉")}><X /></button><div className="modal-icon"><KeyRound /></div><span className="page-kicker">{tr("CONNECTION CEREMONY", "連線引導流程")}</span><h2>{tr("One queue. Each provider still asks for its own consent.", "一個引導流程；每項服務仍各自取得同意。")}</h2><p>{tr(`Relay derived the minimum queue for Plan v${plan.version}. Authorize one service, return here, verify the account and resource, then continue to the next.`, `Relay 已為 Plan v${plan.version} 推導最小權限佇列。每次授權一項服務、回到這裡驗證帳號與資源，再繼續下一項。`)}</p><div className="ceremony-list">{[...new Map(plan.accessBlueprint.map((item) => [providerKey(item.provider), item])).values()].map((item, index) => { const descriptor = connectors.find((entry) => entry.provider === providerKey(item.provider)); const connection = descriptor?.connections[0]; return <div key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><p><b>{descriptor?.label ?? item.provider}</b><small>{localizeLabel(item.accessLevel)} · {connection ? localizeLabel(connection.status) : descriptor?.configured ? tr("ready to connect", "可開始連線") : tr("not configured", "尚未設定")}</small></p>{descriptor?.configured && !connection && <button onClick={() => { void connect(descriptor.provider); }}>{tr("Connect", "連接")}</button>}{connection?.status === "connected" && <button onClick={() => { void verify(connection.id); }}>{tr("Verify", "驗證")}</button>}{connection?.status === "verified" && <BadgeCheck size={18}/>}</div>; })}</div><button className="button button-dark button-full" onClick={() => setCeremony(false)}>{tr("Return to mission", "返回 Mission")}</button></div></div>}
  </div>;
}

function ApprovalCenter({ mission, action, busy, isStale }: { mission: MissionDetail; action: MissionAction; busy: string; isStale: boolean }) {
  const plan = mission.currentPlan; if (!plan) return null;
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">{tr("EXACT APPROVAL CENTER", "精確核准中心")}</span><h2>{tr("Approve the action—not the idea.", "核准的是精確操作，不是模糊概念。")}</h2><p>{tr("Every decision is locked to one plan version, exact payload, audience, budget, stop condition and expiration.", "每項決策都綁定一個計畫版本、精確內容、受眾、預算、停止條件與到期時間。")}</p></div><div className="approval-stats"><span>{plan.approvals.filter((item) => item.status === "pending").length} {tr("pending", "項等待中")}</span><span>{plan.approvals.filter((item) => item.status === "approved").length} {tr("approved", "項已核准")}</span></div></div>
    {plan.approvals.map((approval) => <article className={`approval-card ${approval.status}`} key={approval.id}><div className="approval-top"><div className="approval-icon"><ShieldCheck /></div><div><div className="approval-label"><span>{tr("RISK LEVEL 3 · EXTERNAL ACTION", "風險等級 3 · 對外操作")}</span><StatusPill value={approval.status} /></div><h3>{localizeDomainText(approval.action)}</h3><p>{tr("Requested by", "申請人")} {localizeDomainText(approval.requester)} · {tr("Plan", "計畫")} v{plan.version}</p></div><div className="approval-expiry"><Clock3 /><span>{tr("EXPIRES", "到期時間")}</span><b>{formatDate(approval.expiresAt, true)}</b></div></div><div className="payload-grid">{Object.entries(approval.exactPayload).map(([key, value]) => <div key={key}><span>{localizePayloadKey(key)}</span><b>{typeof value === "number" && key.toLowerCase().includes("budget") ? formatMoney(value) : localizeDomainText(String(value))}</b></div>)}</div><div className="payload-hash"><Fingerprint /><div><span>{tr("PAYLOAD HASH", "內容雜湊")}</span><code>{approval.payloadHash}</code></div><LockKeyhole size={16} /></div><div className="approval-guard"><CircleStop /><div><b>{tr("Automatic stop condition", "自動停止條件")}</b><p>{localizeDomainText(approval.stopCondition)}</p></div></div>{approval.reason && <div className="decision-reason"><b>{tr("Decision evidence", "決策證據")}</b><p>{localizeDomainText(approval.reason)}</p><small>{localizeDomainText(approval.approver)} · {formatDate(approval.decidedAt, true)}</small></div>}{approval.status === "pending" && <div className="approval-actions"><div>{isStale || mission.blockingConflicts ? <p className="danger-text"><Ban size={15} /> {tr("Approval disabled", "核准已停用")}：{isStale ? tr("plan is superseded", "計畫已被新版取代") : tr("blocking conflicts remain", "仍有阻擋性衝突")}。</p> : <p><BadgeCheck size={15} /> {tr("This payload matches the active contract.", "這份內容與目前有效合約一致。")}</p>}</div><button className="button button-ghost" disabled={busy === approval.id || isStale} onClick={() => action(approval.id, api(`/api/approvals/${approval.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "rejected", reason: tr("Rejected after exact payload review.", "完成精確內容審查後拒絕。") }) }), tr("Approval rejected and evidence recorded.", "核准已拒絕，證據已記錄。"))}><X size={16} /> {tr("Reject", "拒絕")}</button><button className="button button-primary" disabled={busy === approval.id || isStale || mission.blockingConflicts > 0} onClick={() => action(approval.id, api(`/api/approvals/${approval.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "approved", reason: tr("Exact payload, audience, budget and stop condition reviewed and approved.", "精確內容、受眾、預算與停止條件皆已審查並核准。") }) }), tr("Exact approval recorded for this plan version and payload hash.", "此計畫版本與內容雜湊的精確核准已記錄。"))}><ShieldCheck size={16} /> {tr("Approve exact payload", "核准精確內容")}</button></div>}</article>)}
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
  return <div className="landing demo-live-page"><PublicHeader/><main>
    <section className="demo-live-hero"><div><span className="eyebrow"><span className="pulse-dot"/>{tr("NOT A VIDEO · YOU TRIGGER THE RUN", "不是影片 · 由你親手觸發")}</span><h1>{tr("Paste a messy launch. Watch Relay stop the wrong Agent path.", "貼上一份混亂 Launch，親眼看 Relay 停住錯誤的 Agent 路徑。")}</h1><p>{tr("Nothing below starts by itself. Load the example or paste your own instructions, press Run, inspect the exact source collision, then save it into a realtime Mission Room.", "下方不會自動播放。你可以載入範例或貼自己的指令，按下 Run、查看互相衝突的原句，再把結果保存成即時 Mission Room。")}</p><div className="demo-live-steps"><span><b>1</b>{tr("Paste", "貼上")}</span><ArrowRight size={15}/><span><b>2</b>{tr("Run", "執行")}</span><ArrowRight size={15}/><span><b>3</b>{tr("Invite + execute", "邀人 + 執行")}</span></div></div><RuntimePromiseCard/></section>
    <section className="section live-proof-section demo-compiler"><div className="live-proof-copy"><span className="section-index">01 / {tr("YOUR TURN", "換你操作")}</span><h2>{tr("The magic moment only counts when your input causes it.", "只有你的輸入真的觸發結果，才算 Magic Moment。")}</h2><p>{tr("The compiler response below comes from the live API. Saving it creates real persisted events, named team invites and durable Agent runs.", "下方結果來自真實 API；保存後會建立可持久化事件、具名團隊邀請與 Durable Agent Run。")}</p></div><LandingMagicCompiler onOpenFullMission={(brief) => { sessionStorage.setItem("relay_mission_draft", brief); navigate("/missions/new?draft=1"); }}/></section>
  </main></div>;
}

function JoinMissionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = decodeURIComponent(location.pathname.split("/").pop() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const accept = async () => {
    setBusy(true); setError("");
    try { const response = await api<{ missionId: string }>(`/api/invites/${token}/accept`, { method: "POST", body: "{}" }); navigate(`/missions/${response.missionId}?view=room`); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  };
  return <main className="join-page"><Logo/><section><span><Fingerprint size={18}/>{tr("INDIVIDUAL MISSION INVITE", "個人 MISSION 邀請")}</span><h1>{tr("Join with your own identity—not as “Shared collaborator.”", "用你自己的身分加入，不再叫做「Shared collaborator」。")}</h1><p>{tr("Accepting creates your named role inside one Mission. It does not grant access to other workspaces or missions.", "接受後只會在這一個 Mission 建立你的具名角色，不會開放其他 Workspace 或 Mission。")}</p>{error && <p className="form-error">{error}</p>}<button className="button button-primary button-large button-full" disabled={busy} onClick={() => { void accept(); }}>{busy ? <><span className="loader small"/>{tr("Verifying invite…", "正在驗證邀請…")}</> : <><UsersRound size={17}/>{tr("Accept and enter live room", "接受並進入即時 Room")}</>}</button><small><ShieldCheck size={13}/>{tr("Single-use · expires automatically · fully auditable", "一次性 · 自動到期 · 完整可稽核")}</small></section></main>;
}

function PublicReportPage() {
  const location = useLocation();
  const slug = decodeURIComponent(location.pathname.split("/").pop() ?? "");
  const [report, setReport] = useState<PublicMissionReport>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ report: PublicMissionReport }>(`/api/public/reports/${slug}`)
      .then((response) => { if (active) setReport(response.report); })
      .catch((err) => { if (active) setError((err as Error).message); });
    return () => { active = false; };
  }, [slug]);
  if (error) return <main className="public-report-page"><Logo /><ErrorBlock error={error} /><Link to="/missions/new?sample=1" className="button button-primary">{tr("Analyze my launch", "分析我的 Launch")}</Link></main>;
  if (!report) return <main className="public-report-page"><Logo /><LoadingBlock label={tr("Verifying public execution proof…", "正在驗證公開執行證明…")} /></main>;
  return <main className="public-report-page">
    <header><Logo /><span><ShieldCheck size={15} /> {tr("SANITIZED PUBLIC PROOF", "去識別化公開證明")}</span></header>
    <section className="public-report-hero"><span className="page-kicker">RELAY / PLAN v{report.planVersion}</span><h1>{tr(`Relay stopped ${report.riskyActionsStopped} risky AI actions before launch.`, `Relay 在 Launch 前阻擋了 ${report.riskyActionsStopped} 個高風險 AI 行動。`)}</h1><p>{localizeDomainText(report.missionTitle)}</p><div className="public-report-stats"><div><b>{report.sourcesAnalyzed}</b><span>{tr("sources compared", "個來源已比對")}</span></div><div><b>{report.assertionsCompiled}</b><span>{tr("claims compiled", "條主張已編譯")}</span></div><div><b>{report.conflictsFound}</b><span>{tr("conflicts found", "項衝突已找出")}</span></div><div><b>{report.evidenceCoverage}%</b><span>{tr("evidence linked", "證據已連結")}</span></div></div></section>
    <section className="public-report-conflicts"><div><span className="page-kicker">{tr("WHAT WOULD HAVE GONE WRONG", "原本可能做錯什麼")}</span><h2>{tr("The instructions could not safely run together.", "這些指令無法安全地同時執行。")}</h2></div>{report.primaryConflicts.map((conflict, index) => <article key={`${conflict.title}-${index}`}><span>{String(index + 1).padStart(2, "0")} · {localizeLabel(conflict.severity)}</span><h3>{localizeDomainText(conflict.title)}</h3><p><UserRound size={15} /> {tr("Decision owner", "決策負責人")}：{localizeDomainText(conflict.decisionOwner)}</p><div><ShieldCheck size={16} /><b>{localizeDomainText(conflict.nextSafeAction)}</b></div></article>)}</section>
    {report.executionProof && <section className="public-report-proof"><Fingerprint size={24} /><div><span>{tr("IMMUTABLE EXECUTION PROOF", "不可變執行證明")}</span><h2>{tr("A real artifact was produced.", "確實產生了一份 Artifact。")}</h2><p>{report.executionProof.executor} · {report.executionProof.taskKey}</p><code>{report.executionProof.artifactHash}</code></div></section>}
    <section className="public-report-privacy"><LockKeyhole size={18} /><p><b>{tr("What is intentionally missing", "刻意不公開的內容")}</b>{tr("Raw messages, document text, people and confidential evidence were excluded. This card proves the control outcome without leaking the mission.", "原始訊息、文件內容、人員與機密證據都已排除；這張卡只證明控制結果，不洩漏 Mission。")}</p></section>
    <section className="public-report-cta"><h2>{tr("What would your AI do with conflicting instructions?", "你的 AI 收到互相衝突的指令時，會做什麼？")}</h2><Link to="/missions/new" className="button button-primary button-large">{tr("Test my launch brief", "測試我的 Launch Brief")} <ArrowRight size={18} /></Link><small>{tr(`This proof expires ${formatDate(report.expiresAt, true)}.`, `此證明將於 ${formatDate(report.expiresAt, true)} 到期。`)}</small></section>
  </main>;
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
  if (/^\/join\/[^/]+$/.test(location.pathname)) return <JoinMissionPage />;
  if (/^\/reports\/[^/]+$/.test(location.pathname)) return <PublicReportPage />;
  if (/^\/missions\/[^/]+$/.test(location.pathname)) return <MissionPage />;
  return <NotFound />;
}
