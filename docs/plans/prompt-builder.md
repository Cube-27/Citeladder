# Prompt Builder

Status: proposed on 1 November 2026. The owner settled decisions A–D the same day
(see [Owner decisions](#owner-decisions)). PR 1 (generation quality) is in
progress; PRs 2 and 3 follow it in order.

## Why

Prompt generation is the product's most important feature, and the
thenetreturn.com review showed it falls short in two ways.

**Quality.** In a 20-prompt run:

- 15 prompts open with "Which".
- The mean is 14.6 words, and one prompt runs to 23.
- 10 prompts repeat the offering label "golf practice net".
- 5 are "easy to set up" filler.
- The brand's defining product, a net that returns the ball, never appears.

**Flow.** Users can't steer generation from the Prompts screen:

- The Generate dialog asks only for a count and topics.
- Everything that shapes the prompts lives elsewhere:
  - the business map, under Agent → Context → Brand knowledge;
  - five fields (service areas, buyer roles, business model, category terms,
    jobs to be done) that no screen can edit after onboarding.
- "Build with Agent" leaves the page for a chat.

Defects confirmed in code (each one applies to every business type):

1. **Buyer constraints are never applied.**
   - `generation-plan.ts` adds a facet only after a topic has more cells than
     there are stages (4).
   - A default run (count 20 × 2 over 10 topics) gives each topic exactly 4
     cells, so all 40 drafts went out with no constraint.
   - The business map's 49 suggested values were never used.
2. **One cell in four plans an after-purchase question.** The "implementation"
   stage forces filler such as "which X is easy to set up".
3. **Topics copy product-line names verbatim.**
   - `recoverTopics` turns names like "Pro Series" and "No Fly Zone" into topics,
     whether or not anyone confirmed the offerings.
   - It stops silently at 10, which here dropped commercial simulator bays.
   - The offering label then leaks into prompts, e.g. "5x6 feet".
4. **Saving brand knowledge corrupts the offerings list.**
   - The panel joins offerings with commas and splits them on commas again, so
     "(golf courses, and community centers)" becomes two fake offerings.
   - Generation reads the corrupted list first.
5. **Near-duplicates get through.**
   - The judge compares a draft only with prompts in the same topic, never with
     pending candidates.
   - Cells for one topic are split across concurrent batches.
6. **Nothing caps length or checks the owner's bar.**
   - Admission checks only for 300 characters or fewer.
   - The judge never asks whether a business name answers the prompt.
   - The offline metric uses an 8–25 word window and measures openings over the
     first three words.

## What competitors do

Sources and details are in the 1 November research.

- **Peec:**
  1. A prefilled profile, shown as chips, plus a short override.
  2. Topics generated to fill gaps and reviewed before any prompt exists.
  3. A distribution step: 80% unbranded, intents 25/50/25.
  4. A coverage grid with "Generate more" per segment.
- **Searchable** has the strongest generator:
  - It plans how many prompts each question type gets, sized by business model.
  - Every candidate passes explicit quality gates.
  - It warns against turning SEO keywords straight into prompts.
- **Profound:**
  - Turns Search Console keywords into prompts with a model rewrite.
  - Users run about 10 prompts per topic and 5–15 topics.

None of them uses Search Console or keywords to seed prompts during onboarding.
Where they do use them, a model rewrites non-branded, question-like queries into
buyer prompts; none imports raw keywords.

## The flow

The Prompt Builder is a right-hand sheet that opens on the Prompts screen. It
replaces both the Generate dialog and "Build with Agent". Every step is prefilled
from saved data, so a returning user can go straight to Generate. There is no
markets step: places appear only when `market_scope` is local or regional, and
only from `service_areas`.

1. **About your business.** Prefilled from brand knowledge as editable chips:
   - What you sell (confirmed offerings, one chip each, which fixes defect 4).
   - Who buys it (buyer roles and audiences).
   - Situations and constraints (from the business map).
   - Service areas, shown only for local or regional businesses.
   - One short "anything else for this run" line, which applies to that run only.

   Edits save to the same brand profile and business map. Context keeps a
   read-only summary that links back here.
2. **Review topics.** Proposed topics, which the user renames, deletes or adds.
   - They are buyer-facing categories ("golf nets", "golf simulator
     enclosures"), deduplicated and brand-neutral.
   - They come from confirmed offerings plus keyword clusters, and are capped
     with a visible "+N more".
   - New proposals fill gaps in the existing topics and never replace them.
   - Nothing is written until the user confirms.
3. **Distribution.** The user controls the run end to end. Every control comes
   with a default that works for most businesses.
   - **Branded vs unbranded share**, default 80/20. Branded prompts use the
     existing `brand_diagnostic` cohort.
   - **Competitor-alternative share**, which uses the existing `comparison`
     cohort.
   - **Intent mix**: informational, commercial and transactional, default
     25/50/25.
   - **Personas to balance across**, chosen from step 1.
   - **Search data**: choose Search Console, Search Intelligence or none,
     whichever is connected.
     - The step lists the non-branded, question-like queries it would ground on,
       grouped by topic, and the user can untick any of them.
     - Seeds steer wording only. A query is never copied, and an impression
       count is never shown as "AI volume".
   - **Number of prompts.**
4. **Generate and review.** The run opens in the existing candidate review.
   - Review gains a coverage line per topic against the distribution, showing
     on target, short or empty.
   - "Generate more" can target one topic or one segment.

## Pipeline changes (applying to every business)

- **Cells:**
  - Every cell carries exactly one constraint or audience from the topic's map
    from the first cell onward (fixes defect 1).
  - The buyer stage becomes a label, not a filler dimension.
  - The implementation stage leaves core planning (fixes defect 2).
- **Topics** come from a new preview endpoint that the builder calls.
  - It makes a model proposal and filters it deterministically:
    - confirmed offerings only;
    - brand, alias and product-line terms removed;
    - near-duplicates merged.
  - Generation no longer creates topics silently (fixes defect 3).
- **Admission:**
  - A word cap (decision A).
  - A deterministic near-duplicate check across topics and against pending
    candidates, reusing `generation-metrics` overlap (fixes defect 5).
  - All cells for one topic go in one batch.
- **Drafting instructions:**
  - Examples show different jobs a query can do, not one sentence frame.
  - The offering label is a hint, not text to repeat.
- **Judge:** add an "answerable by naming a business" question, then calibrate it.
- **Per-run input:** the generate request gains `run_context`, the distribution
  (branded share, comparison share, intent mix, personas), `seed_source` and
  `seed_query_ids`.
  - All of them are covered by idempotency and frozen into provenance.
  - Planning allocates cells to match the distribution.
- **Unchanged:**
  - Candidates are staged, and only Accept activates them.
  - The judge's quality gate stays on by default.
  - A shortfall is reported, never filled.
  - Map suggestions stay suggested until a person confirms them.
  - Onboarding creates no prompts.

## Context page

- Company facts moves above Agent instructions.
- Brand facts moves inside the tabbed panel as its own tab. It currently sits
  after the panel, so it appears under every tab.
- Business map editing moves to the Prompt Builder.
- The five onboarding-only fields become editable in the builder.

## Agent and MCP

The `prompt_discovery` skill stays, so MCP clients can generate prompts. It will
run the builder's steps through the same endpoints:

1. business facts;
2. topic preview, then confirm;
3. distribution and seeds;
4. generate, then the user reviews in Prompts.

The skill no longer writes prompt text or a JSON proposal of its own. That
retires the proposal parser, its "Portfolio requires one JSON proposal" failure,
and the topic-ID leak in Copy/Export. All wording rules then live in one place,
the generation config. Plugin twins stay at parity.

## PRs

1. **Generation quality**, with no UI change:
   - fixes defects 1–6 and the comma bug (offerings become a list input);
   - adds the 16-word cap and the judge question;
   - adds distribution-aware planning behind the generate request.
2. **Prompt Builder:**
   - the topic-preview endpoint;
   - the sheet with its four steps, run context, distribution and seeds;
   - coverage and segment "Generate more" in review;
   - removes the Generate dialog and the "Build with Agent" menu item.
3. **Context page and Agent:**
   - the Context layout fixes;
   - the editable onboarding-only fields;
   - `prompt_discovery` rebuilt on the builder endpoints, with plugin parity.

## Follow-ups

- **Calibrate the judge's "answerable by naming a business" question.** PR 1
  ships it with provisional thresholds (`JEV_ANSWERABLE_FLAG_BELOW`,
  `JEV_ANSWERABLE_FAIL_BELOW`); set them from review outcomes with the
  calibration report once live runs exist.
- **Calibrate the near-duplicate threshold** (`near_duplicate_jaccard`) against
  the same review outcomes.

## Owner decisions

All four were settled on 1 November 2026 and are recorded in
[decisions](../decisions.md) with the PR that relies on them.

- **A. Word cap.** Admission drops drafts over 16 words, and the run result
  reports them.
  - The owner cited query-length data: traditional search averages about 4
    words, and conversational AI queries about 7.
  - The drafting examples centre on 6–12 words.
  - `docs/visibility-prompt.md` changes accordingly.
- **B. Topics** are buyer-facing categories, not product-line names.
- **C. Agent.** Keep `prompt_discovery` for MCP use, as close to the builder flow
  as possible.
- **D. Control.** The builder lets the user control generation end to end:
  - topics, search queries and their source;
  - distribution (branded/unbranded, intent, cohort);
  - context (personas, services).

  This replaces the earlier rule that users are never asked for theme, intent or
  cohort.
