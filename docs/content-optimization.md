# Content optimization

Owner of the content-gap evidence and the `content_gaps` Opportunity family.
The owner decisions (CO1–CO18, E1–E5) are in
[decisions](decisions.md#content-optimization); CO1 and CO10 (a separate
Content screen and per-page-kind routing) are superseded by the
[Actions simplification](decisions.md#one-actions-feature-content-gaps-from-content-pages-only)
(AS1, AS5). Credits
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

An Action opens at `/actions/:actionId`. The Action read returns each
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
stream once the page is read. The `content_optimize` skill proposes changes
with `suggest_edits` and changes the page itself with `edit_document` only
when the person asks; `save_document` is refused for a page document. Edits
and restores keep the page's SEO fields.

### Suggestions

A suggestion is one finding on a page document in the
[rules engine's schema](plans/content-rules-engine.md#findings-and-anchoring),
made against one revision: a `span` of the Markdown body (UTF-16 offsets and
its exact quote with about 32 characters of context each side), an SEO `field`
with the value it had (`expected`), or the `page`; what its judgement read
(`depends_on`: its section, the whole body, or a field); a replacement, a
`needs_input` question, or neither (advice); its rule, the category the rule
sets, and its rationale; its source; and its rule's guidance. Suggestions are
insert-only in `agent_output_suggestions`; every status change
is an append-only
`agent_output_suggestion_events` row (`open`, `applied`, `dismissed`,
`reverted`, `stale`) with its actor and, when the text lands in a revision,
that revision and the span there. Both are workspace-scoped.

- **The rule catalog** (CO13,
  [content-rules.ts](../frontend/services/api/src/config/content-rules.ts)).
  Every suggestion applies one catalog rule, seeded from the
  [rules engine's](plans/content-rules-engine.md#appendix-research-rule-catalog)
  research catalog. Each rule has a user-facing category, a layer, a check, a
  `source` (a link to the guidance) and a `strength`: `requirement` (a
  search-engine policy), `recommendation` or `heuristic` (a tool convention or
  contested evidence, such as the GEO effect sizes and AI-writing tells).
  Site Health's rules (L0) are listed only so their findings carry a source and
  strength; the model pass never raises them. The model rules (L4) are the
  ones the Agent judges, and the deterministic L1–L3 rules join when their
  linters run. The catalog's version is a fingerprint of its content, folded
  into the Agent skill catalog's, so a change asks a queued turn again.
- **Evidence eligibility.** A model rule is offered only when everything it
  `requires` is present in the turn's context: the fetched page; its Site
  Health page kind, for a rule limited to some page types; and the page's
  prompts (the Action's content-gap evidence or the chat's `target_prompts`)
  for coverage. Rules that need cited pages' text, other site pages, link
  checks or fact retrieval are never offered yet. Each page turn's context gets
  a `content_rules` section (first, so trimming drops it last) with the
  offered rules, how each strength is phrased, the catalog's Site Health rules
  failing on the fetched page (its page-local checks, with what Site Health
  found) whose fix the model may write, the Site Health rules it never raises
  itself, and the rules not checked for missing evidence, which the model
  never guesses at.
- **From the fetch.** The fetch's page-local Site Health findings that a field
  fixes (`site_health_field_rules`: a missing title or meta description)
  become `site_health` suggestions on revision 1, as advice, in the same
  transaction as the checks that found them. Converting at the fetch keeps the
  deterministic finding beside its evidence (snapshot and rule version), gives
  the first turn the list to work from, and needs no run; every other finding
  stays in the SEO tab only (CO11). When the model writes the text for one (the
  same rule on the same field), the new suggestion replaces it.
- **From the Agent.** `suggest_edits` accepts a `rule_id` the turn offered;
  the rule of a Site Health check failing on the fetched page (such as
  answer-first), whose fix is a `model` suggestion under that rule and carries
  its source and strength; or the rule of a Site Health suggestion open on the
  page (writing its text). A Site Health rule that passes or was not checked,
  and any other rule, is refused with the reason, so the model corrects it. The
  rule sets the category. It resolves `old_string` (which must match
  exactly once) to a span, or a field to its current value, stages the
  suggestions, and commits them with the reply against the page's latest
  revision. A suggestion can name open ones it `replaces`, such as a
  needs-input one the person has now answered; those go stale. Each turn's
  opening message lists the page's suggestions with ids and statuses.
- **Where a suggestion is now.** A span is mapped through each revision since
  the one it was placed in: a line diff (weighted by characters, each changed
  run narrowed to the characters that differ). It holds only when no change
  touched it and its text still equals the quote; the same text elsewhere never
  counts. A field holds while it equals `expected`, and a dependency while it
  is unchanged. Every revision a person or the Agent appends (an edit, a
  restore, an `edit_document`) rechecks the open suggestions and marks the
  ones that no longer hold `stale`; reads only report.
- **Apply, Dismiss, Revert** (`POST …/outputs/{output_id}/suggestions/{id}/apply`,
  `/dismiss`, `/revert`). Each names `base_revision_id`; a newer revision is a
  409 `agent_output_conflict` and a running turn or fetch a 409
  `agent_run_active`. Apply checks the span, field and dependencies, then
  appends a user revision; a failed check marks it stale instead and says why.
  Applying one stales the alternatives for the same text or field. Revert (E4)
  restores an applied suggestion's original text while its replacement is
  unchanged, and is refused with the reason otherwise; a dismissed one reopens
  if it still holds. Refusals are 409 `agent_suggestion_conflict`.
- **Apply all and Dismiss all** (`…/suggestions/apply-all`, `/dismiss-all`).
  Apply all applies, in position order and in one revision, every open ready
  suggestion that holds and overlaps no other open one; one whose dependency
  an earlier one in the batch changed goes stale. Overlapping ones stay open
  as "choose one", needs-input ones are skipped, and the response counts
  applied, left to choose, needs input and stale.
- **Reading them** (`GET …/outputs/{output_id}/suggestions`): the open, applied
  and dismissed suggestions in position order with where each one's text is
  now, each one's `guidance` (its rule's strength, source label and link), and
  counts per status and open ones per category. Guidance is resolved from the
  catalog when the suggestion is stored, with the catalog version, in
  `rule_guidance`, so a later catalog change never rewrites
  it; suggestions stored before the catalog have none. No scores (CO14) and no
  Issues entries (CO11).

### The page workspace (CO7)

A chat with a `page` document opens as the page workspace instead of the
thread (E1); every other chat keeps the thread. The workspace is a lazy chunk
(`components/agent/workspace/`), so CodeMirror never loads for other screens.

- **The page.** The latest revision's Markdown body in CodeMirror with live
  preview (E2): headings, bold, italics and links render styled and their
  marks hide off the cursor's line. Open body suggestions are highlighted
  where the suggestions read places them (blue ready, amber needs input), only
  while the text on screen is that revision. A person's edit is a draft until
  **Save changes** appends a revision with compare-and-set on the revision it
  started from; while they type, highlights map through each change
  (`mapPos` with `TrackDel`) and one whose boundary is deleted is dropped.
  While a turn runs the page is read-only and shows `edit_document`'s
  streamed body.
- **Suggestions.** A card links its rule's source: "Required by" for a
  policy, and otherwise worded as an option, with a heuristic labelled
  "Heuristic". Every change names the revision on screen:
  `agent_output_conflict` reads the chat and the suggestions again and says
  the page changed; `agent_suggestion_conflict` shows the server's reason.
  Changes wait while a turn runs or a draft is unsaved.
- **SEO.** The fetch's page-local checks are shown with the fetch time;
  editing the page does not rerun them (E5).
- **Chat.** Ask AI and Add to context write a quoted reference into the
  composer and never send.

**Work with the agent** on an Action opens `optimize_page` for the Action's
page when the Action read's `editable_page` is true: a page Action whose
target is one of the latest crawl's content pages (E3, read-time).

**Analyze a page (CO6).** The Actions header's **Analyze a page** opens a
dialog: one of the latest crawl's content pages (searched on the server by
address or title, at most `analyze_page.page_list_max` listed at once), a
topic that has active prompts, and that topic's prompts, all selected at
first. `POST /projects/{id}/actions/analyze` with `{site_url_id, topic_id,
prompt_ids}` refuses with 422 a project with no crawl, a page that is not one
of the latest crawl's content pages, a topic of another project or with no
active prompts, and any prompt outside that topic. It then starts the same
`optimize_page` page chat as above (same admission, funding and fetch; nothing
is charged until the page is read), and in that chat's transaction creates or
reuses the page's Action through the Agent's target attachment
(`attachOrCreateAction`), so a refused start leaves no Action. A repeat for
the same page reuses its Action and starts a new chat, because each chat
reads the live page afresh and may name other prompts; a retried request
(same Idempotency-Key and body) returns the chat it started. The response is
the Action id, the chat id and the run (null while the page is read), and the
browser opens the chat.

The chosen topic and prompts are recorded on the chat, not the Action: the
chat's context carries `prompt_reference {topic_id, prompt_ids}`, and every
turn's context reads it into a `target_prompts` section (the topic's name, the
chosen prompts it still holds, and how many no longer resolve). An Action has
one `target_prompt_id` and a diagnosis owned by its evidence, so neither holds
a per-analysis prompt list.

## What ships (phase 3: measurement)

Both content-gap rules freeze the declaration check `owned_url_cited`
([Opportunities](opportunities.md#explicit-implementation-declaration)), and
Mark implemented in the page workspace declares the revision on screen.

- **Improve page.** The declaration freezes the page's canonical URL and the
  angle's prompts (those the library held at the refresh). It is met when a
  later visibility run that asked one of those prompts cites that URL.
- **New page.** It freezes the prompts and the owned URLs already cited for
  them from the gap's window start to go-live. It is met when a later run
  cites an owned URL outside that set for those prompts. The user names no
  URL, and an angle matched later plays no part.
- **Analyze a page.** A shipped revision from an Analyze a page chat also
  freezes a page check on the page and prompts the chat was started for.

A frozen check never follows a later reclustering, rematch or prompt edit. A
run that asked none of the prompts reads as not measurable, never as not met.
The check says only whether a URL was cited, never which version of the page
the engine read; the Action detail says so beside it, and the causality notice
stays. The declaration dialog names the page (or "a new page of yours") each
gap will be measured by.

## Not yet

- Optimizing any URL (a paid add-on).
- The [content rules engine's](plans/content-rules-engine.md) deterministic
  linters (L1–L3) and LanguageTool or Vale (L5), and showing rules not
  checked for missing evidence in the workspace.
- Reading the competitor and publisher pages cited for tracked prompts, and
  suggesting passage-level additions from what they cover (CO3).
- The rules applied to Agent drafts of new content (CO18).
- Publishing to a CMS.
- A prompt-score check beside `owned_url_cited`: a rule names one check kind,
  so a content-gap declaration does not also freeze prompt-score checks on the
  same prompts.
