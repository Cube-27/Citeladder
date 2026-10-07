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
| **Visibility impact** | Does the feature change what a business does to become more visible or recommended, and can they see the effect? | Link from output to action to measured outcome; whether the signal reflects real engine or search behavior |

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
| 1 | Site Health: crawl, page understanding, checks, scoring | `services/api/src/site-health`, `analysis`, `web-evidence`, `workers/site-health-worker.ts`; `components/site-health` | [site-health.md](../site-health.md) | implementing | [site-health-improvement](site-health-improvement.md) |
| 2 | Onboarding, company facts and competitor discovery | `services/api/src/projects`, `workers/discovery-worker.ts`; `components/onboarding` | [onboarding.md](../onboarding.md) | queued | — |
| 3 | Prompt generation, audits and AI Visibility | `prompts`, `audits`, `visibility`, `answer-engines`, `providers`; `components/prompts`, `visibility`, `runs` | [visibility-prompt.md](../visibility-prompt.md) | queued | — |
| 4 | Opportunities, actions and verification | `opportunities`; `components/opportunities` | [opportunities.md](../opportunities.md) | queued | — |
| 5 | Agent chats, context, skills and deliverables | `agent`, `workers/agent-worker.ts`; `components/agent`, `knowledge-base` | [agents.md](../agents.md) | queued | — |
| 6 | Connected data: integrations, search, traffic, referrals, demand | `integrations`, `traffic`, `referrals`, `demand`, `analytics`, `search-surfaces`; `components/analytics`, `demand`, `performance` | [integrations-traffic-analytics.md](../integrations-traffic-analytics.md) | queued | — |
| 7 | Search intelligence signals | `search-intelligence`; `components/search-intelligence`, `intelligence` | none (backlog and plan memory only) | queued | — |
| 8 | AI Traffic and Crawl Logs | `crawl-logs`; `components/ai-traffic` | [ai-traffic.md](../ai-traffic.md) | queued | — |
| 9 | Earned sources | `source-pages`; earned-action UI | [earned-sources.md](../earned-sources.md) | queued | — |
| 10 | Commerce: catalog, competitors, AI Shelf | `commerce`; `components/products` | [commerce-intelligence.md](../commerce-intelligence.md) | queued | — |
| 11 | Billing, entitlements and usage | `billing`, `entitlements`; `components/billing` | [billing-entitlements.md](../billing-entitlements.md), [billing-provider-readiness.md](../billing-provider-readiness.md) | queued | — |
| 12 | Authentication, workspaces, projects and roles | `auth`, `workspaces`, `projects`; `components/auth`, `settings`, `projects` | [workspace-access.md](../workspace-access.md) | queued | — |
| 13 | MCP hosted tools and OAuth | `mcp` | [mcp.md](../mcp.md) | queued | — |
| 14 | Execution platform: queues, runner, tick, recovery, residual Python schema tooling (`backend/`, about 60k lines) | `queue`, `workers/runner.ts`, `db`, `infra/gcp`, `backend` | [backend-architecture.md](../backend-architecture.md), [operations](../operations/GCP_RUNBOOK.md) | queued | — |
| 15 | Product app shell, navigation, tour and design system | `apps/app`, `components/layout`, `ui`, `tour` | [frontend-architecture.md](../frontend-architecture.md), [design.md](../design.md) | queued | — |
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
