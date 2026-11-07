---
title: 'How many of the 10,000 most popular websites publish llms.txt'
slug: '/research/llms-txt-adoption-2026'
meta_title: 'How many of the top 10,000 websites publish llms.txt'
meta_description: 'CiteLadder requested /llms.txt from the top 10,000 websites. 12.4% of sites that answered served a valid Markdown file. See results by rank, industry, file shape and GPTBot policy.'
primary_keyword: 'llms.txt adoption'
secondary_keywords: ['llms.txt', 'how many sites use llms.txt', 'llms.txt examples']
search_intent: 'Learn how many popular websites publish llms.txt and what the files contain'
content_type: 'original research report'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
related_guides: ['/research/ai-crawlers-robots-txt-2026', '/ai-crawlers/gptbot']
index_group: 'Website files for AI'
index_meta: '6,943 sites · 2026-11-07'
product:
  heading: 'Check which AI crawlers fetch your pages'
  href: '/platform/ai-referral-analytics'
  body: 'This study could not show whether AI systems read llms.txt, but your own server logs can show which AI crawlers request your pages. CiteLadder brings in those logs alongside the GA4 visits that ChatGPT, Gemini and other assistants send you, so you can judge what AI actually does with your site.'
---

On 2026-11-07, CiteLadder requested /llms.txt from the top 10,000 sites on the Tranco list. 6943 sites answered. Of those, 863 (12.4%) served a valid Markdown file. Adoption was higher in the top 1k and highest among software and SaaS sites. The study checked whether a file exists and what it looks like. It did not measure whether any AI system reads these files.

## What llms.txt is, according to the specification

The llms.txt specification describes itself as "a proposal to standardise on using an /llms.txt file to provide information to help agents use a website." It is a Markdown file with brief background information, guidance and links to more detailed Markdown files. The file can sit at the site root (`/llms.txt`) or at a subpath such as `/docs/llms.txt`. In that case it covers the pages under that path.

The specification lists the parts of a file in a fixed order:

- An optional byte-order mark
- A top-level heading with the name of the project or site. This is the only required part
- A blockquote with a short summary of the project
- Optional Markdown content of any type except headings, with more detail about the project and how to read the linked files
- Optional sections under second-level headings, each holding a "file list" of links in the form `[name](url)`, which can be followed by a colon and notes

By convention, a section named "Optional" holds secondary links that an agent can skip when it needs a shorter context.

The specification also suggests a clean Markdown version of each important page at the same URL with `.md` added. It says links in llms.txt should point to content that is easy for language models to read, such as those Markdown versions.

The specification separates llms.txt from robots.txt. robots.txt tells automated tools what access is acceptable. llms.txt is used on demand, when an agent needs information while helping a user. The specification says the file has mainly been used for inference, and most heavily for software documentation read by coding agents. It notes that the AI labs publish llms.txt files for their own developer documentation. It does not say whether ChatGPT, Claude or Gemini read other sites' llms.txt files when they answer questions. That remains unclear.

## How the study was run

- **List:** Tranco Q2VV4 (2026-11-06), top 10,000.
- **Run date:** 2026-11-07.
- **Exclusions:** Infrastructure domains were removed first, because they do not serve a website for visitors. That left 9617 sites.
- **Path checked:** `/llms.txt` at the site root only. Files placed only at a subpath, such as `/docs/llms.txt`, were not counted, even though the specification allows them.
- **Base for percentages:** 6943 sites answered the request. All percentages below use the sites that answered.

A response counted as valid only if it was a Markdown file. Two kinds of response did not count:

- 822 sites returned an HTML page at `/llms.txt`, not a text file.
- 78 sites returned plain text that was not Markdown.

The study recorded whether a valid file exists and what shape it has. It did not test whether any crawler or AI assistant requests, reads or uses these files.

## Adoption overall and by rank tier

Of the 6943 sites that answered, 863 served a valid Markdown llms.txt file. That is 12.4%.

Adoption was higher among the most popular sites.

| Rank tier       | Sites answered | Valid llms.txt | Share |
| --------------- | -------------- | -------------- | ----- |
| Top 1k          | 581            | 103            | 17.7% |
| Ranks 1k to 10k | 6362           | 760            | 11.9% |
| All             | 6943           | 863            | 12.4% |

About one in eight answering sites publishes a valid file at the root. Most popular websites do not have one yet.

## Adoption by industry

Adoption varied a lot by industry. The highest rates were in software and technology. The lowest were in government, adult content and sports.

**Highest adoption**

| Industry                                  | Sites answered | Valid llms.txt | Share |
| ----------------------------------------- | -------------- | -------------- | ----- |
| Software and SaaS                         | 1046           | 292            | 27.9% |
| Banking, finance and payments             | 201            | 45             | 22.4% |
| Consumer technology and hardware          | 185            | 41             | 22.2% |
| Advertising, analytics and marketing tech | 405            | 78             | 19.3% |
| Jobs and careers                          | 60             | 11             | 18.3% |

**Lowest adoption**

| Industry                        | Sites answered | Valid llms.txt | Share |
| ------------------------------- | -------------- | -------------- | ----- |
| Government and public sector    | 292            | 2              | 0.7%  |
| Adult                           | 409            | 14             | 3.4%  |
| Sports                          | 143            | 6              | 4.2%  |
| Social networks and communities | 237            | 13             | 5.5%  |
| Games                           | 202            | 14             | 6.9%  |
| Real estate                     | 58             | 4              | 6.9%  |

Some large content categories were also below the overall rate. News and media was at 8.8% (73 of 831), and education and research at 7.6% (32 of 420). Insurance had too few sites (16) to report a rate.

Software and SaaS leads by a clear margin. This fits the specification's note that llms.txt is used most heavily for software documentation.

## What the published files look like

We looked at the structure of all 863 valid files.

| Measure                                         | Result     |
| ----------------------------------------------- | ---------- |
| Median file size                                | 7359 bytes |
| Median number of links                          | 37         |
| Files with sections under second-level headings | 95.9%      |
| Files with a blockquote summary line            | 84%        |
| Files with an "Optional" section                | 29.3%      |
| Files linking to `.md` pages                    | 14%        |

Most files follow the basic layout in the specification: a title, a summary blockquote and sections of links. The "Optional" section is less common. It appears in fewer than a third of files.

The largest gap is in what the files link to. The specification says links should point to content that language models can read easily, such as Markdown versions of pages. Only 14% of files link to `.md` pages. Most files point to ordinary HTML pages.

## How llms.txt adoption relates to GPTBot policy

We compared llms.txt adoption with each site's robots.txt rules for GPTBot, OpenAI's crawler.

| robots.txt policy for GPTBot | Sites | Share with valid llms.txt |
| ---------------------------- | ----- | ------------------------- |
| Blocks GPTBot                | 931   | 4.8%                      |
| Allows GPTBot                | 4286  | 18.9%                     |

Sites that allow GPTBot were far more likely to publish llms.txt. Sites that block it rarely do. This is a correlation. It suggests that sites open to AI crawlers are also the ones preparing content for AI agents. It does not show that llms.txt changes how GPTBot or any other crawler behaves. The specification treats robots.txt and llms.txt as separate tools with separate purposes.

## What this means for a site deciding whether to publish llms.txt

- **The benefit for AI answers is unproven.** Whether ChatGPT, Claude or Gemini use llms.txt when answering questions is unclear. This study does not settle it, because it measured files and not reading behaviour.
- **The clearest use case is documentation.** The specification says the files are used most heavily for software documentation followed by coding agents. If you publish developer docs or an API, a file is a reasonable addition. Adoption in software and SaaS (27.9%) reflects this.
- **The cost is low.** The specification lists documentation platforms, CMSs and WordPress plugins that can generate a file automatically. Only the top-level heading is required.
- **If you publish, follow the format.** Use a title, a one-line summary in a blockquote, sections of links with short notes, and an "Optional" section for secondary links. Where you can, link to Markdown versions of pages.
- **Check what `/llms.txt` returns today.** 822 sites returned an HTML page at that path. If you do not publish a file, the path should return a normal not-found response.
- **Keep robots.txt and llms.txt consistent.** llms.txt does not grant or block crawler access. If you block AI crawlers in robots.txt, a llms.txt file will not change that.

CiteLadder checks whether AI crawlers can reach your site and measures how your brand appears in answers from ChatGPT, Claude and Gemini. That lets you compare your visibility before and after you publish a file.

## Frequently asked questions

### Do ChatGPT, Claude or Gemini read llms.txt files?

It is unclear. The specification says the AI labs publish llms.txt files for their own developer docs. It does not say their assistants read other sites' files when answering. This study measured whether files exist and what they look like. It did not measure whether any AI system reads them.

### What share of popular websites publish llms.txt?

In the 2026-11-07 run, 863 of the 6943 sites that answered served a valid Markdown file at /llms.txt, which is 12.4%. In the top 1k the rate was 17.7%. For ranks 1k to 10k it was 11.9%.

### What is the minimum valid llms.txt file?

According to the specification, only a top-level heading with the site or project name is required. The specification also describes a blockquote summary, optional detail text, and sections of links under second-level headings, including a conventional "Optional" section for secondary links.

### Is llms.txt a replacement for robots.txt?

No. The specification says they have different purposes. robots.txt tells automated tools what access is acceptable. llms.txt gives agents a curated overview with links when they need information while helping a user.

### Does the file have to be at the site root?

No. The specification allows /llms.txt at the root or at any subpath, such as /docs/llms.txt, covering the pages under that path. This study checked only the root path, so files placed only at a subpath were not counted.

## Sources

1. [The /llms.txt file, v2 – llms-txt](https://llmstxt.org/)
2. [Tranco list Q2VV4, generated 2026-11-06](https://tranco-list.eu/list/Q2VV4/1000000)
3. CiteLadder crawl of /llms.txt on the 10,000 most popular websites, collected 2026-11-07; method shared with [the robots.txt study](/research/ai-crawlers-robots-txt-2026)
