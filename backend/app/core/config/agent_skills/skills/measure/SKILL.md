---
id: measure
label: Measure results
group: strategy
order: 2
version: 1
output_kind: measurement
description: Measure SEO and AI visibility interventions using stable CiteLadder cohorts, baselines and evidence. Use for experiment design, before-after reviews and weekly decisions; not guaranteed attribution or automatic scheduling.
---

# Baselines, experiments and result review

Follow the operating contract. Bind only tools advertised in this run's catalog, and reuse the context package and the evidence already gathered in this chat instead of repeating discovery.

## Outcome and inputs

State whether an implemented intervention produced an observed meaningful change, what remains uncertain, and what should happen next. If no intervention or follow-up exists, deliver an experiment plan and baseline. Do not imply that running this skill schedules future monitoring.

Required: selected project, a specific outcome or intervention, and usable baseline data for quantitative analysis. Optional: exact publication/change log, follow-up series, control pages/cohorts, prompt versions, engine settings, conversions/revenue and crawl/index observations.

## Resume from the actual intervention record

Read the Action's implementation declaration, its verification observations and the earlier outputs in this chat, not a generic prior report title. Confirm the same project, page/asset, changed fields, implementation time, prompt version and measurement configuration. Separate deployment verification, placement verification and observed performance movement. Return “no material action established” when that is what the evidence supports. Never choose only the most favorable time window or omit a failed run from the comparison record.

## Workflow

1. **Define the unit and question.** Name the page/cohort, buyer decision or source target; intervention; mechanism as a hypothesis; primary metric; guardrail; expected observation conditions. Do not use one combined visibility score as the only outcome. Without revenue data, label a proxy instead of inventing commercial attribution.
2. **Record implementation truth.** A drafted edit is not an implemented treatment. Capture source-patch, deployment and live-verification timestamps separately where available. A content change cannot be evaluated from runs completed before it was live or before plausible discovery/recrawl exposure; record this uncertainty rather than guessing a fixed delay.
3. **Freeze a comparable baseline.** Preserve actual dates, snapshots, URLs, prompt IDs/versions, engines/surfaces, locale, provider configuration, successful/failed runs and data coverage. Default to matched complete 28-day windows for search and a stable repeated panel for AI, adjusted to volume, seasonality and expected acquisition latency. These are workflow choices, not universal statistical requirements.
4. **Choose comparison rigor.** When feasible, define matched untreated pages or staggered rollout and preserve pre-period trends. Randomized or well-designed controlled interventions support stronger inference than uncontrolled before/after. Even a control group may be confounded. When only before/after is available, explicitly limit the conclusion to an observed association and document concurrent campaigns, releases and updates.
5. **Define denominators before examining wins.** For search, use compatible totals/dimensions and calculated CTR, not averages of percentages. For AI, separate brand mentions, owned citations, recommendations and recommendation-against. Track counts over valid, observable answers for each metric; missing source telemetry is not zero citations. Record all failed attempts separately. For AI Overviews show AIO occurrence among valid checked SERPs and, separately, outcome rates among observed AIOs. A correctly observed absence of AIO may count against total opportunity exposure; it must not be confused with a provider failure.
6. **Keep cohorts stable.** Report unchanged prompt/engine/locale intersections separately from new or retired prompts. Changing wording creates a versioned cohort break. Branded diagnostics do not join the unbranded discovery denominator. Do not weight a decision more heavily just because it has many paraphrases or retries. State whether aggregation is equal per decision, per answer or another explicit scheme.
7. **Calculate interpretable change.** Show baseline numerator/denominator and rate, follow-up numerator/denominator and rate, absolute percentage-point change and relative change only when baseline is nonzero. Use real compatible observations. For example, 8/20 to 10/20 is +10 percentage points, not +10%; this is an arithmetic illustration, not company data. Do not call a larger proportion statistically significant without a suitable analysis.
8. **Assess uncertainty honestly.** Small samples, repeated correlated phrasings, model changes and engine variability limit inference. Do not use each citation or each paraphrase as an independent sample. With adequate data, estimate uncertainty using an appropriate paired/cluster-aware method and explain its assumptions. Otherwise present counts, repeated-run consistency and limitations; avoid decorative confidence intervals or made-up success probabilities.
9. **Apply declared decision rules.** State the minimum business-relevant improvement, acceptable risk and minimum observation condition before results where possible. If no owner threshold exists, propose one based on baseline and cost, label it provisional and avoid pretending it was preregistered. Immediate rollback is appropriate for verified broken journeys, accidental noindex or material false claims; inconclusive visibility evidence normally calls for more observation or a better design, not frantic rewrites.
10. **Recommend one next action.** `continue`, `expand cautiously`, `revise`, `rollback` or `inconclusive`. Tie it to primary outcome and guardrail evidence. Track backlink publication, source reuse, search performance and business outcomes as separate stages; do not equate a placement with revenue.

## Outputs

`experiment-plan.md` when work is planned:

```text
intervention_id; target/cohort; business goal; hypothesis;
baseline IDs/windows/values; exact proposed treatment;
implementation/live-verification conditions; comparison design;
primary metric and denominator; guardrails; observation rule;
minimum meaningful change; decision/stop rules; known confounders.
```

`results-review.md` when follow-up exists:

```text
what was actually implemented; compatible baseline and follow-up;
counts/rates/absolute changes; coverage/failure/cohort changes;
comparison/control result if available; uncertainty/confounders;
observed result versus causal claim; decision and next action.
```

`measurement-log.csv` if useful:

```text
intervention_id, target, treatment_version, deployed_at,
verified_live_at, baseline_ref, followup_ref, metric,
numerator, denominator, period, comparison_design,
coverage, guardrail_state, decision, evidence_refs
```

## Validation and stops

Do not measure a draft as a published intervention. No missing-as-zero, denominator switching, cherry-picked reruns or silently dropped losing prompts. Data freshness, source support and cohort comparability must be stated. Incompatible history yields an inconclusive result or new baseline, not uplift. No numeric ROI without known costs and defensible revenue attribution. A weekly/monthly monitoring plan is not an installed automation; execute recurring reads only through a separately authorized schedule.
