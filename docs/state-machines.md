# State machines

Cross-feature catalogue of every persisted lifecycle: its states, the invariants
that hold over them and where each is enforced, and the transitions with their
trigger, location and guard. Verified against `main` at `f090d718b`
(2026-11-07). Code, tests and the feature owners in the
[documentation index](README.md) remain the authority; this file records where
each rule is enforced so a change can find every writer. Known invalid states
link to rows of the [state-machine fixes plan](plans/state-machine-fixes.md).

Paths are relative to `frontend/services/api/src/` unless they start with
`frontend/`; `0001:<line>` is `migrations/0001_baseline.sql`. **Enforced**:
`DB` = CHECK, unique, partial unique index or FK; `App` = code under the named
lock; `None` = nothing holds it. Except where a row says `DB`, no status column
has a CHECK constraint (0001–0013); [DB1](plans/state-machine-fixes.md#db-schema-hardening)
adds them.

## 1. Shared queue lanes

States (`config/queue.json`): claimable `queued`, `retry_wait`, `capacity_wait`,
`awaiting_provider_result`, `submission_uncertain`; held `leased`, `running`;
terminal `succeeded`, `failed`, `cancelled`. Implicit state lives in
`lease_owner`, `lease_expires_at`, `heartbeat_at`, `attempt_count`/`max_attempts`,
`available_at` and `completed_at`.

| Lane (`queue/task-queue.ts:87-145`) | Table | Claim → | Claim charge | Recovery (charge) | Heartbeat fences attempt | Terminal-write fence |
|---|---|---|---|---|---|---|
| Analytics | `analytics_tasks` | `leased` | 0 | `reclaimExpiredLeases` `queue/recovery.ts:47-91` (1) | yes `workers/analytics-worker.ts:209` | `fenceLease` owner + attempt + unexpired, `task-queue.ts:312-336` |
| Site Health | `site_crawl_tasks` | `leased` | 0 | same (1), crawl reconcile `workers/site-health-worker.ts:183-187` | yes `site-health/site-task.ts` `runSiteTask` | `lockSiteTask` → `fenceLease` (the deferred settle in `analyze-task.ts` `prepare` too); the conflict fallback in `settleThrown` takes `fenceLease` on the task row alone |
| Discovery | `brand_discovery_tasks` | `running` | 0, ready iff `attempt_count < max_attempts` | `recoverDiscoveryLeases` `recovery.ts:106-151`, fails the parent (1) | yes `workers/discovery-worker.ts` `runOnce` | fenced `finish` `discovery-worker.ts:209-302` |
| Agent | `agent_runs` | `leased`; `start` → `running`, attempt + 1 `agent/queue.ts:64-82` | 0 | `AgentQueue.recover` `agent/queue.ts:93-146` → `failed interrupted` + refund (0) | yes `agent/queue.ts:83-85` | `lockRun` = `fenceLease` + `cancelled_at IS NULL` `agent/queue.ts:10-20` |
| Integrations | `integration_sync_runs` | `running` (claimable `queued`, `retry_wait` only) | 1 | `recoverIntegrationLeases` `recovery.ts:153` (0) | yes `workers/integration-worker.ts:122` | `#held` `integration-worker.ts:176-178` |
| Audits | `audit_tasks` | `leased` | 0 | `AuditMaintenance.#reclaim` `audits/maintenance.ts` (1 unless a paid submission exists or the parent is terminal) | per-claim owner `<worker>:<nonce>` `queue/audit-queue.ts` `AuditQueue.claim` (claims and uncertain reclaims charge no attempt) | `ownedAuditTask` per-claim owner + status + unexpired `audit-queue.ts` |

| Invariant | Enforced |
|---|---|
| One row per logical task | DB: unique `idempotency_key` per lane; slots `uq_audit_task_slot`, `uq_site_crawl_task_slot`, `uq_brand_discovery_task_discovery`; enqueue `ON CONFLICT DO NOTHING` `queue/enqueue.ts:46-75` |
| Status within the vocabulary | None (DB1) |
| Lease columns set iff held | App; a cancelled Keyword Research task keeps `lease_owner` (`search-intelligence/runs.ts:161-168`), harmless because fences refuse terminal rows |
| `attempt_count <= max_attempts` | App (claim `ready`, recovery `exhausted` CASE) |
| Exclusive claim | App: ranked `FOR UPDATE SKIP LOCKED` with eligibility re-applied `task-queue.ts:187-247` |
| Only the current holder writes | App: lane fence above; the audit lane tells two claims by one worker apart by the per-claim lease owner |

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `queued` | `enqueueTask` | `queue/enqueue.ts:46-75` | `ON CONFLICT (idempotency_key) DO NOTHING` |
| ∅ → `queued` (coalesced successor) | `enqueueCoalesced` | `queue/enqueue.ts:106` | advisory lock; earliest deadline wins |
| claimable → claim status | `TaskQueue.claim` | `task-queue.ts:395-437` | status claimable, `available_at <= now`, lane `ready`, SKIP LOCKED; turn cursor in the same tx |
| `leased` → `running` | `markRunning` | `task-queue.ts:441-453` | owner, `leased`, unexpired, attempt when passed |
| held → held (renew) | `heartbeat` | `task-queue.ts:456-486` | owner, held, unexpired, attempt when passed; a miss aborts via `maintainLease` `queue/heartbeat.ts` |
| held, expired → `retry_wait` / `failed` | `reclaimExpiredLeases` | `recovery.ts:47-91` | expired, SKIP LOCKED; `failed` when `attempt + charge >= max` |
| `failed` → `failed` + `payload.terminal_compensated_at` | `compensateTerminalTasks` | `workers/terminal-compensation.ts:26-67` | `status = failed`, not compensated; abandoned after `terminal_compensation_max_failures` |

Each audit claim leases its rows to `<worker owner>:<8-hex nonce>`, so a stale
slot whose lease expired fails `ownedAuditTask`, its heartbeat and its
persistence once the same worker re-claims the task. Discovery and Site Health
heartbeats and the Site Health settles (deferral and conflict fallback included)
are fenced at the claimed attempt, which their recovery charges, so a stale slot
never renews or settles a re-claim.

## 2. Audits

### 2.1 `audits.status`

Edges `config/audits.json:2-13`, enforced only by `transitionAudit`
(`audits/state.ts:7-44`, 409 on any other edge) under the caller's audit
`FOR UPDATE`. Terminal `cancelled`, `completed`, `failed`, `partially_completed`;
active `analyzing`, `draft`, `queued`, `running`, `validating`
(`audits.json:267-268`). `draft`, `validating`, `analyzing` and `reporting` are
never committed: each is entered and left inside one transaction.

| Invariant | Enforced |
|---|---|
| Only configured edges | App `transitionAudit` |
| One scheduled audit per occurrence and market | DB `uq_audit_schedule_slot` 0001:4579 |
| One repair child per parent and task set | DB `uq_audit_parent_repair_key` |
| Terminal ⇒ no open task | App: cancel terminalizes tasks in its tx; finalize returns while any task is open `audits/finalization.ts:65` |
| ≤ `active_audits_per_workspace` active launches | App `reserveAuditCapacity` `audits/admission.ts:35-50` under `audit-enqueue:{ws}`; repair audits skip it (AU3) |

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `draft` → `validating` → `queued` | `createMarketAudit` | `audits/creation.ts:74-215` | `audit-enqueue` lock; capacity, abuse budget, `admitAudit`, `reservePromptRuns`; a scheduled occurrence returns its prior row |
| ∅ → … → `queued` (repair) | `createRepairAudit` | `audits/repair.ts:16-230` | parent `FOR UPDATE` and terminal; BYOK failed tasks only; `reservePromptRuns` only |
| `queued` → `running` | first task `markRunning` | `queue/audit-queue.ts:156-195` | `ownedAuditTask`; audit `queued`/`running` |
| `running` → `failed` | `finalizeAudit` | `audits/finalization.ts:77-92` | no open task, no completed task |
| `running` → `analyzing` → `reporting` → `completed`/`partially_completed` | `finalizeAudit` | `finalization.ts:94-133` | audit `FOR UPDATE`, not terminal, no open task; partial iff `metric.total_failed > 0` |
| `queued`/`running` → `cancelled` | `cancelAudit` | `audits/maintenance.ts:81-136` | audit `FOR UPDATE`, active; tasks terminalized and runs released in the same tx |

Known invalid: none persisted. A finalize that throws deterministically leaves
the audit `running` with every task terminal (no input found that throws; not
planned).

### 2.2 `audit_tasks` (lane-specific edges)

`pending_reservation` → `queued` inside the creation tx (`creation.ts:268-395`).

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| held → `capacity_wait` | `#parkCapacity` | `audits/worker.ts` | `ownedAuditTask`; no attempt charged |
| `running` → `succeeded` | `persistExecutionSuccess` | `audits/result-persistence.ts:85-163` | `ownedAuditTask`; artifact, attempt, derivation, cost projection, prompt-run spend and status in one tx |
| `running` → `retry_wait` / `failed` | `persistFailure` | `result-persistence.ts:292-311` | `ownedAuditTask`; retry iff retryable and `attempt < max` |
| `running` → `awaiting_provider_result` / `submission_uncertain` | `persistSurfaceExchange` | `audits/surface-persistence.ts:126-169` | `ownedAuditTask`; paid submission charges the attempt |
| held, expired → `awaiting_provider_result` / `submission_uncertain` / `retry_wait` / `failed` / `cancelled` | `#reclaim` | `maintenance.ts` | audit then task `FOR UPDATE SKIP LOCKED`; with the parent active, `provider_task_id` set → `awaiting_provider_result` and `provider_submission_ref` alone → `submission_uncertain`, neither charging an attempt (the recovery deadline bounds the poll) |
| held → `succeeded`/`failed` | `repairOwnedCompletion` | `maintenance.ts:23-78` | `ownedAuditTask` + artifact/observation; unreachable today because success and failure write evidence and status in one tx |
| non-terminal → `cancelled` | `cancelAudit` | `maintenance.ts:103-118` | status not terminal |

Known invalid: a Google AI Overview task that
fails after a paid submission records no cost projection —
[AU5](plans/state-machine-fixes.md#au-audits). Results dropped because the task
lost ownership mid-call record no cost (internal cost only; not planned).

### 2.3 `audit_schedules` (implicit: `enabled`, `next_run_at`, lease, `failure_count`)

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| due → leased | `claimDueSchedules` | `queue/audit-queue.ts:35-79` | `enabled`, `next_run_at <= at`, lease null or expired, SKIP LOCKED, committed |
| leased → released | `planClaim` stale | `workers/audit-scheduler.ts:64-74` | lease owner, unexpired; disabled or occurrence moved |
| leased → advanced | `planClaim` success | `audit-scheduler.ts:75-109` | savepoint; `next_run_at = nextRunAfter`, `enabled = next ≠ null`, `failure_count = 0` |
| leased → backoff / disabled | `planClaim` error | `audit-scheduler.ts:110-129` | any error: `failure_count + 1`, `enabled = failures < max (5)`, retry in 300 s |
| disabled → enabled | Resume / `updateSchedule` | `audits/schedules.ts:98-136` | schedule row lock |

Known invalid: a retryable 429 (active-launch limit, daily budget) counts as a
failure, so five transient refusals disable the schedule —
[AU2](plans/state-machine-fixes.md#au-audits).

### 2.4 Prompt-run holds and the funded budget

Hold per task (`consumable_ledger`, subject `audit` task): reserve at creation
(`creation.ts`) or repair (`repair.ts`); spend 1 on success
(`result-persistence.ts:153`); release on terminal failure, cancel
(`maintenance.ts:119`), reclaim to terminal (`maintenance.ts:219`) and the owing
sweep (`maintenance.ts:265-319`). `settlePromptRun` (`audits/prompt-runs.ts:57-74`)
settles only open units. The funded monthly budget is not a hold: `admitAudit`
sums `execution_cost_projections` under the account capacity lock
(`audits/admission.ts:124-158`), a soft ceiling (B20).

Known invalid (latent): the budget sums every projection row, so a second
pricing version appended by repricing counts an execution twice; only one
pricing catalog exists today — [AU4](plans/state-machine-fixes.md#au-audits).

## 3. Billing and credits

### 3.1 Consumable holds (`consumable_ledger`, append-only)

reservation → debit + release, or release, or refund. Subjects: `audit` task,
`agent` run, `site_crawl`, `platform_call`.

| Invariant | Enforced |
|---|---|
| Idempotent entries | DB unique idempotency key per account (0001:4115); debit uniques 0001:5193-5195 |
| Settle once, never above the hold | App `entitlements/ledger.ts` settle/release under row locks + capacity lock (B63) |
| A deleted project leaves no open hold | App `projectHoldsReservations` `entitlements/ledger.ts`: `audit`, `agent`, `site_crawl` and the project's Keyword Research `platform_call` holds refuse deletion (409 `project_work_running`); deletion and trial purge check under the project row lock (`lockProjectRow`, `projects/service.ts`), so they serialize with hold writers that lock the row (Keyword Research confirmation, Site Health, Agent outputs) |

### 3.2 `platform_calls.status` ∈ {`reserved`, `settled`, `failed`}

DB: `ck_platform_calls_status`, `ck_platform_calls_settled` (reserved ⇔
`settled_at IS NULL`), `ck_platform_calls_credits`, `ck_platform_calls_hold`
(0001:2071-2075).

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `reserved` (credits) | `openHold` via `reserve`, committed before I/O | `billing/metering.ts:142-200` | hold refused → 403 `ai_credits_exhausted` |
| ∅ → `settled`/`failed` (included, not charged) | `record` after the call | `metering.ts:119-140` | daily breaker before I/O |
| `reserved` → `settled`/`failed` | `settleCall` (a failed settle transaction is retried once) | `metering.ts` `settleHeld` | `lockHeld` (`status = reserved FOR UPDATE`) |
| `reserved` (`owner_settled`) → `settled` | `settleProviderCredits` ← `settleResearchCharge` | `metering.ts:234-258`, `search-intelligence/charges.ts:20-73` | `lockHeld`; run ended, no call still reporting |
| `reserved` (> 900 s, not owner-settled) → `settled` | `settleAbandonedCalls` | `metering.ts:417-431` | charges the unknown-usage fallback |

Residual: a failed call whose settle transaction errors twice is still charged
the fallback by the sweep.

### 3.3 `pending_activations.status` ∈ {`pending`, `activated`, `failed`, `abandoned`}

DB: one pending base / upgrade / add-on per key (0001:5201-5205), provider
reference unique (0001:5207), `(account, idempotency_key)` unique (0001:4223).
App: `activated ⇒ activated_at`; `failed`/`abandoned ⇒ failure_code`.

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `pending` | purchase / plan change | `billing/purchases.ts:133-169`, `billing/plan-changes.ts:286` | account lock, `purchasable()`, uniques |
| `pending` (ref null) → `pending` (ref) | provider create returns / recovery | `purchases.ts:176-181`, `billing/recovery.ts:217-221` | `external_reference IS NULL`; lease + notes match |
| `pending` → `failed` | definite create error; base terminal and unpaid | `purchases.ts:186-197`; `billing/settlement.ts:290-301` | row `FOR UPDATE`, `pending` |
| `pending` → `activated` | evidence with payment | `settlement.ts:302-323` | `pending`, or `abandoned` order with payment (late capture) |
| `pending` → `abandoned` | unpaid past `abandonSeconds` (base cancelled at provider first) | `recovery.ts:184-235` | lease, `pending` |
| `abandoned` (not base) → `pending` | signed checkout callback | `routes/billing.ts` (verify route) | `pending`, or `abandoned` and kind ≠ base; with a newer pending order of the same key the one-pending unique refuses it, the row stays `abandoned` and the callback answers its view (the webhook's late-capture path settles a payment) |

A base checkout paid as the abandon sweep cancels it settles from the terminal,
paid evidence: `activated`, its period granted until the paid end (B71).

### 3.4 `billing_subscriptions` (status × `is_current` × `ended_at` × `cancel_at_period_end` × `cancellation_sent_at` × `scheduled_change`)

DB: one current base per account `uq_billing_subscription_one_current`
(0001:5187); external id unique. App: `ended_at ⇒ ¬is_current`;
`cancellation_sent_at ⇒ cancel_at_period_end`; status vocabulary.

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `pending` (current) | first paid base evidence | `settlement.ts` `settleBase` | no current row; granted or terminal status (B71) and payment |
| * → evidence status | webhook or sweep | `settlement.ts:513-556` | `event.version >= provider_state_version`; not ended |
| terminal evidence → `cancel_scheduled` until paid end / ended | `periodOutcome` → `endTerminal` | `settlement.ts` `endTerminal`, `periodOutcome` | an unrefunded paid period covers now and no full refund cancelled the row |
| `cancelled` (still current) stays `cancelled` on later non-terminal evidence; a renewal charged meanwhile records its receipt, grants nothing and logs `billing.renewal_paid_after_cancellation` (B71) | `settlePeriod`, `periodOutcome` | `settlement.ts` `refundCancelled` | `is_current`, status `cancelled` |
| current period refunded in full → `cancelled` (still current), `scheduled_change` → null | `endRefundedPayment` (B52; an upgrade bought in the period, B70) | `settlement.ts` `paidPeriod`, `endRefundedPayment` | `is_current`, period equals the payment's (an upgrade's: paid inside the current period) |
| `cancel_at_period_end` false → true | customer cancel; evidence; B52 | `billing/cancellation.ts:69-78`; `settlement.ts:541-542, 722` | sub `FOR UPDATE`, period end in future |
| true → false | resume | `cancellation.ts:94-98` | not yet sent, before the lead time |
| `cancellation_sent_at` null → now | sweep; evidence; refund | `recovery.ts:541-548`; `settlement.ts:487, 723` | `cancel_at_period_end` |
| `scheduled_change` null → `requested` | upgrade settles; downgrade scheduled | `settlement.ts:618-638`; `plan-changes.ts:54-84` | no change in flight, not cancelling |
| `requested` → `scheduled` / `provider_rejected` | `pushChange` | `plan-changes.ts:326-365` | state `requested`, same source |
| `scheduled_change` → null | renewal at the new price, or a refused change lapses | `settlement.ts:449-458, 545-546` | price ref match |

### 3.5 `billing_webhook_events.processing_state` ∈ {`pending`, `completed`, `quarantined`} + lease + `attempt_count`

DB: `(provider, mode, event_id)` unique (0001:4052).

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `pending` | receipt | `billing/webhooks.ts:110-132` | `ON CONFLICT DO NOTHING` |
| `pending` → `quarantined` | same id, different digest (answers 400; a `completed` row keeps its state) | `webhooks.ts:133-150` | `processing_state = pending` |
| `pending` → leased, attempt + 1 | claim | `recovery.ts:270-302` | `attempt_count < webhook_max_attempts`, lease expired, SKIP LOCKED |
| leased → `completed` | applied | `recovery.ts:340-378` | lease token unexpired |
| leased → `pending` / `quarantined` | error; unmatched (exhausted) | `recovery.ts:379-411` | lease token |
| `pending` at `webhook_max_attempts` → `quarantined` (`attempts_exhausted`) | final attempt died with its process | `quarantineExhaustedWebhooks`, each recovery pass | lease expired |

### 3.6 Other billing records

| Machine | States and transitions | Enforced |
|---|---|---|
| `billing_catalog_revisions.publication_state` | `draft` (mutable) → `published`, previous → `retired` (final) `billing/admin.ts:107-173` | DB one published 0001:5181; App subject lock |
| `billing_payments` | insert-only; refund child rows | DB 0001:5183-5185 |
| `idempotency_records` (plan changes) | ∅ → `completed` only `plan-changes.ts` `scheduleDowngrade`; deleted on `provider_rejected` after the push, or by a same-key replay that finds the current subscription's change from that key `provider_rejected` (`refusedFromKey`); `expires_at` never read | App |
| Access (derived) | `trial_active` / `trial_expired` / `active` / `subscription_lapsed` / `access_unresolved` from grant validity `entitlements/access.ts:38-91`; trial once per mailbox under advisory lock `entitlements/bootstrap.ts:62-113`; purge `projects/trial-purge.ts` skips a workspace with a `pending` checkout (`stillPurgeable`, under the capacity lock) | App |

## 4. Agent

### 4.1 `agent_runs.status` ∈ {`queued`, `leased`, `running`, `succeeded`, `failed`, `cancelled`}

| Invariant | Enforced |
|---|---|
| Idempotent send | DB `uq_agent_run_ws_idempotency (workspace_id, idempotency_key)` |
| One active run per chat | App: workspace advisory lock + chat row lock + `requireIdle` `agent/store.ts:40-49, 132-224` (no partial unique) |
| Terminal ⇒ `completed_at`, no lease; `cancelled ⇒ cancelled_at` | App |
| A turn executes at most once | App: `max_attempts = 1`, `start` charges the attempt |

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `queued` | new chat / message | `agent/store.ts:178-224` | locks above; turn and active-run limits `agent/funding.ts:92-101` |
| `queued` → `leased` | browser `POST …/runs/{id}/run` → claim | `routes/agent.ts:155-190`, `agent/queue.ts:53-63` | claimable, `attempt < max`, this run, SKIP LOCKED; interactive slot or 429 |
| `leased` → `running` | `start` | `agent/queue.ts:64-82` | owner, `leased`, unexpired, attempt + 1 |
| `running` → `succeeded` | `finish` → `terminalize` | `agent/runtime.ts`, `agent/queue.ts:21-42` | `lockRun` |
| `running` → `succeeded` | browser closed (caller stop `interrupted`) after a document was staged → `saveDocuments` saves it with a fixed reply | `agent/runtime.ts` `stopped`, `agent/worker.ts` | `lockRun`; transcript ends on a user message with no search waiting; charged (B69) |
| `running` → `failed` (code) | `runtime.fail`; caller stop → `interrupted`/`turn_timeout`; heartbeat gave up → `interrupted` | `agent/runtime.ts` `fail`, `agent/worker.ts` | `lockRun`; settle + refund (B58) in the same tx; reply only while the member may still write |
| `queued`/`leased`/`running` → `cancelled` | Stop | `agent/store.ts` `cancel` | run `FOR UPDATE`, not terminal, lease not lapsed; charged (B58) |
| `leased`/`running`, lease lapsed → `failed interrupted` | Stop | `agent/store.ts` `cancel` → `endInterrupted` `agent/queue.ts` | run `FOR UPDATE`, `lease_expires_at <= now`; settle + refund (B69) |
| `queued` > `unclaimed_grace_seconds` → `failed interrupted` | runner `recover` | `agent/queue.ts:93-146` | SKIP LOCKED; settle + refund |
| held, lease expired → `failed interrupted` | runner `recover` → `endInterrupted` | same | lease `<= now` |

The lease is `lease_seconds` = 60 s (`agent/bindings.ts`,
`config/model-gateway.json`), three 20 s heartbeats. The lane's `nextDue`
includes held runs' `lease_expires_at` (`workers/agent-worker.ts`), and a
heartbeat that gives up makes `runAgentOnce` call `fail(lease, 'interrupted')`
(`agent/worker.ts`), fenced by `lockRun`.

### 4.2 Model attempts, tool attempts, outputs

| Machine | States and transitions | Enforced |
|---|---|---|
| `agent_model_attempts.outcome` | `dispatched` → `completed`/`failed` by receipt `agent/model-calls.ts:167-261` (row `FOR UPDATE`, only from `dispatched`); `dispatched` → `recovered_unknown` by reconcile `:303-343` from `fail`, `recover`, `recoverCancelled` | DB slot uniques `uq_agent_model_attempt_slot`, `uq_agent_model_attempt_dispatch`; CHECKs on bytes, output cap (0005), cost (0012); outcome App |
| `settlement_status` | `pending`/`not_applicable` at dispatch → `settled`/`zero_debit`; failed or unknown with no usage settles 0 `agent/funding.ts:242-246` | App; `settled_at` null iff `dispatched` |
| Hold per call | reserve `funding.ts:205` → settle (idempotent per dispatch key) → `refundSubject` (failed runs, B58) | App ledger |
| `agent_tool_attempts.status` | insert-only, written once after the read `agent/runtime.ts:571-605` under `lockRun` | DB `uq_agent_tool_attempt_slot` |
| `agent_outputs` / revisions | ≥ 1 revision; output + revision in one tx `agent/outputs.ts:54, 110-154`; edits under chat lock + `requireIdle` | DB `uq_agent_output_chat_number`, `uq_agent_output_revision_number`, number > 0 (0004) |
| Transcript | saved at finish without the last response's unanswered `server_tool_use` (`savedTranscript`, `agent/runtime.ts`); replayed to the model `agent/transcript.ts:110` | App |

### 4.3 Browser turn stream (`frontend/lib/agent/live-turns.ts`)

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| absent → `connected: true` | `startLiveTurn` once per accepted run | `live-turns.ts` `startLiveTurn`, `frontend/lib/api/agent.ts:77` | `turns.has(runId)` |
| `connected` (429) → re-post | `/run` answers 429 | `live-turns.ts` `runStream` | waits `Retry-After`; at most `AGENT_RUN_RETRY.maxAttempts` posts |
| `connected` → `connected: false` | stream ends, fetch fails, a non-2xx other than a retried 429, or no frame for `AGENT_STREAM_IDLE_MS` | `live-turns.ts` `startLiveTurn` (`finally`), `read` | idle timer re-armed by every frame, keep-alives included |
| polling on | run active and not connected | `frontend/components/agent/use-chat-turns.ts:28-38` | re-read on stream close |

`isRunActive` = `queued`/`leased`/`running`/`retry_wait`
(`frontend/lib/agent/run-state.ts:176`); send is disabled while pending or
active (`frontend/components/agent/chat-thread.tsx`), and the server answers
409 `agent_run_active`.

## 5. Site Health and crawl logs

### 5.1 `site_crawls` (`status` × `discovery_status` × `analysis_status` × `inventory_complete`)

Vocabulary `frontend/packages/contracts/src/site-health/crawl.ts`: status
`queued` → `running` → `completed`/`partially_completed`/`failed`/`cancelled`;
usable = `completed`, `partially_completed`, `cancelled`. Discovery `running`
(page rerun starts `completed`) → `completed`/`failed`/`sample_completed`/
`cancelled`; `pending` and `stopped` are never written. Analysis `pending` →
`running` → `completed`/`partially_completed`/`failed`/`cancelled`; `stopped`
never written.

| Invariant | Enforced |
|---|---|
| One active crawl per project | App: project `FOR UPDATE` + no active crawl `site-health/planner.ts:292-307`; reruns lock via `selection.ts:63-80` (no partial unique) |
| One snapshot per crawl | DB `uq_site_health_snapshot_crawl` 0001:4325 |
| Terminal ⇒ no open lifecycle task | App: terminalize only when discover/setup/analyze drained `lifecycle.ts:257-273` |
| `inventory_complete` ⇒ whole site inventoried | App `lifecycle.ts:136-143`; set for bounded inventories too (SH3) |

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `queued` (rerun: discovery `completed`, `inventory_complete`) | create / page rerun | `planner.ts:195-228, 395-433` | project lock, no active crawl |
| `queued` → `running` | first task runs | `site-task.ts:134-148` | `status = queued` |
| analysis `pending` → `running` | reconcile | `lifecycle.ts:153-159` | crawl `FOR UPDATE`, active |
| discovery `running` → `completed`/`failed`; `inventory_complete` | reconcile | `lifecycle.ts:131-143` | no open discover/setup; failed iff `discovered_url_count = 0` |
| discovery `running` → `sample_completed` | discover commit | `discover-task.ts:393-396` | sample cap; fenced task + crawl lock |
| `running` → `completed`/`partially_completed`/`failed` | `terminalize` | `lifecycle.ts:214-245` | drained; failed iff no discovery and nothing analyzed |
| `running` → `failed` (`crawl_overdue`) | overdue watchdog | `lifecycle.ts:476-500` | crawl lock, active, age re-checked |
| `queued`/`running` → `cancelled` | Stop | `site-health/controls.ts:59-108` | crawl `FOR UPDATE`, not terminal; tasks cancelled in the tx |

Known invalid: a page rerun (or a full crawl) whose every analysis fails ends
`partially_completed` with 0 pages analyzed, and every page rerun becomes the
default crawl because `resolveUsableCrawl` (`reads/crawl.ts:78-99`) ignores
`page_rerun` — [SH1](plans/state-machine-fixes.md#sh-site-health). Sub-states
and counters count every task generation, so a rerun page reads "1 failed" in
the status but 0 in the counters — [SH2](plans/state-machine-fixes.md#sh-site-health).
`inventory_complete` is true for page-limited, sampled or deselected
inventories, so unanalyzed pages read as removed —
[SH3](plans/state-machine-fixes.md#sh-site-health).

### 5.2 Other Site Health records

| Machine | States and transitions | Enforced |
|---|---|---|
| `site_crawl_tasks` | lane §1; → `cancelled` by Stop `controls.ts:89-102`, deselection (`queued`/`retry_wait`) `selection.ts:213-228`, crawl not active `site-task.ts:97-114`; → `failed` by overdue `lifecycle.ts:482-498`; rerun adds generation `max + 1` `selection.ts:380-394` | DB `uq_site_crawl_task_slot (crawl, kind, url_hash, generation)`, idempotency key |
| `site_discovery_frontier.status` | `pending` (`frontier.ts:280-301`) → `admitted` (`admission-writes.ts:350-362`); picked `FOR UPDATE SKIP LOCKED` inside the admitting tx | DB `uq_site_discovery_frontier_url` |
| `site_urls.discovery_status` | `running` on every sighting `admission-writes.ts:107,128` → `completed`/`failed`; never read | None; dropped by [DB1](plans/state-machine-fixes.md#db-schema-hardening) |
| `site_page_analyses` | always `completed`; revisions by `is_current` + `supersedes_analysis_id`: provisional `analysis-rows.ts:335-384`, finalized `terminal-analysis.ts:55-111`, retired alias `canonical-alias.ts:97-106`; the last commit becomes current unconditionally | DB `uq_site_page_analysis_current` 0001:5217 |
| `site_health_snapshots` | once per crawl in the terminalize tx `snapshot.ts:127-172` (`ON CONFLICT DO NOTHING`); later only `addArchitectureIssues` | DB unique per crawl |
| `site_internal_link_runs.state` | ∅ → `queued` `internal-link-runs.ts:107-200` (project lock, none live) → result `internal-link-publish.ts` (fenced) or `cancelled` `internal-link-runs.ts:202-211` | App |
| `site_change_snapshots.state` | immutable insert `available`/`non_comparable`/`unavailable` `change-snapshot.ts:345-425`; `supersedes_id` = newest by `created_at`, read unlocked | App |

Known invalid: an overlapping older analyze generation can commit last and
become current — [SH2](plans/state-machine-fixes.md#sh-site-health). A
`change_intel` that runs late or concurrently can supersede the wrong snapshot
(timing) — [SH4](plans/state-machine-fixes.md#sh-site-health). An internal-link
run whose publish task fails terminally stays live until cancelled (no
compensator, `site-health/analytics-kinds.ts:6-9`) —
[SH5](plans/state-machine-fixes.md#sh-site-health).

### 5.3 Crawl logs (`src/crawl-logs/`)

| Machine | States and transitions | Enforced |
|---|---|---|
| `crawl_log_uploads.status` | `open` `uploads.ts:36-72` → `completed` `:73-146` (crawl-state lock + upload `FOR UPDATE`) → `unsupported_format` `ingest.ts`; `open` stale → `abandoned` `maintenance.ts:111-136` | App |
| `crawl_log_batches` | immutable receipts; upload batches need `seq = last_ack_seq + 1` | DB `uq_crawl_log_batch_key`, `ck_crawl_log_batches_drained` 0001:1358 |
| `crawl_log_sources.status` | `active` → `revoked` (idempotent) `sources.ts:227-274`; stall flags | DB `uq_crawl_log_live_host` 0001:5197, `ck_crawl_log_sources_*` 0001:1409-1412 |
| `bot_ip_range_snapshots` | append-only `succeeded`/`failed`; readers take the latest `succeeded` | App |
| `bot_requests` | Pub/Sub redelivery dedupes | DB `uq_bot_request_line`, `uq_bot_request_provider` 0001:5189-5191 |

## 6. External data

### 6.1 Keyword Research (`search_intelligence_runs`, calls, datasets)

Run: `reviewed` → `queued` → `running` ⇄ `queued` (parked) → `succeeded` /
`partial` / `failed` / `uncertain` / `cancelled`.

| Invariant | Enforced |
|---|---|
| One active run per project | DB `uq_si_runs_project_active` (queued, running) 0001:5215; App project lock `search-intelligence/runs.ts:60-81` |
| Ended run ⇒ no `collecting` dataset | App (`closeCollecting` `acquisition-state.ts`, also in `cancelRun`) |
| Hold settles only when the run ended and no call can still report (a `dispatched` call, or one recovery marked `uncertain` `provider_result_missing`, within twice the provider timeout) | App `charges.ts` |
| A dispatched call is never re-sent | App: `dispatched` without response → `uncertain` |

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| `reviewed` → `queued` (hold + task) / `succeeded` (empty plan) | `confirmRun` | `runs.ts:122-147` | project `FOR UPDATE`, unconfirmed, unexpired, price, connection, no other active run |
| `reviewed`/`queued`/`running` → `cancelled` | `cancelRun` | `runs.ts:149-180` | run `FOR UPDATE`, not finished; task cancelled; collecting datasets `failed`; hold settled when nothing in flight |
| `queued`/`running` → `running` | `start` | `acquisition-state.ts:201-232` | run `FOR UPDATE`, not terminal, `owned()` |
| → `failed` (`pricing_changed`/`connection_changed`) | `start`, `prepare`, `dispatch` | `acquisition-state.ts` (`failChangedConnection`) | connection or member check fails |
| `running` → `uncertain` | `prepare` finds a dispatched call with no response | `acquisition-state.ts:299-329` | — |
| `running` → `queued` (park) | `park` | `acquisition-state.ts:469-491` | `running`, `owned()` |
| `running` → `failed`/`partial`/`uncertain` | `fail` / `stopRun` / ceiling | `acquisition-state.ts:615-668, 292-297` | `running`, `owned()` |
| `running` → `succeeded`/`partial` | `finish` | `acquisition-state.ts:670-692` | `running`, `owned()` |
| `queued`/`running` → terminal | `reconcileResearch` | `search-intelligence/maintenance.ts:8-98` | task `failed`/`cancelled` |
| call `intent` → `dispatched` | `dispatch` | `acquisition-state.ts:377-419` | run `running`, `owned()`, connection; call `intent` |
| call `dispatched` → `succeeded`/`failed`/`uncertain`/`intent` (rate-limit retry) | publish / fail / prepare | `acquisition-state.ts:493-668` | `uncertain` still accepts a late receipt `:421-467` |
| dataset `collecting` → `published`/`failed` | publish / fail / `closeCollecting` (terminal run or `cancelRun`) | `acquisition-state.ts`, `runs.ts` | — |

Dispatch attempts are insert-only, one `outcome` per ordinal (DB
`uq_si_dispatch_phase` 0001:4282).

### 6.2 Integrations

| Machine | States and transitions | Enforced |
|---|---|---|
| `integration_oauth_grants.status` | ∅ → `connected` `integrations/oauth.ts:228-248`; **any** → `connected` on reconnect `oauth.ts` (keeps the old refresh token when the provider returns none), except `pending_revocation` with a live revocation claim, which refuses `oauth_revocation_in_progress`; `connected`/`needs_reauth` → `pending_revocation` `grants.ts:19-86`; → `revoked` `grants.ts:137-172` (claim + revision + `pending_revocation`); `connected` → `needs_reauth` `grants.ts:203-221` | App; token rotation fenced by claim id, `token_revision`, `connected` `tokens.ts:53-140`; OAuth state single use `oauth.ts:171-182` |
| `integration_sync_runs` | lane §1; deadline release → `queued`; every write behind `#held`; target re-checked per page and at finish `integration-worker.ts:516-575` | DB `ix_integration_sync_runs_active_window` (partial unique) 0001:4785 |
| `integration_property_mappings` | one active owner per property | DB 0001:4777 |

### 6.3 Discovery, Commerce, providers, source pages

| Machine | States and transitions | Enforced |
|---|---|---|
| `brand_discoveries` (status + stage) | `pending` → `running`/phase → `ready`/review → `project_created`; or `failed`; rerun creates a new row `projects/discovery.ts:212` | App: worker writes fenced `discovery-worker.ts:175-302`; recovery skips `ready`/`project_created` `queue/recovery.ts:125-129`; DB one task per discovery |
| Commerce candidates | `pending` → `approved` ↔ `rejected`, no from-state guard `commerce/decisions.ts:6-31` (by design) | App |
| `commerce_products.lifecycle_state` | only `active` written | — |
| `provider_connections.last_test_status` | `''` → `ok`/`failed` only while `credential_revision` and `base_url` are unchanged; key rotation resets | App `probes.ts` |
| `source_pages.inspection_state` | `not_inspected`/`stale`/`failed`/`blocked` → `queued` (claim lease) → outcome; `inspected` → `stale` | App fence `claim_expires_at = lease`, unexpired `source-pages/persistence.ts:42-77` |

## 7. Workspace, auth, public API, Actions and prompts

### 7.1 Identity and access

| Machine | States and transitions | Enforced |
|---|---|---|
| `workspace_invitations` (implicit `accepted_at`, `revoked_at`, `expires_at`) | none/expired → pending (issue `workspaces/invitations.ts:78-148`); pending → pending new token / revoked (`:151-191`); pending → revoked in bulk when the issuer leaves (`workspaces/service.ts:218-228`); pending → accepted + member (`acceptInvitation`, workspace then invitation `FOR UPDATE`, issuer's `users` row `FOR SHARE`, issuer must be active and hold `manage_members`) | DB one live row per email `uq_workspace_invitation_pending_email` 0001:5221; token unique; role never owner `ck_workspace_invitation_role` 0001:3322 |
| `workspace_members.role` | create → owner `service.ts:109-126`; non-owner X → Y, removal, leave `:231-283`; owner ↔ admin transfer `:285-326` | DB `ck_workspace_member_role` 0001:3332, `uq_workspace_member_owner` 0001:5177, `uq_workspace_member_owned_user` 0001:5179; never ownerless: App |
| `auth_challenges` (verification, reset) | request → live `auth/challenges.ts:38-106` (upsert nulls `consumed_at`); live → consumed `:152-245` (user + challenge `FOR UPDATE`, bumps `session_version`, reset revokes MCP grants and API keys), password change `:251-297`, Google claim `auth/oauth.ts:285-306` | DB one per (user, purpose) |
| Sessions | JWT `ver` = `users.session_version` on every request `auth/session.ts:144`; bumped by reset, password change, sign-out, operator reset/disable | App |
| `api_keys` | live → revoked (`revoked_at IS NULL`) `api-keys/keys.ts:192-215`; expired by time; every use re-reads key, membership and creator `:248-277` | App |
| MCP OAuth | request → consumed (`completeConsent`, `mcp/oauth.ts`); code minted under the user row `FOR SHARE` with the consenting session's `session_version` → consumed + grant (`authorizationCodeGrant`; replayed code revokes the grant); refresh rotation; grant → revoked; credential reset, password change and sign-out-everywhere-with-disconnect revoke grants and consume unexchanged codes (`revokeGrantsAfterCredentialReset`) | App single-use `consumed_at IS NULL FOR UPDATE` |

### 7.2 Public API idempotency (`api_idempotency`)

claim (`status_code` null = in progress) → completed (`status_code` set), or
deleted (released on a 4xx refusal; purged after `retention_hours`, 24)
`public-api/idempotency.ts:30-142`. DB unique `(api_key_id, idempotency_key)`
0001:3439.

Known invalid: a 5xx, a thrown non-API error or a crash before the completion
update leaves the claim "in progress", answered 409 `retryable: true` for 24 h —
[PA1](plans/state-machine-fixes.md#pa-public-api).

### 7.3 Actions, prompts and brand facts

| Machine | States and transitions | Enforced |
|---|---|---|
| `actions.status` ∈ `open`/`dismissed`/`implemented`; `effective_status` adds `in_progress`/`measuring`/`done` (`config/actions.ts:33-34`) | ∅ → `open` by evidence sync `opportunities/action-sync.ts:131-220` (project lock); `open` ↔ `dismissed` `actions.ts:313-357` (Action `FOR UPDATE`); `open` → `implemented` by declaration `declarations.ts:225-324` (project lock, Action `FOR UPDATE`, idempotent); `effective_status` recomputed by `refreshActionStatus` `action-status.ts:62-81` on every writer | DB one Action per group `uq_actions_project_group`, one declaration per Action; statuses App |
| `prompts.status` ∈ `active`/`archived` | `updatePrompt` `prompts/prompts.ts:323-363`, `bulkSetStatus` `:378-422` (project + set lock, binding check); inserts `active` | App; occupancy counts every prompt (B27) |
| `prompt_candidates.disposition` | `pending` → `accepted`/`rejected`/`deleted` `prompts/candidates.ts:183-289` (project + set locks, pending rows `FOR UPDATE`) | DB `uq_prompt_candidate_pending_text` 0001:5209 |
| Brand facts | `draft` → `confirmed` → `retired` (terminal), `expected_revision` under project lock `projects/brand-facts.ts:114-200` | DB `ck_brand_fact_status`, `ck_brand_fact_revision_status` 0001:935, 949; revision unique |

Known invalid: a prompt edit reads the prompt before the project lock, so an
activation can bind against a stale topic or text and leave an active prompt
unbound to its current topic — [WS3](plans/state-machine-fixes.md#ws-workspace-auth-and-prompts).
