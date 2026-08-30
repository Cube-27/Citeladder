# Site Health measurement reliability — PR4

> **Status:** approved follow-up plan; implementation not started.
>
> **Dependency:** begin only after PR3 in
> [`site-health-measurement-cutover.md`](site-health-measurement-cutover.md)
> merges and its repository gates, disposable-database bootstrap, and visual
> acceptance complete.
>
> **Delivery shape:** one atomic PR with four dependency-ordered internal slices.
> The slices are implementation checkpoints, not independently shippable
> contracts or partially enabled runtime modes.

[`../site-health.md`](../site-health.md) remains the authority for shipped Site
Health behavior. This plan owns the approved post-PR3 reliability cutover. When
PR4 ships, update that runtime authority atomically and remove superseded
classifier, rule, scoring, projection, UI, test, and documentation paths.

The repository-wide rules in [`../../AGENTS.md`](../../AGENTS.md) and
[`../invariants.md`](../invariants.md) apply. Backend ownership remains the
single page-understanding seam described in
[`../backend-architecture.md`](../backend-architecture.md); frontend work follows
[`../frontend-architecture.md`](../frontend-architecture.md) and
[`../design.md`](../design.md).

## Decision

PR3 establishes the seven-dimension measurement and presentation contract. PR4
does not replace that contract with Topical Authority, Information Gain, or a
new Site Health model. It repairs the trust defects exposed by live post-PR3
crawls:

1. page-kind evidence can produce false listings and excessive abstention;
2. overloaded or page-wide facts can evaluate the wrong content;
3. rule count can manufacture capability influence;
4. AEO measurement coverage does not disclose unresolved page purpose; and
5. `other` pages can display a page-purpose AEO scalar despite classification
   abstention.

The seven dimensions remain **Answerability**, **Structure**, **Evidence**,
**Machine readability**, **Provenance & trust signals**, **Freshness**, and
**Crawlability**. Scores are never tuned toward a preferred brand or
distribution. A lower calibrated score is acceptable when its evidence and
coverage are more truthful.

## Grounded baseline

The 2026-08-30 read-only audit examined the current implementation, immutable
normalized facts, rule evaluations, snapshots, and two completed development
crawls.

| Site | Analyzed | Crawl coverage | Web Fundamentals | AEO Readiness |
|---|---:|---|---:|---:|
| Searchable | 183 | partial | 95.8 at 92.5% coverage | 88.9 at 99.1% coverage |
| Flourist | 200 | partial | 92.8 at 92.1% coverage | 78.9 at 96.7% coverage |

The persisted Searchable dimension results reproduce the stored 88.9 score
under the shipped formula. The arithmetic is not the primary defect.

Searchable exposed the reliability failures:

- 81 of 183 analyzed pages (44.3%) were `other`, so only 102 pages (55.7%)
  received a purpose-specific profile while AEO measurement coverage reported
  99.1%;
- `docs.searchable.com` contained 37 `other`, two `category`, and one `docs`
  page;
- the exact `/blog` archive was `article`;
- all 11 `category` assignments were inconsistent with the observed page
  purpose: six article details, two documentation pages, two feature pages, and
  one solutions page;
- 40 of 55 classified articles failed `aeo.editorial_lead_present`, frequently
  because the extracted lead was author metadata;
- AEO heading evidence mixed page-owned headings with navigation, footer, and
  repeated-module headings;
- all 79 editorial-kind observations satisfied `aeo.outbound_citations`
  because any non-social external domain counted as support; and
- 81 `other` pages reported AEO 99.6 at 100% measurement coverage even though
  the UI described their AEO score as not measured.

These are calibration observations, not target score distributions.

## Scope lock

PR4 includes only the reliability cutover required to correct those findings:

- classifier evidence locality and bounded recall improvements;
- page-purpose fact separation;
- explicit checkpoint semantic accounting;
- fixed-budget AEO capability families;
- classification coverage in persisted crawl projections;
- non-scoring `other` page-purpose AEO results;
- synchronized persisted APIs and Site Health presentation; and
- direction-neutral calibration and regression evidence.

PR4 does **not**:

- add a second page-family concept, page-analysis owner, crawler, evidence
  store, rule store, score store, or read-time derivation;
- add a model classifier or let structured data self-certify page kind;
- implement every currently unavailable kind × dimension evaluator;
- infer claim support with an LLM or lexical claim detector;
- redesign Web Fundamentals or field Core Web Vitals;
- change Search eligibility critical checkpoints;
- add Topical Authority, Information Gain, or a replacement top-level Site
  Health score;
- retune the seven dimension weights to raise or lower observed scores;
- preserve pre-PR4 development history, add a `0002+` migration, increment an
  active semantic version above `1`, backfill, or retain compatibility scoring;
  or
- ship an internal slice independently.

## Shared contracts

### One page-understanding seam

`analysis/site_health/page_analysis.py` remains the external seam. Its
implementation may gain cohesive internal fact and scoring modules, but callers
continue to provide immutable normalized facts plus crawl context and receive
one page understanding with classification, traits, evaluations, and scores.
Workers do not reconstruct policy.

### Evidence before outcome

```text
immutable artifact
  -> bounded page-owned facts
  -> deterministic page_kind + independent traits
  -> frozen kind × trait × dimension profile
  -> checkpoint outcomes
  -> scope-normalized capability families
  -> dimensions and overall AEO Readiness
  -> persisted page/crawl/snapshot projections
```

Context decides expectation; evidence decides outcome. Missing evidence never
turns itself into N/A. Structured data can corroborate classification and can be
validated after classification, but it cannot alone choose the type whose
schema contract is scored.

### Complete semantic accounting, not manufactured determinacy

Every fixed-taxonomy `page_kind` × readiness dimension cell declares exactly
one disposition in the config-owned profile owner:

- `applicable` with one or more deterministic checkpoint expressions;
- `applicable` with an explicit bounded measurement-gap reason; or
- `not_applicable` with a semantic irrelevance reason.

`other` is unresolved purpose, not semantic irrelevance. Its page-purpose AEO
result is `not_measured` with reason `page_purpose_unresolved`; it does not
receive seven N/A dimensions or a generic `WebPage` verdict.

There is no determinacy percentage gate. PR4 requires **100% semantic-accounting
coverage**: every matrix cell has a declared disposition. Actual determinate,
unknown, unavailable, conflicting, error, N/A, and excluded counts remain
calibration outputs.

### Classification coverage

Classification coverage is a crawl/snapshot projection, not a second fact on
`SitePageAnalysis`:

```text
classification_expected_page_count =
    current completed analyses for selected, non-excluded HTML pages

classified_page_count =
    classification_expected pages whose page_kind != other

other_page_count =
    classification_expected pages whose page_kind == other

classification_coverage =
    null when classification_expected_page_count == 0
    else classified_page_count / classification_expected_page_count
```

A JS shell is an analyzed HTML page whose purpose could not be established, so
it remains in the classification denominator and carries the rendering
limitation. Failed acquisition and supported non-HTML inventory remain outside
this denominator and are represented by Search eligibility and crawl coverage.

The immutable terminal snapshot freezes the three counts, ratio, bounded reason
groups from `page_kind_evidence`, and exact source-analysis IDs. The active
`SiteCrawl.score_summary` mirrors the same aggregation owner. Reads never derive
or repair the projection.

### Fixed-budget AEO capability families

Rule count must not create score influence. Each readiness-scored checkpoint
belongs to exactly one family and dimension; catalog assembly rejects missing
families, cross-dimension family membership, non-positive family budgets, and
diagnostic score roles.

For page-scoped evidence, aggregate in this order:

```text
observations
  -> checkpoint result per page
  -> family result per page kind
  -> fixed page-kind macro rollup for the family
  -> dimension
  -> overall AEO Readiness
```

Site-scoped families represent one site entity. Cluster/graph families normalize
over their declared entity set. Repeated pages or copies of site evidence never
add family weight.

Within a family, config-owned internal subcheck weights determine resolution:

```text
family_score =
    null when determinate_internal_weight == 0
    else sum(internal_weight[c] * credit[c])
         / determinate_internal_weight

family_coverage =
    determinate_internal_weight / expected_internal_weight
```

The family then receives its fixed config-owned dimension budget once:

```text
dimension_score =
    sum(family_budget[f] * family_coverage[f] * family_score[f])
    / sum(family_budget[f] * family_coverage[f])

dimension_coverage =
    sum(family_budget[f] * family_coverage[f])
    / sum(family_budget[f] for expected families)
```

The existing dimension and overall weighting formulas then apply once. Adding a
fifth schema validator may improve the `structured_representation` family’s
resolution; it cannot increase that family’s dimension budget.

`satisfied=1`, `partial=0.5`, and `missing=0` remain. Unknown, unavailable,
conflicting, and error lower coverage but receive no quality credit or penalty.
N/A and excluded leave the expected set.

## Internal slice 1 — evidence and classifier reliability

### Goal

Repair known false classifications and introduce calibrated facts before any
checkpoint or scoring formula changes.

### Classifier calibration manifest

Add a test-owned labelled manifest using bounded sanitized fixtures. It records:

- source label and observation date;
- expected `page_kind` or deliberate `other`;
- expected traits;
- allowed deciding evidence tier;
- competing kinds that must be rejected; and
- the structural reason for the expected result.

Include Searchable and Flourist patterns plus healthy, broken, ambiguous,
conflicting, JS-shell, and non-HTML cases across the fixed taxonomy. Tests never
fetch public pages. No product table stores calibration labels.

Calibration reports per-kind precision, recall, and observed abstention, plus
correct abstention on deliberately ambiguous fixtures. Exact labelled fixture
outcomes are the gate; PR4 does not tune a global probability threshold.

### Collection-bound listing facts

Update the existing region/entity fact implementation so a collection signal
requires its evidence to belong to the same page-owned collection:

- bind result count, sorting, filtering, facets, pagination, and empty state to
  the candidate card/list container;
- require controls to name, target, contain, or be structurally adjacent to that
  collection under a bounded deterministic relation;
- exclude ordinary editorial phrases such as “13 products” from result-count
  evidence;
- exclude navigation, footer, aside, recommendation, and unrelated form
  controls;
- retain collection size and distinct crawlable targets as observations rather
  than independent category verdicts; and
- persist bounded evidence naming the matched container and affordance class,
  never a raw selector or unbounded DOM fragment.

A blog detail with a large related-card module, a numeric product/result phrase,
or an unrelated sort-like control must remain an article when its page-owned
article evidence is stronger.

### Page-owned editorial and heading facts

Replace the overloaded `first_answer_text` use with separate facts:

- `editorial_lead`: first substantive page-owned paragraph after identity and
  publication metadata, excluding byline, date, breadcrumb, badge, card, and CTA
  text;
- `direct_answer`: answer/definition text structurally associated with the
  relevant question or definition heading;
- `entity_proposition`: entity identity plus page-owned audience, capability, or
  outcome copy; and
- `primary_heading_outline`: ordered headings inside primary content, excluding
  chrome and repeated-card modules.

Do not silently change the document-wide Web Fundamentals heading rule in this
slice. AEO consumes `primary_heading_outline`; the separate objective
accessibility contract remains unchanged unless independently re-specified.

### Ordered classifier repair

Implement in this order:

1. remove false structural category/listing evidence;
2. recognize exact archive roots such as `/blog`, `/blogs`, and `/news` only
   when page-owned collection evidence exists;
3. add documentation host context as corroboration, never as a verdict; and
4. add a service/capability expression only after the known false-positive
   corpus is green.

Documentation context may combine a docs/developer host with independently
observed hierarchy, documentation navigation, breadcrumb/isPartOf structure,
reference/task semantics, or page-owned technical content. A documentation host
can contain hubs, details, changelogs, and other purposes; every labelled
fixture must receive its own expected kind.

Service/capability evidence remains industry-neutral: named capability or
service, provider/entity, audience or outcome, and an acquisition/next-action
path. Feature, platform, workflow, solution, and use-case route vocabulary is
route evidence only.

### Slice 1 acceptance

- Every labelled fixture produces its exact expected kind, traits, deciding
  signal, and permitted confidence label.
- Searchable’s six misclassified blog details are not categories.
- The exact Searchable blog archive is a category only because its observed
  collection corroborates the archive route.
- Searchable documentation fixtures receive their individually labelled kinds;
  host alone classifies none.
- Incidental result copy, recommendation cards, and unrelated controls cannot
  produce a listing verdict.
- Remaining `other` fixtures retain bounded `no_signals`, `schema_only`, or
  conflict evidence rather than a forced guess.
- No checkpoint, scoring formula, API field, or UI behavior changes in this
  slice.

## Internal slice 2 — checkpoint semantic repair

### Goal

Make every scored checkpoint state exactly what it measures, then account for
all kind × dimension cells without inventing weak evaluators.

### One config-owned profile manifest

Consolidate readiness expectation, dimension relevance, trait conditions, and
known measurement gaps behind one profile interface. Derive
`expected_checkpoints()` and `relevant_dimensions()` from it; do not retain
parallel maps that callers must reconcile.

Catalog/profile assembly fails when:

- a taxonomy kind or dimension has no semantic disposition;
- an applicable measured cell names no implemented checkpoint;
- an applicable unmeasured cell lacks a bounded gap reason;
- an N/A reason describes uncertainty rather than irrelevance;
- a triggered quality check has no same-family absence/root sibling; or
- a rule’s finding class, score role, family, dimension, and applicability
  contract disagree.

The complete matrix is a contract, not a requirement to implement every missing
evaluator. Examples such as `comparison × evidence` may remain applicable and
unavailable with a specific `comparison_evidence_evaluator_unavailable` reason.

### Deterministic source support

Retire the generic `aeo.outbound_citations` scored contract. A supporting source
is observed only when an external reference appears inside primary content and
at least one bounded deterministic relationship holds:

- the reference is inside a References or Sources section;
- the reference is inside a Methodology section;
- a local citation/reference marker is structurally adjacent; or
- nearby visible text explicitly attributes the named source.

All markers, section vocabularies, adjacency bounds, and evidence caps are
config-owned. A generic external link, social profile, navigation link, partner
logo, or footer link never qualifies. PR4 does not identify arbitrary factual
claims or infer whether a source proves one.

Applicability comes from independent research-sensitive context such as a
comparison, observed methodology/references section, case-study/review trait,
or explicitly time-bound report purpose. If support is semantically relevant
but attachment cannot be established, the outcome is unknown or unavailable,
not missing. If no trustworthy evaluator exists for a relevant profile cell,
the matrix declares the gap.

### Independent freshness applicability

Freshness applicability is decided before reading the date being scored. Valid
independent contexts include:

- product offer or assortment state;
- pricing/billing state;
- version-specific documentation;
- changelog/release purpose;
- news/current-event purpose;
- time-bound report; or
- explicit year/version semantics in page identity or structural context.

Date presence cannot make freshness applicable by itself, and date absence
cannot make freshness irrelevant. Once expected, persisted publication,
modification, effective, offer-validity, or version evidence determines the
outcome.

### Attribution, schema, and extractability

- Visible named creator/responsible publisher and schema/metadata attribution
  are separate atoms. Metadata-only attribution cannot earn full visible
  provenance credit; explicit deterministic partial credit is permitted.
- Associate structured-data validation with primary schema entities and their
  declared relationships. A page-wide union of types does not activate a
  purpose-specific validator.
- `BreadcrumbList`, generic `Article`, or generic `WebPage` cannot alone satisfy
  collection, comparison, case-study/review, guide, or policy representation.
- Keep schema absence a modest advisory. Present malformed or contradictory
  markup remains a defect.
- Remove `aeo.no_expand_gating` from the catalog: server-present collapsed text
  is extractable and the current signal does not prove interaction-only content.
- Keep `aeo.server_rendered_content` diagnostic and remove every score role.
  Add a separately named `primary_content_extractable` readiness capability
  only if the acquired representation supports a deterministic healthy and
  failed outcome.
- Correct `aeo.editorial_lead_present`, entity proposition, and AEO heading
  hierarchy to consume the slice-1 page-owned facts.

### Page-purpose profile depth

Implement only deterministic expressions justified by the new facts. The
profile manifest must still account for homepage, article, product, category,
pricing, docs, FAQ, about/contact traits, service, local, procedural and
non-procedural guides, comparison, case-study/review traits, trust/policy, and
`other`.

Purpose-specific requirements remain those in the canonical measurement matrix:
for example, pricing option/billing association is not replaced by generic
schema, comparison evidence is not replaced by external-link count, and docs
do not receive blanket date/source obligations without independent context.
Unimplemented expressions remain explicit gaps.

### Slice 2 acceptance

- Every kind × dimension cell has exactly one semantic disposition.
- Missing input never becomes N/A; evaluator absence never becomes N/A.
- A generic external link earns no Evidence credit.
- Freshness remains applicable when independent context expects it but the date
  is missing.
- Metadata-only authorship cannot manufacture full visible-attribution credit.
- Unrelated schema nodes cannot activate or satisfy a primary-entity contract.
- Diagnostics have no score roles, and removed proxy rule IDs have no remaining
  evaluator, issue, handoff, API, UI, fixture, or documentation caller.
- Expected profiles are frozen before outcomes and retain exact source evidence
  and version provenance.
- Scoring formulas and public projections remain unchanged until slice 3.

## Internal slice 3 — family-normalized scoring and classification coverage

### Goal

Replace rule-count influence with fixed capability budgets and make unresolved
purpose visible without suppressing valid scores for classified pages.

### Family normalization cutover

Extend the existing scoring owner; do not add a second scorer. Introduce one
config-owned family budget and internal subcheck manifest per readiness family.
Normalize page-scoped families within page kind before the existing fixed
page-kind macro rollup. Normalize site, cluster, and graph families once at
their declared scope.

The `structured_representation` family receives one fixed budget whether it has
one absence result or several present-artifact validators. Apply the same rule
to every family. Family count contributes to measurement breadth only after
normalization; subcheck count never manufactures breadth.

Web Fundamentals remains objective-defect scoring and does not consume the AEO
family formula.

### `other` and aggregate cohort

- A page with `page_kind=other` persists universal technical/diagnostic evidence
  but has `aeo_readiness_score=null`, `aeo_measurement_state=not_measured`, and
  reason `page_purpose_unresolved`.
- Page-purpose AEO family, dimension, and overall calculations consume
  classified pages only.
- Unclassified pages are not silently excluded: classification counts, ratio,
  and reason groups are frozen beside measurement and crawl coverage.
- Measurement coverage continues to describe expected evidence for the
  classified scored cohort. Classification coverage describes how much of the
  analyzable cohort received a purpose profile. Crawl coverage describes how
  much of the selected acquisition/analysis cohort was observed.
- Classification coverage does not enter the quality numerator, act as a zero,
  or reuse the AEO measurement-coverage field.

No arbitrary classification or determinacy threshold suppresses the numeric
score. The persisted measurement state and classification state remain separate;
presentation qualifies any partial-classification aggregate as readiness for
**classified audited pages**.

### Persistence and contract

Freeze classification totals, coverage, state, reason groups, formula version,
and exact source-analysis IDs on `SiteHealthSnapshot`. Mirror them in the active
`SiteCrawl.score_summary` through the same aggregation owner. Do not add a
redundant `classification_coverage` fact to `SitePageAnalysis`.

Update the existing same-origin `/api/v1` schemas atomically across backend and
frontend. Overview, Pages, page detail, page-kind summaries, AEO Readiness,
exports, and trend/change comparability consume persisted values only. If trend
or change comparison lacks the new classification projection, it is
non-comparable; no compatibility calculation survives the development reset.

### Slice 3 acceptance

- Rule duplication and subcheck additions cannot change a family’s dimension
  budget.
- Duplicated site evidence, duplicated pages, and crawl page mix cannot
  manufacture influence.
- A valid complete structured representation cannot score worse merely because
  its valid triggered validators became expected; invalid evidence may lower
  the family result.
- Missing versus unknown changes quality and coverage exactly as declared.
- `other` produces no page-purpose AEO scalar and cannot manufacture an AEO 100.
- Adding an unresolved page cannot increase classification coverage or improve
  classification state.
- Page, page-kind, crawl summary, immutable snapshot, and AEO diagnostics
  reproduce the same family, dimension, score, and coverage points.
- Search eligibility, Web Fundamentals, seven dimension weights, and the Content
  handoff interface remain stable.

## Internal slice 4 — projection, calibration, and cutover

### Goal

Make the three coverage concepts and remaining limitations comprehensible,
then prove the new contract against fixtures and live calibration crawls.

### Presentation

Overview presents distinct persisted facts:

```text
AEO Readiness                 quality for classified audited pages
AEO Measurement Coverage      determinate expected evidence for that cohort
Classification Coverage       classified / classification-expected HTML pages
Crawl Coverage                selected/discovered/analyzed evidence boundary
```

Keep the seven-dimension ledger. Do not introduce Topical Authority,
Information Gain, or a replacement headline architecture.

- `other` rows render **Not measured — page purpose unresolved** rather than a
  numeric AEO score or generic `WebPage` readiness.
- Any present score renders its measurement state and coverage together; a
  limited-evidence number is never visually unqualified.
- Overview and AEO copy says **classified audited pages** whenever
  classification is incomplete and **audited pages** whenever crawl coverage is
  not complete.
- Evidence drawers name the capability family, checkpoint, observed evidence,
  expectation, reason, and remediation without exposing internal rule IDs as
  primary copy.
- Retired rule filters and Content handoffs are removed or migrated atomically;
  no alias remains.

### Calibration output

After the implementation is complete:

1. reset the disposable database from `0001_initial.py`;
2. verify zero ORM drift;
3. rerun Searchable and Flourist under the final PR4 code;
4. run the labelled fixture corpus without network access; and
5. append one direction-neutral calibration record to this plan.

The acceptance record reports:

**Page classification**

- fixture counts by expected kind;
- per-kind precision and recall;
- abstention and correct-abstention counts;
- confusion matrix;
- deciding signal/tier distribution; and
- top abstention/conflict reasons.

**Measurement semantics**

- determinate, unknown, unavailable, conflicting, error, N/A, and excluded
  counts by kind × dimension;
- every explicit measurement-gap reason; and
- retired versus introduced checkpoint/family IDs.

**Coverage**

- crawl coverage;
- classification coverage; and
- AEO measurement coverage, each with numerator, denominator, and state.

**Score**

- Web Fundamentals;
- overall AEO Readiness;
- seven dimensions; and
- fixed-budget capability-family contributions.

**Regression**

- top reason-code changes;
- classification and score invariants;
- Search eligibility outcomes;
- issue and Content-handoff changes; and
- visible before/after screenshots of Overview, Pages, page-kind summaries, AEO
  Readiness, and one `other` page detail.

There is no required score direction or preferred distribution.

### Slice 4 acceptance

- Searchable no longer reports 99.1% measurement coverage as though it were
  99.1% classification coverage.
- Searchable `other` rows no longer expose AEO 99.6 or any page-purpose scalar.
- The prior UI contradiction between “not measured” copy and a numeric `other`
  row is absent on every affected surface.
- Both calibration crawls disclose partial crawl coverage without making
  whole-site claims.
- The calibration record contains all outputs above and names every remaining
  measurement gap; it does not convert gaps into weak heuristics.
- Browser verification exercises the actual persisted terminal surfaces.

## Atomic cutover and removal manifest

PR4 is one clean cutover. Before implementation, inventory all affected:

- normalized fact fields and extractors;
- classifier signals/config/tests;
- trait and expected-profile owners;
- rule IDs, evaluators, issues, Opportunities, and Content handoffs;
- scorer and summary/snapshot writers;
- ORM/migration columns and JSON projections;
- backend/frontend schemas and clients;
- Pages, Overview, AEO, page-kind, detail, export, trend, and change callers;
- filters, query parameters, fixtures, E2E tests, and active docs.

At cutover:

- delete replaced facts and their callers;
- delete `aeo.outbound_citations` and `aeo.no_expand_gating` rather than retain
  aliases;
- remove the AEO score role from `aeo.server_rendered_content` everywhere;
- delete rule-level scoring paths superseded by family normalization;
- remove read-time or UI-derived classification ratios;
- remove old DTO fields rather than dual-write compatibility shapes; and
- update every active authority in the same change.

The final search for retired names must find only an explicit historical note in
this plan’s calibration/removal record when needed for auditability.

## Implementation verification

During implementation, use focused deterministic tests for the owning seam. At
completion run the repository gates once, in order, from the repository root:

```powershell
.\scripts\check.ps1
.\scripts\test.ps1
```

The PR is complete only when:

- all four internal slices and their acceptance criteria are complete;
- the disposable database upgrades from the single baseline and `alembic check`
  reports no drift;
- Searchable and Flourist calibration plus browser verification are recorded;
- every active semantic identifier remains `1`;
- current runtime docs describe the shipped PR4 contract;
- the PR1–PR3 cutover plan remains an intact implementation record linked to
  this successor; and
- no compatibility scorer, duplicate profile map, second projection owner, or
  superseded rule/fact/UI path remains.

## Calibration record

Pending PR4 implementation. Do not add speculative results.
