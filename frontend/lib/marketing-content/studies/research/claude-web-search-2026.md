---
title: 'What Claude searches for, and what it finds, when buyers ask for recommendations'
slug: '/research/claude-web-search-2026'
meta_title: 'What Claude Searches For When Buyers Ask for Recommendations'
meta_description: 'We asked Claude Sonnet 5.5 400 buyer questions three ways. It ran 5261 searches when told to search and cited inline in 2 answers. Here is what it found.'
primary_keyword: 'Claude web search sources'
secondary_keywords: ['what does Claude search for', 'Claude citations', 'how Claude picks sources']
search_intent: 'Learn when Claude searches, what it searches for and which sites its searches return'
content_type: 'original research report'
related_guides: ['/research/who-claude-recommends-2026', '/claude-recommendations/vpn-apps']
index_group: 'Claude recommendations'
index_meta: '3,600 answers · 20 categories · 2026-11-07'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
product:
  heading: 'Track how Claude names your brand'
  href: '/platform/ai-visibility'
  body: 'CiteLadder tracks how often Claude, ChatGPT, Gemini, Google AI Overviews and Google AI Mode mention your brand when buyers ask for recommendations, along with your position, sentiment and competitors. Every result links back to the recorded answer, so you can see exactly what was said.'
---

We asked Claude Sonnet 5.5 the same 400 buyer questions three ways: from memory, with web search available, and told to search first. Left to decide, it searched in 81 of 1200 answers. Told to search, it ran 5261 searches, wrote 2025 into 2307 queries, and carried inline citations in 2 answers. This report shows what Claude looked for, which sites came back, and how the brands it named changed.

## How the study worked

CiteLadder wrote 400 buyer questions across 20 categories, 20 per category. The categories range from CRM for small businesses and web hosting to robot vacuums and wireless earbuds. We sent each question to Claude Sonnet 5.5 through the Anthropic API, at low effort, three times in each of three conditions:

- **From memory.** No tools.
- **Search available.** The Anthropic web search tool was attached. Claude decided whether to use it.
- **Told to search.** The same tool, plus a system prompt instruction to search before answering.

Each condition produced 1200 answers. The tool was web_search_20260209, the version with dynamic filtering: Claude can run code to filter search results before reading them, and it can run up to 5 searches per answer. No request included the current date.

Another model read each answer and listed the brands it named. Code counted everything else: answer share, position, run agreement, the queries Claude wrote and the sites those queries returned.

This is a record of what Claude said. It is not a ranking of which products are best. Results come from the API and can differ from the Claude apps.

## Claude rarely searched on its own

With the search tool available and no instruction, Claude searched in 81 of 1200 answers. It ran 153 searches in total. Most answers came straight from memory.

The categories where it searched most often on its own:

- Wireless earbuds: 15 of 60 answers, 19 searches
- Robot vacuums: 11 answers, 11 searches
- Web hosting: 10 answers, 21 searches
- Freelance marketplaces: 8 answers, 20 searches

In email marketing software, SEO tools, project management software, marketing automation platforms, language learning apps, note-taking apps and video editing software, it did not search once.

Because so few answers searched, this condition behaved much like memory. Average run agreement was 64.8% with search available and 62.9% from memory.

## Told to search, Claude searched in almost every answer

With the instruction in the system prompt, Claude searched in 1195 of 1200 answers and ran 5261 searches. CRM for small businesses had 57 searched answers out of 60. Email marketing software had 58. Every other category had 60 of 60.

Search totals per category ranged from 227 in video editing software to 282 in web analytics tools. Claude often started broad and then narrowed to named products and pricing. The help desk sample queries show the pattern:

- "best help desk software AI chatbot 2025 comparison"
- "Zendesk AI agents vs Intercom Fin vs Freshdesk Freddy resolution rate pricing"
- "Intercom Fin AI agent resolution rate per resolution pricing"

Many queries used the word "best". The share was 82.8% of queries in wireless earbuds and 71.7% in robot vacuums. It was 25.7% in cloud hosting providers, where queries leaned on product names and pricing, such as "Vercel vs Railway vs Render vs Fly.io pricing side projects 2025".

## Almost no answers carried inline citations

Of the answers told to search, 2 carried inline citations: one in VPN apps and one in note-taking apps. The rest named brands and gave reasons without linking a source in the text.

A citation count would say almost nothing here. So the study counts the sites each answer's searches returned. For every host, we report how many searched answers in a category had that host among their results.

A returned site is a site Claude could have read. It is not proof that Claude read it or relied on it. With dynamic filtering, Claude may have dropped some results with code before reading them.

For a brand, links in the answer will rarely show up. Presence in the result set is the closer signal to track.

## The years in Claude's search queries

The requests gave Claude no current date. When it put a year in a query, it picked the year itself. Across the told-to-search condition, 2025 appeared in 2307 queries and 2026 in 99.

The share of queries with any year ran from 61.5% in cloud hosting providers to 34.2% in robot vacuums. In freelance marketplaces, every dated query used 2025: 99 queries, none with 2026.

Several categories show the same pair in their sample queries, once with the year and once without:

- "best CRM for small business 2025 comparison HubSpot Zoho Salesforce pros cons"
- "best CRM for small business comparison HubSpot Zoho Salesforce pros cons"

and

- "cheapest cloud storage 2TB 2025 price comparison"
- "cheapest cloud storage 2TB price comparison"

The year Claude writes reflects its own sense of the date. Pages that carry that year in their title may match these queries more closely. The study did not test this directly.

## Which sites the searches returned

The returned sites fell into three rough groups, and the same hosts repeated across categories.

**Review publishers** appeared most in consumer categories:

- tomsguide.com: 90% of searched answers in robot vacuums, 86.7% in wireless earbuds, 78.3% in VPN apps
- techradar.com: 78.3% in VPN apps, 73.3% in robot vacuums, 71.7% in cloud storage services, 70% in wireless earbuds, and in the top five for CRM, note-taking and video editing
- soundguys.com 88.3% and rtings.com 73.3% in wireless earbuds
- cloudwards.net: 96.7% in cloud storage services
- nerdwallet.com: 86.7% in accounting software for small businesses
- hostingadvice.com and cybernews.com: 56.7% each in web hosting

**Vendor sites and blogs** appeared in most software categories. Some belong to brands in the category. Others belong to adjacent tools that publish comparison posts:

- monday.com: 47.4% in CRM and 51.7% in project management
- brevo.com: 56.9% in email marketing and 46.7% in marketing automation
- blog.hubspot.com: 40% in marketing automation
- ones.com: 83.3% in project management
- featurebase.app 76.7%, desk365.io 65% and getmacha.com 63.3% in help desk software, with freshworks.com at 45%
- posthog.com 50% and amplitude.com 36.7% in web analytics
- shopify.com 55% in ecommerce, upwork.com 56.7% in freelance marketplaces, bluehost.com 40% in web hosting

**Comparison sites** covered business software:

- emailvendorselection.com 60.3% and emailtooltester.com 56.9% in email marketing
- thedigitalprojectmanager.com 63.3% in project management
- thecxlead.com 55% in help desk, thecfoclub.com 45% in accounting, theretailexec.com 35% in ecommerce
- capterra.com 38.6% in CRM

en.wikipedia.org was in the top five for language learning, note-taking, video editing and freelance marketplaces. In cloud hosting, dev.to and medium.com were in the top five.

## How the named brands shifted after searching

Told to search, Claude named fewer brands per answer: 5.8 on average, against 7.7 from memory.

The five most-named brands stayed the same in marketing automation platforms, ecommerce platforms, accounting software for small businesses, cloud hosting providers, AI writing tools for marketing, VPN apps and freelance marketplaces.

The brand named in the most answers changed in these categories, from memory to told to search:

- SEO tools: Ahrefs, then Semrush
- Help desk software: Freshdesk, then Help Scout
- Web analytics tools: Plausible, then Matomo
- Accounting software for small businesses: Xero, then QuickBooks (tied with Xero at 68.3%, and named first in more answers)
- Video editing software: DaVinci Resolve, then Adobe
- Web hosting: SiteGround, then Hostinger
- Cloud storage services: Dropbox, then pCloud

Some brands were named in a much smaller share of answers after search:

- Cloud storage services: Microsoft 61.7% to 30%, Apple 48.3% to 23.3%
- Robot vacuums: iRobot 76.7% to 31.7%
- Wireless earbuds: Samsung 53.3% to 15%, Jabra 45% to 13.3%
- Help desk software: Intercom 55% to 21.7%
- Web hosting: Netlify 58.3% to 23.3%
- Language learning apps: Anki 48.3% to 15%

Others gained. pCloud went from 35% to 76.7%, Internxt from 15% to 38.3%, and Narwal from 11.7% to 36.7%. CMF in wireless earbuds and Less Annoying CRM in CRM for small businesses entered the top five after search, at 25% and 20%.

Runs also agreed less. Average run agreement was 62.9% from memory, 64.8% with search available and 53.5% when told to search. Told to search, web hosting fell to 46.3% and help desk software to 46.7%. Ecommerce platforms held at 66.2%, against 66% with search available.

## What this means for a brand that wants to be found

- **Memory still carries most answers.** With search optional, Claude searched in 81 of 1200 answers. What the model already knows about your brand decides most of what buyers see.
- **When Claude searches, a few hosts come back again and again.** Review publishers dominate consumer categories. Comparison sites and vendor blogs dominate software. Find the hosts returned in your category and check whether you appear on their pages, and how.
- **Match the shape of the queries.** Claude wrote "best" plus category plus year, "vs" queries that name competitors, and pricing queries such as "HubSpot CRM pricing pros cons small business" and "Gumroad fees 2025 digital products". Clear public pricing and honest comparison pages fit these queries.
- **Your own site can be in the result set.** brevo.com, shopify.com, upwork.com and posthog.com were returned for their own categories. A competitor's blog can be too: monday.com appeared in CRM searches.
- **Do not plan around citation links.** 2 answers carried inline citations. Track presence in what searches return and in the brands the answer names.
- **Measure across repeated runs.** Told to search, average run agreement was 53.5%. One answer is not a reliable reading.

## Limits

- One model, Claude Sonnet 5.5, at low effort, through the Anthropic API. The Claude apps can behave differently.
- No current date was given. With a date in the request, query years and results may change.
- A returned site is not a site Claude read or relied on. Dynamic filtering may have removed results before reading.
- Brands were extracted by another model. Name variants are counted separately, such as Capsule and Capsule CRM, or Eufy and eufy.
- 20 prompts per category and three runs per condition. Other wording or more runs could shift shares.
- Search results change over time. This is a snapshot.
- Shares describe what Claude said. They do not show which products are better.

## Search behaviour by category

| Category                                                                                                     | Answers that searched when search was available | Searches when told to search | Named most from memory | Named most when told to search |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ---------------------------- | ---------------------- | ------------------------------ |
| [CRM for small businesses](/claude-recommendations/crm-for-small-businesses)                                 | 3 of 60                                         | 259                          | HubSpot                | HubSpot                        |
| [Email marketing software](/claude-recommendations/email-marketing-software)                                 | 0 of 60                                         | 246                          | Brevo                  | Brevo                          |
| [SEO tools](/claude-recommendations/seo-tools)                                                               | 0 of 60                                         | 245                          | Ahrefs                 | Semrush                        |
| [Project management software](/claude-recommendations/project-management-software)                           | 0 of 60                                         | 254                          | Asana                  | Asana                          |
| [Help desk software](/claude-recommendations/help-desk-software)                                             | 4 of 60                                         | 280                          | Freshdesk              | Help Scout                     |
| [Marketing automation platforms](/claude-recommendations/marketing-automation-platforms)                     | 0 of 60                                         | 268                          | HubSpot                | HubSpot                        |
| [Web analytics tools](/claude-recommendations/web-analytics-tools)                                           | 3 of 60                                         | 282                          | Plausible              | Matomo                         |
| [Ecommerce platforms](/claude-recommendations/ecommerce-platforms)                                           | 2 of 60                                         | 269                          | Shopify                | Shopify                        |
| [Accounting software for small businesses](/claude-recommendations/accounting-software-for-small-businesses) | 3 of 60                                         | 280                          | Xero                   | QuickBooks                     |
| [Cloud hosting providers](/claude-recommendations/cloud-hosting-providers)                                   | 3 of 60                                         | 258                          | AWS                    | AWS                            |
| [AI writing tools for marketing](/claude-recommendations/ai-writing-tools-for-marketing)                     | 6 of 60                                         | 262                          | Jasper                 | Jasper                         |
| [VPN apps](/claude-recommendations/vpn-apps)                                                                 | 7 of 60                                         | 263                          | Proton VPN             | Proton VPN                     |
| [Language learning apps](/claude-recommendations/language-learning-apps)                                     | 0 of 60                                         | 266                          | Duolingo               | Duolingo                       |
| [Note-taking apps](/claude-recommendations/note-taking-apps)                                                 | 0 of 60                                         | 280                          | Obsidian               | Obsidian                       |
| [Video editing software](/claude-recommendations/video-editing-software)                                     | 0 of 60                                         | 227                          | DaVinci Resolve        | Adobe                          |
| [Web hosting](/claude-recommendations/web-hosting)                                                           | 10 of 60                                        | 279                          | SiteGround             | Hostinger                      |
| [Cloud storage services](/claude-recommendations/cloud-storage-services)                                     | 6 of 60                                         | 249                          | Dropbox                | pCloud                         |
| [Wireless earbuds](/claude-recommendations/wireless-earbuds)                                                 | 15 of 60                                        | 254                          | Sony                   | Sony                           |
| [Robot vacuums](/claude-recommendations/robot-vacuums)                                                       | 11 of 60                                        | 266                          | Roborock               | Roborock                       |
| [Freelance marketplaces](/claude-recommendations/freelance-marketplaces)                                     | 8 of 60                                         | 274                          | Upwork                 | Upwork                         |

## Years in search queries

| Year in query | Queries |
| ------------- | ------- |
| 2025          | 2,307   |
| 2026          | 99      |

## Category pages

- [CRM for small businesses](/claude-recommendations/crm-for-small-businesses)
- [Email marketing software](/claude-recommendations/email-marketing-software)
- [SEO tools](/claude-recommendations/seo-tools)
- [Project management software](/claude-recommendations/project-management-software)
- [Help desk software](/claude-recommendations/help-desk-software)
- [Marketing automation platforms](/claude-recommendations/marketing-automation-platforms)
- [Web analytics tools](/claude-recommendations/web-analytics-tools)
- [Ecommerce platforms](/claude-recommendations/ecommerce-platforms)
- [Accounting software for small businesses](/claude-recommendations/accounting-software-for-small-businesses)
- [Cloud hosting providers](/claude-recommendations/cloud-hosting-providers)
- [AI writing tools for marketing](/claude-recommendations/ai-writing-tools-for-marketing)
- [VPN apps](/claude-recommendations/vpn-apps)
- [Language learning apps](/claude-recommendations/language-learning-apps)
- [Note-taking apps](/claude-recommendations/note-taking-apps)
- [Video editing software](/claude-recommendations/video-editing-software)
- [Web hosting](/claude-recommendations/web-hosting)
- [Cloud storage services](/claude-recommendations/cloud-storage-services)
- [Wireless earbuds](/claude-recommendations/wireless-earbuds)
- [Robot vacuums](/claude-recommendations/robot-vacuums)
- [Freelance marketplaces](/claude-recommendations/freelance-marketplaces)

## Frequently asked questions

### Does Claude search the web when asked for product recommendations?

Rarely, unless told to. With the search tool available and no instruction, Claude searched in 81 of 1200 answers. Told to search in the system prompt, it searched in 1195 of 1200 and ran 5261 searches.

### Why does the study count returned sites and not citations?

Only 2 searched answers carried inline citations. Counting the sites each answer's searches returned shows what Claude had available. It does not prove Claude read or relied on a given page.

### Which year does Claude put in its search queries?

The requests gave no current date. When told to search, Claude wrote 2025 into 2307 queries and 2026 into 99. It also often ran the same query with and without the year.

### Do these results apply to the Claude app?

Not necessarily. All answers came from the Anthropic API at low effort. The Claude apps can use different settings, context and search behavior.

### How can I see which brands Claude names in my category?

CiteLadder runs buyer questions like these against ChatGPT, Claude and Gemini, repeats them across runs, and reports which brands each answer named and which sites its searches returned.

## Sources

1. CiteLadder measurement of Claude Sonnet 5.5 through the Anthropic API: 400 buyer prompts across 20 categories, three runs each, from memory, with web search available, and told to search; collected 2026-11-07
