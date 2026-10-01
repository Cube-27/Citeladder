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
`PromptCandidate` rows in [their own tables](../backend/app/models/prompt_candidate.py),
so no audit, capacity/occupancy or visibility query can see a proposal. The
[staging owner](../frontend/services/api/src/prompts/generation.ts) drops texts already
tracked or already pending. The TypeScript API owns the prompt library: prompt
sets, prompts, topics, import, generation and candidate review
([`src/prompts/`](../frontend/services/api/src/prompts/)).
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
provider-only labels are rejected. Configuration and [onboarding topic admission](../backend/app/domain/projects/onboarding/topic_admission.py)
own these decisions, not a copied vocabulary list in documentation.

Generation plans `count × GENERATION_OVERGENERATE_FACTOR`
[cells](../frontend/services/api/src/prompts/generation-drafts.ts): per selected topic,
its offering plus at most two attribute, situation/constraint or audience
entries, a target buyer stage and, for area-served businesses, a market.
Excluded pairs never share a cell and the full product is never enumerated;
Non-bare cells precede bare cells, confirmed facets precede suggestions, and
values spread least-used-first. Location-free cells remain eligible. A
subtopic uses its parent's offering map; a topic without a map gets bare cells,
never invented facts. Each slot carries its cell as `buyer_need`, and the model
writes a natural question expressing a useful buyer decision, labelling
buyer stage and prompt intent (code resolves legacy intent).
Category-plus-market restatements and cosmetic question wrappers are discouraged.
Business context retains field-level review provenance in model inputs. Inferred
values remain provisional and fields without a source are unverified, including
when the same values appear in the compact knowledge-base projection.
Generated buyer scenarios are hypotheses, not observed demand or new business
facts; cell provenance records that distinction. Geography belongs in the
wording only when it materially changes the answer.

Admission runs before any quality judgment: known slots, topic ownership,
allowed labels, cohort identity, normalized exact duplicates, the shared length
bound, topical binding, texts already tracked or pending, and exact copies of
observed demand queries. Core queries cannot name the tracked brand, aliases or
supplied competitors; diagnostics name the brand and comparisons also name an
accepted competitor. [Selection](../frontend/services/api/src/prompts/generation-quality.ts)
keeps at most `count` after judgment, preferring passing judgments while treating
uncertain and unjudged candidates equally, then spread across topic, stage, audience,
situation, attribute and market; a
shortfall is reported, never filled. `candidates_generated` counts what passed
admission and is never a market size. Every dropped row is counted under the
first admission rule it broke (`admission_drops`, also frozen in run
provenance), and the Generate dialog and agent handoff show that breakdown.
Run provenance also records each dropped row's slot, normalized text hash,
batch/index and admission phase alongside the generator and buyer-query policy versions.
Drafts are written in the project's `language_code`, using English when it is blank. Each candidate keeps its cell in
`evidence_refs`, copied into `generation_evidence` on accept.

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
with `scripts/jev_calibration.py`, an aggregate, text-free operator report; a
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
topic is dropped as `unknown_topic` rather than failing the portfolio. The report
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
still reject a file before parsing. The
[browser parser](../frontend/lib/prompts/csv.ts) is the one CSV reader: it
previews and posts parsed rows (the endpoint accepts only rows), and the
dialog's sample file is generated from its column contract. Under the project
lock, [import](../frontend/services/api/src/prompts/prompts.ts) matches topic
names case-insensitively, creates unknown names as manual topics only for rows
that insert, and imports a blank topic unassigned. A binding or capacity failure
rejects the whole import; duplicate rows are skipped while the rest import.

Manual create, text edits, activation and import pass
[topical binding](../frontend/services/api/src/prompts/binding.ts): the text
must share a non-stopword token or exact phrase with the project's identity
(brand and aliases, owned domains, topics, brand profile) or with the prompt's
own topic; an empty vocabulary fails closed. Tokens keep every script's letters
(Latin diacritics fold) and scripts written without spaces are split at ICU
word boundaries; stopwords are English-only. Generation admission applies the
same rule to drafted and proposed text.

## Audit admission and execution

The [audit API](../backend/app/api/audits.py),
[creation owner](../backend/app/domain/audits/creation.py) and
[schedule-management owner](../frontend/services/api/src/audits/schedules.ts)
persist explicit measurement requests. The TypeScript API owns the complete
project audit-schedules route family; the Python scheduler invokes the shared
audit admission path when a stored schedule becomes due. Users select logical
engines and repetitions, not transport
measurement modes. Every brand/Commerce/manual/scheduled/repaired audit uses
the approved citation-capable policy.

Admission freezes prompt text/cohorts, roster, model/retrieval identity, request
configuration and relevant versions. benchmark_mode is prompt framing, not a
provider policy. Funding/occupancy is checked by
[billing and entitlements](billing-entitlements.md). A provider-free estimate
does not authorize execution or establish measured cost.

The [audit worker](../backend/app/workers/audit_worker.py) claims PostgreSQL
tasks with leases, commits before I/O and records immutable response artifacts,
attempts and citation evidence. Cancellation, retries and reconciliation use
the existing audit/task state owners; failed answers remain failures, not
negative brand observations. Provider costs and successful-answer billing are
different projections.

Schedule patches validate cadence and interval against the current locked row;
omitted values retain the persisted scope and configuration. Nullable scheduling
fields may be cleared, while required fields reject null. Reads do not advance
or repair schedules. Until funded admission moves after the TypeScript ledger,
the Python scheduler remains the sole lease/run-state writer. Its claim and
finalize operations and TypeScript updates/deletes serialize on the schedule
row; this temporary shared-table boundary retires with the scheduler cutover.

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
no ChatGPT-only settings. The initial scraper context allowlist is US/English;
unsupported contexts and prompts exceeding 2,000 escaped characters fail before
submission. API engine IDs and Google AI Overview presence semantics remain separate.
Scraper model reports are supplementary provenance, distinct from the frozen product.

Paid provider tasks retain their committed submission/account identity across
restarts. Uncertain scraper submissions use exact-tag, product-checked, bounded
paginated reconciliation. The config-owned recovery deadline defaults to 72 hours
from committed intent and must be less than 28 days. Recovery never resubmits a
paid task; unrecovered tasks fail without negative brand observations. Known
submission charges remain recorded even when retrieval fails.

Scraper citations use root and nested sources, canonicalized and deduplicated.
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

## Measurement and comparisons

[Analysis](../backend/app/analysis/) derives versioned persisted metrics from
the selected evidence. The [visibility readers](../frontend/services/api/src/visibility/)
project source and prompt outcomes and brand and competitor rankings from them.
Mention, citation, recommendation identity, citation URL and
rank remain distinct observations. Unsupported entity assessments are
unavailable, not absent. Source-pattern and Opportunity mapping stay in
[Opportunities](opportunities.md).

Rates use their specified eligible evidence denominators. Pagination cannot
change totals, and the browser does not recompute aggregate share of voice.
Frozen model/retrieval, prompt/cohort and scope identity determine comparison
eligibility. Changed measurement conditions cannot become unqualified movement.
Unknown, not-run, failed, partial and observed-zero states remain distinct.

## Read and UI surface

Visibility has Trends, Sources and Query Fanout; Trends is default.
Typed URL state retains run/period, engine, cohort, baseline, history, metric and
evidence filters. The server resolves Latest to a concrete run or compatible
run set, reused by dependent requests. An invalid explicit run never falls back
to Latest; historical windows remain separate from selected measurement.

Sources has Domains and URLs, each with a usage series, a citation-type ring
and a searchable, sortable, exportable table; a domain opens its URLs and the
prompts that reached it, and a URL opens its own page. Source/fanout totals are
server aggregates over the full selection; answer cursors bind filters and the
snapshot boundary. Original answers use /runs/{runId}?execution={taskId}.

Citation rate is citations over the responses a source was RETRIEVED in, never
over the responses in the selection, and never over a stored retrieval counter.
A URL's brand list is co-occurrence in the answers that cited it: mentions are
persisted against the response, so nothing links one to a citation.
Browser history restores the analytical context. Competitor suggestions remain
in Overview Facts rather than becoming measurement evidence automatically.

The [pending integrations work](plans/citeladder-integrations-audit-followups.md)
covers richer observed-state/action links and selected-search-query generation.
Existing observed-query context does not mean that selection/provenance UX is
complete. Historical evaluation numbers are retained in
[the archived generation document](archive/evaluations/visibility-prompt-history.md);
they are not current acceptance or a model recommendation.
