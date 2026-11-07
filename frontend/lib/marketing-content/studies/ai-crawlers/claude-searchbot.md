---
title: 'Claude-SearchBot'
slug: '/ai-crawlers/claude-searchbot'
meta_title: "Claude-SearchBot: Anthropic's search crawler, robots.txt and verification"
meta_description: 'What Claude-SearchBot does, what blocking it changes according to Anthropic, how to verify real requests, and how the 10,000 most popular sites handle it in robots.txt.'
primary_keyword: 'Claude-SearchBot'
secondary_keywords:
  ['Claude-SearchBot robots.txt', 'block Claude-SearchBot', 'Claude-SearchBot user agent']
search_intent: 'Understand what Claude-SearchBot does and decide whether to allow or block it'
content_type: 'AI crawler directory page'
reviewed_at: '2026-11-07'
related_guides: ['/ai-crawlers/claudebot', '/research/ai-crawlers-robots-txt-2026']
index_group: 'AI search crawlers'
index_meta: 'Blocked by 6% of top sites'
---

Claude-SearchBot is a crawler run by Anthropic. Anthropic says it crawls the web to improve the quality of search results for users. This page covers what the crawler does, what changes when you block it, how to check that a request is real, and what the most popular websites do with it in their robots.txt files.

## Claude-SearchBot at a glance

|                      |                                                     |
| -------------------- | --------------------------------------------------- |
| robots.txt token     | `Claude-SearchBot`                                  |
| Operator             | Anthropic                                           |
| Purpose              | AI search crawler                                   |
| User agent contains  | `claude-searchbot`                                  |
| Official IP list     | [claude.com](https://claude.com/crawling/bots.json) |
| Blocked by top sites | 6% of 6,130 sites with a readable policy            |

## robots.txt rules for Claude-SearchBot

Block it everywhere:

```text
User-agent: Claude-SearchBot
Disallow: /
```

Allow it everywhere:

```text
User-agent: Claude-SearchBot
Allow: /
```

## Who runs Claude-SearchBot and what it does

Claude-SearchBot belongs to Anthropic, the company behind Claude. Anthropic's documentation says the bot "navigates the web to improve search result quality for users" and that it "analyzes online content specifically to enhance the relevance and accuracy of search responses."

Anthropic runs three robots, and each has its own job:

- **ClaudeBot** collects web content that could be used to train Anthropic's models.
- **Claude-User** fetches pages when a Claude user asks a question that needs them.
- **Claude-SearchBot** indexes content to improve search results.

Because each bot has its own name, you can make a separate decision for each one. In robots.txt, the token for this crawler is `Claude-SearchBot`. Its user agent string contains `claude-searchbot`.

## Allowing or blocking it in robots.txt

Anthropic says its bots follow the standard rules in robots.txt. You have three main choices:

- **Allow it.** Don't block it in any rule, or add a group for `Claude-SearchBot` that allows the paths you want indexed.
- **Block it everywhere.** Add a group for `Claude-SearchBot` that disallows the whole site.
- **Block it in part.** Disallow only some paths, such as private or low-value sections.

Some points from the documentation:

- The robots.txt file goes in your top-level directory. You need to set it up on every subdomain you want to opt out.
- Anthropic supports the non-standard `Crawl-delay` rule if you want to slow crawling without blocking it.
- Anthropic says robots.txt is the way to opt out. It warns that blocking IP addresses may not work or keep working, because it stops Anthropic from reading your robots.txt file.

A general rule for all user agents also applies to this bot if you have no group that names it. Check your existing wildcard rules before you decide.

## What blocking it changes: search visibility or training

According to Anthropic, blocking Claude-SearchBot "prevents our system from indexing your content for search optimization, which may reduce your site's visibility and accuracy in user search results." So the documented effect is on search.

Anthropic links training to a different bot. The documentation says restricting **ClaudeBot** signals that a site's future content should be left out of training datasets. If you want to opt out of training, the rule that controls that is the one for ClaudeBot.

Pages fetched when a user asks Claude a question are a third case. Anthropic says these use **Claude-User**. Blocking Claude-User stops Anthropic from fetching your content for those user requests. To control all three uses, you need a rule for each bot.

## How to verify real Claude-SearchBot requests

Anyone can put "Claude-SearchBot" in a user agent string. The name alone does not prove a request came from Anthropic.

To check a request:

1. Confirm the user agent contains `claude-searchbot`.
2. Check the request's source IP address against the list Anthropic publishes at https://claude.com/crawling/bots.json. Anthropic says a source IP on this list shows the crawler is coming from Anthropic.

Use the published list as the source of truth. Don't hard-code addresses, because the list can change. If you think Anthropic's crawlers are not working as described, the documentation says to contact Anthropic from an email address on the domain you are asking about.

## What the 10,000 most popular sites do with Claude-SearchBot

CiteLadder checked the robots.txt rules of the 10,000 most popular websites (Tranco list Q2VV4, 2026-11-06) for the homepage path. 6130 sites had a policy we could read. These figures describe what robots.txt files say. They do not measure how the crawler actually behaves or how much traffic it sends.

- **368 sites (6%) block Claude-SearchBot.** 216 of them (3.5%) block it by name. The other 152 block it through a general rule that covers all bots.
- **382 sites (6.2%) name Claude-SearchBot** somewhere in their robots.txt.
- **Popularity matters.** Among the top 1,000 sites, 11.8% block it and 14% name it. Among sites ranked from 1,000 to 10,000, 5.5% block it.
- **News and media block it most.** 20% of news and media sites block it, and 142 of them block it by name. Social networks and communities follow at 12.4%, and online retail and marketplaces at 7.5%.
- **Some industries rarely block it.** The blocking rate is 2.1% for software and SaaS, 1.2% for consumer technology and hardware, and 0.8% for education and research.

Many sites treat search and training differently. 919 sites block ClaudeBot. Of those, 552 (60%) still allow Claude-SearchBot.

## Frequently asked questions

### Does blocking Claude-SearchBot stop Anthropic from training on my content?

Anthropic's documentation says the effect of blocking Claude-SearchBot is on search indexing and visibility in search results. It links training to ClaudeBot. To signal that you want your future content left out of training, add a rule for ClaudeBot.

### Will blocking Claude-SearchBot affect how my site appears in Claude's search results?

It can. Anthropic says blocking it prevents your content from being indexed for search optimization, which may reduce your site's visibility and accuracy in user search results. CiteLadder can show how your brand appears in AI answers before and after you change the rule.

### Is Claude-SearchBot the same as Claude-User?

No. Anthropic describes them as separate bots. Claude-SearchBot indexes content to improve search results. Claude-User fetches pages when a user asks Claude a question. Each one follows its own robots.txt rules.

### Can I block Claude-SearchBot by blocking its IP addresses?

Anthropic advises against relying on this. It says IP blocking may not work or keep working, because it stops Anthropic from reading your robots.txt file. Anthropic says robots.txt is the way to opt out. Use the official IP list at https://claude.com/crawling/bots.json to verify requests.

### How can I check whether my site currently allows Claude-SearchBot?

Look for a group that names Claude-SearchBot in your robots.txt. Also check any general rules for all user agents, since those apply when no group names the bot. Check each subdomain separately. CiteLadder can run this check for your site.

## Sources

1. [Does Anthropic crawl data from the web, and how can site owners block the crawler? | Claude Help Center](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
2. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
3. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
