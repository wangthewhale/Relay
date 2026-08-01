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

  it("serves a completed launch-readiness run with immutable proof and transparent coordination math", async () => {
    const response = await request(app).get("/api/demo/completed").expect(200);
    const completed = response.body.mission as MissionDetail;

    expect(response.body.proofScope).toContain("external provider writes are explicitly excluded");
    expect(completed).toMatchObject({ executionMode: "launch_readiness", status: "completed", completedTasks: 8, totalTasks: 8 });
    expect(completed.outcome).toMatchObject({ status: "achieved", teamSize: 8, baselineMeetings: 3, actualMeetings: 1, meetingMinutes: 45 });
    expect(completed.impact).toMatchObject({ sourcesReconciled: 6, agentTasksCompleted: 6, artifactsCreated: 6, humanDecisions: 1, meetingsAvoided: 2, peopleHoursAvoided: 12 });
    expect(completed.executionReceipts).toHaveLength(6);
    expect(completed.executionReceipts.every((receipt) => receipt.status === "succeeded" && receipt.artifactHash?.startsWith("sha256:"))).toBe(true);
    expect(completed.artifacts.find((artifact) => artifact.type === "launch_handoff")?.content).toMatchObject({ externalWrites: 0 });
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

  it("creates named multiplayer identities, presence, comments, handoffs and enforced decision authority", async () => {
    const decisionInvite = await owner.post(`/api/missions/${mission.id}/invites`).send({
      name: "Mina Finance", email: "mina.finance@example.com", title: "Finance lead", department: "Finance", missionRole: "decision_maker",
    }).expect(201);
    const decisionMaker = request.agent(app);
    await decisionMaker.post(`/api/invites/${decisionInvite.body.invite.token}/accept`).send({}).expect(200);

    const ownerOnlyMission = await owner.post("/api/missions").send({ ...demoMissionInput, title: "Owner-only launch" }).expect(201);
    await decisionMaker.get(`/api/missions/${ownerOnlyMission.body.mission.id}`).expect(404);
    await decisionMaker.post("/api/missions").send({ ...demoMissionInput, title: "Unauthorized mission" }).expect(403);

    let room = await decisionMaker.get(`/api/missions/${mission.id}/collaboration`).expect(200);
    const mina = room.body.collaboration.members.find((member: any) => member.user.name === "Mina Finance");
    const launchOwner = room.body.collaboration.members.find((member: any) => member.user.name === "Launch owner");
    expect(mina).toMatchObject({ role: "decision_maker", user: { department: "Finance", identityVerified: true } });
    expect(room.body.collaboration.authorityGraph).toEqual(expect.arrayContaining([expect.objectContaining({ subjectName: "Mina Finance", canApproveRisk: 3 })]));
    expect(room.body.collaboration.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Proxy · Launch owner", capabilities: expect.arrayContaining([`represent:${launchOwner.user.id}`, "join agent council"]) }),
      expect.objectContaining({ name: "Proxy · Mina Finance", capabilities: expect.arrayContaining([`represent:${mina.user.id}`, "request exact approval"]) }),
    ]));

    const council = await decisionMaker.post(`/api/missions/${mission.id}/agent-council`).send({}).expect(201);
    expect(council.body.event).toMatchObject({ eventType: "agent_council.minutes_created", actorName: "Relay Agent Council" });
    expect(council.body.minutes.representedHumans).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Mina Finance", department: "Finance" })]));
    expect(council.body.minutes.delivery).toContain("provider is verified");

    await decisionMaker.put(`/api/missions/${mission.id}/presence`).send({ connectionId: "11111111-1111-4111-8111-111111111111", state: "deciding", cursorContext: "conflicts" }).expect(200);
    await decisionMaker.post(`/api/missions/${mission.id}/comments`).send({ body: "@Launch owner I verified the budget authority.", mentions: [launchOwner.user.id] }).expect(201);
    await decisionMaker.post(`/api/missions/${mission.id}/handoffs`).send({ taskId: mission.currentPlan!.tasks[0].id, toUserId: launchOwner.user.id, reason: "Owner should confirm the source checkpoint.", checkpoint: { sourceCount: mission.sources.length } }).expect(201);
    room = await owner.get(`/api/missions/${mission.id}/collaboration`).expect(200);
    expect(room.body.collaboration.presence).toEqual(expect.arrayContaining([expect.objectContaining({ userId: mina.user.id, state: "deciding" })]));
    expect(room.body.collaboration.comments[0]).toMatchObject({ author: { name: "Mina Finance" } });
    expect(room.body.collaboration.handoffs[0].checkpoint).toMatchObject({ sourceCount: mission.sources.length });

    const contributorInvite = await owner.post(`/api/missions/${mission.id}/invites`).send({ name: "Eli Engineer", email: "eli.engineer@example.com", title: "Engineer", department: "Engineering", missionRole: "contributor" }).expect(201);
    const contributor = request.agent(app);
    await contributor.post(`/api/invites/${contributorInvite.body.invite.token}/accept`).send({}).expect(200);
    const openConflict = mission.conflicts.find((conflict) => conflict.status === "open")!;
    await contributor.post(`/api/conflicts/${openConflict.id}/resolve`).send({ optionId: "recommended", reason: "A contributor must not decide this." }).expect(403);
    await contributor.post(`/api/missions/${mission.id}/shares`).send({ permission: "viewer" }).expect(403);

    const contract = await decisionMaker.get(`/api/missions/${mission.id}/runtime-contract`).expect(200);
    expect(contract.body.contract).toMatchObject({ missionId: mission.id, planVersion: 1 });
    expect(contract.body.contractHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("reports connector configuration truthfully instead of faking connected providers", async () => {
    const response = await owner.get("/api/connectors").expect(200);
    expect(response.body.connectors).toHaveLength(5);
    expect(response.body.connectors.every((connector: any) => connector.connections.every((connection: any) => connection.status !== "verified"))).toBe(true);
    const google = response.body.connectors.find((connector: any) => connector.provider === "google");
    const start = await owner.post("/api/connectors/google/oauth/start").send({ missionId: mission.id, redirectAfter: `/missions/${mission.id}?view=access` });
    if (google.configured) {
      expect(start.status).toBe(200);
      expect(start.body.authorizeUrl).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    } else {
      expect(start.status).toBe(503);
      expect(start.body.error).toContain("not configured");
    }
  });

  it("issues a mission-scoped Runtime API key with explicit capabilities and revocation", async () => {
    const otherMission = await owner.post("/api/missions").send({ ...demoMissionInput, title: "API key must not see this" }).expect(201);
    const created = await owner.post("/api/runtime-keys").send({
      name: "Launch orchestrator",
      missionIds: [mission.id],
      capabilities: ["runtime:control", "mission:comment"],
      expiresInDays: 7,
    }).expect(201);
    const token = created.body.key.token as string;
    expect(token).toMatch(/^rly_/);

    const authorization = { Authorization: `Bearer ${token}` };
    await request(app).get(`/api/missions/${mission.id}/runtime-contract`).set(authorization).expect(200);
    await request(app).get(`/api/missions/${otherMission.body.mission.id}`).set(authorization).expect(404);
    await request(app).post(`/api/missions/${mission.id}/comments`).set(authorization).send({ body: "SDK heartbeat is attached to the current contract." }).expect(201);
    await request(app).post(`/api/missions/${mission.id}/corrections`).set(authorization).send({ statement: "This key must not change intent." }).expect(403);

    await owner.delete(`/api/runtime-keys/${created.body.key.id}`).expect(200);
    await request(app).get(`/api/missions/${mission.id}/runtime-contract`).set(authorization).expect(401);
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

  it("pauses a durable Agent at a checkpoint, resumes it and cancels it safely", async () => {
    const agentTask = mission.currentPlan!.tasks.find((task) => task.key === "T-03")!;
    const queued = await owner.post(`/api/tasks/${agentTask.id}/agent-runs`).send({}).expect(202);
    const runId = queued.body.run.id as string;
    await owner.post(`/api/agent-runs/${runId}/pause`).send({}).expect(200);

    const waitForStatus = async (statuses: string[]) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const room = await owner.get(`/api/missions/${mission.id}/collaboration`).expect(200);
        const run = room.body.collaboration.runs.find((item: any) => item.id === runId);
        if (run && statuses.includes(run.status)) return { run, room: room.body.collaboration };
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error(`Agent run ${runId} did not reach ${statuses.join(" or ")}.`);
    };

    const paused = await waitForStatus(["paused"]);
    expect(paused.run.checkpoint).toMatchObject({ pausedAt: expect.any(String) });
    await owner.post(`/api/agent-runs/${runId}/resume`).send({}).expect(200);
    await owner.post(`/api/agent-runs/${runId}/cancel`).send({}).expect(200);
    const cancelled = await waitForStatus(["cancelled"]);
    expect(cancelled.run.finishedAt).toEqual(expect.any(String));
    expect(cancelled.room.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: "agent_run.pause_requested" }),
      expect.objectContaining({ eventType: "agent_run.resume_requested" }),
      expect.objectContaining({ eventType: "agent_run.cancel_requested" }),
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
