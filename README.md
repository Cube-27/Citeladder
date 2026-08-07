# CiteLadder

CiteLadder is an evidence-grounded growth intelligence platform for legacy businesses and
startups. It unifies website understanding, governed brand knowledge, content improvement,
demand/marketing evidence, AI Visibility, and a bounded Growth Agent in one project-scoped system.

## Product architecture

CiteLadder has three intelligence systems and one orchestrator:

- **Site Intelligence** crawls and understands pages and documents, builds project knowledge,
  detects industry-specific gaps, and verifies changes after recrawl.
- **Content Intelligence** turns verified gaps into strategies, briefs, FAQs, drafts, reviews,
  and post-publication verification.
- **Demand Intelligence** connects GSC, GA4, journeys, prompts, AI Visibility, and later paid
  marketing evidence to decide what should improve next.
- **Growth Agent** explains and orchestrates bounded tasks through typed tools, selective context,
  explicit approvals, and reproducible provenance.

AI Visibility remains an important measurement loop inside Demand Intelligence; it is no longer
the organizing principle of the product.

## Durable differentiator

The knowledge system combines:

```text
immutable evidence
  + versioned working intelligence
  + explicitly approved project memory
  + a versioned industry knowledge pack
```

Industry packs define page roles, entities, assertions, journeys, customer questions, proof,
schema expectations, gap rules, briefs, prompts, and evaluation fixtures. Customer facts remain
workspace/project scoped and never become shared pack truth automatically.

Education and Commerce are the first reviewed packs. Foundation drafts cover major business
families and are designed for extension through reviewed pack releases and project-scoped
overlays.

## First complete workflow

FAQ Intelligence is the first narrow end-to-end proof:

```text
classify page role
  -> detect missing or weak industry questions
  -> build an evidence-grounded FAQ brief
  -> generate and validate visible answers
  -> human approval
  -> optional matching FAQPage JSON-LD
  -> recrawl verification
```

## Start here

- [`Agents.md`](Agents.md) — mandatory implementation rules and task-specific document map.
- [`docs/documentation-index.md`](docs/documentation-index.md) — complete active documentation
  authority map.
- [`docs/architecture.md`](docs/architecture.md) — canonical target architecture.
- [`docs/plans/growth-intelligence-platform.md`](docs/plans/growth-intelligence-platform.md) —
  program architecture and delivery order.
- [`backend/app/core/config/industry_packs/README.md`](backend/app/core/config/industry_packs/README.md) — canonical industry catalog, runtime library, maturity, evaluation, and extension policy.
- [`docs/plans/codex-site-intelligence-wiring-handoff.md`](docs/plans/codex-site-intelligence-wiring-handoff.md) — next gated slice for production persistence and wiring.

Everything under `docs/archive/` is historical and is not an implementation authority.

## Repository shape

```text
frontend/                         Next.js application
backend/app/                      FastAPI modular monolith and workers
migrations/versions/0001_initial.py
                                  pre-launch canonical database baseline
docs/plans/                       active target implementation plans
backend/app/core/config/industry_packs/
                                  canonical executable industry knowledge catalog
docs/plans/industry-packs/        pointer to the canonical catalog only
docs/archive/                     historical plans and superseded context
```

## Focused validation

```bash
# From repository root
python docs/validate_documentation.py

# Backend, from backend/
uv run python -m app.core.config.industry_packs.validate
uv run pytest tests/unit/test_<area>.py tests/component/test_<area>.py -q
uv run ruff check <changed paths>

# Frontend, from frontend/ — pnpm only
pnpm test -- <file>
pnpm lint
pnpm build
```

See `Agents.md` and the owning architecture document before changing code. CiteLadder is a dirty,
active multi-workstream repository; preserve unrelated user-owned changes and verify focused
slices rather than rewriting other workstreams.
