---
title: 'Example requests'
description: 'Give your assistant a concrete question, a bounded scope and a standard for evidence.'
group: 'Connect with MCP'
order: 330
updated: '2026-11-18'
---

Start by selecting a project. These requests are examples you can adapt to the saved data available in your workspace.

## Quick questions

Short questions work well once a project is chosen:

- "How did our AI visibility change over the last 30 days?"
- "Which competitors appear most often in our latest audit?"
- "Which sources do AI answers cite most for our prompts?"
- "What are the top Actions for this project right now?"
- "Which Site Health issues affect the most pages?"
- "Which pages get the most visits from AI assistants?"

The longer requests below set a stricter standard for evidence.

## Review an AI visibility audit

```text
Read the latest completed visibility audit for this project.
Name the exact audit, engines and prompt cohorts used.
Separate brand mentions, owned citations and competitor appearances.
Show the saved answers that support the main findings, including failures
or coverage limits that affect interpretation.
```

Use this when you need a report that can be checked against the actual answers.

## Compare topics and win rate

```text
Read the latest visibility results for this project by topic.
For each topic, show visibility, share of voice, average position and
win rate, and say which topics have too few answers to compare.
Then list the prompts in our weakest topic that a competitor wins.
```

Topics are the ones each run asked its prompts under, so a prompt moved to another topic later still counts under its old topic in earlier runs.

## Check the facts answers state (pilot)

```text
Read the fact checks for the latest run. List the contradicted claims
with the fact each contradicts and the engine that said it.
Then show which of our facts were raised least often.
Do not treat inconclusive or not-covered claims as errors.
```

Fact-checking reads return nothing outside the fact-checking pilot.

## Investigate cited sources

```text
For the selected audit, identify recurring source domains and inspect
their URLs. Keep brand co-occurrence in an answer separate from a
confirmed brand mention on a publisher page.
Suggest which URLs deserve inspection, without claiming they caused visibility.
```

Use this before deciding which external pages to investigate or discuss with your team.

## Prepare a website fix brief

```text
Read the latest completed Site Health crawl.
Summarize Web and AEO scores alongside coverage.
Choose three confirmed issues and identify affected pages and evidence.
Keep unresolved diagnostics separate. Prepare a brief for human review.
```

This prepares work for review; it does not modify the site.

## Review search performance

```text
List the available performance windows, then use the most recent complete
month with a compatible preceding month if both are available.
Show exact dates and limitations. Inspect query and page breakdowns
without reconstructing missing headline totals from dimension rows.
```

If the requested windows do not exist, have the client report what is available before proceeding.

## Explore Keyword research

```text
List saved Keyword research datasets, including target, market,
scope, acquisition time and coverage.
Wait for me to choose a dataset before reading its rows.
Do not acquire or refresh data.
```

After choosing, narrow the question to a keyword, competitor or backlink investigation at that dataset's actual grain.

## Check a proposed next step

```text
Read the current Actions and verify the most relevant items
against the underlying saved evidence.
Separate owned-site work from external-source work.
For each proposal, state what is measured, what is inferred and which
later observation would be needed to evaluate it.
```

Treat the assistant's proposal as reviewable work, not a completed implementation.

## Ideas by team

- **SEO and AEO teams:** a weekly visibility brief, competitor movement across engines, and cited sources worth outreach.
- **Content teams:** prompts where competitors are cited and you are not, and how cited competitor pages differ from yours.
- **Developers:** a fix list from the latest Site Health crawl, read in the editor next to the code with Cursor, Claude Code or Codex.
