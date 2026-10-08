# Site Health

Site Health crawls a project's website, keeps immutable fetch evidence and
bounded page facts, classifies pages, evaluates a config-owned check catalog,
and publishes scores, issues and snapshots. The TypeScript API
(`frontend/services/api/src/site-health`) owns it; the UI lives in
`frontend/components/site-health`.

## Purpose and boundaries

Site Health owns URL admission, acquisition, fetch attempts and artifacts, page
analyses, rule evaluations, issues, score summaries, snapshots, robots history,
link metrics, Architecture, Change Intelligence and Internal Links. Other
owners hold related work:

| Area | Owner |
|---|---|
| Deliverables | [Agent](agents.md) |
| Implementation and verification | [Opportunities](opportunities.md) |
| Crawler logs | [AI Traffic](ai-traffic.md) |
| Allowances | [Billing and entitlements](billing-entitlements.md) |
| Runner start and tick | [Workers runbook](operations/WORKERS_RUNBOOK.md) |

Site Health satisfies [invariants](invariants.md) 3–10 and 15; this document
does not restate them.

## Crawl lifecycle

**Admission.** `POST /api/v1/site-crawls` (`planner.ts` `createCrawl`) runs as
one transaction. It locks workspace, project, capacity/account, runtime, then
profile, and allows one active crawl per project. In order, it:

1. refreshes the runtime from grants;
2. admits the root and seeds;
3. freezes scope, input mode, page limit, page-kind filter, grant projection,
   acquisition bounds and versions into `site_crawls.configuration`;
4. reserves the fetch budget;
5. enqueues `discover` for the root and seeds (seeds only in `exact_urls`),
   one `site_setup`, and `analyze` for already-monitored URLs, pages named by
   a declaration still inside its verification window first; in `auto` mode
   it also selects the root.

Input modes other than `auto`, seeds and page-kind filters are advanced
controls (`advanced_controls_enabled`, or the development operator's
workspace). A page rerun (`selection.ts`) creates a one-page crawl from a
terminal crawl, or the next task generation of an active one. Its
configuration carries `page_rerun`; it hands its page to verification and
Opportunities but is never compared as a site crawl.

| Task kind (`site_crawl_tasks`) | Does |
|---|---|
| `site_setup` | robots.txt, crawler stance, llms.txt, sitemap walk and admission |
| `discover` | fetches a page; one parse for links and facts; admits children; marks it a document, an alias or for analysis |
| `analyze` | classifies, evaluates and provisionally scores one monitored page |
| `link_metrics` → `architecture` | post-terminal link metrics, then the Architecture projection |
| `change_intel` | post-terminal change snapshot and analytics handoff |

The acquisition kinds fetch outside any transaction. Each then re-locks its
task and re-checks the lease, crawl status and workspace access; `analyze` also
re-checks membership and allowance. Evidence and the outcome commit together,
and a lost lease commits nothing.

`site_setup` commits twice. The first commit holds root robots access, llms.txt
and the snapshot pointer, with the sitemap `pending`, and it unblocks the root's
analysis. The second commit holds the sitemap admission and the sampled robots
policy; a reclaimed task resumes there.

`analyze` reuses the crawl's `discover` artifact when the extractor version
matches. While that `discover` is open (or `site_setup`, for the root),
`analyze` re-queues without spending an attempt for up to
`analysis_dependency_max_wait_seconds`, then fetches the page itself.

**Execution.** The runner's `site-health` lane (`workers/runner.ts`) keeps
`min(worker_concurrency, RUNNER_DB_POOL_SIZE)` tasks in flight. It refills each
slot as a task settles, until the runner stops admitting or
`claim_window_seconds` ends. An idle drain waits for work that becomes due
within its budget; when deferred work is due after the budget ends, the exiting
runner job starts a successor execution (`CLOUD_RUN_RUNNER_JOB`) instead of
leaving it for the 10-minute tick. The `DRAIN_LOCK` advisory lock serializes drains.

After creation, the browser calls `POST /api/v1/site-crawls/{id}/run`. That
request runs a crawl-scoped worker under the same lock, without waiting for it,
within `siteHealth.interactive` bounds: 30 s admission, a 180 s deadline that
includes robots and redirect probes, and concurrency 2. The background runner
finishes anything left. Reads never start work.

**Leases and retries.**

- Leases (`lease_ttl_seconds`) heartbeat. Failures retry with exponential
  backoff and jitter up to `max_attempts`.
- PostgreSQL conflicts (`40001`, `40P01`, `55P03`) requeue as `db_conflict`
  without spending an attempt, up to `db_conflict_max_requeues`.
- 429, 5xx, timeouts and connection failures retry. Other 4xx, `bot_blocked`
  and robots denial are terminal.
- Only `lease-recovery.ts` recovers expired leases: oldest-first `SKIP LOCKED`
  batches, one attempt each, reconciling crawls whose tasks hit the ceiling.
- A granted access check is reused for `access_check_ttl_seconds`, never past
  the grant's own expiry; a denial is never cached.

**Terminalization** (`lifecycle.ts`, the only path to a terminal crawl). Each
settled lifecycle task reconciles counters and sub-states under the crawl row
lock. While siblings remain, a successful analysis only refreshes the
provisional summary on the `live_score_refresh_*` cadence. When discovery and
analysis drain, one locked transaction:

1. resolves canonical-alias chains;
2. evaluates crawl-finalize checks;
3. appends a final analysis per page (`supersedes_analysis_id`);
4. persists the snapshot and score summary;
5. sets `completed`, `partially_completed` (with `partial_reason`) or `failed`,
   and settles the fetch reservation;
6. for a crawl that did not fail, enqueues `change_intel` and `link_metrics`
   if any analysis succeeded, otherwise hands off to the analytics refresh.

**Backstops** run every `backstop_interval_seconds`, even on an empty drain:

- **Stalled:** an active crawl with no open task and no write for
  `stalled_crawl_reconcile_seconds` is reconciled.
- **Overdue:** an active crawl older than `overdue_crawl_seconds` has its open
  tasks failed with `crawl_overdue`, then is reconciled.
- **Cancelled:** a cancelled crawl with measurement evidence but no snapshot is
  published.

Stop (`controls.ts`) commits only the cancellation and fetch settlement.

## URL admission and selection

`classifyUrlAdmission` (`url-admission.ts`) decides every link, sitemap URL,
seed, root and page redirect hop, in order:

1. Reject scheme-less absolute references and join artifacts (`invalid_url`).
2. Reject hard-excluded query keys (`page`, `q`, `sort`, `filter`, …) and
   tracking keys.
3. Canonicalize (`url-identity.ts`): drop tracking and variant keys, sort the
   query, normalize escapes, then hash with SHA-256.
4. Apply hard exclusions: the host's first label; login, account, cart,
   checkout and search paths; asset extensions (sitemaps excepted); URL length.
5. Apply scope: the root registrable domain and its subdomains, then
   include/exclude globs (`fnmatch`; exclude wins; no includes admits all).

Globs never override a hard exclusion. Document URLs become `inventory_only`
and are never analyzed. The lists live in `analysis.json`
(`acquisition.hard_exclusion_*`) and the reason codes in `acquisition.json`
(`crawl.exclusions`).

**Value tiers** order admission and are separate from page kind. The first path
segment that names a tier, matching whole tokens, decides it; synonyms come
from `value_fallback_tokens`. So `/blog/product-review` is `article`.

| root | product | comparison | service, local | category, pricing | about | article, guide, faq, docs | contact | trust | other |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 90 | 85 | 80 | 70 | 65 | 60 | 45 | 40 | 20 |

Within a tier, candidates sort by `sha256(crawl_id || url_hash)`. The sample is
random but reproducible per crawl, and not biased toward header or footer
links.

**www/apex twins.** A URL whose `www.`/apex twin is already in the batch or the
frontier is skipped. In sample mode, a twin that was already observed also
counts. Stored identities are not merged, and scope, depth and the page-kind
filter apply before a twin is chosen.

**Page-kind filter.** Tiers map to page kinds through `value_kind_page_kinds`
(`about` and `contact` → `about_contact`, `trust` → `trust_policy`). `root` and
`other` always pass.

**Budgets.** A full crawl stores eligible candidates in
`site_discovery_frontier`, up to `max_frontier_urls`. It admits the best
pending rows up to the requested page limit, and each admission queues a
`discover`.

**Automatic allowance.** In `auto` mode the allowance is
`min(requested limit, plan monitored-URL limit)`. While it lasts, admitted HTML
URLs become system-monitored (`bootstrap`) and are analyzed after discovery;
only a new activation spends it. Bulk "first N" selection takes the highest
observed tier first.

**Sample mode** (`discovery_mode: sample`) has no frontier. It admits up to
`sample_discovery_url_cap` URLs directly and analyzes within the workspace-wide
`sample_url_limit` (`free_sample`). It ends `sample_completed` and never walks
sitemaps or requests llms.txt.

**Sitemaps.** The walk starts from the declared sitemaps or `/sitemap.xml`. It
runs breadth-first in `sitemap_fetch_concurrency` waves, and attempts count
against `max_sitemap_documents`. URLs are taken in queue order, so response
timing cannot change what fits. Admissible URLs, up to
`max_sitemap_admitted_urls`, enter the frontier at depth 1. They are also
recorded in `site_facts.sitemap.urls`, the authority for sitemap membership;
older crawls fall back to `source_kind = sitemap` observations.

**Canonical aliases** (`canonical-alias.ts`). A system-selected page whose
declared canonical names another active page becomes `duplicate` and loses its
membership. Finalization resolves chains and cycles. User selections and the
crawl root are never aliased, because the root carries the site checks.

## Acquisition and evidence guarantees

`page-fetch.ts` and `web-evidence/acquisition.ts` send
`CiteLadderSiteHealthBot/1.0 (+https://citeladder.com/crawler)`; they never
impersonate a browser. Every fetch applies DNS pinning, SSRF checks, ports
80/443, TLS, redirect and byte limits, and per-host pacing shared across the
worker. A fail-closed durable suppression check runs before every URL and
redirect hop.

| robots.txt | Behavior |
|---|---|
| 2xx | Rules honored; an empty body allows all |
| 401 / 403 | Host blocked (`access_blocked`) |
| other 4xx | No rules (`not_found`) |
| 429, 5xx, network failure | Disallowed; rechecked after `robots_unreachable_recheck_seconds` |

Readable policies are cached for `robots_cache_ttl_seconds`. A crawl delay
above `max_crawl_delay_seconds` blocks the host. A missing file never permits
bypassing access controls, and a challenge page is terminal `bot_blocked`.

**Operator stop.** Run
`pnpm --filter @citeladder/api acquisition:control --actor <admin-email> --domain <domain-or-*> --reason <reason> [--resume] [--apply]`.

- It dry-runs unless `--apply` is given.
- A domain rule also covers its subdomains. Unblocking a domain cannot override
  a global `*`.
- `--resume` keeps the row but replaces its actor and reason.
- It sends no HTTP requests. Never put credentials or customer content in the
  reason.

Attempts and artifacts are append-only. `site_fetch_artifacts.normalized_facts`
is the bounded evidence store, and no raw HTML is kept. Facts distinguish an
available extraction from parse failure, unsupported media, client rendering
and truncation. Declared canonicals are observations, never URL identity.
Hidden nodes enter accessible names only through `aria-labelledby`.

### Crawler permissions and robots history

`config/crawlers.json` lists 13 bots. Each has an identity, operator, purpose
(`search_engine`, `ai_search`, `ai_training`, `ai_user_fetch`), robots tokens
and its check membership. For each bot, `site_facts.robots.bots` stores:

- the matched group: `specific_group`, `wildcard_group`, or `no_rules` (shown
  as "Not specified");
- `root_access`;
- the sample `policy`: `all_allowed`, `restricted`, `all_disallowed` or
  `unknown`.

The sample is the root, then same-origin sitemap URLs, then observed URLs, up
to `robots_policy_sample_size`. An unreadable or truncated body leaves the
policy `unknown`. These fields describe directives, not indexing or actual
visits.

`robots_snapshots` keeps one append-only row per distinct 2xx body, keyed by
workspace, project, origin and the full-body SHA-256. The stored body is cut at
`robots_snapshot_max_bytes`. Each crawl keeps `robots_snapshot_id` and
`robots_observed_at`.

`GET /api/v1/projects/{project_id}/site-health/robots-history` keyset-pages the
observations (default 5, maximum 20). MCP `read_ai_crawlability` takes an
optional `crawl_id`.

## Page analysis

Interpretation runs on a persistent pool of `interpretation_worker_threads`
Node threads (`analysis/off-thread.ts`). Idle threads don't hold the process
open, and a crashed thread fails only its own jobs.

- **Discover:** parses once. Links come from the whole document, including
  `<template>`, up to `max_links_per_page`; facts come from the region-pruned
  view.
- **Analyze:**
  - sets `classification_expected` before parsing supported HTML;
  - re-interprets once, without spending an attempt, if the page context
    (site facts, sitemap membership, audit time) changed before commit.
- **Site facts:** only the crawl root's analysis receives `site_facts`.

`analyzePage` derives page kind, traits, evaluations and provisional scores into
an initial `site_page_analyses` row (`finalized_at` null).

### Classification

`analysis/page-kinds.ts` classifies by evidence tier, not by summed weights,
into `classification.page_kinds` (18 kinds plus `other`).

| Tier (confidence) | Signals |
|---|---|
| structural (high) | Root path. Product buy box, or own price under a product heading. A collection of at least `listing_min_card_items` items with a bound sort, filter, facet, result count or empty state. A single address entity on a local route. |
| route (medium) | `slug_patterns` (vs, alternatives, how-to, best) first, then `route_patterns`, where the segment nearest the root wins |
| semantic (low) | Docs-host context, service proposition, FAQ pairs or byline plus date, title keywords, structured data |

The highest tier with evidence decides. If kinds tie in that tier, the result
is `other` (`conflicting_top_tier_evidence`). Structured data never decides
alone (`schema_only`). Evidence keeps every signal, alternative and conflict. A
structural winner that has any dissenting signal gets medium confidence.

- **Homepage:** the bare root, `homepage_paths`, or a region-qualified locale
  root (`homepage_locale_root_pattern`: `/en-in`, `/es-419`, `/zh-hant`; not
  `/en-shop`).
- **Paths** are lower-cased and drop the trailing slash and any
  `route_document_extensions` suffix (`/pricing.html` → `/pricing`). The
  `routes.ts` normalizer is shared with source-page assessment.
- **One-word title keywords** (`contact`, `policy`) match only a whole page
  name: the slug, the H1, or the title before its site suffix. Phrases match
  anywhere, and the longest wins.
- **Editorial archives:** blog, news, article, insights, resources and press
  roots, with their page/category/tag paths, are `editorial_index` even with a
  collection.
- **Unobserved content:** a client-rendered shell has no extraction. Its winner
  drops to low confidence, and the page records `content_unobserved`.

Traits (`analysis/traits.ts`) are additive observations and never multiply
kinds.

`analysis/rules.ts` resolves applicability before outcome. The keys are
`always`, `has_html`, `site_root`, `crawl_finalize` and the `page_kind*:` and
`page_trait*:` prefixes; `content` excludes JS shells. Two gates turn would-be
failures into `unknown`:

- **Purpose gate:** a check in `purpose_confirmed_check_ids` fails a product or
  category page only when the page has its own purchase control, primary price
  or captured collection items, or a structural classification. Otherwise the
  reason is `page_kind_unconfirmed`.
- **Authored gate:** a check in `authored_content_check_ids` needs authored
  content, a visible byline or research context. Otherwise the reason is
  `authored_content_unconfirmed`.

## Checks and scoring

`config/site-health/rules.json` is the catalog. Each rule has a scope (`page`,
`site`, `cluster`, `graph`), `applicability_key`, `finding_class` (`defect`,
`advisory`, `diagnostic`), severity, `score_roles`, remediation and an optional
composite contract. Pillars come from `reads.json` `aeo_check_pillar`.
`validation.ts` requires every `aeo_readiness` rule, and only those, to have
exactly one pillar, and forbids `diagnostic` scored rules.

Outcome normalization:

- `not_applicable` keeps only `structural_na_reasons`; any other reason becomes
  `unknown`.
- Truncated extraction turns `missing` into `unknown`.
- A throwing or unmapped check is `error`.

`missing` or `partial` on a visible, non-diagnostic evaluation creates an issue,
whether or not the check is scored. Severity orders issues; `weight` is
provenance only.

| Scored check (`score_roles`) | Web | AEO pillar |
|---|:-:|---|
| `technical.title_present`, `technical.https`, `technical.uncompressed_html`, `technical.soft_error`, `technical.canonical_integrity` (finalize) | yes | |
| `web.accessibility_image_alt`, `web.accessibility_document_language`, `web.mobile_viewport`, `web.security_mixed_content` | yes | |
| `technical.indexable` | yes | crawlability |
| `search.crawler_access` (site), `search.snippet_access` | | crawlability |
| `aeo.server_rendered_content`, `aeo.schema_required_valid`, `aeo.schema_matches_content` | | machine-readability |
| `aeo.heading_hierarchy` | | structure |
| `aeo.product_answer_facts`, `aeo.listing_answer_set` | | answerability |
| `aeo.product_evidence_facts` | | evidence |
| `aeo.product_brand_identity`, `aeo.visible_attribution` | | provenance |
| `aeo.content_date_present`, `aeo.offer_freshness_signal` | | freshness |

Unscored checks:

| Class | Checks |
|---|---|
| Advisory | Meta description, canonical present, structured data present, Open Graph, robots.txt present, entity profiles, content recency, recommended schema, source support, answer-first |
| Defect | Form names, heading order, `technical.ai_crawler_access`, organization identity, trust path, listing item facts, question headings, sitemap canonical, broken internal links, sitemap URL unreachable, sitemap orphan, hreflang conflict, six `architecture.*` rules |
| Diagnostic (no issue) | HSTS, TTFB band, llms.txt |

Pillar weights (`readiness_dimension_weights`) sum to 1:

| Answerability | Structure | Evidence | Machine readability | Provenance | Freshness | Crawlability |
|---:|---:|---:|---:|---:|---:|---:|
| 0.20 | 0.15 | 0.15 | 0.20 | 0.10 | 0.05 | 0.15 |

**Site checks** run on the crawl root and score on every page. Finalization
(`terminal-analysis.ts`) and aggregation (`measurement-aggregation.ts`) replace
each page's site rows with the root's applied evaluations, and final manifests
list their IDs; rows are not copied. A scored site check that was never
evaluated (no root analysis or no site facts) is `unknown`
(`site_facts_unavailable`) and keeps measurement partial.

**Crawler access.** A bot fails when its root, or every sampled URL, is
disallowed. Partial closure is `restricted` and passes. Without a fetched
robots.txt the result is `unknown` (`robots_not_fetched`); a fetched but
unreadable one with no observed block is `unknown` (`robots_unreadable`). Check membership is
each bot's `checks` array:

- `search.crawler_access` (scored) covers Googlebot, Bingbot, OAI-SearchBot,
  PerplexityBot and Claude-SearchBot.
- `technical.ai_crawler_access` (unscored defect) covers those five plus
  GPTBot, ClaudeBot, Google-Extended, ChatGPT-User, Perplexity-User and
  Claude-User. Blocking only training or user-fetch bots is visible but does
  not move a score.
- Applebot and Applebot-Extended are in neither check.

**Crawl-finalize checks** (`lifecycle-finalize.ts`) evaluate canonical
integrity, internal-link targets and hreflang return tags per page, and sitemap
orphans and reachability on the root. They read only this crawl's persisted
attempts; targets never fetched, or rate-limited with 429, stay unchecked and
cannot pass.

| Canonical integrity outcome | When |
|---|---|
| `not_applicable` | no declaration |
| `missing` | several, invalid or cross-origin declarations |
| `unknown` | the target is unresolved |
| `satisfied` | the target returned a status below 400 |

```text
role / pillar score = 100 * satisfied / (satisfied + missing), over applicable checks
coverage            = (satisfied + missing) / applicable
AEO page score      = sum(pillar score * weight) / sum(weights of pillars with a score)
crawl score         = mean of page scores; crawl pillar = mean of page pillar scores
```

These formulas are in `analysis/scoring.ts`.

- **No determinate check:** the score is null and coverage is 0.
- **No applicable check:** coverage is null.
- **Duplicate rows:** they count once, and disagreeing duplicates count as
  `unknown`.
- **No AEO check applies:** the reason is `page_purpose_unresolved` for
  `other` and `no_applicable_checks` otherwise.
- **Unresolved checks:** the result reads `unresolved_checks` /
  `limited_evidence`.
- **Page-kind rollups** use the same arithmetic, with crawl-wide site checks.

## Coverage and measurement states

The measurement cohort is the active monitored set, using each member's latest
completed analysis in the crawl (`score-summary.ts`); provisional summaries and
snapshots share it. Classification coverage counts analyze tasks with
`classification_expected` as classified, `other` (with reason groups) or
failed.

`coverage.ts` persists crawl coverage with the snapshot:

| State | When |
|---|---|
| `partial` | a page or frontier limit was reached, the frontier was not exhausted, or discovery was bounded (sample, non-`auto`, cancelled) |
| `unknown` | discovery failed, observed nothing or did not complete |
| `complete` | the frontier was exhausted |

The evidence records `observation_count`, `analyzed_url_count`,
`failed_url_count` and `automatic_limit`, which is `null` (never 0) when no
allowance was recorded. It also records `value_kinds`: the URLs found and
analyzed per admission tier. Tiers listed in `coverage_expected_value_kinds`
(about, contact, pricing) appear as zero when never found. A crawl without a
frontier, such as a sample, reports no tiers.

**Overview.** Crawl Coverage (`overview-metrics.tsx`) is analyzed ÷ found
(`observation_count`), not ÷ selected. Its caption looks like "20 of 100 found
pages analyzed · plan limit 20 per crawl · 2 failed to load", followed by any
reason the counts do not explain. Below the metrics (`coverage-by-kind.tsx`), one line lists
pages analyzed by type and the expected types "not found in this crawl", which
is absence from the crawl, not proof of absence from the site.

- An `unknown` state prefixes "Coverage unknown".
- Zero found shows "No pages found" with no percentage.
- Older snapshots without the counts show their state and reason.

`coverage-by-kind.tsx` shows "Pages analyzed by type" separately from "Not
found on the site", and omits `root` and `other`.

## Versions and provenance

| Version | Source |
|---|---|
| Classifier `sh-classifier-2+<digest>`: base plus a SHA-256 prefix of every classification input | `classifierVersion`, `config/site-health.ts` |
| Traits `sh-traits-2` | `analysis.json` |
| Extractor `sh-extractor-2`, analyzer `sh-analyzer-1`, rules `sh-rules-2` | `config/site-health.ts` |
| Scoring `sh-scoring-2`, coverage `sh-coverage-1`, classification formula `sh-classification-1` | `reads.json` |
| URL admission `sh-url-admission-2`, disposition `sh-disposition-1` | `acquisition.json` |
| Acquisition `sh-acquisition-1` | `acquisition_policy_version` setting |

Crawls freeze these in their configuration. Final analyses keep
`supersedes_analysis_id`, `source_evaluation_ids`, `source_artifact_ids` and a
frozen `expected_checkpoint_profile`. Any classification edit changes the
classifier digest. Other semantic changes bump their version under
[invariant 5](invariants.md#5-derived-artifacts-record-provenance).

## Internal links

Internal Links suggests inline links at exact captured source phrases over an
analyzed crawl. It never infers navigation or affects a score, and no provider
runs on a read. TypeScript owns admission, retrieval, reads and publication;
JEV judges pairs through the analytics queue. Limits are in
`config/internal-links.ts`.

| Stage | Behavior |
|---|---|
| Pages | Excludes `trust_policy` and `about_contact`. Applies eligibility (available, untruncated extraction) before the cap. Above the cap, indexable pages come first, then a stable URL-hash order. Only main-content-indexable pages are destinations. |
| Passages | Sentence spans with exact offsets into the source artifact; headings are kept separate; missing or truncated text is recorded as unavailable. |
| Retrieval | TF-IDF over destination title, H1 and path. In larger crawls, very common terms carry no weight, and a placement must share destination vocabulary. |
| Suppression | An existing main-content link suppresses a pair; a navigation-only link does not. A source with truncated anchor capture gets no suggestions. Product pages whose titles differ by at most `variant_max_word_difference` words never suggest each other. |
| Judgment | One JEV request per source: per target, a Noul usefulness question and a placement Choice (including `none`). Publication re-validates the anchor against frozen evidence, never falls back, and keeps the higher-ranked suggestion when anchors overlap. |
| Execution | Dispatch events commit before sending. At the deadline, dispatched pairs close as uncertain and are never resent. A missing permission or provider yields unavailable judgments. Cancel stops dispatch; the project's slot stays busy until the judgment task ends. |
| Verification | After the user marks a link implemented, a later complete, compatible crawl confirms a main-content link to the exact destination, with no model call and no CMS publishing. |

## Change intelligence

`change_intel` compares a terminal crawl with the newest earlier crawl that has
the same origin, scope and analyzer/extractor versions. Scope excludes the
page limit, which is the fetch budget left at admission; the comparison reads
only pages both crawls analyzed. Page reruns write no snapshot and are never a
predecessor, and Changes never shows a snapshot an older rerun wrote. With no
match, it records a non-comparable boundary against the newest earlier crawl
with analyses. A declared Site Health fix that the later crawl shows met is
marked as an expected change. Snapshots are immutable, carry their source IDs, supersede the
previous snapshot, and are reused when inputs are unchanged. Content change and
date consistency are separate outputs. Only `complete` comparison coverage can
promote metadata or cosmetic-refresh actions (`config/site-health/change-intel.ts`).

## Consumers and actions

Page detail, Issues, history, Changes, snapshots, exports, the Agent and MCP
read the same persisted final results.

A content handoff names a crawl, a `site_url_id` and a required
`source_analysis_id`. That analysis must be the current finalized analysis or
the one it supersedes. The handoff returns only the requested missing or
partial title or meta description (`content_addressable_check_fields`). Other
findings get a copyable fix prompt.

Issue-group Ask agent carries the crawl, the group and an optional page. The
server verifies each reference and returns a bounded sample with total counts.

Generating or exporting a deliverable never resolves a finding or moves a score.

## Configuration

Environment overrides are `SITE_HEALTH_<SETTING>`, defined in
`config/site-health/settings.json`. `validation.ts` enforces cross-field
bounds. Settings marked *frozen* are copied into each crawl.

| Setting | Default |
|---|---|
| `automatic_page_limit`, `max_requested_page_limit`, `max_advanced_requested_page_limit` | 500 each |
| `max_frontier_urls` / `max_crawl_depth` (frozen) | 50000 / 20 |
| `sample_url_limit` / `sample_discovery_url_cap` | 10 / 200 |
| `max_sitemap_documents` / `sitemap_fetch_concurrency` / `max_sitemap_admitted_urls` | 32 / 4 / 5000 |
| `robots_policy_sample_size` / `robots_snapshot_max_bytes` | 100 / 524288 |
| `robots_cache_ttl_seconds` / `robots_unreachable_recheck_seconds` | 86400 / 300 |
| `global_concurrency` / `per_host_concurrency` / `per_host_delay_seconds` (frozen) | 8 / 6 / 0.15 |
| `max_crawl_delay_seconds` / `request_timeout_seconds` / `max_redirects` | 30 / 20 / 5 |
| `worker_concurrency` / `claim_window_seconds` / `drain_budget_seconds` | 8 / 30 / 300 |
| `interpretation_worker_threads` | 1 |
| `lease_ttl_seconds` / `heartbeat_interval_seconds` / `max_attempts` | 120 / 30 / 4 |
| `analysis_dependency_max_wait_seconds` | 180 |
| `backstop_interval_seconds` / `stalled_crawl_reconcile_seconds` / `overdue_crawl_seconds` | 15 / 240 / 3600 |
| `access_check_ttl_seconds` | 30 |
| `live_score_refresh_page_interval` / `_page_fraction` / `_min_interval_seconds` | 10 / 0.1 / 5 |
| `advanced_controls_enabled` | false |

The policy files hold the rest:

| File | Contents |
|---|---|
| `acquisition.json` | Tiers, exclusion reasons, expected tiers, URL patterns |
| `analysis.json` | Classification, facts, regions, gates |
| `reads.json` | Reads, pillars, weights |
| `config/site-health.ts` | Interactive bounds |

## Source entry points

All paths are under `frontend/services/api/src/`.

| Area | Files |
|---|---|
| Claims and drain | `workers/site-health-worker.ts`, `workers/runner.ts` |
| Crawl, stop, selection | `site-health/planner.ts`, `controls.ts`, `selection.ts` |
| Admission | `site-health/url-admission.ts`, `url-identity.ts`, `frontier.ts` |
| Executors | `site-health/site-setup-task.ts`, `discover-task.ts`, `analyze-task.ts`, `page-fetch.ts` |
| Terminal and measurement | `site-health/lifecycle*.ts`, `terminal-analysis.ts`, `canonical-alias.ts`, `score-summary.ts`, `coverage.ts` |
| Analysis | `site-health/analysis/` (`page-kinds.ts`, `rules.ts`, `*-checks.ts`, `scoring.ts`) |
| Policy | `config/site-health.ts`, `config/site-health/*.json`, `config/crawlers.json` |
