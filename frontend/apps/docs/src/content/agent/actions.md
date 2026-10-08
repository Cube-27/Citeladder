---
title: 'Actions and measurement'
description: 'Choose one target, review its supporting findings, and follow the work through to later evidence.'
group: 'Improve with Agent'
order: 210
---

An Action groups work around a target: an owned page, planned page, earned-source page, product, category, search query or visibility prompt. Multiple findings can support the same Action.

This gives your team one place to understand the diagnosis, start Agent work and track implementation.

## Choose what to work on

Open **Agent → Actions**. Use status and target filters to narrow the list, then inspect an Action’s detail.

Read the diagnosis, contributing evidence, recommended approach and what to avoid. The priority comes from CiteLadder’s deterministic rules. An Agent explanation does not replace that ranking or create new measured facts.

Choose **Work on this** when the Action is suitable for your team. Linked chats remain visible on the Action.

## Understand status

| Status      | Meaning                                                            |
| ----------- | ------------------------------------------------------------------ |
| Open        | Available work that has not been dismissed or declared implemented |
| In progress | An open Action has a linked chat with an output                    |
| Dismissed   | A user has set the Action aside                                    |
| Implemented | A user has explicitly declared the work implemented                |
| Measuring   | Later readings have arrived, but not every check is met yet        |
| Done        | Every expected check has a met reading                             |

A generated draft does not mean the work has shipped. Dismissal is not implementation. A later conflicting observation can move previously verified work back into measuring.

You can dismiss or reopen eligible Actions. Declared work follows its measurement lifecycle rather than being freely overwritten with another status.

## Declare implementation

First make the change in your website, publishing workflow or external process. Then use **Mark implemented** for the relevant Action and choose the day it went live: today or any day in the last 30 days. Readings from before that day are not counted.

When work came from the Agent, confirm the output revision that matches what you shipped. An outline is not an implemented draft. Work done outside CiteLadder can be declared without an Agent output.

CiteLadder uses the Action’s current findings to determine the expected checks, and the dialog shows what each finding will be measured by before you declare. Some findings, such as a product or theme with no specific prompt, have no reading that isolates your change; they are recorded but not measured automatically. An Action without a current finding cannot be declared merely to create a measurement plan.

## Read the measurement result

The declaration keeps the target, baseline and expected checks tied to that implementation event. Each check is read by the evidence that can answer it: a Site Health check by the next crawl that reads the page, a prompt by the next visibility run, and Search Console clicks per day on the page or query by each synced window that starts after the go-live day. Each check keeps its own latest reading, so a crawl and a Search Console window together can complete an Action that neither completes alone.

Review each check and what its reading is waiting for. A page check that is still waiting offers **Run crawl now**. A page the crawl did not read, or an incompatible window, is a reason for limited measurement, not an observed failure. New evidence is read for 30 days after the go-live day; after that, the last reading stands.

An earned-source Action checks the relevant placement or discrepancy on the publisher page. That is distinct from proving a later visibility improvement.

## Report progress honestly

Use “implemented” for the work your team shipped and “verified” for the checks supported by later evidence. Neither status proves that the change caused every movement in traffic or AI visibility.

For the actual draft history, see [Outputs and revisions](/agent/outputs/).
