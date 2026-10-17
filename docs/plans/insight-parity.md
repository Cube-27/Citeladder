# Insight parity: prompt tags, source retrieval and movers, editable Overview

Started 2026-10-16 from an owner review of the features Semrush, Ahrefs, Peec,
Profound and Searchable ship that CiteLadder lacks. The owner picked the items
below and dropped the rest (see [Not in scope](#not-in-scope)). Constraints:
[invariants](../invariants.md), the greenfield policy (baseline edits plus a
local reset; no data migrations; versions stay at 1) and no back-compat.

## Owner decisions (2026-10-16)

| ID | Decision |
|---|---|
| I1 | Prompts show branded/unbranded, intent and buyer stage as tags with filters. Persona moves to the backlog (it needs a new column). |
| I2 | Intent and buyer stage are set by generation or import and editable when editing a prompt; CSV import reads an optional buyer stage column. The branded flag stays as stored. |
| I3 | The existing Visibility prompt switch becomes the branding toggle, "Unbranded prompts" or "Branded prompts", remembered per project. It keeps reading the cohorts finalization already stores (core and comparison), so every existing run stays readable. |
| I12 | No schema change in any PR of this plan, and the smallest change that delivers each item. Anything needing a schema change or a breaking change goes to the backlog (owner, 2026-10-16). |
| I4 | Sources Domains and URLs gain a Retrieved column next to Cited and a "your pages read but not cited" filter. Engines that do not expose retrieval show not available, never zero. No Action rule. |
| I5 | Top movers rank domains and URLs by change in citation share (percentage points), current period against the previous comparable period, split into risers and fallers. |
| I6 | Overview becomes the customizable dashboard: one editable layout per project, no separate dashboard page and no saved views. Today's sections are the default widgets; Reset restores them. |
| I7 | The layout belongs to the project: Members and Admins edit it, Viewers see it. |
| I8 | Overview's PDF button exports the current layout. The fixed Executive PDF endpoint is deleted. |
| I9 | No share links for dashboards. |
| I10 | Every feature here is on all plans, including the trial ([B57](../billing-decisions.md#insight-parity-2026-10-16)). |
| I11 | Build order: tags, then sources, then Overview. |

## Owner decisions (2026-10-17)

| ID | Decision |
|---|---|
| I13 | I12 is lifted for this plan: PR 2 and PR 3 may change the schema, and the items I12 deferred join them: persona tags, the "All prompts" total, brand auto-filing, tags out of the panel hash, and Site Health Recrawl. Scheduled crawls stay in the backlog until their cadence and gating are decided. Source: owner, 2026-10-17, "u can proceed with implementation of PR 2 then PR 3 and u can also include the schema changes backlog which were deferred yesterday like persona, recrawl and change". |

## Not in scope

Dropped by the owner on 2026-10-16. Do not reopen without a new owner request:
- prompt demand or volume (it cannot be honest without Search Console);
- custom or user-authored Agent skills ("skills stay internal" in
  [decisions](../decisions.md) stands);
- Shopify storefront, product-feed URL and Merchant Center catalog import (the
  existing Commerce CSV import is enough);
- dashboard share links and multiple saved views.

## Current state (verified 2026-10-16)

- `prompts` already stores `intent`, `buyer_stage`, `prompt_intent` and
  `branded` (`migrations/0001_baseline.sql`). Persona is the generation plan's
  `audiences` facet (`src/prompts/generation-plan.ts`); a generated prompt
  keeps it only inside `generation_evidence.evidence_refs`.
- A schema change cannot ship without wiping production: the migrate job
  refuses a changed baseline until a deploy runs with `reset_database`
  ([GCP runbook](../operations/GCP_RUNBOOK.md)).
- Finalization stores Visibility metrics per cohort (organic `core`,
  `comparison`, `brand_diagnostic`); reads never recompute them.
- `src/answer-engines/parse.ts` extracts citations only (OpenAI `url_citation`
  annotations, Anthropic `web_search_result_location`). Raw provider payloads
  are retained, but OpenAI returns its consulted sources only when the request
  includes `web_search_call.action.sources`.
- Sources reads live in `src/visibility/sources.ts` and `source-series.ts`.
- Overview is `components/projects/dashboard-screen.tsx` and
  `dashboard-sections.tsx`, fed by `GET /projects/{id}/command-center`
  (`src/projects/command-center.ts`). The Executive PDF was
  `src/projects/executive-report.ts` (deleted in PR 3).

## PRs

### PR 1: prompt tags and the branding toggle

- A Tags column on the prompt table (branded, intent, buyer stage) and a buyer
  stage filter beside the existing intent and branded filters.
- Intent and buyer stage pickers in the edit dialog; `buyer_stage` on the
  prompt update and import bodies (additive); an optional CSV column.
- The Visibility cohort switch relabelled as the branding toggle and
  remembered per project on the device (I3). The API, public API and MCP
  already take the same `cohort` parameter, so no contract changes.

Shipped as #414. The items I12 moved out of it are in PR 2 under I13.

### PR 2: retrieved versus cited, top movers and the deferred prompt items

- Persona tag column (editable, filterable, CSV `persona`), brand auto-filing
  of manual and imported prompts, tags out of the panel hash, and the "All
  prompts" Visibility total (I13).

- Measurement requests that support it ask for consulted sources; the parser
  records retrieved URLs as their own evidence kind, distinct from citations.
  Check each surface (ChatGPT and Claude API, DataForSEO ChatGPT and Gemini
  scrapers, AI Overview) and mark the ones without retrieval as not available.
- Sources Retrieved column and near-miss filter (I4).
- Top movers read and panel (I5), comparable runs only, honouring the
  unbranded toggle.

Shipped as #419.

### PR 3: editable Overview

- A widget registry over existing persisted reads. Defaults reproduce today's
  sections; the library adds visibility, share of voice, top movers, retrieved
  versus cited, perception, AI Traffic and Search Console widgets.
- One persisted layout per project (I6, I7): add, remove, reorder, resize and
  reset, with an expected-revision check on save, in its own table (I13).
- PDF export of the current layout (I8); delete `executive-report.ts`, its
  route, client call and tests under the
  [replacement gate](../invariants.md#replacement-and-retirement).
- Widgets keep fixed footprints for loading, empty and error states.
- Site Health Recrawl (I13): rerun a crawl with its frozen origin, scope and
  settings so Changes always has a comparable baseline; plan grants and fetch
  budgets unchanged.

## Done when

- **PR 1:** every prompt shows its branding, intent and buyer stage, users can
  filter by them and correct intent and stage, and the Visibility branding
  toggle is remembered per project.
- **PR 2:** Sources separates retrieved from cited per engine, with
  not-available engines labelled, and top movers show risers and fallers by
  share change; prompts carry personas, brand-naming prompts file as branded,
  and Visibility offers All prompts.
- **PR 3:** Overview is editable, persists per project, resets to the old
  layout and exports to PDF; the Executive PDF endpoint is gone; a crawl can
  be rerun as a comparable recrawl.
