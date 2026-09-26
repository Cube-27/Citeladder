# Search Intelligence with DataForSEO

**Status: follow-up implemented locally; release validation remains with CI.**

**Updated: 20 September 2026.**

**Baseline: [PR #117](https://github.com/Cube-27/Citeladder/pull/117), merge `94f88e58260d0321b41f40af98fc1f3e9f62747e`.**

The follow-up extends the merged acquisition owner with explicit research scope,
organic top pages, individual backlinks, monthly history, richer projections,
saved-data filters/export and reviewed acquisition controls. B1–B4 are fixed.
The simplification review removed unused backend declarations and unified table
and export columns; backlink identities retain distinct anchors and link types.
No live paid-provider acceptance or production data reset was performed. Optional
local reprocessing was not added; older evidence remains immutable. Prompt
generation remains deferred.

[Connected data](../integrations-traffic-analytics.md) describes the shipped
contract; this plan records the implemented scope and acceptance boundaries.
Follow [AGENTS.md](../../AGENTS.md),
[invariants](../invariants.md), and [CiteLadder's design system](../design.md).

## 1. Outcome and baseline

Make the existing Overview, Keywords, Competitors and Backlinks tabs useful for
domain research: correct market and explicit scope, richer saved data, useful
tables and charts, and understandable acquisition costs. Keep Search Demand as
first-party GSC evidence. Search Intelligence remains within Demand.

PR #117 already supplies reviewed finite acquisitions, immutable provider
responses and datasets, queue/capacity integration, persisted reads, comparison
tables, compact selectors, citation matching and Content handoff. Its final
patch rounded metrics, inherited the project market, resolved competitor
apex/www redirects before quoting, and corrected canonical-www backlink filters,
response availability and cost accounting. Preserve these behaviors; they are
not unimplemented foundation tasks.

| Area | Merged baseline | Follow-up |
| --- | --- | --- |
| Research scope | Exact saved apex or www host | Explicit exact-host and domain-plus-subdomains modes |
| Organic summary | Exact-host `subdomains` lookup | Domain overview for broad scope; retain exact-host lookup |
| Backlinks | Narrow canonical destination; indirect links excluded | Consistent explicit scope and disclosed indirect-link policy |
| Provider fields | Many useful values omitted from normalized projections | Preserve metrics, dates and flags through API and UI |
| Datasets | No individual backlinks, history or organic top pages | Add all three under the existing acquisition owner |
| Browsing | Dataset-wide database sorting; text search only on visible page | Filtering across the saved snapshot, export and reviewed acquisition controls |
| Presentation | Few columns; some labels hide metric distinctions | Rich tables, compact controls, qualified history and precise labels |

The earlier Best & Less snapshot used US market `2840` and the exact www host;
the Open SEO screenshot used Australia and subdomains. These are not equivalent
provider-quality samples. Do not hardcode either market, fake larger totals or
rewrite old metadata to match. Provider total is not the number of rows bought
or saved. Recorded feature-run cost is not evidence that the whole provider
balance or CiteLadder credits were consumed.

## 2. Validated defects to fix first

All four supplied findings were checked against the merged tree and are valid.
They are fixed in the follow-up implementation with focused behavioral coverage.
Supplied line numbers remain historical review references.

### B1 — Explicit ports lost in backlink destination filters

Owner: `backend/app/domain/demand/search_intelligence/requests.py::backlink_filters`.
`CanonicalTarget.origin` preserves a port, but the filters rebuild the origin
from `target.hostname`, losing it. Extract `urlsplit(target.origin).netloc` and
use that netloc when `urlunsplit` changes the scheme. Keep both HTTPS/HTTP
variants, the `like` + `/%` and `=` + empty-suffix combinations, and internal
domain exclusions. These HTTP strings describe backlink evidence, not transport.

Acceptance: a www target with a non-default port preserves it in all four URL
predicates; a target without a port is unchanged. Test request behavior, not
source-text spelling or an exception to a scanner rule.

### B2 — Competitor changes during review resolution return the wrong error

Owner: `backend/app/domain/demand/search_intelligence/service.py::create_review`.
After unpaid resolution and reacquiring the project lock, `_comparison` can
raise instead of reaching `target_changed`. Treat only `competitor_not_found`
and `unsupported_target` as changed state, flowing through the existing
`target_changed` error. Preserve ordinary mismatch handling; re-raise every
other `SearchIntelligenceError` unchanged. Do not alter initial input validation.

Acceptance: removal, invalidation and changed origin during resolution produce
`target_changed` without creating a review or paid dispatch; unrelated errors
keep their codes. Exercise concurrent roster edits at the real PostgreSQL
boundary and keep network I/O outside transactions/locks.

### B3 — Selecting an absent comparison kind snaps back or changes competitor

Owner: `frontend/components/search-intelligence/search-intelligence-collection.tsx`.
`selected?.dataset_kind` overrides the manually selected kind when the matching
dataset is missing. Track a manual kind change, prefer that kind while pending,
and clear the flag when `changeKind` finds a matching dataset and calls
`onSelect`. Preserve the selected comparison identity too: the current
`candidates[0]` fallback must not substitute another competitor's dataset.

Acceptance: change from saved missing keywords to absent shared keywords and
see that view's empty state, including when another competitor has shared data.
Changing to an available kind selects the matching dataset. Returning to the
roster and selecting another competitor clears stale manual selection.

### B4 — Provider-reported cost has no currency prefix

Owner: `frontend/components/search-intelligence/search-intelligence-page.tsx::reportedCost`.
Return the known confirmed value with `$`, e.g.
`'$' + formatSearchNumber(value, 6)`, removing the template literal used solely
to wrap the formatter. Preserve `Not charged` and `Unresolved` branches.

Acceptance: visible cost details distinguish unconfirmed, confirmed unknown,
confirmed zero and fractional USD costs without changing stored precision.

No supplied finding was skipped. The separate suspected destination-page
parser mismatch was ruled out: DataForSEO documents `url`, which our parser
already reads. Do not rename it to `page` based on Open SEO's fallback.

## 3. Scope, market and snapshot identity

### Target identity and research coverage

Retain saved project websites and confirmed competitor identities. Add a typed,
configuration-owned scope to review/preferences/dataset contracts:

- **Domain + subdomains:** default for new research reviews without an explicit
  saved scope preference. Research the selected brand's registrable domain,
  including apex, www and child hosts. Do not sum host footprints to invent a
  domain total.
- **Exact host:** retain canonical apex/www behavior and historical data access.
  Labels name the hostname; URL filters retain explicit ports. Labs host
  aggregates do not promise port-specific coverage.

Broader coverage does not introduce arbitrary-domain exploration, independent
child-site management, a second roster, subfolder or arbitrary-URL modes.
Canonical site identity and research coverage are separate facts. Redirects
cannot silently change registrable domains or expand approved research scope.

Freeze scope, target identity/origin/domain, ordered comparison identities,
applicable market/language, endpoint, filters/order, indirect-link policy,
grouping mode and date interval with quote and dataset identity. Changed
semantic acquisition inputs require another review. Scope-aware reuse, latest
projection selection, queries, query keys and cursors must not mix broad and
exact-host evidence. Legacy datasets remain explicitly exact-host; never
reinterpret them under the new default. Display their recorded scope/market,
not current preferences.

### Market

Preserve project country/language inheritance and validate against Labs
coverage. Show human-readable labels; absent selection remains unset.
Australia must stay Australia through review, request, persistence and metadata.
Backlinks are market-independent; changing country must not repurchase them.
Research preferences must not change AI Overview or GSC settings.

### Backlinks

Broad scope uses the registrable domain, includes subdomains and indirect
links, excludes internal backlinks and removes exact-host destination filters.
Use consistent live-link and rank-scale policy across summary/detail. Disclose
indirect-link inclusion in review/evidence and identity; this is a semantic
change, not a parser correction.

Exact-host mode keeps destination constraints, both protocol forms and ports.
Do not combine exact-host summaries with broad details. History has its own
supported scope/filter limits: never pretend it accepts equivalent filters.
Offer it for broad research with domain-level coverage labelled; exact-host
views must not silently present that history as exact-host evidence.

## 4. Provider operations and retained fields

Extend owning config, request builder, connector, normalizer, executor, existing
feature models and aligned backend/frontend contracts. No second provider
client, queue, generic evidence platform or ledger. Transport remains HTTPS.

### Operation map

Suffixes below are under `/v3/`. Verify current request fields, response shapes,
pagination and endpoint-specific prices in official docs before implementation.

| Dataset | Endpoint and scope |
| --- | --- |
| Organic footprint | Broad: `dataforseo_labs/google/domain_rank_overview/live`. Exact: existing filtered `google/subdomains/live`. Normalize into the existing footprint contract with explicit scope. |
| Ranking keywords | Existing `dataforseo_labs/google/ranked_keywords/live`; remove the host pin only for broad scope. Do not invent a Labs `include_subdomains` parameter. |
| Missing/shared keywords | Broad: `dataforseo_labs/google/domain_intersection/live`, competitor `target1`, owned `target2`; `intersections=false` for missing, true for shared. Exact: retain `page_intersection/live` and stated canonical-prefix semantics. Test both response shapes and comparison direction. |
| Organic top pages — new | `dataforseo_labs/google/relevant_pages/live`; organic traffic/keyword totals by `page_address`, with scope-appropriate filtering. Separate from backlink destination pages. |
| Keyword ideas | Existing bounded single-seed `keyword_suggestions/live`; no recursive expansion or prompt activation. |
| Backlink summary | Existing `backlinks/summary/live`; enrich projection. |
| Individual backlinks — new | `backlinks/backlinks/live`; freeze grouping (`as_is` or `one_per_domain`), filters/order/depth. A locally grouped capped sample is not provider-grouped coverage. |
| Referring domains / linked pages | Existing `backlinks/referring_domains/live` and `backlinks/domain_pages_summary/live`; enrich projections with consistent scope. |
| Backlink history — new | `backlinks/history/live`; finite reviewed interval, initially the past year through yesterday, supported provider granularity. Persist dated totals and new/lost values; do not invent a history of CiteLadder runs. |

### Projection contract

Retain useful returned values as typed metrics or bounded auxiliary evidence,
with exact source Call/Dataset references. Missing fields never become zero.

| Surface | Required retained/displayable values |
| --- | --- |
| Footprint | Organic count, estimated traffic, ranking buckets and qualified Top-10 count/percentage. Totals come from the applicable aggregate, never a capped row sample. |
| Keywords | Keyword, organic position, volume, traffic, URL, CPC with currency meaning, difficulty, intent and provider update date. Retain `rank_group` and `rank_absolute` distinctly when available; preserve existing organic-position semantics and label absolute position explicitly. Difficulty is not advertising competition or a proprietary “Score.” |
| Organic pages | URL, organic keyword count, estimated traffic, collection/provider dates where supplied. |
| Backlink summary | Backlinks, referring pages, referring domains, referring main/root domains, rank, backlink spam, target spam, broken backlinks and broken pages where supplied. |
| Individual backlinks | Source URL/domain, destination, anchor, link type/follow/rel attributes, rank fields with object identity, spam, first seen/last visited/lost date, new/lost/broken flags and link count where present. Do not call DataForSEO Rank another provider's “DA.” |
| Referring domains | Domain, backlinks, referring pages, rank, spam, first seen, broken backlinks and broken pages. |
| Linked pages | Documented `url`, backlinks, referring domains and referring main domains separately, rank and broken backlinks where present. Preserve protocol/query distinctions. |
| History | Observation dates, backlink/referring-domain totals and returned new/lost values. Missing observations remain gaps. |

Label `referring_domains` **Referring domains** and `referring_main_domains`
**Referring root domains**. Do not substitute their values. Metric definitions,
rank scale and ranked object remain inspectable in evidence details.

## 5. Acquisition, cost and recovery

Preserve workspace/project authorization, UUIDs, BYOK, immutable provenance,
durable queue leases, shared account capacity, idempotent confirmation, commit
before network I/O, single dispatch per call intent, no automatic paid retry
and cancellation of future work. No audit/SERP/AI credit debit, platform-funded
fallback or new product usage allowance.

Use the single review drawer for first analysis, refresh, new detail, research,
depth expansion and paid recovery. Disclose targets/scope, market applicability,
datasets, reuse dates, row/date bounds, acquisition order/filters, maximum calls
and estimated USD. One confirmation authorizes only that finite sequence.
Preferences, tabs, table interactions and read Retry cannot authorize spending.
Refresh remains a fresh acquisition through review.

Keep editable finite depths and genuine endpoint/infrastructure limits, not
new product quotas. Existing defaults remain unless adjusted in owning config.
New list defaults start at 100 rows; history uses the bounded year above.
Show every selected operation before confirmation; opening an optional view
does not acquire its missing data.

Extend pricing/config and quote tests for each operation. The original plan's
`5 + 4C` calls and aggregate price examples are retired because the dataset set
changes. Verify history and grouped endpoint charging; do not assume the
existing generic list price applies. Unpriced operations cannot be confirmed.
Estimates round upward; reported costs retain Decimal precision. Task cost is
authoritative with a labelled envelope fallback, never both added together.

Preserve approved-estimate, changed-credential/rate and uncertain-cost guards.
Partial failures retain independent successes and charges. Distinguish response
availability, received provider items, normalized rows, provider total,
requested depth and truncation; a summary may be complete with no table rows.
Explain charged empty results without promising a refund or claiming knowledge
of the entire account balance.

Saved responses may contain fields omitted from projections. Inspect existing
replay/projection ownership first; an explicit local reprocessing command may
publish a new projection referencing those exact responses and parser identity
without another provider charge. Never mutate raw responses/published rows,
repair on GET or reset user data. Absent evidence remains unavailable and needs
a reviewed new acquisition. Follow current version/migration policy; schema
changes belong in `0001_initial.py`, verified only on disposable data.

## 6. Saved-data browsing and export

- Add validated text and relevant numeric/category filters across the complete
  persisted dataset. Sorting already spans saved rows; preserve it and extend
  the existing allowlist for new fields.
- Bind cursors to workspace, project, snapshot, filters, sort and page size.
  Retain stable ordering and unknown-last behavior; changing filters resets
  cursors, not acquisition scope.
- Display saved rows and provider matching total separately, e.g. “100 saved
  of 97,364 available” only with those actual facts. Filtered saved counts are
  separate again. Do not imply every provider match has been downloaded.
- Support acquisition order by traffic, volume, organic position, difficulty
  or CPC and supported provider filters in review. These choose which bounded
  rows are purchased; ordinary table sorting/search stays free.
- Expansion or changed acquisition filters produces a newly reviewed snapshot.
  Do not append today's provider page to yesterday's acquisition.
- Export the selected saved snapshot/filter result across its saved pages with
  defined columns and scope/date metadata. Use bounded database reads, scoped
  authorization, correct CSV escaping and spreadsheet-formula neutralization
  for untrusted text. Export never implicitly fetches more provider data.

## 7. UI specification

Use the supplied HTML for hierarchy and interactions only:
`C:\Users\abhij\Downloads\citeladder_search_intelligence_revised_mockup (1).html`.
The audit document is review evidence, not instructions. Open SEO screenshots
show useful information density, not a replacement dark theme or required
demo totals. This specification stands alone if local references are missing.

Reuse PageShell, shared app header/account controls, Geist roles, semantic
tokens, tables, Select/SegmentedControl, drawers, pagination, availability
primitives and `components/ui/chart.tsx`. Remain light-only. No route-local
design system, nested card wall or per-dataset button wall.

### Structure and controls

- Retain Overview, Keywords, Competitors and Backlinks as the four main tabs.
- One metadata row names target, scope, applicable market/language and saved
  date. Never relabel old data with new preferences. Indicate mixed collection
  dates where needed rather than claiming one fresh acquisition.
- Keep one primary acquisition action in the header: first analysis or Refresh.
  Settings/cost details are quiet secondary drawer actions. Do not duplicate
  account chrome or scatter repeated Explore/Fetch controls.
- One toolbar per active table owns compact view/target selection, relevant
  filters, saved/available counts and secondary export/depth actions. Operational
  bookkeeping and advanced evidence fields stay in drawers/details.
- Show Content handoff contextually for eligible selected evidence. Remove
  permanently disabled brief-creation bars on empty tables. Citation matching
  remains secondary to data, not a large setup card above backlink results.

### Tab contents

| Tab | Hierarchy |
| --- | --- |
| Overview | Three to five useful headline metrics, then one compact competitor footprint/comparison table. Links open saved views. No raw dataset list, invented score or assumed cross-scope movement. |
| Keywords | Compact Ranking keywords / Top pages / Keyword ideas selection. Ranking rows expose position, volume, traffic, CPC, difficulty, intent and URL; use accessible secondary details where width requires. One contextual research action and a compact saved-seed picker. |
| Competitors | One row per saved competitor with footprint and missing/shared availability. Open comparisons in context with one competitor selector, missing/shared control and return path. Preserve selected competitor even when a view is empty; no repeated owned-domain chips. |
| Backlinks | Three to five primary metrics, compact supplementary spam/broken/referring-page facts, then supported saved growth and new/lost charts. One Backlinks / Referring domains / Top linked pages control and compact target picker own the table. Distinguish organic Top pages from Top linked pages. Citation matches remain secondary. |

Group counts and round estimated traffic sensibly; no floating-point tails.
Scores, percentages and CPC have explicit metric precision. Acquisition USD
keeps sufficient fractional precision with exact details available. Null is
unavailable, not zero. Preserve numeric alignment/tabular numerals, readable
URL truncation and access to full safe URLs in links/evidence.

Charts use saved dates/values, semantic colours, labelled units, written
descriptions and gaps for missing observations. State history's own coverage
when it differs from the live summary. Do not fabricate a trend from one point
or turn every supporting metric into an equal-weight card.

First use has one actionable state. Measured empty, not fetched, filtered empty,
unavailable and failed are distinct. Retain compatible saved data during reads
and refresh failure. Read Retry is free; paid recovery returns to review. Clear
protected data on lost access; never show another project's placeholder rows.
Verify desktop/compact layouts, long URLs, keyboard interactions, labelled
controls, focus restoration, non-colour cues, reduced motion and forced colours.

## 8. Workflow boundaries

Content handoff uses authorized immutable row IDs with exact dataset/call
references. Instructions start empty; preview/navigation never generates,
publishes or invokes a model. Extend evidence types through the current owner.

Citation matches remain explicit local derivations against selected persisted
Visibility evidence, with exact source selection and idempotency. Coverage is
the collected referring-domain snapshot, not proof that a backlink caused a
citation. Missing eligible citations are unavailable, not zero. Never mutate
Visibility scores, Sources totals, Opportunities or competitor discovery.

**Deferred:** prompt generation/activation, arbitrary-domain exploration,
independent child-site targets, schedules, clickstream, recursive seed expansion,
outreach, new MCP/Growth Agent tools and autonomous publishing. Do not scaffold
disabled placeholders. Later keyword-to-prompt work requires separate research,
editable review and explicit activation under the existing Prompts owner.

## 9. Ordered implementation slices

Each slice leaves the existing owner runnable. Do not rebuild merged foundations.

1. **Validated defects:** minimally fix B1–B4 and their focused behavioral
   coverage, including the selector's competitor fallback.
2. **Scope and market:** typed scope, review/defaults, scope-specific requests
   and domain comparisons, identity/reuse, labels and legacy exact-host reads.
3. **Richer existing data:** normalization, persistence/API and corresponding
   table/summary UI together; definitions, precision and optional explicit
   projection from saved responses with immutable provenance.
4. **Missing datasets:** organic pages, individual backlinks and bounded history
   through config, quote, worker, projection and UI; realistic endpoint fixtures
   and truthful scope limits.
5. **Browsing and UI completion:** dataset-wide filters, reviewed acquisition
   order/grouping, safe export, contextual actions, comparison navigation and
   final chart/table/responsive behavior.
6. **Acceptance and cutover:** remove superseded selectors, mappings and
   contracts; update shipped owner docs. One authority per scope/metric, with
   no parallel old/new route implementations.

## 10. Validation and completion

Start with existing tests:

- `backend/tests/unit/test_search_intelligence.py`
- `backend/tests/component/test_search_intelligence_api.py`
- `backend/tests/component/test_search_intelligence_results.py`
- affected shared capacity and terminal-compensation component tests
- `frontend/components/search-intelligence/*.test.tsx`
- `frontend/lib/config/search-intelligence.test.ts`
- `frontend/e2e/search-intelligence.spec.ts`

Add coverage for credible decisions and boundaries:

- B1 ports, B2 roster edits during resolution, B3 absent-kind selection without
  competitor substitution, B4 cost states.
- Exact/broad apex/www/child coverage, no domain-suffix false matches, market
  inheritance, comparison direction and ordered-target provenance.
- Realistic sanitized endpoint responses: summary without rows, empty versus
  missing, nested metrics/nulls, CPC, distinct ranks/referring-domain counts,
  history gaps and per-operation scope checks.
- New endpoint price/charging units, finite pagination/exhaustion, reuse
  identity, changed quotes and no unreviewed dispatch.
- Persisted fields through API to visible tables; filters spanning saved pages,
  deterministic cursors and safe complete saved-result exports.
- Workspace isolation/provenance on new persistence/read paths; immutable
  reprocessing if added. Use real PostgreSQL for concurrency, leases and races.
- No provider/model calls or enqueue on GET, navigation, filters/sort, export,
  preferences, prefetch or read Retry; uncertain dispatch is not resent.
- All four tabs with saved, empty, partial, failed and unavailable fixtures at
  desktop/compact sizes. Screenshot totals are not fixture acceptance targets.

Tests disable dotenv and use no real provider keys. Run focused suites
sequentially, redirect output beneath the worktree's Git directory and inspect
failure tails. Run `./scripts/check.ps1` once after executable changes are
complete; CI owns full release/Compose validation. Do not weaken Sonar or other
gates. Documentation-only planning needs no executable checks.

Done means the scope and new datasets work end to end, useful returned fields
are visible, absence states are truthful, section 7's UI is implemented, B1–B4
are covered, and acquisition remains reviewed while browsing is provider-free.
Paid acceptance and database resets require separate explicit authorization;
this plan grants neither. Record routine results in the PR, not sidecars.

## Reference basis

Open SEO source inspected at `0ffff93101043aad7600a3b6a499a0cd2887ef49`:

- [Scope filters](https://github.com/every-app/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/lib/dataforseo/researchScopeFilters.ts)
- [Backlink endpoints/schemas](https://github.com/every-app/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/lib/dataforseo/backlinks.ts)
- [Backlink projections](https://github.com/every-app/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/features/backlinks/services/backlinksRowMappers.ts)
- [Keyword acquisition](https://github.com/every-app/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/features/domain/services/domainKeywordsPage.ts)

Their cache-miss provider requests explain richer browsing; do not copy that
payment behavior into CiteLadder reads. Official docs remain API authority:

- [Domain overview](https://docs.dataforseo.com/v3/dataforseo_labs-google-domain_rank_overview-live/), [exact-host lookup](https://docs.dataforseo.com/v3/dataforseo_labs-google-subdomains-live/), [ranked keywords](https://docs.dataforseo.com/v3/dataforseo_labs-google-ranked_keywords-live/)
- [Domain comparisons](https://docs.dataforseo.com/v3/dataforseo_labs-google-domain_intersection-live/), [page comparisons](https://docs.dataforseo.com/v3/dataforseo_labs-google-page_intersection-live/), [organic pages](https://docs.dataforseo.com/v3/dataforseo_labs-google-relevant_pages-live/)
- [Summary](https://docs.dataforseo.com/v3/backlinks-summary-live/), [individual backlinks](https://docs.dataforseo.com/v3/backlinks-backlinks-live/), [referring domains](https://docs.dataforseo.com/v3/backlinks-referring_domains-live/), [linked pages](https://docs.dataforseo.com/v3/backlinks-domain_pages_summary-live/), [history](https://docs.dataforseo.com/v3/backlinks-history-live/)
- [Labs pricing](https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api), [Backlinks pricing](https://dataforseo.com/pricing/backlinks/backlinks)

Source/documentation inspection establishes direction, not authenticated provider
acceptance or a promise of identical totals.
