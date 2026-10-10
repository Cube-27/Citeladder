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
serve the workspace-authorized catalog, the row detail and the shared manual
order. There is no on-demand recompute: refreshes run only from evidence
triggers. The [refresh](../frontend/services/api/src/opportunities/refresh.ts)
is the one writer of Opportunities and snapshots: the TypeScript analytics
worker claims `opportunity_refresh` tasks admitted through the
[TypeScript enqueue owner](../frontend/services/api/src/opportunities/enqueue.ts),
and the runner lane wakes for a retry when it falls due. Detectors consume
persisted source snapshots; recomputation writes ranked Opportunities and
immutable snapshots with rule/formula versions and exact source identities.
An ordinary list/detail read never refreshes a source or recomputes a ranking.

A refresh first resolves its source identity: the audit, crawl, demand
snapshot and revision, internal-link run and newest inspected source-page
reading. When the latest snapshot already records that identity under the
current versions, the refresh loads no evidence. Otherwise it loads evidence
outside the lock, then takes the project advisory lock shared by TypeScript
prompt writes and resolves the identity again; if a source moved during the
load, it writes nothing and fails for a retry over the newer state, so an
older reading never supersedes a newer set. A load that hits its analysis or
Site Health finding cap drops the partial prompt whole and records the cut as
a snapshot limitation, so a missing engine never reads as an absent brand.

A confirmed prompt decline already passed the audit's materiality and
agreement gates, so it always surfaces: confidence ranks it between a floor
and one, and size counts in multiples of the materiality floor, capped.

Site Health owns acquisition and deterministic findings. Demand owns imported
query/page evidence and signals. Visibility owns answer artifacts and measured
mentions/citations. Opportunity evidence retains their availability and coverage
rather than replacing missing inputs with zero or a guessed confidence.
Human status changes remain separate from immutable source observations.

Site change and relevance signals promote more narrowly than they observe.
Unexpected changes in a regression or critical-regression class promote by
class, from the approved change snapshot for the exact newer crawl. A
substantial content update is history, not an action, whatever its date did.
Among content changes, only a minor edit whose modification date did not move
(modification-date inconsistency) and a date-only cosmetic refresh promote,
and only with complete, extractor-compatible text coverage. Query relevance may enrich the existing CTR
gap action over the same scope; it never creates a duplicate action or asserts
causation. Anchor diagnostics do not promote.

Keyword gaps come from the [Search Intelligence](integrations-traffic-analytics.md#search-intelligence-acquisition)
datasets a user reviewed and paid for, read by
[`search-gap-hits.ts`](../frontend/services/api/src/opportunities/search-gap-hits.ts)
as rule `search_keyword_gap` (family `search_intelligence`). Per saved
competitor, the latest published missing-keywords dataset for an owned website
in the project's Search Intelligence market, at most 90 days old, qualifies;
failed or unknown coverage never does, an empty dataset supersedes older gaps,
and partial data adds a limitation. A row promotes only with search volume ≥ 50
and the competitor ranking in the top 10; unknown volume or rank abstains and is
counted, never read as zero. Navigational searches, searches branded for the
project or naming a competitor, searches the project already ranks for in the
same market, and searches Search Console already shows (a promoted Demand query
signal or any query with impressions in the Demand window) are left out. One
search across competitors and word orders is one finding, ranked by competitor
count then volume, at most 25 per refresh. A crawled page whose title and H1
hold every term is the target; otherwise the finding is a planned page keyed
like an Agent-planned page, so both converge on one Action. Publishing a
missing, ranking or shared-keyword dataset enqueues a refresh and verification;
the gap datasets' identity is part of the refresh's source identity, so an
unchanged set is not recomputed. Wording stays an estimate: DataForSEO rankings
are not measured traffic. Thresholds live in `SEARCH_GAP` in the
[opportunity config](../frontend/services/api/src/config/opportunity.ts).

Source routing distinguishes owned and earned actions and exposes the persisted
source mix. The [content handoff](../frontend/services/api/src/opportunities/projection.ts)
projects target IDs, citations, limitations, coverage and a suggested content
format for the Agent's context.

The earned action is keyed on one read page, not on a publisher domain.
`earned_page_acquire_listing` fires only when a successful reading shows a
tracked competitor on the page and the brand absent. Its priority reads
verified on-page competitor presence; answer-level co-occurrence is
descriptive and never scores. [Earned sources](earned-sources.md) is the
authority for the inspection and the rule; a declaration against it targets
the publisher page and never an owned `SiteUrl`.

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
[Action policy](../frontend/services/api/src/config/actions.ts), stamped with their
versions. A model does not score or diagnose an Action.

`actions` has two TypeScript writers. The refresh derives
evidence Actions and restamps every row's members; the Agent only inserts
its own `agent`-origin row, and does nothing when the target key already exists.
The refresh adopts an Agent row on the same key instead of opening a second one.
The [TypeScript Action routes](../frontend/services/api/src/routes/actions.ts)
own workflow updates and declarations. The
[Agent target adapter](../frontend/services/api/src/agent/target-adapter.ts) uses
the same Action owner. MCP and command-center reads use the shared
[effective status](../frontend/services/api/src/opportunities/action-status.ts).

An Action's identity and origin never change. When no live Opportunity targets
it any more, the row keeps its identity with its evidence cleared. The Agent
attaches a targeted chat to the existing Action, or creates one only for a page
or planned-page target. `/api/v1/projects/{project_id}/actions` and
`/api/v1/actions/{action_id}` are workspace-authorized persisted reads; the list
filters by status and target kind and returns project-wide status counts, and
the detail names the chats linked to the Action, carries each live finding with
its remediation, the reading that would measure each finding once declared
(`member_measurement`), and the earliest go-live time a declaration accepts
(`declarable_since`).

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
Recompute stamps each Opportunity's `action_id`; the Opportunity list and MCP
`status` filter resolve through that Action, and the command center counts an
Action resolved at its first verified observation. Action sync restamps live
Actions on every refresh, inserts new groups in batches, and clears an Action
whose evidence vanished once, leaving already-cleared rows untouched. Each promoted
Search Demand signal's read carries the Action its live Opportunity joined, for
the Search Demand "Act on this" band.

## Explicit implementation declaration

`POST /api/v1/actions/{action_id}/declaration` records that an Action was
implemented ([implementation events](../frontend/services/api/src/opportunities/declarations.ts)).
It is anchored on the Action and, when the work came from the Agent, on the
exact output revision the user shipped; a revision from another Action's output
or an outline is refused, and null means work done outside CiteLadder. The
caller names that revision and the go-live time, which may be neither in the
future (beyond clock skew) nor earlier than the verification window. For
contextual-link findings, the caller also selects saved recommendation IDs in
Website's Internal links tab; the server validates them against the current
crawl and Action membership. The server locks the project before the Action
row and freezes its live member rows and targets (the publisher page for an
earned Action, otherwise the members' resolved pages or the Action's own page)
and the expected checks. Caller-supplied checks or targets are rejected,
because a declaration that chose its own expectation could declare itself
verified. The Action row is locked and one Action carries at most one
declaration; a same-key replay returns it, and same-key conflicting input is
rejected. The user must reopen a dismissed Action first, and an Action with no
current finding is refused.

[Declaration checks](../frontend/services/api/src/opportunities/declaration-checks.ts)
freeze one check per distinct expectation, each scoped to what the Action
changed:

| Finding | Check | Read by |
|---|---|---|
| Site Health rule | the rule passes on the page | the next crawl that analyzes the page after go-live |
| Contextual link | the selected link is in main content | the next compatible crawl |
| Search Console (page or query) | clicks per day on that page or query rise against the rate in the last daily window that ended before go-live (sync windows differ in length, so windows compare as rates) | each synced daily window that starts after the go-live day (that day is partly before the change) |
| Keyword gap | the project appears for the search: Search Console impressions, or an owned ranking in a later Search Intelligence dataset whose provider check postdates go-live; still missing or not ranking yet reads `waiting`, never `unmet` | each synced window that starts after go-live, and each later published ranking, shared or missing-keyword dataset for the same website and market |
| Prompt-targeted visibility | the prompt's composite score rises against its score in the snapshot's audit | the next audit that ran the prompt |
| Earned page | each tracked prompt whose answers cited the page: its composite score rises against its score in the snapshot's audit | the next audit that ran the prompt |

A finding nothing can isolate — a product, category or theme, or a visibility
finding with no prompt — gets no check: the project-wide score moves for
reasons the Action never touched, and site-wide clicks include every other
page. The declaration still records the work, and the Action reads as
implemented with nothing to measure.
When the go-live time is earlier than evidence that already exists, the latest
crawl, audit and Search Console window are queued for this declaration at once.
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

An earned declaration is measured on prompts, not on the page: whether the
listing went live shows on the cited URL's page from the next reading, and the
outcome that matters is visibility on the prompts that cite it. Neither claims
the listing caused a movement.

Later crawl, audit, traffic or Search Intelligence
keyword-dataset completion enqueues
[TypeScript verification](../frontend/services/api/src/opportunities/verification.ts)
through the [TypeScript enqueue owner](../frontend/services/api/src/opportunities/enqueue.ts)
only for a project with a declaration inside the verification window. The
window is 30 days from go-live, except a keyword-presence check, which runs 90
days because a new page takes longer to rank than an edited one takes to
recrawl. A task reads only declarations declared before the source was
observed, and only the checks of a kind that source reads that are still
inside their own window; after it a check's last reading stands. Crawl seeding
of declared pages keeps the 30-day window.

Each source reads only its own check kinds and gives each a `met`, `unmet`,
`waiting` or `unavailable` reading with a reason. Under a lock on the
declaration row, those readings fold into the per-check states of the latest
observation: an answer is never replaced by a reading that could not answer,
and between two answers the later observed one wins, whichever order they
arrive in. The folded states decide the observation: any unmet check
contradicts, every check met verifies, anything else is observed. An
observation is appended only when the source read a check or changed what a
reader is told, so repeated unchanged readings add nothing. Verification does
not perform an external change or infer one from metrics. Repeated processing
is idempotent, and new evidence never rewrites the declaration.

## Comparability and presentation

The [verification result](../frontend/services/api/src/opportunities/verification-result.ts)
projects separate visibility, AI-referral and branded-demand legs, baseline and
post-action source IDs, version identity, gap changes and overlapping actions.
Visibility comparison checks frozen audit context, prompt/cohort identity,
engines, repetitions, locale and retrieval policy. Missing or incompatible
evidence remains not-run, unavailable or non-comparable.

The Action detail returns the declaration with its observations, each expected
check with its latest folded state, reason and subject (`checks`), the end of
its verification window (`measured_until`), and what each
[loop leg](../frontend/services/api/src/opportunities/measurement-legs.ts) is waiting
for, read from persisted rows: the next scheduled visibility run, the next
Search Console window — a synced window that starts after the
declaration day, due a few days later, or a sync once that has passed — the
next crawl (none is scheduled until someone runs one), each with the row it
read. Nothing is triggered by a read.

**Mark implemented** in the Agent output pane declares the revision on screen;
the Action detail declares work done outside CiteLadder. The dialog asks when
the change went live and lists what each finding will be measured by. After
declaring, focus moves to the measurement checklist: each check with its state
and the reason it could not be read, and **Run crawl now** while a page check
lacks a met reading. Observation state stays separate from workflow status, and
the causality notice is shown: a met check shows the change is live and
measured; it does not prove this Action caused any movement, and other changes
can overlap.

The Actions list keeps its `status` and `target` filters in shareable URL state
and pages with a cursor. Overview's ranked actions link to the owning Action at
`/agent/actions/{action_id}`, or to the Actions list when an Opportunity has no
Action yet; an Opportunity's member evidence opens in a drawer on that detail.

Declaration and verification rows are append-only. Deleting their owning
workspace/project follows the baseline cascade; nullable crawl/audit references
survive source retention through SET NULL.

[Configuration](../frontend/services/api/src/config/opportunity.ts) owns tunable
ranking and verification policy.
[Site Health](site-health.md), [Demand](integrations-traffic-analytics.md) and
[Visibility](visibility-prompt.md) remain the source authorities.
[Refresh PostgreSQL tests](../frontend/services/api/test/opportunity-refresh.test.ts)
exercise admission, TypeScript claim and persisted reads, replay, the
source-identity skip, concurrent claims and recomputes, supersession, the Agent
handoff and non-member 404s.
[Verification PostgreSQL tests](../frontend/services/api/test/opportunity-verification.test.ts)
exercise per-source folding, scoped traffic and prompt checks, the window,
unavailable-state behavior, workspace isolation, the enqueue gate and the
producer, worker and persisted-reader boundary;
[Action PostgreSQL tests](../frontend/services/api/test/actions.test.ts) cover
declaration admission, go-live bounds, unmeasurable findings, earned
declarations measured on their prompts, concurrent replay, workspace
isolation and frozen checks. The pending integrations
follow-up may improve these read surfaces; it is not a second action store.
