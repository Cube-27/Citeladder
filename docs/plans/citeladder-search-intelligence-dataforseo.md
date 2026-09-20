# Search Intelligence with DataForSEO

**Status: final implementation specification. Product and architecture decisions resolved.**  
**Date: 20 September 2026.**  
**Release scope: phases 1–5. Phase 6, prompt generation, is explicitly deferred.**

This replaces the supplied Search Intelligence plan. It incorporates the owner's latest decisions: canonical domains only, no CiteLadder DataForSEO usage quotas, user-configurable acquisition depth, explicit cost approval, and deferred prompt generation. The architecture below is selected, not a list of alternatives. Implementation tests remain acceptance requirements, not pending product decisions. This document does not claim that the feature is implemented or that authenticated provider calls were tested. Do not change `ACTIVE.md`, reset databases, or run paid acceptance calls merely to adopt this document.

## 1. Outcome and approved scope

Add `/search-intelligence` under **Analyze**, immediately after **Search Demand**, with **Overview, Keywords, Competitors, Backlinks** tabs. Keep `/demand` as first-party Search Console evidence. This new surface is third-party market evidence, owned within Demand rather than a new top-level architecture.

Reuse the existing workspace DataForSEO credentials, project identities, confirmed competitor roster, task queue, Content workflow, Sources evidence and design system. No onboarding, competitor-discovery, Visibility scoring or existing Opportunities behavior changes.

The release includes canonical-site organic footprints, ranking keywords, missing/shared competitor keywords, single-seed phrase suggestions, backlink summaries, referring domains, linked destination pages, domain-level AI-source matches, and an explicit Content handoff.

**Out of release:** prompt generation/activation, arbitrary-domain exploration, child-subdomain analysis, merged multi-domain footprints, automatic Opportunities, individual-backlink exploration, historical backfills/charts, schedules, clickstream enrichment, Google Ads fallback, recursive seed expansion, new MCP/Growth Agent tools, outreach and autonomous publishing.

### Access and funding

Mirror current Search Demand authorization: workspace/project reads, `run` permission for acquisition, `write` for saved preferences and Content handoffs. Viewer is read-only; permitted Members can choose acquisition depth and run analyses. Owner/Admin continue to manage credentials. Destination-specific Content permissions still apply.

Use workspace BYOK only. No research debit against audit, SERP or AI credits; no new premium entitlement, wallet or platform-funded fallback. Existing project/competitor-roster rules remain unchanged; Search Intelligence adds no separate competitor-count restriction.

**No daily, monthly, lifetime, dollar or fixed call-count allowance.** Users may repeatedly acquire any supported finite amount they explicitly approve. Provider constraints, infrastructure pacing and protection against accidental/unconsented work are not product quotas.

## 2. Canonical target contract

Use one saved canonical main website per analyzed brand. Freeze its existing project/competitor identity, registrable domain, canonical hostname and canonical origin with every operation.

- The main hostname may be the apex or its saved `www` form. A canonical `www` website is not treated as an additional child-site feature. Use one selected canonical form, never sum apex and `www` footprints.
- Do not accept `blog`, `shop`, `app`, regional or other child hosts as research targets. Do not discover, enumerate, combine or independently analyze them.
- Reuse the existing Projects normalization and saved website/canonical evidence. Do not introduce another domain registry or silently strip a child hostname to its parent.
- When several saved domains exist, select one in the review drawer. When a saved canonical target is missing or unsupported, show an actionable target error and link existing project/competitor management. Do not run a discovery pipeline to guess it.
- Changing canonical target invalidates only affected saved selections/comparisons; historical evidence keeps its original target.
- Excluding child targets does not exclude legitimate external referring hosts or citation sources. Those remain source evidence, not analyzed targets.

**Technical correction to the supplied plan:** passing an apex target to an unfiltered Labs domain aggregate does not establish canonical-host-only coverage. Do not attach an invented `include_subdomains` flag to `domain_rank_overview` or `ranked_keywords`. Use the exact-host footprint and canonical-prefix comparison operations in section 4. Backlinks explicitly exclude target subdomains. [S1–S7]

## 3. User configuration and paid-action UX

### Defaults, not quotas

Expose **Analysis settings** in the existing shared drawer pattern and inside every acquisition review. Store a validated `search_intelligence_preferences` JSON field on Project, managed by this feature's scoped preferences API. It stores convenience defaults, never credentials or future payment consent. Per-run edits do not change defaults unless the user chooses **Save as project defaults**.

| Setting | Initial default | User control |
|---|---|---|
| Owned target | Existing canonical primary website | Select one existing eligible domain |
| Competitors | Existing eligible confirmed roster | Select any subset; none is valid |
| Labs market | Existing project country/language, when supported | One supported pair per run |
| Footprints and backlink summaries | Selected owned target and competitors | Separate dataset-group toggles |
| Owned ranking keywords | 200 rows | Positive integer, presets and Custom |
| Missing keywords | 100 per selected competitor | Positive integer; separate from shared depth |
| Shared keywords | 100 per selected competitor | Positive integer |
| Referring domains | 100 for owned target | Positive integer |
| Linked destination pages | 100 for owned target | Positive integer |
| Competitor backlink details | Not included initially | Explicitly select targets/datasets in review or Load details |
| Seed suggestions | 150 for one seed | Positive integer per explicit research command |
| Refresh schedule | None | No scheduler in this release |
| Fresh-result reuse | 30-day collection-age policy | Reuse recent data or request a fresh acquisition |

All row counts mean **up to the requested provider rows**, not guaranteed unique results. Offer presets including the default, 500, 1,000 and Custom. More than one provider page is supported through disclosed pagination. Do not turn defaults into server-side product caps. Enforce endpoint pagination bounds, safe integers, validation and genuine provider limits; explain when those prevent a request. Do not offer an unbounded “fetch everything forever” setting.

The market applies only to Labs. Backlinks are country-independent. Do not reuse the SERP market catalog as a substitute for Labs coverage or modify the project's AI Overview settings when changing the research market.

### One review pattern

**Run first analysis**, **Refresh**, **Research seed**, **Load backlink details**, **Increase data depth**, and a new paid retry all open the same compact review pattern:

1. Targets, market applicability, selected datasets and editable depths.
2. Saved results that will be reused, their dates, and avoided requests.
3. Maximum planned provider calls, requested rows, itemized estimated USD and total.
4. Disclosure: “Charged directly to your connected DataForSEO account. Actual charges may be lower if fewer rows are returned. Provider pricing and charges remain authoritative.”
5. An explicit **Run analysis · estimated $…** / equivalent confirmation button.

First analysis and new-scope/detail acquisition default to reusing eligible recent data. **Refresh** defaults to buying fresh data for the selected datasets, with reuse available as an explicit choice. No button named Refresh may silently behave like a read-only cache reload. The review always shows the actual choice.

One confirmation authorizes the disclosed finite sequence, including its pagination, not just the first HTTP call. Do not interrupt every page with a modal. Changing depth, target, credential revision, scope or pricing requires a new review. Preferences changes, navigation and preview calculation never authorize acquisition.

**Increase data depth** buys a newly reviewed result set of the larger requested size, unless a compatible complete larger snapshot already exists. Do not append a fresh provider-index page to an old snapshot and pretend it is one point-in-time acquisition.

### Cost visibility without a billing subsystem

Show a compact **Cost details** action beside freshness. Its drawer presents the last run's estimate versus provider-reported charges, requested/received rows, reused datasets, failed/uncertain calls and a paginated list of this project's Search Intelligence operations. Derive this from existing feature run/call records; do not create another ledger.

Label it **CiteLadder Search Intelligence usage**, not the customer's entire DataForSEO account spend. No live account balance polling is required. Unknown charges are visibly unresolved, not zero or a claimed final total. Display small amounts to four decimals with exact stored precision in details; round an upper estimate upward, never to a misleading `$0.00`.

## 4. Provider acquisition and metric contracts

Use synchronous Live calls in background work. Keep one provider task per HTTP request. Reuse the existing approved base URL, Basic Auth handling and safe errors; do not reuse SERP submit/poll/reconciliation for Labs or Backlinks.

Let `D` be the normalized registrable domain, `H` the frozen canonical hostname and `P` the canonical origin followed by `/*`. These are generated server-side from the authorized target, never arbitrary browser-built query syntax.

### Selected operations

All endpoints have the `/v3/` prefix. Apply explicit location/language to Labs. Set organic-only results and disable clickstream wherever those fields are supported. No historical modes or additional enrichment.

| Dataset | Endpoint suffix | Scope contract |
|---|---|---|
| Canonical-host footprint | `dataforseo_labs/google/subdomains/live` | `target=D`, `filters=["subdomain","=",H]`, `item_types=["organic"]`, `limit=1`, live SERP mode. Accept only the exact matching host row. This endpoint also returns the apex host; it is used internally as a filtered metric lookup, not a subdomain discovery feature. |
| Owned ranking keywords | `dataforseo_labs/google/ranked_keywords/live` | `target=D`, organic-only, exact provider filter on `ranked_serp_element.serp_item.domain=H`; requested depth through pagination. Never derive canonical totals from an unfiltered aggregate attached to this response. |
| Missing competitor keywords | `dataforseo_labs/google/page_intersection/live` | `pages={"1": competitor_P}`, `exclude_pages=[owned_P]`, `intersection_mode="union"`, `include_subdomains=false`, organic-only. |
| Shared competitor keywords | Same page-intersection endpoint | `pages={"1": competitor_P,"2": owned_P}`, `intersection_mode="intersect"`, `include_subdomains=false`, organic-only; no exclusion list. |
| Phrase suggestions | `dataforseo_labs/google/keyword_suggestions/live` | One seed; `exact_match=true`, `include_seed_keyword=false`, `include_serp_info=false`, no clickstream; requested depth. |
| Backlink summary | `backlinks/summary/live` | `target=D`, `include_subdomains=false`, `include_indirect_links=false`, live backlinks, `rank_scale="one_hundred"`. Apply the common canonical-destination filter below. |
| Referring domains | `backlinks/referring_domains/live` | Same backlink scope; requested row depth. |
| Linked destination pages | `backlinks/domain_pages_summary/live` | Same backlink scope; requested row depth. Not the raw `domain_pages` endpoint. |

Page Intersection explicitly supports absolute-URL wildcard prefixes, excluded prefixes and subdomain exclusion. Footprints/ranking rows are exact-host evidence; comparisons are the displayed canonical URL prefixes, not every historical protocol/alias variant. Preserve this distinction in evidence details and do not manufacture cross-dataset overlap percentages. [S1–S4]

For all three Backlinks operations, apply a provider-side `backlinks_filters` predicate on `url_to` matching the frozen canonical origin plus `/%`. This narrows the initial backlink set **before** aggregation, including the saved `www` form when applicable. Exclude internal referring domains from the analyzed root family with the same initial-set filter, rather than deleting table rows after calculating headline totals. Preserve these exact filters and use them consistently across summary and detail. [S5–S7]

Validate returned hosts/URLs against the requested scope. Unexpected broad coverage is a dataset-level contract failure, never permission to fall back to parent-domain totals. Preserve successful unrelated datasets. Do not label a contract failure as an observed zero. A successful empty host lookup means no matching footprint row in this provider index; absent metrics stay unavailable rather than being filled with zeros.

Freeze deterministic provider ordering: keyword volume descending then keyword text for keyword datasets; backlink count descending then domain/URL for detail lists. Use documented sortable fields only. Local sorting/filtering over saved data does not alter acquisition order or call the provider.

### Metrics

| UI measure | Exact source / rule |
|---|---|
| Organic keywords / estimated monthly traffic | Matching footprint row `metrics.organic.count` / `.etv`; not response `total_count`, sessions or GSC clicks. |
| Top-10 keywords / percentage | `pos_1 + pos_2_3 + pos_4_10`; divide by the same organic count only when positive. Missing bucket is unknown; zero denominator is not applicable. |
| Keyword / volume / difficulty / intent | `keyword_data.keyword`, `.keyword_info.search_volume`, `.keyword_properties.keyword_difficulty`, `.search_intent_info`; suggestion rows carry these directly without `keyword_data`. Advertising competition is not difficulty. |
| Owned position / URL / traffic | Organic `ranked_serp_element.serp_item.rank_group`, `.url`, `.etv`. Never `rank_absolute`. |
| Comparison rows | `intersection_result["1"]` is the competitor; `["2"]` is owned for shared results. Read organic `rank_group`, `url`, `etv`. Missing results do not invent an owned rank. |
| Missing/shared totals | Matching comparison response `total_count`, distinguished from acquired and filtered rows. Never subtract two capped ranking lists. |
| Backlinks / unique referring domains | Summary `backlinks` / `referring_main_domains`. Do not substitute `referring_domains`, which has different subdomain granularity. |
| Referring-domain row | `domain`, `backlinks`, `rank`. |
| Linked-page row | `url`, `backlinks`, `referring_main_domains`, `rank`; these are destination pages. |
| Rank | Label **DataForSEO Rank (0–100)**, store requested scale and object type. A referring domain's rank is not a score for the analyzed host. |
| Coverage | Provider total, raw rows received, unique rows saved, current filtered rows, requested depth and truncation are distinct. |

Keep field update dates and local collection dates separate. A 30-day-old collection policy says nothing about the provider's observation age. Suggested keywords have **Not checked** positions unless joined to exact compatible saved ranking evidence. “Missing” means not observed within the provider's specified comparison scope, not proof that a site never ranks.

### Pagination

Split a requested depth into provider-supported pages, currently at most 1,000 rows per call for these lists. The final page requests only the remaining authorized rows. Stop on exhausted results, requested depth reached, provider pagination limits, cancellation, or a repeated/non-advancing page. Never exceed the reviewed call/row plan to compensate for duplicate rows. Record acquisition start/end and index drift limitations; a paginated Live acquisition is not guaranteed to be a provider-atomic snapshot.

Saved-table pagination is exclusively database-backed and snapshot-bound. There is no provider fetch on “next page.” [S2–S9]

## 5. Pricing, confirmation and cost safety

Use versioned, server-owned pricing in `core/config/`; never browser-authored prices or an AI Overview SERP rate. Public price cards checked on 20 September 2026 give the selected standard Labs operations **$0.012/task + $0.00012/item**, and Backlinks **$0.024/request + $0.000036/row**. No clickstream multiplier is enabled. [S8–S9]

For a list requesting `N > 0` rows with a 1,000-row provider page size:

```
pages(N) = ceil(N / 1000)
Labs estimate(N) = 0.012 × pages(N) + 0.00012 × N
Backlinks estimate(N) = 0.024 × pages(N) + 0.000036 × N
```

Estimate one footprint item and one backlink-summary result per target. For the default full acquisition and `C` selected competitors, excluding optional competitor details and seed research:

```
planned calls = 5 + 4C
estimated USD = 0.127356 + 0.084156C
```

With five competitors this is **25 calls, $0.548136**; five is an example, not a limit. No competitors is **5 calls, $0.127356**. Seed research at 150 rows is **$0.030**. Two 100-row backlink detail lists are **$0.0552**. A 5,000-row Labs list is **$0.660** across five calls. These are calculated maximum-row estimates under the cited rate card, not authenticated account quotes. Reuse and early exhaustion reduce work; provider-specific discounts/taxes are not invented.

A provider-free review creates a `reviewed` run record with immutable scope, connection revision, rate version, reused snapshot references and finite call-plan descriptor. Reviews expire after 10 minutes. Confirming atomically validates that record and membership, admits the operation and enqueues work. Duplicate confirmation returns the same run; it never purchases another run.

**The approved estimate is a consent boundary, not a CiteLadder usage quota.** Do not impose a separate $1/$0.10 limit or a 30-call ceiling. Execute the reviewed sequence without additional paid retries. A changed rate, unpriced operation, uncertain charge or reported cost that makes the remaining sequence exceed the approved estimate stops further dispatch and presents a new review of remaining work. The user can approve any higher supported amount. Already incurred provider charges cannot be undone or guaranteed by a local estimate.

Parse cost using Decimal and store `Numeric(20,8)` USD, serializing decimal strings. Use task cost as authoritative for a one-task response; envelope cost is an explicitly labelled fallback only. Never add both. Store estimated and provider-reported costs separately; failures may still cost money, and absent cost is null, not zero.

No spend wallet or reservation engine is needed: a run sends only one provider request at a time, its paid sequence is finite, and automatic paid retries are disabled. Persist the call intent before dispatch and known/uncertain outcomes afterward. Quote arithmetic and scope enforcement remain server-authoritative.

## 6. Backend implementation

### Existing owners and selected extensions

| Concern | Implementation owner |
|---|---|
| Feature services/read models | Focused `backend/app/domain/demand/search_intelligence/` module; no GSC detector or `QueryEvidenceRow` changes. |
| Credentials | Existing Providers owner. Resolve DataForSEO directly for this workload, not through a fake logical engine or an AI Overview run. |
| Transport | Focused DataForSEO research connector; share pure auth/HTTP/error helpers with the existing connector. Keep SERP behavior separate. |
| Queue | Existing `AnalyticsTask`, `analytics_worker.py`, `PostgresTaskQueue` and terminal compensation. |
| Capacity | Existing `orchestration/provider_capacity.py`; narrow AnalyticsTask-compatible extension described below. |
| Content/Sources | Existing context-builder and evidence-selection owners. |

### Credentials and capacity

Select an unambiguous eligible workspace DataForSEO connection, or explicitly select an existing connection in the review. Freeze connection ID, non-secret account identity and credential revision. Rotation/deactivation prevents further dispatch under that review; do not substitute another connection. Saved evidence remains readable under membership after credential deletion.

Keep the existing non-billable `/v3/appendix/user_data` probe. Settings copy becomes **“Used by Google AI Overview and Search Intelligence.”** Passing authentication is not proof of balance or access to every dataset.

Resolve the audit-only capacity coupling with a narrow extension: make the existing capacity lease's audit `task_id` nullable, add nullable `analytics_task_id` referencing `analytics_tasks`, and enforce exactly one parent with a CHECK constraint and owner-specific unique indexes. Extend `CapacityRequest` with the same exclusive task identity and a Search Intelligence workload policy; existing audit callers retain their behavior. Never fabricate an audit, integration sync or logical engine.

Use the same PostgreSQL capacity owner for all DataForSEO callers. Add an opaque account pool identity derived by the credential owner using keyed HMAC over the provider-normalized API login; never log the login or password. Include that identity in bucket uniqueness. Both research and existing DataForSEO SERP calls use it, so two saved connections to the same login share concurrency/cooldown without sharing research data.

Initial safety policy: one active acquisition per project; one in-flight provider call per run; at most two calls per DataForSEO account, paced at one start/second, also subject to existing stricter transport/endpoint policies. These are conservative operator-configured throughput settings, not claimed provider maxima or user usage allowances. Use stable bucket lock order and shared provider cooldowns. No process-local semaphore, separate queue, automatic account-rate probing or user-facing concurrency control. Other software using that account remains outside CiteLadder's visibility.

### Four feature records, no generic evidence framework

Add the following feature-specific models with composite workspace/project integrity:

1. **Run:** reviewed/queued/running/terminal lifecycle, frozen configuration, quote version, actor, idempotency key, account provenance, progress and cost summary. One `AnalyticsTask` drives a confirmed run and checkpoints between pages.
2. **Dataset:** one acquisition's semantic scope, requested/received coverage, summary, collection interval and parser version. Collecting data is not the current published snapshot; terminal data publishes atomically with complete/partial coverage.
3. **Call:** one immutable request identity and pre-dispatch intent, lifecycle/fencing fields, plus a write-once sanitized response/outcome, response hash, provider task ID and exact cost. This is the research attempt/artifact record; it has no mandatory audit or OAuth parent.
4. **Row:** normalized, typed feature evidence under one dataset, tied to the originating Call and stable provider-row identity. Use indexed columns for supported filters/sorts and JSON only for retained auxiliary evidence.

Do not broaden `RawResponseArtifact` or `IntegrationImportArtifact` with fictitious parents. Reuse safe serialization/storage mechanics, not their incompatible relational identity. A finalized response and published dataset/rows are immutable. A derived citation-match Dataset has a scoped parent-dataset reference instead of pretending to own a provider Call. Response projection/manifest is computed from saved references and requires no separate table or service. Project preferences are the single JSON field from section 3, not another settings subsystem.

### Execution and recovery

Use the current queue lease, heartbeat and fencing owner. Commit database transactions before network I/O. Check current run permission and frozen credential eligibility before each dispatch. Process the finite plan incrementally; never allocate an unbounded in-memory task list for a large user depth.

For each page: acquire shared capacity; persist dispatch intent and the frozen request/cost; commit; send once; persist sanitized response/outcome; normalize and checkpoint; release capacity. A worker retry may reparse saved responses or resume an undispatched next page. It must not resend a possibly dispatched request.

**No automatic paid retries in this release.** Timeouts, connection loss after dispatch, expired leases and crashes after intent produce an uncertain outcome unless saved evidence proves otherwise. Local fencing does not establish remote exactly-once execution. Preserve completed datasets and let the user explicitly review only unresolved work in a linked new run. Record the previous unknown charge permanently under normal evidence retention. No assumed Live equivalent of SERP reconciliation.

Cancel stops future calls, not an already dispatched provider request. Capture its eventual outcome when safely possible. Repeated pages, malformed scope, provider limits or errors terminate affected work with explicit coverage. Shared auth failure stops the account's pending work; dataset-specific access/market failure does not erase or disable unrelated successful data. Parent tasks cannot remain running after worker terminal failure/sweep.

### Snapshot reuse and lifetime

Identity includes workspace/project, account provenance, dataset kind, actual target/prefix, applicable market, provider filters/order, scope and parser version. Comparisons bind both ordered targets. Requested depth is coverage metadata: a compatible complete deeper snapshot may satisfy a smaller request. Never treat a partial dataset as complete or a successful empty result as a cache miss.

Backlink identity has no Labs market. Changing country never repurchases backlinks automatically. A current roster edit affects roster comparisons, not unchanged standalone datasets. Local filters, pagination and ordinary reads cannot acquire, derive, repair or enqueue.

Refresh publishes independent successes. Retained previous sections must match semantic scope and preserve their dates; label mixed-age/partial views. No fresh aggregate assembled from incompatible comparisons. Preserve source data referenced by handoffs under existing project retention/deletion rules. Disconnecting credentials does not cascade-delete research. No analytical history selector or chart is added.

### API

Base: `/api/v1/projects/{project_id}/search-intelligence`.

Reads: readiness/latest projection, run/cost details, saved settings, snapshot-bound dataset pages and saved seed-result selection. Commands: update preferences, create review, confirm review, cancel run, and explicitly update citation matches. Analysis, seed, detail, increased-depth and paid-recovery commands share the review/confirmation schema rather than separate acquisition architectures.

Run/call/snapshot IDs and every selected evidence row are reauthorized server-side. Typed cursors bind workspace, project, dataset snapshot, filters, sort and page size. Use existing coded errors and aligned Pydantic/Zod contracts. Secrets, raw account diagnostics and browser-supplied provider prices never enter public responses.

## 7. Frontend and existing-workflow handoffs

Use current PageShell, Geist/tokens, tabs, tables, drawers, fields, UnavailableValue and read-error primitives. No dependency or parallel design system. Register lazy route, shared navigation/Command Palette, read-only prefetch, Caddy direct-entry ownership and the explicit Tailwind source directory. Query keys include workspace/project and dataset scope; do not show another project's rows as placeholders.

| Surface | Required behavior |
|---|---|
| Overview | Canonical footprint, qualified traffic/Top-10 metrics, backlink summary, compact competitor comparison; links to saved datasets, no invented opportunity score or movement. |
| Keywords | Ranking rows plus saved single-seed research results. Table search is local. Research seed is a distinct reviewed action. Retain/reopen saved seeds; no auto-generation or Add to prompts button. |
| Competitors | Existing selected canonical targets, scoped footprints and missing/shared results; open saved gaps for free. Empty roster is valid and links existing management. |
| Backlinks | Summary, referring domains and linked destination pages. Show canonical destination scope and country independence. Missing competitor detail uses explicit Load details; row/tab opening is free. |
| Evidence drawer | Provider, scope, timestamps, counts/coverage, metric definitions and source Call/Dataset references. No network acquisition on open. |

No connection and no data: one first-use explanation plus Provider settings recovery; non-admin users ask an administrator. Connected without data: configuration and first-run action. Running: real completed/planned progress, not fabricated estimates. Refresh failure: retain compatible saved data. Uncertain charge: explain it before another paid attempt. Zero, missing optional values, unsupported scope and access failure are distinct states. Read Retry repeats only the read; it never buys data. Lost workspace access clears protected content immediately.

**Content:** selected saved evidence opens the existing Content context preview with typed IDs and empty user instructions. Resolve facts server-side, preserve exact dataset/call references, and treat source text as untrusted. Generation and publishing remain separate existing explicit actions and funding rules. Opening the handoff makes no model call.

**Sources:** v1 overlap is explicitly **domain-level**, within collected referring domains, not exact-page proof or evidence of causation. Freeze existing Visibility selection (resolved audits/window/engines/cohort) during an explicit local derivation after acquisition or an **Update citation matches** command. Persist each match result as a new derived Dataset referencing the backlink Dataset and frozen Visibility selection; never mutate a published acquisition to update its matches. Reuse the same feature persistence owner, not a new evidence platform. A changed citation selection requires another free explicit derivation, never another backlink purchase. No eligible citations means unavailable, not zero. Link **View in Sources** only to a supported destination preserving that selection. Never write Citation rows, Sources totals, earned-page verdicts or Visibility scores.

Preserve keyboard tabs, accessible table headers/sort state, drawer focus restoration, mobile overflow, non-color status cues, reduced motion and forced colors.

## 8. Ordered implementation phases

### Phase 1 — Foundations, scope and cost review

Implement feature config, canonical adapters, provider-free quote arithmetic, preferences, four-record persistence, Providers resolution and the narrow shared-capacity extension. Fold pre-launch schema changes into the repository's current single greenfield baseline. Use disposable test data only. No new activation/billing decision is required.

### Phase 2 — Durable acquisition, Overview and Keywords

Implement finite paginated work, dispatch-intent recovery, saved reads, cost receipts and partial publication. Wire route/navigation/Caddy/styles and all connection/refresh/error states. Deliver canonical footprints, own ranking data and independent seed suggestions with editable depth.

### Phase 3 — Competitor comparisons

Add selected existing competitors, canonical-prefix missing/shared requests and saved gap UI. Prove comparison direction and exclude child-only matches. Do not change competitor discovery or add another roster editor.

### Phase 4 — Backlinks, Sources and Content

Deliver consistent canonical backlink summaries/details, explicit competitor detail loading, market-independent reuse, domain-level citation matching and evidence-preserving Content handoff. No prompt changes.

### Phase 5 — Release acceptance and cleanup

Run the focused checks below, remove superseded feature-local code/branches, and update affected owner documentation only for implemented behavior. Do not use this feature as a reason for unrelated refactors, a new scheduler or billing framework. Release phases 1–5 without waiting for prompt-generation research.

### Phase 6 — Deferred: evidence-grounded prompt generation

**Do not implement, scaffold, migrate or expose this phase in the current release.** Leave Prompts, its active/archived lifecycle, onboarding and subsequent generation unchanged. No disabled placeholder CTA is necessary.

The later phase must first research and evaluate mapping keyword evidence to buyer questions, intent/topic selection, duplicates, low-volume relevance, latency and model cost. Its eventual workflow belongs to the existing Prompts owner with editable review and explicit activation, never automatic keyword-to-active-prompt conversion. Preserve current evidence IDs so future work has a reliable source. This deferred research is not an unresolved dependency for phases 1–5.

## 9. Acceptance and completion

Focused behavioral tests, not one test per field or CSS class:

- **Scope/metrics:** apex and canonical-www fixtures; blog/shop-only ranking and backlink fixtures; no parent fallback; canonical-prefix comparison direction; organic group rank; count/ETV/Top-10/KD; null versus zero; no sample-derived market totals.
- **Usage/quotes:** 200, 1,000 and multi-page Custom depths; all eligible roster sizes without a new feature cap; rate arithmetic/rounding; reused datasets; expired/changed review; idempotent confirmation; no $1, daily or fixed-call quota; server rejects altered scope/price.
- **Real PostgreSQL:** exclusive acquisition, shared account leases for audit and analytics owners, queue fencing/heartbeats, no network under locks, checkpoint recovery, uncertain dispatch without resend, cancellation and parent terminal compensation. Account-pool deduplication shares capacity only, not tenant evidence.
- **Data:** complete/partial/empty reuse, backlink reuse across markets, immutable published rows, scoped cursors, alias/roster changes, retained evidence after credential removal, and inconsistent comparison prevention.
- **Cost safety:** task/envelope double-count prevention, fractional cents, charged failures, unknown charges, price drift requiring a new review, and no automatic paid retries or platform fallback.
- **API/UI:** no billable calls or enqueue on GET, preview, preferences, navigation, filters, table pagination, prefetch or read Retry; distinct reviewed Load/Refresh/Research; permission recovery; cross-project clearing; keyboard/mobile/Caddy behavior.
- **Regression:** existing DataForSEO probe and Google AI Overview lifecycle, GSC Search Demand, onboarding, Prompts, Visibility/Sources and Opportunities remain correct. Content navigation does not generate/publish.

Use deterministic sanitized fixtures and no real keys. Run affected suites sequentially; inspect failure tails rather than dumping logs. Run `./scripts/check.ps1` once after executable work is complete; CI owns full release/Compose validation. Documentation-only adoption requires no executable test suite, paid requests or database reset. Capture routine results in the PR, not duplicate progress documents.

**Done:** all four tabs acquire only the user-reviewed data, display canonical scope and costs honestly, read saved evidence without provider I/O, survive partial/uncertain execution, and hand authorized evidence to Content/Sources. Prompt generation remains deferred. There are no product questions or architecture-selection gates left for the coding agent.

## Reference basis

The supplied plan is the baseline; sections 2–6 contain selected revisions from the owner's latest decisions and the final technical review. Public API contracts/prices were checked on 20 September 2026; they are not authenticated execution evidence.

- [S1] Exact-host metrics: https://docs.dataforseo.com/v3/dataforseo_labs-google-subdomains-live/
- [S2] Ranked keywords: https://docs.dataforseo.com/v3/dataforseo_labs-google-ranked_keywords-live/
- [S3] Canonical-prefix comparisons: https://docs.dataforseo.com/v3/dataforseo_labs-google-page_intersection-live/
- [S4] Phrase suggestions: https://docs.dataforseo.com/v3/dataforseo_labs-google-keyword_suggestions-live/
- [S5] Backlink scope/summary: https://docs.dataforseo.com/v3/backlinks-summary-live/
- [S6] Referring domains: https://docs.dataforseo.com/v3/backlinks-referring_domains-live/
- [S7] Linked destination pages: https://docs.dataforseo.com/v3/backlinks-domain_pages_summary-live/
- [S8] Labs rate card: https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api
- [S9] Backlinks rate card: https://dataforseo.com/pricing/backlinks/backlinks

Current code rechecked during final review: `backend/app/orchestration/provider_capacity.py`, `backend/app/models/audit.py`, `backend/app/models/analytics.py`, and `backend/app/models/project.py`. Their current task-parent and project-configuration shapes informed the concrete extensions above. Other extension points preserve the supplied plan's repository mapping.
