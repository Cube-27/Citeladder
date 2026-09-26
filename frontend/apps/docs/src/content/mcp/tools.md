---
title: 'MCP tool reference'
description: 'Choose the narrowest registered read tool that answers your question.'
group: 'Connect with MCP'
order: 320
---

Start with project discovery, inspect available evidence, then ask for the concrete record or dataset you need. List tools are bounded; follow returned cursors instead of assuming the first page is complete.

## Choose a reading path

| Your question                            | Start with                                              |
| ---------------------------------------- | ------------------------------------------------------- |
| Which project can I analyze?             | `list_projects`                                         |
| What is known about this business?       | `get_project_business_context`                          |
| Where is a specific saved record?        | `search`, then `fetch`                                  |
| What did an AI audit observe?            | `read_visibility_audit`, then `read_visibility_results` |
| Which sources were used?                 | `read_visibility_sources`                               |
| What did the website crawl find?         | `read_site_health`, then `read_site_pages`              |
| Which connected reports exist?           | `read_integration_status`                               |
| What does a performance window show?     | `read_performance`, then `read_performance_table`       |
| Which research dataset should I inspect? | `read_search_intelligence`, then `read_search_dataset`  |

## Read records and windows precisely

The generic `search` tool returns supported `citeladder://` record references. Pass a returned reference to `fetch` to read that record. Arbitrary URLs, SQL and filesystem paths are not valid substitutes.

Keep the exact audit, dataset or date-window identity in your analysis. A query table and a page table do not automatically establish query–page evidence.

## Preserve missing-data states

An unavailable result is not zero. A partial result is not complete. If a tool cannot return the requested scope, ask for the available inventory and explain the limitation.

The catalog below describes registered tools, not a guarantee that every dataset exists for your project.
