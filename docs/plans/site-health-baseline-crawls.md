# Site Health baseline crawls (draft)

Status: **draft, open for review with the owner; not authorized for
execution.** The owner asked on 2026-11-12 for this plan to stay open for
review after the Issues and page-screen rebuild (PR #757) ships. It owns *what
a crawl measures over time*. [Site Health](../site-health.md) owns the shipped
crawl lifecycle, and the [invariants](../invariants.md) bind any change.

## Goal

Crawling should track how issues are resolved over time, not how one crawl
differs from the next. **Run new crawl** starts a new baseline. Recrawl,
re-auditing a page, and scheduled audits measure against that baseline. Each
baseline tracks three measures: the number of URLs, the number of open issues,
and the date. Today the counts move because the set of URLs a crawl analyzes
moves. With the set fixed, they would move only because issues were fixed or
introduced.

Crawling splits into **discovery** (every URL the site exposes) and
**analysis** (the URLs the plan allows). Showing how many URLs discovery found,
next to how many were analyzed, also invites a higher plan, as Searchable does
([site audits](https://docs.searchable.com/using-searchable/site-audits)).
Content issues are already shown apart, in the Issues screen's Content tab.

## Problem (from the code, 2026-11-12)

- **Discovery and analysis run together in one crawl.** `frontier.ts` sends
  each admitted URL straight to analysis, and both stages count against one
  `requested_page_limit` (`planner.ts`).
- **The set of URLs drifts.**
  - Each new crawl draws a new `random_seed`.
  - The page limit is capped again by the fetch budget left in the period
    (`fetch-budget.ts`).
  - Bootstrap memberships accumulate.
- **A page re-audit creates a one-page crawl that writes a full snapshot**
  (`lifecycle.ts`).
  - The trend (`snapshot.ts`) then compares the next full crawl with that
    one-page "crawl".
  - The dashboard and the pages and issues reads follow the newest crawl,
    reruns included (`reads/crawl.ts` `dashboardCrawl`). Overview skips reruns.
- **The trend checks only processing versions.** It ignores scope, the page
  limit, `inventory_complete` and crawl status.
- **Issues have no lifecycle.**
  - `site_issues` has no stable identity across crawls, and no first-seen or
    resolved date.
  - "Resolved" is a diff computed at read time (`reads/issues.ts` issue
    history).

## Proposed model

- **Discovery run.**
  - Builds the project's URL inventory from sitemaps and links, under a cap
    separate from analysis.
  - Persists "Discovered N URLs".
  - The screen shows "Analyzing M of N discovered (plan limit). Upgrade to
    analyze more".
- **Baseline.**
  - **Run new crawl** runs a new discovery, chooses the analysis set
    deterministically within the plan limit, and analyzes all of it.
  - The result is frozen as a baseline: its URL set and its issue set at t0.
  - The screen confirms first, because a new baseline starts a new tracking
    period.
- **Audits against the baseline.**
  - Recrawl, scheduled audits, single-page re-audit and the bulk **Re-run all**
    for an issue analyze only the baseline's frozen URL set: no discovery, no
    change to the URL set.
  - A page re-audit updates that page's issues within the baseline and never
    writes a site-wide snapshot.
- **Issue lifecycle.**
  - An issue's identity is (baseline, `site_url_id`, `rule_id`).
  - States:
    - open
    - resolved (a later audit verified it)
    - regressed
    - new since baseline
    - marked fixed: the user says it is fixed and a later audit has not yet
      verified it. This follows the Actions "Mark implemented" model and
      invariant §10.
  - Observations are append-only, with a projection of each issue's current
    state.
- **Three measures per baseline:** URL count (fixed), open issues, and the
  date.
  - The trend is one series per baseline, so its points are comparable by
    construction.
  - A new baseline starts a new series, and the chart marks where it starts.

## What it unlocks on the shipped screens

The owner deferred these to this plan on 2026-11-12:

- **Mark fixed**, and "N of M fixed" progress on the Issues summary and the
  issue dialog.
- **Re-run all** for an issue, which re-audits every affected page against the
  baseline.
- "New since baseline" deltas on the severity counts.
- A persisted score gain per issue ("+N Web Fundamentals"), computed at analysis
  time. Reads never score (invariant §6), so the screens show none today.

**Ask agent in the drawer** is deferred with this plan too. When it ships it
covers every Dashboard screen (owner, 2026-11-12):

- `openWith(handoff)` in `lib/agent/panel-context.tsx` seeds a fresh draft and
  opens the drawer. The earlier chat stays in the Agent's history.
- Swap `components/agent/ask-agent-link.tsx` for a button that calls it on
  Dashboard screens. It falls back to the full-page handoff in Agent mode or
  outside the shell.
- Close the drawer's two gaps with New chat:
  - pass `workflowId`
  - load an attached Action's message through one shared `useAttachedAction`
- Close an overlay (the issue dialog, the demand evidence drawer) before
  opening the drawer.
- Convert the Dashboard call sites that build `agentHandoffHref`,
  `actionHandoffHref` or `demandSignalHandoffHref` links.
- Drawer chats are already ordinary `agent_chats` rows listed in the Agent's
  history.

## Open questions

1. **Discovery cost.**
   - Does discovery fetch HTML (needed to find links), or rely on sitemaps and a
     shallow walk of links?
   - Does it spend the fetch budget?
   - What discovery cap does each plan get?
2. **Choosing the analysis set** when the inventory exceeds the plan limit:
   - Is it chosen by value tier, by the user, or both?
   - Can the user swap URLs during a baseline?
3. **A baseline URL that later answers 404 or redirects.** Does it count as
   removed (not resolved), and does it stay in the denominator?
4. **New URLs a scheduled audit finds.** Are they ignored until the next
   baseline, or surfaced as "N new URLs found, start a new baseline?"
5. **Should a scheduled run ever refresh discovery?**
6. **Old baselines.** How long are they kept, and how does an earlier
   baseline's history display?
7. **Schema shape.** A new `site_baselines` table with an issue-state
   projection, or `site_crawls.kind` plus a baseline foreign key? The project is
   greenfield, so there is no backfill; changes are forward migrations from
   0002.
8. **Current bugs: inside this work, or first as a small PR?**
   - Rerun snapshots polluting the trend.
   - The trend's comparability checks.
   - `dashboardCrawl` following rerun crawls.
