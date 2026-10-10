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

**Quick generate** (the Generate dialog) samples the broad market: the
category's buyer questions across offerings, stages, intents and personas, with
places only where the market scope calls for them. **Build with Agent** is the
niche dive (a place, persona, constraint or intent the user names). Both stage
into the same candidate review.

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
purged by the next generation or review. The Generate dialog shows the pending list with
select-all and **Accept selected** / **Reject selected**; within a run, rows
the quality judge flagged are listed last with advisory labels and stay
selectable.

Topics may have one level of subtopics (`Topic.parent_id`, same project); a
subtopic cannot have children, and deleting a parent promotes its subtopics.
The topic rail adds a subtopic under a chosen top-level topic.

The [business map](../frontend/services/api/src/projects/business-map.ts), edited under
Brand knowledge and stored in `BusinessContext.business_map`, lists per
confirmed offering its attributes, situations/constraints and audiences, plus
excluded pairs that never combine. Entries carry origin and review state: a
model suggestion stays `suggested` until a person confirms it, and edits keep
each surviving entry's provenance. When a Generate request selects confirmed
offerings with absent or facet-empty map entries, one bounded model call
([map suggestions](../frontend/services/api/src/prompts/generation-drafts.ts)) proposes
them; they ground that run and are stored `suggested` with model identity and
the generation run id, only for offerings still empty at write time, and never
naming the brand or a competitor. A failed suggestion call only means cells
without facets.

Onboarding creates no prompts or topics; a created project starts with an
empty prompt set and the user chooses what to track. Generation uses existing
topics; when a project has none, it can recover starting topics from confirmed
products/services before generation. Missing confirmed offerings fail before provider I/O.

Onboarding research keeps a bounded offering harvest of things a customer buys,
hires, books or enrolls in as reviewable evidence. Recovered starting topics
describe confirmed offerings rather than restate the provider's category;
unsupported topics are not invented. Topic names must be bounded and
brand-neutral, and admitted topics receive canonical UUIDs.

Topic distinctness uses singular-normalized token identity, not character
similarity: men's and women's departments must not merge because their spellings
are close. The provider-restatement rule rejects a name only when every token
is provider vocabulary; containment would incorrectly reject School Uniforms.
An offer matching the business category stays eligible alongside other offers;
provider-only labels are rejected. Configuration and native onboarding topic admission
own these decisions, not a copied vocabulary list in documentation.

The [universe planner](../frontend/services/api/src/prompts/generation-plan.ts)
plans `count × GENERATION_OVERGENERATE_FACTOR` cells round-robin over the
selected topics. Each offering covers every buyer stage with a bare cell before
any facet; afterwards at most `facet_cell_share` of its cells carry an
attribute, situation/constraint or persona (confirmed audiences, else inferred
buyer roles as suggestions), confirmed values before suggestions,
least-used-first, never an excluded pair. A market attaches only to the reviewed
`market_scope`'s `location_policy` share (local 0.5, regional 0.25, national,
global and unknown 0), drawn from `service_areas`; a national business's service
areas never become wording. A subtopic uses its parent's offering map; a topic
without one gets bare cells, never invented facts. Each slot carries its cell
as `buyer_need` and the intents that suit its stage as `target_prompt_intents`.

Draft batches receive a narrow brief (category, category terms, offerings,
business model, buyer type, market scope, language and country, with their
review provenance), the batch's cells and tracked texts for de-duplication
only: no profile prose, knowledge-base sources, demand signals, competitors or
earlier drafts. The one exception is grounding: the
[observed-query loader](../frontend/services/api/src/prompts/observed-queries.ts)
reads the project's persisted Search Console queries (latest query snapshot,
`observed.gsc_window_days`, summed impressions at least
`observed.gsc_min_impressions`) and the keywords of the latest published
Search Intelligence dataset of each `observed.si_dataset_kinds` kind in the
project language. It keeps non-branded (branded and ambiguous classifications
drop), competitor-free, query-shaped searches bound to a topic by shared
tokens, at most `observed.max_per_topic` per topic, Search Console impressions
before keyword volume. Nothing is fetched, and impressions or volume only order
searches; they are never AI prompt volume. Each planned slot gets up to
`observed.examples_per_slot` same-topic searches, closest to its cell first,
sent as `buyer_search_examples` text (no row identities) with a rule that they
are examples to learn buyer wording from, not to copy. Without search data the
plan, brief and request are unchanged. The model writes a natural question per cell, names a place
only in a cell with a market, and labels buyer stage, prompt intent and
`names_place`. Generated buyer scenarios are hypotheses, not observed demand or
new business facts; cell provenance records that distinction. Map suggestions
never keep a value that names the project's places.

Admission runs before any quality judgment: known slots, topic ownership,
allowed labels (a planned core row's intent must suit the stage it is labelled
with), cohort identity, normalized exact duplicates, the shared length bound,
topical binding (service areas do not bind generated or proposed text), a place
named in a cell without a market (`location_unplanned`, decided on the project's
geography vocabulary with the model's `names_place` label recorded beside it),
texts already tracked or pending, and exact copies of any observed search the
run read (demand-signal queries and every grounding search).
Core queries cannot name the tracked brand, aliases or supplied competitors
under the project's mention rules (below); diagnostics name the brand and
comparisons also name an accepted competitor. The judge sees the planned cell,
not the business's service areas.
[Selection](../frontend/services/api/src/prompts/generation-quality.ts)
keeps at most `count` after judgment, preferring passing judgments while treating
uncertain and unjudged candidates equally, then spread across topic, stage, intent,
audience, situation, attribute and market; a
shortfall is reported, never filled. Run provenance records `distribution`
(counts by stage, intent, offering and persona, and located and bare drafts) for
admitted and selected drafts, measured by
[generation metrics](../frontend/services/api/src/prompts/generation-metrics.ts);
the same module scores fixture and live calibration sets against
`eval_thresholds` in `config/prompt-generation.ts`. `pnpm prompts:eval --live`
is the operator-only live calibration over the business-context fixtures; it
calls the configured provider and never runs in CI. `candidates_generated` counts what passed
admission and is never a market size. Every dropped row is counted under the
first admission rule it broke (`admission_drops`, also frozen in run
provenance), and the Generate dialog and agent handoff show that breakdown.
Run provenance also records each dropped row's slot, normalized text hash,
batch/index and admission phase alongside the generator and buyer-query policy versions.
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
`JEV_API_KEY` is set (blank is off; the TypeSafe subprocessor and privacy
revision was published on 28 September 2026 and production carries the key).
It judges the admitted draft pool within the configured call cap: yes/no fit, buyer relevance, decision value,
naturalness, standalone and sensibility; intent
and stage labels recorded beside the model's; and a per-topic duplicate choice
among tracked and earlier candidates. Its state omits the brand and
competitors. Each decision stores model, question-schema and policy versions,
the thresholds it was judged under and a state hash, so an identical judgment
already recorded in the set is reused (re-flagged for the new candidate under
the current policy; the stored decision is never rewritten).

The [gate policy](../frontend/services/api/src/prompts/generation-quality.ts) gives each
decision a verdict. **Fail**: a yes/no answer below `JEV_FAIL_BELOW` or a
duplicate choice at or above `JEV_DUPLICATE_FAIL_AT`. **Uncertain**: an answer
below `JEV_FLAG_BELOW`, a duplicate at or above `JEV_DUPLICATE_FLAG_AT`, or a
missing answer (`incomplete`); the row is shown flagged. **Pass**: everything
else. With `JEV_MODE=gate` (the default) a failed candidate never reaches
review: it is stored only as a text-free `gate_rejected` outcome record and
counted in `quality_rejected`. Selection can use other surviving drafts from
the same pool; any remaining shortfall is reported without a rewrite loop.
`JEV_MODE=shadow` records and flags without removing anything. The thresholds
(policy `jev-gate-1`) are provisional until calibrated from review outcomes
with `frontend/services/api/src/prompts/calibration.ts`, an aggregate, text-free operator report; a
threshold change bumps `JEV_POLICY_VERSION`. A JEV failure never removes
the candidate it failed on: it reports `quality_gate="unavailable"`, that
unjudged candidate stays reviewable, candidates judged in the same request are
still gated, and generation still succeeds. A duplicate choice that was not
offered, or an answer outside [0, 1], counts as unavailable (`incomplete`). JEV calls are bounded by
`JEV_MAX_CALLS_PER_GENERATION`, not the agent-call bucket. Exhausting that cap
reports partial unavailability; unjudged rows never claim to be checked.
Commercial relevance and distinct needs remain human review criteria; there
are no word-count windows, opening quotas or automatic rewrite loops. Batching,
bounded technical retries and partial-result behavior remain.

Prompt generation retains its requested-count, topic, cohort and
batching semantics. Saving/activation retains explicit user-action
boundaries. Generation evidence freezes buyer-query policy, generator, slot,
context/source and actual provider/model provenance; historical prompts are not
rewritten by a newer generator.

## Prompts page, manual entry and CSV import

**Build with Agent** opens a project-scoped chat with Prompt discovery selected.
Its saved portfolio has an explicit **Review in Prompts** action. The existing
generation endpoint accepts `agent_revision_id`, loads that authorized project's
saved portfolio, validates its bounded core rows, and applies the same
admission, JEV and candidate staging path without another text generation call.
The block's fence is matched case-insensitively; a row filed under an unknown
topic is dropped as `unknown_topic` rather than failing the portfolio. A row may
carry `targeting` (`place`, `persona`, `constraint`; any other key fails the
proposal), which becomes its cell's market, audience and situation facets.
Location and stage-intent admission do not apply to Agent rows: targeting is the
point, and an untargeted row admits as before. New runs record
`generation_mode` `quick` or `agent_proposal`. The report
hides the block only when there is exactly one closed JSON block with valid topic UUIDs
and a nonempty row count within the UI generation ceiling. The API also enforces
its configured runtime limit. Run provenance retains the exact output/revision/run references.
It never activates prompts. Repeated submission drops tracked or pending copies.
The handoff requests the portfolio's own question count, so selection never
trims an approved plan to the default, and opens
`/prompts?review=1`. Review intent survives loading; failed reads offer retry,
and an empty or expired batch is explained rather than opening generation setup.
Prompt-set creation waits for its list read and serializes local attempts per project.

Generation setup and candidate review are separate dialog states; review offers
accept/reject and an explicit Generate more action. Each row distinguishes judged
(checked or flagged), checking off, unchecked and unavailable states, including
after reopening; its quality description is associated with its checkbox. The library
prioritizes question text, topic, measurement and enabled state; classification
is secondary detail on the question, available on keyboard focus and to screen readers.

`/prompts` opens directly on the prompt library: topics rail, Active/Archived
tabs, and each prompt's topic and latest measured visibility. Its actions are
Bulk upload, Generate prompts, Add prompt and **Launch audit**, which reuses the
shared launch dialog and its admission/funding checks and stays disabled until
the project has an active prompt. `/prompts?generate=1` opens the Generate
dialog once per arrival and is then removed from the URL.

Users are asked only for a prompt and its topic. Theme, intent and cohort are
internal generation vocabulary: never required, never a user-facing validation
error, and defaulted in code when absent. Editing a prompt changes only its text
and topic, so generated classification survives.

CSV import reads `topic,prompt` (aliases `category`; `text`, `query`,
`question`) in any order; a file without a recognized header is a list of
prompts. Optional `theme`, `intent`, `cohort` and `enabled` columns are clipped
or defaulted rather than rejected; the upload's column, row and cell-size bounds
still reject a file before parsing, and the browser rejects a file over the row
limit before it previews as ready (`import_max_rows` in `config/prompt-library.json`). The
[browser parser](../frontend/lib/prompts/csv.ts) is the one CSV reader: it
previews and posts parsed rows (the endpoint accepts only rows), and the
dialog's sample file is generated from its column contract. Under the project
lock, [import](../frontend/services/api/src/prompts/prompts.ts) matches topic
names case-insensitively, creates unknown names as manual topics only for rows
that insert, and imports a blank topic unassigned. A binding or capacity failure
rejects the whole import; duplicate rows are skipped while the rest import.
Deleting a prompt or a topic asks for confirmation that states the effect; a
topic delete unassigns its prompts and promotes its subtopics.

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

[Audit config](../frontend/services/api/src/config/audits.ts) (values in
`config/audits.json`) owns lifecycle, retry and attempt limits, scoring and read
policy; [provider config](../frontend/services/api/src/config/providers.ts)
owns transport/capacity policy and [cost config](../frontend/services/api/src/config/costs.json)
owns versioned pricing and measured envelopes.
Provider error bodies do not become public failure details.

The [audit API](../frontend/services/api/src/routes/audits.ts),
[creation owner](../frontend/services/api/src/audits/creation.ts) and
[schedule-management owner](../frontend/services/api/src/audits/schedules.ts)
persist explicit measurement requests. The TypeScript API owns the complete
project audit-schedules route family; the TypeScript scheduler invokes the shared
audit admission path when a stored schedule becomes due. Users select logical
engines and repetitions, not transport
measurement modes. Every brand/Commerce/manual/scheduled/repaired audit uses
the approved citation-capable policy.

Manual launches and failure reruns start a separate, workspace-authorized
`POST /audits/{audit_id}/run` after admission. It claims only that audit's tasks
through the existing worker, starts due work immediately, and retains provider
capacity limits, due times, cancellation and queue recovery. The request has
config-bounded admission and execution budgets; remaining tasks and future
provider polls continue through the runner.

Admission freezes prompt text/cohorts, roster, model/retrieval identity, request
configuration and relevant versions. benchmark_mode is prompt framing, not a
provider policy. Funding/occupancy is checked by
[billing and entitlements](billing-entitlements.md). A provider-free estimate
does not authorize execution or establish measured cost.
Manual HTTP launch uses customer credentials; funded admission is reserved for
trusted billing/trial callers. Cancelled funded runs release unused task credits
but retain their admission quote against the monthly funded cost ceiling.

The [audit worker](../frontend/services/api/src/workers/audit-worker.ts) claims PostgreSQL
tasks with leases, commits before I/O and records immutable response artifacts,
attempts and citation evidence. Cancellation, retries and reconciliation use
the existing audit/task state owners; failed answers remain failures, not
negative brand observations. Provider costs and successful-answer billing are
different projections.

The audit runner lane wakes for the earliest due retry, capacity wait or
provider poll (`AuditQueue.nextDue`), not only on its idle tick. A task with a
submitted paid search-surface request is bounded by its poll ceiling or recovery
deadline, never the run cap, since retrieval is free and the query is already
paid. The worker caches the workspace access check for a short TTL
(`access_check_ttl_seconds`); the per-task ownership lock is never cached. It
finalizes an audit only once no task is open. Lease recovery and stuck-audit
repair run in the periodic `audit-maintenance` lane, not in the worker.
Attempts per task default to the `max_attempts` setting.

A schedule disabled by repeated failures stores the real admission error (for
example an ended trial or exhausted budget); the schedules list shows it as
the pause reason and offers Resume, which re-enables the schedule and resets
its failure count. Schedule patches validate cadence and interval against the current locked row;
omitted values retain the persisted scope and configuration. Nullable scheduling
fields may be cleared, while required fields reject null. Reads do not advance
or repair schedules. The [native scheduler](../frontend/services/api/src/workers/audit-scheduler.ts)
owns leases and run state; claim, finalize and schedule edits serialize on the
schedule row. The [maintenance owner](../frontend/services/api/src/audits/maintenance.ts)
independently reconciles expired leases and unused funding. DataForSEO submission
intent commits before the paid request; uncertain submissions remain uncertain
and are never automatically resubmitted. Known task IDs use free result polling.

Manual launch offers six independent engines: ChatGPT Search (`chatgpt_search`),
Gemini (`gemini_consumer`), Google AI Overview, ChatGPT API, Gemini API, and
Claude API. Connected consumer surfaces are selected once when the dialog opens;
refetches preserve deliberate deselection. Saved schedules retain their engine IDs.
One customer DataForSEO credential serves all three consumer surfaces. New and
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
paginated reconciliation. The config-owned recovery deadline runs from committed intent. Recovery never resubmits a
paid task; unrecovered tasks fail without negative brand observations. Known
submission charges remain recorded even when retrieval fails.

Scraper citations use root and nested sources, canonicalized and deduplicated.
Ad items (`chat_gpt_ad`) are skipped by the source walker and the answer-text
fallback, so a paid placement is never a citation or answer text; see
[Ads in AI answers](#ads-in-ai-answers).
Retrieved-but-uncited search results and provider brand entities remain raw
supplementary evidence; the current citation projections do not represent a
separate retrieval dataset or query-to-source associations. Query Fanouts uses
only returned query text, distinguishing unavailable evidence from an explicitly
empty query list. Neither state claims that no search occurred. Accepted scraper
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
says which countries and languages each surface supports; it is regenerated
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
found. These semantics are `grounded-analysis-v2` and `entity-assessment-2`;
earlier results keep their versions. Source-pattern and Opportunity mapping stay in
[Opportunities](opportunities.md).

**Visibility** means the brand mention rate everywhere: the share of answers
naming the brand. The weighted composite is the per-prompt **prompt score**
(weights and scoring version in `config/audits.json`). When nobody is named in a
prompt's answers, its competitive component is not applicable and its weight is
redistributed, rather than scoring as a loss to every rival. Share of voice has
one definition, mention-level, used by the tile, its change line and trends.
Brand rank is null when share of voice is null.

Rates use their specified eligible evidence denominators. Pagination cannot
change totals, and the browser does not recompute aggregate share of voice.
Frozen model/retrieval, prompt/cohort, market (country and language) and scope
identity determine comparison eligibility. Changed measurement conditions cannot become unqualified movement.
Unknown, not-run, failed, partial and observed-zero states remain distinct.

## Answer perception

[Perception](../frontend/services/api/src/perception/) classifies how a brand-audit
answer portrays each tracked business it names. It is always on and
platform-funded through the default Agent gateway (`DEFAULT_AGENT_*`); it draws no
customer credits. Policy, caps, the closed theme list and the templates live in
[`config/perception.json`](../frontend/services/api/src/config/perception.json).

- **Trigger.** At the end of the analysis transaction, an answer whose entity
  assessments name the brand or a competitor enqueues one `answer_perception`
  task on the analytics queue, keyed by the analysis and the frozen extractor
  version, so a re-derived finalize never adds a second. No network I/O happens
  in that transaction. Admission freezes the extractor, template and metrics
  versions into a brand audit's configuration; an audit frozen without them is
  never classified and never reads as pending.
- **Executor.** Reads are committed before the model call and no transaction
  spans it. Over the per-audit or per-workspace daily cap the outcome is
  `unavailable / platform_cap`; without a configured gateway it is
  `unavailable / model_not_configured`; a task that exhausts its attempts is
  compensated as `unavailable / task_failed`. None of these fails the audit.
  The model receives, per business (brand first, competitors by first mention,
  bounded), every sentence naming it plus one either side; offsets are code
  points, like the entity assessment. An unparseable output is retried once,
  then recorded as `invalid_output`; a provider fault is `model_error`. The
  outcome, usage and input hash land in `answer_perceptions` with one
  `entity_sentiments` row per business sent, in the lease-fenced terminal
  transaction, unique on `(analysis_id, extractor_version)`.
- **Validation.** Deterministic: an unknown entity is dropped; a quote must be
  found in that business's own passages after whitespace normalisation, else it
  is dropped; a theme outside the list becomes `other`; a label below
  `min_confidence` is stored but excluded from aggregates. Drops are counted
  by reason.
- **Metrics.** Net sentiment is (positive − negative) / classified × 100, with
  `mixed` in the denominator only, always paired with "N of M mentions
  classified". Pending, unavailable (by reason), not assessable and low
  confidence are counted separately and never read as zero. Themes, negative
  quotes and the domains cited alongside criticism (never called a cause) are
  brand-only; the recommended rate comes from the deterministic first-mention
  assessment (English phrasing only). Trend points carry their versions; a
  version change marks the point not comparable.
- **Reads.** `GET /visibility/perception` (summary for a run, a run set or the
  latest run) and `/visibility/perception/quotes` (keyset-paged), the
  `perception` field of execution evidence, and the `read_perception` tool.
  Reads never classify. `pnpm perception:eval --live` is the operator-only
  calibration over hand-labelled fixtures.

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
  Caps, a missing gateway and failures end as persisted outcomes
  (`fact_verifications`, `claim_verdicts`), as for perception.
- **Metrics.** Accuracy is supported ÷ (supported + contradicted), always with
  coverage. A claim with no frozen fact in its topic scope is not covered
  without a call; low confidence, pending and unavailable claims are counted apart, never
  as zero. Contradicted claims carry the fact they contradict; domains cited in
  their answers are "cited alongside". Trend points change comparability with
  the templates, metrics version or fact set.
- **Reads.** `GET /visibility/accuracy` and `/visibility/accuracy/claims`, the
  `claims` field of execution evidence and `read_fact_checks` read
  `not_enabled` outside the pilot. `pnpm facts:eval --live` is the operator-only
  calibration; the pilot's false-contradiction rate is reviewed with the owner
  before general release.

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
  domains. Ads apply from the first audit after this shipped; there is no
  backfill.
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
- **Reads.** `GET /visibility/ads` (the latest run, a run or a run set; engine
  and cohort filters; creatives keyset-paged up to 50), the `ads` field of
  execution evidence and the `read_ai_ads` tool. Reads never parse. CSV
  exports do not include ads.

## Read and UI surface

Visibility has Trends, Sources, Perception, Ads and Query Fanout; Trends is default. Trends
bucket runs first and then cap the number of points (`trend_max_points`), so a
long window is not silently truncated to its latest runs. A range selection pools
counts, average position and model provenance across its runs and omits citation
totals. Overview reads one run's persisted projection without a baseline
comparison, from completed and partially completed runs, like the Visibility page.

A coverage strip under the headline tiles states the answers and engines behind
the numbers, failed and not-run counts, the comparison baseline and, when a
change is missing, why. Each failed execution shows a plain reason and next step
for its error code, and a provider wait names the engine.
Typed URL state retains run/period, engine, cohort, baseline, history, metric and
evidence filters. The server resolves Latest to a concrete run or compatible
run set, reused by dependent requests. An invalid explicit run never falls back
to Latest; historical windows remain separate from selected measurement.
Every visibility read takes an optional `market` (a market id; omitted is the
default market): Latest, ranges, trends and baselines stay inside it, and a named
run implies its own market, so a run set spanning markets is a 422. With more
than one market, a market switcher appears and Trends opens with **By market**
(`/visibility/markets`): each market's latest run, its mention rate, share of
voice and net sentiment with the change since that market's previous comparable
run; a market never measured is not run, never zero. The Overview, its
comparisons and Action outcome checks follow the default market.

Sources has Domains and URLs, each with a usage series, a citation-type ring
and a searchable, sortable, exportable table; a domain opens its URLs and the
prompts that reached it, and a URL opens its own page. Fanout state and trimmed
queries settle on each response analysis, retaining its artifact/task provenance
and fanout projection version. Source/fanout totals are server aggregates over
the full selection; source, fanout and answer keyset cursors bind filters and the
snapshot boundary. Original answers use /runs/{runId}?execution={taskId}.

Citation rate is citations over the responses a source was RETRIEVED in, never
over the responses in the selection, and never over a stored retrieval counter.
A URL's brand list is co-occurrence in the answers that cited it: mentions are
persisted against the response, so nothing links one to a citation.
Browser history restores the analytical context. Competitor suggestions remain
in Overview Facts rather than becoming measurement evidence automatically.

The [pending integrations work](plans/backlog.md#integrations-and-ai-visibility)
covers richer observed-state/action links and selected-search-query generation.
Existing observed-query context does not mean that selection/provenance UX is
complete. Historical evaluation numbers do not establish current acceptance
or a model recommendation.
