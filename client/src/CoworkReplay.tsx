import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  Bot,
  Check,
  CirclePause,
  CirclePlay,
  FileSearch,
  GitBranch,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Workflow,
} from "lucide-react";
import { tr, useLocale } from "./i18n";
import "./CoworkReplay.css";

type ReplayVariant = "hero" | "demo";
type ActorKind = "human" | "agent" | "relay";
type ReplayTone = "source" | "danger" | "decision" | "work" | "success";

type Participant = {
  id: string;
  name: string;
  role: string;
  kind: Exclude<ActorKind, "relay">;
  startsAt: number;
  finishesAt: number;
};

type ReplayEvent = {
  actor: string;
  target: string;
  kind: ActorKind;
  tone: ReplayTone;
  message: string;
  label: string;
};

type ReplayScenario = {
  id: string;
  shortLabel: string;
  title: string;
  mission: string;
  metric: string;
  problem: string;
  resolution: string;
  result: string;
  participants: Participant[];
  events: ReplayEvent[];
};

function makeScenarios(): ReplayScenario[] {
  return [
    {
      id: "launch",
      shortLabel: tr("Launch", "Launch 上線"),
      title: tr("Stop a launch from breaking its own rules", "阻止 Launch 自己撞上自己的規則"),
      mission: tr("Launch Kaohsiung campaign by July 29", "7 月 29 日前推出高雄行銷活動"),
      metric: tr("24 paid registrations · CPA ≤ NT$1,250", "24 筆付費報名 · CPA ≤ NT$1,250"),
      problem: tr("Launch is due July 29, but brand review is July 30.", "7/29 要上線，但品牌審查排在 7/30。"),
      resolution: tr("Move review to July 28 and bind approval to Plan v2.", "審查提前到 7/28，並把核准綁定 Plan v2。"),
      result: tr("6 agents resume from one safe plan", "6 個 Agent 按同一份安全計畫繼續"),
      participants: [
        { id: "jennifer", name: "Jennifer", role: tr("Mission lead", "Mission 負責人"), kind: "human", startsAt: 3, finishesAt: 5 },
        { id: "maya", name: "Maya", role: tr("Brand approver", "品牌核准人"), kind: "human", startsAt: 4, finishesAt: 5 },
        { id: "marcus", name: "Marcus", role: tr("Finance owner", "財務負責人"), kind: "human", startsAt: 4, finishesAt: 5 },
        { id: "evidence", name: tr("Evidence", "證據"), role: tr("Compare 7 sources", "比對 7 個來源"), kind: "agent", startsAt: 0, finishesAt: 1 },
        { id: "policy", name: tr("Policy", "政策"), role: tr("Check approval rules", "檢查核准規則"), kind: "agent", startsAt: 1, finishesAt: 2 },
        { id: "planner", name: tr("Planner", "規劃"), role: tr("Recompile Plan v2", "重編 Plan v2"), kind: "agent", startsAt: 2, finishesAt: 6 },
        { id: "crm", name: "CRM", role: tr("Exclude members", "排除既有會員"), kind: "agent", startsAt: 5, finishesAt: 7 },
        { id: "creative", name: tr("Creative", "素材"), role: tr("Prepare approved draft", "準備核准素材"), kind: "agent", startsAt: 5, finishesAt: 7 },
        { id: "ops", name: "Ops", role: tr("Schedule safe launch", "排程安全發布"), kind: "agent", startsAt: 6, finishesAt: 7 },
      ],
      events: [
        { actor: tr("Evidence Agent", "證據 Agent"), target: tr("Relay", "Relay"), kind: "agent", tone: "source", label: tr("READING", "正在讀取"), message: tr("I found 7 instructions across Slack, email, Calendar, Notion, CRM and Ads.", "我從 Slack、Email、Calendar、Notion、CRM 與 Ads 找到 7 條指令。") },
        { actor: tr("Evidence Agent", "證據 Agent"), target: tr("Planning Agent", "規劃 Agent"), kind: "agent", tone: "danger", label: tr("CONFLICT", "發現衝突"), message: tr("Launch happens one day before mandatory brand approval.", "發布日比必要品牌核准早了一天。") },
        { actor: tr("Relay", "Relay"), target: tr("6 AI agents", "6 個 AI Agent"), kind: "relay", tone: "danger", label: tr("PAUSE", "暫停執行"), message: tr("External email, CRM edits and ad publishing are paused before any damage occurs.", "在寄信、修改 CRM 或發布廣告前，先暫停所有對外操作。") },
        { actor: tr("Planning Agent", "規劃 Agent"), target: "Jennifer", kind: "agent", tone: "decision", label: tr("ASK HUMAN", "詢問負責人"), message: tr("Choose: move review earlier, delay launch, or ship an internal preview only.", "請決定：提前審查、延後發布，或只交付內部預覽。") },
        { actor: "Jennifer", target: "Maya + Marcus", kind: "human", tone: "decision", label: tr("DECISION", "人工決策"), message: tr("Move review to July 28. Keep the NT$30,000 ceiling and exclude existing members.", "審查提前到 7/28；維持 NT$30,000 上限，並排除既有會員。") },
        { actor: "Maya + Marcus", target: tr("Relay", "Relay"), kind: "human", tone: "decision", label: tr("EXACT APPROVAL", "精確核准"), message: tr("Approved for this creative, audience, budget and Plan v2 only.", "只核准這份素材、受眾、預算與 Plan v2。") },
        { actor: tr("Planning Agent", "規劃 Agent"), target: tr("AI team", "AI 團隊"), kind: "agent", tone: "work", label: tr("REPLAN", "重新規劃"), message: tr("Plan v1 is stale. CRM, Creative and Ops now receive the verified Plan v2.", "Plan v1 已失效；CRM、素材與 Ops 改用已驗證的 Plan v2。") },
        { actor: tr("Relay", "Relay"), target: tr("Mission room", "Mission Room"), kind: "relay", tone: "success", label: tr("SAFE TO RUN", "可以安全執行"), message: tr("All six agents resumed. Every handoff, approval and output is now auditable.", "6 個 Agent 全部恢復執行；每次交接、核准與產出都有紀錄。") },
      ],
    },
    {
      id: "customer",
      shortLabel: tr("Customer crisis", "客訴危機"),
      title: tr("Resolve a VIP escalation without making two promises", "處理 VIP 客訴，不讓團隊做出兩套承諾"),
      mission: tr("Resolve a payment outage for a key customer", "處理重要客戶的付款異常"),
      metric: tr("Reply in 30 min · no duplicate refund", "30 分鐘內回覆 · 不重複退款"),
      problem: tr("Support promised a refund while Finance already started a chargeback review.", "客服承諾退款，但財務已開始拒付審查。"),
      resolution: tr("One owner chooses the remedy; all customer-facing drafts inherit it.", "由單一負責人決定處置，所有對客草稿共用同一結論。"),
      result: tr("One promise, one case owner, zero duplicate payment", "一個承諾、一位負責人、零重複付款"),
      participants: [
        { id: "nina", name: "Nina", role: tr("Support lead", "客服主管"), kind: "human", startsAt: 3, finishesAt: 5 },
        { id: "omar", name: "Omar", role: tr("Finance owner", "財務負責人"), kind: "human", startsAt: 4, finishesAt: 5 },
        { id: "lee", name: "Lee", role: tr("Account owner", "客戶負責人"), kind: "human", startsAt: 4, finishesAt: 6 },
        { id: "support", name: tr("Support", "客服"), role: tr("Read ticket history", "讀取工單歷史"), kind: "agent", startsAt: 0, finishesAt: 2 },
        { id: "crm", name: "CRM", role: tr("Verify customer state", "確認客戶狀態"), kind: "agent", startsAt: 0, finishesAt: 2 },
        { id: "finance", name: tr("Finance", "財務"), role: tr("Check payment events", "檢查付款事件"), kind: "agent", startsAt: 1, finishesAt: 3 },
        { id: "policy", name: tr("Policy", "政策"), role: tr("Test refund authority", "檢查退款權限"), kind: "agent", startsAt: 2, finishesAt: 4 },
        { id: "writer", name: tr("Writer", "回覆"), role: tr("Draft one response", "起草單一回覆"), kind: "agent", startsAt: 5, finishesAt: 7 },
        { id: "outcome", name: tr("Outcome", "成果"), role: tr("Confirm resolution", "確認處理結果"), kind: "agent", startsAt: 6, finishesAt: 7 },
      ],
      events: [
        { actor: tr("Support Agent", "客服 Agent"), target: tr("CRM Agent", "CRM Agent"), kind: "agent", tone: "source", label: tr("CASE OPENED", "案件已建立"), message: tr("Customer says payment failed twice and asks for an immediate refund.", "客戶表示付款失敗兩次，要求立刻退款。") },
        { actor: tr("CRM Agent", "CRM Agent"), target: tr("Finance Agent", "財務 Agent"), kind: "agent", tone: "danger", label: tr("STATE MISMATCH", "狀態不一致"), message: tr("CRM shows one failed payment; the gateway shows one captured charge.", "CRM 顯示一筆失敗；金流卻顯示一筆已扣款。") },
        { actor: tr("Relay", "Relay"), target: tr("Support + Finance", "客服 + 財務"), kind: "relay", tone: "danger", label: tr("DOUBLE-ACTION BLOCKED", "阻擋重複操作"), message: tr("Refund and chargeback workflows cannot run together. Both actions are paused.", "退款與拒付流程不能同時執行，兩邊操作都先暫停。") },
        { actor: tr("Policy Agent", "政策 Agent"), target: "Nina", kind: "agent", tone: "decision", label: tr("OWNER FOUND", "找到決策者"), message: tr("Nina owns the customer remedy; Omar must verify the captured charge.", "由 Nina 決定客戶處置；Omar 必須先確認扣款狀態。") },
        { actor: "Omar", target: "Nina + Lee", kind: "human", tone: "decision", label: tr("EVIDENCE", "人工確認"), message: tr("One charge settled. No chargeback exists. A single full refund is safe.", "一筆扣款已入帳，沒有拒付；可安全執行一次全額退款。") },
        { actor: "Nina", target: tr("Writer Agent", "回覆 Agent"), kind: "human", tone: "decision", label: tr("APPROVED REMEDY", "核准處置"), message: tr("Refund once, apologize, and grant a 30-day service credit. No second payment action.", "退款一次、致歉並補 30 天服務；不得再做第二筆付款操作。") },
        { actor: tr("Writer Agent", "回覆 Agent"), target: "Lee", kind: "agent", tone: "work", label: tr("DRAFT READY", "草稿完成"), message: tr("Customer reply, refund receipt and internal timeline are ready for review.", "客戶回覆、退款憑據與內部時間線已準備完成。") },
        { actor: tr("Outcome Agent", "成果 Agent"), target: tr("Mission room", "Mission Room"), kind: "agent", tone: "success", label: tr("RESOLVED", "已解決"), message: tr("Customer received one consistent answer. No duplicate refund was triggered.", "客戶收到一致答覆，且沒有觸發重複退款。") },
      ],
    },
    {
      id: "hiring",
      shortLabel: tr("Hiring", "招募決策"),
      title: tr("Keep an AI hiring team inside one fair, approved process", "讓 AI 招募團隊遵守同一套公平、已核准流程"),
      mission: tr("Hire a product designer before the quarter closes", "本季結束前錄用產品設計師"),
      metric: tr("Offer by Friday · approved band · complete evidence", "週五前發 Offer · 符合薪資帶 · 證據完整"),
      problem: tr("The hiring manager wants an offer now; Finance has not approved the new salary band.", "用人主管想立刻發 Offer，但財務尚未核准新的薪資帶。"),
      resolution: tr("Separate assessment from compensation approval, then issue one exact offer.", "把能力評估與薪資核准分開，再發出一份精確 Offer。"),
      result: tr("Fair evidence, approved offer, complete decision trail", "公平證據、已核准 Offer、完整決策紀錄"),
      participants: [
        { id: "ava", name: "Ava", role: tr("Hiring manager", "用人主管"), kind: "human", startsAt: 3, finishesAt: 6 },
        { id: "sam", name: "Sam", role: tr("People partner", "HR 夥伴"), kind: "human", startsAt: 4, finishesAt: 6 },
        { id: "rui", name: "Rui", role: tr("Finance approver", "財務核准人"), kind: "human", startsAt: 5, finishesAt: 6 },
        { id: "evidence", name: tr("Evidence", "證據"), role: tr("Normalize feedback", "整理面試回饋"), kind: "agent", startsAt: 0, finishesAt: 2 },
        { id: "fairness", name: tr("Fairness", "公平性"), role: tr("Flag unsupported claims", "標出無證據判斷"), kind: "agent", startsAt: 1, finishesAt: 3 },
        { id: "recruiting", name: tr("Recruiting", "招募"), role: tr("Compile decision", "編譯錄用決策"), kind: "agent", startsAt: 2, finishesAt: 5 },
        { id: "finance", name: tr("Finance", "財務"), role: tr("Check salary band", "檢查薪資帶"), kind: "agent", startsAt: 2, finishesAt: 5 },
        { id: "offer", name: tr("Offer", "Offer"), role: tr("Draft exact payload", "起草精確內容"), kind: "agent", startsAt: 6, finishesAt: 7 },
        { id: "schedule", name: tr("Schedule", "排程"), role: tr("Coordinate next steps", "協調後續時程"), kind: "agent", startsAt: 6, finishesAt: 7 },
      ],
      events: [
        { actor: tr("Evidence Agent", "證據 Agent"), target: tr("Fairness Agent", "公平性 Agent"), kind: "agent", tone: "source", label: tr("FEEDBACK MERGED", "回饋已整理"), message: tr("I merged six interviews and linked every rating to its original note.", "我整合了 6 場面試，並把每個評分連回原始紀錄。") },
        { actor: tr("Fairness Agent", "公平性 Agent"), target: tr("Recruiting Agent", "招募 Agent"), kind: "agent", tone: "danger", label: tr("UNSUPPORTED CLAIM", "缺少證據"), message: tr("Two negative comments have no job-related evidence and cannot drive the decision.", "兩項負面評論沒有職務相關證據，不能用來做決定。") },
        { actor: tr("Finance Agent", "財務 Agent"), target: tr("Relay", "Relay"), kind: "agent", tone: "danger", label: tr("BAND CONFLICT", "薪資衝突"), message: tr("The proposed offer is 12% above the currently approved band.", "提議 Offer 比目前核准薪資帶高 12%。") },
        { actor: tr("Relay", "Relay"), target: "Ava + Sam", kind: "relay", tone: "danger", label: tr("OFFER PAUSED", "暫停發送"), message: tr("Assessment can continue, but no offer may be sent before exact compensation approval.", "能力評估可繼續，但精確薪資核准前不得寄出 Offer。") },
        { actor: "Sam", target: "Ava", kind: "human", tone: "decision", label: tr("PROCESS CORRECTED", "流程修正"), message: tr("Remove unsupported comments. Candidate meets the approved role criteria.", "移除無證據評論；候選人符合已核准的職務標準。") },
        { actor: "Rui", target: tr("Relay", "Relay"), kind: "human", tone: "decision", label: tr("BAND APPROVED", "薪資已核准"), message: tr("Approve this exact base salary and equity package until Friday 18:00.", "核准這份精確底薪與股權內容，有效至週五 18:00。") },
        { actor: tr("Offer Agent", "Offer Agent"), target: "Ava", kind: "agent", tone: "work", label: tr("EXACT OFFER", "精確 OFFER"), message: tr("The offer draft matches the approved role, salary, equity and expiration.", "Offer 草稿符合已核准職務、薪資、股權與期限。") },
        { actor: tr("Relay", "Relay"), target: tr("Mission room", "Mission Room"), kind: "relay", tone: "success", label: tr("READY FOR SEND", "可以送出"), message: tr("The offer is ready for human send approval with complete decision lineage.", "Offer 已準備好接受人工寄送核准，且具完整決策脈絡。") },
      ],
    },
  ];
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function ParticipantCard({ participant, phase }: { participant: Participant; phase: number }) {
  const active = phase >= participant.startsAt && phase < participant.finishesAt;
  const done = phase >= participant.finishesAt;
  const state = done ? "done" : active ? "active" : "waiting";
  const Icon = participant.kind === "human" ? UserRound : Bot;
  return <article className={`cowork-person ${participant.kind} ${state}`}>
    <span className="cowork-person-icon"><Icon size={14} /></span>
    <div><b>{participant.name}</b><small>{participant.role}</small></div>
    <span className="cowork-person-state" aria-label={state}>{done ? <Check size={10} /> : active ? <span /> : null}</span>
  </article>;
}

export default function CoworkReplay({ variant = "hero" }: { variant?: ReplayVariant }) {
  const { locale } = useLocale();
  const scenarios = useMemo(makeScenarios, [locale]);
  const reducedMotion = useReducedMotion();
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(true);
  const scenario = scenarios[scenarioIndex];
  const event = scenario.events[phase];

  useEffect(() => {
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setInterval(() => {
      setPhase((current) => {
        if (current < scenario.events.length - 1) return current + 1;
        setScenarioIndex((selected) => (selected + 1) % scenarios.length);
        return 0;
      });
    }, variant === "hero" ? 1850 : 2100);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion, scenario.events.length, scenarios.length, variant]);

  const chooseScenario = (index: number) => {
    setScenarioIndex(index);
    setPhase(0);
    if (!reducedMotion) setPlaying(true);
  };
  const restart = () => { setPhase(0); if (!reducedMotion) setPlaying(true); };
  const visibleEvents = scenario.events.slice(Math.max(0, phase - (variant === "hero" ? 2 : 4)), phase + 1).reverse();
  const humans = scenario.participants.filter((person) => person.kind === "human");
  const agents = scenario.participants.filter((person) => person.kind === "agent");
  const progress = ((phase + 1) / scenario.events.length) * 100;

  return <section className={`cowork-replay cowork-replay-${variant}`} aria-label={tr("Animated human and AI mission replay", "人類與 AI 協作動畫重播")}>
    <header className="cowork-replay-head">
      <div className="cowork-replay-live"><span /><b>{tr("MISSION REPLAY", "MISSION 重播")}</b><small>{tr("3 humans + 6 AI agents", "3 位人類 + 6 個 AI Agent")}</small></div>
      <div className="cowork-replay-controls">
        <button type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? tr("Pause animation", "暫停動畫") : tr("Play animation", "播放動畫")}>
          {playing ? <CirclePause size={16} /> : <CirclePlay size={16} />}<span>{playing ? tr("Pause", "暫停") : tr("Play", "播放")}</span>
        </button>
        <button type="button" onClick={restart} aria-label={tr("Restart replay", "重新播放")}><RefreshCw size={15} /><span>{tr("Replay", "重播")}</span></button>
      </div>
    </header>

    <nav className="cowork-scenarios" aria-label={tr("Mission replay scenarios", "Mission 重播情境")}>
      {scenarios.map((item, index) => <button type="button" className={scenarioIndex === index ? "active" : ""} aria-pressed={scenarioIndex === index} onClick={() => chooseScenario(index)} key={item.id}><span>{String(index + 1).padStart(2, "0")}</span>{item.shortLabel}</button>)}
    </nav>

    <div className="cowork-replay-body">
      <div className="cowork-stage">
        <div className="cowork-mission-title"><span><Workflow size={15} /> {tr("SHARED EXECUTION CONTRACT", "共用執行合約")}</span><h3>{scenario.mission}</h3><p>{scenario.metric}</p></div>

        <div className="cowork-group-label"><UsersRound size={14} /><span>{tr("HUMAN TEAM", "人類同事")}</span><small>{tr("judgment + accountability", "判斷 + 責任")}</small></div>
        <div className="cowork-people-grid humans">{humans.map((person) => <ParticipantCard key={person.id} participant={person} phase={phase} />)}</div>

        <div className={`cowork-handoff tone-${event.tone}`} aria-live="polite" aria-atomic="true">
          <div className="cowork-handoff-track" aria-hidden="true"><span /><span /><span /></div>
          <div className="cowork-handoff-top"><span>{event.kind === "human" ? <UserRound size={15} /> : event.kind === "agent" ? <Bot size={15} /> : <Sparkles size={15} />}{event.actor}</span><ArrowDown size={15} /><span>{event.target}</span></div>
          <div className="cowork-handoff-message"><span>{event.tone === "danger" ? <AlertTriangle size={17} /> : event.tone === "success" ? <ShieldCheck size={17} /> : event.kind === "relay" ? <GitBranch size={17} /> : <MessageSquareText size={17} />}</span><div><small>{event.label}</small><b>{event.message}</b></div></div>
          <div className="cowork-state-swap"><span className="before"><small>{tr("PROBLEM", "原本問題")}</small>{scenario.problem}</span><span className="cowork-state-arrow">→</span><span className="after"><small>{tr("CURRENT SAFE STATE", "目前安全狀態")}</small>{phase >= 5 ? scenario.resolution : tr("Waiting for the next verified handoff", "等待下一個已驗證的交接")}</span></div>
        </div>

        <div className="cowork-group-label"><Bot size={14} /><span>{tr("AI TEAM", "AI 團隊")}</span><small>{tr("research + planning + execution", "研究 + 規劃 + 執行")}</small></div>
        <div className="cowork-people-grid agents">{agents.map((person) => <ParticipantCard key={person.id} participant={person} phase={phase} />)}</div>
      </div>

      <aside className="cowork-activity">
        <div className="cowork-activity-head"><span><MessageSquareText size={14} /> {tr("TEAM COMMUNICATION", "團隊溝通")}</span><small>{String(phase + 1).padStart(2, "0")} / {String(scenario.events.length).padStart(2, "0")}</small></div>
        <div className="cowork-activity-list">{visibleEvents.map((item, index) => <article className={`${item.kind} tone-${item.tone} ${index === 0 ? "current" : ""}`} key={`${phase}-${phase - index}`}><span>{item.kind === "human" ? <UserRound size={13} /> : item.kind === "agent" ? <Bot size={13} /> : <Sparkles size={13} />}</span><div><small>{item.actor} → {item.target}</small><p>{item.message}</p></div></article>)}</div>
        <div className={`cowork-outcome ${phase === scenario.events.length - 1 ? "visible" : ""}`}><ShieldCheck size={18} /><div><small>{tr("VERIFIABLE OUTCOME", "可驗收成果")}</small><b>{scenario.result}</b></div></div>
      </aside>
    </div>

    <footer className="cowork-replay-foot">
      <div className="cowork-progress" aria-label={tr(`Replay step ${phase + 1} of ${scenario.events.length}`, `重播第 ${phase + 1} 步，共 ${scenario.events.length} 步`)}><span style={{ width: `${progress}%` }} /></div>
      <p><ShieldCheck size={13} /> {tr("Guided replay of Relay's saved demo workflow—not a claim that external providers are connected.", "這是 Relay 已保存示範流程的引導重播，不代表外部服務已連線。")}</p>
    </footer>
  </section>;
}
