# Plan status

## Active

- [Internal link suggestions](citeladder-internal-links.md)
  — implemented on 28 September 2026 in `codex/content-structure`; revised after
  owner review to a Website Internal links tab using JEV page-pair judgments.
  Topics and the separate Content structure page are removed. Legacy Site
  Health topical coherence is retired. Merged in #196; the production key is
  set with the published TypeSafe revision. Editor calibration remains pending.

- [Prompt generation v2](citeladder-prompt-generation-v2.md)
  — owner-approved on 26 September 2026 and revised after the prompt-universe/JEV
  research. PR 1 (#161), PR 2 (#162), PR 3a (#163) and PR 3b (#172) merged.
  PR 3c code (JEV hard gate with provisional thresholds, text-free rejection
  outcomes, calibration report) is implemented. The TypeSafe policy revision
  was published and the production key set on 28 September 2026 (owner
  decision: pre-launch, no DPA notice owed). Remaining: calibration from live data.

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
  — PRs 1–9b implemented on 27–28 September 2026 (7, 8 and 9 split at the
  owner's direction; golden files and parity checks retired before PR 8).
  On 28 September 2026 the owner set the target at 30% Python or less, brought
  billing, entitlements, audits, Site Health and the Agent into scope and
  settled standing decisions (D6, D7). PR 10 (TS entitlement enforcement and
  the prompt library: sets, prompts, import, candidate review and topics) is
  implemented; prompt generation stays Python until PR 11 moves the model
  gateway. PRs 11–20 follow the re-sequenced order in the plan. Deployment of
  PRs 3–10 and their one-week cutover soaks are pending.

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
