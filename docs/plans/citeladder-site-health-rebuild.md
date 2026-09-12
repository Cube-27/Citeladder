# Site Health evidence, checklist and final-result rebuild

> **Status:** Completed 12 September 2026.

## Outcome

Site Health keeps its secure acquisition, immutable fetch attempts and
artifacts, 15-kind taxonomy, PostgreSQL lifecycle, Content ownership and
Opportunity verification ownership. It replaces family-derived applicability,
fractional scoring and page-time publication with one direct public checklist
and one locked terminal result.

Scores describe completed checks over observed evidence. They do not establish
ranking potential, truth, authority, accessibility conformance or citation
probability.

## Surviving owners

| Concern | Owner |
|---|---|
| URL policy, DNS pinning, redirects, TLS and acquisition limits | `backend/app/connectors/web_evidence/` |
| Immutable attempts, artifacts and bounded normalized facts | `SiteFetchAttempt`, `SiteFetchArtifact`, `analysis/site_health/parser.py` |
| Primary regions and page-owned entity evidence | `fact_regions.py`, fact extractors |
| Page kind and independent traits | `page_kinds.py`, `page_traits.py`, taxonomy config |
| Public checks and applicability | `site_health_rules.py`, `site_health_measurement.py`, `rules.py` |
| Page arithmetic and crawl page means | `scoring.py`, `measurement_aggregation.py` |
| Final result publication | existing locked Site Health terminalization transaction |
| Snapshots and browser/API reads | `domain/site_health/` persisted projections |
| Draft/review/export | existing Content flow |
| Implementation declarations and verification | existing Opportunities flow |

## Keep, rewrite, merge and delete ledger

| Mechanism | Disposition |
|---|---|
| Secure fetcher, URL policy, curl transport and immutable evidence | Keep |
| Parser, accessibility facts and extraction availability | Rewrite faulty bounded observations |
| Page-kind priority conflict resolution | Rewrite strongest-tier conflicts to abstain |
| Rule catalog/applicability/finding admission | Rewrite as direct checklist policy |
| Family profiles, expressions, budgets and gap projection | Delete |
| Page and crawl scorers | Rewrite as binary page scores and equal finalized-page means |
| Canonical conflict and target-resolvable checks | Merge as `technical.canonical_integrity` |
| Heading skip and style-band verdicts | Delete; retain outlines and lengths as facts |
| Duplicate schema-absence checks | Merge into one unscored present-markup enhancement |
| Product/listing/question/date checks | Rewrite around bound facts, purpose and frozen audit time |
| Relationship and Architecture findings | Keep evidence and findings; remove score membership |
| Page-time score publication | Delete |
| Terminal `SitePageAnalysis` revision | Add to the existing owner with `supersedes_analysis_id` |
| Content and Opportunity stores/queues | Keep; update evidence references |

## Checklist contract

Each scored check freezes its ID, version, scope, applicability, outcome,
reason, Web membership, optional single AEO pillar, equal weight, audit time,
source evaluation ID and source artifact provenance. Finding admission depends
on established applicability, evidence and finding class, independent of score
membership.

Public scored outcomes are binary. `satisfied` passes and `missing` fails.
`unknown`, `error` and legacy `partial` remain incomplete and earn no credit.
Positive evidence is required for N/A. A pass requires enough evidence for the
declared domain; parser failure, truncation and client-only uncertainty cannot
become empty successful observations.

The supported AEO purposes in this cutover are article, product, category, FAQ
and non-procedural docs. Other classified purposes return a null AEO score with
`unsupported_purpose_checklist`; `other` returns `page_purpose_unresolved`.

The seven AEO pillars and weights are Answerability 20, Structure 15, Evidence
15, Machine readability 20, Provenance 10, Freshness 5 and Crawlability 15.

```text
Web = 100 * passed applicable checks / applicable checks
Pillar = 100 * passed applicable checks / applicable checks
AEO = weighted mean of applicable completed pillars
Crawl = equal mean of finalized scored page results in the selected cohort
```

A page score is null until every applicable check for that role is determinate.
Pillar results may complete independently, but an overall AEO score is not
provisional. Empty checklists are null. The crawl projection freezes selected
cohort IDs/counts, exclusions and discovery limits separately from the score.

## Cutover

1. Persist extraction availability/truncation, correct static accessible names
   and visible outlines, preserve all canonical declarations, abstain on
   incompatible strongest-tier classifications, and repair bounded product,
   listing, FAQ, schema and date checks.
2. Evaluate page facts without publishing scores. At terminalization, fence
   work, resolve aliases, finish bounded cross-page evaluation, append one final
   current analysis per retained URL, freeze its checklist/source IDs, persist
   snapshot and score summary, then continue existing post-terminal work.
3. Resolve reads through the final manifest evaluation IDs. Update page detail,
   issues, history, exports, Change Intelligence, Architecture, Content,
   Opportunities, Growth Agent and MCP consumers as one response contract.
4. Permit grounded Content drafts only for missing title and meta description.
   Verification requires fresh evidence after the explicit implementation event,
   the same target/entity, compatible semantics and applicable purpose.
5. Fold the self-revision foreign key into `0001_initial.py`; validate only on a
   disposable database. No historical backfill or runtime formula switch exists.

## Focused acceptance

- Direct hidden labels name controls; unrelated hidden text does not. Hidden and
  template headings never enter visible outlines.
- Empty observed content, unavailable extraction, truncation and client-only
  content remain distinct.
- Homepage grids remain homepage; recommendation cards do not replace primary
  purpose; incompatible strongest-tier signals abstain.
- Purchase context keeps public-price requirements when price is absent;
  affirmative quote-led products do not require public prices.
- Visible brands and equal non-Latin names work; target counts cannot substitute
  for labels; explicit empty collections remain distinct.
- Audit replay uses the same frozen time and invalid or expired offer dates fail.
- `other` retains Web checks; unknown/error/partial earn no credit; N/A leaves
  the applicable set; empty sets are null; unscored findings stay visible.
- Final page, page-kind, snapshot and export values agree. A 100 page and a zero
  page average to 50 regardless of their checklist sizes.
- Retry and concurrent terminalization produce one final current row and one
  snapshot. Original analyses, evaluations, issues and artifacts remain
  unchanged and reachable.
- Source UUID membership is workspace-authorized. Reads perform no crawling,
  provider/model call, scoring or repair.
- Missing title/meta findings can open grounded drafts; generation does not
  resolve findings. Only fresh comparable evidence can verify an implementation.

## Deferred

Unsupported-purpose AEO scores, manual classification overrides, mandatory
browser rendering, semantic model review, autonomous publishing/fixes, GSC
retrieval changes, predicted uplift and historical replay remain outside this
cutover.
