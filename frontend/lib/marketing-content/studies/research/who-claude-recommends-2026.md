---
title: 'Which brands Claude recommends from memory: 1,200 answers across 20 categories'
slug: '/research/who-claude-recommends-2026'
meta_title: 'Which brands Claude recommends from memory: 1,200 answers'
meta_description: 'CiteLadder asked Claude Sonnet 5.5 400 buyer questions across 20 categories, three times each, with no tools. See which brands it named and how consistent it was.'
primary_keyword: 'which brands Claude recommends'
secondary_keywords:
  ['Claude brand recommendations', 'AI recommendation study', 'brand visibility in AI answers']
search_intent: 'Learn which brands Claude names when buyers ask for recommendations, and how consistent it is'
content_type: 'original research report'
related_guides:
  ['/research/claude-web-search-2026', '/claude-recommendations/crm-for-small-businesses']
index_group: 'Claude recommendations'
index_meta: '1,200 answers · 20 categories · 2026-11-07'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
product:
  heading: 'Track how often Claude names you'
  href: '/platform/ai-visibility'
  body: "CiteLadder tracks your brand's mentions, position and sentiment against competitors across Claude, ChatGPT, Gemini, Google AI Overviews and Google AI Mode. Every result is tied to the recorded answer, so you can check the same questions this study asked in your own category."
---

CiteLadder asked Claude Sonnet 5.5 400 buyer questions across 20 categories, three times each, with no tools. That gave 1,200 answers drawn only from what the model already knows. The average answer named 7.7 brands. Repeat runs of the same question agreed on 62.9% of brands on average. In some categories one brand appeared in nearly every answer. In others the mentions were spread thin. This report shows what Claude said. It does not rank which products are good.

## Why this matters

Buyers now ask AI assistants for recommendations. They type a question like they would to a colleague and get back a short list of names. A brand that is not on that list is easy to miss.

When Claude answers without tools, the list comes from what the model learned in training. It does not check today's web. That makes the from-memory answer a useful baseline. It shows which brands the model already associates with a category before any search happens.

For marketers and founders, the practical questions are simple. Does Claude name your brand in your category? How often? Where in the list? And does that stay the same when you ask again?

## How the study worked

We built a set of buyer questions and sent them to Claude Sonnet 5.5 through the Anthropic API.

- **Categories:** 20, spread across B2B software, consumer software and apps, online services, consumer products and professional services.
- **Prompts:** 20 per category, 400 in total. Each was phrased the way a buyer would ask, with a mix of intents, from broad requests for options to questions with a specific need.
- **Runs:** each prompt was asked three times. That gave 60 answers per category and 1,200 answers overall.
- **Settings:** low effort, no tools, and no current date in the request. Claude answered from memory only.

Another model read each answer and listed the brands it named. Code did all the counting. We report these measures:

- **Answer share:** the share of a category's 60 answers that named a brand.
- **Named first:** how many answers listed the brand first.
- **Average position:** where the brand sat in the list on average.
- **Prompts named in every run:** out of the 20 prompts, how many had the brand in all three runs.
- **Top three share of mentions:** the share of all brand mentions in a category that went to the three most-named brands.
- **Run agreement:** how much the brand lists overlapped when the same prompt was asked again. A higher figure means the runs named more of the same brands.

Brands were counted as the extraction listed them. Parent names like Microsoft, Google and Apple appear on their own. Variants such as QuickBooks and QuickBooks Online are counted separately.

The same prompts were also run with web search available and with an instruction to search. Those results are covered briefly below and in full in the companion report.

## How concentrated the answers were

From memory, Claude named 7.7 brands per answer on average. The spread between categories was wide.

The most concentrated categories had short lists and a few names that took a large part of all mentions:

- **Robot vacuums:** 4.2 brands per answer, 13 distinct brands, and the top three took 56.8% of mentions.
- **VPN apps:** 5.2 brands per answer, 44 distinct brands, top three share 43.1%.
- **Accounting software for small businesses:** 6.2 brands per answer, top three share 37.1%.
- **CRM for small businesses:** 6.2 brands per answer, top three share 36.7%.
- **Wireless earbuds:** 6.2 brands per answer, 37 distinct brands, top three share 33.5%.

The most spread-out categories had long lists and many distinct names:

- **Web hosting:** 11.3 brands per answer, top three share 16.2%.
- **Cloud hosting providers:** 9 brands per answer, 111 distinct brands, top three share 16.3%.
- **Freelance marketplaces:** 10.5 brands per answer, 145 distinct brands, top three share 22%.
- **SEO tools:** 9.5 brands per answer, 100 distinct brands, top three share 23.8%.

In spread-out categories, more brands get a mention. Each one also gets a smaller part of the attention.

## How consistent Claude was between runs

Asking the same question again did not always return the same brands. Average run agreement from memory was 62.9%.

The most consistent categories were VPN apps at 77.2%, web hosting at 70.9% and web analytics tools at 69%. The least consistent were video editing software and freelance marketplaces at 54%, language learning apps at 54.9% and cloud hosting providers at 56.9%.

Consistency did not depend on short lists. Web hosting had the longest answers in the study, at 11.3 brands each, and still ranked second for agreement.

A few brands appeared on almost every run of almost every prompt. Shopify in ecommerce platforms and HubSpot in marketing automation platforms were each named in all three runs for 18 of the 20 prompts. Proton VPN and Roborock reached 17. Most brands were far less stable. A single answer is a sample, not a fixed result.

## Categories where one brand appeared in most answers

In several categories, one brand was named in close to every answer:

- **Ecommerce platforms:** Shopify in 93% of answers, named first 43 times.
- **VPN apps:** Proton VPN in 93% of answers.
- **Marketing automation platforms:** HubSpot in 92% of answers, named first 34 times.
- **Robot vacuums:** Roborock in 90% of answers, named first 50 times, with an average position of 1.1.
- **Freelance marketplaces:** Upwork in 88% of answers.
- **CRM for small businesses:** HubSpot in 87% of answers.
- **Accounting software for small businesses:** Xero in 85% of answers.
- **SEO tools:** Ahrefs in 83% of answers.
- **AI writing tools for marketing:** Jasper in 83% of answers, with Copy.ai close behind at 82%.

Answer share and first position do not always point to the same brand. Proton VPN was named first only 5 times, while Mullvad was named first 33 times. Xero was named first 4 times, while QuickBooks was named first 30 times. In SEO tools, Semrush was named first 19 times against 7 for Ahrefs. Being on the list and being at the top of it are separate results.

In AI writing tools for marketing, Claude named ChatGPT and Claude itself in 60% of answers each.

## Categories with no clear leader

In other categories, no single brand stood out from memory.

- **Cloud hosting providers:** AWS and DigitalOcean were each named in 50% of answers. Cloudflare followed at 46.7%, Hetzner at 45% and Google Cloud at 43.3%.
- **Web hosting:** SiteGround reached 66.7%. Hostinger and Netlify were each at 58.3%, Kinsta at 56.7% and WP Engine at 55%.
- **Video editing software:** DaVinci Resolve at 65% and Adobe at 63.3%.
- **Help desk software:** Freshdesk at 71.7%, Zendesk at 68.3% and Help Scout at 66.7%. Zendesk was named first 28 times.
- **Language learning apps:** Duolingo at 68.3%, then Pimsleur, Babbel and italki all between 53% and 57%.

Some categories had a brand with high answer share that rarely came first. In email marketing software, Brevo was named in 76.7% of answers but first only once. Mailchimp, at 53.3%, was named first 15 times. In cloud storage services, Dropbox led on share at 68.3%, while Google was named first 22 times. In web analytics tools, Google Analytics appeared in only 33.3% of answers but was named first 15 times, with an average position of 1.6.

In these categories, small changes in wording or a repeat run can reorder the list.

## What changes when Claude searches

We ran the same 400 prompts in two more conditions. The companion report covers them in detail. In brief:

- **Search available:** Claude searched in only 81 of the 1,200 answers, with 153 searches in total. Run agreement was 64.8%, close to the from-memory result.
- **Told to search:** Claude searched in 1,195 answers and ran 5,261 searches. Answers got shorter, at 5.8 brands each, and run agreement fell to 53.5%. Only 2 answers included inline citations.
- **Dates in queries:** the requests gave no current date. 2,307 search queries included 2025 and 99 included 2026.

The brand named in the most answers changed in 7 categories once Claude was told to search:

- SEO tools: Ahrefs to Semrush
- Help desk software: Freshdesk to Help Scout
- Web analytics tools: Plausible to Matomo
- Accounting software for small businesses: Xero to QuickBooks
- Video editing software: DaVinci Resolve to Adobe
- Web hosting: SiteGround to Hostinger
- Cloud storage services: Dropbox to pCloud

In 7 other categories, the top five brands stayed the same. Some single brands moved a lot. pCloud went from 35% to 76.7% of cloud storage answers. iRobot went from 76.7% to 31.7% of robot vacuum answers.

## Limits of this study

- **One model.** These results are for Claude Sonnet 5.5 at low effort. Other Claude models, other effort settings and other assistants can answer differently.
- **API, not the app.** We used the Anthropic API. The Claude apps add their own instructions and features, so answers there can differ.
- **The prompt set.** 20 prompts per category cover a slice of how buyers ask. Different wording, languages or user context can change which brands appear.
- **A point in time.** Models are updated. From-memory answers reflect training data, and search results change daily. Treat these figures as a snapshot.
- **Brand extraction.** A model listed the brands in each answer. Parent brands and product names were counted as listed, which can split or merge some mentions.

This is a record of what Claude said. It is not a judgement of which product is good for any buyer.

## Results by category

| Category                                                                                                     | Named most from memory | Share of answers | Run agreement |
| ------------------------------------------------------------------------------------------------------------ | ---------------------- | ---------------- | ------------- |
| [CRM for small businesses](/claude-recommendations/crm-for-small-businesses)                                 | HubSpot                | 86.7%            | 60.9%         |
| [Email marketing software](/claude-recommendations/email-marketing-software)                                 | Brevo                  | 76.7%            | 68.2%         |
| [SEO tools](/claude-recommendations/seo-tools)                                                               | Ahrefs                 | 83.3%            | 63.1%         |
| [Project management software](/claude-recommendations/project-management-software)                           | Asana                  | 75%              | 66.8%         |
| [Help desk software](/claude-recommendations/help-desk-software)                                             | Freshdesk              | 71.7%            | 60.9%         |
| [Marketing automation platforms](/claude-recommendations/marketing-automation-platforms)                     | HubSpot                | 91.7%            | 63%           |
| [Web analytics tools](/claude-recommendations/web-analytics-tools)                                           | Plausible              | 71.7%            | 69%           |
| [Ecommerce platforms](/claude-recommendations/ecommerce-platforms)                                           | Shopify                | 93.3%            | 66.7%         |
| [Accounting software for small businesses](/claude-recommendations/accounting-software-for-small-businesses) | Xero                   | 85%              | 64.3%         |
| [Cloud hosting providers](/claude-recommendations/cloud-hosting-providers)                                   | AWS                    | 50%              | 56.9%         |
| [AI writing tools for marketing](/claude-recommendations/ai-writing-tools-for-marketing)                     | Jasper                 | 83.3%            | 61%           |
| [VPN apps](/claude-recommendations/vpn-apps)                                                                 | Proton VPN             | 93.3%            | 77.2%         |
| [Language learning apps](/claude-recommendations/language-learning-apps)                                     | Duolingo               | 68.3%            | 54.9%         |
| [Note-taking apps](/claude-recommendations/note-taking-apps)                                                 | Obsidian               | 76.7%            | 58.6%         |
| [Video editing software](/claude-recommendations/video-editing-software)                                     | DaVinci Resolve        | 65%              | 54%           |
| [Web hosting](/claude-recommendations/web-hosting)                                                           | SiteGround             | 66.7%            | 70.9%         |
| [Cloud storage services](/claude-recommendations/cloud-storage-services)                                     | Dropbox                | 68.3%            | 61.7%         |
| [Wireless earbuds](/claude-recommendations/wireless-earbuds)                                                 | Sony                   | 76.7%            | 63.9%         |
| [Robot vacuums](/claude-recommendations/robot-vacuums)                                                       | Roborock               | 90%              | 62.7%         |
| [Freelance marketplaces](/claude-recommendations/freelance-marketplaces)                                     | Upwork                 | 88.3%            | 54%           |

## Frequently asked questions

### Does this report show which products are best?

No. It shows how often Claude named each brand in its answers. A high answer share means Claude mentioned a brand often. It says nothing about product quality or fit for a given buyer.

### Will the Claude app give the same answers?

Not necessarily. We used Claude Sonnet 5.5 through the Anthropic API at low effort, with no current date in the request. The Claude apps use their own settings and instructions, so their answers can differ.

### Why does Claude name different brands when asked the same question twice?

Answers are generated fresh each time, so the list can shift between runs. From memory, repeat runs agreed on 62.9% of brands on average. VPN apps were the most consistent category at 77.2%. Video editing software and freelance marketplaces were the least consistent at 54%.

### Does web search change which brands Claude names?

Often, yes. When told to search, the brand named in the most answers changed in 7 of the 20 categories, and answers named fewer brands on average. When search was only available, Claude used it in 81 of the 1,200 answers. The companion report covers this in detail.

### How can I see how my brand appears in Claude's answers?

CiteLadder runs buyer questions like these against AI assistants and tracks which brands appear, how often, in what position and how stable that is across runs. You can use it to follow your own category over time.

## Sources

1. CiteLadder measurement of Claude Sonnet 5.5 through the Anthropic API: 400 buyer prompts across 20 categories, three runs each, from memory, with web search available, and told to search; collected 2026-11-07
