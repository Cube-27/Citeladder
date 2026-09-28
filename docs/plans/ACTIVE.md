# Plan status

## Active

- [Prompt generation v2](citeladder-prompt-generation-v2.md)
  — owner-approved on 26 September 2026 and revised after the prompt-universe/JEV
  research. PR 1 (#161), PR 2 (#162), PR 3a (#163) and PR 3b (#172) merged.
  PR 3c code (JEV hard gate with provisional thresholds, text-free rejection
  outcomes, calibration report) is implemented. Remaining: owner/legal approval
  and publication of the drafted TypeSafe policy revision, the production key
  (no earlier than the DPA's 30-day notice), then calibration from live data.

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

- [TypeScript migration](citeladder-typescript-migration.md)
  — PR 1 (TS platform foundation), PR 2 (shared contracts and
  route-ownership gate) and PR 3 (first live reads: `executions`,
  `ai-referrals`, `visibility`) implemented on 27 September 2026, applying
  D1–D5 as drafted; D6 awaits the owner. PR 4 (queue engine and referral
  analytics kinds, plus removal of PR 3's error-wording emulation) implemented
  on 27 September 2026. PR 5 (traffic, performance and demand projections)
  is implemented without a split; integrations sync/readiness and shared
  Python readers remain with their existing owners. PR 6 is implemented locally:
  verification is TS-owned, with an owner-approved detector foundation for PR 7.
  PR 7 is split: 7a (Opportunity refresh and catalog routes) is implemented.
  PR 7a-cleanup removes Python emulation from PRs 3–6, retaining only live
  cross-stack identity contracts. PR 7b (Action routes and declarations) is
  implemented.
  The owner restated the objective on 28 September 2026: rebuild in clean
  TypeScript, with no parity and no golden files. Golden retirement removed
  every golden file and parity check before PR 8. PR 8 is split into 8a
  (Search Intelligence) and 8b (Commerce). Deployment of PRs 3–7b and their one-week
  cutover soaks are pending.
  Site Health, audits, billing/entitlements and the Agent runtime stay Python.

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
