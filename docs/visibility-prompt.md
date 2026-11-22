# Prompts and AI Visibility

## Responsibility

This owner connects reviewed business context to a versioned prompt portfolio,
explicit measurement admission and persisted answer-engine results.
AI Visibility measures observed mention/citation share under comparable audit
conditions. It does not measure causal impact or turn Search Console impressions
into AI prompt volume. [Onboarding](onboarding.md) owns company discovery and
confirmation; [Commerce](commerce-intelligence.md) owns typed buyer targets.

## Context, topics and generation

The [generation route](../frontend/services/api/src/routes/prompts.ts) and
[generation service](../frontend/services/api/src/prompts/generation.ts) authorize the
workspace/project, validate topic/cohort selection, gather confirmed brand
context and optional observed demand, call the configured model, then recheck
ownership and stage the admitted suggestions for review. A request may select
several topics (`topic_ids`; none means every topic). Generation does not start
an audit.

Generated prompts are **candidates**, not prompts. Each Generate request records
a `PromptGenerationRun` (request, generator version, provenance) and pending
`PromptCandidate` rows in [their own tables](../frontend/services/api/migrations/0001_baseline.sql),
so no audit, capacity/occupancy or visibility query can see a proposal. The
[staging owner](../frontend/services/api/src/prompts/generation.ts) drops texts already
tracked or already pending. The TypeScript API owns the prompt library: prompt
sets, prompts, topics, import, generation and candidate review
([`src/prompts/`](../frontend/services/api/src/prompts/)).
Native `config/prompt-library.json` owns library bounds, cohorts, write locks,
binding and generation settings; `config/api.json` owns HTTP admission limits.
Native prompt normalization owns persisted identity. Generation defaults
resolve at use time.

The **Prompt Builder** (its own page under Prompts, below) is where people
shape generation: business facts, topics, distribution, search seeds and count,
each prefilled from saved data. It samples the broad market by default: the
category's buyer questions across offerings, stages, intents and personas, with
places only where the market scope calls for them. The Agent's Prompt discovery
skill writes no prompts: it plans a run for the builder, and over MCP it runs
the builder's steps through the same endpoints (below).

A request asks for at most `GENERATION_MAX_COUNT` (50) questions. Draft batches
run with bounded concurrency (`GENERATION_DRAFT_CONCURRENCY`) under a request
deadline (`GENERATION_DEADLINE_SECONDS`, below the edge proxy's limit) that stops
starting batches and cuts in-flight ones; what was admitted is judged and
staged, and `shortfall_reason` reports `deadline`. A provider error in a later
batch is recorded in `model_results` without discarding earlier drafts
(`model_error`); only a run with nothing admitted fails. An `Idempotency-Key`
header is stored in the run request: a repeat within candidate retention
returns that run's still-pending candidates from persisted rows without provider
I/O, and a key reused for another request is a 409. The context read selects
named columns. A deployment without a model reports that generation is not
available, without operator configuration names.
`POST /prompt-sets/{id}/candidates/review` takes `accept_ids`/`reject_ids`:
accept runs prompt-slot occupancy
([`src/entitlements/`](../frontend/services/api/src/entitlements/)) and the
conflict-safe insert under the project, prompt-set and account capacity locks,
copying run provenance and the candidate's validation into
`generation_evidence`. Reject removes the
candidate from review: it is deleted, or, when it carries a quality-judge
decision, kept as a text-free `rejected` outcome record (decision, topic and
admission record, no question text) for calibrating the judge. An
over-allowance accept writes nothing. Unreviewed candidates expire after
`GENERATION_CANDIDATE_RETENTION_HOURS` and outcome records after
`GENERATION_REJECTED_OUTCOME_RETENTION_DAYS`; expired rows are hidden and
purged by the next generation or review. The Prompt Builder's review step shows the pending list with
select-all and **Reject selected**, and its footer's **Track** accepts the
selection; within a run, rows
the quality judge flagged are listed last with advisory labels and stay
selectable.

Topics may have one level of subtopics (`Topic.parent_id`, same project); a
subtopic cannot have children, and deleting a parent promotes its subtopics.

The [business map](../frontend/services/api/src/projects/business-map.ts), edited in
the Prompt Builder's first step and Agent → Context → Business map with one
shared editor and save, and
stored in `BusinessContext.business_map`, lists per confirmed offering its
attributes, situations/constraints and audiences, plus excluded pairs that never
combine. Generation reads no excluded pair, and no screen edits them; the
builder keeps saved ones and drops a pair when an entry it names is removed. Entries carry origin and review state: a
model suggestion stays `suggested` until a person confirms it, and edits keep
each surviving entry's provenance. When a Generate request selects topics
covering offerings (by name, or by the offerings a recovered topic was proposed
from) with absent or facet-empty map entries, one bounded model call
([map suggestions](../frontend/services/api/src/prompts/generation-drafts.ts)) proposes
them; they ground that run and are stored `suggested` with model identity and
the generation run id, only for offerings still empty at write time, and never
naming the brand or a competitor. Each suggested value names one property,
circumstance or audience: a suggested value containing a comma or a
`disjunction_words` entry is dropped. A failed suggestion call leaves the
planner's fallback facets (below).

Onboarding creates no prompts or topics; a created project starts with an
empty prompt set and the user chooses what to track. Generation uses existing
topics; a quick run in a project with none first recovers starting topics from
the saved products/services, whatever their review state (onboarding saves the
ones its reader just reviewed as unreviewed). No saved offerings fails before
provider I/O. A request naming `topic_ids` never recovers topics: named topics
must already belong to the project, which the context read checks before any
model call.

Onboarding research keeps a bounded offering harvest of things a customer buys,
hires, books or enrolls in as reviewable evidence. [Topic
proposals](../frontend/services/api/src/prompts/topic-proposals.ts) turn the
saved offerings into the buyer-facing categories they fall into, never
product-line or model names: one bounded model call (`topic_calls`, reserved
from the agent-call bucket and made outside any transaction) proposes
categories, and deterministic code keeps only those naming a saved offering
and sharing a word with its offerings or category vocabulary; it strips
specifications, the brand and product-line names, caps and merges names by
config. An offering no kept category covers is proposed from its own cleaned
name; a model failure or deadline falls back to the offerings alone. Topics are
inserted under the project lock only while the project still has none, at most
`topic_max`; the rest are reported as overflow, and the source,
model identity, created, overflow and dropped proposals (with reasons
`unsupported`, `empty`, `branded`, `existing`, `merged`) are frozen in run
provenance as `topic_recovery`. The same transaction records which saved
offerings each created topic covers in `business_context.topic_offerings` (by
topic id), so the planner gives a category its offerings' business-map facets
whatever it is named. Topic names must be bounded and brand-neutral,
and admitted topics receive canonical UUIDs.

The Prompt Builder previews proposals without writing:
`POST /projects/{id}/topics/preview` (run capability, metered and reserving
`topic_calls` like recovery) runs the same proposal beside the existing topics,
so it fills gaps and never replaces them, and returns the kept proposals with
the offerings each covers plus the overflow past `topic_max`. A project without
saved offerings is a 422 before provider I/O. `POST /projects/{id}/topics/confirm`
(write capability) applies the reviewed plan, deletes, renames and creates, in
one transaction under the project lock: every named topic must belong to the
project, a name collision fails the whole plan, and created topics record their
offerings in `business_context.topic_offerings` exactly as recovery does.

Topic distinctness uses singular-normalized token identity, not character
similarity: men's and women's departments must not merge because their spellings
are close. The provider-restatement rule rejects a name only when every token
is provider vocabulary; containment would incorrectly reject School Uniforms.

The [universe planner](../frontend/services/api/src/prompts/generation-plan.ts)
plans `count × GENERATION_OVERGENERATE_FACTOR` cells over the selected topics.
Within each cohort every topic gets a cell before any gets a second; then
topics share cells by weight (highest averages), a topic's weight being the
number of saved offerings it covers (`business_context.topic_offerings`, one
when none are recorded), so the category holding most of the catalogue gets
the most cells. Equal weights plan round-robin. Every cell carries exactly one buyer constraint from the first
cell on: the topic's least-used attribute, situation/constraint or persona
(least-used value, then least-used dimension, confirmed values before
suggestions). A branded (`brand_diagnostic` or `comparison`) cell asserts
something about the business, so it never takes an attribute only a model
suggested: it takes confirmed attributes, situations and personas. A
`brand_diagnostic` cell also carries `grounded_attributes` (the topic's
offerings and confirmed attributes) for the judge; drafters do not receive
that list. Personas are the run's requested personas, else the map's
audiences plus inferred buyer roles (as suggestions) while the map has no
confirmed audience. A topic without map facets, including a subtopic whose
parent has none, falls back to the requested personas, else the buyer roles and
every audience the business map lists; only a business with none of these plans
bare cells, never invented facts. Because a cell holds one facet, an excluded
pair never combines. A market attaches only to the reviewed
`market_scope`'s `location_policy` share (local 0.5, regional 0.25, national,
global and unknown 0), drawn from `service_areas`; a national business's service
areas never become wording. A topic draws facets from the map named like it
(whose offering labels its cells), else from the maps of the offerings it was
recovered from (its cells keep the topic's own name), else from its parent's.
Each cell's evidence records where its facet came from: `confirmed` by a person
in the map, `suggested` by a model or inferred buyer roles, `requested` as a
persona for this run, or `not_applicable` without a facet. Selection prefers
confirmed and requested facets.

The buyer stage is a label over `planned_stages` (awareness, consideration,
decision; `implementation` stays in the stage vocabulary for manual prompts but
is never planned): each topic first covers every weighted stage once, then the
run keeps the stages' proportions. Each slot carries its cell as `buyer_need`
and the intents that suit its stage as `target_prompt_intents`.

A Generate request may carry a `distribution`: `branded_share` and
`comparison_share` (summing to at most 1; core takes the rest) plan
`brand_diagnostic` and `comparison` cells beside core ones, an `intent_mix`
(informational, commercial, transactional weights) weights the awareness,
consideration and decision labels, and up to `distribution_personas_max`
personas replace the audience facets. A distribution keeps the request's
cohort as core; a comparison share in a project without accepted competitors
fails before provider I/O. `run_context` (at most `run_context_max_chars`) is a
note for this run only, sent as reference data and never a business fact.
`seed_source` (`search_console`, `search_intelligence` or `none`) and optional
`seed_query_ids` restrict which persisted searches ground slots; omitted, every
source grounds. They are part of the idempotency request and frozen in run provenance.

A request with `mode: brand` plans **brand prompts**: questions that ask about
the brand directly, so every run returns answers that describe it. Each cell
takes one angle from `config/brand-prompts.ts` (recommended for one confirmed
need, pros and cons, reasons not to choose it, worth the price, reviews, and a
comparison naming one tracked competitor, planned only when the project has
one) over the selected topics and their offerings, under a drafting instruction
of its own that asks and never states a fact about the brand. A diagnostic
angle is a `brand_diagnostic` cell and the comparison a `comparison` cell, so
admission, the judge, staging and review are the market run's; every brand cell,
comparison included, is judged for grounded claims, and selection spreads
angles instead of applying cohort quotas.
Brand drafts carry the `evaluation` intent, which the Prompts filter and
`read_prompt_portfolio` select on. Between drafts of one run the near-duplicate
check counts the angle as a token, so two angles on one offering are not
duplicates; against tracked and pending prompts it compares the text alone. A brand
request takes no cohort, distribution or seeds and asks for at most
`max_per_run`; it is refused before provider I/O when tracked plus pending
evaluation prompts would pass `max_per_project`, and staging trims to the room
left under the project lock. Metering, budgets and prompt-slot occupancy are
the market run's. Accepted, they are ordinary prompts in their cohorts, so
audits and perception labelling read them unchanged.

Draft batches receive a narrow brief (category, category terms, offerings,
business model, buyer type, market scope, language and country, with their
review provenance, plus any `run_context`), the batch's cells and tracked texts
for de-duplication only: no profile prose, knowledge-base sources, demand
signals or earlier drafts. Only a `brand_diagnostic` batch's brief carries the
brand name, and only a `comparison` batch's also carries the accepted
competitors. Each batch holds one cohort, and a topic's cells travel in the
same batch, so siblings are drafted against each other: a batch may run a
little over the batch size rather than split a topic, and only a topic with
more cells than a whole batch is split. The agent-call budget a run needs is the sum,
over cohorts with a share, of its cells divided by the batch size (rounded up),
plus one refill and the map call. The one exception to the narrow brief is
grounding: the
[observed-query loader](../frontend/services/api/src/prompts/observed-queries.ts)
reads the project's persisted Search Console queries (latest query snapshot,
`observed.gsc_window_days`, summed impressions at least
`observed.gsc_min_impressions`) and the keywords of the latest published
Keyword Research dataset of each `observed.si_dataset_kinds` kind in the
project language. It keeps non-branded (branded and ambiguous classifications
drop), competitor-free, query-shaped searches bound to a topic by shared
tokens, at most `observed.max_per_topic` per topic, Search Console impressions
before keyword volume. Nothing is fetched, and impressions or volume only order
searches; they are never AI prompt volume. Each planned slot gets up to
`observed.examples_per_slot` same-topic searches, closest to its cell first,
sent as `buyer_search_examples` text (no row identities) with a rule that they
are examples to learn buyer wording from, not to copy. Without search data the
plan, brief and request are unchanged. `GET /projects/{id}/seed-queries` lists,
per source with persisted data (a Search Console query snapshot, or a published
grounding dataset in the project language), the searches this loader would
keep, each with its topic and no impressions or volume; the Prompt Builder
shows them so people can untick any. The model writes a natural question per cell, names a place
only in a cell with a market, and labels buyer stage, prompt intent and
`names_place`. Generated buyer scenarios are hypotheses, not observed demand or
new business facts; cell provenance records that distinction. Map suggestions
never keep a value that names the project's places.

Admission runs before any quality judgment: known slots, topic ownership,
allowed labels (a planned core row's intent must suit the stage it is labelled
with, and a quick core row's stage must be a planned stage), cohort identity,
normalized exact duplicates, the shared length bound, at most `text_max_words`
(16) words (`too_many_words`), one need per prompt (`two_needs`: a core or
diagnostic draft containing a `disjunction_words` entry of the project's base
language, English "or"; comparisons ask "X or Y" by design, and other
languages rely on the judge), advice (`advice`: a core draft the drafter
labels `general_advice`, or containing an `advice_phrases` frame of the
project's base language such as "how to" or "what kind of"; a buyer question's
best answer recommends specific, named products, services, brands or
providers, never general advice, ideas or kinds of things, and these frames
hold in every industry), topical binding (service areas do not bind
generated or proposed text), a place named in a cell without a market
(`location_unplanned`, decided on the project's geography vocabulary with the
model's `names_place` label recorded beside it), texts already tracked or
pending, exact copies of any observed search the run read (demand-signal
queries and every grounding search), and last `near_duplicate`: a text whose
content-word overlap (Jaccard over singular-folded non-stopword tokens) with a
tracked, pending or earlier admitted text reaches `near_duplicate_jaccard`.
Staging rechecks near duplicates against tracked and pending texts written
after the context read.
Core queries cannot name the tracked brand, aliases or supplied competitors
under the project's mention rules (below); diagnostics name the brand and
comparisons also name an accepted competitor. The judge sees the planned cell,
not the business's service areas.
[Selection](../frontend/services/api/src/prompts/generation-quality.ts)
keeps at most `count` after judgment, split into per-cohort quotas by largest
remainder with no cross-filling between cohorts, preferring passing judgments
while treating uncertain and unjudged candidates equally, then every topic
once before any twice, then topics by the planner's weights, then spread
across stage (not when an intent mix sets the stage proportions), intent,
audience, situation, attribute and market; a
shortfall is reported, never filled. Run provenance records `distribution`
(counts by cohort, stage, intent, offering and persona, and located and bare
drafts, bare meaning no facet besides offering and market) for
admitted and selected drafts, measured by
[generation metrics](../frontend/services/api/src/prompts/generation-metrics.ts),
which also scores calibration sets (`pnpm prompts:eval --live` is the
operator-only live run, never in CI; `--mode brand` scores brand prompts for
shortfall and angle coverage). `candidates_generated` counts what passed
admission and is never a market size. Every dropped row is counted under the
first admission rule it broke (`admission_drops`, also frozen in run
provenance), and the Prompt Builder and agent handoff show that breakdown.
Drafts are written in the project's `language_code`, using English when it is blank. Each candidate keeps its cell in
`evidence_refs`, plus one `{kind: 'observed_query', source, id,
classifier_version, override_id}` per grounding search of its slot (the
branded-query classification that admitted it), copied into
`generation_evidence` on accept. Run provenance records `grounding`: counts of
the searches attached to slots by source, `slots_grounded`, `searches_read`
(every search admission checked copies against) and those attached refs.
Candidates, the review list and `read_prompt_portfolio` expose only
`grounded`; the review list tags those "Informed by your search data". The
calibration report splits review outcomes by grounded and ungrounded, and
`pnpm prompts:eval --live --grounding off|on|both` reports `observed_likeness`
(share of prompts phrased like a same-topic fixture search without copying it)
beside the threshold metrics.

The [quality judge](../frontend/services/api/src/prompts/generation-quality.ts) runs
through the [JEV connector](../frontend/services/api/src/models/jev.ts) when
`JEV_API_KEY` is set (blank is off;
[decision](decisions.md#billing-and-metering)).
It judges the admitted draft pool within the configured call cap, one call per
draft: yes/no fit, buyer relevance, decision value, naturalness, standalone,
sensibility and one need (`single_need`: no two settings, audiences or
requirements joined or stacked), plus for core candidates whether a good
answer recommends specific, named products, services, brands or providers
rather than advice, ideas or kinds of things (`names_a_business`) and for brand diagnostics
(not comparisons, whose competitor the judge's state cannot tell apart)
whether the question attributes to the business only what its cell's
`grounded_attributes` state (`grounded_claims`); intent and stage labels
recorded beside the model's; a per-topic duplicate choice among tracked and
earlier candidates; and, when the run spans several topics, which selected
topic the question is about. In gate mode a draft the judge places under
another selected topic with at least `topic_refile_at` (0.6, provisional)
probability is filed there, keeping its planned cell, and its decision records
`refiled_from_topic_id`; shadow mode only records the choice. Its state omits
the brand and competitors. Each decision stores model, question-schema and policy versions,
the thresholds it was judged under and a state hash, so an identical judgment
already recorded in the set is reused (re-flagged for the new candidate under
the current policy; the stored decision is never rewritten).

The [gate policy](../frontend/services/api/src/prompts/generation-quality.ts) gives each
decision a verdict. **Fail**: a yes/no answer below `JEV_FAIL_BELOW`, a
duplicate choice at or above `JEV_DUPLICATE_FAIL_AT`, or a core draft whose
judged intent is one of `core_advice_intents` (learn, implement), flagged
`advice_intent` whatever the drafter labelled it. **Uncertain**: an answer
below `JEV_FLAG_BELOW`, a duplicate at or above `JEV_DUPLICATE_FLAG_AT`, or a
missing answer (`incomplete`); the row is shown flagged. **Pass**: everything
else. With `JEV_MODE=gate` (the default) a failed candidate never reaches
review: it is stored only as a text-free `gate_rejected` outcome record and
counted in `quality_rejected`. Selection can use other surviving drafts from
the same pool; any remaining shortfall is reported without a rewrite loop.
`JEV_MODE=shadow` records and flags without removing anything. The thresholds
(policy `jev-gate-1`) are provisional until calibrated from review outcomes
with `frontend/services/api/src/prompts/calibration.ts`, an aggregate, text-free operator report; a
threshold change bumps `policy_version` in `config/jev.ts`. A JEV failure never removes
the candidate it failed on: it reports `quality_gate="unavailable"`, that
unjudged candidate stays reviewable, candidates judged in the same request are
still gated, and generation still succeeds. A duplicate choice that was not
offered, or an answer outside [0, 1], counts as unavailable (`incomplete`). JEV calls are bounded by
`JEV_MAX_CALLS_PER_GENERATION`, not the agent-call bucket. Exhausting that cap
reports partial unavailability; unjudged rows never claim to be checked.
Length is a 16-word admission cap with a 6–12 word calibration target; there
are no opening quotas or automatic rewrite loops.

Generation evidence freezes buyer-query policy, generator, slot,
context/source and actual provider/model provenance; historical prompts are not
rewritten by a newer generator.

## Prompts page, manual entry and CSV import

Every generated prompt comes from the generator, so all wording rules live in
the generation configuration. The Agent's Prompt discovery skill never writes
prompt text or a proposal of its own:

- In the Agent it saves a **prompt plan** following the builder's steps (facts
  to fix, topics to keep or change, mix and search data) and offers **Open
  Prompt Builder** (`/prompts/build`); the Agent stays read-only.
- Over [MCP](mcp.md), a connection with Allow changes runs the steps through
  the builder's own owners: `get_project_business_context`, then
  `preview_topics` and the `confirm_topics` change, then `read_seed_queries`,
  then the `generate_prompts` change with the agreed distribution and seeds,
  each change confirmed against its preview. Candidates stay staged; only a
  person's Track in the Prompt builder activates them.

The Prompt Builder is the page `/prompts/build`: four steps down the left (the
current one in the address as `?step=`, done ones reopenable), a fixed footer.
Each visit is a fresh session, and nothing it edits is written until its step
saves or confirms. A generation run still in flight from an earlier visit keeps
Generate pending, so it is never paid for twice.

1. **About your business**: the offerings grid (each offering's audiences,
   situations/constraints and attributes as multi-value cells), then buyer
   roles, service areas (only for a local or regional `market_scope`),
   category terms, jobs to be done and business model; plus a one-line
   `run_context` for this run only. A list discovery inferred (its
   `field_sources` entry is not `reviewed`) and a `suggested` map entry are
   drafts until accepted; accepting sends the field unchanged, which the API
   records as reviewed. Save sends only changed or accepted fields to the
   brand-profile update, then the business-map update.
2. **Topics**: the existing topics plus proposals from the preview, with
   "+N more" for the overflow. People rename, remove or add; Confirm sends one
   plan.
3. **Distribution**: count; the unbranded, branded (default 20%) and
   competitor-alternative shares as one split (no competitor part without a
   tracked competitor), so they never pass 100%; the intent mix (default
   25/50/25) as a second split; both move in 5% steps. Then personas from
   step 1, and the search source (each source
   with persisted data, or none) with its seed queries grouped by topic and
   untickable. Edits not yet saved or confirmed are named as unused by this run.
   Generate sends every field for all topics. A **What to generate** choice
   above them switches to brand prompts (`?generate=brand`): a count up to
   `brand_prompts_max` and its spend (`brand_generation_calls`) replace the
   splits, personas and search data. The Perception Brand tab links there while
   fewer than the classified minimum of answers describe the brand.
4. **Review**: the candidate review with a coverage line per topic and per
   segment (cohort) against the request, on target, short or empty, counting
   what this session drafted. "Generate more" on a short or empty line reuses
   the request narrowed to that topic's `topic_ids` or that segment's share.

`/prompts` opens directly on the prompt library: every prompt of every prompt
set in the project, with adds going to the main brand set
([decision](decisions.md#prompts-and-visibility)); a row
names its set when the project has more than one. The table shows each prompt's
latest measured visibility and owned citation rate. Those figures come from `GET /visibility/prompts?latest=prompt`
([per-prompt latest](../frontend/services/api/src/visibility/prompt-latest.ts)):
each prompt's own latest scored brand run in the default market, so a run of
other prompts never hides an earlier result. The library shows every cohort a
run scores (core, comparison and brand questions), each prompt in its own;
headline totals elsewhere keep counting core prompts only. Change compares a
prompt's latest measurement with the run that measured that same prompt before
it: a first measurement reads Not applicable, and a pair whose frozen
comparison key, text, versions or answers do not allow it reads Unknown, never
zero. Commerce runs write no per-prompt scores, so a Commerce prompt has no
figures here. The same read carries every brand named
and every domain cited in that measurement's answers, from the persisted
mentions and citations: the Sources column and the Brands and Sources filters
read only them, so a prompt no run measured matches
neither filter, and one with no completed answer shows its sources as unknown,
not none. **Launch run** reuses the shared launch dialog and its
admission/funding checks and stays disabled until the project has an active prompt.

Users control generation end to end in the Prompt Builder
([decision](decisions.md#prompts-and-visibility)). Outside the builder, a
manual or imported prompt asks only for its text and topic: theme,
intent and cohort are never required, never a user-facing validation
error, and defaulted in code when absent. The prompt table shows branding,
intent, buyer stage and persona as tags with filters; editing a prompt can
correct its text, topic, intent, buyer stage and persona (`persona_max_chars`),
never its cohort. An accepted generated prompt takes its persona from the
business-map cell's audience. A manual or imported prompt without an explicit
cohort is filed by [brand filing](../frontend/services/api/src/prompts/brand-filing.ts):
naming the brand files it as `brand_diagnostic`, or `comparison` when it also
names a competitor; otherwise `core`. Tags are not part of the audit
prompt-panel hash, so correcting one keeps the comparison series.

CSV import clips or defaults optional columns rather than rejecting them; the
upload's column, row and cell-size bounds still reject a file before parsing
(`import_max_rows` in `config/prompt-library.json`). The
[browser parser](../frontend/lib/prompts/csv.ts) is the one CSV reader: it
previews and posts parsed rows (the endpoint accepts only rows), and the
dialog's sample file is generated from its column contract. Under the project
lock, [import](../frontend/services/api/src/prompts/prompts.ts) matches topic
names case-insensitively, creates unknown names as manual topics only for rows
that insert, and imports a blank topic unassigned. A binding or capacity failure
rejects the whole import; duplicate rows are skipped while the rest import.
A topic delete unassigns its prompts and promotes its subtopics.

Manual create, text edits, activation, moving an active prompt to another topic
and import pass
[topical binding](../frontend/services/api/src/prompts/binding.ts): the text
must share a non-stopword token or exact phrase with the project's identity
(brand and aliases, owned domains, topics, brand profile) or with the prompt's
own topic; an empty vocabulary fails closed. Create binds under the project lock. Tokens keep every script's letters
(Latin diacritics fold) and scripts written without spaces are split at ICU
word boundaries; stopwords are English-only. Generation admission applies the
same rule to drafted and proposed text.

## Audit admission and execution

Provider error bodies do not become public failure details. A stored schedule
that becomes due enters the same admission path as a manual launch
([creation owner](../frontend/services/api/src/audits/creation.ts)). Users
select logical engines and repetitions, not transport measurement modes. Every brand/Commerce/manual/scheduled/repaired audit uses
the approved citation-capable policy.

Manual launches and failure reruns start a separate, workspace-authorized
`POST /audits/{audit_id}/run` after admission. It claims only that audit's tasks
through the existing worker, starts due work immediately, and retains provider
capacity limits, due times, cancellation and queue recovery. The request has
config-bounded admission and execution budgets; remaining tasks and future
provider polls continue through the runner.

A failure rerun (`POST /audits/{audit_id}/rerun-failures`) creates a repair
child under the same workspace enqueue lock as a launch and passes the same
abuse controls: the active-launch limit (429 with `Retry-After`) and the daily
task budget. It does not count as a manual run. Repeating the same task set
returns the existing child; a selection overlapping a repair child that is
still active answers 409.

Admission freezes prompt text/cohorts, roster, model/retrieval identity, request
configuration and relevant versions. benchmark_mode is prompt framing, not a
provider policy. Funding/occupancy is checked by
[billing and entitlements](billing-entitlements.md). A provider-free estimate
counts the prompts the launch would run (active, enabled and within the plan's
prompt slots); it does not authorize execution or establish measured cost.
Manual HTTP launch uses customer credentials; funded admission is reserved for
trusted billing/trial callers. Cancelled funded runs release unused task credits
but retain their admission quote against the monthly funded cost ceiling.

The [audit worker](../frontend/services/api/src/audits/worker.ts) claims PostgreSQL
tasks with leases, heartbeats them and holds provider capacity; one
[surface adapter](../frontend/services/api/src/audits/surfaces/adapter.ts) per route
`surface_kind` (`llm`, `search_ai`, `llm_scraper`) owns the frozen request, dispatch
phase, recovery deadline, capacity pool and persistence. Each phase commits before I/O
and records immutable response artifacts,
attempts and citation evidence. Cancellation, retries and reconciliation use
the existing audit/task state owners; failed answers remain failures, not
negative brand observations. An API exchange with no answer text fails its
attempt in the shared [answer execution](../frontend/services/api/src/answer-engines/execute.ts)
for every engine: `truncated_before_answer` (budget spent before any text) and
`empty_answer` retry under the transient policy, `content_filter` does not, and
an exhausted task stays failed. An exchange the provider reports as failed,
cancelled or paused (Claude `pause_turn`; a Gemini interaction still in
progress or awaiting continuation) fails as `answer_unfinished` under the
transient policy, whatever text it carries; a Gemini `completed` interaction
without text is still `empty_answer`. Non-empty text cut off by the budget is still an
observation and keeps its `length` finish reason. A Claude answer is the text
after its last web search, joined exactly as written: the search preamble is
not answer text, and a sentence split across citation blocks stays one sentence. All engines share the frozen
`audit_max_output_tokens`; Anthropic thinking counts against it, so the
Claude route's `anthropic_thinking` (provider config) turns thinking off for
answer capture instead of raising the budget. Provider costs and
successful-answer billing are different projections.

The audit runner lane keeps `min(worker_concurrency, RUNNER_DB_POOL_SIZE - 1)`
tasks in flight, refilling each slot as a task settles until a claim finds
nothing, the runner stops admitting or `claim_window_seconds` ends; it runs
alongside Site Health rather than after its claim window. It wakes for the
earliest due retry, capacity wait or provider poll (`AuditQueue.nextDue`), not
only on its idle tick. A task with a
submitted paid search-surface request is bounded by its poll ceiling or recovery
deadline, never the run cap, since retrieval is free and the query is already
paid. The worker caches the workspace access check for a short TTL
(`access_check_ttl_seconds`); the per-task ownership lock is never cached. It
finalizes an audit only once no task is open. The run's metric snapshot also
records its owned citations (count and exact citation IDs), the persisted fact
behind the [AI Traffic](ai-traffic.md) Overview figure. Lease recovery and stuck-audit
repair run in the periodic `audit-maintenance` lane, not in the worker.
Attempts per task default to the `max_attempts` setting.

A schedule disabled by repeated failures stores the real admission error (for
example an ended trial or exhausted budget); a retryable refusal (the
active-launch limit or the daily task budget) holds the same occurrence until
its `Retry-After`, keeping the cadence anchored, and never counts as a failure. The schedules list shows it as
the pause reason and offers Resume, which re-enables the schedule and resets
its failure count. Schedule patches validate cadence and interval against the current locked row;
omitted values retain the persisted scope and configuration. Nullable scheduling
fields may be cleared, while required fields reject null. Reads do not advance
or repair schedules. The [native scheduler](../frontend/services/api/src/workers/audit-scheduler.ts)
owns leases and run state; claim, finalize and schedule edits serialize on the
schedule row. The [maintenance owner](../frontend/services/api/src/audits/maintenance.ts)
independently reconciles expired leases and unused funding. DataForSEO submission
intent commits before the paid request; uncertain submissions remain uncertain
and are never automatically resubmitted. A submission DataForSEO refused for its
rate limit (`rate_limit_status_codes`, reported in the body, never as HTTP 429)
created nothing and is sent again after a retry delay, without spending an
attempt. Known task IDs use free result polling.
A DataForSEO refusal of the account itself (paused, unfunded or unsubscribed:
`account_unavailable_status_codes` in `dataforseo.json`) fails that answer as
`provider_account_unavailable` and pauses the connection for
`DATAFORSEO_ACCOUNT_PAUSE_MINUTES` (default 60). Until then its queued answers
fail with the same code before any provider call, other engines in the run
continue, and the connection resumes on its own once the pause ends.

Manual launch offers six independent engines (`config/providers.json`); saved
schedules retain their engine IDs. One customer DataForSEO credential serves all three consumer surfaces. New and
updated connections receive the routes together. Existing connections can be
provisioned explicitly with the credential-admin-only
`POST /api/v1/provider-connections/{id}/provision-dataforseo-routes`; it adds missing
routes without reactivating disabled routes or acquiring provider data.

The scrapers submit the literal tracked prompt using normal-priority Standard
tasks and collect Advanced results. ChatGPT requests web search; Gemini receives
no ChatGPT-only settings. Every DataForSEO surface uses the project's frozen
search context (US, English, desktop by default), validated against the location,
language and device lists in `dataforseo.json`; unsupported contexts and over-long
prompts fail before submission. API engine IDs and Google AI Overview presence semantics remain separate.
Scraper model reports are supplementary provenance, distinct from the frozen product.

Paid provider tasks retain their committed submission/account identity across
restarts. Uncertain scraper submissions use exact-tag, product-checked, bounded
paginated reconciliation. The config-owned recovery deadline runs from committed intent. A paid
submission whose receipt failed to save stays leased, so lease expiry reconciles it by its tag. Recovery never resubmits a
paid task; unrecovered tasks fail without negative brand observations. Known
submission charges remain recorded even when retrieval fails: the failed task
keeps a failure artifact carrying the reported charge and its cost projection,
on the scraper and Google AI Overview surfaces alike, so the funded budget and
internal costs count the paid request.

Scraper citations use root and nested sources, canonicalized and deduplicated.
Ad items (`chat_gpt_ad`) are skipped by the source walker and the answer-text
fallback, so a paid placement is never a citation or answer text; see
[Ads in AI answers](#ads-in-ai-answers).
Retrieved sources are their own evidence kind, distinct from citations: the
artifact keeps `retrieved_sources` (null when the surface does not expose what it
read) and analysis writes `retrieved_sources` rows with `retrieval_observed` on
the response analysis. The OpenAI API requests `web_search_call.action.sources`;
Anthropic reads its `web_search_result` blocks; the DataForSEO ChatGPT and
Gemini scrapers read `search_results` (ads skipped). Gemini API grounding and
AI Overview expose no retrieval and stay not available, never zero. Provider
brand entities remain raw supplementary evidence, and nothing records
query-to-source associations. Query fanouts use
only returned query text, distinguishing unavailable evidence from an explicitly
empty query list. Neither state claims that no search occurred. Each exact
query's count and the tracked brands it names are a per-run fact finalization
writes (`audit_fanout_terms`, with the previous comparable run); the read counts
share and change under the tab's filters, and a run finalized without them reads
its brands as not counted. Answer formats and in-text links
settle on the response analysis from the scraper envelope; non-scraper engines
are not applicable. Accepted scraper
submissions use their frozen recovery window even after the ordinary run deadline;
new submissions and API tasks remain subject to that deadline. Recovery listing
calls share a separate account-wide rate limit across both scraper products.
Live-provider
acceptance remains a separate, explicitly authorized release step.

### Measurement markets

A project measures from its default market, its own `country_code` and
`language_code`, and from any additional markets in `project_markets` (the
[markets owner](../frontend/services/api/src/projects/markets.ts); country plus
language only, one `market_slots` occupancy slot each). A market id of `null`
means the default everywhere. Prompt wording that names a place is separate
from the measurement market: a prompt about Sydney can be measured from the US.

A launch (`market_ids`, default `[null]`) admits one audit per market in one
transaction under a shared `launch_id`; the launch counts once against the
active-audit and manual-run limits. Each audit freezes its market: the model
APIs get its country through web search `user_location` and the localized
instruction, and the DataForSEO surfaces get its location and language. The
reviewed [locations file](../frontend/services/api/src/config/dataforseo-locations.json)
says which countries each surface supports and which market languages it
offers (a regional variant such as `pt-BR` searches in its primary subtag;
a language the surface does not list refuses the market, never falls back to
another language; a market without a language searches in English); it is regenerated
only by the operator CLI `pnpm dataforseo:locations` and a reviewed pull
request, never at request time. Each engine's `market_support` in
`providers.json` decides admission: an unsupported search surface refuses the
whole launch with 422 `market_unsupported` before any spend, and an engine with
no location control (the Gemini API) is not applicable outside the default
market, recorded as `not_applicable_engines` and never run, failed or billed.
The estimate sums each engine over the markets it can measure. A schedule
stores `market_ids`; deleting a market drops it from schedules (an emptied
schedule measures the default), while its past runs keep their frozen market.

## Measurement and comparisons

[Analysis](../frontend/services/api/src/analysis/) derives versioned persisted metrics from
the selected evidence. The [visibility readers](../frontend/services/api/src/visibility/)
project source and prompt outcomes and brand and competitor rankings from them.
Mention, citation, recommendation identity, citation URL and
rank remain distinct observations. Unsupported entity assessments are
unavailable, not absent.

A name counts as a mention under the project's
[mention rules](../frontend/services/api/src/analysis/entity-matching.ts), stored in
`BusinessContext.entity_matching` and edited per brand and competitor in the
project edit panel. `always` counts every whole-word occurrence; under
`context_required` an occurrence counts only with a context term within
`context_window_tokens` of it, and an occurrence inside an exclusion phrase never
counts. A name that is one common word (`common_noun_names`, the generator's
common words or binding stopwords) defaults to `context_required`, seeded from
category terms and offerings; only rules a person changed are saved. Admission
freezes the effective rules into the audit configuration, analysis reads that
frozen copy, and the comparison key includes it. One
[matcher](../frontend/services/api/src/analysis/aliases.ts) serves scoring, entity
assessment and generation admission; text in scripts written without spaces is
word-segmented first, so a Chinese, Japanese or Thai name inside a sentence is
found. Words join only through a configured name or alias (AR-6): "Ace
Hardware" also matches "acehardware", but separate words in the text never join
to spell a name, so "your sales force" is not Salesforce unless "Sales Force"
is one of its aliases. These semantics are `grounded-analysis-v1` and `entity-assessment-1`. Source-pattern and Opportunity mapping stay in
[Opportunities](opportunities.md).

**Visibility** means the brand mention rate everywhere: the share of answers
naming the brand. The weighted composite is the per-prompt **prompt score**
(weights and scoring version in `config/audits.json`). When nobody is named in a
prompt's answers, its competitive component is not applicable and its weight is
redistributed, rather than scoring as a loss to every rival. Share of voice has
one definition, mention-level, used by the tile, its change line and trends.
Brand rank is null when share of voice is null. **Win rate** (AV-7) is the
share of answers naming at least one tracked business that name this one first,
from each answer's persisted first-named entity (`analysis/win-rate.ts`);
untracked names never compete. No such answer is not applicable, a run finalized
before the derivation is unavailable, and pooled selections sum the counts.

Rates use their specified eligible evidence denominators. Pagination cannot
change totals, and the browser does not recompute aggregate share of voice.
Frozen model/retrieval, prompt/cohort, market (country and language) and scope
identity determine comparison eligibility. Changed measurement conditions cannot become unqualified movement.
Unknown, not-run, failed, partial and observed-zero states remain distinct.

## Answer perception

[Perception](../frontend/services/api/src/perception/) classifies how a brand-audit
answer portrays each tracked business it names. It is always on and
platform-funded through the default Agent gateway (`DEFAULT_AGENT_*`); it draws no
customer credits. Policy, caps, the project-theme limits and the templates live in
[`config/perception.json`](../frontend/services/api/src/config/perception.json).

- **Categories.** Each aspect carries a category and a short attribute in plain
  buyer words (AV-39). Categories are the project's
  [`project_themes`](../frontend/services/api/src/projects/themes.ts): onboarding
  research and Context › Themes seed them, the model is shown them on every call
  and reuses one whose name matches apart from case, spacing and punctuation, and
  a name it coins is saved with source `model`
  ([categories](../frontend/services/api/src/perception/categories.ts)) under a
  per-project advisory lock, up to the configured per-project cap; past the cap,
  or for a name that is too long, names a business or holds markup, the aspect
  files under the fallback `Other`. Probe questions ask only about research and
  user themes, so a coined category never adds probe spend. Aspects store the
  theme's id, so a rename shows on past answers, a merge rewrites past aspects and
  probe answer items to the kept theme in one transaction, and a deleted theme's
  aspects read as `Other`. Aspects are derived labels, not raw evidence, so a
  merge may move them. A merge and the labeller's save hold the same per-project
  lock, so no label is saved pointing at a merged theme; one chosen before the
  merge files under `Other` (`category_removed`). Merging a person's theme into a
  model one makes the kept theme theirs, so probes keep asking about it. A probe
  asked about the merged theme keeps that question, so its Market row drops out
  and the kept theme's row reflects it from the next probe, as after a delete. An
  aspect stored before attributes existed has no attribute key and reads
  `not_labelled`; one the model gave no usable attribute stores null and reads
  `not_found`.

- **Trigger.** At the end of the analysis transaction, an answer whose entity
  assessments name the brand or a competitor enqueues one `answer_perception`
  task on the analytics queue, keyed by the analysis and the frozen extractor
  version, so a re-derived finalize never adds a second. No network I/O happens
  in that transaction. Admission freezes the extractor, template and metrics
  versions and the gateway model into a brand audit's configuration; an audit
  frozen without them is never classified and never reads as pending.
- **Executor.** Reads are committed before the model call and no transaction
  spans it. Over the per-audit or per-workspace daily cap the outcome is
  `unavailable / platform_cap`; without a configured gateway it is
  `unavailable / model_not_configured`; a gateway model other than the frozen
  one is `unavailable / model_changed`; a task that exhausts its attempts is
  compensated as `unavailable / task_failed`. None of these fails the audit.
  The model receives, per business (brand first, competitors by first mention,
  bounded), every sentence naming it plus one either side, the brand with a
  larger character budget than each competitor; offsets are code
  points, like the entity assessment. An unparseable output is retried once,
  then recorded as `invalid_output`; a provider fault is `model_error`. The
  outcome, usage and input hash land in `answer_perceptions` with one
  `entity_sentiments` row per business sent, in the lease-fenced terminal
  transaction, unique on `(analysis_id, extractor_version)`.
- **Validation.** Deterministic: an unknown entity is dropped; a quote must be
  found in that business's own passages after whitespace normalisation, else it
  is dropped; a refused category name becomes `Other` and an attribute over the
  configured words or characters becomes null; a label below
  `min_confidence` is stored but excluded from aggregates. A business the model
  was sent but left out keeps its row flagged `model_omitted` and reads as
  `unavailable / model_omitted`, never as a `not_assessable` judgement. Drops
  are counted by reason.
- **Metrics.** Net sentiment is (positive − negative) / classified × 100, with
  `mixed` in the denominator only, always paired with "N of M mentions
  classified". Pending, unavailable (by reason), not assessable and low
  confidence are counted separately and never read as zero. Theme counts are
  served for every named business: per theme, the classified mentions raising
  it, which Brand → Perception shows as each brand's share of its own classified
  mentions, too few below the configured minimum (AV-6); per category, its
  counts and its most raised attributes, with a few quotes for the brand only. The theme list,
  negative quotes and the domains cited alongside criticism (never called a
  cause) stay brand-only, and the app shows no competitor quote; the
  recommended rate comes from the deterministic first-mention
  assessment (English phrasing only). Trend points carry their versions; a
  version or frozen-model change marks the point not comparable.
- **Reads.** `GET /visibility/perception` and `/visibility/perception/quotes`,
  the `perception` field of execution evidence, and the `read_perception` tool.

### Market probes

- **Scope.** A probe launch is one audit per market in the `probe` audit scope
  sharing a `launch_id`, launched or scheduled only through
  [the probe owner](../frontend/services/api/src/probes/); generic launch and
  schedule requests refuse the scope and only pause or resume a probe schedule. Every other audit reader selects its own
  scope (visibility, perception, run metrics and AI Traffic exclude probes).
- **Funding.** Probe tasks hold AI credits, shown before running and before a
  schedule turns on (the quote fingerprint); see
  [billing](billing-entitlements.md). A probe run is never repaired.
- **Labelling.** When a launch's last run ends and any run answered, one
  `probe_labelling` task labels every market's answers, one market per model
  call; a later market maps onto the groups earlier ones named, so a first
  probe groups objections once. The outcome (`labelled` or `unavailable`) is
  recorded once per launch; a launch that answered nothing stays `failed`.
  A theme or group deleted while it runs reads as Other or drops.
- **Scores.** [Position scores](../frontend/services/api/src/probes/scores.ts)
  are computed by code over the answered runs only; a read's basis names only
  their markets and engines.

### Fact-checking (pilot)

Fact-checking compares the factual claims answers make about the brand with
the brand facts the project confirmed ([onboarding](onboarding.md#brand-facts)).
It is gated by the non-public `fact_checking` entitlement, which an operator
grants per workspace (`billing:admin grant --key fact_checking --value 1`), and
platform-funded like perception. The policy, topics, caps and templates are the
`fact_check` block of
[`config/perception.json`](../frontend/services/api/src/config/perception.json).

- **Admission.** A brand audit in a granted workspace with at least one
  confirmed fact freezes `fact_check`: the claim and verification versions, the
  newest revision of each confirmed fact (topic-ordered, capped) and a hash of
  that set. Its perception template version becomes
  `<template_version>+<claims_version>`. Editing a fact later never changes that
  audit's verdicts. Other audits are perceived exactly as before.
- **Extraction.** The perception call of a fact-checked audit appends the
  claims addendum to the configured templates (no extra call). The brand's
  claims must quote the brand's own passages, sit on an allowed topic and stay
  within the per-answer cap; drops are counted. Claims land in
  `answer_claims` in the perception's terminal transaction.
- **Verification.** A claim is checked against facts on its own topic and on
  its neighbouring topics (`related_topics`, frozen with the fact set: plans with
  pricing and specs, availability with markets, and so on), so a claim filed
  under an adjacent topic still meets the fact that decides it. When a
  confident claim has a frozen fact in that scope, the same transaction queues
  one `fact_verification` analytics task. Its executor sends those claims and
  the scoped facts (own topics first, shared round-robin, capped, local ids)
  in one call. Code keeps only facts that were sent; a supported or
  contradicted verdict without one becomes inconclusive; a contradiction below
  `min_contradiction_confidence` is stored as inconclusive with low confidence.
  A claim the model left out is flagged `model_omitted` and reads as
  `unavailable / model_omitted`, apart from claims no fact covers.
  Caps, a missing gateway and failures end as persisted outcomes
  (`fact_verifications`, `claim_verdicts`), as for perception.
- **Metrics.** Accuracy is supported ÷ (supported + contradicted), always with
  coverage. A claim with no frozen fact in its topic scope is not covered
  without a call; low confidence, pending and unavailable claims are counted apart, never
  as zero. Contradicted claims carry the fact they contradict; domains cited in
  their answers are "cited alongside". Trend points change comparability with
  the templates, frozen perception model, metrics version or fact set.
- **Reads.** `GET /visibility/accuracy` and `/visibility/accuracy/claims`, the
  `claims` field of execution evidence and `read_fact_checks` read
  `not_enabled` outside the pilot; `/visibility/accuracy/facts` reads
  `enabled: false` and `/visibility/accuracy/claims/export` an empty CSV. By
  fact groups verdicts on the fact revision the run froze, so editing a fact
  never moves past claims; a frozen fact no verdict cites is "pending" while
  claims are still being checked, then "not raised".

## Ads in AI answers

Only `chatgpt_search` (`audits.json` `ads_engine`) shows ads. Ads are paid
placements: they never enter citations, sources, mention rate, share of voice
or scoring, and no other engine reads as zero ads.

- **Parsing.** `parseAds` reads `chat_gpt_ad` items anywhere in the stored Task
  GET result page, validates each, derives the advertiser's registrable domain
  (advertiser URL, else the ad's domain, else the landing host) and a landing
  URL without query string or fragment, and skips malformed or repeated-rank
  items (logged as `ads.items_skipped`).
- **Persistence.** In the analysis transaction, a `chatgpt_search` answer whose
  envelope has one result page sets `response_analyses.ads_parser_version`
  (`ads_versions.parser_version`) and writes one `answer_ad_observations` row
  per ad, unique on `(artifact_id, parser_version, rank_absolute)`, with the
  raw and canonical landing URLs and the image URL (stored, never served).
  Ownership is owned, competitor (with the competitor id frozen at admission)
  or other, by the advertiser domain against the frozen owned and competitor
  domains.
- **Applicability.** Per answer: `applicable` when the marker is set, so zero
  ads is an observation; `unavailable` for a `chatgpt_search` answer without
  it; `not_applicable` for every other engine.
- **Metrics** (`ads_versions.metrics_version`). Presence rate is successful
  applicable answers with at least one ad over successful applicable answers,
  per run, prompt and topic. Advertisers carry appearances, prompts reached,
  first and last seen and share of all ad appearances; the brand's own share
  and best rank are null when it never advertised. Creatives deduplicate on
  advertiser domain, title, snippet and canonical landing URL. Per prompt,
  answers where a competitor advertised are split by whether the brand was
  mentioned organically; these are counts, never a cause.
- **Reads.** `GET /visibility/ads`, the `ads` field of execution evidence and
  the `read_ai_ads` tool. CSV exports do not include ads.

## Read and UI surface

The trend, key figures and engine comparison live on Brand → Insights, the
brand ranking with competitor suggestions on Brand → Competitors, perception on
Brand → Perception, and cited sources on Sources
(`frontend/lib/navigation/app-routes.ts` names every screen); all read the same
selection and filters. Trends
read the newest `trend_max_runs` runs in the window, bucket them and then cap the
number of points (`trend_max_points`), so a run-heavy week stays one point. When
the run bound cuts history, the bucket holding the cut is dropped whole rather
than folded from part of its runs. A range selection pools
counts, average position and model provenance across its runs and omits citation
totals. Overview reads one run's persisted projection without a baseline
comparison, from completed and partially completed runs, like the Sources page.

A run's comparable baseline follows one rule, the comparison walk
(`visibility/comparison.ts`): the nearest earlier run in the same market whose
versions match and whose frozen identity matches exactly, or shares the context
its like-for-like cells can be matched in. Audit finalization runs that walk in
its transaction for every requestable cohort, for all engines and for each
engine the run measured, and persists the baseline, the comparison status and
the runs passed over (`audit_comparison_baselines`, `visibility/baselines.ts`).
Each finalization writes under a per-project transaction lock, once the run
reads as measured, and then rewrites the rows of the later runs whose walk can
reach it, so two runs finalizing together still name each other in either
commit order. Visibility's run comparison and Overview's change figures both read that row, so
they name the same baseline; no read walks the history. A reader-named baseline
is compared directly. Overview shows changes against the baseline only when its
status is `comparable` and otherwise reports the status
(`measurement.comparison_status`). A finalized run with no persisted row reads
`baseline_pending`, distinct from `no_baseline`.

Typed URL state retains run/period, engine, cohort, baseline, history, metric and
evidence filters. The server resolves Latest to a concrete run or compatible
run set, reused by dependent requests. An invalid explicit run never falls back
to Latest; historical windows remain separate from selected measurement.
Every visibility read takes an optional `market` (a market id; omitted is the
default market): Latest, ranges, trends and baselines stay inside it, and a named
run implies its own market, so a run set spanning markets is a 422. With more
than one market, a market switcher appears and Insights shows **By market**
(`/visibility/markets`): each market's latest run, its mention rate, share of
voice and net sentiment with the change since that market's previous comparable
run; a market never measured is not run, never zero. The Overview, its
comparisons and Action outcome checks follow the default market.

Fanout state and trimmed
queries settle on each response analysis, retaining its artifact/task provenance
and fanout projection version. Source/fanout totals are server aggregates over
the full selection; source, fanout and answer keyset cursors bind filters and the
snapshot boundary. Original answers use /runs/{runId}?execution={taskId}.
The Sources table reads per-run facts that audit finalization writes in its
transaction: `audit_answer_aggregates` (per engine and cohort, the exact
successful answer IDs and prompt keys) and `audit_source_aggregates` (per
engine, cohort, dimension, key and citation class, the exact answer, prompt,
URL and citation IDs). Its denominator, totals and page of rows come from one
statement that counts distinct values over the selected runs' arrays, so a
prompt or URL in two runs counts once; only the page-format and gap filters
read current `source_pages`. A selected run without persisted facts is
`metrics_pending`, never zero. Co-cited brands and the baseline comparison use
the same facts; page facts and retrieval coverage fill in concurrently.
Series, movers, near misses and one URL's page still read `citations`.

Citation rate is citations over the responses a source was RETRIEVED in, never
over the responses in the selection, and never over a stored retrieval counter.
Retrieved is the share of answers whose engine exposes retrieval
(`retrieval.unavailable_engines` names the others); with no observed answer it
reads not available. Top movers rank by citation-share change against the
dashboard baseline and report the comparison status when none is comparable.
The cohort switch's `all` is computed at finalization like the other cohorts.
A URL's brand list is co-occurrence in the answers that cited it: mentions are
persisted against the response, so nothing links one to a citation.
Browser history restores the analytical context. Competitor suggestions stay
on Competitors until accepted rather than becoming measurement evidence automatically.
A suggestion is a repeatedly cited domain or an untracked name the perception call
labelled (AV-11), suggested past the `observed_competitors.named` thresholds in
`config/audits.json`; a rejected domain or name is never suggested again.

### One prompt over time

`GET /visibility/prompts/{prompt_id}/history`
([prompt history](../frontend/services/api/src/visibility/prompt-history.ts))
reads one tracked prompt in one market (`market`, optional `engine`, and
`cohort`, which defaults to the prompt's own, brand questions included):
the newest `trend_max_points` dashboard-ready brand runs that scored it in
`prompt_metric_snapshots`, oldest first, each with its mention rate and owned
citation rate over that run's persisted answers for the prompt, the four
answer states, the snapshot id and the ids of the answers it counted. A run with no successful answer has null
rates (unavailable, never zero), and `comparable_with_previous` is false when
the frozen comparison key, prompt text or analyzer/scoring versions changed.
`implementations` lists the Actions whose frozen declaration checks measure the
prompt (prompt-targeted and earned), with each declaration's id and go-live
time (the newest `trend_max_points` kept); `latest` is the
newest such run's prompt row with per-engine outcomes: one per engine and
model the run asked, so an engine whose every answer failed is listed with its
failed count and no answer states. Each answer counts once in one of four
`answer_states`; `action_id` is the live Action that targets the prompt (an
Action whose evidence was cleared is not offered).

`/prompts/{prompt_id}` charts mention and owned citation rates per run, breaks
the line at non-comparable runs, and marks each implementation, with the list
of that work and the notice that a marker shows when work went live, not that
it moved a rate. Overview's "Where you're missing" lists the latest
default-market run's prompts and engines whose answers named a competitor but
not the brand, each linking to its Action (or its prompt when none exists yet).
