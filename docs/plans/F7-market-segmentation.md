# F7 — Market (location and language) segmentation

Competitive tracker row F7, one PR.
Owner documents: [Prompts and Visibility](../visibility-prompt.md),
[Onboarding](../onboarding.md) (market scope),
[Billing and entitlements](../billing-entitlements.md),
`src/config/providers.json`, `src/config/dataforseo.json`.

Complete for implementation; decisions settled. Follow
`CLAUDE.md`, the test skill and the TypeScript skill. Verified at 2aff425e5.
Greenfield: no backfill, no existing-data handling.

## Settled decisions (owner, 2026-10-10)

| ID | Topic | Decision |
|---|---|---|
| D7.1 | Market limit per plan | New `market_slots` occupancy capability, workspace-wide, counting **additional** markets (the project default is free). Trial and Starter 0, Growth 3, Scale 10. No add-on. |
| D7.2 | DataForSEO locations beyond the 13 | The 32 countries the setup picker offers (`lib/setup/markets.ts`), each enabled per surface only where the reviewed DataForSEO locations file confirms support; the pickers use the same list. The PR seeds the file with the 13 verified codes only; the rest become supported when the owner runs the CLI. DataForSEO is never called live by the implementer. |
| D7.3 | Audit shape | One audit per market, launched together and grouped by launch in run history. |
| D7.4 | Granularity | Markets are country plus language only. No region, city or timezone. |

Rationale for D7.3: metric snapshots, comparison keys, run sets, trends and
exports are all per-audit. One audit per market reuses that machinery as is
and keeps markets from mixing in any projection. The tracker's
"prompts × engines × markets" survives as the estimate and admission total
across the launched audits.

## Current state (verified)

- `projects` (baseline :1879) has `country_code varchar(8)`,
  `language_code varchar(16)`, `primary_market varchar(8)`,
  `serp_location_code int default 0`, `serp_language_code`, `serp_device`.
  `projects/service.ts` `searchContext` (~:166) maps country to a location
  code through `dataforseo.json` `constants.location_codes`. An unmapped
  country gives `0`.
- `dataforseo.json` supports 13 location codes (2036 AU, 2124 CA, 2250 FR,
  2276 DE, 2356 IN, 2372 IE, 2528 NL, 2554 NZ, 2702 SG, 2710 ZA, 2784 AE,
  2826 GB, 2840 US) and 7 languages (de, en, es, fr, it, nl, pt).
  `search-surfaces/dataforseo.ts` `searchPayload` (~:79) throws
  `invalid_search_context` outside them.
- **Mismatch:** the setup and project edit pickers (`lib/setup/markets.ts`)
  offer 32 countries and 23 languages. A project in ES, JP, BR and others
  gets `serp_location_code = 0`. Admission then rejects every search-surface
  engine for it (`audits/freeze.ts` ~:157 validates each prompt).
  `primary_market` is separate: GLOBAL plus US, GB, CA, AU, IN
  (`discovery.json` `market_context_terms`). It steers discovery only.
- **Scraper contexts are not US/English** (the tracker was wrong here).
  `audits/creation.ts` `frozenSearch` (~:215) freezes the project's
  `serp_location_code`, `serp_language_code` and `serp_device` into each
  task for ChatGPT Search, Gemini (consumer) and AI Overview. The
  `search_context` on the `providers.json` scraper routes (US/en) is unused
  config.
- **Model APIs:** `answer-engines/execute.ts` `answerPayload` already sends
  `user_location {type:'approximate', country}` from
  `request.country_code` to OpenAI and Anthropic web search. Google gets no
  location (`google_search` tool only). Country also reaches every model
  through the `controlled_localized` system instruction (`freeze.ts` ~:207).
- Frozen audit `configuration` holds `country_code` and `language_code`
  (`freeze.ts` ~:270). `analysis/comparison.ts` `frozenComparisonKey` keys
  on both, but not on the search location code.
- Schedules (`audit_schedules`, baseline :473) store `engines jsonb`, with no
  market. Audit inputs (`audits/inputs.ts`) take `engines`, prompts,
  repetitions and mode. `audits/estimate.ts` prices one context.
- Plans (`config/billing-authoring.ts`): Starter 1 project / 10 prompts,
  Growth 3 / 30, Scale 10 / 60. Bundles are built in
  `billing/catalog-authoring.ts` `launchCatalog` (~:289). Occupancy
  capabilities live in `entitlements.json` and are gated by
  `entitlements/occupancy.ts`.
- Six engines are shipped (`providers.json` `catalog`): `chatgpt_search`,
  `gemini_consumer`, `google_ai_overview` (DataForSEO, BYOK only per
  `freeze.ts` ~:121) and `chatgpt`, `claude`, `gemini` (model APIs).

## Design

### 1. Markets

- Table `project_markets (id, workspace_id, project_id, country_code
  varchar(2), language_code varchar(16), label varchar(64), created_at)`,
  unique `(project_id, country_code, language_code)`, workspace FK as for
  other project children. It holds **additional** markets only.
- The **default market is not a row.** It is read straight from the
  project's `country_code` / `language_code` / `serp_*` columns. Everywhere a
  market is referenced, `market_id NULL` means the project default.
- Adding a market that equals the default, or a duplicate, is rejected
  (409 `market_exists`). Deleting a market used by a schedule removes it from
  that schedule in the same transaction. Past audits keep their frozen
  market; `audits.market_id` has no foreign key, so a deleted market's runs
  stay in run history and never fall into the default market's reads.
- Commands: `GET/POST /projects/{id}/markets`,
  `DELETE /projects/{id}/markets/{market_id}`. They are workspace-authorized
  and declared in `route-ownership.ts`. `POST` takes occupancy under
  `market_slots` (D7.1).

### 2. Capability matrix and allowed locations (D7.2)

- The reviewed locations file `src/config/dataforseo-locations.json`:
  `countries: {CC: {location_code, google_ai_overview?: [lang],
  chatgpt_search?: [lang], gemini_consumer?: [lang]}}`, validated at load
  against the contracts market list (`search-surfaces/locations.ts`). An
  absent country or surface is unsupported. `searchPayload` and Search
  Intelligence validate against it; `dataforseo.json` loses
  `location_codes`, `supported_location_codes` and `language_codes`, and the
  project `serp_*` columns are derived from it.
- The PR seeds the file with the 13 verified locations and the 7 languages
  accepted before F7, for all three surfaces. The other 19 picker countries
  become supported when the owner runs the CLI.
- `providers.json` `routes.<engine>.market_support`: `dataforseo_location`
  (chatgpt_search, gemini_consumer, google_ai_overview),
  `web_search_user_location` (chatgpt, claude), `none` (gemini). The unused
  scraper `search_context` is deleted.
- Operator CLI `pnpm dataforseo:locations` (`src/cli/dataforseo-locations.ts`,
  builder `search-surfaces/locations-file.ts`). It fetches each surface's
  locations and languages lists (paths in `dataforseo.json`
  `constants.locations_paths`) with `DATAFORSEO_API_LOGIN` /
  `DATAFORSEO_API_PASSWORD`, keeps Country rows for the market countries,
  intersects each surface's languages with the market languages, refuses a
  country whose surfaces disagree on its location code, and writes the file
  sorted and compact (`--dry-run` prints it). A human reviews the diff.
  Never run at request time or in CI.
- The picker list moves to `@citeladder/contracts/markets`
  (`MARKET_COUNTRIES`, `MARKET_LANGUAGES`, `marketLabel`); the setup, project
  edit and market pickers and the API's market validation share it.

### 3. Admission, estimate, schedules (D7.3)

- `audits/inputs.ts`: `market_ids: (uuid | null)[]`, default `[null]`,
  1..N, deduplicated. The same field goes on `estimateInput`,
  `auditLaunchInput` (public API) and the schedule inputs.
- Admission validates every (engine, market) pair before any spend.
  - A `dataforseo_location` engine whose surface does not list the
    country/language rejects the request (422 `market_unsupported`). This
    keeps today's behaviour for the default market.
  - A `none` engine (Gemini API) on a non-default market is dropped from that
    market's audit and recorded in its configuration as
    `not_applicable_engines: ['gemini']`. It is reported as not applicable,
    never as failed and never billed.
- One audit per market, created in one transaction with a shared
  `launch_id uuid` column on `audits`. A launch counts once against the
  active-audit limit and the manual-run allowance. Each audit freezes
  `market: {id|null, country_code, language_code}` and puts the market's
  country and language in the existing `configuration` fields, so the model
  APIs get them through the existing `user_location` and localized
  instruction paths and the search tasks freeze the market's location.
- `frozenComparisonKey` already keys on the frozen `country_code` and
  `language_code`, and two markets of one project never share both, so it is
  unchanged: different markets never compare, one market compares across
  runs. Scheduled occurrence idempotency is unique per
  `(schedule_id, scheduled_for, market_id)`.
- The estimate is the sum over markets (prompts × applicable engines ×
  repetitions per market). Funded credit reservation is per audit.
- `audit_schedules.market_ids jsonb not null default '[null]'`. A schedule
  tick creates the same per-market launch. An empty list after a market
  deletion falls back to `[null]`.

### 4. Reads

- `market` query parameter (a market UUID; omitted means the default) on
  every visibility read. It scopes Latest, ranges, trends and baselines; a
  named run implies its own market, and a run set spanning markets is a 422.
  The Overview/command center, its history and Action outcome checks follow
  the default market.
- Visibility gets a market switcher next to the engine filter, plus a
  **By market** table. It shows mention rate, share of voice, net sentiment
  and change vs previous per market from each market's latest comparable
  completed run. A market with no completed run shows "No run yet", not 0.
- The run list shows a Market column once a project has measured another
  market and marks later rows of one launch "Same launch". The run detail
  shows the measurement market and "Not available in this market" for
  not-applicable engines.
- Public API reads share the routes, so they gain `market`; the launch
  returns the launched audits as a list. MCP: the project context lists
  `markets {id, label, country_code, language_code, is_default}` (default
  `id: null`), and the visibility tools that resolve Latest take
  `market_id`; the overview tool description says never to pool markets.

### 5. UI

- Project edit panel → **Additional markets**: list, add (country and
  language pickers), remove; plan-limit refusals show as mutation notices.
- Run launch dialog and schedule editor: market multi-select (default
  checked) with the estimate updating. Engines not applicable in a selected
  market are labeled, not hidden.

## Commit slices

1. Config: `dataforseo.json` markets block, `providers.json`
   `market_support`, entitlements `market_slots`, plan grants, operator CLI.
   Tests for `searchPayload` validation per surface.
2. Schema and the markets owner (`src/projects/markets.ts`), routes,
   contracts, occupancy. Real PostgreSQL tests.
3. Admission, estimate, launch grouping, comparison key, schedules.
4. Reads, MCP and public API filter, By market projection.
5. App UI: settings section, launch/schedule selector, visibility switcher
   and table, run list grouping. Docs.

## Affected surfaces checklist

- **Backend:** new `projects/markets.ts`, `search-surfaces/{locations,locations-file}.ts`,
  `cli/dataforseo-locations.ts`, `visibility/markets.ts`;
  `projects/service.ts`, `audits/{inputs,freeze,creation,admission,estimate,schedules,schedule-inputs,reads}.ts`,
  `search-surfaces/dataforseo.ts`, `search-intelligence/reviews.ts`,
  `visibility/{selection,dashboard,prompts,runs,surface,evidence}.ts`,
  `projects/command-center.ts`, `opportunities/declarations.ts`,
  `workers/audit-scheduler.ts`, `mcp/{tools,context,evidence-analytics}.ts`,
  `billing/catalog-authoring.ts`, `entitlements/occupancy.ts`,
  `config/{dataforseo,dataforseo-locations,providers,entitlements,audits}.json`,
  `config/billing-authoring.ts`, `config.ts`.
- **Schema (0001_baseline.sql):** `project_markets`; `audits.market_id`,
  `audits.launch_id`; `audit_schedules.market_ids`.
- **Contracts:** project markets, audit/estimate/schedule inputs,
  visibility filter, route ownership, OpenAPI.
- **MCP/Agent:** visibility tools' `market_id` argument; project context
  lists markets. Agent skills are unchanged (the tool descriptions carry the
  rule).
- **App UI:** `components/projects/{project-edit-panel,project-markets}.tsx`,
  `lib/setup/markets.ts` removed, launch/schedule dialogs, visibility
  toolbar, `visibility-by-market.tsx`, runs table, run detail.
- **Docs:** `docs/visibility-prompt.md` (markets, comparison identity,
  not-applicable engines), `docs/billing-entitlements.md` (`market_slots`),
  `docs/public-api.md`, `docs/mcp.md`; docs site `visibility.md` and
  `changelog.md`; tracker status and log. Marketing copy untouched.

## Tests

- The locations file builder keeps only supported market countries and
  languages per surface, refuses disagreeing location codes and failed list
  responses; search contexts derive from the reviewed file.
- Admission rejects an unsupported (engine, market) pair before any
  reservation or task row. Gemini API on a non-default market produces no
  task and records `not_applicable_engines`.
- Two markets create two audits with one `launch_id`. Each freezes its
  market, and the Claude/OpenAI request payload carries the market country.
- Estimate equals the per-market sum.
- `market_slots` is enforced; adding the default or a duplicate is rejected.
- Visibility `market` filter returns only that market. By market
  distinguishes "no run yet" from zero.
- Schedule ticks launch every scheduled market. Deleting a market prunes
  schedules.
- Workspace isolation on markets and the market filter.

## Validation

Focused audit, projects and visibility tests while iterating;
`./scripts/check.ps1` once at the end (contracts, schema and entitlements
change).

## Owner-run steps

1. Before merge: from `frontend/services/api`, run
   `pnpm dataforseo:locations` with `DATAFORSEO_API_LOGIN` and
   `DATAFORSEO_API_PASSWORD` set (`--dry-run` to print first). Review the
   regenerated `src/config/dataforseo-locations.json` and commit it to the PR
   (the endpoints are free list calls).
2. Optionally run one two-market audit on a test project with BYOK
   credentials and check that each engine's request carries the market.

## Done when

A project can add markets within its plan limit. It can launch or schedule
runs for several markets in one action and read Visibility per market and
in a By market table. Unsupported pairs are rejected before spend and
not-applicable engines are labeled. Tracker row F7 is `done`.
