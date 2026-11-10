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
workflow for a page to create, the page URL and the `optimize_page` workflow
for an existing page), so a planned page that is also a search gap still opens
on its content gap;
an Action whose findings name none hands off with itself and its message.

## What ships (phase 2: page documents)

**Starting a page chat.** A chat started with the `optimize_page` workflow
(skill `content_optimize`, output kind `page`) names one page: the request's
`target_url`, else its Action's target, else a URL in its message. The page
must be one of the latest crawl's content pages (`content_page_kinds`, CO15;
the `www.` twin counts) or the page the chat's own Action targets; any other
URL is refused with 422 before anything is committed, since optimizing any URL
is a later add-on. Admission (role, capability, funding route) runs then, and
the request commits the chat, its first message and one `page_fetch` analytics
task keyed by chat and URL, with no Agent run. A retried request returns the
same chat, and its run once the fetch queued one.

**The fetch.** The `page_fetch` task
([page documents module](../frontend/services/api/src/page-documents/)) fetches
the page once through Site Health's `SitePageFetcher` (robots gate, hard
exclusions, the operator stop list, host pacing; a redirect off the page's
site is refused) with the `page_fetch` limits in the
[content optimization config](../frontend/services/api/src/config/content-optimization.ts).
It reads the main-content region Site Health's page analysis reads, as
Markdown (`rehype-parse`, `rehype-remark`, `remark-gfm`, `remark-stringify`),
with links made absolute, and keeps the title, meta description and JSON-LD
apart as the page's SEO fields. Site Health's page-scope rules run on the
fetched page (site-context rules such as sitemap and redirects stay with the
crawl), and the snapshot stores them. Every fetch appends one insert-only,
workspace-scoped `page_snapshots` row with its outcome: `fetched`,
`blocked_robots` (robots or access refusal), `http_error` (a non-2xx answer),
`unsupported` (not HTML, too large, no main content, or longer than one
document) or `failed`.

In the task's terminal transaction a fetched page becomes the chat's page
document (revision 1 authored `fetch`, its `fields` the SEO block, the output
pointing at the snapshot) and queues the chat's one first turn with the
funding admission chose; its context names the snapshot, so every turn reads
the page's check results. Any other outcome posts a notice in the chat and
queues no turn, so nothing is charged (B73). A task that fails outright is
compensated the same way, as `failed`. The chat read's `page_fetch` is
`reading` while the task is live and then the outcome; the chat screen shows
"Reading your page…", keeps the composer closed, and opens the queued turn's
stream once the page is read. The `content_optimize` skill changes the page
only with `edit_document`; `save_document` is refused for a page document.
Edits and restores keep the page's SEO fields.

## Not yet

- The page workspace and Optimize content's suggestions (CO7, CO12).
- Analyze a page (CO6), and optimizing any URL.
- The [content rules engine](plans/content-rules-engine.md) and its rule
  findings (CO13).
- The `owned_url_cited` declaration check: both content-gap rules have no
  automatic check yet, so a declaration on them measures nothing beyond the
  page's other findings.
