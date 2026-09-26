# Plan status

## Active

- [Prompt generation v2](citeladder-prompt-generation-v2.md)
  — owner-approved on 26 September 2026 and revised after the prompt-universe/JEV
  research. PR 1 merged as `54e6f4b8` (#161). Next: PR 2 (direct Prompts workflow,
  simpler CSV), then PR 3a (business map, candidate staging, review), PR 3b
  (rebuilt generation, JEV shadow) and PR 3c (policy revision, JEV gate).

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

- [Razorpay activation](citeladder-razorpay-activation.md) — owner-approved
  on 24 September 2026. PR A (commercial core) and PR B (payment paths)
  implemented; the B8 test-mode smoke run is still to be performed. PR C
  (customer surfaces) implemented. Test-mode acceptance and the live sign-off
  follow.
  Payments stay disabled until that sign-off.

[Discovery simplification](citeladder-discovery-simplification.md)
— completion confirmed by the owner on 23 September 2026. This index update
does not establish new validation.
