# Content optimization

Owner of the content-gap evidence and the `content_gaps` Opportunity family.
The owner decisions (CO1–CO18) and the later phases are in the
[architecture](plans/content-optimization.md); CO1 and CO10 (a separate
Content screen and per-page-kind routing) are superseded by the
[Actions simplification](plans/actions-simplification.md) (AS1, AS5). Credits
are [B73](billing-decisions.md#content-optimization-2026-11-10). Generic
Opportunity, Action, declaration and verification behaviour is owned by
[Opportunities](opportunities.md).

## What ships (phase 1)

**Evidence: content angles.** After a completed or partial visibility run, and
after a crawl, an idempotent `content_angle_refresh` task
([content gaps module](../frontend/services/api/src/content-gaps/)) groups the
titles of competitor and publisher pages cited for the project's prompts in
the default market's dashboard-ready runs of the last `window_days`, by prompt
topic. Only citations from answers to tracked prompts are read: an answer
whose snapshot names no prompt, or whose prompt is no longer in the library,
is left out, so every angle has at least one prompt (AS5). A model only groups
and names the pages, from each page's title, domain and URL path, and is told
to group only content pages (articles, guides, how-tos, comparisons,
listicles, reviews, case studies) and to leave out product pages, category or
collection listings, store or brand home pages and search or tag pages (AS5).
It also picks at most one owned content page per angle from a lexical
shortlist; counts, prompts, engines and whether the owned page is already
cited are computed in code. Runs, lineages, angles, members and owned matches
are insert-only and workspace-scoped; a run is appended only when its inputs
or versions changed. Its trigger and retention are in
[Opportunities](opportunities.md#evidence-to-action) and its outcome in
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

**Actions.** Content-gap findings are ordinary Actions on the one Actions list
(AS1), in the family `content_optimization`. One page is one Action, so a
content page's Site Health findings and content gaps share it. Issues is
unchanged (CO11): Site Health issues on content pages still appear there.
There are no scores or grades (CO14).

An Action opens at `/agent/actions/:actionId`. The Action read returns each
content-gap finding's stored evidence (`content_gap_evidence`), and **Why this
matters** renders it only, with no further read: the angle, the cited pages
with title, site and classification, the counts and the run's window, and a
link to the planned-page Action a page continues. The angle's prompts are
stored with their text as of the refresh (`prompts: {id, text}`); a prompt no
longer in the library when the refresh ran is stored with `text: null` and
shown as such. The page reads no prompt library. Site Health findings on the
page render as on any Action. The handoff into the Agent
([handoffs](agents.md#workspace-and-handoffs)) is the Action's `handoff`,
persisted in its diagnosis. Its first finding whose approach branch in
`APPROACH_TREE` names a workflow drives both the workflow and the prefilled
message, which names that finding's angle (the Opportunity and the `article`
workflow for a page to create, the page URL and the `refresh_page` workflow for
an existing page), so a planned page that is also a search gap still opens on
its content gap;
an Action whose findings name none hands off with itself and its message.

## Not yet

- The page editor, Optimize content and its suggestions (CO7, CO12).
- Fetch on Optimize: the one-page fetch that becomes the editor's base.
- Analyze a page (CO6), and optimizing any URL.
- The [content rules engine](plans/content-rules-engine.md) and its rule
  findings (CO13).
- The `owned_url_cited` declaration check: both content-gap rules have no
  automatic check yet, so a declaration on them measures nothing beyond the
  page's other findings.
