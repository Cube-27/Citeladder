# Opportunities and verification

## Responsibility

Opportunities is the single persisted cross-system action owner. It connects
Site Health findings, demand observations and answer-engine evidence to ranked
actions and typed Content handoffs. It distinguishes a workflow status from
a user's declaration that an external change was implemented, and both from
subsequent observed evidence. It cannot establish causation.

## Evidence to action

The [API](../backend/app/api/opportunities.py) translates authorized requests
into the [domain owner](../backend/app/domain/opportunities/). Detectors consume
persisted source snapshots; recomputation writes ranked Opportunities and
immutable snapshots with rule/formula versions and exact source identities.
An ordinary list/detail read never refreshes a source or recomputes a ranking.

Site Health owns acquisition and deterministic findings. Demand owns imported
query/page evidence and signals. Visibility owns answer artifacts and measured
mentions/citations. Opportunity evidence retains their availability and coverage
rather than replacing missing inputs with zero or a guessed confidence.
Human status changes remain separate from immutable source observations.

Source routing distinguishes owned and earned actions and exposes the persisted
source mix. The [Content handoff](../backend/app/domain/opportunities/content_handoff.py)
projects target IDs, citations, limitations, coverage and suggested skill.

Earned actions are keyed on one inspected page, not on a publisher domain.
`earned_page_acquire_listing`, `earned_page_correct_listing`,
`earned_page_defend_listing` and `earned_page_research_source` fire only on
evidence that a page was read, behind a qualification gate that research is
the explicit exception to. Their priority reads verified on-page competitor
presence; answer-level co-occurrence is descriptive and never scores. The
domain-keyed `earned_source_recurs_beside_gap` is retired and config-only, and
a human status carries forward to a page only where one page unambiguously
succeeds it. [Earned sources](earned-sources.md) is the authority for the
inspection and the four rules; a declaration against them targets the
publisher page and never an owned `SiteUrl`.

The [screen](../frontend/components/opportunities/opportunities-screen.tsx)
renders that contract; it never reclassifies domains or fabricates task prose.
A successful Content generation may link back without declaring implementation.

## Explicit implementation declaration

[Implementation events](../backend/app/domain/opportunities/implementation_events.py)
authorize the project, Opportunity, target pages and optional successful
generation. The server supplies applicable expected checks; a caller-supplied
set is rejected outright, because a declaration that chose its own expectation
could declare itself verified. An idempotent declaration freezes the targets,
expected checks and baseline evidence. Same-key conflicting input is rejected.
Merely marking an Opportunity resolved does not create this declaration.

An earned declaration receives a PLACEMENT check, not the baseline-anchored
visibility one. Its expected change is read from the rule — a listing acquired,
a named discrepancy resolved, a placement restored, a source resolved — and a
[placement check](../backend/app/domain/opportunities/placement_checks.py) row
anchored on that implementation event freezes the source identity, the expected
change, the baseline snapshot and the roster it was judged against. The
opportunity's stable key travels alongside for navigation across recompute and
is never the anchor: the same page and action can be attempted more than once,
and a check has to know which attempt it verifies.

Later crawl, audit, traffic or source-page-inspection completion can enqueue
bounded [verification](../backend/app/domain/opportunities/verification.py)
over persisted evidence. Verification appends observations against eligible
declarations; it does not perform an external change or infer one from metrics.
Repeated processing is idempotent. New evidence can change the observed
verification result without rewriting the original declaration.

## Placement observation

An inspection batch compares every pending check against the reading it just
committed, through the pure comparator in
[placement_outcome.py](../backend/app/analysis/opportunities/placement_outcome.py).
The comparison is for the SPECIFIC declared change: a correction that named a
missing outbound link is satisfied by the page linking to us, not by the brand
appearing somewhere in the prose. A reading judged against a different entity
roster is not comparable and is not compared — the same rule the deterioration
detector applies. `unavailable` never decays into `unmet`: a page we could not
read says nothing about whether the placement went live.

An empty first reading is an observation, not a contradiction. The check is
re-armed a bounded number of times before it stops asking, and a due check
makes its page claimable through the same atomic admission and the same
inspection budget unit as any other reading — never a path around the
accounting.

## Comparability and presentation

The [verification result](../backend/app/domain/opportunities/verification_result.py)
projects separate visibility, AI-referral and branded-demand legs, baseline and
post-action source IDs, version identity, gap changes and overlapping actions.
A placement observation travels in its own top-level section, never folded into
those legs. "The listing is live" and "visibility moved" are two observations
about two different things; they are free to disagree, and reporting them as
one is the defect.
Visibility comparison checks frozen audit context, prompt/cohort identity,
engines, repetitions, locale and retrieval policy. Missing or incompatible
evidence remains not-run, unavailable or non-comparable.

The UI reads the same implementation-event projection after reload. It shows
observation status separately from workflow status, and preserves the causality
notice. A positive movement does not prove that this action caused it; another
action or changed measurement scope may overlap.

The catalog's shareable URL state owns type, severity, workflow status, action
path and a selected Opportunity UUID. Defaults are omitted; a committed filter
change resets the local cursor and closes detail. Direct `selected` links load
the authorized detail independently of the visible page. The historical
`opportunity` and `opportunity_id` parameters are accepted only as inbound
aliases and replaced with the canonical spelling. Overview, Top Insights, and
Content return links emit `selected` for their Opportunities destination.

Declaration and verification rows are append-only. Deleting their owning
workspace/project follows the baseline cascade; nullable crawl/audit references
survive source retention through SET NULL. Content history actions retain
attempt provenance and the declaration's nullable generation relationship.

[Configuration](../backend/app/core/config/opportunities.py) owns tunable
ranking and verification policy;
[placement configuration](../backend/app/core/config/placement.py) owns the
expected-change vocabulary, the check states and the recheck schedule. [Content](content-generation.md),
[Site Health](site-health.md), [Demand](integrations-traffic-analytics.md) and
[Visibility](visibility-prompt.md) remain the source authorities.
[Verification-result tests](../backend/tests/unit/test_opportunity_verification_result.py)
exercise comparison and unavailable-state behavior;
[placement tests](../backend/tests/component/test_placement_checks.py) exercise
the declaration-to-observation path and the recheck admission ordering. The pending integrations
follow-up may improve these read surfaces; it is not a second action store.
