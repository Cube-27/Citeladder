---
title: 'Claude-User'
slug: '/ai-crawlers/claude-user'
meta_title: "Claude-User: Anthropic's user fetcher, robots.txt and verification"
meta_description: "Learn what Anthropic's Claude-User fetcher does, what blocking it changes, how to verify real requests, and how the 10,000 most popular sites treat it in robots.txt."
primary_keyword: 'Claude-User'
secondary_keywords: ['Claude-User robots.txt', 'block Claude-User', 'Claude-User user agent']
search_intent: 'Understand what Claude-User does and decide whether to allow or block it'
content_type: 'AI crawler directory page'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
related_guides: ['/ai-crawlers/claudebot', '/research/ai-crawlers-robots-txt-2026']
index_group: 'User-triggered AI fetchers'
index_meta: 'Blocked by 6.3% of top sites'
product:
  heading: 'Check which AI crawlers can reach you'
  href: '/platform/site-health'
  body: 'CiteLadder crawls your site for AI crawler access issues, including the rules that affect agents like Claude-User, and shows page-level evidence for each finding. After you change your robots.txt, a recrawl verifies the fix.'
---

Claude-User is the agent Anthropic uses when a person asks Claude a question and Claude needs to read a web page. This page covers who runs it and what it is for. It also explains what blocking it changes, how to check real requests and what the 10,000 most popular websites say about it in robots.txt.

## Claude-User at a glance

|                      |                                                     |
| -------------------- | --------------------------------------------------- |
| robots.txt token     | `Claude-User`                                       |
| Operator             | Anthropic                                           |
| Purpose              | User-triggered AI fetcher                           |
| User agent contains  | `claude-user`                                       |
| Official IP list     | [claude.com](https://claude.com/crawling/bots.json) |
| Blocked by top sites | 6.3% of 6,130 sites with a readable policy          |

## robots.txt rules for Claude-User

Block it everywhere:

```text
User-agent: Claude-User
Disallow: /
```

Allow it everywhere:

```text
User-agent: Claude-User
Allow: /
```

## Who runs Claude-User and what it does

Claude-User is run by Anthropic. Anthropic's documentation says Claude-User "supports Claude AI users." When people ask Claude questions, Claude may visit websites using the Claude-User agent.

Anthropic lists three robots. Each one has a separate job:

- **ClaudeBot** collects web content that could be used to train Anthropic's AI models.
- **Claude-User** fetches pages in response to a user's request.
- **Claude-SearchBot** scans the web to improve the quality of Claude's search results.

The documentation says Anthropic uses separate robots so site owners can see what each one does and choose which ones to allow. Claude-User only covers requests that a user starts. Browsers that Anthropic hosts so Claude can complete tasks for users identify themselves as Claude-Agent. A separate help article covers them.

## Allowing or blocking Claude-User in robots.txt

Anthropic says its robots follow the standard rules in robots.txt. Its robots.txt name is `Claude-User`. You have three options:

- **Allow it.** Claude can fetch your pages when a user asks about them.
- **Block it by name.** Write a rule that names Claude-User. This blocks it and leaves ClaudeBot and Claude-SearchBot untouched.
- **Leave it unnamed.** Claude-User then follows your general rule for all bots. If that rule blocks everything, Claude-User is blocked too, even though you never named it.

The robots.txt file goes in your site's top-level directory. The documentation says to do this for every subdomain you want to opt out. Each subdomain needs its own file.

Anthropic says robots.txt is the way to opt out. It warns that blocking Anthropic's IP addresses may not work correctly or reliably keep you opted out, because it stops Anthropic from reading your robots.txt file.

## What blocking changes for Claude answers and for training

According to the documentation, blocking Claude-User stops Anthropic from fetching your content in response to a user's question. Anthropic says this "may reduce your site's visibility for user-directed web search."

The documentation links training to ClaudeBot, not Claude-User. Blocking ClaudeBot tells Anthropic to leave your site's future content out of its training data. The documentation does not say that blocking Claude-User changes anything about training.

Search indexing is a third, separate setting. Blocking Claude-SearchBot stops Anthropic from indexing your content for search. Anthropic says this may reduce your site's visibility and accuracy in search results. You can set each of the three robots on its own. For example, you can block training and still let Claude fetch your pages when users ask.

## How to verify a real Claude-User request

Any client can claim to be Claude-User, so the name alone proves nothing. Check two things:

- **The user agent.** A real request has a user-agent string containing `Claude-User`.
- **The source IP address.** Compare it with the official list Anthropic publishes at https://claude.com/crawling/bots.json. Anthropic says a source IP on that list means the request comes from Anthropic.

Check the live list each time. Do not copy addresses into your own notes, because the list can change. If you think Anthropic's robots are not behaving as described, the documentation says to contact Anthropic from an email address on the domain in question.

## What the 10,000 most popular sites do with Claude-User

CiteLadder checked the robots.txt files of the 10,000 most popular websites (Tranco list Q2VV4, 2026-11-06) for the homepage path. 6130 sites had a policy we could read. These numbers show what the robots.txt files say. They do not measure how often Claude-User actually visits these sites.

- 386 sites (6%) block Claude-User.
- 234 sites (4%) block it by name. Another 152 block it through a general rule for all bots that does not name it.
- 389 sites (6%) mention Claude-User by name.

**By popularity.** In the top 1k (527 sites with a readable policy), 61 sites (12%) block Claude-User and 70 (13%) name it. In ranks 1k to 10k (5603 sites), 325 (6%) block it and 319 (6%) name it.

**By industry.** News and media blocks it most: 158 of 776 sites (20%), with 145 of them naming it. In social networks and communities, 26 of 225 sites (12%) block it, but 20 of those do so through a general rule. In online retail and marketplaces, 25 of 346 sites (7%) block it, 22 of them by name. Blocking is rare in software and SaaS (21 of 992 sites, 2%) and in education and research (2 of 389 sites, 0.5%). No nonprofit or automotive site in the study blocks it.

**Compared with ClaudeBot.** Of the 919 sites that block ClaudeBot, 537 (58%) still allow Claude-User. These sites keep their content out of training while letting Claude fetch their pages for users.

## Frequently asked questions

### Does blocking Claude-User stop Anthropic from training on my content?

The documentation links training to ClaudeBot. It describes Claude-User only as the agent that fetches pages when users ask. It does not say that blocking Claude-User affects training. To opt out of training, set a robots.txt rule for ClaudeBot. Since October 30, 2026, Anthropic has also begun honoring a machine-readable "no AI training" preference signal. A robots.txt rule that names ClaudeBot takes priority over that signal.

### Will my site disappear from Claude's answers if I block Claude-User?

The documentation says blocking Claude-User stops Anthropic from fetching your content in response to a user's question. It says this may reduce your visibility in user-directed web search. It does not say your site is removed from all answers. Claude-SearchBot, which indexes content for search, has its own separate setting.

### Can I block Claude-User by IP address?

Anthropic advises against it. The documentation says blocking IP addresses may not work correctly or reliably keep you opted out, because it stops Anthropic from reading your robots.txt file. Use robots.txt instead. Use the official IP list at https://claude.com/crawling/bots.json only to confirm that a request is really from Anthropic.

### Is Claude-User the same as Claude-Agent?

No. Claude-User is the agent Claude uses to fetch pages when a user asks. Claude-Agent is the name used by browsers that Anthropic hosts so Claude can complete tasks for users. A separate Anthropic help article covers Claude-Agent.

### How do I check whether my site currently allows Claude-User?

Read your robots.txt and find the rules that apply to Claude-User. If there is no rule that names it, your general rule for all bots applies. Check this on every subdomain, because each one has its own file. CiteLadder can check your site and show which AI crawlers your robots.txt allows or blocks.

## Sources

1. [Does Anthropic crawl data from the web, and how can site owners block the crawler? | Claude Help Center](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
2. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
3. CiteLadder study of robots.txt rules on the 10,000 most popular websites, collected 2026-11-07: [method and results](/research/ai-crawlers-robots-txt-2026)
