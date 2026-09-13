# Runtime correctness and continuity — partially delivered

Selected by the owner on 13 September 2026; the first delivery was paused for a
bounded commit after Slices 0–2 and the logo-refresh ownership correction.
Selection does not authorize a deployment or database reset. This plan converts
the supplied GLM 5.3 audit into repository-grounded work. Current code, tests,
owner documents, and reproduced runtime behavior take precedence over the audit
whenever they disagree.

## Delivery status

- **Delivered in the first bounded change:** Slice 0A, Slice 0B, Slice 1,
  Slice 2, and Slice 3 item 5.
- **Pending:** Slice 3 items 1–4, Slice 4, and the measured decisions in
  Slice 5.
- **External acceptance pending:** repeat the Site Health incident and SSE
  idle-timeout/disconnect checks after a separately authorized deployment.

## Outcome

Make the authenticated application preserve truthful, useful UI while data is
loading or changing, beginning with the Site Health failure reproduced in both
local and deployed environments. The work should:

- restore the Site Health dashboard after starting a crawl;
- keep streaming endpoints from holding request-scoped database transactions;
- remove blank and misleading loading states;
- retain prior data only within the same authorized project scope;
- stop terminal failures from polling indefinitely;
- reduce avoidable remounts, history entries, and duplicate requests; and
- remove ambient workspace state after every affected caller is explicit.

This is a sequence of independently reviewable slices, not a frontend rewrite.

## Confirmed incident evidence

### 1. Site Health rejects a valid response

The crawl command succeeds and the Site Health dashboard request returns `200`
in both environments. The visible `Could not load Site Health` banner is the
dashboard query error state, not the crawl mutation error state.

The backend intentionally includes `other` in the scored cohort when pages of
that classified kind receive general checks. That behavior is covered by the
backend terminalization snapshot tests and is consistent with the owner
contract: `other` is classifier abstention, not a prohibition on all scoring.

The frontend contract currently disagrees:

- [`frontend/lib/api/schemas/site-health/crawl.ts`](../../frontend/lib/api/schemas/site-health/crawl.ts)
  excludes `other` from `scored_page_kind_set` and the count map;
- [`frontend/lib/api/schemas/site-health/dashboard.ts`](../../frontend/lib/api/schemas/site-health/dashboard.ts)
  repeats the narrower vocabulary for cohort composition; and
- [`frontend/lib/api/site-health-measurement-contract.test.ts`](../../frontend/lib/api/site-health-measurement-contract.test.ts)
  explicitly asserts that the valid response is rejected.

This schema drift is the direct cause of the generic error screen. The backend
score projection should not be changed to accommodate the stale client schema.

### 2. SSE request sessions outlive their transactions

Both local and deployed logs show unhandled SQLAlchemy rollback errors after
Site Health event streams disconnect or outlive the PostgreSQL idle transaction
timeout. The stream generator already opens short private sessions, but the
route also acquires a request-scoped session for authorization. FastAPI retains
that yielded dependency for the lifetime of the streaming response, leaving
its read transaction idle until PostgreSQL closes the connection.

This is a separate runtime defect; it does not explain the response validation
failure above. The same lifecycle pattern must be checked in the audit event
stream rather than patched only in Site Health.

## Decisions on the supplied audit

| Audit item | Decision | Repository-grounded interpretation |
|---|---|---|
| PERF-01 | Commit | Onboarding can render nothing during project/workspace resolution. Use the established shell loading state. |
| PERF-02 | Commit | Visibility retains detail data but not the main projection. Retention must be scoped by project and measurement identity. |
| PERF-03 | Commit | Measurement history treats pending data like an empty result. Reserve chart geometry and distinguish pending, empty, and error. |
| PERF-04 | Refine | Add bounded stall escalation and a working retry, using the existing request timeout/retry contract. Do not add a second global timeout policy. |
| PERF-05 | Commit | Content-detail polling continues after terminal request errors. Stop polling and render the terminal state. |
| PERF-06 | Commit | A broad dashboard key remounts unrelated state when action ordering changes. Narrow the reset boundary to its owner. |
| PERF-07 | Commit | Fanout search writes history and drives server work per keystroke. Separate immediate input from deferred server filtering and use replace semantics. |
| PERF-08 | Reject | First-use Site Health and run-list warmups return valid empty `200` responses. `warmQuery` would not cure the alleged 404 behavior. |
| PERF-09 | Measure/design gate | The terminal overview needs the crawl identity returned by the dashboard. A parallel effect without that identity can select an active crawl with no snapshot and fail. |
| PERF-10 | Measure/design gate | Blanket `forceMount` retains heavy hidden panels and queries. Use it only for a measured, cheap panel whose local-state loss harms the workflow. |
| PERF-11 | Commit | Ambient workspace-header mutation remains a correctness risk while flat workspace-scoped callers exist. Migrate callers before deleting the compatibility mechanism. |
| PERF-12 | Commit | Project creation and logo hydration can request the same refresh. Establish one owner and one list refresh. |
| PERF-13 | Refine | Combined loading gates sometimes preserve semantic truth. Split only sections whose data and empty-state meaning are genuinely independent. |
| PERF-14 | Later consolidation | Consolidate identical loading semantics after correctness work; do not replace distinct pending, background-refresh, and blocking states with one spinner. |

The previously fixed create-project seed/navigation race is not reopened. No
new motion library, global client state system, or speculative cache layer is
part of this plan.

## Delivery slices

### Slice 0 — restore Site Health and correct streaming ownership

Ship these as two commits or pull requests if review or rollback independence
is useful.

#### 0A. Align the Site Health response contract

1. Make every scored-cohort projection accept the full backend `PageKind`
   vocabulary, including `other`. Keep absence, zero, and unclassified evidence
   distinct.
2. Update the dashboard cohort-composition schema and inferred types at the
   same time; do not leave one endpoint stricter than the other.
3. Replace the stale rejection test with a realistic response containing
   `other` in the set, count map, and by-kind projection.
4. Add a user-visible regression at the smallest screen/query boundary: a
   running crawl whose dashboard includes `other` must render progress or data,
   not the generic load error.
5. Remove or correct comments and copy that imply `other` can never be scored.
   Preserve the true rule that page-kind-specific checks may be inapplicable
   while general checks still contribute scores.

#### 0B. End authorization database work before streaming

1. Define one backend streaming boundary that captures only authorized,
   immutable primitives needed by the generator, then completes the
   request-scoped database transaction before the `StreamingResponse` begins.
2. Keep the generator's short-lived session-per-read behavior. Do not share an
   `AsyncSession` across the stream or hold a pool connection while waiting for
   events.
3. Apply the boundary to Site Health events and to the audit event route if its
   inspection confirms the same dependency lifetime.
4. Preserve cursor behavior, disclosure policy, project/workspace
   authorization, heartbeat timing, lease semantics, and disconnect cleanup.
5. Exercise the real PostgreSQL boundary: keep a stream open beyond the idle
   transaction timeout, cancel it, and confirm there is no held request
   transaction and no teardown rollback error.

### Slice 1 — remove blank, false-empty, and endless loading states

1. Replace the onboarding `Suspense` `null` fallback and gate-level `null`
   returns with the shared calm shell loading state. Expose a truthful status
   while project, workspace, or entitlement ownership is unresolved.
2. Give Visibility measurement history a chart-sized pending placeholder.
   Empty copy appears only after a successful empty response; an error keeps
   its existing error treatment.
3. Stop content-generation detail polling when the query is in an error state,
   especially for `404` and authorization failures. A manual retry may restart
   the query; a timer may not.
4. Add a bounded stalled-loading escalation only where users can otherwise be
   trapped behind a shell fallback. Retry must invalidate or refetch the actual
   owner query. Reuse the API client's existing timeout and retry behavior
   instead of layering another network deadline.

### Slice 2 — preserve continuity without leaking scope

1. Add scope-safe previous-data retention to the main Visibility projection.
   Prior data may remain visible while changing selection within the same
   project; it must disappear immediately when project/workspace identity
   changes.
2. Keep the trends layout mounted while the newly selected measurement loads.
   Show the retained timestamp/data with a clear background-busy state until
   the requested measurement replaces it.
3. Narrow the dashboard reset key to action-ordering state. A version update
   must reset or reconcile the action list without remounting Top Insights and
   unrelated local UI state.
4. In Query Fanout, update the visible input immediately, defer or debounce the
   server-backed summary query, and replace rather than push URL history for
   incremental edits. Define whether the local table is immediate or deferred
   so its counts never silently disagree with the labeled server totals.

### Slice 3 — make workspace scope and project creation explicit

This is a risky correctness slice and should not be mixed with visual polish.

1. Inventory every flat workspace-scoped frontend API call and its query key,
   including dashboard, warmup, route-prefetch, mutation, and invalidation
   paths.
2. Pass `workspaceId` explicitly through query options and request functions.
   Include it in cache identity wherever the result varies by workspace.
3. Test two workspaces with late and out-of-order responses. A request created
   under workspace A must never acquire workspace B's header or populate B's
   cache after a context switch.
4. Delete the project-context ambient header effect and API-client mutable
   setter/getter only after repository search proves no scoped caller depends
   on them. Project-derived endpoints may retain their documented path-based
   authorization rather than receiving a redundant header.
5. Give logo hydration one refresh owner during project creation. Preserve the
   seed-before-navigation guarantee and refetch the project list only when the
   logo result changes it.

### Slice 4 — consolidate established loading patterns

After the prior behavior is stable:

1. Classify loading UI as blocking initial load, reserved-geometry initial
   load, background refresh, or inline action progress.
2. Consolidate duplicate busy bars and spinner wrappers only within one of
   those meanings. Continue using the design tokens in `globals.css` and
   respect reduced motion.
3. Review combined gates one section at a time. Keep semantic dependencies
   such as prompt/topic grouping intact; split a gate only when the partial
   content remains truthful and actionable.
4. If a delayed inline indicator is introduced, use one shared delay policy
   and verify that it reduces flash for fast requests without hiding meaningful
   work.

### Slice 5 — measure-gated follow-ups

These items do not begin until traces demonstrate a material problem and the
chosen design respects the current owner boundaries.

- Site Health terminal overview: measure the dashboard-to-overview waterfall.
  If material, prefer an explicit terminal snapshot identity or an owner-level
  composite read. Do not issue an ambiguous latest-crawl request in parallel.
- Tab persistence: record remount cost, request duplication, DOM/memory cost,
  and user-state loss before opting a specific panel into `forceMount`.
- Placeholder-to-content motion: if usability testing supports it, add a small
  shared content-in transition only at stable geometry boundaries. Never
  cross-fade project or workspace data.

## Invariants

- Browser traffic remains same-origin `/api/v1` through the frontend proxy.
- Every project-owned request remains workspace-authorized; cache retention and
  placeholders never cross project or workspace identity.
- Reads render persisted projections and do not trigger crawls, providers,
  repair, or model work.
- `other`, unavailable, zero, empty, error, historical, and not-applicable
  remain distinct states.
- Raw evidence, provenance, score formula versions, and classifier versions are
  unchanged by this UI contract correction.
- Streaming waits do not hold a request transaction or reuse sessions across
  concurrent reads.
- Project creation remains seed-then-navigate. No autonomous external mutation
  or duplicate logo refresh is introduced.

## Verification strategy

Validation follows the risk of each completed slice and uses explicit changed
paths so unrelated working-tree changes remain untouched.

- **Slice 0A:** targeted frontend schema/API and Site Health screen tests,
  including a payload with `other` in all scored-cohort fields.
- **Slice 0B:** backend Site Health/audit event tests plus a real PostgreSQL
  integration covering authorization, a stream held beyond the configured idle
  timeout, cancellation, and connection-pool cleanup.
- **Slice 1:** targeted component/hook tests proving visible onboarding pending
  state, pending-versus-empty chart behavior, and no additional content-detail
  requests after a terminal failure.
- **Slice 2:** targeted Visibility, dashboard, and Fanout tests proving
  same-project retention, cross-project clearing, narrow remount behavior,
  request coalescing, and replace-history behavior.
- **Slice 3:** frontend API/query integration tests with two workspaces and
  delayed responses, plus project-creation coverage proving exactly one logo
  refresh owner.
- **Slices 4–5:** behavior tests only where code makes a meaningful decision.
  Do not add utility-class, source-text, broad snapshot, or motion-timing tests.

For browser acceptance, use throttled requests and React/query diagnostics to
observe continuity and request counts. Then run a real local crawl containing
at least one `other` page and confirm:

1. the running and terminal Site Health screens render without the generic
   load error;
2. event streaming remains healthy through the database idle timeout and a
   client disconnect;
3. no request or retained projection crosses project/workspace scope;
4. terminal content failures stop polling; and
5. project creation produces one logo refresh path.

After a separately authorized deployment, repeat only the incident acceptance
path in GCP and inspect application/database logs for the SSE teardown error.
The plan itself does not deploy or mutate production data.

## Cutover and deletion checklist

- Remove the frontend-only scored-page-kind exclusion and its rejection test.
- Remove stale comments that equate classifier abstention with no general score.
- Remove onboarding `null` loading paths after the shared status state replaces
  them.
- Remove the broad dashboard remount key after action state owns reconciliation.
- Remove the content-detail error polling path.
- Remove ambient workspace header state only after the caller inventory is
  empty and cross-workspace tests pass.
- Remove the duplicate logo refresh trigger after one owner is established.
- Remove duplicate busy-bar/spinner implementations only when their semantics
  are genuinely identical.

## Out of scope

- changing the backend scoring cohort to exclude `other`;
- database backfills, resets, or schema changes;
- resuming an archived Site Health rebuild wave;
- changing provider, crawler, classifier, or model behavior;
- blanket tab mounting or blanket decomposition of combined loading gates;
- a new animation library, cache layer, or frontend state framework; and
- deploying it or changing the remaining release queue without an explicit
  owner decision.
