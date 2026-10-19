# CiteLadder documentation

This is the single document-owner index. Current code and tests establish
implemented behavior; accepted constraints remain binding when code disagrees.
Historical records are evidence, not task authority.

## Using the index

Start with [CLAUDE.md](../CLAUDE.md) for agent workflow. Select the
feature owner below and only the shared contracts affected by the task.
[Invariants](invariants.md) define constraints; owner documents explain the
behavior and implementation boundaries. Code/document disagreement is a finding
to resolve within the authorized scope, not permission to weaken a constraint.

### Which document answers what

| Question | Read |
|---|---|
| How does a feature behave today? | Its owner under [Feature owners](#feature-owners) |
| What must never break? | [Invariants](invariants.md), affected sections only |
| Why was a cross-feature choice made? | [Decisions](decisions.md) |
| Any billing, pricing, credits or plan-gating decision | [Billing decision log](billing-decisions.md) (B-numbers) |
| How billing, entitlements and usage accounting behave | [Billing and entitlements](billing-entitlements.md) |
| Prices, allowances, add-ons and top-ups (the numbers) | `frontend/services/api/src/config/billing-authoring.ts`; documents never restate add-on or top-up numbers (B55) |
| Provider token, search and DataForSEO rates (internal cost) | [Provider rate card](operations/CiteLadder_Launch_Config.md#7-provider-rate-card-internal-cost); runtime prices in `config/ai-credits.json`, `dataforseo.json`, `search-intelligence.json` |
| Legal commitments, subprocessors, company details | [Legal decisions](operations/legal-decisions.md); page text in `frontend/lib/marketing-content/legal*.ts` |
| What work is current, and what is queued | [Plan status](plans/ACTIVE.md), then the assigned plan; [backlog](plans/backlog.md) is queued, not assigned |
| Setup, commands and validation | [Development](DEVELOPMENT.md) |
| Deployment and operator procedures | [Operations](operations/) runbooks and the [billing operator guide](operations/billing-operator-guide.md) |
| Product scope and positioning | [Product](../PRODUCT.md) |

## Feature owners

| Feature | Canonical document |
|---|---|
| Onboarding, company facts and competitor discovery | [Onboarding](onboarding.md) |
| Prompt generation, audits and AI Visibility | [Prompts and Visibility](visibility-prompt.md) |
| Crawl, page understanding, issues and measurement | [Site Health](site-health.md) |
| Integrations, search, traffic, referrals and demand | [Connected data](integrations-traffic-analytics.md) |
| Crawl Logs, crawler requests, coverage and the AI Traffic screen | [AI Traffic](ai-traffic.md) |
| Ranked actions, Actions, implementation and verification | [Opportunities](opportunities.md) |
| Inspection of externally cited pages and earned actions | [Earned sources](earned-sources.md) |
| Commercial accounts, access and usage accounting | [Billing and entitlements](billing-entitlements.md) |
| Catalog, competitors, buyer prompts and AI Shelf | [Commerce](commerce-intelligence.md) |
| Agent chats, context, internal skills and deliverables | [Agent](agents.md) |
| Hosted MCP tools, OAuth grants and confirmed changes | [MCP](mcp.md) |
| API keys, the public REST API and the command layer | [Public API](public-api.md) |
| Sessions, projects, memberships and roles | [Workspace access](workspace-access.md) |

## Shared contracts

- [Agent workflow](../CLAUDE.md): rules for every task; situational workflow
  rules are skills in `../.claude/skills/`.
- [Contributing](../CONTRIBUTING.md): branch, PR and release participation.
- [Product](../PRODUCT.md): users, purpose, positioning and non-goals.
- [Architecture](architecture.md): cross-system ownership and evidence flow.
- [Backend](backend-architecture.md) and [frontend](frontend-architecture.md):
  shared layering, contracts, state and extension patterns.
- [Design](design.md): visual and interaction rules.
- [Invariants](invariants.md): durable correctness and safety constraints.
- [API errors](api-error-contract.md): cross-stack error contract.
- [Development](DEVELOPMENT.md): setup, isolation and validation commands.
- [Review](../Review.md): review checklist; the `claude-review` CI review covers PRs over 10 files.

## Work and decisions

[Plan status](plans/ACTIVE.md) is the only current-work index.
[Backlog](plans/backlog.md) consolidates remaining implementation, proposals,
decisions and acceptance gates; it is queued, not an execution assignment.
[Decisions](decisions.md) records accepted cross-feature choices and rationale.
An indexed plan is not authorization to run it. Read a plan only for work
assigned to that plan; completed plans retain evidence and limitations, not
instructions to resume historical delivery checkpoints.

## Maintaining documentation

Update the existing owner when its shipped contract, setup command, procedure
or approved decision changes. Update this index only when document ownership or
routing changes. Keep detailed rules with their owner rather than copying them
into agent skills, contributor guides or review checklists.

Update `plans/ACTIVE.md` only when plan selection, queue, blocker or completion
state changes, and `decisions.md` only for a qualifying cross-feature decision.
Routine implementation/validation evidence belongs in the PR or CI record, not
new summary, progress or evidence sidecars. There is no blanket multi-document
checklist per edit. When retiring a document, repair inbound links. Git and PRs
retain superseded history; deleting a document does not resolve an open finding.

## Operations and retained evidence

[Release acceptance](release-checklist.md) retains manual and external gates.
[Billing decisions](billing-decisions.md) is the owner decision log for billing,
entitlements and usage (B0 onward); [Billing and entitlements](billing-entitlements.md)
owns the resulting behavior and the [billing improvement plan](plans/billing-improvement.md)
its delivery.
[Billing provider readiness](billing-provider-readiness.md) separates implemented
adapters from accepted payment operation. The
[provider rate card](operations/CiteLadder_Launch_Config.md#7-provider-rate-card-internal-cost)
holds the verified internal provider rates.
[Workers operations](operations/WORKERS_RUNBOOK.md) owns protected
origin provisioning, configuration and cutover release records.
[Operations](operations/) contains live deployment, billing and recovery
procedures; use the procedure relevant to the requested operation.
[Legal decisions](operations/legal-decisions.md) owns company details and the
open and resolved decisions behind the published legal pages.

Fixtures consumed by current tests remain with those tests. Git and PRs retain
historical plans, audits and dated evidence. Archived copies are disposable;
current documentation must not link to or depend on them. Historical observations
do not establish current acceptance.

Published blog content belongs to
[the marketing content modules](../frontend/lib/marketing-content/blog-posts/),
not a parallel documentation draft.
