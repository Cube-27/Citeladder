# v8 backend Part A — Slice 1 detailed plan

### Summary

Add an offline-first measurement and execution-policy foundation, then extend the current concurrent audit worker with database-coordinated capacity and safe funded credentials. Preserve immutable artifacts, claim-before-I/O, cooperative cancellation, existing deterministic analysis, and the legacy prompt-framing benchmark modes. Periodic audit schedules are deferred in full to follow-up PR3.

### Product contract

**Goals and success criteria**

- Every successful provider response records normalized token classes, search count, canonical termination, and explicit known/unknown cost state.
- Every audit freezes `measurement_mode`, route/model, retrieval, output policy, reasoning effort, timeout, attempt budget, credential identity, pricing/formula versions, `trigger="manual"`, and funded reservation identity before execution.
- Multiple workers coordinate provider starts and in-flight capacity without Redis; funded saturation is visible as a queued-capacity state rather than a hung run.
- Platform-funded execution never occurs when expected cost is incomplete and never silently replaces a failed BYOK key.
- Pulse mode ships enabled with a config-owned **UNMEASURED CANDIDATE** concise instruction; no code, docstring, test, or user-facing copy may attribute the frozen document’s −56% cost / −49% latency figures to this candidate until T1 runs against live keys.
- All measurement code is executable offline against committed non-sensitive fixtures; no live provider calls are made in this PR.

**Users and behavior**

- Manual users can request the existing prompt-framing `benchmark_mode` plus a separate measurement mode. Invalid or unavailable execution policy returns a safe 422 before tasks are queued.
- BYOK is preferred. If no healthy BYOK connection exists, platform credentials are eligible only when the entitlement resolver authorizes funded execution and the complete expected-cost/reservation contract succeeds.
- A BYOK authentication failure pauses that provider connection and produces a safe failed status; it does not retry with a platform key.
- Funded capacity saturation leaves tasks in `capacity_wait`, emits a persisted event, and retries after the shared bucket’s next-eligible time.
- `benchmark_cadence` remains an entitlement key returned by the resolver, but PR1 has no dispatcher consuming it. Every PR1-created audit freezes `trigger="manual"`.

**Non-goals**

- Live-provider measurement, fabricated OpenAI/Google pricing, prompt caching, Redis, frontend work, mid-call cancellation, provider calls from report/read paths, or enabling a batch route without fidelity evidence.
- Any audit schedule schema/API/dispatcher, DST handling, delayed ticks, or periodic audit runner; all are deferred to first-priority follow-up PR3 after PR1 and PR2.
- Any long-running periodic service or interval callback added to `backend/app/workers/audit_worker.py`. Periodic work in this scope is exposed only as bounded, idempotent one-shot scripts under `backend/scripts/` for later deployment-cron invocation.
- Replacing `consumer_like | controlled_localized | forced_grounded`; these remain prompt-framing choices.
- Owning the grant model or consumable ledger implementation. This slice consumes their resolver/reservation interface only.

**Acceptance criteria**

- AC1: fixture sweeps emit JSONL execution rows plus route-cost and output-distribution summaries with no secret or sensitive prompt data.
- AC2: absent/invalid usage produces nullable fields and `partial`/`unknown`, never numeric zero; a new pricing version appends another row for the same artifact.
- AC3: adapters obey the frozen request’s retrieval flag, reasoning effort, output cap, and timeout; parsers preserve raw finish metadata while exposing only canonical finish reason to gates.
- AC4: retries cannot exceed the task’s frozen `max_attempts`; one provider call produces one attempt row and one external ledger-attempt call.
- AC5: simulated concurrent workers respect transport, connection, funded-global, and funded-account limits; 429 cooldown is shared at pool level; startup rejects an undersized DB pool.
- AC6: batch flags remain off and PR1 exercises the batch path only through fixtures and bounded one-shot service tests; normalized evidence matches synchronous fixtures and item failures stay isolated.
- AC7: tenant provider APIs expose only BYOK rows and never the reserved system workspace; keys remain encrypted and absent from DTOs/logs/snapshots/artifacts.
- AC8: a Part-B dev-only login cannot resolve platform-funded credentials or enter the reserved system workspace unless its separate gate is enabled; the gate defaults off and production startup fails if it is enabled.
- AC9: read-path regression tests make zero adapter/provider calls.
- AC10: feature commits change ORM models only; the single PR1 schema integrator regenerates `migrations/versions/0001_initial.py` once from the combined model set, and clean upgrade/downgrade plus `alembic check` pass on a disposable database.
- AC11: audit/execution/Visibility/export reads expose canonical `measurement_mode`, model provenance, and retrieval state; trend series never mix mode/model/retrieval identities.
- AC12: audit SSE resumes from validated UUID `Last-Event-ID` and emits a strict discriminated event envelope.

## File structure map

### Measurement and policy

- `backend/scripts/measure_answer_engine_matrix.py` — CLI entry point; offline by default, explicit `--live` opt-in, sweep orchestration, output writing.
- `backend/app/domain/measurement/harness.py` — typed matrix cases, fixture/live runner protocol, timing/quality aggregation.
- `backend/app/core/config/measurement.py` — fixed prompt fixture path, output paths, matrix dimensions, gate thresholds, and artifact schema version.
- `backend/tests/fixtures/answer_engines/measurement_prompts.json` — fixed 10–20 brand-neutral prompts.
- `backend/tests/fixtures/answer_engines/{openai,anthropic,google}/*.json` — response fixtures plus deterministic timing metadata (`queue_wait_ms`, `ttft_ms`, `wall_time_ms`) because current adapters are non-streaming.
- `backend/docs/measurements/v8/slice1-fixture-run.json` — committed fixture-derived run manifest and explicit unset values; never presented as live measurement.
- `backend/docs/measurements/v8/slice1-gates.md` — checked gate matrix and deferred-live record.
- `.gitignore` — ignore local live output under `backend/var/measurements/` while retaining committed fixture artifacts.
- `backend/app/core/config/costs.py` — pricing/expected-cost catalogues and versions.
- `backend/app/core/config/audits.py` — measurement modes, the UNMEASURED CANDIDATE pulse instruction, output policies, and retry/capacity settings.
- `backend/app/core/config/provider_catalog.py` — route policy including representative-model status, reasoning pin, batch eligibility, and provider finish mapping.

### Connector and cost persistence

- `backend/app/connectors/answer_engines/contracts.py` — frozen request policy, canonical finish enum, typed normalized usage.
- `backend/app/connectors/answer_engines/{openai,anthropic,gemini}.py` — conditional search, per-request output/reasoning policy, timing instrumentation contract.
- `backend/app/connectors/answer_engines/{openai_parser,anthropic_parser,gemini_parser}.py` — canonical finish and usage normalization.
- `backend/app/domain/audits/cost_projection.py` — nullable normalization, catalogue formula, append-only projection builder/repricing.
- `backend/app/models/audit.py` — finish-reason storage, versioned projections, capacity rows, and batch jobs/items.
- `backend/app/models/provider.py` — credential source and safe pause state.
- `backend/app/models/__init__.py` — model registry exports.
- `migrations/versions/0001_initial.py` — touched only by the single PR1 schema integrator after combined ORM changes; no feature commit and no `0002`.

### Execution, credentials, and one-shot operations

- `backend/app/domain/audits/planner.py` — resolve/freeze measurement policy, manual trigger, and credential choice.
- `backend/app/domain/audits/schemas.py`, `backend/app/api/audits.py` — request/response measurement mode, resumable discriminated SSE, and trigger-safe API errors.
- `backend/app/domain/analysis/schemas.py`, `backend/app/domain/analysis/service.py`, `backend/app/analysis/exports.py` — measurement/model/retrieval provenance across Visibility reads, partitioned trends, and exports.
- `backend/app/orchestration/provider_capacity.py` — Postgres token/capacity lease acquisition, release, and pool cooldown.
- `backend/app/workers/audit_worker.py` — use frozen policy, one call per task attempt, capacity-wait state, and key-failure pause; no periodic callback.
- `backend/app/connectors/answer_engines/batch.py` — provider-neutral batch protocol and synchronous-normalization contract.
- `backend/app/domain/audits/batch_service.py` — bounded idempotent submit/poll/finalize tick used by tests and the one-shot script.
- `backend/scripts/process_audit_batches.py` — bounded one-shot batch tick for future deployment cron; PR1 does not schedule or run it continuously.
- `backend/app/domain/providers/service.py`, `backend/app/domain/providers/schemas.py`, `backend/app/api/provider_connections.py` — BYOK-only tenant surface and four-state status.
- `backend/scripts/provision_platform_provider_connections.py` — idempotent encrypted platform-key provisioning into reserved workspace.
- `README.md`, `docs/DEVELOPMENT.md`, `docs/backend-architecture.md` — one-shot operational commands and revised contracts; no new service definition.

### Periodic-runner and operator-alert rule

- Do not add a scheduler service and do not fold interval work into `backend/app/workers/audit_worker.py`.
- `process_audit_batches.py` processes at most a config-owned limit per invocation, can be safely retried, and is the only cron-shaped PR1 operation. Expired capacity leases are reclaimed transactionally during acquisition; they need no sweeper service.
- Emit named structured telemetry/log events with secret-free payloads: `audit.capacity.wait`, `audit.capacity.rate_limited`, `audit.batch.submitted`, `audit.batch.polled`, `audit.batch.item_failed`, `audit.batch.reconcile_required`, `provider.byok.paused`, `provider.platform.auth_failed`, `provider.platform.provisioned`, and `funded.execution.admission_denied`.
- Alert routing/rules are deployment configuration outside this repository; code emits events only.

## Tasks

### 1. T1 — Measurement harness [parallel]

**Files**

Create:

- `backend/app/core/config/measurement.py`
- `backend/app/domain/measurement/__init__.py`
- `backend/app/domain/measurement/harness.py`
- `backend/scripts/measure_answer_engine_matrix.py`
- `backend/tests/unit/test_measurement_harness.py`
- `backend/tests/fixtures/answer_engines/measurement_prompts.json`
- route fixtures under `backend/tests/fixtures/answer_engines/{openai,anthropic,google}/`
- `backend/docs/measurements/v8/slice1-fixture-run.json`

Modify `.gitignore` for uncommitted live output at `backend/var/measurements/`.

**Contracts and changes**

- Define `MeasurementCase(route_key, search_enabled, reasoning_effort, output_treatment, repetition)` and `MeasurementObservation` with nullable `uncached_input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_tokens`, `provider_reported_cost_microusd`, `search_fee_microusd: int | None`, and `ttft_ms: int | None`; required non-null fields are `search_call_count`, `wall_time_ms`, `queue_wait_ms`, `finish_reason`, `mention_count`, `citation_count`, and `extracted_queries`. A no-search execution has known `search_call_count=0`, but that never implies a zero provider search fee.
- Define `async run_matrix(*, cases: Sequence[MeasurementCase], prompts: Sequence[MeasurementPrompt], runner: MeasurementRunner) -> MeasurementRun` and `write_measurement_outputs(run, output_dir) -> tuple[Path, Path, Path]`.
- Sweep route × search on/off × route-supported reasoning values × `baseline | concise | capped_600` × configured repetitions. Unsupported reasoning combinations are emitted as `unsupported`, not silently skipped.
- Load 12 fixed generic prompts from the fixture; validate 10–20 count and reject project brands, domains, emails, or secrets.
- Default CLI to `--source fixtures`; require both `--live` and a typed confirmation token for network execution. Do not execute live in this PR.
- Write `executions.jsonl`, `route-costs.json`, and `output-length-distribution.json` under `var/measurements/<run-id>/`. The committed `slice1-fixture-run.json` records fixture hashes, script/schema version, generated summary, and `unset_pricing = [openai, google, all_per_search_fees]`.
- TTFT contract: fixture envelopes carry deterministic timing metadata. The live runner may report `ttft_ms = null` until a route supplies a real streaming event timestamp; wall time must never be relabeled TTFT.
- Reuse the current deterministic analysis/scoring helpers to derive mention and citation counts. Record extracted queries exactly as normalized parser output.
- Cost summaries report known line items separately; unknown rate or usage makes total cost null. Fixture output is labeled `fixture_derived=true` and cannot satisfy a live gate.

**Tests**

`backend/tests/unit/test_measurement_harness.py` asserts deterministic matrix expansion, fixture-only default, no network in offline mode, field completeness, null preservation, fixture hash/provenance, separate reasoning/search lines, output quantiles, canonical finish-only gate input, prompt-set sensitivity checks, and TTFT remaining null when no streaming metadata exists.

**Verify**

```bash
cd backend
uv run pytest tests/unit/test_measurement_harness.py -q
uv run python -m scripts.measure_answer_engine_matrix --source fixtures --output-dir var/measurements/test
```

### 2. T2 — Cost config and append-only projection [after 1]

**Files**

Modify:

- `backend/app/core/config/costs.py`
- `backend/app/models/audit.py`
- `backend/app/domain/audits/cost_projection.py`
- `backend/app/workers/audit_worker.py`
- `backend/tests/unit/test_cost_projection.py`
- `backend/tests/component/test_audit_worker.py`
- `backend/app/models/__init__.py`

Contribute the T2 ORM shape to the single shared schema-sync commit; do not edit the migration in this feature commit.

Create `backend/scripts/reprice_execution_costs.py` and `backend/tests/unit/test_reprice_execution_costs.py`.

**Config types and defaults**

- Add `RoutePricing` with nullable integer micro-USD rates per million `uncached_input`, `cached_input`, `output`, `reasoning`, nullable per-search micro-USD, `currency`, `effective_date`, and `pricing_version`.
- `backend/app/core/config/costs.py` is the sole expected-cost owner. Add `ExpectedExecutionCost(token_cost_microusd: int | None, search_fee_microusd: int | None, expected_searches: int | None, complete: bool)` and the typed accessor `expected_execution_cost(route_identity: RouteIdentity, measurement_mode: str, retrieval_enabled: bool) -> ExpectedExecutionCost`; Part B imports this accessor rather than defining a duplicate catalogue.
- `complete` is route- and retrieval-aware: missing token estimate is always incomplete; with retrieval enabled, missing per-search fee or missing expected-search count is incomplete; with retrieval disabled, search fee/count are not applicable, remain null, and neither become zero nor make the estimate incomplete.
- Add `PRICING_CATALOG_VERSION` and `EXECUTION_COST_FORMULA_VERSION`; key catalogues by immutable route identity `(logical_engine, transport_provider, transport_model)` and mode.
- Preserve only frozen Anthropic estimates: pulse token cost `2_890`, benchmark token cost `146_600`, benchmark searches `3`. Keep OpenAI/Google token estimates and every per-search fee `None`; funded admission reads `complete` and fails closed. Monthly-budget admission converts minor USD to micro-USD through the shared currency conversion constant before comparing like units.
- Do not invent provider unit rates from those aggregate observations. Catalogue rate fields remain null until externally verified; provider-reported cost can still produce a partial/complete observation independently.

**Projection schema**

`ExecutionCostProjection` becomes append-only with:

- Existing UUID PK/FKs: `audit_id`, `task_id`, `raw_response_artifact_id`, all non-null; artifact/task cascade behavior unchanged.
- `formula_version String(32) NOT NULL`, `pricing_version String(64) NOT NULL`, `projection_status String(16) NOT NULL` with config enum values `complete | partial | unknown`.
- Nullable `uncached_input_tokens Integer`, `cached_input_tokens Integer`, `output_tokens Integer`, `reasoning_tokens Integer`, `total_tokens Integer`, `search_requests Integer`, `attempt_count Integer`.
- Nullable `uncached_input_cost_microusd BigInteger`, `cached_input_cost_microusd BigInteger`, `output_cost_microusd BigInteger`, `reasoning_cost_microusd BigInteger`, `search_cost_microusd BigInteger`, `provider_reported_cost_microusd BigInteger`, `projected_total_cost_microusd BigInteger`.
- Replace unique `task_id` and unique `raw_response_artifact_id` with `UniqueConstraint(raw_response_artifact_id, formula_version, pricing_version, name="uq_execution_cost_projection_version")`; retain non-unique artifact/task/audit indexes.

**Functions**

- `normalize_optional_non_negative_int(value: object) -> int | None` and `normalize_optional_microusd(value: object) -> int | None` return null for absent, non-finite, malformed, or negative values.
- `build_execution_cost_projection(artifact, *, pricing: RoutePricing, formula_version: str, attempt_count: int) -> ExecutionCostProjection` calculates only line items for which both usage and rate are known. `projected_total_cost_microusd` is non-null only when every applicable line is known; no reader coalesces null to zero.
- `append_repricing(session, *, artifact_id, pricing_version, formula_version) -> ExecutionCostProjection` locks/loads immutable source data, inserts once by composite identity, and never updates an existing projection.
- Worker passes the persisted actual attempt count after writing `ProviderAttempt` rows.
- Repricing CLI accepts explicit versions and dry-run, never calls a provider.

**Tests**

- Replace the current “non-finite becomes zero” assertion with missing/invalid/negative → null and valid literal zero → zero.
- Assert full formula arithmetic, partial/unknown statuses, search/reasoning separation, provider-reported cost absence, composite idempotency, and two pricing versions coexisting for one artifact.
- Assert `expected_execution_cost()` for every route/mode/retrieval combination: absent token estimate fails; retrieval-on requires both fee and count; retrieval-off leaves both search fields null but can be complete; monthly budget comparison uses the shared minor-USD→micro-USD conversion constant.
- Component worker test asserts one initial projection with artifact provenance and actual attempt count.

**Verify**

```bash
cd backend
uv run pytest tests/unit/test_cost_projection.py tests/unit/test_reprice_execution_costs.py tests/component/test_audit_worker.py -q
```

### 3. T3 — Measurement-mode route/output policy and canonical response contract [after 1]

**Files**

Modify:

- `backend/app/core/config/audits.py`
- `backend/app/core/config/provider_catalog.py`
- `backend/app/core/config/projects.py`
- `backend/app/connectors/answer_engines/contracts.py`
- all three adapter/parser pairs
- `backend/app/domain/audits/{planner,schemas}.py`
- `backend/app/api/audits.py`
- `backend/app/models/audit.py`
- `backend/tests/unit/test_answer_engine_adapters.py`
- `backend/tests/unit/test_audit_guardrails.py`
- `backend/tests/component/test_audit_planner.py`
- `backend/tests/component/test_audit_worker.py`

Contribute the T3 audit/task/artifact ORM shape to the single shared schema-sync commit; do not edit the migration in this feature commit.

**Mode ownership**

- Keep `BENCHMARK_MODES = consumer_like | controlled_localized | forced_grounded` and `Audit.benchmark_mode` unchanged for prompt framing.
- Add `MEASUREMENT_MODE_PULSE = "pulse"`, `MEASUREMENT_MODE_BENCHMARK = "benchmark"`, and `MEASUREMENT_MODES` in `config/audits.py`; add non-null `Audit.measurement_mode String(16)` defaulting to `benchmark` for explicit manual compatibility.
- `AuditCreate` adds `measurement_mode: Literal["pulse", "benchmark"] = "benchmark"`. Any later PR3 schedule caller and any trial caller pass their mode explicitly; PR1 has no schedule caller.

**Policy**

- Add `MeasurementModePolicy(retrieval_enabled, max_output_tokens, timeout_seconds, repetitions, answer_instruction)` and route policy fields `reasoning_effort`, `reasoning_pinnable`, `representative_status`, `batch_enabled`.
- Defaults: pulse cap `600`, benchmark cap `4096`, pulse timeout `30`, benchmark timeout `150`, pulse reps `1`, benchmark reps `3`; `trend_smoothing_days=7`, `max_prompt_chars=300` remain config-owned.
- Set `pulse_answer_instruction = "Answer directly and concisely. Include only the details needed to answer the question."` and `PULSE_ANSWER_INSTRUCTION_SHA256 = "a7d86db3b284d8d7397125046327ac013107240255cd6ba3ee6544feaebfb69a"` in `backend/app/core/config/audits.py`. The field docstring and adjacent code comment must say **UNMEASURED CANDIDATE** and explicitly state that the −56% cost / −49% latency figures from the frozen plan do not apply to this wording until a live-key T1 run validates it. Pulse mode is enabled.
- Anthropic reasoning is pinned off. OpenAI and Google reasoning pins remain `unverified`; their cost-sensitive funded route is ineligible until fixtures/live evidence establishes a supported low value. No prompt-caching field or code path is added.
- Planner composes the existing neutral prompt-framing instruction with the unmeasured candidate only for pulse, validates prompt length, resolves repetitions from mode unless the entitlement contract permits an override, freezes `trigger="manual"`, and freezes policy into `Audit.configuration`, `AuditEngineSnapshot`, and `provider_route_snapshot`.

**Request/response contracts**

- Expand `AnswerEngineRequest` with `retrieval_enabled: bool`, `max_output_tokens: int`, and `reasoning_effort: str`; adapters use only these frozen fields for tools, cap, thinking/reasoning controls, and timeout.
- Add `FinishReason` values `stop | length | tool_error | content_filter | cancelled | error | unknown` and `NormalizedUsage` nullable fields `uncached_input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_tokens`, `total_tokens`, `web_search_requests`, `provider_cost_microusd`.
- `AnswerEngineResponse` carries `finish_reason: FinishReason`, `raw_finish_reason: str`, and typed usage.
- Provider mapping functions are explicit and unit-tested: Anthropic `end_turn|stop_sequence→stop`, `max_tokens→length`, `refusal→content_filter`, `pause_turn|tool_use→unknown`; OpenAI completed/incomplete details map length/content filter where supplied, otherwise status `completed→stop`, failed/cancelled appropriately; Gemini candidate/interactions finish reasons map stop/max_tokens/safety/recitation/error, otherwise unknown. Raw values stay in sanitized metadata.
- Keep OpenAI reasoning content and Gemini thought content dropped, but read token counts from usage detail fields. Normalize Gemini usage aliases rather than passing raw data through. Remove every `provider_cost_usd=0.0`; absent cost is null.
- Add non-null canonical `finish_reason String(24)` default `unknown` and nullable/raw `raw_finish_reason String(64)` to both `AuditTask` and `RawResponseArtifact`; only canonical `finish_reason` is used by gates.

**Tests**

- Adapter tests cover search omitted for pulse, search tools present for benchmark, exact frozen caps/reasoning settings, usage aliases including cached/reasoning tokens, absent cost null, every finish mapping, raw metadata preservation, and thought/reasoning-content redaction.
- Planner/config tests assert independent prompt-framing and measurement modes, full frozen configuration including `trigger="manual"`, no live reread, default repetitions, max prompt length, and SHA-256 equality for the exact candidate instruction so wording cannot drift silently. Tests and assertion names call it an unmeasured candidate and contain no attribution of the −56%/−49% results.
- Worker tests assert persisted task/artifact canonical/raw finish values and request snapshots without keys.
- Complexity decomposition is mandatory: existing `create_audit` (CC 23) remains an orchestration shell over precomputed policy/admission/reservation decisions and gains no new branches. Extract typed helpers for mode policy, entitlement admission, task reservation, and frozen snapshot assembly; every new/renamed function stays at or below CC 15.

**Verify**

```bash
cd backend
uv run pytest tests/unit/test_answer_engine_adapters.py tests/unit/test_audit_guardrails.py tests/component/test_audit_planner.py tests/component/test_audit_worker.py -q
```

### 4. T4 — Worker capacity, pacing, retries, and ledger boundary [after 2, 3]

**Files**

Create:

- `backend/app/orchestration/provider_capacity.py`
- `backend/tests/component/test_provider_capacity.py`

Modify:

- `backend/app/core/config/audits.py`
- `backend/app/core/config/__init__.py`
- `backend/app/models/audit.py`
- `backend/app/orchestration/task_queue.py`
- `backend/app/orchestration/postgres_task_queue.py`
- `backend/app/workers/audit_worker.py`
- `backend/tests/unit/test_audit_guardrails.py`
- `backend/tests/component/test_audit_queue.py`
- `backend/tests/component/test_audit_worker.py`

Contribute the T4 capacity ORM shape to the single shared schema-sync commit; do not edit the migration in this feature commit.

**Config defaults**

- Rename/use `worker_max_inflight=10`, `funded_pool_max_concurrency=12`, `funded_pool_per_account=6`, `per_transport_concurrency=4`; retain these frozen defaults but mark them `measurement_required` in the gate record.
- Add route-owned token-bucket `capacity`, `refill_tokens_per_second`, and max cooldown; leave unverified provider rates unset so that route pacing fails closed for funded work and BYOK uses concurrency-only until configured.
- Timeouts are mode defaults above, but `timeout_source` is recorded as Anthropic-only evidence; OpenAI/Google funded execution remains ineligible until p95 is measured.
- Set DB pool defaults to satisfy `capacity >= worker_max_inflight * worker_db_sessions_per_task + operational_headroom`; config owns `worker_db_sessions_per_task=2` and `operational_headroom`. Replace `_warn_if_pool_undersized()` with `assert_worker_pool_capacity() -> None` raising before the process loop.

**Persistence**

- Add `ProviderCapacityBucket`: UUID PK; `pool_kind String(16)`, `transport_provider String(32)`, nullable `connection_id` FK `provider_connections.id` SET NULL, nullable `billing_account_id` FK, `capacity Numeric`, `tokens Numeric`, `refill_tokens_per_second Numeric`, `refilled_at timestamptz`, nullable `blocked_until timestamptz`, `policy_version String(32)`, timestamps; unique `(pool_kind, transport_provider, connection_id, billing_account_id)` with nulls-not-distinct semantics and index on `blocked_until`.
- Add `ProviderCapacityLease`: UUID PK; `bucket_id` FK cascade, `task_id` FK cascade, `attempt_number Integer`, `lease_kind String(16)`, `units Numeric`, `expires_at timestamptz`, nullable `released_at`, timestamps; unique `(bucket_id, task_id, attempt_number, lease_kind)` and expiry index. Expiring leases recover capacity after crashes.
- Add task status `capacity_wait` to config claimable statuses. Reuse `available_at`; do not add a duplicate queued-state column. Add `EVENT_TASK_CAPACITY_WAIT`; emit structured `audit.capacity.wait` and `audit.capacity.rate_limited` events with only pool kind, transport, task/account opaque ids, and retry timing—never credentials, prompts, or provider bodies.

**Capacity functions**

- `async acquire_provider_capacity(session_factory, *, request: CapacityRequest) -> CapacityDecision` locks buckets in stable order and atomically acquires: transport, connection, then funded-global and funded-account for platform credentials. BYOK acquires transport+connection only.
- `async release_provider_capacity(..., outcome: CapacityOutcome) -> None` releases concurrency leases; token starts stay consumed. On a 429, update `blocked_until` on all relevant shared pool buckets from safe `Retry-After`/configured backoff so sibling audits see the cooldown.
- Keep process-local semaphores keyed `(transport, connection_id)` only as a low-contention optimization; database decisions remain authoritative across replicas.

**Retry correction**

- Replace `_call_with_retries(adapter, request)` with `async call_provider_once(adapter, request, *, timeout_seconds) -> CallAttempt`. One queue attempt makes one external call.
- Use persisted `task.attempt_count + 1` as the attempt identity. Persist exactly one `ProviderAttempt` and invoke the external ledger contract exactly once per actual call, including timeout. Queue retry/backoff is the sole retry loop and stops at frozen `task.max_attempts`.
- Use the task’s frozen mode timeout/max attempts, never live `audit_settings`. Preserve heartbeat, claim-before-I/O, lease-owner check, and cooperative cancellation.
- Replace existing `_run_provider_call` (CC 17) with small helpers for loading frozen execution context, validating connection/endpoint, acquiring capacity, executing one attempt, recording ledger/attempt outcome, and terminal persistence; each new/renamed helper must remain at or below CC 15.
- Consume Part B’s canonical per-task ledger contract exactly:
  - `reserve_funded_task(session, *, account_id, capability_key, audit_id, task_id, units, idempotency_key, at) -> Reservation`
  - `record_billable_attempt(session, *, reservation_id, task_id, attempt, units=1, idempotency_key, at) -> None`
  - `release_unused_reservation(session, *, reservation_id, idempotency_key, at) -> None`
- The planner creates each funded `AuditTask` and its `Reservation` in the same transaction before the task is claimable, with `units=task.max_attempts`; one audit-level reservation is forbidden because it under-reserves multi-task audits. Persist `reservation_id` in the frozen task route snapshot and audit configuration/provenance map.
- The worker uses the frozen reservation id, records one billable unit per actual provider call with a 1-based attempt number—including timeouts—and releases that task’s unused units at terminalization. Idempotency keys are deterministic per reservation action. Do not add a second ledger table here.

**Tests**

- Capacity component tests use two session factories/worker owners to prove no limit overshoot, deterministic lock order, funded-account fairness, lease expiry recovery, shared 429 cooldown, BYOK/funded separation, and `capacity_wait`/`available_at` behavior.
- Planner/worker tests assert one reservation per funded task in the same transaction as task creation, reservation units equal that task’s frozen `max_attempts`, no task becomes claimable without its frozen `reservation_id`, one 1-based `record_billable_attempt` call per actual call including timeout, and per-task unused release exactly once at terminalization.
- Worker tests assert existing pipelining remains, claim commits before capacity/provider I/O, one call per attempt, no nested retries, max-attempt ceiling, no mid-call kill, and no secret-bearing logs/events.
- Startup unit test asserts current undersized configurations raise and exact-boundary capacity passes.

**Verify**

```bash
cd backend
uv run pytest tests/unit/test_audit_guardrails.py tests/component/test_provider_capacity.py tests/component/test_audit_queue.py tests/component/test_audit_worker.py -q
```

### 5. T5 — INSTALLED DORMANT FOUNDATION: batch path for PR3 [after 2, 4]

**Files**

Create:

- `backend/app/connectors/answer_engines/batch.py`
- `backend/app/domain/audits/batch_service.py`
- `backend/scripts/process_audit_batches.py`
- `backend/tests/unit/test_answer_engine_batch.py`
- `backend/tests/component/test_audit_batch_service.py`

Modify:

- `backend/app/core/config/provider_catalog.py`
- `backend/app/models/audit.py`
- `backend/app/domain/audits/planner.py`
- `backend/app/workers/audit_worker.py`
- `backend/app/models/__init__.py`

Contribute the T5 batch-job/item ORM shape to the single shared schema-sync commit; do not edit the migration in this feature commit.

Also modify `README.md`, `docs/DEVELOPMENT.md`, and `docs/backend-architecture.md`.

**Abstraction and schema**

- Define `AnswerEngineBatchAdapter.submit(requests) -> BatchSubmission`, `poll(batch_id) -> BatchPoll`, and `cancel(batch_id) -> None`; each result is normalized through the same parser as synchronous execution.
- Add `AuditBatchJob`: UUID PK, `transport_provider`, `connection_id` FK SET NULL, `credential_source`, `provider_batch_id`, `status queued|submitted|processing|completed|failed|cancelled`, `policy_version`, timestamps, safe `error_code/detail`; unique provider batch id per transport.
- Add `AuditBatchItem`: UUID PK, `batch_job_id` FK cascade, `task_id` FK cascade, `custom_id String(128)`, status, nullable artifact id FK SET NULL, safe error fields, timestamps; unique `task_id`, unique `(batch_job_id, custom_id)`.
- This is an **INSTALLED DORMANT FOUNDATION**, not a usable PR1 execution lane. Its only production consumer is PR3 scheduled execution. PR1 creates no `trigger=scheduled` audits, keeps every route `batch_enabled=false`, exercises the path through fixtures/tests only, and no PR1 deployment configuration may invoke `backend/scripts/process_audit_batches.py`.

**Behavior**

- `async process_audit_batches_once(session_factory, *, limit: int) -> BatchTickResult` performs one bounded idempotent submit/poll/finalize pass with short sessions and DB commits before network I/O. `backend/scripts/process_audit_batches.py` invokes one pass and exits, but remains uninvoked by all PR1 deployment config; PR3 may wire deployment cron after its scheduled consumer exists. Do not add a long-running dispatcher service or an audit-worker interval callback.
- PR3 may enqueue batch-eligible scheduled tasks. Until then, every PR1 manual audit follows the synchronous lane.
- A failed item writes its own attempt/error and does not fail successful siblings. A batch-wide transport failure returns unsubmitted items to synchronous queue fallback when safe; already-submitted unknown outcomes remain pending/reconciled to avoid duplicate billable calls.
- Fidelity helper compares normalized synchronous and batch fixtures for answer, search events/call counts, citations, all usage lines, canonical finish reason, and per-item error identity. A route flag cannot be enabled unless this test passes.
- Batch path preserves the same capacity/ledger attempt contracts and immutable artifact writer rules.
- Emit secret-free structured events `audit.batch.submitted`, `audit.batch.polled`, `audit.batch.item_failed`, and `audit.batch.reconcile_required`; deployment-owned alert rules consume them outside the repository.

**Tests**

- Unit fixture tests prove normalization equality and unsupported route rejection.
- Component tests call the one-shot service directly and prove flags-off/manual synchronous behavior, synthetic scheduled eligibility, per-item partial failure, concurrent one-shot deduplication, crash-safe polling, bounded processing, no duplicate provider submissions, idempotent reruns, and no batch provider call from read endpoints.

**Verify**

```bash
cd backend
uv run pytest tests/unit/test_answer_engine_batch.py tests/component/test_audit_batch_service.py tests/component/test_audit_worker.py -q
```

### 6. T11 — BYOK and funded credentials [after 2, 3; requires external T7 resolver and T9 ledger contracts]

**Files**

Create:

- `backend/app/domain/providers/credentials.py`
- `backend/scripts/provision_platform_provider_connections.py`
- `backend/tests/unit/test_provider_credentials.py`
- `backend/tests/unit/test_provision_platform_provider_connections.py`

Modify:

- `backend/app/core/config/provider_catalog.py`
- `backend/app/core/config/__init__.py`
- `backend/app/models/provider.py`
- `backend/app/domain/providers/{schemas,service}.py`
- `backend/app/api/provider_connections.py`
- `backend/app/domain/audits/planner.py`
- `backend/app/workers/audit_worker.py`
- `backend/app/models/workspace.py`
- `backend/tests/component/test_provider_connections_api.py`
- `backend/tests/component/test_audit_planner.py`
- `backend/tests/component/test_audit_worker.py`
- `backend/tests/unit/test_production_security_config.py`

Contribute the T11 workspace/provider ORM shape to the single shared schema-sync commit; do not edit the migration in this feature commit.

**Schema and enums**

- `CredentialSource`: `byok | platform`; config precedence tuple is `("byok", "platform")`.
- `ProviderConnection.credential_source String(16) NOT NULL default "byok"`, indexed with workspace/provider.
- Add pause fields: `paused_at timestamptz NULL`, `pause_reason String(64) NOT NULL default ""`, `pause_until timestamptz NULL`. Keep `active` as operator enablement; paused is a separate recoverable state.
- Add `Workspace.is_system Boolean NOT NULL default false`; partial unique index allows one system workspace (`WHERE is_system`). System workspaces cannot have memberships and are excluded from tenant workspace lists.
- Keep two separate contracts. Public `CatalogAvailability = available | unavailable` belongs to the provider catalogue and exposes Part B’s DTO fields `unavailable_reason` and `issuable`. Authenticated `ProviderConnectionState = connected | missing | failed | unavailable` belongs to the workspace projection.
- `connected` requires at least one successful probe plus active/key-set/not-paused state. A configured key that has never successfully probed is fail-closed as `missing` with safe reason `verification required`; a failed latest probe/auth pause is `failed`; catalogue/route non-availability is `unavailable`; no configured key is `missing`. Do not infer authenticated connection state from public catalogue availability.

**Credential resolution**

- Admission receives one caller-supplied `admission_at` and calls Part B’s resolver exactly as `resolve_workspace_entitlement(session, *, workspace_id, at=admission_at) -> ResolvedEntitlement`; no helper reads the clock internally. Fail closed unless `ResolvedEntitlement.status == "resolved"`.
- For each task, select the mode-specific consumable capability key, call `expected_execution_cost(route_identity, measurement_mode, retrieval_enabled)`, then call `reserve_funded_task(..., task_id=task.id, units=task.max_attempts, at=admission_at)` in the same transaction that creates the task. A resolved allowance never proves an unspent balance: funded authorization is proven only by a successful ledger reservation.
- `async resolve_execution_credentials(session, *, workspace_id, account_id, logical_engine, entitlement: ResolvedEntitlement, reservation: Reservation | None, expected_cost: ExpectedExecutionCost, at: datetime) -> ResolvedCredential`:
  1. select a successfully probed, healthy active BYOK route in the tenant workspace;
  2. if none, require `entitlement.status == "resolved"`, complete expected cost, the successful task reservation/provenance, and a healthy platform route in the system workspace;
  3. otherwise raise `execution_credentials_unavailable` with no claimable task/provider call.
- Pass the exact `ResolvedEntitlement` plus reservation provenance into credential resolution; the credential contract has no separate funded-allowance boolean. Freeze `credential_source`, concrete `connection_id`, and task `reservation_id` into engine/task snapshots and audit configuration. Worker only loads frozen identities; it never re-resolves/falls back.
- On `ERROR_AUTH` for BYOK, `pause_connection_after_key_failure(session, connection_id, at)` sets pause reason and `pause_until = at + byok_key_grace_days` (7), records safe status, prevents new tasks, and emits `provider.byok.paused`. Existing audit becomes partial/failed through current finalization. Platform auth failures pause the platform row, emit `provider.platform.auth_failed`, and never expose system details to tenant DTOs. Failed funded admission emits `funded.execution.admission_denied`. All event payloads exclude keys, ciphertext, prompts, answers, provider bodies, and authorization headers.
- Tenant list/get/update/delete/test queries require `credential_source == byok`, workspace match, and non-system workspace. Platform rows are absent even if an ID is guessed.
- Part B owns the dev-only fixed login and seeding. T11 treats its session like any tenant session: it cannot resolve platform credentials or access the reserved system workspace unless a dedicated `DEV_TEST_LOGIN_ALLOW_PLATFORM_CREDENTIALS` gate is enabled. Add this gate to `backend/app/core/config/__init__.py`, default false, and extend `validate_production_security()` to hard-fail startup when it is true outside development/test.

**Provisioning**

- `provision_platform_connections(*, env_file/secret inputs, dry_run=False)` creates/loads the one system workspace and upserts platform connections/routes by transport. Secrets are accepted as `SecretStr`, encrypted before flush, never printed, and not read by adapters.
- Script is idempotent, supports rotation, rejects missing Fernet key, reports only transport/row ids/status, and emits `provider.platform.provisioned` without secret material. Do not call the secret-request tool or run provisioning in this work.

**External contracts**

- Part B supplies `resolve_workspace_entitlement(session, *, workspace_id, at) -> ResolvedEntitlement`, account/capability provenance, and the canonical per-task reservation APIs. This slice passes `admission_at` unchanged and never treats a resolved allowance as funded authorization.
- Each task reservation covers worst-case attempts and each immutable `(task_id, attempt)` billable row consumes one unit. This slice must not duplicate Part B’s ledger tables or APIs.

**Tests**

- API tests assert separate public `CatalogAvailability` and authenticated `ProviderConnectionState` contracts, exact DTO names `unavailable_reason`/`issuable`, never-probed configured key → `missing`/`verification required`, BYOK-only CRUD, system workspace/row invisibility, encryption/redaction in responses/logs/snapshots/artifacts, and cross-workspace denial.
- Planner tests pass an exact-boundary `admission_at`, assert it reaches `resolve_workspace_entitlement(..., at=admission_at)` unchanged, fail closed unless status is resolved, prove BYOK precedence and no funded fallback after BYOK failure, and prove funded authorization only after each task’s successful same-transaction reservation. Assert frozen source/connection/reservation ids, per-task units=`max_attempts`, and incomplete expected cost rejection.
- Worker tests assert auth pause, no silent platform fallback, safe partial report, seven-day configured pause, and operator-only platform failure handling.
- Provisioning tests assert idempotent upsert/rotation and ciphertext-only DB storage.
- Security-config tests assert `DEV_TEST_LOGIN_ALLOW_PLATFORM_CREDENTIALS` defaults false, a dev account receives no platform/system-workspace access while false, and `validate_production_security()` rejects the gate in production before startup.

**Verify**

```bash
cd backend
uv run pytest tests/unit/test_provider_credentials.py tests/unit/test_provision_platform_provider_connections.py tests/unit/test_production_security_config.py tests/component/test_provider_connections_api.py tests/component/test_audit_planner.py tests/component/test_audit_worker.py -q
```

### 7. Read-path measurement provenance and partitioned trends [after 3]

**Files**

Modify:

- `backend/app/domain/audits/schemas.py`
- `backend/app/domain/analysis/schemas.py`
- `backend/app/domain/analysis/service.py`
- `backend/app/analysis/exports.py`
- `backend/tests/component/test_analysis_api.py`
- `backend/tests/component/test_analysis_http.py`

Create `backend/tests/unit/test_analysis_exports_provenance.py`.

**Contract and behavior**

- Use canonical field name `measurement_mode` everywhere; do not add a `mode` alias. Surface `measurement_mode`, retrieval state, and model provenance in `AuditResponse`, `AuditTaskResponse`, execution detail/evidence DTOs, Visibility overview, `VisibilityTrendPoint`, `VisibilityEvidence`, and CSV/Markdown exports.
- Execution-level surfaces carry singular `transport_model` because one execution has one exact model. Audit/overview aggregate surfaces use `model_provenance: list[ModelProvenance]`, where each item is `(logical_engine, transport_provider, transport_model, retrieval_enabled)` in stable catalog order; never force a singular model when an aggregate spans models.
- Derive provenance only from frozen audit/task/artifact fields. Read paths make zero provider calls and never infer retrieval from current config.
- Change trend query/folding identity to `(measurement_mode, transport_model, retrieval_enabled)` in addition to existing project/engine/time filters. Raw, weekly, and monthly folding may combine points only inside one identity partition; the response returns separate ordered series/partitions for unlike identities. A query that explicitly requests a mode/model/retrieval slice filters before folding. No point or bucket may mix pulse with benchmark, different models, or retrieval on with off.
- CSV rows add `measurement_mode` and `retrieval_enabled` beside existing transport model/search columns. Markdown headings/metadata identify the audit’s measurement mode and stable aggregate model-provenance list.

**Tests**

- Audit/execution/evidence/overview HTTP tests assert canonical `measurement_mode`, exact execution model, retrieval state, and aggregate `model_provenance` list.
- Trend component tests seed otherwise identical audits across two modes, two model ids, and retrieval on/off; assert separate series at run/week/month granularity and no cross-partition averages/rank folding.
- Export tests assert CSV/Markdown provenance fields and stable multi-model representation; no `mode` field is emitted.

**Verify**

```bash
cd backend
uv run pytest tests/component/test_analysis_api.py tests/component/test_analysis_http.py tests/unit/test_analysis_exports_provenance.py -q
```

### 8. Resumable, discriminated audit SSE contract [after 3, 4]

**Files**

Modify:

- `backend/app/core/config/audits.py`
- `backend/app/domain/audits/schemas.py`
- `backend/app/api/audits.py`

Create `backend/tests/component/test_audit_events_sse.py`.

**Contract and behavior**

- Accept `Last-Event-ID` as an optional header on `GET /audits/{audit_id}/events`; validate it as UUID and return 422 for malformed values. Authorize the referenced event against the requested workspace/audit; seed `_event_stream(audit_id, last_event_id=...)` so only later events stream. Unknown/foreign cursor returns the same safe not-found behavior and never replays from the beginning.
- Move `_SSE_POLL_SECONDS` and `_SSE_TERMINAL_GRACE_POLLS` into `AuditSettings` as config-owned `sse_poll_seconds` and `sse_terminal_grace_polls`.
- Replace arbitrary `AuditEventResponse.payload: dict | None` with a discriminated envelope: common `id`, `audit_id`, `event_type`, `occurred_at`, and `payload`, where payload is a tagged union keyed by `event_type`. Include explicit payload schemas for lifecycle/status/count events, task success/failure/retry, `task.capacity_wait`, and terminal completion; every schema forbids extra fields and secret-bearing content. SSE `event:` and JSON `event_type` must match; SSE `id:` is the event UUID used for resume.
- Capacity/queued events use the same strict payload schemas as list/SSE responses; adding a new event requires adding its discriminator schema and tests.

**Tests**

- Component tests prove initial stream, resume-after-id without replay, malformed UUID 422, foreign/missing cursor safety, terminal grace behavior from config, event/id consistency, and strict rejection of unexpected payload fields.

**Verify**

```bash
cd backend
uv run pytest tests/component/test_audit_events_sse.py -q
```

### 9. T6 — Slice 1 gate review and final integration [after 1–8]

**Files**

Create/complete:

- `backend/docs/measurements/v8/slice1-gates.md`
- `backend/tests/unit/test_no_provider_calls_from_reads.py`

Modify focused docs/tests where gate evidence links are needed.

**Checkable gate matrix**

| Gate | Offline check in this PR | Status required at merge |
|---|---|---|
| Per-route cost table with reasoning/search lines | Harness fixture artifact schema and deterministic summary test | Runnable; live OpenAI/Google/fees deferred |
| Measured concise pulse instruction | Exact candidate text + SHA-256 freeze test; code/docstring labels it UNMEASURED CANDIDATE | **DEFERRED** until T1 runs live; candidate stands in without any −56%/−49% attribution |
| Output distribution and cap provenance | Fixture quantiles plus policy links to frozen Anthropic defaults | Anthropic narrative recorded as supplied, not re-measured; other routes deferred |
| Mention/citation equivalence vs uncapped | Fixture paired-condition statistical helper and threshold | Fixture check only; live equivalence deferred |
| Representative model evidence | Route policy requires evidence/status field | Current pinned routes documented; consumer-representativeness deferred |
| Cost per execution/audit by mode and credential source | Expected-cost completeness calculator | Anthropic token-only known; funded paths with incomplete lines fail closed |
| Wall-time p95 at target concurrency | Deterministic simulated load plus fixture timing | Live provider p95 deferred; unmeasured funded routes disabled |
| Funded pool no 429 cascade | Concurrent component simulation with shared cooldown | Pass offline |
| DB pool not exhausted | Startup assertion plus max-concurrency component test | Pass offline |
| Missing usage is unknown | Cost unit/component tests | Pass |
| Zero provider calls from reads | Patch adapter factory/HTTP transport to raise; exercise audit, metrics, visibility, evidence, export read endpoints | Pass |
| Batch fidelity | Recorded sync/batch fixture equivalence | Flags remain off until a provider route passes |
| No secret leakage | Existing+new DTO/log/snapshot/artifact tests | Pass |

`slice1-gates.md` must include date, HEAD SHA, fixture hashes, the exact candidate-instruction hash, commands, pass/fail/deferred state, reason for every deferred gate (`no live keys by owner decision`), exact unset config keys, and the rule “funded execution remains disabled for any incomplete route.” It must state that the candidate stands in for the deferred measured-instruction gate and forbid attributing the frozen −56%/−49% results to it. Do not mark the frozen document’s Anthropic narrative as a repository-run measurement because no source artifact exists.

**HEAD mismatch record**

The gate document explicitly records:

1. concurrency already exists (`worker_concurrency=10`, `run_pipelined`);
2. `AuditTask.max_attempts` already exists;
3. legacy benchmark modes are prompt framing, not measurement modes;
4. provider settings currently expose configured/not-configured and `ok|failed`, not four states;
5. no committed Anthropic measurement artifact exists;
6. no audit scheduling subsystem exists.

**Tests and final verification**

Run `python -m scripts.check_complexity` after every internal feature commit, not only at final integration. The ratchet must show no growth for existing `create_audit` (CC 23) or `_run_provider_call` (CC 17), and every new/renamed function must be ≤15.

```bash
cd backend
uv run pytest \
  tests/unit/test_measurement_harness.py \
  tests/unit/test_cost_projection.py \
  tests/unit/test_reprice_execution_costs.py \
  tests/unit/test_answer_engine_adapters.py \
  tests/unit/test_audit_guardrails.py \
  tests/unit/test_answer_engine_batch.py \
  tests/unit/test_provider_credentials.py \
  tests/unit/test_provision_platform_provider_connections.py \
  tests/unit/test_production_security_config.py \
  tests/unit/test_no_provider_calls_from_reads.py \
  tests/unit/test_analysis_exports_provenance.py \
  tests/component/test_audit_events_sse.py \
  tests/component/test_analysis_api.py \
  tests/component/test_analysis_http.py \
  tests/component/test_audit_planner.py \
  tests/component/test_audit_worker.py \
  tests/component/test_audit_queue.py \
  tests/component/test_provider_capacity.py \
  tests/component/test_audit_batch_service.py \
  tests/component/test_provider_connections_api.py -q
uv run ruff check .
python -m scripts.check_complexity
```

Use a disposable database for migration verification:

```bash
cd backend
uv run alembic upgrade head
uv run alembic check
```

## Columns and tables contributed to the shared baseline

Feature commits in this work order change ORM models only; they do not claim or edit `migrations/versions/0001_initial.py`. PR1 has one schema integrator. After all feature models land, a single owned schema-sync commit regenerates the baseline from the combined final model set, mirrors downgrade ordering, and runs clean upgrade/downgrade plus `alembic check` against a disposable database.

This slice contributes the following columns/tables to that shared schema-sync commit:

1. `workspaces`: add non-null `is_system Boolean default false`; partial unique index for the single system workspace.
2. `provider_connections`: add non-null `credential_source String(16) default byok`, `paused_at`, `pause_reason`, `pause_until`; add workspace/source/provider and pause indexes.
3. `audits`: add non-null `measurement_mode String(16) default benchmark`.
4. `audit_engine_snapshots`: add frozen `credential_source`, retrieval, reasoning, output cap, timeout, max attempts, pricing/formula/policy versions as scalar columns or keep them in the existing immutable route snapshot consistently; the plan prefers scalar credential source plus JSON policy to avoid duplicating every policy field.
5. `audit_tasks`: add `finish_reason String(24) default unknown`, `raw_finish_reason String(64) nullable`; permit `capacity_wait` in config vocabulary; reuse `available_at` for capacity queueing.
6. `raw_response_artifacts`: add canonical/raw finish columns.
7. `execution_cost_projections`: replace current token/cost columns with nullable normalized and line-cost fields; add formula/pricing/status/attempt count; remove unique task/artifact constraints; add composite version uniqueness.
8. `provider_capacity_buckets` and `provider_capacity_leases`: exact columns/FKs/indexes/unique constraints from T4.
9. `audit_batch_jobs` and `audit_batch_items`: exact columns/FKs/indexes/uniqueness from T5.
10. Do not add `audit_schedules` or `audit_schedule_occurrences` in PR1; those exact tables are deferred to PR3 below.
11. Do not add the consumable ledger table in this slice’s work order; integrate with the T9-owned schema/API.
12. Do not add a `0002` revision.

Shared high-conflict files require serialized ownership/rebase coordination across PR1 workstreams: `backend/app/models/audit.py`, `backend/app/models/__init__.py`, `backend/app/core/config/audits.py`, `backend/app/core/config/provider_catalog.py`, `backend/app/domain/audits/planner.py`, `backend/app/domain/providers/schemas.py`, `backend/app/domain/providers/service.py`, `backend/app/api/provider_connections.py`, and `backend/tests/component/test_audit_worker.py`.

## Dependency rationale

- T1 defines observable fields and fixture evidence before pricing/policy code consumes them.
- T2 and T3 can begin after the harness contract; T4 needs both frozen policy and cost/attempt semantics.
- T5 needs append-only costing and shared capacity to avoid a second accounting/pacing path. It is an installed dormant foundation: production consumption arrives in PR3, all flags remain off, tests are its only PR1 caller, and deployment must not invoke its script.
- T11 needs the T2 expected-cost accessor and T3 frozen route policy, plus Part B’s exact resolver/per-task ledger interfaces.
- Read-path provenance depends on T3’s persisted fields; SSE discrimination depends on T3/T4 event vocabulary.
- T6 is the final evidence review; it does not turn deferred live gates into fabricated passes.
- `benchmark_cadence` remains resolved and returned by the entitlement subsystem, but no PR1 code consumes it. PR3 is the first-priority follow-up after PR1 and PR2.

## DEFERRED TO PR3 (pending features)

T12 is removed entirely from PR1 and retained here for direct lift into the first-priority follow-up PR3. PR3 must use a bounded idempotent one-shot dispatcher script invoked by deployment cron, not a long-running scheduler service and not an interval callback inside `audit_worker.py`.

### T12 — One timezone-aware audit schedule per project [after T4, T11; requires external T7/T9 entitlement contracts]

**Files**

Create:

- `backend/app/core/config/schedules.py`
- `backend/app/models/audit_schedule.py`
- `backend/app/domain/audit_schedules/__init__.py`
- `backend/app/domain/audit_schedules/{schemas,service,clock}.py`
- `backend/app/api/audit_schedules.py`
- `backend/scripts/dispatch_due_audits.py`
- `backend/tests/unit/test_audit_schedule_clock.py`
- `backend/tests/component/test_audit_schedules_api.py`
- `backend/tests/component/test_audit_schedule_dispatcher.py`

Modify:

- `backend/app/main.py`
- `backend/app/models/__init__.py`
- `backend/app/domain/audits/planner.py`
- `backend/app/core/config/audits.py`
- `migrations/versions/0001_initial.py`
- `README.md`, `docs/DEVELOPMENT.md`, `docs/backend-architecture.md`

**Resolved data model**

- `AuditSchedule`: UUID PK; `workspace_id` FK cascade/index, `project_id` FK cascade/unique, `timezone String(64)`, `report_ready_local_time Time`, `prompt_ids JSONB NOT NULL`, `logical_engines JSONB NOT NULL`, `measurement_mode String(16)`, `state String(16)` (`active|paused`), `pause_reason String(64)`, `next_local_date Date`, `dispatch_policy_version String(32)`, timestamps. One row per project satisfies the frozen singular schedule and singular mode.
- `AuditScheduleOccurrence`: UUID PK; `schedule_id` FK cascade, `local_date Date`, `scheduled_for_utc timestamptz`, nullable `dispatched_at`, nullable `audit_id` FK SET NULL, `status String(16)` (`claimed|dispatched|skipped|failed`), safe reason/timestamps; unique `(schedule_id, local_date)`, index `(status, scheduled_for_utc)`.
- The frozen text’s “unique `(schedule_id, local_date)`” belongs on this occurrence table, not the schedule itself.

**Scheduling contract**

- CRUD endpoints are `/projects/{project_id}/audit-schedule` GET/PUT/DELETE, use `require_workspace_member`, validate IANA zone via `zoneinfo`, validate selected prompts belong to project, and accept one mode.
- `resolve_due_instant(schedule, local_date, *, measured_p95_seconds) -> datetime` computes lead time `max(1800, 1.5 * measured_p95_seconds)` before local report-ready time. If mode/provider p95 is missing, pause with `measurement_unavailable` rather than guess.
- DST gap: map nonexistent local report time to the first existing instant after the gap, then subtract lead time. DST fold: choose the earlier occurrence and unique local date ensures one dispatch.
- Delayed ticks enumerate due local dates from `next_local_date` through today and create occurrences; they never skip a date silently. Concurrent invocations insert occurrence with `ON CONFLICT DO NOTHING`/row locking, so exactly one calls `create_audit`.
- `async dispatch_due_audits_once(session_factory, *, now: datetime | None = None, limit: int) -> DispatchResult` uses short sessions, deterministic order, and a config-owned per-invocation bound. `backend/scripts/dispatch_due_audits.py` invokes it once and exits; deployment cron owns cadence.
- Each dispatch resolves current entitlement, consumes the already-returned `benchmark_cadence` key, and pauses/skips ineligible schedules with a safe reason.
- Planner receives `trigger="scheduled"`, schedule/occurrence identity, selected mode/prompts/sources, and freezes them. Existing audit finalization remains: all success → completed, some success → partially_completed and publishable, zero success → failed.
- Concurrent/late dispatch does not replace `Audit.configuration` with current policy after creation.
- Emit secret-free structured events `audit.schedule.dispatched`, `audit.schedule.skipped`, `audit.schedule.paused`, and `audit.schedule.dispatch_failed`; deployment alert rules remain outside the repo.

**Tests**

- Clock tests cover UTC zones, half-hour zones, spring gap first-valid instant, fall fold once, lead-time floor/factor, and missing p95 fail-closed.
- API tests cover one schedule per project, membership isolation, invalid zones/prompts/modes, paused state, and delete.
- Dispatcher tests invoke the one-shot service from two concurrent callers to prove `(schedule_id, local_date)` uniqueness, delayed multi-date catch-up, effective entitlement cadence, pause on lost entitlement/credentials/measurement, per-invocation bounds, idempotent reruns, exact frozen trigger/config, and partial-report publication.
- The Part-B dev-only login may exercise schedule CRUD as a tenant but cannot gain platform-funded execution or reserved-system-workspace access unless the same development-only gate is enabled; production startup still rejects that gate.

**Verify**

```bash
cd backend
uv run pytest tests/unit/test_audit_schedule_clock.py tests/component/test_audit_schedules_api.py tests/component/test_audit_schedule_dispatcher.py tests/component/test_audit_planner.py tests/component/test_audit_worker.py -q
```
