---
title: 'Perception'
description: 'See how AI answers describe you and your competitors, and check the facts they state about you.'
group: 'Measure and understand'
order: 112
updated: '2026-11-22'
---

**Brand → Perception** shows how answers portray your brand and your competitors. It has **Brand**, **Market** and **Objections** tabs and, in workspaces in the fact-checking pilot, a **Fact-checking** tab. Brand and Fact-checking use the same filters as [Insights](/insights/).

## Read the Brand tab

Every answer from a brand audit that names you or a competitor is read for sentiment, at no credit cost. Answers from audits run before this existed are not classified.

The tab reads every completed brand run of the market in the selected period, the last 90 days unless you pick another. When that period holds no completed run, it shows the latest run instead, as **Latest run** under **Measurement**. A period holding more than 100 runs is refused; pick a narrower one.

Each point an answer makes about a business is labelled with a short attribute in a buyer's words, such as "Slow refunds on annual plans", under a category. Your project's themes are the starting categories; when none fits, a new broad category is added to your themes, up to 20. Rename or delete themes in **Agent → Context → Themes**, and ask the Agent to merge two: it proposes the merge as a card you confirm, and a merge cannot be undone. Answers labelled before attributes existed keep only their category.

When few answers describe you, a notice links to the Prompt builder to [add brand prompts](/prompts/#brand-prompts), questions that ask about your brand directly.

- The figures are **Describing you** (classified mentions out of all mentions, with what is still pending or unclassified behind its info icon), **Positive answers** and **Negative answers**, plus **Contradicted claims** for the pilot, which opens Fact-checking.
- Below 20 classified mentions a share shows as counts, such as "9 / 14", tagged **Small sample**; a category's share switches below 5 positive or negative points. With nothing classified a figure reads **Too few classified**, never a share. Mentions still being classified, low-confidence labels and mentions left unclassified are counted separately and never treated as zero.
- The ranked list shows the categories answers raise most against you, or switch to **Most positive** for the ones they praise.
- **Sentiment** splits classified mentions into negative, mixed, positive and neutral.
- **Net sentiment** runs from −100 to +100: positive mentions minus negative mentions, divided by every classified mention; mixed mentions count in the denominator only. Its trend appears once your period holds two runs, and a break in the line means the runs cannot be compared directly.

Below them, switch the breakdown **By attribute**, **By topic**, **By engine** or **By source**; only views with data are offered. By attribute lists each category with its negative and positive points, the share that is negative and a bar comparing the two. Search it, keep only negative or positive points, and sort by any column. Open a category for its quotes, each with its attribute, tone, engine and prompt. Select a quote or its prompt to open the full answer over the page, with the answer's attributes listed beside it; open it in a new tab to go to the run instead. By source lists domains cited in answers that criticised you. They appeared alongside the criticism; the view does not show that they caused it.

When nothing is classified yet the page says so: answers are still being classified, perception is unavailable (with the reason), or no answer in the selection named you. A change in how perception is classified starts a new comparison series, so points from before and after it are not compared directly.

## Read the Market and Objections tabs

**Market** ranks you against competitors on each theme in the answers to a market probe, and **Objections** lists the objections those answers raise. **Run probe** shows the engines, markets, questions, answers and cost before you confirm; you can also probe daily or weekly.

While a probe works, the tab shows its step: asking the engines, with how many answers are back out of how many were planned and how many failed, then reading the answers into themes and objections. The previous result stays readable below. A probe that finishes with fewer answers than planned says how many came back; one that fails or cannot be read keeps the earlier result with a notice.

**Export themes CSV** on Market and **Export objections CSV** on Objections download every page cited behind each theme or objection of the latest probe, one row per page, with its full URL and whether it mentions you. Pages CiteLadder could not read show as **Blocked** or **Not read**, so you can open them yourself. The tab shows up to 10 pages for each theme or objection; the file lists them all.

## Check facts in answers (pilot)

In workspaces in the fact-checking pilot, **Agent → Context** lists **Brand facts**: short statements such as a plan's price, an integration or the markets you serve. **Edit facts** on the Fact-checking tab opens them. A new fact starts as a draft; only confirmed facts are used.

**Import facts CSV** on the Fact-checking tab adds facts from a file with `topic`, `statement` and an optional `source_url` column. A preview marks each row **Ready** or **Already a fact** before you import; imported facts are drafts until you confirm them, and rows that repeat an existing fact are skipped.

Audits started after you confirm a fact check the factual claims answers make about you against the facts confirmed at that moment, at no credit cost. Editing a fact later never changes an earlier run.

## Read the Fact-checking tab

- **Accuracy** is supported claims divided by claims that were supported or contradicted. **Coverage** sits beside it; claims still being checked, low-confidence claims and claims that could not be checked are counted separately and never treated as zero. Its sub-line also says how many verdicts a person edited.
- **Contradicted** quotes what the answer said next to the fact it contradicts. Select a claim or its prompt to open the full answer over the page.
- **All claims** lists supported and contradicted claims: the prompt, what the answer said, your fact, the verdict and the engine. Select the prompt or the quote to open the full answer. The **Verdict** filter shows inconclusive, not covered, low-confidence, pending or unavailable claims, or all of them; **Export claims CSV** follows it.
- **By fact** lists each fact as the run recorded it, with its claims split by verdict and when it was last raised. A fact no answer touched reads **Not raised in any answer**, not zero.
- **Sources cited alongside contradictions** lists domains cited in those answers. They appeared alongside the claim; the view does not show that they were its source. **By topic** and **By engine** follow.
- **Export claims CSV** downloads the claims in your current selection and verdict filter.

**Not covered** means no confirmed fact is about that point, and **inconclusive** means a related fact neither confirms nor rules it out. Neither is an error in the answer. Opinions and praise are not checked here; they appear on the Brand tab. A change to your confirmed facts or to how claims are checked starts a new comparison series.

## Change a verdict

If the checker got a claim wrong, open its answer from **All claims** or **Contradicted**, choose **Change verdict** beside the claim under **Fact checks**, pick the verdict and add an optional note. The model's verdict is kept beside yours: the claim shows **Edited**, with the model's verdict on hover, and Accuracy, its claims and By fact count your verdict. Setting it back to the model's verdict clears the mark; both changes stay in the history.
