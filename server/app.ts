import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import {
  approvalDecisionSchema,
  correctionSchema,
  createMissionSchema,
  outcomeSchema,
  resolveConflictSchema,
} from "../shared/domain";
import { databaseHealth } from "./db";
import { compilePlan } from "./compiler";
import { compileIntent, compilerRuntimeStatus } from "./intelligence";
import { ConflictError, NotFoundError, store } from "./store";
import {
  createGuestSession,
  createMissionShare,
  enforceSameOrigin,
  resolveRequestScope,
  setSessionCookie,
  systemScope,
} from "./security";

export function createApp() {
  const app = express();
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
      response.json({ session: { actorName: scope.actorName, workspaceId: scope.kind === "session" ? scope.workspaceId : "" } });
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
      response.status(201).json({ mission });
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/compile", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { write: true });
      response.json({ mission: await store.compileMission(request.params.id, scope) });
    } catch (error) { next(error); }
  });

  app.post("/api/conflicts/:id/resolve", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { write: true });
      const input = resolveConflictSchema.parse({ ...request.body, decidedBy: scope.actorName });
      response.json({ mission: await store.resolveConflict(request.params.id, input, scope) });
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/plan", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { write: true });
      response.json({ mission: await store.recompilePlan(request.params.id, scope.actorName, scope) });
    } catch (error) { next(error); }
  });

  app.post("/api/approvals/:id/decide", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { write: true });
      const input = approvalDecisionSchema.parse({ ...request.body, decidedBy: scope.actorName });
      response.json({ mission: await store.decideApproval(request.params.id, input, scope) });
    } catch (error) { next(error); }
  });

  app.post("/api/tasks/:id/run", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { write: true });
      response.json(await store.runTask(request.params.id, "Relay verified executor", scope));
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/corrections", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { write: true });
      const input = correctionSchema.parse({ ...request.body, author: scope.actorName });
      response.json({ mission: await store.addCorrection(request.params.id, input, scope) });
    } catch (error) { next(error); }
  });

  app.put("/api/missions/:id/outcome", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { write: true });
      const input = outcomeSchema.parse(request.body);
      response.json({ mission: await store.updateOutcome(request.params.id, input, scope) });
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/shares", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { sessionOnly: true, write: true });
      await store.getMission(request.params.id, scope);
      const permission = request.body?.permission === "viewer" ? "viewer" : "editor";
      const share = await createMissionShare({ missionId: request.params.id, permission, createdBy: scope.kind === "session" ? scope.userId : undefined });
      response.status(201).json({ share });
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/reports", async (request, response, next) => {
    try {
      const scope = await resolveRequestScope(request, { write: true });
      response.status(201).json({ report: await store.createPublicReport(request.params.id, scope) });
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
