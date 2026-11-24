# State machines

Cross-feature catalogue of every persisted lifecycle: its states, the invariants
that hold over them and where each is enforced, and the transitions with their
trigger, location and guard. Code, tests and the feature owners in the
[documentation index](README.md) remain the authority; this file records where
each rule is enforced so a change can find every writer. Line numbers drift:
search the named function, and add no new ones.

Paths are relative to `frontend/services/api/src/` unless they start with
`frontend/`; a named DB object is defined in `migrations/`. **Enforced**:
`DB` = CHECK, unique, partial unique index or FK; `App` = code under the named
lock; `None` = nothing holds it. A status CHECK
(`test/schema-constraints.test.ts` lists them) enforces the vocabulary, not the
edges; other status columns hold their vocabulary in code only.

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
| Status within the vocabulary | DB `ck_<lane table>_status` |
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
`FOR UPDATE`; the vocabulary itself is DB `ck_audits_status`. Terminal `cancelled`, `completed`, `failed`, `partially_completed`;
active `analyzing`, `draft`, `queued`, `running`, `validating`
(`audit_active_statuses` in `config/audits.json`). `draft`, `validating`, `analyzing` and `reporting` are
never committed: each is entered and left inside one transaction.

| Invariant | Enforced |
|---|---|
| Only configured edges | App `transitionAudit` |
| One scheduled audit per occurrence and market | DB `uq_audit_schedule_slot` |
| One repair child per parent and task set | DB `uq_audit_parent_repair_key` |
| Terminal ⇒ no open task | App: cancel terminalizes tasks in its tx; finalize returns while any task is open `audits/finalization.ts:65` |
| ≤ `active_audits_per_workspace` active launches | App `reserveAuditCapacity` `audits/admission.ts` under `audit-enqueue:{ws}`, for launches and repairs |
| A source task in at most one active repair child | App `createRepairAudit` under `audit-enqueue:{ws}`: 409 on overlap |

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `draft` → `validating` → `queued` | `createMarketAudit` | `audits/creation.ts:74-215` | `audit-enqueue` lock; capacity, abuse budget, `admitAudit`, `reservePromptRuns`; a scheduled occurrence returns its prior row |
| ∅ → … → `queued` (repair) | `createRepairAudit` | `audits/repair.ts` | `audit-enqueue` lock, then parent `FOR UPDATE` and terminal; BYOK failed tasks only; no overlap with an active repair child; capacity and abuse budget (no manual-run allowance); `reservePromptRuns` |
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
| `running` → `awaiting_provider_result` / `submission_uncertain` | `persistSurfaceExchange` | `audits/surface-persistence.ts` | `ownedAuditTask`; paid submission charges the attempt. A save that throws, or any unexpected error on an observed surface, leaves the row held for `#reclaim` |
| `running` → `retry_wait` (rate-limit retry) | `releaseRefusedSubmission` | `audits/surface-persistence.ts` | `ownedAuditTask`; DataForSEO refused the submission (`rate_limit_status_codes`), so the intent is cleared without charging an attempt and the run cap bounds the resubmits |
| held, expired → `awaiting_provider_result` / `submission_uncertain` / `retry_wait` / `failed` / `cancelled` | `#reclaim` | `maintenance.ts` | audit then task `FOR UPDATE SKIP LOCKED`; with the parent active, `provider_task_id` set → `awaiting_provider_result` and `provider_submission_ref` alone → `submission_uncertain`, neither charging an attempt but each counting one poll (the recovery deadline or the poll ceiling bounds them) |
| held → `succeeded`/`failed` | `repairOwnedCompletion` | `maintenance.ts:23-78` | `ownedAuditTask` + artifact/observation; unreachable today because success and failure write evidence and status in one tx |
| non-terminal → `cancelled` | `cancelAudit` | `maintenance.ts:103-118` | status not terminal |

A surface failure writes a failure artifact and its cost projection in the
failure transaction: always on the LLM scraper path, and on the Google AI
Overview path (beside its observation) once a paid submission reported its
charge.

Known invalid: none persisted. Results dropped because the task lost ownership
mid-call record no cost (internal cost only; not planned).

### 2.3 `audit_schedules` (implicit: `enabled`, `next_run_at`, lease, `failure_count`)

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| due → leased | `claimDueSchedules` | `queue/audit-queue.ts:35-79` | `enabled`, `next_run_at <= at`, lease null or expired, SKIP LOCKED, committed |
| leased → released | `planClaim` stale | `workers/audit-scheduler.ts:64-74` | lease owner, unexpired; disabled or occurrence moved |
| leased → advanced | `planClaim` success | `audit-scheduler.ts:75-109` | savepoint; `next_run_at = nextRunAfter`, `enabled = next ≠ null`, `failure_count = 0` |
| leased → deferred | `planClaim` retryable refusal | `audit-scheduler.ts` | `ApiError.isRetryable()` (active-launch limit, daily task budget): ownerless lease until `Retry-After`; `next_run_at` (the cadence anchor), `failure_count`, `enabled`, `last_error` untouched |
| leased → backoff / disabled | `planClaim` other error | `audit-scheduler.ts` | `failure_count + 1`, `enabled = failures < max (5)`; `next_run_at` (the cadence anchor) untouched; backoff is an ownerless lease for 300 s, none once disabled |
| disabled → enabled | Resume / `updateSchedule` | `audits/schedules.ts:98-136` | schedule row lock |

Known invalid: none.

### 2.4 Prompt-run holds and the funded budget

Hold per task (`consumable_ledger`, subject `audit` task): reserve at creation
(`creation.ts`) or repair (`repair.ts`); spend 1 on success
(`result-persistence.ts:153`); release on terminal failure, cancel
(`maintenance.ts:119`), reclaim to terminal (`maintenance.ts:219`) and the owing
sweep (`maintenance.ts:265-319`). `settlePromptRun` (`audits/prompt-runs.ts:57-74`)
settles only open units. The funded monthly budget is not a hold: `admitAudit`
sums the latest `execution_cost_projections` row per execution
(`raw_response_artifact_id`) under the account capacity lock
(`audits/admission.ts`), a soft ceiling (B20).

Known invalid: none.

## 3. Billing and credits

### 3.1 Consumable holds (`consumable_ledger`, append-only)

reservation → debit + release, or release, or refund. Subjects: `audit` task,
`agent` run, `site_crawl`, `platform_call`.

| Invariant | Enforced |
|---|---|
| Idempotent entries | DB unique idempotency key per account `uq_consumable_ledger_idempotency`; debit uniques `uq_consumable_ledger_subject_dispatch_allocation_debit`, `uq_consumable_ledger_task_attempt` |
| Settle once, never above the hold | App `entitlements/ledger.ts` settle/release under row locks + capacity lock (B63) |
| A deleted project leaves no open hold | App `projectHoldsReservations` `entitlements/ledger.ts`: `audit`, `agent`, `site_crawl` and the project's Keyword Research `platform_call` holds refuse deletion (409 `project_work_running`); deletion and trial purge check under the project row lock (`lockProjectRow`, `projects/service.ts`), so they serialize with hold writers that lock the row (Keyword Research confirmation, Site Health, Agent outputs) |

### 3.2 `platform_calls.status` ∈ {`reserved`, `settled`, `failed`}

DB: `ck_platform_calls_status`, `ck_platform_calls_settled` (reserved ⇔
`settled_at IS NULL`), `ck_platform_calls_credits`, `ck_platform_calls_hold`
(`ck_platform_calls_*`).

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

DB: one pending base / upgrade / add-on per key (`uq_pending_activation_one_pending_*`), provider
reference unique (`uq_pending_activation_provider_reference`), `(account, idempotency_key)` unique (`uq_pending_activation_account_idempotency`).
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

DB: one current base per account `uq_billing_subscription_one_current`;
external id unique; status vocabulary `ck_billing_subscription_status`. App: `ended_at ⇒ ¬is_current`; `cancellation_sent_at ⇒ cancel_at_period_end`.

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `pending` (current) | first paid base evidence | `settlement.ts` `settleBase` | no current row; granted or terminal status (B71) and payment |
| * → evidence status | webhook or sweep | `settlement.ts:513-556` | `event.version >= provider_state_version`; not ended |
| terminal evidence → `cancel_scheduled` until paid end / ended | `periodOutcome` → `endTerminal` | `settlement.ts` `endTerminal`, `periodOutcome` | an unrefunded paid period covers now and no full refund cancelled the row |
| `cancelled` (still current) stays `cancelled` on later non-terminal evidence; a renewal charged meanwhile records its receipt, grants nothing and logs `billing.renewal_paid_after_cancellation` (B71) | `settlePeriod`, `periodOutcome` | `settlement.ts` `refundCancelled` | `is_current`, status `cancelled` |
| current period refunded in full → `cancelled` (still current), `scheduled_change` → null | `endRefundedPayment` (B52; an upgrade bought in the period too) | `settlement.ts` `paidPeriod`, `endRefundedPayment` | `is_current`, period equals the payment's (an upgrade's: paid inside the current period) |
| `cancel_at_period_end` false → true | customer cancel; evidence; B52 | `billing/cancellation.ts:69-78`; `settlement.ts:541-542, 722` | sub `FOR UPDATE`, period end in future |
| true → false | resume | `cancellation.ts:94-98` | not yet sent, before the lead time |
| `cancellation_sent_at` null → now | sweep; evidence; refund | `recovery.ts:541-548`; `settlement.ts:487, 723` | `cancel_at_period_end` |
| `scheduled_change` null → `requested` | upgrade settles; downgrade scheduled | `settlement.ts:618-638`; `plan-changes.ts:54-84` | no change in flight, not cancelling |
| `requested` → `scheduled` / `provider_rejected` | `pushChange` | `plan-changes.ts:326-365` | state `requested`, same source |
| `scheduled_change` → null | renewal at the new price, or a refused change lapses | `settlement.ts:449-458, 545-546` | price ref match |

### 3.5 `billing_webhook_events.processing_state` ∈ {`pending`, `completed`, `quarantined`} + lease + `attempt_count`

DB: `(provider, mode, event_id)` unique (`uq_billing_webhook_external`).

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
| `billing_catalog_revisions.publication_state` | `draft` (mutable) → `published`, previous → `retired` (final) `billing/admin.ts:107-173` | DB one published `uq_billing_catalog_revision_published`, state CHECK; App subject lock |
| `billing_payments` | insert-only; `paid` payments and `processed` refund child rows | DB `uq_billing_payment_external`, `uq_billing_refund_external`, status CHECK |
| `idempotency_records` (plan changes) | ∅ → `completed` only `plan-changes.ts` `scheduleDowngrade`; deleted on `provider_rejected` after the push, or by a same-key replay that finds the current subscription's change from that key `provider_rejected` (`refusedFromKey`); `expires_at` never read | DB state CHECK; App |
| Access (derived) | `trial_active` / `trial_expired` / `active` / `subscription_lapsed` / `access_unresolved` from grant validity `entitlements/access.ts:38-91`; trial once per mailbox under advisory lock `entitlements/bootstrap.ts:62-113`; purge `projects/trial-purge.ts` deletes first, then rechecks under the capacity lock (`stillPurgeable`) and rolls back for a workspace that ever held a non-trial grant or has a `pending` checkout | App |

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

Lease and heartbeat timing is in [agents](agents.md#worker-and-funding).

### 4.2 Model attempts, tool attempts, outputs

| Machine | States and transitions | Enforced |
|---|---|---|
| `agent_model_attempts.outcome` | `dispatched` → `completed`/`failed` by receipt `agent/model-calls.ts:167-261` (row `FOR UPDATE`, only from `dispatched`); `dispatched` → `recovered_unknown` by reconcile `:303-343` from `fail`, `recover`, `recoverCancelled` | DB slot uniques `uq_agent_model_attempt_slot`, `uq_agent_model_attempt_dispatch`; CHECKs on bytes, output cap, cost, outcome vocabulary; transitions App |
| `settlement_status` | `pending`/`not_applicable` at dispatch → `settled`/`zero_debit`; failed or unknown with no usage settles 0 `agent/funding.ts:242-246` | DB vocabulary CHECK; App transitions; `settled_at` null iff `dispatched` |
| Hold per call | reserve `funding.ts:205` → settle (idempotent per dispatch key) → `refundSubject` (failed runs, B58) | App ledger |
| `agent_tool_attempts.status` | insert-only, written once after the read `agent/runtime.ts` `recordTool` under `lockRun` | DB `uq_agent_tool_attempt_slot` |
| `agent_outputs` / revisions | ≥ 1 revision; output + revision in one tx `agent/outputs.ts:54, 110-154`; edits under chat lock + `requireIdle` | DB `uq_agent_output_chat_number`, `uq_agent_output_revision_number`, number > 0 |
| Transcript | saved at finish without the last response's unanswered `server_tool_use` (`savedTranscript`, `agent/runtime.ts`); replayed to the model `agent/transcript.ts:110` | App |

The browser turn stream (`frontend/lib/agent/live-turns.ts`) is in
[agents](agents.md#streaming-and-the-chat). `isRunActive`
(`frontend/lib/agent/run-state.ts`) is `queued`/`leased`/`running`/`retry_wait`;
send is disabled while a run is active, and the server answers 409
`agent_run_active`.

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
| One snapshot per crawl | DB `uq_site_health_snapshot_crawl` |
| Terminal ⇒ no open lifecycle task | App: terminalize only when discover/setup/analyze drained `site-health/terminal-publication.ts` `terminalize` |
| `inventory_complete` ⇒ whole site inventoried | App `site-health/crawl-assessment.ts` `reconcileInventory`: coverage `complete` only |

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| ∅ → `queued` (rerun: discovery `completed`; never `inventory_complete`) | create / page rerun | `planner.ts:195-228, 395-433` | project lock, no active crawl |
| `queued` → `running` | first task runs | `site-task.ts:134-148` | `status = queued` |
| analysis `pending` → `running` | reconcile | `site-health/crawl-assessment.ts` | crawl `FOR UPDATE`, active |
| discovery `running` → `completed`/`failed`; `inventory_complete` | reconcile | `site-health/crawl-assessment.ts` `reconcileDiscovery`, `reconcileInventory` | no open discover/setup; failed iff `discovered_url_count = 0` |
| discovery `running` → `sample_completed` | discover commit | `discover-task.ts:393-396` | sample cap; fenced task + crawl lock |
| `running` → `completed`/`partially_completed`/`failed` | `terminalize` | `site-health/terminal-publication.ts` `terminalize` | drained; failed iff nothing analyzed and either no discovery or applicable analyses (all failed) |
| `running` → `failed` (`crawl_overdue`) | overdue watchdog | `site-health/lifecycle.ts` `reconcileOverdue` | crawl lock, active, age re-checked |
| `queued`/`running` → `cancelled` | Stop | `site-health/controls.ts:59-108` | crawl `FOR UPDATE`, not terminal; tasks cancelled in the tx |

A crawl read without a named `crawl_id` (`currentSiteCrawl`, `reads/crawl.ts`)
is the newest usable crawl that is not a `page_rerun`; a named rerun still
reads. Sub-states and counters read each page's latest task generation, as the
terminal counters do. `inventory_complete` is decided when discovery settles
and again when the crawl drains, from coverage (`coverage.ts`
`inventoryComplete`): a page limit, pending frontier, sample, rerun or other
bound leaves it false. A change removal also needs the page absent from B's
observed inventory (`change-snapshot.ts` `observedInventory`).

### 5.2 Other Site Health records

| Machine | States and transitions | Enforced |
|---|---|---|
| `site_crawl_tasks` | lane §1; → `cancelled` by Stop `controls.ts:89-102`, deselection (`queued`/`retry_wait`) `selection.ts:213-228`, crawl not active `site-task.ts:97-114`; → `failed` by overdue `reconcileOverdue`; rerun or re-selection adds generation `max + 1` and cancels an open older generation of the page in the same tx (`site-health/admission-writes.ts`) | DB `uq_site_crawl_task_slot (crawl, kind, url_hash, generation)`, idempotency key |
| `site_discovery_frontier.status` | `pending` (`frontier.ts:280-301`) → `admitted` (`admission-writes.ts:350-362`); picked `FOR UPDATE SKIP LOCKED` inside the admitting tx | DB `uq_site_discovery_frontier_url` |
| `site_page_analyses` | always `completed`; revisions by `is_current` + `supersedes_analysis_id`: provisional `analysis-rows.ts:335-384`, finalized `terminal-analysis.ts:55-111`, retired alias `canonical-alias.ts:97-106`; only the open generation's fenced commit can become current | DB `uq_site_page_analysis_current` |
| `site_health_snapshots` | once per crawl in the terminalize tx `snapshot.ts:127-172` (`ON CONFLICT DO NOTHING`); later only `addArchitectureIssues` | DB unique per crawl |
| `site_internal_link_runs.state` | ∅ → `queued` `internal-link-runs.ts:107-200` (project lock, none live) → result `internal-link-publish.ts` (fenced), `cancelled` (`cancelLinkRun`), or `failed` when its publish task fails terminally (compensator `failLinkRun`, `internal-link-runs.ts`) | App |
| `crawl_schedules` (implicit: `enabled`, `next_run_at`, lease, `failure_count`) | off → on / cadence change: `updateSchedule` (`schedules.ts`, row lock) sets `next_run_at` one step from now and clears `last_outcome` (turning it off clears both); due → leased `claimDueCrawlSchedules` (`enabled`, `next_run_at <= at`, lease null or expired, SKIP LOCKED, committed); leased → released when disabled or the occurrence moved; leased → advanced on a created crawl (savepoint around `createCrawl`, `failure_count = 0`), a retry after `active_crawl_retry_seconds` on `crawl_already_active`, or a skip to the next occurrence (`site_health_fetches_exhausted`, `site_health_crawl_budget_exhausted`; `failure_count` untouched either way); leased → backoff / off on any other refusal (`failure_count + 1`, `enabled = failures < max (5)`; off clears `next_run_at` and keeps `last_outcome = failed`) — `workers/crawl-scheduler.ts` | DB unique `(workspace_id, project_id)`, `enabled ⇒ next_run_at`, cadence check |
| `site_issue_states.state` | per (project, page, rule), moved when an audit lands (`landIssueStates`, `issue-states.ts`, under a project advisory lock): ∅ → `open`; `open`/`regressed` → `marked_fixed` by Mark fixed (`markIssueFixed`, same lock, stamps `marked_fixed_at`); `open`/`marked_fixed`/`page_unavailable`/`no_longer_tracked` → `open` when found, except `marked_fixed` stays when the audit predates `marked_fixed_at`; `resolved` → `regressed` when found again; any unresolved → `resolved` on a `satisfied`/`not_applicable` evaluation; unresolved → `page_unavailable` when the page answers 404/410 or redirects; `page_unavailable` → `open` when the page answers again without judging the rule. An audit older than the page's `last_audit_at` or a newer finalized analysis writes nothing. `site_issue_trend` takes the project's open count per UTC day after each landing | DB `uq_site_issue_state`, `ck_site_issue_states_state`, `resolved ⇔ resolved_at`; `uq_site_issue_trend_day` |
| `site_change_snapshots.state` | immutable insert `available`/`non_comparable`/`unavailable` `change-snapshot.ts:345-425`; `supersedes_id` = the newest snapshot of a crawl no newer than B (crawl order), read under the project's snapshot advisory lock; the current snapshot is the newest crawl's (`reads/projections.ts`) | App |

### 5.3 Crawl logs (`src/crawl-logs/`)

| Machine | States and transitions | Enforced |
|---|---|---|
| `crawl_log_uploads.status` | `open` `uploads.ts:36-72` → `completed` `:73-146` (crawl-state lock + upload `FOR UPDATE`) → `unsupported_format` `ingest.ts`; `open` stale → `abandoned` `maintenance.ts:111-136` | App |
| `crawl_log_batches` | immutable receipts; upload batches need `seq = last_ack_seq + 1` | DB `uq_crawl_log_batch_key`, `ck_crawl_log_batches_drained` |
| `crawl_log_sources.status` | `active` → `revoked` (idempotent) `sources.ts:227-274`; stall flags | DB `uq_crawl_log_live_host`, `ck_crawl_log_sources_*` |
| `bot_ip_range_snapshots` | append-only `succeeded`/`failed`; readers take the latest `succeeded` | App |
| `bot_requests` | Pub/Sub redelivery dedupes | DB `uq_bot_request_line`, `uq_bot_request_provider` |

## 6. External data

### 6.1 Keyword Research (`search_intelligence_runs`, calls, datasets)

Run: `reviewed` → `queued` → `running` ⇄ `queued` (parked) → `succeeded` /
`partial` / `failed` / `uncertain` / `cancelled`.

| Invariant | Enforced |
|---|---|
| One active run per project | DB `uq_si_runs_project_active` (queued, running); App project lock `search-intelligence/runs.ts:60-81` |
| Ended run ⇒ no `collecting` dataset | App (`closeCollecting` `acquisition-state.ts`, also in `cancelRun`) |
| Hold settles only when the run ended and no call can still report (a `dispatched` call, or one recovery marked `uncertain` `provider_result_missing`, within twice the provider timeout) | App `charges.ts` |
| A dispatched call is never re-sent | App: `dispatched` without response → `uncertain` |

| From → to | Trigger | Location | Guard |
|---|---|---|---|
| `reviewed` → `queued` (hold + task) / `succeeded` (empty plan) | `confirmRun` | `runs.ts:122-147` | project `FOR UPDATE`, unconfirmed, unexpired, price, connection, no other active run |
| `reviewed`/`queued`/`running` → `cancelled` | `cancelRun` | `runs.ts:149-180` | run `FOR UPDATE`, not finished; task cancelled; collecting datasets `failed`; hold settled when nothing in flight |
| `queued`/`running` → `running` | `start` | `acquisition-state.ts:201-232` | run `FOR UPDATE`, not terminal, `owned()` |
| → `failed`, or `partial` once a call completed (`pricing_changed`/`connection_changed`) | `start` (including a parked run's restart), `prepare`, `dispatch` | `acquisition-state.ts` (`stopRun`) | price, connection or member check fails |
| `running` → `uncertain` | `prepare` finds a dispatched call with no response | `acquisition-state.ts:299-329` | — |
| `running` → `queued` (park) | `park` | `acquisition-state.ts:469-491` | `running`, `owned()` |
| `running` → `failed`/`partial`/`uncertain` | `fail` / `stopRun` / ceiling | `acquisition-state.ts:615-668, 292-297` | `running`, `owned()` |
| `running` → `succeeded`/`partial` | `finish` | `acquisition-state.ts:670-692` | `running`, `owned()` |
| `queued`/`running` → terminal | `reconcileResearch` | `search-intelligence/maintenance.ts:8-98` | task `failed`/`cancelled` |
| call `intent` → `dispatched` | `dispatch` | `acquisition-state.ts:377-419` | run `running`, `owned()`, connection; call `intent` |
| call `dispatched` → `succeeded`/`failed`/`uncertain`/`intent` (rate-limit retry) | publish / fail / prepare | `acquisition-state.ts:493-668` | `uncertain` still accepts a late receipt `:421-467` |
| dataset `collecting` → `published`/`failed` | publish / fail / `closeCollecting` (terminal run or `cancelRun`) | `acquisition-state.ts`, `runs.ts` | — |

Dispatch attempts are insert-only, one `outcome` per ordinal (DB
`uq_si_dispatch_phase`).

### 6.2 Integrations

| Machine | States and transitions | Enforced |
|---|---|---|
| `integration_oauth_grants.status` | ∅ → `connected` `integrations/oauth.ts:228-248`; **any** → `connected` on reconnect `oauth.ts` (keeps the old refresh token when the provider returns none), except `pending_revocation` with a live revocation claim, which refuses `oauth_revocation_in_progress`; `connected`/`needs_reauth` → `pending_revocation` `grants.ts:19-86`; → `revoked` `grants.ts:137-172` (claim + revision + `pending_revocation`); `connected` → `needs_reauth` `grants.ts:203-221` | App; token rotation fenced by claim id, `token_revision`, `connected` `tokens.ts:53-140`; OAuth state single use `oauth.ts:171-182` |
| `integration_sync_runs` | lane §1; deadline release → `queued`; every write behind `#held`; target re-checked per page and at finish `integration-worker.ts:516-575` | DB `ix_integration_sync_runs_active_window` (partial unique) |
| `integration_property_mappings` | one active owner per property | DB `ix_integration_property_mappings_active_owner` |

### 6.3 Discovery, Commerce, providers, source pages

| Machine | States and transitions | Enforced |
|---|---|---|
| `brand_discoveries` (status + stage) | `pending` → `running`/phase → `ready`/review → `project_created`; or `failed`; rerun creates a new row `projects/discovery.ts:212` | App: worker writes fenced `discovery-worker.ts:175-302`; recovery skips `ready`/`project_created` `queue/recovery.ts:125-129`; DB one task per discovery |
| Commerce candidates | `pending` → `approved` ↔ `rejected`, no from-state guard `commerce/decisions.ts:6-31` (by design) | App |
| `commerce_products.lifecycle_state` | `active` ↔ `archived` only through `setProductLifecycle` (`commerce/edits.ts`), each change appending an `edit` observation; setting the current state writes nothing | App project-row lock (`FOR NO KEY UPDATE`) and product row lock |
| `commerce_csv_imports.applied_at` | ∅ → staged (`applied_at` null, `stageImport`, content-hash idempotent) → applied (`applied_at` set once by `applyImport`, `commerce/import.ts`); applying an applied import returns its first result | App project-row lock and import row `FOR UPDATE` |
| `commerce_catalog_revisions` | insert-only: ∅ → revision `n + 1` only when the matching identity's hash differs from revision `n` (`recordCatalogRevision`, `commerce/catalog-revisions.ts`); each new revision enqueues one `commerce_answer_matching` task in the same transaction | DB `uq_commerce_catalog_revisions_number`; App per-project advisory lock, always the last lock its caller takes |
| `commerce_match_passes.mode` | insert-only, terminal at insert: ∅ → `live` (with the answer) \| `backfill` (`commerce/answer-matching.ts`); a repeated derivation inserts nothing; reads take the latest pass per answer (highest revision, then newest) | DB `ck_commerce_match_passes_mode`, `uq_commerce_match_passes_derivation` |
| `provider_connections.last_test_status` | `''` → `ok`/`failed` only while `credential_revision` and `base_url` are unchanged; key rotation resets | App `probes.ts` |
| `source_pages.inspection_state` | `not_inspected`/`stale`/`failed`/`blocked` → `queued` (claim lease) → outcome; `inspected` → `stale` | App fence `claim_expires_at = lease`, unexpired `source-pages/persistence.ts:42-77` |
| `content_angle_runs.outcome` | insert-only, terminal at insert: ∅ → `succeeded` \| `failed`; appended only when one of its three input keys differs from the latest `succeeded` run (a `failed` run never blocks a retry); a task that exhausts its attempts appends `failed` (`task_failed`). Lineages, angles, members and owned matches insert with a `succeeded` run; a lineage's `planned_page_key` is set when the lineage is inserted (`plannedPageKey` of its first label) and never rewritten: lineages are insert-only | DB `ck_content_angle_runs_outcome`; App per-project advisory lock re-checks the keys inside the worker's fenced terminal transaction `content-gaps/refresh.ts` |

## 7. Workspace, auth, public API, Actions and prompts

### 7.1 Identity and access

| Machine | States and transitions | Enforced |
|---|---|---|
| `workspace_invitations` (implicit `accepted_at`, `revoked_at`, `expires_at`) | none/expired → pending (issue `workspaces/invitations.ts:78-148`); pending → pending new token / revoked (`:151-191`); pending → revoked in bulk when the issuer leaves (`workspaces/service.ts:218-228`); pending → accepted + member (`acceptInvitation`, workspace then invitation `FOR UPDATE`, issuer's `users` row `FOR SHARE`, issuer must be active and hold `manage_members`) | DB one live row per email `uq_workspace_invitation_pending_email`; token unique; role never owner `ck_workspace_invitation_role` |
| `workspace_members.role` | create → owner `service.ts:109-126`; non-owner X → Y, removal, leave `:231-283`; owner ↔ admin transfer `:285-326` | DB `ck_workspace_member_role`, `uq_workspace_member_owner`, `uq_workspace_member_owned_user`; never ownerless: App |
| `auth_challenges` (verification, reset) | request → live `auth/challenges.ts:38-106` (upsert nulls `consumed_at`); live → consumed `:152-245` (user + challenge `FOR UPDATE`, bumps `session_version`, reset revokes MCP grants and API keys), password change `:251-297`, Google claim `auth/oauth.ts:285-306` | DB one per (user, purpose) |
| Sessions | JWT `ver` = `users.session_version` on every request `auth/session.ts:144`; bumped by reset, password change, sign-out, operator reset/disable | App |
| `api_keys` | live → revoked (`revoked_at IS NULL`) `api-keys/keys.ts:192-215`; expired by time; every use re-reads key, membership and creator `:248-277` | App |
| MCP OAuth | request → consumed (`completeConsent`, `mcp/oauth.ts`); code minted under the user row `FOR SHARE` with the consenting session's `session_version` → consumed + grant (`authorizationCodeGrant`; replayed code revokes the grant); refresh rotation; grant → revoked; credential reset, password change and sign-out-everywhere-with-disconnect revoke grants and consume unexchanged codes (`revokeGrantsAfterCredentialReset`) | App single-use `consumed_at IS NULL FOR UPDATE` |

### 7.2 Public API idempotency (`api_idempotency`)

The claim, replay and release states are in [public API](public-api.md)
(`public-api/idempotency.ts`). DB unique `(api_key_id, idempotency_key)`.

### 7.3 Actions, prompts and brand facts

| Machine | States and transitions | Enforced |
|---|---|---|
| `actions.status` ∈ `open` (New)/`in_progress`/`dismissed` (Declined)/`implemented` (Done); `effective_status` adds `measuring`/`done` (verified) under Done (`ACTION_STATUS_VIEW`, `config/actions.ts`) | ∅ → `open` by evidence sync `opportunities/action-sync.ts` (project lock; clearing members keeps `last_member_opportunity_ids`); user decisions `ACTION_TRANSITIONS`: `open` → `in_progress`/`dismissed`, `in_progress` → `dismissed`, `dismissed` → `open`/`in_progress`, others 422 (`action-decisions.ts`, Action `FOR UPDATE`; bulk takes the project lock, then its ≤100 rows `FOR UPDATE`, and skips illegal moves); `open` → `in_progress` when a chat starts on the Action (`agent/store.ts` `createChat`, Action `FOR NO KEY UPDATE`); `open`/`in_progress` → `implemented` by declaration `declarations.ts` (project lock, Action `FOR UPDATE`, idempotent; current members or the last set a refresh cleared; baseline the newest snapshot at or before go-live, or none; findings cleared at or before go-live freeze no check and name `resolved_before_snapshot_id`, so that Action stays measuring, never verified); `effective_status` recomputed by `refreshActionStatus` `action-status.ts` on every writer; an Agent output never changes it. | DB one Action per group `uq_actions_project_group`, one declaration per Action, `ck_actions_status`; edges App |
| `prompts.status` ∈ `active`/`archived` | `updatePrompt` `prompts/prompts.ts` (project lock, then the prompt re-read `FOR UPDATE`, binding check), `bulkSetStatus` (project + set lock, binding check); inserts `active` | DB `ck_prompts_status`; App edges; occupancy counts every prompt (B27) |
| `prompt_candidates.disposition` | `pending` → `accepted`/`rejected`/`deleted` `prompts/candidates.ts:183-289` (project + set locks, pending rows `FOR UPDATE`) | DB `uq_prompt_candidate_pending_text`; `pending`/`accepted`/`rejected`/`gate_rejected` `ck_prompt_candidates_disposition` |
| Brand facts | `draft` → `confirmed` → `retired` (terminal), `expected_revision` under project lock `projects/brand-facts.ts:114-200` | DB `ck_brand_fact_status`, `ck_brand_fact_revision_status`; revision unique |