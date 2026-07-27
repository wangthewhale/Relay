import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "en" | "zh-TW";

const STORAGE_KEY = "relay.locale";
let activeLocale: Locale = "en";

function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "zh-TW";
}

export function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const queryLocale = new URLSearchParams(window.location.search).get("lang");
  if (isLocale(queryLocale)) return queryLocale;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage can be unavailable in privacy mode. Browser language remains a safe fallback.
  }
  return window.navigator.languages.some((language) => language.toLowerCase().startsWith("zh")) ? "zh-TW" : "en";
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);
  activeLocale = locale;

  const setLocale = (next: Locale) => {
    activeLocale = next;
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A language choice still applies for the current session when storage is blocked.
    }
  };

  useEffect(() => {
    activeLocale = locale;
    document.documentElement.lang = locale;
    document.title = locale === "zh-TW" ? "Relay — AI 團隊的意圖控制層" : "Relay — Intent control for AI teams";
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}

export function getCurrentLocale() {
  return activeLocale;
}

/** A compact bilingual literal helper for UI copy that keeps English as the canonical fallback. */
export function tr(english: string, traditionalChinese: string) {
  return activeLocale === "zh-TW" ? traditionalChinese : english;
}

const labels: Record<string, string> = {
  active: "生效中",
  achieved: "已達成",
  agent: "AI Agent",
  approved: "已核准",
  assertions: "意圖主張",
  blocked: "已阻擋",
  completed: "已完成",
  critical: "嚴重",
  draft: "草稿",
  events: "事件",
  failed: "失敗",
  high: "高",
  human: "人員",
  low: "低",
  medium: "中",
  missed: "未達成",
  not_connected: "尚未連線",
  not_started: "尚未開始",
  on_track: "進度正常",
  open: "待處理",
  pending: "等待中",
  planning: "規劃中",
  ready: "可執行",
  rejected: "已拒絕",
  resolved: "已解決",
  running: "執行中",
  sources: "來源",
  superseded: "已被新版取代",
  system: "系統",
  at_risk: "有風險",
  invalidated: "已失效",
  verified: "已驗證",
  read: "讀取",
  write: "寫入",
  Constraint: "限制",
  Goal: "目標",
  Policy: "政策",
  Assumption: "假設",
  Preference: "偏好",
  Deadline: "期限",
  Budget: "預算",
  "Approval requirement": "核准要求",
  "Success metric": "成功指標",
  Exclusion: "排除條件",
  Dependency: "依賴條件",
  "Hard conflict": "硬性衝突",
  "Resource conflict": "資源衝突",
  "Authority conflict": "權責衝突",
  "Policy conflict": "政策衝突",
  "Version conflict": "版本衝突",
  "Dependency conflict": "依賴衝突",
  "Mission owner": "Mission 負責人",
  "Brand approver": "品牌核准人",
  "CRM owner": "CRM 負責人",
  "Workspace billing admin": "Workspace 帳務管理員",
  "Workspace admin": "Workspace 管理員",
  "Named approver": "指定核准人",
  "Evidence Agent": "證據 Agent",
  "Planning Agent": "規劃 Agent",
  "Operations Agent": "營運 Agent",
  "Launch Agent": "發布 Agent",
  "Outcome Agent": "成果 Agent",
  "Growth lead": "Growth 負責人",
  Client: "客戶",
  Operations: "營運團隊",
  Marketing: "行銷團隊",
  "CRM system": "CRM 系統",
  "Ads platform": "廣告平台",
  "Meeting note": "會議紀錄",
  Manual: "手動輸入",
  Calendar: "行事曆",
  Ads: "廣告平台",
  approval: "核准",
  conflict: "衝突",
  intent_assertion: "意圖主張",
  mission: "Mission",
  outcome: "成果",
  plan_version: "計畫版本",
  task: "任務",
};

const domainText: Record<string, string> = {
  "Launch Kaohsiung campaign": "推出高雄活動行銷專案",
  "Launch the Kaohsiung event campaign by July 29 with a maximum approved budget and no promotion to existing members.": "在 7 月 29 日前推出高雄活動行銷專案，遵守已核准的最高預算，且不得向既有會員推廣。",
  "Acquire 24 paid registrations while keeping CPA at or below NT$1,250.": "取得 24 筆付費報名，且每次轉換成本不高於 NT$1,250。",
  "Client brand review": "客戶品牌審核",
  "Brand review": "品牌審核",
  "Campaign brief v1": "行銷專案簡報 v1",
  "Executive update": "主管最新指示",
  "Kaohsiung audience": "高雄活動受眾",
  "Meta Ads account": "Meta Ads 帳號",
  "We must launch on 7月29日. Target is 24 paid registrations. Do not promote to existing members.": "我們必須在 7 月 29 日推出。目標是取得 24 筆付費報名。不得向既有會員推廣。",
  "All creative requires client brand approval before public release.": "所有素材公開發布前都必須取得客戶的品牌核准。",
  "Brand approval review is scheduled for 7月30日.": "品牌核准審查排在 7 月 30 日。",
  "Campaign budget limit: NT$20,000.": "行銷專案預算上限：NT$20,000。",
  "The approved budget is NT$30,000 maximum. Nothing can be published without my approval.": "核准的預算上限為 NT$30,000。未經我核准，任何內容都不能發布。",
  "Current campaign audience contains existing members and new leads.": "目前的行銷受眾包含既有會員與新名單。",
  "A payment method is missing; campaign publishing is unavailable.": "缺少付款方式，因此目前無法發布行銷活動。",
  "Existing members must be excluded from the campaign audience.": "行銷受眾必須排除既有會員。",
  "The current audience contains existing members.": "目前受眾包含既有會員。",
  "The advertising account does not have a verified payment method.": "廣告帳號沒有已驗證的付款方式。",
  "A payment method is available.": "付款方式可用。",
  "Public release requires explicit approval from an authorized decision maker.": "公開發布前必須取得具決策權者的明確核准。",
  "Recommended resolution": "建議解法",
  "Alternative A": "替代方案 A",
  "Alternative B": "替代方案 B",
  "Preserves the earliest safe delivery path": "保留最早且安全的交付路徑",
  "No unapproved increase": "不增加未核准支出",
  "Protects the defined success metric": "保護既定成功指標",
  "Lowest residual risk": "剩餘風險最低",
  "May move the launch window": "可能調整發布時程",
  "Requires a new budget check": "需要重新檢查預算",
  "Moderate impact on reach or timing": "對觸及或時程有中度影響",
  Moderate: "中度",
  "Fastest but most constrained": "最快，但限制最多",
  "Keeps spend at the lowest stated limit": "支出維持在已提出的最低上限",
  "May reduce the chance of hitting the target": "可能降低達標機率",
  "High — requires an explicit exception": "高風險，需要明確例外核准",
  "Two budget ceilings are active": "目前同時存在兩個預算上限",
  "Agents may overspend, underfund the campaign, or rely on an obsolete approval.": "Agent 可能超支、讓專案資源不足，或誤用已過期的核准。",
  "Keep the lower ceiling and reduce campaign scope to fit.": "採用較低預算上限，並縮小行銷範圍以符合限制。",
  "Request a budget exception with a new exact approval and expiration.": "申請預算例外，並建立含到期時間的新精確核准。",
  "Launch is scheduled before required approval": "發布日期早於必要核准日期",
  "Publishing on the current date would bypass a mandatory approval; waiting silently would miss the deadline.": "照原日期發布會繞過必要核准；若不處理而等待，則會錯過期限。",
  "Move the brand review before launch and preserve the launch date only after the approver accepts the exact payload.": "將品牌審核提前到發布前，且只有在核准人確認精確內容後才保留原發布日。",
  "Move launch to the first safe slot after brand review.": "將發布調整至品牌審核後第一個安全時段。",
  "Ship a private internal preview only; do not publish externally.": "只提供內部預覽，不對外發布。",
  "Audience violates the exclusion policy": "目前受眾違反排除政策",
  "The campaign must exclude existing members, but the current CRM audience still contains them.": "行銷活動必須排除既有會員，但目前 CRM 受眾仍包含他們。",
  "Existing members may receive prohibited outreach and the launch approval would not match the actual audience.": "既有會員可能收到禁止發送的內容，且發布核准會與實際受眾不符。",
  "Create and verify a suppression segment for existing members before any draft is approved.": "任何草稿獲准前，先建立並驗證既有會員排除名單。",
  "Use a new audience sourced only from verified non-members.": "改用只包含已驗證非會員的新受眾。",
  "Pause outbound promotion and launch through owned channels only.": "暫停對外推廣，只透過自有渠道發布。",
  "Advertising payment capability is missing": "缺少廣告付款能力",
  "The plan requires paid distribution, but the advertising account has no verified payment method.": "計畫需要付費投放，但廣告帳號沒有已驗證的付款方式。",
  "The campaign cannot launch and any related approval would be unusable.": "行銷活動無法發布，任何相關核准也都無法使用。",
  "Ask the billing admin to verify a payment method, then run a read-only capability check before approval.": "請帳務管理員驗證付款方式，再於核准前執行唯讀能力檢查。",
  "Remove paid distribution and recompile the plan around organic channels.": "移除付費投放，改以自然流量渠道重新編譯計畫。",
  "Transfer the draft to an already verified ad account after scope and ownership review.": "完成範圍與所有權審查後，將草稿移至已驗證的廣告帳號。",
  "Release authority is not assigned": "尚未指定發布決策權",
  "Public release requires approval, but the current sources do not name the authorized approver or define the approval lifetime.": "公開發布需要核准，但目前來源未指定具權限的核准人，也未定義核准有效期限。",
  "Relay cannot determine whose approval is valid, and a generic approval could be reused for the wrong payload.": "Relay 無法判斷誰的核准有效，而通用核准可能被錯用在不同內容。",
  "Assign one named approver and bind approval to the active plan version, exact payload hash, budget, audience and expiration.": "指定一位核准人，並將核准綁定至有效計畫版本、精確內容雜湊、預算、受眾與到期時間。",
  "Require two approvers for public launch and budget spend.": "公開發布與預算支出需由兩位核准人共同批准。",
  "Keep all work at Draft risk level until authority is assigned.": "在權責指定完成前，所有工作維持在草稿風險等級。",
  "Source authority has not been established": "尚未建立來源權威順序",
  "Relay found multiple actionable assertions, but no source hierarchy explains which instruction wins when the mission changes.": "Relay 找到多項可執行主張，但尚無來源層級可判斷 Mission 變更時應以哪項指令為準。",
  "A later correction could silently override a higher-authority policy.": "後續修正可能在未察覺的情況下覆蓋更高權威的政策。",
  "Confirm a source authority order for this mission before activating external tasks.": "啟用外部任務前，先確認此 Mission 的來源權威順序。",
  "Treat all sources as equal and require a human decision on every conflict.": "將所有來源視為同等權威，且每個衝突都要求人工決策。",
  "Limit the plan to read and draft actions only.": "將計畫限制為讀取與建立草稿。",
  "Validate mission evidence": "驗證 Mission 證據",
  "Confirm every assertion has a source and current timestamp.": "確認每項主張都有來源與有效時間戳記。",
  "Every actionable assertion links to its source.": "每項可執行主張都連結至原始來源。",
  "Write to external systems": "寫入外部系統",
  "No approval; read-only": "不需核准；僅限讀取",
  "Stop if a source cannot be accessed or its identity is ambiguous.": "若來源無法存取或身分不明確，立即停止。",
  "Discard the derived assertion set and retain source evidence.": "捨棄衍生主張，保留原始來源證據。",
  "Resolve blocking intent conflicts": "解決會阻擋執行的意圖衝突",
  "Convert contradictions into explicit, owned decisions.": "將矛盾轉換為明確且有負責人的決策。",
  "All blocking conflicts have a named decision and rationale.": "所有阻擋性衝突都有具名決策與理由。",
  "Auto-resolve authority or policy conflicts": "自動解決權責或政策衝突",
  "Decision maker must be named": "必須指定決策者",
  "Stop when decision authority is unclear.": "決策權不明確時停止。",
  "Invalidate the decision and restore the conflict to open.": "使決策失效，並將衝突恢復為待處理。",
  "Create the campaign execution brief": "建立行銷專案執行簡報",
  "Turn the resolved intent into a reviewable execution artifact.": "將已解決的意圖轉成可審查的執行產出。",
  "Brief states scope, exclusions, budget, deadline and success metric.": "簡報清楚列出範圍、排除條件、預算、期限與成功指標。",
  "Send email": "寄出 Email",
  "Publish content": "發布內容",
  "Spend funds": "支出資金",
  "Draft may be generated without approval": "草稿可在不需核准的情況下產生",
  "Stop if the active plan version changes.": "有效計畫版本變更時停止。",
  "Archive the draft under the superseded plan version.": "將草稿封存於已被取代的計畫版本下。",
  "Prepare verified audience and internal records": "準備已驗證受眾與內部紀錄",
  "Apply exclusions and prepare internal launch records.": "套用排除規則並準備內部發布紀錄。",
  "Audience excludes prohibited members and changes are auditable.": "受眾已排除禁止對象，且所有變更皆可稽核。",
  "Contact customers": "聯絡客戶",
  "Delete CRM records": "刪除 CRM 紀錄",
  "Allowed by workspace policy after a passing preflight": "通過執行前檢查後，可依 Workspace 政策執行",
  "Stop if suppression count is zero or source scope changes.": "若排除數為零或來源範圍改變，立即停止。",
  "Delete the mission-scoped draft segment; never alter source records.": "刪除限定於此 Mission 的草稿名單；不得修改來源紀錄。",
  "Create external launch drafts": "建立對外發布草稿",
  "Prepare email, social and advertising drafts without publishing.": "準備 Email、社群與廣告草稿，但不發布。",
  "All artifacts exist as drafts and share one payload version.": "所有產出皆為草稿，且共用同一內容版本。",
  Send: "寄送",
  Publish: "發布",
  "Activate ads": "啟用廣告",
  "Draft only; external actions remain blocked": "僅限草稿；對外操作仍被阻擋",
  "Stop if any provider reports a scope or identity mismatch.": "若任何服務回報範圍或身分不符，立即停止。",
  "Delete only Relay-created drafts using their idempotency keys.": "只使用冪等鍵刪除由 Relay 建立的草稿。",
  "Review the exact release payload": "審查精確發布內容",
  "Bind human approval to the precise action and active plan version.": "將人工核准綁定至精確操作與有效計畫版本。",
  "A named approver accepts or rejects the payload hash before expiration.": "指定核准人須在到期前接受或拒絕內容雜湊。",
  "Generic approval": "通用核准",
  "Reuse approval after payload change": "內容變更後重複使用舊核准",
  "Exact approval required": "需要精確核准",
  "Stop when plan, audience, budget or creative changes.": "計畫、受眾、預算或素材變更時停止。",
  "Invalidate approval and request a new decision.": "使核准失效並要求重新決策。",
  "Execute approved launch": "執行已核准的發布",
  "Perform only the externally approved actions.": "只執行已獲對外核准的操作。",
  "Every approved action returns a provider receipt and audit event.": "每項已核准操作都必須取得服務回執與稽核事件。",
  "Change budget": "變更預算",
  "Change audience": "變更受眾",
  "Use a different creative": "使用不同素材",
  "Valid approval for this version and hash": "此版本與雜湊必須具有有效核准",
  "Stop if CPA exceeds NT$1,250 after 10 conversions or any provider payload differs.": "完成 10 次轉換後，若 CPA 超過 NT$1,250，或任何服務內容不一致，立即停止。",
  "Pause the campaign and preserve all provider receipts; do not delete evidence.": "暫停行銷活動並保留所有服務回執；不得刪除證據。",
  "Verify mission outcome": "驗證 Mission 成果",
  "Measure the result against the original success contract.": "依照原始成功合約衡量成果。",
  "Actual outcome, cost, time and interventions are recorded.": "實際成果、成本、時間與人工介入均已記錄。",
  "Change historical results": "修改歷史成果",
  "Stop if attribution source is unavailable or inconsistent.": "若歸因來源不可用或不一致，立即停止。",
  "Mark outcome as unverified and retain raw evidence.": "將成果標記為未驗證並保留原始證據。",
  "Launch campaign": "發布行銷活動",
  "Taiwan prospects, excluding existing members": "台灣潛在客戶，排除既有會員",
  "mission-scoped approved drafts": "限定此 Mission 的已核准草稿",
  "After all dependencies pass preflight": "所有依賴條件通過執行前檢查後",
  "Approve campaign launch": "核准行銷活動發布",
  "Previous approvals": "舊版核准",
  "All approvals from the superseded version are invalid.": "被新版取代之版本的所有核准均已失效。",
  "Exact release approval": "精確發布核准",
  "The launch payload is now hash-bound to this version.": "發布內容已透過雜湊綁定至此版本。",
  "Initial execution contract": "初始執行合約",
  "Eight governed tasks were derived from the mission evidence.": "已從 Mission 證據產生八項受治理任務。",
  "Blocking gates": "阻擋關卡",
  "Initial draft; execution blocked until conflicts are resolved.": "初始草稿；衝突解決前禁止執行。",
  "Resolved intent compiled into an active execution contract.": "已解決的意圖已編譯為有效執行合約。",
  "Never execute a task from a superseded plan version.": "不得執行已被新版取代之計畫中的任務。",
  "Never perform an external action without a valid exact approval.": "沒有有效精確核准時，不得執行任何對外操作。",
  "Never expose connector credentials to an agent or model context.": "不得將連接器憑證暴露給 Agent 或模型上下文。",
  "Stop when a blocking conflict, permission gap or payload mismatch appears.": "出現阻擋性衝突、權限缺口或內容不符時，立即停止。",
  "read account status": "讀取帳號狀態",
  "create campaign draft": "建立行銷活動草稿",
  "read selected resources": "讀取指定資源",
  "One named ad account; draft only until exact approval": "僅限一個指定廣告帳號；取得精確核准前只能建立草稿",
  "Only the resources attached to this mission": "僅限附加至此 Mission 的資源",
  "Workspace owner": "工作區擁有者",
  "Relay Compiler": "Relay 編譯器",
  "Relay Preflight": "Relay 執行前檢查",
  "Source ID": "來源 ID",
  Timestamp: "時間戳記",
  "Extraction confidence": "萃取信心度",
  Decision: "決策",
  "Decision maker": "決策者",
  Reason: "理由",
  "Affected version": "受影響版本",
  "Plan version": "計畫版本",
  "Source links": "來源連結",
  "Generated artifact": "產出物",
  "Audience count": "受眾數量",
  "Suppression query": "排除查詢",
  "Change event": "變更事件",
  "Draft IDs": "草稿 ID",
  "Creative checksum": "素材校驗碼",
  "Audience checksum": "受眾校驗碼",
  Approver: "核准人",
  "Payload hash": "內容雜湊",
  Expiration: "到期時間",
  "Decision reason": "決策理由",
  "Provider receipt": "服務回執",
  "Idempotency key": "冪等鍵",
  "Metric source": "指標來源",
  "Time window": "時間範圍",
  Cost: "成本",
  "Read mission-scoped analytics": "讀取限定於此 Mission 的分析資料",
  "Mission created with source evidence.": "已使用來源證據建立 Mission。",
  "Correction added; active plan and approvals invalidated.": "已加入具名修正；目前計畫與既有核准已失效。",
  "Current plan version": "目前計畫版本",
  "Blocking conflicts": "阻擋性衝突",
  Dependencies: "依賴條件",
  "Required inputs": "必要輸入",
  "Capability grants": "能力授權",
  "Exact approval": "精確核准",
  "Budget policy": "預算政策",
  "Idempotency and rollback": "冪等與回滾",
  "No plan is available.": "目前沒有可用的計畫。",
  "Compile the mission into an execution plan.": "將 Mission 編譯為執行計畫。",
  "No blocking conflicts remain.": "已沒有阻擋性衝突。",
  "Resolve the Conflict Inbox decisions assigned to the mission owner.": "請處理衝突收件匣中指派給 Mission 負責人的決策。",
  "No dependencies.": "沒有依賴條件。",
  "Complete the named prerequisite tasks first.": "請先完成列出的前置任務。",
  "Attach at least one evidence source.": "至少加入一個證據來源。",
  "All required providers are verified.": "所有必要服務都已驗證。",
  "Using stored mission snapshots for this read/draft task; no live provider action will occur.": "此讀取／草稿任務使用已保存的 Mission 快照，不會操作即時外部服務。",
  "Complete the Access Blueprint verification for the listed providers.": "完成列出服務的存取藍圖驗證。",
  "Approve the exact payload in Approval Center.": "請在核准中心核准精確內容。",
  "This task cannot spend funds.": "此任務不得支出資金。",
  "Request a new budget decision and approval.": "請提出新的預算決策與核准。",
  "Missing plan-bound idempotency key.": "缺少綁定計畫的冪等鍵。",
  "Compile a current plan version.": "請編譯目前計畫版本。",
};

export function localizeLabel(value: string, locale: Locale = activeLocale) {
  if (locale !== "zh-TW") return value.replaceAll("_", " ");
  return labels[value] ?? value.replaceAll("_", " ");
}

export function localizeDomainText(value?: string, locale: Locale = activeLocale): string {
  if (!value || locale !== "zh-TW") return value ?? "";
  const direct = domainText[value] ?? labels[value];
  if (direct) return direct;

  let translated = value;
  translated = translated.replace(/^Budget limit stated as NT\$([\d,]+)\.$/, (_match, amount: string) => `預算上限為 NT$${amount}。`);
  translated = translated.replace(/^Approval or review is (\d{4}-\d{2}-\d{2})\.$/, "核准或審查日期為 $1。");
  translated = translated.replace(/^Mission deadline is (\d{4}-\d{2}-\d{2})\.$/, "Mission 期限為 $1。");
  translated = translated.replace(/^Sources state (.+)\. The plan cannot safely allocate spend until one value supersedes the other\.$/, "來源分別提出 $1。在確認由哪個數值取代另一個前，計畫無法安全分配支出。");
  translated = translated.replace(/^Use the most recent, highest-authority limit \(currently (.+)\) and explicitly supersede the older assertion\.$/, "採用最新且權威最高的上限（目前為 $1），並明確取代舊主張。");
  translated = translated.replace(/Budget limit stated as NT\$([\d,]+)\./g, (_match, amount: string) => `NT$${amount}`);
  translated = translated.replace(/^The launch is due (\d{4}-\d{2}-\d{2}), while the required review occurs (\d{4}-\d{2}-\d{2})\. Both conditions cannot be true\.$/, "發布期限為 $1，但必要審查在 $2，兩項條件無法同時成立。");
  translated = translated.replace(/^Tasks use evidence from (.+)\.$/, "任務會使用來自 $1 的證據。");
  translated = translated.replace(/^(.+): read selected resources$/, "$1：讀取指定資源");
  translated = translated.replace(/^(.+): read account status$/, "$1：讀取帳號狀態");
  translated = translated.replace(/^(.+): create campaign draft$/, "$1：建立行銷活動草稿");
  translated = translated.replace(/^CRM: read audience$/, "CRM：讀取受眾");
  translated = translated.replace(/^CRM: write mission-scoped segment$/, "CRM：寫入限定於此 Mission 的名單");
  translated = translated.replace(/^Gmail: create draft$/, "Gmail：建立草稿");
  translated = translated.replace(/^Meta Ads: create draft$/, "Meta Ads：建立草稿");
  translated = translated.replace(/^Gmail: send approved draft$/, "Gmail：寄送已核准草稿");
  translated = translated.replace(/^Meta Ads: publish approved campaign$/, "Meta Ads：發布已核准行銷活動");
  translated = translated.replace(/^Plan v(\d+) → v(\d+)$/, "計畫 v$1 → v$2");
  translated = translated.replace(/^Conflict resolutions were compiled into task constraints and preflight rules\.$/, "衝突解法已編譯為任務限制與執行前檢查規則。");
  translated = translated.replace(/^(\d+) blocking conflicts prevent external execution\.$/, "$1 項阻擋性衝突禁止對外執行。");
  translated = translated.replace(/^Task is bound to Plan v(\d+) \((.+)\)\.$/, "任務已綁定至計畫 v$1（$2）。");
  translated = translated.replace(/^(\d+) blocking conflicts remain\.$/, "仍有 $1 項阻擋性衝突。");
  translated = translated.replace(/^(\d+) source snapshots are attached to this mission\.$/, "此 Mission 已附加 $1 份來源快照。");
  translated = translated.replace(/^Missing verified access: (.+)\.$/, "缺少已驗證存取權：$1。");
  translated = translated.replace(/^Risk level (\d+) does not require exact external approval\.$/, "風險等級 $1 不需要精確對外核准。");
  translated = translated.replace(/^Approval is (.+)\.$/, "核准狀態為 $1。");
  translated = translated.replace(/^Task budget cap is NT\$([\d,]+)\.$/, (_match, amount: string) => `任務預算上限為 NT$${amount}。`);
  translated = translated.replace(/^Idempotency key: (.+)\. Rollback is defined\.$/, "冪等鍵：$1。已定義回滾策略。");
  translated = translated.replace(/^(\d+) assertions compiled into (\d+) conflicts and Plan v(\d+)\.$/, "已將 $1 項意圖主張編譯為 $2 項衝突與計畫 v$3。");
  translated = translated.replace(/^Plan v(\d+) activated; previous approvals invalidated\.$/, "計畫 v$1 已啟用；舊版核准已失效。");
  translated = translated.replace(/^(.+) (approved|rejected)\.$/, "$1 $2。");
  translated = translated.replace(/^(T-\d+) blocked by preflight\.$/, "$1 已被執行前檢查阻擋。");
  translated = translated.replace(/^(T-\d+) (.+) completed under a passing preflight\.$/, "$1 $2 已在通過執行前檢查後完成。");
  translated = translated.replace(/^Outcome marked (.+)\.$/, "成果已標記為 $1。");
  if (/^T-\d+:/.test(value)) {
    translated = value
      .replaceAll("ready", "可執行")
      .replaceAll("pending", "等待中")
      .replaceAll("blocked", "已阻擋")
      .replaceAll("completed", "已完成")
      .replaceAll("missing", "缺少");
  }
  if (translated !== value) {
    for (const [english, chinese] of Object.entries(domainText)) translated = translated.replaceAll(english, chinese);
    translated = translated
      .replaceAll("（draft）", "（草稿）")
      .replaceAll("（active）", "（生效中）")
      .replaceAll("（superseded）", "（已被新版取代）")
      .replaceAll(" pending。", " 等待中。")
      .replaceAll(" approved。", " 已核准。")
      .replaceAll(" rejected。", " 已拒絕。")
      .replaceAll(" not_started。", " 尚未開始。")
      .replaceAll(" on_track。", " 進度正常。")
      .replaceAll(" at_risk。", " 有風險。")
      .replaceAll(" achieved。", " 已達成。")
      .replaceAll(" missed。", " 未達成。");
    translated = translated.replaceAll(" and ", " 與 ");
  }
  return translated;
}

export function localizePayloadKey(key: string) {
  if (activeLocale !== "zh-TW") return key.replace(/([A-Z])/g, " $1").trim();
  return ({
    action: "操作",
    audience: "受眾",
    creative: "素材",
    maximumBudgetTwd: "最高預算（TWD）",
    planVersion: "計畫版本",
    start: "開始條件",
    stop: "停止條件",
  } as Record<string, string>)[key] ?? key;
}
