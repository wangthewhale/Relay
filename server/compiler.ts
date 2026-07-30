import { createHash, randomUUID } from "node:crypto";
import type {
  AccessRequirement,
  ApprovalRequest,
  Conflict,
  CreateMissionInput,
  ExecutionTask,
  IntentAssertion,
  PlanVersion,
  ResolutionOption,
  SourceInput,
} from "../shared/domain";

type StoredSource = SourceInput & { id: string; createdAt: string };

const isoNow = () => new Date().toISOString();
const uid = () => randomUUID();

function inferPrimaryType(content: string): IntentAssertion["type"] {
  const text = content.toLowerCase();
  if (/budget|預算|上限|不得超過/.test(text)) return "Budget";
  if (/approve|approval|審核|審查|核准|批准/.test(text)) return "Approval requirement";
  if (/deadline|launch|推出|上線|以前|之前/.test(text)) return "Deadline";
  if (/exclude|不能向|排除|不得寄|既有會員/.test(text)) return "Exclusion";
  if (/target|目標|成功|付費|conversion|轉換/.test(text)) return "Success metric";
  if (/policy|規範|法規|不得|禁止/.test(text)) return "Policy";
  if (/need|requires|需要|依賴|before|才能/.test(text)) return "Dependency";
  return "Constraint";
}

function normalizeStatement(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 480);
}

function parseBudgetValues(content: string): number[] {
  const matches = [
    ...content.matchAll(/(?:NT\$|TWD|預算(?:上限)?(?:為|是|不得超過|不超過)?\s*)\s*([0-9][0-9,]*)/gi),
  ];
  return matches
    .map((match) => Number(match[1].replaceAll(",", "")))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function parseDates(content: string): Array<{ date: string; label: string }> {
  const dates: Array<{ date: string; label: string }> = [];
  const year = new Date().getFullYear();
  for (const match of content.matchAll(/(?:(20\d{2})\s*[年/-])?\s*(1[0-2]|0?[1-9])\s*[月/-]\s*(3[01]|[12]\d|0?[1-9])\s*(?:日)?/g)) {
    const parsedYear = Number(match[1] || year);
    const month = String(Number(match[2])).padStart(2, "0");
    const day = String(Number(match[3])).padStart(2, "0");
    dates.push({ date: `${parsedYear}-${month}-${day}`, label: match[0].trim() });
  }
  for (const match of content.matchAll(/(?:July|Jul)\s+(3[01]|[12]\d|0?[1-9])(?:,\s*(20\d{2}))?/gi)) {
    dates.push({ date: `${Number(match[2] || year)}-07-${String(Number(match[1])).padStart(2, "0")}`, label: match[0] });
  }
  return dates;
}

function pushAssertion(
  assertions: IntentAssertion[],
  source: StoredSource | undefined,
  statement: string,
  type: IntentAssertion["type"],
  metadata: Record<string, unknown> = {},
  confidence = 0.88,
) {
  const normalized = normalizeStatement(statement);
  const duplicate = assertions.find(
    (assertion) => assertion.sourceId === source?.id && assertion.type === type && assertion.statement === normalized,
  );
  if (duplicate) {
    duplicate.metadata = { ...duplicate.metadata, ...metadata };
    duplicate.confidence = Math.max(duplicate.confidence, confidence);
    return;
  }
  assertions.push({
    id: uid(),
    sourceId: source?.id,
    statement: normalized,
    type,
    authorityLevel: source?.authorityLevel ?? 4,
    confidence,
    scope: "mission",
    metadata,
    createdAt: isoNow(),
  });
}

function extractDeterministicSemanticSignals(assertions: IntentAssertion[], source: StoredSource, content: string) {
  const refundMentioned = /\brefund(?:ed|ing)?\b|退款/i.test(content);
  if (refundMentioned) {
    const forbidden = /\bno\s+refund\b|\brefund\b.{0,40}\b(?:must not|may not|cannot|can't|forbidden)\b|\b(?:must not|may not|cannot|can't|do not)\b.{0,40}\brefund\b|不得.{0,24}退款|不可.{0,24}退款|不能.{0,24}退款|禁止.{0,24}退款/i.test(content);
    const required = /\b(?:promise|promised|promises|issue|send|provide|approve|approved|must issue|will issue)\b.{0,40}\brefund\b|\brefund\b.{0,40}\b(?:today|required|approved|promised)\b|承諾.{0,24}退款|必須.{0,24}退款|核准.{0,24}退款|今天.{0,24}退款/i.test(content);
    if (forbidden || required) {
      pushAssertion(assertions, source, content, "Constraint", {
        actionKey: "refund",
        actionPolarity: forbidden ? "forbids" : "requires",
        context: content,
        origin: "deterministic_semantic_signal",
      }, 0.91);
    }
  }

  const scopeMentioned = /\bscope\b|\bpackage\b|\bdeliver(?:y|able|ables)?\b|landing page|social posts?|email sequence|交付|範圍|規格|素材/i.test(content);
  if (scopeMentioned) {
    const supersedes = /\breplace\b|\binstead\b|\bsupersed(?:e|es|ed)\b|\bdo not deliver\b|\bno longer\b|改為|取代|不再|不要交付/i.test(content);
    const approved = /\bapproved\b|\bcurrent\b|\bfinal\b|已核准|核准版本|目前版本|最終版本/i.test(content);
    if (supersedes || approved) {
      pushAssertion(assertions, source, content, "Constraint", {
        subject: "delivery_scope",
        scopeVersionState: supersedes ? "supersedes" : "approved",
        context: content,
        origin: "deterministic_semantic_signal",
      }, 0.9);
    }
  }
}

export function extractAssertions(input: CreateMissionInput, sources: StoredSource[]): IntentAssertion[] {
  const assertions: IntentAssertion[] = [];
  pushAssertion(assertions, undefined, input.objective, "Goal", { origin: "mission_intake" }, 0.99);
  pushAssertion(assertions, undefined, input.successMetric, "Success metric", { origin: "mission_intake" }, 0.99);

  for (const value of parseBudgetValues(input.objective)) {
    pushAssertion(assertions, undefined, `Budget limit stated as NT$${value.toLocaleString("en-US")}.`, "Budget", {
      value,
      currency: "TWD",
      context: input.objective,
      origin: "mission_intake",
    }, 0.96);
  }

  for (const parsed of parseDates(input.objective)) {
    const isApproval = /approve|approval|審核|審查|核准|批准|review/i.test(input.objective);
    pushAssertion(
      assertions,
      undefined,
      `${isApproval ? "Approval or review" : "Mission deadline"} is ${parsed.date}.`,
      isApproval ? "Approval requirement" : "Deadline",
      { date: parsed.date, context: input.objective, isApproval, origin: "mission_intake" },
      0.94,
    );
  }

  if (/existing members|既有會員|現有會員/i.test(input.objective)) {
    const exclusion = /exclude|do not (?:promote|contact|include)|must not (?:promote|contact|include)|不能向|排除|不得.*(?:推廣|寄送)|不包含/i.test(input.objective);
    pushAssertion(
      assertions,
      undefined,
      exclusion ? "Existing members must be excluded from the campaign audience." : "The current audience contains existing members.",
      exclusion ? "Exclusion" : "Constraint",
      { subject: "existing_members", polarity: exclusion ? "exclude" : "include", context: input.objective, origin: "mission_intake" },
      0.95,
    );
  }

  for (const source of sources) {
    const content = source.content;
    pushAssertion(assertions, source, content, inferPrimaryType(content), { sourceType: source.type }, 0.86);
    extractDeterministicSemanticSignals(assertions, source, content);

    for (const value of parseBudgetValues(content)) {
      pushAssertion(assertions, source, `Budget limit stated as NT$${value.toLocaleString("en-US")}.`, "Budget", {
        value,
        currency: "TWD",
        context: content,
      }, 0.96);
    }

    for (const parsed of parseDates(content)) {
      const isApproval = /approve|approval|審核|審查|核准|批准|review/i.test(content);
      pushAssertion(
        assertions,
        source,
        `${isApproval ? "Approval or review" : "Mission deadline"} is ${parsed.date}.`,
        isApproval ? "Approval requirement" : "Deadline",
        { date: parsed.date, context: content, isApproval },
        0.94,
      );
    }

    if (/existing members|既有會員|現有會員/i.test(content)) {
      const exclusion = /exclude|do not (?:promote|contact|include)|must not (?:promote|contact|include)|不能向|排除|不得.*(?:推廣|寄送)|不包含/i.test(content);
      pushAssertion(
        assertions,
        source,
        exclusion ? "Existing members must be excluded from the campaign audience." : "The current audience contains existing members.",
        exclusion ? "Exclusion" : "Constraint",
        { subject: "existing_members", polarity: exclusion ? "exclude" : "include", context: content },
        0.95,
      );
    }

    if (/payment method|付款方式|billing profile|信用卡/i.test(content)) {
      const missing = /missing|not set|尚未|缺少|沒有/i.test(content);
      pushAssertion(
        assertions,
        source,
        missing ? "The advertising account does not have a verified payment method." : "A payment method is available.",
        "Dependency",
        { dependency: "ads_payment_method", state: missing ? "missing" : "available", context: content },
        0.94,
      );
    }

    if (/(?:without|requires?|needs?).{0,35}(?:approval|review)|沒有批准|未核准|未經.{0,18}(?:批准|核准|審核|審查).{0,20}(?:不得|不能)|不能公開|不得公開|(?:需|需要|必須).{0,25}(?:批准|核准|審核|審查)/i.test(content)) {
      pushAssertion(
        assertions,
        source,
        "Public release requires explicit approval from an authorized decision maker.",
        "Approval requirement",
        { action: "public_release", required: true, context: content },
        0.96,
      );
    }
  }

  return assertions;
}

function optionSet(recommended: string, alternativeA: string, alternativeB: string): ResolutionOption[] {
  return [
    {
      id: "recommended",
      label: "Recommended resolution",
      description: recommended,
      recommended: true,
      timeImpact: "Preserves the earliest safe delivery path",
      budgetImpact: "No unapproved increase",
      outcomeImpact: "Protects the defined success metric",
      risk: "Lowest residual risk",
    },
    {
      id: "alternative-a",
      label: "Alternative A",
      description: alternativeA,
      recommended: false,
      timeImpact: "May move the launch window",
      budgetImpact: "Requires a new budget check",
      outcomeImpact: "Moderate impact on reach or timing",
      risk: "Moderate",
    },
    {
      id: "alternative-b",
      label: "Alternative B",
      description: alternativeB,
      recommended: false,
      timeImpact: "Fastest but most constrained",
      budgetImpact: "Keeps spend at the lowest stated limit",
      outcomeImpact: "May reduce the chance of hitting the target",
      risk: "High — requires an explicit exception",
    },
  ];
}

function conflictBase(partial: Omit<Conflict, "id" | "status" | "createdAt">): Conflict {
  return { id: uid(), status: "open", createdAt: isoNow(), ...partial };
}

export function detectConflicts(assertions: IntentAssertion[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const budgets = assertions.filter((assertion) => assertion.type === "Budget" && typeof assertion.metadata.value === "number");
  const uniqueBudgets = [...new Set(budgets.map((assertion) => Number(assertion.metadata.value)))];
  if (uniqueBudgets.length > 1) {
    const highestAuthority = [...budgets].sort((a, b) => b.authorityLevel - a.authorityLevel)[0];
    conflicts.push(
      conflictBase({
        type: "Version conflict",
        title: "Two budget ceilings are active",
        summary: `Sources state ${uniqueBudgets.map((value) => `NT$${value.toLocaleString("en-US")}`).join(" and ")}. The plan cannot safely allocate spend until one value supersedes the other.`,
        severity: "critical",
        blocking: true,
        sourceAssertionIds: budgets.map((item) => item.id),
        decisionOwner: "Mission owner",
        consequences: "Agents may overspend, underfund the campaign, or rely on an obsolete approval.",
        options: optionSet(
          `Use the most recent, highest-authority limit (currently ${highestAuthority.statement}) and explicitly supersede the older assertion.`,
          "Keep the lower ceiling and reduce campaign scope to fit.",
          "Request a budget exception with a new exact approval and expiration.",
        ),
      }),
    );
  }

  const dated = assertions.filter((assertion) => typeof assertion.metadata.date === "string");
  const launchDates = dated.filter((assertion) => !assertion.metadata.isApproval);
  const approvalDates = dated.filter((assertion) => assertion.metadata.isApproval);
  const earliestLaunch = [...launchDates].sort((a, b) => String(a.metadata.date).localeCompare(String(b.metadata.date)))[0];
  const latestApproval = [...approvalDates].sort((a, b) => String(b.metadata.date).localeCompare(String(a.metadata.date)))[0];
  if (earliestLaunch && latestApproval && String(latestApproval.metadata.date) > String(earliestLaunch.metadata.date)) {
    conflicts.push(
      conflictBase({
        type: "Hard conflict",
        title: "Launch is scheduled before required approval",
        summary: `The launch is due ${earliestLaunch.metadata.date}, while the required review occurs ${latestApproval.metadata.date}. Both conditions cannot be true.`,
        severity: "critical",
        blocking: true,
        sourceAssertionIds: [earliestLaunch.id, latestApproval.id],
        decisionOwner: "Brand approver",
        decisionDueAt: String(earliestLaunch.metadata.date),
        consequences: "Publishing on the current date would bypass a mandatory approval; waiting silently would miss the deadline.",
        options: optionSet(
          "Move the brand review before launch and preserve the launch date only after the approver accepts the exact payload.",
          "Move launch to the first safe slot after brand review.",
          "Ship a private internal preview only; do not publish externally.",
        ),
      }),
    );
  }

  const exclusion = assertions.find((assertion) => assertion.metadata.subject === "existing_members" && assertion.metadata.polarity === "exclude");
  const inclusion = assertions.find((assertion) => assertion.metadata.subject === "existing_members" && assertion.metadata.polarity === "include");
  if (exclusion && inclusion) {
    conflicts.push(
      conflictBase({
        type: "Policy conflict",
        title: "Audience violates the exclusion policy",
        summary: "The campaign must exclude existing members, but the current CRM audience still contains them.",
        severity: "high",
        blocking: true,
        sourceAssertionIds: [exclusion.id, inclusion.id],
        decisionOwner: "CRM owner",
        consequences: "Existing members may receive prohibited outreach and the launch approval would not match the actual audience.",
        options: optionSet(
          "Create and verify a suppression segment for existing members before any draft is approved.",
          "Use a new audience sourced only from verified non-members.",
          "Pause outbound promotion and launch through owned channels only.",
        ),
      }),
    );
  }

  const missingPayment = assertions.find(
    (assertion) => assertion.metadata.dependency === "ads_payment_method" && assertion.metadata.state === "missing",
  );
  if (missingPayment) {
    conflicts.push(
      conflictBase({
        type: "Dependency conflict",
        title: "Advertising payment capability is missing",
        summary: "The plan requires paid distribution, but the advertising account has no verified payment method.",
        severity: "high",
        blocking: true,
        sourceAssertionIds: [missingPayment.id],
        decisionOwner: "Workspace billing admin",
        consequences: "The campaign cannot launch and any related approval would be unusable.",
        options: optionSet(
          "Ask the billing admin to verify a payment method, then run a read-only capability check before approval.",
          "Remove paid distribution and recompile the plan around organic channels.",
          "Transfer the draft to an already verified ad account after scope and ownership review.",
        ),
      }),
    );
  }

  const externalApproval = assertions.find(
    (assertion) => assertion.type === "Approval requirement" && assertion.metadata.action === "public_release",
  );
  if (externalApproval) {
    conflicts.push(
      conflictBase({
        type: "Authority conflict",
        title: "Release authority is not assigned",
        summary: "Public release requires approval, but the current sources do not name the authorized approver or define the approval lifetime.",
        severity: "high",
        blocking: true,
        sourceAssertionIds: [externalApproval.id],
        decisionOwner: "Workspace admin",
        consequences: "Relay cannot determine whose approval is valid, and a generic approval could be reused for the wrong payload.",
        options: optionSet(
          "Assign one named approver and bind approval to the active plan version, exact payload hash, budget, audience and expiration.",
          "Require two approvers for public launch and budget spend.",
          "Keep all work at Draft risk level until authority is assigned.",
        ),
      }),
    );
  }

  const refundRequirements = assertions.filter((assertion) => assertion.metadata.actionKey === "refund" && assertion.metadata.actionPolarity === "requires");
  const refundProhibitions = assertions.filter((assertion) => assertion.metadata.actionKey === "refund" && assertion.metadata.actionPolarity === "forbids");
  const refundRequirement = [...refundRequirements].sort((a, b) => b.authorityLevel - a.authorityLevel)[0];
  const refundProhibition = [...refundProhibitions].sort((a, b) => b.authorityLevel - a.authorityLevel)[0];
  if (refundRequirement && refundProhibition && refundRequirement.sourceId !== refundProhibition.sourceId) {
    conflicts.push(
      conflictBase({
        type: "Policy conflict",
        title: "Refund action is simultaneously required and forbidden",
        summary: "One source commits the team to a refund while another source forbids issuing it under the current payment process.",
        severity: "high",
        blocking: true,
        sourceAssertionIds: [refundRequirement.id, refundProhibition.id],
        decisionOwner: "Finance owner",
        consequences: "Continuing both paths can create a duplicate refund, an unresolved chargeback, or a misleading customer promise.",
        options: optionSet(
          "Pause both financial actions, verify the active payment state, then let the Finance owner select exactly one settlement path.",
          "Close the chargeback path before issuing a newly approved refund.",
          "Keep the chargeback path and send a human-reviewed correction to the customer.",
        ),
      }),
    );
  }

  const approvedScopes = assertions.filter((assertion) => assertion.metadata.subject === "delivery_scope" && assertion.metadata.scopeVersionState === "approved");
  const supersedingScopes = assertions.filter((assertion) => assertion.metadata.subject === "delivery_scope" && assertion.metadata.scopeVersionState === "supersedes");
  const approvedScope = [...approvedScopes].sort((a, b) => b.authorityLevel - a.authorityLevel)[0];
  const supersedingScope = [...supersedingScopes].sort((a, b) => b.authorityLevel - a.authorityLevel)[0];
  if (approvedScope && supersedingScope && approvedScope.sourceId !== supersedingScope.sourceId) {
    conflicts.push(
      conflictBase({
        type: "Version conflict",
        title: "The approved delivery scope has been superseded",
        summary: "An approved deliverable set and a later replacement instruction cannot both remain the active scope.",
        severity: "high",
        blocking: true,
        sourceAssertionIds: [approvedScope.id, supersedingScope.id],
        decisionOwner: "Mission owner",
        consequences: "Agents may deliver obsolete work, omit the replacement deliverables, or create avoidable rework.",
        options: optionSet(
          "Confirm the replacement instruction as the current scope, invalidate affected drafts, and compile a new plan version.",
          "Keep the approved scope and ask the requester to withdraw the replacement instruction.",
          "Pause delivery and request one exact scope signed off by both owners.",
        ),
      }),
    );
  }

  if (conflicts.length === 0 && assertions.length >= 2) {
    const lowAuthority = [...assertions].sort((a, b) => a.authorityLevel - b.authorityLevel)[0];
    conflicts.push(
      conflictBase({
        type: "Authority conflict",
        title: "Source authority has not been established",
        summary: "Relay found multiple actionable assertions, but no source hierarchy explains which instruction wins when the mission changes.",
        severity: "medium",
        blocking: false,
        sourceAssertionIds: [lowAuthority.id],
        decisionOwner: "Mission owner",
        consequences: "A later correction could silently override a higher-authority policy.",
        options: optionSet(
          "Confirm a source authority order for this mission before activating external tasks.",
          "Treat all sources as equal and require a human decision on every conflict.",
          "Limit the plan to read and draft actions only.",
        ),
      }),
    );
  }

  return conflicts;
}

function providerForSource(source: StoredSource): string | undefined {
  if (["Gmail", "Google Drive", "Slack", "Notion", "Google Calendar"].includes(source.type)) return source.type;
  if (source.type === "Email") return "Gmail";
  if (source.type === "Calendar") return "Google Calendar";
  if (source.type === "Ads" || /Meta|Facebook|Instagram/i.test(source.content)) return "Meta Ads";
  if (source.type === "CRM") return "CRM";
  return undefined;
}

function buildAccessBlueprint(sources: StoredSource[]): AccessRequirement[] {
  const providers = new Map<string, StoredSource[]>();
  for (const source of sources) {
    const provider = providerForSource(source);
    if (!provider) continue;
    providers.set(provider, [...(providers.get(provider) ?? []), source]);
  }
  return [...providers.entries()].map(([provider, linkedSources], index) => {
    const publish = provider === "Meta Ads";
    return {
      id: uid(),
      provider,
      capabilities: publish ? ["read account status", "create campaign draft"] : ["read selected resources"],
      whyNeeded: `Tasks use evidence from ${linkedSources.map((source) => source.title).join(", ")}.`,
      taskKeys: publish ? ["T-05", "T-07"] : ["T-01", "T-03"],
      resourceScope: publish ? "One named ad account; draft only until exact approval" : "Only the resources attached to this mission",
      accessLevel: publish ? "draft" : "read",
      status: "not_connected",
      expiration: undefined,
    } satisfies AccessRequirement;
  });
}

function stablePayloadHash(payload: Record<string, unknown>) {
  return `sha256:${createHash("sha256").update(JSON.stringify(payload, Object.keys(payload).sort())).digest("hex")}`;
}

export function compilePlan(args: {
  input: Pick<CreateMissionInput, "objective" | "successMetric" | "createdBy">;
  sources: StoredSource[];
  conflicts: Conflict[];
  version: number;
  previous?: PlanVersion;
}): PlanVersion {
  const { input, sources, conflicts, version, previous } = args;
  const unresolvedBlocking = conflicts.filter((conflict) => conflict.blocking && conflict.status === "open");
  const accessBlueprint = buildAccessBlueprint(sources);
  const capabilities = accessBlueprint.flatMap((item) => item.capabilities.map((capability) => `${item.provider}: ${capability}`));
  const blocked = unresolvedBlocking.length > 0;
  const tasks: ExecutionTask[] = [
    {
      id: uid(), key: "T-01", title: "Validate mission evidence", goal: "Confirm every assertion has a source and current timestamp.",
      ownerType: "agent", ownerName: "Evidence Agent", status: "ready", riskLevel: 0, dependencies: [], requiredInputs: ["Mission sources"],
      expectedOutputs: ["Evidence-backed assertion set"], definitionOfDone: "Every actionable assertion links to its source.", requiredCapabilities: capabilities,
      forbiddenActions: ["Write to external systems"], timeLimitMinutes: 10, approvalPolicy: "No approval; read-only", retryPolicy: { maxAttempts: 2, backoffMinutes: 2 },
      stopCondition: "Stop if a source cannot be accessed or its identity is ambiguous.", rollbackStrategy: "Discard the derived assertion set and retain source evidence.",
      requiredEvidence: ["Source ID", "Timestamp", "Extraction confidence"], outcomeMetric: "100% assertion source coverage",
    },
    {
      id: uid(), key: "T-02", title: "Resolve blocking intent conflicts", goal: "Convert contradictions into explicit, owned decisions.",
      ownerType: "human", ownerName: "Mission owner", status: blocked ? "blocked" : "completed", riskLevel: 0, dependencies: ["T-01"],
      requiredInputs: ["Conflict inbox", "Decision authority"], expectedOutputs: ["Signed conflict resolutions"], definitionOfDone: "All blocking conflicts have a named decision and rationale.",
      requiredCapabilities: [], forbiddenActions: ["Auto-resolve authority or policy conflicts"], timeLimitMinutes: 60, approvalPolicy: "Decision maker must be named",
      retryPolicy: { maxAttempts: 1, backoffMinutes: 0 }, stopCondition: "Stop when decision authority is unclear.", rollbackStrategy: "Invalidate the decision and restore the conflict to open.",
      requiredEvidence: ["Decision", "Decision maker", "Reason", "Affected version"], outcomeMetric: "0 unresolved blocking conflicts",
    },
    {
      id: uid(), key: "T-03", title: "Create the campaign execution brief", goal: "Turn the resolved intent into a reviewable execution artifact.",
      ownerType: "agent", ownerName: "Planning Agent", status: blocked ? "blocked" : "ready", riskLevel: 1, dependencies: ["T-02"],
      requiredInputs: ["Resolved assertions", "Success metric"], expectedOutputs: ["Versioned campaign brief"], definitionOfDone: "Brief states scope, exclusions, budget, deadline and success metric.",
      requiredCapabilities: capabilities.filter((item) => !item.startsWith("Meta Ads")), forbiddenActions: ["Send email", "Publish content", "Spend funds"], timeLimitMinutes: 20,
      approvalPolicy: "Draft may be generated without approval", retryPolicy: { maxAttempts: 2, backoffMinutes: 3 }, stopCondition: "Stop if the active plan version changes.",
      rollbackStrategy: "Archive the draft under the superseded plan version.", requiredEvidence: ["Plan version", "Source links", "Generated artifact"], outcomeMetric: "Brief passes all contract invariants",
    },
    {
      id: uid(), key: "T-04", title: "Prepare verified audience and internal records", goal: "Apply exclusions and prepare internal launch records.",
      ownerType: "agent", ownerName: "Operations Agent", status: blocked ? "blocked" : "pending", riskLevel: 2, dependencies: ["T-03"],
      requiredInputs: ["Approved audience rules"], expectedOutputs: ["Suppressed audience", "Internal launch record"], definitionOfDone: "Audience excludes prohibited members and changes are auditable.",
      requiredCapabilities: ["CRM: read audience", "CRM: write mission-scoped segment"], forbiddenActions: ["Contact customers", "Delete CRM records"], timeLimitMinutes: 25,
      approvalPolicy: "Allowed by workspace policy after a passing preflight", retryPolicy: { maxAttempts: 2, backoffMinutes: 5 }, stopCondition: "Stop if suppression count is zero or source scope changes.",
      rollbackStrategy: "Delete the mission-scoped draft segment; never alter source records.", requiredEvidence: ["Audience count", "Suppression query", "Change event"], outcomeMetric: "0 prohibited members in final audience",
    },
    {
      id: uid(), key: "T-05", title: "Create external launch drafts", goal: "Prepare email, social and advertising drafts without publishing.",
      ownerType: "agent", ownerName: "Launch Agent", status: blocked ? "blocked" : "pending", riskLevel: 1, dependencies: ["T-03", "T-04"],
      requiredInputs: ["Campaign brief", "Verified audience"], expectedOutputs: ["Email draft", "Social draft", "Ad campaign draft"], definitionOfDone: "All artifacts exist as drafts and share one payload version.",
      requiredCapabilities: ["Gmail: create draft", "Meta Ads: create draft"], forbiddenActions: ["Send", "Publish", "Activate ads"], timeLimitMinutes: 30,
      approvalPolicy: "Draft only; external actions remain blocked", retryPolicy: { maxAttempts: 2, backoffMinutes: 5 }, stopCondition: "Stop if any provider reports a scope or identity mismatch.",
      rollbackStrategy: "Delete only Relay-created drafts using their idempotency keys.", requiredEvidence: ["Draft IDs", "Creative checksum", "Audience checksum"], outcomeMetric: "All launch artifacts ready for one exact review",
    },
    {
      id: uid(), key: "T-06", title: "Review the exact release payload", goal: "Bind human approval to the precise action and active plan version.",
      ownerType: "human", ownerName: "Named approver", status: blocked ? "blocked" : "pending", riskLevel: 3, dependencies: ["T-05"], requiredInputs: ["Exact payload", "Budget", "Audience", "Stop condition"],
      expectedOutputs: ["Approval decision"], definitionOfDone: "A named approver accepts or rejects the payload hash before expiration.", requiredCapabilities: [], forbiddenActions: ["Generic approval", "Reuse approval after payload change"],
      timeLimitMinutes: 120, approvalPolicy: "Exact approval required", retryPolicy: { maxAttempts: 1, backoffMinutes: 0 }, stopCondition: "Stop when plan, audience, budget or creative changes.",
      rollbackStrategy: "Invalidate approval and request a new decision.", requiredEvidence: ["Approver", "Payload hash", "Expiration", "Decision reason"], outcomeMetric: "No stale or ambiguous approval used",
    },
    {
      id: uid(), key: "T-07", title: "Execute approved launch", goal: "Perform only the externally approved actions.", ownerType: "agent", ownerName: "Launch Agent",
      status: blocked ? "blocked" : "pending", riskLevel: 3, dependencies: ["T-06"], requiredInputs: ["Valid exact approval", "Verified provider access"], expectedOutputs: ["Launch receipts", "External IDs"],
      definitionOfDone: "Every approved action returns a provider receipt and audit event.", requiredCapabilities: ["Gmail: send approved draft", "Meta Ads: publish approved campaign"],
      forbiddenActions: ["Change budget", "Change audience", "Use a different creative"], budgetLimit: 30_000, timeLimitMinutes: 15, approvalPolicy: "Valid approval for this version and hash",
      retryPolicy: { maxAttempts: 1, backoffMinutes: 0 }, stopCondition: "Stop if CPA exceeds NT$1,250 after 10 conversions or any provider payload differs.",
      rollbackStrategy: "Pause the campaign and preserve all provider receipts; do not delete evidence.", requiredEvidence: ["Provider receipt", "Idempotency key", "Payload hash"], outcomeMetric: input.successMetric,
    },
    {
      id: uid(), key: "T-08", title: "Verify mission outcome", goal: "Measure the result against the original success contract.", ownerType: "agent", ownerName: "Outcome Agent",
      status: "pending", riskLevel: 0, dependencies: ["T-07"], requiredInputs: ["Launch receipts", "Outcome data"], expectedOutputs: ["Outcome report"],
      definitionOfDone: "Actual outcome, cost, time and interventions are recorded.", requiredCapabilities: ["Read mission-scoped analytics"], forbiddenActions: ["Change historical results"],
      timeLimitMinutes: 15, approvalPolicy: "No approval; read-only", retryPolicy: { maxAttempts: 3, backoffMinutes: 15 }, stopCondition: "Stop if attribution source is unavailable or inconsistent.",
      rollbackStrategy: "Mark outcome as unverified and retain raw evidence.", requiredEvidence: ["Metric source", "Time window", "Cost"], outcomeMetric: input.successMetric,
    },
  ];

  const launchTask = tasks.find((task) => task.key === "T-07")!;
  const exactPayload = {
    planVersion: version,
    action: "Launch campaign",
    audience: "Taiwan prospects, excluding existing members",
    creative: "mission-scoped approved drafts",
    maximumBudgetTwd: launchTask.budgetLimit,
    start: "After all dependencies pass preflight",
    stop: launchTask.stopCondition,
  };
  const approvals: ApprovalRequest[] = [{
    id: uid(), taskId: launchTask.id, action: "Approve campaign launch", exactPayload, payloadHash: stablePayloadHash(exactPayload),
    audience: String(exactPayload.audience), budget: launchTask.budgetLimit, startTime: undefined, stopCondition: launchTask.stopCondition,
    requester: "Launch Agent", approver: "Mission owner", status: "pending", expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), createdAt: isoNow(),
  }];

  const diff: PlanVersion["diff"] = previous
    ? [
        { kind: "changed", label: `Plan v${previous.version} → v${version}`, detail: "Conflict resolutions were compiled into task constraints and preflight rules." },
        { kind: "invalidated", label: "Previous approvals", detail: "All approvals from the superseded version are invalid." },
        { kind: "added", label: "Exact release approval", detail: "The launch payload is now hash-bound to this version." },
      ]
    : [
        { kind: "added", label: "Initial execution contract", detail: "Eight governed tasks were derived from the mission evidence." },
        { kind: "added", label: "Blocking gates", detail: `${unresolvedBlocking.length} blocking conflicts prevent external execution.` },
      ];

  return {
    id: uid(), version, status: blocked ? "draft" : "active", changeSummary: blocked ? "Initial draft; execution blocked until conflicts are resolved." : "Resolved intent compiled into an active execution contract.",
    diff, contract: {
      missionGoal: input.objective,
      successMetric: input.successMetric,
      invariants: [
        "Never execute a task from a superseded plan version.",
        "Never perform an external action without a valid exact approval.",
        "Never expose connector credentials to an agent or model context.",
        "Stop when a blocking conflict, permission gap or payload mismatch appears.",
      ],
      generatedAt: isoNow(),
    },
    tasks, accessBlueprint, approvals, createdBy: input.createdBy, createdAt: isoNow(),
  };
}

export const demoMissionInput: CreateMissionInput = {
  title: "Launch Kaohsiung campaign",
  objective: "Launch the Kaohsiung event campaign by July 29 with a maximum approved budget and no promotion to existing members.",
  successMetric: "Acquire 24 paid registrations while keeping CPA at or below NT$1,250.",
  createdBy: "Jennifer",
  sources: [
    { type: "Slack", title: "#kaohsiung-launch", author: "Growth lead", content: "We must launch on 7月29日. Target is 24 paid registrations. Do not promote to existing members.", authorityLevel: 4 },
    { type: "Email", title: "Client brand review", author: "Client", content: "All creative requires client brand approval before public release.", authorityLevel: 5 },
    { type: "Calendar", title: "Brand review", author: "Operations", content: "Brand approval review is scheduled for 7月30日.", authorityLevel: 4 },
    { type: "Notion", title: "Campaign brief v1", author: "Marketing", content: "Campaign budget limit: NT$20,000.", authorityLevel: 2 },
    { type: "Manual", title: "Executive update", author: "Mission owner", content: "The approved budget is NT$30,000 maximum. Nothing can be published without my approval.", authorityLevel: 5 },
    { type: "CRM", title: "Kaohsiung audience", author: "CRM system", content: "Current campaign audience contains existing members and new leads.", authorityLevel: 4 },
    { type: "Ads", title: "Meta Ads account", author: "Ads platform", content: "A payment method is missing; campaign publishing is unavailable.", authorityLevel: 5 },
  ],
};
