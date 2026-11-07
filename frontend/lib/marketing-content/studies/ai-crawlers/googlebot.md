---
title: 'Googlebot'
slug: '/ai-crawlers/googlebot'
meta_title: 'Googlebot crawler: what it does and how to allow or block it'
meta_description: "Googlebot is Google's search crawler. Here is what a block changes, how it relates to Google-Extended, how to verify real requests, and what the top sites do."
primary_keyword: 'Googlebot'
secondary_keywords: ['Googlebot robots.txt', 'block Googlebot', 'Googlebot user agent']
search_intent: 'Understand what Googlebot does and decide whether to allow or block it'
content_type: 'AI crawler directory page'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
related_guides: ['/ai-crawlers/google-extended', '/research/ai-crawlers-robots-txt-2026']
index_group: 'Search engine crawlers'
index_meta: 'Blocked by 1.5% of top sites'
product:
  heading: "Check your site's crawler access"
  href: '/platform/site-health'
  body: 'CiteLadder crawls your site for technical SEO, answer-readiness and AI crawler access issues, so you can see whether your robots.txt rules block crawlers you want to allow. Each finding comes with page-level evidence, and a recrawl confirms your fixes.'
---

Googlebot is the crawler Google uses for Google Search. Your robots.txt rules for Googlebot decide whether your pages can be crawled for Search and for other Google products. This page covers what the crawler is for, what a block changes, how to check that a request really comes from Google, and how the 10,000 most popular websites handle Googlebot in their robots.txt files.

## Googlebot at a glance

|                      |                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| robots.txt token     | `Googlebot`                                                                                          |
| Operator             | Google                                                                                               |
| Purpose              | Search engine crawler                                                                                |
| User agent contains  | `googlebot/`                                                                                         |
| Official IP list     | [developers.google.com](https://developers.google.com/static/crawling/ipranges/common-crawlers.json) |
| Blocked by top sites | 1.5% of 6,130 sites with a readable policy                                                           |

## robots.txt rules for Googlebot

Block it everywhere:

```text
User-agent: Googlebot
Disallow: /
```

Allow it everywhere:

```text
User-agent: Googlebot
Allow: /
```

## Who runs Googlebot and what it is for

Googlebot is run by Google. It is one of Google's common crawlers. Google says these crawlers are used to find information for building its search indexes, to run other product-specific crawls, and for analysis.

Robots.txt rules addressed to Googlebot affect these products, according to Google's documentation:

- Google Search, including Discover and all Google Search features
- Google Images
- Video mode
- Google News
- Discover

Google says its common crawlers always obey robots.txt rules when they crawl automatically.

Googlebot comes in a smartphone version and a desktop version. Both use the same robots.txt token, `Googlebot`. The user agent string in each request contains `Googlebot/`.

## Allowing or blocking Googlebot in robots.txt

You control Googlebot with the `Googlebot` token in robots.txt. You have three main options:

- **Allow it.** Googlebot can crawl your site. If no rule restricts it, this is the result.
- **Block it fully.** Googlebot stops crawling your site. This affects every product in the list above, Google Search included.
- **Block it in part.** You disallow some paths and allow the rest. Google's own example allows one archive page and disallows the rest of the archive.

A Googlebot rule can also apply to other Google crawlers. Google lists `Googlebot` as one of the accepted tokens for Googlebot Image, Googlebot Video, Googlebot News, Google-InspectionTool and Google-CloudVertexBot. Google says a crawler only needs to match one of its tokens for a rule to apply. So a rule written for Googlebot can reach those crawlers too. You can give any of them its own rules by using its own token.

For most sites that want to appear in Google Search, blocking Googlebot fully is a big step. Read the affected products list before you choose.

## What blocking Googlebot changes for Google's AI products

Google's documentation does not describe Googlebot as a control for AI training. It lists Googlebot's affected products as Google Search and the other products above.

AI training has its own token, `Google-Extended`. Google says publishers can use it to control whether content Google crawls from their sites may be used to:

- train future generations of the Gemini models that power Gemini Apps and the Vertex AI API for Gemini
- ground answers in Gemini Apps and in Grounding with Google Search on Vertex AI. Grounding means giving the model content from the Google Search index when a prompt is answered.

Google-Extended has no separate user agent string. Crawling is done with Google's existing user agent strings, and the token only works as a control in robots.txt. Google says Google-Extended does not affect whether a site is included in Google Search. It is also not a ranking signal in Google Search.

In practice:

- Blocking **Googlebot** affects Google Search, including all Google Search features, plus the other listed products.
- Blocking **Google-Extended** affects Gemini training and grounding as described above. Google says it leaves Search inclusion unchanged.

The documentation does not name individual AI features inside Google Search. To see how your brand shows up in Gemini answers before and after a robots.txt change, CiteLadder can measure it.

## How to verify real Googlebot requests

Google warns that the HTTP user agent string can be spoofed. A request that says it is Googlebot may come from someone else. Check each claim in two ways:

- **IP address.** Google's common crawlers generally crawl from the IP ranges published in Google's official common-crawlers.json file. Compare the request's IP address with that list. Do not copy ranges into your setup by hand, because the official file is the reference.
- **Reverse DNS.** For a real request, the reverse DNS hostname matches `crawl-***-***-***-***.googlebot.com` or `geo-crawl-***-***-***-***.geo.googlebot.com`.

Google also publishes a guide called "Verify requests from Google" with the full steps.

The Chrome version in Googlebot's user agent string changes over time. If you filter logs or server rules by user agent, Google advises using a wildcard for the version number. Do not match one exact version.

## What the 10,000 most popular sites do with Googlebot

CiteLadder checked the robots.txt rules of the 10,000 most popular websites (Tranco list Q2VV4, 2026-11-06) for the homepage path. These results describe what robots.txt files say. They do not measure real crawler traffic or whether a crawler followed the rules.

We could read a policy for 6130 sites. Of those:

- **94 sites (1.5%) block Googlebot.** Only 5 (0.1%) block it by name. The other 89 block it through a general rule that does not name Googlebot.
- **507 sites (8.3%) name Googlebot** in their robots.txt.

By rank:

- Top 1,000: 527 sites with a known policy. 10 block Googlebot (1.9%) and 81 name it (15.4%).
- Rank 1,000 to 10,000: 5603 sites. 84 block Googlebot (1.5%) and 426 name it (7.6%).

By industry, the highest block rate is in advertising, analytics and marketing tech, where 25 of 377 sites (6.6%) block Googlebot. In news and media, 1 of 776 sites (0.1%) blocks it. Reference and knowledge, nonprofits and associations, real estate, sports and automotive have no sites that block it. Sites name Googlebot most often in jobs and careers (20% of 50 sites), social networks and communities (17.8%) and online retail and marketplaces (16.5%).

Many sites separate Search from AI training. Of the 828 sites that block Google-Extended, 735 (88.8%) still allow Googlebot.

## Frequently asked questions

### Does blocking Googlebot stop Google from training Gemini on my content?

Google's documentation does not describe Googlebot rules as a training control. Training of future Gemini models, and grounding in Gemini Apps and Grounding with Google Search on Vertex AI, are controlled with the separate Google-Extended token. Blocking Googlebot affects Google Search and the other products Google lists for Googlebot.

### Can I block Google-Extended and still allow Googlebot?

Yes. They are separate robots.txt tokens. Google says Google-Extended does not affect whether a site is included in Google Search and is not used as a ranking signal. In CiteLadder's study, 735 of the 828 sites that block Google-Extended (88.8%) still allow Googlebot.

### Does a Googlebot rule also apply to Googlebot Image or Googlebot News?

It can. Google lists `Googlebot` as an accepted token for Googlebot Image, Googlebot Video, Googlebot News, Google-InspectionTool and Google-CloudVertexBot. A crawler only needs to match one of its tokens for a rule to apply. To handle one of these crawlers separately, write rules with its own token.

### How can I tell a fake Googlebot from the real one?

The user agent string can be spoofed, so do not rely on it. Check that the request's IP address is in Google's official common-crawlers.json list. Also check that its reverse DNS hostname matches crawl-_**-**_-_**-**_.googlebot.com or geo-crawl-_**-**_-_**-**_.geo.googlebot.com.

### Does the study show how often Googlebot visits these sites?

No. The study reads robots.txt rules for the homepage path. It shows what sites allow or block. It does not show crawler traffic, or whether a crawler followed the rules.

## Sources

1. [Google's common crawlers | Google Crawling Infrastructure  |  Crawling infrastructure  |  Google for Developers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)
2. [What Is Googlebot | Google Search Central  |  Documentation  |  Google for Developers](https://developers.google.com/search/docs/crawling-indexing/googlebot)
3. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
4. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
