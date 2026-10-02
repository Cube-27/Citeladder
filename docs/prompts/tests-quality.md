# Quality audit: tests that protect behaviour

Paste everything below the line into the model, at the repository root.

---

You are a test-strategy reviewer. CiteLadder has strict test admission rules: a
test must fail when behaviour regresses and pass when code is merely rewritten.
Find tests that **do not protect anything**, and **important decisions that no
test protects**. Your output is a findings report, not code changes.

**Read first:**

1. `docs/prompts/_contract.md` (coverage percentage is deliberately not a gate).
2. `AGENTS.md` sections "What earns a test" and "Validation".
3. `docs/DEVELOPMENT.md` section "Testing".

**Pick one area per run** (for example `frontend/services/api/test/` for one
domain, `frontend/components/<surface>/`, `backend/tests/`).

## Scope

The chosen test directory and the production code it targets.

## Hunt list

**Tests that do not earn their place** (report as P3 unless they mask a bug)

1. Assertions on literal source, config, documentation or workflow text,
   substring order, CSS classes, component nesting or full-markup snapshots.
2. Assertions that restate a constant or a mapping against a copy of itself.
3. Tests of framework behaviour (zod parsing, React rendering, Hono routing)
   rather than CiteLadder's use of it.
4. Tests that pass regardless of the code: assertions inside a branch that
   never runs, `expect` on a mock's own return value, missing `await` on async
   assertions, `try/catch` swallowing assertion errors, empty loops.

**Missing protection** (report as P1/P2 — these matter more)

5. A workspace-authorized route or MCP/Agent tool with **no cross-workspace
   denial test** (member of workspace B requesting workspace A's object).
6. A queue claim, lease recovery, settlement or idempotent terminalization with
   no test at the **real PostgreSQL boundary** (in-memory mocks cannot prove
   lock safety).
7. A branch that distinguishes `unknown`/`unavailable`/zero with no test
   exercising each state.
8. A billing path (webhook replay, reservation release on failure) with no
   test for the failure branch.

**Test hygiene risks**

9. Tests that could reach live providers or read inherited credentials
   (dotenv not disabled, real API base URLs, `process.env` keys passed through).
10. Skipped, `.only`, `xfail`, or conditionally disabled tests without a
    recorded reason; timing-based sleeps that make tests flaky.

## Not a finding

- Low coverage numbers on their own.
- "Should add more tests" without naming the regression and the branch.

## Subagent split

- A: weak tests (1–4) and hygiene (9, 10) across the chosen directory.
- B: missing protection (5–8) — start from production decision points, then
  search tests for each.

## Output

Use the report format in `_contract.md`. For missing-protection findings, give
the exact regression a test would catch, phrased as "If someone changes X to Y,
nothing fails".
