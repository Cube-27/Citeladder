# Backlog

Consolidated on 7 October 2026. This is the single remaining-work record, queued
through [plan status](ACTIVE.md). It records documented status, not a fresh code
audit or production acceptance. Historical plans have been archived; their removal
does not close the unfinished work below.

Select and scope an item before implementation. Order here is organizational, not
an approved delivery sequence. Feature owners in [the documentation index](../README.md)
and accepted [invariants](../invariants.md) remain authoritative. No archived document
is required to select work; establish a current owner/code inventory when scoping it.

## Remaining engineering

### Audit remediation and enterprise readiness

PR 1 (#156) and partial PR 2 (#158) are implemented. Extend existing workspace,
integration, Agent, MCP, acquisition and security-event owners:

- Durable operator export/deletion jobs with verified authority, scope, deadlines,
  idempotency, progress, failures and category-specific legal holds. Distinguish
  account, workspace, project and integration-history requests.
- Execution/access fences across API admission, schedules, queues, credentials,
  Agent and MCP, including dispatch and terminal writes. Retries and late workers
  must not recreate deleted data; preserve other members' workspaces and require
  ownership transfer or explicit closure for a sole owner's workspace.
- Redacted JSON/CSV exports and Agent Markdown with provenance and omission/licensing
  manifests; no secrets. Retryable purge, deletion replay before restored access
  reopens, and separate backup-expiry verification. Reactivation may cancel scheduled
  offboarding before purge, never silently cancel explicit deletion.
- Remaining security-event callers and recoverable policy-revision history. Enterprise
  agreement references and some membership, Google and credential events already
  exist. Events must reflect committed operations and exclude confidential payloads.
- Owned-site authority receipts and broader direct-acquisition robots/pacing coverage.
  Resolve the sitemap/link observation ordering dependency before the broader cutover;
  preserve immutable provenance, SSRF controls, suppression and the kill switch.
- Enforced provider licensing permissions for storage, display, export, Agent and MCP;
  Google revocation/history deletion and permitted downstream-use controls. Ambiguous
  rights block the affected use until approved evidence exists.
- Policy/enterprise package closure, deployed dependency and asset notices, and
  subprocessor-change notification mechanics with an accountable owner.

**Retention requirements:** trial expiry requires active-data purge within 30 calendar
days; paid-service end allows 30 calendar days for export, then a further 30 to purge;
verified deletion requests require deletion within 30 calendar days or sooner where
required. Residual backups expire within 90 calendar days of active deletion, preserving
shorter existing lifetimes. Necessary legal records/holds are category-scoped exceptions.

**Scope decision:** reconcile purge with immutable billing/financial evidence and
restrictive foreign keys. Decide whether narrow retention-related schema separation
is allowed; do not cascade or weaken accounting provenance. Affected purge stays
disabled until resolved. Independent engineering is not blocked wholesale.

Owners: [Workspace access](../workspace-access.md), [MCP](../mcp.md),
[Agent](../agents.md), [Site Health](../site-health.md), [Earned sources](../earned-sources.md),
[Connected data](../integrations-traffic-analytics.md) and [Billing](../billing-entitlements.md).

### Integrations and AI Visibility

- Make Mentions & Citations actionable: mentioned-and-cited, mentioned-only,
  cited-only and neither; engine coverage, competitor evidence and existing
  Opportunity/Content handoffs.
- Generate explicitly from selected search queries, retaining QueryEvidenceRow
  identity and observation provenance through generation, validation and editing.
- Improve evidence-backed Opportunity sorting/labels without another blended score;
  expose existing three-leg verification, gap changes, overlapping actions and
  the causality notice.
- Add an evidence-grounded Trends summary with comparable selection.
- Match GA4 properties to the project through their web data-stream URL. Search
  Console and Bing properties are already matched to the project's site; GA4
  summaries carry no URL, and matching them would add a provider call per property.
  Assess moving history-backfill fan-out from HTTP into the existing task owner.
- Connected-data storage (feature 6 review): snapshot retention, and storing
  page/query stats once per window instead of once per granularity. This needs a
  reference inventory across verification, Opportunity and Demand provenance, and
  a growth measurement on production, before anything is pruned.
- Retire the referral events and classification tables in favour of inline
  classification from metric rows (the `ga4_referrer_daily` half is never read),
  under the replacement gate. The retention sweep is never scheduled; if it
  is scheduled first, set its retention to at least the longest preset.
- Extend history after a plan upgrade, with per-provider history caps (Search
  Console keeps 16 months, so longer requests would read as false zeros). Wait
  until billing is live.
- Per-stat coverage in the Performance contract, so that one flagged day stops
  turning zeros into unavailable values across the whole window.
- A UI for branded-query overrides (API only today), and a decision on the two
  query-evidence routes that only MCP or nothing calls.
- Review server-side Query Fanout grouping; full-selection totals already run there.
- Verify public copy and correct unsupported claims of importing first-party
  generative-AI Search Console reports. Integration requires a documented endpoint,
  supported authentication and an authorized successful response. Do not scrape an
  authenticated dashboard or substitute ordinary search traffic; keep first-party
  AI observations separate from search traffic and CiteLadder experiments.

Subsequent prompt grounding in relevance-ranked persisted GSC evidence remains deferred.
Never auto-replace the tracked portfolio, equate GSC impressions with AI prompt volume,
overwrite the user's Content skill choice or auto-publish.

Owners: [Connected data](../integrations-traffic-analytics.md),
[Visibility](../visibility-prompt.md) and [Opportunities](../opportunities.md).

### Authorized crawl and domain verification

AI Traffic A1–A3 are implemented (#257/#258/#260). Part B remains separate:

- Domain/host verification using DNS TXT, file or meta challenges; scoped attestation,
  append-only authorization receipts, re-verification, downgrade and revocation.
  DNS proves the named domain/subdomain with descendants only by opt-in; file/meta
  verification proves the serving host only; attestation covers the project host.
- Crawl-policy decisions with live authorization checks before each robots-excluded
  request, including redirects. Leaving the authorized scope falls back to Standard
  handling; revocation/downgrade stops further excluded fetches immediately.
- Settings, verified-scope status and result presentation distinguishing authorized
  robots-excluded pages from ordinary pages and page-level access failures.

Authorization changes robots handling only, never page access controls, credentials,
WAF/CAPTCHA handling, rate limits, SSRF protections or suppression. Competitor and
earned/source acquisition remain Standard. Frozen receipts preserve provenance, not
perpetual permission. Verification commits before network I/O; reads never verify.

Depends on audit-remediation authority receipts. Before enablement, decide whether
attestation alone is sufficient, any depth/page-limit differences and legal Terms wording.

Owners: [Site Health](../site-health.md) and [AI Traffic](../ai-traffic.md).

### Production hardening

Repository Phase 1 replay, saved-window/manual-refresh admission and CSP controls
are shipped. Remaining investigation and policy-dependent work:

- Inventory current cloud callers/dependencies before retiring obsolete integrations,
  keys, APIs or resources and narrowing IAM. Historical VM observations are not
  current topology evidence.
- Define and implement measured workspace-wide Demand refresh rate/aggregate limits;
  one-refresh-per-project only partially addresses that risk.
- Choose recovery objectives, backup/deletion protections and verify isolated restore.
- Establish data-preserving release/schema-evolution policy before customer data;
  protect against accidental reset/destruction.
- Apply approved production access, recovery access, key lifecycle and purpose-specific
  log/access/retention controls; measure capacity against agreed workload and budget.
- Reconcile older provisioning proposals with completed self-serve authentication
  before scoping additional admission work.
- Site Health claim scale (from the Site Health review, item 1.8): claim ranking
  windows over every claimable task row. Add a partial claim index or a
  per-workspace lateral top-N once queued tasks approach tens of thousands; the
  acceptance is an index-bounded claim plan with 50k queued tasks.

Security alerts remain explicitly deferred, not an implicit release prerequisite.
Infrastructure redesigns and paid security tiers require demonstrated need. Recovery,
retention, access and cost decisions must precede their dependent implementation.

Owners: [Google Cloud operations](../operations/GOOGLE_CLOUD.md),
[GCP runbook](../operations/GCP_RUNBOOK.md) and [Workers runbook](../operations/WORKERS_RUNBOOK.md).

### Search Intelligence remainder

Deferred by the [Search Intelligence review](search-intelligence-improvement.md):

- Per-workspace acquisition limits (feature 11): an entitlement-owned depth and
  spend limit so enterprise workspaces can run exhaustive research. Today
  `max_depth` is one configuration value and the confirmed estimate is the
  per-run ceiling.
- Bounded readiness and dataset paging indexes: readiness loads every published
  dataset, and each row page counts with `ilike`. Neither is slow at current
  volumes; revisit with production row counts.
- Raw response retention: receipts (up to 8 MB each) are append-only
  provenance. Retention needs the same reference inventory as the Connected data
  snapshot-retention item.

Owner: [Connected data](../integrations-traffic-analytics.md#search-intelligence-acquisition).

### Design system remainder

The [design system consistency plan](design-system-consistency.md) shipped in
#318–#320. Its [known remainder](design-system-consistency.md#known-remainder)
stays ratcheted by `pnpm check:policy`: hand-rolled `TrendChart` axes,
section-level skeletons, drawer and table width roles, accent check marks in
dropdowns, and the blog illustration palette. Each names the owner to change
first. Owner: [Design](../design.md).

## Deferred proposals

Optional later assignments, not prerequisites for completed features:

| Area | Retained proposal and boundary |
|---|---|
| Agent partial-text resume | Display-only SSE streaming is implemented; a dropped stream falls back to polling and the saved reply. Durable partial-text resume (reconnecting mid-reply to text already written) was declined for now; it would need persisted partial text that can never become a saved or approved artifact, and reconnect must not replay execution. |
| Agent memory promotion | Reviewed Save to Context with expected-base revision, idempotency and source-message provenance. Preferences use instruction revisions; company facts use the reviewed brand-profile owner. |
| Agent plan execution | Durable user-approved steps/child-chat links, fresh authorization/funding and retry semantics; no autonomous execution chain. |
| Agent skill policy | Server-enforced per-project enablement/order and frozen run policy; user-authored skills remain out of scope. |
| Agent evaluation and outputs | Expanded skill evaluation corpus and structured measurement-plan outputs. Durable checkpoint/resume, aggregate elapsed-time policy, multi-read steps and bulk page orchestration need separately measured/scoped work. |
| MCP Events | Measured Visibility change events, scoped subscription lifecycle/callback verification, durable delivery and host acceptance. Use canonical comparable measurements, exact source IDs, explicit units/thresholds and distinct zero/unavailable states. PostgreSQL owns intents/retries; recheck grants, membership, expiry and entitlements before dispatch; unsubscribe/revocation fence delivery. Decide baseline, expiry, replay, retention, retry/cooldown, entitlements and volume first. Recheck current protocol requirements when assigned; independent of plugin release. |
| Sign-in workspace selection | Multi-workspace selection at sign-in; retain the in-app switcher until a complete selection policy is assigned. Invitation delivery is implemented. |
| Prompt generation | Next: the operator-run live calibration round of [Prompt generation v3](prompt-generation-v3.md#eval-and-calibration) (`pnpm prompts:eval --live`, six fixtures × count 20, before/after), threshold review with the owner, and a shadow comparison of `context_required` defaults against `always`. Later: advisory Site Health semantic-quality observations, competitor-candidate cleanup and a stable-core/experimental portfolio split. |
| Visibility review | Deferred by the feature 3 review (2026-10-08): settle the funded monthly reservation to recorded spend once every paid path (including search-surface submissions) records its attempt cost; a "recommended vs only mentioned" rate from persisted entity assessments, replacing the never-computed `sentiment` fields; inline topic rename; import results (added and skipped counts); a failed prompt-measurements read shown as unavailable rather than hidden. |
| Onboarding review | Deferred by the onboarding review (2026-10-08): keep in-progress review edits across a reload (today only the discovery ID and step survive), show the evidence URLs behind the suggested category and competitors on the review step, and move focus to the stage heading on step change. |
| Opportunities review | Deferred by the feature 4 review (2026-10-08): manual order applies within one keyset page, so a pinned row on page 2 never rises; a "why this rank" explanation from the persisted priority factors; status counts in the Actions filter; scoping the commerce catalog-field load to the audit; a top-level source id column for placement and traffic observations (today only inside `result`); trimming the per-observation comparison result (about 20 queries). |
| AI Traffic review | Deferred by the feature 8 review (2026-10-09): comparability after GA4 first sets the reporting timezone (frozen days keep UTC, so crawl-first projects show non-comparable pages until those days leave the window; needs a persisted change date); pushing the URL-hash filter into each Pages CTE for URL detail and pattern reads; receipt retention plus an index for the overlap and source-list scans (schema change, decide with enablement); upload presets for raw Cloudflare Logpush and nginx JSON exports and resume across reloads without the upload ID; accepted hosts beyond the exact host (apex and `www`) with per-source out-of-scope counts; a `stalled` connection state; ending a revoked source's overlap claim at revocation without double-counting the switchover day; a token-only rotate dialog. |
| Commerce review | Deferred by the feature 10 review (2026-10-09): a slim catalog list read with per-target product detail (today the whole catalog is returned and polled during projection); rejected import rows first in `row_outcomes` and an import outcome view; a merge policy for a CSV product and a crawled product that share a SKU under different URLs; product edit and archive flows (`edit_version`, `lifecycle_state` and `observed_external_id` stay unused until then); a snapshot trend per target; Tavily country targeting in place of the locale in the query text, verified against the live provider. |
| Traffic impact | Owner request (2026-10-08), its own PR: show how visibility work converts to website traffic from the connected sources (Search Console, analytics, AI referrals, crawl logs), as observed change around declared work with overlapping actions named — never as attributed causation. May need public copy, which changes only on the owner's request. |
| Internal links | Separate judgment-policy version, normalized recommendation rows and catalog-based product variants, only if real runs justify them. |
| AI Traffic extensions | Customer-authorized Cloudflare deployment, durable Queue-backed Worker, additional log providers/presets, reverse-DNS verification, device/geography breakdowns, first-party session tracking, real-time streaming and Opportunities from insights. |
| Funded billing | Managed AI checkout, funded prices and scheduled-coverage reserve remain separate; current payment launch scope is BYOK. |

Owners: [Agent](../agents.md), [MCP](../mcp.md), [Workspace access](../workspace-access.md),
[Visibility](../visibility-prompt.md), [Site Health](../site-health.md),
[AI Traffic](../ai-traffic.md) and [Billing](../billing-entitlements.md).

## Acceptance, calibration and rollout

Implemented code is not deployed, provider or legal acceptance. Failures found here
may require focused fixes; these rows do not presume another implementation.

| Area | Remaining gate |
|---|---|
| Self-serve authentication | #280 implementation complete. Verify deployed-schema compatibility, Google callback/configuration, Resend sender and controlled-inbox delivery, verification/trial enforcement and coordinated API/product/marketing signup rollout. Preserve existing login/recovery on rollback. |
| ChatGPT plugin | Visibility, Site Health, public workflows and sidebar/context implementation complete. Installed-client acceptance, reviewer account/cases/walkthrough, CIMD assessment, domain verification/scans, submission, approval and publication remain distinct gates. Founder-pilot gating was waived for fixture/mock-host checks. |
| Razorpay | Commercial core, payment paths and customer surfaces implemented. Complete B8 test-mode payments/webhooks/refunds, commercial/tax inputs, live provisioning and sign-off, then controlled live purchase/refund and rollout. Payments stay disabled until sign-off; rollback closes checkout while webhooks/reconciliation continue. |
| Prompt generation v2 | Implementation through #173 complete; policy published and production key configured on 28 September. Calibrate provisional thresholds from live accept/reject outcomes. |
| Internal links | Implementation and placement refinement merged in #196/#205. Calibrate against editor-reviewed outcomes. |
| Agent | Capabilities foundations/MVP and conversation A–D complete; reliability A–G merged in #271. Deployment, manual conversational acceptance and live-provider quality evaluation remain separate from native/mocked coverage. |
| Crawl Logs / AI Traffic | Confirm eligible plans/quotas, raw-request retention and privacy/DPA wording for transient IP processing and retained path hashes before production enablement. The proposed 90-day raw retention is not an approved decision. |
| Hardening | Obtain current deployed TLS/cache/provisioning and authenticated scanner evidence, effective ingress/state protection and cloud dependency inventory. Successful delivery workflows do not establish manual acceptance. |
| Cross-feature release | Manual feature/cloud acceptance, isolated restore and incident exercises, privileged access/MFA, log retrieval/retention, credential rotation and verified-request handling remain external evidence gates. |

Current acceptance owners: [release checklist](../release-checklist.md),
[Google Cloud acceptance](../operations/GOOGLE_CLOUD.md),
[billing provider readiness](../billing-provider-readiness.md),
[payment owner requirements](../operations/razorpay-and-demo-owner-requirements.md)
and [launch configuration](../operations/CiteLadder_Launch_Config.md).

## Legal, management and operational decisions

Retain unresolved approvals under the
[legal review draft](../operations/CiteLadder_Legal_Pages_Final_Review_Draft_2026-09-24.md):

- Named grievance contact and business telephone; enterprise liability, indemnities,
  dispute forum and agreement precedence; final policy/MSA/order-form approval.
- Country admission, transfers and mandatory rights; category-specific finance/legal/
  security retention exceptions and legal-hold procedure. Preserve accepted retention
  clocks above until an explicit replacement resolves conflicting proposals.
- Provider contracts, processing locations, no-training settings and ambiguous data-use
  rights; deployed license/notice clearance and subprocessor-notice ownership/delivery.
- Named incident/support owners, recovery objectives, operational evidence and
  cyber/E&O insurance decision.
- Accountant-approved tax/export inputs and remaining commercial policy decisions,
  including mistaken add-on/top-up refunds. Proposed clauses are not approved policy.
- Deferred B20 legal wording and [console spend-cap setup](../operations/GCP_RUNBOOK.md#budget-and-log-controls)
  retained from completed security/backend work.

## Completed baseline

TypeScript migration/Python retirement (#268), backend debt (#256), security
hardening (#255), design contracts (#230) and design-system consistency
(#318–#320) are complete implementation history, not new assignments. Their
operational/legal exceptions are retained above.

Invitation delivery is implemented, the prompt-generation policy is published and
internal-links work is merged. Do not reopen these tasks from stale historical text.
Update this backlog when remaining scope, blockers or completion change; update
ACTIVE.md when selection or queue state changes. Routine validation belongs in PR/CI
records, not another progress document.
