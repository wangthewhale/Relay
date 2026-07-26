# Relay YC investor and first-value audit

## Scope

Combined UX and product-trust audit of the production landing page, Mission intake, execution canvas, and workspace dashboard. Evidence was captured from the live production site on 2026-07-26.

## User goal

A 5–50 person Growth, Agency, or Operations team should understand the wedge, experience the first important conflict quickly, and trust what Relay can and cannot execute today.

## Steps and health

1. `01-home.png` — Landing page: visually strong, but the target customer and current product maturity are too implicit. Health: needs work.
2. `02-intake.png` — Mission intake: credible structure, but eleven or more inputs delay the first conflict. Health: high-friction.
3. `03-execution-canvas.png` — Execution canvas: differentiated and source-backed, but static presence cues can be mistaken for real-time execution. Health: promising but trust-sensitive.
4. `04-workspace.png` — Workspace: clean operating view, but zero successful missions and demo-only data provide no customer proof. Health: functional MVP, not traction proof.

## Highest-impact findings

1. The wedge is too broad. "Human + AI teams" sounds horizontal and invites comparison with Microsoft, LangSmith, and workflow platforms. Lead with campaign and launch operations for Growth, Agency, and Ops teams.
2. The first-value path is too slow. Users must complete a structured multi-source form before seeing Relay's core value. Add a one-paste brief that compiles into structured sources automatically.
3. The demo CTA is misleading. "Watch the 90-second flow" only jumps to a static visual. Replace it with a clearly labeled interactive demo.
4. Product maturity is ambiguous. Connector cards are truthful, but "live co-work", "online", and "all actions governed" imply capabilities the MVP does not yet have. Distinguish working compiler capabilities from design-partner connector rollout.
5. There is no proof layer. The product shows architecture and features but no accepted-conflict rate, rework prevented, recurring use, customer quote, or verified outcome. Do not invent traction; show the exact compiler receipt and collect these metrics from design partners.
6. The moat is described but not demonstrated. Surface the stored chain from source to assertion, decision, plan, approval, audit event, and outcome as the data asset Relay is building.

## Accessibility risks visible from screenshots

- Several metadata labels and dashboard helpers are visually very small; raise critical explanatory text to at least 11–12px.
- Muted grey copy on the paper background may be difficult at low contrast or zoom.
- The canvas relies heavily on color and spatial position; status text is present, which helps, but keyboard traversal and screen-reader order still need direct testing.

## Evidence limits

Screenshots cannot prove keyboard completeness, screen-reader semantics, real-time collaboration, connector execution, customer demand, retention, or outcome accuracy. Those require interaction tests and real design-partner data.

## Remediation shipped in this pass

- Repositioned Relay around campaign and launch operations for 5–50 person Growth, Agency, and Operations teams.
- Replaced the default eleven-field intake with a one-paste brief while keeping structured entry as an advanced option.
- Added a real read-only `/demo` route instead of a static “watch” link; the canonical example cannot be edited from the public tour.
- Removed simulated collaborator cursors and replaced “online/live” language with truthful contract-role language.
- Added an explicit product-truth section separating the working intent compiler from design-partner connector rollout.
- Added a compiler receipt showing source, assertion, conflict, and audit-event counts; product copy now states the five conflict classes the compiler actually detects.
- Made the Source → Assertion → Conflict → Decision → Plan → Approval → Outcome chain visible as Relay's accumulating asset.
- Fixed the compiler so dates and constraints stated in the one-paste objective participate in conflict detection; Chinese `審查` is now recognized as an approval event.

## Investor objections that UI cannot honestly erase

- No real customer traction or retention proof exists in the current dataset. Relay must earn accepted-conflict rate, repeat mission use, rework prevented, and verified outcomes from design partners.
- OAuth verification, credential vaulting, Tool Gateway execution, rollback receipts, workspace identity, and tenant isolation remain rollout work. The product now labels them that way instead of simulating completion.
- The current compiler is deterministic and source-linked, not a general AI reasoning system. The next technical proof must compare compiler findings with human judgments on real missions and measure precision, recall, and accepted resolutions.
