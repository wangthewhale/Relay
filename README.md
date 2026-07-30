# Relay

**Git for organizational intent — and the control plane that lets AI agents execute it safely.**

Relay turns conflicting goals, constraints and instructions into a versioned, permissioned and auditable execution contract, then coordinates humans and AI agents to deliver the outcome.

## MVP vertical slice

- Mission intake with source lineage and authority levels
- Intent assertion extraction
- Hard, resource, authority, policy, version and dependency conflict detection
- Guided conflict resolution with impact alternatives
- Immutable plan versions and diffs
- Human and agent task ownership
- Capability, risk, stop, retry and rollback policies
- Exact, payload-hashed approvals bound to one plan version
- Preflight execution checks with precise blockers and next actions
- Mission Room, corrections, audit ledger and outcome tracking
- Mission-scoped Access Blueprint with truthful connector states
- PostgreSQL persistence through `DATABASE_URL`
- Hybrid intent compilation: an OpenAI semantic proposal stage followed by source validation and deterministic safety gates
- A user-visible compiler receipt with model provenance, evidence coverage, rejected candidates, confidence and zero-write verification
- Fail-closed degradation to the deterministic compiler when the model is not configured, times out, refuses, or returns an invalid schema
- Private browser sessions and workspace-level tenant isolation
- Mission-scoped, high-entropy viewer/editor links with server-side expiration and revocation state
- Built-in evidence, brief and outcome executors that must produce a hashed artifact before an agent task can complete
- Immutable execution receipts with plan-bound idempotency keys
- Sanitized public blocker cards that omit raw source content and personal evidence

The connector screens do not simulate OAuth success. Providers remain `not_connected` until a real authorization, resource-scope verification and Access Manifest flow exists. Tasks that require those providers fail preflight with an explicit next action; they cannot be marked complete by the generic run endpoint.

The model never receives connector credentials and never decides whether an action is authorized. Model output is a proposal. Relay code rejects candidates without exact source evidence and computes blocking, approval and execution boundaries after the model returns.

## Local development

```bash
npm install
npm run dev
```

Without `DATABASE_URL`, development uses an isolated in-memory store. The public demo creates one system-owned conflict-rich mission on demand and never appears inside a visitor's private dashboard. Production refuses to boot without PostgreSQL.

## Database

```bash
export DATABASE_URL=postgresql://...
npm run db:migrate
npm run db:seed
```

Migrations are idempotent, execute in filename order and live in [`migrations/`](./migrations). `0002_security_execution.sql` adds sessions, mission shares, artifacts, execution receipts and sanitized public reports.

## Verification

```bash
npm run check
npm test
npm run build
OPENAI_API_KEY=... npm run eval:compiler
NODE_ENV=production DATABASE_URL=postgresql://... npm start
```

The deterministic evaluation set contains source-backed cases for all six conflict classes. Model-assisted runs use the same evidence gate; set `RELAY_REQUIRE_MODEL_EVAL=true` in a credentialed evaluation environment to make model coverage and evidence thresholds blocking.

## Deployment workflow

1. Develop and verify locally.
2. Commit and push the reviewed revision to GitHub.
3. Pull that exact revision into Replit.
4. Provision Replit PostgreSQL (`DATABASE_URL`).
5. Run migrations and seed.
6. Publish and verify `/api/health`, persistence and commit parity.

Replit is the runtime and database host. GitHub remains the source of truth; do not use Replit Agent or its conversation panel for product development.

## Launch assets

The Product Hunt positioning, truthful claim boundary, gallery sequence, 90-second demo script and launch checklist live in [`launch/product-hunt-2026.md`](./launch/product-hunt-2026.md). The investor narrative, technical proof boundary and explicit open hypotheses live in [`launch/yc-investor-brief.md`](./launch/yc-investor-brief.md).
