---
title: 'LLM Rank Tracker: Track Brand Position in ChatGPT, Claude, Gemini and AI Overviews'
slug: '/llm-rank-tracker'
meta_title: 'LLM Rank Tracker for ChatGPT, Claude, Gemini and AI Overviews'
meta_description: 'What an LLM rank tracker measures, how position inside an AI answer is defined, why one answer is not a rank, and how to set up tracking you can defend.'
primary_keyword: 'LLM rank tracker'
secondary_keywords:
  [
    'AI rank tracker',
    'ChatGPT rank tracker',
    'track brand ranking in ChatGPT',
    'AI answer position tracking',
  ]
search_intent: 'Commercial investigation: understand what an LLM rank tracker measures and choose one'
content_type: 'product-led landing page'
reviewed_at: '2026-10-20'
publication_status: 'editorial_review'
---

## What is an LLM rank tracker?

**An LLM rank tracker runs a fixed set of buyer-style prompts against AI assistants on a schedule, repeats each prompt several times, and records whether your brand was named, where it appeared among the brands named, which competitors appeared and which sources were cited.** It is the AI-answer counterpart of a search rank tracker, with one difference that changes everything: there is no results page. The "rank" lives inside a generated answer that can change from one request to the next.

This page explains what rank means inside an answer, why one answer is not a rank, what changes the answer before you ever read it, and how to set up tracking whose numbers you can defend. It ends with how CiteLadder does it, hosted or [self-hosted](/open-source).

**Disclosure:** CiteLadder publishes this page and sells an [AI visibility](/platform/ai-visibility) tracker. Third-party findings below are cited to their sources and are not CiteLadder test results.

## What "rank" means inside an AI answer

Search engines give you a numbered list of URLs. AI assistants give you prose, sometimes with a list inside it, sometimes with a source panel beside it. Two definitions of rank are in practical use, and a tracker should tell you which one it reports.

### Order of first mention among tracked brands

Read the answer from the top. The first tracked brand to appear is position 1, the next distinct tracked brand is position 2, and so on. Brands you do not track are ignored, so the number is relative to your competitor set, not to every company the answer names. Some trackers and public scripts use this definition explicitly, including a separate field for list position.[\[1\]](#source-1)

### List position

When the answer contains a numbered or bulleted list of options, list position is the index of the first item that names your brand. It is closer to what a reader experiences, but it is only defined when a list exists, and it breaks on nested bullets or on answers that name a brand in a sentence before the list begins. One Python tutorial that implements this method warns that nested sub-bullets will be miscounted.[\[2\]](#source-2)

### Position is only defined when you are named

Position has no value in an answer that does not mention you. A tracker that reports "position 0" or "position 10" for absence is folding two different facts, mention and order, into one number. Keep them apart: a mention rate over all answers, and an average position over the answers that mention you. Position in the source list, which is where your pages sit among cited links, is a third signal and belongs with [AI citations](/ai-citation-tracking), not with brand position.

## Why one answer is not a rank

A single answer is one draw from a distribution. OpenAI documents that Chat Completions are non-deterministic by default and that even a fixed seed produces only mostly deterministic output, which can still change when the model configuration changes.[\[3\]](#source-3)

Published measurement studies put numbers on this:

- A study of AI search visibility found that the set of cited sources for the same prompt overlapped by only 34 to 42 percent between consecutive days, and the set of named brands by 45 to 59 percent, with similar instability between same-day runs.[\[4\]](#source-4)
- A variance decomposition over 12,933 responses found that resampling the same prompt accounted for 34.8 percent of the variation and query language for 26.5 percent. The reliability of a brand ranking from a single answer was about 0.01; it rose to about 0.36 only across the full design of languages and models.[\[5\]](#source-5)
- A separate paper proposes a repeated-query method and decomposes variance into token sampling, prompt phrasing, model and version drift. In one reanalysis, iteration plus residual variance was 78.2 percent of the total.[\[6\]](#source-6)
- Researchers evaluating brand retrieval in LLM recommendations recommend treating the answer as a stochastic retrieval-and-ranking process rather than reading individual lists.[\[7\]](#source-7)

The practical consequence: a rank is a statistic over repeated runs. Report the mention rate with its sample size, the average position over the answers where you were named, and compare only runs collected under the same prompts, engines and settings. A move from position 2 to position 3 on one draw is noise until it repeats.

## API answers, app answers, grounding and location

Before you compare two trackers, ask what each one actually asked, and how. Four settings change the answer before anyone measures it.

### API or consumer app

A model API and the consumer app that wraps it are different surfaces. One study of 1,000 prompt executions found brand overlap of 24 percent and source overlap of 4 percent between API answers and answers captured from the ChatGPT interface; the API answers averaged 406 words against 743 in the app, and web search triggered on 77 percent of API runs against 100 percent in the app.[\[8\]](#source-8) A second study of 2,565 matched pairs found brand overlap of 6 to 12 percent and the same first-named brand in 13 percent of ChatGPT pairs.[\[9\]](#source-9)

Neither method is the wrong one. The API is reproducible and permitted, and configuring it with web search and a location narrows the gap. The consumer app is what a particular signed-in person saw at a particular moment. A tracker should label every result by surface and should never describe an API answer as what users see.

### Grounding on or off

With web search available, the model decides whether to use it. OpenAI's web search tool lets the model choose to search or not based on the prompt, returns the list of URLs it consulted and attaches URL citations to the text.[\[10\]](#source-10) Anthropic's web search tool always returns citations for sources drawn from search results, and supports domain allow and block lists.[\[11\]](#source-11) Gemini's grounding decides per prompt whether a Google Search would improve the answer, and returns the search queries, source chunks and text-to-source spans it used.[\[12\]](#source-12)

Grounded and ungrounded answers draw on different brand sets. One study found that grounded engines exhaust their brand repertoire after a few repeats, while ungrounded engines were still naming new organisations at the fifteenth run, and that the two repertoires differed in size by three to six times.[\[13\]](#source-13) Record the grounding state with every answer, and do not merge grounded and ungrounded runs into one trend.

### Location and language

OpenAI's and Anthropic's web search tools accept a user location with country, city, region and timezone.[\[10\]](#source-10)[\[11\]](#source-11) The consumer ChatGPT app may use an approximate location from the IP address, and saved memory can also influence search results.[\[14\]](#source-14) Query language was the largest systematic source of variance in the decomposition study cited above.[\[5\]](#source-5) Fix country and language per prompt set, and treat a change in either as a new trend line.

## How to set up LLM rank tracking

### 1. Build a prompt set that reads like a buyer

Write the questions a buyer would type before they know your name: "best X for Y", "X vs Y for a team of ten", "how do I solve Z". Keep branded prompts in a separate group, because a prompt that names you measures your own typing. Organise by topic, intent and buying stage so you can read the results by segment. Freeze the wording; if a prompt changes, start a new series for it.

### 2. Choose repetitions

Decide how many times each prompt is asked per run and keep that number constant. More repeats narrow the interval around your mention rate; the studies above disagree on how much repetition alone buys compared with spreading across languages and models, so treat any fixed count as a working choice, not a guarantee.[\[5\]](#source-5)[\[6\]](#source-6)

### 3. Pick engines and surfaces, and label them

Decide which assistants matter to your buyers and, for each, whether you are measuring the API, the consumer surface or both. Record grounding state, country and language with each engine. Compare an engine only with itself.

### 4. Name your competitors and their aliases

Position is relative to the brands you track. List each competitor with its product names and common misspellings, and match on whole words so a short brand name does not match inside a longer word.

### 5. Set a cadence and compare like with like

Daily, weekly or on demand: the cadence matters less than consistency. Compare run to run under the same prompts, engines and settings, and keep failed collections distinct from answers that did not name you. A run that returned no answer is unknown, not zero.

## What to look for in an LLM rank tracker

| Question to ask                           | What a good answer looks like                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| How is position defined?                  | Stated precisely: first mention among tracked brands, or list position, with the rule for absence |
| How many answers is each number based on? | The sample size is shown next to the rate or average                                              |
| Is each prompt repeated within a run?     | Yes, with a fixed count, and the per-prompt count is visible                                      |
| Which surface was measured?               | Every result is labeled API or consumer surface, with grounding state                             |
| Can I open the raw answer?                | Every trend point opens the recorded answer, engine, date and cited sources                       |
| Are mentions and citations separate?      | A brand can be named without a cited page and the reverse; both are tracked on their own          |
| What happens when a collection fails?     | Failed, unavailable and not-configured states are kept apart from an observed zero                |
| Are sponsored placements counted?         | Ads are recorded separately and never counted as mentions, citations or position                  |
| Can I export and recompute one metric?    | Raw rows with prompt, engine, date, mention, position and sources                                 |
| Can I run it myself?                      | An open-source build you can self-host, or a hosted version, with the method the same in both     |

## How CiteLadder tracks rank

CiteLadder runs the same prompt portfolio across ChatGPT, Gemini, Claude and Google AI Overviews. Each prompt is repeated several times per run to measure consistency, runs can be scheduled once, hourly, daily or weekly, and every metric states how many answers it is based on.[\[15\]](#source-15)

Each recorded answer shows whether your brand was mentioned, where it ranked among the brands named, and whether your own pages were cited. Consumer answers and model APIs are labeled by surface. Query fan-out is shown when an engine exposes the searches it ran and is marked unavailable when it does not. Missing data is shown as missing, never as zero.[\[15\]](#source-15)

Competitors sit side by side with visibility, average position, [share of voice](/ai-search-share-of-voice) and citations for every brand you track. Perception classifies how each answer describes each brand, with net sentiment and the quotes behind each theme. Sponsored placements that ChatGPT Search shows beside an answer are recorded apart from citations and never change a visibility score.[\[15\]](#source-15)

What CiteLadder reports is observed change under the same prompts and engines. It does not tell you why an answer changed.

## Hosted or self-hosted

The hosted version (citeladder.com) runs the collection for you. It offers a 7-day free trial on ChatGPT answers. Trial limits apply. See [pricing](/pricing) for current plans.

The open-source build at [github.com/abhij1306/CiteLadder](https://github.com/abhij1306/CiteLadder) is licensed under AGPL-3.0. It is a single-workspace install with no login that binds to 127.0.0.1, and you bring your own model and data-provider keys, which are stored encrypted in your own database. Put an authenticating reverse proxy in front before exposing it beyond your machine.[\[16\]](#source-16) For a step-by-step setup, see the guide to tracking [brand mentions in ChatGPT](/track-brand-mentions-chatgpt).

## LLM rank tracker vs SEO rank tracker

| Aspect            | SEO rank tracker                       | LLM rank tracker                                                    |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------- |
| Unit tracked      | A keyword                              | A prompt, usually a full question                                   |
| Position means    | Your URL among ranked results          | Your brand among the brands named in one generated answer           |
| Possible outcomes | Ranked at N, or not in the top N       | Named, cited, named and cited, absent, or collection failed         |
| Stability         | One result page per query and location | A distribution; the same prompt gives different answers             |
| Sources           | The result itself is the URL           | Cited pages are a separate signal from the brand mention            |
| Engines           | Google, Bing                           | ChatGPT, Claude, Gemini, Google AI Overviews, each on its own terms |

Rank tracking is one input to [generative engine optimization](/generative-engine-optimization). For a broader shortlist of [AI visibility platforms](/best-ai-visibility-platforms), see our comparison.

## Frequently asked questions

### Can a brand really rank in ChatGPT?

A brand can appear earlier or later, more or less often, in the answers an assistant gives to a set of prompts. That is measurable over repeated runs. There is no fixed position to hold, and no method guarantees placement.

### How is position in an AI answer calculated?

The common definition is the order of first mention among the brands you track: the first tracked brand named in the answer is position 1. Some tools report list position instead. Ask your tracker which rule it uses and how it handles answers that do not name you.

### Why does my rank change between runs?

Because the answer changes between requests even when nothing about your site has changed. OpenAI documents the non-determinism, and published studies measure day-to-day brand-set overlap well below 100 percent.[\[3\]](#source-3)[\[4\]](#source-4) Read position as an average over repeated runs, not as a single number.

### Should I track the API or the consumer app?

Track what you can collect consistently and label it. API answers and app answers differ materially in brands and sources.[\[8\]](#source-8)[\[9\]](#source-9) CiteLadder labels each result by surface so the two are never mixed in one trend.

### Is the rank I see the same as what my customers see?

No tracker can claim that. Location, personalisation, grounding and sampling all differ between your collection and any one person's chat. A tracker gives you a consistent sample you can compare over time, not a census of conversations.

### Which engines does CiteLadder track?

ChatGPT, Gemini, Claude and Google AI Overviews, depending on plan. The free trial covers ChatGPT answers only.

### Is CiteLadder open source?

Yes. The self-hosted build is published under AGPL-3.0 at github.com/abhij1306/CiteLadder. The hosted version runs the same measurement without the setup.

## Sources

1. <span id="source-1"></span> Parseforge, [AI rank tracker: brandRank and brandListPosition fields](https://parseforge.co/a/ai-rank-tracker).
2. <span id="source-2"></span> dev.to, [Build a minimal AI rank tracker in Python](https://dev.to/furqank729/build-a-minimal-ai-rank-tracker-in-python-3df1).
3. <span id="source-3"></span> OpenAI, [Advanced usage: reproducible outputs](https://platform.openai.com/docs/guides/advanced-usage).
4. <span id="source-4"></span> arXiv 2604.07585, [Don't Measure Once: Measuring Visibility in AI Search](https://arxiv.org/pdf/2604.07585).
5. <span id="source-5"></span> arXiv 2607.13304, [Where Does the Noise Come From?](https://arxiv.org/abs/2607.13304).
6. <span id="source-6"></span> arXiv 2609.04047, [The Dice Roll Method](https://arxiv.org/html/2609.04047).
7. <span id="source-7"></span> arXiv 2609.16304, [Evaluating Brand Retrieval and Ranking in LLM Recommendations](https://arxiv.org/html/2609.16304v1).
8. <span id="source-8"></span> Surfer SEO, [LLM scraped AI answers vs API results](https://surferseo.com/blog/llm-scraped-ai-answers-vs-api-results/).
9. <span id="source-9"></span> Brandlight Research, [UI vs API](https://research.brandlight.ai/ui-vs-api.html).
10. <span id="source-10"></span> OpenAI, [Web search tool guide](https://platform.openai.com/docs/guides/tools-web-search).
11. <span id="source-11"></span> Anthropic, [Web search tool](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool).
12. <span id="source-12"></span> Google, [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/generate-content/google-search).
13. <span id="source-13"></span> arXiv 2609.05059, [Repeated Queries Exhaust an LLM's Brand Recommendations but Not Its Sources](https://arxiv.org/pdf/2609.05059).
14. <span id="source-14"></span> OpenAI Help, [ChatGPT search](https://help.openai.com/en/articles/9237897-chatgpt-search).
15. <span id="source-15"></span> [CiteLadder product information](https://citeladder.com/), reviewed 20 October 2026.
16. <span id="source-16"></span> [CiteLadder on GitHub](https://github.com/abhij1306/CiteLadder), README and SECURITY.md, reviewed 20 October 2026.
