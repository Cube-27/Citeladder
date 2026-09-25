---
id: growth_plan
label: Growth plan
group: strategy
order: 1
version: 1
output_kind: plan
description: Prioritize SEO and AI visibility opportunities using CiteLadder business evidence. Use for broad growth goals, revenue-linked content plans or multi-skill orchestration; not for a single keyword lookup.
---

# Growth priorities and action plan

Follow the operating contract. Bind only tools advertised in this run's catalog, and reuse the context package and the evidence already gathered in this chat instead of repeating discovery.

## Outcome and scope

Turn a business objective into a small, evidence-backed sequence of work. Default to a prioritized plan, not unsolicited content production or site changes. When the request includes “create,” “rewrite” or another concrete deliverable, run the relevant specialist and deliver that work in this task. When the user asks only for a reusable task prompt, use the prompt-writing mode below instead of executing it.

## Inputs

Required: an authorized project and a usable description of the offer/audience. Optional: conversion or revenue records, buyer interviews, priority markets, capacity, competitors, GSC, keyword/SERP data, backlinks, site-health findings and visibility history. Obtain business facts and data coverage before asking questions. If no commercial objective is provided, infer a provisional goal from the actual CTA and state it; ask only when alternative goals would change the plan.

## Workflow

1. **Frame the decision.** Write one sentence: “For [audience/market], improve [observable business outcome] by resolving [known or suspected bottleneck].” Separate a desired commercial result from leading indicators such as impressions, citations or rankings. Use canonical-domain scope by default.
2. **Inventory only relevant evidence.** Start with business context, integration status and current opportunity/visibility summaries. Read performance for the latest complete comparable period. Request detailed records only for plausible opportunities; do not run every dataset or every specialist by default. Record absent capabilities in the evidence manifest.
3. **Check measurement and availability first.** A disconnected provider, incomplete import, changed prompt cohort or failed audit is a data problem, not a growth decline. Resolve or describe it before interpreting zeroes. Verify any suspected sitewide access/indexability blocker before recommending more content.
4. **Map commercial relevance.** Identify the real conversion destinations: product, service, category, application, booking, donation, lead or other goal pages. Connect audience → offer → buyer task → topic → destination. The homepage is not automatically the only money page. Preserve noncommercial trust/support pages when they help a real buyer task.
5. **Choose the branch supported by evidence.**
   - Missing or unrepresentative tracked buyer demand → the Prompt discovery skill.
   - Reachable site but weak topic/keyword coverage or competitor gaps → the Search opportunities skill.
   - Observable page/query demand not satisfied → the Search Console optimization skill.
   - Verified access, canonical, rendering or indexability defect → the Technical health skill.
   - Valuable pages poorly connected internally → the Internal links skill.
   - Weak AI mentions, recommendations or citations → the AI visibility diagnosis skill to distinguish the failure before selecting a fix.
   - Relevant third-party evidence or link gaps → the Earned authority skill.
   - An accepted content opportunity → the Create content skill, the Comparison content skill or the Programmatic SEO pilot skill.
6. **Select a few actions, not a score dump.** Compare business fit, observed opportunity, evidence strength, implementation effort, dependency and reversibility. Use “now / next / later” with reasons. A proven conversion-path access defect outranks speculative content expansion. A low-volume buyer task can outrank a high-volume unrelated keyword. Do not calculate expected revenue without defensible conversion/value assumptions.
7. **Sequence within actual capacity.** Ask for capacity only when necessary to commit a schedule. Otherwise use a provisional modest work-in-progress limit and state it. Consolidate actions that share a page/root cause. Do not prescribe a redesign when a small edit resolves the demonstrated issue. Treat a 30-day roadmap as an execution horizon, not a ranking promise.
8. **Pressure-test the plan.** For each proposed action ask: what evidence would show this is the wrong problem; what must be true for it to work; what could it damage; which simpler action was rejected? Keep the answer concise in the action record rather than exposing private reasoning.
9. **Close the measurement loop.** Use the Measure results skill for chosen interventions. Link each action to one primary outcome, a leading diagnostic, a guardrail and a dated review trigger. If no work is yet implemented, deliver a baseline/experiment plan rather than a performance verdict.

## Output contract

Produce `growth-plan.md` with:

- Objective, market, dates, scope and important unknowns.
- Diagnosis: no more than the distinct material bottlenecks supported by evidence; label observations and hypotheses.
- “Now / next / later” action table: action ID, target, exact work, evidence IDs, business rationale, owner role, effort, dependency, acceptance check, review condition.
- A content map when requested: audience/task, offer, existing/new destination, refresh/create/merge/no-action decision, source evidence, conversion path and brief.
- The next copy-paste specialist prompt with the actual known project/URL/evidence references filled in.
- Baseline and measurement plan; work completed versus proposed; blocked data requests.

Default to at most five “now” actions as a readability heuristic, not an SEO threshold. Fewer is better when justified. Put the compact evidence manifest at the end; do not repeat raw API responses.

## Focused setup

When the user only asks what data is available, stop after data dates, coverage and access limitations; do not produce a growth roadmap. For a real task, use confirmed key pages and goals where available. Ask only for a missing decision-changing field, not a full strategy interview. Return proposed context corrections separately from reviewed facts. End multi-stage work with the exact next task, so the user can continue in this chat.

## Validation and stop rules

Every immediate action must have a target and evidence, not “improve content” or “build authority.” Data gaps may justify a data acquisition task but never invented findings. Stop broad routing when the requested bounded deliverable is complete. Do not run recursive planning loops or automatically invoke every skill. If project identity is ambiguous, stop account-specific reads until resolved. If the objective is unsupported by available data, return a conditional plan and the minimal missing input, not a fabricated business case.
