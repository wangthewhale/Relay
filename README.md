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
- Named, role-bound single-use invites, live presence, comments, mentions and checkpoint handoffs
- Mission-scoped SSE event stream backed by monotonic PostgreSQL event sequence numbers
- Durable Agent runs with a queue, heartbeat, checkpoint, restart recovery, pause, resume and cancel
- An enforceable Authority Graph for conflict decisions, invitations and exact approvals
- Mission-scoped Access Blueprint with truthful connector states
- Real Google Workspace, Slack, Notion, GitHub and Figma OAuth adapters with provider verification
- AES-256-GCM encrypted credential vault, refresh/reconnect/revoke and plan-bound Access Manifests
- A Tool Gateway that validates plan version, task, resource scope, capability, risk and approval before every provider call
- A versioned runtime contract and TypeScript SDK for other Agent products
- PostgreSQL persistence through `DATABASE_URL`
- Hybrid intent compilation: an OpenAI semantic proposal stage followed by source validation and deterministic safety gates
- A user-visible compiler receipt with model provenance, evidence coverage, rejected candidates, confidence and zero-write verification
- Fail-closed degradation to the deterministic compiler when the model is not configured, times out, refuses, or returns an invalid schema
- Private browser sessions and workspace-level tenant isolation
- Mission-scoped, high-entropy read-only links with server-side expiration and revocation state; collaborators join through named invitations
- Built-in evidence, brief and outcome executors that must produce a hashed artifact before an agent task can complete
- Immutable execution receipts with plan-bound idempotency keys
- Sanitized public blocker cards that omit raw source content and personal evidence

The connector screens do not simulate OAuth success. A provider remains unavailable until its OAuth application and vault key are configured, and a connection becomes `verified` only after a live provider identity check plus a plan-bound Access Manifest. Tasks that require an unverified provider fail preflight with an explicit next action; they cannot be marked complete by the generic run endpoint.

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

Migrations are additive, execute once in filename order and live in [`migrations/`](./migrations). `0002_security_execution.sql` adds session and execution trust primitives. `0003_multiplayer_runtime.sql` adds identities, presence, collaboration events, authority, durable Agent runs, OAuth connections, Access Manifests, Tool Calls and learning signals.

## Verification

```bash
npm run check
npm test
npm run build
OPENAI_API_KEY=... npm run eval:compiler
NODE_ENV=production DATABASE_URL=postgresql://... npm start
```

The deterministic evaluation set contains 12 source-backed positive and negative cases across all six conflict classes. It blocks release when conflict precision/recall, blocking precision/recall, authority-owner accuracy or evidence coverage falls below the configured threshold. This is a regression benchmark, not a claim of real-world production accuracy. Model-assisted runs use the same evidence gate; set `RELAY_REQUIRE_MODEL_EVAL=true` in a credentialed evaluation environment to make model coverage and evidence thresholds blocking.

## Connector configuration

Set `RELAY_VAULT_KEY` plus the client ID and client secret for each provider you want to enable. Register `https://YOUR_DOMAIN/api/oauth/PROVIDER/callback` as its callback URL, where `PROVIDER` is `google`, `slack`, `notion`, `github` or `figma`. Providers without all required secrets remain visibly unavailable.

OAuth tokens never enter model context. They are decrypted only inside the Tool Gateway after mission, plan, capability, resource, approval and tenant checks pass.

## Embed Relay in another Agent runtime

A Workspace owner can create a short-lived, mission-scoped Runtime API key through `POST /api/runtime-keys`. The raw key is returned once. Each key names its allowed Mission IDs and only the capabilities it needs (`runtime:control`, `tool:call`, `mission:correct`, `mission:comment`, `mission:handoff`); it can be revoked with `DELETE /api/runtime-keys/:id`.

```ts
import { RelayClient } from "./sdk/relay";

const relay = new RelayClient({ baseUrl: "https://relay.example", apiKey: process.env.RELAY_RUNTIME_KEY });
const { contract, contractHash } = await relay.getRuntimeContract(missionId);
if (!contract.blockingConflicts) await relay.enqueueAgentRun(taskId);
const stop = relay.subscribe(missionId, handleEvent, handleStreamError);
```

The SDK receives a versioned runtime contract, hashes and provider receipts—never connector credentials.

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
