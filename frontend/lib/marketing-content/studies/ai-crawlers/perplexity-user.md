---
title: 'Perplexity-User'
slug: '/ai-crawlers/perplexity-user'
meta_title: 'Perplexity-User crawler: what it does and how sites handle it'
meta_description: 'Perplexity-User fetches pages when Perplexity users ask questions. Learn what it does, how robots.txt applies to it, how to verify requests, and what top sites do.'
primary_keyword: 'Perplexity-User'
secondary_keywords:
  ['Perplexity-User robots.txt', 'block Perplexity-User', 'Perplexity-User user agent']
search_intent: 'Understand what Perplexity-User does and decide whether to allow or block it'
content_type: 'AI crawler directory page'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
related_guides: ['/ai-crawlers/perplexitybot', '/research/ai-crawlers-robots-txt-2026']
index_group: 'User-triggered AI fetchers'
index_meta: 'Blocked by 6.6% of top sites'
product:
  heading: 'See when Perplexity fetches your pages'
  href: '/platform/ai-referral-analytics'
  body: 'CiteLadder reads your own server logs to show which AI crawlers and fetchers request your pages, and pulls the visits Perplexity and other AI assistants send you from GA4. You can see what Perplexity-User actually does on your site alongside your robots.txt rules.'
---

Perplexity-User is the user agent Perplexity uses when one of its users asks a question and Perplexity visits a web page to answer it. Perplexity's documentation says it is not used for web crawling or for training AI foundation models. It also says this fetcher generally ignores robots.txt rules, because a user requested the fetch. This page covers what the documentation says, how to verify real requests, and how the 10,000 most popular websites treat it in their robots.txt files.

## Perplexity-User at a glance

|                      |                                                                       |
| -------------------- | --------------------------------------------------------------------- |
| robots.txt token     | `Perplexity-User`                                                     |
| Operator             | Perplexity                                                            |
| Purpose              | User-triggered AI fetcher                                             |
| User agent contains  | `perplexity-user/`                                                    |
| Official IP list     | [www.perplexity.com](https://www.perplexity.com/perplexity-user.json) |
| Blocked by top sites | 6.6% of 6,130 sites with a readable policy                            |

## robots.txt rules for Perplexity-User

Block it everywhere:

```text
User-agent: Perplexity-User
Disallow: /
```

Allow it everywhere:

```text
User-agent: Perplexity-User
Allow: /
```

## Who runs Perplexity-User and what it is for

Perplexity runs Perplexity-User. The documentation says it "supports user actions within Perplexity". When a user asks Perplexity a question, it might visit a web page to help give an accurate answer and include a link to that page in its response.

The documentation also says what it is not used for:

- It is not used for web crawling.
- It is not used to collect content for training AI foundation models.

Perplexity runs a second, separate agent called PerplexityBot. The documentation describes PerplexityBot as the agent that surfaces and links websites in Perplexity search results. The two agents have separate robots.txt tokens and separate published IP lists. Perplexity says each setting works on its own.

## Allowing or blocking it in robots.txt

The robots.txt token is `Perplexity-User`. You can name it in its own group to allow or disallow it. If you don't name it, it falls under your general rules for all user agents. Perplexity says changes to robots.txt can take up to 24 hours to show up in its systems.

Keep one point from the documentation in mind. It says that because a user requested the fetch, Perplexity-User "generally ignores robots.txt rules". A disallow rule records what you want, but the documentation does not promise that Perplexity-User will follow it. If you need to control access in practice, the documentation's WAF guidance is the more direct tool. It explains how to match the user agent together with the published IP list in Cloudflare or AWS WAF.

If you use a WAF and want Perplexity-User to reach your pages, the documentation says you may need to allow it explicitly. It also notes that Cloudflare's Bot Fight Mode cannot be skipped with WAF custom rules and may still challenge these requests.

## What blocking changes for Perplexity answers and training

Training is not affected either way. The documentation says Perplexity-User is not used to collect content for training AI foundation models.

Answers are a different matter. Perplexity-User is the agent that visits a page when a user asks a question, so it can include a link to that page in the answer. The documentation says Perplexity-User "controls which sites these user requests can access". It also says the fetcher generally ignores robots.txt. It does not say exactly how a robots.txt block on Perplexity-User changes what appears in answers.

Appearing in Perplexity search results is tied to PerplexityBot. The documentation recommends allowing PerplexityBot in robots.txt, and permitting its published IP ranges, if you want your site to appear in those results. Blocking Perplexity-User does not change your PerplexityBot rules, since each setting is independent.

## How to verify real Perplexity-User requests

The user agent string contains `Perplexity-User/`. The documentation gives this example and notes that the version number may change:

`Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)`

Anyone can copy a user agent string, so don't rely on it alone. Perplexity publishes the IP addresses for Perplexity-User at the official list linked in its crawler documentation (https://www.perplexity.ai/perplexity-user.json). To check a request:

- Confirm the user agent contains `Perplexity-User`.
- Confirm the source IP is in the current published list.

The documentation recommends combining both checks. It says the addresses are updated regularly and suggests fetching the list on a schedule so your rules stay current. CiteLadder can check whether your site's robots.txt and firewall settings let AI agents like this one through.

## What the 10,000 most popular sites do with Perplexity-User

This study looked at robots.txt rules for the homepage path on the 10,000 most popular websites (Tranco list Q2VV4, 2026-11-06). It measures written rules, not actual crawler traffic. Perplexity says Perplexity-User generally ignores robots.txt, so these numbers show what site owners asked for. They do not show what the fetcher actually did.

Of the 6130 sites with a known policy:

- 407 sites (6.6%) block Perplexity-User.
- 246 sites (4%) block it by name. The other 161 block it through a default rule for all user agents.
- 382 sites (6.2%) name Perplexity-User somewhere in robots.txt.

Bigger sites block it more often. Among the top 1,000, 67 of 527 sites (12.7%) block it. Among sites ranked 1,000 to 10,000, 340 of 5603 (6.1%) do.

By industry, news and media stands out. 167 of 776 news and media sites (21.5%) block Perplexity-User, and 151 of those name it directly. Social networks and communities follow at 11.1%. Rates are low for software and SaaS (2.1%) and for education and research (1%). No nonprofit or automotive sites in the study block it.

Many sites treat Perplexity's two agents differently. Of the 550 sites that block PerplexityBot, 177 (32.2%) still allow Perplexity-User.

## Frequently asked questions

### Is Perplexity-User used to train AI models?

No. Perplexity's documentation says Perplexity-User is not used for web crawling or to collect content for training AI foundation models.

### Does Perplexity-User follow robots.txt?

Not reliably. The documentation says that because a user requested the fetch, Perplexity-User generally ignores robots.txt rules. To control access in practice, use firewall rules that match the user agent together with Perplexity's published IP list.

### What is the difference between Perplexity-User and PerplexityBot?

PerplexityBot surfaces and links websites in Perplexity search results. Perplexity-User visits pages when a user asks Perplexity a question, so it can answer and link to the page. Each has its own robots.txt token and its own published IP list, and each setting works independently.

### How can I tell if a request really comes from Perplexity-User?

Check that the user agent contains Perplexity-User, and that the source IP is in the official list linked from Perplexity's crawler documentation. Perplexity updates the list regularly, so fetch the current version and don't hard-code addresses.

### How many popular sites block Perplexity-User?

In the robots.txt rules of the 10,000 most popular websites, 407 of the 6130 sites with a known policy (6.6%) block Perplexity-User for the homepage path. These are written rules, not measured traffic.

## Sources

1. [https://docs.perplexity.ai/docs/resources/perplexity-crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)
2. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
3. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
