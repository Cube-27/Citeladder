# F5 — Ads in AI answers (ChatGPT)

Competitive tracker row F5, one PR. No dependency on other features.
Owner document: [Prompts and Visibility](../visibility-prompt.md).

Complete for implementation; decisions settled. Follow `CLAUDE.md`, the test
skill and the TypeScript skill. Verified at 8a0647035.

## Settled decisions

| Topic | Decision |
|---|---|
| Placement | New Visibility tab **Ads** (`?tab=ads`) after Sources (after Perception if F3 is merged). |
| Engines | Only `chatgpt_search` is applicable. Every other engine shows `not_applicable` with a visible label, never 0. |
| Existing metrics | Ads never enter citations, sources, mention rate, share of voice or scoring. Enforced by a test. |
| Zero vs unknown | A `chatgpt_search` answer parsed with the ads parser version and no ad items = observed zero. |
| Greenfield | No backfill CLI; ads apply from the first audit after this ships. |
| Landing URLs | Store raw and query-stripped canonical; UI shows only the canonical. No ad images hotlinked (store `image_url`, never render it). |
| Ad beside organic | Ship it, counts only, no causal wording. |
| Public API | F4a may not exist yet. Ship the browser route + MCP tool; mark the route `exposure: 'both'` if F4a has merged, otherwise F4a picks it up from its endpoint table. Do not build any F4 scaffolding here. |
| Marketing | No marketing-site claim exists or is added. Only the MCP tool list scene updates. |

## Current state (verified)

- `src/search-surfaces/parsing.ts`: `parseScraper` (:263-343) reads
  `task.result[0]`; `scraperSources` (:256-262) walks only `sources` arrays
  through `items`. **Ad URLs do not leak into citations today**; ad
  `snippet` is not read into the answer. No test pins this.
- `parseScraper` returns `provider_metadata.raw_response = envelope`
  (:336), persisted in `raw_response_artifacts.provider_metadata`.
- Task GET Advanced already used: `src/search-surfaces/dataforseo.ts`
  `client.retrieve` (~:205), `providerPath` :65-77; product `chat_gpt`
  (`src/config/dataforseo.json:423`). Ads arrive as items
  `type: "chat_gpt_ad"` with `rank_group, rank_absolute, title, snippet, url,
  domain, image_url, advertiser{name,url,favicon_url}`.
- No scraper parser version exists. `analyzer_version` lives in
  `src/config/audits.json:63`.
- Persistence: `audit-worker.ts:358` → `persistExecutionSuccess`
  (`src/audits/result-persistence.ts:~150-230`) → derive `analyzeExecution`
  (`src/analysis/execution.ts`) in one transaction.
  `surface-persistence.ts` is Google AI Overview only.
- Ownership inputs: `owned_domains`, `competitors` frozen by
  `src/audits/freeze.ts:172-262`; **competitor `id` is not frozen** (select
  ~:194). `scoringConfig` (`src/analysis/scoring.ts:72-80`),
  `domainMatches` (`src/analysis/domains.ts`), registrable domain via
  `tldts` `getDomain` (used in parsing.ts:20).
- Visibility routes `src/routes/visibility.ts` (template: `/surface-rates`
  ~:397 with `authorizeRunSet` in `src/visibility/selection.ts`), family
  `visibility`; tabs `frontend/lib/visibility/dashboard.ts:38`; panels
  `components/visibility/visibility-dashboard.tsx` ~:159-187; hooks
  `lib/visibility/use-visibility-dashboard.ts` (`surfaceRates` ~:366 as
  template); client `lib/api/visibility.ts`; keys `lib/api/query-keys/runs.ts`.
- MCP catalogue `src/mcp/tools.ts` (pattern `read_visibility_sources` :200,
  impl `src/mcp/evidence-analytics.ts`), shared with the in-app Agent.
  Hand-written lists: `apps/docs/src/content/mcp/tools.md:17-26`,
  `docs/mcp.md:149`, `components/marketing/scenes/views-act.tsx:182-183`.

## Design

### Config

`src/config/audits.json`: `ads_versions: { parser_version: "chatgpt-ads-1",
metrics_version: "ads-metrics-1" }` (typed in the audits config loader).

### Parsing (`parsing.ts`)

- `parseAds(envelope) → AdItem[]`: collect items with `type ===
  'chat_gpt_ad'` anywhere in `result[0].items` (recursive like the source
  walker). Validate with zod; skip malformed items (count them).
- `scraperSources`: explicit skip of `chat_gpt_ad` nodes (defensive).

### Freeze

Add competitor `id` to the freeze select so ad ownership can store
`competitor_id`.

### Persistence (inside the derive step, same transaction)

New `src/analysis/ads.ts` `persistAds(trx, context)` called from
`analyzeExecution` only for `chatgpt_search` artifacts; reads
`artifact.provider_metadata.raw_response`. Also write a per-task marker so
"parsed with ads version, zero ads" is distinguishable: add
`ads_parser_version varchar(32) NULL` on `response_analyses` (set for
chatgpt_search analyses, null otherwise).

```
answer_ad_observations  id, workspace_id, project_id, audit_id, task_id, artifact_id,
                        parser_version, rank_absolute, rank_group,
                        advertiser_name, advertiser_domain (registrable, from
                        advertiser.url else domain), landing_url_raw,
                        landing_url_canonical (query + fragment stripped),
                        title, snippet, image_url,
                        ownership (owned|competitor|other), competitor_id NULL,
                        created_at
UNIQUE (artifact_id, parser_version, rank_absolute)
```
Composite workspace FKs and `ON DELETE CASCADE` like `citations`. Ownership
via `scoringConfig` + `domainMatches` on `advertiser_domain`.

### Metrics `src/visibility/ads.ts` (deterministic, reads only)

- Applicability per answer: `chatgpt_search` with `ads_parser_version` set →
  applicable; `chatgpt_search` without → `unavailable`; other engines →
  `not_applicable`.
- Ad presence rate = successful applicable answers with ≥1 ad ÷ successful
  applicable answers; per run, prompt, topic.
- Advertisers: appearances, prompts reached, first/last seen, share of all
  ad appearances; brand's own ad share and best rank (null, not 0, when the
  brand never advertised).
- Creatives: dedupe on (advertiser_domain, title, snippet,
  landing_url_canonical); appearances, prompts, first/last seen.
- Ad beside organic: per prompt, count of answers where a competitor
  advertised and the brand was / was not mentioned organically
  (`response_analyses.brand_mentioned`).

### Read (family `visibility`)

`GET /api/v1/projects/{project_id}/visibility/ads` — run selection, engine,
cohort, prompt params like `/surface-rates`; returns applicability summary,
presence rate, advertisers, creatives (paged ≤50), prompts with ads,
ad-beside-organic counts. Contract in
`packages/contracts/src/visibility-evidence.ts` (or new `visibility-ads.ts`).

### UI — Ads tab

Header tiles: ad presence rate (with "N of M ChatGPT answers"), your ad
share, advertisers seen. Tables: advertisers (name, domain, ownership chip,
appearances, prompts, share, first/last seen); prompts that surface ads
(prompt, ads seen, top advertiser, you mentioned organically?); creatives
(text only: title, snippet, landing domain/path, appearances). Coverage note:
"Ads seen in ChatGPT sessions collected for this project's market. What your
buyers see depends on their plan, account and country." When the engine
filter is not ChatGPT Search: not-applicable state. Run evidence drawer:
list ads for a ChatGPT answer under the answer, separate from sources.

### MCP / Agent

`read_ai_ads` in `src/mcp/tools.ts` (impl in `evidence-analytics.ts`); run
`pnpm --filter @citeladder/api mcp:reference`; update the hand lists
(docs `mcp/tools.md`, `docs/mcp.md:149`, marketing `views-act.tsx`).
`assets/agent-skills/skills/ai_visibility/SKILL.md`: one line — ads are
paid placements, report them separately, never as citations or a cause.
Plugin twin `plugins/citeladder/skills/ai-visibility-review/SKILL.md`: same
line.

## Commit slices

1. Config, schema (table + `ads_parser_version`), freeze competitor id,
   regenerate db-schema.
2. `parseAds` + walker guard + parser tests (fixture with ads and sources).
3. `persistAds` in derive + ownership + real-PostgreSQL test.
4. Metrics + route + contracts.
5. MCP tool + reference + skills.
6. UI tab + evidence drawer section + tests.
7. Docs.

## Affected surfaces checklist

- **Backend:** `search-surfaces/parsing.ts`, `analysis/{ads,execution}.ts`,
  `audits/freeze.ts`, `config/audits.json` (+loader), `visibility/ads.ts`,
  `routes/visibility.ts`, `mcp/{tools,evidence-analytics}.ts`.
- **Schema/contracts/OpenAPI:** as above.
- **App UI:** `lib/visibility/dashboard.ts`, `visibility-dashboard.tsx`, new
  `components/visibility/ads-*.tsx`, `lib/api/visibility.ts`, query keys,
  hooks, `components/runs/execution-evidence-drawer.tsx`.
- **Marketing:** `components/marketing/scenes/views-act.tsx` tool list
  only.
- **Docs site:** `apps/docs/src/content/visibility.md` "Ads in ChatGPT
  answers" section (what is captured, applicability, presence rate,
  limitations), `mcp/tools.md`, `changelog.md`.
- **Internal docs:** `docs/visibility-prompt.md` (parsing, persistence,
  metrics, versions; update "Visibility has Trends, Sources and Query
  Fanout" ~:413), `docs/mcp.md`, tracker status + log. `earned-sources.md`
  unaffected. `src/audits/exports.ts` unchanged (deferred).

## Tests

Parser extracts ads and leaves citations and answer text untouched; walker
skips ad nodes even if they carry `sources`; ownership owned/competitor/other
with competitor id; applicability not_applicable vs unavailable vs observed
zero; presence denominators; creative dedupe; brand ad share null when
absent; ads excluded from mention/citation metrics; workspace isolation.

## Validation

Focused parsing/visibility tests while iterating; `./scripts/check.ps1` once
at the end (schema, contracts).

## Done when

A ChatGPT Search audit with ad items shows the Ads tab; other engines show
not applicable; MCP `read_ai_ads` matches; tracker row F5 is `done`.
