# Relay Landing Clarity Audit — 2026-07-27

Target states: Traditional Chinese landing page at 390 × 844 and 1440 × 900 CSS-pixel viewports. This pass tested whether a first-time visitor can understand Relay's user, pain, mechanism, and first use case without already knowing Agent infrastructure terminology.

## 1. Hero: say the problem before the category

- Before: the hero led with “執行控制層” and “安全版本.” These phrases were accurate but still required visitors to understand Relay before they could understand the promise.
- Change: the headline now starts with the failure users already recognize: “AI 不笨。它只是收到團隊互相打架的指令。” The supporting copy names Slack, Email, documents, and calendars; says Relay finds mutually impossible instructions; identifies who should decide; and pauses affected Agents.
- Audience: explicitly names 5–50 person teams already using AI for email, launches, CRM updates, or client delivery.
- Verdict: **Healthy.** The pain, audience, outcome, and primary action are visible in the first mobile viewport.
- Evidence: `04-home-mobile-after.png`, `03-home-desktop-after.png`, `12-mobile-comparison.png`, `13-desktop-comparison.png`.

## 2. Five-year-old explanation: one Mission as a visual story

- Before: the right-side compiler UI contained real product concepts, but a new visitor had to decode counters, system labels, and plan state.
- Change: one visual story now shows three notes: Slack says launch on July 29, Email says brand approval must happen first, and Calendar says approval is July 30. Relay circles the collision, pauses Email, Ads, and CRM Agents, asks Jennifer to decide, then creates safe Plan v2.
- Plain-language model: many notes → one collision → unsafe work stops → the right human decides → everyone receives one current plan.
- Verdict: **Healthy.** The product mechanism is understandable without reading technical vocabulary.
- Evidence: `05-mobile-story-after.png`, `12-mobile-comparison.png`, `13-desktop-comparison.png`.

## 3. Real Magic Moment: show, do not merely claim

- The landing page keeps the real, editable compiler demo below the visual explanation.
- Input: a mixed-source launch brief. Output: source-backed assertions, blocking conflicts, paused Agent tasks, scoped permission needs, and a recommended safe next action.
- Copy now distinguishes the simple illustration from the live preview and states that preview text is not saved.
- Verdict: **Healthy.** Visitors first understand the concept, then can verify it with a real compiler interaction.
- Evidence: `06-mobile-magic-after.png`.

## 4. User pains mapped to the technical system

- “Everyone tells AI something different” maps to Intent Graph and Conflict Compiler.
- “The Agent is still using yesterday's plan” maps to Versioned Execution Contract.
- “A broad approval is reused after the payload changes” maps to Exact Approval and Payload Hash.
- “A connected tool is mistaken for permission to act” maps to Capability Gate and Preflight Check.
- A separate six-step teacher-and-notes analogy explains source collection, conflict detection, authority routing, version locking, preflight checks, and audit receipts.
- Verdict: **Healthy.** Technical differentiation is concrete without making infrastructure vocabulary the price of admission.
- Evidence: `08-mobile-pain-card-after.png`, `09-mobile-tech-after.png`.

## 5. Concrete use cases and truthful product boundary

- Use cases now show when to use Relay: cross-functional campaign or product launch, agency client delivery, and multi-location operations.
- Each card names the exact questions Relay checks and the Execution Contract it produces.
- The best first Mission is labeled explicitly so the visitor does not have to invent a workflow.
- Product-state copy remains truthful: pasted-source compilation, conflict resolution, versioning, approval, audit, and outcome flows are usable now; production OAuth execution for external providers is still rolling out and is not presented as connected.
- Verdict: **Healthy.** The landing page gives visitors a realistic first job and preserves the no-fake-connector trust boundary.
- Evidence: `11-mobile-use-cases-after.png`.

## 6. Responsive, interaction, and accessibility limits

- Verified at 390 × 844 and 1440 × 900 with no horizontal dependency in the primary story.
- Mobile keeps the full audience sentence, one dominant CTA, vertically ordered source cards, and readable problem-to-resolution sequencing.
- Existing semantic headings, buttons, link targets, language switch, and reduced-motion behavior are preserved.
- Full screen-reader certification, automated contrast measurement, full keyboard-only traversal, and a physical-device/browser matrix were not completed in this pass. This audit covers visual hierarchy, DOM-visible labels, responsive layout, and core landing interactions.
- Verdict: **Good for this release; formal WCAG and device-matrix coverage remains a separate QA track.**
