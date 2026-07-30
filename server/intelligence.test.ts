import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CreateMissionInput } from "../shared/domain";
import { compileIntent } from "./intelligence";

function storedInput(): { input: CreateMissionInput; sources: Array<CreateMissionInput["sources"][number] & { id: string; createdAt: string }> } {
  const input: CreateMissionInput = {
    title: "Approve the launch homepage claim",
    objective: "Publish one legally approved homepage message for the product launch.",
    successMetric: "One approved homepage with zero legal corrections",
    createdBy: "Nina",
    sources: [
      { type: "Slack", title: "Growth launch copy", author: "Growth lead", content: "The launch homepage must call the product free forever.", authorityLevel: 3 },
      { type: "Email", title: "Legal review", author: "Legal lead", content: "Legal prohibits the phrase free forever unless there is no paid tier.", authorityLevel: 5 },
    ],
  };
  const createdAt = new Date().toISOString();
  return { input, sources: input.sources.map((source) => ({ ...source, id: randomUUID(), createdAt })) };
}

describe("Relay hybrid intelligence compiler", () => {
  it("returns an explicit policy-only receipt when no model credential is available", async () => {
    const { input, sources } = storedInput();
    const result = await compileIntent(input, sources, { allowModel: false });

    expect(result.receipt).toMatchObject({
      mode: "policy_only",
      modelUsed: false,
      engineVersion: "relay-safety-v2",
      sourceCount: 2,
      evidenceCoverage: 100,
    });
    expect(result.receipt.checks.find((check) => check.id === "semantic_model")?.status).toBe("fallback");
    expect(result.receipt.checks.find((check) => check.id === "execution_boundary")?.detail).toContain("zero external writes");
  });

  it("accepts only evidence-backed semantic candidates before the policy gate", async () => {
    const { input, sources } = storedInput();
    let requestBody: Record<string, any> | undefined;
    const modelOutput = {
      assertions: [
        {
          sourceKey: sources[0].id,
          statement: "Growth requires the homepage to use the claim free forever.",
          type: "Constraint",
          evidenceQuote: "must call the product free forever",
          confidence: 0.96,
          subject: "homepage_claim",
          value: "free forever",
          polarity: "requires",
          hardConstraint: true,
        },
        {
          sourceKey: sources[1].id,
          statement: "Legal forbids the phrase free forever while a paid tier exists.",
          type: "Policy",
          evidenceQuote: "prohibits the phrase free forever unless there is no paid tier",
          confidence: 0.98,
          subject: "homepage_claim",
          value: "free forever forbidden with paid tier",
          polarity: "forbids",
          hardConstraint: true,
        },
        {
          sourceKey: sources[0].id,
          statement: "The customer requested a lifetime discount.",
          type: "Preference",
          evidenceQuote: "requested a lifetime discount",
          confidence: 0.91,
          subject: "discount",
          value: "requested",
          polarity: "states",
          hardConstraint: false,
        },
      ],
      conflicts: [{
        type: "Policy conflict",
        title: "The launch claim conflicts with Legal policy",
        summary: "Growth requires a claim that Legal explicitly forbids while the product has a paid tier.",
        severity: "high",
        blocking: true,
        evidence: [
          { sourceKey: sources[0].id, evidenceQuote: "must call the product free forever" },
          { sourceKey: sources[1].id, evidenceQuote: "prohibits the phrase free forever unless there is no paid tier" },
        ],
        decisionOwner: "Legal lead",
        consequences: "Publishing the unsupported claim can mislead customers and trigger legal rework.",
        recommendedResolution: "Replace the claim with wording approved by Legal before launch.",
        alternativeA: "Remove the paid tier before using the claim.",
        alternativeB: "Keep the homepage in draft until Legal grants an exact exception.",
        confidence: 0.95,
      }, {
        type: "Policy conflict",
        title: "Invented evidence must not survive",
        summary: "This candidate points at real sources but relies on a quote that does not exist.",
        severity: "high",
        blocking: true,
        evidence: [
          { sourceKey: sources[0].id, evidenceQuote: "must call the product free forever" },
          { sourceKey: sources[1].id, evidenceQuote: "the CFO secretly approved store credit" },
        ],
        decisionOwner: "Finance lead",
        consequences: "An unsupported claim could stop valid work.",
        recommendedResolution: "Reject this candidate at the evidence gate.",
        alternativeA: "Ask a human for a new source.",
        alternativeB: "Keep the mission in read-only mode.",
        confidence: 0.99,
      }],
      ambiguities: [],
    };
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        model: "gpt-5.6-sol-2026-07-01",
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(modelOutput) }] }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const result = await compileIntent(input, sources, { allowModel: true, apiKey: "test-key", fetchImpl });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(requestBody).toMatchObject({ store: false, model: "gpt-5.6-sol", text: { format: { type: "json_schema", strict: true } } });
    expect(result.receipt).toMatchObject({ mode: "hybrid", modelUsed: true, semanticAssertionsAccepted: 2, semanticConflictsAccepted: 1, rejectedCandidates: 2, evidenceCoverage: 100 });
    expect(result.conflicts.some((conflict) => conflict.title.includes("launch claim") && conflict.blocking)).toBe(true);
    expect(result.conflicts.some((conflict) => conflict.title.includes("Invented evidence"))).toBe(false);
    expect(result.assertions.filter((assertion) => assertion.metadata.origin === "semantic_model")).toHaveLength(2);
  });

  it("fails closed to deterministic rules when the semantic provider is unavailable", async () => {
    const { input, sources } = storedInput();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response("unavailable", { status: 503 })) as typeof fetch;

    const result = await compileIntent(input, sources, { allowModel: true, apiKey: "test-key", fetchImpl });

    expect(result.receipt.mode).toBe("policy_only");
    expect(result.receipt.modelUsed).toBe(false);
    expect(result.receipt.warnings[0]).toContain("deterministic safety rules");
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("fell back safely"));
    warning.mockRestore();
  });
});
