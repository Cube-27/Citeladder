---
title: 'Applebot-Extended'
slug: '/ai-crawlers/applebot-extended'
meta_title: 'Applebot-Extended: what it controls and who blocks it'
meta_description: "Applebot-Extended is Apple's robots.txt token for opting out of AI model training. What blocking it changes, how to verify Applebot and what top sites do."
primary_keyword: 'Applebot-Extended'
secondary_keywords:
  ['Applebot-Extended robots.txt', 'block Applebot-Extended', 'Applebot-Extended user agent']
search_intent: 'Understand what Applebot-Extended does and decide whether to allow or block it'
content_type: 'AI crawler directory page'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
related_guides: ['/ai-crawlers/applebot', '/research/ai-crawlers-robots-txt-2026']
index_group: 'AI training crawlers'
index_meta: 'Blocked by 13.1% of top sites'
product:
  heading: "Check your site's AI crawler access"
  href: '/platform/site-health'
  body: 'CiteLadder crawls your site for AI crawler access issues alongside technical SEO and answer-readiness problems, with page-level evidence for each finding. After you change your robots.txt rules for tokens like Applebot-Extended, run a recrawl to verify the fix.'
---

Applebot-Extended is a robots.txt token run by Apple. It does not crawl pages. It sets whether content that Applebot has already crawled can be used to train Apple's foundation models. CiteLadder checked the robots.txt files of the 10,000 most popular websites. Among sites with a known policy, 13.1% block Applebot-Extended.

## Applebot-Extended at a glance

|                      |                                             |
| -------------------- | ------------------------------------------- |
| robots.txt token     | `Applebot-Extended`                         |
| Operator             | Apple                                       |
| Purpose              | AI training crawler                         |
| User agent contains  |                                             |
| Official IP list     | Not published                               |
| Blocked by top sites | 13.1% of 6,130 sites with a readable policy |

## robots.txt rules for Applebot-Extended

Block it everywhere:

```text
User-agent: Applebot-Extended
Disallow: /
```

Allow it everywhere:

```text
User-agent: Applebot-Extended
Allow: /
```

## Who runs Applebot-Extended and what it is for

Apple runs Applebot-Extended. Apple's documentation calls it a secondary user agent. It gives web publishers more control over how Apple can use their website content.

It is not a separate crawler. Apple states that Applebot-Extended does not crawl webpages. Apple's main crawler, Applebot, fetches the pages. Applebot-Extended is only used to decide how Apple may use the data that Applebot crawled.

The use it controls is training. If you disallow Applebot-Extended, your content is not used to train Apple's general purpose foundation models. These models power generative AI features across Apple products, including Apple Intelligence, Services and Developer Tools.

## Allowing or blocking it in robots.txt

You make this choice with a robots.txt rule addressed to Applebot-Extended. Apple describes it as an opt-out. You opt out of training by disallowing Applebot-Extended.

- **Block it** if you do not want your content used to train Apple's foundation models. Apple's own example disallows a single directory, so you can also opt out only part of a site.
- **Allow it** if you accept training use. Apple says allowing it will help improve the capabilities and quality of its generative AI models over time.

The rule for Applebot-Extended is separate from the rule for Applebot. Blocking Applebot-Extended does not stop Applebot from crawling. If your robots.txt still allows Applebot, Apple says your content stays discoverable through Spotlight, Siri and Safari, plus other system-wide features on Apple devices.

## What blocking changes in Apple's AI answers

Apple's documentation describes Applebot-Extended as a control for training. For AI-generated answers it names other controls.

Apple also uses Applebot data when it generates answers. When AI models produce output in Apple products and services, crawled content can add context and up-to-date information. One example is answers to broad world knowledge questions in Siri and Search. These answers may include links to the sources used.

To keep content out of this use, the documentation points to:

- The _nosnippet_ directive. You can set it as a robots meta tag or as an X-Robots-Tag HTTP header addressed to Applebot. Apple will not use content tagged _nosnippet_ as extra context for AI-generated output. _nosnippet_ also stops Applebot from generating a description or web answer for the page. Suggestions to visit that URL show only the page title.
- The schema.org `isAccessibleForFree` property set to false. These pages can still appear in search results. Applebot will not use their content as extra context for AI output.

Blocking Applebot-Extended does not remove pages from search results. Apple also states that it does not consider Applebot-Extended rules when ranking results in Search.

## How to verify requests

Applebot-Extended does not crawl, so no request will identify itself as Applebot-Extended. There is nothing to verify for this token alone. The requests that fetch your pages come from Applebot.

Apple documents two ways to identify real Applebot traffic:

- **Reverse DNS.** Look up the hostname for the requesting IP address. Confirm it belongs to the Applebot domain named in Apple's documentation. Then do a forward lookup on that hostname and confirm it points back to the same IP address.
- **Official IP list.** Match the IP address against the CIDR prefixes in the Applebot JSON file. Apple links to this file from its documentation.

Apple's search user agent string contains "Applebot". Use it to sort your logs, and use the two methods above to confirm a request really came from Apple.

## What the 10,000 most popular sites do

CiteLadder checked the robots.txt files of the 10,000 most popular websites (Tranco list Q2VV4, 2026-11-06) for the homepage path. A policy could be determined for 6130 sites. These figures describe robots.txt rules. They do not measure Apple's crawling or how Apple actually uses the data.

- 803 sites (13.1%) block Applebot-Extended.
- 647 sites (10.6%) block it by name.
- 156 sites block it only through a general rule that applies to all crawlers.
- 773 sites (12.6%) mention Applebot-Extended by name in robots.txt.

The most popular sites block it a little more often. In the top 1k tier, 84 of 527 sites (15.9%) block it. In the rank 1k to 10k tier, 719 of 5603 sites (12.8%) block it.

Most sites that block it still allow Applebot. Of the 803 sites that block Applebot-Extended, 589 (73.3%) allow Applebot. According to Apple's documentation, this setup opts out of training and keeps pages available to Apple's search crawler.

## Blocking by industry

Blocking rates vary widely by industry.

Highest blocking rates:

- News and media: 296 of 776 sites (38.1%)
- Entertainment and streaming: 86 of 389 sites (22.1%)
- Social networks and communities: 48 of 225 sites (21.3%)
- Health and medical: 15 of 81 sites (18.5%)
- Reference and knowledge: 28 of 152 sites (18.4%)

Lowest blocking rates:

- Automotive: 1 of 47 sites (2.1%)
- Banking, finance and payments: 4 of 179 sites (2.2%)
- Telecom and internet providers: 3 of 125 sites (2.4%)
- Consumer technology and hardware: 4 of 162 sites (2.5%)
- Government and public sector: 7 of 242 sites (2.9%)

In news and media, 280 sites block Applebot-Extended by name. Advertising, analytics and marketing tech shows the opposite pattern. Of the 29 sites there that block it, 28 do so only through a general rule for all crawlers. Some industries have few sites, so a small change in sites moves their percentages a lot.

## Frequently asked questions

### Does blocking Applebot-Extended remove my site from Siri, Spotlight or Safari?

No. Apple states that pages that disallow Applebot-Extended can still be included in search results. If your robots.txt allows Applebot, your content stays discoverable through Spotlight, Siri and Safari.

### Why don't I see Applebot-Extended in my server logs?

Apple states that Applebot-Extended does not crawl webpages. Applebot fetches the pages. Applebot-Extended only tells Apple how it may use that crawled data.

### How do I keep my content out of AI-generated answers in Siri and Search?

Apple's documentation points to the nosnippet directive, either as a robots meta tag or as an X-Robots-Tag header addressed to Applebot. Apple also does not use pages marked with isAccessibleForFree set to false as extra context. Disallowing Applebot-Extended is the documented control for training.

### Does blocking Applebot-Extended affect my ranking in Apple Search?

Apple states that it does not consider Applebot-Extended rules when ranking results in Search.

### Do the study figures show how often Apple crawls these sites?

No. The figures describe the robots.txt rules for the homepage path on the 10,000 most popular websites. They do not measure crawler traffic or how Apple uses the data.

## Sources

1. [About Applebot - Apple Support](https://support.apple.com/en-us/119829)
2. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
3. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
