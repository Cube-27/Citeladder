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

- [Agent workflow](../CLAUDE.md): bootstrap and proportional validation.
- [Contributing](../CONTRIBUTING.md): branch, PR and release participation.
- [Product](../PRODUCT.md): users, purpose, positioning and non-goals.
- [Architecture](architecture.md): cross-system ownership and evidence flow.
- [Backend](backend-architecture.md) and [frontend](frontend-architecture.md):
  shared layering, contracts, state and extension patterns.
- [Design](design.md): visual and interaction rules.
- [Invariants](invariants.md): durable correctness and safety constraints.
- [API errors](api-error-contract.md): cross-stack error contract.
- [Development](DEVELOPMENT.md): setup, isolation and validation commands.
- [Review](../Review.md): compact review procedure.

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
[Billing provider readiness](billing-provider-readiness.md) separates implemented
adapters from accepted payment operation.
[Workers operations](operations/WORKERS_RUNBOOK.md) owns protected
origin provisioning, configuration and cutover release records.
[Operations](operations/) contains live deployment, billing and recovery
procedures; use the procedure relevant to the requested operation.

Fixtures consumed by current tests remain with those tests. Git and PRs retain
historical plans, audits and dated evidence. Archived copies are disposable;
current documentation must not link to or depend on them. Historical observations
do not establish current acceptance.

Published blog content belongs to
[the marketing content modules](../frontend/lib/marketing-content/blog-posts/),
not a parallel documentation draft.
