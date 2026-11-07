---
title: 'OAI-SearchBot'
slug: '/ai-crawlers/oai-searchbot'
meta_title: "OAI-SearchBot: OpenAI's ChatGPT search crawler"
meta_description: 'What OAI-SearchBot does, what blocking it changes for ChatGPT search answers, how to verify its requests, and how the 10,000 most popular sites treat it in robots.txt.'
primary_keyword: 'OAI-SearchBot'
secondary_keywords: ['OAI-SearchBot robots.txt', 'block OAI-SearchBot', 'OAI-SearchBot user agent']
search_intent: 'Understand what OAI-SearchBot does and decide whether to allow or block it'
content_type: 'AI crawler directory page'
reviewed_at: '2026-11-07'
related_guides: ['/ai-crawlers/gptbot', '/research/ai-crawlers-robots-txt-2026']
index_group: 'AI search crawlers'
index_meta: 'Blocked by 6.1% of top sites'
---

OAI-SearchBot is the crawler OpenAI uses for search features in ChatGPT. OpenAI's documentation says that sites that block it in robots.txt will not be shown in ChatGPT search answers. Training is controlled by a separate crawler, GPTBot, which has its own robots.txt setting.

## OAI-SearchBot at a glance

|                      |                                                 |
| -------------------- | ----------------------------------------------- |
| robots.txt token     | `OAI-SearchBot`                                 |
| Operator             | OpenAI                                          |
| Purpose              | AI search crawler                               |
| User agent contains  | `oai-searchbot/`                                |
| Official IP list     | [openai.com](https://openai.com/searchbot.json) |
| Blocked by top sites | 6.1% of 6,130 sites with a readable policy      |

## robots.txt rules for OAI-SearchBot

Block it everywhere:

```text
User-agent: OAI-SearchBot
Disallow: /
```

Allow it everywhere:

```text
User-agent: OAI-SearchBot
Allow: /
```

## Who runs OAI-SearchBot and what it does

OAI-SearchBot is run by OpenAI. OpenAI's documentation describes it as the crawler for search. It is used to surface websites in search results in ChatGPT's search features.

OpenAI also lists other agents. Each one has its own purpose:

- **GPTBot** crawls content that may be used to train OpenAI's generative AI foundation models.
- **ChatGPT-User** visits pages when a user asks ChatGPT or a Custom GPT a question. It does not crawl the web automatically.
- **OAI-AdsBot** checks landing pages that are submitted as ads on ChatGPT.

The robots.txt token for this crawler is `OAI-SearchBot`. In server logs, its user-agent string contains `OAI-SearchBot/` followed by a version number. OpenAI notes that the version number may change.

## Allowing or blocking OAI-SearchBot in robots.txt

You control OAI-SearchBot with rules in robots.txt under its own token. There are three common choices:

- **Allow it.** OpenAI recommends this if you want your site to appear in ChatGPT search results. It also recommends allowing requests from its published IP ranges.
- **Block it.** Your site opts out of ChatGPT search answers.
- **Leave it unnamed.** OAI-SearchBot then follows whatever your general rule for all crawlers says. If that rule blocks everything, OAI-SearchBot is blocked too.

OpenAI says each setting is independent. You can allow OAI-SearchBot and block GPTBot, or the other way around. OpenAI also notes that its search systems need some time to adjust after you change robots.txt. Its documentation gives the current estimate.

The exact robots.txt blocks for each choice are shown separately on this page.

## What blocking changes for ChatGPT answers and for training

According to OpenAI's documentation, sites that opt out of OAI-SearchBot will not be shown in ChatGPT search answers. They can still appear as navigational links.

The documentation does not describe OAI-SearchBot as a way to control training. Training is tied to GPTBot. Blocking GPTBot tells OpenAI that a site's content should not be used to train its generative AI foundation models.

Keep two more points from the documentation in mind:

- If you allow both OAI-SearchBot and GPTBot, OpenAI may use the results of one crawl for both purposes. This avoids crawling the same pages twice.
- ChatGPT-User is not used to decide whether content appears in search. Its visits are started by users, so robots.txt rules may not apply to it. OpenAI says to use OAI-SearchBot to manage search opt-outs and automatic crawling.

If ChatGPT search matters to your brand, decide on OAI-SearchBot and GPTBot separately. CiteLadder can check which AI crawlers your robots.txt allows. It also tracks how your brand appears in ChatGPT answers.

## How to verify OAI-SearchBot requests

Any client can send a user-agent string, so a matching string is not proof that a request came from OpenAI. Check two things:

1. **The user-agent string.** Real requests contain `OAI-SearchBot/`. When OAI-SearchBot fetches robots.txt, OpenAI may add a `robots.txt` marker to the string. This helps you tell those requests apart from other requests when your logs do not include paths.
2. **The source IP address.** Compare it with the list OpenAI publishes at https://openai.com/searchbot.json. A request that claims to be OAI-SearchBot but comes from an address outside that list is not from OpenAI's search crawler.

Use the published list directly and refresh it regularly. Do not copy addresses into a fixed allowlist. If your firewall or CDN blocks unknown bots, add OpenAI's published list to it. A robots.txt rule that allows OAI-SearchBot does nothing if its requests are stopped before they reach your site.

## What the 10,000 most popular sites do with OAI-SearchBot

These figures come from the robots.txt files of the 10,000 most popular websites on the Tranco list (Q2VV4, 2026-11-06), checked for the homepage path. They show what the rules say. They do not measure real crawler traffic.

- 6130 sites had a robots.txt policy we could read.
- 371 of them (6.1%) block OAI-SearchBot. 235 (3.8%) do so with a rule that names OAI-SearchBot. The other 136 block it through a general rule that does not name it.
- 573 sites (9.3%) mention OAI-SearchBot by name.

**By rank.** Among the 527 top 1k sites with a known policy, 52 (9.9%) block OAI-SearchBot. Among the 5603 sites ranked 1k to 10k, 319 (5.7%) block it.

**By industry.** The block rate differs a lot by industry:

- News and media: 158 of 776 sites (20.4%) block it, 154 of them by name. 225 sites (29%) name OAI-SearchBot.
- Social networks and communities: 27 of 225 (12%) block it. 17 of those use a general rule.
- Advertising, analytics and marketing tech: 27 of 377 (7.2%). 26 of those use a general rule.
- Online retail and marketplaces: 24 of 346 (6.9%), 22 of them by name.
- Software and SaaS: 27 of 992 (2.7%).
- Education and research: 4 of 389 (1%).

**Search and training treated separately.** Of the 951 sites that block GPTBot, 581 (61.1%) still allow OAI-SearchBot. In their robots.txt, these sites opt out of training and stay open to ChatGPT search.

## Frequently asked questions

### Does blocking OAI-SearchBot stop OpenAI from training on my content?

OpenAI's documentation does not describe OAI-SearchBot as a training control. Training is tied to GPTBot. Blocking GPTBot tells OpenAI that your content should not be used to train its generative AI foundation models. If you allow both crawlers, OpenAI says it may use one crawl for both purposes.

### Can I block GPTBot and still appear in ChatGPT search?

Yes. OpenAI says each robots.txt setting is independent, so you can allow OAI-SearchBot and block GPTBot. In our study, 581 of the 951 sites that block GPTBot (61.1%) still allow OAI-SearchBot.

### If I block OAI-SearchBot, will my site disappear from ChatGPT completely?

OpenAI says sites that opt out of OAI-SearchBot will not be shown in ChatGPT search answers. They can still appear as navigational links. ChatGPT-User, which fetches pages when users ask, is a separate agent. OpenAI says robots.txt rules may not apply to it because a user starts those visits.

### How do I know a request really came from OAI-SearchBot?

Check that the user-agent string contains OAI-SearchBot/. Then check that the source IP address is on OpenAI's published list at https://openai.com/searchbot.json. Requests that fail the IP check are not from OpenAI's search crawler.

### Do the study numbers show how often OAI-SearchBot visits these sites?

No. The study reads the robots.txt rules of the 10,000 most popular websites for the homepage path. It shows what those sites allow or block, not how often OAI-SearchBot actually visits them.

## Sources

1. [Overview of OpenAI Crawlers](https://developers.openai.com/api/docs/bots)
2. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
3. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
