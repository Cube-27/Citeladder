---
title: 'Perception'
description: 'See how AI answers describe you and your competitors, and check the facts they state about you.'
group: 'Measure and understand'
order: 112
updated: '2026-11-18'
---

**Brand → Perception** shows how answers portray your brand and your competitors. It has a **Brand** tab and, in workspaces in the fact-checking pilot, a **Fact-checking** tab. It uses the same filters as [Insights](/insights/).

## Read the Brand tab

Every answer from a brand audit that names you or a competitor is read for sentiment, at no credit cost. Answers from audits run before this existed are not classified.

The first card states how often answers say something negative about you and which themes draw more criticism than praise. Its figures are **Describing you** (classified mentions out of all mentions), **Positive**, **Negative** and **Recommended**, plus **Contradicted claims** for the pilot, which opens Fact-checking.

- **Net sentiment** runs from −100 to +100: positive mentions minus negative mentions, divided by every classified mention. Mixed mentions count in the denominator only.
- **Coverage** always sits beside it as "N of M mentions classified". Mentions still being classified, mentions the classifier could not judge, low-confidence labels and mentions left unclassified (for example when the platform limit is reached) are counted separately and never treated as zero.
- Shares and net sentiment need at least 20 classified mentions. Below that a figure, a trend point or a breakdown row reads **Too few classified** with how many there are so far, never a share. **Recommended** needs enough answers naming you and otherwise reads **Too few answers**.
- **How AI describes you** groups what answers praised or criticised (pricing, support, reliability and so on) into themes; switch between most negative and most positive.
- **How AI judges you** splits classified mentions into positive, neutral, negative and mixed.
- **Net sentiment over time** follows the score across the runs in your period. A break in the line means the runs cannot be compared directly.
- **You and competitors** compares sentiment across the brands you track.
- **Criticism in answers** lists the negative points about you, quoted exactly as the answer put them. Open a quote to see the full answer.
- **Recommended** is the share of answers naming you that explicitly recommend you near your first mention. It reads English phrasing only.

The breakdown card splits sentiment **By theme** (open a theme for its quotes, engine and prompt), **By topic**, **By engine**, **By prompt** and **By source**. By source lists domains cited in answers that criticised you. They appeared alongside the criticism; the view does not show that they caused it.

When nothing is classified yet the page says so: answers are still being classified, perception is unavailable (with the reason), or no answer in the selection named you. A change in how perception is classified starts a new comparison series, so points from before and after it are not compared directly.

## Compare themes with competitors

**How AI describes competitors** shows the theme most associated with you and your largest gap to the leading brand, then a map of brands by theme: each cell is the share of that brand's mentions that raise the theme. Quotes are kept for your brand only.

## Check facts in answers (pilot)

In workspaces in the fact-checking pilot, **Agent → Context** lists **Brand facts**: short statements such as a plan's price, an integration or the markets you serve. **Edit facts** on the Fact-checking tab opens them. A new fact starts as a draft; only confirmed facts are used.

**Import facts CSV** on the Fact-checking tab adds facts from a file with `topic`, `statement` and an optional `source_url` column. A preview marks each row **Ready** or **Already a fact** before you import; imported facts are drafts until you confirm them, and rows that repeat an existing fact are skipped.

Audits started after you confirm a fact check the factual claims answers make about you against the facts confirmed at that moment, at no credit cost. Editing a fact later never changes an earlier run.

## Read the Fact-checking tab

- **Accuracy** is supported claims divided by claims that were supported or contradicted. **Coverage** sits beside it; claims still being checked, low-confidence claims and claims that could not be checked are counted separately and never treated as zero. Its sub-line also says how many verdicts a person edited.
- **Claims over time** shows each run's supported, contradicted and inconclusive claims. A marker shows where a run cannot be compared with the one before.
- **Contradicted** quotes what the answer said next to the fact it contradicts. Open a claim to see the full answer.
- **All claims** lists every claim with its engine, the fact it was checked against and its verdict.
- **By fact** lists each fact as the run recorded it, with its claims split by verdict and when it was last raised. A fact no answer touched reads **Not raised in any answer**, not zero.
- **Sources cited alongside contradictions** lists domains cited in those answers. They appeared alongside the claim; the view does not show that they were its source. **By topic** and **By engine** follow.
- **Export claims CSV** downloads the claims in your current selection.

**Not covered** means no confirmed fact is about that point, and **inconclusive** means a related fact neither confirms nor rules it out. Neither is an error in the answer. Opinions and praise are not checked here; they appear on the Brand tab. A change to your confirmed facts or to how claims are checked starts a new comparison series.

## Change a verdict

If the checker got a claim wrong, choose **Change verdict** on its row in **All claims**, pick the verdict and add an optional note. The model's verdict is kept beside yours: the claim shows **Edited**, with the model's verdict on hover, and Accuracy, its claims and By fact count your verdict. Setting it back to the model's verdict clears the mark; both changes stay in the history. **Ask Agent** on a row opens a chat about that claim.
