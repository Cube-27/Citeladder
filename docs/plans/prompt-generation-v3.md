# Prompt generation v3 and brand matching plan

The follow-up PR named by the [visibility plan](visibility-prompt-improvement.md#follow-up-prompt-generation-and-brand-matching)
(feature 3 of the [feature review tracker](feature-review-tracker.md)).
**Status: decision-ready (2026-10-08), not implemented.** Shipped behaviour is
owned by [Visibility](../visibility-prompt.md) and [Agent](../agents.md), not by
this plan. Constraints: [invariants](../invariants.md) 2 (policy is
configuration), 5 (provenance and version bumps, never a reset), 9
(deterministic code owns measurable facts), 11-12 (bounded, inspectable context;
no fabricated facts) and 13 (the Agent is bounded orchestration). File
references are to `frontend/services/api/src/` or `frontend/` as noted.

## Why

A read-only audit of generation (`prompts/generation*.ts`,
`config/prompt-generation.ts`, `config/prompt-library.json`, `config/jev.ts`),
the Agent prompt-discovery path and brand matching (`analysis/scoring.ts`,
`analysis/aliases.ts`, `analysis/entity-assessment.ts`) found one structural
cause for location over-specificity, two modes that share a prompt template but
not a product definition, a request shape that cannot finish behind the
Cloudflare limit at its own maximum, and a brand matcher with one customer's
rule compiled in. Nothing measures the distribution of what is generated, which
is why ten rewrites of the template could not converge.

### Root cause: a region in the profile becomes a planned facet

The `theasianschool.net` case (a school in Dehradun, Uttarakhand) follows one
path. The stored profile for that project was not inspected; the trace below
is the code path any region-naming profile takes.

1. Discovery's identity model returns the open `service_areas` list (contract
   `packages/contracts/src/visibility.ts:210`, used as the model schema through
   `projects/discovery-inputs.ts:26` and `projects/research.ts:22-24`). Completion
   spreads every profile fact into `business_context`
   (`projects/discovery.ts:191-204`); `service_areas` is not in the reviewed set
   (`:205-211`), so it is stored `inferred`. The reviewed `market_scope` facet
   (local / regional / national / global) is also stored, but **nothing in
   generation reads it**: its only consumers are Site Health archetypes and the
   profile UI.
2. The planner turns every service area into a market facet:
   `markets = ['', ...service_areas]` (`prompts/generation-drafts.ts:124`) and
   assigns the least-used market per topic (`:156-159`, `:168`). Usage is
   tracked per topic, so with one service area exactly half of every topic's
   cells carry `market: Uttarakhand`; with two (city and state) two thirds do.
   The system prompt then tells the model to "use the cell's relevant facets"
   (`config/prompt-generation.ts:140`); a planned market is read as an
   instruction, and the same template's "location is context, not a required
   suffix" sentence cannot override a facet code has planned.
3. Location-free cells are not location-free in practice: every batch sends
   the whole context object as `reference_evidence` (`generation-drafts.ts:478`),
   including description, positioning, target audience, `service_areas`,
   `primary_market`, `country_code` and knowledge-base sources
   (`generation-context.ts:160-202`). A regional school's prose names the region
   in several fields.
4. Business-map suggestions may add location as an audience or situation
   ("parents in Dehradun"): `map_system` forbids brand names only
   (`config/prompt-generation.ts:9`), and non-bare cells are drafted before bare
   ones (`generation-drafts.ts:148-151`).
5. Nothing downstream removes location. Admission has no location rule
   (`generation-drafts.ts:242-270`); the judge's business state includes
   `service_areas` and `primary_market` (`generation-quality.ts:139-153`) and
   `fits_business` rewards resemblance to "a business like `business`";
   selection balances `market:` only for planned facets (`:233-237`), never for
   a location the model added itself; and `existing_prompts` feeds earlier
   located drafts back into later batches as examples (`:481-484`), so a run
   converges on its first batch's register. Binding admits "best schools in
   Uttarakhand" without an offering because `service_areas` is binding
   vocabulary (`config/prompt-library.json:274-281`, `prompts/binding.ts:148-157`).
6. No run records the share of drafts naming a location, a stage, a persona or
   an offering, so the template was tuned blind.

### Two modes, one template, no product definition

| | Quick generate (`POST /prompt-sets/{id}/generate`) | Agent (Prompt discovery skill, `agent_revision_id`) |
|---|---|---|
| Inputs | Whole context object, business map cells, demand signals, existing prompts | Everything the skill reads; it is required to recover "served geography/language" (`assets/agent-skills/skills/prompt_discovery/SKILL.md:21`) and to cover "finding appropriate options in a served market" (`:53`) |
| Plan | Code-planned cells: offering × ≤2 facets × stage × market (`generation-drafts.ts:107-187`) | Model-planned coverage plan, then rows per topic |
| Admission | Same rules (`admitDrafts`) | Same rules; slots carry only `{offering: topic.name}`, no stage or facet (`:411-426`), so selection spreads over topic alone |
| Provenance | `generation_mode: 'model'` (`generation.ts:193`) | `generation_mode: 'agent_proposal'` |

Both end in the same `prompt_candidates` review path, which is right. What is
missing is the definition the owner gave: quick generate covers the broad
market; the Agent targets a niche with explicit attributes. Today both inject
geography, and the quick path has the richer input.

### Hardening findings

| # | Finding | Evidence |
|---|---|---|
| H1 | **Cannot finish at its own maximum.** `count` ≤ 100 (`config/prompt-library.json:40-45`) plans `count × 2` slots in batches of 20 (`:46-64`), so `draftCallLimit(100)` is 11 sequential model calls (`generation-drafts.ts:436-439`, loop `:471-498`) plus one map call and a 30 s judge deadline, each call with a 180 s timeout (`config/model-gateway.json:18-23`). Cloud Run allows 300 s (`infra/gcp/run.tf:34`), the browser waits 240 s (`lib/config/operational.ts:67`) and Cloudflare's free plan closes the connection at 100 s. | `generation-drafts.ts:471-498` |
| H2 | **A later batch's non-parse error discards earlier admitted drafts.** Only `parse` errors are tolerated; any other `ModelError` propagates (`:494-497`) to a 502 (`generation.ts:275-287`) and nothing is staged. | `generation-drafts.ts:494-497` |
| H3 | **No idempotency key.** A browser retry after a timeout runs the whole pipeline again and double-spends the agent-call budget (`generation.ts:265-271`). Discovery and Agent routes already take `Idempotency-Key` (`projects/discovery-inputs.ts:73-79`, `routes/agent.ts:37-42`). | `routes/prompts.ts:66-81` |
| H4 | **Operator copy shown to customers.** A 503 renders `DEFAULT_AGENT_API_KEY` / `DEFAULT_AGENT_BASE_URL` / `DEFAULT_AGENT_MODEL`. | `components/prompts/generate-prompts-dialog-view.tsx:62-70` |
| H5 | **Context reads every column.** Seven `selectAll()` reads, including every prompt's `generation_evidence` and every candidate's `jev_decision`, under the project lock. | `generation-context.ts:76-137` |
| H6 | **Dead request surface.** The dialog sends only `count` and `topic_ids` (`components/prompts/generate-prompts-dialog.tsx:66`); `intents` (including `local`) and the `commerce` cohort are accepted by the schema (`generation-input.ts:17-20`) but have no caller. | `generation-input.ts` |

### Brand matching findings

| # | Finding | Evidence |
|---|---|---|
| B1 | **One customer's rule compiled in.** `ambiguous_aliases: ["target"]` (`config/audits.json:26`) switches `entityPresent` to a regex that accepts `<alias> Australia` or rejects `<alias> audience/price/market/demographic`; the same regex pair is duplicated in entity assessment. | `analysis/scoring.ts:111-122`, `analysis/entity-assessment.ts:9-22`, `test/audit-scoring.test.ts:59-75` |
| B2 | **Common-word brands false-positive.** Apple, Notion, Linear, Monday, Target and any single-token name match the common noun. The generator already keeps a `brand_common_words` list for the inverse problem (`config/prompt-generation.ts:22-89`). | `analysis/aliases.ts:50-52` |
| B3 | **Scripts without spaces never match.** `normalizeAlias` keeps letters and splits on spaces only (`aliases.ts:8-22`); `compactOffset` concatenates whole tokens until the run equals the compact alias (`:25-38`). A Chinese, Japanese or Thai answer is one token per clause, so a CJK brand inside a sentence is never found and is recorded as not mentioned (an observed zero that is really a defect, invariant 7). Binding already segments dense scripts with `Intl.Segmenter` (`prompts/binding.ts:26-30`, `:63-67`). | `analysis/aliases.ts` |
| B4 | The audit freezes `brand_name`, `brand_aliases` and competitors into its configuration block (`audits/freeze.ts:253-260`); any per-project matching policy must be frozen there too so historical analyses stay reproducible. | `audits/freeze.ts` |

### What comparable tools do

Research summary (verified on vendor pages unless marked inferred):

- **Searchable "Prompt Universe"**: a per-brand market map of products × audiences
  × competitors × buying situations × location, built from the website, buyer
  language and engine fan-out queries, "often in the hundreds of thousands",
  then narrowed to a tracked set that covers "what matters" rather than "a long
  list of similar questions"; no volume claim ("the number of prompts in a
  universe is not a count of searches"); location is one tagged dimension
  (https://www.searchable.com/prompt-universe, https://www.contentgrip.com/searchable-prompt-universe/).
- **Profound**: 5-15 topics × ~10 prompts, far more unbranded than branded,
  region and language as per-prompt attributes, SEO phrase → conversational
  question (https://help.tryprofound.com/articles/4881350168-how-to-create-topics-prompts-to-track-in-profound).
- **Peec AI**: one topic per prompt; funnel, intent, audience and market tags;
  generator defaults 20 % branded and 25/50/25 informational/commercial/transactional
  (https://docs.peec.ai/setting-up-your-prompts).
- **Scrunch**: start with 15-25 prompts across 6-12 topics; personas and region
  are collection-time settings, with location appended in text only when wanted
  (https://helpcenter.scrunchai.com/en/articles/12872036-scrunch-prompt-strategy-guide).
- **Ahrefs, Evertune, Semrush**: corpus-first with observed or licensed demand;
  Ahrefs advises "a few dozen prompts on a narrow set of topics" to start
  (https://ahrefs.com/aeo/choose-prompts-to-track).

Cross-tool pattern: topics × intent/stage is the skeleton, unbranded dominates,
geography is a per-prompt execution attribute rather than text injected into
every prompt, and a small coverage-first starter set precedes depth. Inferred:
Searchable's distinctive step is enumerating the universe per brand and
*sampling for coverage*, which is what CiteLadder's planner should do
deterministically.

## Product model

**Quick generate** samples the broad market universe: the questions real buyers
of this *category* ask AI, spread across offerings, buyer stages, intents and
buyer personas. It is the starter set and the periodic top-up. It uses:
category and category terms, confirmed offerings and their confirmed business
map facets, business model, buyer type, `market_scope`, language and country
(register only), topics, and existing prompt hashes for de-duplication. It does
**not** send description, positioning or target-audience prose, knowledge-base
sources, demand signals or competitors to the model (competitors and observed
queries stay admission inputs). Geography enters the wording only when
`market_scope` is `local` or `regional`, on a bounded share of cells, and never
from the inferred `service_areas` of a national or global business.

**Agent generation** is the methodical dive into a niche: a chosen offering, a
place, a persona, a constraint or an intent the user names in chat. It may use
everything the Prompt discovery skill reads today, including demand evidence and
service areas, and its rows may carry explicit targeting facets. It is the only
mode that intentionally writes location-, persona- or constraint-specific
prompts for a national business.

Shared rules: one owner (`prompts/generation.ts`) plans, admits, judges, selects
and stages both modes into `prompt_candidates`; there is no second pipeline or
store. Users are never asked for theme, intent, stage or cohort (existing rule).
The Generate dialog keeps count and topics and gains one sentence describing
what quick generate covers and when to use **Build with Agent**; the Agent chat
keeps its coverage-plan approval step.

## Architecture

### Universe planner (quick generate)

Replace `planSlots` with a deterministic universe plan under
`config/prompt-generation.ts` policy:

1. **Axes.** Offerings (selected topics' confirmed maps or bare topics) ×
   stages (`stages`) × intents allowed per stage (new `stage_intents` map, derived
   from `intent_legacy`) × personas (confirmed `audiences` entries, else
   `buyer_roles`, else none) × situations/attributes (confirmed first, suggested
   second, exclusions honoured) × market (see 3).
2. **Coverage-first sampling.** Fill in rounds: every offering gets one bare
   cell per stage before any facet repeats; then facets least-used-first; persona
   and situation attach to at most `facet_cell_share` of cells (recommend 0.5)
   so simple needs stay simple. Over-generation stays `count × overgenerate_factor`.
3. **Location policy** (`location_policy` in config): share of cells allowed a
   market facet by `market_scope`: `local` 0.5, `regional` 0.25, `national` and
   `global` 0, unknown 0. Market values come from `service_areas` only when the
   scope permits them. The model brief states "do not name a place" for cells
   without a market.
4. **Narrow brief.** Each batch receives a `generation_brief` projection
   (fields listed in config `quick_brief_fields`), the batch's cells, and the last
   `existing_prompt_context_limit` tracked texts for de-duplication only. The
   context manifest already hashed into provenance (`generation.ts:204-206`)
   hashes the brief, not the whole context.
5. **Model labels.** Rows keep `buyer_stage` and `prompt_intent` and add
   `names_place: boolean` as a recorded label (invariant 9: a bounded
   classification, never truth).

### Admission and selection

- New deterministic drop reason `location_unplanned`: a quick-generate draft
  that contains a geo-vocabulary term (service areas, `market_context_terms`
  for the primary market, the market facet values) when its cell has no market.
  The model's `names_place` label is recorded beside the deterministic result in
  the drop record, never used to drop.
- `service_areas` leaves the binding vocabulary for generated and proposed
  text (`business_context_fields`); manual prompts keep it, since a user who
  types a place has bound it deliberately. Owner decision 4.
- Selection adds `intent:` and `persona:` features so spread covers all axes.
- Run provenance adds `distribution`: counts by stage, intent, offering,
  persona, located and bare cells, for admitted and selected drafts. This is
  the measurement the eval harness and the dialog's result line read.

### Agent mode

- Skill `prompt_discovery` v3 → v4: the brief says the Agent is the niche mode;
  it stops requiring geography for every portfolio and asks for it when the user
  targets a market. Proposal rows gain optional `targeting` keys
  (`place`, `persona`, `constraint`) validated by `parsePromptProposal`
  (`packages/contracts/src/prompt-proposal.ts:20-32`); unknown keys are still
  rejected. Rows without targeting are admitted exactly as today.
- Agent slots carry those facets as `buyer_need`, so selection, distribution
  and provenance see the same shape as planned cells. Location admission is not
  applied to Agent rows: targeting is the point.
- Both modes keep `generation_mode` in run provenance; `quick` replaces
  `model` for new runs (historical values are not rewritten).

### Execution, idempotency and partial results

Numbers: at the default count (10) a run is 2 draft calls, 1 map call and the
judge; at 50 it is 6 draft calls. Recommended (decision 1): **bounded
synchronous execution** with a request deadline rather than a new queue lane.

- `max_count` 100 → 50 and the dialog's ceiling follows it
  (`lib/config/prompts.ts:2`). Draft batches run with bounded concurrency
  (`draft_concurrency`, recommend 3) instead of strictly sequentially; the
  `seen`/`usedSlots` admission state is merged per batch in completion order.
- A per-request `generation_deadline_seconds` (recommend 70, under Cloudflare's
  100 s with the judge's 30 s) stops starting new batches; what was admitted is
  judged and staged, and the response reports `shortfall_reason: 'deadline'`.
- A batch's non-parse `ModelError` after at least one admitted draft is
  recorded in `model_results` with its code and the run continues; only a run
  with zero admitted drafts fails (fixes H2).
- `Idempotency-Key` header, bounded like discovery's, stored in
  `prompt_generation_runs.request` as `idempotency_key`; a repeat within
  candidate retention returns the stored run's still-pending candidates without
  provider I/O. No DDL (decision 6).
- `generationContext` reads named columns; prompts load `id, topic_id, text,
  normalized_text_hash`, candidates `normalized_text_hash, disposition,
  jev_decision`.
- Customer error copy: 503 → "Prompt generation isn't available on this
  deployment yet"; 502 keeps the retry message; operator detail stays in logs.

If production timings show deadline shortfalls at count ≤ 50, the fallback is a
`prompt-generation` runner lane with `nextDue` (the discovery pattern,
`workers/runner.ts:205-229`), which needs run status columns and a polling
read; it is not in this PR.

### Brand disambiguation

- **Policy per project**, stored as `entity_matching` in
  `brand_profiles.business_context` beside `business_map` (same lock, same
  replace-one-key write as `projects/business-map.ts:168-176`, no DDL):
  `{ version: 'entity-matching-1', entities: { [normalized name]: { mode:
  'always' | 'context_required', context_terms: string[], exclusion_phrases:
  string[] } } }` for the brand and each competitor. Default `always`. When a
  brand or competitor name or alias normalizes to one token that is in
  `brand_common_words`, binding stopwords or a short policy list of common
  nouns, the default is `context_required` with context terms seeded from
  category terms and confirmed offerings; the user can change either.
- **Deterministic matching** (`analysis/aliases.ts`): an occurrence counts when
  the entity is `always`, or when a context term occurs within
  `context_window_tokens` (recommend 12) of it; an occurrence inside an
  exclusion phrase never counts. Dense scripts are segmented with
  `Intl.Segmenter` before compact-run matching, so CJK and Thai brands match
  inside sentences. One function serves scoring, entity assessment and the
  generator's `containsName`.
- **Freezing and versions.** The audit configuration block gains
  `entity_matching` at admission (`audits/freeze.ts:253`); analysis reads the
  frozen copy. Bump `analyzer_version` `grounded-analysis-v1` → `v2` and
  `entity_assessment_version` → `entity-assessment-2`; comparisons across the
  bump are already non-comparable by version (invariant 5).
- **Removal.** Delete `ambiguous_aliases` from `config/audits.json`, the regex
  pair in `scoring.ts:113-122` and `entity-assessment.ts:16-21`, and rewrite
  `audit-scoring.test.ts:59-75` against a per-project policy fixture. The
  Australia customer keeps its behaviour by setting `context_required` with its
  context terms; the migration note in the PR names that project.
- **UI.** The project edit panel, where aliases live
  (`components/projects/project-edit-panel.tsx:181-188`), gains a "Needs
  context to count as a mention" switch and a context-terms field per brand and
  competitor row, shown by default only for names the policy flagged.

## Eval and calibration

No embeddings and no model-written goldens: fixtures are inputs, metrics are
deterministic, thresholds are the acceptance.

- **Fixtures** (`services/api/test/fixtures/prompt-generation/`): six business
  contexts: regional school (Dehradun), local service (AC repair, Delhi),
  national D2C apparel, global B2B SaaS, marketplace, and a Japanese-language
  retailer; each with `geo_terms`. Plus recorded model responses for each
  fixture, captured once by an operator with the live script below, so the
  planner, admission, selection and distribution tests replay deterministically
  in CI with no provider.
- **Metrics** (`prompts/generation-metrics.ts`, also used for run provenance):
  located share (geo vocabulary), stage and intent coverage, per-offering
  coverage, near-duplicate rate (Jaccard ≥ 0.6 over binding tokens), opening
  3-gram concentration, category-restatement rate (all content tokens ⊆ offering
  + category tokens), branded and placeholder leakage, mean words.
- **Thresholds** (fail the eval, recorded in config): located share ≤ 0.10 for
  national/global, ≤ 0.35 regional, 0.30-0.60 local; all four stages present when
  count ≥ 8; no selected offering with zero prompts; near-duplicate rate ≤ 0.05;
  opening concentration ≤ 0.40; branded and placeholder leakage 0; mean words
  8-25; shortfall ≤ 10 % of the request at count 20 and 50.
- **Live calibration** (`scripts/eval-prompt-generation.ts`): operator-run only,
  gated by an explicit flag, fixtures × 1 run × count 20, writes metrics and
  the recorded responses to the Git-directory log; never in CI. Judge
  thresholds keep the existing `calibration.ts` report. Owner decision 8 sets the
  budget.

## Owner decisions needed

1. **Execution model.** Recommended: bounded sync with a 70 s deadline, batch
   concurrency 3 and partial staging. Alternative: a runner lane with run status
   and polling (bigger PR, schema change).
2. **Per-request cap.** Recommended: `max_count` 50 in both API and dialog.
3. **Location policy shares.** Recommended: local 0.5, regional 0.25,
   national/global 0; `service_areas` never used when the scope forbids it.
4. **Binding vocabulary.** Recommended: drop `service_areas` for generated and
   proposed text only; manual prompts and import keep it.
5. **Quick-generate brief.** Recommended: category, category terms, offerings
   and confirmed facets, business model, buyer type, market scope, language,
   country; no prose fields, sources, demand signals or competitors in the model
   input.
6. **Idempotency storage.** Recommended: key in `request` JSON, lookup by set
   within retention. Alternative: a column with a unique partial index (DDL).
7. **Entity-matching storage and defaults.** Recommended: `business_context.entity_matching`,
   `context_required` by default for common-word names, user override in the
   project edit panel. Alternative: columns on `brands` and `competitors`.
8. **Calibration budget.** Recommended: six fixtures × one run × count 20 per
   round, two rounds (before and after the planner change), operator-run.
9. **Dead request surface.** Recommended: remove `intents` and the `commerce`
   cohort from the generation request (replacement gate: no caller found in app,
   MCP or marketing tool data; the audit cohort filters are unaffected).
10. **Agent skill revision.** Recommended: v4 with optional `targeting` row
    keys and the niche-mode brief; the skill file is a packaged production input
    and its loader tests are the validation.

## Phases and acceptance criteria

| Phase | Change | Acceptance |
|---|---|---|
| 1 Hardening | H1-H6: cap, concurrency, deadline, partial retention, idempotency, narrow reads, customer copy | A failing third batch still stages the first two; a repeated key makes no model call; a 503 shows no env names; count 50 completes under the deadline in the replay harness |
| 2 Universe planner | Planner, brief, location policy, `location_unplanned`, distribution provenance, metrics module, replay fixtures | Regional-school fixture located share ≤ 0.35 and national fixture ≤ 0.10 in replay; every offering and stage covered at count 20; provenance carries `distribution` |
| 3 Agent alignment | Skill v4, `targeting` keys, Agent slots as cells, dialog and chat copy | A targeted row keeps its place; an untargeted v3 portfolio still admits; loader tests pass |
| 4 Brand matching | Policy, matcher, CJK segmentation, freeze, version bumps, UI, removal of the hardcoded rule | "target audience" is not a mention for a `context_required` Target; "Target store near me" with context term "store" is; a Japanese sentence names 小米; no `Australia` or `ambiguous_aliases` left in `src/` |
| 5 Calibration and docs | Live round, threshold review, feature docs | Metrics within thresholds on live output or thresholds revised with the owner |

## Tests

Add (each fails on the regression it names): location share by market scope
in the planner; `location_unplanned` admission with the model label recorded;
stage and offering coverage at count 20; partial retention after a non-parse
batch error; idempotent replay without a gateway call; deadline shortfall
reporting; narrow-read column list is never widened silently (a type-level
check, not a snapshot); context-window matching, exclusion phrases and dense
script segmentation; frozen policy read from the audit block; Agent `targeting`
rows round-trip into cells.

Remove or rewrite: `audit-scoring.test.ts:59-75` (asserts the compiled-in
customer rule); any dialog test asserting the env-variable copy; planner tests
that restate `markets` alternation once the planner is replaced.

## Documents to update

[visibility-prompt.md](../visibility-prompt.md) (generation and matching
sections, rewritten from shipped behaviour), [agents.md](../agents.md)
(handoff and skill revision), the `prompt_discovery` SKILL.md, the
[backlog](backlog.md) prompt-generation row, the [tracker](feature-review-tracker.md)
log and [ACTIVE.md](ACTIVE.md). Invariants need no new text: 2, 5, 9 and 12
already cover the policy, version bumps and labelled model classification.

## Risks

- A deadline that is too short on cold Cloud Run instances produces frequent
  shortfalls; the metric and `shortfall_reason` make this visible, and the lane
  fallback is defined.
- Concurrent batches raise peak provider rate-limit exposure; the gateway's
  429 handling is unchanged and concurrency is a config value.
- `context_required` defaults can hide genuine mentions of common-word brands
  until the user adds context terms; the project edit panel shows the flag and
  the seeded terms, and shadow comparison against `always` is in the calibration
  round.
- The CJK fix changes historical zero mentions into real counts only for new
  analyses; the analyzer version bump keeps old and new results apart.
- Dropping `service_areas` from the generated-text vocabulary could reject a
  local business's valid "near me" prompt that names no offering; the planned
  market facet keeps such cells bound through their offering.
