# CiteLadder audit remediation — September 7, 2026

> Status: backend measurement and opportunity remediation and frontend
> comparison content/provenance are implemented. Focused backend and frontend
> static gates passed locally on September 7, 2026; full-suite validation is
> delegated to pull-request CI. No production crawl or deployment has been
> performed. This supplements the current Site
> Health runtime authority; it does not replace the measurement cutover or PR4
> reliability plan and its remaining live-calibration prerequisites.

## Objective and evidence boundary

Resolve genuine public-site defects and correct reproducible Site Health
measurement errors without redesigning the website or creating another
architecture subsystem. Success means truthful evidence and useful fixes,
not a target AEO score.

The supplied audit reports snapshot `ab8f5d16-f210-40e2-b18e-c755e08832b8`,
crawl `e833ea92-5518-48a0-bb4a-9df574328ff1`, 10 selected/analyzed URLs,
Web Fundamentals 100, AEO Readiness 53.5, measurement coverage 69.33%, and
eight opportunities. These are report-supplied observations, not independently
retrieved database records in this planning session. Eight opportunities do
not necessarily mean eight unique affected pages.

Current source is available locally. Attempts to open the live homepage and
FAQ through the web tool failed; that does not establish site downtime or
confirm which commit is deployed. Source-supported findings below must be
reconciled with captured production HTML before closing the audit.

## Disposition of the audit findings

| Finding | Repository evidence | Decision |
| --- | --- | --- |
| Comparison details lack attribution | `frontend/components/marketing/pages/compare-detail.tsx` already renders “Maintained by the CiteLadder team” and a review date. `fact_authorship.py` only considers author-token nodes or selected headings; the ordinary paragraph is not a candidate. | Confirmed source-level recognition gap; production state unverified. Improve semantics and bounded responsible-publisher extraction, not a redundant byline. |
| Comparisons need stronger provenance | `frontend/lib/marketing-content/compare.ts` has claims and dates but no source-link fields. The shared detail view has a general sourcing sentence, not traceable references or a substantive methodology. Dates share `CONTENT_REVIEWED`. | Valid content improvement. Verify claims, attach sources, and track genuine per-comparison reviews. Existing dates are not proven false. |
| `/blog` and `/compare` require article attribution | Existing profiles already restrict visible attribution by page kind. `site_health_taxonomy.py` has archive handling but its archive patterns omit bare `/blog`; a comparison hub needs structural inspection too. | Investigate classification before changing applicability. Do not add universal bylines or claim page-kind awareness is absent. |
| Home and Solutions lack entity identity | Both hero components place H1/copy in a `<header>` inside `<main>`. `REGION_EXCLUDED_TAGS` excludes every header, and `fact_regions.py` applies that to descendants. `fact_signals.py` derives identity from the retained H1 or a provider phrase. Solutions already explicitly names CiteLadder in its lead; marketing layout supplies organization data when a canonical origin is configured. | Strong source-supported extraction defect. Reproduce before adding copy. Separately verify that a generic H1 is not accepted as sufficient company identity. |
| FAQ lacks question headings | `pages/faq.tsx` renders actual questions as native `<details>/<summary>` pairs. `_check_question_headings` examines only H2/H3. | Confirmed source-level measurement mismatch. Preserve native FAQ interaction; recognize supported question–answer pairs. |
| Opportunity wording hides the failed atom | `core/config/opportunities.py` maps entity and question checks to `content_structure_incomplete`; `domain/opportunities/recompute.py` persists the configured rule title. | Valid product fix: persist specific evidence-derived guidance through the existing opportunity owner. |
| Technical or infrastructure defects | The audit supplies no reproducible high-severity defect. | Verification only. No speculative HSTS, robots, redirect, canonical, hosting, or database changes. |

## Delivery sequence

### 0. Capture a reproducible baseline

Export the exact snapshot, issue/evaluation records, page kinds, classification
evidence, normalized facts, source artifact IDs, scope, coverage, and deployed
build identity through existing authorized export/read paths. Keep a review
artifact outside the disposable database before any reset.

Capture anonymous server HTML and rendered DOM for `/`, `/solutions`, `/faq`,
`/blog`, `/compare`, and the three audited comparison details. Reconcile the
10 selected URLs against sitemap and internal-link inventory; include current
child articles and the additional Peec comparison in regression coverage.
Record source element, extracted fact, applicable checkpoint, and failed atom
for each observation. Classify each as confirmed, false positive, resolved, or
unverified. Missing live access must stay explicit.

Use sanitized HTML fixtures and the existing parser/classifier/evaluator entry
points to reproduce the findings offline. Do not introduce a separate audit
engine. A fresh product crawl remains an explicit user Run new crawl action.

Acceptance: every proposed behavior change has a reproducible fixture or an
explicit unresolved evidence dependency; inventory limits are recorded.

### 1. Correct primary-content boundaries and identity extraction

Owners: `backend/app/analysis/site_health/fact_regions.py`, `fact_signals.py`,
their existing callers, and `backend/app/core/config/site_health_taxonomy.py`.

- Distinguish page-owned headers within main/article content from global site
  chrome. Keep navigation, explicit banner landmarks, hidden/non-rendered
  content, and unrelated repeated cards excluded.
- Make text extraction, node visibility, heading outlines, and region labels
  follow the same ownership rule. Do not fix only one downstream checkpoint.
- Re-extract Home and Solutions and inspect identity plus proposition evidence.
  Preserve the distinction between the site publisher and the subject/provider
  of a particular page; unrelated Organization schema must not prove identity.
- Check the existing permissive H1 fallback: restoring a slogan to the outline
  should not alone establish a named organization. If identity needs stronger
  association, extend the existing deterministic entity owner with bounded,
  inspectable signals rather than a CiteLadder-specific exception.
- Add a concise identification sentence only if the corrected evidence and
  reader-facing copy still lack one. Keep the existing hero direction.

Acceptance fixtures: nested page header retained, global header excluded,
navigation nested in a page header excluded, hidden/header-card contamination
excluded, named provider recognized, slogan-only identity insufficient,
unrelated schema unable to satisfy the page's provider, JS shell still unknown
or not applicable as its contract requires. Inspect classification effects
because these facts also feed page-kind and observed-architecture projections.

### 2. Recognize FAQ structures through the existing facts pipeline

Owners: existing parser/fact extraction, `content_heuristics.py`, `rules.py`,
and config-owned taxonomy/readiness policies.

- Extract bounded, page-owned question–answer relationships for native
  details/summary and heading-plus-answer structures. Support ARIA accordions
  only with an explicit, valid control/panel relationship and available answer.
- Preserve source structure and evidence; prevent duplicate credit when a
  summary contains a heading. Closed native details with an answer in server
  HTML are not equivalent to absent content.
- Evaluate actual relationships, not the ratio of questions to category
  headings. Empty panels, isolated question marks, navigation labels, orphaned
  controls, and schema-only questions cannot earn complete credit.
- Share extracted facts between classification and evaluation where applicable;
  do not add a second FAQ parser. Retain the existing checkpoint identity if
  it still represents the same capability, updating description and evidence
  consistently. Any necessary contract replacement must remove old callers.

Acceptance: the current native FAQ fixture passes on real pairs; unanswered
questions fail, unavailable client-only answers remain distinguishable, and
category headings do not dilute valid FAQ evidence. The website keeps its
native keyboard behavior and visible/schema content parity.

### 3. Resolve hubs and attribution, then improve comparisons

Backend owners: `page_kinds.py`, taxonomy/archive policy, `fact_authorship.py`,
`site_health_authorship.py`, and the existing family-profile configuration.

- Reproduce `/blog` and `/compare` classification using repeated linked-child
  structure and page-owned content. Extend existing collection/category
  handling if it accurately represents those pages; no new page kind is
  justified merely by these URL paths.
- Preserve article/comparison classification for detail pages. A detail page
  with related cards must not become a hub; a path alone must not prove a hub.
- Apply existing kind-specific attribution profiles after classification.
  Keep site publisher identity separate from article authorship. Do not disable
  attribution for all comparisons to remove the hub finding.
- Recognize explicitly associated responsible publishers as well as people.
  Keep footer branding, vendor names, and unrelated headings from becoming an
  author. Declared-only attribution remains partial, not visible evidence.

Frontend owners: `lib/marketing-content/compare.ts`, `people.ts`, shared
`pages/compare-detail.tsx`, and `lib/seo/json-ld.ts` where appropriate.

- Extend comparison content with first-party source references attached to
  specific claims or clearly identified dimensions, an accurate responsible
  publisher, and independently maintained review dates.
- Verify competitor pricing/features against current vendor sources during
  implementation. Verify CiteLadder claims against shipped behavior. Qualify
  “not documented in reviewed sources”; do not infer nonexistence from silence.
- Enhance the existing attribution paragraph with meaningful markup and a real
  profile/company link. Add concise comparison criteria and the fact that the
  comparison is publisher-authored. Avoid an invented reviewer or credentials.
- Use a real `<time datetime>` for completed reviews. Do not update all review
  dates merely because a shared constant or template changed.
- Add structured data only where it accurately represents visible content and
  the page type. A comparison is not automatically a rated product Review.

Acceptance: real hubs avoid article-only penalties, detail pages retain their
checks, the existing maintainer is recognized, and every shipped competitor
assertion is traceable to reviewed evidence. Apply the shared treatment to all
current comparisons, including Peec, without claiming it was in the audit.

### 4. Persist specific remediation in existing Opportunities

Owners: `backend/app/core/config/opportunities.py`, the existing opportunity
detector and recomputation path, and existing projection consumers.

- Resolve deterministic wording from the persisted failing atom/reason and
  page kind at opportunity creation. For the audited entity failure, identify
  missing entity identity; do not recommend expanding a proposition that passed.
- Support multiple failed atoms without dropping evidence; handle legacy-shaped
  or incomplete evidence with honest general wording rather than invented detail.
- Keep stable deduplication/target identity, source evaluation references,
  priority policy, and implementation/verification history. No parallel store.
- Read APIs, exports, MCP, and UI consume the persisted result. They must not
  independently infer another diagnosis, score, or workflow state.

Acceptance: missing identity, missing proposition, both missing, and unknown
evidence produce accurate guidance; replay is idempotent; workspace isolation
and exact source provenance hold. Update synchronized DTOs only if required.

### 5. Verify the website and establish the corrected baseline

Reconcile anonymous public URLs, statuses, redirects, canonical targets,
robots directives, internal links, metadata, structured-data parity, and
authenticated-route indexability. Check any currently shipped video/media for
poster/failure behavior, mobile loading, reduced motion, and layout stability;
the audit's “hero video” description must first be matched to an actual asset.
These checks create fixes only when a defect is reproduced.

For each implementation slice, finish its changes before running, from root,
`./scripts/check.ps1` then `./scripts/test.ps1`. The first test invocation uses
the full working diff. After a failure, retry with every file changed since
that run via `-ChangedFiles`; never choose a smaller completion test scope.
Use existing parser/rules/family-profile/classifier tests, opportunity component
tests, marketing content/page tests, and mapped marketing E2E as the selector
requires. Update validation mappings for any new production owner. Review the
full diff, including formatter changes. Do not run the full backend suite locally.

Semantic changes keep development versions at `1` and require the documented
disposable-database reset/rebuild. Export the audit baseline first. No reset is
part of this planning task, and no production database is presumed disposable.
No schema change is currently justified; if one becomes necessary, fold it
into `0001_initial.py` and verify empty-database migration plus ORM drift.

After deployment and an explicit fresh crawl, compare each original issue with
new source evidence. Separate website changes from analyzer corrections. Old
and corrected semantics must not be presented as a clean score improvement
even though pre-launch version labels remain `1`; label the exported audit as
historical and establish a new baseline. Keep crawl scope, page-kind composition,
classification coverage, and AEO coverage visible. Do not invent a numeric
decomposition of the score change.

Acceptance: each audited finding has a documented disposition, genuine defects
are resolved, false positives have negative regression coverage, repository
gates pass, and the fresh evidence supports the result. GSC/GA4 and AI Visibility
baselines are separate optional follow-up work, not proof from this audit.

## Architecture decision and exclusions

Extend the current chain: immutable acquisition artifact → normalized facts →
page-kind classification → family-scoped evaluation → persisted scores/issues
and opportunities. Observed Architecture remains the existing Website tab,
derived through its existing queued projection. Rebuild it from corrected
classification evidence; do not add manual archetype corrections or a second
knowledge/architecture workspace.

This audit does not justify a crawler rewrite, rendering service, new queue,
Redis, new content store, LLM scoring, broad visual redesign, infrastructure
changes, or causal AI-visibility claims. Current runtime docs change only when
implementation ships. This document records proposed work, not shipped truth.

## Implementation state

The local backend now retains page-owned headers, extracts bounded
question-answer relationships, requires named provider evidence for entity
identity, recognizes associated responsible publishers, and persists
atom-specific opportunity guidance through the existing projection. Regression
coverage includes negative contamination cases and persistence/provenance.
The documented pre-launch disposable database reset is required before runtime
verification so an already-current opportunity snapshot cannot retain the old
presentation under the intentionally unchanged development version labels.

Frontend comparisons now attach first-party sources to the dimensions they
support, expose publisher attribution and per-comparison review dates, and
associate tier-specific pricing pages with both Pricing and Engines where those
pages establish the engine rows. Current Profound and Otterly pricing pages were
checked during the final frontend review. Public-site capture, deployment, and
a fresh crawl remain follow-up verification dependencies, as do exact persisted
records and deployed build identity.

The earlier backend slice passed `scripts/check.ps1` and the repository-selected
backend tests. Its first full-diff test run exposed seven backend regressions;
after correcting their shared causes, the mapped retries passed 1,049 tests and
then 953 tests for the final hub-classification delta. The final review added
focused regressions for deterministic opportunity consolidation and bounded
heading relationships; the current full diff is left to pull-request CI rather
than rerunning suites locally.
