# F2b — AI Traffic GCP connector (Cloud Logging → Pub/Sub → CiteLadder pull)

Competitive tracker row F2, PR 2 of 2. **Requires [F2a](F2a-ai-traffic-api-host-and-aws.md)
merged** (entitlement, `stalled` state, gap-bound generalisation).
Owner documents: [AI Traffic](../ai-traffic.md), `infra/gcp/identity.tf`,
[GCP runbook](../operations/GCP_RUNBOOK.md).

Complete for implementation; decisions are settled. Follow `CLAUDE.md`, the
test skill and the TypeScript skill. Verified at 8a0647035.

## Settled decisions

| ID | Decision |
|---|---|
| Pull, not push | Push sends one HTTP request per message and burns the free-tier request budget. CiteLadder pulls up to 1,000 messages per call. |
| Identity | Dedicated service account `citeladder-log-reader`; runtime SA impersonates it via IAM Credentials. No JSON keys, no gRPC client. |
| Confused deputy | Label `citeladder-source=<nonce>` on the subscription is required and re-verified daily. |
| D2.5 | Pull-source coverage `complete` rule as below (tracker recommendation accepted). |
| Cadence | Pull task due every `pull_interval_seconds` (300). The runner only drains when woken (Cloud Scheduler tick `*/10`, `infra/gcp/variables.tf:155`), so the real cadence is ≤10 min; `max_pull_gap_minutes` 30 covers that. |
| Greenfield | No migration of existing sources; the baseline edit is enough. |

## Current state (verified)

- No IAM Credentials or Pub/Sub code exists. `src/projects/safe-fetch.ts` is
  GET-only and SSRF-pinned — **do not** use it for Google APIs. Precedent for
  plain `fetch` + metadata token: `src/workers/start-runner.ts:30-52`.
- `infra/gcp/identity.tf` has db, runtime, scheduler SAs only.
- Queue: generic `analytics_tasks` (`task_kind varchar(32)`), executors map
  `src/workers/analytics-worker.ts:56-77`, kinds catalog
  `src/config/analytics.json` `tasks` → `policy.analytics.ts_owned_task_kinds`,
  `lease_ttl_seconds` 120 (analytics.json:9). Enqueue helper
  `src/referrals/enqueue.ts` `enqueueTask(db|trx, …)` with idempotent key.
  Crawl-log periodic work: `crawlLogTick` (`src/crawl-logs/maintenance.ts:158`),
  lane `crawl-log-maintenance` (`src/workers/runner.ts:319`).
- Unique index `uq_crawl_log_live_host` (`0001_baseline.sql` ~:4884) is
  `WHERE kind='webhook'`.
- Coverage: generalised by F2a to a per-source gap bound.

## Design

### Schema (`crawl_log_sources`, baseline edit)

`kind` check gains `pull`; `setup` gains `gcp_pubsub_pull`. New nullable
columns: `subscription varchar(255)` (format
`projects/<p>/subscriptions/<s>`, validated), `verification_nonce varchar(26)`,
`verified_at`, `verification_checked_at`, `filter_catalog_version varchar(16)`,
`filter_confirmed_at`, `declared_sample_rate numeric(4,3)`, `last_pull_at`,
`last_drained_at`. Token columns stay null for pull. Change
`uq_crawl_log_live_host` to `WHERE kind IN ('webhook','pull')` and the
`active` predicate it already uses. Add a coverage-history table only if the
day rule cannot be computed from persisted pull receipts: prefer recording
each drain as a `crawl_log_batches` receipt with `origin='pull'`,
`drained boolean`, so coverage reads receipts like webhooks.

### Terraform

`identity.tf`: `google_service_account.log_reader` (`citeladder-log-reader`);
`google_service_account_iam_member` granting the runtime SA
`roles/iam.serviceAccountTokenCreator` on it. `outputs.tf`: email. Runtime
config `CRAWL_LOG_READER_EMAIL` (`src/config.ts`, `.env.example`, Cloud Run
env in Terraform). Empty → connector unavailable: source list availability
`pull_unavailable` and the GCP option is hidden with "not available in this
environment" (local dev).

### Google REST client `src/crawl-logs/gcp-client.ts`

Plain `fetch`, injectable transport for tests, bounded timeouts:
1. Metadata token: `GET http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token`
   (`Metadata-Flavor: Google`).
2. `POST https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/<email>:generateAccessToken`
   `{scope:["https://www.googleapis.com/auth/pubsub"], lifetime:"900s"}`.
   Cache per process until 60 s before expiry.
3. `GET https://pubsub.googleapis.com/v1/{subscription}`,
   `POST {subscription}:pull {maxMessages:1000}`,
   `POST {subscription}:acknowledge {ackIds}`.
Errors map to `permission_denied | not_found | unavailable | invalid`.

### Verification `src/crawl-logs/gcp-verify.ts`

Before activation and daily (from `crawlLogTick`): read the subscription;
require label `citeladder-source == verification_nonce`, empty `pushConfig`,
`ackDeadlineSeconds ≥ 60`. Failure → `stalled`, reason
`verification_failed` (detail: `label_mismatch | push_subscription |
ack_deadline | permission_denied | not_found`); no pulls until a later check
passes. Nonce: 26 chars lowercase base32 (valid GCP label value), generated
at source creation, shown in the setup commands.

### Filter generator `src/crawl-logs/gcp-filter.ts`

Output (RE2, escape every pattern):
```
(resource.type="http_load_balancer"
  OR (resource.type="cloud_run_revision" AND log_id("run.googleapis.com/requests")))
AND httpRequest.userAgent=~"(?i)(<escaped ua_patterns joined by |>)"
```
Generated from `src/config/crawlers.json`; source stores
`filter_catalog_version` at creation. When the catalog version changes,
the source row shows "Update your sink filter" with the new filter and a
**I've updated it** button (`POST …/sources/{id}/filter-confirmation`,
records version + time). Docs site shows the current filter (generated at
build like the MCP reference, with a `--check`).

### Pull task `crawl_log_pull`

- Register in `analytics.json` tasks and `EXECUTORS`; enqueue from
  `crawlLogTick` for each active, verified pull source whose
  `last_pull_at` is older than `pull_interval_seconds`; idempotency key
  `crawl_log_pull:<source_id>:<interval bucket>` (coalesced).
- Lease: per-kind lease override ≥ 2× the subscription ack deadline used
  (120 s → 300 s); add a per-kind override in analytics config if one does
  not exist.
- Loop ≤ `pull_max_iterations` (10): pull 1,000 → decode `message.data`
  base64 → JSON LogEntry → map (table) → `ingest()` in its own transaction
  with idempotency key `pull:<source_id>:<first messageId>:<last messageId>`
  and `origin='pull'` → **after commit** acknowledge. Ack failure only
  causes redelivery, deduped by `request_id`. Zero messages → record
  drained receipt, set `last_drained_at`, stop. Commit before network I/O
  (the receipt row for an iteration commits before ack; the pull call is
  made outside any open transaction).
- Permission/not-found → `stalled` with reason; no retries until the next
  daily verification.
- Unknown resource types count as unsupported lines, not failures.

| CiteLadder field | LogEntry |
|---|---|
| timestamp | `timestamp` |
| host, path | parse `httpRequest.requestUrl`; drop query and fragment (IP hosts are dropped by host scope) |
| method | `httpRequest.requestMethod` |
| status | `httpRequest.status` |
| user_agent | `httpRequest.userAgent` |
| client_ip | `httpRequest.remoteIp` (transient) |
| request_id | `insertId` |

Add preset `gcp_log_entry` to the contracts mapping (structured, not NDJSON
field names) or map in `src/crawl-logs/gcp-entry.ts` before `ingest()`;
prefer the mapper module and pass already-normalised lines.

### Coverage rule (D2.5)

A reporting day is `complete` only when all hold: source active and verified
the whole day; `filter_catalog_version` equal to the catalog version all day
(or confirmed before the day began); `declared_sample_rate = 1.0`; no gap
between successful drains > `max_pull_gap_minutes` (30); a drain completed
≥ `pull_settle_minutes` (15) after the day closed. Otherwise `partial`, with
the failing condition as the reason shown in the coverage strip.

### Setup dialog

New GCP option in `crawl-log-setup.tsx`: inputs subscription path and
declared LB sample rate (default 1.0). Shows generated commands with the
nonce, project placeholder and reader email:
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
  --member=serviceAccount:<reader email> --role=roles/pubsub.subscriber
gcloud pubsub subscriptions add-iam-policy-binding citeladder-ai-crawlers-sub \
  --member=serviceAccount:<reader email> --role=roles/pubsub.viewer
```
Plus: enable LB logging with `--enable-logging --logging-sample-rate=1.0`;
customer pays Cloud Logging routing and Pub/Sub (UA filter keeps it small).
**Verify** button runs verification synchronously (one subscription GET,
bounded timeout; this is a command, not a read) and activates on success.

## Commit slices

1. Schema, contracts (`setup`, `kind`, new fields, stall reasons,
   availability `pull_unavailable`), source reads.
2. Terraform + config + REST client with fake transport.
3. Filter generator + docs generation check; verification + daily recheck.
4. Pull task, mapper, ack-after-commit, coverage rule, stalled handling.
5. Setup dialog, filter-update prompt, docs, runbook, backlog cleanup.

## Affected surfaces checklist

- **Backend:** new `crawl-logs/{gcp-client,gcp-verify,gcp-filter,gcp-entry,pull}.ts`;
  `sources.ts`, `source-reads.ts`, `rollup.ts`, `maintenance.ts`,
  `routes/crawl-logs.ts` (verify + filter-confirmation commands, family
  `crawl-logs`), `workers/analytics-worker.ts`, `config/{analytics.json,crawl-logs.json}`, `config.ts`.
- **Schema/contracts:** as above; regenerate `db-schema.ts`.
- **Infra:** `infra/gcp/{identity.tf,outputs.tf}` and Cloud Run env.
- **App UI:** `crawl-log-setup.tsx`, `crawl-log-connections.tsx` (verified
  state, last drain, filter-update prompt, stall reasons),
  `lib/config/crawl-logs.ts`.
- **Marketing:** `lib/marketing-content/llms.ts` log-source list — add
  "Google Cloud load balancer and Cloud Run logs". Nothing else.
- **Docs site:** `apps/docs/src/content/ai-traffic.md` — "Google Cloud
  (Pub/Sub)" guide with commands, filter, costs, coverage conditions;
  `changelog.md`.
- **Internal docs:** `docs/ai-traffic.md` (pull sources, verification,
  coverage rule), `docs/operations/GCP_RUNBOOK.md` (reader SA, env),
  `docs/invariants.md` only if coverage semantics wording there is
  webhook-specific, `docs/plans/backlog.md` (remove "additional log
  providers" for GCP), tracker status + log.
- **MCP/Agent:** no new tool; existing traffic reads already expose coverage
  reasons — confirm the new reasons render as text.

## Tests

Filter escapes regex metacharacters and changes with `catalog_version`;
verification stalls on label mismatch, push config, short ack deadline,
permission denied; pull loop (fake transport) acks only after commit,
redelivery dedupes, drain sets `last_drained_at`, permission error stalls;
token cache refresh; coverage rule boundaries on real PostgreSQL rollups;
live-host uniqueness with `pull`; workspace isolation.

## Validation

Focused crawl-log tests while iterating; `./scripts/check.ps1` once at the
end (schema, queue, infra). `terraform validate` if available locally;
never `apply` (owner deploys).

## Done when

A paid workspace can add a GCP source, verify it and see drains; the docs
show the generated filter; tracker row F2 is `done`.
