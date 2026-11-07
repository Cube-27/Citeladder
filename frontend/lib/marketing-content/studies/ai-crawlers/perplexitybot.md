---
title: 'PerplexityBot'
slug: '/ai-crawlers/perplexitybot'
meta_title: 'PerplexityBot crawler: what it does and how to allow or block it'
meta_description: "PerplexityBot is Perplexity's search crawler. Learn what it is for, what blocking it changes, how to verify real requests, and how the top 10,000 sites handle it."
primary_keyword: 'PerplexityBot'
secondary_keywords: ['PerplexityBot robots.txt', 'block PerplexityBot', 'PerplexityBot user agent']
search_intent: 'Understand what PerplexityBot does and decide whether to allow or block it'
content_type: 'AI crawler directory page'
reviewed_at: '2026-11-07'
related_guides: ['/ai-crawlers/perplexity-user', '/research/ai-crawlers-robots-txt-2026']
index_group: 'AI search crawlers'
index_meta: 'Blocked by 9% of top sites'
---

PerplexityBot is the web crawler Perplexity runs for its search product. According to Perplexity's documentation, it finds and links websites in Perplexity search results, and it is not used to crawl content for AI foundation models. This page covers how to decide whether to allow it, how to verify that a request really comes from it, and what the 10,000 most popular websites say about it in their robots.txt files.

## PerplexityBot at a glance

|                      |                                                                     |
| -------------------- | ------------------------------------------------------------------- |
| robots.txt token     | `PerplexityBot`                                                     |
| Operator             | Perplexity                                                          |
| Purpose              | AI search crawler                                                   |
| User agent contains  | `perplexitybot/`                                                    |
| Official IP list     | [www.perplexity.com](https://www.perplexity.com/perplexitybot.json) |
| Blocked by top sites | 9% of 6,130 sites with a readable policy                            |

## robots.txt rules for PerplexityBot

Block it everywhere:

```text
User-agent: PerplexityBot
Disallow: /
```

Allow it everywhere:

```text
User-agent: PerplexityBot
Allow: /
```

## Who runs PerplexityBot and what it is for

PerplexityBot is operated by Perplexity. Perplexity's documentation says the crawler is designed to surface and link websites in search results on Perplexity.

The documentation also says PerplexityBot is not used to crawl content for AI foundation models. Its role is search indexing.

Perplexity runs a second, separate agent called Perplexity-User. It fetches pages when a user asks Perplexity a question. It is described separately below because it follows different rules.

## Allowing or blocking PerplexityBot in robots.txt

PerplexityBot reads robots.txt rules under the user-agent token `PerplexityBot`. You have three basic options:

- **Allow it.** Perplexity recommends this if you want your site to appear in its search results. It also recommends permitting requests from its published IP ranges.
- **Block it by name.** Add a rule that names `PerplexityBot` and disallows the paths you want to keep out.
- **Block it by default.** A general rule for all crawlers also applies to PerplexityBot unless you add a separate rule for it by name.

Perplexity says each robots.txt setting works independently. A rule for PerplexityBot does not control Perplexity-User. Perplexity also says changes can take up to 24 hours to show up in its systems.

If you use a web application firewall, a robots.txt allow rule may not be enough. Perplexity's documentation explains how to let its bots through Cloudflare WAF and AWS WAF. It notes that Cloudflare's Bot Fight Mode can still challenge Perplexity bots even when a custom skip rule matches them.

## What blocking PerplexityBot changes

Perplexity's documentation connects PerplexityBot to search results. Perplexity recommends allowing the crawler to ensure your site appears in those results. So blocking it affects your visibility in Perplexity search.

Blocking PerplexityBot is not a training opt-out. The documentation says the crawler is not used to crawl content for AI foundation models, so there is no training use for robots.txt to switch off.

Blocking PerplexityBot also does not cover Perplexity-User. Perplexity describes that agent as visiting pages when a user asks a question, so it can give an accurate answer and link to the page. The documentation says that because a user requested the fetch, Perplexity-User generally ignores robots.txt rules. The documentation does not say exactly how a PerplexityBot block changes the answers Perplexity gives beyond search results.

## How to verify real PerplexityBot requests

Any client can copy a user-agent string, so the header alone does not prove a request came from Perplexity. Perplexity suggests checking two things together:

1. **User agent.** Real requests include `PerplexityBot` in the user-agent string. The documented example is `Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)`. Perplexity notes that the version number may change.
2. **Source IP.** The request should come from an address in Perplexity's published PerplexityBot list at [https://www.perplexity.ai/perplexitybot.json](https://www.perplexity.ai/perplexitybot.json).

Perplexity says these addresses are updated regularly and that the JSON endpoint should be your source of truth. It recommends fetching the list automatically on a schedule so your firewall rules stay current. Perplexity-User has its own separate IP list. Match each user agent only against its own ranges.

## What the 10,000 most popular sites do with PerplexityBot

CiteLadder checked the robots.txt files of the 10,000 most popular websites (Tranco list Q2VV4, 2026-11-06), using the rules for the homepage path. 6130 sites had a policy we could read. These results describe robots.txt rules only, not actual crawler traffic or firewall settings.

- **Blocked:** 550 sites (9%) block PerplexityBot.
- **Blocked by name:** 411 sites (6.7%) block it with a rule that names it.
- **Blocked by default:** 139 sites block it through a general rule that also applies to other crawlers.
- **Named at all:** 724 sites (11.8%) mention PerplexityBot by name in some rule.

The most popular sites block it more often. In the top 1,000, 78 of 527 sites (14.8%) block PerplexityBot. Among sites ranked 1,000 to 10,000, 472 of 5603 (8.4%) do.

The blocking rate varies by industry:

- News and media: 253 of 776 sites (32.6%)
- Health and medical: 13 of 81 sites (16%)
- Social networks and communities: 33 of 225 sites (14.7%)
- Reference and knowledge: 21 of 152 sites (13.8%)
- Software and SaaS: 26 of 992 sites (2.6%)
- Consumer technology and hardware: 3 of 162 sites (1.9%)
- Banking, finance and payments: 3 of 179 sites (1.7%)

Of the 550 sites that block PerplexityBot, 177 (32.2%) allow Perplexity-User in robots.txt. Keep in mind that Perplexity says Perplexity-User generally ignores robots.txt.

## Frequently asked questions

### Does blocking PerplexityBot stop Perplexity from training AI models on my content?

Perplexity's documentation says PerplexityBot is not used to crawl content for AI foundation models. Blocking it is therefore a search decision. It is not a training opt-out.

### Will blocking PerplexityBot remove my site from Perplexity?

Perplexity says PerplexityBot surfaces and links websites in its search results, and it recommends allowing the crawler if you want to appear there. The documentation also describes Perplexity-User, a separate agent that fetches pages when users ask questions and generally ignores robots.txt. A PerplexityBot block does not control Perplexity-User.

### How long does a robots.txt change take to apply to PerplexityBot?

Perplexity's documentation says it can take up to 24 hours for its systems to reflect robots.txt changes.

### How can I tell if a request claiming to be PerplexityBot is real?

Check that the user-agent string contains PerplexityBot. Then check that the source IP appears in Perplexity's official list at https://www.perplexity.ai/perplexitybot.json. Perplexity recommends using both checks together and refreshing the IP list regularly.

### How many popular sites block PerplexityBot?

In CiteLadder's study of the 10,000 most popular websites, 550 of the 6130 sites with a readable policy (9%) block PerplexityBot in robots.txt. This reflects robots.txt rules, not actual traffic. News and media sites block it most often, at 32.6%.

## Sources

1. [https://docs.perplexity.ai/docs/resources/perplexity-crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)
2. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
3. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
