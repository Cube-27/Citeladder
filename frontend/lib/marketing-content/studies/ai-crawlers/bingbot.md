---
title: 'Bingbot'
slug: '/ai-crawlers/bingbot'
meta_title: "Bingbot: Microsoft's crawler, robots.txt choices and verification"
meta_description: "Bingbot is Microsoft's search engine crawler. How to allow or block it in robots.txt, how to verify real requests, and what the 10,000 most popular sites do with it."
primary_keyword: 'Bingbot'
secondary_keywords: ['Bingbot robots.txt', 'block Bingbot', 'Bingbot user agent']
search_intent: 'Understand what Bingbot does and decide whether to allow or block it'
content_type: 'AI crawler directory page'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
related_guides: ['/research/ai-crawlers-robots-txt-2026']
index_group: 'Search engine crawlers'
index_meta: 'Blocked by 2% of top sites'
product:
  heading: "Check your site's crawler access"
  href: '/platform/site-health'
  body: 'CiteLadder crawls your site for technical SEO, answer-readiness and AI crawler access issues, with page-level evidence for each finding. After you change your robots.txt rules, run a recrawl to confirm the fix.'
---

Bingbot is Microsoft's search engine crawler. This page covers your robots.txt options, how to check that a request really comes from Bingbot, and how the 10,000 most popular websites handle it in their robots.txt files. The study figures describe robots.txt rules. They do not measure actual crawler traffic.

## Bingbot at a glance

|                      |                                                           |
| -------------------- | --------------------------------------------------------- |
| robots.txt token     | `Bingbot`                                                 |
| Operator             | Microsoft                                                 |
| Purpose              | Search engine crawler                                     |
| User agent contains  | `bingbot/`                                                |
| Official IP list     | [www.bing.com](https://www.bing.com/toolbox/bingbot.json) |
| Blocked by top sites | 2% of 6,130 sites with a readable policy                  |

## robots.txt rules for Bingbot

Block it everywhere:

```text
User-agent: Bingbot
Disallow: /
```

Allow it everywhere:

```text
User-agent: Bingbot
Allow: /
```

## Who runs Bingbot and what it is for

Bingbot is run by Microsoft. CiteLadder classifies it as a search engine crawler.

- **Operator:** Microsoft
- **Purpose:** search engine crawling
- **robots.txt token:** `Bingbot`
- **User agent contains:** `bingbot/`

Microsoft's crawler documentation for Bing Webmaster Tools is the official reference for what Bingbot does. Check it before you change your rules.

## Allowing or blocking Bingbot in robots.txt

Your robots.txt can treat Bingbot in one of three ways:

- **No rule that applies to it.** Bingbot is allowed by default.
- **A general rule for all crawlers.** Bingbot follows the wildcard group if your file has no group that names it. A site-wide block for all crawlers therefore also blocks Bingbot.
- **A group that names `Bingbot`.** This gives Bingbot its own policy, separate from the one for other crawlers. You can allow it while blocking others, or block it while allowing others.

The exact robots.txt blocks for each option are shown separately on this page. If you name Bingbot, use the token exactly as listed above.

## Bingbot and Microsoft's AI answers

Some site owners want to know whether blocking Bingbot changes how their content shows up in Microsoft's AI answers, or only affects model training. Microsoft's crawler documentation is the place to confirm this. CiteLadder could not confirm it from that documentation when this page was written, so this page makes no claim either way.

If AI visibility matters to you, read Microsoft's current documentation before you block Bingbot. You can also measure how your brand appears in AI answers with CiteLadder before and after a robots.txt change.

## How to verify real Bingbot requests

Any client can send a user agent that contains `bingbot/`. The user agent alone does not prove a request came from Microsoft.

To verify a request:

1. Check that the user agent contains `bingbot/`.
2. Check the request's IP address against the official Bingbot IP list published by Microsoft at https://www.bing.com/toolbox/bingbot.json.
3. Treat requests that claim to be Bingbot but come from outside that list as unverified.

The list can change. Load it from the official source each time you check, and do not hard-code addresses in your configuration.

## What the 10,000 most popular sites do with Bingbot

CiteLadder checked the robots.txt rules of the 10,000 most popular websites (Tranco list Q2VV4, 2026-11-06) for the homepage path. 6130 sites had a policy we could read. These results describe what robots.txt files say. They do not show which crawlers actually visit or what those crawlers do.

- **Blocked:** 122 sites (2%) block Bingbot from the homepage.
- **Blocked by name:** 18 sites (0.3%) block it with a rule that names Bingbot.
- **Blocked by default:** 104 sites block it through a general rule for all crawlers.
- **Named:** 397 sites (6.5%) mention Bingbot by name, whether to allow it or to block it.

Most blocks come from general rules. Few sites single out Bingbot to block it.

**By rank.** In the top 1,000, 10 of 527 sites (1.9%) block Bingbot and 61 (11.6%) name it. Among sites ranked 1,000 to 10,000, 112 of 5603 (2%) block it and 336 (6%) name it.

**By industry.** Advertising, analytics and marketing tech sites block it most often: 26 of 377 (6.9%), almost all through general rules. Online retail and marketplaces block it least among large groups: 1 of 346 (0.3%). They also name it most often, at 15.3%. In news and media, 7 of 776 sites (0.9%) block it, and 5 of those do so by name.

## Frequently asked questions

### What robots.txt token does Bingbot use?

The token is `Bingbot`. A group that names this token applies only to Bingbot. If your file has no such group, Bingbot follows your general rules for all crawlers.

### Does blocking Bingbot remove my site from Microsoft's AI answers?

CiteLadder could not confirm this from Microsoft's crawler documentation when this page was written, so we make no claim either way. Check Microsoft's current documentation before you decide. You can use CiteLadder to measure how your brand appears in AI answers before and after a change.

### How can I tell if a request claiming to be Bingbot is real?

Check that the user agent contains `bingbot/`. Then check the IP address against Microsoft's official Bingbot list at https://www.bing.com/toolbox/bingbot.json. A matching user agent from an IP outside that list is not verified.

### How many popular sites block Bingbot?

Of the 6130 sites in the top 10,000 with a readable robots.txt policy, 122 (2%) block Bingbot from the homepage. Only 18 of them block it by name. The rest block it through general rules. These figures describe robots.txt rules, not actual crawler traffic.

## Sources

1. [Bing Webmaster Tools - Help Documentation](https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0)
2. [https://www.bing.com/toolbox/bingbot.json](https://www.bing.com/toolbox/bingbot.json)
3. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
4. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
