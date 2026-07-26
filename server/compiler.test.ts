import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { compilePlan, demoMissionInput, detectConflicts, extractAssertions } from "./compiler";

function compileDemo() {
  const createdAt = new Date().toISOString();
  const sources = demoMissionInput.sources.map((source) => ({ ...source, id: randomUUID(), createdAt }));
  const assertions = extractAssertions(demoMissionInput, sources);
  const conflicts = detectConflicts(assertions);
  const plan = compilePlan({ input: demoMissionInput, sources, conflicts, version: 1 });
  return { assertions, conflicts, plan };
}

describe("Relay intent compiler", () => {
  it("turns contradictory evidence into five material conflict classes", () => {
    const { assertions, conflicts } = compileDemo();
    const types = new Set(conflicts.map((conflict) => conflict.type));

    expect(assertions.length).toBeGreaterThanOrEqual(12);
    expect(types).toEqual(new Set([
      "Version conflict",
      "Hard conflict",
      "Policy conflict",
      "Dependency conflict",
      "Authority conflict",
    ]));
    expect(conflicts.every((conflict) => conflict.blocking)).toBe(true);
    expect(conflicts.every((conflict) => conflict.options.length === 3)).toBe(true);
    expect(conflicts.every((conflict) => conflict.sourceAssertionIds.length > 0)).toBe(true);
  });

  it("compiles a governed contract instead of a plain task list", () => {
    const { plan } = compileDemo();
    const launch = plan.tasks.find((task) => task.key === "T-07");
    const approval = plan.approvals[0];

    expect(plan.status).toBe("draft");
    expect(plan.tasks).toHaveLength(8);
    expect(plan.accessBlueprint.length).toBeGreaterThanOrEqual(5);
    expect(plan.accessBlueprint.every((grant) => grant.status === "not_connected")).toBe(true);
    expect(launch).toMatchObject({ riskLevel: 3, budgetLimit: 30_000 });
    expect(launch?.rollbackStrategy).toContain("Pause");
    expect(approval.taskId).toBe(launch?.id);
    expect(approval.payloadHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(approval.exactPayload.planVersion).toBe(1);
  });

  it("uses a one-paste mission objective as dated evidence", () => {
    const createdAt = new Date().toISOString();
    const input = {
      title: "推出高雄活動",
      objective: "7 月 29 日前上線並取得 24 筆付費報名",
      successMetric: "24 筆付費報名",
      createdBy: "Jennifer",
      sources: [
        { type: "Email" as const, title: "客戶要求", author: "客戶", content: "公開發布前必須完成品牌核准", authorityLevel: 5 },
        { type: "Calendar" as const, title: "品牌審查", author: "營運", content: "品牌審查排在 7 月 30 日", authorityLevel: 4 },
      ],
    };
    const sources = input.sources.map((source) => ({ ...source, id: randomUUID(), createdAt }));
    const conflicts = detectConflicts(extractAssertions(input, sources));

    expect(conflicts.some((conflict) => conflict.type === "Hard conflict")).toBe(true);
  });
});
