# Relay mobile clarity redesign — design QA

Date: 2026-08-01

Viewport: 390 × 844 CSS px, mobile emulation

Target: the three user-provided production screenshots in `/tmp/codex-remote-attachments/019f84c7-b32f-7ce0-b513-296d383e42ec/2C733BA5-6B2F-4656-B940-2012C40AF5DE/`

## Comparison history

### Iteration 1 — supplied production state

- Decision screen: a blocking conflict was visible, but the user could not tell what they were deciding and no primary action was visible in the first viewport.
- Mission canvas: nodes collided, key text was clipped, and the graph had no readable left-to-right path.
- Invite flow: the result was a copy-only link with no verified email delivery state and no recipient onboarding recap.

### Iteration 2 — browser-rendered implementation

- `audit/2026-08-01-mobile-clarity/compare-decision-before-after.png` — one decision at a time, plain-language scope, recommended resolution selected, fixed primary action.
- `audit/2026-08-01-mobile-clarity/compare-canvas-before-after.png` — ordered horizontal execution path, no node overlap, visible swipe/fit guidance, and intentional next-card cue.
- `audit/2026-08-01-mobile-clarity/compare-invite-before-after.png` — email-first invite, explicit recipient need, 30-second recap promise, and delivery fallback.

## Rendered evidence

All implementation screenshots are 390 × 844 px:

- `01-canvas-mobile.png`
- `02-invite-dialog-mobile.png`
- `03-join-recap-mobile.png`
- `04-arrival-recap-mobile.png`
- `05-decision-mobile.png`
- `06-approval-mobile.png`

The three combined before/after comparison images are 900 × 900 px.

## Interaction verification

- Invited teammate sees the project, success definition, one next action, named team evidence, and a fixed join action before accepting.
- Accepting the invitation creates the named teammate session and opens a short mission recap.
- The recap puts the teammate's required action before the historical detail and routes directly to their decision.
- Resolving all five conflicts creates Plan v2 and routes to the exact approval center.
- Exact approval visibly binds the action to plan version, payload, audience, budget, stop condition, expiry, and payload hash.
- Mission canvas remains readable at mobile width and exposes fit/expand controls.
- Browser console contained no errors or warnings; only Vite development and React development informational messages were present.

## Severity result

- P0: none
- P1: none
- P2: none

final result: passed
