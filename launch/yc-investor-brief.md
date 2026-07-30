# Relay YC investor brief

## The company in one sentence

Relay turns contradictory launch instructions into a versioned, permissioned execution contract, then stops humans and AI agents from acting on a stale or unauthorized version.

## The narrow starting wedge

Relay starts with cross-functional campaign and product-launch operations in 5–50 person Growth, Agency and Operations teams.

This work has all of the conditions that make organizational intent expensive:

- deadlines, budgets, audiences and approvals live in different tools;
- both humans and software agents act on the brief;
- one stale instruction can contact customers, spend money or publish externally;
- the same launch pattern repeats often enough to create a retained Mission workflow.

Relay should not present itself as a general company operating system before it wins this wedge.

## The 60-second proof

1. Paste a launch brief containing two or more source-labelled instructions.
2. Relay shows the exact evidence lines that cannot both be true.
3. Relay identifies the affected actions and the accountable decision owner.
4. Resolve the conflict and compile a new plan version.
5. Run the evidence task and inspect its artifact hash and execution receipt.
6. Invite a named teammate, watch presence and comments arrive on the Mission event stream, and hand off a task with its checkpoint.
7. Pause, resume or cancel the durable Agent run without losing the checkpoint.
8. Attempt an unverified external task and see it stop with one explicit next action—or connect a configured provider and create a draft through the Tool Gateway.

The demo proves a technical invariant, not a traction claim: no verified executor and artifact means no completed Agent task.

## What is technically different

Agent frameworks orchestrate an already-defined workflow. Relay operates before and around that workflow:

- an Intent Graph represents source, authority, scope and version;
- an Authority Graph determines which named human may resolve, invite or approve at each risk level;
- the Conflict Compiler detects six conflict classes while retaining evidence lineage;
- every Mission is isolated to one Workspace or one expiring share grant;
- preflight binds execution to the current Plan Version, dependencies, capability grants and exact approvals;
- deterministic idempotency keys prevent the same successful task from creating duplicate completion records;
- successful Agent completion requires a hashed Artifact and Execution Receipt;
- every human, Agent and provider transition is a persisted, ordered Mission event delivered through SSE;
- Agent runs survive request boundaries and expose heartbeat, checkpoint, pause, resume, cancel and stale-plan invalidation;
- OAuth credentials stay encrypted outside model context and provider calls cross one plan-bound Capability Gateway;
- a correction invalidates the stale plan and approvals instead of remaining an ignored chat message.

## Why the insight is founder-led

The founding insight comes from coordinating real operations across events, city partners, creators, members, support, product, marketing and advertising. The recurring failure was not a missing model. It was different people and tools acting on different versions of what the team meant.

This is the founder story Relay can truthfully tell now. It should not invent customer adoption, saved hours or prevented losses before those measurements exist.

## The compounding asset

Relay accumulates a structured chain:

`Source → Assertion → Conflict → Decision → Plan → Approval → Artifact → Receipt → Outcome`

Over time that graph can learn which sources are authoritative in a given scope, which conflicts recur, which decisions create rework and which execution policy produces the intended outcome. Connector count is distribution; the intent-to-outcome lineage is the defensible dataset.

## What is proven today

- The compiler and deterministic fallback preserve source lineage.
- The evaluation suite covers all six conflict classes.
- Cross-workspace mission access is denied.
- Viewer links cannot mutate a Mission; share grants are Mission-specific and expiring.
- Named invitations create role-bound Mission members; contributors cannot exercise decision authority.
- Presence, comments, mentions, checkpoint handoffs and Agent state changes share one persisted event lineage.
- Durable Agent runs can pause, resume, cancel and stop automatically when their Plan Version becomes stale.
- A built-in Agent task cannot complete without a generated artifact and SHA-256 receipt.
- A task with no verified provider executor stops before side effects.
- Google Workspace, Slack, Notion, GitHub and Figma have real OAuth, verification and encrypted-vault adapters; an unconfigured deployment never reports them as connected.
- Public blocker cards omit raw source evidence.

## What remains a hypothesis

- Teams will repeatedly entrust the same category of launch Mission to Relay.
- Accepted conflict detections will prevent enough rework to justify a paid plan.
- The launch wedge will expand naturally into onboarding, customer success, procurement and other high-impact processes.
- Provider execution reliability under production-scale token expiry, rate limits and rollback conditions remains to be measured.

These belong in design-partner experiments, not in launch-day claims.

## The next technical milestone

Run the launch wedge repeatedly with design partners and turn runtime lineage into a measured benchmark:

1. connector success, refresh, rate-limit and revocation reliability;
2. conflict precision and false-positive rate on real launch missions;
3. authority-owner accuracy after human corrections;
4. prevented stale-plan and unauthorized-action counts;
5. mission outcome, rework and rollback rates;
6. policy regression fixtures contributed by every corrected production incident.
