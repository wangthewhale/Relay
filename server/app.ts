import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import {
  approvalDecisionSchema,
  commentSchema,
  correctionSchema,
  createAgentRunSchema,
  createMissionSchema,
  createRuntimeKeySchema,
  handoffSchema,
  inviteMemberSchema,
  outcomeSchema,
  presenceSchema,
  resolveConflictSchema,
  sessionProfileSchema,
} from "../shared/domain";
import { databaseHealth } from "./db";
import { compilePlan } from "./compiler";
import { compileIntent, compilerRuntimeStatus } from "./intelligence";
import { ConflictError, NotFoundError, store } from "./store";
import {
  createGuestSession,
  createMissionShare,
  createRuntimeApiKey,
  assertWorkspaceAdmin,
  enforceSameOrigin,
  resolveRequestScope,
  setSessionCookie,
  systemScope,
  updateSessionIdentity,
  revokeRuntimeApiKey,
} from "./security";
import {
  acceptMissionInvite,
  addComment,
  assertDecisionAuthority,
  createHandoff,
  createMissionInvite,
  getEvents,
  getRoomState,
  heartbeatPresence,
  initializeMissionRoom,
  recordCollaborationEvent,
  recordLearningSignal,
  subscribeToMission,
} from "./collaboration";
import { controlAgentRun, enqueueAgentRun, ensureMissionAgents, invalidateMissionRuns, listAgentRuns } from "./agentRuntime";
import { beginOAuth, completeOAuth, listConnectorDescriptors, revokeConnector, verifyConnector } from "./connectors";
import { executeToolCall } from "./toolGateway";
import { contentHash } from "./execution";

function requestBaseUrl(request: Request) {
  const host = request.header("X-Forwarded-Host")?.split(",")[0]?.trim() || request.get("host");
  const protocol = request.header("X-Forwarded-Proto")?.split(",")[0]?.trim() || request.protocol;
  return `${protocol}://${host}`;
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none'");
    next();
  });
  app.use((request, _response, next) => {
    try {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) enforceSameOrigin(request);
      next();
    } catch (error) { next(error); }
  });

  app.get("/api/health", async (_request, response, next) => {
    try {
      response.json({ ok: true, service: "relay", database: await databaseHealth(), commit: process.env.REPLIT_GIT_COMMIT_SHA || process.env.GIT_COMMIT || "local" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/meta", (_request, response) => {
    response.json({
      product: "Relay",
      definition: "Intent compiler and execution control plane",
      compiler: compilerRuntimeStatus(),
      connectorPolicy: "No connector is shown as verified until Relay completes a real provider capability check.",
      riskLevels: [
        { level: 0, label: "Read", approval: "Access grant required" },
        { level: 1, label: "Draft", approval: "May run automatically; cannot publish" },
        { level: 2, label: "Internal write", approval: "Workspace policy" },
        { level: 3, label: "External action", approval: "Exact approval normally required" },
        { level: 4, label: "High-impact", approval: "Exact approval, audit and rollback required" },
      ],
    });
  });

  app.post("/api/session/guest", async (request, response, next) => {
    try {
      const session = await createGuestSession({
        name: typeof request.body?.name === "string" ? request.body.name : undefined,
        workspaceName: typeof request.body?.workspaceName === "string" ? request.body.workspaceName : undefined,
      });
      setSessionCookie(response, session.rawToken);
      response.status(201).json({ session: { actorName: session.scope.actorName, workspaceId: session.scope.kind === "session" ? session.scope.workspaceId : "", expiresAt: session.expiresAt, workspaceName: session.workspaceName } });
    } catch (error) { next(error); }
  });

  app.get("/api/session", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true });
      response.json({ session: { actorName: scope.actorName, workspaceId: scope.kind === "session" ? scope.workspaceId : "", userId: scope.kind === "session" ? scope.userId : "", workspaceRole: scope.kind === "session" ? scope.workspaceRole : undefined, email: scope.kind === "session" ? scope.email : undefined, title: scope.kind === "session" ? scope.title : undefined, department: scope.kind === "session" ? scope.department : undefined, identityVerified: scope.kind === "session" ? scope.identityVerified : false } });
    } catch (error) { next(error); }
  });

  app.put("/api/session/profile", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      const updated = await updateSessionIdentity(scope, sessionProfileSchema.parse(request.body));
      response.json({ session: { actorName: updated.actorName, workspaceId: updated.workspaceId, userId: updated.userId, workspaceRole: updated.workspaceRole, email: updated.email, title: updated.title, department: updated.department, identityVerified: updated.identityVerified } });
    } catch (error) { next(error); }
  });

  app.post("/api/runtime-keys", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      const input = createRuntimeKeySchema.parse(request.body);
      response.status(201).json({ key: await createRuntimeApiKey(scope, input) });
    } catch (error) { next(error); }
  });

  app.delete("/api/runtime-keys/:id", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      response.json({ key: await revokeRuntimeApiKey(scope, request.params.id) });
    } catch (error) { next(error); }
  });

  app.get("/api/demo", async (_request, response, next) => {
    try {
      const missionId = await store.seedDemo();
      response.json({ mission: await store.getMission(missionId, systemScope), readOnly: true });
    } catch (error) { next(error); }
  });

  app.post("/api/preview-compile", async (request, response, next) => {
    try {
      const input = createMissionSchema.parse(request.body);
      const createdAt = new Date().toISOString();
      const sources = input.sources.map((source) => ({ ...source, id: source.id ?? randomUUID(), createdAt }));
      // Landing-page previews stay policy-only to prevent an unsolicited model
      // call on every page view. Saved mission compilation enables the model.
      const compilation = await compileIntent(input, sources, { allowModel: false });
      const { assertions, conflicts } = compilation;
      const plan = compilePlan({ input, sources, conflicts, version: 1 });
      const primaryConflict = conflicts.find((conflict) => conflict.type === "Hard conflict")
        ?? conflicts.find((conflict) => conflict.blocking)
        ?? conflicts[0];
      const sourceById = new Map(sources.map((source) => [source.id, source]));
      const assertionById = new Map(assertions.map((assertion) => [assertion.id, assertion]));
      const evidence = (primaryConflict?.sourceAssertionIds ?? []).map((assertionId) => {
        const assertion = assertionById.get(assertionId);
        const source = assertion?.sourceId ? sourceById.get(assertion.sourceId) : undefined;
        return {
          id: assertionId,
          statement: assertion?.statement ?? "",
          assertionType: assertion?.type ?? "Constraint",
          sourceType: source?.type ?? "Mission",
          sourceTitle: source?.title ?? input.title,
          author: source?.author ?? input.createdBy,
        };
      });
      response.json({
        receipt: {
          sources: sources.length,
          assertions: assertions.length,
          conflicts: conflicts.length,
          blocking: conflicts.filter((conflict) => conflict.blocking).length,
          compiler: compilation.receipt,
        },
        conflict: primaryConflict ?? null,
        evidence,
        execution: {
          tasks: plan.tasks.length,
          agentTasks: plan.tasks.filter((task) => task.ownerType === "agent").length,
          blockedAgents: plan.tasks.filter((task) => task.ownerType === "agent" && task.status === "blocked").length,
          requiredProviders: plan.accessBlueprint.length,
        },
        saved: false,
      });
    } catch (error) { next(error); }
  });

  app.get("/api/public/reports/:slug", async (request, response, next) => {
    try { response.json({ report: await store.getPublicReport(request.params.slug) }); } catch (error) { next(error); }
  });

  app.get("/api/missions", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true });
      response.json({ missions: await store.listMissions(scope) });
    } catch (error) { next(error); }
  });

  app.get("/api/dashboard", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true });
      const missions = await store.listMissions(scope);
      response.json({
        missions,
        metrics: {
          active: missions.filter((mission) => mission.status === "active").length,
          blocked: missions.filter((mission) => mission.blockingConflicts > 0).length,
          awaitingDecisions: missions.reduce((sum, mission) => sum + mission.openConflicts, 0),
          awaitingApprovals: missions.reduce((sum, mission) => sum + mission.pendingApprovals, 0),
          successfulThisWeek: missions.filter((mission) => mission.status === "completed").length,
        },
      });
    } catch (error) { next(error); }
  });

  app.get("/api/missions/:id", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request);
      response.json({ mission: await store.getMission(request.params.id, scope), access: scope.kind === "share" ? (scope.canWrite ? "editor" : "viewer") : "workspace" });
    } catch (error) { next(error); }
  });

  app.post("/api/missions", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      const input = createMissionSchema.parse({ ...request.body, createdBy: scope.actorName });
      const mission = await store.createMission(input, scope);
      await initializeMissionRoom(mission.id, scope, true);
      await recordCollaborationEvent({ missionId: mission.id, actor: { type: "human", id: scope.kind === "session" ? scope.userId : undefined, name: scope.actorName }, eventType: "mission.created", entityType: "mission", entityId: mission.id, summary: `${scope.actorName} opened a live mission room.`, data: { sourceCount: mission.sources.length, objective: mission.objective } });
      response.status(201).json({ mission });
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/compile", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      const mission = await store.compileMission(request.params.id, scope);
      await initializeMissionRoom(mission.id, scope);
      await ensureMissionAgents(mission.id, scope);
      await recordCollaborationEvent({ missionId: mission.id, actor: { type: "agent", name: "Intent Compiler" }, eventType: "mission.compiled", entityType: "plan_version", entityId: mission.currentPlan?.id, summary: `Intent Compiler found ${mission.conflicts.length} conflicts and produced Plan v${mission.currentPlanVersion}.`, data: { assertions: mission.assertions.length, blockingConflicts: mission.blockingConflicts, evidenceCoverage: mission.compilerReceipt?.evidenceCoverage } });
      response.json({ mission });
    } catch (error) { next(error); }
  });

  app.post("/api/conflicts/:id/resolve", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      const existing = await store.getMissionByConflictId(request.params.id, scope);
      await assertDecisionAuthority(existing.id, scope, 2);
      const input = resolveConflictSchema.parse({ ...request.body, decidedBy: scope.actorName });
      const mission = await store.resolveConflict(request.params.id, input, scope);
      const conflict = mission.conflicts.find((item) => item.id === request.params.id);
      await recordCollaborationEvent({ missionId: mission.id, actor: { type: "human", id: scope.userId, name: scope.actorName }, eventType: "conflict.resolved", entityType: "conflict", entityId: request.params.id, summary: `${scope.actorName} resolved: ${conflict?.title ?? "mission conflict"}.`, data: { optionId: input.optionId, reason: input.reason, remainingBlocking: mission.blockingConflicts } });
      await recordLearningSignal({ missionId: mission.id, scope, type: "accepted_conflict", label: conflict?.type ?? "resolved", value: 1, conflictId: request.params.id, context: { optionId: input.optionId } });
      response.json({ mission });
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/plan", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      await assertDecisionAuthority(request.params.id, scope, 2);
      const mission = await store.recompilePlan(request.params.id, scope.actorName, scope);
      await invalidateMissionRuns(mission.id, mission.currentPlan?.id);
      await ensureMissionAgents(mission.id, scope);
      await recordCollaborationEvent({ missionId: mission.id, actor: { type: "agent", name: "Plan Compiler" }, eventType: "plan.activated", entityType: "plan_version", entityId: mission.currentPlan?.id, summary: `Plan v${mission.currentPlanVersion} is active; stale approvals and unfinished work were recalculated.`, data: { diff: mission.currentPlan?.diff } });
      response.json({ mission });
    } catch (error) { next(error); }
  });

  app.post("/api/approvals/:id/decide", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      const existing = await store.getMissionByApprovalId(request.params.id, scope);
      await assertDecisionAuthority(existing.id, scope, 3);
      const input = approvalDecisionSchema.parse({ ...request.body, decidedBy: scope.actorName });
      const mission = await store.decideApproval(request.params.id, input, scope);
      await recordCollaborationEvent({ missionId: mission.id, actor: { type: "human", id: scope.userId, name: scope.actorName }, eventType: `approval.${input.decision}`, entityType: "approval", entityId: request.params.id, summary: `${scope.actorName} ${input.decision} the exact plan-bound payload.`, data: { reason: input.reason, planVersion: mission.currentPlanVersion } });
      if (input.decision === "rejected") await recordLearningSignal({ missionId: mission.id, scope, type: "approval_rejected", label: input.reason, value: 1, context: { approvalId: request.params.id } });
      response.json({ mission });
    } catch (error) { next(error); }
  });

  app.post("/api/tasks/:id/run", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      response.json(await store.runTask(request.params.id, "Relay verified executor", scope));
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/corrections", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true, apiCapability: "mission:correct" });
      const input = correctionSchema.parse({ ...request.body, author: scope.actorName });
      const mission = await store.addCorrection(request.params.id, input, scope);
      await invalidateMissionRuns(mission.id, mission.currentPlan?.status === "active" ? mission.currentPlan.id : undefined);
      await recordCollaborationEvent({ missionId: mission.id, actor: { type: "human", id: scope.userId, name: scope.actorName }, eventType: "mission.corrected", entityType: "intent_assertion", summary: `${scope.actorName} corrected the team intent; affected runs must stop and replan.`, data: { statement: input.statement, assertionType: input.assertionType, invalidatedPlanVersion: mission.currentPlanVersion } });
      await recordLearningSignal({ missionId: mission.id, scope, type: "human_correction", label: input.assertionType, value: 1, context: { statement: input.statement } });
      response.json({ mission });
    } catch (error) { next(error); }
  });

  app.put("/api/missions/:id/outcome", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      const input = outcomeSchema.parse(request.body);
      const mission = await store.updateOutcome(request.params.id, input, scope);
      await recordCollaborationEvent({ missionId: mission.id, actor: { type: "human", id: scope.userId, name: scope.actorName }, eventType: "outcome.updated", entityType: "outcome", entityId: mission.outcome?.id, summary: `${scope.actorName} recorded the mission outcome as ${input.status}.`, data: { metric: input.metricName, target: input.targetValue, actual: input.actualValue, cost: input.cost } });
      await recordLearningSignal({ missionId: mission.id, scope, type: "outcome", label: input.status, value: input.status === "achieved" ? 1 : 0, context: { metric: input.metricName, target: input.targetValue, actual: input.actualValue } });
      response.json({ mission });
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/shares", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      await store.getMission(request.params.id, scope);
      await assertDecisionAuthority(request.params.id, scope, 2);
      if (request.body?.permission === "editor") throw Object.assign(new Error("Anonymous editor links were replaced by named, role-bound team invites."), { status: 400 });
      const permission = "viewer" as const;
      const share = await createMissionShare({ missionId: request.params.id, permission, createdBy: scope.kind === "session" ? scope.userId : undefined });
      response.status(201).json({ share });
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/reports", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      await assertDecisionAuthority(request.params.id, scope, 3);
      response.status(201).json({ report: await store.createPublicReport(request.params.id, scope) });
    } catch (error) { next(error); }
  });

  app.get("/api/missions/:id/collaboration", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true });
      const [room, agents, runs] = await Promise.all([getRoomState(request.params.id, scope), ensureMissionAgents(request.params.id, scope), listAgentRuns(request.params.id, scope)]);
      response.json({ collaboration: { ...room, agents, runs } });
    } catch (error) { next(error); }
  });

  app.get("/api/missions/:id/runtime-contract", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true });
      const mission = await store.getMission(request.params.id, scope);
      const room = await getRoomState(request.params.id, scope, 30);
      const connectors = await listConnectorDescriptors(scope);
      const contract = {
        missionId: mission.id,
        missionRevision: room.revision,
        planVersion: mission.currentPlanVersion,
        planVersionId: mission.currentPlan?.id,
        planStatus: mission.currentPlan?.status,
        blockingConflicts: mission.blockingConflicts,
        authority: room.authorityGraph,
        tasks: mission.currentPlan?.tasks.map((task) => ({ id: task.id, key: task.key, ownerType: task.ownerType, ownerName: task.ownerName, status: task.status, riskLevel: task.riskLevel, capabilities: task.requiredCapabilities, forbiddenActions: task.forbiddenActions, stopCondition: task.stopCondition, rollbackStrategy: task.rollbackStrategy })) ?? [],
        connectors: connectors.map((connector) => ({ provider: connector.provider, configured: connector.configured, verifiedConnections: connector.connections.filter((connection) => connection.status === "verified").map((connection) => ({ id: connection.id, accountLabel: connection.accountLabel, verifiedAt: connection.verifiedAt })) })),
        generatedAt: new Date().toISOString(),
      };
      response.json({ contract, contractHash: contentHash(contract) });
    } catch (error) { next(error); }
  });

  app.get("/api/missions/:id/events", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true });
      const afterSequence = Number(request.header("Last-Event-ID") || request.query.after || 0);
      response.status(200);
      response.setHeader("Content-Type", "text/event-stream");
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("Connection", "keep-alive");
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders();
      const send = (event: Awaited<ReturnType<typeof getEvents>>[number]) => {
        response.write(`id: ${event.sequence}\n`);
        response.write("event: relay\n");
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      (await getEvents(request.params.id, scope, Number.isFinite(afterSequence) ? afterSequence : 0)).forEach(send);
      const unsubscribe = await subscribeToMission(request.params.id, scope, send);
      const heartbeat = setInterval(() => response.write(`: heartbeat ${Date.now()}\n\n`), 15_000);
      request.on("close", () => { clearInterval(heartbeat); unsubscribe(); response.end(); });
    } catch (error) { next(error); }
  });

  app.put("/api/missions/:id/presence", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      const input = presenceSchema.parse(request.body);
      response.json({ presence: await heartbeatPresence(request.params.id, scope, input) });
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/comments", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true, apiCapability: "mission:comment" });
      response.status(201).json({ comment: await addComment(request.params.id, scope, commentSchema.parse(request.body)) });
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/handoffs", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true, apiCapability: "mission:handoff" });
      response.status(201).json({ handoff: await createHandoff(request.params.id, scope, handoffSchema.parse(request.body)) });
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/invites", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      response.status(201).json({ invite: await createMissionInvite(request.params.id, scope, inviteMemberSchema.parse(request.body)) });
    } catch (error) { next(error); }
  });

  app.post("/api/invites/:token/accept", async (request, response, next) => {
    try {
      const accepted = await acceptMissionInvite(request.params.token);
      setSessionCookie(response, accepted.rawToken);
      response.json({ missionId: accepted.missionId, session: { actorName: accepted.scope.actorName, workspaceId: accepted.scope.kind === "session" ? accepted.scope.workspaceId : "", identityVerified: accepted.scope.kind === "session" ? accepted.scope.identityVerified : false, expiresAt: accepted.expiresAt } });
    } catch (error) { next(error); }
  });

  app.post("/api/tasks/:id/agent-runs", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true, apiCapability: "runtime:control" });
      const input = createAgentRunSchema.parse(request.body ?? {});
      response.status(202).json({ run: await enqueueAgentRun(request.params.id, input.agentId, scope) });
    } catch (error) { next(error); }
  });

  for (const command of ["pause", "resume", "cancel"] as const) {
    app.post(`/api/agent-runs/:id/${command}`, async (request, response, next) => {
      try {
        const scope = await resolveRequestScope(request, { sessionOnly: true, write: true, apiCapability: "runtime:control" });
        response.json({ run: await controlAgentRun(request.params.id, command, scope) });
      } catch (error) { next(error); }
    });
  }

  app.post("/api/missions/:missionId/agent-runs/:runId/tool-calls", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true, apiCapability: "tool:call" });
      response.status(202).json({ toolCall: await executeToolCall(request.params.missionId, request.params.runId, request.body, scope) });
    } catch (error) { next(error); }
  });

  app.get("/api/connectors", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true });
      response.json({ connectors: await listConnectorDescriptors(scope) });
    } catch (error) { next(error); }
  });

  app.post("/api/connectors/:provider/oauth/start", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      assertWorkspaceAdmin(scope);
      response.json(await beginOAuth({ provider: request.params.provider, missionId: typeof request.body?.missionId === "string" ? request.body.missionId : undefined, redirectAfter: typeof request.body?.redirectAfter === "string" ? request.body.redirectAfter : undefined, baseUrl: requestBaseUrl(request), scope }));
    } catch (error) { next(error); }
  });

  app.get("/api/oauth/:provider/callback", async (request, response) => {
    try {
      const completed = await completeOAuth({ provider: request.params.provider, state: String(request.query.state || ""), code: typeof request.query.code === "string" ? request.query.code : undefined, error: typeof request.query.error === "string" ? request.query.error : undefined });
      const target = new URL(completed.redirectAfter, requestBaseUrl(request));
      target.searchParams.set("connector", completed.connection.provider);
      target.searchParams.set("connection", completed.connection.id);
      target.searchParams.set("status", "connected");
      response.redirect(303, `${target.pathname}${target.search}`);
    } catch (error) {
      const redirectAfter = typeof (error as { redirectAfter?: unknown })?.redirectAfter === "string"
        ? (error as { redirectAfter: string }).redirectAfter
        : "/app";
      const target = new URL(redirectAfter, requestBaseUrl(request));
      target.searchParams.set("connector_error", error instanceof Error ? error.message : "OAuth failed");
      response.redirect(303, `${target.pathname}${target.search}`);
    }
  });

  app.post("/api/connectors/:id/verify", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      const missionId = typeof request.body?.missionId === "string" ? request.body.missionId : undefined;
      if (missionId) await assertDecisionAuthority(missionId, scope, 2);
      else assertWorkspaceAdmin(scope);
      response.json({ connection: await verifyConnector(request.params.id, missionId, scope) });
    } catch (error) { next(error); }
  });

  app.delete("/api/connectors/:id", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      assertWorkspaceAdmin(scope);
      response.json({ connection: await revokeConnector(request.params.id, scope) });
    } catch (error) { next(error); }
  });

  app.use("/api", (_request, response) => response.status(404).json({ error: "API route not found." }));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const maybeError = error as { status?: number; message?: string; details?: unknown; issues?: unknown };
    const status = error instanceof NotFoundError || error instanceof ConflictError ? error.status : maybeError.status ?? (maybeError.issues ? 400 : 500);
    if (status === 500) console.error(error);
    response.status(status).json({
      error: maybeError.message || "Relay could not complete the request.",
      details: maybeError.details ?? maybeError.issues,
    });
  });

  return app;
}
