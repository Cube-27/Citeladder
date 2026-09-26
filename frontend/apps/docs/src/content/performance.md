---
title: 'Performance and integrations'
description: 'Connect the right properties and interpret saved search and analytics reports.'
group: 'Measure and understand'
order: 140
---

Performance brings imported provider evidence into your project. Connecting an account and choosing a project property are separate steps: the account grants access, and the mapping selects which property this project reads.

## Connect and map

Open the app’s integration controls, connect a supported provider and choose the matching website property. Check the selected project before confirming.

Search Console supplies search performance evidence. Google Analytics supplies analytics evidence, including the report used for AI Referrals. Available integrations and connection permissions depend on your workspace.

## Wait for coverage

Inspect integration status and history progress after connecting. Importing historical reports can take time, and provider availability may be partial.

If data is missing, check the property, credentials, date range and import status. Reloading the dashboard reads the saved state; it does not force a provider sync.

## Read Performance

Choose an available preset or explicit date range. Check the exact window and comparison dates, especially when the provider’s most recent complete day is earlier than today.

Headline Search Console totals use the date-only report. Query, page, country and device tables are separate breakdowns. Privacy filtering and report grain mean their rows may not add up to the headline.

Do not interpret a missing headline as zero or reconstruct it from a partial query table.

## Investigate a difference

Compare compatible periods, then inspect the relevant dimension. A query-level observation and a page-level observation are not automatically evidence for a specific query–page pair.

For that relationship, use the saved query-page evidence surfaced through [Search Demand](/demand/).

## Fix a connection problem

Reconnect expired credentials through the owning integration. If you mapped the wrong property, review the mapping before importing more data. Historical evidence keeps its original property identity; changing a mapping does not relabel it.

Use [AI Referrals](/ai-referrals/) for visits attributed to recognized AI sources.
