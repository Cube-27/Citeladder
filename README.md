<div align="center">

# CiteLadder

<strong>The growth operating system for businesses whose knowledge is scattered across old sites, documents, teams, and vendors.</strong>

[Architecture](docs/architecture.md) · [Backend](docs/backend-architecture.md) · [Frontend](docs/frontend-architecture.md) · [Invariants](docs/invariants.md) · [Plans](docs/plans/) · [Development](docs/DEVELOPMENT.md)

<p align="center">
  CiteLadder is an evidence-grounded growth intelligence platform. It unifies website understanding, project knowledge, content improvement, demand and marketing evidence, and AI visibility into one project-scoped system — and runs itself, asking you only to save content and to schedule audits.
</p>

<p align="center">
  <a href="https://github.com/abhij1306/Citeladder/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/abhij1306/Citeladder?style=flat-square" /></a>
  <a href="https://github.com/abhij1306/Citeladder/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/abhij1306/Citeladder?style=flat-square" /></a>
  <a href="https://github.com/abhij1306/Citeladder/blob/main/LICENSE"><img alt="MIT License" src="https://img.shields.io/github/license/abhij1306/Citeladder?style=flat-square" /></a>
  <img alt="Python 3.12" src="https://img.shields.io/badge/Python-3.12-3776AB?logo=python&amp;logoColor=white&amp;style=flat-square" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-modular%20monolith-009688?logo=fastapi&amp;logoColor=white&amp;style=flat-square" />
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&amp;logoColor=white&amp;style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&amp;logoColor=white&amp;style=flat-square" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-15%2B-4169E1?logo=postgresql&amp;logoColor=white&amp;style=flat-square" />
</p>

<p align="center">
  <code>Growth Intelligence</code> · <code>Site Intelligence</code> · <code>Content Intelligence</code> · <code>Demand Intelligence</code> · <code>Growth Agent</code> · <code>Industry Packs</code> · <code>AEO</code> · <code>GEO</code> · <code>AI Visibility</code> · <code>Evidence-Grounded</code> · <code>Open Source</code>
</p>

</div>

---

<a id="what-citeladder-does"></a>
## What CiteLadder does

Most growth tooling answers one question and leaves the evidence behind. CiteLadder answers four
connected questions over one governed knowledge system:

1. **What does this business currently say and prove?**
2. **What is missing, weak, contradictory, stale, or hard to discover?**
3. **What are customers demonstrably asking and doing?**
4. **What should the business improve, create, and measure next?**

The durable differentiator is not the crawler, the dashboard, or the chat box. It is a
project-specific, evidence-backed knowledge system that compounds through every crawl, import,
review, generation, audit, and verified outcome.

<a id="product-architecture"></a>
## Product architecture

Four layers. Three own data; the fourth is how you talk to them.

| Layer | Owns |
|---|---|
| **Site Intelligence** | Crawls and understands pages and documents, builds project knowledge, detects industry-specific gaps, and verifies changes after recrawl |
| **Content Intelligence** | Turns verified gaps into strategies, briefs, drafts, and post-publication verification |
| **Demand Intelligence** | Connects GSC, GA4, journeys, prompts, AI Visibility, and later paid marketing evidence to decide what improves next |
| **Growth Agent** | Explains and orchestrates bounded tasks through typed tools, selective context, and reproducible provenance |

AI Visibility remains an important measurement loop **inside** Demand Intelligence. It is no longer
the organizing principle of the product.

> The Growth Agent is a real layer — the one you spend the most time in — but it owns no data. It
> is deliberately **not** a fourth database, an unrestricted chat interface, or an autonomous
> publisher.

## What you actually have to do

The system runs itself. You are asked exactly twice:

| Decision | Why you are here |
|---|---|
| **Generate and save content** | Content is the only durable outward-facing output. You choose what to generate, edit it, and decide what to keep. |
| **Run and schedule audits** | Crawls, syncs, and answer-engine audits cost money and hit external systems. You choose when they run. |

Everything else — crawling on schedule, classification, knowledge extraction, contradiction
detection, gap detection, demand signals, prompt generation, prioritization, roadmaps — happens
without asking. Every automatic output is a recomputable projection over immutable evidence that
records exactly what produced it, so a wrong answer is corrected and recomputed rather than
pre-authorized.

Where a derived fact is wrong, you **correct** it in place. A correction is durable, attributable,
withdrawable, and outranks anything derived later.

<a id="durable-differentiator"></a>
## The knowledge system

```text
immutable evidence
  + versioned, recomputable project facts
  + durable user corrections
  + a versioned industry knowledge pack
```

Persistence means **observed**, never **true**. Facts are derived automatically and stay current; a
correction is the one thing that survives recomputation. Generated content never becomes a fact on
its own.

Industry packs define page roles, entities, assertions, journeys, customer questions, proof
requirements, schema expectations, gap rules, briefs, prompts, and evaluation fixtures. Customer
facts stay workspace- and project-scoped and never become shared pack truth automatically.

<details>
<summary><strong>Industry pack maturity</strong> — what is real today</summary>

<br />

| Tier | Packs | Meaning |
|---|---|---|
| **Validated candidates** | Education, Commerce | Ready for controlled shadow evaluation. Not automatically authoritative production findings. |
| **Foundation packs** | General Business + 13 industry families | Complete definitions and fixtures, but no representative domain calibration yet. |
| **Project overlays** | per project | Versioned, project-scoped, and never alter a shared pack or another customer's knowledge. |

Composition is **one primary pack plus reviewed capabilities** and optional project overlays — see
[`EXTENSION_CONTRACT.md`](backend/app/core/config/industry_packs/EXTENSION_CONTRACT.md).

A business with two genuine industry identities has no composition path yet; the forward-compatible
mechanism is recorded in [`docs/architecture.md`](docs/architecture.md) §6.

</details>

<a id="first-complete-workflow"></a>
## The improvement loop

```text
owned domain, documents, and integrations
  -> immutable evidence
  -> page and document understanding
  -> project facts, gaps, and demand signals
  -> prioritized opportunities
  -> brief
  -> generated content you edit and save
  -> recrawl, resync, or visibility audit
  -> before/after observation
  -> next recommended action
```

Every stage is inspectable and versioned, and a later observation never rewrites earlier evidence.
Unknown fees, dates, prices, policies, and regulated claims are requested or omitted — never
invented. Structured data mirrors saved visible content; it is never a substitute for it.

<a id="what-citeladder-does-not-claim"></a>
## What CiteLadder does not claim

Stated as plainly as the features, because it is a design constraint rather than a disclaimer:

- no causal conversion diagnosis without adequate behavioural evidence;
- no autonomous publishing or external mutation;
- no model trained on private customer data;
- no automatic sharing of one customer's facts with another;
- no single universal score that hides coverage or industry differences.

`unavailable`, `not configured`, and `observed zero` stay three different things.

<a id="quick-start"></a>
## Quick start (Docker Compose)

> **Important:** exported `POSTGRES_*` and `DATABASE_URL` shell variables are resolved by Compose
> *before* `.env`. Use the `env -u …` form verbatim — see [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

```bash
# 1. Copy the env template
cp infra/docker/.env.example infra/docker/.env    # edit secrets for anything non-local

# 2. Start Postgres first
env -u POSTGRES_PASSWORD -u POSTGRES_USER -u POSTGRES_DB -u DATABASE_URL \
  POSTGRES_PASSWORD=citeladder_dev_password \
  docker compose -f infra/docker/docker-compose.yml up -d --force-recreate db

# 3. Apply migrations from the repository root
(cd backend && uv run alembic upgrade head)

# 4. Bring up the application services
env -u POSTGRES_PASSWORD -u POSTGRES_USER -u POSTGRES_DB -u DATABASE_URL \
  POSTGRES_PASSWORD=citeladder_dev_password \
  docker compose -f infra/docker/docker-compose.yml up -d --build

# 5. Start the frontend
cd frontend
echo "BACKEND_ORIGIN=http://localhost:8000" > .env.local
pnpm install
pnpm dev            # http://localhost:3000
```

Register a user (a workspace is created automatically), create a project, then connect a BYOK
provider for Visibility audits or open Site Health to discover and analyze the site.

Full command reference: [`COMMANDS.md`](COMMANDS.md). Environment, entitlement, and migration
runbook: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

<a id="start-here"></a>
## Start here

| Document | What it covers |
|---|---|
| [`Agents.md`](Agents.md) | Mandatory implementation rules and the task-specific document map |
| [`docs/documentation-index.md`](docs/documentation-index.md) | Complete active documentation authority map |
| [`docs/architecture.md`](docs/architecture.md) | Canonical target product architecture |
| [`docs/invariants.md`](docs/invariants.md) | The review-blocking rules |
| [`docs/plans/growth-intelligence-platform.md`](docs/plans/growth-intelligence-platform.md) | Program architecture and delivery order |
| [`docs/plans/knowledge-kernel-and-industry-pack-spec.md`](docs/plans/knowledge-kernel-and-industry-pack-spec.md) | Knowledge contracts, persistence, and pack lifecycle |
| [`docs/plans/frontend-growth-intelligence.md`](docs/plans/frontend-growth-intelligence.md) | App, landing, and website migration plan |
| [`docs/design.md`](docs/design.md) | Design tokens, screen geometry, and the insight object |
| [`backend/app/core/config/industry_packs/README.md`](backend/app/core/config/industry_packs/README.md) | Canonical industry catalog, runtime library, maturity, evaluation, and extension policy |
| [`docs/plans/codex-site-intelligence-wiring-handoff.md`](docs/plans/codex-site-intelligence-wiring-handoff.md) | Next gated slice for production persistence and wiring |

Everything under [`docs/archive/`](docs/archive/) is historical and is **not** an implementation
authority.

<a id="repository-shape"></a>
## Repository shape

```text
frontend/                              Next.js application
backend/app/                           FastAPI modular monolith and workers
backend/app/core/config/industry_packs/
                                       canonical executable industry knowledge catalog
migrations/versions/0001_initial.py    pre-launch canonical database baseline
docs/plans/                            active target implementation plans
docs/evaluations/                      evaluation corpora, provenance, and labels
docs/archive/                          historical plans and superseded context
```

<a id="focused-validation"></a>
## Focused validation

```bash
# Repository root
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

<a id="contributing"></a>
## Contributing

Read [`Agents.md`](Agents.md) and the owning architecture document before changing code.
[`CONTRIBUTING.md`](CONTRIBUTING.md) covers workflow and ownership; [`Review.md`](Review.md) covers
the review checklist and recurring anti-patterns.

CiteLadder is a dirty, active, multi-workstream repository. Preserve unrelated user-owned changes
and verify focused slices rather than rewriting other workstreams.

<a id="license"></a>
## License

[MIT](LICENSE)
