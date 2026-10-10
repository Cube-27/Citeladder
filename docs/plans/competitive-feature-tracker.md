# Competitive feature tracker

Started 2026-10-10. Master record for closing the feature gaps found against
Peec AI, Searchable and Profound. High-level architecture for each feature, in
priority order, written so a coding agent can plan and ship each PR without
fresh web research. External facts are captured in the
[research appendix](#research-appendix) with their source URLs.

## How to use this document

- Bootstrap with `CLAUDE.md`, then the owner document named in each feature.
  `CLAUDE.md`, `docs/invariants.md` and the per-feature process in
  `docs/plans/feature-review-tracker.md` still govern. This tracker adds scope,
  not authority.
- One feature row = one or two PRs, as listed. Docs corrections are one PR (F1).
- Before coding a feature: write `docs/plans/<feature-slug>.md` from its section
  here (findings verified against current code, phases, acceptance criteria) and
  get the owner's answers to its **Owner decisions**. Decisions marked
  *(recommended)* may proceed on the recommendation if the owner says so.
- Inventory the existing owner before adding files (CLAUDE.md step 1). Paths
  below were verified on 2026-10-10; re-check them, the repo moves fast.
- Schema changes fold into `frontend/services/api/migrations/0001_baseline.sql`
  (invariant 17, pre-launch policy). If live customers exist when a PR lands,
  stop and ask the owner for the first post-baseline migration policy.
- Update this file's status table and log when a PR merges.
- **Per-PR plans (2026-10-10) supersede the feature sections below where they
  differ.** F2–F6 each have plan files (one per PR) linked from the status
  table, verified against the code with every owner decision settled.

## Status

Value rank = expected impact on customer value and competitive parity, highest
first. Size: S (≤2 days), M (≤1 week), L (>1 week).

| ID | Feature | Value | Size | PRs | Depends on | Status | Plan file |
|---|---|---|---|---|---|---|---|
| F1 | Docs truth pass: consumer surfaces and schedules | — (do first) | S | 1 | — | done | — |
| F2 | AI Traffic: enablement, `api.citeladder.com` host, AWS and GCP connectors | 1 | L | 2 | — | in review: F2a merged, F2b in review | [F2a](F2a-ai-traffic-api-host-and-aws.md), [F2b](F2b-ai-traffic-gcp-pull.md) |
| F3 | Sentiment (answer perception) | 2 | L | 1 | — | done | [F3](F3-answer-perception.md) |
| F4 | Public REST API, MCP move to `api.citeladder.com/mcp`, MCP write tools | 3 | L | 3 | F2a (host) | planned | [F4a](F4a-public-api-and-keys.md), [F4b](F4b-mcp-move-to-api-host.md), [F4c](F4c-mcp-write-tools.md) |
| F5 | Ads in AI answers | 4 | S–M | 1 | — | done | [F5](F5-ai-answer-ads.md) |
| F6 | Prompt grounding in the project's own search data | 5 | M | 1 | — | done | [F6](F6-prompt-grounding.md) |
| F7 | Market (location/language) segmentation | 6 | M–L | 1 | D7.x | queued | `market-segmentation.md` |
| F8 | Fact-checking against brand facts | 7 (gated) | M | 1 | F3, D8.1 | proposal | `fact-checking.md` |
| F9 | Enterprise SSO and SCIM (WorkOS) | 8 (last) | L | 1–2 | domain verification | proposal | `enterprise-identity.md` |

Out of scope by owner direction: agency reporting, white-label, Looker/Tableau
connectors (former item 11). Revisit only on owner request.

## Repository constraints every PR must respect

Verified against the repository on 2026-10-10.

- **Hosting is free tier.** Cloudflare Workers (free), scale-to-zero Cloud Run
  (us-central1), PostgreSQL on an e2-micro VM. Prefer batched, pull or buffered
  designs over one-request-per-event designs. Bound CPU per request.
- **Reads never call providers or models**, never crawl, sync, classify or
  repair. Derived results keep exact source IDs and processing versions.
- **PostgreSQL is the queue.** Leased tasks, `SKIP LOCKED`, commit before
  network I/O, idempotent terminal writes. No Redis.
- **Models classify bounded ambiguity only** (invariant 9): every model
  judgement stores confidence, model and template version, and never replaces a
  deterministic metric.
- **Explicit user decisions** (invariant 10) for prompt activation, external
  mutation, publishing, billing changes. F4 changes this wording; record it.
- **Unknown, unavailable, not applicable, observed zero** stay distinct in
  every metric, read, export, MCP tool and API response.
- **Config, not code** for tunables: `frontend/services/api/src/config/*.json`.
- **Route families** are declared in
  `frontend/packages/contracts/src/route-ownership.ts`; each operation declares
  one. OpenAPI is generated from route contracts (`src/openapi/document.ts`).
- **Ingress ownership** (docs/operations/WORKERS_RUNBOOK.md): machine endpoints
  (MCP, webhooks, crawl-log ingest) are apex-owned and forwarded by the
  marketing Worker with the origin token; browser APIs are app-owned
  same-origin `/api/v1`. **Decided (D4.1, D4.5):** machine endpoints move to a
  new `api.citeladder.com` host — public API at `/v1`, MCP at `/mcp`, crawl-log
  ingest at `/v1/crawl-logs/...`. F2-PR1 provisions the host; new machine
  endpoints go there and are listed in the runbook as **API-OWNED**.
- **Funding (D3.1, decided)**: model calls for perception (F3) and
  fact-checking (F8) are platform-funded through the default Agent gateway
  model (`src/models/gateway.ts`, `DEFAULT_AGENT_*` settings). No customer
  credit draw; bound cost with platform caps in config and record usage on
  every call. DataForSEO calls follow the Search Intelligence cost-ceiling pattern
  (estimate, receipt, recorded spend, uncertain submissions never resubmitted).
- **Tests earn their place** (the `principle-test-behavior-not-implementation` skill): decision paths,
  real PostgreSQL for persistence and concurrency, workspace isolation and
  provenance for new tables.

---

## F1. Docs truth pass: consumer surfaces and schedules

**Owner documents:** `docs/visibility-prompt.md` (behaviour is correct; public
copy is not), public site (`frontend/apps/marketing`, `frontend/lib/marketing-content`),
docs site (`frontend/apps/docs/src/content`).

### Finding

The product already collects consumer-app answers and runs scheduled audits,
but public copy says answers come only from provider APIs.

- Consumer surfaces shipped: `chatgpt_search` (ChatGPT Search via DataForSEO
  ChatGPT LLM Scraper, `web search` forced), `gemini_consumer` (Gemini web via
  DataForSEO Gemini LLM Scraper), Google AI Overview (DataForSEO Google organic
  SERP). See `src/config/providers.json` (`surface_kind: llm_scraper`,
  `search_ai`) and `src/config/dataforseo.json` (`scraper.products`).
- Scraper context today is US/English only (docs/visibility-prompt.md, "initial
  scraper context allowlist is US/English").
- Schedules shipped: `audit-schedules` route family, `src/audits/schedules.ts`,
  `src/workers/audit-scheduler.ts`, Runs page schedules list with pause reason
  and Resume.

### Files to change (verified)

| File | Current text | Change |
|---|---|---|
| `frontend/components/marketing/landing/landing-page.tsx` (`ENGINES`) | OpenAI API, Gemini API, Claude API, Google AI Overviews | ChatGPT (app and API), Gemini (app and API), Claude (API), Google AI Overviews. Keep the four logos. |
| `frontend/components/marketing/landing/landing-data.ts` (FAQ "Which AI engines…") | "collects answers … through each provider's API" | Name both methods: consumer-app answers collected through DataForSEO's scraper of the public web apps (US English today), and API answers through each provider's API. Keep "answers can differ from what a signed-in user sees". |
| `frontend/lib/marketing-content/platform-pages-measure.ts:135` | "API answers can differ from what a consumer app shows" | Same correction. |
| `frontend/lib/marketing-content/llms.ts:68-70` | ChatGPT (OpenAI API), Claude (Claude API), Gemini (Gemini API) | List six engines: ChatGPT Search (app), ChatGPT API, Gemini (app), Gemini API, Claude API, Google AI Overviews. |
| `frontend/apps/docs/src/content/visibility.md` | No engines or schedules section | Add "Engines and collection methods" table (engine, method, markets supported, what can differ) and "Schedule audits" section. |
| `frontend/apps/docs/src/content/prompts.md`, `quickstart.md` | Manual launch only | One line each pointing to schedules. |
| `frontend/apps/docs/src/content/changelog.md` | — | October entry: documentation now reflects consumer-app collection and schedules. |

Also check and correct: trial engine naming. Read `public_trial.engines` in
`src/config/entitlements.json` and name the exact surface the trial uses
("ChatGPT answers" may be the API engine or ChatGPT Search).

### Copy rules

- PRODUCT.md: marketing copy changes only on owner request. This row is that
  request (owner, 2026-10-10). Record it in the log.
- No claim that scraped answers equal what every user sees. Scraper sessions
  have their own market, account state and model choice.
- Scraper model reports are supplementary provenance (visibility-prompt.md);
  do not name a model version for consumer surfaces in public copy.

### Acceptance

- `grep -rn "through each provider's API"` in `frontend/` returns nothing.
- llms.txt output lists six engines; public route list and sitemap checks pass.
- Docs site builds; no broken internal links.
- Validation: copy/doc tier only (CLAUDE.md): `git diff --check`, reference
  checks, the docs/marketing build if a component changed.

---

## F2. AI Traffic: enablement, AWS and GCP connectors

**Owner documents:** `docs/ai-traffic.md` (crawl logs), `docs/integrations-traffic-analytics.md`
(GA4 referrals, unchanged), `docs/operations/WORKERS_RUNBOOK.md` (ingress),
`infra/gcp/identity.tf` (service accounts).
**PRs:** F2-PR1 enablement + AWS Firehose connector. F2-PR2 GCP Pub/Sub pull
connector.

### Current state (verified)

- Admission owner: `src/crawl-logs/ingest.ts` (`ingest`, `boundedBody`,
  `decodedBody`, `batchQuota`). Sources: `src/crawl-logs/sources.ts`
  (`setup: cloudflare_worker | cloudflare_logpush | custom | upload`,
  `kind: webhook | upload`). Routes: `src/routes/crawl-logs.ts`
  (`POST /api/v1/crawl-logs/ingest/{source_id}`, family `crawl-log-ingest`).
- Line formats and field mapping: `@citeladder/contracts/crawl-log-format`
  (`logLines`), presets in `src/config/crawl-logs.json`
  (`custom_ndjson`, `cloudflare_logpush_http_requests`,
  `cloudflare_worker_template`).
- Bot catalog with `catalog_version` and lowercase `ua_patterns` substrings:
  `src/config/crawlers.json` (13 bots, includes Googlebot and Bingbot).
- Worker template generated with a freshness check:
  `frontend/apps/docs/public/templates/citeladder-crawl-log-worker.js`.
- Limits: 5 MiB compressed and decompressed per batch, 5,000 lines, 16 KiB per
  line, 600 batches/source/hour, 1,000,000 accepted lines/project/day,
  `max_delivery_gap_minutes: 5`, 90-day raw retention (not an approved
  decision).
- `ingestion_enabled: false`. A development-operator workspace bypasses it
  (backlog "Operator gate in production" asks for an explicit entitlement).
- Coverage states: `complete`, `declared_complete`, `partial`, `unknown`.

### F2-PR1 part A: enablement

1. Add entitlement capability `crawl_logs` (boolean) and limit
   `crawl_log_sources` (count) to `src/config/entitlements.json`.
   **Decided (D2.1):** every paid workspace gets `crawl_logs` (all accounts are
   treated as enterprise for now); the public trial does not. Set the source
   limit to the existing `max_sources_per_project` (20) until the owner
   changes it. Replace the development-operator bypass with the capability
   check; set `ingestion_enabled: true` and keep it as the global kill switch.
   A trial workspace sees AI Traffic in its Referrals-first state with an
   upgrade explanation instead of connect buttons.
2. Apply decisions D2.2 (raw retention) and D2.3 (privacy/DPA wording for
   transient IP use and path hashes). Legal text lives under
   `frontend/lib/marketing-content/legal-*.ts`; change only the wording the
   owner approves.
3. Add a `stalled` source state (backlog item from the feature 8 review):
   set when a live source has had no accepted receipt for
   `stalled_after_hours` (config, default 24) or a pull source fails
   verification. Shown on the source row with the reason.
4. Add a daily per-project received-bytes ceiling
   (`received_bytes_per_project_per_day`, default 2 GiB, config). Beyond it,
   return 429 with `Retry-After` until the next reporting day and keep a
   diagnostic receipt. Protects the free-tier CPU budget from unfiltered
   CDN streams.
5. **Provision `api.citeladder.com`** (D4.1, D4.5). Code and runbook only;
   the owner performs the Cloudflare and DNS change (CLAUDE.md: no deploys
   without explicit authorization).
   - Attach `api.citeladder.com` as a Custom Domain on the marketing Worker
     (one Worker, no new origin credential). The Worker forwards an explicit
     allowlist to Cloud Run with the origin token: `/v1/*`, `/mcp`, `/mcp/*`,
     OAuth discovery/registration/authorize/token/revoke (moved in F4-PR2),
     and refuses everything else with 404. No cookies are read on this host.
   - Crawl-log ingest paths on the new host:
     `POST https://api.citeladder.com/v1/crawl-logs/ingest/{source_id}` and
     `POST https://api.citeladder.com/v1/crawl-logs/firehose/{source_id}`.
     The existing apex path `/api/v1/crawl-logs/ingest/{source_id}` stays as
     an alias so deployed Worker templates and Logpush jobs keep working;
     the generated Worker template and setup dialogs switch to the new host.
   - Add a host-ownership row **API-OWNED** to WORKERS_RUNBOOK and a release
     check that the app host refuses these machine paths.

### F2-PR1 part B: AWS connector (CloudFront → Amazon Data Firehose → CiteLadder)

Why Firehose: CloudFront standard logging v2 can deliver JSON logs straight to
a Firehose stream, and Firehose batches, compresses, retries with backoff and
can back up failures to S3. Profound, Searchable and Airefs all use this path.

**Flow**

```
CloudFront distribution
  └─ Standard logging (v2) → destination: Amazon Data Firehose (us-east-1), output JSON
        └─ Firehose stream (HTTP endpoint destination, GZIP, buffer ≤3 MiB / 60–300 s,
           S3 backup for failed data, retry duration 3600 s)
             └─ POST https://api.citeladder.com/v1/crawl-logs/firehose/{source_id}
                  X-Amz-Firehose-Access-Key: clw_…
                  └─ marketing Worker (api.citeladder.com, API-OWNED) → Cloud Run → firehose adaptor → ingest()
```

**New source setup** `aws_firehose`, `kind: webhook`, preset
`cloudfront_v2_json`, `collection_point: cdn_edge`. Token issuance, rotation
and revocation reuse the existing webhook path (`clw_` token, hash + prefix).

**New route** `POST /v1/crawl-logs/firehose/{source_id}` on
`api.citeladder.com`, family `crawl-log-ingest`, API-OWNED (part A step 5). Adaptor module:
`src/crawl-logs/firehose.ts`. It never writes rows itself; it translates and
calls `ingest()`.

Request handling, in order:

1. Read `X-Amz-Firehose-Request-Id`. Every response body echoes it.
2. Authenticate `X-Amz-Firehose-Access-Key` against the source token hash
   (same constant-time check as Bearer). Do not accept the token in the URL.
3. Bound and decode the body with `boundedBody` / `decodedBody`
   (`Content-Encoding: gzip` when the stream has GZIP enabled).
4. Parse JSON `{ requestId, timestamp, records: [{ data }] }`
   (`records` 1–10,000; each `data` base64, ≤1,024,000 bytes decoded). Reject
   when `requestId` differs from the header.
5. Base64-decode each record to UTF-8. A record holds one or more
   newline-separated JSON log objects. Concatenate into NDJSON lines.
6. Call `ingest()` with the preset mapping and
   `Idempotency-Key = "firehose:" + requestId`. Firehose keeps the request ID
   across retries of a batch, so a retried batch returns the original receipt
   and spends no quota.
7. Respond.

Response contract (Firehose treats anything else as a 500):

- `Content-Type: application/json`, `Content-Length` set, **no**
  `Content-Encoding`, body ≤1 MiB:
  `{ "requestId": "<same>", "timestamp": <server epoch ms> }`, plus
  `"errorMessage"` on failure.
- Only **200** counts as delivered. Map the existing ingest outcomes:

| Ingest outcome | Status to Firehose | Why |
|---|---|---|
| accepted / replayed receipt | 200 | delivered |
| all lines lack identifying fields (`unsupported_format`) | 400 | retried, then S3 backup; receipt shows the diagnostic |
| bad or revoked token | 401 | retried, then S3 backup |
| quota (`batches_per_source_per_hour`, lines/day, bytes/day) | 429 | Firehose backs off and retries |
| body over the 5 MiB bound | 413 | **Firehose drops a 413 batch permanently, without S3 backup.** Keep a diagnostic receipt (`oversize`) so the UI tells the user to lower the buffer size. |
| ingestion disabled / source not active | 409 | retried until the retry window ends |
| unexpected error | 500 | retried |

Never answer with a redirect: Firehose does not follow 3xx.

**Preset `cloudfront_v2_json`** (add to `crawl-logs.json` and the
`crawl-log-format` contract):

| CiteLadder field | CloudFront v2 JSON field | Notes |
|---|---|---|
| timestamp | `timestamp(ms)` (epoch ms, string) | Fallback `date` + `time` (UTC). Add `timestamp_unit: "epoch_ms"` support. |
| host | `x-host-header` | Viewer Host header. Do **not** use `cs(Host)`, which is the distribution domain. |
| path | `cs-uri-stem` | Query (`cs-uri-query`) is ignored by design. |
| method | `cs-method` | |
| status | `sc-status` | String; `"-"` → missing. |
| user_agent | `cs(User-Agent)` | CloudFront URL-encodes some characters (spaces as `%20`). Add `user_agent_decode: "url"`; confirm against a real fixture before release. |
| client_ip | `c-ip` | Transient, for verification only (unchanged privacy rule). |
| request_id | `x-edge-request-id` | Dedupe key across retries. |

Treat `"-"` as missing in every field.

**Setup dialog (generated text, per source)**

1. In **us-east-1**, create a Firehose stream: source Direct PUT, destination
   HTTP endpoint, URL `https://api.citeladder.com/v1/crawl-logs/firehose/{source_id}`,
   access key = the `clw_` token, content encoding GZIP, buffer size 1–3 MiB
   (the JSON envelope adds about 33% for base64; above ~3 MiB a batch can
   exceed the 5 MiB decompressed bound), buffer interval 60–300 s, retry
   duration 3600 s, S3 backup for failed data only.
2. On the distribution: Logging → Add → Amazon Data Firehose → choose the
   stream → output format **JSON** → fields: `timestamp(ms)`, `c-ip`,
   `sc-status`, `cs-method`, `cs-uri-stem`, `x-edge-request-id`,
   `x-host-header`, `cs(User-Agent)`. Optional: `cs(Referer)`.
3. Notes shown: CloudFront can take up to about four hours after enabling
   logging to deliver reliably; the Firehose console's "Test with demo data"
   sends non-CloudFront records and shows as an unsupported-format receipt;
   use a real page visit to test.

**Volume and filtering**

- Unfiltered streams send every request. Ingest discards unmatched lines (they
  cost CPU, not accepted-line quota). The bytes/day ceiling (part A) bounds the
  worst case.
- Ship an optional generated **Firehose transformation Lambda** template
  (`frontend/apps/docs/public/templates/citeladder-firehose-filter.mjs`,
  Node.js Lambda runtime). It decodes each record, keeps records whose lowercased
  `cs(User-Agent)` contains any catalog `ua_patterns` substring, returns
  `result: "Ok"` or `"Dropped"` per Firehose's transformation contract, and
  embeds `catalog_version`. Generate it from `crawlers.json` like the Worker
  template and extend the template freshness check to it. Snowplow publishes a
  reference implementation of exactly this filter (appendix).

**Coverage**

- Unfiltered stream: `sampling: none`. A reporting day is `complete` when the
  source was active all day and no gap between accepted receipts exceeded the
  source's delivery-gap bound. Firehose emits on buffer interval, so make the
  bound per source: `max(config max_delivery_gap_minutes, buffer_interval + 5 min)`;
  store `buffer_interval_seconds` declared at setup on the source.
- Filtered stream (Lambda template): `sampling: filtered`. Quiet periods send
  nothing and Firehose sends no heartbeats, so coverage stays `partial`
  (decision D2.4 may revisit).

**Tests (lowest meaningful boundary)**

- Adaptor: request-ID mismatch rejected; gzip and identity bodies; multi-line
  records; base64 failure isolated to its record; response shape for every
  status in the table; replay of the same request ID returns the original
  receipt without quota spend.
- Preset mapping: epoch-ms timestamps, `"-"` handling, URL-decoded UA,
  `x-host-header` host scope enforcement.
- Coverage: gap bound uses the declared buffer interval.
- Real PostgreSQL: workspace isolation of new source rows.

### F2-PR2: GCP connector (Cloud Logging sink → Pub/Sub → CiteLadder pull)

Why pull, not push: a Pub/Sub push subscription delivers **one HTTP request
per message**, which would spend the free-tier Cloud Run request budget and the
600 batches/hour quota on busy sites. Searchable works around this with a
customer-deployed Cloud Run relay; that adds customer infrastructure. Pull lets
CiteLadder fetch up to 1,000 messages per call on its own schedule, and Pub/Sub
retains unacknowledged messages for up to 7 days, so a missed run loses nothing.

**Flow**

```
External Application Load Balancer / Cloud CDN  (resource.type="http_load_balancer")
Cloud Run services                               (log_id "run.googleapis.com/requests")
  └─ Cloud Logging sink with a generated user-agent filter
       └─ Pub/Sub topic  →  pull subscription (customer project)
            └─ CiteLadder analytics lane: pull → ingest() → commit → acknowledge
               (identity: dedicated CiteLadder service account, granted on the subscription)
```

**Identity (no JSON keys)**

- Terraform (`infra/gcp/identity.tf`): new service account
  `citeladder-log-reader`. Grant the existing `runtime` service account
  `roles/iam.serviceAccountTokenCreator` on it.
- The worker gets the runtime identity from the metadata server, then calls
  IAM Credentials `generateAccessToken` for `citeladder-log-reader` (scope
  `https://www.googleapis.com/auth/pubsub`, lifetime ≤ 15 min). Use plain REST
  through the shared safe fetcher; do not add the gRPC Pub/Sub client.
- Customers grant only `citeladder-log-reader@<project>.iam.gserviceaccount.com`.
  Show this email in the setup dialog from config.
- Local development: connector disabled unless an operator configures
  Application Default Credentials; reads say "not available in this environment".

**Confused-deputy protection (required)**

Any user could type someone else's subscription path. If that owner had
granted CiteLadder access, logs would flow into the wrong project. Prevent it:

- Each pull source gets a random `verification_nonce` (26 chars, lowercase
  base32, valid as a GCP label value).
- The customer must set label `citeladder-source=<nonce>` on the subscription.
- Before activation and once a day, CiteLadder reads the subscription
  (`GET https://pubsub.googleapis.com/v1/{subscription}`; needs
  `roles/pubsub.viewer` on the subscription) and requires: label matches,
  `pushConfig` empty (pull), `ackDeadlineSeconds ≥ 60`. Mismatch → source
  `stalled` with reason `verification_failed`; no pulls.
- Host scope enforcement in `ingest()` still applies.

**Customer setup (generated commands in the dialog)**

```
gcloud pubsub topics create citeladder-ai-crawlers
gcloud pubsub subscriptions create citeladder-ai-crawlers-sub \
  --topic=citeladder-ai-crawlers --ack-deadline=120 \
  --message-retention-duration=7d --labels=citeladder-source=<nonce>
gcloud logging sinks create citeladder-ai-crawlers \
  pubsub.googleapis.com/projects/<PROJECT>/topics/citeladder-ai-crawlers \
  --log-filter='<generated filter>'
# grant the sink's writer identity roles/pubsub.publisher on the topic
gcloud pubsub subscriptions add-iam-policy-binding citeladder-ai-crawlers-sub \
  --member=serviceAccount:<citeladder-log-reader email> --role=roles/pubsub.subscriber
gcloud pubsub subscriptions add-iam-policy-binding citeladder-ai-crawlers-sub \
  --member=serviceAccount:<citeladder-log-reader email> --role=roles/pubsub.viewer
```

Load balancer logging must be enabled on each backend service with sample rate
1.0 (`--enable-logging --logging-sample-rate=1.0`). The dialog asks the user to
declare the sample rate; < 1.0 makes coverage `partial`.

**Generated sink filter** (module `src/crawl-logs/gcp-filter.ts`, output also
shown in docs; regenerated from `crawlers.json`):

```
(resource.type="http_load_balancer"
  OR (resource.type="cloud_run_revision" AND log_id("run.googleapis.com/requests")))
AND httpRequest.userAgent=~"(?i)(<escaped ua_patterns joined by |>)"
```

Escape each pattern for RE2. Store the `catalog_version` the filter was
generated from on the source (`filter_catalog_version`). When the catalog
version changes, the source shows "update your sink filter" with the new
filter; coverage drops to `partial` from that day until the user confirms the
update (the confirmation records the new version and time).

**Source schema additions** (`crawl_log_sources`): `kind` gains `pull`;
`setup` gains `aws_firehose`, `gcp_pubsub_pull`; new nullable columns
`subscription` (≤255), `verification_nonce`, `verified_at`,
`filter_catalog_version`, `declared_sample_rate` (numeric),
`buffer_interval_seconds` (F2-PR1), `last_pull_at`, `last_drained_at`,
`stall_reason`. Token columns stay null for pull sources. Keep the existing
one-active-live-source-per-host rule (pull counts as live).

**Pull task** (`crawl_log_pull`, analytics lane, one per active pull source):

1. Scheduled every `pull_interval_seconds` (config, default 300); coalesced;
   lease longer than the subscription ack deadline.
2. Loop up to `pull_max_iterations` (default 10):
   - `POST https://pubsub.googleapis.com/v1/{subscription}:pull`
     `{ "maxMessages": 1000 }`.
   - Decode each message: `message.data` base64 → JSON `LogEntry`.
   - Map to a line (table below). Unknown resource types count as unsupported
     lines, not failures.
   - `ingest()` in its own transaction, idempotency key
     `pull:<source_id>:<first messageId>:<last messageId>`; request IDs dedupe
     redeliveries anyway.
   - After commit: `POST {subscription}:acknowledge { ackIds }`. An ack failure
     only causes redelivery, which dedupes.
   - Zero messages returned → set `last_drained_at`, stop.
3. Permission or not-found errors → `stalled` with reason; retry on the next
   daily verification, not every interval.

| CiteLadder field | LogEntry field |
|---|---|
| timestamp | `timestamp` |
| host, path | parse `httpRequest.requestUrl`; drop query and fragment |
| method | `httpRequest.requestMethod` |
| status | `httpRequest.status` |
| user_agent | `httpRequest.userAgent` |
| client_ip | `httpRequest.remoteIp` (transient) |
| request_id | `insertId` |

Example LB entry: `resource.type: "http_load_balancer"`,
`logName: "projects/<p>/logs/requests"`, `httpRequest.{requestMethod,
requestUrl, status, userAgent, remoteIp}`, `timestamp`. Note `requestUrl` can
carry an IP host when clients connect by IP; host scope drops those lines.

**Coverage rule (decision D2.5, recommended):** a day is `complete` when all of:
source active and verified the whole day; `filter_catalog_version` equal to the
catalog version for the whole day; declared sample rate 1.0; no gap between
successful drains above `max_pull_gap_minutes` (default 30); a drain completed
at least `pull_settle_minutes` (default 15) after the reporting day closed.
Otherwise `partial`. The UA filter keeps exactly the population CiteLadder
would retain, so filtering at source is not sampling.

**Customer cost note (dialog and docs):** Cloud Logging routing to Pub/Sub and
Pub/Sub throughput are billed to the customer's project; the UA filter keeps
volume small.

**Tests**

- Filter generator escapes regex metacharacters and changes with
  `catalog_version`.
- Verification: label mismatch, push subscription, short ack deadline each
  stall the source.
- Pull loop with a fake transport: ack only after commit; redelivered messages
  dedupe; drain sets `last_drained_at`; permission error stalls.
- Coverage rule boundaries (real PostgreSQL rollups).

### F2 docs to update

`docs/ai-traffic.md` (sources, adaptor, pull, coverage rules),
`frontend/apps/docs/src/content/ai-traffic.md` (AWS and GCP guides),
`docs/operations/WORKERS_RUNBOOK.md` (new apex path),
`docs/invariants.md` only if coverage semantics change,
`docs/plans/backlog.md` (remove "additional log providers/presets" and
`stalled` items once shipped).

### F2 out of scope (backlog candidates)

S3-pull connector for ALB and legacy CloudFront logs (cross-account role with
per-source ExternalId), Vercel log drains, Fastly, Akamai, Netlify, WordPress
plugin.

### F2 owner decisions

- **D2.1** *Decided 2026-10-10:* enabled for every paid workspace, disabled for the public trial.
- **D2.2** Raw request retention (proposed 90 days is not approved).
- **D2.3** Privacy/DPA wording for transient IP processing and stored path hashes.
- **D2.4** Filtered Firehose streams stay `partial` *(recommended)*.
- **D2.5** Pull-source `complete` coverage rule above *(recommended)*.

---

## F3. Sentiment (answer perception)

**Owner documents:** `docs/visibility-prompt.md` (add an "Answer perception"
section, or a new owner doc `docs/answer-perception.md` routed from
`docs/README.md`). New module `frontend/services/api/src/perception/`.
**PRs:** one.

### Current state (verified)

- `response_analyses.sentiment varchar(16)` exists and is never written
  (`src/analysis/execution.ts` writes `sentiment: null`). Placeholders also in
  `src/visibility/metrics.ts`, `src/analysis/aggregate.ts`,
  `src/visibility/trend-folding.ts`, `src/visibility/dashboard.ts`,
  `src/visibility/execution.ts`; export text in `src/audits/exports.ts` says
  "sentiment is not computed".
- `src/analysis/entity-assessment.ts` already produces a deterministic,
  English-only, first-mention state per entity: `absent`, `mentioned`,
  `recommended`, `recommended_against`, `hedged`, `unavailable`, with
  `evidence_spans` and `model: null`, `template_version: null`. Its own
  limitation text says it is **not** sentiment.
- Backlog (Visibility review, deferred): a "recommended vs only mentioned"
  rate from persisted entity assessments, replacing the never-computed
  sentiment fields. Ship that rate in this PR alongside model sentiment.
- `analyzeExecution` runs inside the audit/task lock and commits with the
  artifact. It must not call a model. Perception runs after commit.

### What competitors measure (for metric design)

- Peec: one sentiment score 0–100 per brand from the tone of mentions; most
  scores fall 65–85; ~65 reads as neutral, below 65 warrants a look; benchmark
  against competitors.
- Profound: positive/negative split per brand (sums to 100), themes (pricing,
  support, quality…) with attributes carrying polarity, the exact language
  quoted, and "negative sentiment drivers" = cited pages behind negative
  claims; comparable across competitors; filterable by model, topic, region.
- CiteLadder's version keeps its evidence rules: every number opens the
  answer, every quote is a verified substring, unclassified mentions are
  counted and shown, never folded into neutral.

### Architecture

**Trigger.** When `analyzeExecution` commits a `response_analyses` row whose
`entity_assessments` contain at least one entity with state other than
`absent`/`unavailable`, and the audit's frozen configuration has
`perception.enabled = true`, insert a `perception_tasks` row in the same
transaction (no network). The flag is frozen at audit admission from the
project setting (default on, D3.2).

**Worker.** New lane `perception` in the runner (or the analytics lane if the
owner prefers fewer lanes; it must have its own `nextDue`). Leased claim with
`SKIP LOCKED`, `max_attempts` from config, commit an attempt row before the
model call, settle idempotently.

**Funding (D3.1, decided: platform).** Perception uses the default Agent
gateway model with the platform key; no customer credit draw. Bound cost with
config caps in `perception.json`: `max_classifications_per_audit` (default
500) and `max_classifications_per_workspace_per_day` (default 2,000). A task
over a cap ends with outcome `unavailable`, reason `platform_cap`; the audit's
other results are unaffected. Record input/output tokens and the model on every
perception row so the owner can see platform spend per workspace. A
deployment without a configured gateway model reports `unavailable`, reason
`model_not_configured`.

**Input package (bounded, inspectable — invariant 11).**

- Prompt text (from `audit_prompt_snapshots`).
- For each entity counted as mentioned by the shared matcher
  (`src/analysis/aliases.ts`, mention rules frozen in the audit): passages =
  every sentence containing a counted occurrence, plus one sentence either
  side, merged where overlapping, capped at `max_passage_chars_per_entity`
  (default 1,200). Use `Intl.Segmenter(lang, { granularity: 'sentence' })`
  with the project `language_code`.
- At most `max_entities` (default 8): brand first, then competitors by first
  offset.
- Record `input_hash` (SHA-256 of the canonical package), passage offsets and
  any truncation in the perception row.

**Model call.** Through `src/models/gateway.ts` (configured gateway model,
JSON output). Template in config with `template_version`. Output schema (zod):

```
{
  "entities": [{
    "entity_id": "brand:<normalized>",          // must be in the input set
    "label": "positive|neutral|negative|mixed|not_assessable",
    "confidence": 0.0-1.0,
    "aspects": [{                                // max 5 per entity
      "theme": "<closed taxonomy key>",
      "polarity": "positive|negative",
      "quote": "<exact text from this entity's passages>"
    }]
  }]
}
```

Instructions to the model (template): judge only how the answer describes the
entity; a bare list of names is `not_assessable`; `mixed` when both polarities
are explicit; quotes must be copied exactly.

**Deterministic validation (code, not model):**

- Unknown `entity_id` → dropped, counted `unknown_entity`.
- `quote` must be an exact substring of that entity's passages after
  whitespace normalization; otherwise the aspect is dropped and counted
  `quote_not_found`. Store the matched offsets.
- `theme` outside the taxonomy → `other`.
- `confidence < min_confidence` (default 0.6) → stored, excluded from
  aggregates, counted as `low_confidence`.
- Schema failure → outcome `invalid_output` (retry once, then terminal).

**Theme taxonomy** (config `src/config/perception.json`, versioned):
`pricing`, `value`, `quality`, `features`, `ease_of_use`, `support`,
`reliability`, `performance`, `security_privacy`, `integrations`,
`reputation_trust`, `availability`, `shipping_delivery`, `returns_policy`,
`sustainability`, `other`.

**Persistence** (append-only; new extractor version = new rows):

```
perception_tasks       id, workspace_id, project_id, audit_id, task_id, analysis_id,
                       status, attempt_count, lease_owner, lease_expires_at, due_at,
                       last_error_code, created_at, updated_at
answer_perceptions     id, workspace_id, project_id, audit_id, task_id, analysis_id,
                       artifact_id, extractor_version, template_version,
                       model_provider, model, input_hash, outcome
                       (classified|no_mentions|unavailable|invalid_output|model_error),
                       outcome_reason, drop_counts jsonb, usage jsonb, created_at
                       UNIQUE (analysis_id, extractor_version)
entity_sentiments      id, workspace_id, perception_id, entity_id, entity_kind,
                       label, confidence, passage_spans jsonb,
                       aspects jsonb  -- [{theme, polarity, quote, start, end}]
```

Composite workspace FKs like other evidence tables. Remove
`response_analyses.sentiment` and the `sentiment: null` placeholders under the
replacement gate (inventory every reader first; the dashboard contract field
becomes the real metric or is removed).

**Metrics** (deterministic, `perception_metrics_version` in config; reads only):

- *Classified mentions* = rows with label in {positive, neutral, negative,
  mixed} and confidence ≥ threshold. Always shown with coverage:
  "N of M mentions classified" (M = mentions with a perception row; pending
  and unavailable counted separately).
- *Positive share*, *negative share* over classified mentions.
- *Net sentiment* = (positive − negative) / classified × 100, range −100…+100.
  `mixed` counts in the denominator only.
- Per entity (brand vs each competitor), engine, prompt, topic, run; trends by
  run with comparison key including `extractor_version` and `template_version`
  (a changed version is a non-comparable point, like other version changes).
- *Themes*: brand counts by theme × polarity, each with up to N quotes linking
  to `/runs/{runId}?execution={taskId}`.
- *Negative drivers*: domains/URLs cited in answers where the brand carries a
  negative aspect. Label as co-occurrence, never cause (same rule as URL brand
  lists in docs/visibility-prompt.md).
- *Recommended rate* (deterministic, from `entity_assessments`):
  recommended / mentioned, plus recommended-against count. Ships here per the
  backlog item; keep its English-only limitation visible.
- States per read: `not_enabled`, `pending`, `unavailable` (with reason),
  `no_mentions`, value. Never zero for missing data.

**Reads and exposure**

- Browser: `GET /api/v1/projects/{project_id}/visibility/perception`
  (`audit_id` or `from`/`to`, `engine`, `cohort`, `entity`) and
  `.../perception/quotes` (cursor-paged). Family `visibility`.
- Visibility screen: new **Perception** tab beside Trends, Sources, Query
  Fanout: net sentiment tile with coverage strip, brand vs competitors bars,
  themes table (theme, positive, negative, top quote), negative quotes list,
  negative drivers table. Colours from the outcome scale in `docs/design.md`
  (it already reserves sentiment). Dashboard tile replaces the null field.
- MCP: `read_perception` (summary or quotes view). Agent reads it through the
  same catalogue. Public API (F4) mirrors it.
- The audit launcher states that answers will also be classified for
  sentiment (no customer charge).
- Optional, behind a button: "Classify earlier runs" for the last
  `backfill_max_audits` (default 5) audits, bounded by the same caps.

**Calibration**

- Fixture set: 60 synthetic answers with hand labels under
  `frontend/services/api/test/fixtures/perception/`.
- `pnpm perception:eval` (operator-only, live provider, never in CI): label
  agreement, macro F1, quote validity rate, cost per answer. Thresholds in
  `perception.json` with a policy version; changing them bumps the version.

**Tests**

Invented quote dropped; unknown entity dropped; low confidence excluded from
aggregates but counted; net sentiment denominators; `mixed` handling;
not_enabled vs unavailable vs no_mentions; version change makes trend points
non-comparable; task enqueued in the analysis transaction only when an entity
is mentioned; lease recovery; workspace isolation; platform caps end tasks as
`platform_cap` without failing the audit.

**Docs:** owner doc section, `docs/README.md` index row (if a new doc),
public `visibility.md` Perception section, exports text in
`src/audits/exports.ts`, `docs/invariants.md` unchanged (invariant 9 already
covers this).

### F3 owner decisions

- **D3.1** *Decided 2026-10-10:* platform-funded through the default Agent
  gateway model.
- **D3.2** Default on for every project *(recommended; follows from D3.1)*.
- **D3.3** *Decided 2026-10-10:* the default Agent gateway model.

---

## F4. Public REST API and MCP write tools

**Owner documents:** new `docs/public-api.md` (routed from `docs/README.md`),
`docs/mcp.md`, `docs/workspace-access.md` (keys and scopes),
`docs/invariants.md` (invariant 10 wording), `docs/architecture.md`
(MCP row "Read-only access" changes).
**PRs:** F4-PR1 command layer + API keys + public API on `api.citeladder.com/v1`.
F4-PR2 move MCP and its OAuth endpoints to `api.citeladder.com/mcp`.
F4-PR3 MCP write tools.

### Current state (verified)

- Browser API: same-origin `/api/v1` on `app.citeladder.com`, session auth.
- MCP: `src/mcp/server.ts`, `oauth.ts`, `registration.ts`, `tools.ts`,
  `data.ts`. Registration narrows scope to `citeladder:read`. Every tool is a
  read adapter over an owner. Budget 120 calls/min per connection, 600 per
  account. Consent page `src/mcp/consent-page.ts`.
- Roles (`src/config/workspaces.json`): Owner, Admin, Member (product
  write/run), Viewer (read).
- Usage limiter: `src/abuse/usage.ts` (`enforceSubjectRequest`).
- OpenAPI generated from route contracts (`src/openapi/document.ts`,
  `routes.ts`).
- Idempotency precedent: prompt generation stores `Idempotency-Key` in the run
  request; crawl-log receipts replay by key.
- Invariant 10 and `CLAUDE.md`: no prompt activation or external mutation
  without an explicit user decision; the Agent stays read-only.

### F4-PR1 part A: one command layer

Refactor before adding callers, so browser, public API and MCP share one path:

- Introduce `Actor` = `{ kind: 'member' | 'api_key' | 'mcp_grant',
  workspaceId, accountId, memberId, role, scopes }`.
- Move each write handler's body into an owner service function that takes
  `(db, actor, projectId, input)` and calls one authorization helper
  `requireCapability(actor, capability)` (capability = existing role matrix
  entry ∩ actor scopes). Browser routes become thin adapters.
- No new store, no copied validation: topical binding, occupancy, capacity
  locks, generation admission, audit admission and funding stay in their
  owners.

### F4-PR1 part B: API keys

```
api_keys           id, workspace_id, name, prefix (e.g. "cl_live_ab12"), secret_hmac,
                   scopes text[], project_ids uuid[] NULL (= all projects),
                   created_by_member_id, created_at, expires_at NULL,
                   last_used_at (5-minute resolution), revoked_at, revoke_reason
api_idempotency    id, workspace_id, api_key_id, idempotency_key, request_hash,
                   status_code, response_body jsonb, created_at
                   UNIQUE (api_key_id, idempotency_key); purge after 24 h
```

- Format `cl_live_` + 32 random bytes base62; shown once; stored as HMAC with a
  dedicated pepper secret `API_KEY_PEPPER` (not the session secret, so
  rotating sessions does not kill integrations).
- Created, listed and revoked by Owner/Admin in **Settings → API keys** (name,
  scopes, projects, optional expiry). Security events on create, revoke, and
  use of a revoked or expired key.
- Plan capability `api_access` (boolean) and limit `api_keys` in
  `entitlements.json` (D4.3).
- Effective permission on every request = key scopes ∩ the creator's
  **current** role. Creator removed from the workspace → keys revoked in the
  same transaction (reason `creator_removed`). Demotion narrows effective
  scopes immediately.
- Scopes: `read`, `prompts:write`, `competitors:write`, `audits:run`,
  `schedules:write`, `actions:write`.
- Rate limits via the shared limiter: per key 600/min, per workspace
  1,200/min (config `api.json`); 429 with `Retry-After`.

### F4-PR1 part C: the public API

- **Host (D4.1, decided):** `https://api.citeladder.com/v1/...`, served
  through the host provisioned in F2-PR1 part A step 5.
- Mounted as a separate Hono sub-app (`src/public-api/`), authenticated only
  by `Authorization: Bearer cl_live_…`; cookies ignored; no CORS for
  credentials.
- Contracts reuse `@citeladder/contracts` zod schemas. Add `exposure:
  'browser' | 'public' | 'both'` to route contracts; generate
  `/v1/openapi.json` from `public`/`both` routes; generate the docs reference
  at build with a drift check (same pattern as `mcp:reference`).
- Conventions: cursor pagination (`cursor`, `limit` ≤100, owner keyset
  cursors), errors per `docs/api-error-contract.md`, `Idempotency-Key`
  required on every POST that creates or spends (same key + different body →
  409), additive-only changes within `/v1`, changelog in the docs site.
- IDs are returned (API consumers need them); unknown/unavailable states keep
  the owner's `state` field like MCP.

**Endpoints v1**

| Area | Read (`read`) | Write (scope) |
|---|---|---|
| Projects | list, get, business context | — |
| Topics | list | create, rename, delete (`prompts:write`) |
| Prompts | list (topic, status, latest mention/citation rate) | create 1–50 rows, edit text/topic, archive/restore, bulk import rows (`prompts:write`) |
| Generation | runs, candidates | start run (async), review accept/reject (`prompts:write`) |
| Competitors | list with mention rules | add, edit (aliases, mention rule), remove (`competitors:write`) |
| Audits | list, get, status, estimate | launch with `max_estimated_credits`, cancel (`audits:run`) |
| Schedules | list | create, edit, pause/resume, delete (`schedules:write`) |
| Visibility | overview, trends, results, sources, fanout, perception (F3) | — |
| Actions | list, get | status change, implementation declaration (`actions:write`) |
| Site Health | latest snapshot, pages, issues | — |
| AI Traffic | overview, pages, crawl-log coverage | — |
| Performance | GSC/GA4 totals and dimensions | — |
| Search Intelligence | datasets, rows | — |

Audit launch: the request carries `max_estimated_credits`; the server computes
the estimate with the existing admission path and returns 409
`estimate_exceeds_limit` when higher. Funding, occupancy and provider capacity
checks are unchanged.

**Invariant change (D4.2):** prompt activation and audit launch through a key
holding the matching scope, created by an Owner/Admin, count as an explicit
user decision. Record in `docs/decisions.md` and amend invariant 10.

### F4-PR2: move MCP to `api.citeladder.com/mcp` (D4.1, decided)

Today (docs/mcp.md): protocol endpoint `https://citeladder.com/mcp`; issuer,
resource, discovery, registration, authorize, token and revoke on the apex
protocol origin; consent and login on `FRONTEND_URL` (app host); access tokens
bound to the `/mcp` resource (RFC 8707); 401s point to protected-resource
metadata (RFC 9728).

Change:

- Protocol origin config becomes `https://api.citeladder.com`: issuer
  `https://api.citeladder.com`, resource `https://api.citeladder.com/mcp`,
  `/.well-known/oauth-authorization-server` and
  `/.well-known/oauth-protected-resource/mcp` served on the API host, plus
  `/mcp/register`, `/authorize`, `/token`, `/revoke`. Consent stays on the app
  host (`/mcp/oauth/consent`); the consent page's form-action and redirect
  checks keep working because they read the transaction, not the host.
- Transition (D4.6): existing grants are bound to the apex resource and
  clients store the apex URL; MCP clients do not follow redirects reliably on
  POST. Recommended: serve both origins for a window (default 90 days, config
  `mcp.legacy_origin_until`). During the window the apex keeps answering with
  its own issuer/resource; tokens are accepted only for the resource they were
  issued for; refresh keeps the grant's original resource. Tool results on the
  apex carry a server instruction telling the assistant to suggest
  reconnecting at the new URL. After the window the apex `/mcp` returns 410
  with the new URL in the error body. If `mcp_grants` shows no active external
  connections at release, the owner may choose a hard cut instead.
- Update: `frontend/lib/config/mcp-clients.ts` (Connect strip, Claude add-
  connector link), public docs `mcp/*.md` and the platform MCP page, the
  plugin's `mcp.json`, WORKERS_RUNBOOK (remove apex MCP from APEX-OWNED after
  the window), ChatGPT plugin acceptance notes (domain verification is per
  host; re-verify `api.citeladder.com`).
- Tests: discovery documents per origin; a token issued for one resource is
  refused on the other; refresh preserves resource; legacy window expiry.

### F4-PR3: MCP write tools (D4.2, decided)

- OAuth: registration stops narrowing away `citeladder:write`; access tokens
  carry granted scopes; consent page adds an unchecked **Allow changes**
  section listing write capabilities; the grant stores scopes; existing grants
  stay read-only until the user re-consents.
- Write tools require the account's live role to allow product write (Member
  or above) and the grant to hold `citeladder:write`.
- Same command layer as the public API. Tool annotations:
  `readOnlyHint: false`; `destructiveHint: true` on archive, delete and
  cancel; `idempotentHint` where true; `openWorldHint: false`.
- **Two-step confirmation for consequential writes** (prompt activation, audit
  launch, schedule creation, implementation declaration, deletes):
  - `prepare_*` tools run all validation and return a preview (admitted rows,
    drops with reasons, occupancy after, estimate) plus a
    `confirmation_token`.
  - `confirm_change(confirmation_token)` executes exactly the previewed
    payload.
  - Token: 32 random bytes, stored as HMAC in `mcp_confirmations`
    (grant_id, kind, payload_hash, expires_at = 10 min, consumed_at);
    single-use; rechecks grant, membership, role and funding at confirm.
  - When the client declares the MCP elicitation capability, the server may
    ask for confirmation through elicitation instead; the token path remains
    the fallback for every client.
- Direct (single-step) tools for low-risk writes: `create_topic`,
  `rename_topic`, `update_prompt_text`, `add_competitor`,
  `update_action_status`.
- Tools: `create_topic`, `rename_topic`, `prepare_add_prompts`,
  `update_prompt_text`, `prepare_archive_prompts`, `add_competitor`,
  `prepare_launch_audit`, `cancel_audit`, `prepare_schedule`,
  `update_action_status`, `prepare_declare_implemented`, `confirm_change`.
- Budgets: write calls count against the existing per-connection budget plus a
  write sub-budget (30/min, config `mcp.ts`).
- The in-app Agent stays read-only (unchanged invariant).
- Plugin (`plugins/citeladder/`): its negative review case "mutate" becomes
  "mutate without confirmation"; add a positive case for a confirmed prompt
  add.

**Tests (all F4 PRs):** key HMAC and prefix lookup; scope ∩ role; creator
removal revokes; demotion narrows; idempotency replay and conflict; estimate
limit; OpenAPI drift; MCP scope narrowing for old grants; confirmation token
single-use, expiry, payload mismatch, revoked grant at confirm; workspace
isolation across key, grant and project allowlist.

### F4 owner decisions

- **D4.1** *Decided 2026-10-10:* `api.citeladder.com`; MCP moves to
  `api.citeladder.com/mcp`.
- **D4.2** *Decided 2026-10-10:* MCP writes approved; amend invariant 10 for
  scoped API keys and confirmed MCP writes.
- **D4.3** Plans that include `api_access`; key and rate limits.
- **D4.4** MCP prompt adds activate immediately after confirmation
  *(recommended)* vs stage as candidates for in-app review.
- **D4.5** Crawl-log ingest also lives on `api.citeladder.com/v1`, with the
  apex path kept as an alias *(recommended; follows from D4.1)*.
- **D4.6** MCP transition: dual-serve for 90 days *(recommended)* vs hard cut.

---

## F5. Ads in AI answers

**Owner documents:** `docs/visibility-prompt.md` (scraper parsing and a new
Ads read). Code: `src/search-surfaces/parsing.ts`, `src/audits/surface-persistence.ts`,
`src/visibility/`.
**PRs:** one.

### Facts

- Since 28 May 2026 DataForSEO's ChatGPT LLM Scraper returns sponsored ads in
  ChatGPT answers as items with `"type": "chat_gpt_ad"`, on the Live and
  **Task GET Advanced** endpoints. CiteLadder already reads Task GET Advanced
  for `chatgpt_search`, so no new provider call is needed.
- Item shape: `type`, `rank_group`, `rank_absolute`, `title`, `snippet`,
  `url` (landing URL, often with UTM parameters), `domain`, `image_url`,
  `advertiser { name, url, favicon_url }`.
- OpenAI began rolling out paid placements in ChatGPT in May 2026.
- No equivalent is documented for the Gemini scraper; Google AI Overview ads
  are out of scope.

### Architecture

1. **Parsing.** In `parsing.ts`, extract `chat_gpt_ad` items into a separate
   list. Verify first that the current source walker (`scraperSources`) does
   not already treat ad URLs as citations; if it does, that is a correctness
   bug and this PR fixes it (ads are never citations or sources).
2. **Backfill check.** Inspect `raw_response_artifacts` for scraper tasks. If
   the full provider payload is retained, offer a bounded operator command to
   derive ads for existing artifacts (new parser version). If not, ads start
   with the next audits.
3. **Persistence** (written with the artifact's derived rows, same
   transaction as other surface evidence):

```
answer_ad_observations  id, workspace_id, project_id, audit_id, task_id, artifact_id,
                        parser_version, rank_absolute, rank_group,
                        advertiser_name, advertiser_domain (normalized registrable
                        domain from advertiser.url, else domain),
                        landing_url_raw, landing_url_canonical (query stripped),
                        title, snippet, image_url,
                        ownership (owned | competitor | other), competitor_id NULL,
                        created_at
```

   `ownership` uses the project's owned domains and tracked competitor
   domains at analysis time (frozen like other matching).

4. **Metrics** (deterministic, `ads_metrics_version`):
   - Applicability: only `chatgpt_search` answers parsed with a parser version
     that supports ads. Every other engine is `not_applicable`; older parser
     versions are `unavailable`.
   - *Ad presence rate* = successful applicable answers with ≥1 ad ÷
     successful applicable answers (per prompt, topic, run).
   - *Advertisers*: appearances, prompts reached, first/last seen, share of
     all ad appearances; brand's own ad share and rank (null when not
     advertising, not zero).
   - *Creatives*: dedupe on (advertiser_domain, title, snippet,
     landing_url_canonical); appearances, prompts, first/last seen.
   - *Ad beside organic*: for each prompt, whether the brand was mentioned
     organically when a competitor advertised (counts only; no causal claim).
5. **Reads/UI:** Visibility → **Ads** view (advertisers table, prompts that
   surface ads, creatives list with text only; do not hotlink ad images).
   Coverage note: "Ads seen in the scraper's ChatGPT sessions for this
   market; what your buyers see depends on their plan, account and country."
   MCP `read_ai_ads`; public API `GET /v1/projects/{id}/visibility/ads`.
6. **Tests:** parser extracts ads and leaves citations untouched; ownership
   matching; applicability states; presence denominators; dedupe.

---

## F6. Prompt grounding in observed questions (ongoing)

**Owner documents:** `docs/visibility-prompt.md` (generation),
`docs/plans/prompt-generation-v3.md` (calibration),
`docs/integrations-traffic-analytics.md` (Search Console evidence),
Search Intelligence acquisition for DataForSEO spend.
**PRs:** F6-PR1 observed question evidence + generation grounding. F6-PR2
(optional) AI interest estimates per topic.

### Current state (verified)

- Generation v3: coverage-first planner (`src/prompts/generation-plan.ts`),
  draft batches with a narrow brief, admission rules, JEV quality gate,
  candidate review. Draft batches deliberately receive **no** demand signals;
  admission drops exact copies of observed demand queries.
- Live calibration of v3 is outstanding (backlog "Prompt generation").
- Backlog: "Generate explicitly from selected search queries, retaining
  QueryEvidenceRow identity"; "never equate GSC impressions with AI prompt
  volume".

### Why grounding

The planner guarantees coverage but every question is still invented. The
best available signal of real buyer phrasing is observed questions. Use them
as evidence beside generation, not as volume.

### Sources (cheapest first)

| Source | Cost | What it gives | Limits |
|---|---|---|---|
| Search Console queries already imported | none | Question-shaped queries reaching the site (question word or ≥5 tokens), non-branded | Only queries the site already appears for |
| People Also Ask in Google SERPs | none if AI Overview audit artifacts keep full SERP items; otherwise one SERP call per topic seed | Questions Google associates with a topic | Google phrasing |
| DataForSEO LLM Mentions `search_mentions` | $0.10/request + $0.001/row | Questions from a 280M+ prompt database (ChatGPT, Google AI Overview) with an `ai_search_volume` estimate; filter `search_scope: ["question"]` | ChatGPT data is US/English only; third-party index, not your buyers' chats |
| DataForSEO AI Keyword Data `keywords_search_volume` (F6-PR2) | per request, ≤1,000 keywords | Current and 12-month AI search volume per keyword | Estimate from PAA-based signals; multi-word keywords count only questions containing all words; grammatical forms merged. Keyword-level, never prompt volume |

### Architecture

```
question_evidence_runs  id, workspace_id, project_id, source, request (topic seeds,
                        market), provider_receipt, cost, status, created_at
question_evidence       id, workspace_id, project_id, run_id NULL, source
                        (gsc|paa|llm_mentions), text, normalized_hash, language_code,
                        location_code, topic_id NULL, metrics jsonb
                        (impressions | ai_search_volume | platform), first_seen_at,
                        last_seen_at, provenance jsonb (QueryEvidenceRow id,
                        artifact id, provider task id)
```

- Acquisition: GSC and PAA derivation run in the existing analytics/demand
  owner after imports or audits (no new spend). LLM Mentions runs only on an
  explicit **Find observed questions** action per topic, with an estimate and
  the Search Intelligence cost ceiling. Never during reads.
- Admission: drop branded questions (mention rules + branded query overrides),
  apply topical binding to assign `topic_id`, dedupe by normalized hash,
  bound per topic (`max_observed_per_topic`, default 50).
- **Adopt directly (D6.1, recommended):** an observed question can be staged as
  a candidate with `generation_mode: 'observed'` and its provenance, through
  the same candidate review and JEV gate. This relaxes the "exact copy of
  observed demand" admission drop for this mode only.
- **Ground generation:** for each planned cell, pass up to 3 observed
  questions from the same topic with the highest token overlap as phrasing
  examples (labelled "examples of real buyer phrasing, do not copy"). Keep the
  exact-copy drop for generated rows. Record which evidence IDs grounded each
  draft in `evidence_refs`.
- **Coverage view:** Prompts → per topic **Observed questions** panel:
  question, source, metric with its label (impressions, or "AI interest
  estimate (DataForSEO)"), tracked/untracked, **Add as candidate**. Topic
  header shows "X of Y observed questions covered by a tracked prompt"
  (lexical match, threshold in config).
- **Eval:** extend `pnpm prompts:eval` with an observed-likeness metric (share
  of generated prompts within the similarity threshold of an observed question
  for the fixture's topic) beside judge pass rate; compare grounded vs
  ungrounded runs. Accept/reject outcomes by `generation_mode` feed the
  existing text-free calibration report.

F6-PR2: `ai_interest_estimates` per topic seed keyword (current value, 12-month
series, market, provider receipt). Shown on topics only, as an estimate.
Never on prompts, never summed into "prompt volume".

### F6 owner decisions

- **D6.1** Allow observed questions to be adopted as candidates *(recommended)*.
- **D6.2** Spend on LLM Mentions per topic action within the Search
  Intelligence ceiling *(recommended)*.
- **D6.3** Run the outstanding v3 live calibration before F6-PR1 merges so the
  comparison has a baseline *(recommended)*.

---

## F7. Market (location and language) segmentation

**Owner documents:** `docs/visibility-prompt.md`, `docs/onboarding.md` (market
scope), `src/config/providers.json`, `src/config/dataforseo.json`.
**PRs:** one.

### Current state (verified)

- Project columns: `country_code`, `language_code`, `primary_market`,
  `serp_location_code`, `serp_language_code`, `serp_device`.
- Search-surface requests validate against `dataforseo.json`
  `supported_location_codes` (13 codes: 2036 AU, 2124 CA, 2250 FR, 2276 DE,
  2356 IN, 2372 IE, 2528 NL, 2554 NZ, 2702 SG, 2710 ZA, 2784 AE, 2826 GB,
  2840 US) and `language_codes` (de, en, es, fr, it, nl, pt); scraper contexts
  are US/English today.
- Prompt wording can name places (market cells); measurement context is
  per project, not per prompt or run.

### Architecture

- **Markets per project:**
  `project_markets (id, workspace_id, project_id, label, country_code,
  location_code, language_code, region NULL, city NULL, timezone NULL,
  is_default, created_at)`. The default market is created from existing
  project columns.
- **Engine capability matrix** in `providers.json` per logical engine:
  `market_support: { mode: 'dataforseo_location' | 'web_search_user_location'
  | 'none', countries?: [...] }`.
  - DataForSEO ChatGPT and Gemini scrapers, AI Overview: `location_code` +
    `language_code` from DataForSEO's locations/languages lists. Add an
    operator CLI `dataforseo:locations` that fetches
    `/v3/ai_optimization/chat_gpt/llm_scraper/locations`, the Gemini
    equivalent and SERP locations, and writes a reviewed reference file under
    `src/config/`. Never fetched at request time.
  - Claude API: web search tool `user_location = { type: "approximate",
    city?, region?, country (ISO 3166-1 alpha-2), timezone? (IANA) }`; at least
    one field; unsupported country codes return 400 — validate before
    submission.
  - OpenAI API: web search tool `user_location` with the same approximate
    shape (from OpenAI's documentation; not re-fetched in this research pass,
    confirm field names in the adapter's current SDK types).
  - Gemini API: no location parameter for grounding → `none`; tasks for a
    non-default market are `not_applicable` (not run, not failed).
- **Admission:** an audit selects markets; tasks = prompts × engines ×
  markets × repetitions; the estimate scales accordingly; each task freezes
  its market. Schedules store market IDs. The comparison key includes market.
- **Prompt wording vs measurement market** stay separate concepts: a prompt
  naming "Sydney" can be measured from the US market; the UI shows both.
- **Reads:** `market` filter on every visibility read; Visibility → **By
  market** table (mention rate, share of voice, net sentiment if F3, change vs
  previous). MCP and public API gain the filter.
- **Tests:** capability matrix rejects unsupported markets before spend;
  `not_applicable` vs failed; comparison key separation; estimate math.

### F7 owner decisions

- **D7.1** Markets per plan (count limit in entitlements).
- **D7.2** Which DataForSEO locations to allow beyond the current 13.

---

## F8. Fact-checking against brand facts (gated)

**Owner documents:** `docs/onboarding.md` (brand facts), F3 perception owner,
`docs/opportunities.md` (optional rule).
**PRs:** one, after F3, only if D8.1 approves.

### What competitors do

- Peec: companies register facts (pricing, integrations, availability, market
  coverage); claims extracted from tracked answers are marked
  **contradicted, supported, inconclusive or not covered**.
- Profound FactCheck: needs a knowledge base; only factual, actionable,
  **atomic** claims are verified (one assertion each); subjective claims go to
  sentiment; claims grouped into themes; each inaccurate claim lists the
  citation URLs associated with it; reports a representation accuracy rate.

### Architecture

- **Brand facts** (user-owned truth, reviewed like onboarding facts):
  `brand_facts (id, workspace_id, project_id, topic (pricing|plans|
  integrations|availability|markets|policies|specs|company|other), statement
  ≤300 chars, source_url NULL, status (draft|confirmed|retired), revision,
  created_by_member_id, created_at, updated_at)`. Drafts may be suggested from
  onboarding research; only `confirmed` facts are used.
- **Claim extraction** extends the F3 template (same call, new
  `template_version`): `claims[]` for the brand only — atomic factual claim,
  topic, exact quote (substring-validated like F3 aspects). Subjective
  statements are excluded (they are sentiment).
- **Verification** (second model call, only when the response has claims and
  the project has confirmed facts on those topics): input = claims + up to 20
  facts of matching topics; output per claim = verdict
  (`supported|contradicted|inconclusive|not_covered`), `fact_ids` (validated
  subset), confidence. Persist `claim_verdicts` with the exact fact revisions
  used; editing facts never rewrites old verdicts.
- **Metrics:** accuracy = supported ÷ (supported + contradicted), with
  coverage counts for inconclusive and not covered; contradicted claims by
  topic with quotes and answer links; URLs cited in answers that carry a
  contradicted claim (co-occurrence label); per engine and run.
- **Optional Action rule** `fact_contradiction`: target the owned page for the
  topic if one exists, else an earned source; verify on later runs by verdict
  change on the same prompts.
- **Gate:** pilot on two projects; review false-contradiction rate with the
  owner before general release.

### F8 owner decision

- **D8.1** Build after F3 ships and its calibration is acceptable.

---

## F9. Enterprise SSO and SCIM (last)

**Owner documents:** `docs/workspace-access.md`, `docs/invariants.md`,
backlog "Authorized crawl and domain verification" (DNS TXT verification
owner, Part B).
**PRs:** one or two. **Last priority.** Provider decided: WorkOS (D9.1).

### Facts

- WorkOS: SSO $125 per connection per month at 1–15
  connections, volume discounts above; Directory Sync (SCIM) priced the same
  per connection as a separate SKU; audit log streaming $125/month per SIEM
  connection.
- Today: email/password and Google sign-in only; identity origins `public` and
  `operator`; one owned workspace per person; four roles.

### Architecture

- **Prerequisite:** domain verification owner (DNS TXT challenge, append-only
  receipts, re-verification, revocation) from the backlog; SSO and future
  cloud-pull sources reuse it.
- Integration: WorkOS SSO and Directory Sync APIs, called from a new
  `src/auth/workos.ts` adapter through the shared safe fetcher; webhook
  receipt for directory events on `api.citeladder.com` (signed, API-OWNED).
- `sso_connections (id, workspace_id, provider ('workos'), external_id,
  domains text[], enforce boolean, default_role, created_at, disabled_at)`.
- Login: email domain lookup → WorkOS authorization redirect → callback with
  signed state → link or create identity with new origin `sso` → just-in-time
  membership with `default_role`. `enforce` blocks password and Google sign-in
  for members on verified domains, except the Owner's break-glass path.
- SCIM: directory events (user created, deactivated, group changed) →
  membership create, removal and role mapping; removal invalidates sessions,
  revokes MCP grants and API keys created by that member (F4 rule).
- Entitlement `sso` (enterprise plans). Security events for every change.

### F9 owner decisions

- **D9.1** *Decided 2026-10-10:* WorkOS, implemented last.
- **D9.2** Which plan carries SSO and SCIM.

---

## Decisions register

| ID | Question | Recommendation | Answer |
|---|---|---|---|
| D2.1 | Plans and source limits for crawl logs | — | All paid workspaces; not the public trial; 20 sources/project (2026-10-10) |
| D2.2 | Raw request retention | — | 90 days raw; legal text follows the general retention policy (2026-10-10) |
| D2.3 | Privacy/DPA wording | — | Wording in F2a plan (2026-10-10) |
| D2.4 | Filtered Firehose streams stay partial | yes | yes |
| D2.5 | Pull-source complete-coverage rule | as written in F2 | as written (F2b plan) |
| D3.1 | Perception funding | `ai_credits` | Platform-funded via the default Agent gateway (2026-10-10) |
| D3.2 | Perception default on when funded | yes | Always on, no toggle (2026-10-10) |
| D3.3 | Perception model | configured gateway model | Default Agent gateway model (2026-10-10) |
| D4.1 | Public API host | `api.citeladder.com` | `api.citeladder.com`; MCP to `api.citeladder.com/mcp` (2026-10-10) |
| D4.2 | Invariant 10 amendment | approve | MCP writes approved (2026-10-10) |
| D4.3 | Plans with `api_access` | — | All paid plans, 10 keys, 600/min per key, 1,200/min per workspace (2026-10-10) |
| D4.4 | MCP prompt adds activate after confirmation | yes | yes (2026-10-10) |
| D4.5 | Crawl-log ingest on the API host, apex alias kept | yes | API host; apex path deleted, no alias (2026-10-10) |
| D4.6 | MCP origin transition | dual-serve 90 days | Hard cut, no dual-serve (2026-10-10) |
| D6.1 | Adopt observed questions as candidates | yes | No; existing GSC/Search Intelligence data only steers phrasing (2026-10-10) |
| D6.2 | LLM Mentions spend per topic action | yes, within ceiling | No new spend or step (2026-10-10) |
| D6.3 | v3 live calibration before F6 | yes | Not a blocker; compare in the PR if credentials exist |
| D7.1 | Markets per plan | — | |
| D7.2 | Allowed DataForSEO locations | — | |
| D8.1 | Build fact-checking after F3 | after F3 calibration | |
| D9.1 | SSO buy vs build | buy when the first deal needs it | WorkOS, last priority (2026-10-10) |
| D9.2 | SSO plan | enterprise | |

---

## Research appendix

Captured 2026-10-10 so implementers need not search again. Re-verify only if a
provider rejects a request that matches these specs.

### Amazon Data Firehose HTTP endpoint
Source: https://docs.aws.amazon.com/firehose/latest/dev/httpdeliveryrequestresponse.html

- HTTPS on port 443 only. Endpoint must answer within 3 minutes.
- Headers: `X-Amz-Firehose-Protocol-Version` (1.0), `X-Amz-Firehose-Request-Id`
  (opaque GUID, same across retries, best-effort), `Content-Type:
  application/json`, `Content-Encoding: gzip` when enabled,
  `X-Amz-Firehose-Source-Arn`, `X-Amz-Firehose-Access-Key` (configured key
  copied verbatim, ≤4,096 bytes; from Secrets Manager the secret is
  `{"api_key": "..."}`), `X-Amz-Firehose-Common-Attributes` (JSON, optional).
- Body ≤64 MiB before compression:
  `{ requestId, timestamp (ms), records: [{ data: base64 }] }`, 1–10,000
  records, each ≤1,024,000 bytes before base64.
- Response: status 2xx/4xx/5xx; only 200 is success; 413 is permanent failure
  and the batch does not go to the error bucket; all others retried with
  exponential backoff (1 s initial, ×2, ±15% jitter, capped at 2 min) until the
  stream's retry duration, then optional S3 error bucket. No redirects
  followed. `Content-Type: application/json`, no `Content-Encoding`,
  `Content-Length` required, body ≤1 MiB:
  `{ requestId (must match), timestamp (ms), errorMessage? }`.

### CloudFront standard logging (v2) to Firehose
Sources: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/standard-logs-reference.html ;
https://docs.tryprofound.com/agent-analytics/aws_firehose_cloudfront ;
https://getairefs.com/docs/integrations/cloudfront/ ;
https://docs.snowplow.io/docs/sources/cdn-trackers/cloudfront/

- Firehose destinations for CloudFront logging must be in us-east-1.
- Output format JSON; select fields. Field names include `timestamp(ms)`,
  `date`, `time`, `c-ip`, `sc-status`, `cs-method`, `cs-uri-stem`,
  `cs-uri-query`, `x-edge-request-id`, `x-host-header`, `cs(Host)`
  (distribution domain), `cs(User-Agent)`, `cs(Referer)`.
- CloudFront begins to reliably deliver logs about four hours after logging is
  enabled.
- Firehose console "Test with demo data" sends non-CloudFront records.
- Snowplow documents a Firehose data-transformation Lambda that filters on
  `cs(User-Agent)` for AI agents (reference for the CiteLadder template).

### Google Cloud
Sources: https://docs.searchable.com/setup/gcp-logs.md (push + relay, rejected
for CiteLadder) ; https://developers.google.cn/pubsub/docs/subscription-properties ;
load balancer LogEntry examples in the Google Security Operations parser docs.

- Load balancer request logs: `resource.type="http_load_balancer"`,
  `logName: projects/<p>/logs/requests`, `httpRequest.{requestMethod,
  requestUrl, status, userAgent, remoteIp, latency}`, `timestamp`, `insertId`.
- Cloud Run request logs: `resource.type="cloud_run_revision"`,
  `log_id("run.googleapis.com/requests")`, same `httpRequest` fields.
- Pub/Sub message retention: default and maximum 7 days. Unacknowledged
  messages are redelivered after the ack deadline. An empty `pushConfig` means
  pull. Pull returns at most `maxMessages` per call (CiteLadder uses 1,000).
- Granting access on one subscription: `roles/pubsub.subscriber`; reading the
  subscription's configuration (labels) also needs `roles/pubsub.viewer`.
- Logging query language supports regex match `=~` (RE2).

### DataForSEO
Sources: https://dataforseo.com/update/ad-results-support-in-llm-scraper-api ;
https://docs.dataforseo.com/v3/ai_optimization-overview/ ;
https://docs.dataforseo.com/v3/ai_optimization/llm_mentions/search/live/ ;
https://docs.dataforseo.com/v3/ai_optimization/ai_keyword_data/keywords_search_volume/live/ ;
https://dataforseo.com/help-center/what-is-ai-search-volume-in-dataforseo ;
https://docs.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/locations/ ;
https://dataforseo.com/ai-optimization-api

- ChatGPT LLM Scraper returns `chat_gpt_ad` items (fields listed in F5) on Live
  and Task GET Advanced since 28 May 2026.
- LLM Scraper covers ChatGPT and Gemini web versions; supports
  `location_code`/`language_code`; locations list at
  `GET /v3/ai_optimization/chat_gpt/llm_scraper/locations` (CSV also offered).
- LLM Mentions: `POST /v3/ai_optimization/llm_mentions/search_mentions/live`
  (the older `/llm_mentions/search/live` is legacy); platforms `google` (AI
  Overview) and `chat_gpt`; `search_scope` any, question, answer,
  brand_entities, fan_out_queries; sortable/filterable by `ai_search_volume`;
  ChatGPT data US/English only; up to 120 s execution; $0.10 per request plus
  $0.001 per row; database of 280M+ prompts.
- AI Keyword Data: `POST /v3/ai_optimization/ai_keyword_data/keywords_search_volume/live`,
  up to 1,000 keywords, returns `ai_search_volume` and 12-month
  `ai_monthly_searches`. Methodology: proprietary estimate using signals
  including Google People Also Ask; grammatical forms merged; multi-word
  keywords count only questions containing all the words.

### Answer-engine location parameters
Source: https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-search-tool

- Claude web search tool: `user_location { type: "approximate", city, region,
  country (ISO 3166-1 alpha-2; unsupported codes return 400), timezone (IANA) }`;
  at least one field.
- OpenAI web search: `user_location` approximate with country, city, region,
  timezone (from OpenAI docs; confirm against the SDK types in use).
- Gemini grounding: no location parameter identified.

### Competitor definitions (for metric design only)
Sources: https://docs.peec.ai/metrics/brand-metrics/sentiment ;
https://help.peec.ai/article/how-can-i-interpret-sentiment-3ov3gw7f1momd8nfl73ugxhk ;
https://aithority.com/?p=610807 (Peec brand perception) ;
https://help.tryprofound.com/articles/3189907319 (Profound sentiment) ;
https://help.tryprofound.com/articles/5793584301 (Profound FactCheck)

- Peec sentiment 0–100, most 65–85, ~65 neutral, compare against competitors.
- Peec fact-checking verdicts: contradicted, supported, inconclusive, not
  covered; facts such as pricing, integrations, availability, market coverage.
- Profound sentiment: positive/negative split, themes and attributes with
  exact language, negative drivers = most-cited pages with negative claims,
  competitor comparison.
- Profound FactCheck: atomic factual claims only, subjective claims routed to
  sentiment, themes, citation URLs per inaccurate claim, accuracy rate.

### Identity brokers
Source: https://us.fitgap.com/products/workos (WorkOS price table)

- WorkOS SSO $125/connection/month (1–15), $100 (16–30), $80 (31–50), $65
  (51–100), $50 (101–200); Directory Sync same table, separate SKU; audit log
  streaming $125/month per SIEM connection, retention $99/month per million
  events.

---

## Log

| Date | Feature | Event |
|---|---|---|
| 2026-10-10 | all | Tracker created from a competitor review of Peec AI, Searchable and Profound docs and a read of the repository. Owner direction: F1 is a docs correction (consumer capture and schedules exist); sentiment, crawl-log connectors and the public API/MCP writes are to be built; enterprise SSO/SCIM moves last (Feedonomics is not a customer); agency reporting ignored for now. |
| 2026-10-10 | F2, F3, F4, F9 | Owner decisions: crawl logs on for every paid workspace, off for the public trial; `api.citeladder.com` hosts the public API, crawl-log ingest and MCP (`/mcp`); MCP writes approved; perception model calls are platform-funded through the default Agent gateway; SSO/SCIM via WorkOS, last. F4 split into three PRs (API, MCP move, MCP writes). |
| 2026-10-10 | F1 | Done, narrowed by the owner: public copy must not name DataForSEO or add engines to the landing page or docs site, so the landing strip and trial copy are unchanged. The API-only claim is corrected (FAQ, Measure page, llms.txt and docs Visibility page now say answers come from consumer apps and provider APIs), the docs Visibility page gains a Schedule audits section linked from Prompts and Quickstart, and the changelog records it. Internal: DataForSEO surfaces follow the project search context (US/English/desktop default) validated against `dataforseo.json`, so visibility-prompt.md no longer claims a scraper-only US/English allowlist. |
| 2026-10-10 | F2–F6 | Per-PR plans written (F2a, F2b, F3, F4a, F4b, F4c, F5, F6) after code verification. Owner decisions: hard cut for the crawl-log ingest path and MCP origin (no aliases or dual-serve); 90-day raw crawl retention under the general retention policy; perception always on, docs-only announcement; `api_access` on all paid plans with 10 keys; MCP prompt adds active after confirmation; F6 reuses existing Search Console and Search Intelligence data with no new step or spend, F6b backlogged. Everything is greenfield: no backfills or legacy handling. |
| 2026-10-10 | F3 | Done: answer perception on the analytics queue (`answer_perception`), `answer_perceptions`/`entity_sentiments` replacing the `sentiment` placeholders, the Perception tab, evidence labels and quotes, the launcher notice and `read_perception` with skill lines. The calibration eval was not run live (no provider calls from this change). |
| 2026-10-10 | F2 | F2a in review: `crawl_logs` grant on paid plans with the kill switch on, `stalled` sources, daily received-bytes ceiling, `api.citeladder.com` on its own asset-free Worker with ingest hard-cut to `/v1/...`, CloudFront v2 preset, Firehose adaptor and per-source gap bound, generated filter Lambda, privacy/DPA wording. Owner performs the API host DNS step from the Workers runbook. |
| 2026-10-10 | F5 | In review: `parseAds` with the source walker skipping ad nodes, `answer_ad_observations` and `response_analyses.ads_parser_version` written in the analysis transaction with frozen competitor ids, `GET /visibility/ads`, the Ads tab, execution-evidence ads and `read_ai_ads` with skill lines. `competitor_id` has no foreign key because project saves replace competitor rows. No backfill (greenfield). |
| 2026-10-10 | F6 | In review: `prompts/observed-queries.ts` reads the latest query snapshot's non-branded Search Console queries and the latest published Search Intelligence keyword datasets in the project language (competitor-free, query-shaped, topic-bound, 50 per topic); slots carry up to three same-topic examples sent as `buyer_search_examples` under a grounding rule (`prompt-gen-v5`); observed-copy covers every grounding search; `observed_query` evidence refs, `grounding` provenance counts, `grounded` on candidates and `read_prompt_portfolio`, the review tag, the calibration grounded split and the eval `observed_likeness` metric with `--grounding` off, on or both. The live eval was not run (no provider calls from this change). F6b backlogged. |
| 2026-10-10 | F2, F5, F6 | F5 (#354) and F6 (#355) merged. F2b in review: `gcp_pubsub_pull` sources (kind `pull`) read by the keyless `citeladder-log-reader` service account the runtime impersonates, a per-source label nonce verified before activation and daily, generated RE2-escaped sink filter with an update prompt and confirmation, `crawl_log_pull` (300 s lease, ack after commit, drained receipts), and the D2.5 pull coverage rule from receipts with no coverage-history table. Owner applies Terraform (reader service account, `CRAWL_LOG_READER_EMAIL`) and re-runs the bootstrap for the Pub/Sub API. |