# CiteLadder documentation

This directory contains the current product and implementation authorities for CiteLadder.
The active product is an evidence-grounded growth intelligence platform with three intelligence
systems—Site, Content, and Demand—and a bounded Growth Agent that orchestrates them.
AI Visibility is an important Demand Intelligence measurement loop; it is not the product's
primary architecture.

## Read order

1. [`../Agents.md`](../Agents.md) — coding-agent bootstrap and repository rules.
2. [`architecture.md`](architecture.md) — current product and system architecture.
3. [`invariants.md`](invariants.md) — review-blocking technical and knowledge-governance rules.
4. The owning subsystem reference:
   - [`backend-architecture.md`](backend-architecture.md)
   - [`frontend-architecture.md`](frontend-architecture.md)
   - [`site-health.md`](site-health.md)
   - [`integrations-traffic-analytics.md`](integrations-traffic-analytics.md)
   - [`commerce-intelligence.md`](commerce-intelligence.md)
   - [`api-error-contract.md`](api-error-contract.md)
   - [`design.md`](design.md)
5. The one active plan that owns the requested work.

## Canonical product plans

| Plan | Authority |
|---|---|
| [`plans/growth-intelligence-platform.md`](plans/growth-intelligence-platform.md) | Master product architecture and delivery graph |
| [`plans/knowledge-kernel-and-industry-pack-spec.md`](plans/knowledge-kernel-and-industry-pack-spec.md) | Knowledge, evidence, page-role, industry-pack, memory, and context contracts |
| [`plans/site-intelligence-primary-product.md`](plans/site-intelligence-primary-product.md) | Corpus acquisition, page understanding, knowledge extraction, gaps, reports, and recrawl verification |
| [`plans/content-intelligence.md`](plans/content-intelligence.md) | Strategy, briefs, FAQ-first generation, review, publication observation, and verification |
| [`plans/demand-intelligence.md`](plans/demand-intelligence.md) | GSC/GA4 demand, journeys, prompt portfolios, schedules, and AI Visibility |
| [`plans/growth-agent.md`](plans/growth-agent.md) | Bounded orchestration, typed tools, selective context, approvals, and memory promotion |

No other plan is an implementation authority. Historical plans and shipped design records live
under [`archive/`](archive/README.md).

## Knowledge and evaluations

- [`../backend/app/core/config/industry_packs/README.md`](../backend/app/core/config/industry_packs/README.md) owns the canonical executable industry catalog, maturity levels, composition, loading, classification, validation, and extension process.
- `backend/app/domain/projects/onboarding/industry_library.json` is only the current onboarding and degraded-prompt fallback; it is not an industry page-analysis pack.
- [`plans/industry-packs/README.md`](plans/industry-packs/README.md) is a compatibility pointer only. Current Site Health remains generic until [`plans/codex-site-intelligence-wiring-handoff.md`](plans/codex-site-intelligence-wiring-handoff.md) is implemented.
- [`evaluations/README.md`](evaluations/README.md) defines evaluation-corpus policy.
- [`evaluations/education/the-asian-school/`](evaluations/education/the-asian-school/) is the first
  real Education and crawler acceptance corpus. Screaming Frog observations provide an external
  technical baseline; reviewed labels provide the semantic page-role and gap truth.

## Documentation policy

- Active docs describe either current shipped behavior or an explicitly named canonical plan.
- Shipped behavior is verified against code. A plan never changes runtime behavior by itself.
- Historical material is moved, not silently deleted, and must not be used as current authority.
- New knowledge belongs in the shared registry or a versioned industry extension—not in an
  isolated customer-specific taxonomy.
- Links from active docs to archived files are permitted only when the link is explicitly labelled
  historical context.
