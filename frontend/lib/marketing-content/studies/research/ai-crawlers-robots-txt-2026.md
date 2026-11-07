---
title: 'How the 10,000 most popular websites treat AI crawlers in robots.txt'
slug: '/research/ai-crawlers-robots-txt-2026'
meta_title: 'How the top 10,000 sites treat AI crawlers'
meta_description: 'CiteLadder read robots.txt on the Tranco top 10,000. GPTBot is blocked on 15.5% of sites and Googlebot on 1.5%. Method, tiers, industries and policy advice.'
primary_keyword: 'AI crawlers robots.txt study'
secondary_keywords: ['sites blocking GPTBot', 'AI crawler blocking', 'robots.txt AI bots']
search_intent: 'Learn how popular websites treat AI crawlers in robots.txt'
content_type: 'original research report'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
related_guides: ['/ai-crawlers/gptbot', '/ai-crawlers/claudebot']
index_group: 'AI crawlers'
index_meta: '6130 sites · 2026-11-07'
product:
  heading: 'Check your own AI crawler access'
  href: '/platform/site-health'
  body: 'CiteLadder Site Health crawls your site for AI crawler access issues alongside technical SEO and answer-readiness problems, with page-level evidence for each finding. After you change your robots.txt policy, run a recrawl to confirm the fix took effect.'
---

CiteLadder read the robots.txt files of the 10,000 most popular domains on the Tranco list. For each AI and search crawler on its list, it checked whether the rules let that crawler fetch the homepage. Training crawlers are blocked far more often than search engines. Many sites that block a training crawler still allow the same company's search or user-triggered fetcher. News and media sites block the most. Software, finance and government sites block the least. All results describe what robots.txt files ask for. They do not show which crawlers actually visit a site.

## How the study worked

CiteLadder took the top 10000 domains from Tranco list Q2VV4, dated 2026-11-06. It requested each domain's robots.txt file, identifying itself as CiteLadderSiteHealthBot/1.0. It then parsed the rules and checked one path, the root `/`, for each crawler token on the study's list.

The robots.txt requests ended in these ways:

- 5516 domains served a robots.txt file.
- 532 domains had no file, and 426 answered the request with an HTML page.
- 828 domains blocked CiteLadder's request.
- 2628 domains were unreachable, 52 returned a server error and 18 had some other result.

A site with a file, or with no file at all, has a known policy, because a missing file places no restrictions. That gave 6474 domains. CiteLadder then removed 344 infrastructure domains, leaving 6130 sites. Unless a tier or industry is named, every percentage in this report uses those 6130 sites.

The study counts two kinds of block for each crawler:

- **Blocked by name:** a group in the file names the crawler's token and disallows `/`.
- **Blocked by default:** no group names the token, and the wildcard group (`User-agent: *`) disallows `/`. 182 sites (3%) have a wildcard rule that blocks the root.

The study also records whether a token is named anywhere in the file. CiteLadder also requested `/llms.txt`. 915 sites returned a Markdown file and 81 returned some other kind of file.

## What the results do not show

The study reads rules. It does not measure traffic. A Disallow line shows what a site asks for. It does not show whether a crawler visited, how often, or whether it followed the rule.

Other limits:

- **Only the root path was checked.** A site that allows `/` but disallows whole sections counts as allowing the crawler.
- **Firewalls and bot management were not tested.** CDN rules, user-agent filters and IP blocks aimed at AI crawlers do not show up in robots.txt. The 828 domains that blocked CiteLadder's request say nothing about how they treat other bots.
- **Other signals were not read.** Meta robots tags, HTTP headers and the newer machine-readable AI training preference signal described on Anthropic's help page were outside the scope.
- **It is one snapshot.** Robots.txt files change, and these results reflect a single list date.

This report summarizes crawler documentation from OpenAI and Anthropic only. For Google, Microsoft, Apple and Perplexity crawlers, read each operator's own documentation. This report does not describe what their tokens control.

## Headline findings

Search engines are almost never blocked. Googlebot is blocked on 1.5% of sites and Bingbot on 2%. Most of those blocks come from wildcard rules. Googlebot is blocked by name on 5 sites and by default on 89.

Crawlers the study classifies as training crawlers are blocked most often:

- Bytespider: 16.8%
- CCBot: 16.7%
- GPTBot: 15.5%
- ClaudeBot: 15%
- Meta-ExternalAgent: 13.8%
- Google-Extended: 13.5%
- Applebot-Extended: 13.1%

Search crawlers and user-triggered fetchers are blocked less often:

- PerplexityBot: 9%
- ChatGPT-User: 7.7%
- Perplexity-User: 6.6%
- Claude-User: 6.3%
- OAI-SearchBot: 6.1%
- Claude-SearchBot: 6%

Most AI blocks are deliberate. Of the 951 sites that block GPTBot, 816 name it directly. Of the 919 that block ClaudeBot, 769 name it. GPTBot is the most often named token, appearing in 18.8% of files.

Old tokens are still common. anthropic-ai is blocked on 13.1% of sites and Claude-Web on 11.7%. Anthropic's help page lists three robots: ClaudeBot, Claude-User and Claude-SearchBot. Neither older name is on that list.

## Training crawlers versus search and user-triggered fetchers

OpenAI and Anthropic each run separate crawlers for training, search and user requests. Their documentation describes what each one does.

**OpenAI**

- GPTBot crawls content that may be used to train OpenAI's generative AI foundation models. Disallowing it signals that a site's content should not be used for that training.
- OAI-SearchBot surfaces websites in ChatGPT's search features. Sites that opt out are not shown in ChatGPT search answers, though they can still appear as navigational links.
- ChatGPT-User visits pages when users ask ChatGPT or a Custom GPT a question. It does not crawl the web automatically. OpenAI says robots.txt rules may not apply to these user-initiated actions, and that ChatGPT-User is not used to decide whether content appears in search.
- OpenAI states that each setting is independent of the others.

**Anthropic**

- Restricting ClaudeBot signals that a site's future materials should be excluded from Anthropic's training datasets.
- Disabling Claude-SearchBot stops Anthropic from indexing the content for search, which may reduce the site's visibility in user search results.
- Disabling Claude-User stops Claude from retrieving the content in response to a user query, which may reduce visibility for user-directed web search.

**What sites do with these pairs**

Many sites that block a training crawler still allow the related search crawler or fetcher:

- Of 951 sites blocking GPTBot, 581 (61.1%) allow OAI-SearchBot and 495 (52.1%) allow ChatGPT-User.
- Of 919 sites blocking ClaudeBot, 552 (60.1%) allow Claude-SearchBot and 537 (58.4%) allow Claude-User.
- Of 828 sites blocking Google-Extended, 735 (88.8%) allow Googlebot.
- Of 803 sites blocking Applebot-Extended, 589 (73.3%) allow Applebot.
- Of 550 sites blocking PerplexityBot, 177 (32.2%) allow Perplexity-User.

The Google pair shows the widest split and the Perplexity pair the narrowest. The study classifies PerplexityBot as a search crawler. So the Perplexity pair compares a search crawler with a user fetcher, while every other pair starts from a training crawler.

## Differences by rank tier

The top 1,000 domains block AI crawlers more often than domains ranked 1,001 to 10,000. The top tier has 527 sites with a known policy and the lower tier has 5603. Because the top tier is small, read its figures as indicative.

Training crawlers, top 1k vs. rank 1k–10k:

- GPTBot: 18.6% vs. 15.2%
- ClaudeBot: 18.8% vs. 14.6%
- Google-Extended: 15.7% vs. 13.3%
- CCBot: 21.4% vs. 16.2%

The gap is wider for search crawlers and user fetchers:

- OAI-SearchBot: 9.9% vs. 5.7%
- Claude-SearchBot: 11.8% vs. 5.5%
- ChatGPT-User: 11.2% vs. 7.4%
- PerplexityBot: 14.8% vs. 8.4%
- Perplexity-User: 12.7% vs. 6.1%

Googlebot is blocked on 1.9% of top-tier sites and 1.5% of the rest. Wildcard rules explain part of the gap. In the top tier, 28 of the 67 sites that block Perplexity-User do so by default. Top sites also write more detailed files. Googlebot is named in 15.4% of top-tier files and in 7.6% of the rest.

## Differences by industry

Industry labels come from the study's own classification. 548 sites could not be assigned an industry. Insurance had too few sites (12) to report. Groups under about 100 sites, such as health, jobs, real estate and automotive, swing a lot with a handful of files.

**News and media (776 sites)** block the most. ClaudeBot is blocked on 42.7%, GPTBot on 39.6%, CCBot on 46.6% and Google-Extended on 36.5%. These sites also block search and user fetchers often: PerplexityBot on 32.6%, ChatGPT-User on 25.3%, OAI-SearchBot on 20.4% and Claude-SearchBot on 20%. Googlebot is blocked on 0.1%.

**Entertainment and streaming (389 sites)** show the clearest split between training and search. GPTBot is blocked on 26% and ClaudeBot on 24.9%. OAI-SearchBot is blocked on 4.4% and Claude-SearchBot on 3.6%.

**Reference and knowledge (152 sites)** and **health and medical (81 sites)** also block training crawlers often. In reference, GPTBot is blocked on 21.1% and ClaudeBot on 21.7%. In health, the figures are 21% and 24.7%.

**Sports (131 sites)** stand out for blocking particular crawlers. Bytespider is blocked on 32.8%, FacebookBot and cohere-ai each on 27.5%, and GPTBot on 21.4%. Every one of these blocks is by name.

**Online retail and marketplaces (346 sites)** block GPTBot and ClaudeBot on 15.6% each and OAI-SearchBot on 6.9%.

**Low-blocking groups** include software and SaaS (992 sites, GPTBot 4.2%, OAI-SearchBot 2.7%), banking, finance and payments (179 sites, GPTBot 3.9%), government and public sector (242 sites, GPTBot 4.1%) and consumer technology (162 sites, GPTBot 3.7%). Education and research (389 sites) block GPTBot on 9.8% but ClaudeBot on only 5.9%.

**Advertising, analytics and marketing tech (377 sites)** look different. Googlebot is blocked on 6.6% of these sites, and 22 of those 25 blocks come from wildcard rules. GPTBot blocks follow the same pattern, with 26 of 31 by default. Many of these domains block all crawlers. They do not single out AI crawlers.

## What the findings mean for your own policy

Decide by purpose. OpenAI and Anthropic give training, search and user-triggered fetching separate tokens. A rule for one does not set the others.

Practical points:

- **Separate training from visibility.** Among sites that block a training crawler, allowing the related search crawler is common: 61.1% for the OpenAI pair and 60.1% for the Anthropic pair.
- **Know what a search block costs.** OpenAI says sites that opt out of OAI-SearchBot are not shown in ChatGPT search answers. Anthropic says disabling Claude-SearchBot or Claude-User may reduce visibility.
- **Do not rely on robots.txt for user fetches.** OpenAI says robots.txt rules may not apply to ChatGPT-User, because a user starts those requests.
- **Check your wildcard group.** A `Disallow: /` under `User-agent: *` blocks every crawler you do not name. Most Googlebot blocks in this study come from such rules.
- **Use current tokens.** Anthropic's help page lists ClaudeBot, Claude-User and Claude-SearchBot. Anthropic follows rules that name ClaudeBot. If ClaudeBot is not mentioned, it follows the general training preference signal. A file that names only anthropic-ai or Claude-Web does not name ClaudeBot.
- **Cover every subdomain.** Anthropic asks site owners to add the rules for each subdomain they want to opt out.
- **Allow time for changes.** OpenAI notes that its search systems need time to adjust after a robots.txt update. Its crawler page gives the current estimate.
- **Verify, then decide on IP rules.** OpenAI publishes a separate IP list for each of its crawlers, linked from its crawler page. Anthropic links its list from its help page. Anthropic warns that blocking its IP addresses may not work correctly, because it stops Anthropic from reading your robots.txt file.

CiteLadder can check which of these crawlers your robots.txt allows. It can also show how your brand appears in ChatGPT, Claude and Gemini answers.

## Frequently asked questions

### Does blocking GPTBot remove my site from ChatGPT search?

Not according to OpenAI. GPTBot and OAI-SearchBot are independent settings. OAI-SearchBot decides whether a site is shown in ChatGPT search answers. In this study, 581 of the 951 sites that block GPTBot (61.1%) allow OAI-SearchBot.

### Do these numbers show which AI crawlers actually visit sites?

No. The study reads robots.txt rules for the root path only. It does not measure traffic, compliance, firewall rules or blocks on other paths.

### Should I still list anthropic-ai and Claude-Web in robots.txt?

Anthropic's help page lists three robots: ClaudeBot, Claude-User and Claude-SearchBot. It says it follows robots.txt rules that name ClaudeBot. If ClaudeBot is not mentioned, it follows the general training preference signal. To state a training preference for Anthropic, name ClaudeBot. In this study, anthropic-ai is still blocked on 13.1% of sites.

### Why does Googlebot show as blocked on some sites?

Mostly because of wildcard rules. Of the 94 sites where Googlebot is blocked, 5 name it directly and 89 block it through `User-agent: *` with `Disallow: /`.

### How can I check that a request really comes from OpenAI or Anthropic?

Compare the source IP with the official lists. OpenAI links a separate IP list for each crawler from its crawler documentation. Anthropic links its list from its help page. This report does not reproduce any addresses, because the official lists can change.

## Sources

1. [Overview of OpenAI Crawlers](https://developers.openai.com/api/docs/bots)
2. [Does Anthropic crawl data from the web, and how can site owners block the crawler? | Claude Help Center](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
3. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
4. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
