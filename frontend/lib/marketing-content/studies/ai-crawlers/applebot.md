---
title: 'Applebot'
slug: '/ai-crawlers/applebot'
meta_title: 'Applebot: what it does, how to block it, how to verify it'
meta_description: "Applebot is Apple's web crawler for Spotlight, Siri and Safari. Learn what blocking it changes, how Applebot-Extended and nosnippet work, and how to verify requests."
primary_keyword: 'Applebot'
secondary_keywords: ['Applebot robots.txt', 'block Applebot', 'Applebot user agent']
search_intent: 'Understand what Applebot does and decide whether to allow or block it'
content_type: 'AI crawler directory page'
reviewed_at: '2026-11-07'
related_guides: ['/ai-crawlers/applebot-extended', '/research/ai-crawlers-robots-txt-2026']
index_group: 'Search engine crawlers'
index_meta: 'Blocked by 3.7% of top sites'
---

Applebot is Apple's web crawler. Its data feeds search in Spotlight, Siri and Safari. It also gives AI answers in Apple products extra context, and it may help train Apple's foundation models. This page covers what each robots.txt choice changes according to Apple's documentation, how to check that a request really comes from Applebot, and how the 10,000 most popular sites handle it.

## Applebot at a glance

|                      |                                                                                |
| -------------------- | ------------------------------------------------------------------------------ |
| robots.txt token     | `Applebot`                                                                     |
| Operator             | Apple                                                                          |
| Purpose              | Search engine crawler                                                          |
| User agent contains  | `applebot/`                                                                    |
| Official IP list     | [search.developer.apple.com](https://search.developer.apple.com/applebot.json) |
| Blocked by top sites | 3.7% of 6,130 sites with a readable policy                                     |

## robots.txt rules for Applebot

Block it everywhere:

```text
User-agent: Applebot
Disallow: /
```

Allow it everywhere:

```text
User-agent: Applebot
Allow: /
```

## Who runs Applebot and what it does

Apple runs Applebot. Apple says the data it crawls powers the search features built into many parts of its ecosystem, including Spotlight, Siri and Safari. If you allow Applebot in robots.txt, your content can appear in search results for Apple users in these products.

Apple lists three uses for data crawled by Applebot:

- **Search.** Results and suggestions in Spotlight, Siri and Safari.
- **AI answers.** Extra context and up-to-date content when AI models generate output in Apple products and services. Apple's example is answers to broad world knowledge questions in Siri and Search. These answers may include links to the sources and websites used.
- **Model training.** The data may also help train Apple foundation models. These models power generative AI features across Apple products, including Apple Intelligence, Services and Developer Tools.

Applebot follows standard robots.txt directives aimed at it during general search crawls. It may render pages in a browser. For that it needs access to the JavaScript, CSS and XHR resources a page requires.

## Allowing or blocking Applebot in robots.txt

Applebot uses the robots.txt token `Applebot`. There are three main choices:

- **Allow it.** Applebot can crawl your pages, and they can appear in Spotlight, Siri and Safari search.
- **Block some paths.** Disallow specific folders, such as private areas, and leave the rest open.
- **Block the whole site.** Applebot will not crawl your pages for Apple's search features.

Check these points from Apple's documentation before you decide:

- If your robots.txt does not mention Applebot but does mention Googlebot, Applebot follows the Googlebot rules. So a Googlebot block can also apply to Applebot.
- Applebot does not follow crawl-delay. Apple says Applebot slows its crawl rate on its own when a site slows down or returns errors.
- If you block JavaScript, CSS or other resources, Applebot may not be able to render your pages properly.
- You can also control individual pages. Applebot supports robots meta tags and the X-Robots-Tag HTTP header, with the directives noindex, nosnippet, nofollow, none and all.

Training has its own separate token, Applebot-Extended. The next section covers it.

## What blocking changes for Apple AI answers and training

Apple's documentation describes three controls. Each one has a different effect.

- **Applebot-Extended controls training.** Disallow Applebot-Extended in robots.txt to keep your content out of training for Apple's general purpose foundation models. Applebot-Extended does not crawl webpages. It only tells Apple how it may use the data Applebot has crawled. Pages that disallow it can still appear in search results. Apple says Search ranking does not consider Applebot-Extended rules.
- **nosnippet controls AI answers.** Apple will not use content tagged nosnippet as extra context when AI models generate output in its products and services. This covers the broad world knowledge answers in Siri and Search. Applebot also will not generate a description or web answer for the page, and suggestions to visit the page show only its title.
- **Paywall markup limits AI context.** You can mark a page with the schema.org property `isAccessibleForFree` set to false. Apple says the page can still appear in search results, but Apple will not use that content as context for AI-generated output. This works at page level only. Section-level markup with `hasPart` is not supported.

Apple also says this: if you disallow Applebot-Extended and apply nosnippet, your robots.txt may still allow Applebot to crawl your pages. Your content then stays discoverable through Spotlight, Siri, Safari and other system-wide features on Apple devices.

Apple describes Applebot's crawled data as the source for all three uses. The documentation names nosnippet as the opt-out for AI answers and Applebot-Extended as the opt-out for training. For a block on Applebot itself, the only effect it states is on search results in Spotlight, Siri and Safari.

## How to verify real Applebot requests

For search crawling and rendering, the Applebot user agent string contains `Applebot/`, a version number and a link to Apple's Applebot page. Any client can copy a user agent string, so also confirm where the request came from. Apple gives two ways to do this:

- **Reverse DNS.** Look up the requesting IP address. A real Applebot address resolves to a host name under applebot.apple.com. Then do a forward lookup on that host name and check that it points back to the same IP address.
- **Official IP list.** Match the IP address against the CIDR prefixes in the JSON file Apple publishes at https://search.developer.apple.com/applebot.json. Use that file directly. This page does not list any addresses.

Apple notes that Applebot sometimes updates the browser version it advertises but keeps the same general format. So match on the `Applebot/` token in the string.

Requests with the user agent `iTMS` can also come from applebot.apple.com hosts. iTMS is not a general search crawler and does not follow robots.txt. Apple says it only crawls URLs linked to registered content on Apple Podcasts.

## What the 10,000 most popular sites do with Applebot

CiteLadder checked the robots.txt rules of the 10,000 most popular websites (Tranco list Q2VV4, 2026-11-06) for the homepage path. 6130 of these sites had a known policy. These figures describe what the robots.txt files say. They do not measure actual Applebot traffic.

- **Blocked:** 227 sites (3.7%) block Applebot.
- **Blocked by name:** 93 sites (1.5%) block it with a rule that names Applebot.
- **Blocked by default:** 134 sites block it through general rules that do not name it.
- **Named at all:** 261 sites (4.3%) mention Applebot in their robots.txt.

The largest sites block it a little more often. In the top 1k, 23 of 527 sites block Applebot (4.4%). In ranks 1k to 10k, 204 of 5603 sites do (3.6%).

News and media sites block it most. 67 of 776 news sites block Applebot (8.6%), and 61 of them do it by name (7.9%). 113 news sites (14.6%) name Applebot. Advertising, analytics and marketing tech sites come next at 7.2%, all through default rules. Online retail and marketplaces block it on 0.6% of sites, and so do banking, finance and payments.

Many sites treat search and training separately. 803 sites block Applebot-Extended, and 589 of them (73.3%) still allow Applebot.

## Frequently asked questions

### Does blocking Applebot-Extended remove my site from Siri, Spotlight or Safari search?

No. Applebot-Extended does not crawl webpages. It only controls whether Apple can use Applebot's crawled data to train its foundation models. Apple says pages that disallow Applebot-Extended can still appear in search results, and Search ranking does not consider these rules.

### How do I keep content out of AI answers in Siri and Search but stay in search results?

Apply the nosnippet directive with a robots meta tag or the X-Robots-Tag HTTP header. Apple will not use content tagged nosnippet as context for AI-generated output in its products and services. The page can still be found, but suggestions to visit it show only its title.

### My robots.txt only has rules for Googlebot. Does Applebot follow them?

Yes. Apple's documentation says that if robots.txt does not mention Applebot but does mention Googlebot, Applebot follows the Googlebot rules. To give Applebot different rules, add a group for the Applebot token.

### Does Applebot follow crawl-delay?

No. Applebot ignores crawl-delay. Apple says Applebot slows its crawl rate on its own when a site slows down or returns errors, and Apple caches crawled content to cut down on unneeded crawling.

### Why do I see iTMS requests that ignore robots.txt?

The iTMS user agent can come from applebot.apple.com hosts, but it is not a general search crawler. Apple says it does not follow robots.txt and only crawls URLs linked to registered content on Apple Podcasts.

## Sources

1. [About Applebot - Apple Support](https://support.apple.com/en-us/119829)
2. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
3. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
