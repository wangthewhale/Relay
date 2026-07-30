import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import type { MissionDetail } from "../shared/domain";
import { demoMissionInput } from "./compiler";
import { createApp } from "./app";

const app = createApp();
const owner = request.agent(app);
let mission: MissionDetail;

describe("Relay mission lifecycle API", () => {
  beforeAll(async () => {
    await owner.post("/api/session/guest").send({ name: "Launch owner", workspaceName: "Launch room" }).expect(201);
    const created = await owner.post("/api/missions").send({ ...demoMissionInput, createdBy: "Spoofed creator" }).expect(201);
    const compiled = await owner.post(`/api/missions/${created.body.mission.id}/compile`).send({}).expect(200);
    mission = compiled.body.mission;
  });

  it("keeps health and the sanitized demo public while protecting workspace data", async () => {
    const health = await request(app).get("/api/health").expect(200);
    await request(app).get("/api/dashboard").expect(401);
    const dashboard = await owner.get("/api/dashboard").expect(200);
    const demo = await request(app).get("/api/demo").expect(200);

    expect(health.body).toMatchObject({ ok: true, service: "relay" });
    expect(health.body.database.mode).toBe("memory");
    expect(dashboard.body.missions).toHaveLength(1);
    expect(demo.body).toMatchObject({ readOnly: true, mission: { title: demoMissionInput.title } });
    expect(mission.createdBy).toBe("Launch owner");
  });

  it("runs the landing compiler without creating a workspace session or saving text", async () => {
    const response = await request(app)
      .post("/api/preview-compile")
      .send(demoMissionInput)
      .expect(200);

    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.body.saved).toBe(false);
    expect(response.body.receipt.sources).toBe(7);
    expect(response.body.receipt.blocking).toBeGreaterThanOrEqual(3);
    expect(response.body.conflict.type).toBe("Hard conflict");
    expect(response.body.evidence).toHaveLength(2);
  });

  it("isolates workspaces and rejects cross-origin mutations", async () => {
    const outsider = request.agent(app);
    await outsider.post("/api/session/guest").send({ name: "Other owner" }).expect(201);
    await outsider.get(`/api/missions/${mission.id}`).expect(404);
    const dashboard = await outsider.get("/api/dashboard").expect(200);
    expect(dashboard.body.missions).toHaveLength(0);

    await owner
      .post(`/api/missions/${mission.id}/plan`)
      .set("Origin", "https://attacker.example")
      .send({})
      .expect(403);
  });

  it("creates a mission-scoped, expiring viewer link", async () => {
    const created = await owner.post(`/api/missions/${mission.id}/shares`).send({ permission: "viewer" }).expect(201);
    const token = created.body.share.token as string;
    expect(token.length).toBeGreaterThan(32);

    const shared = await request(app).get(`/api/missions/${mission.id}`).set("X-Relay-Share-Token", token).expect(200);
    expect(shared.body.access).toBe("viewer");
    await request(app).get("/api/dashboard").set("X-Relay-Share-Token", token).expect(401);
    await request(app)
      .post(`/api/missions/${mission.id}/corrections`)
      .set("X-Relay-Share-Token", token)
      .send({ statement: "This viewer must not be able to write.", assertionType: "Constraint", author: "Spoofed" })
      .expect(403);
  });

  it("backs agent completion with an artifact and idempotent execution receipt", async () => {
    const evidenceTask = mission.currentPlan!.tasks.find((task) => task.key === "T-01")!;
    expect(evidenceTask.status).toBe("completed");
    expect(mission.artifacts).toHaveLength(1);
    expect(mission.executionReceipts).toHaveLength(1);
    expect(mission.executionReceipts[0]).toMatchObject({ taskKey: "T-01", status: "succeeded" });
    expect(mission.executionReceipts[0].artifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const rerun = await owner.post(`/api/tasks/${evidenceTask.id}/run`).send({ actor: "Spoofed executor" }).expect(200);
    expect(rerun.body.receipt.id).toBe(mission.executionReceipts[0].id);
    expect(rerun.body.mission.artifacts).toHaveLength(1);
  });

  it("records human decisions, activates one new version and refuses fake provider completion", async () => {
    for (const conflict of mission.conflicts.filter((item) => item.status === "open")) {
      const response = await owner
        .post(`/api/conflicts/${conflict.id}/resolve`)
        .send({ optionId: "recommended", reason: "Accept the safest evidence-backed resolution.", decidedBy: "Spoofed approver" })
        .expect(200);
      mission = response.body.mission;
    }

    expect(mission.blockingConflicts).toBe(0);
    const planned = await owner.post(`/api/missions/${mission.id}/plan`).send({ actor: "Spoofed actor" }).expect(200);
    mission = planned.body.mission;
    expect(mission.currentPlanVersion).toBe(2);
    expect(mission.planVersions.find((plan) => plan.version === 1)?.status).toBe("superseded");
    expect(mission.executionReceipts.some((receipt) => receipt.taskKey === "T-01" && receipt.planVersion === 2 && receipt.status === "succeeded")).toBe(true);

    const providerTask = mission.currentPlan!.tasks.find((task) => task.key === "T-05")!;
    const blocked = await owner.post(`/api/tasks/${providerTask.id}/run`).send({}).expect(200);
    expect(blocked.body.receipt.status).toBe("blocked");
    expect(blocked.body.receipt.artifactId).toBeUndefined();
    expect(blocked.body.preflight.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Verified executor", passed: false }),
    ]));
  });

  it("publishes a sanitized, expiring proof card and then invalidates the plan on correction", async () => {
    const created = await owner.post(`/api/missions/${mission.id}/reports`).send({}).expect(201);
    const report = await request(app).get(`/api/public/reports/${created.body.report.slug}`).expect(200);
    const serialized = JSON.stringify(report.body);
    expect(report.body.report.executionProof.artifactHash).toMatch(/^sha256:/);
    expect(serialized).not.toContain("Current audience includes existing members");
    expect(serialized).not.toContain("CRM system");

    const correction = await owner
      .post(`/api/missions/${mission.id}/corrections`)
      .send({ statement: "Paid media is paused until the client confirms the revised creative.", assertionType: "Constraint", author: "Spoofed" })
      .expect(200);
    mission = correction.body.mission;
    expect(mission.status).toBe("conflicts");
    expect(mission.currentPlan?.status).toBe("superseded");
    expect(mission.currentPlan?.approvals.every((approval) => approval.status === "invalidated")).toBe(true);
    expect(mission.auditEvents[0].actorName).toBe("Launch owner");
  });
});
