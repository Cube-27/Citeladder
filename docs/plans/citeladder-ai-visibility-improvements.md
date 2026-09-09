# CiteLadder AI Visibility: measurement correctness and frontend improvement

Approved implementation scope: all valid findings F01–F09 in the verified audit
of `9517c0d9`, delivered in dependency order. Preserve unrelated performance
work and the existing Trends, Mentions & Citations, and Query Fanout tabs.

## Phase 1 — Measurement and selection

Separate visibility rate from the preserved prompt composite. Pool SOV counts.
Expose observation states, counts, frozen coverage, resolved selection and
compatible baselines. Preserve every historical run; compare matching frozen
prompt/model cells with explicit subset coverage. Missing identity cannot prove
compatibility. Synchronize backend contracts, frontend schemas and URL state.

## Phase 2 — Trends and evidence

Show three headline measures with denominators, one metric-selectable history
chart, one competitor comparison table, and direct same-response gap actions.
Provide complete paginated evidence, independent filters, original answers and
provenance. Preserve selected context through navigation and refresh.

## Phase 3 — Prompts and models

Replace top-five scores with Low visibility, Biggest drops, Biggest gains and
Strongest modes; expose frozen themes, outcomes, compatible movement and engine
breakdowns. Keep prompt management and Opportunities in their existing owners.

## Phase 4 — Sources

Add Sources/Answers modes inside Mentions & Citations. Aggregate complete scoped
domain/URL facts, distinct responses and stable prompts independently of pages.
Persist source taxonomy during analysis using the existing classifier; historical
missing classification remains unavailable. Never reclassify on reads.

## Phase 5 — Secondary analysis

Summarize observable query events and distinct query text with availability and
aligned injection eligibility. Validate recommendation-language detection on
labelled retained answers before any broader release; never display heuristic
confidence constants as probabilities or introduce a recommendation headline.

## Frontend implementation contract

Use `docs/design.md`, shared typography, semantic colors, spacing, geometry,
tables, metrics, controls, disclosures and drawers. No ad hoc route-level visual
values or new visual system. Retain keyboard, mobile, focus, reduced-motion and
forced-colors behavior. Secondary columns become labelled details on compact
screens; functionality remains available. Update only superseded Visibility
design requirements.

## Acceptance and validation

Numbers must reconcile with the selected exact evidence. Empty, unavailable,
failed, partial and measured zero remain distinct. Changed configurations cannot
produce unqualified movement. Pagination cannot change totals. Users reach an
exact answer within two selections from a prompt/competitor gap row. Verify a
desktop and mobile filter → gap → answer → return journey.

Extend existing tests at the lowest meaningful boundaries, including workspace
isolation, provenance, aggregation, URL restoration, comparisons and completeness.
Acceptance runs `scripts/check.ps1`, then `scripts/test.ps1`. Both passed for
the shipped change on 10 September 2026: backend quality and the full pytest
suite, frontend quality and the full vitest suite. An earlier revision of this
document recorded the work as unverified after a handoff; that no longer
describes it. Do not reset real data, deploy, call providers or silently
rewrite history. Representative-data evaluation and
profiling require actual retained evidence; do not claim production validation
from synthetic fixtures.
