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

  it("detects mutually exclusive financial actions without a model", () => {
    const createdAt = new Date().toISOString();
    const input = {
      title: "Resolve a payment incident",
      objective: "Resolve the customer payment incident through one verified path.",
      successMetric: "No duplicate financial action",
      createdBy: "Nina",
      sources: [
        { type: "Slack" as const, title: "Support", author: "Support lead", content: "The support team promises a full refund today.", authorityLevel: 3 },
        { type: "Email" as const, title: "Finance", author: "Finance lead", content: "The chargeback review must remain open; no refund may be issued while it is active.", authorityLevel: 5 },
      ],
    };
    const sources = input.sources.map((source) => ({ ...source, id: randomUUID(), createdAt }));
    const conflicts = detectConflicts(extractAssertions(input, sources));

    expect(conflicts.some((conflict) => conflict.type === "Policy conflict" && conflict.blocking)).toBe(true);
  });

  it("detects when a newer delivery instruction supersedes an approved scope", () => {
    const createdAt = new Date().toISOString();
    const input = {
      title: "Deliver a client launch package",
      objective: "Ship only the current client-approved deliverables.",
      successMetric: "Accepted without rework",
      createdBy: "Lee",
      sources: [
        { type: "Notion" as const, title: "Approved scope", author: "Account lead", content: "The approved package contains one landing page and three social posts.", authorityLevel: 4 },
        { type: "Email" as const, title: "Client change", author: "Client", content: "Replace the landing page with an email sequence and do not deliver social posts.", authorityLevel: 5 },
      ],
    };
    const sources = input.sources.map((source) => ({ ...source, id: randomUUID(), createdAt }));
    const conflicts = detectConflicts(extractAssertions(input, sources));

    expect(conflicts.some((conflict) => conflict.type === "Version conflict" && conflict.blocking)).toBe(true);
  });

  it("detects a source-backed resource shortfall", () => {
    const createdAt = new Date().toISOString();
    const input = {
      title: "Prepare launch creative",
      objective: "Finish the launch creative before review.",
      successMetric: "All launch assets ready",
      createdBy: "Mina",
      sources: [
        { type: "Notion" as const, title: "Launch scope", author: "Creative lead", content: "The launch needs 4 designers to finish on time.", authorityLevel: 4 },
        { type: "Slack" as const, title: "Staffing update", author: "Operations", content: "Only 2 designers are available this week.", authorityLevel: 5 },
      ],
    };
    const sources = input.sources.map((source) => ({ ...source, id: randomUUID(), createdAt }));
    const conflicts = detectConflicts(extractAssertions(input, sources));
    const resourceConflict = conflicts.find((conflict) => conflict.type === "Resource conflict");

    expect(resourceConflict).toMatchObject({ blocking: true, decisionOwner: "Operations owner" });
    expect(resourceConflict?.sourceAssertionIds).toHaveLength(2);
    expect(resourceConflict?.summary).toContain("requires 4");
    expect(resourceConflict?.summary).toContain("available capacity is 2");
  });
});
