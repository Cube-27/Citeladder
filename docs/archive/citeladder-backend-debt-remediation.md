# CiteLadder backend debt remediation plan

> Historical implementation plan. Implementation merged in PR #256. Deferred B20 legal wording remains with the current legal review draft.
> The original sequence and observations below are retained as dated evidence, not current work.

Date: 3 October 2026

Status: all six slices implemented on `codex/backend-debt-remediation`, in
the packaging order below. [PR #256](https://github.com/Cube-27/Citeladder/pull/256)
is open; stop before merging. CI and review acceptance remain PR gates.
Deployment is not authorized by this plan.

## Scope

The plan fixes the confirmed findings of the reconciled backend and Python
migration debt audit of 3 October 2026 (`.git/audits/backend-migration-debt-audit-2026-10-03.md`,
local only). The audit found no P0 or P1. It confirmed 9 P2 and 11 P3 findings,
left one finding needing a runtime check and rejected one. The findings
below were spot-checked against `main` at `caa7efab9`; backend code is
unchanged since the audit.

The work falls into three groups:

- **Queue correctness:** sustained heartbeat loss, a lock-order inversion and
  one recovery accounting gap.
- **Unbounded reads** on the Agent, visibility and command-center hot paths.
- **Python retirement residue:** dead modules and stale authority documents.
  There are no dual writers.

Binding owners: [invariants](../invariants.md), [architecture](../architecture.md)
(lock DAG, capability map), [API error contract](../api-error-contract.md),
[Site Health](../site-health.md) and [backend architecture](../backend-architecture.md).

## Findings, in priority order

| # | Finding | Sev | Slice |
|---|---|---|---|
| B2 | Five of six worker lanes keep working after sustained heartbeat loss; recovery re-dispatches the same task concurrently (duplicate paid I/O and credits) | P2 | 1 |
| B3 | Site Health `discover` persist locks `site_urls` before the runtime lock, which is a reachable 40P01 against `frontier.admitOne` | P2 | 1 |
| B11 | Agent `recover` never charges an attempt for runs still `leased`, so claim→start crashes can cycle forever | P3 | 1 |
| B1 | Unresolved entitlements in `budgetedPageLimit` surface as a retryable 500 `internal_error` on crawl admission | P2 | 2 |
| B10 | `replaceBody.site_url_ids` has no `.max()` | P3 | 2 |
| B4 | Agent context loads every page's `normalized_facts` for the newest crawl and re-parses JSON inside the sort comparator, inside the turn transaction | P2 | 3 |
| B6 | Command-center (dashboard and executive PDF) loads all completed audits and their core snapshots with no limit; `identity()` is unmemoized | P2 | 3 |
| B5 | Fanout read re-scans every answer of the whole selection on every page request | P2 | 4 |
| B13 | Evidence read runs a selection-wide `count(*)` and distinct-prompt query per page | P3 | 4 |
| B14 | Sources read re-aggregates the whole selection (plus a `categoryTotals` scan) and pages with OFFSET | P3 | 4 |
| B12 | Prompt-metrics read issues about 5 queries per selected run (UI sends at most one run) | P3 | 4 |
| B21 | Baseline comparison may issue one cell query per incompatible candidate (at most 100) | P3, needs runtime check | 4 |
| B8 | Dead bridge `backend/app/domain/billing/schemas.py` outlived its "until PR 17" condition | P2 | 5 |
| B9 | Orphaned `connectors/discovery_models/` and `answer_engines/grounding_redirect.py` | P2 | 5 |
| B15 | Eight empty Python package husks plus a stale comment in `core/config/measurement.py:144` | P3 | 5 |
| B19 | `compose-smoke.yml` still sets retired `LOGFIRE_*` env | P3 | 5 |
| B7 | `architecture.md` still assigns Python metering/admission bridges retired in PRs 17–20 | P2 | 6 |
| B16 | Invariant 18 cites nonexistent `frontend/app/globals.css` | P3 | 6 |
| B17 | `visibility-prompt.md` names nonexistent `scripts/jev_calibration.py` | P3 | 6 |
| B18 | Six broken relative links in active docs (two point at archived plans) | P3 | 6 |

### Not planned

- **Issues export `page_kind` mismatch** was rejected by the audit as
  unreachable, because `finding_class` is fixed per rule.
- **B20, the Tavily removal condition in the legal review draft,** is deferred
  to the next legal revision. It is a dated owner/legal document, and its
  hosting wording is already a pending owner action in the GCP runbook.

## Work slices

Slices are independent and ordered by risk. Slices 1–4 are TypeScript in
`frontend/services/api/src/`. Only B5 in slice 4 changes the schema.

### 1. Queue lease safety (B2, B3, B11)

- **B2:** add one shared heartbeat helper in `queue/`. It marks the lease lost
  when a heartbeat resolves `false` or two heartbeats in a row reject, and it
  exposes an abort signal or lost flag. Wire it into the analytics, discovery,
  site-health, integration and Agent lanes, matching the abort that
  `audit-worker.ts:122-124` already performs. Executors stop at their existing
  cancellation boundaries, which now check `isTerminal || leaseLost`.
  Tolerance of a single transient failure stays. Put the tolerance count in
  `config/execution.ts`, not in lane code.
- **B3:** in `site-health/discover-task.ts` `persist`, take `lockRuntime` before
  `writeArtifact`/`writeObservation`, and update the "taken late" comment. This
  follows the documented DAG `runtime -> membership -> crawl -> task`.
- **B11:** in `AgentQueue.recover`, increment `attempt_count` only for rows still
  `leased`. Running rows were already charged by `start()`. This matches
  `queue/recovery.ts:29` and its siblings.
- **Adjudicate while in here** (open questions from the audit):
  - `agent/worker.ts:15` awaits `queue.start()` outside its try block. Align it
    with `AnalyticsWorker.#execute` so a lease failure cannot fail the whole
    lane.
  - `controls.ts` `cancelOnce` takes task locks after the capacity advisory
    lock, which contradicts `architecture.md:145-147`. No cycle is reachable,
    so correct whichever side is wrong and record the rule once.
- **Tests:** these are concurrency changes, so they need the real PostgreSQL
  boundary.
  - A lane whose heartbeat keeps failing stops before recovery re-dispatches the
    task.
  - Two concurrent discovers that link each other's URLs complete without
    40P01.
  - A leased Agent run that is repeatedly recovered reaches `max_attempts`.

### 2. Admission error and input bounds (B1, B10)

- **B1:** `budgetedPageLimit` (`site-health/fetch-budget.ts`) throws a coded
  `ApiError('entitlement_unresolved')`, which is already in
  `contracts/src/error-codes.ts`, with `retryable: false`. Follow the error
  contract's new-code procedure for status and documentation.
- **B10:** add `.max()` to `replaceBody.site_url_ids` using the configured
  monitored-URL ceiling. Do not use a literal.
- **Settle the related open question:** `createPageRerunCrawl` reserves one
  unit but freezes `automatic_page_limit`. Make the frozen limit equal the
  reservation, or document why they differ.
- **Tests:**
  - A corrupt grant gives a 4xx response with the `entitlement_unresolved`
    code, on both crawl creation and page rerun.
  - An oversized `site_url_ids` array gets a 422 before any query runs.

### 3. Agent context and command-center bounds (B4, B6)

- **B4:** `site-health/reads/content-fragments.ts` selects only the fact
  sub-objects that scoring and projection use (`jsonb_build_object`), parses
  each row once into a precomputed score key, then sorts. Cap background-tier
  rows with a config value in the Agent context config. The output contract
  (`content_context_max_pages`) is unchanged.
- **B6:** `projects/command-center.ts` reads the newest N completed audits, with
  N in project config and enough to cover the baseline walk. It loads snapshots
  only for those audits and memoizes `identity()` per audit in a `Map`. The
  executive report uses the same bounded read.
- **Tests:**
  - Agent context ranking for a fixed fixture is unchanged, and a crawl larger
    than the cap returns the same top pages.
  - Command-center with more than N audits still finds the correct compatible
    predecessor.

### 4. Visibility selection reads (B5, B13, B14, B12, B21)

- **B5 (owner-approved 3 October 2026):** persist a derived per-answer fanout
  row at analysis settlement time. It holds the state, the trimmed query list
  and the exact source IDs and processing version. The read then becomes SQL
  `GROUP BY`/keyset over that projection, and reads stay pure. The schema
  change goes in `0001_initial.py`. The owner accepted a disposable local
  database reset under the pre-launch schema policy; shared, staging and
  production data are never reset.
- **B13:** derive `prompt_options` from `audit_prompt_snapshots`, and drop the
  exact `total` or compute it in the page pass. Check the contract consumers
  before changing the `total` semantics.
- **B14:** keyset-paginate sources on `(responses, key)` and compute totals and
  `categoryTotals` in one pass.
- **B12:** widen the five per-run queries to `audit_id in (…)` and group the
  results with the existing `groupBy` helper.
- **B21:** run the audit's measurement first. Seed 100 dashboard-ready runs with
  alternating `engine_routes`, count `loadComparisonCells` calls and keep the
  result in the PR record. Fix it only if the count is in the dozens; batch the
  cell query in that case.
- **Optional:** run `EXPLAIN` on the two index questions, the
  `site_change_observations` keyset and the dashboard `crawlCounters`
  `DISTINCT ON`. Add an index only if a large snapshot confirms a sort or scan.
- **Tests:** each changed read gives the same results as before on a
  multi-run fixture, and totals do not move with paging or `search`.

### 5. Python and CI residue removal (B8, B9, B15, B19)

Apply the [replacement gate](../invariants.md#replacement-and-retirement):
inventory importers first, delete, then re-grep.

- Delete `backend/app/domain/billing/schemas.py`,
  `backend/app/connectors/discovery_models/` and
  `backend/app/connectors/answer_engines/grounding_redirect.py`. Keep
  `answer_engines/contracts.py`, which `models/audit.py:43` imports. Settle
  whether its "until migration PR 20" retention note still applies, then reword
  or remove it. Tidy the `answer_engines/__init__.py` docstring.
- Delete the eight husk packages listed in the audit (B15) and sweep their
  parent `__init__.py` files. Reword `core/config/measurement.py:144`.
- Remove `LOGFIRE_ENABLED`/`LOGFIRE_TOKEN` from
  `.github/workflows/compose-smoke.yml`.
- **Open checks:**
  - Check whether `docs/operations/dependency-licenses.json` has a regeneration
    procedure that drops `logfire`.
  - Check whether any operator image expects `measure_answer_engine_matrix.py`.
- **Validation:** backend import and mypy checks, plus
  `node scripts/quality.mjs --mode check --scope backend`. CI owns the full
  suite.

### 6. Authority document repairs (B7, B16, B17, B18)

- `architecture.md:26-30`: delete the metering/admission-bridge clause and keep
  "Python retains catalog/operator administration".
- `invariants.md:246`: change the path to `frontend/apps/app/src/globals.css`.
- `visibility-prompt.md:148`: point to
  `frontend/services/api/src/prompts/calibration.ts`.
- Repair retired-plan references in `ACTIVE.md`. Repoint or drop the
  links at `visibility-prompt.md:84`, `:348`, `commerce-intelligence.md:119`
  and `integrations-traffic-analytics.md:213`.
- Validation: reference/link checks and `git diff --check` only.

## Packaging

The owner wants the whole plan as one PR (3 October 2026). Commit one slice at a
time in the order 6, 5, 1, 2, 3, 4, so the cheap removals land first and the
schema change lands last. Run `./scripts/check.ps1 -CheckOnly` once at the end,
because slices 1 and 4 change concurrency and persistence.
