import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from "./router";
import type { Edge, MarkerType } from "@xyflow/react";
import type { MissionFlowNode } from "./ExecutionFlowCanvas";
import type { LucyMissionDraft } from "./LucyMissionCanvas";
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
  AccessRequirement, AgentRun, ApprovalRequest, CollaborationSnapshot, CompilerReceipt, Conflict, ConnectorDescriptor, CreateMissionInput, ExecutionTask, InviteDelivery, MissionDetail, MissionInvitePreview, MissionMember, MissionSummary, Outcome, PlanVersion, PublicMissionReport, SourceInput,
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

const connectorCatalogCopy: Record<string, {
  monogram: string;
  category: readonly [string, string];
  description: readonly [string, string];
  defaultCapabilities: string[];
}> = {
  google: { monogram: "G", category: ["EMAIL · FILES · CALENDAR", "EMAIL · 檔案 · 行事曆"], description: ["Let Agents read selected Gmail threads, Drive files and calendar events—or prepare drafts when the Mission allows it.", "讓 Agents 讀取指定 Gmail 對話、Drive 檔案與行事曆；Mission 允許時也能準備草稿。"], defaultCapabilities: ["Gmail: read selected threads"] },
  slack: { monogram: "S", category: ["TEAM COMMUNICATION", "團隊溝通"], description: ["Bring selected channel context into the Mission and let approved Agents post internal updates.", "把指定頻道的脈絡帶進 Mission，並讓獲准的 Agents 發布內部更新。"], defaultCapabilities: ["Slack: read selected channels"] },
  notion: { monogram: "N", category: ["KNOWLEDGE", "知識庫"], description: ["Read only the pages you choose, then update the Mission page when the plan grants write access.", "只讀取你選擇的頁面；計畫允許寫入時，才更新 Mission 頁面。"], defaultCapabilities: ["Notion: read user-selected pages"] },
  github: { monogram: "GH", category: ["ENGINEERING", "工程"], description: ["Let engineering Agents inspect mission repositories, open issues and leave governed review comments.", "讓工程 Agents 檢查 Mission 程式庫、建立 Issue，並留下受治理的 Review 留言。"], defaultCapabilities: ["GitHub: read mission repositories"] },
  figma: { monogram: "F", category: ["DESIGN", "設計"], description: ["Give design Agents access to selected files and comments without exposing the OAuth token to the model.", "讓設計 Agents 讀取指定檔案與留言，OAuth Token 不會進入模型。"], defaultCapabilities: ["Figma: read mission files"] },
};

function connectorProviderKey(name: string) {
  return ["Gmail", "Google Drive", "Google Calendar"].includes(name) ? "google" : name.toLowerCase().replaceAll(" ", "");
}

function canonicalConnectorCapability(access: AccessRequirement, capability: string) {
  if (capability.includes(":")) return capability;
  const prefix = access.provider === "Google Drive" ? "Drive" : access.provider === "Google Calendar" ? "Calendar" : access.provider;
  return `${prefix}: ${capability}`;
}

const ExecutionFlowCanvas = lazy(() => import("./ExecutionFlowCanvas"));
const LucyMissionCanvas = lazy(() => import("./LucyMissionCanvas"));

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
        <a href="#live-canvas">{tr("See Agents work", "看 Agents 工作")}</a><a href="#roles">{tr("For your role", "適合誰用")}</a><a href="#proof">{tr("Proof", "完成證明")}</a>
        <LanguageSwitcher compact />
        <Link to="/demo" className="text-link">{tr("Live demo", "即時 Demo")}</Link>
        <Link to="/missions/new" className="quiet-start-link">{tr("Start a mission", "開始一個 Mission")} <ArrowRight size={17} /></Link>
      </nav>
      <button className="icon-button mobile-menu" onClick={() => setOpen((value) => !value)} aria-label={tr("Toggle menu", "開關選單")}><Menu size={20} /></button>
    </header>
  );
}

type LandingScenario = {
  id: string;
  role: string;
  mission: string;
  prompt: string;
  invitees: string[];
  agents: string[];
  approval: string;
  outcome: string;
  activity: string[];
  icon: typeof Radar;
};

function getLandingScenarios(): LandingScenario[] {
  return [
    {
      id: "investor", role: tr("Investor", "投資人"), icon: Search,
      mission: tr("Find one company worth advancing", "找到一個值得進入下一輪的投資標的"),
      prompt: tr("Find the strongest AI infrastructure company in our pipeline. Invite the DD team, challenge the market assumptions and return an investment memo by Friday.", "從投資名單找出最值得深入的 AI 基礎建設公司。邀請 DD 團隊、挑戰市場假設，週五前交回投資備忘錄。"),
      invitees: [tr("Investment partner", "投資合夥人"), tr("Finance lead", "財務負責人"), tr("Legal counsel", "法務顧問")],
      agents: [tr("Sourcing Agent", "標的搜尋 Agent"), tr("Market Agent", "市場研究 Agent"), tr("DD Agent", "盡調 Agent")],
      approval: tr("You decide whether the deal advances", "由你決定是否進入下一輪"),
      outcome: tr("A sourced investment memo, open risks and every DD owner", "一份有來源的投資備忘錄、未解風險與每項盡調負責人"),
      activity: [tr("Lucy is mapping the investment thesis", "Lucy 正在畫出投資論點"), tr("Lucy is inviting the DD team", "Lucy 正在邀請 DD 團隊"), tr("Counterpart Agents are comparing assumptions", "每人的 AI 搭檔正在比對假設"), tr("Agent Council is challenging the market case", "Agent Council 正在挑戰市場論點"), tr("DD Agents are reading the data room", "DD Agents 正在讀取資料室"), tr("Lucy is learning the correction and revising the memo", "Lucy 正在吸收修正並重寫備忘錄")],
    },
    {
      id: "ceo", role: "CEO", icon: LayoutDashboard,
      mission: tr("Turn five department plans into one company plan", "把五個部門計畫收斂成一份公司計畫"),
      prompt: tr("Build our Q4 operating plan. Let every function state its goal and constraint, resolve the trade-offs and bring me only the decisions that change runway or strategy.", "建立 Q4 營運計畫。讓每個部門說出目標與限制，先解決取捨，只把會改變現金跑道或策略的決定帶回給我。"),
      invitees: [tr("Finance", "財務"), tr("Product", "產品"), tr("Revenue lead", "營收負責人")],
      agents: [tr("Strategy Agent", "策略 Agent"), tr("Planning Agent", "計畫 Agent"), tr("Risk Agent", "風險 Agent")],
      approval: tr("You sign off on strategy and budget", "你只核准策略與預算"),
      outcome: tr("One operating plan, named owners and no status meeting", "一份營運計畫、具名負責人，而且不用開進度會"),
      activity: [tr("Lucy is collecting each function's goal", "Lucy 正在收齊各部門目標"), tr("Counterparts are surfacing hidden constraints", "AI 搭檔正在找出隱藏限制"), tr("Agent Council is resolving priorities", "Agent Council 正在解決優先順序"), tr("Planning Agent is assigning owners", "計畫 Agent 正在指派負責人"), tr("Risk Agent is checking runway impact", "風險 Agent 正在檢查現金跑道影響"), tr("Lucy is preparing two decisions for the CEO", "Lucy 正在整理兩項需要 CEO 決定的事")],
    },
    {
      id: "engineering", role: tr("Engineering", "工程"), icon: GitBranch,
      mission: tr("Ship a release without coordination debt", "不用追進度，也能安全完成版本發布"),
      prompt: tr("Ship the billing release this week. Invite Product, Design, Security and QA. Keep GitHub and Linear updated, stop on a failed check and return the release proof.", "本週完成帳務版本發布。邀請產品、設計、安全與 QA；同步 GitHub 和 Linear，檢查失敗就停止，最後交回發布證明。"),
      invitees: [tr("Product manager", "產品經理"), tr("Security", "資安"), "QA"],
      agents: [tr("Code Agent", "程式 Agent"), tr("QA Agent", "測試 Agent"), tr("Release Agent", "發布 Agent")],
      approval: tr("The release owner approves production", "發布負責人核准正式上線"),
      outcome: tr("Merged code, passed checks, release notes and rollback proof", "合併程式、通過檢查、發布說明與回滾證明"),
      activity: [tr("Lucy is drawing the release dependency map", "Lucy 正在畫發布依賴圖"), tr("Engineering counterparts are clarifying scope", "工程 AI 搭檔正在釐清範圍"), tr("Code Agent is opening the implementation branch", "程式 Agent 正在建立實作分支"), tr("QA Agent is running regression checks", "測試 Agent 正在跑回歸檢查"), tr("Release Agent is waiting at production approval", "發布 Agent 正在正式環境核准點等待"), tr("Lucy is learning from the failed check and replanning", "Lucy 正在從失敗檢查學習並重新規劃")],
    },
    {
      id: "product", role: tr("Product", "產品"), icon: Network,
      mission: tr("Move a feature from request to measurable outcome", "把一個需求做到可驗證的成果"),
      prompt: tr("Turn customer requests into a scoped onboarding improvement. Invite Design, Engineering, Support and Data, reconcile constraints and own the experiment through its result.", "把客戶回饋變成一個明確的 onboarding 改善。邀請設計、工程、客服與數據，收斂限制，並一路執行到實驗結果。"),
      invitees: [tr("Designer", "設計師"), tr("Engineer", "工程師"), tr("Support lead", "客服負責人")],
      agents: [tr("Research Agent", "研究 Agent"), tr("Spec Agent", "規格 Agent"), tr("Experiment Agent", "實驗 Agent")],
      approval: tr("You approve scope and success metric", "你只核准範圍與成功指標"),
      outcome: tr("A shipped experiment tied back to the original evidence", "一個已上線、能追溯到原始證據的實驗"),
      activity: [tr("Lucy is clustering customer evidence", "Lucy 正在整理客戶證據"), tr("Research Agent is finding the repeated pain", "研究 Agent 正在找重複痛點"), tr("Counterparts are negotiating scope", "各方 AI 搭檔正在協調範圍"), tr("Spec Agent is writing acceptance criteria", "規格 Agent 正在寫驗收條件"), tr("Experiment Agent is preparing measurement", "實驗 Agent 正在準備量測"), tr("Lucy is updating the plan from new evidence", "Lucy 正依新證據更新計畫")],
    },
    {
      id: "design", role: tr("Design", "設計"), icon: Sparkles,
      mission: tr("Turn scattered feedback into one approved design", "把分散回饋收斂成一版核准設計"),
      prompt: tr("Finish the mobile checkout redesign. Invite Product, Research, Brand and Engineering; reconcile their feedback, update Figma and prepare a clean handoff.", "完成手機結帳改版。邀請產品、研究、品牌與工程；收斂回饋、更新 Figma，並準備乾淨的交接。"),
      invitees: [tr("Product", "產品"), tr("Brand", "品牌"), tr("Engineer", "工程師")],
      agents: [tr("Research Agent", "研究 Agent"), tr("Design QA Agent", "設計 QA Agent"), tr("Handoff Agent", "交接 Agent")],
      approval: tr("Design and Product sign off on the exact frame", "設計與產品核准精確畫面版本"),
      outcome: tr("One approved Figma version with specs and unresolved notes", "一個核准的 Figma 版本、規格與未解事項"),
      activity: [tr("Lucy is pinning every feedback source", "Lucy 正在固定每個回饋來源"), tr("Research Agent is checking user evidence", "研究 Agent 正在檢查用戶證據"), tr("Counterparts are resolving conflicting comments", "AI 搭檔正在解決衝突留言"), tr("Design QA Agent is checking every state", "設計 QA Agent 正在檢查所有狀態"), tr("Handoff Agent is preparing engineering specs", "交接 Agent 正在準備工程規格"), tr("Lucy is recording the accepted correction", "Lucy 正在記錄已接受的修正")],
    },
    {
      id: "finance", role: tr("Finance", "財務"), icon: CircleDollarSign,
      mission: tr("Close the month without chasing documents", "不用催資料，也能完成月結"),
      prompt: tr("Close July by Friday. Ask every cost owner for missing evidence, reconcile the ledger, flag policy exceptions and bring me only the entries that need judgment.", "週五前完成七月月結。向每位成本負責人補齊憑證、核對帳目、標出政策例外，只把需要判斷的項目帶回給我。"),
      invitees: [tr("Budget owners", "預算負責人"), tr("Operations", "營運"), tr("CEO", "執行長")],
      agents: [tr("Reconciliation Agent", "對帳 Agent"), tr("Policy Agent", "政策 Agent"), tr("Close Agent", "月結 Agent")],
      approval: tr("Finance keeps every payment and exception approval", "每筆付款與例外核准仍由財務掌握"),
      outcome: tr("Reconciled books, exception list and signed close report", "完成對帳、例外清單與已簽核月結報告"),
      activity: [tr("Lucy is requesting missing evidence", "Lucy 正在索取缺少的憑證"), tr("Counterparts are answering cost-owner questions", "AI 搭檔正在回答成本歸屬問題"), tr("Reconciliation Agent is matching transactions", "對帳 Agent 正在核對交易"), tr("Policy Agent is flagging exceptions", "政策 Agent 正在標示例外"), tr("Close Agent is preparing the report", "月結 Agent 正在準備報告"), tr("Lucy is learning the new coding rule", "Lucy 正在學習新的會計分類規則")],
    },
    {
      id: "people", role: tr("People / HR", "人資"), icon: UsersRound,
      mission: tr("Run hiring without another scheduling meeting", "不用再開協調會，也能完成招募"),
      prompt: tr("Hire a senior designer. Invite the hiring panel, align the scorecard, coordinate interviews, collect evidence and prepare the offer for exact approval.", "招募一位資深設計師。邀請面試小組、對齊評分表、安排面試、收集證據，最後準備精確的 offer 核准。"),
      invitees: [tr("Hiring manager", "用人主管"), tr("Design lead", "設計主管"), tr("Finance", "財務")],
      agents: [tr("Sourcing Agent", "人才搜尋 Agent"), tr("Interview Agent", "面試 Agent"), tr("Offer Agent", "Offer Agent")],
      approval: tr("Humans make the hiring and compensation decision", "錄用與薪資決定永遠由人類做"),
      outcome: tr("A documented hiring decision and approved offer", "一份有依據的錄用決策與已核准 Offer"),
      activity: [tr("Lucy is aligning the hiring scorecard", "Lucy 正在對齊招募評分表"), tr("Sourcing Agent is screening the pipeline", "人才 Agent 正在篩選名單"), tr("Panel counterparts are comparing evidence", "面試官 AI 搭檔正在比對證據"), tr("Interview Agent is coordinating schedules", "面試 Agent 正在協調時間"), tr("Offer Agent is checking the approved band", "Offer Agent 正在檢查核准薪資帶"), tr("Lucy is correcting the search from panel feedback", "Lucy 正依面試回饋修正搜尋")],
    },
    {
      id: "growth", role: tr("Growth", "行銷成長"), icon: Target,
      mission: tr("Launch a campaign without version chaos", "不用在版本混亂中完成行銷上線"),
      prompt: tr("Launch the September campaign. Invite Brand, Finance, CRM and Legal; exclude existing customers, prepare every channel and stop if CPA crosses the limit.", "推出九月活動。邀請品牌、財務、CRM 與法務；排除既有客戶、準備所有渠道，CPA 超過上限就停止。"),
      invitees: [tr("Brand", "品牌"), tr("Finance", "財務"), tr("Legal", "法務")],
      agents: [tr("Audience Agent", "受眾 Agent"), tr("Creative Agent", "素材 Agent"), tr("Campaign Agent", "活動 Agent")],
      approval: tr("Owners approve audience, creative and exact spend", "負責人核准受眾、素材與精確花費"),
      outcome: tr("A governed multi-channel launch with live performance proof", "一個受治理的多渠道上線與即時成效證明"),
      activity: [tr("Lucy is reconciling the launch brief", "Lucy 正在收斂 Launch Brief"), tr("Audience Agent is excluding customers", "受眾 Agent 正在排除既有客戶"), tr("Brand counterpart is reviewing creative", "品牌 AI 搭檔正在審查素材"), tr("Agent Council is resolving budget versions", "Agent Council 正在解決預算版本"), tr("Campaign Agent is waiting for exact approval", "活動 Agent 正等待精確核准"), tr("Lucy is learning from live CPA and adjusting", "Lucy 正從即時 CPA 學習並調整")],
    },
    {
      id: "sales", role: tr("Sales", "業務"), icon: Mail,
      mission: tr("Move a complex deal without internal chasing", "不用內部追人，也能推進複雜交易"),
      prompt: tr("Advance the enterprise renewal. Invite Solutions, Security, Legal and Finance; answer the customer's open questions, prepare the proposal and protect the approved terms.", "推進企業續約。邀請解決方案、資安、法務與財務；完成客戶待答問題、準備提案，並保護已核准條款。"),
      invitees: [tr("Solutions", "解決方案"), tr("Security", "資安"), tr("Legal", "法務")],
      agents: [tr("Account Agent", "客戶 Agent"), tr("Security Agent", "資安 Agent"), tr("Proposal Agent", "提案 Agent")],
      approval: tr("Humans approve price, terms and the exact send", "價格、條款與寄送仍由人類核准"),
      outcome: tr("A complete proposal, answered risks and a clean handoff", "完整提案、已回答風險與乾淨交接"),
      activity: [tr("Lucy is mapping the buying committee", "Lucy 正在畫出採購決策鏈"), tr("Account Agent is reading the CRM history", "客戶 Agent 正在讀取 CRM 紀錄"), tr("Security Agent is drafting questionnaire answers", "資安 Agent 正在準備問卷回覆"), tr("Counterparts are resolving commercial terms", "AI 搭檔正在協調商務條款"), tr("Proposal Agent is assembling the final packet", "提案 Agent 正在組合最終文件"), tr("Lucy is updating the plan from customer feedback", "Lucy 正依客戶回饋更新計畫")],
    },
    {
      id: "operations", role: tr("Operations", "營運"), icon: RouteIcon,
      mission: tr("Coordinate a multi-location operation end to end", "從頭到尾協調多據點營運"),
      prompt: tr("Open three new locations. Invite every local owner, Procurement, Finance and Legal; track permits, vendors and dependencies until every site signs off.", "開三個新據點。邀請各地負責人、採購、財務與法務；追蹤許可、供應商與依賴，直到每個據點完成簽核。"),
      invitees: [tr("Local owners", "據點負責人"), tr("Procurement", "採購"), tr("Legal", "法務")],
      agents: [tr("Vendor Agent", "供應商 Agent"), tr("Schedule Agent", "排程 Agent"), tr("Launch Agent", "開幕 Agent")],
      approval: tr("Local owners keep site and spend authority", "據點與支出權限仍留在地方負責人"),
      outcome: tr("Three launch-ready sites with one visible dependency map", "三個可開幕據點與一張清楚的依賴圖"),
      activity: [tr("Lucy is drawing the location dependency map", "Lucy 正在畫各據點依賴圖"), tr("Local counterparts are reporting constraints", "各地 AI 搭檔正在回報限制"), tr("Vendor Agent is collecting bids", "供應商 Agent 正在收集報價"), tr("Schedule Agent is resolving collisions", "排程 Agent 正在解決衝突"), tr("Launch Agent is checking every sign-off", "開幕 Agent 正在檢查所有簽核"), tr("Lucy is replanning the delayed location", "Lucy 正在重新規劃延誤據點")],
    },
    {
      id: "agency", role: tr("Agency", "代理商"), icon: Blocks,
      mission: tr("Deliver client work from the one valid brief", "用唯一有效 Brief 完成客戶交付"),
      prompt: tr("Deliver the campaign without scope drift. Invite the client, Strategy, Creative and Media; reconcile every revision, protect approvals and finish the launch pack.", "在不失控擴張範圍下完成活動。邀請客戶、策略、創意與媒體；收斂每次改版、保護核准，完成上線交付包。"),
      invitees: [tr("Client owner", "客戶負責人"), tr("Creative", "創意"), tr("Media", "媒體")],
      agents: [tr("Brief Agent", "Brief Agent"), tr("Production Agent", "製作 Agent"), tr("Delivery Agent", "交付 Agent")],
      approval: tr("The client approves the exact deliverable version", "客戶核准精確的交付版本"),
      outcome: tr("One client-visible plan, finished assets and change receipts", "一份客戶可見計畫、完成素材與所有變更憑據"),
      activity: [tr("Lucy is reconciling client revisions", "Lucy 正在收斂客戶改版"), tr("Brief Agent is invalidating stale promises", "Brief Agent 正在使舊承諾失效"), tr("Creative counterparts are aligning the work", "創意 AI 搭檔正在對齊工作"), tr("Production Agent is finishing approved assets", "製作 Agent 正在完成核准素材"), tr("Delivery Agent is preparing the launch pack", "交付 Agent 正在準備上線包"), tr("Lucy is recording the final client correction", "Lucy 正在記錄客戶最終修正")],
    },
  ];
}

function LandingLiveCanvas({ scenario, onStart }: { scenario: LandingScenario; onStart: () => void }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    setPhase(0);
    const timer = window.setInterval(() => setPhase((current) => (current + 1) % scenario.activity.length), 2400);
    return () => window.clearInterval(timer);
  }, [scenario.id, scenario.activity.length]);
  const invitees = scenario.invitees.slice(0, 3);
  const agents = scenario.agents.slice(0, 2);
  const nodes = useMemo<MissionFlowNode[]>(() => [
    { id: "landing-intent", type: "missionNode", position: { x: 0, y: 250 }, data: { variant: "intent", title: scenario.mission, meta: `${scenario.role} · MISSION`, detail: tr("One outcome, shared by the whole team", "一個全隊共用的成果"), status: "verified", accent: "lime", addable: false } },
    { id: "landing-lucy", type: "missionNode", position: { x: 290, y: 250 }, data: { variant: "agent", title: "Lucy", meta: tr("AI MISSION PARTNER", "AI MISSION 搭檔"), detail: phase < 2 ? tr("Listening, drawing the plan and finding the right people", "理解目標、畫出計畫並找到正確的人") : tr("Keeping every goal, constraint and correction in sync", "持續同步每個目標、限制與修正"), status: phase < 1 ? "listening" : "running", progress: Math.min(92, 18 + phase * 15), accent: "blue", addable: false } },
    ...invitees.map((person, index) => ({ id: `landing-human-${index}`, type: "missionNode" as const, position: { x: 585, y: 65 + index * 185 }, data: { variant: "human" as const, title: person, meta: tr("HUMAN + AI COUNTERPART", "人類＋專屬 AI 搭檔"), detail: tr("Goals represented. Approval stays human.", "立場由 AI 帶入；核准權留在人類。"), status: phase >= 2 ? "informed" : "invited", accent: "violet" as const, addable: false } })),
    { id: "landing-council", type: "missionNode", position: { x: 890, y: 250 }, data: { variant: "agent", title: tr("Agent Council", "Agent 代理人會議"), meta: tr("NO HUMAN MEETING", "人類不用開會"), detail: tr("Counterparts compare goals, evidence and constraints", "每人的 AI 搭檔比對目標、證據與限制"), status: phase >= 4 ? "minutes_ready" : phase >= 3 ? "meeting" : "ready", progress: phase >= 4 ? 100 : phase >= 3 ? 62 : 12, accent: "blue", addable: false } },
    ...agents.map((agent, index) => ({ id: `landing-agent-${index}`, type: "missionNode" as const, position: { x: 1190, y: 145 + index * 230 }, data: { variant: "agent" as const, title: agent, meta: tr("AI EXECUTION", "AI 執行"), detail: index === 0 ? tr("Works through approved tools", "透過已授權工具工作") : tr("Returns evidence, not status theatre", "交回證據，不做進度表演"), status: phase >= 5 ? "completed" : phase >= 4 ? "running" : "queued", progress: phase >= 5 ? 100 : phase >= 4 ? 58 + index * 12 : 4, accent: "blue" as const, addable: false } })),
    { id: "landing-outcome", type: "missionNode", position: { x: 1500, y: 250 }, data: { variant: "outcome", title: tr("Mission complete", "Mission 完成"), meta: tr("VERIFIED OUTCOME", "已驗證成果"), detail: scenario.outcome, status: phase >= 5 ? "achieved" : "waiting", accent: "lime", addable: false } },
  ], [agents, invitees, phase, scenario.mission, scenario.outcome, scenario.role]);
  const arrowClosed = "arrowclosed" as MarkerType;
  const link = (id: string, source: string, target: string, active: boolean): Edge => ({ id, source, target, type: "smoothstep", animated: active, style: { stroke: active ? "#0066cc" : "#c8c8c8", strokeWidth: active ? 2 : 1.25 }, markerEnd: { type: arrowClosed, color: active ? "#0066cc" : "#c8c8c8", width: 14, height: 14 } });
  const edges: Edge[] = [
    link("landing-e-1", "landing-intent", "landing-lucy", phase >= 1),
    ...invitees.map((_, index) => link(`landing-e-human-${index}`, "landing-lucy", `landing-human-${index}`, phase === 2)),
    ...invitees.map((_, index) => link(`landing-e-council-${index}`, `landing-human-${index}`, "landing-council", phase === 3)),
    ...agents.map((_, index) => link(`landing-e-agent-${index}`, "landing-council", `landing-agent-${index}`, phase === 4)),
    ...agents.map((_, index) => link(`landing-e-outcome-${index}`, `landing-agent-${index}`, "landing-outcome", phase === 5)),
  ];
  return <section className="landing-live-canvas" id="live-canvas" aria-label={tr("Live AI team canvas", "AI 團隊即時白紙") }>
    <header className="landing-live-head"><div><span className="landing-live-dot"/><p><small>{tr("RELAY LIVE CANVAS", "RELAY 即時白紙")}</small><b>{scenario.activity[phase]}</b></p></div><span>{String(phase + 1).padStart(2, "0")} / {String(scenario.activity.length).padStart(2, "0")}</span></header>
    <div className="landing-canvas-stage"><Suspense fallback={<div className="flow-loading"><span className="loader"/><p>{tr("Opening the live mission…", "正在打開即時 Mission…")}</p></div>}><ExecutionFlowCanvas nodes={nodes} edges={edges} onConflictSelect={() => undefined} presentation/></Suspense></div>
    <footer className="landing-live-footer"><div><Bot size={16}/><span>{tr("Lucy is drawing · inviting · aligning · executing · learning", "Lucy 正在畫圖、邀請、對齊、執行與學習")}</span></div><button type="button" onClick={onStart}>{tr("Run this mission", "執行這個 Mission")}<ArrowRight size={16}/></button></footer>
  </section>;
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

function CompletedLaunchProof({ compact = false }: { compact?: boolean }) {
  const [mission, setMission] = useState<MissionDetail>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api<{ mission: MissionDetail }>("/api/demo/completed")
      .then((response) => { if (active) setMission(response.mission); })
      .catch((reason) => { if (active) setError((reason as Error).message); });
    return () => { active = false; };
  }, []);
  if (error) return <aside className={`completion-proof ${compact ? "compact" : ""}`}><AlertOctagon/><p>{tr("The verified sample could not load.", "已驗證範例目前無法載入。")}</p></aside>;
  if (!mission) return <aside className={`completion-proof loading ${compact ? "compact" : ""}`}><span className="loader"/><p>{tr("Loading the completed product run…", "正在載入已完成的真實產品執行…")}</p></aside>;
  const approval = mission.currentPlan?.approvals.find((item) => item.status === "approved");
  return <aside className={`completion-proof ${compact ? "compact" : ""}`} id="completed-proof" aria-label={tr("Verified completed launch-readiness run", "已驗證的 Launch 準備完成紀錄") }>
    <div className="completion-proof-head"><span><BadgeCheck size={16}/>{tr("VERIFIED PRODUCT RUN", "已驗證產品執行")}</span><em><span/>{tr("OUTCOME ACHIEVED", "成果已達成")}</em></div>
    <div className="completion-proof-title"><small>{tr("SAMPLE · LAUNCH READINESS", "範例 · LAUNCH 準備工作")}</small><h3>{tr("Six sources became one approved launch handoff.", "6 個來源，已變成 1 份核准完成的 Launch 交接包。")}</h3><p>{tr("This record was produced by Relay's real executors and database—not a scripted animation.", "這筆紀錄由 Relay 真實執行器與資料庫產生，不是預製動畫。")}</p></div>
    <div className="completion-proof-metrics"><div><b>{mission.impact.sourcesReconciled}</b><span>{tr("sources reconciled", "個來源已收斂")}</span></div><div><b>{mission.impact.agentTasksCompleted}</b><span>{tr("Agent tasks done", "個 Agent 任務完成")}</span></div><div><b>{mission.impact.artifactsCreated}</b><span>{tr("hashed artifacts", "份雜湊產出物")}</span></div><div><b>{mission.impact.humanDecisions}</b><span>{tr("human approval", "次人工核准")}</span></div></div>
    <div className="completion-proof-flow"><span><UsersRound size={15}/>{tr("8-person sample", "8 人範例")}</span><ArrowRight size={14}/><span><Bot size={15}/>{tr("Agents prepare", "Agent 準備")}</span><ArrowRight size={14}/><span><Fingerprint size={15}/>{tr("Owner approves", "負責人核准")}</span><ArrowRight size={14}/><span><Target size={15}/>{tr("Handoff complete", "交接完成")}</span></div>
    <div className="completion-proof-impact"><TimerReset size={19}/><div><small>{tr("SAMPLE COORDINATION BASELINE", "範例協作基準")}</small><b>{mission.impact.meetingsAvoided} {tr("meetings avoided", "場會議免開")} · {mission.impact.peopleHoursAvoided} {tr("people-hours avoided", "人時免耗")}</b><p>{tr("Calculated from 8 people, 3 planned meetings, 1 actual meeting and 45 minutes each. This is a transparent sample calculation—not a customer claim.", "依 8 人、原訂 3 場、實際 1 場、每場 45 分鐘計算；這是透明的範例公式，不是客戶成效宣稱。")}</p></div></div>
    <div className="completion-proof-receipt"><ShieldCheck size={16}/><div><b>{tr("What was truly completed", "真正完成了什麼")}</b><p>{tr("Evidence, brief, audience guardrail, draft bundle, exact approval, handoff and outcome receipt.", "證據、Brief、受眾護欄、草稿包、精確核准、交接與成果憑據。")}</p><code>{approval?.payloadHash?.slice(0, 32)}…</code></div></div>
    <p className="completion-proof-boundary"><LockKeyhole size={13}/>{tr("External send, publish and spend actions: 0. Those remain locked until a real provider is connected and verified.", "外部寄送、發布與花費：0。只有真實服務連線並驗證後才會解鎖。")}</p>
  </aside>;
}

function LegacyLandingPage() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  return (
    <div className="landing">
      <PublicHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="pulse-dot" /> {tr("NO MORE STATUS MEETINGS · AGENTS ALIGN, HUMANS DECIDE", "不用再開進度會議 · AGENTS 對齊，人類決定")}</div>
            <h1>{locale === "zh-TW" ? <><span className="hero-line">人類不用再開會。</span><span className="hero-line">讓 AI Agents</span><span className="hero-line">替你開會、</span><span className="hero-line hero-accent-line">把工作做完。</span></> : <><span className="hero-line">Stop having meetings.</span><span className="hero-line">Let your AI agents</span><span className="hero-line">meet, align,</span><span className="hero-line hero-accent-line">and finish the work.</span></>}</h1>
            <h2>{locale === "zh-TW" ? <>每位同事都有自己的 AI counterpart。<b>Agents 替彼此同步目標、整理會議紀錄，只向真正有權的人取得授權；工具連線後，再把剩下的任務做完。</b></> : <>Every teammate gets an AI counterpart. <b>The Agents align goals, write the minutes, ask the right human for approval, then finish the work through connected tools.</b></>}</h2>
            <p className="hero-philosophy">{tr("Use Relay. So your team can lay back while the work keeps moving.", "Use Relay, so you can lay back。你離開畫面，工作也會繼續往前。")}</p>
            <div className="hero-actions">
              <button className="button button-primary button-large" onClick={() => navigate("/missions/new")}>{tr("Meet Lucy and start", "讓 Lucy 開始接手")} <ArrowRight size={18} /></button>
              <button className="button button-ghost button-large" onClick={() => navigate("/demo")}><Play size={17} fill="currentColor" /> {tr("See the real workflow", "看真實操作流程")}</button>
            </div>
            <RelayJourney active={1} />
            <p className="agent-definition"><Bot size={16} /><span><b>{tr("One human, one counterpart Agent.", "一位人類，一位專屬 AI counterpart。")}</b>{tr("It carries that person’s role and constraints into the Agent Council, but it can never borrow their approval authority.", "它替那個人把角色與限制帶進 Agent Council，但永遠不能冒用那個人的核准權。")}</span></p>
          </div>
          <CompletedLaunchProof compact />
        </section>

        <section className="proof-strip"><span>{tr("RELAY OWNS THE MESSY MIDDLE OF A LAUNCH", "RELAY 負責 LAUNCH 最混亂的中段")}</span><ArrowRight size={18} /><b>{tr("conflicting inputs → owned decisions → Agent work → exact approval → immutable handoff", "衝突指令 → 權責決策 → Agent 執行 → 精確核准 → 不可變交接")}</b></section>

        <section className="section completion-section"><div className="completion-section-copy"><span className="section-index">01 / {tr("FROM STOPPED TO DONE", "不只阻擋，還要完成")}</span><h2>{tr("Catching a bad instruction is step one. The product must finish the safe work next.", "抓到錯誤指令只是第一步；接著必須把安全的工作真的做完。")}</h2><p>{tr("The completed run below is loaded from Relay's production data model. Every finished Agent task has an immutable artifact and receipt; one exact human approval unlocks the final handoff.", "下方完成紀錄來自 Relay 正式資料模型。每個已完成 Agent 任務都有不可變 Artifact 與憑據；一次精確人工核准才會解鎖最後交接。")}</p><a href="#magic" className="button button-dark">{tr("Now test my messy brief", "現在測試我的混亂 Brief")} <ArrowRight size={16}/></a></div><CompletedLaunchProof/></section>

        <section className="section live-proof-section">
          <div className="live-proof-copy"><span className="section-index">02 / {tr("YOUR MAGIC MOMENT", "換你觸發 MAGIC MOMENT")}</span><h2>{tr("Paste the launch everyone remembers differently.", "貼上那個每個人記得都不一樣的 Launch。")}</h2><p>{tr("Relay extracts the claims, shows the exact collision and tells you which Agent work can continue. Save it to turn the result into a live, versioned launch room.", "Relay 會拆出主張、指出精確衝突，並告訴你哪些 Agent 工作可以繼續；保存後就會變成即時、版本化的 Launch Room。")}</p><div className="live-proof-legend"><span><FileCheck2 size={15} /> {tr("Input: team evidence", "輸入：團隊證據")}</span><span><CircleStop size={15} /> {tr("Gate: unsafe paths stop", "關卡：不安全路徑停止")}</span><span><Target size={15} /> {tr("Output: executable contract", "輸出：可執行合約")}</span></div></div>
          <LandingMagicCompiler onOpenFullMission={(brief) => { sessionStorage.setItem("relay_mission_draft", brief); navigate("/missions/new?draft=1"); }} />
        </section>

        <LandingPainSection />
        <PlainTechnicalSection />
        <section className="section differentiation-section">
          <div className="section-heading"><span className="section-index">04 / {tr("THE INDEPENDENT PRODUCT", "為什麼 RELAY 值得獨立存在")}</span><h2>{tr("Chat coordinates people. Agent OS runs tasks. Approval tools ask permission. Relay closes the launch contract.", "聊天室協調人、Agent OS 跑任務、核准工具問許可；Relay 負責把整份 Launch Contract 做到閉環。")}</h2><p>{tr("Relay is the only layer in this stack that starts with contradictory organizational evidence and ends with a versioned decision, completed Agent artifacts, exact approval and measured outcome in one lineage.", "在這組工具中，Relay 唯一從互相矛盾的組織證據開始，並把版本化決策、Agent 產出、精確核准與量化成果串成同一條脈絡。")}</p></div>
          <div className="competitive-grid">
            <article><MessageSquareWarning/><span>{tr("MULTIPLAYER CHAT", "多人 AI 對話")}</span><h3>{tr("Everyone can talk to the Agent.", "每個人都能跟 Agent 說話。")}</h3><p>{tr("Useful for discussion, but conflicting instructions can remain unresolved conversation.", "適合討論，但互相矛盾的指令仍可能只留在對話裡。")}</p><small>{tr("ENDS AT", "停在")} · {tr("conversation", "對話")}</small></article>
            <article><Bot/><span>{tr("AGENT OS", "AGENT OS")}</span><h3>{tr("Agents can run defined work.", "Agent 能執行已定義工作。")}</h3><p>{tr("Powerful runtime, but it assumes the goal, authority and current version are already correct.", "執行力很強，但預設目標、權威與版本都已經正確。")}</p><small>{tr("STARTS AT", "從這裡開始")} · {tr("defined task", "已定義任務")}</small></article>
            <article><ShieldCheck/><span>{tr("HUMAN-IN-THE-LOOP", "人工核准層")}</span><h3>{tr("A human can approve one action.", "人類可以核准一個行動。")}</h3><p>{tr("It governs a payload, but does not reconcile why the team requested conflicting payloads.", "它治理一筆操作，卻不處理團隊為何提出互相矛盾的操作。")}</p><small>{tr("GOVERNS", "治理")} · {tr("one action", "單一行動")}</small></article>
            <article className="relay-layer"><Network/><span>RELAY · LAUNCH CONTRACT</span><h3>{tr("The team agrees once. Agents finish the safe work.", "團隊收斂一次，Agent 把安全工作做完。")}</h3><p>{tr("Evidence → authority → decision → plan → Agent artifact → exact approval → handoff → outcome.", "證據 → 權威 → 決策 → 計畫 → Agent 產出 → 精確核准 → 交接 → 成果。")}</p><small>{tr("OWNS", "負責")} · {tr("the complete intent-to-outcome chain", "完整意圖到成果鏈")}</small></article>
          </div>
          <div className="product-proof-grid"><div><b>6</b><span>{tr("conflict classes checked", "種衝突類型可檢查")}</span></div><div><b>20</b><span>{tr("deterministic release cases", "個確定性發佈回歸案例")}</span></div><div><b>0</b><span>{tr("agent completions without a receipt", "個無憑據的 Agent 完成")}</span></div><div><b>SHA-256</b><span>{tr("artifact and approval integrity", "Artifact 與核准完整性")}</span></div></div>
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
            <article className="available"><span>{tr("AVAILABLE NOW", "目前可用")}</span><h3>{tr("Launch-readiness completion, not another chat", "真的完成 Launch 準備，不是另一個聊天室")}</h3><ul><li><Check />{tr("Six built-in launch tasks produce hashed artifacts", "6 個內建 Launch 任務會產生雜湊 Artifact")}</li><li><Check />{tr("Twenty deterministic release-regression cases", "20 個確定性發佈回歸案例")}</li><li><Check />{tr("Named, role-bound team invites and realtime presence", "具名、綁定角色的團隊邀請與即時 Presence")}</li><li><Check />{tr("Durable Agent queue, checkpoints, pause, resume and cancel", "可恢復的 Agent Queue、Checkpoint、暫停、繼續與取消")}</li><li><Check />{tr("Versioned approvals, artifacts, receipts and outcomes", "版本化核准、Artifact、憑據與成果")}</li></ul></article>
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

function LandingPage() {
  const navigate = useNavigate();
  const [goal, setGoal] = useState("");
  const scenarios = getLandingScenarios();
  const [scenarioId, setScenarioId] = useState("investor");
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const start = (value: string) => {
    sessionStorage.setItem("relay_lucy_goal", value);
    navigate("/missions/new?goal=1");
  };
  const begin = (event: FormEvent) => {
    event.preventDefault();
    const value = goal.trim();
    if (value.length < 3) return;
    start(value);
  };

  return <div className="landing quiet-landing">
    <PublicHeader />
    <main>
      <section className="relay-hero">
        <div className="relay-hero-copy">
          <p className="quiet-eyebrow"><span/>{tr("YOUR AI TEAM, ALREADY AT WORK", "你的 AI 團隊，已經開始工作")}</p>
          <h1>{tr("Tell Lucy the goal. Watch your AI team finish it.", "把目標告訴 Lucy。看著 AI 團隊把它做完。")}</h1>
          <p className="relay-hero-lede">{tr("Stop calling status meetings. Every teammate gets an AI counterpart; the Agents meet, coordinate and execute for you. Humans step in only to decide or approve.", "不用再開進度會。每位同事都有一位 AI 搭檔；Agents 替大家開會、協調、執行。人類只在需要判斷或授權時出手。")}</p>
          <form className="quiet-goal-composer" onSubmit={begin}>
            <label className="visually-hidden" htmlFor="relay-goal">{tr("Tell Lucy your goal", "告訴 Lucy 你的目標")}</label>
            <span><Sparkles size={18}/></span>
            <input id="relay-goal" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder={tr("What should your AI team finish?", "你想讓 AI 團隊完成什麼？")} autoComplete="off" />
            <button type="submit" disabled={goal.trim().length < 3} aria-label={tr("Start this mission", "開始這個 Mission")}><ArrowRight size={21}/></button>
          </form>
          <button className="quiet-example" type="button" onClick={() => setGoal(scenario.prompt)}>{tr(`Try the ${scenario.role} example`, `載入「${scenario.role}」真實情境`)}</button>
          <div className="relay-hero-boundary"><span><Check size={14}/>{tr("Agents do the work", "Agents 負責做事")}</span><span><ShieldCheck size={14}/>{tr("Humans keep authority", "人類保留決策權")}</span><span><Activity size={14}/>{tr("Everything stays visible", "所有進度都看得見")}</span></div>
        </div>
        <LandingLiveCanvas scenario={scenario} onStart={() => start(scenario.prompt)}/>
      </section>

      <section className="relay-method" id="how">
        <header><span>01 / {tr("ONE NEW WAY TO WORK", "一種新的工作方式")}</span><h2>{tr("Your team speaks once. Its Agents keep moving.", "團隊只說一次。Agents 持續把事情往前推。")}</h2></header>
        <ol>
          <li><span>1</span><div><h3>{tr("Lucy learns the mission", "Lucy 先理解任務")}</h3><p>{tr("Talk naturally. Lucy asks only what is missing, then draws the work on one live canvas.", "像平常說話就好。Lucy 只追問缺少的資訊，接著把工作畫在同一張即時白紙上。")}</p></div></li>
          <li><span>2</span><div><h3>{tr("Every person gets a counterpart", "每個人都有一位 AI 搭檔")}</h3><p>{tr("Invite teammates once. Their Agents remember their goals, meet each other and keep everyone informed.", "邀請同事一次就好。每人的 Agent 記住他的目標、彼此開會，並持續同步所有人。")}</p></div></li>
          <li><span>3</span><div><h3>{tr("Agents execute. Humans hold the keys.", "Agents 執行；人類握著鑰匙。")}</h3><p>{tr("Agents use approved tools, stop at real risk and return exact approvals, artifacts and a verifiable outcome.", "Agents 使用已授權工具，遇到真風險才停下，帶回精確核准、產出物與可驗證成果。")}</p></div></li>
        </ol>
      </section>

      <section className="relay-roles" id="roles">
        <header><span>02 / {tr("BUILT AROUND YOUR ROLE", "從你的角色開始")}</span><h2>{tr("Whatever you own, Lucy assembles the team to finish it.", "不論你負責什麼，Lucy 都會組好一支團隊把它完成。")}</h2><p>{tr("Choose your role. See who Lucy invites, which Agents work, what stays with humans and what comes back finished.", "選擇你的角色。看看 Lucy 會邀請誰、哪些 Agents 會工作、什麼保留給人類，以及最後交回什麼。")}</p></header>
        <div className="relay-role-tabs" role="tablist" aria-label={tr("Relay use cases by role", "依角色查看 Relay 使用情境")}>{scenarios.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" role="tab" aria-selected={item.id === scenario.id} className={item.id === scenario.id ? "active" : ""} onClick={() => setScenarioId(item.id)}><Icon size={17}/>{item.role}</button>; })}</div>
        <article className="relay-role-detail" role="tabpanel">
          <div className="relay-role-brief"><span>{scenario.role}</span><h3>{scenario.mission}</h3><blockquote>“{scenario.prompt}”</blockquote><button type="button" onClick={() => start(scenario.prompt)}>{tr("Give this mission to Lucy", "把這個 Mission 交給 Lucy")}<ArrowRight size={17}/></button></div>
          <div className="relay-role-execution">
            <div><small>{tr("LUCY INVITES", "LUCY 邀請")}</small><p>{scenario.invitees.map((person) => <span key={person}><UserRound size={14}/>{person}</span>)}</p></div>
            <div><small>{tr("AGENTS EXECUTE", "AGENTS 執行")}</small><p>{scenario.agents.map((agent) => <span key={agent}><Bot size={14}/>{agent}</span>)}</p></div>
            <div><small>{tr("HUMAN AUTHORITY", "人類保留")}</small><strong><ShieldCheck size={17}/>{scenario.approval}</strong></div>
            <div className="relay-role-outcome"><small>{tr("RELAY RETURNS", "RELAY 交回")}</small><strong><BadgeCheck size={18}/>{scenario.outcome}</strong></div>
          </div>
        </article>
        <p className="relay-role-note">{tr("Also useful for procurement, customer success, compliance, events, research, content operations and any mission where several people and several tools must agree before AI acts.", "也適合採購、客戶成功、法遵、活動、研究、內容營運，以及任何需要多人、多工具先對齊，AI 才能動手的任務。")}</p>
      </section>

      <section className="quiet-proof" id="proof">
        <div className="quiet-proof-copy"><span>03 / {tr("PROOF, NOT THEATRE", "成果，不是表演")}</span><h2>{tr("See the work. Inspect the proof.", "看見工作。檢查證明。")}</h2><p>{tr("The live canvas makes coordination visible. The receipt below comes from Relay's persisted product data: completed Agent work has an artifact; unsafe external action stays locked until the right human approves.", "即時白紙讓協作看得見。下方憑據來自 Relay 已保存的產品資料：完成的 Agent 工作有產出物；不安全的外部操作會保持鎖定，直到正確的人核准。")}</p><Link to="/demo" className="quiet-text-action">{tr("Run the live product demo", "親手操作即時 Demo")} <ArrowRight size={17}/></Link></div>
        <CompletedLaunchProof compact />
      </section>

      <section className="quiet-final-cta"><span>{tr("USE RELAY. SKIP THE MEETING.", "用 RELAY。省下會議。")}</span><h2>{tr("Give Lucy the outcome. Get back finished work.", "把成果交代給 Lucy。拿回完成的工作。")}</h2><p>{tr("Start alone. Lucy will invite the right humans and Agents when the mission needs them.", "你可以一個人開始。Mission 需要時，Lucy 會再邀請正確的人類與 Agents。")}</p><button type="button" onClick={() => navigate("/missions/new")}>{tr("Start with Lucy", "開始跟 Lucy 說")}<ArrowRight size={19}/></button></section>
    </main>
    <footer><Logo /><p>{tr("Humans decide. Agents meet, execute and finish.", "人類決定。Agents 開會、執行、完成。")}</p><span>© 2026 Relay</span></footer>
  </div>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [sidebar, setSidebar] = useState(false);
  const location = useLocation();
  const session = useSessionIdentity();
  const actorName = session?.actorName || tr("Mission owner", "Mission 負責人");
  const actorRole = session?.title || localizeLabel(session?.department || "Other");
  const isMissionWorkspace = /^\/missions\/(?:new|[^/]+)$/.test(location.pathname);
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
      <section className="dashboard-proof-band"><div><span>{tr("FIRST-WEDGE PROOF", "首個切口完成證明")}</span><h2>{tr("Relay now ships an approved launch handoff—not only a blocker.", "Relay 現在不只找阻擋，還能交付核准完成的 Launch 交接包。")}</h2><p>{tr("Open the interactive demo to inspect a completed run with Agent artifacts, an exact approval and a quantified coordination baseline.", "打開互動 Demo，查看包含 Agent 產出、精確核准與量化協作基準的已完成執行。")}</p></div><Link to="/demo" className="button button-primary">{tr("Inspect completed proof", "查看完成證明")}<ArrowRight size={16}/></Link></section>
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

function LegacyMissionIntakePage() {
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
  const [executionMode, setExecutionMode] = useState<"launch_readiness" | "live_launch">("launch_readiness");
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
      input = { ...input, createdBy: owner.name.trim(), executionMode };
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
  const runButtonContent = busy ? <><span className="loader small" /> {stage}</> : <><Play size={18} /> {tr("Build my Launch Contract", "建立我的 Launch Contract")} <ArrowRight size={18} /></>;
  const activeCompilerDefinitions = compilerDefinitions(compilerRuntime.mode === "hybrid");
  const mobileRunDock = <div className="mobile-run-dock"><div><span>{tr("NEXT", "下一步")}</span><small>{compilerRuntime.mode === "hybrid" ? tr("Run the model with two safety gates", "執行模型與兩道安全閘門") : tr("Run three source-safe checks", "執行三道來源安全檢查")}</small></div>{error && <p className="form-error">{error}</p>}<button className="button button-primary run-submit" disabled={busy} type="submit" form={mode === "quick" ? "quick-mission-form" : "structured-mission-form"}>{runButtonContent}</button></div>;
  const compileSidebar = <aside className="compile-sidebar"><div className="compile-card simple-compile-card"><span>{tr("WHAT HAPPENS NEXT", "按下後會發生什麼")}</span><h3>{compilerRuntime.mode === "hybrid" ? tr("One model proposes. Two code gates decide.", "一個模型提案，兩道程式閘門裁決。") : tr("Relay runs three deterministic checks.", "Relay 執行三道確定性檢查。")}</h3><div className="sidebar-agent-list">{activeCompilerDefinitions.map((agent, index) => { const Icon = agent.icon; return <div key={agent.name[0]}><span><Icon size={16} /></span><p><small>{tr("ROLE", "角色")} {index + 1} · {tr(agent.kind[0], agent.kind[1])}</small><b>{tr(agent.name[0], agent.name[1])}</b><em>{tr(agent.action[0], agent.action[1])}</em></p></div>; })}</div><div className="compile-notice"><ShieldCheck size={17} /><p>{tr("It only analyzes what you pasted. It will not send email, publish content or change an external tool.", "這一步只分析你貼的文字，不會寄信、發布內容或修改外部工具。")}</p></div>{error && <p className="form-error">{error}</p>}<button className="button button-primary button-full button-large run-submit" disabled={busy} type="submit">{runButtonContent}</button></div></aside>;
  return <AppShell><main className="page intake-page">
    <CompileRunMoment state={runMoment} runtime={compilerRuntime} onClose={() => setRunMoment((current) => ({ ...current, open: false, error: undefined }))} />
    {mobileRunDock}
    <div className="page-title intake-title"><div><Link to="/app" className="back-link">← {tr("Workspace", "工作區")}</Link><span className="page-kicker">{tr("STEP 1 OF 3", "第 1 步（共 3 步）")}</span><h1>{tr("Paste what everyone said.", "把大家說過的話貼進來。")}</h1><p>{tr("Do not clean it up and do not decide who is right. Paste Slack messages, email requirements and meeting notes together.", "不用整理，也不用先決定誰對。把 Slack 訊息、Email 要求與會議紀錄一起貼上即可。")}</p></div><button className="button button-ghost" onClick={loadExample}><Sparkles size={16} /> {tr("Not sure? Load an example", "不知道怎麼貼？載入範例")}</button></div>
    <section className="mission-owner-profile"><div><Fingerprint size={18}/><p><b>{tr("Who is opening this Mission?", "誰正在建立這個 Mission？")}</b><small>{tr("Your teammates and Agent receipts will use this identity.", "同事與 Agent 憑據都會使用這個身分。")}</small></p></div><label>{tr("Name", "姓名")}<input required value={owner.name} onChange={(event) => setOwner({...owner, name: event.target.value})} placeholder={tr("Your real name", "你的真實姓名")}/></label><label>{tr("Work email (optional)", "工作 Email（選填）")}<input type="email" value={owner.email} onChange={(event) => setOwner({...owner, email: event.target.value})} placeholder="you@company.com"/></label><label>{tr("Title", "職稱")}<input value={owner.title} onChange={(event) => setOwner({...owner, title: event.target.value})} placeholder={tr("Product lead", "產品負責人")}/></label><label>{tr("Department", "部門")}<select value={owner.department} onChange={(event) => setOwner({...owner, department: event.target.value})}>{["Executive","Product","Engineering","Design","Finance","People","Growth","Operations","Other"].map((item) => <option value={item} key={item}>{localizeLabel(item)}</option>)}</select></label></section>
    <section className="execution-mode-picker" aria-label={tr("Choose what Relay should complete", "選擇 Relay 要完成的工作")}><div><span>{tr("WHAT SHOULD RELAY FINISH?", "RELAY 這次要完成到哪裡？")}</span><h2>{tr("Start with one clear finish line.", "先選一個清楚的完成線。")}</h2></div><button type="button" className={executionMode === "launch_readiness" ? "active" : ""} onClick={() => setExecutionMode("launch_readiness")}><span><FileCheck2 size={18}/></span><p><b>{tr("Prepare the approved launch pack", "完成可核准的 Launch 交接包")}</b><small>{tr("Recommended · works now · no external send or spend", "建議選擇 · 現在就能用 · 不會對外寄送或花費")}</small></p>{executionMode === "launch_readiness" && <Check size={17}/>}</button><button type="button" className={executionMode === "live_launch" ? "active" : ""} onClick={() => setExecutionMode("live_launch")}><span><Zap size={18}/></span><p><b>{tr("Execute through connected tools", "透過已連線工具執行")}</b><small>{tr("Requires verified OAuth, scoped access and exact approval", "需要已驗證 OAuth、範圍權限與精確核准")}</small></p>{executionMode === "live_launch" && <Check size={17}/>}</button></section>
    <RelayJourney active={1} />
    <button className="advanced-input-toggle" type="button" onClick={() => setMode(mode === "quick" ? "structured" : "quick")}><Braces size={15} /> {mode === "quick" ? tr("Advanced: label every source yourself", "進階：自己逐項標記來源") : tr("Back to the simple paste box", "回到簡單貼上模式")} <ArrowRight size={14} /></button>
    {mode === "quick" ? <form id="quick-mission-form" onSubmit={submitQuick} className="intake-layout quick-intake-layout"><div className="intake-main"><section className="quick-brief-card"><div className="quick-brief-head"><div><span>{tr("PASTE HERE", "貼在這裡")}</span><h2>{tr("Put every version in one box.", "把不同版本全部放進同一格。")}</h2><p>{tr("One line per person or tool is enough. Example: “Slack | Amy: launch July 29”.", "每個人或工具一行就好，例如：「Slack｜Amy：7 月 29 日發布」。")}</p></div><span className="time-to-value"><Clock3 size={15} /> {tr("About one minute", "約 1 分鐘")}</span></div><label className="quick-brief-label"><span>{tr("Your team's messages", "團隊的原始訊息")}</span><textarea className="quick-brief-textarea" value={rawBrief} onChange={(event) => setRawBrief(event.target.value)} rows={18} placeholder={tr("Paste messages, client requirements, dates and budgets here. Contradictions are welcome.", "把訊息、客戶要求、日期與預算貼在這裡。不一致也沒關係。") } required /></label><p className="quick-analysis-note"><ShieldCheck size={14} /> {tr("Relay only analyzes this text in step 2. It will not contact anyone or change another tool.", "第 2 步只會分析這些文字，不會聯絡任何人，也不會修改其他工具。")}</p></section></div>{compileSidebar}</form>
      : <form id="structured-mission-form" onSubmit={submitStructured} className="intake-layout"><div className="intake-main"><section className="form-section"><div className="form-section-title"><span>01</span><div><h2>{tr("Define the outcome", "定義成果")}</h2><p>{tr("What must be true when this mission succeeds?", "這個 Mission 成功時，哪些條件必須成立？")}</p></div></div><label>{tr("Mission name", "Mission 名稱")}<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={tr("Launch Kaohsiung campaign", "推出高雄活動行銷專案")} required minLength={3} /></label><label>{tr("Objective", "目標")}<textarea value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder={tr("Launch by… within… while never…", "在……前完成；限制為……；且絕不能……")} required minLength={5} rows={4} /></label><label>{tr("Success contract", "成功合約")}<input value={form.successMetric} onChange={(event) => setForm({ ...form, successMetric: event.target.value })} placeholder={tr("24 paid registrations at CPA ≤ NT$1,250", "24 筆付費報名，CPA ≤ NT$1,250")} required /></label></section>
        <section className="form-section"><div className="form-section-title"><span>02</span><div><h2>{tr("Attach sources", "加入來源")}</h2><p>{tr("Add at least two messages, documents or system records.", "至少加入兩則訊息、文件或系統紀錄。")}</p></div></div><div className="source-editor-list">{form.sources.map((source, index) => <article className="source-editor" key={index}><div className="source-editor-head"><span className={`source-number ${sourceColors[source.type] ?? "lime"}`}>{index + 1}</span><select value={source.type} onChange={(event) => updateSource(index, { type: event.target.value as SourceInput["type"] })}>{["Slack", "Email", "Notion", "Google Drive", "Calendar", "CRM", "Ads", "GitHub", "Figma", "Meeting note", "Manual"].map((type) => <option key={type} value={type}>{localizeLabel(type)}</option>)}</select>{form.sources.length > 2 && <button type="button" className="icon-button" aria-label={tr("Remove source", "移除來源")} onClick={() => setForm({ ...form, sources: form.sources.filter((_, itemIndex) => itemIndex !== index) })}><X size={17} /></button>}</div><div className="form-grid"><label>{tr("Source title", "來源標題")}<input value={source.title} onChange={(event) => updateSource(index, { title: event.target.value })} placeholder={tr("#launch or client thread", "#launch 或客戶對話串")} required /></label><label>{tr("Author / system", "作者／系統")}<input value={source.author} onChange={(event) => updateSource(index, { author: event.target.value })} placeholder={tr("Growth lead", "Growth 負責人")} required /></label></div><label>{tr("Exact content", "原始內容")}<textarea value={source.content} onChange={(event) => updateSource(index, { content: event.target.value })} placeholder={tr("Paste the original instruction—do not clean it up.", "貼上原始指令，不要先整理或改寫。")} rows={4} required /></label><div className="authority-row"><span>{tr("Authority", "權威等級")}</span><input aria-label={tr("Source authority level", "來源權威等級")} type="range" min="1" max="5" value={source.authorityLevel} onChange={(event) => updateSource(index, { authorityLevel: Number(event.target.value) })} /><b>{source.authorityLevel}/5</b></div></article>)}</div><button type="button" className="button button-ghost add-source" onClick={() => setForm({ ...form, sources: [...form.sources, { type: "Manual", title: "", author: "", content: "", authorityLevel: 3 }] })}><Plus size={17} /> {tr("Add another source", "再加入一個來源")}</button></section></div>{compileSidebar}</form>}
  </main></AppShell>;
}

function MissionIntakePage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");

  const launchMission = async ({ input, owner }: LucyMissionDraft) => {
    setBusy(true); setError("");
    try {
      setStage(tr("Lucy is securing your identity and source evidence…", "Lucy 正在保存身分與來源證據…"));
      await api("/api/session/profile", { method: "PUT", body: JSON.stringify(owner) });
      const created = await api<{ mission: MissionDetail }>("/api/missions", { method: "POST", body: JSON.stringify({ ...input, createdBy: owner.name }) });
      setStage(tr("Lucy is reconciling the team and building Mission v1…", "Lucy 正在收斂團隊需求並建立 Mission v1…"));
      const compiled = await api<{ mission: MissionDetail }>(`/api/missions/${created.mission.id}/compile`, { method: "POST" });
      const safeAgentTasks = (compiled.mission.currentPlan?.tasks ?? []).filter((task) => task.ownerType === "agent" && task.riskLevel <= 1 && task.status === "ready").slice(0, 3);
      if (safeAgentTasks.length) {
        setStage(tr(`Lucy is starting ${safeAgentTasks.length} safe Agent tasks…`, `Lucy 正在啟動 ${safeAgentTasks.length} 個安全 Agent 任務…`));
        await Promise.allSettled(safeAgentTasks.map((task) => api(`/api/tasks/${task.id}/agent-runs`, { method: "POST", body: "{}" })));
      } else {
        setStage(tr("Lucy found a decision that needs the right human first…", "Lucy 找到需要先由正確人員決定的事項…"));
      }
      navigate(`/missions/${created.mission.id}?view=room`);
    } catch (launchError) {
      setError((launchError as Error).message); setBusy(false); setStage("");
    }
  };

  return <AppShell><main className="lucy-intake-page">
    <header className="lucy-intake-header"><div><Link to="/app" className="lucy-back" aria-label={tr("Back to workspace", "返回工作區")}><ArrowRight size={17}/></Link><Logo/><span>{tr("NEW MISSION", "新 MISSION")}</span></div><div><span><ShieldCheck size={14}/>{tr("Nothing external runs without scoped access", "沒有範圍權限就不會執行外部操作")}</span><LanguageSwitcher compact/></div></header>
    <Suspense fallback={<div className="lucy-canvas-loading"><span className="loader"/><p>{tr("Opening Lucy’s blank canvas…", "正在打開 Lucy 的空白畫布…")}</p></div>}><LucyMissionCanvas onLaunch={launchMission} busy={busy} stage={stage} error={error}/></Suspense>
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

function teammateNameFromEmail(email: string) {
  const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() ?? "";
  return local ? local.replace(/\b\w/g, (letter) => letter.toUpperCase()) : tr("Teammate", "團隊同事");
}

function InviteTeammatesDialog({ mission, open, onClose, onInvited }: { mission: MissionDetail; open: boolean; onClose: () => void; onInvited: () => void }) {
  const { locale } = useLocale();
  const [form, setForm] = useState({ email: "", name: "", department: "Other", workspaceRole: "member", missionRole: "contributor" });
  const [invite, setInvite] = useState<{ token: string; url: string; expiresAt: string; delivery: InviteDelivery }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return null;
  const createInvite = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload = { ...form, name: form.name.trim() || teammateNameFromEmail(form.email), title: "", locale };
      const response = await api<{ invite: { token: string; expiresAt: string; delivery: InviteDelivery } }>(`/api/missions/${mission.id}/invites`, { method: "POST", body: JSON.stringify(payload) });
      setInvite({ token: response.invite.token, url: `${window.location.origin}/join/${response.invite.token}`, expiresAt: response.invite.expiresAt, delivery: response.invite.delivery });
      onInvited();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const copy = async () => { if (invite) await navigator.clipboard.writeText(invite.url); };
  const resend = async () => {
    if (!invite) return;
    setBusy(true); setError("");
    try {
      const response = await api<{ delivery: InviteDelivery }>(`/api/invites/${invite.token}/send`, { method: "POST", body: JSON.stringify({ locale }) });
      setInvite({ ...invite, delivery: response.delivery });
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const inviteeName = form.name.trim() || teammateNameFromEmail(form.email);
  const delivered = invite?.delivery.status === "sent";
  return <div className="invite-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-dialog-title">
      <div className="invite-dialog-head"><span><Mail size={18} /></span><div><small>{tr("EMAIL INVITE · 30-SECOND RECAP", "EMAIL 邀請 · 30 秒看懂")}</small><h2 id="invite-dialog-title">{tr("Bring in the person Relay needs.", "把 Relay 現在需要的人找進來。")}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label={tr("Close invite dialog", "關閉邀請視窗")}><X size={18} /></button></div>
      <p className="invite-dialog-intro">{tr("Enter one email. Relay sends a private link with the mission recap, what the team said, and the exact decision or context this person owes.", "輸入 Email 就好。Relay 會寄出私人連結，先說清楚專案、大家說了什麼，以及對方現在要補什麼或決定什麼。")}</p>
      {!invite ? <form className="invite-member-form" onSubmit={createInvite}>
        <label className="invite-email-field">{tr("Teammate email", "同事 Email")}<input autoFocus required type="email" value={form.email} onChange={(event) => setForm({...form, email: event.target.value})} placeholder="alex@company.com"/></label>
        <div className="invite-simple-grid"><label>{tr("Name (optional)", "姓名（可不填）")}<input value={form.name} onChange={(event) => setForm({...form, name: event.target.value})} placeholder={form.email ? teammateNameFromEmail(form.email) : tr("Relay can infer it from email", "Relay 可先從 Email 推測")}/></label><label>{tr("Relay needs them to", "Relay 需要他") }<select value={form.missionRole} onChange={(event) => setForm({...form, missionRole: event.target.value})}><option value="decision_maker">{tr("Make a decision", "做一項決定")}</option><option value="contributor">{tr("Add context or work", "補資訊或協作")}</option><option value="observer">{tr("Stay informed", "掌握進度")}</option></select></label></div>
        <p className="invite-recap-preview"><Sparkles size={17}/><span><b>{tr("What they receive", "對方會收到什麼")}</b>{tr(`“${mission.title}” recap + team voices + their next action + a private join link.`, `「${localizeDomainText(mission.title)}」摘要＋團隊發言＋他要做的下一步＋私人加入連結。`)}</span></p>
        {error && <p className="form-error">{error}</p>}
        <button className="button button-dark button-full button-large" disabled={busy}><Mail size={17}/>{busy ? tr("Sending private invite…", "正在寄出私人邀請…") : tr("Send invite email", "寄出邀請信")}</button>
      </form> : <div className="invite-created">
        {delivered ? <BadgeCheck size={30}/> : <AlertOctagon size={30}/>}<h3>{delivered ? tr(`Invite sent to ${form.email}.`, `邀請已寄到 ${form.email}。`) : tr("The invite is ready, but the email was not delivered.", "邀請已建立，但 Email 尚未寄出。")}</h3>
        <p>{delivered ? tr(`${inviteeName} can open the email, read the 30-second recap, then join with a dedicated AI counterpart.`, `${inviteeName} 打開信後會先看到 30 秒摘要，再帶著專屬 AI 搭檔加入。`) : tr("Relay will never pretend an email was sent. Retry delivery, or copy the private link as a fallback.", "Relay 不會假裝已寄信。你可以重新寄送，或暫時複製私人連結。")}</p>
        <div className={`invite-delivery-receipt ${invite.delivery.status}`}><span>{delivered ? <BadgeCheck size={16}/> : <AlertOctagon size={16}/>}<b>{delivered ? tr("Delivered through Brevo", "已透過 Brevo 投遞") : tr("Delivery needs attention", "寄送需要處理")}</b></span><small>{invite.delivery.messageId ?? invite.delivery.detail ?? tr("No provider receipt", "沒有服務商憑據")}</small></div>
        <label className="invite-link-label"><span>{tr("Individual invite link", "個人邀請連結")}</span><div><Link2 size={15}/><input value={invite.url} readOnly/></div></label>
        <div className="invite-created-actions">{!delivered && <button className="button button-dark" disabled={busy} type="button" onClick={() => { void resend(); }}><Mail size={17}/>{busy ? tr("Retrying…", "重新寄送中…") : tr("Retry email", "重新寄送")}</button>}<button className={delivered ? "button button-dark" : "button button-ghost"} type="button" onClick={() => { void copy(); }}><Copy size={17}/>{tr("Copy private link", "複製私人連結")}</button></div>
        {error && <p className="form-error">{error}</p>}
        <button className="text-link invite-another" type="button" onClick={() => { setInvite(undefined); setForm({...form, email: "", name: ""}); }}>{tr("Invite another teammate", "再邀請一位同事")}</button>
        <p className="invite-privacy"><ShieldCheck size={14}/>{tr(`Single-use · ${form.missionRole} · expires ${formatDate(invite.expiresAt, true)}`, `一次性 · ${localizeLabel(form.missionRole)} · ${formatDate(invite.expiresAt, true)} 到期`)}</p>
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

function MissionAgentRibbon({ mission, collaboration, liveState, onOpenCanvas }: { mission: MissionDetail; collaboration?: CollaborationSnapshot; liveState: "connecting" | "live" | "reconnecting"; onOpenCanvas: () => void }) {
  const activeRuns = collaboration?.runs.filter((run) => ["queued", "running", "pause_requested", "cancel_requested"].includes(run.status)) ?? [];
  const workers = (mission.currentPlan?.tasks ?? []).filter((task) => task.ownerType === "agent").slice(0, 3);
  const currentState = liveState === "reconnecting"
    ? tr("Restoring the mission event stream", "正在恢復 Mission 即時連線")
    : activeRuns.length
      ? tr(`${activeRuns.length} Agents are executing the active plan`, `${activeRuns.length} 個 Agents 正在執行有效計畫`)
      : mission.blockingConflicts
        ? tr("Agents paused safely for a human decision", "Agents 已安全暫停，等待人類決定")
        : tr("Lucy is watching the active contract", "Lucy 正在監看有效合約");
  return <aside className="mission-agent-ribbon" aria-label={tr("Live Agent work", "即時 Agent 工作") }>
    <button className="mission-agent-ribbon-title" type="button" onClick={onOpenCanvas}><span className={`canvas-live-dot ${liveState}`}/><p><small>{tr("LUCY · LIVE CANVAS", "LUCY · 即時白紙")}</small><b>{currentState}</b></p></button>
    <div className="mission-agent-ribbon-runs">{workers.map((task) => { const run = activeRuns.find((item) => item.taskId === task.id); const status = run?.status ?? task.status; return <span key={task.id}><Bot size={14}/><b>{localizeDomainText(task.ownerName)}</b><small>{localizeLabel(status)}</small></span>; })}{!workers.length && <span><Bot size={14}/><b>Lucy</b><small>{tr("ready", "待命中")}</small></span>}</div>
    <button className="mission-agent-ribbon-open" type="button" onClick={onOpenCanvas}>{tr("Open live canvas", "打開即時白紙")}<ArrowRight size={15}/></button>
  </aside>;
}

function MissionArrivalRecap({ preview, mission, onClose, onContinue }: { preview: MissionInvitePreview; mission: MissionDetail; onClose: () => void; onContinue: () => void }) {
  return <div className="arrival-recap-scrim" role="presentation">
    <section className="arrival-recap" role="dialog" aria-modal="true" aria-labelledby="arrival-recap-title">
      <header><div><span>{tr("YOU'RE CAUGHT UP", "你已跟上進度")}</span><h2 id="arrival-recap-title">{tr(`Welcome, ${preview.invitee.name}.`, `${preview.invitee.name}，歡迎加入。`)}</h2></div><button type="button" onClick={onClose} aria-label={tr("Close recap", "關閉摘要")}><X size={20}/></button></header>
      <div className="arrival-recap-mission"><small>MISSION</small><h3>{localizeDomainText(preview.mission.title)}</h3>{preview.mission.objective.trim() !== preview.mission.title.trim() && <p>{localizeDomainText(preview.mission.objective)}</p>}</div>
      <div className="arrival-next"><span><UserRound size={17}/>{tr("RELAY NEEDS YOU TO", "RELAY 現在需要你")}</span><h3>{tr(preview.recap.whatYouNeedToDo.en, preview.recap.whatYouNeedToDo.zhTW)}</h3><small>{tr(`Your counterpart Agent will represent your context, but only you can approve on your behalf.`, `你的專屬 AI 搭檔會代表你的脈絡，但只有你能用自己的身分核准。`)}</small></div>
      <button className="button button-dark button-large button-full arrival-continue-button" type="button" onClick={onContinue}>{mission.openConflicts ? tr("Open my decision", "打開我要處理的決定") : tr("Enter the live mission", "進入即時 Mission")}<ArrowRight size={18}/></button>
      <div className="arrival-recap-state"><span><Activity size={17}/>{tr("WHAT HAPPENED", "目前發生了什麼")}</span><p>{tr(preview.recap.whatHappened.en, preview.recap.whatHappened.zhTW)}</p></div>
      {preview.recap.voices.length > 0 && <section className="arrival-voices"><span>{tr("WHAT THE TEAM SAID", "大家說了什麼")}</span>{preview.recap.voices.slice(0, 3).map((voice, index) => <article key={`${voice.author}-${index}`}><small>{localizeLabel(voice.sourceType)} · {localizeDomainText(voice.author)}</small><p>{localizeDomainText(voice.statement)}</p></article>)}</section>}
    </section>
  </div>;
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
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [arrivalRecap] = useState<MissionInvitePreview | undefined>(() => {
    try {
      const stored = sessionStorage.getItem(`relay_invite_recap:${id}`);
      return stored ? JSON.parse(stored) as MissionInvitePreview : undefined;
    } catch { return undefined; }
  });
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
  useEffect(() => { window.scrollTo(0, 0); }, [view]);
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
  const presentHumans = new Set(collaboration?.presence.map((item) => item.userId)).size;
  const runningAgents = collaboration?.runs.filter((run) => ["queued","running","pause_requested","cancel_requested"].includes(run.status)).length ?? 0;
  return <AppShell><main className={`mission-page view-${view}`}>
    <InviteTeammatesDialog mission={mission} open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={() => { void loadCollaboration(); }} />
    {params.get("welcome") === "1" && arrivalRecap && <MissionArrivalRecap preview={arrivalRecap} mission={mission} onClose={() => setParams({ view: "room" })} onContinue={() => setParams({ view: mission.openConflicts ? "conflicts" : "room" })}/>}
    <header className="mission-header"><div className="mission-topbar">
      <Link to="/app" className="mission-brand" aria-label={tr("Back to workspace", "返回工作區")}><span>RL</span><b>Relay</b></Link>
      <div className="mission-title-compact" title={localizeDomainText(mission.objective)}><small>MISSION</small><h1>{localizeDomainText(mission.title)}</h1></div>
      <button className="mission-plan-control" onClick={() => setParams({ view: "plan" })}><span>{tr("Plan", "計畫")} v{mission.currentPlanVersion}</span><i className={isStale ? "stale" : ""}/><small>{isStale ? localizeLabel("superseded") : tr("Active", "有效")}</small><ChevronDown size={14}/></button>
      <div className="mission-header-spacer"/>
      <div className="mission-live-presence"><span className={`live-signal ${liveState}`}><span/>{liveState === "live" ? tr("LIVE EVENT STREAM", "即時事件流") : tr("RECONNECTING", "重新連線中")}</span><div className="presence-avatars">{(collaboration?.members ?? []).slice(0, 4).map((member) => <span className={collaboration?.presence.some((item) => item.userId === member.user.id) ? "online" : ""} key={member.user.id} title={`${member.user.name} · ${member.user.department}`}>{initials(member.user.name)}</span>)}</div><small>{presentHumans} {tr("human live", "位人類在線")} · {runningAgents} {tr("agents running", "個 Agent 執行中")}</small></div>
      <LanguageSwitcher compact/>
      <button className="button button-dark button-small mission-share" onClick={() => setInviteOpen(true)}><UsersRound size={15}/><span>{tr("Invite", "邀請同事")}</span></button>
      <button className="icon-button mission-refresh" onClick={() => { void refreshAll(); }} aria-label={tr("Refresh mission", "重新整理 Mission")}><RefreshCw size={17}/></button>
      {mission.status === "planning" && <button className="button button-primary button-small mission-compile" disabled={busy === "plan"} onClick={() => action("plan", api<{ mission: MissionDetail }>(`/api/missions/${mission.id}/plan`, { method: "POST", body: "{}" }), tr("A new active contract was created. Previous approvals were invalidated.", "新的有效合約已建立，舊版核准已失效。"))}><GitBranch size={15}/>{tr("Compile", "編譯")} v{mission.currentPlanVersion + 1}</button>}
    </div><nav className="mission-tabs" aria-label={tr("Mission views", "Mission 檢視")}>{missionTabs.map(([key, label, labelZh, Icon], index) => <button className={`${view === key ? "active" : ""} ${index > 2 ? "mission-tab-secondary" : ""}`} key={key} onClick={() => { setMobileMoreOpen(false); setParams({ view: key }); }} title={tr(label, labelZh)} aria-label={tr(label, labelZh)}><Icon size={18}/><span className="mission-tab-label">{tr(label, labelZh)}</span>{key === "conflicts" && mission.openConflicts > 0 && <em>{mission.openConflicts}</em>}{key === "approvals" && mission.pendingApprovals > 0 && <em>{mission.pendingApprovals}</em>}</button>)}<button className={`mission-more-tab ${["access","approvals","evidence","outcome"].includes(view) || mobileMoreOpen ? "active" : ""}`} onClick={() => setMobileMoreOpen((open) => !open)} aria-expanded={mobileMoreOpen} aria-controls="mission-mobile-more"><Menu size={20}/><span className="mission-tab-label">{tr("More", "更多")}</span>{mission.pendingApprovals > 0 && <em>{mission.pendingApprovals}</em>}</button></nav></header>
    {mobileMoreOpen && <div className="mission-mobile-more-scrim" onClick={() => setMobileMoreOpen(false)}><section id="mission-mobile-more" className="mission-mobile-more" aria-label={tr("More mission views", "更多 Mission 檢視")} onClick={(event) => event.stopPropagation()}><header><div><small>{tr("MORE", "更多")}</small><h2>{tr("Mission controls", "Mission 工具")}</h2></div><button type="button" onClick={() => setMobileMoreOpen(false)} aria-label={tr("Close more menu", "關閉更多選單")}><X size={20}/></button></header><div>{missionTabs.slice(3).map(([key, label, labelZh, Icon]) => <button type="button" className={view === key ? "active" : ""} key={key} onClick={() => { setMobileMoreOpen(false); setParams({ view: key }); }}><span><Icon size={20}/></span><p><b>{tr(label, labelZh)}</b><small>{key === "access" ? tr("Connect the tools Agents need", "連接 Agent 需要的工具") : key === "approvals" ? tr("Review exact high-impact actions", "檢查高影響操作") : key === "evidence" ? tr("See sources and every recorded change", "查看來源與所有變更") : tr("Verify whether the mission succeeded", "驗收 Mission 是否成功")}</small></p>{key === "approvals" && mission.pendingApprovals > 0 ? <em>{mission.pendingApprovals}</em> : <ArrowRight size={18}/>}</button>)}</div></section></div>}
    {(notice || error) && <div className={`toast-banner ${error ? "error" : ""}`}>{error ? <AlertOctagon size={17} /> : <BadgeCheck size={17} />}<span>{error || notice}</span><button className="icon-button" onClick={() => { setError(""); setNotice(""); }}><X size={15} /></button></div>}
    {view !== "room" && <MissionAgentRibbon mission={mission} collaboration={collaboration} liveState={liveState} onOpenCanvas={() => setParams({ view: "room" })}/>}
    <div className={`mission-content mission-content-${view}`}>{view === "room" && <MissionRoom mission={mission} collaboration={collaboration} action={action} busy={busy} setView={(next) => setParams({ view: next })} onInvite={() => setInviteOpen(true)} onRefresh={refreshAll} liveState={liveState}/>} {view === "conflicts" && <ConflictInbox mission={mission} action={action} busy={busy} setView={(next) => setParams({ view: next })}/>} {view === "plan" && <PlanView mission={mission} action={action} busy={busy}/>} {view === "access" && <AccessView mission={mission} onRefresh={refreshAll}/>} {view === "approvals" && <ApprovalCenter mission={mission} action={action} busy={busy} isStale={isStale}/>} {view === "evidence" && <EvidenceLedger mission={mission}/>} {view === "outcome" && <OutcomeView mission={mission} action={action} busy={busy}/>}</div>
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

function MissionRoom({ mission, collaboration, action, busy, setView, onInvite = () => undefined, onRefresh = async () => undefined, liveState = "live", readOnly = false }: { mission: MissionDetail; collaboration?: CollaborationSnapshot; action: MissionAction; busy: string; setView: (view: string) => void; onInvite?: () => void; onRefresh?: () => Promise<void>; liveState?: "connecting" | "live" | "reconnecting"; readOnly?: boolean }) {
  const session = useSessionIdentity();
  const openConflicts = mission.conflicts.filter((conflict) => conflict.status === "open");
  const primaryConflict = openConflicts.find((conflict) => conflict.type === "Hard conflict") ?? openConflicts.find((conflict) => conflict.blocking) ?? openConflicts[0];
  const [selectedConflictId, setSelectedConflictId] = useState(primaryConflict?.id ?? "");
  const [correction, setCorrection] = useState("");
  const [correctionAuthor, setCorrectionAuthor] = useState(mission.createdBy);
  const [selectedActionNode, setSelectedActionNode] = useState<MissionFlowNode>();
  const [councilBusy, setCouncilBusy] = useState(false);
  const [councilError, setCouncilError] = useState("");
  const [mobileCanvasOpen, setMobileCanvasOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (session?.actorName) setCorrectionAuthor(session.actorName); }, [session?.actorName]);
  const [inspectorOpen, setInspectorOpen] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 760px)").matches);
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

  const members: MissionMember[] = collaboration?.members?.length ? collaboration.members : [{ user: { id: "mission-owner", name: mission.createdBy, email: "", department: "Other", identitySource: "relay_session", identityVerified: false }, role: "owner", responsibility: "Mission outcome", joinedAt: mission.createdAt }];
  const activePresence = new Set((collaboration?.presence ?? []).map((item) => item.userId));
  const counterpartFor = (member: MissionMember) => collaboration?.agents.find((agent) => agent.capabilities.includes(`represent:${member.user.id}`));
  const councilEvent = [...(collaboration?.events ?? [])].reverse().find((event) => event.eventType === "agent_council.minutes_created");
  const councilMinutes = councilEvent?.data as { representedHumans?: Array<{ name: string }>; decisionsNeeded?: Array<{ title: string; owner: string }>; nextActions?: Array<{ key: string; title: string; owner: string; status: string }>; delivery?: string } | undefined;

  const actualAgentTasks = plan?.tasks.filter((task) => task.ownerType === "agent").slice(0, 3) ?? [];
  const fallbackAgents = [
    { name: "Planning Agent", title: tr("Build the execution plan", "建立專案計畫與時程"), status: "pending" },
    { name: "Operations Agent", title: tr("Prepare governed operations", "準備受治理的執行工作"), status: "blocked" },
    { name: "Evidence Agent", title: tr("Collect outcome evidence", "蒐集證據與成果指標"), status: "pending" },
  ];
  const workerAgents = fallbackAgents.map((fallback, index) => {
    const task = actualAgentTasks[index];
    const progress = task?.status === "completed" ? 100 : task?.status === "running" ? 62 : task?.status === "ready" ? 18 : 0;
    const run = collaboration?.runs.find((item) => item.taskId === task?.id);
    return { id: task?.id ?? `fallback-agent-${index}`, name: task ? localizeDomainText(task.ownerName) : fallback.name, title: task ? localizeDomainText(task.title) : fallback.title, status: run?.status ?? task?.status ?? fallback.status, progress: run?.progress ?? progress };
  });

  const compactCanvas = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  const desktopFlowNodes: MissionFlowNode[] = [
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
      data: { variant: "conflict", title: openConflicts.length ? tr(`${openConflicts.length} blocking conflicts`, `${openConflicts.length} 項阻擋衝突`) : tr("Intent resolved", "意圖已收斂"), meta: tr("CONFLICT / DECISION", "衝突／決策"), detail: selectedConflict ? localizeDomainText(selectedConflict.title) : tr("No incompatible instruction remains.", "目前沒有互不相容的指令。"), status: openConflicts.length ? "blocked" : "completed", accent: openConflicts.length ? "red" : "lime", conflictId: selectedConflict?.id, actionHref: !readOnly && openConflicts.length ? `/missions/${mission.id}?view=conflicts` : undefined, actionLabel: tr("Open decision", "打開決定") },
    },
    {
      id: "lucy-lead", type: "missionNode", position: { x: 535, y: 275 },
      data: { variant: "agent", title: "Lucy", meta: tr("YOUR AI MISSION PARTNER", "你的 AI MISSION 搭檔"), detail: openConflicts.length ? tr("Keeps every viewpoint visible, pauses risky work and asks the right person one clear question", "記住每個人的立場、停住風險，只向正確的人問一個清楚問題") : tr("Coordinates every human counterpart, worker Agent, approval and sign-off", "協調每位人類的 counterpart、Worker Agent、核准與 sign-off"), status: openConflicts.length ? "waiting_on_human" : "running", progress: openConflicts.length ? 36 : 68, accent: "lime" },
    },
    ...members.map((member, index) => ({
      id: `human-${member.user.id}`, type: "missionNode" as const, position: { x: 785, y: 45 + index * 175 },
      data: { variant: "human" as const, title: member.user.name, meta: `${localizeLabel(member.user.department ?? "Team")} · ${localizeLabel(member.role)}`, detail: member.responsibility || tr("Human judgment and lived context", "人類判斷與真實脈絡"), status: activePresence.has(member.user.id) ? "live" : selectedConflict?.decisionOwner.includes(member.user.name) ? "decision_needed" : "informed", accent: "violet" as const },
    })),
    ...members.map((member, index) => {
      const counterpart = counterpartFor(member);
      return {
        id: `counterpart-${member.user.id}`, type: "missionNode" as const, position: { x: 1040, y: 45 + index * 175 },
        data: { variant: "agent" as const, title: counterpart?.name ?? `Proxy · ${member.user.name}`, meta: tr("PERSONAL AI COUNTERPART", "專屬 AI COUNTERPART"), detail: tr(`Carries ${member.user.name}'s goals and constraints into the Agent Council; never borrows approval authority.`, `替 ${member.user.name} 把目標與限制帶進 Agent Council；永遠不冒用核准權。`), status: councilBusy ? "meeting" : councilEvent ? "informed" : "listening", progress: councilEvent ? 100 : 28, accent: "blue" as const },
      };
    }),
    {
      id: "agent-council", type: "missionNode", position: { x: 1305, y: 275 },
      data: { variant: "agent", title: tr("Agent Council", "Agent Council 代理人會議"), meta: tr("NO HUMAN MEETING REQUIRED", "人類不用開會"), detail: councilEvent ? tr("Counterparts aligned the team and saved meeting minutes to this live Mission.", "Counterparts 已對齊團隊，並把會議紀錄存進這個即時 Mission。") : tr("Counterpart Agents compare goals, surface conflicts and prepare one shared record.", "每人的 counterpart Agents 彼此比對目標、找出矛盾並產生共同紀錄。"), status: councilBusy ? "running" : councilEvent ? "minutes_ready" : "ready", progress: councilBusy ? 62 : councilEvent ? 100 : 12, accent: "lime" },
    },
    ...workerAgents.map((agent, index) => ({
      id: `agent-${agent.id}`, type: "missionNode" as const, position: { x: 1570, y: 85 + index * 190 },
      data: { variant: "agent" as const, title: agent.name, meta: tr("AI EXECUTION", "AI 執行"), detail: agent.title, status: openConflicts.length && agent.status !== "completed" ? "blocked" : agent.status, progress: agent.progress, accent: "blue" as const },
    })),
    {
      id: "outcome", type: "missionNode", position: { x: 1845, y: 275 },
      data: { variant: "outcome", title: tr("Mission outcome", "Mission 成果"), meta: tr("VERIFIABLE RESULT", "可驗收成果"), detail: localizeDomainText(mission.successMetric), status: mission.outcome?.status ?? "not_started", accent: "lime" },
    },
  ];

  const compactFlowNodes: MissionFlowNode[] = [
    { id: "mission-brief", type: "missionNode", position: { x: 24, y: 170 }, data: { variant: "intent", title: tr("Everyone's goals and constraints", "所有人的目標與限制"), meta: `${mission.sources.length} ${tr("SOURCES RECONCILED", "個來源已整理")}`, detail: tr("Relay keeps the source of every instruction.", "Relay 保留每一條指令的來源。"), status: "verified", accent: "lime", addable: true } },
    { id: "conflict-hub", type: "missionNode", position: { x: 344, y: 170 }, data: { variant: "conflict", title: openConflicts.length ? tr(`${openConflicts.length} decisions need people`, `${openConflicts.length} 項需要人決定`) : tr("Team intent aligned", "團隊意圖已對齊"), meta: tr("DECISION GATE", "決策閘門"), detail: selectedConflict ? localizeDomainText(selectedConflict.title) : tr("No incompatible instruction remains.", "目前沒有互相矛盾的指令。"), status: openConflicts.length ? "blocked" : "completed", accent: openConflicts.length ? "red" : "lime", conflictId: selectedConflict?.id, addable: false, actionHref: !readOnly && openConflicts.length ? `/missions/${mission.id}?view=conflicts` : undefined, actionLabel: tr("Open decision", "打開決定") } },
    { id: "lucy-lead", type: "missionNode", position: { x: 664, y: 170 }, data: { variant: "agent", title: "Lucy", meta: tr("MISSION PARTNER", "MISSION 搭檔"), detail: openConflicts.length ? tr("Paused only risky work and found the right decision owner.", "只停住有風險的工作，並找到正確決策者。") : tr("Keeping humans, Agents and the active plan synchronized.", "持續同步人類、Agents 與有效計畫。"), status: openConflicts.length ? "waiting_on_human" : "running", progress: openConflicts.length ? 36 : 68, accent: "blue", addable: true } },
    { id: "team-pairs", type: "missionNode", position: { x: 984, y: 170 }, data: { variant: "human", title: tr(`${members.length} people + ${members.length} AI counterparts`, `${members.length} 位同事＋${members.length} 位專屬 AI`), meta: tr("EVERYONE STAYS INFORMED", "所有人持續同步"), detail: tr("Each counterpart carries one person's goals—never their approval authority.", "每位搭檔只代表一個人的目標，不會冒用核准權。"), status: members.some((member) => activePresence.has(member.user.id)) ? "live" : "informed", accent: "violet", addable: true } },
    { id: "agent-council", type: "missionNode", position: { x: 1304, y: 170 }, data: { variant: "agent", title: tr("Counterpart meeting", "AI 搭檔會議"), meta: tr("NO HUMAN MEETING", "人類不用開會"), detail: councilEvent ? tr("Goals aligned and minutes saved.", "目標已對齊，會議紀錄已保存。") : tr("Agents compare every person's goals and return only decisions.", "Agents 彼此比對每個人的目標，只把決定帶回來。"), status: councilBusy ? "running" : councilEvent ? "minutes_ready" : "ready", progress: councilBusy ? 62 : councilEvent ? 100 : 12, accent: "blue", addable: true } },
    { id: "execution-team", type: "missionNode", position: { x: 1624, y: 170 }, data: { variant: "agent", title: tr(`${workerAgents.length} execution Agents`, `${workerAgents.length} 個執行 Agents`), meta: tr("SAFE EXECUTION", "安全執行"), detail: openConflicts.length ? tr("Waiting safely for the team decision.", "正在安全等待團隊決定。") : tr("Working through verified tools and checkpoints.", "透過已驗證工具與 Checkpoint 執行。"), status: openConflicts.length ? "blocked" : workerAgents.some((agent) => agent.status === "running") ? "running" : "ready", progress: Math.round(workerAgents.reduce((sum, agent) => sum + agent.progress, 0) / Math.max(workerAgents.length, 1)), accent: "blue", addable: true } },
    { id: "outcome", type: "missionNode", position: { x: 1944, y: 170 }, data: { variant: "outcome", title: tr("Mission complete", "Mission 完成"), meta: tr("PROOF + SIGN-OFF", "成果＋SIGN-OFF"), detail: localizeDomainText(mission.successMetric), status: mission.outcome?.status ?? "not_started", accent: "lime", addable: false } },
  ];
  const flowNodes = compactCanvas ? compactFlowNodes : desktopFlowNodes;

  const arrowClosed = "arrowclosed" as MarkerType;
  const edgeBase = { type: "smoothstep", markerEnd: { type: arrowClosed, width: 14, height: 14 }, pathOptions: { borderRadius: 18 } };
  const desktopFlowEdges: Edge[] = [
    ...visibleAssertions.map((assertion) => ({ id: `edge-${assertion.id}-conflict`, source: `intent-${assertion.id}`, target: "conflict-hub", animated: selectedAssertionIds.has(assertion.id), style: { stroke: selectedAssertionIds.has(assertion.id) ? "#ef5b55" : "#b9bbb7", strokeWidth: selectedAssertionIds.has(assertion.id) ? 2 : 1.3 }, markerEnd: { type: arrowClosed, color: selectedAssertionIds.has(assertion.id) ? "#ef5b55" : "#b9bbb7", width: 14, height: 14 }, type: edgeBase.type, pathOptions: edgeBase.pathOptions })),
    { id: "edge-conflict-lucy", source: "conflict-hub", target: "lucy-lead", animated: Boolean(openConflicts.length), style: { stroke: openConflicts.length ? "#ef5b55" : "#82a43d", strokeWidth: 2 }, markerEnd: { type: arrowClosed, color: openConflicts.length ? "#ef5b55" : "#82a43d", width: 14, height: 14 }, type: edgeBase.type, pathOptions: edgeBase.pathOptions },
    ...members.map((member) => ({ id: `edge-lucy-human-${member.user.id}`, source: "lucy-lead", target: `human-${member.user.id}`, animated: activePresence.has(member.user.id), style: { stroke: "#8b73dc", strokeWidth: 1.4 }, markerEnd: { type: arrowClosed, color: "#8b73dc", width: 14, height: 14 }, type: edgeBase.type, pathOptions: edgeBase.pathOptions })),
    ...members.map((member) => ({ id: `edge-human-counterpart-${member.user.id}`, source: `human-${member.user.id}`, target: `counterpart-${member.user.id}`, animated: activePresence.has(member.user.id), style: { stroke: "#4175d6", strokeWidth: 1.6 }, markerEnd: { type: arrowClosed, color: "#4175d6", width: 14, height: 14 }, type: edgeBase.type, pathOptions: edgeBase.pathOptions })),
    ...members.map((member) => ({ id: `edge-counterpart-council-${member.user.id}`, source: `counterpart-${member.user.id}`, target: "agent-council", animated: councilBusy, style: { stroke: councilEvent ? "#82a43d" : "#9fa49c", strokeWidth: 1.5 }, markerEnd: { type: arrowClosed, color: councilEvent ? "#82a43d" : "#9fa49c", width: 14, height: 14 }, type: edgeBase.type, pathOptions: edgeBase.pathOptions })),
    ...workerAgents.map((agent) => ({ id: `edge-council-${agent.id}`, source: "agent-council", target: `agent-${agent.id}`, animated: !openConflicts.length && agent.status === "running", style: { stroke: openConflicts.length ? "#c7c8c4" : "#4175d6", strokeDasharray: openConflicts.length ? "5 5" : undefined, strokeWidth: 1.5 }, markerEnd: { type: arrowClosed, color: openConflicts.length ? "#c7c8c4" : "#4175d6", width: 14, height: 14 }, type: edgeBase.type, pathOptions: edgeBase.pathOptions })),
    ...workerAgents.map((agent) => ({ id: `edge-${agent.id}-outcome`, source: `agent-${agent.id}`, target: "outcome", style: { stroke: "#c7c8c4", strokeDasharray: "5 5", strokeWidth: 1.2 }, markerEnd: { type: arrowClosed, color: "#c7c8c4", width: 14, height: 14 }, type: edgeBase.type, pathOptions: edgeBase.pathOptions })),
  ];
  const compactFlowEdges: Edge[] = ["mission-brief", "conflict-hub", "lucy-lead", "team-pairs", "agent-council", "execution-team", "outcome"].slice(0, -1).map((source, index) => {
    const target = ["mission-brief", "conflict-hub", "lucy-lead", "team-pairs", "agent-council", "execution-team", "outcome"][index + 1];
    const blockedEdge = source === "mission-brief" || source === "conflict-hub";
    const stroke = openConflicts.length && blockedEdge ? "#c2211a" : "#989898";
    return { id: `compact-${source}-${target}`, source, target, animated: source === "lucy-lead" || councilBusy, style: { stroke, strokeWidth: 1.7 }, markerEnd: { type: arrowClosed, color: stroke, width: 14, height: 14 }, type: edgeBase.type, pathOptions: edgeBase.pathOptions } as Edge;
  });
  const flowEdges = compactCanvas ? compactFlowEdges : desktopFlowEdges;

  const submitCorrection = (event: FormEvent) => {
    event.preventDefault();
    if (readOnly || correction.trim().length < 5) return;
    action("correction", api<{ mission: MissionDetail }>(`/api/missions/${mission.id}/corrections`, { method: "POST", body: JSON.stringify({ statement: correction.trim(), assertionType: "Constraint" }) }), tr("Named correction recorded. The shared room, active contract and prior approvals were updated.", "具名修正已記錄；共同控制室、目前合約與舊有核准已更新。" )).then((result) => { if (result) setCorrection(""); });
  };

  const runAgentCouncil = async () => {
    if (readOnly || councilBusy) return;
    setCouncilBusy(true); setCouncilError("");
    try {
      await api(`/api/missions/${mission.id}/agent-council`, { method: "POST", body: "{}" });
      await onRefresh();
    } catch (error) {
      setCouncilError((error as Error).message);
    } finally {
      setCouncilBusy(false);
    }
  };

  const attachContextFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || readOnly) return;
    const content = (await file.text()).trim();
    if (!content) { setCouncilError(tr("That file contains no readable text.", "這個檔案沒有可讀文字。")); return; }
    const statement = `${tr("Attached file", "附加檔案")} · ${file.name}\n${content.slice(0, 4_000)}`;
    await action("attachment", api<{ mission: MissionDetail }>(`/api/missions/${mission.id}/corrections`, { method: "POST", body: JSON.stringify({ statement, assertionType: "Constraint" }) }), tr("File context was attached and the active contract was stopped for safe replanning.", "檔案脈絡已加入；目前合約已安全停止並等待重新規劃。"));
    setSelectedActionNode(undefined);
  };

  const recommendedResolution = selectedConflict?.options.find((option) => option.recommended);
  const recentEvents = (collaboration?.events?.length ? collaboration.events : mission.auditEvents).slice(-3).reverse();
  const runningWorkerCount = workerAgents.filter((agent) => ["queued", "running", "pause_requested", "cancel_requested"].includes(agent.status)).length;
  const latestCanvasEvent = recentEvents[0];
  const canvasState = liveState === "reconnecting"
    ? tr("Restoring the live event stream…", "正在恢復即時事件流…")
    : councilBusy
      ? tr("Counterpart Agents are aligning now", "Counterpart Agents 正在彼此對齊")
      : selectedConflict
        ? tr("Agents paused safely for one human decision", "Agents 已安全暫停，等待一項人類決定")
        : runningWorkerCount
          ? tr(`${runningWorkerCount} Agents are executing now`, `${runningWorkerCount} 個 Agents 正在執行`)
          : tr("Agents are monitoring the active contract", "Agents 正在監看有效合約");

  return <div className={`flow-canvas-layout ${inspectorOpen ? "" : "inspector-collapsed"} ${mobileCanvasOpen ? "mobile-canvas-visible" : ""}`}>
    <section className="mobile-mission-journey" aria-label={tr("Mobile mission execution story", "手機版 Mission 執行流程")}>
      <div className="mobile-room-hero"><div><span className="mobile-live"><span /> {tr("LIVE MISSION", "即時 MISSION")}</span><small>{tr(`Plan v${mission.currentPlanVersion}`, `計畫 v${mission.currentPlanVersion}`)}</small></div><h1>{selectedConflict ? tr("One decision unlocks the team.", "只差一個決定，團隊就能繼續。") : tr("The team is aligned. Agents can keep moving.", "團隊已對齊，Agents 可以繼續。")}</h1><p>{selectedConflict ? tr("Relay paused only the affected work and found the person who should decide. Everyone else stays informed.", "Relay 只停住受影響的工作，也找到了該做決定的人；其他人會持續收到進度。") : tr("You only need to step in when Relay asks for judgment or permission.", "只有 Relay 需要判斷或授權時，你才需要出手。")}</p></div>

      <div className="mobile-now-stack">
        {selectedConflict ? <article className="mobile-next-action"><div className="mobile-next-action-head"><span><AlertOctagon size={18}/>{tr("NEEDS A HUMAN DECISION", "需要人類決定")}</span><em>{openConflicts.length}</em></div><h2>{localizeDomainText(selectedConflict.title)}</h2><p>{localizeDomainText(recommendedResolution?.description ?? selectedConflict.summary)}</p><div className="mobile-decision-owner"><span className="decision-avatar"><UserRound size={18}/></span><p><small>{tr("WHO SHOULD DECIDE", "該由誰決定")}</small><b>{localizeDomainText(selectedConflict.decisionOwner)}</b></p></div><button className="button button-primary button-full" onClick={() => setView(readOnly ? "new" : "conflicts")}><ShieldCheck size={18}/>{readOnly ? tr("Try this with my mission", "用我的 Mission 試試看") : tr("Review and decide", "查看並做決定")}<ArrowRight size={18}/></button><small>{tr(`${workerAgents.length} Agent tasks are waiting safely—not failed.`, `${workerAgents.length} 個 Agent 任務正在安全等待，並不是失敗。`)}</small></article> : <article className="mobile-next-action clear"><div className="mobile-next-action-head"><span><BadgeCheck size={18}/>{tr("READY FOR SAFE EXECUTION", "已可安全執行")}</span></div><h2>{tr("Nothing needs your attention right now.", "現在沒有事情需要你處理。")}</h2><p>{tr("Open the plan only if you want to inspect what Agents will do next.", "想檢查 Agents 接下來會做什麼，再打開計畫即可。")}</p><button className="button button-primary button-full" onClick={() => setView("plan")}>{tr("See the execution plan", "查看執行計畫")}<ArrowRight size={18}/></button></article>}

        <section className="mobile-agent-work"><header><div><span>{tr("AI TEAM", "AI 團隊")}</span><h2>{tr("What the Agents are doing", "Agents 現在在做什麼")}</h2></div><button type="button" disabled={readOnly || councilBusy} onClick={() => { void runAgentCouncil(); }}>{councilBusy ? <span className="loader small"/> : <MessageSquareWarning size={17}/>}<span>{councilEvent ? tr("Align again", "再次對齊") : tr("Let Agents align", "讓 Agents 對齊")}</span></button></header><div>{workerAgents.map((agent) => <article key={agent.id}><span className="mobile-agent-avatar"><Bot size={18}/><i className={agent.status === "running" ? "live" : ""}/></span><p><b>{agent.name}</b><small>{agent.title}</small></p><div><em>{localizeLabel(openConflicts.length && agent.status !== "completed" ? "waiting_on_human" : agent.status)}</em><span><i style={{ width: `${Math.max(agent.progress, 6)}%` }}/></span></div></article>)}</div></section>

        <section className="mobile-team-status"><header><div><span>{tr("YOUR TEAM", "你的團隊")}</span><h2>{tr("Everyone stays informed", "每個人都會收到進度")}</h2></div>{!readOnly && <button type="button" onClick={onInvite}><UsersRound size={17}/>{tr("Invite", "邀請")}</button>}</header><div>{members.slice(0, 5).map((member) => <article key={member.user.id}><span className={activePresence.has(member.user.id) ? "online" : ""}>{initials(member.user.name)}</span><p><b>{member.user.name}</b><small>{localizeLabel(member.user.department ?? member.role)}</small></p><em>{counterpartFor(member) ? tr("AI paired", "已有 AI 搭檔") : tr("Informed", "已同步")}</em></article>)}</div></section>

        <section className="mobile-recent-activity"><header><span>{tr("RECENT ACTIVITY", "最新進度")}</span><small><span/>{tr("updates automatically", "自動更新")}</small></header>{recentEvents.length ? recentEvents.map((event) => <article key={event.id}><span className={`activity-actor ${event.actorType}`}>{event.actorType === "human" ? <UserRound size={15}/> : event.actorType === "agent" ? <Bot size={15}/> : <Blocks size={15}/>}</span><p><b>{localizeDomainText(event.actorName)}</b><span>{localizeDomainText(event.summary)}</span><small>{formatDate(event.createdAt, true)}</small></p></article>) : <p className="mobile-activity-empty">{tr("The next human or Agent update will appear here.", "下一筆人類或 Agent 進度會顯示在這裡。")}</p>}</section>

        {!readOnly && <form className="mobile-lucy-command" onSubmit={submitCorrection}><span><Zap size={18}/></span><input aria-label={tr("Message Lucy", "告訴 Lucy")} value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder={tr("Tell Lucy what changed…", "告訴 Lucy 哪裡有變動…")} /><button type="submit" disabled={correction.trim().length < 5 || busy === "correction"} aria-label={tr("Send correction to Lucy", "送出給 Lucy")}>{busy === "correction" ? <span className="loader small"/> : <Send size={18}/>}</button></form>}
      </div>
    </section>
    <section className="flow-canvas" aria-label={tr("Mission execution canvas", "Mission 執行 Canvas")}>
      <div className="mobile-canvas-bar">
        <div className="mobile-canvas-live"><span className={`canvas-live-dot ${liveState}`}/><p><small>{tr("RELAY LIVE CANVAS", "RELAY 即時白紙")}</small><b>{canvasState}</b>{latestCanvasEvent && <em>{localizeDomainText(latestCanvasEvent.actorName)} · {tr("Mission state updated", "Mission 狀態已更新")}</em>}</p></div>
        <button type="button" onClick={() => setMobileCanvasOpen((open) => !open)} aria-label={mobileCanvasOpen ? tr("Close full screen canvas", "關閉全螢幕白紙") : tr("Open full screen canvas", "全螢幕查看白紙")}>{mobileCanvasOpen ? <X size={19}/> : <Maximize2 size={19}/>}<span>{mobileCanvasOpen ? tr("Back", "返回") : tr("Expand", "放大")}</span></button>
      </div>
      <div className="flow-stage-labels" aria-hidden="true"><span>{tr("Evidence", "證據")}<small>{tr("What everyone said", "大家說過的話")}</small></span><span>Lucy<small>{tr("Mission partner", "Mission 搭檔")}</small></span><span>{tr("People + counterparts", "人類＋專屬 AI")}<small>{tr("One pair per teammate", "每位同事一組")}</small></span><span>{tr("Agent Council", "代理人會議")}<small>{tr("No human meeting", "人類不用開會")}</small></span><span>{tr("AI execution", "AI 執行")}<small>{tr("Work through verified tools", "透過已驗證工具工作")}</small></span><span>{tr("Outcome", "成果")}<small>{tr("Everyone signs off", "全員 sign off")}</small></span></div>
      <div className={`agent-council-dock ${councilEvent ? "complete" : ""}`}><span><Bot size={16}/><i/></span><p><small>{councilBusy ? tr("AGENTS ARE MEETING NOW", "AGENTS 正在開會") : councilEvent ? tr("LATEST AGENT MEETING", "最新 AGENT 會議") : tr("SKIP THE HUMAN MEETING", "省下人類會議")}</small><b>{councilEvent ? tr(`${members.length} viewpoints aligned · minutes saved`, `${members.length} 個立場已對齊 · 紀錄已保存`) : tr("Let every counterpart Agent align first", "先讓每人的 counterpart Agent 彼此對齊")}</b></p><button type="button" disabled={readOnly || councilBusy} onClick={() => { void runAgentCouncil(); }}>{councilBusy ? <span className="loader small"/> : <MessageSquareWarning size={15}/>} {councilEvent ? tr("Meet again", "再對齊一次") : tr("Let Agents meet", "讓 Agents 開會")}</button></div>
      <p className="mobile-canvas-gesture">{tr("Swipe right to follow the work · pinch to see the big picture", "向右滑看完整執行路徑 · 雙指縮放看全貌")}</p>
      <Suspense fallback={<div className="flow-loading"><span className="loader" /><p>{tr("Opening execution canvas…", "正在開啟執行 Canvas…")}</p></div>}><ExecutionFlowCanvas nodes={flowNodes} edges={flowEdges} onConflictSelect={setSelectedConflictId} onNodeAction={(node) => { if (node.data.conflictId) { if (!readOnly) setView("conflicts"); return; } if (!readOnly) setSelectedActionNode(node); }} /></Suspense>
      <input ref={fileInputRef} className="visually-hidden" type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" onChange={(event) => { void attachContextFile(event); }}/>
      {selectedActionNode && <aside className="flow-add-menu" aria-label={tr("Add to selected mission block", "加入選取的 Mission 區塊")}><header><div><small>{tr("ADD TO THIS BLOCK", "加入這個區塊")}</small><b>{selectedActionNode.data.title}</b></div><button type="button" onClick={() => setSelectedActionNode(undefined)} aria-label={tr("Close add menu", "關閉新增選單")}><X size={16}/></button></header><p>{tr("Everyone in this Mission can add context. Relay records who changed what and stops stale work before replanning.", "Mission 裡的每個人都能補充脈絡；Relay 會記錄誰改了什麼，並在重新規劃前停住過期工作。")}</p><div><button type="button" onClick={() => { setSelectedActionNode(undefined); onInvite(); }}><span><UsersRound size={17}/></span><b>{tr("Invite a teammate", "邀請人類同事")}</b><small>{tr("They automatically receive a counterpart Agent", "加入後自動獲得專屬 AI counterpart")}</small></button><button type="button" onClick={() => { setSelectedActionNode(undefined); setView("access"); }}><span><KeyRound size={17}/></span><b>{tr("Connect a plugin or tool", "連接 Plugin 或工具")}</b><small>{tr("OAuth, scoped access and live verification", "OAuth、範圍權限與真實驗證")}</small></button><button type="button" onClick={() => fileInputRef.current?.click()}><span><FileText size={17}/></span><b>{tr("Attach a context file", "加入檔案")}</b><small>{tr("Text, Markdown, CSV or JSON; triggers safe replan", "文字、Markdown、CSV 或 JSON；加入後安全重規劃")}</small></button><button type="button" onClick={() => { setCorrection(`${tr("New task from", "從這個區塊新增任務")} “${selectedActionNode.data.title}”: `); setSelectedActionNode(undefined); }}><span><RouteIcon size={17}/></span><b>{tr("Add a task", "新增任務")}</b><small>{tr("Tell Lucy what must happen next", "告訴 Lucy 下一步必須完成什麼")}</small></button></div><footer><Bot size={14}/>{tr("Counterpart Agents can prepare and discuss. Only humans keep approval authority.", "Counterpart Agents 可以準備與討論；核准權永遠留在人類手上。")}</footer></aside>}
      {(councilError || (councilMinutes && councilEvent)) && <aside className={`agent-council-receipt ${councilError ? "error" : ""}`}>{councilError ? <><button type="button" onClick={() => setCouncilError("")} aria-label={tr("Dismiss Agent Council error", "關閉 Agent Council 錯誤")}><X size={14}/></button><p>{councilError}</p></> : <><span><BadgeCheck size={14}/>{tr("AGENT MEETING MINUTES SAVED", "AGENT 會議紀錄已保存")}</span><b>{tr(`${councilMinutes?.representedHumans?.length ?? members.length} humans represented · ${councilMinutes?.decisionsNeeded?.length ?? 0} decisions need people`, `${councilMinutes?.representedHumans?.length ?? members.length} 位人類已被代表 · ${councilMinutes?.decisionsNeeded?.length ?? 0} 項決策需要人類`)}</b><small>{tr("Delivery to Gmail or Slack stays locked until that connector is verified and the exact send is approved.", "寄到 Gmail 或 Slack 前，仍須完成 connector 驗證與精確寄送核准。")}</small></>}</aside>}
      <form className="flow-command" onSubmit={submitCorrection}><label className="flow-command-author"><UserRound size={14} /><input aria-label={tr("Verified correction author", "已驗證的修正者")} value={correctionAuthor} readOnly /></label><Zap size={17} /><input aria-label={tr("Add a human correction", "加入人工修正")} value={correction} disabled={readOnly} onChange={(event) => setCorrection(event.target.value)} placeholder={readOnly ? tr("Read-only example · create a mission to add corrections", "唯讀範例 · 建立自己的 Mission 後即可修正") : tr("Message Lucy or add a team correction…", "告訴 Lucy，或加入團隊修正…")} /><kbd>⌘ ↵</kbd><button type="submit" disabled={readOnly || correction.trim().length < 5 || correctionAuthor.trim().length < 1 || busy === "correction"} aria-label={tr("Submit correction and replan", "送出修正並重新規劃")}>{busy === "correction" ? <span className="loader small" /> : <Send size={17} />}</button></form>
      {!inspectorOpen && <button className="flow-inspector-open" onClick={() => setInspectorOpen(true)} aria-label={tr("Open conflict inspector", "開啟衝突檢視")}><PanelRightOpen size={18} /><span>{mission.blockingConflicts}</span></button>}
    </section>
    {inspectorOpen && <aside className="flow-inspector"><div className="flow-inspector-head"><div><span>{selectedConflict ? tr("SELECTED CONFLICT", "已選取衝突") : tr("CONTRACT STATE", "合約狀態")}</span><h2>{selectedConflict ? tr(`${mission.blockingConflicts} blocking conflicts`, `${mission.blockingConflicts} 項阻擋衝突`) : tr("Execution can proceed", "執行可以繼續")}</h2></div><button className="icon-button" onClick={() => setInspectorOpen(false)} aria-label={tr("Close inspector", "關閉檢視")}><PanelRightClose size={18} /></button></div>
      <div className="compiler-receipt"><span>{tr("COMPILER RECEIPT", "編譯器憑據")}</span><div><b>{mission.sources.length}</b><small>{tr("sources", "個來源")}</small></div><div><b>{mission.assertions.length}</b><small>{tr("assertions", "項主張")}</small></div><div><b>{mission.conflicts.length}</b><small>{tr("conflicts", "項衝突")}</small></div><div><b>{mission.auditEvents.length}</b><small>{tr("audit events", "筆稽核事件")}</small></div><p><FileCheck2 size={13} /> {tr("MVP ruleset · every result links to stored source text", "MVP 規則集 · 每個結果都連回已保存的來源文字")}</p></div>
      <section className="flow-activity-feed"><div className="flow-activity-title"><span>{tr("LIVE ACTIVITY", "即時活動")}</span><small><span /> {tr("SSE + persisted lineage", "SSE ＋ 已保存 Lineage")}</small></div>{(collaboration?.events?.length ? collaboration.events : mission.auditEvents).slice(-5).reverse().map((event) => <div className="flow-activity-event" key={event.id}><span className={`activity-actor ${event.actorType}`}>{event.actorType === "human" ? <UserRound size={13} /> : event.actorType === "agent" ? <Bot size={13} /> : <Blocks size={13} />}</span><div><b>{localizeDomainText(event.actorName)}</b><p>{localizeDomainText(event.summary)}</p></div><time>{formatDate(event.createdAt, true)}</time></div>)}{!(collaboration?.events?.length || mission.auditEvents.length) && <p className="flow-activity-empty">{tr("The first human or agent event will appear here.", "第一筆人類或 Agent 活動會顯示在這裡。")}</p>}</section>
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

function ConflictInbox({ mission, action, busy, setView }: { mission: MissionDetail; action: MissionAction; busy: string; setView: (view: string) => void }) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const open = mission.conflicts.filter((conflict) => conflict.status === "open");
  const resolved = mission.conflicts.filter((conflict) => conflict.status === "resolved");
  const conflict = open[0];
  const recommended = conflict?.options.find((option) => option.recommended) ?? conflict?.options[0];
  const selectedOptionId = conflict ? selected[conflict.id] ?? recommended?.id ?? "" : "";
  const selectedOption = conflict?.options.find((option) => option.id === selectedOptionId);
  const resolveAndContinue = async () => {
    if (!conflict || !selectedOption) return;
    const reason = reasons[conflict.id]?.trim() || tr(`Selected “${selectedOption.label}” after reviewing the conflicting sources and impact.`, `檢查衝突來源與影響後，決定採用「${localizeDomainText(selectedOption.label)}」。`);
    const result = await action(conflict.id, api<{ mission: MissionDetail }>(`/api/conflicts/${conflict.id}/resolve`, { method: "POST", body: JSON.stringify({ optionId: selectedOption.id, reason }) }), open.length > 1 ? tr("Decision saved. Relay opened the next question.", "決定已保存；Relay 已打開下一題。") : tr("Decision saved. Relay is rebuilding the execution plan.", "決定已保存；Relay 正在重建執行計畫。"));
    if (!result || result.mission.openConflicts > 0 || result.mission.status !== "planning") return;
    const compiled = await action("plan", api<{ mission: MissionDetail }>(`/api/missions/${mission.id}/plan`, { method: "POST", body: "{}" }), tr("The new plan is active. Relay will ask separately before any exact external action.", "新計畫已啟用；真正要對外操作時，Relay 會另外向你精確核准。"));
    if (compiled) setView(compiled.mission.pendingApprovals > 0 ? "approvals" : "room");
  };
  return <div className="content-stack decision-flow"><div className="view-heading decision-heading"><div><span className="page-kicker">{tr("ONE CLEAR DECISION", "現在只做一個決定")}</span><h2>{conflict ? tr(`Question 1 of ${open.length}`, `第 1 題，共 ${open.length} 題`) : tr("The team now agrees on one version.", "團隊現在只剩一個有效版本。")}</h2><p>{tr("Choose which instruction the team should follow. This does not send, publish, spend or change anything outside Relay.", "選出團隊真正要採用的指令。這一步不會寄信、發布、花錢或修改任何外部工具。")}</p></div><div className="conflict-summary"><span><AlertOctagon />{mission.blockingConflicts} {tr("blocking", "項阻擋")}</span><span><Scale />{open.length} {tr("to decide", "項待決定")}</span><span><Check />{resolved.length} {tr("done", "項完成")}</span></div></div>
    <ol className="decision-path"><li className="active"><span>1</span><p><b>{tr("Choose the truth", "選出有效版本")}</b><small>{tr("You are here", "你現在在這裡")}</small></p></li><li><span>2</span><p><b>{tr("Relay rebuilds the plan", "Relay 重建計畫")}</b><small>{tr("Automatic", "自動完成")}</small></p></li><li><span>3</span><p><b>{tr("Approve exact actions", "核准精確操作")}</b><small>{tr("Only before external impact", "只在對外操作前")}</small></p></li></ol>
    {conflict && <article className={`conflict-card decision-card-focused ${conflict.blocking ? "blocking" : ""}`}><div className="conflict-card-main"><div className="conflict-head"><div><div className="conflict-tags"><span className={`severity-tag ${conflict.severity}`}>{localizeLabel(conflict.severity)}</span><span>{localizeLabel(conflict.type)}</span>{conflict.blocking && <span className="blocking-tag"><CircleStop size={13}/>{tr("Agents paused", "Agent 已暫停")}</span>}</div><h3>{localizeDomainText(conflict.title)}</h3><p>{localizeDomainText(conflict.summary)}</p></div><div className="decision-owner"><span>{tr("WHO SHOULD DECIDE", "該由誰決定")}</span><b><UserRound size={15}/>{localizeDomainText(conflict.decisionOwner)}</b><small>{tr("AI cannot decide this for them", "AI 不能代替他決定")}</small></div></div>
      <ConflictSourceProof mission={mission} conflict={conflict}/>
      <div className="decision-question"><span>{tr("CHOOSE ONE", "請選一個")}</span><h4>{tr("Which instruction should Relay treat as the truth?", "Relay 接下來應該相信哪一個版本？")}</h4></div>
      <div className="resolution-options">{conflict.options.map((option) => <label className={`resolution-option ${selectedOptionId === option.id ? "selected" : ""} ${option.recommended ? "recommended" : ""}`} key={option.id}><input type="radio" name={conflict.id} value={option.id} checked={selectedOptionId === option.id} onChange={() => setSelected({ ...selected, [conflict.id]: option.id })}/><span className="option-radio">{selectedOptionId === option.id && <Check size={15}/>}</span><div className="option-copy"><div className="option-top"><b>{localizeDomainText(option.label)}</b>{option.recommended && <span><Sparkles size={13}/>{tr("Relay recommends", "Relay 建議")}</span>}</div><p>{localizeDomainText(option.description)}</p><div className="option-impact"><span><Clock3/>{localizeDomainText(option.timeImpact)}</span><span><CircleDollarSign/>{localizeDomainText(option.budgetImpact)}</span><span><ShieldCheck/>{localizeDomainText(option.risk)}</span></div></div></label>)}</div>
      <details className="decision-reason-optional"><summary>{tr("Add a reason (optional)", "補充決定理由（可不填）")}</summary><textarea placeholder={tr("This becomes permanent evidence for the team.", "這段話會成為團隊的永久決策證據。")} value={reasons[conflict.id] ?? ""} onChange={(event) => setReasons({ ...reasons, [conflict.id]: event.target.value })} rows={2}/></details>
      <div className="decision-primary-action"><p><ShieldCheck size={17}/><span><b>{tr("You are approving a team decision—not an external action.", "你現在確認的是團隊決定，不是對外操作。")}</b><small>{tr("Relay will show the exact recipient, content, budget and stop condition later if approval is needed.", "若之後需要核准，Relay 會再顯示精確收件人、內容、預算與停止條件。")}</small></span></p><button className="button button-dark button-large" disabled={!selectedOptionId || busy === conflict.id || busy === "plan"} onClick={() => { void resolveAndContinue(); }}>{busy === conflict.id || busy === "plan" ? <span className="loader small"/> : <Check size={18}/>}<span>{tr(`Use “${selectedOption ? localizeDomainText(selectedOption.label) : ""}” and continue`, `採用「${selectedOption ? localizeDomainText(selectedOption.label) : ""}」並繼續`)}</span><ArrowRight size={18}/></button></div>
    </div></article>}
    {!open.length && <div className="resolved-celebration"><BadgeCheck/><div><h3>{tr("Every conflicting instruction has an owner and a decision.", "所有互相衝突的指令都已有人決定。")}</h3><p>{tr("Relay can now run the active plan. Exact external actions still require a separate approval.", "Relay 現在可以依有效計畫執行；精確的對外操作仍會另外核准。")}</p></div><button className="button button-dark" onClick={() => setView(mission.pendingApprovals ? "approvals" : "room")}>{mission.pendingApprovals ? tr("Review exact approvals", "查看精確核准") : tr("Return to live mission", "回到即時 Mission")}<ArrowRight size={17}/></button></div>}
    {resolved.length > 0 && <details className="resolved-list compact"><summary>{tr(`Decision history · ${resolved.length}`, `決策紀錄 · ${resolved.length}`)}</summary>{resolved.map((item) => <div className="resolved-item" key={item.id}><Check size={17}/><div><b>{localizeDomainText(item.title)}</b><p>{localizeDomainText(item.resolution?.decision)}</p><small>{item.resolution?.decidedBy} · {formatDate(item.resolution?.createdAt, true)}</small></div></div>)}</details>}
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
  const [connectors, setConnectors] = useState<ConnectorDescriptor[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const response = await api<{ connectors: ConnectorDescriptor[] }>("/api/connectors"); setConnectors(response.connectors); }
    catch (err) { setError((err as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const requirementsFor = useCallback((key: string) => plan?.accessBlueprint.filter((access) => connectorProviderKey(access.provider) === key) ?? [], [plan]);
  const recommendedCapabilitiesFor = useCallback((descriptor: ConnectorDescriptor) => {
    const required = requirementsFor(descriptor.provider).flatMap((access) => access.capabilities.map((capability) => canonicalConnectorCapability(access, capability)));
    const matching = [...new Set(required)].filter((capability) => descriptor.capabilities.includes(capability));
    return matching.length ? matching : (connectorCatalogCopy[descriptor.provider]?.defaultCapabilities ?? descriptor.capabilities.slice(0, 1));
  }, [requirementsFor]);
  const openPlugin = (descriptor: ConnectorDescriptor) => {
    setSelectedProvider(descriptor.provider);
    setSelectedCapabilities(recommendedCapabilitiesFor(descriptor));
    setConfirmRevoke(false);
    setError("");
  };
  const connect = async (key: string, capabilities: string[]) => {
    setBusy(key); setError("");
    try {
      const response = await api<{ authorizeUrl: string }>(`/api/connectors/${key}/oauth/start`, { method: "POST", body: JSON.stringify({ missionId: mission.id, requestedCapabilities: capabilities, redirectAfter: `${window.location.pathname}?view=access` }) });
      window.location.assign(response.authorizeUrl);
    } catch (err) { setError((err as Error).message); setBusy(""); }
  };
  const verify = async (connectionId: string) => {
    setBusy(connectionId); setError("");
    try { await api(`/api/connectors/${connectionId}/verify`, { method: "POST", body: JSON.stringify({ missionId: mission.id }) }); await Promise.all([load(), onRefresh()]); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(""); }
  };
  const revoke = async (connectionId: string) => {
    setBusy(connectionId); setError("");
    try { await api(`/api/connectors/${connectionId}`, { method: "DELETE" }); await Promise.all([load(), onRefresh()]); setSelectedProvider(""); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(""); setConfirmRevoke(false); }
  };
  if (!plan) return null;
  const recommendedProviders = new Set(plan.accessBlueprint.map((access) => connectorProviderKey(access.provider)));
  const verifiedConnections = connectors.flatMap((descriptor) => descriptor.connections).filter((connection) => connection.status === "verified");
  const selectedDescriptor = connectors.find((descriptor) => descriptor.provider === selectedProvider);
  const selectedConnection = selectedDescriptor?.connections.find((connection) => connection.status === "verified") ?? selectedDescriptor?.connections[0];
  const selectedRequirements = selectedDescriptor ? requirementsFor(selectedDescriptor.provider) : [];
  const selectedTaskKeys = [...new Set(selectedRequirements.flatMap((access) => access.taskKeys))];
  const selectedTasks = plan.tasks.filter((task) => selectedTaskKeys.includes(task.key) || task.requiredCapabilities.some((capability) => selectedCapabilities.includes(capability)));
  const googleVerified = connectors.find((descriptor) => descriptor.provider === "google")?.connections.find((connection) => connection.status === "verified");
  const unavailableRequirements = plan.accessBlueprint.filter((access) => !connectors.some((descriptor) => descriptor.provider === connectorProviderKey(access.provider)));
  return <div className="content-stack connector-marketplace"><div className="view-heading connector-heading"><div><span className="page-kicker">{tr("PLUGIN LIBRARY · CONNECT ONCE, CONTROL PER MISSION", "PLUGIN LIBRARY · 安裝一次，每個 MISSION 各自授權")}</span><h2>{tr("Give Agents one scoped, revocable key at a time.", "像安裝 App 一樣，給 Agent 一把有範圍、可撤銷的鑰匙。")}</h2><p>{tr("Choose a service, review exactly what Agents may read or do, complete OAuth, then verify the real account. Installation never gives every Agent blanket access.", "選服務、看懂 Agent 可以讀什麼或做什麼、完成 OAuth，再驗證真實帳號。安裝完成也不代表所有 Agent 都能任意使用。")}</p></div><button className="button button-primary" onClick={() => { const target = connectors.find((item) => recommendedProviders.has(item.provider)) ?? connectors[0]; if (target) openPlugin(target); }}><Plus size={17} /> {tr("Add a plugin", "新增 Plugin")}</button></div>
    <section className="connector-steps" aria-label={tr("Four steps to connect a plugin", "連接 Plugin 的四個步驟")}><div><span>1</span><p><b>{tr("Choose", "選服務")}</b><small>{tr("Email, docs, chat or code", "Email、文件、聊天或程式")}</small></p></div><div><span>2</span><p><b>{tr("Review", "看權限")}</b><small>{tr("Select exact capabilities", "選擇精確能力")}</small></p></div><div><span>3</span><p><b>{tr("Authorize", "登入授權")}</b><small>{tr("Provider-owned OAuth", "服務商自己的 OAuth")}</small></p></div><div><span>4</span><p><b>{tr("Verify", "真實驗證")}</b><small>{tr("Then Agents may request access", "通過後 Agent 才能申請使用")}</small></p></div></section>
    <div className="access-summary"><div><Network /><span>{recommendedProviders.size}</span><small>{tr("recommended now", "個目前建議服務")}</small></div><div><KeyRound /><span>{plan.accessBlueprint.reduce((sum, item) => sum + item.capabilities.length, 0)}</span><small>{tr("mission capabilities", "項 Mission 能力")}</small></div><div><BadgeCheck /><span>{verifiedConnections.length}</span><small>{tr("verified accounts", "個已驗證帳號")}</small></div><div><Clock3 /><span>v{plan.version}</span><small>{tr("permission manifest", "權限 Manifest 版本")}</small></div></div>
    <section className={`mission-access-callout ${recommendedProviders.size ? "recommended" : "empty"}`}><Bot size={21}/><div><span>{recommendedProviders.size ? tr("LUCY RECOMMENDS FOR THIS MISSION", "LUCY 為這個 MISSION 建議") : tr("NO PLUGIN REQUIRED YET", "目前還不需要外部工具")}</span><h3>{recommendedProviders.size ? tr(`${recommendedProviders.size} services unlock the current plan.`, `目前計畫需要 ${recommendedProviders.size} 個服務。`) : tr("You can install a service now; no Agent can use it until a matching task is added.", "你可以先安裝服務；Lucy 加入對應任務前，任何 Agent 都不能使用。")}</h3><p>{recommendedProviders.size ? tr("Recommended badges below come directly from the active task graph—not from a generic integration list.", "下方的「Mission 建議」直接來自目前任務圖，不是通用整合清單。") : tr("That is why the counter says zero: Relay has not silently granted a tool the Mission never asked for.", "所以目前數字是 0：Relay 不會偷偷授權這個 Mission 沒有要求的工具。")}</p></div></section>
    {unavailableRequirements.length > 0 && <section className="connector-gaps"><AlertOctagon size={20}/><div><span>{tr("REQUIRED, BUT NOT YET INSTALLABLE", "MISSION 需要，但目前還不能安裝")}</span><h3>{unavailableRequirements.map((access) => access.provider).join("、")}</h3><p>{tr("Relay will keep the affected tasks blocked until a real production adapter exists. It will not simulate a connection.", "在真實 Production Adapter 完成前，Relay 會持續阻擋受影響任務，不會模擬已連線。")}</p></div></section>}
    <section className="plugin-library"><div className="plugin-library-head"><div><span>{tr("AVAILABLE PLUGINS", "可安裝 PLUGINS")}</span><h3>{tr("Connect a service in under a minute.", "不到一分鐘，把服務交給 Relay 安全使用。")}</h3></div><small>{tr("OAuth token stays in the encrypted Tool Gateway—not in Agent memory.", "OAuth Token 只留在加密 Tool Gateway，不會進入 Agent 記憶。")}</small></div><div className="plugin-grid">{connectors.map((descriptor) => { const copy = connectorCatalogCopy[descriptor.provider]; const requirementCount = requirementsFor(descriptor.provider).length; const connection = descriptor.connections.find((item) => item.status === "verified") ?? descriptor.connections[0]; const recommended = requirementCount > 0; const agentTasks = plan.tasks.filter((task) => requirementsFor(descriptor.provider).some((access) => access.taskKeys.includes(task.key))); const actionLabel = !descriptor.configured ? tr("View setup needed", "查看設定需求") : connection?.status === "verified" ? tr("Manage access", "管理權限") : connection ? tr("Finish verification", "完成驗證") : tr("Install", "安裝"); return <article className={`plugin-card ${recommended ? "recommended" : ""}`} data-provider={descriptor.provider} key={descriptor.provider}><div className="plugin-card-top"><span className={`plugin-mark plugin-${descriptor.provider}`}>{copy?.monogram ?? descriptor.label.slice(0, 2).toUpperCase()}</span><div><small>{copy ? tr(copy.category[0], copy.category[1]) : tr("PLUGIN", "PLUGIN")}</small><h3>{descriptor.label}</h3></div><span className={`plugin-state ${connection?.status ?? (descriptor.configured ? "available" : "setup")}`}>{recommended ? tr("MISSION PICK", "MISSION 建議") : connection?.status === "verified" ? tr("VERIFIED", "已驗證") : connection ? tr("VERIFY", "待驗證") : descriptor.configured ? tr("AVAILABLE", "可安裝") : tr("SETUP", "待設定")}</span></div><p className="plugin-description">{copy ? tr(copy.description[0], copy.description[1]) : descriptor.label}</p><div className="plugin-capability-preview">{descriptor.capabilities.slice(0, 3).map((capability) => <span key={capability}><Check size={14}/>{localizeDomainText(capability)}</span>)}{descriptor.capabilities.length > 3 && <small>+{descriptor.capabilities.length - 3} {tr("more", "項更多能力")}</small>}</div><div className="plugin-agent-row"><Bot size={17}/><p><small>{tr("AGENT ACCESS", "AGENT 使用權")}</small><b>{agentTasks.length ? agentTasks.slice(0, 2).map((task) => `${task.key} · ${localizeDomainText(task.ownerName)}`).join("、") : tr("No Agent assigned until a task asks for it", "尚未指派；有對應任務才會開放")}</b></p></div><button type="button" className={`button button-full ${connection?.status === "verified" ? "button-ghost" : "button-dark"}`} onClick={() => openPlugin(descriptor)}><Plus size={16}/>{actionLabel}</button></article>; })}{!connectors.length && !error && <div className="plugin-loading"><span className="loader"/><p>{tr("Loading the verified plugin library…", "正在載入可驗證的 Plugin Library…")}</p></div>}</div></section>
    {googleVerified && plan.accessBlueprint.some((access) => access.provider === "Gmail") && <GmailDraftAction mission={mission} connectionId={googleVerified.id} onComplete={onRefresh}/>}
    {error && <section className="truth-banner error"><AlertOctagon/><div><b>{tr("Connection did not pass", "連線尚未通過")}</b><p>{error}</p></div></section>}
    <section className="truth-banner"><ShieldCheck /><div><b>{tr("Installed is not the same as Agent permission", "安裝完成，不等於 Agent 已獲得權限")}</b><p>{tr("OAuth authorizes the workspace account. Relay still checks the Mission, Plan version, exact capability, resource, risk and human approval before every tool call. Disconnecting revokes every active Manifest.", "OAuth 是授權 Workspace 帳號；每次工具呼叫前，Relay 仍會檢查 Mission、Plan 版本、精確能力、資源、風險與人工核准。中斷連線會撤銷所有有效 Manifest。")}</p></div></section>
    {selectedDescriptor && <div className="modal-scrim connector-scrim" onClick={() => setSelectedProvider("")}><div className="modal connector-permission-sheet" onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" onClick={() => setSelectedProvider("")} aria-label={tr("Close", "關閉")}><X /></button><div className="permission-sheet-head"><span className={`plugin-mark plugin-${selectedDescriptor.provider}`}>{connectorCatalogCopy[selectedDescriptor.provider]?.monogram ?? selectedDescriptor.label.slice(0, 2).toUpperCase()}</span><div><span className="page-kicker">{selectedConnection?.status === "verified" ? tr("PLUGIN INSTALLED · VERIFIED", "PLUGIN 已安裝 · 真實驗證通過") : tr("REVIEW BEFORE INSTALLING", "安裝前先看清楚")}</span><h2>{selectedConnection?.status === "verified" ? tr(`Manage ${selectedDescriptor.label}`, `管理 ${selectedDescriptor.label}`) : tr(`Install ${selectedDescriptor.label}`, `安裝 ${selectedDescriptor.label}`)}</h2><p>{connectorCatalogCopy[selectedDescriptor.provider] ? tr(connectorCatalogCopy[selectedDescriptor.provider].description[0], connectorCatalogCopy[selectedDescriptor.provider].description[1]) : selectedDescriptor.label}</p></div></div>
      {!selectedDescriptor.configured ? <section className="connector-setup-required"><AlertOctagon size={21}/><div><b>{tr("A workspace admin must configure this OAuth app first.", "Workspace 管理員必須先設定這個 OAuth App。")}</b><p>{tr("Relay will not show a fake Connect button. Once the provider credentials and encrypted vault are configured, this same screen becomes installable.", "Relay 不會顯示假的連線按鈕；服務憑證與加密 Vault 設定完成後，這個畫面就會直接變成可安裝。")}</p><code>{selectedDescriptor.configurationHint}</code></div></section> : selectedConnection ? <section className="connected-account"><BadgeCheck size={23}/><div><span>{tr("CONNECTED ACCOUNT", "已連接帳號")}</span><b>{selectedConnection.accountLabel}</b><small>{selectedConnection.status === "verified" ? tr("Identity and live provider access verified", "身分與真實服務存取已驗證") : tr("OAuth returned; one live verification remains", "OAuth 已完成；還差一次真實驗證")}</small></div><StatusPill value={selectedConnection.status}/></section> : <><section className="permission-intro"><KeyRound size={20}/><div><b>{tr("Choose exactly what Relay should ask for", "只勾選 Relay 這次應該索取的能力")}</b><p>{tr("The provider owns the sign-in screen. You can cancel there without installing anything.", "登入與同意畫面由服務商提供；你可以直接取消，不會安裝任何東西。")}</p></div></section><div className="permission-options">{selectedDescriptor.capabilities.map((capability) => { const checked = selectedCapabilities.includes(capability); const write = /create|post|update|comment/i.test(capability); return <label className={checked ? "checked" : ""} key={capability}><input type="checkbox" checked={checked} onChange={(event) => setSelectedCapabilities((current) => event.target.checked ? [...current, capability] : current.filter((item) => item !== capability))}/><span>{checked ? <Check size={15}/> : null}</span><p><b>{localizeDomainText(capability)}</b><small>{write ? tr("May create or change data · governed by Mission policy", "可能建立或變更資料 · 仍受 Mission 政策控管") : tr("Read only · limited again by resource scope", "只讀 · 還會再限制到指定資源")}</small></p>{selectedRequirements.some((access) => access.capabilities.some((item) => canonicalConnectorCapability(access, item) === capability)) && <em>{tr("REQUIRED", "本次需要")}</em>}</label>; })}</div></>}
      <section className="permission-agent-scope"><Bot size={20}/><div><span>{tr("WHICH AGENTS CAN USE IT?", "哪些 AGENTS 可以使用？")}</span>{selectedTasks.length ? selectedTasks.map((task) => <p key={task.id}><b>{task.key} · {localizeDomainText(task.ownerName)}</b><small>{localizeDomainText(task.title)}</small></p>) : <p><b>{tr("No Agent has blanket access", "目前沒有 Agent 擁有通用權限")}</b><small>{tr("Installation adds the account to this workspace. Lucy must add a matching task and Plan capability before an Agent can request it.", "安裝只把帳號加入 Workspace；Lucy 必須先建立對應任務與 Plan 能力，Agent 才能提出使用要求。")}</small></p>}</div></section>
      <div className="permission-safety"><span><LockKeyhole size={15}/>{tr("Token never enters the model", "Token 永遠不進模型")}</span><span><ShieldCheck size={15}/>{tr("Writes stay approval-gated", "寫入仍受核准控管")}</span><span><X size={15}/>{tr("Revoke anytime", "隨時可以撤銷")}</span></div>
      {error && <p className="form-error">{error}</p>}
      <div className="permission-actions">{!selectedDescriptor.configured ? <button className="button button-dark button-full" onClick={() => setSelectedProvider("")}>{tr("Got it", "我知道了")}</button> : !selectedConnection ? <button className="button button-primary button-full" disabled={!selectedCapabilities.length || busy === selectedDescriptor.provider} onClick={() => { void connect(selectedDescriptor.provider, selectedCapabilities); }}>{busy === selectedDescriptor.provider ? <span className="loader small"/> : <ExternalLink size={17}/>} {tr(`Continue to ${selectedDescriptor.label}`, `前往 ${selectedDescriptor.label} 授權`)}</button> : selectedConnection.status !== "verified" ? <button className="button button-primary button-full" disabled={busy === selectedConnection.id} onClick={() => { void verify(selectedConnection.id); }}>{busy === selectedConnection.id ? <span className="loader small"/> : <BadgeCheck size={17}/>} {tr("Verify live access", "驗證真實權限")}</button> : confirmRevoke ? <div className="revoke-confirm"><p><AlertOctagon size={16}/>{tr("This immediately revokes every active Agent grant using this account.", "這會立即撤銷所有使用此帳號的 Agent 授權。")}</p><button className="button button-ghost" onClick={() => setConfirmRevoke(false)}>{tr("Keep connected", "保留連線")}</button><button className="button button-danger" disabled={busy === selectedConnection.id} onClick={() => { void revoke(selectedConnection.id); }}>{tr("Disconnect now", "立即中斷")}</button></div> : <><button className="button button-primary" onClick={() => setSelectedProvider("")}><BadgeCheck size={17}/>{tr("Done", "完成")}</button><button className="text-button connector-disconnect" onClick={() => setConfirmRevoke(true)}>{tr("Disconnect account", "中斷帳號連線")}</button></>}</div>
    </div></div>}
  </div>;
}

function ApprovalCenter({ mission, action, busy, isStale }: { mission: MissionDetail; action: MissionAction; busy: string; isStale: boolean }) {
  const plan = mission.currentPlan; if (!plan) return null;
  const nextPending = plan.approvals.find((item) => item.status === "pending");
  const approvalAllowed = Boolean(nextPending && !isStale && mission.blockingConflicts === 0);
  const approveNext = () => nextPending && action(nextPending.id, api(`/api/approvals/${nextPending.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "approved", reason: tr("Exact payload, audience, budget and stop condition reviewed and approved.", "精確內容、受眾、預算與停止條件皆已審查並核准。") }) }), tr("Exact approval recorded for this plan version and payload hash.", "此計畫版本與內容雜湊的精確核准已記錄。"));
  return <div className="content-stack"><div className="view-heading"><div><span className="page-kicker">{tr("EXACT APPROVAL CENTER", "精確核准中心")}</span><h2>{tr("Approve the action—not the idea.", "核准的是精確操作，不是模糊概念。")}</h2><p>{tr("Every decision is locked to one plan version, exact payload, audience, budget, stop condition and expiration.", "每項決策都綁定一個計畫版本、精確內容、受眾、預算、停止條件與到期時間。")}</p></div><div className="approval-stats"><span>{plan.approvals.filter((item) => item.status === "pending").length} {tr("pending", "項等待中")}</span><span>{plan.approvals.filter((item) => item.status === "approved").length} {tr("approved", "項已核准")}</span></div></div>
    {nextPending && <aside className="mobile-approval-dock"><div><small>{tr(`APPROVE PLAN v${plan.version} · EXACT PAYLOAD`, `核准計畫 v${plan.version} · 精確內容`)}</small><b>{localizeDomainText(nextPending.action)}</b><span>{tr("Nothing changes if the payload hash changes.", "只要內容雜湊改變，這次核准就自動失效。")}</span></div><button className="button button-dark" disabled={!approvalAllowed || busy === nextPending.id} onClick={() => { void approveNext(); }}>{busy === nextPending.id ? <span className="loader small"/> : <ShieldCheck size={18}/>}<span>{approvalAllowed ? tr("Approve this exact action", "核准這項精確操作") : tr("Approval is blocked", "目前不能核准")}</span></button></aside>}
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
  const storedOutcome: Omit<Outcome, "id" | "blockers" | "updatedAt"> = mission.outcome ?? { metricName: mission.successMetric, targetValue: mission.successMetric, actualValue: "", status: "not_started", cost: 0, durationMinutes: 0, humanInterventions: 0, teamSize: 1, baselineMeetings: 0, actualMeetings: 0, meetingMinutes: 0, recommendation: "" };
  const initial = { ...storedOutcome, metricName: localizeDomainText(storedOutcome.metricName), targetValue: localizeDomainText(storedOutcome.targetValue), actualValue: localizeDomainText(storedOutcome.actualValue), recommendation: localizeDomainText(storedOutcome.recommendation) };
  const [form, setForm] = useState(initial);
  const meetingsAvoided = Math.max(0, form.baselineMeetings - form.actualMeetings);
  const peopleHoursAvoided = Number(((meetingsAvoided * form.meetingMinutes * form.teamSize) / 60).toFixed(1));
  return <div className="outcome-layout"><section className="outcome-main"><div className="view-heading"><div><span className="page-kicker">{tr("INTENT → OUTCOME", "意圖 → 成果")}</span><h2>{tr("Did the mission actually work?", "這個 Mission 真的成功了嗎？")}</h2><p>{tr("Task completion is not success. Close the loop with the agreed metric, cost, time and interventions.", "任務完成不等於成功。請用雙方同意的指標、成本、時間與人工介入完成成果閉環。")}</p></div></div><div className="outcome-contract"><span>{tr("ORIGINAL SUCCESS CONTRACT", "原始成功合約")}</span><h3>{localizeDomainText(mission.successMetric)}</h3><div><Target /><span>{tr("Plan", "計畫")} v{mission.currentPlanVersion}</span><span>•</span><span>{tr("Created by", "建立者")} {mission.createdBy}</span></div></div><form className="outcome-form" onSubmit={(event) => { event.preventDefault(); action("outcome", api(`/api/missions/${mission.id}/outcome`, { method: "PUT", body: JSON.stringify(form) }), tr("Outcome and mission learning recorded.", "成果與 Mission 學習已記錄。")); }}><div className="form-grid"><label>{tr("Metric name", "指標名稱")}<input value={form.metricName} onChange={(event) => setForm({ ...form, metricName: event.target.value })} /></label><label>{tr("Status", "狀態")}<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Outcome["status"] })}>{["not_started", "on_track", "at_risk", "achieved", "missed"].map((status) => <option value={status} key={status}>{localizeLabel(status)}</option>)}</select></label></div><label>{tr("Target", "目標值")}<input value={form.targetValue} onChange={(event) => setForm({ ...form, targetValue: event.target.value })} /></label><label>{tr("Actual result", "實際成果")}<input value={form.actualValue} onChange={(event) => setForm({ ...form, actualValue: event.target.value })} placeholder={tr("Example: 26 paid registrations at NT$1,110 CPA", "例如：26 筆付費報名，CPA 為 NT$1,110")} /></label><div className="form-grid three"><label>{tr("Total cost (TWD)", "總成本（TWD）")}<input type="number" min="0" value={form.cost} onChange={(event) => setForm({ ...form, cost: Number(event.target.value) })} /></label><label>{tr("Duration (minutes)", "執行時間（分鐘）")}<input type="number" min="0" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} /></label><label>{tr("Human interventions", "人工介入次數")}<input type="number" min="0" value={form.humanInterventions} onChange={(event) => setForm({ ...form, humanInterventions: Number(event.target.value) })} /></label></div><div className="coordination-baseline"><span>{tr("COORDINATION BASELINE", "協作基準")}</span><div className="form-grid four"><label>{tr("Team size", "團隊人數")}<input type="number" min="1" value={form.teamSize} onChange={(event) => setForm({...form, teamSize: Number(event.target.value)})}/></label><label>{tr("Meetings planned", "原訂會議")}<input type="number" min="0" value={form.baselineMeetings} onChange={(event) => setForm({...form, baselineMeetings: Number(event.target.value)})}/></label><label>{tr("Meetings held", "實際會議")}<input type="number" min="0" value={form.actualMeetings} onChange={(event) => setForm({...form, actualMeetings: Number(event.target.value)})}/></label><label>{tr("Minutes each", "每場分鐘")}<input type="number" min="0" value={form.meetingMinutes} onChange={(event) => setForm({...form, meetingMinutes: Number(event.target.value)})}/></label></div><b>{meetingsAvoided} {tr("meetings avoided", "場會議免開")} · {peopleHoursAvoided} {tr("people-hours avoided", "人時免耗")}</b></div><label>{tr("Next-mission recommendation", "下一次 Mission 建議")}<textarea rows={4} value={form.recommendation} onChange={(event) => setForm({ ...form, recommendation: event.target.value })} placeholder={tr("What should Relay change next time?", "Relay 下次應該改變什麼？")} /></label><button className="button button-primary" disabled={busy === "outcome"}><Target size={17} /> {tr("Save verified outcome", "儲存已驗證成果")}</button></form></section><aside className="outcome-side"><section className="panel outcome-score"><span>{tr("MISSION RESULT", "MISSION 成果")}</span><div className={`outcome-ring ${form.status}`}><strong>{form.status === "achieved" ? "100" : form.status === "on_track" ? "72" : form.status === "at_risk" ? "48" : form.status === "missed" ? "18" : "—"}</strong><small>{localizeLabel(form.status)}</small></div><div className="health-row"><span>{tr("Cost", "成本")}</span><b>{formatMoney(form.cost)}</b></div><div className="health-row"><span>{tr("Human interventions", "人工介入")}</span><b>{form.humanInterventions}</b></div><div className="health-row"><span>{tr("People-hours avoided", "免耗人時")}</span><b>{peopleHoursAvoided}</b></div><div className="health-row"><span>{tr("Open blockers", "待處理阻擋項目")}</span><b>{mission.openConflicts}</b></div></section><section className="panel moat-card"><Network /><span>{tr("INTENT-TO-OUTCOME DATA", "意圖到成果資料")}</span><h3>{tr("This is Relay’s compounding asset.", "這是 Relay 持續複利的資產。")}</h3><p>{tr("Every result connects the original intent, decisions, plan, permissions, execution and human corrections.", "每項成果都會連回原始意圖、決策、計畫、權限、執行與人工修正。")}</p></section></aside></div>;
}

function LegacyDemoPage() {
  const navigate = useNavigate();
  return <div className="landing demo-live-page"><PublicHeader/><main>
    <section className="demo-live-hero"><div><span className="eyebrow"><span className="pulse-dot"/>{tr("TWO PROOFS · YOU RUN ONE", "兩種證明 · 一個由你觸發")}</span><h1>{tr("First see a completed launch handoff. Then run Relay on your own mess.", "先看一個真的完成交接，再用你的混亂 Brief 親手 Run。")}</h1><p>{tr("The proof card is loaded from a completed mission with hashed artifacts. The compiler below waits for your input and shows the exact contradiction it finds.", "右側證明卡來自一個具備雜湊 Artifact 的已完成 Mission；下方編譯器則等待你的輸入，並顯示它找到的精確矛盾。")}</p><div className="demo-live-steps"><span><b>1</b>{tr("See done", "先看完成")}</span><ArrowRight size={15}/><span><b>2</b>{tr("Paste + run", "貼上 + Run")}</span><ArrowRight size={15}/><span><b>3</b>{tr("Save + invite", "保存 + 邀人")}</span></div></div><CompletedLaunchProof compact/></section>
    <section className="section live-proof-section demo-compiler"><div className="live-proof-copy"><span className="section-index">01 / {tr("YOUR TURN", "換你操作")}</span><h2>{tr("The magic moment only counts when your input causes it.", "只有你的輸入真的觸發結果，才算 Magic Moment。")}</h2><p>{tr("The compiler response below comes from the live API. Saving it creates real persisted events, named team invites and durable Agent runs.", "下方結果來自真實 API；保存後會建立可持久化事件、具名團隊邀請與 Durable Agent Run。")}</p></div><LandingMagicCompiler onOpenFullMission={(brief) => { sessionStorage.setItem("relay_mission_draft", brief); navigate("/missions/new?draft=1"); }}/></section>
  </main></div>;
}

function DemoPage() {
  const navigate = useNavigate();
  const demoScenario = getLandingScenarios().find((item) => item.id === "growth") ?? getLandingScenarios()[0];
  const startDemoScenario = () => { sessionStorage.setItem("relay_lucy_goal", demoScenario.prompt); navigate("/missions/new?goal=1"); };
  return <div className="landing quiet-landing demo-live-page"><PublicHeader/><main>
    <section className="quiet-demo-hero"><span>{tr("LIVE PRODUCT PROOF", "真實產品證明")}</span><h1>{tr("Watch the AI team work. Then hand it your real mission.", "先看 AI 團隊工作。再把真實任務交給它。")}</h1><p>{tr("The canvas explains the operating model. The completion receipt and compiler below use persisted product data and the live API—not a prewritten result.", "白紙展示 Relay 如何工作；下方完成憑據與編譯器使用已保存的產品資料與即時 API，不是預先寫好的結果。")}</p></section>
    <section className="quiet-demo-canvas"><LandingLiveCanvas scenario={demoScenario} onStart={startDemoScenario}/></section>
    <section className="quiet-demo-proof"><CompletedLaunchProof compact/></section>
    <section className="quiet-demo-run"><div><span>01</span><h2>{tr("Paste the versions that do not agree.", "把互相對不上的版本貼進來。")}</h2><p>{tr("Press Run. Relay will show the exact collision, the source, and what must stop before an Agent acts.", "按下 Run。Relay 會指出精確衝突、原始來源，以及 Agent 動手前必須先停下什麼。")}</p></div><LandingMagicCompiler onOpenFullMission={(brief) => { sessionStorage.setItem("relay_mission_draft", brief); navigate("/missions/new?draft=1"); }}/></section>
  </main></div>;
}

function JoinMissionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = decodeURIComponent(location.pathname.split("/").pop() ?? "");
  const [preview, setPreview] = useState<MissionInvitePreview>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ invite: MissionInvitePreview }>(`/api/invites/${token}`)
      .then((response) => { if (active) setPreview(response.invite); })
      .catch((err) => { if (active) setError((err as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);
  const accept = async () => {
    setBusy(true); setError("");
    try {
      const response = await api<{ missionId: string }>(`/api/invites/${token}/accept`, { method: "POST", body: "{}" });
      if (preview) sessionStorage.setItem(`relay_invite_recap:${response.missionId}`, JSON.stringify(preview));
      navigate(`/missions/${response.missionId}?view=room&welcome=1`);
    }
    catch (err) { setError((err as Error).message); setBusy(false); }
  };
  if (loading) return <main className="join-page"><Logo/><section><LoadingBlock label={tr("Preparing your 30-second recap…", "正在準備你的 30 秒摘要…")}/></section></main>;
  if (!preview) return <main className="join-page"><Logo/><section><ErrorBlock error={error || tr("This invite is invalid or expired.", "這份邀請無效或已過期。")} /></section></main>;
  return <main className="join-page join-recap-page"><Logo/><section>
    <header className="join-recap-head"><div><span><Fingerprint size={17}/>{tr("PRIVATE MISSION INVITE", "私人 MISSION 邀請")}</span><h1>{tr(`${preview.inviterName} invited you to a Relay mission.`, `${preview.inviterName} 邀請你加入一個 Relay Mission。`)}</h1></div><p>{tr("Read this once. You will know what happened and exactly why Relay needs you.", "看完這一頁，你就會知道發生了什麼，以及 Relay 為什麼需要你。")}</p></header>
    <section className="join-project-brief"><small>{tr("THE PROJECT", "這是什麼專案")}</small><h2>{localizeDomainText(preview.mission.title)}</h2>{preview.mission.objective !== preview.mission.title && <p className="join-project-objective">{localizeDomainText(preview.mission.objective)}</p>}<p><Target size={16}/><span><b>{tr("Success looks like", "成功標準")}</b>{localizeDomainText(preview.mission.successMetric)}</span></p></section>
    <section className="join-your-action"><span><UserRound size={17}/>{tr("YOUR ONE NEXT STEP", "你現在只要做一件事")}</span><h2>{tr(preview.recap.whatYouNeedToDo.en, preview.recap.whatYouNeedToDo.zhTW)}</h2><p>{tr("After you join, your personal counterpart Agent keeps your goals in sync and reports back. It cannot approve as you.", "加入後，你的專屬 AI 搭檔會持續同步你的目標並向你回報，但不能冒用你的身分核准。")}</p></section>
    <section className="join-recap-status"><span><Activity size={16}/>{tr("WHAT HAPPENED", "目前發生了什麼")}</span><p>{tr(preview.recap.whatHappened.en, preview.recap.whatHappened.zhTW)}</p><div><small>{preview.mission.openConflicts} {tr("open decisions", "項待決定")}</small><small>{preview.mission.waitingAgentTasks} {tr("Agents waiting safely", "個 Agent 安全等待")}</small><small>{tr(`Plan v${preview.mission.currentPlanVersion}`, `計畫 v${preview.mission.currentPlanVersion}`)}</small></div></section>
    {preview.recap.voices.length > 0 && <section className="join-team-voices"><span>{tr("WHO SAID WHAT", "誰說了什麼")}</span>{preview.recap.voices.map((voice, index) => <article key={`${voice.author}-${index}`}><small>{localizeLabel(voice.sourceType)} · {localizeDomainText(voice.author)}</small><p>{localizeDomainText(voice.statement)}</p></article>)}</section>}
    {error && <p className="form-error">{error}</p>}
    <button className="button button-dark button-large button-full join-accept-button" disabled={busy} onClick={() => { void accept(); }}>{busy ? <><span className="loader small"/>{tr("Joining the mission…", "正在加入 Mission…")}</> : <><UsersRound size={17}/>{tr(`Join as ${preview.invitee.name}`, `以 ${preview.invitee.name} 加入`)}<ArrowRight size={18}/></>}</button>
    <small className="join-security"><ShieldCheck size={13}/>{tr("Single-use · mission-scoped · your Agent cannot self-approve", "一次性 · 僅限此 Mission · 你的 Agent 不可自行核准")}</small>
    <div className="join-mobile-dock"><button className="button button-dark button-large button-full" disabled={busy} onClick={() => { void accept(); }}>{busy ? <><span className="loader small"/>{tr("Joining…", "正在加入…")}</> : <><UsersRound size={17}/>{tr(`Join as ${preview.invitee.name}`, `以 ${preview.invitee.name} 加入`)}<ArrowRight size={18}/></>}</button></div>
  </section></main>;
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
