# CiteLadder documentation

This is the single document-owner index. Current code and tests establish
implemented behavior; accepted constraints remain binding when code disagrees.
Historical records are evidence, not task authority.

## Feature owners

| Feature | Canonical document |
|---|---|
| Onboarding, company facts and competitor discovery | [Onboarding](onboarding.md) |
| Prompt generation, audits and AI Visibility | [Prompts and Visibility](visibility-prompt.md) |
| Crawl, page understanding, issues and measurement | [Site Health](site-health.md) |
| Integrations, search, traffic, referrals and demand | [Connected data](integrations-traffic-analytics.md) |
| Generation, context, runtime skills and history | [Content](content-generation.md) |
| Ranked actions, implementation and verification | [Opportunities](opportunities.md) |
| Commercial accounts, access and usage accounting | [Billing and entitlements](billing-entitlements.md) |
| Catalog, competitors, buyer prompts and AI Shelf | [Commerce](commerce-intelligence.md) |
| Bounded explain/roadmap tasks | [Growth Agent](growth-agent.md) |
| Hosted read tools and OAuth grants | [MCP](mcp.md) |
| Sessions, projects, memberships and roles | [Workspace access](workspace-access.md) |

## Shared contracts

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
[Decisions](decisions.md) records accepted cross-feature choices and rationale.
An indexed plan is not authorization to run it.

## Operations and retained evidence

[Release acceptance](release-checklist.md) retains manual and external gates.
[Billing provider readiness](billing-provider-readiness.md) separates implemented
adapters from accepted payment operation.
[Operations](operations/) contains live deployment, billing and recovery
procedures; use the procedure relevant to the requested operation.

[Evaluation corpora](evaluations/README.md) and their fixtures remain live inputs
where tooling uses them. [Archive](archive/) preserves retired plans, audits and
dated evidence, including unresolved observations; relocation is not completion.
Do not search the archive for ordinary implementation unless a specific
historical question requires it.

Published blog content belongs to
[the marketing content modules](../frontend/lib/marketing-content/blog-posts/),
not a parallel documentation draft.
