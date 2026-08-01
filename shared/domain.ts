import { z } from "zod";

export const sourceTypes = [
  "Slack",
  "Email",
  "Notion",
  "Google Drive",
  "Calendar",
  "CRM",
  "Ads",
  "Meeting note",
  "Manual",
  "GitHub",
  "Figma",
] as const;

export const departments = ["Executive", "Product", "Engineering", "Design", "Finance", "People", "Growth", "Operations", "Other"] as const;
export const missionRoles = ["owner", "decision_maker", "contributor", "observer"] as const;
export const agentRunStatuses = ["queued", "running", "pause_requested", "paused", "cancel_requested", "cancelled", "succeeded", "failed", "blocked"] as const;

export const assertionTypes = [
  "Goal",
  "Constraint",
  "Policy",
  "Assumption",
  "Preference",
  "Deadline",
  "Budget",
  "Approval requirement",
  "Success metric",
  "Exclusion",
  "Dependency",
  "Risk tolerance",
] as const;

export const conflictTypes = [
  "Hard conflict",
  "Resource conflict",
  "Authority conflict",
  "Policy conflict",
  "Version conflict",
  "Dependency conflict",
] as const;

export const sourceInputSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(sourceTypes),
  title: z.string().min(1).max(160),
  author: z.string().min(1).max(120),
  content: z.string().min(3).max(20_000),
  occurredAt: z.string().datetime().optional(),
  authorityLevel: z.number().int().min(1).max(5).default(3),
  evidenceUrl: z.string().url().optional().or(z.literal("")),
});

export const createMissionSchema = z.object({
  title: z.string().min(3).max(160),
  // Keep this multilingual: a complete Traditional Chinese goal can be much
  // shorter in code points than the same English sentence.
  objective: z.string().min(5).max(5_000),
  successMetric: z.string().min(3).max(500),
  executionMode: z.enum(["launch_readiness", "live_launch"]).default("launch_readiness"),
  createdBy: z.string().min(1).max(120).default("Mission owner"),
  sources: z.array(sourceInputSchema).min(2).max(20),
});

export const resolveConflictSchema = z.object({
  optionId: z.string().min(1),
  reason: z.string().min(3).max(2_000),
  decidedBy: z.string().min(1).max(120),
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  decidedBy: z.string().min(1).max(120),
  reason: z.string().min(3).max(2_000),
});

export const correctionSchema = z.object({
  statement: z.string().min(5).max(5_000),
  assertionType: z.enum(assertionTypes).default("Constraint"),
  author: z.string().min(1).max(120),
});

export const outcomeSchema = z.object({
  metricName: z.string().min(2).max(200),
  targetValue: z.string().min(1).max(200),
  actualValue: z.string().max(200).default(""),
  status: z.enum(["not_started", "on_track", "at_risk", "achieved", "missed"]),
  cost: z.number().min(0).default(0),
  durationMinutes: z.number().int().min(0).default(0),
  humanInterventions: z.number().int().min(0).default(0),
  teamSize: z.number().int().min(1).max(500).default(1),
  baselineMeetings: z.number().int().min(0).max(100).default(0),
  actualMeetings: z.number().int().min(0).max(100).default(0),
  meetingMinutes: z.number().int().min(0).max(480).default(0),
  recommendation: z.string().max(2_000).default(""),
});

export const inviteMemberSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(120),
  title: z.string().max(120).default(""),
  department: z.enum(departments).default("Other"),
  workspaceRole: z.enum(["admin", "member", "viewer"]).default("member"),
  missionRole: z.enum(missionRoles).default("contributor"),
  locale: z.enum(["en", "zh-TW"]).default("zh-TW"),
});

export const presenceSchema = z.object({
  connectionId: z.string().uuid(),
  state: z.enum(["viewing", "editing", "deciding", "away"]).default("viewing"),
  cursorContext: z.string().max(240).default("mission_room"),
});

export const commentSchema = z.object({
  body: z.string().min(1).max(5_000),
  mentions: z.array(z.string().uuid()).max(25).default([]),
  taskId: z.string().uuid().optional(),
  conflictId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
});

export const handoffSchema = z.object({
  taskId: z.string().uuid(),
  toUserId: z.string().uuid().optional(),
  toAgentId: z.string().uuid().optional(),
  reason: z.string().min(3).max(2_000),
  checkpoint: z.record(z.unknown()).default({}),
}).refine((value) => Boolean(value.toUserId) !== Boolean(value.toAgentId), "Choose exactly one human or agent recipient.");

export const createAgentRunSchema = z.object({
  agentId: z.string().uuid().optional(),
});

export const createRuntimeKeySchema = z.object({
  name: z.string().min(2).max(120),
  missionIds: z.array(z.string().uuid()).min(1).max(50),
  capabilities: z.array(z.enum(["runtime:control", "tool:call", "mission:correct", "mission:comment", "mission:handoff"])).min(1).max(5),
  expiresInDays: z.number().int().min(1).max(90).default(30),
});

export const sessionProfileSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(320).optional().or(z.literal("")),
  title: z.string().max(120).default(""),
  department: z.enum(departments).default("Other"),
});

export type SourceType = (typeof sourceTypes)[number];
export type AssertionType = (typeof assertionTypes)[number];
export type ConflictType = (typeof conflictTypes)[number];
export type SourceInput = z.infer<typeof sourceInputSchema>;
type ParsedCreateMissionInput = z.infer<typeof createMissionSchema>;
export type CreateMissionInput = Omit<ParsedCreateMissionInput, "executionMode"> & { executionMode?: ParsedCreateMissionInput["executionMode"] };
export type Department = (typeof departments)[number];
export type MissionRole = (typeof missionRoles)[number];
export type AgentRunStatus = (typeof agentRunStatuses)[number];

export interface RelayUser {
  id: string;
  name: string;
  email: string;
  title?: string;
  department?: Department | string;
  identitySource: "relay_session" | "invite" | "google" | "microsoft" | string;
  identityVerified: boolean;
}

export interface MissionMember {
  user: RelayUser;
  role: MissionRole;
  responsibility: string;
  joinedAt: string;
}

export interface Presence {
  userId: string;
  connectionId: string;
  state: "viewing" | "editing" | "deciding" | "away";
  cursorContext?: string;
  lastSeenAt: string;
}

export interface CollaborationEvent {
  sequence: number;
  id: string;
  missionId: string;
  planVersion?: number;
  missionRevision: number;
  actorType: "human" | "agent" | "system" | "provider";
  actorId?: string;
  actorName: string;
  eventType: string;
  entityType: string;
  entityId?: string;
  summary: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface MissionComment {
  id: string;
  missionId: string;
  author: RelayUser;
  body: string;
  mentions: string[];
  taskId?: string;
  conflictId?: string;
  parentId?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  purpose: string;
  modelProvider: string;
  modelName: string;
  capabilities: string[];
  riskCeiling: 0 | 1 | 2 | 3 | 4;
  status: "idle" | "running" | "paused" | "offline";
}

export interface AgentRun {
  id: string;
  missionId: string;
  planVersionId: string;
  taskId: string;
  agentId: string;
  agentName: string;
  taskKey: string;
  taskTitle: string;
  status: AgentRunStatus;
  attempt: number;
  progress: number;
  phase: string;
  checkpoint: Record<string, unknown>;
  heartbeatAt?: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskHandoff {
  id: string;
  taskId: string;
  fromUserId?: string;
  fromAgentId?: string;
  toUserId?: string;
  toAgentId?: string;
  reason: string;
  checkpoint: Record<string, unknown>;
  status: "offered" | "accepted" | "declined" | "cancelled";
  createdAt: string;
}

export interface ConnectorConnection {
  id: string;
  provider: string;
  accountId: string;
  accountLabel: string;
  status: "pending" | "connected" | "verified" | "expired" | "revoked" | "error";
  grantedScopes: string[];
  expiresAt?: string;
  verifiedAt?: string;
  lastError?: string;
}

export interface ConnectorDescriptor {
  provider: string;
  label: string;
  configured: boolean;
  capabilities: string[];
  connections: ConnectorConnection[];
  configurationHint?: string;
}

export interface AuthorityEdge {
  id: string;
  subjectUserId: string;
  subjectName: string;
  scopeType: "workspace" | "department" | "mission" | "capability" | "budget";
  scopeValue: string;
  authorityLevel: number;
  canApproveRisk: number;
  budgetCeiling?: number;
  validFrom: string;
  validUntil?: string;
}

export interface CollaborationSnapshot {
  revision: number;
  members: MissionMember[];
  presence: Presence[];
  agents: AgentDefinition[];
  runs: AgentRun[];
  comments: MissionComment[];
  handoffs: TaskHandoff[];
  events: CollaborationEvent[];
  authorityGraph: AuthorityEdge[];
}

export interface IntentAssertion {
  id: string;
  sourceId?: string;
  statement: string;
  type: AssertionType;
  authorityLevel: number;
  confidence: number;
  scope: string;
  expiration?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ResolutionOption {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
  timeImpact: string;
  budgetImpact: string;
  outcomeImpact: string;
  risk: string;
}

export interface Conflict {
  id: string;
  type: ConflictType;
  title: string;
  summary: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "open" | "resolved";
  blocking: boolean;
  sourceAssertionIds: string[];
  decisionOwner: string;
  decisionDueAt?: string;
  consequences: string;
  options: ResolutionOption[];
  resolution?: {
    optionId: string;
    decision: string;
    reason: string;
    decidedBy: string;
    createdAt: string;
  };
  createdAt: string;
}

export interface ExecutionTask {
  id: string;
  key: string;
  title: string;
  goal: string;
  ownerType: "human" | "agent";
  ownerName: string;
  status: "pending" | "blocked" | "ready" | "running" | "completed" | "failed";
  riskLevel: 0 | 1 | 2 | 3 | 4;
  dependencies: string[];
  requiredInputs: string[];
  expectedOutputs: string[];
  definitionOfDone: string;
  requiredCapabilities: string[];
  forbiddenActions: string[];
  budgetLimit?: number;
  timeLimitMinutes: number;
  approvalPolicy: string;
  retryPolicy: { maxAttempts: number; backoffMinutes: number };
  stopCondition: string;
  rollbackStrategy: string;
  requiredEvidence: string[];
  outcomeMetric: string;
  preflight?: PreflightResult;
}

export interface PreflightResult {
  canRun: boolean;
  checkedAt: string;
  checks: Array<{ name: string; passed: boolean; detail: string; nextAction?: string }>;
}

export interface Artifact {
  id: string;
  taskId: string;
  planVersion: number;
  type: "evidence_manifest" | "execution_brief" | "audience_guardrail" | "launch_draft_bundle" | "launch_handoff" | "outcome_report";
  title: string;
  content: Record<string, unknown>;
  contentHash: string;
  createdBy: string;
  createdAt: string;
}

export interface ExecutionReceipt {
  id: string;
  taskId: string;
  taskKey: string;
  planVersion: number;
  idempotencyKey: string;
  executor: string;
  status: "succeeded" | "blocked" | "failed";
  preflight: PreflightResult;
  artifactId?: string;
  artifactHash?: string;
  summary: string;
  createdAt: string;
}

export interface PublicMissionReport {
  slug: string;
  missionTitle: string;
  planVersion: number;
  generatedAt: string;
  expiresAt: string;
  sourcesAnalyzed: number;
  assertionsCompiled: number;
  conflictsFound: number;
  riskyActionsStopped: number;
  evidenceCoverage: number;
  sourceTypes: string[];
  primaryConflicts: Array<{
    type: ConflictType;
    title: string;
    severity: Conflict["severity"];
    decisionOwner: string;
    nextSafeAction: string;
  }>;
  executionProof?: {
    taskKey: string;
    executor: string;
    artifactHash: string;
  };
}

export interface AccessRequirement {
  id: string;
  provider: string;
  capabilities: string[];
  whyNeeded: string;
  taskKeys: string[];
  resourceScope: string;
  accessLevel: "read" | "draft" | "write" | "publish";
  status: "not_connected" | "pending" | "verified" | "expired" | "revoked";
  expiration?: string;
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  action: string;
  exactPayload: Record<string, unknown>;
  payloadHash: string;
  audience: string;
  budget?: number;
  startTime?: string;
  stopCondition: string;
  requester: string;
  approver: string;
  status: "pending" | "approved" | "rejected" | "expired" | "invalidated";
  expiresAt: string;
  decidedAt?: string;
  reason?: string;
  createdAt: string;
}

export interface PlanVersion {
  id: string;
  version: number;
  status: "draft" | "active" | "superseded";
  changeSummary: string;
  diff: Array<{ kind: "added" | "changed" | "invalidated"; label: string; detail: string }>;
  contract: {
    missionGoal: string;
    successMetric: string;
    invariants: string[];
    generatedAt: string;
  };
  tasks: ExecutionTask[];
  accessBlueprint: AccessRequirement[];
  approvals: ApprovalRequest[];
  createdBy: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorType: "human" | "agent" | "system";
  actorName: string;
  eventType: string;
  entityType: string;
  entityId?: string;
  planVersion?: number;
  summary: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface CompilerCheck {
  id: "source_lineage" | "semantic_model" | "evidence_validation" | "policy_gate" | "execution_boundary";
  label: string;
  status: "passed" | "warning" | "fallback";
  detail: string;
}

export interface CompilerReceipt {
  mode: "hybrid" | "policy_only";
  engineVersion: string;
  modelName?: string;
  modelUsed: boolean;
  sourceCount: number;
  assertionCount: number;
  conflictCount: number;
  blockingConflictCount: number;
  evidenceCoverage: number;
  averageConfidence: number;
  semanticAssertionsAccepted: number;
  semanticConflictsAccepted: number;
  rejectedCandidates: number;
  latencyMs: number;
  checks: CompilerCheck[];
  warnings: string[];
  generatedAt: string;
}

export interface Outcome {
  id: string;
  metricName: string;
  targetValue: string;
  actualValue: string;
  status: "not_started" | "on_track" | "at_risk" | "achieved" | "missed";
  cost: number;
  durationMinutes: number;
  humanInterventions: number;
  teamSize: number;
  baselineMeetings: number;
  actualMeetings: number;
  meetingMinutes: number;
  blockers: string[];
  recommendation: string;
  updatedAt: string;
}

export interface MissionSummary {
  id: string;
  title: string;
  objective: string;
  executionMode: "launch_readiness" | "live_launch";
  status: "intake" | "conflicts" | "planning" | "active" | "completed";
  currentPlanVersion: number;
  openConflicts: number;
  blockingConflicts: number;
  pendingApprovals: number;
  completedTasks: number;
  totalTasks: number;
  updatedAt: string;
}

export interface MissionImpact {
  sourcesReconciled: number;
  conflictsResolved: number;
  agentTasksCompleted: number;
  artifactsCreated: number;
  executionReceipts: number;
  humanDecisions: number;
  meetingsAvoided: number;
  peopleHoursAvoided: number;
}

export interface InviteDelivery {
  status: "sent" | "not_configured" | "failed";
  provider: "brevo" | "none";
  messageId?: string;
  detail?: string;
}

export interface MissionInvitePreview {
  expiresAt: string;
  inviterName: string;
  invitee: {
    name: string;
    email: string;
    title?: string;
    department?: string;
    missionRole: MissionMember["role"];
  };
  mission: {
    id: string;
    title: string;
    objective: string;
    successMetric: string;
    status: MissionSummary["status"];
    currentPlanVersion: number;
    openConflicts: number;
    pendingApprovals: number;
    waitingAgentTasks: number;
  };
  recap: {
    whatHappened: { en: string; zhTW: string };
    whatYouNeedToDo: { en: string; zhTW: string };
    voices: Array<{ author: string; sourceType: string; statement: string }>;
    decisions: Array<{ title: string; summary: string; decisionOwner: string }>;
  };
}

export interface MissionDetail extends MissionSummary {
  workspaceName: string;
  createdBy: string;
  successMetric: string;
  sources: Array<SourceInput & { id: string; createdAt: string }>;
  assertions: IntentAssertion[];
  conflicts: Conflict[];
  planVersions: PlanVersion[];
  currentPlan?: PlanVersion;
  auditEvents: AuditEvent[];
  artifacts: Artifact[];
  executionReceipts: ExecutionReceipt[];
  compilerReceipt?: CompilerReceipt;
  outcome?: Outcome;
  impact: MissionImpact;
  createdAt: string;
}
