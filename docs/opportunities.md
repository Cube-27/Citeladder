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

Each evidence family (demand, the brand run, Commerce, the crawl, keyword
gaps, content gaps) is one entry in
[refresh families](../frontend/services/api/src/opportunities/refresh-families.ts)
that names its source-identity fields and produces its hits; the refresh
iterates that list. A hit names its target as a typed `TargetRef`
([targets](../frontend/services/api/src/analysis/opportunities/targets.ts)):
the persisted `target_*` columns and `target_key` derive there, and Action
grouping switches on the same union, so no reader parses a key prefix. Each
rule's evidence shape is a schema in `@citeladder/contracts/opportunity-evidence`.
Visibility reads a cited page's earned Opportunity and Action through
[earned page actions](../frontend/services/api/src/opportunities/earned-page-actions.ts).

Content angles are an evidence source computed before the refresh. A finished
audit (beside its source-page inspection) and a terminal crawl each enqueue a
`content_angle_refresh` task ([content gaps](../frontend/services/api/src/content-gaps/refresh.ts)).
It groups the titles of competitor and editorial pages cited for the default
market's prompts over the 30 days before the newest dashboard-ready audit into
angles per prompt topic, and matches each angle to at most one owned content
page of the latest crawl (lexical prefilter, then the model picks one or none),
with included platform calls under the daily spend breaker (B73). Counts,
prompts, engines and owned coverage are computed in code. Insert-only
`content_angle_runs` keep the source audit IDs, crawl, model and versions; a run
is appended only when its clustering, owned-match or aggregate key differs from
the latest succeeded run (a failed run never blocks a retry), reusing the earlier clustering or match while its key is unchanged. The
window's citations are Visibility's evidence statement (`evidenceScope`: the
default market's dashboard-ready brand runs, successful answers, both brand
cohorts), limited to answers to tracked prompts: an answer whose snapshot
names no prompt still in the library is not read (AS5). The clustering sees
each page's title, domain and URL path and groups only content pages, never
product, category, collection, home, search or tag pages. A
`succeeded` run requests an `opportunity_refresh` with trigger `content_angles`
that joins a refresh still queued for the project (such as its audit's or
crawl's own) instead of queueing a second; a `failed` run (model error,
rejected output or a refused call) enqueues nothing.

The `content_gaps` family ([content-gap hits](../frontend/services/api/src/opportunities/content-gap-hits.ts),
pure [detector](../frontend/services/api/src/analysis/opportunities/content-gaps.ts))
reads the latest `succeeded` run; its ID is the family's source identity
(`content_angle_run_id`). A `failed` run is never read, so the gaps of the run
before it stay. A run whose window ends more than `max_source_age_days` (45)
before the refresh is no longer a source: its gaps clear and the snapshot
records "Content-gap evidence is out of date". With no succeeded run the
snapshot records "Content gaps not computed yet", which is distinct from a
succeeded run with no gaps. Each finding's evidence stores
the angle's prompts with their text at refresh (`prompts: {id, text}`, `text`
null for a prompt no longer in the project's prompt sets). An angle cited at least `min_citations` times across
at least `min_domains` domains (both in the
[content optimization config](../frontend/services/api/src/config/content-optimization.ts))
is `content_gap_improve_page` on its matched owned content page unless that page
is already cited for the angle's prompts, and `content_gap_new_page` on a
planned page when nothing matched. Priority grows with prompts, citations and
the competitor share of cited domains (`CONTENT_GAP` in the opportunity
config); the model never scores. Findings key on the angle's lineage, not its
label: a new-page gap targets the lineage's `planned_page_key`, which the
content-angle run that creates the lineage stores (`plannedPageKey` of its
first label) and nothing rewrites, so a relabelled angle keeps its Action and an Agent-planned
page with the same slug converges on it. When a content page later matches a
lineage that had a planned-page Action, that Action keeps its identity and
declaration with its evidence cleared, and the page's finding names it as
`continues_action_id`.

A refresh first resolves its source identity: the audit (the default market's
latest dashboard-ready brand run, the one Visibility and Overview call latest),
the latest dashboard-ready Commerce run (read for Commerce findings only, so
neither kind of run replaces the other's Actions), the newest catalog match
pass (the per-product metric findings read every matched answer in their
window), crawl, demand snapshot and
revision, internal-link run, newest inspected source-page reading, keyword-gap
datasets and content-angle run. When the latest snapshot already records that identity under the
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

Keyword gaps come from the [Keyword Research](integrations-traffic-analytics.md#keyword-research-acquisition)
datasets a user reviewed and paid for, read by
[`search-gap-hits.ts`](../frontend/services/api/src/opportunities/search-gap-hits.ts)
as rule `search_keyword_gap` (family `search_intelligence`). Per saved
competitor, the latest published missing-keywords dataset for an owned website
in the project's Keyword Research market, at most 90 days old, qualifies;
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
members, priority and diagnosis always match that snapshot. Grouping, priority
(the strongest member's score; agreement between sources earns no bonus,
because most findings on a page come from the one crawl) and the deterministic
diagnosis (approach, recommended skill and Agent handoff) are pure functions of the
members under [Action policy](../frontend/services/api/src/config/actions.ts), stamped
with their versions. A model does not score or diagnose an Action. The handoff's
message is the approach branch's first template whose facts the members' stored
evidence holds (the Action's label, the strongest finding's title, a content
gap's angle, the competitors read on an earned page), so it never states a
fact the evidence lacks; list and detail reads return it as `handoff`, and an
Action with no current evidence reads a message about its label. A
`content_gap_improve_page` branch hands off the page URL with the
`optimize_page` workflow, whose chat fetches that page into a page document
before its first turn
([content optimization](content-optimization.md#what-ships-phase-2-page-documents)).

`actions` has two TypeScript writers. The refresh derives
evidence Actions and restamps every row's members; the Agent only inserts
its own `agent`-origin row, and does nothing when the target key already exists.
The refresh adopts an Agent row on the same key instead of opening a second one.
The [TypeScript Action routes](../frontend/services/api/src/routes/actions.ts)
own workflow updates and declarations. The
[Agent target adapter](../frontend/services/api/src/agent/target-adapter.ts) uses
the same Action owner, and so does **Analyze a page** on the Actions screen
(`POST /projects/{id}/actions/analyze`): it inserts or reuses the `agent`-origin
Action for one of the latest crawl's content pages inside the transaction that
starts its `optimize_page` chat, so a repeat for the page reuses the Action
([content optimization](content-optimization.md#what-ships-phase-2-page-documents)).
MCP and command-center reads use the shared, persisted
[effective status](../frontend/services/api/src/opportunities/action-status.ts).

An Action's identity and origin never change. When no live Opportunity targets
it any more, the row keeps its identity with its evidence cleared. The Agent
attaches a targeted chat to the existing Action, or creates one only for a page
or planned-page target. `/api/v1/projects/{project_id}/actions` and
`/api/v1/actions/{action_id}` are workspace-authorized persisted reads; the list
filters by status and target kind and returns status counts for the
project, and
the detail names the chats linked to the Action, carries each live finding with
its remediation, the reading that would measure each finding once declared
(`member_measurement`), and the earliest go-live time a declaration accepts
(`declarable_since`).

The Action, not the Opportunity, owns workflow status. A user stores only `open`
or `dismissed` through `PATCH /api/v1/actions/{action_id}`, and each change
appends an [ActionStatusEvent](../frontend/services/api/src/opportunities/actions.ts).
`in_progress` is never a stored decision: an open Action reads as in progress
while a linked chat has an output, so the Agent sets no status. A declaration
stores `implemented` (with its status event); `measuring` and `done` are derived
from the verifier's observations of that declaration — the latest observation
decides: one that verified every expected check reads as done, any other reads
as measuring, so a later contradiction reopens measurement — and the verifier
never writes the stored decision. A user cannot overwrite a declared state.
The status readers see is persisted on `actions.effective_status` (indexed with
the project for the list filter and the shell's status counts): the status
decision and declaration, the Agent output writer and the verifier each
recompute it in their own transaction (`refreshActionStatus`), and every read,
filter and count selects that column instead of deriving it per request.
Recompute stamps each Opportunity's `action_id`; the Opportunity list and MCP
`status` filter resolve through that Action, and the command center counts an
Action resolved at its first verified observation. Action sync restamps live
Actions on every refresh, inserts new groups in batches, and clears an Action
whose evidence vanished once, leaving already-cleared rows untouched and its
last non-empty member set in place. Each promoted
Search Demand signal's read carries the Action its live Opportunity joined, for
the Search Demand "Act on this" band.

There is one Actions list ([AS1](decisions.md#one-actions-feature-content-gaps-from-content-pages-only)):
content-gap findings are ordinary Actions on it, and a content page's Site
Health findings and content gaps share its one Action. Every link to an
Action is `/agent/actions/{id}`. The evidence behind content gaps is in
[Content optimization](content-optimization.md).

## Explicit implementation declaration

`POST /api/v1/actions/{action_id}/declaration` records that an Action was
implemented ([implementation events](../frontend/services/api/src/opportunities/declarations.ts)).
It is anchored on the Action and, when the work came from the Agent, on the
exact output revision the user shipped; a revision from another Action's output
is refused, and null means work done outside CiteLadder. The
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
rejected. The user must reopen a dismissed Action first.

The baseline is the newest Opportunity snapshot at or before the go-live
time, never one a later refresh wrote; when none existed the declaration
records its baseline as unavailable (no snapshot, so no baseline audit), and
prompt checks keep no baseline reading. Action sync keeps each Action's last
non-empty member set (`last_member_opportunity_ids`) when a refresh clears its
members, so an Action whose findings a recrawl resolved can still be declared:
the declaration freezes that last set, and the list and detail return it as
`declarable_member_count`. An Action that never had a finding is refused. When
the refresh that cleared the members was committed after go-live, the
declaration freezes its checks as usual and the first reading after go-live
decides them; its contextual-link findings are declared without a link check,
because their suggestions left with them and none can be selected. When it was committed at or before go-live, the declaration
names that snapshot as `resolved_before_snapshot_id`, freezes no check and
queues no reading: the outcome predates the deployment and is never credited
to it. Unavailable baseline, resolved before go-live and nothing to measure
stay distinct on the declaration.

Each rule in the catalog names the `check_kind` its findings freeze (null when
nothing can measure them), and each kind is one module under
[`opportunities/checks/`](../frontend/services/api/src/opportunities/checks/registry.ts)
that freezes it, names its reading (leg) and sources, reads it from a source
and names its subject. The reading an Action detail promises per member before
declaration, the Action's `measure_with` and the legs after declaration all
derive from it, so they cannot disagree. A declaration freezes one check per
distinct expectation, each scoped to what the Action changed:

| Finding | Check | Read by |
|---|---|---|
| Site Health rule | the rule passes on the page | the next crawl that analyzes the page after go-live |
| Contextual link | the selected link is in main content | the next compatible crawl |
| Search Console (page or query) | clicks per day on that page or query rise against the rate in the last daily window that ended before go-live (sync windows differ in length, so windows compare as rates) | each synced daily window that starts after the go-live day (that day is partly before the change) |
| Keyword gap | the project appears for the search: Search Console impressions, or an owned ranking in a later Keyword Research dataset whose provider check postdates go-live; still missing or not ranking yet reads `waiting`, never `unmet` | each synced window that starts after go-live, and each later published ranking, shared or missing-keyword dataset for the same website and market |
| Prompt-targeted visibility | the prompt's composite score rises against its score in the snapshot's audit | the next audit that ran the prompt |
| Earned page | each tracked prompt whose answers cited the page: its composite score rises against its score in the snapshot's audit | the next audit that ran the prompt |
| Content gap (`owned_url_cited`) | an answer to the angle's prompts cites an owned URL: the improved page's URL, or for a new page any owned URL outside those already cited for the prompts from the gap's window start to go-live | the next default-market visibility run that asked one of the prompts |

| Per-product commerce metric (`product_metric`) | the rule's metric for the product clears its frozen target over the matched answers completed after go-live and up to the run: one appearance (`product_not_mentioned`), a median quoted price within the configured share of the catalog price (`price_mismatch`), the configured win rate (`losing_position`), one answer sending shoppers to an owned host (`merchant_absent`); fewer samples than the rule needs reads `waiting`, a missing catalog price or archived product `unavailable` | each completed audit, brand or Commerce, after go-live |

A finding nothing else can isolate — a category, a catalog field gap or a
theme, or a visibility finding with no prompt — gets no check: the project-wide score moves for
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

An `owned_url_cited` check ([module](../frontend/services/api/src/opportunities/checks/owned-url-cited.ts))
freezes its whole expectation at declaration, so a later reclustering, rematch
or prompt edit never changes what it measures: the angle's prompts the library
held at the refresh, the lineage, and either the improved page's canonical URL
or, for a new page, the owned URLs Visibility's evidence statement cited for
those prompts from the gap's window start to go-live, with the runs that cited
them. The user names no URL. When the shipped revision comes from an
**Analyze a page** chat, the page and prompts that chat was started for are
frozen as one more page check. A later run is read only when it is the default
market's dashboard-ready brand run; one that asked none of the prompts (a
prompt deleted since) or answered none reads `unavailable`, never `unmet`, and
no run yet reads `waiting`. The check says only whether a URL was cited, never
which version of the page the engine read.

An earned declaration is measured on prompts, not on the page: whether the
listing went live shows on the cited URL's page from the next reading, and the
outcome that matters is visibility on the prompts that cite it. Neither claims
the listing caused a movement.

The owner that commits a later crawl, audit (after its source-page
inspection), traffic window or Keyword Research keyword dataset calls
[`announceEvidence`](../frontend/services/api/src/opportunities/evidence-announcement.ts)
in that transaction. It enqueues the Opportunity refresh (unless Demand
re-interprets first and carries it, as for traffic and for a crawl in a project
with traffic) and
[TypeScript verification](../frontend/services/api/src/opportunities/verification.ts),
the latter only for a project with a declaration inside the verification
window; both keep their idempotency keys. The same module says when each kind
of evidence became terminal, which verification measures from. The
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
check with its latest folded state, reason and subject (`checks`; a prompt
check names the prompt's text and `prompt_id`, which links to its history in
[Visibility](visibility-prompt.md#one-prompt-over-time), and names nothing once
the prompt is deleted), the end of
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

The Actions list is grouped (AS2). Each Action's `group` is derived at read
time from its stored target kind and approach by `ACTION_GROUPS` in the
[Actions config](../frontend/services/api/src/config/actions.ts); no column
holds it, and each Action lands in exactly one:

| Group | Admits |
|---|---|
| `products` (Improve your products) | product and category targets, any approach |
| `earned` (Get mentioned elsewhere) | `earned_placement` |
| `fix_site` (Fix how AI reads your site) | `fix_technical`, `improve_links` |
| `own_pages` (Improve your own pages) | everything else: `create_new`, `improve_existing`, `consolidate`, and an undiagnosed Agent-origin Action |

`GET /projects/{id}/actions` filters by `status`, `target_kind`, `group`,
`approach`, `priority` (the band: high from 30, medium from 20, low below; an
unscored Action has none) and `family` (Source); an unknown value is a 422.
Each item carries `group` and `priority_band`. `status_counts` stay
project-wide and unfiltered (the sidebar badge); `group_counts` count every
group under every filter but the group. The screen shows each group under a
collapsible header row with its count, its top five Actions by priority and
"Show all N", which sets the group filter and pages that group with a cursor.
Every filter (Status, Group, Action type, Priority, Target type, Source) is
shareable URL state in one All filters menu (AS6), and a row opens its Action.
Overview's ranked actions link to the owning Action at
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
declaration admission, go-live bounds, the baseline at go-live, findings
resolved before and after go-live, unmeasurable findings, earned
declarations measured on their prompts, concurrent replay, workspace
isolation and frozen checks;
[owned-URL PostgreSQL tests](../frontend/services/api/test/owned-url-cited.test.ts)
cover what content-gap and Analyze a page declarations freeze and how later
runs read them. The pending integrations
follow-up may improve these read surfaces; it is not a second action store.
