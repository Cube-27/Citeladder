# Integrations, search, traffic and demand

## Responsibility

This owner turns authorized first-party provider observations into persisted
Performance, AI Referrals, query evidence and Demand projections. Google Search
Console, GA4 and Bing Webmaster Tools are implemented connectors. Shopify
OAuth/product/order sync is retired; [Commerce](commerce-intelligence.md)
uses Site Health and CSV. Reports, agents and reads never call these providers.

## Consent and mapping

Google Search Console and GA4 share one Google grant per workspace and the
sign-in OAuth client, preserving incremental consent, login_hint and
include_granted_scopes. Bing uses separate Microsoft consent even if the Bing
account was created with a Google identity. Property discovery supplies verified
sites or GA4 account summaries; users do not type a property reference.

[Integration API](../backend/app/api/integrations.py) delegates to
[the domain](../backend/app/domain/integrations/). Credentials remain encrypted
and credential management is Owner/Admin-only. Product read/run permissions and
entitlement limits are separate. A mapping binds an authorized connection,
project and property. Retiring one project's mapping must not retire another's.

## Sync and evidence

[Sync enqueue](../backend/app/domain/integrations/sync.py) freezes mapping_id,
property_ref and project_id onto each IntegrationSyncRun. Dispatcher fan-out is
per mapping. Fetch, resume and derivation use frozen identity, never the mutable
connection pointer. A retired mapping fails its in-flight work rather than
relabeling imported evidence.

[Integration workers](../backend/app/workers/integration_worker.py) claim leased
PostgreSQL work, commit before I/O, persist append-only import artifacts and
derive versioned metric rows. Dataset configuration owns provider report grains,
compatibility, coverage and truncation. Provider errors, expired credentials and
partial data remain distinguishable from an observed zero.
Interactive probes and workers share a fenced grant refresh claim: the claim
commits before OAuth I/O, concurrent callers wait within a bound, and a rotated
token is saved only while the claim and credential revision still match.

resync_seq increases across overlapping windows, with a target-identity floor
so a remapped property remains comparable across connections. Readers select the
latest revision per metric identity and never sum revisions. Missing rows in a
later response do not mean zero. Incremental sync re-reads the configured late-data
window. History is imported once per project/property and resumes missing/failed
chunks, bounded by the resolved history_window allowance.

## Projection chain

Post-sync work uses existing analytics tasks to refresh Traffic, AI Referrals
and Demand, then the appropriate Opportunity and verification successors.
Source identity and contributing revisions belong in refresh idempotency.
[Analytics worker](../backend/app/workers/analytics_worker.py) owns dispatch;
each domain owns its derived projection.

[Performance](../backend/app/domain/traffic/performance.py) reads persisted
TrafficSnapshot and PerformanceDimensionStat rows. GSC date-only gsc_day_daily
is the source of headline totals and daily series: dimensional datasets cannot
be added together into a total because provider privacy filtering differs.
Each dimension table reads its own dataset. No date-only evidence means null
headline values, not a zero reconstructed from dimensions.

Refresh materializes configured presets anchored to the latest complete GSC
date. A separate performance_range_projection task creates a custom/comparison
display snapshot from stored evidence only; it does not sync providers, refresh
Demand or enqueue verification. Exact windows cannot fall back to an unrelated
snapshot.

[AI Referrals](../backend/app/domain/analytics/ai_referrals_snapshot.py) uses
ga4_source_medium_daily as the canonical session grain. AI-source sessions are
the numerator; all sessions of that same report are the denominator. Alternate
referrer reports retain provenance but are not added again. Public rows show
AI sources only. Formula changes require explicit derived rebuilds, never reads.

## Search Intelligence acquisition

[Search Intelligence](../backend/app/domain/demand/search_intelligence/) acquires explicit, reviewed DataForSEO Labs and Backlinks Live datasets for one saved apex or www project target and saved competitor targets. The review endpoint is provider-free: it freezes canonical scope, exact request pages, endpoint/version pricing, credential revision, an opaque HMAC account identity, and the maximum cost. Only the separate confirmation action enqueues paid work. Reads render immutable published datasets and never call DataForSEO.

Account identity uses a purpose-specific key derived from the configured encryption secret, so JWT signing-key rotation does not change account capacity pools.

Reviews inherit the project's market and language unless explicitly overridden. An explicit competitor review resolves the saved domain's public apex/www redirect through the existing secure site resolver, without a database transaction across network I/O. It rejects unresolved, child-host, or cross-domain destinations before quoting paid work; reads never resolve websites. The resolved host is frozen in the call plan. Backlink requests include subdomains when needed to reach a canonical www host, while exact destination filters exclude other hosts and internal links.

New reviews default to domain-plus-subdomains research; exact-host research remains available. Scope is frozen in request identity, reuse, dataset metadata and citation derivatives. Legacy datasets without scope metadata remain exact-host. Saved views select their recorded scope and market independently of acquisition preferences. Exact-host backlink predicates retain explicit ports; broad requests exclude internal backlinks, include disclosed indirect backlinks, and do not narrow destinations to the canonical host. Competitor changes during review resolution return `target_changed` before paid work is quoted.

Organic top pages, individual backlinks and bounded monthly backlink history use the existing acquisition and projection owner. History is broad domain evidence with its own provider coverage, separate from the live filtered summary; missing months remain gaps. Referring domains and referring root domains are distinct metrics. Reviewed ranking order/minimum volume and backlink grouping choose the bounded rows acquired; refresh and expansion always create newly reviewed snapshots without reusing the old result.

Response availability and received provider items are persisted separately from normalized table rows: summaries can be complete without table rows, an observed empty result is distinct from a missing result, and paid costs remain recorded if normalization fails. The UI displays the saved market, rounded traffic estimates, comparison tables and compact dataset selectors. Zero-row snapshots explain that requests can incur charges without returning data; missing values are never displayed as measured zero.

One acquisition may run per project, one request at a time. All DataForSEO workloads share PostgreSQL account capacity at two concurrent calls and one call start per second. Every send persists append-only dispatch evidence before provider I/O and a separate outcome record after it. An explicit HTTP 429 may retry twice after the bounded provider capacity delay; each rejection remains recorded. A crash or connection loss after dispatch becomes `uncertain`; it is never sent automatically again. Missing provider cost, pricing drift, credential rotation, scope escape, and over-estimate cost stop remaining calls while preserving completed datasets. Snapshot reuse requires an exact scope hash and a complete, fresh published dataset; refresh and depth expansion always return to review.

The `/search-intelligence` UI separates Overview, Keywords, Competitors, and Backlinks. Acquisition scope and cost are reviewed in a drawer before explicit confirmation. Backlink detail is explicit rather than implied by the summary. Citation matching is a deterministic derivation from a selected backlink dataset and selected authorized Visibility audits. Selected immutable row IDs open a read-only handoff preview; Content resolves those IDs under workspace and project scope, while its instruction field starts empty. Opening the handoff never starts generation.

Dataset tables use shared cursor pagination with 10 rows per page by default and selectable page sizes. Column sorting applies to the complete persisted dataset, with stable UUID tie-breaking and unknown values last; changing the sort or page size resets the cursor. Compatible rows stay visible during same-dataset reads, and text and numeric columns follow the shared alignment contract. Repeated citation matching for the same parent dataset, audit selection, and citation evidence returns the existing projection.

Text, minimum-volume and intent filters run across persisted rows. Cursors bind filters, ordering, page size, dataset and workspace/project authorization. Saved counts, filtered saved counts and provider totals remain separate. CSV exports traverse only saved matching pages and use the same dataset-specific columns as tables, plus provenance and collection metadata; untrusted cells receive spreadsheet-formula neutralization. Loss of access clears retained rows. Provider-reported costs distinguish unknown, unresolved and not charged from measured USD values.

## Query evidence and Demand

[Demand service](../backend/app/domain/demand/service.py) builds immutable,
versioned QueryEvidenceSnapshot/Row projections from latest gsc_query_page_daily
evidence before detector computation. Rows retain exact metric/artifact IDs,
query, date, metrics, importer identity and owned-page resolution. Identical
inputs converge idempotently; changed source/window/version appends and
supersedes. Build bounds apply in SQL before materialization; read cursors bind
to the immutable snapshot. Numeric limits live in owning configuration.

[Page equivalence](../backend/app/domain/demand/page_equivalence.py) resolves
cross-source URLs separately from crawler identity. Exact normalized matches
are exact; persisted redirect/canonical evidence may prove resolved. Sitemap
and preferred-origin hints rank candidates but do not prove a join. Heuristic-only
matches remain ambiguous; invalid URLs or absent candidates return unresolved. Every query is
workspace/project-scoped.

Detectors cover branded demand, striking distance, cannibalization,
property-relative CTR gaps and coverage-qualified adjacent-window trends.
Branded query classification uses canonical brand/alias/domain vocabulary;
the newest append-only override for an exact normalized query wins.
Detector availability and limitations persist with the snapshot.

Query-page relevance is an evidence field on an eligible property-relative CTR
gap, not a second Opportunity. It reports normalized usable-query-term coverage
for the resolved page's title, H1 and primary content, preserves meaningful short
terms such as `AI`, and remains unknown when page resolution or extracted
content is unavailable. The relevance evidence and CTR gap must share the exact
date, country and device scope; wording is correlational and never claims that
missing terms caused the CTR result. The Search Demand CTR-gap card renders the
three measured coverage values and missing title/H1 terms, or the explicit
unavailable reason when the page could not be inspected.

`opportunities/demand_hits.py` alone maps actionable signals to Opportunity
rules; branded and ambiguous cohorts cannot become actionable hits.

JourneyDefinition and reviewed conversion-journey mapping were proposed in older
documentation but are not implemented persistence/API owners. Do not describe
them as shipped, infer a conversion definition from GA4 events or interpret
missing event configuration as zero. First-party generative-AI report ingestion
is also unverified; [pending work](plans/citeladder-integrations-audit-followups.md)
retains the evidence/authorization gate.

## Read and UI

The [Performance API client](../frontend/lib/api/performance.ts) renders
Search Console-aligned ranges. Day/Week/Month/Custom select a range; chart
buckets remain daily. The response supplies actual window and snapshot_id,
and dimension tables use that ID so they cannot drift from the chart.
Comparisons use a second persisted window with absolute differences, not
client-generated percentage change. Year-over-year remains unavailable until
sufficient history exists. Missing custom windows request the explicit projection
action and show progress.

With no imported source evidence, Performance keeps its scoped range controls
and readiness path but does not reserve metric, chart, or dimension-table
scaffolding. Persisted zero, partial-provider evidence, and an available
selected window with a missing comparison remain measured states rather than
the first-use empty state. Search Console headline totals control the metric
strip and chart, while persisted Search Console dimension counts independently
keep breakdown tables available. A Bing connection alone is not evidence for a
selected window; Bing tables require persisted Bing query or page counts for
that snapshot.

Cursors bind project, snapshot, dimension, filters, sorting and page size.
The browser resets cursor history when those inputs change.
Search Demand is one /demand surface; AI Referrals exposes volume/share/source
totals at /ai-referrals rather than copied Visibility metrics.
Search Demand's missing-snapshot state links to the selected project's
Performance setup. AI Referrals retains its range and granularity controls when
the selected projection is empty because another persisted range or granularity
may still be available; measured zero retains them as well.
[Sync tests](../backend/tests/component/test_integration_sync_enqueue.py) and
[Performance tests](../backend/tests/component/test_performance_api.py) cover
frozen targets and persisted reads. Live provider acceptance is separate.
