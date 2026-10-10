# F6 — Ground prompt generation in the project's own search data

Competitive tracker row F6, one PR. (Former F6-PR2 "AI interest estimates"
is moved to the backlog — see below.)
Owner documents: [Prompts and Visibility](../visibility-prompt.md),
[Connected data](../integrations-traffic-analytics.md).

Complete for implementation; decisions settled. Follow `CLAUDE.md`, the test
skill and the TypeScript skill. Verified at 8a0647035. Prompt generation is
the product's core feature: the bar is short buyer-style prompts that are
answered by naming a business.

## Settled decisions (owner, 2026-10-10)

| Topic | Decision |
|---|---|
| Sources | Reuse data the project **already has**: imported Search Console queries and published Search Intelligence keyword rows. Nothing is fetched for grounding. |
| No extra step | Generation flow, dialog and clicks are unchanged. If no data exists, generation behaves exactly as today. |
| No new spend | No DataForSEO LLM Mentions, no People Also Ask parsing, no AI Keyword Data. |
| Visibility | Observed queries are **not** shown as a panel or adoptable candidates. They only steer phrasing. A grounded candidate shows a small tag "Informed by your search data" (no IDs, no query text required). |
| Volume | Never present impressions or search volume as AI prompt volume. |
| Calibration | The outstanding v3 live calibration is not a merge blocker. If the implementer has gateway credentials in their own shell, run `pnpm prompts:eval --live` before and after and put the comparison in the PR description; otherwise state it was not run. |
| F6b | Backlogged ("AI interest estimates per topic", reason: keyword-level paid estimate, cannot attach to prompts, owner focus is prompt quality). |

## Current state (verified)

- Planner `src/prompts/generation-plan.ts`: slots carry
  `evidence_ref {kind:'business_map_cell', …, evidence_type:'hypothesis'}`
  (~:225-245); `generationBrief` (~:252) deliberately gives draft batches
  "No prose, sources, demand signals or competitors".
- Context `src/prompts/generation-context.ts` (~:154-222): `demand_signals`
  = top-N `demand_snapshots` rows with `target_kind==='query'`.
- Admission `src/prompts/generation-drafts.ts` `admitDrafts` (~:109-200):
  drop order unplanned_slot/intent/stage, duplicate, length, placeholder,
  `observed_copy` (:182, set from `demand_signals[].observed_query` :124-127),
  off_topic, location_unplanned, cohort reasons. Drop enum also in
  `packages/contracts/src/project.ts` ~:120.
- Staging `src/prompts/generation.ts` `candidateRow` (~:62-95):
  `evidence_refs = [slot.evidence_ref]`; `generation_mode` exists only in the
  run's `provenance` (`quick | agent_proposal`, :215).
- Quality gate `src/prompts/generation-quality.ts` (JEV, `jev-gate-1`);
  calibration `src/prompts/calibration.ts` (groups by business category);
  eval `scripts/eval-prompt-generation.ts` (`pnpm prompts:eval`), fixtures
  `test/fixtures/prompt-generation/context.ts`, metrics
  `src/prompts/generation-metrics.ts`, thresholds
  `src/config/prompt-generation.ts:47`.
- Search Console evidence: `query_evidence_rows` (baseline :2006; per day ×
  page: `normalized_query`, impressions, clicks, position) built by
  `src/demand/query-evidence.ts`. Branded classification
  `src/demand/classification.ts` (branded | non_branded | ambiguous, uses
  `branded_query_overrides`).
- Search Intelligence: `search_intelligence_datasets` (`dataset_kind`,
  `status`, `published_at`, `language_code`, `location_code`) and
  `search_intelligence_rows` (`keyword`, `search_volume`, `intent`,
  `row_kind`); dataset kinds include `ranking_keywords`, `organic_keywords`,
  `shared_keywords`, `missing_keywords` (`src/config/search-intelligence.json`);
  reads in `src/search-intelligence/reads.ts`.
- Topic binding `src/prompts/binding.ts` (`bindingFailure`,
  `loadVocabulary`); entity naming `entityKey`/`namesEntity`.
- Candidate UI `components/prompts/candidate-review.tsx`,
  `lib/prompts/candidate-quality.ts`.

## Design

### 1. Observed query loader `src/prompts/observed-queries.ts`

Read-only over persisted data, called during generation context build (a
command, not a read endpoint — no provider calls):

- **Search Console:** `query_evidence_rows` for the project over the last
  `observed.gsc_window_days` (90), grouped by `normalized_query`, summing
  impressions; keep `impressions ≥ observed.gsc_min_impressions` (10).
- **Search Intelligence:** rows from the latest **published** dataset of
  each kind in `observed.si_dataset_kinds`
  (`ranking_keywords`, `missing_keywords`, `shared_keywords`) whose
  `language_code` equals the project language.
- Filters for both: non-branded per `demand/classification.ts` (drop
  branded and ambiguous) and no competitor names (`namesEntity`);
  query-shaped (`observed.min_tokens` 3, or starts with a question word from
  a config list for the project language); length ≤ 120 chars.
- Bind each to a topic with `prompts/binding.ts`; unbound queries are
  discarded. Dedupe by normalized text; keep top
  `observed.max_per_topic` (50) by impressions, then search volume.
- Result: `{ id: <row id or dataset row id>, source: 'gsc' | 'search_intelligence',
  text, topic_id, weight }[]`. Config lives in
  `src/config/prompt-generation.ts` under `observed`.

### 2. Grounding the draft batches

- In the planner, for each slot choose up to `observed.examples_per_slot`
  (3) queries from the slot's topic with the highest token overlap against
  the slot's cell facets/offering (deterministic tie-break by weight then
  text). Attach to the slot as `grounding: [{id, source, text}]`.
- `generationBrief` / draft template: when a slot has grounding, add a
  section "How real buyers search in this area (examples only — do not copy
  them; write a short question a buyer would ask an AI assistant that is
  answered by naming a business)". Remove the "no demand signals" clause
  only for this section; keep "no prose, sources or competitors".
- Template version bump in `prompt-generation.ts` so eval and calibration
  separate grounded runs.

### 3. Admission

- `observed_copy` drop is extended to the full observed set used in the run
  (exact normalized copy of any grounding query is dropped, not only the top
  demand signals). All other rules unchanged.
- Candidate `evidence_refs` gains `{kind:'observed_query', source, id}` for
  each grounding example of the slot (alongside the cell ref).
- Run provenance records `grounding: {gsc: n, search_intelligence: n,
  slots_grounded: n}`.

### 4. Calibration and eval

- `calibration.ts`: add a `grounded` dimension (candidate has an
  `observed_query` ref) beside category; accept/reject rates per grounded vs
  ungrounded; text-free as today.
- Eval: fixture field `observed_queries` per fixture (synthetic, realistic);
  new metric `observed_likeness` = share of generated prompts whose token
  overlap with any observed query of their topic ≥ threshold (config) while
  not being an exact copy; report grounded vs ungrounded runs side by side
  (`--grounding off|on`). No new threshold failure in CI; eval is
  operator-only.

### 5. UI

`candidate-review.tsx`: tag "Informed by your search data" on candidates
with an observed ref (tooltip: "Phrasing was guided by queries from your
connected Search Console or keyword research. The prompt itself was
written for AI assistants."). Nothing else changes.

## Commit slices

1. Config `observed` block + loader + tests (real PostgreSQL: GSC grouping,
   SI published-only + language, branded/competitor drops, binding, caps,
   workspace isolation).
2. Planner grounding + template/brief + version bump + unit tests (no
   evidence → identical plan and brief).
3. Admission extension + evidence refs + provenance + contracts (candidate
   evidence ref kind) + tests.
4. Calibration grouping + eval metric + fixtures.
5. Candidate tag UI + test; docs.

## Affected surfaces checklist

- **Backend:** new `prompts/observed-queries.ts`;
  `prompts/{generation-plan,generation-context,generation-drafts,generation,calibration,generation-metrics}.ts`,
  `config/prompt-generation.ts`, `scripts/eval-prompt-generation.ts`,
  `test/fixtures/prompt-generation/context.ts`.
- **Schema:** none (evidence refs are jsonb). Confirm `prompt_candidates.evidence_refs`
  is jsonb; if it is constrained, adjust the baseline check.
- **Contracts:** `packages/contracts/src/project.ts` candidate evidence ref
  union (`observed_query`), run provenance.
- **App UI:** `components/prompts/candidate-review.tsx`,
  `lib/prompts/candidate-quality.ts` (if tags live there).
- **MCP/Agent:** `read_prompt_portfolio` candidate output — show
  `grounded: true|false` only, not row IDs.
  `assets/agent-skills/skills/prompt_discovery/SKILL.md` keeps "never attach
  keyword search volume as AI prompt volume"; add nothing else.
- **Marketing:** `lib/marketing-content/platform-pages-measure.ts`
  (~:90-111 "Prompts built around buying") — one sentence: when Search
  Console or keyword research is connected, generation uses how your buyers
  already search to phrase prompts. Do not name DataForSEO; no volume
  claims.
- **Docs site:** `apps/docs/src/content/prompts.md` — short "Grounded in
  your search data" paragraph (what is used, that it is optional and needs
  no extra step, never treated as AI prompt volume); `demand.md` and
  `search-intelligence.md` one cross-link line each; `changelog.md`.
- **Internal docs:** `docs/visibility-prompt.md` (~:14-20, 118-139, 147-158:
  draft batches now receive bounded grounding examples; observed-copy rule;
  evidence refs; calibration dimension), `docs/integrations-traffic-analytics.md`
  (GSC and Search Intelligence data feed generation phrasing),
  `docs/plans/backlog.md` (close "generate from selected search queries
  retaining QueryEvidenceRow identity" ~:63 and "prompt grounding in
  persisted GSC evidence remains deferred" ~:95-97; add the F6b item),
  tracker status + log.

## Tests

No observed data → plan, brief and admitted set identical to today; GSC
grouping and impression floor; SI only published datasets in the project
language; branded and competitor queries never ground; unbound queries
discarded; slot gets ≤3 same-topic examples deterministically; exact copy
of a grounding query dropped; evidence refs and provenance recorded; tag
rendered only for grounded candidates; workspace isolation. Model calls
faked in tests.

## Validation

Focused prompt-generation tests while iterating; `./scripts/check.ps1` once
at the end (contracts changed). Eval only as described in the decisions.

## Done when

A project with Search Console data produces candidates tagged "Informed by
your search data" and the same flow without data is unchanged; tracker row
F6 is `done`; backlog updated.
