# Handoff — Site Health v2: remaining phases (P3, P4) + deferred items

> **For the engineer/agent picking up Site Health v2.** Read
> [`site-health-v2-page-aware.md`](site-health-v2-page-aware.md) FIRST — it is the
> authoritative design spec (approved 2026-07-24). This document is only the state
> map: what is shipped, what remains, and the gotchas you will hit. Also read
> [`../../Agents.md`](../../Agents.md), [`../invariants.md`](../invariants.md), and
> [`../site-health.md`](../site-health.md) before writing code.

## 1. What is shipped

| Deliverable | State | Contents |
|---|---|---|
| Design spec | **Merged** (PR #17) | `docs/roadmap/site-health-v2-page-aware.md` — full v2 architecture, competitive research, Scrapling evaluation, P1–P4 phasing |
| **P1 — page-type-aware analysis** | **PR #22** (branch `vorflux/site-health-v2`; PR #19 closed/superseded) | Deterministic classifier (`analysis/site_health/page_types.py`, 9-type taxonomy, URL/content signals outrank schema), `PAGE_TYPE_PROFILES` (per-type thin-content minimums + weight overrides), `page_type:<type>` applicability tokens, `SitePageAnalysis.page_type` + `classifier_version`, `score_summary.by_page_type`, DTO badges/filters/exports column, frontend badges + filter + dashboard panel. Versions: `sh-classifier-1` (new), `sh-analyzer-2`, `sh-scoring-2` |
| **P2 — expanded AEO rule catalog + site/fetch foundations** | **PR #22** (branch `vorflux/site-health-v2`; PR #20 closed/superseded) | Rule catalog 9→33: site_root rules (`ai_crawler_access`, `llms_txt_present`, weight-0), schema rules (expected-for-type/required/recommended/content-match, non-circular), citability, extractability, hygiene, `crawl_finalize` rules (broken links, sitemap orphans, hreflang, weight-0) via a finalize pass in `_reconcile_crawl_status`. Robots.txt fetch + per-host policy caching (24h TTL, RFC 9309 5xx=deny/4xx=allow), `llms.txt` fetch, Starter-only sitemap ingestion, `SiteCrawl.site_facts`. Extractor `sh-extractor-2` (author/dates/outbound_domains/landmarks/h3/first-answer/hreflang…), `sh-rules-2` |

**Consolidated onto one branch (supersedes the stacked-PR plan).** P1 was a
strict ancestor of P2 (`git merge-base --is-ancestor` confirms it), so there was
never anything to merge between them. Both branches were rebased onto `main`
after the flat/hairline restyle (PR #21) and squashed into a single commit on
`vorflux/site-health-v2`, which carries the whole feature. The two original
branches and their PRs are **superseded — close them, do not merge them.**

### RESOLVED — P2 e2e execution

The e2e crawl scripts have since been repaired (`sh_p2_lib` was missing) and
**executed**: Suite B (Free) 224/224, Suite C (robots deny) 10/10, Suite D
(Starter) 45/45, version stamps unchanged.

The harness itself lived at `testing/site-health-v2-e2e/` and was **removed
from the tree before merge** — same as `testing/local-stack/` before it (added
in PR #15, deleted in `25f4bd8`); these live-stack harnesses are not carried in
the repo. `main` has no `testing/` directory. To re-run the suites, rebuild the
harness from the recipes in §5.

## 2. What remains — P4 only (P3 is shipped; kept below as the as-built record)

### P3 — curl_cffi fetch escalation — **SHIPPED** (spec §5.4)

Shipped on `vorflux/site-health-v2` alongside P1/P2; the checklist below is
retained as the as-built record. Deltas from the plan, and the follow-ups P4
inherits:

- **`http_only` is only honored by the discover/analyze page fetches**, not yet
  by the robots/sitemap/link-probe supporting fetches (threading `fetch_mode`
  into the setup phase is a broader change).
- **Rung-2 redirect-hop parity nits:** no content-type gate on redirect bodies,
  no redirect-limit trace token, and **no fail-closed guard if the `pop_curl`
  handle is ever not published** — if curl_cffi's internals stop calling
  `pop_curl` (e.g. a version bump), the live WIRE cap and the early
  content-type abort silently stop firing. The decoded cap still bounds memory,
  so this degrades the bound (5 MB wire → 20 MB decoded) rather than removing
  it. Re-check on any `curl-cffi` upgrade.
- **No committed fixture for the escalation tunnel routes**
  (`/blocked-then-chrome`, `/blocked-both`, `/throttled-gzip`), so the P3
  escalation is exercised by unit tests + live probes, not by CI.

Original plan (as-built unless noted above):

- **Start with the pinned-IP validation spike** (spec §5.4 — non-negotiable):
  the httpx rung pins the resolved IP at the transport layer; curl_cffi needs
  the `CURLOPT_RESOLVE` equivalent to pin IP while keeping SNI/Host correct.
  If it cannot be done, fall back to re-resolve-and-compare before the request.
  Do not build rung 2 before this spike concludes.
- Then: rung 2 inside `SecureFetcher` — on config-owned bot-block signatures
  (statuses 401/403/503 + response markers + TLS-layer blocks), retry once with
  a curl_cffi `AsyncSession` + config-owned impersonate target
  (`SITE_HEALTH_CURL_IMPERSONATE_TARGET`). Escalation stays inside the single
  fetch call — no extra queue attempts, no queue-semantics changes.
- **Pin `curl-cffi>=0.15.0`** (GHSA-qw2m-4pqf-rmpp redirect-SSRF; do NOT copy
  CrawlerAI's `>=0.14.0,<1`). Keep redirect-following manual with per-hop
  `resolve_target` revalidation on rung 2 — same as rung 1, plus byte caps,
  header redaction, per-host politeness, robots compliance (wired in P2).
- Fetch-mode vocabulary (config-owned, frozen into `SiteCrawl.configuration`):
  `auto | http_only | browser_only | http_then_browser` (mirrors CrawlerAI's
  `VALID_FETCH_MODES`); v2 activates `http_only` + `auto` only.
- `fetch_engine` provenance columns on `SiteFetchAttempt`/`SiteFetchArtifact`
  (spec §5.5); bot-blocked URLs present as `blocked` (P2's
  `POLICY_BLOCKING_ERROR_CODES` pattern is the template).
- **No version bumps** for P3 (additive columns; extraction/rule/scoring logic
  unchanged).

### P4 — opt-in render tier (spec §5.4; depends on P3's fetch modes)

- **Design-validation first**: validate the spec against a real Patchright
  proof-of-concept before building. Tech choice already made in spec §4:
  **Patchright/Playwright** (CrawlerAI precedent — the user's own stack:
  `CrawlerAI/backend/app/acquisition/`), NOT Scrapling's StealthyFetcher/Camoufox.
- `TASK_KIND_RENDER` queue task kind, per-URL opt-in, rate-limited,
  entitlement/config-gated; browser pool + block detection (CrawlerAI's
  `browser_pool.py`/`block_detection.py` are the reference, far smaller here:
  no proxies, no domain memory).
- Rendered pages go through the SAME extractor → rules → scoring (invariant 9).
  New artifact generations per render retry (invariant 3); no raw-HTML storage.
- **Guardrail amendment ships with the P4 PR**: `docs/site-health.md`
  "no headless browser" becomes "HTTP-first; browser render is opt-in per
  crawl" — call this out explicitly in the PR description (deliberate
  invariant-doc change).
- **No version bumps** (rendered pages use the same extractor/rules/scoring).

### Deferred items (conscious decisions, not oversights)

- ~~**Classifier evidence persistence**~~ — **SHIPPED**:
  `SitePageAnalysis.page_type_evidence` (JSONB) is persisted and surfaced as a
  "why this type" disclosure on the per-URL detail.
- ~~**`site_facts` frontend display**~~ — **SHIPPED**: the AI-crawler-access
  dashboard panel (`components/site-health/site-facts-panel.tsx`, wired in
  `dashboard-layout.tsx`) renders AI-crawler stance + llms.txt status.
- **Microdata deep extraction** — microdata blocks record `props_present=[]`
  (shallow extraction, documented); property rules mark
  `extraction: microdata_shallow` in evidence. Deep microdata parsing is its
  own spec if ever wanted.
- **LLM-generated recommendations** (spec §7 — future notes only): a separate
  versioned projection layer over deterministic findings, never a detector,
  never a headline metric (same wall as `sentiment-position.md`). Requires its
  own spec.
- Sentiment/avg-position (`sentiment-position.md`), PageSpeed/CrUX, incremental
  crawls via etag/last-modified, per-page-type trends — all spec §7.

## 3. Engineering rules you must not break

- **Invariants** (`docs/invariants.md`): config-only knobs (1), immutable
  artifacts (3), provenance versions on every derived row (4), workspace auth
  via `require_workspace_member` on every query (5), projections-only service
  layer (7), determinism — no LLM in detection (9).
- **Greenfield DB policy**: edit models + recreate the DB. NO new alembic
  revision files. (`alembic downgrade base && alembic upgrade head` locally.)
- **Version-bump allocation** (spec §6): each version is bumped by exactly one
  phase. End state after P2: `sh-extractor-2`, `sh-analyzer-2`, `sh-rules-2`,
  `sh-scoring-2`, `sh-classifier-1`. P3/P4 bump nothing.
- **Weight-0 mechanism**: rules that must produce issues without touching
  scores (site_root, crawl_finalize) carry `weight: 0` — the weighted scoring
  formula never admits them to numerators/denominators. Do not "fix" this.
- **Single-writer**: analyze tasks own per-page rows; the finalize-writer owns
  `crawl_finalize` rows; the analyze writer must never persist rows for
  `crawl_finalize` rule ids (unique `(analysis_id, rule_id)` stays free).
- **Free non-disclosure**: nothing may leak discovered/frontier totals to Free
  workspaces; sitemap ingestion is Starter-only for this reason.
- **Frontend**: pnpm only (`pnpm@11.9.0`); never npm/yarn.

## 4. Verify commands (focused, per Agents.md)

```bash
# Backend (needs local Postgres; suite creates/drops its own throwaway DB).
# Credentials come from the repo .env (POSTGRES_PASSWORD); the suite reuses
# host/port/credentials from settings.database_url.
#
# GOTCHA: if a NATIVE Postgres service also listens on 5432 it shadows the
# compose db's published port, and every DB test dies with
# `InvalidPasswordError: password authentication failed for user "postgres"`.
# Check with `Get-NetTCPConnection -LocalPort 5432 -State Listen` (Windows).
# Reach the compose db on a free port instead of fighting over 5432:
#   docker run -d --rm --name sf-pg-tunnel --network docker_default -p 55432:5432 \
#     alpine/socat tcp-listen:5432,fork,reuseaddr tcp-connect:db:5432
cd backend
DATABASE_URL=postgresql+asyncpg://postgres:<POSTGRES_PASSWORD>@localhost:55432/searchify \
  uv run pytest tests/unit/test_site_health_*.py tests/component/test_site_health_*.py -q
uv run --extra dev ruff check .

# Frontend
cd frontend
node_modules/.bin/vitest run components/site-health lib/site-health lib/api/site-health.test.ts
node_modules/.bin/eslint components/site-health lib/site-health lib/api
```

## 5. Testing recipes + gotchas (hard-won)

The runnable harness (fixture + dry-run + e2e scripts + expectations) is **not
in the repo** (see §1) — rebuild it from the recipes in the shared memory volume
at `/memory/testing/Searchify/` (`setup-instructions.md`,
`site-health-p1-e2e-fixture.md`), or recover the deleted tree from git history
(`git show <merge-commit>^:testing/site-health-v2-e2e/README.md`). Key points:

- **SSRF**: the crawler rejects loopback/private IPs. Serve fixture sites
  locally and expose them through the preview tunnel (`port expose`) — the
  `*.preview.us1.vorflux.com` hosts pass `url_policy`.
- **Free sample allowance is workspace-wide** (10 URLs across all projects).
  Before re-crawling, deactivate stale `free_sample` monitored rows (SQL in the
  memory recipe) or your crawl silently analyzes only the root.
- **Fixture design**: the 9-page fixture covers every classifier type; P2 added
  `robots.txt` (GPTBot blocked, crawler UA allowed), `llms.txt`, `sitemap.xml`
  (incl. a link-less orphan page for `sitemap_orphan`). Dry-validate pages
  through `extract_page_facts` + `classify` + `evaluate_all` before crawling.
- **Expectations re-baseline on rule fixes**: two P2 review fixes changed rule
  behavior (answer_first container-walk; JSON-LD excluded from inline-script
  chars) — always re-derive e2e expectations from a fresh dry run after
  touching parser/rules.
- Robots stance stances (P2): 5xx → `robots_unavailable` (deny-all, maps to
  `blocked`); 4xx/unfetchable → allow-all; cache TTL 24h; `link_check` probes
  honor robots (`policy_skipped` never counts as checked).
