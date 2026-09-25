---
id: gsc_optimize
label: Search Console optimization
group: owned_site
order: 5
version: 1
output_kind: page_edits
description: Diagnose organic traffic changes or produce exact page edits from CiteLadder GSC evidence. Use for impressions, CTR, queries and page performance; requires page-linked queries for page-specific keyword claims.
---

# GSC page optimization and decline diagnosis

Follow the operating contract. Bind only tools advertised in this run's catalog, and reuse the context package and the evidence already gathered in this chat instead of repeating discovery.

## Outcome and mode

Choose the mode from the request: **page optimization** produces surgical, evidence-linked edits; **decline diagnosis** locates the affected segment and tests competing explanations. Do not expand a single-page request into a sitewide rewrite. This skill does not promise CTR or ranking increases from adding a phrase.

## Evidence requirements

For page optimization, require the exact target URL, current page text and GSC query rows actually linked to that page. Include property, date range, search type and available country/device dimensions. For sitewide diagnosis, compatible performance series and page/query/market breakdowns may be sufficient without a joint table.

Check integration status and snapshot coverage. `read_performance_table` returns separate dimension tables without a page filter; those tables alone cannot tell which queries belong to one page. Page-linked rows come from `read_query_evidence` for an exact saved window. If no such window exists, say which Search Console window must be synced and meanwhile provide only a clearly labelled content review. Never cross-join page and query aggregates.

## Page-linked evidence gate

Use `read_query_evidence` with the page's `site_url_id` and an exact saved window. Bind only its advertised parameters. Resolve the exact page and window from returned identifiers. Keep unresolved/ambiguous page matches out of page-specific edits. Do not “recover” from a missing detail reader by combining independent query and page breakdowns. Preserve a page already meeting the intended buyer need; expansion needs demonstrated benefit, not just additional keywords.

## Retrieval

Resolve the canonical URL from actual page/redirect evidence, not by guessing its slug. Confirm it belongs to the selected GSC property: URL-prefix properties are prefix-scoped; domain properties have broader coverage, but this task remains scoped to the authorized canonical domain. Preserve GSC's recorded URL for exact matching.

Use the latest complete 28 days versus preceding 28 for diagnosis; use 90 complete days for page-discovery breadth when appropriate. For low volume or seasonality, expand or compare year-over-year with an explanation. Do not compare an incomplete week with a full one. Preserve the provider's reporting timezone and data-state metadata. Fetch dates first when completeness is uncertain.

Filter to the target page in the request before paging through its queries. Do not page the site's first rows and then assume filtering them yields the page's full query portfolio. Follow returned cursors. GSC may omit lower-volume/private rows even after pagination; report observed coverage.

## A. Page optimization

1. Read the current rendered content, title, headings, relevant metadata, primary action and internal links. Stored text is acceptable when dated; before/after claims require the actual original text. If a live fetch differs from stored evidence, label the discrepancy rather than silently overwriting history.
2. Separate target-brand, competitor-brand and non-branded intent. Group queries by the same user question. Preserve irrelevant impressions as excluded data, not opportunities to force into the page.
3. Classify coverage semantically: answered well, incomplete answer, ambiguous answer, missing answer, or wrong page/intent. An exact phrase absent from the text is not proof of a content gap; synonyms and a correct answer may already satisfy the need.
4. Diagnose the likely bottleneck: snippet/expectation mismatch; insufficient answer/proof; incompatible search intent; weak positioning; changing SERP features; low visibility; or an access/index issue. Check the actual result context when possible. A low CTR at a low average position is not automatically bad copy.
5. Prioritize by useful demand and business fit, supported by impressions/clicks/CTR/position and evidence strength. Do not use a universal CTR curve as a forecast. Aggregate CTR is `sum(clicks)/sum(impressions)` for a compatible cohort, never the mean of row CTRs. Do not reconstruct property totals from overlapping page/query slices.
6. Produce only necessary edits: a clearer title/snippet promise, a missing answer, verified proof, a useful comparison/detail, an improved CTA path or a contextual link. State exact location and original/revised copy. Preserve important qualifiers, accessible labels and already-performing intent. A metadata character budget may be an editorial preview heuristic, not a ranking cutoff.
7. For each edit, attach query cluster, observed metrics, evidence references and the mechanism to test. If no beneficial edit is justified, return “keep” with reasons instead of rewriting for activity.

## B. Decline diagnosis

Confirm the decline exists in compatible, sufficiently complete data. Quantify click/impression changes and segment by page family, query intent/brand, country/device and time. Keep measures at their available granularity.

Test competing explanations in this order: data/property/import change; demand/seasonality; tracking/attribution differences; site/release/indexability change; position/competitor shift; CTR/result-format change. Timing near a search update is not proof of causation. Do not assert search-update dates from memory; label any such timing as unverified. Stable impressions/position with fewer clicks warrants snippet/SERP investigation, not a claim that AI caused the loss. Missing metrics prevent that discrimination; state what is needed.

Give each hypothesis supporting evidence, counterevidence and the next decisive check. Route verified technical defects to the Technical health skill, page rewrites to the Create content skill, and evaluation to the Measure results skill.

## Outputs

`gsc-page-edits.md` for page mode:

```text
Target URL and property; actual periods and coverage;
query-cluster opportunity table with compatible observed metrics;
Edit ID → exact location → original text → proposed text → evidence IDs;
queries deliberately excluded; unchanged high-value sections;
measurement/guardrails; draft-versus-applied status.
```

`organic-decline-diagnosis.md` for decline mode:

```text
Observed change; affected and unaffected cohorts; completeness;
hypothesis → support → counterevidence → next verification;
ranked corrective actions with exact targets; measurement and limitations.
```

## Validation and stop conditions

No page-specific performance claim without page-linked evidence. No invented original copy, exact-match stuffing, guaranteed gains or automatic deletions. Missing GSC does not become zero traffic; public keyword estimates are not substituted as GSC. A technically inaccessible page can be diagnosed, but public copy cannot be verified until actual content is available. Do not publish edits through MCP. Recheck outcomes against stable intent/page cohorts after sufficient observations rather than reacting to a single day.
