# Content optimization — phase 1: angles, gaps and the list screen

Status: **planned, 2026-11-10**. Not started and not authorized for execution
until the owner assigns it. Architecture and owner decisions CO1–CO18 are in
[content optimization](content-optimization.md); the rules that phase 2's
editor applies are in the [content rules engine](content-rules-engine.md).

## Scope

Phase 1 delivers the evidence and the screen without the editor:

- Content angles computed from cited titles after audits and crawls.
- The `content_gaps` Opportunity family with stable angle identity.
- Actions split between the Actions screen and the new Content optimization
  screen by page kind.
- The Content optimization list, with each gap's evidence and the existing
  Agent handoffs.

**Out of scope.** These are phase 2 or later:

- Fetch on Optimize, the editor, `suggest_edits`, `page_suggestions` and the
  rules engine;
- Analyze a page (it opens the editor);
- the `owned_url_cited` check;
- reading cited pages, and any-URL optimization.

## Owner decisions

All decisions are recorded in [content optimization](content-optimization.md#owner-decisions-so-far-owner-in-chat-2026-11-10)
(CO1–CO18) and, for billing, [B73](../billing-decisions.md#content-optimization-2026-11-10).
Phase 1 depends on CO1–CO6, CO10, CO11, CO15, CO16 and B73.

## PRs (dependency-ordered, one at a time)

### PR 1 — Content angles

Owner: a new `frontend/services/api/src/content-gaps/` module, one
analytics kind.

- **Migration `0016_content_angles.sql`.** Insert-only tables:
  - `content_angle_runs`: source audit IDs, crawl ID, input keys, versions,
    outcome, limitations;
  - `content_angle_lineages`: stable ID, topic, fixed planned-page key;
  - `content_angles`, `content_angle_members` and
    `content_angle_owned_matches`.

  Each table has workspace and project keys like the 0007 tenancy keys,
  cascade indexes like 0015, and CHECK constraints on outcome values like 0014.
  Regenerate `db-schema.ts`.
- **Config** `config/content-optimization.ts`:
  - `window_days` (30), `max_source_age_days`;
  - `min_citations`, `min_domains`, `max_urls_per_topic`,
    `owned_candidates_per_angle`, `lineage_min_overlap`;
  - the content page kinds (CO15);
  - the citation `classification`/`source_class` values that count as
    competitor or editorial (CO3).
- **Loader.** It reads three things:
  - external citations from the window's dashboard-ready audits in the
    default market, one row per canonical URL with the title, or the URL slug
    when the title is empty;
  - owned citations, separately (not clustered);
  - the crawl's content pages, with their title, H1 and body for the lexical
    prefilter.
- **Model step.** One platform-gateway `structured` call per topic, at most
  `max_urls_per_topic` URLs. Output: angles with a label and member URL IDs,
  plus each angle's owned match (one or none) from the prefiltered
  candidates.
  - Validation rejects any member ID or owned page that wasn't in the input,
    and any URL placed in two angles. A rejected response fails the run; it is
    never repaired by guessing.
  - The call is recorded in `internal_costs` and subject to the B66 breaker.
- **Lineage.** Each angle inherits the lineage of the previous run's angle in
  the same topic with the highest member-URL Jaccard overlap at or above
  `lineage_min_overlap`. Otherwise it starts a new lineage.
- **Recompute keys.** Clustering is keyed on the set of (URL, title, topic) and
  its versions; owned match on the clustering plus crawl ID; aggregates on the
  window's audit IDs. A run is appended only when a key changed.
- **Triggers.** Enqueue the task, with its input keys as the idempotency key:
  - on the audit terminal path beside `source_page_inspection` in
    [audit projections](../../frontend/services/api/src/audits/projections.ts);
  - on crawl completion through
    [`announceEvidence`](../../frontend/services/api/src/opportunities/evidence-announcement.ts).

  A finished run announces evidence, so the Opportunity refresh follows.
- **Measure before tuning.** Report the empty-title share, citations per topic
  and topicless-prompt share on the local development database's audits in the
  PR. Thresholds start from those numbers.
- **Tests** (PostgreSQL, scripted model, `pnpm test:api`):
  - workspace isolation;
  - idempotent replay and concurrent claims;
  - a key change appends a run, and an unchanged key reuses the last;
  - window anchoring at the newest audit;
  - only competitor and editorial sources are clustered;
  - owned citations never clustered;
  - invalid model output fails the run;
  - a breaker refusal fails the run;
  - lineage inheritance and a new lineage below the overlap threshold.

### PR 2 — The `content_gaps` family and the Action surface

Owner: [Opportunities](../opportunities.md).

- **Family.** A `content_gaps` entry in
  [refresh families](../../frontend/services/api/src/opportunities/refresh-families.ts)
  whose identity is the latest **succeeded** run that is not older than
  `max_source_age_days`.
  - The pure detectors live in `analysis/opportunities/`:
    `content_gap_improve_page` (matched content page not cited for the
    angle's prompts in the window) and `content_gap_new_page`.
  - Hits key on the lineage. A new-page hit targets the lineage's fixed
    planned-page key; an improve-page hit targets the owned page.
  - Evidence schemas go in `@citeladder/contracts/opportunity-evidence`.
  - Rule entries go in `config/opportunity.ts` and `config/actions.ts`
    (approach, recommended skill `content_create`).
- **Retention.** Exercised by tests:
  - a failed run leaves the previous gaps;
  - a succeeded zero-gap run clears them;
  - a run past `max_source_age_days` clears them with the limitation
    "content-gap evidence is out of date";
  - no run at all gives the limitation "content gaps not computed yet".
- **Planned to owned.** When a lineage moves from new page to improve page,
  the planned-page Action keeps its identity and declaration and its evidence
  clears. The owned page's hit names the lineage and the planned-page Action
  it continues.
- **Surface.** Migration `0017_action_surface.sql` adds `actions.surface`
  (`content` | `actions`, CHECK constraint, indexed with the project like
  `effective_status`).
  - Action sync sets it in the refresh transaction: `content` for a planned
    page, or an owned page whose current analysis has a content page kind
    (CO15); `actions` otherwise. A page whose kind changes moves on the next
    refresh.
  - Agent-inserted Actions get the same derivation.
- **Reads.**
  - `GET …/projects/{project_id}/actions` accepts `surface`, and the status
    counts are per surface.
  - The Action detail returns `surface`.
  - MCP `read_actions` returns `surface` and accepts it as a filter.
- **Docs.** Update [opportunities.md](../opportunities.md) (the family,
  retention, lineage keys, surface) and [MCP](../mcp.md) if the tool contract
  changes.
- **Tests.** Refresh PostgreSQL tests (above), action-sync surface assignment
  and movement, the list filter and per-surface counts, workspace isolation of
  the new filter, and an Agent planned page converging with a gap's planned
  page on the same key.

### PR 3 — The Content optimization screen

Owner: the Agent workspace UI ([agents.md](../agents.md#workspace-and-handoffs)).

- **Navigation.** A sidebar entry "Content optimization" directly below
  Actions in [app routes](../../frontend/lib/navigation/app-routes.ts), at
  `/agent/content`. The Actions screen and its badge
  ([route prefetch](../../frontend/lib/navigation/route-prefetch.ts)) read
  `surface=actions`; the new screen and its badge read `surface=content`.
- **List.** One row per content Action: the page (or "New page: <angle>"), the
  gap type, the angle label, prompt count, citing sources (competitor and
  editorial counts) and status. It has the same status filter, cursor paging
  and URL state as Actions. Empty and not-computed-yet states are distinct.
- **Detail.** It reuses the Action detail route, so declaration stays as
  today. It shows:
  - why this matters, from evidence only: the angle, the cited titles with
    domain and classification, the prompts, and the citation counts in the
    window;
  - the page's Site Health findings on content pages (CO10).
- **Act.**
  - New-page gaps: **Write this page**, which starts the existing
    content-creation workflow through the handoff codec with the Opportunity
    reference.
  - Improve-page gaps: **Work on this**, which uses the existing Agent
    "Refresh an existing page" handoff until phase 2's editor replaces it.
- **Design and copy** follow [design](../design.md). Causality wording matches
  Actions. There are no scores (CO14).
- **Docs.** A new feature owner, `docs/content-optimization.md`, holds the
  shipped contract, plus a row in the [documentation index](../README.md).
  This plan then points to it.
- **Tests.** Component tests for both screens' surface filtering, the badges,
  the list states and the handoffs (`chat-screen`/`new-chat-screen` patterns).
  E2E runs in CI.

## Acceptance

- With an audit whose competitor and editorial citations form an angle, and
  no content page cited for it, a gap appears on Content optimization and
  never on Actions.
- A content page's Site Health findings appear on Content optimization, and
  the same page never appears on Actions. Issues is unchanged.
- A failed clustering run leaves the previous gaps in place. Evidence older
  than `max_source_age_days` reads as out of date, not as "no gaps".
- Reclustering that renames an angle keeps the same Action.
- Every new table and filter is workspace-isolated, with PostgreSQL coverage.

## Risks

- **Title quality.** Clustering on titles alone may be weak. PR 1's
  measurement decides the thresholds, and phase 2 reads cited pages.
- **Lineage drift.** A topic whose cited set churns heavily starts new
  lineages often, creating new Actions. `lineage_min_overlap` is tunable, and
  PR 1 reports how often lineages change between runs.
- **Page-kind accuracy.** A misclassified page lands on the wrong screen. The
  surface follows Site Health's classification and moves when it changes.
