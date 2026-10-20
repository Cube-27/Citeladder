---
title: 'Open Source AI Visibility Tool: Self-Hosted LLM Tracking with CiteLadder'
slug: '/open-source'
meta_title: 'Open Source AI Visibility Tool, Self-Hosted'
meta_description: 'CiteLadder is an AGPL-3.0 AI visibility tracker you can self-host. What is open, how to run it with Docker, and what the licence asks of you.'
primary_keyword: 'open source AI visibility tool'
secondary_keywords:
  [
    'self-hosted LLM tracking',
    'open source AEO tool',
    'self-hosted AI visibility',
    'AGPL AI visibility tracker',
  ]
search_intent: 'Find and evaluate an open-source or self-hosted tool that tracks brand visibility in AI answers'
content_type: 'product-led educational pillar'
reviewed_at: '2026-10-20'
related_guides: ['/compare/profound-alternatives', '/best-ai-visibility-platforms']
publication_status: 'editorial_review'
---

## Is there an open-source AI visibility tool you can self-host?

**Yes. CiteLadder is an [AI visibility](/platform/ai-visibility) tracker published under the AGPL-3.0 licence, and you can run the same code on your own machine or server.** It records which brands and pages ChatGPT, Claude, Gemini and Google AI Overviews name for a fixed set of prompts, stores every answer in your own PostgreSQL database, and uses provider API keys that you supply. The hosted version at citeladder.com adds accounts, team workspaces and a managed service around the same approach to measurement.

This page explains what is open, how self-hosting differs from the hosted service, what the licence asks of you in plain language, how to start with Docker, and where other open-source trackers fit.

**Disclosure:** CiteLadder publishes this page and maintains the repository it describes. Facts about other projects come from their public repositories and sites as read on 20 October 2026. Star counts and licences change; check the repository before you rely on them.

## What is open

The full source lives at [github.com/abhij1306/CiteLadder](https://github.com/abhij1306/CiteLadder). The LICENSE file is the unmodified GNU Affero General Public License, version 3. The first tagged release, v0.1.0, was published on 17 October 2026.[\[1\]](#source-1)[\[2\]](#source-2)

The repository contains a working application, not a demo:

- The AI visibility audit runner, including the scoring rules that decide whether a brand was mentioned, which sources were cited and how runs are compared.
- Prompt generation and the prompt portfolio.
- Site Health crawling, with AI crawler access, robots.txt and llms.txt checks.
- Issues and Actions, the in-app Agent, search demand and performance connectors, crawl-log analytics and the public API.
- An MCP server that exposes read tools and change tools, where changes are previewed and confirmed before they are applied.

The stack is a React and Vite single-page app, a Node API built on Hono, a PostgreSQL 16 database that also holds the job queue, and a runner process.[\[1\]](#source-1)

Because the scoring code is public, you can read how a metric is produced rather than trust a description of it. That is the main practical difference from a closed tracker. It is also why the hosted version is a reasonable choice for teams that do not want to run servers: the method is the same, and you can check it.

## Self-hosted vs the hosted version (citeladder.com)

| Topic           | Self-hosted                                                                       | Hosted version (citeladder.com)                                       |
| --------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Setup           | Docker Compose, or Node.js 26+, pnpm 12 and PostgreSQL 16                         | Sign in and create a project                                          |
| Login and users | No login. Anyone who can reach the port can use the workspace                     | Accounts and team workspaces                                          |
| Workspaces      | One workspace per installation                                                    | Workspace-scoped projects, prompts and history                        |
| Provider keys   | Bring your own OpenAI, Anthropic, Google and DataForSEO keys                      | Set per workspace; see the pricing page for what plans include        |
| Maintenance     | You run upgrades, backups and the reverse proxy                                   | Operated by CiteLadder                                                |
| Cost            | Free software; you pay your providers for each call                               | Subscription; 7-day free trial on ChatGPT answers. Trial limits apply |
| Who it suits    | Engineers, agencies with their own infrastructure, teams with data-locality rules | Marketing and SEO teams that want results without operating a server  |

The self-hosted build is described in the README as "a single-workspace, self-hosted tool with no login".[\[1\]](#source-1) If several people need separate workspaces, or you want someone else to carry the operations work, use the hosted version and [compare the plans](/pricing).

## Quickstart with Docker

The README gives a three-step start. Clone the repository, build and start the containers, then open the app:

```bash
git clone https://github.com/abhij1306/CiteLadder.git
cd CiteLadder
docker compose up -d --build
```

Open http://localhost:8100. The first start builds the image, applies the database schema and creates the workspace. There is no sign-up and no login.[\[1\]](#source-1)

Without Docker, install Node.js 26 or newer, pnpm 12 and PostgreSQL 16, then run `pnpm bootstrap && pnpm build` followed by `DATABASE_URL=... pnpm start`.[\[1\]](#source-1)

### After the first start

1. Create a project from your website. CiteLadder researches the brand and proposes competitors and a target customer profile.
2. Add provider keys under Settings, then Providers. AI visibility audits need at least one model provider key. Site Health needs no keys at all.
3. Review the generated prompts, then run an audit.

Nothing is required to start the app, but three environment variables unlock the Agent, brand research and prompt generation: `DEFAULT_AGENT_API_KEY`, `DEFAULT_AGENT_BASE_URL` and `DEFAULT_AGENT_MODEL`. Anthropic and OpenAI are fully supported there. Any OpenAI-compatible endpoint, including a local Ollama server, works for research and generation.[\[1\]](#source-1)

### Which engines, and how answers are collected

- ChatGPT, Claude and Gemini are queried through their provider APIs.
- Google AI Overviews, ChatGPT Search and the Gemini app are collected through DataForSEO.

Each surface is labelled by its collection method in the app. An API answer is not the same thing as what a signed-in user sees in a consumer app, and CiteLadder does not present it as such. For how that affects what you measure, read the guide to [brand mentions in ChatGPT](/track-brand-mentions-chatgpt).

### How the numbers are produced

The README states the measurement rules, and the code implements them:[\[1\]](#source-1)

- Each prompt can be asked up to 10 times per engine. Audits started from the API or MCP default to 3, and per-prompt counts are shown, for example "2/3".
- Mentions are matched on word boundaries, so a brand name inside another word does not count.
- Citations come only from the engine's citation metadata, never from paid placements.
- A prompt counts as declining only when the drop is material on two or more engines and repeats across runs.
- Runs are compared like for like, and `unavailable`, `not configured` and `observed zero` stay distinct.

Those rules are the basis of the [LLM rank tracker](/llm-rank-tracker) view and the [AI citation tracking](/ai-citation-tracking) reports in both editions.

## Security: no login, bound to localhost

The self-hosted build has no authentication. The Compose file binds the app to `127.0.0.1` only, so it is reachable from the machine it runs on and nowhere else. The project's SECURITY.md is direct about the consequence: anyone who can reach the app port can use the workspace, its stored provider keys and its connected integrations.[\[3\]](#source-3)

Before exposing it to a network:

- Put an authenticating reverse proxy in front. The maintainers suggest oauth2-proxy, Cloudflare Access or Tailscale.
- Set `ALLOWED_HOSTS` to the hostnames you will serve.
- Change the default PostgreSQL password.
- Set `MCP_TOKEN` only if you want the `/mcp` endpoint enabled, and treat that token like a password.

Provider keys are stored encrypted in PostgreSQL. The encryption key lives in the `citeladder_data` Docker volume, so back up that volume together with the database. A database dump without the volume cannot decrypt the keys.[\[1\]](#source-1)

## What the AGPL-3.0 asks of you, in plain language

The AGPL is the GPL version 3 with one extra section, number 13, that covers software used over a network.[\[4\]](#source-4) Here is what that means for a self-hoster. This is a summary, not legal advice.

**Running CiteLadder unchanged carries no extra duty.** If you only make copies and run them, the GNU licensing FAQ says the GPL requires nothing of you.[\[5\]](#source-5) Section 13 only applies when you modify the program.[\[6\]](#source-6)

**Modifying it for your own private use is allowed.** The same FAQ says you may make modified versions and use them without ever releasing them, and that an organisation may make a modified version and use it internally.[\[5\]](#source-5)

**Section 13 applies when you let other people use a modified version over a network.** If you change the code and users interact with your changed version remotely, you must prominently offer those users the complete source of the version they are using, from a network server at no charge.[\[6\]](#source-6) The GNU project's suggestion for web applications is a visible "Source" link that leads to an archive of the code.[\[4\]](#source-4) The README puts it in one sentence: if you run a modified version as a network service, you must offer its source to your users.[\[1\]](#source-1)

**What "source" means here.** The source of the program as it is actually running, including your modifications and the build scripts needed to produce it. It does not mean your prompts, your answer data, your configuration or your API keys. Those are data, not the program.

**Where to ask a lawyer.** Whether colleagues inside one organisation count as "users interacting remotely" with a modified version is a debated reading of the licence text.[\[7\]](#source-7) If you plan to modify CiteLadder and serve it to a group of people, inside or outside your company, ask counsel before you rely on either interpretation.

If you prefer not to think about any of this, run the unmodified release or use the hosted version. Neither triggers section 13 for you.

## Other open-source and self-hostable trackers

CiteLadder is not the only open-source tracker, and the right choice depends on the engines you need, the licence your organisation accepts and whether you want a full platform or a script. The table lists projects that track AI answers, with licence and stars from the GitHub API on 20 October 2026.[\[8\]](#source-8)

| Project                           | Licence                                    | Stars | What it is                                                                                                            |
| --------------------------------- | ------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------- |
| Elmo (elmohq/elmo)                | MIT                                        | 472   | AEO and GEO platform. Docker Compose with your own PostgreSQL. Also sold as a cloud service                           |
| GEO/AEO Tracker (danishashko)     | MIT                                        | 299   | Local-first Next.js dashboard that stores data in the browser. Collects answers through Bright Data                   |
| OneGlanse (oneglanse/oneglanse)   | MIT                                        | 222   | Captures answers through the real product interfaces in a browser rather than APIs. Docker, PostgreSQL and ClickHouse |
| Limelit Open (limelit-co/open)    | Apache-2.0                                 | 218   | Single binary with SQLite, described by its README as pre-release. Open core of the Limelit service                   |
| Canonry (Canonry/canonry)         | Reported as MIT by GitHub; verify the file | 187   | Agent-first, self-hosted AEO that ingests server logs and connects search and analytics accounts                      |
| Ansvisor (ansvisor/ansvisor)      | MIT                                        | 148   | AI visibility platform that self-hosts on Supabase or runs on the vendor's cloud                                      |
| Gego (AI2HU/gego)                 | GPL-3.0                                    | 106   | Go tracker with scheduled prompts, a dashboard, a CLI and a REST API                                                  |
| CiteLadder (abhij1306/CiteLadder) | AGPL-3.0                                   | 4     | Full platform: audits, Site Health, Actions, Agent, crawl-log analytics, MCP server and public API                    |

Some notes for choosing:

- **Engine coverage differs.** Several projects above list Perplexity, Copilot, Grok or Google AI Mode. CiteLadder covers ChatGPT, Claude, Gemini and Google AI Overviews. If you need an engine outside that set, pick accordingly.
- **Collection method differs.** OneGlanse drives real product interfaces in a browser. CiteLadder, Elmo and Gego use provider APIs, and CiteLadder adds DataForSEO for the search surfaces. Neither approach is "the truth"; they measure different things, and the honest move is to label which one you used.
- **Licence differs.** MIT and Apache-2.0 place no network-source obligation on you. GPL-3.0 and AGPL-3.0 do, in different ways, when you modify and distribute or serve the code. See the section above.
- **Scope differs.** Most projects are answer trackers. CiteLadder also crawls your site for AI readiness, keeps a ranked Actions list and exposes read and change tools over MCP.

For closed, commercial tools, see the comparison of [AI visibility platforms](/best-ai-visibility-platforms). If you came here because a vendor changed its plans, the guide to [Profound alternatives](/compare/profound-alternatives) covers the open-source option alongside the hosted ones.

## What self-hosting does not solve

- **It does not remove provider costs.** Each audit calls your model and data providers on your keys. Site Health crawls are free because they run locally.
- **It does not add single sign-on, roles or an audit log.** The self-hosted build has one workspace and no login. Put identity in the reverse proxy, or use the hosted version. Teams with a formal security review should read the [enterprise AEO](/enterprise) page, which describes how the hosted service handles credentials and workspace boundaries.
- **It does not prove why an answer changed.** CiteLadder reports observed change between comparable runs. Attributing that change to a page edit needs a study design, not a dashboard.
- **It does not publish to your site.** Nothing in CiteLadder writes to your website, and nothing trains on your data.[\[1\]](#source-1)

## Frequently asked questions

### Is CiteLadder really open source?

Yes. The full application is published under the GNU AGPL-3.0, an OSI-approved copyleft licence, at [github.com/abhij1306/CiteLadder](https://github.com/abhij1306/CiteLadder). There is no separate closed core.

### Is there an open-source alternative to Profound or Peec?

Several projects position themselves that way, including CiteLadder, Elmo and Limelit Open. None of them replicates a vendor's full feature list. Compare engines, collection method, licence and the work you need to do after the score, then run a small pilot.

### Can I run it with a local model?

Partly. Any OpenAI-compatible endpoint, including Ollama, can power the Agent, brand research and prompt generation. The visibility audits themselves need keys for the engines you are measuring, because the point is to see what ChatGPT, Claude, Gemini and AI Overviews say.

### Do I have to publish my changes?

Only in two cases: you let other people use a modified version over a network, or you distribute the software (modified or not) to someone else. In both cases the recipients or users are entitled to the corresponding source under the same licence. Running it unchanged, or modifying it for your own private use, triggers no obligation. Read the licence section above, and ask a lawyer for anything that sits between those cases.

### Is the project maintained?

The repository was created on 17 October 2026 and had its latest push on 18 October 2026 at review time, with one tagged release.[\[2\]](#source-2) Check the commit history before you adopt it; that is true of every project in the table.

### How much does self-hosting cost to run?

The software is free. You pay your providers per call. The main cost drivers are the number of prompts, the number of engines, the repetitions per prompt and how often you schedule audits. Site Health crawls use no paid provider.

### Does the hosted version use the same code?

The hosted version follows the same measurement method, with accounts and team workspaces added. It may expose a smaller set of MCP tools than a self-hosted install.[\[1\]](#source-1) Start on the pricing page for the current trial terms.

## Sources

1. <span id="source-1"></span> [CiteLadder repository README](https://github.com/abhij1306/CiteLadder), read 20 October 2026.
2. <span id="source-2"></span> [CiteLadder releases](https://github.com/abhij1306/CiteLadder/releases), v0.1.0 published 17 October 2026.
3. <span id="source-3"></span> [CiteLadder SECURITY.md](https://github.com/abhij1306/CiteLadder/blob/main/SECURITY.md).
4. <span id="source-4"></span> GNU, [Why the Affero GPL](https://www.gnu.org/licenses/why-affero-gpl.html) and [How to apply the AGPL](https://www.gnu.org/licenses/agpl.html).
5. <span id="source-5"></span> GNU, [Frequently asked questions about the GNU licenses](https://www.gnu.org/licenses/gpl-faq.html), entries on running without distribution, private modification and internal use.
6. <span id="source-6"></span> GNU, [GNU Affero General Public License, version 3](https://www.gnu.org/licenses/agpl-3.0.html), section 13.
7. <span id="source-7"></span> LegalClarity, [What is the Affero General Public License (AGPL)?](https://legalclarity.org/what-is-the-affero-general-public-license-agpl).
8. <span id="source-8"></span> GitHub repositories, read through the GitHub API on 20 October 2026: [elmohq/elmo](https://github.com/elmohq/elmo), [danishashko/geo-aeo-tracker](https://github.com/danishashko/geo-aeo-tracker), [oneglanse/oneglanse](https://github.com/oneglanse/oneglanse), [limelit-co/open](https://github.com/limelit-co/open), [Canonry/canonry](https://github.com/Canonry/canonry), [ansvisor/ansvisor](https://github.com/ansvisor/ansvisor), [AI2HU/gego](https://github.com/AI2HU/gego).
