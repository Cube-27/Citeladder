# CiteLadder documentation

The single document-owner index. Current code and tests establish implemented
behavior; accepted constraints remain binding when code disagrees. Git and PRs
hold history; documents here are a working reference for agents, not a record.

Start with [CLAUDE.md](../CLAUDE.md) for agent workflow, then the feature owner
below and only the shared contracts affected by the task. A code/document
disagreement is a finding to resolve within the authorized scope, not permission
to weaken a constraint.

## Which document answers what

| Question | Read |
|---|---|
| How does a feature behave today? | Its owner under [Feature owners](#feature-owners) |
| What must never break? | [Invariants](invariants.md), affected sections only |
| Which mistakes keep coming back, and how do I check for them? | [Engineering guidelines](engineering-guidelines.md) |
| What did the owner decide across features? | [Decisions](decisions.md) |
| Any billing, pricing, credits or plan-gating decision | [Billing decision log](billing-decisions.md) (B-numbers) |
| How billing, entitlements and usage accounting behave | [Billing and entitlements](billing-entitlements.md) |
| Prices, allowances, add-ons and top-ups | `frontend/services/api/src/config/billing-authoring.ts`; documents never restate add-on or top-up numbers (B55) |
| Provider token, search and DataForSEO rates (internal cost) | [Provider rate card](operations/CiteLadder_Launch_Config.md#7-provider-rate-card-internal-cost); runtime prices in `config/costs.json`, `dataforseo.json`, `search-intelligence.json` |
| Legal commitments, subprocessors, company details | [Legal decisions](operations/legal-decisions.md); page text in `frontend/lib/marketing-content/legal*.ts` |
| What work is current, and what is queued | [Plan status](plans/ACTIVE.md), then the assigned plan; the [backlog](plans/backlog.md) is queued, not assigned |
| Setup, commands and validation | [Development](DEVELOPMENT.md) |
| Deployment, billing and recovery procedures | [Operations](operations/) runbooks, [billing operator guide](operations/billing-operator-guide.md), [workers runbook](operations/WORKERS_RUNBOOK.md) |
| Manual and external release gates | [Release acceptance](release-checklist.md) |
| Product scope and positioning | [Product](../PRODUCT.md) |
| Branch, PR and release participation | [Contributing](../CONTRIBUTING.md) |
| Review checklist for a diff | [Review](../Review.md) |

## Feature owners

| Feature | Canonical document |
|---|---|
| Onboarding, company facts and competitor discovery | [Onboarding](onboarding.md) |
| Prompt generation, audits and AI Visibility | [Prompts and Visibility](visibility-prompt.md) |
| Crawl, page understanding, issues and measurement | [Site Health](site-health.md) |
| Integrations, search, traffic, referrals and demand | [Connected data](integrations-traffic-analytics.md) |
| Crawl Logs, crawler requests, coverage and the AI Traffic screen | [AI Traffic](ai-traffic.md) |
| Ranked actions, Actions, implementation and verification | [Opportunities](opportunities.md) |
| Content gaps from cited titles, raised as Actions | [Content optimization](content-optimization.md) |
| Inspection of externally cited pages and earned actions | [Earned sources](earned-sources.md) |
| Commercial accounts, access and usage accounting | [Billing and entitlements](billing-entitlements.md) |
| Catalog, competitors, buyer prompts and AI Shelf | [Commerce](commerce-intelligence.md) |
| Agent chats, context, internal skills and deliverables | [Agent](agents.md) |
| Hosted MCP tools, OAuth grants and confirmed changes | [MCP](mcp.md) |
| API keys, the public REST API and the command layer | [Public API](public-api.md) |
| Sessions, projects, memberships and roles | [Workspace access](workspace-access.md) |
| Billing adapters versus accepted payment operation | [Billing provider readiness](billing-provider-readiness.md) |

## Shared contracts

- [Architecture](architecture.md): cross-system ownership, evidence flow, lock DAG.
- [Backend](backend-architecture.md) and [frontend](frontend-architecture.md):
  shared layering, contracts, state and extension patterns.
- [Design](design.md): the design system, its tokens and rules.
- [State machines](state-machines.md): every persisted lifecycle's states,
  where each invariant is enforced, and its transitions and known invalid states.
- [API errors](api-error-contract.md): cross-stack error contract.

## Maintaining documentation

[CLAUDE.md](../CLAUDE.md#documentation) owns what belongs in a document.
Index-specific rules:

- Update this index only when document ownership or routing changes.
- Update `plans/ACTIVE.md` only when plan selection, queue, blocker or
  completion state changes. An indexed plan is not authorization to run it.
- Update `decisions.md` only through the
  [record-owner-decision](../.claude/skills/record-owner-decision/SKILL.md) skill.
- When retiring a document, repair inbound links.
- Published blog content belongs to
  [the marketing content modules](../frontend/lib/marketing-content/blog-posts/),
  not a parallel documentation draft.
