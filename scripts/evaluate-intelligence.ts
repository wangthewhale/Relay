import { randomUUID } from "node:crypto";
import { compileIntent } from "../server/intelligence";
import { missionEvalCases } from "../server/evals/missionCases";

const rows = [];
for (const fixture of missionEvalCases) {
  const createdAt = new Date().toISOString();
  const sources = fixture.input.sources.map((source) => ({ ...source, id: source.id ?? randomUUID(), createdAt }));
  const result = await compileIntent(fixture.input, sources, { allowModel: true });
  const types = new Set(result.conflicts.map((conflict) => conflict.type));
  const blockingTypes = new Set(result.conflicts.filter((conflict) => conflict.blocking).map((conflict) => conflict.type));
  const expectedBlocking = fixture.expectedBlockingConflictTypes ?? fixture.expectedConflictTypes;
  const matchedTypes = fixture.expectedConflictTypes.filter((type) => types.has(type));
  const missingTypes = fixture.expectedConflictTypes.filter((type) => !types.has(type));
  const unexpectedTypes = [...types].filter((type) => !fixture.expectedConflictTypes.includes(type));
  const matchedBlockingTypes = expectedBlocking.filter((type) => blockingTypes.has(type));
  const unexpectedBlockingTypes = [...blockingTypes].filter((type) => !expectedBlocking.includes(type));
  const referencedAuthority = result.conflicts
    .filter((conflict) => fixture.expectedConflictTypes.includes(conflict.type))
    .flatMap((conflict) => conflict.sourceAssertionIds)
    .map((id) => result.assertions.find((assertion) => assertion.id === id)?.authorityLevel ?? 0);
  const authorityCorrect = fixture.minimumReferencedAuthority == null || Math.max(0, ...referencedAuthority) >= fixture.minimumReferencedAuthority;
  const matched = missingTypes.length === 0 && unexpectedTypes.length === 0 && matchedBlockingTypes.length === expectedBlocking.length && unexpectedBlockingTypes.length === 0 && authorityCorrect;
  rows.push({
    id: fixture.id,
    matched,
    expected: fixture.expectedConflictTypes,
    found: [...types],
    matchedTypes,
    missingTypes,
    unexpectedTypes,
    expectedBlocking,
    foundBlocking: [...blockingTypes],
    unexpectedBlockingTypes,
    authorityCorrect,
    mode: result.receipt.mode,
    model: result.receipt.modelName ?? "none",
    evidenceCoverage: result.receipt.evidenceCoverage,
    rejectedCandidates: result.receipt.rejectedCandidates,
    latencyMs: result.receipt.latencyMs,
  });
}

const matched = rows.filter((row) => row.matched).length;
const modelRuns = rows.filter((row) => row.mode === "hybrid").length;
const expectedTypes = rows.reduce((sum, row) => sum + row.expected.length, 0);
const matchedTypes = rows.reduce((sum, row) => sum + row.matchedTypes.length, 0);
const unexpectedTypes = rows.reduce((sum, row) => sum + row.unexpectedTypes.length, 0);
const expectedBlockingTypes = rows.reduce((sum, row) => sum + row.expectedBlocking.length, 0);
const matchedBlockingTypes = rows.reduce((sum, row) => sum + row.expectedBlocking.filter((type) => row.foundBlocking.includes(type)).length, 0);
const unexpectedBlockingTypes = rows.reduce((sum, row) => sum + row.unexpectedBlockingTypes.length, 0);
const summary = {
  cases: rows.length,
  caseDetectionRate: Number((matched / rows.length).toFixed(2)),
  conflictTypeRecall: expectedTypes ? Number((matchedTypes / expectedTypes).toFixed(2)) : 1,
  conflictTypePrecision: matchedTypes + unexpectedTypes ? Number((matchedTypes / (matchedTypes + unexpectedTypes)).toFixed(2)) : 1,
  blockingRecall: expectedBlockingTypes ? Number((matchedBlockingTypes / expectedBlockingTypes).toFixed(2)) : 1,
  blockingPrecision: matchedBlockingTypes + unexpectedBlockingTypes ? Number((matchedBlockingTypes / (matchedBlockingTypes + unexpectedBlockingTypes)).toFixed(2)) : 1,
  authorityReferenceAccuracy: Number((rows.filter((row) => row.authorityCorrect).length / rows.length).toFixed(2)),
  modelRunRate: Number((modelRuns / rows.length).toFixed(2)),
  minimumEvidenceCoverage: Math.min(...rows.map((row) => row.evidenceCoverage)),
  rows,
};

console.log(JSON.stringify(summary, null, 2));

if (summary.conflictTypeRecall < 0.9 || summary.conflictTypePrecision < 0.9 || summary.blockingRecall < 0.9 || summary.blockingPrecision < 0.9 || summary.authorityReferenceAccuracy < 0.9 || summary.minimumEvidenceCoverage < 95) {
  process.exitCode = 1;
}

if (process.env.RELAY_REQUIRE_MODEL_EVAL === "true" && (summary.modelRunRate < 1 || summary.conflictTypeRecall < 0.75 || summary.minimumEvidenceCoverage < 95)) {
  process.exitCode = 1;
}
