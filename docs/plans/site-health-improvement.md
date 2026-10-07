# Site Health improvement plan

Feature 1 of the [feature review tracker](feature-review-tracker.md); this is its
audit-derived plan, executed through that review. Owner contract: [Site Health](../site-health.md).
Constraints: [invariants](../invariants.md), especially workspace authorization,
persisted-projection reads, append-only evidence with processing versions, and
distinct unknown / not-applicable / excluded states.

## Why

A production crawl on 2026-10-07 (100 URLs discovered, 20 analyzed) took about
4 minutes and appeared stuck at 19/20. The root cause was the runner exiting
while a deferred analyze task was 5 seconds from due, with only the 10-minute
tick to restart it. That is fixed separately (runner idle-wait and successor
start). A read-only audit of performance, classification, checkpoints and
page-kind coverage then found the issues below. File references are to
`frontend/services/api/src/` unless noted.

## Owner decisions (2026-10-07)

1. **Score only what affects visibility or performance.** A check is scored
   only when failing it demonstrably hurts crawlability, indexing, AI-answer
   eligibility or page performance. Unadopted conventions (llms.txt) are never
   scored, but their reported defects are still fixed.
2. **Important issues are scored and surfaced; everything else is advisory.**
   Each check is either *scored* (it creates a visible issue and moves the
   score) or *advisory* (shown with guidance, never in the score). No check may
   move the score without a visible issue. The review assigns each of the
   51 rules to one class with a written reason.
3. **No per-kind quota.** The 20 analyzed pages stay a fast, randomized sample;
   item 4.1 is dropped, and 4.3 becomes the seeded random selection.
4. **Zero added cost.** Measured 2026-10-07: e2-micro database (1 GB RAM,
   about 600 MB available), `max_connections=40`, about 20 connections at worst
   case (API 2×4, runner and tick 4+1 each). The bottleneck is the shared CPU,
   not connections. Keep `RUNNER_DB_POOL_SIZE=4` and decouple network fetch
   concurrency from the pool instead (item 1.3); fetches hold no connection.

## Phase 1: crawl throughput (highest user-visible impact)

| # | Change | Where | Acceptance |
|---|---|---|---|
| 1.1 | Skip the full `reconcileCrawl` for a settled non-terminal discover/site_setup while lifecycle work is outstanding, and pass every non-terminal live-score refresh through `ScoreRefreshCadence`. Today every discover settlement locks the crawl, recounts observations and rebuilds the live score (O(N²) per crawl). | `site-health/lifecycle.ts:378-385`, `snapshot.ts:199` | PostgreSQL test: N discover settlements trigger at most the cadence-bounded number of live-score refreshes; terminal reconcile still finalizes. |
| 1.2 | Batch link admission: multi-row `INSERT … ON CONFLICT … RETURNING` for site URLs, observations, memberships and tasks, with budget/order logic in memory. Today it is about 5 round trips per link inside the workspace runtime lock, which also serializes every analyze commit. | `site-health/frontier.ts:620-640`, `discover-task.ts:386-394` | Same admitted set and order as today on a 200-link fixture; query count per discover is bounded and independent of link count. |
| 1.3 | Replace batch-then-wait with a sliding window: refill a slot as each site task settles, up to the Site Health concurrency limit (no longer capped by the DB pool, since fetches hold no connection), instead of `Promise.allSettled` per batch. One 20 s timeout currently stalls the other slots. | `workers/site-health-worker.ts:118-120`, `workers/runner.ts` | A slow fake task does not delay claims for fast ones; the pool bound and lease heartbeats are preserved. |
| 1.4 | Cache `requireWorkspaceAccess` per workspace for a short TTL inside a worker, and check once per task (analyze and discover check twice; each check is 4 queries). | `entitlements/access.ts`, `site-health-worker.ts:210`, `analyze-task.ts:167` | Revocation still takes effect within the TTL; test covers a revoked workspace mid-crawl. |
| 1.5 | Use a persistent 1-2 thread parse pool instead of a new `Worker` per extract/analyze, and move discover's main-thread parse onto it. | `site-health/analysis/off-thread.ts:21`, `discover-task.ts:186-204` | Heartbeats keep firing during a 5 MB parse; no worker spawn per page. |
| 1.6 | Move stalled/overdue/cancelled crawl backstops from every 1 s claim pass to the tick's periodic phase (or a 15-30 s cadence). | `site-health-worker.ts:94-98`, `lifecycle.ts:511-543` | Backstops still finalize a stalled crawl within one tick. |
| 1.7 | Tune: `analysis_dependency_retry_max_seconds` 15 → 5; return `deferred` without running `reconcileAfterTask`. | `config/site-health/settings.json`, `analyze-task.ts:344-360` | Root analyze starts within about 5 s of site_setup settling. |
| 1.8 | Later scale item: claim ranking runs a window over every claimable row. Add a partial claim index or a per-workspace lateral top-N. | `queue/task-queue.ts:67-120`, `migrations/versions/0001_initial.py` | Claim plan stays index-bounded with 50k queued tasks. |

Target: a 100-URL / 20-analyzed crawl completes in under 60 s of runner time
after the execution starts.

## Phase 2: checkpoint correctness

| # | Change | Where |
|---|---|---|
| 2.1 | Apply decisions 1-2: classify every rule as scored or advisory with a reason; score scored site-level checks (for example blocked search or AI crawlers) once at site level. Make one source of truth for score membership: rules.json `score_roles` and the runtime membership from `web_check_ids` and `aeo_check_pillar` disagree for at least 6 rules today. | `analysis/scoring.ts`, `analysis/rules.ts:140`, `config/site-health/validation.ts` |
| 2.2 | Enforce "no score movement without a visible issue": a scored rule must create an issue (today `technical.hsts_present`, `technical.ttfb_band`, `technical.uncompressed_html` and `aeo.server_rendered_content` are scored silently). | `config/site-health/rules.json`, `analysis/rules.ts:50-53` |
| 2.3 | `aeo.llms_txt_present` reports `missing` when llms.txt was never fetched (sample crawls skip it). Emit unknown when `fetched` is false. | `analysis/delivery-checks.ts:136-143` |
| 2.4 | Site facts attach only when the analyzed URL hash equals the crawl root hash. An apex/www redirect or a failed root makes every site rule `not_site_root` not-applicable. Persist site evaluations independently of one page, and emit unknown (`site_facts_unavailable`) when the root is unfetched. | `site-health/analysis-rows.ts:190-199` |
| 2.5 | Record a conflict reason when duplicate rows disagree, and set the pillar on finalize evaluations instead of `''`. | `analysis/scoring.ts:15-28`, `analysis/finalize.ts:38` |
| 2.6 | Evaluate AI-crawler access for sampled and sitemap paths, not just the root. | `analysis/delivery-checks.ts:33-55` |
| 2.7 | Either use rules.json `weight`/`severity` in scoring or document them as display-only (scoring hard-codes weight 1). | `analysis/scoring.ts:159`, `docs/site-health.md` |

## Phase 3: classification

Classification is deterministic (`site-health/analysis/page-kinds.ts:284`); no model is involved.

| # | Change | Where |
|---|---|---|
| 3.1 | Persist a classification state (`classified`, `unclassified`, `conflicting`, `schema_only`) instead of collapsing everything to `other`, and make kind-gated rules emit unknown rather than `other_page_kind` not-applicable for unclassified pages. Report the unclassified count in coverage. | `page-kinds.ts:247-296`, `analysis/rules.ts:67-100` |
| 3.2 | Penalty-bearing rules require structural or route confidence; a title-only semantic guess cannot activate them. Add the missing test. | `analysis/rules.ts`, `page-kinds.ts:289-294` |
| 3.3 | When facts are cleared for client-rendered pages, cap confidence at low and record `client_rendered`. | `analysis/facts.ts:482-484` |
| 3.4 | Match homepage locale prefixes generically (`/xx`, `/xx-yyyy`) instead of a fixed list of about 45 entries; add localized route and title catalogs, starting with the top customer locales. | `config/site-health/acquisition.json`, `analysis.json` |
| 3.5 | Tighten broad title keywords (for example "Contact lenses" becomes `about_contact`) with whole-phrase H1/title matching or a corroborating signal. | `config/site-health/analysis.json` |
| 3.6 | Derive the classifier version from a content hash of the classification config, including the route, slug and homepage patterns in acquisition.json, so pattern edits cannot ship under an unchanged version. | `config/site-health.ts` |
| 3.7 | Share one URL normalizer between `routes.ts` and `source-pages/assessment.ts` (extension stripping differs). Update the kind list in docs/site-health.md (19 kinds in config, 16 documented). | `site-health/routes.ts`, `source-pages/assessment.ts` |

Extend the calibration corpus (`test/fixtures/site-health/classifier-calibration.json`)
for every branch: non-English slugs, `/shop/<item>`, locale roots, client-rendered shells and unclassified states.

## Phase 4: page-kind coverage and selection

The analyzed count is the monitored-URL entitlement (20 for baseline and trial,
`config/entitlements.json:182,195`). Discovery is capped at
`min(500, max(100, allowance × 5))` (`entitlements/grants.ts:36-43`).

| # | Change | Where |
|---|---|---|
| 4.1 | Dropped by decision 3 (no per-kind quota). | — |
| 4.2 | Add admission kinds and priorities for about, contact, legal and landing pages (`/about-us` scores as `other` at priority 20 today). | `config/site-health/acquisition.json`, `site-health/url-admission.ts:115-126` |
| 4.3 | Fast randomized sample: after the root, choose the analyzed set by seeded random order (seed recorded on the crawl, so it is reproducible) instead of nav/footer link order. | `site-health/frontier.ts:90-95, 446-453` |
| 4.4 | Normalize apex/www to the profile host so duplicates cannot use up monitored slots (the dual-host reproduction is cube27.com). | `site-health/url-identity.ts`, `url-admission.ts:90-100` |
| 4.5 | Add a per-kind funnel (discovered, selected, analyzed, with a skip reason) and show "kind not found" separately from "found but not analyzed" in the UI. | `site-health/coverage.ts`, `packages/contracts/src/site-health/crawl.ts`, `frontend/…/site-health/*` |
| 4.6 | Bulk `first_n` selection orders by priority and kind, not alphabetically. | `site-health/selection.ts:298-304` |

Acceptance: the analyzed sample is reproducible from its recorded seed, and
apex/www duplicates never take two slots.

## Phase 5: new AEO checkpoints (after Phases 2-3)

FAQPage/HowTo schema validity; Person/author schema (E-E-A-T) beyond visible
attribution; `dateModified` freshness band; hreflang self-reference and
x-default; canonical vs sitemap agreement; `sameAs`/Wikidata entity linking;
llms.txt validity and `llms-full.txt`. Each check needs a scope, applicability,
pillar membership and unknown/not-applicable handling before it ships.

## Sequencing

Phase 1 (1.1-1.3 first) → Phase 2 → Phase 3 → Phase 4 → Phase 5. Phases 2-4
change scores, so batch them behind one rule/classifier version bump each, and
call out the score shift in release notes.
