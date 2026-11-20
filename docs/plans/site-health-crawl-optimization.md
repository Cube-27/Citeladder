# Site Health crawl optimization

Make Site Health crawls as fast as the current infrastructure allows, at no
extra monthly cost. Work that needs money or new infrastructure is in the
[backlog](backlog.md#site-health-crawl-scaling-needs-spend), each item with the
measurement that would justify it.

Written 2026-11-17, after #936–#945 shipped sitemap-first discovery, the lock
convoy fix, the open-task index, the progress-based overdue rule and the
averaged live score. Paths are under `frontend/services/api/src/` unless they
start with `infra/`, `docs/` or `frontend/`. Line numbers are from main at
`1ef00ef23`; re-locate before editing.

## Owner decisions (2026-11-17)

Recorded from the owner's answers in chat on 2026-11-17.

- **CO-1, commit durability.** `synchronous_commit` stays `on` globally. Only
  the runner's Site Health transactions turn it off (`SET LOCAL`), so a
  database crash can lose at most the last fraction of a second of crawl work,
  which lease recovery redoes. Billing, ledger, webhook and paid-provider
  commits stay durable.
- **CO-2, finalize cap.** Terminalization becomes batched and leased. After
  **3** failed attempts on the normal task backoff the crawl ends `failed`
  with a recorded reason. A cancelled crawl whose publication fails stays
  `cancelled` and is not retried.
- **CO-3, live counters may lag.** While a crawl runs, screens read the counters
  persisted on the crawl row, up to about 30 s old, instead of counting on
  every poll.
- **CO-4, at most five PRs.** The work ships as the five PRs below.
- **CO-5, workspace indexes.** Drop a workspace-only index (for example
  `ix_site_rule_evaluations_workspace_id`) only if another index on the table
  already leads with `workspace_id`. Otherwise replace it with a composite
  index that leads with `workspace_id`. Do not decide on scan counts alone.
- **CO-6, provenance and retention.** Reverse the provenance link:
  evaluations carry their owner id (`analysis_id`, since snapshots reuse
  evaluations across crawls under SH-B9), and a snapshot stores no list of
  evaluation ids. Evidence tables are partitioned by crawl month, so a later
  retention policy is a partition drop.
- **CO-7, batched publication at scale (owner, 2026-11-20).** Crawls of up
  to tens of thousands of pages (a 51,000-URL inventory) must complete on the
  current infrastructure, with no extra spend. While a crawl runs, analysis,
  the score and the Issues publish in batches. A cancelled crawl keeps
  everything published so far. Every crawl-wide step works in bounded batches:
  setup, finalize, the projection and the reads. Slow is acceptable; failing
  is not. The
  [Site Health doc](../site-health.md#crawl-lifecycle) owns the contract.
- **Deferred to the backlog:** fused discover and analyze for walked pages
  (measure how many crawls still walk first), and incremental recrawl.

Earlier decisions this plan builds on, in the
[Site Health crawl plan](site-health-baseline-crawls.md#owner-decisions-2026-11-12):
SH-B5 (sitemap-first discovery, with the link walk only as a fallback), the
30-minute stall rule with a 12-hour cap, and the live card as an average of
stored page scores.

## Where the cost is

**Infrastructure.**
- The database is PostgreSQL 16 on an e2-micro VM (shared core) with a 30 GB
  pd-standard boot disk (`infra/gcp/database.tf`). Google's published limits
  for that disk are roughly 22 read and 45 write IOPS. These figures are from
  documentation; confirm them on the disk graphs.
- Tuning is minimal (`infra/gcp/postgres-vm.sh:92-93`), so `synchronous_commit`
  and `jit` are on, and `pg_stat_statements` is absent.
- The runner is a Cloud Run job with 1 vCPU, 1 GiB, a 4-connection pool, 4 task
  slots (`workers/runner.ts:406`) and a 600 s budget.

**One sitemap-path page, counted from code.** These counts describe the code
on 2026-11-17.
- 4 commits:
  - the claim;
  - `markRunning` (`analyze-task.ts:379`);
  - `expectClassification` (`analyze-task.ts:175`);
  - the evidence and settle transaction.
- About 40 round trips. `loadScope` runs three times.
- About 47 evaluation rows (measured by the 2026-11-17 audit). They go into 4
  indexes, so about 188 index inserts.
- The task row is rewritten 4 times, each a non-HOT update across about 11
  indexes.
- Every evidence id is a random UUIDv4, so inserts scatter across index leaf
  pages.

A walked page (`discover` then `analyze`) costs 7 commits.

**Likely bottleneck (inferred).** The likely bottleneck is synchronous WAL flushes (4 per page) and random index-page writes on a disk with about 45 write IOPS, plus database CPU on a quarter core. Nobody has measured database CPU per page since #936–#945, so PR 1 measures it first. Do not predict throughput before that.

## Measurement kit

Run these read-only, with one crawl as the only load, in a read-only session
through the database SSH tunnel
([daily operation](../operations/GCP_RUNBOOK.md#3-daily-operation)).
Every PR reports before and after numbers from them in its body.

- **K1, throughput.** Tasks settled per minute, by kind, for one crawl (`site_crawl_tasks.completed_at`).
- **K2, commits and WAL per page.** Deltas of `pg_stat_database.xact_commit` and `pg_stat_wal` (`wal_bytes`, `wal_fpi`, `wal_records`), divided by K1's pages.
- **K3, statements per page.** Deltas of `pg_stat_statements` (needs PR 1): calls, `total_exec_time + total_plan_time`, `shared_blks_read`, `wal_bytes`, and the top 15 statements by time.
- **K4, tables and indexes.** `pg_stat_user_tables` (`n_tup_upd`, `n_tup_hot_upd`), `pg_stat_user_indexes` (`idx_scan`), and index sizes.
- **K5, database VM.** CPU, disk write ops and throttled operations (Cloud Monitoring).
- **K6, runner gaps.** `runner_completed` log lines, and the gaps in K1 at execution boundaries.
- **K7, contention.** `log_lock_waits` lines; tasks with `conflict_count > 0`.
- **K8, fetch latency.** Percentiles of `site_fetch_attempts.latency_ms` and `site_fetch_artifacts.ttfb_ms`.
- **K9, terminalization.** Time from the last task's `completed_at` to the crawl's `completed_at`, and the runner's memory use.

## PR 1. Infrastructure flags, measurement and the runner budget

- **Database flags** (`infra/gcp/postgres-vm.sh` `run_args`):
  - `jit=off`;
  - `shared_preload_libraries=pg_stat_statements` with `track_planning=on`;
  - `track_io_timing=on`;
  - `log_lock_waits=on`, `log_min_duration_statement=500`, `log_autovacuum_min_duration=0`.

  Run `CREATE EXTENSION pg_stat_statements`, and grant `pg_read_all_stats` to the read-only measurement role. Try `wal_compression=lz4`, `checkpoint_timeout=15min` and `max_wal_size=2GB`; keep each only if K2 improves without K5 CPU rising.
- **Async commit for Site Health only (CO-1).** Run `SET LOCAL synchronous_commit = off` in the Site Health claim transaction and in `commitTask` (`site-health/site-task.ts`). Every other lane and the global setting are unchanged.
- **Runner budget.** Set `runner_budget_seconds = 3000` (`infra/gcp/variables.tf`); the job timeout follows as 3600 s.
- **Successor pre-start.** About one cold start before the deadline, start the successor with a handover flag. The handover skips the `drainActive` probe (`workers/start-runner.ts`) and waits for the drain lock for the in-flight tail (`config/execution.ts` `drainLockWaitMs`).
- **Expected effect.**
  - Synchronous flushes per Site Health page drop from 4 to 0 (7 to 0 for a walked page). This is counted from code; the wall-time saving is inferred.
  - Runner boundaries drop from 6 an hour to about 1.2.
  - K3 exists from here on.
- **Risks.**
  - Changing the container arguments recreates the database container. That is a restart of seconds to a minute; do it with no crawl running. It needs a Terraform apply that the owner runs.
  - A runner now lives up to about an hour, so forward migrations must stay compatible with the previous image for that long.
  - Runner memory over 50 minutes on 1 GiB is unmeasured; watch K9.
- **Docs.**
  - `docs/operations/GOOGLE_CLOUD.md`: the flags.
  - `docs/site-health.md`: the scheduler text says a 10-minute tick; the schedule is `*/20`.
  - `docs/operations/WORKERS_RUNBOOK.md`.
- **Measure.** K1, K2, K5 and K6 before and after. Record the first K3 baseline in the PR.

## PR 2. Hot path and evidence storage

Per-page work, and the schema it writes to.

- **Claim straight to `running`.**
  - Set the Site Health lane's `claimStatus` to `'running'` (`queue/task-queue.ts:97-103`), as the discovery lane does.
  - Delete the `markRunning` calls in `site-task.ts`, `analyze-task.ts`, `discover-task.ts` and `site-setup-task.ts`.
  - The fence still re-checks the owner, the attempt and the expiry at commit. Readers already treat `leased` and `running` alike.
  - Needs the real-PostgreSQL lease tests.
- **Reuse the loaded scope.**
  - Pass `prepare()`'s scope into `persist()` and drop the extra `loadScope` reads in analyze and discover. The under-lock `contextMoved` check still defers a stale context.
  - Where analysis reuses an artifact, fold `expectClassification` into the statement that starts the task.
- **Coalesce progress events.** Write `analysis.progress` and `discovery.progress` on the refresh cadence, not once per page. The frontend ignores `.progress` frames (`frontend/lib/site-health/use-crawl-events.ts`).
- **A failed analyze is progress.**
  - A failed or cancelled analyze with siblings still outstanding is `analysis_progress`, not `boundary` (`lifecycle.ts` `settlement`).
  - Today every failed page runs a full reconcile under the crawl lock.
- **Evidence storage migration (CO-5, CO-6).**
  - **Time-ordered ids.** One helper generates UUIDv7 ids for evaluations, issues, attempts, artifacts, analyses, events, observations, frontier rows and tasks; existing rows keep their ids. Ids stay UUIDs and never authorize anything, but they now reveal when a row was created.
  - **Partition by crawl month.** Evidence tables (evaluations, issues, attempts, artifacts, observations, events) are partitioned by crawl month. Primary keys and unique constraints must include the partition key, and their foreign keys must be re-checked. Move the existing rows with a forward migration; no reset (forward migrations only).
  - **Index diet.**
    - Make `ix_site_rule_evaluations_source_architecture_id` partial (`WHERE source_architecture_id IS NOT NULL`).
    - Add `(analysis_id)` on evaluations; PR 3 needs it.
    - Workspace-only indexes follow CO-5: drop one only if another index on the table already leads with `workspace_id`, otherwise replace it with a composite that leads with `workspace_id`.
    - Drop `uq_site_crawl_task_idempotency_key` if nothing reads the key; its only reference is the writer in `admission-writes.ts`.
    - Use `fillfactor` 70–80 on `site_discovery_frontier`, `site_url_observations` and `site_urls`.
- **Small lock fixes.**
  - **Reruns:** `lockControlScope` (`selection.ts`) pre-checks for an active crawl without locks, as `createCrawl` does, and locks the crawl `FOR NO KEY UPDATE`. Today it locks the crawl `FOR UPDATE`, which blocks child inserts.
  - **Stop:** cancel open tasks with `SKIP LOCKED` (`controls.ts`).
  - Retry the evidence commit once in-process only if K7 still shows `db_conflict`.
- **Expected effect** (inferred; K3 decides).
  - Commits per page drop from 4 to 3 (7 to 5 for a walked page), and round trips from about 40 to about 28.
  - Task-row versions drop from 4 to 3, and evaluation index inserts from about 188 to about 141.
  - Random index leaves dirtied per page drop from about 50 to a handful.
- **Risk.** Medium. The partitioning migration is the largest part. If it alone would make the PR unreviewable, the builder may split it out, as long as the plan stays at five PRs or the owner agrees otherwise.
- **Docs.**
  - `docs/backend-architecture.md`: the lane table (claim status).
  - `docs/site-health.md`: evidence storage and partitioning.
  - Invariant 3 stays true; reread it.
- **Measure.** K2, K3 and K4 per page before and after; K5 disk write ops.

## PR 3. Batched terminalization with a cap, and reversed provenance

- **Problem.** When a crawl drains, one locked transaction (`lifecycle.ts` `reconcileLockedCrawl`) does all of the following:
  - loads every artifact's facts three times, in `canonical-alias.ts`, `lifecycle-finalize.ts` and `terminal-analysis.ts`;
  - inserts finalize evaluations one page at a time;
  - reloads every evaluation, with its evidence, for the snapshot;
  - filters evaluations by `analysis_id`, which has no index.

  At 14k pages that collides with the 30 s statement and idle-in-transaction timeouts and with 1 GiB of runner memory, and a failure retries every 15 s forever (audit S2).
- **Change.**
  1. **A `finalize` task kind.** It is enqueued once when a crawl drains, and for a cancelled crawl that has evidence. It commits in chunks under its lease, as `site_setup` does. Its `max_attempts` is 3 (CO-2).
  2. **Prepare outside any transaction.** Keyset-read only the needed fields: final URL, canonical, noindex, hreflang, anchors and the content fingerprint. Build the cross-page context in memory.
  3. **Batches of about 200 pages.** Each batch is one short transaction under the crawl lock. It inserts the batch's finalize evaluations and issues in one multi-row statement, writes the final revisions and flips `is_current`. The root goes first. A page that already has a revision drops out of the pending set, so replaying a batch does nothing.
  4. **Publish in one transaction.** Issue currency, catalog, issue states, snapshot, score summary, terminal status, counters, fetch settlement and successors. The snapshot reads only the evaluation columns the aggregate needs, in chunks.
  5. **When the task fails for good,** the crawl ends `failed` with a recorded reason and the fetch hold is settled. A cancelled crawl stays `cancelled`.
  6. **Reversed provenance (CO-6).** A snapshot stores its analysis set as rows, not as `source_evaluation_ids` arrays. Evaluations are reached through their `analysis_id`. Update every reader of the snapshot id arrays: change intelligence, issue reads, `addArchitectureIssues`.
- **Risk.** High; the largest PR. Readers see a mix of provisional and final revisions while batches run, which they already tolerate for a running crawl. Stop can land between batches. Needs real-PostgreSQL tests for replay, a cancel in the middle, and the cap.
- **Docs.**
  - `docs/invariants.md` section 6 must separate "appends the final revisions" (batched) from "atomically persists the summary, snapshot and status" (the final commit).
  - `docs/site-health.md`: the terminalization steps, the backstops and the task-kind table.
  - The header of `lifecycle.ts`.
  - The provenance contract, wherever snapshot source ids are described.
- **Measure.** K9 before and after on the largest crawl available; K7 during terminalization; the count of finalize retries.

## PR 4. Scheduling and reads

- **The lane group keeps claiming.** At the end of a claim window (`site-health-worker.ts`, `claim_window_seconds`), ask the `web-fetch` group's peers whether anything is due. If nothing is, open another window instead of yielding.
- **Backstops leave the claim path.**
  - Lease recovery and the stalled, overdue and cancelled backstops run as one single-flight background job on a timer, not before each claim. They still run on an empty drain.
  - The post-settle reconcile is a per-crawl single-flight job, so the task slot refills at once.
  - The scoped `/run` worker uses the refresh cadence. It filters claims by `crawl_id` (`ClaimFilter`) instead of a list of every task id, which breaks past 65,535 tasks.
- **Active-crawl reads come from the persisted row (CO-3).**
  - The cadence reconcile persists the live counters on the crawl row, and the active-crawl read renders that row. Today `reads/crawl-counters.ts` runs three whole-crawl aggregates on every poll.
  - "Stalled" stays a cheap probe of expired leases through `ix_site_crawl_tasks_open`.
  - The client throttles its refresh of the crawl view while a crawl is active (`frontend/lib/site-health/use-site-health-screen.ts`).
- **The live-card interval scales with crawl size.** For example, 30 s under 2,000 pages and 120 s above (`live_score_refresh_min_interval_seconds`).
- **Risk.** Low to medium. The background jobs share the 4-connection pool with the slots, so keep each one single-flight. Land PR 3 first, so the slowest maintenance job is already gone.
- **Docs.**
  - `docs/backend-architecture.md`: group turn-taking.
  - `docs/site-health.md`: the backstops, and active crawl counts.
- **Measure.**
  - K1: the dips at window ends should vanish.
  - K6.
  - K3 on the API's statements during a crawl with a dashboard open.

## PR 5. Fetch side and walk path (only if PR 1's numbers show headroom)

Start only when K5 and K3 show the database idle while slots wait on the network.

- **Keep-alive fetches.** Use one keep-alive agent per origin, pinned to the validated address. DNS pinning and the SSRF check must still run for every new connection. Today every request opens a new connection (`safe-fetch.ts` `agent: false`).
- **More slots than connections.** Allow 6–8 slots on the same 4 connections. Guard the database sections with a semaphore, so a pool-acquire timeout never spends a task attempt or starves heartbeats.
- **Walk-path counters.**
  - Add a `frontier_url_count` column on `site_crawls`, incremented by the rows inserted. It replaces the per-discover `count(*)` of the frontier (`frontier.ts`).
  - Keep a per-crawl in-process note that the tracked set is full, re-counted on a miss. It replaces the per-walked-page count (`tracked-set.ts`).
- **Risk.** Medium. This is the SSRF-sensitive fetch path. Measure first how many crawls still walk; after #941, only sites without a sitemap do.
- **Docs.**
  - `docs/site-health.md`: the acquisition guarantees stay true.
  - `docs/backend-architecture.md`: the "pool-bounded" wording.
- **Measure.** K8 `ttfb_ms`, K1, and K5 headroom.

## Rejected

Ideas from the external advice the owner shared on 2026-11-17, judged against the repository's guardrails:

- **One in-memory coordinator per crawl, with checkpoints.** The runner is a budgeted job, and the `/run` worker shares the crawl, so there is no single long-lived owner. It would also remove leases, idempotency and commit-before-fetch. It is in the backlog as a paid option.
- **Streaming sitemap URLs into fetching as they parse.** The tracked set must fill in one stable order over the whole sitemap (SH-B6). The sitemap walk is not the bottleneck.
- **Skipping a fetch because `<lastmod>` is unchanged.** `lastmod` is unreliable, and a page that now 404s would go unseen.
- **Conditional GET for sitemaps.** It saves only bandwidth, and SH-B5 re-reads them on every crawl.
- **An HTTP/2 client.** Keep-alive (PR 5) gets most of the gain without a second transport in the SSRF-pinned path.
- **`COPY` for evidence.** A page's evaluations already go in one multi-row insert.
- **One commit for several pages' evidence.** With async commit the flush saving is gone. The cost would be coupled failures and a longer hold of the crawl lock.
- **One JSON document per analysis instead of evaluation rows.** Evaluations are referenced by id across issues, snapshots and change observations.
- **`UNLOGGED` tables, `fsync=off`, `full_page_writes=off`.** They lose or corrupt durable state on a crash.
- **More connections or a bigger pool now.** More concurrency on a CPU-bound quarter core adds contention, not throughput.
- **Writing evidence before the crawl lock** (the rest of audit item L2). It risks a deadlock with finalize; PR 2 and PR 3 shrink the lock window instead.
