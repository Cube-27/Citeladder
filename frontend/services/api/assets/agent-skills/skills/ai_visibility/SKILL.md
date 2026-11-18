---
id: ai_visibility
label: AI visibility diagnosis
group: visibility
order: 8
version: 3
output_kind: diagnosis
description: Diagnose why a brand is absent, weakly cited, misrepresented or not recommended in CiteLadder AI results. Use raw prompt/answer/source evidence to choose owned, earned, technical or prompt-quality work.
---

# AI visibility diagnosis

## Goal

Find where relevant buyer questions fail to produce a useful, accurate mention of the brand, and pick the next fix from what the answers actually say. No generic "AEO checklist".

## Where the data is

- `read_visibility_overview`: the latest run, its rates and status, with win rate, position and net sentiment per brand (pooled across engines) and win rate per engine; `view: topics` per topic. No completed run means no baseline; pending metrics are still being written. The visibility reads take `topic_id`.
- `read_prompt_metrics`: which prompts are won or lost, one prompt's history and its answers across runs.
- `read_visibility_results`: the actual answers of one run, by prompt, domain or URL.
- `read_visibility_sources`: the domains and URLs the answers cite.
- As the question needs: `read_competitors` (one competitor in focus, pending suggestions), `read_query_fanouts` (what engines searched while answering), `read_perception` (tone), `read_fact_checks` (stated facts), `read_ai_ads` (paid placements, never citations), `read_content_differentiation` (owned page vs inspected organic results).

## What good looks like

- Separate unbranded, branded and informational prompts: a high rate on prompts that name the brand does not prove discovery.
- Cited, mentioned, recommended, recommended against and misstated are different outcomes. A citation is not an endorsement.
- Diagnose by topic, then by prompt: a topic's average hides the prompts that lose.
- Being named is not winning: win rate (named first among tracked brands), position and net sentiment are separate measures, and null means unavailable, never zero.
- Name the failure type: weak prompts (fix them first), access, answer gap on an owned page, source gap on an independent page, fit gap, or volatility across runs.
- Fanout queries are what engines searched while answering, not what buyers typed; the ones that never surface the brand point to content or source gaps.
- A competitor suggestion (an untracked name or cited domain that answers keep raising) is a possible missing competitor, not proof that answers recommend it; the person accepts or rejects it in CiteLadder.
- Map cited sources to who controls them; a brand's own channels are not independent validation.
- State tone coverage as "N of M mentions classified" and fact-check coverage as the claims it checked, with "N edited" where a person replaced the model's verdict (accuracy counts theirs); sources listed beside criticism or a contradiction were not shown to cause it.

## Deliver

For a direct question, a few paragraphs: what the answers show, the strongest next action, the main uncertainty. For a full diagnosis, one document: what was measured, the failure types with decisive answer excerpts, source and competitor gaps, prioritized actions and how to re-measure on the same prompts and engines.
