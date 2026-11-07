---
title: 'ChatGPT-User'
slug: '/ai-crawlers/chatgpt-user'
meta_title: 'ChatGPT-User crawler: what it does and how to manage it'
meta_description: 'ChatGPT-User is the agent OpenAI uses when ChatGPT visits a page for a user. What a robots.txt rule changes, how to verify requests, and what top sites do.'
primary_keyword: 'ChatGPT-User'
secondary_keywords: ['ChatGPT-User robots.txt', 'block ChatGPT-User', 'ChatGPT-User user agent']
search_intent: 'Understand what ChatGPT-User does and decide whether to allow or block it'
content_type: 'AI crawler directory page'
reviewed_at: '2026-11-07'
related_guides: ['/ai-crawlers/gptbot', '/research/ai-crawlers-robots-txt-2026']
index_group: 'User-triggered AI fetchers'
index_meta: 'Blocked by 7.7% of top sites'
---

ChatGPT-User is the user agent OpenAI uses when ChatGPT or a Custom GPT visits a web page because a user asked for something. It does not crawl the web on its own. This page covers what it does, what a robots.txt rule for it changes, how to verify real requests, and how the 10,000 most popular websites handle it.

## ChatGPT-User at a glance

|                      |                                                    |
| -------------------- | -------------------------------------------------- |
| robots.txt token     | `ChatGPT-User`                                     |
| Operator             | OpenAI                                             |
| Purpose              | User-triggered AI fetcher                          |
| User agent contains  | `chatgpt-user/`                                    |
| Official IP list     | [openai.com](https://openai.com/chatgpt-user.json) |
| Blocked by top sites | 7.7% of 6,130 sites with a readable policy         |

## robots.txt rules for ChatGPT-User

Block it everywhere:

```text
User-agent: ChatGPT-User
Disallow: /
```

Allow it everywhere:

```text
User-agent: ChatGPT-User
Allow: /
```

## Who runs ChatGPT-User and what it does

ChatGPT-User is operated by OpenAI. OpenAI's documentation says it is used for certain user actions in ChatGPT and Custom GPTs. When a user asks ChatGPT or a Custom GPT a question, it may visit a web page with the ChatGPT-User agent. ChatGPT users can also interact with external applications through GPT Actions.

The documentation is clear on two limits:

- ChatGPT-User is not used for crawling the web in an automatic fashion.
- ChatGPT-User is not used to determine whether content may appear in Search.

OpenAI lists other agents for other jobs. OAI-SearchBot handles search and automatic crawling for ChatGPT's search features. GPTBot crawls content that may be used to train OpenAI's generative AI foundation models.

## Allowing or blocking ChatGPT-User in robots.txt

The robots.txt token is `ChatGPT-User`. You have three options:

- **Do not name it.** ChatGPT-User then falls under the general rules your file sets for all crawlers.
- **Name it and allow it.** This states that user-triggered visits from ChatGPT are welcome, whatever your rules for other agents say.
- **Name it and disallow it.** This states that you do not want ChatGPT to fetch those paths for users.

One point matters more than the syntax. OpenAI's documentation says that because these actions are started by a user, robots.txt rules may not apply. A Disallow rule for ChatGPT-User records your preference. The documentation does not promise that every request will respect it.

The rule for ChatGPT-User is separate from your rules for GPTBot and OAI-SearchBot. Decide each one on its own terms. CiteLadder can check which of these agents your current robots.txt allows or blocks.

## What blocking changes for ChatGPT answers and training

**Search in ChatGPT.** The documentation says ChatGPT-User is not used to decide whether content may appear in Search. To opt out of search, or to manage automatic crawling, OpenAI points to the OAI-SearchBot token. Blocking ChatGPT-User alone is not the documented way to control whether your site shows up in ChatGPT search answers.

**Pages fetched during a conversation.** ChatGPT-User is the agent that may visit your page when a user's question leads ChatGPT to fetch it. A Disallow rule states that you do not want those visits. The documentation also says robots.txt rules may not apply to these user-started actions, so the practical effect of the rule is not guaranteed.

**Training.** The documentation does not say whether content fetched by ChatGPT-User is used for training. For training, it points to GPTBot: disallowing GPTBot indicates that a site's content should not be used to train OpenAI's generative AI foundation models.

## How to verify ChatGPT-User requests

Use two checks together.

- **User-agent string.** Real requests carry the ChatGPT-User token. OpenAI publishes the full string as `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot`.
- **Source IP address.** Anyone can copy a user-agent string. Check the request's source IP against the list OpenAI publishes for this agent at [https://openai.com/chatgpt-user.json](https://openai.com/chatgpt-user.json).

If the user agent says ChatGPT-User but the IP is not on that list, treat the request as not coming from OpenAI. Load the list from the official URL each time. Do not copy addresses into your configuration by hand, because the list can change.

## What the 10,000 most popular sites do with ChatGPT-User

CiteLadder checked the robots.txt rules of the 10,000 most popular websites (Tranco list Q2VV4, 2026-11-06) for the homepage path. 6130 sites had a policy we could read. These results show what robots.txt files say. They do not measure actual crawler traffic. The documentation also says robots.txt may not apply to ChatGPT-User.

- **Overall:** 471 sites (7.7%) block ChatGPT-User. 335 (5.5%) block it by name. 136 block it through a rule for all crawlers.
- **Named at all:** 663 sites (10.8%) mention ChatGPT-User in their robots.txt.
- **By rank:** among the top 1,000, 59 of 527 sites (11.2%) block it and 17.6% name it. Among ranks 1,000 to 10,000, 412 of 5603 sites (7.4%) block it and 10.2% name it.
- **News and media** block it most: 196 of 776 sites (25.3%), 192 of them by name. 34% of news sites name the agent.
- **Other higher rates:** Sports 13.7% (all 18 by name), Social networks and communities 12.4% (17 of its 28 through a rule for all crawlers), Reference and knowledge 10.5%.
- **Lower rates:** Banking, finance and payments 1.1%, Consumer technology and hardware 1.2%, Education and research 1.8%, Software and SaaS 2.5%. None of the 47 Automotive sites block it.

Some industry groups are small, so treat their percentages with care.

**GPTBot and ChatGPT-User together.** 951 sites block GPTBot. Of those, 495 (52.1%) still allow ChatGPT-User. Many sites write a rule against training crawls and still allow user-triggered fetches.

## Frequently asked questions

### Does blocking ChatGPT-User remove my site from ChatGPT search?

Not according to OpenAI's documentation. It says ChatGPT-User is not used to determine whether content may appear in Search. OpenAI points to the OAI-SearchBot token for search opt-outs.

### Does ChatGPT-User follow robots.txt?

OpenAI's documentation says that because ChatGPT-User actions are started by a user, robots.txt rules may not apply. A Disallow rule records your preference, but the documentation does not guarantee it will be followed.

### Is content fetched by ChatGPT-User used to train OpenAI models?

The documentation does not say. It names GPTBot as the crawler for training content and says disallowing GPTBot indicates your content should not be used to train OpenAI's generative AI foundation models.

### How do I confirm a request really came from ChatGPT-User?

Check that the user-agent string contains ChatGPT-User. Then check that the source IP appears in OpenAI's published list at https://openai.com/chatgpt-user.json. A matching user agent alone is not proof.

### How many popular sites block ChatGPT-User?

In CiteLadder's study of the 10,000 most popular websites, 471 of the 6130 sites with a readable policy (7.7%) block it for the homepage in robots.txt. This reflects robots.txt rules, not measured traffic.

## Sources

1. [Overview of OpenAI Crawlers](https://developers.openai.com/api/docs/bots)
2. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
3. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
