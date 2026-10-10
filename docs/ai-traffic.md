# AI Traffic and Crawl Logs

## Responsibility

This owner maintains customer-supplied crawl evidence, source credentials,
coverage, persisted crawler reads and the `/ai-traffic` screen. The
[connected-data owner](integrations-traffic-analytics.md) retains GA4 referral
observations, projections, tasks and `analytics/ai-referrals.ts`. The existing
`read_ai_referrals` MCP tool adds landing pages, quality and comparisons.
[Site Health](site-health.md) owns robots acquisition and crawlability; a request observation does not
establish that a crawler is allowed by robots policy.

The screen has Overview, Crawlers, Referrals, Pages and Activity tabs. Overview shows
recognized automated **requests**, GA4 **sessions**, and citations of the
business's own pages **observed in CiteLadder's tracked answers** as separate
signals. Activity is a sanitized, paged view within raw retention. One `range`
URL parameter carries the selected preset across tabs; Referrals adds its
"latest synced window" and keeps granularity in the URL. Contract tokens (page
leg states, coverage, reasons, bots, AI sources, GA4 quality flags) reach the
reader only as labels from `lib/ai-traffic/vocabulary.ts`; record IDs are never
shown.

Crawl collection is **available** when ingestion is enabled for the workspace or
the project already has a source. When it is not, the screen opens on Referrals,
the Crawlers and Activity tabs, connect buttons and the verification control are
absent, and the Overview crawl card says collection is not available yet. A link
to a crawl-only tab lands on Referrals. Referrals has Overview, Sources and Landing pages sub-tabs,
including property-wide session/engagement/key-event comparisons and purchase
revenue in the captured property currency. Key events use the customer's GA4
definition; no key-events/session rate is calculated.

Crawl setup checks ingestion availability inside the dialog before showing
collection controls. Revoking a source asks for confirmation naming its host. Disabled ingestion explains why source creation and uploads
are unavailable. Empty Crawlers and Activity views also expose crawl connections.
File backfill keeps its upload-source workflow: create a source first, then select
the file in the same dialog. Overview omits an empty Observed patterns card when
there is no coverage notice to disclose.

Pages separately aggregates requests, AI-referral sessions/key events, tracked
citations and current Site Health findings to `url_hash` before joining. Counts
cannot multiply across bots, sources or citations. Each leg retains connection,
coverage, zero/value, unavailable, unknown or quality-flagged state. Crawl and
referral legs become `non_comparable` on a timezone mismatch. Non-joinable paths
remain folder aggregates. A newer extract awaiting referral publication is
`flagged` (`projection_pending`), so prior counts cannot establish a new zero.
The shared URL panel opens from Pages, referral landing
pages, crawler drill-downs and Site Health detail, with first/last bot observations,
first referrals, citation dates and provenance. Units link to their owning views.

Observed crawl coverage is the share of known URLs in the latest terminal Site
Health inventory requested by an AI search/user-fetch bot in the selected window.
It requires complete or declared-complete logs and discloses inventory date,
completeness and sampling. It does not establish indexing coverage.

## Admission and privacy

[`crawl-logs/ingest.ts`](../frontend/services/api/src/crawl-logs/ingest.ts) is
the admission owner for public webhooks and authenticated upload batches.
It bounds compressed and decompressed bodies, validates the source mapping,
uses the [crawler catalog](../frontend/services/api/src/config/crawlers.json)
and its shared UA matcher, enforces host scope and cross-source day overlap,
verifies against persisted IP-range snapshots, then sanitizes identities.
Unmatched, malformed, overlapping and out-of-scope lines are counted, never
stored as requests. A line without the identifying fields (timestamp, path, user
agent) is rejected on its own; the batch is `unsupported_format` only when no
line carries them. Unmatched lines are not a measure of human traffic.

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
`Idempotency-Key`, or upload `upload_id:seq`, skips the attempt quota; other
retries still count.
Empty webhook heartbeats require an explicit unique `Idempotency-Key`; missing
keys return 422. Replaying a key returns its original receipt and timestamp.

Unsupported formats retain a diagnostic receipt with missing fields and return
422, never zero. Authenticated Cloudflare destination probes retain a separate
`destination_validation` receipt; they are not heartbeats or coverage evidence.
The receipt and upload acknowledgement become visible only after commit.

## Sources and uploads

Sources, uploads, receipts, requests, rollups, coverage and state have
workspace/project scope and composite parent FKs. IP-range snapshots are
append-only platform reference data. Schema authority is the SQL baseline; Kysely types are generated from a disposable database.

Owner/Admin can create, rotate or revoke through
`/api/v1/projects/{project_id}/crawl-logs/sources`. Writes lock current workspace
credential authority and append security events. A webhook's `clw_` credential
contains 32 random bytes, is returned once, and is stored only as a hash and
prefix. Rotation invalidates the old token; revocation retains history and
frees the host. Repeated revocation keeps the first `revoked_at` boundary. One active webhook per project/host is enforced by PostgreSQL.

Machine ingest lives on the API host `api.citeladder.com` (API-OWNED; see the
[Workers runbook](operations/WORKERS_RUNBOOK.md#api-host-apiciteladdercom)):
`POST /v1/crawl-logs/ingest/{source_id}` with the source's Bearer token, and
`POST /v1/crawl-logs/firehose/{source_id}` for Amazon Data Firehose. The token
identifies its existing authorized workspace/project; no caller-supplied project
can redirect it. The API host's own Worker (`apps/api-host`) forwards only these two routes to the
protected origin, without cookies; the API serves `/v1` routes on that host
alone, and the apex and app hosts refuse them. Browser APIs stay same-origin
`/api/v1`.

Setups: `cloudflare_worker`, `cloudflare_logpush`, `aws_firehose`, `custom`
(webhooks) and `upload`. `aws_firehose` uses preset `cloudfront_v2_json`
(`x-host-header` for scope, never the distribution's `cs(Host)`; `-` is absent;
`date` + `time` UTC fallback; percent-decoded `cs(User-Agent)`) and declares
`buffer_interval_seconds` (60–900) and `declared_filtered` (the generated filter
Lambda, `crawl:firehose-filter`, which makes sampling `filtered`).
[`firehose.ts`](../frontend/services/api/src/crawl-logs/firehose.ts) only
translates: token from `X-Amz-Firehose-Access-Key`, request-ID match, base64
records decoded with a bad record counted as a rejected line, and lines admitted
through `ingest()` in chunks of `max_lines_per_batch` keyed
`firehose:<requestId>:<n>`, so a retry replays without quota spend. It answers
Firehose's JSON contract with 200/400/401/409/413/429/500 and never a redirect;
a 413, which Firehose drops without backup, keeps an `oversize` receipt and stalls
the source.

Sources show `state` `active`, `stalled` or `revoked`. `stall_reason` is
`no_receipts` (a live webhook source with no accepted receipt for
`stalled_after_hours`, swept by the crawl-log tick while collection is on),
`not_in_plan` (a webhook refused for a lapsed plan) or `oversize`. An accepted
receipt clears it in the same transaction. Receipts record decompressed
`bytes_received`; above `received_bytes_per_project_per_day` on the project's
reporting day, admission answers 429 with `Retry-After` to the next day and
keeps one `bytes_ceiling` diagnostic receipt per source and day. Diagnostic
receipts never count as coverage.

Browser uploads stream NDJSON, JSON arrays or Combined, including gzip, in the
format the upload source was created with, validate a bounded header sample
(failing only when no sampled line maps), skip lines without identifying fields,
and locally pre-filter with the catalog. The server
reapplies every admission rule. Upload batches use `upload_id:seq` idempotency
and resume from `last_ack_seq` with the original file name and size; **Resume
upload** offers this after a failure. The admission floor is fixed by the
upload's creation time, so a resumed scan forms the same batches. After
completion the screen polls the source until it has been processed. A completed
zero-match scan still saves client-reported scan dates. Unfinished uploads are
abandoned after the configured interval; accepted rows remain partial evidence.
The client skips lines older than `max_backdate_days` before the upload's
creation and refuses a file with none inside that window; the server clamps the reported scan span to the
admission window and rejects only a span entirely outside it.
The client reports only its scan span and scanned days. The server derives
scanned dates and complete-day flags from the first and last timestamps using
the persisted reporting timezone, and leaves out any day another source on the
host already covers, so completion never fails on an overlap. Declared days do
not become provider-confirmed coverage.

## Coverage, verification and reporting

Coverage is per source/reporting day:

- `complete`: unsampled live collection, active for the whole completed day,
  with bounded receipt gaps, including heartbeats when no requests occur. The
  bound is `max(max_delivery_gap_minutes, ceil(buffer_interval_seconds / 60) + buffered_delivery_grace_minutes)`
  per source, so a Firehose stream is judged against its buffer interval.
- `declared_complete`: a completed upload declares a complete day within its
  client-reported scan. This claim is labelled as such.
- `partial`: sampled/filtered collection, delivery gaps, partial scans or
  best-effort Worker delivery. Worker-template coverage never exceeds partial:
  the template buffers matched events per isolate and sends a batch once the
  oldest has waited `worker_flush_seconds` or `worker_batch_lines` are pending,
  and an evicted isolate loses its buffer.
- `unknown`: no usable evidence for that day. Probes and unsupported batches
  cannot establish coverage.

A window's coverage is judged over closed reporting days: the day in progress
counts requests but cannot make a window incomplete. Only complete or
declared-complete coverage supports measured zero. Missing
requests under incomplete coverage are unavailable, accompanied by the absence
statement. Positive observed counts remain useful under partial coverage;
zero page counts/error shares remain unavailable there. Pages count exact,
joinable path identities. Requests are not sessions or citations.

Verification is `verified`, `unverifiable` or `failed_verification`. Reasons
distinguish no published ranges, missing/invalid IP, missing/stale snapshot and IP
outside published ranges. Only a contemporaneous snapshot can fail a request; an
IP outside a later snapshot's ranges is `unverifiable`
(`later_snapshot_mismatch`), because published ranges change. Verified rows retain the snapshot ID and
`contemporaneous` or `later_snapshot` basis. Historical imports verified using
a later snapshot disclose that limitation. Default metrics include verified and
unverifiable observations; failed verification is separately counted.
Crawler reason breakdowns and status-code counts are persisted in daily rollups
and remain available after raw expiry. Folder breakdowns are bounded to the top configured
page-size count; Activity exports contain retained observations only.

Reporting days use the captured GA4 property timezone, with UTC before capture.
Every read resolves the project's reporting timezone first: preset windows end
on the current reporting day there, and Activity bounds raw requests by local
midnights.
Every rollup records its timezone and formula version. Refresh recomputes from
current committed requests under the project lock, loading only the receipts
received on, or carrying lines from, the refreshed days. Dates older than
`retention_days - rollup_freeze_margin_days` are frozen; raw retention deletes
only observations, preserving receipts and projections. Rollups keep bounded
source batch IDs and the canonical queryless URL for joinable identities.
Retention and abandoned-upload cleanup continue when ingestion is disabled;
IP-range provider refresh is gated by ingestion enablement, including the
configured development workspace exception.

## Read APIs, MCP and configuration

The `ai-traffic` family replaces the old browser API family: overview, crawlers,
referrals, pages, page detail, insights, activity, coverage, and crawler/activity/Pages
CSV exports. Shared
[`ai-traffic.ts` contracts](../frontend/packages/contracts/src/ai-traffic.ts)
own the wire shapes. All reads render persisted data without crawling,
refreshing or calling providers. Cursors bind workspace, project, view, filters
and page size; exports use the same filters, sanitization and bounded paging.

`read_ai_traffic_pages`, `read_ai_traffic_url` and `read_ai_traffic_insights` share
these reads. The URL tool canonicalizes with the existing page owner and rejects
off-origin input. Reads never enqueue or rebuild insights.

`ai_traffic_insights_refresh` writes one snapshot per preset window through the
existing analytics queue. Every pattern needs referral evidence, so only projects
with an active GA4 mapping derive insights; without one the read says to connect
Google Analytics. Each preset window ends on the last closed reporting day,
capped at the latest complete GA4 day, and replaces the older snapshot of the
same length. A preset read serves the newest snapshot of that length with its
dates; pattern-filtered Pages read over that snapshot's window. Terminal
crawl-log/referral refreshes, Visibility audit completion, Site Health
terminalization and source/mapping changes enqueue a refresh in their owning
transaction, and crawl-log maintenance enqueues one a day for each GA4-mapped
project not yet refreshed that UTC day. Queued work is coalesced and debounced; leased/running
work gets a queued successor. Repeated queued triggers preserve the earliest
refresh deadline. Pattern-filtered Pages reads of a GA4-mapped project return a retryable
unavailable response while no snapshot exists, rather than an empty observed
population. Snapshots retain formula version, configured
thresholds and exact rollup, audit, artifact and crawl IDs. Four bounded patterns
cover verified crawls without identifiable referrals, referrals without recent
recognized AI crawls, exact-code verified errors on valuable pages, and key-event
concentration. Absence patterns require complete logs and unflagged complete GA4
partitions for the whole window; concentration additionally requires the full
input population. Partial coverage displays a notice. Copy describes co-occurrence
only, and Overview links to persisted pattern-filtered Pages and URL detail.

`read_crawl_logs` supplies summary, crawler, coverage and individual request
(`requests`) views. Business context accepts the
`crawl_logs` section. MCP and the in-app Agent call the same authorized readers.

[`crawl-logs.json`](../frontend/services/api/src/config/crawl-logs.json) owns
formats, mappings, quotas, privacy patterns, retention, dispatch/debounce and
safe-fetch bounds. [`ai-traffic.json`](../frontend/services/api/src/config/ai-traffic.json)
owns insight thresholds, bounds and debounce. The Crawl Logs loader rejects
backdating at or beyond
`retention_days - rollup_freeze_margin_days`. The analytics worker owns refresh,
IP-range snapshot refresh, retention and abandonment; PostgreSQL owns their
dispatch and leases. IP fetches begin only after durable dispatch, use the shared
safe fetcher, and publish success/failure through fenced task settlement.

Collection needs the workspace plan's `crawl_logs` grant (every paid plan;
not the public trial; see [billing entitlements](billing-entitlements.md)) and
the global kill switch `ingestion_enabled` (on). Source creation, uploads and
webhook admission refuse with 409 `crawl_logs_not_in_plan` or
`crawl_logs_disabled`; reads keep working and report `availability`
(`available`, `not_in_plan`, `disabled`), which the app turns into an upgrade
or paused notice instead of setup. The check takes no capacity lock: a grant
change racing one batch decides that batch only. Raw `bot_requests` are kept
for `retention_days` (90); projections, coverage and receipts stay as project
data under the privacy policy's retention terms. This does not deploy customer
infrastructure. The
[public setup guide](../frontend/apps/docs/src/content/ai-traffic.md) and
generated Worker template describe customer-operated collection and its limits.
