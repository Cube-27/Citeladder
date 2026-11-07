# State-machine fixes

Status: S01–S04 approved for implementation by the owner on 2026-11-07 (the high-priority PRs that
need no owner decision). S05–S12 stay pending until the owner has verified them; S10 and S11 also wait
on owner answers (OQ2, OQ3, OQ1). This document is both the plan and the orchestrator's tracker. The work is 12 scoped pull
requests (S01–S12). Each PR batches a set of rows (the commit-level units, e.g. WS1, BL3), lists the
PRs it depends on, and carries a status the implementor and orchestrator keep current.

Sources, all verified against `main` at `f090d718b` (every cited `path:line` reopened, every SQL guard
re-read and each path traced through retries, lease expiry, crashes around commits and network I/O,
and concurrent requests): seven subsystem state-machine audits (queue leases, audits, billing, Agent,
Site Health and crawl logs, Keyword Research/integrations/Commerce, workspace/Actions/prompts) and the
[state-machine catalogue](../state-machines.md) built from them. Each row says whether its defect is
CONFIRMED (every step traced, no guard stops it) or PLAUSIBLE (reachable only under the named timing or
provider behaviour, kept because the defensive fix is cheap). Findings that did not survive verification
are not listed; the rejected and not-planned ones are in the [appendix](#appendix-not-planned) with the
guard or reason that stops each. Paths are relative to `frontend/services/api/src/` unless they start
with `frontend/`, `docs/` or `migrations/`.

## How the orchestrator uses this document

1. **Unit of assignment is a PR (S01–S12).** The orchestrator assigns one PR to one implementor. The
   implementor commits row by row in the PR's row order, marks each row `done` in the *Rows* table, sets
   the PR's status and link in the *PR tracker* in its tracker commit, gets CI green and comments
   `READY <sha7>`. The orchestrator merges on READY and updates the PR's status to `merged`.
2. **Ready rule.** A PR is ready when every PR in its *Depends on* column is `merged` and none of its
   rows is `blocked`. Row dependencies inside one PR are satisfied by commit order.
3. **Parallel rule.** Ready PRs may run at the same time; the *Order* section lists which ones can.
4. **Migrations.** PRs marked **mig** may add a forward migration, numbered `0014` onwards in merge
   order; only one **mig** PR is open at a time, or a later one renumbers when it rebases. Never edit an
   applied migration and never reset a database.
5. **Size.** A PR that would pass about 4,000 changed lines splits at a row boundary into `Snn-a` /
   `Snn-b`; record the split in *Notes*.
6. **Status values:** `todo` → `in progress` → `in review` → `merged`; `blocked` with a one-line reason
   (the open question) in *Notes*. Do not add progress notes elsewhere.
7. **Scope.** A PR implements exactly its rows and their detail sections under *Work details*. Anything
   new goes into *Notes* or `docs/plans/backlog.md`, not into the PR.
8. **Every PR** follows `CLAUDE.md` (owner inspection first, focused tests only, Review.md self-check),
   updates the owner document whose contract it changes and corrects the affected section of
   `docs/state-machines.md`. No back-compat shims, no data backfills, version constants stay at 1, no new
   lint or style checks, no marketing copy changes. A row that changes what a customer is charged,
   refunded or held records the owner's answer in `docs/billing-decisions.md` first.

## Owner decisions

None recorded yet. The rows below that change billing or product policy wait on these questions; every
other row restores a contract an existing decision or owner document already states. Recommendations
are the reviewer's, not decisions.

| # | Question | Options | Recommendation | Blocks |
|---|----------|---------|----------------|--------|
| OQ1 | (a) A turn the browser closes after it streamed a document is `failed interrupted` and fully refunded under B58 ("nothing saved → not charged"), so a scripted client can read a document and pay nothing. (b) Stop on a turn whose instance already died is charged (cancelled), while waiting for recovery refunds it. | (a) keep B58 as is; charge a client-closed turn like Stop; or save the streamed document and end the turn succeeded with a fixed reply, charged (the B60 precedent for a funding refusal after a document). (b) keep; or a Stop on a run whose lease already expired settles as recovery does (refund). | (a) save the document and end succeeded, charged (B60 precedent); (b) refund when the lease had already expired | AG1 |
| OQ2 | A full refund of an upgrade payment revokes the upgrade's grants (B52 covers only the subscription's current-period payment) but leaves the scheduled upgrade live at Razorpay, so the next cycle bills the upgraded price. | Revert the scheduled change (clear it; push the old price back if already scheduled); treat the upgrade payment as a current-period payment and apply B52 (cancel at once); leave as is. | Revert the scheduled change | BL7 |
| OQ3 | Money collected for a period the subscription no longer grants: (i) a base checkout paid while the abandon sweep cancels it (terminal at first observation with a paid invoice); (ii) a renewal charged on a B52-cancelled subscription before the sweep's cancellation. Both are PLAUSIBLE (timing and Razorpay evidence unverified). | Grant the paid period's bundle until its end; or record the receipt, grant nothing and flag it for an operator refund (the B25/B30 pattern). | (i) grant until the paid end; (ii) stay cancelled, grant nothing, flag for operator refund | BL8 |

## PR tracker

| PR | Title | Rows (commit order) | Depends on | Flags | Status | PR link | Notes |
|----|-------|---------------------|-----------|-------|--------|---------|-------|
| S01 | Credential resets end unexchanged MCP codes; invitation issuer lock | WS1, WS2 | — | | merged | [#653](https://github.com/Cube-27/Citeladder/pull/653) | Security |
| S02 | Credit holds that never settle | BL1, SI1, BL2 | — | | merged | [#654](https://github.com/Cube-27/Citeladder/pull/654) | Money |
| S03 | Lease fences: per-claim audit lease, attempt-fenced heartbeats, poll reclaim | Q1, Q2, AU1 | — | | merged | [#656](https://github.com/Cube-27/Citeladder/pull/656) | Money (duplicate paid dispatch) |
| S04 | Billing webhook, checkout and replay recovery | BL3, BL4, BL5, BL6 | — | | merged | [#655](https://github.com/Cube-27/Citeladder/pull/655) | Money |
| S05 | Keyword Research settlement, cancel and reconnect | SI2, SI3, SI4 | S02 | | todo | | Money; shares `search-intelligence/` with S02 |
| S06 | Audit schedules, repair admission and cost records | AU2, AU3, AU4, AU5 | — | | todo | | Stuck users, abuse bound, cost |
| S07 | Agent turn recovery | AG2, AG3, AG4, AG5 | — | | todo | | Stuck users |
| S08 | Site Health crawl outcomes and inventory | SH1, SH2, SH3, SH4, SH5 | — | | todo | | Data correctness |
| S09 | Public API idempotency outcome; prompt edit under lock | PA1, WS3 | — | | todo | | Data correctness |
| S10 | Refunded upgrades and payments on ended subscriptions | BL7, BL8 | S04 | | blocked | | OQ2, OQ3 |
| S11 | Agent turns closed after streaming a document | AG1 | S07 | | blocked | | OQ1 |
| S12 | Status CHECK constraints; dead `site_urls.discovery_status` | DB1 | S08 | mig | todo | | Migration 0014; open last, alone |

## Order

- **Start together (no dependencies):** S01, S02, S03, S04, S06, S07, S08, S09. Suggested first: S01
  (security), then S02, S03 and S04 (money), then S06 and S07 (stuck users), then S08 and S09.
- **Next, as their dependencies merge:** S05 (after S02).
- **When the owner answers:** S10 (after S04, OQ2 and OQ3), S11 (after S07 and OQ1).
- **Last:** S12 (after S08; the only **mig** PR, so it opens when no other PR is open).

What each merge unblocks:

| Merged | Unblocks (once their other dependencies are merged) |
|--------|-----------------------------------------------------|
| S02 | S05 |
| S04 | S10 |
| S07 | S11 |
| S08 | S12 |

## Rows

Commit-level units. Status: `todo`, `blocked` or `done` (set by the implementor in its PR). *Depends on*
is the row order the PR tracker already respects. Severity is re-rated by real money, security, user and
data impact.

| ID | Row | Depends on | Area | Flags | Status | Commit | Notes |
|----|----|-----------|------|-------|--------|---------|-------|
| WS1 | Credential reset, password change and sign-out-everywhere end unexchanged MCP codes; consent rechecks the session under the user lock | — | `mcp/oauth.ts`, `mcp/oauth-routes.ts`, `auth/challenges.ts` | | done | 0fa36a3 | CONFIRMED, high (security) |
| WS2 | Invitation accept reads its issuer under `FOR SHARE` | — | `workspaces/invitations.ts`, `auth/workspace.ts` | | done | b121728 | PLAUSIBLE (race with operator disable), low |
| BL1 | Project deletion waits for an open Keyword Research hold | — | `entitlements/ledger.ts`, `projects/service.ts` | | done | 46b1faa | CONFIRMED, medium (customer credits held forever) |
| SI1 | A connection or member change at dispatch ends the run, not the task only | — | `search-intelligence/{acquisition-state,executor}.ts` | | done | e9274e2 | CONFIRMED (narrow window), medium-low |
| BL2 | A failed charged call's settlement is retried before the sweep can charge the fallback | — | `billing/metering.ts` | | done | dc0803e | PLAUSIBLE (settle tx error), low |
| Q1 | Audit lane: one lease owner per claim, so a stale slot never matches a re-claim | — | `audits/worker.ts`, `queue/audit-queue.ts` | | done | 8fa5226 | Guard gap CONFIRMED, trigger PLAUSIBLE (heartbeat stalled past the lease); medium (duplicate paid call). Merges queue F2 and audits B7 |
| Q2 | Discovery and Site Health heartbeats carry the claimed attempt; two unfenced Site Health settles take the fence | Q1 | `workers/discovery-worker.ts`, `site-health/{site-task,analyze-task}.ts` | | done | 44b0be1 | PLAUSIBLE, low |
| AU1 | An expired lease while polling a paid provider task charges no attempt | — | `audits/maintenance.ts` | | done | 3926f40 | CONFIRMED (needs repeated process deaths), low |
| BL3 | Exhausted webhook rows with an expired lease are quarantined; a digest conflict never rewrites a completed row | — | `billing/{recovery,webhooks}.ts` | | done | 63ef994 | CONFIRMED (crash on final attempt), medium-low; digest part PLAUSIBLE |
| BL4 | Reopening an abandoned add-on or upgrade never answers 500 | — | `routes/billing.ts` | | done | c6ce97b | CONFIRMED, low |
| BL5 | A plan-change replay reflects a provider refusal | — | `billing/plan-changes.ts` | | done | 80f3fcc | CONFIRMED (crash window), low |
| BL6 | Trial purge skips accounts with a pending checkout | — | `projects/trial-purge.ts` | | done | 2d79396 | PLAUSIBLE (delayed settlement), low |
| SI2 | Settlement waits for calls marked uncertain inside the reporting window | — | `search-intelligence/charges.ts` | | todo | | CONFIRMED (lease lost mid-call), low (unbilled answered call) |
| SI3 | Cancel closes collecting datasets | SI2 | `search-intelligence/runs.ts` | | todo | | CONFIRMED, low |
| SI4 | Reconnect refused while a revocation is in flight | — | `integrations/oauth.ts` | | todo | | PLAUSIBLE (Google grant-wide revocation), low-medium |
| AU2 | A retryable admission refusal reschedules a schedule without counting a failure | — | `workers/audit-scheduler.ts` | | todo | | CONFIRMED, medium (monitoring silently stops) |
| AU3 | Repair audits take the launch lock, active-launch limit and daily task budget | — | `audits/repair.ts`, `audits/admission.ts` | | todo | | CONFIRMED, low-medium |
| AU4 | The funded budget sums the latest projection per execution | — | `audits/admission.ts` | | todo | | PLAUSIBLE (latent: one pricing catalog today), low |
| AU5 | A Google AI Overview failure after a paid submission records its cost | — | `audits/{surface-persistence,result-persistence}.ts` | | todo | | CONFIRMED, low (internal cost, funded budget) |
| AG2 | The browser retries `/run` after 429 and ends a stream that went silent | — | `frontend/lib/agent/live-turns.ts` | | todo | | CONFIRMED, medium; idle part PLAUSIBLE |
| AG3 | A dead turn ends within a minute | AG2 | `agent/{bindings,worker}.ts`, `workers/agent-worker.ts`, `config/model-gateway.json` | | todo | | CONFIRMED, low-medium |
| AG4 | A turn whose member lost access still settles and ends | — | `agent/runtime.ts` | | todo | | CONFIRMED, low |
| AG5 | A paused last call never saves an unmatched `server_tool_use` | — | `agent/runtime.ts` | | todo | | PLAUSIBLE (Messages API replay rule unverified), medium if real |
| SH1 | A crawl that analyzed nothing ends failed; page reruns are never the default crawl | — | `site-health/lifecycle.ts`, `site-health/reads/crawl.ts` | | todo | | CONFIRMED, medium |
| SH2 | Crawl outcome and counters read the latest generation per page; a rerun supersedes an open older generation | SH1 | `site-health/{lifecycle,selection}.ts` | | todo | | CONFIRMED, medium-low |
| SH3 | `inventory_complete` only for an unbounded inventory; removal needs absence from the inventory | SH1 | `site-health/{lifecycle,change-compare,change-snapshot}.ts` | | todo | | CONFIRMED, medium (false "page removed" regressions) |
| SH4 | Change-snapshot predecessor by crawl order under a project lock | SH3 | `site-health/change-snapshot.ts` | | todo | | PLAUSIBLE (timing), low |
| SH5 | A terminally failed internal-link publish ends its run | — | `site-health/{analytics-kinds,internal-link-runs}.ts` | | todo | | PLAUSIBLE, low |
| PA1 | A public API write that failed or crashed answers "outcome unknown", not "in progress" for 24 h | — | `public-api/idempotency.ts`, `config/public-api.json` | | todo | | CONFIRMED, low |
| WS3 | Prompt edit reads the prompt under the project lock | — | `prompts/prompts.ts` | | todo | | CONFIRMED, low |
| BL7 | Full refund of an upgrade payment (OQ2) | — | `billing/settlement.ts`, `billing/plan-changes.ts` | | blocked | | CONFIRMED, medium; OQ2 |
| BL8 | Payments landing on a terminal or B52-cancelled subscription (OQ3) | BL7 | `billing/settlement.ts`, `billing/recovery.ts` | | blocked | | PLAUSIBLE, medium; OQ3 |
| AG1 | Turn closed after streaming a document; Stop on a dead turn (OQ1) | — | `agent/{worker,runtime,store}.ts` | | blocked | | CONFIRMED, medium; OQ1 |
| DB1 | CHECK constraints on status columns; drop `site_urls.discovery_status` | — | `migrations/0014_*.sql`, `site-health/{admission-writes,discover-task,analysis-rows}.ts` | mig | todo | | Hardening; site-health F6 CONFIRMED (written, never read) |

## Work details

Each section lists, per row: the verified path, the change, and the tests that protect it. Tests that
involve leases, claims, locks or concurrency run at the real PostgreSQL boundary (`pnpm test:api
<files>`). Tests follow `principle-test-behavior-not-implementation`: call the code the way its users
do and assert the observed rows, responses and balances against literal expected values.

### Q. Queue leases

- **Q1 — per-claim audit lease.**
  - Diagnosis. `ownedAuditTask` (`queue/audit-queue.ts:82-104`) checks `lease_owner`, held status and
    expiry, never the claim. The worker's owner is fixed (`audits/worker.ts:67`) and shared by every
    drain slot (`:103-138`). The audit lane charges no attempt at claim and none for an uncertain reclaim
    (`queue/task-queue.ts:135-145`, `audits/maintenance.ts:188-192`), so `attempt_count` cannot tell two
    claims apart; adding it to the fence (the audits report's fix) is not enough. Path: slot 1's
    heartbeat stalls past the 120 s lease (`maintainLease` skips while a renewal is pending,
    `queue/heartbeat.ts:22`); periodic maintenance reclaims T (`maintenance.ts:145-231`); a drain refill
    with the same owner claims T; slot 1's heartbeat (`audit-queue.ts:196-198`), dispatch recheck
    (`worker.ts:192-200`) and persistence (`result-persistence.ts:90-91`) all pass for slot 2's lease.
    Both dispatch a paid call; the first terminal writer wins.
  - Change. Each `claim` call writes `lease_owner = <worker owner>:<8-hex nonce>` (stays within
    `varchar(64)`; no migration), and the worker uses the claimed row's `lease_owner` for heartbeat,
    `markRunning`, `ownedAuditTask`, parks and persistence. Nothing else changes in the lane.
  - Tests. `audit-queue.test.ts` / `audit-worker.test.ts` (PostgreSQL): one worker claims T, the lease
    expires, maintenance reclaims it, the same worker claims T again; the first claim's heartbeat returns
    false and its success persistence writes nothing; the second claim's success writes exactly one
    artifact and one prompt-run debit.
- **Q2 — attempt-fenced heartbeats.**
  - Diagnosis. Discovery and Site Health pass no attempt to `heartbeat`
    (`workers/discovery-worker.ts:104`, `site-health/site-task.ts:426`), so a stale slot keeps renewing a
    re-claimed lease (their terminal writes are fenced; recovery charges 1, so the attempt does change).
    The Site Health deferred settle (`analyze-task.ts:347`) and the conflict fallback
    (`site-task.ts:413-415`) write through `owned()`, which matches `lease_owner` only.
  - Change. Pass `claimed.attempt_count` to both heartbeats; route both settles through `lockSiteTask`'s
    fence.
  - Tests. `discovery.test.ts`, `site-health-task-runner.test.ts` (PostgreSQL): after reclaim and
    re-claim by the same owner, the old claim's heartbeat returns false and its deferred settle leaves
    the live claim's row unchanged.

### AU. Audits

- **AU1 — poll-phase reclaim.**
  - Diagnosis. A paid submission sets `provider_task_id` and charges the attempt
    (`audits/surface-persistence.ts:150-151`). If the process dies during a poll, `#reclaim` computes
    `uncertain` only when `provider_task_id` is empty (`maintenance.ts:188-190`), charges another attempt
    and fails the task at `max_attempts` with `max_attempts_exceeded`, abandoning a paid, retrievable
    result.
  - Change. A reclaimed task with a `provider_task_id` (parent active) parks in
    `awaiting_provider_result` without an attempt charge; the adapter's recovery deadline still bounds
    it.
  - Tests. `audit-maintenance.test.ts` (PostgreSQL): a leased task with a provider task id and an expired
    lease, reclaimed three times, is `awaiting_provider_result` with its attempt count unchanged.
- **AU2 — retryable refusals do not disable schedules.**
  - Diagnosis. `planClaim`'s catch (`workers/audit-scheduler.ts:110-129`) counts every error, so the
    active-launch 429 (`audits/admission.ts:46-49`, three active launches, `config/abuse.ts`) or a daily
    budget 429 disables the schedule after five tries 300 s apart. `docs/visibility-prompt.md:520-523`
    describes disabling for admission errors the owner can act on (ended trial, exhausted budget).
  - Change. An `ApiError` whose `isRetryable()` is true (`errors.ts:85`) releases the lease and sets
    `next_run_at = at + retry-after` without touching `failure_count`, `enabled` or `last_error`.
  - Tests. `audit-scheduler.test.ts` (PostgreSQL): with three active launches, five scheduler passes
    leave the schedule enabled with `failure_count` 0; a 403 `prompt_runs_exhausted` still counts.
- **AU3 — repair admission.**
  - Diagnosis. `createRepairAudit` (`audits/repair.ts:16-230`) inserts a `queued` audit and tasks with
    only `reservePromptRuns`; it skips the `audit-enqueue` lock and `reserveAuditCapacity` (active
    limit, daily task budget). Each distinct failed-task subset gets a new `repair_key` (`:72-87`), so
    concurrent children are unbounded, overlapping subsets re-run the same slots, and children count
    against the active limit for normal launches.
  - Change. Take the same lock and `reserveAuditCapacity` (abuse controls only; the plan's manual-run
    allowance is not applied, so no plan-gating change); refuse 409 when a non-terminal repair child
    already covers any selected source task.
  - Tests. `audit-reads-repair.test.ts` (PostgreSQL): with three active launches a repair answers 429;
    a second repair overlapping a live child's tasks answers 409; a disjoint repair is created.
- **AU4 — funded budget counts each execution once.**
  - Diagnosis. `admitAudit` sums every `execution_cost_projections` row (`audits/admission.ts:135-146`);
    repricing appends one row per pricing version (`audits/repricing.ts`, `audits/costs.ts:142-187`).
    Latent: `config/costs.json` has one catalog. `internal_costs` (`migrations/0012_internal_costs.sql`)
    and `audits/performance.ts:52` already take the latest per artifact.
  - Change. Sum the latest projection per `raw_response_artifact_id`, as `internal_costs` does.
  - Tests. `audit-admission.test.ts` (PostgreSQL): an execution with two projection rows counts its
    latest once toward the funded month.
- **AU5 — AI Overview paid failure cost.**
  - Diagnosis. The submission cost is kept only in task metadata (`surface-persistence.ts:138-142`); a
    later non-observation result goes through `persistOverviewFailure` with an `observation` record
    (`surface-persistence.ts:86-111`), so `recordFailedAttempt` writes no failure artifact and no cost
    projection (`result-persistence.ts:322-345`). The funded budget and `internal_costs` miss the paid
    request; the LLM scraper path already writes a failure artifact.
  - Change. A search-AI failure after a paid submission writes a failure artifact carrying the reported
    submission cost and appends its projection, as the scraper path does.
  - Tests. `audit-surface-persistence.test.ts`: a submitted task whose poll returns an unusable overview
    ends failed with one projection equal to the submission charge and one `internal_costs` row.

### BL. Billing and credits

- **BL1 — Keyword Research holds block project deletion.**
  - Diagnosis. `confirmRun` holds credits with `owner_settled = true` (`search-intelligence/runs.ts:84-93`,
    `billing/metering.ts:234-246`). `deleteProject` (`projects/service.ts:452-464`) refuses only when
    `projectHoldsReservations` (`entitlements/ledger.ts:465-505`) finds `audit`, `agent` or `site_crawl`
    holds. Deletion cascades the run (`0001:6408`, `0007:242`); `platform_calls` keys only to the
    workspace (`0001:5811`); `settleResearchCharges` inner-joins the run (`charges.ts:75-85`) and
    `settleAbandonedCalls` skips owner-settled holds (`metering.ts:424`). The hold stays reserved forever
    and the workspace never passes trial purge's open-reservation filter (`projects/trial-purge.ts:73-83`).
  - Change. `projectHoldsReservations` also covers `platform_call` holds of the project's
    `search_intelligence_runs.platform_call_id`; deletion answers the existing 409 until the run ends and
    settles.
  - Tests. `projects.test.ts` (PostgreSQL): a confirmed managed run → delete answers 409
    `project_work_running`; after cancel and settlement the delete succeeds and the workspace holds no
    reserved units.
- **BL2 — failed call settlement retry.**
  - Diagnosis. `settleHeld` swallows a failing `settleCall` (`metering.ts:355-365`); the row stays
    `reserved`, and after 900 s `settleAbandonedCalls` calls `settleCall(db, id, null, false)` (`:429`),
    charging the unknown-usage fallback for a call that failed.
  - Change. `settleHeld` retries the settlement once before logging and leaving it to the sweep.
  - Tests. `metering.test.ts` (PostgreSQL): a provider failure whose first settle transaction errors
    ends `failed` with 0 credits debited.
- **BL3 — exhausted webhook rows.**
  - Diagnosis. The claim increments `attempt_count` (`billing/recovery.ts:288-301`) and selects only
    `attempt_count < webhook_max_attempts` (`:278`). A process that dies during the final attempt, before
    the catch (`:379-394`) or the exhausted update (`:399-411`), leaves the row `pending` at the maximum,
    never claimed or quarantined; a redelivery with the same digest is a no-op (`webhooks.ts:133-148`). A
    `refund.processed` applies only through this path, so its credit note, B52 revocation and
    cancellation are lost silently. Separately, a digest conflict quarantines any prior row, including a
    `completed` one (`webhooks.ts:141-146`).
  - Change. The recovery pass quarantines `pending` rows at the maximum whose lease expired, with
    `attempts_exhausted`; the digest-conflict update applies only to `pending` rows (a completed row keeps
    its state; the 400 stays).
  - Tests. `billing.test.ts` (PostgreSQL): a pending row at the maximum with an expired lease is
    quarantined by the next pass; a digest conflict against a completed row leaves it completed.
- **BL4 — reopen without 500.**
  - Diagnosis. The signed callback reopens an abandoned add-on or upgrade to `pending`
    (`routes/billing.ts:326-352`) without regard to `uq_pending_activation_one_pending_addon` /
    `_upgrade` (`0001:5201, 5205`); with a newer pending row for the same key the update raises a unique
    violation (500). A late capture still settles through the webhook's `late` path
    (`settlement.ts:285-289`).
  - Change. When another row of the same key is pending, leave the abandoned row as it is and answer its
    activation view (the webhook settles the capture).
  - Tests. `billing.test.ts` (PostgreSQL): abandoned add-on plus a newer pending one → the callback
    answers 200 and the abandoned row is unchanged.
- **BL5 — plan-change replay after refusal.**
  - Diagnosis. A downgrade commits the `idempotency_records` row (`completed`, status `requested`) with the
    scheduled change (`billing/plan-changes.ts:54-84`); after commit `pushChange` records
    `provider_rejected` (`:326-365`) and a separate statement deletes the record (`:307-320`). A crash
    between them makes a same-key retry answer `requested` (`:112-130`) for a refused change.
  - Change. A replayed downgrade whose subscription's scheduled change from this key is
    `provider_rejected` deletes the record and proceeds as a fresh request, as the post-refusal retry
    already does.
  - Tests. `billing.test.ts` (PostgreSQL): with the record present and the change refused, a retry with
    the same key re-sends the change to the provider fake.
- **BL6 — purge waits for pending checkouts.**
  - Diagnosis. `stillPurgeable` checks only `trial_expired` access (`projects/trial-purge.ts:118-128`);
    the narrowing query ignores `pending_activations`. A returning customer who pays while settlement is
    delayed can lose their projects before the plan grant lands.
  - Change. The narrowing query and `stillPurgeable` skip accounts with a `pending` activation.
  - Tests. `projects.test.ts` (PostgreSQL): an expired trial past retention with a pending base checkout
    keeps its projects.
- **BL7 — refunded upgrade (blocked, OQ2).**
  - Diagnosis. `settleUpgrade` sets `scheduled_change` `requested` (`settlement.ts:618-638`) and
    `pushChange` schedules it at Razorpay. A full refund of that payment reaches `endRefundedPayment`
    with `subscription_id` null (`settlement.ts:698-715`): it revokes the `activation:` grants and
    returns. Nothing clears the scheduled change; at cycle end `effectiveTerms` sees the new price
    (`:449-458`) and the subscription renews on the upgraded terms.
  - Change. Per OQ2 (recommended: clear the scheduled change and push the current price back when it
    was already scheduled). Record the answer as a B-entry.
  - Tests. `billing.test.ts` (PostgreSQL): upgrade, push, full refund → the next renewal settles at the
    original price and terms.
- **BL8 — payments on an ended subscription (blocked, OQ3).**
  - Diagnosis. (i) The abandon sweep cancels a base subscription at Razorpay (`recovery.ts:184-193`); if
    the customer paid meanwhile and the re-read shows a terminal status with a matching paid invoice,
    `settleBase` returns false for a non-granted status (`settlement.ts:142-143`) and the row stays
    `pending`, blocking a new base purchase (`purchases.ts:223`); renewals have the same root (no bundle
    when the first evidence is terminal, `:374`). (ii) After a B52 cancellation a renewal charged before
    the sweep's cancel moves the row back to `active` (`settlement.ts:459-479`). Razorpay's evidence for a
    just-cancelled subscription is unverified.
  - Change. Per OQ3; record the answer as a B-entry.
  - Tests. `billing.test.ts` (PostgreSQL) with the provider fake returning each evidence shape.

### AG. Agent

- **AG2 — 429 retry and silent streams.**
  - Diagnosis. `/run` answers 429 when the instance's interactive slots are full or stopping
    (`http/interactive-slots.ts:28-32`, `routes/agent.ts`). `startLiveTurn`
    (`frontend/lib/agent/live-turns.ts:126-144`) never reads `response.ok`, parses the JSON error as SSE,
    marks the turn disconnected and never re-posts (`turns.has(runId)`). The run stays `queued`; the
    runner ends it at its next tick (every 10 min, `infra/gcp/variables.tf:169-173`) plus
    `unclaimed_grace_seconds` as `interrupted` with the "page closed" reply. `docs/agents.md:401-403`
    already says "the queued turn waits for the browser's retry". A stream with no frame shows streaming
    indefinitely (polling is off while connected, `use-chat-turns.ts:28-33`).
  - Change. On 429 honour `Retry-After` and re-post `/run` (a claimed or ended run answers done, so a
    re-post is safe); on any other non-2xx end the live turn and let the persisted read show the run.
    Abort the stream when no frame (keep-alives included) arrives for twice `stream_heartbeat_seconds`.
  - Tests. `frontend/lib/agent/live-turns.test.ts` (fake fetch and timers): 429 with `Retry-After: 1`
    then a stream → a second POST after one second and the streamed reply rendered; a silent stream
    disconnects after the idle bound.
- **AG3 — dead turns end within a minute.**
  - Diagnosis. The Agent lease is `execution_timeout_seconds + lease_margin_seconds` = 660 s
    (`agent/bindings.ts:44`, `config/model-gateway.json:35-46`) although the heartbeat renews every 20 s;
    `AgentWorker.nextDue` looks only at unclaimed runs (`workers/agent-worker.ts:68-80`). After an
    instance crash the chat is blocked (`requireIdle`) for up to the lease plus a tick. In-process, when
    the heartbeat aborts, `runAgentOnce` skips `fail` (`agent/worker.ts:39-43`) and the run waits the
    same way.
  - Change. Size the Agent lease to a small multiple of the heartbeat in config; `nextDue` also returns
    the earliest `lease_expires_at` of held runs; `runAgentOnce` calls `runtime.fail(lease,
    'interrupted')` when only the heartbeat aborted (the fence decides).
  - Tests. `agent-runtime.test.ts` (PostgreSQL): a running run whose heartbeat stops is ended
    `failed interrupted` and refunded by the lane within the new lease; `nextDue` returns a held run's
    expiry.
- **AG4 — `fail()` under lost access.**
  - Diagnosis. `fail` authorizes the member for every code except `access_revoked`
    (`agent/runtime.ts:709-734`); a member removed mid-turn whose tab then closes makes `authorize` throw,
    rolling back the settlement and terminal write; the error is rethrown and the run waits for lease
    expiry.
  - Change. When authorization fails inside `fail`, still settle, refund and terminalize; skip only the
    summary and reply.
  - Tests. `agent-runtime.test.ts` (PostgreSQL): remove the member, interrupt the turn → run `failed`,
    debits refunded, no reply appended.
- **AG5 — paused last call.**
  - Diagnosis. `searchAllowance` offers at least one search when one was waiting, even on the last call
    (`agent/runtime.ts:133-137, 319`); a `pause_turn` on the last call goes straight to `finish`
    (`:349-352`), saving a transcript that ends in an unmatched `server_tool_use`, replayed on every later
    turn. Whether the Messages API rejects that replay is unverified.
  - Change. Before saving, drop a trailing unmatched `server_tool_use` from the last assistant message.
  - Tests. `agent-runtime.test.ts` with a fake transport returning `pause_turn` on the last call: the
    saved transcript has no unmatched `server_tool_use` and the next turn's request pairs every tool use.
- **AG1 — closed tab after a streamed document (blocked, OQ1).**
  - Diagnosis. `save_document` streams the full body as `document_delta` (`agent/stream.ts`); the
    document is staged until `finish`. A closed tab aborts the request signal (`routes/agent.ts`),
    `runAgentOnce` calls `fail(lease, 'interrupted')` (`agent/worker.ts:41-43`) and `settleFailed`
    refunds every debit (B58), the document call included. Stop on a run whose instance died is
    `cancelled` and charged (`agent/store.ts:304-333`) while recovery refunds.
  - Change. Per OQ1; record the answer as a B-entry.
  - Tests. `agent-runtime.test.ts` (PostgreSQL): a turn that staged a document and is then interrupted
    ends as OQ1 decides, with the ledger balance asserted.

### SH. Site Health

- **SH1 — nothing analyzed is a failure; reruns are not the default.**
  - Diagnosis. A page rerun starts with `discovered_url_count = 1` (`site-health/planner.ts:210-214`). When
    its analyze task fails terminally, `fullyFailed` is false because discovery did not fail
    (`lifecycle.ts:133-136`), `analysisOutcome` is `failed` (`:147-152`) but `terminalize` sets
    `partially_completed` (`:235-238`); a full crawl whose root succeeded and every analysis failed ends
    the same way. `resolveUsableCrawl` (`reads/crawl.ts:78-99`) picks the newest usable crawl without
    excluding `page_rerun`, so every page rerun (successful or not) becomes the default Overview, AEO
    readiness and Architecture crawl (`reads/projections.ts:135, 249, 324`), against
    `docs/site-health.md:45-48` ("never compared as a site crawl").
  - Change. A drained crawl with applicable analyses and none succeeded ends `failed`; the default crawl
    excludes page reruns (an explicit `crawl_id` still reads one).
  - Tests. `site-health-finalize.test.ts` (PostgreSQL): a rerun whose analysis fails ends `failed`; a full
    crawl with every analysis failed ends `failed`. `site-health-reads.test.ts`: after a successful rerun
    the default Overview reads the earlier site crawl.
- **SH2 — latest generation per page.**
  - Diagnosis. A rerun during an active crawl enqueues generation `max + 1` (`selection.ts:380-394`).
    `taskSummary` and `failedUrlCount` count every analyze row (`lifecycle.ts:68-114`), so a failed
    generation 0 and a successful generation 1 read `partially_completed` and "1 failed", while
    `persistTerminalCounters` uses the latest generation (`reads/crawl.ts:398-404`) and reports 0 failed;
    two successful generations count the page twice (`lifecycle.ts:126`). An older generation still in
    flight can commit last and become current (`analysis-rows.ts:344-351`).
  - Change. Both counts read the latest generation per `url_hash` (the `ROW_TASK_ORDER` rule); the rerun
    cancels a non-terminal older generation of the same page in its transaction (its later commit then
    fails the fence).
  - Tests. `site-health-finalize.test.ts` (PostgreSQL): generation 0 fails, generation 1 succeeds →
    crawl `completed`, `failed_url_count` 0, `analyzed_url_count` 1; a rerun while generation 0 is leased
    cancels it and generation 0's commit writes nothing.
- **SH3 — bounded inventories are not complete.**
  - Diagnosis. `reconcileDiscovery` sets `inventory_complete = !discoveryFailed` once discovery drains
    (`lifecycle.ts:136-143`), ignoring a reached page limit, a pending frontier, `sample_completed` and
    deselection (`coverage.ts:34-48` already computes those reasons). Two `completed` crawls with
    `inventory_complete` make a complete pair (`change-snapshot.ts:61`), and `compareCrawls` emits a
    removal for every page analyzed in A but not B (`change-compare.ts:261-265`), which reaches
    Opportunities through change hits.
  - Change. `inventory_complete` is false whenever coverage has a partial reason; a removal is emitted
    only for a page absent from B's observed inventory, not merely unanalyzed.
  - Tests. `site-change-intel.test.ts` (PostgreSQL): B hits its page limit or deselects X → no removal
    for X; a page missing from B's complete inventory still reads removed.
- **SH4 — snapshot predecessor.**
  - Diagnosis. `supersedes_id` is the project's newest snapshot by `created_at`, read without a lock
    (`change-snapshot.ts:372-380`); a delayed or concurrent `change_intel` can supersede a later crawl's
    snapshot or fork the chain. Delays long enough to matter are unverified.
  - Change. Take a project-level advisory lock and choose the predecessor by crawl B's `created_at`.
  - Tests. `site-change-intel.test.ts` (PostgreSQL): crawl 1's `change_intel` running after crawl 2's
    leaves crawl 2's snapshot current with a linear chain.
- **SH5 — internal-link publish compensation.**
  - Diagnosis. `internal_link_publish` has no compensator (`site-health/analytics-kinds.ts:6-9`); if it
    fails terminally the run stays `queued`/`running` and new runs answer 409
    (`internal-link-runs.ts:134-140`) until the person cancels.
  - Change. Register a compensator that ends the run `failed` with the task's error code.
  - Tests. `internal-links.test.ts` (PostgreSQL): a publish task failed and compensated → run `failed`; a
    new run is admitted.

### SI. Search Intelligence and integrations

- **SI1 — dispatch-time connection change.**
  - Diagnosis. `dispatch` returns false when the connection or the actor's `run` permission no longer
    holds (`search-intelligence/acquisition-state.ts:377-388`, `connection` at `:183-186`), e.g. a BYOK key
    rotated, a connection deactivated, or the shared platform connection paused by an audit
    (`audits/execution-context.ts`). `sendPaid` returns `stop` (`executor.ts:59-61`), `acquire` returns
    without `finish`, the analytics task succeeds, `reconcileResearch` only picks failed or cancelled tasks
    (`maintenance.ts:20-21`) and `settleResearchCharge` waits for an ended run (`charges.ts:34`). The run
    stays `running` with its hold; new confirmations answer `acquisition_in_progress`.
  - Change. On a failed connection or member check, `dispatch` ends the run as `prepare` does
    (`failChangedConnection`) before returning false.
  - Tests. `search-intelligence-acquisition.test.ts` (PostgreSQL): rotate the key between `prepare` and
    `dispatch` → run `failed` `connection_changed`, hold settled, a new run can be confirmed.
- **SI2 — late receipts are billed.**
  - Diagnosis. `sendLive` is not tied to the lease signal (`executor.ts:63`). Worker A loses its lease
    mid-call; B's `prepare` marks the call and run `uncertain` (`acquisition-state.ts:299-329`); B's
    settlement waits only for `dispatched` calls (`charges.ts:44-54`) and settles without A's call; A's
    response is then saved into the `uncertain` call (`:421-467`) and never billed, although B41 bills
    every request that succeeded.
  - Change. Settlement also waits for `uncertain` calls dispatched within twice the provider timeout.
  - Tests. `search-intelligence-managed.test.ts` (PostgreSQL): an uncertain call inside the window holds
    settlement; once its receipt is saved the charge includes it; past the window it settles without it.
- **SI3 — cancel closes datasets.**
  - Diagnosis. `cancelRun` (`runs.ts:149-180`) never calls `closeCollecting`; `prepare`, `publish` and
    `finish` stop on a non-running run, and `reconcileResearch` looks only at queued or running runs, so
    the run's datasets stay `collecting` (readers filter `published`).
  - Change. `cancelRun` closes collecting datasets in its transaction.
  - Tests. `search-intelligence.test.ts` (PostgreSQL): cancel a running run → its datasets `failed`.
- **SI4 — reconnect during revocation.**
  - Diagnosis. Disconnect sets `pending_revocation` (`integrations/grants.ts:19-86`); the dispatcher claims
    it and decrypts the old refresh token (`workers/integration-dispatcher.ts:109-126`). A reconnect
    overwrites the row with no status guard (`integrations/oauth.ts:207-226`) and keeps the old refresh
    token when the provider returns none; the dispatcher then revokes the old token and
    `markGrantRevoked` no-ops (`grants.ts:137-172`). If Google revokes the client's whole grant (or the
    kept token is the revoked one) the next sync goes `needs_reauth`.
  - Change. `completeOAuth` answers 409 while the grant is `pending_revocation` with a live revocation
    claim; the browser shows the refusal as a retry.
  - Tests. `integration-oauth.test.ts` (PostgreSQL): a claimed `pending_revocation` grant refuses
    reconnect with 409; after `revoked` a reconnect stores only the new tokens.

### WS. Workspace, auth and prompts

- **WS1 — MCP codes end with the credentials.**
  - Diagnosis. `completeConsent` inserts `mcp_authorization_codes` (`mcp/oauth.ts:297-315`, TTL ≤ 600 s,
    `config/mcp.ts:21-26`). Password reset (`auth/challenges.ts:152-245`), password change (`:251-297`)
    and sign-out-everywhere with disconnect (`auth/service.ts:142-160`) call `revokeDelegatedAccess` →
    `revokeGrantsAfterCredentialReset` (`mcp/oauth.ts:113-128`), which revokes only
    `mcp_oauth_grants`; the only writer of the codes is the exchange (`:395`).
    `authorizationCodeGrant` (`:340-417`) checks unconsumed, unexpired, PKCE, redirect and an active,
    verified user, never a credential change, so a code minted with a stolen session before the reset
    mints a fresh grant whose refresh token outlives the recovery. Consent also checks the session at
    request start (`mcp/oauth-routes.ts:321-335`), not under a lock, so a reset committing in between
    leaves a fresh code.
  - Change. `revokeGrantsAfterCredentialReset` also consumes the user's unconsumed codes (and pending
    authorization requests); `completeConsent` locks the user row `FOR SHARE` and refuses when its
    `session_version` differs from the consenting session's.
  - Tests. `mcp-oauth.test.ts` (PostgreSQL): mint a code, then reset the password (and, separately,
    change it and sign out everywhere) → exchanging the code answers `invalid_grant` and no grant row
    exists; consent with a session older than the user's `session_version` mints no code. Update
    `docs/mcp.md` where it lists what a credential reset revokes.
- **WS2 — invitation issuer lock.**
  - Diagnosis. Accept locks the workspace and invitation (`workspaces/invitations.ts:194-217`) and checks
    the issuer with `memberCan` (`:235-239`), an unlocked read of `users.is_active`
    (`auth/workspace.ts:80-99`); operator disable locks only the user row
    (`workspaces/account-manager.ts:578-594`). A disable committing between the read and the accept
    commit admits a member through a disabled issuer, against `docs/workspace-access.md` (issuer must be
    active).
  - Change. Accept reads the issuer's `users` row `FOR SHARE` before the check.
  - Tests. `workspaces.test.ts` (PostgreSQL): with the operator's disable transaction holding the user
    row, the accept waits; after the disable commits, the accept is refused.
- **WS3 — prompt edit under lock.**
  - Diagnosis. `applyPromptUpdate` reads the prompt unlocked before the project lock
    (`prompts/prompts.ts:323-331`) and uses that row's `topic_id`, `text` and `status`; a concurrent
    re-file of an archived prompt to another topic commits first, then the activation binds against the
    stale topic (`:334-341`) and writes only `status` (`:353-357`), leaving an active prompt unbound to its
    current topic (the rule `bulkSetStatus` enforces under lock, `:385-408`).
  - Change. Take the project lock first and re-read the prompt `FOR UPDATE` before deciding.
  - Tests. `prompts.test.ts` (PostgreSQL): with a transaction holding the project lock that re-files the
    prompt to an unbindable topic, a concurrent activation is refused with the binding error after the
    re-file commits.

### PA. Public API

- **PA1 — outcome unknown, not in progress.**
  - Diagnosis. A non-API throw or a 5xx keeps the claim with `status_code` null
    (`public-api/idempotency.ts:58-71`), as does a crash before the completion update (`:72-78`); a retry
    answers 409 "still in progress", `retryable: true` (`:103-107`) until the 24 h purge
    (`config/public-api.json:13`). Keeping the claim is deliberate (the write may have committed); the
    signal is wrong.
  - Change. Record a failed outcome (500, non-retryable `idempotency_outcome_unknown`) instead of leaving
    the claim open; a claim with no outcome older than a configured age answers the same.
  - Tests. `public-api.test.ts` (PostgreSQL): a write whose handler throws, retried with the same key,
    answers 409 `idempotency_outcome_unknown` with `retryable: false`; a fresh in-flight claim still
    answers "in progress".

### DB. Schema hardening

- **DB1 — status CHECKs; dead column.** (S12, migration `0014`.)
  - Diagnosis. No status column outside `platform_calls`, roles, brand facts and evaluation outcomes has
    a CHECK (0001–0013); every vocabulary is enforced only by writers. `site_urls.discovery_status` is
    written on every sighting (`site-health/admission-writes.ts:107,128`, `discover-task.ts:146,249`,
    `analysis-rows.ts:215`), left `running` for cancelled or never-fetched URLs, and read nowhere.
  - Change. One forward migration adds `CHECK (… IN (…)) NOT VALID` then `VALIDATE CONSTRAINT` for the
    lane tables' `status` (`config/queue.json`, plus `pending_reservation` for `audit_tasks`),
    `audits.status`, the three `site_crawls` sub-states, `search_intelligence_runs/_calls/_datasets`
    status, `pending_activations.status`, `billing_webhook_events.processing_state`,
    `billing_subscriptions.status`, `integration_oauth_grants.status`, `actions.status`,
    `prompts.status` and `prompt_candidates.disposition`, each list taken from its owning config or
    contract; and drops `site_urls.discovery_status` with its writes. A production row outside a list
    fails the migrate job in its transaction (nothing changes, the release stops); no backfill.
  - Tests. `schema-constraints.test.ts`: each constrained column refuses an unknown value and accepts
    every value its owner declares; `pnpm migrate` and `pnpm db:types:check` from an empty database.

## Appendix: not planned

Merged duplicates: queue F2 and audits B7 are Q1; queue F1 and billing #4 are BL1.

| Finding | Verdict | Guard or reason |
|---------|---------|-----------------|
| Audits: `repairOwnedCompletion` releases the prompt run on success (`maintenance.ts:59`) | REJECTED | Unreachable: success writes the artifact and `succeeded` in one transaction (`result-persistence.ts:85-163`) and failures write evidence and status together (`:292-345`), so no held task carries a result |
| Agent: "Retry send" reuses the idempotency key | REJECTED | Intended: `retrySubmission` repeats a failed submission idempotently; `resend` mints a new key (`frontend/components/agent/use-chat-turns.ts`) |
| Agent F4: Stop lets the in-flight call run up to 20 s and charges it | Not planned (by design) | B58 charges a stopped turn; the heartbeat (20 s) aborts the call; an aborted call's cost is recorded as unknown (NULL), not zero; the cancel can land on another instance, so an in-process abort cannot be relied on |
| Audits B3 (b, c): a result dropped after a cancel or lost lease records no cost | Not planned (CONFIRMED, internal cost only) | Recording it would write evidence for a task the worker no longer owns, which the ownership fence exists to refuse; customers are not charged |
| Audits B5: a finalize that throws keeps the audit `running` | Not planned (PLAUSIBLE) | No deterministically throwing input found; each pass logs `audit_maintenance_finalize_failed` and retries |
| Audits: a manual launch without an Idempotency-Key can double-submit | Not planned (PLAUSIBLE) | Bounded by the active-launch limit and the daily task budget; browser double-submit behaviour unverified |
| Keyword Research #2: a paid DataForSEO 200 we reject is recorded as a free failure | Not planned (PLAUSIBLE) | Depends on DataForSEO billing a response we reject; bounded to one call per dataset (`acquisition-state.ts:646-652`); never billed to the customer |
