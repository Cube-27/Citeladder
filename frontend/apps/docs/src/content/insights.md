---
title: 'Insights'
description: 'See how often AI answers name you, how you rank against the brands you track, and where you win or lose.'
group: 'Measure and understand'
order: 110
updated: '2026-11-18'
---

**Brand → Insights** summarizes your brand's AI visibility across the answers your audits collected. It reads saved runs only; to collect new answers, see [Audits and runs](/runs/). How answers describe you is on [Perception](/perception/), and each tracked competitor has its own page on [Competitors](/competitors/).

## Choose the selection

The filters at the top apply to the whole page and stay in the address, so a link opens the same view. **Measurement** picks the latest run, all runs in a period or individual runs; then narrow by **Surface**, **Topic**, **Prompt**, **Market** (when the project has several), the branded or unbranded **Prompts** cohort and **Answer outcome**. When a period pools runs, **Group by** also appears. A topic is the one each run asked its prompts under: moving a prompt to another topic later never rewrites earlier runs. A run started before topics were recorded shows a topic as not recorded rather than not run.

A period pools the runs of your whole prompt set. A run of only some selected prompts never replaces the period's pool.

## Read the key figures

The first card names your rank among the brands you track, the nearest brand ahead of you (or behind you when you lead) and the answer count it is based on. Its key figures keep each measure separate:

| Measure        | What it tells you                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Visibility     | The share of answers that name your brand (the mention rate)                                                                       |
| Position       | Where your brand tends to appear among the brands you track, counted only in answers that name you; shown to one decimal           |
| Share of voice | Your share of all mentions of the brands you track; repeated mentions in one answer count once                                     |
| Sentiment      | Positive mentions minus negative mentions over every classified mention, from −100 to +100, with how many mentions were classified |
| Win rate       | The share of answers naming any tracked brand that name you first, written as "Named first in N of M"                              |

A citation is not a brand mention, and a mention is not an endorsement. Position and win rate rank you among your tracked brands, not within the whole answer.

Each measure keeps its own empty states. Sentiment reads **Too few classified** below 20 classified mentions. Win rate reads **Not measured** for answers collected before it was recorded, and **Not applicable** when no answer named a tracked brand. A measure a run cannot support stays unavailable rather than zero.

## Follow the trend

**Your brand over time** plots one measure at a time; switch between visibility, share of voice, position, win rate, sentiment and owned citation rate (the share of answers that link to a page you own). Position is drawn with #1 at the top, so up always means better. Use **Focus** to show one tracked brand instead of all of them.

Markers on the trend show the days your prompt set changed, a model an engine runs on changed, or an Action went live. A marker shows when something changed, not that it moved your rates; a movement that lines up with one may come from what was measured rather than from how engines answered. A break in the line means the two runs cannot be compared directly.

## Compare engines, markets and topics

- **By topic** lists prompt runs, visibility, share of voice, position and your rank in each topic of your brand prompts. Commerce topics and runs are left out of every Brand page.
- **By engine** lists each engine's visibility, owned citation rate and prompt runs.
- **Google AI Overview** and **Google AI Mode** appear when you narrow the surface to one of them: how often an answer was shown, how often it named you, and whether your site was cited.
- **By market** puts each market's latest run side by side, with visibility, share of voice and net sentiment and the change since that market's previous comparable run. Markets are never pooled, and a market you have not run reads **Not run**, never zero.

## Compare segments

The **Performance matrix** compares one measure (mention rate, share of voice, average position, win rate or net sentiment) across two of engine, topic, market and brand, up to 10 of each. It reads each market's latest run in your selection. A cell reads **Not run** when that segment was not measured, **Too few** when net sentiment has too few classified mentions, and **Not measured** when the measure does not apply, such as a position for a brand no answer named. **Export CSV** downloads the matrix as shown.

**Top rankings** lists the five tracked brands with the highest visibility in each topic, engine or market; choose which with **Rank by**.

## Go deeper

Open [Sources](/sources/) for the domains and pages behind the answers, a prompt's own page from [Prompts](/prompts/) for its answers one by one, and **Runs** for a single run's answers. Before explaining a change, check [Respond to a change](/runs/#respond-to-a-change).
