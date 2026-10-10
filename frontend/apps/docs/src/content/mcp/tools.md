---
title: 'MCP tool reference'
description: 'Choose the narrowest registered read tool that answers your question.'
group: 'Connect with MCP'
order: 320
---

Start with project discovery, inspect available evidence, then ask for the concrete record or dataset you need. List tools are bounded; follow returned cursors instead of assuming the first page is complete.

## Choose a reading path

| Your question                                   | Start with                                                     |
| ----------------------------------------------- | -------------------------------------------------------------- |
| Which project can I analyze?                    | `list_projects`                                                |
| What is known about this business?              | `get_project_business_context`                                 |
| Which project, Action or prompt mentions this?  | `search`, then `fetch`                                         |
| What did an AI audit observe?                   | `read_visibility_overview`, then `read_visibility_results`     |
| Which sources were used?                        | `read_visibility_sources`                                      |
| How do answers portray us and competitors?     | `read_perception`                                              |
| Who cites one specific URL?                     | `read_source_url`                                              |
| What should I work on next?                     | `read_actions`                                                 |
| How do cited competitor pages differ from mine? | `read_content_differentiation`                                 |
| Which products do AI answers recommend?         | `read_ai_shelf`                                                |
| What did the website crawl find?                | `read_site_health`, then `read_site_pages`                     |
| Can AI crawlers reach the site?                 | `read_ai_crawlability`                                         |
| Which AI crawlers visited, per server logs?     | `read_crawl_logs`                                              |
| Which pages get AI traffic?                     | `read_ai_traffic_pages`, then `read_ai_traffic_url`            |
| How many visits came from AI assistants?        | `read_ai_referrals`                                            |
| Which connected reports exist?                  | `read_integration_status`                                      |
| What does a performance window show?            | `read_performance`, then `read_performance` with a `dimension` |
| Which research dataset should I inspect?        | `read_search_intelligence`, then `read_search_dataset`         |

## Interactive views

In clients that support MCP Apps, such as Claude and ChatGPT, three tools open an interactive CiteLadder view inside the conversation:

| Tool                 | Shows                                                                  |
| -------------------- | ---------------------------------------------------------------------- |
| `render_visibility`  | An overview or sources for one audit, or trends over a window you name |
| `render_site_health` | The Site Health results of one crawl                                   |
| `open_analytics`     | The CiteLadder project picker                                          |

Clients without MCP Apps ignore the view and use the read tools instead.

## Read records and windows precisely

The `search` tool finds projects, active Actions and prompts by text and returns `citeladder://` record references. Pass a returned reference to `fetch` to read that record. Arbitrary URLs, SQL and filesystem paths are not valid substitutes.

Keep the exact audit, dataset or date-window identity in your analysis. A query table and a page table do not automatically establish query-page evidence.

## Paging and limits

List tools return a bounded page. Pass the returned `cursor` with the same selection to continue; a cursor does not carry over to a different selection.

A connection can make 120 tool calls a minute, and an account 600 across its connections. Past that, the tool returns an error with the time to retry.

## Preserve missing-data states

An unavailable result is not zero. A partial result is not complete. If a tool cannot return the requested scope, ask for the available inventory and explain the limitation.

The catalog below describes registered tools, not a guarantee that every dataset exists for your project.
