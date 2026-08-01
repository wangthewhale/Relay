import { randomUUID } from "node:crypto";
import type { AgentDefinition, AgentRun, MissionMember } from "../shared/domain";
import { pool } from "./db";
import { recordCollaborationEvent } from "./collaboration";
import { store } from "./store";
import { systemScope, type StoreScope } from "./security";

const now = () => new Date().toISOString();
const processing = new Set<string>();
const memoryAgents = new Map<string, AgentDefinition[]>();
const memoryRuns = new Map<string, AgentRun>();
let workerStarted = false;
const stageDelayMs = process.env.NODE_ENV === "test" ? 40 : Math.max(120, Math.min(2_000, Number(process.env.AGENT_STAGE_DELAY_MS ?? 650)));

function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapRun(row: Record<string, any>): AgentRun {
  return {
    id: row.id,
    missionId: row.mission_id,
    planVersionId: row.plan_version_id,
    taskId: row.task_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    taskKey: row.task_key,
    taskTitle: row.task_title,
    status: row.status,
    attempt: row.attempt,
    progress: row.progress,
    phase: row.phase,
    checkpoint: row.checkpoint ?? {},
    heartbeatAt: toIso(row.heartbeat_at),
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!,
  };
}

export async function ensureMissionAgents(missionId: string, scope: StoreScope, members: MissionMember[] = []): Promise<AgentDefinition[]> {
  const mission = await store.getMission(missionId, scope);
  const taskGroups = new Map<string, { capabilities: Set<string>; maxRisk: number; purpose?: string }>();
  for (const task of mission.currentPlan?.tasks ?? []) {
    if (task.ownerType !== "agent") continue;
    const current = taskGroups.get(task.ownerName) ?? { capabilities: new Set<string>(), maxRisk: 0 };
    task.requiredCapabilities.forEach((capability) => current.capabilities.add(capability));
    current.maxRisk = Math.max(current.maxRisk, task.riskLevel);
    taskGroups.set(task.ownerName, current);
  }
  for (const member of members) {
    const name = `Proxy · ${member.user.name}`;
    taskGroups.set(name, {
      capabilities: new Set([
        `represent:${member.user.id}`,
        "summarize human intent",
        "join agent council",
        "request exact approval",
      ]),
      maxRisk: 0,
      purpose: `Keep ${member.user.name}'s ${member.user.department ?? "team"} goals, constraints and decisions represented in the mission without granting the Agent approval authority.`,
    });
  }
  if (!taskGroups.size) {
    taskGroups.set("Mission Analyst", { capabilities: new Set(["compile intent", "detect conflicts"]), maxRisk: 0 });
  }
  if (!pool) {
    const existing = memoryAgents.get(missionId) ?? [];
    for (const [name, definition] of taskGroups) {
      if (existing.some((agent) => agent.name === name)) continue;
      existing.push({
        id: randomUUID(), name, purpose: definition.purpose ?? `Own ${name.replace(/ Agent$/i, "").toLowerCase()} work under the active execution contract.`,
        modelProvider: "relay-runtime", modelName: process.env.OPENAI_MODEL || "policy-and-tool-worker", capabilities: [...definition.capabilities], riskCeiling: definition.maxRisk as AgentDefinition["riskCeiling"], status: "idle",
      });
    }
    memoryAgents.set(missionId, existing);
    return existing;
  }
  const missionRow = await pool.query("SELECT workspace_id FROM missions WHERE id=$1", [missionId]);
  const workspaceId = missionRow.rows[0]?.workspace_id;
  for (const [name, definition] of taskGroups) {
    await pool.query(
      `INSERT INTO agents (id,workspace_id,mission_id,name,purpose,model_provider,model_name,capabilities,risk_ceiling,status)
       VALUES ($1,$2,$3,$4,$5,'relay-runtime',$6,$7,$8,'idle')
       ON CONFLICT (mission_id,name) DO UPDATE SET purpose=EXCLUDED.purpose,capabilities=EXCLUDED.capabilities,risk_ceiling=EXCLUDED.risk_ceiling,updated_at=now()`,
      [randomUUID(), workspaceId, missionId, name, definition.purpose ?? `Own ${name.replace(/ Agent$/i, "").toLowerCase()} work under the active execution contract.`, process.env.OPENAI_MODEL || "policy-and-tool-worker", JSON.stringify([...definition.capabilities]), definition.maxRisk],
    );
  }
  const result = await pool.query("SELECT * FROM agents WHERE mission_id=$1 ORDER BY created_at", [missionId]);
  return result.rows.map((row) => ({ id: row.id, name: row.name, purpose: row.purpose, modelProvider: row.model_provider, modelName: row.model_name, capabilities: row.capabilities ?? [], riskCeiling: row.risk_ceiling, status: row.status }));
}

export async function listAgentRuns(missionId: string, scope: StoreScope): Promise<AgentRun[]> {
  await store.getMission(missionId, scope);
  if (!pool) return [...memoryRuns.values()].filter((run) => run.missionId === missionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const result = await pool.query(
    `SELECT ar.*,a.name AS agent_name,t.task_key,t.title AS task_title
     FROM agent_runs ar JOIN agents a ON a.id=ar.agent_id JOIN tasks t ON t.id=ar.task_id
     WHERE ar.mission_id=$1 ORDER BY ar.created_at DESC LIMIT 100`,
    [missionId],
  );
  return result.rows.map(mapRun);
}

async function getRun(runId: string): Promise<AgentRun | undefined> {
  if (!pool) return memoryRuns.get(runId);
  const result = await pool.query(
    `SELECT ar.*,a.name AS agent_name,t.task_key,t.title AS task_title
     FROM agent_runs ar JOIN agents a ON a.id=ar.agent_id JOIN tasks t ON t.id=ar.task_id WHERE ar.id=$1`,
    [runId],
  );
  return result.rowCount ? mapRun(result.rows[0]) : undefined;
}

export async function getAgentRunById(runId: string) {
  return getRun(runId);
}

async function setRunState(runId: string, patch: Partial<Pick<AgentRun, "status" | "progress" | "phase" | "checkpoint" | "errorCode" | "errorMessage">> & { started?: boolean; finished?: boolean }, expectedStatuses?: AgentRun["status"][]) {
  if (!pool) {
    const run = memoryRuns.get(runId);
    if (!run) return undefined;
    if (expectedStatuses && !expectedStatuses.includes(run.status)) return undefined;
    Object.assign(run, patch);
    if (patch.started && !run.startedAt) run.startedAt = now();
    if (patch.finished) run.finishedAt = now();
    run.heartbeatAt = now();
    run.updatedAt = now();
    return run;
  }
  const current = await getRun(runId);
  if (!current) return undefined;
  const result = await pool.query(
    `UPDATE agent_runs SET status=$2,progress=$3,phase=$4,checkpoint=$5,error_code=$6,error_message=$7,
     heartbeat_at=now(),started_at=CASE WHEN $8 AND started_at IS NULL THEN now() ELSE started_at END,
     finished_at=CASE WHEN $9 THEN now() ELSE finished_at END,updated_at=now() WHERE id=$1
     AND ($10::text[] IS NULL OR status = ANY($10::text[]))
     RETURNING id`,
    [runId, patch.status ?? current.status, patch.progress ?? current.progress, patch.phase ?? current.phase, JSON.stringify(patch.checkpoint ?? current.checkpoint), patch.errorCode ?? current.errorCode ?? null, patch.errorMessage ?? current.errorMessage ?? null, Boolean(patch.started), Boolean(patch.finished), expectedStatuses ?? null],
  );
  return result.rowCount ? getRun(runId) : undefined;
}

async function stage(run: AgentRun, progress: number, phase: string, checkpoint: Record<string, unknown>) {
  const current = await getRun(run.id);
  if (!current) return "cancelled" as const;
  const mission = await store.getMission(run.missionId, systemScope);
  if (!mission.currentPlan || mission.currentPlan.id !== run.planVersionId) {
    await setRunState(run.id, { status: "cancelled", progress: current.progress, phase: "stale plan stopped", checkpoint: { ...current.checkpoint, stoppedAt: now(), reason: "plan_version_changed" }, finished: true });
    await recordCollaborationEvent({ missionId: run.missionId, actor: { type: "system", name: "Version Gate" }, eventType: "agent_run.stale_plan_stopped", entityType: "agent_run", entityId: run.id, summary: `${run.agentName} stopped because its Plan Version is no longer active.`, data: { runPlanVersionId: run.planVersionId, currentPlanVersionId: mission.currentPlan?.id } });
    return "cancelled" as const;
  }
  if (current.status === "cancel_requested") {
    await setRunState(run.id, { status: "cancelled", progress: current.progress, phase: "cancelled", checkpoint: { ...current.checkpoint, cancelledAt: now() }, finished: true });
    await recordCollaborationEvent({ missionId: run.missionId, actor: { type: "agent", id: run.agentId, name: run.agentName }, eventType: "agent_run.cancelled", entityType: "agent_run", entityId: run.id, summary: `${run.agentName} stopped safely at a checkpoint.`, data: { taskKey: run.taskKey, phase: current.phase } });
    return "cancelled" as const;
  }
  if (current.status === "pause_requested") {
    await setRunState(run.id, { status: "paused", progress: current.progress, phase: "paused", checkpoint: { ...current.checkpoint, pausedAt: now(), previousPhase: current.phase } });
    await recordCollaborationEvent({ missionId: run.missionId, actor: { type: "agent", id: run.agentId, name: run.agentName }, eventType: "agent_run.paused", entityType: "agent_run", entityId: run.id, summary: `${run.agentName} paused without losing its checkpoint.`, data: { taskKey: run.taskKey, checkpoint: current.checkpoint } });
    return "paused" as const;
  }
  const advanced = await setRunState(run.id, { status: "running", progress, phase, checkpoint }, ["running"]);
  if (!advanced) return stage(run, progress, phase, checkpoint);
  await recordCollaborationEvent({ missionId: run.missionId, actor: { type: "agent", id: run.agentId, name: run.agentName }, eventType: "agent_run.progress", entityType: "agent_run", entityId: run.id, summary: `${run.agentName}: ${phase}`, data: { taskKey: run.taskKey, progress, checkpoint } });
  await new Promise<void>((resolve) => setTimeout(resolve, stageDelayMs));
  return "continue" as const;
}

async function processRun(runId: string) {
  if (processing.has(runId)) return;
  processing.add(runId);
  try {
    let run = await getRun(runId);
    if (!run || run.status !== "queued") return;
    if (pool) {
      const claimed = await pool.query(
        `UPDATE agent_runs SET status='running',progress=GREATEST(progress,5),phase='preflight',
         checkpoint=checkpoint || $2::jsonb,heartbeat_at=now(),started_at=COALESCE(started_at,now()),updated_at=now()
         WHERE id=$1 AND status='queued' RETURNING id`,
        [run.id, JSON.stringify({ resumedFrom: run.phase })],
      );
      if (!claimed.rowCount) return;
      run = (await getRun(run.id))!;
    } else {
      run = (await setRunState(run.id, { status: "running", progress: Math.max(run.progress, 5), phase: "preflight", checkpoint: { ...run.checkpoint, resumedFrom: run.phase }, started: true }))!;
    }
    if (pool) await pool.query("UPDATE agents SET status='running',updated_at=now() WHERE id=$1", [run.agentId]);
    else {
      const agent = memoryAgents.get(run.missionId)?.find((item) => item.id === run!.agentId);
      if (agent) agent.status = "running";
    }
    await recordCollaborationEvent({ missionId: run.missionId, actor: { type: "agent", id: run.agentId, name: run.agentName }, eventType: "agent_run.started", entityType: "agent_run", entityId: run.id, summary: `${run.agentName} started ${run.taskKey}.`, data: { taskTitle: run.taskTitle, attempt: run.attempt } });
    if (await stage(run, 20, "Checking plan version, authority, approvals and access", { gate: "preflight", checkedAt: now() }) !== "continue") return;
    if (await stage(run, 45, "Loading only mission-scoped evidence", { gate: "evidence", evidenceScope: run.missionId }) !== "continue") return;
    if (await stage(run, 70, "Executing the registered task capability", { gate: "execution", idempotencyKey: `${run.missionId}:${run.planVersionId}:${run.taskId}` }) !== "continue") return;
    const result = await store.runTask(run.taskId, run.agentName, systemScope);
    const terminal = result.receipt.status === "succeeded" ? "succeeded" : "blocked";
    await setRunState(run.id, { status: terminal, progress: terminal === "succeeded" ? 100 : 70, phase: terminal === "succeeded" ? "completed with evidence" : "blocked by preflight", checkpoint: { receiptId: result.receipt.id, artifactHash: result.receipt.artifactHash }, finished: true });
    await recordCollaborationEvent({ missionId: run.missionId, actor: { type: "agent", id: run.agentId, name: run.agentName }, eventType: `agent_run.${terminal}`, entityType: "agent_run", entityId: run.id, summary: terminal === "succeeded" ? `${run.agentName} completed ${run.taskKey} with a verifiable receipt.` : `${run.agentName} stopped before an unsafe or unavailable action.`, data: { taskKey: run.taskKey, receiptId: result.receipt.id, artifactHash: result.receipt.artifactHash, checks: result.preflight.checks } });
  } catch (error) {
    const run = await getRun(runId);
    const message = error instanceof Error ? error.message : "Unknown runtime error";
    if (run) {
      await setRunState(run.id, { status: "failed", phase: "failed", errorCode: "RUN_FAILED", errorMessage: message, finished: true });
      await recordCollaborationEvent({ missionId: run.missionId, actor: { type: "agent", id: run.agentId, name: run.agentName }, eventType: "agent_run.failed", entityType: "agent_run", entityId: run.id, summary: `${run.agentName} failed and preserved its last checkpoint.`, data: { taskKey: run.taskKey, error: message } });
    }
  } finally {
    const run = await getRun(runId);
    if (run && !["running", "pause_requested", "cancel_requested"].includes(run.status)) {
      if (pool) await pool.query("UPDATE agents SET status=$2,updated_at=now() WHERE id=$1", [run.agentId, run.status === "paused" ? "paused" : "idle"]);
      else {
        const agent = memoryAgents.get(run.missionId)?.find((item) => item.id === run.agentId);
        if (agent) agent.status = run.status === "paused" ? "paused" : "idle";
      }
    }
    processing.delete(runId);
  }
}

async function kickQueue() {
  if (!pool) {
    const queued = [...memoryRuns.values()].filter((run) => run.status === "queued");
    queued.forEach((run) => void processRun(run.id));
    return;
  }
  const result = await pool.query("SELECT id FROM agent_runs WHERE status='queued' ORDER BY created_at LIMIT 10");
  result.rows.forEach((row) => void processRun(row.id));
}

export async function enqueueAgentRun(taskId: string, agentId: string | undefined, scope: Extract<StoreScope, { kind: "session" }>) {
  const missionRows = pool ? await pool.query("SELECT mission_id FROM tasks WHERE id=$1", [taskId]) : undefined;
  let missionId = missionRows?.rows[0]?.mission_id as string | undefined;
  if (!missionId) {
    const missions = await store.listMissions(scope);
    for (const summary of missions) {
      const detail = await store.getMission(summary.id, scope);
      if (detail.currentPlan?.tasks.some((task) => task.id === taskId)) { missionId = detail.id; break; }
    }
  }
  if (!missionId) throw Object.assign(new Error("Task not found."), { status: 404 });
  const mission = await store.getMission(missionId, scope);
  const task = mission.currentPlan?.tasks.find((item) => item.id === taskId);
  if (!task) throw Object.assign(new Error("Task is not part of the active plan."), { status: 409 });
  if (task.ownerType !== "agent") throw Object.assign(new Error("This task is owned by a human and cannot be queued for an agent."), { status: 409 });
  const agents = await ensureMissionAgents(missionId, scope);
  const agent = agents.find((item) => item.id === agentId) ?? agents.find((item) => item.name === task.ownerName);
  if (!agent) throw Object.assign(new Error("No mission agent is registered for this task."), { status: 409 });
  const previous = (await listAgentRuns(missionId, scope)).filter((run) => run.taskId === taskId && run.agentId === agent.id);
  const active = previous.find((run) => ["queued", "running", "pause_requested", "paused", "cancel_requested"].includes(run.status));
  if (active) return active;
  const succeeded = previous.find((run) => run.status === "succeeded");
  if (succeeded) return succeeded;
  const attempt = previous.length + 1;
  const run: AgentRun = {
    id: randomUUID(), missionId, planVersionId: mission.currentPlan!.id, taskId, agentId: agent.id, agentName: agent.name, taskKey: task.key, taskTitle: task.title,
    status: "queued", attempt, progress: 0, phase: "queued", checkpoint: {}, createdAt: now(), updatedAt: now(),
  };
  if (!pool) memoryRuns.set(run.id, run);
  else {
    await pool.query(
      `INSERT INTO agent_runs (id,mission_id,plan_version_id,task_id,agent_id,requested_by,status,attempt,progress,phase,checkpoint,input_snapshot,idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,'queued',$7,0,'queued','{}',$8,$9)`,
      [run.id, missionId, run.planVersionId, taskId, agent.id, scope.userId, attempt, JSON.stringify({ missionRevision: mission.currentPlanVersion, taskKey: task.key, requiredCapabilities: task.requiredCapabilities }), `${missionId}:v${mission.currentPlanVersion}:${taskId}:${agent.id}:attempt:${attempt}`],
    );
  }
  await recordCollaborationEvent({ missionId, actor: { type: "human", id: scope.userId, name: scope.actorName }, eventType: "agent_run.queued", entityType: "agent_run", entityId: run.id, summary: `${scope.actorName} assigned ${task.key} to ${agent.name}.`, data: { taskTitle: task.title, agentId: agent.id } });
  void kickQueue();
  return run;
}

export async function controlAgentRun(runId: string, command: "pause" | "resume" | "cancel", scope: Extract<StoreScope, { kind: "session" }>) {
  const run = await getRun(runId);
  if (!run) throw Object.assign(new Error("Agent run not found."), { status: 404 });
  await store.getMission(run.missionId, scope);
  let target: AgentRun["status"];
  if (command === "pause") {
    if (!['queued', 'running'].includes(run.status)) throw Object.assign(new Error(`Cannot pause a ${run.status} run.`), { status: 409 });
    target = run.status === "queued" ? "paused" : "pause_requested";
  } else if (command === "resume") {
    if (run.status !== "paused") throw Object.assign(new Error(`Cannot resume a ${run.status} run.`), { status: 409 });
    target = "queued";
  } else {
    if (["cancelled", "succeeded", "failed", "blocked"].includes(run.status)) throw Object.assign(new Error(`Cannot cancel a ${run.status} run.`), { status: 409 });
    target = ["queued", "paused"].includes(run.status) ? "cancelled" : "cancel_requested";
  }
  const updated = await setRunState(runId, { status: target, phase: target === "queued" ? "resuming from checkpoint" : target, finished: target === "cancelled" });
  await recordCollaborationEvent({ missionId: run.missionId, actor: { type: "human", id: scope.userId, name: scope.actorName }, eventType: `agent_run.${command}_requested`, entityType: "agent_run", entityId: run.id, summary: `${scope.actorName} requested ${command} for ${run.agentName}.`, data: { previousStatus: run.status, nextStatus: target, checkpoint: run.checkpoint } });
  if (target === "queued") void kickQueue();
  return updated;
}

export async function invalidateMissionRuns(missionId: string, activePlanVersionId?: string) {
  const runs = !pool
    ? [...memoryRuns.values()].filter((run) => run.missionId === missionId && run.planVersionId !== activePlanVersionId && ["queued", "running", "pause_requested", "paused", "cancel_requested"].includes(run.status))
    : (await pool.query(
      `SELECT ar.*,a.name AS agent_name,t.task_key,t.title AS task_title FROM agent_runs ar
       JOIN agents a ON a.id=ar.agent_id JOIN tasks t ON t.id=ar.task_id
       WHERE ar.mission_id=$1 AND ($2::uuid IS NULL OR ar.plan_version_id<>$2)
       AND ar.status IN ('queued','running','pause_requested','paused','cancel_requested')`,
      [missionId, activePlanVersionId ?? null],
    )).rows.map(mapRun);
  for (const run of runs) {
    const immediate = ["queued", "paused"].includes(run.status);
    await setRunState(run.id, { status: immediate ? "cancelled" : "cancel_requested", phase: "plan changed", checkpoint: { ...run.checkpoint, invalidatedAt: now(), reason: "plan_version_changed" }, finished: immediate });
    await recordCollaborationEvent({ missionId, actor: { type: "system", name: "Version Gate" }, eventType: "agent_run.invalidated", entityType: "agent_run", entityId: run.id, summary: `${run.agentName} was stopped because the mission contract changed.`, data: { taskKey: run.taskKey, previousPlanVersionId: run.planVersionId, activePlanVersionId } });
  }
  return runs.length;
}

export async function startAgentRuntime() {
  if (workerStarted) return;
  workerStarted = true;
  if (pool) {
    await pool.query(`UPDATE agent_runs SET status='queued',phase='recovering from durable checkpoint',updated_at=now()
      WHERE status='running' AND (heartbeat_at IS NULL OR heartbeat_at < now() - interval '45 seconds')`);
  }
  await kickQueue();
  setInterval(() => void kickQueue(), 2_000).unref();
}
