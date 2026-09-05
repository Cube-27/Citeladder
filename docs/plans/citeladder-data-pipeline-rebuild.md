# Connected-data pipeline rebuild — GSC, GA4, and Bing

**Status:** Slices 1-3 shipped 2026-09-04 (PR 1). Slices 4-6 remain, and
are planned to land together as PR 2 alongside the Bing connection defect.
See "What PR 1 shipped" at the end of this document.

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
| 4 | ~~AI Referrals is **100% broken for every bounded range**~~ — **fixed**: a preset now sends its `range` TOKEN and the server resolves the newest persisted snapshot of that LENGTH (`ANALYTICS_PRESET_RANGE_DAYS`); no date is derived from the browser clock | [options.ts](../../frontend/lib/ai-referrals/options.ts), [analytics/service.py](../../backend/app/domain/analytics/service.py) |
| 5 | Bing is collected and **never displayed** — absent from `TRAFFIC_CONSUMED_DATASETS` and from every other projection. Its *collection* is now unblocked (it joined `TRAFFIC_SYNC_PROVIDERS`, so "Sync now" no longer skips it); the DISPLAY half is still open and needs its own panel (Slice 4.4) rather than a column on a GSC table | [traffic.py](../../backend/app/core/config/traffic.py) |
| 6 | ~~The projection **materializes every metric row in the window in memory**~~ — **fixed**: `TrafficProjectionBuilder` folds batch by batch and the executor streams into it, so memory bounds on distinct keys | [projection.py](../../backend/app/domain/traffic/projection.py), [streaming.py](../../backend/app/domain/traffic/streaming.py) |
| 7 | MCP exposes Site Health, Demand, Opportunities, and Visibility — **no traffic, search, referral, or connection-status tool** | [server.py:110-230](../../backend/app/domain/mcp/server.py#L110-L230) |

Defects 1–4 and 6 are now closed. Defect 5's collection half is closed too;
its display half (a Bing panel) is the remaining piece, in Slice 4.4. Defect 7
(MCP) is untouched and is the whole of Slice 5.

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

1. ~~**Document the knob.**~~ **Was already done** — `.env.example` carries
   `INTEGRATION_SYNC_BACKFILL_WINDOW_DAYS` with its cost note.
2. ~~**Bing joins the sync fan-out.**~~ **Done** — `TRAFFIC_SYNC_PROVIDERS`
   now includes Bing, so "Sync now" no longer skips a connected Bing property.
3. ~~**Backfill progress projection.**~~ **Done** as
   `GET /integrations/{id}/syncs/progress` -> `get_backfill_progress`, a pure
   rollup over the connection's `backfill`-kind runs. No new table. Its
   `state` keeps `not_started` / `importing` / `complete` / `partial` apart
   (invariant 7), and coverage is bounded by the SUCCEEDED windows only, so a
   failed chunk never widens the claimed history.
4. ~~**Surface it in Settings → Integrations.**~~ **Done** as
   `components/settings/backfill-progress.tsx`, rendered on the connection
   card: "Importing — 6 of 14 windows", then the covered range. It renders
   NOTHING for `not_started`, since no enqueued import is a different state
   from one that has covered nothing yet.

**Verification.** Component tests cover the rollup's four states, its
coverage bounds, its per-connection isolation, and its cross-workspace
refusal. The live check — connect a real GSC property, confirm 14 chunks
queue and drain, confirm `integration_metric_rows` spans ~365 days, re-select
the property and confirm no second backfill — is the user's to run.

---

## Slice 2 — A projection that scales, and windows that match

**Goal.** The projection stops loading a window into memory, and snapshots
exist for every timeline the product offers.

**Mergeable alone:** yes. Backend-only; the existing frontend keeps working
because `latest` is unchanged and the exact-window path is preserved.

1. ~~**Streaming fold.**~~ **Done** as `TrafficProjectionBuilder`.
   `build_traffic_projection` is retained as the batch door onto it, so all
   33 existing projection unit tests pass UNCHANGED — that was the contract.
   The executor's scan is ordered by re-sync identity, which lets the builder
   retire each observation as the next begins (`ordered_by_identity=True`):
   its buffer holds ONE row rather than one per observation in the window.
   - The provenance lists are capped at `TRAFFIC_PROVENANCE_ID_LIMIT` (500),
     kept as the lowest sorted ids so a rebuild samples identically. A capped
     row states its true total beside the sample, and every snapshot carries
     a `provenance` summary saying how many of its lists were sampled — so
     "sampled" is never mistakable for "complete" (invariant 7).
2. ~~**Config-owned snapshot windows.**~~ **Done**, as
   `PERFORMANCE_SNAPSHOT_WINDOW_DAYS` in `config/traffic.py`. The family is
   day-granularity only and anchored at the latest complete GSC date rather
   than the sync window's end. Extending it past 28 days depends on the
   streaming fold above.
3. ~~**Resolve reads by window length.**~~ **Done** as
   `resolve_preset_snapshot` / `resolve_window_snapshot`.
4. ~~**API.**~~ **Done** as `GET /projects/{id}/performance?range=month`,
   returning the resolved `snapshot_id` and the true window.

**Cost check, unchanged:** the preset family is still `(1, 7, 28)`.
The streaming fold removes the MEMORY bound on extending it, but the write
cost per refresh (one snapshot plus its stat rows per family entry) is
unmeasured on a real property, so the family was deliberately left as is.
Widening it is a separate, measured decision.

**Verification.** Twelve new unit tests assert the fold is batch-invariant
(any batch size, ordered or not, matches the one-shot projection), that a
superseded revision split ACROSS batches still never folds in, and that the
ordered mode really does hold one identity at a time. The existing component
refresh tests pass unchanged.

---

## Slice 3 — Timelines that tell the truth

**Goal.** Every range the UI offers returns data, and the UI states the window
it actually rendered.

**Depends on:** Slice 2. **Mergeable alone after it:** yes.

1. ~~**Traffic presets send `window_days`**~~ — **done** by the Performance
   alignment, in a different shape: the client sends a `range` token and the
   server resolves the newest snapshot of that length.
2. ~~**AI Referrals gets the same treatment**~~ — **done**. `rangeToWindow`
   (which computed `from`/`to` from the browser clock) is replaced by
   `rangeToParams`, which sends the preset TOKEN; the server resolves the
   newest persisted snapshot of that length. Length rather than
   `preset_window_days` is the match, because `AiReferralsSnapshot` has no
   preset marker column — a deliberate difference from Performance, recorded
   here rather than silently diverging.
3. ~~**Show the real window.**~~ **Done**: the response reports the resolved
   `window_start`/`window_end`, which is the window the screen renders.
4. **Distinguish the empty states.** *Partly done.* The AI Referrals
   unprojected-range state now names the PRESET rather than a window the
   client invented. The broader `not_run` / `observed_zero` / `available`
   rendering across the other screens is still open — it moves to Slice 4,
   whose staged post-connect ladder owns the same distinction.

**Verification.** Component tests assert a preset resolves a snapshot whose
window ends well before today (the exact case that was broken), that the
window the OLD client would have sent still matches nothing, that a preset
never resolves a DIFFERENT length's snapshot, and that an unknown range is a
422. The Playwright connect -> sync -> preset pass is left for PR 2, once the
Bing connection defect is fixed and a full live connect is possible.

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

Delivered as TWO PRs rather than six, by decision: PR 1 is Slices 1-3 (the
"data lands and reads correctly" unit), PR 2 is Slices 4-6 plus the Bing
connection defect. Each PR has `check.ps1` and `test.ps1` green before the
next begins.

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

---

## What PR 1 shipped, and where it differs from the plan above

Slices 1-3, implemented 2026-09-04. Where a decision changed the plan, the
reason is recorded here rather than silently diverging.

**The streaming fold is a builder, not a rewritten function.**
`TrafficProjectionBuilder` owns the incremental fold; `build_traffic_projection`
stays as the batch door onto it. That kept all 33 existing projection unit
tests passing unchanged, which the plan named as the contract. The executor's
read now folds each batch into every target and releases it, so peak memory is
one batch plus each builder's distinct keys.

**Dedup became a scan-order guarantee.** Latest-`resync_seq` selection needs
every revision of an observation before it can pick one. Rather than buffer a
row per observation, the executor's keyset scan is ordered by re-sync identity
then revision — the columns `uq_integration_metric_row_identity` already makes
unique — so the builder retires each identity as the next begins and buffers
ONE row. `add_batch` still dedups correctly without that promise, so the pure
API is safe for any caller; the promise is an optimization the executor can
make because it controls the query.

**`service.py` split rather than waived.** Adding the target/streaming
machinery pushed it to 890 lines against the 800 budget. The read half moved
to `domain/traffic/streaming.py` (the scan, its cursor, and the Demand
revision); `service.py` keeps the write path at 694. The exception map stays
empty.

**The Demand hand-off stopped holding row ids.** It hashed the sorted ids of
every row in the window, which is exactly the retention the fold was removing.
It now folds an order-independent XOR of per-id digests plus a count. The
digest is only an idempotency-key input — it must CHANGE when the evidence
changes, not equal any particular value — so this preserves the behaviour that
matters.

**Provenance is capped and says so.** `TRAFFIC_PROVENANCE_ID_LIMIT` (500)
bounds every id list, keeping the lowest sorted ids so a rebuild samples
identically. A capped row carries its true total beside the sample, and every
snapshot carries a `provenance` summary — present even when nothing was
sampled, so completeness is a positive statement rather than an inference from
a missing marker.

**AI Referrals resolves by LENGTH, not by a preset marker.** Performance
matches `preset_window_days` because its refresh writes that column.
`AiReferralsSnapshot` has no such column, so a preset matches on inclusive
window length instead. The consequence is honest and worth stating: a persisted
30-day window that was NOT written for the "Last 30 days" preset would still
resolve it. Performance avoids that; AI Referrals cannot without a schema
change, and adding one was out of this PR's scope.

**Bing joined collection, not display.** `TRAFFIC_SYNC_PROVIDERS` now includes
Bing so "Sync now" stops skipping a connected Bing property. No Bing row feeds
a GSC total or table — the Performance surface stays Search-Console-only, and
the Bing panel is still Slice 4.4.

**Empty-state work is only partly done.** Item 3.4 asked for `not_run` /
`observed_zero` / `available` to render distinguishably across the screens.
AI Referrals' unprojected-range state was fixed here (it names the preset
rather than a client-invented window). The rest belongs with Slice 4's
post-connect ladder, which owns the same distinction, so it moved there rather
than being half-built in two places.

**Not verified here.** No live provider connect was run from this session, and
the fresh 365-day import remains unverified end to end. The database reset and
the Google/Bing connect were run by the user, who is verifying the result. The
Playwright connect -> sync -> preset pass is deferred to PR 2, since the Bing
connection defect blocks a clean full-provider connect today.

## Review findings fixed before merge (PR 1 / PR 22)

**The keyset cursor was invalid SQL.** Slice 2's resume query built
`tuple_()` over the scan's `.asc()` ordering expressions, rendering
`(col ASC, ...) > (...)` — a Postgres syntax error on every scan that needed
a second batch. It passed CI because no test crossed a batch boundary: the
only test setting `_METRIC_ROW_BATCH_SIZE = 1` cancels on the second check,
before a cursor query is ever issued. The scan columns are now kept separate
from the ordering expressions, and
`test_refresh_scans_across_keyset_batch_boundaries` forces the resume path
(it fails without the fix with exactly that syntax error) while also placing
a superseded revision in a different batch than the one superseding it.

**Provenance accumulation was not actually bounded.** `bounded_provenance`
truncated only at finalization while the accumulators retained every source
id, so streaming memory stayed proportional to the window's row count — the
bound the batch-by-batch fold exists to establish. `BoundedIds` keeps the
lowest `TRAFFIC_PROVENANCE_ID_LIMIT` ids as it folds (the same sample a
full-set cap yields) and counts distinct ids offered, so `sampled` stays
honest.

**A scope-less refresh could widen a Google grant.** The scope fallback
returned all configured scopes whenever a token response omitted `scope`.
Google requests two scopes but a user may consent to one; the narrowed grant
recorded at code exchange was then overwritten on the next refresh, silently
restoring the declined scope. The fallback now applies only to the code
exchange, where no prior record exists to contradict.

**The OAuth stubs accepted any Bing token path.** Both fake servers matched
any `www.bing.com` path ending in `/token`, so a wrong token path still
passed — the same permissive-stub shape that let the Entra URLs ship. Both
now require `/webmasters/oauth/token` exactly.

## Carried into PR 2

**AI Referrals presets still resolve nothing.** Slice 3 fixed the clock-skew
half of defect 4, but the snapshot side is still broken: `AiReferralsSnapshot`
rows are only ever persisted at sync-run window lengths — 28 days for a
routine sync, chunked for backfill — so no row is 30, 90 or 365 days long and
every preset misses. Performance does not have this problem because its
refresh derives a whole snapshot family at each preset length
(`PERFORMANCE_SNAPSHOT_WINDOW_DAYS`, via `performance_family_windows`).
The fix is to give `ai_referrals_snapshot_refresh` the same treatment: scan
the widest span once and fold the nested preset windows. That is an executor
rewrite, not a review fix, so it lands in PR 2.

**Defects reported from the deployed app.** Raised by the user against the
running build; all are PR 2 scope:

- Google sign-in does not work in the deployed app.
- GA4 data does not refresh promptly (updates only after several refreshes).
- Performance/GSC has no granularity control — day/week/month belongs in the
  same row as the four coloured cards, as a dropdown after them.
- No quick-select range buttons (day/week/month, placed before the custom
  button).
- The default selection must be the full synced range, as it was previously.
- Column widths must be fixed across tabs so switching tabs does not shift
  the layout.
- Tabs are left-aligned with dead space on the right; they must fill the card
  width, and must not carry the date range as a subtitle.
- The four coloured cards must be one connected strip with white text, and
  the graph's layout card must contain that strip.
- The graph must not draw horizontal internal gridlines.
- The date picker must be built from HeroUI components
  (https://github.com/heroui-inc/heroui), replacing the ad-hoc styling
  (e.g. sharp corners) — design-system components only, never one-off styles.
- Tab labels inside the data card use a 12px font size.
- A "reset filters" control belongs in that same top row above the cards.


## PR 2 — what shipped, and what still needs live verification

**The AI Referrals preset family now exists.** `ai_referrals_snapshot_refresh`
derives 30/90/365-day snapshots anchored on the latest referral evidence date,
folded from the same single scan, exactly as `performance_family_windows`
does. Resolving a preset by window LENGTH only works when a row of that
length exists, and none did.

**Chart granularity is a real control.** Every refresh already wrote the
window at day, week AND month; `query_support.py` hardcoded day, so week and
month rows were written and never read. The dashboard endpoint takes a
`granularity` parameter and echoes what it resolved. Note the vocabulary
collision this surfaced: `RANGE_OPTIONS` (day/week/month/custom) are window
LENGTHS, while granularity is the chart's BUCKET size. They share three words
and are deliberately kept in different places on screen.

**Google sign-in in the deployed app** was not a redirect-URI problem.
`OAuthSettings.google_enabled` defaults to False and the deployed compose
never set `OAUTH_GOOGLE_ENABLED`; local dev's `.env` did, which is exactly why
one worked and the other did not. The client id/secret need no new variable —
sign-in falls back to the INTEGRATION Google pair by design, because Google's
`include_granted_scopes` composes only within one client. **Deployment still
needs `INTEGRATION_GOOGLE_CLIENT_ID` / `_SECRET` present in `runtime.env`**;
that file is provisioned outside the repo and could not be checked from here.

**GA4 "only updates after a few refreshes"** was a race, not a sync failure. A
terminal sync run means the IMPORT finished; the projection tasks
(`traffic_snapshot_refresh`, or ingest -> classify -> snapshot for referrals)
are enqueued after derivation and are still queued at that moment. The single
invalidate refetched the old snapshot. The sync hook now keeps refetching for
a bounded settling period and reports `syncing` throughout.

**Calendar and DateField are new design-system primitives.** The date picker
was the one control the system never had, so the dialog used
`<input type="date">`, whose popup the browser draws — untokenized and
different per browser. Both are built from existing tokens with no new
dependency, and dates stay ISO strings end to end (a local `Date` round trip
shifts the day across UTC, the classic "returns yesterday" bug).

**Still not live-verified.** The same boundary as PR 1: no real consent, no
real 365-day import, and no deployed Google sign-in was exercised from here.
The preset family, the granularity parameter and the settling poll are
covered by component tests against a real Postgres, but the deployment items
(the compose flag, `runtime.env` credentials) can only be confirmed on the
deployed host.
