# Plan status

## Active

- [Design-system contract refresh](citeladder-design-contract-refresh.md)
  — assigned on 1 October 2026 in `codex/design-contract-refresh`, in a separate
  worktree from main. Implementation is complete locally in committed slices;
  PR creation and publication are explicitly deferred by the owner. CI and
  merge remain pending.

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
  implemented. PR 11 moves the configured model gateway, JEV client, prompt-set
  generation and Commerce buyer-prompt generation/manual entry to TS; Python
  keeps the documented bridges for remaining callers. PR 12 moves project CRUD,
  onboarding/discovery and its worker, logo refresh and command-center reads to
  TS. PR 13 moves integrations routes, connectors and workers to TS. PR 14
  moves auth and workspace HTTP ownership to TS. PR 15 moves the MCP server and
  OAuth provider to TS. PR 16 is split under D7's retirement budget: 16a moves
  receipt reads and both PDF exports to TS and retires reportlab; 16b moves
  commercial mutations, settlement, leased recovery, receipt issuance and the
  typed entitlement ledger to TS, keeping Python worker/operator bridges for
  their assigned migrations. PR 17a moves audit schedule management to TS;
  PR 17b implements the remaining audit admission, execution, scheduling,
  maintenance, provider and Search Intelligence owners in committed slices.
  PR 18a moves source inspection and the first Site Health phases. PR 18b is
  implemented through 18b5c: TypeScript owns Site Health reads, acquisition,
  analysis, lifecycle, drain mode and crawl controls. PR 19a adds the Agent runtime
  core; PR 19b completes adapters and activates the native Agent owner. PR 19c
  completes Commerce competitor discovery and analytics lease recovery, retiring
  the Python analytics worker and its exclusive acquisition/parser bridges.
  Python keeps brand-discovery/integration recovery and fixture identity helpers.
  PR 20 follows the re-sequenced
  order. Deployment of implemented cutovers is pending; the owner dropped the
  one-week soak while there are no customers (smoke tests instead). On
  1 October 2026 the owner accepted a low-cost hosting phase (PRs 21–24:
  scale-to-zero Cloud Run in us-central1, free-tier PostgreSQL VM). From PR 18b
  on, workers gain a drain-and-exit mode.

- [Agent capabilities](citeladder-agent-capabilities.md)
  — foundations and MVP items 1–4 are present in #203, with handoff/evidence
  fixes in #206. Revised on 30 September 2026 after owner clarification:
  improve the ChatGPT/Claude-like conversation and skill-guided workflows;
  preserve the current document UI. Slices A–C were assigned through
  implement-plan and implemented: offline conversation coverage, conditional
  artifact instructions and shared chat interaction polish. CI/merge and
  deployment acceptance are tracked separately. Substantial runtime additions
  follow TypeScript PR 19; streaming is a separate later slice. Memory promotion, durable plan
  execution and project skill policy are deferred. D/E remain separate assignments.

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
