# CiteLadder security hardening plan

Date: 3 October 2026

Status: slices 1–7 implemented on `codex/security-hardening`; PR review and CI
pending. Slice 7 includes only the log exclusion and runbook text. Spend-cap
configuration, Terraform apply and deployment remain separate owner assignments.

## Scope

The plan fixes confirmed application defects that affect user data privacy,
unauthorized access and surprise GCP billing. Each finding below was checked
against the code on `main` on 3 October 2026. The plan keeps the current
topology: Cloudflare Workers, a scale-to-zero Cloud Run API (`max_instance_count
= 2`), the private PostgreSQL VM, the existing queues and the `*/10 * * * *` tick.

Binding owners: [invariants](../invariants.md), [workspace access](../workspace-access.md),
[MCP](../mcp.md) and [connected data](../integrations-traffic-analytics.md).

## Findings, in priority order

| # | Finding | Risk | Confirmed in code |
|---|---|---|---|
| 1 | Any workspace member can list Google/Bing properties | Privacy, unauthorized access | `GET /integrations/{id}/properties` has no capability. It refreshes the OAuth token and returns every property the connected Google account can see, which can include unrelated sites. |
| 2 | OAuth completion ignores the user's current role | Unauthorized access | `completeOAuth` checks only membership and active status. A user demoted after starting the flow can still store a credential grant. |
| 3 | MCP `/authorize` allocates unbounded rows | Outage (DB disk), unauthenticated | Each anonymous `GET /authorize` for any registered client inserts a `mcp_authorization_requests` row. There is no rate limit and no expired-row cleanup. |
| 4 | One Cloud Run job start per committed request | Billing | `observeCommittedWork` calls `runnerStarter` after every request that writes work. Extra jobs pay for startup plus up to 15 s waiting for the drain lock before exiting. Needs a signed-in user. |
| 5 | Unbounded on-demand integration syncs | Billing, provider quota | A `run` user can queue a sync for every distinct date window. Only an identical active window is deduplicated. |
| 6 | Robots fetch before redirect scope check | Minor | `PageAcquirer` fetches robots.txt for a redirect target in `gate` before `admit` rejects it as out of scope. The target is public only, because the DNS/private-address checks still apply. |

### Assessed and not planned

- **Direct Cloud Run URL is publicly invocable** (`invoker_iam_disabled = true`).
  The origin token rejects these requests before any data access or provider
  call, so this is a billing risk only. Compute is capped at two instances, but
  the per-request fee and request-log charges have no cap. A sustained flood
  could cost roughly $85–800/day. Google IAM in front of the API would stop this
  traffic, but it needs a long-lived service-account key stored in Cloudflare.
  The owner declined that on 3 October 2026. Slice 7 bounds the spend instead.
- **PostgreSQL TLS does not verify the server** (`rejectUnauthorized: false`).
  The firewall admits port 5432 only from the private subnet, so exploiting this
  requires an attacker already inside the VPC. A private CA, rotation and two
  client stacks cost far more than the risk they remove.
- **One service account shared by all workloads.** This is least-privilege
  hygiene, not an exploitable path. The API already holds the database
  credentials, so splitting accounts barely limits a compromise.

## Work slices

Ship slices in this order. Each one is independent and needs no schema change.

### 1. Property discovery requires `manage_credentials`

- Change `GET /api/v1/integrations/{connection_id}/properties` to `POST` on the
  same path with `capability: 'manage_credentials'`. The capability check runs
  before the existing rate limit, token refresh or provider call. A POST is
  required because a read endpoint must not call providers (invariant).
- Frontend: `property-picker.tsx` and `lib/api/integrations.ts` call the POST
  automatically when an owner/admin opens the picker, with no background refetch
  and no retries. Members and viewers see only the saved mappings (still a GET).
- Remove the old GET route, its client method and its mocks in the same PR.
- Tests (`integrations-routes.test.ts`): a member or viewer gets 403 before any
  provider call; owner/admin discovery works; another workspace's connection
  returns 404.

### 2. Recheck credential authority in OAuth completion

- In `completeOAuth`, replace the bare membership query with the existing
  capability check for `manage_credentials`, before the code exchange.
- After the provider token exchange, recheck the capability inside the
  grant-write transaction, after taking the workspace lock
  (`lockAuthorizedWorkspace`) so the check serializes against role changes. If
  the recheck fails, write nothing: no grant, connection or event. Never hold a
  transaction open during the provider call.
- Tests (`integration-oauth.test.ts`): a user demoted or removed between start
  and completion stores nothing; owner/admin completion still works.

### 3. Bound MCP authorization requests and clean them up

- Rate-limit `GET /authorize` with the same usage-window budgets that
  `registration.ts` uses: per client, per source IP (`trustedClientIdentity`)
  and global. Reject queries larger than 8 KiB and `state` values longer than
  1,024 bytes before any database write.
- Cap outstanding (unexpired, unconsumed) requests per client, checked in the
  same transaction as the insert while holding the existing client row lock.
- Add an `mcp-protocol-cleanup` entry to the runner's `periodic` list. Each pass
  deletes up to 100 expired authorization requests and codes per table, plus
  expired usage-window rows. Grants and consumed audit data are not touched.
- Starting defaults, set in `config/mcp.json`: 10/client/min, 40/source/min,
  120 global/min, 5 outstanding per client.
- Tests (`mcp-oauth.test.ts`): parallel requests cannot exceed the client cap;
  over-limit requests insert no row; cleanup deletes only expired rows; consent,
  token exchange and replay rejection still work.

### 4. Skip redundant runner launches

- In `runnerStarter`, before calling Google, run one query: if the drain
  advisory lock is held (`pg_locks` for the `DRAIN_LOCK` key), a runner is
  already draining, so skip the launch.
- Keep a per-instance minimum interval between launches (default 5 s, in
  `config/execution.ts`). With at most two API instances, this bounds launches
  to about two per interval at worst.
- If work arrives just as a drain finishes, the next request or the 10-minute
  tick picks it up. No coordination table, leases or fencing.
- Tests (`runner.test.ts`): a burst of committed requests starts at most one job
  per interval; no launch while the lock is held; a committed write never fails
  because a launch was skipped or failed. Replace the test that expects one
  start per wake.

### 5. Limit on-demand integration syncs

- Inside the existing enqueue transaction (already workspace-locked), reject a
  new on-demand window when the workspace has 20 or more queued, leased, running
  or retry-wait sync runs. Add a 10/workspace/min rate limit through
  `enforceWorkspaceRequest`. Permission stays the existing `run` capability.
- Scheduled imports and approved backfills are unchanged. Duplicate requests
  keep their current idempotent behavior and use no extra slot.
- Tests (`integration-sync.test.ts`): changing date windows cannot pass the cap;
  terminal runs free capacity; other workspaces are unaffected.

### 6. Check redirect scope before fetching robots.txt

- In `PageAcquirer`, run the caller's `admit(destination)` at the start of
  `gate`, before `this.robots(...)`. Keep the authorization check that runs just
  before each send.
- Tests (`site-health-acquisition.test.ts`): an out-of-scope redirect makes no
  request for either the page or its robots.txt; in-scope apex/www redirects
  still work.

### 7. Hard spend ceiling for Cloud Run and its logs

- **Log exclusion (Terraform).** Add a `google_logging_project_exclusion` that
  drops Cloud Run request logs with HTTP status 403 for the API service. Under a
  flood these logs are the largest uncapped cost, and the spend cap below does
  not cover Cloud Logging. Application logs and non-403 request logs are kept.
- **Cloud Run spend cap (operator step, console only).** In the Billing budget
  for this project, enable a Cloud Run spend cap of about $100/month (about
  ₹8,500 in the budget's INR currency). Normal hosting stays under ₹500, so the
  cap only triggers on abuse. When it triggers, Cloud Run pauses new usage, so
  the whole product goes offline. Nothing is deleted, the database VM keeps
  running, and the owner restores service by hand. Overshoot is possible
  because enforcement is not instant. The feature is in Preview, cannot be set
  from Terraform, and applies to one service per project.
- Record both items, and the restore steps after a triggered cap, in the
  [GCP runbook](../operations/GCP_RUNBOOK.md) budget section. Leave the
  existing alert-only `google_billing_budget` unchanged.
- Check: `terraform validate` and a plan that shows only the new exclusion.

## Validation

Iterate with the focused test files named in each slice, against a disposable
`API_TEST_DATABASE_URL`. Slices 2, 3 and 5 change authorization or concurrency,
so run `./scripts/check.ps1 -CheckOnly` once when their diff is complete. CI runs
everything else. No live provider calls, no production load tests.

## Rollout

The owner wants slices 1–7 as one PR (3 October 2026), with one commit per
slice and one deploy. The PR includes slice 7's Terraform exclusion and runbook
text. Slice 7's spend cap is a console change that only the owner makes; this
plan does not authorize it. Slice 1 changes an API
route and the frontend together, so release them in the same deploy. Rollback is
a normal image revert. Signup, payments, model funding and the tick schedule do
not change.
