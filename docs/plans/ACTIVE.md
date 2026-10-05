# Plan status

This is the current-work index, not authorization to execute a plan or operation.
Completed implementation plans are retained in [the archive](../archive/).

## Active

- [ChatGPT plugin](citeladder-chatgpt-plugin.md): repository implementation complete
  for Visibility, Site Health, public workflows and optional sidebar/context.
  Founder-pilot gating was waived in favor of disposable fixtures/mock-host
  checks. Installed-client acceptance and public release remain separate.

- [Agent capabilities](citeladder-agent-capabilities.md): foundations and MVP
  merged in #203/#206; conversation slices A–C merged in #207 and D in the
  completed TypeScript migration. E, streaming,
  memory promotion, durable execution and project skill policy remain later
  assignments.
- [Audit remediation and enterprise readiness](citeladder-audit-remediation.md):
  #156 and the partial PR 2 (#158) merged. Section 4 retains remaining engineering,
  retention/billing scope decisions and legal/management approvals.
- [Demo and production hardening](citeladder-production-hardening.md): repository
  controls are shipped; remaining TLS/cache/provisioning evidence, cloud dependency
  inventory and Phase 2 policy decisions remain open. Successful delivery is not
  manual acceptance. Security alerts remain deferred.
- [Prompt generation v2](citeladder-prompt-generation-v2.md): implementation merged
  through #173, policy published and production key configured on 28 September.
  Remaining: calibration from live outcomes.
- [Internal links](citeladder-internal-links.md): implementation and placement
  refinement merged in #196/#205. Remaining: editor calibration.
- [Razorpay activation](citeladder-razorpay-activation.md): commercial/payment/customer
  paths are implemented. B8 test-mode acceptance and live sign-off remain open;
  payments stay disabled until sign-off.

## Queued and retained planning

- [MCP Events](citeladder-mcp-events.md): separate proposed follow-up for measured
  changes, subscription filters and durable delivery; not part of plugin release
  or authorized for implementation.
- [AI Traffic and authorized crawl](citeladder-authorized-crawl.md): A1–A3 merged
  in #257/#258/#260. Part B remains a separate assignment; Terms review and
  Crawl Logs plan/quota, retention and privacy decisions remain open.
- [Integrations and AI Visibility](citeladder-integrations-audit-followups.md):
  remaining evidence/action and selected-query generation work. Subsequent prompt
  grounding in relevance-ranked persisted GSC evidence remains deferred.
- [Shell/commercial follow-up](citeladder-authed-shell-and-commercial-architecture.md):
  retained for sign-in workspace selection and invitation delivery, not an active
  implementation assignment.

## Completed implementation and operational follow-up

- [Agent end-to-end reliability and workflows](citeladder-agent-end-to-end.md):
  slices A–G merged in #271. Native and mocked acceptance coverage accompanies
  the cutover; deployment and live-provider quality evaluation remain separate.

The [TypeScript migration](../archive/citeladder-typescript-migration.md) and
[Python retirement](../archive/citeladder-python-retirement.md) are complete:
PR #268 merged the final schema-only boundary with successful CI, Compose smoke,
GCP Deploy and Product, Marketing and Documentation Worker delivery runs.
Manual feature acceptance remains in [release acceptance](../release-checklist.md)
and [Google Cloud acceptance](../operations/GOOGLE_CLOUD.md).

[Backend debt](../archive/citeladder-backend-debt-remediation.md),
[security hardening](../archive/citeladder-security-hardening.md) and
[design contracts](../archive/citeladder-design-contract-refresh.md) merged in
#256, #255 and #230. Deferred B20 legal wording remains in the
[legal review draft](../operations/CiteLadder_Legal_Pages_Final_Review_Draft_2026-09-24.md);
console spend-cap setup remains in the [GCP runbook](../operations/GCP_RUNBOOK.md#budget-and-log-controls).
