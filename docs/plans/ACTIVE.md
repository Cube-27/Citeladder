# Plan status

## Active

- [TypeScript application / Python schema tooling](citeladder-python-retirement.md)
  — PRs 1–3 implemented on 4 October 2026: native persistence fixtures, API-owned
  Agent assets, bounded operators, commercial catalog/grant commands and composed
  migration/identity/catalog bootstrap. PRs 1–2 merged in #263 and #264.
  PR 3 is implemented on `feat/native-commercial-operators`; CI/review and merge
  remain pending. PRs 4–5 remain unassigned.
  Alembic remains the sole schema author; deployment and merging remain separate
  owner actions.

- [Backend debt remediation](citeladder-backend-debt-remediation.md)
  — all six slices implemented on `codex/backend-debt-remediation` in one PR,
  one commit per slice in order 6, 5, 1, 2, 3, 4.
  [PR #256](https://github.com/Cube-27/Citeladder/pull/256) is open; stop before
  merging. B20 remains deferred to the next legal revision.

- [Security hardening](citeladder-security-hardening.md)
  — slices 1–7 implemented on `codex/security-hardening` as one PR, with one
  commit per slice. CI/review and merge remain pending; stop before merging.
  Slice 7 is Terraform log exclusion and runbook text only. Spend-cap setup,
  Terraform apply and deployment are deferred owner actions.

- [Design-system contract refresh](citeladder-design-contract-refresh.md)
  — implemented in committed slices on `codex/design-contract-refresh`.
  The owner authorized rebasing onto main, review, simplification and PR creation
  on 2 October 2026. CI and merge remain pending; stop after creating the PR.

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
  Python retains schema/operator and fixture identity helpers.
  PR 20 is assigned: 20a (#231) transfers the first native policy owners and
  retires unused Python bridges; 20b (#232) updates dependencies and prunes
  Python multipart. 20c transfers Opportunity/Action, source-page, JEV and
  other native catalogs (#233). 20d implements native recovery, sweeper and
  complete production startup admission (#234). 20e retires Python web, its
  unused dependencies and the empty OpenAPI drift bridge (#235). 20f transfers
  Commerce and audit-scheduler runtime policy, retaining shared model defaults
  and versions. PR20g–n complete the error vocabulary, acquisition retirement,
  Site Health, Agent/gateway, connected-data, audit/provider, auth/identity and
  billing policy transfers. Remaining Python configuration serves schema defaults
  and provenance, security, role/entitlement registries, frozen provider catalogs
  and supported operators/bootstrap. Unused fixture/exporter/suggestion bridges
  and dependencies are retired. PR20 implementation is complete; PR21–24 remain
  separate hosting work. PR21 implementation is complete (2 October 2026):
  bounded shared-pool runner/tick, commit-aware API wake-up and Cloud Run origin
  admission. PR22–24 implementation is complete (2 October 2026): us-central1
  Terraform (Cloud Run API/runner/tick/migrate, free-tier PostgreSQL VM,
  scheduler, budget), Workers pointed at Cloud Run, and Mumbai, Caddy, the VM
  runtime and per-owner daemons retired. No backups by owner direction. The
  first deploy, Worker deploys, live smoke and the DPA hosting-location update
  are owner operations ([GCP runbook](../operations/GCP_RUNBOOK.md)).
  Deployment of implemented cutovers is pending; the owner dropped the
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

- [AI Traffic analytics, crawl logs and authorized crawl](citeladder-authorized-crawl.md)
  — plan saved on 26 September 2026 and revised twice on 3 October 2026;
  A1 bot catalog and AI crawlability merged in PR #257. A2 Crawl Logs and the AI
  Traffic screen replacement merged in PR #258 (`43cce367`). A3 GA4 extract
  contract fixes, the per-URL Pages join, comparisons and insights are in
  progress. Part B (authorized crawl) follows
  separately; its Terms wording awaits legal review. Production enablement of
  A2 awaits the plan/quota, retention and privacy decisions recorded in the
  plan.
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

Discovery simplification
— completion confirmed by the owner on 23 September 2026. This index update
does not establish new validation.
