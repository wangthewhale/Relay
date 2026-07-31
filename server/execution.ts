import { createHash, randomUUID } from "node:crypto";
import type { Artifact, ExecutionTask, MissionDetail } from "../shared/domain";

const EXECUTORS: Record<string, { name: string; artifactType: Artifact["type"] }> = {
  "T-01": { name: "Relay Evidence Worker v1", artifactType: "evidence_manifest" },
  "T-03": { name: "Relay Brief Worker v1", artifactType: "execution_brief" },
  "T-04": { name: "Relay Audience Guardrail Worker v1", artifactType: "audience_guardrail" },
  "T-05": { name: "Relay Launch Draft Worker v1", artifactType: "launch_draft_bundle" },
  "T-07": { name: "Relay Launch Handoff Worker v1", artifactType: "launch_handoff" },
  "T-08": { name: "Relay Outcome Worker v1", artifactType: "outcome_report" },
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function contentHash(value: unknown) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}`;
}

export function verifiedExecutorFor(task: ExecutionTask) {
  if (["T-04", "T-05", "T-07"].includes(task.key) && !task.requiredCapabilities.some((capability) => capability.startsWith("Relay:"))) return undefined;
  return EXECUTORS[task.key];
}

function sourceFingerprint(source: MissionDetail["sources"][number]) {
  return contentHash({
    id: source.id,
    type: source.type,
    title: source.title,
    author: source.author,
    occurredAt: source.occurredAt,
    authorityLevel: source.authorityLevel,
    content: source.content,
  });
}

export function executeBuiltIn(mission: MissionDetail, task: ExecutionTask, actor: string): Artifact {
  const executor = verifiedExecutorFor(task);
  if (!executor) throw new Error(`No verified executor is registered for ${task.key}.`);
  const plan = mission.currentPlan;
  if (!plan) throw new Error("No active plan is available.");

  let title: string;
  let content: Record<string, unknown>;
  if (task.key === "T-01") {
    title = `Evidence manifest · Plan v${plan.version}`;
    content = {
      missionId: mission.id,
      planVersion: plan.version,
      sourceCount: mission.sources.length,
      assertionCount: mission.assertions.length,
      conflictCount: mission.conflicts.length,
      evidenceCoverage: mission.compilerReceipt?.evidenceCoverage ?? 0,
      sources: mission.sources.map((source) => ({
        sourceId: source.id,
        sourceType: source.type,
        title: source.title,
        author: source.author,
        authorityLevel: source.authorityLevel,
        fingerprint: sourceFingerprint(source),
      })),
    };
  } else if (task.key === "T-03") {
    title = `Launch execution brief · Plan v${plan.version}`;
    content = {
      missionId: mission.id,
      planVersion: plan.version,
      objective: mission.objective,
      successMetric: mission.successMetric,
      invariants: plan.contract.invariants,
      resolvedDecisions: mission.conflicts
        .filter((conflict) => conflict.resolution)
        .map((conflict) => ({ conflictId: conflict.id, title: conflict.title, decision: conflict.resolution?.decision, decidedBy: conflict.resolution?.decidedBy })),
      tasks: plan.tasks.map((item) => ({ key: item.key, title: item.title, owner: item.ownerName, riskLevel: item.riskLevel, dependencies: item.dependencies })),
      forbiddenExternalActions: ["send", "publish", "spend", "modify provider data"],
    };
  } else if (task.key === "T-04") {
    title = `Audience guardrail · Plan v${plan.version}`;
    content = {
      missionId: mission.id,
      planVersion: plan.version,
      sourceAssertions: mission.assertions.filter((assertion) => assertion.type === "Exclusion" || /audience|member|exclude|existing/i.test(assertion.statement)).map((assertion) => ({ id: assertion.id, statement: assertion.statement, sourceId: assertion.sourceId })),
      immutableRules: plan.contract.invariants,
      externalWrites: 0,
    };
  } else if (task.key === "T-05") {
    title = `Launch draft bundle · Plan v${plan.version}`;
    content = {
      missionId: mission.id,
      planVersion: plan.version,
      drafts: [
        { channel: "email", status: "internal_draft", purpose: "Client-ready launch announcement" },
        { channel: "social", status: "internal_draft", purpose: "Launch social copy" },
        { channel: "ads", status: "internal_draft", purpose: "Campaign setup brief" },
      ],
      audienceGuardrailArtifact: mission.artifacts.find((artifact) => artifact.type === "audience_guardrail")?.contentHash,
      forbiddenActions: task.forbiddenActions,
      externalWrites: 0,
    };
  } else if (task.key === "T-07") {
    const approved = plan.approvals.find((approval) => approval.status === "approved");
    title = `Approved launch handoff · Plan v${plan.version}`;
    content = {
      missionId: mission.id,
      planVersion: plan.version,
      approval: approved ? { id: approved.id, approver: approved.approver, payloadHash: approved.payloadHash, decidedAt: approved.decidedAt } : null,
      includedArtifacts: mission.artifacts.map((artifact) => ({ type: artifact.type, title: artifact.title, contentHash: artifact.contentHash })),
      ownerNextAction: "Connect verified providers to perform external send, publish or spend operations.",
      externalWrites: 0,
    };
  } else {
    title = `Outcome verification report · Plan v${plan.version}`;
    content = {
      missionId: mission.id,
      planVersion: plan.version,
      successMetric: mission.successMetric,
      outcome: mission.outcome ?? null,
      completedTaskReceipts: mission.executionReceipts.filter((receipt) => receipt.status === "succeeded").map((receipt) => receipt.id),
      unresolvedConflicts: mission.conflicts.filter((conflict) => conflict.status === "open").map((conflict) => conflict.title),
    };
  }

  return {
    id: randomUUID(),
    taskId: task.id,
    planVersion: plan.version,
    type: executor.artifactType,
    title,
    content,
    contentHash: contentHash(content),
    createdBy: actor,
    createdAt: new Date().toISOString(),
  };
}
