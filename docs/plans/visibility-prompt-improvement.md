# Prompts, audits and AI Visibility improvement plan

Feature 3 of the [feature review tracker](feature-review-tracker.md); this is its
audit-derived plan. **Status: done (2026-10-08).** Phases 1-5 merged in #309;
deferred items are in the [backlog](backlog.md). The follow-up below is
implemented by [Prompt generation v3](prompt-generation-v3.md). Shipped behaviour is
owned by [Visibility](../visibility-prompt.md), not by this plan. Constraints:
[invariants](../invariants.md), especially workspace authorization,
persisted-projection reads, commit-before-network-I/O and distinct
unknown / zero / not-applicable / unavailable states.

## Why

A read-only audit of the prompt library, audit execution, the visibility read
side, the feature document and the tests (2026-10-08) found an audit stall that
writes off paid Google AI Overview queries, per-task database work far above
what the free-tier database should carry, reads that load far more than they
render, one label that means two different numbers, empty denominators scored
as zero, and result screens that hide coverage, baselines and failure reasons.
File references are to `frontend/services/api/src/` or `frontend/` as noted.

## Owner decisions (2026-10-08)

1. **UX addition: a coverage strip and failure reasons.** Under the headline
   tiles: answers, engines and failures behind the numbers, the comparison
   baseline and its type, and why a delta is missing. Failed executions show a
   plain reason with a next step, and a schedule paused by failures says why.
2. **"Visibility" means the mention rate everywhere.** Overview stops showing
   the weighted composite under that label; the composite stays per prompt as
   the prompt score.
3. **Prompt generation gets its own follow-up PR** (see
   [the follow-up](#follow-up-prompt-generation-and-brand-matching)). This PR
   does not change generation code.
4. **Brand disambiguation moves to the same follow-up.** The hardcoded
   single-brand rule is removed there, together with a per-project design.

## Phase 1: audit execution correctness and cost

| # | Finding | Change | Where |
|---|---|---|---|
| 1.1 | **Stall.** The audit runner lane has no `nextDue`, so `retry_wait`, `capacity_wait` and `awaiting_provider_result` tasks wait for the 10-minute tick. | Add `AuditQueue.nextDue` over claimable statuses and register it on the lane. | `queue/audit-queue.ts`, `workers/runner.ts` |
| 1.2 | **Paid queries written off.** At tick pace a submitted Google AI Overview task gets about 3 polls before `max_run_seconds` (1800 s) fails it with `poll_ceiling_exceeded`, although the query is paid and retrieval is free. | Fixed by 1.1. A task whose paid submission exists is governed by its poll ceiling and recovery deadline, not the run cap. | `workers/audit-worker.ts` |
| 1.3 | Every task runs an uncached `requireWorkspaceAccess` (about 4 queries). | Reuse `cachedWorkspaceAccess`; the per-task ownership re-lock stays. | `audits/execution-context.ts` |
| 1.4 | The worker runs the maintenance sweep every second (`poll_interval_seconds`), duplicating the periodic `audit-maintenance` lane. | Remove the in-worker sweep; the periodic lane owns it. | `workers/audit-worker.ts` |
| 1.5 | Every task re-finalizes the whole audit in `finally` (O(n²) task reads for a large run). | Finalize only once the audit has no non-terminal task. | `workers/audit-worker.ts`, `audits/projections.ts` |
| 1.6 | The funded monthly budget sums worst-case reservations (price × prompts × repetitions × max attempts) and never settles them, so failed or cancelled runs exhaust it at up to 5× actual cost. | **Deferred to the backlog.** Search-surface submissions do not record provider attempts, so settling to recorded attempts could undercount spend; the reservation fails safe. 1.7 cuts the over-reservation from 5× to 3×. | `audits/admission.ts` |
| 1.7 | `max_attempts` 5 for interactive runs; discovery uses 3. | Default 5 → 3. | `config/audits.json` |
| 1.8 | Dead config: `worker_db_sessions_per_task`, `operational_headroom`, `route_policies.*.batch_enabled`. | Remove. | `config/audits.json`, `config/audits.ts` |

## Phase 2: read cost

| # | Finding | Change |
|---|---|---|
| 2.1 | The project list embeds every prompt of every project with its full `generation_evidence`; no UI reads that field. | Drop `generation_evidence` from prompt views. The column stays. |
| 2.2 | Trends caps runs before bucketing, so "Monthly, All time" silently shows only about the last 100 runs. | Bucket first, then cap points. A truncation flag would change the response shape; at 100 points it now applies only beyond 100 weeks or months. |
| 2.3 | Overview calls the full dashboard read twice (current and previous) and uses three fields. | A comparison-free headline read for Overview. |
| 2.4 | Overview reads only `completed` runs; the Visibility page also reads `partially_completed`. | Share the dashboard status set. |

## Phase 3: metric correctness

| # | Finding | Change |
|---|---|---|
| 3.1 | Decision 2. | Overview "Visibility" is the mention rate. |
| 3.2 | The prompt composite scores "nobody named" as a competitive share of 0, the same as losing to every rival. | That component is not applicable and its weight is redistributed; bump the scoring version. |
| 3.3 | Three share-of-voice definitions. The Share of voice tile shows the mention-level share, but its change line came from the response-level share, which nothing else shows. | One definition: the comparison delta and trends use the mention-level share; `responseSov` and `sov.response` are removed. |
| 3.4 | Overview brand rank is an index into SOV-sorted rows, so with no mentions the rank depends on the brand's name. | Rank is null when share of voice is null. |
| 3.5 | Unknown rendered as 0 (`total_failed`, `avg_queries_per_execution`). | Declined: no screen reads `total_failed`; the coverage strip reads the nullable `counts.failed`. |
| 3.6 | Range mode mixes last-run fields (position, citations, provenance) with pooled counts. | Position and provenance are pooled; citation totals are omitted in range mode. |
| 3.7 | Dead `sentiment` fields: never computed, never shown. | Deferred to the backlog with "recommended vs mentioned", which replaces it; removing a null field touches 17 files. |

## Phase 4: UX

| # | Finding | Change |
|---|---|---|
| 4.1 | Decision 1: tiles carry no denominator, coverage or baseline; `comparison.status` is never shown. | Coverage strip under the headline tiles. |
| 4.2 | Failed executions show only a badge; `error_code` is never rendered. | Plain reason and next step per error code. |
| 4.3 | A schedule disabled by failures stores one opaque code that the UI never shows. | Store the admission error code; show "Paused: reason" with Resume, which resets the failure count. |
| 4.4 | "Waiting for Google" is shown for the ChatGPT and Gemini search surfaces too. | Name the engine. |
| 4.5 | Topic and prompt delete take one click; topic delete unassigns its prompts and subtopics. No UI renames a topic. | Confirm with the effect stated. Inline topic rename moved to the backlog. |
| 4.6 | CSV import previews 501+ rows as ready, then the server rejects all of them; success closes with no result. | Enforce the row limit before import. Added and skipped counts moved to the backlog: the import response returns the set, not counts. |
| 4.7 | A failed measurements read hides the columns as if never measured. | Moved to the backlog (low impact). |
| 4.8 | Moving an active prompt to another topic skips topical binding; create binds before taking the project lock. | Bind on topic change; bind under the lock. |

## Phase 5: tests and documents

- Add: the audit lane's `nextDue` drives the runner; the composite with nobody
  named; trend bucketing before the cap; Overview mention rate and null rank;
  funded reservation settles; prompt topic move binds.
- Remove: the CPython `random.shuffle` golden in `audit-slot-order.test.ts`
  (replaced by permutation and determinism properties), the Python rounding
  parity case, status-mapping restatements in `lib/runs/status.test.ts`, and
  UI assertions of copy, bare numbers or mock plumbing found by the audit.
- Rewrite [visibility-prompt.md](../visibility-prompt.md) from the shipped
  behaviour and drop its Python references; update the backlog.

## Follow-up: prompt generation and brand matching

Its own PR, after this one. Evidence: generating for `theasianschool.net`
produced prompts that all named Uttarakhand.

- **Two modes with distinct jobs.** Quick generate covers the broad market:
  themes, buyer intent, products and services, and buyer personas, phrased as
  real buyers ask AI. Agent generation is the methodical deep dive into a
  specific offering, with location, niche intent and other attributes. Today
  the two overlap and location leaks into broad prompts.
- **Research first.** Use a research subagent to study the searchable.com
  prompt-universe philosophy and comparable tools, then simplify both modes.
  Calibrate with evals and live calls.
- **Hardening.** Keep admitted drafts when a later batch fails, add an
  idempotency key, cap the per-request count so generation fits under the
  100 s Cloudflare limit, read narrow columns in the generation context, and
  replace operator-only error copy.
- **Brand matching.** Remove the hardcoded single-brand disambiguation in
  `analysis/scoring.ts` (an `Australia` rule and a `["target"]` list) and design
  per-project disambiguation, with an analyzer version bump. Also match brands
  in scripts without spaces.
