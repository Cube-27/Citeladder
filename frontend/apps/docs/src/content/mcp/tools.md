---
title: 'MCP tool reference'
description: 'Choose the narrowest registered read tool that answers your question, and see which tools make changes.'
group: 'Connect with MCP'
order: 320
updated: '2026-11-18'
---

Start with project discovery, inspect available evidence, then ask for the concrete record or dataset you need. List tools are bounded; follow returned cursors instead of assuming the first page is complete. Visibility reads take a `topic_id` from `read_prompt_portfolio` to read one topic.

## Choose a reading path

| Your question                                   | Start with                                                     |
| ----------------------------------------------- | -------------------------------------------------------------- |
| Which project can I analyze?                    | `list_projects`                                                |
| What is known about this business?              | `get_project_business_context`                                 |
| Which project, Action or prompt mentions this?  | `search`, then `fetch`                                         |
| What did an AI audit observe?                   | `read_visibility_overview`, then `read_visibility_results`     |
| How does each topic perform?                    | `read_visibility_overview` with `view` `topics` or `matrix`    |
| Which prompts do we win or lose?                | `read_prompt_metrics`, then `view` `history` or `answers`      |
| What did engines search for while answering?    | `read_query_fanouts`                                           |
| Who competes with us, and who should we track?  | `read_competitors` with `view` `focus` or `suggestions`        |
| Which sources were used?                        | `read_visibility_sources`                                      |
| How do answers portray us and competitors?      | `read_perception`                                              |
| Do answers state our facts correctly? (pilot)   | `read_fact_checks`, with `view` `facts` for each fact          |
| Which ads appear in ChatGPT answers?            | `read_ai_ads`                                                  |
| Who cites one specific URL?                     | `read_source_url`                                              |
| What should I work on next?                     | `read_actions`                                                 |
| How do cited competitor pages differ from mine? | `read_content_differentiation`                                 |
| How do AI answers rank each of our products?    | `read_ai_shelf`                                                |
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

| Tool                 | Shows                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render_visibility`  | An overview or sources for one audit, or trends over a window you name, with mention rate, citation rate, share of voice, position or win rate and what changed at each run |
| `render_site_health` | The Site Health results of one crawl                                                                                                                                        |
| `open_analytics`     | The CiteLadder project picker                                                                                                                                               |

Clients without MCP Apps ignore the view and use the read tools instead.

## Prompt and resource

Clients that support MCP prompts list `business_health_review`, which starts a growth health review of one project. The resource template `citeladder://projects/{project_id}/context` returns the same project overview as `get_project_business_context`.

## Make changes

A connection approved with **Allow changes** also lists change tools, marked **Changes** in the catalog below. `create_topic`, `rename_topic`, `delete_topic`, `confirm_topics`, `update_prompt_text`, `add_competitor`, `remove_competitor`, `review_competitor_suggestion`, `update_action_status` and `cancel_audit` run when called. `prepare_add_prompts`, `prepare_update_prompts`, `prepare_launch_audit`, `prepare_schedule` and `prepare_declare_implemented` return a preview and a confirmation token; nothing changes until the assistant calls `confirm_change` with that token after you agree.

`review_competitor_suggestion` accepts or rejects one suggestion that `read_competitors` lists with `view: suggestions`. `prepare_update_prompts` activates, archives or files a selection of prompts under one topic as a single change; every prompt must be in the project, or nothing changes. Prompts cannot be deleted over MCP: delete them in CiteLadder.

To generate prompts, the assistant follows the Prompt builder's steps: it checks your business facts with `get_project_business_context`, proposes topics with `preview_topics` and saves the ones you agree to with `confirm_topics`, offers your search data with `read_seed_queries`, then runs `generate_prompts` once you agree to the run. Topic previews and generation spend AI credits. Generated prompts wait in the Prompt builder's **Review** step, which the assistant links to; only the ones you track there are measured.

## Read records and windows precisely

The `search` tool finds projects, Actions in every status (open and in-progress ones first) and prompts by text and returns `citeladder://` record references. Pass a returned reference to `fetch` to read that record. Arbitrary URLs, SQL and filesystem paths are not valid substitutes.

Keep the exact audit, dataset or date-window identity in your analysis. A query table and a page table do not automatically establish query-page evidence.

## Paging and limits

List tools return a bounded page. Pass the returned `cursor` with the same selection to continue; a cursor does not carry over to a different selection.

A connection can make 120 tool calls a minute, and an account 600 across its connections. Past that, the tool returns an error with the time to retry.

## Preserve missing-data states

An unavailable result is not zero. A partial result is not complete. If a tool cannot return the requested scope, ask for the available inventory and explain the limitation.

The catalog below describes registered tools, not a guarantee that every dataset exists for your project.
