# Prompt generation v2: empty onboarding, direct prompt workflow, rebuilt generation

Status: active, owner-approved direction (26 September 2026; revised the same day
after the prompt-universe and JEV feasibility research). PR 1 merged as `54e6f4b8`
(#161); PR 2 merged as `42c73cfe` (#162). PR 3a is implemented on
`prompt-gen-v2-pr3a`; model-suggested map entries and subtopic creation in the
topic rail are left to PR 3b, which produces and consumes them.
Scope: onboarding completion, the Prompts page workflow, and the quick **Generate
prompts** path. The agent-driven "Build with Agent" generation is phase 2 and is
out of scope (section 9).

## 1. Owner decisions (26 September 2026)

1. **Onboarding creates no prompts or topics.** A created project with an empty
   prompt set is valid. After **Create project** the user lands on Overview, which
   invites them to "Choose the questions you want to track".
2. **No completion worker.** Completion no longer does provider I/O, so it finalizes
   in the request transaction. The `brand_completion` task kind is retired.
3. **The current generation framework is flawed and is rebuilt, not patched.** Its
   onboarding path and the onboarding eval framework are removed in PR 1. The explicit
   Generate prompts pipeline keeps working until PR 3b replaces it in one cutover, so
   there is never a release without generation. The rebuild keeps the parts that are
   sound: prompt slots, topic ownership, cohort rules, brand/competitor rules, exact
   duplicate handling, topical binding, capacity/locking and generation provenance.
4. **Fewer clicks, fewer popups.** The Prompts page opens directly on prompt
   management (no separate "manage" step) and carries a **Launch audit** action.
5. **CSV import asks only for what users know.** Topic and prompt text. Theme,
   intent and cohort are internal generation vocabulary and are never required from
   the user. The import dialog offers a downloadable sample CSV.
6. **Generation shape.** A structured business map drives generation: offerings ×
   attribute × situation or constraint × buyer intent × funnel stage × market, using
   only **compatible** combinations, never the full Cartesian product. Topics have
   subtopics. Users can pick several topics in one Generate request.
7. **Review before tracking.** Generated prompts are candidates. The user multi-selects
   accept or reject; only accepted candidates become active prompts and rejected
   candidates are deleted. Overview's next-action order stays unchanged (connect
   GSC/GA4 first); the separate prompt setup card carries the empty-portfolio call to
   action.
8. **Quality comes from a filter, introduced carefully.** The model overgenerates
   candidates; deterministic admission runs first; JEV (TypeSafe System One) then
   answers bounded questions about each candidate. JEV starts in **shadow mode**
   (recorded and used for ranking/flags, never dropping anything) and becomes a hard
   gate only after calibration against real user accept/reject decisions.
9. **Tracked portfolio, not a universe.** CiteLadder tracks a small representative
   set (tens of prompts). It never presents a generated candidate count as market
   size, and GSC impressions are never presented as AI-prompt volume.
10. **Policy first.** JEV is a new processor of customer data (business context,
    private GSC query text). Production must not send customer data to JEV until the
    privacy/subprocessor policy revision in PR 3c is approved and published.

These reverse documented rules, recorded in the PR that ships them: onboarding's
portfolio request (PR 1), "generated rows are active immediately" (PR 3a) and "no
... quality judges" (PR 3b shadow recording, PR 3c gating) in
`docs/visibility-prompt.md` and `docs/decisions.md`.

## 2. Review notes against the repository

- The whole outdated onboarding eval framework is deleted in PR 1 (owner follow-up).
- The completion worker is removed in PR 1; a legacy drain finalizes pre-deploy
  `completing` rows and `brand_completion` tasks.
- **Candidates live outside `Prompt`.** A `proposed` status on `Prompt` would force
  every audit, capacity/occupancy and visibility query to exclude proposals, and one
  miss corrupts measurement. A separate candidate table means a prompt exists only
  once accepted.
- Topics have no parent today (`Topic` has no hierarchy). Subtopics are a schema
  change, allowed in `migrations/versions/0001_initial.py` under the pre-launch policy.
- `BusinessContext` already carries offerings (`products_services`), buyer roles,
  service areas, jobs to be done and category terms. It lacks per-offering
  attributes, situations and constraints, and any compatibility structure.
- The Generate dialog already recovers topics from confirmed offerings when a project
  has none.
- Commerce catalog prompts run through `generate_prompts` with the `commerce` cohort.
  PR 3b must keep that path working or give it an explicit owner.
- `docs/visibility-prompt.md` states "no ... fuzzy-similarity quality judges"; that
  paragraph is the edit target when JEV lands.

## 3. PR 1 (merged #161): remove onboarding generation, land on Overview

Completion creates the project with an empty prompt set in one request (no model
call, topics or worker task); legacy `completing` rows and queued completion tasks
finalize without generating. Command Center exposes `active_prompt_count` (active and
enabled prompts); Overview shows the prompt setup card when it is zero; Prompts empty
states lead with Generate prompts and `?generate=1` opens the dialog once per request.
The onboarding eval framework and portfolio-generation code are deleted.

## 4. PR 2: direct Prompts workflow and simpler CSV import

- `/prompts` opens directly in management (library) mode; remove the extra
  "Manage prompts" step, the `mode=manage` switch and the separate read view
  (`your-prompts.tsx`) unless something it shows (latest measurements per prompt)
  has no other home; if it does, fold it into the library table. Update every link
  that carries `mode=manage` (`frontend/lib/prompts/routes.ts`, Command Center
  `configure_prompts` href, Overview setup card).
- Add **Launch audit** to the Prompts page actions, reusing the existing
  `LaunchAuditButton` owner and its admission/funding checks; disabled with no
  active prompts.
- CSV import: accept `topic,prompt` (header aliases stay tolerant). Theme, intent and
  cohort columns become optional, are never required and never produce user-facing
  validation errors; missing values take code defaults. A topic name that does not
  exist is created as a manual topic under the existing project lock; an empty topic
  cell imports unassigned. Offer a **Download sample CSV** generated client-side from
  the same column contract the parser uses (one constant owner, not two copies).
- Manual add/edit: topic and prompt text only; drop user-facing intent/cohort/theme
  fields where they are not needed (code defaults apply).
- Keep the `?generate=1` one-shot behavior on the new route.

## 5. PR 3a: business map, candidate staging and review

- **Editable business map** under Projects' `BusinessContext`: per offering, its
  attributes, situations/constraints and audiences, plus which combinations are
  compatible. A model may suggest entries, but they are stored as unreviewed
  suggestions with provenance and are visible and editable on the brand/business
  screen; generation uses confirmed entries first. Unknown stays absent, never padded.
- **Subtopics:** `Topic.parent_id` (nullable, same project, depth ≤ 1). Prompts bind to
  the most specific topic.
- **Candidate staging:** `PromptGenerationRun` (workspace, project, prompt set,
  request, generator version, provenance) and `PromptCandidate` (run, text, topic,
  slot, evidence refs, deterministic validation result, JEV decision JSON, disposition).
  Candidates are never audited, never charged to prompt capacity and never counted in
  visibility. Workspace-authorized like every project-owned row.
- **Review endpoint:** `POST /prompt-sets/{id}/candidates/review` with
  `accept_ids` / `reject_ids`. Accept re-runs occupancy/capacity and the
  conflict-safe insert under the existing locks, copying candidate provenance into
  `generation_evidence`; reject deletes the candidates. Unreviewed candidates expire
  after a configured retention (config-owned).
- **Review UI:** the Generate result becomes a review list with select-all, per-row
  checkboxes, **Accept selected** / **Reject selected**.
- Generation in this PR still uses the current pipeline but writes candidates instead
  of active prompts.

## 6. PR 3b: rebuilt generation on the business map, JEV in shadow mode

### 6.1 Pipeline

```
Generate prompts (count N, topic_ids[] (multi), cohort)
  ├─ topics: selected, or recovered from confirmed offerings
  ├─ cells:  compatible offering × attribute × situation/constraint × intent
  │          × funnel stage × market from the business map; N × overgenerate_factor
  ├─ 1. GENERATE  batched model calls, one natural buyer question per cell
  ├─ 2. ADMIT     parse, cohort identity, brand/competitor rules, length, exact
  │               duplicates, topical binding (all before any JEV call)
  ├─ 3. JEV       shadow: record decisions per candidate, bounded concurrency
  ├─ 4. SELECT    top N diversified across topic, stage, audience and market;
  │               shortfall reported, no filler
  └─ 5. STAGE     write PromptCandidate rows; user reviews (PR 3a)
```

Keep `POST /prompt-sets/{id}/generate` with additive fields (`topic_ids`,
`candidates_generated`, `quality_gate`). Bump `GENERATOR_VERSION` to `prompt-gen-v2`.
Evidence (GSC queries, site facts, existing gaps) grounds candidates but is never
copied verbatim into tracked prompts.

### 6.2 JEV connector and questions

- Config `backend/app/core/config/jev.py`: `JEV_API_KEY` (SecretStr, blank = off),
  `JEV_BASE_URL`, `JEV_MODEL`, timeout, concurrency, max attempts. Add `JEV_API_KEY=`
  to `.env.example` and the deployment secret list **without a value**. Production
  keeps it unset until PR 3c's policy revision is published (decision 10).
- Connector `backend/app/connectors/jev.py`: thin httpx client modeled on
  `connectors/keenable.py` (`trust_env=False`, `ProviderError` mapping), one
  `decide(state, questions)` call to `POST /v1/systemone`. Retry 429/529/timeouts;
  never retry 401/422. Load `.agents/skills/typesafe-ai/SKILL.md` and verify field
  names against https://docs.typesafe.ai/api.md at implementation time.
- Questions (bounded; JEV never writes prompts, invents topics or checks facts code
  can check): `noul` fits_business, buyer_relevant, natural, standalone, sensible;
  `choice` intent and stage (labels recorded, the model label stays on the row);
  per-topic `choice` duplicate_of among accepted and higher-ranked candidates.
  Core state omits brand and competitors.
- Decisions store model version, per-question probabilities/confidence, question
  schema version and a `state_hash` in the candidate's decision JSON so identical
  judgments are not paid twice. No shared decision service, cache table or worker
  until a third feature needs JEV.
- Shadow mode: decisions rank candidates and flag weak ones in the review list; none
  are dropped. JEV failure sets `quality_gate="unavailable"`; generation never fails
  because JEV is down. JEV calls are not charged to the agent-call abuse bucket; a
  config cap `jev_max_calls_per_generation` bounds them.

## 7. PR 3c: policy revision and JEV hard gate

- **Policy revision (lands first in this PR; publication needs owner/legal
  approval):** add TypeSafe as a subprocessor on `/subprocessors`
  (`frontend/lib/marketing-content/legal*.ts`), describe the prompt-quality judgment
  and the data it receives (business context, candidate text, private GSC query
  text) in the Privacy notice and AI policy, and bump `PRIVACY_NOTICE_REVISION` in
  `backend/app/core/config/legal.py` only when the revision is actually published,
  preserving prior acceptance evidence. Confirm TypeSafe's data retention, privacy
  terms, region, rate limits and pricing before publishing.
- **Calibration from real decisions:** join JEV decisions with user accept/reject
  outcomes on staged candidates (plus an owner-labelled sample if coverage is thin);
  report per-question precision, false-reject and false-accept rates, and agreement by
  business category. Record chosen thresholds in the PR; no results doc.
- **Hard gate:** strong fail → rejected before review; uncertain → shown flagged;
  strong pass → eligible. Thresholds are config-owned and versioned; historical
  generation evidence is never rewritten.
- Only after the policy is published: set `JEV_API_KEY` in production.

## 8. Guardrails and documentation

- JEV key server-side only; never log it or full state bodies at info level.
- JEV receives no more private context than the generation model already gets.
- JEV probabilities are signals about the question asked, never business scores.
- No automatic retirement of existing prompts from JEV decisions.
- Files stay within complexity ≤ 12 and ≤ 800 LOC; new logic lives in new modules.
- Docs per PR: PR 2 `docs/visibility-prompt.md` (CSV contract, Prompts actions);
  PR 3a visibility-prompt (candidates and review) and `docs/decisions.md`; PR 3b
  visibility-prompt (business-map generation, JEV shadow); PR 3c visibility-prompt
  (gate), decisions entry for JEV, legal pages.

## 9. Definition of done

PR 2
- [x] `/prompts` has no separate manage step and offers Launch audit.
- [x] A `topic,prompt` CSV imports; the sample CSV round-trips through the parser.
- [x] Manual add asks only for topic and prompt.

PR 3a
- [x] Business map entries are editable and carry provenance.
- [x] Generated prompts land as candidates; accept inserts, reject deletes.
- [x] Candidates never reach audits, capacity or visibility (tested at PostgreSQL).

PR 3b
- [ ] Multi-topic generation from compatible business-map cells.
- [ ] JEV decisions recorded in shadow; unset key means off; tests never call JEV.

PR 3c
- [ ] Policy revision approved and published before production JEV traffic.
- [ ] Calibration recorded; hard gate enabled with versioned thresholds.

## 10. Later, not in this plan

- Phase 2: agent-driven "Build with Agent" generation using the `prompt_discovery`
  skill, reusing the JEV questions for review. To be discussed with the owner.
- JEV advisory semantic-quality observations for Site Health (after crawl
  finalization, persisted separately, never folded into deterministic scores without
  human validation); internal-link suggestions; competitor-candidate cleanup.
- A stable-core plus experimental split in the tracked portfolio.

## References

- TypeSafe API: https://docs.typesafe.ai/api.md; docs index https://docs.typesafe.ai/llms.txt
