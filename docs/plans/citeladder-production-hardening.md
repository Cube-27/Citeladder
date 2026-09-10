# CiteLadder production hardening

**Status:** Planned. Phase 0 is implemented and shipping separately; phases 1–3
are not started and require dedicated audit before implementation. This document
does not claim completed infrastructure work or measured post-change results.

**Scope:** Public marketing surface performance, infrastructure durability, and
deployment architecture. The signed-in application's client-side performance is
covered separately by
[`citeladder-frontend-performance-optimization.md`](./citeladder-frontend-performance-optimization.md);
that audit's contracts (persistent shell navigation, owner-scoped retained query
data, route/tab prefetching) must be preserved by anything here.

## Summary and evidence

Inspected on 10 September 2026 against a clean working tree at `a6f75fcb`.
Findings come from three sources, each labelled at the point of use:

- **Repository** — Terraform under `infra/gcp/`, the Compose stack in
  `infra/gcp/runtime/compose.gcp.yml`, `frontend/next.config.ts`, and the
  deploy workflow `.github/workflows/gcp-demo-deploy.yml`.
- **Live HTTP** — responses from `citeladder.com` measured from a single
  Cloudflare edge (Marseille, `CF-RAY` suffix `MRS`). One vantage point only;
  these numbers describe European access and must not be generalised.
- **Third-party reports** — Lighthouse metrics supplied by the operator.

No load testing, no authenticated performance capture, and no cost analysis were
performed. Cost figures are deliberately absent throughout: verify current GCP
pricing for the target region rather than trusting a number written into a
document.

### Business context governing priority

- Pre-revenue; no paying customers. Data-loss risk is bounded by the absence of
  customer data, which is why phase 2 is sequenced after phase 1 rather than
  before it. **This ordering must be revisited before payments are enabled.**
- Live, with a prospective enterprise client in Australia. Access latency is the
  operator's stated highest-priority issue.
- Current host zone `asia-south1-b`. The operator reports `asia-south1-a` was
  both faster and cheaper, and wants to return to it.

## Current state

One Compute Engine instance runs the entire stack as Docker Compose.

| Property | Value | Source |
|---|---|---|
| Machine | `e2-standard-2` (2 vCPU, 8 GB) | `infra/gcp/variables.tf` |
| Zone | `asia-south1-b` | GitHub repo variable `GCP_ZONE` |
| Boot disk | 30 GB `pd-balanced`, `auto_delete = true` | `infra/gcp/compute.tf` |
| Long-running containers | 14 | `compose.gcp.yml` |

Containers: `postgres 16`, `caddy`, `frontend`, `web` (uvicorn), and ten workers
(`audit-worker`, `audit-scheduler`, `site-health-worker`,
`brand-discovery-worker`, `content-worker`, `agent-worker`, `analytics-worker`,
`queue-sweeper`, `integration-worker`, `integration-dispatcher`). Two further
one-shot containers (`db-tls-init`, `migrate`) run at deploy time.

### Preserve these — they are already correct

Productionizing tends to churn working configuration. The following was reviewed
and should not change:

- All 15 runtime secrets in Secret Manager (`infra/gcp/locals.tf`).
- Shielded VM with Secure Boot, vTPM and integrity monitoring; OS Login enabled;
  project SSH keys blocked; serial port disabled.
- Ingress restricted to Cloudflare CIDRs by target service account; SSH only via
  IAP (`35.235.240.0/20`).
- Postgres bound to `127.0.0.1` with TLS and `scram-sha-256`.
- Artifact Registry with immutable tags and a keep-5 / delete-30-day cleanup
  policy.
- Images pinned by digest and validated against the expected registry path
  before deploy (`deploy-vm.sh:25-30`).
- The `alembic check` pre-flight that aborts deployment on schema drift before
  the serving revision is stopped (`deploy-vm.sh:180`).
- `browserslist` is already `chrome >= 111` / `safari >= 16.4`
  (`frontend/package.json`). Lighthouse's "Legacy JavaScript — 24 KiB" therefore
  originates in a dependency's prebuilt bundle, not the build target. No action
  available.

## Phase 0 — Shipped separately (implemented)

Two defects found during the audit, fixed and verified against the build output.
Recorded here for traceability; implementation is not part of this plan's
remaining work.

1. **Metadata routes were not edge-cacheable.** Next hardcodes
   `cache-control: public, max-age=0, must-revalidate` onto `robots.txt` and
   `sitemap.xml`. Live HTTP showed `cf-cache-status: EXPIRED` and TTFB of
   0.72–1.81 s, and Search Console reported robots.txt as unreachable. A header
   rule in `next.config.ts` adds `s-maxage=86400` while retaining `max-age=0` so
   deploys still propagate. Route-segment `revalidate` is unavailable: it is
   rejected at build time by `cacheComponents: true` (`next.config.ts:103`).

2. **Two signed-in routes were crawlable.** `/demand` and `/performance` are
   live app routes (verified 200) absent from the robots disallow list, while a
   stale `/traffic` entry pointed at a 404. Disallow rules are now bare prefixes
   derived from one list rather than `$`-anchored pairs, which also closes the
   query-string gap — `/settings$` never matched `/settings?tab=plan`.

**Note on residual indexing risk:** `robots.txt` prevents crawling, not
indexing. If `/demand` or `/performance` were crawled while open, the disallow
rule now prevents recrawl to discover a `noindex`, so the URL can persist in the
index. Check `site:citeladder.com/demand`; if present, remove via Search Console
rather than relying on the robots rule.

## Phase 1 — Latency and marketing-surface performance

**Retires:** slow first load for all users, crawler timeouts.
**Infrastructure change:** none in 1a–1c. Fully reversible.

Operator reports "overall loading was slow on every page" — both marketing and
signed-in. That splits into two causes with different fixes.

### 1a. Anonymous session round-trip on marketing pages

**Partially addressed. The remaining work needs a design decision.**

`useMarketingSession` in `components/marketing/chrome/nav.tsx` calls
`authApi.me` on mount for every marketing visitor, including anonymous ones,
to choose a navigation variant.

**Done:** `LandingSessionRedirect` fired a *second*, duplicate query against
the same `queryKeys.auth.me()` key purely to prime the cache. The nav already
resolves it, so the island was removed along with the landing page's only
client component. `app/(marketing)/page.test.tsx` now asserts the page reads
no session at all, which is what prevents one being reintroduced.

**Not done, and why.** Gating the query on the `ACTIVE_PROJECT_STORAGE_KEY`
trace that `ReturningVisitorHint` already reads before first paint was tried
and reverted. It breaks a real case: a signed-in visitor on a new device, in a
private window, or after localStorage eviction holds a valid session cookie but
no stored trace, and would be shown "Log in" permanently. The existing nav tests
(`carries both session answers in the markup until me has answered`,
`swaps the CTA for a dashboard link once the session resolves`) caught this.
localStorage is a rendering hint, not evidence of session state.

A correct fix reads the `citeladder_session` cookie server-side and passes the
answer down, so the anonymous case never issues a request while the signed-in
case stays correct. That conflicts with the marketing pages being fully static
(`cacheComponents: true`), so it is a real design decision about which routes
stay static — not a quick fix. **Defer to the dedicated audit.**

### 1b. `QueryProvider` wraps the marketing tree

`frontend/app/layout.tsx:72` places `QueryProvider` around all children. All 21
files under `app/(marketing)/` are server components — that architecture is
correct and should be preserved — but the marketing bundle still ships the
client-state library. Move the provider into the app layout group.

`LandingSessionRedirect` is gone, but `nav.tsx` and `pricing-catalog.tsx` are
client components using the provider, so this needs the 1a resolution first.

### 1c. Non-composited animations

Lighthouse reports three animated elements not running on the compositor. Move
to `transform` / `opacity`. Protects the current CLS of 0, which must not
regress.

### 1d. Zone move — `asia-south1-b` → `asia-south1-a`

**This is the operator's highest-priority item and carries the highest risk in
this phase. Treat it as a migration, not a config tweak.**

**The zone was never hardcoded in the deployment path.** `GCP_ZONE` comes from
the `gcp-demo` GitHub environment (`gcp-demo-deploy.yml:34`) and Terraform's
`var.zone` accepts it; the existing regex `^asia-south1-[a-z]$` already permits
`-a`. What made the change feel invasive was five *independent defaults* in
local operator scripts, each written so the script runs without a flag.

Addressed (10 Sep 2026):

| File | Was | Now |
|---|---|---|
| `infra/gcp/variables.tf` | `default = "asia-south1-b"` | `asia-south1-a` |
| `infra/gcp/bootstrap.ps1` | `$Zone = 'asia-south1-b'` | `asia-south1-a` (provisioning; nothing to discover) |
| `reset-gcp-db.ps1` | `$Zone = "asia-south1-b"` | empty; resolved from the running instance |
| `infra/gcp/reset-db.py` | `--zone` default `asia-south1-b` | `required=True`; caller always passes the resolved zone |
| `docs/operations/GCP_RUNBOOK.md` | documents `-b` | documents `-a` and the resolution behaviour |

The two reset scripts now ask GCP where `citeladder-demo` actually is rather
than assuming. That is the durable fix: a hardcoded default goes stale the next
time a stockout moves the VM, and fails as a confusing "instance not found".

**Still operator-owned:** `GCP_ZONE` in the `gcp-demo` GitHub environment.
Repository variables are not in the repo, so this cannot be changed from a
commit.

**Blast radius.** Every other resource is regional (`network.tf`,
`storage.tf`); only `google_compute_instance.demo` is zonal. Changing the zone
therefore forces replacement of the instance alone — but:

- The boot disk is `auto_delete = true`.
- Postgres data lives in a Docker volume on that boot disk.
- **The database is destroyed by this change.**

**Operator decision (10 Sep 2026):** pre-revenue, no customer data, no backup
required. Destruction of the database is accepted. This is recorded so the
decision is not silently reused later — it does not survive the first paying
customer.

**Verified before the move (10 Sep 2026):**

| Check | Result |
|---|---|
| `asia-south1-a` zone status | `UP` |
| `asia-south1-b` / `-c` status | `UP` |
| `e2-standard-2` offered in `-a` | Yes (2 vCPU / 8192 MB) |
| Regional CPU quota | 2 of 100 used |
| Instances / addresses | 1 of 24 · 1 of 8 |

Quota is not a constraint. Zone `-a` is healthy and offers the machine type.
**Live capacity was not probed** — creating a throwaway instance to prove
schedulability was declined as it provisions billable infrastructure. GCE
stockouts (`ZONE_RESOURCE_POOL_EXHAUSTED`) are transient and cannot be read
from any API, so the only proof is the apply itself.

**Deployment risk and rollback.** The original move to `-b` was forced by a
stockout in `-a`, so the failure mode is a recurrence. If the apply fails on
capacity, it fails at instance creation — before traffic moves — and the
recovery is to set `GCP_ZONE` back to `asia-south1-b` and re-run. Alternatives
if `-a` will not take the instance: try `asia-south1-c`, or change
`machine_type`, which currently requires removing the validation block in
`infra/gcp/variables.tf` that pins `e2-standard-2` (see 3b). Other families
(`n2`, `c3`, `t2d`) commonly have capacity where `e2` does not.

**Caveat on the expected benefit.** The operator observed `-a` as faster and
cheaper than `-b`. Zones within a region share egress pricing and are
sub-millisecond apart on the network, so a genuine cost or latency difference
between them most likely reflects a *machine family* difference — the `e2`
stockout that forced the original move to `-b` may have resulted in different
placement — rather than the zone label. **Capture a cost and latency baseline
before the move so the change can be evaluated rather than assumed.** If the
difference does not reproduce, the real fix is elsewhere in this document.

### 1e. Deliberately not doing: blanket Cloudflare HTML cache rule

A broad Cache Rule on HTML would reduce TTFB but introduces dashboard state that
drifts from the repository, and caching signed-in HTML is a correctness risk
contingent on a cookie-bypass rule (`citeladder_session`) remaining correct
indefinitely. Phase 3 addresses the same latency structurally.

If wanted sooner, scope to an explicit marketing allowlist (`/`, `/pricing`,
`/blog/*`) rather than a broad rule with a bypass exception — an allowlist fails
safe; a bypass fails open if the cookie name changes.

## Phase 2 — Durability and observability

**Retires:** data loss, silent outages.
**Prerequisite:** must complete before payments are enabled.

### 2a. Move Postgres to Cloud SQL

PostgreSQL 16, same region, private IP on the existing VPC. Retires the data-loss
risk and removes database contention from the two shared cores.

- Automated backups with point-in-time recovery, replacing a once-nightly
  `pg_dump` at 19:30 UTC.
- Connection pooling. Eleven backend containers each hold `DB_POOL_SIZE: 8` with
  `DB_MAX_OVERFLOW: 0` — 88 connections against a stock `max_connections` of
  100, leaving 12 for superuser sessions, the migrate job and `pg_dump`.
- Start zonal; regional HA is a later flag change.
- **Rehearse a restore.** An untested backup is a hypothesis.

### 2b. Fix backup retention

The backup bucket deletes objects after 10 days and declares
`force_destroy = true` (`infra/gcp/storage.tf`), so `terraform destroy` removes
the backups. Set `force_destroy = false` and raise the lifecycle to 35 days.

### 2c. Enable the observability already vendored

`backend/pyproject.toml:17` declares
`logfire[fastapi,httpx,sqlalchemy,system-metrics]`, and settings read
`LOGFIRE_ENABLED` / `LOGFIRE_TOKEN`
(`backend/app/core/config/__init__.py:271-292`). `deploy-vm.sh` writes neither,
so the instrumentation ships switched off. Cheapest fix in this document.

- Add `citeladder-logfire-token` to `runtime_secret_ids` in `locals.tf`.
- Write `LOGFIRE_ENABLED`, `LOGFIRE_TOKEN`, `LOGFIRE_ENVIRONMENT` in
  `deploy-vm.sh`.

Then add, in Terraform so it is reviewable:

- Uptime checks against `/health` and `/ready` (`backend/app/main.py:180`,
  `:191`).
- Alert policies: instance down, disk above 80%, Postgres connections above 80.
- A notification channel reaching a phone. The only alerting configured today is
  a billing budget.

**This phase also supplies the request-geography data needed to decide phase 3's
region question on evidence.**

### 2d. Rename away from `demo`

Resources are named `citeladder-demo` and labelled `environment = "demo"` —
Artifact Registry repo, backup bucket, VPC, firewall rules. Renaming forces
replacement of most, so schedule it here, deliberately, with the database
already outside the blast radius.

## Phase 3 — Deployment architecture

**Retires:** single point of failure, deploy downtime.

### 3a. Separate web from workers

| Workload | Target | Rationale |
|---|---|---|
| `frontend`, `web` | Cloud Run | Revision-based rollout gives zero-downtime deploys and instant rollback. Both already listen on a port with healthchecks. |
| 10 workers + scheduler | Managed instance group, or Cloud Run with min-instances | Long-lived queue consumers, sized independently so crawl surges stop competing with page requests. |
| `caddy` | Retire | Cloud Run terminates TLS behind Cloudflare. Origin-cert plumbing goes with it. |
| `db` | Cloud SQL | Moved in 2a. |

Images already build digest-pinned to Artifact Registry, so this is a
deployment-target change, not a repackaging. Retain the `alembic check`
pre-flight as a Cloud Run job gating the new revision.

### 3b. Region placement

Deferred deliberately until 2c supplies real request geography.

Two issues are conflated in `infra/gcp/variables.tf` and have different answers:

**Capacity errors are not a region problem.** GCE stockouts are per-zone,
per-machine-family. The zone regex already permits all three `asia-south1`
zones, while `machine_type` is hard-pinned to `e2-standard-2` by a validation
rule written for a seven-day demo. Switching family (`n2`, `c3`, `t2d`) commonly
clears an `e2` stockout. **Remove the `machine_type` and `region` validation
blocks** — they encode a decision about an environment that no longer exists and
are what makes stockouts hard to route around.

**Placement is a business question.** Live HTTP from Marseille measured
edge-cached assets at 0.40 s against HTML at 1.05–2.07 s on the same connection
— roughly 700 ms of origin round-trip. That is one European vantage point and
says nothing about where buyers are. With a prospective Australian enterprise
client, `australia-southeast1` (Sydney) and `asia-southeast1` (Singapore) are
both plausible, and both cost more per vCPU-hour than Mumbai.

Decide from phase 2's traffic data. A full migration is not the only option:
serving the marketing surface from a Cloud Run region near the buyers while
keeping workers and database near the dominant market is cheaper and lower-risk.

### 3c. Zero-downtime deploys

Deployment currently stops all 13 services, backs up, recreates, then polls
health for up to 150 seconds (`deploy-vm.sh:163-191`). The rollback path is
sound, but the site is hard-down throughout and there is nowhere to shift
traffic. Cloud Run revisions replace this: boot, healthcheck, shift traffic,
with rollback to the prior revision.

## Open decisions

| Question | Blocks | Resolution |
|---|---|---|
| Where are the buyers? | 3b | Phase 2c traffic data |
| Does the `-a` vs `-b` cost/latency difference reproduce? | 1d evaluation | Baseline before the move |
| Acceptable migration window? | 2a | Operator; realistically 15–30 min rehearsed |
| Who gets paged? | 2c | Operator; a channel with no one behind it is no alerting |
