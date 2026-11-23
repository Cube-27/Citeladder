---
title: 'Changelog'
description: 'Product changes and what they mean for your workflow.'
group: 'Updates'
order: 400
updated: '2026-11-23'
---

These notes describe implemented changes in the codebase. Dates are the recorded commit dates; availability in your workspace depends on deployment, access and configuration.

## November 23, 2026: Every Site Health check is scored

Advisories are gone: every check on a page or read from your homepage now counts toward Web fundamentals or AEO readiness, with a **High**, **Medium** or **Low** severity, so a missing H1, meta description, Open Graph tags or structured data lowers the score. A page scores 100 only when every check that applies ran and passed, and a partly checked score says how many checks ran instead of **Limited evidence**. Whole-site checks such as broken links and duplicate titles keep their severity and stay out of page scores. **Issues** lists every issue in one list with its severity; the **Advisory** severity filter and tags are gone. In the API and MCP, `finding_class` leaves issues, issue summaries, exports and Actions, the issues list refuses a `finding_class` parameter, the two issue-type counts become `issue_count`, issue groups carry `score_roles`, scores carry `web_fundamentals_checks` and `aeo_readiness_checks`, and MCP `issue_rules` is a list of rule IDs.

**For your team:** scores drop at the next crawl because more checks count; compare against that crawl, not an earlier one.

[Site Health](/site-health/#scored-checks)

## November 23, 2026: MCP connections are read-only

An assistant connected over MCP now only reads: the consent page no longer offers **Allow changes**, and no change tools are listed. Add prompts, launch audits, start crawls and update Actions in the CiteLadder app.

**For your team:** existing connections keep working for reads.

[MCP](/mcp/)

## November 22, 2026: Google AI Mode as an engine

**Google AI Mode** is a new engine beside ChatGPT, Claude, Gemini and Google AI Overviews, read from Google's results the way AI Overviews are, in the same countries and in the same languages except Portuguese. The audit launcher selects it with the other engines, so a new run asks one more engine unless you untick it; the estimate shows the difference before you confirm. Existing schedules keep their engines. Insights shows AI Mode's own rates when you narrow the surface to it, and engine filters, breakdowns, exports, the API and MCP list it.

**For your team:** tick Google AI Mode in your schedules if you want it measured on a cadence.

[Audits and runs](/runs/)

## November 22, 2026: Answers collected the way a person gets them

ChatGPT, Claude and Gemini reached through their APIs no longer get an instruction on answer length or style, may write longer answers, and ChatGPT and Claude can search the web up to twice for each answer. The engine's full response is stored as evidence. Answers are now longer and closer to what a person sees, so a project's first run after this change starts a new comparison series: Insights breaks the trend line there and shows no change against earlier runs. The price of a run is unchanged.

**For your team:** read mention rate and position against runs collected after this change, not before it.

## November 22, 2026: Perception over a period, buyer-worded points and brand prompts

**Perception → Brand** now reads every completed brand run in a period, the last 90 days by default, instead of one run, and says how many runs and answers it covers. Below 20 classified mentions, **Positive**, **Negative**, **Recommended**, **How AI judges you** and the breakdowns now show their share with its counts and **small sample** instead of hiding it. Each point an answer makes about you is labelled with a short attribute in a buyer's words, shown before the quote in **Breakdown by theme**, under categories that start from your themes; you can rename or delete them in **Agent → Context**, and the Agent can merge two. Selecting a quote or prompt on Perception and Fact-checking opens the answer over the page.

The Prompt builder can write **Brand prompts**, up to 10 questions that ask about your business directly, such as its pros and cons or whether it is worth the price; the Brand tab links to it when few answers describe you. **Market** and **Objections** show each step while a probe runs, and **Export themes CSV** and **Export objections CSV** list every page cited behind them, including pages CiteLadder could not read. Keyword research and the Prompt builder show progress while they work.

**For your team:** add brand prompts if the Brand tab says few answers describe you, and export a probe's cited pages to check the blocked ones by hand.

[Perception](/perception/) · [Brand prompts](/prompts/#brand-prompts)

## November 22, 2026: The Agent proposes changes as cards, and API keys by access

The Agent can now propose changes to your project as a card under its reply: prompts, topics, competitors, markets, audits and schedules, crawls, probes, keyword research runs, connected data, products, brand details and Actions. The card shows what will change and what it can spend, and nothing happens until you choose **Confirm**. **Attach files** lets it turn a CSV or text file into an import of prompts, brand facts or products. A reply can show the app's own charts and tables, and you pick the model and effort for each chat.

**Settings → API keys** creates a **Read** or **Read and write** key with an expiry of 1, 7, 30 or 90 days, a custom date or never, and a key can be deleted. **Settings → MCP connections** shows your connections, and for Owners and Admins other members' connections to the workspace, in one table.

**For your team:** see [Know the boundary](/agent/#know-the-boundary) and [API authentication](/api/authentication/).

## November 22, 2026: MCP changes go through one preview tool

An assistant connected over MCP with **Allow changes** now makes every change with two tools: `prepare_change` previews a change and saves nothing, and `confirm_change` makes it after you agree. The separate change tools (`prepare_add_prompts`, `create_topic`, `generate_prompts` and the others) are gone. MCP now also offers importing prompts, brand facts and the product catalog, adding a market, re-running an audit's failures, running a probe, starting or cancelling a crawl, re-running a page, starting an internal-link analysis, analyzing a page, quoting and starting a Keyword research run, recomputing demand and syncing performance data. Deleting prompts and prompt sets stays in CiteLadder.

**For your team:** reconnect your assistant so it picks up the new tool list; see the [MCP tool reference](/mcp/tools/).

## November 22, 2026: Setup records readable over MCP and in the Agent

Existing MCP reads gain views, with no new tool: every Site Health issue of a crawl and the crawl schedule (`read_site_health`), audit runs with their status and failed answers, and audit schedules (`read_visibility_overview`), prompt sets, empty ones included, and suggested prompts awaiting review (`read_prompt_portfolio`), internal-link analyses (`read_site_links`), the market probe and its objection groups (`read_perception`), the product catalog, competitor candidates, buyer prompts and running competitor searches (`read_ai_shelf`), and keyword research runs, including those awaiting confirmation (`read_search_intelligence`). The in-app Agent reads the same views, so it can propose a change to one of these records from any chat.

**For your team:** see the [MCP tool reference](/mcp/tools/).

## November 18, 2026: Bulk prompt changes in the API and MCP

The REST API can now activate or archive, file under a topic, and delete a selection of up to 500 prompts in one call, with a `prompts:write` key. A call that names a prompt from outside the project changes nothing.

An assistant connected over MCP with **Allow changes** can now accept or reject a competitor suggestion, and activate, archive or file a selection of prompts under a topic as one change it previews first and makes only after you agree. Prompts cannot be deleted over MCP.

**For your team:** see the [API changelog](/api/changelog/) and the [MCP tool reference](/mcp/tools/).

## November 18, 2026: A Brand section, and AI Visibility split into pages

The sidebar has a new **Brand** group with three pages: **Insights** (how often answers name you and how you rank), **Perception** (how answers describe you, with **Brand** and, for the pilot, **Fact-checking** tabs) and **Competitors**. The old AI Visibility page is now **Sources** under **Tracking**, beside **Prompts** and **Runs**, with **Domains**, **URLs**, **Read, not cited**, **Query fanouts** and **Ads** tabs. Its Trends, Perception and Accuracy tabs moved to the Brand pages.

Under **Search**, the Keywords page is now **Keyword research**. Search Demand is its first tab, **Demand**, followed by **Overview**, **Keywords**, **Organic competitors** (renamed so it is not confused with Brand → Competitors) and **Backlinks**. The **Prompt builder** has its own page instead of a side drawer, opened from **Add prompts**. The command palette also lists Fact-checking, Query fanouts and Prompt builder.

These docs follow the same split: AI Visibility is now [Audits and runs](/runs/), [Insights](/insights/), [Perception](/perception/), [Competitors](/competitors/) and [Sources](/sources/), and Search Demand is part of [Keyword research](/keyword-research/). Old docs addresses redirect.

**For your team:** start from **Brand → Insights**; open **Sources** for citations and **Runs** to launch or schedule audits.

## November 18, 2026: Win rate, sentiment and topics on Insights

**Insights** leads with your rank among tracked brands and the key figures **Visibility**, **Position**, **Share of voice**, **Sentiment** and **Win rate**, the share of answers naming a tracked brand that name you first. Position now shows to one decimal. **Your brand over time** can plot each of them, with markers on the days your prompt set or an engine's model changed or an Action went live. A new **Topic** filter, a **By topic** table and a **Performance matrix** compare any measure across engines, topics, markets and brands, and **Top rankings** lists the leading brands in each. Topics are the ones each run asked under, so moving a prompt never rewrites history. Win rate and topics apply from the next audit.

**For your team:** use the matrix to find the engine and topic where you trail, then export it as CSV for a report.

[Insights](/insights/)

## November 18, 2026: A page for each competitor, and suggestions you can reject

Each tracked competitor opens its own page with its figures beside yours, a trend against you, the sources cited when it is named and the prompts where it was named instead of you. **Suggested competitors** now also finds businesses that answers keep naming, not only cited domains, and **Reject** stops a suggestion from coming back. The competitor table adds position, win rate and sentiment.

**For your team:** review the suggestions on **Competitors** after each audit and reject the ones that are not real competitors.

[Competitors](/competitors/)

## November 18, 2026: Perception breakdowns and fact-check reviews

**Perception → Brand** adds a headline on how often answers criticise you, theme and sentiment charts, a net sentiment trend, a breakdown by theme, topic, engine, prompt and source, and a theme map comparing you with competitors. Shares need at least 20 classified mentions and otherwise read **Too few classified**.

**Fact-checking** (pilot) adds **Claims over time**, an **All claims** list and a **By fact** view. **Change verdict** records your own verdict beside the model's, which is kept and shown on hover, and accuracy counts yours. **Import facts CSV** adds draft facts from a file, and **Export claims CSV** downloads the claims in your selection.

**For your team:** correct a wrong verdict instead of discounting the accuracy figure, and import your fact sheet in one go.

[Perception](/perception/)

## November 18, 2026: Query fanout trends and answer formats

**Sources → Query fanouts** shows each search's share of all searches, its change since the previous comparable run and the tracked brands it names, with **Top**, **Rising** and **Falling** views. Opening an answer now shows its **Answer formats** (shopping, map, comparison or images), its in-text links and which tracked brand it named first. **Read, not cited** is its own tab, listing your pages engines read but did not cite.

**For your team:** watch **Rising** searches to see what engines look up before naming brands in your category.

[Read query fanouts](/sources/#read-query-fanouts)

## November 18, 2026: Bulk prompt actions and every past answer on a prompt's page

Select prompts on **Prompts** to **Activate**, **Archive**, **Assign topic** or **Delete** them together. The table adds **Topic**, **Status** (which replaces the Enabled switch; enable or disable from the row menu), **Share of voice**, **Sentiment** and **Web search**, and a click anywhere on a row opens the prompt. A prompt's page now ends with **Past answers**, every answer it got, newest first, with the brands named (the first-named in bold), your position, citation, web search and answer formats, filterable by period, engine, market, brand, citation and search use.

**For your team:** use bulk **Assign topic** to tidy topics before reading the new topic views.

[Prompts and topics](/prompts/#work-with-the-prompt-table)

## November 18, 2026: More Site Health checks, with advisories beside issues

New checks find invalid JSON-LD, a sitemap that cannot be parsed, a missing H1, dead-end pages, titles and meta descriptions repeated across the site, and a site still served over plain HTTP. Certificate failures are named (expired, self-signed and so on), and answer-first checks also run on articles, guides and comparison pages. They apply from the next crawl. **Issues** now lists advisories with the issues, tagged **Advisory**, with **Advisory** as a severity filter, and advisory rows in **Actions** are marked too. The crawl menu's option is now **Ignore robots.txt**.

**For your team:** run a new crawl to pick up the new checks.

[Site Health](/site-health/#scored-checks)

## November 18, 2026: Topics and new reads over MCP and the API

MCP visibility reads take a topic, and new reads cover prompt metrics, past answers, query fanouts and a single competitor; the interactive view shows trends for more measures. The public API now exposes answers and sends rate-limit headers, and the API reference describes every visibility field and selection parameter, with a new [Metrics and states](/api/metrics/) page. The in-app Agent's skills use the same new reads, by topic, to explain wins, losses and changes.

**For your team:** see the [MCP tool reference](/mcp/tools/) and the [API changelog](/api/changelog/).

## November 18, 2026: Fixes to Brand pages and tables

- A run of only some selected prompts no longer counts as a prompt-set change or replaces a period's pool, and Perception and fact-check trends now cover the whole period.
- Commerce topics and runs stay out of the Brand pages, and a topic a run never recorded reads **Topic not recorded** instead of **Not run**.
- Win rate reads **Not measured** for answers collected before it existed, and capped competitor lists say how many rows they show.
- Tables fit their frame without blank rows, and low-priority columns hide on narrow screens.

## November 18, 2026: An API section with a page for every endpoint

The docs now have an **API** section beside the guides and MCP. Its overview covers authentication and scopes, pagination, idempotency, rate limits and errors, and every endpoint has its own page with a description, its parameters, the response fields and copyable cURL, JavaScript and Python examples. Each shared schema has a page too. The old single-page reference now redirects to the endpoint list.

**For your team:** start from the [API introduction](/api/) or browse the [endpoints](/api/endpoints/). Additions to the API are listed in the [API changelog](/api/changelog/).

## November 16, 2026: One Actions list, with Site Health issues kept in Issues

A Site Health issue no longer becomes an Action, either on one page or across many pages. You find, fix, hand off and verify each issue in **Site Health → Issues**, so one issue never has two statuses. Actions keep content gaps, internal links, signals that regressed between crawls, prompts, search, earned pages and products. Website-issue Actions created before this change no longer appear in Actions, MCP or the API.

**Actions** is now in the Dashboard sidebar at `/actions`. It lists everything you can act on, open website issues included, grouped by goal and then category, with Open, In progress, Measuring, Done and Dismissed views. A website issue row opens that issue in Issues. An Action's page lists its findings in place, with no side panel.

**For your team:** start from **Actions**; work on website issues from **Issues**, with **Ask agent** or **Copy fix prompt**.

[Choose what to work on](/agent/actions/#choose-what-to-work-on)

## November 12, 2026: Clearer Site Health issues

**Issues** now leads with how many issues the latest crawl found, their severity split and the three to fix first, then lists them in **Technical**, **Content** and **AEO** tabs you can sort by severity or by pages affected. Opening an issue shows how to fix it, its affected pages, **Ask agent** and **Copy fix prompt**. A page's own screen lists its issues worst first with a card per issue, its fix, the scores it counts toward, **Ask agent** and **Re-audit to verify**, and **Ask agent about this page** covers all of them. **Site Health → Pages** can be searched by URL. In the API, the issues read takes `section` and `sort` and counts each tab in `section_counts`, an issue's affected pages are their own paged read (`/site-crawls/{crawl_id}/issues/{group_id}`) in place of the first issue embedded in the list, and the pages read takes `query`.

**For your team:** open **Issues**, start with the three listed first, and hand each to the agent or copy its fix prompt for your developer.

[Site Health](/site-health/#find-the-issues-to-fix-first)

## November 11, 2026: Product tracking in every answer, and site fixes you can hand off

**Commerce** now measures each product. Products are matched in every successful answer, from brand visibility runs as well as Commerce runs, and adding or changing products re-reads the last 30 days of stored answers, so a new product has numbers the day it is added. ChatGPT shopping carousels are read as ranked slots with each card's label, price and merchant; sponsored cards are not counted. **Commerce → Products** is a table of every product with visibility, appearances, win rate, position, mentioned and catalog price and merchants over 7, 30 or 90 days, for your catalog alone or with competitors and products seen only in AI answers. Each product has its own page with competing products, merchants, sources, fan-out queries, per-prompt results and the answers it appeared in. **Commerce → Overview** ranks brands and products and lists top merchants and fan-out queries.

**Add products** imports from a Shopify store's public product list, a Merchant Center feed file or a CSV template, with a category review before anything is saved and row-by-row results after. Products can be edited, archived and restored. Shopping prompts are generated per category as buyer contexts by buying stage, with a capped share of branded comparisons, and per product only for hero products you pick. New product Actions flag a product never mentioned, a quoted price that differs from your catalog, a product that rarely ranks first, and answers that send shoppers only to other merchants. Over MCP, `read_ai_shelf` returns the same per-product metrics.

**Site Health** crawls can run on a weekly or monthly schedule, off by default. Before a crawl of your own site you can choose to ignore robots.txt after confirming you are authorized; the choice is recorded, kept by Recrawl and schedules, and pages fetched because of it are marked.

**Actions:** a website issue that fails on many pages is now one Action across all of them, which the Agent can fix in one chat from the page list (with a redacted HTML example for unlabeled form fields), and the next comparable crawl reads it as verified, partially resolved, still failing or inconclusive. **Prepare developer ticket** writes an Action as Markdown for your tracker. **Mark implemented** records who recorded the deployment and, optionally, what shipped it, and evidence chips show each record's date and whether it was observed or inferred. An Action whose issue a crawl already cleared can still be declared, and a fix that landed before your go-live day is never credited to it. A document that names another page asks whether to link it to that page's Action.

**For your team:** add your catalog under **Commerce → Products**, generate a category's shopping prompts and run them; turn on a crawl schedule in **Site Health**; and use **Prepare developer ticket** on site issues your developers fix.

[Commerce and AI Shelf](/commerce/)

## November 11, 2026: Work on a page with the agent

A chat about one of your content pages now opens as a workspace: the page beside the agent's suggestions, its outline and its SEO fields and checks, with the chat underneath. Apply, dismiss or revert each suggestion, or apply every ready one at once; highlighted text shows where each one lands. Suggestions that need a fact from you, and any text you select, can be quoted into the chat without sending anything. You can also edit the page yourself, export it as Markdown, HTML or plain text, and mark it implemented from the same screen. **Work with the agent** on an Action for one of your content pages opens this workspace.

**For your team:** open an Action on one of your articles or guides and choose **Work with the agent**, or use **Analyze a page** in **Actions**.

[Work on the page](/agent/actions/#work-on-the-page)

## November 10, 2026: Content optimization

After each visibility run and crawl, CiteLadder groups the competitor and publisher content pages (articles, guides, comparisons, reviews and the like, never product, category or home pages) that answers to your tracked prompts cite into content angles by topic, and matches each angle to at most one of your crawled content pages. An angle cited often enough across enough sites becomes an Action in **Actions**, with the rest of your work: on your matching page when that page is not cited for it, or on a planned page when no page matches. An Action's **Why this matters** lists the cited pages and prompts behind it. **Write this page** and **Work on this** open the Agent with the matching workflow. Finding the angles uses no credits.

**For your team:** run a visibility audit and a Site Health crawl, then open **Actions** to see the angles competitors and publishers are cited for and you are not.

[Content optimization](/content-optimization/)

## November 3, 2026: A faster app and quicker sign-in

Each screen now loads its data in one round of requests instead of several, opens without waiting on code for other screens, and shows one loading state rather than several in turn. Refreshing keeps the data you were reading in place. Signing in and out is faster and keeps the page drawn while it happens.

**For your team:** nothing to change; screens and tables should open and settle sooner.

## November 2, 2026: Safer sign-up

Sign-in and sign-up now carry the Terms of Service checkbox on the form itself, so there is no separate review screen after you sign in. Sign-up, verification-email and password-reset requests are protected by a Cloudflare Turnstile check, and sign-up refuses disposable email domains. Signing in has no Turnstile check. Sign-in and sign-up also have a new full-page layout.

**For your team:** invite colleagues with their work address; disposable inboxes cannot create an account.

## November 2, 2026: Faster, more reliable audits

Audits now run several answers at once instead of one at a time, and a Site Health crawl can no longer hold up a visibility run. ChatGPT API answers use a faster OpenAI model and one search round per answer, as the ChatGPT app does. An answer that comes back with no text is now a failed answer and is retried, never counted as an answer that did not mention you. When the Google AI Overviews provider pauses or refuses the account, the rest of that engine's answers stop with a clear reason, and run progress counts failed answers as finished.

**For your team:** expect runs to finish sooner. Brand mention rates can rise slightly where empty answers used to count as "not mentioned"; compare runs from after this change.

[Run a useful audit](/runs/#run-a-useful-audit)

## November 2, 2026: Action priority reads High, Medium or Low

Actions now show priority as **High**, **Medium** or **Low** instead of a raw score, on the list, the detail page and New chat. Priority comes from the Action's strongest finding, and the "evidence systems" count is gone because it did not measure independent evidence; the detail page names the source instead, such as Site Health. Long Action titles stay on one line, with the full title on hover.

**For your team:** sort by priority and start with the High items; the order may differ from before.

[Choose what to work on](/agent/actions/#choose-what-to-work-on)

## November 2, 2026: Site Health issues you can act on

A page's detail view now leads with the issues on that page, worst first, each with its evidence and fix, followed by advisories, scores and a collapsed **Technical details** section. "Defects" are now called issues. A broken or redirecting link that appears across most of the site, such as a footer link, is reported once with the pages that carry it, instead of once per page. A new check names sections that have internal links but cannot be reached from the homepage, and a sitemap listing a page you chose to noindex is now advisory.

Crawls also reach their page limit when some URLs turn out not to be pages, follow links through repaired tracking URLs, and stop counting non-HTML links as failures. The Overview only reports a scored-cohort change when a page kind joined or left or its share moved materially, and says so once.

**For your team:** run a new crawl to see the regrouped issues; counts can drop sharply where one sitewide link used to raise an issue on every page.

[Work through an issue](/site-health/#work-through-an-issue)

## November 1, 2026: The Prompt Builder

Generating prompts now happens in the **Prompt Builder**, a four-step sheet on **Prompts** that replaces the Generate dialog and **Build with Agent**:

1. **About your business:** confirm what you sell, who buys it, the situations and attributes that shape the choice, and more, plus a note for this run only.
2. **Topics:** keep, rename or add topics, or ask for buyer-facing suggestions built from your offerings.
3. **Distribution:** choose the count, branded share, competitor-alternative share, intent mix, personas and whether to use your Search Console or keyword-research searches, with each search shown so you can untick it.
4. **Review:** accept suggestions with a coverage line per topic and per share, and generate more where one comes up short.

Suggestions are now short buyer questions about one need each, capped at 16 words and planned across awareness, consideration and decision. Near-duplicates and questions joining two alternatives are dropped, topics get questions in proportion to the offerings they cover, and a branded question may only describe you with attributes you confirmed. Each candidate is also checked for whether a good answer would have to name a business.

**Agent → Context** shows the business map read-only with **Edit in Prompt Builder**, and Brand facts is its own tab. The Agent's prompt discovery skill now writes a prompt plan following the builder's steps and links to it, without writing prompts. A connection with **Allow changes** can follow the same steps over MCP with `preview_topics`, `confirm_topics`, `read_seed_queries` and `generate_prompts`; suggestions it creates wait in **Prompts** for you to accept.

**For your team:** open the Prompt Builder from **Prompts**, check the first step's business facts, and confirm topics before generating your next set.

[Build prompts with the Prompt Builder](/prompts/#build-prompts-with-the-prompt-builder)

## November 1, 2026: A branded Overview PDF

The Overview PDF now opens with a CiteLadder cover, a strip of headline figures with what each measures, the next action with its target, and a plain-English "How to read this report" in place of internal codes. Engines appear by name, dates read naturally, missing values print as a dash rather than "Unknown", and change figures appear only once a comparable earlier run exists.

**For your team:** share the PDF with stakeholders as it is; it no longer needs editing to remove IDs or jargon.

## October 18, 2026: Remove competitors and delete topics through MCP

A connection with **Allow changes** can now stop tracking a competitor and delete a topic, both by name; a deleted topic's prompts stay tracked without a topic. Every MCP tool parameter now describes what it takes and where its value comes from, so assistants pick the right tool and arguments the first time.

**For your team:** ask your assistant to tidy your competitor list or topics directly; it asks before each change.

[Connect with MCP](/mcp/)

## October 12, 2026: A faster Agent that remembers the chat

The Agent now reads several pieces of data at once instead of one at a time, and shows each read as it runs. A follow-up builds on what it already read and wrote earlier in the chat instead of starting over. While it works, you can open a short summary of its thinking, and the reply and document fill in as they are written. A saved reply's run summary counts the model calls and data reads it used.

**For your team:** ask broader questions in one message, and keep refining in the same chat; the Agent carries the earlier work forward.

[Watch the Agent work](/agent/#watch-it-work)

## October 11, 2026: Confirmed changes through MCP

When you connect an assistant, you can now tick **Allow changes**. The assistant can then add and edit topics and prompts, archive prompts, add competitors, launch and cancel audits, create audit schedules and update or declare Actions, in workspaces where you are a Member or above. Larger changes show you a preview first and happen only after you agree; added prompts are active at once. Existing connections stay read-only.

**For your team:** to let an assistant keep your prompts and audits up to date, revoke its connection and connect again with **Allow changes** ticked.

[Connect with MCP](/mcp/)

## October 10, 2026: Markets

Measure the same prompts from more than one country and language. Growth plans can add 3 markets to their projects and Scale plans 10, in the project edit panel. Each market runs as its own audit, launched or scheduled together, and Visibility reads one market at a time with a **By market** table comparing their latest runs. Engines that cannot measure a market are skipped there or refused before anything runs, never counted as failures.

**For your team:** see where your brand is named in each country you sell in, without mixing one market's answers into another's.

[Read about markets](/runs/#measure-more-than-one-market)

## October 10, 2026: Fact-checking pilot

Workspaces in the fact-checking pilot can confirm brand facts (pricing, plans, integrations, markets, policies and more) in **Agent → Context**. Audits then check the factual claims answers make about you against those facts, and the new **Accuracy** tab in Visibility shows how many claims were supported or contradicted, each contradiction quoted next to your fact. Assistants connected with MCP, and the in-app Agent, read the same results with `read_fact_checks`.

**For your team:** catch answers that quote an old price or a missing integration, and fix the pages behind them.

[Read about checking facts](/perception/#check-facts-in-answers-pilot)

## October 10, 2026: MCP moved to api.citeladder.com

The hosted MCP server is now at `https://api.citeladder.com/mcp`, beside the REST API. The old `https://citeladder.com/mcp` address no longer answers.

**For your team:** remove the old CiteLadder connector from your assistant and connect again with the new address, or use **Connect** in CiteLadder.

[Connection setup](/mcp/connect/)

## October 10, 2026: REST API and API keys

Paid plans include a REST API at `https://api.citeladder.com/v1`. Owners and Admins create keys in **Settings → API keys**, choose what each key can do and which projects it reaches, and see each key's last use. Keys read projects, prompts, audits, visibility, Site Health, AI Traffic, Performance and Search Intelligence, and, with the matching scope, manage prompts, topics, competitors, audit schedules and actions or launch an audit with a credit ceiling. A key never does more than its creator's current role allows.

**For your team:** feed CiteLadder results into your own dashboards and keep prompts and competitors in step with your other systems, without sharing a login.

[Read the REST API guide](/api/)

## October 10, 2026: Prompt generation grounded in your search data

Generated prompts now borrow wording from how your buyers already search. When Search Console is connected or you have published keyword research, suggestions for a topic with matching searches are written with a few of your own non-branded searches for that topic as examples, and suggestions phrased this way carry an **Informed by your search data** tag. Nothing extra is fetched or charged, searches are never copied as prompts, and impressions or keyword volume are never shown as AI prompt volume. Without that data, generation is unchanged.

**For your team:** connect Search Console before generating, and expect suggestions that sound more like your real buyers.

[Read about grounded generation](/prompts/#grounded-in-your-search-data)

## October 10, 2026: Google Cloud crawler logs

Connect **Google Cloud** load balancer and Cloud Run request logs to AI crawler
logs. A Cloud Logging sink sends crawler requests to a Pub/Sub subscription in
your project, and CiteLadder pulls it every few minutes as its own reader
account; no token or endpoint is involved. The connect dialog generates the
`gcloud` commands, including a label that proves the subscription is yours, and
**Verify subscription** activates the source. When CiteLadder recognizes new
crawlers, the source asks you to update the sink filter.

**For your team:** if your site runs behind a Google Cloud load balancer or on
Cloud Run, you can now measure AI crawler visits with complete daily coverage.

[Connect Google Cloud](/ai-traffic/#google-cloud-pubsub)

## October 10, 2026: Ads in ChatGPT answers

AI Visibility has an **Ads** view: how often ChatGPT Search answers showed paid ads, who advertised, your own ad share, the prompts that surface ads and each ad as text. Each ChatGPT Search answer in a run lists its ads apart from its citations. Ads never count as citations or change your visibility scores, and other surfaces read not applicable.

Assistants connected with MCP, and the in-app Agent, can read the same numbers with `read_ai_ads`.

**For your team:** see which competitors pay to appear in the answers your buyers read, and on which prompts.

[Read Ads in ChatGPT answers](/sources/#ads-in-chatgpt-answers)

## October 10, 2026: AI crawler logs on paid plans, now with Amazon CloudFront

AI crawler logs are available on every paid plan. Connect **Amazon CloudFront** through an Amazon Data Firehose stream, alongside Cloudflare, custom webhooks and file uploads, with an optional filter Lambda that sends crawler requests only. Log endpoints moved to `https://api.citeladder.com`. A source that stops delivering now shows as **Stalled** with the reason.

**For your team:** connect the CDN you already run and watch the source row; a stalled source means that day's coverage is not complete.

[Connect Amazon CloudFront](/ai-traffic/#amazon-cloudfront-firehose)

## October 10, 2026: Answer perception

AI Visibility has a **Perception** view. Answers that name you or a competitor are read for sentiment: net sentiment from −100 to +100 with its coverage, the themes answers praise or criticise with quotes taken word for word from the answer, the sources cited alongside criticism and how often answers recommend you. Each answer in a run also shows how it portrayed every business it named. Classification uses no credits.

Assistants connected with MCP, and the in-app Agent, can read the same numbers with `read_perception`.

**For your team:** check what answers say about you, not only whether they mention you, and read the quotes before acting on a label.

[Read Perception](/perception/#read-the-brand-tab)

## October 10, 2026: Scheduled audits documented

The AI Visibility guide now explains how to schedule audits from **Runs**: repeat a prompt set one time, every few minutes, hourly, daily or weekly, see why a schedule paused and resume it. It also clarifies that answers are collected from the consumer apps and from provider APIs.

**For your team:** schedule the audits you rely on so your baseline keeps measuring without a manual launch.

[Schedule audits](/runs/#schedule-audits)

## October 10, 2026: Connect an assistant in one click

A single **Connect** button in CiteLadder adds the MCP connection to your assistant, and the approval page where you choose workspaces is redesigned. More clients can connect, including Cursor and browser-based assistants. MCP reads now match what the app shows for Actions, earned sources and audit results, and the in-app Agent reads evidence through the same catalogue.

Queued work such as crawls and audits also recovers more reliably after an interruption.

**For your team:** connect your assistant from the app, approve only the workspaces it needs, and ask it about Actions and AI traffic as well as visibility.

[Connect with MCP](/mcp/)

## October 9, 2026: Earned sources, AI Shelf and AI Traffic

**Earned sources.** CiteLadder now opens one kind of earned Action: a page AI answers cite that lists your competitors and not you. It is measured on the tracked prompts that cite the page. The cited-page view leads with where you stand on that page.

**AI Shelf.** Product visibility no longer reads as 0% when every answer for a target failed; it shows as unavailable. Owned products are matched more strictly, shelf numbers refresh after each audit, and shelf findings link to Actions.

**AI Traffic.** The screen leads with AI referrals, preset windows now complete correctly, insights stay current, and the crawl-log Worker template batches requests so busy sites no longer lose data. Re-download the template if you installed it earlier.

**For your team:** use the earned brief for outreach, and treat any later change on the cited prompts as evidence to review, not proof of cause.

[Sources and citations](/sources/)

## October 9, 2026: Keyword gaps become Actions

Search Intelligence adds a guided first run, a cancel control and clearer results. The cost estimate is now a ceiling the acquisition cannot exceed.

When a published competitor dataset shows a search a competitor ranks for and you do not, CiteLadder opens an Action for the page that covers it, or a planned page. After you ship the work, the Action checks for up to 90 days whether your site appears for that search.

**For your team:** review keyword gaps alongside your other Actions and declare the work implemented once the page is live.

[Search Intelligence](/keyword-research/)

## October 8, 2026: Prompts, Actions and the Agent

**Prompts and Visibility.** A new project starts with no prompts: generate candidates or add your own on **Prompts**, then accept the ones worth measuring. "Visibility" now means the share of answers that name your brand everywhere it appears. A coverage strip under the headline shows how many answers and engines the numbers rest on, and each failed answer gives a plain reason and next step.

**Actions.** Marking an Action implemented now shows a measurement checklist with the go-live date. Each check is read by the evidence that can answer it, so Actions mixing page and search checks can finish, and a waiting page check offers **Run crawl now**.

**Agent.** Replies stream as they are written. You can stop a turn, try again, regenerate or edit your last request, and each reply lists the sources CiteLadder read for it.

**Connected data and onboarding.** Bing Webmaster Tools data now reaches Performance, and you can connect Search Console, Google Analytics or Bing from the screen that needs them. Onboarding preselects the competitors it finds, and category, buyer type and market can be edited after setup.

**For your team:** review generated prompts before measuring, and use the checklist to see what each implemented Action is waiting for.

[Actions and measurement](/agent/actions/)

## October 8, 2026: Site Health scores what matters

Web and AEO scores now count only the checks that affect whether search and AI engines can reach, read and trust a page; other checks still raise issues without moving a score. Crawler access is reported for the whole site, coverage is shown by page type, and three unscored checks are added: content recency, entity profiles and sitemap and canonical agreement.

**For your team:** scores from earlier crawls may differ from later ones; compare crawls run after this change.

[Site Health](/site-health/)

## October 7, 2026: Faster crawls and a refreshed app

Site Health crawls read pages faster, and a crawl no longer stalls while follow-up work is waiting. The app adopts the same design as the public website.

**For your team:** run a new crawl to see the current website with the faster crawler.

[Site Health](/site-health/)

## September 26, 2026: Agent panel and theme switch

Dashboard screens gain an Agent panel: open it from the top bar to chat beside the screen you are viewing. Search Intelligence attaches the rows you are viewing, and a Site Health issue starts the panel with a question about it. The panel shares chats and outputs with the Agent workspace, and **Open in Agent** continues the same chat there.

The account menu's theme checkbox is replaced by a one-click Light/Dark switch in the application and onboarding headers, and the dark theme moves to near-black neutrals.

**For your team:** ask about the screen you are on without leaving it, then move to the full workspace when the deliverable needs more room.

[Meet the Agent](/agent/)

## September 26, 2026: One Agent capability

The Agent now has one access setting, one model choice and one usage allowance for all of its work. This follows the move of content and growth work into the Agent workspace.

**For your team:** use the Agent as the common place to investigate evidence and create reviewable deliverables. If a control is unavailable, check the displayed access or funding reason.

[Meet the Agent](/agent/)

## September 25, 2026: Agent, Actions and reviewable outputs

A dedicated Agent workspace brings together new chats, Actions, Skills, Context and saved conversation history. Evidence handoffs let you begin with an existing finding instead of restating it.

Chats own a deliverable with revision history, user edits, copy and Markdown export. Long-form content requires outline approval before drafting. Runs expose distinct queued, running, cancelled, failed and limit-stop states.

**For your team:** choose a target, review its supporting evidence and refine the output before using it. The Agent does not publish or make external changes.

[Work with outputs and revisions](/agent/outputs/)

## September 25, 2026: From implementation to measurement

Actions group related findings around a target and carry the work's lifecycle. Explicit implementation declarations can reference the exact Agent output revision that was shipped.

Later evidence checks the expected outcomes of that declaration. The result distinguishes implemented work, work still being measured and work whose latest observation verified the expected checks. Search Demand connects actionable signals with their associated Action.

**For your team:** generating an output is separate from shipping it. Declare implementation after making the change, then review what later measurements support.

[Actions and measurement](/agent/actions/)

## September 24, 2026: Appearance and workflow refinements

The application and onboarding gained a device-local Light/Dark theme preference. Website page classification improved for product pages under category-style paths, alongside corrections to checkout, import and dialog behavior.

**For your team:** choose your preferred appearance; it is now a header switch (see September 26). For classification-dependent findings, inspect a later crawl's page evidence rather than assuming old observations changed.

[Read Site Health results](/site-health/)

## How to read these notes

A change in the product does not rewrite historical evidence. Audits, crawls, imported datasets and Agent revisions preserve the observations or work captured at the time.

When comparing before and after an update, keep measurement scope and availability in view. Contact [support](https://citeladder.com/contact) if your workspace's behavior differs from the guide.
