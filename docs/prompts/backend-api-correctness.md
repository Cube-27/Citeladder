# Backend audit: API correctness and invariants

Paste everything below the line into the model, at the repository root.

---

You are a senior backend reviewer hunting **logic bugs** in CiteLadder's
TypeScript API service (`frontend/services/api/src/`, Node + Hono + Kysely on
PostgreSQL). Your output is a findings report, not code changes.

**Read first:**

1. `docs/prompts/_contract.md` (note: Python has no HTTP process).
2. `docs/invariants.md` sections 6, 7, 9 and 18.
3. `docs/backend-architecture.md` section "API and persistence rules".
4. `docs/api-error-contract.md` sections 1, 2 and 4.

**Pick one feature area per run** (rotate between runs) and read its owner
document from `docs/README.md` before its code. Suggested rotation:
Site Health → Prompts/Visibility/Audits → Opportunities/Actions →
Integrations/Demand/Search Intelligence → Commerce → Projects/Onboarding.

## Scope

`frontend/services/api/src/routes/<area>*.ts` and the domain directory for the
chosen area, plus `http/`, `errors.ts` and `packages/contracts/src/` for the
area's response schemas.

## Hunt list

1. **Reads that do work.** A GET/read handler or read helper that crawls,
   syncs, calls a model/provider, enqueues tasks, scores, or "repairs" missing
   rows (Invariant 6). Look for writes, `fetch`, provider clients or queue
   inserts reachable from read routes.
2. **Collapsed states.** `unknown`, `unavailable`, `not_applicable`,
   `excluded`, `failed` and observed zero merged into `0`, `false`, `null`
   or "pass" (Invariant 7). Typical shapes: `?? 0`, `|| 0`, `Number(x) || 0`,
   `COALESCE(x, 0)`, `count ?? 0` on a value that can be legitimately absent,
   averages that divide by a count including unknowns, booleans derived from
   missing evidence.
3. **Pagination and cursors.** Keyset cursors (`http/keyset-cursor.ts`) with a
   non-unique sort key (rows skipped or duplicated), cursor not bound to the
   filter set, `limit` without upper bound, off-by-one on "has more".
4. **Time and windows.** Mixed local/UTC dates, inclusive/exclusive range ends,
   date-only buckets shifted by timezone, comparisons between periods of
   different length presented as comparable.
5. **Error contract.** Domain errors leaking provider bodies or stack traces;
   wrong status codes (500 for a validation error, 404 vs 403 inconsistency);
   unknown error codes not in the contracts vocabulary; uncaught promise
   rejections in fire-and-forget calls.
6. **Request validation.** Blank strings accepted after trim, unbounded
   arrays/strings, numeric params accepting `NaN`/`Infinity`/booleans,
   enum params accepting unknown values (Invariant 18).
7. **Contract drift.** Handler output shape vs the zod contract in
   `packages/contracts` (fields always `null` because a join is missing,
   enum values the contract does not list, nullable vs optional mismatch).
8. **Transactions.** Multi-statement mutations not wrapped in one transaction,
   so a mid-way failure leaves partial state; check-then-insert races that rely
   on a unique index that does not exist in `migrations/versions/0001_initial.py`.
9. **Determinism.** Scores or metrics that depend on unordered query results,
   `Date.now()` inside derivations that should be reproducible, or model output
   used to set a deterministic metric (Invariant 9).

## Not a finding

- Handlers that return persisted "missing"/"unavailable" states — that is the
  intended read behaviour.
- `version = 1` constants.
- Python SQLAlchemy metadata under `backend/app/models` — not the application runtime.

## Subagent split

One subagent per hunt-list group: (1+9), (2+4), (3+6+7), (5+8). Each covers the
chosen feature area only.

## Output

Use the report format in `_contract.md`. State the feature area audited in the
Summary so the next run can rotate.
