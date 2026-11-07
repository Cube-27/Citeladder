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
| Site Health | `site_crawl_tasks` | `leased` | 0 | same (1), crawl reconcile `workers/site-health-worker.ts:183-187` | no `site-health/site-task.ts:426` | `lockSiteTask` → `fenceLease`; `owned()` (owner only) unfenced at `site-task.ts:415`, `analyze-task.ts:347` |
| Discovery | `brand_discovery_tasks` | `running` | 0, ready iff `attempt_count < max_attempts` | `recoverDiscoveryLeases` `recovery.ts:106-151`, fails the parent (1) | no `workers/discovery-worker.ts:104` | fenced `finish` `discovery-worker.ts:209-302` |
| Agent | `agent_runs` | `leased`; `start` → `running`, attempt + 1 `agent/queue.ts:64-82` | 0 | `AgentQueue.recover` `agent/queue.ts:93-146` → `failed interrupted` + refund (0) | yes `agent/queue.ts:83-85` | `lockRun` = `fenceLease` + `cancelled_at IS NULL` `agent/queue.ts:10-20` |
| Integrations | `integration_sync_runs` | `running` (claimable `queued`, `retry_wait` only) | 1 | `recoverIntegrationLeases` `recovery.ts:153` (0) | yes `workers/integration-worker.ts:122` | `#held` `integration-worker.ts:176-178` |
| Audits | `audit_tasks` | `leased` | 0 | `AuditMaintenance.#reclaim` `audits/maintenance.ts:145-231` (1 unless uncertain or parent terminal) | no `queue/audit-queue.ts:196-198` | `ownedAuditTask` owner + status + unexpired, **no attempt** `audit-queue.ts:82-104` |

| Invariant | Enforced |
|---|---|
| One row per logical task | DB: unique `idempotency_key` per lane; slots `uq_audit_task_slot`, `uq_site_crawl_task_slot`, `uq_brand_discovery_task_discovery`; enqueue `ON CONFLICT DO NOTHING` `queue/enqueue.ts:46-75` |
| Status within the vocabulary | None (DB1) |
| Lease columns set iff held | App; a cancelled Keyword Research task keeps `lease_owner` (`search-intelligence/runs.ts:161-168`), harmless because fences refuse terminal rows |
| `attempt_count <= max_attempts` | App (claim `ready`, recovery `exhausted` CASE) |
| Exclusive claim | App: ranked `FOR UPDATE SKIP LOCKED` with eligibility re-applied `task-queue.ts:187-247` |
| Only the current holder writes | App: lane fence above; audit lane cannot tell two claims by one worker apart |

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `queued` | `enqueueTask` | `queue/enqueue.ts:46-75` | `ON CONFLICT (idempotency_key) DO NOTHING` |
| ∅ → `queued` (coalesced successor) | `enqueueCoalesced` | `queue/enqueue.ts:106` | advisory lock; earliest deadline wins |
| claimable → claim status | `TaskQueue.claim` | `task-queue.ts:395-437` | status claimable, `available_at <= now`, lane `ready`, SKIP LOCKED; turn cursor in the same tx |
| `leased` → `running` | `markRunning` | `task-queue.ts:441-453` | owner, `leased`, unexpired, attempt when passed |
| held → held (renew) | `heartbeat` | `task-queue.ts:456-486` | owner, held, unexpired, attempt when passed; a miss aborts via `maintainLease` `queue/heartbeat.ts` |
| held, expired → `retry_wait` / `failed` | `reclaimExpiredLeases` | `recovery.ts:47-91` | expired, SKIP LOCKED; `failed` when `attempt + charge >= max` |
| `failed` → `failed` + `payload.terminal_compensated_at` | `compensateTerminalTasks` | `workers/terminal-compensation.ts:26-67` | `status = failed`, not compensated; abandoned after `terminal_compensation_max_failures` |

Known invalid: a stale audit slot whose lease expired passes `ownedAuditTask`
after the same worker re-claims the task (duplicate paid dispatch; trigger needs
a heartbeat stalled past the lease) — [Q1](plans/state-machine-fixes.md#q-queue-leases).
Discovery and Site Health heartbeats and two Site Health settles ignore the
attempt — [Q2](plans/state-machine-fixes.md#q-queue-leases).

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
| held, expired → `submission_uncertain` / `retry_wait` / `failed` / `cancelled` | `#reclaim` | `maintenance.ts:145-231` | audit then task `FOR UPDATE SKIP LOCKED`; uncertain iff `provider_submission_ref` set, no `provider_task_id`, parent active |
| held → `succeeded`/`failed` | `repairOwnedCompletion` | `maintenance.ts:23-78` | `ownedAuditTask` + artifact/observation; unreachable today because success and failure write evidence and status in one tx |
| non-terminal → `cancelled` | `cancelAudit` | `maintenance.ts:103-118` | status not terminal |

Known invalid: a task reclaimed while polling a paid provider task is charged an
attempt and can fail with the paid result unretrieved —
[AU1](plans/state-machine-fixes.md#au-audits). A Google AI Overview task that
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
| A deleted project leaves no open hold | App `projectHoldsReservations` `entitlements/ledger.ts`: `audit`, `agent`, `site_crawl` and the project's Keyword Research `platform_call` holds refuse deletion (409 `project_work_running`) |

### 3.2 `platform_calls.status` ∈ {`reserved`, `settled`, `failed`}

DB: `ck_platform_calls_status`, `ck_platform_calls_settled` (reserved ⇔
`settled_at IS NULL`), `ck_platform_calls_credits`, `ck_platform_calls_hold`
(0001:2071-2075).

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `reserved` (credits) | `openHold` via `reserve`, committed before I/O | `billing/metering.ts:142-200` | hold refused → 403 `ai_credits_exhausted` |
| ∅ → `settled`/`failed` (included, not charged) | `record` after the call | `metering.ts:119-140` | daily breaker before I/O |
| `reserved` → `settled`/`failed` | `settleCall` | `metering.ts:260-281` | `lockHeld` (`status = reserved FOR UPDATE`) |
| `reserved` (`owner_settled`) → `settled` | `settleProviderCredits` ← `settleResearchCharge` | `metering.ts:234-258`, `search-intelligence/charges.ts:20-73` | `lockHeld`; run ended, no call still reporting |
| `reserved` (> 900 s, not owner-settled) → `settled` | `settleAbandonedCalls` | `metering.ts:417-431` | charges the unknown-usage fallback |

Known invalid: a failed call whose settle transaction errors is later charged
the fallback by the sweep — [BL2](plans/state-machine-fixes.md#bl-billing-and-credits).

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
| `abandoned` (not base) → `pending` | signed checkout callback | `routes/billing.ts:326-352` | `pending`, or `abandoned` and kind ≠ base |

Known invalid: reopening an abandoned add-on or upgrade while a newer one is
pending violates the one-pending unique and answers 500 —
[BL4](plans/state-machine-fixes.md#bl-billing-and-credits). A base checkout
paid as the abandon sweep cancels it depends on Razorpay's evidence for a
just-cancelled subscription — [BL8](plans/state-machine-fixes.md#bl-billing-and-credits) (blocked, OQ3).

### 3.4 `billing_subscriptions` (status × `is_current` × `ended_at` × `cancel_at_period_end` × `cancellation_sent_at` × `scheduled_change`)

DB: one current base per account `uq_billing_subscription_one_current`
(0001:5187); external id unique. App: `ended_at ⇒ ¬is_current`;
`cancellation_sent_at ⇒ cancel_at_period_end`; status vocabulary.

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `pending` (current) | first paid base evidence | `settlement.ts:126-197` | no current row; granted status and payment |
| * → evidence status | webhook or sweep | `settlement.ts:513-556` | `event.version >= provider_state_version`; not ended |
| terminal evidence → `cancel_scheduled` until paid end / ended | `periodOutcome` → `endTerminal` | `settlement.ts:398-447, 459-479` | an unrefunded paid period covers now |
| current period refunded in full → `cancelled` (still current) | `endRefundedPayment` (B52) | `settlement.ts:681-740` | `is_current`, period equals the payment's |
| `cancel_at_period_end` false → true | customer cancel; evidence; B52 | `billing/cancellation.ts:69-78`; `settlement.ts:541-542, 722` | sub `FOR UPDATE`, period end in future |
| true → false | resume | `cancellation.ts:94-98` | not yet sent, before the lead time |
| `cancellation_sent_at` null → now | sweep; evidence; refund | `recovery.ts:541-548`; `settlement.ts:487, 723` | `cancel_at_period_end` |
| `scheduled_change` null → `requested` | upgrade settles; downgrade scheduled | `settlement.ts:618-638`; `plan-changes.ts:54-84` | no change in flight, not cancelling |
| `requested` → `scheduled` / `provider_rejected` | `pushChange` | `plan-changes.ts:326-365` | state `requested`, same source |
| `scheduled_change` → null | renewal at the new price, or a refused change lapses | `settlement.ts:449-458, 545-546` | price ref match |

Known invalid: a fully refunded upgrade leaves its `scheduled_change` live, so
the next cycle bills the upgraded price —
[BL7](plans/state-machine-fixes.md#bl-billing-and-credits) (blocked, OQ2). A
B52-cancelled subscription returns to `active` if a renewal is charged before
the sweep cancels it (timing) — [BL8](plans/state-machine-fixes.md#bl-billing-and-credits) (blocked, OQ3).

### 3.5 `billing_webhook_events.processing_state` ∈ {`pending`, `completed`, `quarantined`} + lease + `attempt_count`

DB: `(provider, mode, event_id)` unique (0001:4052).

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `pending` | receipt | `billing/webhooks.ts:110-132` | `ON CONFLICT DO NOTHING` |
| any → `quarantined` | same id, different digest | `webhooks.ts:133-148` | none (a `completed` row flips too) |
| `pending` → leased, attempt + 1 | claim | `recovery.ts:270-302` | `attempt_count < webhook_max_attempts`, lease expired, SKIP LOCKED |
| leased → `completed` | applied | `recovery.ts:340-378` | lease token unexpired |
| leased → `pending` / `quarantined` | error; unmatched (exhausted) | `recovery.ts:379-411` | lease token |

Known invalid: a row whose final attempt dies with its process stays `pending`
with `attempt_count = max`, never claimed or quarantined; a refund applied only
by its webhook is lost — [BL3](plans/state-machine-fixes.md#bl-billing-and-credits).

### 3.6 Other billing records

| Machine | States and transitions | Enforced |
|---|---|---|
| `billing_catalog_revisions.publication_state` | `draft` (mutable) → `published`, previous → `retired` (final) `billing/admin.ts:107-173` | DB one published 0001:5181; App subject lock |
| `billing_payments` | insert-only; refund child rows | DB 0001:5183-5185 |
| `idempotency_records` (plan changes) | ∅ → `completed` only `plan-changes.ts:54-69`; deleted on `provider_rejected` `:307-320`; `expires_at` never read | App |
| Access (derived) | `trial_active` / `trial_expired` / `active` / `subscription_lapsed` / `access_unresolved` from grant validity `entitlements/access.ts:38-91`; trial once per mailbox under advisory lock `entitlements/bootstrap.ts:62-113`; purge `projects/trial-purge.ts:26-128` | App |

Known invalid: a replay of a downgrade whose provider push was refused can
answer `requested` after a crash between the refusal and the record delete —
[BL5](plans/state-machine-fixes.md#bl-billing-and-credits). Trial purge can
remove a returning customer's projects between payment and settlement
(needs delayed settlement) — [BL6](plans/state-machine-fixes.md#bl-billing-and-credits).

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
| `running` → `failed` (code) | `runtime.fail`; caller stop → `interrupted`/`turn_timeout` | `agent/runtime.ts:709-734`, `agent/worker.ts:39-43` | `lockRun`; settle + refund (B58) in the same tx |
| `queued`/`leased`/`running` → `cancelled` | Stop | `agent/store.ts:304-333` | run `FOR UPDATE`, not terminal; no lease check; charged (B58) |
| `queued` > `unclaimed_grace_seconds` → `failed interrupted` | runner `recover` | `agent/queue.ts:93-146` | SKIP LOCKED; settle + refund |
| held, lease expired → `failed interrupted` | runner `recover` | same | lease `<= now` |

The lease is `execution_timeout_seconds + lease_margin_seconds` = 660 s
(`agent/bindings.ts:44`, `config/model-gateway.json:35-46`) although the
heartbeat renews every 20 s.

Known invalid: a 429 from `/run` leaves the run `queued` until the runner's
next tick ends it as "page closed" —
[AG2](plans/state-machine-fixes.md#ag-agent). A crashed instance or a lost
heartbeat leaves the run `running` for up to the lease plus a tick (~21 min)
— [AG3](plans/state-machine-fixes.md#ag-agent). `fail()` for a member who lost
access throws and leaves the run `running` —
[AG4](plans/state-machine-fixes.md#ag-agent). Closing the tab after a document
streamed refunds the turn — [AG1](plans/state-machine-fixes.md#ag-agent)
(blocked, OQ1).

### 4.2 Model attempts, tool attempts, outputs

| Machine | States and transitions | Enforced |
|---|---|---|
| `agent_model_attempts.outcome` | `dispatched` → `completed`/`failed` by receipt `agent/model-calls.ts:167-261` (row `FOR UPDATE`, only from `dispatched`); `dispatched` → `recovered_unknown` by reconcile `:303-343` from `fail`, `recover`, `recoverCancelled` | DB slot uniques `uq_agent_model_attempt_slot`, `uq_agent_model_attempt_dispatch`; CHECKs on bytes, output cap (0005), cost (0012); outcome App |
| `settlement_status` | `pending`/`not_applicable` at dispatch → `settled`/`zero_debit`; failed or unknown with no usage settles 0 `agent/funding.ts:242-246` | App; `settled_at` null iff `dispatched` |
| Hold per call | reserve `funding.ts:205` → settle (idempotent per dispatch key) → `refundSubject` (failed runs, B58) | App ledger |
| `agent_tool_attempts.status` | insert-only, written once after the read `agent/runtime.ts:571-605` under `lockRun` | DB `uq_agent_tool_attempt_slot` |
| `agent_outputs` / revisions | ≥ 1 revision; output + revision in one tx `agent/outputs.ts:54, 110-154`; edits under chat lock + `requireIdle` | DB `uq_agent_output_chat_number`, `uq_agent_output_revision_number`, number > 0 (0004) |
| Transcript | saved at finish; replayed to the model `agent/transcript.ts:110` | App |

Known invalid (unverified provider behaviour): a `pause_turn` on the last call
saves an unmatched `server_tool_use`; if the Messages API rejects that replay,
every later turn of the chat fails — [AG5](plans/state-machine-fixes.md#ag-agent).

### 4.3 Browser turn stream (`frontend/lib/agent/live-turns.ts`)

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| absent → `connected: true` | `startLiveTurn` once per accepted run | `live-turns.ts:126-144`, `frontend/lib/api/agent.ts:77` | `turns.has(runId)` |
| `connected` → `connected: false` | stream ends, fetch fails or any non-2xx | `live-turns.ts:141` (`finally`) | none; the response status is never read |
| polling on | run active and not connected | `frontend/components/agent/use-chat-turns.ts:28-38` | re-read on stream close |

`isRunActive` = `queued`/`leased`/`running`/`retry_wait`
(`frontend/lib/agent/run-state.ts:176`); send is disabled while pending or
active (`frontend/components/agent/chat-thread.tsx`), and the server answers
409 `agent_run_active`.

Known invalid: no retry after 429 (docs/agents.md says "the queued turn waits
for the browser's retry"); a stream that goes silent shows streaming
indefinitely — [AG2](plans/state-machine-fixes.md#ag-agent).

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
| Ended run ⇒ no `collecting` dataset | App (`closeCollecting` `acquisition-state.ts:926`); not on cancel (SI3) |
| Hold settles only when the run ended and no call can still report | App `charges.ts:20-73` |
| A dispatched call is never re-sent | App: `dispatched` without response → `uncertain` |

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| `reviewed` → `queued` (hold + task) / `succeeded` (empty plan) | `confirmRun` | `runs.ts:122-147` | project `FOR UPDATE`, unconfirmed, unexpired, price, connection, no other active run |
| `reviewed`/`queued`/`running` → `cancelled` | `cancelRun` | `runs.ts:149-180` | run `FOR UPDATE`, not finished; task cancelled; hold settled when nothing in flight |
| `queued`/`running` → `running` | `start` | `acquisition-state.ts:201-232` | run `FOR UPDATE`, not terminal, `owned()` |
| → `failed` (`pricing_changed`/`connection_changed`) | `start`, `prepare` | `acquisition-state.ts:205-223, 238-241` | connection or member check fails |
| `running` → `uncertain` | `prepare` finds a dispatched call with no response | `acquisition-state.ts:299-329` | — |
| `running` → `queued` (park) | `park` | `acquisition-state.ts:469-491` | `running`, `owned()` |
| `running` → `failed`/`partial`/`uncertain` | `fail` / `stopRun` / ceiling | `acquisition-state.ts:615-668, 292-297` | `running`, `owned()` |
| `running` → `succeeded`/`partial` | `finish` | `acquisition-state.ts:670-692` | `running`, `owned()` |
| `queued`/`running` → terminal | `reconcileResearch` | `search-intelligence/maintenance.ts:8-98` | task `failed`/`cancelled` |
| call `intent` → `dispatched` | `dispatch` | `acquisition-state.ts:377-419` | run `running`, `owned()`, connection; call `intent` |
| call `dispatched` → `succeeded`/`failed`/`uncertain`/`intent` (rate-limit retry) | publish / fail / prepare | `acquisition-state.ts:493-668` | `uncertain` still accepts a late receipt `:421-467` |
| dataset `collecting` → `published`/`failed` | publish / fail / `closeCollecting` | `acquisition-state.ts:586-594, 926` | — |

Dispatch attempts are insert-only, one `outcome` per ordinal (DB
`uq_si_dispatch_phase` 0001:4282).

Known invalid: a connection or member change between `prepare` and `dispatch`
returns without a run transition, the task succeeds and the run stays
`running` with its hold — [SI1](plans/state-machine-fixes.md#si-search-intelligence-and-integrations).
A receipt saved into a call already marked `uncertain` after settlement is
never billed — [SI2](plans/state-machine-fixes.md#si-search-intelligence-and-integrations).
Cancel leaves datasets `collecting` — [SI3](plans/state-machine-fixes.md#si-search-intelligence-and-integrations).

### 6.2 Integrations

| Machine | States and transitions | Enforced |
|---|---|---|
| `integration_oauth_grants.status` | ∅ → `connected` `integrations/oauth.ts:228-248`; **any** → `connected` on reconnect `oauth.ts:207-226` (keeps the old refresh token when the provider returns none); `connected`/`needs_reauth` → `pending_revocation` `grants.ts:19-86`; → `revoked` `grants.ts:137-172` (claim + revision + `pending_revocation`); `connected` → `needs_reauth` `grants.ts:203-221` | App; token rotation fenced by claim id, `token_revision`, `connected` `tokens.ts:53-140`; OAuth state single use `oauth.ts:171-182` |
| `integration_sync_runs` | lane §1; deadline release → `queued`; every write behind `#held`; target re-checked per page and at finish `integration-worker.ts:516-575` | DB `ix_integration_sync_runs_active_window` (partial unique) 0001:4785 |
| `integration_property_mappings` | one active owner per property | DB 0001:4777 |

Known invalid (depends on Google revoking the client's whole grant): a
reconnect during an in-flight revocation yields a `connected` grant whose
tokens the dispatcher revokes — [SI4](plans/state-machine-fixes.md#si-search-intelligence-and-integrations).

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
| `workspace_invitations` (implicit `accepted_at`, `revoked_at`, `expires_at`) | none/expired → pending (issue `workspaces/invitations.ts:78-148`); pending → pending new token / revoked (`:151-191`); pending → revoked in bulk when the issuer leaves (`workspaces/service.ts:218-228`); pending → accepted + member (`:194-277`, workspace then invitation `FOR UPDATE`, issuer must hold `manage_members`) | DB one live row per email `uq_workspace_invitation_pending_email` 0001:5221; token unique; role never owner `ck_workspace_invitation_role` 0001:3322 |
| `workspace_members.role` | create → owner `service.ts:109-126`; non-owner X → Y, removal, leave `:231-283`; owner ↔ admin transfer `:285-326` | DB `ck_workspace_member_role` 0001:3332, `uq_workspace_member_owner` 0001:5177, `uq_workspace_member_owned_user` 0001:5179; never ownerless: App |
| `auth_challenges` (verification, reset) | request → live `auth/challenges.ts:38-106` (upsert nulls `consumed_at`); live → consumed `:152-245` (user + challenge `FOR UPDATE`, bumps `session_version`, reset revokes MCP grants and API keys), password change `:251-297`, Google claim `auth/oauth.ts:285-306` | DB one per (user, purpose) |
| Sessions | JWT `ver` = `users.session_version` on every request `auth/session.ts:144`; bumped by reset, password change, sign-out, operator reset/disable | App |
| `api_keys` | live → revoked (`revoked_at IS NULL`) `api-keys/keys.ts:192-215`; expired by time; every use re-reads key, membership and creator `:248-277` | App |
| MCP OAuth | request → consumed `mcp/oauth.ts:261-268, 319-323`; code minted `:297-315` → consumed + grant `:340-417` (replayed code revokes the grant); refresh rotation; grant → revoked `:95-128` | App single-use `consumed_at IS NULL FOR UPDATE` |

Known invalid: an unexchanged authorization code survives password reset,
password change and sign-out-everywhere (only grants are revoked,
`mcp/oauth.ts:113-128`) and its exchange checks no credential change —
[WS1](plans/state-machine-fixes.md#ws-workspace-auth-and-prompts). An accept
racing an operator disabling the issuer reads the issuer unlocked (timing) —
[WS2](plans/state-machine-fixes.md#ws-workspace-auth-and-prompts).

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
