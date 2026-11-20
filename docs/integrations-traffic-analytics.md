# Integrations, search, traffic and demand

## Responsibility

This owner turns authorized first-party provider observations into persisted
Performance, AI Referrals, query evidence and Demand projections. Google Search
Console, GA4 and Bing Webmaster Tools are implemented connectors. Shopify
OAuth/product/order sync is retired; [Commerce](commerce-intelligence.md)
uses Site Health and CSV. Reports, agents and reads never call these providers.

[AI Traffic](ai-traffic.md) owns the `/ai-traffic` screen and customer-supplied
crawler logs. This document retains GA4 referral data, projections, tasks and
the `analytics/ai-referrals.ts` reader and its extended `read_ai_referrals` contract.

Dataset arity and dimension separators derive from the native integration
catalog (`config/connected-data.ts`).

## Consent and mapping

Google Search Console and GA4 share one Google grant per workspace and the
sign-in OAuth client, preserving incremental consent, login_hint and
include_granted_scopes. Bing uses separate Microsoft consent even if the Bing
account was created with a Google identity. Property discovery supplies verified
sites or GA4 account summaries; users do not type a property reference.
Discovery is an Owner/Admin `manage_credentials` POST on
`/integrations/{connection_id}/properties`, initiated by the user or on return
from consent, with no retries or background refetch. Naming a project in the
request marks each Search Console or Bing property that belongs to its site
(`matches_project`), using the same rule that mapping creation enforces
([host scope](../frontend/services/api/src/integrations/host-scope.ts): the
project website and owned domains, `sc-domain:` and a leading `www.` ignored).
GA4 summaries carry no site, so their match is unknown (`null`).
Saving or disabling a mapping is also `manage_credentials`: a mapping makes the
worker read the connecting admin's provider grant, so a member who cannot list
the grant's properties cannot bind one either. Members/viewers read saved
mappings.
OAuth completion rechecks current credential authority before code exchange
and under the workspace lock before grant persistence; exchange holds no
database transaction open.

OAuth start accepts a same-origin `return_to` path. Only the configured app
screens qualify (Performance, Keyword research, AI traffic and Settings); the
validated path travels in the signed state, and the callback lands there with
`connected=` or `error=`, otherwise on Settings → Integrations. A start that
fails before consent redirects with the reason instead of returning JSON to a
full-page navigation. A completed consent queues a catch-up sync for the
grant's active mappings, so a reconnect resumes without waiting for the
scheduled run.

Disconnect acts on the grant: it moves to `pending_revocation` (the dispatcher
revokes it at the provider) and every mapping it serves is retired. Connections,
sync runs, artifacts and metric rows are kept, as raw evidence is append-only;
a reconnect reuses the same connections. While the dispatcher holds a live
revocation claim, OAuth completion refuses the reconnect
(`error=oauth_revocation_in_progress`, shown as "wait, then connect again"),
since revoking the old tokens can end the provider's whole grant; once the
grant is `revoked` a reconnect stores only the new tokens. Removing one property retires only
that project's mapping.

AI referral events and their classifications are kept for exactly the
Performance window (`TRAFFIC_MAX_WINDOW_DAYS`, today 480 days): the referral
retention period is derived from it, not configured separately, so
`referral_retention_sweep` never deletes a classification Performance can still
read and an in-window AI session is never counted as not AI.

[Integration routes](../frontend/services/api/src/routes/integrations.ts) use
the TypeScript integration owner in
[integrations](../frontend/services/api/src/integrations/). Credentials remain
encrypted and credential management is Owner/Admin-only. Product read/run
permissions and entitlement limits are separate. A mapping binds an authorized
connection, project and property. Retiring one project's mapping must not retire
another's. The [grant lifecycle](../frontend/services/api/src/integrations/grants.ts)
owns disconnect, revocation claims and reauthorization, and
[integration events](../frontend/services/api/src/integrations/events.ts) is the
only writer of `integration_events`. A GA4 property's reporting timezone is
adopted through the crawl-log state owner (`adoptReportingTimezone`). The [TypeScript readiness reader](../frontend/services/api/src/integrations/readiness.ts)
also serves the Agent's persisted tool reads.

If saving a mapping succeeds but its history import cannot be queued, the API
reports the failure with the saved mapping ID. Retrying the same binding reuses
the mapping and retries missing history work rather than creating a duplicate.

## Sync and evidence

[Sync enqueue](../frontend/services/api/src/integrations/sync.ts) freezes
mapping_id, property_ref and project_id onto each IntegrationSyncRun. An omitted
or null sync body uses the default window. Windows remain calendar dates in
enqueue, history and coverage projections regardless of server timezone.
Dispatcher fan-out is per mapping, read in one grouped query. Fetch and resume
use frozen identity, never the mutable connection pointer. A retired mapping fails
its in-flight work rather than relabeling imported evidence.

Every window ends on the property's last finished day in its own reporting time
zone: the recorded GA4 property zone, Search Console's Pacific day and Bing's UTC
day (`reporting_time_zones`). A GA4 property whose zone is not yet recorded uses
UTC-12, so no sync imports a day the property is still recording. An explicit
window is cut at that day.

An unwindowed on-demand or scheduled sync re-reads only the configured late-data
days after the newest succeeded window for its mapping; the default window applies
only before anything has succeeded. A Search Console sync also re-reads from the
day after the property's latest selected row (every day, before any row),
within `sync_search_console_finality_days`, so a day Search Console finalizes
late is fetched again until it reports. Gaps left by failed history chunks belong to
history retry, never to a routine sync. Only one such sync is in flight per
mapping: while an on-demand or scheduled run for it is queued, leased, running or
retry-waiting, another unwindowed one is refused with `409
sync_active_window_conflict` (the dispatcher skips it). Performance sync queues
the mappings without one and returns the active run for each mapping that has
one, so the page tracks every property's current sync.

A sync-run read also reports `processing` while the project still has a post-sync
projection task active (the kinds in `post_sync_task_kinds`). Settings and
Performance keep polling, show the run as processing and keep Sync disabled until
it clears, then refetch the projections once. A Traffic refresh still queued for
the same window covers later runs, so a burst of imports shares one refresh;
a refresh that has started gets one successor.

On-demand enqueue takes the workspace lock before the connection lock. New
windows require fewer than 20 active sync runs in that workspace and use a
10/workspace/minute request budget. Queued, leased, running and retry-wait runs
count toward capacity; terminal runs free it. An identical active window keeps
the existing 409 conflict without spending another budget unit or slot.
Scheduled imports and approved backfills bypass these admission limits.

After manual sync admission, the browser starts a separate authorized execution
POST for the exact connection and sync run. Mapping creation can start the first
due history windows for that mapping, newest first. These requests reuse the
integration worker and its leases, bound provider execution to 240 seconds, and
leave remaining history, retries and downstream projections to the runner.
Custom Performance range admission likewise starts its exact persisted analytics
task through a separate POST; dashboard reads remain projection-only.

[Integration workers](../frontend/services/api/src/workers/integration-worker.ts)
claim leased PostgreSQL work, commit before I/O, persist append-only import
artifacts and derive versioned metric rows in batched inserts. Dataset
configuration owns provider report grains, compatibility, coverage and truncation.
An artifact is truncated only when provider rows fail to parse; a valid row dated
outside the window is dropped without marking it, because Bing returns its whole
history whatever window is requested. Provider errors, expired credentials and
partial data remain distinguishable from an observed zero.

The runner's integrations lane reports its next due run, so retries and history
chunks run as soon as they are due. The drain deadline aborts a running sync; a
deadline stop releases the run for the next claim and is not charged as an
attempt when it committed a page, so long history imports resume instead of
being written off. A token is resolved for each page. A provider 401 refreshes
the refused token once before the grant is marked `needs_reauth`, and a refresh
the provider refuses as `invalid_grant` marks it `needs_reauth`; a 403 fails the
run as `property_not_accessible` and leaves the shared grant connected.
Interactive probes and workers share a fenced grant refresh claim: the claim
commits before OAuth I/O, concurrent callers wait within a bound, and a rotated
token is saved only while the claim and credential revision still match.

resync_seq increases across overlapping windows, with a target-identity floor
so a remapped property remains comparable across connections. Readers select the
latest complete, untruncated revision of each project/property/provider/dataset/day
partition, including empty successful extracts, and never sum revisions. A row
missing from a replacement is removed; a successful run whose extract is
truncated or incompatible leaves the prior complete revision selected with
`partition_fallback`. A run still in flight, failed or cancelled before it
completed a dataset does not supersede that dataset's selected revision, so it
raises no flag. A fallback revision is complete evidence: its zeros stay
observed. History is imported once per
project/property when it is first mapped and resumes failed chunks. It is bounded
by the resolved history_window allowance and capped at the configured maximum
(480 days, inside Search Console's retention); a later plan upgrade does not yet
extend it.

Traffic, Demand and Referrals reject a mixed-revision projection if a sync
changes the project's partition epoch between their persisted-input scans.
The existing analytics task retries; no partial snapshot family is published.

GA4 reports retain property `timeZone`, `currencyCode`, thresholding,
other-row loss and sampling metadata on every immutable artifact. The mapping
exposes the latest timezone/currency by revision, including when an older sync
finishes later. Quality flags travel with projections;
flagged or unavailable evidence cannot establish zero. Traffic snapshots record
per-day partition quality only for providers with an active property mapping
into the project; another provider's datasets are not applicable and omitted,
not reported unavailable.
Legacy landing extracts with incompatible recorded dimensions are excluded from
complete partition selection and disclose `extract_contract_mismatch`; a compatible
prior revision is retained where available. Otherwise the landing leg remains
unavailable until a compatible resync completes.
Captured timezone updates the existing Crawl Logs reporting state and queues
a rebuild inside raw retention;
older daily rollups retain their original timezone.

`ga4_landing_daily` uses landingPage × sessionSource × sessionMedium × hostName ×
date. Landing folds include only project-owned hosts and disclose excluded-host
counts. Unresolvable or secret-redacted paths cannot join and contribute to
unattributed landing sessions. Source/medium and channel reports remain
property-wide, labelled on their consuming views. Every referral fold uses
session-scoped attribution; first-user and event-scoped sources are not substituted.
Referral snapshot metrics retain contributing row counts and deduplicated,
bounded artifact IDs. Exact landing metric-row IDs remain on the daily rollups.

## Projection chain

Post-sync work uses existing analytics tasks to refresh Traffic, AI Referrals
and Demand, then the appropriate Opportunity and verification successors.
Source identity and contributing revisions belong in refresh idempotency.
[TypeScript analytics worker](../frontend/services/api/src/workers/analytics-worker.ts)
owns every analytics kind: the AI Referrals chain, Traffic and Performance
projections, Demand, Opportunity refresh and verification, source-page inspection,
Keyword Research acquisition, internal links, catalog projection and Commerce
competitor discovery. Its bounded lease recovery runs before each claim,
including an empty drain. Splitting ownership requires restoring an executor
and recovery path; a kind exists only as a registry entry with its executor.
Each domain owns its derived projection.

[Performance](../frontend/services/api/src/traffic/performance.ts) reads persisted
TrafficSnapshot and PerformanceDimensionStat rows. GSC date-only gsc_day_daily
is the source of headline totals and daily series: dimensional datasets cannot
be added together into a total because provider privacy filtering differs.
Each dimension table reads its own dataset. No date-only evidence means null
headline values, not a zero reconstructed from dimensions.

Refresh materializes configured presets anchored to the latest date with
selected Search Console day rows. Search Console imports final data only and
finalizes days late, so days after that anchor are not yet reported
(`not_yet_reported` in the persisted day quality): neither zero nor a quality
flag. Search Console finalizes days in order, so a day before the anchor is also
not yet reported when its selected revision reported no row on or after it and
fetched it within `sync_search_console_finality_days`: that revision may have
read the day before it was final. A revision fetched later than that read the
day final, so a silent day reads as measured zero. Sync re-reads a pending day
until it passes that bound, so the last read decides it. Performance `covered_days` counts the
days between the earliest and latest rows that a complete partition imported.
A property that has never reported a row keeps the window-end anchor, so a
genuinely silent property reads as measured zero. Zero against missing is
decided per day: a total, series bucket or table row keeps its zeros when any
of its days has a partition that can observe one, and only a range with no
such day reads null. Unreported, missing or flagged days otherwise leave the
range partial, as its per-day quality records, without nulling it.
Refresh writes under a per-project advisory lock and also re-projects every
persisted non-preset window (earlier sync windows, Demand windows and custom
ranges) overlapping its trigger window, so a revised day never leaves a custom
range stale. A separate performance_range_projection task creates a custom/comparison
display snapshot from stored evidence only; it does not sync providers, refresh
Demand or enqueue verification. Exact windows cannot fall back to an unrelated
snapshot. A custom end after the latest imported date is clamped to it, a range
that starts after it is rejected, and a failed range can be requested again.
Three- and six-month ranges anchor on the latest preset, never on a custom range.

[AI Referrals](../frontend/services/api/src/referrals/projection.ts) uses
ga4_source_medium_daily as the canonical session grain. AI-source sessions are
the numerator; all sessions of that same report are the denominator. Alternate
referrer reports retain provenance but are not added again. Public rows show
AI sources only. Formula changes require explicit derived rebuilds, never reads.
A run that carries referral datasets refreshes AI Referrals at the end of each
referral artifact's ingest and classification chain, keyed by run and artifact,
so the last classified artifact is never left pending; quality and pending classification are
judged per bucket. Host-like UTM sources match subdomains (`www.perplexity.ai`);
bare tokens stay exact. Each refresh writes the sync window and the preset family
(marked with its preset length, anchored on the latest complete day) at every
snapshot granularity, so a preset read at any chart interval finds its snapshot.

The same referral refresh replaces `ai_referral_landing_daily` over its selected
window, with canonical path hash, property-local reporting day, AI source,
persisted display path/folder/resource labels from the shared path owner,
sessions, engaged sessions, key events, quality and exact metric-row provenance.
It also persists per-source engagement, key events, transactions and purchase
revenue in the property currency. Key events retain the customer's GA4 definition.
The property-wide channel comparison separates AI referrals, Organic Search and
all other sessions. Engagement rate is engaged sessions divided by sessions;
there is no key-events/session rate. Incompatible or missing measures stay unavailable.

Whether sessions are AI referrals has one answer: the
[persisted classification](../frontend/services/api/src/referrals/persisted.ts) of the
same property, day, source and medium. The headline, landing pages, per-source
measures and Performance's AI sessions all read it, so they agree after a rule
change until reclassification writes new rows. An unclassified pair is not counted.

## Keyword Research acquisition

[Keyword Research](../frontend/services/api/src/search-intelligence/) acquires explicit, reviewed DataForSEO Labs and Backlinks Live datasets for one saved apex or www project target and saved competitor targets. The review endpoint is provider-free: it freezes canonical scope, exact request pages, endpoint/version pricing, credential revision, an opaque HMAC account identity, and the estimated cost. The estimate is a ceiling: before each request, a call whose estimate would take reported spend past it is not sent and the run ends `cost_ceiling_reached`; a provider charge above a call's estimate stops the remaining calls after it (`cost_ceiling_exceeded`). Only the separate confirmation action enqueues paid work. The plan picks the account ([credentials](../frontend/services/api/src/search-intelligence/credentials.ts)): a BYOK workspace uses its one eligible DataForSEO connection; a managed workspace uses the platform's connection, sees its estimate and charge only in AI credits, and holds the estimate at confirmation (see [billing](billing-entitlements.md#metered-execution)). Reads render immutable published datasets and never call DataForSEO. Review creation and paid acquisition share the TypeScript owner with readiness, preferences, confirmation, cancellation, dataset reads, the Agent's row handoff (resolved server-side; there is no HTTP route) and citation matching, including Agent/MCP readers. Paid dispatch intent commits before I/O, and every local check (allowed endpoint, readable credential, approved base URL) runs before that commit, so a configuration error is a failed call with no dispatch evidence, never possible spend. Unknown submission or cost state stops acquisition rather than authorizing another paid call.

Account identity uses a purpose-specific key derived from the configured encryption secret, so JWT signing-key rotation does not change account capacity pools.

Reviews inherit the project's market and language unless explicitly overridden. An explicit competitor review resolves the saved domain's public apex/www redirect through the existing secure site resolver, without a database transaction across network I/O. It rejects unresolved, child-host, or cross-domain destinations before quoting paid work; reads never resolve websites. The resolved host is frozen in the call plan. Backlink requests include subdomains when needed to reach a canonical www host, while exact destination filters exclude other hosts and internal links.

New reviews default to domain-plus-subdomains research; exact-host research remains available. Scope is frozen in request identity, reuse, dataset metadata and citation derivatives. Legacy datasets without scope metadata remain exact-host. Saved views select their recorded scope and market independently of acquisition preferences. Exact-host backlink predicates retain explicit ports; broad requests exclude internal backlinks, include disclosed indirect backlinks, and do not narrow destinations to the canonical host. Competitor changes during review resolution return `target_changed` before paid work is quoted.

Organic top pages, individual backlinks and bounded monthly backlink history use the existing acquisition and projection owner. History is broad domain evidence with its own provider coverage, separate from the live filtered summary; missing months remain gaps. Referring domains and referring root domains are distinct metrics. Reviewed ranking order/minimum volume and backlink grouping choose the bounded rows acquired; refresh and expansion always create newly reviewed snapshots without reusing the old result.

Response availability and received provider items are persisted separately from normalized table rows: summaries can be complete without table rows, an observed empty result is distinct from a missing result, and paid costs remain recorded if normalization fails. Zero-row snapshots explain that requests can incur charges without returning data; missing values are never displayed as measured zero.

One acquisition may run per project, one request at a time. All DataForSEO workloads share PostgreSQL account capacity at two concurrent calls and one call start per second. Every send persists append-only dispatch evidence before provider I/O and a separate outcome record after it. An explicit HTTP 429 or a DataForSEO rate-limit status (`rate_limit_status_codes`) may retry twice after the bounded provider capacity delay; each rejection remains recorded. A crash or connection loss after dispatch becomes `uncertain`; it is never sent automatically again. Missing provider cost, pricing drift, credential rotation, a refused credential (`auth_failure`), a refused account (`provider_account_unavailable`), scope escape, and over-estimate cost stop remaining calls while preserving completed datasets. Keyword Research and the audit search surfaces send through one DataForSEO envelope client ([`providers/dataforseo.ts`](../frontend/services/api/src/providers/dataforseo.ts)), so an envelope or task status means the same refusal in both. Snapshot reuse requires an exact scope hash and a complete, fresh published dataset; refresh and depth expansion always return to review.

A paid receipt the schema cannot hold fails its call and dataset
(`normalization_failed`) in its own transaction; the receipt and its reported
cost stay, and the run continues or closes instead of blocking the project's one
active acquisition. Provider totals beyond the 32-bit column are kept in the
dataset summary, and intent lists keep whole values within the column. When a
run stops, its unfinished collecting datasets become failed with unknown
coverage; saved rows and their call provenance remain available. Recovery of
runs whose queue task ended runs in its own periodic `research-recovery` lane.
Cancelling never relabels an `uncertain` run. The screen's latest run and the
run history list confirmed runs only, so an open cost review never hides an
acquisition in progress.

A managed workspace without research access is told research is unavailable, with no provider link; saved results whose credential is gone can be read but not refreshed. The review lists each request before explicit confirmation. Results show no record IDs or raw provider JSON: a dataset never fetched reads "Not fetched" and a value the provider did not report is the shared missing mark. Missing keywords that pass the [keyword-gap gates](opportunities.md) become Actions; the dataset read joins only the live findings, computing nothing. Citation matching is a deterministic derivation from a selected backlink dataset and selected authorized Visibility audits with answers; a derivation over a partial or truncated parent is `partial`, never a definite empty, and repeating it for the same parent dataset, audit selection and citation evidence returns the existing projection. Selected rows hand off to the Agent as typed references.

Column sorting applies to the complete persisted dataset, with stable UUID tie-breaking and unknown values last; changing the sort or page size resets the cursor.

Text, minimum-volume and intent filters run across persisted rows. Cursors bind filters, ordering, page size, dataset and workspace/project authorization. Saved counts, filtered saved counts and provider totals remain separate. CSV exports traverse only saved matching pages and use the same dataset-specific columns as tables, plus provenance and collection metadata; untrusted cells receive spreadsheet-formula neutralization. Loss of access clears retained rows. Provider-reported costs distinguish unknown, unresolved and not charged from measured USD values.

## Query evidence and Demand

[Query evidence](../frontend/services/api/src/demand/query-evidence.ts) builds immutable,
versioned QueryEvidenceSnapshot/Row projections from latest gsc_query_page_daily
evidence before detector computation. When the configured row bound truncates
the source, the highest-impression rows are kept, newest first. Rows retain exact metric/artifact IDs,
query, date, metrics, importer identity and owned-page resolution. Identical
inputs converge idempotently; changed source/window/version appends and
supersedes. Build bounds apply in SQL before materialization; read cursors bind
to the immutable snapshot. Numeric limits live in owning configuration.

[Page equivalence](../frontend/services/api/src/demand/page-equivalence.ts) resolves
cross-source URLs separately from crawler identity. Exact normalized matches
are exact; persisted redirect/canonical evidence may prove resolved. Sitemap
and preferred-origin hints rank candidates but do not prove a join. Heuristic-only
matches remain ambiguous; invalid URLs or absent candidates return unresolved. Every query is
workspace/project-scoped.

Demand always computes the configured policy window (28 days) ending at the
Search Console anchor, whatever sync triggered it; the latest snapshot is the one
with the newest window end, for every reader. Detectors cover branded demand,
striking distance, cannibalization, property-relative CTR gaps, high-impression
low-CTR targets (non-branded queries and pages only, capped, highest impressions
first) and coverage-qualified adjacent-window trends anchored on the latest
observed day.
Branded query classification uses canonical brand/alias/domain vocabulary;
the newest append-only override for an exact normalized query wins.
Detector availability and limitations persist with the snapshot, one entry per
detector including the low-CTR detector. Every signal carries the
impression-weighted position of its evidence where one was reported.

Prompt generation reads the latest query snapshot's non-branded queries, and
the latest published Keyword Research keyword datasets in the project
language, to phrase grounding examples for draft batches
([Prompts and Visibility](visibility-prompt.md#context-topics-and-generation)).
It reads persisted rows only, never fetches, and never presents impressions or
search volume as AI prompt volume.

Query-page relevance is an evidence field on an eligible property-relative CTR
gap, not a second Opportunity. It reports normalized usable-query-term coverage
for the resolved page's title, H1 and primary content, preserves meaningful short
terms such as `AI`, and remains unknown when page resolution or extracted
content is unavailable. The relevance evidence and CTR gap must share the exact
date, country and device scope; wording is correlational and never claims that
missing terms caused the CTR result. The Demand tab's evidence drawer renders
the three measured coverage values and missing title/H1 terms, or the explicit
unavailable reason when the page could not be inspected.

The Opportunity refresh's
[demand hits](../frontend/services/api/src/opportunities/refresh-hits.ts) alone
map actionable signals to Opportunity rules; branded and ambiguous cohorts cannot become actionable hits.

Do not infer a conversion definition from GA4 events or interpret missing event
configuration as zero. First-party generative-AI report ingestion
is not implemented and is not planned ([backlog](plans/backlog.md#removed)).
Building it would need a documented endpoint, supported authentication and an
authorized successful response; never scrape an authenticated dashboard or
substitute ordinary search traffic.

## Read and UI

Manual Demand refresh (Keyword research, Demand tab) accepts only a window already persisted in a
Demand snapshot in the authorized project. One manual refresh may be pending
per project, including leased and retry-wait work. A PostgreSQL workspace
advisory lock spans validation, exact window/revision deduplication and enqueue
in one transaction; duplicate retries consume no additional slot. Rejection
returns structured 422 (unsaved window) or 429 with Retry-After (pending work).
Sync/crawl projections remain automatic and bypass manual admission.

The [Performance API client](../frontend/lib/api/performance.ts) renders
Search Console-aligned ranges. Day/Week/Month/Custom select a range; chart
buckets remain daily. The response supplies actual window and snapshot_id,
and dimension tables use that ID so they cannot drift from the chart.
Comparisons use a second persisted window with absolute differences, not
client-generated percentage change. Year-over-year remains unavailable until
sufficient history exists. Missing custom windows request the explicit projection
action and show progress. A refused request or a failed or cancelled projection
task shows the failure with Retry for that window, never "no imported data
covers this range".

Persisted zero, partial-provider evidence, and an available selected window
with a missing comparison are measured states, never the first-use empty state.
Search Console headline totals control the metric strip and chart, while
persisted dimension counts independently keep breakdown tables available. The
Bing panel needs a persisted selected snapshot plus either a Bing connection or
persisted Bing counts: a connected Bing that measured nothing shows its panel
with zero rows, and a project without Bing never shows it.

Cursors bind project, snapshot, dimension, filters, sorting and page size.
[Data source setup](../frontend/components/integrations/data-source-setup.tsx)
connects sources on the screens that need them; members see who to ask instead
of consent controls, and Settings → Integrations remains the full management
view. Live provider acceptance is separate from the repository's tests.
