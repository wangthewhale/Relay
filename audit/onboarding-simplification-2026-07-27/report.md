# Relay first-minute UX audit and simplification

Date: 2026-07-27
Scope: landing page → mission intake → AI analysis → result → teammate invitation
Target: first-time users on a 390 × 844 mobile viewport, with desktop reflow checked at 1365 × 900

## Overall verdict

The original flow exposed Relay's internal architecture before it explained the user's job. The first minute mixed `Mission`, `Brief`, five unnamed Agent types, compiler vocabulary, seven navigation icons, and a hidden link-copy action. A new user could not form a stable answer to four basic questions: what do I do first, what happens second, what is an Agent, and how do I invite a teammate.

The revised flow uses one repeated mental model everywhere:

1. You paste what everyone said.
2. Three Relay AI software roles organize it, find conflicts, and pause risk.
3. You invite the responsible teammates to decide from the same saved mission.

## Step 1 — Understand what Relay is for

Health before: **At risk**
Health after: **Healthy**

Before:

![Landing before](01-home-before.png)

After:

![Landing after](06-home-after.png)

- The original headline described the problem, but did not show the user's next three actions.
- The revised hero leads with the concrete input and repeats a visible three-step journey.
- `AI Agent` is now defined above the fold as a software role with one named job, not a person or autonomous employee.
- The primary CTA now says `第一步：貼上任務`.

## Step 2 — Paste a real task

Health before: **Poor**
Health after: **Healthy**

Before:

![Intake before](02-intake-before.png)

After:

![Intake after](07-intake-after.png)

- The old form presented Mission Intake, Brief, modes, instructions, evidence promises, and compiler output at once.
- The simple path now has one textarea, one example button, and one `開始分析` action.
- Structured source entry remains available under an explicitly labeled advanced control.
- Mobile keeps the primary action visible without repeating the technical output checklist.

## Step 3 — See the AI team work

Health before: **At risk**
Health after: **Healthy**

Before:

![Agent run before](03-agent-run-before.png)

After:

![Agent run after](08-agent-run-after.png)

- Five abstract Agents created more questions than clarity.
- The live run now shows three software roles with one job each: `資料整理 AI`, `矛盾檢查 AI`, and `安全協調 AI`.
- Every card explains what the role is doing now, with waiting, running, and completed states.
- The UI continues to state that external tools were not executed.

## Step 4 — Understand the result and next action

Health before: **At risk**
Health after: **Healthy**

Before:

![Result before](04-result-before.png)

After:

![Result after](09-result-after.png)

- The old receipt prioritized compiler counts and sent the user into a general control room.
- The revised result says what matters first: five places need a human decision and risky work is paused.
- The three AI roles remain visible with their exact output.
- The next action is explicit: invite the people who should decide.
- Mobile navigation now shows plain-language labels instead of icon-only destinations.

## Step 5 — Invite teammates

Health before: **Missing / undiscoverable**
Health after: **Healthy for the public MVP**

Before:

![Mission room before](05-room-before.png)

After:

![Invite teammates after](10-invite-after.png)

- The previous mobile header hid `複製控制室連結` behind an unlabeled icon.
- `邀請同事` is now a visible header action and the primary third step after analysis.
- The invite sheet explains the complete ceremony: copy the link, send it in Slack or email, and work from the same saved state.
- The current public-link access model and confidentiality warning are stated honestly.

## Desktop check

Health: **Healthy**

![Desktop intake after](11-intake-desktop-after.png)

- The same three-step model and three Agent roles reflow without adding a second mental model.
- The simple path remains primary; advanced source entry remains secondary.

## Accessibility and evidence limits

- Dialogs expose `role=dialog`, `aria-modal`, and named headings.
- The three-step journey uses an ordered list and the primary actions use explicit labels.
- Mobile targets remain at least 39–52px for the key actions inspected.
- Reduced-motion support remains in the existing stylesheet.
- Screenshots do not prove complete screen-reader or keyboard compatibility. Full assistive-technology testing remains outside this visual audit.
