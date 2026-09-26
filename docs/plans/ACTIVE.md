# Plan status

## Active

- [Demo and production hardening](citeladder-production-hardening.md)
  — repository-side Phase 1 subset implemented locally on 26 September 2026 in
  `codex/production-hardening`; merge, CI, deployment and runtime retest pending.
  Saved-window and one-manual-refresh controls are implemented; workspace rate
  and aggregate limits remain deferred by the owner. TLS evidence, provisioning
  configuration, cloud dependency/retirement work and Phase 2 policies remain
  open. Security alert implementation remains deferred. See the plan's current
  status and deployment gates; this entry does not authorize deployment.
- [Audit remediation and enterprise readiness](citeladder-audit-remediation.md)
  — PR 1 merged in #156; a partial PR 2 slice is published as #158. Section 4
  records the remaining work and the
  pending retention/billing scope decision. Public policy
  revisions and management/legal proposals await approval.
  Payment implementation, deployment and external acceptance remain excluded.

## Queued

- [DataForSEO LLM Scraper AI Visibility](citeladder-dataforseo-llm-visibility.md)
  — plan saved on 26 September 2026; implementation not started. Adds ChatGPT
  Search and Gemini consumer measurements, six independent audit selections,
  and connected DataForSEO defaults. Customer credentials only; existing API
  measurements and schedules remain available. Saving this plan does not
  authorize implementation or live-provider acceptance.
- [Authorized crawl and AI crawlability](citeladder-authorized-crawl.md)
  — plan saved on 26 September 2026; implementation not started. Customer
  authorization (domain verification or attestation) lets Site Health crawl
  robots-excluded pages of the customer's own domain without bypassing access
  controls. Also covers an expanded AI-bot crawlability report and CDN-log
  crawl insights. Terms wording awaits legal review.
- [Subsequent prompt grounding](citeladder-subsequent-prompt-grounding.md)
  — pending; relevance-ranked persisted GSC evidence for later Generate prompts.
- [Integrations and AI Visibility](citeladder-integrations-audit-followups.md)
  — pending; remaining evidence/action and selected-query generation work.

The owner retained [shell/commercial follow-up](citeladder-authed-shell-and-commercial-architecture.md)
for deferred sign-in selection and invitation delivery; it is not an active or
additional queued assignment. Listed work is not authorization to execute it.

## Last completed

- [Workers migration — four sequential PRs](CiteLadder_Workers_Migration_Implementation_Plan.md)
  — implementation plan requested; PRs 1–4 run in separate chats after each
  predecessor merges. Follows the [architecture specification](CiteLadder_Workers_Migration_Architecture.md).
  PR 1 merged as #133 (`7dffa2ef`); PR 2 merged as #134 (`f9f1ad16`);
  PR 3 merged as #136 (`afd81602`); PR 4 implementation is in progress.
  No deployment or production acceptance is claimed. The owner now wants PR 4
  after PR 3 merges, followed by a separately authorized fresh deployment.
  PR 4 must finalize backend-only deployment and production-only recovery before
  release. The owner reports required infrastructure setup complete; verify it
  in the protected release record before dispatch. There is no staging
  environment; do not create staging Workers,
  domains, GitHub environments or release gates. The Workers runbook lists the
  manual production setup. No data deletion is authorized by this plan; no
  current customers.
  Clean origin cutover: update links/configuration directly; no default legacy
  product redirects or aliases. App pricing continuation belongs to PR 2.

- [Razorpay activation](citeladder-razorpay-activation.md) — owner-approved
  on 24 September 2026. PR A (commercial core) and PR B (payment paths)
  implemented; the B8 test-mode smoke run is still to be performed. PR C
  (customer surfaces) implemented. Test-mode acceptance and the live sign-off
  follow.
  Payments stay disabled until that sign-off.

[Discovery simplification](citeladder-discovery-simplification.md)
— completion confirmed by the owner on 23 September 2026. This index update
does not establish new validation.

[CiteLadder MCP implementation](CiteLadder_MCP_Implementation_Plan_Revised.md)
— completed locally on 21 September 2026: read-only OAuth consent and denial,
workspace-authorized discovery and retrieval, bounded paginated evidence tools,
generated public tool reference, and current protocol compatibility. Focused
component tests and the repository quality gate passed; external client
acceptance remains release validation.

[Search Intelligence with DataForSEO](citeladder-search-intelligence-dataforseo.md)
— follow-up implemented locally on 20 September 2026: explicit scope, richer
saved datasets, filtering/export, acquisition controls and defect fixes.
CI retains release validation; paid provider acceptance was not performed.

[Search intelligence signals](citeladder-search-intelligence-signals.md)
— completed across internal authority, significant content change, query
relevance, anchor diagnostics, topical coherence and bounded content
differentiation. Retain the plan's evidence and uncertainty contracts.

[Google AI Overview surface](citeladder-google-ai-overview-surface.md)
— completion confirmed by the owner on 19 September 2026. Retain the plan's
recorded limitations and withdrawn marketing-copy scope.

[Earned-source page intelligence](citeladder-earned-source-page-intelligence.md)
— completion confirmed by the owner on 19 September 2026. Retain its plan as
implementation history; this status update does not establish new validation.

[Frontend migration — Next.js to Vite and Astro](frontend-migration.md)
— completed on 14 September 2026. Astro owns public SSR and generated
endpoints, Vite owns authenticated routes, Caddy preserves same-origin API and
bounded route ownership, and the Next runtime and migration adapters are gone.
Focused engineering, browser, performance, and independent architecture gates
passed; CI retains clean-container validation.
