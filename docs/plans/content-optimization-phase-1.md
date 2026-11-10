# Content optimization phase 1: implementation plan

Status: **in progress, 2026-11-10** (assigned by the owner 2026-11-10).

What and why are in [content optimization](content-optimization.md)
(decisions CO1–CO18, sections 1–2) and [B73](../billing-decisions.md#content-optimization-2026-11-10).
This plan covers only *how*: the files, the order and the tests.

**Delivers:**
- content angles computed from cited titles;
- the `content_gaps` Opportunity family;
- `actions.surface`;
- the Content optimization list screen.

**Not in phase 1:** the editor, fetch on Optimize, Analyze a page, the rules
engine and the `owned_url_cited` check.

Three sequential PRs; each merges before the next branches. Paths are relative
to `frontend/` unless noted.

## Commands

| Purpose | Command (from `frontend/`) |
|---|---|
| Apply migrations to the one local database | `pnpm --filter @citeladder/api migrate` |
| Regenerate DB types | `pnpm --filter @citeladder/api db:types` |
| API tests, changed files only | `pnpm test:api <test files>` |
| Frontend tests, changed files only | `pnpm test <test files>` |
| MCP tool reference (if a tool's schema changed) | `pnpm gen` |
| Route contract check | `pnpm --filter @citeladder/api check:routes` |
| Before opening each PR (contracts and persistence change) | `pnpm gate` once |

## PR 1: content angles

### 1.1 Migration `services/api/migrations/0016_content_angles.sql`

Five tables. Each has `id uuid pk`, `workspace_id`, `project_id`,
`created_at`, and composite foreign keys to the project like the 0007 tenancy
keys. Indexes and cascade follow 0015; CHECK constraints follow 0014. All are
insert-only, with no `updated_at`.

| Table | Columns beyond the common ones |
|---|---|
| `content_angle_runs` | `trigger_kind text`, `trigger_id uuid`, `market_country`, `market_language`, `window_start timestamptz`, `window_end timestamptz`, `audit_ids uuid[]`, `crawl_id uuid null` (→ `site_crawls`, SET NULL), `cluster_key text`, `match_key text`, `aggregate_key text`, `model_provider`, `model`, `methodology_version`, `formula_version`, `outcome text` CHECK in (`succeeded`, `failed`), `outcome_reason text null`, `limitations jsonb`, `usage jsonb null` |
| `content_angle_lineages` | `topic_id uuid null` (→ `topics`, SET NULL), `planned_page_key text null` (set once, never updated), `first_run_id uuid` |
| `content_angles` | `run_id` (→ runs, CASCADE), `lineage_id` (→ lineages), `topic_id`, `label text`, `citation_count int`, `domain_count int`, `competitor_count int`, `prompt_ids uuid[]`, `engines text[]` |
| `content_angle_members` | `angle_id` (→ angles, CASCADE), `canonical_url text`, `url_hash text`, `title text`, `domain text`, `classification text`, `matched_competitor text null`, `source_class text null`, `citation_count int`, `citation_ids uuid[]` |
| `content_angle_owned_matches` | `angle_id` (→ angles, CASCADE), `site_url_id uuid null` (→ `site_urls`, SET NULL), `method text` CHECK in (`model_pick`, `none`), `owned_cited bool`, `owned_citation_ids uuid[]` |

Indexes:
- `(workspace_id, project_id, created_at desc)` on runs;
- `(workspace_id, project_id, outcome, window_end desc)` for selecting the
  latest succeeded run;
- `(lineage_id)` on angles.

Then apply the migration and regenerate types (`migrate`, then `db:types`).

### 1.2 Config

- **New file `services/api/src/config/content-optimization.ts`**, exported
  through `policy` in `config.ts`:
  ```ts
  export const contentOptimization = {
    methodology_version: 'content-angles-1',
    formula_version: 'content-gaps-1',
    window_days: 30,
    max_source_age_days: 45,
    min_citations: 3,            // placeholder until 1.7 measures real audits
    min_domains: 2,
    max_urls_per_topic: 60,
    owned_candidates_per_angle: 8,
    lineage_min_overlap: 0.5,
    content_page_kinds: ['article', 'guide', 'how_to', 'listicle',
      'comparison', 'alternative', 'case_study_review'],          // CO15
    gap_sources: { classifications: [...], source_classes: [...] }, // CO3
    model_max_attempts: 2,
  } as const;
  ```
  Fill `gap_sources` from the citation `classification` and `source_class`
  vocabularies already in use (`services/api/src/visibility/evidence.ts` and
  the source taxonomy it reads). Competitor plus editorial or publisher values
  only.
- **`services/api/src/config/ai-credits.json`**: add the feature
  `"content_angles": "included"` (B73).
- **`services/api/src/config/model-gateway.json`**: add
  `feature_output_tokens.content_angles: 8000`.

### 1.3 Module `services/api/src/content-gaps/`

| File | Contents |
|---|---|
| `load.ts` | `loadAngleInputs(db, scope, anchor)`. Returns `{ audits, external: CitedUrl[], owned: OwnedCitation[], contentPages: CandidatePage[], limitations }`. `anchor` is the newest dashboard-ready audit in the default market (reuse `resolveAudit` from `opportunities/sources.ts`); the window is `anchor.completed_at - window_days`. `external` has one row per canonical URL from citations of the window's audits whose classification or source class is in `gap_sources`, grouped by prompt topic; an empty title falls back to the URL path slug. `owned` is citations with `is_owned`. `contentPages` is the current analyses of the latest crawl whose `page_kind` is in `content_page_kinds`, with title, H1 outline and the first 2 000 chars of `primary_content_text` |
| `keys.ts` | `clusterKey`, `matchKey`, `aggregateKey`: sha256 over sorted inputs plus versions (the three keys in section 1 of the architecture) |
| `prefilter.ts` | `ownedCandidates(angleTerms, contentPages, k)`. Lexical coverage with `lexicalTokens` from `analysis/lexical.ts`, the same scoring as `source-pages/differentiation.ts` |
| `model.ts` | Zod schema `AngleResponse = { angles: { label: string (≤ 80), member_ids: string[], owned_page_id: string \| null }[] }`, plus prompt builders (system text fixed in this file, versioned by `methodology_version`). The call goes through `callStructured` from `perception/model-call.ts` with a gateway wrapped by `meterFor(db, workspaceId).gateway(raw, 'content_angles')` |
| `validate.ts` | `validateAngles(response, input)` returns `Angle[]` or `{ reason }`. It rejects a member ID or owned page that wasn't in the input, a URL in two angles, an empty angle, or a label over the limit. Nothing is repaired |
| `lineage.ts` | `assignLineages(previousAngles, newAngles, minOverlap)`: per topic, greedy highest Jaccard first, one-to-one, ties broken by lineage ID text order. Pure |
| `aggregate.ts` | `aggregateAngle(angle, external, owned)` computes counts, prompts, engines and `owned_cited` (the matched page's URL is cited for any of the angle's prompts). Pure |
| `refresh.ts` | `refreshContentAngles(db, scope, task)`, the task body: resolve inputs; compute the keys; if the latest run has the same three keys, end. Otherwise reuse the clustering when `cluster_key` is unchanged, else call the model per topic; then persist the run, lineages, angles, members and matches in one transaction (no transaction is held across the model call); then `enqueueOpportunityRefresh(trx, { triggerKind: 'content_angles', triggerId: run.id })`. A model or validation failure, or a `platform_spend_paused` refusal, persists a `failed` run with its reason and enqueues nothing |
| `analytics-kinds.ts` | `export const contentGapKinds = { content_angle_refresh: { run, compensate } } as const satisfies AnalyticsKinds;` |
| `enqueue.ts` | `enqueueContentAngles(db, scope, trigger)` calls `enqueueTask` with kind `content_angle_refresh`, `keyParts: [projectId, trigger.kind, trigger.id]`, and `maxAttempts` from `policy.analytics.worker_settings` |

### 1.4 Wiring

- `services/api/src/workers/analytics-kinds.ts`: spread `...contentGapKinds`.
- `services/api/src/audits/projections.ts`: next to
  `enqueueSourcePageInspection`, call `enqueueContentAngles` for completed and
  partially completed audits, wrapped the same way (an enqueue failure is
  logged and never fails finalize).
- `services/api/src/site-health/terminal-handoff.ts`: after the existing
  `announceEvidence`, call `enqueueContentAngles` with the crawl as the
  trigger.

### 1.5 Tests: `services/api/test/content-angles.test.ts`

Real PostgreSQL with a scripted gateway; reuse the fixture builders in
`test/opportunity-fixtures.ts`. Cases:

1. Two workspaces with identical data: each run reads only its own citations
   and pages.
2. Only `gap_sources` URLs are clustered; owned citations never appear as
   members.
3. The window is anchored at the newest audit: an audit 31 days older is
   excluded.
4. Same inputs twice: one run. A changed title: new `cluster_key` and a model
   call. Only a new crawl: the clustering is reused and the match recomputed
   without a clustering call.
5. Model output naming an unknown URL ID: a `failed` run, no angles, no
   refresh enqueued.
6. The gateway throws `platform_spend_paused`: a `failed` run with that reason.
7. Lineage: a relabelled angle with 60% member overlap keeps its lineage;
   below `lineage_min_overlap` it starts a new one.
8. The planned-page key on a lineage is never rewritten by a later run.
9. A replayed task (same idempotency key) and two concurrent claims produce
   one run.

Add pure unit tests for `lineage.ts`, `aggregate.ts` and `validate.ts` in
`services/api/test/content-angles-pure.test.ts`.

### 1.6 Docs (in the same PR)

- [opportunities.md](../opportunities.md) "Evidence to action": one paragraph
  naming the angle task as an evidence source and its trigger.
- [state machines](../state-machines.md): the `content_angle_runs` outcome
  (insert-only, terminal at insert).

### 1.7 Measurement for thresholds

Run the task against the local development database's existing audits. In the
PR description, report:
- the empty-title share;
- URLs per topic;
- the topicless-prompt share;
- the number of angles at the placeholder thresholds.

Then set `min_citations` and `min_domains` from those numbers and say why.

## PR 2: the `content_gaps` family and `actions.surface`

### 2.1 Migration `0017_action_surface.sql`

- `alter table actions add column surface text not null default 'actions'`,
  with a CHECK in (`actions`, `content`).
- An index on `(workspace_id, project_id, surface, effective_status)`.

Then run `migrate` and `db:types`. Existing rows are recomputed by the next
refresh; there is no backfill (pre-launch).

### 2.2 Contracts: `packages/contracts/src/opportunity-evidence.ts`

Two evidence schemas:

- `contentGapImprovePageEvidence`: `run_id`, `lineage_id`, `angle_label`,
  `topic_id`, `prompt_ids`, `engines`, `citation_count`, `domain_count`,
  `competitor_count`, `members` (≤ 20, sorted by citation count: url, title,
  domain, classification, matched competitor, citation count), `site_url_id`,
  `url`, `match_method`, `window`, versions and `limitations`.
- `contentGapNewPageEvidence`: the same, without the page fields, plus
  `planned_page_key`.

Also add `continues_action_id?` (the planned-page Action an improve-page hit
continues). Export both from the package index.

### 2.3 Detection

| File | Change |
|---|---|
| `services/api/src/analysis/opportunities/content-gaps.ts` (new) | Pure `detectContentGaps(run, angles, config): DetectorHit[]`. Thresholds are `min_citations` and `min_domains`; `owned_cited` raises nothing. An improve-page hit's target is `{ kind: 'site_page', url }`; a new-page hit's target is the planned-page target built from the lineage's fixed `planned_page_key` (extend `TargetRef` in `analysis/opportunities/targets.ts` with a planned page given by key, so no reader re-slugs a label) |
| `services/api/src/opportunities/content-gap-hits.ts` (new) | `contentGapSource(db, scope, at)` returns the latest `succeeded` run whose `window_end >= at - max_source_age_days`, or null, plus the limitation to record. `contentGapHits(db, scope, source)` loads that run's angles and matches and calls the detector. It fills `continues_action_id` by finding an Action on the lineage's `planned_page_key` |
| `services/api/src/opportunities/refresh-families.ts` | Add `contentGaps: Family` with identity `{ content_angle_run_id }`, append it to `FAMILIES`, and add `contentGaps` to `Sources` and `resolveSources` |
| `services/api/src/opportunities/refresh-compute.ts` | `SourceIdentity` gains `content_angle_run_id: string \| null`. It is stored in snapshot coverage JSON, so no migration |
| `services/api/src/config/opportunity.ts` | Rule entries `content_gap_improve_page` and `content_gap_new_page`, both enabled with `check_kind: null` until phase 3 adds `owned_url_cited`. Version constants are not bumped (they stay at 1 pre-launch) |
| `services/api/src/config/actions.ts` | Family mapping `content_gap_*: 'content_optimization'`. The approach tree gets `improve_existing` (`content_gap_improve_page`, skill `content_create`, `target_kinds: ['site_page']`) and `create_new` (`content_gap_new_page`, `target_kinds: ['planned_page']`), with donts: "Do not claim the page will be cited." and "Do not invent statistics, quotes or sources." |
| `services/api/src/opportunities/enqueue.ts` | Accept trigger kind `content_angles` (it is a free string today; add it to any allow-list if one exists) |

### 2.4 Surface

- **`services/api/src/opportunities/action-sync.ts`**: compute
  `surface(target, members, crawl)` while syncing. A `planned_page` gets
  `content` only when one of its members is `content_gap_new_page`; a planned
  page raised only by the keyword-gap rule or planned by the Agent has no page
  kind and stays `actions`. A `site_page` gets `content` when its current
  analysis in the snapshot's crawl has a `page_kind` in `content_page_kinds`.
  Everything else gets `actions`.
  Write it with the members in the same statement, and restamp it on every
  refresh (a kind change moves the Action).
- **`services/api/src/opportunities/actions.ts`**:
  - `attachOrCreateAction`: Agent-origin rows use the same derivation.
  - `listActions`: accepts `surface`, and status counts filter by it.
  - `getAction`: returns `surface`.
- **`services/api/src/routes/actions.ts`**: add the query param
  `surface: { scalar: { kind: 'str' } }`, validated against the two values
  (400 otherwise). Add `surface` to `actionsPageSchema` items and
  `actionDetailSchema` in `action-contracts.ts`.
- **`services/api/src/mcp/tools.ts`** `read_actions`: add an optional
  `surface` filter and return the field. Run `pnpm gen` for the tool
  reference.

### 2.5 Tests

- **`services/api/test/content-gap-actions.test.ts`** (new, PostgreSQL),
  seeding angle runs directly:
  1. An improve-page hit on a content page: its Action has
     `surface = 'content'`.
  2. The same rule on a page whose kind becomes `pricing`: the next refresh
     moves it to `actions`.
  3. Failed run after a succeeded one: the gaps stay.
  4. A succeeded zero-angle run clears them.
  5. A run older than `max_source_age_days`: cleared, with the limitation
     text.
  6. No run: no hits, with the limitation "content gaps not computed yet".
  7. A relabelled lineage keeps the same Action ID.
  8. An Agent planned page created via `attachOrCreateAction` with the same
     slug converges on one Action, which moves to `content` once the gap
     member joins it. An Agent planned page and a keyword-gap planned page
     with no content-gap member stay on `actions`.
  9. Planned to owned: the planned Action keeps its ID and declaration, its
     evidence clears, and the owned hit names `continues_action_id`.
  10. Workspace isolation of the `surface` filter and counts.
- **`services/api/test/actions.test.ts`**: the list `surface` filter, a bad
  value returns 400, and the counts per surface.
- **`services/api/test/opportunity-refresh.test.ts`**: the source-identity
  skip includes `content_angle_run_id`.

### 2.6 Docs

- [opportunities.md](../opportunities.md): the family paragraph (source
  selection, retention, lineage keys), and `surface` under Actions with the
  list filter.
- [MCP](../mcp.md): the `read_actions` filter.
- [state machines](../state-machines.md): no new lifecycle (surface is
  derived).

## PR 3: the Content optimization screen

### 3.1 API client and navigation

- **`lib/api/actions.ts`**: `ActionsRequest` gains
  `surface?: 'actions' | 'content'`, passed through to the query. The query
  key includes it.
- **`lib/navigation/app-routes.ts`**:
  - add `screens.contentOptimization` (lazy, like `screens.actions`);
  - add the pages `/agent/content` and `/agent/content/:actionId`, the latter
    with collection `/agent/content`, reusing `screens.action`;
  - add the nav item "Content optimization" right after Actions, with the
    same placements and `badge: 'open-content'`.
- **`lib/navigation/route-prefetch.ts`**: the Actions badge reads
  `surface=actions`, and a new `open-content` badge reads `surface=content`.
- **`components/layout/nav-link.tsx`**: render both badges. Extend the badge
  type in `app-routes.ts`.

### 3.2 Screens

| File | Change |
|---|---|
| `components/agent/actions-screen.tsx` | Always request `surface: 'actions'` |
| `components/agent/content-optimization-screen.tsx` (new) | The list for `surface: 'content'`. Columns: page (or "New page"), angle, prompts, cited sources (competitor and editorial counts from evidence), status. Status filter, cursor paging and URL state are shared with Actions (extract the list hooks from `actions-screen.tsx` if they aren't already reusable). Three empty states: none yet, not computed yet (from the snapshot limitation), and no gaps |
| `components/agent/action-detail-screen.tsx` | For `content_gap_*` members, a "Why this matters" block rendered from evidence only: angle, cited titles with domain and classification, prompts, counts and window; no scores. A content page's Site Health members render as today |
| Handoffs | New-page gap: a **Write this page** button using `lib/agent/handoff.ts` with the Opportunity reference and the `article` workflow. Improve-page gap: **Work on this** with the `refresh_page` workflow and the page URL |

### 3.3 Tests

- `components/agent/content-optimization-screen.test.tsx` (new):
  - it requests `surface=content`;
  - rows render from evidence;
  - the three empty states are distinct;
  - the handoffs carry the expected workflow and references.
- `components/agent/actions-screen.test.tsx`: it requests `surface=actions`.
- `components/layout/nav-link.test.tsx`: both badges render their counts.
- E2E: add a case to `e2e/action-loop.spec.ts` only if the seeded fixtures
  can produce a content gap cheaply; otherwise CI's existing E2E covers the
  Actions path.

### 3.4 Docs

- **New feature owner `docs/content-optimization.md`**: what ships (evidence,
  family, surface, screen) and what does not yet. Add its row to the
  [documentation index](../README.md).
- **[agents.md](../agents.md#workspace-and-handoffs)**: the new screen under
  Agent mode, and its handoffs.
- **This plan**: change its status to complete, and point to the owner doc.
  Remove it from [plan status](ACTIVE.md) when phase 1 is done.

## Done when

- [ ] PR 1: an audit with competitor and editorial citations produces a
  succeeded run with angles. A failed model call produces a failed run and
  leaves the earlier run selected. The measurements are in the PR.
- [ ] PR 2: content-page and planned-page Actions carry `surface = 'content'`,
  and every retention case in 2.5 passes on real PostgreSQL.
- [ ] PR 3: the Content optimization screen and badge show only content
  Actions; Actions shows none of them; Issues is unchanged.
- [ ] Each PR: `pnpm gate` passes once locally, CI is green, and its owner docs
  are updated in the same PR.
