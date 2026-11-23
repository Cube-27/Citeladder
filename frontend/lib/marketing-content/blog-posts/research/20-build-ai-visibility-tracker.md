---
title: 'How to Build an AI Visibility Tracker: Engine APIs, DataForSEO Settings and Detection Logic'
slug: '/blog/build-ai-visibility-tracker'
meta_title: 'Build an AI Visibility Tracker: APIs and Logic'
meta_description: 'A developer guide to collecting AI answers: web search settings for OpenAI, Claude and Gemini, DataForSEO AI Overview and LLM scraper settings, citation parsing and mention logic.'
primary_keyword: 'build an AI visibility tracker'
secondary_keywords:
  [
    'AI visibility API',
    'DataForSEO AI Overview API',
    'LLM citation API',
    'track AI citations with the API',
    'DIY AI visibility tool',
  ]
search_intent: 'Technical how-to: a developer wants to collect AI answers, citations and mentions with their own code'
content_type: 'technical guide'
reviewed_at: '2026-11-23'
author: 'Abhineet Jain'
related_guides: ['/ai-citation-tracking', '/blog/best-open-source-aeo-platforms']
publication_status: 'editorial_review'
product:
  heading: 'Skip the plumbing'
  href: '/platform/ai-visibility'
  body: 'CiteLadder runs the collection, parsing and comparison described on this page for ChatGPT, Claude, Gemini, Google AI Overviews, Google AI Mode, ChatGPT Search and the Gemini app, and keeps every number tied to its stored answer.'
---

## What does it take to build your own AI visibility tracker?

**An AI visibility tracker has five parts: a prompt set, collectors that ask each engine and keep the raw response, parsers that pull out answer text and citations, matchers that find brand mentions and owned domains, and a store that compares runs only when their conditions match.** The collectors are the hardest part, because every engine returns citations in a different shape and the consumer apps have no official API.

This guide walks through each part as logic, with short pseudo-code. The settings and response fields come from the provider documentation and from the open-source code of CiteLadder, which runs this pipeline in production.[\[1\]](#source-1) Provider APIs change often; check each linked page before you ship.

If you only want to check your own brand by hand, the guide to [checking AI visibility](/blog/verify-improve-ai-search-visibility) is shorter. If you want definitions of citations and how to read them, see [AI citation tracking](/ai-citation-tracking).

## Two ways to collect an answer

There are two kinds of source, and they measure different things:

| Route                     | What you call                                                    | What you get                                                       | Main limit                                                 |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| Model API with web search | OpenAI Responses, Anthropic Messages, Gemini, with a search tool | Answer text, inline citations, often the list of sources retrieved | An API answer is not what a signed-in user sees in the app |
| Search and app surfaces   | A SERP or scraper provider such as DataForSEO                    | Google AI Overviews, AI Mode, ChatGPT and Gemini app answers       | Slower, paid per task, and the response shape can change   |

Store which route produced each answer, and never pool the two into one number without saying so.

## Model APIs: turning on web search and reading citations

Without web search, a model answers from training data and cites nothing. Turn search on, cap the number of searches so cost stays predictable, and pass the market's country.

### OpenAI (Responses API)

Add the `web_search` tool. Location goes on the tool as an approximate `user_location` with an ISO country code. Ask for `web_search_call.action.sources` in `include` to get every URL the model consulted, which is usually longer than the list it cites.[\[2\]](#source-2)

```js
request = {
  model,
  input: prompt,
  max_output_tokens: 4096,
  store: false,
  tools: [{ type: 'web_search', user_location: { type: 'approximate', country: 'US' } }],
  max_tool_calls: 2,
  include: ['web_search_call.action.sources'],
};
```

Reading the response:

- Answer text: every `output_text` block inside `message` items in `output`.
- Citations: annotations of type `url_citation` on those blocks, each with `url`, `title`, `start_index` and `end_index`. The indexes point into the block's text, so you can store the exact cited span.
- Searches: `web_search_call` items. Their `action.sources` are the sources retrieved.
- Finish: `status`, and `incomplete_details.reason` when the output budget ran out. A `refusal` block means the model declined.

CiteLadder caps OpenAI at two tool calls per answer and every engine at 4,096 output tokens, both in configuration.[\[1\]](#source-1)

### Anthropic (Messages API)

Add the server tool `web_search_20250305` named `web_search`, with `max_uses` to cap searches and an optional `user_location`. Search is billed at $10 per 1,000 searches on top of tokens.[\[3\]](#source-3)

```js
request = {
  model,
  max_tokens: 4096,
  messages: [{ role: 'user', content: prompt }],
  tools: [
    {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 2,
      user_location: { type: 'approximate', country: 'US' },
    },
  ],
};
```

Reading the response:

- `content` interleaves `server_tool_use` blocks (the searches), `web_search_tool_result` blocks (the results read) and `text` blocks.
- Citations sit on `text` blocks as type `web_search_result_location`, with `url`, `title` and up to 150 characters of `cited_text`. There are no character offsets.
- The answer is the `text` after the last search block. Text before it is the model talking about its search. Join those blocks exactly as written, because one sentence can be split across several cited blocks.
- `usage.server_tool_use.web_search_requests` gives the number of searches for cost.
- `stop_reason` of `pause_turn` means the turn paused before the answer was finished. Anthropic lets you send the returned content back to continue it, which keeps the searches already paid for. CiteLadder keeps each attempt to one request, so it fails the attempt and retries.
- A `web_search_tool_result_error` with `too_many_requests` is a rate limit, not an empty answer.

If extended thinking is on, it shares the output budget, so set it deliberately for answer capture. CiteLadder sets Claude's thinking mode in its route configuration for this reason.[\[1\]](#source-1)

### Google Gemini

Add the `google_search` tool. Google's current documentation shows grounded answers through the Interactions API, with `url_citation` annotations carrying `url`, `title`, `start_index` and `end_index`, and `google_search_call` steps carrying the queries. Grounding is billed at $14 per 1,000 search requests on Gemini 3 and newer, after 5,000 free requests a month.[\[4\]](#source-4)

Two practical points:

- Citation titles in Google's examples are bare domains. CiteLadder reads the domain of a Gemini citation from its title.
- The response does not list the sources retrieved, so record them as unavailable for Gemini. It is not zero.

CiteLadder's Gemini API route has no location setting, so it measures only the project's default market there and marks other markets as not applicable.[\[1\]](#source-1)

### Perplexity and others

Perplexity's migration page says support for Sonar Chat Completions ended on 27 September 2026 and points developers to its Agent API, which returns a `search_results` output item.[\[5\]](#source-5) If you add Perplexity, build against the Agent API and expect the shape to change. CiteLadder does not ship a Perplexity collector.

Whatever the provider, normalise every response into one record before analysis:

```js
answer = {
  engine, route, model, market, prompt_id, repetition,
  text, finish_reason,
  citations: [{ ordinal, url, title, domain, start, end, cited_text }],
  sources_retrieved: [...] | null,   // null = this engine does not expose it
  search_queries: [...] | null,
  usage: { input_tokens, output_tokens, searches },
  raw_response,
}
```

## DataForSEO: Google AI Overviews, AI Mode and the ChatGPT and Gemini apps

DataForSEO is the practical way to read surfaces that have no official API. CiteLadder uses four of its endpoints.[\[1\]](#source-1)

| Surface             | Endpoint family                                      | Settings CiteLadder sends                                                                     |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Google AI Overviews | `/v3/serp/google/organic/task_post`                  | `location_code`, `language_code`, `device`, `os`, `depth: 10`, `load_async_ai_overview: true` |
| Google AI Mode      | `/v3/serp/google/ai_mode/task_post`                  | `location_code`, `language_code`, `device`, `os`                                              |
| ChatGPT app         | `/v3/ai_optimization/chat_gpt/llm_scraper/task_post` | `location_code`, `language_code`, `priority: 1`, `force_web_search: true`                     |
| Gemini app          | `/v3/ai_optimization/gemini/llm_scraper/task_post`   | `location_code`, `language_code`, `priority: 1`                                               |

### Settings that matter

- **`load_async_ai_overview: true`.** Without it, the organic SERP returns an AI Overview only from cache, so you undercount. With it, DataForSEO waits for the asynchronously loaded overview. It adds the base price again, refunded when no overview appears.[\[6\]](#source-6)[\[7\]](#source-7)
- **`force_web_search: true` for ChatGPT.** It makes the model search and cite current web pages, though DataForSEO does not guarantee citations.[\[8\]](#source-8)
- **Location and language.** Validate them against each surface's locations and languages lists before you submit. The lists differ by surface.
- **Keyword encoding and length.** The scraper accepts up to 2,000 characters, and `%` and `+` must be sent as `%25` and `%2B`.[\[8\]](#source-8)
- **`tag`.** Put your own task reference in it. It comes back on the result and in the task list, which is how you find a task whose submission response you lost.

### Standard queue, polling and timing

Use the Standard queue: post a task, then fetch it by ID from `task_get/advanced`. It is the cheapest mode, and results stay retrievable for 30 days at no charge.[\[8\]](#source-8) CiteLadder waits 15 seconds before the first poll and 60 seconds between polls, treats status codes `40601` and `40602` as still pending, and gives up after 75 polls.[\[1\]](#source-1)

Status codes arrive in the response body. HTTP 200 does not mean success:

- `20000` is success; a task post also accepts `20100`.
- `40202` and `40209` are rate limits. Nothing was created, so you can send again later.
- `40200`, `40201` and `40204` mean the account is unfunded, paused or unsubscribed. Stop submitting until it is fixed.

The rule that saves money: **record your intent before you post a paid task, and never resubmit a task whose post timed out.** It may have been accepted and charged. Search the task list (`/v3/serp/id_list` for SERP, `/v3/ai_optimization/id_list` for the scrapers) for your `tag`, with a time window and `include_metadata: true`, because the tag is only returned in the metadata. Poll only once you have a task ID.

```js
saveIntent(task_ref)
try { id = post(payload with tag: task_ref) }
catch (timeout) {
  id = findByTag(task_ref, window, include_metadata: true)
  if (!id) return markUncertain(task_ref)   // reconcile later, never resubmit
}
poll(id, firstAfter: 15s, every: 60s, maxPolls: 75)
```

### Cost

DataForSEO's published Standard-queue prices on 23 November 2026: Google Organic $0.0006 per SERP, plus the same again for the asynchronous AI Overview; Google AI Mode $0.0012 per task; LLM Scraper $0.0012 per result. Priority and Live modes cost more.[\[7\]](#source-7)[\[9\]](#source-9)[\[10\]](#source-10)

### Getting citations and mentions out of the response

**AI Overviews and AI Mode.** Find the item with `type: 'ai_overview'` in `result[0].items`. No such item means Google showed no overview: record that as an observation, not an error. Inside it, walk the elements (`ai_overview_element`, `ai_overview_expanded_element`, table and video elements; AI Mode adds shopping and code-block elements), collecting their text and links. Citations are the `references` on the block and its elements, deduplicated by URL. In AI Mode, skip `ai_overview_paid` elements: they are ads, not answer text or citations.

```js
overview = items.find((i) => i.type === 'ai_overview');
if (!overview) return { present: false };
answerElements = walk(overview, skip: ["ai_overview_paid"])   // drops ads and their children
text = answerElements
  .map((e) => e.text || e.title)
  .dedupe()
  .join('\n\n');
citations = [overview, ...answerElements].flatMap((e) => e.references).uniqueBy('url');
```

**ChatGPT and Gemini app answers.** The result has `markdown` (the answer), `sources` (what the answer cited, also on nested `items`), `search_results` (everything the search returned, including pages the answer did not use), `fan_out_queries` (the searches the model ran) and `brand_entities`.[\[8\]](#source-8) Take citations from `sources`, walking nested items. Store `search_results` as sources retrieved, kept apart from citations. When a response has no `search_results` array, record sources retrieved as unavailable, not as an empty list. DataForSEO documents the field for ChatGPT; check the Gemini response before you rely on it. Skip any item of type `chat_gpt_ad` in all of them, because it is a paid placement. CiteLadder keeps `brand_entities` as raw evidence and runs its own matcher, so every engine is counted by the same rule.

## Mention and citation detection

### Brand mentions

1. **Normalise both sides.** Case-fold, normalise Unicode and whitespace. Languages written without spaces, such as Chinese, Japanese and Thai, need word segmentation first.
2. **Match whole words.** "Ace" must not match inside "Space".
3. **Use aliases.** Each brand has a name and a list of aliases. A multi-word name can also match its joined form, so "Ace Hardware" matches "acehardware". Separate words in the answer never join to spell a name, so "your sales force" does not count as Salesforce unless you add that alias.
4. **Guard common words.** A brand called "Notion" or "Apple" needs a context term nearby, such as a category word or a rival's name, before it counts. Add exclusion phrases for known false positives.
5. **Freeze the rules per run.** If you edit an alias, old runs keep the rules they were scored with, and runs with different rules are not compared.

```js
function mentioned(answer, brand) {
  for (hit of wholeWordHits(normalise(answer), [brand.name, ...brand.aliases])) {
    if (insideExclusion(hit, brand.exclusions)) continue;
    if (brand.contextRequired && !nearby(hit, brand.contextTerms, window)) continue;
    return true;
  }
  return false;
}
```

### Owned citations

Reduce each cited URL to its registrable domain with a public-suffix library, so `blog.example.co.uk` and `example.co.uk` match and `example.co.uk.evil.com` does not. Canonicalise the full URL as well (lowercase host, drop tracking parameters and fragments) so the same page counts once. Then classify each citation as owned, competitor or other by comparing the domain with the brand's and each competitor's domains.

### Position, share of voice and win rate

- **Visibility (mention rate):** answers naming the brand ÷ successful answers.
- **Citation rate:** answers citing an owned URL ÷ successful answers.
- **Position:** the brand's order of first mention among tracked brands in that answer. It is undefined when the brand is not named, so do not record it as last.
- **Share of voice:** the brand's mentions ÷ mentions of all tracked brands.
- **Win rate:** answers where the brand is named first among tracked brands ÷ answers naming any tracked brand.

Failed, unavailable and observed-zero must stay three different states. A timed-out answer is not an answer that ignored you. For more on what rank means inside an answer, see the [LLM rank tracker guide](/llm-rank-tracker).

## Everything else a home-built tracker needs

**A prompt set.** Write questions a buyer would type, mostly without your brand name, grouped by topic and buying stage. Keep each prompt short; CiteLadder caps tracked prompts at 300 characters. Version the set, because changing a prompt starts a new series.

**Repetition.** The same prompt returns different answers. Run each prompt several times per engine and report "2 of 3" next to the rate. CiteLadder allows 1 to 10 repetitions and defaults to 3.[\[1\]](#source-1)

**Markets.** A measurement market is a country plus a language. Pass it to the model APIs through `user_location` and to DataForSEO through `location_code` and `language_code`. A prompt that names Sydney is still measured from wherever you set the market.

**Scheduling and a queue.** Run each answer as its own task with a lease and a retry count, so a crash does not lose or duplicate paid work. A PostgreSQL table with row locks is enough; CiteLadder uses no separate queue server. Retry empty and unfinished answers, but not content-filter refusals.

**Storage.** Keep the raw response, the parsed record and the derived metrics separately, and never overwrite an answer. When your parser improves, re-derive metrics from stored responses without calling the provider again.

**Comparability.** Give each run a key built from the engine, model, web search setting, prompt version, market and matching rules. Only runs with the same key form a trend. A model change should break the line on the chart.

**Cost control.**

- Estimate before you run: prompts × engines × repetitions × markets × price per call.
- Cap searches per answer (`max_tool_calls`, `max_uses`) and output tokens.
- Use DataForSEO's Standard queue for scheduled work.
- Detect an exhausted account: HTTP 400, 402 or 429 with `insufficient_quota`, `billing_error` or "credit balance is too low" in the body means stop calling that provider, not retry.
- Rate-limit per provider, so one slow surface does not hold up the rest.

**Monitoring.** Log every attempt with its error class (timeout, rate limit, server error, auth failure, parse error). A parser error after a provider changes its response shape should alert you, not count as zero mentions.

## Or use a tool

A home-built tracker needs ongoing maintenance, because providers change their APIs and response shapes. If you prefer not to maintain one:

- **CiteLadder** runs everything on this page, hosted or self-hosted under AGPL-3.0. The [open-source guide](/open-source) shows how to run it with Docker, and the [pricing page](/pricing) covers the hosted plans.
- **Other open-source platforms** make different trade-offs; the [open-source AEO platform comparison](/blog/best-open-source-aeo-platforms) covers OpenSEO, Elmo and Ansvisor.

Either way, keep your prompt list, competitor list and aliases in a plain file. That is the part of the work that carries over to any tool.

## Frequently asked questions

### Which AI APIs return citations?

OpenAI, Anthropic and Gemini all return citations when their web search tool is on. OpenAI and Gemini give character offsets into the answer; Anthropic gives the cited text. Without web search, none of them cites anything.

### Is an API answer the same as the ChatGPT app?

Not necessarily. The app runs with its own settings, location and search behaviour, which an API call does not reproduce. Track the API and the app as separate surfaces, and label each one.

### How do I track Google AI Overviews without scraping Google myself?

Use a SERP provider such as DataForSEO with `load_async_ai_overview` set to true, then read the `ai_overview` item and its `references`.

### How many repetitions do I need?

Enough that one odd answer does not swing the rate. Three per prompt and engine is a common starting point; raise it for the prompts that matter most.

### What does a home-built tracker cost to run?

Mostly provider fees: tokens and search fees for the model APIs, and per-task fees for DataForSEO. Multiply prompts × engines × repetitions × markets × runs per month by the per-call price before you schedule anything.

## Sources

1. <span id="source-1"></span> [CiteLadder source code](https://github.com/abhij1306/CiteLadder), read 23 November 2026: provider and DataForSEO configuration, answer parsing and search-surface parsing.
2. <span id="source-2"></span> OpenAI, [Web search tool guide](https://developers.openai.com/api/docs/guides/tools-web-search), reviewed 23 November 2026.
3. <span id="source-3"></span> Anthropic, [Web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), reviewed 23 November 2026.
4. <span id="source-4"></span> Google, [Grounding with Google Search](https://aistudio.google.com/docs/google-search), reviewed 23 November 2026.
5. <span id="source-5"></span> Perplexity, [Migrate from Sonar to the Agent API](https://docs.perplexity.ai/api-reference/chat-completions-post), reviewed 23 November 2026.
6. <span id="source-6"></span> DataForSEO, [Google Organic SERP task_post](https://docs.dataforseo.com/v3/serp/google/organic/task_post/), reviewed 23 November 2026.
7. <span id="source-7"></span> DataForSEO, [Google Organic SERP API pricing](https://dataforseo.com/pricing/google-serp/google-organic-serp-api), reviewed 23 November 2026.
8. <span id="source-8"></span> DataForSEO, [ChatGPT LLM Scraper task_post](https://docs.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/task_post/) and [task_get advanced](https://docs.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/task_get/advanced/), reviewed 23 November 2026.
9. <span id="source-9"></span> DataForSEO, [Google AI Mode SERP API pricing](https://dataforseo.com/pricing/google-serp/google-ai-mode-serp-api), reviewed 23 November 2026.
10. <span id="source-10"></span> DataForSEO, [LLM Scraper pricing](https://dataforseo.com/pricing/ai-optimization/llm-scraper), reviewed 23 November 2026.
