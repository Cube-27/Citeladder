# Content optimization

Owner of the content-gap evidence, the `content_gaps` Opportunity family, the
Action `surface` and the Content optimization screen. The owner decisions
(CO1–CO18) and the later phases are in the
[architecture](plans/content-optimization.md); credits are
[B73](billing-decisions.md#content-optimization-2026-11-10). Generic
Opportunity, Action, declaration and verification behaviour is owned by
[Opportunities](opportunities.md).

## What ships (phase 1)

**Evidence: content angles.** After a completed or partial visibility run, and
after a crawl, an idempotent `content_angle_refresh` task
([content gaps module](../frontend/services/api/src/content-gaps/)) groups the
titles of competitor and publisher pages cited for the project's prompts in
the default market's dashboard-ready runs of the last `window_days`, by prompt
topic. A model only groups and names them, and picks at most one owned content
page per angle from a lexical shortlist; counts, prompts, engines and whether
the owned page is already cited are computed in code. Runs, lineages, angles,
members and owned matches are insert-only and workspace-scoped; a run is
appended only when its inputs or versions changed. Its trigger and retention
are in [Opportunities](opportunities.md#evidence-to-action) and its outcome in
[state machines](state-machines.md).

**Family: `content_gaps`.** The latest succeeded run raises
`content_gap_improve_page` on a matched owned content page that is not cited
for the angle's prompts, and `content_gap_new_page` on a planned page when no
content page matched. Thresholds (`min_citations`, `min_domains`) and the
other tunables are in the
[content optimization config](../frontend/services/api/src/config/content-optimization.ts);
the thresholds are placeholders until calibrated
([backlog](plans/backlog.md#acceptance-calibration-and-rollout)). Findings key
on the angle's lineage, so relabelling keeps the Action. Retention, the "not
computed yet" and "out of date" limitations, and planned-to-owned continuity
are in [Opportunities](opportunities.md).

**Surface.** Every Action has a persisted `surface`: `content` for an owned
page whose page kind is a content kind (CO15) and for a planned page with a
new-page gap, `actions` otherwise (CO10). One page is one Action, so a content
page's Site Health findings and content gaps share it. Issues is unchanged
(CO11): Site Health issues on content pages still appear there.

**Screen.** Content optimization (`/agent/content`) sits directly below
Actions in the Act group and Agent mode (CO1), with a count of its open and
in-progress Actions. It reads `GET /api/v1/projects/{project_id}/actions?surface=content`;
Actions reads `surface=actions`, so the two never list the same Action. It
shares Actions' status filter, URL state, priority order and cursor paging
([action queue](../frontend/components/agent/action-queue.tsx)). Each row
shows the page (or "New page"), its most cited angle, the angle's prompt
count, and the sites and competitors cited for it, from the finding's
evidence; a content page with no content gap shows not applicable. There are no
scores or grades (CO14). An empty list says which of four cases it is: no work
for the chosen status, content gaps not computed yet, content-gap evidence
out of date, or a current run with no gaps (`content_gap_source`). That state
follows the latest Opportunity snapshot, like the gaps listed: a run that ages
past `max_source_age_days` reads as out of date once the next refresh records
it, and until then the snapshot's gaps and state stay as they were written.

An Action opens at `/agent/content/:actionId` (the shared Action page; the
back link follows the Action's surface). For content-gap findings, **Why this
matters** renders their stored evidence: the angle, the cited pages with
title, site and classification, the counts and the run's window, and a link
to the planned-page Action a page continues. The prompts are stored as IDs, and
their text is read from the current prompt library, so an edited prompt shows
its current text and a deleted one is not listed. Site Health findings on
the page render as on any Action. The handoff into the Agent
([handoffs](agents.md#workspace-and-handoffs)) is **Write this page** (the
Opportunity and the `article` workflow) for a page to create and **Work on
this** (the page URL and the `refresh_page` workflow) for an existing page.
Every link built from an Action with its surface, including MCP `read_actions`
links and record fetches, points at that surface's screen; a link that holds
only an Action id opens the same page under `/agent/actions`.

## Not yet

- The page editor, Optimize content and its suggestions (CO7, CO12).
- Fetch on Optimize: the one-page fetch that becomes the editor's base.
- Analyze a page (CO6), and optimizing any URL.
- The [content rules engine](plans/content-rules-engine.md) and its rule
  findings (CO13).
- The `owned_url_cited` declaration check: both content-gap rules have no
  automatic check yet, so a declaration on them measures nothing beyond the
  page's other findings.
