# AI Traffic improvement plan

**Status:** implemented 2026-10-09 in #328 (three phases). Shipped behaviour is
owned by [AI Traffic](../ai-traffic.md).

Feature 8 of the [feature review tracker](feature-review-tracker.md): customer
crawl logs (webhooks, uploads, the Worker template), their rollups, coverage and
verification, the `/ai-traffic` screen, AI Traffic insights and the Agent/MCP
reads. Shipped behaviour is owned by [AI Traffic](../ai-traffic.md), not by this
plan. Constraints: [invariants](../invariants.md), especially commit-before-network-I/O,
distinct unknown / zero / unavailable states, and the single migration baseline
(no schema change here).

## Context

`ingestion_enabled` is false for general availability, so almost every user sees
GA4 referrals and three crawl surfaces they cannot set up. Crawl collection runs
only in the development operator's workspace. The review therefore weighs two
audiences: every user today (referrals, Pages, Overview) and the crawl pipeline
that must be correct before enablement.

## Why

A read-only audit of admission, uploads, the Worker template, rollups, reads,
insights, the screen and the tests (2026-10-09) found, after verification:

- **Complete coverage is unreachable in the product.** Preset windows end on
  the current UTC day, which can never be complete, so measured zeros, observed
  crawl coverage and the three absence insights never appear outside tests (all
  tests pass explicit past days).
- Preset windows use UTC dates while rollups are dated in the reporting
  timezone, so a non-UTC property loses or gains a day.
- Insight snapshots are keyed by exact dates and nothing refreshes them when the
  day rolls over; the strip then says "awaiting a refresh" and pattern links
  return 409 until another event happens. Insight refresh also runs three full
  page joins for every project on every audit and Site Health completion, though
  every pattern needs GA4.
- Overview "Tracked citations" counts every citation, including competitors' and
  third parties'; Pages counts only the business's own pages.
- A historical request checked against a later IP-range snapshot is marked
  `failed_verification` when the bot's ranges changed since, and drops out of
  default metrics.
- The Cloudflare Worker template sends one webhook per bot request against a
  limit of 120 batches an hour per source; a site with more than about two
  crawler hits a minute loses most of its data silently.
- One malformed line rejects a whole batch or upload with 422, and a retry
  replays the same 422.
- Upload batches spend attempt quota on retries of accepted sequences.
- Completing an upload fails with 409 when any scanned day overlaps another
  source, leaving the upload open until it is abandoned.
- A resumed upload started on a later day shifts every batch boundary, so lines
  in unacknowledged sequences are skipped.
- Each rollup refresh loads every accepted receipt since the freeze floor.
- The screen: crawl tabs, buttons and filters lead to a setup that is "not
  enabled"; Referrals keeps its own range outside the URL, so tabs disagree;
  raw tokens (`non_comparable`, `declared_complete`, bot and source IDs, quality
  flags) and internal record IDs reach users; revoke has no confirmation;
  uploads parse with the dialog's format instead of the source's; a finished
  upload shows nothing for about two minutes with no notice; several labels
  repeat or say nothing to a screen reader.

File references are to `frontend/services/api/src/` or `frontend/` as noted.

## Decisions (owner, 2026-10-09)

1. **UX addition: a referrals-first screen.** When crawl collection is
   unavailable the screen opens on Referrals, crawl-only tabs and controls give
   way to one availability notice, one URL range serves every tab, and raw
   tokens become readable labels.
2. **The Worker batches.** The template buffers per isolate and sends a batch
   every few seconds or events; coverage stays `partial`. The per-source batch
   limit rises to a rate the database absorbs; the accepted-lines quota still
   bounds volume.
3. **A malformed line rejects only that line.** 422 remains only when no line in
   a batch (or the upload's header sample) maps.

## Phase 1: runtime correctness

| # | Finding | Change | Where |
|---|---|---|---|
| 1.1 | Preset windows end on today in UTC; completeness is unreachable. | Presets end on the current day in the project's reporting timezone. Completeness is judged over closed days: the in-progress day still counts requests but cannot make a window incomplete. | `crawl-logs/reads.ts` |
| 1.2 | Insights go stale and run for projects that cannot have patterns. | Each preset's insight window ends on the last closed reporting day, capped at the latest complete GA4 day. Reads serve the newest snapshot of the preset's length with its dates; pattern-filtered Pages use that snapshot's window. Refresh is enqueued only for projects with an active GA4 mapping, and the maintenance tick refreshes a project whose newest snapshot predates the current day. Without GA4 the read says to connect it. Older snapshots of the same length are replaced. | `crawl-logs/insights.ts`, `insights-enqueue.ts`, `pages.ts`, `maintenance.ts` |
| 1.3 | Overview counts every citation. | Owned citations only, as Pages does. | `routes/ai-traffic.ts` |
| 1.4 | A later snapshot fails historical requests. | Outside the ranges of a later snapshot is `unverifiable` (`later_snapshot_mismatch`); only a contemporaneous snapshot can fail verification. | `crawl-logs/identity.ts` |
| 1.5 | One bad line rejects a batch. | Missing fields reject that line; the batch is unsupported only when no line maps. The upload client skips such lines and fails its header sample only when no sampled line maps. | `crawl-logs/prepare.ts`, `lib/ai-traffic/upload.ts` |
| 1.6 | Upload retries spend quota. | The upload batch route passes `upload_id:seq` as the quota key. | `routes/crawl-logs.ts` |
| 1.7 | Upload completion fails on an overlapping day. | Overlapping days are left out of the upload's declared days; the rest complete. | `crawl-logs/uploads.ts` |
| 1.8 | Resume on a later day skips lines. | The client's admission floor is fixed by the upload's creation time, so batch boundaries are stable across resumes. | `lib/ai-traffic/upload.ts` |
| 1.9 | Rollup loads every receipt since the floor. | Only receipts received in, or with lines inside, the refreshed days are loaded. | `crawl-logs/rollup.ts` |
| 1.10 | The Worker loses data above two hits a minute. | The template buffers and flushes batches; the per-source batch limit rises. | `apps/docs/public/templates/citeladder-crawl-log-worker.js`, `config/crawl-logs.json` |
| 1.11 | Dead contract field. | `scanned_dates[].complete` is dropped from the upload completion request; the server derives completeness. | `crawl-logs/uploads.ts`, `lib/ai-traffic/upload.ts` |

## Phase 2: referrals-first screen (UX addition)

| # | Change | Where |
|---|---|---|
| 2.1 | When crawl collection is unavailable, the screen opens on Referrals, hides the Crawlers and Activity tabs and every connect button, and the Overview crawl card states that crawl logs are not available yet. | `components/ai-traffic/ai-traffic-screen.tsx`, `overview-signals.tsx`, `crawl-log-connections.tsx` |
| 2.2 | One `range` URL parameter serves every tab; Referrals reads and writes it, keeps its "latest synced window" and puts granularity in the URL. Referral preset snapshots were written only at day granularity, so a preset at the weekly default read as "no snapshot"; presets are now written at every granularity. | `referrals-screen.tsx`, `referrals/snapshot.ts` |
| 2.3 | Readable labels for page leg states, coverage, reasons, bots, AI sources and quality flags; no record IDs on screen. | `lib/ai-traffic/vocabulary.ts`, `url-panel.tsx`, `pages-view.tsx`, `referral-details.tsx`, `traffic-views.tsx`, `crawl-log-setup.tsx` |
| 2.4 | Revoke asks for confirmation naming the host. | `crawl-log-connections.tsx` |
| 2.5 | Uploads parse with the selected source's format; after an upload the screen says results appear after processing and refreshes when they do. | `lib/ai-traffic/use-crawl-connections.ts`, `crawl-log-setup.tsx` |
| 2.6 | Distinct accessible names for insight links and crawler rows; empty landing-page tables are not drawn; one unavailable mark; no empty reasons prefix. | `insight-strip.tsx`, `traffic-views.tsx`, `referral-details.tsx` |
| 2.7 | Re-exports that only renamed shared formatters or served a test are retired. The route-content wrapper stays: every product route uses that shape. | `ai-traffic-screen.tsx`, `traffic-views.tsx`, `lib/ai-traffic/series.ts`, `options.ts` |

## Phase 3: tests and documents

Tests for credible regressions: a preset window reaches complete coverage over
closed days; a non-UTC project's window; the insight read after a day rollover;
owned-only Overview citations; a later-snapshot mismatch; one bad line in a
batch; an upload retry spends no quota; completion with an overlapping day; the
referrals-first screen and the shared range. Tests that pin raw tokens, negative
copy for retired features or another owner's formatter are rewritten or removed.
[AI Traffic](../ai-traffic.md) is rewritten from the shipped behaviour.

## Deferred to the backlog

- Comparability after GA4 first sets the reporting timezone: frozen days keep
  UTC, so crawl-first projects show `non_comparable` pages until those days
  leave the window. Needs a persisted change date; only the development
  workspace can reach it today.
- URL detail and pattern filters compute the project-wide page join before
  filtering; push the hash filter into each CTE when enablement brings volume.
- Receipt retention and an index for the overlap and source-list scans need a
  schema change; decide with enablement.
- Upload presets for raw Cloudflare Logpush and nginx JSON exports, and resume
  without the upload ID (a list of open uploads per source).
- Accepted hosts beyond the exact host (apex and `www`) and out-of-scope counts
  per source; a `stalled` connection state when delivery stops.
- A revoked source's overlap claim ends at revocation, without double-counting
  the switchover day.
