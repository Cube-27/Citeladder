---
title: 'AI Traffic'
description: 'Read crawler requests, AI referral sessions and coverage, and configure customer-operated crawl logs.'
group: 'Measure and understand'
order: 145
---

AI Traffic separates crawler **requests**, GA4 referral **sessions** and citations
**observed in CiteLadder's tracked answers**. A crawler request does not prove a
session or a citation. Unmatched log lines are discarded and do not measure human
traffic. AI crawler logs are included in paid plans; see
[Availability and retention](#availability-and-retention).

## Read the screen

Overview shows each signal's units and freshness. Crawlers breaks recognized bots
down by purpose, verification, response status, folder and resource. Referrals
keeps the saved GA4 source/medium report's range and interval controls, with
Overview, Sources and Landing pages views. Sources show key events as configured
in your GA4, engagement rate, transactions and revenue in the property's currency.
Overview compares AI referrals, Organic Search and all other sessions across the
whole property. Landing pages include only project-owned hosts and disclose
unattributed sessions and excluded hosts. Activity shows sanitized requests
within retention and exports the selected filters.

Pages joins each path's crawler requests, AI referral sessions and key events,
tracked citations and latest Site Health findings. Each measure shows its own
coverage and availability. Filter by folder, resource class and verification,
choose the sort, page through saved results or export matching rows as CSV.
Open a path from Pages, referral landing pages, crawler drill-downs or Site Health
to see its first and last crawl, first referral, citation dates and links to each
owning view. Query strings and fragments are excluded from path identity.

Observed crawl coverage compares recognized AI search and user-fetch requests with
known URLs in the latest terminal Site Health inventory. It requires complete
or declared-complete collection and shows the inventory date and sampling limits.
It does not prove that a page is indexed.

Overview's observed patterns describe co-occurrence: verified requests without
identifiable referrals, referrals without recent recognized AI requests, crawler
errors on valuable pages and concentration of AI-referral key events. Absence
patterns require complete collection and complete, unflagged GA4 extracts for
the whole window. Incomplete coverage shows a notice. AI apps can strip referrers;
these patterns cannot establish causation or attribute a session to a crawl.

GA4 AI-source sessions are the share numerator; all sessions in that same report
are the denominator. The visible AI-source rows are not total site traffic. An
unavailable provider report and measured zero are different states. Connect GA4
through Settings → Integrations and sync before interpreting the Referrals tab.

## Coverage and verification

- **Complete:** an unsampled live source covers a completed reporting day with
  no receipt gap above the configured bound, including empty heartbeats.
- **Declared complete:** a completed file scan reports a full day. This is
  client-reported, not independently verified provider coverage.
- **Partial:** sampled or filtered logs, delivery gaps, incomplete scans or
  best-effort Worker delivery. Worker-template collection is always at most partial.
- **Unknown:** no usable observations or coverage evidence for the day.

Zero is measured only under complete or declared-complete coverage. Otherwise,
absence means no matching requests were observed in the available logs. Review
source diagnostics, sampling and receipt gaps before drawing conclusions.
Reporting days use the captured GA4 property timezone, or UTC before capture.
The last 30 days, 90 days and 12 months end on the current reporting day, which
counts its requests but cannot make a window incomplete.
Older rollups retain their recorded timezone; a mismatch marks the crawl and
referral measures non-comparable. Quality flags disclose thresholding, other-row
loss, sampling or a failed or truncated replacement report. A failed
partition uses the prior complete revision; missing flagged evidence never
becomes measured zero. Requests, path-level pages, sessions and
citations have separate meanings; no cross-unit conversion rate is calculated.

The default verification filter includes verified and unverifiable requests.
Failed verification is separately available. Unverifiable reasons distinguish
missing IPs, absent published ranges and missing or stale range snapshots. A
malformed IP is unverifiable rather than a failed range check. A
historical import may be verified against a **later snapshot** rather than one
contemporaneous with the request; Activity discloses that basis. An IP outside a
later snapshot's ranges is unverifiable, not failed, because published ranges change.

## Before connecting

An Owner or Admin opens **Connect crawl logs** from Overview or Settings →
Integrations. Choose a method, site origin, collection point and actual sampling.
The host must belong to the project. Only one active live source covers a host;
file uploads are backfill and cannot overlap days from another source of that host.

Copy the endpoint and `clw_` token when issued. Endpoints are on
`https://api.citeladder.com`, the host for machine senders. Store the token as a
secret; it is shown once. Send it in the `Authorization: Bearer <token>` header
(Amazon Data Firehose sends it as its access key), never in an event body or a
public URL. Rotation immediately invalidates the old token.
Revocation stops collection and retains history.

## Cloudflare Worker

1. Create a Cloudflare Worker source for the exact site origin.
2. Download the [Worker template](/templates/citeladder-crawl-log-worker.js).
   Review it and deploy it in your own Cloudflare account.
3. Set `CITELADDER_INGEST_URL` to the issued HTTPS endpoint and store
   `CITELADDER_CRAWL_TOKEN` as a **Worker secret**. Keep the timeout in the generated
   template bounded; it currently uses 5 seconds.
4. Route the Worker over your site. Set the route to **fail open** so that
   requests reach the origin if the Worker hits its quota.
5. Inspect Workers logs for ingestion failures and AI Traffic for accepted
   batches, processing time and partial coverage.

The template fetches the visitor's response first, captures its real status,
and buffers only catalog-matched events. Ingestion failure
does not change or delay the visitor response. It takes IP and Ray ID from
Cloudflare headers and forwards a queryless path. CiteLadder uses the IP
transiently for verification and does not retain it.

Each Worker instance buffers matched events and sends them as one batch, using
`ctx.waitUntil`, once the oldest has waited 60 seconds or 300 are pending. A
buffer is lost if Cloudflare retires the instance before it sends, and the
template does not retry a rejected batch, so this is best-effort delivery.
Cloudflare cancels unfinished `waitUntil` work after about 30 seconds. **Every
routed request counts against your Workers quota**, even when no event is sent.
Use Logpush or a durable shipper for reliable delivery. The current source quota
is 600 batch attempts per hour.
See [Worker context](https://developers.cloudflare.com/workers/runtime-apis/context/),
[Workers limits and fail-open behavior](https://developers.cloudflare.com/workers/platform/limits/)
and [Cloudflare request headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/).

## Cloudflare Logpush

1. Create a Cloudflare Logpush source with NDJSON format and the actual sampling
   policy. Confirm your Cloudflare plan supports HTTP request Logpush.
2. Choose the zone's `http_requests` dataset and HTTP destination. Set
   `destination_conf` to the issued endpoint with
   `?header_Authorization=Bearer%20<TOKEN>` in the **private Cloudflare job
   configuration**. Cloudflare converts that parameter to the HTTP header;
   do not send the token in the ingest URL's query string.
3. Select `EdgeStartTimestamp`, `ClientRequestHost`, `ClientRequestPath`,
   `ClientRequestMethod`, `EdgeResponseStatus`, `ClientRequestUserAgent`,
   `ClientIP` and `RayID`. Choose `timestamp_format: "rfc3339"`.
4. Bound delivery with `max_upload_bytes: 5000000` and
   `max_upload_records: 1000`. The receiver currently allows 5 MiB compressed
   **and decompressed**, 5,000 lines and 16 KiB per line. Larger batches return
   413; revise the sender rather than retrying the same oversized payload.
5. Cloudflare's gzipped `{"content":"tests"}` destination check is accepted
   with the token. It is a validation receipt and does not count as coverage.
6. Check Logpush job health, delivery gaps and sampling. For periods without
   deliveries, a customer-operated shipper must send empty heartbeats with a
   unique `Idempotency-Key` for each delivery to support complete coverage.
   Missing heartbeat keys return 422. Logpush alone does not prove those
   quiet periods complete.

Field names, RFC3339 output and the HTTP probe/header protocol follow
[Cloudflare's HTTP requests fields](https://developers.cloudflare.com/logs/logpush/logpush-job/datasets/zone/http_requests/)
and [HTTP destination guide](https://developers.cloudflare.com/logs/logpush/logpush-job/enable-destinations/http/).
Keep source IP enabled only when you want verification; CiteLadder does not persist IPs.

## Amazon CloudFront (Firehose)

CloudFront standard logging (v2) sends JSON logs to an Amazon Data Firehose
stream, which batches, compresses and retries them and delivers to CiteLadder's
HTTP endpoint. In the connect dialog choose **Amazon CloudFront**, enter the
stream's buffer interval, and create the source; the dialog shows the endpoint
(`https://api.citeladder.com/v1/crawl-logs/firehose/<source id>`) and token.

1. In **us-east-1** (CloudFront log delivery to Firehose requires it), create a
   Firehose stream: source **Direct PUT**, destination **HTTP endpoint**.
   - Endpoint URL: the issued endpoint. Access key: the `clw_` token.
   - Content encoding **GZIP**.
   - Buffer size **1–3 MiB**. The request envelope adds about a third for
     base64, and a request over 5 MiB, compressed or decompressed, is refused
     with 413, which Firehose drops without backing it up.
   - Buffer interval **60–300 seconds**; enter the same value in CiteLadder.
   - Retry duration **3600 seconds**, and S3 backup for **failed data only**.
2. On the distribution, open **Logging → Add → Amazon Data Firehose**, choose
   the stream and output format **JSON**, and select these fields:
   `timestamp(ms)`, `c-ip`, `sc-status`, `cs-method`, `cs-uri-stem`,
   `x-edge-request-id`, `x-host-header` and `cs(User-Agent)`.
3. Test with a real page visit. The Firehose console's **Test with demo data**
   sends records that are not CloudFront logs; they show as an unsupported-format
   batch. CloudFront can take about four hours after logging is enabled to
   deliver reliably.

CiteLadder reads the viewer's `x-host-header`, not `cs(Host)` (the distribution
domain), so the host must belong to the project. A `-` value counts as absent;
without `timestamp(ms)` the `date` and `time` fields are read as UTC. CloudFront
percent-encodes the user agent and CiteLadder decodes it before matching; this
was verified against a fixture built from CloudFront's field list. The query
string is never read. Requests are matched against the crawler catalog; other
lines are discarded and do not count against the accepted-line quota.

Only a 200 response counts as delivered. 400 means the request or its records
are not CloudFront JSON, 401 a wrong or revoked token, 409 a revoked source,
paused collection or a plan without AI crawler logs, 413 an oversized request
and 429 a quota. Firehose retries everything except 413 until its retry duration
ends, then backs the batch up to S3. A retried request keeps its request ID, so
it is accepted once. A complete reporting day needs an unfiltered stream with no
gap between deliveries longer than the buffer interval plus five minutes.

### Filter Lambda (optional)

Unfiltered streams send every request, which counts toward the daily volume
limit below. To send crawler requests only, download the
[filter Lambda](/templates/citeladder-firehose-filter.mjs), deploy it on the
Node.js runtime and add it as the stream's data transformation. It keeps log
lines whose user agent matches the crawler catalog it was generated from (the
file names the catalog version) and drops the rest. Tick **The stream runs the
CiteLadder filter Lambda** when you create the source: quiet periods then send
nothing, so coverage stays partial.

## Custom webhook

Use NDJSON, a JSON array, or Apache/Nginx Combined with a user agent. Plain Common
Log Format lacks the fields needed for crawler identification and is refused.
Custom JSON records use these field names:

```json
{
  "timestamp": "2026-10-02T12:00:00Z",
  "host": "example.com",
  "path": "/guide",
  "method": "GET",
  "status": 200,
  "user_agent": "GPTBot/1.0",
  "client_ip": "192.0.2.1",
  "request_id": "sender-stable-id"
}
```

`timestamp`, `path` and `user_agent` must be present. Timestamp includes a timezone;
status must be a valid numeric HTTP status. Host defaults to the declared source
host when unavailable. IP and request ID are optional. Do not include cookies,
authorization headers or bodies. CiteLadder strips query strings and fragments and
redacts configured secret path segments, which cannot join an exact page identity.

Send POST to the issued HTTPS endpoint with the Bearer header. Send
`Content-Encoding: gzip` for compressed batches. Use a stable `Idempotency-Key`
for each retry; without a key, the receiver uses the body's SHA-256. Empty heartbeats need
a **distinct key for each interval** because their bodies are identical.
Without a provider request ID, identical mapped lines from one source collapse;
distinct requests with identical fields cannot be distinguished.

Batch at least 60 seconds apart and keep within the bounds above. Current
configuration permits 600 batch attempts per source per hour and one million
accepted lines per project per day. A 202 response acknowledges durable receipt and
queues processing; 401 rejects the token, 409 means paused collection, a plan
without AI crawler logs, a revoked source or a conflicting state, 415 rejects an unsupported encoding or media type, 422 rejects a batch in which
no line has the identifying fields, and 429
includes `Retry-After`. Keep a durable retry queue and honor that delay. Do not
log request bodies, IPs or tokens in your shipper. Current backdating admission
is 80 days and future clock skew is bounded to one hour.

## File upload

Choose an upload source and NDJSON, JSON array or Combined file, optionally
gzipped. Your browser streams and decompresses the file, checks a header sample
and sends only recognized lines. The server reapplies scope, verification,
privacy, quotas and deduplication; local filtering is not an authorization boundary.

The file is read in the format chosen when its upload source was created.
Progress shows scanned and recognized counts. If an upload stops, **Resume
upload** continues it with the same file from the last acknowledged batch. Scan
counts and the timestamp span are client-reported; CiteLadder derives full days
from them, and a day another source already covers is left out of the file's
declaration. A zero-match file can complete its scan without sending unmatched
lines. A partial-day scan remains partial. A line without the identifying fields
is skipped; a file with none of them reports the missing fields and never becomes
zero requests. Results appear once processing finishes, usually within a few
minutes.
Uploads idle for 24 hours are abandoned; accepted rows remain available.

## Source states

Each source row shows **Active**, **Stalled** or **Revoked**. A stalled source is
live but not delivering, and its coverage is not complete; the row says why:

- **No accepted batches for a day:** no batch was accepted for 24 hours. Check
  that the sender is still running.
- **Plan without AI crawler logs:** batches are refused because the workspace's
  plan no longer includes them.
- **Oversized batch:** a Firehose request over 5 MiB was dropped. Lower the
  stream's buffer size.

The next accepted batch clears the stall.

## Availability and retention

AI crawler logs are included in every paid plan. The public trial shows AI
Traffic's Referrals view with a link to choose a plan, without connect options.
If a plan stops including them, existing reports stay readable and new batches
are refused with 409. CiteLadder can pause collection for every workspace; the
screen then says so and batches are refused until it resumes.

A project accepts up to 2 GiB of decompressed log data per reporting day. Beyond
that, batches return 429 with `Retry-After` set to the start of the next
reporting day, and the source keeps a receipt of the refusal.

CiteLadder uses the client IP address only while processing a record, to verify
that a crawler is genuine, and does not store it. Detailed request records are
deleted after 90 days; daily summaries, coverage and receipts are kept as project
data under the retention terms of the [Privacy Policy](https://citeladder.com/privacy).
Folder breakdowns are bounded; verification reason breakdowns and Activity
exports cover retained detailed records.
