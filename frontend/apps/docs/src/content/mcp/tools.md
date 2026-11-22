---
title: 'MCP tool reference'
description: 'Choose the narrowest registered read tool that answers your question, and see which tools make changes.'
group: 'Connect with MCP'
order: 320
updated: '2026-11-22'
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
| How often do AI Overviews and AI Mode cite us?  | `read_visibility_overview` with `view` `surface`               |
| How does each market compare?                   | `read_visibility_overview` with `view` `markets`               |
| Which prompts do we win or lose?                | `read_prompt_metrics`, then `view` `history` or `answers`      |
| What did engines search for while answering?    | `read_query_fanouts`                                           |
| Who competes with us, and who should we track?  | `read_competitors` with `view` `focus` or `suggestions`        |
| Which sources were used?                        | `read_visibility_sources`                                      |
| Which of our pages are read but not cited?      | `read_visibility_sources` with `view` `near_misses`            |
| Which sources gained or lost share?             | `read_visibility_sources` with `view` `movers` or `series`     |
| How do answers portray us and competitors?      | `read_perception`                                              |
| Do answers state our facts correctly? (pilot)   | `read_fact_checks`, with `view` `facts` for each fact          |
| Which ads appear in ChatGPT answers?            | `read_ai_ads`                                                  |
| Who cites one specific URL?                     | `read_source_url`                                              |
| What should I work on next?                     | `read_actions`                                                 |
| How do cited competitor pages differ from mine? | `read_content_differentiation`                                 |
| How do AI answers rank each of our products?    | `read_ai_shelf`                                                |
| What did the website crawl find?                | `read_site_health`, then `read_site_pages`                     |
| What changed since the last crawl?              | `read_site_health` with `view` `changes` or `change_list`      |
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

A connection approved with **Allow changes** also lists three change tools, marked **Changes** in the catalog below. Every change goes through `prepare_change`: the assistant names a kind of change and its details, and CiteLadder checks it, saves nothing and returns a preview with a confirmation token. Nothing changes until the assistant calls `confirm_change` with that token after you agree. A token works once, for ten minutes. A preview shows what a delete removes and what a paid run can spend; nothing is spent before you confirm.

MCP offers the changes that help while analysing and writing:

- **Prompts and topics:** add prompts, activate, archive or file prompts under a topic, reword a prompt, create and rename a topic, save a topic plan, generate buyer questions or [brand prompts](/prompts/#brand-prompts) and import prompts.
- **Competitors and markets:** add a competitor, accept or reject a competitor suggestion, add a market.
- **Measurement:** launch or cancel an audit, re-run an audit's failed answers, create an audit schedule, run a probe.
- **Site Health:** start or cancel a crawl, re-run a page, start an internal-link analysis.
- **Actions:** set an Action's status, declare an Action implemented, analyze a page.
- **Data in:** import brand facts and the product catalog.
- **Deletes:** stop tracking a competitor and delete a topic.

Everything else, including deleting prompts or prompt sets, is done in CiteLadder.

To generate prompts, the assistant follows the Prompt builder's steps: it checks your business facts with `get_project_business_context`, proposes topics with `preview_topics` and saves the plan you agree to, offers your search data with `read_seed_queries`, then prepares one generation run for you to confirm. Topic previews and generation spend AI credits. Generated prompts wait for your review in CiteLadder; only the ones you track there are measured.

## Read records and windows precisely

The `search` tool finds projects, Actions in every status (open and in-progress ones first) and prompts by text and returns `citeladder://` record references. Pass a returned reference to `fetch` to read that record. Arbitrary URLs, SQL and filesystem paths are not valid substitutes.

Keep the exact audit, dataset or date-window identity in your analysis. A query table and a page table do not automatically establish query-page evidence.

## Paging and limits

List tools return a bounded page. Pass the returned `cursor` with the same selection to continue; a cursor does not carry over to a different selection.

A connection can make 120 tool calls a minute, and an account 600 across its connections. Past that, the tool returns an error with the time to retry.

## Preserve missing-data states

An unavailable result is not zero. A partial result is not complete. If a tool cannot return the requested scope, ask for the available inventory and explain the limitation.

The catalog below describes registered tools, not a guarantee that every dataset exists for your project.
