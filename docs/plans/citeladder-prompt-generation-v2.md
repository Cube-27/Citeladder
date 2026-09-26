# Prompt generation v2: empty onboarding, direct prompt workflow, rebuilt generation

Status: active, owner-approved direction (26 September 2026). PR 1 in progress.
Scope: onboarding completion, the Prompts page workflow, and the quick **Generate
prompts** path. The agent-driven "Build with Agent" generation is phase 2 and is
out of scope (section 8).

## 1. Owner decisions (26 September 2026)

1. **Onboarding creates no prompts or topics.** A created project with an empty
   prompt set is valid. After **Create project** the user lands on Overview, which
   invites them to "Choose the questions you want to track".
2. **No completion worker.** Completion no longer does provider I/O, so it finalizes
   in the request transaction. The `brand_completion` task kind is retired.
3. **The current generation framework is flawed and is rebuilt, not patched.** Its
   onboarding path and every prompt-quality eval are removed in PR 1. The explicit
   Generate prompts pipeline keeps working until PR 3 replaces it in one cutover, so
   there is never a release without generation.
4. **Fewer clicks, fewer popups.** The Prompts page opens directly on prompt
   management (no separate "manage" step) and carries a **Launch audit** action.
5. **CSV import asks only for what users know.** Topic and prompt text. Theme,
   intent and cohort are internal generation vocabulary and are never required from
   the user. The import dialog offers a downloadable sample CSV.
6. **Generation shape.** Topics with subtopics; each prompt combines a product or
   offering, an attribute, a buyer intent and a funnel stage. Users can pick several
   topics in one Generate request.
7. **Review before tracking.** Generated prompts are proposals. The user multi-selects
   accept or reject; only accepted prompts become active and rejected ones are deleted.
   Overview's next-action order stays unchanged (connect GSC/GA4 first); the separate
   prompt setup card carries the empty-portfolio call to action.
8. **Quality comes from a filter.** The model overgenerates; JEV (TypeSafe System One)
   gates each candidate; code keeps the best. JEV is optional at runtime and tests
   never call it. Exact thresholds need iteration from live testing.

These reverse two documented rules, recorded in the PR that ships them:
onboarding's portfolio request (PR 1, `docs/onboarding.md`,
`docs/visibility-prompt.md`) and "generated rows are active immediately" plus
"no semantic quality judges" (PR 3, `docs/visibility-prompt.md`,
`docs/decisions.md`).

## 2. Review of the original draft

Corrections found against the repository before implementation:

- `backend/scripts/run_onboarding_eval.py` imported `generate_portfolio`; the draft
  did not list it. Per decision 3 and the owner's follow-up, the whole outdated
  onboarding eval framework (runner, golden and obscure-brand corpora, scorers,
  their tests and doc) is deleted.
- The draft kept the completion worker. Without provider I/O it only adds a queue
  hop, a polling state (`completing`) and a failure reconciler. Decision 2 removes it.
- The draft assumed "generated rows are active" stays. Decision 7 changes that: PR 3
  needs a proposed/pending prompt state and must keep proposals out of audit
  admission, capacity/occupancy charging and visibility denominators.
- Topics have no parent today (`Topic` has no hierarchy). Subtopics are a PR 3
  schema change, allowed in `0001_initial.py` under the pre-launch policy.
- `docs/visibility-prompt.md` states "no ... fuzzy-similarity quality judges", not
  "no semantic quality judges"; the edit target is that paragraph.
- The Generate dialog already recovers topics from confirmed offerings when a
  project has none, so an empty onboarding project can generate without extra work.
- Commerce catalog prompts run through `generate_prompts` with the `commerce`
  cohort. PR 3 must keep that path working or give it an explicit owner.

## 3. PR 1: remove onboarding generation, land on Overview

### Backend

- `onboarding/completion.py::complete_discovery` validates, persists domains,
  competitors, profile and the project shell with its empty
  `ONBOARDING_PROMPT_SET_NAME` set, and marks the discovery `project_created` /
  `complete` in the same transaction. `run_completion`, `_topic_context` and the
  research-field readers are deleted.
- `onboarding/service.py`: delete `_generate_confirmed_portfolio`,
  `_persist_generated_prompts`, `_generated_prompts`, `_generated_prompt`,
  `_generated_topics`, `_canonical_generated_topics`, `_category_vocabulary`.
- Delete `onboarding/portfolio_generation.py` and `onboarding/prompt_provenance.py`.
  Keep `topic_admission.py` (topic recovery imports it) and
  `structured_generation.py` (identity/competitor research import it).
- Retire `TASK_KIND_BRAND_COMPLETION`, `ERROR_BRAND_COMPLETION`,
  `WARNING_BRAND_COMPLETION_FAILED`, `completion_maximum_attempts`,
  `portfolio_generation_timeout_seconds`, `PORTFOLIO_GENERATION_TIMEOUT_MAX_SECONDS`
  and `topic_evidence_max_chars_per_page`, with their worker and reconciler branches.
- Legacy drain: a discovery left `completing` by a pre-deploy request, or its queued
  `brand_completion` task, finalizes the committed shell and never generates.
- Existing projects and their prompts are untouched.

### Evals

- Delete the onboarding eval framework: `scripts/run_onboarding_eval.py`,
  `evaluations/onboarding_*.py`, `tests/unit/test_onboarding_golden_eval.py`,
  `tests/unit/test_onboarding_obscure_eval.py` and
  `backend/docs/evaluations/onboarding-golden.md`. It was outdated and unused.

### Frontend

- Onboarding: completion returns `project_created` immediately; drop the
  `completing` polling and copy.
- Overview "Your prompts" empty panel: heading "Choose the questions you want to
  track"; primary **Generate prompts** opens the Prompts page with the Generate
  dialog open; secondary goes to the Prompts page for manual add or CSV import.
- Prompts library empty state: same heading, primary **Generate prompts**,
  secondary **Add prompt** and **Import CSV**. No placeholder visibility score.

### Tests

- Delete `tests/unit/test_onboarding_portfolio_topics.py`.
- Rewrite `tests/component/test_brand_discovery_completion.py`: the project is
  created with an empty prompt set, zero topics and no model call; a same-key replay
  stays empty; a legacy `completing` row and a legacy queued task finalize without
  generating. Keep the atomicity, idempotency, isolation and no-crawl cases.
- Update worker/reconciler tests that exercised the completion task.

## 4. PR 2: direct Prompts workflow and simpler CSV import

- `/prompts` opens directly in management (library) mode; remove the extra
  "Manage prompts" step and its mode switch. Overview remains the read view.
- Add **Launch audit** to the Prompts page actions, reusing the existing audit
  launch owner and its admission/funding checks.
- CSV import: accept `topic,prompt` (header aliases stay tolerant). Theme, intent
  and cohort columns become optional and are ignored for user-facing validation;
  missing values take code defaults. A topic name that does not exist is created as
  a manual topic under the existing project lock. Offer a sample CSV download
  generated client-side from the same column contract the parser uses.
- Remove intent/cohort/theme from user-facing manual add where they are not needed.

## 5. PR 3: rebuilt quick generation with review and JEV gate

### 5.1 Model

- **Subtopics:** `Topic.parent_id` (nullable, same project, depth ≤ 1). Prompts bind to
  the most specific topic. Topic recovery produces topics from confirmed offerings;
  subtopics come from attributes/use cases in confirmed business context.
- **Proposed prompts:** a `proposed` prompt status. Proposals are excluded from audit
  admission, occupancy/capacity charging and visibility aggregates until accepted.
  Rejected proposals are deleted (owner decision, 26 September 2026).

### 5.2 Pipeline

```
Generate prompts (count N, topic_ids[] (multi), cohort)
  ├─ topics: selected, or recovered from confirmed offerings
  ├─ slots:  topic/subtopic × offering × attribute × intent × funnel stage,
  │          count = N × overgenerate_factor (factor 1 when JEV off)
  ├─ 1. GENERATE  batched model calls, one natural buyer question per slot
  ├─ 2. VALIDATE  parse, cohort identity, exact duplicates, topical binding
  │               (binding moves before the gate so JEV is not paid for rejects)
  ├─ 3. JEV GATE  per candidate, bounded concurrency
  ├─ 4. DISTINCT  per topic, sequential over ranked survivors
  ├─ 5. SELECT    top N preserving topic allocation; shortfall reported, no filler
  └─ 6. PROPOSE   insert as `proposed`; user accepts/rejects in bulk
```

The request keeps `POST /prompt-sets/{id}/generate` with additive fields
(`topic_ids`, `candidates_generated`, `rejected_by_gate`, `quality_gate`). Bump
`GENERATOR_VERSION` to `prompt-gen-v2`. Add a bulk review endpoint
(`POST /prompt-sets/{id}/prompts/review` with `accept_ids`/`reject_ids`) under the
existing prompt API and capacity checks.

### 5.3 JEV connector and gate

- Config `backend/app/core/config/jev.py`: `JEV_API_KEY` (SecretStr, blank = off),
  `JEV_BASE_URL`, `JEV_MODEL`, timeout, concurrency, max attempts. Add `JEV_API_KEY=`
  to `.env.example` and the deployment secret list without a value. Gate knobs
  (`jev_gate_enabled`, `overgenerate_factor`, thresholds, `jev_max_calls_per_generation`)
  live in `PromptGenerationSettings`.
- Connector `backend/app/connectors/jev.py`: thin httpx client modeled on
  `connectors/keenable.py` (`trust_env=False`, `ProviderError` mapping), one
  `decide(state, questions)` call to `POST /v1/systemone`. Retry 429/529/timeouts;
  never retry 401/422. Load `.agents/skills/typesafe-ai/SKILL.md` and verify field
  names against https://docs.typesafe.ai/api.md at implementation time.
- Gate `backend/app/domain/prompts/jev_gate.py`: `noul` gates `fits_business`,
  `buyer_relevant`, `natural`, `standalone`, `sensible` (starting threshold 0.60,
  `gate_score` = product); `choice` labels `intent` and `stage` recorded as evidence
  only; per-topic sequential `duplicate_of` distinctness. Core state omits brand and
  competitors. Any JEV failure after retries sets `quality_gate="unavailable"` and
  falls back to generation order; generation never fails because JEV is down.
- Per-prompt JEV evidence goes into `generation_evidence` JSONB (no migration for it).
  JEV calls are not charged to the agent-call abuse bucket.

### 5.4 UI

- Generate dialog: multi-select topics; result opens a review list with select-all,
  per-row checkboxes and **Accept selected** / **Reject selected**. One summary line
  when the gate ran: "Kept 20 of 58 candidates. Removed: 7 unnatural phrasing,
  4 duplicates, 3 nonsensical combinations."

### 5.5 Calibration

`backend/evaluations/prompt_gate_eval.py` (manual, not CI): generate with the gate
off for three fixture businesses, owner hand-labels ~200 candidates keep/drop with
a gate reason, run JEV and report per-gate precision/recall at 0.4–0.8. Record the
chosen thresholds in the PR. Acceptance: ≥ 80% keep/drop agreement and zero kept
prompts labelled nonsensical. Thresholds are expected to need further iteration.

### 5.6 Guardrails

- The JEV key stays server-side; never log it or full state bodies at info level.
- JEV receives the same private-context scope the generation model already gets.
- JEV only chooses among code-supplied prompts and labels; it cannot create them.
- No automatic retirement of existing prompts from JEV scores.
- Files stay within complexity ≤ 12 and ≤ 800 LOC; `generation.py` is near the cap,
  so new logic lives in new modules.

## 6. Documentation per PR

- PR 1: `docs/onboarding.md` (completion creates an empty prompt set synchronously),
  `docs/visibility-prompt.md` (remove onboarding portfolio request),
  `docs/architecture.md` capability row, `docs/workspace-access.md` handoff line,
  `docs/decisions.md` entry for the empty onboarding portfolio.
- PR 2: `docs/visibility-prompt.md` CSV contract and Prompts page actions.
- PR 3: `docs/visibility-prompt.md` generation and review, `docs/decisions.md`
  JEV entry.

## 7. Definition of done

PR 1
- [ ] Completion creates the project with an empty prompt set and zero topics in one
      request, makes no model call and starts no worker task.
- [ ] A legacy `completing` row or queued completion task finalizes without generating.
- [ ] Overview and the Prompts library empty states invite Generate prompts.
- [ ] Deleted modules, config, the onboarding eval framework and tests are gone,
      not wrapped.

PR 2
- [ ] `/prompts` has no separate manage step and offers Launch audit.
- [ ] A `topic,prompt` CSV imports; the sample CSV round-trips through the parser.

PR 3
- [ ] Multi-topic generation, subtopics, proposed status and bulk review ship.
- [ ] With `JEV_API_KEY` unset the gate is off and tests never call JEV.
- [ ] JEV failure degrades to `unavailable` and still returns proposals.
- [ ] Calibration recorded in the PR.

## 8. Later, not in this plan

- Phase 2: agent-driven "Build with Agent" generation using the `prompt_discovery`
  skill, reusing `jev_gate.py` for review. To be discussed with the owner.
- JEV for Site Health unresolved page kinds, internal-link suggestions and
  competitor-candidate cleanup; a shared decision service only once a third
  feature needs it.

## References

- TypeSafe API: https://docs.typesafe.ai/api.md; docs index https://docs.typesafe.ai/llms.txt
