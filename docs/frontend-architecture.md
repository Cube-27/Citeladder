# CiteLadder frontend architecture

> **Status:** current frontend authority
> **Framework:** Next.js App Router and TypeScript
> **Product hierarchy:** Site Intelligence, Content Intelligence, Demand Intelligence, Growth Agent

The frontend is a projection and workflow layer over workspace-scoped backend contracts. It owns
interaction, validation, accessibility, navigation, and local ephemeral state; it does not own
business truth, scoring, knowledge, authorization, or lifecycle decisions.

## Core rules

- The browser calls relative `/api/*`; Next.js rewrites to server-only `BACKEND_ORIGIN`.
- Server data uses TanStack Query; forms use typed inputs and Zod-backed validation.
- Responses are validated through the shared API-contract layer. Additive unknown response keys
  follow the existing tolerant policy; missing or invalid declared fields fail visibly.
- IDs are UUIDs and the active workspace/project context is always explicit.
- No production screen falls back to mock data or silently computes a backend metric.
- Only live navigation items render; future work is not represented by disabled placeholders.

## Target information architecture

### Site Intelligence

- Overview
- Pages and documents
- Knowledge
- Schema and machine clarity
- Journeys
- Evidence

Existing `/site-health`, `/issues`, page detail, and crawl history remain compatible while the
navigation and projections migrate.

### Content Intelligence

- Strategy
- Inventory
- Briefs
- Drafts
- Reviews
- Verification

The primary entry becomes an evidence-backed gap or strategy item. The current free-prompt
composer remains an advanced custom task rather than the default workflow. FAQ brief and generation
is the first complete path.

### Demand Intelligence

- Overview
- Search demand
- Journeys and configured outcomes
- Prompts and schedules
- AI Visibility
- Evidence and integration coverage

Existing `/traffic`, `/analytics`, `/prompt-research`, `/prompts`, `/visibility`, and `/runs` deep
links remain usable while their navigation is grouped under Demand Intelligence.

### Growth Agent

A project-level workspace plus contextual actions: explain, compare, build roadmap, create FAQ
brief, generate from approved brief, propose prompts, and recommend the next measurement. Every
result shows sources, unavailable inputs, artifacts created, and approvals still required.

## Current route ownership

| Route family | Current purpose | Target placement |
|---|---|---|
| `/projects`, `/knowledge-base` | Project state and curated profile | Project command centre and Business Knowledge |
| `/site-health`, `/issues` | Crawl, pages, rules, issues | Site Intelligence |
| `/content` | Basic generation | Content Intelligence |
| `/traffic`, `/analytics` | First-party projections | Demand Intelligence |
| `/prompt-research`, `/prompts` | Prompt creation/review | Demand Intelligence |
| `/visibility`, `/runs` | Answer-engine measurement/evidence | Demand Intelligence |
| `/products` | Catalog and product visibility | Commerce views backed by shared Site/Content/Demand contracts |
| `/providers`, `/settings` | Connections, billing, integrations | Shared project/workspace settings |

## Data and query ownership

Each domain has one API module, one query-key owner, and one set of shared schemas/types. Queries
are enabled only for the visible panel when possible. A shared artifact selected in one workspace
uses the same server ID and cache identity in contextual drawers and agent actions.

Polling remains the authoritative progress path for long-running tasks. SSE or streaming may
accelerate invalidation and presentation but never replaces persisted task state.

## Evidence and knowledge UX

- Every conclusion can open persisted evidence.
- Approved, proposed, observed, historical, conflicting, unknown, unavailable, and rejected states
  have distinct text labels and are not communicated by colour alone.
- Context drawers show included sources and important omissions.
- Memory approval cards state the exact typed item, evidence, scope, effective dates, and effect of
  approval.
- Industry role classification shows winning signals, alternatives, confidence, pack/version, and
  any user override.

## FAQ-first workflow

The first Content Intelligence flow is:

```text
page/journey gap
  -> required and observed questions
  -> select missing questions
  -> inspect verified facts and limitations
  -> create frozen FAQ brief
  -> generate draft
  -> show unsupported-claim/brief validation
  -> human edit and approve
  -> export or claim publication
  -> show later recrawl verification
```

Visible FAQ content and `FAQPage` JSON-LD are separate reviewable outputs. Markup cannot be approved
when it does not match visible questions and answers.

## Mobile and accessibility

Full workflows must remain possible on mobile. Tables become labelled records; filters and
evidence use accessible sheets; reorderable actions expose keyboard/touch controls. Tabs render
one panel at a time and mirror meaningful state to the URL. Focus, errors, loading, empty,
reduced-motion, forced-colour, and touch states are required.

## Design owner

[`design.md`](design.md) and `frontend/app/globals.css` own the shared light-only semantic system.
Components use existing primitives and semantic tokens. Product screens prioritize current state,
next actions, and evidence before secondary detail.

## Verification

Use focused Vitest/Testing Library tests, API contract drift checks, policy/design guards, TypeScript
checks, build, and targeted Playwright flows. A screen is not complete when it works only with
happy-path data; null, unavailable, conflict, partial coverage, authorization, retry, and mobile
states are part of the contract.
