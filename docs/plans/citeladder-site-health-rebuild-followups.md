# Site Health: honest scores, actionable findings

> **Status:** Implementation notes from 12 September 2026, reviewed on 13 September.
> Current behavior is owned by [Site Health](../site-health.md); the PR and CI
> record the final validation. Follows
> [the Site Health rebuild](citeladder-site-health-rebuild.md) (#70).

The prior implementation session reported evidence from three local crawls —
hiutdenim.co.uk (200 pages), lanhtropy.com (187), citeladder.com (18).

## The acceptance criterion

Site Health exists to surface **high-value suggestions a reader can act on**,
each with a route to a fix. Two consequences drive everything below:

1. **"Not measured" and "Limited evidence" are failure states of ours**, not
   findings about the customer's site. A score of 100 is a better answer than
   a withheld one: it is at least a claim the reader can check. Withhold a
   number only when genuinely nothing was observed.
2. **Every issue names its next action.** A catalogue of two hundred failures
   with no route to a fix is a list of complaints.

## What was wrong

### One formula, written twice, drifted

`scoring.py` excluded `not_applicable` before counting; the crawl aggregator in
`measurement_aggregation.py` counted it as unresolved and nulled the page. Every
hiutdenim page carried `technical.canonical_integrity = not_applicable`
(`no_canonical`), so:

```
site_page_analyses:      200 pages, web_fundamentals_score = 88.89 each
site_crawls.score_summary:  web_fundamentals_state = not_measured, score = null
```

The same bug nulled AEO for all 148 scoreable pages. There was **no unit test
for the aggregator at all**, which is how the duplicate survived.

### The score was blind to the Issues tab

`WEB_CHECK_IDS` held ten ids. Meanwhile, on that same crawl, **every** page
failed `technical.canonical_present`, `aeo.open_graph_present` and
`web.accessibility_heading_order`, 166 failed `aeo.structured_data_present`, and
94 had no meta description — none of which were score members. The site scored
88.9 "Web Fundamentals" while the Issues tab listed all of it. A score that
cannot move when the site is broken is not a score.

### A quarter of every crawl was unscoreable by construction

`SUPPORTED_AEO_CHECKS_BY_PAGE_KIND` gated AEO membership by page kind, so
homepage, guide, service, trust_policy and every unresolved `other` page
returned null however much readiness evidence they had produced — 52 of 200
pages on one crawl.

### Overview returned 500 for every completed crawl

The persisted pillar payload omitted `label` and `description`, which
`OverviewDimensionResponse` requires:

```
aeo_dimensions.3.label   Field required
```

### Every "Improve in Content" button 404'd

The catalog flagged 13 AEO rules `content_addressable`; the hand-off endpoint
accepted only `technical.title_present` and `technical.meta_description_present`.
Disjoint sets — and the two the endpoint would serve carry no AEO pillar, so
they never appeared in the panel that renders the button. The hand-off also
demanded a `source_analysis_id` that terminalization had already superseded.

### Editorial indexes were audited as shop categories

`/blog` and `/compare` classified as `category` from "this route is a hub" plus
"it links to several things" — evidence every index page satisfies — outranking
the route segment that names the purpose. `citeladder.com/blog` was reported as
a failing category page, audited for listing answer sets and product item facts.

## What changed

| Area | Change |
|---|---|
| `site_health_measurement.py` | `WEB_CHECK_IDS` 10 → 16 page-scope checks; `AEO_CHECK_PILLAR` 16 → 21, covering all seven pillars; `SUPPORTED_AEO_CHECKS_BY_PAGE_KIND` deleted; `CONTENT_ADDRESSABLE_CHECK_FIELDS` added as the one hand-off authority |
| `scoring.py` | Non-determinate outcomes leave the denominator instead of nulling the result; pillar weights renormalize over what applied; duplicate-check conflict resolution moved here and shared |
| `measurement_aggregation.py` | Duplicate formula deleted; calls `scoring` for every page result |
| `site_health_rule_types.py` | `content_addressable` derived from config, not hand-set per rule |
| `service/aeo_readiness.py` | Config-driven allowlist; unsupported ids dropped rather than failing the request; `source_analysis_id` optional and server-resolved |
| `page_kinds.py` | Collection-hub upgrade removed; archive and comparison routes decided by the route tier |
| `status.ts`, readiness/overview panels | `formatScore` rounds to whole numbers; both raw `{score}` renders now go through it |
| `architecture-panel.tsx` | Orphan pages behind a count that opens a drawer, not an inline list |
| `remediation.ts` (new) | Reads server-owned `content` / `agent` / `code` routing |
| `issue-detail-rail.tsx` | Every issue offers a fix prompt; supported metadata gaps also link to Content |
| `aeo-readiness-panel.tsx` | Pillar badge reads the score band; "Passing" requires a complete set |

## Result

Re-scored against the three persisted crawls, validated through the exact
Pydantic model that was returning 500:

```
hiut        pages=200  WEB= 75.3 (measured)  AEO= 50.8 (measured)  unscored pillars: none
citeladder  pages= 18  WEB= 95.1 (measured)  AEO= 96.7 (measured)  unscored pillars: none
lanhtropy   pages=187  WEB= 89.3 (measured)  AEO= 94.7 (measured)  unscored pillars: none
```

Every page scored, every pillar scored, machine-readability included (it was
`not_measured / 0%` on all three). hiutdenim's 75/51 is the shape wanted: a real
catalogue with no canonicals, no Open Graph, no structured data and half its
meta descriptions missing should not read 88.9 and "Not measured".

## Existing snapshots

Snapshots are immutable, so a crawl that terminalized before this change keeps
pillar rows with no `label`, `description` or `unresolved_count` — and the
response model requires them, so the Overview answered 500 for every such crawl
until it was re-crawled. **No backfill or re-analysis is performed.** A snapshot
is evidence, not a migration target; rewriting frozen rows would make the record
disagree with the analyzer version that produced it.

The read path fills the presentation fields instead, from the config that owns
them, exactly as `_top_issues` already does for older rollups
(`service/overview.py::_aeo_dimensions`). The MEASUREMENT is never recomputed on
the way out: a legacy null score stays null and reads as "Not measured" until a
new crawl produces one. Verified against the real hiutdenim snapshot — all seven
legacy pillars now validate — and pinned by
`tests/unit/test_site_health_overview_projection.py`.

So an existing crawl's Overview loads immediately; its *scores* change only on
the next crawl.

## Validation

The interrupted session reported passing local suites and static checks.
Those results predate the final review fixes; the shipping PR and CI are the
validation record for the final diff.

New coverage:

- `test_site_health_measurement_aggregation.py` — page/crawl formula agreement
  and the crawl pillar payload's page-count semantics for `earned_points`,
  `determinate_points` and `determinate_checkpoint_ids`, which differ from the
  per-page `DimensionMeasurement` meaning of the same field names.
- `test_site_health_overview_projection.py` — legacy snapshots render.
- Reason coverage for the three distinct no-score causes (`unresolved_checks`,
  `page_purpose_unresolved`, `no_applicable_checks`), which were previously
  conflated: a page whose every readiness check returned `unknown` reported
  "nothing applies here".

## Follow-up shipped: evidence and completeness sub-lines

**Evidence is now the notation of the fix.** `lib/site-health/issue-evidence.ts`
formats by `rule_id`, so a failing check names the thing that was absent in the
spelling the reader will type — `JSON-LD, Microdata`, `og:title`,
`Product.offers.priceCurrency`, `input[name="q"]`, `h1 → h4 ×3` — with no
"Observed evidence" heading and no restatement of the title. Three defects it
fixes: sentences that only repeated the title; the persisted control `ordinal`
("#16" names a position in a list the reader cannot see); and `pairwise`
heading skips rendered as three identical lines rather than one tally. The
unknown-rule fallback now refuses to print identifiers, which previously leaked
five UUIDs into `architecture.duplicate_metadata_in_page_kind`. Verified against
all 22 failing rules on the persisted hiutdenim crawl.

**Completeness sub-lines say nothing when the measurement is complete.**
`measurementCaveat` replaced "100% complete · Complete checklist" (two spellings
of the ordinary case, under every score) with silence, and the partial case with
one line that carries the figure: "Partial audit · 60% coverage". The denominator
depends on the surface: checks, weighted pillars or scored pages. Printing
a completeness note under every number is what stopped the partial ones standing
out.

**The Overview no longer reports a running crawl as a failure.** The snapshot is
written at terminalization, so `GET .../site-health/overview` answers 404 before
then — by design. Hovering the Overview tab warmed that exact query key
regardless of the crawl's state, and `isError` is sticky, so the 404 it cached
showed "Could not load the persisted Site Health Overview." over a healthy run
until something reset the cache. The tab prefetch is now gated on a terminal
crawl, and the panel reports only a failure the query is actually making now —
never the expected absence.

## Known remaining duplication

`frontend/lib/site-health/remediation.ts` still mirrors nothing — it reads the
server's `remediation_route` — but only the GROUPED issue row carries that
field. A per-page surface that wants the same next action still has no route on
the occurrence. Adding it, and the page-level Content hand-off it enables, is
its own change.

## Not done

**The project-switcher staleness has no confirmed root cause.** Two real defects
in that area were found and fixed — the Site Health entitlement query keyed off
a non-reactive module global (`getActiveWorkspaceId()` read during render, so a
workspace switch never re-rendered it), and a project switch from
`/site/crawls/<id>/…` or `/runs/<id>` carried the outgoing project's resource
id into the new project. Neither is proven to be the reported symptom. Static
analysis of the selection algebra, the query keys, `placeholderData` retention
and the cache defaults found nothing else, and the bug needs a browser repro:
which screen, and whether the network tab shows a 404/403 or a request that
never fires.

**Cold-load navigation is gated behind a shell waterfall.** `get_page_detail`
measures 23–35 ms warm against the real 200-page crawl, so the wait a reader
sees opening a page detail by URL is not the query. `OnboardingGate` holds every
project-required route until the selection AND the entitlement settle, and
crawl-scoped reads take their workspace from the module-global header set in an
effect — so `me` → `projects/{id}` → entitlement must all land before the page's
own request can start. Removing that waterfall means threading the workspace
explicitly into those reads; it is cross-cutting and belongs in its own change.
