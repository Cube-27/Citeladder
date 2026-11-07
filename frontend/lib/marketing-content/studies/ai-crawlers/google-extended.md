---
title: 'Google-Extended'
slug: '/ai-crawlers/google-extended'
meta_title: 'Google-Extended: what it controls and who blocks it'
meta_description: 'Google-Extended is a robots.txt token from Google covering Gemini training and grounding. Learn what blocking it changes, how to verify requests and what top sites do.'
primary_keyword: 'Google-Extended'
secondary_keywords:
  ['Google-Extended robots.txt', 'block Google-Extended', 'Google-Extended user agent']
search_intent: 'Understand what Google-Extended does and decide whether to allow or block it'
content_type: 'AI crawler directory page'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
related_guides: ['/ai-crawlers/googlebot', '/research/ai-crawlers-robots-txt-2026']
index_group: 'AI training crawlers'
index_meta: 'Blocked by 13.5% of top sites'
product:
  heading: "Check your site's AI crawler access"
  href: '/platform/site-health'
  body: "CiteLadder's site health crawl flags AI crawler access issues, such as robots.txt rules affecting tokens like Google-Extended, with page-level evidence for each finding. After you change your rules, run a recrawl to confirm the fix."
---

Google-Extended is a robots.txt token run by Google. It controls whether content that Google crawls from your site may be used to train Gemini models and to ground answers in Gemini Apps. Google's documentation says it has no effect on whether your site appears in Google Search. In our study of the 10,000 most popular websites, 13.5% of sites with a known policy block it in robots.txt.

## Google-Extended at a glance

|                      |                                             |
| -------------------- | ------------------------------------------- |
| robots.txt token     | `Google-Extended`                           |
| Operator             | Google                                      |
| Purpose              | AI training crawler                         |
| User agent contains  |                                             |
| Official IP list     | Not published                               |
| Blocked by top sites | 13.5% of 6,130 sites with a readable policy |

## robots.txt rules for Google-Extended

Block it everywhere:

```text
User-agent: Google-Extended
Disallow: /
```

Allow it everywhere:

```text
User-agent: Google-Extended
Allow: /
```

## Who runs Google-Extended and what it is for

Google runs Google-Extended. Google's list of common crawlers calls it a standalone product token. Web publishers use it to manage how Google may use content it crawls from their sites.

The documentation names two uses:

- **Training** future generations of Gemini models. These models power Gemini Apps and the Vertex AI API for Gemini.
- **Grounding** in Gemini Apps and in Grounding with Google Search on Vertex AI. Google defines grounding as providing content from the Google Search index to the model at prompt time to improve factuality and relevancy.

Google-Extended is not a separate crawler that fetches pages on its own. The documentation says crawling is done with Google's existing user agent strings. The robots.txt token is used only as a control.

## Allowing or blocking it in robots.txt

You decide with one robots.txt group addressed to the `Google-Extended` token. There are three common choices:

- **Allow it.** Google may use content it crawls from your site for Gemini training and grounding, as the documentation describes.
- **Block it for the whole site.** Google is told not to use your content for those purposes.
- **Block or allow parts of the site.** Google's example group uses allow and disallow rules for specific paths, so you can treat different sections differently.

This choice is separate from Googlebot. Rules for Google-Extended do not change what you tell Googlebot, and rules for Googlebot do not stand in for a Google-Extended rule. Google also says it intends to support the AIPREF shared, machine-readable training preference signal. CiteLadder can check which AI crawler tokens your robots.txt allows or blocks.

## What blocking changes in Gemini and Google Search

According to Google's documentation, blocking Google-Extended affects more than training. The token covers both of these:

- Training future Gemini models that power Gemini Apps and the Vertex AI API for Gemini.
- Grounding in Gemini Apps and in Grounding with Google Search on Vertex AI, where Search index content is given to the model at prompt time.

The documentation also says Google-Extended does not affect whether a site is included in Google Search. It is not used as a ranking signal in Google Search either. Google-Extended's entry names only the products above. For Google Search itself, the Googlebot documentation applies: blocking Googlebot affects Google Search, including Discover and all Google Search features, and products such as Google Images, Google Video and Google News.

## How to verify real requests

You cannot single out Google-Extended traffic in your logs. The documentation says it has no HTTP user agent string of its own. Crawling is done with Google's existing user agent strings.

What you can check is whether a request really comes from Google. Google warns that user agent strings can be faked. It recommends two methods:

- Run a reverse DNS lookup on the source IP. For common crawlers, the hostname should match the Google crawler patterns given in the documentation.
- Match the source IP against Google's published IP ranges. Common crawlers generally crawl from the ranges in Google's common-crawlers.json list. Use that official list rather than copying ranges from elsewhere.

Google's guide on verifying requests from Google explains both methods step by step.

## What the 10,000 most popular sites do

We read the robots.txt files of the 10,000 most popular websites on the Tranco list and checked the rules for the homepage path. These results describe robots.txt rules. They do not measure actual crawler traffic or how Google uses the content.

- 6130 sites had a policy we could read.
- 828 of those sites (13.5%) block Google-Extended.
- 685 sites (11.2%) block it by naming it in a rule.
- 143 sites block it through a general rule that applies to all crawlers, with no group naming it.
- 970 sites (15.8%) name Google-Extended somewhere in their robots.txt.

Most sites that block Google-Extended still allow Googlebot. Of the 828 sites that block Google-Extended, 735 (88.8%) also allow Googlebot. These sites stay open to Search crawling and opt out of the Gemini uses that Google-Extended controls.

## Differences by rank and industry

Blocking is a little more common among the very top sites. In the top 1,000, 83 of 527 sites with a known policy (15.7%) block Google-Extended. For ranks 1,000 to 10,000, the figure is 745 of 5603 sites (13.3%).

Industry matters more. The highest blocking rates are:

- News and media: 283 of 776 sites (36.5%)
- Entertainment and streaming: 91 of 389 sites (23.4%)
- Social networks and communities: 48 of 225 sites (21.3%)

The lowest rates are:

- Banking, finance and payments: 2.8%
- Consumer technology and hardware: 3.1%
- Government and public sector: 3.3%
- Software and SaaS: 3.5%

In Advertising, analytics and marketing tech, 27 of the 30 blocking sites do it through a general rule. Only 3 name Google-Extended directly.

## Frequently asked questions

### Does blocking Google-Extended remove my site from Google Search?

No. Google's documentation says Google-Extended does not affect whether a site is included in Google Search. It is also not used as a ranking signal. Search crawling is controlled through Googlebot.

### Does blocking Google-Extended only affect AI training?

No. The documentation says the token covers two things: training future Gemini models, and grounding in Gemini Apps and in Grounding with Google Search on Vertex AI. Grounding means giving the model content from the Google Search index when someone asks a question.

### Why can't I find Google-Extended in my server logs?

Google-Extended has no HTTP user agent string of its own. Crawling is done with Google's existing user agent strings, and the token is only read from robots.txt as a control. You can confirm that a request comes from Google with a reverse DNS lookup or by checking Google's published IP ranges.

### How many popular sites block Google-Extended?

In our study of the 10,000 most popular websites, 828 of the 6130 sites with a known policy (13.5%) block Google-Extended in robots.txt for the homepage path. News and media sites block it most often, at 36.5%. These numbers reflect robots.txt rules, not measured crawler traffic.

### Do sites that block Google-Extended also block Googlebot?

Most do not. Of the 828 sites that block Google-Extended, 735 (88.8%) still allow Googlebot in their robots.txt.

## Sources

1. [Google's common crawlers | Google Crawling Infrastructure  |  Crawling infrastructure  |  Google for Developers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)
2. [What Is Googlebot | Google Search Central  |  Documentation  |  Google for Developers](https://developers.google.com/search/docs/crawling-indexing/googlebot)
3. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
4. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
