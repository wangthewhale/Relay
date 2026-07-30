import { randomUUID } from "node:crypto";
import { compileIntent } from "../server/intelligence";
import { missionEvalCases } from "../server/evals/missionCases";

const rows = [];
for (const fixture of missionEvalCases) {
  const createdAt = new Date().toISOString();
  const sources = fixture.input.sources.map((source) => ({ ...source, id: source.id ?? randomUUID(), createdAt }));
  const result = await compileIntent(fixture.input, sources, { allowModel: true });
  const types = new Set(result.conflicts.map((conflict) => conflict.type));
  const matched = fixture.expectedConflictTypes.some((type) => types.has(type));
  rows.push({
    id: fixture.id,
    matched,
    expected: fixture.expectedConflictTypes,
    found: [...types],
    mode: result.receipt.mode,
    model: result.receipt.modelName ?? "none",
    evidenceCoverage: result.receipt.evidenceCoverage,
    rejectedCandidates: result.receipt.rejectedCandidates,
    latencyMs: result.receipt.latencyMs,
  });
}

const matched = rows.filter((row) => row.matched).length;
const modelRuns = rows.filter((row) => row.mode === "hybrid").length;
const summary = {
  cases: rows.length,
  conflictRecall: Number((matched / rows.length).toFixed(2)),
  modelRunRate: Number((modelRuns / rows.length).toFixed(2)),
  minimumEvidenceCoverage: Math.min(...rows.map((row) => row.evidenceCoverage)),
  rows,
};

console.log(JSON.stringify(summary, null, 2));

if (process.env.RELAY_REQUIRE_MODEL_EVAL === "true" && (summary.modelRunRate < 1 || summary.conflictRecall < 0.75 || summary.minimumEvidenceCoverage < 95)) {
  process.exitCode = 1;
}
