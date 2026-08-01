# Relay mobile clarity redesign — design QA

Date: 2026-08-01

Viewport: 390 × 844 CSS px, mobile emulation

## Previous clarity pass

Target: the three user-provided production screenshots in `/tmp/codex-remote-attachments/019f84c7-b32f-7ce0-b513-296d383e42ec/2C733BA5-6B2F-4656-B940-2012C40AF5DE/`

- Decision screen: changed from a blocker with no visible action to one plain-language decision with a selected recommendation and fixed primary action.
- Mission canvas: changed from colliding, clipped nodes to an ordered execution path with swipe, fit and expand guidance.
- Invite flow: changed from a copy-only link to email-first inviting, recipient context, a 30-second recap and a truthful delivery fallback.
- Invited teammates see the project, success definition, one next action and team evidence before accepting.
- Resolving all five conflicts creates Plan v2 and routes to exact approval.
- Exact approval is bound to plan version, payload, audience, budget, stop condition, expiry and payload hash.

## Lucy account and contextual reply pass

Reference: `/tmp/codex-remote-attachments/019f84c7-b32f-7ce0-b513-296d383e42ec/1748B22E-9746-4CBB-B5B8-FC0E1E2A10CB/1-照片-1.jpg`

Preview: `http://127.0.0.1:4173/missions/new?lang=en&qa=account-flow`

- The supplied screenshot and the 390 × 844 implementation were inspected side by side.
- Each Lucy turn replaces the previous quick replies with 2–3 answers for the current question.
- Quick replies stack vertically on mobile and remain fully readable without horizontal clipping.
- Lucy asks for an email immediately after learning the person's role.
- A valid email persists to the Relay session profile before onboarding continues.
- The next question uses role-aware suggestions rather than repeating the original options.
- The created Mission appears in My Relay under the saved account email.
- The mobile account card truncates long email addresses cleanly.
- A clean browser run contains no console errors or warnings.
- TypeScript, 39 automated tests and the production build pass.

## Severity result

- P0: none
- P1: none
- P2: none

final result: passed
