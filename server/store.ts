import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { compilePlan, demoMissionInput } from "./compiler";
import { compileIntent, fallbackCompilerReceipt } from "./intelligence";
import { pool } from "./db";
import { executeBuiltIn, verifiedExecutorFor } from "./execution";
import { assertMissionAccess, systemScope, type StoreScope } from "./security";
import type {
  ApprovalRequest,
  Artifact,
  AuditEvent,
  CompilerReceipt,
  Conflict,
  CreateMissionInput,
  ExecutionTask,
  ExecutionReceipt,
  IntentAssertion,
  MissionDetail,
  MissionSummary,
  Outcome,
  PlanVersion,
  PreflightResult,
  PublicMissionReport,
  SourceInput,
} from "../shared/domain";

type StoredSource = SourceInput & { id: string; createdAt: string };
type DbRunner = Pick<PoolClient, "query">;
type Row = Record<string, any>;

const DEMO_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_USER_ID = "00000000-0000-4000-8000-000000000002";
const now = () => new Date().toISOString();
const uid = () => randomUUID();

class NotFoundError extends Error {
  status = 404;
}

class ConflictError extends Error {
  status = 409;
  details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.details = details;
  }
}

export interface RelayStore {
  listMissions(scope: StoreScope): Promise<MissionSummary[]>;
  getMission(id: string, scope: StoreScope): Promise<MissionDetail>;
  createMission(input: CreateMissionInput, scope: StoreScope): Promise<MissionDetail>;
  compileMission(id: string, scope: StoreScope): Promise<MissionDetail>;
  resolveConflict(conflictId: string, input: { optionId: string; reason: string; decidedBy: string }, scope: StoreScope): Promise<MissionDetail>;
  recompilePlan(missionId: string, actor: string, scope: StoreScope): Promise<MissionDetail>;
  decideApproval(approvalId: string, input: { decision: "approved" | "rejected"; decidedBy: string; reason: string }, scope: StoreScope): Promise<MissionDetail>;
  runTask(taskId: string, actor: string, scope: StoreScope): Promise<{ mission: MissionDetail; preflight: PreflightResult; receipt: ExecutionReceipt }>;
  addCorrection(missionId: string, input: { statement: string; assertionType: IntentAssertion["type"]; author: string }, scope: StoreScope): Promise<MissionDetail>;
  updateOutcome(missionId: string, outcome: Omit<Outcome, "id" | "blockers" | "updatedAt">, scope: StoreScope): Promise<MissionDetail>;
  createPublicReport(missionId: string, scope: StoreScope): Promise<PublicMissionReport>;
  getPublicReport(slug: string): Promise<PublicMissionReport>;
  seedDemo(): Promise<string>;
}

interface InternalMission {
  id: string;
  workspaceId: string;
  workspaceName: string;
  title: string;
  objective: string;
  successMetric: string;
  status: MissionDetail["status"];
  currentPlanVersion: number;
  createdBy: string;
  sources: StoredSource[];
  assertions: IntentAssertion[];
  conflicts: Conflict[];
  planVersions: PlanVersion[];
  auditEvents: AuditEvent[];
  artifacts: Artifact[];
  executionReceipts: ExecutionReceipt[];
  outcome?: Outcome;
  compilerReceipt?: CompilerReceipt;
  createdAt: string;
  updatedAt: string;
}

interface InternalPublicReport {
  report: PublicMissionReport;
  missionId: string;
}

function summaryFromMission(mission: InternalMission): MissionSummary {
  const current = mission.planVersions.find((plan) => plan.version === mission.currentPlanVersion);
  const tasks = current?.tasks ?? [];
  return {
    id: mission.id,
    title: mission.title,
    objective: mission.objective,
    status: mission.status,
    currentPlanVersion: mission.currentPlanVersion,
    openConflicts: mission.conflicts.filter((conflict) => conflict.status === "open").length,
    blockingConflicts: mission.conflicts.filter((conflict) => conflict.status === "open" && conflict.blocking).length,
    pendingApprovals: current?.approvals.filter((approval) => approval.status === "pending").length ?? 0,
    completedTasks: tasks.filter((task) => task.status === "completed").length,
    totalTasks: tasks.length,
    updatedAt: mission.updatedAt,
  };
}

function detailFromMission(mission: InternalMission): MissionDetail {
  const summary = summaryFromMission(mission);
  const compilerReceipt = mission.compilerReceipt ?? (mission.assertions.length
    ? fallbackCompilerReceipt({ sources: mission.sources.length, assertions: mission.assertions, conflicts: mission.conflicts, generatedAt: mission.updatedAt })
    : undefined);
  return {
    ...summary,
    workspaceName: mission.workspaceName,
    createdBy: mission.createdBy,
    successMetric: mission.successMetric,
    sources: mission.sources,
    assertions: mission.assertions,
    conflicts: mission.conflicts,
    planVersions: mission.planVersions,
    currentPlan: mission.planVersions.find((plan) => plan.version === mission.currentPlanVersion),
    auditEvents: [...mission.auditEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    artifacts: [...mission.artifacts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    executionReceipts: [...mission.executionReceipts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    compilerReceipt,
    outcome: mission.outcome,
    createdAt: mission.createdAt,
  };
}

function audit(
  mission: InternalMission,
  event: Omit<AuditEvent, "id" | "createdAt">,
) {
  mission.auditEvents.push({ id: uid(), createdAt: now(), ...event });
  mission.updatedAt = now();
}

function preflightFor(mission: MissionDetail, task: ExecutionTask): PreflightResult {
  const plan = mission.currentPlan;
  const currentTasks = plan?.tasks ?? [];
  const blocking = mission.conflicts.filter((conflict) => conflict.status === "open" && conflict.blocking);
  const dependencies = task.dependencies.map((key) => currentTasks.find((candidate) => candidate.key === key));
  const approval = plan?.approvals.find((candidate) => candidate.taskId === task.id);
  const requiredProviders = new Set(
    task.requiredCapabilities.map((capability) => capability.split(":")[0]),
  );
  const missingProviders = (plan?.accessBlueprint ?? []).filter(
    (access) => requiredProviders.has(access.provider) && access.status !== "verified",
  );
  const allowSnapshotRead = task.riskLevel <= 1 && mission.sources.length > 0;
  const checks: PreflightResult["checks"] = [
    {
      name: "Current plan version",
      passed: Boolean(plan && plan.status !== "superseded"),
      detail: plan ? `Task is bound to Plan v${plan.version} (${plan.status}).` : "No plan is available.",
      nextAction: plan ? undefined : "Compile the mission into an execution plan.",
    },
    {
      name: "Blocking conflicts",
      passed: blocking.length === 0 || ["T-01", "T-02"].includes(task.key),
      detail: blocking.length === 0 ? "No blocking conflicts remain." : `${blocking.length} blocking conflicts remain.`,
      nextAction: blocking.length ? "Resolve the Conflict Inbox decisions assigned to the mission owner." : undefined,
    },
    {
      name: "Dependencies",
      passed: dependencies.every((dependency) => dependency?.status === "completed"),
      detail: dependencies.length === 0 ? "No dependencies." : dependencies.map((dependency, index) => `${task.dependencies[index]}: ${dependency?.status ?? "missing"}`).join(", "),
      nextAction: dependencies.some((dependency) => dependency?.status !== "completed") ? "Complete the named prerequisite tasks first." : undefined,
    },
    {
      name: "Required inputs",
      passed: mission.sources.length > 0,
      detail: `${mission.sources.length} source snapshots are attached to this mission.`,
      nextAction: mission.sources.length === 0 ? "Attach at least one evidence source." : undefined,
    },
    {
      name: "Verified executor",
      passed: task.ownerType === "agent" && Boolean(verifiedExecutorFor(task)),
      detail: task.ownerType !== "agent"
        ? "This task belongs to a human and cannot be completed by an agent run button."
        : verifiedExecutorFor(task)
          ? `${verifiedExecutorFor(task)!.name} is registered to produce a verifiable artifact.`
          : "No built-in or provider-backed executor is registered for this task.",
      nextAction: task.ownerType !== "agent"
        ? "Complete this decision through its dedicated human workflow."
        : !verifiedExecutorFor(task)
          ? "Connect and verify the required provider executor before running this task."
          : undefined,
    },
    {
      name: "Capability grants",
      passed: missingProviders.length === 0 || allowSnapshotRead,
      detail: missingProviders.length === 0
        ? "All required providers are verified."
        : allowSnapshotRead
          ? "Using stored mission snapshots for this read/draft task; no live provider action will occur."
          : `Missing verified access: ${missingProviders.map((access) => access.provider).join(", ")}.`,
      nextAction: missingProviders.length > 0 && !allowSnapshotRead ? "Complete the Access Blueprint verification for the listed providers." : undefined,
    },
    {
      name: "Exact approval",
      passed: task.riskLevel < 3 || approval?.status === "approved",
      detail: task.riskLevel < 3 ? `Risk level ${task.riskLevel} does not require exact external approval.` : `Approval is ${approval?.status ?? "missing"}.`,
      nextAction: task.riskLevel >= 3 && approval?.status !== "approved" ? "Approve the exact payload in Approval Center." : undefined,
    },
    {
      name: "Budget policy",
      passed: !task.budgetLimit || task.budgetLimit <= 30_000,
      detail: task.budgetLimit ? `Task budget cap is NT$${task.budgetLimit.toLocaleString("en-US")}.` : "This task cannot spend funds.",
      nextAction: task.budgetLimit && task.budgetLimit > 30_000 ? "Request a new budget decision and approval." : undefined,
    },
    {
      name: "Idempotency and rollback",
      passed: Boolean(task.rollbackStrategy && plan),
      detail: plan ? `Idempotency key: ${mission.id}:v${plan.version}:${task.key}. Rollback is defined.` : "Missing plan-bound idempotency key.",
      nextAction: plan ? undefined : "Compile a current plan version.",
    },
  ];
  return { canRun: checks.every((check) => check.passed), checkedAt: now(), checks };
}

function publicReportFromMission(mission: MissionDetail, slug: string, generatedAt = now(), expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString()): PublicMissionReport {
  const stoppedTasks = mission.currentPlan?.tasks.filter((task) => task.ownerType === "agent" && task.status === "blocked" && task.riskLevel > 0) ?? [];
  const proof = mission.executionReceipts.find((receipt) => receipt.status === "succeeded" && receipt.artifactHash);
  return {
    slug,
    missionTitle: mission.title,
    planVersion: mission.currentPlanVersion,
    generatedAt,
    expiresAt,
    sourcesAnalyzed: mission.sources.length,
    assertionsCompiled: mission.assertions.length,
    conflictsFound: mission.conflicts.length,
    riskyActionsStopped: stoppedTasks.length,
    evidenceCoverage: mission.compilerReceipt?.evidenceCoverage ?? 0,
    sourceTypes: [...new Set(mission.sources.map((source) => source.type))],
    primaryConflicts: mission.conflicts.slice(0, 3).map((conflict) => ({
      type: conflict.type,
      title: conflict.title,
      severity: conflict.severity,
      decisionOwner: conflict.decisionOwner,
      nextSafeAction: conflict.options.find((option) => option.recommended)?.description ?? conflict.consequences,
    })),
    executionProof: proof?.artifactHash ? { taskKey: proof.taskKey, executor: proof.executor, artifactHash: proof.artifactHash } : undefined,
  };
}

class MemoryRelayStore implements RelayStore {
  private missions = new Map<string, InternalMission>();
  private publicReports = new Map<string, InternalPublicReport>();

  private missionFor(id: string, scope: StoreScope) {
    const mission = this.missions.get(id);
    if (!mission) throw new NotFoundError("Mission not found.");
    assertMissionAccess(scope, mission.id, mission.workspaceId);
    return mission;
  }

  private missionByChild(scope: StoreScope, predicate: (mission: InternalMission) => boolean, message: string) {
    const mission = [...this.missions.values()].find(predicate);
    if (!mission) throw new NotFoundError(message);
    assertMissionAccess(scope, mission.id, mission.workspaceId);
    return mission;
  }

  async listMissions(scope: StoreScope) {
    const missions = [...this.missions.values()].filter((mission) => scope.kind === "system"
      || (scope.kind === "session" && mission.workspaceId === scope.workspaceId)
      || (scope.kind === "share" && mission.id === scope.missionId));
    return missions.map(summaryFromMission).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getMission(id: string, scope: StoreScope) {
    return detailFromMission(this.missionFor(id, scope));
  }

  async createMission(input: CreateMissionInput, scope: StoreScope) {
    if (scope.kind === "share") throw new ConflictError("A shared mission link cannot create workspace missions.");
    const createdAt = now();
    const mission: InternalMission = {
      id: uid(), workspaceId: scope.kind === "session" ? scope.workspaceId : DEMO_WORKSPACE_ID, workspaceName: scope.kind === "session" ? "Private launch workspace" : "Relay Demo",
      title: input.title, objective: input.objective, successMetric: input.successMetric, status: "intake", currentPlanVersion: 0,
      createdBy: input.createdBy, sources: input.sources.map((source) => ({ ...source, id: source.id ?? uid(), createdAt })), assertions: [], conflicts: [],
      planVersions: [], auditEvents: [], artifacts: [], executionReceipts: [], outcome: { id: uid(), metricName: input.successMetric, targetValue: input.successMetric, actualValue: "", status: "not_started", cost: 0, durationMinutes: 0, humanInterventions: 0, blockers: [], recommendation: "", updatedAt: createdAt },
      createdAt, updatedAt: createdAt,
    };
    audit(mission, { actorType: "human", actorName: input.createdBy, eventType: "mission.created", entityType: "mission", entityId: mission.id, summary: "Mission created with source evidence.", data: { sourceCount: mission.sources.length } });
    this.missions.set(mission.id, mission);
    return detailFromMission(mission);
  }

  async compileMission(id: string, scope: StoreScope) {
    const mission = this.missionFor(id, scope);
    if (mission.assertions.length > 0) return detailFromMission(mission);
    const compilation = await compileIntent({ title: mission.title, objective: mission.objective, successMetric: mission.successMetric, createdBy: mission.createdBy, sources: mission.sources }, mission.sources);
    mission.assertions = compilation.assertions;
    mission.conflicts = compilation.conflicts;
    mission.compilerReceipt = compilation.receipt;
    const plan = compilePlan({ input: mission, sources: mission.sources, conflicts: mission.conflicts, version: 1 });
    mission.planVersions = [plan];
    mission.currentPlanVersion = 1;
    mission.status = "conflicts";
    audit(mission, { actorType: "system", actorName: "Relay Compiler", eventType: "mission.compiled", entityType: "plan_version", entityId: plan.id, planVersion: 1, summary: `${mission.assertions.length} assertions compiled into ${mission.conflicts.length} conflicts and Plan v1.`, data: { assertionCount: mission.assertions.length, conflictCount: mission.conflicts.length, compilerReceipt: compilation.receipt } });
    const evidenceTask = plan.tasks.find((task) => task.key === "T-01");
    if (evidenceTask) await this.runTask(evidenceTask.id, "Relay Evidence Worker", scope);
    return detailFromMission(mission);
  }

  async resolveConflict(conflictId: string, input: { optionId: string; reason: string; decidedBy: string }, scope: StoreScope) {
    const mission = this.missionByChild(scope, (item) => item.conflicts.some((conflict) => conflict.id === conflictId), "Conflict not found.");
    const conflict = mission.conflicts.find((item) => item.id === conflictId)!;
    const option = conflict.options.find((item) => item.id === input.optionId);
    if (!option) throw new ConflictError("Resolution option is not valid for this conflict.");
    conflict.status = "resolved";
    conflict.resolution = { optionId: input.optionId, decision: option.description, reason: input.reason, decidedBy: input.decidedBy, createdAt: now() };
    if (!mission.conflicts.some((item) => item.blocking && item.status === "open")) mission.status = "planning";
    audit(mission, { actorType: "human", actorName: input.decidedBy, eventType: "conflict.resolved", entityType: "conflict", entityId: conflict.id, planVersion: mission.currentPlanVersion, summary: conflict.title, data: { optionId: input.optionId, reason: input.reason } });
    return detailFromMission(mission);
  }

  async recompilePlan(missionId: string, actor: string, scope: StoreScope) {
    const mission = this.missionFor(missionId, scope);
    const openBlocking = mission.conflicts.filter((conflict) => conflict.blocking && conflict.status === "open");
    if (openBlocking.length) throw new ConflictError("Blocking conflicts must be resolved before a new plan can be activated.", { openBlocking: openBlocking.length });
    const previous = mission.planVersions.find((plan) => plan.version === mission.currentPlanVersion);
    if (previous) {
      previous.status = "superseded";
      previous.approvals.forEach((approval) => { if (["pending", "approved"].includes(approval.status)) approval.status = "invalidated"; });
    }
    const nextVersion = (previous?.version ?? 0) + 1;
    const plan = compilePlan({ input: mission, sources: mission.sources, conflicts: mission.conflicts, version: nextVersion, previous });
    mission.planVersions.push(plan);
    mission.currentPlanVersion = nextVersion;
    mission.status = "active";
    audit(mission, { actorType: "system", actorName: "Relay Compiler", eventType: "plan.activated", entityType: "plan_version", entityId: plan.id, planVersion: nextVersion, summary: `Plan v${nextVersion} activated; previous approvals invalidated.`, data: { previousVersion: previous?.version } });
    const evidenceTask = plan.tasks.find((task) => task.key === "T-01");
    if (evidenceTask) await this.runTask(evidenceTask.id, "Relay Evidence Worker", scope);
    return detailFromMission(mission);
  }

  async decideApproval(approvalId: string, input: { decision: "approved" | "rejected"; decidedBy: string; reason: string }, scope: StoreScope) {
    const mission = this.missionByChild(scope, (item) => item.planVersions.some((plan) => plan.approvals.some((approval) => approval.id === approvalId)), "Approval not found.");
    const plan = mission.planVersions.find((item) => item.approvals.some((approval) => approval.id === approvalId))!;
    const approval = plan.approvals.find((item) => item.id === approvalId)!;
    if (plan.version !== mission.currentPlanVersion || plan.status !== "active") throw new ConflictError("Approval belongs to a stale plan version.");
    if (new Date(approval.expiresAt).getTime() < Date.now()) throw new ConflictError("Approval has expired.");
    approval.status = input.decision;
    approval.approver = input.decidedBy;
    approval.decidedAt = now();
    approval.reason = input.reason;
    const approvalTask = plan.tasks.find((task) => task.key === "T-06");
    if (approvalTask) approvalTask.status = input.decision === "approved" ? "completed" : "failed";
    audit(mission, { actorType: "human", actorName: input.decidedBy, eventType: `approval.${input.decision}`, entityType: "approval", entityId: approval.id, planVersion: plan.version, summary: `${approval.action} ${input.decision}.`, data: { payloadHash: approval.payloadHash, reason: input.reason } });
    return detailFromMission(mission);
  }

  async runTask(taskId: string, actor: string, scope: StoreScope) {
    const mission = this.missionByChild(scope, (item) => item.planVersions.some((plan) => plan.tasks.some((task) => task.id === taskId)), "Task not found.");
    const detail = detailFromMission(mission);
    const task = detail.currentPlan?.tasks.find((item) => item.id === taskId);
    if (!task) throw new ConflictError("Task is not part of the current plan version.");
    const baseIdempotencyKey = `${mission.id}:v${detail.currentPlanVersion}:${task.key}`;
    const existingReceipt = mission.executionReceipts.find((receipt) => receipt.idempotencyKey === baseIdempotencyKey && receipt.status === "succeeded");
    if (existingReceipt) return { mission: detail, preflight: existingReceipt.preflight, receipt: existingReceipt };
    const result = preflightFor(detail, task);
    task.preflight = result;
    let receipt: ExecutionReceipt;
    if (!result.canRun) {
      task.status = "blocked";
      receipt = { id: uid(), taskId: task.id, taskKey: task.key, planVersion: detail.currentPlanVersion, idempotencyKey: `${baseIdempotencyKey}:blocked:${uid()}`, executor: "Relay Preflight", status: "blocked", preflight: result, summary: `${task.key} was stopped before execution; no artifact or external side effect was produced.`, createdAt: now() };
      mission.executionReceipts.push(receipt);
      audit(mission, { actorType: "system", actorName: "Relay Preflight", eventType: "task.blocked", entityType: "task", entityId: task.id, planVersion: detail.currentPlanVersion, summary: `${task.key} blocked by preflight.`, data: { checks: result.checks } });
    } else {
      const artifact = executeBuiltIn(detail, task, actor);
      mission.artifacts.push(artifact);
      task.status = "completed";
      receipt = { id: uid(), taskId: task.id, taskKey: task.key, planVersion: detail.currentPlanVersion, idempotencyKey: baseIdempotencyKey, executor: verifiedExecutorFor(task)!.name, status: "succeeded", preflight: result, artifactId: artifact.id, artifactHash: artifact.contentHash, summary: `${task.key} produced ${artifact.title}; completion is backed by an immutable artifact hash.`, createdAt: now() };
      mission.executionReceipts.push(receipt);
      audit(mission, { actorType: task.ownerType, actorName: actor, eventType: "task.completed", entityType: "task", entityId: task.id, planVersion: detail.currentPlanVersion, summary: receipt.summary, data: { idempotencyKey: baseIdempotencyKey, artifactId: artifact.id, artifactHash: artifact.contentHash, checks: result.checks } });
    }
    return { mission: detailFromMission(mission), preflight: result, receipt };
  }

  async addCorrection(missionId: string, input: { statement: string; assertionType: IntentAssertion["type"]; author: string }, scope: StoreScope) {
    const mission = this.missionFor(missionId, scope);
    const assertion: IntentAssertion = { id: uid(), statement: input.statement, type: input.assertionType, authorityLevel: 5, confidence: 1, scope: "mission", metadata: { origin: "human_correction" }, createdAt: now() };
    mission.assertions.push(assertion);
    const conflict: Conflict = { id: uid(), type: "Version conflict", title: "New correction changes the active execution contract", summary: input.statement, severity: "high", status: "open", blocking: true, sourceAssertionIds: [assertion.id], decisionOwner: input.author, consequences: "Running tasks and prior approvals may no longer match the team's current intent.", options: [
      { id: "recommended", label: "Recommended resolution", description: "Accept the correction, replan unfinished work, and issue a new plan version.", recommended: true, timeImpact: "Short replan required", budgetImpact: "Recalculate affected tasks", outcomeImpact: "Keeps execution aligned", risk: "Low" },
      { id: "alternative-a", label: "Alternative A", description: "Limit the correction to future missions.", recommended: false, timeImpact: "No current delay", budgetImpact: "No change", outcomeImpact: "Current mission unchanged", risk: "Medium" },
      { id: "alternative-b", label: "Alternative B", description: "Pause the mission for manual review.", recommended: false, timeImpact: "Mission paused", budgetImpact: "Prevents further spend", outcomeImpact: "Deadline risk", risk: "Low execution risk" },
    ], createdAt: now() };
    mission.conflicts.push(conflict);
    const current = mission.planVersions.find((plan) => plan.version === mission.currentPlanVersion);
    if (current) {
      current.status = "superseded";
      current.approvals.forEach((approval) => { if (["pending", "approved"].includes(approval.status)) approval.status = "invalidated"; });
      current.tasks.filter((task) => !["completed", "failed"].includes(task.status)).forEach((task) => { task.status = "blocked"; });
    }
    mission.status = "conflicts";
    audit(mission, { actorType: "human", actorName: input.author, eventType: "assertion.corrected", entityType: "intent_assertion", entityId: assertion.id, planVersion: mission.currentPlanVersion, summary: "Correction added; active plan and approvals invalidated.", data: { statement: input.statement } });
    return detailFromMission(mission);
  }

  async updateOutcome(missionId: string, input: Omit<Outcome, "id" | "blockers" | "updatedAt">, scope: StoreScope) {
    const mission = this.missionFor(missionId, scope);
    mission.outcome = { id: mission.outcome?.id ?? uid(), ...input, blockers: mission.conflicts.filter((conflict) => conflict.status === "open").map((conflict) => conflict.title), updatedAt: now() };
    if (["achieved", "missed"].includes(input.status)) mission.status = "completed";
    audit(mission, { actorType: "human", actorName: mission.createdBy, eventType: "outcome.updated", entityType: "outcome", entityId: mission.outcome.id, planVersion: mission.currentPlanVersion, summary: `Outcome marked ${input.status}.`, data: { actualValue: input.actualValue, cost: input.cost } });
    return detailFromMission(mission);
  }

  async createPublicReport(missionId: string, scope: StoreScope) {
    const mission = detailFromMission(this.missionFor(missionId, scope));
    const slug = uid().replaceAll("-", "").slice(0, 16);
    const report = publicReportFromMission(mission, slug);
    this.publicReports.set(slug, { report, missionId });
    return report;
  }

  async getPublicReport(slug: string) {
    const stored = this.publicReports.get(slug);
    if (!stored || new Date(stored.report.expiresAt).getTime() <= Date.now()) throw new NotFoundError("Public report not found.");
    return stored.report;
  }

  async seedDemo() {
    const existing = [...this.missions.values()].find((mission) => mission.title === demoMissionInput.title);
    if (existing) return existing.id;
    const created = await this.createMission(demoMissionInput, systemScope);
    await this.compileMission(created.id, systemScope);
    return created.id;
  }
}

function mapAssertion(row: Row): IntentAssertion {
  return { id: row.id, sourceId: row.source_id ?? undefined, statement: row.statement, type: row.assertion_type, authorityLevel: row.authority_level, confidence: Number(row.confidence), scope: row.scope, expiration: row.expiration?.toISOString?.() ?? row.expiration ?? undefined, metadata: row.metadata ?? {}, createdAt: row.created_at.toISOString() };
}

function mapConflict(row: Row, resolution?: Row): Conflict {
  return {
    id: row.id, type: row.conflict_type, title: row.title, summary: row.summary, severity: row.severity, status: row.status, blocking: row.blocking,
    sourceAssertionIds: row.source_assertion_ids ?? [], decisionOwner: row.decision_owner, decisionDueAt: row.decision_due_at?.toISOString?.(), consequences: row.consequences,
    options: row.options ?? [], resolution: resolution ? { optionId: resolution.option_id, decision: resolution.decision, reason: resolution.reason, decidedBy: resolution.decided_by, createdAt: resolution.created_at.toISOString() } : undefined,
    createdAt: row.created_at.toISOString(),
  };
}

function mapTask(row: Row): ExecutionTask {
  return {
    id: row.id, key: row.task_key, title: row.title, goal: row.goal, ownerType: row.owner_type, ownerName: row.owner_name, status: row.status,
    riskLevel: row.risk_level, dependencies: row.dependencies ?? [], requiredInputs: row.required_inputs ?? [], expectedOutputs: row.expected_outputs ?? [], definitionOfDone: row.definition_of_done,
    requiredCapabilities: row.required_capabilities ?? [], forbiddenActions: row.forbidden_actions ?? [], budgetLimit: row.budget_limit == null ? undefined : Number(row.budget_limit),
    timeLimitMinutes: row.time_limit_minutes, approvalPolicy: row.approval_policy, retryPolicy: row.retry_policy, stopCondition: row.stop_condition, rollbackStrategy: row.rollback_strategy,
    requiredEvidence: row.required_evidence ?? [], outcomeMetric: row.outcome_metric, preflight: row.preflight ?? undefined,
  };
}

function mapApproval(row: Row): ApprovalRequest {
  return {
    id: row.id, taskId: row.task_id, action: row.action, exactPayload: row.exact_payload, payloadHash: row.payload_hash, audience: row.audience,
    budget: row.budget == null ? undefined : Number(row.budget), startTime: row.start_time?.toISOString?.(), stopCondition: row.stop_condition, requester: row.requester,
    approver: row.approver, status: row.status, expiresAt: row.expires_at.toISOString(), decidedAt: row.decided_at?.toISOString?.(), reason: row.reason ?? undefined, createdAt: row.created_at.toISOString(),
  };
}

function mapArtifact(row: Row, planVersion: number): Artifact {
  return {
    id: row.id,
    taskId: row.task_id,
    planVersion,
    type: row.artifact_type,
    title: row.title,
    content: row.content ?? {},
    contentHash: row.content_hash,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

function mapExecutionReceipt(row: Row, taskKey: string, planVersion: number): ExecutionReceipt {
  return {
    id: row.id,
    taskId: row.task_id,
    taskKey,
    planVersion,
    idempotencyKey: row.idempotency_key,
    executor: row.executor,
    status: row.status,
    preflight: row.preflight,
    artifactId: row.artifact_id ?? undefined,
    artifactHash: row.artifact_hash ?? undefined,
    summary: row.summary,
    createdAt: row.created_at.toISOString(),
  };
}

class PostgresRelayStore implements RelayStore {
  private async ensureIdentity(runner: DbRunner) {
    await runner.query("INSERT INTO workspaces (id, name) VALUES ($1, 'Relay Demo') ON CONFLICT (id) DO NOTHING", [DEMO_WORKSPACE_ID]);
    await runner.query("INSERT INTO users (id, name, email) VALUES ($1, 'Demo owner', 'demo@relay.local') ON CONFLICT (id) DO NOTHING", [DEMO_USER_ID]);
    await runner.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING", [DEMO_WORKSPACE_ID, DEMO_USER_ID]);
  }

  async listMissions(scope: StoreScope) {
    const where = scope.kind === "session" ? "WHERE m.workspace_id = $1" : scope.kind === "share" ? "WHERE m.id = $1" : "";
    const values = scope.kind === "session" ? [scope.workspaceId] : scope.kind === "share" ? [scope.missionId] : [];
    const result = await pool!.query(`
      SELECT m.*,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'open')::int AS open_conflicts,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'open' AND c.blocking)::int AS blocking_conflicts,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'pending' AND pv.version_no = m.current_plan_version)::int AS pending_approvals,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed' AND pv.version_no = m.current_plan_version)::int AS completed_tasks,
        COUNT(DISTINCT t.id) FILTER (WHERE pv.version_no = m.current_plan_version)::int AS total_tasks
      FROM missions m
      LEFT JOIN conflicts c ON c.mission_id = m.id
      LEFT JOIN plan_versions pv ON pv.mission_id = m.id
      LEFT JOIN tasks t ON t.plan_version_id = pv.id
      LEFT JOIN approvals a ON a.plan_version_id = pv.id
      ${where}
      GROUP BY m.id ORDER BY m.updated_at DESC
    `, values);
    return result.rows.map((row: Row) => ({
      id: row.id, title: row.title, objective: row.objective, status: row.status, currentPlanVersion: row.current_plan_version,
      openConflicts: row.open_conflicts, blockingConflicts: row.blocking_conflicts, pendingApprovals: row.pending_approvals,
      completedTasks: row.completed_tasks, totalTasks: row.total_tasks, updatedAt: row.updated_at.toISOString(),
    }));
  }

  async getMission(id: string, scope: StoreScope) {
    const missionResult = await pool!.query("SELECT m.*, w.name AS workspace_name FROM missions m JOIN workspaces w ON w.id = m.workspace_id WHERE m.id = $1", [id]);
    if (!missionResult.rowCount) throw new NotFoundError("Mission not found.");
    const m: Row = missionResult.rows[0];
    assertMissionAccess(scope, m.id, m.workspace_id);
    const [sourceResult, assertionResult, conflictResult, resolutionResult, planResult, taskResult, accessResult, approvalResult, auditResult, outcomeResult, artifactResult, receiptResult] = await Promise.all([
      pool!.query("SELECT * FROM sources WHERE mission_id = $1 ORDER BY created_at", [id]),
      pool!.query("SELECT * FROM intent_assertions WHERE mission_id = $1 ORDER BY created_at", [id]),
      pool!.query("SELECT * FROM conflicts WHERE mission_id = $1 ORDER BY blocking DESC, created_at", [id]),
      pool!.query("SELECT cr.* FROM conflict_resolutions cr JOIN conflicts c ON c.id = cr.conflict_id WHERE c.mission_id = $1", [id]),
      pool!.query("SELECT * FROM plan_versions WHERE mission_id = $1 ORDER BY version_no", [id]),
      pool!.query("SELECT * FROM tasks WHERE mission_id = $1 ORDER BY plan_version_id, sort_order", [id]),
      pool!.query("SELECT ab.* FROM access_blueprints ab JOIN plan_versions pv ON pv.id = ab.plan_version_id WHERE pv.mission_id = $1 ORDER BY ab.created_at", [id]),
      pool!.query("SELECT * FROM approvals WHERE mission_id = $1 ORDER BY created_at", [id]),
      pool!.query("SELECT * FROM audit_events WHERE mission_id = $1 ORDER BY created_at DESC LIMIT 200", [id]),
      pool!.query("SELECT * FROM outcomes WHERE mission_id = $1", [id]),
      pool!.query("SELECT a.*, pv.version_no FROM artifacts a JOIN plan_versions pv ON pv.id = a.plan_version_id WHERE a.mission_id = $1 ORDER BY a.created_at DESC", [id]),
      pool!.query("SELECT er.*, pv.version_no, t.task_key FROM execution_receipts er JOIN plan_versions pv ON pv.id = er.plan_version_id JOIN tasks t ON t.id = er.task_id WHERE er.mission_id = $1 ORDER BY er.created_at DESC", [id]),
    ]);
    const resolutionMap = new Map(resolutionResult.rows.map((row: Row) => [row.conflict_id, row]));
    const plans: PlanVersion[] = planResult.rows.map((row: Row) => ({
      id: row.id, version: row.version_no, status: row.status, changeSummary: row.change_summary, diff: row.diff, contract: row.contract,
      tasks: taskResult.rows.filter((task: Row) => task.plan_version_id === row.id).map(mapTask),
      accessBlueprint: accessResult.rows.filter((item: Row) => item.plan_version_id === row.id).map((item: Row) => ({
        id: item.id, provider: item.provider, capabilities: item.capabilities, whyNeeded: item.why_needed, taskKeys: item.task_keys, resourceScope: item.resource_scope,
        accessLevel: item.access_level, status: item.status, expiration: item.expiration?.toISOString?.(),
      })),
      approvals: approvalResult.rows.filter((approval: Row) => approval.plan_version_id === row.id).map(mapApproval),
      createdBy: row.created_by, createdAt: row.created_at.toISOString(),
    }));
    const currentPlan = plans.find((plan) => plan.version === m.current_plan_version);
    const auditEvents: AuditEvent[] = auditResult.rows.map((row: Row) => ({ id: row.id, actorType: row.actor_type, actorName: row.actor_name, eventType: row.event_type, entityType: row.entity_type, entityId: row.entity_id ?? undefined, planVersion: row.plan_version ?? undefined, summary: row.summary, data: row.data, createdAt: row.created_at.toISOString() }));
    const compiledAudit = auditEvents.find((event) => event.eventType === "mission.compiled" && event.data?.compilerReceipt);
    const assertions = assertionResult.rows.map(mapAssertion);
    const conflicts = conflictResult.rows.map((row: Row) => mapConflict(row, resolutionMap.get(row.id)));
    const compilerReceipt = compiledAudit?.data.compilerReceipt as CompilerReceipt | undefined
      ?? (assertions.length ? fallbackCompilerReceipt({ sources: sourceResult.rows.length, assertions, conflicts, generatedAt: compiledAudit?.createdAt ?? m.updated_at.toISOString() }) : undefined);
    const outcomeRow: Row | undefined = outcomeResult.rows[0];
    return {
      id: m.id, title: m.title, objective: m.objective, status: m.status, currentPlanVersion: m.current_plan_version,
      openConflicts: conflictResult.rows.filter((row: Row) => row.status === "open").length,
      blockingConflicts: conflictResult.rows.filter((row: Row) => row.status === "open" && row.blocking).length,
      pendingApprovals: currentPlan?.approvals.filter((approval) => approval.status === "pending").length ?? 0,
      completedTasks: currentPlan?.tasks.filter((task) => task.status === "completed").length ?? 0,
      totalTasks: currentPlan?.tasks.length ?? 0,
      updatedAt: m.updated_at.toISOString(), workspaceName: m.workspace_name, createdBy: m.created_by, successMetric: m.success_metric,
      sources: sourceResult.rows.map((row: Row) => ({ id: row.id, type: row.source_type, title: row.title, author: row.author_name, content: row.content, occurredAt: row.occurred_at?.toISOString?.(), authorityLevel: row.authority_level, evidenceUrl: row.evidence_url ?? undefined, createdAt: row.created_at.toISOString() })),
      assertions, conflicts, planVersions: plans, currentPlan,
      auditEvents,
      artifacts: artifactResult.rows.map((row: Row) => mapArtifact(row, row.version_no)),
      executionReceipts: receiptResult.rows.map((row: Row) => mapExecutionReceipt(row, row.task_key, row.version_no)),
      compilerReceipt,
      outcome: outcomeRow ? { id: outcomeRow.id, metricName: outcomeRow.metric_name, targetValue: outcomeRow.target_value, actualValue: outcomeRow.actual_value, status: outcomeRow.status, cost: Number(outcomeRow.cost), durationMinutes: outcomeRow.duration_minutes, humanInterventions: outcomeRow.human_interventions, blockers: outcomeRow.blockers, recommendation: outcomeRow.recommendation, updatedAt: outcomeRow.updated_at.toISOString() } : undefined,
      createdAt: m.created_at.toISOString(),
    } satisfies MissionDetail;
  }

  async createMission(input: CreateMissionInput, scope: StoreScope) {
    if (scope.kind === "share") throw new ConflictError("A shared mission link cannot create workspace missions.");
    const client = await pool!.connect();
    const missionId = uid();
    const workspaceId = scope.kind === "session" ? scope.workspaceId : DEMO_WORKSPACE_ID;
    try {
      await client.query("BEGIN");
      if (scope.kind === "system") await this.ensureIdentity(client);
      await client.query("INSERT INTO missions (id, workspace_id, title, objective, success_metric, status, created_by) VALUES ($1, $2, $3, $4, $5, 'intake', $6)", [missionId, workspaceId, input.title, input.objective, input.successMetric, input.createdBy]);
      for (const source of input.sources) {
        await client.query("INSERT INTO sources (id, mission_id, source_type, title, author_name, content, occurred_at, authority_level, evidence_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [source.id ?? uid(), missionId, source.type, source.title, source.author, source.content, source.occurredAt ?? null, source.authorityLevel, source.evidenceUrl || null]);
      }
      const outcomeId = uid();
      await client.query("INSERT INTO outcomes (id, mission_id, metric_name, target_value, status) VALUES ($1,$2,$3,$3,'not_started')", [outcomeId, missionId, input.successMetric]);
      await this.insertAudit(client, missionId, { actorType: "human", actorName: input.createdBy, eventType: "mission.created", entityType: "mission", entityId: missionId, summary: "Mission created with source evidence.", data: { sourceCount: input.sources.length } });
      await client.query("COMMIT");
      return this.getMission(missionId, scope);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertAudit(runner: DbRunner, missionId: string, event: Omit<AuditEvent, "id" | "createdAt">) {
    await runner.query("INSERT INTO audit_events (id, mission_id, actor_type, actor_name, event_type, entity_type, entity_id, plan_version, summary, data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [uid(), missionId, event.actorType, event.actorName, event.eventType, event.entityType, event.entityId ?? null, event.planVersion ?? null, event.summary, JSON.stringify(event.data)]);
  }

  private async insertPlan(runner: DbRunner, missionId: string, plan: PlanVersion) {
    await runner.query("INSERT INTO plan_versions (id, mission_id, version_no, status, change_summary, diff, contract, created_by, activated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [plan.id, missionId, plan.version, plan.status, plan.changeSummary, JSON.stringify(plan.diff), JSON.stringify(plan.contract), plan.createdBy, plan.status === "active" ? new Date() : null]);
    for (const [index, task] of plan.tasks.entries()) {
      await runner.query(`INSERT INTO tasks (id, mission_id, plan_version_id, task_key, title, goal, owner_type, owner_name, status, risk_level, dependencies, required_inputs, expected_outputs, definition_of_done, required_capabilities, forbidden_actions, budget_limit, time_limit_minutes, approval_policy, retry_policy, stop_condition, rollback_strategy, required_evidence, outcome_metric, preflight, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
      [task.id, missionId, plan.id, task.key, task.title, task.goal, task.ownerType, task.ownerName, task.status, task.riskLevel, task.dependencies, JSON.stringify(task.requiredInputs), JSON.stringify(task.expectedOutputs), task.definitionOfDone, JSON.stringify(task.requiredCapabilities), JSON.stringify(task.forbiddenActions), task.budgetLimit ?? null, task.timeLimitMinutes, task.approvalPolicy, JSON.stringify(task.retryPolicy), task.stopCondition, task.rollbackStrategy, JSON.stringify(task.requiredEvidence), task.outcomeMetric, task.preflight ? JSON.stringify(task.preflight) : null, index]);
    }
    for (const access of plan.accessBlueprint) {
      await runner.query("INSERT INTO access_blueprints (id, mission_id, plan_version_id, provider, capabilities, why_needed, task_keys, resource_scope, access_level, status, expiration) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [access.id, missionId, plan.id, access.provider, JSON.stringify(access.capabilities), access.whyNeeded, access.taskKeys, access.resourceScope, access.accessLevel, access.status, access.expiration ?? null]);
    }
    for (const approval of plan.approvals) {
      await runner.query("INSERT INTO approvals (id, mission_id, plan_version_id, task_id, action, exact_payload, payload_hash, audience, budget, start_time, stop_condition, requester, approver, status, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)", [approval.id, missionId, plan.id, approval.taskId, approval.action, JSON.stringify(approval.exactPayload), approval.payloadHash, approval.audience, approval.budget ?? null, approval.startTime ?? null, approval.stopCondition, approval.requester, approval.approver, approval.status, approval.expiresAt]);
    }
  }

  async compileMission(id: string, scope: StoreScope) {
    const current = await this.getMission(id, scope);
    if (current.assertions.length) return current;
    const compilation = await compileIntent({ title: current.title, objective: current.objective, successMetric: current.successMetric, createdBy: current.createdBy, sources: current.sources }, current.sources);
    const { assertions, conflicts } = compilation;
    const plan = compilePlan({ input: current, sources: current.sources, conflicts, version: 1 });
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      for (const assertion of assertions) {
        await client.query("INSERT INTO intent_assertions (id, mission_id, source_id, statement, assertion_type, authority_level, confidence, scope, expiration, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [assertion.id, id, assertion.sourceId ?? null, assertion.statement, assertion.type, assertion.authorityLevel, assertion.confidence, assertion.scope, assertion.expiration ?? null, JSON.stringify(assertion.metadata)]);
      }
      for (const conflict of conflicts) {
        await client.query("INSERT INTO conflicts (id, mission_id, conflict_type, title, summary, severity, status, blocking, source_assertion_ids, decision_owner, decision_due_at, consequences, options) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)", [conflict.id, id, conflict.type, conflict.title, conflict.summary, conflict.severity, conflict.status, conflict.blocking, conflict.sourceAssertionIds, conflict.decisionOwner, conflict.decisionDueAt ?? null, conflict.consequences, JSON.stringify(conflict.options)]);
      }
      await this.insertPlan(client, id, plan);
      await client.query("UPDATE missions SET status = 'conflicts', current_plan_version = 1, updated_at = now() WHERE id = $1", [id]);
      await this.insertAudit(client, id, { actorType: "system", actorName: "Relay Compiler", eventType: "mission.compiled", entityType: "plan_version", entityId: plan.id, planVersion: 1, summary: `${assertions.length} assertions compiled into ${conflicts.length} conflicts and Plan v1.`, data: { assertionCount: assertions.length, conflictCount: conflicts.length, compilerReceipt: compilation.receipt } });
      await client.query("COMMIT");
      const compiled = await this.getMission(id, scope);
      const evidenceTask = compiled.currentPlan?.tasks.find((task) => task.key === "T-01");
      return evidenceTask ? (await this.runTask(evidenceTask.id, "Relay Evidence Worker", scope)).mission : compiled;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async resolveConflict(conflictId: string, input: { optionId: string; reason: string; decidedBy: string }, scope: StoreScope) {
    const result = await pool!.query("SELECT c.*, m.workspace_id FROM conflicts c JOIN missions m ON m.id = c.mission_id WHERE c.id = $1", [conflictId]);
    if (!result.rowCount) throw new NotFoundError("Conflict not found.");
    const row: Row = result.rows[0];
    assertMissionAccess(scope, row.mission_id, row.workspace_id);
    const option = (row.options as Array<{ id: string; description: string }>).find((item) => item.id === input.optionId);
    if (!option) throw new ConflictError("Resolution option is not valid for this conflict.");
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE conflicts SET status = 'resolved', resolved_at = now() WHERE id = $1", [conflictId]);
      await client.query("INSERT INTO conflict_resolutions (id, conflict_id, option_id, decision, reason, decided_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (conflict_id) DO UPDATE SET option_id = EXCLUDED.option_id, decision = EXCLUDED.decision, reason = EXCLUDED.reason, decided_by = EXCLUDED.decided_by, created_at = now()", [uid(), conflictId, input.optionId, option.description, input.reason, input.decidedBy]);
      const open = await client.query("SELECT COUNT(*)::int AS count FROM conflicts WHERE mission_id = $1 AND status = 'open' AND blocking", [row.mission_id]);
      if (open.rows[0].count === 0) await client.query("UPDATE missions SET status = 'planning', updated_at = now() WHERE id = $1", [row.mission_id]);
      await this.insertAudit(client, row.mission_id, { actorType: "human", actorName: input.decidedBy, eventType: "conflict.resolved", entityType: "conflict", entityId: conflictId, summary: row.title, data: { optionId: input.optionId, reason: input.reason } });
      await client.query("COMMIT");
      return this.getMission(row.mission_id, scope);
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async recompilePlan(missionId: string, actor: string, scope: StoreScope) {
    const mission = await this.getMission(missionId, scope);
    if (mission.blockingConflicts) throw new ConflictError("Blocking conflicts must be resolved before a new plan can be activated.", { openBlocking: mission.blockingConflicts });
    const previous = mission.currentPlan;
    const nextVersion = (previous?.version ?? 0) + 1;
    const plan = compilePlan({ input: mission, sources: mission.sources, conflicts: mission.conflicts, version: nextVersion, previous });
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      if (previous) {
        await client.query("UPDATE plan_versions SET status = 'superseded' WHERE id = $1", [previous.id]);
        await client.query("UPDATE approvals SET status = 'invalidated' WHERE plan_version_id = $1 AND status IN ('pending','approved')", [previous.id]);
      }
      await this.insertPlan(client, missionId, plan);
      await client.query("UPDATE missions SET status = 'active', current_plan_version = $2, updated_at = now() WHERE id = $1", [missionId, nextVersion]);
      await this.insertAudit(client, missionId, { actorType: "system", actorName: "Relay Compiler", eventType: "plan.activated", entityType: "plan_version", entityId: plan.id, planVersion: nextVersion, summary: `Plan v${nextVersion} activated; previous approvals invalidated.`, data: { actor, previousVersion: previous?.version } });
      await client.query("COMMIT");
      const compiled = await this.getMission(missionId, scope);
      const evidenceTask = compiled.currentPlan?.tasks.find((task) => task.key === "T-01");
      return evidenceTask ? (await this.runTask(evidenceTask.id, "Relay Evidence Worker", scope)).mission : compiled;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async decideApproval(approvalId: string, input: { decision: "approved" | "rejected"; decidedBy: string; reason: string }, scope: StoreScope) {
    const result = await pool!.query("SELECT a.*, pv.version_no, pv.status AS plan_status, m.current_plan_version, m.workspace_id FROM approvals a JOIN plan_versions pv ON pv.id = a.plan_version_id JOIN missions m ON m.id = a.mission_id WHERE a.id = $1", [approvalId]);
    if (!result.rowCount) throw new NotFoundError("Approval not found.");
    const row: Row = result.rows[0];
    assertMissionAccess(scope, row.mission_id, row.workspace_id);
    if (row.version_no !== row.current_plan_version || row.plan_status !== "active") throw new ConflictError("Approval belongs to a stale plan version.");
    if (row.expires_at.getTime() < Date.now()) throw new ConflictError("Approval has expired.");
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE approvals SET status = $2, approver = $3, decided_at = now(), reason = $4 WHERE id = $1", [approvalId, input.decision, input.decidedBy, input.reason]);
      await client.query("UPDATE tasks SET status = $2 WHERE plan_version_id = $1 AND task_key = 'T-06'", [row.plan_version_id, input.decision === "approved" ? "completed" : "failed"]);
      await this.insertAudit(client, row.mission_id, { actorType: "human", actorName: input.decidedBy, eventType: `approval.${input.decision}`, entityType: "approval", entityId: approvalId, planVersion: row.version_no, summary: `${row.action} ${input.decision}.`, data: { payloadHash: row.payload_hash, reason: input.reason } });
      await client.query("COMMIT");
      return this.getMission(row.mission_id, scope);
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async runTask(taskId: string, actor: string, scope: StoreScope) {
    const result = await pool!.query("SELECT t.mission_id, m.workspace_id FROM tasks t JOIN missions m ON m.id = t.mission_id WHERE t.id = $1", [taskId]);
    if (!result.rowCount) throw new NotFoundError("Task not found.");
    const missionId = result.rows[0].mission_id;
    assertMissionAccess(scope, missionId, result.rows[0].workspace_id);
    const mission = await this.getMission(missionId, scope);
    const task = mission.currentPlan?.tasks.find((item) => item.id === taskId);
    if (!task) throw new ConflictError("Task is not part of the current plan version.");
    const baseIdempotencyKey = `${missionId}:v${mission.currentPlanVersion}:${task.key}`;
    const existing = await pool!.query("SELECT er.*, pv.version_no, t.task_key FROM execution_receipts er JOIN plan_versions pv ON pv.id = er.plan_version_id JOIN tasks t ON t.id = er.task_id WHERE er.idempotency_key = $1 AND er.status = 'succeeded'", [baseIdempotencyKey]);
    if (existing.rowCount) {
      const receipt = mapExecutionReceipt(existing.rows[0], existing.rows[0].task_key, existing.rows[0].version_no);
      return { mission, preflight: receipt.preflight, receipt };
    }
    const preflight = preflightFor(mission, task);
    const status = preflight.canRun ? "completed" : "blocked";
    const artifact = preflight.canRun ? executeBuiltIn(mission, task, actor) : undefined;
    const receipt: ExecutionReceipt = {
      id: uid(),
      taskId,
      taskKey: task.key,
      planVersion: mission.currentPlanVersion,
      idempotencyKey: preflight.canRun ? baseIdempotencyKey : `${baseIdempotencyKey}:blocked:${uid()}`,
      executor: preflight.canRun ? verifiedExecutorFor(task)!.name : "Relay Preflight",
      status: preflight.canRun ? "succeeded" : "blocked",
      preflight,
      artifactId: artifact?.id,
      artifactHash: artifact?.contentHash,
      summary: preflight.canRun
        ? `${task.key} produced ${artifact!.title}; completion is backed by an immutable artifact hash.`
        : `${task.key} was stopped before execution; no artifact or external side effect was produced.`,
      createdAt: now(),
    };
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE tasks SET preflight = $2, status = $3 WHERE id = $1", [taskId, JSON.stringify(preflight), status]);
      if (artifact) {
        await client.query("INSERT INTO artifacts (id, mission_id, plan_version_id, task_id, artifact_type, title, content, content_hash, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [artifact.id, missionId, mission.currentPlan!.id, taskId, artifact.type, artifact.title, JSON.stringify(artifact.content), artifact.contentHash, artifact.createdBy]);
      }
      await client.query("INSERT INTO execution_receipts (id, mission_id, plan_version_id, task_id, idempotency_key, executor, status, preflight, artifact_id, artifact_hash, summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [receipt.id, missionId, mission.currentPlan!.id, taskId, receipt.idempotencyKey, receipt.executor, receipt.status, JSON.stringify(preflight), receipt.artifactId ?? null, receipt.artifactHash ?? null, receipt.summary]);
      await this.insertAudit(client, missionId, { actorType: preflight.canRun ? task.ownerType : "system", actorName: preflight.canRun ? actor : "Relay Preflight", eventType: preflight.canRun ? "task.completed" : "task.blocked", entityType: "task", entityId: taskId, planVersion: mission.currentPlanVersion, summary: receipt.summary, data: { idempotencyKey: receipt.idempotencyKey, artifactId: receipt.artifactId, artifactHash: receipt.artifactHash, checks: preflight.checks } });
      await client.query("UPDATE missions SET updated_at = now() WHERE id = $1", [missionId]);
      await client.query("COMMIT");
      return { mission: await this.getMission(missionId, scope), preflight, receipt };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async addCorrection(missionId: string, input: { statement: string; assertionType: IntentAssertion["type"]; author: string }, scope: StoreScope) {
    const mission = await this.getMission(missionId, scope);
    const assertionId = uid();
    const conflictId = uid();
    const options = [
      { id: "recommended", label: "Recommended resolution", description: "Accept the correction, replan unfinished work, and issue a new plan version.", recommended: true, timeImpact: "Short replan required", budgetImpact: "Recalculate affected tasks", outcomeImpact: "Keeps execution aligned", risk: "Low" },
      { id: "alternative-a", label: "Alternative A", description: "Limit the correction to future missions.", recommended: false, timeImpact: "No current delay", budgetImpact: "No change", outcomeImpact: "Current mission unchanged", risk: "Medium" },
      { id: "alternative-b", label: "Alternative B", description: "Pause the mission for manual review.", recommended: false, timeImpact: "Mission paused", budgetImpact: "Prevents further spend", outcomeImpact: "Deadline risk", risk: "Low execution risk" },
    ];
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO intent_assertions (id, mission_id, statement, assertion_type, authority_level, confidence, scope, metadata) VALUES ($1,$2,$3,$4,5,1,'mission',$5)", [assertionId, missionId, input.statement, input.assertionType, JSON.stringify({ origin: "human_correction" })]);
      await client.query("INSERT INTO conflicts (id, mission_id, conflict_type, title, summary, severity, status, blocking, source_assertion_ids, decision_owner, consequences, options) VALUES ($1,$2,'Version conflict','New correction changes the active execution contract',$3,'high','open',true,$4,$5,$6,$7)", [conflictId, missionId, input.statement, [assertionId], input.author, "Running tasks and prior approvals may no longer match the team's current intent.", JSON.stringify(options)]);
      if (mission.currentPlan) {
        await client.query("UPDATE plan_versions SET status = 'superseded' WHERE id = $1", [mission.currentPlan.id]);
        await client.query("UPDATE approvals SET status = 'invalidated' WHERE plan_version_id = $1 AND status IN ('pending','approved')", [mission.currentPlan.id]);
        await client.query("UPDATE tasks SET status = 'blocked' WHERE plan_version_id = $1 AND status NOT IN ('completed','failed')", [mission.currentPlan.id]);
      }
      await client.query("UPDATE missions SET status = 'conflicts', updated_at = now() WHERE id = $1", [missionId]);
      await this.insertAudit(client, missionId, { actorType: "human", actorName: input.author, eventType: "assertion.corrected", entityType: "intent_assertion", entityId: assertionId, planVersion: mission.currentPlanVersion, summary: "Correction added; active plan and approvals invalidated.", data: { statement: input.statement } });
      await client.query("COMMIT");
      return this.getMission(missionId, scope);
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async updateOutcome(missionId: string, input: Omit<Outcome, "id" | "blockers" | "updatedAt">, scope: StoreScope) {
    const mission = await this.getMission(missionId, scope);
    const blockers = mission.conflicts.filter((conflict) => conflict.status === "open").map((conflict) => conflict.title);
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO outcomes (id, mission_id, metric_name, target_value, actual_value, status, cost, duration_minutes, human_interventions, blockers, recommendation, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
        ON CONFLICT (mission_id) DO UPDATE SET metric_name=EXCLUDED.metric_name,target_value=EXCLUDED.target_value,actual_value=EXCLUDED.actual_value,status=EXCLUDED.status,cost=EXCLUDED.cost,duration_minutes=EXCLUDED.duration_minutes,human_interventions=EXCLUDED.human_interventions,blockers=EXCLUDED.blockers,recommendation=EXCLUDED.recommendation,updated_at=now()`,
      [mission.outcome?.id ?? uid(), missionId, input.metricName, input.targetValue, input.actualValue, input.status, input.cost, input.durationMinutes, input.humanInterventions, JSON.stringify(blockers), input.recommendation]);
      if (["achieved", "missed"].includes(input.status)) await client.query("UPDATE missions SET status = 'completed', updated_at = now() WHERE id = $1", [missionId]);
      await this.insertAudit(client, missionId, { actorType: "human", actorName: mission.createdBy, eventType: "outcome.updated", entityType: "outcome", entityId: mission.outcome?.id, planVersion: mission.currentPlanVersion, summary: `Outcome marked ${input.status}.`, data: { actualValue: input.actualValue, cost: input.cost } });
      await client.query("COMMIT");
      return this.getMission(missionId, scope);
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async createPublicReport(missionId: string, scope: StoreScope) {
    const mission = await this.getMission(missionId, scope);
    const slug = uid().replaceAll("-", "").slice(0, 16);
    const generatedAt = now();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString();
    const report = publicReportFromMission(mission, slug, generatedAt, expiresAt);
    await pool!.query("INSERT INTO public_reports (id, slug, mission_id, snapshot, created_by, expires_at) VALUES ($1,$2,$3,$4,$5,$6)", [uid(), slug, missionId, JSON.stringify(report), scope.kind === "session" ? scope.userId : null, expiresAt]);
    return report;
  }

  async getPublicReport(slug: string) {
    const result = await pool!.query("SELECT snapshot FROM public_reports WHERE slug = $1 AND revoked_at IS NULL AND expires_at > now()", [slug]);
    if (!result.rowCount) throw new NotFoundError("Public report not found.");
    return result.rows[0].snapshot as PublicMissionReport;
  }

  async seedDemo() {
    await this.ensureIdentity(pool!);
    const existing = await pool!.query("SELECT id FROM missions WHERE title = $1 ORDER BY created_at LIMIT 1", [demoMissionInput.title]);
    if (existing.rowCount) return existing.rows[0].id;
    const created = await this.createMission(demoMissionInput, systemScope);
    await this.compileMission(created.id, systemScope);
    return created.id;
  }
}

export const store: RelayStore = pool ? new PostgresRelayStore() : new MemoryRelayStore();
export { ConflictError, NotFoundError };
