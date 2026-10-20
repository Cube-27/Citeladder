---
title: 'How to Track Brand Mentions in ChatGPT: A Step-by-Step Method'
slug: '/track-brand-mentions-chatgpt'
meta_title: 'How to Track Brand Mentions in ChatGPT'
meta_description: 'A step-by-step method to track what ChatGPT says about your brand: buyer prompts, repeated runs, a logging template, GA4 referrals and OpenAI crawlers.'
primary_keyword: 'how to track brand mentions in ChatGPT'
secondary_keywords:
  [
    'track what ChatGPT says about your brand',
    'check if ChatGPT mentions my brand',
    'ChatGPT brand monitoring',
    'ChatGPT brand mentions',
  ]
search_intent: 'Informational how-to: set up brand mention tracking in ChatGPT'
content_type: 'how-to guide'
reviewed_at: '2026-10-20'
related_guides: ['/llm-rank-tracker', '/blog/verify-improve-ai-search-visibility']
publication_status: 'editorial_review'
---

## How do you track brand mentions in ChatGPT?

**Track brand mentions in ChatGPT by running a frozen set of unbranded buyer questions on a schedule, asking each one several times, and logging one row per answer: whether you were named, where, with what sentiment, which sources were cited and which competitors appeared.** Report a mention rate with its sample size, keep mentions and citations separate, and compare only runs collected under the same conditions.

No console lists every conversation in which ChatGPT names you. What you can build is a consistent sample, by hand, with the API, with your analytics, or with a tracker you host yourself.

**Disclosure:** this guide is published by CiteLadder, which sells an [AI visibility](/platform/ai-visibility) tracker and publishes an [open source](/open-source) one. Third-party findings are cited to their sources.

## Step 1: Write prompts a buyer would type

Start with the [questions people ask before they know your name](/blog/ai-search-buyer-prompt-generation). Good prompts describe a need, a comparison or a problem:

- "What is the best inventory software for a retailer with three warehouses?"
- "Alternatives to [competitor] for a ten-person team"
- "How do I reduce stockouts without overordering?"

Weak prompts name you. "Tell me about MyBrand" measures whether ChatGPT can look you up, not whether it recommends you. Keep branded and comparison prompts in a separate group and never mix them into the unbranded rate.

Organise the set by topic, intent (category, comparison, problem, use case) and buying stage. Ten prompts is enough to start; twenty to fifty gives you segments you can read. Then freeze the wording. A reworded prompt gets a new ID and a new series.

## Step 2: Control the conditions

ChatGPT answers depend on who is asking and from where. Before you log anything, decide the conditions and keep them fixed.

- **Personalisation.** Use a Temporary Chat and choose the unpersonalised option, so memory and custom instructions do not shape the answer. OpenAI's help pages have changed the default over time, so check the setting rather than assuming it.[\[1\]](#source-1)
- **Location.** The ChatGPT app may use an approximate location from your IP address, and saved memory can influence search results.[\[2\]](#source-2) Record the country you tested from.
- **Web search.** Note whether the answer searched the web. Grounded and ungrounded answers draw on different brand sets, so they are different series.[\[3\]](#source-3)
- **Model and date.** Record the model shown in the app and the date. Both change the answer.

## Step 3: Repeat each prompt and log one row per answer

One answer tells you very little. OpenAI documents that responses are non-deterministic by default, and a measurement study found that the brands named for the same prompt overlapped by only 45 to 59 percent between consecutive days.[\[4\]](#source-4)[\[5\]](#source-5) Ask each prompt at least three times, in a fresh chat each time, and log every answer as its own row.

Use this template. One row is one answer, never one prompt.

| Column            | What to record                                                             |
| ----------------- | -------------------------------------------------------------------------- |
| prompt_id         | Stable ID for the frozen prompt wording                                    |
| date              | Date and time of the run                                                   |
| engine            | ChatGPT (app) or ChatGPT (API), with model name                            |
| location_language | Country and language used                                                  |
| web_search        | Yes, no, or unknown                                                        |
| named             | Yes or no: your brand appears in the answer text                           |
| position          | Order of first mention among the brands you track; blank if not named      |
| sentiment         | Positive, neutral, negative, with the quote that supports it               |
| recommended       | Yes or no: the answer suggests you for the stated need, not just names you |
| competitors_named | Every tracked competitor in the answer, in order                           |
| cited_domains     | Every source domain shown, and whether any is yours                        |
| status            | Answer, refusal, error or no answer                                        |
| raw_answer        | The full text, saved before you open any link                              |

Keep the raw answer. Scores can be recomputed from text; they cannot be recomputed from a score. Record refusals and errors as their own status so they never count as "not named".

## Mentions, citations and recommendations are different

An answer can name you without linking to your site, link to your site without naming you, or do both. It can also name you as the option that does not fit the question. Keep three labels apart:

- **Mention:** your brand appears in the answer text.
- **Citation:** one of your pages appears among the answer's sources. This is tracked on its own; see the guide to [AI citations](/ai-citation-tracking).
- **Recommendation:** the answer suggests you for the stated need. Read the sentence, not just the name.

A 2x2 of mention and owned citation gives four states per answer: named and cited, named but not cited, cited but not named, neither. Report them separately. Merging them into one visibility score hides which state changed.

### Turn rows into numbers you can defend

- **Mention rate:** answers that name you divided by all valid answers for the prompt. State both numbers.
- **Average position:** mean of the position column over answers that name you only.
- **Share of voice:** your mentions divided by all tracked-brand mentions in the same answers. Read the [share of voice](/ai-search-share-of-voice) guide before comparing it across prompt sets.
- **Owned citation rate:** answers citing at least one of your pages divided by all valid answers.

Small samples carry wide uncertainty. Three mentions in ten runs gives a 95 percent Wilson interval of roughly 11 to 60 percent; three in three gives roughly 44 to 100 percent.[\[6\]](#source-6) When the intervals from two periods do not overlap, the change is very unlikely to be noise. Overlapping intervals do not prove there was no change, so collect more runs before you decide. Either way, say how many answers each number is based on.

## Step 4: Automate with the API, with care

The OpenAI Responses API has a web search tool. With it on, the model can choose whether to search based on the prompt, the response lists the URLs it consulted, and URL citations are attached to the text with their location in the answer. You can set a user location with country, city, region and timezone.[\[7\]](#source-7) That makes a repeatable, permitted collection loop: fixed prompts, fixed settings, N runs, parsed into the template above.

Two caveats:

- **The API is not the app.** One study of 1,000 prompt executions found brand overlap of 24 percent and source overlap of 4 percent between API answers and answers captured from the ChatGPT interface, with web search triggering on 77 percent of API runs against 100 percent in the app.[\[8\]](#source-8) A second study of 2,565 matched pairs found brand overlap of 6 to 12 percent.[\[9\]](#source-9) Label API rows as API and never present them as what a user saw.
- **Search is optional unless you force it.** If the model decides not to search, you get an ungrounded answer in the same series. Log the search state per answer and split the series if it mixes.

## Step 5: See ChatGPT visits in Google Analytics 4

Mentions and clicks are different measurements. Most answers send no click at all, so zero [referral sessions](/platform/ai-referral-analytics) does not mean zero visibility. Where a click does happen, two things help you see it.

**utm_source=chatgpt.com.** OpenAI's publisher FAQ stated (as archived on 21 July 2026; the page has since been retired) that ChatGPT includes `utm_source=chatgpt.com` in referral URLs from ChatGPT search results, so publishers who allow OAI-SearchBot can track that traffic in analytics tools.[\[10\]](#source-10) OpenAI documents only the source parameter; do not assume a fixed medium or campaign value. Attribution is lost when the parameter is stripped, the URL is copied and pasted, or your analytics tag does not fire.

**The AI Assistant channel.** GA4's default channel group now includes an AI Assistant channel for sessions arriving from sources such as ChatGPT, Gemini, DeepSeek, Copilot and Grok. It excludes Google's AI Overviews and AI Mode, and assigns the medium `ai-assistant` when the referrer matches Google's list.[\[11\]](#source-11) If you need a different definition, build a custom channel group with a referrer regex and move it above Referral so it matches first.[\[12\]](#source-12)

Report [referral sessions](/blog/ai-referral-traffic-statistics-2026) next to your mention rate, never as a substitute for it.

## Make sure ChatGPT can read your site

OpenAI runs separate crawlers, each with its own purpose and robots.txt token.[\[13\]](#source-13)

- **OAI-SearchBot** surfaces sites in ChatGPT's search features. Sites that disallow it are not shown in ChatGPT search answers, though they can still appear as navigational links. Its published IP ranges are at openai.com/searchbot.json.
- **GPTBot** crawls content that may be used to train OpenAI's foundation models. Disallowing it signals that your content should not be used for training. It does not control search inclusion.
- **ChatGPT-User** fetches pages for actions a user starts inside ChatGPT. OpenAI states it is not used for automatic crawling, that robots.txt rules may not apply because a user initiated the request, and that it is not used to decide whether content appears in search.

The settings are independent: you can allow OAI-SearchBot and disallow GPTBot.[\[13\]](#source-13) Use the [AI crawler checker](/tools/ai-crawler-checker) to review your robots.txt rules, and check that your CDN or firewall allows the published IP ranges. To keep a page out of search results, use a noindex meta tag the crawler is allowed to read; a blocked page whose URL is known may still surface as a link and title.[\[10\]](#source-10)

## Step 6: Use a tracker

Once the set is frozen, a spreadsheet becomes the bottleneck. A tracker runs the prompts, repeats them, parses mentions and sources, and keeps the raw answer behind every number. The hosted version (citeladder.com) does this with a 7-day free trial on ChatGPT answers. Trial limits apply; see [pricing](/pricing). To keep every prompt and answer on your own machine, the same tool is open source under AGPL-3.0.

### Self-hosting the open-source tracker

The repository is [github.com/abhij1306/CiteLadder](https://github.com/abhij1306/CiteLadder).[\[14\]](#source-14)

1. **Run it.** Clone the repository, run `docker compose up -d --build` and open http://localhost:8100. There is no sign-up and no login, and the compose file binds to 127.0.0.1 only. Without Docker you need Node.js 26 or later, pnpm 12 and PostgreSQL 16.
2. **Create a project.** Enter your website; the tool researches the brand and proposes competitors and a buyer profile for you to confirm. Research and prompt generation need a model configured in `.env`. Anthropic and OpenAI are fully supported; any OpenAI-compatible endpoint, including a local Ollama, works for generation.
3. **Bring your own keys.** Add OpenAI, Anthropic, Google and DataForSEO keys under Settings. They are stored encrypted in your database, and the encryption key lives in the `citeladder_data` volume, so back up both together.
4. **Write prompts like a buyer.** Generate suggestions from your site, market and competitors, review them, and accept only the ones you want tracked.
5. **Run an audit and read the answers.** Each answer is recorded with its engine, prompt, date, where your brand appeared and the sources cited. Start with visibility and owned citation rate, and compare runs only under the same prompts and engines.
6. **Check your site.** Site Health crawls your site without any keys and reports AI crawler access in robots.txt and llms.txt, structure and freshness, with ranked actions. The tool never publishes anything to your site.

Before exposing it beyond your machine, put an authenticating reverse proxy in front and set `ALLOWED_HOSTS`; anyone who can reach the port can use the workspace and its stored keys.[\[14\]](#source-14) If you modify the code and let others use your version over a network, the AGPL requires you to offer them its source.

The tracker reports observed change between like-for-like runs. It does not tell you why an answer changed.

## Common mistakes

- **Your brand name in the prompt.** You measure recall, not recommendation.
- **One draw per prompt.** A single answer is one sample from a distribution.
- **Citations counted as mentions.** A cited page and a named brand are different events.
- **The prompt set drifts.** Reworded prompts are new prompts. Start a new series.
- **Logged-in history and memory left on.** Your past chats shape the answer.
- **Competitors ignored.** Position and share of voice only exist relative to a tracked set.
- **Zero referrals read as zero visibility.** Most answers send no click.
- **API results described as the app.** Label the surface on every row.
- **Results kept in one person's spreadsheet.** Store the raw answers somewhere the team can reach.

For how position inside an answer is defined and why a single rank is noise, see the [LLM rank tracker](/llm-rank-tracker) page.

## Frequently asked questions

### How do I check if ChatGPT mentions my brand for free?

Open a Temporary Chat, choose the unpersonalised option, and ask ten unbranded buyer questions three times each. Log every answer with the template above. The hosted version of CiteLadder also offers a 7-day free trial on ChatGPT answers; trial limits apply.

### Does ChatGPT give everyone the same answer?

No. Responses are non-deterministic by default, and location, memory, model and web search state all change them.[\[2\]](#source-2)[\[4\]](#source-4) Measure a rate over repeated runs.

### How many prompts and how many repeats do I need?

Ten prompts and three repeats is a usable start. Published studies disagree on how much repetition alone helps compared with spreading across languages and models, so state your sample size rather than relying on a fixed rule.[\[5\]](#source-5)

### Should I track with the API or the ChatGPT app?

Both are valid if labeled. The API is repeatable and permitted; the app is what a person sees. They differ materially in brands and sources, so never merge them in one trend.[\[8\]](#source-8)[\[9\]](#source-9)

### What is utm_source=chatgpt.com?

The parameter OpenAI adds to referral URLs from ChatGPT search results so analytics tools can attribute the visit.[\[10\]](#source-10) It is lost when a link is copied or stripped, and most answers produce no click.

### Does blocking GPTBot remove me from ChatGPT search?

No. GPTBot is the training crawler. Search inclusion is controlled by OAI-SearchBot, which you can allow while disallowing GPTBot.[\[13\]](#source-13)

### Can I track Claude, Gemini and Google AI Overviews the same way?

Yes, with the same method. Anthropic's web search tool returns citations with every search, and Gemini's grounding returns the queries and sources it used.[\[15\]](#source-15)[\[16\]](#source-16) Google AI Overviews is a search surface rather than an API. CiteLadder tracks all four and labels each result by surface.

### Can a tracker prove why my visibility changed?

No. A tracker observes change between comparable runs. Attributing it to a content edit, a crawler setting or a model update needs a study design of its own.

## Sources

1. <span id="source-1"></span> OpenAI Help, [Temporary chat in ChatGPT](https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt).
2. <span id="source-2"></span> OpenAI Help, [ChatGPT search](https://help.openai.com/en/articles/9237897-chatgpt-search).
3. <span id="source-3"></span> arXiv 2609.05059, [Repeated Queries Exhaust an LLM's Brand Recommendations but Not Its Sources](https://arxiv.org/pdf/2609.05059).
4. <span id="source-4"></span> OpenAI, [Advanced usage: reproducible outputs](https://platform.openai.com/docs/guides/advanced-usage).
5. <span id="source-5"></span> arXiv 2604.07585, [Don't Measure Once: Measuring Visibility in AI Search](https://arxiv.org/pdf/2604.07585).
6. <span id="source-6"></span> dev.to, [Build a minimal AI rank tracker in Python](https://dev.to/furqank729/build-a-minimal-ai-rank-tracker-in-python-3df1), Wilson interval example.
7. <span id="source-7"></span> OpenAI, [Web search tool guide](https://platform.openai.com/docs/guides/tools-web-search).
8. <span id="source-8"></span> Surfer SEO, [LLM scraped AI answers vs API results](https://surferseo.com/blog/llm-scraped-ai-answers-vs-api-results/).
9. <span id="source-9"></span> Brandlight Research, [UI vs API](https://research.brandlight.ai/ui-vs-api.html).
10. <span id="source-10"></span> OpenAI Help, [Publishers and developers FAQ](https://web.archive.org/web/20260721063426/https://help.openai.com/en/articles/12627856-publishers-and-developers-faq), Internet Archive snapshot of 21 July 2026; the live URL now redirects to an unrelated article.
11. <span id="source-11"></span> Google, [GA4 default channel group](https://support.google.com/analytics/answer/9756891?hl=en).
12. <span id="source-12"></span> Google, [GA4 custom channel groups](https://support.google.com/analytics/answer/13051316).
13. <span id="source-13"></span> OpenAI, [Overview of OpenAI crawlers](https://platform.openai.com/docs/bots).
14. <span id="source-14"></span> [CiteLadder on GitHub](https://github.com/abhij1306/CiteLadder), README and SECURITY.md, reviewed 20 October 2026.
15. <span id="source-15"></span> Anthropic, [Web search tool](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool).
16. <span id="source-16"></span> Google, [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/generate-content/google-search).
