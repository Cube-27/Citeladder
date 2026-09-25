---
id: ai_visibility
label: AI visibility diagnosis
group: visibility
order: 8
version: 1
output_kind: diagnosis
description: Diagnose why a brand is absent, weakly cited, misrepresented or not recommended in CiteLadder AI results. Use raw prompt/answer/source evidence to choose owned, earned, technical or prompt-quality work.
---

# AI visibility diagnosis

Follow the operating contract. Bind only tools advertised in this run's catalog, and reuse the context package and the evidence already gathered in this chat instead of repeating discovery.

## Outcome

Identify the observed failure between a relevant buyer question and a useful, accurate appearance of the brand. Select the next intervention on its evidence, not a universal “AEO checklist.” Separate visibility measurement from speculation about a model's private retrieval/ranking process.

## Inputs and scope

Required for detailed diagnosis: actual prompt text/version, engine/surface, run status/time, answer text and observed citations/source references. A summary-only audit supports only a summary-level finding. Optional: repeated comparable runs, competitor mentions, source inspections, recorded fan-out queries/retrieved URLs, owned-page evidence, GSC, backlinks, referral traffic and business outcomes.

Discover available engines and surfaces; do not assume a fixed set of three. ChatGPT API output, a consumer ChatGPT search response, Google AI Mode and AI Overviews are not interchangeable samples. Preserve market/language and model/tool configuration where recorded.

## Bind the selection before diagnosing

Read audit state before selecting a baseline. If the newest audit is running or failed, use a separately returned completed comparable audit only when accessible, otherwise report the baseline gap. For each conclusion, open the actual answer and source evidence; an artifact reference is not its contents. Answer co-occurrence does not prove a competitor appears on the cited publisher page. Domain recurrence used to schedule inspections is not the citation count for the selected engine, cohort or period.

## Workflow

1. **Validate the measurement frame.** Read business context, prompt portfolio and audit coverage. Separate unbranded discovery, branded evaluation and informational/citation prompts. A high score on questions naming the business does not prove discovery. Check completed versus failed runs and whether the prompt/version/engine mix changed.
2. **Reconstruct observed outcomes per answer.** Record separately: retrieval/search evidence when actually exposed; explicit citation; brand mention; positive recommendation/shortlist inclusion; recommendation against; factual misstatement; and referral/conversion if independently measured. A cited article about the business is not automatically an endorsement. No citation does not prove the page was never retrieved.
3. **Read the decisive answer passages.** Check aliases/entity identity, context, negation and recommendation framing. Use compact exact excerpts as evidence. A competitor-like substring or a corporate name in an unrelated context is not a valid mention. Do not convert sentiment into recommendation without the actual decision wording.
4. **Build a source-role view.** Map observed citations and, separately, exposed retrieval URLs to domains, URL types, prompt decisions and engine/surface. Preserve hosting platform, publisher/author, content control and mentioned brands as different fields. A company-owned YouTube video is owned content hosted externally, not independent earned validation. Retain provider-specific source classifications rather than silently rewriting them.
5. **Measure scope correctly.** Count domain/URL usage as distinct observed prompt-run appearances with a declared denominator; also show distinct prompt decisions when useful. Deduplicate repeated citations within the same answer for usage rates while retaining citation-event counts separately. Do not call 50 citations from one repeated prompt 50 independent buyer needs. Keep recorded fan-out query strings, retrieved URLs and cited URLs distinct.
6. **Classify the failure and test alternatives.**
   - **Measurement mismatch:** weak/noncommercial/leading prompts, wrong geography or failed collection. Repair the portfolio/data before optimizing copy.
   - **Access/eligibility evidence:** a priority source is demonstrably blocked, broken or unusable. Route to technical verification; absence from an answer alone is not proof of blocked access.
   - **Answer/evidence gap:** owned content lacks a relevant, accurate explanation, proof or decision detail. Identify the exact page and missing information.
   - **Source-presence gap:** a frequently observed relevant independent source covers valid alternatives but omits or misstates the business. Inspect its inclusion criteria and editorial context before proposing outreach.
   - **Positioning/fit gap:** the answer recognizes the brand but finds a different option more suitable. Check whether the limitation is true. Improve explanation/proof or accept the real product limitation; do not write false superiority claims.
   - **Robustness/volatility:** appearances differ across runs, phrasings or surfaces. Inspect comparable repeated observations before treating one loss as a durable problem.
7. **Compare like-for-like competitors.** Keep direct business alternatives separate from publishers. Inspect which claims/criteria support their inclusion, not merely their mention counts. Use source content to form hypotheses about possible influence; citations do not reveal the engine's full causal ranking logic.
8. **Choose a targeted intervention.** Produce exact owned-page edits or content briefs, source-specific earned opportunities, verified technical tickets, entity-fact corrections or prompt-cohort changes. Every action names the buyer decision it should improve and the evidence gap it addresses. No generic “add schema,” “get Reddit mentions” or “publish 20 blogs” prescriptions.
9. **Define the follow-up.** Keep the core prompt/engine/locale panel stable. Record intervention dates and use comparable future runs through the Measure results skill. For Google AI Overviews, distinguish observed no-AIO from a provider error and report AIO occurrence separately from conditional brand/citation rates. Never exclude valid losing answers to improve the score.

## Decision rules

A useful source URL can be a citation opportunity without being a recommendation opportunity. Earned coverage can help a real buyer, but presence on a specific platform is not a guaranteed model signal. There is no universal evidence-backed citation paragraph length, schema bonus or source-type percentage. Do not create artificial “AI readiness” scores or forecasts from text alone. Preserve CiteLadder's measured metrics with their definitions; supplement them with explicit evidence, not a replacement vanity score.

For newer Google AI reporting, inspect current account/tool support. Do not assume legacy aggregate Web performance isolates AI traffic, and do not assume a newer UI report is exposed by the tool catalog. A generated answer containing no source URLs cannot support source-level analysis.

## Outputs

Produce `ai-visibility-diagnosis.md` and, when raw observations exist, `visibility-evidence.csv`:

```text
prompt_id, prompt_version, cohort, engine, surface, market,
run_id, observed_at, run_status, source_support_state,
brand_mentioned, recommendation_state, factual_issue,
answer_excerpt, cited_urls, exposed_retrieved_urls,
observed_fanout_queries, evidence_refs
```

The report contains baseline/cohort coverage, outcomes separated by type, evidence-backed failure modes, source/competitor gaps, prioritized actions with exact targets, counterevidence and a measurement plan. Null indicates unavailable, not false.

## Validation and stops

No raw evidence means no fabricated answer quotations, source lineage or recommendation judgments. Do not claim unseen retrieval chains. Check that rates use compatible valid denominators and that changing the prompt mix is disclosed. Pause source-specific conclusions if the source cannot be inspected. Route prompt gaps to the Prompt discovery skill, owned answers to the Create content skill, source gaps to the Earned authority skill, access defects to the Technical health skill, and measurement to the Measure results skill.
