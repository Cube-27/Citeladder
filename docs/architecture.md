# CiteLadder — Growth Intelligence Architecture

**Status:** canonical target product architecture
**Runtime shape:** modular monolith; FastAPI API and workers; Next.js frontend; PostgreSQL state and queue
**Primary product hierarchy:** Site Intelligence, Content Intelligence, Demand Intelligence, Growth Agent
**First evaluation/customer pack:** K-12 Education using The Asian School corpus
**Second pack:** Commerce

## 1. Product vision

CiteLadder is the growth operating system for businesses that cannot afford to manage website
health, brand knowledge, content production, search demand, analytics, AI visibility, and growth
planning in disconnected tools.

It is designed for both:

- **legacy businesses**, whose knowledge is scattered across old websites, documents, teams, and
  marketing vendors; and
- **startups**, whose positioning, product knowledge, content, demand, and measurement change
  quickly and need a governed system of record.

The product answers four connected questions:

1. What does this business currently say and prove?
2. What is missing, weak, contradictory, stale, or difficult to discover?
3. What are customers demonstrably asking and doing?
4. What should the business improve, create, and measure next?

The durable differentiator is not a crawler, dashboard, content model, or chat interface by
itself. It is a project-specific, evidence-backed knowledge system that compounds through every
crawl, integration import, review, generation, audit, and verified outcome.

## 2. Product systems

### 2.1 Site Intelligence

Site Intelligence owns acquisition and understanding of the business's owned digital corpus:

- URL and document inventory;
- safe crawling, rendering escalation, and immutable artifacts;
- generic page kind and industry-specific role classification;
- content units, questions, entities, assertions, relationships, schema, and temporal state;
- discoverability, answerability, trust, machine clarity, and journey coverage;
- role-specific findings and grouped actions;
- reproducible snapshots, reports, exports, and recrawl verification.

It creates the knowledge foundation consumed by every other system.

### 2.2 Content Intelligence

Content Intelligence turns governed evidence into reviewable improvements:

- content inventory and portfolio strategy;
- missing-page, missing-section, unanswered-question, contradiction, trust, and demand gaps;
- deterministic briefs with verified facts, prohibited claims, sources, and success criteria;
- task-scoped context packages;
- provider-neutral generation and append-only attempts;
- validation, revision, approval, export, and publication claims;
- recrawl, demand, and visibility verification.

The first complete workflow is FAQ Intelligence because it proves the architecture with a narrow,
valuable, testable output before broad page generation.

### 2.3 Demand Intelligence

Demand Intelligence connects external and behavioral evidence to the owned knowledge system:

- Google Search Console query/page observations;
- Google Analytics landing, engagement, event, key-event, and commerce observations;
- configured business journeys and outcome definitions;
- query-to-page and event-to-journey coverage;
- demand signals and transparent priorities;
- provisional, evidence-prioritized, and user-approved prompt portfolios;
- existing multi-engine AI Visibility measurement;
- aligned-window comparisons after site or content changes.

Visibility remains measurement truth for answer-engine mentions, citations, rankings, and share of
voice. It does not own company truth and does not define the product hierarchy.

### 2.4 Growth Agent

The Growth Agent is the orchestration and explanation layer:

- explains persisted evidence, findings, signals, limitations, and changes;
- builds bounded plans and roadmaps;
- calls typed Site, Content, Demand, and Business Knowledge tools;
- assembles frozen selective context rather than dumping the knowledge base;
- creates reviewable strategies, briefs, drafts, prompts, and memory proposals;
- pauses at server-enforced approval boundaries;
- preserves model, context, tool, cost, and result provenance.

It is not a fourth intelligence database, unrestricted chat interface, or autonomous publisher.

## 3. Canonical improvement loop

```text
owned domain, documents, integrations, and approved business context
  -> immutable evidence
  -> page/document understanding and working knowledge
  -> industry-aware gaps and demand signals
  -> transparent opportunity bundles
  -> evidence-grounded brief or measurement action
  -> human-reviewed content, prompt, or configuration
  -> recrawl, resync, or visibility audit
  -> compatible before/after observation
  -> next action selected by the user with Growth Agent assistance
```

Every stage is inspectable and versioned. A later observation never rewrites earlier evidence.

## 4. Knowledge system

The complete knowledge base has three governed layers.

### Immutable evidence

Observed artifacts are persisted automatically for reproducibility:

- crawl attempts and page/document artifacts;
- integration imports and normalized metric rows;
- answer-engine responses, citations, and analyses;
- generation requests and attempts;
- user actions and approval events.

Persistence means “observed,” not “approved as true.”

### Working intelligence

Replaceable, versioned projections include:

- corpus disposition and page/document understanding;
- entities, assertions, relations, questions, topics, audiences, offerings, and journeys;
- contradictions, gaps, demand signals, opportunities, briefs, prompts, and task plans;
- confidence, coverage, effective dates, limitations, and analyzer versions.

### Approved project memory

Only explicit user save/approve actions create durable cross-task memory. Approved memory:

- is typed and project-scoped;
- references evidence or records a user-supplied origin;
- includes validity, reviewer, and supersession history;
- outranks inferred working knowledge in context selection;
- is never silently replaced by a crawl, import, chat, or model output.

Embeddings are optional disposable retrieval projections. They are never authorization filters or
the canonical truth store.

## 5. Core ontology and industry knowledge

The stable core models reusable concepts:

- corpus items and evidence;
- generic page kinds;
- entities, assertions, relations, questions, topics, audiences, offerings, and content units;
- journeys, stages, outcomes, demand signals, prompts, actions, briefs, context packages, and
  verification;
- temporal, confidence, coverage, contradiction, and approval state.

A versioned `IndustryPack` supplies industry-specific behavior:

- business page roles and deterministic classifier signals;
- expected entity, relation, and assertion types;
- journeys, outcomes, parent/customer questions, and content expectations;
- structured-data and visible-content parity expectations;
- trust, proof, safety, and regulated-claim policies;
- deterministic and model-assisted rules;
- report modules, FAQ/content briefs, prompts, and evaluation fixtures;
- optional future creative and scheduled-program archetypes.

The active analysis contract is:

```text
stable core + exactly one active industry pack + versioned project overrides
```

Customer facts never mutate a shared pack automatically. Generalized improvements require a
reviewed pack release with fixtures and compatibility notes.

## 6. Page understanding

Page analysis separates two concepts:

```text
page_kind      = generic structural job
industry_role  = active-pack business job
```

Examples:

```text
page_kind=conversion  industry_role=education.admissions_overview
page_kind=detail      industry_role=commerce.product_detail
page_kind=trust       industry_role=healthcare.clinician_profile
```

Classification is deterministic-first and can use:

- normalized URL/path;
- title, headings, body terminology, forms, calls to action, and layout/content units;
- internal-link and navigation context;
- media/document type and temporal signals;
- visible identifiers and facts;
- structured-data types and properties when present.

Structured data is both a signal and a gap surface. Its absence must not prevent role
classification. Once a role is known, the pack compares observed sections, questions, facts,
proof, journeys, links, and schema against the role contract.

## 7. FAQ Intelligence — first complete slice

The smallest useful proof of the platform is:

```text
classify role
  -> load required industry questions
  -> detect answered, weak, missing, conflicting, or unsupported questions
  -> build a frozen FAQ brief from current assertions and evidence
  -> generate bounded question/answer candidates
  -> validate claims, role coverage, duplication, and internal links
  -> review and approve visible content
  -> optionally generate matching FAQPage JSON-LD
  -> recrawl and verify the questions, answers, schema, and source gap
```

FAQ JSON-LD can never substitute for visible reviewed FAQs. Unknown fees, dates, prices, medical
claims, financial claims, availability, policies, or other scoped facts are requested or omitted,
not invented.

## 8. Demand, marketing, and measurement

The product progressively brings marketing strategy into the same knowledge system:

- organic demand and query-page fit;
- landing-page and configured outcome evidence;
- paid campaign/search-term evidence when a future connector is added;
- AI prompt portfolios and visibility audits;
- content/site action verification;
- business-priority and effort-aware roadmaps.

CiteLadder does not claim causality from aggregate correlations. It displays aligned windows,
sample size, source coverage, missing joins, and limitations. “Unavailable,” “not configured,” and
“observed zero” remain distinct.

## 9. Scheduled growth programs

Scheduling is a governed orchestration feature, not an unbounded agent loop. A future
`GrowthProgram` can define versioned, user-approved schedules such as:

- recurring site recrawls;
- GSC/GA4 and future marketing-source syncs;
- active prompt visibility audits;
- stale-content and contradiction reviews;
- monthly executive snapshots;
- post-publication verification windows.

Each schedule freezes task policy, resource scope, cost/concurrency limits, approval class, and
notification behavior. Scheduled runs call the same typed domain tools and create the same
immutable artifacts as manual runs.

## 10. Future Creative Intelligence

Creative generation is a later application of the same knowledge foundation, not a disconnected
image generator. A creative brief may select:

- approved identity, positioning, visual and tone guidance;
- offering, audience, journey, campaign objective, channel, and format;
- verified product/service facts and prohibited claims;
- relevant demand, content, and outcome evidence;
- source assets and rights/usage metadata.

Generated creative concepts and assets remain immutable attempts with review, approval, export,
and eventual performance observations. No creative is auto-published, and private project
knowledge is never used to train or populate another customer’s context.

## 11. Runtime architecture

CiteLadder remains a modular monolith:

- Next.js frontend;
- FastAPI API;
- separate worker processes;
- PostgreSQL as canonical product state and task queue;
- object storage only when bounded database artifacts are insufficient;
- provider-neutral model gateway;
- direct measurement adapters for answer engines;
- typed domain modules rather than autonomous microservices.

Core runtime rules:

- workspace authorization on every project-owned query;
- UUID identities;
- config-owned policy;
- immutable artifacts and append-only attempts;
- short transactions and commit before external I/O;
- idempotent queued mutations and leased single-writer workers;
- persisted projections on reads;
- coded errors and same-origin browser APIs;
- explicit approval for durable memory and external mutation.

## 12. Transition from the original product

CiteLadder was initially implemented around AI Visibility. That shipped capability is retained,
but the product is reorganized rather than rebuilt:

| Existing capability | Target owner |
|---|---|
| Site Health crawler, pages, issues, snapshots | Site Intelligence |
| Brand Profile / Knowledge Base | Approved project memory and Business Knowledge |
| Content v1 generation | Content Intelligence generation/attempt foundation |
| GSC/GA4, Traffic, Analytics | Demand Intelligence evidence and projections |
| Topics, prompts, audits, visibility | Demand Intelligence prompt and outcome loop |
| Opportunities | Shared evidence-backed action bundles |
| Agent/discovery clients | Provider gateway and bounded Growth Agent |
| Commerce catalog and product visibility | Commerce pack identity and demand evidence |

Implementation extends these owners and corrects lifecycle/provenance gaps. It does not create a
second crawler, queue, prompt system, content store, opportunity store, or memory silo.

## 13. Delivery sequence

1. Reconcile runtime lifecycle and shared contracts.
2. Implement corpus inventory, page-kind/industry-role split, and pack loading.
3. Pass The Asian School crawler and Education classification evals.
4. Ship FAQ Intelligence end to end with recrawl verification.
5. Normalize cross-page entities, assertions, contradictions, and approved memory as required.
6. Prove reuse with Commerce and additional draft industry packs.
7. Correct and enrich GSC/GA4 demand projections and journeys.
8. Connect prompt strategy and existing Visibility measurement.
9. Add bounded Growth Agent explanations, context packages, approvals, and typed actions.
10. Add scheduled growth programs; later extend the same briefs/context governance to creatives.

## 14. Success measures

CiteLadder reports separate coverage and outcome layers rather than one opaque score:

- **Evidence:** relevant-corpus, extraction, integration, join, and audit coverage.
- **Knowledge:** entity/assertion provenance, current-state confidence, contradiction resolution,
  and approved-memory reuse.
- **Site:** role/question/journey/schema/trust coverage and verified action resolution.
- **Content:** brief acceptance, unsupported-claim rate, review efficiency, publication
  observation, and later demand/visibility association.
- **Demand:** query-page fit, event coverage, signal precision, prompt acceptance, and priority
  stability.
- **Outcome:** configured qualified actions, organic and paid efficiency when evidence exists,
  owned citations, mentions, and share of voice.
- **Agent:** context precision, evidence citation, approval placement, tool success, bounded cost,
  and zero unauthorized memory or external mutation.

## 15. Documentation authority

The active documentation map is [`documentation-index.md`](documentation-index.md). The canonical
program plans live under `docs/plans/`. Current-runtime references describe shipped behavior.
Everything under `docs/archive/` is historical and must not guide implementation unless a task
explicitly reconciles old behavior.
