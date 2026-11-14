# Site Health tracked pages

Status: **active** as [Spec 5 of the audit remediation plan](audit-remediation.md#5-site-health-crawling-and-issue-tracking)
(owner, 2026-11-12). The owner settled the model on 2026-11-12
([owner decisions](#owner-decisions-2026-11-12)). That spec orders this plan's
PRs; their content is in the [PR breakdown](#pr-breakdown). One item is still
pending an owner decision and is not authorized:
[Ask agent in the drawer](#pending-owner-decision). [Site Health](../site-health.md)
owns the shipped crawl lifecycle, and the [invariants](../invariants.md) bind
every change. The file keeps its earlier name, "baseline crawls", so existing
links keep working.

## Goal

Site Health tracks how a fixed set of pages gets better over time. The system
picks a project's tracked pages once, up to the plan limit. Every crawl
(Recrawl, a scheduled crawl, a single-page or Re-run-all re-audit) audits those
same pages at a new point in time. The only change the product shows is open
issues over time.

Discovery only counts URLs. It reads the site's sitemaps, which is free and
takes seconds even for a 50k-URL site. The screen shows the count next to the
pages analyzed, which also invites a higher plan, as Searchable does
([site audits](https://docs.searchable.com/using-searchable/site-audits)).

## Problem (from the code, re-confirmed on `409cb3273`)

- **The analyzed set drifts.**
  - Each crawl's frontier order hashes `crawl.id` (`frontier.ts:107-123`,
    `:346`). The stored `random_seed` (`planner.ts:205`) is never read, so even
    Recrawl does not reproduce its URL set. [Site Health](../site-health.md#change-intelligence)
    says it does.
  - The page limit is capped again by the fetch budget left in the period
    (`fetch-budget.ts`).
  - Bootstrap memberships accumulate across crawls.
- **A page re-audit is a one-page crawl that acts as a site crawl.**
  - `planner.ts:382-430` inserts a real `site_crawls` row.
  - On drain, `lifecycle.ts:306-308` writes a project snapshot and overwrites
    the crawl's score summary with a one-page score.
  - The snapshot trend (`snapshot.ts:40-57`) then compares the next full crawl
    with it.
- **"Current crawl" has 11 selectors with about 7 rules** (ARC-001,
  [below](#audit-findings-absorbed-2026-11-12)). The dashboard and the project
  `/pages` and `/issues` routes follow the newest crawl, reruns included.
- **Issues have no lifecycle.** `site_issues` has no identity across crawls and
  no first-seen or resolved date. "Resolved" is a diff computed at read time
  (`reads/issues.ts`).
- **Discovery and analysis share one page limit** (`planner.ts`,
  `frontier.ts`), so a big site's discovered count is capped by the analysis
  budget.

## Model (decided)

- **Discovery** ([SH-B5](#owner-decisions-2026-11-12)).
  - Every full crawl reads the sitemaps first. It deduplicates the URLs under
    the URL-admission rules and stores "Discovered N" on the crawl.
  - There is no plan cap. Only technical safety ceilings apply (sitemap
    documents, bytes, time); when one is hit the screen shows "at least N".
  - Discovery is free and has no manual trigger. Single-page re-audits skip it.
  - A site with no sitemap falls back to a bounded HTML link walk and gets a
    new "No sitemap" issue (no such rule exists today).
- **Tracked pages** (SH-B6).
  - The system picks them: the root first, then value tiers in order, with a
    stable per-project hash inside each tier.
  - The person can't change them, and they are never re-picked.
  - Whenever the set is below the plan limit, each full crawl fills the free
    slots from the sitemap in the same order. That covers a first crawl
    cancelled early, a site that grew, and a plan upgrade.
  - A downgrade keeps the first N in fill order. The rest read "no longer
    tracked", never resolved.
- **Audits** (SH-B7).
  - Every crawl audits the tracked set: Recrawl, scheduled, Re-run all and a
    single-page re-audit. Recrawl and Run new crawl become one action.
  - A re-audit is refused while a crawl is running (SH-B4).
- **A tracked page that answers 404 or redirects** (SH-B8) stays in the set and
  the URL count. Its earlier issues read "page unavailable", never resolved. A
  new "returns 404" or "redirects to X" issue opens on it, and everything
  recovers when it answers 200 again.
- **Issue state** (SH-B2, SH-B9).
  - An issue's identity is (project, tracked page, rule).
  - States: open, marked fixed (awaiting verification), resolved (a later audit
    verified it), regressed, page unavailable, no longer tracked.
  - Every audit updates the state of the pages it audited, so a single-page
    re-audit moves the totals.
  - An issue family is open until it is resolved on every tracked page.
- **Current state is each tracked page's latest audit**, whichever crawl it came
  from (SH-B9). Issues, Pages, Overview, Opportunities, the Agent, MCP, AI
  Traffic, verification and internal links all read it.
  - SH-B1 ships first as the interim rule: newest usable full crawl, reruns
    excluded.
  - Scores and the issue state are computed when an audit lands, never on read
    (invariant 6).
- **Change is open issues over time**, one point per day. It replaces the
  Overview score trend.

## Owner decisions (2026-11-12)

Recorded from the owner's answers in the audit follow-up conversation and in
this plan's review conversation (2026-11-12).

- **SH-B1, one rule for the current crawl.** Every surface uses Site Health's
  rule: Opportunities, Overview, the Agent, MCP, AI Traffic, verification and
  internal links. The current crawl is the newest usable crawl that is not a
  one-page rerun. A rerun updates only its own page's evidence. SH-B9 later
  extends this to each tracked page's latest audit.
- **SH-B2, issues are tracked page-wise.**
  - Total issues are tracked per page, not per issue family.
  - An issue stays open until its issues are resolved on all of its tracked
    pages; resolving one page never resolves the whole family.
  - Verification of a declared fix follows the same rule. Every rule a page
    finding folds together must pass, and a sampled family must not read as
    fully verified.
- **SH-B3, defect fixes ship first** as small PRs on today's model
  ([phase A](#phase-a-defect-fixes-on-todays-model)), before the tracked-pages
  model.
- **SH-B4, no new work inside a running crawl.** Changes to which pages are
  analyzed, and re-audits (single page or Re-run all), are refused while a
  crawl is running. The person tries again when it finishes. This closes
  BE-903 without an in-crawl metering path.
- **SH-B5, discovery.**
  - Sitemap only, deduplicated, free (it does not spend the page-fetch
    allowance), with no plan cap.
  - No limit to sitemap reading, and every discovered URL is saved, tracked
    or not; the HTML walk keeps its cap. (Owner, in chat, 2026-11-14: "save
    every discovered URL and ship it no limit to sitemap reading HTML link
    following is fine".)
  - Every full crawl re-reads it. There is no manual discovery.
  - The discovered count is display only.
  - An HTML walk runs only when the site has no sitemap. That site also gets a
    "No sitemap" issue.
- **SH-B6, tracked pages.**
  - The system picks them by value tier in a stable order.
  - The person can't change them, and they are never re-picked.
  - While the set is below the plan limit, every full crawl fills it from the
    sitemap (e.g. 54 pages that later 404, plus 60 new URLs, makes 114
    tracked).
  - A plan upgrade extends the set in place. A downgrade keeps the first N in
    order.
- **SH-B7, one crawl action.** Every crawl, recrawl or scheduled crawl audits
  the same pages at a different time. Recrawl and Run new crawl are one button.
- **SH-B8, 404 and redirects.** A tracked page that answers 404 or redirects
  stays tracked and counted. Its issues read "page unavailable", never resolved,
  and a 404 or redirect issue opens.
- **SH-B9, per-page state; change is issues over time.** Screens read each
  tracked page's latest audit. Single-page re-audits update the totals. The only
  change graph is open issues over time.
- **SH-B10, crawl limits unchanged.** The page-fetch allowance already limits
  repeated crawls. There is no cooldown.
- **SH-B11, UI scope.** The work is backend plus three small UI changes:
  - one crawl button;
  - the Overview trend card plots open issues over time;
  - the Changes panel drops its "Recrawl to compare the same scope and
    settings" copy.

  The shipped Issues, page and Pages screens stay as they are.
- **SH-B12, the earlier deferred items.**
  - Mark fixed, with "N of M pages fixed": implement.
  - Re-run all: implement.
  - "New since baseline" deltas on the severity counts: delete.
  - Per-issue score gain: delete.
  - Ask agent in the drawer: still pending ([below](#pending-owner-decision)).
- **SH-B13, retire the set-changing APIs.** Delete these:
  - `PUT /projects/{id}/monitored-urls` and `bulk-select`, with the
    set-editing half of `selection.ts`;
  - the crawl request's advanced options: exact-URL and seed input modes,
    include/exclude globs, the page-kind filter and the page limit.

  Single-page re-audit and the free-sample path stay. This makes BE-904 and
  BE-905 moot.

Not asked separately: Q6 (old baselines) is moot under SH-B6. Q7 (schema) is an
engineering choice; see [below](#engineering-defaults).

## Pending owner decision

**Ask agent in the drawer.** Asked on 2026-11-12, the owner kept it pending.
If approved, it covers every Dashboard screen and is independent of the crawl
work:

- `openWith(handoff)` in `lib/agent/panel-context.tsx` seeds a fresh draft and
  opens the drawer. The earlier chat stays in the Agent's history.
- `components/agent/ask-agent-link.tsx` becomes a button that calls it on
  Dashboard screens. It falls back to the full-page handoff in Agent mode or
  outside the shell.
- New chat closes the drawer's two gaps: it passes `workflowId`, and one shared
  `useAttachedAction` loads an attached Action's message.
- Close any overlay (the issue dialog, the demand evidence drawer) before
  opening the drawer.
- Convert the Dashboard call sites that build `agentHandoffHref`,
  `actionHandoffHref` or `demandSignalHandoffHref` links.

## Engineering defaults

These are not owner decisions; the implementing PR may refine them within the
model.

- **Schema** (forward migrations, next number 0030 or later; no backfill):
  - The tracked set reuses `monitored_site_urls`, with a fill order and joined
    and left dates. "Left" happens only on a downgrade.
  - New `site_issue_states` holds one row per project, tracked page and rule:
    state, first seen, last seen, resolved, marked fixed, and the source issue
    and analysis IDs.
  - New `site_issue_trend` holds one row per project per day with the open
    count.
  - Crawl, analysis, evaluation and issue rows stay append-only (invariant 3).
- **Metering.** A re-audit of N pages holds N page fetches, like today's
  single-page rerun. A full crawl holds the tracked set size.
- **Change intelligence** keeps comparing crawl pairs. With one tracked set,
  every pair is comparable, so the non-comparable boundary only remains for
  version changes.

## Audit findings absorbed (2026-11-12)

The read-only audit of 2026-11-12 (baseline `000be94d2`) found these. All 16
were re-confirmed on `409cb3273` (12 November); none is fixed. Line numbers are
current. The last row is a new defect found during re-confirmation. The full
evidence is in the git-ignored `.artifacts/audit-2026-11-12/AUDIT-REPORT.md`.

| ID | Severity | Defect | Current evidence | PR |
|---|---|---|---|---|
| ARC-001 | High | 11 "current crawl" selectors with about 7 rules. A one-page rerun becomes site evidence for Opportunities, Overview, the Agent and MCP (SH-B1) | `reads/crawl.ts:56-71` (dashboard, `/pages`, `/issues`), `:80-103`; `opportunities/sources.ts:32-40`; `mcp/evidence-site.ts:31-44`, `:84-99`; `projects/command-center.ts:214-223`; `ai-traffic/pages-data.ts:77-85`; `opportunities/declarations.ts:133-142`; `measurement-legs.ts:31-41`; `internal-link-runs.ts:25-34`; `reads/content-fragments.ts:186-202` | A1, then B3 |
| BE-801 | Medium | Site-change Actions freeze a `site_rule` check for a rule no crawl evaluates, so they never verify | `config/opportunity.ts:317-359`; `checks/site-rule.ts:25`, `:47-48` | A3 |
| BE-802 | Medium | A merged page finding verifies one arbitrary rule (SH-B2) | `refresh-compute.ts:79-110`; `detectors.ts:171` | A3 |
| BE-903 | Medium | Monitored-set additions and in-crawl reruns are queued into the running crawl with no budget check, and settlement clamps the excess to the hold | `selection.ts:230`, `:410-411`; `fetch-budget.ts:76-91`; `ledger.ts:671-672` | A5 (SH-B4) |
| BE-806 | Info | Issue-family verification ignores pages beyond the 500-page cohort (SH-B2) | `checks/issue-family.ts:104-145`; `config/opportunity.ts:472` | A3 |
| BE-106 | Low | A backdated declaration and measurement legs read `completed` crawls only | `declarations.ts:127-142`; `measurement-legs.ts:31-41` | A1 |
| BE-504 | Low | Snapshot trend ignores scope, status and reruns. Every drained crawl, a rerun included, writes a snapshot | `snapshot.ts:40-57`; `lifecycle.ts:306-308` | A2 |
| BE-907 | Low | Issue history lists the homepage's still-open site-level findings as resolved | `reads/issues.ts:636-639` | A4 |
| BE-904 | Low | A zero monitored allowance blocks clearing the set | `selection.ts:103-108`, `:149` | Moot: A5 deletes the route |
| BE-505 | Low | Coverage says `requested_page_limit_reached` when the frontier was exhausted | `coverage.ts:36-37`; `frontier.ts:604-607` | A4 |
| BE-502 | Low | A canonical alias stays excluded when its target later fails | `canonical-alias.ts:45-77`; `frontier.ts:702-735` | A4 |
| BE-508 | Low | A cancelled crawl publishes scores without the crawl-finalize check, not recorded as unknown | `lifecycle.ts:588-597`; `analysis/scoring.ts:23-40` | A4 |
| BE-506 | Low | Analyze-time fetches follow redirects out of scope (not SSRF) | `analyze-task.ts:171-176`; `page-fetch.ts:174` | A4 |
| BE-905 | Low | The URL preview rejects a bare array of `{url}` objects | `planner-policy.ts:217` | Moot: A5 deletes exact-URL input |
| PERF-006 | Info | Each admission counts and sorts the whole frontier under the runtime lock (in `frontier.ts`, not `url-admission.ts`) | `frontier.ts:206-231`, `:247-252`, `:339-351` | B1 |
| PERF-007 | Low | Page keyset reads project every URL before the cursor | `reads/page-rows.ts:172-279` | B3 |
| New | Low | Recrawl does not reproduce its URL set: `random_seed` is never read and the frontier hashes `crawl.id` | `planner.ts:205`; `frontier.ts:107-123`, `:346` | B1 |

## PR breakdown

Each PR updates the [Site Health](../site-health.md) sections it changes.

The [audit remediation plan](audit-remediation.md) touches the same modules:

- **PR 11** (lock order, BE-001) lands first. It owns lock order in
  `selection.ts`, `controls.ts`, `lifecycle.ts`, `discover-task.ts`,
  `plan-runtime.ts` and `entitlements/grants.ts`. A2, A5 and B1 start after it
  merges.
- **PR 24** (Site Health screen-state fixes) lands before B4 and B5.

| PR | Depends on | Runs in parallel with |
|---|---|---|
| A1, A3, A4 | nothing | each other and PR 11 |
| A2, A5 | PR 11 | each other, A1, A3, A4 |
| B1 | A5, PR 11 | B2 |
| B2 | A1, A2 | B1 |
| B3 | B1, B2 | B5 |
| B4 | B3, PR 24 | nothing (last) |
| B5 | A5, B2, PR 24 | B3 |

### Phase A: defect fixes on today's model

- **A1, one current-crawl owner (SH-B1; ARC-001, BE-106).**
  - Export one `currentSiteCrawl` from `site-health/reads/crawl.ts`: usable
    statuses, reruns excluded, with an optional statuses and date filter for
    verification. Add one snapshot variant joined to non-rerun crawls.
  - Route all 11 selectors through it. The dashboard keeps showing an active
    crawl's progress, but its results and the project `/pages` and `/issues`
    routes come from the current crawl.
  - Done when a real-PostgreSQL test shows that a rerun after a full crawl keeps
    the other pages' Opportunities, Overview and MCP evidence, and that a
    `partially_completed` crawl verifies a backdated declaration.
- **A2, reruns are not site crawls (BE-504).**
  - A rerun writes no project snapshot and doesn't overwrite a score summary
    (`lifecycle.ts`).
  - `snapshot.ts` `history()` joins `site_crawls`, excludes failed, empty and
    rerun crawls, and requires the same scope (`sameScope`, shared with
    `change-snapshot.ts`). Otherwise it reports no comparable snapshot.
  - Also fix the stale "Scheduled crawls are not built yet" line in
    [Site Health](../site-health.md#change-intelligence).
- **A3, verification follows SH-B2 (BE-801, BE-802, BE-806).**
  - Site-change rules get no `site_rule` check (`config/opportunity.ts`), and
    the freeze refuses a missing `issue_rule_id`.
  - A merged page finding keeps every rule and freezes one check per rule.
  - A family larger than its cohort counts the uncovered pages and never reads
    fully verified.
  - Owners are opportunities modules only.
- **A4, small Site Health correctness fixes (BE-907, BE-505, BE-502, BE-508,
  BE-506).**
  - Issue history uses `currentIssueFilter`.
  - Coverage reaches the limit only with frontier left.
  - An alias is restored when its target ends inactive.
  - An unevaluated crawl-finalize rule scores as unknown.
  - One scope-aware `admit` is used by both discover and analyze.
  - Files: `reads/issues.ts`, `coverage.ts`, `canonical-alias.ts`,
    `analysis/scoring.ts`, `analyze-task.ts`, `frontier.ts` (the helper only).
- **A5, freeze the set's inputs (SH-B4, SH-B13; BE-903, BE-904, BE-905).**
  - A re-audit during a running crawl is refused (`crawl_already_active`).
  - Delete the monitored-set edit routes, their contracts, `selection.ts` set
    editing and the advanced crawl options, under the
    [replacement gate](../invariants.md#replacement-and-retirement).

### Phase B: tracked pages

- **B1, sitemap discovery and the tracked set (SH-B5, SH-B6, SH-B7; PERF-006,
  the `random_seed` defect).** Depends on A5 and PR 11.
  - Discovery reads sitemaps first and stores "Discovered N", or "at least N"
    at a safety ceiling. It falls back to the HTML walk only without a sitemap,
    and adds the "No sitemap" rule.
  - The tracked set is filled in a stable per-project tier order. Every full
    crawl tops it up to the plan limit. An upgrade extends it; a downgrade trims
    it by fill order.
  - Every full crawl analyzes exactly the tracked set. One crawl action replaces
    Recrawl and Run new crawl in the API.
  - Simplify the frontier admission (PERF-006). Add the migration for fill
    order and joined/left dates.
- **B2, issue state and trend (SH-B2, SH-B8, SH-B9).** Depends on A1 and A2;
  runs in parallel with B1.
  - Add `site_issue_states` and `site_issue_trend`.
  - Every audit lands: the pages it audited update their state, scores, the
    open count and the day's trend point, in the audit's own transaction.
  - Add the 404 and redirect issues and the "page unavailable" state.
  - Real-PostgreSQL tests cover workspace isolation, provenance, and a
    single-page re-audit moving the totals.
- **B3, reads move to per-page latest (SH-B9; PERF-007).** Depends on B2 (and
  B1 for "Discovered N").
  - The A1 owner, the Issues catalog, Pages, page detail, issue history,
    Overview, Opportunities, the Agent and MCP read each tracked page's latest
    audit.
  - The response shapes the shipped screens use stay, so no screen changes.
  - The cursor is applied before the projection (PERF-007).
- **B4, the three UI changes (SH-B11).** Depends on B3 and PR 24.
  - One crawl button.
  - The Overview trend card plots open issues over time.
  - The Changes panel drops the scope-mismatch copy.
- **B5, Mark fixed and Re-run all (SH-B12).** Depends on B2, A5 and PR 24.
  - Mark fixed sets "marked fixed" on an issue's pages; only an audit resolves
    it. Show "N of M pages fixed" in the issue dialog and on the Issues summary.
  - Re-run all re-audits every tracked page affected by the issue as one
    N-page audit, holding N page fetches, refused while a crawl runs.
  - Both edit `issue-detail-dialog.tsx`, so they ship together.
