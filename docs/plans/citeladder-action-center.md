# Agent workspace — CiteLadder's MCP capabilities and skills, inside the app

**Status: proposed, awaiting owner approval (25 September 2026).** This
revision replaces the earlier Action Center draft. Owner decisions are recorded
in §1. This document does not authorize execution until it is listed as active
in [plan status](ACTIVE.md).

**Core idea.** The in-app agent gives a user what a customer gets by connecting
the CiteLadder MCP server and running the CiteLadder growth skills in their own
ChatGPT or Claude. It uses the same read tools, the same methodology and the
same evidence rules, so the app and MCP never disagree. The app adds only what
an external assistant cannot provide: persisted chats with their deliverables,
Actions and the measurement loop. **The MCP server and the customer skill pack
are unchanged by this plan**, except for the retired catalog tool described in
§6.2.

**Inputs (untracked; both removed in PR 1):**

- `docs/citeladder-growth-skills/` holds the customer MCP skill pack: 12 skills
  at v1.1.0.
- `docs/agents_temp_mock/` holds three screenshots and a clickable HTML
  prototype. They are layout and flow references only. §11 records everything
  the build needs from them. The build uses the CiteLadder design system
  ([design](../design.md)), not the prototype's styling, copy or Web research
  toggle.

## 0. Problem

The first question from Best&Less after the demo was: *"What should we do next
week, and where should we focus?"* Today the product cannot answer that in one
place:

- **Opportunities** ranks one row per `(rule, target)`, so the same category
  page appears as three or four unrelated rows.
- **Content** starts from an empty instruction box. It generates in a single
  step from 18 native format skills, with no workflow and no refinement.
- **Growth Agent** is a drawer with two fixed tasks. It restates the ranked
  list and cannot work inside the object the user is looking at.
- **The app and MCP use different methodology.** Customers running the growth
  skills over MCP get job-level methodology that the app does not use.
- **Search Demand** repeats one templated prose card per query signal.

## 1. Owner decisions (25 September 2026)

1. **Same capabilities as MCP.** The in-app agent reads through the same tool
   definitions as the MCP server and follows the same 12 skill methodologies,
   adapted to run in the app.
2. **The skills are internal, and MCP is unchanged.** Skills are coded in the
   backend for the agent. They are not downloadable, not packaged for
   distribution and not added to MCP. Who receives the customer pack is a
   business decision outside the product. Users see only a brief read-only list
   of the available skills.
3. **One agent workspace.** An agent-first **Agent** area replaces
   Opportunities, Content and the Growth Agent drawer. Its views are New chat,
   Actions, Skills, Context and the chat list. They are views over one system.
4. **Chats are the saved work.** There is no separate Saved work section. A
   chat holds its conversation and its deliverable, and opening it shows the
   latest output in the right pane with copy and export.
5. **Core flow:** ask or select a recommendation → gather context → apply a
   skill → produce an output → refine → declare implementation → measure.
6. **Analysis does not need an Action.** General questions are answered in
   chat. Only concrete work, meaning an output for a target, attaches to an
   Action.
7. **One work item per target.** An *Action* groups the rule-level Opportunities
   and the agent work that share a target. Agent work on a target that already
   has an Action attaches to it and never creates a duplicate.
8. **One runtime, one credit meter, one capability.** The Content generation
   and Growth Agent runtimes retire into one agent runtime. Credits (the
   existing billing ledger, with BYOK where configured) fund every agent turn,
   including answer-only chat. `content_creation` and `growth_agent` merge into
   one `agent` capability, granted wherever either is granted today.
9. **Outputs are revisable.** Follow-up instructions and direct edits create
   revisions of the chat's existing deliverable. Long-form new content is
   outline-first, with an explicit approval before drafting.
10. **Implementation is declared, never inferred.** Verification rides the
    existing measurement loop. The agent never publishes, modifies websites,
    triggers audits or syncs, or claims improvement without evidence.
11. **Company facts move to Agent › Context.** The Overview "Edit facts" drawer
    is removed. The data owner (project brand profile, competitors) is unchanged.
12. **No web research, no weekly board.** The agent reads persisted CiteLadder
    evidence and user instructions only. Actions are ordered by deterministic
    priority, with no Now/Next/Later or WIP limit.
13. **Navigation.** A **Dashboard | Agent** switch sits above Overview. Routes
    live under `/agent`, with a clean cutover and no `/opportunities` or
    `/content` aliases (pre-launch, no customers).
14. **Four PRs.** The first builds the base and removes the debt, and the
    global agent panel ships last (§13).

## 2. Target model

```
Evidence owners (Site Health, Demand, Visibility/AIO, Sources, Search Intel, Commerce)
        │  unchanged
        ├──────────► Read-tool registry ──► MCP server (advertised set unchanged)
        │                    └────────────► Agent runtime (MCP set + in-app detail readers)
        ▼
Opportunity (rule × target)          ← immutable, recomputed
        │  deterministic grouping (config)
        ▼
Action (target)                      ← status, priority, convergence, diagnosis
        ▲
        │ attaches (0..1)
Chat ── Turn ── Run (skill, context manifest, tool/model attempts)
  │
  └── Output ── Revision (agent | user edit) ── Declaration → loop legs
```

- A **Chat** exists without an Action. It attaches to one when it produces an
  output for a target (§5.2).
- A chat has **at most one active output**, the deliverable its right pane
  shows. Refinements revise that output.
- A **Declaration** references the Action and the exact output revision the
  user says they implemented.

**Convergence** is the differentiator. An Action records which independent
evidence systems agree on its target: AI Visibility, Sources, Google AI
Overview, Search Console, Search Intelligence, Site Health and the link graph.
"Evidence from 5 systems" is a deterministic property that feeds priority. It
is not a model's opinion.

**Ownership:**

- The [Opportunities owner](../opportunities.md) keeps Opportunities, Actions,
  diagnosis and declarations.
- The [MCP owner](../mcp.md) keeps its transport, consent and advertised tools.
- A new **Agent owner** (`docs/agents.md`, replacing `content-generation.md`
  and `growth-agent.md`) owns the read-tool registry, the internal skills,
  chats, runs, outputs, revisions and the context package.

An Action is the unit of workflow over the existing store, not a second
opportunity store (invariant 1). The agent is not a second knowledge store.

## 3. Actions: grouping, status, priority

| Target | Grouping key | Members |
|---|---|---|
| Owned page | normalized `SiteUrl` | every owned-path Opportunity on that URL |
| Prompt cluster with no owned page | prompt cluster / theme | visibility rules. A candidate owned page from query relevance is attached and labelled **inferred** |
| Earned page | inspected source page | the `earned_page_*` rule for that page |
| Product | catalog product | commerce rules |
| Planned page | user-confirmed topic slug for new content | none until evidence appears; origin `agent` |

- **Membership** uses Opportunity stable keys `(rule_id, target_key)`, so
  recompute never breaks an Action. Each Action snapshot records the exact
  member row IDs and versions (invariant 5). An agent-created Action for a URL
  later gains rule members through the same key and is never duplicated.
- **Status** moves from Opportunity to Action. The replacement gate deletes
  Opportunity status and its carry-forward logic:
  `open → in progress → implemented (declared) → measuring → done | dismissed`.
  - `in progress` is derived from a linked chat having an output.
  - `implemented` is reachable only through an explicit user declaration.
  - `dismissed` is a user action.
  - The agent cannot set any status.
- **Priority** is deterministic and versioned in config: the strongest member
  severity, plus convergence, plus demand weight, minus the effort band.
  Unavailable families add nothing and are not zeros (invariant 7).
  Agent-origin Actions without members sort after evidence-backed ones.

## 4. Diagnosis (deterministic, persisted at compute time)

- **What happened.** One line per member, with source IDs.
- **Why, by evidence family.** Each family shows `observed`, `stale`,
  `unavailable` or `not applicable`.
- **Approach**, from a config decision tree: `improve_existing`, `consolidate`,
  `create_new`, `fix_technical`, `earned_placement` or `research`, with explicit
  *don'ts* such as "do not create another URL: an indexable page already maps to
  this demand". The approach picks the default skill (§6.2).
- **Measure with.** The evidence each loop leg will bring: the next scheduled
  visibility run on the affected prompts, the next Search Console sync window,
  and the next crawl of the page.

This replaces the development-only guidance (`guidance.py`,
`OpportunityGuidance`, the `/guidance` route and its config).

## 5. Starting work

### 5.1 Three entry points, one chat

1. **Ask a question** ("What should we focus on?", "Why did /baby drop?"). The
   agent answers from evidence, typically under the growth-plan or a diagnostic
   skill. It cites sources and produces no output or Action.
2. **Select a recommended Action** ("Work on this" on an Action, or from an
   evidence screen). The chat opens attached to that Action with its target,
   diagnosis and member evidence preloaded as context chips.
3. **Request a deliverable** ("Improve the babywear page", "Write a
   school-uniform checklist"). The skill is resolved (§6.2). The target is taken
   from the request, or the agent asks for it when it materially matters.

Evidence screens (Site Health issues, Search Intelligence rows, Search Demand
signals, AI Visibility prompts) replace their Content handoffs with **Ask
agent** or **Work on this**. The browser passes typed IDs only. The server
resolves and authorizes them, as the Content handoff does today.

### 5.2 Attaching work to an Action

When a run saves an output with a resolved target, the runtime attaches the
chat to the Action for that target's grouping key. If none exists, it creates
an agent-origin Action. This is a deterministic server step inside
`save_output` (§6.3), not a separate model decision.

- Findings the agent surfaces are **references to existing evidence IDs**
  recorded on the turn. They are never new rows in an evidence owner or new
  Opportunities.
- A workspace-level output, such as a growth plan or measurement plan, belongs
  to no single Action. Each plan row offers **Work on this**, which starts a
  chat for that row's target and creates or attaches the Action.
- A chat attaches to at most one Action. Work on a second target offers a new
  chat, pre-filled from the current one.
- New content without a destination stays unattached until the user confirms a
  planned-page topic or a URL. Declaration requires an Action.

## 6. Tools, context and skills

### 6.1 One read-tool registry

The read tools in `domain/agent/tools.py`, which MCP calls through
`app/domain/mcp/data.py`, and the other MCP read definitions become one
**registry** under the Agent owner:

- **One definition per tool.** Each tool has one name, schema, authorization
  check, pagination contract, availability states and provenance fields. The
  MCP server binds its current tool set to these definitions, and its
  advertised names and schemas do not change.
- **The same result on both surfaces.** For the same data, the in-app agent and
  MCP return identical results. The in-app principal is the signed-in member in
  the active workspace, and the MCP principal is the consented account. Both
  pass the same workspace authorization.
- **In-app detail readers.** The skills need evidence that product owners
  already hold but no read tool exposes:
  - Demand query-page rows, with exact windows and cursors;
  - Site Health pages, issues and link edges;
  - Visibility answers and citations;
  - earned-source passages;
  - Search Intelligence datasets;
  - Actions and their diagnosis.

  These are registered with exposure `agent` only. Exposing any of them to MCP
  later is a one-line, separately decided change. Every reader is a projection
  read and never materializes, syncs or calls a provider (invariant 2).

### 6.2 Internal skills

The 12 customer-pack methodologies are ported into a packaged backend location
(`backend/app/core/config/agent_skills/`, declared in `backend/pyproject.toml`).
They are production inputs, not coding-agent skills. The port also improves
them for the in-app runtime.

**Kept and adapted:**

- **Each skill's SKILL.md.** References to MCP catalog discovery, local
  `growth/…` files, `session-handoff.md` and "not saved to CiteLadder" become
  the in-app equivalents: the advertised registry, `save_output` and the chat.
  Tool names match the registry. Output contracts (for example the
  `gsc-page-edits` edit table) remain the output kinds.
- **One shared operating contract**, stored once instead of 12 identical
  copies. It is rewritten for the runtime: the read-only registry, the save
  behaviour, no paid acquisition and no publishing. Its evidence, labelling
  (observed / inferred / hypothesis / unavailable), freshness and
  honest-finish rules stay intact.
- **One format reference** for `content-create` and `comparison-content`. It
  merges the pack's `content-formats.md` with the 18 native Content format
  skills (category page, product page, article, blog, listicle, FAQ, glossary
  term, case study, about us, content page, comparison, newsletter, YouTube,
  LinkedIn, X, Instagram, TikTok, Reddit). Where the two conflict, the pack's
  stricter rules win (no compulsory FAQ, no minimum word counts, no fabricated
  proof). Sections load only for the chosen format.

**Dropped from the repository:**

| Pack file | Why it is not a runtime input |
|---|---|
| `agents/openai.yaml` | Codex UI metadata for the customer pack |
| `evals/evals.json` | Scenario definitions that were never executed. The scenarios that encode product rules (no joining page and query aggregates, missing data is not zero) become deterministic tests of the tool and manifest layer where they are testable; model-behaviour evaluation is out of scope |
| `references/sources.md` | Authoring bibliography. `docs/agents.md` records one line of provenance |
| `references/mcp-data-map.md` | A tool map pinned to one commit for external clients. In-app, the advertised registry schemas are the authority |

**Removed from MCP:** `list_skills` and the `citeladder://skills` resource
advertise the native Content catalog and the Growth Agent capabilities, and
both retire in this plan. Rather than repointing them to the internal skills
(decision 2), PR 1 removes them from MCP. No other MCP tool changes.

**Selection order:**

1. the attached Action's diagnosis approach;
2. a bounded model classification over the 12 skill descriptions;
3. the user steering in chat ("treat this as an internal-link plan").

The chosen skill's name and the reason are recorded on the turn and shown as a
small label on the agent message. The methodology text is never shown.

**The Skills view** is a brief read-only list: each skill's name, one sentence
and what it produces. It has no downloads, no methodology text and no install
path.

### 6.3 Runtime adapters

| Operating-contract element | In-app behaviour |
|---|---|
| Tool catalog | the registry's `agent` exposure, advertised to the model |
| Business context | the context package, preloaded (§6.4), plus the business-context read |
| Deliverable destination | `save_output`: the runtime's only write, limited to this chat's output revision in the same workspace. It returns the revision ID as the verifiable result |
| Session handoff | the chat itself: turns, evidence IDs and output |
| Publishing, outreach, prompt activation, syncs, paid acquisition | never available |

`save_output` cannot touch evidence owners, Action status, prompts or
declarations.

### 6.4 The context package

The single context builder (`domain/content/context_builder.py`) moves to the
Agent owner. It assembles the starting manifest that the skills tell the model
to reuse, and the model then reads more through the registry. Each run freezes:

- workspace and project, the selected target and Action (if any);
- company facts and competitors (`knowledge_base.build_brand_knowledge_data`,
  `BusinessContext`), with review state;
- **agent instructions**: a new persisted, versioned, project-level text
  (voice, audience, standing don'ts) edited in Agent › Context, plus the
  chat's own instructions;
- attached evidence, with exact source IDs and processing versions;
- for each evidence family, one of `observed (as of)`, `stale (as of; threshold
  from config)`, `unavailable`, `not connected` or `not applicable`.

Message building keeps user instructions separate from untrusted crawl and
reference text. Context chips in the composer show the manifest's inputs, and
the user can remove optional ones before sending.

## 7. Execution and outputs

- **The agent manages its internal steps.** A run is a bounded tool-use loop:
  the model follows the skill, calls registry tools and saves an output, with
  no per-step approval. The agent message shows a collapsible step summary
  ("Run complete · 3 steps").
- **Direct outputs.** Page edits, snippet refreshes, internal-link plans and
  technical fixes produce a reviewable output in the first run.
- **Outline first for long-form.** `content-create` and `comparison-content`
  first save an editable outline. **Use outline & write** records approval of
  that outline revision. The draft is then generated as the next phase of the
  same output and cites the approved revision.
- **Clarification only when material.** The agent asks one grouped question
  only when a missing fact would materially change the work. Otherwise it
  proceeds and states the assumption.
- **Blocked evidence yields a partial result.** When a skill's minimum
  evidence is missing, the output is the usable labelled partial result plus
  the exact missing dataset. Missing data is never presented as zero.
- **Bounded execution.** Config owns the per-run tool-call, model-call and
  wall-time limits, the per-run credit cap and the per-chat turn limit. These
  are frozen at admission. Reaching a cap ends the run with a visible "stopped
  at limit" state.
- **What a turn cannot do:** change Action status, declare implementation,
  trigger syncs, crawls or visibility runs, activate prompts, or write to any
  external system (invariants 10, 13).

## 8. Chats, outputs and revisions

### 8.1 Persistence (one runtime)

| Model | Role |
|---|---|
| `AgentChat` | workspace/project, optional `action_id`, title, created by, archived at |
| `AgentTurn` | append-only user and agent messages, with evidence references and the skill and version used |
| `AgentRun` | leased, idempotent PostgreSQL queue item producing one agent turn: frozen context manifest, skill and registry versions, budget, route/funding, status |
| Tool, model attempts | append-only, as in Content and Growth Agent today (versions, hashes, omissions, usage, settlement) |
| `AgentOutput` | the chat's deliverable: kind, target, phase (`outline` / `draft` / `final`), latest revision |
| `AgentOutputRevision` | append-only body (typed per kind), author (`run` or `user edit`), parent revision, source references, approval marker for outlines |

- Credit reservation, settlement and unknown-usage recovery reuse the
  **billing ledger** exactly as Content and Agent do today, with a single
  `agent` usage kind. Model calls are metered, and tool reads and user edits
  are not.
- Content's frozen-context, retry-versus-regenerate and archival semantics
  carry over. *Retry* re-runs a turn on its frozen manifest. *Refresh
  evidence* re-runs it on current evidence. Archival redacts user-visible
  content but keeps attempt and ledger provenance.

### 8.2 Refinement and reopening

- **Through chat:** a follow-up revises the chat's output. The new revision's
  parent is the latest revision, including user edits. Quick refinements ("Make
  it shorter", "No standalone FAQ") are ordinary turns.
- **By direct editing:** **Edit** in the output pane saves a user revision.
- **History** lists revisions with author and time. Any revision can be viewed
  or restored, and a restore creates a new revision.
- **Reopening** a chat restores its turns and the latest revision in the right
  pane. Reads render persisted projections only and never re-run the agent
  (invariant 2).

## 9. Implementation and measurement

- **Mark implemented** in the output pane opens the declaration dialog. The
  existing implementation declaration is re-anchored to the Action and the
  exact output revision, with a nullable output relationship for work done
  outside CiteLadder. It still freezes targets and expected checks up front.
- Expected checks are the union of the member rules' checks and any
  measurement plan the chat produced. Each loop leg says what it is waiting for:
  - **Visibility:** the next scheduled run on the affected prompts, with its date.
  - **Search Console:** the next complete window after the declaration, asking
    the user to sync if the data is stale.
  - **Site Health:** the next crawl of the target.
  - **Placement:** the existing earned-page recheck.
- Nothing is triggered automatically. Observations stay separate from the
  declaration and carry the causality notice. The agent can explain
  observations, but it cannot state an improvement that the persisted
  observation does not show.

## 10. What stays out of MCP

MCP keeps its current read tools, names and schemas. `read_opportunities` keeps
reading Opportunities. The following are **not** added to MCP in this plan:

- Actions;
- the in-app detail readers;
- the internal skills;
- chats and outputs.

The customer skill pack is maintained and distributed outside this
repository. This plan does not package or export it.

## 11. UI

### 11.1 Sidebar: Dashboard | Agent

A two-segment switch sits above Overview in the same row: **Dashboard** and
**Agent**. The active mode is derived from the route (`/agent/*` is Agent), so
deep links and back navigation stay correct. Switching returns to the last
route used in that mode for the project during the session.

- **Dashboard mode:** today's groups without the *Act* group (Overview,
  Analyze, Track).
- **Agent mode**, top to bottom:
  1. **New chat** (primary button)
  2. **Actions** (open count)
  3. **Skills**
  4. **Context**
  5. **Chats**: all chats, searchable and paginated. Each row shows the title,
     the attached target and an output marker (kind and phase) when the chat
     has a deliverable.

The compact (mobile) navigation and the command palette use the same switch
and destinations, and the palette adds **New chat**. The switch is shown to
every workspace member. Sending requires the `agent` capability and funding,
and blocked states explain why.

### 11.2 Agent views and routes

| Route | View |
|---|---|
| `/agent` | New chat: heading, composer (context chips, `@` targets and reports), starter prompts ("What should I focus on?", "Create content", "Fix a technical issue") and the top recommended Actions with **Work on this** |
| `/agent/chats/:chatId` | Header with the chat title, the attached Action/target and a Context & sources toggle. The conversation sits on the left, with the step summary, evidence markers, an output card that focuses the pane, and quick refinement chips. The right pane shows the output: tabs for Draft or Outline, Sources and History; the revision number; Edit, Copy and Export (Markdown download); and **Mark implemented** (or **Use outline & write** at the outline phase). The pane can close, and it reopens from the output card |
| `/agent/actions` | Actions ordered by priority, filterable by status and target type, with convergence and evidence count |
| `/agent/actions/:actionId` | Diagnosis, members, linked chats (each opens with its output), declaration and verification state, and **Work on this** |
| `/agent/skills` | Brief read-only skill list (§6.2) |
| `/agent/context` | Company facts and competitors (moved from Overview), agent instructions, and a read-only evidence availability table (observed, stale, unavailable, not connected) linking to each owner's screen to sync or connect |

On narrow viewports the output pane becomes a full-screen sheet with a toggle
back to the chat. Loading, empty, blocked (capability or credits), running,
stopped-at-limit and failed states are all distinct.

### 11.3 Design system

The build uses the ground/paper model, shared tokens and `components/ui`
primitives. It uses no arbitrary `text-[]` sizes and no shadows outside
`components/ui`, per the `check:policy` rules. Marketing copy is untouched.

### 11.4 Global agent panel (PR 4)

A top-bar **Agent** button on every Dashboard screen opens a right-side chat
panel. The panel is seeded with the current route's typed context (project,
target, selected rows or filters), never scraped DOM text. It uses the same
chats, runs and outputs, and **Open in Agent** moves the conversation to
`/agent/chats/:chatId`.

## 12. Search Demand redesign

The data owner and detectors stay the same. The screen changes:

1. **"Act on this" band.** Promoted signals, grouped by page, link to their
   Actions.
2. **One table grouped by page.** Queries, impressions, clicks, CTR and
   position, with a signal chip per row instead of prose.
3. **Each signal type explained once.** A legend or tooltip explains it, and the
   evidence drawer keeps full detail.
4. **Unavailable, not-synced and no-signal states stay distinct.**

## 13. Delivery: four PRs

Each PR is a series of dependency-ordered commits (slices). The repository stays
runnable after every slice.

### PR 1 — Foundation and cutover (backend base, debt removed)

1. **Actions.** Action tables, grouping/priority/convergence config, the
   diagnosis projection and the status cutover off Opportunities. Development
   guidance (`guidance.py`, `OpportunityGuidance`, `/guidance`) is removed.
   `/api/v1/actions` is added. The existing Opportunities screen reads Action
   status until PR 2.
2. **Registry.** `domain/agent/tools.py` and the MCP read definitions move into
   the Agent owner's registry. MCP binds to it with no change to its advertised
   set. The `agent`-only detail readers are added (§6.1).
3. **Skills.** The 12 skills are ported, adapted and improved into
   `agent_skills/`, with one operating contract and the merged format reference
   (§6.2). The native `content_skills` catalog and packs are deleted.
4. **Runtime.** Chats, turns, runs, attempts, outputs and revisions; the
   bounded tool-use loop; `save_output`; one worker; the `agent` usage kind
   and merged capability; the moved context builder; the agent-instructions
   field; skill selection; Action attach-or-create; and `/api/v1/agent/*`.
5. **Cutover.** Delete all of `domain/agent` except the moved tools, the Agent
   API, the agent worker, `config/agent.py`, and the Content API, worker and
   models. On the frontend, delete the `/content` screen, skill and target
   pickers, `agent-sheet.tsx`, `components/agent/*`, the shell triggers and the
   *Content* nav item. Remove MCP `list_skills` and `citeladder://skills`.
   Between PR 1 and PR 2 the app has no generation UI, which is acceptable
   pre-launch.
6. **Cleanup.** Delete `docs/agents_temp_mock/` and
   `docs/citeladder-growth-skills/`. Create `docs/agents.md`. Delete
   `docs/growth-agent.md` and `docs/content-generation.md`. Update
   [opportunities.md](../opportunities.md), [mcp.md](../mcp.md),
   [architecture.md](../architecture.md),
   [billing-entitlements.md](../billing-entitlements.md), the
   [AGENTS.md](../../AGENTS.md) packaged-skill owner link, and a
   [decisions.md](../decisions.md) entry (*one agent runtime over the MCP read
   registry; internal skills; the Action is the unit of work*).
7. **Verify the replacement.** A search for `domain.agent`, `AgentTaskRun`,
   `ContentGeneration`, `content_skills`, `growth-agent`, `growth_agent` and
   `content_creation` returns nothing outside history.

### PR 2 — Agent UI

The Dashboard | Agent switch, all §11.2 views, the chat and output pane with
edit, history, copy and export, Actions list and detail, the Skills list, and
the Context view with the facts moved (the Overview `FactsDrawer` is deleted).
Evidence-screen handoffs move to **Ask agent** and **Work on this**. The
`/opportunities` screen is deleted, and the *Act* group leaves the Dashboard nav.

### PR 3 — Implementation, measurement and Search Demand

Mark implemented and the declaration anchored to the Action and output revision
(§9), loop-leg waits on the Action detail and output pane, and the Search Demand
redesign (§12), whose "Act on this" band links to Actions.

**Customer-facing Agent copy (moved here from PR 1 by the owner, 25 September
2026).** PR 1 retired the Content and Growth Agent runtimes in code and
engineering docs only. PR 3 updates every customer-facing surface that still
names them: marketing modules (`frontend/lib/marketing-content/` pricing, FAQ,
`llms`, legal DPA), `README.md`, `PRODUCT.md`, the billing catalog descriptions
(`backend/app/domain/billing/launch_catalog.py`, its validator messages in
`catalog_revisions.py`, `docs/operations/razorpay-sandbox-catalog.json`) and
`docs/operations/CiteLadder_Launch_Config.md`. Retiring the persisted
`content_creation` / `growth_agent` capability keys is a separate billing
migration and is not implied by the copy change.

### PR 4 — Global agent panel

§11.4.

### Coverage (in the PR that introduces the behaviour)

- Unit tests for grouping, priority, the approach tree and skill selection.
- **Registry:** MCP advertises exactly its pre-plan tool set. For a shared
  tool, both surfaces return the same result for the same principal and data.
  `agent`-only readers are absent from MCP.
- Deterministic tests for the pack rules the tool layer can enforce: page and
  query aggregates are never joined into a page matrix, and an unavailable
  family is never rendered as zero or observed.
- Action identity and status across recompute, and attach-or-create
  idempotency under concurrent runs for the same target, on real PostgreSQL.
- Workspace isolation for Actions, chats, outputs, revisions, instructions and
  every registry read.
- The run budget stops at its cap, and the per-chat turn limit holds.
- `save_output` cannot write outside its chat's output. A turn cannot change
  status, declare or trigger syncs.
- A follow-up revises the existing output, and a user edit becomes the parent
  of the next agent revision.
- Outline-to-draft requires recorded approval.
- Credit settlement and recovery on the new usage kind, and user edits are not
  metered.
- UI behaviour and accessibility: the mode switch, new chat → output →
  edit → reopen restores the pane, export and copy, and Mark implemented.

## 14. Non-goals

- No autonomous publishing, CMS writes, outreach, prompt activation, or syncs,
  crawls or audits started by the agent.
- No web research, paid provider acquisition or other live external reads by
  the agent.
- No change to MCP's advertised tools beyond removing the retired
  `list_skills` catalog, and no skill download or distribution.
- No separate Saved work library; chats are the saved work.
- No second knowledge store or long-term agent memory. Agent instructions are
  explicit, user-edited project context.
- No embeddings: grouping, convergence and priority stay deterministic.
- No weekly board, WIP limit or model-created ranking.
- No change to marketing copy.
