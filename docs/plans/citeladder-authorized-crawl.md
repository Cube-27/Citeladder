# AI Traffic analytics, crawl logs and authorized crawl

## Status and boundaries

Status: queued. Plan history:

- Saved on 26 September 2026.
- Revised on 3 October 2026: Part A became three self-contained PRs.
- Revised again on 3 October 2026 after an external review. The owner then
  settled the AI Traffic screen, URL privacy, Worker delivery and
  source-overlap decisions.

Authorized crawl (Part B) remains a separate, later assignment.
Implementation has not started. This document specifies future work. It
does not describe shipped behavior and does not authorize execution; a PR is
authorized only when the owner assigns it.

Extend the existing owners named below. Do not create a second bot
vocabulary, URL identity, authority store, receipt table, security-event
writer, crawl policy engine, credential store or queue.

### Owner decisions settled on 3 October 2026

- **One AI Traffic screen.** `/ai-traffic` replaces the AI Referrals screen,
  its nav item and its `ai-referrals` HTTP endpoint outright. There is no
  redirect; pre-launch replacement applies.
  - Tabs: **Overview | Crawlers | Referrals | Pages | Activity**.
  - Overview has two connection actions, **Connect crawl logs** and
    **Connect GA4**. Each signal remains independently useful.
  - The referral data owner (`referrals/`, its tables and its tasks) stays;
    only the read surface is replaced.
  - The MCP tool `read_ai_referrals` keeps its name and meaning.
- **Customers connect whatever log source they use.** The first wave offers
  four setup paths:
  - Cloudflare Worker template (best-effort; the customer deploys it).
  - Cloudflare Logpush (Enterprise plans).
  - Custom webhook for any shipper that can POST NDJSON or JSON (for
    example Vector, Fluent Bit or Fastly HTTPS logging).
  - File upload.

  Further named presets (Vercel, Netlify, Fastly and others) are config and
  docs additions made on demand, each verified against the provider's docs.
  CiteLadder never deploys into customer infrastructure in Part A.
- **URL privacy: keep paths, redact secrets.**
  - Query strings and fragments are always dropped.
  - Only config-listed secret patterns are redacted: signed-URL, reset and
    magic-link tokens, session IDs.
  - Redacted observations are **non-joinable**: they count per folder and
    resource class, never as a page.
  - Public UUID or slug pages keep exact, joinable identity.
- **Cloudflare Worker template is best-effort, documented as such.**
  Reliable delivery means Logpush or a log shipper.
- **One live source per host.** At most one active webhook per host. Uploads
  are backfill: upload days already covered by another source for that host
  are rejected as overlapping. A provider request ID deduplicates where one
  exists.
- **Search-engine crawlers are kept** (purpose `search_engine`). A Googlebot
  request never identifies Gemini or AI Overviews. Google reports AI
  Overviews and AI Mode traffic inside ordinary Search reporting, so neither
  crawler nor organic data is attributed to a specific Google AI surface.
- **MCP exposes the analytics.** Every new projection gets a read tool in
  the shared TypeScript catalogue, which the Agent also binds.
- **Only recognized automated requests are stored.** Unmatched requests are
  counted in aggregate and discarded. They are called "unmatched requests",
  never "human traffic", because an unmatched line is not proof of a human.
  Uploads pre-filter in the browser, so unmatched lines never leave the
  customer's machine on that path.
- **Units never mix.** Crawler requests, AI referral sessions and tracked
  citations are different units and populations.
  - No metric divides one by another or sums them.
  - AI referral share is AI sessions ÷ total sessions of the same GA4
    report.
  - `ai_user_fetch` requests (for example ChatGPT-User) are automated
    fetches made on a person's behalf. They are not human visits.
- **Insights describe co-occurrence, never causation.** Absence-based
  insights require adequate coverage of every dataset they reason about.

### Decisions still open (confirm before production enablement)

| Decision | Plan default | Blocks |
|---|---|---|
| Plans that receive Crawl Logs and their quotas | Every plan with Integrations; quotas from config | Production enablement of A2 |
| Raw bot-request retention | 90 days, matching `referrals.retention_days`; rollups follow the workspace lifecycle | Production enablement of A2 |
| Privacy policy/DPA wording for transient IP processing and retained path hashes | Legal review | Production enablement of A2 |
| Opportunity creation from insights | Deferred; Agent and MCP read insights first | Nothing in Part A |

## Shared foundations (read before any Part A PR)

### Existing owners this work extends

| Concern | Owner today | Rule for this plan |
|---|---|---|
| Bot vocabulary | Three copies: `page_analysis.rules.ai_crawler_bots` and `search_citation_crawler_bots` in [analysis.json](../../frontend/services/api/src/config/site-health/analysis.json), `crawl.crawler_roles` in [acquisition.json](../../frontend/services/api/src/config/site-health/acquisition.json), and `AI_CRAWLER_BOTS`/`AI_CRAWLER_ENGINE_LABELS` in [site-facts.ts](../../frontend/lib/site-health/site-facts.ts) | A1 replaces all three with one catalog |
| robots.txt parsing | `robots-parser` wrapped in [web-evidence/acquisition.ts](../../frontend/services/api/src/web-evidence/acquisition.ts); the stance is written by [site-setup-task.ts](../../frontend/services/api/src/site-health/site-setup-task.ts) into `site_crawls.site_facts` | Extend this wrapper; no second parser |
| Page identity | `canonicalPage` + `hash` in [traffic/normalization.ts](../../frontend/services/api/src/traffic/normalization.ts), which deliberately shares the Site Health `url_hash` keyspace ([url-identity.ts](../../frontend/services/api/src/site-health/url-identity.ts)) | Every joinable row stores `url_hash` from `canonicalPage`. Never `normalizedUrlForCompare` (Action grouping); no fourth normalizer |
| AI source vocabulary | `aiSourceSchema` in [contracts/ai-referrals.ts](../../frontend/packages/contracts/src/ai-referrals.ts) and the rules in [referrals.json](../../frontend/services/api/src/config/referrals.json) | Catalog entries map to these tokens; no parallel engine list |
| GA4 evidence | `integration_metric_rows`. `ga4_landing_daily` (landingPage × sessionSource × sessionMedium × date), `ga4_channel_daily` and `ga4_ecommerce_source_medium_daily` are synced. **They carry no hostName, property timezone, currency or sampling/thresholding metadata, and a row missing from a newer sync keeps its old value** | A3.1 extends the integration owner narrowly before any join |
| Analytics tasks | [analytics-worker.ts](../../frontend/services/api/src/workers/analytics-worker.ts) and the referral chain in [referrals/](../../frontend/services/api/src/referrals/) | New refresh and sweep kinds join this worker |
| Rate and usage windows | `usage_windows` (pattern in [mcp/registration.ts](../../frontend/services/api/src/mcp/registration.ts)) | Webhook quotas use it |
| Public external POST | `authorize: 'public'`, `raw: true` (pattern: billing webhooks in [routes/billing.ts](../../frontend/services/api/src/routes/billing.ts)) | The ingest endpoint follows it |
| Table export | [http/table-export.ts](../../frontend/services/api/src/http/table-export.ts) (RFC 4180, formula neutralization) | AI Traffic exports reuse it |
| MCP and Agent reads | [mcp/tools.ts](../../frontend/services/api/src/mcp/tools.ts), [mcp/evidence.ts](../../frontend/services/api/src/mcp/evidence.ts); the tool reference [mcp-tools.json](../../frontend/apps/marketing/src/data/mcp-tools.json) is generated by `services/api/scripts/export-mcp-tool-reference.ts` | New read tools land here; regenerate the reference, never hand-edit it |
| Schema | `migrations/versions/0001_initial.py` plus Python models in `backend/app/models`; then `pnpm --filter api db:types` regenerates [db-schema.ts](../../frontend/services/api/src/generated/db-schema.ts) | Pre-launch policy (invariant 17); disposable databases only |

### URL identity contract

Each observation carries two fields:

- `display_path` (sanitized, shown in the UI).
- `identity`: either `exact`, with `url_hash`, or `non_joinable`, with a
  reason.

Rules:

- Queries and fragments are dropped before anything else. The resulting
  identity is therefore **path-level**. Contracts and the UI label it as
  path-level, never as an exact URL with its query.
- A path segment matching a config secret pattern is replaced in
  `display_path`. The observation becomes `non_joinable`
  (`redacted_secret`) and no `url_hash` is computed for it.
- Otherwise `url_hash = hash(canonicalPage(path, origin))`. The origin is
  the line's in-scope host; for host-less formats it is the source's
  configured origin.
- GA4 landing pages resolve with `canonicalPage(landingPage, https://hostName)`
  once A3.1 adds `hostName`. Rows for hosts outside the project scope are
  excluded and counted.
- When identities disagree, the join reports the row as unmatched. It never
  fuzzy-matches.
- A3 adds a test proving that `canonicalPage` and the Site Health
  `canonicalIdentity` hash agree for every owned-site URL form both accept,
  and that a citation of the same page joins.
- Retained hashes of paths count as personal-data-adjacent. They are
  included in the privacy review and in retention.

### Connection, coverage and verification vocabulary (invariant 7)

Connection state belongs to each source: `not_connected`, `awaiting_data`
(connected, no accepted batch) or `connected`.

Coverage quality is reported per source, per reporting day:

| Coverage | Meaning |
|---|---|
| `complete` | A live source, declared unsampled, active the whole day, with no delivery gap longer than `max_delivery_gap_minutes`, measured on batch receipt times. Empty heartbeat batches count. "Complete" means complete **within the declared collection scope**, not all site traffic |
| `declared_complete` | An upload whose client-reported scan spans the whole day. Labelled client-reported |
| `partial` | Some data was received, but not enough for `complete` (gaps, sampling, best-effort Worker, partial upload day) |
| `unknown` | No data for that day |

Each source also declares and shows:

- collection point: `cdn_edge`, `origin`, `application` or `uploaded_file`;
- sampling and filtering limitations;
- last accepted batch;
- last successful processing.

The Cloudflare Worker template can never be better than `partial`.

A measured zero is shown only for `complete` or `declared_complete` days.
Otherwise the copy reads: "No matching requests were observed in the
available logs. Coverage is incomplete."

Verification is recorded as a status plus a reason:

| Status | Reasons |
|---|---|
| `verified` | `basis: contemporaneous` when the IP-range snapshot was fetched within `ip_range_contemporaneous_hours` of the request; `basis: later_snapshot` for backfills, disclosed in the UI |
| `unverifiable` | `missing_ip`, `no_published_ranges`, `no_snapshot` or `stale_snapshot` (older than `ip_range_max_age_hours`) |
| `failed_verification` | `ip_outside_ranges` |

Verification filters apply consistently to every measure: request totals,
unique pages, active bots and error-rate denominators. The default filter
comes from config: `verified` plus `unverifiable`, with
`failed_verification` shown separately.

### Reporting day and timezone

- Crawler timestamps are stored in UTC.
- Rollups bucket by the project's **reporting timezone**. This is the mapped
  GA4 property's timezone once A3.1 captures it, and UTC otherwise. Every
  rollup row records the timezone it used.
- A join or comparison across different reporting timezones is
  `non_comparable` (`timezone_mismatch`). It never silently mixes UTC and
  property-local days.
- When the reporting timezone changes, rollups are rebuilt only for days
  still inside raw retention. Older rollups keep their recorded timezone.

### Hosting cost

- The API runs on scale-to-zero Cloud Run. Webhook pushes wake it, so the
  docs recommend shipper batching of 60 seconds or more.
- Per-source batch rates are limited from config and return `429` with
  `Retry-After`.
- Rollup and insight refreshes run on a configurable debounce
  (`refresh_delay_seconds`), coalesced per project. A growing day is not
  rebuilt after every small batch.
- No real-time stack, polling worker or always-on process is added.

---

# Part A — AI Traffic

Dependency order: A1 → A2 → A3. Each PR is self-contained and leaves `main`
runnable. Internal slices are committed separately under the
`implement-plan` workflow.

| PR | Readiness |
|---|---|
| A1 Catalog and crawlability | Ready once assigned |
| A2 Crawl Logs + AI Traffic screen | Ready once assigned; production enablement awaits the open decisions |
| A3 GA4 contract, Pages join, insights | Starts with A3.1, which proves or narrowly extends the GA4 extract contract |

## PR A1 — Bot catalog and AI crawlability

**Outcome:**

- One config-owned crawler catalog drives Site Health robots analysis.
- Each crawl reports, per bot, root access and a robots-policy summary
  evaluated over known URLs.
- robots.txt history is an observation sequence.
- MCP and the Agent can read it.

No log ingestion.

### A1.1 Crawler catalog (replacement)

Before coding, inventory every consumer of `ai_crawler_bots`,
`search_citation_crawler_bots`, `crawler_roles`, `AI_CRAWLER_BOTS` and
`AI_CRAWLER_ENGINE_LABELS`. Known consumers are `site-setup-task.ts`,
`delivery-checks.ts`, `snapshot-eligibility.ts`, `issue-evidence.ts`,
`site-facts-panel.tsx` and their tests.

Create `frontend/services/api/src/config/crawlers.json`, loaded through
`config.ts`:

```jsonc
{
  "catalog_version": "1",
  "purposes": ["ai_training", "ai_search", "ai_user_fetch", "search_engine", "other"],
  "resource_classes": ["page", "document", "asset", "robots", "sitemap", "llms_txt", "feed", "other"],
  "bots": [
    {
      "bot_id": "openai_oai_searchbot",       // stable token, never a display string
      "label": "OAI-SearchBot",
      "operator": "openai",
      "purpose": "ai_search",
      "ai_source": "chatgpt",                  // aiSourceSchema token or null (null for Googlebot/Bingbot)
      "robots_tokens": ["OAI-SearchBot"],      // robots.txt group names
      "ua_patterns": ["oai-searchbot"],        // case-insensitive substrings; [] = robots-only token
      "verification": { "method": "ip_ranges", "source_url": "<operator URL>" }, // or { "method": "none" }
      "checks": ["ai_crawler_access", "search_crawler_access"]   // Site Health rule membership
    }
  ]
}
```

- **Seed and verify.** Seed the catalog with the nine bots configured today,
  keeping their check membership, then add the major operators' documented
  crawlers. Verify every token, UA string and IP-range URL against the
  operator's own documentation at implementation time, and cite the sources
  in the PR. Competitor bot lists are not a specification.
- **Robots-only tokens.** `Google-Extended` and `Applebot-Extended` have no
  HTTP user agent of their own. They get `ua_patterns: []` and never match a
  log line.
- **Rule membership moves into `checks`.** `technical.ai_crawler_access` and
  `search.crawler_access` select bots by membership, keeping today's
  semantics and scoring influence. Changing membership needs a separate owner
  decision.
- **Resource classes.** Classification rules (extensions and well-known
  paths) are config. `document` keeps PDF and other content paths
  distinct from assets.
- **Remove the old lists.** Delete the three old lists and the frontend
  constants. The browser receives labels, operators and purposes from
  persisted facts.
- **Loader validation.** The loader rejects duplicate `bot_id`s and unknown
  purposes, `ai_source` tokens, checks and resource classes.

### A1.2 Root access and robots-policy summary

The robots wrapper in `web-evidence/acquisition.ts` evaluates catalog
`robots_tokens` with the existing parser. Per bot it reports:

- `matched`: `specific_group`, `wildcard_group` or `no_rules`.
- `root_access`: `allowed`, `disallowed` or `unknown`.
- `policy`, evaluated over the root plus a bounded sample of known URLs
  (`robots_policy_sample_size`, drawn from the crawl's admitted sitemap and
  discovered URLs):
  - `all_allowed`: every evaluated URL is allowed.
  - `restricted`: some are disallowed and some allowed.
  - `all_disallowed`: every evaluated URL is disallowed.
  - `unknown`: robots.txt was unreadable (`fetch_failed` or
    `access_blocked`).

  Each value comes with `evaluated_url_count` and `disallowed_url_count`.

Longest-match `Allow` exceptions are honored. For example, `Disallow: /`
with `Allow: /products/` is `restricted`, not blocked, even though the root
is disallowed. A `Disallow` line that is overridden for every evaluated URL
does not produce `restricted`.

Persistence happens in two steps:

- `root_access` is persisted in the first `site_setup` commit, because
  rule checks keep evaluating root access.
- `policy` is persisted in the second commit, after sitemap admission
  supplies URLs.

`site_facts.robots` holds `catalog_version`, `robots_snapshot_id` and
`bots: [{ bot_id, label, operator, purpose, matched, root_access, policy, evaluated_url_count, disallowed_url_count }]`.
This replaces `ai_crawlers` and `crawler_roles`. Pre-launch policy applies:
versions stay `1`, the change is verified on a disposable database, and no
legacy-shape reader is kept.

The UI labels this **robots policy**: what robots.txt permits. It is not
proof that a crawler can retrieve the page. Observed logs (A2) and Site
Health findings are separate evidence of actual access.

### A1.3 robots.txt history as an observation sequence

- Add a table `robots_snapshots` with `id`, `workspace_id`, `project_id`,
  `origin`, `content_hash`, `body` (bounded by config
  `robots_snapshot_max_bytes`, default 512 KiB, with truncation recorded)
  and `status_code`.
  - It is unique on `(workspace_id, project_id, origin, content_hash)`.
  - Inserts use `ON CONFLICT DO NOTHING`; rows are append-only.
- `site_crawls.robots_snapshot_id` (composite workspace FK) makes each crawl
  an observation. No second history table is needed.
- Add `GET /api/v1/projects/{project_id}/site-health/robots-history`
  (family `site-health`, keyset-paged).
  - It returns the observation sequence: crawl ID, observed time, robots
    fetch status, snapshot ID and per-bot `policy`.
  - It also returns the distinct snapshot bodies those observations
    reference.
  - A → B → A appears as three observations.
- The browser computes the line diff between two bodies. This is
  presentation only.

### A1.4 UI

- The Site Health crawler panel ([site-facts-panel.tsx](../../frontend/components/site-health/site-facts-panel.tsx))
  becomes a table grouped by purpose. Columns are bot, operator, matched
  group, root access and policy (with "n of m known URLs disallowed"). A
  purpose filter is included. "Not specified" shows for `no_rules`, and
  `unknown` gets its own explanation.
- A **robots.txt history** disclosure shows the observation sequence and a
  two-version diff. Use shared table, badge and disclosure components.
- **Ask agent** uses the existing handoff codec.

### A1.5 MCP and Agent

- Add `read_ai_crawlability({ project_id })`. It returns the latest crawl's
  per-bot facts, robots status, snapshot ID and catalog version, or
  `unavailable('no_site_crawl')`.
- Add `crawlability` to the `get_project_business_context` sections.
- Regenerate the MCP tool reference.

### A1 coverage

- Policy decision table with fixtures:
  - allow exceptions under `Disallow: /`;
  - repeated groups for one token;
  - wildcard fallback;
  - root-only restriction;
  - a `Disallow` fully overridden by `Allow`;
  - unreadable robots.
- Catalog loader validation, including robots-only tokens never matching
  logs.
- Snapshot dedupe with an A → B → A observation sequence, and workspace
  isolation of the history read (real PostgreSQL).
- MCP returns `unavailable` without a crawl.
- The panel renders every policy and "Not specified" with accessible
  labelling.

### A1 docs

[site-health.md](../site-health.md), [mcp.md](../mcp.md), public
`frontend/apps/docs/src/content/site-health.md`.

---

## PR A2 — Crawl Logs and the AI Traffic screen

**Outcome:**

- Customers connect a log source, and CiteLadder keeps only
  catalog-recognized automated requests, with explicit coverage and
  verification.
- `/ai-traffic` replaces `/ai-referrals`. Its tabs are Overview, Crawlers,
  Referrals (the existing referral measurements, moved) and Activity.
- MCP serves the crawl projections.

### A2.0 Replacement inventory: AI Referrals surface

Remove or rename every reference to the old surface and verify by search
afterwards. The referral **data owner** (`referrals/*` tasks, tables,
config and `analytics/ai-referrals.ts` reader) is kept.

| Kind | References |
|---|---|
| API | Route family `ai-referrals` in [route-ownership.ts](../../frontend/packages/contracts/src/route-ownership.ts); `routes/ai-referrals.ts`; `routes/index.ts` |
| Contracts | `contracts/src/ai-referrals.ts` moves into `contracts/src/ai-traffic.ts`; `contracts/src/index.ts` |
| Browser | `lib/api/ai-referrals.ts`, `lib/api/query-keys/ai-referrals.ts`, `lib/api/query-keys.ts`, `lib/ai-referrals/*`, `lib/format.ts`, `lib/navigation/route-prefetch.ts`, `components/ai-referrals/*` |
| Shell and routing | `components/layout/nav-items.ts`, `components/layout/page-titles.ts`, `apps/app/src/router.tsx`, `apps/app/src/product-routes-prompts-commerce-referrals.tsx`, `apps/app/src/app.css` (`@source`), `apps/app/server-proxy.test.ts` |
| Marketing host routing | The app-path lists in `apps/marketing/src/apex-route.ts` and `apps/marketing/src/pages/robots.txt.ts`. These are routing lists, not copy |
| Architecture gate | `scripts/check-frontend-architecture.mjs` |
| Docs | `docs/frontend-architecture.md`, `docs/integrations-traffic-analytics.md`, public `apps/docs/src/content/performance.md` and its AI Referrals page |

Tests for retired routes move to the new routes. They are not deleted
without replacement coverage.

### A2.1 Schema

All tables are workspace-scoped with composite `(workspace_id, …)` FKs.

| Table | Purpose and key columns |
|---|---|
| `crawl_log_sources` | One source per project and host: `kind` (`webhook` / `upload`), `setup` (`cloudflare_worker` / `cloudflare_logpush` / `custom` / `upload`), `preset`, `collection_point`, `sampling` (`none` / `sampled` with rate / `filtered` with description), `origin`, `accepted_hosts`, `token_hash` and `token_prefix` (webhook), `status` (`active` / `revoked`), `created_by_member_id`, `revoked_at`. A partial unique index enforces one active webhook per host |
| `crawl_log_uploads` | Durable upload state: `source_id`, `filename`, `size_bytes`, `status` (`open` / `completed` / `abandoned` / `unsupported_format`), `missing_fields`, `last_ack_seq`, client-reported `scanned_lines`, `first_line_at`, `last_line_at` and `scanned_dates` (all labelled client-reported), `completed_at` |
| `crawl_log_batches` | Append-only receipt: `source_id`, `upload_id` (nullable), `seq` (uploads), `idempotency_key` (unique per source), `received_at`, `format`, `parser_version`, `catalog_version`, `lines_received`, `lines_parsed`, `lines_matched`, `lines_unmatched`, `lines_out_of_scope`, `lines_rejected`, `lines_duplicate`, `lines_overlapping`, `first_line_at`, `last_line_at`, `heartbeat` (empty batch) |
| `bot_requests` | Append-only sanitized observations: `project_id`, `source_id`, `batch_id`, `occurred_at`, `host`, `display_path`, `identity` (`exact` / `non_joinable`), `url_hash` (null when non-joinable), `folder` (first `folder_depth` segments), `resource_class`, `method`, `status_code`, `bot_id`, `catalog_version`, `verification`, `verification_reason`, `verification_basis`, `ip_range_snapshot_id`, `provider_request_id` (nullable), `line_hash`. Unique `(project_id, host, provider_request_id)` where present, otherwise `(source_id, line_hash)` |
| `bot_activity_daily` | Derived rollup at grain project × `reporting_date` × `reporting_timezone` × bot × identity (`url_hash`, or `folder` + `resource_class` for non-joinable rows) × `verification` × `status_code`. Holds `requests`, `first_seen_at`, `last_seen_at`, `formula_version` and bounded `source_batch_ids`. Exact status codes are kept, because 403, 404 and 429 need different actions after raw rows expire |
| `crawl_log_coverage_daily` | Derived per source × `reporting_date`: `coverage`, `reason`, batch and heartbeat counts, `max_gap_minutes` |
| `bot_ip_range_snapshots` | Platform reference data (no workspace), append-only: `bot_id`, `source_url`, `fetched_at`, `content_hash`, parsed `cidrs`, `status` |

Client IPs, request bodies, cookies, query strings, auth headers and full
user agents are never persisted.

### A2.2 Config: `frontend/services/api/src/config/crawl-logs.json`

- **Formats:** `ndjson`, `json_array` and `combined` (Apache/Nginx
  Combined). Add `csv` only if the shared field-mapping layer makes it
  trivial.
  - Plain Common Log Format has no user agent and is not accepted.
  - Field availability is validated, not inferred from format names. A file
    or batch lacking `user_agent`, `path` or `timestamp` is
    `unsupported_format` with `missing_fields`, and the copy reads "This log
    format does not contain the fields needed for crawler identification."
    It never becomes zero requests.
- **Presets** are field mappings (`timestamp`, `host`, `path`, `method`,
  `status`, `user_agent`, `client_ip`, `request_id`) with default
  `collection_point` and `sampling`:
  - `custom_ndjson`;
  - `cloudflare_logpush_http_requests` (`request_id` from the Ray ID);
  - `cloudflare_worker_template`.

  Verify field names against provider docs at implementation time.
- **Bounds:** `max_batch_bytes` (compressed and decompressed),
  `max_lines_per_batch`, `max_line_bytes`, `max_sources_per_project`,
  `batches_per_source_per_hour`, `accepted_lines_per_project_per_day`,
  `max_clock_skew_hours`, `max_backdate_days`.
  - `max_backdate_days` must stay below `retention_days` minus
    `rollup_freeze_margin_days`; the loader rejects otherwise.
- **Secret path patterns** for redaction: signed-URL parameters embedded in
  paths, reset and magic-link segments, session-ID segments.
- **Other settings:** `folder_depth`, `retention_days` (default 90),
  `rollup_freeze_margin_days`, `refresh_delay_seconds`,
  `max_delivery_gap_minutes`, `ip_range_refresh_hours`,
  `ip_range_max_age_hours`, `ip_range_contemporaneous_hours`, the default
  verification filter, `upload_abandon_hours` and `ingestion_enabled`.

### A2.3 Ingestion pipeline

Create one module, `frontend/services/api/src/crawl-logs/ingest.ts`, used by
every path:

1. Check the quota (`usage_windows`), bound the body, then decompress with a
   decompressed-size bound.
2. Validate field availability for the source's format and preset. Parse
   each line and record `parser_version`. Rejected lines are counted only.
3. Match the user agent against catalog `ua_patterns`. A line with no match
   is counted as `lines_unmatched` and discarded.
4. Check host scope. Out-of-scope lines are counted and discarded.
5. Check overlap. Lines whose reporting day is already covered by another
   source of the same host are counted as `lines_overlapping` and discarded.
6. Verify identity against the latest `bot_ip_range_snapshots` row for the
   bot. Record status, reason and basis (the verification vocabulary in the
   shared foundations) and the snapshot ID,
   then drop the IP.
7. Build the URL identity per the contract: display path, `exact` or
   `non_joinable`, folder and resource class.
8. Compute request identity: `provider_request_id` when the preset supplies
   it; otherwise `line_hash` over the source ID plus mapped
   pre-sanitization fields. Byte-identical repeats without a request ID
   collapse; this limitation is documented.
9. In **one transaction**:
   - insert the batch receipt (a repeated idempotency key returns the
     original receipt);
   - insert the `bot_requests` rows (conflicts are counted as duplicates);
   - enqueue `crawl_log_rollup_refresh` with
     `not_before = now + refresh_delay_seconds` and a per-project coalescing
     key.

   A crash after commit therefore cannot lose the refresh.

Steps 1–8 are CPU-bound and bounded, with no network I/O, so they run in the
request.

### A2.4 Ingestion paths

- **Webhook.** `POST /api/v1/crawl-logs/ingest/{source_id}`, route family
  `crawl-log-ingest`.
  - Uses `authorize: 'public'` and `raw: true` with
    `Authorization: Bearer <token>`. The token is looked up by hash and
    compared in constant time.
  - `Idempotency-Key` header is optional; it defaults to the SHA-256 of the
    body. Empty bodies are accepted as heartbeats.
  - Responses: `202` with counts, `401`, `409` (revoked), `413`, `415`,
    `422` (`unsupported_format` with missing fields) and `429` with
    `Retry-After`.
  - The Workers ingress manifest classifies the endpoint like the billing
    webhook.
  - Bodies and IPs are never logged.
- **Upload.** Session-authenticated routes in family `crawl-logs`:
  1. Create:
     `POST .../projects/{project_id}/crawl-logs/sources/{source_id}/uploads`
     returns `upload_id`.
  2. Send batches:
     `POST .../uploads/{upload_id}/batches {seq, lines[]}`, with
     idempotency key `upload_id:seq`.
  3. Complete:
     `POST .../uploads/{upload_id}/complete {scanned_lines, first_line_at, last_line_at, scanned_dates}`.
     This works even when zero lines matched, so a scanned file without bots
     still records client-reported coverage.

  The browser and server behavior:
  - The browser streams the file, decompresses `.gz` with
    `DecompressionStream` and validates required fields on a header sample
    before sending anything.
  - It pre-filters lines with the catalog's UA patterns from
    `GET .../crawl-logs/catalog`, posts bounded batches with progress, and
    resumes from `last_ack_seq`.
  - An open upload untouched for `upload_abandon_hours` becomes
    `abandoned`. Its accepted rows remain, and its coverage stays `partial`.
  - The server re-applies the full pipeline. Client filtering is a privacy
    measure, never a trust boundary.
- **Cloudflare Worker template.** Check in
  `frontend/apps/docs/public/templates/citeladder-crawl-log-worker.js`.
  - It forwards **per request**, best-effort:
    - it captures the actual response status after `fetch(request)`;
    - when the UA matches, it sends one event with
      `ctx.waitUntil(fetch(ingest, { signal: AbortSignal.timeout(...) }))`;
    - it checks the ingestion response and records non-2xx responses with
      `console.error` for Workers logs.
  - It never alters or delays the visitor response. It reads the token from
    a Worker secret.
  - It does not claim batching or durability. Cloudflare cancels unfinished
    `waitUntil` work after about 30 seconds.
  - The docs state that every routed request counts toward the customer's
    Workers quota. They tell the customer to set the route to **fail open**,
    and say that reliable delivery means Logpush or a shipper.
  - Coverage from this setup is at most `partial`.
  - Acceptance includes a test harness with a mocked `fetch`: a real status
    is captured, a timeout is bounded, a non-2xx ingest response is
    surfaced, and the visitor response is unchanged on ingest failure.

### A2.5 Source management (Owner/Admin)

Routes in family `crawl-logs`, under
`/api/v1/projects/{project_id}/crawl-logs/sources`:

- Create, with the setup kind and its default collection point and
  sampling; the customer may correct sampling.
- List, rotate the token, and revoke. Revocation keeps history and frees the
  host for a new live source.
- The token is 32 random bytes with the prefix `clw_`. It is returned once,
  and rotation invalidates the old token immediately.
- Writes append security events through the existing owner.

**Connect crawl logs** (from AI Traffic Overview, and a section in
`/settings?tab=integrations`):

- Opens a setup chooser with four cards: Cloudflare Worker, Cloudflare
  Logpush, Custom webhook, Upload file.
- Each card shows its setup steps, the copyable endpoint and token, its
  delivery guarantee and the coverage it can reach.

**Diagnostics** per source:

- collection point;
- sampling;
- last accepted batch;
- last processing;
- rejected and overlapping batches;
- unsupported-format results;
- coverage per day, with gaps.

### A2.6 Workers and tasks (analytics worker)

- **`crawl_log_rollup_refresh`.**
  - Takes the project's rollup lock (row lock on a per-project state row)
    and recomputes the affected reporting dates from committed
    `bot_requests` in one transaction. It also recomputes
    `crawl_log_coverage_daily`.
  - Because it always recomputes from current committed rows under the lock,
    an older refresh can never overwrite newer totals.
  - It never rebuilds a date older than
    `retention_days − rollup_freeze_margin_days`; those rollups are frozen.
  - It then enqueues `ai_traffic_insights_refresh` (A3), coalesced.
- **`bot_ip_range_refresh`.**
  - A platform tick on `ip_range_refresh_hours`. Per catalog bot with
    `ip_ranges`, it commits the dispatch and then fetches with the shared
    safe fetcher and bounds.
  - It appends a parsed snapshot. On failure it appends a `failed` row.
  - Ingest treats a snapshot older than `ip_range_max_age_hours` as
    `stale_snapshot`.
- **`bot_request_retention_sweep`.**
  - Deletes `bot_requests` older than `retention_days` in bounded batches,
    following [referrals/retention.ts](../../frontend/services/api/src/referrals/retention.ts).
  - Rollups, coverage, receipts and uploads remain.
- **`crawl_log_upload_abandon_sweep`.** Marks stale open uploads
  `abandoned`.

### A2.7 AI Traffic API (family `ai-traffic`; persisted reads only)

| Endpoint | Returns |
|---|---|
| `GET .../ai-traffic/overview?range=` | Per-signal blocks with separate units. **Crawl:** connection, coverage summary, recognized requests, pages, active bots, error share (all under the verification filter), series by purpose. **Referrals:** the current AI Referrals measurements (volume, share, sources), moved. **Citations:** tracked-citation count from the latest audits in range, labelled "observed in CiteLadder's tracked answers" |
| `GET .../ai-traffic/crawlers?range=&purpose=&verification=` | Per bot: requests, pages, last seen, status-code breakdown, verification split with reasons |
| `GET .../ai-traffic/referrals?range=&granularity=` | Today's AI Referrals response contract, moved unchanged in A2 |
| `GET .../ai-traffic/activity?bot_id=&status=&folder=&resource_class=&cursor=` | Sanitized `bot_requests`, newest first, within retention |
| `GET .../ai-traffic/coverage?range=` | Per source and day: coverage and diagnostics |
| `GET .../ai-traffic/{crawlers,activity}/export` | CSV through `table-export.ts`, with the same filters and privacy as the UI |

Contracts live in `frontend/packages/contracts/src/ai-traffic.ts`.

### A2.8 UI: `/ai-traffic`

- Add an **AI Traffic** nav item in the `Track` group, replacing AI
  Referrals. Add its page title, route prefetch and URL tab state with the
  existing `url-state` codecs.
- **Overview.** Two signal panels, **Crawlers** and **AI referrals**, plus a
  tracked-citations tile.
  - Each panel shows its own units, coverage badge and freshness.
  - Each panel's empty state carries its connect action: **Connect crawl
    logs** or **Connect GA4**. The GA4 action uses the existing integrations
    flow.
  - No cross-unit ratio is shown.
- **Crawlers.** A bot table with a purpose filter, a verification filter
  and a folder and resource-class breakdown.
- **Referrals.** The existing AI Referrals dashboard, moved, with its range
  and granularity controls kept.
- **Activity.** A filtered stream with export.
- **Pages.** Added by A3.
- **States.** `not_connected`, `awaiting_data`, partial coverage ("Coverage
  is incomplete…") and measured zero (complete coverage only) each render
  distinctly.

### A2.9 MCP and Agent

- `read_crawl_logs({ project_id, view: 'summary' | 'crawlers' | 'coverage', range, start_date, end_date, verification, cursor, limit })`.
- `list_bot_requests({ project_id, bot_id, status, folder, resource_class, cursor, limit })`.
- Add `crawl_logs` to the business-context sections.
- `read_ai_referrals` is unchanged.
- Regenerate the tool reference.
- If `technical_health` should use the new tools, edit its `SKILL.md` and
  validate it with the skill loader tests.

### A2 coverage (real PostgreSQL where persistence is involved)

- **Formats.** NDJSON, JSON array and Combined parse correctly. CLF and
  files missing fields give `unsupported_format`, never zero. Oversized
  lines, clock skew and backdating are bounded.
- **Pipeline.**
  - Unmatched lines leave no row.
  - Out-of-scope and overlapping lines are discarded and counted.
  - Secret segments are redacted, the row is non-joinable, and two distinct
    public UUID pages keep distinct hashes.
  - Every verification status, reason and basis is recorded, and no IP is
    persisted.
  - Request-ID dedupe works across an upload and a live source.
- **Webhook.** Wrong or revoked token is refused. Idempotent replay adds no
  rows. A heartbeat counts toward coverage. Quota returns `429`. A
  decompression bomb is rejected. A token can never write another project.
- **Uploads.** Resume and replay are idempotent. A zero-match completion
  records client-reported coverage. Abandonment works. The server
  re-filters client-sent unmatched lines.
- **Durability and concurrency.**
  - The refresh is enqueued in the receipt transaction.
  - Two concurrent refreshes converge to the totals of the committed rows.
  - Frozen dates are never rebuilt after retention deletes raw rows.
- **Coverage.** `complete` requires a gap-free unsampled live day. The
  Worker setup tops out at `partial`. A zero renders only under
  `complete` / `declared_complete`.
- **Verification filter.** Applied consistently to requests, pages, active
  bots and error denominators.
- **Replacement.** No `ai-referrals` route, nav item or client remains, and
  referral measurements render under `/ai-traffic` Referrals.
- **UI.** Each state renders distinctly; tab URL state; accessible tables;
  export respects filters.
- **Worker template.** The mocked-`fetch` harness from A2.4.

### A2 docs

- New owner doc `docs/ai-traffic.md`, registered in the
  [index](../README.md), replacing the AI Referrals section's UI ownership
  in [integrations-traffic-analytics.md](../integrations-traffic-analytics.md).
  Referral data ownership stays there.
- [frontend-architecture.md](../frontend-architecture.md) route table and
  [mcp.md](../mcp.md).
- Public docs: an `ai-traffic.md` page replaces the AI Referrals page. It
  covers per-setup guides, coverage meanings, the Worker's best-effort
  limits and the fail-open route setting.

---

## PR A3 — GA4 contract, the Pages join, comparisons and insights

**Outcome:**

- GA4 evidence becomes host-scoped, timezone-aware, quality-flagged and
  revision-correct.
- AI Traffic gains the combined **Pages** table and URL panel, landing pages
  with key events, an AI-versus-other-channels comparison, observed crawl
  coverage of known pages, persisted insights, and the matching MCP reads.

### A3.1 GA4 extract contract (integration owner; narrow extensions)

These are shared integration-owner changes. Inventory every reader that
selects the latest `resync_seq` (`traffic/*`, `referrals/*`,
`demand/query-evidence.ts`, `integrations/projections.ts`) before changing
semantics.

1. **Host scope.** Add `hostName` to `ga4_landing_daily`'s dimensions.
   - Traffic (Performance landing fold) and referral folds keep only hosts
     in the project scope; excluded rows are counted.
   - `ga4_source_medium_daily` and `ga4_channel_daily` stay property-wide
     and are labelled "property-wide" wherever shown.
   - This is a dataset-grain change under pre-launch reset policy.
2. **Timezone and currency.** Capture the property `timeZone` and
   `currencyCode` from report response metadata on each import artifact.
   The latest values are exposed on the mapping, and the timezone becomes
   the project's reporting timezone.
3. **Quality metadata.** Persist `subjectToThresholding`,
   `dataLossFromOtherRow` and sampling metadata per artifact. Projections
   carry an `analytics_quality` flag set. A row absent from a quality-flagged
   or failed extract is never an observed zero.
4. **Partition replacement.** Define a partition as
   (`project`, `property_ref`, `provider`, `dataset`, `date`).
   - Readers select the latest `resync_seq` **whose run completed that
     partition untruncated**, and only that revision's rows. A row that
     disappears from a newer successful extract no longer contributes its
     old value.
   - Incomplete or failed partitions fall back to the prior complete
     revision and are flagged.
   - This fixes existing Performance, Demand and AI Referrals readers too.
     Their tests must cover the disappearing-row case.
5. **Attribution fields.** Confirm and document that every referral fold
   uses session-scoped `sessionSource` / `sessionMedium`, never first-user or
   event-scoped attribution.

Where a field is missing, extend the existing sync narrowly. Never invent
values or create a parallel integration.

### A3.2 Landing pages, key events and channel comparison

- **Rollup.** The referral refresh persists `ai_referral_landing_daily`:
  - Columns: `project_id`, `reporting_date`, `reporting_timezone`,
    `url_hash`, `canonical_url`, `ai_source`, `sessions`,
    `engaged_sessions`, `key_events`, `analytics_quality`,
    `source_metric_row_ids`, `formula_version`.
  - It uses the existing `classifyReferralSignals` rules and A3.1 partition
    selection.
  - Unresolvable landing pages are counted as `unattributed_landing`.
- **Per-source measures.** Key events per source; transactions and purchase
  revenue per source in the property currency, labelled as such.
- **Naming.** These are **key events as configured in the customer's GA4**,
  never "conversions".
- **No invented rates.** Do not compute `key_events / sessions` as a rate.
  If a rate is wanted, sync GA4's own `sessionKeyEventRate` and keep it
  non-additive. The first release shows counts plus engagement rate
  (`engaged_sessions / sessions`, GA4's definition).
- **Channel comparison.** From `ga4_channel_daily` plus classified AI
  sessions, compare AI referrals with Organic Search and all other sessions:
  sessions, engagement rate and key events. It is property-wide and
  labelled as such.
- **Referrals tab.** Becomes Overview | Sources | Landing pages. Performance
  keeps its combined organic + AI landing fold, now host-scoped.

### A3.3 Pages: the per-URL join

- **List.** `GET .../ai-traffic/pages?range=&folder=&resource_class=&verification=&sort=&cursor=`
  - Each leg is **aggregated to `url_hash` first** (separate CTEs), then
    joined, so multiple bots, sources or citations never multiply counts.
  - Legs:
    - crawler requests, last crawl, and 4xx and 5xx counts under the
      verification filter (`bot_activity_daily`);
    - AI referral sessions and key events (`ai_referral_landing_daily`);
    - tracked citations in range (citations by `url_hash`, project-scoped);
    - open Site Health findings (latest terminal crawl).
  - Each leg carries its own state: `not_connected`, coverage, zero or
    value.
  - A timezone mismatch makes the crawl and referral legs `non_comparable`.
  - Non-joinable crawler rows appear only as folder aggregates and are
    excluded from page rows.
- **Detail.** `GET .../ai-traffic/pages/{url_hash}` returns a timeline: per
  bot first and last crawl, per source first referral, citation dates, plus
  provenance.
- **Export.** CSV through `table-export.ts` with the same filters.
- **Observed crawl coverage of known pages.** For the latest terminal Site
  Health inventory, report the share of known URLs requested by any
  `ai_search` or `ai_user_fetch` bot in range. Show the inventory date and
  limits, and label it "observed crawl coverage", never indexing coverage.
  It is available only on `complete` / `declared_complete` crawl coverage.
- **Read-only.** Reads look up and aggregate persisted projections only
  (invariant 6).
- **UI.**
  - A **Pages** tab with a sortable, paged table and folder and
    resource-class filters.
  - A shared URL panel (`frontend/components/ai-traffic/url-panel.tsx`)
    opens from Pages, Referrals → Landing pages, Crawlers drill-downs and
    Site Health page detail.
  - Units stay separate and each leg links to its owning view.

### A3.4 Persisted insights

- **Task.** `ai_traffic_insights_refresh` is coalesced and debounced. It
  writes one `ai_traffic_insights` snapshot per preset window, with
  `formula_version`, thresholds from `config/ai-traffic.json`, and the
  source rollup, audit and crawl IDs it read.
- **Triggers.** It is enqueued from the transactions that already
  terminalize:
  - crawl-log rollup refresh;
  - referral refresh;
  - Visibility audit completion (citations);
  - Site Health terminalization;
  - source coverage or mapping changes.
- **Patterns.** Each lists bounded `url_hash` sets, numbers and the
  coverage it relied on:

  | Pattern | Fires only when |
  |---|---|
  | `crawled_without_referrals` | Crawl coverage is `complete`/`declared_complete` and the GA4 partitions are complete and unflagged for the whole window; the URL has ≥ N verified `ai_search`/`ai_user_fetch` requests and 0 AI referral sessions |
  | `referrals_without_recent_crawl` | Crawl coverage is complete for the whole window; the URL has ≥ N AI referral sessions and 0 recognized AI requests |
  | `crawler_errors_on_valuable_pages` | Verified requests with status ≥ 400 (grouped by exact code: 403, 404, 429, 5xx) on URLs with tracked citations, referrals or key events |
  | `key_event_concentration` | The top K URLs carry ≥ X% of AI-referral key events (complete GA4 partitions only) |

- **Copy.** States co-occurrence, never causation. Zero sessions read "no
  identifiable AI referrals", because AI apps often strip referrers.
  Incomplete coverage shows the coverage notice instead of the insight.
- **Placement.** An insight strip on Overview links to filtered Pages views
  and the URL panel.

### A3.5 MCP and Agent

- `read_ai_traffic_pages({ project_id, range, folder, resource_class, sort, cursor, limit })`.
- `read_ai_traffic_url({ project_id, url })`. It canonicalizes the URL with
  `canonicalPage` and refuses off-origin URLs.
- `read_ai_traffic_insights({ project_id, range })`.
- `read_ai_referrals` gains key events per source, landing pages, quality
  flags and the channel comparison.
- Regenerate the tool reference. Opportunity creation from insights remains
  a later, separately assigned change.

### A3 coverage

- **GA4 contract.**
  - Host filtering, including excluded-host counts.
  - Timezone and currency capture.
  - A quality-flagged extract never yields a zero.
  - **Disappearing-row partition replacement** in the Traffic, Demand and
    Referrals readers.
  - A failed partition falls back to the prior revision and is flagged.
  - Session-scoped attribution fields.
- **Landing rollup.** Classification, unattributed counts and workspace
  isolation.
- **Metric naming.** Key events are never labelled conversions, and no
  `key_events / sessions` rate is shown.
- **Join.**
  - No count multiplication with several bots × sources × citations.
  - Every leg state.
  - `non_comparable` on timezone mismatch.
  - Non-joinable rows stay out of page rows.
  - The cursor binds window, filters and sort.
- **Identity.** The `canonicalPage` and `canonicalIdentity` hashes agree.
- **Observed crawl coverage** is gated on complete coverage.
- **Insights.**
  - Each pattern fires only under its preconditions and never on partial
    coverage or flagged GA4 data.
  - Citation and Site Health changes re-trigger the refresh.
- **MCP** refuses foreign projects and off-origin URLs.
- **UI.** Pages filters, URL panel leg states, insight-strip coverage notice,
  export.

### A3 docs

- [integrations-traffic-analytics.md](../integrations-traffic-analytics.md):
  host scope, timezone, quality and partition replacement.
- `docs/ai-traffic.md`: Pages, comparisons and insights.
- [mcp.md](../mcp.md) and the public `ai-traffic.md`.

---

## Part A validation (per PR)

- While iterating, run the smallest native suites for the changed owner.
- Each PR changes schema, contracts and authorization, so run
  `./scripts/check.ps1` once when the executable diff is complete.
- `node scripts/quality.mjs --mode check --scope backend|frontend` for the
  LOC, dead-code and architecture gates.
- Verify schema only on a disposable database: `alembic upgrade head`,
  `alembic check` and `pnpm --filter api db:types:check`. Never reset the
  shared development database.
- CI owns the full suites, builds and E2E.

## Deferred beyond Part A

- A Cloudflare API-token connection in which CiteLadder deploys the Worker.
  This is an external mutation that needs its own authorization.
- A durable Worker variant using Cloudflare Queues.
- Google Cloud CDN Logging sink, AWS CloudFront and Akamai; more shipper
  presets on demand.
- Reverse-DNS verification (forward-confirmed) for operators that publish no
  IP ranges.
- Device and geography breakdowns, first-party session tracking and
  real-time streaming.
- Opportunities generated from insights.

---

# Part B — Authorized crawl and domain verification

Status: queued after Part A and separately authorized. It must not delay
Part A. It builds on the robots policy shipped with audit remediation PR 2
(see the
[Site Health table](../site-health.md#acquisition-and-evidence-guarantees))
and on the owned-site authority receipts that
[audit remediation](citeladder-audit-remediation.md) Section 4 still
requires.

The customer-facing Terms wording below is a draft for Cube27 legal review.
Do not publish it, and do not enable authorized crawling in production, until
that review approves it.

## Problem

Site Health honors robots.txt for every crawl. That is right for third-party
and competitor domains. A customer auditing its own site, however, may
deliberately disallow generic bots and still want CiteLadder to analyze the
excluded pages. Today the only remedy is for the customer to edit robots.txt.

Authorized crawl answers "may CiteLadder inspect this website?". Part A
answers "what does robots.txt permit AI crawlers, and what do they actually
request?". The two are independent: a log source never implies crawl
authorization, and authorization never implies log access.

## Crawl modes

| Condition | Standard | Authorized |
|---|---|---|
| robots allows | Crawl | Crawl |
| robots disallows | Do not crawl | Crawl |
| robots missing (404/410, empty) | Crawl | Crawl |
| robots unreachable (429/5xx/network) | Temporary pause, recheck | May continue under pacing |
| robots.txt 401/403 | `access_blocked` | Continue; robots.txt access is not page access |
| Page 401/403 | Terminal failure | Stop that URL as `access_blocked`; ask the customer to configure access |
| Page 429 | Back off | Back off |
| CAPTCHA, WAF challenge, login wall, paywall | Never circumvent | Never circumvent |

Authorized mode changes only how robots directives are applied. It never
adds credentials, cookies, header spoofing, challenge solving, higher rate
limits or an alternative user agent. Host pacing, concurrency, admission,
SSRF controls, durable suppression and the platform kill switch apply
unchanged. Operator suppression (`scripts.acquisition_control`) always
overrides authorization.

Authorization never applies to competitor, source-page or earned-source
acquisition, which always use Standard mode.

The fetcher checks every destination request, including each redirect hop,
against the grant's verified scope before network I/O, alongside the
existing SSRF and DNS-pinning checks. A redirect that leaves the scope falls
back to Standard robots handling for that hop and never inherits the
authorization.

## Authorization paths and scope

Scope equals demonstrated control. Each grant records the exact scope its
method established:

| Method | Scope established |
|---|---|
| DNS TXT (`citeladder-verification=<token>`) at the registrable domain | The registrable domain; subdomains only if the customer opts in on the grant |
| DNS TXT at a subdomain | That subdomain, and its children only by opt-in |
| HTML file at a well-known path, or `<meta>` tag on the root page | Exactly the host that served it. Never its parent or siblings |
| Attestation (Owner/Admin) | The project's configured host only, shown as unverified |

- **Verification.** It is an explicit user command that commits a pending
  challenge, then performs bounded network I/O. Reads only render persisted
  state.
- **Re-verification** runs on a config-owned schedule. A failed
  re-verification downgrades the grant to Standard and records why.
- **Attestation wording.** "I confirm that I own this website or have
  authorization from the website owner to crawl and analyze it."
- **Connected infrastructure is not verification.** Evidence of control from
  connected infrastructure is deferred with the Cloudflare API-token
  connection. A Part A webhook token proves possession of a token, not
  control of the domain.

Every grant, verification, downgrade and revocation is an append-only
receipt. It records workspace, project, scope, method, actor, timestamp,
authorization/terms version, and bounded request metadata (IP and session
identifiers).

- Reuse the PR 1 policy-acceptance and security-event owners.
- Authorization is workspace-scoped, never `user_id`-scoped.

**Frozen provenance is not frozen permission.** A crawl records the receipt
it started under, so its results keep their provenance. Before **each**
robots-excluded fetch, the fetcher rechecks live state: grant not revoked or
downgraded, no suppression, kill switch off. A revocation or downgrade
mid-crawl stops further robots-excluded fetches immediately. The rest of the
crawl continues in Standard mode.

## Product surface

Website → crawl settings:

- **Crawl authorization:**
  - Standard: follow the website's robots.txt.
  - Authorized: "I own this website or have permission from its owner to
    crawl it."
- Beneath it: "When authorized, CiteLadder may crawl pages excluded by
  robots.txt for Site Health analysis. Authentication, firewall restrictions,
  CAPTCHAs and rate limits are never bypassed."
- Status chip: *Domain verified*, *Host verified*, *Authorized (attested)*
  or *Standard*, with the verified scope shown.
- Name the setting "Authorized crawl", never "Ignore robots.txt".
- Crawl results distinguish "excluded by robots, crawled under
  authorization" from ordinary pages. They show `access_blocked` URLs with
  guidance to allow the crawler.

## Implementation order

1. Authorization receipts with method-derived scope, domain and host
   verification (DNS TXT, file, meta) and attestation, under existing
   owners.
2. A crawl-policy decision function over (mode, robots result, page status,
   live grant state), with the per-fetch live recheck. Site Health discover
   and analyze consume it. Page-level 401/403 is classified as
   `access_blocked`.
3. Settings UI, status chips and result presentation.

## Required coverage

- Decision table: every mode × robots result × page status cell, including
  challenges that are never circumvented.
- Scope:
  - a file or meta verification on `a.example.com` never authorizes
    `example.com` or `b.example.com`;
  - subdomain coverage only by opt-in on a domain-level TXT grant;
  - authorization is workspace-isolated and never targets competitor or
    source-page acquisition.
- Suppression and the kill switch override authorization.
- A redirect outside the verified scope is rejected, or handled under
  Standard rules, before any network I/O to it.
- Mid-crawl revocation, downgrade or suppression stops the next
  robots-excluded fetch, and the crawl keeps its original receipt as
  provenance.
- Verification commits before network I/O; reads never verify.

## Owner decisions to confirm before Part B

- Whether attestation alone may enable Authorized mode at launch, or only
  alongside a verification path. Plan default: attestation is allowed for
  the project's configured host; verification is preferred and badged. This
  is decided with the separate Part B assignment.
- Whether authorized crawls get different depth or page limits than Standard
  crawls. Rate limits stay identical in both modes.
- Final Terms wording, below, after legal review.

## Draft Terms provision (legal review required)

> **Customer-authorized crawling.** Where a customer enables authorized
> crawling, the customer represents that it owns the applicable website or has
> obtained sufficient authorization from the website owner to permit CiteLadder
> to access, crawl, and analyze the website. The customer is responsible for
> the scope and validity of that authorization. Authorized crawling may
> disregard crawler directives such as robots.txt where configured by the
> customer, but CiteLadder does not circumvent authentication mechanisms,
> access controls, CAPTCHAs, rate limits, or other technical security measures.
