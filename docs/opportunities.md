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
The [screen](../frontend/components/opportunities/opportunities-screen.tsx)
renders that contract; it never reclassifies domains or fabricates task prose.
A successful Content generation may link back without declaring implementation.

## Explicit implementation declaration

[Implementation events](../backend/app/domain/opportunities/implementation_events.py)
authorize the project, Opportunity, target pages and optional successful
generation. The server supplies applicable expected checks. An idempotent
declaration freezes the targets, expected checks and baseline evidence.
Same-key conflicting input is rejected. Merely marking an Opportunity resolved
does not create this declaration.

Later crawl, audit or traffic completion can enqueue bounded
[verification](../backend/app/domain/opportunities/verification.py) over
persisted evidence. Verification appends observations against eligible
declarations; it does not perform an external change or infer one from metrics.
Repeated processing is idempotent. New evidence can change the observed
verification result without rewriting the original declaration.

## Comparability and presentation

The [verification result](../backend/app/domain/opportunities/verification_result.py)
projects separate visibility, AI-referral and branded-demand legs, baseline and
post-action source IDs, version identity, gap changes and overlapping actions.
Visibility comparison checks frozen audit context, prompt/cohort identity,
engines, repetitions, locale and retrieval policy. Missing or incompatible
evidence remains not-run, unavailable or non-comparable.

The UI reads the same implementation-event projection after reload. It shows
observation status separately from workflow status, and preserves the causality
notice. A positive movement does not prove that this action caused it; another
action or changed measurement scope may overlap.

Declaration and verification rows are append-only. Deleting their owning
workspace/project follows the baseline cascade; nullable crawl/audit references
survive source retention through SET NULL. Content history actions retain
attempt provenance and the declaration's nullable generation relationship.

[Configuration](../backend/app/core/config/opportunities.py) owns tunable
ranking and verification policy. [Content](content-generation.md),
[Site Health](site-health.md), [Demand](integrations-traffic-analytics.md) and
[Visibility](visibility-prompt.md) remain the source authorities.
[Verification-result tests](../backend/tests/unit/test_opportunity_verification_result.py)
exercise comparison and unavailable-state behavior. The pending integrations
follow-up may improve these read surfaces; it is not a second action store.
