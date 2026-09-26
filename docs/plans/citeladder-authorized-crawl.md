# Authorized crawl, domain verification and AI crawlability

## Status and boundaries

Status: queued; plan saved on 26 September 2026. Implementation has not
started. This document specifies future work, not shipped behavior or
permission to execute it.

It builds on the robots policy shipped with audit remediation PR 2 (see the
[Site Health table](../site-health.md#acquisition-and-evidence-guarantees)) and
on the owned-site authority receipts that
[audit remediation](citeladder-audit-remediation.md) Section 4 still requires.
Extend those owners; do not create a second authority store, receipt table,
security-event writer or crawl policy engine.

The customer-facing Terms wording below is a draft for Cube27 legal review. Do
not publish it, and do not enable authorized crawling in production, until that
review approves it.

## Problem

Site Health honors robots.txt for every crawl. That is right for third-party
and competitor domains. A customer auditing its own site, however, may
deliberately disallow generic bots and still want CiteLadder to analyze the
excluded pages. Today the only remedy is for the customer to edit robots.txt.

Two different questions also need separate answers:

- **Authorized crawl:** may CiteLadder inspect this website?
- **AI crawlability:** can ChatGPT, Claude, Gemini, Perplexity and other AI
  crawlers access this website, and do they actually try?

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

Authorized mode changes only how robots directives are applied. It never adds
credentials, cookies, header spoofing, challenge solving, higher rate limits,
or an alternative user agent. Host pacing, concurrency, admission, SSRF
controls, durable suppression and the platform kill switch apply unchanged.
Operator suppression (`scripts.acquisition_control`) always overrides
authorization.

Authorization applies to one exact registrable domain, and optionally its
subdomains, of the project's configured site. It never applies to competitor,
source-page or earned-source acquisition, which always use Standard mode.
The fetcher checks every destination request, including each redirect hop,
against the crawl's frozen authorization receipt before network I/O,
alongside the existing SSRF and DNS-pinning checks. A redirect leaving the
authorized domain falls back to Standard robots handling for that hop and
never inherits the authorization.

## Authorization paths

1. **Domain verification (preferred).** DNS TXT record
   (`citeladder-verification=<token>`), an HTML file at a well-known path, or a
   `<meta>` tag on the root page. Verification is an explicit user command that
   commits a pending challenge, then performs bounded network I/O; reads only
   render persisted state. Re-verify on a config-owned schedule. A failed
   re-verification downgrades to Standard and records why.
2. **Authorization attestation (agencies).** An Owner/Admin confirms:
   "I confirm that I own this website or have authorization from the website
   owner to crawl and analyze it." This suits agencies that cannot edit client
   DNS. Attestation is limited to the project's own configured domain and is
   shown as unverified.
3. **Evidence of control from connected infrastructure.** A connected CDN log
   source or DNS provider for the domain (see below) may satisfy verification,
   provided the connection proves control of that exact domain.

Every grant, verification, downgrade and revocation is an append-only receipt:
workspace, project, domain, actor, timestamp, path, authorization/terms
version, and bounded request metadata (IP and session identifiers). Reuse the
PR 1 policy-acceptance and security-event owners. Authorization is
workspace-scoped, never `user_id`-scoped. A crawl freezes the authorization
receipt ID it ran under, so historical results keep their provenance.

## Product surface

Website → crawl settings:

- **Crawl authorization:** Standard — follow the website's robots.txt; or
  Authorized — "I own this website or have permission from its owner to crawl
  it."
- Beneath it: "When authorized, CiteLadder may crawl pages excluded by
  robots.txt for Site Health analysis. Authentication, firewall restrictions,
  CAPTCHAs and rate limits are never bypassed."
- Status chip: *Domain verified*, *Authorized (attested)* or *Standard*.
- Name the setting "Authorized crawl", never "Ignore robots.txt".
- Crawl results distinguish "excluded by robots, crawled under authorization"
  from ordinary pages, and show `access_blocked` URLs with guidance to allow
  the crawler.

## AI crawlability and crawl insights

These are separate from authorized crawling and can ship independently.

- **Robots crawlability.** Extend the existing site facts stance (currently
  four bots) to a config-owned bot catalog grouped as Training, Search, User
  query and Other. Report Allowed, Partial, Blocked and Not specified per bot.
  Keep robots.txt history as immutable snapshots with a diff view.
- **Crawl insights from connections.** A connection is access to observe
  *other* crawlers hitting the customer's site; authorized crawl is permission
  for *CiteLadder's* crawler. They complement each other and neither implies
  the other. The first wave is limited to four connection types:

  | Connection | Mechanism |
  |---|---|
  | Cloudflare | Customer API token scoped to Workers Scripts: Edit, Workers Routes: Edit and Zone: Read; CiteLadder deploys a pass-through Worker on the selected zone that forwards AI-bot request events only |
  | Google Cloud CDN | Customer-run setup: a Logging sink to Pub/Sub, delivered to a CiteLadder endpoint |
  | Generic webhook | Customer POSTs access-log batches to a per-connection authenticated endpoint |
  | Log upload | CSV or Apache/Nginx Common Log Format file |

  AWS CloudFront, Vercel, WordPress and Akamai follow only on customer demand.
  Ingestion keeps only requests matching the config-owned AI-bot catalog and
  discards other traffic at the boundary. It stores sanitized URL path, status,
  bot, timestamp and verification state. Paths are sanitized before any
  persistence: query strings and fragments dropped, and config-owned patterns
  replace path segments that look like identifiers or one-time tokens (long
  hex/base64 runs, UUIDs, signed-URL and reset-link segments). URL-level
  insights and joins read only sanitized paths. Ingestion never keeps request
  bodies, cookies, auth headers or client IPs beyond bot verification, is
  bounded and idempotent on replay, and follows the retention decision still
  pending in audit remediation. Verify bot identity by published IP ranges
  where available. Reverse DNS counts only when the hostname is under a
  provider-controlled domain and a forward lookup resolves back to the source
  IP; otherwise, and for a user-agent string alone, the identity is reported
  as claimed, not verified. Connection credentials use the existing encrypted provider
  credential owner and are never returned to the browser. The Cloudflare
  Worker must fail open for site traffic, so a CiteLadder outage never
  affects the customer's visitors.
- **Insights.** Bot visits; requested URLs and folders; status codes and
  failure rates; vendor breakdown; purpose (Training, Search, User query,
  Other); URL-level activity. Example: "ClaudeBot requested /products/shoes 37
  times and got 403."
- **URL-level join (the differentiator).** Combine, per URL, actual AI-bot
  visits, CiteLadder citations and AI-visibility evidence, Site Health
  findings, and AI-referral sessions from the existing GA4 integration. Each
  signal keeps its own provenance and unknown/zero states; the join is a read
  projection over persisted evidence, never a new crawl or provider call.

## Implementation order

1. Authorization receipts, domain verification (DNS TXT, file, meta) and
   attestation under existing owners.
2. Crawl-policy decision function taking (mode, robots result, page status),
   frozen per crawl; Site Health discover/analyze consume it. Page-level
   401/403 classified as `access_blocked`.
3. Settings UI, status chips and result presentation.
4. Expanded AI crawlability catalog and robots history.
5. Connections, one per slice: log upload and generic webhook first (no
   customer infrastructure changes), then Cloudflare, then Google Cloud CDN.
6. Crawl-insights views and the URL-level join.

## Required coverage

- Decision table: every mode × robots result × page status cell, including
  challenges never circumvented in Authorized mode.
- Authorization is workspace-isolated, domain-exact, cannot target competitor
  or source-page acquisition, and is downgraded by failed re-verification.
- Suppression and the kill switch override authorization.
- A redirect to an unauthorized destination is rejected (or handled under
  Standard robots rules) before any network I/O to it.
- Path sanitization strips queries, tokens and identifier-like segments
  before persistence; rDNS without forward confirmation stays "claimed".
- Crawls freeze the authorization receipt; revocation mid-crawl stops further
  robots-excluded fetches.
- Verification commits before network I/O; reads never verify.
- Log ingestion: non-AI traffic discarded, redaction, bounded payloads,
  idempotent replay, workspace isolation of connection endpoints, and spoofed
  user agents reported as unverified.
- Cloudflare Worker: forwards only AI-bot events and never blocks or delays
  site responses when CiteLadder is unreachable.
- URL join: missing connections render as unavailable, never as zero visits.

## Owner decisions to confirm before implementation

- Whether attestation alone may enable Authorized mode at launch, or only
  alongside a verification path. This plan's default: attestation allowed for
  the project's own domain, verification preferred and badged.
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
