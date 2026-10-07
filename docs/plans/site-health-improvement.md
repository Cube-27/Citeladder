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

Progress (2026-10-07): 1.1, 1.2, 1.3 (sliding window; the pool cap stays until
production timings justify raising in-flight parses on the 1-vCPU runner), 1.6
and 1.7 are implemented on `feat/site-health-throughput`. 1.4 and 1.5 are next;
1.8 waits for a measured backlog.

| # | Change | Where | Acceptance |
|---|---|---|---|
| 1.1 | Skip the full `reconcileCrawl` for a settled non-terminal discover/site_setup while lifecycle work is outstanding, and pass every non-terminal live-score refresh through `ScoreRefreshCadence`. Today every discover settlement locks the crawl, recounts observations and rebuilds the live score (O(N²) per crawl). | `site-health/lifecycle.ts:378-385`, `snapshot.ts:199` | PostgreSQL test: N discover settlements trigger at most the cadence-bounded number of live-score refreshes; terminal reconcile still finalizes. |
| 1.2 | Batch link admission: multi-row `INSERT … ON CONFLICT … RETURNING` for site URLs, observations, memberships and tasks, with budget/order logic in memory. Today it is about 5 round trips per link inside the workspace runtime lock, which also serializes every analyze commit. | `site-health/frontier.ts:620-640`, `discover-task.ts:386-394` | Same admitted set and order as today on a 200-link fixture; query count per discover is bounded and independent of link count. |
| 1.3 | Replace batch-then-wait with a sliding window: refill a slot as each site task settles, up to the Site Health concurrency limit (no longer capped by the DB pool, since fetches hold no connection), instead of `Promise.allSettled` per batch. One 20 s timeout currently stalls the other slots. | `workers/site-health-worker.ts:118-120`, `workers/runner.ts` | A slow fake task does not delay claims for fast ones; the pool bound and lease heartbeats are preserved. |
| 1.4 | Cache `requireWorkspaceAccess` per workspace for a short TTL inside a worker, and check once per task (analyze and discover check twice; each check is 4 queries). | `entitlements/access.ts`, `site-health-worker.ts:210`, `analyze-task.ts:167` | Revocation still takes effect within the TTL; test covers a revoked workspace mid-crawl. |
| 1.5 | Evidence: on a loaded dev machine, an analyze test that parses two pages timed out at 5 s while spawning workers (2026-10-07). Use a persistent 1-2 thread parse pool instead of a new `Worker` per extract/analyze, and move discover's main-thread parse onto it. | `site-health/analysis/off-thread.ts:21`, `discover-task.ts:186-204` | Heartbeats keep firing during a 5 MB parse; no worker spawn per page. |
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

## Phase 2 rule classification (decided 2026-10-07 under owner decisions 1-2)

Test for **scored**: failing it demonstrably reduces crawlability, indexing,
AI-answer eligibility or page performance, and detection is reliable enough to
put in front of a customer. Everything else is **advisory**: shown with
guidance, never in a score. Every scored rule creates a visible issue.

| Rule | Today | Decision | Reason |
|---|---|---|---|
| technical.indexable | scored (Web+AEO) | scored | noindex/blocked removes the page from search and AI retrieval |
| search.snippet_access | scored (AEO) | scored | nosnippet / max-snippet:0 prevents quotation in answers |
| search.crawler_access | site, unscored gate | scored, site level | robots blocking search crawlers removes the site |
| technical.ai_crawler_access | site, diagnostic, weight 0 | visible defect, unscored | answer-time crawlers (OAI-SearchBot, PerplexityBot, Claude-SearchBot) already score through `search.crawler_access`; blocking only training crawlers (GPTBot, ClaudeBot, Google-Extended) is a legitimate choice that does not remove answer eligibility |
| aeo.server_rendered_content | scored silently | scored, visible defect | most AI crawlers do not execute JavaScript; JS-only content is invisible to them |
| technical.title_present | scored | scored | primary relevance and citation label |
| technical.https | scored | scored | browser and engine trust signal; mixed/insecure pages are demoted |
| technical.soft_error | scored | scored | a 200 error page wastes crawl and gets dropped |
| technical.canonical_integrity | scored | scored | conflicting/invalid canonicals split or misdirect indexing |
| web.mobile_viewport | scored | scored | mobile-first indexing |
| web.security_mixed_content | scored | scored | blocked resources and insecure warnings |
| technical.uncompressed_html | scored silently | scored, visible defect | deterministic, cheap to fix, measurable transfer-time cost |
| web.accessibility_document_language | scored | scored | language targeting for search and answer engines |
| web.accessibility_image_alt | scored | scored | image understanding by engines (image search, multimodal answers) |
| aeo.schema_required_valid | scored (AEO) | scored | invalid structured data is ignored or misread |
| aeo.schema_matches_content | scored (AEO) | scored | mismatched markup is a spam/trust signal |
| aeo.product_answer_facts | scored (product) | scored | price/availability are what shopping answers quote |
| aeo.offer_freshness_signal | scored (product) | scored | stale offers are excluded from shopping answers |
| aeo.product_evidence_facts | scored (product) | scored | reviews/specs are the evidence answers cite |
| aeo.product_brand_identity | scored (product) | scored | brand attribution in product answers |
| aeo.content_date_present | scored (article kinds) | scored | answer engines prefer dated, fresh sources |
| aeo.visible_attribution | scored (article kinds) | scored | authorship is a primary trust signal for citation |
| aeo.listing_answer_set | scored (category) | scored | "best X" answers draw from collection pages |
| technical.broken_internal_link | unscored | advisory for now | should be scored at site level; graph-scope rows come from the architecture pass, so it follows as item 2.8 |
| technical.meta_description_present | scored | advisory | engines rewrite snippets; absence does not reduce visibility |
| technical.canonical_present | scored | advisory | a missing canonical is harmless; conflicts are scored via integrity |
| technical.hsts_present | scored silently | advisory | security hardening, no visibility effect |
| technical.ttfb_band | scored silently | advisory | one sample from one region is too noisy to score |
| web.accessibility_form_names | scored | advisory | accessibility quality, no visibility effect |
| web.accessibility_heading_order | scored | advisory | accessibility quality; answer structure covered by aeo.heading_hierarchy |
| aeo.heading_hierarchy | scored (AEO) | scored | sole Structure-pillar check; heading structure aids passage extraction |
| aeo.structured_data_present | scored (AEO) | advisory | absence does not block; invalid markup is scored separately |
| aeo.open_graph_present | scored (AEO) | advisory | social previews, not answer engines |
| aeo.listing_item_facts | scored (category) | advisory | detection depends on retained card details; keep until calibrated |
| aeo.answer_first | AEO role, no pillar | advisory | style guidance |
| aeo.question_headings | scored (FAQ) | advisory | style guidance |
| aeo.source_support_present | scored (article kinds) | advisory | depends on unconfirmed authorship evidence |
| aeo.schema_recommended_present | AEO role, no pillar | advisory | recommended fields only |
| aeo.organization_identity | AEO role, never scored | advisory | requires JSON-LD; visible identity is not detected yet |
| aeo.trust_path_present | AEO role, never scored | advisory | English-only substring detection; fix detection first |
| aeo.llms_txt_present | diagnostic | advisory | unadopted convention (owner decision 1); fix unfetched-shown-as-missing |
| technical.robots_txt_present | advisory | advisory | a missing robots.txt permits crawling |
| technical.sitemap_url_unreachable | unscored | advisory | sitemap hygiene |
| technical.sitemap_orphan | unscored | advisory | sitemap hygiene |
| technical.hreflang_conflict | unscored | advisory | relevant only to multilingual sites; keep visible |
| architecture.* (6 rules) | unscored | advisory | structural guidance from a sampled crawl |

Net effect: 23 scored, 28 unscored. AI-training access is visible but unscored; search
and AI-search crawler access (now including Claude-SearchBot) reaches every page's score, and server rendering and compression move
from silent scoring to visible defects. The catalog's `score_roles` is the single
source of membership (`web_check_ids` is retired); validation rejects a scored
diagnostic and any AEO role without a pillar.

Progress: 2.1, 2.2, 2.3 and site-level crawler scoring are implemented on `feat/site-health-scoring`.

| # | Change | Where |
|---|---|---|
| 2.8 | Score broken internal links at site level once graph-scope evaluations can feed page scoring. | `site-health/architecture.ts`, `analysis/scoring.ts` |

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

Progress: 3.2 (failure-only purpose gate; a real route-only "missing price" penalty
was confirmed by test first), 3.3, 3.4, 3.5 (classifier and the `contact_intent`
trait), 3.6 and the 3.7 doc list are implemented on `feat/site-health-classification`.
3.1 is reduced: kind-gated rules stay not-applicable on unclassified pages
(unknown would only add noise without changing any score); the unclassified
count is reported through the Phase 4 coverage funnel instead.

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

Progress: 4.2, 4.3 (seeded within value tiers), 4.4 (twin dedupe at admission;
stored identities unchanged), 4.5 (Overview coverage sentence and found-page
denominator: the feature's UX addition) and 4.6 are implemented on
`feat/site-health-coverage`. A per-kind skipped-URL funnel remains a follow-up.

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
