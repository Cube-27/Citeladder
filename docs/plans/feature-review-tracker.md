# Feature review tracker

Started 2026-10-07. This is the master record for a feature-by-feature review
of the whole application. Each feature's documentation and implementation are
re-examined from first principles, then rebuilt where needed. The programme
runs over days to weeks. One feature is active at a time unless the owner says
otherwise.

## Objective

Improve the application's architecture and reduce technical and test debt.
Every feature also ships at least one user-facing improvement, taken from the
[backlog](backlog.md) or found during the audit. All of this serves the
product's core objective: increasing a business's return by improving its
visibility in AI answer engines and search.

## Authority rule

Existing code, tests and documents are evidence, not authority. A statement
stands only when it is logical, verified against running code or data, or an
obvious fact. Where a document and the code disagree, neither wins by default:
the review decides what is correct, with owner input where it is a product
choice. [Invariants](../invariants.md) are reviewed the same way; a constraint
survives because it is justified, not because it is written down.

## Review parameters

Every feature is assessed on four parameters. A finding names the parameter it
affects.

| Parameter | Question | Typical evidence |
|---|---|---|
| **Performance and cost** | Is it fast enough for the user's task, and efficient within the free-tier hosting (Cloudflare free, Cloud Run free tier, e2-micro PostgreSQL)? | Production logs and timings, query counts, lock scope, wall-clock per job, connection and CPU budget |
| **Logic and correctness** | Does it compute the right thing, keep unknown / zero / not-applicable / unavailable states distinct, and fail safely? Would a regression be caught? | Code paths, edge cases, persisted data, tests that fail on the bug |
| **Usability** | Can a user understand the result, trust it, and act on it without help? Are loading, empty, partial and error states clear? | The running UI, copy, navigation, accessibility, time-to-first-useful-result |
| **Visibility and traffic impact** | Does the feature change what a business does to become more visible or recommended, does that reach their website traffic, and can they see the effect? | Link from output to action to measured outcome; whether the signal reflects real engine, search or traffic behavior |

Architecture and debt are assessed across all four: one owner per concept,
no parallel stores or policy copies, no dead code, and tests that earn their place
([test admission](../../AGENTS.md#what-earns-a-test)).

## Per-feature process

1. **Inventory.** List the code owners, routes, tables, jobs, UI surfaces,
   tests and documents. Note anything undocumented or orphaned.
2. **Audit.** Review against the four parameters with production evidence where
   available. Record findings with file references, and verify each one before
   it enters the plan.
3. **Plan.** Write `docs/plans/<feature>-improvement.md`: findings, owner decisions
   needed, phased changes with acceptance criteria, and the chosen UX addition.
   The owner answers the decisions before implementation.
4. **Implement.** Ship coherent PRs per phase. Each PR removes the debt it
   replaces and verifies the cutover.
5. **Tests.** Add tests for credible regressions, and delete tests that assert
   text, restate constants or cover retired behavior, recording the reason.
   Measure test debt before and after (count, runtime, assertions that cannot fail).
6. **Feature document.** Rewrite the feature's owner document from the shipped
   behavior. It describes what the feature does and why, not history.
7. **Core documents.** Update [invariants](../invariants.md), [AGENTS.md](../../AGENTS.md),
   [architecture](../architecture.md) and the backend and frontend architecture
   documents where the feature changed or disproved them.
8. **Close.** Mark the row done with the PR links. Move remaining items to the
   [backlog](backlog.md) with a reason.

A feature is done when every phase in its plan is shipped or explicitly
deferred by the owner, and its documents describe the shipped behavior.

## Features

Status values: `queued`, `inventory`, `audit`, `plan`, `implementing`, `docs`, `done`.

| # | Feature | Main code | Current documents | Status | Plan |
|---|---|---|---|---|---|
| 1 | Site Health: crawl, page understanding, checks, scoring | `services/api/src/site-health`, `analysis`, `web-evidence`, `workers/site-health-worker.ts`; `components/site-health` | [site-health.md](../site-health.md) | done | [site-health-improvement](site-health-improvement.md) |
| 2 | Onboarding, company facts and competitor discovery | `services/api/src/projects`, `workers/discovery-worker.ts`; `components/onboarding` | [onboarding.md](../onboarding.md) | done | [onboarding-improvement](onboarding-improvement.md) |
| 3 | Prompt generation, audits and AI Visibility | `prompts`, `audits`, `visibility`, `answer-engines`, `providers`, `search-surfaces`; `components/prompts`, `visibility`, `runs` | [visibility-prompt.md](../visibility-prompt.md) | implementing | [visibility-prompt-improvement](visibility-prompt-improvement.md) |
| 4 | Opportunities, actions and verification | `opportunities`; `components/opportunities`, `agent` (Actions) | [opportunities.md](../opportunities.md) | done | [opportunities-improvement](opportunities-improvement.md) |
| 5 | Agent chats, context, skills and deliverables | `agent`, `workers/agent-worker.ts`; `components/agent`, `knowledge-base` | [agents.md](../agents.md) | done | [agent-improvement](agent-improvement.md) |
| 6 | Connected data: integrations, search, traffic, referrals, demand | `integrations`, `traffic`, `referrals`, `demand`, `analytics`; `components/integrations`, `settings`, `demand`, `performance` | [integrations-traffic-analytics.md](../integrations-traffic-analytics.md) | done | [connected-data-improvement](connected-data-improvement.md) |
| 7 | Search Intelligence: DataForSEO keyword, competitor and backlink research | `search-intelligence`; `components/search-intelligence` | [integrations-traffic-analytics.md](../integrations-traffic-analytics.md#search-intelligence-acquisition) | implementing | [search-intelligence-improvement](search-intelligence-improvement.md) |
| 8 | AI Traffic and Crawl Logs | `crawl-logs`; `components/ai-traffic` | [ai-traffic.md](../ai-traffic.md) | done | [ai-traffic-improvement](ai-traffic-improvement.md) |
| 9 | Earned sources | `source-pages`, `visibility/source-url.ts`; `components/visibility` (URL page), earned-action UI | [earned-sources.md](../earned-sources.md) | docs | [earned-sources-improvement](earned-sources-improvement.md) |
| 10 | Commerce: catalog, competitors, AI Shelf | `commerce`; `components/products` | [commerce-intelligence.md](../commerce-intelligence.md) | implementing | [commerce-improvement](commerce-improvement.md) |
| 11 | Billing, entitlements and usage | `billing`, `entitlements`; `components/billing` | [billing-entitlements.md](../billing-entitlements.md), [billing-provider-readiness.md](../billing-provider-readiness.md) | queued | — |
| 12 | Authentication, workspaces, projects and roles | `auth`, `workspaces`, `projects`; `components/auth`, `settings`, `projects` | [workspace-access.md](../workspace-access.md) | queued | — |
| 13 | MCP hosted tools and OAuth | `mcp` | [mcp.md](../mcp.md) | plan | [mcp-improvement](mcp-improvement.md) |
| 14 | Execution platform: queues, runner, tick, recovery, residual Python schema tooling (`backend/`, about 60k lines) | `queue`, `workers/runner.ts`, `db`, `infra/gcp`, `backend` | [backend-architecture.md](../backend-architecture.md), [operations](../operations/GCP_RUNBOOK.md) | queued | — |
| 15 | Product app shell, navigation, tour and design system | `apps/app`, `components/layout`, `ui`, `tour`, `intelligence` (Dashboard top insights) | [frontend-architecture.md](../frontend-architecture.md), [design.md](../design.md) | queued | — |
| 16 | Public site and documentation site | `apps/marketing`, `apps/docs` | [design.md](../design.md) | queued | — |

The order follows the product loop (Analyze → Act → Improve → Track), then
supporting platforms. Feature 16 excludes marketing copy, which changes only
when the owner asks.

## Core documents revisited along the way

[Invariants](../invariants.md) · [AGENTS.md](../../AGENTS.md) ·
[Architecture](../architecture.md) · [Backend](../backend-architecture.md) ·
[Frontend](../frontend-architecture.md) · [Design](../design.md) ·
[Development](../DEVELOPMENT.md) · [Review](../../Review.md)

## Log

| Date | Feature | Event |
|---|---|---|
| 2026-10-07 | 1 Site Health | Production crawl stall diagnosed (runner exited while a deferred task was due in 5 s); fix shipped with this tracker. Audit of performance, classification, checks and page-kind coverage produced the plan; owner answered its four decisions. |
| 2026-10-07 | 1 Site Health | Phase 1 slice: sliding claim window, no score rebuild on non-analysis settlements, batched link admission, 15 s backstop cadence, test-file queue isolation. |
| 2026-10-07 | 1 Site Health | Phases 2-5 shipped as a stacked series: scoring membership, classifier fixes, coverage UX, a persistent parse pool, and three unscored checks (content recency, entity profiles, sitemap/canonical agreement). Invariant 5 now bumps semantic versions instead of resetting data, because production can't be reset. |
| 2026-10-07 | 4 Opportunities (carried forward) | `SITE_ISSUE_TO_OPPORTUNITY_RULE_ID` and the opportunity fixtures name five rules no catalog emits (`aeo.schema_expected_for_type`, `technical.thin_content`, `aeo.editorial_lead_present`, `aeo.entity_value_proposition`, `aeo.assortment_freshness_signal`); retire or reinstate them in that review. |
| 2026-10-08 | 1 Site Health | Closed. Phases 2-5 merged (#294-#298). The follow-up stack (#299-#302) adds the worker access TTL, discovery on the parse pool, root-safe site checks, sampled crawler access, coverage by page type, one route normalizer, the rewritten feature doc and the test-debt pass. 2.5 and 2.8 were declined with reasons in the plan; 1.8 moved to the backlog. |
| 2026-10-08 | 2 Onboarding | Audited and closed in one PR. Fixed a retry stall (the discovery runner lane had no next-due time), cached worker access checks, cut attempts 5 → 3, and retired the completion drain and dead contract fields. Discovered competitors are now preselected up to the cap, and category, buyer type and market scope are editable after onboarding. Deferred: persisted review drafts, evidence on the review step, focus on step change. |
| 2026-10-08 | 3 Prompts and Visibility | Audited (prompts, audit execution, visibility reads, docs and tests). Owner decisions: coverage strip and failure reasons as the UX addition; "Visibility" means the mention rate everywhere; prompt generation and brand disambiguation get their own follow-up PR. Implementation PR fixes the audit-lane stall that wrote off paid Google AI Overview polls. |
| 2026-10-08 | 3 Prompts and Visibility | Prompt generation v3 implemented with the plan's recommended decisions: bounded, idempotent generation with partial staging; a coverage-first planner that places only within the market scope's share; Prompt discovery v4 as the niche mode with row targeting; per-project mention rules replacing the compiled-in Target rule, and dense-script matching. Live calibration is outstanding. |
| 2026-10-08 | 4 Opportunities | Audited and closed in one PR. Verification now reads each check from the source that can answer it and folds them per check, so mixed Actions can finish; traffic checks are page- or query-scoped and prompt-less findings get no check instead of the project score; re-verification is bounded to 30 days. Also fixed: the analytics lane retry stall, refresh skips that missed source-page readings, an older refresh overwriting a newer one, dropped confirmed declines, and three causes of the empty Changes tab. Retired the four unused routes and the five carried-forward rule IDs. UX addition: the measurement checklist with a go-live date and **Run crawl now**. The fourth review parameter is now "Visibility and traffic impact"; traffic impact measurement is queued as its own PR. |
| 2026-10-08 | 5 Agent | Audited (runtime, skills, MCP binding, UI, tests) and shipped as three stacked PRs. Phase 1: a methodology step so deliverables are generated once, server-derived sources with record IDs kept out of user text (owner: the model no longer repeats "evidence" IDs), truncation detection, a coherent size budget, long-form-only outlines, a reply for every ended turn, and lean skills with plugin parity. Phase 2: workflows.json as the extension seam (gallery, pinned skill and format, catalog-driven next steps). Phase 3: streamed replies over the interactive request, instant messages, Stop, Try again / Regenerate / Edit, and one chat surface for the screen and the panel. Deferred: multi-channel repurposing, durable partial-text resume, Esc to stop, screen-specific panel workflows. |
| 2026-10-08 | 6 Connected data | Audited (sync runtime, projections, connect UX) and implemented in one PR with three phases. Fixed Bing data never reaching Performance, Search Console lag read as zero, daily 28-day re-imports, the integrations lane stall, attempt write-offs of long imports, row-at-a-time inserts, a 403 or token expiry demoting the shared Google grant, and a disconnect that deleted the evidence its dialog promised to keep. UX addition: connect in place (consent returns to the screen; the matching property is one click) on Performance, Search Demand and AI Traffic. `search-surfaces` moved to feature 3. Storage retention, referral table retirement and history extension deferred to the backlog. |
| 2026-10-09 | 6 Connected data | Closed: #317 merged. |
| 2026-10-09 | 7 Search Intelligence | Scope corrected: the older "search intelligence signals" plan (internal authority, change fingerprints, query relevance, anchor diagnostics, differentiation) shipped in #115 and lives under Site Health, Demand and Source pages; this row is the DataForSEO module. Audited (acquisition runtime, reads, screen, tests). Owner decisions: both UX additions in two PRs, and a hard cost ceiling now with per-plan limits deferred to feature 11. PR 1 fixes a receipt that blocked the project forever, the estimate that was not a ceiling, local failures recorded as possible spend, cancel relabelling uncertain runs, and drafts hiding progress; it ships the guided first run, cancel and readable results. PR 2 (keyword gaps become Actions) follows. |
| 2026-10-09 | 7 Search Intelligence | PR 2, stacked on #322: rule `search_keyword_gap` reads published missing-keyword datasets with the owner's gates (volume ≥ 50, competitor top 10, ≤ 25 per refresh, ≤ 90-day datasets, competitor-named and Search Console-known searches excluded), targets a covering page or a planned page shared with the Agent, and verifies with a keyword-presence check over 90 days from Search Console or a later dataset checked after go-live. |
| 2026-10-09 | 8 AI Traffic | Audited (admission, uploads, Worker template, rollups, reads, insights, screen, tests). Owner decisions: a referrals-first screen as the UX addition, a batching Worker, and per-line rejection. One PR fixes preset windows that could never be complete (UTC end day, today counted), insights that went stale at midnight and ran for projects without GA4, Overview counting competitors' citations, later IP-range snapshots failing historical requests, a Worker that lost data above two hits a minute, whole-batch rejection, upload retries spending quota, overlap failing upload completion, resumes skipping lines, and unbounded receipt loads. Referral presets now exist at every granularity. Comparability after a timezone change, per-URL query pushdown, receipt retention, upload presets and accepted hosts are in the backlog. |
| 2026-10-09 | 8 AI Traffic | Closed: #328 merged, with a simplify pass and review fixes (audit windows in the reporting timezone, resumable first batch, a batch unsupported only when every line lacks the identifying fields). |
| 2026-10-09 | 10 Commerce | Audited (catalog projection and import, discovery, buyer prompts, AI Shelf, screen, tests). Owner decisions: shelf evidence and Actions as the UX addition, Commerce stays in everyone's navigation with an empty catalog that explains crawl projection, and one metered resolver call per answer. One PR fixes a target whose answers all failed reading as 0% visibility and opening a false Action, loose owned matching (substrings, brand plus any attribute, owned before a competitor named first, repeated mentions as extra slots), AI-observed competitors from invented or owned URLs, duplicate target freezes, category prompts rejected for using the category's name and whole-request 503s after paid calls, a project row lock that stalled foreign-key inserts during imports, per-row identifier scans on import, retried permanent projection failures, sold-out PDPs taking over a category, a persisted Uncategorized sentinel, a projection badge that never cleared, bulk discovery over the cap failing silently, a second discovery dropping the first, shelf numbers not refreshing after an audit, typed prompts carrying to the next target, raw states and codes, and malformed `?target=` reaching the API. 2.2 and Tavily country targeting were declined or deferred with reasons. |
| 2026-10-09 | 9 Earned sources | Audited (inspection runtime, earned rules and placement checks, reads and UI, local data: 84 cited pages, 25 read, no earned Action ever produced). Owner direction: keep the Domains and URLs tables; make the URL page useful; one earned opportunity (competitors on the page, you absent) with an Agent handoff; measure it on the prompts that cite the page, as prompt change measurement for all work, with no attribution claim. One PR: the correct, defend and research rules and the placement-check machinery are retired; inspection skips pages that cannot list you, reads cited pages first, backs off failures, keeps the last good reading, reads list headings over Article markup, quotes every entity and matches with the mention rules; the URL page leads with where you stand. |
| 2026-10-09 | 13 MCP | Audited (transport, catalogue, OAuth and registration, consent, connections, reads, MCP app, plugin, public docs). Security core sound; reads drifted from their owners (opportunities, earned sources, audit summary, profile), owner errors read as unavailable, dead deep links, heavy per-call authorization and payloads, Cursor and browser clients cannot connect, no refresh reuse detection, a bare consent page, and an MCP Apps UI enabled nowhere. Plan written; owner decisions pending. |
