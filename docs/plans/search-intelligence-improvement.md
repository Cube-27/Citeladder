# Search Intelligence improvement plan

**Status:** PR 1 (phases 1 and 2) implemented 2026-10-09; PR 2 is designed and
waits on the owner decisions below.

Feature 7 of the [feature review tracker](feature-review-tracker.md): the
DataForSEO Search Intelligence module (reviewed paid acquisition of keyword,
competitor and backlink datasets, the `/search-intelligence` screen and its
Agent/MCP reads). Shipped behaviour is owned by
[Connected data](../integrations-traffic-analytics.md#search-intelligence-acquisition),
not by this plan. Constraints: [invariants](../invariants.md), especially
commit-before-network-I/O, distinct unknown / empty / zero states, and the single
migration baseline (no schema change here).

## Scope correction

The tracker row was titled "Search intelligence signals" after an older plan
(internal authority, content-change fingerprints, query relevance, anchor
diagnostics, content differentiation). That plan shipped in #115 and was carried
into TypeScript under Site Health, Demand and Source pages; topical-coherence
clustering was retired on purpose in #196. Its promotion rules are the
"site change" paragraph of [Opportunities](../opportunities.md). This review
therefore covers the DataForSEO module the row's code column names.
`components/intelligence` is the Dashboard's top-insights owner, not this
feature, and moves to feature 15.

## Why

A read-only audit of the acquisition owner, its worker and maintenance, the
reads, the screen and the tests (2026-10-09) found:

- A paid response that fails to publish the same way every time is retried
  until the task dies, then retried by maintenance every tick, so the run stays
  active forever and blocks every later acquisition in the project. Likely
  triggers are provider values that do not fit their columns (a provider total
  above the 32-bit integer range, a joined intent list over 32 characters).
- The reviewed estimate is called the maximum cost, but spend is compared with
  it only after a paid response, so a run can pass it by one call.
- A local failure before any network I/O (endpoint not allowed, credential that
  will not decrypt) is recorded as a dispatched call, and can become
  "uncertain": possible spend that never happened.
- Cancelling an `uncertain` run rewrites it as `cancelled`.
- An invalid credential fails one dataset and the run keeps dispatching every
  remaining call with it.
- Opening the review drawer during an acquisition makes the unconfirmed draft
  the screen's "latest run", which stops progress polling; drafts also fill the
  run history.
- A citation match over a partial or truncated parent reports a definite
  "empty".
- An audit-maintenance failure skips acquisition recovery for that tick.
- The screen has dead ends (empty states with no action), no cancel control,
  a review drawer that preselects nine datasets per competitor with unlabelled
  controls and internal jargon, raw JSON and record IDs in front of users,
  "not fetched" and "not measured" confused, two precisions for one estimate,
  and a citation matcher with no loading, empty or success state.
- No dataset ever becomes a tracked Action.

File references are to `frontend/services/api/src/` or `frontend/` as noted.

## Decisions (owner, 2026-10-09)

1. **UX addition: both, in two PRs.** PR 1 ships a guided, cheaper first run and
   readable results; PR 2 turns keyword gaps into Actions.
2. **Run size: a hard ceiling now, per-plan limits later.** A call that could
   take spend past the confirmed estimate is never sent. `max_depth` stays a
   configuration value, unchanged. Per-workspace limits for exhaustive
   enterprise research belong to plan entitlements and go to the backlog under
   feature 11.

## PR 1, phase 1: acquisition runtime

| # | Finding | Change | Where |
|---|---|---|---|
| 1.1 | A receipt that cannot be published blocks the project forever. | An unpublishable receipt fails its call and dataset (`normalization_failed`) in its own transaction, its reported cost still counts, and the run continues or closes. Maintenance closes the run even when a receipt fails. | `search-intelligence/acquisition-state.ts`, `executor.ts`, `maintenance.ts` |
| 1.2 | Provider values that do not fit their columns abort publication. | A provider total beyond the 32-bit column is kept in the dataset summary; a joined intent list keeps whole values within its column. Any other value the schema refuses falls to 1.1. | `search-intelligence/normalization.ts`, `acquisition-state.ts`, `views.ts` |
| 1.3 | Local failures before I/O are recorded as dispatched or uncertain. | Endpoint, credential and base-URL checks run before the dispatch commit; a failure there fails the call as not sent, with no dispatch attempt. | `search-intelligence/live.ts`, `executor.ts`, `acquisition-state.ts` |
| 1.4 | The estimate is not a ceiling. | Before dispatch, a call whose estimate would take reported spend past the confirmed estimate is not sent; the run ends `partial` with `cost_ceiling_reached`. The post-response check remains for a provider charge above its estimate. | `search-intelligence/acquisition-state.ts` |
| 1.5 | Cancel overwrites `uncertain`. | `uncertain` is a finished status for cancellation. | `search-intelligence/runs.ts` |
| 1.6 | A bad credential keeps dispatching. | `auth_failure` stops the run; completed datasets remain. | `search-intelligence/acquisition-state.ts` |
| 1.7 | A draft becomes the latest run; drafts fill history. | The latest run and run history are confirmed runs only. | `search-intelligence/reads.ts` |
| 1.8 | Citation "empty" from partial evidence. | An unmatched derivation inherits `partial` from a partial or truncated parent. | `search-intelligence/citations.ts` |
| 1.9 | Recovery depends on audit maintenance succeeding. | Acquisition recovery runs in its own guarded step. | `workers/runner.ts` |
| 1.10 | Unused route. | `POST /content-handoff` has no caller (the Agent resolves handoffs server-side); retired. | `routes/search-intelligence.ts` |

## PR 1, phase 2: guided first run and readable results (UX addition)

| # | Change | Where |
|---|---|---|
| 2.1 | Every empty state carries its next step: set the project URL, connect DataForSEO, review the first analysis. A saved-data screen whose credential is gone says so and links to settings. | `components/search-intelligence/search-intelligence-page.tsx`, `-overview.tsx` |
| 2.2 | The review starts from a small preset: your footprint and ranking keywords, plus missing and shared keywords for the first competitor. Other datasets and competitors stay one tick away. Advanced controls (scope, grouping, order, minimum volume, language, depths) sit behind a disclosure with visible labels; depth inputs can be cleared while typing; copy drops internal terms and raw request JSON. | `-review-drawer.tsx` |
| 2.3 | An active acquisition can be cancelled from the screen, and the run notice keeps polling while a draft review is open. | `-page.tsx` |
| 2.4 | Readable evidence: no record IDs, dates as dates, Yes/No for booleans, nested provider data summarised instead of dumped. | `-overview.tsx`, `-dataset-view.tsx`, `-rows-table.tsx` |
| 2.5 | Missing values: "Not fetched" (no dataset) and the shared missing mark for a value the provider did not report are distinct everywhere, including backlink metrics; one money formatter for estimates and costs. | `-format.ts`, `-competitors.tsx`, `-collection.tsx`, `-overview.tsx` |
| 2.6 | The citation matcher shows loading, no-audits and success states, and lists every completed audit instead of silently stopping at 20. | `-citation-matcher.tsx` |
| 2.7 | History shows a loading state instead of "needs two observations" while it loads. | `-history.tsx` |
| 2.8 | One typed dataset-kind vocabulary replaces the scattered string lists. | `lib/config/search-intelligence.ts` and callers |

## PR 2: keyword gaps become Actions

A new Opportunity hit source, owned by Opportunities, reads Search Intelligence
datasets; Search Intelligence gains no write into Opportunities beyond enqueuing
a refresh when a keyword dataset publishes. No schema change.

- **Source.** Per saved competitor, the latest published `missing_keywords`
  dataset for the current owned website and market, within a maximum age.
  `failed` or `unknown` coverage never qualifies; `empty` supersedes older gaps;
  `partial` or truncated data adds a limitation.
- **Row gates** (unknown abstains and is counted, never treated as zero): a
  minimum search volume, a competitor rank threshold, no navigational intent, not
  branded for the project, not naming a competitor, and not contradicted by an
  owned ranking or shared-keyword row in the same market.
- **Dedup with Demand.** A keyword already active as a Demand query signal, or
  with Search Console impressions in the Demand window, is dropped. Without
  Search Console the gap still promotes with that limitation.
- **Target.** One crawled page whose title and H1 cover every term is the
  target; none or several gives a planned page (shared slug with Agent-created
  planned pages, so they converge). Gaps merge across competitors and collapse
  identical term sets, sorted and capped per refresh.
- **Measurement.** A `keyword_presence` check, not a clicks check: met by
  Search Console impressions after go-live or an owned ranking in a later
  Search Intelligence dataset whose provider SERP postdates go-live; a still
  missing keyword is `waiting`; no later data is unknown. The next dataset is a
  paid, user-started run, so that measurement leg is `not_scheduled`.
- **UI.** The Action's evidence shows volume, each competitor's rank and URL,
  the dataset date and "DataForSEO estimate"; missing-keyword rows that became
  an Action link to it.
- **Versions.** Rule, grouping, diagnosis and verifier versions bump.

Owner decisions for PR 2 are listed in the tracker log once answered.

## Deferred to the backlog

Per-workspace acquisition limits, bounded readiness and paging indexes, and raw
response retention are in the [backlog](backlog.md#search-intelligence-remainder)
with their reasons.

## Tests and documents

Tests are added for credible regressions:

- maintenance closes a run whose receipt cannot be published;
- an out-of-range provider total publishes;
- a pre-I/O failure records no dispatch and no uncertainty;
- the ceiling stops before a call that would exceed it;
- cancelling an uncertain run keeps it uncertain;
- an auth failure stops remaining calls;
- the latest run ignores a draft;
- a partial parent yields a partial citation match;
- the screen's empty states, cancel, preset and readable evidence.

Tests that restate pricing constants are rewritten to derive from
configuration. The Connected data section is rewritten from shipped behaviour,
and the tracker row is renamed.
