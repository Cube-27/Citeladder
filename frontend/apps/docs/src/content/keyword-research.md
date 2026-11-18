---
title: 'Keyword research'
description: 'Find search opportunities in your Search Console data, and research keywords, organic competitors and backlinks with saved datasets.'
group: 'Measure and understand'
order: 160
updated: '2026-11-18'
---

**Keyword research**, under **Search** in the sidebar, has five tabs: **Demand**, **Overview**, **Keywords**, **Organic competitors** and **Backlinks**. It opens on **Demand**, which reads your own Search Console data. The other four tabs show keyword research datasets you acquire; each result belongs to a saved dataset with its own target, market, scope and acquisition time.

**Organic competitors** are the sites that rank for the same searches as you. They are a different list from the brands you track on **Brand → Competitors**.

## Demand: start with the signal's evidence

Demand turns imported search evidence into signals worth investigating: striking-distance queries, competing pages, property-relative CTR gaps and coverage-qualified trends. Filter by signal type and search the table. Demand does not need a keyword research provider; it needs a connected Search Console property.

Open a signal and read the query, page, date window, country and device scope. Check how the page was resolved and whether the evidence is current enough for the decision.

A page match may be exact, supported by saved redirects or canonicals, ambiguous or unresolved. Similar-looking URLs alone do not prove that two records describe the same page.

### Investigate a CTR gap

A property-relative CTR gap compares the observation with the property's relevant evidence. It is not a universal industry benchmark.

Where query-page relevance evidence is available, the drawer shows query-term coverage in the title, H1 and primary content. Missing terms can help you frame a review, but they do not prove the cause of the CTR result.

Before editing, ask whether the page already answers the query clearly and whether a title change would accurately represent it.

### Review competing pages

A cannibalization signal is a reason to inspect the pages and search intent. It is not an automatic instruction to delete, merge or redirect a URL.

Ask whether the pages serve different audiences or stages of the buying process. Use an Agent brief to compare the evidence and propose an approach for human review.

### Move from a signal to an Action

Actionable signals can connect to an Action through the **Act on this** area. Open the Action to see other findings on the same target and its recommended approach.

Use **Ask agent** when you want an explanation first. Attached references carry the relevant evidence into the chat; inspect or remove them before sending.

Your non-branded Search Console queries also guide how [generated prompts](/prompts/#grounded-in-your-search-data) are phrased.

### When no signal is available

Check connected-data coverage and the detector's stated limitations. Missing query-page evidence, ambiguous targets or insufficient compatible history can prevent a reliable signal. "No available signal" does not establish that there is no opportunity.

## Review before acquiring

Open the acquisition controls and review the proposed target, market, language, scope, depth and maximum cost. Confirm only when the proposed dataset answers your question.

The review itself does not buy data. Confirmation is the separate decision that starts the paid acquisition. Refreshing or expanding depth returns to review.

## Use the saved scope

Domain-plus-subdomains research and exact-host research answer different questions. A saved dataset retains the scope chosen when it was acquired, even if you later change acquisition preferences.

When comparing an organic competitor with your site, check both datasets' scope and market before interpreting a difference.

## Understand the grain

Keyword rows, top pages, referring domains, destination pages and individual backlinks are different datasets.

A referring-domain aggregate is not a list of backlink edges. A domain-wide history series is not automatically the history of the currently filtered live backlink set. Missing months remain missing.

## Work with the table

Search, filters, sorting and pagination operate over saved rows. Saved-row counts, filtered counts and provider-reported totals may differ.

Export captures the saved matching data with its provenance. It does not acquire additional provider results.

To investigate selected rows with the Agent, use the supported handoff and review the attached references before sending your question.

## Keyword gaps become Actions

A published competitor keyword dataset can open Actions for searches where a saved competitor ranks in the top 10 and the provider found no ranking for your site. CiteLadder reads only datasets published in the last 90 days, needs an estimated search volume of at least 50, skips navigational searches and searches that name a competitor, and keeps at most 25 gaps per refresh. A search Search Console already shows for your site belongs to the [Demand tab](#demand-start-with-the-signals-evidence) instead.

The Action targets the one page that already covers the search, or a planned page when no single page does. After you declare it implemented, it is measured by whether your site appears for that search, in Search Console or in a later dataset, for up to 90 days. Rankings from the provider are estimates.

Published keyword datasets in your project language also guide how [generated prompts](/prompts/#grounded-in-your-search-data) are phrased.

## Read acquisition outcomes

An empty result may still incur a provider charge. Partial and uncertain outcomes need inspection; do not assume retrying is free or that missing normalized rows mean no provider work happened.

Completed datasets remain useful even if another part of the acquisition stops. Check the outcome and cost state before deciding whether to acquire more.
