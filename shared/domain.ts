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
] as const;

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
  objective: z.string().min(10).max(5_000),
  successMetric: z.string().min(3).max(500),
  createdBy: z.string().min(1).max(120).default("Jennifer"),
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
  recommendation: z.string().max(2_000).default(""),
});

export type SourceType = (typeof sourceTypes)[number];
export type AssertionType = (typeof assertionTypes)[number];
export type ConflictType = (typeof conflictTypes)[number];
export type SourceInput = z.infer<typeof sourceInputSchema>;
export type CreateMissionInput = z.infer<typeof createMissionSchema>;

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
  blockers: string[];
  recommendation: string;
  updatedAt: string;
}

export interface MissionSummary {
  id: string;
  title: string;
  objective: string;
  status: "intake" | "conflicts" | "planning" | "active" | "completed";
  currentPlanVersion: number;
  openConflicts: number;
  blockingConflicts: number;
  pendingApprovals: number;
  completedTasks: number;
  totalTasks: number;
  updatedAt: string;
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
  compilerReceipt?: CompilerReceipt;
  outcome?: Outcome;
  createdAt: string;
}
