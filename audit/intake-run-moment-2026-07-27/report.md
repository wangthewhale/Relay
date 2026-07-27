# Mission Intake Run Moment Audit

Date: 2026-07-27
Viewport: 390 × 844 mobile, 1365 × 900 desktop
Flow: Mission Intake → Run Relay → Compiler stages → Conflict Inbox

## Journey health

Before: broken activation path on mobile.

- The only submit action lived in the right-hand compiler sidebar.
- Below 900 px the sidebar moved below the 18-row brief field, so the action was outside the visible mobile flow.
- A successful submit navigated directly to a static Conflict Inbox. The real compiler work was not observable, so the product's core value looked like an ordinary form submission.

Evidence:

- 01-mobile-before.png
- 02-result-before.png

## Fix shipped

1. Added an always-visible mobile action dock with the explicit label Run Relay — 找出第一個關鍵阻擋.
2. Kept the desktop action inside the compiler sidebar and improved its label.
3. Added a truthful, staged compiler moment showing the actual evidence, intent, conflict, control and plan phases.
4. Added a live receipt using the returned Mission data: source, assertion, conflict and blocked-agent counts.
5. Added a compiled-result reveal before the Conflict Inbox, including the execution lineage and a direct path into the Human + AI Mission Room.
6. Stated explicitly that this step is read-only analysis and does not pretend external connectors ran.
7. Added aria-live, dialog semantics, 52 px mobile action sizing and reduced-motion compatibility.

## Acceptance evidence

- 06-mobile-run-contrast.png: Run Relay stays visible while the brief extends below the fold.
- 04-mobile-agent-running.png: users can observe the compiler agents and current stage.
- 05-mobile-result-reveal.png: the result explains what Relay stopped, what it produced and what to do next.
- 07-desktop-run-visible.png: desktop layout retains a clear sidebar action.

## Verification

- TypeScript check: passed
- Vitest: 12 / 12 passed
- Production build: passed
- Mobile end-to-end browser flow: passed
- Desktop responsive visual check: passed

## Remaining truth boundary

The animation visualizes Relay's real in-product compiler stages. It does not claim that Gmail, Slack, Notion or other external connectors executed; those remain governed by verified access and connector availability.
