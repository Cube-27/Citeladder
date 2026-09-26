# Prompts and AI Visibility

## Responsibility

This owner connects reviewed business context to a versioned prompt portfolio,
explicit measurement admission and persisted answer-engine results.
AI Visibility measures observed mention/citation share under comparable audit
conditions. It does not measure causal impact or turn Search Console impressions
into AI prompt volume. [Onboarding](onboarding.md) owns company discovery and
confirmation; [Commerce](commerce-intelligence.md) owns typed buyer targets.

## Context, topics and generation

The [prompt API](../backend/app/api/prompts.py) and
[generation service](../backend/app/domain/prompts/generation.py) authorize the
workspace/project, validate topic/cohort selection and capacity, gather confirmed
brand context and optional observed demand, call the configured model, then
recheck ownership and insert conflict-safely. Generation does not start an audit.

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

Generation assigns canonical topics and short slot IDs, requested count and
cohort. The model chooses natural commercial wording and labels buyer stage and
prompt intent; code resolves legacy intent. Technical admission checks known
slots, topic ownership, allowed labels, cohort identity, normalized exact
duplicates and the shared length bound. Core queries cannot name the tracked
brand, aliases or supplied competitors; diagnostics name the brand and
comparisons also name an accepted competitor.

Commercial relevance and distinct needs are model guidance and human review
criteria, not lexical scores. There are no word-count windows, opening quotas,
fuzzy-similarity quality judges or automatic rewrite loops. Batching, bounded
technical retries and partial-result behavior remain. Concurrent sibling
batches do not coordinate their accepted text; final admission handles exact
duplicates.

Prompt generation retains its requested-count, topic, cohort and
batching semantics. Saving/activation retains explicit user-action
boundaries. Generation evidence freezes buyer-query policy, generator, slot,
context/source and actual provider/model provenance; historical prompts are not
rewritten by a newer generator.

## Prompts page, manual entry and CSV import

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
or defaulted rather than rejected. The browser previews and posts parsed rows;
the [CSV parser](../backend/app/domain/prompts/csv_import.py) serves raw uploads
with the same contract, and the dialog's sample file is generated from the
[browser parser's column contract](../frontend/lib/prompts/csv.ts). Under the
project lock, [import](../backend/app/domain/prompts/importing.py) matches topic
names case-insensitively, creates unknown names as manual topics only for rows
that insert, and imports a blank topic unassigned. Binding, duplicate handling
and capacity stay all-or-nothing.

## Audit admission and execution

The [audit API](../backend/app/api/audits.py),
[creation owner](../backend/app/domain/audits/creation.py) and
[schedule owner](../backend/app/domain/audits/schedule_service.py) use the shared
admission path. Users select logical engines and repetitions, not transport
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

[Analysis](../backend/app/domain/analysis/) derives versioned persisted metrics,
source and prompt outcomes from the selected evidence.
[Visibility](../backend/app/domain/analysis/visibility.py) projects brand and
competitor rankings. Mention, citation, recommendation identity, citation URL and
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
