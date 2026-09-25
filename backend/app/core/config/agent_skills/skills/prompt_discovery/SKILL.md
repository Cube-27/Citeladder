---
id: prompt_discovery
label: Prompt discovery
group: demand
order: 4
version: 1
output_kind: prompt_portfolio
description: Create or improve the buyer questions tracked in AI visibility engines from CiteLadder business, demand and competitor evidence. Use for prompt portfolios, prompt quality audits and topic coverage; not ordinary task-prompt writing.
---

# Buyer prompt discovery

Follow the operating contract. Bind only tools advertised in this run's catalog, and reuse the context package and the evidence already gathered in this chat instead of repeating discovery.

## Outcome

Build a realistic, non-leading portfolio of buyer questions worth monitoring across the project's actual AI engines. The output must measure whether relevant buyers discover, evaluate and choose the business, not manufacture easy mentions. Generate buyer demand, not variations on marketing copy. This is an analysis skill: it proposes prompts; it does not activate prompts or run engine tests. The user adds accepted prompts in Prompts.

## Required and optional inputs

Required: confirmed offer, actual buyer/user, served geography/language and project scope. Recover these from business context and relevant owned pages. Optional: GSC query/page rows, provider keyword/SERP snapshots, existing prompt IDs/results, competitor set, sales/support questions, buyer interviews and observed query fan-outs. Private customer questions may inform abstraction but must not be exposed verbatim without approval.

Before generating, inspect current prompt settings and available import/write schema, if any. Do not hardcode an engine count, a competitor count, language, geography or plan capacity. With no demand observations, produce a clearly labelled hypothesis portfolio rather than “the questions buyers ask.”

## Preserve the portfolio boundary

The business-context read caps active prompts at 50. An omission warning means portfolio coverage is incomplete; page through `read_prompt_portfolio` before claiming duplicates or gaps across the full set. Keep the user's accepted competitor roster separate from new research suggestions. Carry stable evidence, topic and cohort identifiers into the proposal where returned. New prompts are proposed tracking questions, not measured AI demand and not activated prompts.

## 1. Build the decision model before wording prompts

Create an evidence-backed map:

`audience → job/problem → relevant offer → topic → decision intent → constraints → evidence`

Topic is a coherent buyer need, not a bag of similar keywords. Intent must be established **before** prompt generation. Distinguish category discovery, shortlisting, suitability, comparison, price/value, implementation/use and factual brand evaluation. A phrase such as “how to” does not by itself determine buying stage. A business offering several products needs offer-specific coverage, not the same question with nouns swapped.

Identify which constraints actually change the choice: geography, delivery model, budget, size, eligibility, compatibility, use context or specialist requirement. Do not add all constraints to every prompt. Use one natural decision per question, with additional context only when a real buyer would supply it.

## 2. Extract and classify demand evidence

Read existing prompts and deduplicate by buyer decision, not just string similarity. Extract language from usable first-party queries/questions and relevant public evidence. Separate:

- **Observed:** the source actually contains this buyer need or question.
- **Grounded expansion:** a natural question derived from an observed need and confirmed offer.
- **Hypothesis:** plausible demand without direct observation.

Keyword search volume measures a provider's estimate of search demand, not the number of people asking an AI prompt. Never attach a Google keyword volume to a generated prompt as “AI prompt volume.” Query fan-outs are observed retrieval queries only when the provider exposes them. Predicted subquestions are labelled inferred and kept separate.

Use competitor and SERP evidence to understand alternatives and decision criteria, not to assume every ranking publisher is a business competitor. Exclude irrelevant markets, services the business does not offer, and manufactured capabilities.

## 3. Draft three separated cohorts

**Unbranded discovery/selection core.** Buyer questions where an answer could naturally recommend or compare named organizations/products without being told to mention the target business. Cover the commercial decisions relevant to this business. Examples of forms, not templates to fill mechanically: selecting a provider for a specific need, finding appropriate options in a served market, choosing between approaches under a real constraint, or asking which products satisfy a documented requirement. The target brand must not appear in this core.

**Branded evaluation diagnostic.** Questions about a known target brand, comparison with a genuine alternative, limitations, pricing or suitability. Keep separate because the wording already supplies the brand; mention rate here is not evidence of discovery.

**Informational citation diagnostic.** Buyer-relevant practical/factual questions where naming brands may be unnatural but citing useful owned evidence would be valuable. Admit only when tied to a commercially relevant task or owned asset. Do not fill the main visibility benchmark with general definitions that rarely produce brand recommendations.

Allocate space according to business priorities and independent decision coverage, not mandatory percentages. A request for 20 prompts is a target, not permission to add weak duplicates. With no count specified, propose the smallest useful starter portfolio; often 12–20 is manageable, but this is a workflow heuristic. Explain a smaller or larger choice. Do not enforce a minimum number of competitors.

## 4. Quality review and selective interaction

For each candidate test:

1. **Truth:** Does it depend only on confirmed offers/markets? Are private details removed?
2. **Plausibility:** Would a buyer naturally ask this, without SEO/AEO jargon or a command to flatter the business?
3. **Decision value:** Could the answer change discovery, a shortlist, purchase confidence or use success?
4. **Answerability:** Is the question sufficiently clear without artificial specificity or missing critical geography?
5. **Natural brand opportunity:** For a core prompt, could a useful answer naturally name alternatives? This is an expectation, not a guarantee.
6. **Distinctness:** Does it add a different decision or meaningful constraint rather than a paraphrase?
7. **Evidence:** Is it observed, grounded expansion or hypothesis, with a traceable source?
8. **Evaluability:** Can mention, recommendation, citation or factual correctness be judged consistently?

Reject leading prompts such as “Why is [our brand] the best?”, exhaustive checklist prompts no real buyer would ask, arbitrary future-year additions, and prompts selected simply because the brand wins. Keep a compact rejection log with replacement reasons.

If unresolved business priorities materially affect the portfolio, ask one batch of focused questions and show the draft coverage map first. Otherwise complete the portfolio with clearly stated assumptions. The user need not approve every intermediate stage.

## 5. Pilot without contaminating the benchmark

A draft is not a tested portfolio. When the user authorizes a paid pilot and appropriate tools exist, show proposed prompt count × engines × repeats and estimated/unknown cost first. Evaluate all selected candidates under the same declared conditions. Record failures, no-answer/no-AIO states, citation support and brand-bearing answer frequency. Do not rerun only failures until they become wins.

Low brand occurrence across **all** alternatives can indicate a weak recommendation prompt, but it may also reflect a useful citation-only intent. Diagnose that distinction. Absence of the target brand is often the very gap to track and is not a reason to discard a relevant prompt. Do not reward a model for inserting brands into unnatural informational answers.

Use paraphrases only as a separate robustness sample linked to a parent decision. They are correlated observations, not extra independent market demand. Never include diagnostic variants in the core trend denominator by accident.

## 6. Version the portfolio

Produce keep/revise/add/archive proposals against existing IDs. Keep stable IDs for unchanged wording, intent and locale. A material wording/intent change gets a new version or new ID with a mapping to its predecessor; never rewrite historical observations. Freeze the approved core during an intervention and report exploratory additions separately. Approval to generate a list is not approval to replace active tracking.

## Outputs

Create `prompt-portfolio.md`, `prompt-portfolio.csv` and `prompt-portfolio.json`:

```text
prompt_id, parent_decision_id, topic, audience, offer, intent, cohort,
prompt_text, language, market, material_constraints,
evidence_type, evidence_refs, business_rationale,
expected_answer_behavior, primary_success_metric,
existing_prompt_id, proposed_action, version, validation_status
```

Use proposal-local IDs for new rows; do not fabricate backend IDs. `validation_status` is `draft`, `reviewed-unrun` or `pilot-observed`, with supporting run references for the last. `expected_answer_behavior` might be shortlist, comparison, factual evaluation or citation-supported answer. Preserve nulls for unknown values.

The report contains the coverage map, final prompts grouped by topic/cohort, meaningful gaps, removals/revisions, pilot status, how to add them in Prompts and measurement rules. The prompt records are a review table, not an import that runs by itself.

## Validation and failure conditions

Every core prompt must be unbranded and commercially relevant, with a distinct decision and explicit evidence status. Do not insert fake observed customer phrasing. Unknown company scope blocks a tailored portfolio; unknown engine access blocks testing, not drafting. Missing demand data lowers confidence but is not a reason to hallucinate volumes. Route portfolio analysis to the AI visibility diagnosis skill, content opportunities to the Search opportunities skill, and baseline/versions to the Measure results skill.
