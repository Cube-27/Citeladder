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
opportunities/demand_hits.py alone maps actionable signals to Opportunity rules;
branded and ambiguous cohorts cannot become actionable hits.

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

Cursors bind project, snapshot, dimension, filters, sorting and page size.
The browser resets cursor history when those inputs change.
Search Demand is one /demand surface; AI Referrals exposes volume/share/source
totals at /ai-referrals rather than copied Visibility metrics.
[Sync tests](../backend/tests/component/test_integration_sync_enqueue.py) and
[Performance tests](../backend/tests/component/test_performance_api.py) cover
frozen targets and persisted reads. Live provider acceptance is separate.
