# Content optimization phase 2: the page editor

Status: proposed, 2026-11-10. It follows [Actions simplification](actions-simplification.md)
(shipped in #700, #699, #701 and #703) and replaces phase 2 of
[content optimization](content-optimization.md#phases). The architecture in
section 3 of that document still holds, except where this plan changes it to
fit one Actions list (AS1) and the full Agent window. The rules that decide what
the model suggests live in the [content rules engine](content-rules-engine.md).

**Delivers**

- **Work with the agent** on an Action for one of your content pages opens the Agent
  window as a page workspace. The live page is fetched and fills the left side.
  The right side shows Suggestions, Outline and SEO, with the Action's chat docked
  under them.
- Suggestions highlighted in the page: blue edits are ready to apply, amber ones
  need a fact from you. Apply, Dismiss, Revert, Apply all and Dismiss all.
- The Agent edits the page in place. Selecting text and choosing **Ask AI**, or
  choosing **Add to context** on a suggestion or coverage gap, writes the chat
  message; it is never sent automatically.
- Coverage gaps under the suggestions, from the Action's content-gap evidence.
- Export: copy as Markdown, HTML or plain text; download as `.md` or `.html`.
- **Analyze a page** on the Actions page: pick one of the latest crawl's content
  pages, a topic and prompts, and get an Action that opens the same workspace.

**Not in phase 2:** the `owned_url_cited` check (phase 3), the deterministic
linters L1 to L3, reading competitors' cited pages, optimizing any URL (a paid
add-on), rules for new Agent drafts (CO18), CMS publishing, a WYSIWYG editor,
and MCP tools for the editor.

## Owner decisions

| ID | Decision |
|---|---|
| E1 | The editor lives inside the Agent window (owner, in chat, 2026-11-10: "Option 1"). When a chat works on a page, `/agent/chats/:id` becomes a workspace: the page on the left, and on the right Suggestions / Outline / SEO with the chat docked below. There is no separate editor route and no slide-out panel. Chats without a page keep today's single column. |

### Proposed (need the owner's confirmation)

| ID | Proposal | Why |
|---|---|---|
| E2 | The page is Markdown edited in CodeMirror 6 with live-preview styling: headings, bold and links render as text, and their Markdown marks show only on the cursor's line. | Server offsets equal editor offsets, so suggestions anchor exactly with no conversion layer (content-optimization §3). A true rich-text editor (ProseMirror) is deferred. |
| E3 | The workspace opens for an Action whose target is an owned page of a content kind (CO15), or a page picked in Analyze a page. Other Actions keep today's chat. | Matches CO15 without routing Actions to separate screens (AS1). |
| E4 | Revert on an applied or dismissed suggestion returns it to To review. Reverting an applied one restores the original text while that span is unchanged; otherwise the revert is refused and explains why. | Peec offers Revert. Without it, Apply is one-way except through revision history. |
| E5 | The SEO tab shows Site Health's page-local checks from the editor's fetch, labelled with the fetch time. Editing the page doesn't rerun them. | Matches CO12 and the rules engine's L0. |

## How it works

```
Action detail "Work with the agent" (content page)    Actions "Analyze a page"
        |                                                     |
        +--> POST /agent/chats  workflow optimize_page  <-----+
               commits chat + page_fetch task (no Agent run yet)
        page_fetch (analytics lane): pinned fetcher, robots gate, host pacing
               raw response -> page_snapshots (append-only)
               main content -> Markdown + SEO fields -> output revision 1 (author "fetch")
               page-local Site Health rules on the snapshot -> SEO tab
               success -> enqueue the Agent run      failure -> chat shows why, no charge
        Agent run (skill content_optimize, AI credits)
               suggest_edits -> staged findings, committed with the reply
               edit_document -> new revision (as today)
        Workspace: Apply / Dismiss / Revert / Apply all
               server-side compare-and-set -> new revision + suggestion events
```

## PR 1: fetch the page into a page document

### 1.1 Migration `0019_page_documents.sql`

- `page_snapshots`, insert-only and workspace-scoped: project, `site_url_id` (nullable,
  for a page outside the crawl), requested URL, final URL, fetched_at, HTTP status,
  outcome (`fetched`, `blocked_robots`, `http_error`, `unsupported`, `failed`),
  content type, raw body (capped by config), extractor version, and
  `chat_id`/`action_id` for traceability.
- `agent_output_revisions.fields jsonb` (nullable): the SEO block `{title,
  meta_description, json_ld}` of a page revision.
- `agent_output_revisions.author` admits `fetch` for revision 1.
- `agent_outputs.snapshot_id` (nullable FK): the snapshot a page document started from.

### 1.2 Config

- `config/content-optimization.ts`: fetch limits (body bytes, timeout), the
  output caps for a page document, and `page_kinds` reused from CO15.
- `config/agent-skills.ts`: output kind `page`.
- `assets/agent-skills/workflows.json`: workflow `optimize_page` (skill
  `content_optimize`, kind `page`, input url).
- `config/actions.ts`: `content_gap_improve_page` hands off to `optimize_page`
  instead of `refresh_page`. The handoff message template is unchanged.

### 1.3 The fetch task `services/api/src/page-documents/`

- Analytics kind `page_fetch`, registered like `content_angle_refresh`, with an
  idempotency key of chat ID and URL.
- It fetches through Site Health's `SitePageFetcher` (pinned fetcher, robots gate,
  hard exclusions) behind `authorizeAcquisition` and `HostPacer`. The task commits
  before any network I/O.
- HTML to Markdown: parse the main-content region that Site Health's page analysis
  reads, then convert it with `rehype-parse`, `rehype-remark`, `remark-gfm` and
  `remark-stringify`, all MIT and from the same unified family as the existing
  `react-markdown`. Title, meta description and JSON-LD come from
  `source-pages/extract.ts` and `web-evidence/html.ts`.
- On success, in one transaction: the snapshot, the `page` output with revision 1
  (author `fetch`, body Markdown, `fields`), the page-local Site Health
  evaluations, and the queued Agent run. On failure: the snapshot with its
  outcome, a chat notice, and no run, so nothing is charged (B73).

### 1.4 Chat creation

- `POST /agent/chats` with workflow `optimize_page` validates the URL. It must be an
  owned page of a content kind in the latest crawl, or the Action's own target.
  The request commits the chat and the `page_fetch` task instead of an Agent run.
- The chat read gains `page_fetch: {status, outcome, fetched_at}` so the
  workspace can show "Reading your page…", a robots block or an HTTP error.

### 1.5 Skill `content_optimize`

- `assets/agent-skills/skills/content_optimize/SKILL.md` (output kind `page`).
  Context: the page document, the Action's content-gap evidence (angle, prompts,
  cited titles), every Site Health finding on the page, reviewed business facts,
  and the rule catalog. It works in the project's language (CO17).
- Until PR 2 it may only reply and use `edit_document`.

### 1.6 Tests

- `test/page-fetch.test.ts`: fetched, robots-blocked and HTTP error outcomes;
  Markdown and SEO fields for a fixture page; no Agent run and no charge on
  failure; workspace isolation of snapshots.
- `test/agent-optimize-page.test.ts`: the chat route refuses a URL outside the
  crawl's content pages, and a successful fetch queues exactly one run.
- Skill catalog fingerprint and loader tests cover the new skill and kind.

### 1.7 Docs

`docs/agents.md` (the workflow, kind and skill), `docs/content-optimization.md`,
and `docs/opportunities.md` (the handoff).

## PR 2: suggestions

### 2.1 Migration `0020_page_suggestions.sql`

- `agent_output_suggestions`, insert-only: output, revision it was made against,
  anchor (`span` with UTF-16 offsets and the exact/prefix/suffix quote, a `field`
  with `expected`, or `page`), `depends_on`, replacement (nullable), `needs_input`
  question, category, rule ID, rationale, source (`model` or `site_health`), and
  run and message IDs.
- `agent_output_suggestion_events`, append-only: `open`, `applied`, `dismissed`,
  `reverted`, `stale`, with actor and resulting revision.

### 2.2 Built-in `suggest_edits`

- Registered beside `edit_document` (`builtin-tools.ts`, `runtime.ts`). It takes
  `old_string` (must match exactly once in the current body) or an SEO field,
  plus `new_string | null`, category, rule ID, `needs_input` and rationale.
- The server resolves each one to the rules engine's finding schema before
  staging it. Findings commit with the reply, like documents. A refusal tells the
  model how to fix the call, as `edit_document` does.
- Page-local Site Health findings from the fetch become `site_health` suggestions
  when they have a field fix (title, meta description); otherwise they appear in
  the SEO tab only (CO11).

### 2.3 Routes

- `GET …/outputs/{output_id}/suggestions`: open, applied and dismissed, with
  counts per status and category.
- `POST …/suggestions/{id}/apply`, `/dismiss` and `/revert`, plus
  `POST …/suggestions/apply-all` and `/dismiss-all`. Each names its
  `base_revision_id`. A newer revision is a 409 `agent_output_conflict`. Writes
  are refused while a run is active (`requireIdle`).
- Apply checks span, field and dependencies (content-optimization §3), appends a
  user revision and records the event; a failed check marks the suggestion
  `stale`. Apply all applies non-overlapping ready suggestions in position order
  in one revision, and leaves overlapping ones open as "choose one". It returns
  applied, left-to-choose and needs-input counts.
- A user's own edit (today's `editOutput`) maps every open suggestion through the
  diff and stales those whose span or dependencies changed.

### 2.4 Contracts and tests

- `packages/contracts/src/agent.ts`: the suggestion, event and page-fetch
  schemas; `pnpm gen` updates `public-api.json`.
- `test/page-suggestions.test.ts`: apply, stale span, stale field, dependency
  stale, apply-all ordering and overlap, revert (E4), conflict on an old base,
  refusal during a run, and workspace isolation.

## PR 3: the workspace

### 3.1 Dependencies

`@codemirror/state`, `@codemirror/view`, `@codemirror/commands` and
`@codemirror/lang-markdown` (MIT). The bundle is code-split so only the workspace
loads them.

### 3.2 Components `components/agent/workspace/`

- `chat-screen.tsx` renders `PageWorkspace` when the chat has a `page` output; other
  chats keep today's thread.
- `page-workspace.tsx`: a two-column layout (page about 60%, rail 40%) under a
  header with the breadcrumb, Mark implemented and Export. Below 1024px the rail
  becomes tabs under the page.
- `page-editor.tsx`: CodeMirror with live preview (E2). Suggestions are
  decorations mapped through edits (`mapPos`, `TrackDel`), blue or amber. Clicking
  a highlight opens its card, and clicking a card scrolls to its highlight.
  Saving uses today's compare-and-set revision save.
- `suggestions-panel.tsx`: To review / Applied / Dismissed filter, cards grouped by
  passage, Apply, Dismiss, Revert, Add to context, then Apply all and Dismiss all,
  then coverage gaps from `content_gap_evidence` with Evidence and Add to context.
- `outline-panel.tsx`: headings from the current body; click to jump.
- `seo-panel.tsx`: the fetched SEO fields and page-local checks with the fetch time
  (E5).
- `workspace-chat.tsx`: today's conversation and composer in the rail. While a run
  is active the editor is read-only and shows the Agent's edits as they stream
  (`document_delta`).
- Ask AI and Add to context write a quoted reference into the composer, and a
  starting request when it is empty. They never send.
- Export reuses `lib/agent/export.ts`, adding HTML and plain text.

### 3.3 Entry points

- The Action detail's Work with the agent opens `optimize_page` for E3 Actions;
  the prefilled message is unchanged.
- The workspace's Mark implemented uses today's declaration dialog with the
  revision on screen.

### 3.4 Tests

- Unit: the suggestions panel (filters, apply, revert, apply-all counts), decoration
  mapping after an edit, and Ask AI filling without sending.
- E2E `e2e/page-workspace.spec.ts`: an Action opens the workspace, a ready
  suggestion applies and its highlight clears, an amber suggestion fills the chat,
  and the layout holds at desktop and mobile widths.

### 3.5 Docs

`docs/agents.md`, the public docs page for Actions, and a changelog entry. Marketing
copy changes only if the owner asks.

## PR 4: Analyze a page (CO6)

- An **Analyze a page** button in the Actions header opens a dialog: a content page
  from the latest crawl (searchable, content kinds only), a topic, and that
  topic's prompts.
- `POST /projects/{id}/actions/analyze` creates or reuses the page's `agent`-origin
  Action through the target adapter and starts an `optimize_page` chat on it.
- Tests: only content pages are offered, a repeat reuses the Action, and
  workspace isolation.

## Order

PR 1 → PR 2 → PR 3, each merged before the next. PR 4 needs only PR 1 and can be
built alongside PR 2 or PR 3.

## Done when

- A content page Action opens the workspace with the live page, suggestions and the
  chat, and nothing is charged when the fetch fails.
- Apply, Dismiss, Revert and Apply all leave a revision history that matches what
  the user saw, and no stale suggestion is ever applied.
- Analyze a page creates an Action from a crawl content page and opens it.
- The docs listed in each PR describe what shipped.

## Risks

- Main-content extraction varies by site theme. A page whose Markdown loses
  sections makes suggestions anchor to the wrong text. Measure on real crawls
  before tuning, and show the fetched outcome plainly.
- Live preview hides Markdown marks, which may still confuse non-technical users.
  E2 is revisited if the owner wants WYSIWYG.
- `suggest_edits` adds a built-in and an output kind, so the skill loader, catalog
  fingerprint and runtime tests must cover it.
- Some hosts block fetches by robots rules or firewalls. The workspace then has no
  page to edit; the chat explains why and suggests pasting the page as a fallback,
  which is not built in phase 2.
