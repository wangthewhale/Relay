import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import type { MissionDetail } from "../shared/domain";
import { createApp } from "./app";
import { store } from "./store";

const app = createApp();

describe("Relay mission lifecycle API", () => {
  let mission: MissionDetail;

  beforeAll(async () => {
    const id = await store.seedDemo();
    mission = await store.getMission(id);
  });

  it("reports a real runtime mode and a source-backed demo mission", async () => {
    const health = await request(app).get("/api/health").expect(200);
    const dashboard = await request(app).get("/api/dashboard").expect(200);

    expect(health.body).toMatchObject({ ok: true, service: "relay" });
    expect(health.body.database.mode).toBe("memory");
    expect(dashboard.body.metrics.blocked).toBeGreaterThanOrEqual(1);
    expect(mission.sources).toHaveLength(7);
    expect(mission.currentPlan?.status).toBe("draft");
  });

  it("records decisions, activates a new version and invalidates it on correction", async () => {
    for (const conflict of mission.conflicts.filter((item) => item.status === "open")) {
      const response = await request(app)
        .post(`/api/conflicts/${conflict.id}/resolve`)
        .send({ optionId: "recommended", reason: "Accept the safest evidence-backed resolution.", decidedBy: "Jennifer" })
        .expect(200);
      mission = response.body.mission;
    }

    expect(mission.blockingConflicts).toBe(0);
    expect(mission.status).toBe("planning");

    const planned = await request(app)
      .post(`/api/missions/${mission.id}/plan`)
      .send({ actor: "Jennifer" })
      .expect(200);
    mission = planned.body.mission;

    expect(mission.currentPlanVersion).toBe(2);
    expect(mission.currentPlan?.status).toBe("active");
    expect(mission.planVersions.find((plan) => plan.version === 1)?.status).toBe("superseded");

    const correction = await request(app)
      .post(`/api/missions/${mission.id}/corrections`)
      .send({ statement: "Paid media is paused until the client confirms the revised creative.", assertionType: "Constraint", author: "Jennifer" })
      .expect(200);
    mission = correction.body.mission;

    expect(mission.status).toBe("conflicts");
    expect(mission.currentPlan?.status).toBe("superseded");
    expect(mission.currentPlan?.approvals.every((approval) => approval.status === "invalidated")).toBe(true);
    expect(mission.auditEvents[0].eventType).toBe("assertion.corrected");
  });

  it("returns a precise next action when preflight blocks execution", async () => {
    const task = mission.currentPlan!.tasks.find((item) => item.key === "T-07")!;
    const response = await request(app)
      .post(`/api/tasks/${task.id}/run`)
      .send({ actor: "Launch Agent" })
      .expect(200);

    expect(response.body.preflight.canRun).toBe(false);
    expect(response.body.preflight.checks.some((check: { passed: boolean; nextAction?: string }) => !check.passed && check.nextAction)).toBe(true);
  });
});
