# Connected data improvement plan

Feature 6 of the [feature review tracker](feature-review-tracker.md): integrations
(Search Console, GA4, Bing), sync, Performance, AI Referrals and Search Demand.
This is its audit-derived plan. **Status: implemented (2026-10-08) in one PR**; every
phase item shipped, with the deferrals below. Shipped behaviour is owned by
[Connected data](../integrations-traffic-analytics.md), not by this plan.
Constraints: [invariants](../invariants.md), especially workspace authorization,
persisted-projection reads, commit-before-network-I/O and distinct unknown /
unavailable / zero states.

## Why

A read-only audit of the OAuth and sync owners, the integration worker and
dispatcher, the Traffic, Referral and Demand projections, the connect UI and
their tests (2026-10-08) found:

- Bing data that never reaches Performance.
- Search Console lag recorded as measured zeros, with presets anchored on those
  days.
- Daily syncs that re-import 28 days.
- A sync lane with no next-due time.
- Row-at-a-time inserts under a held lock.
- A grant demoted to "reconnect" by an ordinary token expiry.
- A disconnect that deletes the imported history its dialog promises to keep.
- A connect flow that takes 7–9 clicks and four page switches.

File references are to `frontend/services/api/src/` or `frontend/` as noted.

## Decisions

The owner set the bar for this feature: no product decisions, and
**integration must be smooth with minimum clicks and screen switches**. Every
change below either fixes a defect, makes the code match an existing promise,
or serves that bar. Where a fix would need a product choice, it is deferred.

## Phase 1: sync runtime

| # | Finding | Change | Where |
|---|---|---|---|
| 1.1 | **Bing never reaches Performance.** Bing returns its whole history, the window filter drops the out-of-range rows, and those dropped rows mark every artifact `truncated`, so partition selection never picks a Bing revision. | Truncation counts only unparseable rows; a date outside the window is not invalid. | `integrations/normalize.ts`, `workers/integration-worker.ts` |
| 1.2 | **Stall.** The integrations runner lane has no `nextDue`, so 30–120 s retries and remaining history chunks wait for the 10-minute tick. | `IntegrationWorker.nextDue` registered on the lane. | `workers/integration-worker.ts`, `workers/runner.ts` |
| 1.3 | A sync ignores the drain deadline, blocking every later lane until the job timeout. Each deadline stop charges an attempt, so a long history import is written off after four runs even though it resumes from committed pages. | The lane passes the drain deadline as an abort signal. A deadline stop releases the run to `queued` without charging the attempt when that attempt committed a page. | `workers/integration-worker.ts`, `workers/runner.ts` |
| 1.4 | Metric rows insert one statement per row (up to 25,000 a page) while the run and connection rows are locked. | Batched multi-row inserts. | `workers/integration-worker.ts` |
| 1.5 | Scheduled syncs re-import a fixed 28-day window every day; on-demand coverage stops at the first gap, so one failed history chunk makes every manual sync re-read up to 480 days. | Both start from the latest succeeded window end minus the late-data days; the default window applies only without coverage. Gaps stay with history retry. | `integrations/sync.ts`, `workers/integration-dispatcher.ts` |
| 1.6 | One token per run (runs outlast the refresh skew) and any 401/403 demotes the shared Google grant to `needs_reauth`. | Token resolved per page; a 401 forces one refresh before failing; a 403 fails the run as `property_not_accessible` and leaves the grant connected. | `integrations/tokens.ts`, `integrations/client.ts`, `workers/integration-worker.ts` |
| 1.7 | Uncached workspace access check per page. | `cachedWorkspaceAccess`. | `workers/integration-worker.ts` |
| 1.8 | `previousSequence` and the dispatcher's last-scheduled lookup fetch every run (no limit); the dispatcher query has no workspace filter and runs once per mapping. | `limit(1)`, workspace filter, one grouped query. | `integrations/sync.ts`, `workers/integration-dispatcher.ts` |
| 1.9 | Polling one sync run recomputes the whole run list. | Single-run read. | `integrations/sync.ts`, `routes/integrations.ts` |
| 1.10 | Landing pages need an exact host match, so a `www.` property against an apex project drops every landing row. | Apex and `www.` are one host, matching the mapping rule. | `integrations/host-scope.ts` |
| 1.11 | Token-refresh waiters poll every 0.2 s for up to 70 s. | 1 s. | `config/integrations.json` |

## Phase 2: projections

| # | Finding | Change | Where |
|---|---|---|---|
| 2.1 | **Lag reads as zero.** Search Console finalizes 2–3 days late, but every window ends at UTC yesterday; empty trailing days count as measured zeros, the presets anchor on them, and the 28-day trend detector almost always reports insufficient history. | Presets and trends anchor on the latest day with Search Console rows; empty days after it are unavailable, not zero. | `integrations/partitions.ts`, `traffic/*`, `demand/detectors.ts` |
| 2.2 | Demand computes over whatever window triggered it (4, 28 or 365 days), and "latest" means most recently created, so Search Demand and Actions flip between samples. | Demand always computes the policy window ending at the anchor; latest is by window end. | `traffic/snapshot.ts`, `demand/reads.ts` |
| 2.3 | Query-evidence truncation keeps the alphabetically first rows of the oldest days. | Keep the highest-impression rows, newest first. | `demand/query-evidence.ts` |
| 2.4 | `high_impression_low_ctr` ignores brand and has no cap, though the document says branded cohorts cannot become actionable. | Non-branded only, capped in config. | `demand/projection.ts`, `config/demand.json` |
| 2.5 | AI Referrals refresh runs twice per GA4 sync; the first run precedes classification and always sees pending buckets. | No extras refresh when the run carries referral datasets. | `integrations/projections.ts` |
| 2.6 | The Traffic refresh takes no per-project lock, unlike Referrals and Demand. | Advisory lock in the write transaction. | `traffic/snapshot.ts` |
| 2.7 | Custom ranges accept a future end, can never retry after failing, and a future range shifts the 3- and 6-month anchors. | Clamp to the latest data date; a failed range may be requested again; extended ranges use the partition anchor. | `traffic/performance.ts`, `routes/performance.ts` |
| 2.8 | Small correctness items: weighted position divides by all impressions; week/month referral quality spans the whole window; UTM sources miss subdomains; page analyses load every row per page. | Fixed in place. | `demand/projection.ts`, `referrals/*`, `demand/source.ts` |

## Phase 3: connect in place (UX addition)

Today Settings → Integrations is the only place to connect or choose a property,
and every OAuth flow lands back there. Connecting Search Console from
Performance takes 7–9 clicks and four page switches. The goal is
**Connect → consent → confirm the suggested property**, on the page the user
started from.

| # | Change | Where |
|---|---|---|
| 3.1 | OAuth start accepts a same-origin `return_to` (validated against app routes), carried in the signed state; the callback lands there with `connected=` or `error=`. | `integrations/oauth.ts`, `routes/integrations.ts` |
| 3.2 | Start-route failures redirect to the landing with `error=` instead of a JSON body on a full-page navigation; the unused non-workspace start route is retired. | `routes/integrations.ts` |
| 3.3 | Property discovery takes the project and marks properties that match its site, using the same ownership rule as mapping creation (one helper). | `routes/integrations.ts`, `integrations/host-scope.ts`, contracts |
| 3.4 | A shared **data source setup** component: per provider, Connect / Reconnect / confirm the matching property / importing progress / connected. One matching property becomes a one-click **Use** button. Gated on `manage_credentials`, with an "ask an admin" state. | `components/integrations/` |
| 3.5 | It replaces the dead ends: the Performance first-use empty state and not-connected hint, the Search Demand empty state ("Open Performance" detour), the AI Traffic referrals empty state and the overview card's GA4 link. Returning from consent reopens the setup in place. | `components/performance`, `demand`, `ai-traffic` |
| 3.6 | After a property is chosen, readiness, Performance and Demand refresh immediately instead of after the 60 s stale time. | setup component |
| 3.7 | Reconnecting a grant queues a catch-up sync for its mapped properties. | `integrations/oauth.ts` |
| 3.8 | **Disconnect keeps imported data, as its dialog says.** Today it deletes the connection, cascading every sync run, artifact and metric row. Disconnect now revokes the grant and retires its mappings; connection rows and evidence stay, and a reconnect resumes them. Removing one property uses the existing mapping route. | `routes/integrations.ts`, `components/settings` |
| 3.9 | Settings fixes: the row shows the active project's property (it showed any project's); Sync now names the project (it failed with 409 for multi-project connections); error codes and run states are labelled; per-provider accessible names on repeated buttons. | `components/settings` |

## Deferred to the backlog

Each item is in the [backlog](backlog.md) with its reason.

- **Snapshot retention and stats stored per granularity.** This needs a
  reference inventory across verification, Opportunity and Demand provenance,
  plus a growth measurement on production.
- **Retiring the referral events and classification tables**, which duplicate
  inline classification, and the unscheduled retention sweep. This is a
  replacement under the gate. It is harmless until the sweep is scheduled.
- **History extension after a plan upgrade, and per-provider retention caps.**
  Billing is not live, and Search Console's 16-month retention would turn
  longer requests into false zeros.
- **Window-wide zero suppression when any day is flagged.** This needs
  per-stat coverage in the contract.
- **A UI for branded-query overrides**, and the two query-evidence routes only
  MCP or nothing calls.
- **GA4 property matching by data-stream URL.** This adds a provider call per
  property.

## Tests and documents

Tests are added for credible regressions:

- a worker-produced Bing run is selected;
- the integration lane's `nextDue`;
- a deadline stop with committed pages is not charged;
- incremental scheduled windows;
- a 401 refreshes once and a 403 leaves the grant connected;
- `www.` landing hosts;
- trailing Search Console lag is unavailable and the anchor moves back;
- Demand's fixed window;
- query-evidence truncation keeps recent high-impression rows;
- branded low-CTR exclusion;
- `return_to` validation and landing;
- discovery matching;
- disconnect keeps evidence;
- the setup component's states and one-click match.

Tests that lock in the defects are rewritten:

- the interactive deadline attempt charge;
- the "Open Performance" detour;
- the zero-alerts first-use test.

Tests that restate constants or cover retired routes are removed, with reasons.

The [Connected data](../integrations-traffic-analytics.md) document is rewritten
from the shipped behaviour, and `search-surfaces` moves to feature 3 in the tracker.
