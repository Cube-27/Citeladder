# Content structure: internal links and topics

## Status and authorization

Planned on 28 September 2026. The owner requested a frontend/backend implementation
plan, TypeScript for new development, removal of the existing Site Health topical
coherence implementation/UI, and a separate implementation worktree. This task
prepared the plan and worktree. Implementation was authorized on 28 September
2026 with these refinements: use the existing design system, never mention JEV
in the UI, keep the workflow simple, reuse the existing JEV client/configuration,
and use reusable Sol 6 medium agents for exploration and targeted verification.

Implemented locally in the worktree below. Publication and live enablement are
pending. The implemented v1 scope uses two tables, three API operations, bounded
saved results and existing Action/provider/credit owners. Threshold calibration
and a published finite `content_structure` credit rate remain rollout work.

Selected product direction: a new **Content structure** page at
`/site/content-structure`, containing **Internal links** and **Topics** views.
This remains a Site Health capability over its existing evidence, not a new
crawler or page-understanding owner. CDN/GCP log ingestion is deferred.

The implementation worktree uses branch
`codex/content-structure` at `C:/Projects/Citeladder-content-structure`.
Base: committed HEAD ca9e1bab (PR 9a, #187). Uncommitted changes in the
original checkout are excluded. Before implementation, inspect newer merged
TypeScript migration changes and integrate relevant committed changes explicitly.

## Outcome and acceptance

Users can find a useful contextual link, inspect the exact existing source text
and destination evidence, copy the proposed edit, declare implementation through
Actions, and see whether a later crawl observed it. Users can browse meaningful
topic groups and their pages, existing connections, and link recommendations.

A successful release:
- Produces source URL, target URL, exact anchor span, paragraph context and
  evidence-backed judgments for every recommendation.
- Separates semantic usefulness, anchor suitability and observed link facts.
- Supports multi-topic membership, abstention and incomplete crawl evidence.
- Removes the legacy TF-IDF topical projection and keyword-list UI completely.
- Adds no model-derived Site Health score or guaranteed ranking/citation claim.
- Leaves crawling, existing technical findings and prompt topical binding intact.
- Works truthfully when JEV is disabled, unavailable, or has no suitable results.

## Product scope

### Internal links

The default view is a paginated recommendation table with source page,
destination, suggested anchor, and an action to inspect the passage.
Filters: source/destination search, topic and Action
status. Sorting applies to the complete persisted result set.

The review drawer shows:
- Source heading and exact paragraph, highlighting the proposed anchor.
- Destination title, purpose and the excerpt used for judgment.
- Observed existing links, distinguishing main content, navigation/footer and
  unknown placement.
- Exact captured passage/destination evidence; separate link-usefulness and anchor
  judgments are retained in saved evidence. Crawl date, coverage limitations and
  stale-evidence status appear on the page. Provider names and uncalibrated
  confidence percentages are not exposed in the UI.
- Copy anchor/URL/edit, open page evidence, open the owning Action, and dismiss or
  declare through that Action's existing controls.

Initial recommendations only wrap existing unlinked text. They do not invent
sentences, rewrite paragraphs, insert links into existing anchors, or publish
changes. An optional Agent handoff can draft a passage separately and must remain
a draft. No automatic suggestion when no usable anchor exists.

### Topics

The Topics view is a named group list with member-page and recommendation counts.
Opening a group shows member pages, their observed contextual links, and filtered
recommendations. Support pages in multiple groups, unassigned pages and uncertain
memberships; do not force the entire site into disjoint clusters.

Use source-grounded labels: harvest bounded label candidates from meaningful
headings, titles and reviewed business context, then let JEV select among them.
Persist the candidate source identity and selection. Do not ship comma-separated
keyword bags as labels. If no useful label is supported, abstain and retain pages
as ungrouped. Label editing and a generative naming service are outside v1.

Page relevance and link structure are separate. Missing edges do not automatically
mean a defect; topical similarity alone never creates a link recommendation.
Show weak connections only through qualified recommendations and observed
contextual-link counts. No universal coherence score, all-to-all link target,
automatic off-topic penalty, or content-gap claim without separate demand evidence.

Topic identities are analysis-scoped. Do not imply stable cross-crawl topic trends,
reuse unrelated prompt Topic rows, or infer that a split/merge changed performance.

### New page and existing Website page

Add Content structure to shared Site Health navigation, compact navigation,
command palette and route prefetch ownership. Link to it from Website Architecture
and relevant page-detail link evidence.

Remove only the topical-coherence section from the existing Architecture panel.
Retain its deterministic page-kind, hierarchy, internal-link and depth diagnostics.
The new page replaces the obsolete topical experience and adds contextual link
work, rather than duplicating the existing architecture cards.

Shareable URL state carries crawl, analysis, view, topic, filters and selected
recommendation. A project switch clears all prior project evidence and cursors.
Use shared tables, drawers, tabs, pagination and typography from the current design
system. The page prioritizes reviewable edits; a force-directed graph is out of v1.

## Current owners and retirement inventory

Recheck this inventory at implementation start because concurrent migration work
is active.

| Existing path/owner | Treatment |
| --- | --- |
| `backend/app/analysis/site_health/topical_coherence.py` | Delete TF-IDF clustering implementation after cutover |
| `backend/app/core/config/site_health_topical.py` | Delete retired clustering policy |
| `backend/app/domain/site_health/architecture.py` | Remove topical derivation/imports and persistence field; preserve structural rules |
| `backend/app/models/site_health/architecture.py` | Remove obsolete topical_coherence JSON column mapping |
| `backend/app/domain/site_health/service/architecture.py` | Remove topical fallback and response projection |
| `backend/app/domain/site_health/architecture_schemas.py` | Remove topical-only DTOs and field |
| `frontend/packages/contracts/src/site-health/architecture.ts` | Remove topical schemas and field through stable Site Health facade |
| `frontend/components/site-health/architecture-panel.tsx` | Delete keyword-list section, retain other diagnostics and add new-page navigation |
| `backend/tests/unit/test_site_health_topical_coherence.py` | Retire tests for deleted lexical clustering, replace with new behavior coverage |
| Architecture backend/frontend tests and Site Health screen fixtures | Remove retired fields/assertions; preserve meaningful unrelated checks |
| `migrations/versions/0001_initial.py` and generated Kysely types | Remove old column and add scoped new persistence on disposable database only |
| Architecture exports, MCP/Agent readers and active docs | Search all consumers and remove obsolete references; preserve structural evidence |

Do not remove `backend/app/domain/prompts/topical_binding.py` or its tests:
it is unrelated prompt-admission protection.

Retain and reuse:
- `analysis/site_health/fact_links.py`, `fact_regions.py` and parser:
  immutable observed anchors, placement and content acquisition.
- `analysis/site_health/link_graph.py`, `domain/site_health/link_metrics.py`,
  worker phase and `SitePageLinkMetric`: existing deterministic graph owner.
- `SitePageAnalysis`, fetch artifacts, crawl coverage, canonical/redirect evidence.
- Existing Opportunities, Actions, declarations, verification and Agent
  `internal_links` skill. These own workflow; recommendations are evidence.

## Language and migration boundary

New product logic is TypeScript in the existing Hono/Kysely service: contracts,
admission, candidate retrieval, persisted reads, topic derivation and recommendation
projections. Reuse the existing Python JEV connector and `JEV_API_KEY` through a
narrow Python analytics task. TypeScript keeps database-only publication tasks.
Both use the existing PostgreSQL analytics queue; no new service or provider client.

Python remains the schema/config authority and acquisition/HTML parsing owner.
Small schema/config/export updates and extraction changes in those owners are
appropriate; TypeScript preference must not create a second HTML parser,
entitlement implementation or migration system.

The replacement retires Python topical derivation in favor of TypeScript.
Existing Architecture reads stay Python: they share crawl-finalization projections
and response owners, and moving them is not required for the new page. The bounded
migration here is the replacement topical capability and its new persisted API.

Do not migrate link-graph computation, crawl orchestration, billing, prompt JEV
gating or the Agent runtime opportunistically. Existing Python JEV transport has
live prompt-generation callers and is reused by the narrow Python task.
Connection settings come from the shared config owner; question policy is
capability-specific and does not reuse prompt-quality thresholds.

## Backend design

### 1. Evidence preparation

An explicit Analyze action selects one finalized authorized crawl. Freeze exact
analysis/artifact IDs and their extraction versions, observed link facts, URL
identity, coverage and limits. Later page revisions cannot silently change a run.

Prepare bounded source passages from usable main content with heading context,
text offsets and source identity. Inspect existing extractor locators first.
Current anchor facts include text, URL and region but do not establish exact
paragraph-span identity on their own. If needed, extend the existing Python
extractor to persist passage/anchor locators and linked text ranges. Never infer
safe insertion points from a flattened text substring when its occurrence is
ambiguous. Older evidence without locators stays explicitly unsupported until
a fresh crawl; reading it must not reparse or repair it.

Exclude navigation, cookie notices, filter controls and boilerplate from semantic
candidate text. Keep page-kind-aware eligibility: product/category pages can be
destinations even when they lack source prose. Missing, truncated or unavailable
content remains a distinct state. Sitemap discovery alone does not qualify a page.

Canonicalization follows confirmed existing evidence. Do not normalize meaningful
query parameters away or treat title similarity as URL equivalence.

### 2. Candidate generation

Build a bounded retrieval index over persisted page titles, headings and content
under the Site Health analysis owner. Start with lexical retrieval over cleaned
passages and page purpose; configure per-page/per-passage shortlist sizes and run
caps. Benchmark candidate recall before adding an embedding provider or storage.

Generate directional source-passage/target candidates, not the full Cartesian
product. Deduplicate URL aliases, repeated source spans and equivalent pair
candidates before inference. Exclude self-links, unusable/non-indexable targets
under explicit policy, and targets already linked contextually from the source.
A navigation-only link does not block a contextual suggestion. Unknown existing
link coverage prevents a confident missing-link claim.

Extract a bounded set of descriptive, contiguous, unlinked anchor spans.
Retain exact offsets and context. Candidate generation must expose truncation,
omissions and coverage so a failed retrieval is not reported as no opportunity.

### 3. JEV judgments

Read current TypeSafe API, SDK and primitive docs before implementation; the API
must not be inferred from the older prompt gate.

For each candidate state, ask narrow questions:
- Noul: would this destination help the reader at this exact passage?
- Choice: which supplied anchor span is the most appropriate, including none?
- If needed, a separate suitability check for the selected span in a dependent
  request; do not pretend independent questions see each other's answers.

Include source passage/heading, source and target purpose/content, existing-link
placement and candidate spans. Treat all crawled text as untrusted evidence.
Do not ask JEV to generate URLs, anchors or prose explanations.

Persist usefulness probability separately from Choice distribution/confidence.
Do not multiply scores into a fabricated overall correctness probability.
Admission uses configurable thresholds validated on editor-reviewed examples.
Uncertain and unavailable results are distinct from rejected recommendations.
Code owns ranking, limits, deduplication and span validation. Avoid model-derived
SEO impact scores. Use stable deterministic ordering with transparent criteria.

Batch independent questions where supported within frozen request/token budgets.
Keep input manifests, question/policy/model versions, dispatch and outcome evidence.
Validate provider responses structurally and semantically before publishing.

### 4. Topic grouping

Retrieve plausible page/topic candidates using the same cleaned evidence and
source-grounded label inventory. JEV judges each plausible membership separately,
allowing several memberships or none. Avoid transitive similarity chains that
merge a whole site into one topic and broad labels that absorb every page.

Bound seeds, candidate memberships and total questions. Deterministically merge
only supported equivalent label candidates, retaining their source IDs; do not
silently combine unrelated groups. Persist topic labels, memberships, judgments,
omissions and ungrouped counts for the selected run.

Join observed graph edges and recommendation rows to memberships to produce
topic detail. Count distinct pages and edges explicitly; repeated templates do not
become evidence of useful contextual connectivity. Topic suggestions link to the
same recommendation identities shown in Internal links.

### 5. Persistence and execution

Use focused Site Health-owned tables (names finalized in slice 1):
- Analysis runs: frozen crawl manifest, state, budgets, policy versions and coverage.
- Append-only provider dispatch/outcome records or the applicable existing attempt
  owner, selected after inspecting current reusable contracts.
- One immutable published result per run, containing topics/memberships and
  recommendations with exact source passage, target, anchor locator, judgment and
  contributing artifact identities; no extra recommendation store is needed.

Do not copy full page truth into a parallel page model. Store bounded dispatched
context only as immutable attempt evidence with the existing retention rules.
Scope every table/reference by workspace/project, with composite integrity where
appropriate. Deletion/retention must preserve meaningful provenance or mark it
unavailable; no orphaned evidence references.

Admission validates permission and finalized crawl eligibility. Before provider
dispatch the Python task rechecks permission, provider readiness and a published
finite credit policy, then reserves through the existing metered-usage owner.
The first funded dispatch freezes the published rate and model for the run.
No provider call proceeds without an allowance. Missing funding is persisted as
unavailable; the key alone does not bypass credit admission.

Use explicit admission and one active analysis per configured project scope.
Same idempotency key/same request replays; conflicting input fails. Distinguish a
network retry from a deliberate paid rerun. The judgment kind is Python-owned;
the publication kind is registered in ANALYTICS_TS_OWNED_TASK_KINDS. Both use the
existing analytics queue and lease machinery.

Commit attempts before provider I/O, heartbeat leases, fence stale completions,
and atomically publish terminal projections. Recheck permission and admitted
provider/budget identity before dispatch. A crash after dispatch without a known
outcome is uncertain; do not blindly resend paid work. Bound retries and cancellation.

A partial run retains successful evidence with explicit coverage; it must not
claim all candidates were assessed. Previous completed runs remain inspectable
while a new run is pending. Reads never trigger analysis.

### 6. API and contracts

Add one `site-health-content-structure` route family to the existing manifest and
all ingress owners. Project-scoped resources under
`/api/v1/projects/{project_id}/site-health/content-structure`:
- GET current/specified persisted analysis, bounded recommendations, topics and
  recent analysis history.
- POST analyses for explicit bounded admission; POST cancel.

To keep v1 simple, filtering, pagination, topic detail and escaped CSV export
operate over that bounded saved result. Separate list/detail/export endpoints
and server cursors are unnecessary at the configured maximum of 100 links.

Use `@citeladder/contracts` zod schemas and the Site Health facade, generated
OpenAPI, strict browser validation and one API/query-key owner. Response states
must distinguish never analyzed, unsupported evidence, provider unavailable,
running, partial, failed, completed-empty and historical/stale.

Query keys bind workspace/project and analysis. All joins and
identifier resolution enforce membership; cross-project IDs return the established
not-found behavior. CSV exports use the saved filtered data and formula escaping.

### 7. Actions, Agent and verification

Qualified recommendations become evidence for an owned-source-page Opportunity,
grouped into the existing source page's Action. Several target suggestions must
not create duplicate Actions. Retain immutable per-link identities.

Extend existing declaration expectations to freeze the specific accepted link
recommendation IDs, source/target identity and anchor evidence. The server derives
checks from eligible persisted recommendations; the browser cannot choose arbitrary
checks or satisfy them by supplying its own target. If a page Action includes
multiple links, the UI must make the declared set explicit and avoid declaring
unselected work complete. Preserve the existing one-declaration-per-Action contract;
resolve subset admission within that owner before shipping controls.

Dismissal uses existing Action workflow, with its page-level scope visible.
Per-recommendation independent workflow is outside v1 unless the existing owner
can represent it without introducing a second action store.

On later finalized crawls, verify source-to-target main-content link presence
using exact captured destination identity and declared anchor semantics. Alias
expansion is deferred; the verifier does not infer URL equivalence. Record changed
anchor, missing source, uncertain placement and insufficient capture separately. A link
appearing in navigation does not satisfy a contextual-link check. Later removal
can reopen measuring under existing observation semantics.

Agent handoff carries authorized recommendation/evidence IDs through the existing
internal-links skill. Its existing `get_action` tool retrieves member evidence,
including exact passages and anchors. Copying, exporting or generating never
declares implementation. No model call is needed to verify an observed link.
Do not attribute later traffic or visibility movement causally to this edit.

## Frontend delivery details

Use a focused screen coordinator and sibling view/drawer owners rather than
expanding architecture-panel.tsx. Integrate lazy routing, permissions, query keys,
URL state, navigation and route-intent prefetch together.

Header: Content structure, selected crawl/date, coverage and Analyze/Refresh.
Internal links is the default view; Topics uses the same selected analysis.
The first-use state explains the required crawl and explicit analysis action.
Show stale recommendations as historical when their source evidence changed.

Support keyboard table actions, labelled filters, drawer focus management,
accessible highlighted text, narrow layouts and copy feedback. Retain same-scope
results on transient refresh failures; clear protected content on access loss.
Do not show fabricated counts during loading or treat a provider outage as zero
recommendations. No confidence percentage until calibration supports its meaning;
detailed raw judgments can remain in evidence inspection.

## Dependency-ordered implementation slices

1. **Contracts, extraction seam and persistence.** Re-inventory consumers; resolve
   exact passage locators and funding admission; define schemas and task/route
   ownership; extend existing extraction only where required. Add database types.
2. **TypeScript analysis pipeline.** Implement admission, deterministic retrieval,
   JEV attempt lifecycle, anchor selection and persisted recommendation reads.
   Verify queue, authorization and uncertainty at PostgreSQL/provider boundaries.
3. **Topics over the same evidence.** Implement label candidates, membership
   judgments, bounded grouping and graph/recommendation joins. Evaluate topic
   quality and candidate recall independently from link precision.
4. **Actions and verification.** Implement scoped recommendation evidence,
   declaration-set semantics, Agent handoff and deterministic later-crawl checks.
5. **New frontend page.** Build the two views, exact-passage review, navigation,
   state handling, exports and action integration against real typed endpoints.
6. **Atomic retirement and review.** Delete old topical implementation/column/DTOs/
   UI/tests, repair consumers and active docs, and run final replacement searches.
   Include the optional architecture-read migration only if the bounded criterion
   above is met. Do not leave dual topical engines after release.

Slices may be committed independently but the product cutover is one coherent
release. Do not ship a half-connected recommendation screen that cannot inspect
its source evidence or accurately declare its selected work.

## Verification and rollout

Tests must validate decisions, not copies of configuration or literal source text.
Use sanitized deterministic fixtures and scripted provider answers locally.
Select the smallest affected tests during iteration; do not overlap test processes.

Required coverage:
- Retrieval: useful candidates retained, self/duplicate/contextually-linked targets
  excluded, navigation-only links allowed, boilerplate and ambiguous spans withheld.
- JEV: no-match anchor, uncertain usefulness, malformed/missing answer, budget cap,
  provider failure, stale lease and uncertain dispatch outcomes.
- Topics: multi-membership, no useful label, unassigned pages, broad-topic collapse,
  partial/truncated evidence and distinct-page/edge counting.
- Real PostgreSQL: non-member isolation, scoped foreign IDs, duplicate/concurrent
  admission, idempotent completion, cancellation and provenance integrity.
- Actions: multiple recommendations on a source page, explicit declared set,
  frozen expectations, nav-only mismatch and later link removal.
- UI: first-use, completed-empty, unavailable/partial/stale states, project switches,
  filtering/pagination, exact passage review, keyboard/focus and declaration scope.
- Existing crawl finalization, architecture diagnostics, export and page detail
  retain coverage after topical-field removal.

Expected commands (choose exact new test paths as files land):
- From frontend: `pnpm --filter @citeladder/api test <affected-test-files>`.
- From frontend: `pnpm test <affected-component-test-files>`.
- Backend extraction/architecture tests through the isolated test harness documented
  in docs/DEVELOPMENT.md; no inherited live provider credentials.
- Run `./scripts/check.ps1` once after the intended executable diff is complete.
- Inspect `git diff --check`, `git diff --stat`, `git diff --name-status`;
  review against Review.md and search for retired topical symbols.

Use a fresh disposable database for the baseline schema change. No reset of an
existing or shared database is authorized by this plan. Do not run live JEV calls,
deploy, publish, or mutate customer sites without separate authorization.

Calibration is a release requirement, not replaced by mocked tests. Prepare
editor-reviewed examples spanning editorial, commerce, support, multilingual,
sparse-content and navigation-heavy pages. Measure shortlist recall, recommendation
precision, anchor acceptance, topic membership/label usefulness, abstentions,
latency and cost. Freeze reviewed thresholds and bounds before enabling live use;
do not borrow prompt-quality thresholds or claim measured quality from fixtures.

Existing JEV production enablement awaits the documented processor/privacy release
gates. This workload sends page passages, so confirm its data categories are covered
before production activation. Development can complete with scripted responses
while provider enablement remains unavailable.

Update docs/site-health.md, affected API/frontend/architecture ownership documents,
Agent/Opportunities documentation if their contracts change, and plans/ACTIVE.md.
Keep routine implementation evidence in PR/CI records. No new progress sidecars.

## Out of scope

CDN/server logs, automatic publishing, CMS connections, full crawler/graph migration,
cross-crawl topic identity matching, automatic content-gap assertions, generated
anchor rewrites, force-directed visualization, and causal SEO/AI outcome scoring.

## Design references

- TypeSafe primitives: https://docs.typesafe.ai/primitives/choice and
  https://docs.typesafe.ai/primitives/noul
- Retrieval and semantic reranking:
  https://docs.typesafe.ai/cookbooks/rerank_typesafe
- Repository authorities: ../site-health.md, ../invariants.md,
  ../frontend-architecture.md, ../opportunities.md and ../../Review.md.
