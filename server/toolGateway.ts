import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { contentHash } from "./execution";
import { getProviderCredential } from "./connectors";
import { getAgentRunById } from "./agentRuntime";
import { recordCollaborationEvent } from "./collaboration";
import { store } from "./store";
import type { StoreScope } from "./security";

const toolRequestSchema = z.object({
  connectionId: z.string().uuid(),
  operation: z.enum([
    "drive.read_metadata", "gmail.read_thread", "gmail.create_draft", "calendar.list_events", "calendar.create_review_event",
    "slack.read_channel", "slack.post_internal", "notion.read_page", "notion.update_page",
    "github.read_repo", "github.create_issue", "github.comment_pr", "figma.read_file", "figma.read_comments", "figma.post_comment",
  ]),
  resourceId: z.string().min(1).max(2_000),
  payload: z.record(z.unknown()).default({}),
});

type ToolRequest = z.infer<typeof toolRequestSchema>;
type OperationPolicy = { provider: "google" | "slack" | "notion" | "github" | "figma"; capability: string; risk: 0 | 1 | 2 | 3 | 4; createsResource?: boolean };

const POLICIES: Record<ToolRequest["operation"], OperationPolicy> = {
  "drive.read_metadata": { provider: "google", capability: "Drive: read selected files", risk: 0 },
  "gmail.read_thread": { provider: "google", capability: "Gmail: read selected threads", risk: 0 },
  "gmail.create_draft": { provider: "google", capability: "Gmail: create draft", risk: 1, createsResource: true },
  "calendar.list_events": { provider: "google", capability: "Calendar: read events", risk: 0 },
  "calendar.create_review_event": { provider: "google", capability: "Calendar: create review event", risk: 2, createsResource: true },
  "slack.read_channel": { provider: "slack", capability: "Slack: read selected channels", risk: 0 },
  "slack.post_internal": { provider: "slack", capability: "Slack: post internal update", risk: 2 },
  "notion.read_page": { provider: "notion", capability: "Notion: read user-selected pages", risk: 0 },
  "notion.update_page": { provider: "notion", capability: "Notion: update mission page", risk: 2 },
  "github.read_repo": { provider: "github", capability: "GitHub: read mission repositories", risk: 0 },
  "github.create_issue": { provider: "github", capability: "GitHub: create issue", risk: 2, createsResource: true },
  "github.comment_pr": { provider: "github", capability: "GitHub: comment on pull request", risk: 2 },
  "figma.read_file": { provider: "figma", capability: "Figma: read mission files", risk: 0 },
  "figma.read_comments": { provider: "figma", capability: "Figma: read comments", risk: 0 },
  "figma.post_comment": { provider: "figma", capability: "Figma: post review comment", risk: 2 },
};

function encodeMime(input: { to: string; subject: string; body: string }) {
  const clean = (value: string) => value.replace(/[\r\n]+/g, " ");
  const mime = [`To: ${clean(input.to)}`, `Subject: ${clean(input.subject)}`, "Content-Type: text/plain; charset=utf-8", "", input.body].join("\r\n");
  return Buffer.from(mime).toString("base64url");
}

async function providerJson(url: string, token: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const text = await response.text();
  let payload: any;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok || payload.ok === false) throw new Error(String(payload.error?.message || payload.error || payload.message || `Provider HTTP ${response.status}`));
  return payload;
}

function requiredString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw Object.assign(new Error(`${key} is required for this provider operation.`), { status: 400 });
  return value;
}

async function executeProvider(policy: OperationPolicy, request: ToolRequest, accessToken: string) {
  const id = encodeURIComponent(request.resourceId);
  if (request.operation === "drive.read_metadata") return providerJson(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,modifiedTime,version,webViewLink,owners(displayName,emailAddress)`, accessToken);
  if (request.operation === "gmail.read_thread") return providerJson(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, accessToken);
  if (request.operation === "gmail.create_draft") {
    const raw = encodeMime({ to: requiredString(request.payload, "to"), subject: requiredString(request.payload, "subject"), body: requiredString(request.payload, "body") });
    return providerJson("https://gmail.googleapis.com/gmail/v1/users/me/drafts", accessToken, { method: "POST", body: JSON.stringify({ message: { raw } }) });
  }
  if (request.operation === "calendar.list_events") {
    const params = new URLSearchParams({ maxResults: "50", singleEvents: "true", orderBy: "startTime" });
    if (typeof request.payload.timeMin === "string") params.set("timeMin", request.payload.timeMin);
    if (typeof request.payload.timeMax === "string") params.set("timeMax", request.payload.timeMax);
    return providerJson(`https://www.googleapis.com/calendar/v3/calendars/${id}/events?${params}`, accessToken);
  }
  if (request.operation === "calendar.create_review_event") return providerJson(`https://www.googleapis.com/calendar/v3/calendars/${id}/events`, accessToken, { method: "POST", body: JSON.stringify(request.payload) });
  if (request.operation === "slack.read_channel") return providerJson(`https://slack.com/api/conversations.history?channel=${id}&limit=50`, accessToken);
  if (request.operation === "slack.post_internal") return providerJson("https://slack.com/api/chat.postMessage", accessToken, { method: "POST", body: JSON.stringify({ channel: request.resourceId, text: requiredString(request.payload, "text") }) });
  if (request.operation === "notion.read_page") return providerJson(`https://api.notion.com/v1/pages/${id}`, accessToken, { headers: { "Notion-Version": "2026-03-11" } });
  if (request.operation === "notion.update_page") return providerJson(`https://api.notion.com/v1/pages/${id}`, accessToken, { method: "PATCH", headers: { "Notion-Version": "2026-03-11" }, body: JSON.stringify(request.payload) });
  if (request.operation === "github.read_repo") return providerJson(`https://api.github.com/repos/${request.resourceId}`, accessToken, { headers: { "X-GitHub-Api-Version": "2022-11-28", Accept: "application/vnd.github+json" } });
  if (request.operation === "github.create_issue") return providerJson(`https://api.github.com/repos/${request.resourceId}/issues`, accessToken, { method: "POST", headers: { "X-GitHub-Api-Version": "2022-11-28", Accept: "application/vnd.github+json" }, body: JSON.stringify({ title: requiredString(request.payload, "title"), body: request.payload.body ?? "" }) });
  if (request.operation === "github.comment_pr") {
    const number = Number(request.payload.number);
    if (!Number.isInteger(number)) throw Object.assign(new Error("number is required for a pull request comment."), { status: 400 });
    return providerJson(`https://api.github.com/repos/${request.resourceId}/issues/${number}/comments`, accessToken, { method: "POST", headers: { "X-GitHub-Api-Version": "2022-11-28", Accept: "application/vnd.github+json" }, body: JSON.stringify({ body: requiredString(request.payload, "body") }) });
  }
  if (request.operation === "figma.read_file") return providerJson(`https://api.figma.com/v1/files/${id}?depth=2`, accessToken);
  if (request.operation === "figma.read_comments") return providerJson(`https://api.figma.com/v1/files/${id}/comments`, accessToken);
  if (request.operation === "figma.post_comment") return providerJson(`https://api.figma.com/v1/files/${id}/comments`, accessToken, { method: "POST", body: JSON.stringify({ message: requiredString(request.payload, "message"), ...(request.payload.client_meta ? { client_meta: request.payload.client_meta } : {}) }) });
  throw new Error(`No provider adapter is registered for ${request.operation}.`);
}

function summarizeResult(operation: ToolRequest["operation"], payload: any) {
  return {
    operation,
    providerId: payload.id || payload.ts || payload.key || payload.name || undefined,
    providerUrl: payload.html_url || payload.webViewLink || payload.url || undefined,
    itemCount: Array.isArray(payload.items) ? payload.items.length : Array.isArray(payload.messages) ? payload.messages.length : Array.isArray(payload.comments) ? payload.comments.length : undefined,
    providerOk: payload.ok ?? true,
  };
}

export async function executeToolCall(
  missionId: string,
  runId: string,
  rawInput: unknown,
  scope: Extract<StoreScope, { kind: "session" }>,
) {
  const request = toolRequestSchema.parse(rawInput);
  const policy = POLICIES[request.operation];
  const mission = await store.getMission(missionId, scope);
  const run = await getAgentRunById(runId);
  if (!run || run.missionId !== missionId) throw Object.assign(new Error("Agent run is not part of this mission."), { status: 404 });
  if (!mission.currentPlan || mission.currentPlan.id !== run.planVersionId) throw Object.assign(new Error("Agent run belongs to a stale plan version."), { status: 409 });
  const task = mission.currentPlan.tasks.find((item) => item.id === run.taskId)!;
  if (!["queued", "running", "succeeded"].includes(run.status)) throw Object.assign(new Error(`Tool calls cannot run while the Agent Run is ${run.status}.`), { status: 409 });
  if (task.status === "blocked" || (mission.blockingConflicts > 0 && !["T-01", "T-02"].includes(task.key))) throw Object.assign(new Error("Blocking Mission conflicts must be resolved before this provider action."), { status: 409 });
  const unmetDependencies = task.dependencies.filter((key) => mission.currentPlan?.tasks.find((candidate) => candidate.key === key)?.status !== "completed");
  if (unmetDependencies.length) throw Object.assign(new Error(`Provider action is waiting for dependencies: ${unmetDependencies.join(", ")}.`), { status: 409 });
  if (policy.risk > task.riskLevel) throw Object.assign(new Error("This tool operation exceeds the task risk contract."), { status: 403 });
  if (!task.requiredCapabilities.includes(policy.capability)) throw Object.assign(new Error("This operation is not a capability of the Agent's current task contract."), { status: 403 });
  const { connection, definition, credentials } = await getProviderCredential(request.connectionId, scope);
  if (connection.status !== "verified") throw Object.assign(new Error("Connector must pass live verification before a tool call."), { status: 409 });
  if (definition.key !== policy.provider) throw Object.assign(new Error("Connector provider does not match the requested capability."), { status: 409 });
  const requestHash = contentHash({ missionId, planVersion: mission.currentPlan.version, taskId: task.id, operation: request.operation, resourceId: request.resourceId, payload: request.payload });
  let approvalId: string | undefined;
  if (pool) {
    const manifests = await pool.query(
      `SELECT * FROM access_manifests WHERE mission_id=$1 AND plan_version_id=$2 AND connection_id=$3
       AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC`,
      [missionId, mission.currentPlan.id, request.connectionId],
    );
    if (!manifests.rowCount) throw Object.assign(new Error("No valid plan-bound Access Manifest grants this connector."), { status: 403 });
    const resources = [...new Set(manifests.rows.flatMap((row) => row.allowed_resources as string[]))];
    const capabilities = manifests.rows.flatMap((row) => (row.granted_capabilities as string[]).map((capability) => `${row.provider}: ${capability}`));
    if (!capabilities.includes(policy.capability)) throw Object.assign(new Error("The current Access Manifest does not grant this exact provider capability."), { status: 403 });
    const draftNamespace = `mission:${missionId}:drafts`;
    if (!resources.includes(request.resourceId) && !(policy.createsResource && resources.includes(draftNamespace))) throw Object.assign(new Error("Resource is outside this mission's exact Access Manifest."), { status: 403 });
    if (policy.risk >= 3) {
      const approval = mission.currentPlan.approvals.find((item) => item.taskId === task.id && item.status === "approved" && item.payloadHash === requestHash && new Date(item.expiresAt).getTime() > Date.now());
      if (!approval) throw Object.assign(new Error("This exact payload is not covered by a current approval."), { status: 403 });
      approvalId = approval.id;
    }
  } else if (policy.risk >= 3) {
    const approval = mission.currentPlan.approvals.find((item) => item.taskId === task.id && item.status === "approved" && item.payloadHash === requestHash);
    if (!approval) throw Object.assign(new Error("This exact payload is not covered by a current approval."), { status: 403 });
    approvalId = approval.id;
  }
  const toolCallId = randomUUID();
  if (pool) await pool.query(
    `INSERT INTO tool_calls (id,mission_id,plan_version_id,task_id,agent_run_id,connection_id,provider,capability,resource_id,risk_level,request_payload_hash,status,approval_id,started_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'executing',$12,now())`,
    [toolCallId, missionId, mission.currentPlan.id, task.id, runId, request.connectionId, definition.key, policy.capability, request.resourceId, policy.risk, requestHash, approvalId ?? null],
  );
  await recordCollaborationEvent({ missionId, actor: { type: "agent", id: run.agentId, name: run.agentName }, eventType: "tool_call.started", entityType: "tool_call", entityId: toolCallId, summary: `${run.agentName} called ${request.operation} through Relay's capability gateway.`, data: { taskKey: run.taskKey, provider: definition.label, capability: policy.capability, riskLevel: policy.risk, resourceId: request.resourceId, requestHash } });
  try {
    const result = await executeProvider(policy, request, credentials.accessToken);
    const resultHash = contentHash(result);
    const summary = summarizeResult(request.operation, result);
    if (pool) await pool.query("UPDATE tool_calls SET status='succeeded',response_payload_hash=$2,finished_at=now() WHERE id=$1", [toolCallId, resultHash]);
    await recordCollaborationEvent({ missionId, actor: { type: "provider", name: definition.label }, eventType: "tool_call.succeeded", entityType: "tool_call", entityId: toolCallId, summary: `${definition.label} confirmed ${request.operation}.`, data: { taskKey: run.taskKey, resultHash, ...summary } });
    return { id: toolCallId, status: "succeeded" as const, requestHash, resultHash, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider call failed";
    if (pool) await pool.query("UPDATE tool_calls SET status='failed',blocked_reason=$2,finished_at=now() WHERE id=$1", [toolCallId, message]);
    await recordCollaborationEvent({ missionId, actor: { type: "provider", name: definition.label }, eventType: "tool_call.failed", entityType: "tool_call", entityId: toolCallId, summary: `${definition.label} rejected or failed ${request.operation}.`, data: { taskKey: run.taskKey, error: message, requestHash } });
    throw Object.assign(new Error(message), { status: 502 });
  }
}

export { toolRequestSchema };
