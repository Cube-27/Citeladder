# Opportunities, actions and verification improvement plan

Feature 4 of the [feature review tracker](feature-review-tracker.md); this is its
audit-derived plan. **Status: complete (2026-10-08), shipped in one PR.** Shipped
behaviour is owned by [Opportunities](../opportunities.md), not by this plan.
Constraints: [invariants](../invariants.md), especially workspace authorization,
persisted-projection reads, commit-before-network-I/O and distinct unknown /
unavailable / zero states.

## Why

A read-only audit of the refresh and ranking path, Action workflow,
declarations, verification, the read routes, the Actions UI and their tests
(2026-10-08) found verification that reports work verified when it is not, or
never verified when it is. It also found re-verification that grows without
bound, a refresh stall, refreshes that skip new evidence or overwrite newer
evidence, routes nobody calls, and measurement screens that print raw enums
and never show the causality notice.
File references are to `frontend/services/api/src/` or `frontend/` as noted.

## Owner decisions (2026-10-08)

1. **UX addition: a measurement checklist.** The declaration dialog asks when
   the change went live and previews what each finding will be measured by.
   After declaring, each check shows met / not met / waiting / not measurable,
   with a reason and next step and the causality notice.
2. **Re-verification is bounded to 30 days** after go-live. The owner also
   asked for a recrawl option, because the Site Health Changes tab stays empty.
   The audit found every crawl already re-queues the monitored pages; the
   empty tab had three other causes (3.6-3.8), and the recrawl option is
   **Run crawl now** on the Action's crawl step.
3. **Findings that cannot be isolated get prompt-scoped checks or none.**
   Measuring by the project-wide score let any healthy project verify work it
   had not done.
4. **Remove the four unused Opportunity routes:** summary, history, CSV and
   Markdown export, and on-demand recompute.
5. **Traffic impact gets its own PR.** The tracker's fourth parameter becomes
   "Visibility and traffic impact"; measuring how visibility work converts to
   traffic is a separate plan, which may need public copy (backlog).

## Phase 1: runtime correctness and cost

| # | Finding | Change | Where |
|---|---|---|---|
| 1.1 | **Stall.** The analytics runner lane has no `nextDue`, so every analytics retry (refresh, verification, inspection) waits for the 10-minute tick. | `TaskQueue.nextDue` over the worker's kinds, registered on the lane. | `queue/task-queue.ts`, `workers/analytics-worker.ts`, `workers/runner.ts` |
| 1.2 | Every analytics task and boundary runs an uncached workspace access check. | `cachedWorkspaceAccess` with `access_check_ttl_seconds`. | `workers/analytics-worker.ts`, `config/analytics.json` |
| 1.3 | The refresh skip ignores source-page readings, so an inspection's refresh returns the old snapshot. | A source identity (audit, crawl, demand revision, link run, newest reading) is stored on the snapshot and compared. | `opportunities/refresh.ts`, `refresh-compute.ts` |
| 1.4 | A skipped refresh still loads all evidence (about 27 queries). | Resolve the identity first; skip before any load. | `opportunities/refresh.ts` |
| 1.5 | Evidence loads before the lock, so a slower refresh can supersede a newer snapshot with older evidence. | Re-resolve the identity under the lock; a moved source fails for a retry. | `opportunities/refresh.ts` |
| 1.6 | Action sync rewrites every cleared Action on every refresh and inserts new groups one at a time. | Clear once; batch inserts. | `opportunities/action-sync.ts` |

## Phase 2: verification correctness

| # | Finding | Change |
|---|---|---|
| 2.1 | **False verification.** Traffic checks compare the project-wide click total with 1, so any click anywhere, even before the declaration, verifies. | Clicks per day on the member's page or query against the rate frozen from the last window before go-live, read from windows starting on or after go-live. Sync windows differ in length, so they compare as rates; the Search Console leg waits for such a window instead of a 28-day one that would close after the verification window. |
| 2.2 | **Never done.** `verified` needs one source to observe every check, so a page Action with a crawl check and a traffic check stays measuring forever. | Per-check readings fold across sources under a row lock; answers beat non-answers, later answers win in any arrival order. |
| 2.3 | **Unbounded.** Every trigger re-reads every declaration ever made, about 20 queries each, in one transaction, appending an unchanged observation per source. | Window (decision 2), source-kind filter, per-declaration transactions, and append only on a reading or a changed state. |
| 2.4 | Commerce, topic and prompt-less visibility members are verified by the project score. | Decision 3. |
| 2.5 | A future go-live time locks an Action at `implemented` forever. | Reject the future and anything before the window. |
| 2.6 | A placement declaration without a read publisher page stores a check that can never run. | Refuse it (409). |
| 2.7 | Existing evidence after a backdated go-live is ignored until the next trigger. | Queue the latest crawl, audit and window for the declaration. |
| 2.8 | Verification is queued for projects with nothing declared. | Gate the enqueue on a declaration in the window. |
| 2.9 | Effective status runs the latest-observation subquery twice per Action. | One subquery. |

## Phase 3: ranking, debt and Site Health

| # | Finding | Change |
|---|---|---|
| 3.1 | A decline the audit already confirmed is dropped below the surfacing floor unless confidence ≥ 0.67. | Confidence ranks from a floor; size counts in multiples of the materiality floor, capped. Formula version 2. |
| 3.2 | Load caps truncate silently; a prompt cut mid-way reads as brand-absent. | Drop the partial prompt whole and record the cut as a limitation. |
| 3.3 | Five rule IDs no catalog emits (carried from feature 1), two Opportunity rules that can never fire, the atom-presentation override, dead config constants. | Removed; fixtures moved to live rules. |
| 3.4 | Decision 4. | Routes, server reads, contract schemas, client code and tests removed; the `action_path` filter with no caller too. |
| 3.5 | `page_fact` checks are never produced. | Evaluator, contract arm and leg mapping removed. |
| 3.6 | The budget-derived page limit is in the Changes scope hash, so a smaller fetch balance makes the next crawl non-comparable. | Removed from scope. |
| 3.7 | A one-page rerun writes the newest change snapshot, hiding the real comparison, and can fake page removals. | Reruns are marked, write no snapshot, are never a predecessor, and older rerun snapshots are hidden. |
| 3.8 | A declared fix never shows as expected in Changes: `pass` is compared with `satisfied`. | Map the declared outcome to the evaluation vocabulary. |
| 3.9 | A declared page late in the URL order can fall outside a small crawl budget. | Declared pages seed first. |

## Phase 4: UX

| # | Finding | Change |
|---|---|---|
| 4.1 | Decision 1. | Go-live date, measurement preview, per-check checklist, focus to Measurement, **Run crawl now**. |
| 4.2 | The causality notice is documented but never shown. | Shown under the checklist. |
| 4.3 | Raw enums on screen ("Verification: contradicted", "ai referral: not comparable"). | Labelled vocabulary. |
| 4.4 | What to do is one click deep per finding. | Remediation under each finding. |
| 4.5 | "Run a comparable audit" shows on placement-only declarations. | Only with a prompt check. |
| 4.6 | Top Insights hides read failures; the Action detail spins forever without a workspace. | A read error and an explanation. |

## Deferred to the backlog

Manual order applies per keyset page; priority is a bare number with no "why
this rank"; status counts are not shown in the filter; the catalog-field load is
unscoped; placement and traffic observations lack a top-level source id column;
the per-observation comparison result still costs about 20 queries. Each is in
the [backlog](backlog.md) with its reason.

## Tests and documents

- Added: analytics lane `nextDue`; the source-page reading defeats the skip;
  per-source folding verifies a mixed declaration; site-wide clicks never stand
  in for the page's row; project-score and missing-prompt checks stay
  unmeasurable; the window excludes an old declaration; no verification task
  without a declaration; go-live bounds; unmeasurable findings declare with no
  check; an unread publisher page is refused; reruns write no comparison but
  still hand off; the page limit never breaks a pair; the declared outcome
  mapping; decline ranking and fold ordering; the date helpers; the dialog's
  date and the crawl offer.
- Fixtures are relative to now, so the window never expires them.
- Removed, with reasons: route tests for the four retired routes; client tests
  that restated enums, asserted field presence or Zod's own stripping, or
  covered the summary and `action_path`; the `page_fact` test (retired kind); an
  Action test's re-parse that could not fail and its router-405 assertion.
- Rewritten: [Opportunities](../opportunities.md), the Site Health
  [Change intelligence](../site-health.md#change-intelligence) and crawl
  seeding notes, and the public Actions page.
