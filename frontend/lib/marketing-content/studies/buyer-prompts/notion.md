---
title: 'Buyer questions for Notion, drafted by four Claude models'
slug: '/buyer-prompts/notion'
meta_title: 'Buyer questions for Notion, drafted by four Claude models'
meta_description: 'The same 12 buyer question slots for Notion, drafted by Claude Haiku 5.5, Sonnet 5.5, Opus 5.5 and Fable 5.1 at three effort levels. Wording, length and what the code measured.'
primary_keyword: 'Notion buyer prompts'
secondary_keywords:
  ['AI workspace software prompts', 'AI visibility prompts', 'buyer questions for AI search']
search_intent: 'See the buyer questions four Claude models draft for Notion and compare them'
content_type: 'model comparison page'
related_guides: ['/research/prompt-builder-model-comparison-2026', '/buyer-prompts/wise']
index_group: 'Business software'
index_meta: 'AI workspace software'
reviewed_at: '2026-11-07'
published_at: '2026-11-07'
author: 'Abhineet Jain'
product:
  heading: 'Track your own buyer questions'
  href: '/platform/ai-visibility'
  body: 'Once you have buyer questions for your brand, CiteLadder tracks how ChatGPT, Gemini, Claude, Google AI Overviews and Google AI Mode answer them. You can see your mentions, position, sentiment and competitors, with each result tied to its recorded answer.'
---

CiteLadder's Prompt Builder drafts the buyer questions a brand tracks in AI answers. For this study we ran the same Prompt Builder step for Notion on four Claude models, at low, medium and high effort, twice each. The instructions, the business profile and the 12 planned slots stayed the same. Only the model and the effort changed. This page describes what can be seen in the results. Judging quality is left to the reader. The tables below list every question each model wrote.

## What Notion sells, according to the business profile

The business profile places Notion in the category **AI workspace software**. It lists the business model as B2B SaaS and the buyer type as both. Category terms include AI workspace, connected workspace, team wiki, knowledge base software and enterprise search.

The profile names four offerings. Each one became a topic:

- **Team knowledge base and wiki**: a shared workspace for docs, wikis, notes and databases in one system of record.
- **AI workspace search**: AI search across the workspace and connected apps, with citations.
- **Custom AI agents**: configurable agents that automate recurring busywork such as reporting, feedback triage and ticket resolution.
- **Enterprise collaboration platform**: a secure, admin-controlled workspace with developer tooling for large organizations.

## How the 12 slots were planned

Each topic got three slots. Every slot has a buyer stage and one facet taken from the profile.

- **Slot 1** targets the awareness stage and uses a situation. Allowed intents are learn, solve and recommend.
- **Slot 2** targets the consideration stage and uses an audience. Allowed intents are solve, recommend, compare and validate.
- **Slot 3** targets the decision stage and uses an attribute. Allowed intents are compare, validate, buy and recommend.

The facets per topic were:

- Team knowledge base and wiki: Scattered company documentation, Startup teams, Flexible page structure.
- AI workspace search: Slow answers to internal questions, Team leads, Cross-app search.
- Custom AI agents: Support ticket backlog, Support leaders, Chat tool integration.
- Enterprise collaboration platform: Large workspace migration, Engineering teams, Sales-assisted demo.

All four models received this same plan.

## What differs between the models

**Length.** Median length is 10 words for Claude Haiku 5.5 and Claude Sonnet 5.5, and 11 words for Claude Opus 5.5 and Claude Fable 5.1. No model wrote a question over 16 words.

**Question marks.** About 35% of Claude Haiku 5.5 questions end with a question mark. The figure is 50% for Claude Sonnet 5.5, 56% for Claude Opus 5.5 and 54% for Claude Fable 5.1. The rest are written as search-style phrases.

**Openings.** Claude Haiku 5.5 often opens with a tool category or a verb, as in "Tools to bring scattered company documentation into one place". Claude Sonnet 5.5 often opens with "Best", "Compare" or "I run a startup", as in "Best tool to organize scattered company documentation in one place". Claude Opus 5.5 and Claude Fable 5.1 often open with the buyer's problem in first person. For the first slot, Claude Opus 5.5 wrote "Our company docs are scattered everywhere, what wiki tool should we use?" and Claude Fable 5.1 wrote "Our company docs are scattered everywhere, what wiki tool fixes this?"

**First-person framing.** All four models use "I lead" or "I run" in the consideration slots for team leads and support leaders. Claude Opus 5.5 and Claude Fable 5.1 also use "our" and "we" in awareness slots. Claude Fable 5.1 often puts the situation first, then the ask, and sometimes adds phrases such as "actually use".

**Specific names.** For the cross-app search slot, Claude Opus 5.5 names apps directly, as in "Which AI search tools search across Slack, Google Drive and Jira at once?" Claude Haiku 5.5, Claude Sonnet 5.5 and Claude Fable 5.1 name Slack or Microsoft Teams in chat integration slots. Two questions name a competing product: Claude Opus 5.5 wrote "Alternatives to Confluence for large engineering teams", and Claude Fable 5.1 wrote "We need to migrate a huge Confluence workspace, what enterprise platforms handle that?"

**Distinct openers.** The share of questions with a distinct opening is 47.2% for Claude Haiku 5.5, 43.1% for Claude Sonnet 5.5, 33.3% for Claude Opus 5.5 and 44.4% for Claude Fable 5.1.

## What changes with effort and between runs

For Claude Sonnet 5.5, Claude Opus 5.5 and Claude Fable 5.1, many slots keep the same or near-same wording across effort levels and runs. The Claude Sonnet 5.5 phrase "Best tool to organize scattered company documentation in one place" appears in both low effort runs and in medium effort run 2. The Claude Opus 5.5 first-slot question appears in both low effort runs and both high effort runs. The Claude Fable 5.1 first-slot question appears in both low runs, both medium runs and high effort run 1. In high effort run 2, Claude Fable 5.1 rewrote several slots with longer, situation-led openings.

Claude Haiku 5.5 changes wording more often between run 1 and run 2 of the same setting. At low effort, the chat integration slot named Slack in run 1 and produced "Where can I buy AI agents that work inside Microsoft Teams" in run 2.

The decision slot for a sales-assisted demo shows small phrasing shifts across settings: "sales-led demo", "guided sales demo" and "book a sales demo" all appear, depending on model and run.

## What the code measured

Each model produced 6 outputs, for 72 prompts per model. The code checked each set for the following:

- **Median words** per question: 10 or 11 for every model.
- **Over 16 words**: 0% for every model.
- **Names a studied brand**: 0% for every model. No question names Notion.
- **Joins with "or"**: 0% for every model. No question bundles two asks.
- **Names a place**: 0% for every model.
- **Near-duplicate pairs**: 0% for every model, measured within each output.
- **Question mark share** and **distinct openers**, as listed above.
- **Mean output tokens**: 3454 for Claude Haiku 5.5, 793 for Claude Sonnet 5.5, 815 for Claude Opus 5.5 and 1163 for Claude Fable 5.1.

These are counts. They describe form, not quality.

## Every question, side by side

Run 1 of each setting. Each row is one planned slot; the model and the effort are the only things that change across a row and down a stage.

### Team knowledge base and wiki

| Stage         | Model      | Low effort                                                               | Medium effort                                                         | High effort                                                                         |
| ------------- | ---------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Tools to bring scattered company documentation into one place            | Best tool to pull scattered company documentation into one place      | What tools can pull scattered company docs into one place?                          |
| Awareness     | Sonnet 5.5 | Best tool to organize scattered company documentation in one place       | Best tool to pull our scattered company docs into one place           | Best tool to pull scattered company docs into one wiki                              |
| Awareness     | Opus 5.5   | Our company docs are scattered everywhere, what wiki tool should we use? | Our company docs are scattered everywhere, what wiki tool fixes that? | Our company docs are scattered everywhere, what wiki tool should we use?            |
| Awareness     | Fable 5.1  | Our company docs are scattered everywhere, what wiki tool fixes this?    | Our company docs are scattered everywhere, what wiki tool fixes this? | Our company docs are scattered everywhere, what wiki tool fixes this?               |
| Consideration | Haiku 5.5  | Recommend a team wiki for an early-stage startup                         | Wiki software for a seven-person startup team                         | I run a startup team, which wiki tool should we start with?                         |
| Consideration | Sonnet 5.5 | I run a startup, what team wiki should we use?                           | I run a startup, which team wiki software should we pick?             | I run a small startup, what team wiki should we use?                                |
| Consideration | Opus 5.5   | Best team wiki for an early-stage startup                                | Best team wiki for an early-stage startup                             | Best team wiki for a fast-growing startup                                           |
| Consideration | Fable 5.1  | Best team knowledge base for an early-stage startup                      | Best team knowledge base for an early-stage startup                   | What's a good knowledge base tool for a small startup team?                         |
| Decision      | Haiku 5.5  | Compare team wikis that let me build flexible page layouts               | Compare wiki tools with flexible, nestable page structures            | Compare wiki tools that allow flexible page structures for docs                     |
| Decision      | Sonnet 5.5 | Compare knowledge base tools with flexible page structure                | Compare knowledge base tools with flexible page layouts               | Compare knowledge base apps with flexible page layouts                              |
| Decision      | Opus 5.5   | Compare knowledge base tools that let us structure pages freely          | Compare knowledge base tools that let you structure pages freely      | Compare knowledge base tools that let us structure pages any way we want            |
| Decision      | Fable 5.1  | Which team wikis let you structure pages however you want?               | Which team wikis let you structure pages however you want?            | Team knowledge base options with flexible page hierarchy instead of rigid templates |

### AI workspace search

| Stage         | Model      | Low effort                                                                 | Medium effort                                                                         | High effort                                                                |
| ------------- | ---------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Looking for AI search that answers internal questions faster               | Tools that answer internal team questions faster with sources                         | Any AI tool that speeds up answers to internal company questions?          |
| Awareness     | Sonnet 5.5 | Software that gives faster answers to internal team questions              | Recommend software that gives fast answers to internal team questions                 | Software that gives fast answers to internal questions from company docs   |
| Awareness     | Opus 5.5   | Any AI search tools that answer employee questions from our internal docs? | Tools that answer employee questions faster than digging through docs                 | Any AI tools that answer employees' internal questions faster?             |
| Awareness     | Fable 5.1  | Tool that answers internal questions quickly from our company docs         | Looking for AI search so staff stop waiting days for internal answers                 | Any tool that answers employee questions from our internal docs instantly? |
| Consideration | Haiku 5.5  | I lead a team, which AI search tool finds answers fast?                    | I lead a product team, which AI search tool should I shortlist?                       | Compare AI search tools for team leads tired of repeated questions         |
| Consideration | Sonnet 5.5 | I lead a team, which AI search tool suits us?                              | I lead a team, what AI search tool should we try?                                     | I'm a team lead, which AI search tool suits my team?                       |
| Consideration | Opus 5.5   | I lead a team, what's a good AI search tool for our workspace?             | I lead a small team, what AI search tool should we try?                               | I'm a team lead, what AI search tool helps my team find answers?           |
| Consideration | Fable 5.1  | I lead a team that keeps asking me where things are, any AI search tools?  | I lead a team that keeps asking me the same questions, any AI workspace search tools? | I lead a product team, recommend an AI search for our workspace            |
| Decision      | Haiku 5.5  | Compare AI search tools that search across all my work apps                | Best AI search tool that searches across all our apps                                 | Where can I buy AI search that connects to all my work apps?               |
| Decision      | Sonnet 5.5 | Where can I buy AI search that works across all our apps?                  | Any enterprise search tools that search across all our apps?                          | Top enterprise search tools that search across all our connected apps      |
| Decision      | Opus 5.5   | Which AI search tools search across Slack, Drive and Jira at once?         | AI search tools that search across Slack, Google Drive and Jira                       | Which AI search tools search across Slack, Google Drive and Jira at once?  |
| Decision      | Fable 5.1  | Compare AI search tools that look across Slack, Google Drive and our wiki  | Compare AI search tools that pull answers from all our connected apps                 | Best AI workspace search that works across all our connected apps          |

### Custom AI agents

| Stage         | Model      | Low effort                                                                    | Medium effort                                                                | High effort                                                                  |
| ------------- | ---------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | What AI tools can help with a growing support ticket backlog                  | Recommend AI agents that clear a growing support ticket backlog              | Who makes AI agents that work through a support ticket backlog?              |
| Awareness     | Sonnet 5.5 | Any AI agents that can clear a support ticket backlog?                        | What AI agents can clear a support ticket backlog?                           | Any AI agents that can clear a support ticket backlog?                       |
| Awareness     | Opus 5.5   | Looking for AI agents to help clear a support ticket backlog                  | Any AI agents that can help clear a support ticket backlog?                  | Looking for AI agents to help clear a support ticket backlog                 |
| Awareness     | Fable 5.1  | Looking for an AI agent to clear our support ticket backlog                   | What's a good AI agent for clearing a support ticket backlog?                | Need an AI agent that clears a growing support ticket backlog                |
| Consideration | Haiku 5.5  | Support leader looking for AI agents to triage tickets                        | As a support leader, what AI agent platforms should I compare?               | What AI agents would you recommend for a support lead?                       |
| Consideration | Sonnet 5.5 | I manage customer support, what custom AI agent platforms should I shortlist? | I manage customer support, which AI agent platforms are worth shortlisting?  | I lead a support team, recommend AI agent platforms for us                   |
| Consideration | Opus 5.5   | Recommend custom AI agent platforms for support team leaders                  | I run a support team, which custom AI agent platforms are worth considering? | I run a support team, which custom AI agent platforms are worth trying?      |
| Consideration | Fable 5.1  | I run a support team, recommend custom AI agent tools for triaging tickets    | I run a support org, recommend custom AI agents for triage                   | I run a customer support team, which custom AI agent platform should we try? |
| Decision      | Haiku 5.5  | Compare AI agents that integrate with Slack for ticket work                   | Where can I buy AI agents that plug into team chat?                          | Shopping for an AI agent that runs inside Slack chat                         |
| Decision      | Sonnet 5.5 | Compare custom AI agent platforms that integrate with Slack                   | Best custom AI agent builders that integrate with Slack                      | Where can I buy custom AI agents that work inside Slack?                     |
| Decision      | Opus 5.5   | Best custom AI agent builders that work inside Slack                          | Custom AI agent builders that work inside Slack                              | Recommend custom AI agent builders that work inside Slack                    |
| Decision      | Fable 5.1  | Custom AI agent builders that work inside Slack                               | Any custom AI agents that work directly inside Slack?                        | Comparing custom AI agent tools that integrate with Microsoft Teams          |

### Enterprise collaboration platform

| Stage         | Model      | Low effort                                                                                | Medium effort                                                                                  | High effort                                                                               |
| ------------- | ---------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Awareness     | Haiku 5.5  | Enterprise collaboration platforms that help migrate a large workspace                    | Any enterprise collaboration platform good for big workspace migrations?                       | What enterprise platforms help large companies migrate workspaces?                        |
| Awareness     | Sonnet 5.5 | Recommend an enterprise collaboration platform for a large workspace migration            | Looking for an enterprise collaboration platform to handle a big workspace migration           | Looking for an enterprise collaboration platform that handles a large workspace migration |
| Awareness     | Opus 5.5   | Who offers collaboration platforms that handle migrating a huge company workspace?        | Who can handle migrating a large company workspace to a new collaboration platform?            | Who offers enterprise collaboration platforms that handle large workspace migrations?     |
| Awareness     | Fable 5.1  | Where can a large company migrate its whole workspace to without losing docs?             | Who offers enterprise collaboration platforms that handle migrating a huge existing workspace? | Who helps migrate a large company workspace to a new collaboration platform?              |
| Consideration | Haiku 5.5  | I run an engineering team, which enterprise collaboration platform has developer tooling? | I need a collaboration platform with developer tooling for engineers                           | Need enterprise workspace with developer tooling for our engineering team                 |
| Consideration | Sonnet 5.5 | Best enterprise collaboration platform for engineering teams                              | Recommend a collaboration platform for large engineering teams                                 | Recommend a collaboration platform for large engineering teams                            |
| Consideration | Opus 5.5   | Enterprise collaboration platforms engineering teams actually like, compared              | Enterprise collaboration platforms engineering teams actually like using                       | What's a good enterprise collaboration platform for engineering teams?                    |
| Consideration | Fable 5.1  | Any enterprise collaboration platforms built with engineering teams in mind?              | Enterprise workspace platform our engineering teams would actually use                         | Recommend an enterprise collaboration platform built for large engineering teams          |
| Decision      | Haiku 5.5  | Where can I book a sales-assisted demo of enterprise collaboration software               | Compare enterprise collaboration vendors that offer a sales-led demo                           | Compare enterprise collaboration platforms that offer sales-led demos                     |
| Decision      | Sonnet 5.5 | Who offers enterprise collaboration platforms with a sales-led demo?                      | Which enterprise workspace vendors offer a sales-led demo?                                     | Enterprise collaboration platforms that offer a sales-led demo, which are best?           |
| Decision      | Opus 5.5   | Where can I book a sales demo for an enterprise collaboration platform?                   | Where can I book a sales demo for an enterprise collaboration platform?                        | Where can I book a sales demo for an enterprise collaboration platform?                   |
| Decision      | Fable 5.1  | Enterprise workspace vendors that offer a guided sales demo                               | Where can I book a sales demo of an enterprise collaboration platform?                         | Where can I book a demo of an enterprise knowledge workspace?                             |

## What the code measured for Notion

All six outputs per model (three efforts, two runs), 72 questions each.

| Model      | Median words | Over 16 words | Ends with ? | Contains "or" | Names a studied brand | Near-duplicate pairs | Distinct openings | Output tokens per run |
| ---------- | ------------ | ------------- | ----------- | ------------- | --------------------- | -------------------- | ----------------- | --------------------- |
| Haiku 5.5  | 10           | 0%            | 34.7%       | 0%            | 0%                    | 0%                   | 47.2%             | 3454                  |
| Sonnet 5.5 | 10           | 0%            | 50%         | 0%            | 0%                    | 0%                   | 43.1%             | 793                   |
| Opus 5.5   | 11           | 0%            | 55.6%       | 0%            | 0%                    | 0%                   | 33.3%             | 815                   |
| Fable 5.1  | 11           | 0%            | 54.2%       | 0%            | 0%                    | 0%                   | 44.4%             | 1163                  |

## Frequently asked questions

### Did any model put Notion's name in a question

No. The code found 0% of questions naming a studied brand for all four models. Two questions name Confluence, a product outside the studied set.

### Why do some questions have no question mark

Many buyers type short search-style phrases into AI assistants. The models wrote some questions in that form. The share ending with a question mark ranges from about 35% for Claude Haiku 5.5 to about 56% for Claude Opus 5.5.

### Where can I see every question

The tables below this text list all 12 slots for each model, effort level and run, so you can compare wording slot by slot.

### What do near-duplicate pairs measure

The code checks whether two questions in the same output are almost the same wording. Every model scored 0% on this check for Notion.
