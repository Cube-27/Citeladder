# Internal link suggestions

> Archived on 7 October 2026. Retained as historical scope and evidence, not
> execution authority or a current status report. Remaining work is consolidated
> in [the backlog](../plans/backlog.md), queued through [plan status](../plans/ACTIVE.md).

## Status and authorization

Planned and implemented on 28 September 2026 in branch `codex/content-structure`.
The first implementation shipped a separate Content structure page with passage
anchors and JEV topic groups. Owner review of real project data found the
topic groups unusable (almost every group held one product or designer page) and
the passage anchors imprecise. The owner then directed:

- Delete the Topics capability entirely.
- Keep one **Internal links** tab in Website, before Changes; remove the
  Content structure page and its navigation entry.
- Follow the simpler hub-and-spoke page-pair approach of the JEV marketing
  playbook link audit: JEV decides whether a source page should link to a
  related destination; anchor text comes from the destination itself.
- JEV cost is not a design constraint; live JEV calls are authorized for
  development and validation on local project data.

Do not merge until the owner approves.

## Scope

- Retrieval: TF-IDF over title, H1, URL path and meta description; bounded
  destinations per source; skip self, existing main-content links, ineligible
  destinations, utility pages and product colour/size variants.
- Judgment: one JEV request per page pair (Noul link question plus an anchor
  Choice over the destination's H1/title/slug when there is more than one).
- Execution: existing analytics queue, committed dispatches, one JEV request
  per source page sent concurrently, own deadline, partial publication.
- Actions: suggestions join the source page Action; the user selects the links
  implemented; a later crawl verifies a main-content link to the destination.
- UI: summary on one line, shared table with rows-per-page footer, review
  drawer with copyable anchor/URL/HTML, CSV export, saved-analysis history.

Owner documentation: [Site Health](../site-health.md#internal-links) and
[Opportunities](../opportunities.md).

## Out of scope

Topic or topical-authority grouping, passage-level anchor placement, generated
anchor rewrites, CMS publishing and embedding-based retrieval.

## Validation

Validate on the local Aza Fashions and Best&Less crawls with live JEV before
review: acceptance rate, spot-checked precision, variant noise and elapsed time.
Threshold calibration against editor-reviewed examples remains a release task.

## Post-merge hardening

Review of #196 found, and the follow-up PR fixed: eligibility filtering now
precedes the page cap, whose selection is no longer URL-alphabetical; and a
cancelled run keeps the project's slot until its judgment task is terminal.
Deferred until real runs justify them: editor-outcome calibration and a
separate judgment policy version (the run manifest already freezes the policy
and threshold, and each dispatch records the model), normalized recommendation
rows instead of one result document, and catalog-based product variants.

Timing the first local live run (188 pages, 703 pairs, 250 s, 39% HTTP 503)
showed one request per pair behind 16 serialized slots, each slot reserving and
settling credits under the run lock. Policy 2 sends one request per source
page, all at once, retries 503 and drops per-judgment credit metering.
