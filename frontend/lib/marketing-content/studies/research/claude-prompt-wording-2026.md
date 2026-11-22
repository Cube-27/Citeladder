---
title: 'Does wording change which brands Claude recommends? 20 questions, 10 rewrites each'
slug: '/research/claude-prompt-wording-2026'
meta_title: 'Does wording change which brands Claude recommends? 20 questions tested'
meta_description: 'CiteLadder asked Claude 20 buyer questions in 10 wording styles, three runs each. See which rewrites moved the brand list and which were noise.'
primary_keyword: 'prompt wording AI recommendations'
secondary_keywords:
  ['does prompt wording matter', 'AI visibility prompt list', 'Claude recommendation consistency']
search_intent: 'Learn how much rewording a buyer question changes the brands Claude recommends'
content_type: 'original research report'
related_guides:
  ['/research/who-claude-recommends-2026', '/research/prompt-builder-model-comparison-2026']
index_group: 'Claude recommendations'
index_meta: '660 answers · 10 wording styles · 2026-11-08'
reviewed_at: '2026-11-08'
published_at: '2026-11-08'
author: 'Abhineet Jain'
product:
  heading: 'Track how Claude recommends your brand'
  href: '/platform/ai-visibility'
  body: 'CiteLadder runs your buyer prompts across Claude, ChatGPT, Gemini, Google AI Overviews and Google AI Mode and tracks your mentions, position and competitors over time. Every result is tied to its recorded answer, so you can check whether a change comes from wording or from normal variation.'
---

Claude does not give the same brand list twice, even for the exact same question. CiteLadder took 20 buyer questions, rewrote each one in 10 styles and ran every wording three times. The original question's own runs agreed on 67.6% of brands on average. Rewrites agreed with the original on 61.5%. Most rewording barely moved the answer beyond that normal variation. Two kinds of change did move it: asking for exactly three picks, and asking which option most people use.

## Why wording matters for a prompt list

AI visibility tracking starts with a list of buyer prompts. You send them to a model, record which brands it names, and repeat over time. The results are only as good as the prompts.

Real buyers phrase the same need in many ways. Some type keywords. Some write polite full sentences. Some add the year or make typos. If each phrasing produced a different brand list, a prompt list would need to cover dozens of variants per topic. If phrasing barely mattered, one wording per topic would do.

This study measures where Claude sits between those two cases, so you can decide how many wordings to track and which differences to ignore.

## How the study worked

We wrote one buyer question in each of 20 categories, from CRM for small businesses to robot vacuums. Another model rewrote each question in 10 styles:

- **casual**: short and hurried, lower case allowed
- **keywords**: search-engine keywords, no full sentence
- **formal**: polite business register
- **imperative**: an instruction starting with a verb such as "Recommend"
- **top_three**: asks for exactly three picks
- **current_year**: adds 2026
- **honest**: asks for an honest, unbiased answer
- **typo**: the original wording with two realistic typing mistakes
- **first_person**: adds a short personal reason without new requirements
- **which_do_most_use**: asks which option most people use

We sent every wording to Claude Sonnet 5.5 through the Anthropic API three times, with low effort, no tools and no system prompt. That made 660 answers. Another model listed the brands named in each answer, and code compared the brand sets.

**Agreement** is how much two brand sets overlap. We measured it two ways:

- **Baseline**: the original question's three runs compared with each other. This shows how much Claude varies when nothing about the wording changes.
- **Agreement with the original**: the original's runs compared with a variant's runs.

The baseline matters because Claude is not deterministic. If a variant agrees with the original about as much as the original agrees with itself, the wording did nothing beyond normal run-to-run noise. Only a clear drop below the baseline points to an effect of wording.

## The overall result

Across the 20 questions, the original's own runs agreed on 67.6% of brands. Variants agreed with the original on 61.5%. So rewording added a modest amount of change on top of the variation Claude shows with identical wording.

The most-named brand held up well. In 151 of the 200 variants, the brand named most often matched the original's most-named brand.

The baseline itself varied a lot by topic. The note-taking question agreed with itself 100% of the time. The video editing question agreed with itself on only 48.8%. Topics with a low baseline tended to stay noisy under any wording.

## Which styles moved answers least and most

Average agreement with the original, against the 67.6% baseline:

- formal: 67.3%
- typo: 66.8%
- imperative: 64.9%
- honest: 63.9%
- casual: 63.7%
- first_person: 62.1%
- current_year: 60.7%
- keywords: 59%
- which_do_most_use: 54.5%
- top_three: 52.4%

Formal wording and typos landed close to the baseline. For brand sets, they behaved almost like re-running the same question. Imperative, honest, casual and first-person rewrites sat a little lower.

Keywords and the current year moved answers more. Both also produced longer lists, which brings in brands the original did not name.

The most-named brand tells a slightly different story. It stayed the same in 18 of 20 questions for formal and first_person, 17 for honest, 16 for casual and current_year, 15 for typo, 14 for imperative, 13 for keywords and top_three, and 11 for which_do_most_use. Typos kept the brand set close but flipped the top brand more often than formal wording did. When the top two brands are close, small changes can swap their order.

## The “which do most people use” style

This style changes the meaning on purpose. It keeps the category but asks about popularity, not quality. It moved answers the most after top_three, at 54.5% agreement, and kept the most-named brand in only 11 of 20 questions.

The shift often pushed a market leader to the top:

- "Which wireless earbuds do most people use this year?" agreed with the original on 19.6%. The most-named brand moved from Sony to Apple, and research firms such as Counterpoint Research and IDC appeared.
- "Which email marketing service do most people use?" agreed on 21.6%. The top brand moved from Postmark to Mailchimp. This rewrite also dropped the original's focus on deliverability, which explains part of the change.
- "Which cloud drive do most people use for keeping files synced across all their devices?" agreed on 28.4%, and the top brand moved from Dropbox to Google.

Where the best option and the most common option are the same, little changed. "Which SEO tool do most people use for backlink data?" agreed on 88.9%, above its 77.8% baseline, and Ahrefs stayed on top. "Which site do most people use to hire freelancers for small projects?" agreed on 61%, level with its 60.8% baseline.

For tracking, treat "best" and "most used" as separate prompts. They measure different things.

## How the number of brands per answer changed

The original questions named 8.5 brands per answer on average. Most styles stayed near that. Three stood out:

- **top_three**: 6.2 brands per answer, the fewest
- **current_year**: 9.6
- **keywords**: 9.5

Asking for three picks shortened answers, but Claude still often named more than three brands. It mentioned alternatives, runners-up or parent companies. "What are the three top rated wireless earbuds according to reviewers this year?" still averaged 12 brands per answer. "What are the top three CRM recommendations for a growing small business?" averaged 3.7.

Shorter lists lower agreement with a longer original almost by design. Fewer names means less overlap. So the low top_three score partly reflects list length. It is still a real effect for tracking: a brand ranked fourth or fifth in a full answer can drop out once the user asks for three.

Adding 2026 tended to pull in review sites and research firms. Examples include G2, Capterra, Reddit, Gartner, Synergy Research, Tom's Guide and PCMag. The brand extraction counted these as names, which raised the count and lowered overlap.

## Notable individual questions

**Cloud hosting providers.** This question showed the widest swings. "I'm trying to choose where to host my work, so who are the leading cloud providers and which one is best?" agreed with the original on only 18.3%, against a 63.1% baseline. Answers grew to 16.7 brands. The most-named brand was listed as "AWS" where the original had "Amazon Web Services". That is partly a naming issue. The keyword version, "leading cloud providers best cloud hosting comparison", agreed on 30.2% and put DigitalOcean on top.

**AI writing tools.** The original's runs agreed on 88.9% and named Claude most often. "What are the three most reliable AI writers for blog posts, ads, and emails?" agreed on 25.2%, shared none of the original's top three, and put OpenAI first. The 2026 version put Jasper first.

**Note-taking apps.** The original agreed with itself 100% of the time. "Recommend a note-taking app for everyday use." matched the brand set at 100%, yet the most-named brand came out as Notion where the original had Apple. "What note-takng app would you recomend for everyday use?" agreed on 90.5% with the same Notion result. The brand set can stay fixed while the order changes.

**VPN apps.** The original's baseline was 51.3%, and its most-named brand was Mullvad. Most variants put NordVPN first, including "which vpn is fastest and most reliable?". When most rewrites agree on a different leader, the original's leader may have been the outlier.

**SEO tools.** This was the most stable topic. Ahrefs stayed on top in every style. Several variants scored 88.9%, above the original's 77.8% baseline.

**Naming of parent brands.** "What are the three most reliable cloud accounting platforms for a growing small business?" made Intuit the most-named brand where the original had QuickBooks. "What are the three most reliable analytics tools for understanding visitor behavior on my site?" made it Google where the original had Google Analytics. These read as changes in how a brand is named, more than changes in which product is recommended.

## What this means for writing a prompt list

- **Run each prompt more than once.** Claude changes its brand list even when the wording is identical. A single run can mislead you about any one brand.
- **Do not multiply surface variants.** Formal wording, typos, imperatives, casual phrasing and "honest" framing stayed close to the baseline. Tracking all of them mostly adds more samples of the same answer.
- **Track changes in intent separately.** "Best", "most used" and "top three" are different questions. They produced the largest shifts. If your buyers ask them, give each its own prompt.
- **Add a keyword version if buyers search that way.** Keyword prompts moved answers more than full sentences and produced longer lists.
- **Be careful with the year.** Adding 2026 pulled in review sites and research firms and lowered agreement.
- **Treat differences inside the baseline as noise.** If a brand's presence changes between two wordings by about as much as it changes between runs of one wording, the wording is not the cause.
- **Normalize brand names.** AWS and Amazon Web Services, or Intuit and QuickBooks, should be grouped before you compare results. Otherwise naming looks like movement.

## Limits of this study

- **One model.** We tested only Claude Sonnet 5.5. ChatGPT and Gemini may react to wording differently.
- **From memory.** No tools and no web search were used. Answers with search enabled may respond to the year or to keywords in other ways.
- **20 questions.** One base question per category. Other questions in the same category could behave differently.
- **Three runs.** Three runs per wording is a small sample. It explains why some variants scored above their own question's baseline.
- **Model-made rewrites and extraction.** Another model wrote the rewrites and listed the brands. One rewrite dropped part of the original's meaning. The extraction counted review sites, research firms and product lines as brands and did not merge alternate names.

## Results by wording style

Each row covers 20 base questions. Agreement is the average overlap between the brands named in the original question's three runs and in the reworded question's three runs. The original question agreed with itself 67.6% of the time on average.

| Style             | What changed                                                                                         | Agreement with original | Same most-named brand | Top three brands shared | Brands per answer |
| ----------------- | ---------------------------------------------------------------------------------------------------- | ----------------------- | --------------------- | ----------------------- | ----------------- |
| casual            | Casual and short, the way someone types in a hurry, lower case allowed                               | 63.7%                   | 16 of 20              | 2.5 of 3                | 8.9               |
| keywords          | Search-engine keywords only, no full sentence, like "best x for y"                                   | 59%                     | 13 of 20              | 2 of 3                  | 9.5               |
| formal            | Formal and complete, polite business register                                                        | 67.3%                   | 18 of 20              | 2.3 of 3                | 8.2               |
| imperative        | An instruction instead of a question, starting with a verb such as "Recommend" or "Suggest"          | 64.9%                   | 14 of 20              | 2.1 of 3                | 8.2               |
| top three         | Asks for exactly three picks                                                                         | 52.4%                   | 13 of 20              | 1.9 of 3                | 6.2               |
| current year      | Adds the current year, 2026, as people often do                                                      | 60.7%                   | 16 of 20              | 2.3 of 3                | 9.6               |
| honest            | Asks for an honest, unbiased answer                                                                  | 63.9%                   | 17 of 20              | 2.3 of 3                | 8.3               |
| typo              | Same wording as the original with two realistic typing mistakes                                      | 66.8%                   | 15 of 20              | 2.2 of 3                | 8.5               |
| first person      | First person with a one-clause reason the person is asking, without adding new requirements          | 62.1%                   | 18 of 20              | 2.5 of 3                | 8.1               |
| which do most use | Asks which option most people use, which keeps the same category but shifts from best to most common | 54.5%                   | 11 of 20              | 1.8 of 3                | 8.9               |

## Results by question

| Category                                 | Original question agreed with itself | Lowest agreement with a rewrite | Rewrites with a different most-named brand                                                                                                                        |
| ---------------------------------------- | ------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRM for small businesses                 | 88.9%                                | 54.4% (which do most use)       | none                                                                                                                                                              |
| Email marketing software                 | 51.7%                                | 21.6% (which do most use)       | top three: Mailchimp; typo: Mailchimp; which do most use: Mailchimp                                                                                               |
| SEO tools                                | 77.8%                                | 75.9% (keywords)                | none                                                                                                                                                              |
| Project management software              | 53.8%                                | 51.6% (which do most use)       | none                                                                                                                                                              |
| Help desk software                       | 63.8%                                | 32.8% (top three)               | none                                                                                                                                                              |
| Marketing automation platforms           | 64%                                  | 55.2% (current year)            | none                                                                                                                                                              |
| Web analytics tools                      | 80.5%                                | 50.2% (top three)               | imperative: Google Ads; top three: Google; current year: Plausible; typo: Plausible                                                                               |
| Ecommerce platforms                      | 77.8%                                | 59.3% (top three)               | none                                                                                                                                                              |
| Accounting software for small businesses | 81%                                  | 45.4% (top three)               | keywords: Xero; top three: Intuit; which do most use: Intuit                                                                                                      |
| Cloud hosting providers                  | 63.1%                                | 18.3% (first person)            | casual: Microsoft; keywords: DigitalOcean; imperative: Microsoft; honest: Oracle; first person: AWS                                                               |
| AI writing tools for marketing           | 88.9%                                | 25.2% (top three)               | top three: OpenAI; current year: Jasper; which do most use: ChatGPT                                                                                               |
| VPN apps                                 | 51.3%                                | 44.4% (honest)                  | casual: NordVPN; keywords: NordVPN; formal: Proton VPN; imperative: NordVPN; top three: NordVPN; current year: NordVPN; typo: NordVPN; which do most use: NordVPN |
| Language learning apps                   | 50.3%                                | 42.9% (top three)               | keywords: Anki                                                                                                                                                    |
| Note-taking apps                         | 100%                                 | 58.5% (current year)            | keywords: Notion; imperative: Notion; top three: Notion; current year: Obsidian; honest: Obsidian; typo: Notion; first person: Google                             |
| Video editing software                   | 48.8%                                | 38.7% (top three)               | casual: DaVinci Resolve; keywords: Blackmagic; imperative: Blackmagic; honest: DaVinci Resolve; which do most use: DaVinci Resolve                                |
| Web hosting                              | 68.8%                                | 52.9% (typo)                    | which do most use: GoDaddy                                                                                                                                        |
| Cloud storage services                   | 56.5%                                | 28.4% (which do most use)       | formal: Apple; which do most use: Google                                                                                                                          |
| Wireless earbuds                         | 53.3%                                | 19.6% (which do most use)       | which do most use: Apple                                                                                                                                          |
| Robot vacuums                            | 71.5%                                | 53.5% (keywords)                | which do most use: iRobot                                                                                                                                         |
| Freelance marketplaces                   | 60.8%                                | 56.9% (honest)                  | casual: Fiverr; keywords: Fiverr; imperative: Fiverr; top three: Fiverr; typo: Fiverr                                                                             |

## Every wording of one question

| Style             | Wording                                                                                                      | Agreement with original | Most-named brand |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------- | ---------------- |
| original          | What CRM would you recommend for a growing small business?                                                   | 88.9% (with itself)     | HubSpot          |
| casual            | good crm for a small business that's growing?                                                                | 74.9%                   | HubSpot          |
| keywords          | best crm for growing small business                                                                          | 65.9%                   | HubSpot          |
| formal            | Could you please recommend a suitable CRM system for a small business that is currently experiencing growth? | 75.6%                   | HubSpot          |
| imperative        | Recommend a CRM for a growing small business.                                                                | 65.3%                   | HubSpot          |
| top three         | What are your top three CRM recommendations for a growing small business?                                    | 69.3%                   | HubSpot          |
| current year      | What CRM would you recommend for a growing small business in 2026?                                           | 79.1%                   | HubSpot          |
| honest            | Honestly and without bias, what CRM would you recommend for a growing small business?                        | 68.5%                   | HubSpot          |
| typo              | What CRM would you reccomend for a growing smal business?                                                    | 79%                     | HubSpot          |
| first person      | I run a small business that's starting to grow, so what CRM would you recommend for me?                      | 88.1%                   | HubSpot          |
| which do most use | Which CRM do most growing small businesses use?                                                              | 54.4%                   | HubSpot          |

## Frequently asked questions

### How much does rewording a prompt change Claude's brand list?

Less than the run-to-run variation alone might suggest. The original questions agreed with themselves on 67.6% of brands across three runs. Rewrites agreed with the original on 61.5%. The brand named most often stayed the same in 151 of the 200 variants.

### Which wording styles can I safely treat as the same prompt?

Formal wording and typos came closest to the baseline, at 67.3% and 66.8% against 67.6%. Imperative, honest, casual and first-person rewrites were also close. For brand sets, these behaved much like re-running the original question.

### Does asking for the top three change which brands appear?

Yes. The top_three style had the lowest agreement with the original, at 52.4%, and averaged 6.2 brands per answer against 8.5 for the originals. Claude often still named more than three brands, but lower-ranked brands were more likely to drop out.

### Should I track “best” and “most popular” prompts separately?

Yes. Asking which option most people use kept the top brand in only 11 of 20 questions. For wireless earbuds it moved the top brand from Sony to Apple. Where the best and most common option were the same, as with Ahrefs for backlink data, results stayed stable.

## Sources

1. CiteLadder measurement of Claude Sonnet 5.5 through the Anthropic API: 20 base buyer questions from the [Claude recommendations study](/research/who-claude-recommends-2026), each in 10 rewordings, three runs each, from memory; collected 2026-11-08
