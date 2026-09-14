# Plan status

## Active

- [Runtime correctness and continuity](citeladder-runtime-correctness-and-continuity.md)
  — implementation is delivered through Slice 4. Authenticated local traces
  still gate Slice 5 decisions, and deployed incident/SSE acceptance requires
  separate deployment authorization.

## Queued

- [Integrations and AI Visibility](citeladder-integrations-audit-followups.md)
  — pending; remaining evidence/action and selected-query generation work.
- [Razorpay local test integration](citeladder-razorpay-local-test-integration.md)
  — pending; provider execution remains paused pending an explicit resumption
  task and applicable acceptance. No payment enablement is authorized.

The owner retained [shell/commercial follow-up](citeladder-authed-shell-and-commercial-architecture.md)
for deferred sign-in selection and invitation delivery; it is not an active or
additional queued assignment. Listed work is not authorization to execute it.

## Last completed

[Frontend migration — Next.js to Vite and Astro](frontend-migration.md)
— completed on 14 September 2026. Astro owns public SSR and generated
endpoints, Vite owns authenticated routes, Caddy preserves same-origin API and
bounded route ownership, and the Next runtime and migration adapters are gone.
Focused engineering, browser, performance, and independent architecture gates
passed; CI retains clean-container validation.

[Design continuity and resource states](citeladder-design-continuity-and-resource-states.md)
— completed on 13 September 2026. Safe shell/bootstrap recovery, Site Health
read continuity, shareable Opportunities state, truthful analytical resource
states, bounded loading/empty cleanup, and the Overview hierarchy are delivered
with focused unit and controlled browser acceptance.

[Site Health evidence, checklist and final-result rebuild](citeladder-site-health-rebuild.md)
— completed on 12 September 2026. Secure acquisition and immutable evidence
remain in place; direct checklist applicability, binary scoring, terminal page
revisions and source-ID consumers replace the retired family/profile engines.

[AI Visibility improvements](../archive/plans/citeladder-ai-visibility-improvements.md)
— acceptance recorded for the shipped change on 10 September 2026.
Later follow-on changes do not inherit that acceptance record.
