---
id: search_opportunities
label: Search opportunities
group: demand
order: 3
version: 1
output_kind: research
description: Find commercially relevant keyword, topic and competitor gaps using CiteLadder demand, GSC, SERP and visibility evidence. Use for research and content planning, not automatic page generation.
---

# Search demand and competitor gaps

Follow the operating contract. Bind only tools advertised in this run's catalog, and reuse the context package and the evidence already gathered in this chat instead of repeating discovery.

## Outcome and inputs

Choose which buyer needs to serve, on which existing or new pages, and why. Required: project business context and either useful demand observations or an explicitly hypothetical research scope. Optional: GSC page/query records, DataForSEO keyword/SERP snapshots, visibility prompts/sources, page inventory, backlink evidence and conversions. No data source is mandatory for every branch, but a quantitative gap claim requires that dataset.

## Select the research mode

For a named competitor, study that domain first; do not automatically expand into a market survey. For a landscape request, use a representative query basket, classify recurring domains, and label a small basket directional. For clustering, deliver a page map, not a list of semantic groups: primary query, related intents, existing/proposed destination, required evidence, and keep/refresh/create/defer decision. A small coherent set needs a simple map, not invented cluster hierarchies.

Keep the user's GSC observations separate from provider estimates of competitor traffic. Multiple URLs receiving one query establish overlap, not harmful cannibalization on their own. Verify unwanted page switching, competing intent or a documented business problem before recommending consolidation. Mark a destination “proposed” when no owned inventory was inspected.

## Workflow

1. **Choose the market and task.** Resolve offer, audience, served geography/language and conversion destinations. Start with audience → offer → buyer task → topic. Do not expand an industry into a generic keyword universe or default every business to commerce/SaaS.
2. **Inventory what already works.** Read current pages, demand clusters, commercially relevant GSC queries and measured visibility gaps. Preserve established useful pages. Inspect canonical and intent relationships before recommending a new route. Classify current pages by their actual job, not URL substring alone.
3. **Build a typed competitor set.** Separate direct business alternatives, search-result competitors, AI-answer competitors and cited publishers. Confirm a direct competitor serves overlapping needs/markets. A directory can compete for SERP attention without selling the same offer. Do not pad the list to a fixed count. Preserve the user-selected competition while adding other types as clearly labelled observations.
4. **Ground the opportunity.** For each relevant topic, inspect available query metrics and any market/device/date-matched Search Intelligence dataset. For high-priority decisions, note that the actual result pages need review; do not describe pages you have not read. Note result format, intent, specific buyer questions, useful evidence, date sensitivity and conversion expectations. Do not invent provider ranks, difficulty or volumes.
5. **Cluster by the same job and compatible result intent.** Similar words alone are insufficient. SERP overlap is supporting evidence, not a universal threshold. A shared page may serve related queries when the buyer task and needed answer are coherent. Split a topic when it needs a genuinely different decision, offer or format. Do not force a page for every keyword or treat a zero-volume estimate as proof that no buyer need exists.
6. **Compare observed coverage.** Look for absent buyer questions, outdated facts, weak proof, missing practical utility, poor information hierarchy or the wrong page format. Count gaps against the inspected sample only. “Absent from five inspected competitor pages” does not mean “unique on the internet.” A competitor's additional headings are not automatically required sections.
7. **Choose one action per opportunity.** `keep`, `refresh`, `expand`, `create`, `merge-review`, `reposition` or `defer`. New pages require distinct intent, truthful data and a useful conversion path. Potential cannibalization requires evidence of competing intent/performance, not merely two URLs sharing words. Merges/redirects require technical and business review; never prescribe automatic deletion.
8. **Prioritize and brief.** Compare business relevance, existing demand, achievable differentiation, competitor strength as observed, effort and dependency. Low-volume high-fit decisions can lead. Difficulty metrics are provider estimates, not a verdict that a smaller brand cannot compete. Use first-party outcome data where available and label fit-based proxies otherwise.

## Outputs

Produce `search-opportunities.md` and `opportunity-map.csv`.

```text
opportunity_id, audience, offer, buyer_task, topic, query_cluster,
market, language, search_intent, evidence_refs, provider_metrics_and_dates,
competitor_type, inspected_result_urls, existing_destination,
recommended_action, proposed_destination, format,
differentiated_value, required_proof, conversion_path,
priority_reason, effort, dependency, acceptance_check
```

Use a concise competitor map plus a prioritized content opportunity table. Each accepted topic includes a brief with intended reader, precise question to answer, relevant product facts, existing page decision, evidence to add, appropriate format, internal-link targets and primary conversion. Do not create a calendar of filler topics merely to fill weeks.

When asked to close gaps, include both a content/format opportunity and any discovered authority/access dependency. Hand off accepted briefs to the Create content skill; named comparisons to the Comparison content skill; repeatable data-backed patterns to the Programmatic SEO pilot skill; earned-source gaps to the Earned authority skill.

## Questions, validation and stop rules

Ask only when buyer/offer/market ambiguity changes recommendations. A lack of direct revenue data does not block a clearly labelled fit-based plan. No page is recommended solely because a competitor ranks for it. No volume/difficulty/rank may appear without provider, date and relevant scope. Deduplicate overlapping recommendations and verify that existing pages were inspected before proposing replacements. Missing current SERP evidence blocks claims about today's result composition, not a provisional business-topic map. Stop research when further breadth would not change the priority decision; show unresolved evidence needs.
