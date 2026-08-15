# W2 Site Health live evaluation — 2026-08-15

This artifact records the bounded W2 Site Health gate against live public
responses. It contains no credentials, response bodies, account identifiers,
or internal workspace/project/crawl IDs. The evidence database was a fresh,
disposable PostgreSQL database migrated from the current `0001_initial`
baseline. Each site used the same 150-URL audited allowance. Measurements are
persisted attempt, analysis, issue, task, and snapshot rows—not log estimates.

## Before / after

`GET / URL` is persisted HTTP `GET` attempts divided by distinct requested
URLs. Finding counts are shown as `defect / advisory`; occurrences remain the
append-only per-page evidence. Affected URLs use the same class ordering.

| Site | Terminal result | Wall time before → after | GET / URL before → after | Issue types before → after | Occurrences before → after | Affected URLs before → after | Opportunities before → after |
|---|---|---:|---:|---:|---:|---:|---:|
| cube27 | completed, 22/22 analyzed | 28.0s → 24.3s | 2.5× → 1.82× (40/22) | 16 → 15 / 2 | 94 → 77 / 15 | 22 → 22 / 10 | 254 → 22 |
| flipkart | partially completed without cancellation; one root discovery HTTP 4xx was persisted and surfaced, while one usable root analysis completed | 416s cancelled → 92.4s terminal | 3.6× → 2.00× (2/1) | 22 → 5 / 2 | 766 → 5 / 2 | 114 → 1 / 1 | 0 → 1 |
| best&less | cancelled after all 150 analyses completed, specifically to exercise usable cancellation evidence | ~194s → 107.1s | 2.0× → 1.00× (150/150) | 14 → 13 / 2 | 526 → 486 / 79 | 150 → 150 / 74 | 65 → 30 |

The current Flipkart response blocks broad discovery, so its finding volume is
not comparable with the older 114-page baseline. That is represented as
partial coverage rather than a fabricated full-site result: one HTTP 4xx
discovery failure, one analyzed URL, one failed URL, `analysis_ratio = 1.0` for
the one selected URL, and the limitation “Site Health evidence is partial
(partially_completed); only completed analyses are included.” The crawl
terminalized without operator cancellation or an apparent stall.

The reduced Opportunity counts are intentional consequences of using only
defect evidence and one Opportunity refresh per terminal crawl; advisory title
and meta-description length preferences cannot create Opportunities.

## Correctness evidence

- Encoded tracking-query identities: zero erroneous `%3Fintpromo%3D` variants
  across all three projects. The run persisted 34 boundary rewrites with
  reason `encoded_tracking_query_delimiter` and version `sh-link-rewrite-1`.
- Legitimate reserved path content: eight best&less identities containing
  preserved `%3F`, `%26`, `%2F`, or `%25` content remained distinct. The
  deterministic negative fixtures additionally cover each reserved escape.
- Extract once: Cube27 required 40 GETs for 22 distinct requested URLs and
  best&less required exactly 150 for 150; current-version discovery artifacts
  were reused by analysis without a second attempt. Deterministic concurrent
  and fallback fixtures prove the race and analyze-only boundaries.
- Honest progress: Flipkart recorded the root discovery as `failed/http_4xx`
  and terminalized `partially_completed`; no cancellation was used. The API
  fixtures cover robots denial, 4xx, 5xx, timeout, host-gate wait, retry wait,
  and expired-lease stall independently.
- Exactly-once terminal DAG: the completed Cube27 crawl, partial Flipkart
  crawl, and cancelled-after-analysis best&less crawl each persisted exactly
  one `opportunity_verification` and one `opportunity_refresh` task. Their
  Opportunity snapshots respectively record completed, partial, and cancelled
  coverage. A cancelled-without-analysis fixture enqueues neither successor.
- Cancellation coverage: best&less froze 150 selected, 150 analyzed, zero
  failed, ratio `1.0`, status `cancelled`, and the limitation that only
  completed evidence is included; its one refresh produced 30 Opportunities.
- Finding semantics: title and meta-description length rules account for the
  two advisory types. Across these crawls, zero intentional exclusions emitted
  a critical indexability defect. Three best&less indexability defects had
  reproducible canonical evidence for intended indexing. Deterministic
  precedence fixtures prove explicit policy over canonical, canonical over
  sitemap, sitemap over robots, intended exclusion as not-applicable, and
  unknown intent as low-severity advisory/uncertain.

## Execution notes

The first three crawls were deliberately started together as an exploratory
load pass; their wall times were not used for the comparison. The recorded
Cube27 and best&less rows are clean sequential recrawls. A transient live-site
blocking interval caused two additional best&less attempts to terminalize with
explicit 4xx evidence; after the public site recovered, the recorded sequential
run analyzed all 150 URLs and met the wall-time/request gate. All attempts were
left append-only in the disposable evidence database.
