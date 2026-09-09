# CiteLadder documentation

This is the single active documentation index. Start with
[`../AGENTS.md`](../AGENTS.md), then read only the owner required for the task.
Code and current-runtime tests decide what is shipped.

## Runtime authorities

- [`architecture.md`](architecture.md) — product loop and system boundaries.
- [`invariants.md`](invariants.md) — review-blocking safety and correctness rules.
- [`site-health.md`](site-health.md) — acquisition, page kinds, rules, scoring,
  lifecycle, issues, opportunities, and architecture projection.
- [`backend-architecture.md`](backend-architecture.md) — backend layers and
  ownership.
- [`frontend-architecture.md`](frontend-architecture.md) — routes, state,
  API integration, and composition.
- [`design.md`](design.md) — the sole visual and interaction specification.
- [`api-error-contract.md`](api-error-contract.md) — cross-stack error shapes.
- [`visibility-prompt.md`](visibility-prompt.md) — prompts and Visibility
  admission; [`integrations-traffic-analytics.md`](integrations-traffic-analytics.md)
  — connected-data projections.
- [`commerce-intelligence.md`](commerce-intelligence.md) — Commerce runtime.
- Content generation is specified by the Content sections in
  [`architecture.md`](architecture.md) and
  [`backend-architecture.md`](backend-architecture.md).
- Opportunity implementation and verification are specified by the Opportunity
  sections in [`architecture.md`](architecture.md),
  [`backend-architecture.md`](backend-architecture.md), and
  [`frontend-architecture.md`](frontend-architecture.md).

## Setup and operations

- [`DEVELOPMENT.md`](DEVELOPMENT.md) owns local setup, test isolation, the
  existing validation harness, and troubleshooting.
- [`operations/`](operations/) owns deployment, billing, provider, and recovery
  procedures.
- [`release-checklist.md`](release-checklist.md) owns release-only acceptance;
  it does not authorize publishing or deployment.

## Active work

These are the current bounded workstreams. Each plan declares its remaining
scope and external acceptance limits; shipped behavior still belongs to runtime
owners above.

- [`plans/citeladder-billing-launch-readiness.md`](plans/citeladder-billing-launch-readiness.md)
  — billing release and manual/provider readiness.
- [`plans/citeladder-razorpay-local-test-integration.md`](plans/citeladder-razorpay-local-test-integration.md)
  — isolated local/provider test integration and runbooks.
- [`plans/citeladder-data-pipeline-rebuild.md`](plans/citeladder-data-pipeline-rebuild.md)
  — deferred connected-data follow-up, currently Slice 6 only.
- [`plans/commerce-suite-atomic-rebuild.md`](plans/commerce-suite-atomic-rebuild.md)
  — remaining Commerce release gates.
- [`plans/site-health-measurement-reliability-pr4.md`](plans/site-health-measurement-reliability-pr4.md)
  — named live-crawl acceptance limits after implementation completion.

## Historical evidence

Retained audits, evaluations, visual baselines, and cutover records under
[`plans/`](plans/), [`audits/`](audits/), [`evaluations/`](evaluations/), and
[`archive/`](archive/) preserve useful provenance but are not implementation
authority or mandatory per-edit gates. Completed duplicate plans and incident
checklists are removed once their durable contract and unresolved acceptance
live in the owners above; Git history remains their delivery record.

Published blog content is owned by the typed modules under
[`frontend/lib/marketing-content/blog-posts/`](../frontend/lib/marketing-content/blog-posts/);
there is no parallel documentation draft.
