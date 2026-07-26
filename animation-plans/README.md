# Searchify Proof animation plans

| Plan | Title | Severity | Status |
|---|---|---:|---|
| 001 | Tighten CTA feedback | MEDIUM | DONE |
| 002 | Fix desktop navigation motion | HIGH | DONE |
| 003 | Bridge mobile navigation state | MEDIUM | DONE |
| 004 | Repair desktop dropdown stability | HIGH | DONE |

Recommended execution order: **001 → 002 → 003**. Plans 001 and 002 are independent. Plan 003 depends on the JavaScript `EASE_OUT` constant introduced by plan 002 and touches the same navigation file, so it must run last.

Plan 004 supersedes the desktop-dropdown transform portion of plan 002 after real pointer use exposed a feel-breaking transform/layout conflict. Execute it immediately.

The audit deliberately leaves the FAQ disclosure, metric values, product ranking rows, provider-node field, and query-card stack without additional motion. Those candidates failed the frequency/function gate. The continuously looping evidence scenes remain a lower-priority follow-up because a correct one-shot, in-view implementation needs a separate scoped plan.
