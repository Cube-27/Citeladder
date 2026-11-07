---
title: 'ClaudeBot'
slug: '/ai-crawlers/claudebot'
meta_title: "ClaudeBot: Anthropic's AI training crawler"
meta_description: 'What ClaudeBot does, what blocking it changes according to Anthropic, how to verify real requests, and how the 10,000 most popular sites treat it in robots.txt.'
primary_keyword: 'ClaudeBot'
secondary_keywords: ['ClaudeBot robots.txt', 'block ClaudeBot', 'ClaudeBot user agent']
search_intent: 'Understand what ClaudeBot does and decide whether to allow or block it'
content_type: 'AI crawler directory page'
reviewed_at: '2026-11-07'
related_guides: ['/ai-crawlers/claude-searchbot', '/research/ai-crawlers-robots-txt-2026']
index_group: 'AI training crawlers'
index_meta: 'Blocked by 15% of top sites'
---

ClaudeBot is Anthropic's web crawler for AI model training. Anthropic says that blocking it in robots.txt signals that a site's future content should be left out of its training datasets. Anthropic runs separate bots for search and for requests made by users, and each one has its own rule. In the robots.txt files of the 10,000 most popular websites, 15% of sites with a known policy block ClaudeBot.

## ClaudeBot at a glance

|                      |                                                     |
| -------------------- | --------------------------------------------------- |
| robots.txt token     | `ClaudeBot`                                         |
| Operator             | Anthropic                                           |
| Purpose              | AI training crawler                                 |
| User agent contains  | `claudebot`                                         |
| Official IP list     | [claude.com](https://claude.com/crawling/bots.json) |
| Blocked by top sites | 15% of 6,130 sites with a readable policy           |

## robots.txt rules for ClaudeBot

Block it everywhere:

```text
User-agent: ClaudeBot
Disallow: /
```

Allow it everywhere:

```text
User-agent: ClaudeBot
Allow: /
```

## Who runs ClaudeBot and what it does

ClaudeBot is run by Anthropic, the company that makes Claude. Anthropic's documentation says ClaudeBot collects web content that could potentially contribute to the training of its generative AI models. Anthropic calls it its training crawler.

Anthropic runs two other robots, and each has a different job:

- **Claude-SearchBot** crawls the web to improve the relevance and accuracy of search responses.
- **Claude-User** visits websites when a Claude user asks a question.

Each bot has its own name in robots.txt, so you can set a separate rule for each one.

Anthropic lists these crawling principles. Its bots follow "do not crawl" directives in robots.txt. They try to keep disruption low by pacing how often they crawl the same domain. They respect Crawl-delay where appropriate. They do not try to bypass anti-circumvention tools such as CAPTCHAs.

## Allowing or blocking ClaudeBot in robots.txt

The robots.txt name for this crawler is `ClaudeBot`. You have these options:

- **Allow it.** If no rule in your robots.txt restricts it, ClaudeBot can crawl your site.
- **Block it across the whole site.** Add a disallow rule under the ClaudeBot name to the robots.txt file in your top-level directory. Anthropic says to do this for every subdomain you want to opt out.
- **Block only some paths.** Name ClaudeBot and disallow only the sections you want to keep out.
- **Slow it down.** Anthropic supports the non-standard Crawl-delay extension for ClaudeBot.

Anthropic says robots.txt is the way to opt out. It warns that blocking the IP addresses its bots use may not work correctly or keep you opted out over time, because then it cannot read your robots.txt file.

There is also a newer option. As of October 30, 2026, Anthropic recognizes a machine-readable signal that lets site owners say "no AI training". The signal follows a draft from the IETF aipref working group. Anthropic is rolling it out across its services over time. It notes that the way it reads these settings may change as the standards develop.

For any given path, a rule that names ClaudeBot takes priority:

- If your robots.txt names ClaudeBot, Anthropic follows that rule, even if your general setting says something different.
- If your robots.txt does not mention ClaudeBot, Anthropic follows the general setting.

## What blocking ClaudeBot changes for Claude answers

Anthropic describes the effect of restricting ClaudeBot only in terms of training. A block signals that the site's future materials should be left out of Anthropic's AI model training datasets. The documentation does not describe any effect on search or on pages fetched for users.

Anthropic ties visibility in Claude's search and answers to the other two bots:

- Disabling **Claude-SearchBot** stops Anthropic from indexing your content for search optimization. Anthropic says this may reduce your site's visibility and accuracy in user search results.
- Disabling **Claude-User** stops Anthropic from fetching your content in response to a user's question. Anthropic says this may reduce your site's visibility for user-directed web search.

So a site can block ClaudeBot to opt out of training and still allow Claude-SearchBot and Claude-User. Many large sites do exactly this, as the study below shows.

The documentation does not say how blocking ClaudeBot affects the way Claude talks about a brand. CiteLadder measures how your brand appears in Claude answers, so you can check this for your own site.

## How to verify ClaudeBot requests

Use two checks:

- **User agent.** Real ClaudeBot requests have a user agent string that contains `claudebot`. Matching this is a first filter only. Any client can send any user agent string.
- **Source IP address.** Anthropic publishes the IP addresses its crawlers use at https://claude.com/crawling/bots.json. Anthropic says that if a crawler's source IP address is on this list, the crawler is coming from Anthropic. Check against the list at that address. Do not keep your own copy of the addresses.

If a request claims to be ClaudeBot but its IP address is not on the official list, Anthropic's documentation gives no basis for treating it as Anthropic. If you think Anthropic's crawlers are not behaving as described, the documentation gives a contact address. Write from an email address on the domain you are asking about.

CiteLadder checks whether your robots.txt allows or blocks ClaudeBot and other AI crawlers.

## What the 10,000 most popular sites do with ClaudeBot

CiteLadder checked the robots.txt rules of the 10,000 most popular websites (Tranco list Q2VV4, 2026-11-06) for the homepage path. 6130 sites had a policy we could determine, and the percentages below are shares of those sites. These figures describe what robots.txt files say. They do not show which crawlers actually visited a site or what the crawlers did.

- 919 sites (15%) block ClaudeBot.
- 769 sites (12.5%) block it by name. The other 150 block it through a general rule that does not name it.
- 1039 sites (16.9%) name ClaudeBot in their robots.txt, to allow it or to block it.

The most popular sites block it more often. In the top 1k, 99 of 527 sites (18.8%) block ClaudeBot. In the rank 1k to 10k group, 820 of 5603 sites (14.6%) block it.

By industry, News and media has the highest block rate. 331 of 776 sites (42.7%) block ClaudeBot, and 314 of them block it by name. Next come Entertainment and streaming (24.9%), Health and medical (24.7%), Reference and knowledge (21.7%) and Social networks and communities (21.3%). The lowest rates are in Consumer technology and hardware (2.5%), Banking, finance and payments (3.4%), Software and SaaS (3.7%) and Government and public sector (3.7%). In Advertising, analytics and marketing tech, 29 sites block ClaudeBot, and 26 of them do so through a general rule.

Many sites that block ClaudeBot still allow Anthropic's other bots. Of the 919 sites that block ClaudeBot, 552 (60%) allow Claude-SearchBot and 537 (58%) allow Claude-User.

## Frequently asked questions

### Does blocking ClaudeBot remove my site from Claude's answers?

Anthropic's documentation describes only one effect of blocking ClaudeBot. It signals that your site's future content should be left out of training datasets. Anthropic links visibility in search results and user-directed search to Claude-SearchBot and Claude-User, which you control separately.

### Can I block ClaudeBot by its IP addresses?

Anthropic says robots.txt is the way to opt out. It warns that blocking its IP addresses may not work correctly or keep you opted out over time, because it then cannot read your robots.txt file. Use the official list at https://claude.com/crawling/bots.json to verify requests.

### Do I need a separate rule for each subdomain?

Yes. Anthropic says to add the rule to the robots.txt file in the top-level directory of every subdomain you want to opt out.

### What happens if my robots.txt does not mention ClaudeBot?

If your robots.txt names ClaudeBot, Anthropic follows that rule for that path. If it does not mention ClaudeBot, Anthropic follows your general "no AI training" preference signal, which it began recognizing on October 30, 2026 and is rolling out over time. In CiteLadder's study, 150 sites block ClaudeBot through a general rule that does not name it.

### Do the study numbers show how often ClaudeBot visits these sites?

No. The study covers only robots.txt rules for the homepage path of the 10,000 most popular websites. It shows what sites ask crawlers to do. It does not show actual crawler traffic.

## Sources

1. [Does Anthropic crawl data from the web, and how can site owners block the crawler? | Claude Help Center](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
2. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
3. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
