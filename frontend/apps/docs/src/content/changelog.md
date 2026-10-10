---
title: 'Changelog'
description: 'Product changes and what they mean for your workflow.'
group: 'Updates'
order: 400
---

These notes describe implemented changes in the codebase. Dates are the recorded commit dates; availability in your workspace depends on deployment, access and configuration.

## October 10, 2026: Prompt generation grounded in your search data

Generated prompts now borrow wording from how your buyers already search. When Search Console is connected or you have published keyword research, suggestions for a topic with matching searches are written with a few of your own non-branded searches for that topic as examples, and suggestions phrased this way carry an **Informed by your search data** tag. Nothing extra is fetched or charged, searches are never copied as prompts, and impressions or keyword volume are never shown as AI prompt volume. Without that data, generation is unchanged.

**For your team:** connect Search Console before generating, and expect suggestions that sound more like your real buyers.

[Read about grounded generation](/prompts/#grounded-in-your-search-data)

## October 10, 2026: Ads in ChatGPT answers

AI Visibility has an **Ads** view: how often ChatGPT Search answers showed paid ads, who advertised, your own ad share, the prompts that surface ads and each ad as text. Each ChatGPT Search answer in a run lists its ads apart from its citations. Ads never count as citations or change your visibility scores, and other surfaces read not applicable.

Assistants connected with MCP, and the in-app Agent, can read the same numbers with `read_ai_ads`.

**For your team:** see which competitors pay to appear in the answers your buyers read, and on which prompts.

[Read Ads in ChatGPT answers](/visibility/#ads-in-chatgpt-answers)

## October 10, 2026: AI crawler logs on paid plans, now with Amazon CloudFront

AI crawler logs are available on every paid plan. Connect **Amazon CloudFront** through an Amazon Data Firehose stream, alongside Cloudflare, custom webhooks and file uploads, with an optional filter Lambda that sends crawler requests only. Log endpoints moved to `https://api.citeladder.com`. A source that stops delivering now shows as **Stalled** with the reason.

**For your team:** connect the CDN you already run and watch the source row; a stalled source means that day's coverage is not complete.

[Connect Amazon CloudFront](/ai-traffic/#amazon-cloudfront-firehose)

## October 10, 2026: Answer perception

AI Visibility has a **Perception** view. Answers that name you or a competitor are read for sentiment: net sentiment from −100 to +100 with its coverage, the themes answers praise or criticise with quotes taken word for word from the answer, the sources cited alongside criticism and how often answers recommend you. Each answer in a run also shows how it portrayed every business it named. Classification uses no credits.

Assistants connected with MCP, and the in-app Agent, can read the same numbers with `read_perception`.

**For your team:** check what answers say about you, not only whether they mention you, and read the quotes before acting on a label.

[Read Perception](/visibility/#read-perception)

## October 10, 2026: Scheduled audits documented

The AI Visibility guide now explains how to schedule audits from **Runs**: repeat a prompt set one time, every few minutes, hourly, daily or weekly, see why a schedule paused and resume it. It also clarifies that answers are collected from the consumer apps and from provider APIs.

**For your team:** schedule the audits you rely on so your baseline keeps measuring without a manual launch.

[Schedule audits](/visibility/#schedule-audits)

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

[Search Intelligence](/search-intelligence/)

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
