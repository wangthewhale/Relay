# Relay human + AI cowork replay audit

Date: 2026-07-27

Scope: public landing page and read-only demo page

Viewports checked: 390 × 844 mobile, 1920 × 848 desktop

## Outcome

The landing and demo now show a timed, controllable mission replay with three human coworkers and six AI agents. The replay demonstrates communication, conflict detection, safe pauses, accountable human decisions, exact approval, replanning, agent handoffs and a verifiable outcome.

The animation is explicitly presented as a guided replay. It does not claim that Gmail, Slack, CRM, Ads or other external providers are connected. The existing persisted, source-backed Mission Room remains available directly below the demo replay.

## Baseline findings

1. Landing hero — Needs work
   - The original hero illustration described one linear example but did not move.
   - It showed messages and one decision owner, but not a working human/AI team.
   - Users could not see who was currently reading, blocked, deciding or executing.

2. Demo first viewport — Needs work
   - The saved Mission canvas was credible and inspectable, but visually static.
   - Only one human and three agent roles were visible.
   - The user had to interpret the graph before understanding the product's magic moment.

3. Multiple real-world situations — Missing
   - The first viewport only demonstrated a launch conflict.
   - There was no immediate proof that the same control layer applies to customer escalations or hiring decisions.

4. Mobile comprehension — Needs work
   - The primary story was clear, but the collaboration proof began as a long static stack.
   - There was no compact playback control or scenario switcher.

## Implemented experience

1. Choose a mission scenario — Healthy
   - Launch, customer crisis and hiring are available from the first replay viewport.
   - Scenario selection updates the mission, team roles, conflict, dialogue and outcome.

2. Watch agents gather evidence — Healthy
   - Evidence, policy, planning and domain-specific agents move through queued, active and complete states.
   - Current work is expressed with text, icons and motion rather than color alone.

3. See Relay stop unsafe work — Healthy
   - Conflict events visually interrupt the handoff.
   - The replay explains which downstream actions were paused and why.

4. Route judgment to humans — Healthy
   - Three accountable human roles appear in every scenario.
   - Human decisions and exact approval are shown as distinct communication events.

5. Recompile and resume — Healthy
   - The activity feed shows the old plan becoming stale, the safe plan being issued and agents resuming.
   - The final outcome is visible and tied to the mission's success condition.

6. Control the animation — Healthy
   - Play, pause, replay and scenario controls are keyboard reachable and have accessible names.
   - Mobile playback controls use 44 px targets.

7. Inspect the real execution contract — Partial
   - The read-only, persisted Mission Room remains below the replay with sources, conflicts and execution gates.
   - Real external OAuth execution is still unavailable and is intentionally not simulated.

## Visual comparison

Visual evidence is retained in the local audit workspace and intentionally excluded from the source commit:

- Landing, mobile: `06-landing-mobile-comparison.jpg`
- Demo, desktop: `07-demo-desktop-comparison.jpg`
- Demo, mobile: `04-demo-after-mobile.png`

## Verification

- TypeScript: `npm run check`
- Unit/integration tests: `npm test` — 12 tests passed
- Production build: `npm run build`
- Browser console: no warnings or errors on landing or demo
- Interaction checks: scenario switch, pause, resume and replay controls
- Responsive checks: mobile and desktop screenshots
- Motion accessibility: `prefers-reduced-motion: reduce` starts the replay paused and removes CSS animation

## Accessibility limits

- The active message uses `aria-live="polite"`; repeated animation can still be verbose for some screen reader users, so the pause control remains important.
- The replay describes a saved demo state. It is not a substitute for live-agent status announcements once real agent execution is connected.
- Contrast, focus states, text labels and reduced-motion behavior were checked manually. A full assistive-technology pass with VoiceOver remains a future release gate.
