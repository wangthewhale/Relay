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

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));

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

  app.get("/api/demo", async (_request, response, next) => {
    try {
      const missionId = await store.seedDemo();
      response.json({ mission: await store.getMission(missionId), readOnly: true });
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

  app.get("/api/missions", async (_request, response, next) => {
    try {
      response.json({ missions: await store.listMissions() });
    } catch (error) { next(error); }
  });

  app.get("/api/dashboard", async (_request, response, next) => {
    try {
      const missions = await store.listMissions();
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
    try { response.json({ mission: await store.getMission(request.params.id) }); } catch (error) { next(error); }
  });

  app.post("/api/missions", async (request, response, next) => {
    try {
      const input = createMissionSchema.parse(request.body);
      const mission = await store.createMission(input);
      response.status(201).json({ mission });
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/compile", async (request, response, next) => {
    try { response.json({ mission: await store.compileMission(request.params.id) }); } catch (error) { next(error); }
  });

  app.post("/api/conflicts/:id/resolve", async (request, response, next) => {
    try {
      const input = resolveConflictSchema.parse(request.body);
      response.json({ mission: await store.resolveConflict(request.params.id, input) });
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/plan", async (request, response, next) => {
    try {
      const actor = typeof request.body?.actor === "string" ? request.body.actor : "Mission owner";
      response.json({ mission: await store.recompilePlan(request.params.id, actor) });
    } catch (error) { next(error); }
  });

  app.post("/api/approvals/:id/decide", async (request, response, next) => {
    try {
      const input = approvalDecisionSchema.parse(request.body);
      response.json({ mission: await store.decideApproval(request.params.id, input) });
    } catch (error) { next(error); }
  });

  app.post("/api/tasks/:id/run", async (request, response, next) => {
    try {
      const actor = typeof request.body?.actor === "string" ? request.body.actor : "Relay Agent";
      response.json(await store.runTask(request.params.id, actor));
    } catch (error) { next(error); }
  });

  app.post("/api/missions/:id/corrections", async (request, response, next) => {
    try {
      const input = correctionSchema.parse(request.body);
      response.json({ mission: await store.addCorrection(request.params.id, input) });
    } catch (error) { next(error); }
  });

  app.put("/api/missions/:id/outcome", async (request, response, next) => {
    try {
      const input = outcomeSchema.parse(request.body);
      response.json({ mission: await store.updateOutcome(request.params.id, input) });
    } catch (error) { next(error); }
  });

  app.use("/api", (_request, response) => response.status(404).json({ error: "API route not found." }));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const maybeError = error as { status?: number; message?: string; details?: unknown; issues?: unknown };
    const status = error instanceof NotFoundError || error instanceof ConflictError ? error.status : maybeError.issues ? 400 : 500;
    if (status === 500) console.error(error);
    response.status(status).json({
      error: maybeError.message || "Relay could not complete the request.",
      details: maybeError.details ?? maybeError.issues,
    });
  });

  return app;
}
