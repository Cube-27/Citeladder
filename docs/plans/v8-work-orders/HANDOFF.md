# v8 PR1 Backend — Handoff (commits 1–3 of 8 done)

Branch: `vorflux/v8-cost-latency-tier-pricing-backend` (base: `main`).
This directory carries the approved implementation plan and the detailed work
orders for continuing the v8 Cost/Latency + Tier Pricing delivery. Read in
this order:

1. Repo `Agents.md` (bootstrap rules) and `docs/invariants.md` (hard rules).
2. The frozen product doc: `docs/plans/v8-cost-latency-and-tier-pricing.md`.
3. This file.
4. Work orders as needed per commit (table below).

## Document map

| File | Original session path | Content |
|---|---|---|
| `implementation-plan.md` | `/code/.plans/v1-implementation-plan.md` | Approved master plan: drift analysis + the 8-commit PR1 graph, PR2, PR3. NOTE: its `/code/.plans/...` references map to this directory per this table. |
| `slice1-measurement-cost-capacity.md` | `/code/.plans/subplans/slice1-plan.md` | T1–T6 + T11 work orders (commits 3, 4, 5). Section "### 3. T3" is commit 4. |
| `slice23-entitlements-commercial.md` | `/code/.plans/parts/slice23.md` | PART B work order, Tasks 1–10 (commits 5, 6, 7). |
| `frontend-pr2.md` | `/code/.plans/parts/frontend.md` | PR2 frontend work order (gated on merged PR1 DTOs). |
| `context-brief.md` | `/code/.plans/CONTEXT-BRIEF.md` | Architecture/context brief. |
| `env-brief.md` | `/code/.plans/ENV-BRIEF.md` | Environment brief. |
| `../v8-pending-features.md` | — | PR3-deferred features (was untracked; committed with this handoff). |

## Status

| # | Commit | Status |
|---|---|---|
| 1 | Shared contracts + models (v8 capability registry, resolver types, schema) | DONE `d5a582f` |
| 2 | Resolver fold + grant services + Site Health runtime rewrite (v6 deletion) | DONE `2613449` |
| 3 | T2: cost config + append-only projection (+ T1 harness merged earlier as `e51050f`) | DONE `1e24e58` |
| 4 | T3: measurement-mode route/output policy + canonical response contract | **NEXT — not started** (code survey only) |
| 5 | PART B Task 3: commercial surface | pending |
| 6 | PART B Task 4: enforcement + funded admission | pending |
| 7 | T4: capacity + funded credentials (partially; see work order) | pending |
| 8 | Final schema sync + symbol-removal sweep + complexity baseline `--update` | pending |

Gate at last commit: full suite **1777 passed**, `ruff check .` clean,
`python -m scripts.check_complexity` green, migration round-trip clean.

## Environment

- PostgreSQL 16: `sudo pg_ctlcluster 16 main start`; password
  `searchify_dev_password`; dev DB `searchify` (schema STALE — tests don't use
  it; the suite builds a throwaway `searchify_tests_<runid>` DB via
  `Base.metadata.create_all` in a schema-translated engine).
- `uv` at `~/.local/bin/uv` — every shell needs
  `export PATH="$HOME/.local/bin:$PATH"`. Backend deps:
  `uv sync --extra dev` (dev is an extra, NOT a group).
- `.env`: only `DATABASE_URL=postgresql+asyncpg://postgres:searchify_dev_password@localhost:5432/searchify`.
- Test conftest: `session_factory` (async_sessionmaker, `expire_on_commit=False`,
  **`autoflush=False` mirroring production** — this caught a real bug in commit
  2; never "fix" a test by enabling autoflush), `db_session`, `client`.
  Per-test cleanup via batched DELETE driven by table metadata.

## Gates after EVERY commit

```bash
cd backend && export PATH="$HOME/.local/bin:$PATH"
uv run pytest <focused files> -q     # plus the full suite before each commit lands
uv run ruff check .                  # line-length 88
uv run python -m scripts.check_complexity
# Migration round-trip on a disposable DB after any 0001_initial.py edit:
sudo -u postgres psql -c "DROP DATABASE IF EXISTS searchify_foldcheck" -c "CREATE DATABASE searchify_foldcheck"
DATABASE_URL="postgresql+asyncpg://postgres:searchify_dev_password@localhost:5432/searchify_foldcheck" uv run alembic upgrade head
DATABASE_URL=".../searchify_foldcheck" uv run alembic check        # expect: No new upgrade operations detected
DATABASE_URL=".../searchify_foldcheck" uv run alembic downgrade base
sudo -u postgres psql -c "DROP DATABASE IF EXISTS searchify_foldcheck"
```

- Complexity: `NEW_FUNCTION_CC_CEILING = 15`; frozen budgets in
  `backend/scripts/complexity_baseline.json` by qualified name; same-named
  replacements inherit old budgets. **Do NOT run `--update` until commit 8** —
  7 stale budgets (incl. `build_execution_cost_projection` CC 3→2) are
  deliberately deferred so feature commits stay scoped.
- Alembic: `0001_initial` is the frozen explicit baseline. Never add `0002`;
  edit `0001_initial.py` in place; autogenerate does NOT emit CheckConstraints
  on existing tables (add manually); always run the round-trip above.

## Decisions locked in commits 1–3 (do not relitigate)

- Entitlements: v8 capability registry + pure resolver fold + grant/revocation
  services; Site Health reads a projected `WorkspaceSiteHealthRuntime` row;
  v6 `set_entitlement`/capability-tier vocabulary deleted (symbol sweep done).
- `ExecutionCostProjection` is append-only: one row per
  `(raw_response_artifact, formula_version, pricing_version)`; every usage/cost
  column nullable — **unknown never becomes zero**.
- Usage-key mapping (pinned in `cost_projection.py` docstring + tests):
  granular keys (`uncached_input_tokens`/`cached_input_tokens`/`output_tokens`/
  `reasoning_tokens`/`search_requests`) win; legacy totals map
  `total_input_tokens`→uncached, `total_output_tokens`→output; cached/reasoning
  have NO fallback; Gemini native keys unmapped until T3 normalizes them.
- Parsers no longer emit the fabricated `provider_cost_usd: 0.0` placeholder;
  absent cost is null (a fabricated zero is indistinguishable from a real one).
- Two pricing surfaces coexist BY DESIGN: `config/analysis.py` Gemini paid-list
  rates are scoring-only; `config/costs.py` owns unit-rate `RoutePricing`
  (all null until externally verified) + `expected_execution_cost()` for funded
  admission. Do not unify them.
- Projection `attempt_count` = persisted actual `ProviderAttempt` rows (worker
  builds the projection AFTER `_record_attempts`), never `max_attempts`.
- `MEASUREMENT_MODE_PULSE`/`MEASUREMENT_MODE_BENCHMARK`/`MEASUREMENT_MODES`
  already live in `app/core/config/audits.py` (forward-added in commit 3) —
  T3 must use them, not re-literal.

## Commit 4 (T3) integration notes — verified against the tree

Work order: `slice1-measurement-cost-capacity.md` section "### 3. T3".

1. **`provider_cost_microusd` vs `provider_cost_usd` key mismatch (fix in T3).**
   T3 types usage as `NormalizedUsage(..., provider_cost_microusd)` (already
   micro-USD), but T2's `_extract_usage` reads `provider_cost_usd` (dollars).
   Once the worker persists typed usage, artifacts carry only the new key and
   `provider_reported_cost_microusd` would silently project null. Extend
   `_extract_usage` to prefer `provider_cost_microusd` (validate with
   `normalize_optional_non_negative_int`, NO dollar conversion), keep
   `provider_cost_usd` as legacy fallback, pin precedence in a unit test, and
   update the cost_projection.py docstring vocabulary.
2. **Second `AnswerEngineRequest` site:** `app/domain/providers/service.py:297`
   (the `/test` connectivity probe) constructs the request too. New request
   fields (`retrieval_enabled`/`max_output_tokens`/`reasoning_effort`) ripple
   there. Decide probe retrieval deliberately (today all adapters attach
   search tools by default, so the probe performs billable grounded searches);
   give it explicit config-owned values and document the choice in a test.
3. **Frozen-vs-live policy:** the planner freezes the mode policy (cap,
   timeout, reps, retrieval, answer_instruction) into `Audit.configuration`
   (+ `AuditEngineSnapshot` + `provider_route_snapshot`); the worker reads the
   frozen policy (today it passes live
   `audit_settings.request_timeout_seconds`); adapters use ONLY the frozen
   request fields (today they read `provider_catalog_settings.max_output_tokens`
   inline). `_build_request_snapshot` records the frozen policy fields
   (snapshot-without-keys test).
4. **Stale-docstring sweep after Gemini normalization lands:** reword the
   `promptTokenCount` note in `cost_projection.py` to past tense (legacy
   artifacts only); keep `test_gemini_native_keys_are_not_mapped` as the
   pre-T3-artifact pin. `_StubAdapter` in `tests/component/test_audit_worker.py`
   constructs `AnswerEngineResponse` — new required fields ripple there and
   into providers-service probe tests.
5. **`create_audit` is at CC 23 with a hard no-new-branches constraint** —
   extract typed helpers (mode policy resolution, frozen snapshot assembly);
   every new/renamed function ≤ CC 15.
6. **Pulse instruction:** exact string
   `"Answer directly and concisely. Include only the details needed to answer the question."`,
   sha256 `a7d86db3b284d8d7397125046327ac013107240255cd6ba3ee6544feaebfb69a`
   (one test asserts hash equality so wording cannot drift). It is an
   **UNMEASURED CANDIDATE** — no code, docstring, test, or copy may attribute
   the frozen doc's −56% cost / −49% latency figures to it until a live-key
   T1 run validates them.

## Hard constraints (all commits)

- No fabricated measurements; `unknown` never becomes zero.
- Funded ledger contract (commit 6), consumed exactly:
  `reserve_funded_task` / `record_billable_attempt` (timeout IS billable) /
  `release_unused_reservation`; funded authorization proven ONLY by successful
  ledger reservation; `funded_monthly_budget_minor=50_000` converts via
  `MICRO_USD_PER_USD` from `config/costs.py` (minor × 1_000_000 // 100).
- Telemetry events (exact names): `billing.entitlement_unresolved`,
  `billing.funded_budget_exhausted`, `billing.consumable_credits_exhausted`,
  `billing.duplicate_grant_prevented` — safe fields only (opaque ids, no
  credentials/prompts/provider bodies).
- Read paths commit nothing.
- Frontend is **pnpm only** (`pnpm@11.9.0`) — PR2.
- Before opening PR1: run the repo's simplify + review + testing subagent
  gates per the session workflow; PR1 base is `main`.
