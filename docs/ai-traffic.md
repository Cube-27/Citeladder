# AI Traffic and Crawl Logs

## Responsibility

This owner maintains customer-supplied crawl evidence, source credentials,
coverage, persisted crawler reads and the `/ai-traffic` screen. The
[connected-data owner](integrations-traffic-analytics.md) retains GA4 referral
observations, projections, tasks and `analytics/ai-referrals.ts`. The existing
`read_ai_referrals` MCP tool keeps its contract. [Site Health](site-health.md)
owns robots acquisition and crawlability; a request observation does not
establish that a crawler is allowed by robots policy.

The screen has Overview, Crawlers, Referrals and Activity tabs. Overview shows
recognized automated **requests**, GA4 **sessions**, and citations **observed
in CiteLadder's tracked answers** as separate signals. Referrals preserves its
existing range and granularity controls. Activity is a sanitized, paged view
within raw retention. Pages, cross-signal comparisons and insights belong to
the separately assigned A3 work.

## Admission and privacy

[`crawl-logs/ingest.ts`](../frontend/services/api/src/crawl-logs/ingest.ts) is
the admission owner for public webhooks and authenticated upload batches.
It bounds compressed and decompressed bodies, validates the source mapping,
uses the [crawler catalog](../frontend/services/api/src/config/crawlers.json)
and its shared UA matcher, enforces host scope and cross-source day overlap,
verifies against persisted IP-range snapshots, then sanitizes identities.
Unmatched, malformed, overlapping and out-of-scope lines are counted, never
stored as requests. Unmatched lines are not a measure of human traffic.

Only path-level identities join: strip query and fragment, canonicalize with
the shared page owner and hash the canonical URL. Public UUID path segments
remain distinct. Configured secret path patterns become redacted,
`non_joinable` observations with a null URL hash and an explicit reason.
Folder/resource aggregates retain those observations with a fixed-length hashed
grain key without asserting an exact page. IPs, full user agents, bodies, cookies and auth headers are never
persisted. IPs are used transiently for verification.

The transaction locks the per-project state and source, rechecks authority,
inserts a receipt and conflict-safe request rows, and admits a delayed,
coalesced `crawl_log_rollup_refresh`. A running or leased task gets a queued
successor. Queued work merges affected reporting dates, and refresh replaces
only those unfrozen days. Inserts use bounded statement sizes within the same
transaction. No provider/model I/O occurs during admission. Request IDs dedupe
across sources on a project/host; without them the hash of mapped original
fields plus source ID collapses identical repeated lines, including distinct
requests that lack distinguishing fields. Receipt replay returns the original
result and spends no accepted-line quota. A retried, already-accepted
`Idempotency-Key` skips the attempt quota; other retries still count.
Empty webhook heartbeats require an explicit unique `Idempotency-Key`; missing
keys return 422. Replaying a key returns its original receipt and timestamp.

Unsupported formats retain a diagnostic receipt with missing fields and return
422, never zero. Authenticated Cloudflare destination probes retain a separate
`destination_validation` receipt; they are not heartbeats or coverage evidence.
The receipt and upload acknowledgement become visible only after commit.

## Sources and uploads

Sources, uploads, receipts, requests, rollups, coverage and state have
workspace/project scope and composite parent FKs. IP-range snapshots are
append-only platform reference data. Schema authority is the initial migration
and backend models; Kysely types are generated from a disposable database.

Owner/Admin can create, rotate or revoke through
`/api/v1/projects/{project_id}/crawl-logs/sources`. Writes lock current workspace
credential authority and append security events. A webhook's `clw_` credential
contains 32 random bytes, is returned once, and is stored only as a hash and
prefix. Rotation invalidates the old token; revocation retains history and
frees the host. Repeated revocation keeps the first `revoked_at` boundary. One active webhook per project/host is enforced by PostgreSQL.

Public `POST /api/v1/crawl-logs/ingest/{source_id}` requires the source's Bearer
token. The token identifies its existing authorized workspace/project; no
caller-supplied project can redirect it. The apex ingress forwards bytes and
headers through protected origin transport; the product app host refuses this
machine endpoint. Browser APIs stay same-origin `/api/v1`.

Browser uploads stream NDJSON, JSON arrays or Combined, including gzip, validate
a bounded header sample, and locally pre-filter with the catalog. The server
reapplies every admission rule. Upload batches use `upload_id:seq` idempotency
and resume from `last_ack_seq` with the original file name and size. A completed
zero-match scan still saves client-reported scan dates. Unfinished uploads are
abandoned after the configured interval; accepted rows remain partial evidence.
The client skips lines older than `max_backdate_days` and refuses a file with
none inside that window; the server clamps the reported scan span to the
admission window and rejects only a span entirely outside it.
The server derives scanned dates and complete-day flags from the reported first
and last timestamps using the persisted reporting timezone, ignoring client
complete-day booleans. They do not become provider-confirmed coverage.

## Coverage, verification and reporting

Coverage is per source/reporting day:

- `complete`: unsampled live collection, active for the whole completed day,
  with bounded receipt gaps, including heartbeats when no requests occur.
- `declared_complete`: a completed upload declares a complete day within its
  client-reported scan. This claim is labelled as such.
- `partial`: sampled/filtered collection, delivery gaps, partial scans or
  best-effort Worker delivery. Worker-template coverage never exceeds partial.
- `unknown`: no usable evidence for that day. Probes and unsupported batches
  cannot establish coverage.

Only complete or declared-complete coverage supports measured zero. Missing
requests under incomplete coverage are unavailable, accompanied by the absence
statement. Positive observed counts remain useful under partial coverage;
zero page counts/error shares remain unavailable there. Pages count exact,
joinable path identities. Requests are not sessions or citations.

Verification is `verified`, `unverifiable` or `failed_verification`. Reasons
distinguish no published ranges, missing/invalid IP, missing/stale snapshot and IP
outside published ranges. Verified rows retain the snapshot ID and
`contemporaneous` or `later_snapshot` basis. Historical imports verified using
a later snapshot disclose that limitation. Default metrics include verified and
unverifiable observations; failed verification is separately counted.
Crawler reason breakdowns and status-code counts are persisted in daily rollups
and remain available after raw expiry. Folder breakdowns are bounded to the top configured
page-size count; Activity exports contain retained observations only.

A2 uses UTC reporting days; A3 owns adoption of captured GA4 property timezones.
Every rollup records its timezone and formula version. Refresh recomputes from
current committed requests under the project lock. Dates older than
`retention_days - rollup_freeze_margin_days` are frozen; raw retention deletes
only observations, preserving receipts and projections. Rollups keep bounded
source batch IDs. A3 will add its insights successor when that task has an owner.
Retention and abandoned-upload cleanup continue when ingestion is disabled;
IP-range provider refresh is gated by ingestion enablement.

## Read APIs, MCP and configuration

The `ai-traffic` family replaces the old browser API family: overview, crawlers,
referrals, activity, coverage, and crawler/activity CSV exports. Shared
[`ai-traffic.ts` contracts](../frontend/packages/contracts/src/ai-traffic.ts)
own the wire shapes. All reads render persisted data without crawling,
refreshing or calling providers. Cursors bind workspace, project, view, filters
and page size; exports use the same filters, sanitization and bounded paging.

`read_crawl_logs` supplies summary, crawler and coverage views;
`list_bot_requests` supplies retained activity. Business context accepts the
`crawl_logs` section. MCP and the in-app Agent call the same authorized readers.

[`crawl-logs.json`](../frontend/services/api/src/config/crawl-logs.json) owns
formats, mappings, quotas, privacy patterns, retention, dispatch/debounce and
safe-fetch bounds. Its loader rejects backdating at or beyond
`retention_days - rollup_freeze_margin_days`. The analytics worker owns refresh,
IP-range snapshot refresh, retention and abandonment; PostgreSQL owns their
dispatch and leases. IP fetches begin only after durable dispatch, use the shared
safe fetcher, and publish success/failure through fenced task settlement.

`ingestion_enabled` remains **false**. Plans/quotas, retention acceptance and
privacy/DPA wording remain enablement decisions. This implementation authorizes
neither production enablement nor customer infrastructure deployment. The
[public setup guide](../frontend/apps/docs/src/content/ai-traffic.md) and
generated Worker template describe customer-operated collection and its limits.
