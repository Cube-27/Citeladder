# F3 — Answer perception (sentiment, themes, recommended rate)

Competitive tracker row F3, one PR. Owner documents:
[Prompts and Visibility](../visibility-prompt.md) (new "Answer perception"
section), [Agent](../agents.md), [MCP](../mcp.md). New module
`frontend/services/api/src/perception/`.

Complete for implementation; decisions settled. Follow `CLAUDE.md`, the test
skill and the TypeScript skill. Verified at 8a0647035.

## Settled decisions

| ID | Decision |
|---|---|
| D3.1 | Platform-funded through the default Agent gateway model; no customer credit draw. Caps in config; usage recorded per call. |
| D3.2 | Always on. No project toggle, no `not_enabled` state, no project column. If no gateway model is configured the read says `unavailable / model_not_configured`. |
| D3.3 | Model = the default Agent gateway model (`DEFAULT_AGENT_*`). |
| Queue | Use the existing `analytics_tasks` queue with a new kind `answer_perception`. **No `perception_tasks` table** (that would be a parallel queue). |
| Greenfield | No backfill button or CLI. Perception applies to audits run after this ships. |
| Placement | New Visibility tab **Perception**; per-answer label + quotes in the run evidence drawer; one-line notice in the audit launcher. No Sentiment column on ranking rows. |
| Headline metric | Net sentiment −100…+100 only (no 0–100 Peec-style score). |
| Marketing | Docs site + changelog only. No marketing-site claims in this PR. |
| Caps visible | `unavailable (platform_cap)` and counts are shown plainly; no upsell. |

## Current state (verified)

- Placeholder column `response_analyses.sentiment varchar(16)`
  (`0001_baseline.sql:2141`), written `null` at
  `src/analysis/execution.ts:89`.
- Placeholder inventory (replacement gate — remove all):
  `analysis/aggregate.ts:319`; `visibility/metrics.ts:202-228`;
  `visibility/trend-folding.ts:77,289,318`; `visibility/execution.ts:114`;
  `visibility/dashboard.ts:260`; `audits/exports.ts:156` ("sentiment is not
  computed"); contracts `packages/contracts/src/visibility.ts:38,53,119`,
  `visibility-trends.ts:28,44`, `audits.ts:352,378`; frontend
  `lib/api/visibility.ts:4`, `lib/visibility/trends.ts:8`,
  `lib/visibility/dashboard.ts:198`; fixtures/tests
  `components/visibility/ranking-rows.test.tsx:16,46`,
  `components/runs/evidence-card.test.tsx:31`,
  `lib/visibility/dashboard.test.ts:35,138,148`,
  `e2e/visibility.spec.ts:10,81,92,114,137,141`, `e2e/runs.spec.ts:84`,
  `packages/mcp-app/src/analytics.test.tsx:49,54` (rebuild
  `packages/mcp-app/dist/analytics.html`, never hand-edit).
- `src/analysis/entity-assessment.ts`: deterministic first-mention state per
  entity (`absent|mentioned|recommended|recommended_against|hedged|unavailable`),
  `evidence_spans` in **code-point** offsets, English-only. Only reader today:
  opportunities (`analysis/opportunities/detectors.ts:36`,
  `opportunities/refresh-evidence.ts:236,291`).
- `analyzeExecution` (`execution.ts:13`) runs inside the audit result
  transaction (`audits/result-persistence.ts:157-230`; also
  `audits/projections.ts:33`, `audits/surface-persistence.ts:70`,
  `commerce/shelf.ts`). Returns early if the analysis row exists
  (:21-24) → no duplicate enqueue on finalize re-derive.
- `enqueueTask(db|trx, …)` (`src/referrals/enqueue.ts`) supports
  transactions, key `analytics:<kind>:<parts>`, `ON CONFLICT DO NOTHING`.
- Gateway `src/models/gateway.ts`: `createModelGateway(gatewaySettings(env))`
  throws `ModelError('not_configured')`; `gateway.structured(system, user,
  zodSchema, signal)` → `{value, result}` with `result.usage`
  (`input_tokens, output_tokens, total_tokens, cached_input_tokens,
  reasoning_tokens`), `returned_model`, `latency_ms`; internal retries.
  Non-Agent callers do not persist usage today — perception stores its own.
- Audit config frozen in `src/audits/freeze.ts:255-301` (stored
  `audits/creation.ts:133`).
- Visibility tabs `lib/visibility/dashboard.ts:27-43`
  (`VisibilityTab`, `VISIBILITY_TABS`), rendered in
  `components/visibility/visibility-dashboard.tsx` (~:103 TabsBar, ~:161-174
  panels), queries `lib/visibility/use-visibility-dashboard.ts`.
- Eval precedent: `pnpm prompts:eval` → `scripts/eval-prompt-generation.ts`
  (`--live`, fixtures, log in the worktree Git dir).
- `docs/design.md:53` outcome scale already reserves sentiment.

## Design

### Config `src/config/perception.json` (+ typed loader exported from config)

`extractor_version`, `template_version`, `metrics_version`,
`min_confidence` 0.6, `max_entities` 8, `max_passage_chars_per_entity` 1200,
`max_aspects_per_entity` 5, `max_classifications_per_audit` 500,
`max_classifications_per_workspace_per_day` 2000, `max_attempts` 2,
`themes` (closed list: pricing, value, quality, features, ease_of_use,
support, reliability, performance, security_privacy, integrations,
reputation_trust, availability, shipping_delivery, returns_policy,
sustainability, other), `eval_thresholds` + `eval_policy_version`, the
system/user template text.

### Trigger (no network in the transaction)

At the end of `analyzeExecution`: if any entity assessment has state not in
`{absent, unavailable}` (an empty array counts as none), call
`enqueueTask(trx, 'answer_perception', [analysis_id, extractor_version])`.
Freeze `perception: {extractor_version, template_version, metrics_version}`
into the audit configuration in `freeze.ts` so results carry the versions in
force at admission.

### Executor `src/perception/executor.ts` (registered in `analytics.json` tasks and `EXECUTORS`)

1. Load analysis, artifact answer text, prompt snapshot, frozen entities.
2. Caps: count `answer_perceptions` for the audit and for the workspace in
   the current UTC day (index `(workspace_id, created_at)`). Over cap →
   persist outcome `unavailable`, reason `platform_cap`; task succeeds.
3. Gateway not configured → outcome `unavailable`, `model_not_configured`.
4. Build the input package (`src/perception/passages.ts`): for each counted
   entity (brand first, then competitors by first offset, ≤ `max_entities`),
   passages = every sentence containing a counted occurrence plus one
   sentence either side, merged, capped. `Intl.Segmenter(language_code,
   {granularity:'sentence'})`. **Store offsets in code points** (same unit as
   entity-assessment); convert from UTF-16 segment indexes explicitly.
   `input_hash` = SHA-256 of the canonical JSON package.
5. Commit an attempt marker (task attempt already committed by the analytics
   claim; do not hold a transaction across the call), then
   `gateway.structured(...)` with the zod schema:
   `entities[{entity_id, label: positive|neutral|negative|mixed|not_assessable,
   confidence 0..1, aspects[{theme, polarity: positive|negative, quote}] ≤5}]`.
6. Deterministic validation (`src/perception/validate.ts`): unknown
   `entity_id` dropped (`unknown_entity`); quote must be an exact substring of
   that entity's passages after whitespace normalisation, else dropped
   (`quote_not_found`); matched offsets stored; theme outside list → `other`;
   confidence < min → stored, flagged `low_confidence`, excluded from
   aggregates. Schema/parse failure → retry once (max_attempts 2), then
   outcome `invalid_output`. Gateway error after retries → `model_error`.
7. One transaction writes `answer_perceptions` + `entity_sentiments`;
   idempotent on `UNIQUE (analysis_id, extractor_version)`.

### Schema (baseline edit; drop `response_analyses.sentiment`)

```
answer_perceptions  id, workspace_id, project_id, audit_id, task_id, analysis_id,
                    artifact_id, extractor_version, template_version,
                    model_provider, model, input_hash, outcome
                    (classified|no_mentions|unavailable|invalid_output|model_error),
                    outcome_reason, drop_counts jsonb, usage jsonb, latency_ms,
                    created_at;  UNIQUE (analysis_id, extractor_version)
entity_sentiments   id, workspace_id, perception_id, entity_id, entity_kind,
                    label, confidence, low_confidence bool, passage_spans jsonb,
                    aspects jsonb  -- [{theme, polarity, quote, start, end}]
```
Composite workspace FKs like other evidence tables; index
`answer_perceptions (workspace_id, created_at)` and `(audit_id)`.

### Metrics `src/perception/metrics.ts` (pure, deterministic)

- Classified mentions = label ∈ {positive, neutral, negative, mixed} and not
  low-confidence. Always paired with coverage "N of M mentions classified";
  M = mentioned entities in completed answers; pending, unavailable (by
  reason), not_assessable and low-confidence counted separately.
- Positive share, negative share; net sentiment =
  (positive − negative) / classified × 100; `mixed` in denominator only.
- Per entity (brand vs each competitor), engine, prompt, topic, run. Trend
  points grouped by `(extractor_version, template_version, metrics_version)`;
  a change marks the point non-comparable (same UI treatment as analyzer
  version changes in `visibility/dashboard.ts:271-273,380-399`).
- Themes: brand counts by theme × polarity with up to 3 quotes each, linking
  to `/runs/{runId}?execution={taskId}`.
- Negative drivers: domains/URLs cited in answers where the brand has a
  negative aspect — labelled "cited alongside", never "caused".
- Recommended rate (deterministic, from `entity_assessments`): recommended ÷
  mentioned per response, plus recommended-against count; shows the
  English-only, first-mention limitation.
- Read states: `pending`, `unavailable` (+reason), `no_mentions`, value.
  Never 0 for missing data.

### Reads (family `visibility`)

- `GET /api/v1/projects/{project_id}/visibility/perception` — params
  `audit_id` | `from`/`to`, `engine`, `cohort`, `entity`; returns summary,
  per-entity, themes, drivers, recommended rate, coverage, trend.
- `GET …/visibility/perception/quotes` — cursor-paged; filters `entity`,
  `theme`, `polarity`.
- Wire contracts: delete every `sentiment` placeholder field; add
  `packages/contracts/src/visibility-perception.ts`. Evidence response
  (`audits.ts:378`) gains `perception: {state, label?, confidence?, aspects[]}`
  per entity instead of `sentiment`.

### UI

- **Perception tab** (`VISIBILITY_TABS` id `perception`, after Sources):
  net sentiment tile with coverage strip; brand vs competitors bar list
  (positive/negative split); themes table (theme, positive, negative, top
  quote); negative quotes list; negative drivers table; recommended-rate
  tile. Colours: positive=success, negative=danger, mixed=warning,
  neutral=neutral; not_assessable/pending/unavailable use the existing
  unavailable mark. Honour run/engine/prompt/period controls. Empty states:
  pending ("Classifying answers…"), unavailable with reason, no mentions.
- **Run evidence drawer** (`components/runs/evidence-card.tsx`,
  `execution-evidence-drawer.tsx`): label chip per entity + quotes
  highlighted in the answer.
- **Audit launcher** (`components/runs/launch-dialog-view.tsx`): "Answers
  that mention you or a competitor are also classified for sentiment. No
  credits are used."
- No record IDs or internal names in UI copy.

### MCP and Agent

- `src/mcp/tools.ts`: `read_perception` (views `summary` | `quotes`),
  pattern of `read_visibility_trends` (:168-183); implementation in the
  visibility evidence module. Same catalogue serves the in-app Agent
  (`src/agent/reads.ts`). Output strips internal IDs except link targets the
  tool convention already uses.
- `pnpm --filter @citeladder/api mcp:reference` → regenerates
  `apps/docs/src/data/mcp-tools.json`.
- Skills: `assets/agent-skills/skills/ai_visibility/SKILL.md` and
  `measure/SKILL.md` — 2–3 lines: read perception, always state coverage,
  never call co-occurrence a cause. Plugin twins
  `plugins/citeladder/skills/ai-visibility-review/SKILL.md` and
  `ai-search-change-review/SKILL.md` — same lines (parity).

### Calibration (operator-only, never in CI)

- 60 synthetic answers with hand labels in
  `services/api/test/fixtures/perception/` (mix: brand praised, criticised,
  mixed, bare lists, competitor comparisons, non-English two cases).
- `pnpm perception:eval --live` (`scripts/eval-perception.ts`, copy the
  prompts:eval shape): label agreement, macro F1, quote validity rate, cost
  per answer; thresholds from `perception.json`. Implementer may run it only
  if a gateway key is present in their own shell; results go in the PR
  description, not a file.

## Commit slices

1. Config + loader + contracts + fixture skeleton.
2. Baseline: drop `sentiment`, add tables; remove all placeholders (gate
   list above) incl. frontend and fixtures; regenerate db-schema.
3. Pure core: passages, package/hash, schema, validation, metrics + unit tests.
4. Trigger + executor + caps + freeze; integration tests.
5. Reads + routes + exports text.
6. UI: tab, evidence drawer, launcher notice; tests/e2e updates.
7. MCP tool, reference regen, skills (in-app + plugin).
8. Eval script + fixtures; docs.

## Affected surfaces checklist

- **Backend:** new `src/perception/*`; `analysis/execution.ts`,
  `audits/freeze.ts`, `workers/analytics-worker.ts`,
  `config/{perception.json,analytics.json}`, `visibility/*` (placeholders +
  new read), `analysis/aggregate.ts`, `routes/visibility.ts`,
  `audits/exports.ts:156` (replace the sentence with the perception
  methodology line).
- **Schema/contracts/OpenAPI:** as above; `scripts/check-route-ownership.ts` passes.
- **App UI:** visibility tab + components, runs evidence, launcher.
- **MCP/Agent/plugin:** as above.
- **Marketing:** none (owner: docs only).
- **Docs site:** `apps/docs/src/content/visibility.md` — "Perception"
  section after "Read Trends" (what is classified, coverage, states, net
  sentiment formula, themes, drivers wording, limitations);
  `understanding-evidence.md` (quotes are verified substrings);
  `mcp/tools.md` hand list; `changelog.md`.
- **Internal docs:** `docs/visibility-prompt.md` new "Answer perception"
  section (trigger, queue kind, validation, metrics, versions, caps,
  funding); `docs/agents.md` and `docs/mcp.md:149` catalogue rows;
  `docs/architecture.md` capability map line; `docs/plans/backlog.md:229`
  remove "recommended vs only mentioned"; `docs/commerce-intelligence.md:184`
  unchanged; tracker status + log. Invariants unchanged (invariant 9 covers it).

## Tests

Invented quote dropped; unknown entity dropped; low confidence stored but
excluded and counted; net sentiment denominators and `mixed`; pending vs
unavailable vs no_mentions; version change → non-comparable point; enqueue
only when an entity is mentioned and only once across finalize re-derive;
lease recovery of an `answer_perception` task; platform caps end as
`platform_cap` without failing the audit; `model_not_configured`; code-point
offsets with an emoji/CJK fixture; workspace isolation (real PostgreSQL).
Gateway faked in tests; no live provider credentials reach tests.

## Validation

Focused perception/visibility tests while iterating; `./scripts/check.ps1`
once at the end (contracts, schema, queue). Skills: run the agent-skills
loader test.

## Done when

No `sentiment: null` remains (`git grep -n "sentiment: null"` empty); a new
audit with a configured gateway shows the Perception tab populated; MCP
`read_perception` returns the same numbers; tracker row F3 is `done`.
