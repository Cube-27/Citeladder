# Google AI Overview — fourth measured visibility surface

**Status: slices 1-4 shipped.** The surface is live and selectable. Slice 5
(full evidence view, surface filters across Trends and Sources, labelled
AIO-specific rates, and the three-engine copy sweep) is not started.

Three things the live account corrected in this plan, now fixed in code:
the reconciliation endpoint is `/v3/serp/id_list`, not the per-endpoint
spelling below, which returns 404; `datetime_to` must be strictly in the
past; and the observed Standard charge is $0.0012 ($0.0006 base plus the
$0.0006 asynchronous surcharge). The `tag` round-trip IS confirmed, in both
`data.tag` and `metadata.tag`, so the strict identity rule stands. The
captured sample is committed at `docs/evaluations/DATAFORSEO_sample_result.json`,
not the filename cited below.

Owner-selected. [Visibility](../visibility-prompt.md), [Architecture](../architecture.md)
and [Backend architecture](../backend-architecture.md) own shipped behavior. The
originating material is an owner-authored integration specification, retained as
guidance only; the evidence is a real DataForSEO Google Organic SERP response
captured from the API playground and committed at
[`docs/evaluations/SERP_sample_result.json`](../evaluations/SERP_sample_result.json).
Every claim below was re-verified against `main` at `9a34305e`. Listed work is
not authorization to execute it. Scope each slice explicitly before starting it.

## Problem

CiteLadder measures brand visibility by asking an LLM a tracked prompt and
analysing the answer. Google's AI Overview is the highest-traffic answer surface
in the market and it is invisible to the product. It cannot be asked a question:
it has no conversational API, no key a customer can hold, and no token-metered
call. It is observed, through a SERP provider, as one block inside a search
result page.

The whole answer-engine layer assumes the opposite. `AnswerEngineRequest` carries
`prompt`, `system_instruction`, `reasoning_effort` and `max_output_tokens`
(`connectors/answer_engines/contracts.py:57-69`). `NormalizedUsage` counts input,
output and reasoning tokens (`contracts.py:39-54`). `build_adapter` is an
`if/elif` chain over three transports (`factory.py:27-60`). One queue attempt is
one synchronous provider call, and `max_attempts` bounds the retry loop
(`workers/audit_worker.py:1-23`).

The intended end state is one tracked prompt fanning out to four surfaces, three
of which are LLMs and one of which is a search result page, folding into the same
`ResponseAnalysis`, `Citation`, `MetricSnapshot`, Sources and Trends projections
with no parallel Google subsystem and no second scoring path.

## Verified premises

These were checked in code. Several correct the originating specification.

- **The three shipped engines are ChatGPT, Claude and Gemini**, not
  ChatGPT/Gemini/Perplexity. `LOGICAL_ENGINES` is
  `(ENGINE_CHATGPT, ENGINE_CLAUDE, ENGINE_GEMINI)` and is literally annotated
  `Final[tuple[str, str, str]]` (`core/config/provider_catalog.py:28-35`). The
  annotation itself must widen, not just the value.
- **Perplexity, Grok and Copilot are display-only.** `PUBLIC_PROVIDER_CATALOG`
  carries them with `availability=unavailable, adapter_shipped=False`
  (`provider_catalog.py:320-321,389-447`), gated behind ungranted capability keys
  (`core/config/entitlements.py:65-67`). They prove the catalog/entitlement
  scaffold works; they do not prove an execution path.
- **`google_ai_overview` is already a token in a different vocabulary.**
  `AI_SOURCE_GOOGLE_AI_OVERVIEW` is a GA4 AI-referral traffic-source label
  (`core/config/analytics.py:66`; frontend `lib/ai-referrals/series.ts:46`), and
  `AI_SOURCE_TO_LOGICAL_ENGINE` (`analytics.py:81-86`) deliberately omits it
  because it was outside the audited set. Reusing the same string as a
  `logical_engine` is correct and desirable, but that mapping dict must gain the
  entry, and every grep during implementation will hit both vocabularies.
- **No submit-then-poll provider exists anywhere in the codebase.** There is no
  `provider_task_id` column, no poll loop, no webhook receiver, no
  "awaiting external result" status. The nearest analogue is
  `PostgresTaskQueue.defer()` (`orchestration/postgres_task_queue.py:373-394`),
  which re-parks a row waiting on an **in-process sibling** queue row, used by
  `workers/site_health/phases/analyze.py:116-150`. It is the right mechanical
  precedent — re-park without spending an attempt — but it was not written for
  an external task id.
- **The credential layer is already provider-agnostic.** `ProviderConnection`
  (`models/provider.py:34-147`) keys on a free-string `transport_provider`, holds
  one Fernet-encrypted secret (`core/security.py:162-177`), and carries
  `credential_source` (`byok`/`platform`), pause/resume, `/test` probe history and
  `credential_revision`. BYOK-wins-over-platform precedence is already implemented
  in `domain/providers/credentials.py:268-329`. This ports with almost no change.
- **The analysis side is already engine-dimensional.** `ResponseAnalysis.logical_engine`
  is a plain `String(32)` with no CHECK constraint (`models/analysis.py:109`);
  `MetricSnapshot.metrics["per_engine"]` is a dict built by grouping on whatever
  distinct values exist (`analysis/service.py:317-334,556-566`); `engine_count`
  for evidence-coverage math is counted live from `AuditTask`
  (`service.py:711-719`). No DB enum or CHECK constraint references engine values
  anywhere in `migrations/versions/0001_initial.py`.
- **There is exactly one analysis-side choke point.** `validate_engine_and_range()`
  (`domain/analysis/trends.py:131-149`) rejects any `logical_engine` not in
  `LOGICAL_ENGINES`, and gates Trends (`trends.py:169`), Visibility
  (`visibility.py:63-67`), Range-Visibility (`range_projection.py:40`) and the
  shared evidence-statement builder (`evidence.py:213`) that Sources builds on.
  Widening the catalog tuple unlocks all of them at once.
- **The headline composite score is already engine-agnostic.**
  `_composite_visibility_score` averages per-prompt composites
  (`analysis/service.py:601-606`); `_per_prompt_metrics` groups completed
  executions by `prompt_index` with no engine filter (`analysis/scoring.py:368-379`).
  A fourth surface folds into the score by populating `ResponseAnalysis` correctly
  — **no formula change is required**.
- **The scorer's input contract is raw text plus aliases.** `score_execution(*, answer_text,
  search_events, citations, search_used, config, prompt_text, query_text_available)`
  (`analysis/scoring.py:195-239`) consumes no engine-specific field. Any surface
  that can produce `(answer_text, citations, config)` gets brand mentions,
  competitor mentions, citation classification, source classes and position for
  free.
- **`position.py` already computes mention order.** `brand_position`
  (`analysis/position.py:22-40`) returns `ahead + 1`, where `ahead` counts the
  configured competitors whose first alias offset precedes the brand's;
  `competitor_position` (`:69-84`) does the same from a competitor's view. That is
  a 1-based order among the entities named in one answer. The persisted fields are
  raw offsets (`ResponseAnalysis.brand_first_offset`, `CompetitorMention.first_offset`)
  and the order is derived at read time. **A new `mention_order` field would be a
  second source of truth for a number this already produces** — reuse these
  functions and label the output, do not recompute or re-persist it.
- **Task quota already multiplies by engine count.** `total = len(prompts) *
  len(engine_list) * reps`, checked against `max_tasks_per_audit` and reserved
  against `audit_tasks_per_workspace_daily` (`domain/audits/creation.py:130-152`).
  A fourth engine raises consumption automatically.
- **The engine set is per-schedule, not per-project.** `AuditSchedule.engines` is
  a JSONB list (`models/audit_schedule.py:62`), validated by `validate_engines`
  (`domain/audits/schedule_schemas.py:74-80,129-137`) and passed straight through
  by the scheduler (`workers/audit_scheduler.py:155-208`). There is no persisted
  project-level engine list. The specification's "enable Google AIO for a project"
  is therefore a **new concept**, not a field that already exists.

### What the sample response actually contains

`docs/evaluations/SERP_sample_result.json` is **one element of `tasks[]`**, not the
full API envelope — its top-level keys are `id`, `status_code`, `cost`, `data`,
`result`. A production parser must unwrap `tasks[]` first.

It is also a **Live** response (`data.function: "live"`), while production is
Standard submit-and-poll. It validates the parser and nothing else: it proves no
part of the task lifecycle, carries no queued or failed task state, and its
`cost: 0.002` is Live pricing and must not be used to infer Standard pricing or
the asynchronous-AI-Overview surcharge. Standard POST and GET fixtures — accepted,
queued, completed, failed, and completed-with-no-AIO — are built in PR 3 from
recorded provider responses and are the fixtures the lifecycle is tested against.

- `data`: `{api: serp, function: live, se: google, se_type: organic, keyword,
  location_code: 2036, language_code: en, device: desktop, os: windows, depth: 10,
  load_async_ai_overview: true}`.
- Task-level `status_code: 20000`, `status_message: "Ok."` — **the task carries its
  own status, separate from the HTTP status and from the response-level status.**
- `result[0].item_types`: `['ai_overview', 'organic', 'people_also_ask',
  'popular_products', 'local_pack', 'related_searches', 'google_reviews']`.
- The AI Overview block sits at `rank_absolute: 3` among sixteen items, carries
  `asynchronous_ai_overview: false`, a top-level `markdown` string, `items[]` of
  four `ai_overview_element` blocks, and `references[]` of five
  `ai_overview_reference` rows.
- **Duplication is real and confirmed**: `items[1].references` contains the same
  five references as the root `references[]`. Only `items[1]` carries `links[]`
  (`link_element` rows with `title`, `url`, `domain`); the other three elements
  have `links: None` and `references: None`.
- **Google-owned references are real and confirmed**: two of the five root
  references are `www.google.com` Google Shopping product URLs. Attributing them
  to the brand named nearby would be wrong.
- Note that the sample carries `asynchronous_ai_overview: false` **and** a fully
  populated AI Overview, while the request set `load_async_ai_overview: true`. The
  flag therefore describes how Google produced the block, not whether the
  DataForSEO task has finished. It must not be read as a pending signal.

## Owner decisions

- **Credentials: BYOK now, platform-funded later.** Ship customer-entered
  DataForSEO credentials in V1, but resolve them through the existing
  `resolve_execution_credentials` precedence so a platform credential can be added
  later without a migration or a second code path.
- **Retrieval: poll, do not receive.** Completed DataForSEO Standard tasks are
  collected by polling the provider, driven by the existing Postgres queue. No
  public webhook endpoint is introduced: it would be a new unauthenticated inbound
  route with its own replay-protection and reachability burden, and polling makes
  recovery from a missed completion free rather than a special case.
- **Google AI Overview contributes to the composite visibility score.** The
  product answer is "your strongest and weakest surface", which requires one score
  spanning every surface rather than competing per-surface paths. This costs
  nothing structurally: the composite is already engine-agnostic (see premises).
  It does still require the denominator decisions in **Measurement contract**.
- **The database is rebuilt, not migrated.** This is a greenfield product. Every
  schema change in this plan is folded into `migrations/versions/0001_initial.py`
  and the database is reset. No incremental migration file is created, and no
  scoring-version or analyzer-version bump is needed to protect historical rows,
  because there are none to protect.
- **One shared run budget.** A Google AIO observation consumes the same customer-
  facing unit as an LLM engine run. A workspace with a 1,000-answer monthly budget
  spends that budget across all four surfaces and any surface added later. SERP
  versus LLM is retained as an **internal** cost dimension only.
- **Interim SERP allowance, pending real billing.** Until the billing model is
  defined, free-tier workspaces receive an additional ten SERP task units per
  period on top of their shared budget, and developer accounts are unmetered for
  SERP. Semantics, so that two counters never disagree: the shared budget is the
  only gate that can reject admission; the SERP allowance is a **credit consumed
  first**, before the shared budget, recorded through the same
  `reserve_workspace_capacity` accounting rather than a parallel counter. What
  consumes a unit is defined in **Retry accounting**, and it is never derived from
  `attempt_count`. This is explicitly temporary — one capability key, commented as
  interim, deletable in one place.
- **No `target` parameter, ever.** The request carries the query and the search
  context and nothing else. CiteLadder determines owned, competitor and
  third-party identity from project configuration against the complete SERP.
  Sending the monitored domain to the provider would let the provider's filtering
  decide what CiteLadder is allowed to see.
- **Only `type == "ai_overview"` is parsed in V1.** Every other item type in the
  response is retained in raw evidence and ignored by every projection.

## Surface model

The existing vocabulary conflates "which engine" with "how it is reached". A
search surface breaks that conflation, so a third axis is introduced.

```
logical_engine      chatgpt | claude | gemini | google_ai_overview
transport_provider  openai  | anthropic | google | dataforseo
surface_kind        llm     | llm       | llm    | search_ai
```

`surface_kind` is the branch point. It decides which request contract is built,
which adapter protocol is used, which execution shape the worker runs, and which
pricing shape applies. It is **not** a user-facing concept: the UI says
"Google AI Overview" and, in helper text only, "Powered by DataForSEO Google
Organic SERP API". The words DataForSEO, Google Organic and SERP API never appear
as a primary product label.

`MeasurementRoute` (`provider_catalog.py:72-100`) carries `retrieval_enabled`,
`reasoning_effort` and `reasoning_pinnable`, none of which mean anything for a
search surface. Rather than force-fitting defaults, the route gains a
`surface_kind` field and a sibling `SearchContext` describing
`location_code`, `language_code` and `device`; LLM-only fields on a `search_ai`
route are explicitly null, and every accessor that reads them asserts
`surface_kind == "llm"` first.

## Data contracts

### Configuration (`core/config/`)

| Location | Change |
|---|---|
| `provider_catalog.py:28-35` | `ENGINE_GOOGLE_AI_OVERVIEW`; widen `LOGICAL_ENGINES` value **and** its `tuple[str, str, str]` annotation to `tuple[str, ...]` |
| `provider_catalog.py:38-44` | `TRANSPORT_DATAFORSEO`; add to `ACTIVE_TRANSPORTS` |
| `provider_catalog.py:72-100` | `surface_kind` on `MeasurementRoute`; fourth `MEASUREMENT_ROUTES` entry with LLM fields null |
| `provider_catalog.py:158,221-247` | `ROUTE_POLICIES` and `ROUTE_CAPACITY_POLICIES` entries for `(google_ai_overview, dataforseo)` |
| `provider_catalog.py:389-447` | Promote a `PUBLIC_PROVIDER_CATALOG` row to `adapter_shipped=True` — **only in PR 4**, see Slices |
| `provider_catalog.py:538-543,587-609` | `platform_dataforseo_credential` setting and `resolve_platform_credential` branch (declared now, unused until platform funding ships) |
| `analytics.py:81-86` | `AI_SOURCE_TO_LOGICAL_ENGINE` gains the `google_ai_overview → google_ai_overview` entry |
| `costs.py:137-201` | Fourth `RouteIdentity`; a `RoutePricing` with every token field null and `search_fee_microusd` set, plus a comment naming the flat-fee model |
| `task_queue.py:34-64` | New non-attempt-spending status `awaiting_provider_result` |
| new `core/config/dataforseo.py` | Endpoint paths, the provider status-code families (see **Outcome contract**), poll interval, poll ceiling, task TTL, batch size, `load_async_ai_overview`, default `depth`, keyword length limit, location/language/device catalogs |
| `entitlements.py` | `KEY_SERP_TASKS_PER_PERIOD`, commented as interim pending billing |

### Credentials

DataForSEO authenticates with an HTTP Basic login/password pair, but
`ProviderConnection` holds a single encrypted secret. Rather than adding a second
secret column and a second decryption path, the pair is serialised as a compact
JSON object and encrypted into the existing `api_key_encrypted` column. The
serialisation lives behind one named helper so nothing else knows the shape, and
the column contract — one Fernet blob, never returned to the client — is
unchanged. `credential_revision`, `paused_at`, `last_test_status` and the `/test`
probe all work as they do for the LLM engines.

The `/test` probe issues `GET /v3/appendix/user_data`, which authenticates without
creating a billable task. It maps onto the existing `ok`/`failed` vocabulary and
returns connection state only — never account balance, quota or any other account
detail. It must never submit a SERP task.

### Execution row

`AuditTask` (`models/audit.py:279-404`) gains:

- `provider_task_id: str` — the DataForSEO task id, empty for LLM rows.
- `provider_submission_ref: str` — CiteLadder's own stable correlation identifier,
  written **before** the POST and sent to the provider as the task `tag`
  (255-character limit) so an orphaned submission can be found again. See
  **Submission integrity**.
- `provider_connection_id` / `provider_credential_revision` — the account that
  submitted, bound for the lifetime of the task.
- `provider_task_submitted_at: datetime | None`.
- `provider_poll_count: int` — bounded by config; exceeding the ceiling is a
  terminal failure with a distinct error code, never a silent no-AIO.

The idempotency key and slot uniqueness are unchanged: `{audit_id}:{prompt_index}:
{repetition}:{engine}` already distinguishes the fourth surface
(`domain/audits/task_creation.py:74`).

### Outcome contract

This is the most important contract in the plan, because every rate in the product
divides by it. Separate **terminal outcomes**, which are always persisted, from
**in-flight states**, which live on `AuditTask` and are never observations. All
five terminal outcomes are recorded; only the two successful ones enter the
published denominators, as **Measurement contract** sets out.

Terminal outcomes — closed vocabulary, persisted on `AioObservation`:

| Evidence | Outcome |
|---|---|
| Task complete, an `ai_overview` item present with usable content | `ai_overview_present` |
| Task complete and well-formed, and no item of `type == "ai_overview"` is present | `no_ai_overview` |
| Provider reports task failure or partial retrieval | `provider_error`, carrying the provider's own code |
| Task complete but the structure is missing, malformed, or an AIO block the parser cannot interpret | `parser_error` |
| CiteLadder could not complete retrieval for a local reason — poll ceiling, unreconciled submission, credentials withdrawn mid-flight | `execution_failure`, carrying an internal `error_code` |

In-flight states — on `AuditTask.status`, never on an observation:
`awaiting_provider_result`, `submission_uncertain`. The parser may return
`still_pending` as an intermediate result; it is a signal to re-park, not a
finding. Nothing counts it, because a task that has not finished has not observed
anything.

`execution_failure` exists so that a local failure has somewhere honest to go.
When it fires, `aio_present` is **null** — not false — and
`provider_status_code` and `observed_at` stay empty rather than being
manufactured: no provider result supplied them.

Four rules make this safe:

1. **Evaluate in order: transport, envelope, task, structure.** Handle HTTP-level
   failures (authentication, payment, server error) first; then the
   response-level status; then locate the task whose id CiteLadder submitted;
   then interpret that task's own `status_code`; then validate the completed
   result's structure. "Task status is authoritative" means authoritative **for a
   matched task inside a valid response** — it never licenses ignoring a transport
   or envelope failure.
2. **Status codes come from a config table, never from an inline comparison.**
   `20100` is Task Created; the queued/in-progress codes documented at
   `/v3/appendix/errors` are confirmed in PR 2 and encoded in
   `core/config/dataforseo.py`. A numeric `4xxxx` code does not imply failure —
   some are pending states — so no range test is written anywhere.
3. **Absence is only absence when the task is confirmed complete.** An empty
   `tasks[]`, `result[]` or `items[]` is `parser_error` unless that exact response
   shape has a documented, fixture-tested meaning of successful observation. The
   default for an unrecognised shape is an explicit error, never `no_ai_overview`.
4. **Finalization is coherent.** The observation row, the `ResponseAnalysis` and
   its child mention and citation rows commit together. An interrupted write must
   not leave an observation permanently marked `ai_overview_present` with no
   analysis behind it. This is a requirement on the new wiring, not a claim about
   the existing implementation.

`asynchronous_ai_overview` is **not** a pendency signal — the committed sample
carries `false` alongside a fully populated block. It is recorded as evidence and
read by nothing.

`no_ai_overview` is the only outcome that may set `aio_present = false`.

### Result contracts

`AnswerEngineRequest`/`AnswerEngineResponse` stay untouched for LLM surfaces. A
parallel pair is added in `connectors/search_surfaces/contracts.py`:

```
SearchSurfaceRequest    query, location_code, language_code, device, depth,
                        load_async_ai_overview, timeout_seconds,
                        provider_submission_ref
SearchSurfaceSubmission provider_task_id, submitted_at, provider_cost_microusd
SearchSurfaceResult     outcome, provider_status_code, aio_present,
                        aio_serp_position, answer_text, aio_markdown,
                        elements, links, references,
                        provider_cost_microusd, raw_payload
```

`FinishReason` (`contracts.py:19-36`) has no token for "no AI Overview present".
It is not extended; `search_ai` results never populate it.

The tracked prompt is preserved semantically, not byte-for-byte on the wire.
Two different things must not be conflated:

- **Semantic rewriting is forbidden.** No keyword translation, no stop-word
  stripping, no SEO reformulation, no truncation. A changed query measures
  something the customer is not tracking.
- **Transport escaping is required.** The provider documents a 700-character
  `keyword` limit and requires literal `%` to be sent as `%25` and literal `+` as
  `%2B`. A prompt such as `C++` or `50% off` is therefore serialised losslessly on
  the wire and is **not** a rejection case.

The stored prompt remains the source of truth; serialisation lives in one helper
with round-trip coverage for `C++`, `50% off`, `a+b`, and a prompt at exactly the
700-character boundary. Only a prompt that cannot be represented losslessly — or
that exceeds the limit after escaping — is rejected, by name.

### Adapter protocol

`build_adapter` (`factory.py:27-60`) becomes a dispatch keyed on `surface_kind`
first. An `llm` route returns today's adapters unchanged. A `search_ai` route
returns a two-phase adapter:

```
async def submit(request: SearchSurfaceRequest) -> SearchSurfaceSubmission
async def fetch(provider_task_id: str) -> SearchSurfaceResult
```

`provider_submission_ref` is a **required** field on `SearchSurfaceRequest` and is
serialised verbatim as the provider `tag`. The adapter receives it as an argument
like every other input: it never reads it from the database, and it never holds it
in mutable instance state between calls. Reconciliation identity depends on that
value surviving unchanged from the committed intent to the wire.

The `if/elif` transport chain is replaced by a module-level dict now that a fourth
member exists; this is a refactor of existing code, not new behaviour, and belongs
in the same slice.

### Raw evidence

`RawResponseArtifact` (`models/audit.py:406-446`) is reused as-is. The complete
DataForSEO task object — including `organic`, `people_also_ask`, `popular_products`
and every other item type — is stored in `provider_metadata`. `answer_text` holds
the extracted visible answer so the existing scorer can read it. `citations` holds
the normalised root references. Nothing outside the parser reads the untouched item
types, and no projection exposes them.

### Observation projection

Google AIO does not get its own analysis path. The parser produces exactly the
inputs the existing pipeline already consumes, plus one surface-specific row.

- **`AioObservation` is keyed on `task_id`, not `analysis_id`**, and is written
  **once, when the task reaches a terminal outcome**. A failed or abandoned task
  never reaches `analyze_task` and therefore never has a `ResponseAnalysis`, so an
  outcome hanging off the analysis row would be unrecordable exactly when it
  matters most. In-flight states stay on `AuditTask` and never create an
  observation. Columns: `outcome` (the five terminal values), `error_code` (set
  only for `execution_failure`), `provider_status_code` (nullable),
  `aio_present` (**nullable** — null for every non-observation outcome),
  `aio_serp_position`, the frozen `location_code` / `language_code` / `device`,
  `provider_task_id`, `provider_connection_id`, `provider_submission_ref`,
  `element_count`, `reference_count`, `observed_at` (nullable),
  `retrieved_at`. Unique on `task_id`. Cost lives on `ExecutionCostProjection`,
  not here.
- `ResponseAnalysis`, `BrandMention`, `CompetitorMention` and `Citation` are
  written only for `ai_overview_present` and `no_ai_overview`, through the
  unchanged `analyze_task` path. `uq_response_analysis_task`
  (`models/analysis.py:96-100`) makes that write idempotent and already exists.
- **No `mention_order` field and no duplicated `mentioned` flag.** Order comes
  from `brand_position` / `competitor_position` at read time, over the offsets the
  scorer already persists. The UI may label it "Mention order"; the calculation is
  not repeated and not stored.
- `AioEntityLink` records **inline `links[]` only** — never references. One row
  per (observation, entity, link), with the link URL, its domain and the element it
  came from, independent of whether the entity was named in the answer text.
  Deriving it from references as well would make every citation-only entity look
  linked and destroy the independence this exists to preserve.

Three independent sources, no duplication:

| Signal | Source of truth |
|---|---|
| Mentioned | `BrandMention` / `CompetitorMention`, from answer text |
| Linked | `AioEntityLink`, from inline `links[]` |
| Cited | `Citation`, from root `references[]`, by URL identity |

The evidence view composes these three; it never uses link rows as the master
entity list. Acceptance fixtures, which must all pass:

| Evidence for the configured brand | Mentioned | Linked | Cited |
|---|---|---|---|
| Brand name in answer text only | yes | no | no |
| Owned URL in root references only | no | no | yes |
| Owned URL in inline links only, no textual mention | no | yes | no |

## Measurement contract

Keeping AIO in the composite is a product decision; it is not a substitute for
deciding what each rate divides by. Failed and pending observations are excluded
from every denominator below. An empty denominator yields **unavailable**, never
`0%` — the codebase already treats unknown, zero and unavailable as distinct
states (`docs/invariants.md`).

| Metric | Numerator | Denominator |
|---|---|---|
| AIO trigger rate | Observations with `aio_present` | All successful Google observations |
| Brand mention rate when AIO appears | AIOs naming the brand | Successful observations **containing** an AIO |
| Overall AIO brand visibility | AIOs naming the brand | All successful Google observations |
| Owned-citation rate when AIO appears | AIOs citing an owned domain | Successful observations containing an AIO |
| Competitor mention rate (per competitor) | AIOs naming that competitor | Successful observations containing an AIO |

These answer different questions and must be labelled as such. With 100 successful
observations, 40 AIOs and 10 brand mentions: trigger rate 40%, conditional mention
rate 25%, overall AIO visibility 10%.

For the **composite visibility score**, a successful `no_ai_overview` observation
is a completed execution with an empty answer and therefore contributes measured
absence to the per-prompt components, exactly as the existing scorer treats an
answer that never names the brand. That is the correct treatment and it is
deliberate; it is stated here so it is not discovered later as a surprise.

**Search context is frozen at admission.** `location_code`, `language_code`,
`device`, the route and its configuration version are snapshotted into the task's
`request_snapshot` when the task is created, alongside the query. A queued
execution never re-reads mutable project settings. `observed_at` (when the SERP
was captured) is persisted separately from `retrieved_at` (when CiteLadder
collected it).

**Cohort changes are visible, not silent.** Adding a fourth surface, or changing a
project's location, changes what is being measured. Trends already refuses to fold
buckets across analyzer or scoring versions
(`domain/analysis/trend_folding.py:269-311`); the same discipline applies here —
the measurement cohort is part of the folding identity, so a cohort change appears
as a change in what is measured rather than as an unexplained rise or fall in
brand performance.

## Parsing contract

One pure module, `analysis/search_surfaces/ai_overview.py`, with no I/O:

1. Unwrap `tasks[]`, then `result[]`, then `items[]`, applying the **Outcome
   contract** at each level. Never infer absence from an unrecognised shape.
2. Select the single item with `type == "ai_overview"`. Record its `rank_absolute`
   as `aio_serp_position`. This is the position of the **block on the SERP**, not
   a brand rank, and the field name must keep saying so.
3. Extract the visible answer through **one canonical function** that walks the
   element tree in document order and handles every supported element type —
   paragraph text, titles, list and table content — with a defined markdown
   fallback when an element carries `markdown` but no plain text, and explicit
   guards against emitting the same content twice. A brand named inside a table
   cell is named in the answer; a text-only loop over `items[].text` would miss it.
   An element type the function does not recognise is `parser_error`, not silent
   omission.
4. **Reference cards are never appended to the answer body.** Concatenating a
   card's title or snippet into `answer_text` would manufacture a mention the
   answer never made. Note the converse is also not true: a brand name appearing
   in a reference card does not make that reference a citation *of* that brand.
   Citation attribution follows URL identity and nothing else — a third-party
   article titled "Alternatives to Brand X" is a citation of the third party.
5. Collect `links[]` from every element into one deduplicated list keyed by
   canonical URL, retaining which element each came from.
6. Take **root `references[]` only** as the citation set. Nested
   `items[].references[]` are retained inside the raw payload and ignored by the
   projection: the root array is the complete cited-source set, while per-element
   references attribute sources to individual passages. The sample file confirms
   these are duplicates; ingesting both would double every citation count in
   Sources.
7. Normalise every reference domain through the existing
   `registrable_domain` (`connectors/web_evidence/url_policy.py:510-525`), so
   `www.bestandless.com.au` and `bestandless.com.au` are one identity, while URL
   identity stays separate from domain grouping.
8. Classify Google-owned reference hosts as a Google source. A
   `www.google.com/search?...prds=...` Shopping URL is never an owned citation for
   the brand named beside it, and never a competitor citation. The sample response
   contains two such references and is the fixture for this rule.

## Execution lifecycle

The existing model is one attempt equals one call. A polled surface needs a third
state, added without weakening that rule:

```
intent  →  submit  →  park (awaiting_provider_result)  →  poll  →  finalize
```

### Submission integrity

Local deduplication is not submission idempotency. `uq_response_analysis_task`
prevents a duplicate **analysis**; it does nothing about a duplicate **paid task**.
DataForSEO charges at submission, so the dangerous sequence is: POST accepted →
worker dies before persisting `provider_task_id` → retry submits and pays again.

- A **submission intent** is committed before the POST: `provider_submission_ref`
  (a stable correlation identifier derived from the task's existing idempotency
  key) and `provider_task_submitted_at`, written and committed in their own
  transaction. A task carrying a submission ref has already attempted a paid
  submission.
- A **timeout or connection failure after POST is an uncertain submission**, not
  permission to submit again. The task moves to `submission_uncertain` and is
  reconciled against the provider.
- **A reclaimed task carrying a submission intent but no `provider_task_id` enters
  reconciliation**, whatever killed it. This closes the gap between a handled
  network timeout and a process that died before it could handle anything — the
  committed intent is the only evidence either way, and it is enough.
- **Reconciliation contract.** `provider_submission_ref` is sent as the task `tag`
  at submission (255-character limit). Recovery lists the bound account's SERP task
  ids with metadata enabled, over a bounded `datetime_from`/`datetime_to` window,
  paginated by `limit`/`offset`. The endpoint returns uncompleted as well as
  completed tasks, which is exactly the case that matters. Matching requires the
  tag **and** the expected request context from the returned metadata — never the
  keyword alone, which is not unique across projects or repetitions.
- **Reconciliation is batched per account, not per task.** The provider caps this
  endpoint at 10 calls per minute and 1,000 ids per call, and the metadata window
  is narrower than the plain window. One bounded sweep per account resolves every
  uncertain task it finds; a scan per uncertain task would exhaust the budget.
- **Context narrows; only the tag proves identity.** Account, time window and the
  frozen request context reduce the candidate set. They do not establish which
  local task produced a provider task. Two repetitions of the same prompt, from the
  same account, with the same location, language, device and depth, have identical
  contexts — and after the tag is removed they are indistinguishable. Binding on
  context or nearest timestamp would not fail loudly: CiteLadder would retrieve and
  analyse a real AI Overview and attach it to the wrong repetition, or attach one
  provider result to several local tasks.

  **A recovered provider task is bound only after its tag is verified equal to
  `provider_submission_ref`**, from id-list metadata or from verified task response
  data. Missing, absent or ambiguous identity is not resolved by guessing: the task
  stays `submission_uncertain` and terminates as `execution_failure` with
  `error_code = submission_unreconciled`. **There is no context-only fallback.**
- **Verify the tag round-trips before depending on it.** The provider documents
  `tag` on submission and returns it in task response data, and documents metadata
  on the id listing — but the published metadata example does not show the tag. PR 3
  confirms the round trip against the live account as its first task. If the tag
  cannot be read back, reconciliation is unavailable and uncertain submissions
  terminate unreconciled; that is the correct outcome, not a reason to relax the
  identity rule.
- **The plan does not claim exactly-once submission.** It claims
  at-most-one-unreconciled submission and an honest state when that cannot be
  proven.
- **Once a `provider_task_id` exists, retry means retry retrieval.** A provider
  error during a poll never re-enters submission. Replacing a task is permitted
  only under an explicit terminal-error policy in config, and it writes a new
  submission ref so the replacement is distinguishable in the cost record.

### Credential affinity

DataForSEO task ids are scoped to the client account that created them. Re-running
`resolve_execution_credentials` at poll time could select a different account after
a settings change and produce a "task not found" that looks like a provider fault.
The submitting `provider_connection_id` and `credential_revision` are persisted at
submission and used for every subsequent poll. If that connection is rotated,
paused or deleted while a task is in flight, the task terminates as
`outcome = execution_failure` with
`error_code = credential_unavailable_for_retrieval`, rather than silently retrying
against a different account. That is an error code under an existing terminal
outcome — **not a sixth terminal value.** The terminal vocabulary stays at five. No additional plaintext secret is persisted — only the
connection reference.

### Queue mechanics

- **Submit** writes the task id and parks the row with
  `status = awaiting_provider_result` and `available_at = now + poll_interval`,
  reusing the mechanics of `park_capacity_wait()`
  (`postgres_task_queue.py:396-419`).
- **Poll** increments `provider_poll_count` and either re-parks, retries or
  finalizes, according to the provider's own answer:

  | Provider says | Behaviour |
  |---|---|
  | Task queued or in progress (e.g. `40601` handed, `40602` in queue) | Re-park and poll later. No attempt spent. |
  | Retrieval itself failed transiently — transport error, timeout, envelope-level fault | Spend a **retrieval attempt**, back off, poll the same task again. Never resubmit, never consume a customer unit. |
  | Task definitively failed (e.g. `40103` task execution failed), or returned the partial outcome this plan excludes | **Finalize immediately as `provider_error`**, preserving the provider's code. |

  Re-polling a task the provider has already declared failed is the bug this table
  prevents: it would burn the poll ceiling and then report
  `poll_ceiling_exceeded`, destroying the real cause. Note that `40103`, `40601`
  and `40602` are all `4xxxx` — which is exactly why no numeric range test is
  permitted anywhere.

- **Automatic replacement submission is disabled in V1.** `40103` advises posting
  another task, but a replacement is a second paid submission and its
  customer-charging rule is still an open owner decision. Leaving the replacement
  policy empty avoids shipping half-specified billing behaviour; it does not affect
  ordinary retrieval retries.
- **Ceiling.** Exceeding `provider_poll_count` terminates the task as
  `execution_failure` with `error_code = poll_ceiling_exceeded`. It never becomes
  `aio_present = false`.

### Retry accounting

Three counters that a single `attempt_count` would silently merge. **Customer
consumption is never derived from `attempt_count`.**

| Concept | What it counts | What it governs |
|---|---|---|
| Retrieval attempt | Failed polls and their retries | Retry limits and backoff only. Never billing, never quota. |
| Customer run unit | One admitted observation | The shared budget and the interim SERP allowance. Incremented at admission, once. |
| Paid provider submission | Each POST that reached the provider | Provider cost reconciliation. A permitted replacement submission is a second paid submission and is recorded as one. |

The provider charges only for setting a task and documents retrieval as free, so
a single submission followed by any number of failed polls costs the customer
exactly one unit and the provider exactly one charge. A replacement submission,
permitted only under the explicit terminal-error policy, follows whatever charging
rule the owner sets for replacements — but it is charged as a submission, not as a
retry.

Test to add: submit once, return transient retrieval errors, then complete.
Customer consumption must be unchanged across the whole sequence.
- **Recovery.** Because completion is polled rather than pushed, a missed
  notification is not a failure mode. A row parked with a `provider_task_id`
  survives a worker restart and is re-claimed by the normal queue sweep;
  `release_expired_detailed()` (`postgres_task_queue.py:463-541`) needs a branch
  so it does not treat a parked row as an expired lease.
- **Batching.** Where the provider supports it, submission and collection batch
  across tasks within one poll pass, bounded by config.
- **Idempotency.** A re-poll landing after finalization is a no-op: the
  `uq_response_analysis_task` constraint plus the existing check-then-insert in
  `analyze_task` (`analysis/service.py:200-250`) guarantees a second write cannot
  duplicate mentions or citations. This codebase's idempotency style is unique
  constraint plus pre-check, not upsert; follow it.

### Cost accounting

The provider charges when the task is set, not when it is retrieved. Everything
below follows from that.

- **The submission charge is persisted immediately**, from the POST response, as
  soon as the submission is known to have landed. A task whose credentials are
  withdrawn before retrieval, or whose retrieval never succeeds, has still cost
  money; its cost record must say so.
- **Later provider-reported totals reconcile against that record; they never add
  to it.** Repeated retrieval of the same task must not book its reported cost a
  second time. Reconciliation is keyed on `provider_task_id`.
- **The asynchronous-AI-Overview surcharge is a breakdown line, not an addition.**
  The provider documents an extra $0.0006 for `load_async_ai_overview`, refunded
  in full when the element is absent or carries `asynchronous_ai_overview: false`
  — which is exactly what the committed sample shows. Record it as a component of
  the total and record the refund as a confirmed adjustment. Do not add it to an
  already-inclusive provider total.
- **An uncertain submission is financially unknown or partial, never zero.**
  `projection_status` carries that distinction and must be used for it.
- **Estimated route cost stays an estimate** until reconciled. It is what funded
  admission reads before execution; it is never presented as what was charged.

`ExecutionCostProjection` (`models/audit.py:449-517`) remains the single
authoritative cost record, with its existing
`provider_reported_cost_microusd` and `projection_status` of
`complete|partial|unknown`. `AioObservation` carries no cost field, so a second
independent cost calculation cannot grow there.

## Project configuration

The specification asks to "enable Google AIO for a project". No project-level
engine list exists — the set is per `AuditSchedule` (`models/audit_schedule.py:62`).
Introducing a project-level engine roster would fork the source of truth.

Instead: search context becomes project configuration, and surface selection stays
where it is. `Project` gains `serp_location_code`, `serp_language_code` and
`serp_device` (default desktop), reusing existing market/country configuration as
the seed when present. One location, one language, one device per project. A
schedule or manual run includes `google_ai_overview` in its `engines` list exactly
as it includes any other surface, and the run is rejected at admission — not left
to fail repeatedly — when the surface is selected without configured credentials.

## Slices

Five pull requests. Each is independently reviewable and leaves the tree green.
**The surface is not executable until PR 4.** PR 1 exposes credential setup and
PR 3 builds the lifecycle, but `adapter_shipped` stays false and the engine stays
unselectable in run and schedule creation until the complete path — connector,
lifecycle and analysis — works end to end. A half-wired fourth engine that
customers can select is worse than no fourth engine.

**PR 1 — Surface model and credentials.** `surface_kind` on `MeasurementRoute`;
the fourth engine and transport in the catalog with its type annotation widened;
`validate_engine_and_range` unlocked; the frontend zod enums
(`lib/api/schemas/providers.ts:11-12`) and `ENGINE_ORDER`/`ENGINE_LABELS`/
`TRANSPORT_LABELS`/`ENGINE_DOMAINS`/`ENGINE_LOGOS`
(`lib/providers/catalog.ts:22-52`) widened; the DataForSEO credential shape, its
`GET /v3/appendix/user_data` probe, and the Settings card.
`provider-settings.tsx:73` `[0,1,2]` becomes length-derived and the
`xl:grid-cols-3` grid is re-tuned for four cards. Ends with credentials that save,
validate and show state. Catalog entry remains `adapter_shipped=False`.

**PR 2 — Connector and parser.** `connectors/search_surfaces/` with the
two-phase DataForSEO adapter and its contracts; `build_adapter` converted to a
`surface_kind`-then-transport dispatch dict; the provider status-code families
confirmed against documentation and encoded in config; the pure AI Overview parser
including the canonical visible-answer extractor and the keyword-limit validator.
Tested against the committed Live sample plus hand-built fixtures for no-AIO,
malformed, unknown-element-type, table-content, reference-card-only-brand, and
Google-Shopping-reference cases. No queue changes, no persistence. This is where
the outcome contract, the duplicate-reference rule and the Google-source rule are
proven.

**PR 3 — Execution lifecycle.** Begins by confirming the `tag` round-trip against
the live account, because the reconciliation contract depends on it. Then: the
`awaiting_provider_result` and `submission_uncertain` states; submission intent
committed before POST; the tag-based batched reconciliation sweep; credential
affinity; retry-retrieval-never-resubmit discipline; the three-counter retry
accounting; the submit/park/poll/finalize shape in the worker; `AuditTask`'s
provider-task columns; the sweep branch for parked rows; batching; submission-time
cost persistence and reconciliation; the interim SERP allowance consumed before
the shared budget; admission rejection when credentials are missing. Standard
POST/GET fixtures replace the Live sample here. Concurrency and crash-recovery
coverage runs against real PostgreSQL, including a process killed between POST and
persisting the task id.

**PR 4 — Analysis, projections and activation.** `AioObservation` keyed on
`task_id` written for every terminal outcome; `AioEntityLink`; the parser output
wired into `analyze_task` so `ResponseAnalysis`, `BrandMention`,
`CompetitorMention` and `Citation` are written through the unchanged scorer;
mention order read through `brand_position`/`competitor_position`; the
measurement-contract denominators; `AI_SOURCE_TO_LOGICAL_ENGINE` entry;
verification that Sources → Domains, Sources → URLs, the `Used` distinct-prompt
count (`domain/analysis/source_projection.py:231-285`), Trends and the composite
score all pick the surface up without formula changes.

**Activation happens here, and it carries its own minimum UI.** The catalog entry
flips to `adapter_shipped=True` and the engine becomes selectable only once run
status can show pending, failed and no-AIO as distinct, legible outcomes, and the
prompt-level view can show the AIO text and its citations. An executable surface
whose results cannot be understood in the app is worse than an unavailable one.
PR 5 does the full treatment; PR 4 does the minimum that makes activation
defensible. Any projection that does not pick the surface up is a defect fixed in
this PR.

**PR 5 — Surfaces and sweep.** The full evidence view
(`components/runs/evidence-card.tsx`) rendering AIO text, SERP position,
brand/competitor presence composed from the three independent mention, link and
citation sources, and references; surface filters across Trends and Sources; the
AIO-specific rates with their denominators labelled; and the copy sweep —
`lib/marketing-content/faq.ts:47`, `compare.ts:106,125,165,211,266`,
`pricing.ts:155-158`, the `rotating-engine-logos.tsx:116` aria-label, the
`globals.css:1541-1548` "Three engines, one row" block, the missing
`--color-brand-*` token, `engine-logo.tsx:3`, seed scripts
(`backend/scripts/seed_dev_data.py:276-299`, `seed_dev_runs.py:66`), the
`assert len(connections) == 3` tests, and `docs/operations/CiteLadder_Launch_Config.md:106`
which pins `engine_count: 3`.

## Boundaries

Not built in this implementation, in any slice: Google AI Mode; Google Search
Console integration; organic rank tracking; keyword tracking; People Also Ask;
Related Searches; Popular Products; Local Pack; Google Reviews; refinement chips;
query fanouts derived from SERP features; automatic query rewriting or
SEO-keyword translation of tracked prompts; mobile and desktop comparison;
multi-country tracking; crawling AIO citation URLs; content recommendations
derived from AIO gaps; a Google-only dashboard; a Google-only sources table; a
`target` parameter on any request.

The response contains enough data to become a general SERP platform by accident.
Every one of those exclusions is a boundary, not a backlog.

## Acceptance

The work is complete when all of the following hold. The tests that matter are the
boundary cases, not breadth: incomplete retrieval versus genuine absence,
crash-after-submit recovery, repeated retrieval without duplicate charges, and the
three shipped engines producing byte-identical output.

1. DataForSEO credentials save, update, remove and validate from Settings via a
   non-billable probe, are never returned to the browser after storage, and show
   connected, invalid and unavailable as distinct states.
2. The surface is unselectable until PR 4, and becomes selectable only alongside
   run-status and evidence presentation that can render pending, failed and no-AIO
   distinctly. A run selecting it without credentials is rejected at admission
   rather than failing repeatedly.
3. Tracked prompts are never semantically rewritten, translated or truncated, and
   carry no `target` parameter; location, language and device are frozen into
   `request_snapshot` at admission. `C++`, `50% off` and a 700-character prompt
   round-trip losslessly through provider escaping; only a prompt that cannot be
   represented, or that exceeds the limit after escaping, is rejected by name.
4. Terminal outcomes are persisted on `AioObservation` for **every** terminal
   task, including those that never produce a `ResponseAnalysis`. In-flight states
   live on `AuditTask` and create no observation. Evaluation order is transport,
   envelope, matched task, structure; no numeric status range test exists anywhere.
   An unrecognised response shape is an error, not absence. Only `no_ai_overview`
   sets `aio_present = false`; `execution_failure` leaves it null.
5. An observation never persists as successful with its analysis missing: the
   observation, the analysis and its child rows finalize coherently.
6. A crash between POST and persisting the task id does not produce a second paid
   submission. A reclaimed task holding a submission intent without a task id
   enters reconciliation regardless of how it died; reconciliation is batched per
   account within the provider's call budget.
7. **A provider task is bound only on a verified tag match.** Two otherwise
   identical submissions — same account, prompt, location, language, device, depth
   and window — whose tags cannot be read back are never reconciled by guessing:
   both terminate as `submission_unreconciled`. No code path binds on request
   context or nearest timestamp.
8. A definitively failed provider task finalizes as `provider_error` preserving the
   provider's code, and is never re-polled into `poll_ceiling_exceeded`. Pending
   codes re-park without spending an attempt; transient retrieval faults spend a
   retrieval attempt and re-poll the same task. No numeric status range test exists.
   No automatic replacement submission is issued.
9. Failed polls and their retries change retry state only. Customer consumption is
   never derived from `attempt_count`: one submission followed by any number of
   transient retrieval errors consumes exactly one customer run unit.
10. A task whose submitting connection is rotated, paused or removed mid-flight
    terminates with a named outcome rather than polling a different account.
11. AI Overview text is extracted by one canonical function covering every
    supported element type, including table content; reference-card text never
    enters `answer_text`; an unrecognised element type is a parser error.
12. `rank_absolute` is persisted as a SERP block position and never as a brand rank.
13. Brand and competitor mentions come from the existing scorer and existing project
    aliases. Mention order is read through `brand_position`/`competitor_position`;
    no second ordering field exists.
14. Mentioned, linked and cited come from three independent sources and all three
    fixtures pass: brand in answer text only (mentioned, not linked, not cited);
    owned URL in root references only (cited only); owned URL in inline links only
    (linked only). `AioEntityLink` is populated from inline links and never from
    references, and the evidence view composes the three rather than treating link
    rows as the entity list.
15. Root references become `Citation` rows; nested element references do not.
    Re-parsing the committed sample yields exactly five citations, of which the two
    `www.google.com` Shopping references are Google sources attributed to no brand.
16. Sources → Domains and Sources → URLs include the surface, `Used` counts
    distinct prompts, and two citations of one domain within one prompt count once.
17. Every published rate states its denominator, excludes pending and failed
    observations, and renders unavailable rather than 0% on an empty denominator.
18. The composite visibility score includes the surface with no change to
    `_composite_visibility_score` or `_prompt_composite`, and a cohort change is
    legible in Trends rather than appearing as a performance movement.
19. The submission charge is persisted at POST and later totals reconcile against
    it rather than adding to it; repeated retrieval books no second charge; the
    asynchronous-AIO surcharge and its refund are breakdown lines within the total;
    an uncertain submission is partial or unknown, never zero;
    `ExecutionCostProjection` is the only cost record. The complete task object is
    retained as raw evidence, and no projection reads any item type other than
    `ai_overview`.
20. A rerun or a late poll duplicates no mention, citation, source usage or
    competitor observation, and no historical observation is overwritten by a newer
    SERP.
21. Nothing in the codebase asserts, counts or renders exactly three engines, and
    the existing three-engine behaviour is unchanged in its outputs.
22. No excluded scope from **Boundaries** has been introduced.
