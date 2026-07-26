# Free/Paid audit cost + latency implementation plan

> **Status: AUDITED DRAFT FOR OWNER APPROVAL — planning only; nothing below is newly
> implemented.** The measured research from the previous version has been retained, but
> unverified estimates are now experiments rather than promises. Prepared 2026-07-26.
>
> Billing/entitlement dependency:
> [`v6-account-tiers-and-india-billing.md`](v6-account-tiers-and-india-billing.md).
> Companion contracts: [`backend-architecture.md`](../backend-architecture.md),
> [`frontend-architecture.md`](../frontend-architecture.md),
> [`design.md`](../design.md), and [`invariants.md`](../invariants.md).

## 1. Outcome

Turn the current on-demand, search-enabled BYOK audit into two honest measurement products:

- **Free — Model Knowledge:** fast, search-disabled answers that measure whether a model knows
  and mentions the brand without retrieving current web results.
- **Paid — Web Search Visibility:** search-enabled answers, scheduled off the interactive path,
  measuring what the approved answer engines return when provider web search is available.

The implementation must keep both profiles reproducible and visibly distinct. It must not
present a search-disabled score as a cheaper sample of the same search-enabled metric, mix the
two profiles in one trend line, or promise cost/latency numbers until the release experiments
pass.

The current answer-engine architecture remains **BYOK** on both tiers. Searchify therefore does
not pay the provider bill under this plan; the cost reduction benefits the customer and the
product's usability. A Searchify-funded Free allowance would require a separate platform-key,
abuse, fraud, and unit-economics design and is explicitly out of scope.

## 2. Audited baseline

### 2.1 What was actually measured

One real Claude run using `claude-sonnet-4-6`, 10 prompts, one repetition, and the basic
Anthropic web-search tool produced these averages from persisted raw artifacts:

- 16,041 input tokens per call;
- 1,292 output tokens per call;
- 1.5 web searches per call;
- approximately 29 seconds per call; and
- an estimated `$0.0825` per call (`$0.0481` input + `$0.0194` output + `$0.0150`
  search), or `$0.83` for the ten calls.

Within that ten-call sample, answer length and latency were strongly correlated (`r=0.982`),
and search count and latency were correlated (`r=0.840`). The pre-pipeline wall time was 104
seconds for those ten calls at concurrency 4.

Already shipped independently of this plan:

- the audit worker continuously refills completed concurrency slots;
- answer-engine HTTP connections are pooled; and
- `worker_concurrency` was raised from 4 to 10 with corresponding DB-pool changes.

The repository comments estimate roughly 90 seconds for 30 current grounded calls. That is an
engineering estimate, not a cross-provider SLO.

### 2.2 What the measurements do establish

- For this Claude sample, retrieved search material dominated input tokens.
- Prompt caching is unlikely to help much because retrieved text is unique per call and
  `consumer_like` has no stable system instruction.
- Merely raising concurrency is constrained by provider input-token/rate limits.
- Removing search tools is the highest-leverage Free-profile hypothesis.
- Scheduled/precomputed Paid audits solve perceived latency more reliably than making users
  wait on a large grounded run.

### 2.3 Corrections to the earlier proposal

| Earlier claim | Audit verdict / correction |
|---|---|
| Ungrounded is about `$0.010/call` and 10–13s | **Hypothesis.** It was extrapolated largely from one no-search call, not measured on a representative three-engine run. |
| 45 calls finish in about 25s | Assumes roughly 30 concurrent calls. The current worker limit is 10, so this is not true of the current system and cannot be promised without DB/provider-capacity validation. |
| Input tokens are “the” cost problem | Demonstrated for one Claude sample only. OpenAI and Google need their own token/tool-price measurements. |
| Answer length is “the whole” latency story | Too strong for `n=10`; provider search, queueing, throttling, and cross-engine variance must also be measured. |
| Paid can reach about `$0.030/call` | **Not demonstrated.** On the Claude baseline, a 50% token discount alone yields roughly `$0.03375` tokens + the unchanged `$0.015` search fee = `$0.04875/call`. Reaching `$0.030` depends on unmeasured search/context reductions. |
| Batch is one common adapter path | False for the current routes. OpenAI Batch supports `/v1/responses`; Anthropic batches almost all Messages requests; Google Batch is currently `generateContent`-only while Searchify uses the Interactions API. Each transport needs a separate compatibility decision. |
| Searchify can “give away” provider spend | Conflicts with the coded and marketed BYOK contract. Under this plan the customer supplies the key and bears provider charges. |
| Free and Paid scores can share trends | They are different measurements. Mixing retrieval profiles would create a false time-series discontinuity. |

These corrections are release gates, not reasons to abandon the split.

## 3. Proposed two-tier product contract

The defaults below make the plan concrete. Task 0 must either approve them or replace them
before entitlement/config code is written.

| Dimension | Free: Model Knowledge | Paid: Web Search Visibility |
|---|---|---|
| Stable tier key | `free` | `paid` |
| Retrieval policy | `disabled` | `provider_web_search` |
| User-facing meaning | What the base model knows/mentions without live retrieval | What a search-enabled answer engine returns with current web retrieval available |
| Provider credentials | Customer BYOK | Customer BYOK |
| Engines | Up to all 3 configured engines | Up to all 3 configured engines |
| Prompts per audit | Proposed 15 | Proposed 20; higher catalog limits are a later pricing decision |
| Repetitions | Exactly 1 | Proposed 1 for scheduled tracking; optional higher repetition only after unit-economics approval |
| Manual refresh | Proposed 1 per 7 days per billing account | One initial/manual refresh plus configured scheduled cadence |
| Schedule | None | Daily or weekly; default weekly until provider quota tests pass |
| Benchmark modes | `consumer_like`; localized mode only if explicitly approved | All current modes; `forced_grounded` requires this retrieval policy |
| Citations/query fanout | Empty citations and `no_search` fanout by contract | Persist actual citations and `queries_available | count_only | no_search` evidence |
| Target wait | p95 completed audit under 60s, validated before publishing | Dashboard reads last completed snapshot instantly; first run streams progressive results |

“Provider web search available” is deliberately more accurate than “every call is grounded”:
in `consumer_like`, the provider can elect not to search. `RawResponseArtifact.search_used`
continues to record what actually happened.

### 3.1 Compatibility rules

- `retrieval_policy` is independent from `benchmark_mode` and frozen at audit creation.
- `forced_grounded + disabled` is rejected, not silently rewritten.
- Entitlement sets the maximum capability. A request may choose a cheaper allowed profile, but
  a Free request cannot ask for provider search.
- Upgrade affects only new audits. Old Free runs remain Model Knowledge runs.
- Downgrade stops new search-enabled work and future schedule dispatch; in-flight calls finish
  cooperatively and historical evidence stays readable.

### 3.2 Comparability rules

Add a versioned `measurement_profile` such as:

```jsonc
{
  "profile_key": "model_knowledge" | "web_search_visibility",
  "profile_version": "visibility-profile-v1",
  "retrieval_policy": "disabled" | "provider_web_search",
  "tier_key_at_creation": "free" | "paid",
  "entitlement_revision": 3
}
```

Freeze it in `Audit.configuration` and expose the safe fields in audit/metrics/evidence DTOs.
Trend queries must partition/filter by `profile_key + profile_version`; they must never connect
points across profiles. The Visibility and Run screens show a persistent profile badge and a
plain-language definition.

Analyzer and formula versions remain separate: the same deterministic mention logic can score
both profiles, but the input measurement profile is part of result provenance.

## 4. Architecture changes

### 4.1 Entitlement and quota resolution

The V6 entitlement domain owns `free | paid` and returns an Audit capability profile from
`app/core/config/audit_entitlements.py`. The profile contains all limits and feature flags;
the planner never hard-codes a display tier.

Because one subscription can sponsor several agency workspaces, refresh quota is counted at
the billing-account level, not separately per workspace. Add `AuditUsageReservation`:

- UUID id, `billing_account_id`, `workspace_id`, `audit_id` (unique), usage kind, period key,
  units, and timestamps;
- create it while holding the account entitlement row `FOR UPDATE`;
- commit the reservation, immutable audit, snapshots, and tasks atomically;
- idempotent retries reuse/reject the same audit idempotency key;
- cancellation/failure does not silently refund usage. A deliberate admin reconciliation
  command may do so with an audit log.

Use stable errors:

- 403 `audit_capability_required` for retrieval/mode/schedule not allowed;
- 409 `audit_already_scheduled` or conflicting idempotency state;
- 429 `audit_quota_exhausted` with safe limit/reset data;
- 422 for structurally invalid prompt/engine/repetition combinations.

### 4.2 Frozen planner contract

Extend `create_audit()` to resolve and lock entitlement before task creation, validate the
requested shape, reserve usage, and freeze:

- measurement profile and entitlement revision;
- prompt/engine/repetition bounds;
- retrieval policy;
- interactive versus scheduled trigger;
- per-transport request policy/version;
- existing engine routes, scoring identity, product identity, timeouts, and versions.

The worker reads only this frozen configuration. It must never re-resolve the live tier to
decide whether to attach a search tool; that would make queued audits change meaning after an
upgrade/downgrade.

### 4.3 Answer-engine connector contract

Add `retrieval_policy` to `AnswerEngineRequest` (or an equivalent typed request policy). Update
all three payload builders:

- OpenAI: omit `tools:[{"type":"web_search"}]` when disabled.
- Anthropic: omit the `web_search_20250305` tool when disabled.
- Google: omit `tools:[{"type":"google_search"}]` when disabled.

Continue to send no brand/competitor list. The request snapshot records the policy and tool
type/version but never the API key. Parsers already support no-search answers; add explicit
contract tests proving empty search/citation collections are valid for every adapter.

Do not add a brevity instruction to `consumer_like`. It would alter the behavior being
measured and make historical comparison invalid. If a later localized profile uses an output
constraint, give it a new profile version.

### 4.4 Provider-aware concurrency

The worker currently has one global concurrency and one per-transport start interval. Raising
the global limit alone can let one provider monopolize all slots or hit its account quota.

For the current single audit-worker deployment:

- configure `global_concurrency` and per-transport concurrency/start intervals in
  `core/config/audits.py`;
- track available capacity by frozen connection id (the BYOK quota boundary), falling back to
  transport when necessary;
- claim tasks eligible for a currently available connection/transport instead of claiming a
  provider-blind batch that waits while holding leases;
- keep the continuously refilling pool and all existing lease/heartbeat rules;
- add a startup guard documenting that these caps are process-local.

Do not horizontally scale the audit worker until a distributed provider-capacity lease/rate
limiter is designed. Multiple replicas would each believe they own the full provider limit.

Any move toward 30 in-flight calls must first prove the DB pool can cover task + heartbeat
sessions and that each BYOK account's RPM/TPM quotas allow it. The p95 Free SLO may instead
force a lower prompt limit; the product promise wins over an unsafe concurrency number.

### 4.5 Scheduling

Add `AuditSchedule` owned by `domain/audits`:

- UUID/workspace/project/billing-account ids;
- prompt source, logical engines, repetition, benchmark mode;
- cadence/time zone, next/last dispatch time, enabled/paused state;
- entitlement/profile revision used for the next validation;
- created/updated timestamps.

Use a single-owner `audit_dispatcher.py` following the existing integration-dispatcher pattern.
Each tick:

1. selects due schedules with `FOR UPDATE SKIP LOCKED`;
2. re-resolves current entitlement and provider connections;
3. calls the same `create_audit()` planner as a manual run;
4. deduplicates on `(schedule_id, scheduled_window)`;
5. advances `next_run_at` in the same committed operation; and
6. pauses with a visible reason on entitlement/provider/config errors rather than retrying
   forever.

Scheduling makes the dashboard instant because it reads persisted snapshots; it never causes a
provider call from a dashboard/report request. First-run onboarding can keep the current SSE /
polling progressive experience.

### 4.6 Cost observability

Provider prices change, and search fees differ by transport. Put versioned price inputs only in
`core/config/provider_pricing.py`. Add a deterministic `ExecutionCostEstimate` derived row per
raw artifact:

- artifact/task/audit/workspace ids;
- input/output/cached tokens and tool counts as reported;
- estimated amount/currency;
- `pricing_version`, formula version, and created time.

Missing usage produces `unknown`, never zero. The row references its source artifact and is
never rewritten when prices change; recomputation produces a new pricing-version projection.
Aggregate audit cost is a persisted projection over these rows. Label it “estimated provider
cost” because the provider invoice is authoritative and BYOK discounts/credits may differ.

Telemetry needed for release gates: queue wait, provider latency, audit wall time, tokens,
search count, estimated cost, HTTP 429/retry count, connection id hash, engine, profile, and
schedule/manual trigger. Never include prompt/answer text, brand names, keys, or raw provider
bodies in logs/metrics.

## 5. Required experiments and gates

### 5.1 Representative matrix

Before enabling Free broadly, run a fixed, non-sensitive 10–15 prompt corpus against each
approved engine in both retrieval policies, at least three complete runs per cell. Record:

- p50/p95 provider latency and full-audit wall time;
- input/output/cached tokens, search/tool count, retries/429s, and estimated cost;
- answer length, completion/failure rate, citations, and query-fanout state;
- deterministic brand mention rate, share of voice, and ranking changes between profiles.

Use the same frozen prompts, routes, region, repetitions, and analyzer versions. Persist the
artifacts normally; do not summarize from ad-hoc console output.

### 5.2 Free release gates

- 15 prompts × 3 engines × 1 repetition completes in under 60 seconds at p95 in the intended
  deployment and representative provider tiers, or the published prompt/engine limit is
  reduced until it does.
- Per-call and per-audit estimated cost is below the owner-approved customer-cost budget for
  every engine; no value from the earlier extrapolation is treated as a pass.
- No connector sends a search tool when retrieval is disabled.
- UI, export, evidence, and trend labels make the profile difference unambiguous.
- Quota checks remain correct under concurrent create requests across multiple sponsored
  workspaces.

### 5.3 Paid/scheduler release gates

- A scheduled audit is created at most once for a due window and produces the same immutable
  evidence graph as a manual audit.
- Dashboard reads never invoke providers and show the last successful refresh plus next refresh.
- Per-connection caps prevent a single provider from consuming all worker slots; 429/retry rate
  stays below an owner-approved threshold.
- Downgrade/provider disconnection pauses future dispatch without corrupting in-flight/history.

## 6. Batch API: separate optimization track

Batching is not required to launch the tier split. It starts only after scheduling and normal
grounded telemetry are stable.

Official sources checked 2026-07-26:

- [OpenAI Batch](https://platform.openai.com/docs/guides/batch): asynchronous, 50% lower cost,
  `/v1/responses` supported, up to a 24-hour completion window.
- [Anthropic Message Batches](https://docs.anthropic.com/en/docs/build-with-claude/batch-processing):
  50% lower token cost, most batches under one hour, up to 24 hours, almost all Messages
  requests accepted.
- [Google Gemini Batch](https://ai.google.dev/gemini-api/docs/batch-api): 50% of standard cost
  but currently only `generateContent`, not Searchify's Interactions API route.

For each provider, spike and prove all of the following before implementation:

1. the approved model and exact search tool work in batch;
2. token and search-tool billing discounts are understood separately;
3. response payloads retain citations, search queries/counts, usage, logical/transport/model
   identity, and per-request error detail needed by current parsers;
4. cancellation, expiration, partial failure, retry, and results-retention behavior can map to
   immutable tasks/artifacts without double execution; and
5. BYOK accounts have batch access and acceptable turnaround.

Expected decisions:

- **OpenAI:** candidate for a provider-specific batch adapter after web-search compatibility
  passes.
- **Anthropic:** candidate after server-tool compatibility and actual token/tool cost pass.
- **Google:** deferred while Batch requires `generateContent`; changing from Interactions would
  change the approved request surface and needs a separate architecture/measurement decision.

Do not advertise “50% cheaper Paid audits.” Discounts apply to eligible token charges, not
automatically to every provider/tool component or every engine.

Anthropic's newer dynamic-filtering web-search tool may reduce retrieved context, but switching
from the current `web_search_20250305` changes measured behavior and tool provenance. Treat it
as its own versioned experiment, not a config flip inside historical `consumer_like` runs.

## 7. Implementation task graph

### Task 0 — approve product limits and run baseline experiments

- Approve or replace §3 defaults, the cost budget, latency SLO, retry threshold, Paid cadence,
  and BYOK-only scope.
- Implement only the measurement harness/queries needed for §5 and run the full matrix against
  approved routes.
- Save anonymized results and the approved profile catalog/version.
- **Exit:** every number used in UI/pricing is measured; profile semantics are signed off.

### Task 1 — audit capability configuration and API contracts

Owning subsystems: `core/config`, `domain/audits/schemas`, frontend `API-contract`.

- Add retrieval/profile/capability vocabularies and config validation.
- Extend strict backend and Zod DTOs for profile, limits, quota/reset, trigger, and schedule
  metadata.
- Define error codes and compatibility validation.
- Update backend/frontend architecture docs with the final contracts.
- **Tests:** config invalid values, strict schema drift, profile/mode compatibility, secret-free
  serialization.

### Task 2 — entitlement-aware planner and quota serialization

Depends on V6 Tasks 1–2.

- Add `AuditUsageReservation` and update `0001_initial`.
- Resolve active workspace → billing account → capability; lock entitlement, enforce profile /
  prompt / engine / repetition / refresh limits, and reserve usage atomically.
- Freeze all §4.2 fields before enqueue.
- Ensure manual and scheduled callers use this single planner path.
- **Tests:** Free/Paid, invited agency member, multi-workspace shared quota, concurrent creates,
  exact reset boundary, upgrade/downgrade race, rollback, idempotency, historical immutability.

### Task 3 — search-disabled connector path

- Extend the typed answer-engine request and all three payload builders.
- Preserve approved model/transport identities and existing parsers.
- Write payload-level tests proving search tools are present only for
  `provider_web_search`, plus no-search response/parser tests.
- Add worker request-snapshot/profile propagation and execution DTO fields.
- **Tests:** no key/brand leakage, frozen policy survives later tier change, empty citations /
  fanout, retry behavior unchanged.

### Task 4 — cost projection and provider-aware worker capacity

- Add versioned pricing config and `ExecutionCostEstimate` provenance rows.
- Add capacity-aware claiming/caps and config validation; keep leases committed before I/O.
- Add safe telemetry and alerts for latency/cost/429s.
- Re-run §5 under the production-shaped DB pool/concurrency.
- **Tests:** unknown usage, formula/version, artifact provenance, mixed-provider fairness,
  per-connection cap, slot refill, lease heartbeat/reclaim, cancellation boundary.

### Task 5 — profile-aware frontend and reporting

Owning subsystems: `runs`, `visibility`, `API-contract`, `marketing`.

- Show capability/limit/cost estimate in launch confirmation; disable impossible choices but
  treat backend errors as authoritative.
- Add Model Knowledge / Web Search Visibility badges and definitions to Visibility, Runs,
  execution detail, exports, and empty states.
- Partition Trends by profile; default to the latest run's profile and never draw a mixed line.
- Ensure Free Mentions & Citations is honest about absent retrieval and Query Fanout uses
  `no_search`.
- Update pricing/onboarding copy together with V6 Task 6.
- **Tests:** WAI-ARIA tabs unchanged, profile URL/filter behavior, mixed-history isolation,
  upgrade CTA, 403/429 errors, em-dash metrics, same-origin API.

### Task 6 — Paid audit scheduler

- Add `AuditSchedule`, config, domain service/API, and single-owner dispatcher from §4.5.
- Add Settings/Visibility schedule controls, last/next refresh, pause reason, and first-run
  progressive state.
- Deploy as a separate Railway service; no Redis and no provider call in the web process.
- **Tests:** DST/time zones, due-window dedupe, concurrent dispatcher ticks, disabled schedule,
  downgrade/disconnect pause, failure then next cadence, workspace isolation, no read-path call.

### Task 7 — guarded rollout

- Ship persistence/DTO reads first, then Free profile to staff/test accounts, then a percentage
  allow-list, then all Free accounts after §5 passes.
- Roll Paid scheduling separately. Keep manual current behavior available behind a rollback
  flag until scheduler reliability passes.
- Monitor profile-specific wall time, cost, search rate, failures, 429s, quota denials, schedule
  lateness, and mixed-profile query attempts.
- Roll back new audit creation/profile selection only; never mutate/delete completed evidence.

### Task 8 — optional provider-specific batch experiments

- Execute §6 spikes independently for OpenAI and Anthropic.
- Write a provider ADR and measured cost report before adding each adapter.
- Google remains out until the approved Interactions route has equivalent batch support or an
  explicit route-change plan is approved.

## 8. Expected files/subsystems

The final names may follow existing local conventions, but ownership should remain:

- `backend/app/core/config/audit_entitlements.py`, `provider_pricing.py`, `audits.py`;
- `backend/app/models/audit.py`, billing entitlement models from V6;
- `backend/app/domain/audits/{planner,schedules,schemas}.py`;
- `backend/app/connectors/answer_engines/{contracts,openai,anthropic,gemini}.py`;
- `backend/app/workers/{audit_worker,audit_dispatcher}.py`;
- `backend/app/analysis/` for cost projections and profile-aware reads;
- `backend/app/api/audits.py` plus a thin schedule router if the existing file becomes crowded;
- frontend `lib/api`, `components/runs`, `components/visibility`, Settings, and marketing pricing.

Grep before adding: reuse the generic Postgres queue, integration dispatcher conventions,
Site Health entitlement patterns, audit SSE/polling, and strict frontend API validation.

## 9. Verification commands

```bash
# backend/
uv run pytest tests/unit/test_audit_config.py tests/unit/test_answer_engine_connectors.py -q
uv run pytest tests/component/test_audit_planner.py tests/component/test_audit_worker.py -q
uv run pytest tests/component/test_audit_entitlements.py tests/component/test_audit_schedules.py -q
uv run pytest tests/component/test_analysis_api.py tests/component/test_visibility_evidence_api.py -q
uv run ruff check .
uv run alembic upgrade head

# frontend/
pnpm test -- components/runs/launch-dialog.test.tsx
pnpm test -- components/visibility/visibility-dashboard.test.tsx
pnpm test -- lib/api/audits.test.ts
pnpm lint
pnpm build
```

Performance/cost gates require the controlled real-provider matrix in §5; mocked tests cannot
prove them. Run it only with dedicated test workspaces/keys and never print secrets or prompt /
answer bodies.

## 10. Definition of done

- Free and Paid are enforced server-side from the current effective billing entitlement; UI
  gating is only explanatory.
- Free requests contain no provider search tool and are labeled Model Knowledge everywhere.
- Paid search-enabled requests retain the existing evidence/provenance contract and run from
  persisted schedules without provider calls on dashboard/report paths.
- Every audit freezes profile, retrieval policy, tier/revision, trigger, routes, prompts, and
  versions; later entitlement/catalog changes cannot alter it.
- Trends, comparisons, and exports never silently mix measurement profiles.
- Free p95 wall time and cost pass measured gates for every enabled engine, or published limits
  are reduced before launch.
- Provider-aware capacity prevents quota convoys/monopoly in the supported single-worker
  deployment; horizontal scaling remains blocked until distributed capacity exists.
- Cost estimates are artifact-derived, versioned, labeled estimates, and never fabricated as
  zero.
- Scheduler dedupe, downgrade, disconnect, retry, and cancellation behavior are component-
  tested and observable.
- No batch discount is claimed or shipped without provider-specific compatibility and measured
  cost proof.

## 11. Explicit non-goals

- Searchify-funded provider credentials or anonymous audits.
- Scraping consumer ChatGPT/Gemini/Claude interfaces.
- Changing approved logical-engine routes/models for cost alone.
- Adding a brevity prompt to `consumer_like`.
- Sentiment or average-position computation.
- Redis, multi-replica audit workers, or a generic distributed rate-limit service.
- Treating batch processing as part of the initial tier launch.
