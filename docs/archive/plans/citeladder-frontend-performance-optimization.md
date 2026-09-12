# CiteLadder frontend performance optimization

> Retired from the working queue by the owner. Historical scope and evidence
> follow; imperatives below do not authorize execution or establish acceptance.
> Current owners are listed in [the documentation index](../../README.md).

**Status:** Planned; application implementation is deferred. This document does
not claim completed fixes or measured performance improvements.

## Summary and evidence

Inspected commit `9517c0d9f13abe82d8037dac38978e9277558139`, with a clean working tree.

The frontend uses Next.js 16.3.4 App Router, React 19.2.8, and TanStack Query
5.102.8. Cache Components, partial prefetching, and Strict Mode are enabled;
React Compiler is not configured. The shared QueryClient persists across
navigation, with 60-second freshness and 30-minute retention. Browser requests
use the same-origin API proxy.

Existing protections include persistent shell navigation, owner-scoped retained
query data, route/tab prefetching, and a Playwright instant-navigation assertion.
Preserve these contracts.

A fresh Chromium 151.0.7922.34 session reached the local app but redirected
`/projects` to `/login`. The existing optimized build dates from September 7,
2026 and was not established as matching the inspected commit. **No authenticated
performance baseline or runtime-confirmed performance findings are claimed.**
No validation suites were run during the read-only audit.

## Baseline before implementation

Use a fresh optimized build of the recorded implementation-base commit. Preserve
the running stack; use an isolated local frontend process and the existing
task-local backend configuration. The default Playwright configuration starts a
development server and must not supply performance conclusions.

Reuse existing browser fixtures with populated, schema-valid responses.
Intercept all API traffic, including automatic mutations, so captures cannot
reach providers or change persisted state. Label fixture results as client-side
evidence; real API latency requires a separate safe authenticated capture.

Measure these five journeys:

| Journey | Actions and observations |
|---|---|
| Initial entry | Enter `/projects`; distinguish authentication, project resolution, shell readiness, and meaningful data readiness. |
| Repeat navigation | Navigate `/projects` → `/performance` → `/site?tab=pages`, then return. Compare hover/focus intent with direct touch navigation. |
| Data-heavy screen | Open `/site?tab=architecture`, expand a page-kind list, and scroll. Record returned node count, DOM size, long tasks, and frame behavior. |
| Filters and tabs | Change Performance granularity/range; switch Visibility tabs and filters. Observe immediate feedback, retained content, request order, and final readiness. |
| Overlays/mobile | Open compact navigation, hand off to Command Palette and Growth Agent, close with Escape, and repeat. Check focus, scrolling, and listener growth. |

For affected journeys, collect three comparable runs per relevant condition:

- Desktop: 1440×900, unthrottled.
- Mobile emulation: 390×844, 4× CPU slowdown.
- Record browser version, build mode, dataset counts, network settings, cache
  state, and warm-up sequence.
- Separate fresh-context cold entry from warmed route/query caches.
- Use identical fixture response delays before and after; separately delay
  individual responses to diagnose waterfalls.
- Capture browser traces and request waterfalls. Use React profiling only for
  attribution, then verify without profiling instrumentation.
- Report individual values and median/range, without percentile or
  percentage-gain claims.

Pause builds, tests, and heavy agent work during timed captures. Keep raw
artifacts in existing temporary/test-output locations.

## Prioritized implementation slices

### 1. Make Performance navigation prefetch match its destination

**Priority:** First; common navigation path, strong code evidence, bounded change.

**Evidence status:** Code-supported hypothesis about user-visible delay;
cache-key mismatch established by inspection.

**Evidence:** [route-prefetch.ts](../../../frontend/lib/navigation/route-prefetch.ts)
requests `{ range: 'custom', compare: 'none' }` in its `/performance` prefetcher
(line 41 at the inspected commit). The screen's initial selection in
[date-range-dialog.tsx](../../../frontend/components/performance/date-range-dialog.tsx)
is `last_synced`, with `granularity: 'day'` from
[use-performance-selection.ts](../../../frontend/components/performance/use-performance-selection.ts).
Its query key includes these parameters.

**Causal explanation:** Hover/focus warms a different cache entry from the one
consumed by the destination. Navigation therefore still needs the screen's
actual dashboard request.

**Proposed change:**

- Put initial Performance range, comparison, and granularity defaults in the
  owning frontend configuration.
- Add a typed dashboard query-options factory under the existing Performance
  API owner.
- Make navigation prefetch and the screen consume that factory and the same
  initial defaults.
- Preserve custom selections, project isolation, cancellation, freshness, and
  mutation invalidation. Do not change server defaults or endpoint contracts.

**Verification:** Complete hover/focus prefetch, navigate, and verify the screen
consumes that result without another dashboard request while fresh. Also cover
direct navigation, stale-cache refetch, custom ranges, and project switching.
Compare destination meaningful-content readiness.

### 2. Prevent tab intent from disturbing settled errors

**Priority:** Second; shared interaction defect with limited implementation scope.

**Evidence status:** Code-supported hypothesis; browser reproduction pending.

**Evidence:** `useSiteHealthTabPrefetch` in
[site-health-screen.tsx](../../../frontend/components/site-health/site-health-screen.tsx)
(line 110 at the inspected commit) and `prefetchTab` in
[use-visibility-dashboard.ts](../../../frontend/lib/visibility/use-visibility-dashboard.ts)
(line 275) call `prefetchQuery` directly. Shared Tabs invokes intent on
hover/focus, including the selected tab. Route prefetch already guards failed
cached queries.

**Causal explanation:** Intent can restart a failed query and replace its
settled error with loading UI, making hovering or focusing a tab appear to
reload content.

**Proposed change:**

- Move the existing guarded prefetch behavior into the shared query owner and
  reuse it for route, Site Health, and Visibility intent.
- Preserve the rule that intent does not retry a cached error.
- Leave explicit retry, destination mounting, polling, and invalidation behavior
  intact.
- Do not add timers, debounce, another cache, or blanket changes to tab
  activation.

**Verification:** With an active tab showing a settled error, hover and
keyboard-focus its trigger. Assert that the error remains visible and no intent
request starts. Verify explicit retry still succeeds, successful inactive tabs
still prefetch, and project/crawl switches cannot reuse another owner's data.

## Measurement-only follow-ups and acceptance

These remain investigation tasks, with **no optimization prescribed yet**:

- **Performance loading churn:** `PerformanceScreen` sends
  `isFetching || projecting` into metric loading slots, replacing cached numbers
  with spinners while retained chart data remains. Reproduce background refetch
  and range changes; distinguish required projection feedback from unnecessary
  replacement of usable values.
- **Architecture rendering:** `HierarchyList` renders all returned descendants;
  bounded scroll height does not bound DOM size. Measure realistic large
  projections before proposing windowing or pagination.
- **Shell startup:** Project-level run/dashboard prefetch, entitlement/usage
  reads, and tour state may compete with current-route requests. Attribute actual
  waiting before changing their timing or authorization dependencies.
- **Eager shell dependencies:** Inspect optimized bundle contribution and parse
  cost of Driver.js and Growth Agent dependencies. Introduce lazy loading only
  if measured savings outweigh first-open delay.
- **Marketing:** Separately inspect `/` and its mobile menu/scroll behavior,
  including the fixed blurred navigation. Public-page results cannot substitute
  for authenticated-app measurements.

Do not gate Visibility prompt metrics behind the run-list request merely to
eliminate a possible unused request; that could introduce a populated-page
waterfall. Do not blanket-add memoization, virtualization, compiler changes, or
longer cache lifetimes.

For later implementation:

- Reuse existing query, Site Health, Visibility, and shell tests; add only missing
  observable-behavior coverage for the two slices.
- Preserve routes, design, keyboard/focus behavior, scroll restoration,
  loading/error semantics, workspace isolation, and data freshness.
- Keep backend latency remedies, schema changes, deployment, provider activity,
  and unrelated cleanup outside this plan.
- After the complete executable diff, run `.\scripts\check.ps1` then
  `.\scripts\test.ps1` once, following repository retry rules.
- Repeat affected baseline journeys after final simplification. Retain changes
  only when they remove the identified redundant request or loading transition
  without adjacent regressions.
- Report a compact before/after table, retained fixes, validation results, and
  remaining unverified surfaces.
