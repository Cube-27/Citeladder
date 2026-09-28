# Opportunities and verification

## Responsibility

Opportunities is the single persisted cross-system action owner. It connects
Site Health findings, demand observations and answer-engine evidence to ranked
actions, groups them into target-level Actions and projects the typed evidence
handoff the [Agent](agents.md) receives. It distinguishes an Action's workflow
status from a user's declaration that an external change was implemented, and
both from subsequent observed evidence. It cannot establish causation.

## Evidence to action

The [TypeScript routes](../frontend/services/api/src/routes/opportunities.ts)
serve the workspace-authorized catalog, detail, summary, history, manual order,
exports and on-demand recompute. The
[refresh](../frontend/services/api/src/opportunities/refresh.ts) is the one
writer of Opportunities and snapshots: the TypeScript analytics worker claims
`opportunity_refresh` tasks that Python sources enqueue through the
[admission bridge](../backend/app/domain/opportunities/queue.py). Detectors
consume persisted source snapshots; recomputation writes ranked Opportunities
and immutable snapshots with rule/formula versions and exact source identities,
under the project advisory lock Python prompt writes share.
An ordinary list/detail read never refreshes a source or recomputes a ranking.

Site Health owns acquisition and deterministic findings. Demand owns imported
query/page evidence and signals. Visibility owns answer artifacts and measured
mentions/citations. Opportunity evidence retains their availability and coverage
rather than replacing missing inputs with zero or a guessed confidence.
Human status changes remain separate from immutable source observations.

Search-intelligence promotion is deliberately narrower than observation. A
substantial content update is history, not an action. Only modification-date
inconsistency and date-only cosmetic refresh promote, and only with complete,
extractor-compatible text coverage. Query relevance may enrich the existing CTR
gap action over the same scope; it never creates a duplicate action or asserts
causation. Anchor diagnostics and topical outliers do not promote by default.

Source routing distinguishes owned and earned actions and exposes the persisted
source mix. The [content handoff](../backend/app/domain/opportunities/content_handoff.py)
projects target IDs, citations, limitations, coverage and a suggested content
format for the Agent's context.

Earned actions are keyed on one inspected page, not on a publisher domain.
`earned_page_acquire_listing`, `earned_page_correct_listing`,
`earned_page_defend_listing` and `earned_page_research_source` fire only on
evidence that a page was read, behind a qualification gate that research is
the explicit exception to. Their priority reads verified on-page competitor
presence; answer-level co-occurrence is descriptive and never scores. The
domain-keyed `earned_source_recurs_beside_gap` is retired and config-only.
[Earned sources](earned-sources.md) is the authority for the
inspection and the four rules; a declaration against them targets the
publisher page and never an owned `SiteUrl`.

The Agent's [Actions screens](../frontend/components/agent/actions-screen.tsx)
render that contract; they never reclassify domains or fabricate task prose.
There is no separate Opportunities screen.

## Actions

An [Action](../frontend/services/api/src/opportunities/actions.ts) is the unit of work
over this store: the live Opportunities that share one target (an owned, earned
or planned page, a product or category, a Search Console query or a visibility
prompt), plus any Agent work on that target. The refresh re-derives every Action
([action sync](../frontend/services/api/src/opportunities/action-sync.ts))
inside the same transaction and project lock as the snapshot it describes, so
members, priority and diagnosis always match that snapshot. Grouping,
convergence across evidence families, priority and the deterministic diagnosis
(approach and recommended skill) are pure functions of the members under
[Action policy](../backend/app/core/config/actions.py), stamped with their
versions. A model does not score or diagnose an Action.

`actions` has two writers across the stack boundary. The refresh derives
evidence Actions and restamps every row's members; the Python Agent only inserts
its own `agent`-origin row, and does nothing when the target key already exists.
The refresh adopts an Agent row on the same key instead of opening a second one.
The [TypeScript Action routes](../frontend/services/api/src/routes/actions.ts)
own workflow updates and declarations. The retained
[Python read/attach bridge](../backend/app/domain/opportunities/actions.py) serves
the Agent, while MCP and command-center reads retain the effective-status bridge;
these helpers retire only when their last Python callers move.

An Action's identity and origin never change. When no live Opportunity targets
it any more, the row keeps its identity with its evidence cleared. The Agent
attaches a targeted chat to the existing Action, or creates one only for a page
or planned-page target. `/api/v1/projects/{project_id}/actions` and
`/api/v1/actions/{action_id}` are workspace-authorized persisted reads; the list
filters by status and target kind and returns project-wide status counts, and
the detail names the chats linked to the Action.

The Action, not the Opportunity, owns workflow status. A user stores only `open`
or `dismissed` through `PATCH /api/v1/actions/{action_id}`, and each change
appends an [ActionStatusEvent](../frontend/services/api/src/opportunities/actions.ts).
`in_progress` is never stored: an open Action reads as in progress while a
linked chat has an output, so the Agent sets no status. A declaration stores
`implemented` (with its status event); `measuring` and `done` are derived from
the verifier's observations of that declaration — the latest observation
decides: one that verified every expected check reads as done, any other reads
as measuring, so a later contradiction reopens measurement — and the verifier
never writes Action status. A user cannot overwrite a declared state.
Recompute stamps each Opportunity's `action_id`; the Opportunity list, export
and MCP `status` filter resolve through that Action, and the command center
counts an Action resolved at its first verified observation. Each promoted
Search Demand signal's read carries the Action its live Opportunity joined, for
the Search Demand "Act on this" band.

## Explicit implementation declaration

`POST /api/v1/actions/{action_id}/declaration` records that an Action was
implemented ([implementation events](../frontend/services/api/src/opportunities/declarations.ts)).
It is anchored on the Action and, when the work came from the Agent, on the
exact output revision the user shipped; a revision from another Action's output
or an outline is refused, and null means work done outside CiteLadder. The
caller names that revision and the implementation time. For contextual-link
findings, the caller also selects saved recommendation IDs in Website's Internal links tab;
the server validates them against the current crawl and Action membership. The server
locks the project before the Action row and freezes its live member rows and
targets (the publisher page for an
earned Action, otherwise the members' resolved pages or the Action's own page)
and the expected checks: the union of the member rules' checks. Caller-supplied
checks or targets are rejected, because a declaration that chose its own
expectation could declare itself verified. The Action row is locked and one
Action carries at most one declaration; a same-key replay returns it, and
same-key conflicting input is rejected. The user must reopen a dismissed Action first,
and an Action with no current finding is refused: with no checks it could never
be measured.
Replay checks both the persisted project/Action identity and the original
request values after workspace-scoped Action authorization, including unique-key
insert-conflict recovery. A valid retry returns the original declaration without
requiring a new snapshot, resolving targets again, or repeating side effects.
Dismissing an Action or producing Agent output for it does not declare it. The
chat's own measurement plan is free text and does not add checks.

Contextual-link declarations freeze only the explicitly selected links, including
source/target analysis and artifact IDs, extractor version, destination and
suggested anchor text. They preserve one declaration per page Action, so the UI
asks users to select every link they intend to declare before submitting.
Unselected links are not declared implicitly; the page's other findings keep
their own checks in the same declaration. Same-key
replay must name the same selection. Later complete, compatible crawl evidence
checks for a main-content link to the destination; the anchor was a suggestion,
so rewording it still verifies. Navigation-only links do not satisfy the check, and missing or incompatible capture stays inconclusive.

An earned declaration receives a PLACEMENT check, not the baseline-anchored
visibility one. Its expected change is read from the rule — a listing acquired,
a named discrepancy resolved, a placement restored, a source resolved — and a
[placement check](../frontend/services/api/src/opportunities/placement-declaration.ts) row
anchored on that implementation event freezes the source identity, the expected
change, the baseline snapshot and the roster it was judged against. The
opportunity's stable key travels alongside for navigation across recompute and
is never the anchor: the same page and action can be attempted more than once,
and a check has to know which attempt it verifies.

Later crawl, audit, traffic or source-page-inspection completion can enqueue
bounded [TypeScript verification](../frontend/services/api/src/opportunities/verification.ts)
through the [Python admission bridge](../backend/app/domain/opportunities/verification.py)
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

The [verification result](../frontend/services/api/src/opportunities/verification-result.ts)
projects separate visibility, AI-referral and branded-demand legs, baseline and
post-action source IDs, version identity, gap changes and overlapping actions.
A placement observation travels in its own top-level section, never folded into
those legs. "The listing is live" and "visibility moved" are two observations
about two different things; they are free to disagree, and reporting them as
one is the defect.
Visibility comparison checks frozen audit context, prompt/cohort identity,
engines, repetitions, locale and retrieval policy. Missing or incompatible
evidence remains not-run, unavailable or non-comparable.

The Action detail returns the declaration with its observations and what each
[loop leg](../frontend/services/api/src/opportunities/measurement-legs.ts) is waiting
for, read from persisted rows: the next scheduled visibility run, the next
complete Search Console window after the declaration — a synced window that
starts on or after the declaration day — (or a sync once it has closed), the next crawl (none is scheduled until someone runs one) and the
earned-page placement recheck, each with the row it read. Nothing is
triggered. **Mark implemented** in
the Agent output pane declares the revision on screen; the Action detail
declares work done outside CiteLadder. Both show observation status separately
from workflow status and preserve the causality notice. A positive movement
does not prove that this action caused it; another action or changed
measurement scope may overlap.

The Actions list keeps its `status` and `target` filters in shareable URL state
and pages with a cursor. Overview and Top Insights link to the owning Action at
`/agent/actions/{action_id}`, or to the Actions list when an Opportunity has no
Action yet; an Opportunity's member evidence opens in a drawer on that detail.

Declaration and verification rows are append-only. Deleting their owning
workspace/project follows the baseline cascade; nullable crawl/audit references
survive source retention through SET NULL.

[Configuration](../backend/app/core/config/opportunities.py) owns tunable
ranking and verification policy;
[placement configuration](../backend/app/core/config/placement.py) owns the
expected-change vocabulary, the check states and the recheck schedule.
[Site Health](site-health.md), [Demand](integrations-traffic-analytics.md) and
[Visibility](visibility-prompt.md) remain the source authorities.
[Refresh PostgreSQL tests](../frontend/services/api/test/opportunity-refresh.test.ts)
exercise Python enqueue → TypeScript claim → Python read, replay, concurrent
claims and recomputes, supersession, the Agent handoff and non-member 404s.
[Verification PostgreSQL tests](../frontend/services/api/test/opportunity-verification.test.ts)
exercise comparison, unavailable-state behavior, workspace isolation and the
Python-producer/TypeScript-worker/Python-reader boundary;
[Action PostgreSQL tests](../frontend/services/api/test/actions.test.ts) cover
declaration admission, concurrent replay, workspace isolation, frozen checks and
the TypeScript-declaration/Python-inspection boundary. The
[placement tests](../backend/tests/component/test_placement_checks.py) exercise
inspection and recheck admission against seeded declarations. The pending integrations
follow-up may improve these read surfaces; it is not a second action store.
