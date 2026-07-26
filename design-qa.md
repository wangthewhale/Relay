# Relay Execution Flow Canvas — Design QA

- Reference: `/Users/wknd/.codex/generated_images/019f84c7-b32f-7ce0-b513-296d383e42ec/exec-c0f36318-32bc-48ad-8d1e-5f30d4579226.png`
- Reference dimensions: 1487 × 1058 px, 1×
- Implementation route: `/missions/:missionId?view=room&lang=zh-TW`
- Desktop evidence: `/tmp/relay-execution-canvas-1488x1057.png`, 1488 × 1057 px, 1×
- Combined comparison: `/tmp/relay-execution-canvas-comparison.png`
- Mobile evidence: `/tmp/relay-execution-canvas-mobile-fixed.png` and `/tmp/relay-execution-canvas-mobile-inspector.png`, 390 × 844 px, 1×
- State: seeded Kaohsiung launch mission, Plan v1, five blocking conflicts, inspector open, Traditional Chinese

## Full-view comparison

The reference and implementation were reviewed together in one side-by-side image at effectively identical desktop dimensions. The implementation preserves the selected direction's five-stage causal hierarchy: intent sources → conflict/decision → accountable human → governed AI agents → verifiable outcome. It also preserves the minimal white canvas, low-contrast dot grid, colored semantic edges, live collaborator cursors, fixed correction command and evidence-led conflict inspector.

Intentional product adaptations:

- The existing seven Mission destinations remain in a compact icon rail so real product navigation is not removed.
- The inspector uses real mission assertions, decision ownership and a working conflict switcher instead of the static reference copy.
- Agent cards reflect current task status and progress from mission data; connectors continue to report truthful states elsewhere in the product.

## Focused-region review

### Top bar

- Mission identity, valid plan version, live presence, locale and refresh controls remain legible without creating a second application header.
- No clipped title or overlapping controls at desktop width.

### Canvas and nodes

- All four source assertions remain readable and connect to the selected blocking conflict.
- Human ownership is visually distinct from AI execution.
- Animated red edges are limited to assertions that participate in the selected conflict.
- Pan, zoom, fit-view and minimap controls render without obscuring the correction command.

### Conflict inspector

- Five conflicts are selectable.
- Evidence, consequence, decision owner and exact next safe action update with the selected conflict.
- Inspector can be closed and reopened without losing the selected state.

### Mobile

- At 390 × 844, the canvas remains pannable, the primary correction command remains reachable and Mission navigation is fixed to the bottom.
- The conflict inspector follows the canvas in the same scroll container and is fully reachable.
- The mobile fixed-navigation containing-block issue caused by the blurred sticky header was corrected by disabling the backdrop filter at the mobile breakpoint.

## Interaction verification

- Conflict 02 selection updates the inspector to “發布日期早於必要核准日期”.
- Inspector close and reopen controls work.
- Mission Room → Plan → Mission Room navigation works and updates the query state.
- Human correction submission enables only after valid input, POSTs successfully, clears the input and displays confirmation.
- Fresh-page browser console: 0 errors, 0 warnings.

## Iteration history

1. Initial implementation left excessive unused canvas space and rendered the execution graph too small.
2. Increased node legibility, tightened graph coordinates and tuned the desktop viewport to restore the reference hierarchy.
3. Split React Flow into a lazy-loaded chunk so the landing-page bundle remains unaffected.
4. Fixed mobile navigation positioning and enabled scrolling from canvas to inspector.
5. Memoized React Flow node types and confirmed a clean fresh-page console.

## Severity findings

- P0: none.
- P1: none remaining.
- P2: none remaining.

Final result: passed
