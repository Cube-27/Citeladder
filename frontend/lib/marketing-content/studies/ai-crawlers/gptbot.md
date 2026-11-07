---
title: 'GPTBot'
slug: '/ai-crawlers/gptbot'
meta_title: "GPTBot: OpenAI's training crawler, robots.txt and study data"
meta_description: "GPTBot is OpenAI's crawler for training data. This page covers what it does, what blocking it changes, how to verify requests, and how top sites handle it."
primary_keyword: 'GPTBot'
secondary_keywords: ['GPTBot robots.txt', 'block GPTBot', 'GPTBot user agent']
search_intent: 'Understand what GPTBot does and decide whether to allow or block it'
content_type: 'AI crawler directory page'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
related_guides: ['/ai-crawlers/oai-searchbot', '/research/ai-crawlers-robots-txt-2026']
index_group: 'AI training crawlers'
index_meta: 'Blocked by 15.5% of top sites'
product:
  heading: 'Check AI crawler access on your site'
  href: '/platform/site-health'
  body: "CiteLadder's site health crawl flags AI crawler access issues on your site, with page-level evidence for each finding, so you can confirm your rules for crawlers like GPTBot do what you intend. After you change them, run a recrawl to verify the fix."
---

GPTBot is the web crawler OpenAI uses to collect content that may be used to train its generative AI foundation models. OpenAI's documentation says that disallowing GPTBot in robots.txt tells OpenAI not to use your site's content for that training. This page covers what GPTBot does, how the robots.txt choice works, how it relates to ChatGPT search, how to check that a request really comes from GPTBot, and how the 10,000 most popular websites handle it in their robots.txt files.

## GPTBot at a glance

|                      |                                              |
| -------------------- | -------------------------------------------- |
| robots.txt token     | `GPTBot`                                     |
| Operator             | OpenAI                                       |
| Purpose              | AI training crawler                          |
| User agent contains  | `gptbot/`                                    |
| Official IP list     | [openai.com](https://openai.com/gptbot.json) |
| Blocked by top sites | 15.5% of 6,130 sites with a readable policy  |

## robots.txt rules for GPTBot

Block it everywhere:

```text
User-agent: GPTBot
Disallow: /
```

Allow it everywhere:

```text
User-agent: GPTBot
Allow: /
```

## Who runs GPTBot and what it is for

GPTBot is run by OpenAI. In OpenAI's words, GPTBot "is used to make our generative AI foundation models more useful and safe." It crawls content that may be used to train those models.

GPTBot is one of several OpenAI agents, and each one has a separate job:

- **GPTBot** crawls content that may be used for model training.
- **OAI-SearchBot** surfaces websites in ChatGPT's search features.
- **ChatGPT-User** visits pages when a ChatGPT user or a Custom GPT asks for them.
- **OAI-AdsBot** visits landing pages that have been submitted as ads on ChatGPT.

In robots.txt, GPTBot uses the token `GPTBot`.

## Allowing or blocking GPTBot in robots.txt

You manage GPTBot with the `GPTBot` token in your robots.txt file. You have three options:

- **Allow GPTBot.** OpenAI may use your crawled content to train its foundation models.
- **Block GPTBot for the whole site.** OpenAI's documentation says this "indicates a site's content should not be used in training generative AI foundation models."
- **Block GPTBot for some paths only.** This keeps selected sections out of training and leaves the rest open.

If your robots.txt does not name GPTBot, GPTBot falls under your general rules for all crawlers. A blanket disallow for all user agents therefore blocks GPTBot as well.

OpenAI says each of its robots.txt settings is independent of the others. If you allow both GPTBot and OAI-SearchBot, OpenAI says it may use the results of one crawl for both purposes so it does not crawl your site twice.

## What blocking GPTBot changes for ChatGPT answers

According to OpenAI's documentation, GPTBot is about model training. Disallowing it is a training opt-out.

Visibility in ChatGPT search depends on a different crawler. OpenAI says OAI-SearchBot is used to surface websites in ChatGPT's search features, and that sites opted out of OAI-SearchBot will not be shown in ChatGPT search answers, though they can still appear as navigational links. The documentation gives this exact case as an example: a webmaster can allow OAI-SearchBot to appear in search results and disallow GPTBot so that crawled content is not used for training.

ChatGPT-User is also separate. OpenAI says it is not used for automatic crawling and is not used to decide whether content appears in search. Because a user starts these visits, OpenAI says robots.txt rules may not apply to them.

If your goal is to stay out of training and still appear in ChatGPT search, check that your GPTBot rule does not also block OAI-SearchBot. A blanket rule for all crawlers blocks both. CiteLadder checks your robots.txt for each AI crawler separately, so you can see which agents your rules actually block.

## How to verify real GPTBot requests

GPTBot identifies itself in the user-agent string. OpenAI publishes an example in which the string contains `GPTBot/` followed by a version number, and notes that the version number may change. When GPTBot fetches robots.txt files, OpenAI says it may add a `robots.txt` marker to the user-agent string. This helps you tell those requests apart from other requests, especially if your logs do not record paths.

Any client can send a user-agent string, so the string alone does not prove where a request came from. OpenAI publishes the IP addresses GPTBot uses at [https://openai.com/gptbot.json](https://openai.com/gptbot.json). To verify a request:

1. Check that the user agent contains `GPTBot/`.
2. Check that the source IP address appears in the official list at that URL.
3. Treat requests that pass the first check and fail the second as unverified.

Read the list from the official source each time you check. Do not keep a copy, because the published addresses can change.

## What the 10,000 most popular sites do with GPTBot

CiteLadder reviewed the robots.txt rules of the 10,000 most popular websites on the Tranco list (Q2VV4, 2026-11-06) and checked whether each site's homepage path is open to GPTBot. 6130 sites had a policy we could read. These results describe robots.txt rules only. They do not measure GPTBot's actual traffic or whether a site enforces its rules.

Of the 6130 sites with a known policy:

- **951 (15.5%)** block GPTBot.
- **816 (13.3%)** block it by name.
- **135** block it through a general rule that also applies to other crawlers.
- **1150 (18.8%)** mention GPTBot by name somewhere in their robots.txt.

Blocking is more common among the most popular sites. In the top 1,000, 98 of 527 sites with a known policy block GPTBot (18.6%). Among sites ranked 1,000 to 10,000, 853 of 5603 block it (15.2%).

Many sites that block GPTBot still leave other OpenAI agents open. Of the 951 sites that block GPTBot, 581 (61.1%) allow OAI-SearchBot and 495 (52.1%) allow ChatGPT-User. Their robots.txt rules keep content out of training and leave the search and user-request agents open.

## GPTBot blocking by industry

Blocking rates differ a lot by industry. All figures below are shares of sites with a known robots.txt policy in each industry.

Industries with the highest blocking rates:

- **News and media:** 307 of 776 sites (39.6%). 358 sites (46.1%) name GPTBot in robots.txt.
- **Entertainment and streaming:** 101 of 389 sites (26%).
- **Social networks and communities:** 53 of 225 sites (23.6%).
- **Sports:** 28 of 131 sites (21.4%).
- **Reference and knowledge:** 32 of 152 sites (21.1%).
- **Health and medical:** 17 of 81 sites (21%).

Industries with the lowest blocking rates:

- **Consumer technology and hardware:** 6 of 162 sites (3.7%).
- **Banking, finance and payments:** 7 of 179 sites (3.9%).
- **Government and public sector:** 10 of 242 sites (4.1%).
- **Software and SaaS:** 42 of 992 sites (4.2%).

In advertising, analytics and marketing tech, 31 of 377 sites block GPTBot. 26 of those blocks come from general rules, and only 5 sites block GPTBot by name.

## Frequently asked questions

### Does blocking GPTBot remove my site from ChatGPT search?

Not according to OpenAI's documentation. GPTBot handles model training. ChatGPT search uses OAI-SearchBot, and OpenAI says each setting is independent. You can allow OAI-SearchBot and disallow GPTBot. Check that your GPTBot rule does not also block OAI-SearchBot, for example through a blanket rule for all crawlers.

### What does disallowing GPTBot tell OpenAI?

OpenAI says that disallowing GPTBot indicates your site's content should not be used in training its generative AI foundation models.

### How can I tell if a request claiming to be GPTBot is real?

Check that the user agent contains GPTBot/, then check that the source IP address appears in OpenAI's published list at https://openai.com/gptbot.json. If the IP is not on that list, treat the request as unverified.

### Does ChatGPT-User follow my GPTBot rule?

No. ChatGPT-User is a separate agent that visits pages when a user asks ChatGPT or a Custom GPT a question. OpenAI says robots.txt rules may not apply to these user-initiated visits, and that ChatGPT-User is not used for automatic crawling.

### How many popular sites block GPTBot?

In CiteLadder's review of the 10,000 most popular websites, 951 of the 6130 sites with a known robots.txt policy block GPTBot (15.5%). This figure describes robots.txt rules, not actual crawler traffic.

## Sources

1. [Overview of OpenAI Crawlers](https://developers.openai.com/api/docs/bots)
2. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
3. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
