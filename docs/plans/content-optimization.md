# Content optimization (draft architecture)

Status: **architecture reviewed with the owner, 2026-11-10**. Not on
[plan status](ACTIVE.md) and not authorized for execution until the owner
assigns it. The rules that decide *what a good page is* live in the separate
[content rules engine](content-rules-engine.md) document; this document owns the
gap evidence, the screen, the editor and the measurement loop.

## Goal

Show a user which content AI answer engines cite for their tracked prompts that
their site lacks, then help them close the gap: improve an existing page in a
Grammarly-style editor (suggestions accepted one at a time), or brief a new page.
Measure the result with the existing declaration and verification loop.

## Owner decisions so far (owner, in chat, 2026-11-10)

| # | Decision |
|---|---|
| CO1 | ~~Content optimization is its own sidebar entry directly below Actions. Actions and Content optimization never show the same work.~~ Superseded by AS1 ([Actions simplification](actions-simplification.md)): one Actions list; content gaps are ordinary Actions. |
| CO2 | Storage stays in the one Opportunity/Action store. Declaration, verification and Agent attachment are reused. |
| CO3 | MVP evidence is the **titles** of URLs already cited in answers from **competitor sites and editorial/publisher sites** (not UGC, social, directories or marketplaces), grouped to find content the user lacks. Reading those pages is phase 2. |
| CO4 | Titles are grouped by the citing prompt's topic, then a model clusters them into content angles; the clustering is persisted with its version and reused while its inputs are unchanged (see [section 1](#1-content-angles-new-derived-stage-no-fetching) for what each derived part is keyed on). Window: dashboard-ready audits of the last **30 days**. |
| CO5 | Both gap types: an existing owned page that is not cited (opens the editor) and a missing page (a new-page brief through the existing content-creation workflow). |
| CO6 | Both triggers: automatic detection after audits, and a manual **Analyze a page** that lets the user pick only from the crawl's content pages (no free URL entry). Optimizing any URL is a phase 2 paid add-on. |
| CO7 | Per-suggestion editing: page on the left, suggestions on the right, Accept / Dismiss / Apply all; suggestions that need a fact go to the Agent with the user's input. |
| CO8 | Clustering is free (internal cost of the audit); generating suggestions is an Agent turn that draws AI credits. Recorded as [B73](../billing-decisions.md#content-optimization-2026-11-10). |
| CO9 | The rules for auditing content are designed in a separate document, inspired by Grammarly. |
| CO10 | ~~**Route by page kind, not by rule.** Content pages (the kinds in CO15) belong wholly to Content optimization: every Action on them, including technical Site Health findings, is fixed in the editor, where the Agent suggests technical fixes too (JSON-LD, ARIA labels, meta). All other pages stay in Actions. Existing rules are not re-tagged.~~ Superseded by AS1 ([Actions simplification](actions-simplification.md)): no Action is routed to a screen by page kind; `actions.surface` is removed. |
| CO11 | **Issues is unchanged.** Site Health issues, including those on content pages, stay in Issues exactly as today. The new rule-based content suggestions never appear in Issues; they exist only in the editor. |
| CO12 | **Fetch on Optimize.** Opening the editor queues a one-page fetch of the live page; its main content becomes the editor's base Markdown. The crawl's flat text is not used as the base. |
| CO13 | MVP rules: imported Site Health findings plus one model pass over the rule catalog. Deterministic linters (Harper, retext) come next. |
| CO14 | **No grading or scores**, not even a readability grade. Suggestions are options grounded in what tends to do well, never a verdict on the content. |
| CO15 | Content page kinds: `article`, `guide`, `how_to`, `listicle`, `comparison`, `alternative`, `case_study_review`. FAQ, docs and every other kind stay in Actions. |
| CO16 | Angles match **content pages only**. When no content page covers an angle it becomes a new-page brief, even if a non-content page (pricing, product) touches the topic. |
| CO17 | The model pass works in the project's language. The later deterministic linters start English-only. |
| CO18 | Agent drafts of *new* content follow these rules in phase 2. The MVP covers existing content pages and new-page briefs through today's content-creation workflow. |

## What already exists (reuse, do not duplicate)

| Need | Existing owner |
|---|---|
| Cited URLs with titles | `citations` rows per answer analysis: `title`, `url`/`canonical_url`, `domain`, `classification`, `is_owned`, `matched_competitor`, `source_class` ([Visibility](../visibility-prompt.md)) |
| Prompt → topic | `prompts.topic_id` (nullable) |
| Ranked, target-level work items | [Opportunities and Actions](../opportunities.md): refresh families, `TargetRef`, action sync, effective status |
| Planned pages | `plannedPageKey(topic)` ([actions.ts](../../frontend/services/api/src/analysis/opportunities/actions.ts)) keys a missing page by a slug of its topic text, so the keyword-gap rule and Agent-planned pages converge on one Action |
| Prompt-level "not cited" | Rule `owned_page_not_cited` (visibility family) already flags a *prompt* whose answers cite no owned page. It targets the prompt and stays on Actions; content gaps add the page and the content angle, and neither rule replaces the other |
| Owned page copy | Crawl `normalized_facts`: title, meta, h1–h3 outline, flat `primary_content_text` (≤ 12 000 chars); `read_page_text` |
| Page-level content checks | Site Health advisory/defect rules: answer-first, source support, question headings, structured data, recency, server-rendered content |
| Structural comparison | `content_differentiation_reports` (owned page vs inspected organic results: headings, tables, outbound domains) |
| Draft + revisions + edits | Agent outputs: immutable revisions, `edit_document` exact `old_string` → `new_string`, stale-base conflicts, Mark implemented |
| Measurement | Declarations freeze checks; prompt-targeted visibility and Site Health rule checks already exist |

## Proposed architecture

```
audit terminal (citations committed) | crawl completed
  -> content_angle_refresh task (new, analytics lane, idempotent per input keys)
       group cited titles by prompt topic -> model clusters into angles
       match each angle to at most one owned page (lexical prefilter + model pick)
       persist insert-only angle run, angles, members, owned matches
  -> announceEvidence -> Opportunity refresh
       family content_gaps (new): content_gap_improve_page | content_gap_new_page
       -> Actions (owned page or planned page target)
Content optimization screen  = Actions whose target is a content page or a planned page
Actions screen               = every other Action (no overlap)
"Optimize content"           = queued one-page fetch -> base Markdown revision
                               -> Agent turn, skill content_optimize, output kind page_suggestions
Accept / Apply all           = server applies exact replacements -> new output revision
Mark implemented             = existing declaration; checks: owned URL cited, prompt visibility,
                               Site Health rules on the page
```

### 1. Content angles (new derived stage, no fetching)

- **Input.** For the project's default market, citations from dashboard-ready
  audits of the last 30 days (CO4), limited to competitor and editorial or
  publisher sources (CO3; UGC, social, directories and marketplaces are left
  out by `classification`/`source_class`), with their prompt and topic. One
  row per canonical URL: title (URL slug when the title is empty), domain,
  classification, matched competitor, source class, answers citing it,
  prompts, engines.
- **Owned citations.** Owned citations (`is_owned`) from the same audits and
  prompts are loaded separately, one row per canonical URL with the prompts
  that cited it. They are not clustered. They decide coverage: an angle is
  covered when its matched owned page is cited in an answer to any of the
  angle's prompts in the window.
- **Model step (bounded classification).** Per topic, at most N URLs (config)
  are clustered into content angles: a short label (e.g. "pricing comparison",
  "setup guide for X") and member URL IDs. The model only groups and names; it
  never invents a URL, a count or a fact. Platform gateway `structured` call,
  internal cost (CO8).
- **Owned match.** For each angle, a lexical prefilter picks the top K owned
  crawled pages by title/H1/body coverage (as `differentiation.ts` does), and
  the same model call picks one or none. Coverage then comes from the owned
  citations above, never from the model.
- **Persistence.** Insert-only `content_angle_runs` (source audit IDs, crawl
  ID, model, prompt and formula versions, input hashes, outcome, limitations),
  `content_angle_lineages` (stable identity and fixed planned-page key),
  `content_angles` (with their lineage), `content_angle_members`,
  `content_angle_owned_matches`. Workspace-scoped like every project table.
- **What triggers recomputation.** Each derived part is keyed on its own
  inputs, so a change to any of them refreshes it and nothing else:
  - the clustering (model) on the set of (canonical URL, title, topic);
  - the owned match (model) on the clustering and the crawl's content pages
    (crawl ID);
  - citation counts, prompt and engine associations, and owned coverage on the
    window's audit IDs. These are deterministic aggregates recomputed in code
    with no model call.

  Every key includes the versions of what produced it: model, methodology,
  formula and config. A deploy that changes any of them recomputes on the next
  trigger. A run is appended only when one of these keys changed; when none
  changed, the latest run is reused.
- **Triggers.** A run is enqueued, with an idempotency key of its input keys, by:
  - the audit terminal path, beside the existing `source_page_inspection`
    enqueue in [audit projections](../../frontend/services/api/src/audits/projections.ts);
  - a completed crawl, through `announceEvidence`, because content pages and
    owned matches depend on it.

  The 30-day window is anchored at the newest included audit's completion
  time, not at "now". Without a new audit or crawl nothing changes and no
  timer is needed. When a newer audit moves the window, older audits drop out.
- **Run outcomes.** A run ends `succeeded` or `failed` (model error, timeout,
  schema rejection). It ends `succeeded` with a limitation (no topic, too few
  citations, empty titles) when it ran but had too little to judge. A failed
  run is kept for diagnosis and never becomes the refresh's source.
- **States kept distinct.** Topicless prompts, empty titles, too few citations
  (below the minimum) and model failure are recorded limitations, never an
  empty "no gaps" result.

### 2. Opportunity rules (deterministic over persisted angles)

A new refresh family `content_gaps` reads the latest **succeeded** angle run.
Its ID is the family's source identity.

- **Retention.** The refresh replaces a family's hits with whatever its source
  yields, and a valid source with zero hits clears the old ones. So the family
  never reads a failed run:
  - After a failed run, the last succeeded run stays the source and its gaps
    remain.
  - A succeeded run with zero gaps clears them; that is a real "no gaps".
  - A succeeded run whose newest audit is older than `max_source_age_days`
    (config) is no longer selected. Its gaps are cleared, and the snapshot
    records the limitation "content-gap evidence is out of date". This keeps
    an old run from standing in for current evidence.
  - No succeeded run at all yields no hits plus the limitation "content gaps
    not computed yet", which is distinct from "no gaps".

- `content_gap_improve_page`: an angle cited at least `min_citations` times
  across at least `min_domains` non-owned domains, with a matched owned page that
  is not cited in any answer to the angle's prompts in the window (owned
  citations, section 1). Target: the owned `SiteUrl`. An angle whose matched
  page is cited is covered and raises nothing.
- `content_gap_new_page`: the same thresholds, no owned match. Target: a planned
  page (see angle identity below).
- **Angle identity.** Reclustering may rename or regroup angles, so an angle's
  label is never its identity:
  - Each angle belongs to an angle **lineage**. A new run's angle inherits the
    lineage of the previous run's angle in the same topic whose member URLs it
    overlaps most, when that overlap (Jaccard) is at least
    `lineage_min_overlap` (config). Otherwise it starts a new lineage.
  - Opportunities key on the lineage, not the run.
  - A lineage's planned-page key is fixed when the lineage is created:
    `plannedPageKey(label)` with the label as it was then. A later label never
    changes it, and an Agent-planned page with the
    same topic slug still converges on that Action (today's behaviour).
- **Planned to owned.** When a content page later matches a lineage that had a
  planned-page Action, the finding becomes `content_gap_improve_page` on that
  page's Action. The planned-page Action keeps its identity, status and any
  declaration (Action identity never changes); its evidence is cleared like
  any Action whose finding moved. The new page's Action evidence names the
  lineage and the planned-page Action it continues, so the screen can link
  them.
- Evidence (schema in `@citeladder/contracts/opportunity-evidence`): angle label,
  topic, prompts, cited URLs with titles, counts and classification, the owned
  match and its method, window, run ID and versions.
- Priority: citation volume, prompt count and competitor share, with thresholds
  in `config/opportunity.ts` (`CONTENT_GAP`). The model does not score.
- **Screen split by page kind (CO10; superseded by AS1, the surface and the
  Content screen are removed).** The Actions list gains a `surface`
  filter derived from the target: an owned page whose current Site Health page
  kind is a content kind, or a planned page with a `content_gap_new_page`
  member, is `content`; everything else is `actions`. A planned page has no
  page kind, so one raised only by another rule (a keyword gap) or planned by
  the Agent stays on Actions until a content gap converges on it. One page is
  one Action, so a content page's Site Health findings and its content gaps
  share one Action, one editor and one declaration. No
  rule is re-tagged. The surface is persisted on the Action at action sync (it
  is read in list filters and counts), and a page whose kind changes moves with
  its next refresh.
- **Content pages only (CO15, CO16).** The owned-match prefilter considers
  only pages of the content kinds, so a gap never lands on the Actions screen.

### 3. Optimize content (Agent turn, AI credits)

- Entry: **Optimize content** on a Content optimization item, or **Analyze a
  page**, which offers only the latest crawl's content pages (e.g. 40 of 200
  crawled pages) and optionally a topic or prompts; it attaches to or creates
  an `agent`-origin page Action through the existing Agent target adapter.
  Free URL entry is a phase 2 paid add-on (CO6).
- **Fetch on Optimize (CO12).** Clicking Optimize commits a one-page fetch task
  (the pinned website fetcher with the Site Health robots gate, paced), then
  the browser waits for it. The fetch keeps the raw response as append-only
  evidence and converts the main content (the same region Site Health
  analyzes) to Markdown, plus title, meta description and JSON-LD. A failed or
  blocked fetch is shown as such and nothing is charged; the Agent turn starts
  only after a successful fetch. Reads never fetch. The same task runs Site
  Health's page-local deterministic evaluators on the fetched page, so those
  findings are current. Rules that need the whole crawl stay as of the crawl
  (see the rules engine's L0).
- New skill `content_optimize` and output kind `page_suggestions`. Context: the
  fetched page, the angle with its cited titles and prompts, every Site Health
  finding on the page (technical ones included, CO10), reviewed business facts,
  and the rule catalog from the [rules engine](content-rules-engine.md).
- **Base revision.** Revision 1 of the output is the fetched page: an SEO block
  (title, meta description, JSON-LD) and the Markdown body. The Agent suggests
  technical fixes for the page too (JSON-LD, ARIA labels, alt text, meta) as
  suggestions on the SEO block or as advice with a code snippet, because the
  user fixes the whole content page in one place.
- **Suggestions.** There is one finding schema for every source, defined in
  the [rules engine](content-rules-engine.md#findings-and-anchoring): a span,
  field or page anchor, its dependencies, and an expected value for field
  replacements.
  - A new built-in, `suggest_edits`, is only the model's way of writing those
    findings. It names the target as either `old_string` (must match exactly
    once in the base revision's body) or an SEO field, plus `new_string` or
    null, `category`, `rule_id`, `needs_input` (the question to ask when the
    edit needs a fact the model must not invent) and a rationale.
  - The server converts each one into the shared schema before staging it: it
    resolves `old_string` to a span with position and quote, and records the
    field's current value as `expected`. From then on nothing uses
    `old_string` again.
  - Findings commit with the reply, like documents do, and are stored in
    `agent_output_suggestions` with append-only status events (`open`,
    `accepted`, `dismissed`, `stale`).
- **Editor.** The frontend has no rich-text editor today: Agent documents are
  raw Markdown in a textarea ([output-editor.tsx](../../frontend/components/agent/output-editor.tsx))
  saved compare-and-set against `baseRevisionId`. The page editor uses
  CodeMirror 6 (`@codemirror/view`, `state`, `lint`, `lang-markdown`; MIT) on
  that Markdown body, so server offsets equal editor offsets with no conversion
  layer. Suggestions are decorations mapped through each edit (`mapPos` with
  `TrackDel`); one whose span was deleted or edited becomes stale. Accept is one
  transaction; Apply all is one transaction of non-overlapping changes. A
  WYSIWYG view (ProseMirror) is deferred; Tiptap's tracked changes are a paid
  add-on.
- **Accept (server-side).** The request names the latest revision it was made
  against (compare-and-set, as today's edits do). A newer revision is a
  conflict, not a silent rebase. The server then checks three things, and a
  failure makes the finding `stale` instead of applying it:
  - **Span:** the finding's span is mapped through every revision since its
    own (a diff of each revision against its predecessor). The mapped span
    must still exist and its text must still equal the exact quote. The same
    text appearing once somewhere else never counts as a match.
  - **Field:** a field replacement applies only while the field still equals
    the recorded `expected` value.
  - **Dependencies:** nothing the finding depends on has changed since its
    revision. For example, a title/H1/meta consistency finding depends on the
    title, the meta description and the H1, so editing any of them stales it.

  When all three hold, the replacement is applied and a new revision is
  appended.
- **Apply all.** Applies every ready suggestion that does not overlap another
  open suggestion and passes the same checks as Accept, in one revision.
  Applying one finding can change another's dependencies. Those are evaluated
  in order of position, so a dependent finding later in the batch becomes
  stale instead of being applied. Overlapping suggestions are offering
  alternatives for the same text, so none of them wins automatically: they
  stay open and are marked "choose one", and the user accepts one by hand
  (accepting it makes the others stale). The response and the panel report
  three counts: applied, left for a choice, and `needs_input` (always
  skipped).
- **Needs input.** "Add to context" opens the chat with the suggestion quoted;
  the user's fact is chat-confirmed (never a reviewed company fact), and the
  next turn replaces the suggestion with a ready one.
- **Export and handoff.** Copy as Markdown/HTML. Developer handoff (from the
  priority backlog) carries the revised copy and technical fixes. Direct CMS
  publishing is a future feature behind an explicit user action.
- **Suggestions are not issues (CO11).** Rule-based suggestions live only in
  the editor and never enter Site Health's Issues, which is unchanged.
- **No scores (CO14).** The editor shows suggestions grouped by category with
  counts of open items, never a grade or a content score.

### 4. New-page gaps

`content_gap_new_page` hands off to the existing content-creation workflow with
the angle as the brief (cited titles, prompts, competitor examples). No new
editor is needed for the MVP.

### 5. Measurement

**Mark implemented** declares the Action with the revision on screen. Checks:

- new check kind `owned_url_cited`, with its expectation frozen at
  declaration so later reclustering or rematching never changes what it
  measures:
  - *Improve page:* it freezes the page's URL and the lineage's prompt IDs. It
    is met when an audit after go-live that ran those prompts cites that URL.
  - *New page:* it freezes the prompt IDs and the set of owned URLs already
    cited for them in the baseline window. It is met when an audit after
    go-live cites an owned URL **outside** that baseline set for those
    prompts. The user names no URL (a declaration never chooses its own
    target), and an angle matched later plays no part.
- existing prompt-targeted visibility on the same prompts;
- existing Site Health rule checks for any Site Health findings the edits
  fixed.

`owned_url_cited` reports only whether the URL was cited. It says nothing about
which version of the page the engine read, so it never shows the edited
revision went live. Only the next crawl's Site Health checks read the page
itself. The causality notice stays: a met check is a measurement, not proof
that the edits caused it.

### Phase 2 (after MVP)

Read cited pages (extend source inspection to competitor pages cited for
tracked prompts, robots-respecting and budgeted), extend differentiation to
cited pages, and suggest passage-level additions from what cited pages cover.

## Open questions

All product questions were answered on 2026-11-10 (CO1–CO18). Left to settle
while building, with no product effect:

- Thresholds (`min_citations`, `min_domains`, URLs per topic, owned candidates
  per angle), measured on real audits first.
- How `classification` and `source_class` values map to "competitor" and
  "editorial or publisher" (CO3).

## Phases

1. **Angles and gaps** ([phase 1 plan](content-optimization-phase-1.md)).
   Angle refresh task and tables, the `content_gaps` family, the persisted
   Action surface, and the Content optimization screen as a list (no editor
   yet). The billing decision is B73.
2. **Editor** ([phase 2 plan](content-optimization-phase-2.md)). The page
   workspace inside the Agent window (E1), fetch on open, Analyze a page, the
   `content_optimize` skill, the `suggest_edits` built-in, the `page` kind, the
   CodeMirror editor with Apply / Dismiss / Revert / Apply all, needs-input via
   chat, export.
3. **Measurement.** The `owned_url_cited` check kind and Mark implemented from
   the editor.
4. **Next.** The rules engine's deterministic linters (L1–L3), reading cited
   pages, any-URL optimization as a paid add-on, rules for new Agent drafts
   (CO18), and CMS publishing.

## Risks

- Empty or generic citation titles (scraper citations) weaken clustering;
  measure the empty-title share on real audits before tuning thresholds.
- A title says what a page is about, not what it covers; MVP gaps are
  topic-level only, which phase 2 addresses.
- Structured `suggest_edits` output adds an Agent built-in and an output kind;
  the skill loader, catalog fingerprint and runtime tests must cover it.
