# v8 — Delivered Work and Remaining Scope

> **Status: merged to `main` as `b2d5644` (PR #42), 2026-08-01.**
>
> This is the single canonical record of the v8 *Cost/Latency Measurement +
> Tier Pricing* delivery. It **replaces** the handoff and work-order set
> (`docs/plans/v8-work-orders/`) and the PR3 deferral list
> (`docs/plans/v8-pending-features.md`), both of which are superseded and were
> written against a state that no longer exists — the handoff still reports
> "commits 1–3 of 8".
>
> The frozen product specification `docs/plans/v8-cost-latency-and-tier-pricing.md`
> is **not** replaced. It remains the requirements authority; this document
> records what was built against it and what was not.

---

## 1. Summary

| | |
|---|---|
| Merge commit | `b2d5644` (PR #42), base `main` |
| Commits | 31 non-merge commits |
| Change size | 238 files, ~44,000 insertions / ~4,000 deletions |
| Backend gate at merge | 2,222 tests passed, `ruff` clean, complexity ratchet green, migration round-trip clean |
| Frontend gate at merge | 1,294 vitest, `tsc` clean, lint clean, `check:policy` OK, build OK |
| Frozen-plan tasks delivered | T1–T9 (T5 shipped dormant), T11, T13, T14, T16 (T15 as catalog + labelled coming-soon only) |
| Frozen-plan tasks not delivered | T5 production activation, T10, T12 |

Both planned PRs landed in the same merge: PR1 (backend, 8-commit graph plus
review/simplify follow-ups) and PR2 (frontend, 5 tasks). The PR3 boundary
described in the superseded pending-features document still holds as the
remaining-scope boundary — see [§4](#4-remaining-scope).

Two properties hold across the whole delivery and are enforced by tests rather
than convention:

- **Unknown never becomes zero.** Every usage, cost and timing counter is
  nullable end to end. A fabricated zero is indistinguishable from a measured
  zero, so absent data stays absent — in projections, in DTOs, and on screen.
- **No measured number was fabricated.** The measurement harness shipped
  runnable but was never executed against live provider keys, so every figure
  it would produce is still unset. Nothing in the code, tests, docstrings or
  user-facing copy claims otherwise.

---

## 2. What shipped

### 2.1 Measurement harness (T1)

`app/domain/measurement/harness.py` + `app/core/config/measurement.py` +
`scripts/measure_answer_engine_matrix.py`.

Expands the full sweep matrix (route × retrieval × route-supported reasoning
effort × baseline|concise|capped_600 × repetitions), replays committed
fixtures, and derives route-cost and output-length summaries. Unsupported
reasoning cells are emitted as `unsupported` rather than silently skipped.

Safety properties, each test-pinned:

- Absent or invalid usage stays null.
- A known `search_call_count=0` never implies a zero search fee.
- Wall time is never relabelled TTFT; `ttft_ms` stays null without real
  streaming timestamps.
- Fixture-derived runs are labelled `fixture_derived=true` and **can never
  satisfy a live gate**.
- Live mode requires both `--live` and a typed confirmation token, and raises
  rather than degrading to synthetic data.

`docs/measurements/v8/slice1-fixture-run.json` records fixture hashes, versions
and unset pricing behind an explicit SYNTHETIC / live-not-performed warning.

### 2.2 Cost configuration and projection (T2)

`ExecutionCostProjection` is append-only and versioned: one row per
`(artifact, formula_version, pricing_version)`, a composite unique replacing the
old task/artifact uniques, every usage and cost column nullable.
`projection_status` (`complete` | `partial` | `unknown`) is the only summary of
completeness.

- `config/costs.py` is the sole expected-cost owner: `RouteIdentity`,
  `RoutePricing` (**all rates null until externally verified** — no invented
  unit rates), versioned catalogs, and `expected_execution_cost()` keyed by
  route identity + measurement mode with retrieval-aware completeness. Frozen
  Anthropic estimates only (pulse 2,890 µUSD; benchmark 146,600 µUSD; benchmark
  searches 3). Funded admission fails closed on an incomplete estimate.
- Usage-key precedence is pinned in tests: granular keys beat legacy totals
  (`total_input`→uncached, `total_output`→output); cached and reasoning have
  **no** fallback.
- Line-cost formula v1: `tokens × rate // 1M`; search = `count × fee`. A
  projected total exists only when every applicable line is known.
- `scripts/reprice_execution_costs.py` — explicit `--formula-version` /
  `--pricing-version` / `--artifact-id` / `--dry-run`, append-only, refuses to
  stamp uncomputed arithmetic, never calls a provider.
- Parsers no longer emit the fabricated `provider_cost_usd: 0.0` placeholder.
- Two pricing surfaces coexist **by design**: `config/analysis.py` Gemini
  paid-list rates are scoring-only; `config/costs.py` owns unit-rate pricing for
  funded admission. Do not unify them.

### 2.3 Route and output policy (T3)

The planner resolves the measurement mode once and **freezes** the entire
route/output policy — retrieval, output cap, timeout, repetitions, answer
addendum — onto `Audit.configuration`, each task's `provider_route_snapshot`,
and the engine snapshots. The worker executes the planned shape and never
re-reads live settings.

- All three adapters build their request body from the frozen
  `AnswerEngineRequest` only. `retrieval_enabled` decides whether the
  search/grounding tool is attached at all (pulse omits it entirely). Anthropic's
  route pins reasoning off; OpenAI and Google stay `unverified` and no value is
  invented for them.
- Each parser has an explicit pure finish-reason mapping and populates the typed
  `NormalizedUsage`, including Gemini's native camelCase keys. Reasoning
  *content* stays dropped; only token *counts* come through.
- The canonical `FinishReason` (seven values) plus the provider's raw token are
  persisted on both the task and the immutable artifact.
- Prompt framing (`benchmark_mode`) and measurement mode remain **independent
  axes**. `AuditCreate` accepts `measurement_mode`, defaulting to benchmark so
  an explicit manual run keeps its full-run shape.
- The `/test` connectivity probe is a liveness check, not a measurement: it
  disables retrieval and caps output at config-owned probe values, so testing a
  key never buys a billable grounded search.

**`PULSE_ANSWER_INSTRUCTION` is an UNMEASURED CANDIDATE.** Its wording is pinned
by SHA-256 (`a7d86db3…fb69a`) so it cannot drift silently, and the frozen plan's
−56% cost / −49% latency figures are **not** attributable to it anywhere until a
live-key run validates them.

### 2.4 Capacity, pacing and worker accounting (T4)

Postgres-authoritative provider capacity.

- `ProviderCapacityBucket` (nulls-not-distinct pool identity, `blocked_until`
  index) and `ProviderCapacityLease` (per-attempt slot, expiry index).
- `app/orchestration/provider_capacity.py`: `acquire` locks buckets in canonical
  order (transport → connection → funded-global → funded-account) and atomically
  takes concurrency leases plus transport token starts; `release` frees leases
  (tokens stay consumed) and writes the clamped 429 cooldown to every drawn
  pool. Expired leases self-recover capacity.
- Route-owned token-bucket policy with rates **UNSET**, so funded pacing fails
  closed and BYOK runs concurrency-only.
- `capacity_wait` joins the claimable task-status vocabulary, with the matching
  `EVENT_TASK_CAPACITY_WAIT` event and `audit.capacity.*` telemetry.
- DB pool defaults now exactly cover worker peak demand (20+4 == 10×2+4), and
  `assert_worker_pool_capacity()` **raises at startup** when undersized —
  replacing a warning that could be ignored.
- Worker attempts are single-call with capacity and ledger accounting; funded
  reservations are released on **every** terminalization path.

### 2.5 Entitlements: registry, resolver, grants (T7)

- `app/core/config/entitlements.py` — the single config-owned capability
  registry (15 keys across flag/occupancy/consumable/rate/level types),
  construction-validated for unique keys, type↔rule pairing, positive rate
  windows and non-empty unique level orderings.
- Pure resolver fold (`domain/entitlements/resolver.py`): flags OR / counters SUM
  / levels MAX, boundary exclusion at the exact `at`, total consumable draw order
  (effective expiry → frozen source order → UUID), top-up expiry coupled to the
  readable base subscription end. **A single corrupt input fails the whole fold**
  — never a partial fold.
- Bounded in-process cache keyed by (account, registry revision, persisted
  lifecycle version): replica-safe invalidation via the per-resolve version read,
  `valid_until` + max-TTL servability, LRU bound.
- Grant write services: immutable idempotent bundles (one account-version bump
  per logical bundle, identical-replay suppression via
  `billing.duplicate_grant_prevented`, shape-conflict error), audited operator
  overrides with the non-issuable guard, deterministic revocations. Every write
  re-projects Site Health runtime rows in the same transaction, flushing before
  resolve because sessions run `autoflush=False`.
- Fail-closed default `no_capability_entitlement`: empty capabilities,
  `entitlement_unresolved`, never a partial fold.
- **v6 deletion, completed**: tier/capability config, `AccountEntitlement`,
  `BillingCheckoutAttempt`, and the catalog/quote/checkout/profile/me and
  workspace-entitlement endpoints are gone, with the symbol sweep done.
- Site Health moved from `WorkspaceSiteHealthEntitlement` to a neutral
  `WorkspaceSiteHealthRuntime` projection of the resolved `monitored_urls`
  allowance: zero allowance = fail-closed sample mode, positive = full mode with
  count disclosure.

### 2.6 Commercial catalog and write path (T8)

- `app/core/config/billing.py` owns validated immutable catalog structures:
  `CatalogPrice` (private `provider_price_ref`), `GrantTemplate`,
  `QuantityBounds`, `PlanCatalogEntry`, `AddonCatalogEntry`,
  `TopupCatalogEntry`, and a settings-built `CommercialCatalog` on the
  `commercial-v8` revision.
- Plan keys are locked to `tier_1` / `tier_2` / `tier_3` / `enterprise`, base USD
  9,900 / 19,900 / 29,900 minor units. Enterprise is contact-only with no price,
  no provider ref and no grants (T16 satisfied — deals are served by `override`
  grants the registry already supports).
- Region resolution, GST and the private per-region provider refs stay
  server-side; **an absent ref makes an item unavailable** rather than failing at
  purchase.
- Public `GET /api/v1/billing/catalog` renders the catalog with no workspace,
  connection or probe read, and never exposes `provider_price_ref`.
- Write path: server-resolved quotes bind the private refs to every charge;
  `Idempotency-Key` mutations commit the pending intent **before** any provider
  I/O and never write grants; one shared activation transaction (webhook +
  reconciliation) verifies provider identity and issues exactly one grant
  bundle; a bounded `SKIP LOCKED` sweep plus `scripts/reconcile_billing.py`
  recover missed webhooks. Uncertain provider outcomes, idempotency races and
  frozen deadlines are hardened; at most one pending base/add-on activation
  exists per account.

### 2.7 Enforcement (T9)

- `domain/entitlements/enforcement.py`: occupancy-checked mutations are
  serialized per billing account with a transaction-scoped advisory lock
  (`pg_advisory_xact_lock`, deterministic key from account UUID + config-owned
  namespace), and the resolved `project_slots` / `prompt_slots` allowance is
  checked **in the same transaction as the insert**, so concurrent writers can
  never exceed the grant. Fail-closed on unresolved entitlements.
- One shared prompt-insert capacity plan (`prepare_prompt_inserts`) for manual
  create, CSV import and AI-generation persistence: intra-request duplicates
  removed, persisted hashes queried, only actual inserts charged; DB uniqueness
  remains the final race guard.
- Concurrency tests synchronize two independent sessions at the mutation barrier
  and prove the grant is never exceeded for projects and for
  manual/import/generated prompt inserts.
- Funded ledger, admission control and manual-run rate limiting shipped, with the
  contract consumed exactly: `reserve_funded_task` / `record_billable_attempt`
  (timeout **is** billable) / `release_unused_reservation`. Funded authorization
  is proven only by a successful ledger reservation.

### 2.8 Prompt topical binding and bounds

Every prompt-write path and audit admission is bound to the project's
deterministic identity/category vocabulary (brand name + aliases, owned domain
host labels, Topic name/description, BrandProfile fields). Competitors are never
in the positive vocabulary, and the vocabulary never leaves the backend.

Call sites: manual create, CSV import (per-row errors, atomic — an invalid import
inserts no rows), text update, generated-output persistence (off-domain model
output is dropped), the human proposed→active transition, and `create_audit` over
every selected active prompt. Empty vocabulary fails closed.

`PROMPT_TEXT_MAX_CHARS` moved 4000 → 300. The new nullable
`AUDIT_AUDIT_PROMPT_COUNT` knob is deliberately **UNSET**: funded and trial audit
creation fail closed with `prompt_count_policy_unconfigured` rather than
inventing a count. BYOK runs are never gated by it.

### 2.9 Credentials: BYOK and platform-funded (T11)

`app/domain/providers/credentials.py` resolves execution credentials per task at
admission time and freezes the result into the task/audit snapshots, which the
worker loads verbatim and **never re-resolves**.

- Absolute BYOK precedence: a healthy, probed, unpaused BYOK route wins even when
  funded proofs exist.
- The platform fallback is proof-gated: a platform row in **the one** system
  workspace requires a resolved entitlement, a complete expected cost, and a
  matching reservation. Otherwise a coded `execution_credentials_unavailable`.
- That refusal is **byte-identical across all four failure legs** (BYOK absent,
  dev-login gate, funded proofs, no platform route) through a single
  `_unavailable()` helper — a security property, not a coincidence: the refusal
  must not leak which leg failed.
- Failed keys are paused (`paused_at` / `pause_reason` / `pause_until`), never
  silently falling back to funded execution.
- `Workspace.is_system` has a partial unique index enforcing exactly one system
  workspace; tenant surfaces scope to non-system BYOK rows and fail closed for
  the system workspace.
- When BYOK wins, the funded reservation is released in the same transaction —
  no stranded credits.

### 2.10 Read-path provenance and run streaming

- **Measurement provenance** on the audit / execution / evidence / overview /
  trend / export surfaces: canonical `measurement_mode`, frozen retrieval state
  and model provenance, derived **only** from frozen audit/task/artifact fields,
  with no mode alias.
- **Trend folding identity** is now `(measurement_mode, transport_model,
  retrieval_enabled)`. Raw/weekly/monthly folding combines points only inside one
  identity partition; explicit slice queries filter before folding. This stops
  numbers produced under different conditions being averaged together.
- **`GET /audits/{id}/events`** serves one discriminated contract in both JSON
  and SSE modes: `Last-Event-ID` resume (UUID-validated, authorized against the
  requested audit; unknown or foreign cursors get the same safe 404 as a foreign
  audit and never replay from the beginning), a tagged union on `event_type` with
  strict secret-free payload schemas, and SSE `event:`/`id:` read off the
  serialized DTO so they cannot drift from the JSON fields.

### 2.11 Frontend: contracts, billing, pricing (T13, T14)

- `lib/api/schemas.ts` is **transcribed** from the backend Pydantic models, and
  the contract-drift guard passes against the real backend OpenAPI — the guard,
  not a reading, is what verifies the transcription.
- Three shapes carry rules the UI cannot soften:
  - `limit_state` (`finite` | `unlimited` | `unknown`) is the only authority for
    what a null usage aggregate means. `UsageMeter` branches on the state and
    never renders an unknown allowance as an empty meter — an empty bar reads as
    "none left" when it means "we don't know".
  - `credit_price: null` is "not yet priced", not zero. `headlinePrice` and
    `checkoutSelection` return an explicit unavailable result.
  - Plan keys are locked to `tier_1|tier_2|tier_3|enterprise`; a retired
    `free`/`paid` key fails parsing rather than rendering as an unknown tier.
- Site Health lost its commercial vocabulary: `plan_key` and the free/starter
  branches are replaced by neutral `access_mode` and `count_disclosure`. The
  `?? 'free'` fallback is gone — a pending, errored or unresolved entitlement now
  resolves to no access, because defaulting granted a minimum never verified.
- `EntitlementProvider` gates on the resolved capability fold, failing closed on
  every non-resolved state.
- `BillingSettings` rebuilt around request-owned country (`/billing/profile`
  deleted) and renders plans from the catalog only — **no component-owned price
  remains to fall back to**.
- `/pricing` is a catalog-driven client island on a sync server component.
  `lib/marketing-content/pricing.ts` is presentation metadata only: no price, no
  quota, no capability value. A catalog failure shows a retry control rather than
  a stale $49. `AnimatedPrice` refuses to tween to or from a semantic state, so
  no fabricated price appears mid-transition.
- **Capture-and-resume checkout**: an anonymous click issues no billing request
  at all. It writes an untrusted breadcrumb (no amount, no external id, no
  identity claim), routes to auth, and on return revalidates the selection
  against the **live** catalog before any mutation. Stale, unknown, wrong-kind and
  out-of-bounds intents are discarded with a choose-again message; the stored
  idempotency key is reused so a first attempt that did reach the backend replays
  instead of charging twice.

### 2.12 Frontend: providers, runs, marketing

- Provider Settings consumes the **authenticated** connection projection,
  separately from public catalog availability. The four states fail closed:
  without the projection, or with a key stored but never successfully probed, a
  card reads `missing` / "verification required", never `connected`. "We hold a
  credential" and "the credential works" are different facts, and only the second
  is allowed to look green.
- Planned providers (Grok, Perplexity, Copilot) are keyboard-reachable cards with
  `route: null` and `availability: 'unavailable'`, exposing no key field and no
  actions. `useEngineConnection` gates on availability, so a mutation for them
  cannot be constructed. They are deliberately absent from the transport enum, so
  nothing can alias them onto a shipped transport. A fix in the final commit
  keeps them out of the connect dialog's default-engine fallback, discovery
  options and launch/filter controls.
- `useRunEvents` subscribes the run page to the resumable event stream as an
  **accelerator only**: polling remains the baseline, failures are swallowed, and
  events are invalidation signals — never rows. An unparsed or drifted event
  still invalidates, degrading to "something changed" rather than to bad data.
  Bursts coalesce into one trailing invalidation; the stream reconnects from
  `Last-Event-ID`.
- `MeasurementContext` renders mode, retrieval and model with singular and
  aggregate cases distinct: an execution names its one exact model; an aggregate
  spanning models says "Multiple models" and lists them rather than electing a
  representative that produced only some of the numbers. Null retrieval means
  unrecorded, not off.
- `WhatWeMeasure` states the four axes every figure carries — mode, exact model,
  retrieval state, cadence — before the verification story leans on them.
  **Cadence is described strictly as an allowance**; `landing-claims.test.tsx`
  fails the build on "next run" / "scheduled run" / "runs daily", because no
  dispatcher ships.
- Retired commercial claims were removed at the source, not reworded: the FAQ's
  $49 and "Free plan needs no card", Demo's two "Start free" CTAs, Onboarding's
  "free Site Health crawl", and ProductWindow's "high-ROI" (the prioritisation is
  real; the return on it is not ours to claim).

---

## 3. Decisions locked by this delivery

Do not relitigate these without a written amendment:

1. `ExecutionCostProjection` is append-only and versioned; every usage/cost
   column is nullable. Unknown never becomes zero.
2. The two pricing surfaces (`config/analysis.py` scoring rates vs.
   `config/costs.py` unit rates) coexist by design and must not be unified.
3. Projection `attempt_count` is the persisted actual `ProviderAttempt` count —
   never `max_attempts`.
4. The planner freezes the policy; the worker and adapters read only frozen
   fields and never re-read live settings.
5. Measurement mode and prompt-framing `benchmark_mode` are independent axes.
6. BYOK precedence is absolute; the funded fallback is proof-gated; the refusal
   is uniform across all failure legs.
7. Funded authorization is proven only by a successful ledger reservation. A
   timeout is billable.
8. Alembic `0001_initial` is the frozen explicit baseline — edit in place, never
   add `0002`, and always run the upgrade → `alembic check` → downgrade
   round-trip.
9. Telemetry event names are exact and secret-free: `billing.entitlement_unresolved`,
   `billing.funded_budget_exhausted`, `billing.consumable_credits_exhausted`,
   `billing.duplicate_grant_prevented`.
10. The dev-only login sits behind a single config flag, off by default, and
    hard-fails startup outside a development or test environment. It uses normal
    workspace membership, never bypasses `require_workspace_member`, never
    exposes platform-funded credentials, never appears in any response DTO, and
    has no frontend affordance.
11. Read paths commit nothing. The frontend is pnpm-only (`pnpm@11.9.0`).

---

## 4. Remaining scope

Nothing below was cut for scope alone. Each item is blocked on a missing
measurement, a missing external contract, or a missing owner. The full
specifications are preserved in the frozen plan
(`docs/plans/v8-cost-latency-and-tier-pricing.md`) and are lifted intact when
unblocked — deferring never weakened a requirement.

### 4.1 Prompt scheduling — timezone-aware audit schedules (T12)

**Highest priority.** Recurring scheduled audits are a required product feature,
not an enhancement. Deferred because the periodic-runner story has no owner.

Specification: frozen plan §T12, including the `AuditSchedule` +
`audit_schedule_occurrences` schema, the unique `(schedule_id, local_date)`
occurrence constraint, the DST policy (**gap**: dispatch at the first existing
instant after the missing local time; **fold**: dispatch exactly once), the
delayed-tick and concurrent-dispatcher cases, lead time derived from measured
p95, and the partial-report policy.

- Must be a **bounded, idempotent one-shot dispatcher script** invoked by
  deployment cron (`backend/scripts/dispatch_due_audits.py`) — not a
  long-running scheduler service, and not an interval callback inside
  `audit_worker.py`, which would couple schedule correctness to worker uptime.
- `benchmark_cadence` already resolves as an entitlement key. The shipped code
  must not imply scheduled runs happen — no "next run at", no schedule-management
  UI. The landing-claims test enforces this.
- **The T5 batch execution lane ships dormant** (`batch_enabled=False` on every
  route, test-only, no deployment invocation) precisely because its only
  production consumer is this dispatcher. Turning it on is part of this item.

**Blocked on:** a deployment owner for cron invocation, cadence policy, and
single-run operational policy.

### 4.2 Periodic deployment invocations

Each periodic job ships as a bounded idempotent script plus a testable service
function, with **no cron wiring**.

- `backend/scripts/reconcile_billing.py` — service and CLI shipped and manually
  runnable today, so a missed webhook never leaves a paying customer with no
  grants and no recovery path. Only the scheduled invocation is deferred.
- The trial reminder script arrives with §4.3.
- `backend/scripts/dispatch_due_audits.py` arrives with §4.1.

**Blocked on:** deployment owner, cadence, alert routing. Alert **rules** live in
deployment config outside this repo and need an owner.

### 4.3 Trial checkout, activation and abuse controls (T10)

Trial **grant mechanics** shipped: `source_kind=trial` is a first-class
`AccountGrant`, participates in the frozen spend ordering (trial first on exact
ties), expires on deadline or exhaustion, and is covered by resolver tests.
Operator, test and dev-seed paths may write trial grants — for API and
grant-algebra testing only, since no trial UI exists.

Trial **checkout returns `trial_unavailable`** (`config/billing.py`; the catalog
trial terms are copy and fixtures only and never enable a purchase). §8.2's abuse
requirements are **not relaxed**, only postponed.

Four hard dependencies, none of which exist at HEAD:

| Dependency | What is needed | Why it cannot be faked |
|---|---|---|
| Payment-instrument identity | A documented, stable, opaque Razorpay instrument fingerprint (HMAC'd before persistence), plus the duplicate-instrument cancellation/refund policy | §8.2 requires one trial per instrument **across all accounts ever**. Last-four, card network and customer id are not stable identities, and raw card data must never be stored. |
| Verified email | Immutable verified-email state and flow (`User.email_verified_at`, signed expiring tokens, send/resend/confirm) — built here or supplied by an auth workstream | HEAD has no verified state, and verification cannot be inferred from login or from an email merely being present. |
| Trusted IP + ASN | Edge-stripped client IP, a named ASN service, HMAC'd IP token + ASN retention policy, and a **review queue** rather than a hard block | Untrusted `X-Forwarded-For` is trivially spoofed, so using it would ship the control in name only. |
| Reminder delivery | A transactional email adapter with a named provider/template owner, for day-5 and day-6 reminders | Silently dropping reminders changes the product's promise. |

Also deferred with it: the immediate front-loaded pulse audit on trial start,
per-IP/per-ASN velocity limits, disposable-email blocking, and the review queue.

### 4.4 Coming-soon provider adapters (T15)

`provider.grok`, `provider.perplexity` and `provider.copilot` exist as catalog
flag keys, resolve through the grant algebra, and are surfaced in marketing and
in the UI with an explicit **coming-soon** label. None is ever routed:
`ACTIVE_TRANSPORTS` and `APPROVED_ROUTES` stay OpenAI/Anthropic/Google only, and
commercial activation returns `provider_unavailable` before any provider I/O or
grant issuance.

Delivery order: **Grok → Perplexity → Copilot**. Copilot is additionally
non-issuable (`issuable=False`) and is never written by any plan, operator, test
or dev-seed path.

> **Recorded deviation.** Keeping the Grok/Copilot logos and the six-provider
> accessible label is a deliberate, user-approved deviation from frozen §6.1 and
> the §12 gate *"no provider logo or capability claim without a shipped
> adapter"*. The gate was **not silently dropped**: the test changed from "logo
> absent" to "logo present, labelled coming-soon, and not connectable", the
> combined `role="img"` name splits Available from Coming soon, and the board
> contains no link or button at all.

**Blocked on:** verified official API contracts and live-key conformance tests per
provider (exact model, endpoint, citations, usage, truncation, 429, and
empty-search behaviour), which §6 requires before either provider can be sold.

### 4.5 Funded catalog completion

The funded machinery shipped — admission control, the consumable ledger,
per-task reservations, budget ceilings — but the funded **prices** are
deliberately unset. `funded_margin_bps` is `None`, so `_funded_credit_prices()`
returns empty, `credit_price` is `null`, and funded checkout and top-up packs are
unavailable. A null `credit_price` must never be coerced to zero or used to
fabricate a funded total.

Consequently the pricing page defaults to the available BYOK `base_price` and
renders funded mode as explicitly not-yet-priced. Frozen §7.1's "default OFF shows
funded, BYOK animates downward" behaviour is deferred with this item.

**Blocked on** these config-owned values, all of which §13 leaves genuinely open
and which are set **without any code change**:

- funded margin multiplier (`funded_margin_bps`)
- top-up pack sizes
- included benchmark credits per tier
- repetitions per benchmark
- OpenAI and Google expected costs (require the T1 harness against live keys)
- every applicable per-search fee (a route **fails closed** on the funded path
  until its fee is configured)
- prompt count per audit (`AUDIT_AUDIT_PROMPT_COUNT`; funded and trial admission
  fail closed with `prompt_count_policy_unconfigured` until set)

### 4.6 Measured execution policy (T6 gate closure)

The T1 harness shipped as a committed, runnable script with a recorded-fixture
test path, but was **not run against live providers** — no provider keys were
available, and no measured number is ever fabricated.

Two consequences to close:

1. **`pulse_answer_instruction` remains an explicitly-labelled unmeasured
   candidate**, hashed so it cannot drift silently. The §2.1/§11 figures (−56%
   cost, −49% latency) **must not be attributed to it** in code, docstrings,
   tests or user-facing copy until the harness has run. The T6 gate matrix
   records the "measured instruction" gate as deferred.
2. The §3.7/§12 exit gates requiring live measurement — the OpenAI and Google
   cost legs, per-search fees, per-route p95 tail timeouts, and the output-length
   distribution — remain **deferred with a written record** rather than marked
   passed.

`ttft_ms` stays null until real streaming timestamps exist; a known search count
of zero never establishes a provider's per-search fee.

**Blocked on:** live provider keys for OpenAI and Google (and xAI/Perplexity for
§4.4).

---

## 5. Superseded documents

| Path | Disposition |
|---|---|
| `docs/plans/v8-work-orders/HANDOFF.md` | Superseded — status table stops at commit 3 of 8; all 8 plus PR2 landed. Environment notes are the only still-current content, and `docs/DEVELOPMENT.md` owns those. |
| `docs/plans/v8-work-orders/implementation-plan.md` | Superseded — the commit graph it plans is merged. |
| `docs/plans/v8-work-orders/slice1-measurement-cost-capacity.md` | Superseded for T1–T6/T11; the T12 specification it carries under *DEFERRED TO PR3* is restated in [§4.1](#41-prompt-scheduling--timezone-aware-audit-schedules-t12) and remains authoritative in the frozen plan. |
| `docs/plans/v8-work-orders/slice23-entitlements-commercial.md` | Superseded for Tasks 1–10; the T10 trial specification under *DEFERRED TO PR3* is restated in [§4.3](#43-trial-checkout-activation-and-abuse-controls-t10). |
| `docs/plans/v8-work-orders/frontend-pr2.md` | Superseded — PR2 Tasks 1–5 are merged. |
| `docs/plans/v8-work-orders/context-brief.md`, `env-brief.md` | Superseded by `docs/backend-architecture.md`, `docs/frontend-architecture.md` and `docs/DEVELOPMENT.md`. |
| `docs/plans/v8-pending-features.md` | Superseded — its content is [§4](#4-remaining-scope) of this document, updated to HEAD. |
| `docs/plans/v8-cost-latency-and-tier-pricing.md` | **Not superseded.** Remains the frozen requirements authority. |
