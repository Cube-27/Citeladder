# Backlog

Closed into three tiers by the owner on 11 November 2026
([B74](../billing-decisions.md#decided-not-built)).
This is the single remaining-work record; [plan status](ACTIVE.md) says what is
active. Feature owners in [the documentation index](../README.md) and the
accepted [invariants](../invariants.md) remain authoritative. Establish a
current owner and code inventory when an item is scoped.

| Tier | What it holds |
|---|---|
| 2. Before launch | Compliance, hardening, billing and the release acceptance gates |
| 3. Low priority | Kept for future reference only; not queued |

Tier 1 (build now: Agent verified completion, Site Health scheduling and crawl
options, UI remainders, security and cloud cleanup) shipped on 11 November 2026;
its feature owners describe it. Items removed on 11 November 2026 (BL10) are
listed at the end so that nobody re-adds them from old text.

## Tier 2: before launch

Work that matters once customers or payments exist. Build each item before the
first paying customer, or before payments are enabled where it says so.

### Audit remediation and enterprise readiness

PR 1 (#156) and part of PR 2 (#158) are implemented. Extend the existing
workspace, integration, Agent, MCP, acquisition and security-event owners:

- Durable operator export and deletion jobs with verified authority, scope,
  deadlines, idempotency, progress, failures and category-specific legal holds.
  Distinguish account, workspace, project and integration-history requests.
- Execution and access fences across API admission, schedules, queues,
  credentials, Agent and MCP, including dispatch and terminal writes. Retries
  and late workers must not recreate deleted data. Preserve other members'
  workspaces, and require ownership transfer or explicit closure for a sole
  owner's workspace.
- Redacted JSON/CSV exports and Agent Markdown with provenance and
  omission/licensing manifests, and no secrets. Retryable purge, deletion replay
  before restored access reopens, and separate backup-expiry verification.
  Reactivation may cancel scheduled offboarding before purge, but never silently
  cancels an explicit deletion.
- The remaining security-event callers and recoverable policy-revision history.
  Events reflect committed operations and exclude confidential payloads.
- Broader direct-acquisition robots and pacing coverage. Resolve the
  sitemap/link observation ordering dependency before the broader cutover;
  preserve immutable provenance, SSRF controls, suppression and the kill switch.
- Enforced provider licensing permissions for storage, display, export, Agent
  and MCP; Google revocation and history deletion, and permitted downstream-use
  controls. Ambiguous rights block the affected use until approved evidence
  exists.
- Policy and enterprise package closure, deployed dependency and asset notices,
  and subprocessor-change notification mechanics with an accountable owner.

**Retention requirements:** trial expiry requires active-data purge within 30
calendar days. Paid-service end allows 30 calendar days for export, then a
further 30 to purge. Verified deletion requests require deletion within 30
calendar days, or sooner where required. Residual backups expire within 90
calendar days of active deletion, keeping shorter existing lifetimes. Necessary
legal records and holds are category-scoped exceptions.

**Scope decision still open:** reconcile purge with immutable billing and
financial evidence and restrictive foreign keys. Decide whether narrow
retention-related schema separation is allowed; never cascade or weaken
accounting provenance. Affected purge stays disabled until this is resolved.

Owners: [Workspace access](../workspace-access.md), [MCP](../mcp.md),
[Agent](../agents.md), [Site Health](../site-health.md),
[Earned sources](../earned-sources.md),
[Connected data](../integrations-traffic-analytics.md) and
[Billing](../billing-entitlements.md).

### Production hardening

The cloud cleanup shipped with tier 1. The rest waits for launch:

- Measured workspace-wide Demand refresh rate and aggregate limits;
  one-refresh-per-project only partly addresses that risk.
- Recovery objectives, backup and deletion protections, and a verified isolated
  restore. Two owner decisions from the 2026-11-12 audit are open here. O-1:
  a routine Terraform change replaces the PostgreSQL VM and its auto-delete
  boot disk; protect it with a separate `auto_delete = false` data disk plus
  `prevent_destroy` and a replacement plan gate, the locks and gate only, or no
  change. O-2: there are no backups; a daily disk snapshot kept 7 days, a
  nightly `pg_dump` to GCS kept 14 days, or the accepted risk until customers.
- How local tooling knows a database is local (audit O-3, open): it accepts
  "loopback plus development `APP_ENV`", which the production IAP tunnel also
  satisfies; a local marker row with per-run seed passwords, a `--local` flag
  plus typing the database name, or no change.
- A data-preserving release and schema-evolution policy before customer data,
  with protection against accidental reset or destruction.
- Approved production access, recovery access, key lifecycle and
  purpose-specific log, access and retention controls; capacity measured against
  the agreed workload and budget.
- Site Health claim scale: the claim ranks windows over every claimable task
  row. Add a partial claim index or a per-workspace lateral top-N once queued
  tasks approach tens of thousands. Acceptance is an index-bounded claim plan
  with 50k queued tasks.
- Alerts on failed job executions and errors.
- Security alerts, explicitly deferred until now.

Infrastructure redesigns and paid security tiers require demonstrated need.
Recovery, retention, access and cost decisions come before the work that
depends on them.

Owners: [Google Cloud operations](../operations/GOOGLE_CLOUD.md),
[GCP runbook](../operations/GCP_RUNBOOK.md) and
[Workers runbook](../operations/WORKERS_RUNBOOK.md).

### Billing and entitlements

Payments stay disabled until the Razorpay acceptance gate below is signed off.
Build these before enabling them:

- **B74:** release, never charge, a platform call whose provider request failed
  and whose settlement also failed (`settleAbandonedCalls` and `settleCall` in
  `billing/metering.ts` charge it the B35 fallback today).
- Review the entitlement registry's plan bundles, trial and add-on shape as a
  whole.
- Settle the funded monthly reservation to recorded spend once every paid path,
  including search-surface submissions, records its attempt cost.
- A billing `nextDue`, a due-work probe before a request wake, and a persisted
  runner-seconds cap once job cost is measured from billing SKUs.
- Extend connected-data history after a plan upgrade, with per-provider history
  caps (Search Console keeps 16 months, so longer requests would read as false
  zeros).
- One app-origin source for the public site's pricing CTAs once pricing is
  enabled.
- **Billing owner after ownership transfer** (audit finding BE-302, owner
  2026-11-12). `billing_accounts.owner_user_id` is set once and never follows a
  workspace ownership transfer (`workspaces/service.ts`,
  `entitlements/bootstrap.ts`, `billing/receipts.ts`), so tax receipts name a
  former owner. That former owner can also delete their account while still
  owning billing. Decide whether billing follows ownership or uses a separate
  billing contact, then refuse deleting an account that still owns billing.
- **Billing edge cases (B72).** Re-check each against Razorpay's real webhook,
  polling and reconciliation behaviour in B8 test mode before deciding:
  - A full refund of an upgrade bought in an earlier, ended period revokes only
    that upgrade's grants and does not cancel the subscription.
  - A base checkout that the abandon sweep already marked `abandoned` ignores a
    payment that arrives afterwards: no grant, so the payment needs a manual
    refund.
  - Razorpay's evidence shape for a subscription it has just cancelled is
    unverified. S10's handling of a payment on an ended or B52-cancelled
    subscription (B71) was tested only against the provider fake.
  - An Agent turn that streamed a document is saved and charged only when it
    ends `interrupted` (B69). A turn that hits `turn_timeout`, or that the
    browser closes while a search is pending or before the document's save call
    was accepted, is still refunded under B58, and its document is not saved.
- **Market probe allowance (owner 2026-11-20).** Probes charge AI credits
  today: 100 credits per managed answer plus 5 for labelling, 5 on BYOK
  (`config/probes.json`, `audits/prompt-runs.ts`). A 3-engine probe (about 90
  answers) outspends Starter's 5,000 credits and drains the balance the Agent
  and onboarding need. Give probes their own `probe_runs_per_period` counter,
  funded like `prompt_runs_per_period`: one run per probe answer whichever key
  pays, labelling included, managed engine cost counted in the funded monthly
  budget, refusal 403 `probe_runs_exhausted`; then delete `answer_credits` and
  `label_credits`. Plan amounts are open (proposed: Starter 0, Growth 600, Scale
  2,000, trial 0), and the operator provisioning script needs a value too.
  The same change deletes the probe code's own credit reads, `aiCreditBalance`
  (`probes/status.ts`) and `heldCredits` (`probes/plan.ts`). It also fixes
  probe-schedule drift (owner 2026-11-20: deferred here; no scheduled runs
  until then): a scheduled run rebuilds its questions from the current themes
  (`audits/freeze.ts` `panelOf`), so a theme added after confirming raises the
  cost per run above what the user confirmed, and a removed key fails the
  whole occurrence in `freezeRoutes` instead of dropping that engine as Run
  probe does.

- **Site Health crawl budgets are temporary (owner 2026-11-24).** Each
  workspace may start 10 full crawls and 50 single-page crawls per 30-day
  period, whoever starts them (`config/abuse.ts`, `site-health/crawl-budgets.ts`,
  [SH-B10](../decisions.md#site-health-crawling-sh-b-owner-2026-11-12-co-owner-2026-11-17)).
  Review the amounts, the 30-day window and whether they become plan
  entitlements after the billing launch.

Owners: [Billing and entitlements](../billing-entitlements.md),
[billing provider readiness](../billing-provider-readiness.md) and the
[billing decision log](../billing-decisions.md).

### Search Intelligence

These wait for billing and production row counts:

- Per-workspace acquisition limits: an entitlement-owned depth and spend limit,
  so enterprise workspaces can run exhaustive research. Today `max_depth` is one
  configuration value and the confirmed estimate is the per-run ceiling.
- Bounded readiness and dataset paging indexes. Readiness loads every published
  dataset, and each row page counts with `ilike`. Revisit with production row
  counts.
- Raw response retention. Receipts (up to 8 MB each) are append-only
  provenance; retention needs a reference inventory first.

Owner: [Connected data](../integrations-traffic-analytics.md#keyword-research-acquisition).

### Acceptance, calibration and rollout

Implemented code is not deployed, provider or legal acceptance. Failures found
here may need focused fixes; these rows do not presume another implementation.

| Area | Remaining gate |
|---|---|
| Self-serve authentication | #280 implementation complete. Verify deployed-schema compatibility, Google callback and configuration, Resend sender and controlled-inbox delivery, verification and trial enforcement, and a coordinated API/product/marketing signup rollout. Preserve existing login and recovery on rollback. |
| ChatGPT plugin | Implementation complete. Installed-client acceptance, reviewer account, cases and walkthrough, CIMD assessment, domain verification and scans, submission, approval and publication remain distinct gates. |
| Razorpay | Commercial core, payment paths and customer surfaces implemented. Complete B8 test-mode payments, webhooks and refunds, the billing items above, commercial and tax inputs, live provisioning and sign-off, then a controlled live purchase and refund and rollout. Rollback closes checkout while webhooks and reconciliation continue. |
| Prompt generation | Run the operator live calibration round (`pnpm prompts:eval --live`, six fixtures × count 20, before/after), review thresholds with the owner, and shadow-compare `context_required` defaults against `always`. Calibrate the judge's answerability thresholds (`JEV_ANSWERABLE_FLAG_BELOW`, `JEV_ANSWERABLE_FAIL_BELOW`) and `near_duplicate_jaccard` from live accept/reject outcomes. |
| Fact-checking (F8) | Pilot-gated by the `fact_checking` grant. Before granting, run `pnpm perception:eval --live` and `pnpm facts:eval --live` against the thresholds; then grant two pilot workspaces and review contradicted claims (false-contradiction rate) with the owner before any general release or plan bundle change. |
| Site Health site-level issues in Pages | A site-wide issue (dead-end pages, sitewide link rules) hides "View in Pages" and its per-issue CSV, because both match only the homepage the issue is filed on. Expanding the evidence pages into the Pages filter and the export, the way `refresh-site-evidence.ts` does, would bring them back (review of #1202–#1207, 2026-11-23). |
| Internal links | Calibrate against editor-reviewed outcomes. |
| Content gaps | `min_citations` and `min_domains` in `frontend/services/api/src/config/content-optimization.ts` are placeholders. Measure on real dashboard-ready audits (empty-title share, URLs per topic, topicless-prompt share, number of angles at current thresholds), set both from those numbers and record why. |
| Agent | Deployment, manual conversational acceptance and live-provider quality evaluation remain separate from native and mocked coverage. |
| Google AI Mode | Never run against DataForSEO. One run with only Google AI Mode selected confirms the assumed "no answer" status code (40102) and that `/v3/serp/id_list` lists its tasks, which reconciling an uncertain submission needs. |
| Answer collection | Since the word limit went and the output cap rose to 4,096 tokens, a two-search Claude answer costs the provider about what a probe answer charges: review the price or the search cap with the owner. ChatGPT and Gemini have not been run live without the answer instruction. Check the Commerce shelf's `span_limit` against long answers with nested bullets. |
| Perception Brand tab | Its sources have no "Mentions you" standing and its categories no source count, because the perception read returns neither. |
| Hardening | Obtain current deployed TLS, cache and provisioning evidence and authenticated scanner evidence, effective ingress and state protection, and a cloud dependency inventory. Successful delivery workflows do not establish manual acceptance. |
| Cross-feature release | Manual feature and cloud acceptance, isolated restore and incident exercises, privileged access and MFA, log retrieval and retention, credential rotation and verified-request handling remain external evidence gates. |

Acceptance owners: [release checklist](../release-checklist.md),
[Google Cloud acceptance](../operations/GOOGLE_CLOUD.md),
[billing provider readiness](../billing-provider-readiness.md),
[payment owner requirements](../operations/razorpay-and-demo-owner-requirements.md)
and [launch configuration](../operations/CiteLadder_Launch_Config.md).

### Legal and operational

Open and resolved legal decisions, and the engineering items that keep the
published legal pages true, live in
[legal decisions](../operations/legal-decisions.md). Operational items:

- Named incident and support owners, recovery objectives and operational
  evidence.
- [Console spend-cap setup](../operations/GCP_RUNBOOK.md#budget-and-log-controls).

### Site Health crawl scaling (needs spend)

The measurement kit below supplies every trigger. Nothing here starts until its
trigger is measured and the owner approves the spend (owner, 2026-11-17: "i
dont want any extra cost"). Prices are rough list prices; confirm them before
deciding.

Run the kit read-only, with one crawl as the only load, through the database
SSH tunnel ([daily operation](../operations/GCP_RUNBOOK.md#3-daily-operation)):

- **K1, throughput.** Tasks settled per minute, by kind, for one crawl (`site_crawl_tasks.completed_at`).
- **K2, commits and WAL per page.** Deltas of `pg_stat_database.xact_commit` and `pg_stat_wal` (`wal_bytes`, `wal_fpi`, `wal_records`), divided by K1's pages.
- **K3, statements per page.** Deltas of `pg_stat_statements`: calls, `total_exec_time + total_plan_time`, `shared_blks_read`, `wal_bytes`, and the top 15 statements by time.
- **K4, tables and indexes.** `pg_stat_user_tables` (`n_tup_upd`, `n_tup_hot_upd`), `pg_stat_user_indexes` (`idx_scan`), and index sizes.
- **K5, database VM.** CPU, disk write ops and throttled operations (Cloud Monitoring).
- **K6, runner gaps.** `runner_completed` log lines, and the gaps in K1 at execution boundaries.
- **K7, contention.** `log_lock_waits` lines; tasks with `conflict_count > 0`.
- **K8, fetch latency.** Percentiles of `site_fetch_attempts.latency_ms` and `site_fetch_artifacts.ttfb_ms`.
- **K9, terminalization.** Time from the last task's `completed_at` to the crawl's `completed_at`, and the runner's memory use.

| Item | Cost driver | Trigger |
|---|---|---|
| Database disk pd-standard to pd-balanced, same 30 GB | About $3/month; leaves the free standard-disk allowance | K5 still shows throttled disk operations during a crawl, or `blk_read_time` dominates K3 |
| Database VM e2-micro to e2-small or e2-medium | About $12 or $25/month; the e2-micro is free-tier | K5 shows CPU pinned at its sustained ceiling during crawls, K3 has no single dominant statement, and the page rate is below what the owner wants |
| Runner at 2 vCPU / 2 GiB | About twice the runner seconds | Runner CPU saturated while the database has headroom, or K9 memory near 1 GiB after batched terminalization |
| Two runner executions at once | Usage-billed; the drain lock needs a redesign | Database below about 50% CPU with every slot busy after the fetch-side PR |
| Always-on crawl coordinator (one actor per crawl) | A min-instance service or small VM, about $7–50/month, and a rewrite of leases and recovery | Claim and lease statements still take more than about 25% of database time (K3), or crawls reach hundreds of thousands of pages |
| Cold evidence in object storage (facts and evaluations as compressed files) | Cents of storage, but a new store and read path, and it changes the "PostgreSQL owns durable state" guardrail | Database size nears the 30 GB disk (`database_size_observed`), with evaluations and facts the bulk of it; one 14k-page crawl is roughly 0.4 GB before indexes |
| DuckDB or BigQuery over Parquet | BigQuery is usage-billed; needs cold evidence in object storage first | A product need for cross-crawl analytics that PostgreSQL cannot serve |
| Redis or a managed queue | About $35/month or more; the repository forbids it without measured need | The coordinator's trigger, after tuning the claim (cap, batching) did not fix it |
| Managed PostgreSQL with backups | About $10–26/month plus storage | A decision that running without backups is no longer acceptable; not a speed item |
| PgBouncer on the database VM | No bill, but RAM and CPU on the e2-micro and one more process | Connection count near `max_connections` (40) |

Deferred by the owner on 2026-11-17; free, but each needs measurement or a
product decision first:

- **Fused discover and analyze for walked pages.** A walked page costs two
  tasks and 7 commits (5 after the plan's PR 2). Fusing them cuts that to 2 but
  changes the task state machine and invariant 8's durable
  `classification_expected` record. Trigger: the share of crawls that still walk
  after sitemap-first discovery, with K2 and K3 per walked page.
- **Incremental recrawl.** Skip the new analysis when a page's normalized facts
  hash matches its previous artifact under the same versions and page context;
  the fetch and observation are still recorded. It is mostly a product decision:
  what "analyzed" and coverage count, time-dependent checks, the cross-page
  finalize checks and change intelligence. Trigger: on two consecutive
  production crawls of one site, the share of pages whose `content_hash` and
  facts match.
- **Running live-score sums.** Keep per-page-kind sums on the crawl row, updated
  in the commit that bumps `analyzed_url_count`, with the grouped query kept as
  a low-frequency reconciler. Trigger: K3 shows the live-score statements still
  costly after the plan's interval scaling.

## Tier 3: low priority

Kept for future reference. None is queued; each needs the owner's go-ahead and
a fresh scope before work starts.

| Area | What it would add |
|---|---|
| Agent runtime extensions | Web fetch, turns that continue on the server after the browser closes (durable execution, today deliberately tied to the request; the [Agent plan](agent-hero.md) keeps launch, end and resume on return), scheduled follow-ups and optional cross-chat memory. Each changes an accepted rule (invariants §10 and §13), so the owner chooses between Managed Agents and the native runtime first. |
| Agent memory promotion | Reviewed Save to Context with expected-base revision, idempotency and source-message provenance. Preferences use instruction revisions; company facts use the reviewed brand-profile owner. |
| Agent plan execution | Durable user-approved steps and child-chat links, fresh authorization and funding, and retry semantics; no autonomous execution chain. |
| Agent skill policy | Server-enforced per-project skill enablement and order, and a frozen run policy. User-authored skills stay out of scope. |
| Site evidence retention | Retire a Site Health evidence month by DETACH then DROP. First decide which provenance survives without a live parent (page analyses, issue states, change and commerce observations, cross-crawl analysis lineage), then test the ordered sequence on two seeded months. |
| MCP Events | Measured Visibility change events, a scoped subscription lifecycle with callback verification, durable delivery and host acceptance. Decide baseline, expiry, replay, retention, retry and cooldown, entitlements and volume first. |
| Sliding sessions | Sessions are a fixed 24 hours without sliding renewal; per-device sign-out would need session rows. |
| AI Traffic extensions | Customer-authorized Cloudflare deployment, a Queue-backed Worker, more log providers (Vercel, Fastly, Akamai, Netlify), an S3-pull connector for ALB and legacy CloudFront logs, a WordPress plugin, reverse-DNS verification, device and geography breakdowns, first-party session tracking, real-time streaming and Opportunities from insights. |
| AI answer ads in exports | Add ad observations to audit exports (`src/audits/exports.ts`) with the parser version when exports next change. |
| Enterprise SSO and SCIM | Deferred until an enterprise customer asks (BL7). WorkOS (D9.1), through a `src/auth/workos.ts` adapter; `sso_connections` with verified domains and `enforce`; SCIM membership create, removal and role; an `sso` entitlement and a security event for every change. D9.2 (which plan carries it) is open. Costs $125 per connection per month each for SSO and Directory Sync. |
| Domain verification and authorized crawl | Deferred with SSO (BL7): DNS TXT, file or meta verification with append-only receipts, re-verification and revocation, and live authorization checks before robots-excluded requests. The shipped ignore-robots option (BL6) does not depend on it. |
| Prompt generation extras | Site Health semantic-quality observations, competitor-candidate cleanup and a stable-core/experimental portfolio split. |
| Internal links | A separate judgment-policy version, normalized recommendation rows and catalog-based product variants, only if real runs justify them. |
| Funded billing | Managed AI checkout, funded prices and a scheduled-coverage reserve. Current payment launch scope is BYOK. |
| Ask agent in the drawer | Ask agent on Dashboard screens opens the Agent drawer with a fresh draft instead of the full-page handoff, closing any open overlay first; pending an owner decision since 2026-11-12. |
| Code-taste open items | From [#1136](https://github.com/Cube-27/Citeladder/issues/1136), to discuss with the owner (2026-11-21): the remaining `useEffect` hits that sync outside systems (leave them, wrapper hooks plus an import ban, or a count that only goes down), and rewriting `A & {...}` intersections as `interface extends` (the audit recommended dropping it). |
| Engines multi-select | Pick several engines at once. Needs an engines list parameter on about 15 visibility and perception routes and a code-computed merge of per-engine aggregates: positions, sentiment and win rate are not count-additive. Owner undecided (2026-11-18). |

## Removed

Removed by the owner on 11 November 2026 (BL10, BL12). Do not reopen these from
older text:

- Integrations and AI Visibility: evidence-backed Opportunity sorting and
  labels, a Trends summary, GA4 property matching by stream URL, connected-data
  snapshot retention, retiring the referral tables, per-stat Performance
  coverage, a branded-query override UI, and the first-party generative-AI
  Search Console report check.
- Feature-review leftovers for Opportunities, AI Traffic, Commerce, Onboarding,
  Visibility and Earned sources.
- Traffic impact.

The fact-checking follow-ups and fanout grouping returned on 17 November 2026,
scoped by [AV-3 and AV-8](../decisions.md#ai-visibility-av-owner-2026-11-17-to-2026-11-20).
- Agent journey coverage (eval and end-to-end journey), Agent partial-text
  resume and the expanded Agent evaluation corpus.
- Already shipped: Site Health Recrawl, the app shell's first-wave bootstrap,
  shared section skeletons, and drawer and table width roles.
- No longer defects: accent check marks in dropdowns (the accent-as-mark
  rule was deleted) and TrendChart's own SVG axes (product charts are plain
  SVG by decision).
