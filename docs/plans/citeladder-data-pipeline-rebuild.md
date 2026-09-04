# Connected-data pipeline rebuild — GSC, GA4, and Bing

**Status:** planned 2026-09-04. Not started except where marked *shipped*.

**Superseded in part by `gsc-performance-alignment.md`**, which shipped first.
Read that document's "What shipped" section before starting any slice here:
Traffic is now the Performance surface, defects 1–3 and 5's Traffic half are
resolved differently than described below, and the sequencing notes at the end
of each affected slice say what is left.

**Problem.** Connecting Search Console, Analytics, or Bing today produces
almost nothing a user can act on. The collection layer is sound — per-workspace
OAuth grants, immutable import artifacts, versioned derivation into
`integration_metric_rows` — but everything downstream of it either never runs,
never matches, or is never read. A user connects three providers and lands on
empty charts.

**Outcome.** Connecting a provider yields, in order: core numbers within
minutes, a full year of history shortly after, correct numbers at every
timeline the UI offers, then CiteLadder's own analysis on top — and every layer
of that reachable from an MCP client.

**Flow this plan delivers**

1. Connect data → it actually lands, for a configurable history depth.
2. Analyze the data → correct projections at every offered timeline.
3. Analyze CiteLadder's insights → demand signals and opportunities fire.
4. Reach all of it through MCP.
5. *(Additional)* Feed prompts and topics from the same evidence.

---

## Verified defects this plan fixes

Each was confirmed by reading the shipped code, not inferred.

| # | Defect | Evidence |
|---|---|---|
| 1 | ~~Reads require an **exact** window match~~ — **fixed** by the Performance alignment: presets resolve by window LENGTH (`resolve_preset_snapshot`), and an exact window is used only for a custom or comparison range | [query_support.py](../../backend/app/domain/traffic/query_support.py) |
| 2 | ~~Snapshots are built **only for sync windows**~~ — **fixed**: `traffic_snapshot_refresh` also derives the preset family anchored at the latest complete GSC date, and `performance_range_projection` materializes any other requested window | [service.py](../../backend/app/domain/traffic/service.py) |
| 3 | ~~Traffic offers 7d/28d/90d that can never match~~ — **fixed**: the surface is `/performance` with Day/Week/Month/Custom ranges resolved server-side | [performance.ts](../../frontend/lib/performance/performance.ts) |
| 4 | AI Referrals is **100% broken for every bounded range**: it anchors `to` at *today* while every sync window ends *yesterday* | [options.ts:60](../../frontend/lib/ai-referrals/options.ts#L60) vs [sync.py:126](../../backend/app/domain/integrations/sync.py#L126) |
| 5 | Bing is collected and **never displayed** — absent from `TRAFFIC_CONSUMED_DATASETS` and from every other projection. Still open; the Performance surface is deliberately Search-Console-only, so Bing needs its own panel (Slice 4.4) rather than a column on a GSC table | [traffic.py](../../backend/app/core/config/traffic.py) |
| 6 | The projection **materializes every metric row in the window in memory**, which caps how long a window can safely be | `build_traffic_projection(rows=...)`, [projection.py:590](../../backend/app/domain/traffic/projection.py#L590) |
| 7 | MCP exposes Site Health, Demand, Opportunities, and Visibility — **no traffic, search, referral, or connection-status tool** | [server.py:110-230](../../backend/app/domain/mcp/server.py#L110-L230) |

Defect 6 is **still open and now the load-bearing one**. The Performance
alignment fixed defects 1–3 while accepting the in-memory fold: its preset
family is 1/7/28 days, so the widest automatic projection is small. A long
custom range still materializes its whole window in memory, which is the
bound Slice 2 removes.

**Already shipped (2026-09-04)**, on the branch carrying the Google sign-in work:

- First-connect history import, `.env`-backed via
  `INTEGRATION_SYNC_BACKFILL_WINDOW_DAYS` (default 365), enqueued once per
  connection when a property is first selected
  ([mappings.py](../../backend/app/domain/integrations/mappings.py)).
- That import is **chunked** into rolling-window-sized runs
  (`backfill_sync_windows`) precisely because of defect 6 — one 365-day run
  would trigger one 365-day in-memory projection.
- Bing property discovery, so a Bing site ref is picked rather than typed.
- `IntegrationSettings` and `OAuthSettings` now read `.env` at all (they were
  silently ignoring it outside Compose).

---

## Slice 1 — Collection lands, and you can see it landing

**Goal.** After connecting and selecting a property, a year of history arrives
without anyone watching a log, and the UI can say where it is up to.

**Mergeable alone:** yes. No read contract changes.

1. **Document the knob.** Add `INTEGRATION_SYNC_BACKFILL_WINDOW_DAYS` to
   `.env.example` beside the existing integration block, with the cost note
   (it is bounded by `sync_backfill_max_days`, currently 480).
2. **Bing joins the sync fan-out.** `TRAFFIC_SYNC_PROVIDERS`
   ([traffic.py](../../backend/app/core/config/traffic.py)) is `{gsc, ga4}`, so
   the Traffic "Sync now" button silently skips Bing. Add it; the enqueue path
   is already provider-neutral.
3. **Backfill progress projection.** Extend the existing sync-run read
   (`GET /integrations/{id}/syncs`) with a per-connection rollup: total
   backfill chunks, completed, failed, earliest covered date. Pure projection
   over `IntegrationSyncRun` — no new table.
4. **Surface it in Settings → Integrations.** The connection card shows
   "Importing history — 6 of 14 windows" and then the covered date range,
   reusing the existing card states.

**Verification.** Connect a real GSC property against a live Google account,
confirm 14 chunks queue and drain, and confirm `integration_metric_rows`
spans ~365 days. Re-select the property and confirm no second backfill.

---

## Slice 2 — A projection that scales, and windows that match

**Goal.** The projection stops loading a window into memory, and snapshots
exist for every timeline the product offers.

**Mergeable alone:** yes. Backend-only; the existing frontend keeps working
because `latest` is unchanged and the exact-window path is preserved.

1. **Streaming fold.** *(Still required — see defect 6.)* Refactor
   `build_traffic_projection` from
   "take a materialized `rows` list" into an incremental accumulator the
   executor feeds batch by batch. Memory then bounds on distinct pages +
   distinct queries + buckets rather than on row count. The pure-function
   property and determinism must survive; the existing projection unit tests
   are the contract and must pass unchanged where they assert output.
   - Watch the per-page/per-query `source_metric_row_ids` provenance lists:
     over a long window these grow per row. Cap or summarize them, and say so
     in the snapshot's provenance rather than silently truncating.
2. ~~**Config-owned snapshot windows.**~~ **Done**, as
   `PERFORMANCE_SNAPSHOT_WINDOW_DAYS` in `config/traffic.py`. The family is
   day-granularity only and anchored at the latest complete GSC date rather
   than the sync window's end. Extending it past 28 days depends on the
   streaming fold above.
3. ~~**Resolve reads by window length.**~~ **Done** as
   `resolve_preset_snapshot` / `resolve_window_snapshot`.
4. ~~**API.**~~ **Done** as `GET /projects/{id}/performance?range=month`,
   returning the resolved `snapshot_id` and the true window.

**Cost check before merging:** a 365-day snapshot family is 4 window lengths ×
3 granularities = 12 snapshots per refresh, each with page and query stat rows.
Measure the row count and refresh duration on a real property before enabling
the 365 entry; ship `(7, 28, 90)` if 365 does not hold up, and say so.

**Verification.** Unit tests for the fold (identical output to the current
projection for the same inputs). Component test: one sync produces snapshots
for every configured length, and a `window_days` read served days later still
resolves.

---

## Slice 3 — Timelines that tell the truth

**Goal.** Every range the UI offers returns data, and the UI states the window
it actually rendered.

**Depends on:** Slice 2. **Mergeable alone after it:** yes.

1. ~~**Traffic presets send `window_days`**~~ — **done** by the Performance
   alignment, in a different shape: the client sends a `range` token and the
   server resolves the newest snapshot of that length.
2. **AI Referrals gets the same treatment** — this is defect 4, and it is the
   worst of them: `30d`, `90d` and `1y` currently cannot match a snapshot at
   all. Mirror the `window_days` resolution in
   [analytics/service.py](../../backend/app/domain/analytics/service.py) and
   [options.ts](../../frontend/lib/ai-referrals/options.ts).
3. **Show the real window.** Done for Performance (the toolbar renders the
   resolved window); AI Referrals still needs the same treatment.
4. **Distinguish the empty states.** `not_run`, `observed_zero`, and
   `available` already exist on the wire; the screens must render "nothing
   synced yet" differently from "measured zero" and from "this provider is not
   connected".

**Verification.** Playwright: connect → sync → every preset renders non-empty.
Component tests asserting the three empty states are distinguishable.

---

## Slice 4 — Core data first, then CiteLadder's analysis

**Goal.** A user who has just connected sees their own numbers immediately, and
sees analysis appear as it is computed — not one long spinner and not an empty
dashboard that looks broken.

**Mergeable alone:** yes, given Slices 1–3.

1. **Staged post-connect state.** One projection over existing rows —
   integration grant status, sync-run progress, snapshot presence, demand
   snapshot presence, opportunity count — expressed as an explicit ladder:
   `connected` → `importing` → `core_data_ready` → `analysis_ready`. No new
   table; every input is already persisted.
2. **Render the ladder.** Traffic and the project dashboard show core GSC/GA4
   numbers as soon as the first chunk derives, with analysis panels in an
   explicit "computing" state rather than empty.
3. **Make the analysis chain fire reliably after a connect.** Confirm the
   post-sync chain — derivation → `traffic_snapshot_refresh` → demand refresh →
   opportunity recompute — actually completes for a fresh connection with no
   prior state, and fix what does not. Demand reads the *latest* snapshot
   ([demand/service.py](../../backend/app/domain/demand/service.py)), so it is
   free of the exact-window defect, but it has never been exercised from a
   cold connect.
4. **Bing as its own series** (decision taken: kept separate, never folded into
   the headline totals). Adding Bing impressions to GSC impressions would
   silently change what every existing chart means and make CTR and position
   averages undefined across two engines. Add `bing_page_daily` /
   `bing_query_daily` to the projection as distinct Bing metrics with their own
   panel.

**Verification.** From an empty database: connect, and assert the ladder
advances to `analysis_ready` with a demand snapshot and at least one
opportunity.

---

## Slice 5 — MCP access to data, insights, and opportunities

**Goal.** Everything the UI shows is reachable from an MCP client.

**Mergeable alone:** yes, given Slice 2's read contract.

The MCP server already exposes `list_projects`, `get_project_business_context`,
`search`, `fetch`, `read_site_health`, `read_demand`, `read_opportunities`,
`read_visibility_audit`. Missing is the entire connected-data layer.

1. **New agent tool executors** in
   [agent/tools.py](../../backend/app/domain/agent/tools.py) `_EXECUTORS`,
   following the existing shape exactly:
   - `performance.read_snapshot` — headline totals + series for a range.
   - `performance.read_table` — the paged dimension tables (one executor for
     all six dimensions, mirroring the REST surface).
   - `referrals.read_snapshot` — AI referral volume and share.
   - `integrations.read_status` — connected providers, mapped properties, sync
     progress, coverage window. This is the one that lets a client explain
     "why is this empty".
2. **Register them** in `AGENT_TASK_POLICIES`
   ([config/agent.py](../../backend/app/core/config/agent.py)) and in
   `_CONTEXT_TOOLS` ([mcp/data.py](../../backend/app/domain/mcp/data.py)), then
   add the thin `@_evidence_tool` wrappers in
   [mcp/server.py](../../backend/app/domain/mcp/server.py).
3. **Every tool stays a projection.** Read-only annotations, no provider I/O,
   no recomputation — the same rule the existing evidence tools follow.
4. **Workspace authorization is not optional.** Each tool resolves through
   `_authorized_project`; a project id alone must never grant access.

**Verification.** Component tests per tool including a cross-workspace refusal.
Manual: connect an MCP client and read traffic for a project end to end.

---

## Slice 6 *(additional)* — Prompts and topics from connected evidence

**Goal.** Real demand evidence improves the prompt portfolio instead of sitting
beside it.

**Depends on:** Slices 1–4 producing trustworthy demand signals.

1. Feed persisted GSC query evidence into topic selection, which today reads
   only the site's own published offering list.
2. Propose prompt-portfolio additions from observed queries that have demand
   but no covering prompt, as **suggestions requiring explicit activation** —
   never autonomous activation (repository invariant).
3. Record provenance on every generated prompt: which query evidence rows and
   which snapshot produced it.

**Verification.** A generated prompt traces back to specific
`QueryEvidenceRow` ids; nothing activates without a user action.

---

## Sequencing and merge order

Slices 1, 2 and 5 are independent of each other. Slice 3 needs 2; Slice 4 needs
1–3; Slice 6 needs 4.

```
1 Collection ──┐
2 Projection ──┼── 3 Timelines ── 4 Core-data-first ── 6 Prompts
5 MCP      ────┘
```

Merge each as its own PR with `check.ps1` and `test.ps1` green before starting
the next.

## Rules that constrain every slice

From `AGENTS.md` and `docs/invariants.md`, and each already load-bearing here:

- Read APIs render persisted projections. They never crawl, sync, call a model,
  or repair state — which is why Slice 2 adds snapshot windows rather than
  computing windows at read time.
- Configuration, catalogs, thresholds, and limits live in
  `backend/app/core/config/*`, never in service code.
- Unknown, unavailable, zero, and not-applicable are distinct states. A missing
  sync is not a zero.
- One migration: fold any schema change into
  `migrations/versions/0001_initial.py` and reset the database.
- Read APIs render persisted projections: a range with no snapshot is reported
  as unprojected and materialized by `performance_range_projection`, never
  built inside a read.
- Backend modules stay under 800 LOC / CC 12, frontend production modules under
  500 LOC / CC 12. Both exception maps are empty; split rather than waive.
- No autonomous publishing or prompt activation.
