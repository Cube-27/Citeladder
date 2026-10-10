# Execution platform improvement plan

**Status:** decisions answered 2026-10-10; PR A (runner and hosting cost) implemented, PR B (Python retirement) in progress in a separate PR.

Feature 14 of the [feature review tracker](feature-review-tracker.md): the
PostgreSQL task queues, the runner and tick executions, lease recovery and
Cloud Run wake-up, the GCP hosting in `infra/gcp`, the deploy workflow and the
remaining Python schema tooling (`backend/`, `migrations/`). Shipped behaviour
belongs to [backend architecture](../backend-architecture.md) and the
[GCP runbook](../operations/GCP_RUNBOOK.md), not to this plan. Constraints come
from the [invariants](../invariants.md), especially 5 (production data is never
reset), 15 (PostgreSQL is the durable queue) and 17 (single migration baseline).

## Context

There are about 24.5k Python lines, not the tracker's 60k: 11.4k of models,
3.9k of tests, 1k of scripts and config, and an 8k-line `0001_initial.py`.
Python has no runtime role. The migrate job runs `alembic upgrade head`,
`alembic check` and then the native bootstrap (`scripts/bootstrap-environment.sh`).
TypeScript DB types are generated from the migrated database
(`kysely-codegen`), not from the models, so the models are read only by
`alembic check` and the Python tests' `create_all`.

Production evidence (read-only `gcloud`, 2026-10-10):

- The billing account `01930D-1C8A9C-5589D1` reports `open: false`. Images
  can't be pulled (`ContainerPermissionDenied`), and the API returned
  "billing is disabled" 500s from 2026-10-09 17:07Z. Every tick has failed since
  2026-10-09 15:50Z. The DB VM is still running, but there are no backups.
- Ticks also failed for about 25 hours on 2026-10-03/04 (a missing secret
  grant). Nobody was alerted, because there are no alert policies.
- 1,086 tick executions (Oct 2–9) had a median wall time of 144 s (p90 203 s).
  Execution conditions show almost all of it is Cloud Run starting the task:
  `citeladder-tick-8jsb5` started at 12:00:43, its container ran from 12:02:14,
  and the runner finished at 12:02:29. The application ran about 15 s, and an
  idle tick does little work. The audit's projection of about 550k vCPU-s a
  month assumed the whole wall time is billed compute. That is unverified, and
  the start wait is probably not billed. The budget never fired because it
  counts credits (`budget.tf` set no `credit_types_treatment`).

## Findings

### Schema delivery and data safety (Performance and cost; Logic and correctness)

1. **No schema change can reach production without wiping it.** Production is
   stamped `0001_initial`, so `upgrade head` does nothing. `alembic check` then
   fails on any change folded into 0001, which #336 (four `mcp_oauth_grants`
   columns) and #333 both did. The deploy stops before the API rolls forward.
   The only remedy in the runbook is `reset_database` (GCP_RUNBOOK.md §4),
   which deletes every row. That contradicts invariant 5 and the 2026-10-07
   tracker entry ("production can't be reset").
2. **No backups, and the data can be destroyed by an ordinary deploy.** The
   data is on the VM boot disk with `auto_delete = true` and
   `deletion_protection = false` (`database.tf:13-19`). The deploy runs
   `terraform apply -auto-approve` with no plan gate. Any change that forces a
   new instance (zone, which the runbook invites changing at line 91; IP;
   service account; disk) wipes the database without `reset_database`.
3. **No alerting** (no `google_monitoring_*` resources; Monitoring API not
   enabled by `bootstrap.ps1`). Two outages went unnoticed.

### Runner correctness (Logic and correctness)

4. **Any lane failure cancels the successor start.** A lane that throws is
   skipped for the rest of the drain and dropped from the idle `nextDue` probe.
   `drainLanes` then throws `AggregateError` (`workers/runner.ts:98`), and
   `runExecution` probes and starts the successor only after a clean drain
   (`workers/execution-process.ts:18-27`). One transient error leaves every
   lane's deferred work for the next tick. A periodic phase that fails on every
   tick disables successors for good. This is the recurring lane-stall pattern.
5. **Expired leases are invisible to `nextDue`.** Every probe filters to
   claimable statuses (`task-queue.ts:142`, `site-health-worker.ts:167`,
   `audit-queue.ts:175`, `discovery-queue.ts:83`, `integration-worker.ts:196`).
   Agent and billing have no probe at all. Work orphaned by a killed request or
   execution waits for tick plus the lease TTL. Audit lease recovery runs only
   in the tick's `audit-maintenance` phase.
6. **Site Health lock contention fails the lane and charges an attempt.**
   `fail()` re-takes the crawl lock it just timed out on
   (`site-health-worker.ts:337`). A second `55P03` rejects the executor, the
   lane is disabled (finding 4), and lease recovery later charges an attempt
   that contention is meant to keep free.
7. **Late integration admission writes off an attempt.** The claim charges the
   attempt, and the drain deadline aborts the sync within about 1 s. A sync
   admitted with too little budget left loses an attempt through no fault of
   its own (`integration-worker.ts:165`, `runner.ts:189-200`).
8. **The drain-lock `pg.Client` has no `'error'` listener** (`runner.ts:154`).
   A dropped connection (DB VM restart) crashes the runner, or an API instance
   serving an interactive crawl, while it holds claimed work.
9. **Postgres has no keepalive or idle-session timeout.** Connections from
   killed Cloud Run instances hold slots against `max_connections = 40` for up
   to about 2 hours (`postgres-vm.sh:90`).

### Cost (Performance and cost)

10. **Unneeded job starts.** `committed-work.ts:44-49` counts any write to an
    execution table, including the interactive worker's own claim, heartbeat
    and settlement, so nearly every interactive POST starts a runner job even
    when nothing is left.
11. **Unbounded successor chains.** An idle drain stays alive, and then starts
    a successor, while any work is due within the budget. DataForSEO polls
    (every 60 s, up to 30 times) and `capacity_wait` retries keep a 1 vCPU job
    running for about 30 minutes per poll set. Nothing caps runner-seconds.
12. **Execution start latency, not idle work.** A tick with no work takes
    about 2 minutes of wall time. Almost all of it is the 1–3 minutes Cloud Run
    takes to start the task (see Context), which also delays every successor and
    request wake. Per-phase timing was missing. `queue-recovery` duplicates the recovery that the discovery and integration
    lanes already run on every pass.
13. **Smaller items.** Secret versions are never destroyed (19 secrets; 6
    versions are free). The tick and runner jobs use 1 GiB. VPC flow logs are
    on. The migrate job needs a second image (Python 3.12 + Node, about 558 MB)
    built on every deploy.

### Operator usability (Usability)

14. `runner_lane_failed`, `tick_phase_failed` and `runner_next_due_failed` log
    the lane name but not the error. `runner_completed` is not logged on
    failure and has no per-lane counts. There is no queue-depth or stuck-lease
    query in the runbook.

### Python and schema debt (Architecture and debt)

15. Every schema change is written twice: the models and 0001. The TS types
    are then generated a third time. The models' 998 client-side `default=`
    never run, because Kysely writers don't execute them, and several have
    drifted from native config (`commerce_catalog.py` versions `-1` against
    `audits.json` `-2`; `ANALYZER_VERSION` v1 against v2).
16. `billing_customers` and `discovery_model_configs` have no TypeScript reader
    or writer.
17. The Python tests run against `create_all`, not the migration. Several
    assert source text or names, which AGENTS.md excludes
    (`test_migration_revision_baseline.py:90-166`, `test_model_registry.py:96-148`,
    `test_static_analysis_tools.py`, and the 371-line `test_check_complexity.py`
    for about 1k lines of declarative code). About 1.6k lines of constraint and
    workspace-isolation tests earn their place.
18. `backend/tests/fixtures` is used only by TS tests and the shipped
    `cli/seed-transports.ts`. `.importlinter` guards packages that don't exist,
    `complexity_policy.json` lists the empty `evaluations/`, and
    `check_test_shape.py` never scans TS tests.

### Debt in the queue code (Architecture and debt)

19. There are five lease-recovery implementations with different charge rules,
    four claim implementations (integration has no workspace fairness), five
    `nextDue` variants, and a billing heartbeat with no abort or failure limit.
    `IntegrationWorker.runUntilIdle` and `AgentWorker.runUntilIdle` have no
    production callers.
20. `execution-process.ts` (the successor decision) has no test.
    `runner.test.ts:162` asserts the finding 5 gap as intended behaviour.

## Owner decisions (2026-10-10)

- **Billing:** the owner is restoring the billing account. It is not this
  plan's work.
- **Schema policy:** unchanged until there are live customers. Changes are
  folded into the single baseline, and a changed baseline reaches production
  through the deploy's database-replacement option, whose confirmation check
  stays. Findings 1 and 2 are accepted as pre-launch policy.
- **Python:** retire it. The baseline becomes one SQL file applied by a
  TypeScript migrate CLI from the API image. The CLI records a checksum, and
  fails the deploy when the baseline has changed under a populated database,
  the same stop `alembic check` gives today. This ships as its own PR.
- **Backups and a deploy guard:** not needed before launch.
- **UX addition:** faster first results. Waiting work starts on time instead of
  waiting for the next tick; no new UI.
- **Tick cadence:** stays at 10 minutes. The idle time is fixed and then
  re-measured.

## Phases

### PR A: Runner correctness and hosting cost (shipped scope)

- `runExecution` decides the successor after a failed drain too. A
  `LaneFailures` error names the failed lanes, which are excluded from the probe
  while the rest still get a successor. Lane, phase and probe failures are
  logged with their exception, `runner_completed` names failed lanes, and each
  tick phase logs its duration.
- `nextDue` reports the earlier of the next claimable row and the next lease
  expiry for analytics, Site Health, audits, discovery and integrations
  (`queue/next-due.ts`). The Agent lane reports when an unclaimed turn passes its
  grace; a streaming turn's live lease does not keep the runner alive.
- Audit lease recovery runs in the audit lane (`AuditMaintenance.recoverLeases`).
  The duplicate `queue-recovery` tick phase and `recoverQueues` are removed.
- A Site Health task whose failure settlement hits crawl-lock contention
  releases its own lease as a contention retry instead of failing the lane and
  being charged by lease recovery.
- An integration sync stopped by the drain deadline before it had one provider
  request timeout is refunded (admitted late); one that had the time and
  committed nothing still counts.
- The pool and the drain-lock session have `'error'` listeners and TCP
  keepalive. Postgres gets server-side keepalives. The budget excludes credits.
- The runbook's cutover history is replaced by deploy acceptance, a stuck-work
  query is added, and the log-exclusion text is corrected.

Deferred, with reasons:

- **Probe before a request wake (finding 10):** the API would need a second
  copy of every lane's due query. Interactive requests are rare before launch,
  and a wake with nothing to do ends in seconds after the start wait.
- **Successor-chain cap (finding 11):** the chains measured are legitimate
  polling work. A cap needs persisted state, so it waits for a measured cost.
- **Billing `nextDue`:** payments are not active, and its three probes have
  bespoke retry conditions.
- **Tick memory 512 MiB and tick cadence:** the measured time is start latency,
  not idle work. Lowering memory risks the Site Health parse pool without a
  measured saving.
- **One shared lease-recovery helper, claim fairness for integrations, removing
  test-only `runUntilIdle` methods, alerts and secret-version cleanup:** these
  were moved to the backlog.

### PR B: Schema without Python

- `migrations/0001_baseline.sql` is generated from the current 0001. A
  TypeScript migrate CLI applies it, with an advisory lock, a ledger holding the
  checksum. A database stamped only by Alembic is treated like a changed
  baseline: the job fails and the database is replaced (no adoption shim). The
  migrate job runs from the API image.
- `backend/`, the Python `migrations/`, the root `Dockerfile`, `reset-db.py`,
  the backend CI job and the Python steps in the api and security jobs are
  deleted, and the two orphan tables are dropped.
- The constraint and workspace-isolation tests are ported to Vitest against
  real Postgres, and the fixtures move under `frontend/services/api/test/fixtures`.
- Invariants 1, 2 and 17, the backend architecture, DEVELOPMENT and the runbook
  are rewritten. The `quality.mjs` schema-authority rule names the SQL baseline.

Acceptance: an empty DB migrates and passes `db:types:check`; a rerun is a
no-op; a changed baseline or an Alembic-only stamp fails the migrate job; the
deploy builds one image.
