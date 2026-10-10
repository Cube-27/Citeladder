---
title: 'AI Visibility'
description: 'See how your brand and competitors appear in the answers your project measures.'
group: 'Measure and understand'
order: 110
---

Use AI Visibility to investigate brand presence across a defined set of prompts and engines. Start with the selected run and filters, then move from the summary into the answer evidence.

## Run a useful audit

Choose the prompts, engines and repetitions in the audit launcher. CiteLadder measures answers from ChatGPT, Claude, Gemini and Google AI Overviews, collected from the consumer apps and from provider APIs; a collected answer can differ from what a signed-in user sees. Review the estimate before confirming. More repetitions give more observations under that run's conditions; they do not turn a sample into a guarantee about every user's experience.

An audit keeps the prompts, tracked roster and measurement configuration it used. Check **Runs** for completion, cancellation and unsuccessful attempts.

## Schedule audits

To measure on a regular cadence, open **Runs** and use **Scheduled audits**. Choose a prompt set, the measurement scope, the engines and a cadence: one time, every few minutes (at least five), hourly, daily or weekly. The first scheduled run starts right away, and later runs follow your browser's time zone.

A schedule pauses itself when it cannot start runs, for example when your plan or trial has ended, an engine connection is missing or the included budget is used up. The row shows why it paused; fix the cause and choose **Resume**.

## Read Trends

**Trends** is the default view. Select the run or period, engine and cohort appropriate to your question. When using a baseline, check whether the comparison is compatible.

Trends reports four measures. Keep them separate:

| Measure             | What it tells you                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Visibility          | The share of answers that name your brand (the mention rate)                                       |
| Share of voice      | Your share of all mentions of the brands you track; repeated mentions in one answer count once     |
| Owned citation rate | The share of answers that link to a page you own                                                   |
| Average position    | Where your brand tends to appear among the brands you track, counted only in answers that name you |

A citation is not a brand mention, and a mention is not an endorsement. Average position ranks you among your tracked brands, not within the whole answer. Measures a run cannot support remain unavailable rather than zero.

## Read Perception

**Perception** shows how answers portray your brand and your competitors. Every answer from a brand audit that names you or a competitor is read for sentiment, at no credit cost. Answers from audits run before this view existed are not classified.

- **Net sentiment** runs from −100 to +100: positive mentions minus negative mentions, divided by every classified mention. Mixed mentions count in the denominator only.
- **Coverage** always sits beside it as "N of M mentions classified". Mentions still being classified, mentions the classifier could not judge, low-confidence labels and mentions left unclassified (for example when the platform limit is reached) are counted separately and never treated as zero.
- **Themes** group what answers praised or criticised (pricing, support, reliability and so on), each with a quote.
- **Criticism in answers** lists the negative points about you, quoted exactly as the answer put them. Open a quote to see the full answer.
- **Sources cited alongside criticism** lists domains cited in answers that criticised you. They appeared alongside the criticism; the view does not show that they caused it.
- **Recommended** is the share of answers naming you that explicitly recommend you near your first mention. It reads English phrasing only.

When nothing is classified yet the view says so: answers are still being classified, perception is unavailable (with the reason), or no answer in the selection named you. A change in how perception is classified starts a new comparison series, so points from before and after it are not compared directly.

## Inspect Sources

Switch to **Sources** to see the domains and URLs used in the selected evidence. Open a domain to inspect its URLs and the prompts that reached it. Open an answer to check how a citation was used.

See [Sources and citations](/sources/) for interpreting retrieval, citation rates and brand co-occurrence.

## Read Query Fanout in context

Query Fanout shows captured query evidence associated with the measured answers. Use it to understand the recorded retrieval context. Absence of captured fanout does not prove that an engine did no research.

## Respond to a change

First check whether the engine, prompt set, cohort or successful-answer coverage changed. Then inspect which answers and sources explain the observed difference.

Use an Action or a focused Agent question to turn the evidence into work. Avoid attributing movement to a website edit until you have examined later compatible measurements and their limitations.
